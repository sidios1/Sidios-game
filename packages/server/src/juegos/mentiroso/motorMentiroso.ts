// El MotorJuego de Mentiroso: envuelve mentiroso-core y le da al orquestador
// genérico todo lo que necesita sin que este conozca las reglas. NINGUNA regla
// vive aquí: se delega a mentiroso-core (crearPartida/jugar/acusar). Este módulo
// solo adapta tipos y recuerda lo que el core no guarda (nombres y la resolución
// revelada de la última acusación), análogo a motorCarioca.ts.
//
// Detalles de la costura:
//  - `acusar` necesita un rng para elegir el palo de la ronda nueva, pero
//    `MotorJuego.aplicarAccion` no lo recibe: el motor CAPTURA el rng del último
//    `crear`/`continuar` (siempre ocurre antes de cualquier acusación).
//  - `saltarTurno` (un ausente en su turno) reusa `jugar(_, _, 1)`: una jugada
//    mínima forzada. No revela cartas ni duplica reglas.
//  - Mentiroso no pausa por votación entre rondas (las rondas avanzan dentro de
//    `acusar`): `esperandoContinuar` es siempre false y `continuar` es un no-op.

import {
  acusar,
  crearPartida,
  crearPartidaConBaraja,
  jugar,
} from "@juegos/mentiroso-core";
import type { Carta, Palo } from "@juegos/mentiroso-core";
import type { AccionJuego } from "../../protocolo.js";
import type {
  GeneradorAleatorio,
  JugadorMotor,
  MotorJuego,
  Resultado,
} from "../../motor.js";
import type { MetaSala } from "../../vista.js";
import { construirVistaMentiroso } from "./vistaMentiroso.js";
import type { EstadoMentiroso, ResolucionVista } from "./vistaMentiroso.js";

/** Acciones de Mentiroso ya validadas en su forma; opacas fuera de este módulo. */
export type AccionMentiroso =
  | { readonly tipo: "jugar"; readonly cantidad: 1 | 2 | 3 }
  | { readonly tipo: "acusar" };

/** Opciones del motor; el seam `baraja`/`paloInicial` da partidas deterministas en tests. */
export interface OpcionesMotorMentiroso {
  readonly baraja?: readonly Carta[];
  readonly paloInicial?: Palo;
}

/** Crea el motor de Mentiroso. */
export function crearMotorMentiroso(
  opciones: OpcionesMotorMentiroso = {},
): MotorJuego<EstadoMentiroso, AccionMentiroso> {
  // rng capturado del último crear/continuar; lo usa `acusar` (que no lo recibe).
  let rng: GeneradorAleatorio = Math.random;

  function envolver(
    nucleo: EstadoMentiroso["nucleo"],
    nombres: EstadoMentiroso["nombres"],
    ultimaResolucion: ResolucionVista | null,
  ): EstadoMentiroso {
    return { nucleo, nombres, ultimaResolucion };
  }

  return {
    crear(jugadores: readonly JugadorMotor[], rngParam): Resultado<EstadoMentiroso> {
      rng = rngParam;
      const datos = jugadores.map((j) => ({ id: j.id, nombre: j.nombre }));
      const base =
        opciones.baraja !== undefined
          ? crearPartidaConBaraja(datos, opciones.baraja, opciones.paloInicial ?? "picas")
          : crearPartida(datos, rngParam);
      if (!base.ok) return base;
      const nombres: Record<string, string> = {};
      for (const j of datos) nombres[j.id] = j.nombre;
      return { ok: true, valor: envolver(base.valor, nombres, null) };
    },

    parsearAccion(crudo: AccionJuego): AccionMentiroso | null {
      switch (crudo.tipo) {
        case "jugar": {
          const cantidad = crudo["cantidad"];
          if (cantidad === 1 || cantidad === 2 || cantidad === 3) {
            return { tipo: "jugar", cantidad };
          }
          return null;
        }
        case "acusar":
          return { tipo: "acusar" };
        default:
          return null;
      }
    },

    aplicarAccion(
      estado: EstadoMentiroso,
      jugadorId: string,
      accion: AccionMentiroso,
    ): Resultado<EstadoMentiroso> {
      switch (accion.tipo) {
        case "jugar": {
          const res = jugar(estado.nucleo, jugadorId, accion.cantidad);
          if (!res.ok) return res;
          // Una jugada nueva cierra la ventana: ya no hay resolución que mostrar.
          return { ok: true, valor: envolver(res.valor, estado.nombres, null) };
        }
        case "acusar": {
          const previa = estado.nucleo.ultimaJugada;
          const paloRonda = estado.nucleo.paloRonda;
          const res = acusar(estado.nucleo, jugadorId, rng);
          if (!res.ok) return res;
          const resolucion: ResolucionVista | null =
            previa === null
              ? null
              : {
                  acusadorId: jugadorId,
                  acusadoId: previa.jugador,
                  paloRonda,
                  cartas: previa.cartas,
                  mentia: previa.cartas.some((c) => c.palo !== paloRonda),
                  quienRecogioId: res.valor.jugadorEnTurno,
                };
          return { ok: true, valor: envolver(res.valor, estado.nombres, resolucion) };
        }
      }
    },

    jugadorEnTurno(estado: EstadoMentiroso): string | null {
      return estado.nucleo.ganador === null ? estado.nucleo.jugadorEnTurno : null;
    },

    saltarTurno(estado: EstadoMentiroso, jugadorId: string): Resultado<EstadoMentiroso> {
      // Ausente en su turno: juega la mínima (1 carta), reusando el core.
      const res = jugar(estado.nucleo, jugadorId, 1);
      if (!res.ok) return res;
      return { ok: true, valor: envolver(res.valor, estado.nombres, null) };
    },

    terminada(estado: EstadoMentiroso): boolean {
      return estado.nucleo.ganador !== null;
    },

    // Mentiroso no pausa por votación: las rondas avanzan dentro de `acusar`.
    esperandoContinuar(): boolean {
      return false;
    },

    continuar(estado: EstadoMentiroso, rngParam): Resultado<EstadoMentiroso> {
      rng = rngParam;
      return { ok: true, valor: estado };
    },

    construirVista(estado: EstadoMentiroso, jugadorId: string, meta: MetaSala) {
      return construirVistaMentiroso(estado, jugadorId, meta);
    },
  };
}
