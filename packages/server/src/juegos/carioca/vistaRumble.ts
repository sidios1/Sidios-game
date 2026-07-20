// Proyección de la vista de Rumble. Extiende la VistaPartida base con un slice
// `rumble` que llega SOLO al solicitante: sus habilidades, revelaciones recortadas
// (SAPO/RADAR/AUGURIO/MISH), misión TOCO, eventos de disrupción y el anuncio DOBLE.
//
// PESAO se resuelve por POST-PROCESO aquí (no en vista.ts, que queda genérico): a los
// no-dueños se les oculta el `pozoTope` (numeroPozo intacto → difVista no sintetiza
// robos/descartes fantasma en el cliente).

import type { Carta, ContratoMano, Pinta } from "@juegos/carioca-core";
import type { HabilidadId } from "@juegos/rumble-core";
import { habilidadPorId, ventanaVigente } from "@juegos/rumble-core";
import type { MetaSala, VistaPartida } from "../../vista.js";
import { construirVista } from "../../vista.js";
import type { EstadoRumble, EventoRumble, RevelacionMish } from "./estadoRumble.js";

export interface HabilidadVista {
  readonly id: HabilidadId;
  readonly nombre: string;
  readonly cargasRestantes: number | null;
  readonly ventanaVigente: boolean;
}

export interface VistaRumbleJugador {
  readonly misHabilidades: readonly HabilidadVista[];
  /** §6.8 "pública": habilidades ajenas visibles; ausente en "secreta". */
  readonly habilidadesAjenas?: Readonly<Record<string, readonly HabilidadId[]>>;
  /** Anuncio público (aun en modo "secreta"): ids con DOBLE esta ronda. */
  readonly doblePublico: readonly string[];
  readonly radar?: Readonly<Record<string, Pinta | null>>;
  readonly augurio?: Carta | null;
  readonly sapo?: { readonly objetivoId: string; readonly cartas: readonly Carta[] };
  readonly mish?: RevelacionMish;
  readonly misionToco?: ContratoMano;
  /**
   * Robo a ciegas pendiente tras un PILLO fallido. Revelación DIRIGIDA: solo viaja
   * al objetivo que debe elegir, nunca a los demás. Lleva el conteo de cartas (para
   * pintar N dorsos), jamás los ids: los ids codifican la carta y filtrarían la mano.
   */
  readonly pilloPendiente?: { readonly victimaId: string; readonly numeroCartas: number };
  readonly descartesPendientes?: number;
  readonly eventos: readonly EventoRumble[];
}

/**
 * La vista de Rumble: la de Carioca + el slice `rumble` del solicitante. Lleva su
 * propio discriminante `juego: "carioca-rumble"` (= game-id) para estrechar la
 * unión `VistaJuego` con seguridad; por eso `Omit` el `juego: "carioca"` de la base
 * (un `&` con literales distintos colapsaría a `never`).
 */
export type VistaRumble = Omit<VistaPartida, "juego"> & {
  readonly juego: "carioca-rumble";
  readonly rumble: VistaRumbleJugador;
};

export function construirVistaRumble(
  estado: EstadoRumble,
  jugadorId: string,
  meta: MetaSala,
): VistaRumble {
  const { base, slice } = estado;
  let vistaBase = construirVista(base, jugadorId, meta);

  // PESAO: si algún jugador tiene PESAO y el solicitante NO es dueño, se le oculta
  // el tope del pozo. numeroPozo NO cambia (difVista sigue infiriendo bien).
  const hayPesao = slice.pesao.length > 0;
  const soyDuenoPesao = slice.pesao.includes(jugadorId);
  if (hayPesao && !soyDuenoPesao) {
    vistaBase = { ...vistaBase, pozoTope: null };
  }

  const mias = slice.asignaciones[jugadorId] ?? [];
  const misHabilidades: HabilidadVista[] = mias.map((id) => {
    const h = habilidadPorId(id);
    const carga = slice.cargas[jugadorId]?.[id];
    return {
      id,
      nombre: h?.nombre ?? id,
      cargasRestantes: carga?.restantes ?? null,
      ventanaVigente: h === undefined ? true : ventanaVigente(h, base.turno.numero),
    };
  });

  const sapo = slice.sapo[jugadorId];
  const mish = slice.mish[jugadorId];

  // TOCO: la misión SUSTITUYE al contrato de la mano para su dueño (§3.3), así que
  // se proyecta también en `contrato` —no solo en el slice `misionToco`—. Sin esto
  // el panel de bajada del cliente ofrecería los tipos del contrato global y su
  // validación de cortesía nunca dejaría confirmar la misión: TOCO sería injugable.
  // La autoridad no cambia: el motor revalida contra esta misma misión.
  const misionToco = mias.includes("TOCO") ? slice.misionToco[jugadorId] : undefined;
  if (misionToco !== undefined) {
    vistaBase = { ...vistaBase, contrato: misionToco };
  }
  const radar = slice.snapshotRadar[jugadorId];
  const augurio = slice.augurio[jugadorId];
  const pendientes = slice.descartesPendientes[jugadorId] ?? 0;

  // PILLO fallido: solo el ladrón (el objetivo que ahora elige) ve el pendiente.
  const pend = slice.pilloPendiente;
  const pilloPendiente =
    pend !== null && pend.ladronId === jugadorId
      ? {
          victimaId: pend.victimaId,
          numeroCartas:
            base.jugadores.find((j) => j.id === pend.victimaId)?.mano.length ?? 0,
        }
      : undefined;

  const rumble: VistaRumbleJugador = {
    misHabilidades,
    doblePublico: slice.doble,
    eventos: slice.eventos[jugadorId] ?? [],
    ...(slice.config.visibilidad === "publica"
      ? { habilidadesAjenas: slice.asignaciones }
      : {}),
    ...(radar !== undefined ? { radar } : {}),
    ...(augurio !== undefined ? { augurio } : {}),
    ...(sapo !== undefined ? { sapo } : {}),
    ...(mish !== undefined ? { mish } : {}),
    ...(misionToco !== undefined ? { misionToco } : {}),
    ...(pilloPendiente !== undefined ? { pilloPendiente } : {}),
    ...(pendientes > 0 ? { descartesPendientes: pendientes } : {}),
  };

  return { ...vistaBase, juego: "carioca-rumble", rumble };
}
