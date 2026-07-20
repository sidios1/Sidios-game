// Descubridor greedy de tríos/escalas para TROLL (Rumble §3.2). Sobre una mano
// desordenada, encuentra un conjunto DISJUNTO de cartas que forman combinaciones
// reales y devuelve sus ids, para pasárselos a `resetearCartasDeMano` (costura S1).
//
// Vive en el SERVIDOR (no en rumble-core) porque consume FUNCIONES de carioca-core
// (validarEscala/validarTrio). Su carácter APROXIMADO (prioriza escalas sobre tríos;
// no usa comodines ni el puente del As) es una decisión de BALANCE, no de reglas:
// vive aquí, no en carioca-core.

import type { Carta, CartaNormal } from "@juegos/carioca-core";
import { PINTAS, validarEscala, validarTrio } from "@juegos/carioca-core";

const LONGITUD_MIN_ESCALA = 4;
const LONGITUD_MIN_TRIO = 3;

function esNormal(carta: Carta): carta is CartaNormal {
  return carta.tipo === "normal";
}

/**
 * Ids de las cartas que forman tríos/escalas en la mano (conjunto disjunto). Greedy:
 * primero descubre escalas (más valiosas/raras) por pinta, luego tríos con lo que
 * queda. Los comodines se dejan en la mano (aproximación de balance). Determinista:
 * no consume RNG, recorre en el orden fijo de PINTAS y de la mano.
 */
export function descubrirCombinacionesTroll(
  mano: readonly Carta[],
): readonly string[] {
  const usados = new Set<string>();
  const encontrados: string[] = [];

  // 1) Escalas: por pinta, runs consecutivos de ≥4 valores distintos.
  for (const pinta of PINTAS) {
    const porValor = new Map<number, CartaNormal>();
    for (const carta of mano) {
      if (usados.has(carta.id) || !esNormal(carta) || carta.pinta !== pinta) continue;
      if (!porValor.has(carta.valor)) porValor.set(carta.valor, carta);
    }
    const valores = [...porValor.keys()].sort((a, b) => a - b);
    let run: CartaNormal[] = [];
    const cerrarRun = (): void => {
      if (run.length >= LONGITUD_MIN_ESCALA && validarEscala(run, LONGITUD_MIN_ESCALA, 0).valida) {
        for (const carta of run) {
          usados.add(carta.id);
          encontrados.push(carta.id);
        }
      }
      run = [];
    };
    for (const valor of valores) {
      const carta = porValor.get(valor);
      if (carta === undefined) continue;
      const previo = run[run.length - 1];
      if (previo === undefined || valor === previo.valor + 1) {
        run.push(carta);
      } else {
        cerrarRun();
        run = [carta];
      }
    }
    cerrarRun();
  }

  // 2) Tríos: con las cartas normales que quedan, valores con ≥3 cartas.
  const porValor = new Map<number, CartaNormal[]>();
  for (const carta of mano) {
    if (usados.has(carta.id) || !esNormal(carta)) continue;
    const lista = porValor.get(carta.valor) ?? [];
    lista.push(carta);
    porValor.set(carta.valor, lista);
  }
  for (const cartas of porValor.values()) {
    if (cartas.length >= LONGITUD_MIN_TRIO && validarTrio(cartas, 0).valida) {
      for (const carta of cartas) {
        usados.add(carta.id);
        encontrados.push(carta.id);
      }
    }
  }

  return encontrados;
}
