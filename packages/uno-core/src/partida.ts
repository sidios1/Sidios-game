// Máquina de partida de UNO: funciones puras y deterministas sobre un estado
// inmutable (REGLAS_UNO.md). Aquí viven TODAS las reglas del juego; no se
// duplican en el servidor ni en el cliente. La aleatoriedad entra SIEMPRE como
// parámetro (`rng`): solo la reciben las transiciones que pueden rebarajar
// (robar, resolverAcumulado) y la creación de la partida.
//
// Esta versión (REGLAS_UNO.md): ronda completa con acumulación ILIMITADA de
// todos los "+" (cross-stacking +2↔+4), SIN canto de "UNO!" y SIN desafío al +4.

import { barajar, type GeneradorAleatorio } from "./aleatorio.js";
import type { Carta, Color } from "./carta.js";
import { COLORES, esComodin, incrementoMas, valorPuntos } from "./carta.js";
import { crearMazoCompleto } from "./mazo.js";

export interface JugadorUno {
  readonly id: string;
  readonly nombre: string;
}

/** Una carta robada que SÍ es jugable: el jugador debe jugarla o pasar (§Jugada). */
export interface RobadaPendiente {
  readonly jugadorId: string;
  readonly cartaId: string;
}

export interface EstadoUno {
  /** Asientos en orden fijo; el turno avanza sobre este arreglo según `direccion`. */
  readonly jugadores: readonly JugadorUno[];
  /** Cartas en mano por jugador (ocultas para los demás en la vista). */
  readonly manos: Readonly<Record<string, readonly Carta[]>>;
  /** Montón de robo; se roba desde el frente (`mazo[0]`). */
  readonly mazo: readonly Carta[];
  /** Descarte; la cima es `descarte[descarte.length - 1]`. */
  readonly descarte: readonly Carta[];
  /** Color vigente (lo fija la cima normal o el último comodín de la cadena). */
  readonly colorActivo: Color;
  /** Sentido de la rueda: 1 = horario, -1 = antihorario. */
  readonly direccion: 1 | -1;
  /** Índice del jugador en turno dentro de `jugadores`. */
  readonly turnoIdx: number;
  /** Total de "+" pendiente; 0 = sin cadena activa. */
  readonly acumuladoPendiente: number;
  /** Si no es null, el jugador en turno robó una carta jugable y debe jugarla o pasar. */
  readonly robadaPendiente: RobadaPendiente | null;
  readonly fase: "jugando" | "terminada";
  readonly ganadorId: string | null;
}

export type AccionUno =
  | { readonly tipo: "jugar"; readonly cartaId: string; readonly color?: Color }
  | { readonly tipo: "robar" }
  | { readonly tipo: "pasar" }
  | { readonly tipo: "resolverAcumulado" };

export type CodigoErrorUno =
  | "JUGADORES_INVALIDOS"
  | "MAZO_INSUFICIENTE"
  | "PARTIDA_TERMINADA"
  | "NO_ES_TU_TURNO"
  | "CARTA_NO_EN_MANO"
  | "JUGADA_ILEGAL"
  | "COLOR_REQUERIDO"
  | "COLOR_INVALIDO"
  | "NADA_QUE_RESOLVER"
  | "NO_HAY_ROBADA";

export interface ErrorUno {
  readonly codigo: CodigoErrorUno;
  readonly mensaje: string;
}

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: ErrorUno };

function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

function error<T>(codigo: CodigoErrorUno, mensaje: string): Resultado<T> {
  return { ok: false, error: { codigo, mensaje } };
}

// ── Helpers internos ────────────────────────────────────────────────────────

const CARTAS_INICIALES = 7;

function topeDescarte(estado: EstadoUno): Carta | null {
  return estado.descarte[estado.descarte.length - 1] ?? null;
}

/** Índice resultante de avanzar `pasos` en la dirección actual (rueda circular). */
function avanzarTurno(estado: EstadoUno, pasos: number): number {
  const n = estado.jugadores.length;
  return (((estado.turnoIdx + estado.direccion * pasos) % n) + n) % n;
}

function idEnTurno(estado: EstadoUno): string | undefined {
  return estado.jugadores[estado.turnoIdx]?.id;
}

/**
 * ¿La carta es jugable sobre la cima actual en contexto NORMAL (sin acumulador)?
 * Matchea color activo, número o símbolo; los comodines siempre son legales.
 */
function coincide(carta: Carta, estado: EstadoUno): boolean {
  if (esComodin(carta)) return true;
  if (carta.color === estado.colorActivo) return true;
  const cima = topeDescarte(estado);
  if (cima === null || esComodin(cima)) return false;
  if (carta.tipo === "numero" && cima.tipo === "numero") return carta.valor === cima.valor;
  if (carta.tipo !== "numero" && cima.tipo !== "numero") return carta.tipo === cima.tipo;
  return false;
}

/**
 * Roba UNA carta del frente del mazo; si el mazo está vacío, rebaraja el descarte
 * (menos la cima) con el `rng`. Devuelve la carta y los montones actualizados;
 * `carta` es null solo si no queda absolutamente nada que robar.
 */
function robarUna(
  mazo: readonly Carta[],
  descarte: readonly Carta[],
  rng: GeneradorAleatorio,
): { carta: Carta | null; mazo: readonly Carta[]; descarte: readonly Carta[] } {
  let m = mazo;
  let d = descarte;
  if (m.length === 0) {
    if (d.length <= 1) return { carta: null, mazo: m, descarte: d };
    const cima = d[d.length - 1];
    m = barajar(d.slice(0, d.length - 1), rng);
    d = cima === undefined ? [] : [cima];
  }
  const carta = m[0];
  if (carta === undefined) return { carta: null, mazo: m, descarte: d };
  return { carta, mazo: m.slice(1), descarte: d };
}

function validarJugadores(jugadores: readonly JugadorUno[]): ErrorUno | null {
  if (jugadores.length < 2 || jugadores.length > 10) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "se necesitan de 2 a 10 jugadores" };
  }
  const ids = jugadores.map((j) => j.id);
  if (ids.some((id) => id.length === 0)) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "hay un id de jugador vacío" };
  }
  if (new Set(ids).size !== ids.length) {
    return { codigo: "JUGADORES_INVALIDOS", mensaje: "hay ids de jugador duplicados" };
  }
  return null;
}

/**
 * Voltea la carta inicial: la primera del montón que NO sea comodín. Los Wild/+4
 * encontrados antes se reinsertan al fondo del mazo (REGLAS_UNO.md, decisión de
 * casa) y se sigue volteando el tope.
 */
function voltearInicial(cartas: readonly Carta[]): {
  inicial: Carta | undefined;
  mazo: readonly Carta[];
} {
  const m = [...cartas];
  let intentos = m.length;
  while (m.length > 0 && intentos-- > 0) {
    const c = m.shift();
    if (c === undefined) break;
    if (esComodin(c)) {
      m.push(c);
      continue;
    }
    return { inicial: c, mazo: m };
  }
  return { inicial: undefined, mazo: m };
}

/** Reparte 7 por jugador (en bloque), voltea la inicial y aplica su efecto. */
function montar(
  jugadores: readonly JugadorUno[],
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoUno> {
  const n = jugadores.length;
  if (mazoOrdenado.length < n * CARTAS_INICIALES + 1) {
    return error("MAZO_INSUFICIENTE", "no hay cartas suficientes para repartir");
  }
  const manos: Record<string, readonly Carta[]> = {};
  jugadores.forEach((j, i) => {
    manos[j.id] = mazoOrdenado.slice(i * CARTAS_INICIALES, i * CARTAS_INICIALES + CARTAS_INICIALES);
  });
  const resto = mazoOrdenado.slice(n * CARTAS_INICIALES);
  const volteo = voltearInicial(resto);
  const inicial = volteo.inicial;
  if (inicial === undefined || esComodin(inicial)) {
    return error("MAZO_INSUFICIENTE", "no hay carta inicial válida en el mazo");
  }

  const base: EstadoUno = {
    jugadores: [...jugadores],
    manos,
    mazo: volteo.mazo,
    descarte: [inicial],
    colorActivo: inicial.color,
    direccion: 1,
    turnoIdx: 0,
    acumuladoPendiente: 0,
    robadaPendiente: null,
    fase: "jugando",
    ganadorId: null,
  };

  // Efecto de la carta inicial sobre el primer jugador (REGLAS_UNO.md).
  switch (inicial.tipo) {
    case "skip":
      return ok({ ...base, turnoIdx: avanzarTurno(base, 1) });
    case "reverse": {
      // Invierte la dirección y salta al jugador 0 (estilo UNO físico; con 2
      // jugadores equivale a Skip). Modelo unificado: invertir + avanzar uno.
      const direccion: 1 | -1 = -1;
      const conDir = { ...base, direccion };
      return ok({ ...conDir, turnoIdx: avanzarTurno(conDir, 1) });
    }
    case "mas2":
      return ok({ ...base, acumuladoPendiente: 2 });
    default:
      return ok(base); // número: juega el primero, sin efecto
  }
}

// ── Creación de partida ─────────────────────────────────────────────────────

/** Crea la partida barajando el mazo completo con el `rng` dado. */
export function crearPartida(
  jugadores: readonly JugadorUno[],
  rng: GeneradorAleatorio,
): Resultado<EstadoUno> {
  const err = validarJugadores(jugadores);
  if (err !== null) return { ok: false, error: err };
  return montar(jugadores, barajar(crearMazoCompleto(), rng));
}

/**
 * Variante determinista para tests: reparte el mazo dado TAL CUAL (sin barajar).
 * Reparte 7 por jugador en bloque (jugador 0 = primeras 7, etc.); la carta tras
 * las manos es la inicial, y el resto el montón de robo (frente = próxima robada).
 */
export function crearPartidaConMazo(
  jugadores: readonly JugadorUno[],
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoUno> {
  const err = validarJugadores(jugadores);
  if (err !== null) return { ok: false, error: err };
  return montar(jugadores, mazoOrdenado);
}

// ── Consultas ───────────────────────────────────────────────────────────────

/** Id del jugador en turno; null si la partida terminó. */
export function jugadorEnTurno(estado: EstadoUno): string | null {
  if (estado.fase === "terminada") return null;
  return idEnTurno(estado) ?? null;
}

/**
 * Acciones legales del jugador EN TURNO (cortesía para el HUD; el servidor
 * revalida). Vacío si la partida terminó o no es su turno. Las jugadas de carta
 * se listan sin color: el HUD pide el color al jugar un comodín.
 */
export function accionesLegales(estado: EstadoUno, jugadorId: string): readonly AccionUno[] {
  if (estado.fase === "terminada" || idEnTurno(estado) !== jugadorId) return [];
  const mano = estado.manos[jugadorId] ?? [];
  const acciones: AccionUno[] = [];

  if (estado.robadaPendiente !== null && estado.robadaPendiente.jugadorId === jugadorId) {
    acciones.push({ tipo: "jugar", cartaId: estado.robadaPendiente.cartaId });
    acciones.push({ tipo: "pasar" });
    return acciones;
  }
  if (estado.acumuladoPendiente > 0) {
    for (const c of mano) if (incrementoMas(c) > 0) acciones.push({ tipo: "jugar", cartaId: c.id });
    acciones.push({ tipo: "resolverAcumulado" });
    return acciones;
  }
  for (const c of mano) if (coincide(c, estado)) acciones.push({ tipo: "jugar", cartaId: c.id });
  acciones.push({ tipo: "robar" });
  return acciones;
}

/** Puntaje de la ronda: el ganador suma el valor de las cartas rivales. */
export function puntajeRonda(estado: EstadoUno): { ganadorId: string; puntos: number } | null {
  if (estado.fase !== "terminada" || estado.ganadorId === null) return null;
  let puntos = 0;
  for (const j of estado.jugadores) {
    if (j.id === estado.ganadorId) continue;
    for (const c of estado.manos[j.id] ?? []) puntos += valorPuntos(c);
  }
  return { ganadorId: estado.ganadorId, puntos };
}

// ── Acciones ────────────────────────────────────────────────────────────────

/**
 * Juega una carta de la mano. El color solo se usa (y es obligatorio) al jugar un
 * comodín. Bajo acumulador pendiente solo se admite apilar otro "+"; tras robar
 * una carta jugable solo se admite jugar ESA carta. Vaciar la mano termina la ronda.
 */
export function jugar(
  estado: EstadoUno,
  jugadorId: string,
  cartaId: string,
  color?: Color,
): Resultado<EstadoUno> {
  if (estado.fase === "terminada") return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (idEnTurno(estado) !== jugadorId) return error("NO_ES_TU_TURNO", "no es tu turno");

  const mano = estado.manos[jugadorId] ?? [];
  const carta = mano.find((c) => c.id === cartaId);
  if (carta === undefined) return error("CARTA_NO_EN_MANO", "no tienes esa carta");

  // Legalidad según contexto.
  if (estado.robadaPendiente !== null) {
    if (estado.robadaPendiente.jugadorId !== jugadorId || estado.robadaPendiente.cartaId !== cartaId) {
      return error("JUGADA_ILEGAL", "solo puedes jugar la carta que robaste o pasar");
    }
    if (!coincide(carta, estado)) return error("JUGADA_ILEGAL", "esa carta no coincide con la cima");
  } else if (estado.acumuladoPendiente > 0) {
    if (incrementoMas(carta) === 0) {
      return error("JUGADA_ILEGAL", "bajo acumulador solo puedes apilar un + o robar el acumulado");
    }
  } else if (!coincide(carta, estado)) {
    return error("JUGADA_ILEGAL", "esa carta no coincide con la cima");
  }

  // Color del comodín (lo elige el jugador, no es aleatorio).
  let nuevoColor: Color;
  if (esComodin(carta)) {
    if (color === undefined) return error("COLOR_REQUERIDO", "debes elegir color al jugar un comodín");
    if (!COLORES.includes(color)) return error("COLOR_INVALIDO", "color inválido");
    nuevoColor = color;
  } else {
    nuevoColor = carta.color;
  }

  const nuevaMano = mano.filter((c) => c.id !== cartaId);
  const manos = { ...estado.manos, [jugadorId]: nuevaMano };
  const descarte = [...estado.descarte, carta];

  // Fin de ronda al vaciar la mano.
  if (nuevaMano.length === 0) {
    return ok({
      ...estado,
      manos,
      descarte,
      colorActivo: nuevoColor,
      acumuladoPendiente: 0,
      robadaPendiente: null,
      fase: "terminada",
      ganadorId: jugadorId,
    });
  }

  // Dirección (Reverse) y cuántos pasos avanza el turno.
  let direccion = estado.direccion;
  let pasos = 1;
  if (carta.tipo === "reverse") {
    direccion = estado.direccion === 1 ? -1 : 1;
    pasos = estado.jugadores.length === 2 ? 2 : 1; // 2 jugadores: actúa como Skip
  } else if (carta.tipo === "skip") {
    pasos = 2;
  }

  const incremento = incrementoMas(carta);
  const conDireccion = { ...estado, direccion };
  return ok({
    ...estado,
    manos,
    descarte,
    colorActivo: nuevoColor,
    direccion,
    turnoIdx: avanzarTurno(conDireccion, pasos),
    acumuladoPendiente: incremento > 0 ? estado.acumuladoPendiente + incremento : 0,
    robadaPendiente: null,
  });
}

/**
 * Roba UNA carta (sin acumulador pendiente). Si la robada es jugable, el turno NO
 * avanza y queda como `robadaPendiente` (el jugador la juega o pasa); si no, pasa
 * el turno. Rebaraja el descarte si el mazo se agota (de ahí el `rng`).
 */
export function robar(
  estado: EstadoUno,
  jugadorId: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoUno> {
  if (estado.fase === "terminada") return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (idEnTurno(estado) !== jugadorId) return error("NO_ES_TU_TURNO", "no es tu turno");
  if (estado.robadaPendiente !== null) {
    return error("JUGADA_ILEGAL", "ya robaste: juega esa carta o pasa");
  }
  if (estado.acumuladoPendiente > 0) {
    return error("JUGADA_ILEGAL", "hay un acumulador: apila un + o resuélvelo");
  }

  const r = robarUna(estado.mazo, estado.descarte, rng);
  if (r.carta === null) {
    // No queda nada que robar: pasa el turno.
    return ok({ ...estado, turnoIdx: avanzarTurno(estado, 1) });
  }
  const mano = estado.manos[jugadorId] ?? [];
  const manos = { ...estado.manos, [jugadorId]: [...mano, r.carta] };
  const conMazo: EstadoUno = { ...estado, manos, mazo: r.mazo, descarte: r.descarte };

  if (coincide(r.carta, estado)) {
    return ok({ ...conMazo, robadaPendiente: { jugadorId, cartaId: r.carta.id } });
  }
  return ok({ ...conMazo, turnoIdx: avanzarTurno(estado, 1) });
}

/** Pasa el turno tras robar una carta jugable y decidir no jugarla. */
export function pasar(estado: EstadoUno, jugadorId: string): Resultado<EstadoUno> {
  if (estado.fase === "terminada") return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (idEnTurno(estado) !== jugadorId) return error("NO_ES_TU_TURNO", "no es tu turno");
  if (estado.robadaPendiente === null || estado.robadaPendiente.jugadorId !== jugadorId) {
    return error("NO_HAY_ROBADA", "solo puedes pasar tras robar una carta jugable");
  }
  return ok({ ...estado, robadaPendiente: null, turnoIdx: avanzarTurno(estado, 1) });
}

/**
 * Roba el total del acumulador pendiente, lo cierra y pierde el turno (avanza en
 * la dirección actual). Transición COMPARTIDA: la usará el `saltarTurno` del
 * ausente cuando el servidor integre UNO. Rebaraja si el mazo se agota.
 */
export function resolverAcumulado(
  estado: EstadoUno,
  jugadorId: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoUno> {
  if (estado.fase === "terminada") return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (idEnTurno(estado) !== jugadorId) return error("NO_ES_TU_TURNO", "no es tu turno");
  if (estado.acumuladoPendiente <= 0) return error("NADA_QUE_RESOLVER", "no hay acumulador que robar");

  let mazo = estado.mazo;
  let descarte = estado.descarte;
  const robadas: Carta[] = [];
  for (let i = 0; i < estado.acumuladoPendiente; i++) {
    const r = robarUna(mazo, descarte, rng);
    if (r.carta === null) break;
    robadas.push(r.carta);
    mazo = r.mazo;
    descarte = r.descarte;
  }
  const mano = estado.manos[jugadorId] ?? [];
  return ok({
    ...estado,
    manos: { ...estado.manos, [jugadorId]: [...mano, ...robadas] },
    mazo,
    descarte,
    acumuladoPendiente: 0,
    robadaPendiente: null,
    turnoIdx: avanzarTurno(estado, 1),
  });
}
