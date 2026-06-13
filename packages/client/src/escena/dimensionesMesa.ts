// Fuente única de las dimensiones que dependen del número de jugadores:
// radio del fieltro, anillo de asientos y posición de la cámara. La consumen
// tanto la geometría (escena.ts) como el layout (disposicion.ts), de modo que
// la mesa crece de forma coherente cuando entran más jugadores.
//
// Solo calcula tamaños: no toca Three ni el DOM.

/** Radio del fieltro con la mesa "base" (2-4 jugadores). */
export const RADIO_MESA_BASE = 8.2;

/**
 * Cuánto crece la mesa según el número de jugadores. 1 hasta 4 jugadores;
 * a partir de ahí sube suave (8 jugadores ≈ 1.41) para que asientos y bajadas
 * no se amontonen.
 */
export function factorEscala(numJugadores: number): number {
  return Math.max(1, Math.sqrt(Math.max(numJugadores, 1) / 4));
}

/** Radio del fieltro para `numJugadores`. */
export function radioMesa(numJugadores: number): number {
  return RADIO_MESA_BASE * factorEscala(numJugadores);
}

/** Radio del anillo de asientos: justo FUERA del borde del fieltro. */
export function radioAsientos(numJugadores: number): number {
  return radioMesa(numJugadores) + 0.7;
}

export interface VistaCamara {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly miraX: number;
  readonly miraY: number;
  readonly miraZ: number;
}

/** Posición/orientación de la cámara para que entre la mesa de `numJugadores`. */
export function camaraPara(numJugadores: number): VistaCamara {
  const f = factorEscala(numJugadores);
  return { x: 0, y: 7.6 * f, z: 8.6 * f, miraX: 0, miraY: 0, miraZ: 0.4 };
}

export interface PosicionAsiento {
  readonly x: number;
  readonly z: number;
  /** Ángulo del asiento medido desde el frente (donde estoy yo), en radianes. */
  readonly angulo: number;
}

/**
 * Reparte `total` asientos por igual en un anillo de radio `radio`, con el
 * asiento 0 al FRENTE (z máximo, junto a la cámara) y el resto girando
 * alrededor. `indiceGlobal` es la posición en ese reparto (0 = yo).
 */
export function posicionAsiento(
  indiceGlobal: number,
  total: number,
  radio: number,
): PosicionAsiento {
  const angulo = (indiceGlobal * 2 * Math.PI) / Math.max(total, 1);
  return {
    x: radio * Math.sin(angulo),
    z: radio * Math.cos(angulo),
    angulo,
  };
}
