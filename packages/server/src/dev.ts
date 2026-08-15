// Punto de entrada de DESARROLLO (Fase 3): arranca el orquestador con el
// adaptador LAN en un puerto fijo para que el cliente se conecte aparte.
// En la Fase 5 esto lo reemplaza el servidor embebido en la app del host.
// No se exporta desde index.ts: es un ejecutable, no parte de la librería.

import path from "node:path";
import { crearSala } from "./registroMotores.js";
import type { OpcionesSala } from "./registroMotores.js";
import { TransporteLanServidor } from "./transporteLan.js";
import { cargarPoolDeCarpeta } from "./juegos/meloquiz/cargarPool.js";
import { cargarPoolDeCarpeta as cargarPoolMonopolyDeCarpeta } from "./juegos/monopoly/cargarPool.js";

const PUERTO_POR_DEFECTO = 35711;

const puertoCrudo = process.env["PUERTO"];
const puerto = puertoCrudo === undefined ? PUERTO_POR_DEFECTO : Number(puertoCrudo);
if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
  console.error(`PUERTO inválido: ${puertoCrudo} (usa un entero entre 0 y 65535)`);
  process.exit(1);
}

// Juego de la sala de desarrollo; Carioca por defecto. El env JUEGO permite
// probar otro motor sin tocar código (p. ej. JUEGO=mentiroso npm run dev:server).
const juego = process.env["JUEGO"] ?? "carioca";

// MeloQuiz necesita su catálogo para construir el motor: el proceso servidor lee
// la carpeta que le indica CARPETA_MUSICA (REGLAS §1 — a los peers solo les viaja
// la orden, nunca el audio).
let poolMeloquiz: OpcionesSala["poolMeloquiz"];
if (juego === "meloquiz") {
  const carpeta = process.env["CARPETA_MUSICA"];
  if (carpeta === undefined || carpeta.length === 0) {
    console.error(
      "meloquiz necesita una carpeta de música. Ejemplo (PowerShell):\n" +
        '  $env:JUEGO="meloquiz"; $env:CARPETA_MUSICA="C:\\ruta\\a\\tu\\musica"; npm run dev:server',
    );
    process.exit(1);
  }
  const categoriasCrudas = process.env["CATEGORIAS_MELOQUIZ"];
  let categoriasSeleccionadas: readonly string[] | null = null;
  if (categoriasCrudas !== undefined && categoriasCrudas.length > 0) {
    try {
      categoriasSeleccionadas = JSON.parse(categoriasCrudas) as readonly string[];
    } catch {
      console.error(`CATEGORIAS_MELOQUIZ no es JSON válido: ${categoriasCrudas}`);
      process.exit(1);
    }
  }

  console.log(`Leyendo catálogo de ${carpeta}…`);
  const carga = await cargarPoolDeCarpeta(carpeta, categoriasSeleccionadas);
  if (!carga.ok) {
    console.error(`No se pudo armar el catálogo: ${carga.error.mensaje}`);
    process.exit(1);
  }
  const { pool, descartados } = carga.valor;
  console.log(`Catálogo listo: ${pool.canciones.length} canciones.`);
  if (descartados.total > 0) {
    console.log(
      `Descartadas ${descartados.total}` +
        ` (formato: ${descartados.porFormatoNoSoportado},` +
        ` ilegibles: ${descartados.porIlegible},` +
        ` sin duración: ${descartados.porSinDuracion},` +
        ` sin título: ${descartados.porSinTitulo}).`,
    );
  }
  poolMeloquiz = pool;
}

// Monopoly necesita su PoolSobres para construir el motor: el proceso servidor lee
// datos/*.json (ver juegos/monopoly/cargarPool.ts). CARPETA_DATOS es opcional: por
// defecto apunta a la carpeta datos/ del repo (dos niveles arriba de packages/server,
// el cwd de este script cuando corre vía `npm run dev --workspace=@juegos/server`).
let poolMonopoly: OpcionesSala["poolMonopoly"];
if (juego === "monopoly") {
  const carpeta = process.env["CARPETA_DATOS"] ?? path.resolve(process.cwd(), "../../datos");
  console.log(`Leyendo catálogo de ${carpeta}…`);
  try {
    poolMonopoly = await cargarPoolMonopolyDeCarpeta(carpeta);
  } catch (error) {
    console.error(
      `No se pudo armar el catálogo de Monopoly desde "${carpeta}"` +
        ` (¿existen jugadores_monopoly.json y tecnicos_monopoly.json ahí? usa CARPETA_DATOS` +
        ` para apuntar a otra carpeta):`,
      error,
    );
    process.exit(1);
  }
  console.log(
    `Catálogo listo: ${poolMonopoly.restoDelMundo.length} de Resto del Mundo,` +
      ` ${poolMonopoly.tecnicos.length} técnicos.`,
  );
}

const transporte = new TransporteLanServidor({ puerto });
const orquestador = crearSala(juego, {
  transporte,
  // exactOptionalPropertyTypes: se omite la clave si no hay pool.
  ...(poolMeloquiz !== undefined ? { poolMeloquiz } : {}),
  ...(poolMonopoly !== undefined ? { poolMonopoly } : {}),
});
if (orquestador === undefined) {
  console.error(`juego desconocido: ${juego}`);
  process.exit(1);
}

try {
  const codigo = await orquestador.iniciar();
  console.log(`Sala LAN abierta. Código para unirse: ${codigo}`);
  console.log(`En esta misma máquina: 127.0.0.1:${puerto}`);
  console.log("Ctrl+C para cerrar la sala.");
} catch (error) {
  console.error(
    `No se pudo abrir la sala en el puerto ${puerto}` +
      ` (¿ocupado? prueba con: PUERTO=35712 npm run dev):`,
    error,
  );
  process.exit(1);
}

process.on("SIGINT", () => {
  console.log("\nCerrando la sala…");
  void orquestador.detener().then(() => process.exit(0));
});
