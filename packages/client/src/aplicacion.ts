// Cableado central de la partida: vista del servidor → diff → sincronizador
// de escena; eventos de puntero/HUD → máquina de interacción → comandos por
// la conexión. Las animaciones solo REPRESENTAN el estado: nunca lo alteran.

import type { VistaPartida } from "@juegos/server/vista";
import type { Conexion } from "./red/conexion.js";
import { difVista } from "./estado/difVista.js";
import type { EventoInteraccion } from "./estado/maquinaInteraccion.js";
import { ESTADO_INICIAL, transicion } from "./estado/maquinaInteraccion.js";
import { Sincronizador } from "./escena/animaciones.js";
import { Escena } from "./escena/escena.js";
import { Interpolador } from "./escena/interpolacion.js";
import { Seleccionador } from "./escena/seleccion.js";
import { Hud } from "./hud/hud.js";

export class Aplicacion {
  private estado = ESTADO_INICIAL;
  private readonly escena: Escena;
  private readonly sincronizador: Sincronizador;
  private readonly hud: Hud;

  constructor(
    contenedorEscena: HTMLElement,
    contenedorHud: HTMLElement,
    private readonly conexion: Conexion,
  ) {
    this.escena = new Escena(contenedorEscena);
    const interpolador = new Interpolador();
    this.sincronizador = new Sincronizador(this.escena.cartas, interpolador);
    this.hud = new Hud(contenedorHud, (evento) => this.despachar(evento));
    new Seleccionador(this.escena, (evento) => this.despachar(evento));
    this.escena.iniciar((dt) => interpolador.actualizar(dt));
  }

  /** Entrada única del estado del servidor. */
  recibirVista(vista: VistaPartida): void {
    const cambios = difVista(this.estado.vista, vista);
    this.despachar({ tipo: "vista", vista }, cambios);
  }

  avisar(mensaje: string): void {
    this.hud.mostrarAviso(mensaje);
  }

  private despachar(
    evento: EventoInteraccion,
    cambios: ReturnType<typeof difVista> = [],
  ): void {
    const resultado = transicion(this.estado, evento);
    this.estado = resultado.estado;
    for (const comando of resultado.comandos) {
      this.conexion.enviarMensaje(comando);
    }
    if (resultado.aviso !== null) {
      this.hud.mostrarAviso(resultado.aviso);
    }
    if (this.estado.vista !== null) {
      this.sincronizador.aplicar(
        this.estado.vista,
        cambios,
        new Set(this.estado.seleccion),
      );
    }
    this.hud.actualizar(this.estado);
  }
}
