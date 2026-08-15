// Vista por jugador de Monopoly Ultimate Team: la proyección que cada cliente
// puede ver. `monopoly-core` no expone ningún `construirVistaX` (a diferencia
// de meloquiz-core/carioca-core): esta proyección se diseña desde cero acá.
//
// A diferencia de Carioca/Mentiroso, en Monopoly Ultimate Team NO hay "mano"
// oculta: `miClub` de CADA jugador viaja completo a TODOS, porque la carta de
// Prensa Deportiva #8 "Fichaje sorpresa" (acción `elegirRoboPrensa`) exige que
// quien la juega vea el Mi Club ajeno para elegir qué carta robar. Lo único
// que se oculta es lo que todavía no salió sorteado: `pool` (el dataset
// completo de jugadores/técnicos disponibles) no viaja en absoluto, y
// `mazoPrensa` viaja solo como conteo — igual que el mazo de Carioca — para no
// revelar el orden de las próximas cartas de evento.

import {
  jugadorEnTurno as jugadorEnTurnoDelCore,
  terminada as terminadaDelCore,
} from "@juegos/monopoly-core";
import type {
  CartaMiClub,
  DecisionPendiente,
  EstadoMonopoly,
  SubastaEnCurso,
  UltimaTirada,
  VentanaRenegociacion,
} from "@juegos/monopoly-core";
import type { EstadoConexion, MetaSala } from "../../vista.js";

export interface JugadorVistaMonopoly {
  readonly id: string;
  readonly nombre: string;
  /** Id del avatar del perfil; ausente si el jugador no eligió uno. */
  readonly avatar?: string;
  readonly presupuesto: number;
  /** Índice de celda, 0..39. */
  readonly posicion: number;
  /** Inventario completo (§3): público, no es una mano oculta. */
  readonly miClub: readonly CartaMiClub[];
  readonly clubToken: string | null;
  readonly enQuiebra: boolean;
  readonly enDescendido: boolean;
  readonly turnosEnDescendido: number;
  readonly proximoSobreMitadPrecio: boolean;
  readonly turnosAPerder: number;
  /** Atajo de presentación: `estadoConexion === "conectado"`. */
  readonly conectado: boolean;
  readonly estadoConexion: EstadoConexion;
}

export interface VistaMonopoly {
  /** Discriminante de la unión `VistaJuego` (marcador; = game-id de Monopoly). */
  readonly juego: "monopoly";
  readonly tuJugadorId: string;
  /** Asiento anfitrión (puede reabrir conexiones); en partida es estable. */
  readonly anfitrionId: string;
  /** En orden de turnos (= `ordenJugadores`, fijo desde `crearPartida`). */
  readonly jugadores: readonly JugadorVistaMonopoly[];
  /** A quién le toca; null si la partida terminó. */
  readonly jugadorEnTurnoId: string | null;
  readonly doblesSeguidos: number;
  readonly turnoGlobal: number;
  readonly numeroRonda: number;
  readonly rondasTotales: number;
  readonly palcoDelClub: number;
  /** Conteo: el mazo de Prensa Deportiva nunca viaja completo (orden oculto). */
  readonly numeroMazoPrensa: number;
  readonly ventanasAbiertas: Readonly<Record<number, VentanaRenegociacion>>;
  readonly subastaEnCurso: SubastaEnCurso | null;
  readonly decisionPendiente: DecisionPendiente | null;
  readonly terminada: boolean;
  /** Última tirada de dados de la partida (presentación); null si aún no se tiró ninguna. */
  readonly ultimaTirada: UltimaTirada | null;
}

export function construirVistaMonopoly(
  estado: EstadoMonopoly,
  jugadorId: string,
  meta: MetaSala,
): VistaMonopoly {
  if (!estado.ordenJugadores.includes(jugadorId)) {
    throw new Error(`no hay vista para un jugador fuera de la partida: ${jugadorId}`);
  }
  const jugadores: JugadorVistaMonopoly[] = estado.ordenJugadores.map((id) => {
    const jugador = estado.jugadores.find((j) => j.id === id);
    if (jugador === undefined) {
      throw new Error(`invariante violada: "${id}" está en ordenJugadores pero no en jugadores`);
    }
    const avatar = meta.avatares?.get(id);
    const estadoConexion = meta.estados.get(id) ?? "conectado";
    return {
      id: jugador.id,
      nombre: jugador.nombre,
      // exactOptionalPropertyTypes: omitimos avatar cuando no hay.
      ...(avatar !== undefined ? { avatar } : {}),
      presupuesto: jugador.presupuesto,
      posicion: jugador.posicion,
      miClub: jugador.miClub,
      clubToken: jugador.clubToken,
      enQuiebra: jugador.enQuiebra,
      enDescendido: jugador.enDescendido,
      turnosEnDescendido: jugador.turnosEnDescendido,
      proximoSobreMitadPrecio: jugador.proximoSobreMitadPrecio,
      turnosAPerder: jugador.turnosAPerder,
      conectado: estadoConexion === "conectado",
      estadoConexion,
    };
  });
  return {
    juego: "monopoly",
    tuJugadorId: jugadorId,
    anfitrionId: meta.anfitrionId,
    jugadores,
    jugadorEnTurnoId: jugadorEnTurnoDelCore(estado),
    doblesSeguidos: estado.doblesSeguidos,
    turnoGlobal: estado.turnoGlobal,
    numeroRonda: estado.numeroRonda,
    rondasTotales: estado.rondasTotales,
    palcoDelClub: estado.palcoDelClub,
    numeroMazoPrensa: estado.mazoPrensa.length,
    ventanasAbiertas: estado.ventanasAbiertas,
    subastaEnCurso: estado.subastaEnCurso,
    decisionPendiente: estado.decisionPendiente,
    terminada: terminadaDelCore(estado),
    ultimaTirada: estado.ultimaTirada ?? null,
  };
}
