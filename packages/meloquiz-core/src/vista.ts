// Vista por jugador de MeloQuiz: proyección PURA del estado que oculta la
// respuesta hasta la fase `revelar` (SPIKE_MELOQUIZ.md §6.4) y publica la ORDEN
// de reproducción, nunca el archivo (REGLAS §1, host↛peer: jamás viajan bytes
// de audio; cada cliente resuelve `pistaId` contra su propia carpeta).
//
// Sin datos de sala (conexión/anfitrión) — esos los añade el motor server al
// integrar MeloQuiz (S1b). Mismo patrón que uno-core/vista.ts.
//
// LO QUE NUNCA SALE DE AQUÍ, y por qué:
//  - `titulo`/`artista`/`caratula` antes de `revelar`: protege la gracia del
//    juego (adivinar de viva voz), aunque ya no haya votación que amañar.
//  - `CancionPool.claveArchivo` y el `pool` entero: no son del jugador.
//  - `CancionPool.claveCaratula`: NUNCA, ni siquiera en revelar. El cliente saca
//    la carátula de SU archivo local resuelto por `pistaId` (S3/S4); una clave
//    contra la carga del host sería un campo muerto que filtra su catálogo.
//  - los votos ajenos durante la votación: solo viaja el booleano `haVotado`.
//    Los CONTEOS recién se publican en `puntaje`, con la votación ya cerrada.

import type { ClaveFase, EstadoMeloquiz } from "./partida.js";
import { faseTemporizada, puntosDe, resolverVotacion } from "./partida.js";

export interface JugadorVistaMeloquiz {
  readonly id: string;
  readonly nombre: string;
  readonly puntos: number;
  /** Si ya votó esta ronda; QUÉ votó no viaja. */
  readonly haVotado: boolean;
  /** Votos que recibió en la ronda; null hasta `puntaje` (voto secreto, §5). */
  readonly votosRecibidos: number | null;
}

export interface VistaMeloquiz {
  readonly juego: "meloquiz";
  readonly tuJugadorId: string;
  readonly fase: ClaveFase;
  /** Identidad estable de la fase (`${ronda}:${fase}`); null en `final`. */
  readonly claveFase: string | null;
  /** Duración de la fase en curso; null en `final`. */
  readonly duracionFaseMs: number | null;
  readonly ronda: number;
  readonly rondasTotales: number;
  /** La ORDEN: "reproduzcan esta pista". Id opaco, nunca el archivo (§1). */
  readonly pistaId: string | null;
  readonly segundoInicio: number | null;
  /** Solo TU voto (el jugador al que votaste); los ajenos nunca viajan. */
  readonly tuVotoJugadorId: string | null;
  /** Quiénes ackearon la precarga de esta ronda (§3.2). */
  readonly listos: readonly string[];
  readonly jugadores: readonly JugadorVistaMeloquiz[];
  readonly tituloCorrecto: string | null;
  readonly artistaCorrecto: string | null;
  /**
   * Ganador de la RONDA por mayoría simple; solo en `puntaje`. null también
   * cuando hubo empate o nadie votó (nadie suma, §5): el cliente NO re-deriva
   * la regla, la lee de acá.
   */
  readonly ganadorRonda: string | null;
  /** Vacío hasta `final`; puede traer varios (empate compartido, §6). */
  readonly ganadores: readonly string[];
}

/** ¿Ya se puede mostrar la respuesta? Desde `revelar` en adelante (§4). */
function respuestaRevelada(fase: ClaveFase): boolean {
  return fase === "revelar" || fase === "voto" || fase === "puntaje";
}

export function construirVistaMeloquiz(
  estado: EstadoMeloquiz,
  jugadorId: string,
): VistaMeloquiz {
  const ronda = estado.rondaActual;
  const revelada = respuestaRevelada(estado.fase);
  const cancion =
    ronda === null ? undefined : estado.pool.canciones.find((c) => c.id === ronda.cancionId);
  const fase = faseTemporizada(estado);
  // Los conteos solo con la votación CERRADA: durante `voto` sesgarían al grupo.
  const resolucion = estado.fase === "puntaje"
    ? resolverVotacion(estado.votos, estado.jugadores)
    : null;

  return {
    juego: "meloquiz",
    tuJugadorId: jugadorId,
    fase: estado.fase,
    claveFase: fase?.clave ?? null,
    duracionFaseMs: fase?.duracionMs ?? null,
    ronda: estado.ronda,
    rondasTotales: estado.rondasTotales,
    pistaId: ronda?.cancionId ?? null,
    segundoInicio: cancion?.segundoInicio ?? null,
    tuVotoJugadorId: estado.votos[jugadorId] ?? null,
    listos: estado.listos,
    jugadores: estado.jugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      puntos: puntosDe(estado, j.id),
      haVotado: estado.votos[j.id] !== undefined,
      votosRecibidos: resolucion === null ? null : (resolucion.conteos[j.id] ?? 0),
    })),
    tituloCorrecto: revelada ? (cancion?.titulo ?? null) : null,
    artistaCorrecto: revelada ? (cancion?.artista ?? null) : null,
    ganadorRonda: resolucion?.ganadorId ?? null,
    ganadores: estado.ganadores,
  };
}
