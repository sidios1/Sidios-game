// Estado compartido de la partida (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §1.1, §2,
// §3, §3.3, §4, §5, §6) + helpers de plumbing puros. Vive aparte de
// partida.ts porque turnos.ts, economia.ts, descendido.ts,
// cartasPrensaEfectos.ts e intercambios.ts dependen todos de `EstadoMonopoly`
// sin poder importarse entre sí — mismo motivo que resultado.ts, un nivel más
// adentro (estado, no solo errores).
//
// `turnoDeCierre` (ventana de renegociación, §3): `ordenJugadores` es FIJO
// desde `crearPartida` (nunca cambia de tamaño aunque alguien quiebre).
// `turnoGlobal` arranca en 0 y avanza +1 cada vez que la rotación pasa al
// siguiente slot (fin de turno SIN dobles, o salto de un slot en quiebra) —
// NO avanza en un turno extra por dobles (mismo slot). Al comprar directo,
// `turnoDeCierre := turnoGlobal + ordenJugadores.length`: "una vuelta
// completa" es robusto a dobles/saltos intercalados porque N nunca cambia.
// La ventana se cierra cuando `turnoGlobal >= turnoDeCierre`, ANCLADA al
// comprador original (no se reinicia con cada renegociación, literal del
// §3), y sigue corriendo igual si el comprador cae en Descendido en el medio
// (su slot no se saltea: sigue tirando dados cada turno según §4).
//
// `numeroRonda` es un contador APARTE (una vuelta completa de
// `ordenJugadores`) que gatilla el §1.1 "tablero deshabilitado en ronda 1";
// se guarda explícito (no derivado) para claridad en tests.
//
// `terminada` NO se guarda como campo: se deriva en partida.ts como
// `numeroRonda > rondasTotales` (evita estado duplicado que podría
// desincronizarse).

import type { CartaPrensa } from "./cartasPrensa.js";
import type { PoolSobres } from "./fuenteSobres.js";
import type { CartaMiClub } from "./miClub.js";
import type { NombreLiga } from "./tablero.js";

export interface DatosJugador {
  readonly id: string;
  readonly nombre: string;
}

export interface EstadoJugador {
  readonly id: string;
  readonly nombre: string;
  readonly presupuesto: number;
  /** Índice de celda, 0..39. Durante Descendido se fija en 10 (Cárcel), cosmético. */
  readonly posicion: number;
  readonly miClub: readonly CartaMiClub[];
  /** Club-ficha cosmético (§1.1); stub sin validar contra los 207 clubes reales (S2). */
  readonly clubToken: string | null;
  readonly enQuiebra: boolean;
  readonly enDescendido: boolean;
  /** Turnos transcurridos en Descendido, 0..3 (§4). */
  readonly turnosEnDescendido: number;
  /** Carta #1: el próximo sobre comprado cuesta mitad de precio. */
  readonly proximoSobreMitadPrecio: boolean;
  /** Carta #3: turnos completos que se saltea antes de poder tirar de nuevo. */
  readonly turnosAPerder: number;
}

export interface VentanaRenegociacion {
  readonly celdaIndice: number;
  readonly compradorOriginalId: string;
  readonly titularActualId: string;
  /** Id de la CartaMiClub en juego (para transferirla en `forzarCompra`). */
  readonly cartaId: string;
  /** Último precio pagado; la próxima renegociación es el doble de este. */
  readonly precioActual: number;
  readonly turnoDeCierre: number;
}

export interface SubastaEnCurso {
  readonly celdaIndice: number;
  readonly jugadorQueDeclino: string;
  /** Preservado del `tirarDados` que originó el aterrizaje, para finalizar el segmento al resolver. */
  readonly fueDoble: boolean;
  readonly pujaActual: { readonly jugadorId: string; readonly monto: number } | null;
  readonly jugadoresPasados: readonly string[];
}

/** De dónde sale el sobre que falta abrir tras una subasta o la carta #13. */
export type OrigenSobrePendiente =
  | { readonly clase: "celda"; readonly celdaIndice: number }
  | { readonly clase: "liga"; readonly liga: NombreLiga };

export type DetalleDecisionPendiente =
  | { readonly tipo: "compraODeclina"; readonly celdaIndice: number }
  | {
      readonly tipo: "elegirPosicionSobre";
      readonly origen: OrigenSobrePendiente;
      readonly sobresRestantes: number;
    }
  | { readonly tipo: "elegirRoboPrensa" }
  | { readonly tipo: "elegirCambioAgente" }
  | { readonly tipo: "elegirLigaDobleFichaje" };

/**
 * Bloquea el avance del turno hasta que `jugadorId` (no siempre
 * `jugadorEnTurno`: el ganador de una subasta puede ser otro jugador) resuelva
 * el `detalle`. `fueDoble` es el de la tirada de `jugadorEnTurno` que originó
 * el aterrizaje, preservado para `finalizarSegmentoDeTurno` al resolverse.
 */
export interface DecisionPendiente {
  readonly jugadorId: string;
  readonly fueDoble: boolean;
  readonly detalle: DetalleDecisionPendiente;
}

/** Última tirada de dados de la partida (presentación: animar los dados en el cliente). */
export interface UltimaTirada {
  readonly d1: number;
  readonly d2: number;
  readonly esDoble: boolean;
}

export interface EstadoMonopoly {
  readonly jugadores: readonly EstadoJugador[];
  /** Orden de turnos (ids), FIJO desde `crearPartida`; nunca se redimensiona. */
  readonly ordenJugadores: readonly string[];
  readonly indiceRotacion: number;
  readonly jugadorEnTurno: string;
  /** Dobles seguidos del jugador en turno actual; se resetea al pasar de jugador. */
  readonly doblesSeguidos: number;
  readonly turnoGlobal: number;
  readonly numeroRonda: number;
  readonly rondasTotales: number;
  readonly palcoDelClub: number;
  readonly mazoPrensa: readonly CartaPrensa[];
  /** Ventanas de renegociación abiertas, por índice de celda. */
  readonly ventanasAbiertas: Readonly<Record<number, VentanaRenegociacion>>;
  readonly subastaEnCurso: SubastaEnCurso | null;
  readonly decisionPendiente: DecisionPendiente | null;
  /** Contador para ids opacos de `CartaMiClub`; no es aleatorio. */
  readonly siguienteCartaId: number;
  readonly pool: PoolSobres;
  /**
   * `jugadorId` (§9) de cada futbolista real ya sorteado en esta partida,
   * sin importar con qué posición salió. Se consulta antes de cada sorteo
   * (`excluirYaSorteados` en muestreo.ts) para que no vuelva a salir.
   */
  readonly jugadoresRealesSorteados: readonly string[];
  /** Última tirada, para el cliente (presentación); null/ausente si aún no se tiró ninguna. No se limpia al fin de turno. */
  readonly ultimaTirada?: UltimaTirada | null;
}

// ── Plumbing interno (puro, sin Resultado) ─────────────────────────────────

export function jugadorDe(estado: EstadoMonopoly, jugadorId: string): EstadoJugador {
  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (jugador === undefined) {
    throw new Error(`invariante violada: jugador desconocido "${jugadorId}"`);
  }
  return jugador;
}

export function conJugador(
  estado: EstadoMonopoly,
  jugadorId: string,
  cambios: Partial<EstadoJugador>,
): EstadoMonopoly {
  return {
    ...estado,
    jugadores: estado.jugadores.map((j) => (j.id === jugadorId ? { ...j, ...cambios } : j)),
  };
}

/** Deduce del presupuesto; marca `enQuiebra` si queda en 0 o negativo (§3.3, inmediata). */
export function cobrar(estado: EstadoMonopoly, jugadorId: string, monto: number): EstadoMonopoly {
  const jugador = jugadorDe(estado, jugadorId);
  const nuevoPresupuesto = jugador.presupuesto - monto;
  return conJugador(estado, jugadorId, {
    presupuesto: nuevoPresupuesto,
    enQuiebra: jugador.enQuiebra || nuevoPresupuesto <= 0,
  });
}

export function pagarAJugador(
  estado: EstadoMonopoly,
  jugadorId: string,
  monto: number,
): EstadoMonopoly {
  const jugador = jugadorDe(estado, jugadorId);
  return conJugador(estado, jugadorId, { presupuesto: jugador.presupuesto + monto });
}

export function alPalco(estado: EstadoMonopoly, monto: number): EstadoMonopoly {
  return { ...estado, palcoDelClub: estado.palcoDelClub + monto };
}

/** Se lleva el pozo del Palco del Club y lo vacía (§2, esquina Parqueo Gratis). */
export function cobrarDelPalco(estado: EstadoMonopoly, jugadorId: string): EstadoMonopoly {
  const monto = estado.palcoDelClub;
  return { ...pagarAJugador(estado, jugadorId, monto), palcoDelClub: 0 };
}

/** §6: termina al superar las rondas fijas que definió el host. */
export function estaTerminada(estado: EstadoMonopoly): boolean {
  return estado.numeroRonda > estado.rondasTotales;
}

/** Quita una ventana de renegociación cerrada del mapa (rehabilita la celda, §3). */
export function sinVentana(
  ventanas: Readonly<Record<number, VentanaRenegociacion>>,
  celdaIndice: number,
): Readonly<Record<number, VentanaRenegociacion>> {
  const resto: Record<number, VentanaRenegociacion> = { ...ventanas };
  delete resto[celdaIndice];
  return resto;
}

/** Acuña un id opaco y estable para una `CartaMiClub` nueva (no es aleatorio). */
export function siguienteIdDeCarta(
  estado: EstadoMonopoly,
): { readonly id: string; readonly estado: EstadoMonopoly } {
  return {
    id: `carta-${estado.siguienteCartaId}`,
    estado: { ...estado, siguienteCartaId: estado.siguienteCartaId + 1 },
  };
}
