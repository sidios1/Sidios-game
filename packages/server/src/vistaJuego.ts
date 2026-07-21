// Punto de composición de las VISTAS por jugador (espejo de registroMotores.ts,
// que compone los motores). El canal de vista del orquestador/protocolo es
// GENÉRICO: viaja una `VistaJuego`, la unión DISCRIMINADA de las formas de vista
// de cada juego. El discriminante es el campo `juego` (= game-id) presente en las
// cinco variantes: "carioca", "carioca-rumble", "mentiroso", "uno", "meloquiz".
// Cada juego
// del cliente narra su propia forma (por método bivariante) confiando en su
// selección local del hub; el discriminante hace ese narrowing SEGURO y permite
// estrechar a cualquier variante con `vista.juego === "..."`.
//
// Es type-only: se borra del bundle del navegador (no arrastra runtime). El
// cliente lo importa por el subpath `@juegos/server/vistaJuego`.

import type { VistaPartida } from "./vista.js";
import type { VistaRumble } from "./juegos/carioca/vistaRumble.js";
import type { VistaMentiroso } from "./juegos/mentiroso/vistaMentiroso.js";
import type { VistaUno } from "@juegos/uno-core";
import type { VistaMeloquizSala } from "./juegos/meloquiz/vistaMeloquiz.js";

/** La vista que viaja por el canal genérico: la de cualquiera de los juegos. */
export type VistaJuego =
  | VistaPartida
  | VistaRumble
  | VistaMentiroso
  | VistaUno
  | VistaMeloquizSala;

// Re-exporta la forma de Rumble (y sus tipos) para que el cliente la use por
// `@juegos/server/vistaJuego` SIN depender directamente de rumble-core.
export type {
  VistaRumble,
  VistaRumbleJugador,
  HabilidadVista,
} from "./juegos/carioca/vistaRumble.js";
export type {
  EventoRumble,
  TipoEventoRumble,
  Ubicacion,
  RevelacionMish,
} from "./juegos/carioca/estadoRumble.js";
export type { HabilidadId } from "@juegos/rumble-core";

// Re-exporta las formas de Mentiroso (y los tipos de carta del core) para que el
// cliente las use SIN depender directamente de @juegos/mentiroso-core.
export type {
  JugadorVistaMentiroso,
  ResolucionVista,
  VistaMentiroso,
} from "./juegos/mentiroso/vistaMentiroso.js";
export type { Carta, Palo } from "@juegos/mentiroso-core";

// Re-exporta las formas de UNO (y sus tipos de carta) para que el cliente las use
// SIN depender directamente de @juegos/uno-core. Se aliasan los tipos de carta para
// no colisionar con el `Carta` de Mentiroso re-exportado arriba.
export type { JugadorVistaUno, VistaUno } from "@juegos/uno-core";
export type { Carta as CartaUno, Color as ColorUno } from "@juegos/uno-core";

// Re-exporta la forma de MeloQuiz (y sus tipos) para que el cliente la use SIN
// depender directamente de @juegos/meloquiz-core.
export type {
  JugadorVistaMeloquizSala,
  VistaMeloquizSala,
} from "./juegos/meloquiz/vistaMeloquiz.js";
export type {
  ClaveFase,
  JugadorVistaMeloquiz,
  VistaMeloquiz,
} from "@juegos/meloquiz-core";
