// Apoyo para tests deterministas: pool mock, jugadores y un unwrap de
// Resultado. NO es parte de la API de juego (no se reexporta desde
// index.ts) — mirror de meloquiz-core/apoyoPruebas.ts.

import type { DatosJugador } from "./estado.js";
import type { JugadorPool, PoolSobres, PosicionJugador, TecnicoPool } from "./fuenteSobres.js";
import { POSICIONES } from "./fuenteSobres.js";
import type { Resultado } from "./resultado.js";
import { LIGAS, type NombreLiga } from "./tablero.js";

function jugador(id: string, posicion: PosicionJugador, rating: number): JugadorPool {
  return {
    id,
    jugadorId: id,
    nombre: `Jugador${id}`,
    apellido: "DePrueba",
    rating,
    posicion,
    calidad: rating >= 85 ? "Rare" : rating >= 70 ? "Normal" : "Bronze",
  };
}

function jugadoresDePrueba(prefijo: string, cantidad: number): JugadorPool[] {
  const jugadores: JugadorPool[] = [];
  for (let i = 0; i < cantidad; i++) {
    const posicion = POSICIONES[i % POSICIONES.length] ?? "ST";
    const rating = 50 + ((i * 7) % 50); // variado, 50..99
    jugadores.push(jugador(`${prefijo}-${i}`, posicion, rating));
  }
  return jugadores;
}

function tecnico(id: string, nombre: string, apellido: string): TecnicoPool {
  return { id, nombre, apellido };
}

function construirPorLiga(cantidadPorLiga: number): Record<NombreLiga, readonly JugadorPool[]> {
  const porLiga: Partial<Record<NombreLiga, readonly JugadorPool[]>> = {};
  for (const liga of LIGAS) {
    porLiga[liga] = jugadoresDePrueba(liga.replace(/\s+/g, ""), cantidadPorLiga);
  }
  return porLiga as Record<NombreLiga, readonly JugadorPool[]>;
}

/** Pool mock con cobertura completa de las 8 ligas + Resto del Mundo + Técnicos. */
export function poolDePrueba(): PoolSobres {
  return {
    porLiga: construirPorLiga(18),
    restoDelMundo: jugadoresDePrueba("RdM", 15),
    tecnicos: [tecnico("t1", "Tecnico", "Uno"), tecnico("t2", "Tecnico", "Dos"), tecnico("t3", "Tecnico", "Tres")],
  };
}

/**
 * Pool DELIBERADAMENTE escaso: "MLS" tiene un único jugador, en la posición
 * GK. Sirve para ejercitar la cascada de fallback de `elegirJugadorParaSobre`
 * (§3.2): pedir una posición != GK en MLS cae al nivel 1 (toda la liga, sin
 * importar tier); pedir una posición que tampoco existe en ningún lado del
 * pool de esa liga cae al nivel 2 (cualquiera del pool).
 */
export function poolEscasoDePrueba(): PoolSobres {
  const base = poolDePrueba();
  return { ...base, porLiga: { ...base.porLiga, MLS: [jugador("mls-unico", "GK", 60)] } };
}

export const JUGADORES: readonly DatosJugador[] = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Bruno" },
  { id: "j3", nombre: "Carla" },
];

/** Saca el valor de un Resultado ok en tests; lanza si fue error. */
export function exito<T>(r: Resultado<T>): T {
  if (!r.ok) {
    throw new Error(`se esperaba ok pero fue error: ${r.error.codigo} (${r.error.mensaje})`);
  }
  return r.valor;
}
