// Apoyo para tests deterministas: pool mock, jugadores y un reloj de mentira.
// NO es parte de la API de juego (no se reexporta desde index.ts); vive aquí
// para que los tests armen partidas exactas sin tocar disco ni el reloj real.

import type { CancionPool, PoolPartida } from "./catalogo.js";
import type { DatosJugador, EstadoMeloquiz } from "./partida.js";

/**
 * Pool mock de `n` canciones. Los ids son OPACOS a propósito (`c1`, `c2`, …),
 * como exige el contrato: no codifican el título. Así los tests de ocultamiento
 * pueden buscar el título en la vista sin falsos positivos por el id.
 */
export function poolDePrueba(n: number): PoolPartida {
  const canciones: CancionPool[] = [];
  for (let i = 1; i <= n; i++) {
    canciones.push({
      id: `c${i}`,
      titulo: `Cancion Numero ${i}`,
      artista: `Artista ${i}`,
      claveArchivo: `archivo-${i}.mp3`,
      segundoInicio: 30 + i,
      claveCaratula: `caratula-${i}`,
    });
  }
  return { canciones };
}

/** Busca una canción del pool por id (los tests la necesitan para asertar). */
export function cancionDe(pool: PoolPartida, id: string): CancionPool {
  const c = pool.canciones.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no existe la canción ${id}`);
  return c;
}

export const JUGADORES: readonly DatosJugador[] = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Bruno" },
  { id: "j3", nombre: "Carla" },
];

/**
 * Reloj de mentira: el núcleo NUNCA consulta la hora, se la pasan. Esto es todo
 * lo que hace falta para que la máquina de fases sea determinista en tests.
 */
export function relojFalso(inicio = 0): { ahora: () => number; avanzar: (ms: number) => number } {
  let t = inicio;
  return {
    ahora: () => t,
    avanzar: (ms: number) => {
      t += ms;
      return t;
    },
  };
}

/** Saca el valor de un Resultado ok en tests; lanza si fue error. */
export function exito<T>(
  r: { ok: true; valor: T } | { ok: false; error: { codigo: string; mensaje: string } },
): T {
  if (!r.ok) {
    throw new Error(`se esperaba ok pero fue error: ${r.error.codigo} (${r.error.mensaje})`);
  }
  return r.valor;
}

/** La opción correcta de la ronda en curso (para simular un acierto). */
export function opcionCorrecta(estado: EstadoMeloquiz): string {
  if (estado.rondaActual === null) throw new Error("no hay ronda en curso");
  return estado.rondaActual.opcionCorrectaId;
}

/** Una opción incorrecta de la ronda en curso (para simular un fallo). */
export function opcionIncorrecta(estado: EstadoMeloquiz): string {
  if (estado.rondaActual === null) throw new Error("no hay ronda en curso");
  const mala = estado.rondaActual.opciones.find(
    (o) => o.id !== estado.rondaActual?.opcionCorrectaId,
  );
  if (mala === undefined) throw new Error("la ronda no tiene opciones incorrectas");
  return mala.id;
}
