// Tablero de 40 celdas (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §2, §2.1, §3.1).
// Reskin EXACTO del tablero clásico de Monopoly: mismo orden espacial, mismas
// 40 posiciones relativas — solo cambian los nombres. Verificado 1:1 contra el
// tablero clásico (grupos de color → ligas, ferrocarriles → Resto del Mundo,
// servicios → Técnicos): el índice 4 (posición clásica de Income Tax) cae
// "entre la liga más barata [MLS] y el primer ferrocarril [Resto del Mundo en
// el 5]" y el índice 38 (posición clásica de Luxury Tax) cae "entre las dos
// celdas de Premier League [37 y 39]" — ambas restricciones literales del §2
// se cumplen con el mapeo clásico sin ajustes.
//
// Transcripción fiel del reglamento: si el tablero cambia, se edita
// REGLAS_MONOPOLY_ULTIMATE_TEAM.md primero y este archivo lo sigue.

export type NombreLiga =
  | "MLS"
  | "Arabia Saudita"
  | "Liga Portugal"
  | "Ligue 1"
  | "Bundesliga"
  | "Serie A"
  | "La Liga"
  | "Premier League";

/** Las 8 ligas, de más barata a más cara (§2). */
export const LIGAS: readonly NombreLiga[] = [
  "MLS",
  "Arabia Saudita",
  "Liga Portugal",
  "Ligue 1",
  "Bundesliga",
  "Serie A",
  "La Liga",
  "Premier League",
];

export type TipoCelda =
  | "salida"
  | "carcel"
  | "palcoDelClub"
  | "descensoALaB"
  | "liga"
  | "restoDelMundo"
  | "tecnicos"
  | "multaDoping"
  | "multaApuestas"
  | "prensaDeportiva"
  | "pausaDeHidratacion";

export interface CeldaLiga {
  readonly tipo: "liga";
  readonly indice: number;
  readonly liga: NombreLiga;
  readonly precio: number;
  /** Celda más cara de su liga: +20pp a Raro en el sorteo de tier (§3.2). */
  readonly esCeldaMasCara: boolean;
}
export interface CeldaRestoDelMundo {
  readonly tipo: "restoDelMundo";
  readonly indice: number;
  readonly precio: number;
}
export interface CeldaTecnicos {
  readonly tipo: "tecnicos";
  readonly indice: number;
  readonly precio: number;
}
export interface CeldaCorner {
  readonly tipo: "salida" | "carcel" | "palcoDelClub" | "descensoALaB";
  readonly indice: number;
}
export interface CeldaImpuesto {
  readonly tipo: "multaDoping" | "multaApuestas";
  readonly indice: number;
  readonly monto: number;
}
export interface CeldaEvento {
  readonly tipo: "prensaDeportiva" | "pausaDeHidratacion";
  readonly indice: number;
}

export type CeldaTablero =
  | CeldaLiga
  | CeldaRestoDelMundo
  | CeldaTecnicos
  | CeldaCorner
  | CeldaImpuesto
  | CeldaEvento;

function liga(indice: number, liga: NombreLiga, precio: number, esCeldaMasCara = false): CeldaLiga {
  return { tipo: "liga", indice, liga, precio, esCeldaMasCara };
}
function restoDelMundo(indice: number): CeldaRestoDelMundo {
  return { tipo: "restoDelMundo", indice, precio: 100 };
}
function tecnicos(indice: number): CeldaTecnicos {
  return { tipo: "tecnicos", indice, precio: 20 };
}
function corner(indice: number, tipo: CeldaCorner["tipo"]): CeldaCorner {
  return { tipo, indice };
}
function impuesto(indice: number, tipo: CeldaImpuesto["tipo"], monto: number): CeldaImpuesto {
  return { tipo, indice, monto };
}
function evento(indice: number, tipo: CeldaEvento["tipo"]): CeldaEvento {
  return { tipo, indice };
}

/** Las 40 celdas en orden espacial fijo (§2, §3.1). Índice del array = posición. */
export const TABLERO_MONOPOLY: readonly CeldaTablero[] = [
  corner(0, "salida"),
  liga(1, "MLS", 10),
  evento(2, "pausaDeHidratacion"),
  liga(3, "MLS", 20, true),
  impuesto(4, "multaDoping", 100),
  restoDelMundo(5),
  liga(6, "Arabia Saudita", 30),
  evento(7, "prensaDeportiva"),
  liga(8, "Arabia Saudita", 30),
  liga(9, "Arabia Saudita", 45, true),
  corner(10, "carcel"),
  liga(11, "Liga Portugal", 55),
  tecnicos(12),
  liga(13, "Liga Portugal", 55),
  liga(14, "Liga Portugal", 65, true),
  restoDelMundo(15),
  liga(16, "Ligue 1", 75),
  evento(17, "pausaDeHidratacion"),
  liga(18, "Ligue 1", 75),
  liga(19, "Ligue 1", 90, true),
  corner(20, "palcoDelClub"),
  liga(21, "Bundesliga", 100),
  evento(22, "prensaDeportiva"),
  liga(23, "Bundesliga", 100),
  liga(24, "Bundesliga", 110, true),
  restoDelMundo(25),
  liga(26, "Serie A", 120),
  liga(27, "Serie A", 120),
  tecnicos(28),
  liga(29, "Serie A", 135, true),
  corner(30, "descensoALaB"),
  liga(31, "La Liga", 145),
  liga(32, "La Liga", 145),
  evento(33, "pausaDeHidratacion"),
  liga(34, "La Liga", 155, true),
  restoDelMundo(35),
  evento(36, "prensaDeportiva"),
  liga(37, "Premier League", 170),
  impuesto(38, "multaApuestas", 50),
  liga(39, "Premier League", 200, true),
];

export function celdaEn(indice: number): CeldaTablero {
  const celda = TABLERO_MONOPOLY[((indice % 40) + 40) % 40];
  if (celda === undefined) throw new Error(`índice de celda fuera de rango: ${indice}`);
  return celda;
}

export function esCeldaComprable(
  celda: CeldaTablero,
): celda is CeldaLiga | CeldaRestoDelMundo | CeldaTecnicos {
  return celda.tipo === "liga" || celda.tipo === "restoDelMundo" || celda.tipo === "tecnicos";
}

export function celdasDeLiga(nombreLiga: NombreLiga): readonly CeldaLiga[] {
  return TABLERO_MONOPOLY.filter(
    (c): c is CeldaLiga => c.tipo === "liga" && c.liga === nombreLiga,
  );
}
