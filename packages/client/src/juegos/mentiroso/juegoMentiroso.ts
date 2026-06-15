// Mentiroso como implementación de IJuego: UI MÍNIMA de DOM (sin Three.js). El
// servidor es la autoridad: este juego solo RENDERIZA la VistaMentiroso que
// llega por sincronizarEstado y emite intenciones (jugar/acusar) por el contexto
// del hub. No decide reglas; las validaciones locales son cortesía de UI.

import type {
  Carta,
  JugadorVistaMentiroso,
  Palo,
  ResolucionVista,
  VistaMentiroso,
} from "@juegos/server/vistaJuego";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";

const SIMBOLO: Record<Palo, string> = {
  picas: "♠",
  corazones: "♥",
  diamantes: "♦",
  treboles: "♣",
};

const NOMBRE_PALO: Record<Palo, string> = {
  picas: "picas",
  corazones: "corazones",
  diamantes: "diamantes",
  treboles: "tréboles",
};

const ROJOS: ReadonlySet<Palo> = new Set<Palo>(["corazones", "diamantes"]);

export class JuegoMentiroso implements IJuego {
  private contexto: ContextoJuego | null = null;
  private raiz: HTMLElement | null = null;
  private botonSalir: HTMLButtonElement | null = null;
  private toast: HTMLElement | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Cantidad de cartas elegida para la próxima jugada (1-3). Se conserva entre vistas. */
  private cantidadSel = 1;
  private ultimaVista: VistaMentiroso | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.contexto = contexto;
    const raiz = document.createElement("div");
    raiz.className = "mentiroso";
    contexto.contenedorHud.appendChild(raiz);
    this.raiz = raiz;

    this.botonSalir = document.createElement("button");
    this.botonSalir.className = "salir-hub";
    this.botonSalir.textContent = "← Hub";
    this.botonSalir.addEventListener("click", () => contexto.salirAlHub());
    contexto.contenedorHud.appendChild(this.botonSalir);

    this.toast = document.createElement("div");
    this.toast.className = "mentiroso-toast";
    this.toast.style.display = "none";
    contexto.contenedorHud.appendChild(this.toast);
  }

  sincronizarEstado(vista: VistaMentiroso): void {
    this.ultimaVista = vista;
    this.cantidadSel = Math.min(this.cantidadSel, Math.max(1, vista.tuMano.length));
    this.render();
  }

  procesarAccion(senal: SenalJuego): void {
    this.mostrarToast(senal.mensaje);
  }

  finalizar(): void {
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.raiz?.remove();
    this.botonSalir?.remove();
    this.toast?.remove();
    this.raiz = null;
    this.botonSalir = null;
    this.toast = null;
    this.toastTimeout = null;
    this.contexto = null;
    this.ultimaVista = null;
    this.cantidadSel = 1;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  private render(): void {
    const raiz = this.raiz;
    const vista = this.ultimaVista;
    if (raiz === null || vista === null) return;
    raiz.replaceChildren();

    raiz.appendChild(this.encabezado(vista));
    raiz.appendChild(this.listaJugadores(vista));
    if (vista.ultimaResolucion !== null) {
      raiz.appendChild(this.bannerResolucion(vista, vista.ultimaResolucion));
    }
    raiz.appendChild(this.estadoRonda(vista));
    raiz.appendChild(this.tuMano(vista));

    if (vista.ganadorId !== null) {
      raiz.appendChild(this.finPartida(vista));
    } else {
      raiz.appendChild(this.controles(vista));
    }
  }

  private encabezado(vista: VistaMentiroso): HTMLElement {
    const cab = document.createElement("div");
    cab.className = "mentiroso-cab";
    const titulo = document.createElement("h2");
    titulo.textContent = "Mentiroso";
    const palo = document.createElement("div");
    palo.className = "mentiroso-palo";
    palo.append(
      this.simboloPalo(vista.paloRonda),
      texto(` Ronda: ${NOMBRE_PALO[vista.paloRonda]}`),
    );
    const pila = document.createElement("div");
    pila.className = "mentiroso-pila";
    pila.textContent = `Pila: ${vista.numeroPila} carta${vista.numeroPila === 1 ? "" : "s"}`;
    cab.append(titulo, palo, pila);
    return cab;
  }

  private listaJugadores(vista: VistaMentiroso): HTMLElement {
    const ul = document.createElement("ul");
    ul.className = "mentiroso-jugadores";
    for (const j of vista.jugadores) {
      ul.appendChild(this.filaJugador(vista, j));
    }
    return ul;
  }

  private filaJugador(vista: VistaMentiroso, j: JugadorVistaMentiroso): HTMLElement {
    const li = document.createElement("li");
    li.className = "mentiroso-jugador";
    if (!j.conectado) li.classList.add("desconectado");
    if (j.id === vista.jugadorEnTurnoId) li.classList.add("en-turno");

    const turno = j.id === vista.jugadorEnTurnoId ? "▶ " : "";
    const yo = j.id === vista.tuJugadorId ? " (tú)" : "";
    const anfitrion = j.id === vista.anfitrionId ? " ★" : "";
    const pendiente = j.id === vista.ganadorPendienteId ? " ⏳" : "";
    const conexion = j.conectado ? "" : ` [${j.estadoConexion}]`;
    li.textContent = `${turno}${j.nombre}${yo}${anfitrion}${pendiente} — ${j.numeroCartas} carta${j.numeroCartas === 1 ? "" : "s"}${conexion}`;
    return li;
  }

  private estadoRonda(vista: VistaMentiroso): HTMLElement {
    const div = document.createElement("div");
    div.className = "mentiroso-estado";
    if (vista.ultimaJugada !== null) {
      const nombre = this.nombreDe(vista, vista.ultimaJugada.jugadorId);
      const n = vista.ultimaJugada.cantidad;
      div.textContent = `${nombre} puso ${n} carta${n === 1 ? "" : "s"} (declaró ${NOMBRE_PALO[vista.paloRonda]}).`;
    } else if (vista.jugadorEnTurnoId !== null) {
      div.textContent = `Abre la ronda: ${this.nombreDe(vista, vista.jugadorEnTurnoId)}.`;
    }
    return div;
  }

  private bannerResolucion(vista: VistaMentiroso, r: ResolucionVista): HTMLElement {
    const div = document.createElement("div");
    div.className = "mentiroso-resolucion";
    div.classList.add(r.mentia ? "mentia" : "verdad");
    const acusado = this.nombreDe(vista, r.acusadoId);
    const acusador = this.nombreDe(vista, r.acusadorId);
    const recoge = this.nombreDe(vista, r.quienRecogioId);
    const veredicto = r.mentia
      ? `¡Mentía! (alguna carta no era ${NOMBRE_PALO[r.paloRonda]})`
      : `Decía verdad (todas eran ${NOMBRE_PALO[r.paloRonda]})`;
    const linea = document.createElement("div");
    linea.textContent = `${acusador} acusó a ${acusado}: ${veredicto} → recoge ${recoge}.`;
    const cartas = document.createElement("div");
    cartas.className = "mentiroso-reveladas";
    for (const c of r.cartas) cartas.appendChild(this.cartaChip(c));
    div.append(linea, cartas);
    return div;
  }

  private tuMano(vista: VistaMentiroso): HTMLElement {
    const cont = document.createElement("div");
    cont.className = "mentiroso-mano";
    const titulo = document.createElement("div");
    titulo.className = "mentiroso-mano-titulo";
    titulo.textContent = `Tu mano (${vista.tuMano.length})`;
    const cartas = document.createElement("div");
    cartas.className = "mentiroso-cartas";
    for (const c of vista.tuMano) cartas.appendChild(this.cartaChip(c));
    cont.append(titulo, cartas);
    return cont;
  }

  private controles(vista: VistaMentiroso): HTMLElement {
    const cont = document.createElement("div");
    cont.className = "mentiroso-controles";
    const esMiTurno = vista.jugadorEnTurnoId === vista.tuJugadorId;
    const maxJugables = Math.min(3, vista.tuMano.length);

    if (esMiTurno && maxJugables >= 1) {
      const fila = document.createElement("div");
      fila.className = "mentiroso-jugar";
      for (let n = 1; n <= maxJugables; n++) {
        const b = document.createElement("button");
        b.textContent = String(n);
        b.className = "mentiroso-cant";
        if (n === this.cantidadSel) b.classList.add("sel");
        b.addEventListener("click", () => {
          this.cantidadSel = n;
          this.render();
        });
        fila.appendChild(b);
      }
      const jugar = document.createElement("button");
      jugar.className = "mentiroso-accion jugar";
      const cant = Math.min(this.cantidadSel, maxJugables);
      jugar.textContent = `Jugar ${cant} ${SIMBOLO[vista.paloRonda]}`;
      jugar.addEventListener("click", () => {
        this.contexto?.enviar({ tipo: "jugar", cantidad: cant });
      });
      fila.appendChild(jugar);
      cont.appendChild(fila);
    } else if (vista.jugadorEnTurnoId !== null) {
      const espera = document.createElement("div");
      espera.className = "mentiroso-espera";
      espera.textContent = `Turno de ${this.nombreDe(vista, vista.jugadorEnTurnoId)}…`;
      cont.appendChild(espera);
    }

    const puedeAcusar =
      vista.ultimaJugada !== null && vista.ultimaJugada.jugadorId !== vista.tuJugadorId;
    const acusar = document.createElement("button");
    acusar.className = "mentiroso-accion acusar";
    acusar.textContent = "¡Mentiroso!";
    acusar.disabled = !puedeAcusar;
    acusar.addEventListener("click", () => {
      this.contexto?.enviar({ tipo: "acusar" });
    });
    cont.appendChild(acusar);
    return cont;
  }

  private finPartida(vista: VistaMentiroso): HTMLElement {
    const div = document.createElement("div");
    div.className = "mentiroso-fin";
    const titulo = document.createElement("div");
    titulo.className = "mentiroso-fin-titulo";
    const nombre = vista.ganadorId === null ? "" : this.nombreDe(vista, vista.ganadorId);
    titulo.textContent = `🏆 ${nombre} ganó la partida`;
    const volver = document.createElement("button");
    volver.className = "mentiroso-accion";
    volver.textContent = "Volver al hub";
    volver.addEventListener("click", () => this.contexto?.salirAlHub());
    div.append(titulo, volver);
    return div;
  }

  // ── Utilidades ──────────────────────────────────────────────────────────

  private cartaChip(carta: Carta): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "mentiroso-carta";
    if (ROJOS.has(carta.palo)) chip.classList.add("roja");
    chip.textContent = SIMBOLO[carta.palo];
    chip.title = NOMBRE_PALO[carta.palo];
    return chip;
  }

  private simboloPalo(palo: Palo): HTMLElement {
    const span = document.createElement("span");
    span.className = "mentiroso-simbolo";
    if (ROJOS.has(palo)) span.classList.add("roja");
    span.textContent = SIMBOLO[palo];
    return span;
  }

  private nombreDe(vista: VistaMentiroso, id: string): string {
    return vista.jugadores.find((j) => j.id === id)?.nombre ?? id;
  }

  private mostrarToast(mensaje: string): void {
    const toast = this.toast;
    if (toast === null) return;
    toast.textContent = mensaje;
    toast.style.display = "block";
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.display = "none";
      this.toastTimeout = null;
    }, 4000);
  }
}

function texto(valor: string): Text {
  return document.createTextNode(valor);
}
