// Raycasting del puntero sobre la escena. No decide reglas: traduce el puntero
// a eventos semánticos (click) y a gestos de arrastre que consume la máquina de
// interacción / el controlador del juego. Es el ÚNICO módulo que conoce puntero,
// raycast y el plano de arrastre. Distingue un "tap" (click que selecciona) de
// un "drag" (arrastrar la carta) por un umbral de desplazamiento.

import * as THREE from "three";
import { leerInteraccion, resaltarCarta } from "./mallaCarta.js";
import type { Escena } from "./escena.js";

export type EventoPuntero =
  | { readonly tipo: "clickCarta"; readonly cartaId: string }
  | { readonly tipo: "clickMazo" }
  | { readonly tipo: "clickPozo" }
  | { readonly tipo: "clickCombinacion"; readonly mesaIdx: number };

/** Dónde cae una carta arrastrada al moverse/soltarse. */
export type DestinoArrastre =
  | { readonly tipo: "mano" }
  | { readonly tipo: "pozo" }
  | { readonly tipo: "combinacion"; readonly mesaIdx: number }
  | { readonly tipo: "mesaBajada" }
  | { readonly tipo: "fuera" };

/** Objeto interactivo bajo el puntero al hacer hover (con coords de viewport). */
export type ObjetivoHover =
  | { readonly tipo: "cartaPropia"; readonly cartaId: string; readonly x: number; readonly y: number }
  | { readonly tipo: "combinacion"; readonly mesaIdx: number; readonly x: number; readonly y: number };

export interface ManejadoresArrastre {
  readonly alIniciar: (cartaId: string) => void;
  readonly alMover: (mundo: THREE.Vector3, destino: DestinoArrastre) => void;
  readonly alSoltar: (destino: DestinoArrastre) => void;
}

/** Píxeles que hay que mover antes de considerar que es un arrastre y no un tap. */
const UMBRAL_ARRASTRE = 6;
/** Más allá de esta Z (hacia el jugador) el destino es la propia mano. */
const UMBRAL_MANO_Z = 3.6;

interface Candidato {
  readonly cartaId: string;
  readonly x: number;
  readonly y: number;
}

export class Seleccionador {
  private readonly rayo = new THREE.Raycaster();
  private readonly puntero = new THREE.Vector2();
  private readonly planoMesa = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private resaltada: THREE.Mesh | null = null;
  private candidato: Candidato | null = null;
  private arrastrando: string | null = null;
  /** Última posición del puntero en coords de viewport (para el tooltip). */
  private punteroX = 0;
  private punteroY = 0;
  /** Clave del objetivo de hover ya notificado, para no repetir avisos. */
  private claveHover: string | null = null;
  private readonly lienzo: HTMLCanvasElement;
  private readonly alMover: (evento: PointerEvent) => void;
  private readonly alBajar: (evento: PointerEvent) => void;
  private readonly alSubir: (evento: PointerEvent) => void;
  private readonly alSalir: () => void;

  constructor(
    private readonly escena: Escena,
    alEvento: (evento: EventoPuntero) => void,
    private readonly arrastre: ManejadoresArrastre,
    private readonly alHover: (objetivo: ObjetivoHover | null) => void,
  ) {
    this.lienzo = escena.renderer.domElement;

    this.alBajar = (evento) => {
      this.actualizarPuntero(evento);
      const objeto = this.intersectar();
      const datos = objeto !== null ? leerInteraccion(objeto) : null;
      if (datos === null) return;
      if (datos.tipo === "cartaPropia") {
        // No emitimos click aún: puede ser tap (seleccionar) o drag (mover).
        this.candidato = { cartaId: datos.cartaId, x: evento.clientX, y: evento.clientY };
        this.lienzo.setPointerCapture(evento.pointerId);
        return;
      }
      switch (datos.tipo) {
        case "mazo":
          alEvento({ tipo: "clickMazo" });
          return;
        case "pozo":
          alEvento({ tipo: "clickPozo" });
          return;
        case "combinacion":
          alEvento({ tipo: "clickCombinacion", mesaIdx: datos.mesaIdx });
          return;
        case "mesaBajada":
        case "decoracion":
          return;
      }
    };

    this.alMover = (evento) => {
      this.actualizarPuntero(evento);
      if (this.arrastrando !== null) {
        const { mundo, destino } = this.calcularArrastre();
        this.arrastre.alMover(mundo, destino);
        return;
      }
      if (this.candidato !== null) {
        const dx = evento.clientX - this.candidato.x;
        const dy = evento.clientY - this.candidato.y;
        if (dx * dx + dy * dy >= UMBRAL_ARRASTRE * UMBRAL_ARRASTRE) {
          this.arrastrando = this.candidato.cartaId;
          this.apagarResaltado();
          this.arrastre.alIniciar(this.arrastrando);
          const { mundo, destino } = this.calcularArrastre();
          this.arrastre.alMover(mundo, destino);
        }
        return;
      }
      this.actualizarResaltado();
    };

    this.alSubir = (evento) => {
      this.actualizarPuntero(evento);
      if (this.arrastrando !== null) {
        const { destino } = this.calcularArrastre();
        this.arrastrando = null;
        this.candidato = null;
        this.arrastre.alSoltar(destino);
      } else if (this.candidato !== null) {
        const cartaId = this.candidato.cartaId;
        this.candidato = null;
        alEvento({ tipo: "clickCarta", cartaId });
      }
      try {
        this.lienzo.releasePointerCapture(evento.pointerId);
      } catch {
        // El puntero pudo perderse; no es un error.
      }
    };

    this.alSalir = () => this.apagarHover();

    this.lienzo.addEventListener("pointermove", this.alMover);
    this.lienzo.addEventListener("pointerdown", this.alBajar);
    this.lienzo.addEventListener("pointerup", this.alSubir);
    this.lienzo.addEventListener("pointerleave", this.alSalir);
  }

  /** Quita los listeners del puntero. */
  destruir(): void {
    this.lienzo.removeEventListener("pointermove", this.alMover);
    this.lienzo.removeEventListener("pointerdown", this.alBajar);
    this.lienzo.removeEventListener("pointerup", this.alSubir);
    this.lienzo.removeEventListener("pointerleave", this.alSalir);
  }

  private actualizarPuntero(evento: PointerEvent): void {
    const rect = this.escena.renderer.domElement.getBoundingClientRect();
    this.puntero.x = ((evento.clientX - rect.left) / rect.width) * 2 - 1;
    this.puntero.y = -((evento.clientY - rect.top) / rect.height) * 2 + 1;
    this.punteroX = evento.clientX;
    this.punteroY = evento.clientY;
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

  /** Punto del mundo bajo el puntero (plano de la mesa) y a dónde caería la carta. */
  private calcularArrastre(): { mundo: THREE.Vector3; destino: DestinoArrastre } {
    this.rayo.setFromCamera(this.puntero, this.escena.camara);
    const impactos = this.rayo.intersectObjects(
      [...this.escena.cartas.children, ...this.escena.zonasFijas],
      false,
    );
    let mesaIdx: number | null = null;
    let sobrePozo = false;
    let sobreMesa = false;
    for (const impacto of impactos) {
      const datos = leerInteraccion(impacto.object);
      if (datos === null) continue;
      if (datos.tipo === "combinacion") {
        if (mesaIdx === null) mesaIdx = datos.mesaIdx;
      } else if (datos.tipo === "pozo") {
        sobrePozo = true;
      } else if (datos.tipo === "mesaBajada") {
        sobreMesa = true;
      }
    }
    const mundo = new THREE.Vector3();
    const cruza = this.rayo.ray.intersectPlane(this.planoMesa, mundo);

    let destino: DestinoArrastre;
    if (mesaIdx !== null) {
      destino = { tipo: "combinacion", mesaIdx };
    } else if (sobrePozo) {
      destino = { tipo: "pozo" };
    } else if (cruza !== null && mundo.z > UMBRAL_MANO_Z) {
      destino = { tipo: "mano" };
    } else if (sobreMesa) {
      destino = { tipo: "mesaBajada" };
    } else {
      destino = { tipo: "fuera" };
    }
    return { mundo, destino };
  }

  private actualizarResaltado(): void {
    const objeto = this.intersectar();
    const datos = objeto !== null ? leerInteraccion(objeto) : null;
    const malla =
      objeto instanceof THREE.Mesh && datos?.tipo === "cartaPropia" ? objeto : null;
    if (this.resaltada !== malla) {
      if (this.resaltada !== null) resaltarCarta(this.resaltada, false);
      if (malla !== null) resaltarCarta(malla, true);
      this.resaltada = malla;
      this.escena.renderer.domElement.style.cursor = malla !== null ? "pointer" : "";
    }
    this.notificarHover(datos);
  }

  /** Avisa del objetivo de hover (carta propia o combinación), evitando repetir. */
  private notificarHover(datos: ReturnType<typeof leerInteraccion>): void {
    let objetivo: ObjetivoHover | null = null;
    if (datos?.tipo === "cartaPropia") {
      objetivo = { tipo: "cartaPropia", cartaId: datos.cartaId, x: this.punteroX, y: this.punteroY };
    } else if (datos?.tipo === "combinacion") {
      objetivo = { tipo: "combinacion", mesaIdx: datos.mesaIdx, x: this.punteroX, y: this.punteroY };
    }
    const clave =
      objetivo === null
        ? null
        : objetivo.tipo === "cartaPropia"
          ? `carta:${objetivo.cartaId}`
          : `mesa:${objetivo.mesaIdx}`;
    if (clave === this.claveHover) return;
    this.claveHover = clave;
    this.alHover(objetivo);
  }

  private apagarResaltado(): void {
    if (this.resaltada !== null) resaltarCarta(this.resaltada, false);
    this.resaltada = null;
    this.escena.renderer.domElement.style.cursor = "";
    this.apagarHover();
  }

  /** Oculta el tooltip y olvida el objetivo (al salir del canvas o arrastrar). */
  private apagarHover(): void {
    if (this.claveHover === null) return;
    this.claveHover = null;
    this.alHover(null);
  }
}
