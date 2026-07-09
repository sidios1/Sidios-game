// Vista por jugador de UNO: proyección pura del estado que oculta las manos
// ajenas (solo conteos) y EXPONE lo que el HUD necesita (color activo, dirección,
// acumulador y la lista de acciones legales del jugador en turno) para no
// reimplementar reglas. El servidor revalida igual. Pura: sin datos de sala
// (conexión/anfitrión) — esos los añadirá el server al integrar UNO.

import type { Carta, Color } from "./carta.js";
import type { AccionUno, EstadoUno } from "./partida.js";
import { accionesLegales, jugadorEnTurno } from "./partida.js";

export interface JugadorVistaUno {
  readonly id: string;
  readonly nombre: string;
  /** Conteo de cartas; las cartas ajenas nunca viajan. */
  readonly numeroCartas: number;
}

export interface VistaUno {
  readonly juego: "uno";
  readonly tuJugadorId: string;
  /** Solo TU mano; las ajenas quedan ocultas. */
  readonly tuMano: readonly Carta[];
  readonly jugadores: readonly JugadorVistaUno[];
  readonly colorActivo: Color;
  readonly direccion: "horario" | "antihorario";
  readonly jugadorEnTurnoId: string | null;
  readonly descarteTope: Carta | null;
  /** Conteo del montón de robo (opaco). */
  readonly numeroMazo: number;
  readonly acumuladoPendiente: number;
  /** Acciones legales; no vacío solo si eres el jugador en turno. */
  readonly accionesLegales: readonly AccionUno[];
  readonly ganadorId: string | null;
}

export function construirVistaUno(estado: EstadoUno, jugadorId: string): VistaUno {
  const descarteTope = estado.descarte[estado.descarte.length - 1] ?? null;
  return {
    juego: "uno",
    tuJugadorId: jugadorId,
    tuMano: estado.manos[jugadorId] ?? [],
    jugadores: estado.jugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      numeroCartas: (estado.manos[j.id] ?? []).length,
    })),
    colorActivo: estado.colorActivo,
    direccion: estado.direccion === 1 ? "horario" : "antihorario",
    jugadorEnTurnoId: jugadorEnTurno(estado),
    descarteTope,
    numeroMazo: estado.mazo.length,
    acumuladoPendiente: estado.acumuladoPendiente,
    accionesLegales: accionesLegales(estado, jugadorId),
    ganadorId: estado.ganadorId,
  };
}
