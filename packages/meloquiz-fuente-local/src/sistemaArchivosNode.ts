// Adaptador de `ISistemaArchivos` sobre el disco de Node.
//
// Es el ÚNICO módulo del paquete que conoce `node:fs`. El adaptador de Tauri
// (S3, cada cliente leyendo su propia carpeta según §1) entra por acá al lado,
// sin tocar la fuente ni la normalización.

import { createReadStream } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

import type { ArchivoLocal, ISistemaArchivos } from "./sistemaArchivos.js";

export function crearSistemaArchivosNode(): ISistemaArchivos {
  return {
    async listar(carpeta: string): Promise<readonly ArchivoLocal[]> {
      const entradas = await readdir(carpeta, { withFileTypes: true });
      const archivos: ArchivoLocal[] = [];
      for (const entrada of entradas) {
        if (!entrada.isFile()) continue; // no recursivo: subcarpetas fuera
        const clave = join(carpeta, entrada.name);
        const manejador = await open(clave, "r");
        try {
          const { size } = await manejador.stat();
          archivos.push({ clave, nombre: entrada.name, tamanoBytes: size });
        } finally {
          await manejador.close();
        }
      }
      return archivos;
    },

    async leerPrefijo(clave: string, bytes: number): Promise<Uint8Array> {
      const manejador = await open(clave, "r");
      try {
        const buffer = new Uint8Array(bytes);
        const { bytesRead } = await manejador.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await manejador.close();
      }
    },

    abrirFlujo(clave: string): Promise<ReadableStream<Uint8Array>> {
      // `Readable.toWeb` devuelve el ReadableStream estándar, el mismo tipo que
      // expone el navegador: así el lector de metadatos sirve en ambos entornos.
      const flujo = Readable.toWeb(createReadStream(clave)) as ReadableStream<Uint8Array>;
      return Promise.resolve(flujo);
    },
  };
}
