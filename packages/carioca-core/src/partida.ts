// Máquina de turnos y estado de la partida (REGLAS_CARIOCA.md §1, §5, §6 y §7).
// Estilo reducer puro: el estado es inmutable y cada acción devuelve un
// Resultado con el estado nuevo o un error tipado. El servidor (Fase 2)
// traduce intenciones de los clientes a estas acciones.

import type { Carta, Pinta, ValorCarta } from "./carta.js";
import {
  crearComodinDePinta,
  describirCarta,
  esComodin,
  esComodinDePinta,
  esCualquierComodin,
} from "./carta.js";
import type { GeneradorAleatorio } from "./aleatorio.js";
import { barajar } from "./aleatorio.js";
import { crearMazoCompleto, repartir, reponerMazoDesdePozo } from "./mazo.js";
import type { ContratoMano } from "./contratos.js";
import { contratoDeMano, MANOS } from "./contratos.js";
import type {
  Combinacion,
  ExtremoEscala,
  TipoCombinacion,
} from "./combinaciones.js";
import {
  contarComodines,
  contarComodinesDePinta,
  extenderEscala,
  validarContrato,
  valorDeTrio,
} from "./combinaciones.js";
import { puntosMano } from "./puntaje.js";

export type CodigoError =
  | "JUGADORES_INVALIDOS"
  | "MAZO_INVALIDO"
  | "MANO_DESCONOCIDA"
  | "MANO_EN_CURSO"
  | "PARTIDA_TERMINADA"
  | "NO_ES_TU_TURNO"
  | "FASE_INCORRECTA"
  | "MAZO_VACIO"
  | "POZO_VACIO"
  | "CARTA_NO_ESTA_EN_MANO"
  | "YA_TE_BAJASTE"
  | "NO_TE_HAS_BAJADO"
  | "CONTRATO_INVALIDO"
  | "PEGAR_MISMO_TURNO"
  | "PEGAR_INVALIDO"
  | "COMBINACION_INEXISTENTE"
  | "COMODIN_AL_POZO"
  // Códigos aditivos usados solo por las costuras de modos (Rumble); las
  // acciones base de Carioca no los emiten.
  | "CARTA_NO_ESTA_EN_POZO"
  | "SIN_COMODINES"
  | "JUGADOR_DESCONOCIDO";

export interface ErrorJuego {
  readonly codigo: CodigoError;
  readonly mensaje: string;
}

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: ErrorJuego };

export function exito<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function fallo<T>(codigo: CodigoError, mensaje: string): Resultado<T> {
  return { ok: false, error: { codigo, mensaje } };
}

export interface DatosJugador {
  readonly id: string;
  readonly nombre: string;
}

export interface Jugador extends DatosJugador {
  readonly mano: readonly Carta[];
  readonly puntosAcumulados: number;
  /** Número de turno en que se bajó en la mano actual, o null. */
  readonly turnoEnQueSeBajo: number | null;
}

export interface CombinacionEnMesa {
  readonly duenoId: string;
  readonly combinacion: Combinacion;
}

export type FaseTurno = "robar" | "descartar";
export type FasePartida = "jugandoMano" | "manoTerminada" | "partidaTerminada";

export interface Turno {
  readonly jugadorId: string;
  readonly fase: FaseTurno;
  /** Contador global que crece cada vez que el turno pasa de jugador. */
  readonly numero: number;
}

export interface EstadoPartida {
  readonly jugadores: readonly Jugador[];
  /** Número de la mano en curso (1..9), indexa MANOS por su campo numero. */
  readonly manoActual: number;
  readonly mazo: readonly Carta[];
  readonly pozo: readonly Carta[];
  readonly mesa: readonly CombinacionEnMesa[];
  readonly turno: Turno;
  readonly repartidorIdx: number;
  readonly fase: FasePartida;
  /** Quién cerró la mano actual (cuando fase no es "jugandoMano"). */
  readonly ganadorManoId: string | null;
}

export interface PropuestaCombinacion {
  readonly tipo: TipoCombinacion;
  /** Ids de cartas de la mano del jugador, en el orden propuesto. */
  readonly cartaIds: readonly string[];
}

// §1: mínimo 2 jugadores; sin tope superior (los mazos escalan, ver mazo.ts).
const MIN_JUGADORES = 2;

function validarMazoCompleto(
  mazo: readonly Carta[],
  numJugadores: number,
): string | null {
  const referencia = crearMazoCompleto(numJugadores);
  if (mazo.length !== referencia.length) {
    return `el mazo debe tener ${referencia.length} cartas`;
  }
  const ids = new Set(mazo.map((carta) => carta.id));
  if (ids.size !== mazo.length) {
    return "el mazo tiene cartas repetidas";
  }
  if (referencia.some((carta) => !ids.has(carta.id))) {
    return "el mazo no contiene todas las cartas del juego";
  }
  return null;
}

function comenzarMano(
  jugadoresPrevios: readonly Jugador[],
  contrato: ContratoMano,
  repartidorIdx: number,
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoPartida> {
  const errorMazo = validarMazoCompleto(mazoOrdenado, jugadoresPrevios.length);
  if (errorMazo !== null) return fallo("MAZO_INVALIDO", errorMazo);
  const reparto = repartir(
    mazoOrdenado,
    jugadoresPrevios.length,
    contrato.cartasRepartidas,
  );
  const mazo = [...reparto.mazoRestante];
  const aperturaPozo = mazo.pop();
  if (aperturaPozo === undefined) {
    return fallo("MAZO_INVALIDO", "no quedan cartas para abrir el pozo");
  }
  const jugadores: Jugador[] = [];
  for (let i = 0; i < jugadoresPrevios.length; i++) {
    const previo = jugadoresPrevios[i];
    const mano = reparto.manos[i];
    if (previo === undefined || mano === undefined) {
      return fallo("JUGADORES_INVALIDOS", "el reparto no cubre a todos los jugadores");
    }
    jugadores.push({ ...previo, mano, turnoEnQueSeBajo: null });
  }
  // §1/§5: el reparto rota cada mano; abre el jugador siguiente al repartidor.
  const abre = jugadores[(repartidorIdx + 1) % jugadores.length];
  if (abre === undefined) {
    return fallo("JUGADORES_INVALIDOS", "no hay jugador que abra la mano");
  }
  return exito({
    jugadores,
    manoActual: contrato.numero,
    mazo,
    pozo: [aperturaPozo],
    mesa: [],
    turno: { jugadorId: abre.id, fase: "robar", numero: 1 },
    repartidorIdx,
    fase: "jugandoMano",
    ganadorManoId: null,
  });
}

export function crearPartida(
  datos: readonly DatosJugador[],
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  return crearPartidaConMazo(
    datos,
    barajar(crearMazoCompleto(datos.length), rng),
  );
}

/** Variante determinista: recibe el mazo ya ordenado (tests, repeticiones). */
export function crearPartidaConMazo(
  datos: readonly DatosJugador[],
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoPartida> {
  if (datos.length < MIN_JUGADORES) {
    return fallo(
      "JUGADORES_INVALIDOS",
      `se necesitan al menos ${MIN_JUGADORES} jugadores`,
    );
  }
  if (new Set(datos.map((d) => d.id)).size !== datos.length) {
    return fallo("JUGADORES_INVALIDOS", "hay ids de jugador repetidos");
  }
  const primera = MANOS[0];
  if (primera === undefined) {
    return fallo("MANO_DESCONOCIDA", "no hay manos definidas en el contrato");
  }
  const jugadores: Jugador[] = datos.map((d) => ({
    ...d,
    mano: [],
    puntosAcumulados: 0,
    turnoEnQueSeBajo: null,
  }));
  return comenzarMano(jugadores, primera, 0, mazoOrdenado);
}

export function iniciarSiguienteMano(
  estado: EstadoPartida,
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  return iniciarSiguienteManoConMazo(
    estado,
    barajar(crearMazoCompleto(estado.jugadores.length), rng),
  );
}

export function iniciarSiguienteManoConMazo(
  estado: EstadoPartida,
  mazoOrdenado: readonly Carta[],
): Resultado<EstadoPartida> {
  if (estado.fase === "partidaTerminada") {
    return fallo("PARTIDA_TERMINADA", "la partida ya terminó");
  }
  if (estado.fase !== "manoTerminada") {
    return fallo("MANO_EN_CURSO", "la mano actual aún no termina");
  }
  const siguiente = contratoDeMano(estado.manoActual + 1);
  if (siguiente === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual + 1}`);
  }
  return comenzarMano(
    estado.jugadores,
    siguiente,
    (estado.repartidorIdx + 1) % estado.jugadores.length,
    mazoOrdenado,
  );
}

export function contratoActual(estado: EstadoPartida): ContratoMano | undefined {
  return contratoDeMano(estado.manoActual);
}

export function jugadorActual(estado: EstadoPartida): Jugador | undefined {
  return estado.jugadores.find((j) => j.id === estado.turno.jugadorId);
}

/** Ganadores de la partida (menor puntaje acumulado, §7); vacío si no terminó. */
export function ganadores(estado: EstadoPartida): readonly Jugador[] {
  if (estado.fase !== "partidaTerminada") return [];
  const minimo = Math.min(...estado.jugadores.map((j) => j.puntosAcumulados));
  return estado.jugadores.filter((j) => j.puntosAcumulados === minimo);
}

function validarAccion(
  estado: EstadoPartida,
  jugadorId: string,
  fase: FaseTurno,
): ErrorJuego | null {
  if (estado.fase !== "jugandoMano") {
    return { codigo: "FASE_INCORRECTA", mensaje: "no hay una mano en curso" };
  }
  if (estado.turno.jugadorId !== jugadorId) {
    return { codigo: "NO_ES_TU_TURNO", mensaje: "no es tu turno" };
  }
  if (estado.turno.fase !== fase) {
    return {
      codigo: "FASE_INCORRECTA",
      mensaje:
        fase === "robar"
          ? "ya robaste en este turno"
          : "primero debes robar una carta",
    };
  }
  return null;
}

function conManoActualizada(
  estado: EstadoPartida,
  jugadorId: string,
  transformar: (jugador: Jugador) => Jugador,
): readonly Jugador[] {
  return estado.jugadores.map((j) => (j.id === jugadorId ? transformar(j) : j));
}

/** §7: quien cierra suma 0; los demás suman las cartas que les quedaron. */
function cerrarMano(estado: EstadoPartida, ganadorId: string): EstadoPartida {
  const jugadores = estado.jugadores.map((j) =>
    j.id === ganadorId
      ? j
      : { ...j, puntosAcumulados: j.puntosAcumulados + puntosMano(j.mano) },
  );
  const ultima = MANOS[MANOS.length - 1];
  const esUltima = ultima !== undefined && estado.manoActual === ultima.numero;
  return {
    ...estado,
    jugadores,
    ganadorManoId: ganadorId,
    fase: esUltima ? "partidaTerminada" : "manoTerminada",
  };
}

export function robarDelMazo(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  let mazo = [...estado.mazo];
  let pozo = [...estado.pozo];
  if (mazo.length === 0) {
    const repuesto = reponerMazoDesdePozo(pozo);
    mazo = repuesto.mazo;
    pozo = repuesto.pozo;
  }
  const carta = mazo.pop();
  if (carta === undefined) {
    return fallo("MAZO_VACIO", "no quedan cartas para robar");
  }
  return exito({
    ...estado,
    mazo,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

export function robarDelPozo(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  const pozo = [...estado.pozo];
  const carta = pozo.pop();
  if (carta === undefined) {
    return fallo("POZO_VACIO", "el pozo está vacío");
  }
  return exito({
    ...estado,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

/**
 * Núcleo de bajarse parametrizado por el contrato a cumplir. `bajarse` le pasa
 * el contrato global de la mano (comportamiento normal de Carioca); la costura
 * `bajarseConContrato` (Rumble/TOCO) le pasa una misión alterna por jugador. El
 * orden de validaciones es idéntico al histórico para no alterar el juego base.
 */
function bajarseInterno(
  estado: EstadoPartida,
  jugadorId: string,
  propuesta: readonly PropuestaCombinacion[],
  contrato: ContratoMano | undefined,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  if (jugador.turnoEnQueSeBajo !== null) {
    return fallo("YA_TE_BAJASTE", "ya te bajaste en esta mano");
  }
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  const usadas = new Set<string>();
  const combinaciones: Combinacion[] = [];
  for (const prop of propuesta) {
    const cartas: Carta[] = [];
    for (const id of prop.cartaIds) {
      if (usadas.has(id)) {
        return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${id} está repetida en la propuesta`);
      }
      const carta = jugador.mano.find((c) => c.id === id);
      if (carta === undefined) {
        return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${id} no está en tu mano`);
      }
      usadas.add(id);
      cartas.push(carta);
    }
    combinaciones.push({ tipo: prop.tipo, cartas });
  }
  const validacion = validarContrato(contrato, combinaciones);
  if (!validacion.valida) {
    return fallo("CONTRATO_INVALIDO", validacion.motivo);
  }
  const manoRestante = jugador.mano.filter((c) => !usadas.has(c.id));
  if (contrato.cierreAutomatico && manoRestante.length > 0) {
    return fallo("CONTRATO_INVALIDO", "en esta mano debes bajar todas tus cartas");
  }
  const nuevo: EstadoPartida = {
    ...estado,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
      turnoEnQueSeBajo: estado.turno.numero,
    })),
    mesa: [
      ...estado.mesa,
      ...combinaciones.map((combinacion) => ({ duenoId: jugadorId, combinacion })),
    ],
  };
  // §6: la mano termina cuando un jugador se deshace de todas sus cartas
  // (en sucia/real esto es el cierre automático, sin descartar).
  if (manoRestante.length === 0) {
    return exito(cerrarMano(nuevo, jugadorId));
  }
  return exito(nuevo);
}

/**
 * Bajarse (§5/§6): solo tras robar, una única vez por mano y con el contrato
 * exacto de la mano en curso. En las manos de cierre automático se bajan las 13
 * cartas y se gana sin descartar.
 */
export function bajarse(
  estado: EstadoPartida,
  jugadorId: string,
  propuesta: readonly PropuestaCombinacion[],
): Resultado<EstadoPartida> {
  return bajarseInterno(estado, jugadorId, propuesta, contratoActual(estado));
}

/**
 * Pegar (§6): a combinaciones propias o ajenas, solo en turnos posteriores
 * al de bajarse. Comodín pegable solo si la combinación destino aún admite
 * uno según el contrato (decisión confirmada).
 */
export function pegar(
  estado: EstadoPartida,
  jugadorId: string,
  cartaId: string,
  mesaIdx: number,
  extremo?: ExtremoEscala,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  if (jugador.turnoEnQueSeBajo === null) {
    return fallo("NO_TE_HAS_BAJADO", "solo puedes pegar después de bajarte");
  }
  if (jugador.turnoEnQueSeBajo === estado.turno.numero) {
    return fallo("PEGAR_MISMO_TURNO", "no puedes pegar en el mismo turno en que te bajaste");
  }
  const carta = jugador.mano.find((c) => c.id === cartaId);
  if (carta === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaId} no está en tu mano`);
  }
  const objetivo = estado.mesa[mesaIdx];
  if (objetivo === undefined) {
    return fallo("COMBINACION_INEXISTENTE", "esa combinación no está en la mesa");
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  const { combinacion } = objetivo;
  if (esComodin(carta)) {
    if (combinacion.tipo === "escalaReal") {
      return fallo("PEGAR_INVALIDO", "la escala real no admite comodines");
    }
    if (contarComodines(combinacion.cartas) + 1 > contrato.comodinesPorCombinacion) {
      return fallo(
        "PEGAR_INVALIDO",
        `máximo ${contrato.comodinesPorCombinacion} comodín(es) por combinación`,
      );
    }
  }
  // Comodín-de-pinta (Rumble/GUASON): máx 1 por combinación, prohibido en real.
  if (esComodinDePinta(carta)) {
    if (combinacion.tipo === "escalaReal") {
      return fallo("PEGAR_INVALIDO", "la escala real no admite comodines de pinta");
    }
    if (contarComodinesDePinta(combinacion.cartas) + 1 > 1) {
      return fallo("PEGAR_INVALIDO", "máximo un comodín de pinta por combinación");
    }
  }
  let nuevasCartas: Carta[] | null = null;
  if (combinacion.tipo === "trio") {
    if (!esCualquierComodin(carta)) {
      const valor = valorDeTrio(combinacion.cartas);
      if (valor === null || carta.valor !== valor) {
        return fallo(
          "PEGAR_INVALIDO",
          `${describirCarta(carta)} no coincide con el número del trío`,
        );
      }
    }
    nuevasCartas = [...combinacion.cartas, carta];
  } else if (combinacion.tipo === "escala") {
    nuevasCartas = extenderEscala(combinacion.cartas, carta, extremo);
    if (nuevasCartas === null) {
      return fallo(
        "PEGAR_INVALIDO",
        `${describirCarta(carta)} no extiende la escala por ninguno de sus extremos`,
      );
    }
  } else {
    return fallo("PEGAR_INVALIDO", "no se puede pegar a una escala sucia o real");
  }
  const cartasFinales = nuevasCartas;
  const mesa = estado.mesa.map((enMesa, idx) =>
    idx === mesaIdx
      ? { ...enMesa, combinacion: { ...enMesa.combinacion, cartas: cartasFinales } }
      : enMesa,
  );
  const manoRestante = jugador.mano.filter((c) => c.id !== cartaId);
  const nuevo: EstadoPartida = {
    ...estado,
    mesa,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
    })),
  };
  if (manoRestante.length === 0) {
    return exito(cerrarMano(nuevo, jugadorId));
  }
  return exito(nuevo);
}

/**
 * Descartar (§5): termina el turno. Prohibido descartar comodín salvo en
 * manos donde no se permiten comodines (§3, en los datos:
 * comodinesPorCombinacion === 0).
 */
export function descartar(
  estado: EstadoPartida,
  jugadorId: string,
  cartaId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  const carta = jugador.mano.find((c) => c.id === cartaId);
  if (carta === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaId} no está en tu mano`);
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  if (esCualquierComodin(carta) && contrato.comodinesPorCombinacion > 0) {
    return fallo("COMODIN_AL_POZO", "no puedes descartar un comodín en esta mano");
  }
  const manoRestante = jugador.mano.filter((c) => c.id !== cartaId);
  const base: EstadoPartida = {
    ...estado,
    pozo: [...estado.pozo, carta],
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
    })),
  };
  if (manoRestante.length === 0) {
    return exito(cerrarMano(base, jugadorId));
  }
  const idx = estado.jugadores.findIndex((j) => j.id === jugadorId);
  const siguiente = estado.jugadores[(idx + 1) % estado.jugadores.length];
  if (siguiente === undefined) {
    return fallo("JUGADORES_INVALIDOS", "no hay jugador siguiente");
  }
  return exito({
    ...base,
    turno: {
      jugadorId: siguiente.id,
      fase: "robar",
      numero: estado.turno.numero + 1,
    },
  });
}

/**
 * Pasar el turno (sin jugar): avanza al jugador siguiente como hace el final de
 * `descartar`, pero SIN mover cartas. El servidor la usa para saltar a un
 * jugador ausente; no altera reglas de combinaciones ni puntaje. Las cartas en
 * mano del saltado se cuentan normalmente al cerrar la mano.
 */
export function pasarTurno(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  if (estado.fase !== "jugandoMano") {
    return fallo("FASE_INCORRECTA", "no hay una mano en curso");
  }
  if (estado.turno.jugadorId !== jugadorId) {
    return fallo("NO_ES_TU_TURNO", "no es tu turno");
  }
  const idx = estado.jugadores.findIndex((j) => j.id === jugadorId);
  const siguiente = estado.jugadores[(idx + 1) % estado.jugadores.length];
  if (siguiente === undefined) {
    return fallo("JUGADORES_INVALIDOS", "no hay jugador siguiente");
  }
  return exito({
    ...estado,
    turno: {
      jugadorId: siguiente.id,
      fase: "robar",
      numero: estado.turno.numero + 1,
    },
  });
}

// === Costuras aditivas para modos (Rumble) ================================
// Funciones puras NUEVAS que amplían el motor SIN cambiar ninguna regla base:
// robo/cierre/misión normales siguen idénticos. Todas preservan el invariante de
// multiset del mazo (mazo ∪ pozo ∪ manos ∪ mesa se conserva). Las consume el
// MotorRumble (Sesión 2); ver SPIKE_RUMBLE.md §2 y REGLAS_RUMBLE.md.

/** Carta objetivo para sesgar el robo (DECRETALO): casa solo cartas normales. */
export interface ObjetivoCarta {
  readonly pinta?: Pinta;
  readonly valor?: ValorCarta;
}

function existeJugador(estado: EstadoPartida, jugadorId: string): boolean {
  return estado.jugadores.some((j) => j.id === jugadorId);
}

function cartaCasaObjetivo(carta: Carta, objetivo: ObjetivoCarta): boolean {
  if (carta.tipo !== "normal") return false;
  if (objetivo.pinta !== undefined && carta.pinta !== objetivo.pinta) return false;
  if (objetivo.valor !== undefined && carta.valor !== objetivo.valor) return false;
  return true;
}

/**
 * DECRETALO — robo del mazo sesgado hacia `objetivo`. Con probabilidad
 * `probabilidad` (0.25 por defecto, PROVISIONAL §3.1), si hay una carta normal que
 * casa con el objetivo en el mazo, se roba ESA (desde donde esté); si no, roba la
 * cima como el robo normal. El sesgo es preferencia, no garantía. NO altera
 * `robarDelMazo`.
 */
export function robarDelMazoSesgado(
  estado: EstadoPartida,
  jugadorId: string,
  objetivo: ObjetivoCarta,
  rng: GeneradorAleatorio,
  probabilidad = 0.25,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  let mazo = [...estado.mazo];
  let pozo = [...estado.pozo];
  if (mazo.length === 0) {
    const repuesto = reponerMazoDesdePozo(pozo);
    mazo = repuesto.mazo;
    pozo = repuesto.pozo;
  }
  const cartaSesgada =
    rng() < probabilidad
      ? (() => {
          const idx = mazo.findIndex((c) => cartaCasaObjetivo(c, objetivo));
          return idx === -1 ? undefined : mazo.splice(idx, 1)[0];
        })()
      : undefined;
  const carta = cartaSesgada ?? mazo.pop();
  if (carta === undefined) {
    return fallo("MAZO_VACIO", "no quedan cartas para robar");
  }
  return exito({
    ...estado,
    mazo,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

/**
 * JUDIO — roba una carta ARBITRARIA del pozo por id (no solo la cima). Rompe la
 * regla base "solo la última del pozo"; el motor la limita a 1 uso/ronda y avisa al
 * resto (transparencia §3.1). `robarDelPozo` (cima) no se toca.
 */
export function robarDelPozoPorId(
  estado: EstadoPartida,
  jugadorId: string,
  cartaId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  const idx = estado.pozo.findIndex((c) => c.id === cartaId);
  if (idx === -1) {
    return fallo("CARTA_NO_ESTA_EN_POZO", `la carta ${cartaId} no está en el pozo`);
  }
  const pozo = [...estado.pozo];
  const carta = pozo.splice(idx, 1)[0];
  if (carta === undefined) {
    return fallo("POZO_VACIO", "el pozo está vacío");
  }
  return exito({
    ...estado,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

/**
 * GINYU — intercambia por completo las manos de dos jugadores. Sin RNG; el multiset
 * total no cambia (solo se permutan los dueños). El motor la restringe a la ventana
 * de 3 turnos y a un objetivo aleatorio (§3.2).
 */
export function intercambiarManos(
  estado: EstadoPartida,
  idA: string,
  idB: string,
): Resultado<EstadoPartida> {
  if (idA === idB) {
    return fallo("JUGADOR_DESCONOCIDO", "no se puede intercambiar la mano consigo mismo");
  }
  const a = estado.jugadores.find((j) => j.id === idA);
  const b = estado.jugadores.find((j) => j.id === idB);
  if (a === undefined || b === undefined) {
    return fallo("JUGADOR_DESCONOCIDO", "jugador desconocido en el intercambio");
  }
  const manoA = a.mano;
  const manoB = b.mano;
  return exito({
    ...estado,
    jugadores: estado.jugadores.map((j) => {
      if (j.id === idA) return { ...j, mano: manoB };
      if (j.id === idB) return { ...j, mano: manoA };
      return j;
    }),
  });
}

/**
 * CHATO / MATO-propia — reparte de nuevo la mano de un jugador: sus cartas vuelven al
 * mazo, se rebaraja y se le reparte la MISMA cantidad. El mazo crece con la mano
 * antes de repartir, así que siempre alcanza. Conserva el multiset total.
 */
export function resetearManoJugador(
  estado: EstadoPartida,
  jugadorId: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (jugador === undefined) {
    return fallo("JUGADOR_DESCONOCIDO", `no existe el jugador ${jugadorId}`);
  }
  const cantidad = jugador.mano.length;
  const mazoConMano = barajar([...estado.mazo, ...jugador.mano], rng);
  // La cima del mazo es el último elemento: la mano nueva sale de la cola.
  const manoNueva = mazoConMano.slice(mazoConMano.length - cantidad);
  const mazo = mazoConMano.slice(0, mazoConMano.length - cantidad);
  return exito({
    ...estado,
    mazo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoNueva,
    })),
  });
}

/**
 * TROLL (costura genérica) — resetea SOLO las cartas indicadas de la mano de un
 * jugador: se quitan de su mano, vuelven al mazo, se rebaraja y se le reparte esa
 * misma cantidad. El descubrimiento de qué cartas forman tríos/escalas se decide en
 * el motor (Sesión 2). Conserva el multiset total.
 */
export function resetearCartasDeMano(
  estado: EstadoPartida,
  jugadorId: string,
  cartaIds: readonly string[],
  rng: GeneradorAleatorio,
): Resultado<EstadoPartida> {
  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (jugador === undefined) {
    return fallo("JUGADOR_DESCONOCIDO", `no existe el jugador ${jugadorId}`);
  }
  const aReset = new Set(cartaIds);
  const salientes = jugador.mano.filter((c) => aReset.has(c.id));
  if (salientes.length !== aReset.size) {
    return fallo("CARTA_NO_ESTA_EN_MANO", "alguna carta a resetear no está en la mano");
  }
  const cantidad = salientes.length;
  const manoRestante = jugador.mano.filter((c) => !aReset.has(c.id));
  const mazoConSalientes = barajar([...estado.mazo, ...salientes], rng);
  const nuevas = mazoConSalientes.slice(mazoConSalientes.length - cantidad);
  const mazo = mazoConSalientes.slice(0, mazoConSalientes.length - cantidad);
  return exito({
    ...estado,
    mazo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...manoRestante, ...nuevas],
    })),
  });
}

/**
 * PILLO — transfiere una carta concreta de la mano de un jugador a la de otro.
 * Conserva el multiset total (solo cambia de dueño). El motor decide la mecánica de
 * acierto/fallo (§3.3).
 */
export function transferirCarta(
  estado: EstadoPartida,
  deId: string,
  aId: string,
  cartaId: string,
): Resultado<EstadoPartida> {
  if (deId === aId) {
    return fallo("JUGADOR_DESCONOCIDO", "origen y destino no pueden ser el mismo jugador");
  }
  const origen = estado.jugadores.find((j) => j.id === deId);
  const destino = estado.jugadores.find((j) => j.id === aId);
  if (origen === undefined || destino === undefined) {
    return fallo("JUGADOR_DESCONOCIDO", "jugador desconocido en la transferencia");
  }
  const carta = origen.mano.find((c) => c.id === cartaId);
  if (carta === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaId} no está en la mano de ${deId}`);
  }
  return exito({
    ...estado,
    jugadores: estado.jugadores.map((j) => {
      if (j.id === deId) return { ...j, mano: j.mano.filter((c) => c.id !== cartaId) };
      if (j.id === aId) return { ...j, mano: [...j.mano, carta] };
      return j;
    }),
  });
}

/**
 * GUASON — reemplaza una carta de la mano propia por un COMODÍN tomado del mazo. La
 * carta saliente (por id, o elegida al azar por `rng` si se omite) vuelve al mazo; a
 * cambio entra un comodín que estaba en el mazo. Falla con SIN_COMODINES si el mazo
 * no tiene ninguno. Conserva el multiset total.
 *
 * Nota de modelo: los comodines de Carioca NO tienen pinta (carta.ts), así que la
 * "pinta elegida" de la habilidad es cosmética — el comodín ya actúa como cualquier
 * pinta. El motor puede recordar la pinta pedida solo para la presentación.
 */
export function reemplazarCartaPorComodin(
  estado: EstadoPartida,
  jugadorId: string,
  rng: GeneradorAleatorio,
  cartaIdSaliente?: string,
): Resultado<EstadoPartida> {
  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (jugador === undefined) {
    return fallo("JUGADOR_DESCONOCIDO", `no existe el jugador ${jugadorId}`);
  }
  const idxComodin = estado.mazo.findIndex((c) => c.tipo === "comodin");
  if (idxComodin === -1) {
    return fallo("SIN_COMODINES", "no quedan comodines en el mazo");
  }
  let idxSaliente: number;
  if (cartaIdSaliente !== undefined) {
    idxSaliente = jugador.mano.findIndex((c) => c.id === cartaIdSaliente);
    if (idxSaliente === -1) {
      return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaIdSaliente} no está en tu mano`);
    }
  } else {
    if (jugador.mano.length === 0) {
      return fallo("CARTA_NO_ESTA_EN_MANO", "la mano está vacía");
    }
    idxSaliente = Math.floor(rng() * jugador.mano.length);
  }
  const saliente = jugador.mano[idxSaliente];
  const comodin = estado.mazo[idxComodin];
  if (saliente === undefined || comodin === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", "no se pudo reemplazar la carta");
  }
  // El comodín sale del mazo; la carta saliente entra al mazo (por la cima).
  const mazo = estado.mazo.filter((_, i) => i !== idxComodin).concat(saliente);
  const mano = jugador.mano.map((c, i) => (i === idxSaliente ? comodin : c));
  return exito({
    ...estado,
    mazo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({ ...j, mano })),
  });
}

/**
 * EXTRA — roba DOS cartas del mazo en un mismo turno (fase "robar" → "descartar").
 * Repone desde el pozo si el mazo se agota entre medio. El motor aplica la
 * penalización (descartar 2 o perder el próximo turno, §3.3/§6.7). Una variante que
 * mezcle mazo/pozo queda para la Sesión 2.
 */
export function robarDobleDelMazo(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "robar");
  if (error !== null) return { ok: false, error };
  let mazo = [...estado.mazo];
  let pozo = [...estado.pozo];
  const robadas: Carta[] = [];
  for (let i = 0; i < 2; i++) {
    if (mazo.length === 0) {
      const repuesto = reponerMazoDesdePozo(pozo);
      mazo = repuesto.mazo;
      pozo = repuesto.pozo;
    }
    const carta = mazo.pop();
    if (carta === undefined) {
      return fallo("MAZO_VACIO", "no quedan cartas para robar");
    }
    robadas.push(carta);
  }
  return exito({
    ...estado,
    mazo,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, ...robadas],
    })),
    turno: { ...estado.turno, fase: "descartar" },
  });
}

/**
 * EXTRA (penalización "descartar 2") — descarta una carta al pozo SIN avanzar el
 * turno (queda en fase "descartar"). Complementa a `descartar`, que sí pasa el turno:
 * el motor la usa para el descarte EXTRA de penalización, y luego el jugador cierra el
 * turno con un `descartar` normal. No permite vaciar la mano (el cierre lo hace el
 * descarte normal). Mismas reglas de comodín que `descartar`. Conserva el multiset.
 */
export function descartarExtra(
  estado: EstadoPartida,
  jugadorId: string,
  cartaId: string,
): Resultado<EstadoPartida> {
  const error = validarAccion(estado, jugadorId, "descartar");
  if (error !== null) return { ok: false, error };
  const jugador = jugadorActual(estado);
  if (jugador === undefined) {
    return fallo("JUGADORES_INVALIDOS", "jugador desconocido");
  }
  const carta = jugador.mano.find((c) => c.id === cartaId);
  if (carta === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaId} no está en tu mano`);
  }
  const contrato = contratoActual(estado);
  if (contrato === undefined) {
    return fallo("MANO_DESCONOCIDA", `no existe la mano ${estado.manoActual}`);
  }
  if (esCualquierComodin(carta) && contrato.comodinesPorCombinacion > 0) {
    return fallo("COMODIN_AL_POZO", "no puedes descartar un comodín en esta mano");
  }
  const manoRestante = jugador.mano.filter((c) => c.id !== cartaId);
  if (manoRestante.length === 0) {
    return fallo("CONTRATO_INVALIDO", "el descarte extra no puede dejarte sin cartas");
  }
  return exito({
    ...estado,
    pozo: [...estado.pozo, carta],
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: manoRestante,
    })),
  });
}

/**
 * OJO (compensación) — entrega la carta superior del mazo a un jugador SIN cambiar el
 * turno ni la fase. La usa el motor cuando OJO salta el turno del que iba a cerrar,
 * dándole 1 carta extra de compensación (§3.1). Repone del pozo si el mazo está
 * vacío. Conserva el multiset.
 */
export function entregarCartaDelMazo(
  estado: EstadoPartida,
  jugadorId: string,
): Resultado<EstadoPartida> {
  if (!existeJugador(estado, jugadorId)) {
    return fallo("JUGADOR_DESCONOCIDO", `no existe el jugador ${jugadorId}`);
  }
  let mazo = [...estado.mazo];
  let pozo = [...estado.pozo];
  if (mazo.length === 0) {
    const repuesto = reponerMazoDesdePozo(pozo);
    mazo = repuesto.mazo;
    pozo = repuesto.pozo;
  }
  const carta = mazo.pop();
  if (carta === undefined) {
    return fallo("MAZO_VACIO", "no quedan cartas para la compensación");
  }
  return exito({
    ...estado,
    mazo,
    pozo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({
      ...j,
      mano: [...j.mano, carta],
    })),
  });
}

/**
 * TOCO — bajarse validando contra una MISIÓN alterna por jugador en vez del contrato
 * de la mano. Misma mecánica que `bajarse` (robar antes, una vez por mano,
 * cumplimiento exacto); solo cambia el contrato objetivo. El motor genera la misión.
 */
export function bajarseConContrato(
  estado: EstadoPartida,
  jugadorId: string,
  propuesta: readonly PropuestaCombinacion[],
  contrato: ContratoMano,
): Resultado<EstadoPartida> {
  return bajarseInterno(estado, jugadorId, propuesta, contrato);
}

/**
 * EXODIA — cierre de mano forzado por una condición externa (p. ej. bajarse dentro
 * de los 3 primeros turnos), aunque al ganador le queden cartas. Expone el cierre
 * interno con una guarda: puntúa como el cierre normal (el ganador suma 0, el resto
 * sus cartas). El motor decide CUÁNDO se cumple la condición (ventana B1).
 */
export function cerrarManoManual(
  estado: EstadoPartida,
  ganadorId: string,
): Resultado<EstadoPartida> {
  if (estado.fase !== "jugandoMano") {
    return fallo("FASE_INCORRECTA", "no hay una mano en curso");
  }
  if (!existeJugador(estado, ganadorId)) {
    return fallo("JUGADOR_DESCONOCIDO", `no existe el jugador ${ganadorId}`);
  }
  return exito(cerrarMano(estado, ganadorId));
}

/** Todas las cartas presentes en el estado (mazo ∪ pozo ∪ manos ∪ mesa). */
function todasLasCartas(estado: EstadoPartida): readonly Carta[] {
  return [
    ...estado.mazo,
    ...estado.pozo,
    ...estado.jugadores.flatMap((j) => j.mano),
    ...estado.mesa.flatMap((m) => m.combinacion.cartas),
  ];
}

/** Índice único para un comodín-de-pinta nuevo de `pinta` dentro del estado. */
function siguienteIndiceComodinPinta(
  estado: EstadoPartida,
  pinta: Pinta,
): number {
  let max = -1;
  for (const carta of todasLasCartas(estado)) {
    if (carta.tipo === "comodinPinta" && carta.pinta === pinta) {
      const n = Number(carta.id.slice(carta.id.lastIndexOf("-") + 1));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * GUASON (Rumble, §3.2 REGLAS_RUMBLE.md) — ACUÑA un comodín-de-pinta NUEVO de `pinta`
 * y reemplaza con él una carta de la mano propia (por id, o al azar por `rng` si se
 * omite). La carta saliente vuelve al FONDO del mazo (§8.5), donde seguirá en
 * circulación.
 *
 * ⚠️ EXCEPCIÓN ÚNICA AL INVARIANTE DE MULTISET. A diferencia de TODAS las demás
 * costuras (que conservan mazo ∪ pozo ∪ manos ∪ mesa), esta mete al juego una carta
 * que NO existía: el comodín-de-pinta acuñado. Es la única ruptura deliberada del
 * invariante, y está aislada aquí y documentada. Por eso NO usa `reemplazarCartaPorComodin`
 * (que saca un comodín finito del mazo) y el modo de fallo SIN_COMODINES NO aplica.
 */
export function acunarComodinDePinta(
  estado: EstadoPartida,
  jugadorId: string,
  pinta: Pinta,
  rng: GeneradorAleatorio,
  cartaIdSaliente?: string,
): Resultado<EstadoPartida> {
  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (jugador === undefined) {
    return fallo("JUGADOR_DESCONOCIDO", `no existe el jugador ${jugadorId}`);
  }
  if (jugador.mano.length === 0) {
    return fallo("CARTA_NO_ESTA_EN_MANO", "la mano está vacía");
  }
  let idxSaliente: number;
  if (cartaIdSaliente !== undefined) {
    idxSaliente = jugador.mano.findIndex((c) => c.id === cartaIdSaliente);
    if (idxSaliente === -1) {
      return fallo("CARTA_NO_ESTA_EN_MANO", `la carta ${cartaIdSaliente} no está en tu mano`);
    }
  } else {
    idxSaliente = Math.floor(rng() * jugador.mano.length);
  }
  const saliente = jugador.mano[idxSaliente];
  if (saliente === undefined) {
    return fallo("CARTA_NO_ESTA_EN_MANO", "no se pudo reemplazar la carta");
  }
  const comodin = crearComodinDePinta(
    pinta,
    siguienteIndiceComodinPinta(estado, pinta),
  );
  // Acuñado: la carta saliente va al FONDO del mazo (la cima es el último elemento,
  // así que el fondo es el índice 0). El comodín-de-pinta es la carta net-nueva.
  const mazo = [saliente, ...estado.mazo];
  const mano = jugador.mano.map((c, i) => (i === idxSaliente ? comodin : c));
  return exito({
    ...estado,
    mazo,
    jugadores: conManoActualizada(estado, jugadorId, (j) => ({ ...j, mano })),
  });
}
