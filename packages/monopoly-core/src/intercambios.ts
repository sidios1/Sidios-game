// Intercambio libre entre jugadores (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §3:
// "Intercambio entre jugadores: libre, en cualquier momento — dinero y/o
// jugadores, sin restricciones"). Modelado como acción unilateral atómica,
// sin handshake de propuesta/aceptación en dos pasos (esa UX de negociación
// es un problema de servidor/cliente futuro, no de este core). El
// dispatcher de partida.ts la trata como acción LIBRE: no requiere que sea
// el turno de nadie, solo que el motor esté "idle" (sin decisión pendiente
// ni subasta en curso).

import { agregarCarta, buscarCarta, quitarCarta } from "./miClub.js";
import { error, ok, type Resultado } from "./resultado.js";
import { cobrar, conJugador, estaTerminada, pagarAJugador, type EstadoMonopoly } from "./estado.js";

export interface OfertaIntercambio {
  readonly dinero: number;
  readonly cartaIds: readonly string[];
}

export function intercambiar(
  estado: EstadoMonopoly,
  jugadorId: string,
  conJugadorId: string,
  ofrezco: OfertaIntercambio,
  pido: OfertaIntercambio,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  if (jugadorId === conJugadorId) return error("RIVAL_INVALIDO", "no puedes intercambiar contigo mismo");

  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  const rival = estado.jugadores.find((j) => j.id === conJugadorId);
  if (jugador === undefined || rival === undefined) {
    return error("JUGADOR_DESCONOCIDO", "jugador desconocido");
  }
  if (jugador.enQuiebra || rival.enQuiebra) {
    return error("JUGADOR_EN_QUIEBRA", "un jugador en quiebra no puede intercambiar");
  }
  if (ofrezco.dinero < 0 || pido.dinero < 0) {
    return error("OFERTA_INVALIDA", "el dinero ofrecido no puede ser negativo");
  }
  if (ofrezco.dinero > jugador.presupuesto) return error("SALDO_INSUFICIENTE", "no tienes ese dinero");
  if (pido.dinero > rival.presupuesto) return error("SALDO_INSUFICIENTE", "el rival no tiene ese dinero");
  for (const cartaId of ofrezco.cartaIds) {
    if (buscarCarta(jugador.miClub, cartaId) === undefined) {
      return error("CARTA_DESCONOCIDA", "no tienes esa carta en Mi Club");
    }
  }
  for (const cartaId of pido.cartaIds) {
    if (buscarCarta(rival.miClub, cartaId) === undefined) {
      return error("CARTA_DESCONOCIDA", "el rival no tiene esa carta en Mi Club");
    }
  }

  let miClubJugador = jugador.miClub;
  let miClubRival = rival.miClub;

  for (const cartaId of ofrezco.cartaIds) {
    const carta = buscarCarta(miClubJugador, cartaId);
    if (carta === undefined) continue;
    miClubJugador = quitarCarta(miClubJugador, cartaId);
    miClubRival = agregarCarta(miClubRival, carta);
  }
  for (const cartaId of pido.cartaIds) {
    const carta = buscarCarta(miClubRival, cartaId);
    if (carta === undefined) continue;
    miClubRival = quitarCarta(miClubRival, cartaId);
    miClubJugador = agregarCarta(miClubJugador, carta);
  }

  let est = conJugador(estado, jugadorId, { miClub: miClubJugador });
  est = conJugador(est, conJugadorId, { miClub: miClubRival });

  if (ofrezco.dinero > 0) {
    est = pagarAJugador(cobrar(est, jugadorId, ofrezco.dinero), conJugadorId, ofrezco.dinero);
  }
  if (pido.dinero > 0) {
    est = pagarAJugador(cobrar(est, conJugadorId, pido.dinero), jugadorId, pido.dinero);
  }

  return ok(est);
}
