// Adaptador LAN del lado cliente para el NAVEGADOR: implementa la interfaz
// TransporteCliente de la Fase 2 con el WebSocket nativo (el TransporteLanCliente
// del server usa la librería `ws` de Node y no corre aquí). Este es el ÚNICO
// módulo del cliente que conoce WebSocket: el resto habla con la interfaz.

import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";

export class TransporteLanNavegador implements TransporteCliente {
  private socket: WebSocket | null = null;

  /** El código de sala es "ip:puerto", igual que en el adaptador del server. */
  conectar(codigo: string, oyentes: OyentesCliente): Promise<void> {
    return new Promise((resolver, rechazar) => {
      const separador = codigo.lastIndexOf(":");
      if (separador <= 0 || separador === codigo.length - 1) {
        rechazar(new Error(`código de sala inválido: ${codigo}`));
        return;
      }
      let socket: WebSocket;
      try {
        socket = new WebSocket(`ws://${codigo}`);
      } catch (error) {
        rechazar(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.socket = socket;
      let abierto = false;
      socket.addEventListener("open", () => {
        abierto = true;
        resolver();
      });
      socket.addEventListener("message", (evento) => {
        if (typeof evento.data === "string") {
          oyentes.alRecibir(evento.data);
        }
      });
      socket.addEventListener("close", () => {
        if (abierto) {
          oyentes.alDesconectar();
        } else {
          rechazar(new Error(`no se pudo conectar a ${codigo}`));
        }
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
      socket.addEventListener("close", () => resolver());
      socket.close();
    });
  }
}
