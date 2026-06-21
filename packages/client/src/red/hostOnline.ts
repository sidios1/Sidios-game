// Host del modo ONLINE (cliente-host de la Fase 7): arranca el Orquestador
// DENTRO del webview sobre el TransporteOnlineServidor (WebRTC), análogo a
// servidorEmbebido.ts pero sin sidecar (en online no hay proceso aparte: la
// señalización + WebRTC son nativos del webview). El host-jugador se conecta a
// su propio orquestador por el cliente LOOPBACK en-proceso (no por WebRTC).
//
// El Orquestador y crearSala se importan por subpaths browser-safe de
// @juegos/server (sin `ws`); la raíz sigue prohibida (ver CLAUDE.md, regla 4).

import type { TransporteCliente } from "@juegos/server/transporte";
import { crearSala } from "@juegos/server/registroMotores";
import type { SalaJuego } from "@juegos/server/registroMotores";
import { SenalizacionPeerJs } from "./online/senalizacionPeerJs.js";
import { TransporteOnlineServidor } from "./online/transporteOnlineServidor.js";
import { TransporteServidorObservado } from "./transporteServidorObservado.js";

let salaActiva: SalaJuego | null = null;
let servidorActivo: TransporteOnlineServidor | null = null;

/**
 * Crea una sala online: registra al host en el broker y corre su orquestador.
 * Devuelve el código corto que los amigos usan para unirse (de cualquier red).
 */
export async function iniciarHostOnline(juego = "carioca"): Promise<string> {
  await detenerHostOnline(); // por si quedó una sala anterior viva.
  const servidor = new TransporteOnlineServidor(new SenalizacionPeerJs());
  // La sala (orquestador) corre sobre un decorador OBSERVE-ONLY que registra la
  // conexión/desconexión de cada peer remoto; servidorActivo guarda el real para
  // el cliente loopback del host (crearClienteLocal).
  const sala = crearSala(juego, {
    transporte: new TransporteServidorObservado(servidor),
  });
  if (sala === undefined) throw new Error(`juego desconocido: ${juego}`);
  const codigo = await sala.iniciar();
  salaActiva = sala;
  servidorActivo = servidor;
  return codigo;
}

/**
 * Cliente loopback del host contra su propio orquestador (en-proceso). Se mina
 * fresco en cada (re)conexión: es estable, así que sirve igual de respaldo.
 */
export function clienteLocalHostOnline(): TransporteCliente {
  if (servidorActivo === null) {
    throw new Error("no hay un host online activo");
  }
  return servidorActivo.crearClienteLocal();
}

/** Apaga la sala online activa (al volver al hub). Idempotente. */
export async function detenerHostOnline(): Promise<void> {
  const sala = salaActiva;
  salaActiva = null;
  servidorActivo = null;
  await sala?.detener();
}
