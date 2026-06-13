// Mallas de carta: cajas finas con cara y dorso texturizados. El userData
// declara qué es cada malla para que el raycasting emita eventos semánticos.

import * as THREE from "three";
import type { Carta } from "@juegos/carioca-core";
import { texturaCara, texturaDorso } from "./texturasCarta.js";

export const ANCHO_CARTA = 1;
export const ALTO_CARTA = 1.4;
export const GROSOR_CARTA = 0.012;

/** Qué representa una malla ante el puntero (lo lee seleccion.ts). */
export type DatosInteraccion =
  | { readonly tipo: "cartaPropia"; readonly cartaId: string }
  | { readonly tipo: "mazo" }
  | { readonly tipo: "pozo" }
  | { readonly tipo: "combinacion"; readonly mesaIdx: number }
  | { readonly tipo: "mesaBajada" }
  | { readonly tipo: "decoracion" };

const geometriaCarta = new THREE.BoxGeometry(ANCHO_CARTA, ALTO_CARTA, GROSOR_CARTA);

const materialLado = new THREE.MeshLambertMaterial({ color: "#e8e4da" });
let materialDorsoCompartido: THREE.MeshLambertMaterial | null = null;

function materialDorso(): THREE.MeshLambertMaterial {
  if (materialDorsoCompartido === null) {
    materialDorsoCompartido = new THREE.MeshLambertMaterial({ map: texturaDorso() });
  }
  return materialDorsoCompartido;
}

/**
 * Carta real: cara adelante (+z), dorso atrás. El material de la cara es
 * propio de la malla (el hover le toca el emissive sin afectar a otras).
 */
export function crearMallaCarta(carta: Carta): THREE.Mesh {
  const cara = new THREE.MeshLambertMaterial({ map: texturaCara(carta) });
  const malla = new THREE.Mesh(geometriaCarta, [
    materialLado,
    materialLado,
    materialLado,
    materialLado,
    cara,
    materialDorso(),
  ]);
  asignarInteraccion(malla, { tipo: "decoracion" });
  return malla;
}

/** Carta oculta (mano ajena, mazo, pila del pozo): dorso por ambos lados. */
export function crearMallaDorso(): THREE.Mesh {
  const malla = new THREE.Mesh(geometriaCarta, [
    materialLado,
    materialLado,
    materialLado,
    materialLado,
    materialDorso(),
    materialDorso(),
  ]);
  asignarInteraccion(malla, { tipo: "decoracion" });
  return malla;
}

// Registro tipado fuera de userData: sin casts y se limpia solo (WeakMap).
const interacciones = new WeakMap<THREE.Object3D, DatosInteraccion>();

export function asignarInteraccion(
  objeto: THREE.Object3D,
  datos: DatosInteraccion,
): void {
  interacciones.set(objeto, datos);
}

export function leerInteraccion(objeto: THREE.Object3D): DatosInteraccion | null {
  return interacciones.get(objeto) ?? null;
}

/** Resalta (o apaga) la cara de una carta propia bajo el cursor. */
export function resaltarCarta(malla: THREE.Mesh, encendido: boolean): void {
  const materiales = Array.isArray(malla.material) ? malla.material : [malla.material];
  const cara = materiales[4];
  if (cara instanceof THREE.MeshLambertMaterial) {
    cara.emissive.set(encendido ? "#2a4a20" : "#000000");
  }
}
