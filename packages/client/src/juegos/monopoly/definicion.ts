// La ficha de catálogo de Monopoly Ultimate Team para el hub. El hub solo lee
// esta definición; no conoce la clase JuegoMonopoly. `id: "monopoly"` debe
// coincidir con la clave del motor en registroMotores.ts (server).
//
// Sin `prepararHosteo`: el pool de sobres sale de la carpeta `datos/` que lee
// el proceso servidor (ver juegos/monopoly/cargarPool.ts), no de una elección
// del host en el cliente. Sin `crearConfigLobby` esta sesión: `rondasTotales`
// usa siempre el default del servidor (ver motorMonopoly.ts).

import type { DefinicionJuego } from "../../juego/ijuego.js";
import { JuegoMonopoly } from "./juegoMonopoly.js";
import { portadaMonopoly } from "./portada.js";

export const definicionMonopoly: DefinicionJuego = {
  id: "monopoly",
  nombre: "Monopoly Ultimate Team",
  descriptorCorto: "Recorré el tablero, ficha tu club y armá tu equipo definitivo.",
  jugadores: { min: 2, max: 8 },
  estado: "jugable",
  portada: { tipo: "componente", componente: portadaMonopoly },
  crear: () => new JuegoMonopoly(),
};
