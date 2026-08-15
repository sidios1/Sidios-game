import { describe, expect, it } from "vitest";
import { exito } from "./apoyoPruebas.js";
import { jugadorDe } from "./estado.js";
import { colaRng, dado, partidaDePrueba } from "./pruebasComunes.js";
import { avanzar, saltarTurno, tirarDados } from "./turnos.js";

describe("tirarDados: movimiento y turnos", () => {
  it("mueve la suma de los dados y pasa el turno cuando no hay dobles", () => {
    const estado = partidaDePrueba();
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(2), dado(5)]))); // suma 7
    expect(jugadorDe(resultado, "j1").posicion).toBe(7);
    expect(resultado.jugadorEnTurno).toBe("j2");
    expect(resultado.turnoGlobal).toBe(1);
    expect(resultado.doblesSeguidos).toBe(0);
  });

  it("dobles otorgan turno extra: el mismo jugador sigue en turno", () => {
    const estado = partidaDePrueba();
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(3), dado(3)]))); // doble, suma 6
    expect(resultado.jugadorEnTurno).toBe("j1");
    expect(resultado.turnoGlobal).toBe(0);
    expect(resultado.doblesSeguidos).toBe(1);
  });

  it("registra ultimaTirada con los dados exactos (presentación)", () => {
    const estado = partidaDePrueba();
    expect(estado.ultimaTirada ?? null).toBeNull();
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(2), dado(5)])));
    expect(resultado.ultimaTirada).toEqual({ d1: 2, d2: 5, esDoble: false });
  });

  it("3 dobles seguidos mandan a Descendido SIN aplicar el movimiento del 3er dado", () => {
    const estado = partidaDePrueba();
    const paso1 = exito(tirarDados(estado, "j1", colaRng([dado(2), dado(2)])));
    expect(paso1.doblesSeguidos).toBe(1);
    const paso2 = exito(tirarDados(paso1, "j1", colaRng([dado(4), dado(4)])));
    expect(paso2.doblesSeguidos).toBe(2);
    const paso3 = exito(tirarDados(paso2, "j1", colaRng([dado(6), dado(6)])));
    const j1 = jugadorDe(paso3, "j1");
    expect(j1.enDescendido).toBe(true);
    expect(j1.posicion).toBe(10); // Cárcel, cosmético; NO se movió con el 3er dado
    expect(paso3.jugadorEnTurno).toBe("j2"); // sin turno extra pese al doble
    expect(paso3.doblesSeguidos).toBe(0);
  });

  it("cobra el bono de Nueva Temporada al cruzar o caer en Salida", () => {
    const estado = partidaDePrueba();
    const cerca = {
      ...estado,
      jugadores: estado.jugadores.map((j) => (j.id === "j1" ? { ...j, posicion: 38 } : j)),
    };
    const presupuestoAntes = jugadorDe(cerca, "j1").presupuesto;
    const resultado = exito(tirarDados(cerca, "j1", colaRng([dado(2), dado(1)]))); // suma 3: 38->1
    expect(jugadorDe(resultado, "j1").posicion).toBe(1);
    expect(jugadorDe(resultado, "j1").presupuesto).toBe(presupuestoAntes + 100);
  });

  it("ronda 1: aterrizar en una celda comprable no genera decisión pendiente", () => {
    const estado = partidaDePrueba();
    expect(estado.numeroRonda).toBe(1);
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(1), dado(2)]))); // suma 3 -> MLS
    expect(resultado.decisionPendiente).toBeNull();
    expect(resultado.jugadorEnTurno).toBe("j2");
  });

  it("ronda 1: los impuestos y Prensa Deportiva SÍ funcionan (solo se deshabilitan los sobres)", () => {
    const estado = partidaDePrueba();
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(1), dado(3)]))); // suma 4 -> Multa Doping
    expect(jugadorDe(resultado, "j1").presupuesto).toBe(1000 - 100);
    expect(resultado.palcoDelClub).toBe(100);
  });

  it("ronda 2 reactiva las celdas comprables: aterrizar deja una decisión pendiente", () => {
    const base = partidaDePrueba();
    const estado = { ...base, numeroRonda: 2 };
    const resultado = exito(tirarDados(estado, "j1", colaRng([dado(1), dado(2)]))); // suma 3 -> MLS
    expect(resultado.decisionPendiente).not.toBeNull();
    expect(resultado.decisionPendiente?.detalle.tipo).toBe("compraODeclina");
    expect(resultado.jugadorEnTurno).toBe("j1"); // el segmento queda bloqueado
  });

  it("numeroRonda avanza correctamente aunque un jugador esté en quiebra a mitad de vuelta", () => {
    const base = partidaDePrueba();
    const conQuiebra = {
      ...base,
      jugadores: base.jugadores.map((j) => (j.id === "j2" ? { ...j, enQuiebra: true } : j)),
    };
    const resultado = exito(tirarDados(conQuiebra, "j1", colaRng([dado(1), dado(2)])));
    expect(resultado.jugadorEnTurno).toBe("j3"); // se saltea a j2
    expect(resultado.turnoGlobal).toBe(2);
  });

  it("no permite tirar si no es tu turno", () => {
    const estado = partidaDePrueba();
    const resultado = tirarDados(estado, "j2", colaRng([dado(1), dado(1)]));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("NO_ES_TU_TURNO");
  });
});

describe("avanzar", () => {
  it("mueve pasos negativos sin cobrar el bono de Nueva Temporada", () => {
    const estado = partidaDePrueba();
    const conJ1en2 = {
      ...estado,
      jugadores: estado.jugadores.map((j) => (j.id === "j1" ? { ...j, posicion: 2 } : j)),
    };
    const movido = avanzar(conJ1en2, "j1", -5);
    expect(jugadorDe(movido, "j1").posicion).toBe(37);
    expect(jugadorDe(movido, "j1").presupuesto).toBe(1000);
  });
});

describe("saltarTurno", () => {
  it("avanza la rotación sin mover al jugador saltado", () => {
    const estado = partidaDePrueba();
    const resultado = exito(saltarTurno(estado, "j1", colaRng([0])));
    expect(resultado.jugadorEnTurno).toBe("j2");
    expect(jugadorDe(resultado, "j1").posicion).toBe(0);
  });
});
