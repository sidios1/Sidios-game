// Vista por jugador de Mentiroso: la proyección que cada cliente puede ver.
// Aquí vive la información oculta — la PILA y las MANOS AJENAS nunca salen de
// esta función (solo sus conteos). La ÚNICA excepción es `ultimaResolucion`:
// las cartas que se destapan al resolver una acusación (§5 de REGLAS_MENTIROSO).
//
// El motor de Mentiroso ENVUELVE el estado del core en `EstadoMentiroso` porque
// el core (mentiroso-core) no retiene en su estado las cartas reveladas tras una
// acusación ni los nombres de los jugadores: ambos son presentación y los
// recuerda este adaptador, sin duplicar ninguna regla.

import type { Carta, EstadoPartida as EstadoNucleo, Palo } from "@juegos/mentiroso-core";
import type { EstadoConexion, MetaSala } from "../../vista.js";

/** Lo revelado al resolver una acusación (§5): viaja a TODOS los jugadores. */
export interface ResolucionVista {
  readonly acusadorId: string;
  readonly acusadoId: string;
  /** Palo declarado de la ronda en la que se acusó. */
  readonly paloRonda: Palo;
  /** Las cartas de la última jugada que se destaparon. */
  readonly cartas: readonly Carta[];
  /** ¿El acusado mentía (alguna carta no era del palo)? */
  readonly mentia: boolean;
  /** Quién recogió la pila (el acusado si mentía; el acusador si no). */
  readonly quienRecogioId: string;
}

/**
 * Estado del motor de Mentiroso: el estado puro del core MÁS los datos de
 * presentación que el core no guarda (nombres y la última resolución revelada).
 */
export interface EstadoMentiroso {
  readonly nucleo: EstadoNucleo;
  /** Nombres por id de jugador (el core solo conoce ids). */
  readonly nombres: Readonly<Record<string, string>>;
  /** Resolución de la última acusación, para destapar sus cartas; null si no hay. */
  readonly ultimaResolucion: ResolucionVista | null;
}

export interface JugadorVistaMentiroso {
  readonly id: string;
  readonly nombre: string;
  /** Id del avatar del perfil; ausente si el jugador no eligió uno. */
  readonly avatar?: string;
  /** Conteo: la mano ajena jamás viaja en la vista. */
  readonly numeroCartas: number;
  /** Atajo de presentación: `estadoConexion === "conectado"`. */
  readonly conectado: boolean;
  readonly estadoConexion: EstadoConexion;
}

export interface VistaMentiroso {
  /** Discriminante del juego (marcador; el cliente confía en su selección local). */
  readonly juego: "mentiroso";
  readonly tuJugadorId: string;
  /** TUS cartas (solo el palo importa); las ajenas nunca viajan. */
  readonly tuMano: readonly Carta[];
  /** Asiento anfitrión (puede reabrir conexiones). */
  readonly anfitrionId: string;
  /** En orden de turnos. */
  readonly jugadores: readonly JugadorVistaMentiroso[];
  /** Palo declarado de la ronda actual. */
  readonly paloRonda: Palo;
  /** Conteo: la pila va boca abajo, nunca viajan sus cartas. */
  readonly numeroPila: number;
  /** A quién le toca; null si la partida terminó. */
  readonly jugadorEnTurnoId: string | null;
  /** Última jugada: la cantidad es pública; las cartas reales NO (van ocultas). */
  readonly ultimaJugada: { readonly jugadorId: string; readonly cantidad: number } | null;
  /** Lo único revelado: la resolución de la última acusación. */
  readonly ultimaResolucion: ResolucionVista | null;
  /** Ganador confirmado; null mientras la partida sigue. */
  readonly ganadorId: string | null;
  /** Quien jugó su última carta y espera que su jugada se acepte (§8.1). */
  readonly ganadorPendienteId: string | null;
}

export function construirVistaMentiroso(
  estado: EstadoMentiroso,
  jugadorId: string,
  meta: MetaSala,
): VistaMentiroso {
  const nucleo = estado.nucleo;
  if (!nucleo.ordenJugadores.includes(jugadorId)) {
    throw new Error(`no hay vista para un jugador fuera de la partida: ${jugadorId}`);
  }
  const jugadores: JugadorVistaMentiroso[] = nucleo.ordenJugadores.map((id) => {
    const avatar = meta.avatares?.get(id);
    const estadoConexion = meta.estados.get(id) ?? "conectado";
    return {
      id,
      nombre: estado.nombres[id] ?? id,
      // exactOptionalPropertyTypes: omitimos avatar cuando no hay.
      ...(avatar !== undefined ? { avatar } : {}),
      numeroCartas: (nucleo.manos[id] ?? []).length,
      conectado: estadoConexion === "conectado",
      estadoConexion,
    };
  });
  return {
    juego: "mentiroso",
    tuJugadorId: jugadorId,
    tuMano: nucleo.manos[jugadorId] ?? [],
    anfitrionId: meta.anfitrionId,
    jugadores,
    paloRonda: nucleo.paloRonda,
    numeroPila: nucleo.pila.length,
    jugadorEnTurnoId: nucleo.ganador === null ? nucleo.jugadorEnTurno : null,
    ultimaJugada:
      nucleo.ultimaJugada === null
        ? null
        : { jugadorId: nucleo.ultimaJugada.jugador, cantidad: nucleo.ultimaJugada.cantidad },
    ultimaResolucion: estado.ultimaResolucion,
    ganadorId: nucleo.ganador,
    ganadorPendienteId: nucleo.ganadorPendiente,
  };
}
