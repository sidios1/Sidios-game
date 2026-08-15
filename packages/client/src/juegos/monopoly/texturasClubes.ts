// Único lugar del render de Monopoly que carga imágenes REALES (logos de
// club): el resto de las texturas del juego son canvas procedural (ver
// texturasMonopoly.ts). Las URLs de `datos/clubes_monopoly.json` apuntan a un
// CDN externo (`imagenClaraUrl`/`imagenOscuraUrl`) que NO manda headers CORS
// — cargarlas directo revienta con SecurityError al subirlas como textura
// WebGL (restricción del navegador, no evitable client-side: una imagen
// cross-origin sin CORS no puede subirse a un canvas WebGL). Por eso se
// descargaron una vez a `packages/client/public/datos/logos/<id>-<modo>.png`
// (mismo lugar que `clubes_monopoly.json`) y se sirven same-origin, sin ese
// límite. `ClubPool.imagenClaraUrl/imagenOscuraUrl` NO se usan acá a
// propósito: solo dan el id, la ruta local sale de ese id.

import * as THREE from "three";
import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";

export type ModoLogo = "clara" | "oscura";

const cargador = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

/** Textura del logo de `club` (variante clara u oscura), cacheada por club+modo. */
export function texturaClub(club: ClubPool, modo: ModoLogo): THREE.Texture {
  const clave = `${club.id}:${modo}`;
  const existente = cache.get(clave);
  if (existente !== undefined) return existente;
  const textura = cargador.load(`/datos/logos/${club.id}-${modo}.png`);
  textura.colorSpace = THREE.SRGBColorSpace;
  cache.set(clave, textura);
  return textura;
}
