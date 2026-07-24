// Adaptador de `ISistemaArchivos` sobre la File API del NAVEGADOR: el gemelo de
// `crearSistemaArchivosNode` del lado cliente (REGLAS §8, "el cliente sustituye
// el sistema de archivos sin tocar el resto").
//
// Existe por una razón muy concreta: la huella que identifica una pista la
// calcula el SERVIDOR al armar el pool, y el cliente tiene que llegar al MISMO
// hash para resolver `pistaId` → archivo propio. Reimplementar el algoritmo sería
// duplicarlo con riesgo de divergir, así que se reusa `calcularHuella` tal cual
// y lo único que cambia es de dónde salen los bytes.
//
// La carpeta llega de un <input type="file" webkitdirectory>, así que la "clave"
// de cada archivo es un id sintético que este módulo mantiene contra el File real
// (en el navegador no hay rutas absolutas estables).
//
// `webkitRelativePath` (p. ej. "Canciones/Facil/tema.mp3") es lo único que dice
// de qué subcarpeta vino cada archivo: de ahí se deriva `categoria` (REGLAS
// MELOQUIZ §11), un nivel de profundidad — el segmento inmediatamente después
// de la carpeta raíz elegida, o `null` si el archivo está suelto en la raíz.

import type { ArchivoLocal, ISistemaArchivos } from "@juegos/meloquiz-fuente-local/sistemaArchivos";

/**
 * Deriva la categoría (§11) del `webkitRelativePath` de un archivo del picker.
 * jsdom (tests) y los `File` armados a mano dejan la propiedad en `undefined`
 * en vez de `""` (los tipos del DOM la dan por `string`, pero en runtime no
 * siempre está); se trata igual que "sin ruta" ⇒ suelto.
 */
export function categoriaDeRelativePath(relativePath: string | undefined): string | null {
  if (relativePath === undefined || relativePath.length === 0) return null;
  const segmentos = relativePath.split("/");
  // ["Canciones", "tema.mp3"] → suelto; ["Canciones", "Facil", "tema.mp3"] → "Facil".
  return segmentos.length >= 3 ? (segmentos[1] ?? null) : null;
}

/** Categorías distintas (ordenadas) presentes en una selección de carpeta. */
export function categoriasDeArchivos(files: readonly File[]): readonly string[] {
  const categorias = new Set<string>();
  for (const file of files) {
    const categoria = categoriaDeRelativePath(file.webkitRelativePath);
    if (categoria !== null) categorias.add(categoria);
  }
  return [...categorias].sort();
}

/** Un `ISistemaArchivos` respaldado por Files, más el mapa clave → File. */
export interface SistemaArchivosFiles {
  readonly sistema: ISistemaArchivos;
  readonly archivos: readonly ArchivoLocal[];
  /** El File original de una clave, para reproducirlo con un object URL. */
  fileDe(clave: string): File | undefined;
}

export function crearSistemaArchivosFiles(files: readonly File[]): SistemaArchivosFiles {
  const porClave = new Map<string, File>();
  const archivos: ArchivoLocal[] = [];

  files.forEach((file, i) => {
    // webkitRelativePath puede repetirse entre selecciones; el índice lo hace único.
    const clave = `f${i}:${file.name}`;
    porClave.set(clave, file);
    const categoria = categoriaDeRelativePath(file.webkitRelativePath);
    archivos.push({ clave, nombre: file.name, tamanoBytes: file.size, categoria });
  });

  const buscar = (clave: string): File => {
    const file = porClave.get(clave);
    if (file === undefined) throw new Error(`no existe el archivo ${clave}`);
    return file;
  };

  const sistema: ISistemaArchivos = {
    // La carpeta ya viene resuelta en el FileList: `listar` ignora el argumento.
    listar: () => Promise.resolve(archivos),

    async leerPrefijo(clave, bytes) {
      // slice() no lee de disco: recorta el blob y solo se materializa el prefijo.
      const buffer = await buscar(clave).slice(0, bytes).arrayBuffer();
      return new Uint8Array(buffer);
    },

    abrirFlujo(clave) {
      return Promise.resolve(buscar(clave).stream());
    },
  };

  return { sistema, archivos, fileDe: (clave) => porClave.get(clave) };
}
