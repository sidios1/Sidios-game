// Punto de entrada del SERVIDOR EMBEBIDO (Fase 5): es el ejecutable que la app
// de escritorio (Tauri) arranca como sidecar cuando el host hace "Crear partida".
// Levanta el mismo orquestador + adaptador LAN de la Fase 2; el cliente NO corre
// nada aparte. No se exporta desde index.ts: es un ejecutable, no librería.
//
// Diferencias con dev.ts (que sigue sirviendo a `npm run dev:server`):
//  - Imprime una línea MARCADOR estable `CODIGO=<ip:puerto>` que el lanzador del
//    cliente (red/servidorEmbebido.ts) parsea para mostrar el código de la sala.
//  - Cierra limpio ante SIGINT y SIGTERM (Tauri mata el hijo con SIGTERM/kill).

import { crearSala } from "./registroMotores.js";
import type { OpcionesSala, SalaJuego } from "./registroMotores.js";
import { TransporteLanServidor } from "./transporteLan.js";
import { cargarPoolDeCarpeta } from "./juegos/meloquiz/cargarPool.js";

const PUERTO_POR_DEFECTO = 35711;

const puertoCrudo = process.env["PUERTO"];
const puerto = puertoCrudo === undefined ? PUERTO_POR_DEFECTO : Number(puertoCrudo);
if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
  console.error(`PUERTO inválido: ${puertoCrudo} (usa un entero entre 0 y 65535)`);
  process.exit(1);
}

// El juego de la sala embebida; por ahora Carioca (el cliente aún no envía
// game-id). El env JUEGO permite cambiarlo sin tocar código.
const juego = process.env["JUEGO"] ?? "carioca";

/**
 * Arma la sala del juego pedido. MeloQuiz necesita además su catálogo, que este
 * proceso lee de la carpeta que indica CARPETA_MUSICA (REGLAS §1: a los peers
 * solo les viaja la orden, nunca el audio). Por eso la creación es asíncrona y
 * vive acá dentro: `crearSala` a nivel de módulo no podría esperar la lectura.
 */
async function armarSala(transporte: TransporteLanServidor): Promise<SalaJuego | undefined> {
  let poolMeloquiz: OpcionesSala["poolMeloquiz"];
  if (juego === "meloquiz") {
    const carpeta = process.env["CARPETA_MUSICA"];
    if (carpeta === undefined || carpeta.length === 0) {
      console.error("meloquiz necesita la carpeta de música en el env CARPETA_MUSICA");
      process.exit(1);
    }
    const carga = await cargarPoolDeCarpeta(carpeta);
    if (!carga.ok) {
      console.error(`No se pudo armar el catálogo: ${carga.error.mensaje}`);
      process.exit(1);
    }
    poolMeloquiz = carga.valor.pool;
  }
  return crearSala(juego, {
    transporte,
    // exactOptionalPropertyTypes: se omite la clave si no hay pool.
    ...(poolMeloquiz !== undefined ? { poolMeloquiz } : {}),
  });
}

// Sin top-level await: esbuild empaqueta a CJS (formato del sidecar SEA) y CJS
// no admite top-level await. El arranque vive en una función asíncrona.
async function arrancar(): Promise<void> {
  const transporte = new TransporteLanServidor({ puerto });
  const sala = await armarSala(transporte);
  if (sala === undefined) {
    console.error(`juego desconocido: ${juego}`);
    process.exit(1);
  }
  let cerrando = false;
  const cerrar = (): void => {
    if (cerrando) return;
    cerrando = true;
    void sala.detener().then(() => process.exit(0));
  };
  try {
    const codigo = await sala.iniciar();
    // Marcador legible por máquina: el lanzador del cliente espera esta línea.
    console.log(`CODIGO=${codigo}`);
    console.log(`Sala LAN abierta. Código para unirse: ${codigo}`);
  } catch (error) {
    console.error(`No se pudo abrir la sala en el puerto ${puerto}:`, error);
    process.exit(1);
  }
  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
}

void arrancar();
