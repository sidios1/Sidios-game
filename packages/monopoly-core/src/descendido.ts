// Descendido (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §4). Entra por caer en
// "Descenso a la B" (llamado desde turnos.ts), por 3 dobles seguidos (llamado
// desde turnos.ts) o por la carta "Descendiste" (llamado desde
// cartasPrensaEfectos.ts) — siempre a través de `entrarADescendido`.
//
// `pagarMultaDescendido` NO consume el turno: solo limpia el estado de
// Descendido. Como el reglamento reskinea el tablero "igual al Monopoly
// clásico", se sigue esa convención para lo que §4 no aclara: pagar la multa
// permite tirar los dados y moverse en el MISMO turno (jugadorEnTurno no
// cambia; el jugador simplemente sigue con `tirarDados` a continuación).
// Documentado como asunción de esta sesión, ya que el reglamento no dice
// explícitamente si pagar consume el turno completo o no.
//
// §3.3 lista "multa de Descendido" entre los pagos obligatorios que pueden
// producir quiebra: `pagarMultaDescendido` siempre permite el intento (vía
// `cobrar`, que marca `enQuiebra` si el saldo queda en 0 o negativo) en vez
// de bloquear el pago por fondos insuficientes — mismo patrón que el resto
// de los pagos obligatorios del core.

import { error, ok, type Resultado } from "./resultado.js";
import type { GeneradorAleatorio } from "./aleatorio.js";
import { elegirCartaAleatoria, quitarCarta } from "./miClub.js";
import { REGLAS_MONOPOLY } from "./reglas.js";
import { alPalco, cobrar, conJugador, estaTerminada, jugadorDe, type EstadoMonopoly } from "./estado.js";

/** Manda a Descendido: fija la posición en la Cárcel (10, cosmético) y resetea el contador. */
export function entrarADescendido(estado: EstadoMonopoly, jugadorId: string): EstadoMonopoly {
  return conJugador(estado, jugadorId, {
    enDescendido: true,
    turnosEnDescendido: 0,
    posicion: 10,
  });
}

/** §4: paga la multa y sale; NO consume el turno (ver nota de cabecera). */
export function pagarMultaDescendido(
  estado: EstadoMonopoly,
  jugadorId: string,
): Resultado<EstadoMonopoly> {
  if (estaTerminada(estado)) return error("PARTIDA_TERMINADA", "la partida ya terminó");
  const jugador = jugadorDe(estado, jugadorId);
  if (jugador.enQuiebra) return error("JUGADOR_EN_QUIEBRA", "estás en quiebra");
  if (!jugador.enDescendido) return error("NO_ESTAS_EN_DESCENDIDO", "no estás en Descendido");

  const monto = REGLAS_MONOPOLY.multaDescendido;
  const cobrado = alPalco(cobrar(estado, jugadorId, monto), monto);
  return ok(conJugador(cobrado, jugadorId, { enDescendido: false, turnosEnDescendido: 0 }));
}

/**
 * Intento de salir tirando dobles (llamado desde turnos.ts al tirar estando
 * en Descendido). NO mueve al jugador ni resuelve la celda de aterrizaje —
 * eso lo hace turnos.ts si `salio` es true, con la MISMA tirada (sin bono de
 * turno extra por el doble usado para escapar, convención de Monopoly
 * clásico). Al 3er intento fallido, pierde una carta aleatoria de Mi Club
 * (vía `elegirCartaAleatoria`; no-op si Mi Club está vacío) y sale forzado
 * sin moverse.
 */
export function intentarSalirPorDobles(
  estado: EstadoMonopoly,
  jugadorId: string,
  tirada: { readonly esDoble: boolean },
  rng: GeneradorAleatorio,
): { readonly estado: EstadoMonopoly; readonly salio: boolean } {
  const jugador = jugadorDe(estado, jugadorId);

  if (tirada.esDoble) {
    const libre = conJugador(estado, jugadorId, { enDescendido: false, turnosEnDescendido: 0 });
    return { estado: libre, salio: true };
  }

  const turnosTranscurridos = jugador.turnosEnDescendido + 1;
  if (turnosTranscurridos >= REGLAS_MONOPOLY.turnosEnDescendidoAntesDePerderJugador) {
    const carta = elegirCartaAleatoria(jugador.miClub, rng);
    const miClubNuevo = carta === undefined ? jugador.miClub : quitarCarta(jugador.miClub, carta.id);
    const liberado = conJugador(estado, jugadorId, {
      enDescendido: false,
      turnosEnDescendido: 0,
      miClub: miClubNuevo,
    });
    return { estado: liberado, salio: false };
  }

  const sigue = conJugador(estado, jugadorId, { turnosEnDescendido: turnosTranscurridos });
  return { estado: sigue, salio: false };
}
