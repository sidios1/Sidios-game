// La carta de presentación de Carioca para el catálogo del hub. El hub solo
// lee esta definición (metadatos + fábrica); no conoce la clase JuegoCarioca.

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoCarioca } from "./juegoCarioca.js";

export const definicionCarioca: DefinicionJuego = {
  id: "carioca",
  nombre: "Carioca",
  descripcion: "Juego de cartas por turnos. Completa las 9 manos. 2 a 4 jugadores.",
  minJugadores: 2,
  maxJugadores: 4,
  crear: () => new JuegoCarioca(),
};
