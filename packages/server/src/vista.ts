// Vista por jugador: la proyección del EstadoPartida que cada cliente puede
// ver. Aquí vive la información oculta — las manos ajenas y el mazo NUNCA
// salen de esta función, solo sus conteos.

import type {
  Carta,
  CombinacionEnMesa,
  ContratoMano,
  EstadoPartida,
  FasePartida,
  Turno,
} from "@juegos/carioca-core";
import { contratoActual, ganadores, puntosMano } from "@juegos/carioca-core";

export interface JugadorVista {
  readonly id: string;
  readonly nombre: string;
  /** Id del avatar del perfil; ausente si el jugador no eligió uno. */
  readonly avatar?: string;
  /** Conteo: la mano ajena jamás viaja en la vista. */
  readonly numeroCartas: number;
  readonly puntosAcumulados: number;
  readonly seBajo: boolean;
  readonly conectado: boolean;
  readonly listoSiguienteMano: boolean;
}

export interface FilaResumen {
  readonly jugadorId: string;
  /** Puntos que sumó en la mano recién terminada (el ganador suma 0). */
  readonly puntosMano: number;
  readonly puntosAcumulados: number;
}

export interface ResumenMano {
  readonly ganadorManoId: string;
  readonly filas: readonly FilaResumen[];
  readonly votosListos: number;
  readonly votosNecesarios: number;
}

export interface VistaPartida {
  readonly tuJugadorId: string;
  readonly tuMano: readonly Carta[];
  /** En orden de asiento. */
  readonly jugadores: readonly JugadorVista[];
  readonly manoActual: number;
  readonly contrato: ContratoMano;
  readonly numeroMazo: number;
  readonly pozoTope: Carta | null;
  readonly numeroPozo: number;
  readonly mesa: readonly CombinacionEnMesa[];
  readonly turno: Turno;
  readonly fase: FasePartida;
  /** Presente en manoTerminada y partidaTerminada. */
  readonly resumenMano: ResumenMano | null;
  /** Presente en partidaTerminada. */
  readonly ganadoresIds: readonly string[] | null;
}

/** Lo que el orquestador sabe de la sala y el core no: conexiones y votos. */
export interface MetaSala {
  readonly conectados: ReadonlySet<string>;
  readonly listos: ReadonlySet<string>;
  readonly votosNecesarios: number;
  /** Avatar elegido por cada jugador (id del pool); presentación, no regla. */
  readonly avatares?: ReadonlyMap<string, string>;
}

export function construirVista(
  estado: EstadoPartida,
  jugadorId: string,
  meta: MetaSala,
): VistaPartida {
  const propio = estado.jugadores.find((j) => j.id === jugadorId);
  if (propio === undefined) {
    throw new Error(`no hay vista para un jugador fuera de la partida: ${jugadorId}`);
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    throw new Error(`la partida está en una mano desconocida: ${estado.manoActual}`);
  }
  const resumenMano =
    estado.fase === "jugandoMano" || estado.ganadorManoId === null
      ? null
      : {
          ganadorManoId: estado.ganadorManoId,
          filas: estado.jugadores.map((j) => ({
            jugadorId: j.id,
            puntosMano: puntosMano(j.mano),
            puntosAcumulados: j.puntosAcumulados,
          })),
          votosListos: meta.listos.size,
          votosNecesarios: meta.votosNecesarios,
        };
  return {
    tuJugadorId: jugadorId,
    tuMano: propio.mano,
    jugadores: estado.jugadores.map((j) => {
      const avatar = meta.avatares?.get(j.id);
      return {
        id: j.id,
        nombre: j.nombre,
        // exactOptionalPropertyTypes: omitimos avatar cuando no hay.
        ...(avatar !== undefined ? { avatar } : {}),
        numeroCartas: j.mano.length,
        puntosAcumulados: j.puntosAcumulados,
        seBajo: j.turnoEnQueSeBajo !== null,
        conectado: meta.conectados.has(j.id),
        listoSiguienteMano: meta.listos.has(j.id),
      };
    }),
    manoActual: estado.manoActual,
    contrato,
    numeroMazo: estado.mazo.length,
    pozoTope: estado.pozo[estado.pozo.length - 1] ?? null,
    numeroPozo: estado.pozo.length,
    mesa: estado.mesa,
    turno: estado.turno,
    fase: estado.fase,
    resumenMano,
    ganadoresIds:
      estado.fase === "partidaTerminada"
        ? ganadores(estado).map((j) => j.id)
        : null,
  };
}
