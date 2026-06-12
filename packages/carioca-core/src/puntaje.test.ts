import { describe, expect, it } from "vitest";
import { crearCartaNormal, crearComodin, VALORES } from "./carta.js";
import { puntosCarta, puntosMano } from "./puntaje.js";

describe("puntosCarta", () => {
  it("2 a 9 valen su número", () => {
    for (const valor of VALORES.filter((v) => v >= 2 && v <= 9)) {
      expect(puntosCarta(crearCartaNormal("treboles", valor, "a"))).toBe(valor);
    }
  });

  it("10, J, Q y K valen 10", () => {
    for (const valor of VALORES.filter((v) => v >= 10)) {
      expect(puntosCarta(crearCartaNormal("picas", valor, "a"))).toBe(10);
    }
  });

  it("el As vale 20", () => {
    expect(puntosCarta(crearCartaNormal("corazones", 1, "a"))).toBe(20);
  });

  it("el comodín vale 30", () => {
    expect(puntosCarta(crearComodin(1))).toBe(30);
  });

  it("el 2 rojo es una carta normal: vale 2, no es comodín", () => {
    expect(puntosCarta(crearCartaNormal("corazones", 2, "a"))).toBe(2);
    expect(puntosCarta(crearCartaNormal("diamantes", 2, "b"))).toBe(2);
  });
});

describe("puntosMano", () => {
  it("suma los puntos de todas las cartas", () => {
    const mano = [
      crearCartaNormal("corazones", 1, "a"), // 20
      crearCartaNormal("picas", 13, "a"), // 10
      crearCartaNormal("treboles", 7, "a"), // 7
      crearComodin(2), // 30
    ];
    expect(puntosMano(mano)).toBe(67);
  });

  it("una mano vacía suma 0", () => {
    expect(puntosMano([])).toBe(0);
  });
});
