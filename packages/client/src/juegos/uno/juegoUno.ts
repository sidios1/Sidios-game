// UNO como implementación de IJuego. Reusa el motor de escena 3D de Carioca por
// importación (Escena parametrizada, SincronizadorPoses genérico, Seleccionador,
// Interpolador) con la identidad propia de UNO (paleta, texturas, indicadores).
// El servidor es la autoridad: este juego solo RENDERIZA la VistaUno y emite
// intenciones; la legalidad sale SIEMPRE de accionesLegales (cortesía de UI).

import type * as THREE from "three";
import type { CartaUno, ColorUno, VistaUno } from "@juegos/server/vistaJuego";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";
import { Escena } from "../../escena/escena.js";
import { Interpolador } from "../../escena/interpolacion.js";
import { SincronizadorPoses } from "../../escena/sincronizadorPoses.js";
import type { DestinoArrastre, EventoPuntero } from "../../escena/seleccion.js";
import { Seleccionador } from "../../escena/seleccion.js";
import { calcularDisposicionUno } from "./disposicionUno.js";
import type { ObjetivoUno } from "./disposicionUno.js";
import { crearOrigenUno } from "./difVistaUno.js";
import { crearMallaCartaUno, crearMallaDorsoUno } from "./mallaUno.js";
import { HudUno } from "./hudUno.js";
import { COLOR_HEX } from "./texturasUno.js";

/** Estética de UNO: mesa fría y neutra para que el tinte del color activo resalte. */
const OPCIONES_ESCENA = {
  fondo: "#0a1420",
  fieltro: "#22324a",
  borde: "#0f1b2b",
  colorZona: "#2c3e5a",
  luzAmbiente: { color: "#ffffff", intensidad: 0.9 },
  luzFocal: { color: "#ffffff", intensidad: 1.2 },
  zonas: ["mazo"] as const,
};

/** Altura a la que flota una carta mientras se la arrastra al descarte. */
const ALTURA_ARRASTRE = 1.6;

function esComodin(carta: CartaUno): boolean {
  return carta.tipo === "wild" || carta.tipo === "mas4";
}

export class JuegoUno implements IJuego {
  private contexto: ContextoJuego | null = null;
  private escena: Escena | null = null;
  private sincronizador: SincronizadorPoses<ObjetivoUno> | null = null;
  private seleccionador: Seleccionador | null = null;
  private hud: HudUno | null = null;
  private ultimaVista: VistaUno | null = null;
  private vistaAnterior: VistaUno | null = null;
  /** Ids de cartas jugables ahora (de accionesLegales); cortesía de UI. */
  private jugables: ReadonlySet<string> = new Set();
  /** Carta en arrastre (null en reposo). */
  private arrastre: string | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.contexto = contexto;
    const escena = new Escena(contexto.contenedorEscena, OPCIONES_ESCENA);
    this.escena = escena;
    const interpolador = new Interpolador();
    this.sincronizador = new SincronizadorPoses<ObjetivoUno>(escena.cartas, interpolador, (o) =>
      o.carta !== null ? crearMallaCartaUno(o.carta) : crearMallaDorsoUno(),
    );
    this.hud = new HudUno(contexto.contenedorHud, escena.camara, escena.renderer.domElement, {
      alAccion: (accion) => this.contexto?.enviar(accion),
      alSalir: () => contexto.salirAlHub(),
      alReconectar: () => contexto.reconectar(),
    });
    this.seleccionador = new Seleccionador(
      escena,
      (evento) => this.alPuntero(evento),
      {
        alIniciar: (cartaId) => this.iniciarArrastre(cartaId),
        alMover: (mundo, destino) => this.moverArrastre(mundo, destino),
        alSoltar: (destino) => this.soltarArrastre(destino),
      },
      () => undefined,
    );
    escena.iniciar((dt) => interpolador.actualizar(dt));
  }

  sincronizarEstado(vista: VistaUno): void {
    const reparto = this.vistaAnterior === null;
    this.jugables = new Set(
      vista.accionesLegales.flatMap((a) => (a.tipo === "jugar" ? [a.cartaId] : [])),
    );
    const objetivos = calcularDisposicionUno(vista, this.jugables);
    const origen = crearOrigenUno(this.vistaAnterior, vista, reparto);
    this.escena?.ajustarMesa(vista.jugadores.length);
    this.sincronizador?.aplicar(objetivos, reparto, origen);
    this.escena?.resaltarColor(COLOR_HEX[vista.colorActivo]);
    this.hud?.actualizar(vista);
    this.vistaAnterior = vista;
    this.ultimaVista = vista;
  }

  procesarAccion(senal: SenalJuego): void {
    this.hud?.mostrarAviso(senal.mensaje);
  }

  finalizar(): void {
    this.escena?.dispose();
    this.seleccionador?.destruir();
    this.hud?.destruir();
    this.escena = null;
    this.sincronizador = null;
    this.seleccionador = null;
    this.hud = null;
    this.contexto = null;
    this.ultimaVista = null;
    this.vistaAnterior = null;
    this.jugables = new Set();
    this.arrastre = null;
  }

  // ── Interacción ─────────────────────────────────────────────────────────────

  private alPuntero(evento: EventoPuntero): void {
    switch (evento.tipo) {
      case "clickCarta":
        if (this.jugables.has(evento.cartaId)) void this.intentarJugar(evento.cartaId);
        return;
      case "clickMazo":
        if (this.ultimaVista?.accionesLegales.some((a) => a.tipo === "robar")) {
          this.contexto?.enviar({ tipo: "robar" });
        }
        return;
      case "clickPozo":
      case "clickCombinacion":
        // En UNO no se roba del descarte ni hay combinaciones: sin acción.
        return;
    }
  }

  private iniciarArrastre(cartaId: string): void {
    this.arrastre = cartaId;
  }

  private moverArrastre(mundo: THREE.Vector3, _destino: DestinoArrastre): void {
    if (this.arrastre === null) return;
    const malla = this.sincronizador?.mallaDeCarta(this.arrastre);
    if (malla !== undefined) {
      malla.position.set(mundo.x, ALTURA_ARRASTRE, mundo.z);
      malla.rotation.set(-0.5, 0, 0);
    }
  }

  private soltarArrastre(destino: DestinoArrastre): void {
    const cartaId = this.arrastre;
    this.arrastre = null;
    if (cartaId === null) return;
    // Soltar sobre el descarte una carta jugable = jugarla; cualquier otra cosa
    // (incl. carta no jugable) la devuelve a la mano con un relayout.
    if (destino.tipo === "pozo" && this.jugables.has(cartaId)) {
      void this.intentarJugar(cartaId);
      return;
    }
    this.relayout();
  }

  /** Reaplica el layout de la última vista (devuelve la carta arrastrada a su sitio). */
  private relayout(): void {
    const vista = this.ultimaVista;
    if (vista === null) return;
    const objetivos = calcularDisposicionUno(vista, this.jugables);
    this.sincronizador?.aplicar(objetivos, false, (_clave, objetivo) => ({
      pose: objetivo.pose,
      retraso: 0,
    }));
  }

  /**
   * Juega una carta: si es comodín, pide el color por el selector antes de
   * confirmar; si se cancela, no se envía nada (la carta vuelve a su sitio).
   */
  private async intentarJugar(cartaId: string): Promise<void> {
    const carta = this.ultimaVista?.tuMano.find((c) => c.id === cartaId);
    if (carta === undefined) {
      this.relayout();
      return;
    }
    if (esComodin(carta)) {
      const color: ColorUno | null = (await this.hud?.pedirColor()) ?? null;
      if (color === null) {
        this.relayout();
        return;
      }
      this.contexto?.enviar({ tipo: "jugar", cartaId, color });
      return;
    }
    this.contexto?.enviar({ tipo: "jugar", cartaId });
  }
}
