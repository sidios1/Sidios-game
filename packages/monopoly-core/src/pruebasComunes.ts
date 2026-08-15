// Helpers de test compartidos entre archivos: control exacto de dados vía un
// rng "de cola" (en vez de un seed mulberry32, cuya secuencia es opaca) y una
// partida base ya armada. NO es parte de la API de juego (no se reexporta
// desde index.ts) — hermano de apoyoPruebas.ts.

import { crearGeneradorSemilla, type GeneradorAleatorio } from "./aleatorio.js";
import { JUGADORES, exito, poolDePrueba } from "./apoyoPruebas.js";
import type { EstadoMonopoly } from "./estado.js";
import { crearPartida, type ConfigPartidaMonopoly } from "./partida.js";

/** Float en [0,1) que hace que `1 + Math.floor(rng() * 6)` dé exactamente `valor` (1..6). */
export function dado(valor: number): number {
  return (valor - 0.5) / 6;
}

/** rng "de cola": devuelve los valores dados en orden, cíclicamente. */
export function colaRng(valores: readonly number[]): GeneradorAleatorio {
  let i = 0;
  return () => {
    const v = valores[i % valores.length];
    i += 1;
    if (v === undefined) throw new Error("cola de rng vacía");
    return v;
  };
}

/** Partida de 3 jugadores (j1/j2/j3) lista para jugar, con el pool mock completo. */
export function partidaDePrueba(rondasTotales = 20): EstadoMonopoly {
  const config: ConfigPartidaMonopoly = { rondasTotales };
  return exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(12345), config));
}

/**
 * `partidaDePrueba()` YA reparte los 6 sobres iniciales gratuitos (§1.1) a
 * cada jugador — los tests que verifican el contenido EXACTO de Mi Club
 * (economía, renegociación, cartas de Prensa Deportiva) parten de acá para
 * no confundir esas 6 cartas de arranque con las que el propio test agrega.
 */
export function sinMiClub(estado: EstadoMonopoly): EstadoMonopoly {
  return { ...estado, jugadores: estado.jugadores.map((j) => ({ ...j, miClub: [] })) };
}
