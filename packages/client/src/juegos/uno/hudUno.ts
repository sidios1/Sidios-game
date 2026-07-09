// HUD de UNO: overlay HTML sobre el canvas (no objetos 3D, salvo el tinte del
// fieltro que aplica juegoUno). Muestra los indicadores propios del juego —color
// activo, dirección y acumulado "+N"—, las insignias de los rivales (conteo de
// cartas + resalte del jugador en turno), los botones de acción derivados de
// accionesLegales y el selector de color al jugar un comodín. Solo REPRESENTA la
// vista y emite intenciones; jamás decide reglas (el servidor revalida).

import type * as THREE from "three";
import type { ColorUno, VistaUno } from "@juegos/server/vistaJuego";
import { avatarPorDefecto, crearAvatar } from "../../perfil/avatares.js";
import { proyectarAPantalla } from "../../escena/proyeccion.js";
import { poseAsientoUno } from "./disposicionUno.js";
import { COLOR_HEX } from "./texturasUno.js";

const COLORES: readonly ColorUno[] = ["rojo", "amarillo", "verde", "azul"];
const NOMBRE_COLOR: Readonly<Record<ColorUno, string>> = {
  rojo: "Rojo",
  amarillo: "Amarillo",
  verde: "Verde",
  azul: "Azul",
};
const TAM_AVATAR = 40;
const ELEVACION = 0.8;
const FRACCION_BANDA_MANO = 0.62;
const MARGEN_LATERAL = 24;

/** Acciones que emite el HUD (las jugadas de carta salen de la escena). */
export type AccionHudUno =
  | { readonly tipo: "robar" }
  | { readonly tipo: "pasar" }
  | { readonly tipo: "resolverAcumulado" };

export interface CallbacksHudUno {
  readonly alAccion: (accion: AccionHudUno) => void;
  readonly alSalir: () => void;
  readonly alReconectar: () => void;
}

export class HudUno {
  private readonly raiz: HTMLElement;
  private readonly indicadores: HTMLElement;
  private readonly insignias: HTMLElement;
  private readonly acciones: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly botonSalir: HTMLButtonElement;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private vista: VistaUno | null = null;
  /** Selector de color abierto: resuelve con el color elegido (o null si se cancela). */
  private selectorActivo: ((color: ColorUno | null) => void) | null = null;
  private selectorEl: HTMLElement | null = null;

  constructor(
    contenedorHud: HTMLElement,
    private readonly camara: THREE.Camera,
    private readonly lienzo: HTMLElement,
    private readonly callbacks: CallbacksHudUno,
  ) {
    this.raiz = document.createElement("div");
    this.raiz.className = "uno";
    contenedorHud.appendChild(this.raiz);

    this.indicadores = document.createElement("div");
    this.indicadores.className = "uno-indicadores";
    this.insignias = document.createElement("div");
    this.insignias.className = "uno-insignias";
    this.acciones = document.createElement("div");
    this.acciones.className = "uno-acciones";
    this.toast = document.createElement("div");
    this.toast.className = "uno-toast";
    this.toast.style.display = "none";
    this.raiz.append(this.indicadores, this.insignias, this.acciones, this.toast);

    this.botonSalir = document.createElement("button");
    this.botonSalir.className = "salir-hub";
    this.botonSalir.textContent = "← Hub";
    this.botonSalir.addEventListener("click", () => this.callbacks.alSalir());
    contenedorHud.appendChild(this.botonSalir);

    window.addEventListener("resize", this.reposicionar);
  }

  actualizar(vista: VistaUno): void {
    this.vista = vista;
    this.render();
  }

  /**
   * Abre el selector de color (al jugar un comodín) y resuelve con el color elegido
   * o null si se cancela. juegoUno espera este color antes de confirmar la jugada.
   */
  pedirColor(): Promise<ColorUno | null> {
    this.cerrarSelector(null);
    return new Promise((resolver) => {
      this.selectorActivo = resolver;
      const velo = document.createElement("div");
      velo.className = "uno-selector";
      const panel = document.createElement("div");
      panel.className = "uno-selector-panel";
      const titulo = document.createElement("div");
      titulo.className = "uno-selector-titulo";
      titulo.textContent = "Elige un color";
      panel.appendChild(titulo);
      const grid = document.createElement("div");
      grid.className = "uno-selector-grid";
      for (const color of COLORES) {
        const boton = document.createElement("button");
        boton.className = "uno-color-boton";
        boton.style.background = COLOR_HEX[color];
        boton.title = NOMBRE_COLOR[color];
        boton.setAttribute("aria-label", NOMBRE_COLOR[color]);
        boton.addEventListener("click", () => this.cerrarSelector(color));
        grid.appendChild(boton);
      }
      panel.appendChild(grid);
      const cancelar = document.createElement("button");
      cancelar.className = "uno-selector-cancelar";
      cancelar.textContent = "Cancelar";
      cancelar.addEventListener("click", () => this.cerrarSelector(null));
      panel.appendChild(cancelar);
      velo.appendChild(panel);
      velo.addEventListener("click", (e) => {
        if (e.target === velo) this.cerrarSelector(null);
      });
      this.selectorEl = velo;
      this.raiz.appendChild(velo);
    });
  }

  private cerrarSelector(color: ColorUno | null): void {
    const resolver = this.selectorActivo;
    this.selectorActivo = null;
    this.selectorEl?.remove();
    this.selectorEl = null;
    if (resolver !== null) resolver(color);
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
    this.cerrarSelector(null);
    window.removeEventListener("resize", this.reposicionar);
    this.raiz.remove();
    this.botonSalir.remove();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private readonly reposicionar = (): void => this.render();

  private render(): void {
    const vista = this.vista;
    if (vista === null) return;
    this.renderIndicadores(vista);
    this.renderInsignias(vista);
    this.renderAcciones(vista);
  }

  private renderIndicadores(vista: VistaUno): void {
    this.indicadores.replaceChildren();

    const color = document.createElement("div");
    color.className = "uno-color-activo";
    color.style.background = COLOR_HEX[vista.colorActivo];
    color.textContent = NOMBRE_COLOR[vista.colorActivo];
    this.indicadores.appendChild(color);

    const direccion = document.createElement("div");
    direccion.className = "uno-direccion";
    direccion.textContent = vista.direccion === "horario" ? "↻ horario" : "↺ antihorario";
    this.indicadores.appendChild(direccion);

    if (vista.acumuladoPendiente > 0) {
      const acum = document.createElement("div");
      acum.className = "uno-acumulado";
      acum.textContent = `+${vista.acumuladoPendiente}`;
      this.indicadores.appendChild(acum);
    }
  }

  private renderInsignias(vista: VistaUno): void {
    this.insignias.replaceChildren();
    const ancho = this.lienzo.clientWidth;
    const alto = this.lienzo.clientHeight;
    if (ancho === 0 || alto === 0) return;

    for (const jugador of vista.jugadores) {
      if (jugador.id === vista.tuJugadorId) continue;
      const pose = poseAsientoUno(vista, jugador.id);
      const punto = proyectarAPantalla(this.camara, ancho, alto, pose.x, pose.y + ELEVACION, pose.z);
      if (!punto.visible) continue;

      const insignia = document.createElement("div");
      insignia.className = "uno-insignia";
      if (jugador.id === vista.jugadorEnTurnoId) insignia.classList.add("en-turno");

      const limiteInferior = alto * FRACCION_BANDA_MANO;
      const left = Math.min(Math.max(punto.x, MARGEN_LATERAL), ancho - MARGEN_LATERAL);
      const top = Math.min(punto.y, limiteInferior);
      insignia.style.left = `${left}px`;
      insignia.style.top = `${top}px`;

      const avatar = crearAvatar(avatarPorDefecto(jugador.id), TAM_AVATAR);
      avatar.className = "uno-insignia-avatar";
      const nombre = document.createElement("span");
      nombre.className = "uno-insignia-nombre";
      nombre.textContent = jugador.nombre;
      const cartas = document.createElement("span");
      cartas.className = "uno-insignia-cartas";
      cartas.textContent = `${jugador.numeroCartas} 🂠`;
      if (jugador.numeroCartas === 1) cartas.classList.add("uno-grito");
      insignia.append(avatar, nombre, cartas);
      this.insignias.appendChild(insignia);
    }
  }

  private renderAcciones(vista: VistaUno): void {
    this.acciones.replaceChildren();

    if (vista.ganadorId !== null) {
      const nombre = vista.jugadores.find((j) => j.id === vista.ganadorId)?.nombre ?? vista.ganadorId;
      const fin = document.createElement("div");
      fin.className = "uno-fin";
      const titulo = document.createElement("div");
      titulo.className = "uno-fin-titulo";
      titulo.textContent = `🏆 ${nombre} ganó la partida`;
      const volver = document.createElement("button");
      volver.className = "uno-accion";
      volver.textContent = "Volver al hub";
      volver.addEventListener("click", () => this.callbacks.alSalir());
      fin.append(titulo, volver);
      this.acciones.appendChild(fin);
      return;
    }

    const esMiTurno = vista.jugadorEnTurnoId === vista.tuJugadorId;
    if (!esMiTurno) {
      const espera = document.createElement("div");
      espera.className = "uno-espera";
      const nombre =
        vista.jugadorEnTurnoId === null
          ? "—"
          : (vista.jugadores.find((j) => j.id === vista.jugadorEnTurnoId)?.nombre ??
            vista.jugadorEnTurnoId);
      espera.textContent = `Turno de ${nombre}…`;
      this.acciones.appendChild(espera);
      return;
    }

    const tipos = new Set(vista.accionesLegales.map((a) => a.tipo));
    if (tipos.has("robar")) {
      this.acciones.appendChild(
        this.boton("Robar", "uno-accion robar", () => this.callbacks.alAccion({ tipo: "robar" })),
      );
    }
    if (tipos.has("resolverAcumulado")) {
      this.acciones.appendChild(
        this.boton(`Robar +${vista.acumuladoPendiente}`, "uno-accion robar", () =>
          this.callbacks.alAccion({ tipo: "resolverAcumulado" }),
        ),
      );
    }
    if (tipos.has("pasar")) {
      // "pasar" legal ⟺ robada pendiente: el jugador robó una carta jugable y debe
      // jugar ESA carta (resaltada en la mano) o pasar.
      this.acciones.appendChild(
        this.boton("Pasar", "uno-accion pasar", () => this.callbacks.alAccion({ tipo: "pasar" })),
      );
      const aviso = document.createElement("div");
      aviso.className = "uno-subaviso";
      aviso.textContent = "Robaste: juega esa carta o pasa.";
      this.acciones.appendChild(aviso);
    }
  }

  private boton(texto: string, clase: string, alClic: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = clase;
    b.textContent = texto;
    b.addEventListener("click", alClic);
    return b;
  }
}
