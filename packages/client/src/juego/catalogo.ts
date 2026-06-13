// Catálogo de juegos del hub: la raíz de composición. Es el ÚNICO archivo que
// conoce juegos concretos. Para agregar un juego nuevo se crea su carpeta en
// src/juegos/<nombre>/ y se añade aquí su DefinicionJuego; no se toca el hub
// (src/hub/) ni la capa de red (src/red/).

import type { DefinicionJuego } from "./ijuego.js";
import { definicionCarioca } from "../juegos/carioca/definicion.js";

export const CATALOGO: readonly DefinicionJuego[] = [definicionCarioca];
