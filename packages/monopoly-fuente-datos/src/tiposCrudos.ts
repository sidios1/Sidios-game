// Formas de los 3 JSON de datos/ (SPIKE_DATOS_JUGADORES.md), reducidas a los
// campos que esta fuente consume. Los 3 archivos son objetos envoltorio
// `{ generadoEl, fuente, filtrosAplicados, total, <clave> }`, no arrays sueltos.

import type { PosicionJugador } from "@juegos/monopoly-core";

export interface JugadorCrudo {
  readonly id: number;
  readonly nombre: string;
  readonly apellido: string;
  readonly rating: number;
  readonly posicion: PosicionJugador;
  readonly posicionesPosibles: readonly PosicionJugador[];
  readonly liga: string | null;
  readonly calidad: string;
}

export interface ArchivoJugadores {
  readonly total: number;
  readonly jugadores: readonly JugadorCrudo[];
}

export interface TecnicoCrudo {
  readonly id: number;
  readonly nombre: string;
  readonly apellido: string;
}

export interface ArchivoTecnicos {
  readonly total: number;
  readonly tecnicos: readonly TecnicoCrudo[];
}

export interface ClubCrudo {
  readonly id: number;
  readonly nombre: string;
  readonly nombreOficial: string;
  readonly liga: string;
  readonly imagenClaraUrl: string;
  readonly imagenOscuraUrl: string;
}

export interface ArchivoClubes {
  readonly total: number;
  readonly clubes: readonly ClubCrudo[];
}
