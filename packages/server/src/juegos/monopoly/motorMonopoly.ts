// El MotorJuego de Monopoly Ultimate Team: envuelve monopoly-core y le da al
// orquestador genérico todo lo que necesita sin que este conozca las reglas.
// NINGUNA regla vive aquí: se delega a monopoly-core (crearPartida/
// aplicarAccion/jugadorEnTurno/terminada/turnos.saltarTurno), tal como
// documenta el propio partida.ts ("estas firmas son estructuralmente
// compatibles con MotorJuego<E,A>... el adaptador de servidor en sí es S3").
//
// Detalles de la costura:
//  - `aplicarAccion`/`saltarTurno` de monopoly-core piden un `rng`, pero
//    `MotorJuego.aplicarAccion`/`saltarTurno` no lo reciben: el motor CAPTURA
//    el rng del último `crear()` (mismo truco que motorMentiroso.ts).
//  - `rondasTotales` no tiene ningún default en REGLAS_MONOPOLY_ULTIMATE_TEAM.md
//    ni en reglas.ts: es una decisión de host, así que el config OPACO del
//    lobby la trae (revalidada acá, autoridad del host) y si no viene se usa
//    un default de esta sesión (`RONDAS_TOTALES_DEFAULT`), no una regla nueva.
//  - Timeout con `decisionPendiente`/`subastaEnCurso` pendiente del jugador en
//    turno: `saltarTurno` delega TAL CUAL a turnos.ts, que devuelve error en
//    ese caso ("queda para cuando el servidor defina su política", según su
//    propio comentario). No se inventa una auto-resolución (declinar compra,
//    pasar subasta): el orquestador simplemente no avanza ese turno hasta que
//    el jugador vuelva o el anfitrión intervenga.
//  - Monopoly no pausa por votación entre rondas (§6: termina sola al superar
//    `rondasTotales`): `esperandoContinuar` es siempre false y `continuar` es
//    un no-op, igual que Mentiroso/MeloQuiz.
//  - Sin `turnoTurbo`/`expirarTurno`/`faseTemporizada`/`expirarFase`: fuera de
//    alcance de esta sesión (ver PROMPTS_MONOPOLY_ULTIMATE_TEAM.md).

import {
  aplicarAccion as aplicarAccionCore,
  crearPartida,
  esNombreLigaValido,
  jugadorEnTurno as jugadorEnTurnoCore,
  POSICIONES,
  saltarTurno as saltarTurnoCore,
  terminada as terminadaCore,
} from "@juegos/monopoly-core";
import type {
  AccionMonopoly,
  EstadoMonopoly,
  OfertaIntercambio,
  PoolSobres,
  PosicionJugador,
} from "@juegos/monopoly-core";
import type { AccionJuego } from "../../protocolo.js";
import type {
  GeneradorAleatorio,
  JugadorMotor,
  MotorJuego,
  Resultado,
} from "../../motor.js";
import type { MetaSala } from "../../vista.js";
import { construirVistaMonopoly } from "./vistaMonopoly.js";

/** Sin default en monopoly-core: valor elegido esta sesión, ajustable por el host vía config. */
const RONDAS_TOTALES_DEFAULT = 20;

/** Opciones del motor; el default de rondas es override-able por si otra sala lo necesita. */
export interface OpcionesMotorMonopoly {
  readonly rondasTotalesDefault?: number;
}

function esPosicionValida(valor: string): valor is PosicionJugador {
  return (POSICIONES as readonly string[]).includes(valor);
}

function leerRondasTotales(config: unknown, porDefecto: number): number {
  if (typeof config === "object" && config !== null) {
    const valor = (config as Record<string, unknown>)["rondasTotales"];
    if (typeof valor === "number") return valor;
  }
  return porDefecto;
}

function parsearOferta(valor: unknown): OfertaIntercambio | null {
  if (typeof valor !== "object" || valor === null) return null;
  const registro = valor as Record<string, unknown>;
  const dinero = registro["dinero"];
  const cartaIds = registro["cartaIds"];
  if (typeof dinero !== "number" || !Number.isFinite(dinero)) return null;
  if (!Array.isArray(cartaIds) || !cartaIds.every((c) => typeof c === "string")) {
    return null;
  }
  return { dinero, cartaIds };
}

/** Crea el motor de Monopoly Ultimate Team, inyectando el pool de sobres ya resuelto (S2). */
export function crearMotorMonopoly(
  pool: PoolSobres,
  opciones: OpcionesMotorMonopoly = {},
): MotorJuego<EstadoMonopoly, AccionMonopoly> {
  const rondasTotalesDefault = opciones.rondasTotalesDefault ?? RONDAS_TOTALES_DEFAULT;
  // rng capturado del último crear(); lo usan aplicarAccion/saltarTurno, que no lo reciben.
  let rng: GeneradorAleatorio = Math.random;

  return {
    crear(jugadores: readonly JugadorMotor[], rngParam, config?: unknown): Resultado<EstadoMonopoly> {
      rng = rngParam;
      const datos = jugadores.map((j) => ({ id: j.id, nombre: j.nombre }));
      const rondasTotales = leerRondasTotales(config, rondasTotalesDefault);
      return crearPartida(datos, pool, rngParam, { rondasTotales });
    },

    parsearAccion(crudo: AccionJuego): AccionMonopoly | null {
      switch (crudo.tipo) {
        case "tirarDados":
          return { tipo: "tirarDados" };
        case "comprarSobre": {
          const posicion = crudo["posicion"];
          if (posicion === undefined) return { tipo: "comprarSobre" };
          if (typeof posicion === "string" && esPosicionValida(posicion)) {
            return { tipo: "comprarSobre", posicion };
          }
          return null;
        }
        case "declinarCompra":
          return { tipo: "declinarCompra" };
        case "pujar": {
          const monto = crudo["monto"];
          if (typeof monto === "number" && Number.isFinite(monto)) {
            return { tipo: "pujar", monto };
          }
          return null;
        }
        case "pasarSubasta":
          return { tipo: "pasarSubasta" };
        case "elegirPosicionSobre": {
          const posicion = crudo["posicion"];
          if (typeof posicion === "string" && esPosicionValida(posicion)) {
            return { tipo: "elegirPosicionSobre", posicion };
          }
          return null;
        }
        case "forzarCompra":
          return { tipo: "forzarCompra" };
        case "pagarMultaDescendido":
          return { tipo: "pagarMultaDescendido" };
        case "intercambiar": {
          const conJugadorId = crudo["conJugadorId"];
          const ofrezco = parsearOferta(crudo["ofrezco"]);
          const pido = parsearOferta(crudo["pido"]);
          if (
            typeof conJugadorId === "string" &&
            conJugadorId.length > 0 &&
            ofrezco !== null &&
            pido !== null
          ) {
            return { tipo: "intercambiar", conJugadorId, ofrezco, pido };
          }
          return null;
        }
        case "elegirRoboPrensa": {
          const rivalId = crudo["rivalId"];
          const cartaId = crudo["cartaId"];
          if (
            typeof rivalId === "string" &&
            rivalId.length > 0 &&
            typeof cartaId === "string" &&
            cartaId.length > 0
          ) {
            return { tipo: "elegirRoboPrensa", rivalId, cartaId };
          }
          return null;
        }
        case "elegirCambioAgente": {
          const cartaId = crudo["cartaId"];
          if (typeof cartaId === "string" && cartaId.length > 0) {
            return { tipo: "elegirCambioAgente", cartaId };
          }
          return null;
        }
        case "elegirLigaDobleFichaje": {
          const liga = crudo["liga"];
          if (typeof liga === "string" && esNombreLigaValido(liga)) {
            return { tipo: "elegirLigaDobleFichaje", liga };
          }
          return null;
        }
        default:
          return null;
      }
    },

    aplicarAccion(estado, jugadorId, accion): Resultado<EstadoMonopoly> {
      return aplicarAccionCore(estado, jugadorId, accion, rng);
    },

    jugadorEnTurno(estado): string | null {
      return jugadorEnTurnoCore(estado);
    },

    saltarTurno(estado, jugadorId): Resultado<EstadoMonopoly> {
      return saltarTurnoCore(estado, jugadorId, rng);
    },

    terminada(estado): boolean {
      return terminadaCore(estado);
    },

    // Monopoly no pausa por votación entre rondas: §6 termina sola al superar rondasTotales.
    esperandoContinuar(): boolean {
      return false;
    },

    continuar(estado, rngParam): Resultado<EstadoMonopoly> {
      rng = rngParam;
      return { ok: true, valor: estado };
    },

    construirVista(estado, jugadorId, meta: MetaSala) {
      return construirVistaMonopoly(estado, jugadorId, meta);
    },
  };
}
