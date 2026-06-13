// Diff entre dos vistas consecutivas del servidor. NO decide reglas: solo
// describe qué pasó (a partir de ids propios y de conteos ajenos) para que
// las animaciones sepan desde dónde aparece cada carta. Si un cambio no
// calza con ningún patrón conocido, se omite: el layout final siempre
// refleja la vista nueva, con o sin animación (la vista es la verdad).

import type { Carta } from "@juegos/carioca-core";
import type { VistaPartida } from "@juegos/server/vista";

export type CambioVista =
  | { readonly tipo: "repartoInicial" }
  | {
      readonly tipo: "roboPropio";
      readonly origen: "mazo" | "pozo";
      readonly carta: Carta;
    }
  | {
      readonly tipo: "roboAjeno";
      readonly jugadorId: string;
      readonly origen: "mazo" | "pozo";
    }
  | { readonly tipo: "descarte"; readonly jugadorId: string; readonly carta: Carta }
  | {
      readonly tipo: "bajada";
      readonly jugadorId: string;
      readonly mesaIdxNuevos: readonly number[];
    }
  | {
      readonly tipo: "pegada";
      readonly jugadorId: string;
      readonly mesaIdx: number;
      readonly cartaId: string;
    }
  | { readonly tipo: "reciclajeMazo" }
  | { readonly tipo: "finMano" }
  | { readonly tipo: "finPartida" };

export function difVista(
  anterior: VistaPartida | null,
  nueva: VistaPartida,
): readonly CambioVista[] {
  if (anterior === null || anterior.manoActual !== nueva.manoActual) {
    return [{ tipo: "repartoInicial" }];
  }
  const cambios: CambioVista[] = [];

  // Reciclaje: el pozo se invierte para reponer el mazo agotado.
  if (
    nueva.numeroMazo > anterior.numeroMazo &&
    nueva.numeroPozo < anterior.numeroPozo
  ) {
    cambios.push({ tipo: "reciclajeMazo" });
  }

  cambios.push(...cambiosDeRobo(anterior, nueva));
  cambios.push(...cambiosDeMesa(anterior, nueva));
  cambios.push(...cambiosDeDescarte(anterior, nueva));

  if (anterior.fase === "jugandoMano" && nueva.fase === "manoTerminada") {
    cambios.push({ tipo: "finMano" });
  }
  if (anterior.fase !== "partidaTerminada" && nueva.fase === "partidaTerminada") {
    cambios.push({ tipo: "finPartida" });
  }
  return cambios;
}

function cambiosDeRobo(
  anterior: VistaPartida,
  nueva: VistaPartida,
): readonly CambioVista[] {
  const origen = origenDeRobo(anterior, nueva);
  if (origen === null) return [];

  // ¿Robé yo? La carta nueva aparece en mi mano con un id que antes no estaba.
  const idsAntes = new Set(anterior.tuMano.map((c) => c.id));
  const agregadas = nueva.tuMano.filter((c) => !idsAntes.has(c.id));
  const agregada = agregadas[0];
  if (agregadas.length === 1 && agregada !== undefined) {
    return [{ tipo: "roboPropio", origen, carta: agregada }];
  }

  // Robo ajeno: a algún jugador le subió el conteo en exactamente una carta.
  for (const jugador of nueva.jugadores) {
    if (jugador.id === nueva.tuJugadorId) continue;
    const antes = anterior.jugadores.find((j) => j.id === jugador.id);
    if (antes !== undefined && jugador.numeroCartas === antes.numeroCartas + 1) {
      return [{ tipo: "roboAjeno", jugadorId: jugador.id, origen }];
    }
  }
  return [];
}

function origenDeRobo(
  anterior: VistaPartida,
  nueva: VistaPartida,
): "mazo" | "pozo" | null {
  if (
    nueva.numeroMazo === anterior.numeroMazo - 1 &&
    nueva.numeroPozo === anterior.numeroPozo
  ) {
    return "mazo";
  }
  if (
    nueva.numeroPozo === anterior.numeroPozo - 1 &&
    nueva.numeroMazo === anterior.numeroMazo
  ) {
    return "pozo";
  }
  return null;
}

function cambiosDeMesa(
  anterior: VistaPartida,
  nueva: VistaPartida,
): readonly CambioVista[] {
  const cambios: CambioVista[] = [];

  // Combinaciones nuevas al final de la mesa = alguien se bajó.
  if (nueva.mesa.length > anterior.mesa.length) {
    const porDueno = new Map<string, number[]>();
    for (let idx = anterior.mesa.length; idx < nueva.mesa.length; idx++) {
      const combinacion = nueva.mesa[idx];
      if (combinacion === undefined) continue;
      const lista = porDueno.get(combinacion.duenoId) ?? [];
      lista.push(idx);
      porDueno.set(combinacion.duenoId, lista);
    }
    for (const [jugadorId, mesaIdxNuevos] of porDueno) {
      cambios.push({ tipo: "bajada", jugadorId, mesaIdxNuevos });
    }
  }

  // Combinaciones existentes que crecieron = alguien pegó una carta.
  const limite = Math.min(anterior.mesa.length, nueva.mesa.length);
  for (let idx = 0; idx < limite; idx++) {
    const antes = anterior.mesa[idx];
    const ahora = nueva.mesa[idx];
    if (antes === undefined || ahora === undefined) continue;
    if (ahora.combinacion.cartas.length <= antes.combinacion.cartas.length) {
      continue;
    }
    const idsAntes = new Set(antes.combinacion.cartas.map((c) => c.id));
    for (const carta of ahora.combinacion.cartas) {
      if (idsAntes.has(carta.id)) continue;
      cambios.push({
        tipo: "pegada",
        jugadorId: quienJugo(anterior, nueva, carta.id),
        mesaIdx: idx,
        cartaId: carta.id,
      });
    }
  }
  return cambios;
}

/** La carta salió de mi mano → fui yo; si no, fue el jugador del turno previo. */
function quienJugo(
  anterior: VistaPartida,
  nueva: VistaPartida,
  cartaId: string,
): string {
  const eraMia = anterior.tuMano.some((c) => c.id === cartaId);
  const sigueMia = nueva.tuMano.some((c) => c.id === cartaId);
  if (eraMia && !sigueMia) return anterior.tuJugadorId;
  return anterior.turno.jugadorId;
}

function cambiosDeDescarte(
  anterior: VistaPartida,
  nueva: VistaPartida,
): readonly CambioVista[] {
  if (nueva.numeroPozo !== anterior.numeroPozo + 1 || nueva.pozoTope === null) {
    return [];
  }
  return [
    {
      tipo: "descarte",
      jugadorId: quienJugo(anterior, nueva, nueva.pozoTope.id),
      carta: nueva.pozoTope,
    },
  ];
}
