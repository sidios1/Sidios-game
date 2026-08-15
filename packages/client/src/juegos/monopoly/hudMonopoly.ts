// HUD de Monopoly Ultimate Team: overlay HTML sobre el canvas 3D. A
// diferencia de Carioca/UNO, la información de cada jugador (presupuesto,
// club, Descendido, conexión) se muestra en un panel FIJO (no insignias
// proyectadas sobre la ficha 3D): simplificación deliberada de esta sesión,
// ver PROMPTS_MONOPOLY_ULTIMATE_TEAM.md — toda la info exigida sigue visible
// y funcional, solo que en un panel de lista en vez de sobre el tablero.
//
// Dispatch DIRECTO (sin máquina de estados, ver plan de la sesión): cada
// botón lee `decisionPendiente`/`subastaEnCurso`/`ventanasAbiertas` de la
// vista y llama `alAccion` con la forma exacta que espera
// `motorMonopoly.ts`'s `parsearAccion`. El servidor revalida todo: acá solo
// se deshabilitan botones obviamente ilegales, como cortesía de UI.

import type {
  CartaMiClub,
  DecisionPendiente,
  JugadorVistaMonopoly,
  VistaMonopoly,
} from "@juegos/server/vistaJuego";
import { celdaEn, LIGAS, POSICIONES } from "@juegos/monopoly-core";
import type { NombreLiga, PosicionJugador } from "@juegos/monopoly-core";
import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";
import { clubDeJugador } from "./clubDeJugador.js";

export type AccionHudMonopoly =
  | { readonly tipo: "tirarDados" }
  | { readonly tipo: "comprarSobre"; readonly posicion?: PosicionJugador }
  | { readonly tipo: "declinarCompra" }
  | { readonly tipo: "pujar"; readonly monto: number }
  | { readonly tipo: "pasarSubasta" }
  | { readonly tipo: "elegirPosicionSobre"; readonly posicion: PosicionJugador }
  | { readonly tipo: "forzarCompra" }
  | { readonly tipo: "pagarMultaDescendido" }
  | { readonly tipo: "elegirRoboPrensa"; readonly rivalId: string; readonly cartaId: string }
  | { readonly tipo: "elegirCambioAgente"; readonly cartaId: string }
  | { readonly tipo: "elegirLigaDobleFichaje"; readonly liga: NombreLiga };

export interface CallbacksHudMonopoly {
  readonly alAccion: (accion: AccionHudMonopoly) => void;
  readonly alSalir: () => void;
  readonly alReconectar: () => void;
}

export class HudMonopoly {
  private readonly raiz: HTMLElement;
  private readonly barraSuperior: HTMLElement;
  private readonly jugadoresPanel: HTMLElement;
  private readonly librePanel: HTMLElement;
  private readonly acciones: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly botonSalir: HTMLButtonElement;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private vista: VistaMonopoly | null = null;
  private catalogo: readonly ClubPool[] = [];
  /** Monto que el jugador está tipeando para pujar (estado local de UI, no de reglas). */
  private montoPuja = 0;

  constructor(contenedorHud: HTMLElement, private readonly callbacks: CallbacksHudMonopoly) {
    this.raiz = document.createElement("div");
    this.raiz.className = "monopoly";
    contenedorHud.appendChild(this.raiz);

    this.barraSuperior = document.createElement("div");
    this.barraSuperior.className = "monopoly-barra";
    this.jugadoresPanel = document.createElement("div");
    this.jugadoresPanel.className = "monopoly-jugadores";
    this.librePanel = document.createElement("div");
    this.librePanel.className = "monopoly-libre";
    this.acciones = document.createElement("div");
    this.acciones.className = "monopoly-acciones";
    this.toast = document.createElement("div");
    this.toast.className = "monopoly-toast";
    this.toast.style.display = "none";
    this.raiz.append(this.barraSuperior, this.jugadoresPanel, this.librePanel, this.acciones, this.toast);

    this.botonSalir = document.createElement("button");
    this.botonSalir.className = "salir-hub";
    this.botonSalir.textContent = "← Hub";
    this.botonSalir.addEventListener("click", () => this.callbacks.alSalir());
    contenedorHud.appendChild(this.botonSalir);
  }

  actualizar(vista: VistaMonopoly, catalogo: readonly ClubPool[]): void {
    this.vista = vista;
    this.catalogo = catalogo;
    this.render();
  }

  mostrarAviso(mensaje: string): void {
    this.toast.textContent = mensaje;
    this.toast.style.display = "block";
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast.style.display = "none";
      this.toastTimeout = null;
    }, 4000);
  }

  destruir(): void {
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.raiz.remove();
    this.botonSalir.remove();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    const vista = this.vista;
    if (vista === null) return;
    this.renderBarraSuperior(vista);
    this.renderJugadores(vista);
    if (vista.terminada) {
      this.librePanel.replaceChildren();
      this.renderFinDePartida(vista);
      return;
    }
    this.renderLibre(vista);
    this.renderAcciones(vista);
  }

  private renderBarraSuperior(vista: VistaMonopoly): void {
    this.barraSuperior.replaceChildren();
    const ronda = document.createElement("div");
    ronda.className = "monopoly-chip";
    ronda.textContent = `Ronda ${Math.min(vista.numeroRonda, vista.rondasTotales)}/${vista.rondasTotales}`;
    const palco = document.createElement("div");
    palco.className = "monopoly-chip monopoly-chip-palco";
    palco.textContent = `Palco del Club: $${vista.palcoDelClub}M`;
    this.barraSuperior.append(ronda, palco);
  }

  private renderJugadores(vista: VistaMonopoly): void {
    this.jugadoresPanel.replaceChildren();
    for (const jugador of vista.jugadores) {
      this.jugadoresPanel.appendChild(this.filaJugador(vista, jugador));
    }
  }

  private filaJugador(vista: VistaMonopoly, jugador: JugadorVistaMonopoly): HTMLElement {
    const fila = document.createElement("div");
    fila.className = "monopoly-jugador";
    if (jugador.id === vista.jugadorEnTurnoId) fila.classList.add("en-turno");
    if (!jugador.conectado) fila.classList.add("desconectado");
    if (jugador.enQuiebra) fila.classList.add("en-quiebra");

    const club = clubDeJugador(this.catalogo, jugador.id);
    const logo = document.createElement("img");
    logo.className = "monopoly-jugador-logo";
    logo.alt = club?.nombre ?? "";
    // Ruta local, no la URL del CDN (ver texturasClubes.ts): mismo asset, sin
    // depender de un origen externo.
    if (club !== null) logo.src = `/datos/logos/${club.id}-clara.png`;

    const info = document.createElement("div");
    info.className = "monopoly-jugador-info";
    const nombre = document.createElement("span");
    nombre.className = "monopoly-jugador-nombre";
    nombre.textContent = jugador.id === vista.tuJugadorId ? `${jugador.nombre} (vos)` : jugador.nombre;
    const presupuesto = document.createElement("span");
    presupuesto.className = "monopoly-jugador-presupuesto";
    presupuesto.textContent = `$${jugador.presupuesto}M`;
    info.append(nombre, presupuesto);

    fila.append(logo, info);

    if (jugador.enDescendido) {
      const badge = document.createElement("span");
      badge.className = "monopoly-badge-descendido";
      badge.textContent = `Descendido (${jugador.turnosEnDescendido}/3)`;
      fila.appendChild(badge);
    }
    if (jugador.enQuiebra) {
      const badge = document.createElement("span");
      badge.className = "monopoly-badge-quiebra";
      badge.textContent = "Quiebra";
      fila.appendChild(badge);
    }
    return fila;
  }

  /** Acciones LIBRES (no gateadas por turno): pagar multa de Descendido, forzar compra. */
  private renderLibre(vista: VistaMonopoly): void {
    this.librePanel.replaceChildren();
    const yo = vista.jugadores.find((j) => j.id === vista.tuJugadorId);
    if (yo === undefined || yo.enQuiebra) return;

    if (yo.enDescendido) {
      this.librePanel.appendChild(
        this.boton("Pagar multa de Descendido ($25M)", "monopoly-accion-libre", () =>
          this.callbacks.alAccion({ tipo: "pagarMultaDescendido" }),
        ),
      );
    }

    const ventana = vista.ventanasAbiertas[yo.posicion];
    if (
      ventana !== undefined &&
      ventana.titularActualId !== yo.id &&
      vista.turnoGlobal < ventana.turnoDeCierre
    ) {
      this.librePanel.appendChild(
        this.boton(`Forzar compra (200% → $${ventana.precioActual * 2}M)`, "monopoly-accion-libre", () =>
          this.callbacks.alAccion({ tipo: "forzarCompra" }),
        ),
      );
    }
  }

  private renderAcciones(vista: VistaMonopoly): void {
    this.acciones.replaceChildren();

    if (vista.subastaEnCurso !== null) {
      this.renderSubasta(vista);
      return;
    }
    if (vista.decisionPendiente !== null) {
      if (vista.decisionPendiente.jugadorId !== vista.tuJugadorId) {
        this.esperando(
          `${this.nombreDe(vista, vista.decisionPendiente.jugadorId)} está decidiendo…`,
        );
        return;
      }
      this.renderDecision(vista, vista.decisionPendiente.detalle);
      return;
    }

    if (vista.jugadorEnTurnoId !== vista.tuJugadorId) {
      this.esperando(`Turno de ${this.nombreDe(vista, vista.jugadorEnTurnoId)}…`);
      return;
    }
    const yo = vista.jugadores.find((j) => j.id === vista.tuJugadorId);
    if (yo?.enDescendido === true) {
      this.esperando("Estás en Descendido: paga la multa o tira dobles para salir.");
    }
    this.acciones.appendChild(
      this.boton("🎲 Tirar dados", "monopoly-accion-principal", () =>
        this.callbacks.alAccion({ tipo: "tirarDados" }),
      ),
    );
  }

  private renderDecision(vista: VistaMonopoly, detalle: DecisionPendiente["detalle"]): void {
    switch (detalle.tipo) {
      case "compraODeclina": {
        const esTecnicos = celdaEn(detalle.celdaIndice).tipo === "tecnicos";
        this.acciones.appendChild(
          this.boton("Comprar sobre", "monopoly-accion-principal", () => {
            if (esTecnicos) {
              this.callbacks.alAccion({ tipo: "comprarSobre" });
            } else {
              this.acciones.appendChild(
                this.selectorPosicionInline((posicion) =>
                  this.callbacks.alAccion({ tipo: "comprarSobre", posicion }),
                ),
              );
            }
          }),
        );
        this.acciones.appendChild(
          this.boton("Declinar (a subasta)", "monopoly-accion-secundaria", () =>
            this.callbacks.alAccion({ tipo: "declinarCompra" }),
          ),
        );
        return;
      }
      case "elegirPosicionSobre": {
        this.acciones.appendChild(this.selectorPosicionInline((posicion) =>
          this.callbacks.alAccion({ tipo: "elegirPosicionSobre", posicion }),
        ));
        return;
      }
      case "elegirRoboPrensa": {
        this.renderRoboPrensa(vista);
        return;
      }
      case "elegirCambioAgente": {
        const yo = vista.jugadores.find((j) => j.id === vista.tuJugadorId);
        this.acciones.appendChild(this.selectorCartas(yo?.miClub ?? [], (cartaId) =>
          this.callbacks.alAccion({ tipo: "elegirCambioAgente", cartaId }),
        ));
        return;
      }
      case "elegirLigaDobleFichaje": {
        this.acciones.appendChild(this.selectorLiga((liga) =>
          this.callbacks.alAccion({ tipo: "elegirLigaDobleFichaje", liga }),
        ));
        return;
      }
    }
  }

  private renderRoboPrensa(vista: VistaMonopoly): void {
    const contenedor = document.createElement("div");
    contenedor.className = "monopoly-selector";
    const titulo = document.createElement("div");
    titulo.className = "monopoly-selector-titulo";
    titulo.textContent = "Elige de quién robar y qué carta:";
    contenedor.appendChild(titulo);
    for (const rival of vista.jugadores) {
      if (rival.id === vista.tuJugadorId || rival.miClub.length === 0) continue;
      const grupo = document.createElement("div");
      grupo.className = "monopoly-selector-grupo";
      const nombre = document.createElement("div");
      nombre.className = "monopoly-selector-subtitulo";
      nombre.textContent = rival.nombre;
      grupo.appendChild(nombre);
      grupo.appendChild(
        this.selectorCartas(rival.miClub, (cartaId) =>
          this.callbacks.alAccion({ tipo: "elegirRoboPrensa", rivalId: rival.id, cartaId }),
        ),
      );
      contenedor.appendChild(grupo);
    }
    this.acciones.appendChild(contenedor);
  }

  private renderSubasta(vista: VistaMonopoly): void {
    const subasta = vista.subastaEnCurso;
    if (subasta === null) return;
    const yo = vista.jugadores.find((j) => j.id === vista.tuJugadorId);
    const yaPase = subasta.jugadoresPasados.includes(vista.tuJugadorId);
    const minimo = subasta.pujaActual === null ? 10 : subasta.pujaActual.monto + 10;
    if (this.montoPuja < minimo) this.montoPuja = minimo;

    const panel = document.createElement("div");
    panel.className = "monopoly-subasta";
    const estadoTxt = document.createElement("div");
    estadoTxt.textContent =
      subasta.pujaActual === null
        ? "Sin pujas todavía."
        : `Puja actual: $${subasta.pujaActual.monto}M de ${this.nombreDe(vista, subasta.pujaActual.jugadorId)}`;
    panel.appendChild(estadoTxt);

    if (yo !== undefined && !yo.enQuiebra && !yaPase) {
      const fila = document.createElement("div");
      fila.className = "monopoly-subasta-fila";
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(minimo);
      input.step = "10";
      input.value = String(this.montoPuja);
      input.addEventListener("input", () => {
        this.montoPuja = Number(input.value) || minimo;
      });
      fila.appendChild(input);
      fila.appendChild(
        this.boton("Pujar", "monopoly-accion-principal", () =>
          this.callbacks.alAccion({ tipo: "pujar", monto: this.montoPuja }),
        ),
      );
      fila.appendChild(
        this.boton("Pasar", "monopoly-accion-secundaria", () =>
          this.callbacks.alAccion({ tipo: "pasarSubasta" }),
        ),
      );
      panel.appendChild(fila);
    } else if (yaPase) {
      const aviso = document.createElement("div");
      aviso.className = "monopoly-subaviso";
      aviso.textContent = "Ya pasaste en esta subasta.";
      panel.appendChild(aviso);
    }
    this.acciones.appendChild(panel);
  }

  private renderFinDePartida(vista: VistaMonopoly): void {
    const ranking = [...vista.jugadores].sort((a, b) => b.presupuesto - a.presupuesto);
    const panel = document.createElement("div");
    panel.className = "monopoly-fin";
    const titulo = document.createElement("div");
    titulo.className = "monopoly-fin-titulo";
    const primero = ranking[0];
    titulo.textContent = primero !== undefined ? `🏆 ${primero.nombre} termina primero` : "Partida terminada";
    panel.appendChild(titulo);
    const lista = document.createElement("ol");
    lista.className = "monopoly-fin-lista";
    for (const jugador of ranking) {
      const item = document.createElement("li");
      item.textContent = `${jugador.nombre} — $${jugador.presupuesto}M`;
      lista.appendChild(item);
    }
    panel.appendChild(lista);
    const volver = document.createElement("button");
    volver.className = "monopoly-accion-principal";
    volver.textContent = "Volver al hub";
    volver.addEventListener("click", () => this.callbacks.alSalir());
    panel.appendChild(volver);
    this.acciones.appendChild(panel);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private nombreDe(vista: VistaMonopoly, jugadorId: string | null): string {
    if (jugadorId === null) return "—";
    return vista.jugadores.find((j) => j.id === jugadorId)?.nombre ?? jugadorId;
  }

  private selectorPosicionInline(alElegir: (posicion: PosicionJugador) => void): HTMLElement {
    const contenedor = document.createElement("div");
    contenedor.className = "monopoly-selector";
    const titulo = document.createElement("div");
    titulo.className = "monopoly-selector-titulo";
    titulo.textContent = "Elige la posición del jugador:";
    contenedor.appendChild(titulo);
    const grid = document.createElement("div");
    grid.className = "monopoly-selector-grid";
    for (const posicion of POSICIONES) {
      grid.appendChild(
        this.boton(posicion, "monopoly-selector-boton", () => alElegir(posicion)),
      );
    }
    contenedor.appendChild(grid);
    return contenedor;
  }

  private selectorLiga(alElegir: (liga: NombreLiga) => void): HTMLElement {
    const contenedor = document.createElement("div");
    contenedor.className = "monopoly-selector";
    const titulo = document.createElement("div");
    titulo.className = "monopoly-selector-titulo";
    titulo.textContent = "Elige la liga del segundo fichaje:";
    contenedor.appendChild(titulo);
    const grid = document.createElement("div");
    grid.className = "monopoly-selector-grid";
    for (const liga of LIGAS) {
      grid.appendChild(this.boton(liga, "monopoly-selector-boton", () => alElegir(liga)));
    }
    contenedor.appendChild(grid);
    return contenedor;
  }

  private selectorCartas(
    cartas: readonly CartaMiClub[],
    alElegir: (cartaId: string) => void,
  ): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "monopoly-selector-grid";
    for (const carta of cartas) {
      const etiqueta =
        carta.tipo === "jugador"
          ? `${carta.jugador.nombre} ${carta.jugador.apellido} (${carta.jugador.posicion})`
          : `${carta.tecnico.nombre} ${carta.tecnico.apellido} (Técnico)`;
      grid.appendChild(this.boton(etiqueta, "monopoly-selector-boton", () => alElegir(carta.id)));
    }
    return grid;
  }

  private esperando(mensaje: string): void {
    const espera = document.createElement("div");
    espera.className = "monopoly-espera";
    espera.textContent = mensaje;
    this.acciones.appendChild(espera);
  }

  private boton(texto: string, clase: string, alClic: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = clase;
    b.textContent = texto;
    b.addEventListener("click", alClic);
    return b;
  }
}
