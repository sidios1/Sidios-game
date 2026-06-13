// Construcción de la propuesta para bajarse. Validación de CORTESÍA para la
// UI usando los validadores de carioca-core (cero reglas propias): el servidor
// revalida todo al recibir la intención `bajarse`.

import type {
  Carta,
  ContratoMano,
  PropuestaCombinacion,
  TipoCombinacion,
  Validacion,
} from "@juegos/carioca-core";
import {
  ESCALA,
  validarEscala,
  validarEscalaReal,
  validarEscalaSucia,
  validarTrio,
} from "@juegos/carioca-core";

export interface GrupoPropuesta {
  readonly tipo: TipoCombinacion;
  readonly cartaIds: readonly string[];
}

export type EstadoPropuesta = readonly GrupoPropuesta[];

export const PROPUESTA_VACIA: EstadoPropuesta = [];

export function agregarGrupo(
  propuesta: EstadoPropuesta,
  tipo: TipoCombinacion,
  cartaIds: readonly string[],
): EstadoPropuesta {
  return [...propuesta, { tipo, cartaIds }];
}

export function quitarGrupo(
  propuesta: EstadoPropuesta,
  indice: number,
): EstadoPropuesta {
  return propuesta.filter((_, i) => i !== indice);
}

/** Ids ya comprometidos en algún grupo (no seleccionables de nuevo). */
export function cartasComprometidas(
  propuesta: EstadoPropuesta,
): ReadonlySet<string> {
  return new Set(propuesta.flatMap((grupo) => grupo.cartaIds));
}

/** Quita de la propuesta los ids que ya no están en la mano (tras bajarse). */
export function podarPropuesta(
  propuesta: EstadoPropuesta,
  mano: readonly Carta[],
): EstadoPropuesta {
  const enMano = new Set(mano.map((c) => c.id));
  return propuesta.filter((grupo) => grupo.cartaIds.every((id) => enMano.has(id)));
}

function cartasDeIds(
  cartaIds: readonly string[],
  mano: readonly Carta[],
): readonly Carta[] | null {
  const porId = new Map(mano.map((c) => [c.id, c]));
  const cartas: Carta[] = [];
  for (const id of cartaIds) {
    const carta = porId.get(id);
    if (carta === undefined) return null;
    cartas.push(carta);
  }
  return cartas;
}

/** Longitud mínima de escala que pide el contrato (dato, no regla propia). */
function longitudMinEscala(contrato: ContratoMano): number {
  for (const requisito of contrato.requisitos) {
    if (requisito.tipo === "escala") return requisito.longitudMin;
  }
  return ESCALA.longitudMin;
}

export function validarGrupo(
  tipo: TipoCombinacion,
  cartaIds: readonly string[],
  mano: readonly Carta[],
  contrato: ContratoMano,
): Validacion {
  const cartas = cartasDeIds(cartaIds, mano);
  if (cartas === null) {
    return { valida: false, motivo: "hay cartas que ya no están en tu mano" };
  }
  const maxComodines = contrato.comodinesPorCombinacion;
  switch (tipo) {
    case "trio":
      return validarTrio(cartas, maxComodines);
    case "escala":
      return validarEscala(cartas, longitudMinEscala(contrato), maxComodines);
    case "escalaSucia":
      return validarEscalaSucia(cartas, maxComodines);
    case "escalaReal":
      return validarEscalaReal(cartas, maxComodines);
  }
}

export interface EvaluacionPropuesta {
  /** Cubre el contrato y todos los grupos son válidos: lista para enviar. */
  readonly completa: boolean;
  /** Qué le falta o sobra, para mostrar en el panel. */
  readonly motivos: readonly string[];
}

/** Tipos de combinación que el contrato exige, con su cantidad. */
export function requisitosDelContrato(
  contrato: ContratoMano,
): ReadonlyMap<TipoCombinacion, number> {
  const esperados = new Map<TipoCombinacion, number>();
  for (const requisito of contrato.requisitos) {
    const cantidad = "cantidad" in requisito ? requisito.cantidad : 1;
    esperados.set(requisito.tipo, (esperados.get(requisito.tipo) ?? 0) + cantidad);
  }
  return esperados;
}

export function evaluarPropuesta(
  propuesta: EstadoPropuesta,
  mano: readonly Carta[],
  contrato: ContratoMano,
): EvaluacionPropuesta {
  const motivos: string[] = [];
  propuesta.forEach((grupo, indice) => {
    const validacion = validarGrupo(grupo.tipo, grupo.cartaIds, mano, contrato);
    if (!validacion.valida) {
      motivos.push(`grupo ${indice + 1}: ${validacion.motivo}`);
    }
  });
  const esperados = requisitosDelContrato(contrato);
  const propuestos = new Map<TipoCombinacion, number>();
  for (const grupo of propuesta) {
    propuestos.set(grupo.tipo, (propuestos.get(grupo.tipo) ?? 0) + 1);
  }
  const tipos = new Set<TipoCombinacion>([...esperados.keys(), ...propuestos.keys()]);
  for (const tipo of tipos) {
    const esperado = esperados.get(tipo) ?? 0;
    const propuesto = propuestos.get(tipo) ?? 0;
    if (propuesto < esperado) {
      motivos.push(`falta(n) ${esperado - propuesto} ${nombreTipo(tipo)}`);
    } else if (propuesto > esperado) {
      motivos.push(`sobra(n) ${propuesto - esperado} ${nombreTipo(tipo)}`);
    }
  }
  return { completa: motivos.length === 0, motivos };
}

export function nombreTipo(tipo: TipoCombinacion): string {
  switch (tipo) {
    case "trio":
      return "trío";
    case "escala":
      return "escala";
    case "escalaSucia":
      return "escala sucia";
    case "escalaReal":
      return "escala real";
  }
}

/** Convierte la propuesta de la UI al formato del protocolo. */
export function aPropuestaProtocolo(
  propuesta: EstadoPropuesta,
): readonly PropuestaCombinacion[] {
  return propuesta.map((grupo) => ({ tipo: grupo.tipo, cartaIds: grupo.cartaIds }));
}
