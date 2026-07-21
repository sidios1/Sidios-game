// Adaptador LAN de las interfaces de transporte.ts, con la librería ws.
// Este es el ÚNICO archivo del paquete que conoce la red (ws, node:os):
// el orquestador habla solo con las interfaces.
//
// Latido (keepalive) para detectar conexiones zombis (muertas sin cerrar), que
// son la causa de la conexión "pegada" en LAN. La semántica vive en latido.ts;
// aquí se cablea a ws:
//  - Servidor: ping NATIVO de ws (el navegador auto-responde el pong) + un vigía
//    por conexión que la termina si deja de dar señales. Y responde PONG a los
//    pings app-level del cliente (el navegador no puede ver el pong nativo).
//  - Cliente: Latido app-level (manda PING, vigila el silencio) porque el
//    WebSocket nativo del navegador no expone ping/pong; el del server (este
//    archivo, Node) usa el mismo mecanismo por simetría.

import { networkInterfaces } from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import type {
  IdConexion,
  OyentesCliente,
  OyentesServidor,
  TransporteCliente,
  TransporteServidor,
} from "./transporte.js";
import type { ProgramarIntervalo, ProgramarTimeout } from "./latido.js";
import {
  frameLatido,
  intervaloReal,
  INTERVALO_SONDEO_MS,
  Latido,
  PING,
  PONG,
  TIMEOUT_SILENCIO_MS,
  timeoutReal,
  Watchdog,
} from "./latido.js";
import { frameSincronia, responderSincronia } from "./sincroniaReloj.js";

export interface OpcionesLan {
  /** 0 (default) = puerto efímero; la Fase 5 pasará uno fijo configurable. */
  readonly puerto?: number;
  /** IP que se anuncia en el código de sala; default: la IP local detectada. */
  readonly ipAnunciada?: string;
  /** Cada cuánto el servidor sondea con ping nativo (ms); inyectable en tests. */
  readonly sondeoMs?: number;
  /** Silencio que da por muerta una conexión (ms); inyectable en tests. */
  readonly timeoutSilencioMs?: number;
  /** Temporizadores inyectables para tests deterministas. */
  readonly intervalo?: ProgramarIntervalo;
  readonly timeout?: ProgramarTimeout;
}

/** Primera IPv4 no interna de la máquina; con eso se arma el código de sala. */
export function obtenerIpLocal(): string {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const interfaz of interfaces ?? []) {
      if (interfaz.family === "IPv4" && !interfaz.internal) {
        return interfaz.address;
      }
    }
  }
  return "127.0.0.1";
}

export class TransporteLanServidor implements TransporteServidor {
  private readonly puerto: number;
  private readonly ipAnunciada: string;
  private readonly sondeoMs: number;
  private readonly timeoutSilencioMs: number;
  private readonly intervalo: ProgramarIntervalo;
  private readonly timeout: ProgramarTimeout;
  private servidor: WebSocketServer | null = null;
  private contador = 0;
  private readonly conexiones = new Map<IdConexion, WebSocket>();
  /** Vigía de silencio por conexión: termina la zombi que deja de responder. */
  private readonly vigias = new Map<IdConexion, Watchdog>();
  private cancelarSondeo: (() => void) | null = null;

  constructor(opciones: OpcionesLan = {}) {
    this.puerto = opciones.puerto ?? 0;
    this.ipAnunciada = opciones.ipAnunciada ?? obtenerIpLocal();
    this.sondeoMs = opciones.sondeoMs ?? INTERVALO_SONDEO_MS;
    this.timeoutSilencioMs = opciones.timeoutSilencioMs ?? TIMEOUT_SILENCIO_MS;
    this.intervalo = opciones.intervalo ?? intervaloReal;
    this.timeout = opciones.timeout ?? timeoutReal;
  }

  iniciar(oyentes: OyentesServidor): Promise<string> {
    return new Promise((resolver, rechazar) => {
      const servidor = new WebSocketServer({ host: "0.0.0.0", port: this.puerto });
      this.servidor = servidor;
      servidor.on("error", rechazar);
      servidor.on("listening", () => {
        servidor.off("error", rechazar);
        const direccion = servidor.address();
        if (direccion === null || typeof direccion === "string") {
          rechazar(new Error("el servidor LAN no expone su puerto"));
          return;
        }
        // Sondeo periódico: ping nativo a cada socket. El cliente vivo (Node o
        // navegador) auto-responde el pong, que reinicia su vigía; el muerto no.
        this.cancelarSondeo = this.intervalo(this.sondeoMs, () => {
          for (const socket of this.conexiones.values()) {
            if (socket.readyState === WebSocket.OPEN) socket.ping();
          }
        });
        resolver(`${this.ipAnunciada}:${direccion.port}`);
      });
      servidor.on("connection", (socket) => {
        this.contador += 1;
        const conexionId = `lan-${this.contador}`;
        this.conexiones.set(conexionId, socket);
        const vigia = new Watchdog(
          this.timeoutSilencioMs,
          () => {
            // Sin señales: zombi. terminate() cierra el socket de inmediato y
            // dispara "close" → alDesconectar (ventana de gracia del orquestador).
            socket.terminate();
          },
          this.timeout,
        );
        this.vigias.set(conexionId, vigia);
        vigia.reiniciar();
        socket.on("pong", () => vigia.reiniciar());
        socket.on("message", (datos) => {
          vigia.reiniciar();
          const texto = datos.toString();
          // Sincronía de reloj primero: es el frame de control más frecuente.
          // El pong es un send DIRECTO — mide el RTT real, no al orquestador.
          const sinc = frameSincronia(texto);
          if (sinc !== null) {
            const pong = responderSincronia(sinc, Date.now());
            if (pong !== null && socket.readyState === WebSocket.OPEN) socket.send(pong);
            return; // frame de control: NO llega al orquestador.
          }
          if (frameLatido(texto) === "ping") {
            // El navegador no ve el pong nativo: se le responde a nivel app.
            if (socket.readyState === WebSocket.OPEN) socket.send(PONG);
            return; // frame de control: NO llega al orquestador.
          }
          oyentes.alRecibir(conexionId, texto);
        });
        socket.on("close", () => {
          this.vigias.get(conexionId)?.detener();
          this.vigias.delete(conexionId);
          if (this.conexiones.delete(conexionId)) {
            oyentes.alDesconectar(conexionId);
          }
        });
        oyentes.alConectar(conexionId);
      });
    });
  }

  enviar(conexionId: IdConexion, datos: string): void {
    this.conexiones.get(conexionId)?.send(datos);
  }

  cerrarConexion(conexionId: IdConexion): void {
    this.conexiones.get(conexionId)?.close();
  }

  detener(): Promise<void> {
    const servidor = this.servidor;
    if (servidor === null) return Promise.resolve();
    this.servidor = null;
    this.cancelarSondeo?.();
    this.cancelarSondeo = null;
    for (const vigia of this.vigias.values()) vigia.detener();
    this.vigias.clear();
    for (const socket of this.conexiones.values()) {
      socket.close();
    }
    return new Promise((resolver) => {
      servidor.close(() => resolver());
    });
  }
}

export interface OpcionesLanCliente {
  readonly intervaloPingMs?: number;
  readonly timeoutSilencioMs?: number;
  readonly intervalo?: ProgramarIntervalo;
  readonly timeout?: ProgramarTimeout;
}

export class TransporteLanCliente implements TransporteCliente {
  private socket: WebSocket | null = null;
  private latido: Latido | null = null;
  private readonly opciones: OpcionesLanCliente;

  constructor(opciones: OpcionesLanCliente = {}) {
    this.opciones = opciones;
  }

  /** El código de sala es "ip:puerto"; el último ":" separa el puerto. */
  conectar(codigo: string, oyentes: OyentesCliente): Promise<void> {
    return new Promise((resolver, rechazar) => {
      const separador = codigo.lastIndexOf(":");
      if (separador <= 0 || separador === codigo.length - 1) {
        rechazar(new Error(`código de sala inválido: ${codigo}`));
        return;
      }
      const socket = new WebSocket(`ws://${codigo}`);
      this.socket = socket;
      const alFallarConexion = (error: Error) => rechazar(error);
      socket.on("error", alFallarConexion);
      socket.on("open", () => {
        socket.off("error", alFallarConexion);
        socket.on("error", () => {
          // Tras conectar, un error de socket termina en "close": ahí se avisa.
        });
        const latido = new Latido({
          enviarPing: () => this.enviarPing(),
          alMorir: () => socket.close(),
          ...(this.opciones.intervaloPingMs !== undefined
            ? { intervaloPingMs: this.opciones.intervaloPingMs }
            : {}),
          ...(this.opciones.timeoutSilencioMs !== undefined
            ? { timeoutSilencioMs: this.opciones.timeoutSilencioMs }
            : {}),
          ...(this.opciones.intervalo !== undefined
            ? { intervalo: this.opciones.intervalo }
            : {}),
          ...(this.opciones.timeout !== undefined
            ? { timeout: this.opciones.timeout }
            : {}),
        });
        this.latido = latido;
        latido.iniciar();
        socket.on("message", (datos) => {
          latido.registrarTrafico();
          const texto = datos.toString();
          if (frameLatido(texto) !== null) return; // PONG: no es del juego.
          // Este cliente Node no sondea el reloj (no lo necesita), pero consume
          // igual cualquier frame de sincronía: son de control, jamás del juego.
          if (frameSincronia(texto) !== null) return;
          oyentes.alRecibir(texto);
        });
        socket.on("close", () => {
          latido.detener();
          this.latido = null;
          oyentes.alDesconectar();
        });
        resolver();
      });
    });
  }

  enviar(datos: string): void {
    this.socket?.send(datos);
  }

  private enviarPing(): void {
    const socket = this.socket;
    // PING app-level (igual que el navegador): el server responde PONG, que
    // reinicia el vigía. El pong NATIVO de ws no llega como "message".
    if (socket !== null && socket.readyState === WebSocket.OPEN) socket.send(PING);
  }

  desconectar(): Promise<void> {
    const socket = this.socket;
    this.latido?.detener();
    this.latido = null;
    if (socket === null || socket.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      socket.once("close", () => resolver());
      socket.close();
    });
  }
}
