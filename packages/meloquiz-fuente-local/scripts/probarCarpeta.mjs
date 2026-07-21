// Verificación MANUAL con audio real (lo único que los dobles de los tests no
// cubren): apunta la fuente local a una carpeta de verdad e imprime lo que vería
// el juego. Sirve para revisar a ojo que los títulos normalizados se lean como
// botones de voto aceptables.
//
//   npm run build
//   npm run probar:carpeta -w @juegos/meloquiz-fuente-local -- "D:/Musica/Pack"
//
// No escribe nada ni sale a la red: solo lee la carpeta.

import { crearFuenteLocal, crearLectorMusicMetadata, crearSistemaArchivosNode } from "../dist/index.js";

const carpeta = process.argv[2];
if (carpeta === undefined) {
  console.error("uso: probarCarpeta.mjs <ruta-de-la-carpeta>");
  process.exit(1);
}

const fuente = crearFuenteLocal({
  carpeta,
  sistemaArchivos: crearSistemaArchivosNode(),
  lectorMetadatos: crearLectorMusicMetadata(),
});

const resultado = await fuente.cargarDetallado();

if (!resultado.ok) {
  console.error(`\n✖ ${resultado.error.codigo}: ${resultado.error.mensaje}\n`);
  process.exit(1);
}

const { pool, descartados, caratulas } = resultado.valor;

console.log(`\n${pool.canciones.length} canciones válidas en ${carpeta}\n`);
for (const cancion of pool.canciones) {
  const tapa = cancion.claveCaratula === null ? "sin tapa" : "con tapa";
  const artista = cancion.artista ?? "—";
  console.log(
    `  ${cancion.titulo}\n` +
      `    artista: ${artista} | inicio: ${cancion.segundoInicio.toFixed(1)}s | ${tapa}\n` +
      `    archivo: ${cancion.claveArchivo}\n` +
      `    id: ${cancion.id.slice(0, 16)}…`,
  );
}

console.log(`\ncarátulas embebidas: ${caratulas.size}`);
console.log(
  `descartados: ${descartados.total}` +
    ` (formato ${descartados.porFormatoNoSoportado},` +
    ` ilegibles ${descartados.porIlegible},` +
    ` sin duración ${descartados.porSinDuracion},` +
    ` sin título ${descartados.porSinTitulo})`,
);
if (descartados.total > 0) console.log(`  ${descartados.nombres.join(", ")}`);
console.log();
