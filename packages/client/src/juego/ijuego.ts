// Contrato común que TODOS los juegos del hub implementan. El hub habla solo
// con esta interfaz: no conoce Carioca ni ningún juego concreto. Así, agregar
// un juego nuevo (Fase 6) no obliga a tocar el hub ni la capa de red.
//
// El servidor sigue siendo la autoridad: el juego recibe el estado por
// sincronizarEstado y emite intenciones por contexto.enviar; jamás decide reglas.

import type { MensajeCliente } from "@juegos/server/protocolo";
import type { VistaJuego } from "@juegos/server/vistaJuego";

/** Recursos y canales que el hub entrega al juego al arrancarlo. */
export interface ContextoJuego {
  /** Contenedor para la escena/render del juego. */
  readonly contenedorEscena: HTMLElement;
  /** Contenedor para el HUD del juego (DOM superpuesto). */
  readonly contenedorHud: HTMLElement;
  /** El juego emite una intención; el hub la manda por la conexión. */
  readonly enviar: (mensaje: MensajeCliente) => void;
  /** El juego pide volver al menú del hub (p. ej. al terminar la partida). */
  readonly salirAlHub: () => void;
  /** Reinicia el intento de reconexión al anfitrión con el token guardado. */
  readonly reconectar: () => void;
}

/** Señal del servidor dirigida al juego que NO es estado completo. */
export type SenalJuego = { readonly tipo: "aviso"; readonly mensaje: string };

/**
 * Ciclo de vida de un juego dentro del hub:
 * iniciar → (sincronizarEstado | procesarAccion)* → finalizar.
 */
export interface IJuego {
  /** Monta escena y HUD sobre los contenedores y arranca su bucle. */
  iniciar(contexto: ContextoJuego): void;
  /**
   * Aplica un estado autoritativo recién llegado del servidor. El tipo del canal
   * es `VistaJuego` (la unión de todos los juegos); cada juego recibe la forma de
   * SU sala (por método bivariante, declara su propia vista sin discriminar).
   */
  sincronizarEstado(vista: VistaJuego): void;
  /** Procesa una señal del servidor que no es estado (p. ej. un aviso). */
  procesarAccion(senal: SenalJuego): void;
  /** Desmonta escena/HUD y libera todos sus recursos. */
  finalizar(): void;
}

/** Metadatos + fábrica que cada juego aporta al catálogo del hub. */
export interface DefinicionJuego {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  /** Mínimo de jugadores (lo muestra la sala de espera). */
  readonly minJugadores: number;
  /** Máximo de jugadores; omitido = sin tope (lo muestra la sala de espera). */
  readonly maxJugadores?: number;
  /** Crea una instancia nueva del juego, sin montar nada todavía. */
  crear(): IJuego;
}
