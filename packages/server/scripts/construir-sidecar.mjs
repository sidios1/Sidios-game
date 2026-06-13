// Construye el SIDECAR del servidor embebido (Fase 5): un ejecutable autocontenido
// del servidor Node, para que la app Tauri lo arranque sin que el host tenga Node.
//
// Pipeline (todo tooling oficial): esbuild empaqueta src/embebido.ts (+ ws +
// carioca-core) en un único CJS; Node SEA genera un blob desde ese bundle; se
// copia el binario de Node y se le inyecta el blob con postject. El ejecutable
// final se nombra con el target triple que Tauri exige para `externalBin` y se
// deposita en packages/client/src-tauri/binaries/.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { inject } from "postject";

const aqui = dirname(fileURLToPath(import.meta.url));
const raizServer = join(aqui, "..");
const dirTrabajo = join(raizServer, "build-sidecar");
const dirBinarios = join(raizServer, "..", "client", "src-tauri", "binaries");

// Fuse documentado por Node SEA: marca dónde el binario busca su blob.
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

/** Target triple de Rust/Tauri para la plataforma actual (lo exige `externalBin`). */
function tripleObjetivo() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  switch (process.platform) {
    case "win32":
      return { triple: `${arch}-pc-windows-msvc`, extension: ".exe", macho: false };
    case "darwin":
      return { triple: `${arch}-apple-darwin`, extension: "", macho: true };
    default:
      return { triple: `${arch}-unknown-linux-gnu`, extension: "", macho: false };
  }
}

const { triple, extension, macho } = tripleObjetivo();
const bundleCjs = join(dirTrabajo, "servidor.cjs");
const configSea = join(dirTrabajo, "sea-config.json");
const blobSea = join(dirTrabajo, "servidor.blob");
const exeFinal = join(dirBinarios, `servidor-${triple}${extension}`);

rmSync(dirTrabajo, { recursive: true, force: true });
mkdirSync(dirTrabajo, { recursive: true });
mkdirSync(dirBinarios, { recursive: true });

console.log("1/4  Empaquetando el servidor con esbuild…");
await build({
  entryPoints: [join(raizServer, "src", "embebido.ts")],
  outfile: bundleCjs,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  // ws trae addons nativos OPCIONALES (bufferutil/utf-8-validate); ws funciona
  // sin ellos. Se marcan external para que el bundle no falle al resolverlos.
  external: ["bufferutil", "utf-8-validate"],
});

console.log("2/4  Generando el blob SEA…");
writeFileSync(
  configSea,
  JSON.stringify({
    main: bundleCjs,
    output: blobSea,
    disableExperimentalSEAWarning: true,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", configSea], {
  stdio: "inherit",
});

console.log("3/4  Copiando el binario de Node…");
copyFileSync(process.execPath, exeFinal);

console.log("4/4  Inyectando el blob con postject…");
const datosBlob = await import("node:fs").then((fs) => fs.readFileSync(blobSea));
await inject(exeFinal, "NODE_SEA_BLOB", datosBlob, {
  sentinelFuse: FUSE,
  ...(macho ? { machoSegmentName: "NODE_SEA" } : {}),
});

console.log(`✓ Sidecar listo: ${exeFinal}`);
