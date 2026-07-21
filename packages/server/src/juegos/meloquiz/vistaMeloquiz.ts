// La vista de MeloQuiz tal como sale del servidor: la proyección PURA del núcleo
// (`construirVistaMeloquiz`, que a propósito no sabe nada de sala) más los datos
// que solo el orquestador conoce — anfitrión, conexiones y el reloj de fase.
//
// La invariante de ocultamiento vive ENTERA en el núcleo (meloquiz-core/vista.ts):
// aquí no se agrega ni se destapa nada del juego. Mismo reparto que
// vistaMentiroso.ts, pero al revés: allá la proyección vive en el server porque
// mentiroso-core no la trae; acá el core ya la trae y solo la envolvemos.

import { construirVistaMeloquiz } from "@juegos/meloquiz-core";
import type { EstadoMeloquiz, VistaMeloquiz } from "@juegos/meloquiz-core";
import type { EstadoConexion, MetaSala } from "../../vista.js";

/**
 * La vista del núcleo + los datos de sala. El núcleo ya declara `juego:
 * "meloquiz"` (el discriminante de `VistaJuego`), así que basta intersectar: no
 * hace falta el `Omit` que sí necesita Rumble para no colapsar dos literales
 * distintos en `never`.
 */
export type VistaMeloquizSala = VistaMeloquiz & {
  /** Asiento anfitrión (puede reabrir conexiones); en partida es estable. */
  readonly anfitrionId: string;
  /**
   * Ciclo de vida de la conexión por jugador. Va como mapa aparte en vez de
   * fusionarse en `JugadorVistaMeloquiz`: el núcleo es puro y no conoce el
   * concepto, y así no hay que hacerle un `Omit` a `jugadores`.
   */
  readonly estadosConexion: Readonly<Record<string, EstadoConexion>>;
  /** Ms que le quedan a la fase en curso, o null (sin reloj/fase). */
  readonly faseMsRestantes: number | null;
  /** Instante absoluto (epoch ms, reloj del host) en que arrancó la fase. */
  readonly faseInicioMs: number | null;
};

export function construirVistaMeloquizSala(
  estado: EstadoMeloquiz,
  jugadorId: string,
  meta: MetaSala,
): VistaMeloquizSala {
  const estadosConexion: Record<string, EstadoConexion> = {};
  for (const jugador of estado.jugadores) {
    estadosConexion[jugador.id] = meta.estados.get(jugador.id) ?? "conectado";
  }
  return {
    ...construirVistaMeloquiz(estado, jugadorId),
    anfitrionId: meta.anfitrionId,
    estadosConexion,
    faseMsRestantes: meta.faseMsRestantes ?? null,
    faseInicioMs: meta.faseInicioMs ?? null,
  };
}
