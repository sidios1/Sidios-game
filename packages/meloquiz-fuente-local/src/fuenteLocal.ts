// Fuente LOCAL de catálogo (REGLAS_MELOQUIZ.md §1, §2, §8).
//
// Lee una carpeta de audio del disco, extrae tags + carátula, normaliza títulos y
// arma el `PoolPartida` que consume el núcleo. Sin red, sin scraping, sin
// descargas: la app solo toca lo que ya está en disco (§1, regla CERRADA).
//
// Los 3 distractores por ronda NO se arman aquí: `armarRonda` del núcleo baraja
// las otras canciones del mismo pool (§5). La fuente solo garantiza que haya al
// menos el mínimo del reglamento con títulos distinguibles.

import {
  REGLAS_MELOQUIZ,
  error,
  ok,
  validarPool,
  type CancionPool,
  type IFuenteCatalogo,
  type PoolPartida,
  type Resultado,
} from "@juegos/meloquiz-core";

import { calcularHuella } from "./huella.js";
import type { CaratulaEmbebida, ILectorMetadatos } from "./metadatos.js";
import { quitarExtension, resolverTituloYArtista } from "./normalizarTitulo.js";
import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";

/** Formatos soportados (§1): reproducibles en WebView2 vía `<audio>`. */
export const EXTENSIONES_SOPORTADAS: readonly string[] = [
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".opus",
];

/** Fracción del archivo donde arranca el clip: inicio fijo ~30% (§1). */
export const FRACCION_INICIO = 0.3;

/** Por qué se descartó cada archivo (§2: se excluye y se cuenta). */
export interface ResumenDescartes {
  readonly total: number;
  readonly porFormatoNoSoportado: number;
  readonly porIlegible: number;
  readonly porSinDuracion: number;
  readonly porSinTitulo: number;
  /** Nombres de los descartados, para poder decírselo al usuario. */
  readonly nombres: readonly string[];
}

/**
 * Lo que produce la fuente local: el pool que viaja al núcleo MÁS lo que el
 * contrato de S1 no transporta (bytes de carátula e índice de archivos, que se
 * quedan en el cliente que leyó su propia carpeta).
 */
export interface CargaLocal {
  readonly pool: PoolPartida;
  /** `claveArchivo` → clave del sistema de archivos (ruta real). */
  readonly indiceArchivos: ReadonlyMap<string, string>;
  /** `claveCaratula` → bytes de la carátula embebida. */
  readonly caratulas: ReadonlyMap<string, CaratulaEmbebida>;
  readonly descartados: ResumenDescartes;
}

export interface OpcionesFuenteLocal {
  readonly carpeta: string;
  readonly sistemaArchivos: ISistemaArchivos;
  readonly lectorMetadatos: ILectorMetadatos;
  /**
   * Categorías (subcarpetas de primer nivel, REGLAS_MELOQUIZ §11) a incluir;
   * `null`/`undefined` = todas. Los archivos sueltos en la raíz (categoria
   * `null` en `ArchivoLocal`) SIEMPRE entran, no pertenecen a ninguna
   * categoría filtrable.
   */
  readonly categoriasSeleccionadas?: readonly string[] | null;
}

/**
 * La fuente local cumple `IFuenteCatalogo` tal cual lo declaró S1 y AÑADE
 * `cargarDetallado()`. Sumar miembros no altera el contrato del núcleo: quien
 * solo conoce el puerto sigue viendo `id` + `cargar()`.
 */
export interface FuenteLocal extends IFuenteCatalogo {
  cargarDetallado(): Promise<Resultado<CargaLocal>>;
}

function esSoportado(nombre: string): boolean {
  const minuscula = nombre.toLowerCase();
  return EXTENSIONES_SOPORTADAS.some((extension) => minuscula.endsWith(extension));
}

interface Descartes {
  porFormatoNoSoportado: number;
  porIlegible: number;
  porSinDuracion: number;
  porSinTitulo: number;
  nombres: string[];
}

type MotivoDescarte = Exclude<keyof Descartes, "nombres">;

/** ¿Entra `categoria` según la selección del host (§11)? Sueltos siempre entran. */
function categoriaSeleccionada(
  categoria: string | null,
  categoriasSeleccionadas: readonly string[] | null | undefined,
): boolean {
  if (categoria === null) return true;
  if (categoriasSeleccionadas === null || categoriasSeleccionadas === undefined) return true;
  return categoriasSeleccionadas.includes(categoria);
}

export function crearFuenteLocal(opciones: OpcionesFuenteLocal): FuenteLocal {
  const { carpeta, sistemaArchivos, lectorMetadatos, categoriasSeleccionadas } = opciones;

  async function cargarDetallado(): Promise<Resultado<CargaLocal>> {
    const listado = await sistemaArchivos.listar(carpeta);
    const entradas = listado.filter((archivo) =>
      categoriaSeleccionada(archivo.categoria, categoriasSeleccionadas),
    );

    const descartes: Descartes = {
      porFormatoNoSoportado: 0,
      porIlegible: 0,
      porSinDuracion: 0,
      porSinTitulo: 0,
      nombres: [],
    };
    const descartar = (archivo: ArchivoLocal, motivo: MotivoDescarte): void => {
      descartes[motivo] += 1;
      descartes.nombres.push(archivo.nombre);
    };

    const canciones: CancionPool[] = [];
    const indiceArchivos = new Map<string, string>();
    const caratulas = new Map<string, CaratulaEmbebida>();
    /** id → nombre del archivo que lo generó; alimenta el guardián de colisión. */
    const duenoDelId = new Map<string, string>();

    for (const archivo of entradas) {
      if (!esSoportado(archivo.nombre)) {
        descartar(archivo, "porFormatoNoSoportado");
        continue;
      }

      // Un archivo corrupto no puede tumbar la carga entera: se excluye y se
      // cuenta (§2).
      let metadatos;
      try {
        metadatos = await lectorMetadatos.leer(archivo, sistemaArchivos);
      } catch {
        descartar(archivo, "porIlegible");
        continue;
      }

      const duracion = metadatos.duracionSegundos;
      if (duracion === null || !Number.isFinite(duracion) || duracion <= 0) {
        descartar(archivo, "porSinDuracion");
        continue;
      }

      const { titulo, artista } = resolverTituloYArtista(
        metadatos.titulo,
        metadatos.artista,
        archivo.nombre,
      );
      // Último recurso antes de descartar: el nombre crudo sin extensión.
      const tituloFinal = titulo.length > 0 ? titulo : quitarExtension(archivo.nombre).trim();
      if (tituloFinal.length === 0) {
        descartar(archivo, "porSinTitulo");
        continue;
      }

      let id: string;
      try {
        id = await calcularHuella(sistemaArchivos, archivo);
      } catch {
        descartar(archivo, "porIlegible");
        continue;
      }

      // ── GUARDIÁN DE COLISIÓN ──────────────────────────────────────────────
      // Dos canciones con el mismo id producen un `pistaId` ambiguo y corrompen
      // el emparejamiento voto→respuesta a mitad de partida. El fallo tiene que
      // ser ruidoso y temprano: se corta la carga, no se descarta en silencio.
      const anterior = duenoDelId.get(id);
      if (anterior !== undefined) {
        return error(
          "POOL_INVALIDO",
          `dos archivos producen el mismo identificador de pista: "${anterior}" y ` +
            `"${archivo.nombre}". Quitá el duplicado de la carpeta y volvé a cargar.`,
        );
      }
      duenoDelId.set(id, archivo.nombre);

      const claveCaratula = metadatos.caratula === null ? null : `${id}#caratula`;
      if (metadatos.caratula !== null && claveCaratula !== null) {
        caratulas.set(claveCaratula, metadatos.caratula);
      }

      indiceArchivos.set(archivo.nombre, archivo.clave);
      canciones.push({
        id,
        titulo: tituloFinal,
        artista,
        claveArchivo: archivo.nombre,
        segundoInicio: duracion * FRACCION_INICIO,
        claveCaratula,
        categoria: archivo.categoria,
      });
    }

    const pool: PoolPartida = { canciones };
    // El mínimo (4) y la unicidad de ids los dicta el reglamento a través del
    // núcleo: no se reimplementan acá.
    const validado = validarPool(pool);
    if (!validado.ok) return validado;

    return ok({
      pool,
      indiceArchivos,
      caratulas,
      descartados: {
        total: descartes.nombres.length,
        porFormatoNoSoportado: descartes.porFormatoNoSoportado,
        porIlegible: descartes.porIlegible,
        porSinDuracion: descartes.porSinDuracion,
        porSinTitulo: descartes.porSinTitulo,
        nombres: descartes.nombres,
      },
    });
  }

  return {
    id: "local",
    async cargar(): Promise<PoolPartida> {
      const resultado = await cargarDetallado();
      if (!resultado.ok) throw new Error(resultado.error.mensaje);
      return resultado.valor.pool;
    },
    cargarDetallado,
  };
}

/** Mínimo de canciones para poder jugar; lo fija el reglamento, no este módulo. */
export const MINIMO_CANCIONES = REGLAS_MELOQUIZ.minimoCanciones;
