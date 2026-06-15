import { describe, expect, it } from "vitest";
import { PALOS } from "./carta.js";
import { REGLAS_MENTIROSO } from "./reglas.js";

describe("REGLAS_MENTIROSO (§9)", () => {
  it("permite jugar entre 1 y 3 cartas por turno", () => {
    expect(REGLAS_MENTIROSO.cartasPorTurno).toEqual({ min: 1, max: 3 });
  });

  it("conoce los 4 palos de la baraja", () => {
    expect(REGLAS_MENTIROSO.palos).toEqual(PALOS);
    expect(REGLAS_MENTIROSO.palos).toHaveLength(4);
  });

  it("exige un palo distinto cada ronda nueva y solo importa el palo", () => {
    expect(REGLAS_MENTIROSO.nuevaRondaPaloDistinto).toBe(true);
    expect(REGLAS_MENTIROSO.soloImportaElPalo).toBe(true);
  });
});
