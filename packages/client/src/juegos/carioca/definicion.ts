// La ficha de catálogo de Carioca para el hub. El hub solo lee esta definición
// (metadata de presentación + fábrica); no conoce la clase JuegoCarioca. Es la
// capa de REGISTRO del módulo: aquí se declara la ficha junto a la fábrica.

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoCarioca } from "./juegoCarioca.js";
import { portadaCarioca } from "./portada.js";

export const definicionCarioca: DefinicionJuego = {
  id: "carioca",
  nombre: "Carioca",
  descriptorCorto: "Juego de cartas por turnos: completa las 9 manos.",
  // Sin tope: los mazos escalan con la cantidad de jugadores (carioca-core).
  jugadores: { min: 2, max: null },
  estado: "jugable",
  portada: { tipo: "componente", componente: portadaCarioca },
  crear: () => new JuegoCarioca(),
};
