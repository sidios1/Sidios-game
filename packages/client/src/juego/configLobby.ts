// Panel de CONFIGURACIÓN de partida en el lobby, genérico (el hub no conoce
// ningún juego concreto). Un juego que tenga opciones (hoy Rumble) provee su
// implementación vía `DefinicionJuego.crearConfigLobby`; el coordinador y
// PantallaConexion solo hablan con esta interfaz.
//
// La config viaja como blob OPACO (`Record<string, unknown>`) por el protocolo:
// el orquestador la guarda/redifunde sin conocer su forma y el motor la revalida
// (autoridad). Aquí el cliente la edita y valida por CORTESÍA.

export interface PanelConfigLobby {
  /** Valor opaco actual; viaja en `actualizarConfig` y en `iniciarPartida`. */
  valorActual(): Record<string, unknown>;
  /**
   * Fija un valor AUTORITATIVO recibido por `configSala` (la única fuente de
   * verdad es el orquestador). Debe tolerar blobs malformados sin romperse.
   */
  fijarValor(valor: Record<string, unknown>): void;
  /**
   * Cortesía de UI: motivo si la config es INFACTIBLE y no se debe poder iniciar
   * (p. ej. pool vacío, "únicas por ronda" imposible); `null` si es factible.
   * El host la revalida por autoridad al recibir `iniciarPartida`.
   */
  bloqueoInicio(numJugadores: number): string | null;
  /**
   * Construye el DOM del panel. Solo el anfitrión edita (`esAnfitrion`); el resto
   * lo ve en solo lectura. `numJugadores` alimenta la validación en vivo.
   */
  render(esAnfitrion: boolean, numJugadores: number): HTMLElement;
}
