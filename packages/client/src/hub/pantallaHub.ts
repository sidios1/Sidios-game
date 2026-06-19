// Menú del hub: lista los juegos del catálogo y, al pulsar uno, avisa al
// coordinador cuál se eligió. Es genérico: recibe las DefinicionJuego y no
// conoce ningún juego concreto. Agregar un juego al catálogo lo hace aparecer
// aquí sin tocar esta pantalla.

import type { DefinicionJuego } from "../juego/ijuego.js";
import type { Perfil } from "../perfil/perfil.js";
import { crearInsigniaPerfil } from "../perfil/insigniaPerfil.js";

export interface AccionesHub {
  readonly alElegir: (definicion: DefinicionJuego) => void;
  /** Perfil activo a mostrar en la cabecera (opcional). */
  readonly perfil?: () => Perfil | null;
  /** Abrir el editor de perfil desde la cabecera (opcional). */
  readonly alEditarPerfil?: () => void;
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
    tarjeta.className = "tarjeta";

    const perfil = this.acciones.perfil?.() ?? null;
    if (perfil !== null) {
      const cabecera = crearInsigniaPerfil(perfil, "Editar", () =>
        this.acciones.alEditarPerfil?.(),
      );
      tarjeta.appendChild(cabecera);
    }

    const titulo = document.createElement("h1");
    titulo.textContent = "Sidios Game";
    const subtitulo = document.createElement("p");
    subtitulo.className = "subtitulo";
    subtitulo.textContent = "Elige un juego";
    tarjeta.append(titulo, subtitulo);

    const lista = document.createElement("div");
    lista.className = "lista-juegos";
    for (const definicion of this.catalogo) {
      lista.appendChild(this.crearTarjetaJuego(definicion));
    }
    tarjeta.appendChild(lista);

    this.velo.appendChild(tarjeta);
  }

  private crearTarjetaJuego(definicion: DefinicionJuego): HTMLElement {
    const boton = document.createElement("button");
    boton.className = "juego";
    boton.dataset["juego"] = definicion.id;

    const nombre = document.createElement("span");
    nombre.className = "juego-nombre";
    nombre.textContent = definicion.nombre;

    const descripcion = document.createElement("span");
    descripcion.className = "juego-descripcion";
    descripcion.textContent = definicion.descripcion;

    boton.append(nombre, descripcion);
    boton.addEventListener("click", () => this.acciones.alElegir(definicion));
    return boton;
  }

  ocultar(): void {
    this.velo.classList.add("oculto");
  }

  get visible(): boolean {
    return !this.velo.classList.contains("oculto");
  }
}
