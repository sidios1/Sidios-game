// Tipos del estado y las acciones del modo Rumble (Sesión 2). El estado de Rumble
// ENVUELVE el de Carioca: `{ base, slice }`. Todo viaja en el único `estado` del
// orquestador, así que el slice de habilidades sobrevive a la reconexión por token
// (orquestador.ts) sin trabajo extra.

import type {
  Carta,
  ContratoMano,
  EstadoPartida,
  ObjetivoCarta,
  Pinta,
  ValorCarta,
} from "@juegos/carioca-core";
import type { ConfigRumble, EstadoCarga, HabilidadId } from "@juegos/rumble-core";
import type { AccionCarioca } from "./motorCarioca.js";

/** Ubicación aproximada de una carta (MISH, §3.1): sin posición exacta. */
export type Ubicacion =
  | { readonly donde: "mazo" }
  | { readonly donde: "pozo" }
  | { readonly donde: "mano"; readonly jugadorId: string }
  | { readonly donde: "ninguna" };

/** Revelación de MISH servida al solicitante. */
export interface RevelacionMish {
  readonly descripcion: string;
  readonly ubicacion: Ubicacion;
}

/** Evento de disrupción/anuncio para un jugador (transparencia §2.3/§4). */
export type TipoEventoRumble =
  | "asignacion"
  | "reset"
  | "swap"
  | "roboPozo"
  | "skip"
  | "compensacion"
  | "pilloFallo"
  | "pilloAcierto"
  | "guason"
  | "doble"
  /** Cierre de mano por condición sustituida (TOCO cumplida, EXODIA en ventana). */
  | "victoria";

export interface EventoRumble {
  readonly id: string;
  readonly tipo: TipoEventoRumble;
  readonly texto: string;
  /** turno.numero en el que ocurrió (para orden/dedup en el cliente). */
  readonly turno: number;
}

/** Interacción PILLO pendiente tras un fallo: el objetivo elige qué carta robar. */
export interface PilloPendiente {
  readonly victimaId: string; // el que usó PILLO y falló (le roban)
  readonly ladronId: string; // el objetivo del fallo (elige qué carta robar)
}

/** Slice de habilidades. Inmutable: cada transición devuelve una copia nueva. */
export interface SliceRumble {
  readonly config: ConfigRumble;
  readonly asignaciones: Readonly<Record<string, readonly HabilidadId[]>>;
  readonly cargas: Readonly<Record<string, Readonly<Record<string, EstadoCarga>>>>;
  readonly memoriaPrevia: Readonly<Record<string, readonly HabilidadId[]>>;
  /** §6.5 "fijas": asignación de la 1ª ronda, reusada en las siguientes. */
  readonly asignacionFija: Readonly<Record<string, readonly HabilidadId[]>> | null;
  readonly pesao: readonly string[];
  readonly doble: readonly string[];
  readonly misionToco: Readonly<Record<string, ContratoMano>>;
  readonly snapshotRadar: Readonly<Record<string, Readonly<Record<string, Pinta | null>>>>;
  readonly sapo: Readonly<Record<string, { readonly objetivoId: string; readonly cartas: readonly Carta[] }>>;
  readonly augurio: Readonly<Record<string, Carta | null>>;
  readonly mish: Readonly<Record<string, RevelacionMish>>;
  /** DECRETALO: sesgo de robo activo por jugador. */
  readonly decretalo: Readonly<Record<string, ObjetivoCarta>>;
  readonly saltarProximoTurno: readonly string[];
  readonly ojoArmado: readonly string[];
  /** EXTRA "descartar2": descartes de penalización pendientes por jugador. */
  readonly descartesPendientes: Readonly<Record<string, number>>;
  readonly eventos: Readonly<Record<string, readonly EventoRumble[]>>;
  readonly pilloPendiente: PilloPendiente | null;
  /** Contador monotónico para ids de evento únicos. */
  readonly contadorEventos: number;
}

/** Estado de Rumble: el de Carioca + el slice de habilidades. */
export interface EstadoRumble {
  readonly base: EstadoPartida;
  readonly slice: SliceRumble;
}

/** Acciones de habilidad (viajan por el sobre opaco AccionJuego; §2). */
export type AccionHabilidad =
  | { readonly tipo: "rumble/decretalo"; readonly objetivo: { readonly pinta: Pinta; readonly valor: ValorCarta } }
  | { readonly tipo: "rumble/mish"; readonly carta: { readonly pinta: Pinta; readonly valor: ValorCarta } }
  | { readonly tipo: "rumble/augurio" }
  | { readonly tipo: "rumble/sapo"; readonly objetivoId: string }
  | { readonly tipo: "rumble/judio"; readonly cartaId: string }
  | { readonly tipo: "rumble/guason"; readonly pinta: Pinta; readonly cartaSalienteId?: string }
  | { readonly tipo: "rumble/ginyu" }
  | { readonly tipo: "rumble/chato"; readonly objetivoId: string }
  | { readonly tipo: "rumble/mato"; readonly que: "mano" | "habilidad" }
  | { readonly tipo: "rumble/troll"; readonly objetivoId: string }
  | {
      readonly tipo: "rumble/pillo";
      readonly objetivoId: string;
      readonly carta: { readonly pinta: Pinta; readonly valor: ValorCarta };
      readonly cartaEntregadaId: string;
    }
  /**
   * Robo a ciegas tras un PILLO fallido. Va por ÍNDICE posicional (0..N-1) y no por
   * id de carta: los ids codifican la carta (`${pinta}-${valor}-${copia}`), así que
   * el servidor nunca puede enviarle al objetivo los ids de la mano ajena sin
   * filtrarla entera. El motor resuelve índice → carta del lado autoritativo.
   */
  | { readonly tipo: "rumble/pilloRobo"; readonly indice: number }
  | { readonly tipo: "rumble/extra" };

/** Acción de Rumble: o una acción base de Carioca, o una de habilidad. */
export type AccionRumble =
  | { readonly clase: "base"; readonly accion: AccionCarioca }
  | { readonly clase: "habilidad"; readonly accion: AccionHabilidad };
