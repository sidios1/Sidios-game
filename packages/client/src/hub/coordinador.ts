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
import { PantallaConexion } from "../hud/pantallaConexion.js";
import type { Perfil } from "../perfil/perfil.js";
import { almacenPerfilPorDefecto, guardarPerfil, leerPerfil } from "../perfil/perfil.js";
import { PantallaPerfil } from "../perfil/pantallaPerfil.js";
import type { ContextoJuego, DefinicionJuego, IJuego } from "../juego/ijuego.js";
import { PantallaHub } from "./pantallaHub.js";

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

  private perfil: Perfil | null;
  private volverDePerfil: () => void = () => this.hub.mostrar();
  private juegoSeleccionado: DefinicionJuego | null = null;
  private conexion: Conexion | null = null;
  private juego: IJuego | null = null;
  private reintentando = false;
  /** Modo y código de la sala actual; el botón "Reconectar" los reutiliza. */
  private modoActual: ModoConexion | null = null;
  private codigoActual: string | null = null;

  constructor(opciones: OpcionesCoordinador) {
    this.contenedorEscena = opciones.contenedorEscena;
    this.contenedorHud = opciones.contenedorHud;
    this.crearTransporte = opciones.crearTransporte ?? crearTransportePorDefecto;
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
        alIniciarPartida: () => {
          this.conexion?.enviarMensaje({ tipo: "iniciarPartida" });
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
    this.juegoSeleccionado = definicion;
    this.hub.ocultar();
    this.conexionUI.configurarJuego({
      nombre: definicion.nombre,
      minJugadores: definicion.minJugadores,
      // Omitido cuando el juego no tiene tope (exactOptionalPropertyTypes).
      ...(definicion.maxJugadores !== undefined
        ? { maxJugadores: definicion.maxJugadores }
        : {}),
    });
    this.conexionUI.mostrarPortada();
  }

  /** Termina el juego/conexión actuales y vuelve al menú. */
  volverAlHub(): void {
    this.juego?.finalizar();
    this.juego = null;
    void this.conexion?.desconectar();
    this.conexion = null;
    // Si éramos el host con servidor embebido, lo apagamos al cerrar la sala.
    void detenerServidorEmbebido();
    this.juegoSeleccionado = null;
    this.reintentando = false;
    this.modoActual = null;
    this.codigoActual = null;
    this.conexionUI.ocultar();
    this.hub.mostrar();
  }

  /**
   * Reinicia el intento de reconexión con el anfitrión: cierra el canal actual
   * (libera el asiento en el servidor) y vuelve a conectar con el token
   * guardado, que reattacha al mismo asiento y mano.
   */
  async reconectar(): Promise<void> {
    const modo = this.modoActual;
    const codigo = this.codigoActual;
    if (modo === null || codigo === null) return;
    // Tragamos el alDesconectar del canal viejo (igual que el reintento de
    // token) para no parpadear el overlay mientras reconectamos.
    this.reintentando = true;
    await this.conexion?.desconectar();
    this.conexion = null;
    await this.conectar(modo, codigo);
  }

  /**
   * "Crear partida" en la app de escritorio: arranca el servidor LAN embebido y
   * se une a él con el código `ip:puerto` que anuncia (mismo código que comparten
   * los amigos para unirse desde la misma WiFi).
   */
  private async crearPartidaEmbebida(): Promise<void> {
    let codigo: string;
    try {
      codigo = await iniciarServidorEmbebido();
    } catch (error) {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : "no se pudo iniciar el servidor",
      );
      return;
    }
    await this.conectar("local", codigo);
  }

  async conectar(
    modo: ModoConexion,
    codigo: string,
    usarToken = true,
  ): Promise<void> {
    const perfil = this.perfil;
    if (perfil === null) {
      this.abrirPerfil(() => this.conexionUI.mostrarPortada());
      return;
    }
    // Recordamos la sala para que "Reconectar" pueda reintentar con el token.
    this.modoActual = modo;
    this.codigoActual = codigo;
    let transporte: TransporteCliente;
    try {
      transporte = this.crearTransporte(modo);
    } catch (error) {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    const nueva = new Conexion(transporte);
    try {
      await nueva.conectar(codigo, {
        alBienvenida: (jugadorId, token) => {
          this.conexionUI.registrarJugadorId(jugadorId);
          guardarSesion(this.almacen, codigo, {
            token,
            nombre: perfil.nickname,
            avatar: perfil.avatarId,
          });
        },
        alEstadoSala: (jugadores) => {
          this.conexionUI.mostrarSala(jugadores, codigo);
        },
        alVista: (vista) => {
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
          if (codigoError === "tokenInvalido") {
            // El asiento ya no existe (p. ej. el servidor se reinició):
            // se reintenta una vez como jugador nuevo.
            borrarSesion(this.almacen, codigo);
            this.reintentando = true;
            void this.conectar(modo, codigo, false);
            return;
          }
          if (this.conexionUI.visible) {
            this.conexionUI.mostrarError(mensaje);
          } else {
            this.juego?.procesarAccion({ tipo: "aviso", mensaje });
          }
        },
        alSalaCerrada: (motivo) => {
          this.conexionUI.mostrarMensajeFinal(`La sala se cerró: ${motivo}`);
        },
        alDesconectar: () => {
          if (this.reintentando) {
            this.reintentando = false;
            return;
          }
          this.conexionUI.mostrarMensajeFinal(
            "Se perdió la conexión con el anfitrión.",
            () => {
              void this.reconectar();
            },
          );
        },
      });
    } catch (error) {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : "no se pudo conectar",
      );
      return;
    }
    this.conexion = nueva;
    const sesion = usarToken ? leerSesion(this.almacen, codigo) : null;
    if (sesion === null) {
      nueva.unirse(perfil.nickname, perfil.avatarId);
    } else {
      nueva.unirse(sesion.nombre, sesion.avatar ?? perfil.avatarId, sesion.token);
    }
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
