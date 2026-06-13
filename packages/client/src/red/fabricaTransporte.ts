// La costura de transportes del cliente. El modo elegido en la pantalla de
// conexión decide qué adaptador de TransporteCliente se instancia.

import type { TransporteCliente } from "@juegos/server/transporte";
import { TransporteLanNavegador } from "./transporteLanNavegador.js";

export type ModoConexion = "local" | "online";

export function crearTransporte(modo: ModoConexion): TransporteCliente {
  switch (modo) {
    case "local":
      return new TransporteLanNavegador();
    case "online":
      // Punto de enganche de la Fase 7: aquí se instanciará el adaptador
      // online (misma interfaz). El botón está deshabilitado hasta entonces.
      throw new Error("el modo online llega próximamente (Fase 7)");
  }
}
