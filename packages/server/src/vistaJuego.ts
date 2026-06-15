// Punto de composición de las VISTAS por jugador (espejo de registroMotores.ts,
// que compone los motores). El canal de vista del orquestador/protocolo es
// GENÉRICO: viaja una `VistaJuego`, la unión de las formas de vista de cada
// juego. Cada juego del cliente confía en su selección local del hub y narra su
// propia forma; no se discrimina en el código del juego.
//
// Es type-only: se borra del bundle del navegador (no arrastra runtime). El
// cliente lo importa por el subpath `@juegos/server/vistaJuego`.

import type { VistaPartida } from "./vista.js";
import type { VistaMentiroso } from "./juegos/mentiroso/vistaMentiroso.js";

/** La vista que viaja por el canal genérico: la de cualquiera de los juegos. */
export type VistaJuego = VistaPartida | VistaMentiroso;

// Re-exporta las formas de Mentiroso (y los tipos de carta del core) para que el
// cliente las use SIN depender directamente de @juegos/mentiroso-core.
export type {
  JugadorVistaMentiroso,
  ResolucionVista,
  VistaMentiroso,
} from "./juegos/mentiroso/vistaMentiroso.js";
export type { Carta, Palo } from "@juegos/mentiroso-core";
