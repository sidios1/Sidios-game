// Contrato de la fuente de catálogo (REGLAS_MELOQUIZ.md §1, §2, §8).
//
// El núcleo consume un `PoolPartida` YA ARMADO y es agnóstico de dónde salió:
// no sabe leer carpetas, no extrae tags ID3, no normaliza títulos. Todo eso es
// trabajo de la fuente. v1 tiene una sola implementación (LOCAL, sesión S2),
// pero el contrato queda abstracto por si a futuro se suma otra.

import { error, ok, type Resultado } from "./resultado.js";
import { REGLAS_MELOQUIZ } from "./reglas.js";

/** Una canción ya lista para jugar: título normalizado y punto de inicio fijado. */
export interface CancionPool {
  /**
   * Identificador OPACO de la pista.
   *
   * ⚠️ VINCULANTE PARA S2: debe derivarse del CONTENIDO (hash) y NO del nombre
   * del archivo ni del título. Es el único identificador de pista que viaja en
   * la vista durante `clip` (la orden "reproduzcan esta pista"), así que un id
   * que codificara el título filtraría la respuesta antes de tiempo y rompería
   * la invariante de ocultamiento (SPIKE_MELOQUIZ.md §6.4).
   */
  readonly id: string;
  /** Título YA normalizado por la fuente (§2): es literalmente el texto del botón. */
  readonly titulo: string;
  readonly artista: string | null;
  /**
   * Clave del archivo local en el índice del cliente. NO viaja en la vista: cada
   * cliente resuelve `id → archivo` contra su propia carpeta (regla host↛peer,
   * §1 CERRADA — nunca viajan bytes de audio).
   */
  readonly claveArchivo: string;
  /** Segundo desde el que arranca el clip (~30% del archivo, §1). */
  readonly segundoInicio: number;
  /** Clave de la carátula embebida; null ⇒ el cliente usa un placeholder (§1). */
  readonly claveCaratula: string | null;
}

/** El material de una partida: las canciones válidas de la fuente. */
export interface PoolPartida {
  readonly canciones: readonly CancionPool[];
}

/**
 * Puerto de una fuente de catálogo. El núcleo NUNCA llama `cargar()`: solo
 * declara la forma para que la fuente LOCAL (S2) la implemente y el servidor
 * inyecte el pool ya resuelto en `crearPartida`.
 */
export interface IFuenteCatalogo {
  /** Identificador de la fuente; v1: "local". */
  readonly id: string;
  cargar(): Promise<PoolPartida>;
}

/**
 * Valida que un pool sirva para jugar (§2): mínimo de canciones, ids únicos y
 * no vacíos, títulos no vacíos y punto de inicio no negativo.
 */
export function validarPool(pool: PoolPartida): Resultado<PoolPartida> {
  const { canciones } = pool;
  const minimo = REGLAS_MELOQUIZ.minimoCanciones;
  if (canciones.length < minimo) {
    return error(
      "POOL_INVALIDO",
      `se necesitan al menos ${minimo} canciones válidas para jugar`,
    );
  }
  const ids = canciones.map((c) => c.id);
  if (ids.some((id) => id.length === 0)) {
    return error("POOL_INVALIDO", "hay una canción con id vacío");
  }
  if (new Set(ids).size !== ids.length) {
    return error("POOL_INVALIDO", "hay ids de canción duplicados");
  }
  if (canciones.some((c) => c.titulo.length === 0)) {
    return error("POOL_INVALIDO", "hay una canción con título vacío");
  }
  if (canciones.some((c) => !Number.isFinite(c.segundoInicio) || c.segundoInicio < 0)) {
    return error("POOL_INVALIDO", "hay una canción con segundo de inicio inválido");
  }
  return ok(pool);
}
