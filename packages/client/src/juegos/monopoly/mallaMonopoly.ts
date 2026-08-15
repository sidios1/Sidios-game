// Fábricas de mallas propias de Monopoly: celdas, fichas (logo de club),
// sobres, cartas de Mi Club y dados. Las cartas reusan las fábricas genéricas
// de escena/mallaCarta.ts (mismo patrón que Carioca/UNO); el resto son mallas
// nuevas sin equivalente compartido (celdas planas, fichas cilíndricas, dados).

import * as THREE from "three";
import type { CartaMiClub, CeldaTablero } from "@juegos/monopoly-core";
import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";
import { crearMallaCaraTextura } from "../../escena/mallaCarta.js";
import { PASO } from "./tableroMonopoly.js";
import {
  texturaCartaMiClub,
  texturaDado,
  texturaPrensa,
  texturaSobre,
  texturaCelda,
} from "./texturasMonopoly.js";
import { texturaClub } from "./texturasClubes.js";

const ANCHO_PLACA_CELDA = PASO * 0.94;
const ALTO_PLACA_CELDA = PASO * 0.94;

/** Placa plana de una celda del tablero (estática, no interactiva). */
export function crearMallaCelda(celda: CeldaTablero): THREE.Mesh {
  const geometria = new THREE.PlaneGeometry(ANCHO_PLACA_CELDA, ALTO_PLACA_CELDA);
  const material = new THREE.MeshLambertMaterial({ map: texturaCelda(celda) });
  const malla = new THREE.Mesh(geometria, material);
  malla.rotation.x = -Math.PI / 2;
  return malla;
}

const RADIO_FICHA = 0.32;
export const ALTO_FICHA = 0.22;
const materialLadoFicha = new THREE.MeshLambertMaterial({ color: "#2a2a2a" });
let materialSinClub: THREE.MeshLambertMaterial | null = null;

function materialTapaFicha(club: ClubPool | null): THREE.MeshLambertMaterial {
  if (club === null) {
    if (materialSinClub === null) {
      materialSinClub = new THREE.MeshLambertMaterial({ color: "#888888" });
    }
    return materialSinClub;
  }
  return new THREE.MeshLambertMaterial({ map: texturaClub(club, "clara") });
}

/** Ficha de jugador: cilindro corto con el logo del club en la tapa. */
export function crearMallaFicha(club: ClubPool | null): THREE.Mesh {
  const geometria = new THREE.CylinderGeometry(RADIO_FICHA, RADIO_FICHA, ALTO_FICHA, 24);
  const tapa = materialTapaFicha(club);
  const malla = new THREE.Mesh(geometria, [materialLadoFicha, tapa, tapa]);
  return malla;
}

/** Cambia el logo de una ficha ya creada (p. ej. cuando el catálogo de clubes termina de cargar). */
export function actualizarLogoFicha(malla: THREE.Mesh, club: ClubPool | null): void {
  const tapa = materialTapaFicha(club);
  malla.material = [materialLadoFicha, tapa, tapa];
}

/** Sobre cerrado (antes de abrirlo): usa la fábrica genérica de mallaCarta.ts. */
export function crearMallaSobre(): THREE.Mesh {
  return crearMallaCaraTextura(texturaSobre(), new THREE.MeshLambertMaterial({ color: "#16283a" }));
}

/** Cara abierta de una carta de Mi Club (jugador o técnico). */
export function crearMallaCartaMiClub(carta: CartaMiClub): THREE.Mesh {
  return crearMallaCaraTextura(
    texturaCartaMiClub(carta),
    new THREE.MeshLambertMaterial({ color: "#16283a" }),
  );
}

/** Reverso de "se robó una carta de Prensa Deportiva" (contenido oculto, ver texturasMonopoly.ts). */
export function crearMallaPrensa(): THREE.Mesh {
  return crearMallaCaraTextura(texturaPrensa(), new THREE.MeshLambertMaterial({ color: "#4a2470" }));
}

const TAMANO_DADO = 0.42;
const materialLadoDado = new THREE.MeshLambertMaterial({ color: "#fbf9f4" });

/** Dado: cubo cuya cara superior (índice de material 2, +y) se actualiza con `actualizarValorDado`. */
export function crearMallaDado(valorInicial: number): THREE.Mesh {
  const geometria = new THREE.BoxGeometry(TAMANO_DADO, TAMANO_DADO, TAMANO_DADO);
  const tapa = new THREE.MeshLambertMaterial({ map: texturaDado(valorInicial) });
  const malla = new THREE.Mesh(geometria, [
    materialLadoDado,
    materialLadoDado,
    tapa,
    materialLadoDado,
    materialLadoDado,
    materialLadoDado,
  ]);
  return malla;
}

/** Cambia la cara superior visible de un dado ya creado (sin recrear la malla). */
export function actualizarValorDado(malla: THREE.Mesh, valor: number): void {
  const materiales = Array.isArray(malla.material) ? malla.material : [malla.material];
  const tapa = materiales[2];
  if (tapa instanceof THREE.MeshLambertMaterial) {
    tapa.map = texturaDado(valor);
    tapa.needsUpdate = true;
  }
}
