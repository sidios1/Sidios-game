// Textos de presentación de las 18 habilidades (§3 de REGLAS_RUMBLE.md). `IHabilidad`
// no lleva descripción: el catálogo de rumble-core es el MODELO (tier, cargas, ventana),
// y la prosa es cosa del cliente — mismo criterio que los mapas de símbolos de
// hud/formatoCarta.ts, que no exporta internals del core.
//
// `accion` es la etiqueta del botón. `null` = la habilidad NO tiene botón porque es
// PASIVA: el motor la dispara solo (TOCO sustituye el contrato de la ronda, EXODIA
// cierra la mano si te bajas en la ventana, OJO intercepta un cierre ajeno…). Sin
// botón inerte: si no hay acción que el jugador emita, no se pinta botón.

import type { HabilidadId } from "@juegos/server/vistaJuego";

export interface TextoHabilidad {
  readonly descripcion: string;
  readonly accion: string | null;
  /** Nota visible cuando la habilidad no es accionable (pasiva o sin cablear). */
  readonly nota?: string;
}

export const TEXTOS: Readonly<Record<HabilidadId, TextoHabilidad>> = {
  DECRETALO: {
    descripcion:
      "Elige una carta: +25% de probabilidad en tus próximos 3 robos del mazo.",
    accion: "Decretar carta",
  },
  MISH: {
    descripcion:
      "Descubre si una carta está en el mazo, en el pozo o en la mano de alguien (no dónde exactamente).",
    accion: "Buscar carta",
  },
  RADAR: {
    descripcion: "Foto fija de la pinta mayoritaria de cada jugador al inicio de la ronda.",
    accion: null,
    nota: "Pasiva: mira el panel de RADAR.",
  },
  AUGURIO: {
    descripcion: "Mira la carta de arriba del mazo. 3 consultas por ronda.",
    accion: "Ver la cima",
  },
  SAPO: {
    descripcion: "Mira 4 cartas al azar de la mano de un jugador.",
    accion: "Espiar a alguien",
  },
  JUDIO: {
    descripcion:
      "Saca del pozo cualquier carta que se haya tirado, no solo la última. El resto ve cuál tomaste.",
    accion: "Sacar del pozo",
  },
  PESAO: {
    descripcion: "Solo tú ves el pozo durante esta ronda.",
    accion: null,
    nota: "Pasiva: el resto no ve el pozo.",
  },
  OJO: {
    descripcion:
      "Cuando alguien vaya a cerrar, le saltas el turno una vez. Recibe 1 carta de compensación.",
    accion: null,
    nota: "Se dispara sola al intentar cerrar alguien.",
  },
  GINYU: {
    descripcion:
      "Intercambia tu mano con la de otro jugador. El objetivo es aleatorio, no lo eliges.",
    accion: "Intercambiar manos",
  },
  CHATO: {
    descripcion: "Resetea la mano de un jugador. El afectado se entera.",
    accion: "Resetear una mano",
  },
  MATO: {
    descripcion: "Resetea tu propia mano o tu propia habilidad. Vale toda la ronda.",
    accion: "Resetear lo mío",
  },
  TROLL: {
    descripcion:
      "Si alguien tiene un trío o una escala armada, esas cartas se le resetean. El afectado se entera.",
    accion: "Trolear a alguien",
  },
  EXODIA: {
    descripcion: "Si te bajas dentro de los primeros 3 turnos, ganas la ronda entera.",
    accion: null,
    nota: "Se dispara sola al bajarte dentro de la ventana.",
  },
  GUASON: {
    descripcion:
      "Cambia una carta tuya por un comodín-de-pinta acuñado: vale por cualquier carta de esa pinta.",
    accion: "Acuñar comodín",
  },
  DOBLE: {
    descripcion:
      "Si ganas, los demás suman el doble. Si pierdes, sumas 50% más. Se anuncia a todos.",
    accion: null,
    nota: "Pasiva y pública: todos saben que la tienes.",
  },
  PILLO: {
    descripcion:
      "Adivina una carta de alguien y la cambias por la que quieras. Si fallas, él elige qué robarte.",
    accion: "Adivinar carta",
  },
  TOCO: {
    descripcion: "Tu misión cambia: necesitas una combinación distinta para ganar la ronda.",
    accion: null,
    nota: "Pasiva: tu misión reemplaza el contrato de la ronda.",
  },
  EXTRA: {
    descripcion: "Roba 2 cartas este turno. A cambio, descartas 2 o pierdes tu próximo turno.",
    accion: "Robar doble",
  },
};
