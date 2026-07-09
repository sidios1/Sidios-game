// Apoyo para tests deterministas: fábricas de cartas con ids únicos y dos
// constructores de partida sin barajar. NO es parte de la API de juego; vive
// aquí para que los tests armen manos/montones exactos.

import type { Carta, Color, Comodin, Simbolo, Valor } from "./carta.js";
import type { EstadoUno, JugadorUno, RobadaPendiente } from "./partida.js";

let secuencia = 0;

function nuevoId(prefijo: string): string {
  return `${prefijo}#${secuencia++}`;
}

/** Carta de número con id único. */
export function num(color: Color, valor: Valor): Carta {
  return { id: nuevoId(`${color}-${valor}`), color, tipo: "numero", valor };
}

/** Carta de acción con color (skip/reverse/mas2) con id único. */
export function simbolo(color: Color, tipo: Simbolo): Carta {
  return { id: nuevoId(`${color}-${tipo}`), color, tipo };
}

/** Comodín (wild/mas4) con id único. */
export function comodin(tipo: Comodin): Carta {
  return { id: nuevoId(tipo), tipo };
}

// ── Mazo armado para crearPartidaConMazo ─────────────────────────────────────

export interface EspecMazo {
  /** Una mano por jugador; cada una DEBE tener 7 cartas (reparto en bloque). */
  readonly manos: readonly (readonly Carta[])[];
  /** La carta que se voltea al descarte (o el primer comodín a re-voltear). */
  readonly inicial: Carta;
  /** Montón de robo, frente = próxima robada. */
  readonly robos?: readonly Carta[];
}

/**
 * Aplana una especificación al arreglo `mazoOrdenado` que espera
 * `crearPartidaConMazo`: [manos en bloque][inicial][robos].
 */
export function mazoDesde(espec: EspecMazo): Carta[] {
  const cartas: Carta[] = [];
  for (const mano of espec.manos) cartas.push(...mano);
  cartas.push(espec.inicial);
  if (espec.robos !== undefined) cartas.push(...espec.robos);
  return cartas;
}

// ── Estado armado directamente (tests de transiciones puntuales) ──────────────

export interface EspecEstado {
  readonly jugadores?: readonly JugadorUno[];
  readonly manos: Readonly<Record<string, readonly Carta[]>>;
  readonly mazo?: readonly Carta[];
  readonly descarte: readonly Carta[];
  readonly colorActivo: Color;
  readonly direccion?: 1 | -1;
  readonly turnoIdx?: number;
  readonly acumuladoPendiente?: number;
  readonly robadaPendiente?: RobadaPendiente | null;
}

/** Monta un EstadoUno "jugando" a partir de una especificación parcial. */
export function estadoDePrueba(espec: EspecEstado): EstadoUno {
  const jugadores =
    espec.jugadores ?? Object.keys(espec.manos).map((id) => ({ id, nombre: id }));
  return {
    jugadores,
    manos: espec.manos,
    mazo: espec.mazo ?? [],
    descarte: espec.descarte,
    colorActivo: espec.colorActivo,
    direccion: espec.direccion ?? 1,
    turnoIdx: espec.turnoIdx ?? 0,
    acumuladoPendiente: espec.acumuladoPendiente ?? 0,
    robadaPendiente: espec.robadaPendiente ?? null,
    fase: "jugando",
    ganadorId: null,
  };
}

/** Saca el valor de un Resultado ok en tests; lanza si fue error. */
export function exito<T>(
  r: { ok: true; valor: T } | { ok: false; error: { codigo: string; mensaje: string } },
): T {
  if (!r.ok) throw new Error(`se esperaba ok pero fue error: ${r.error.codigo} (${r.error.mensaje})`);
  return r.valor;
}
