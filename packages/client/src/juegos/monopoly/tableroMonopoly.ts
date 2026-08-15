// Geometría pura del tablero cuadrado (40 celdas, perímetro clásico de
// Monopoly: 11 celdas por lado, esquinas compartidas). No decide reglas: solo
// traduce el índice 0..39 de `celdaEn`/`TABLERO_MONOPOLY` (monopoly-core) a
// coordenadas del mundo 3D.
//
// `Escena` (packages/client/src/escena/escena.ts) siempre arma un fieltro
// CIRCULAR por defecto de radio `radioMesa(2)` (~5.8), aunque Monopoly nunca
// llame a `ajustarMesa`. El tablero cuadrado tiene que ser lo bastante grande
// para taparlo por completo: el medio-lado se deriva de `radioMesa(2)` + un
// margen fijo, en vez de un número mágico suelto, para no depender de un
// valor que puede desalinearse si `dimensionesMesa.ts` cambia.

import { radioMesa } from "../../escena/dimensionesMesa.js";

const JUGADORES_FIELTRO_BASE = 2;
const MARGEN_SOBRE_FIELTRO = 1.5;

/** Medio-lado del tablero cuadrado: cubre el fieltro circular por defecto de `Escena`. */
export const MEDIO_LADO_TABLERO = radioMesa(JUGADORES_FIELTRO_BASE) + MARGEN_SOBRE_FIELTRO;
export const LADO_TABLERO = MEDIO_LADO_TABLERO * 2;

/** Celdas por lado del perímetro (incluye ambas esquinas de ese lado). */
const CELDAS_POR_LADO = 11;
/** Espaciado entre celdas contiguas de un mismo lado (para dimensionar mallas sin solaparse). */
export const PASO = LADO_TABLERO / (CELDAS_POR_LADO - 1);

export interface PosicionCelda {
  readonly x: number;
  readonly z: number;
}

/**
 * Centro de la celda `indice` (0..39) en el plano XZ. Lado 0: esquina Salida
 * (0) → Cárcel (10), borde "sur" (z positivo), recorrido de derecha a
 * izquierda; los siguientes 3 lados giran en sentido horario alrededor del
 * tablero.
 */
export function posicionCelda(indice: number): PosicionCelda {
  const i = ((indice % 40) + 40) % 40;
  const lado = Math.floor(i / 10);
  const p = i % 10;
  const m = MEDIO_LADO_TABLERO;
  switch (lado) {
    case 0:
      return { x: m - p * PASO, z: m };
    case 1:
      return { x: -m, z: m - p * PASO };
    case 2:
      return { x: -m + p * PASO, z: -m };
    default:
      return { x: m, z: -m + p * PASO };
  }
}

/**
 * Offset en abanico para varias fichas coexistiendo en la misma celda (no se
 * superponen visualmente). `slot` = índice entre 0 y `total-1`.
 */
export function offsetFichaEnCelda(slot: number, total: number): PosicionCelda {
  if (total <= 1) return { x: 0, z: 0 };
  const radio = 0.28;
  const angulo = (slot / total) * Math.PI * 2;
  return { x: Math.cos(angulo) * radio, z: Math.sin(angulo) * radio };
}
