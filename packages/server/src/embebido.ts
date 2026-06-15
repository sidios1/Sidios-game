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
import type { SalaJuego } from "./registroMotores.js";
import { TransporteLanServidor } from "./transporteLan.js";

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
const transporte = new TransporteLanServidor({ puerto });
const orquestador = crearSala(juego, { transporte });
if (orquestador === undefined) {
  console.error(`juego desconocido: ${juego}`);
  process.exit(1);
}

// Sin top-level await: esbuild empaqueta a CJS (formato del sidecar SEA) y CJS
// no admite top-level await. El arranque vive en una función asíncrona; la sala
// viaja como argumento (ya no es undefined tras la guarda de arriba).
async function arrancar(sala: SalaJuego): Promise<void> {
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

void arrancar(orquestador);
