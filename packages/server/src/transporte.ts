// La costura entre el orquestador y la red. Estas interfaces son lo ÚNICO
// que el orquestador conoce del transporte: LAN (ws) es la primera
// implementación; el modo online (Fase 7) será otra, sin tocar el orquestador.
//
// Las firmas solo usan string y Promise: los datos viajan como JSON ya
// serializado, así el transporte no conoce el protocolo de ningún juego y una
// implementación browser (WebSocket nativo, Fase 3) encaja sin cambios.

export type IdConexion = string;

export interface OyentesServidor {
  readonly alConectar: (conexionId: IdConexion) => void;
  readonly alRecibir: (conexionId: IdConexion, datos: string) => void;
  readonly alDesconectar: (conexionId: IdConexion) => void;
}

export interface TransporteServidor {
  /**
   * Arranca el transporte y devuelve el código de sala que los clientes usan
   * para conectarse (en LAN: "ip:puerto" del host). Los oyentes se entregan
   * aquí para que ningún evento llegue antes de la suscripción.
   */
  iniciar(oyentes: OyentesServidor): Promise<string>;
  enviar(conexionId: IdConexion, datos: string): void;
  cerrarConexion(conexionId: IdConexion): void;
  detener(): Promise<void>;
}

export interface OyentesCliente {
  readonly alRecibir: (datos: string) => void;
  readonly alDesconectar: () => void;
}

export interface TransporteCliente {
  conectar(codigo: string, oyentes: OyentesCliente): Promise<void>;
  enviar(datos: string): void;
  desconectar(): Promise<void>;
}
