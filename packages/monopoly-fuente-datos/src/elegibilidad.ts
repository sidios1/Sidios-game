// Filtro de elegibilidad por posición (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §3): un
// jugador solo entra al pool si su posición principal o alguna secundaria
// coincide con una de las 9 que usa la formación 4-3-3. `posicionesPosibles`
// del dataset NO preserva "primaria primero" (ej. Ronaldinho: `posicion:
// "LW"`, `posicionesPosibles: ["LM","CAM","LW"]`) — el orden de salida de
// `posicionesElegibles` lo da el orden fijo de `POSICIONES_FORMACION`, no el
// orden del array crudo.
//
// Decisión de esta sesión (resuelta con el usuario, ver plan): un jugador con
// varias posiciones elegibles entra al pool UNA VEZ POR CADA UNA (ver
// construirPoolSobres.ts), no solo bajo su primaria.

import type { PosicionJugador } from "@juegos/monopoly-core";

import type { JugadorCrudo } from "./tiposCrudos.js";

/** Las 9 posiciones de la formación 4-3-3 (§3, §7). */
export const POSICIONES_FORMACION: readonly PosicionJugador[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CM",
  "CAM",
  "RW",
  "ST",
  "LW",
];

/**
 * Posiciones elegibles de un jugador: intersección de `posicionesPosibles`
 * (que siempre incluye la primaria) con las 9 de la formación, en el orden
 * fijo de `POSICIONES_FORMACION` y sin duplicados. Puede ser `[]` (jugador
 * cuyas posiciones son todas CDM/LM/RM: no entra al pool).
 */
export function posicionesElegibles(jugador: JugadorCrudo): readonly PosicionJugador[] {
  const posibles = new Set(jugador.posicionesPosibles);
  return POSICIONES_FORMACION.filter((posicion) => posibles.has(posicion));
}
