// Índice de la carpeta LOCAL del jugador: huella → archivo propio.
//
// Es la pieza que hace cumplir la regla de arquitectura CERRADA de REGLAS §1:
// «cada cliente lee su propia carpeta; el host NO envía archivos de audio a los
// peers». Del host solo llega la ORDEN (`pistaId` + `start_at`), y este índice la
// traduce a un archivo del disco de QUIEN ESTÁ JUGANDO. Si la pista no está en su
// carpeta, ese jugador simplemente no la puede sonar (§1): no se pide por red.
//
// Es el equivalente en el cliente de `CargaLocal.indiceArchivos` (S2), pero SOLO
// por huella: los títulos, el artista y el punto de inicio ya vienen en la vista
// del host, así que el cliente no necesita parsear ID3.

import { calcularHuella } from "@juegos/meloquiz-fuente-local/huella";
import { crearLectorMusicMetadata } from "@juegos/meloquiz-fuente-local/metadatosMusicMetadata";
import { crearSistemaArchivosFiles } from "./sistemaArchivosFiles.js";

/** Mismas extensiones que la fuente local del servidor (REGLAS §1). */
const EXTENSIONES = [".mp3", ".m4a", ".aac", ".flac", ".opus"];

function esSoportado(nombre: string): boolean {
  const bajo = nombre.toLowerCase();
  return EXTENSIONES.some((ext) => bajo.endsWith(ext));
}

export interface ResultadoIndexado {
  readonly indexados: number;
  /** Archivos de la carpeta que se saltearon por extensión o por ilegibles. */
  readonly omitidos: number;
}

/**
 * El índice local de un jugador. Vive fuera del ciclo de vida de `IJuego` porque
 * la carpeta se elige en el LOBBY (antes de que el juego se monte), y así la
 * ronda 1 ya encuentra su archivo en vez de perderse esperando el ack.
 */
export class IndiceLocal {
  private porHuella = new Map<string, File>();
  private urls = new Map<string, string>();
  /** Carátulas ya resueltas: pistaId → object URL, o null si no tiene arte. */
  private caratulas = new Map<string, string | null>();

  get tamano(): number {
    return this.porHuella.size;
  }

  get vacio(): boolean {
    return this.porHuella.size === 0;
  }

  /**
   * Indexa la carpeta elegida calculando la huella de cada archivo soportado.
   * Reemplaza el índice anterior (elegir otra carpeta empieza de cero).
   */
  async indexar(files: readonly File[]): Promise<ResultadoIndexado> {
    this.liberarUrls();
    const porHuella = new Map<string, File>();
    let omitidos = 0;

    const soportados = files.filter((f) => esSoportado(f.name));
    omitidos += files.length - soportados.length;

    const { sistema, archivos, fileDe } = crearSistemaArchivosFiles(soportados);
    for (const archivo of archivos) {
      try {
        const huella = await calcularHuella(sistema, archivo);
        const file = fileDe(archivo.clave);
        // Si dos archivos comparten huella son el MISMO contenido: da igual cuál
        // se toque. El servidor sí corta con error, porque ahí es ambigüedad de
        // catálogo; acá es solo una copia duplicada en la carpeta del jugador.
        if (file !== undefined) porHuella.set(huella, file);
      } catch {
        omitidos++; // archivo ilegible: no se puede identificar, se ignora.
      }
    }

    this.porHuella = porHuella;
    return { indexados: porHuella.size, omitidos };
  }

  /** ¿Este jugador tiene la pista que pidió el host? */
  tiene(pistaId: string): boolean {
    return this.porHuella.has(pistaId);
  }

  /**
   * URL reproducible de una pista, o `null` si no está en la carpeta. Se cachea
   * porque revocar y recrear en cada ronda cortaría la reproducción en curso.
   */
  urlDe(pistaId: string): string | null {
    const cacheada = this.urls.get(pistaId);
    if (cacheada !== undefined) return cacheada;
    const file = this.porHuella.get(pistaId);
    if (file === undefined) return null;
    const url = URL.createObjectURL(file);
    this.urls.set(pistaId, url);
    return url;
  }

  /**
   * Carátula embebida de una pista, como object URL, o `null` si el archivo no
   * tiene arte (o no está en la carpeta).
   *
   * Se parsea PEREZOSAMENTE, un archivo por ronda y recién al revelar: hacerlo
   * al elegir la carpeta obligaría a leer los tags de la librería entera (cientos
   * de archivos) para usar cuatro. El resultado se cachea, incluido el `null`,
   * así una pista sin arte no se reintenta cada vez.
   *
   * La vista NO trae ninguna clave de carátula (se quitó en S4: era un campo
   * muerto que filtraba el catálogo del host); los bytes viven en el disco de
   * cada jugador (§1), así que el cliente los saca de su propio archivo,
   * resuelto por `pistaId`.
   */
  async caratulaDe(pistaId: string): Promise<string | null> {
    const cacheada = this.caratulas.get(pistaId);
    if (cacheada !== undefined) return cacheada;

    const file = this.porHuella.get(pistaId);
    if (file === undefined) return null;

    let url: string | null = null;
    try {
      const { sistema, archivos } = crearSistemaArchivosFiles([file]);
      const archivo = archivos[0];
      if (archivo !== undefined) {
        const metadatos = await crearLectorMusicMetadata().leer(archivo, sistema);
        if (metadatos.caratula !== null) {
          const { bytes, tipoMime } = metadatos.caratula;
          // La copia no es de más: `Blob` exige un buffer que NO sea compartido,
          // y así el blob queda dueño de sus bytes.
          const copia = new Uint8Array(bytes);
          url = URL.createObjectURL(new Blob([copia], { type: tipoMime }));
        }
      }
    } catch {
      url = null; // archivo sin tags legibles: se cae al placeholder.
    }
    this.caratulas.set(pistaId, url);
    return url;
  }

  /** Libera los object URLs. Llamar al desmontar: si no, se filtran los blobs. */
  liberarUrls(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    for (const url of this.caratulas.values()) {
      if (url !== null) URL.revokeObjectURL(url);
    }
    this.caratulas.clear();
  }
}

/**
 * Índice compartido entre el panel del lobby (que elige la carpeta) y el juego
 * (que la consume al montarse). Es estado LOCAL del cliente y jamás viaja por
 * red — igual que el desfase de reloj de S4 (SPIKE §2.1).
 */
export const indiceLocal = new IndiceLocal();
