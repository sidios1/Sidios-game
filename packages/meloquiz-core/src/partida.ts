// Máquina de partida de MeloQuiz: funciones puras y deterministas sobre un
// estado inmutable (REGLAS_MELOQUIZ.md §4, §5, §6). Cada acción devuelve un
// Resultado: el nuevo estado o un error tipado. Aquí viven TODAS las reglas del
// juego; no se duplican en el servidor ni en el cliente.
//
// Decisiones que rigen este archivo:
//  - MeloQuiz es SIMULTÁNEO y DIRIGIDO POR RELOJ: no hay turnos. Las fases
//    avanzan por tiempo (`expirarFase`), no por acción de jugador.
//  - El tiempo entra como PARÁMETRO (`ahoraMs`), igual que el rng. El núcleo
//    JAMÁS llama Date.now() ni decide por su cuenta que una fase venció: solo
//    sella el instante que le pasan. Quien decide es el llamador (el orquestador
//    en S1b, el test aquí). Esta es la restricción dura de SPIKE §4/§6.1.
//  - Orden de fases (REGLAS §4, pivote 2026-07-21): precarga → clip → revelar →
//    voto → puntaje. Se revela ANTES de votar: el juego no juzga aciertos, los
//    jugadores adivinan de viva voz y el grupo vota QUÉ JUGADOR ganó la ronda.
//    El juego es escribano, no árbitro.
//  - Modo entrenamiento (1 jugador, §4/§6): SIN votación — revelar salta
//    directo a la ronda siguiente.
//  - El avance de ronda NO usa esperandoContinuar/continuar (SPIKE §6.3): las
//    rondas avanzan dentro de la expiración de la fase `puntaje`.

import { barajar, type GeneradorAleatorio } from "./aleatorio.js";
import type { PoolPartida } from "./catalogo.js";
import { validarPool } from "./catalogo.js";
import { REGLAS_MELOQUIZ, type DuracionesFase } from "./reglas.js";
import { error, ok, type ErrorJuego, type Resultado } from "./resultado.js";

export interface DatosJugador {
  readonly id: string;
  readonly nombre: string;
}

/** Las fases de una ronda (§4); `final` es el estado terminal de la partida. */
export type ClaveFase = "precarga" | "clip" | "revelar" | "voto" | "puntaje" | "final";

/**
 * La ronda en curso: qué canción suena (§4). Tras el pivote no hay opciones ni
 * respuesta correcta: el veredicto lo da el grupo votando por un JUGADOR (§5).
 */
export interface RondaMeloquiz {
  readonly cancionId: string;
}

/**
 * El veredicto de una votación (§5): conteo de votos por jugador y el ganador
 * por mayoría simple, o null si hubo empate en el máximo o nadie votó.
 */
export interface ResolucionVotacion {
  readonly conteos: Readonly<Record<string, number>>;
  readonly ganadorId: string | null;
}

export interface EstadoMeloquiz {
  readonly jugadores: readonly DatosJugador[];
  /** El pool de la partida; material de las rondas. Nunca viaja en la vista. */
  readonly pool: PoolPartida;
  readonly fase: ClaveFase;
  /** Instante (ms) en que empezó la fase actual: el `ahoraMs` que nos pasaron. */
  readonly faseIniciadaEnMs: number;
  readonly duraciones: DuracionesFase;
  /** Modo entrenamiento (§6): partida de a uno, sin fase de votación. */
  readonly entrenamiento: boolean;
  /** Ronda en curso, 1-based. */
  readonly ronda: number;
  readonly rondasTotales: number;
  /** Ids de canción barajados al crear: una por ronda, sin repetir. */
  readonly ordenCanciones: readonly string[];
  /** null solo en la fase `final`. */
  readonly rondaActual: RondaMeloquiz | null;
  readonly puntajes: Readonly<Record<string, number>>;
  /** Acks de precarga de la ronda en curso (§3.2). */
  readonly listos: readonly string[];
  /** jugadorId → id del JUGADOR votado, en la ronda en curso (§5). */
  readonly votos: Readonly<Record<string, string>>;
  /** Vacío hasta `final`; puede traer varios (empate compartido, §6). */
  readonly ganadores: readonly string[];
}

/** Opciones de partida (§6); todo tiene default. */
export interface OpcionesMeloquiz {
  /** Rondas a jugar; por defecto, tantas como canciones tenga el pool. */
  readonly rondas?: number;
  /** Duraciones de fase a medida; por defecto las de REGLAS §4. */
  readonly duraciones?: Partial<DuracionesFase>;
  /**
   * Modo entrenamiento (§6): habilita la partida de UN jugador y elimina la
   * votación (precarga → clip → revelar → siguiente canción).
   */
  readonly entrenamiento?: boolean;
}

/**
 * Descriptor de la fase temporizada en curso. SPIKE §6.2: el `faseTemporizada`
 * de `MotorJuego` (S1b) devuelve ESTO tal cual, sin lógica adicional.
 */
export interface FaseTemporizadaNucleo {
  /** Identidad estable de la fase: `${ronda}:${fase}`, p. ej. "3:voto". */
  readonly clave: string;
  readonly duracionMs: number;
}

// ── Helpers internos ────────────────────────────────────────────────────────

function validarJugadores(
  datos: readonly DatosJugador[],
  entrenamiento: boolean,
): ErrorJuego | null {
  const { min, max } = entrenamiento
    ? REGLAS_MELOQUIZ.jugadoresEntrenamiento
    : REGLAS_MELOQUIZ.jugadores;
  if (datos.length < min || datos.length > max) {
    return {
      codigo: "JUGADORES_INVALIDOS",
      mensaje: entrenamiento
        ? `el modo entrenamiento es de ${min} jugador`
        : `se necesitan entre ${min} y ${max} jugadores`,
    };
  }
  const ids = datos.map((d) => d.id);
  if (ids.some((id) => id.length === 0)) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "hay un id de jugador vacío" };
  }
  if (new Set(ids).size !== ids.length) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "hay ids de jugador duplicados" };
  }
  return null;
}

/** Arma la ronda: solo la canción sorteada; el grupo juzga, no hay opciones (§5). */
function armarRonda(pool: PoolPartida, cancionId: string): RondaMeloquiz | null {
  if (!pool.canciones.some((c) => c.id === cancionId)) return null;
  return { cancionId };
}

/** Cambia de fase sellando el instante recibido. El núcleo no consulta reloj. */
function entrarEnFase(
  estado: EstadoMeloquiz,
  fase: ClaveFase,
  ahoraMs: number,
): EstadoMeloquiz {
  return { ...estado, fase, faseIniciadaEnMs: ahoraMs };
}

/**
 * Resuelve la votación de la ronda (§5): mayoría simple. El más votado gana;
 * empate en el máximo (o nadie votó) → `ganadorId` null y nadie suma. Quien no
 * votó no aporta voto. ÚNICA implementación de la regla: la usan el puntaje y
 * la vista (que publica los conteos en `puntaje`).
 */
export function resolverVotacion(
  votos: Readonly<Record<string, string>>,
  jugadores: readonly DatosJugador[],
): ResolucionVotacion {
  const conteos: Record<string, number> = {};
  for (const j of jugadores) conteos[j.id] = 0;
  for (const votadoId of Object.values(votos)) {
    conteos[votadoId] = (conteos[votadoId] ?? 0) + 1;
  }
  const maximo = Math.max(0, ...Object.values(conteos));
  const punteros = jugadores.filter((j) => conteos[j.id] === maximo);
  const ganadorId = maximo > 0 && punteros.length === 1 ? (punteros[0]?.id ?? null) : null;
  return { conteos, ganadorId };
}

/**
 * Aplica el puntaje de la ronda (§5): +1 SOLO al ganador por mayoría simple.
 * Empate o ronda sin votos: nadie suma.
 */
function aplicarPuntaje(estado: EstadoMeloquiz): Readonly<Record<string, number>> {
  const { ganadorId } = resolverVotacion(estado.votos, estado.jugadores);
  if (ganadorId === null) return estado.puntajes;
  return {
    ...estado.puntajes,
    [ganadorId]: (estado.puntajes[ganadorId] ?? 0) + REGLAS_MELOQUIZ.puntosPorRonda,
  };
}

/**
 * Ganadores: todos los que empatan en el puntaje máximo (§6, empate compartido).
 * Si nadie sumó nunca, todos empatan en 0 y todos son ganadores.
 */
function calcularGanadores(
  jugadores: readonly DatosJugador[],
  puntajes: Readonly<Record<string, number>>,
): readonly string[] {
  const puntosDe = (id: string): number => puntajes[id] ?? 0;
  const maximo = Math.max(...jugadores.map((j) => puntosDe(j.id)));
  return jugadores.filter((j) => puntosDe(j.id) === maximo).map((j) => j.id);
}

/**
 * Cierra la ronda: precarga de la siguiente canción, o `final` si era la
 * última. Lo comparten `puntaje` (flujo normal) y `revelar` en entrenamiento
 * (que salta la votación, §4).
 */
function avanzarRonda(estado: EstadoMeloquiz, ahoraMs: number): Resultado<EstadoMeloquiz> {
  if (estado.ronda >= estado.rondasTotales) {
    return ok(
      entrarEnFase(
        {
          ...estado,
          rondaActual: null,
          ganadores: calcularGanadores(estado.jugadores, estado.puntajes),
        },
        "final",
        ahoraMs,
      ),
    );
  }
  const ronda = estado.ronda + 1;
  const cancionId = estado.ordenCanciones[ronda - 1];
  if (cancionId === undefined) {
    return error("POOL_INVALIDO", "no hay canción sorteada para la ronda siguiente");
  }
  const rondaActual = armarRonda(estado.pool, cancionId);
  if (rondaActual === null) {
    return error("POOL_INVALIDO", "no se pudo armar la ronda siguiente");
  }
  return ok(
    entrarEnFase(
      { ...estado, ronda, rondaActual, listos: [], votos: {} },
      "precarga",
      ahoraMs,
    ),
  );
}

// ── Creación de partida ─────────────────────────────────────────────────────

/**
 * Crea la partida: baraja el orden de canciones con el rng, arma la ronda 1 y
 * entra en `precarga` sellando `ahoraMs`. `rondas` por defecto = cantidad de
 * canciones del pool (§6).
 */
export function crearPartida(
  jugadores: readonly DatosJugador[],
  pool: PoolPartida,
  opciones: OpcionesMeloquiz,
  rng: GeneradorAleatorio,
  ahoraMs: number,
): Resultado<EstadoMeloquiz> {
  const entrenamiento = opciones.entrenamiento === true;
  const errJugadores = validarJugadores(jugadores, entrenamiento);
  if (errJugadores !== null) return { ok: false, error: errJugadores };

  const poolValido = validarPool(pool);
  if (!poolValido.ok) return poolValido;

  const disponibles = pool.canciones.length;
  const rondasTotales = opciones.rondas ?? disponibles;
  if (!Number.isInteger(rondasTotales) || rondasTotales < 1 || rondasTotales > disponibles) {
    return error(
      "RONDAS_INVALIDAS",
      `las rondas deben ser un entero entre 1 y ${disponibles} (canciones del pool)`,
    );
  }

  const duraciones: DuracionesFase = {
    ...REGLAS_MELOQUIZ.duraciones,
    ...(opciones.duraciones ?? {}),
  };

  const ordenCanciones = barajar(
    pool.canciones.map((c) => c.id),
    rng,
  ).slice(0, rondasTotales);

  const primera = ordenCanciones[0];
  if (primera === undefined) {
    return error("POOL_INVALIDO", "el pool quedó sin canciones que sortear");
  }
  const rondaActual = armarRonda(pool, primera);
  if (rondaActual === null) {
    return error("POOL_INVALIDO", "no se pudo armar la primera ronda");
  }

  const puntajes: Record<string, number> = {};
  for (const j of jugadores) puntajes[j.id] = 0;

  return ok({
    jugadores,
    pool,
    fase: "precarga",
    faseIniciadaEnMs: ahoraMs,
    duraciones,
    entrenamiento,
    ronda: 1,
    rondasTotales,
    ordenCanciones,
    rondaActual,
    puntajes,
    listos: [],
    votos: {},
    ganadores: [],
  });
}

// ── Reloj de fases ──────────────────────────────────────────────────────────

/**
 * Descriptor de la fase en curso para el reloj (SPIKE §6.2). `null` cuando la
 * partida terminó: no hay nada que temporizar. La `clave` incluye la ronda, así
 * el orquestador sabe re-armar el timer al cambiar de fase o de ronda, y NO lo
 * reinicia por acciones que ocurren dentro de la misma fase.
 */
export function faseTemporizada(estado: EstadoMeloquiz): FaseTemporizadaNucleo | null {
  if (estado.fase === "final") return null;
  return {
    clave: `${estado.ronda}:${estado.fase}`,
    duracionMs: estado.duraciones[estado.fase],
  };
}

/** ¿La partida terminó del todo? */
export function terminada(estado: EstadoMeloquiz): boolean {
  return estado.fase === "final";
}

// ── Acciones de jugador ─────────────────────────────────────────────────────

/**
 * Ack de precarga (§3.2): "ya tengo el archivo cargado y pauseado". Si ackean
 * TODOS, la fase cierra anticipadamente y arranca el clip. A quien no ackee lo
 * espera el timeout de la fase (§3.3), no la partida.
 */
export function marcarListo(
  estado: EstadoMeloquiz,
  jugadorId: string,
  ahoraMs: number,
): Resultado<EstadoMeloquiz> {
  if (estado.fase === "final") {
    return error("PARTIDA_TERMINADA", "la partida ya terminó");
  }
  if (estado.fase !== "precarga") {
    return error("FASE_INVALIDA", "solo se puede confirmar precarga en la fase de precarga");
  }
  if (!estado.jugadores.some((j) => j.id === jugadorId)) {
    return error("JUGADOR_DESCONOCIDO", "ese jugador no está en la partida");
  }
  if (estado.listos.includes(jugadorId)) {
    return error("YA_LISTO", "ya confirmaste la precarga de esta ronda");
  }
  const listos = [...estado.listos, jugadorId];
  const siguiente: EstadoMeloquiz = { ...estado, listos };
  if (listos.length === estado.jugadores.length) {
    return ok(entrarEnFase(siguiente, "clip", ahoraMs));
  }
  return ok(siguiente);
}

/**
 * Voto de un jugador (§5): un voto por ronda, por el JUGADOR que cree que ganó.
 * Auto-voto permitido. Si votan TODOS, la ventana se cierra de inmediato, se
 * computa la mayoría y se pasa a la tabla de puntos (cierre anticipado).
 */
export function votar(
  estado: EstadoMeloquiz,
  jugadorId: string,
  votadoId: string,
  ahoraMs: number,
): Resultado<EstadoMeloquiz> {
  if (estado.fase === "final") {
    return error("PARTIDA_TERMINADA", "la partida ya terminó");
  }
  if (estado.fase !== "voto") {
    return error("FASE_INVALIDA", "solo se puede votar en la fase de votación");
  }
  if (!estado.jugadores.some((j) => j.id === jugadorId)) {
    return error("JUGADOR_DESCONOCIDO", "ese jugador no está en la partida");
  }
  if (estado.votos[jugadorId] !== undefined) {
    return error("YA_VOTASTE", "ya votaste en esta ronda");
  }
  if (!estado.jugadores.some((j) => j.id === votadoId)) {
    return error("VOTADO_DESCONOCIDO", "ese jugador no está en la partida");
  }
  const votos = { ...estado.votos, [jugadorId]: votadoId };
  const siguiente: EstadoMeloquiz = { ...estado, votos };
  if (Object.keys(votos).length === estado.jugadores.length) {
    return ok(entrarEnFase({ ...siguiente, puntajes: aplicarPuntaje(siguiente) }, "puntaje", ahoraMs));
  }
  return ok(siguiente);
}

// ── Avance por reloj ────────────────────────────────────────────────────────

/**
 * Venció la fase en curso: la ÚNICA vía por la que avanza la partida además del
 * cierre anticipado de precarga y voto. El llamador decide cuándo (el reloj vive
 * fuera del núcleo); aquí solo se aplica la transición. `rng` queda en la firma
 * por el contrato del motor (SPIKE §6.2), aunque hoy nada se sortea al expirar.
 *
 *   precarga → clip     (se arranca sin los rezagados, §3.3)
 *   clip     → revelar  (primero la respuesta: el grupo necesita verla, §4)
 *   revelar  → voto     (o directo a la ronda siguiente en entrenamiento, §4)
 *   voto     → puntaje  (AQUÍ se computa la mayoría, §5; sin voto no aporta)
 *   puntaje  → precarga de la ronda siguiente, o `final`
 */
export function expirarFase(
  estado: EstadoMeloquiz,
  ahoraMs: number,
  rng: GeneradorAleatorio,
): Resultado<EstadoMeloquiz> {
  void rng;
  switch (estado.fase) {
    case "precarga":
      return ok(entrarEnFase(estado, "clip", ahoraMs));

    case "clip":
      return ok(entrarEnFase(estado, "revelar", ahoraMs));

    case "revelar":
      if (estado.entrenamiento) return avanzarRonda(estado, ahoraMs);
      return ok(entrarEnFase(estado, "voto", ahoraMs));

    case "voto":
      return ok(entrarEnFase({ ...estado, puntajes: aplicarPuntaje(estado) }, "puntaje", ahoraMs));

    case "puntaje":
      return avanzarRonda(estado, ahoraMs);

    case "final":
      return error("PARTIDA_TERMINADA", "la partida ya terminó");
  }
}

// ── Consultas ───────────────────────────────────────────────────────────────

/** Puntos acumulados de un jugador. */
export function puntosDe(estado: EstadoMeloquiz, jugadorId: string): number {
  return estado.puntajes[jugadorId] ?? 0;
}
