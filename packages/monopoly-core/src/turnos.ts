// Dados, movimiento, dobles y ronda (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §1.1,
// §2, §2.1). No depende de economia.ts ni de partida.ts: al aterrizar en una
// celda comprable solo deja `decisionPendiente`/`subastaEnCurso` seteado —
// quien resuelve esa compra vive en economia.ts, invocado por el dispatcher
// de partida.ts, que también centraliza el llamado a
// `finalizarSegmentoDeTurno` una vez que la decisión pendiente se resuelve
// (evita un ciclo turnos.ts <-> economia.ts/cartasPrensaEfectos.ts).
//
// Ronda 1 (§1.1): aterrizar en una celda de liga/Resto del Mundo/Técnicos es
// no-op (sin `decisionPendiente`) — la regla habla específicamente de "sobres
// del tablero", no de todo el tablero, así que impuestos/Prensa
// Deportiva/Pausa/esquinas funcionan igual desde la ronda 1 (decisión de esta
// sesión).

import type { GeneradorAleatorio } from "./aleatorio.js";
import { aplicarCartaPrensa } from "./cartasPrensaEfectos.js";
import { robarCartaPrensa } from "./cartasPrensa.js";
import { entrarADescendido, intentarSalirPorDobles } from "./descendido.js";
import { REGLAS_MONOPOLY } from "./reglas.js";
import { error, ok, type Resultado } from "./resultado.js";
import { celdaEn, type CeldaTablero } from "./tablero.js";
import {
  alPalco,
  cobrar,
  cobrarDelPalco,
  conJugador,
  estaTerminada,
  jugadorDe,
  pagarAJugador,
  sinVentana,
  type EstadoMonopoly,
} from "./estado.js";

export interface ResultadoTirada {
  readonly d1: number;
  readonly d2: number;
  readonly esDoble: boolean;
  readonly suma: number;
}

export function tirarDosDados(rng: GeneradorAleatorio): ResultadoTirada {
  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  return { d1, d2, esDoble: d1 === d2, suma: d1 + d2 };
}

/** Mueve `pasos` celdas (puede ser negativo); cobra Nueva Temporada si CRUZA el 0 avanzando (§2). */
export function avanzar(estado: EstadoMonopoly, jugadorId: string, pasos: number): EstadoMonopoly {
  const jugador = jugadorDe(estado, jugadorId);
  const nuevaPosicion = (((jugador.posicion + pasos) % 40) + 40) % 40;
  const cruzaSalida = pasos > 0 && jugador.posicion + pasos >= 40;
  const movido = conJugador(estado, jugadorId, { posicion: nuevaPosicion });
  return cruzaSalida ? pagarAJugador(movido, jugadorId, REGLAS_MONOPOLY.nuevaTemporadaMonto) : movido;
}

/** Acción pública: tira, mueve, resuelve la celda de aterrizaje o deja `decisionPendiente`. */
export function tirarDados(
  estado: EstadoMonopoly,
  jugadorId: string,
  rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (jugadorId !== estado.jugadorEnTurno) return error("NO_ES_TU_TURNO", "no es tu turno");
  if (estado.decisionPendiente !== null) {
    return error("ACCION_NO_ESPERADA", "hay una decisión pendiente antes de tirar");
  }
  if (estado.subastaEnCurso !== null) {
    return error("ACCION_NO_ESPERADA", "hay una subasta en curso antes de tirar");
  }
  const jugador = jugadorDe(estado, jugadorId);
  if (jugador.enQuiebra) return error("JUGADOR_EN_QUIEBRA", "estás en quiebra");

  const tirada = tirarDosDados(rng);
  const conTirada: EstadoMonopoly = {
    ...estado,
    ultimaTirada: { d1: tirada.d1, d2: tirada.d2, esDoble: tirada.esDoble },
  };

  if (jugador.enDescendido) {
    const { estado: est2, salio } = intentarSalirPorDobles(conTirada, jugadorId, tirada, rng);
    if (!salio) {
      return ok(finalizarSegmentoDeTurno(est2, jugadorId, false));
    }
    // Sale y se mueve esa misma tirada; SIN bono de turno extra (convención clásica).
    const movido = avanzar(est2, jugadorId, tirada.suma);
    const celdaDestino = celdaEn(jugadorDe(movido, jugadorId).posicion);
    const resuelto = resolverAterrizaje(movido, jugadorId, celdaDestino, false, rng);
    if (resuelto.decisionPendiente !== null || resuelto.subastaEnCurso !== null) return ok(resuelto);
    return ok(finalizarSegmentoDeTurno(resuelto, jugadorId, false));
  }

  const nuevoDoblesSeguidos = tirada.esDoble ? estado.doblesSeguidos + 1 : 0;
  if (tirada.esDoble && nuevoDoblesSeguidos >= REGLAS_MONOPOLY.doblesSeguidosParaDescendido) {
    // 3 dobles seguidos: Descendido directo, SIN aplicar el movimiento del 3er dado (§2.1).
    const enviado = entrarADescendido(conTirada, jugadorId);
    return ok(finalizarSegmentoDeTurno({ ...enviado, doblesSeguidos: 0 }, jugadorId, false));
  }

  const conDobles: EstadoMonopoly = { ...conTirada, doblesSeguidos: nuevoDoblesSeguidos };
  const movido = avanzar(conDobles, jugadorId, tirada.suma);
  const celdaDestino = celdaEn(jugadorDe(movido, jugadorId).posicion);
  const resuelto = resolverAterrizaje(movido, jugadorId, celdaDestino, tirada.esDoble, rng);
  if (resuelto.decisionPendiente !== null || resuelto.subastaEnCurso !== null) return ok(resuelto);
  return ok(finalizarSegmentoDeTurno(resuelto, jugadorId, tirada.esDoble));
}

function resolverAterrizaje(
  estado: EstadoMonopoly,
  jugadorId: string,
  celda: CeldaTablero,
  fueDoble: boolean,
  rng: GeneradorAleatorio,
): EstadoMonopoly {
  switch (celda.tipo) {
    case "salida":
    case "carcel":
      return estado;

    case "palcoDelClub":
      return cobrarDelPalco(estado, jugadorId);

    case "descensoALaB":
      return entrarADescendido(estado, jugadorId);

    case "multaDoping":
    case "multaApuestas":
      return alPalco(cobrar(estado, jugadorId, celda.monto), celda.monto);

    case "pausaDeHidratacion":
      return estado;

    case "prensaDeportiva": {
      const { carta, mazo } = robarCartaPrensa(estado.mazoPrensa);
      const conMazo: EstadoMonopoly = { ...estado, mazoPrensa: mazo };
      const { estado: est2, movimiento } = aplicarCartaPrensa(conMazo, jugadorId, carta, fueDoble, rng);
      if (movimiento === null) return est2;
      if (movimiento.tipo === "avanzarASalida") {
        const movidoASalida = conJugador(est2, jugadorId, { posicion: 0 });
        return pagarAJugador(movidoASalida, jugadorId, REGLAS_MONOPOLY.nuevaTemporadaMonto);
      }
      // Retrocede SIN bono, aunque cruce el 0 (§ convención clásica); encadena la celda destino.
      const jugador = jugadorDe(est2, jugadorId);
      const nuevaPos = (((jugador.posicion - movimiento.cantidad) % 40) + 40) % 40;
      const movido = conJugador(est2, jugadorId, { posicion: nuevaPos });
      return resolverAterrizaje(movido, jugadorId, celdaEn(nuevaPos), fueDoble, rng);
    }

    case "liga":
    case "restoDelMundo":
    case "tecnicos": {
      if (estado.numeroRonda < REGLAS_MONOPOLY.rondaActivacionTablero) return estado;
      const ventana = estado.ventanasAbiertas[celda.indice];
      const ventanaActiva = ventana !== undefined && estado.turnoGlobal < ventana.turnoDeCierre;
      if (ventanaActiva) return estado; // sigue en ventana: forzarCompra es una acción libre aparte
      // Ventana cerrada (o inexistente): rehabilita la celda para un sobre nuevo (§3).
      const limpio =
        ventana !== undefined
          ? { ...estado, ventanasAbiertas: sinVentana(estado.ventanasAbiertas, celda.indice) }
          : estado;
      return {
        ...limpio,
        decisionPendiente: {
          jugadorId,
          fueDoble,
          detalle: { tipo: "compraODeclina", celdaIndice: celda.indice },
        },
      };
    }
  }
}

/**
 * Decide turno extra (dobles: mismo slot) o avanza la rotación. Se llama al
 * final de `tirarDados` cuando no queda nada pendiente, o desde el
 * dispatcher de partida.ts al resolverse por completo una decisión
 * pendiente/subasta (con el `fueDoble` original preservado en esa decisión).
 */
export function finalizarSegmentoDeTurno(
  estado: EstadoMonopoly,
  jugadorId: string,
  fueDoble: boolean,
): EstadoMonopoly {
  if (fueDoble) return estado; // mismo jugador, mismo slot: turnoGlobal no avanza
  void jugadorId; // documental: siempre coincide con estado.jugadorEnTurno
  return avanzarRotacion(estado);
}

function avanzarRotacion(estado: EstadoMonopoly): EstadoMonopoly {
  const n = estado.ordenJugadores.length;
  let indice = estado.indiceRotacion;
  let turnoGlobal = estado.turnoGlobal;
  let numeroRonda = estado.numeroRonda;
  let jugadores = estado.jugadores;

  for (let intentos = 0; intentos < n; intentos++) {
    indice = (indice + 1) % n;
    turnoGlobal += 1;
    if (indice === 0) numeroRonda += 1;
    const candidatoId = estado.ordenJugadores[indice];
    if (candidatoId === undefined) continue;
    const candidato = jugadores.find((j) => j.id === candidatoId);
    if (candidato === undefined) continue;
    if (candidato.enQuiebra) continue; // se saltea permanentemente
    if (candidato.turnosAPerder > 0) {
      jugadores = jugadores.map((j) =>
        j.id === candidatoId ? { ...j, turnosAPerder: j.turnosAPerder - 1 } : j,
      );
      continue; // consume un turno perdido (carta #3) y sigue rotando
    }
    return {
      ...estado,
      jugadores,
      indiceRotacion: indice,
      jugadorEnTurno: candidatoId,
      doblesSeguidos: 0,
      turnoGlobal,
      numeroRonda,
    };
  }
  // Caso límite: todos en quiebra o saltados. Deja los contadores avanzados igual.
  return { ...estado, jugadores, indiceRotacion: indice, turnoGlobal, numeroRonda, doblesSeguidos: 0 };
}

/**
 * Salto administrativo (futuro `MotorJuego.saltarTurno`, S3): solo cubre el
 * caso simple de saltar el turno de `jugadorEnTurno` cuando no hay nada
 * pendiente. Si hay una decisión pendiente o una subasta en curso (que puede
 * ser de OTRO jugador, p. ej. el ganador de una subasta), esta función no
 * resuelve nada por su cuenta: eso queda para cuando el servidor (S3) defina
 * su propia política de timeouts.
 */
export function saltarTurno(
  estado: EstadoMonopoly,
  jugadorId: string,
  _rng: GeneradorAleatorio,
): Resultado<EstadoMonopoly> {
  void _rng;
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (jugadorId !== estado.jugadorEnTurno) {
    return error("NO_ES_TU_TURNO", "solo se puede saltar el turno de quien está en turno");
  }
  if (estado.decisionPendiente !== null || estado.subastaEnCurso !== null) {
    return error("ACCION_NO_ESPERADA", "hay algo pendiente que resolver antes de saltar el turno");
  }
  return ok(finalizarSegmentoDeTurno(estado, jugadorId, false));
}
