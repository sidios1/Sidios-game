// Esquema visual celda→color/etiqueta (presentación pura). Los DATOS de cada
// celda (tipo, liga, precio) salen siempre de `celdaEn`/`TABLERO_MONOPOLY`
// (monopoly-core); este archivo solo mapea a color/nombre para no duplicar
// reglas.

import type { CeldaTablero, NombreLiga, TipoCelda } from "@juegos/monopoly-core";

/** 8 colores, de más barata (MLS) a más cara (Premier League), rampa arcoíris. */
export const COLOR_POR_LIGA: Readonly<Record<NombreLiga, string>> = {
  MLS: "#3fa34d",
  "Arabia Saudita": "#6fbf3f",
  "Liga Portugal": "#c9d13a",
  "Ligue 1": "#e0b23a",
  Bundesliga: "#e08a3a",
  "Serie A": "#e0603a",
  "La Liga": "#c73a5c",
  "Premier League": "#8a3ac7",
};

export const COLOR_RESTO_DEL_MUNDO = "#5a6b7a"; // slate
export const COLOR_TECNICOS = "#2fa39a"; // teal
export const COLOR_SALIDA = "#2fbf4f";
export const COLOR_CARCEL = "#6b6b6b";
export const COLOR_PALCO_DEL_CLUB = "#d4af37"; // dorado
export const COLOR_DESCENSO = "#c0392b";
export const COLOR_MULTA = "#e0672f";
export const COLOR_PRENSA = "#7a3ac0";
export const COLOR_PAUSA = "#7ec4e8";

const NOMBRE_POR_TIPO: Readonly<Record<Exclude<TipoCelda, "liga" | "restoDelMundo" | "tecnicos" | "multaDoping" | "multaApuestas">, string>> = {
  salida: "Nueva Temporada",
  carcel: "Cárcel (visita)",
  palcoDelClub: "Palco del Club",
  descensoALaB: "Descenso a la B",
  prensaDeportiva: "Prensa Deportiva",
  pausaDeHidratacion: "Pausa de Hidratación",
};

/** Color de fondo de la placa de una celda. */
export function colorDeCelda(celda: CeldaTablero): string {
  switch (celda.tipo) {
    case "liga":
      return COLOR_POR_LIGA[celda.liga];
    case "restoDelMundo":
      return COLOR_RESTO_DEL_MUNDO;
    case "tecnicos":
      return COLOR_TECNICOS;
    case "salida":
      return COLOR_SALIDA;
    case "carcel":
      return COLOR_CARCEL;
    case "palcoDelClub":
      return COLOR_PALCO_DEL_CLUB;
    case "descensoALaB":
      return COLOR_DESCENSO;
    case "multaDoping":
    case "multaApuestas":
      return COLOR_MULTA;
    case "prensaDeportiva":
      return COLOR_PRENSA;
    case "pausaDeHidratacion":
      return COLOR_PAUSA;
  }
}

/** Etiqueta de la celda (nombre + precio/monto cuando aplica). */
export function etiquetaDeCelda(celda: CeldaTablero): string {
  switch (celda.tipo) {
    case "liga":
      return `${celda.liga}\n$${celda.precio}M`;
    case "restoDelMundo":
      return `Resto del Mundo\n$${celda.precio}M`;
    case "tecnicos":
      return `Técnicos\n$${celda.precio}M`;
    case "multaDoping":
      return `Multa por Doping\n$${celda.monto}M`;
    case "multaApuestas":
      return `Multa por Apuestas\n$${celda.monto}M`;
    default:
      return NOMBRE_POR_TIPO[celda.tipo];
  }
}
