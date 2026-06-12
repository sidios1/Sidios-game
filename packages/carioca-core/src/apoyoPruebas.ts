// Utilidades para armar mazos apilados deterministas en los tests.
// No contiene tests; es lógica pura auxiliar (sin imports de vitest).

import type { Carta, Pinta, ValorCarta } from "./carta.js";
import { crearMazoCompleto } from "./mazo.js";

export type EspecCarta = "comodin" | { readonly pinta: Pinta; readonly valor: ValorCarta };

/** Abreviatura para especificar una carta normal. */
export function n(pinta: Pinta, valor: ValorCarta): EspecCarta {
  return { pinta, valor };
}

export function coincide(carta: Carta, espec: EspecCarta): boolean {
  if (espec === "comodin") return carta.tipo === "comodin";
  return (
    carta.tipo === "normal" &&
    carta.pinta === espec.pinta &&
    carta.valor === espec.valor
  );
}

function extraer(pool: Carta[], espec: EspecCarta): Carta {
  const idx = pool.findIndex((carta) => coincide(carta, espec));
  if (idx === -1) {
    throw new Error(`carta agotada en el mazo de prueba: ${JSON.stringify(espec)}`);
  }
  const extraidas = pool.splice(idx, 1);
  const carta = extraidas[0];
  if (carta === undefined) {
    throw new Error("extracción imposible del mazo de prueba");
  }
  return carta;
}

export interface OpcionesMazoDeDos {
  /** 12 cartas para el jugador 0, o "relleno" para cartas cualesquiera. */
  readonly manoP0: readonly EspecCarta[] | "relleno";
  readonly manoP1: readonly EspecCarta[] | "relleno";
  /** Carta que abre el pozo. */
  readonly pozo: EspecCarta;
  /** Cartas que saldrán del mazo al robar, en orden. */
  readonly robos?: readonly EspecCarta[];
  readonly cartasPorJugador?: number;
}

/**
 * Arma un mazo completo de 108 cartas ordenado para una partida de 2
 * jugadores: primero se reparten las manos (P0 y luego P1, en bloque desde
 * la cima), después se abre el pozo y a continuación salen los robos.
 */
export function mazoParaDos(opciones: OpcionesMazoDeDos): Carta[] {
  const cartasPorJugador = opciones.cartasPorJugador ?? 12;
  const pool = crearMazoCompleto();
  const explicitaP0 =
    opciones.manoP0 === "relleno"
      ? null
      : opciones.manoP0.map((espec) => extraer(pool, espec));
  const explicitaP1 =
    opciones.manoP1 === "relleno"
      ? null
      : opciones.manoP1.map((espec) => extraer(pool, espec));
  const cartaPozo = extraer(pool, opciones.pozo);
  const robos = (opciones.robos ?? []).map((espec) => extraer(pool, espec));
  const manoP0 = explicitaP0 ?? pool.splice(0, cartasPorJugador);
  const manoP1 = explicitaP1 ?? pool.splice(0, cartasPorJugador);
  if (manoP0.length !== cartasPorJugador || manoP1.length !== cartasPorJugador) {
    throw new Error(`cada mano de prueba debe tener ${cartasPorJugador} cartas`);
  }
  // La cima del mazo es el último elemento: la primera carta en salir va al final.
  const salida = [...manoP0, ...manoP1, cartaPozo, ...robos];
  return [...pool, ...salida.reverse()];
}

/**
 * Ids de las cartas que calzan con las especificaciones dadas. CONSUME del
 * array recibido (lo muta), para que llamadas sucesivas sobre la misma mano
 * no elijan dos veces la misma carta.
 */
export function idsSegunEspecs(
  disponibles: Carta[],
  especs: readonly EspecCarta[],
): string[] {
  return especs.map((espec) => extraer(disponibles, espec).id);
}
