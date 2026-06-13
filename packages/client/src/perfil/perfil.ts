// Perfil del jugador: nickname + avatar elegido del pool. Se persiste con el
// mismo patrón que sesion.ts (un Storage inyectable), pero el default es
// localStorage —no sessionStorage— para que sobreviva al reabrir la app.
//
// El perfil es la ÚNICA fuente del nickname y el avatar que viajan a la partida.

import { avatarPorDefecto, esAvatarValido } from "./avatares.js";

export interface Perfil {
  readonly nickname: string;
  readonly avatarId: string;
}

const CLAVE = "juegos-perfil";
export const MAX_NICKNAME = 20;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Storage por defecto: localStorage si existe (navegador/Tauri), o null. */
export function almacenPerfilPorDefecto(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Algunos entornos lanzan al tocar localStorage (políticas de privacidad).
    return null;
  }
}

export function leerPerfil(almacen: Storage): Perfil | null {
  const crudo = almacen.getItem(CLAVE);
  if (crudo === null) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!esObjeto(datos)) return null;
  const nickname = datos["nickname"];
  const avatarId = datos["avatarId"];
  if (typeof nickname !== "string" || nickname.trim().length === 0) return null;
  // Si el avatar guardado ya no existe en el pool, caemos a uno determinista.
  const avatar =
    typeof avatarId === "string" && esAvatarValido(avatarId)
      ? avatarId
      : avatarPorDefecto(nickname);
  return { nickname: nickname.trim(), avatarId: avatar };
}

export function guardarPerfil(almacen: Storage, perfil: Perfil): void {
  const nickname = perfil.nickname.trim().slice(0, MAX_NICKNAME);
  const avatarId = esAvatarValido(perfil.avatarId)
    ? perfil.avatarId
    : avatarPorDefecto(nickname);
  almacen.setItem(CLAVE, JSON.stringify({ nickname, avatarId }));
}

export function borrarPerfil(almacen: Storage): void {
  almacen.removeItem(CLAVE);
}
