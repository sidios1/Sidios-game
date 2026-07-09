// Coordinador del hub: orquesta el ciclo de vida completo
//   perfil → menú de juegos → conexión/sala LAN → juego → volver al menú.
// Conoce solo el catálogo, la interfaz IJuego, la Conexion y las pantallas;
// NUNCA importa un juego concreto. Por eso agregar un juego (vía catálogo) no
// obliga a tocar este archivo ni la capa de red.
//
// El coordinador es el dueño del Perfil (nickname + avatar): lo carga al
// arrancar, abre el editor cuando falta o se pide, y lo inyecta en cada unión a
// una sala. El nickname/avatar del perfil son los que viajan a la partida.

import type { TransporteCliente } from "@juegos/server/transporte";
import { Conexion } from "../red/conexion.js";
import type { ModoConexion } from "../red/fabricaTransporte.js";
import { crearTransporte as crearTransportePorDefecto } from "../red/fabricaTransporte.js";
import { borrarSesion, guardarSesion, leerSesion } from "../red/sesion.js";
import {
  detenerServidorEmbebido,
  hayServidorEmbebido,
  iniciarServidorEmbebido,
} from "../red/servidorEmbebido.js";
import {
  clienteLocalHostOnline,
  detenerHostOnline,
  iniciarHostOnline,
} from "../red/hostOnline.js";
import { PantallaConexion } from "../hud/pantallaConexion.js";
import type { Perfil } from "../perfil/perfil.js";
import { almacenPerfilPorDefecto, guardarPerfil, leerPerfil } from "../perfil/perfil.js";
import { PantallaPerfil } from "../perfil/pantallaPerfil.js";
import type { ContextoJuego, DefinicionJuego, IJuego } from "../juego/ijuego.js";
import { PantallaHub } from "./pantallaHub.js";

/** Programa una espera y devuelve cómo cancelarla (inyectable para tests). */
export type ProgramarEspera = (ms: number, fn: () => void) => () => void;

const esperaReal: ProgramarEspera = (ms, fn) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Backoff de reconexión: primer reintento ~0.5s, se duplica hasta ~8s. */
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8_000;

export interface OpcionesCoordinador {
  readonly contenedorEscena: HTMLElement;
  readonly contenedorHud: HTMLElement;
  readonly catalogo: readonly DefinicionJuego[];
  /** Fábrica de transporte; inyectable para tests. Por defecto, LAN/online. */
  readonly crearTransporte?: (modo: ModoConexion) => TransporteCliente;
  /** Almacén de sesión (token por sala); inyectable. Por defecto, sessionStorage. */
  readonly almacen?: Storage;
  /** Almacén del perfil; inyectable. Por defecto, localStorage (persiste al reabrir). */
  readonly almacenPerfil?: Storage;
  /** Programa los reintentos de reconexión; inyectable para tests deterministas. */
  readonly programar?: ProgramarEspera;
}

export class Coordinador {
  private readonly contenedorEscena: HTMLElement;
  private readonly contenedorHud: HTMLElement;
  private readonly crearTransporte: (modo: ModoConexion) => TransporteCliente;
  private readonly almacen: Storage;
  private readonly almacenPerfil: Storage;
  private readonly hub: PantallaHub;
  private readonly conexionUI: PantallaConexion;
  private readonly perfilUI: PantallaPerfil;

  private readonly programar: ProgramarEspera;

  private perfil: Perfil | null;
  private volverDePerfil: () => void = () => this.hub.mostrar();
  private juegoSeleccionado: DefinicionJuego | null = null;
  private conexion: Conexion | null = null;
  private juego: IJuego | null = null;
  /** Modo y código de la sala actual; el botón "Reconectar" los reutiliza. */
  private modoActual: ModoConexion | null = null;
  private codigoActual: string | null = null;
  /**
   * Si somos el HOST online, fábrica del cliente loopback contra nuestro propio
   * orquestador (en-proceso). Se usa en cada (re)conexión en vez del adaptador
   * WebRTC: el host no se conecta a sí mismo por la red. null = no somos host.
   */
  private fabricaTransporteHost: (() => TransporteCliente) | null = null;
  /**
   * Generación del intento de conexión vigente. Cada nuevo intento la sube, así
   * los callbacks de un canal viejo (alDesconectar, alVista…) se descartan: la
   * reconexión es IDEMPOTENTE (varios intentos no duplican asientos ni estado).
   */
  private gen = 0;
  /** Reintentos fallidos consecutivos; alimenta el backoff y se reinicia al lograrlo. */
  private intentosFallidos = 0;
  /** Hay un reintento de reconexión ya agendado (evita encolar duplicados). */
  private reconexionPendiente = false;
  /** Cancela la espera de backoff pendiente (null si no hay). */
  private cancelarEspera: (() => void) | null = null;

  constructor(opciones: OpcionesCoordinador) {
    this.contenedorEscena = opciones.contenedorEscena;
    this.contenedorHud = opciones.contenedorHud;
    this.crearTransporte = opciones.crearTransporte ?? crearTransportePorDefecto;
    this.programar = opciones.programar ?? esperaReal;
    this.almacen = opciones.almacen ?? sessionStorage;
    this.almacenPerfil =
      opciones.almacenPerfil ?? almacenPerfilPorDefecto() ?? this.almacen;
    this.perfil = leerPerfil(this.almacenPerfil);

    this.hub = new PantallaHub(this.contenedorHud, opciones.catalogo, {
      alElegir: (definicion) => this.elegirJuego(definicion),
      perfil: () => this.perfil,
      alEditarPerfil: () => this.abrirPerfil(() => this.hub.mostrar()),
    });
    this.conexionUI = new PantallaConexion(
      this.contenedorHud,
      {
        alConectar: (modo, codigo) => {
          void this.conectar(modo, codigo);
        },
        alCrearPartida: () => {
          void this.crearPartidaEmbebida();
        },
        alCrearPartidaOnline: () => {
          void this.crearPartidaOnline();
        },
        alIniciarPartida: (turbo) => {
          this.conexion?.enviarMensaje({
            tipo: "iniciarPartida",
            ...(turbo ? { turbo: true } : {}),
          });
        },
        alVolver: () => this.volverAlHub(),
        perfil: () => this.perfil,
        alEditarPerfil: () => this.abrirPerfil(() => this.conexionUI.mostrarPortada()),
      },
      hayServidorEmbebido(),
    );
    this.perfilUI = new PantallaPerfil(this.contenedorHud, {
      alGuardar: (perfil) => this.guardarPerfilYVolver(perfil),
      alCancelar: () => {
        this.perfilUI.ocultar();
        this.volverDePerfil();
      },
    });
    this.conexionUI.ocultar();
    this.perfilUI.ocultar();
  }

  /** Arranca pidiendo perfil si falta; si no, en el menú de juegos. */
  iniciar(): void {
    if (this.perfil === null) {
      this.abrirPerfil(() => this.hub.mostrar());
    } else {
      this.hub.mostrar();
    }
  }

  /** Abre el editor de perfil; `volver` decide a dónde regresar al cerrarlo. */
  private abrirPerfil(volver: () => void): void {
    this.volverDePerfil = volver;
    this.hub.ocultar();
    this.conexionUI.ocultar();
    this.perfilUI.mostrar(this.perfil);
  }

  private guardarPerfilYVolver(perfil: Perfil): void {
    guardarPerfil(this.almacenPerfil, perfil);
    this.perfil = perfil;
    this.perfilUI.ocultar();
    this.volverDePerfil();
  }

  /** El usuario eligió un juego: pasa a la conexión/sala LAN. */
  elegirJuego(definicion: DefinicionJuego): void {
    // Candado defensivo: el hub ya no ofrece acción para los juegos en
    // desarrollo, pero por si acaso, nunca abrimos conexión para uno no jugable.
    if (definicion.estado !== "jugable") return;
    this.juegoSeleccionado = definicion;
    this.hub.ocultar();
    this.conexionUI.configurarJuego({
      nombre: definicion.nombre,
      minJugadores: definicion.jugadores.min,
      // Omitido cuando el juego no tiene tope (exactOptionalPropertyTypes).
      ...(definicion.jugadores.max !== null
        ? { maxJugadores: definicion.jugadores.max }
        : {}),
      // El modo +Turbo hoy solo existe para Carioca.
      soportaTurbo: definicion.id === "carioca",
    });
    this.conexionUI.mostrarPortada();
  }

  /** Termina el juego/conexión actuales y vuelve al menú. */
  volverAlHub(): void {
    this.detenerReconexion();
    this.juego?.finalizar();
    this.juego = null;
    void this.conexion?.desconectar();
    this.conexion = null;
    // Si éramos el host (LAN embebido u online), apagamos su servidor al cerrar.
    void detenerServidorEmbebido();
    void detenerHostOnline();
    this.fabricaTransporteHost = null;
    this.juegoSeleccionado = null;
    this.modoActual = null;
    this.codigoActual = null;
    this.conexionUI.ocultar();
    this.hub.mostrar();
  }

  /**
   * Botón "Reconectar" del jugador (RESPALDO de la reconexión automática):
   * fuerza un intento inmediato reiniciando el backoff. Comparte el mismo camino
   * que la automática; el orquestador reattacha por token al mismo asiento y mano.
   */
  async reconectar(): Promise<void> {
    const modo = this.modoActual;
    const codigo = this.codigoActual;
    if (modo === null || codigo === null) return;
    // Sube la generación: el alDesconectar del canal viejo se ignora (no agenda
    // otro reintento) y la reconexión sigue siendo idempotente.
    this.gen += 1;
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.reconexionPendiente = false;
    this.intentosFallidos = 0;
    const vieja = this.conexion;
    this.conexion = null;
    await vieja?.desconectar();
    await this.conectar(modo, codigo, true, true);
  }

  /** Corta cualquier intento o espera de reconexión en curso. */
  private detenerReconexion(): void {
    this.gen += 1;
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.reconexionPendiente = false;
    this.intentosFallidos = 0;
  }

  /**
   * "Crear partida" en la app de escritorio: arranca el servidor LAN embebido y
   * se une a él con el código `ip:puerto` que anuncia (mismo código que comparten
   * los amigos para unirse desde la misma WiFi).
   */
  private async crearPartidaEmbebida(): Promise<void> {
    let codigo: string;
    try {
      // El host arranca el sidecar con SU juego seleccionado (env JUEGO).
      codigo = await iniciarServidorEmbebido(this.juegoSeleccionado?.id ?? "carioca");
    } catch (error) {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : "no se pudo iniciar el servidor",
      );
      return;
    }
    await this.conectar("local", codigo);
  }

  /**
   * "Crear partida" en modo ONLINE: arranca el orquestador dentro del webview
   * (cliente-host) y se une a él por el cliente loopback. Devuelve un código
   * corto que los amigos usan para unirse desde cualquier red.
   */
  private async crearPartidaOnline(): Promise<void> {
    let codigo: string;
    try {
      codigo = await iniciarHostOnline(this.juegoSeleccionado?.id ?? "carioca");
    } catch (error) {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : "no se pudo crear la sala online",
      );
      return;
    }
    // El host (re)conecta siempre por loopback a su orquestador en-proceso.
    this.fabricaTransporteHost = () => clienteLocalHostOnline();
    await this.conectar("online", codigo);
  }

  async conectar(
    modo: ModoConexion,
    codigo: string,
    usarToken = true,
    esReintento = false,
  ): Promise<void> {
    const perfil = this.perfil;
    if (perfil === null) {
      this.abrirPerfil(() => this.conexionUI.mostrarPortada());
      return;
    }
    // Recordamos la sala para que "Reconectar" pueda reintentar con el token.
    this.modoActual = modo;
    this.codigoActual = codigo;
    // Nuevo intento: invalida los callbacks de cualquier canal anterior.
    this.cancelarEspera?.();
    this.cancelarEspera = null;
    this.reconexionPendiente = false;
    const miGen = (this.gen += 1);
    let transporte: TransporteCliente;
    try {
      // El host online usa su loopback en-proceso; el resto, el adaptador del modo.
      transporte =
        modo === "online" && this.fabricaTransporteHost !== null
          ? this.fabricaTransporteHost()
          : this.crearTransporte(modo);
    } catch (error) {
      this.fallarConexion(error, esReintento, modo, codigo, miGen);
      return;
    }
    const nueva = new Conexion(transporte);
    try {
      await nueva.conectar(codigo, {
        alBienvenida: (jugadorId, token) => {
          if (miGen !== this.gen) return;
          this.intentosFallidos = 0; // reconexión lograda
          this.conexionUI.registrarJugadorId(jugadorId);
          guardarSesion(this.almacen, codigo, {
            token,
            nombre: perfil.nickname,
            avatar: perfil.avatarId,
          });
        },
        alEstadoSala: (jugadores) => {
          if (miGen !== this.gen) return;
          this.conexionUI.mostrarSala(jugadores, codigo);
        },
        alVista: (vista) => {
          if (miGen !== this.gen) return;
          this.intentosFallidos = 0; // el snapshot llegó: canal sano
          this.conexionUI.ocultar();
          if (this.juego === null) {
            const definicion = this.juegoSeleccionado;
            if (definicion === null) return;
            this.juego = definicion.crear();
            this.juego.iniciar(this.crearContexto());
          }
          this.juego.sincronizarEstado(vista);
        },
        alError: (codigoError, mensaje) => {
          if (miGen !== this.gen) return;
          if (codigoError === "tokenInvalido") {
            // El asiento ya no existe (p. ej. el servidor se reinició):
            // se reintenta como jugador nuevo, dentro del mismo bucle.
            borrarSesion(this.almacen, codigo);
            void this.conectar(modo, codigo, false, true);
            return;
          }
          if (this.conexionUI.visible) {
            this.conexionUI.mostrarError(mensaje);
          } else {
            this.juego?.procesarAccion({ tipo: "aviso", mensaje });
          }
        },
        alSalaCerrada: (motivo) => {
          if (miGen !== this.gen) return;
          // Terminal: no se reintenta. Subir la generación neutraliza el
          // alDesconectar que llegará al cerrarse el socket.
          this.gen += 1;
          this.conexionUI.mostrarMensajeFinal(`La sala se cerró: ${motivo}`);
        },
        alDesconectar: () => {
          if (miGen !== this.gen) return;
          this.manejarDesconexion(modo, codigo);
        },
      });
    } catch (error) {
      this.fallarConexion(error, esReintento, modo, codigo, miGen);
      return;
    }
    if (miGen !== this.gen) {
      // Otro intento más nuevo arrancó mientras conectábamos: descarta este.
      void nueva.desconectar();
      return;
    }
    this.conexion = nueva;
    // El game-id viaja en `unirse` (selección local del hub). La sala ya corre
    // ese juego (el host lo pasó al sidecar al crearla).
    const juego = this.juegoSeleccionado?.id;
    const sesion = usarToken ? leerSesion(this.almacen, codigo) : null;
    if (sesion === null) {
      nueva.unirse(perfil.nickname, perfil.avatarId, undefined, juego);
    } else {
      nueva.unirse(sesion.nombre, sesion.avatar ?? perfil.avatarId, sesion.token, juego);
    }
  }

  /**
   * El canal se cayó: arranca (o continúa) la reconexión AUTOMÁTICA. Es el
   * mecanismo primario para TODOS los jugadores; el botón "Reconectar" solo es
   * respaldo. Avisa sin bloquear: en partida, por el HUD; en lobby, en la tarjeta.
   */
  private manejarDesconexion(modo: ModoConexion, codigo: string): void {
    this.conexion = null;
    if (this.juego !== null) {
      this.juego.procesarAccion({
        tipo: "aviso",
        mensaje: "Conexión perdida. Reconectando…",
      });
    } else if (this.conexionUI.visible) {
      this.conexionUI.mostrarReconectando();
    }
    this.programarReconexion(modo, codigo);
  }

  /** Falla de un intento: si era reintento, agenda el siguiente; si no, avisa. */
  private fallarConexion(
    error: unknown,
    esReintento: boolean,
    modo: ModoConexion,
    codigo: string,
    miGen: number,
  ): void {
    if (miGen !== this.gen) return;
    if (esReintento) {
      this.programarReconexion(modo, codigo);
    } else {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : "no se pudo conectar",
      );
    }
  }

  /** Agenda un reintento con backoff acotado + jitter (no encola duplicados). */
  private programarReconexion(modo: ModoConexion, codigo: string): void {
    if (this.reconexionPendiente) return;
    this.reconexionPendiente = true;
    const intento = this.intentosFallidos;
    this.intentosFallidos += 1;
    const tope = Math.min(BACKOFF_BASE_MS * 2 ** intento, BACKOFF_MAX_MS);
    const espera = tope / 2 + Math.random() * (tope / 2); // jitter en [tope/2, tope]
    this.cancelarEspera = this.programar(espera, () => {
      this.cancelarEspera = null;
      this.reconexionPendiente = false;
      void this.conectar(modo, codigo, true, true);
    });
  }

  private crearContexto(): ContextoJuego {
    return {
      contenedorEscena: this.contenedorEscena,
      contenedorHud: this.contenedorHud,
      enviar: (mensaje) => this.conexion?.enviarMensaje(mensaje),
      salirAlHub: () => this.volverAlHub(),
      reconectar: () => {
        void this.reconectar();
      },
    };
  }
}
