// Votación final de §7: 12 categorías (una por slot de FORMACION_4_3_3),
// todos contra todos, voto libre y subjetivo, autovoto permitido. Gana quien
// se lleve más categorías; empate (en cualquier nivel) → se revota solo
// entre los empatados hasta que quede un ganador claro.
//
// Es un state machine PROPIO, separado de EstadoMonopoly: la votación final
// es una fase posterior al tablero (§1-§6) donde todos votan en paralelo, no
// por turno — no encaja en AccionMonopoly/aplicarAccion (acoplados al turno).
// Se construye a partir de los EquipoArmado de la fase de armado (armadoEquipo.ts).
//
// El algoritmo de conteo (mayoría simple sobre Record<votante, votado>, con
// `null`/sin ganador en empate) sigue el mismo criterio que
// meloquiz-core#resolverVotacion — reimplementado aquí (sin importar
// meloquiz-core: monopoly-core es standalone, sección "Dependencias
// permitidas" de CLAUDE.md) porque acá además hay que filtrar candidatos por
// categoría (slot vacío = no compite) y resolver 12 categorías, no 1.
//
// Empate (§7, última viñeta, ratificada):
// "Empate (en cualquier nivel — una categoría individual, o el resultado
// final entre categorías ganadas): se revota solo entre los empatados,
// repitiendo la votación las veces que haga falta hasta que quede un
// ganador claro. No hay 'nadie gana' ni límite de rondas de revotación —
// mismo mecanismo sin importar si son 2 empatados o más."
// Un solo mecanismo cubre ambos niveles: empate DENTRO de una categoría
// (resolverCategoria expone `empatados` cuando motivo === "empate") y
// empate del resultado FINAL entre categorías ganadas (resolverVotacionFinal
// ya expone `empatados`). El llamador alimenta ese subconjunto a
// resolverDesempate y repite con el subconjunto que esta devuelva hasta
// obtener `resuelto: true` — sin límite de rondas.

import { error, ok, type Resultado } from "./resultado.js";
import { FORMACION_4_3_3, type IdSlotFormacion } from "./formacion.js";
import type { EquipoArmado } from "./armadoEquipo.js";

export interface EstadoVotacionFinal {
  readonly equipos: Readonly<Record<string, EquipoArmado>>;
  readonly votantes: readonly string[];
  /** categoría -> (votanteId -> jugadorVotadoId = dueño del equipo elegido). */
  readonly votos: Readonly<Record<IdSlotFormacion, Readonly<Record<string, string>>>>;
}

export function crearVotacionFinal(
  equipos: readonly EquipoArmado[],
  votantes: readonly string[],
): EstadoVotacionFinal {
  const equiposPorId: Record<string, EquipoArmado> = {};
  for (const equipo of equipos) equiposPorId[equipo.jugadorId] = equipo;

  const votos = {} as Record<IdSlotFormacion, Readonly<Record<string, string>>>;
  for (const slot of FORMACION_4_3_3) votos[slot.id] = {};

  return { equipos: equiposPorId, votantes, votos };
}

/** Ids de jugadores cuyo equipo cubre `slotId` (slot vacío = no candidato). */
function candidatosDeCategoria(estado: EstadoVotacionFinal, slotId: IdSlotFormacion): readonly string[] {
  const candidatos: string[] = [];
  for (const jugadorId of Object.keys(estado.equipos)) {
    const equipo = estado.equipos[jugadorId];
    const asignacion = equipo?.asignaciones.find((a) => a.slotId === slotId);
    if (asignacion?.cartaId !== null && asignacion?.cartaId !== undefined) {
      candidatos.push(jugadorId);
    }
  }
  return candidatos;
}

export function votarCategoria(
  estado: EstadoVotacionFinal,
  votanteId: string,
  slotId: IdSlotFormacion,
  jugadorVotadoId: string,
): Resultado<EstadoVotacionFinal> {
  if (!estado.votantes.includes(votanteId)) {
    return error("VOTANTE_DESCONOCIDO", `"${votanteId}" no es un votante de esta votación`);
  }
  const slot = FORMACION_4_3_3.find((s) => s.id === slotId);
  if (slot === undefined) {
    return error("SLOT_INVALIDO", `"${slotId}" no es un slot de la formación 4-3-3`);
  }
  const candidatos = candidatosDeCategoria(estado, slotId);
  if (!candidatos.includes(jugadorVotadoId)) {
    return error(
      "CATEGORIA_SIN_CANDIDATOS",
      `"${jugadorVotadoId}" no tiene esa categoría cubierta (slot vacío o desconocido)`,
    );
  }

  return ok({
    ...estado,
    votos: {
      ...estado.votos,
      [slotId]: { ...estado.votos[slotId], [votanteId]: jugadorVotadoId },
    },
  });
}

export type ResultadoCategoria =
  | { readonly estado: "resuelta"; readonly conteos: Readonly<Record<string, number>>; readonly ganadorId: string }
  | {
      readonly estado: "sinGanador";
      readonly conteos: Readonly<Record<string, number>>;
      readonly motivo: "sinCandidatos" | "nadieVoto";
    }
  | {
      readonly estado: "sinGanador";
      readonly conteos: Readonly<Record<string, number>>;
      readonly motivo: "empate";
      readonly empatados: readonly string[];
    };

export function resolverCategoria(estado: EstadoVotacionFinal, slotId: IdSlotFormacion): ResultadoCategoria {
  const candidatos = candidatosDeCategoria(estado, slotId);
  const conteos: Record<string, number> = {};
  for (const c of candidatos) conteos[c] = 0;

  if (candidatos.length === 0) {
    return { estado: "sinGanador", conteos, motivo: "sinCandidatos" };
  }

  const votosCategoria = estado.votos[slotId] ?? {};
  for (const votadoId of Object.values(votosCategoria)) {
    if (votadoId in conteos) conteos[votadoId] = (conteos[votadoId] ?? 0) + 1;
  }

  const maximo = Math.max(0, ...Object.values(conteos));
  if (maximo === 0) {
    return { estado: "sinGanador", conteos, motivo: "nadieVoto" };
  }
  const punteros = candidatos.filter((c) => conteos[c] === maximo);
  if (punteros.length !== 1) {
    return { estado: "sinGanador", conteos, motivo: "empate", empatados: punteros };
  }
  return { estado: "resuelta", conteos, ganadorId: punteros[0] as string };
}

export interface ResolucionFinal {
  readonly categorias: Readonly<Record<IdSlotFormacion, ResultadoCategoria>>;
  readonly categoriasGanadas: Readonly<Record<string, number>>;
  readonly ganadorFinal: string | null;
  readonly empatados: readonly string[] | null;
}

export function resolverVotacionFinal(estado: EstadoVotacionFinal): ResolucionFinal {
  const categorias = {} as Record<IdSlotFormacion, ResultadoCategoria>;
  const categoriasGanadas: Record<string, number> = {};
  for (const jugadorId of Object.keys(estado.equipos)) categoriasGanadas[jugadorId] = 0;

  for (const slot of FORMACION_4_3_3) {
    const resultado = resolverCategoria(estado, slot.id);
    categorias[slot.id] = resultado;
    if (resultado.estado === "resuelta") {
      categoriasGanadas[resultado.ganadorId] = (categoriasGanadas[resultado.ganadorId] ?? 0) + 1;
    }
  }

  const maximo = Math.max(0, ...Object.values(categoriasGanadas));
  const punteros = Object.keys(categoriasGanadas).filter((id) => categoriasGanadas[id] === maximo);

  if (punteros.length === 1) {
    return { categorias, categoriasGanadas, ganadorFinal: punteros[0] as string, empatados: null };
  }
  return { categorias, categoriasGanadas, ganadorFinal: null, empatados: punteros };
}

export type ResultadoDesempate =
  | { readonly resuelto: true; readonly ganadorId: string }
  | { readonly resuelto: false; readonly empatados: readonly string[] };

/**
 * Una ronda de revotación entre empatados (§7: "se revota solo entre los
 * empatados, repitiendo la votación las veces que haga falta hasta que
 * quede un ganador claro"). Mismo mecanismo para el empate DENTRO de una
 * categoría (resolverCategoria, motivo "empate") y para el empate del
 * resultado FINAL (resolverVotacionFinal.empatados) — sin importar si son
 * 2 empatados o más.
 *
 * `votos`: votanteId -> uno de los ids de `empatados` (todos contra todos,
 * igual que una categoría). Si esta ronda no deja un puntero único —incluido
 * el caso "nadie votó"—, `resuelto` es `false` y `empatados` trae el
 * subconjunto para la próxima ronda (el llamador vuelve a invocar esta
 * función con esos ids hasta que `resuelto: true`; sin límite de rondas).
 */
export function resolverDesempate(
  empatados: readonly string[],
  votos: Readonly<Record<string, string>>,
): ResultadoDesempate {
  const conteos: Record<string, number> = {};
  for (const id of empatados) conteos[id] = 0;
  for (const votadoId of Object.values(votos)) {
    if (votadoId in conteos) conteos[votadoId] = (conteos[votadoId] ?? 0) + 1;
  }

  const maximo = Math.max(0, ...Object.values(conteos));
  const punteros = empatados.filter((id) => conteos[id] === maximo);
  if (punteros.length === 1) {
    return { resuelto: true, ganadorId: punteros[0] as string };
  }
  return { resuelto: false, empatados: punteros };
}
