// Señalización PLUGGABLE del transporte online. Abstrae al broker que pone en
// contacto a los peers (PeerJS por defecto) para poder self-hostearlo más
// adelante sin tocar los transportes. El resto del código online solo conoce
// estas interfaces, nunca el SDK concreto.
//
// Un CanalDatos representa UN canal de datos WebRTC ya abierto (una
// DataConnection de PeerJS o un doble de test): transporta strings, igual que
// el resto del stack de red. La señalización es quien abre esos canales: el
// HOST registra su código y recibe un CanalDatos por cada jugador que entra; el
// JUGADOR pide conectarse por código y recibe su CanalDatos al host.

/** Canal de datos bidireccional ya abierto. Transporta strings JSON. */
export interface CanalDatos {
  /** ¿Sigue abierto el canal? */
  readonly abierto: boolean;
  /** Envía un mensaje al otro extremo. */
  enviar(datos: string): void;
  /** Registra el manejador de mensajes entrantes (uno solo). */
  alMensaje(manejador: (datos: string) => void): void;
  /** Registra el manejador de cierre del canal (uno solo). */
  alCerrar(manejador: () => void): void;
  /** Cierra el canal desde este extremo. */
  cerrar(): void;
}

/** Oyentes que el HOST entrega a la señalización al registrarse. */
export interface OyentesHost {
  /** Un jugador nuevo abrió su canal contra el host. */
  readonly alNuevoCanal: (canal: CanalDatos) => void;
}

/**
 * Cliente de señalización. Una instancia sirve a UN rol a la vez: el host llama
 * `registrarHost`; el jugador llama `conectarAHost`. `cerrar` libera el broker
 * (p. ej. `peer.destroy()`).
 */
export interface ClienteSenalizacion {
  /**
   * Registra al host en el broker para empezar a aceptar jugadores. Prueba
   * códigos de `generarCodigo()` hasta encontrar uno libre (los códigos son el
   * identificador del host en el broker) y resuelve con el código asignado.
   */
  registrarHost(generarCodigo: () => string, oyentes: OyentesHost): Promise<string>;
  /** Conecta como jugador al host con ese código; resuelve con el canal abierto. */
  conectarAHost(codigo: string): Promise<CanalDatos>;
  /** Cierra la señalización y libera los recursos del broker. */
  cerrar(): void;
}
