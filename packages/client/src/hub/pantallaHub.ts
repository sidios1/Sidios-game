// Menú del hub: launcher tipo biblioteca. Itera el catálogo (las DefinicionJuego)
// y pinta una grilla de tarjetas con portada, nombre, jugadores y una acción.
// Es genérico: NO conoce ningún juego concreto. Agregar un juego al catálogo lo
// hace aparecer aquí sin tocar esta pantalla. El `estado` de la ficha gobierna la
// acción: "jugable" lanza el flujo de conexión; "en_desarrollo" queda muteado.

import type { DefinicionJuego } from "../juego/ijuego.js";
import type { FichaCatalogo } from "../juego/ficha.js";
import type { Perfil } from "../perfil/perfil.js";
import { crearInsigniaPerfil } from "../perfil/insigniaPerfil.js";

export interface AccionesHub {
  readonly alElegir: (definicion: DefinicionJuego) => void;
  /** Perfil activo a mostrar en la cabecera (opcional). */
  readonly perfil?: () => Perfil | null;
  /** Abrir el editor de perfil desde la cabecera (opcional). */
  readonly alEditarPerfil?: () => void;
}

/** Texto de la línea de jugadores: "Jugadores ilimitados" o "{min}–{max} jugadores". */
function lineaJugadores(jugadores: FichaCatalogo["jugadores"]): string {
  return jugadores.max === null
    ? "Jugadores ilimitados"
    : `${jugadores.min}–${jugadores.max} jugadores`;
}

export class PantallaHub {
  private readonly velo: HTMLElement;

  constructor(
    raiz: HTMLElement,
    private readonly catalogo: readonly DefinicionJuego[],
    private readonly acciones: AccionesHub,
  ) {
    this.velo = document.createElement("div");
    this.velo.className = "velo";
    raiz.appendChild(this.velo);
  }

  mostrar(): void {
    this.velo.replaceChildren();
    this.velo.classList.remove("oculto");

    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta tarjeta-hub";

    const perfil = this.acciones.perfil?.() ?? null;
    if (perfil !== null) {
      const cabecera = crearInsigniaPerfil(perfil, "Editar", () =>
        this.acciones.alEditarPerfil?.(),
      );
      tarjeta.appendChild(cabecera);
    }

    const titulo = document.createElement("h1");
    titulo.className = "wordmark";
    titulo.textContent = "Sidios";
    const subtitulo = document.createElement("p");
    subtitulo.className = "subtitulo";
    subtitulo.textContent = "Tu biblioteca de juegos";
    tarjeta.append(titulo, subtitulo);

    const grilla = document.createElement("div");
    grilla.className = "grilla-juegos";
    for (const definicion of this.catalogo) {
      grilla.appendChild(this.crearTarjetaJuego(definicion));
    }
    tarjeta.appendChild(grilla);

    this.velo.appendChild(tarjeta);
  }

  private crearTarjetaJuego(definicion: DefinicionJuego): HTMLElement {
    const enDesarrollo = definicion.estado === "en_desarrollo";

    const carta = document.createElement("article");
    carta.className = "carta-juego";
    carta.dataset["juego"] = definicion.id;
    if (enDesarrollo) carta.classList.add("en-desarrollo");

    // Portada (3:4). v1 monta siempre el componente; la rama "imagen" queda
    // definida en el contrato pero sin uso todavía.
    const portada = document.createElement("div");
    portada.className = "carta-portada";
    if (definicion.portada.tipo === "componente") {
      portada.appendChild(definicion.portada.componente());
    } else {
      const img = document.createElement("img");
      img.src = definicion.portada.src;
      img.alt = definicion.nombre;
      portada.appendChild(img);
    }
    if (enDesarrollo) {
      const badge = document.createElement("span");
      badge.className = "badge-desarrollo";
      badge.textContent = "En desarrollo";
      portada.appendChild(badge);
    }

    // Cuerpo: nombre + jugadores + descriptor.
    const cuerpo = document.createElement("div");
    cuerpo.className = "carta-cuerpo";

    const nombre = document.createElement("h2");
    nombre.className = "carta-nombre";
    nombre.textContent = definicion.nombre;

    const jugadores = document.createElement("p");
    jugadores.className = "carta-jugadores";
    jugadores.textContent = lineaJugadores(definicion.jugadores);

    cuerpo.append(nombre, jugadores);

    if (definicion.descriptorCorto !== undefined) {
      const desc = document.createElement("p");
      desc.className = "carta-descriptor";
      desc.textContent = definicion.descriptorCorto;
      cuerpo.appendChild(desc);
    }

    // Acción: única parte interactiva de la tarjeta.
    const accion = document.createElement("button");
    accion.className = "carta-accion";
    if (enDesarrollo) {
      accion.textContent = "En desarrollo";
      accion.disabled = true;
    } else {
      accion.textContent = "Jugar";
      accion.addEventListener("click", () => this.acciones.alElegir(definicion));
    }
    cuerpo.appendChild(accion);

    carta.append(portada, cuerpo);
    return carta;
  }

  ocultar(): void {
    this.velo.classList.add("oculto");
  }

  get visible(): boolean {
    return !this.velo.classList.contains("oculto");
  }
}
