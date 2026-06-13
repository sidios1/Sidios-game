// Raycasting del puntero sobre la escena. No decide nada: traduce
// intersecciones a eventos semánticos que consume la máquina de interacción,
// y resalta la carta propia bajo el cursor.

import * as THREE from "three";
import { leerInteraccion, resaltarCarta } from "./mallaCarta.js";
import type { Escena } from "./escena.js";

export type EventoPuntero =
  | { readonly tipo: "clickCarta"; readonly cartaId: string }
  | { readonly tipo: "clickMazo" }
  | { readonly tipo: "clickPozo" }
  | { readonly tipo: "clickCombinacion"; readonly mesaIdx: number };

export class Seleccionador {
  private readonly rayo = new THREE.Raycaster();
  private readonly puntero = new THREE.Vector2();
  private resaltada: THREE.Mesh | null = null;
  private readonly lienzo: HTMLCanvasElement;
  private readonly alMover: (evento: PointerEvent) => void;
  private readonly alBajar: (evento: PointerEvent) => void;

  constructor(
    private readonly escena: Escena,
    alEvento: (evento: EventoPuntero) => void,
  ) {
    this.lienzo = escena.renderer.domElement;
    this.alMover = (evento) => {
      this.actualizarPuntero(evento);
      this.actualizarResaltado();
    };
    this.alBajar = (evento) => {
      this.actualizarPuntero(evento);
      const interseccion = this.intersectar();
      if (interseccion === null) return;
      const datos = leerInteraccion(interseccion);
      if (datos === null) return;
      switch (datos.tipo) {
        case "cartaPropia":
          alEvento({ tipo: "clickCarta", cartaId: datos.cartaId });
          return;
        case "mazo":
          alEvento({ tipo: "clickMazo" });
          return;
        case "pozo":
          alEvento({ tipo: "clickPozo" });
          return;
        case "combinacion":
          alEvento({ tipo: "clickCombinacion", mesaIdx: datos.mesaIdx });
          return;
        case "decoracion":
          return;
      }
    };
    this.lienzo.addEventListener("pointermove", this.alMover);
    this.lienzo.addEventListener("pointerdown", this.alBajar);
  }

  /** Quita los listeners del puntero. */
  destruir(): void {
    this.lienzo.removeEventListener("pointermove", this.alMover);
    this.lienzo.removeEventListener("pointerdown", this.alBajar);
  }

  private actualizarPuntero(evento: PointerEvent): void {
    const rect = this.escena.renderer.domElement.getBoundingClientRect();
    this.puntero.x = ((evento.clientX - rect.left) / rect.width) * 2 - 1;
    this.puntero.y = -((evento.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** El primer objeto interactivo bajo el puntero (cartas y zonas fijas). */
  private intersectar(): THREE.Object3D | null {
    this.rayo.setFromCamera(this.puntero, this.escena.camara);
    const candidatos = [
      ...this.escena.cartas.children,
      ...this.escena.zonasFijas,
    ];
    const impactos = this.rayo.intersectObjects(candidatos, false);
    for (const impacto of impactos) {
      const datos = leerInteraccion(impacto.object);
      if (datos !== null && datos.tipo !== "decoracion") return impacto.object;
    }
    return null;
  }

  private actualizarResaltado(): void {
    const objeto = this.intersectar();
    const malla =
      objeto instanceof THREE.Mesh &&
      leerInteraccion(objeto)?.tipo === "cartaPropia"
        ? objeto
        : null;
    if (this.resaltada === malla) return;
    if (this.resaltada !== null) resaltarCarta(this.resaltada, false);
    if (malla !== null) resaltarCarta(malla, true);
    this.resaltada = malla;
    this.escena.renderer.domElement.style.cursor = malla !== null ? "pointer" : "";
  }
}
