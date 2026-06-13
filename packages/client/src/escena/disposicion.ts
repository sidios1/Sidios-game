// Layout de la mesa: dado una VistaPartida, la pose objetivo de cada
// instancia visible. NO toca Three ni anima: devuelve datos que el
// sincronizador convierte en mallas y tweens. La vista es la verdad:
// este mapa ES la escena que debe quedar cuando todo deja de moverse.
//
// Claves de instancia:
//   carta:<id>            carta real visible (mi mano, tope del pozo, mesa)
//   dorso:mazo:<i>        pila del mazo
//   dorso:pozo:<i>        pila bajo el tope del pozo
//   dorso:<jugadorId>:<i> mano ajena (solo conteos: jamás sabemos qué son)

import type { Carta } from "@juegos/carioca-core";
import type { VistaPartida } from "@juegos/server/vista";
import type { DatosInteraccion } from "./mallaCarta.js";
import { GROSOR_CARTA } from "./mallaCarta.js";

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotX: number;
  readonly rotY: number;
  readonly rotZ: number;
}

export interface Objetivo {
  readonly pose: Pose;
  /** Presente cuando la instancia muestra una cara real. */
  readonly carta: Carta | null;
  readonly interaccion: DatosInteraccion;
}

export type MapaObjetivos = ReadonlyMap<string, Objetivo>;

const BOCA_ARRIBA = -Math.PI / 2;
const BOCA_ABAJO = Math.PI / 2;

export const POSE_MAZO: Pose = {
  x: -1.3,
  y: GROSOR_CARTA / 2,
  z: 0.9,
  rotX: BOCA_ABAJO,
  rotY: 0,
  rotZ: 0,
};

export const POSE_POZO: Pose = {
  x: 1.3,
  y: GROSOR_CARTA / 2,
  z: 0.9,
  rotX: BOCA_ARRIBA,
  rotY: 0,
  rotZ: 0,
};

const MAX_DORSOS_MAZO = 8;
const MAX_DORSOS_POZO = 4;

interface AsientoAjeno {
  readonly centroX: number;
  readonly centroZ: number;
  /** Dirección (x,z) en la que se despliega la fila de dorsos. */
  readonly dirX: number;
  readonly dirZ: number;
  /** Giro en el plano de la mesa para orientar la fila. */
  readonly espin: number;
}

const ARRIBA: AsientoAjeno = { centroX: 0, centroZ: -4.4, dirX: 1, dirZ: 0, espin: 0 };
const IZQUIERDA: AsientoAjeno = {
  centroX: -4.6,
  centroZ: -0.6,
  dirX: 0,
  dirZ: 1,
  espin: Math.PI / 2,
};
const DERECHA: AsientoAjeno = {
  centroX: 4.6,
  centroZ: -0.6,
  dirX: 0,
  dirZ: -1,
  espin: -Math.PI / 2,
};

function asientosAjenos(cantidad: number): readonly AsientoAjeno[] {
  if (cantidad <= 1) return [ARRIBA];
  if (cantidad === 2) return [IZQUIERDA, DERECHA];
  return [IZQUIERDA, ARRIBA, DERECHA];
}

/** Jugadores ajenos en orden de asiento, empezando por el que me sigue. */
function ajenosDesdeMi(vista: VistaPartida): readonly string[] {
  const ids = vista.jugadores.map((j) => j.id);
  const miIndice = ids.indexOf(vista.tuJugadorId);
  if (miIndice < 0) return ids;
  return [...ids.slice(miIndice + 1), ...ids.slice(0, miIndice)];
}

/** Centro de la mano de un jugador (para que las animaciones sepan de dónde sale una carta). */
export function poseManoJugador(vista: VistaPartida, jugadorId: string): Pose {
  if (jugadorId === vista.tuJugadorId) {
    return { x: 0, y: 1.1, z: 4.7, rotX: -0.5, rotY: 0, rotZ: 0 };
  }
  const ajenos = ajenosDesdeMi(vista);
  const asientos = asientosAjenos(ajenos.length);
  const indice = ajenos.indexOf(jugadorId);
  const asiento = asientos[Math.max(indice, 0)] ?? ARRIBA;
  return {
    x: asiento.centroX,
    y: GROSOR_CARTA / 2,
    z: asiento.centroZ,
    rotX: BOCA_ABAJO,
    rotY: 0,
    rotZ: asiento.espin,
  };
}

function poseMiCarta(
  indice: number,
  total: number,
  seleccionada: boolean,
): Pose {
  const espaciado = Math.min(0.68, 8.4 / Math.max(total, 1));
  const offset = (indice - (total - 1) / 2) * espaciado;
  return {
    x: offset,
    y: 1.15 - Math.abs(offset) * 0.05 + (seleccionada ? 0.42 : 0),
    z: 4.7 + Math.abs(offset) * 0.08,
    rotX: -0.5,
    rotY: 0,
    rotZ: -offset * 0.045,
  };
}

function poseDorsoAjeno(asiento: AsientoAjeno, indice: number, total: number): Pose {
  const espaciado = Math.min(0.34, 3.6 / Math.max(total, 1));
  const offset = (indice - (total - 1) / 2) * espaciado;
  return {
    x: asiento.centroX + asiento.dirX * offset,
    y: GROSOR_CARTA / 2 + 0.001 * indice,
    z: asiento.centroZ + asiento.dirZ * offset,
    rotX: BOCA_ABAJO,
    rotY: 0,
    rotZ: asiento.espin,
  };
}

const COMBOS_POR_FILA = 3;

function poseCartaEnMesa(mesaIdx: number, indice: number, total: number): Pose {
  const columna = mesaIdx % COMBOS_POR_FILA;
  const fila = Math.floor(mesaIdx / COMBOS_POR_FILA);
  const baseX = (columna - 1) * 4.5;
  const baseZ = -1.3 - fila * 1.75;
  const offset = (indice - (total - 1) / 2) * 0.42;
  return {
    x: baseX + offset,
    y: GROSOR_CARTA / 2 + indice * 0.004,
    z: baseZ,
    rotX: BOCA_ARRIBA,
    rotY: 0,
    rotZ: 0,
  };
}

export function calcularDisposicion(
  vista: VistaPartida,
  seleccion: ReadonlySet<string>,
): MapaObjetivos {
  const objetivos = new Map<string, Objetivo>();

  // Mi mano: caras reales en abanico, las seleccionadas se levantan.
  vista.tuMano.forEach((carta, indice) => {
    objetivos.set(`carta:${carta.id}`, {
      pose: poseMiCarta(indice, vista.tuMano.length, seleccion.has(carta.id)),
      carta,
      interaccion: { tipo: "cartaPropia", cartaId: carta.id },
    });
  });

  // Manos ajenas: solo dorsos, tantos como diga el conteo.
  const ajenos = ajenosDesdeMi(vista);
  const asientos = asientosAjenos(ajenos.length);
  ajenos.forEach((jugadorId, indiceAsiento) => {
    const asiento = asientos[indiceAsiento] ?? ARRIBA;
    const cantidad =
      vista.jugadores.find((j) => j.id === jugadorId)?.numeroCartas ?? 0;
    for (let i = 0; i < cantidad; i++) {
      objetivos.set(`dorso:${jugadorId}:${i}`, {
        pose: poseDorsoAjeno(asiento, i, cantidad),
        carta: null,
        interaccion: { tipo: "decoracion" },
      });
    }
  });

  // Mazo: pila de dorsos (con tope visual de MAX_DORSOS_MAZO).
  const dorsosMazo = Math.min(vista.numeroMazo, MAX_DORSOS_MAZO);
  for (let i = 0; i < dorsosMazo; i++) {
    objetivos.set(`dorso:mazo:${i}`, {
      pose: { ...POSE_MAZO, y: GROSOR_CARTA / 2 + i * 0.03 },
      carta: null,
      interaccion: { tipo: "mazo" },
    });
  }

  // Pozo: pila anónima + el tope boca arriba (la única carta conocida).
  const dorsosPozo = Math.min(Math.max(vista.numeroPozo - 1, 0), MAX_DORSOS_POZO);
  for (let i = 0; i < dorsosPozo; i++) {
    objetivos.set(`dorso:pozo:${i}`, {
      pose: { ...POSE_POZO, y: GROSOR_CARTA / 2 + i * 0.02, rotX: BOCA_ABAJO },
      carta: null,
      interaccion: { tipo: "pozo" },
    });
  }
  if (vista.pozoTope !== null) {
    objetivos.set(`carta:${vista.pozoTope.id}`, {
      pose: { ...POSE_POZO, y: GROSOR_CARTA / 2 + dorsosPozo * 0.02 + 0.02 },
      carta: vista.pozoTope,
      interaccion: { tipo: "pozo" },
    });
  }

  // Mesa: combinaciones bajadas, caras arriba, clickeables para pegar.
  vista.mesa.forEach((enMesa, mesaIdx) => {
    const cartas = enMesa.combinacion.cartas;
    cartas.forEach((carta, indice) => {
      objetivos.set(`carta:${carta.id}`, {
        pose: poseCartaEnMesa(mesaIdx, indice, cartas.length),
        carta,
        interaccion: { tipo: "combinacion", mesaIdx },
      });
    });
  });

  return objetivos;
}
