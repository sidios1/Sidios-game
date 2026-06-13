// Máquina de estados de la interacción del usuario. PURA: (estado, evento) →
// {estado, comandos, aviso}. No envía nada ni toca DOM/Three: la aplicación
// despacha los comandos por la conexión y refleja el estado en HUD y escena.
// Las validaciones locales son cortesía de UI; el servidor revalida todo.

import type { ExtremoEscala, TipoCombinacion } from "@juegos/carioca-core";
import { extenderEscala } from "@juegos/carioca-core";
import type { MensajeCliente } from "@juegos/server/protocolo";
import type { VistaPartida } from "@juegos/server/vista";
import type { EstadoPropuesta } from "./propuesta.js";
import {
  agregarGrupo,
  aPropuestaProtocolo,
  cartasComprometidas,
  evaluarPropuesta,
  podarPropuesta,
  PROPUESTA_VACIA,
  quitarGrupo,
  validarGrupo,
} from "./propuesta.js";

export type ModoInteraccion =
  | "sinPartida"
  | "esperandoTurno"
  | "robar"
  | "descartar"
  | "construyendoBajada"
  | "eligiendoExtremo"
  | "manoTerminada"
  | "partidaTerminada";

export interface PegadaPendiente {
  readonly cartaId: string;
  readonly mesaIdx: number;
}

export interface EstadoInteraccion {
  readonly modo: ModoInteraccion;
  readonly vista: VistaPartida | null;
  /** Ids de cartas propias seleccionadas, en orden de selección. */
  readonly seleccion: readonly string[];
  readonly propuesta: EstadoPropuesta;
  readonly pegadaPendiente: PegadaPendiente | null;
  readonly votoEmitido: boolean;
}

export const ESTADO_INICIAL: EstadoInteraccion = {
  modo: "sinPartida",
  vista: null,
  seleccion: [],
  propuesta: PROPUESTA_VACIA,
  pegadaPendiente: null,
  votoEmitido: false,
};

export type EventoInteraccion =
  | { readonly tipo: "vista"; readonly vista: VistaPartida }
  | { readonly tipo: "clickCarta"; readonly cartaId: string }
  | { readonly tipo: "clickMazo" }
  | { readonly tipo: "clickPozo" }
  | { readonly tipo: "clickCombinacion"; readonly mesaIdx: number }
  | { readonly tipo: "abrirBajada" }
  | { readonly tipo: "cerrarBajada" }
  | { readonly tipo: "agregarGrupo"; readonly tipoCombinacion: TipoCombinacion }
  | { readonly tipo: "quitarGrupo"; readonly indice: number }
  | { readonly tipo: "confirmarBajada" }
  | { readonly tipo: "botonDescartar" }
  | { readonly tipo: "elegirExtremo"; readonly extremo: ExtremoEscala }
  | { readonly tipo: "cancelarExtremo" }
  | { readonly tipo: "votarListo" };

export interface ResultadoInteraccion {
  readonly estado: EstadoInteraccion;
  readonly comandos: readonly MensajeCliente[];
  readonly aviso: string | null;
}

function sinCambios(estado: EstadoInteraccion): ResultadoInteraccion {
  return { estado, comandos: [], aviso: null };
}

function conAviso(estado: EstadoInteraccion, aviso: string): ResultadoInteraccion {
  return { estado, comandos: [], aviso };
}

function meBaje(vista: VistaPartida): boolean {
  return (
    vista.jugadores.find((j) => j.id === vista.tuJugadorId)?.seBajo ?? false
  );
}

export function transicion(
  estado: EstadoInteraccion,
  evento: EventoInteraccion,
): ResultadoInteraccion {
  switch (evento.tipo) {
    case "vista":
      return alLlegarVista(estado, evento.vista);
    case "clickCarta":
      return alClickCarta(estado, evento.cartaId);
    case "clickMazo":
      if (estado.modo !== "robar") return sinCambios(estado);
      return {
        estado,
        comandos: [{ tipo: "robarDelMazo" }],
        aviso: null,
      };
    case "clickPozo":
      return alClickPozo(estado);
    case "clickCombinacion":
      return alClickCombinacion(estado, evento.mesaIdx);
    case "abrirBajada":
      return alAbrirBajada(estado);
    case "cerrarBajada":
      if (estado.modo !== "construyendoBajada") return sinCambios(estado);
      return sinCambios({ ...estado, modo: "descartar", seleccion: [] });
    case "agregarGrupo":
      return alAgregarGrupo(estado, evento.tipoCombinacion);
    case "quitarGrupo":
      if (estado.modo !== "construyendoBajada") return sinCambios(estado);
      return sinCambios({
        ...estado,
        propuesta: quitarGrupo(estado.propuesta, evento.indice),
      });
    case "confirmarBajada":
      return alConfirmarBajada(estado);
    case "botonDescartar":
      return alDescartar(estado);
    case "elegirExtremo":
      return alElegirExtremo(estado, evento.extremo);
    case "cancelarExtremo":
      if (estado.modo !== "eligiendoExtremo") return sinCambios(estado);
      return sinCambios({ ...estado, modo: "descartar", pegadaPendiente: null });
    case "votarListo":
      return alVotarListo(estado);
  }
}

// ── La vista nueva manda: recalcula el modo y poda lo que ya no aplica ──────

function alLlegarVista(
  estado: EstadoInteraccion,
  vista: VistaPartida,
): ResultadoInteraccion {
  const enMano = new Set(vista.tuMano.map((c) => c.id));
  const seleccion = estado.seleccion.filter((id) => enMano.has(id));
  const propuesta = meBaje(vista)
    ? PROPUESTA_VACIA
    : podarPropuesta(estado.propuesta, vista.tuMano);
  const pegadaPendiente =
    estado.pegadaPendiente !== null && enMano.has(estado.pegadaPendiente.cartaId)
      ? estado.pegadaPendiente
      : null;
  return sinCambios({
    modo: modoSegunVista(estado, vista, pegadaPendiente),
    vista,
    seleccion,
    propuesta,
    pegadaPendiente,
    votoEmitido: vista.fase === "manoTerminada" ? estado.votoEmitido : false,
  });
}

function modoSegunVista(
  estado: EstadoInteraccion,
  vista: VistaPartida,
  pegadaPendiente: PegadaPendiente | null,
): ModoInteraccion {
  if (vista.fase === "partidaTerminada") return "partidaTerminada";
  if (vista.fase === "manoTerminada") return "manoTerminada";
  if (vista.turno.jugadorId !== vista.tuJugadorId) return "esperandoTurno";
  if (vista.turno.fase === "robar") return "robar";
  // Mi turno de descartar: conserva los sub-modos abiertos si siguen teniendo
  // sentido (p. ej. el servidor rechazó la bajada y el panel sigue abierto).
  if (estado.modo === "construyendoBajada" && !meBaje(vista)) {
    return "construyendoBajada";
  }
  if (estado.modo === "eligiendoExtremo" && pegadaPendiente !== null) {
    return "eligiendoExtremo";
  }
  return "descartar";
}

// ── Selección de cartas propias ──────────────────────────────────────────────

function alClickCarta(
  estado: EstadoInteraccion,
  cartaId: string,
): ResultadoInteraccion {
  if (estado.modo !== "descartar" && estado.modo !== "construyendoBajada") {
    return sinCambios(estado);
  }
  const vista = estado.vista;
  if (vista === null || !vista.tuMano.some((c) => c.id === cartaId)) {
    return sinCambios(estado);
  }
  if (cartasComprometidas(estado.propuesta).has(cartaId)) {
    return conAviso(estado, "esa carta ya está en un grupo de tu bajada");
  }
  const seleccion = estado.seleccion.includes(cartaId)
    ? estado.seleccion.filter((id) => id !== cartaId)
    : [...estado.seleccion, cartaId];
  return sinCambios({ ...estado, seleccion });
}

// ── Robar / descartar ────────────────────────────────────────────────────────

function alClickPozo(estado: EstadoInteraccion): ResultadoInteraccion {
  if (estado.modo === "robar") {
    return { estado, comandos: [{ tipo: "robarDelPozo" }], aviso: null };
  }
  // Atajo: en fase de descartar, click al pozo con una carta elegida descarta.
  if (estado.modo === "descartar" && estado.seleccion.length === 1) {
    return alDescartar(estado);
  }
  return sinCambios(estado);
}

function alDescartar(estado: EstadoInteraccion): ResultadoInteraccion {
  if (estado.modo !== "descartar") return sinCambios(estado);
  const cartaId = estado.seleccion[0];
  if (estado.seleccion.length !== 1 || cartaId === undefined) {
    return conAviso(estado, "selecciona exactamente una carta para descartar");
  }
  return {
    estado: { ...estado, seleccion: [] },
    comandos: [{ tipo: "descartar", cartaId }],
    aviso: null,
  };
}

// ── Bajarse ──────────────────────────────────────────────────────────────────

function alAbrirBajada(estado: EstadoInteraccion): ResultadoInteraccion {
  if (estado.modo !== "descartar" || estado.vista === null) {
    return sinCambios(estado);
  }
  if (meBaje(estado.vista)) {
    return conAviso(estado, "ya te bajaste en esta mano");
  }
  return sinCambios({ ...estado, modo: "construyendoBajada" });
}

function alAgregarGrupo(
  estado: EstadoInteraccion,
  tipo: TipoCombinacion,
): ResultadoInteraccion {
  if (estado.modo !== "construyendoBajada" || estado.vista === null) {
    return sinCambios(estado);
  }
  if (estado.seleccion.length === 0) {
    return conAviso(estado, "selecciona las cartas del grupo primero");
  }
  const validacion = validarGrupo(
    tipo,
    estado.seleccion,
    estado.vista.tuMano,
    estado.vista.contrato,
  );
  if (!validacion.valida) {
    return conAviso(estado, validacion.motivo);
  }
  return sinCambios({
    ...estado,
    propuesta: agregarGrupo(estado.propuesta, tipo, estado.seleccion),
    seleccion: [],
  });
}

function alConfirmarBajada(estado: EstadoInteraccion): ResultadoInteraccion {
  if (estado.modo !== "construyendoBajada" || estado.vista === null) {
    return sinCambios(estado);
  }
  const evaluacion = evaluarPropuesta(
    estado.propuesta,
    estado.vista.tuMano,
    estado.vista.contrato,
  );
  if (!evaluacion.completa) {
    return conAviso(estado, evaluacion.motivos.join("; "));
  }
  // La propuesta se conserva: si el servidor la rechaza, el panel sigue ahí;
  // si la acepta, la vista nueva (seBajo) la limpia en alLlegarVista.
  return {
    estado,
    comandos: [{ tipo: "bajarse", propuesta: aPropuestaProtocolo(estado.propuesta) }],
    aviso: null,
  };
}

// ── Pegar ────────────────────────────────────────────────────────────────────

function alClickCombinacion(
  estado: EstadoInteraccion,
  mesaIdx: number,
): ResultadoInteraccion {
  if (estado.modo !== "descartar" || estado.vista === null) {
    return sinCambios(estado);
  }
  const vista = estado.vista;
  if (!meBaje(vista)) {
    return conAviso(estado, "debes bajarte antes de pegar cartas");
  }
  const cartaId = estado.seleccion[0];
  if (estado.seleccion.length !== 1 || cartaId === undefined) {
    return conAviso(estado, "selecciona la carta que quieres pegar");
  }
  const carta = vista.tuMano.find((c) => c.id === cartaId);
  const enMesa = vista.mesa[mesaIdx];
  if (carta === undefined || enMesa === undefined) return sinCambios(estado);

  if (enMesa.combinacion.tipo === "trio") {
    return {
      estado: { ...estado, seleccion: [] },
      comandos: [{ tipo: "pegar", cartaId, mesaIdx }],
      aviso: null,
    };
  }
  // Escalas: si la carta calza por un solo extremo se envía directo; si calza
  // por ambos, el jugador elige (cortesía de UI con el validador del core).
  const porFin = extenderEscala(enMesa.combinacion.cartas, carta, "fin");
  const porInicio = extenderEscala(enMesa.combinacion.cartas, carta, "inicio");
  if (porFin === null && porInicio === null) {
    return conAviso(estado, "esa carta no extiende esta escala");
  }
  if (porFin !== null && porInicio !== null) {
    return sinCambios({
      ...estado,
      modo: "eligiendoExtremo",
      pegadaPendiente: { cartaId, mesaIdx },
    });
  }
  const extremo: ExtremoEscala = porFin !== null ? "fin" : "inicio";
  return {
    estado: { ...estado, seleccion: [] },
    comandos: [{ tipo: "pegar", cartaId, mesaIdx, extremo }],
    aviso: null,
  };
}

function alElegirExtremo(
  estado: EstadoInteraccion,
  extremo: ExtremoEscala,
): ResultadoInteraccion {
  if (estado.modo !== "eligiendoExtremo" || estado.pegadaPendiente === null) {
    return sinCambios(estado);
  }
  const { cartaId, mesaIdx } = estado.pegadaPendiente;
  return {
    estado: { ...estado, modo: "descartar", pegadaPendiente: null, seleccion: [] },
    comandos: [{ tipo: "pegar", cartaId, mesaIdx, extremo }],
    aviso: null,
  };
}

// ── Fin de mano ──────────────────────────────────────────────────────────────

function alVotarListo(estado: EstadoInteraccion): ResultadoInteraccion {
  if (estado.modo !== "manoTerminada" || estado.votoEmitido) {
    return sinCambios(estado);
  }
  return {
    estado: { ...estado, votoEmitido: true },
    comandos: [{ tipo: "listoSiguienteMano" }],
    aviso: null,
  };
}
