// Motor de Carioca del lado servidor: implementa el puerto MotorJuego envolviendo
// la lógica pura de carioca-core. Es el ÚNICO archivo del servidor que importa
// @juegos/carioca-core (las reglas viven SOLO en el core; aquí solo se traducen
// intenciones del protocolo a llamadas del core y se proyecta la vista).
//
// Aquí vive lo que antes estaba repartido entre orquestador.ts (el switch de
// acciones) y protocolo.ts (la validación de FORMA de cada acción de Carioca).

import type {
  Carta,
  EstadoPartida,
  ExtremoEscala,
  PropuestaCombinacion,
  TipoCombinacion,
} from "@juegos/carioca-core";
import {
  bajarse,
  crearPartida,
  crearPartidaConMazo,
  descartar,
  esComodin,
  iniciarSiguienteMano,
  iniciarSiguienteManoConMazo,
  pasarTurno,
  pegar,
  robarDelMazo,
  robarDelPozo,
} from "@juegos/carioca-core";
import type { AccionJuego } from "../../protocolo.js";
import type {
  GeneradorAleatorio,
  JugadorMotor,
  MotorJuego,
  Resultado,
} from "../../motor.js";
import type { MetaSala, VistaPartida } from "../../vista.js";
import { construirVista } from "../../vista.js";

/** Acciones de Carioca ya validadas en su forma; opacas fuera de este módulo. */
export type AccionCarioca =
  | { readonly tipo: "robarDelMazo" }
  | { readonly tipo: "robarDelPozo" }
  | { readonly tipo: "bajarse"; readonly propuesta: readonly PropuestaCombinacion[] }
  | {
      readonly tipo: "pegar";
      readonly cartaId: string;
      readonly mesaIdx: number;
      readonly extremo?: ExtremoEscala;
    }
  | { readonly tipo: "descartar"; readonly cartaId: string };

export interface OpcionesMotorCarioca {
  /** Inyección determinista para tests: el mazo ya ordenado de cada mano. */
  readonly mazoParaMano?: (numeroMano: number) => readonly Carta[];
}

// ── Modo +Turbo (reloj por turno) ────────────────────────────────────────────
/** El primer turno de cada mano da más aire (reacomodo de cartas). */
const TURBO_PRIMER_TURNO_MS = 60_000;
/** Turnos siguientes de la mano. */
const TURBO_TURNO_MS = 15_000;

// ── Validación de forma (movida desde protocolo.ts) ──────────────────────────

function esTipoCombinacion(valor: unknown): valor is TipoCombinacion {
  return (
    valor === "trio" ||
    valor === "escala" ||
    valor === "escalaSucia" ||
    valor === "escalaReal"
  );
}

function esExtremoEscala(valor: unknown): valor is ExtremoEscala {
  return valor === "inicio" || valor === "fin";
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esListaDeStrings(valor: unknown): valor is readonly string[] {
  return Array.isArray(valor) && valor.every((item) => typeof item === "string");
}

function analizarPropuesta(valor: unknown): readonly PropuestaCombinacion[] | null {
  if (!Array.isArray(valor)) return null;
  const propuesta: PropuestaCombinacion[] = [];
  for (const parte of valor) {
    if (!esObjeto(parte)) return null;
    const { tipo, cartaIds } = parte;
    if (!esTipoCombinacion(tipo) || !esListaDeStrings(cartaIds)) return null;
    propuesta.push({ tipo, cartaIds });
  }
  return propuesta;
}

/** Crea el motor de Carioca; `mazoParaMano` permite mazos deterministas en tests. */
export function crearMotorCarioca(
  opciones: OpcionesMotorCarioca = {},
): MotorJuego<EstadoPartida, AccionCarioca> {
  const mazoParaMano = opciones.mazoParaMano ?? null;
  return {
    crear(jugadores: readonly JugadorMotor[], rng: GeneradorAleatorio): Resultado<EstadoPartida> {
      return mazoParaMano === null
        ? crearPartida(jugadores, rng)
        : crearPartidaConMazo(jugadores, mazoParaMano(1));
    },

    parsearAccion(crudo: AccionJuego): AccionCarioca | null {
      switch (crudo.tipo) {
        case "robarDelMazo":
          return { tipo: "robarDelMazo" };
        case "robarDelPozo":
          return { tipo: "robarDelPozo" };
        case "bajarse": {
          const propuesta = analizarPropuesta(crudo["propuesta"]);
          if (propuesta === null) return null;
          return { tipo: "bajarse", propuesta };
        }
        case "pegar": {
          const cartaId = crudo["cartaId"];
          const mesaIdx = crudo["mesaIdx"];
          const extremo = crudo["extremo"];
          if (typeof cartaId !== "string") return null;
          if (typeof mesaIdx !== "number" || !Number.isInteger(mesaIdx) || mesaIdx < 0) {
            return null;
          }
          if (extremo === undefined) return { tipo: "pegar", cartaId, mesaIdx };
          if (!esExtremoEscala(extremo)) return null;
          return { tipo: "pegar", cartaId, mesaIdx, extremo };
        }
        case "descartar": {
          const cartaId = crudo["cartaId"];
          if (typeof cartaId !== "string") return null;
          return { tipo: "descartar", cartaId };
        }
        default:
          return null;
      }
    },

    aplicarAccion(
      estado: EstadoPartida,
      jugadorId: string,
      accion: AccionCarioca,
    ): Resultado<EstadoPartida> {
      switch (accion.tipo) {
        case "robarDelMazo":
          return robarDelMazo(estado, jugadorId);
        case "robarDelPozo":
          return robarDelPozo(estado, jugadorId);
        case "bajarse":
          return bajarse(estado, jugadorId, accion.propuesta);
        case "pegar":
          return accion.extremo === undefined
            ? pegar(estado, jugadorId, accion.cartaId, accion.mesaIdx)
            : pegar(estado, jugadorId, accion.cartaId, accion.mesaIdx, accion.extremo);
        case "descartar":
          return descartar(estado, jugadorId, accion.cartaId);
      }
    },

    jugadorEnTurno(estado: EstadoPartida): string | null {
      return estado.fase === "jugandoMano" ? estado.turno.jugadorId : null;
    },

    saltarTurno(estado: EstadoPartida, jugadorId: string): Resultado<EstadoPartida> {
      return pasarTurno(estado, jugadorId);
    },

    turnoTurbo(
      estado: EstadoPartida,
    ): { clave: string; jugadorId: string; duracionMs: number } | null {
      if (estado.fase !== "jugandoMano") return null;
      // turno.numero se reinicia a 1 cada mano (partida.ts): numero===1 es el
      // primer turno de la mano. (manoActual, numero) identifica el turno-jugador.
      return {
        clave: `${estado.manoActual}:${estado.turno.numero}`,
        jugadorId: estado.turno.jugadorId,
        duracionMs: estado.turno.numero === 1 ? TURBO_PRIMER_TURNO_MS : TURBO_TURNO_MS,
      };
    },

    expirarTurno(
      estado: EstadoPartida,
      jugadorId: string,
      rng: GeneradorAleatorio,
    ): Resultado<EstadoPartida> {
      // No robó (fase "robar") → se salta el turno.
      if (estado.turno.fase === "robar") return pasarTurno(estado, jugadorId);
      // Ya robó (fase "descartar") → se bota una carta aleatoria. Nunca un
      // comodín (descartarlo es ilegal, COMODIN_AL_POZO); si solo quedan
      // comodines, no hay descarte posible: se salta el turno.
      const jugador = estado.jugadores.find((j) => j.id === jugadorId);
      const descartables = jugador?.mano.filter((c) => !esComodin(c)) ?? [];
      const elegida = descartables[Math.floor(rng() * descartables.length)];
      if (elegida === undefined) return pasarTurno(estado, jugadorId);
      return descartar(estado, jugadorId, elegida.id);
    },

    terminada(estado: EstadoPartida): boolean {
      return estado.fase === "partidaTerminada";
    },

    esperandoContinuar(estado: EstadoPartida): boolean {
      return estado.fase === "manoTerminada";
    },

    continuar(estado: EstadoPartida, rng: GeneradorAleatorio): Resultado<EstadoPartida> {
      return mazoParaMano === null
        ? iniciarSiguienteMano(estado, rng)
        : iniciarSiguienteManoConMazo(estado, mazoParaMano(estado.manoActual + 1));
    },

    construirVista(estado: EstadoPartida, jugadorId: string, meta: MetaSala): VistaPartida {
      return construirVista(estado, jugadorId, meta);
    },
  };
}
