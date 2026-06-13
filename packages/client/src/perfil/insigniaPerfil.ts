// Insignia de perfil reutilizable (avatar + nickname + acción opcional).
// La usan la cabecera del hub y la pantalla de conexión para mostrar el perfil
// activo de forma consistente.

import { crearAvatar } from "./avatares.js";
import type { Perfil } from "./perfil.js";

const TAM_AVATAR = 40;

/**
 * Crea un bloque con el avatar y nickname del perfil, y un botón de acción
 * opcional (p. ej. "Editar perfil").
 */
export function crearInsigniaPerfil(
  perfil: Perfil,
  etiquetaAccion?: string,
  alAccion?: () => void,
): HTMLElement {
  const insignia = document.createElement("div");
  insignia.className = "insignia-perfil";

  const avatar = crearAvatar(perfil.avatarId, TAM_AVATAR);
  avatar.className = "insignia-avatar";

  const nombre = document.createElement("span");
  nombre.className = "insignia-nombre";
  nombre.textContent = perfil.nickname;

  insignia.append(avatar, nombre);

  if (etiquetaAccion !== undefined && alAccion !== undefined) {
    const accion = document.createElement("button");
    accion.type = "button";
    accion.className = "insignia-accion";
    accion.textContent = etiquetaAccion;
    accion.addEventListener("click", alAccion);
    insignia.appendChild(accion);
  }

  return insignia;
}
