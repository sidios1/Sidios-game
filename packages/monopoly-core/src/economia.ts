// Compra directa, subasta y renegociación forzada (REGLAS_MONOPOLY_ULTIMATE_TEAM.md
// §3, §3.1, §3.2, §3.3). NO llama a `finalizarSegmentoDeTurno` (eso lo
// centraliza el dispatcher de partida.ts) y no depende de turnos.ts —
// `resolverAterrizaje` en turnos.ts solo deja `decisionPendiente`/
// `subastaEnCurso` seteado; estas funciones lo resuelven.
//
// `elegirPosicionSobre` es el paso final compartido por: compra ganada en
// subasta, compra obligada por falta de pujas, y el 2do sobre de la carta
// #13 (doble fichaje) — unifica los 3 casos bajo el mismo
// `DetalleDecisionPendiente` en vez de que `declinarCompra` cargue una
// `posicion` que no tiene sentido elegir al momento de declinar.
//
// Renegociación (`forzarCompra`): acción LIBRE, no gateada por turno ni por
// `decisionPendiente` — cualquier jugador cuyo token esté sobre la celda con
// ventana abierta puede forzar, en cualquier momento en que el motor esté
// "idle" (sin nada más pendiente; ver partida.ts). El pago va al titular
// despojado (transferencia P2P), NO al Palco del Club — a diferencia de
// impuestos/multas, esto no es un pago "muerto" sin destinatario.

import type { GeneradorAleatorio } from "./aleatorio.js";
import type { JugadorPool, PosicionJugador } from "./fuenteSobres.js";
import { agregarCarta, buscarCarta, quitarCarta, type CartaMiClub } from "./miClub.js";
import {
  elegirJugadorParaSobre,
  elegirTecnicoParaSobre,
  excluirYaSorteados,
  tramosParaLiga,
} from "./muestreo.js";
import { REGLAS_MONOPOLY, type TramosTier } from "./reglas.js";
import { error, ok, type Resultado } from "./resultado.js";
import { celdaEn, esCeldaComprable, type CeldaTablero } from "./tablero.js";
import {
  cobrar,
  conJugador,
  estaTerminada,
  jugadorDe,
  pagarAJugador,
  siguienteIdDeCarta,
  type EstadoMonopoly,
  type OrigenSobrePendiente,
  type SubastaEnCurso,
  type VentanaRenegociacion,
} from "./estado.js";
import type { OrigenCartaJugador } from "./miClub.js";

function abrirVentana(
  estado: EstadoMonopoly,
  celdaIndice: number,
  compradorId: string,
  precio: number,
  cartaId: string,
): EstadoMonopoly {
  const ventana: VentanaRenegociacion = {
    celdaIndice,
    compradorOriginalId: compradorId,
    titularActualId: compradorId,
    cartaId,
    precioActual: precio,
    turnoDeCierre: estado.turnoGlobal + estado.ordenJugadores.length,
  };
  return { ...estado, ventanasAbiertas: { ...estado.ventanasAbiertas, [celdaIndice]: ventana } };
}

// ── Compra directa / declinar ───────────────────────────────────────────────

/** Compra directa (§3): abre sobre + Mi Club + ventana de renegociación. */
export function comprarSobre(
  estado: EstadoMonopoly,
  jugadorId: string,
  rng: GeneradorAleatorio,
  posicion?: PosicionJugador,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const pend = estado.decisionPendiente;
  if (pend === null || pend.detalle.tipo !== "compraODeclina") {
    return error("ACCION_NO_ESPERADA", "no hay una compra pendiente");
  }
  if (pend.jugadorId !== jugadorId) return error("NO_ES_TU_TURNO", "esta decisión no es tuya");

  const celda = celdaEn(pend.detalle.celdaIndice);
  if (!esCeldaComprable(celda)) return error("CELDA_NO_COMPRABLE", "esa celda no se compra");

  const jugador = jugadorDe(estado, jugadorId);
  const mitadPrecio = jugador.proximoSobreMitadPrecio;
  const precio = mitadPrecio ? Math.round(celda.precio / 2) : celda.precio;

  let est = cobrar(estado, jugadorId, precio);
  if (mitadPrecio) est = conJugador(est, jugadorId, { proximoSobreMitadPrecio: false });

  if (celda.tipo === "tecnicos") {
    const tecnico = elegirTecnicoParaSobre(est.pool.tecnicos, rng);
    if (tecnico === undefined) return error("POOL_INVALIDO", "no hay técnicos disponibles");
    const { id, estado: conId } = siguienteIdDeCarta(est);
    const carta: CartaMiClub = { tipo: "tecnico", id, tecnico };
    const j = jugadorDe(conId, jugadorId);
    const conCarta = conJugador(conId, jugadorId, { miClub: agregarCarta(j.miClub, carta) });
    const conVentana = abrirVentana(conCarta, celda.indice, jugadorId, precio, id);
    return ok({ ...conVentana, decisionPendiente: null });
  }

  if (posicion === undefined) return error("POSICION_REQUERIDA", "elige una posición");
  const poolCrudo = celda.tipo === "liga" ? est.pool.porLiga[celda.liga] : est.pool.restoDelMundo;
  const pool = excluirYaSorteados(poolCrudo, est.jugadoresRealesSorteados);
  const tramos: TramosTier =
    celda.tipo === "liga" ? tramosParaLiga(celda.esCeldaMasCara) : REGLAS_MONOPOLY.tiers.restoDelMundo;
  const elegido = elegirJugadorParaSobre(pool, tramos, posicion, rng);
  if (elegido === undefined) return error("POOL_INVALIDO", "no hay jugadores disponibles");

  const origen: OrigenCartaJugador =
    celda.tipo === "liga" ? { clase: "liga", liga: celda.liga } : { clase: "restoDelMundo" };
  const { id, estado: conId } = siguienteIdDeCarta(est);
  const carta: CartaMiClub = { tipo: "jugador", id, origen, jugador: elegido };
  const j = jugadorDe(conId, jugadorId);
  const conCarta = conJugador(conId, jugadorId, { miClub: agregarCarta(j.miClub, carta) });
  const conSorteo = {
    ...conCarta,
    jugadoresRealesSorteados: [...conCarta.jugadoresRealesSorteados, elegido.jugadorId],
  };
  const conVentana = abrirVentana(conSorteo, celda.indice, jugadorId, precio, id);
  return ok({ ...conVentana, decisionPendiente: null });
}

/** Declina la compra directa: abre subasta libre ascendente (§3). */
export function declinarCompra(estado: EstadoMonopoly, jugadorId: string): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const pend = estado.decisionPendiente;
  if (pend === null || pend.detalle.tipo !== "compraODeclina") {
    return error("ACCION_NO_ESPERADA", "no hay una compra pendiente");
  }
  if (pend.jugadorId !== jugadorId) return error("NO_ES_TU_TURNO", "esta decisión no es tuya");

  const subasta: SubastaEnCurso = {
    celdaIndice: pend.detalle.celdaIndice,
    jugadorQueDeclino: jugadorId,
    fueDoble: pend.fueDoble,
    pujaActual: null,
    jugadoresPasados: [],
  };
  return ok({ ...estado, decisionPendiente: null, subastaEnCurso: subasta });
}

// ── Subasta ──────────────────────────────────────────────────────────────

/** Puja libre y ascendente, incremento mínimo de $10M (§3). Cualquier jugador activo puede pujar. */
export function pujar(
  estado: EstadoMonopoly,
  jugadorId: string,
  monto: number,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const subasta = estado.subastaEnCurso;
  if (subasta === null) return error("SUBASTA_NO_EN_CURSO", "no hay subasta en curso");
  const jugador = jugadorDe(estado, jugadorId);
  if (jugador.enQuiebra) return error("JUGADOR_EN_QUIEBRA", "estás en quiebra");
  if (subasta.jugadoresPasados.includes(jugadorId)) {
    return error("YA_PASASTE", "ya pasaste en esta subasta");
  }

  const minimo =
    subasta.pujaActual === null
      ? REGLAS_MONOPOLY.subasta.inicial
      : subasta.pujaActual.monto + REGLAS_MONOPOLY.subasta.incrementoMinimo;
  if (!Number.isFinite(monto) || monto < minimo) {
    return error("PUJA_INVALIDA", `la puja mínima es $${minimo}M`);
  }
  if (monto > jugador.presupuesto) return error("SALDO_INSUFICIENTE", "no tienes ese presupuesto");

  const nuevaSubasta: SubastaEnCurso = { ...subasta, pujaActual: { jugadorId, monto } };
  return ok({ ...estado, subastaEnCurso: nuevaSubasta });
}

/** Pasa en la subasta actual. Puede resolverla si ya nadie más puede reaccionar. */
export function pasarSubasta(
  estado: EstadoMonopoly,
  jugadorId: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const subasta = estado.subastaEnCurso;
  if (subasta === null) return error("SUBASTA_NO_EN_CURSO", "no hay subasta en curso");
  jugadorDe(estado, jugadorId);
  if (subasta.jugadoresPasados.includes(jugadorId)) {
    return error("YA_PASASTE", "ya pasaste en esta subasta");
  }

  const pasados = [...subasta.jugadoresPasados, jugadorId];
  const activos = estado.jugadores.filter((j) => !j.enQuiebra).map((j) => j.id);
  const faltan = activos.filter((id) => {
    if (subasta.pujaActual !== null && id === subasta.pujaActual.jugadorId) return false;
    return !pasados.includes(id);
  });

  const nuevaSubasta: SubastaEnCurso = { ...subasta, jugadoresPasados: pasados };
  if (faltan.length > 0) {
    return ok({ ...estado, subastaEnCurso: nuevaSubasta });
  }
  return ok(resolverSubasta(estado, nuevaSubasta, rng));
}

function resolverSubasta(
  estado: EstadoMonopoly,
  subasta: SubastaEnCurso,
  rng: GeneradorAleatorio,
): EstadoMonopoly {
  const celda = celdaEn(subasta.celdaIndice);
  const sinSubasta: EstadoMonopoly = { ...estado, subastaEnCurso: null };

  if (subasta.pujaActual !== null) {
    const { jugadorId, monto } = subasta.pujaActual;
    const cobrado = cobrar(sinSubasta, jugadorId, monto);
    return asignarSobrePendiente(cobrado, jugadorId, celda, subasta.fueDoble, rng);
  }

  // Nadie pujó: el que declinó queda obligado a comprar al precio de lista (§3).
  if (!esCeldaComprable(celda)) throw new Error("invariante: subasta sobre celda no comprable");
  const cobrado = cobrar(sinSubasta, subasta.jugadorQueDeclino, celda.precio);
  return asignarSobrePendiente(cobrado, subasta.jugadorQueDeclino, celda, subasta.fueDoble, rng);
}

/** Ya cobrado; asigna el sobre (técnico: directo; liga/RdM: deja elegir posición). NUNCA abre ventana. */
function asignarSobrePendiente(
  estado: EstadoMonopoly,
  ganadorId: string,
  celda: CeldaTablero,
  fueDoble: boolean,
  rng: GeneradorAleatorio,
): EstadoMonopoly {
  if (celda.tipo === "tecnicos") {
    const tecnico = elegirTecnicoParaSobre(estado.pool.tecnicos, rng);
    if (tecnico === undefined) return estado;
    const { id, estado: conId } = siguienteIdDeCarta(estado);
    const carta: CartaMiClub = { tipo: "tecnico", id, tecnico };
    const j = jugadorDe(conId, ganadorId);
    return conJugador(conId, ganadorId, { miClub: agregarCarta(j.miClub, carta) });
  }
  return {
    ...estado,
    decisionPendiente: {
      jugadorId: ganadorId,
      fueDoble,
      detalle: {
        tipo: "elegirPosicionSobre",
        origen: { clase: "celda", celdaIndice: celda.indice },
        sobresRestantes: 1,
      },
    },
  };
}

// ── Sobre pendiente de posición (subasta / carta #13) ──────────────────────

function poolYTramosDe(
  estado: EstadoMonopoly,
  origen: OrigenSobrePendiente,
): { readonly pool: readonly JugadorPool[]; readonly tramos: TramosTier; readonly origenCarta: OrigenCartaJugador } {
  if (origen.clase === "liga") {
    return {
      pool: estado.pool.porLiga[origen.liga],
      tramos: tramosParaLiga(false),
      origenCarta: { clase: "liga", liga: origen.liga },
    };
  }
  const celda = celdaEn(origen.celdaIndice);
  if (celda.tipo === "liga") {
    return {
      pool: estado.pool.porLiga[celda.liga],
      tramos: tramosParaLiga(celda.esCeldaMasCara),
      origenCarta: { clase: "liga", liga: celda.liga },
    };
  }
  return { pool: estado.pool.restoDelMundo, tramos: REGLAS_MONOPOLY.tiers.restoDelMundo, origenCarta: { clase: "restoDelMundo" } };
}

/** Resuelve el sobre pendiente (post-subasta o doble fichaje) con la posición elegida. */
export function elegirPosicionSobre(
  estado: EstadoMonopoly,
  jugadorId: string,
  posicion: PosicionJugador,
  rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const pend = estado.decisionPendiente;
  if (pend === null || pend.detalle.tipo !== "elegirPosicionSobre") {
    return error("ACCION_NO_ESPERADA", "no hay un sobre pendiente de posición");
  }
  if (pend.jugadorId !== jugadorId) return error("NO_ES_TU_TURNO", "esta decisión no es tuya");

  const { origen, sobresRestantes } = pend.detalle;
  const { pool: poolCrudo, tramos, origenCarta } = poolYTramosDe(estado, origen);
  const pool = excluirYaSorteados(poolCrudo, estado.jugadoresRealesSorteados);
  const elegido = elegirJugadorParaSobre(pool, tramos, posicion, rng);
  if (elegido === undefined) return error("POOL_INVALIDO", "no hay jugadores disponibles");

  const { id, estado: conId } = siguienteIdDeCarta(estado);
  const carta: CartaMiClub = { tipo: "jugador", id, origen: origenCarta, jugador: elegido };
  const j = jugadorDe(conId, jugadorId);
  const conCarta = conJugador(conId, jugadorId, { miClub: agregarCarta(j.miClub, carta) });
  const conSorteo = {
    ...conCarta,
    jugadoresRealesSorteados: [...conCarta.jugadoresRealesSorteados, elegido.jugadorId],
  };

  if (sobresRestantes > 1) {
    return ok({
      ...conSorteo,
      decisionPendiente: {
        jugadorId,
        fueDoble: pend.fueDoble,
        detalle: { tipo: "elegirPosicionSobre", origen, sobresRestantes: sobresRestantes - 1 },
      },
    });
  }
  return ok({ ...conSorteo, decisionPendiente: null });
}

// ── Renegociación forzada ───────────────────────────────────────────────────

/**
 * Fuerza la compra pagando 200% compuesto del último precio pagado (§3).
 * Acción LIBRE: no requiere turno ni decisionPendiente (ver cabecera).
 */
export function forzarCompra(
  estado: EstadoMonopoly,
  jugadorId: string,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const jugador = jugadorDe(estado, jugadorId);
  if (jugador.enQuiebra) return error("JUGADOR_EN_QUIEBRA", "estás en quiebra");

  const ventana = estado.ventanasAbiertas[jugador.posicion];
  if (ventana === undefined) return error("SIN_VENTANA_ABIERTA", "no hay ventana en tu celda");
  if (estado.turnoGlobal >= ventana.turnoDeCierre) {
    return error("VENTANA_CERRADA", "la ventana de renegociación ya cerró");
  }
  if (jugadorId === ventana.titularActualId) {
    return error("CELDA_NO_COMPRABLE", "ya eres el titular de esa carta");
  }

  // Se permite igual si el presupuesto no alcanza: §3.3 lista la renegociación
  // forzada entre los pagos obligatorios que pueden llevar a quiebra.
  const nuevoPrecio = ventana.precioActual * REGLAS_MONOPOLY.renegociacion.multiplicador;
  const cobrado = cobrar(estado, jugadorId, nuevoPrecio);
  const pagado = pagarAJugador(cobrado, ventana.titularActualId, nuevoPrecio);

  const anteriorTitular = jugadorDe(pagado, ventana.titularActualId);
  const carta = buscarCarta(anteriorTitular.miClub, ventana.cartaId);
  if (carta === undefined) {
    throw new Error("invariante: la carta de la ventana no está en Mi Club del titular");
  }

  const sinCarta = conJugador(pagado, ventana.titularActualId, {
    miClub: quitarCarta(anteriorTitular.miClub, carta.id),
  });
  const nuevoTitular = jugadorDe(sinCarta, jugadorId);
  const conCarta = conJugador(sinCarta, jugadorId, { miClub: agregarCarta(nuevoTitular.miClub, carta) });

  const ventanaActualizada: VentanaRenegociacion = {
    ...ventana,
    titularActualId: jugadorId,
    precioActual: nuevoPrecio,
  };
  return ok({
    ...conCarta,
    ventanasAbiertas: { ...conCarta.ventanasAbiertas, [ventana.celdaIndice]: ventanaActualizada },
  });
}
