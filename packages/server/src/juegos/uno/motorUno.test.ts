// Tests del MotorJuego de UNO (la costura sobre uno-core). Usan el seam `mazo`
// para montar manos exactas y deterministas (uno-core reparte el mazo TAL CUAL:
// 7 por jugador, luego la inicial, luego el montón de robo). Las reglas viven en
// uno-core; aquí se prueba que el adaptador las expone bien al orquestador
// (parsear, aplicar, cadena de "+", saltarTurno de un ausente, vista oculta).

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "@juegos/uno-core";
import type { Carta, Color, Simbolo, Valor } from "@juegos/uno-core";
import type { AccionJuego } from "../../protocolo.js";
import type { GeneradorAleatorio, Resultado } from "../../motor.js";
import type { EstadoConexion, MetaSala } from "../../vista.js";
import { crearMotorUno } from "./motorUno.js";

const JUGADORES = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Ben" },
] as const;

function num(color: Color, valor: Valor, id: string): Carta {
  return { id, color, tipo: "numero", valor };
}

function simb(color: Color, tipo: Simbolo, id: string): Carta {
  return { id, color, tipo };
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

/** Mazo determinista: 7 rojas para j1, 7 azules para j2, inicial roja y robo verde. */
function mazoBase(): Carta[] {
  return [
    // j1 (mazo[0..6])
    simb("rojo", "mas2", "rojo-mas2-a"),
    num("rojo", 1, "rojo-1-a"),
    num("rojo", 2, "rojo-2-a"),
    num("rojo", 3, "rojo-3-a"),
    num("rojo", 4, "rojo-4-a"),
    num("rojo", 5, "rojo-5-a"),
    num("rojo", 6, "rojo-6-a"),
    // j2 (mazo[7..13])
    simb("azul", "mas2", "azul-mas2-a"),
    num("azul", 1, "azul-1-a"),
    num("azul", 2, "azul-2-a"),
    num("azul", 3, "azul-3-a"),
    num("azul", 4, "azul-4-a"),
    num("azul", 5, "azul-5-a"),
    num("azul", 6, "azul-6-a"),
    // inicial (mazo[14])
    num("rojo", 7, "rojo-7-a"),
    // montón de robo (mazo[15..])
    num("verde", 1, "verde-1-a"),
    num("verde", 2, "verde-2-a"),
    num("verde", 3, "verde-3-a"),
    num("verde", 4, "verde-4-a"),
    num("verde", 5, "verde-5-a"),
    num("verde", 6, "verde-6-a"),
    num("verde", 7, "verde-7-a"),
    num("verde", 8, "verde-8-a"),
  ];
}

describe("motorUno: creación y parseo de acciones", () => {
  it("crea el estado con las manos repartidas y la inicial volteada", () => {
    const motor = crearMotorUno({ mazo: mazoBase() });
    const estado = valor(motor.crear(JUGADORES, rng()));
    expect(estado.manos["j1"]?.map((c) => c.id)).toContain("rojo-mas2-a");
    expect(estado.manos["j2"]?.map((c) => c.id)).toContain("azul-mas2-a");
    expect(estado.descarte[estado.descarte.length - 1]?.id).toBe("rojo-7-a");
    expect(estado.colorActivo).toBe("rojo");
    expect(motor.jugadorEnTurno(estado)).toBe("j1");
    expect(motor.terminada(estado)).toBe(false);
    expect(motor.esperandoContinuar(estado)).toBe(false);
  });

  it("parsea jugar/robar/pasar/resolverAcumulado; rechaza la forma inválida", () => {
    const motor = crearMotorUno();
    expect(motor.parsearAccion({ tipo: "jugar", cartaId: "rojo-1-a" } as AccionJuego)).toEqual({
      tipo: "jugar",
      cartaId: "rojo-1-a",
    });
    expect(
      motor.parsearAccion({ tipo: "jugar", cartaId: "wild-1", color: "verde" } as AccionJuego),
    ).toEqual({ tipo: "jugar", cartaId: "wild-1", color: "verde" });
    expect(motor.parsearAccion({ tipo: "robar" } as AccionJuego)).toEqual({ tipo: "robar" });
    expect(motor.parsearAccion({ tipo: "pasar" } as AccionJuego)).toEqual({ tipo: "pasar" });
    expect(motor.parsearAccion({ tipo: "resolverAcumulado" } as AccionJuego)).toEqual({
      tipo: "resolverAcumulado",
    });
    // Formas inválidas:
    expect(motor.parsearAccion({ tipo: "jugar" } as AccionJuego)).toBeNull();
    expect(
      motor.parsearAccion({ tipo: "jugar", cartaId: "wild-1", color: "morado" } as AccionJuego),
    ).toBeNull();
    expect(motor.parsearAccion({ tipo: "acusar" } as AccionJuego)).toBeNull();
  });

  it("una acción fuera de turno devuelve el error del core", () => {
    const motor = crearMotorUno({ mazo: mazoBase() });
    const estado = valor(motor.crear(JUGADORES, rng()));
    const fuera = motor.aplicarAccion(estado, "j2", { tipo: "jugar", cartaId: "azul-mas2-a" });
    expect(fuera.ok).toBe(false);
    if (!fuera.ok) expect(fuera.error.codigo).toBe("NO_ES_TU_TURNO");
  });
});

describe("motorUno: cadena de '+' resuelta por robo", () => {
  it("apila +2 sobre +2 y al resolver el acumulado se roban todas las cartas", () => {
    const motor = crearMotorUno({ mazo: mazoBase() });
    let estado = valor(motor.crear(JUGADORES, rng()));
    // j1 inicia la cadena con un +2 (coincide por color con la inicial roja).
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cartaId: "rojo-mas2-a" }));
    expect(estado.acumuladoPendiente).toBe(2);
    expect(motor.jugadorEnTurno(estado)).toBe("j2");
    // j2 apila otro +2 (el apilado ignora el color, solo exige que sea un "+").
    estado = valor(motor.aplicarAccion(estado, "j2", { tipo: "jugar", cartaId: "azul-mas2-a" }));
    expect(estado.acumuladoPendiente).toBe(4);
    expect(motor.jugadorEnTurno(estado)).toBe("j1");
    // j1 resuelve el acumulado robando 4 y cede el turno.
    const manoAntes = (estado.manos["j1"] ?? []).length;
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "resolverAcumulado" }));
    expect(estado.acumuladoPendiente).toBe(0);
    expect((estado.manos["j1"] ?? []).length).toBe(manoAntes + 4);
    expect(motor.jugadorEnTurno(estado)).toBe("j2");
  });
});

describe("motorUno: saltarTurno de un ausente", () => {
  it("con acumulador pendiente, roba el acumulado y cede el turno", () => {
    const motor = crearMotorUno({ mazo: mazoBase() });
    let estado = valor(motor.crear(JUGADORES, rng()));
    estado = valor(motor.aplicarAccion(estado, "j1", { tipo: "jugar", cartaId: "rojo-mas2-a" }));
    // j2 está ausente con un +2 encima: saltarTurno = resolverAcumulado.
    const tras = valor(motor.saltarTurno(estado, "j2"));
    expect(tras.acumuladoPendiente).toBe(0);
    expect((tras.manos["j2"] ?? []).length).toBe(7 + 2);
    expect(motor.jugadorEnTurno(tras)).toBe("j1");
  });

  it("sin acumulador, roba una carta (y pasa si la robada era jugable)", () => {
    // El frente del robo es una roja jugable sobre la inicial roja: robar deja
    // robadaPendiente y saltarTurno la pasa, cediendo el turno.
    const mazo = mazoBase();
    mazo[15] = num("rojo", 8, "rojo-8-a"); // robo jugable (color rojo)
    const motor = crearMotorUno({ mazo });
    const estado = valor(motor.crear(JUGADORES, rng()));
    const tras = valor(motor.saltarTurno(estado, "j1"));
    expect((tras.manos["j1"] ?? []).length).toBe(7 + 1);
    expect(tras.robadaPendiente).toBeNull();
    expect(motor.jugadorEnTurno(tras)).toBe("j2");
  });
});

describe("motorUno: vista oculta", () => {
  it("la vista lleva tu mano y conteos ajenos, nunca las cartas ajenas ni el mazo", () => {
    const motor = crearMotorUno({ mazo: mazoBase() });
    const estado = valor(motor.crear(JUGADORES, rng()));
    const vista = motor.construirVista(estado, "j2", meta(["j1", "j2"]));
    if (!("juego" in vista) || vista.juego !== "uno") throw new Error("vista de otro juego");
    const json = JSON.stringify(vista);
    // j2 ve SU mano (azules) pero NUNCA las cartas de j1 ni las del montón de robo.
    expect(json).not.toContain("rojo-mas2-a"); // carta de j1
    expect(json).not.toContain("verde"); // montón de robo, opaco
    expect(vista.tuMano.map((c) => c.id)).toContain("azul-mas2-a");
    expect(vista.jugadores.find((j) => j.id === "j1")?.numeroCartas).toBe(7);
    expect(vista.numeroMazo).toBeGreaterThan(0);
  });
});
