// Carioca como implementación de IJuego. Mismo cableado que antes vivía en
// aplicacion.ts: vista del servidor → diff → sincronizador de escena; eventos
// de puntero/HUD → máquina de interacción → comandos por el contexto del hub.
// Las animaciones solo REPRESENTAN el estado: nunca lo alteran. No cambia
// ninguna regla ni la red; solo se adapta al ciclo de vida iniciar/finalizar.

import type * as THREE from "three";
import type { VistaPartida } from "@juegos/server/vista";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";
import { difVista } from "../../estado/difVista.js";
import type { EventoInteraccion } from "../../estado/maquinaInteraccion.js";
import { ESTADO_INICIAL, transicion } from "../../estado/maquinaInteraccion.js";
import {
  reconciliarMano,
  reordenar,
} from "../../estado/manoPresentacion.js";
import { Sincronizador } from "../../escena/animaciones.js";
import type { ArrastreVisual } from "../../escena/disposicion.js";
import { indiceManoDesdeX } from "../../escena/disposicion.js";
import { Escena } from "../../escena/escena.js";
import { InsigniasMesa } from "../../escena/insigniasMesa.js";
import { Interpolador } from "../../escena/interpolacion.js";
import type { DestinoArrastre, ObjetivoHover } from "../../escena/seleccion.js";
import { Seleccionador } from "../../escena/seleccion.js";
import { Hud } from "../../hud/hud.js";
import { etiquetaCombinacion, etiquetaCorta } from "../../hud/formatoCarta.js";
import { TooltipCarta } from "../../hud/tooltipCarta.js";

/** Altura a la que flota una carta mientras se la arrastra. */
const ALTURA_ARRASTRE = 1.6;

export class JuegoCarioca implements IJuego {
  private estado = ESTADO_INICIAL;
  private contexto: ContextoJuego | null = null;
  private escena: Escena | null = null;
  private sincronizador: Sincronizador | null = null;
  private seleccionador: Seleccionador | null = null;
  private hud: Hud | null = null;
  private tooltip: TooltipCarta | null = null;
  private insignias: InsigniasMesa | null = null;
  private botonSalir: HTMLButtonElement | null = null;
  /** Orden de la mano elegido por el jugador (presentación, no estado de juego). */
  private orden: string[] = [];
  /** Arrastre en curso (null en reposo). */
  private arrastre: ArrastreVisual | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.contexto = contexto;
    this.escena = new Escena(contexto.contenedorEscena);
    const interpolador = new Interpolador();
    this.sincronizador = new Sincronizador(this.escena.cartas, interpolador);
    this.hud = new Hud(contexto.contenedorHud, (evento) => this.despachar(evento));
    this.tooltip = new TooltipCarta(contexto.contenedorHud);
    this.insignias = new InsigniasMesa(
      contexto.contenedorHud,
      this.escena.camara,
      this.escena.renderer.domElement,
    );
    this.seleccionador = new Seleccionador(
      this.escena,
      (evento) => this.despachar(evento),
      {
        alIniciar: (cartaId) => this.iniciarArrastre(cartaId),
        alMover: (mundo, destino) => this.moverArrastre(mundo, destino),
        alSoltar: (destino) => this.soltarArrastre(destino),
      },
      (objetivo) => this.mostrarTooltip(objetivo),
    );
    this.botonSalir = crearBotonSalir(contexto.contenedorHud, () =>
      contexto.salirAlHub(),
    );
    this.escena.iniciar((dt) => interpolador.actualizar(dt));
  }

  sincronizarEstado(vista: VistaPartida): void {
    const cambios = difVista(this.estado.vista, vista);
    this.orden = reconciliarMano(this.orden, vista.tuMano);
    this.despachar({ tipo: "vista", vista }, cambios);
  }

  procesarAccion(senal: SenalJuego): void {
    this.hud?.mostrarAviso(senal.mensaje);
  }

  finalizar(): void {
    this.escena?.dispose();
    this.seleccionador?.destruir();
    this.hud?.destruir();
    this.tooltip?.destruir();
    this.insignias?.destruir();
    this.botonSalir?.remove();
    this.escena = null;
    this.sincronizador = null;
    this.seleccionador = null;
    this.hud = null;
    this.tooltip = null;
    this.insignias = null;
    this.botonSalir = null;
    this.contexto = null;
    this.estado = ESTADO_INICIAL;
    this.orden = [];
    this.arrastre = null;
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
        { orden: this.orden, arrastre: this.arrastre },
      );
    }
    if (this.estado.vista !== null) {
      this.hud?.actualizar(this.estado);
      this.insignias?.actualizar(this.estado.vista);
    }
  }

  /** Re-aplica el layout sin evento de máquina (previews de arrastre/reorden). */
  private relayout(): void {
    if (this.estado.vista === null) return;
    this.sincronizador?.aplicar(
      this.estado.vista,
      [],
      new Set(this.estado.seleccion),
      { orden: this.orden, arrastre: this.arrastre },
    );
  }

  /** Tooltip de hover: traduce el objetivo a texto desde la última vista. */
  private mostrarTooltip(objetivo: ObjetivoHover | null): void {
    const vista = this.estado.vista;
    if (objetivo === null || vista === null) {
      this.tooltip?.ocultar();
      return;
    }
    let texto: string | null = null;
    if (objetivo.tipo === "cartaPropia") {
      const carta = vista.tuMano.find((c) => c.id === objetivo.cartaId);
      if (carta !== undefined) texto = etiquetaCorta(carta);
    } else {
      const enMesa = vista.mesa[objetivo.mesaIdx];
      if (enMesa !== undefined) texto = etiquetaCombinacion(enMesa.combinacion.cartas);
    }
    if (texto === null) {
      this.tooltip?.ocultar();
      return;
    }
    this.tooltip?.mostrar(texto, objetivo.x, objetivo.y);
  }

  // ── Arrastre de cartas (visual): dispara las MISMAS intenciones al soltar ──

  private iniciarArrastre(cartaId: string): void {
    const indice = this.orden.indexOf(cartaId);
    this.arrastre = { cartaId, indiceDestino: indice < 0 ? 0 : indice };
    this.relayout(); // desmonta la mano y congela la carta arrastrada
  }

  private moverArrastre(mundo: THREE.Vector3, destino: DestinoArrastre): void {
    if (this.arrastre === null) return;
    const malla = this.sincronizador?.mallaDeCarta(this.arrastre.cartaId);
    if (malla !== undefined) {
      malla.position.set(mundo.x, ALTURA_ARRASTRE, mundo.z);
      malla.rotation.set(-0.5, 0, 0);
    }
    if (destino.tipo === "mano") {
      const total = this.estado.vista?.tuMano.length ?? this.orden.length;
      const indiceDestino = indiceManoDesdeX(mundo.x, total);
      if (indiceDestino !== this.arrastre.indiceDestino) {
        this.arrastre = { ...this.arrastre, indiceDestino };
        this.relayout(); // los vecinos abren hueco
      }
    }
  }

  private soltarArrastre(destino: DestinoArrastre): void {
    const arrastre = this.arrastre;
    this.arrastre = null;
    if (arrastre === null) return;
    switch (destino.tipo) {
      case "mano":
        this.orden = reordenar(this.orden, arrastre.cartaId, arrastre.indiceDestino);
        this.relayout(); // re-monta la mano con el orden nuevo
        return;
      case "pozo":
        this.despachar({ tipo: "soltarEnPozo", cartaId: arrastre.cartaId });
        return;
      case "combinacion":
        this.despachar({
          tipo: "soltarEnCombinacion",
          cartaId: arrastre.cartaId,
          mesaIdx: destino.mesaIdx,
        });
        return;
      case "mesaBajada":
        this.despachar({ tipo: "soltarEnMesaBajada", cartaId: arrastre.cartaId });
        return;
      case "fuera":
        this.relayout(); // acción inválida: la carta vuelve a la mano
        return;
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
