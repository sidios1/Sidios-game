// Coordinador del hub: orquesta el ciclo de vida completo
//   menú de juegos → conexión/sala LAN → juego → volver al menú.
// Conoce solo el catálogo, la interfaz IJuego, la Conexion y las pantallas;
// NUNCA importa un juego concreto. Por eso agregar un juego (vía catálogo) no
// obliga a tocar este archivo ni la capa de red.

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
import type { ContextoJuego, DefinicionJuego, IJuego } from "../juego/ijuego.js";
import { PantallaHub } from "./pantallaHub.js";

export interface OpcionesCoordinador {
  readonly contenedorEscena: HTMLElement;
  readonly contenedorHud: HTMLElement;
  readonly catalogo: readonly DefinicionJuego[];
  /** Fábrica de transporte; inyectable para tests. Por defecto, LAN/online. */
  readonly crearTransporte?: (modo: ModoConexion) => TransporteCliente;
  /** Almacén de sesión; inyectable para tests. Por defecto, sessionStorage. */
  readonly almacen?: Storage;
}

export class Coordinador {
  private readonly contenedorEscena: HTMLElement;
  private readonly contenedorHud: HTMLElement;
  private readonly crearTransporte: (modo: ModoConexion) => TransporteCliente;
  private readonly almacen: Storage;
  private readonly hub: PantallaHub;
  private readonly conexionUI: PantallaConexion;

  private juegoSeleccionado: DefinicionJuego | null = null;
  private conexion: Conexion | null = null;
  private juego: IJuego | null = null;
  private reintentando = false;

  constructor(opciones: OpcionesCoordinador) {
    this.contenedorEscena = opciones.contenedorEscena;
    this.contenedorHud = opciones.contenedorHud;
    this.crearTransporte = opciones.crearTransporte ?? crearTransportePorDefecto;
    this.almacen = opciones.almacen ?? sessionStorage;

    this.hub = new PantallaHub(this.contenedorHud, opciones.catalogo, {
      alElegir: (definicion) => this.elegirJuego(definicion),
    });
    this.conexionUI = new PantallaConexion(
      this.contenedorHud,
      {
        alConectar: (modo, codigo, nombre) => {
          void this.conectar(modo, codigo, nombre);
        },
        alCrearPartida: (nombre) => {
          void this.crearPartidaEmbebida(nombre);
        },
        alIniciarPartida: () => {
          this.conexion?.enviarMensaje({ tipo: "iniciarPartida" });
        },
        alVolver: () => this.volverAlHub(),
      },
      hayServidorEmbebido(),
    );
    this.conexionUI.ocultar();
  }

  /** Arranca en el menú de juegos. */
  iniciar(): void {
    this.hub.mostrar();
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
    this.conexionUI.ocultar();
    this.hub.mostrar();
  }

  /**
   * "Crear partida" en la app de escritorio: arranca el servidor LAN embebido y
   * se une a él con el código `ip:puerto` que anuncia (mismo código que comparten
   * los amigos para unirse desde la misma WiFi).
   */
  private async crearPartidaEmbebida(nombre: string): Promise<void> {
    let codigo: string;
    try {
      codigo = await iniciarServidorEmbebido();
    } catch (error) {
      this.conexionUI.mostrarError(
        error instanceof Error ? error.message : "no se pudo iniciar el servidor",
      );
      return;
    }
    await this.conectar("local", codigo, nombre);
  }

  async conectar(
    modo: ModoConexion,
    codigo: string,
    nombre: string,
    usarToken = true,
  ): Promise<void> {
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
          guardarSesion(this.almacen, codigo, { token, nombre });
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
            void this.conectar(modo, codigo, nombre, false);
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
            "Se perdió la conexión con el anfitrión. Vuelve a unirte para reconectar.",
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
      nueva.unirse(nombre);
    } else {
      nueva.unirse(sesion.nombre, sesion.token);
    }
  }

  private crearContexto(): ContextoJuego {
    return {
      contenedorEscena: this.contenedorEscena,
      contenedorHud: this.contenedorHud,
      enviar: (mensaje) => this.conexion?.enviarMensaje(mensaje),
      salirAlHub: () => this.volverAlHub(),
    };
  }
}
