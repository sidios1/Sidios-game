// Baraja de Prensa Deportiva: las 16 cartas de REGLAS_MONOPOLY_ULTIMATE_TEAM.md
// §5, como datos tipados. El efecto de cada carta se aplica en
// cartasPrensaEfectos.ts; este archivo solo modela los datos y el mazo.
//
// Política de reciclado (asunción de esta sesión, el reglamento no la
// especifica): la carta usada vuelve al FONDO del mazo, convención de
// Monopoly clásico — así el mazo nunca se agota sin necesidad de rebarajar.

import { barajar, type GeneradorAleatorio } from "./aleatorio.js";
import { LIGAS, type NombreLiga } from "./tablero.js";

export type EfectoCartaPrensa =
  | { readonly tipo: "sobreMitadPrecio" } // #1
  | { readonly tipo: "recibirDinero"; readonly monto: number } // #2 #6 #9 #15
  | { readonly tipo: "perderTurno" } // #3
  | { readonly tipo: "perderJugadorAleatorio" } // #4
  | { readonly tipo: "irADescendido" } // #5
  | { readonly tipo: "pagarDinero"; readonly monto: number } // #7 #10 #14
  | { readonly tipo: "robarJugadorRival" } // #8
  | { readonly tipo: "avanzarASalida" } // #11
  | { readonly tipo: "retrocederCasillas"; readonly cantidad: number } // #12
  | { readonly tipo: "dobleFichaje" } // #13
  | { readonly tipo: "cambiarAgente" }; // #16

export interface CartaPrensa {
  readonly id: number;
  readonly titulo: string;
  readonly descripcion: string;
  readonly efecto: EfectoCartaPrensa;
}

/** Las 16 cartas, en el orden literal del §5. */
export const CARTAS_PRENSA_DEPORTIVA: readonly CartaPrensa[] = [
  {
    id: 1,
    titulo: "Fichaje bomba",
    descripcion: "tu próximo sobre cuesta mitad de precio",
    efecto: { tipo: "sobreMitadPrecio" },
  },
  {
    id: 2,
    titulo: "Viral en redes",
    descripcion: "recibe $50M en patrocinio",
    efecto: { tipo: "recibirDinero", monto: 50 },
  },
  {
    id: 3,
    titulo: "Escándalo de vestuario",
    descripcion: "pierdes 1 turno",
    efecto: { tipo: "perderTurno" },
  },
  {
    id: 4,
    titulo: "Lesión de último minuto",
    descripcion: "pierdes un jugador aleatorio de tu equipo",
    efecto: { tipo: "perderJugadorAleatorio" },
  },
  {
    id: 5,
    titulo: "Descendiste",
    descripcion: "vas directo a Descendido",
    efecto: { tipo: "irADescendido" },
  },
  {
    id: 6,
    titulo: "Entrevista exclusiva",
    descripcion: "recibe $25M",
    efecto: { tipo: "recibirDinero", monto: 25 },
  },
  {
    id: 7,
    titulo: "Crisis de resultados",
    descripcion: "paga $40M",
    efecto: { tipo: "pagarDinero", monto: 40 },
  },
  {
    id: 8,
    titulo: "Fichaje sorpresa",
    descripcion: "puedes robar un jugador de Mi Club de cualquier rival (si tiene alguno)",
    efecto: { tipo: "robarJugadorRival" },
  },
  {
    id: 9,
    titulo: "Renovación de contrato",
    descripcion: "recibe $35M",
    efecto: { tipo: "recibirDinero", monto: 35 },
  },
  {
    id: 10,
    titulo: "Rumor de salida",
    descripcion: "paga $30M en gastos de agente",
    efecto: { tipo: "pagarDinero", monto: 30 },
  },
  {
    id: 11,
    titulo: "Portada de revista",
    descripcion: "avanza hasta Nueva Temporada y cobra el paso",
    efecto: { tipo: "avanzarASalida" },
  },
  {
    id: 12,
    titulo: "Suspensión mediática",
    descripcion: "retrocede 3 casillas",
    efecto: { tipo: "retrocederCasillas", cantidad: 3 },
  },
  {
    id: 13,
    titulo: "Doble fichaje",
    descripcion: "compra dos sobres al precio de uno (misma liga)",
    efecto: { tipo: "dobleFichaje" },
  },
  {
    id: 14,
    titulo: "Fake news",
    descripcion: "paga $20M en gestión de crisis",
    efecto: { tipo: "pagarDinero", monto: 20 },
  },
  {
    id: 15,
    titulo: "Racha ganadora",
    descripcion: "recibe $60M",
    efecto: { tipo: "recibirDinero", monto: 60 },
  },
  {
    id: 16,
    titulo: "Cambio de agente",
    descripcion:
      "elige un jugador de Mi Club y cámbialo por un sobre nuevo de esa misma liga (si no tienes ningún jugador todavía, la carta no tiene efecto)",
    efecto: { tipo: "cambiarAgente" },
  },
];

/** Mazo barajado con el rng dado; llamado una sola vez al crear la partida. */
export function crearMazoPrensa(rng: GeneradorAleatorio): readonly CartaPrensa[] {
  return barajar(CARTAS_PRENSA_DEPORTIVA, rng);
}

/** Roba la de arriba; la usada vuelve al fondo (ver política de reciclado). */
export function robarCartaPrensa(
  mazo: readonly CartaPrensa[],
): { readonly carta: CartaPrensa; readonly mazo: readonly CartaPrensa[] } {
  const [carta, ...resto] = mazo;
  if (carta === undefined) throw new Error("el mazo de Prensa Deportiva está vacío");
  return { carta, mazo: [...resto, carta] };
}

/** Para la carta #13 (elección de liga): valida contra las 8 ligas del tablero. */
export function esNombreLigaValido(valor: string): valor is NombreLiga {
  return (LIGAS as readonly string[]).includes(valor);
}
