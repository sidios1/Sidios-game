// HUD de Rumble: overlay HTML propio sobre el render de Carioca. Rumble RODEA a
// Carioca, no la modifica — igual que MotorRumble decora a MotorCarioca en el
// servidor: este HUD se monta aparte en `contenedorHud` y no toca `hud/hud.ts`,
// `maquinaInteraccion.ts` ni `JuegoCarioca`.
//
// Solo REPRESENTA el slice `rumble` de la vista y emite intenciones `rumble/*`;
// jamás decide el resultado de una habilidad (el servidor revalida todo).
//
// Visibilidad §6.8: no hay lógica de filtrado aquí. El servidor ya decide qué
// viaja — en modo "secreta" el campo `habilidadesAjenas` simplemente NO existe en
// el payload, así que basta renderizarlo solo cuando está presente. `doblePublico`
// es no-opcional y se anuncia SIEMPRE, en ambos modos.

import type { Carta } from "@juegos/carioca-core";
import type {
  HabilidadVista,
  Ubicacion,
  VistaRumble,
} from "@juegos/server/vistaJuego";
import { etiquetaCorta } from "../../hud/formatoCarta.js";
import type { CandidatoObjetivo, EspecCarta } from "./selectores.js";
import { Selectores } from "./selectores.js";
import { TEXTOS } from "./textosHabilidades.js";

const MS_TOAST = 4500;

const SIMBOLOS_PINTA: Readonly<Record<string, string>> = {
  corazones: "♥",
  diamantes: "♦",
  treboles: "♣",
  picas: "♠",
};

/** Intención de habilidad ya construida por el HUD, lista para enviarse. */
export type IntencionRumble = { readonly tipo: string; readonly [campo: string]: unknown };

export interface CallbacksHudRumble {
  readonly alIntencion: (intencion: IntencionRumble) => void;
}

export class HudRumble {
  private readonly raiz: HTMLElement;
  private readonly barra: HTMLElement;
  private readonly revelaciones: HTMLElement;
  private readonly eventos: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly selectores: Selectores;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private vista: VistaRumble | null = null;
  /** Ids de EventoRumble ya mostrados como toast (dedup entre vistas). */
  private eventosVistos = new Set<string>();
  /** Ronda en curso, para vaciar el dedup cuando el servidor reasigna. */
  private manoDelDedup: number | null = null;

  constructor(
    contenedorHud: HTMLElement,
    private readonly callbacks: CallbacksHudRumble,
  ) {
    this.raiz = document.createElement("div");
    this.raiz.className = "rumble";
    contenedorHud.appendChild(this.raiz);

    this.barra = document.createElement("div");
    this.barra.className = "rumble-barra";
    this.revelaciones = document.createElement("div");
    this.revelaciones.className = "rumble-revelaciones";
    this.eventos = document.createElement("div");
    this.eventos.className = "rumble-eventos";
    this.toast = document.createElement("div");
    this.toast.className = "rumble-toast";
    this.toast.style.display = "none";
    this.raiz.append(this.barra, this.revelaciones, this.eventos, this.toast);

    this.selectores = new Selectores(this.raiz);
  }

  actualizar(vista: VistaRumble): void {
    // Al cambiar de mano el servidor reasigna y vacía el buzón: soltamos el dedup
    // para no tragarnos eventos nuevos que reusen numeración.
    if (this.manoDelDedup !== vista.manoActual) {
      this.manoDelDedup = vista.manoActual;
      this.eventosVistos = new Set();
    }
    this.vista = vista;
    this.render();
  }

  mostrarAviso(mensaje: string): void {
    this.toast.textContent = mensaje;
    this.toast.style.display = "block";
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast.style.display = "none";
      this.toastTimeout = null;
    }, MS_TOAST);
  }

  destruir(): void {
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.selectores.destruir();
    this.raiz.remove();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  private render(): void {
    const vista = this.vista;
    if (vista === null) return;
    this.renderBarra(vista);
    this.renderRevelaciones(vista);
    this.renderEventos(vista);
  }

  private renderBarra(vista: VistaRumble): void {
    this.barra.replaceChildren();
    const { misHabilidades } = vista.rumble;
    if (misHabilidades.length === 0) return;

    const titulo = document.createElement("div");
    titulo.className = "rumble-barra-titulo";
    titulo.textContent = misHabilidades.length === 1 ? "Tu habilidad" : "Tus habilidades";
    this.barra.appendChild(titulo);

    for (const hab of misHabilidades) {
      this.barra.appendChild(this.tarjetaHabilidad(vista, hab));
    }
  }

  private tarjetaHabilidad(vista: VistaRumble, hab: HabilidadVista): HTMLElement {
    const texto = TEXTOS[hab.id];
    const tarjeta = document.createElement("div");
    tarjeta.className = "rumble-hab";
    if (!hab.ventanaVigente) tarjeta.classList.add("fuera-de-ventana");

    const cabecera = document.createElement("div");
    cabecera.className = "rumble-hab-cabecera";

    const nombre = document.createElement("span");
    nombre.className = "rumble-hab-nombre";
    nombre.textContent = hab.nombre;
    cabecera.appendChild(nombre);

    const cargas = document.createElement("span");
    cargas.className = "rumble-hab-cargas";
    cargas.textContent = hab.cargasRestantes === null ? "pasiva" : `×${hab.cargasRestantes}`;
    if (hab.cargasRestantes === 0) cargas.classList.add("agotada");
    cabecera.appendChild(cargas);

    tarjeta.appendChild(cabecera);

    const desc = document.createElement("p");
    desc.className = "rumble-hab-desc";
    desc.textContent = texto.descripcion;
    tarjeta.appendChild(desc);

    if (!hab.ventanaVigente) {
      const aviso = document.createElement("div");
      aviso.className = "rumble-hab-estado";
      aviso.textContent = "Fuera de su ventana de uso";
      tarjeta.appendChild(aviso);
    }

    if (texto.accion === null) {
      // Pasiva o sin acción en el motor: nota informativa, nunca un botón inerte.
      if (texto.nota !== undefined) {
        const nota = document.createElement("div");
        nota.className = "rumble-hab-nota";
        nota.textContent = texto.nota;
        tarjeta.appendChild(nota);
      }
      return tarjeta;
    }

    const boton = document.createElement("button");
    boton.className = "rumble-hab-boton principal";
    boton.textContent = texto.accion;
    boton.disabled = !hab.ventanaVigente || hab.cargasRestantes === 0;
    boton.addEventListener("click", () => {
      void this.activar(vista, hab);
    });
    tarjeta.appendChild(boton);
    return tarjeta;
  }

  // ── Activación de habilidades ───────────────────────────────────────────────

  /** Rivales vivos como candidatos a objetivo (nunca uno mismo). */
  private rivales(vista: VistaRumble): CandidatoObjetivo[] {
    return vista.jugadores
      .filter((j) => j.id !== vista.tuJugadorId)
      .map((j) => ({ id: j.id, nombre: j.nombre }));
  }

  private emitir(intencion: IntencionRumble): void {
    this.callbacks.alIntencion(intencion);
  }

  /**
   * Traduce el click en una intención concreta, pidiendo antes lo que falte. Si el
   * jugador cancela un selector, NO se envía nada.
   */
  private async activar(vista: VistaRumble, hab: HabilidadVista): Promise<void> {
    switch (hab.id) {
      case "AUGURIO":
        this.emitir({ tipo: "rumble/augurio" });
        return;
      case "GINYU":
        this.emitir({ tipo: "rumble/ginyu" });
        return;
      case "EXTRA":
        this.emitir({ tipo: "rumble/extra" });
        return;
      case "SAPO": {
        const objetivoId = await this.selectores.pedirJugador(
          this.rivales(vista),
          "¿A quién le espías la mano?",
        );
        if (objetivoId !== null) this.emitir({ tipo: "rumble/sapo", objetivoId });
        return;
      }
      case "CHATO": {
        const objetivoId = await this.selectores.pedirJugador(
          this.rivales(vista),
          "¿A quién le reseteas la mano?",
        );
        if (objetivoId !== null) this.emitir({ tipo: "rumble/chato", objetivoId });
        return;
      }
      case "TROLL": {
        const objetivoId = await this.selectores.pedirJugador(
          this.rivales(vista),
          "¿A quién le reseteas las combinaciones?",
        );
        if (objetivoId !== null) this.emitir({ tipo: "rumble/troll", objetivoId });
        return;
      }
      case "DECRETALO": {
        const objetivo = await this.selectores.pedirCarta(
          "Decreta una carta",
          "Tus próximos 3 robos del mazo tendrán más probabilidad de sacarla.",
        );
        if (objetivo !== null) this.emitir({ tipo: "rumble/decretalo", objetivo });
        return;
      }
      case "MISH": {
        const carta = await this.selectores.pedirCarta(
          "¿Qué carta buscas?",
          "Te dirá si está en el mazo, en el pozo o en la mano de alguien.",
        );
        if (carta !== null) this.emitir({ tipo: "rumble/mish", carta });
        return;
      }
      case "MATO": {
        const que = await this.selectores.pedirJugador(
          [
            { id: "mano", nombre: "Resetear mi mano" },
            { id: "habilidad", nombre: "Resetear mi habilidad" },
          ],
          "¿Qué reseteas?",
        );
        if (que === "mano" || que === "habilidad") {
          this.emitir({ tipo: "rumble/mato", que });
        }
        return;
      }
      case "JUDIO": {
        // El pozo es zona visible: aquí el id SÍ es legítimo.
        const tope = vista.pozoTope;
        if (tope === null) {
          this.mostrarAviso("No hay ninguna carta en el pozo.");
          return;
        }
        this.emitir({ tipo: "rumble/judio", cartaId: tope.id });
        return;
      }
      case "GUASON": {
        const pinta = await this.selectores.pedirPinta("¿De qué pinta lo acuñas?");
        if (pinta === null) return;
        const cartaSalienteId = await this.selectores.pedirCartaPropia(
          vista.tuMano,
          "¿Qué carta entregas a cambio?",
          "Se va al fondo del mazo y recibes el comodín-de-pinta.",
        );
        if (cartaSalienteId === null) return;
        this.emitir({ tipo: "rumble/guason", pinta, cartaSalienteId });
        return;
      }
      case "PILLO": {
        const objetivoId = await this.selectores.pedirJugador(
          this.rivales(vista),
          "¿A quién le adivinas una carta?",
        );
        if (objetivoId === null) return;
        const carta: EspecCarta | null = await this.selectores.pedirCarta(
          "¿Qué carta crees que tiene?",
          "Si aciertas la cambias por una tuya. Si fallas, él elige qué robarte.",
        );
        if (carta === null) return;
        const cartaEntregadaId = await this.selectores.pedirCartaPropia(
          vista.tuMano,
          "¿Qué carta le entregas si aciertas?",
        );
        if (cartaEntregadaId === null) return;
        this.emitir({ tipo: "rumble/pillo", objetivoId, carta, cartaEntregadaId });
        return;
      }
      default:
        // RADAR, PESAO, OJO, DOBLE, TOCO y EXODIA no tienen botón (accion: null),
        // así que no pueden llegar aquí.
        return;
    }
  }

  /** Prompt del robo a ciegas tras un PILLO fallido (lo dispara el render). */
  private async resolverPilloPendiente(numeroCartas: number): Promise<void> {
    const indice = await this.selectores.pedirDorsoCiego(numeroCartas);
    if (indice !== null) this.emitir({ tipo: "rumble/pilloRobo", indice });
  }

  // ── Revelaciones ────────────────────────────────────────────────────────────

  private renderRevelaciones(vista: VistaRumble): void {
    this.revelaciones.replaceChildren();
    const r = vista.rumble;

    // DOBLE se anuncia SIEMPRE, aun en modo "secreta" (§6.8).
    if (r.doblePublico.length > 0) {
      const nombres = r.doblePublico.map((id) => this.nombreDe(vista, id)).join(", ");
      this.revelaciones.appendChild(
        this.panel("rumble-doble", "DOBLE", `${nombres}: si gana, todos suman el doble.`),
      );
    }

    if (r.habilidadesAjenas !== undefined) {
      const panel = this.panel("rumble-ajenas", "Habilidades de la mesa", null);
      const lista = document.createElement("ul");
      for (const [jugadorId, ids] of Object.entries(r.habilidadesAjenas)) {
        if (jugadorId === vista.tuJugadorId) continue;
        const li = document.createElement("li");
        li.textContent = `${this.nombreDe(vista, jugadorId)}: ${ids.join(", ")}`;
        lista.appendChild(li);
      }
      panel.appendChild(lista);
      this.revelaciones.appendChild(panel);
    }

    if (r.radar !== undefined) {
      const panel = this.panel("rumble-radar", "RADAR · pinta mayoritaria", null);
      const lista = document.createElement("ul");
      for (const [jugadorId, pinta] of Object.entries(r.radar)) {
        const li = document.createElement("li");
        const simbolo = pinta === null ? "—" : (SIMBOLOS_PINTA[pinta] ?? pinta);
        li.textContent = `${this.nombreDe(vista, jugadorId)}: ${simbolo}`;
        lista.appendChild(li);
      }
      panel.appendChild(lista);
      this.revelaciones.appendChild(panel);
    }

    if (r.augurio !== undefined) {
      const texto =
        r.augurio === null ? "El mazo está vacío." : `Arriba del mazo: ${etiquetaCorta(r.augurio)}`;
      this.revelaciones.appendChild(this.panel("rumble-augurio", "AUGURIO", texto));
    }

    if (r.sapo !== undefined) {
      const panel = this.panel(
        "rumble-sapo",
        `SAPO · ${this.nombreDe(vista, r.sapo.objetivoId)}`,
        "4 cartas al azar de su mano:",
      );
      panel.appendChild(this.filaCartas(r.sapo.cartas));
      this.revelaciones.appendChild(panel);
    }

    if (r.mish !== undefined) {
      this.revelaciones.appendChild(
        this.panel(
          "rumble-mish",
          "MISH",
          `${r.mish.descripcion} → ${this.textoUbicacion(vista, r.mish.ubicacion)}`,
        ),
      );
    }

    if (r.misionToco !== undefined) {
      // La misión ya ES el contrato de esta ronda para su dueño: el servidor la
      // proyecta en `vista.contrato`, así que el panel de bajada la usa tal cual.
      // Aquí solo se explica el reemplazo y se muestra el progreso.
      const yo = vista.jugadores.find((j) => j.id === vista.tuJugadorId);
      const panel = this.panel(
        "rumble-toco",
        "TOCO · tu misión",
        `${r.misionToco.nombre} (${r.misionToco.cartasRepartidas} cartas). Reemplaza el contrato de la ronda.`,
      );
      const estado = document.createElement("div");
      estado.className = "rumble-hab-estado";
      estado.textContent =
        yo?.seBajo === true
          ? "Misión completada: ganaste la mano."
          : "Al completarla ganas la mano.";
      panel.appendChild(estado);
      this.revelaciones.appendChild(panel);
    }

    if (r.descartesPendientes !== undefined && r.descartesPendientes > 0) {
      this.revelaciones.appendChild(
        this.panel(
          "rumble-penalizacion",
          "EXTRA · penalización",
          `Te quedan ${r.descartesPendientes} descarte(s) extra antes de pasar el turno.`,
        ),
      );
    }

    if (r.pilloPendiente !== undefined) {
      const { victimaId, numeroCartas } = r.pilloPendiente;
      const panel = this.panel(
        "rumble-pillo",
        "PILLO · te toca robar",
        `${this.nombreDe(vista, victimaId)} falló su PILLO: elige a ciegas una de sus ${numeroCartas} cartas.`,
      );
      const boton = document.createElement("button");
      boton.className = "principal";
      boton.textContent = "Elegir carta";
      boton.addEventListener("click", () => {
        void this.resolverPilloPendiente(numeroCartas);
      });
      panel.appendChild(boton);
      this.revelaciones.appendChild(panel);
    }
  }

  private renderEventos(vista: VistaRumble): void {
    this.eventos.replaceChildren();
    const ordenados = [...vista.rumble.eventos].sort((a, b) => a.turno - b.turno);
    for (const ev of ordenados) {
      const linea = document.createElement("div");
      linea.className = `rumble-evento tipo-${ev.tipo}`;
      linea.textContent = ev.texto;
      this.eventos.appendChild(linea);
    }
    // Los que no habíamos visto salen además como toast.
    const nuevos = ordenados.filter((ev) => !this.eventosVistos.has(ev.id));
    for (const ev of nuevos) this.eventosVistos.add(ev.id);
    const ultimo = nuevos[nuevos.length - 1];
    if (ultimo !== undefined) this.mostrarAviso(ultimo.texto);
  }

  // ── Helpers de presentación ─────────────────────────────────────────────────

  private panel(clase: string, titulo: string, cuerpo: string | null): HTMLElement {
    const panel = document.createElement("div");
    panel.className = `rumble-panel ${clase}`;
    const t = document.createElement("div");
    t.className = "rumble-panel-titulo";
    t.textContent = titulo;
    panel.appendChild(t);
    if (cuerpo !== null) {
      const p = document.createElement("p");
      p.textContent = cuerpo;
      panel.appendChild(p);
    }
    return panel;
  }

  private filaCartas(cartas: readonly Carta[]): HTMLElement {
    const fila = document.createElement("div");
    fila.className = "rumble-fila-cartas";
    for (const carta of cartas) {
      const chip = document.createElement("span");
      chip.className = "rumble-carta-chip";
      chip.textContent = etiquetaCorta(carta);
      fila.appendChild(chip);
    }
    return fila;
  }

  private nombreDe(vista: VistaRumble, jugadorId: string): string {
    return vista.jugadores.find((j) => j.id === jugadorId)?.nombre ?? jugadorId;
  }

  private textoUbicacion(vista: VistaRumble, ubicacion: Ubicacion): string {
    switch (ubicacion.donde) {
      case "mazo":
        return "está en el mazo";
      case "pozo":
        return "está en el pozo";
      case "mano":
        return `la tiene ${this.nombreDe(vista, ubicacion.jugadorId)}`;
      case "ninguna":
        return "ya está en la mesa";
    }
  }
}
