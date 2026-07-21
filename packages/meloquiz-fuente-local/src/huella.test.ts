// Vectores DORADOS del algoritmo de huella: bytes fijos → hex esperado,
// calculado una vez contra la definición de huella.ts (SHA-256 de
// `primeros 64 KB ++ ":" ++ tamaño decimal`, hex minúscula).
//
// Este archivo es el ancla del contrato multi-proceso (REGLAS §1): el servidor
// (Node) y el cliente (File API) DEBEN llegar al mismo hash, y el test cruzado
// del cliente (huellaNodeVsFile.test.ts) repite estos mismos vectores. Si las
// dos rutas divergen, el vector dorado desempata de qué lado está el bug.
// Si un cambio legítimo del algoritmo rompe estos hex, es un cambio de FORMATO
// de pool: todos los jugadores deben recalcular sus índices a la vez.

import { describe, expect, it } from "vitest";

import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";
import { BYTES_HUELLA, calcularHuella } from "./huella.js";

/** Bytes deterministas b[i] = (i*factor + suma) % 256. */
function bytesDe(largo: number, factor: number, suma: number): Uint8Array {
  const salida = new Uint8Array(largo);
  for (let i = 0; i < largo; i++) salida[i] = (i * factor + suma) % 256;
  return salida;
}

/** Un ISistemaArchivos en memoria: acá se prueba el ALGORITMO, no el adaptador. */
function sistemaEnMemoria(entradas: ReadonlyMap<string, Uint8Array>): {
  sistema: ISistemaArchivos;
  archivoDe(clave: string): ArchivoLocal;
} {
  const buscar = (clave: string): Uint8Array => {
    const bytes = entradas.get(clave);
    if (bytes === undefined) throw new Error(`no existe ${clave}`);
    return bytes;
  };
  return {
    sistema: {
      listar: () =>
        Promise.resolve(
          [...entradas].map(([clave, bytes]) => ({
            clave,
            nombre: clave,
            tamanoBytes: bytes.length,
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
    },
    archivoDe: (clave) => ({ clave, nombre: clave, tamanoBytes: buscar(clave).length }),
  };
}

// b[i] = i: archivo CORTO (256 B < 64 KB), ejercita el prefijo truncado.
const VECTOR_CORTO = "2f7a681e9ffb57dba6917c429ec29f1b47428b3c0709b336f35221a2f152ae1a";
// b[i] = (i*31+7) % 256, 100 000 B: el prefijo se corta exacto en 64 KB.
const VECTOR_GRANDE = "043ef96607335b85c50dd398ea5a00db1ec1daabf7b54556c02ddf25f84780bd";
// El MISMO generador, 70 000 B: idénticos primeros 64 KB, distinto tamaño.
const VECTOR_MISMO_PREFIJO = "a6b8592dd26f166a854298501b01ba15fde4679d23bb1fdf6d991768c3d7b5d1";
// Archivo vacío: prefijo de 0 bytes, solo el sufijo ":0".
const VECTOR_VACIO = "19e89348f2a9d5f3d0c5fca8e2a7068d9c5d71687a355f759009a5ed2527eb2c";

describe("calcularHuella — vectores dorados", () => {
  it("archivo corto (<64 KB): hash del contenido entero ++ tamaño", async () => {
    const { sistema, archivoDe } = sistemaEnMemoria(new Map([["a", bytesDe(256, 1, 0)]]));
    expect(await calcularHuella(sistema, archivoDe("a"))).toBe(VECTOR_CORTO);
  });

  it("archivo grande (>64 KB): solo entran los primeros 64 KB", async () => {
    const { sistema, archivoDe } = sistemaEnMemoria(
      new Map([["b", bytesDe(100_000, 31, 7)]]),
    );
    expect(await calcularHuella(sistema, archivoDe("b"))).toBe(VECTOR_GRANDE);
  });

  it("mismo prefijo de 64 KB con distinto tamaño ⇒ huellas DISTINTAS", async () => {
    // La razón de ser del "++ tamaño" (huella.ts): dos archivos que comparten
    // los primeros 64 KB byte a byte no deben colisionar.
    const grande = bytesDe(100_000, 31, 7);
    const chico = bytesDe(70_000, 31, 7);
    expect(chico).toEqual(grande.subarray(0, 70_000)); // sanidad: mismo prefijo real
    expect(BYTES_HUELLA).toBeLessThan(70_000); // el prefijo compartido cubre los 64 KB

    const { sistema, archivoDe } = sistemaEnMemoria(
      new Map([
        ["grande", grande],
        ["chico", chico],
      ]),
    );
    expect(await calcularHuella(sistema, archivoDe("chico"))).toBe(VECTOR_MISMO_PREFIJO);
    expect(VECTOR_MISMO_PREFIJO).not.toBe(VECTOR_GRANDE);
  });

  it("archivo vacío: la huella existe y es solo función del tamaño 0", async () => {
    const { sistema, archivoDe } = sistemaEnMemoria(new Map([["v", new Uint8Array(0)]]));
    expect(await calcularHuella(sistema, archivoDe("v"))).toBe(VECTOR_VACIO);
  });
});
