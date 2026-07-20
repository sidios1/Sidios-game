// Misión alterna de TOCO (Rumble §3.3). Es ÚNICA Y FIJA: formar una escala sucia
// (del As al Rey, cualquier pinta, con un comodín permitido). Al formarla, su dueño
// gana la ronda. No hay generación aleatoria ni presupuesto de dificultad: §3.3
// retiró ese modelo (B2) por descalibrado en playtest.
//
// Vive en el SERVIDOR (no en rumble-core) porque se expresa con los primitivos de
// contrato de carioca-core, que rumble-core solo conoce por tipos.

import type { Carta, ContratoMano, PropuestaCombinacion } from "@juegos/carioca-core";
import { crearCartaNormal, crearComodin, PINTAS, VALORES } from "@juegos/carioca-core";

/** Nº de misión sentinela para la misión de TOCO (no es una mano de MANOS). */
export const NUMERO_MISION_TOCO = 99;

/**
 * La misión de TOCO. Misma forma que la mano 8 de §9 (escala sucia), con el número
 * sentinela y su propio nombre: `cierreAutomatico` obliga a bajar la escala completa
 * —las 13 cartas— así que cumplirla vacía la mano y el core cierra por su cuenta.
 *
 * El nombre es lo que el HUD muestra como objetivo de la ronda (la misión SUSTITUYE
 * al contrato en la vista de su dueño), de ahí el prefijo "TOCO ·".
 *
 * Diales de §3.3 si en playtest sale descalibrada: `{ tipo: "escalaReal" }` con
 * `comodinesPorCombinacion: 0` la endurece a escala limpia.
 */
export const MISION_TOCO: ContratoMano = {
  numero: NUMERO_MISION_TOCO,
  nombre: "TOCO · escala sucia",
  cartasRepartidas: 12,
  requisitos: [{ tipo: "escalaSucia" }],
  comodinesPorCombinacion: 1,
  cierreAutomatico: true,
};

/** Mano testigo que cumple la misión + su partición en combinaciones. */
export interface TestigoMision {
  readonly mano: readonly Carta[];
  readonly propuesta: readonly PropuestaCombinacion[];
}

/**
 * Construye una mano testigo que cumple la misión: la escala completa As→Rey con
 * las pintas mezcladas (la sucia las admite). Con `conComodin`, la carta de la
 * posición del 6 se reemplaza por un comodín flotante; el comodín es PERMITIDO,
 * no obligatorio, así que ambas variantes son válidas.
 */
export function armarTestigoToco(conComodin = true): TestigoMision {
  const POSICION_COMODIN = 5;
  const mano: Carta[] = [];
  for (let i = 0; i < VALORES.length; i++) {
    if (conComodin && i === POSICION_COMODIN) {
      mano.push(crearComodin(0));
      continue;
    }
    const valor = VALORES[i];
    const pinta = PINTAS[i % PINTAS.length];
    if (valor === undefined || pinta === undefined) continue;
    mano.push(crearCartaNormal(pinta, valor, `toco-${i}`));
  }
  return {
    mano,
    propuesta: [{ tipo: "escalaSucia", cartaIds: mano.map((c) => c.id) }],
  };
}
