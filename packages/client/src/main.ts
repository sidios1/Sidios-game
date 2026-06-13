// Punto de entrada: pantalla de conexión → unirse a la sala → Aplicacion.
// El token de bienvenida se guarda en sessionStorage (por pestaña) para
// reconectar al mismo asiento tras un F5; si el token ya no vale, se
// reintenta una vez como jugador nuevo.

import { Aplicacion } from "./aplicacion.js";
import { Conexion } from "./red/conexion.js";
import type { ModoConexion } from "./red/fabricaTransporte.js";
import { crearTransporte } from "./red/fabricaTransporte.js";
import { borrarSesion, guardarSesion, leerSesion } from "./red/sesion.js";
import { PantallaConexion } from "./hud/pantallaConexion.js";

function elemento(id: string): HTMLElement {
  const encontrado = document.getElementById(id);
  if (encontrado === null) throw new Error(`falta #${id} en index.html`);
  return encontrado;
}

const contenedorEscena = elemento("escena");
const contenedorHud = elemento("hud");

let conexion: Conexion | null = null;
let aplicacion: Aplicacion | null = null;
let reintentando = false;

const pantalla = new PantallaConexion(contenedorHud, {
  alConectar: (modo, codigo, nombre) => {
    void conectar(modo, codigo, nombre, true);
  },
  alIniciarPartida: () => {
    conexion?.enviarMensaje({ tipo: "iniciarPartida" });
  },
});

async function conectar(
  modo: ModoConexion,
  codigo: string,
  nombre: string,
  usarToken: boolean,
): Promise<void> {
  let transporte;
  try {
    transporte = crearTransporte(modo);
  } catch (error) {
    pantalla.mostrarError(error instanceof Error ? error.message : String(error));
    return;
  }
  const nueva = new Conexion(transporte);
  try {
    await nueva.conectar(codigo, {
      alBienvenida: (jugadorId, token) => {
        pantalla.registrarJugadorId(jugadorId);
        guardarSesion(sessionStorage, codigo, { token, nombre });
      },
      alEstadoSala: (jugadores) => {
        pantalla.mostrarSala(jugadores, codigo);
      },
      alVista: (vista) => {
        pantalla.ocultar();
        if (aplicacion === null) {
          aplicacion = new Aplicacion(contenedorEscena, contenedorHud, nueva);
        }
        aplicacion.recibirVista(vista);
      },
      alError: (codigoError, mensaje) => {
        if (codigoError === "tokenInvalido") {
          // El asiento ya no existe (p. ej. el servidor se reinició):
          // se reintenta una vez como jugador nuevo.
          borrarSesion(sessionStorage, codigo);
          reintentando = true;
          void conectar(modo, codigo, nombre, false);
          return;
        }
        if (pantalla.visible) {
          pantalla.mostrarError(mensaje);
        } else {
          aplicacion?.avisar(mensaje);
        }
      },
      alSalaCerrada: (motivo) => {
        pantalla.mostrarMensajeFinal(`La sala se cerró: ${motivo}`);
      },
      alDesconectar: () => {
        if (reintentando) {
          reintentando = false;
          return;
        }
        pantalla.mostrarMensajeFinal(
          "Se perdió la conexión con el anfitrión. Vuelve a unirte para reconectar.",
        );
      },
    });
  } catch (error) {
    pantalla.mostrarError(
      error instanceof Error ? error.message : "no se pudo conectar",
    );
    return;
  }
  conexion = nueva;
  const sesion = usarToken ? leerSesion(sessionStorage, codigo) : null;
  if (sesion === null) {
    nueva.unirse(nombre);
  } else {
    nueva.unirse(sesion.nombre, sesion.token);
  }
}
