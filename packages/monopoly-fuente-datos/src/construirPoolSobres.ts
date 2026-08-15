// Construcción pura del PoolSobres real (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §3,
// §3.2) a partir de los datasets crudos ya parseados. Sin `fs`: testeable con
// fixtures en memoria. `fuenteDatosArchivo.ts` es el único módulo que lee
// disco y llama a esta función.

import type { JugadorPool, NombreLiga, PoolSobres, TecnicoPool } from "@juegos/monopoly-core";
import { LIGAS as LISTA_LIGAS } from "@juegos/monopoly-core";

import { posicionesElegibles } from "./elegibilidad.js";
import { resolverLiga } from "./mapaLigas.js";
import type { JugadorCrudo, TecnicoCrudo } from "./tiposCrudos.js";

function poolVacioPorLiga(): Record<NombreLiga, JugadorPool[]> {
  const porLiga = {} as Record<NombreLiga, JugadorPool[]>;
  for (const liga of LISTA_LIGAS) porLiga[liga] = [];
  return porLiga;
}

function construirTecnico(crudo: TecnicoCrudo): TecnicoPool {
  return { id: String(crudo.id), nombre: crudo.nombre, apellido: crudo.apellido };
}

/**
 * Un jugador entra al pool una vez POR CADA posición elegible que tenga (§3),
 * con id sufijado por posición para no colisionar con `validarPoolSobres`
 * (ver plan: decisión confirmada con el usuario ante el 42% de jugadores con
 * más de una posición elegible en el dataset real).
 */
function construirEntradasJugador(crudo: JugadorCrudo): readonly JugadorPool[] {
  return posicionesElegibles(crudo).map((posicion) => ({
    id: `${crudo.id}-${posicion}`,
    jugadorId: String(crudo.id),
    nombre: crudo.nombre,
    apellido: crudo.apellido,
    rating: crudo.rating,
    posicion,
    calidad: crudo.calidad,
  }));
}

export function construirPoolSobres(
  jugadores: readonly JugadorCrudo[],
  tecnicos: readonly TecnicoCrudo[],
): PoolSobres {
  const porLiga = poolVacioPorLiga();
  const restoDelMundo: JugadorPool[] = [];

  for (const crudo of jugadores) {
    const entradas = construirEntradasJugador(crudo);
    if (entradas.length === 0) continue; // §3: sin posición elegible, no entra al pool

    const nombreLiga = resolverLiga(crudo.liga);
    const destino = nombreLiga === null ? restoDelMundo : porLiga[nombreLiga];
    destino.push(...entradas);
  }

  return {
    porLiga,
    restoDelMundo,
    tecnicos: tecnicos.map(construirTecnico),
  };
}
