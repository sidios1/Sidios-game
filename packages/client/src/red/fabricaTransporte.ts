// La costura de transportes del cliente. El modo elegido en la pantalla de
// conexión decide qué adaptador de TransporteCliente se instancia.

import type { TransporteCliente } from "@juegos/server/transporte";
import { TransporteLanNavegador } from "./transporteLanNavegador.js";
import { TransporteOnlineCliente } from "./online/transporteOnlineCliente.js";
import { TransporteObservado } from "./transporteObservado.js";

export type ModoConexion = "local" | "online";

export function crearTransporte(modo: ModoConexion): TransporteCliente {
  // El transporte real se envuelve en un decorador OBSERVE-ONLY que vuelca el
  // ciclo de vida (conectar, canal abierto/cerrado) al visor de log, sin tocar
  // el comportamiento de la red.
  switch (modo) {
    case "local":
      return new TransporteObservado(new TransporteLanNavegador(), "LAN");
    case "online":
      // Jugador online: se une al host por código vía WebRTC (señalización
      // PeerJS). El host usa su cliente loopback, no este adaptador.
      return new TransporteObservado(new TransporteOnlineCliente(), "online");
  }
}
