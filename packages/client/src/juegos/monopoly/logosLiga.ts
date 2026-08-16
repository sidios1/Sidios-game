// Escudos reales de las 8 ligas (Wikimedia Commons, uso privado — mismo
// criterio que las fotos de jugador/técnico y los logos de club: se
// descargaron una vez a packages/client/public/datos/logos-liga/ para
// servirlos same-origin, sin depender de un CDN externo con o sin CORS.

import type { NombreLiga } from "@juegos/monopoly-core";

const ARCHIVO_POR_LIGA: Readonly<Record<NombreLiga, string>> = {
  MLS: "MLS.png",
  "Arabia Saudita": "Arabia-Saudita.png",
  "Liga Portugal": "Liga-Portugal.png",
  "Ligue 1": "Ligue-1.png",
  Bundesliga: "Bundesliga.png",
  "Serie A": "Serie-A.png",
  "La Liga": "La-Liga.png",
  "Premier League": "Premier-League.png",
};

/** Ruta local del escudo de `liga` (same-origin, servido por Vite/build). */
export function rutaLogoLiga(liga: NombreLiga): string {
  return `/datos/logos-liga/${ARCHIVO_POR_LIGA[liga]}`;
}
