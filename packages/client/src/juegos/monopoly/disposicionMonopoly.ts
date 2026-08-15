// Layout de las instancias DINÁMICAS de Monopoly (revelaciones de sobre/carta
// de Prensa Deportiva). NO toca Three ni anima: solo devuelve el mapa de
// objetivos que `SincronizadorPoses` convierte en mallas y tweens.
//
// El tablero (40 celdas) es estático — se arma una única vez en
// juegoMonopoly.ts sin pasar por este reconciliador, porque nunca cambia y no
// necesita diff. Las fichas y los dados también viven FUERA de este mapa
// (juegoMonopoly.ts los anima a mano, paso a paso — ver difVistaMonopoly.ts).
// Lo único que este archivo gestiona es la revelación transitoria de una
// carta recién ganada (sobre) o de Prensa Deportiva: como máximo UNA a la vez.

import type { CartaMiClub } from "@juegos/monopoly-core";
import type { Pose } from "../../escena/disposicion.js";
import type { ObjetivoBase } from "../../escena/sincronizadorPoses.js";

/** Lo que se está revelando ahora mismo (transitorio, vive en juegoMonopoly.ts). */
export type RevelacionActiva =
  | { readonly tipo: "cartaMiClub"; readonly carta: CartaMiClub }
  | { readonly tipo: "prensa" };

export type ObjetivoMonopoly = ObjetivoBase & RevelacionActiva;

export type MapaObjetivosMonopoly = ReadonlyMap<string, ObjetivoMonopoly>;

/** Pose fija donde aparece cualquier revelación (centro del tablero, elevada). */
export const POSE_REVELACION: Pose = { x: 0, y: 0.9, z: 0, rotX: -Math.PI / 2, rotY: 0, rotZ: 0 };

const CLAVE_REVELACION = "revelacion:activa";

/** Mapa de objetivos: 0 o 1 entradas, según haya o no una revelación activa. */
export function calcularDisposicionMonopoly(revelando: RevelacionActiva | null): MapaObjetivosMonopoly {
  const objetivos = new Map<string, ObjetivoMonopoly>();
  if (revelando !== null) {
    objetivos.set(CLAVE_REVELACION, {
      ...revelando,
      pose: POSE_REVELACION,
      interaccion: { tipo: "decoracion" },
    });
  }
  return objetivos;
}
