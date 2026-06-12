import { describe, expect, it } from "vitest";
import type { Carta, Pinta, ValorCarta } from "./carta.js";
import { crearCartaNormal, crearComodin, VALORES } from "./carta.js";
import {
  extenderEscala,
  validarEscala,
  validarEscalaReal,
  validarEscalaSucia,
  validarTrio,
} from "./combinaciones.js";
import { ESCALA } from "./contratos.js";

let secuencia = 0;
function c(pinta: Pinta, valor: ValorCarta): Carta {
  secuencia += 1;
  return crearCartaNormal(pinta, valor, `t${secuencia}`);
}
function comodin(): Carta {
  secuencia += 1;
  return crearComodin(secuencia);
}

describe("validarTrio", () => {
  it("acepta 3 cartas del mismo número, cualquier pinta", () => {
    const r = validarTrio([c("corazones", 7), c("treboles", 7), c("picas", 7)], 1);
    expect(r.valida).toBe(true);
  });

  it("rechaza números distintos", () => {
    const r = validarTrio([c("corazones", 7), c("corazones", 7), c("corazones", 8)], 1);
    expect(r.valida).toBe(false);
  });

  it("acepta 1 comodín", () => {
    const r = validarTrio([c("corazones", 7), c("treboles", 7), comodin()], 1);
    expect(r.valida).toBe(true);
  });

  it("rechaza 2 comodines (máximo 1 por combinación)", () => {
    const r = validarTrio([c("corazones", 7), comodin(), comodin()], 1);
    expect(r.valida).toBe(false);
  });

  it("rechaza menos de 3 cartas", () => {
    const r = validarTrio([c("corazones", 7), c("treboles", 7)], 1);
    expect(r.valida).toBe(false);
  });

  it("acepta más de 3 cartas del mismo número", () => {
    const r = validarTrio(
      [c("corazones", 9), c("diamantes", 9), c("treboles", 9), c("picas", 9)],
      1,
    );
    expect(r.valida).toBe(true);
  });
});

describe("validarEscala", () => {
  const longitudMin = ESCALA.longitudMin;

  it("acepta 4 consecutivas de la misma pinta", () => {
    const r = validarEscala(
      [c("diamantes", 4), c("diamantes", 5), c("diamantes", 6), c("diamantes", 7)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(true);
  });

  it("acepta el As como puente: Q-K-A-2-3", () => {
    const r = validarEscala(
      [c("picas", 12), c("picas", 13), c("picas", 1), c("picas", 2), c("picas", 3)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(true);
  });

  it("rechaza pintas mezcladas", () => {
    const r = validarEscala(
      [c("diamantes", 4), c("diamantes", 5), c("treboles", 6), c("diamantes", 7)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(false);
  });

  it("rechaza menos de 4 cartas", () => {
    const r = validarEscala(
      [c("diamantes", 4), c("diamantes", 5), c("diamantes", 6)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(false);
  });

  it("acepta 1 comodín ocupando una posición de la secuencia", () => {
    const r = validarEscala(
      [c("corazones", 4), comodin(), c("corazones", 6), c("corazones", 7)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(true);
  });

  it("rechaza 2 comodines", () => {
    const r = validarEscala(
      [c("corazones", 4), comodin(), comodin(), c("corazones", 7)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(false);
  });

  it("rechaza cartas no consecutivas en el orden propuesto", () => {
    const r = validarEscala(
      [c("picas", 4), c("picas", 5), c("picas", 6), c("picas", 9)],
      longitudMin,
      1,
    );
    expect(r.valida).toBe(false);
  });
});

describe("validarEscalaSucia", () => {
  function suciaCompleta(): Carta[] {
    const pintas: readonly Pinta[] = ["corazones", "treboles", "diamantes", "picas"];
    return VALORES.map((valor, i) => c(pintas[i % pintas.length] ?? "corazones", valor));
  }

  it("acepta 13 cartas del As al Rey de cualquier pinta", () => {
    expect(validarEscalaSucia(suciaCompleta(), 1).valida).toBe(true);
  });

  it("acepta 1 comodín reemplazando una posición", () => {
    const cartas = suciaCompleta();
    cartas[5] = comodin();
    expect(validarEscalaSucia(cartas, 1).valida).toBe(true);
  });

  it("rechaza 2 comodines", () => {
    const cartas = suciaCompleta();
    cartas[5] = comodin();
    cartas[9] = comodin();
    expect(validarEscalaSucia(cartas, 1).valida).toBe(false);
  });

  it("rechaza 12 cartas", () => {
    expect(validarEscalaSucia(suciaCompleta().slice(0, 12), 1).valida).toBe(false);
  });

  it("rechaza cartas fuera de orden", () => {
    const cartas = suciaCompleta();
    const a = cartas[3];
    const b = cartas[7];
    if (a !== undefined && b !== undefined) {
      cartas[3] = b;
      cartas[7] = a;
    }
    expect(validarEscalaSucia(cartas, 1).valida).toBe(false);
  });
});

describe("validarEscalaReal", () => {
  function realCompleta(pinta: Pinta): Carta[] {
    return VALORES.map((valor) => c(pinta, valor));
  }

  it("acepta 13 cartas del As al Rey de la misma pinta", () => {
    expect(validarEscalaReal(realCompleta("diamantes"), 0).valida).toBe(true);
  });

  it("rechaza comodines (el contrato da máximo 0)", () => {
    const cartas = realCompleta("diamantes");
    cartas[6] = comodin();
    expect(validarEscalaReal(cartas, 0).valida).toBe(false);
  });

  it("rechaza pintas mezcladas", () => {
    const cartas = realCompleta("diamantes");
    cartas[6] = c("picas", 7);
    expect(validarEscalaReal(cartas, 0).valida).toBe(false);
  });
});

describe("extenderEscala (para pegar)", () => {
  it("extiende por el final dando la vuelta por el As: J-Q-K-A + 2", () => {
    const escala = [c("diamantes", 11), c("diamantes", 12), c("diamantes", 13), c("diamantes", 1)];
    const dos = c("diamantes", 2);
    const resultado = extenderEscala(escala, dos);
    expect(resultado?.map((x) => x.id).at(-1)).toBe(dos.id);
  });

  it("extiende por el inicio dando la vuelta por el As: K + A-2-3-4", () => {
    const escala = [c("diamantes", 1), c("diamantes", 2), c("diamantes", 3), c("diamantes", 4)];
    const rey = c("diamantes", 13);
    const resultado = extenderEscala(escala, rey);
    expect(resultado?.map((x) => x.id)[0]).toBe(rey.id);
  });

  it("rechaza una carta de otra pinta", () => {
    const escala = [c("diamantes", 4), c("diamantes", 5), c("diamantes", 6), c("diamantes", 7)];
    expect(extenderEscala(escala, c("picas", 8))).toBeNull();
  });

  it("rechaza una carta que no toca ningún extremo", () => {
    const escala = [c("diamantes", 4), c("diamantes", 5), c("diamantes", 6), c("diamantes", 7)];
    expect(extenderEscala(escala, c("diamantes", 10))).toBeNull();
  });

  it("un comodín puede extender por el extremo pedido", () => {
    const escala = [c("diamantes", 4), c("diamantes", 5), c("diamantes", 6), c("diamantes", 7)];
    const resultado = extenderEscala(escala, comodin(), "inicio");
    expect(resultado?.[0]?.tipo).toBe("comodin");
  });
});
