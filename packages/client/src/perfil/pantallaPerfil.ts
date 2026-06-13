// Editor de perfil: nickname + grid de avatares del pool (generados por código).
// Reusa las clases de estilo velo/tarjeta del resto de pantallas. Al guardar,
// valida el nickname y avisa al coordinador con el Perfil resultante.

import { POOL_AVATARES, avatarPorDefecto, crearAvatar } from "./avatares.js";
import type { Perfil } from "./perfil.js";
import { MAX_NICKNAME } from "./perfil.js";

export interface AccionesPerfil {
  readonly alGuardar: (perfil: Perfil) => void;
  /** Cerrar sin guardar; ausente en el primer arranque (perfil obligatorio). */
  readonly alCancelar?: () => void;
}

const TAM_AVATAR = 72;

export class PantallaPerfil {
  private readonly velo: HTMLElement;
  private avatarElegido: string = POOL_AVATARES[0] ?? "identicon-1";

  constructor(
    raiz: HTMLElement,
    private readonly acciones: AccionesPerfil,
  ) {
    this.velo = document.createElement("div");
    this.velo.className = "velo";
    raiz.appendChild(this.velo);
  }

  /**
   * @param permitirCancelar muestra "Cancelar"; por defecto solo cuando ya hay
   * perfil (en el primer arranque el perfil es obligatorio, sin salida).
   */
  mostrar(
    perfilActual: Perfil | null,
    permitirCancelar: boolean = perfilActual !== null,
  ): void {
    this.avatarElegido = perfilActual?.avatarId ?? avatarPorDefecto("nuevo");
    this.velo.replaceChildren();
    this.velo.classList.remove("oculto");

    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";

    const titulo = document.createElement("h1");
    titulo.textContent = perfilActual === null ? "Crea tu perfil" : "Editar perfil";
    const subtitulo = document.createElement("p");
    subtitulo.className = "subtitulo";
    subtitulo.textContent = "Tu nickname y avatar te acompañan en cada partida";
    tarjeta.append(titulo, subtitulo);

    const nickname = document.createElement("input");
    nickname.placeholder = "Tu nickname";
    nickname.maxLength = MAX_NICKNAME;
    nickname.value = perfilActual?.nickname ?? "";
    tarjeta.appendChild(campo("Nickname", nickname));

    const etiquetaAvatar = document.createElement("span");
    etiquetaAvatar.className = "campo-etiqueta";
    etiquetaAvatar.textContent = "Avatar";
    tarjeta.appendChild(etiquetaAvatar);

    const grid = document.createElement("div");
    grid.className = "perfil-grid";
    const botones = new Map<string, HTMLButtonElement>();
    for (const id of POOL_AVATARES) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "perfil-avatar";
      boton.title = id;
      boton.appendChild(crearAvatar(id, TAM_AVATAR));
      boton.addEventListener("click", () => {
        this.avatarElegido = id;
        for (const [otroId, otroBoton] of botones) {
          otroBoton.classList.toggle("seleccionado", otroId === id);
        }
      });
      botones.set(id, boton);
      grid.appendChild(boton);
    }
    botones.get(this.avatarElegido)?.classList.add("seleccionado");
    tarjeta.appendChild(grid);

    const guardar = document.createElement("button");
    guardar.className = "principal";
    guardar.textContent = "Guardar";
    guardar.addEventListener("click", () => {
      const valor = nickname.value.trim();
      if (valor.length === 0) {
        this.mostrarError("escribe un nickname primero");
        nickname.focus();
        return;
      }
      this.acciones.alGuardar({ nickname: valor, avatarId: this.avatarElegido });
    });
    tarjeta.appendChild(guardar);

    if (permitirCancelar && this.acciones.alCancelar !== undefined) {
      const cancelar = document.createElement("button");
      cancelar.className = "secundario";
      cancelar.textContent = "Cancelar";
      cancelar.addEventListener("click", () => this.acciones.alCancelar?.());
      tarjeta.appendChild(cancelar);
    }

    this.velo.appendChild(tarjeta);
  }

  private mostrarError(mensaje: string): void {
    this.velo.querySelector(".error")?.remove();
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = mensaje;
    this.velo.querySelector(".tarjeta")?.appendChild(error);
  }

  ocultar(): void {
    this.velo.classList.add("oculto");
  }

  get visible(): boolean {
    return !this.velo.classList.contains("oculto");
  }
}

function campo(etiqueta: string, control: HTMLElement): HTMLElement {
  const envoltura = document.createElement("label");
  envoltura.className = "campo";
  const texto = document.createElement("span");
  texto.className = "campo-etiqueta";
  texto.textContent = etiqueta;
  envoltura.append(texto, control);
  return envoltura;
}
