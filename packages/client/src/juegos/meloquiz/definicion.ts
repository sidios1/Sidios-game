// La ficha de catálogo de MeloQuiz para el hub. Es la capa de REGISTRO del
// módulo: la ficha de presentación junto a la fábrica, el panel de lobby y los
// recursos de hosteo.
//
// `jugadores.min` es 1 porque el modo entrenamiento (REGLAS §6) lo permite; una
// partida normal sigue exigiendo 2 y quien lo hace cumplir es el motor, no esta
// ficha (que es solo presentación).
//
// `prepararHosteo` es el paso previo de "Crear partida" (REGLAS §1: el pool lo
// arma el HOST de su propia carpeta; a los peers solo les viaja la orden):
//  - "local" (app Tauri): el diálogo nativo da la RUTA de la carpeta, que viaja
//    al sidecar como env CARPETA_MUSICA; el pool lo arma ese proceso Node, igual
//    que dev.ts. La carpeta para REPRODUCIR se elige aparte en el lobby (la File
//    API no puede leer una ruta absoluta del disco).
//  - "online": no hay proceso aparte (el orquestador corre en el webview), así
//    que el pool se arma acá con la File API (poolLocal.ts) y de paso se indexa
//    la MISMA carpeta en indiceLocal: el host online no la vuelve a elegir.

import type { DefinicionJuego, RecursosHosteo } from "../../juego/ijuego.js";
import { hayServidorEmbebido } from "../../red/servidorEmbebido.js";
import { elegirCarpetaTauri, elegirCarpetaWeb } from "./elegirCarpeta.js";
import { indiceLocal } from "./indiceLocal.js";
import { JuegoMeloquiz } from "./juegoMeloquiz.js";
import { PanelConfigMeloquiz } from "./panelConfig.js";
import { armarPoolDeFiles } from "./poolLocal.js";
import { portadaMeloquiz } from "./portada.js";

async function prepararHosteo(modo: "local" | "online"): Promise<RecursosHosteo | null> {
  if (modo === "local") {
    // Solo se llega acá dentro de la app de escritorio (el botón "Crear partida"
    // local no existe en el navegador); el guard es defensivo.
    if (!hayServidorEmbebido()) {
      throw new Error("la sala LAN embebida solo existe en la app de escritorio");
    }
    const carpeta = await elegirCarpetaTauri();
    if (carpeta === null) return null; // canceló: sin sala y sin error.
    return { env: { CARPETA_MUSICA: carpeta } };
  }

  const files = await elegirCarpetaWeb();
  if (files === null) return null;
  const carga = await armarPoolDeFiles(files);
  if (!carga.ok) {
    throw new Error(`No se pudo armar el catálogo: ${carga.error.mensaje}`);
  }
  // La misma carpeta sirve para reproducir: el host no la re-elige en el lobby.
  await indiceLocal.indexar(files);
  return { opcionesSala: { poolMeloquiz: carga.valor.pool } };
}

export const definicionMeloquiz: DefinicionJuego = {
  id: "meloquiz",
  nombre: "MeloQuiz",
  descriptorCorto: "Adiviná la canción: todos escuchan el mismo clip a la vez.",
  jugadores: { min: 1, max: 8 },
  estado: "jugable",
  portada: { tipo: "componente", componente: portadaMeloquiz },
  crear: () => new JuegoMeloquiz(),
  crearConfigLobby: (alCambiar) => new PanelConfigMeloquiz(alCambiar),
  prepararHosteo,
};
