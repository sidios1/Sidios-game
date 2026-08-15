// Apoyo de pruebas: un PoolSobres determinista para ejercitar el motor de
// Monopoly sin la fuente de datos real (crearFuenteDatosArchivo, S2). Vive en
// `src/pruebas` — excluido del tsconfig de build — para no viajar en dist ni
// meter datos de prueba en código de producción. Mirror de
// monopoly-core/apoyoPruebas.ts (que no se reexporta desde el índice del
// paquete, así que el server no puede importarlo directamente).

import { LIGAS } from "@juegos/monopoly-core";
import type {
  JugadorPool,
  NombreLiga,
  PoolSobres,
  PosicionJugador,
  TecnicoPool,
} from "@juegos/monopoly-core";
import type { JugadorMotor } from "../motor.js";

const POSICIONES: readonly PosicionJugador[] = [
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
];

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
    const rating = 50 + ((i * 7) % 50);
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
export function poolMock(): PoolSobres {
  return {
    porLiga: construirPorLiga(18),
    restoDelMundo: jugadoresDePrueba("RdM", 15),
    tecnicos: [
      tecnico("t1", "Tecnico", "Uno"),
      tecnico("t2", "Tecnico", "Dos"),
      tecnico("t3", "Tecnico", "Tres"),
    ],
  };
}

export const JUGADORES_MONOPOLY: readonly JugadorMotor[] = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Bruno" },
  { id: "j3", nombre: "Carla" },
];

/** rng determinista simple; no probamos el barajado/sorteo, solo necesitamos repetibilidad. */
export function rngFijo(semillaInicial = 42): () => number {
  let semilla = semillaInicial;
  return () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };
}
