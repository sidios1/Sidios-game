// Adaptador LAN de las interfaces de transporte.ts, con la librería ws.
// Este es el ÚNICO archivo del paquete que conoce la red (ws, node:os):
// el orquestador habla solo con las interfaces.
//
// Fuera de alcance por ahora (Fases 5/7): keepalive/ping para detectar
// conexiones zombis, y soporte de IPv6 literal en el código de sala.

import { networkInterfaces } from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import type {
  IdConexion,
  OyentesCliente,
  OyentesServidor,
  TransporteCliente,
  TransporteServidor,
} from "./transporte.js";

export interface OpcionesLan {
  /** 0 (default) = puerto efímero; la Fase 5 pasará uno fijo configurable. */
  readonly puerto?: number;
  /** IP que se anuncia en el código de sala; default: la IP local detectada. */
  readonly ipAnunciada?: string;
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
  private servidor: WebSocketServer | null = null;
  private contador = 0;
  private readonly conexiones = new Map<IdConexion, WebSocket>();

  constructor(opciones: OpcionesLan = {}) {
    this.puerto = opciones.puerto ?? 0;
    this.ipAnunciada = opciones.ipAnunciada ?? obtenerIpLocal();
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
        resolver(`${this.ipAnunciada}:${direccion.port}`);
      });
      servidor.on("connection", (socket) => {
        this.contador += 1;
        const conexionId = `lan-${this.contador}`;
        this.conexiones.set(conexionId, socket);
        socket.on("message", (datos) => {
          oyentes.alRecibir(conexionId, datos.toString());
        });
        socket.on("close", () => {
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
    for (const socket of this.conexiones.values()) {
      socket.close();
    }
    return new Promise((resolver) => {
      servidor.close(() => resolver());
    });
  }
}

export class TransporteLanCliente implements TransporteCliente {
  private socket: WebSocket | null = null;

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
        socket.on("message", (datos) => oyentes.alRecibir(datos.toString()));
        socket.on("close", () => oyentes.alDesconectar());
        resolver();
      });
    });
  }

  enviar(datos: string): void {
    this.socket?.send(datos);
  }

  desconectar(): Promise<void> {
    const socket = this.socket;
    if (socket === null || socket.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      socket.once("close", () => resolver());
      socket.close();
    });
  }
}
