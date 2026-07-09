// Motor genérico escena⇄poses, agnóstico al juego. Dado un mapa de objetivos
// (clave de instancia → pose + interacción), crea/redirige las mallas con tweens
// para que la escena converja al objetivo. NO conoce reglas, vistas ni el tipo
// de carta: el juego inyecta cómo se crea cada malla (`crearMalla`) y desde dónde
// aparece una malla nueva (`origen`). Carioca y UNO comparten este bucle.
//
// Las claves de instancia persisten entre zonas (una carta que pasa de la mano al
// descarte conserva su malla), así que el movimiento sale del propio diff de poses;
// `origen` solo aporta DESDE DÓNDE aparece lo nuevo y el stagger del reparto. Si
// llega otro objetivo a mitad de animación, la malla se redirige: el final siempre
// refleja el último mapa.

import type * as THREE from "three";
import type { Pose } from "./disposicion.js";
import type { DatosInteraccion } from "./mallaCarta.js";
import { asignarInteraccion } from "./mallaCarta.js";
import type { Interpolador, ManejadorTween } from "./interpolacion.js";
import { easeOut } from "./interpolacion.js";

const DURACION = 0.45;

/** Lo mínimo que el motor necesita de un objetivo; cada juego extiende con su carta. */
export interface ObjetivoBase {
  readonly pose: Pose;
  readonly interaccion: DatosInteraccion;
  /**
   * La malla la controla el arrastre (no el tween): el motor la mantiene viva
   * pero no la mueve. La pose es su lugar de reposo/retorno.
   */
  readonly congelado?: boolean;
}

/** De dónde aparece una malla nueva y con cuánto retraso empieza su tween. */
export interface Aparicion {
  readonly pose: Pose;
  readonly retraso: number;
}

/** Las cartas que aparecen "vuelan" desde un poco más arriba de su origen. */
export function elevar(pose: Pose): Pose {
  return { ...pose, y: pose.y + 1.1 };
}

function colocar(malla: THREE.Mesh, pose: Pose): void {
  malla.position.set(pose.x, pose.y, pose.z);
  malla.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
}

function casiIgual(malla: THREE.Mesh, pose: Pose): boolean {
  const e = 1e-4;
  return (
    Math.abs(malla.position.x - pose.x) < e &&
    Math.abs(malla.position.y - pose.y) < e &&
    Math.abs(malla.position.z - pose.z) < e &&
    Math.abs(malla.rotation.x - pose.rotX) < e &&
    Math.abs(malla.rotation.y - pose.rotY) < e &&
    Math.abs(malla.rotation.z - pose.rotZ) < e
  );
}

/**
 * De dónde aparece una malla nueva. Recibe `siguienteOrden` para el escalonado del
 * reparto (cada carta nueva consume un turno del contador). Las mallas existentes
 * NO pasan por aquí: simplemente se redirigen a su pose objetivo.
 */
export type OrigenAparicion<O extends ObjetivoBase> = (
  clave: string,
  objetivo: O,
  siguienteOrden: () => number,
) => Aparicion;

export class SincronizadorPoses<O extends ObjetivoBase> {
  private readonly mallas = new Map<string, THREE.Mesh>();
  private readonly tweens = new Map<string, ManejadorTween>();

  constructor(
    private readonly raiz: THREE.Group,
    private readonly interpolador: Interpolador,
    /** Cómo materializa el juego cada objetivo (cara/dorso de su naipe). */
    private readonly crearMalla: (objetivo: O) => THREE.Mesh,
  ) {}

  /** La malla de una carta concreta (para que el arrastre la mueva en vivo). */
  mallaDeCarta(cartaId: string): THREE.Mesh | undefined {
    return this.mallas.get(`carta:${cartaId}`);
  }

  /**
   * Lleva la escena al mapa de objetivos dado. Si `reiniciar` es true, descarta
   * todas las mallas primero (reparto). `origen` decide desde dónde aparecen las
   * mallas nuevas.
   */
  aplicar(
    objetivos: ReadonlyMap<string, O>,
    reiniciar: boolean,
    origen: OrigenAparicion<O>,
  ): void {
    if (reiniciar) this.reiniciar();

    for (const [clave, malla] of [...this.mallas]) {
      if (!objetivos.has(clave)) this.eliminar(clave, malla);
    }

    let ordenReparto = 0;
    const siguienteOrden = (): number => ordenReparto++;
    for (const [clave, objetivo] of objetivos) {
      const existente = this.mallas.get(clave);
      if (existente !== undefined) {
        asignarInteraccion(existente, objetivo.interaccion);
        // Carta arrastrada: su transform lo fija el arrastre, no el tween.
        if (objetivo.congelado === true) {
          this.tweens.get(clave)?.cancelar();
          this.tweens.delete(clave);
          continue;
        }
        this.tweenHacia(clave, existente, objetivo.pose, 0);
        continue;
      }
      const malla = this.crearMalla(objetivo);
      asignarInteraccion(malla, objetivo.interaccion);
      const aparicion = origen(clave, objetivo, siguienteOrden);
      colocar(malla, aparicion.pose);
      this.raiz.add(malla);
      this.mallas.set(clave, malla);
      if (objetivo.congelado === true) continue;
      this.tweenHacia(clave, malla, objetivo.pose, aparicion.retraso);
    }
  }

  /** Redirige (o crea) el tween de una malla hacia su pose objetivo. */
  private tweenHacia(
    clave: string,
    malla: THREE.Mesh,
    pose: Pose,
    retraso: number,
  ): void {
    this.tweens.get(clave)?.cancelar();
    this.tweens.delete(clave);
    if (casiIgual(malla, pose)) {
      colocar(malla, pose);
      return;
    }
    const desde: Pose = {
      x: malla.position.x,
      y: malla.position.y,
      z: malla.position.z,
      rotX: malla.rotation.x,
      rotY: malla.rotation.y,
      rotZ: malla.rotation.z,
    };
    const manejador = this.interpolador.agregar({
      duracion: DURACION,
      retraso,
      easing: easeOut,
      alAvanzar: (t) => {
        malla.position.set(
          desde.x + (pose.x - desde.x) * t,
          desde.y + (pose.y - desde.y) * t,
          desde.z + (pose.z - desde.z) * t,
        );
        malla.rotation.set(
          desde.rotX + (pose.rotX - desde.rotX) * t,
          desde.rotY + (pose.rotY - desde.rotY) * t,
          desde.rotZ + (pose.rotZ - desde.rotZ) * t,
        );
      },
      alTerminar: () => {
        this.tweens.delete(clave);
      },
    });
    this.tweens.set(clave, manejador);
  }

  private eliminar(clave: string, malla: THREE.Mesh): void {
    this.tweens.get(clave)?.cancelar();
    this.tweens.delete(clave);
    this.raiz.remove(malla);
    this.mallas.delete(clave);
  }

  private reiniciar(): void {
    for (const [clave, malla] of [...this.mallas]) {
      this.eliminar(clave, malla);
    }
  }
}
