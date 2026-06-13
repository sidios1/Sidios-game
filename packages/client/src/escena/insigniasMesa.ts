// Insignias de identidad ancladas sobre la mesa 3D: por cada jugador AJENO,
// un overlay DOM (avatar + nickname) flotando sobre su asiento, con el jugador
// en turno resaltado. La cámara es fija, así que basta reposicionar cuando
// cambia la vista o el tamaño del lienzo; no se acopla al bucle de render.
//
// Solo REPRESENTA la vista: nunca decide ni bloquea estado (regla 5 de CLAUDE).

import type * as THREE from "three";
import type { VistaPartida } from "@juegos/server/vista";
import { avatarPorDefecto, crearAvatar } from "../perfil/avatares.js";
import { poseManoJugador } from "./disposicion.js";
import { proyectarAPantalla } from "./proyeccion.js";

/** Altura sobre la mesa a la que flota la insignia (unidades de mundo). */
const ELEVACION = 0.8;
const TAM_AVATAR = 40;

export class InsigniasMesa {
  private readonly contenedor: HTMLElement;
  private vista: VistaPartida | null = null;

  constructor(
    raiz: HTMLElement,
    private readonly camara: THREE.Camera,
    private readonly lienzo: HTMLElement,
  ) {
    this.contenedor = document.createElement("div");
    this.contenedor.className = "insignias-mesa";
    raiz.appendChild(this.contenedor);
    window.addEventListener("resize", this.reposicionar);
  }

  actualizar(vista: VistaPartida): void {
    this.vista = vista;
    this.render();
  }

  private readonly reposicionar = (): void => this.render();

  private render(): void {
    this.contenedor.replaceChildren();
    const vista = this.vista;
    if (vista === null) return;
    const ancho = this.lienzo.clientWidth;
    const alto = this.lienzo.clientHeight;
    if (ancho === 0 || alto === 0) return;

    for (const jugador of vista.jugadores) {
      // Mi identidad ya tiene presencia en el banner y el panel; en la mesa
      // mostramos a los AJENOS, sobre su asiento.
      if (jugador.id === vista.tuJugadorId) continue;
      const pose = poseManoJugador(vista, jugador.id);
      const punto = proyectarAPantalla(
        this.camara,
        ancho,
        alto,
        pose.x,
        pose.y + ELEVACION,
        pose.z,
      );
      if (!punto.visible) continue;

      const insignia = document.createElement("div");
      insignia.className = "insignia-mesa";
      if (jugador.id === vista.turno.jugadorId && vista.fase === "jugandoMano") {
        insignia.classList.add("en-turno");
      }
      if (!jugador.conectado) insignia.classList.add("desconectado");
      insignia.style.left = `${punto.x}px`;
      insignia.style.top = `${punto.y}px`;

      const avatar = crearAvatar(
        jugador.avatar ?? avatarPorDefecto(jugador.id),
        TAM_AVATAR,
      );
      avatar.className = "insignia-mesa-avatar";
      const nombre = document.createElement("span");
      nombre.className = "insignia-mesa-nombre";
      nombre.textContent = jugador.nombre;
      insignia.append(avatar, nombre);
      this.contenedor.appendChild(insignia);
    }
  }

  destruir(): void {
    window.removeEventListener("resize", this.reposicionar);
    this.contenedor.remove();
  }
}
