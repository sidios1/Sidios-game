// Tooltip flotante con el detalle de una carta/combinación al hacer hover.
// Es solo representación: lo alimenta JuegoCarioca desde la última vista; no
// emite intenciones ni toca el estado. Vive como <div> dentro del contenedor
// HUD; sin pointer-events para no interferir con el raycast del canvas.

/** Separación en píxeles entre el puntero y la esquina del tooltip. */
const OFFSET = 14;

export class TooltipCarta {
  private readonly elemento: HTMLDivElement;

  constructor(raiz: HTMLElement) {
    this.elemento = document.createElement("div");
    this.elemento.className = "tooltip-carta";
    raiz.appendChild(this.elemento);
  }

  /** Muestra el texto cerca del puntero (coords de viewport), sin desbordar. */
  mostrar(texto: string, x: number, y: number): void {
    this.elemento.textContent = texto;
    this.elemento.classList.add("visible");
    const ancho = this.elemento.offsetWidth;
    const alto = this.elemento.offsetHeight;
    const izq = Math.min(x + OFFSET, window.innerWidth - ancho - OFFSET);
    const arr = Math.min(y + OFFSET, window.innerHeight - alto - OFFSET);
    this.elemento.style.left = `${Math.max(OFFSET, izq)}px`;
    this.elemento.style.top = `${Math.max(OFFSET, arr)}px`;
  }

  ocultar(): void {
    this.elemento.classList.remove("visible");
  }

  destruir(): void {
    this.elemento.remove();
  }
}
