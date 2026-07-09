// Protocolo de mensajes entre cliente y orquestador, en JSON.
// Las intenciones NO llevan jugadorId: el orquestador lo deriva de la
// conexión, así un cliente no puede actuar en nombre de otro.
//
// Las acciones de JUEGO viajan en un sobre genérico (AccionJuego): el protocolo
// solo garantiza `tipo: string`; la FORMA concreta de cada acción la valida el
// MOTOR del juego (packages/server/src/juegos/<juego>/), no este archivo. Así el
// protocolo no conoce las reglas de ningún juego.

import type { VistaJuego } from "./vistaJuego.js";

/**
 * Sobre genérico de una acción de juego. El protocolo no sabe qué acciones
 * existen: solo exige un `tipo` string; el motor del juego valida el resto.
 */
export interface AccionJuego {
  readonly tipo: string;
  readonly [campo: string]: unknown;
}

/** Mensajes de sala (no específicos de ningún juego). */
export type MensajeLobby =
  | {
      readonly tipo: "unirse";
      readonly nombre: string;
      /** Id del avatar del pool por defecto; presentación, viaja con el jugador. */
      readonly avatar?: string;
      readonly token?: string;
      /** Juego que el cliente espera jugar en la sala (enganche del registro). */
      readonly juego?: string;
    }
  /** `turbo` activa el modo +Turbo (reloj por turno); lo decide el anfitrión. */
  | { readonly tipo: "iniciarPartida"; readonly turbo?: boolean }
  | { readonly tipo: "listoSiguienteMano" }
  /** Aviso de que el jugador abrió el modal de bajarse: en +Turbo suma segundos
   *  a su turno (una sola vez por turno; el orquestador lo decide). */
  | { readonly tipo: "extenderTurboBajada" }
  /** Solo el anfitrión: reabre el canal de un jugador para que pueda reentrar
   *  (conserva su asiento, mano y estado; NO es una expulsión). */
  | { readonly tipo: "reabrirConexion"; readonly jugadorId: string };

/**
 * Lo que el cliente ENVÍA (y `serializarCliente` serializa): mensajes de lobby
 * o cualquier acción de juego plana. Las acciones concretas de cada juego son
 * asignables a `AccionJuego`, así el cliente las manda sin envoltorio.
 */
export type MensajeCliente = MensajeLobby | AccionJuego;

/**
 * Lo que `analizarMensajeCliente` DEVUELVE y el orquestador consume: unión
 * discriminada limpia, con las acciones de juego ya envueltas en "accionJuego".
 */
export type MensajeClienteParseado =
  | MensajeLobby
  | { readonly tipo: "accionJuego"; readonly accion: AccionJuego };

export interface JugadorEnSala {
  readonly jugadorId: string;
  readonly nombre: string;
  /** Id del avatar elegido en el perfil; ausente en clientes antiguos. */
  readonly avatar?: string;
  readonly esAnfitrion: boolean;
}

/** Errores propios de la sala; los de regla (string) los produce el motor. */
export type CodigoErrorSala =
  | "mensajeInvalido"
  | "salaLlena"
  | "partidaYaIniciada"
  | "tokenInvalido"
  | "noEresAnfitrion"
  | "debesUnirtePrimero"
  | "accionInvalida";

/** Códigos de la sala más los de regla del juego (que viajan como string). */
export type CodigoErrorServidor = CodigoErrorSala | (string & {});

export type MensajeServidor =
  | { readonly tipo: "bienvenida"; readonly jugadorId: string; readonly token: string }
  | { readonly tipo: "estadoSala"; readonly jugadores: readonly JugadorEnSala[] }
  | { readonly tipo: "vista"; readonly vista: VistaJuego }
  | {
      readonly tipo: "error";
      readonly codigo: CodigoErrorServidor;
      readonly mensaje: string;
    }
  | { readonly tipo: "salaCerrada"; readonly motivo: string };

export function serializarServidor(mensaje: MensajeServidor): string {
  return JSON.stringify(mensaje);
}

export function serializarCliente(mensaje: MensajeCliente): string {
  return JSON.stringify(mensaje);
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Construye el sobre de acción a partir del objeto crudo (tipo ya validado). */
function aAccionJuego(crudo: Record<string, unknown>, tipo: string): AccionJuego {
  return { ...crudo, tipo };
}

/**
 * Valida solo la FORMA de un mensaje de lobby (las acciones de juego las valida
 * el motor). Devuelve null ante JSON inválido, no-objeto o `tipo` no string;
 * cualquier otro `tipo` se envuelve como acción de juego opaca.
 */
export function analizarMensajeCliente(datos: string): MensajeClienteParseado | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(datos);
  } catch {
    return null;
  }
  if (!esObjeto(crudo)) return null;
  const tipo = crudo["tipo"];
  if (typeof tipo !== "string") return null;
  switch (tipo) {
    case "unirse": {
      const nombre = crudo["nombre"];
      const avatar = crudo["avatar"];
      const token = crudo["token"];
      const juego = crudo["juego"];
      if (typeof nombre !== "string" || nombre.length === 0) return null;
      if (avatar !== undefined && typeof avatar !== "string") return null;
      if (token !== undefined && typeof token !== "string") return null;
      if (juego !== undefined && typeof juego !== "string") return null;
      // exactOptionalPropertyTypes: solo incluimos las claves presentes.
      return {
        tipo: "unirse",
        nombre,
        ...(avatar !== undefined ? { avatar } : {}),
        ...(token !== undefined ? { token } : {}),
        ...(juego !== undefined ? { juego } : {}),
      };
    }
    case "iniciarPartida": {
      const turbo = crudo["turbo"];
      if (turbo !== undefined && typeof turbo !== "boolean") return null;
      // exactOptionalPropertyTypes: solo incluimos turbo si vino presente.
      return { tipo: "iniciarPartida", ...(turbo !== undefined ? { turbo } : {}) };
    }
    case "listoSiguienteMano":
      return { tipo: "listoSiguienteMano" };
    case "extenderTurboBajada":
      return { tipo: "extenderTurboBajada" };
    case "reabrirConexion": {
      const jugadorId = crudo["jugadorId"];
      if (typeof jugadorId !== "string" || jugadorId.length === 0) return null;
      return { tipo: "reabrirConexion", jugadorId };
    }
    default:
      // Cualquier otro `tipo` es una acción de juego: el protocolo solo garantiza
      // `tipo: string`; la forma concreta la valida el motor del juego.
      return { tipo: "accionJuego", accion: aAccionJuego(crudo, tipo) };
  }
}

/**
 * Analiza un mensaje del servidor (lo usan los clientes: tests ahora,
 * la app en la Fase 3). Valida solo el discriminante; la forma interna
 * la garantiza el servidor, que es la autoridad.
 */
export function analizarMensajeServidor(datos: string): MensajeServidor | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(datos);
  } catch {
    return null;
  }
  if (!esMensajeServidor(crudo)) return null;
  return crudo;
}

// El servidor construyó el mensaje con serializarServidor, así que la guarda
// valida el discriminante y los campos de primer nivel; no re-describe toda
// la forma de VistaPartida (el servidor es la autoridad).
function esMensajeServidor(valor: unknown): valor is MensajeServidor {
  if (!esObjeto(valor)) return false;
  switch (valor["tipo"]) {
    case "bienvenida":
      return typeof valor["jugadorId"] === "string" && typeof valor["token"] === "string";
    case "estadoSala":
      return Array.isArray(valor["jugadores"]);
    case "vista":
      return esObjeto(valor["vista"]);
    case "error":
      return typeof valor["codigo"] === "string" && typeof valor["mensaje"] === "string";
    case "salaCerrada":
      return typeof valor["motivo"] === "string";
    default:
      return false;
  }
}
