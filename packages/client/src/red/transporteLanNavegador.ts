// Adaptador LAN del lado cliente para el NAVEGADOR: implementa la interfaz
// TransporteCliente de la Fase 2 con el WebSocket nativo (el TransporteLanCliente
// del server usa la librería `ws` de Node y no corre aquí). Este es el ÚNICO
// módulo del cliente que conoce WebSocket: el resto habla con la interfaz.
//
// Latido (heartbeat): el WebSocket del navegador no expone ping/pong nativo, así
// que manda PING app-level y vigila el silencio (semántica en @juegos/server/latido).
// Si el canal queda "pegado", el vigía lo cierra y dispara alDesconectar, que el
// coordinador convierte en reconexión automática.
//
// Anti-throttling: al minimizar/perder foco, el webview frena los timers (el
// servidor embebido NO: corre como proceso aparte). Al volver al frente se sondea
// de inmediato (visibilitychange) para detectar a tiempo un canal caído y resync.

import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import type { ProgramarIntervalo, ProgramarTimeout } from "@juegos/server/latido";
import { frameLatido, Latido, PING } from "@juegos/server/latido";
import { EstimadorOffset, frameSincronia } from "@juegos/server/sincroniaReloj";
import type { SesionReloj } from "./relojHost.js";
import { RelojHost, relojHost } from "./relojHost.js";

/** Mínimo de `document` que necesitamos; inyectable para tests sin DOM real. */
export interface FuenteVisibilidad {
  readonly hidden: boolean;
  addEventListener(tipo: "visibilitychange", oyente: () => void): void;
  removeEventListener(tipo: "visibilitychange", oyente: () => void): void;
}

/** Mínimo del WebSocket que usamos; el WebSocket nativo lo cumple. Inyectable
 *  para tests deterministas del latido sin abrir un socket real. */
export interface SocketNavegador {
  readonly readyState: number;
  send(datos: string): void;
  close(): void;
  addEventListener(tipo: "message", oyente: (evento: { data: unknown }) => void): void;
  addEventListener(tipo: "open" | "error" | "close", oyente: () => void): void;
}

export interface OpcionesNavegador {
  readonly intervaloPingMs?: number;
  readonly timeoutSilencioMs?: number;
  readonly intervalo?: ProgramarIntervalo;
  readonly timeout?: ProgramarTimeout;
  /** Fuente de visibilidad; default: `document` global si existe. */
  readonly documento?: FuenteVisibilidad;
  /** Fábrica del socket; default: `new WebSocket(url)`. Inyectable en tests. */
  readonly crearSocket?: (url: string) => SocketNavegador;
  /** Reloj del host a alimentar; default: el singleton `relojHost`. */
  readonly reloj?: RelojHost;
}

function documentoPorDefecto(): FuenteVisibilidad | null {
  if (typeof document === "undefined") return null;
  return {
    get hidden() {
      return document.hidden;
    },
    addEventListener: (tipo, oyente) => document.addEventListener(tipo, oyente),
    removeEventListener: (tipo, oyente) => document.removeEventListener(tipo, oyente),
  };
}

export class TransporteLanNavegador implements TransporteCliente {
  private socket: SocketNavegador | null = null;
  private latido: Latido | null = null;
  private estimador: EstimadorOffset | null = null;
  private sesionReloj: SesionReloj | null = null;
  private readonly reloj: RelojHost;
  private readonly documento: FuenteVisibilidad | null;
  private oyenteVisibilidad: (() => void) | null = null;
  private readonly opciones: OpcionesNavegador;
  private readonly crearSocket: (url: string) => SocketNavegador;

  constructor(opciones: OpcionesNavegador = {}) {
    this.opciones = opciones;
    this.documento = opciones.documento ?? documentoPorDefecto();
    this.crearSocket = opciones.crearSocket ?? ((url) => new WebSocket(url));
    this.reloj = opciones.reloj ?? relojHost;
  }

  /** El código de sala es "ip:puerto", igual que en el adaptador del server. */
  conectar(codigo: string, oyentes: OyentesCliente): Promise<void> {
    return new Promise((resolver, rechazar) => {
      const separador = codigo.lastIndexOf(":");
      if (separador <= 0 || separador === codigo.length - 1) {
        rechazar(new Error(`código de sala inválido: ${codigo}`));
        return;
      }
      let socket: SocketNavegador;
      try {
        socket = this.crearSocket(`ws://${codigo}`);
      } catch (error) {
        rechazar(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.socket = socket;
      let abierto = false;
      socket.addEventListener("open", () => {
        abierto = true;
        this.iniciarLatido(socket);
        // La sincronía arranca ANTES de `unirse`: caliente desde el lobby, así
        // el offset ya está poblado cuando llega la primera precarga (SPIKE §2).
        this.iniciarSincronia(socket);
        resolver();
      });
      socket.addEventListener("message", (evento) => {
        if (typeof evento.data !== "string") return;
        this.latido?.registrarTrafico();
        const sinc = frameSincronia(evento.data);
        if (sinc !== null) {
          // Pong de sincronía: alimenta el estimador y se consume acá.
          if (sinc.tipo === "pong") this.estimador?.registrarPong(sinc);
          return;
        }
        if (frameLatido(evento.data) !== null) return; // PONG: no es del juego.
        oyentes.alRecibir(evento.data);
      });
      socket.addEventListener("error", () => {
        // Un error de socket abierto desemboca en "close"; forzamos el cierre
        // para que el camino de reconexión arranque sin esperar el timeout TCP.
        if (abierto && socket.readyState !== WebSocket.CLOSED) socket.close();
      });
      socket.addEventListener("close", () => {
        this.limpiarLatido();
        if (abierto) {
          oyentes.alDesconectar();
        } else {
          rechazar(new Error(`no se pudo conectar a ${codigo}`));
        }
      });
    });
  }

  private iniciarLatido(socket: SocketNavegador): void {
    const latido = new Latido({
      enviarPing: () => {
        if (socket.readyState === WebSocket.OPEN) socket.send(PING);
      },
      alMorir: () => {
        if (socket.readyState !== WebSocket.CLOSED) socket.close();
      },
      ...(this.opciones.intervaloPingMs !== undefined
        ? { intervaloPingMs: this.opciones.intervaloPingMs }
        : {}),
      ...(this.opciones.timeoutSilencioMs !== undefined
        ? { timeoutSilencioMs: this.opciones.timeoutSilencioMs }
        : {}),
      ...(this.opciones.intervalo !== undefined
        ? { intervalo: this.opciones.intervalo }
        : {}),
      ...(this.opciones.timeout !== undefined ? { timeout: this.opciones.timeout } : {}),
    });
    this.latido = latido;
    latido.iniciar();
    // Anti-throttling: al volver al frente, sondea ya y reinicia el vigía para
    // detectar a tiempo un canal caído mientras la ventana estuvo oculta.
    if (this.documento !== null) {
      const oyente = (): void => {
        if (this.documento?.hidden === false && socket.readyState === WebSocket.OPEN) {
          latido.pingAhora();
          latido.registrarTrafico();
          // Re-ráfaga de sincronía: en background la ventana del estimador pudo
          // envenenarse con muestras congeladas; se repuebla ya.
          this.estimador?.resincronizar();
        }
      };
      this.oyenteVisibilidad = oyente;
      this.documento.addEventListener("visibilitychange", oyente);
    }
  }

  private iniciarSincronia(socket: SocketNavegador): void {
    const sesion = this.reloj.nuevaSesion();
    this.sesionReloj = sesion;
    const estimador = new EstimadorOffset({
      enviarPing: (frame) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(frame);
      },
      // El offset publicado es del singleton; la sesión (con generación) evita
      // que un transporte viejo de un reintento solapado pise al vigente.
      alActualizar: (offsetMs) => sesion.actualizar(offsetMs),
      ...(this.opciones.intervalo !== undefined
        ? { intervalo: this.opciones.intervalo }
        : {}),
    });
    this.estimador = estimador;
    estimador.iniciar();
  }

  private limpiarLatido(): void {
    this.latido?.detener();
    this.latido = null;
    this.estimador?.detener();
    this.estimador = null;
    this.sesionReloj?.cerrar();
    this.sesionReloj = null;
    if (this.documento !== null && this.oyenteVisibilidad !== null) {
      this.documento.removeEventListener("visibilitychange", this.oyenteVisibilidad);
    }
    this.oyenteVisibilidad = null;
  }

  enviar(datos: string): void {
    this.socket?.send(datos);
  }

  desconectar(): Promise<void> {
    const socket = this.socket;
    this.limpiarLatido();
    if (socket === null || socket.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      socket.addEventListener("close", () => resolver());
      socket.close();
    });
  }
}
