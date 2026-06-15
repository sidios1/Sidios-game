// La carta de presentación de Mentiroso para el catálogo del hub. El hub solo
// lee esta definición (metadatos + fábrica); no conoce la clase JuegoMentiroso.

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoMentiroso } from "./juegoMentiroso.js";

export const definicionMentiroso: DefinicionJuego = {
  id: "mentiroso",
  nombre: "Mentiroso",
  descripcion:
    "Juego de faroleo: juega 1-3 cartas del palo de la ronda… o miente. 2 jugadores en adelante.",
  minJugadores: 2,
  // Sin tope: se reparte toda la baraja entre los jugadores (mentiroso-core).
  crear: () => new JuegoMentiroso(),
};
