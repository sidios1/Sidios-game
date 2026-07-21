// Vista por jugador de MeloQuiz: proyección PURA del estado que oculta la
// respuesta hasta la fase `revelar` (SPIKE_MELOQUIZ.md §6.4) y publica la ORDEN
// de reproducción, nunca el archivo (REGLAS §1, host↛peer: jamás viajan bytes
// de audio; cada cliente resuelve `pistaId` contra su propia carpeta).
//
// Sin datos de sala (conexión/anfitrión) — esos los añadirá el motor server al
// integrar MeloQuiz (S1b). Mismo patrón que uno-core/vista.ts.
//
// LO QUE NUNCA SALE DE AQUÍ, y por qué:
//  - `titulo`/`artista`/`caratula` de la canción correcta: es la respuesta.
//  - `OpcionRonda.cancionId`: comparable con `pistaId` ⇒ acierto garantizado.
//  - `CancionPool.claveArchivo` y el `pool` entero: no son del jugador.
//  - `CancionPool.claveCaratula`: NUNCA, ni siquiera en revelar. El cliente saca
//    la carátula de SU archivo local resuelto por `pistaId` (S3/S4); una clave
//    contra la carga del host sería un campo muerto que filtra su catálogo.
//  - los votos ajenos: solo viaja el booleano `haVotado`.

import type { ClaveFase, EstadoMeloquiz } from "./partida.js";
import { acerto, faseTemporizada, puntosDe } from "./partida.js";

/** Una opción de respuesta tal como la ve el jugador: solo id y texto. */
export interface OpcionVista {
  readonly id: string;
  readonly titulo: string;
}

export interface JugadorVistaMeloquiz {
  readonly id: string;
  readonly nombre: string;
  readonly puntos: number;
  /** Si ya votó esta ronda; QUÉ votó no viaja. */
  readonly haVotado: boolean;
  /** null hasta `revelar`: antes revelaría la respuesta por comparación. */
  readonly acerto: boolean | null;
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
  /** Las 4 opciones; VACÍO antes de `voto` (el clip es escucha pura, §4). */
  readonly opciones: readonly OpcionVista[];
  /** Solo TU voto; los ajenos nunca viajan. */
  readonly tuVotoId: string | null;
  /** Quiénes ackearon la precarga de esta ronda (§3.2). */
  readonly listos: readonly string[];
  readonly jugadores: readonly JugadorVistaMeloquiz[];
  readonly tituloCorrecto: string | null;
  readonly artistaCorrecto: string | null;
  readonly opcionCorrectaId: string | null;
  /** Vacío hasta `final`; puede traer varios (empate compartido, §6). */
  readonly ganadores: readonly string[];
}

/** ¿Ya se puede mostrar la respuesta? Solo desde `revelar` en adelante (§6.4). */
function respuestaRevelada(fase: ClaveFase): boolean {
  return fase === "revelar" || fase === "puntaje";
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
  const opcionesVisibles = ronda !== null && estado.fase !== "precarga" && estado.fase !== "clip";

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
    opciones:
      opcionesVisibles && ronda !== null
        ? ronda.opciones.map((o) => ({ id: o.id, titulo: o.titulo }))
        : [],
    tuVotoId: estado.votos[jugadorId] ?? null,
    listos: estado.listos,
    jugadores: estado.jugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      puntos: puntosDe(estado, j.id),
      haVotado: estado.votos[j.id] !== undefined,
      acerto: revelada ? acerto(estado, j.id) : null,
    })),
    tituloCorrecto: revelada ? (cancion?.titulo ?? null) : null,
    artistaCorrecto: revelada ? (cancion?.artista ?? null) : null,
    opcionCorrectaId: revelada ? (ronda?.opcionCorrectaId ?? null) : null,
    ganadores: estado.ganadores,
  };
}
