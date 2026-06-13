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
import { factorEscala, posicionAsiento, radioAsientos } from "./dimensionesMesa.js";
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
  /**
   * La malla la controla el arrastre (no el tween): el sincronizador la
   * mantiene viva pero no la mueve. La pose es su lugar de reposo/retorno.
   */
  readonly congelado?: boolean;
}

export type MapaObjetivos = ReadonlyMap<string, Objetivo>;

/** Carta en arrastre activo y el hueco que reserva en la mano desmontada. */
export interface ArrastreVisual {
  readonly cartaId: string;
  readonly indiceDestino: number;
}

/** Estado de presentación de la mano propia (orden del cliente + arrastre). */
export interface PresentacionMano {
  /** Orden elegido por el jugador (ids); las ausentes caen al final. */
  readonly orden: readonly string[];
  readonly arrastre: ArrastreVisual | null;
  /** Ids que el cliente oculta de la mano (cartas cargadas en el modal de bajar). */
  readonly ocultas: ReadonlySet<string>;
}

export const PRESENTACION_VACIA: PresentacionMano = {
  orden: [],
  arrastre: null,
  ocultas: new Set(),
};

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

/**
 * Jugadores AJENOS en orden de asiento, empezando por el que me sigue. El total
 * de asientos (incl. el mío) es `vista.jugadores.length`; yo ocupo el asiento 0
 * (al frente) y los ajenos los asientos 1..N-1 en este orden.
 */
function ajenosDesdeMi(vista: VistaPartida): readonly string[] {
  const ids = vista.jugadores.map((j) => j.id);
  const miIndice = ids.indexOf(vista.tuJugadorId);
  if (miIndice < 0) return ids;
  return [...ids.slice(miIndice + 1), ...ids.slice(0, miIndice)];
}

/**
 * Centro del asiento de un jugador (ancla de su insignia y origen/destino de las
 * cartas que vuelan hacia/desde él). Yo, al frente, junto a la cámara; los ajenos
 * repartidos en un anillo JUSTO FUERA del borde del fieltro, que crece con N.
 */
export function poseManoJugador(vista: VistaPartida, jugadorId: string): Pose {
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
    // Giro radial: la base de la carta mira hacia el centro de la mesa.
    rotZ: -asiento.angulo,
  };
}

/** Espaciado de la mano desmontada (fila lado a lado). */
function espaciadoDesmontado(total: number): number {
  return Math.min(1.08, 13 / Math.max(total, 1));
}

/** Slot de la mano (desmontada) bajo una coordenada X del mundo. */
export function indiceManoDesdeX(x: number, total: number): number {
  if (total <= 0) return 0;
  const slot = Math.round(x / espaciadoDesmontado(total) + (total - 1) / 2);
  return Math.max(0, Math.min(slot, total - 1));
}

/**
 * Pose de una carta de mi mano en el "slot" dado.
 * - Montada (reposo): abanico solapado, con curva y giro.
 * - Desmontada (arrastrando): fila lado a lado, sin solape ni giro.
 */
function poseMiCarta(
  slot: number,
  total: number,
  seleccionada: boolean,
  montada: boolean,
): Pose {
  const espaciado = montada
    ? Math.min(0.68, 8.4 / Math.max(total, 1))
    : espaciadoDesmontado(total);
  const offset = (slot - (total - 1) / 2) * espaciado;
  const curva = montada ? Math.abs(offset) : 0;
  return {
    x: offset,
    y: 1.15 - curva * 0.05 + (seleccionada ? 0.42 : 0),
    z: 4.7 + curva * 0.08,
    rotX: -0.5,
    rotY: 0,
    rotZ: montada ? -offset * 0.045 : 0,
  };
}

/** Mano propia ordenada según la preferencia del cliente (ausentes al final). */
function ordenarMano(
  tuMano: readonly Carta[],
  orden: readonly string[],
): readonly Carta[] {
  const posicion = new Map(orden.map((id, i) => [id, i]));
  return [...tuMano].sort(
    (a, b) =>
      (posicion.get(a.id) ?? Number.POSITIVE_INFINITY) -
      (posicion.get(b.id) ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * Pose de una carta de una combinación bajada. La cuadrícula crece con N: más
 * columnas y más separación cuando hay más jugadores, para que las bajadas
 * quepan en el fieltro agrandado sin amontonarse ni rebosar.
 */
function poseCartaEnMesa(
  mesaIdx: number,
  indice: number,
  total: number,
  numJugadores: number,
): Pose {
  const f = factorEscala(numJugadores);
  const columnas = numJugadores > 4 ? 4 : 3;
  const columna = mesaIdx % columnas;
  const fila = Math.floor(mesaIdx / columnas);
  const baseX = (columna - (columnas - 1) / 2) * 4.5 * f;
  const baseZ = -1.3 - fila * 1.75 * f;
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
  presentacion: PresentacionMano = PRESENTACION_VACIA,
): MapaObjetivos {
  const objetivos = new Map<string, Objetivo>();

  // Mi mano: caras reales en el orden elegido por el cliente. Las cartas
  // ocultas (cargadas en el modal de bajar) se omiten del abanico; las
  // restantes re-abanican sin huecos porque `total` se recalcula.
  const manoOrdenada = ordenarMano(vista.tuMano, presentacion.orden);
  const mano =
    presentacion.ocultas.size === 0
      ? manoOrdenada
      : manoOrdenada.filter((c) => !presentacion.ocultas.has(c.id));
  const total = mano.length;
  const arrastre =
    presentacion.arrastre !== null &&
    mano.some((c) => c.id === presentacion.arrastre!.cartaId)
      ? presentacion.arrastre
      : null;

  if (arrastre === null) {
    // Reposo: abanico montado; las seleccionadas se levantan.
    mano.forEach((carta, indice) => {
      objetivos.set(`carta:${carta.id}`, {
        pose: poseMiCarta(indice, total, seleccion.has(carta.id), true),
        carta,
        interaccion: { tipo: "cartaPropia", cartaId: carta.id },
      });
    });
  } else {
    // Arrastrando: mano desmontada con un hueco reservado en indiceDestino
    // para la carta arrastrada (que el sincronizador deja congelada).
    const indiceDestino = Math.max(0, Math.min(arrastre.indiceDestino, total - 1));
    const otras = mano.filter((c) => c.id !== arrastre.cartaId);
    let cursor = 0;
    for (let slot = 0; slot < total; slot++) {
      const esHueco = slot === indiceDestino;
      const carta = esHueco
        ? mano.find((c) => c.id === arrastre.cartaId)
        : otras[cursor++];
      if (carta === undefined) continue;
      objetivos.set(`carta:${carta.id}`, {
        pose: poseMiCarta(slot, total, seleccion.has(carta.id), false),
        carta,
        interaccion: { tipo: "cartaPropia", cartaId: carta.id },
        congelado: esHueco,
      });
    }
  }

  // Las manos ajenas NO se dibujan en la mesa: cada rival se representa por su
  // perfil (avatar + nickname) fuera del fieltro (ver InsigniasMesa).

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
  const numJugadores = vista.jugadores.length;
  vista.mesa.forEach((enMesa, mesaIdx) => {
    const cartas = enMesa.combinacion.cartas;
    cartas.forEach((carta, indice) => {
      objetivos.set(`carta:${carta.id}`, {
        pose: poseCartaEnMesa(mesaIdx, indice, cartas.length, numJugadores),
        carta,
        interaccion: { tipo: "combinacion", mesaIdx },
      });
    });
  });

  return objetivos;
}
