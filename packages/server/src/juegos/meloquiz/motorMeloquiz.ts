// El MotorJuego de MeloQuiz: envuelve meloquiz-core y le da al orquestador
// genérico todo lo que necesita. NINGUNA regla vive aquí (crearPartida /
// marcarListo / votar / expirarFase son del core), análogo a motorMentiroso.ts.
//
// Es el primer motor DIRIGIDO POR RELOJ, y por eso ejercita la ruta nueva del
// orquestador. Sus particularidades frente a los juegos por turnos:
//  - `jugadorEnTurno` es SIEMPRE null: MeloQuiz es simultáneo, no hay turnos.
//    Por eso `expirarTurno`/`turnoTurbo` no se implementan y sí lo hacen
//    `faseTemporizada`/`expirarFase` (fases de SALA, sin jugadorId).
//  - `saltarTurno` es un no-op: no hay turno que saltar cuando un jugador se
//    ausenta; la fase vence igual para todos y él se queda sin punto.
//  - `esperandoContinuar` es false y `continuar` un no-op (SPIKE §6.3): las
//    rondas avanzan DENTRO de la expiración de la fase `puntaje`, no por
//    votación. Por eso tampoco se recicla `listoSiguienteMano` para el ack de
//    precarga: ese está cableado a `esperandoContinuar`.
//  - El core recibe el tiempo como PARÁMETRO y jamás llama Date.now(), pero
//    `MotorJuego.expirarFase(estado, rng)` no lo transporta. Se resuelve con el
//    seam LOCAL `opciones.ahora` (default Date.now), sin tocar el contrato
//    compartido; los tests lo inyectan.

import {
  crearPartida,
  expirarFase,
  faseTemporizada,
  marcarListo,
  terminada,
  votar,
} from "@juegos/meloquiz-core";
import type {
  DuracionesFase,
  EstadoMeloquiz,
  PoolPartida,
} from "@juegos/meloquiz-core";
import type { AccionJuego } from "../../protocolo.js";
import type { JugadorMotor, MotorJuego, Resultado } from "../../motor.js";
import type { MetaSala } from "../../vista.js";
import { construirVistaMeloquizSala } from "./vistaMeloquiz.js";

/** Acciones de MeloQuiz ya validadas en su forma; opacas fuera de este módulo. */
export type AccionMeloquiz =
  | { readonly tipo: "listoPrecarga" }
  /** Voto por JUGADOR (REGLAS §5, pivote): `votadoId` es un id de jugador. */
  | { readonly tipo: "votar"; readonly votadoId: string };

export interface OpcionesMotorMeloquiz {
  /** Rondas a jugar; por defecto, tantas como canciones tenga el pool. */
  readonly rondas?: number;
  /** Duraciones de fase a medida; por defecto las de REGLAS_MELOQUIZ §4. */
  readonly duraciones?: Partial<DuracionesFase>;
  /**
   * Reloj del host, inyectable para tests deterministas. El núcleo no consulta
   * la hora: la sella con lo que le pasemos aquí.
   */
  readonly ahora?: () => number;
}

/**
 * Modo entrenamiento (REGLAS §6): llega como config OPACA del lobby, igual que
 * la config §6 de Rumble. El orquestador no inspecciona su forma; la revalida el
 * motor. Cualquier cosa que no sea `true` es una partida normal.
 */
function leerEntrenamiento(config: unknown): boolean {
  if (typeof config !== "object" || config === null) return false;
  return (config as Record<string, unknown>)["entrenamiento"] === true;
}

/**
 * Crea el motor de MeloQuiz. El `pool` se fija al construirlo: lo arma la fuente
 * de catálogo (S2), no el orquestador.
 */
export function crearMotorMeloquiz(
  pool: PoolPartida,
  opciones: OpcionesMotorMeloquiz = {},
): MotorJuego<EstadoMeloquiz, AccionMeloquiz> {
  const ahora = opciones.ahora ?? Date.now;

  return {
    crear(jugadores: readonly JugadorMotor[], rng, config?: unknown): Resultado<EstadoMeloquiz> {
      const datos = jugadores.map((j) => ({ id: j.id, nombre: j.nombre }));
      return crearPartida(
        datos,
        pool,
        {
          // exactOptionalPropertyTypes: se omiten las claves sin valor.
          ...(opciones.rondas !== undefined ? { rondas: opciones.rondas } : {}),
          ...(opciones.duraciones !== undefined ? { duraciones: opciones.duraciones } : {}),
          entrenamiento: leerEntrenamiento(config),
        },
        rng,
        ahora(),
      );
    },

    parsearAccion(crudo: AccionJuego): AccionMeloquiz | null {
      switch (crudo.tipo) {
        // Ack de precarga (REGLAS §8): viaja por el sobre genérico de AccionJuego,
        // cero cambios de protocolo.
        case "listoPrecarga":
          return { tipo: "listoPrecarga" };
        case "votar": {
          const votadoId = crudo["votadoId"];
          if (typeof votadoId === "string" && votadoId.length > 0) {
            return { tipo: "votar", votadoId };
          }
          return null;
        }
        default:
          return null;
      }
    },

    aplicarAccion(
      estado: EstadoMeloquiz,
      jugadorId: string,
      accion: AccionMeloquiz,
    ): Resultado<EstadoMeloquiz> {
      switch (accion.tipo) {
        case "listoPrecarga":
          return marcarListo(estado, jugadorId, ahora());
        case "votar":
          return votar(estado, jugadorId, accion.votadoId, ahora());
      }
    },

    // MeloQuiz es simultáneo: no hay turnos que asignar ni que saltar.
    jugadorEnTurno(): string | null {
      return null;
    },

    saltarTurno(estado: EstadoMeloquiz): Resultado<EstadoMeloquiz> {
      return { ok: true, valor: estado };
    },

    // Fases de SALA: la ruta nueva del orquestador (sin jugadorEnTurno).
    faseTemporizada(estado: EstadoMeloquiz) {
      return faseTemporizada(estado);
    },

    expirarFase(estado: EstadoMeloquiz, rng): Resultado<EstadoMeloquiz> {
      return expirarFase(estado, ahora(), rng);
    },

    terminada(estado: EstadoMeloquiz): boolean {
      return terminada(estado);
    },

    // Las rondas avanzan dentro de la expiración de `puntaje`, no por votación.
    esperandoContinuar(): boolean {
      return false;
    },

    continuar(estado: EstadoMeloquiz): Resultado<EstadoMeloquiz> {
      return { ok: true, valor: estado };
    },

    construirVista(estado: EstadoMeloquiz, jugadorId: string, meta: MetaSala) {
      return construirVistaMeloquizSala(estado, jugadorId, meta);
    },
  };
}
