// El MotorJuego de UNO: envuelve uno-core y le da al orquestador genérico todo lo
// que necesita sin que este conozca las reglas. NINGUNA regla vive aquí: se delega
// a uno-core (crearPartida/jugar/robar/pasar/resolverAcumulado). Espejo de
// motorMentiroso.ts.
//
// Detalles de la costura:
//  - uno-core toma el rng por parámetro en las transiciones que rebarajan (robar,
//    resolverAcumulado) y al crear. `MotorJuego.aplicarAccion` no recibe rng: el
//    motor CAPTURA el del último `crear`/`continuar` en una clausura y se lo inyecta
//    (igual que motorMentiroso.ts:50).
//  - `saltarTurno` (un ausente en su turno) COMPONE las primitivas de uno-core
//    (resolverAcumulado / robar+pasar); no calcula turno ni dirección.
//  - A diferencia de Mentiroso, NO hay envoltura de estado: `EstadoUno` ya guarda
//    los nombres y no tiene "revelado", así que el estado del motor ES el del core.
//  - UNO es una sola ronda (como Mentiroso): no pausa por votación, así
//    `esperandoContinuar` es siempre false y `continuar` solo recaptura el rng.

import {
  COLORES,
  construirVistaUno,
  crearPartida,
  crearPartidaConMazo,
  jugar,
  pasar,
  resolverAcumulado,
  robar,
} from "@juegos/uno-core";
import type { AccionUno, Carta, Color, EstadoUno } from "@juegos/uno-core";
import type { AccionJuego } from "../../protocolo.js";
import type {
  GeneradorAleatorio,
  JugadorMotor,
  MotorJuego,
  Resultado,
} from "../../motor.js";
import type { MetaSala } from "../../vista.js";

// La acción del juego se reusa tal cual de uno-core (unión discriminada ya bien
// formada). Se re-exporta para simetría con motorMentiroso.
export type { AccionUno } from "@juegos/uno-core";

/** Opciones del motor; el seam `mazo` da partidas deterministas en tests. */
export interface OpcionesMotorUno {
  /** Mazo ordenado (sin barajar) para crear partidas reproducibles en tests. */
  readonly mazo?: readonly Carta[];
}

function esColor(valor: unknown): valor is Color {
  return typeof valor === "string" && (COLORES as readonly string[]).includes(valor);
}

/** Crea el motor de UNO. */
export function crearMotorUno(
  opciones: OpcionesMotorUno = {},
): MotorJuego<EstadoUno, AccionUno> {
  // rng capturado del último crear/continuar; lo usan robar/resolverAcumulado
  // (que no lo reciben vía aplicarAccion).
  let rng: GeneradorAleatorio = Math.random;

  return {
    crear(jugadores: readonly JugadorMotor[], rngParam): Resultado<EstadoUno> {
      rng = rngParam;
      const datos = jugadores.map((j) => ({ id: j.id, nombre: j.nombre }));
      return opciones.mazo !== undefined
        ? crearPartidaConMazo(datos, opciones.mazo)
        : crearPartida(datos, rngParam);
    },

    parsearAccion(crudo: AccionJuego): AccionUno | null {
      switch (crudo.tipo) {
        case "jugar": {
          const cartaId = crudo["cartaId"];
          if (typeof cartaId !== "string" || cartaId.length === 0) return null;
          const color = crudo["color"];
          if (color === undefined) return { tipo: "jugar", cartaId };
          if (!esColor(color)) return null;
          return { tipo: "jugar", cartaId, color };
        }
        case "robar":
          return { tipo: "robar" };
        case "pasar":
          return { tipo: "pasar" };
        case "resolverAcumulado":
          return { tipo: "resolverAcumulado" };
        default:
          return null;
      }
    },

    aplicarAccion(
      estado: EstadoUno,
      jugadorId: string,
      accion: AccionUno,
    ): Resultado<EstadoUno> {
      switch (accion.tipo) {
        case "jugar":
          return jugar(estado, jugadorId, accion.cartaId, accion.color);
        case "robar":
          return robar(estado, jugadorId, rng);
        case "pasar":
          return pasar(estado, jugadorId);
        case "resolverAcumulado":
          return resolverAcumulado(estado, jugadorId, rng);
      }
    },

    jugadorEnTurno(estado: EstadoUno): string | null {
      return estado.fase === "terminada" ? null : (estado.jugadores[estado.turnoIdx]?.id ?? null);
    },

    saltarTurno(estado: EstadoUno, jugadorId: string): Resultado<EstadoUno> {
      // Ausente en su turno: política compuesta con primitivas de uno-core.
      // Con acumulador encima → robar el acumulado y perder el turno.
      if (estado.acumuladoPendiente > 0) {
        return resolverAcumulado(estado, jugadorId, rng);
      }
      // Sin acumulador → robar una carta. Si la robada era jugable el turno NO
      // avanzó (queda robadaPendiente): pasar para cederlo.
      const robado = robar(estado, jugadorId, rng);
      if (!robado.ok) return robado;
      if (robado.valor.robadaPendiente === null) return robado;
      return pasar(robado.valor, jugadorId);
    },

    terminada(estado: EstadoUno): boolean {
      return estado.fase === "terminada";
    },

    // UNO no pausa por votación: una sola ronda hasta el ganador.
    esperandoContinuar(): boolean {
      return false;
    },

    continuar(estado: EstadoUno, rngParam): Resultado<EstadoUno> {
      rng = rngParam;
      return { ok: true, valor: estado };
    },

    construirVista(estado: EstadoUno, jugadorId: string, _meta: MetaSala) {
      return construirVistaUno(estado, jugadorId);
    },
  };
}
