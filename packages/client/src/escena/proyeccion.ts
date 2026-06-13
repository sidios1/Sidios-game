// Proyección de un punto del mundo 3D a coordenadas de pantalla (píxeles del
// canvas). La usan las insignias DOM ancladas a los asientos de la mesa.

import * as THREE from "three";

export interface PuntoPantalla {
  readonly x: number;
  readonly y: number;
  /** false si el punto queda detrás de la cámara (no debe mostrarse). */
  readonly visible: boolean;
}

const reutilizado = new THREE.Vector3();

export function proyectarAPantalla(
  camara: THREE.Camera,
  ancho: number,
  alto: number,
  x: number,
  y: number,
  z: number,
): PuntoPantalla {
  reutilizado.set(x, y, z).project(camara);
  return {
    x: (reutilizado.x * 0.5 + 0.5) * ancho,
    y: (-reutilizado.y * 0.5 + 0.5) * alto,
    visible: reutilizado.z <= 1,
  };
}
