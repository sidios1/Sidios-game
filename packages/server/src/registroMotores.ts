// Registro de motores de juego: mapea un game-id a la fábrica que arma la sala
// con su MotorJuego. Es la raíz de composición del servidor: el ÚNICO lugar que
// conoce juegos concretos. Para agregar un juego se crea su motor en
// src/juegos/<juego>/ y se añade aquí su entrada; no se toca el orquestador.
//
// La fábrica devuelve una SalaJuego (solo iniciar/detener): así el tipo de
// estado/acción de cada motor queda borrado en el límite del registro y motores
// con estados distintos conviven en el mismo mapa.

import type { GeneradorAleatorio } from "./motor.js";
import { Orquestador } from "./orquestador.js";
import type { Programador } from "./orquestador.js";
import type { TransporteServidor } from "./transporte.js";
import { crearMotorCarioca } from "./juegos/carioca/motorCarioca.js";
import { crearMotorMentiroso } from "./juegos/mentiroso/motorMentiroso.js";
import { crearMotorUno } from "./juegos/uno/motorUno.js";

/** Lo que el exterior necesita de una sala ya armada con su juego. */
export interface SalaJuego {
  iniciar(): Promise<string>;
  detener(): Promise<void>;
}

/** Opciones comunes a cualquier sala (no específicas de un juego). */
export interface OpcionesSala {
  readonly transporte: TransporteServidor;
  readonly rng?: GeneradorAleatorio;
  readonly generarToken?: () => string;
  readonly maxJugadores?: number;
  readonly programar?: Programador;
}

type FabricaSala = (opciones: OpcionesSala) => SalaJuego;

const REGISTRO: Readonly<Record<string, FabricaSala>> = {
  carioca: (opciones) => new Orquestador({ ...opciones, motor: crearMotorCarioca() }),
  mentiroso: (opciones) => new Orquestador({ ...opciones, motor: crearMotorMentiroso() }),
  uno: (opciones) => new Orquestador({ ...opciones, motor: crearMotorUno() }),
};

/** Crea la sala del juego pedido, o undefined si el game-id no está registrado. */
export function crearSala(juego: string, opciones: OpcionesSala): SalaJuego | undefined {
  const fabrica = REGISTRO[juego];
  return fabrica === undefined ? undefined : fabrica(opciones);
}

/** ¿Hay un motor registrado para este game-id? */
export function juegoRegistrado(juego: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRO, juego);
}
