// Ficha de catálogo de Carioca Rumble para el hub. El hub solo lee esta
// definición (presentación + fábricas); no conoce JuegoRumble ni PanelConfigRumble.
// Es la capa de REGISTRO del módulo: game-id nuevo "carioca-rumble" (ya registrado
// en el servidor, packages/server/src/registroMotores.ts). La ficha es solo
// presentación; la config del panel vive en `crearConfigLobby` (no en la ficha).

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoRumble } from "./juegoRumble.js";
import { PanelConfigRumble } from "./panelConfig.js";
import { portadaRumble } from "./portada.js";

export const definicionRumble: DefinicionJuego = {
  id: "carioca-rumble",
  nombre: "Carioca Rumble",
  descriptorCorto: "Carioca con una habilidad aleatoria por ronda para cada jugador.",
  // Mismo cupo que Carioca: los mazos escalan con la cantidad de jugadores.
  jugadores: { min: 2, max: null },
  estado: "jugable",
  portada: { tipo: "componente", componente: portadaRumble },
  crear: () => new JuegoRumble(),
  crearConfigLobby: (alCambiar) => new PanelConfigRumble(alCambiar),
};
