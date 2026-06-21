// Decorador OBSERVE-ONLY de TransporteCliente: envuelve el transporte real
// (LAN o WebRTC) y registra su ciclo de vida (conectar, apertura/cierre de canal)
// en el visor de log, delegando TODO sin alterar el comportamiento de la red.
//
// Cada reintento de reconexión del coordinador es una nueva llamada a conectar(),
// así que los reintentos aparecen solos sin tocar coordinador.ts.
//
// SEGURIDAD: nunca registra los cuerpos de los mensajes (alRecibir): los payloads
// llevan el token de sesión (p. ej. en "bienvenida"). Solo se loguea el ciclo de
// vida y el código de sala (LAN "ip:puerto" / código corto online, no secreto).

import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import { registro } from "../registro/registro.js";

export class TransporteObservado implements TransporteCliente {
  constructor(
    private readonly real: TransporteCliente,
    private readonly etiqueta: string,
  ) {}

  async conectar(codigo: string, oyentes: OyentesCliente): Promise<void> {
    registro.info(`[${this.etiqueta}] conectando a ${codigo}…`);
    const observados: OyentesCliente = {
      alRecibir: oyentes.alRecibir,
      alDesconectar: () => {
        registro.warn(`[${this.etiqueta}] canal cerrado`);
        oyentes.alDesconectar();
      },
    };
    try {
      await this.real.conectar(codigo, observados);
      registro.info(`[${this.etiqueta}] canal abierto`);
    } catch (error) {
      registro.error(
        `[${this.etiqueta}] fallo al conectar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  enviar(datos: string): void {
    this.real.enviar(datos);
  }

  async desconectar(): Promise<void> {
    await this.real.desconectar();
  }
}
