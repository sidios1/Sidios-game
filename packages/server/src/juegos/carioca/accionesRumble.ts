// Parseo de FORMA estricto de las acciones de habilidad de Rumble. Viajan por el
// sobre opaco AccionJuego (protocolo.ts no las conoce): cualquier campo mal tipado
// → null, que el motor traduce a "mensajeInvalido". La AUTORIDAD (tener la
// habilidad, carga, ventana) la valida `aplicarAccion`, no este parseo.

import type { Pinta, ValorCarta } from "@juegos/carioca-core";
import { PINTAS, VALORES } from "@juegos/carioca-core";
import type { AccionJuego } from "../../protocolo.js";
import type { AccionHabilidad } from "./estadoRumble.js";

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function esPinta(v: unknown): v is Pinta {
  return typeof v === "string" && (PINTAS as readonly string[]).includes(v);
}

function esValor(v: unknown): v is ValorCarta {
  return typeof v === "number" && (VALORES as readonly number[]).includes(v);
}

function parsearCartaEspec(v: unknown): { pinta: Pinta; valor: ValorCarta } | null {
  if (!esObjeto(v)) return null;
  const { pinta, valor } = v;
  if (!esPinta(pinta) || !esValor(valor)) return null;
  return { pinta, valor };
}

/** ¿El tipo pertenece a una acción de habilidad de Rumble? */
export function esTipoRumble(tipo: string): boolean {
  return tipo.startsWith("rumble/");
}

/**
 * Parsea una acción de habilidad cruda a su forma tipada, o null si el tipo no es
 * de Rumble o los campos no calzan. Estricto: no acepta campos faltantes ni tipos
 * incorrectos (no confiar en el cliente).
 */
export function parsearAccionHabilidad(crudo: AccionJuego): AccionHabilidad | null {
  switch (crudo.tipo) {
    case "rumble/decretalo": {
      const objetivo = parsearCartaEspec(crudo["objetivo"]);
      return objetivo === null ? null : { tipo: "rumble/decretalo", objetivo };
    }
    case "rumble/mish": {
      const carta = parsearCartaEspec(crudo["carta"]);
      return carta === null ? null : { tipo: "rumble/mish", carta };
    }
    case "rumble/augurio":
      return { tipo: "rumble/augurio" };
    case "rumble/sapo": {
      const objetivoId = crudo["objetivoId"];
      if (typeof objetivoId !== "string" || objetivoId.length === 0) return null;
      return { tipo: "rumble/sapo", objetivoId };
    }
    case "rumble/judio": {
      const cartaId = crudo["cartaId"];
      if (typeof cartaId !== "string" || cartaId.length === 0) return null;
      return { tipo: "rumble/judio", cartaId };
    }
    case "rumble/guason": {
      const pinta = crudo["pinta"];
      const cartaSalienteId = crudo["cartaSalienteId"];
      if (!esPinta(pinta)) return null;
      if (cartaSalienteId !== undefined && typeof cartaSalienteId !== "string") return null;
      return cartaSalienteId === undefined
        ? { tipo: "rumble/guason", pinta }
        : { tipo: "rumble/guason", pinta, cartaSalienteId };
    }
    case "rumble/ginyu":
      return { tipo: "rumble/ginyu" };
    case "rumble/chato": {
      const objetivoId = crudo["objetivoId"];
      if (typeof objetivoId !== "string" || objetivoId.length === 0) return null;
      return { tipo: "rumble/chato", objetivoId };
    }
    case "rumble/mato": {
      const que = crudo["que"];
      if (que !== "mano" && que !== "habilidad") return null;
      return { tipo: "rumble/mato", que };
    }
    case "rumble/troll": {
      const objetivoId = crudo["objetivoId"];
      if (typeof objetivoId !== "string" || objetivoId.length === 0) return null;
      return { tipo: "rumble/troll", objetivoId };
    }
    case "rumble/pillo": {
      const objetivoId = crudo["objetivoId"];
      const carta = parsearCartaEspec(crudo["carta"]);
      const cartaEntregadaId = crudo["cartaEntregadaId"];
      if (typeof objetivoId !== "string" || objetivoId.length === 0) return null;
      if (carta === null) return null;
      if (typeof cartaEntregadaId !== "string" || cartaEntregadaId.length === 0) return null;
      return { tipo: "rumble/pillo", objetivoId, carta, cartaEntregadaId };
    }
    case "rumble/pilloRobo": {
      // Índice posicional en la mano de la víctima. Aquí solo se valida la FORMA
      // (entero no negativo); el rango real lo valida el motor contra esa mano.
      const indice = crudo["indice"];
      if (typeof indice !== "number" || !Number.isInteger(indice) || indice < 0) {
        return null;
      }
      return { tipo: "rumble/pilloRobo", indice };
    }
    case "rumble/extra":
      return { tipo: "rumble/extra" };
    default:
      return null;
  }
}
