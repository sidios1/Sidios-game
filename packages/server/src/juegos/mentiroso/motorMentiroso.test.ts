// Tests del MotorJuego de Mentiroso (la costura sobre mentiroso-core). Usan el
// seam `baraja`/`paloInicial` para montar manos exactas y deterministas. Las
// reglas viven en mentiroso-core; aquí se prueba que el adaptador las expone bien
// al orquestador (parsear, aplicar, vista oculta, resolución revelada, ganador).

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "@juegos/mentiroso-core";
import type { Carta } from "@juegos/mentiroso-core";
import type { AccionJuego } from "../../protocolo.js";
import type { GeneradorAleatorio, Resultado } from "../../motor.js";
import type { EstadoConexion, MetaSala } from "../../vista.js";
import type { EstadoMentiroso } from "./vistaMentiroso.js";
import { crearMotorMentiroso } from "./motorMentiroso.js";

const JUGADORES = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Ben" },
] as const;

function carta(palo: Carta["palo"], id: string): Carta {
  return { palo, id };
}

function rng(): GeneradorAleatorio {
  return crearGeneradorSemilla(1);
}

function meta(ids: readonly string[]): MetaSala {
  const estados = new Map<string, EstadoConexion>(ids.map((id) => [id, "conectado"]));
  return { estados, anfitrionId: ids[0] ?? "", listos: new Set(), votosNecesarios: 1 };
}

function valor<T>(resultado: Resultado<T>): T {
  if (!resultado.ok) throw new Error(`se esperaba ok, llegó ${resultado.error.codigo}`);
  return resultado.valor;
}

describe("motorMentiroso: creación y parseo de acciones", () => {
  it("crea el estado con las manos repartidas y el palo inicial dado", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("corazones", "c-b")],
      paloInicial: "picas",
    });
    const estado = valor(motor.crear(JUGADORES, rng()));
    expect(estado.nucleo.paloRonda).toBe("picas");
    expect(estado.nucleo.jugadorEnTurno).toBe("j1");
    expect(estado.nombres).toEqual({ j1: "Ana", j2: "Ben" });
    expect(motor.jugadorEnTurno(estado)).toBe("j1");
    expect(motor.terminada(estado)).toBe(false);
    expect(motor.esperandoContinuar()).toBe(false);
  });

  it("parsea jugar (1-3) y acusar; rechaza la forma inválida", () => {
    const motor = crearMotorMentiroso();
    expect(motor.parsearAccion({ tipo: "jugar", cantidad: 2 } as AccionJuego)).toEqual({
      tipo: "jugar",
      cantidad: 2,
    });
    expect(motor.parsearAccion({ tipo: "acusar" } as AccionJuego)).toEqual({ tipo: "acusar" });
    expect(motor.parsearAccion({ tipo: "jugar", cantidad: 0 } as AccionJuego)).toBeNull();
    expect(motor.parsearAccion({ tipo: "jugar", cantidad: 4 } as AccionJuego)).toBeNull();
    expect(motor.parsearAccion({ tipo: "jugar" } as AccionJuego)).toBeNull();
    expect(motor.parsearAccion({ tipo: "robar" } as AccionJuego)).toBeNull();
  });
});

describe("motorMentiroso: aplicar acciones", () => {
  it("jugar mueve cartas a la pila, avanza el turno y NO deja resolución", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("picas", "p-b"), carta("picas", "p-c"), carta("picas", "p-d")],
      paloInicial: "picas",
    });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cantidad: 1 }));
    expect(estado.nucleo.pila).toHaveLength(1);
    expect(estado.nucleo.jugadorEnTurno).toBe("j2");
    expect(estado.nucleo.ultimaJugada?.cantidad).toBe(1);
    expect(estado.ultimaResolucion).toBeNull();
  });

  it("una acción fuera de turno devuelve el error del core", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("picas", "p-b")],
      paloInicial: "picas",
    });
    const estado = valor(motor.crear(JUGADORES, rng()));
    const fuera = motor.aplicarAccion(estado, "j2", { tipo: "jugar", cantidad: 1 });
    expect(fuera.ok).toBe(false);
    if (!fuera.ok) expect(fuera.error.codigo).toBe("NO_ES_TU_TURNO");
  });
});

describe("motorMentiroso: acusación (§5) y su resolución revelada", () => {
  it("si el acusado MENTÍA, recoge la pila y la resolución destapa sus cartas", () => {
    // j1 = [corazones-a, picas-c]; declara picas pero juega corazones → miente.
    const motor = crearMotorMentiroso({
      baraja: [
        carta("corazones", "co-a"),
        carta("picas", "pi-b"),
        carta("picas", "pi-c"),
        carta("picas", "pi-d"),
      ],
      paloInicial: "picas",
    });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cantidad: 1 }));
    estado = valor(motor.aplicarAccion(estado, "j2", { tipo: "acusar" }));

    const r = estado.ultimaResolucion;
    expect(r).not.toBeNull();
    expect(r?.mentia).toBe(true);
    expect(r?.acusadoId).toBe("j1");
    expect(r?.acusadorId).toBe("j2");
    expect(r?.quienRecogioId).toBe("j1");
    expect(r?.cartas.map((c) => c.id)).toEqual(["co-a"]);
    // El acusado recoge la pila e inicia la ronda nueva con un palo distinto.
    expect(estado.nucleo.jugadorEnTurno).toBe("j1");
    expect(estado.nucleo.paloRonda).not.toBe("picas");
    expect(estado.nucleo.pila).toHaveLength(0);
  });

  it("si el acusado DECÍA VERDAD, recoge el acusador", () => {
    // j1 = [picas-a, picas-c]; declara picas y juega picas → dice verdad.
    const motor = crearMotorMentiroso({
      baraja: [
        carta("picas", "pi-a"),
        carta("picas", "pi-b"),
        carta("picas", "pi-c"),
        carta("picas", "pi-d"),
      ],
      paloInicial: "picas",
    });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cantidad: 1 }));
    estado = valor(motor.aplicarAccion(estado, "j2", { tipo: "acusar" }));
    expect(estado.ultimaResolucion?.mentia).toBe(false);
    expect(estado.ultimaResolucion?.quienRecogioId).toBe("j2");
    expect(estado.nucleo.jugadorEnTurno).toBe("j2");
  });
});

describe("motorMentiroso: fin de partida (§8.1)", () => {
  it("gana por aceptación: el siguiente jugador juega tras la jugada final", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("picas", "p-b")],
      paloInicial: "picas",
    });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cantidad: 1 }));
    expect(estado.nucleo.ganadorPendiente).toBe("j1");
    expect(motor.terminada(estado)).toBe(false);
    estado = valor(motor.aplicarAccion(estado, "j2", { tipo: "jugar", cantidad: 1 }));
    expect(estado.nucleo.ganador).toBe("j1");
    expect(motor.terminada(estado)).toBe(true);
    expect(motor.jugadorEnTurno(estado)).toBeNull();
  });

  it("gana al sobrevivir una acusación fallida (decía verdad en su jugada final)", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("corazones", "c-b")],
      paloInicial: "picas",
    });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cantidad: 1 }));
    estado = valor(motor.aplicarAccion(estado, "j2", { tipo: "acusar" }));
    expect(estado.nucleo.ganador).toBe("j1");
    expect(motor.terminada(estado)).toBe(true);
  });
});

describe("motorMentiroso: saltar turno de un ausente y construir vista oculta", () => {
  it("saltarTurno juega la mínima (1 carta) reusando el core", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("picas", "p-b"), carta("picas", "p-c"), carta("picas", "p-d")],
      paloInicial: "picas",
    });
    const estado = valor(motor.crear(JUGADORES, rng()));
    const tras = valor(motor.saltarTurno(estado, "j1"));
    expect(tras.nucleo.pila).toHaveLength(1);
    expect(tras.nucleo.jugadorEnTurno).toBe("j2");
  });

  it("la vista lleva tu mano y conteos ajenos, nunca las cartas ajenas ni la pila", () => {
    const motor = crearMotorMentiroso({
      baraja: [carta("picas", "p-a"), carta("corazones", "c-b"), carta("picas", "p-c"), carta("treboles", "t-d")],
      paloInicial: "picas",
    });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cantidad: 1 }));

    const vista = motor.construirVista(estado, "j2", meta(["j1", "j2"]));
    const json = JSON.stringify(vista);
    // j2 ve SU mano (corazones, tréboles) pero NUNCA las cartas de j1 ni la pila.
    expect(json).not.toContain("p-a"); // carta de j1, ahora oculta en la pila
    expect(json).not.toContain("p-c"); // carta que sigue en la mano de j1
    if (vista.juego !== "mentiroso") throw new Error("vista de otro juego");
    expect(vista.tuMano.map((c) => c.id).sort()).toEqual(["c-b", "t-d"]);
    expect(vista.numeroPila).toBe(1);
    expect(vista.jugadores.find((j) => j.id === "j1")?.numeroCartas).toBe(1);
    expect(vista.ultimaJugada).toEqual({ jugadorId: "j1", cantidad: 1 });
  });
});
