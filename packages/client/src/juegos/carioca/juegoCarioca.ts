// Carioca como implementación de IJuego. Mismo cableado que antes vivía en
// aplicacion.ts: vista del servidor → diff → sincronizador de escena; eventos
// de puntero/HUD → máquina de interacción → comandos por el contexto del hub.
// Las animaciones solo REPRESENTAN el estado: nunca lo alteran. No cambia
// ninguna regla ni la red; solo se adapta al ciclo de vida iniciar/finalizar.

import type { VistaPartida } from "@juegos/server/vista";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";
import { difVista } from "../../estado/difVista.js";
import type { EventoInteraccion } from "../../estado/maquinaInteraccion.js";
import { ESTADO_INICIAL, transicion } from "../../estado/maquinaInteraccion.js";
import { Sincronizador } from "../../escena/animaciones.js";
import { Escena } from "../../escena/escena.js";
import { Interpolador } from "../../escena/interpolacion.js";
import { Seleccionador } from "../../escena/seleccion.js";
import { Hud } from "../../hud/hud.js";

export class JuegoCarioca implements IJuego {
  private estado = ESTADO_INICIAL;
  private contexto: ContextoJuego | null = null;
  private escena: Escena | null = null;
  private sincronizador: Sincronizador | null = null;
  private seleccionador: Seleccionador | null = null;
  private hud: Hud | null = null;
  private botonSalir: HTMLButtonElement | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.contexto = contexto;
    this.escena = new Escena(contexto.contenedorEscena);
    const interpolador = new Interpolador();
    this.sincronizador = new Sincronizador(this.escena.cartas, interpolador);
    this.hud = new Hud(contexto.contenedorHud, (evento) => this.despachar(evento));
    this.seleccionador = new Seleccionador(this.escena, (evento) =>
      this.despachar(evento),
    );
    this.botonSalir = crearBotonSalir(contexto.contenedorHud, () =>
      contexto.salirAlHub(),
    );
    this.escena.iniciar((dt) => interpolador.actualizar(dt));
  }

  sincronizarEstado(vista: VistaPartida): void {
    const cambios = difVista(this.estado.vista, vista);
    this.despachar({ tipo: "vista", vista }, cambios);
  }

  procesarAccion(senal: SenalJuego): void {
    this.hud?.mostrarAviso(senal.mensaje);
  }

  finalizar(): void {
    this.escena?.dispose();
    this.seleccionador?.destruir();
    this.hud?.destruir();
    this.botonSalir?.remove();
    this.escena = null;
    this.sincronizador = null;
    this.seleccionador = null;
    this.hud = null;
    this.botonSalir = null;
    this.contexto = null;
    this.estado = ESTADO_INICIAL;
  }

  private despachar(
    evento: EventoInteraccion,
    cambios: ReturnType<typeof difVista> = [],
  ): void {
    const resultado = transicion(this.estado, evento);
    this.estado = resultado.estado;
    for (const comando of resultado.comandos) {
      this.contexto?.enviar(comando);
    }
    if (resultado.aviso !== null) {
      this.hud?.mostrarAviso(resultado.aviso);
    }
    if (this.estado.vista !== null) {
      this.sincronizador?.aplicar(
        this.estado.vista,
        cambios,
        new Set(this.estado.seleccion),
      );
    }
    if (this.estado.vista !== null) {
      this.hud?.actualizar(this.estado);
    }
  }
}

/** Botón persistente para volver al hub en cualquier momento. */
function crearBotonSalir(
  contenedor: HTMLElement,
  alSalir: () => void,
): HTMLButtonElement {
  const boton = document.createElement("button");
  boton.className = "salir-hub";
  boton.textContent = "← Hub";
  boton.addEventListener("click", alSalir);
  contenedor.appendChild(boton);
  return boton;
}
