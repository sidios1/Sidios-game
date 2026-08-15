// El motor server de Monopoly Ultimate Team contra un pool mock. Aquí NO se
// reprueban las reglas (esas tienen 169 tests en monopoly-core + monopoly-
// fuente-datos): se prueba la COSTURA con el contrato MotorJuego —
// interpretación de la config opaca (rondasTotales), parseo de las 12
// variantes de AccionMonopoly, delegación del rng capturado, y que la vista
// expone Mi Club completo pero nunca el pool/mazoPrensa crudos.

import { describe, expect, it } from "vitest";
import type { EstadoMonopoly } from "@juegos/monopoly-core";
import type { MetaSala } from "../../vista.js";
import { JUGADORES_MONOPOLY as JUGADORES, poolMock, rngFijo } from "../../pruebas/poolMonopoly.js";
import { crearMotorMonopoly } from "./motorMonopoly.js";

const META: MetaSala = {
  estados: new Map([
    ["j1", "conectado" as const],
    ["j2", "conectado" as const],
    ["j3", "conectado" as const],
  ]),
  anfitrionId: "j1",
  listos: new Set<string>(),
  votosNecesarios: 3,
};

function motorYEstado(rondasTotalesDefault = 20) {
  const motor = crearMotorMonopoly(poolMock(), { rondasTotalesDefault });
  const creado = motor.crear(JUGADORES, rngFijo());
  if (!creado.ok) throw new Error(`no se pudo crear la partida: ${creado.error.mensaje}`);
  return { motor, estado: creado.valor };
}

describe("motor de Monopoly Ultimate Team (costura con MotorJuego)", () => {
  it("crea la partida con presupuesto inicial, 6 sobres gratis y el primer jugador en turno", () => {
    const { estado } = motorYEstado();
    expect(estado.jugadorEnTurno).toBe("j1");
    expect(estado.numeroRonda).toBe(1);
    expect(estado.mazoPrensa).toHaveLength(16);
    for (const jugador of estado.jugadores) {
      expect(jugador.presupuesto).toBe(1000); // los sobres iniciales son gratis (§1.1)
      expect(Array.isArray(jugador.miClub)).toBe(true);
    }
  });

  it("usa el default de rondas cuando el config del lobby no trae rondasTotales", () => {
    const { estado } = motorYEstado(7);
    expect(estado.rondasTotales).toBe(7);
  });

  it("revalida el config OPACO del lobby: rondasTotales explícito pisa el default", () => {
    const motor = crearMotorMonopoly(poolMock(), { rondasTotalesDefault: 20 });
    const creado = motor.crear(JUGADORES, rngFijo(), { rondasTotales: 3 });
    if (!creado.ok) throw new Error("no se pudo crear");
    expect(creado.valor.rondasTotales).toBe(3);
  });

  it("ignora una config con forma inesperada: cae al default", () => {
    const motor = crearMotorMonopoly(poolMock(), { rondasTotalesDefault: 9 });
    for (const config of [null, "rondas", { rondasTotales: "tres" }, { otra: true }]) {
      const creado = motor.crear(JUGADORES, rngFijo(), config);
      if (!creado.ok) throw new Error("no se pudo crear");
      expect(creado.valor.rondasTotales).toBe(9);
    }
  });

  it("jugadorEnTurno delega al core y es null cuando la partida termina", () => {
    const { motor, estado } = motorYEstado();
    expect(motor.jugadorEnTurno(estado)).toBe("j1");
    const terminada: EstadoMonopoly = { ...estado, numeroRonda: estado.rondasTotales + 1 };
    expect(motor.jugadorEnTurno(terminada)).toBeNull();
    expect(motor.terminada(terminada)).toBe(true);
  });

  it("saltarTurno sin nada pendiente avanza la rotación", () => {
    const { motor, estado } = motorYEstado();
    const saltado = motor.saltarTurno(estado, "j1");
    expect(saltado.ok).toBe(true);
    if (saltado.ok) expect(saltado.valor.jugadorEnTurno).toBe("j2");
  });

  it("saltarTurno CON una decisión pendiente delega el error del core, sin auto-resolverla", () => {
    const { motor, estado } = motorYEstado();
    const conPendiente: EstadoMonopoly = {
      ...estado,
      decisionPendiente: {
        jugadorId: "j1",
        fueDoble: false,
        detalle: { tipo: "compraODeclina", celdaIndice: 1 },
      },
    };
    const saltado = motor.saltarTurno(conPendiente, "j1");
    expect(saltado.ok).toBe(false);
    if (!saltado.ok) expect(saltado.error.codigo).toBe("ACCION_NO_ESPERADA");
  });

  it("nunca pausa por votación de continuar (las rondas avanzan dentro de aplicarAccion)", () => {
    const { motor, estado } = motorYEstado();
    expect(motor.esperandoContinuar(estado)).toBe(false);
    const seguido = motor.continuar(estado, rngFijo());
    expect(seguido.ok).toBe(true);
    if (seguido.ok) expect(seguido.valor).toBe(estado);
  });

  it("no implementa turnoTurbo/faseTemporizada: fuera de alcance de esta sesión", () => {
    const { motor } = motorYEstado();
    expect(motor.turnoTurbo).toBeUndefined();
    expect(motor.expirarTurno).toBeUndefined();
    expect(motor.faseTemporizada).toBeUndefined();
    expect(motor.expirarFase).toBeUndefined();
  });

  it("parsea las 12 variantes de AccionMonopoly y rechaza formas inválidas", () => {
    const { motor } = motorYEstado();
    expect(motor.parsearAccion({ tipo: "tirarDados" })).toEqual({ tipo: "tirarDados" });
    expect(motor.parsearAccion({ tipo: "comprarSobre" })).toEqual({ tipo: "comprarSobre" });
    expect(motor.parsearAccion({ tipo: "comprarSobre", posicion: "GK" })).toEqual({
      tipo: "comprarSobre",
      posicion: "GK",
    });
    expect(motor.parsearAccion({ tipo: "comprarSobre", posicion: "no-existe" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "declinarCompra" })).toEqual({ tipo: "declinarCompra" });
    expect(motor.parsearAccion({ tipo: "pujar", monto: 50 })).toEqual({ tipo: "pujar", monto: 50 });
    expect(motor.parsearAccion({ tipo: "pujar", monto: "50" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "pasarSubasta" })).toEqual({ tipo: "pasarSubasta" });
    expect(motor.parsearAccion({ tipo: "elegirPosicionSobre", posicion: "ST" })).toEqual({
      tipo: "elegirPosicionSobre",
      posicion: "ST",
    });
    expect(motor.parsearAccion({ tipo: "elegirPosicionSobre" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "forzarCompra" })).toEqual({ tipo: "forzarCompra" });
    expect(motor.parsearAccion({ tipo: "pagarMultaDescendido" })).toEqual({
      tipo: "pagarMultaDescendido",
    });
    expect(
      motor.parsearAccion({
        tipo: "intercambiar",
        conJugadorId: "j2",
        ofrezco: { dinero: 10, cartaIds: ["c1"] },
        pido: { dinero: 0, cartaIds: [] },
      }),
    ).toEqual({
      tipo: "intercambiar",
      conJugadorId: "j2",
      ofrezco: { dinero: 10, cartaIds: ["c1"] },
      pido: { dinero: 0, cartaIds: [] },
    });
    expect(motor.parsearAccion({ tipo: "intercambiar", conJugadorId: "j2" })).toBeNull();
    expect(
      motor.parsearAccion({ tipo: "elegirRoboPrensa", rivalId: "j2", cartaId: "carta-0" }),
    ).toEqual({ tipo: "elegirRoboPrensa", rivalId: "j2", cartaId: "carta-0" });
    expect(motor.parsearAccion({ tipo: "elegirRoboPrensa", rivalId: "j2" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "elegirCambioAgente", cartaId: "carta-0" })).toEqual({
      tipo: "elegirCambioAgente",
      cartaId: "carta-0",
    });
    expect(motor.parsearAccion({ tipo: "elegirCambioAgente" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "elegirLigaDobleFichaje", liga: "MLS" })).toEqual({
      tipo: "elegirLigaDobleFichaje",
      liga: "MLS",
    });
    expect(motor.parsearAccion({ tipo: "elegirLigaDobleFichaje", liga: "Narnia" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "loQueSea" })).toBeNull();
  });

  it("la vista expone Mi Club completo de rivales pero nunca el pool o el mazoPrensa crudos", () => {
    const { motor, estado } = motorYEstado();
    const vista = motor.construirVista(estado, "j1", META);
    if (vista.juego !== "monopoly") throw new Error("se esperaba una vista de Monopoly");
    expect(vista.tuJugadorId).toBe("j1");
    expect(vista.anfitrionId).toBe("j1");
    expect(vista.jugadorEnTurnoId).toBe("j1");
    expect(vista.numeroMazoPrensa).toBe(16);
    expect(vista.jugadores).toHaveLength(3);
    // Mi Club de un RIVAL viaja completo (lo exige "Fichaje sorpresa" / elegirRoboPrensa).
    const rival = vista.jugadores.find((j) => j.id === "j2");
    expect(rival).toBeDefined();
    expect(Array.isArray(rival?.miClub)).toBe(true);
    // El pool (dataset completo) y el mazo crudo NUNCA viajan.
    expect("pool" in vista).toBe(false);
    expect("mazoPrensa" in vista).toBe(false);
  });
});
