// Sincronizador escena⇄vista. La vista del servidor es la verdad: cada vez
// que llega una, calcula las poses objetivo y lleva cada malla hacia ellas
// con tweens. Las claves de instancia persisten entre zonas (una carta que
// pasa de la mano al pozo conserva su malla), así que el movimiento sale del
// propio diff de poses; los CambioVista solo aportan DESDE DÓNDE aparece lo
// nuevo (mazo, pozo o la mano de un jugador) y el stagger del reparto.
// Si llega otra vista a mitad de una animación, cada malla simplemente se
// redirige a su objetivo nuevo: el final siempre refleja la última vista.

import type * as THREE from "three";
import type { VistaPartida } from "@juegos/server/vista";
import type { CambioVista } from "../estado/difVista.js";
import type { MapaObjetivos, Objetivo, Pose } from "./disposicion.js";
import {
  calcularDisposicion,
  POSE_MAZO,
  POSE_POZO,
  poseManoJugador,
} from "./disposicion.js";
import type { ManejadorTween } from "./interpolacion.js";
import { easeOut, Interpolador } from "./interpolacion.js";
import {
  asignarInteraccion,
  crearMallaCarta,
  crearMallaDorso,
} from "./mallaCarta.js";

const DURACION = 0.45;
const RETRASO_REPARTO = 0.05;

interface Aparicion {
  readonly pose: Pose;
  readonly retraso: number;
}

/** Las cartas que aparecen "vuelan" desde un poco más arriba de su origen. */
function elevar(pose: Pose): Pose {
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

export class Sincronizador {
  private readonly mallas = new Map<string, THREE.Mesh>();
  private readonly tweens = new Map<string, ManejadorTween>();

  constructor(
    private readonly raiz: THREE.Group,
    private readonly interpolador: Interpolador,
  ) {}

  aplicar(
    vista: VistaPartida,
    cambios: readonly CambioVista[],
    seleccion: ReadonlySet<string>,
  ): void {
    const objetivos: MapaObjetivos = calcularDisposicion(vista, seleccion);
    const reparto = cambios.some((c) => c.tipo === "repartoInicial");
    if (reparto) this.reiniciar();

    for (const [clave, malla] of [...this.mallas]) {
      if (!objetivos.has(clave)) this.eliminar(clave, malla);
    }

    let ordenReparto = 0;
    for (const [clave, objetivo] of objetivos) {
      const existente = this.mallas.get(clave);
      if (existente !== undefined) {
        asignarInteraccion(existente, objetivo.interaccion);
        this.tweenHacia(clave, existente, objetivo.pose, 0);
        continue;
      }
      const malla =
        objetivo.carta !== null
          ? crearMallaCarta(objetivo.carta)
          : crearMallaDorso();
      asignarInteraccion(malla, objetivo.interaccion);
      const aparicion = reparto
        ? aparicionDeReparto(clave, objetivo, () => ordenReparto++)
        : aparicionSegunCambios(clave, objetivo, cambios, vista);
      colocar(malla, aparicion.pose);
      this.raiz.add(malla);
      this.mallas.set(clave, malla);
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

/** En el reparto todo sale del mazo, escalonado; la pila del mazo no viaja. */
function aparicionDeReparto(
  clave: string,
  objetivo: Objetivo,
  siguienteOrden: () => number,
): Aparicion {
  if (clave.startsWith("dorso:mazo:")) {
    return { pose: objetivo.pose, retraso: 0 };
  }
  return { pose: elevar(POSE_MAZO), retraso: siguienteOrden() * RETRASO_REPARTO };
}

/** De dónde aparece una malla nueva, según lo que el diff dice que pasó. */
function aparicionSegunCambios(
  clave: string,
  objetivo: Objetivo,
  cambios: readonly CambioVista[],
  vista: VistaPartida,
): Aparicion {
  for (const cambio of cambios) {
    switch (cambio.tipo) {
      case "roboPropio":
        if (clave === `carta:${cambio.carta.id}`) {
          return {
            pose: elevar(cambio.origen === "mazo" ? POSE_MAZO : POSE_POZO),
            retraso: 0,
          };
        }
        break;
      case "roboAjeno":
        if (clave.startsWith(`dorso:${cambio.jugadorId}:`)) {
          return {
            pose: elevar(cambio.origen === "mazo" ? POSE_MAZO : POSE_POZO),
            retraso: 0,
          };
        }
        break;
      case "descarte":
        if (clave === `carta:${cambio.carta.id}`) {
          return { pose: elevar(poseManoJugador(vista, cambio.jugadorId)), retraso: 0 };
        }
        break;
      case "bajada": {
        const enMesaNueva = cambio.mesaIdxNuevos.some(
          (idx) =>
            objetivo.interaccion.tipo === "combinacion" &&
            objetivo.interaccion.mesaIdx === idx,
        );
        if (enMesaNueva) {
          return { pose: elevar(poseManoJugador(vista, cambio.jugadorId)), retraso: 0 };
        }
        break;
      }
      case "pegada":
        if (clave === `carta:${cambio.cartaId}`) {
          return { pose: elevar(poseManoJugador(vista, cambio.jugadorId)), retraso: 0 };
        }
        break;
      case "reciclajeMazo":
        if (clave.startsWith("dorso:mazo:")) {
          return { pose: POSE_POZO, retraso: 0 };
        }
        break;
      default:
        break;
    }
  }
  // Sin explicación conocida: aparece directo en su lugar (la vista manda).
  return { pose: objetivo.pose, retraso: 0 };
}
