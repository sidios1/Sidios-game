// Punto de entrada del SERVIDOR EMBEBIDO (Fase 5): es el ejecutable que la app
// de escritorio (Tauri) arranca como sidecar cuando el host hace "Crear partida".
// Levanta el mismo orquestador + adaptador LAN de la Fase 2; el cliente NO corre
// nada aparte. No se exporta desde index.ts: es un ejecutable, no librería.
//
// Diferencias con dev.ts (que sigue sirviendo a `npm run dev:server`):
//  - Imprime una línea MARCADOR estable `CODIGO=<ip:puerto>` que el lanzador del
//    cliente (red/servidorEmbebido.ts) parsea para mostrar el código de la sala.
//  - Cierra limpio ante SIGINT y SIGTERM (Tauri mata el hijo con SIGTERM/kill).

import { Orquestador } from "./orquestador.js";
import { TransporteLanServidor } from "./transporteLan.js";

const PUERTO_POR_DEFECTO = 35711;

const puertoCrudo = process.env["PUERTO"];
const puerto = puertoCrudo === undefined ? PUERTO_POR_DEFECTO : Number(puertoCrudo);
if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
  console.error(`PUERTO inválido: ${puertoCrudo} (usa un entero entre 0 y 65535)`);
  process.exit(1);
}

const transporte = new TransporteLanServidor({ puerto });
const orquestador = new Orquestador({ transporte });

let cerrando = false;
function cerrar(): void {
  if (cerrando) return;
  cerrando = true;
  void orquestador.detener().then(() => process.exit(0));
}

// Sin top-level await: esbuild empaqueta a CJS (formato del sidecar SEA) y CJS
// no admite top-level await. El arranque vive en una función asíncrona.
async function arrancar(): Promise<void> {
  try {
    const codigo = await orquestador.iniciar();
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
