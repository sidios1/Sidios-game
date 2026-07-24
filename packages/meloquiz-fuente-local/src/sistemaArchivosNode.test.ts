// El adaptador de disco contra archivos DE VERDAD (carpeta temporal creada por
// el test). No hay audio real acá: los bytes son inventados. Lo que se verifica
// es el contrato del puerto — listar, leer el prefijo y abrir el flujo — no el
// parseo de tags, que vive detrás de su propio puerto.

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calcularHuella } from "./huella.js";
import { crearSistemaArchivosNode } from "./sistemaArchivosNode.js";

const sistemaArchivos = crearSistemaArchivosNode();
let carpeta: string;

beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "meloquiz-"));
  await writeFile(join(carpeta, "uno.mp3"), "contenido-de-uno");
  await writeFile(join(carpeta, "dos.flac"), "contenido-de-dos-mas-largo");
  await writeFile(join(carpeta, "notas.txt"), "no es audio");
  await mkdir(join(carpeta, "subcarpeta"));
  await writeFile(join(carpeta, "subcarpeta", "tres.mp3"), "anidado");
});

afterAll(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

describe("crearSistemaArchivosNode", () => {
  it("lista los archivos de la raíz y de un nivel de subcarpetas, con su categoría", async () => {
    const archivos = await sistemaArchivos.listar(carpeta);
    const porNombre = new Map(archivos.map((a) => [a.nombre, a]));

    expect([...porNombre.keys()].sort()).toEqual([
      "dos.flac",
      "notas.txt",
      "tres.mp3",
      "uno.mp3",
    ]);
    expect(porNombre.get("uno.mp3")?.tamanoBytes).toBe("contenido-de-uno".length);
    expect(porNombre.get("uno.mp3")?.clave).toBe(join(carpeta, "uno.mp3"));
    expect(porNombre.get("uno.mp3")?.categoria).toBeNull();
    expect(porNombre.get("tres.mp3")?.categoria).toBe("subcarpeta");
    expect(porNombre.get("tres.mp3")?.clave).toBe(join(carpeta, "subcarpeta", "tres.mp3"));
  });

  it("leerPrefijo devuelve solo los primeros bytes pedidos", async () => {
    const prefijo = await sistemaArchivos.leerPrefijo(join(carpeta, "uno.mp3"), 9);
    expect(new TextDecoder().decode(prefijo)).toBe("contenido");
  });

  it("leerPrefijo no inventa bytes cuando el archivo es más corto", async () => {
    const prefijo = await sistemaArchivos.leerPrefijo(join(carpeta, "uno.mp3"), 64 * 1024);
    expect(prefijo.length).toBe("contenido-de-uno".length);
  });

  it("abrirFlujo entrega el contenido completo", async () => {
    const flujo = await sistemaArchivos.abrirFlujo(join(carpeta, "dos.flac"));
    const trozos: Uint8Array[] = [];
    for await (const trozo of flujo as unknown as AsyncIterable<Uint8Array>) {
      trozos.push(trozo);
    }
    const total = trozos.reduce((acumulado, t) => acumulado + t.length, 0);
    expect(total).toBe("contenido-de-dos-mas-largo".length);
  });

  it("calcula la huella sobre archivos reales y distingue contenidos", async () => {
    const archivos = await sistemaArchivos.listar(carpeta);
    const uno = archivos.find((a) => a.nombre === "uno.mp3")!;
    const dos = archivos.find((a) => a.nombre === "dos.flac")!;

    const huellaUno = await calcularHuella(sistemaArchivos, uno);
    expect(huellaUno).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaUno).toBe(await calcularHuella(sistemaArchivos, uno)); // estable
    expect(huellaUno).not.toBe(await calcularHuella(sistemaArchivos, dos));
  });
});
