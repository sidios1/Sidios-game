// Apoyo de pruebas: un PoolPartida determinista para ejercitar el motor de
// MeloQuiz sin la fuente de catálogo local (que llega en S2). Vive en
// `src/pruebas` — excluido del tsconfig de build — para no viajar en dist ni
// meter datos de prueba en código de producción.

import type { PoolPartida } from "@juegos/meloquiz-core";

/** Pool determinista; el mínimo del reglamento son 4 canciones. */
export function poolMock(n = 4): PoolPartida {
  return {
    canciones: Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`,
      titulo: `Cancion ${i + 1}`,
      artista: `Artista ${i + 1}`,
      claveArchivo: `archivo-${i + 1}.mp3`,
      segundoInicio: 30 + i,
      claveCaratula: null,
      categoria: null,
    })),
  };
}

/** Marcador improbable: si aparece en un frame difundido, algo del pool se filtró. */
export const MARCA_SECRETA = "ZZ-NO-DEBE-VIAJAR-ZZ";

/**
 * Pool con los datos PRIVADOS del host marcados: `claveArchivo` (ruta en su
 * disco) y `claveCaratula` (clave contra su carga de metadatos) jamás deben
 * salir de la sala (REGLAS §1). El test de aislamiento difunde una partida
 * completa y verifica que la marca no viaja en ningún frame.
 */
export function poolMarcado(n = 4): PoolPartida {
  return {
    canciones: Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`,
      titulo: `Cancion ${i + 1}`,
      artista: `Artista ${i + 1}`,
      claveArchivo: `${MARCA_SECRETA}-ruta-${i + 1}.mp3`,
      segundoInicio: 30 + i,
      claveCaratula: `${MARCA_SECRETA}-caratula-${i + 1}`,
      categoria: null,
    })),
  };
}

export const JUGADORES_MELOQUIZ = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Bruno" },
];

/** rng determinista simple; no probamos el barajado, solo necesitamos repetibilidad. */
export function rngFijo(semillaInicial = 42): () => number {
  let semilla = semillaInicial;
  return () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };
}
