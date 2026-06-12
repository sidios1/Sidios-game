// Protocolo de mensajes entre cliente y orquestador, en JSON.
// Las intenciones NO llevan jugadorId: el orquestador lo deriva de la
// conexión, así un cliente no puede actuar en nombre de otro.

import type {
  CodigoError,
  ExtremoEscala,
  PropuestaCombinacion,
  TipoCombinacion,
} from "@juegos/carioca-core";
import type { VistaPartida } from "./vista.js";

export type MensajeCliente =
  | { readonly tipo: "unirse"; readonly nombre: string; readonly token?: string }
  | { readonly tipo: "iniciarPartida" }
  | { readonly tipo: "robarDelMazo" }
  | { readonly tipo: "robarDelPozo" }
  | { readonly tipo: "bajarse"; readonly propuesta: readonly PropuestaCombinacion[] }
  | {
      readonly tipo: "pegar";
      readonly cartaId: string;
      readonly mesaIdx: number;
      readonly extremo?: ExtremoEscala;
    }
  | { readonly tipo: "descartar"; readonly cartaId: string }
  | { readonly tipo: "listoSiguienteMano" };

export interface JugadorEnSala {
  readonly jugadorId: string;
  readonly nombre: string;
  readonly esAnfitrion: boolean;
}

/** Errores propios de la sala; los de reglas (CodigoError) vienen del core. */
export type CodigoErrorSala =
  | "mensajeInvalido"
  | "salaLlena"
  | "partidaYaIniciada"
  | "tokenInvalido"
  | "noEresAnfitrion"
  | "debesUnirtePrimero"
  | "accionInvalida";

export type CodigoErrorServidor = CodigoErrorSala | CodigoError;

export type MensajeServidor =
  | { readonly tipo: "bienvenida"; readonly jugadorId: string; readonly token: string }
  | { readonly tipo: "estadoSala"; readonly jugadores: readonly JugadorEnSala[] }
  | { readonly tipo: "vista"; readonly vista: VistaPartida }
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

function esTipoCombinacion(valor: unknown): valor is TipoCombinacion {
  return (
    valor === "trio" ||
    valor === "escala" ||
    valor === "escalaSucia" ||
    valor === "escalaReal"
  );
}

function esExtremoEscala(valor: unknown): valor is ExtremoEscala {
  return valor === "inicio" || valor === "fin";
}

function esListaDeStrings(valor: unknown): valor is readonly string[] {
  return Array.isArray(valor) && valor.every((item) => typeof item === "string");
}

function analizarPropuesta(valor: unknown): readonly PropuestaCombinacion[] | null {
  if (!Array.isArray(valor)) return null;
  const propuesta: PropuestaCombinacion[] = [];
  for (const parte of valor) {
    if (!esObjeto(parte)) return null;
    const { tipo, cartaIds } = parte;
    if (!esTipoCombinacion(tipo) || !esListaDeStrings(cartaIds)) return null;
    propuesta.push({ tipo, cartaIds });
  }
  return propuesta;
}

/**
 * Valida solo la FORMA del mensaje (las reglas las revalida el core).
 * Devuelve null ante JSON inválido, tipo desconocido o campos incorrectos.
 */
export function analizarMensajeCliente(datos: string): MensajeCliente | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(datos);
  } catch {
    return null;
  }
  if (!esObjeto(crudo)) return null;
  switch (crudo["tipo"]) {
    case "unirse": {
      const nombre = crudo["nombre"];
      const token = crudo["token"];
      if (typeof nombre !== "string" || nombre.length === 0) return null;
      if (token === undefined) return { tipo: "unirse", nombre };
      if (typeof token !== "string") return null;
      return { tipo: "unirse", nombre, token };
    }
    case "iniciarPartida":
      return { tipo: "iniciarPartida" };
    case "robarDelMazo":
      return { tipo: "robarDelMazo" };
    case "robarDelPozo":
      return { tipo: "robarDelPozo" };
    case "bajarse": {
      const propuesta = analizarPropuesta(crudo["propuesta"]);
      if (propuesta === null) return null;
      return { tipo: "bajarse", propuesta };
    }
    case "pegar": {
      const cartaId = crudo["cartaId"];
      const mesaIdx = crudo["mesaIdx"];
      const extremo = crudo["extremo"];
      if (typeof cartaId !== "string") return null;
      if (typeof mesaIdx !== "number" || !Number.isInteger(mesaIdx) || mesaIdx < 0) {
        return null;
      }
      if (extremo === undefined) return { tipo: "pegar", cartaId, mesaIdx };
      if (!esExtremoEscala(extremo)) return null;
      return { tipo: "pegar", cartaId, mesaIdx, extremo };
    }
    case "descartar": {
      const cartaId = crudo["cartaId"];
      if (typeof cartaId !== "string") return null;
      return { tipo: "descartar", cartaId };
    }
    case "listoSiguienteMano":
      return { tipo: "listoSiguienteMano" };
    default:
      return null;
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
