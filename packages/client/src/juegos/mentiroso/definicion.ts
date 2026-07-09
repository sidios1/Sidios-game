// La ficha de catálogo de Mentiroso para el hub. El hub solo lee esta definición
// (metadata de presentación + fábrica); no conoce la clase JuegoMentiroso. Es la
// capa de REGISTRO del módulo: aquí se declara la ficha junto a la fábrica.
//
// estado: "en_desarrollo" → el hub muestra la tarjeta con badge pero la acción
// no lanza partida. Cambiar a "jugable" lo vuelve lanzable sin tocar nada más.

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoMentiroso } from "./juegoMentiroso.js";
import { portadaMentiroso } from "./portada.js";

export const definicionMentiroso: DefinicionJuego = {
  id: "mentiroso",
  nombre: "Mentiroso",
  descriptorCorto: "Juego de faroleo: juega tus cartas… o miente.",
  jugadores: { min: 3, max: 8 },
  estado: "en_desarrollo",
  portada: { tipo: "componente", componente: portadaMentiroso },
  crear: () => new JuegoMentiroso(),
};
