// Validadores de combinaciones y contratos (REGLAS_CARIOCA.md §2, §3 y §9).
// Las escalas se validan en el ORDEN PROPUESTO por el jugador (ascendente),
// tal como se colocan las cartas sobre la mesa.

import type {
  Carta,
  CartaComodin,
  CartaComodinPinta,
  CartaNormal,
  ValorCarta,
} from "./carta.js";
import { describirCarta, esComodin, esComodinDePinta, VALORES } from "./carta.js";
import type { ContratoMano } from "./contratos.js";
import { ESCALA, TRIO } from "./contratos.js";

export type TipoCombinacion = "trio" | "escala" | "escalaSucia" | "escalaReal";

export interface Combinacion {
  readonly tipo: TipoCombinacion;
  readonly cartas: readonly Carta[];
}

export type ExtremoEscala = "inicio" | "fin";

export type Validacion =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: string };

const VALIDA: Validacion = { valida: true };

function invalida(motivo: string): Validacion {
  return { valida: false, motivo };
}

/** Las escalas sucia y real van del As al Rey: una posición por valor (§2). */
const LONGITUD_ESCALA_COMPLETA = VALORES.length;

export function contarComodines(cartas: readonly Carta[]): number {
  return cartas.filter(esComodin).length;
}

/** Cuenta comodines-de-pinta (Rumble/GUASON); no cuentan como comodín normal. */
export function contarComodinesDePinta(cartas: readonly Carta[]): number {
  return cartas.filter(esComodinDePinta).length;
}

/**
 * ¿Actúa esta carta como comodín flotante dentro de una combinación? Tanto el
 * comodín normal como el comodín-de-pinta toman su valor de la posición y no fijan
 * número/pinta por sí mismos (la restricción de pinta del comodín-de-pinta se valida
 * aparte, contra la pinta de la escala).
 */
function esComodinFlotante(
  carta: Carta,
): carta is CartaComodin | CartaComodinPinta {
  return carta.tipo === "comodin" || carta.tipo === "comodinPinta";
}

function cartasNormales(cartas: readonly Carta[]): readonly CartaNormal[] {
  return cartas.filter((carta): carta is CartaNormal => carta.tipo === "normal");
}

function mismaPinta(cartas: readonly CartaNormal[]): boolean {
  const primera = cartas[0];
  return primera === undefined || cartas.every((c) => c.pinta === primera.pinta);
}

/**
 * Valor que ocupa una posición desplazada respecto de un valor base.
 * Con As puente la secuencia es circular (…Q-K-A-2-3…); sin él, devuelve
 * null al salirse del rango A..K.
 */
export function valorDesplazado(
  base: ValorCarta,
  desplazamiento: number,
): ValorCarta | null {
  const n = VALORES.length;
  if (ESCALA.asPuente) {
    const indice = (((base - 1 + desplazamiento) % n) + n) % n;
    return VALORES[indice] ?? null;
  }
  const indice = base - 1 + desplazamiento;
  if (indice < 0 || indice >= n) return null;
  return VALORES[indice] ?? null;
}

/**
 * Valor que representa cada posición de una escala propuesta, anclando en la
 * primera carta normal (los comodines toman el valor de su posición).
 * Devuelve null si no hay ancla o la secuencia se sale del rango permitido.
 */
export function valoresDeEscala(
  cartas: readonly Carta[],
): readonly ValorCarta[] | null {
  const indiceAncla = cartas.findIndex((carta) => carta.tipo === "normal");
  const ancla = cartas[indiceAncla];
  if (ancla === undefined || ancla.tipo !== "normal") return null;
  const valores: ValorCarta[] = [];
  for (let i = 0; i < cartas.length; i++) {
    const valor = valorDesplazado(ancla.valor, i - indiceAncla);
    if (valor === null) return null;
    valores.push(valor);
  }
  return valores;
}

/** Trío: 3+ cartas del mismo número, cualquier pinta (§2). */
export function validarTrio(
  cartas: readonly Carta[],
  maxComodines: number,
): Validacion {
  if (cartas.length < TRIO.longitudMin) {
    return invalida(`un trío necesita al menos ${TRIO.longitudMin} cartas`);
  }
  if (contarComodines(cartas) > maxComodines) {
    return invalida(`máximo ${maxComodines} comodín(es) por combinación`);
  }
  // Comodín-de-pinta (Rumble/GUASON): actúa como comodín en el trío (aporta una
  // carta de su pinta con el número del trío). Máx 1 por combinación, aparte del
  // tope de comodines normales.
  if (contarComodinesDePinta(cartas) > 1) {
    return invalida("máximo un comodín de pinta por combinación");
  }
  const normales = cartasNormales(cartas);
  const primera = normales[0];
  if (primera === undefined) {
    return invalida("un trío necesita al menos una carta normal");
  }
  if (!normales.every((c) => c.valor === primera.valor)) {
    return invalida("todas las cartas de un trío deben tener el mismo número");
  }
  return VALIDA;
}

/** Escala: 4+ consecutivas de la misma pinta, As puente (§2). */
export function validarEscala(
  cartas: readonly Carta[],
  longitudMin: number,
  maxComodines: number,
): Validacion {
  if (cartas.length < longitudMin) {
    return invalida(`una escala necesita al menos ${longitudMin} cartas`);
  }
  if (cartas.length > LONGITUD_ESCALA_COMPLETA) {
    return invalida(
      `una escala no puede superar ${LONGITUD_ESCALA_COMPLETA} cartas`,
    );
  }
  if (contarComodines(cartas) > maxComodines) {
    return invalida(`máximo ${maxComodines} comodín(es) por combinación`);
  }
  if (contarComodinesDePinta(cartas) > 1) {
    return invalida("máximo un comodín de pinta por combinación");
  }
  const normales = cartasNormales(cartas);
  if (normales.length === 0) {
    return invalida("una escala necesita al menos una carta normal");
  }
  if (!mismaPinta(normales)) {
    return invalida("todas las cartas de una escala deben ser de la misma pinta");
  }
  // Comodín-de-pinta (Rumble/GUASON): solo sirve en escalas de SU pinta.
  const pintaEscala = normales[0]?.pinta;
  for (const carta of cartas) {
    if (carta.tipo === "comodinPinta" && carta.pinta !== pintaEscala) {
      return invalida("el comodín de pinta no corresponde a la pinta de la escala");
    }
  }
  const valores = valoresDeEscala(cartas);
  if (valores === null) {
    return invalida("las cartas no forman una secuencia válida");
  }
  for (let i = 0; i < cartas.length; i++) {
    const carta = cartas[i];
    if (carta === undefined || esComodinFlotante(carta)) continue;
    if (carta.valor !== valores[i]) {
      return invalida(
        `las cartas no son consecutivas: ${describirCarta(carta)} rompe la secuencia`,
      );
    }
  }
  return VALIDA;
}

/** Escala sucia: 13 cartas del As al Rey en orden, cualquier pinta (§2). */
export function validarEscalaSucia(
  cartas: readonly Carta[],
  maxComodines: number,
): Validacion {
  if (cartas.length !== LONGITUD_ESCALA_COMPLETA) {
    return invalida(
      `la escala sucia usa exactamente ${LONGITUD_ESCALA_COMPLETA} cartas, del As al Rey`,
    );
  }
  if (contarComodines(cartas) > maxComodines) {
    return invalida(`máximo ${maxComodines} comodín(es) por combinación`);
  }
  if (contarComodinesDePinta(cartas) > 1) {
    return invalida("máximo un comodín de pinta por combinación");
  }
  for (let i = 0; i < cartas.length; i++) {
    const carta = cartas[i];
    if (carta === undefined || esComodinFlotante(carta)) continue;
    if (carta.valor !== VALORES[i]) {
      return invalida(
        `la escala debe ir del As al Rey en orden: ${describirCarta(carta)} está fuera de lugar`,
      );
    }
  }
  return VALIDA;
}

/** Escala real: como la sucia pero de una sola pinta y sin comodín (§2). */
export function validarEscalaReal(
  cartas: readonly Carta[],
  maxComodines: number,
): Validacion {
  const comoSucia = validarEscalaSucia(cartas, maxComodines);
  if (!comoSucia.valida) return comoSucia;
  // La escala real no admite comodín de NINGÚN tipo (§2 + Rumble/GUASON).
  if (contarComodinesDePinta(cartas) > 0) {
    return invalida("la escala real no admite comodines de pinta");
  }
  if (!mismaPinta(cartasNormales(cartas))) {
    return invalida("la escala real exige una sola pinta");
  }
  return VALIDA;
}

function validarCombinacion(
  combinacion: Combinacion,
  contrato: ContratoMano,
  longitudMinEscala: number,
): Validacion {
  switch (combinacion.tipo) {
    case "trio":
      return validarTrio(combinacion.cartas, contrato.comodinesPorCombinacion);
    case "escala":
      return validarEscala(
        combinacion.cartas,
        longitudMinEscala,
        contrato.comodinesPorCombinacion,
      );
    case "escalaSucia":
      return validarEscalaSucia(
        combinacion.cartas,
        contrato.comodinesPorCombinacion,
      );
    case "escalaReal":
      return validarEscalaReal(
        combinacion.cartas,
        contrato.comodinesPorCombinacion,
      );
  }
}

/**
 * Cumplimiento EXACTO del contrato de la mano (§4): ni más ni menos
 * combinaciones que las que piden sus requisitos, todas válidas.
 */
export function validarContrato(
  contrato: ContratoMano,
  propuesta: readonly Combinacion[],
): Validacion {
  const esperadas = new Map<TipoCombinacion, number>();
  const longitudesMin = new Map<TipoCombinacion, number>();
  for (const requisito of contrato.requisitos) {
    const cantidad = "cantidad" in requisito ? requisito.cantidad : 1;
    esperadas.set(requisito.tipo, (esperadas.get(requisito.tipo) ?? 0) + cantidad);
    if (requisito.tipo === "escala") {
      longitudesMin.set(requisito.tipo, requisito.longitudMin);
    }
  }
  const propuestas = new Map<TipoCombinacion, number>();
  for (const combinacion of propuesta) {
    propuestas.set(combinacion.tipo, (propuestas.get(combinacion.tipo) ?? 0) + 1);
  }
  const tipos = new Set<TipoCombinacion>([
    ...esperadas.keys(),
    ...propuestas.keys(),
  ]);
  for (const tipo of tipos) {
    const esperado = esperadas.get(tipo) ?? 0;
    const propuesto = propuestas.get(tipo) ?? 0;
    if (esperado !== propuesto) {
      return invalida(
        `la mano "${contrato.nombre}" exige exactamente ${esperado} combinación(es) de tipo ${tipo} y se propusieron ${propuesto}`,
      );
    }
  }
  for (const combinacion of propuesta) {
    const resultado = validarCombinacion(
      combinacion,
      contrato,
      longitudesMin.get("escala") ?? ESCALA.longitudMin,
    );
    if (!resultado.valida) return resultado;
  }
  return VALIDA;
}

/** Valor (número) que representa un trío, según sus cartas normales. */
export function valorDeTrio(cartas: readonly Carta[]): ValorCarta | null {
  const primera = cartasNormales(cartas)[0];
  return primera === undefined ? null : primera.valor;
}

/**
 * Intenta extender una escala con una carta por uno de sus extremos
 * (para pegar, §6). Devuelve las cartas resultantes o null si no calza.
 * No controla el límite de comodines: eso depende del contrato de la mano.
 */
export function extenderEscala(
  cartas: readonly Carta[],
  carta: Carta,
  extremo?: ExtremoEscala,
): Carta[] | null {
  if (cartas.length >= LONGITUD_ESCALA_COMPLETA) return null;
  const valores = valoresDeEscala(cartas);
  if (valores === null) return null;
  const primero = valores[0];
  const ultimo = valores[valores.length - 1];
  if (primero === undefined || ultimo === undefined) return null;
  const valorInicio = valorDesplazado(primero, -1);
  const valorFin = valorDesplazado(ultimo, 1);
  if (carta.tipo === "comodin") {
    const lado = extremo ?? "fin";
    if (lado === "fin") {
      return valorFin === null ? null : [...cartas, carta];
    }
    return valorInicio === null ? null : [carta, ...cartas];
  }
  // Comodín-de-pinta (Rumble/GUASON): extiende como comodín, pero solo si su pinta
  // coincide con la de la escala.
  if (carta.tipo === "comodinPinta") {
    const pintaEscala = cartasNormales(cartas)[0]?.pinta;
    if (pintaEscala !== undefined && carta.pinta !== pintaEscala) return null;
    const lado = extremo ?? "fin";
    if (lado === "fin") {
      return valorFin === null ? null : [...cartas, carta];
    }
    return valorInicio === null ? null : [carta, ...cartas];
  }
  const primeraNormal = cartasNormales(cartas)[0];
  if (primeraNormal !== undefined && carta.pinta !== primeraNormal.pinta) {
    return null;
  }
  const lados: readonly ExtremoEscala[] =
    extremo === undefined ? ["fin", "inicio"] : [extremo];
  for (const lado of lados) {
    if (lado === "fin" && valorFin !== null && carta.valor === valorFin) {
      return [...cartas, carta];
    }
    if (lado === "inicio" && valorInicio !== null && carta.valor === valorInicio) {
      return [carta, ...cartas];
    }
  }
  return null;
}
