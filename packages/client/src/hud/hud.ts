// HUD de partida en DOM superpuesto al canvas: contrato y turno arriba,
// jugadores a la derecha, acciones contextuales abajo, avisos como toast.
// Se re-renderiza completo en cada cambio de estado (es pequeño y barato).

import type { VistaPartida } from "@juegos/server/vista";
import type { JugadorVista } from "@juegos/server/vista";
import type {
  EstadoInteraccion,
  EventoInteraccion,
} from "../estado/maquinaInteraccion.js";
import { avatarPorDefecto, crearAvatar } from "../perfil/avatares.js";
import { renderPanelBajada } from "./panelBajada.js";
import { renderPanelResumen } from "./panelResumen.js";

export class Hud {
  private readonly top: HTMLElement;
  private readonly superior: HTMLElement;
  private readonly jugadores: HTMLElement;
  private readonly estado: HTMLElement;
  private readonly acciones: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly aviso: HTMLElement;
  private readonly secciones: readonly HTMLElement[];
  private temporizadorAviso: number | null = null;

  // Modo +Turbo: cuenta atrás del turno. El elemento se recrea en cada render;
  // un intervalo local lo refresca desde el último dato del servidor (ms
  // restantes relativos + instante de recepción), sin confiar en sincronía de
  // relojes ni en que este setInterval sea preciso (el servidor es la autoridad).
  private relojTurbo: HTMLElement | null = null;
  private msRestantesTurbo: number | null = null;
  private recibidoEnTurbo = 0;
  private readonly intervaloReloj: number;

  constructor(
    raiz: HTMLElement,
    private readonly despachar: (evento: EventoInteraccion) => void,
    /** Reinicia el intento de reconexión al anfitrión (token guardado). */
    private readonly reconectar: () => void = () => {},
  ) {
    // Barra superior en grid: contrato/turno (centro) y jugadores (derecha) en
    // columnas distintas, así no se solapan por más que crezca su contenido.
    this.top = crearSeccion(raiz, "hud-top");
    this.superior = crearSeccion(this.top, "hud-superior");
    this.jugadores = crearSeccion(this.top, "hud-jugadores");
    // Mensajes de estado pasivos ("Esperando a X…") arriba, fuera de la mano.
    this.estado = crearSeccion(raiz, "hud-estado");
    this.acciones = crearSeccion(raiz, "hud-acciones");
    this.panel = crearSeccion(raiz, "hud-panel");
    this.aviso = crearSeccion(raiz, "hud-aviso");
    this.secciones = [this.top, this.estado, this.acciones, this.panel, this.aviso];
    this.intervaloReloj = window.setInterval(() => this.actualizarReloj(), 250);
  }

  /** Cancela el aviso pendiente y quita todas las secciones del DOM. */
  destruir(): void {
    if (this.temporizadorAviso !== null) {
      window.clearTimeout(this.temporizadorAviso);
      this.temporizadorAviso = null;
    }
    window.clearInterval(this.intervaloReloj);
    for (const seccion of this.secciones) seccion.remove();
  }

  mostrarAviso(texto: string): void {
    this.aviso.textContent = texto;
    this.aviso.classList.add("visible");
    if (this.temporizadorAviso !== null) {
      window.clearTimeout(this.temporizadorAviso);
    }
    this.temporizadorAviso = window.setTimeout(() => {
      this.aviso.classList.remove("visible");
    }, 4000);
  }

  actualizar(estado: EstadoInteraccion): void {
    const vista = estado.vista;
    if (vista === null) return;
    // Re-sincroniza la cuenta atrás con el último dato del servidor.
    this.msRestantesTurbo = vista.turbo ? vista.turboMsRestantes : null;
    this.recibidoEnTurbo = Date.now();
    this.renderSuperior(estado, vista);
    this.renderJugadores(vista);
    this.renderAcciones(estado, vista);
    this.renderPanel(estado, vista);
  }

  /** Refresca el número de la cuenta atrás del turno (si hay reloj visible). */
  private actualizarReloj(): void {
    const reloj = this.relojTurbo;
    if (reloj === null || this.msRestantesTurbo === null) return;
    const restante = Math.max(0, this.msRestantesTurbo - (Date.now() - this.recibidoEnTurbo));
    reloj.textContent = `${Math.ceil(restante / 1000)}s`;
    reloj.classList.toggle("urgente", restante <= 5000);
  }

  private renderSuperior(estado: EstadoInteraccion, vista: VistaPartida): void {
    this.superior.replaceChildren();
    const contrato = document.createElement("div");
    contrato.className = "contrato";
    contrato.textContent = `Mano ${vista.manoActual}/9 · ${vista.contrato.nombre}`;
    this.superior.append(contrato, this.crearBannerTurno(estado, vista));
    // RESPALDO para TODOS los jugadores: la reconexión es automática, pero este
    // botón fuerza un intento inmediato si hiciera falta (reattacha por token).
    const reconectar = document.createElement("button");
    reconectar.className = "reconectar";
    reconectar.textContent = "Reconectar";
    reconectar.title = "Fuerza un intento de reconexión con el anfitrión";
    reconectar.addEventListener("click", () => this.reconectar());
    this.superior.appendChild(reconectar);
  }

  /** Banner destacado del jugador EN TURNO: su avatar grande + nickname. */
  private crearBannerTurno(
    estado: EstadoInteraccion,
    vista: VistaPartida,
  ): HTMLElement {
    const banner = document.createElement("div");
    banner.className = "turno-banner";
    const enTurno = vista.jugadores.find((j) => j.id === vista.turno.jugadorId);
    if (vista.fase === "jugandoMano" && enTurno !== undefined) {
      const avatar = crearAvatar(avatarDe(enTurno), 48);
      avatar.className = "turno-avatar";
      banner.appendChild(avatar);
      if (enTurno.id === vista.tuJugadorId) banner.classList.add("propio");
    }
    const turno = document.createElement("div");
    turno.className = "turno";
    turno.textContent = textoDeTurno(estado, vista);
    banner.appendChild(turno);
    // Modo +Turbo: cuenta atrás del turno en curso, visible para todos.
    this.relojTurbo = null;
    if (
      vista.turbo &&
      vista.turboMsRestantes !== null &&
      vista.fase === "jugandoMano"
    ) {
      const reloj = document.createElement("div");
      reloj.className = "reloj-turbo";
      banner.appendChild(reloj);
      this.relojTurbo = reloj;
      this.actualizarReloj();
    }
    return banner;
  }

  private renderJugadores(vista: VistaPartida): void {
    this.jugadores.replaceChildren();
    const soyAnfitrion = vista.anfitrionId === vista.tuJugadorId;
    for (const jugador of vista.jugadores) {
      const fila = document.createElement("div");
      fila.className = "jugador";
      if (jugador.id === vista.turno.jugadorId && vista.fase === "jugandoMano") {
        fila.classList.add("en-turno");
      }
      const avatar = crearAvatar(avatarDe(jugador), 28);
      avatar.className = "avatar-mini";

      const detalles: string[] = [
        `${jugador.numeroCartas} cartas`,
        `${jugador.puntosAcumulados} pts`,
      ];
      if (jugador.seBajo) detalles.push("bajado");
      const etiqueta = etiquetaConexion(jugador.estadoConexion);
      if (etiqueta !== null) detalles.push(etiqueta);
      if (vista.fase === "manoTerminada" && jugador.listoSiguienteMano) {
        detalles.push("listo");
      }
      const quien = jugador.id === vista.tuJugadorId ? `${jugador.nombre} (tú)` : jugador.nombre;
      const texto = document.createElement("span");
      texto.className = "jugador-texto";
      texto.textContent = `${quien} — ${detalles.join(" · ")}`;
      fila.append(avatar, texto);
      // El anfitrión puede reabrir el canal de un jugador ausente/suspendido
      // (no es expulsión: conserva asiento y mano).
      if (
        soyAnfitrion &&
        jugador.id !== vista.tuJugadorId &&
        jugador.estadoConexion !== "conectado"
      ) {
        const reabrir = document.createElement("button");
        reabrir.className = "reabrir";
        reabrir.textContent = "Reabrir conexión";
        reabrir.addEventListener("click", () =>
          this.despachar({ tipo: "reabrirConexion", jugadorId: jugador.id }),
        );
        fila.appendChild(reabrir);
      }
      this.jugadores.appendChild(fila);
    }
  }

  private renderAcciones(estado: EstadoInteraccion, vista: VistaPartida): void {
    this.acciones.replaceChildren();
    this.estado.textContent = "";
    const pista = document.createElement("span");
    pista.className = "pista";
    switch (estado.modo) {
      case "robar":
        pista.textContent = "Haz click en el mazo o en el pozo para robar.";
        this.acciones.appendChild(pista);
        return;
      case "descartar": {
        pista.textContent = meBaje(vista)
          ? "Elige una carta y descártala, o haz click en una combinación para pegarla."
          : "Elige una carta y descártala.";
        this.acciones.appendChild(pista);
        const descartar = document.createElement("button");
        descartar.className = "principal";
        descartar.textContent = "Descartar";
        descartar.disabled = estado.seleccion.length !== 1;
        descartar.addEventListener("click", () =>
          this.despachar({ tipo: "botonDescartar" }),
        );
        this.acciones.appendChild(descartar);
        if (!meBaje(vista)) {
          const bajarse = document.createElement("button");
          bajarse.textContent = "Bajarse…";
          bajarse.addEventListener("click", () =>
            this.despachar({ tipo: "abrirBajada" }),
          );
          this.acciones.appendChild(bajarse);
        }
        return;
      }
      case "esperandoTurno": {
        // Estado pasivo: va arriba (.hud-estado), nunca sobre la mano.
        const turno = vista.jugadores.find((j) => j.id === vista.turno.jugadorId);
        this.estado.textContent = `Esperando a ${turno?.nombre ?? "otro jugador"}…`;
        return;
      }
      default:
        return;
    }
  }

  private renderPanel(estado: EstadoInteraccion, vista: VistaPartida): void {
    this.panel.replaceChildren();
    this.panel.className = "hud-panel";
    switch (estado.modo) {
      case "construyendoBajada":
        renderPanelBajada(this.panel, estado, vista, this.despachar);
        return;
      case "eligiendoExtremo":
        this.renderDialogoExtremo();
        return;
      case "manoTerminada":
      case "partidaTerminada":
        renderPanelResumen(this.panel, estado, vista, this.despachar);
        return;
      default:
        return;
    }
  }

  private renderDialogoExtremo(): void {
    this.panel.classList.add("panel");
    const pregunta = document.createElement("p");
    pregunta.textContent = "¿Por qué extremo de la escala pegas la carta?";
    const fila = document.createElement("div");
    fila.className = "fila-botones";
    const inicio = document.createElement("button");
    inicio.textContent = "Al inicio (carta más baja)";
    inicio.addEventListener("click", () =>
      this.despachar({ tipo: "elegirExtremo", extremo: "inicio" }),
    );
    const fin = document.createElement("button");
    fin.textContent = "Al final (carta más alta)";
    fin.addEventListener("click", () =>
      this.despachar({ tipo: "elegirExtremo", extremo: "fin" }),
    );
    const cancelar = document.createElement("button");
    cancelar.textContent = "Cancelar";
    cancelar.addEventListener("click", () =>
      this.despachar({ tipo: "cancelarExtremo" }),
    );
    fila.append(inicio, fin, cancelar);
    this.panel.append(pregunta, fila);
  }
}

function crearSeccion(raiz: HTMLElement, clase: string): HTMLElement {
  const seccion = document.createElement("div");
  seccion.className = clase;
  raiz.appendChild(seccion);
  return seccion;
}

function meBaje(vista: VistaPartida): boolean {
  return vista.jugadores.find((j) => j.id === vista.tuJugadorId)?.seBajo ?? false;
}

/** Avatar del jugador, con fallback determinista si no eligió uno. */
function avatarDe(jugador: JugadorVista): string {
  return jugador.avatar ?? avatarPorDefecto(jugador.id);
}

/** Texto del estado de conexión, o null si está conectado (sin etiqueta). */
function etiquetaConexion(estado: JugadorVista["estadoConexion"]): string | null {
  switch (estado) {
    case "conectado":
      return null;
    case "ausente":
      return "ausente";
    case "suspendido":
      return "suspendido";
  }
}

function textoDeTurno(estado: EstadoInteraccion, vista: VistaPartida): string {
  if (vista.fase === "manoTerminada") return "Mano terminada";
  if (vista.fase === "partidaTerminada") return "Partida terminada";
  if (vista.turno.jugadorId !== vista.tuJugadorId) {
    const jugador = vista.jugadores.find((j) => j.id === vista.turno.jugadorId);
    return `Turno de ${jugador?.nombre ?? "otro jugador"}`;
  }
  return estado.modo === "robar" ? "Tu turno: roba una carta" : "Tu turno: juega";
}
