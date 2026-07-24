// La invariante que sostiene todo MeloQuiz multijugador (REGLAS §1): el cliente
// tiene que llegar EXACTAMENTE a la misma huella que calculó el servidor al armar
// el pool. Si divergieran, `pistaId` no resolvería contra la carpeta propia y
// nadie podría sonar nada — y el síntoma sería mudo, no un error.
//
// Por eso el test compara las dos rutas contra el MISMO contenido: la del
// servidor (ISistemaArchivos sobre Node) y la del cliente (sobre la File API).

import { describe, expect, it } from "vitest";
import { calcularHuella } from "@juegos/meloquiz-fuente-local/huella";
import type { ArchivoLocal, ISistemaArchivos } from "@juegos/meloquiz-fuente-local/sistemaArchivos";
import { crearSistemaArchivosFiles } from "./sistemaArchivosFiles.js";
import { IndiceLocal } from "./indiceLocal.js";

/**
 * Bytes deterministas: el mismo contenido por ambas rutas. El buffer se declara
 * como `ArrayBuffer` (no `ArrayBufferLike`) porque `BlobPart` no acepta un
 * `Uint8Array` que pudiera estar respaldado por un `SharedArrayBuffer`.
 */
function bytesDe(semilla: number, largo: number): Uint8Array<ArrayBuffer> {
  const salida = new Uint8Array(new ArrayBuffer(largo));
  for (let i = 0; i < largo; i++) salida[i] = (semilla * 31 + i * 17) % 256;
  return salida;
}

function fileDe(nombre: string, bytes: Uint8Array<ArrayBuffer>): File {
  return new File([bytes], nombre);
}

/** Un ISistemaArchivos en memoria, como el que usa el servidor sobre disco. */
function sistemaEnMemoria(entradas: ReadonlyMap<string, Uint8Array>): ISistemaArchivos {
  const buscar = (clave: string): Uint8Array => {
    const bytes = entradas.get(clave);
    if (bytes === undefined) throw new Error(`no existe ${clave}`);
    return bytes;
  };
  return {
    listar: () =>
      Promise.resolve(
        [...entradas].map(([clave, bytes]) => ({
          clave,
          nombre: clave,
          tamanoBytes: bytes.length,
          categoria: null,
        })),
      ),
    leerPrefijo: (clave, n) => Promise.resolve(buscar(clave).subarray(0, n)),
    abrirFlujo: (clave) =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(controlador) {
            controlador.enqueue(buscar(clave));
            controlador.close();
          },
        }),
      ),
  };
}

describe("huella del cliente vs. la del servidor", () => {
  it("el mismo contenido da la misma huella por las dos rutas", async () => {
    const bytes = bytesDe(3, 200_000); // más grande que los 64 KB de la huella
    const nombre = "cancion.mp3";

    const servidor = sistemaEnMemoria(new Map([[nombre, bytes]]));
    const archivoServidor: ArchivoLocal = {
      clave: nombre,
      nombre,
      tamanoBytes: bytes.length,
      categoria: null,
    };
    const huellaServidor = await calcularHuella(servidor, archivoServidor);

    const { sistema, archivos } = crearSistemaArchivosFiles([fileDe(nombre, bytes)]);
    const archivoCliente = archivos[0];
    if (archivoCliente === undefined) throw new Error("no se indexó el archivo");
    const huellaCliente = await calcularHuella(sistema, archivoCliente);

    expect(huellaCliente).toBe(huellaServidor);
  });

  it("contenidos distintos dan huellas distintas", async () => {
    const { sistema, archivos } = crearSistemaArchivosFiles([
      fileDe("a.mp3", bytesDe(1, 90_000)),
      fileDe("b.mp3", bytesDe(2, 90_000)),
    ]);
    const [a, b] = archivos;
    if (a === undefined || b === undefined) throw new Error("faltan archivos");
    expect(await calcularHuella(sistema, a)).not.toBe(await calcularHuella(sistema, b));
  });

  it("dos archivos del MISMO contenido con distinto nombre comparten huella", async () => {
    // La huella es del CONTENIDO (§1): renombrar no cambia la identidad de la
    // pista. Es lo que permite que dos jugadores con la misma canción la resuelvan
    // aunque el archivo se llame distinto en cada disco.
    const bytes = bytesDe(5, 70_000);
    const { sistema, archivos } = crearSistemaArchivosFiles([
      fileDe("tema.mp3", bytes),
      fileDe("01 - Tema (remaster).mp3", bytes),
    ]);
    const [a, b] = archivos;
    if (a === undefined || b === undefined) throw new Error("faltan archivos");
    expect(await calcularHuella(sistema, a)).toBe(await calcularHuella(sistema, b));
  });
});

describe("IndiceLocal", () => {
  it("indexa solo extensiones soportadas y resuelve por huella", async () => {
    const indice = new IndiceLocal();
    const audio = fileDe("tema.mp3", bytesDe(9, 80_000));
    const resultado = await indice.indexar([
      audio,
      fileDe("notas.txt", bytesDe(1, 10)),
      fileDe("portada.jpg", bytesDe(2, 10)),
    ]);

    expect(resultado.indexados).toBe(1);
    expect(resultado.omitidos).toBe(2);
    expect(indice.tamano).toBe(1);

    // La pista se resuelve con la huella que calcularía el servidor.
    const { sistema, archivos } = crearSistemaArchivosFiles([audio]);
    const archivo = archivos[0];
    if (archivo === undefined) throw new Error("no se indexó el archivo");
    const pistaId = await calcularHuella(sistema, archivo);
    expect(indice.tiene(pistaId)).toBe(true);
    expect(indice.tiene("huella-que-no-existe")).toBe(false);
  });

  it("reindexar reemplaza la carpeta anterior", async () => {
    const indice = new IndiceLocal();
    await indice.indexar([fileDe("a.mp3", bytesDe(1, 70_000))]);
    expect(indice.tamano).toBe(1);

    await indice.indexar([
      fileDe("b.mp3", bytesDe(2, 70_000)),
      fileDe("c.mp3", bytesDe(3, 70_000)),
    ]);
    expect(indice.tamano).toBe(2);
    expect(indice.vacio).toBe(false);
  });

  it("una carpeta sin audio soportado deja el índice vacío", async () => {
    const indice = new IndiceLocal();
    const resultado = await indice.indexar([fileDe("leeme.txt", bytesDe(1, 10))]);
    expect(resultado.indexados).toBe(0);
    expect(indice.vacio).toBe(true);
  });
});
