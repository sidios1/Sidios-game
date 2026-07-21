// La ficha de catálogo de MeloQuiz para el hub. Es la capa de REGISTRO del
// módulo: la ficha de presentación junto a la fábrica y al panel de lobby.
//
// `jugadores.min` es 1 porque el modo entrenamiento (REGLAS §6) lo permite; una
// partida normal sigue exigiendo 2 y quien lo hace cumplir es el motor, no esta
// ficha (que es solo presentación).

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoMeloquiz } from "./juegoMeloquiz.js";
import { PanelConfigMeloquiz } from "./panelConfig.js";
import { portadaMeloquiz } from "./portada.js";

export const definicionMeloquiz: DefinicionJuego = {
  id: "meloquiz",
  nombre: "MeloQuiz",
  descriptorCorto: "Adiviná la canción: todos escuchan el mismo clip a la vez.",
  jugadores: { min: 1, max: 8 },
  estado: "jugable",
  portada: { tipo: "componente", componente: portadaMeloquiz },
  crear: () => new JuegoMeloquiz(),
  crearConfigLobby: (alCambiar) => new PanelConfigMeloquiz(alCambiar),
};
