// Detección de revelaciones nuevas entre dos vistas consecutivas (equivalente
// a estado/difVista.ts de Carioca, pero mucho más simple: Monopoly no tiene
// mano oculta, así que basta comparar `miClub` de cada jugador para saber qué
// carta apareció). También el origen de aparición para SincronizadorPoses.

import type { VistaMonopoly } from "@juegos/server/vistaJuego";
import type { OrigenAparicion } from "../../escena/sincronizadorPoses.js";
import type { ObjetivoMonopoly, RevelacionActiva } from "./disposicionMonopoly.js";
import { POSE_REVELACION } from "./disposicionMonopoly.js";

/** La primera carta que aparece en el `miClub` de CUALQUIER jugador entre `anterior` y `nueva`. */
function cartaMiClubNueva(anterior: VistaMonopoly, nueva: VistaMonopoly): RevelacionActiva | null {
  for (const jugador of nueva.jugadores) {
    const previo = anterior.jugadores.find((j) => j.id === jugador.id);
    const idsPrevios = new Set((previo?.miClub ?? []).map((c) => c.id));
    const carta = jugador.miClub.find((c) => !idsPrevios.has(c.id));
    if (carta !== undefined) return { tipo: "cartaMiClub", carta };
  }
  return null;
}

/**
 * Detecta la revelación a mostrar tras una nueva vista: prioriza una carta de
 * Mi Club (contenido conocido) sobre Prensa Deportiva (el mazo viaja solo
 * como conteo — orden oculto, ver vistaMonopoly.ts — así que no se sabe QUÉ
 * carta salió, solo que salió una).
 */
export function detectarNuevaRevelacion(
  anterior: VistaMonopoly | null,
  nueva: VistaMonopoly,
): RevelacionActiva | null {
  if (anterior === null) return null; // primera vista: sin animación de reparto
  const deMiClub = cartaMiClubNueva(anterior, nueva);
  if (deMiClub !== null) return deMiClub;
  if (nueva.numeroMazoPrensa < anterior.numeroMazoPrensa) return { tipo: "prensa" };
  return null;
}

/** Toda revelación aparece flotando desde un poco más abajo de su pose de reposo. */
export function crearOrigenMonopoly(): OrigenAparicion<ObjetivoMonopoly> {
  return () => ({ pose: { ...POSE_REVELACION, y: POSE_REVELACION.y - 0.6 }, retraso: 0 });
}
