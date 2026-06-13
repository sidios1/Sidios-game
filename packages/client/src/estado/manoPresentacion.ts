// Orden de la mano del lado cliente: PURO. El orden de la mano no significa
// nada para el servidor (es presentación), pero el jugador puede reordenarla
// arrastrando cartas. Este orden se conserva entre vistas y se reconcilia con
// la mano real: sobreviven los ids que siguen en mano, en su posición elegida;
// los nuevos (robados) se agregan al final; los que ya no están se descartan.

import type { Carta } from "@juegos/carioca-core";

/** Orden estable de la mano: conserva las posiciones elegidas, agrega lo nuevo. */
export function reconciliarMano(
  orden: readonly string[],
  tuMano: readonly Carta[],
): string[] {
  const enMano = new Set(tuMano.map((c) => c.id));
  const conservados = orden.filter((id) => enMano.has(id));
  const yaPuestos = new Set(conservados);
  const nuevos = tuMano.map((c) => c.id).filter((id) => !yaPuestos.has(id));
  return [...conservados, ...nuevos];
}

/** Mueve una carta a otra posición del orden (clamp al rango válido). */
export function reordenar(
  orden: readonly string[],
  cartaId: string,
  indiceDestino: number,
): string[] {
  const desde = orden.indexOf(cartaId);
  if (desde < 0) return [...orden];
  const sinCarta = orden.filter((id) => id !== cartaId);
  const destino = Math.max(0, Math.min(indiceDestino, sinCarta.length));
  return [...sinCarta.slice(0, destino), cartaId, ...sinCarta.slice(destino)];
}
