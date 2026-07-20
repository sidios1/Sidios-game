// MotorRumble: motor DECORADOR que envuelve crearMotorCarioca() bajo el mismo puerto
// MotorJuego<E,A>. Delega las acciones base al motor interno y añade el SLICE de
// habilidades (asignaciones, cargas, ventanas, snapshots, flags). Todo vive dentro
// del estado del orquestador → sobrevive a la reconexión por token.
//
// La aleatoriedad de las ACCIONES de habilidad (el puerto aplicarAccion no recibe
// rng) sale de un generador propio del motor, inyectable para tests. La asignación
// por ronda (crear/continuar) usa el rng del orquestador para alinearse con su semilla.

import type {
  Carta,
  ContratoMano,
  EstadoPartida,
  ObjetivoCarta,
  Pinta,
} from "@juegos/carioca-core";
import {
  acunarComodinDePinta,
  bajarseConContrato,
  cerrarManoManual,
  crearGeneradorSemilla,
  descartarExtra,
  describirCarta,
  entregarCartaDelMazo,
  intercambiarManos,
  pasarTurno,
  puntosMano,
  resetearCartasDeMano,
  resetearManoJugador,
  robarDelMazoSesgado,
  robarDobleDelMazo,
  robarDelPozoPorId,
  transferirCarta,
} from "@juegos/carioca-core";
import type {
  ConfigRumble,
  EstadoCarga,
  HabilidadId,
} from "@juegos/rumble-core";
import {
  asignarHabilidadesRonda,
  cargaDisponible,
  CONFIG_DEFAULT,
  consumirCarga,
  crearCargasIniciales,
  habilidadPorId,
  parsearConfigRumble,
  snapshotPintaMayoritaria,
  validarConfigRumble,
  ventanaVigente,
} from "@juegos/rumble-core";
import type { AccionJuego } from "../../protocolo.js";
import type {
  ErrorMotor,
  GeneradorAleatorio,
  JugadorMotor,
  MotorJuego,
  Resultado,
} from "../../motor.js";
import type { MetaSala } from "../../vista.js";
import type { VistaRumble } from "./vistaRumble.js";
import { construirVistaRumble } from "./vistaRumble.js";
import type { OpcionesMotorCarioca } from "./motorCarioca.js";
import { crearMotorCarioca } from "./motorCarioca.js";
import type {
  AccionHabilidad,
  AccionRumble,
  EstadoRumble,
  SliceRumble,
  TipoEventoRumble,
  Ubicacion,
} from "./estadoRumble.js";
import { parsearAccionHabilidad } from "./accionesRumble.js";
import { MISION_TOCO } from "./misionToco.js";
import { descubrirCombinacionesTroll } from "./descubridorTroll.js";

/** Acción de Carioca ya parseada, tal como llega envuelta en `AccionRumble`. */
type AccionBase = Extract<AccionRumble, { clase: "base" }>["accion"];

export interface OpcionesMotorRumble extends OpcionesMotorCarioca {
  /** RNG para las ACCIONES de habilidad (inyectable en tests). */
  readonly rng?: GeneradorAleatorio;
}

function fallo(codigo: string, mensaje: string): Resultado<EstadoRumble> {
  return { ok: false, error: { codigo, mensaje } };
}

// ── Helpers de slice (inmutables) ────────────────────────────────────────────

function conEvento(
  slice: SliceRumble,
  jugadorId: string,
  tipo: TipoEventoRumble,
  texto: string,
  turno: number,
): SliceRumble {
  const evento = { id: `ev-${slice.contadorEventos}`, tipo, texto, turno };
  const previos = slice.eventos[jugadorId] ?? [];
  return {
    ...slice,
    eventos: { ...slice.eventos, [jugadorId]: [...previos, evento] },
    contadorEventos: slice.contadorEventos + 1,
  };
}

function eventoPublico(
  slice: SliceRumble,
  base: EstadoPartida,
  tipo: TipoEventoRumble,
  texto: string,
): SliceRumble {
  let s = slice;
  for (const j of base.jugadores) {
    s = conEvento(s, j.id, tipo, texto, base.turno.numero);
  }
  return s;
}

/** ¿El jugador tiene ESTA ronda la habilidad? (la asignación manda, no el slice). */
function tieneHabilidad(
  slice: SliceRumble,
  jugadorId: string,
  habId: HabilidadId,
): boolean {
  return (slice.asignaciones[jugadorId] ?? []).includes(habId);
}

function consumirCargaDe(
  slice: SliceRumble,
  jugadorId: string,
  habId: HabilidadId,
): SliceRumble {
  const cargasJ = slice.cargas[jugadorId];
  const carga = cargasJ?.[habId];
  if (cargasJ === undefined || carga === undefined) return slice;
  return {
    ...slice,
    cargas: {
      ...slice.cargas,
      [jugadorId]: { ...cargasJ, [habId]: consumirCarga(carga) },
    },
  };
}

// ── Asignación por ronda (ciclo §7) ──────────────────────────────────────────

// La misión de TOCO es única y fija (§3.3): `MISION_TOCO`, sin generación ni RNG.
// Invariante que se mantiene al asignarla: tener TOCO asignada ⟺ tener misión en el
// slice (lo asumen `aplicarBajarse` y la proyección de la vista).

function asignarRonda(
  base: EstadoPartida,
  config: ConfigRumble,
  memoriaPrevia: Readonly<Record<string, readonly HabilidadId[]>>,
  asignacionFija: Readonly<Record<string, readonly HabilidadId[]>> | null,
  contadorEventos: number,
  rng: GeneradorAleatorio,
): SliceRumble {
  const jugadorIds = base.jugadores.map((j) => j.id);

  const usarFija = config.reasignacion === "fijas" && asignacionFija !== null;
  const asignaciones = usarFija
    ? asignacionFija
    : asignarHabilidadesRonda({ config, jugadorIds, memoriaPrevia, rng }).porJugador;

  const cargas: Record<string, Record<string, EstadoCarga>> = {};
  const pesao: string[] = [];
  const doble: string[] = [];
  const ojoArmado: string[] = [];
  const misionToco: Record<string, ContratoMano> = {};
  const snapshotRadar: Record<string, Readonly<Record<string, Pinta | null>>> = {};

  const manos: Record<string, readonly Carta[]> = {};
  for (const j of base.jugadores) manos[j.id] = j.mano;

  for (const jugadorId of jugadorIds) {
    const ids = asignaciones[jugadorId] ?? [];
    const cargasJ: Record<string, EstadoCarga> = {};
    for (const id of ids) {
      const h = habilidadPorId(id);
      if (h !== undefined) cargasJ[id] = crearCargasIniciales(h);
      if (id === "PESAO") pesao.push(jugadorId);
      if (id === "DOBLE") doble.push(jugadorId);
      if (id === "OJO") ojoArmado.push(jugadorId);
      if (id === "RADAR") snapshotRadar[jugadorId] = snapshotPintaMayoritaria(manos);
      if (id === "TOCO") misionToco[jugadorId] = MISION_TOCO;
    }
    cargas[jugadorId] = cargasJ;
  }

  return {
    config,
    asignaciones,
    cargas,
    memoriaPrevia: asignaciones,
    asignacionFija:
      config.reasignacion === "fijas" ? (asignacionFija ?? asignaciones) : null,
    pesao,
    doble,
    misionToco,
    snapshotRadar,
    sapo: {},
    augurio: {},
    mish: {},
    decretalo: {},
    saltarProximoTurno: [],
    ojoArmado,
    descartesPendientes: {},
    eventos: {},
    pilloPendiente: null,
    contadorEventos,
  };
}

// ── Validación de uso de una habilidad (autoridad) ───────────────────────────

function validarUso(
  slice: SliceRumble,
  base: EstadoPartida,
  jugadorId: string,
  habId: HabilidadId,
): ErrorMotor | null {
  const mias = slice.asignaciones[jugadorId] ?? [];
  if (!mias.includes(habId)) {
    return { codigo: "HABILIDAD_NO_ASIGNADA", mensaje: `no tienes ${habId} esta ronda` };
  }
  const carga = slice.cargas[jugadorId]?.[habId];
  if (carga !== undefined && !cargaDisponible(carga)) {
    return { codigo: "SIN_CARGAS", mensaje: `${habId} sin cargas esta ronda` };
  }
  const h = habilidadPorId(habId);
  if (h !== undefined && !ventanaVigente(h, base.turno.numero)) {
    return { codigo: "FUERA_DE_VENTANA", mensaje: `${habId} fuera de su ventana` };
  }
  return null;
}

function habilidadDeAccion(accion: AccionHabilidad): HabilidadId {
  switch (accion.tipo) {
    case "rumble/decretalo": return "DECRETALO";
    case "rumble/mish": return "MISH";
    case "rumble/augurio": return "AUGURIO";
    case "rumble/sapo": return "SAPO";
    case "rumble/judio": return "JUDIO";
    case "rumble/guason": return "GUASON";
    case "rumble/ginyu": return "GINYU";
    case "rumble/chato": return "CHATO";
    case "rumble/mato": return "MATO";
    case "rumble/troll": return "TROLL";
    case "rumble/pillo": return "PILLO";
    case "rumble/pilloRobo": return "PILLO";
    case "rumble/extra": return "EXTRA";
  }
}

/** Crea el MotorRumble decorando a Carioca. */
export function crearMotorRumble(
  opciones: OpcionesMotorRumble = {},
): MotorJuego<EstadoRumble, AccionRumble> {
  const interno = crearMotorCarioca(opciones);
  const rng: GeneradorAleatorio = opciones.rng ?? crearGeneradorSemilla(Date.now());

  // ── Resolución de saltos de turno pendientes (EXTRA "perder turno") ──
  function resolverTurno(estado: EstadoRumble): EstadoRumble {
    let base = estado.base;
    let slice = estado.slice;
    let saltar = [...slice.saltarProximoTurno];
    for (let i = 0; i <= base.jugadores.length; i++) {
      if (base.fase !== "jugandoMano") break;
      const enTurno = base.turno.jugadorId;
      if (!saltar.includes(enTurno)) break;
      const res = pasarTurno(base, enTurno);
      if (!res.ok) break;
      base = res.valor;
      saltar = saltar.filter((id) => id !== enTurno);
      slice = conEvento(slice, enTurno, "skip", "Perdiste el turno (EXTRA)", base.turno.numero);
    }
    return { base, slice: { ...slice, saltarProximoTurno: saltar } };
  }

  // ── DOBLE: post-proceso de puntaje al cerrar la mano ──
  function ajustarPuntajeDoble(base: EstadoPartida, slice: SliceRumble): EstadoPartida {
    if (base.ganadorManoId === null || slice.doble.length === 0) return base;
    let jugadores = base.jugadores;
    for (const duenoId of slice.doble) {
      const gano = base.ganadorManoId === duenoId;
      jugadores = jugadores.map((j) => {
        if (gano) {
          // El dueño de DOBLE ganó: los demás pagan el DOBLE de su incremento.
          if (j.id === duenoId) return j;
          return { ...j, puntosAcumulados: j.puntosAcumulados + puntosMano(j.mano) };
        }
        // El dueño de DOBLE perdió: su incremento sube 50%.
        if (j.id !== duenoId) return j;
        return {
          ...j,
          puntosAcumulados: j.puntosAcumulados + Math.round(puntosMano(j.mano) * 0.5),
        };
      });
    }
    return { ...base, jugadores };
  }

  // ── OJO: intercepta un cierre inminente ──
  function aplicarOjo(
    antes: EstadoRumble,
    actorId: string,
    ojoOwnerId: string,
  ): EstadoRumble {
    const base0 = antes.base;
    const compensado = entregarCartaDelMazo(base0, actorId);
    const conCarta = compensado.ok ? compensado.valor : base0;
    const saltado = pasarTurno(conCarta, actorId);
    const base = saltado.ok ? saltado.valor : conCarta;
    let slice = consumirCargaDe(antes.slice, ojoOwnerId, "OJO");
    slice = { ...slice, ojoArmado: slice.ojoArmado.filter((id) => id !== ojoOwnerId) };
    slice = conEvento(slice, actorId, "skip", "OJO te saltó el turno (+1 carta de compensación)", base.turno.numero);
    slice = conEvento(slice, ojoOwnerId, "asignacion", `Usaste OJO contra ${actorId}`, base.turno.numero);
    return { base, slice };
  }

  // ── Post-proceso común tras aplicar una acción base o de habilidad ──
  function postProceso(
    antes: EstadoRumble,
    despues: EstadoRumble,
    actorId: string,
  ): EstadoRumble {
    const cerroAhora =
      antes.base.fase === "jugandoMano" && despues.base.fase !== "jugandoMano";
    if (cerroAhora) {
      const ojoOwner = despues.slice.ojoArmado.find(
        (id) => id !== actorId && cargaDisponible(despues.slice.cargas[id]?.["OJO"] ?? { restantes: 0 }),
      );
      if (ojoOwner !== undefined) {
        // Tras revertir el cierre y saltar al actor, aún se resuelven los saltos
        // EXTRA pendientes que puedan caer en el nuevo jugador en turno.
        return resolverTurno(aplicarOjo(antes, actorId, ojoOwner));
      }
      const base = ajustarPuntajeDoble(despues.base, despues.slice);
      let slice = despues.slice;
      if (slice.doble.length > 0) {
        slice = eventoPublico(slice, base, "doble", "Se aplicó el multiplicador DOBLE al cierre");
      }
      return resolverTurno({ base, slice });
    }
    return resolverTurno(despues);
  }

  // ── Bajarse: TOCO (misión alterna) y EXODIA (victoria en la ventana) ──
  //
  // ÚNICO punto donde Rumble sustituye la condición de victoria, y siempre por las
  // costuras de S1 — aquí no se reimplementa ninguna regla:
  //   · TOCO  → `bajarseConContrato` con la misión del slice en vez del contrato de
  //     la mano; cumplirla ES ganar (§3.3, "condición de victoria sobrescrita").
  //   · EXODIA → `cerrarManoManual` si el bajarse cae en la ventana global de los
  //     3 primeros turnos (§3.2, B1); gana aunque le queden cartas (puntúa 0).
  // El cierre se aplica ANTES de `postProceso`, así OJO puede interceptarlo y DOBLE
  // ajustar el puntaje igual que en cualquier otro cierre.
  //
  // Para quien no tiene ninguna de las dos, esto es `interno.aplicarAccion` +
  // `postProceso` con el slice intacto: exactamente la ruta de siempre.
  function aplicarBajarse(
    estado: EstadoRumble,
    jugadorId: string,
    accion: Extract<AccionBase, { tipo: "bajarse" }>,
  ): Resultado<EstadoRumble> {
    const { base, slice } = estado;

    const mision = slice.misionToco[jugadorId];
    const conToco = tieneHabilidad(slice, jugadorId, "TOCO") && mision !== undefined;

    const res = conToco
      ? bajarseConContrato(base, jugadorId, accion.propuesta, mision)
      : interno.aplicarAccion(base, jugadorId, accion);
    if (!res.ok) return { ok: false, error: res.error };

    // La ventana de EXODIA se mide sobre el turno EN QUE SE BAJÓ (el estado previo)
    // y con `ventanaVigente` de rumble-core: la definición de "primeros 3 turnos"
    // vive en el modelo de datos, no duplicada aquí.
    const exodia = habilidadPorId("EXODIA");
    const conExodia =
      tieneHabilidad(slice, jugadorId, "EXODIA") &&
      exodia !== undefined &&
      ventanaVigente(exodia, base.turno.numero);

    let despues = res.valor;
    let s = slice;
    if (conToco || conExodia) {
      // Si la bajada ya vació la mano, el core cerró solo: no hay nada que forzar.
      // Es SIEMPRE el caso de TOCO: su misión (escala sucia) es de cierre automático.
      let forzado = false;
      if (despues.fase === "jugandoMano") {
        const cierre = cerrarManoManual(despues, jugadorId);
        if (cierre.ok) {
          despues = cierre.valor;
          forzado = true;
        }
      }
      // TOCO anuncia su victoria haya cerrado el core o el cierre forzado: cumplir la
      // misión ES ganar. EXODIA solo cuando de verdad forzó el cierre (si vació la
      // mano, ganó por la vía normal y no hay nada especial que anunciar).
      if (conToco && despues.ganadorManoId === jugadorId) {
        s = eventoPublico(
          s,
          despues,
          "victoria",
          `${jugadorId} completó su misión de TOCO y ganó la mano`,
        );
      } else if (forzado) {
        s = eventoPublico(
          s,
          despues,
          "victoria",
          `${jugadorId} se bajó en los primeros 3 turnos: EXODIA le da la mano`,
        );
      }
    }
    return { ok: true, valor: postProceso(estado, { base: despues, slice: s }, jugadorId) };
  }

  // ── Acciones base con intercepción (DECRETALO, EXTRA descartar2, bajarse) ──
  function aplicarBase(
    estado: EstadoRumble,
    jugadorId: string,
    accion: AccionBase,
  ): Resultado<EstadoRumble> {
    const { base, slice } = estado;

    if (accion.tipo === "bajarse") {
      return aplicarBajarse(estado, jugadorId, accion);
    }

    if (accion.tipo === "robarDelMazo") {
      const objetivo = slice.decretalo[jugadorId];
      const carga = slice.cargas[jugadorId]?.["DECRETALO"];
      if (objetivo !== undefined && carga !== undefined && cargaDisponible(carga)) {
        const res = robarDelMazoSesgado(base, jugadorId, objetivo, rng);
        if (!res.ok) return { ok: false, error: res.error };
        const nuevo = consumirCargaDe(slice, jugadorId, "DECRETALO");
        return { ok: true, valor: postProceso(estado, { base: res.valor, slice: nuevo }, jugadorId) };
      }
    }

    if (accion.tipo === "descartar" && (slice.descartesPendientes[jugadorId] ?? 0) > 0) {
      const res = descartarExtra(base, jugadorId, accion.cartaId);
      if (!res.ok) return { ok: false, error: res.error };
      const restante = (slice.descartesPendientes[jugadorId] ?? 0) - 1;
      const nuevo: SliceRumble = {
        ...slice,
        descartesPendientes: { ...slice.descartesPendientes, [jugadorId]: restante },
      };
      return { ok: true, valor: postProceso(estado, { base: res.valor, slice: nuevo }, jugadorId) };
    }

    const res = interno.aplicarAccion(base, jugadorId, accion);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, valor: postProceso(estado, { base: res.valor, slice }, jugadorId) };
  }

  // ── Acciones de habilidad ──
  function aplicarHabilidad(
    estado: EstadoRumble,
    jugadorId: string,
    accion: AccionHabilidad,
  ): Resultado<EstadoRumble> {
    const { base, slice } = estado;

    // pilloRobo es la resolución de un fallo previo: no requiere tener PILLO.
    if (accion.tipo === "rumble/pilloRobo") {
      const pend = slice.pilloPendiente;
      if (pend === null || pend.ladronId !== jugadorId) {
        return fallo("PILLO_SIN_PENDIENTE", "no tienes un robo de PILLO pendiente");
      }
      // El robo es A CIEGAS: el cliente manda una posición, no un id (los ids
      // codifican la carta). Aquí, del lado autoritativo, índice → carta.
      const victima = base.jugadores.find((j) => j.id === pend.victimaId);
      if (victima === undefined) {
        return fallo("JUGADOR_DESCONOCIDO", "la víctima del PILLO ya no está en la partida");
      }
      const elegida = victima.mano[accion.indice];
      if (elegida === undefined) {
        return fallo("INDICE_FUERA_DE_RANGO", "esa posición no existe en la mano");
      }
      const res = transferirCarta(base, pend.victimaId, jugadorId, elegida.id);
      if (!res.ok) return { ok: false, error: res.error };
      let s: SliceRumble = { ...slice, pilloPendiente: null };
      s = conEvento(s, pend.victimaId, "pilloAcierto", `${jugadorId} te robó una carta (PILLO)`, base.turno.numero);
      return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
    }

    const habId = habilidadDeAccion(accion);
    const error = validarUso(slice, base, jugadorId, habId);
    if (error !== null) return { ok: false, error };

    switch (accion.tipo) {
      case "rumble/decretalo": {
        // DECRETALO solo ARMA el sesgo: no gasta "robos" al elegir la carta; los
        // gastan los robarDelMazo sesgados posteriores (aplicarBase).
        const objetivo: ObjetivoCarta = accion.objetivo;
        const s: SliceRumble = {
          ...slice,
          decretalo: { ...slice.decretalo, [jugadorId]: objetivo },
        };
        return { ok: true, valor: { base, slice: s } };
      }
      case "rumble/mish": {
        const ubicacion = ubicarCarta(base, accion.carta.pinta, accion.carta.valor);
        const descripcion = describirCarta({ tipo: "normal", pinta: accion.carta.pinta, valor: accion.carta.valor, id: "consulta" });
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = { ...s, mish: { ...s.mish, [jugadorId]: { descripcion, ubicacion } } };
        return { ok: true, valor: { base, slice: s } };
      }
      case "rumble/augurio": {
        const cima = base.mazo[base.mazo.length - 1] ?? null;
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = { ...s, augurio: { ...s.augurio, [jugadorId]: cima } };
        return { ok: true, valor: { base, slice: s } };
      }
      case "rumble/sapo": {
        const objetivo = base.jugadores.find((j) => j.id === accion.objetivoId);
        if (objetivo === undefined || objetivo.id === jugadorId) {
          return fallo("OBJETIVO_INVALIDO", "objetivo de SAPO inválido");
        }
        const cartas = tomarAlAzar(objetivo.mano, 4, rng);
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = { ...s, sapo: { ...s.sapo, [jugadorId]: { objetivoId: objetivo.id, cartas } } };
        return { ok: true, valor: { base, slice: s } };
      }
      case "rumble/judio": {
        const res = robarDelPozoPorId(base, jugadorId, accion.cartaId);
        if (!res.ok) return { ok: false, error: res.error };
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = eventoPublico(s, res.valor, "roboPozo", `${jugadorId} tomó una carta del pozo (JUDIO)`);
        return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
      }
      case "rumble/guason": {
        const res = accion.cartaSalienteId === undefined
          ? acunarComodinDePinta(base, jugadorId, accion.pinta, rng)
          : acunarComodinDePinta(base, jugadorId, accion.pinta, rng, accion.cartaSalienteId);
        if (!res.ok) return { ok: false, error: res.error };
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = conEvento(s, jugadorId, "guason", `Acuñaste un comodín de ${accion.pinta}`, base.turno.numero);
        return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
      }
      case "rumble/ginyu": {
        const rivales = base.jugadores.filter((j) => j.id !== jugadorId);
        const objetivo = rivales[Math.floor(rng() * rivales.length)];
        if (objetivo === undefined) return fallo("OBJETIVO_INVALIDO", "no hay a quién intercambiar");
        const res = intercambiarManos(base, jugadorId, objetivo.id);
        if (!res.ok) return { ok: false, error: res.error };
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = conEvento(s, objetivo.id, "swap", `Intercambiaste tu mano con ${jugadorId} (GINYU)`, base.turno.numero);
        s = conEvento(s, jugadorId, "swap", `Intercambiaste tu mano con ${objetivo.id} (GINYU)`, base.turno.numero);
        return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
      }
      case "rumble/chato": {
        if (accion.objetivoId === jugadorId) return fallo("OBJETIVO_INVALIDO", "CHATO no se usa sobre uno mismo");
        const res = resetearManoJugador(base, accion.objetivoId, rng);
        if (!res.ok) return { ok: false, error: res.error };
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = conEvento(s, accion.objetivoId, "reset", "Te resetearon la mano (CHATO)", base.turno.numero);
        return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
      }
      case "rumble/mato": {
        if (accion.que === "mano") {
          const res = resetearManoJugador(base, jugadorId, rng);
          if (!res.ok) return { ok: false, error: res.error };
          let s = consumirCargaDe(slice, jugadorId, habId);
          s = conEvento(s, jugadorId, "reset", "Reseteaste tu mano (MATO)", base.turno.numero);
          return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
        }
        // que === "habilidad": re-muestrea la habilidad propia (fresca).
        const nueva = asignarHabilidadesRonda({
          config: slice.config,
          jugadorIds: [jugadorId],
          rng,
        }).porJugador[jugadorId] ?? [];
        const cargasJ: Record<string, EstadoCarga> = {};
        for (const id of nueva) {
          const h = habilidadPorId(id);
          if (h !== undefined) cargasJ[id] = crearCargasIniciales(h);
        }
        // La misión sigue a la asignación: si TOCO se fue, deja de haber misión; si
        // llegó con el re-roll, se pone ahora (invariante TOCO ⟺ misión).
        const misionToco: Record<string, ContratoMano> = { ...slice.misionToco };
        if (nueva.includes("TOCO")) {
          misionToco[jugadorId] = MISION_TOCO;
        } else {
          delete misionToco[jugadorId];
        }
        let s: SliceRumble = {
          ...slice,
          asignaciones: { ...slice.asignaciones, [jugadorId]: nueva },
          cargas: { ...slice.cargas, [jugadorId]: cargasJ },
          misionToco,
          pesao: nueva.includes("PESAO") ? [...new Set([...slice.pesao, jugadorId])] : slice.pesao.filter((id) => id !== jugadorId),
          doble: nueva.includes("DOBLE") ? [...new Set([...slice.doble, jugadorId])] : slice.doble.filter((id) => id !== jugadorId),
          ojoArmado: nueva.includes("OJO") ? [...new Set([...slice.ojoArmado, jugadorId])] : slice.ojoArmado.filter((id) => id !== jugadorId),
        };
        s = conEvento(s, jugadorId, "asignacion", "Reseteaste tu habilidad (MATO)", base.turno.numero);
        return { ok: true, valor: { base, slice: s } };
      }
      case "rumble/troll": {
        const objetivo = base.jugadores.find((j) => j.id === accion.objetivoId);
        if (objetivo === undefined || objetivo.id === jugadorId) {
          return fallo("OBJETIVO_INVALIDO", "objetivo de TROLL inválido");
        }
        const ids = descubrirCombinacionesTroll(objetivo.mano);
        let nuevoBase = base;
        if (ids.length > 0) {
          const res = resetearCartasDeMano(base, objetivo.id, ids, rng);
          if (!res.ok) return { ok: false, error: res.error };
          nuevoBase = res.valor;
        }
        let s = consumirCargaDe(slice, jugadorId, habId);
        s = conEvento(s, objetivo.id, "reset", `Te resetearon ${ids.length} cartas en combinación (TROLL)`, base.turno.numero);
        return { ok: true, valor: postProceso(estado, { base: nuevoBase, slice: s }, jugadorId) };
      }
      case "rumble/pillo": {
        const objetivo = base.jugadores.find((j) => j.id === accion.objetivoId);
        if (objetivo === undefined || objetivo.id === jugadorId) {
          return fallo("OBJETIVO_INVALIDO", "objetivo de PILLO inválido");
        }
        const adivinada = objetivo.mano.find(
          (c) => c.tipo === "normal" && c.pinta === accion.carta.pinta && c.valor === accion.carta.valor,
        );
        let s = consumirCargaDe(slice, jugadorId, habId);
        if (adivinada !== undefined) {
          // Acierto: tomas la carta adivinada y entregas la tuya.
          const paso1 = transferirCarta(base, objetivo.id, jugadorId, adivinada.id);
          if (!paso1.ok) return { ok: false, error: paso1.error };
          const paso2 = transferirCarta(paso1.valor, jugadorId, objetivo.id, accion.cartaEntregadaId);
          if (!paso2.ok) return { ok: false, error: paso2.error };
          s = conEvento(s, objetivo.id, "pilloAcierto", `${jugadorId} adivinó una carta y la intercambió (PILLO)`, base.turno.numero);
          return { ok: true, valor: postProceso(estado, { base: paso2.valor, slice: s }, jugadorId) };
        }
        // Fallo: el objetivo elegirá qué carta robarte.
        s = { ...s, pilloPendiente: { victimaId: jugadorId, ladronId: objetivo.id } };
        s = conEvento(s, objetivo.id, "pilloFallo", `${jugadorId} falló PILLO: elige una carta suya para robar`, base.turno.numero);
        return { ok: true, valor: { base, slice: s } };
      }
      case "rumble/extra": {
        const res = robarDobleDelMazo(base, jugadorId);
        if (!res.ok) return { ok: false, error: res.error };
        let s = consumirCargaDe(slice, jugadorId, habId);
        const modo = penalizacionEfectiva(slice.config, rng);
        if (modo === "descartar2") {
          s = { ...s, descartesPendientes: { ...s.descartesPendientes, [jugadorId]: 1 } };
          s = conEvento(s, jugadorId, "asignacion", "EXTRA: robaste 2, descartarás 2 este turno", base.turno.numero);
        } else {
          s = { ...s, saltarProximoTurno: [...new Set([...s.saltarProximoTurno, jugadorId])] };
          s = conEvento(s, jugadorId, "asignacion", "EXTRA: robaste 2, perderás tu próximo turno", base.turno.numero);
        }
        return { ok: true, valor: postProceso(estado, { base: res.valor, slice: s }, jugadorId) };
      }
      default:
        // rumble/pilloRobo ya se resolvió arriba; ningún otro tipo llega aquí.
        return fallo("ACCION_DESCONOCIDA", "acción de habilidad no soportada");
    }
  }

  return {
    crear(
      jugadores: readonly JugadorMotor[],
      rngOrq: GeneradorAleatorio,
      config?: unknown,
    ): Resultado<EstadoRumble> {
      let cfg: ConfigRumble;
      if (config === undefined) {
        cfg = CONFIG_DEFAULT;
      } else {
        const parsed = parsearConfigRumble(config);
        if (parsed === null) return fallo("CONFIG_INVALIDA", "la config de Rumble tiene un formato inválido");
        const val = validarConfigRumble(parsed, jugadores.length);
        if (!val.valida) return fallo("CONFIG_INVALIDA", val.motivo);
        cfg = parsed;
      }
      const res = interno.crear(jugadores, rngOrq);
      if (!res.ok) return { ok: false, error: res.error };
      const slice = asignarRonda(res.valor, cfg, {}, null, 0, rngOrq);
      return { ok: true, valor: { base: res.valor, slice } };
    },

    parsearAccion(crudo: AccionJuego): AccionRumble | null {
      if (crudo.tipo.startsWith("rumble/")) {
        const accion = parsearAccionHabilidad(crudo);
        return accion === null ? null : { clase: "habilidad", accion };
      }
      const base = interno.parsearAccion(crudo);
      return base === null ? null : { clase: "base", accion: base };
    },

    aplicarAccion(
      estado: EstadoRumble,
      jugadorId: string,
      accion: AccionRumble,
    ): Resultado<EstadoRumble> {
      return accion.clase === "base"
        ? aplicarBase(estado, jugadorId, accion.accion)
        : aplicarHabilidad(estado, jugadorId, accion.accion);
    },

    jugadorEnTurno(estado: EstadoRumble): string | null {
      return interno.jugadorEnTurno(estado.base);
    },

    saltarTurno(estado: EstadoRumble, jugadorId: string): Resultado<EstadoRumble> {
      const res = interno.saltarTurno(estado.base, jugadorId);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, valor: resolverTurno({ base: res.valor, slice: estado.slice }) };
    },

    turnoTurbo(estado: EstadoRumble) {
      return interno.turnoTurbo?.(estado.base) ?? null;
    },

    expirarTurno(
      estado: EstadoRumble,
      jugadorId: string,
      rngOrq: GeneradorAleatorio,
    ): Resultado<EstadoRumble> {
      const res = interno.expirarTurno?.(estado.base, jugadorId, rngOrq);
      if (res === undefined) return fallo("SIN_TURBO", "el motor no soporta expiración de turno");
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, valor: postProceso(estado, { base: res.valor, slice: estado.slice }, jugadorId) };
    },

    terminada(estado: EstadoRumble): boolean {
      return interno.terminada(estado.base);
    },

    esperandoContinuar(estado: EstadoRumble): boolean {
      return interno.esperandoContinuar(estado.base);
    },

    continuar(estado: EstadoRumble, rngOrq: GeneradorAleatorio): Resultado<EstadoRumble> {
      const res = interno.continuar(estado.base, rngOrq);
      if (!res.ok) return { ok: false, error: res.error };
      const slice = asignarRonda(
        res.valor,
        estado.slice.config,
        estado.slice.memoriaPrevia,
        estado.slice.asignacionFija,
        estado.slice.contadorEventos,
        rngOrq,
      );
      return { ok: true, valor: { base: res.valor, slice } };
    },

    construirVista(estado: EstadoRumble, jugadorId: string, meta: MetaSala): VistaRumble {
      return construirVistaRumble(estado, jugadorId, meta);
    },
  };
}

// ── Utilidades locales ───────────────────────────────────────────────────────

function ubicarCarta(base: EstadoPartida, pinta: Pinta, valor: number): Ubicacion {
  const casa = (c: Carta): boolean =>
    c.tipo === "normal" && c.pinta === pinta && c.valor === valor;
  if (base.mazo.some(casa)) return { donde: "mazo" };
  if (base.pozo.some(casa)) return { donde: "pozo" };
  for (const j of base.jugadores) {
    if (j.mano.some(casa)) return { donde: "mano", jugadorId: j.id };
  }
  return { donde: "ninguna" };
}

/** Toma hasta `n` cartas al azar de una mano (SAPO), sin reemplazo. Determinista. */
function tomarAlAzar(mano: readonly Carta[], n: number, rng: GeneradorAleatorio): readonly Carta[] {
  const copia = [...mano];
  const elegidas: Carta[] = [];
  for (let i = 0; i < n && copia.length > 0; i++) {
    const idx = Math.floor(rng() * copia.length);
    const carta = copia.splice(idx, 1)[0];
    if (carta !== undefined) elegidas.push(carta);
  }
  return elegidas;
}

function penalizacionEfectiva(
  config: ConfigRumble,
  rng: GeneradorAleatorio,
): "descartar2" | "perderTurno" {
  if (config.penalizacionExtra === "descartar2") return "descartar2";
  if (config.penalizacionExtra === "perderTurno") return "perderTurno";
  return rng() < 0.5 ? "descartar2" : "perderTurno";
}
