// Layout de la mesa de UNO: dada una VistaUno, la pose objetivo de cada instancia
// visible. NO toca Three ni anima: devuelve datos que el motor genérico
// (SincronizadorPoses) convierte en mallas y tweens. La vista es la verdad.
//
// Claves de instancia:
//   carta:<id>       mi mano (caras reales) y el tope del descarte
//   dorso:mazo:<i>   pila del montón de robo (solo conteo)
//
// Las manos ajenas NO se dibujan: cada rival se representa por su insignia DOM
// (ver hudUno). El descarte muestra solo su carta de arriba.

import type { CartaUno, VistaUno } from "@juegos/server/vistaJuego";
import { posicionAsiento, radioAsientos } from "../../escena/dimensionesMesa.js";
import type { Pose } from "../../escena/disposicion.js";
import { POSE_MAZO, POSE_POZO } from "../../escena/disposicion.js";
import { GROSOR_CARTA } from "../../escena/mallaCarta.js";
import type { ObjetivoBase } from "../../escena/sincronizadorPoses.js";

export interface ObjetivoUno extends ObjetivoBase {
  /** Presente cuando la instancia muestra una cara real. */
  readonly carta: CartaUno | null;
}

export type MapaObjetivosUno = ReadonlyMap<string, ObjetivoUno>;

const BOCA_ABAJO = Math.PI / 2;

const MAX_DORSOS_MAZO = 8;

// Abanico de mi mano (mismos valores que Carioca para una estética consistente).
const BASELINE_Y_MANO = 1.15;
const LEVANTE_JUGABLE = 0.34; // las cartas jugables se asoman un poco
const Z_BASE_MANO = 4.7;
const PASO_Z_MANO = 0.02;
const GIRO_ABANICO = 0.045;

/** Jugadores AJENOS en orden de asiento, empezando por el que me sigue. */
function ajenosDesdeMi(vista: VistaUno): readonly string[] {
  const ids = vista.jugadores.map((j) => j.id);
  const miIndice = ids.indexOf(vista.tuJugadorId);
  if (miIndice < 0) return ids;
  return [...ids.slice(miIndice + 1), ...ids.slice(0, miIndice)];
}

/**
 * Centro del asiento de un jugador (ancla de su insignia). Yo, al frente, junto a
 * la cámara; los ajenos en un anillo justo fuera del fieltro, que crece con N.
 */
export function poseAsientoUno(vista: VistaUno, jugadorId: string): Pose {
  if (jugadorId === vista.tuJugadorId) {
    return { x: 0, y: 1.1, z: 4.7, rotX: -0.5, rotY: 0, rotZ: 0 };
  }
  const total = vista.jugadores.length;
  const ajenos = ajenosDesdeMi(vista);
  const indiceAjeno = ajenos.indexOf(jugadorId);
  const indiceGlobal = indiceAjeno < 0 ? 1 : indiceAjeno + 1;
  const asiento = posicionAsiento(indiceGlobal, total, radioAsientos(total));
  return {
    x: asiento.x,
    y: GROSOR_CARTA / 2,
    z: asiento.z,
    rotX: BOCA_ABAJO,
    rotY: 0,
    rotZ: -asiento.angulo,
  };
}

function poseMiCarta(slot: number, total: number, levantada: boolean): Pose {
  const espaciado = Math.min(0.68, 8.4 / Math.max(total, 1));
  const offset = (slot - (total - 1) / 2) * espaciado;
  return {
    x: offset,
    y: BASELINE_Y_MANO + (levantada ? LEVANTE_JUGABLE : 0),
    z: Z_BASE_MANO + slot * PASO_Z_MANO,
    rotX: -0.5,
    rotY: 0,
    rotZ: -offset * GIRO_ABANICO,
  };
}

/**
 * Calcula el layout objetivo de UNO. `jugables` son los ids de cartas que el
 * jugador puede jugar ahora (de accionesLegales): se asoman para guiar la jugada.
 */
export function calcularDisposicionUno(
  vista: VistaUno,
  jugables: ReadonlySet<string>,
): MapaObjetivosUno {
  const objetivos = new Map<string, ObjetivoUno>();

  // Mi mano en abanico.
  const total = vista.tuMano.length;
  vista.tuMano.forEach((carta, indice) => {
    objetivos.set(`carta:${carta.id}`, {
      pose: poseMiCarta(indice, total, jugables.has(carta.id)),
      carta,
      interaccion: { tipo: "cartaPropia", cartaId: carta.id },
    });
  });

  // Montón de robo: pila de dorsos (tope visual acotado).
  const dorsos = Math.min(vista.numeroMazo, MAX_DORSOS_MAZO);
  for (let i = 0; i < dorsos; i++) {
    objetivos.set(`dorso:mazo:${i}`, {
      pose: { ...POSE_MAZO, y: GROSOR_CARTA / 2 + i * 0.03 },
      carta: null,
      interaccion: { tipo: "mazo" },
    });
  }

  // Descarte: solo la carta de arriba, boca arriba. Marcada "pozo" para que el
  // arrastre de una carta sobre ella cuente como "jugar al descarte".
  if (vista.descarteTope !== null) {
    objetivos.set(`carta:${vista.descarteTope.id}`, {
      pose: { ...POSE_POZO, y: GROSOR_CARTA / 2 + 0.02 },
      carta: vista.descarteTope,
      interaccion: { tipo: "pozo" },
    });
  }

  return objetivos;
}
