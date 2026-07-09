// La ficha de catálogo de UNO para el hub. El hub solo lee esta definición
// (metadata de presentación + fábrica); no conoce la clase JuegoUno. Es la capa
// de REGISTRO del módulo: aquí se declara la ficha junto a la fábrica.

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoUno } from "./juegoUno.js";
import { portadaUno } from "./portada.js";

export const definicionUno: DefinicionJuego = {
  id: "uno",
  nombre: "UNO",
  descriptorCorto: "Clásico de colores y números: quédate sin cartas.",
  jugadores: { min: 2, max: 10 },
  estado: "jugable",
  portada: { tipo: "componente", componente: portadaUno },
  crear: () => new JuegoUno(),
};
