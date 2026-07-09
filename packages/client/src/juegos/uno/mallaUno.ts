// Mallas de carta de UNO: reusan los constructores genéricos de escena/mallaCarta
// (geometría, materiales de lado, registro de interacción) con las texturas
// propias de UNO. El material de dorso es único y compartido (cacheado), igual que
// hace Carioca con el suyo.

import * as THREE from "three";
import type { CartaUno } from "@juegos/server/vistaJuego";
import { crearMallaCaraTextura, crearMallaDorsoTextura } from "../../escena/mallaCarta.js";
import { texturaCaraUno, texturaDorsoUno } from "./texturasUno.js";

let materialDorsoCompartido: THREE.MeshLambertMaterial | null = null;

function materialDorso(): THREE.MeshLambertMaterial {
  if (materialDorsoCompartido === null) {
    materialDorsoCompartido = new THREE.MeshLambertMaterial({ map: texturaDorsoUno() });
  }
  return materialDorsoCompartido;
}

/** Carta real de UNO: cara propia adelante, dorso de UNO atrás. */
export function crearMallaCartaUno(carta: CartaUno): THREE.Mesh {
  return crearMallaCaraTextura(texturaCaraUno(carta), materialDorso());
}

/** Carta oculta de UNO (mazo): dorso por ambos lados. */
export function crearMallaDorsoUno(): THREE.Mesh {
  return crearMallaDorsoTextura(materialDorso());
}
