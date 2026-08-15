// Test de integración: una partida completa, jugada turno a turno a través
// de `aplicarAccion` (el mismo punto de entrada que usará el servidor en
// S3), con una única semilla de rng compartida de punta a punta. No exhibe
// ninguna regla puntual (eso lo hacen los demás *.test.ts): existe para
// atrapar regresiones de integración entre archivos (turnos, economia,
// descendido, cartasPrensaEfectos) que los tests unitarios no verían.

import { describe, expect, it } from "vitest";
import type { GeneradorAleatorio } from "./aleatorio.js";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { exito, JUGADORES, poolDePrueba } from "./apoyoPruebas.js";
import { jugadorDe, type EstadoMonopoly } from "./estado.js";
import { aplicarAccion, crearPartida, terminada } from "./partida.js";

/** Resuelve cualquier decisión pendiente/subasta con la opción más simple, para que el loop no se trabe. */
function resolverPendienteAutomaticamente(
  estadoInicial: EstadoMonopoly,
  rng: GeneradorAleatorio,
): EstadoMonopoly {
  let estado = estadoInicial;
  let vueltas = 0;
  while ((estado.decisionPendiente !== null || estado.subastaEnCurso !== null) && vueltas < 50) {
    vueltas++;
    if (estado.subastaEnCurso !== null) {
      const subasta = estado.subastaEnCurso;
      const activos = estado.jugadores.filter((j) => !j.enQuiebra).map((j) => j.id);
      for (const id of activos) {
        if (estado.subastaEnCurso === null) break;
        if (estado.subastaEnCurso.jugadoresPasados.includes(id)) continue;
        if (estado.subastaEnCurso.pujaActual?.jugadorId === id) continue;
        estado = exito(aplicarAccion(estado, id, { tipo: "pasarSubasta" }, rng));
      }
      void subasta;
      continue;
    }
    const pend = estado.decisionPendiente;
    if (pend === null) continue;
    switch (pend.detalle.tipo) {
      case "compraODeclina":
        estado = exito(aplicarAccion(estado, pend.jugadorId, { tipo: "declinarCompra" }, rng));
        break;
      case "elegirPosicionSobre":
        estado = exito(
          aplicarAccion(estado, pend.jugadorId, { tipo: "elegirPosicionSobre", posicion: "ST" }, rng),
        );
        break;
      case "elegirRoboPrensa": {
        const rival = estado.jugadores.find((j) => j.id !== pend.jugadorId && j.miClub.length > 0);
        const cartaId = rival?.miClub[0]?.id;
        if (rival === undefined || cartaId === undefined) {
          throw new Error("invariante: no debería haber elegirRoboPrensa sin ningún rival con cartas");
        }
        estado = exito(
          aplicarAccion(estado, pend.jugadorId, { tipo: "elegirRoboPrensa", rivalId: rival.id, cartaId }, rng),
        );
        break;
      }
      case "elegirCambioAgente": {
        const cartaId = jugadorDe(estado, pend.jugadorId).miClub[0]?.id;
        if (cartaId === undefined) {
          throw new Error("invariante: no debería haber elegirCambioAgente sin cartas propias");
        }
        estado = exito(aplicarAccion(estado, pend.jugadorId, { tipo: "elegirCambioAgente", cartaId }, rng));
        break;
      }
      case "elegirLigaDobleFichaje":
        estado = exito(aplicarAccion(estado, pend.jugadorId, { tipo: "elegirLigaDobleFichaje", liga: "MLS" }, rng));
        break;
    }
  }
  return estado;
}

describe("partida completa (integración, seed fija)", () => {
  it("juega varias rondas de punta a punta sin quedar en un estado inconsistente", () => {
    const rng = crearGeneradorSemilla(2024);
    let estado = exito(crearPartida(JUGADORES, poolDePrueba(), rng, { rondasTotales: 3 }));

    let salvaguarda = 0;
    while (!terminada(estado) && salvaguarda < 300) {
      salvaguarda++;
      const jugadorId = estado.jugadorEnTurno;
      estado = exito(aplicarAccion(estado, jugadorId, { tipo: "tirarDados" }, rng));
      estado = resolverPendienteAutomaticamente(estado, rng);
    }

    expect(salvaguarda).toBeLessThan(300); // terminó por reglas (§6), no por el techo de seguridad
    expect(terminada(estado)).toBe(true);
    expect(estado.numeroRonda).toBeGreaterThan(3);
    expect(estado.jugadores).toHaveLength(3);
    for (const jugador of estado.jugadores) {
      expect(Number.isFinite(jugador.presupuesto)).toBe(true);
      expect(jugador.posicion).toBeGreaterThanOrEqual(0);
      expect(jugador.posicion).toBeLessThan(40);
      expect(jugador.turnosEnDescendido).toBeGreaterThanOrEqual(0);
      expect(jugador.turnosEnDescendido).toBeLessThanOrEqual(3);
    }
  });
});
