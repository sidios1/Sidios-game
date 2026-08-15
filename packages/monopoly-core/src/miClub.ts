// "Mi Club": inventario único por jugador durante la fase de tablero, sin
// distinción titular/banca (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §1.1, §3). La
// fase de armado final (§7, fuera de alcance esta sesión) es lo único que
// separaría titulares de banca.

import type { GeneradorAleatorio } from "./aleatorio.js";
import type { JugadorPool, TecnicoPool } from "./fuenteSobres.js";
import type { NombreLiga } from "./tablero.js";

export type OrigenCartaJugador =
  | { readonly clase: "liga"; readonly liga: NombreLiga }
  | { readonly clase: "restoDelMundo" };

export interface CartaJugadorGanada {
  readonly tipo: "jugador";
  /** Id opaco de la carta en Mi Club (estable, distinto del id del JugadorPool). */
  readonly id: string;
  readonly origen: OrigenCartaJugador;
  readonly jugador: JugadorPool;
}

export interface CartaTecnicoGanado {
  readonly tipo: "tecnico";
  readonly id: string;
  readonly tecnico: TecnicoPool;
}

export type CartaMiClub = CartaJugadorGanada | CartaTecnicoGanado;

export function agregarCarta(
  inventario: readonly CartaMiClub[],
  carta: CartaMiClub,
): readonly CartaMiClub[] {
  return [...inventario, carta];
}

export function quitarCarta(
  inventario: readonly CartaMiClub[],
  cartaId: string,
): readonly CartaMiClub[] {
  return inventario.filter((c) => c.id !== cartaId);
}

export function buscarCarta(
  inventario: readonly CartaMiClub[],
  cartaId: string,
): CartaMiClub | undefined {
  return inventario.find((c) => c.id === cartaId);
}

/** `undefined` si el inventario está vacío; el llamador decide el no-op. */
export function elegirCartaAleatoria(
  inventario: readonly CartaMiClub[],
  rng: GeneradorAleatorio,
): CartaMiClub | undefined {
  if (inventario.length === 0) return undefined;
  const idx = Math.min(Math.floor(rng() * inventario.length), inventario.length - 1);
  return inventario[idx];
}
