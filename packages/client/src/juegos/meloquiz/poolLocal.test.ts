// @vitest-environment jsdom
// El pool que el HOST ONLINE arma en el webview (poolLocal.ts) debe ser
// intercambiable con el que arma el proceso servidor: misma fuente local, misma
// huella. La invariante que se prueba acá es la de REGLAS §1: el `pistaId` de
// cada canción del pool resuelve contra el índice local construido de los
// MISMOS File — si divergieran, el síntoma en juego sería mudo (nadie suena).

import { describe, expect, it } from "vitest";
import type { ILectorMetadatos } from "@juegos/meloquiz-fuente-local/metadatos";
import { IndiceLocal } from "./indiceLocal.js";
import { armarPoolDeFiles } from "./poolLocal.js";

/** Archivos de mentira con contenido distinto (huellas distintas). */
function archivos(n: number): File[] {
  const files: File[] = [];
  for (let i = 1; i <= n; i++) {
    files.push(
      new File([`contenido-unico-${i}`.repeat(100)], `Tema ${i}.mp3`, {
        type: "audio/mpeg",
      }),
    );
  }
  return files;
}

/**
 * Un File con `webkitRelativePath` fijado, como lo entregaría un
 * `<input webkitdirectory>` real. La API de `File` no lo deja setear por
 * constructor: se define la propiedad después (§11).
 */
function archivoDeCategoria(nombre: string, categoria: string | null, contenido: string): File {
  const file = new File([contenido.repeat(100)], nombre, { type: "audio/mpeg" });
  const relativePath =
    categoria === null ? `Canciones/${nombre}` : `Canciones/${categoria}/${nombre}`;
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

/** Lector falso: tags legibles para todos (sin fixtures binarios). */
const lectorFalso: ILectorMetadatos = {
  leer: (archivo) =>
    Promise.resolve({
      titulo: archivo.nombre.replace(/\.mp3$/, ""),
      artista: "Artista",
      duracionSegundos: 180,
      caratula: null,
    }),
};

describe("armarPoolDeFiles (host online, REGLAS §1)", () => {
  it("arma un pool válido con una canción por archivo", async () => {
    const carga = await armarPoolDeFiles(archivos(5), lectorFalso);
    expect(carga.ok).toBe(true);
    if (!carga.ok) return;
    expect(carga.valor.pool.canciones).toHaveLength(5);
    const titulos = carga.valor.pool.canciones.map((c) => c.titulo);
    expect(titulos).toContain("Tema 1");
  });

  it("cada pistaId del pool resuelve contra el índice local de los MISMOS File", async () => {
    const files = archivos(4);
    const carga = await armarPoolDeFiles(files, lectorFalso);
    expect(carga.ok).toBe(true);
    if (!carga.ok) return;

    const indice = new IndiceLocal();
    await indice.indexar(files);
    for (const cancion of carga.valor.pool.canciones) {
      expect(indice.tiene(cancion.id), `pistaId ${cancion.id} no resuelve`).toBe(true);
    }
  });

  it("con menos del mínimo de canciones el pool se rechaza (§2)", async () => {
    const carga = await armarPoolDeFiles(archivos(3), lectorFalso);
    expect(carga.ok).toBe(false);
    if (carga.ok) return;
    expect(carga.error.mensaje).toContain("4");
  });

  it("los archivos no soportados se descartan sin romper el pool", async () => {
    const files = [...archivos(4), new File(["no es audio"], "notas.txt")];
    const carga = await armarPoolDeFiles(files, lectorFalso);
    expect(carga.ok).toBe(true);
    if (!carga.ok) return;
    expect(carga.valor.pool.canciones).toHaveLength(4);
    expect(carga.valor.descartados.porFormatoNoSoportado).toBe(1);
  });
});

describe("armarPoolDeFiles — selección de categorías (§11)", () => {
  function archivosDeDosCategorias(): File[] {
    // 3 Facil + 1 suelto = 4 (justo el mínimo del reglamento §2), para poder
    // filtrar a una sola categoría sin que el pool quede insuficiente.
    return [
      archivoDeCategoria("Facil 1.mp3", "Facil", "facil-1"),
      archivoDeCategoria("Facil 2.mp3", "Facil", "facil-2"),
      archivoDeCategoria("Facil 3.mp3", "Facil", "facil-3"),
      archivoDeCategoria("Dificil 1.mp3", "Dificil", "dificil-1"),
      archivoDeCategoria("Dificil 2.mp3", "Dificil", "dificil-2"),
      archivoDeCategoria("Suelto.mp3", null, "suelto"),
    ];
  }

  it("sin selección, entran todas las categorías", async () => {
    const carga = await armarPoolDeFiles(archivosDeDosCategorias(), lectorFalso);
    expect(carga.ok).toBe(true);
    if (!carga.ok) return;
    expect(carga.valor.pool.canciones).toHaveLength(6);
  });

  it("filtra a la categoría marcada, dejando pasar los sueltos", async () => {
    const carga = await armarPoolDeFiles(archivosDeDosCategorias(), lectorFalso, ["Facil"]);
    expect(carga.ok).toBe(true);
    if (!carga.ok) return;
    const titulos = carga.valor.pool.canciones.map((c) => c.titulo).sort();
    expect(titulos).toEqual(["Facil 1", "Facil 2", "Facil 3", "Suelto"]);
  });
});
