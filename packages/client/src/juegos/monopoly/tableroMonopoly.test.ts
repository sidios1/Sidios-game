import { describe, expect, it } from "vitest";
import {
  LADO_TABLERO,
  MEDIO_LADO_TABLERO,
  offsetFichaEnCelda,
  posicionCelda,
} from "./tableroMonopoly.js";
import { radioMesa } from "../../escena/dimensionesMesa.js";

describe("posicionCelda", () => {
  it("las 4 esquinas caen en las 4 esquinas del cuadrado", () => {
    const m = MEDIO_LADO_TABLERO;
    expect(posicionCelda(0)).toEqual({ x: m, z: m }); // Salida
    expect(posicionCelda(10)).toEqual({ x: -m, z: m }); // Cárcel
    expect(posicionCelda(20)).toEqual({ x: -m, z: -m }); // Palco del Club
    expect(posicionCelda(30)).toEqual({ x: m, z: -m }); // Descenso a la B
  });

  it("el tablero cubre por completo el fieltro circular por defecto de Escena", () => {
    // JUGADORES_FIELTRO_BASE=2 en tableroMonopoly.ts, mismo default con el que
    // arranca el constructor de Escena antes de la primera vista.
    expect(MEDIO_LADO_TABLERO).toBeGreaterThan(radioMesa(2));
  });

  it("es periódico: la vuelta completa (índice 40) vuelve a la Salida", () => {
    expect(posicionCelda(40)).toEqual(posicionCelda(0));
  });

  it("normaliza índices negativos igual que celdaEn del core", () => {
    expect(posicionCelda(-1)).toEqual(posicionCelda(39));
  });

  it("cada lado recorre 10 pasos monótonos entre sus dos esquinas", () => {
    const primerLado = Array.from({ length: 10 }, (_, i) => posicionCelda(i));
    for (let i = 1; i < primerLado.length; i++) {
      // Lado 0: z fijo (borde), x decrece monótonamente de +m hacia -m.
      expect(primerLado[i]!.z).toBeCloseTo(MEDIO_LADO_TABLERO);
      expect(primerLado[i]!.x).toBeLessThan(primerLado[i - 1]!.x);
    }
  });

  it("LADO_TABLERO es el doble del medio-lado", () => {
    expect(LADO_TABLERO).toBeCloseTo(MEDIO_LADO_TABLERO * 2);
  });
});

describe("offsetFichaEnCelda", () => {
  it("sin compañía, no hay offset", () => {
    expect(offsetFichaEnCelda(0, 1)).toEqual({ x: 0, z: 0 });
  });

  it("con varias fichas, cada slot tiene un offset distinto", () => {
    const offsets = [0, 1, 2].map((slot) => offsetFichaEnCelda(slot, 3));
    const claves = new Set(offsets.map((o) => `${o.x.toFixed(4)},${o.z.toFixed(4)}`));
    expect(claves.size).toBe(3);
  });
});
