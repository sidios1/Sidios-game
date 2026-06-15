// Punto de entrada de DESARROLLO (Fase 3): arranca el orquestador con el
// adaptador LAN en un puerto fijo para que el cliente se conecte aparte.
// En la Fase 5 esto lo reemplaza el servidor embebido en la app del host.
// No se exporta desde index.ts: es un ejecutable, no parte de la librería.

import { crearSala } from "./registroMotores.js";
import { TransporteLanServidor } from "./transporteLan.js";

const PUERTO_POR_DEFECTO = 35711;

const puertoCrudo = process.env["PUERTO"];
const puerto = puertoCrudo === undefined ? PUERTO_POR_DEFECTO : Number(puertoCrudo);
if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
  console.error(`PUERTO inválido: ${puertoCrudo} (usa un entero entre 0 y 65535)`);
  process.exit(1);
}

const transporte = new TransporteLanServidor({ puerto });
const orquestador = crearSala("carioca", { transporte });
if (orquestador === undefined) {
  console.error("juego desconocido: carioca");
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
