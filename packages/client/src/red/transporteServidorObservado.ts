// Decorador OBSERVE-ONLY de TransporteServidor: envuelve el transporte del host
// online (TransporteOnlineServidor) y registra la conexión/desconexión de cada
// peer remoto en el visor de log del anfitrión, delegando TODO sin alterar el
// comportamiento de la red.
//
// SEGURIDAD: solo registra el id de conexión y el evento; nunca los cuerpos de
// los mensajes (alRecibir), que podrían contener tokens.

import type {
  IdConexion,
  OyentesServidor,
  TransporteServidor,
} from "@juegos/server/transporte";
import { registro } from "../registro/registro.js";

export class TransporteServidorObservado implements TransporteServidor {
  constructor(private readonly real: TransporteServidor) {}

  iniciar(oyentes: OyentesServidor): Promise<string> {
    const observados: OyentesServidor = {
      alConectar: (id) => {
        registro.info(`[host] peer conecta: ${id}`);
        oyentes.alConectar(id);
      },
      alRecibir: oyentes.alRecibir,
      alDesconectar: (id) => {
        registro.warn(`[host] peer desconecta: ${id}`);
        oyentes.alDesconectar(id);
      },
    };
    return this.real.iniciar(observados);
  }

  enviar(conexionId: IdConexion, datos: string): void {
    this.real.enviar(conexionId, datos);
  }

  cerrarConexion(conexionId: IdConexion): void {
    this.real.cerrarConexion(conexionId);
  }

  detener(): Promise<void> {
    return this.real.detener();
  }
}
