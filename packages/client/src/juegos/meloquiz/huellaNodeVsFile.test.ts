// El test cruzado REAL de la huella (S4): adaptador Node de verdad (el que usa
// el servidor sobre disco) contra la File API de verdad (la que usa el cliente),
// sobre los MISMOS archivos en una carpeta temporal.
//
// indiceLocal.test.ts ya compara File API contra un ISistemaArchivos en memoria,
// pero eso solo prueba que `calcularHuella` es determinista: las dos lecturas de
// prefijo reales (`read(fd, 0, N)` en Node vs. `blob.slice(0, N).arrayBuffer()`)
// nunca se enfrentaban. Si divergieran, el peer no encontraría canciones que SÍ
// tiene — y el síntoma sería mudo, no un error. Este archivo cierra ese hueco.
//
// El puente Node→File es `openAsBlob` (node:fs, Node 22): un Blob respaldado por
// el archivo en disco, no por un buffer ya materializado, así `slice()` ejerce
// de verdad la lectura parcial de sistemaArchivosFiles.ts.
//
// El subpath /sistemaArchivosNode existe SOLO para tests (ver el package.json de
// la fuente local): arrastra node:fs y jamás debe importarse en producción.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { openAsBlob } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calcularHuella } from "@juegos/meloquiz-fuente-local/huella";
import type { ArchivoLocal } from "@juegos/meloquiz-fuente-local/sistemaArchivos";
import { crearSistemaArchivosNode } from "@juegos/meloquiz-fuente-local/sistemaArchivosNode";
import { crearSistemaArchivosFiles } from "./sistemaArchivosFiles.js";

/** Bytes deterministas b[i] = (i*factor + suma) % 256 — mismos que huella.test.ts. */
function bytesDe(largo: number, factor: number, suma: number): Uint8Array {
  const salida = new Uint8Array(largo);
  for (let i = 0; i < largo; i++) salida[i] = (i * factor + suma) % 256;
  return salida;
}

// Los vectores dorados de meloquiz-fuente-local/src/huella.test.ts: si el test
// cruzado falla, comparar contra estos hex dice DE QUÉ LADO está el bug.
const VECTOR_CORTO = "2f7a681e9ffb57dba6917c429ec29f1b47428b3c0709b336f35221a2f152ae1a";
const VECTOR_GRANDE = "043ef96607335b85c50dd398ea5a00db1ec1daabf7b54556c02ddf25f84780bd";
const VECTOR_MISMO_PREFIJO = "a6b8592dd26f166a854298501b01ba15fde4679d23bb1fdf6d991768c3d7b5d1";
const VECTOR_VACIO = "19e89348f2a9d5f3d0c5fca8e2a7068d9c5d71687a355f759009a5ed2527eb2c";

/** nombre → [bytes, vector dorado esperado]. */
const FIXTURES: ReadonlyMap<string, readonly [Uint8Array, string]> = new Map([
  ["corto.mp3", [bytesDe(256, 1, 0), VECTOR_CORTO] as const],
  ["grande.mp3", [bytesDe(100_000, 31, 7), VECTOR_GRANDE] as const],
  // Mismo prefijo de 64 KB que grande.mp3, distinto tamaño: el "++ tamaño".
  ["mismo-prefijo.mp3", [bytesDe(70_000, 31, 7), VECTOR_MISMO_PREFIJO] as const],
  ["vacio.mp3", [new Uint8Array(0), VECTOR_VACIO] as const],
  // El nombre no entra en la huella; en Windows valida que tampoco se cuele
  // por la ruta (codificación del sistema de archivos).
  ["canción ñandú.mp3", [bytesDe(1_000, 13, 5), ""] as const],
]);

const sistemaNode = crearSistemaArchivosNode();
let carpeta: string;

beforeAll(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "meloquiz-huella-"));
  for (const [nombre, [bytes]] of FIXTURES) {
    await writeFile(join(carpeta, nombre), bytes);
  }
});

afterAll(async () => {
  await rm(carpeta, { recursive: true, force: true });
});

async function huellaNode(nombre: string): Promise<string> {
  const archivos = await sistemaNode.listar(carpeta);
  const archivo = archivos.find((a) => a.nombre === nombre);
  if (archivo === undefined) throw new Error(`el adaptador Node no listó ${nombre}`);
  return calcularHuella(sistemaNode, archivo);
}

async function huellaFile(nombre: string): Promise<string> {
  const blob = await openAsBlob(join(carpeta, nombre));
  const file = new File([blob], nombre);
  const { sistema, archivos } = crearSistemaArchivosFiles([file]);
  const archivo: ArchivoLocal | undefined = archivos[0];
  if (archivo === undefined) throw new Error(`la File API no indexó ${nombre}`);
  return calcularHuella(sistema, archivo);
}

describe("huella: adaptador Node real vs. File API real", () => {
  for (const [nombre, [, vector]] of FIXTURES) {
    it(`bit-idéntica para ${nombre}`, async () => {
      const nodo = await huellaNode(nombre);
      const file = await huellaFile(nombre);
      expect(file).toBe(nodo);
      // Y ambas coinciden con el vector dorado (donde hay uno): si esta línea
      // rompe pero la anterior no, el bug está en las DOS rutas a la vez.
      if (vector !== "") expect(nodo).toBe(vector);
    });
  }

  it("mismo prefijo de 64 KB con distinto tamaño no colisiona en ninguna ruta", async () => {
    expect(await huellaNode("grande.mp3")).not.toBe(await huellaNode("mismo-prefijo.mp3"));
    expect(await huellaFile("grande.mp3")).not.toBe(await huellaFile("mismo-prefijo.mp3"));
  });
});
