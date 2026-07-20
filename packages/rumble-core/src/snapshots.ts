// Snapshots de información pasiva (REGLAS_RUMBLE.md §3.1 RADAR, §7.4). Puro:
// se calcula del estado completo (que el host tiene) al inicio de ronda.

import type { Carta, Pinta } from "@juegos/carioca-core";
import { PINTAS } from "@juegos/carioca-core";

/** Pinta con más cartas normales de una mano; `null` si no tiene normales. */
function pintaMayoritaria(mano: readonly Carta[]): Pinta | null {
  const conteo = new Map<Pinta, number>();
  for (const carta of mano) {
    if (carta.tipo !== "normal") continue;
    conteo.set(carta.pinta, (conteo.get(carta.pinta) ?? 0) + 1);
  }
  let mejor: Pinta | null = null;
  let mejorConteo = 0;
  // Recorre en el orden fijo de PINTAS: el desempate es determinista.
  for (const pinta of PINTAS) {
    const c = conteo.get(pinta) ?? 0;
    if (c > mejorConteo) {
      mejorConteo = c;
      mejor = pinta;
    }
  }
  return mejorConteo > 0 ? mejor : null;
}

/**
 * RADAR — snapshot de la pinta mayoritaria por jugador (foto fija de inicio de
 * ronda, §3.1). No se actualiza en vivo; el motor la guarda y la sirve.
 */
export function snapshotPintaMayoritaria(
  manos: Readonly<Record<string, readonly Carta[]>>,
): Readonly<Record<string, Pinta | null>> {
  const resultado: Record<string, Pinta | null> = {};
  for (const [jugadorId, mano] of Object.entries(manos)) {
    resultado[jugadorId] = pintaMayoritaria(mano);
  }
  return resultado;
}
