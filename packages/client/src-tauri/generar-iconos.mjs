// Genera íconos placeholder (cuadro con degradado simple) para que la app Tauri
// compile sin assets externos. Para un ícono propio, reemplázalos con:
//   npx @tauri-apps/cli icon ruta/a/tu-icono.png
// que regenera esta misma carpeta. Tooling: solo Node (zlib), sin dependencias.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const dirIconos = join(aqui, "icons");
mkdirSync(dirIconos, { recursive: true });

const crc32 = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = tabla[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(tipo, datos) {
  const tipoBuf = Buffer.from(tipo, "ascii");
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, datos])), 0);
  return Buffer.concat([largo, tipoBuf, datos, crc]);
}

/** PNG RGBA de lado×lado con un degradado diagonal violeta→azul. */
function generarPng(lado) {
  const filas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) {
    const base = y * (lado * 4 + 1);
    filas[base] = 0; // filtro None
    for (let x = 0; x < lado; x++) {
      const t = (x + y) / (2 * lado);
      const o = base + 1 + x * 4;
      filas[o] = Math.round(110 + 80 * t); // R
      filas[o + 1] = Math.round(70 + 40 * t); // G
      filas[o + 2] = Math.round(200 - 30 * t); // B
      filas[o + 3] = 255; // A
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(filas)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO con una sola imagen PNG (válido desde Windows Vista). */
function generarIco(png, lado) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2); // tipo ícono
  cabecera.writeUInt16LE(1, 4); // 1 imagen
  const entrada = Buffer.alloc(16);
  entrada[0] = lado >= 256 ? 0 : lado; // 0 = 256
  entrada[1] = lado >= 256 ? 0 : lado;
  entrada.writeUInt16LE(1, 4); // planos
  entrada.writeUInt16LE(32, 6); // bits por píxel
  entrada.writeUInt32LE(png.length, 8);
  entrada.writeUInt32LE(6 + 16, 12); // offset de los datos
  return Buffer.concat([cabecera, entrada, png]);
}

const png256 = generarPng(256);
writeFileSync(join(dirIconos, "32x32.png"), generarPng(32));
writeFileSync(join(dirIconos, "128x128.png"), generarPng(128));
writeFileSync(join(dirIconos, "128x128@2x.png"), png256);
writeFileSync(join(dirIconos, "icon.png"), png256);
writeFileSync(join(dirIconos, "icon.ico"), generarIco(png256, 256));
console.log(`Íconos generados en ${dirIconos}`);
