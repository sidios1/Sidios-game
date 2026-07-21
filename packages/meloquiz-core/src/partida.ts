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
//  - Orden de fases (REGLAS §4, corregido): precarga → clip → voto → revelar →
//    puntaje. `revelar` es el reveal de la RESPUESTA, tras cerrar la votación.
//  - El avance de ronda NO usa esperandoContinuar/continuar (SPIKE §6.3): las
//    rondas avanzan dentro de la expiración de la fase `puntaje`.

import { barajar, type GeneradorAleatorio } from "./aleatorio.js";
import type { CancionPool, PoolPartida } from "./catalogo.js";
import { validarPool } from "./catalogo.js";
import { REGLAS_MELOQUIZ, type DuracionesFase } from "./reglas.js";
import { error, ok, type ErrorJuego, type Resultado } from "./resultado.js";

export interface DatosJugador {
  readonly id: string;
  readonly nombre: string;
}

/** Las fases de una ronda (§4); `final` es el estado terminal de la partida. */
export type ClaveFase = "precarga" | "clip" | "voto" | "revelar" | "puntaje" | "final";

/**
 * Una opción de respuesta. `id` es local a la ronda y NO es el id de la canción:
 * el jugador vota con este id.
 *
 * ⚠️ INVARIANTE DE SEGURIDAD: `cancionId` es campo INTERNO. Si las opciones
 * viajaran identificadas por el id de canción, bastaría compararlas con el
 * `pistaId` que la vista publica durante el clip para acertar siempre. La
 * proyección (vista.ts) nunca lo expone.
 */
export interface OpcionRonda {
  readonly id: string;
  readonly cancionId: string;
  readonly titulo: string;
}

/** La ronda en curso: qué suena y cuáles son las 4 opciones (§5). */
export interface RondaMeloquiz {
  readonly cancionId: string;
  readonly opciones: readonly OpcionRonda[];
  readonly opcionCorrectaId: string;
}

export interface EstadoMeloquiz {
  readonly jugadores: readonly DatosJugador[];
  /** El pool de la partida; material de las rondas. Nunca viaja en la vista. */
  readonly pool: PoolPartida;
  readonly fase: ClaveFase;
  /** Instante (ms) en que empezó la fase actual: el `ahoraMs` que nos pasaron. */
  readonly faseIniciadaEnMs: number;
  readonly duraciones: DuracionesFase;
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
  /** jugadorId → id de OPCIÓN votada, en la ronda en curso. */
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
   * Modo entrenamiento (§6): habilita la partida de UN jugador. Solo cambia el
   * rango de jugadores admitidos; fases, opciones y puntaje son los de siempre.
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

/**
 * Arma la ronda: la correcta + 3 distractores de OTRAS canciones del mismo pool
 * (§5), todo barajado. Los ids de opción se asignan DESPUÉS de mezclar, para que
 * la posición no filtre cuál es la correcta.
 */
function armarRonda(
  pool: PoolPartida,
  cancionId: string,
  ronda: number,
  rng: GeneradorAleatorio,
): RondaMeloquiz | null {
  const correcta = pool.canciones.find((c) => c.id === cancionId);
  if (correcta === undefined) return null;
  const otras = pool.canciones.filter((c) => c.id !== cancionId);
  const distractores = barajar(otras, rng).slice(0, REGLAS_MELOQUIZ.opcionesPorRonda - 1);
  const mezcladas: readonly CancionPool[] = barajar([correcta, ...distractores], rng);
  const opciones = mezcladas.map((c, i) => ({
    id: `${ronda}-op${i + 1}`,
    cancionId: c.id,
    titulo: c.titulo,
  }));
  const correctaEnMezcla = opciones.find((o) => o.cancionId === cancionId);
  if (correctaEnMezcla === undefined) return null;
  return { cancionId, opciones, opcionCorrectaId: correctaEnMezcla.id };
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
 * Aplica el puntaje de la ronda: +1 a cada jugador cuyo voto apunte a la opción
 * correcta (§5, puntaje PLANO). Si nadie acertó, nadie suma.
 */
function aplicarPuntaje(estado: EstadoMeloquiz): Readonly<Record<string, number>> {
  const ronda = estado.rondaActual;
  if (ronda === null) return estado.puntajes;
  const puntajes: Record<string, number> = { ...estado.puntajes };
  for (const jugador of estado.jugadores) {
    if (estado.votos[jugador.id] === ronda.opcionCorrectaId) {
      puntajes[jugador.id] = (puntajes[jugador.id] ?? 0) + REGLAS_MELOQUIZ.puntosPorAcierto;
    }
  }
  return puntajes;
}

/**
 * Ganadores: todos los que empatan en el puntaje máximo (§6, empate compartido).
 * Si nadie acertó nunca, todos empatan en 0 y todos son ganadores.
 */
function calcularGanadores(
  jugadores: readonly DatosJugador[],
  puntajes: Readonly<Record<string, number>>,
): readonly string[] {
  const puntosDe = (id: string): number => puntajes[id] ?? 0;
  const maximo = Math.max(...jugadores.map((j) => puntosDe(j.id)));
  return jugadores.filter((j) => puntosDe(j.id) === maximo).map((j) => j.id);
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
  const errJugadores = validarJugadores(jugadores, opciones.entrenamiento === true);
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
  const rondaActual = armarRonda(pool, primera, 1, rng);
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
 * Voto de un jugador (§5): un voto por ronda, por id de OPCIÓN. Si votan TODOS,
 * la ventana se cierra de inmediato y se pasa a revelar (cierre anticipado).
 */
export function votar(
  estado: EstadoMeloquiz,
  jugadorId: string,
  opcionId: string,
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
  const ronda = estado.rondaActual;
  if (ronda === null || !ronda.opciones.some((o) => o.id === opcionId)) {
    return error("OPCION_DESCONOCIDA", "esa opción no existe en esta ronda");
  }
  const votos = { ...estado.votos, [jugadorId]: opcionId };
  const siguiente: EstadoMeloquiz = { ...estado, votos };
  if (Object.keys(votos).length === estado.jugadores.length) {
    return ok(entrarEnFase(siguiente, "revelar", ahoraMs));
  }
  return ok(siguiente);
}

// ── Avance por reloj ────────────────────────────────────────────────────────

/**
 * Venció la fase en curso: la ÚNICA vía por la que avanza la partida además del
 * cierre anticipado de precarga y voto. El llamador decide cuándo (el reloj vive
 * fuera del núcleo); aquí solo se aplica la transición.
 *
 *   precarga → clip     (se arranca sin los rezagados, §3.3)
 *   clip     → voto
 *   voto     → revelar  (los que no votaron se quedan sin punto)
 *   revelar  → puntaje  (AQUÍ se aplica el marcador, §5)
 *   puntaje  → precarga de la ronda siguiente, o `final`
 */
export function expirarFase(
  estado: EstadoMeloquiz,
  ahoraMs: number,
  rng: GeneradorAleatorio,
): Resultado<EstadoMeloquiz> {
  switch (estado.fase) {
    case "precarga":
      return ok(entrarEnFase(estado, "clip", ahoraMs));

    case "clip":
      return ok(entrarEnFase(estado, "voto", ahoraMs));

    case "voto":
      return ok(entrarEnFase(estado, "revelar", ahoraMs));

    case "revelar":
      return ok(entrarEnFase({ ...estado, puntajes: aplicarPuntaje(estado) }, "puntaje", ahoraMs));

    case "puntaje": {
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
      const rondaActual = armarRonda(estado.pool, cancionId, ronda, rng);
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

    case "final":
      return error("PARTIDA_TERMINADA", "la partida ya terminó");
  }
}

// ── Consultas ───────────────────────────────────────────────────────────────

/** ¿Acertó este jugador en la ronda en curso? Para la vista, a partir de revelar. */
export function acerto(estado: EstadoMeloquiz, jugadorId: string): boolean {
  const ronda = estado.rondaActual;
  if (ronda === null) return false;
  return estado.votos[jugadorId] === ronda.opcionCorrectaId;
}

/** Puntos acumulados de un jugador. */
export function puntosDe(estado: EstadoMeloquiz, jugadorId: string): number {
  return estado.puntajes[jugadorId] ?? 0;
}
