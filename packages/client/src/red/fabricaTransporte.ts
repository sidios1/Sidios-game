// La costura de transportes del cliente. El modo elegido en la pantalla de
// conexión decide qué adaptador de TransporteCliente se instancia.

import type { TransporteCliente } from "@juegos/server/transporte";
import { TransporteLanNavegador } from "./transporteLanNavegador.js";
import { TransporteOnlineCliente } from "./online/transporteOnlineCliente.js";

export type ModoConexion = "local" | "online";

export function crearTransporte(modo: ModoConexion): TransporteCliente {
  switch (modo) {
    case "local":
      return new TransporteLanNavegador();
    case "online":
      // Jugador online: se une al host por código vía WebRTC (señalización
      // PeerJS). El host usa su cliente loopback, no este adaptador.
      return new TransporteOnlineCliente();
  }
}
