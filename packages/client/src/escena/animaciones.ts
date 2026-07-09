// Sincronizador de Carioca: adapta la VistaPartida al motor genérico de poses.
// La vista del servidor es la verdad: calcula las poses objetivo
// (`calcularDisposicion`) y el motor (`SincronizadorPoses`) lleva cada malla hacia
// ellas con tweens. Los `CambioVista` solo aportan DESDE DÓNDE aparece lo nuevo
// (mazo, pozo o la mano de un jugador) y el stagger del reparto.

import type * as THREE from "three";
import type { VistaPartida } from "@juegos/server/vista";
import type { CambioVista } from "../estado/difVista.js";
import type { MapaObjetivos, Objetivo, PresentacionMano } from "./disposicion.js";
import {
  calcularDisposicion,
  POSE_MAZO,
  POSE_POZO,
  poseManoJugador,
  PRESENTACION_VACIA,
} from "./disposicion.js";
import type { Interpolador } from "./interpolacion.js";
import { crearMallaCarta, crearMallaDorso } from "./mallaCarta.js";
import type { Aparicion } from "./sincronizadorPoses.js";
import { elevar, SincronizadorPoses } from "./sincronizadorPoses.js";

const RETRASO_REPARTO = 0.05;

export class Sincronizador {
  private readonly motor: SincronizadorPoses<Objetivo>;

  constructor(raiz: THREE.Group, interpolador: Interpolador) {
    this.motor = new SincronizadorPoses<Objetivo>(raiz, interpolador, (objetivo) =>
      objetivo.carta !== null ? crearMallaCarta(objetivo.carta) : crearMallaDorso(),
    );
  }

  /** La malla de una carta concreta (para que el arrastre la mueva en vivo). */
  mallaDeCarta(cartaId: string): THREE.Mesh | undefined {
    return this.motor.mallaDeCarta(cartaId);
  }

  aplicar(
    vista: VistaPartida,
    cambios: readonly CambioVista[],
    seleccion: ReadonlySet<string>,
    presentacion: PresentacionMano = PRESENTACION_VACIA,
  ): void {
    const objetivos: MapaObjetivos = calcularDisposicion(vista, seleccion, presentacion);
    const reparto = cambios.some((c) => c.tipo === "repartoInicial");
    this.motor.aplicar(objetivos, reparto, (clave, objetivo, siguienteOrden) =>
      reparto
        ? aparicionDeReparto(clave, objetivo, siguienteOrden)
        : aparicionSegunCambios(clave, objetivo, cambios, vista),
    );
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
