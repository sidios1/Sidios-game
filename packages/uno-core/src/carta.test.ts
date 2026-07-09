import { describe, expect, it } from "vitest";
import { esComodin, incrementoMas, valorPuntos } from "./carta.js";
import { comodin, num, simbolo } from "./apoyoPruebas.js";

describe("valorPuntos", () => {
  it("número vale su nominal", () => {
    expect(valorPuntos(num("rojo", 0))).toBe(0);
    expect(valorPuntos(num("verde", 7))).toBe(7);
    expect(valorPuntos(num("azul", 9))).toBe(9);
  });

  it("skip/reverse/+2 valen 20", () => {
    expect(valorPuntos(simbolo("rojo", "skip"))).toBe(20);
    expect(valorPuntos(simbolo("amarillo", "reverse"))).toBe(20);
    expect(valorPuntos(simbolo("verde", "mas2"))).toBe(20);
  });

  it("wild y +4 valen 50", () => {
    expect(valorPuntos(comodin("wild"))).toBe(50);
    expect(valorPuntos(comodin("mas4"))).toBe(50);
  });
});

describe("incrementoMas", () => {
  it("solo +2 y +4 suman al acumulador", () => {
    expect(incrementoMas(simbolo("rojo", "mas2"))).toBe(2);
    expect(incrementoMas(comodin("mas4"))).toBe(4);
    expect(incrementoMas(num("azul", 5))).toBe(0);
    expect(incrementoMas(simbolo("verde", "skip"))).toBe(0);
    expect(incrementoMas(comodin("wild"))).toBe(0);
  });
});

describe("esComodin", () => {
  it("distingue comodines de cartas de color", () => {
    expect(esComodin(comodin("wild"))).toBe(true);
    expect(esComodin(comodin("mas4"))).toBe(true);
    expect(esComodin(num("rojo", 3))).toBe(false);
    expect(esComodin(simbolo("azul", "mas2"))).toBe(false);
  });
});
