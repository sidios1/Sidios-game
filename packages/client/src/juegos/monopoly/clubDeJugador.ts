// El servidor no valida `clubToken` (stub sin implementar, ver estado.ts de
// monopoly-core) ni existe ninguna acción `elegirClub`: fuera de alcance esta
// sesión (candidata a S4b/S5, ver PLAN de la sesión). Mientras tanto, cada
// cliente asigna un logo de club por jugador con un hash determinístico de su
// `jugadorId`: mismo resultado en cualquier visor, sin necesidad de sincronía.

import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";

/** Club asignado a `jugadorId` dentro de `catalogo`; null si el catálogo está vacío. */
export function clubDeJugador(
  catalogo: readonly ClubPool[],
  jugadorId: string,
): ClubPool | null {
  if (catalogo.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < jugadorId.length; i++) {
    hash = (hash * 31 + jugadorId.charCodeAt(i)) >>> 0;
  }
  return catalogo[hash % catalogo.length] ?? null;
}
