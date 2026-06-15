// Puerto del motor de juego (lado servidor): la costura que vuelve GENÉRICO al
// orquestador. Un MotorJuego envuelve la lógica pura de UN juego (carioca-core,
// mentiroso-core, …) y le da al orquestador todo lo que necesita sin que este
// conozca las reglas: crear el estado inicial, aplicar la acción de un jugador,
// avanzar turnos y rondas, proyectar la vista por jugador y reportar el fin.
//
// El orquestador NUNCA inspecciona `E` (estado) ni `A` (acción): solo los pasa
// entre llamadas. Por eso este archivo no importa ningún core: declara tipos
// neutros (Resultado, GeneradorAleatorio) que ambos cores ya satisfacen de forma
// estructural. Análogo al `IJuego` del cliente, pero del lado autoritativo.

import type { AccionJuego } from "./protocolo.js";
import type { MetaSala } from "./vista.js";
import type { VistaJuego } from "./vistaJuego.js";

/** Aleatoriedad inyectada: una función que devuelve un número en [0, 1). */
export type GeneradorAleatorio = () => number;

/** Error de regla de un juego; `codigo` viaja tal cual al cliente. */
export interface ErrorMotor {
  readonly codigo: string;
  readonly mensaje: string;
}

/** Estilo reducer: éxito con el valor nuevo, o fallo con un error tipado. */
export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: ErrorMotor };

/** Datos mínimos de un jugador para sentarlo en una partida. */
export interface JugadorMotor {
  readonly id: string;
  readonly nombre: string;
}

/**
 * Puerto de un juego. `E` es su estado (opaco para el orquestador) y `A` su
 * acción ya validada en forma (también opaca). La transición de turnos y de
 * rondas vive AQUÍ, no en el orquestador.
 */
export interface MotorJuego<E, A> {
  /** Estado inicial dados los jugadores; el RNG inyecta el barajado. */
  crear(jugadores: readonly JugadorMotor[], rng: GeneradorAleatorio): Resultado<E>;
  /**
   * Valida SOLO la forma de una acción cruda del protocolo. Devuelve la acción
   * tipada del juego, o null si el tipo es desconocido o los campos no calzan
   * (el orquestador lo traduce a "mensajeInvalido").
   */
  parsearAccion(crudo: AccionJuego): A | null;
  /** Aplica la acción de un jugador: nuevo estado o error de regla. */
  aplicarAccion(estado: E, jugadorId: string, accion: A): Resultado<E>;
  /**
   * Jugador al que le toca actuar, o null si no hay turno activo (p. ej. ronda
   * terminada o partida terminada). El orquestador lo usa para saltar ausentes.
   */
  jugadorEnTurno(estado: E): string | null;
  /** Salta/pasa el turno del jugador indicado (un ausente o suspendido). */
  saltarTurno(estado: E, jugadorId: string): Resultado<E>;
  /** ¿La partida terminó del todo? */
  terminada(estado: E): boolean;
  /** ¿El juego está pausado esperando que los jugadores voten continuar? */
  esperandoContinuar(estado: E): boolean;
  /** Avanza a la siguiente ronda/mano tras la votación. */
  continuar(estado: E, rng: GeneradorAleatorio): Resultado<E>;
  /**
   * Proyección por jugador (información oculta). Devuelve una `VistaJuego`: la
   * unión de las formas de vista de cada juego (ver vistaJuego.ts). Cada motor
   * devuelve la suya (Carioca → VistaPartida, Mentiroso → VistaMentiroso).
   */
  construirVista(estado: E, jugadorId: string, meta: MetaSala): VistaJuego;
}
