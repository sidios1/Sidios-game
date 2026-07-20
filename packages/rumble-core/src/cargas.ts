// Cargas y ventanas de validez de las habilidades (REGLAS_RUMBLE.md §2.1, §3.2,
// §7.2). Funciones puras: no mutan; el motor (Sesión 2) guarda el EstadoCarga.

import type { IHabilidad } from "./habilidades.js";

/** Cargas restantes de una habilidad; `null` = pasiva (no se agota por uso). */
export interface EstadoCarga {
  readonly restantes: number | null;
}

/** Cargas iniciales al asignar la habilidad (inicio de ronda, §7.2). */
export function crearCargasIniciales(habilidad: IHabilidad): EstadoCarga {
  switch (habilidad.cargas.tipo) {
    case "usos":
    case "consultas":
    case "robos":
      return { restantes: habilidad.cargas.cantidad };
    case "pasiva":
      return { restantes: null };
  }
}

/** ¿Quedan cargas para usar la habilidad? Las pasivas siempre están disponibles. */
export function cargaDisponible(estado: EstadoCarga): boolean {
  return estado.restantes === null || estado.restantes > 0;
}

/** Consume una carga (no baja de 0). Las pasivas no se ven afectadas. */
export function consumirCarga(estado: EstadoCarga): EstadoCarga {
  if (estado.restantes === null) return estado;
  return { restantes: Math.max(0, estado.restantes - 1) };
}

/**
 * ¿La ventana de la habilidad está vigente en el turno dado? (B1) La ventana
 * `primeros3Turnos` es GLOBAL: los turnos 1–3 de la ronda (`turno.numero ≤ 3`),
 * NO los 3 turnos propios de cada jugador. `ronda` siempre está vigente.
 */
export function ventanaVigente(habilidad: IHabilidad, turnoNumero: number): boolean {
  switch (habilidad.ventana.tipo) {
    case "ronda":
      return true;
    case "primeros3Turnos":
      return turnoNumero <= 3;
  }
}
