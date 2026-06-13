// Envoltura tipada del transporte + protocolo: el resto del cliente no
// serializa JSON ni conoce el formato de los mensajes, solo esta API.

import type {
  CodigoErrorServidor,
  JugadorEnSala,
  MensajeCliente,
  MensajeServidor,
} from "@juegos/server/protocolo";
import {
  analizarMensajeServidor,
  serializarCliente,
} from "@juegos/server/protocolo";
import type { TransporteCliente } from "@juegos/server/transporte";
import type { VistaPartida } from "@juegos/server/vista";

export interface OyentesConexion {
  readonly alBienvenida: (jugadorId: string, token: string) => void;
  readonly alEstadoSala: (jugadores: readonly JugadorEnSala[]) => void;
  readonly alVista: (vista: VistaPartida) => void;
  readonly alError: (codigo: CodigoErrorServidor, mensaje: string) => void;
  readonly alSalaCerrada: (motivo: string) => void;
  readonly alDesconectar: () => void;
}

export class Conexion {
  constructor(private readonly transporte: TransporteCliente) {}

  async conectar(codigo: string, oyentes: OyentesConexion): Promise<void> {
    await this.transporte.conectar(codigo, {
      alRecibir: (datos) => {
        const mensaje = analizarMensajeServidor(datos);
        if (mensaje !== null) despachar(mensaje, oyentes);
      },
      alDesconectar: () => oyentes.alDesconectar(),
    });
  }

  /** Une al jugador a la sala; con token reconecta a su asiento. */
  unirse(nombre: string, token?: string): void {
    this.enviarMensaje(
      token === undefined
        ? { tipo: "unirse", nombre }
        : { tipo: "unirse", nombre, token },
    );
  }

  enviarMensaje(mensaje: MensajeCliente): void {
    this.transporte.enviar(serializarCliente(mensaje));
  }

  desconectar(): Promise<void> {
    return this.transporte.desconectar();
  }
}

function despachar(mensaje: MensajeServidor, oyentes: OyentesConexion): void {
  switch (mensaje.tipo) {
    case "bienvenida":
      oyentes.alBienvenida(mensaje.jugadorId, mensaje.token);
      return;
    case "estadoSala":
      oyentes.alEstadoSala(mensaje.jugadores);
      return;
    case "vista":
      oyentes.alVista(mensaje.vista);
      return;
    case "error":
      oyentes.alError(mensaje.codigo, mensaje.mensaje);
      return;
    case "salaCerrada":
      oyentes.alSalaCerrada(mensaje.motivo);
      return;
  }
}
