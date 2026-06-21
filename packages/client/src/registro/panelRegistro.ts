// Visor de log embebido: un botón discreto en la esquina superior izquierda que
// abre/cierra un panel con el log técnico en runtime. Se monta una sola vez en el
// contenedor #hud (compartido por hub, conexión y juego), así está siempre
// disponible sin que cada pantalla lo cablee.
//
// Solo OBSERVA: lee del registro singleton y lo muestra; no decide nada del juego.

import type { EntradaLog, NivelLog } from "./registro.js";
import { registro } from "./registro.js";

const ETIQUETA_NIVEL: Record<NivelLog, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function horaDe(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class PanelRegistro {
  private readonly boton: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly lista: HTMLElement;
  private readonly indicador: HTMLElement;
  private abierto = false;
  /** Hay errores nuevos vistos con el panel cerrado (enciende el indicador). */
  private hayErroresNuevos = false;

  constructor(contenedor: HTMLElement) {
    this.boton = document.createElement("button");
    this.boton.className = "log-boton";
    this.boton.title = "Log técnico";
    this.boton.setAttribute("aria-label", "Abrir log técnico");
    this.boton.textContent = "▤";
    this.indicador = document.createElement("span");
    this.indicador.className = "log-indicador";
    this.boton.appendChild(this.indicador);
    this.boton.addEventListener("click", () => this.alternar());

    this.panel = document.createElement("section");
    this.panel.className = "log-panel oculto";

    const cabecera = document.createElement("header");
    cabecera.className = "log-cabecera";
    const titulo = document.createElement("span");
    titulo.className = "log-titulo";
    titulo.textContent = "Log técnico";
    const limpiar = document.createElement("button");
    limpiar.textContent = "Limpiar";
    limpiar.addEventListener("click", () => registro.limpiar());
    const copiar = document.createElement("button");
    copiar.textContent = "Copiar";
    copiar.addEventListener("click", () => void this.copiar(copiar));
    const cerrar = document.createElement("button");
    cerrar.className = "log-cerrar";
    cerrar.textContent = "✕";
    cerrar.title = "Cerrar";
    cerrar.addEventListener("click", () => this.alternar());
    cabecera.append(titulo, limpiar, copiar, cerrar);

    this.lista = document.createElement("div");
    this.lista.className = "log-lista";

    this.panel.append(cabecera, this.lista);
    contenedor.append(this.boton, this.panel);

    registro.suscribir((entradas) => this.render(entradas));
    this.render(registro.entradas());
  }

  private alternar(): void {
    this.abierto = !this.abierto;
    this.panel.classList.toggle("oculto", !this.abierto);
    if (this.abierto) {
      this.hayErroresNuevos = false;
      this.indicador.classList.remove("activo");
      this.desplazarAlFondo();
    }
  }

  private render(entradas: readonly EntradaLog[]): void {
    if (!this.abierto) {
      // Con el panel cerrado, solo seguimos el indicador de errores nuevos.
      const ultima = entradas.at(-1);
      if (ultima !== undefined && ultima.nivel === "error") {
        this.hayErroresNuevos = true;
        this.indicador.classList.add("activo");
      }
      return;
    }

    const anclado = this.ancladoAlFondo();
    this.lista.replaceChildren(
      ...entradas.map((e) => this.filaDe(e)),
    );
    if (anclado) this.desplazarAlFondo();
  }

  private filaDe(entrada: EntradaLog): HTMLElement {
    const fila = document.createElement("div");
    fila.className = `log-fila nivel-${entrada.nivel}`;
    const hora = document.createElement("span");
    hora.className = "log-hora";
    hora.textContent = horaDe(entrada.ts);
    const nivel = document.createElement("span");
    nivel.className = "log-nivel";
    nivel.textContent = ETIQUETA_NIVEL[entrada.nivel];
    const mensaje = document.createElement("span");
    mensaje.className = "log-mensaje";
    mensaje.textContent = entrada.mensaje;
    fila.append(hora, nivel, mensaje);
    return fila;
  }

  /** ¿El scroll está (casi) al fondo? Decide si mantener el auto-scroll. */
  private ancladoAlFondo(): boolean {
    const { scrollTop, clientHeight, scrollHeight } = this.lista;
    return scrollHeight - (scrollTop + clientHeight) < 24;
  }

  private desplazarAlFondo(): void {
    this.lista.scrollTop = this.lista.scrollHeight;
  }

  private async copiar(boton: HTMLButtonElement): Promise<void> {
    const texto = registro
      .entradas()
      .map((e) => `${horaDe(e.ts)} ${ETIQUETA_NIVEL[e.nivel]} ${e.mensaje}`)
      .join("\n");
    const ok = await this.escribirPortapapeles(texto);
    const original = boton.textContent;
    boton.textContent = ok ? "¡Copiado!" : "Error";
    window.setTimeout(() => {
      boton.textContent = original;
    }, 1200);
  }

  private async escribirPortapapeles(texto: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch {
      // cae al método de respaldo
    }
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
