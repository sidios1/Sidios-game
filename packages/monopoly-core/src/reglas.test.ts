import { describe, expect, it } from "vitest";
import { REGLAS_MONOPOLY } from "./reglas.js";

describe("REGLAS_MONOPOLY", () => {
  it("transcribe los valores literales del reglamento", () => {
    expect(REGLAS_MONOPOLY.presupuestoInicial).toBe(1000);
    expect(REGLAS_MONOPOLY.sobresIniciales).toBe(6);
    expect(REGLAS_MONOPOLY.rondaActivacionTablero).toBe(2);
    expect(REGLAS_MONOPOLY.nuevaTemporadaMonto).toBe(100);
    expect(REGLAS_MONOPOLY.subasta).toEqual({ inicial: 10, incrementoMinimo: 10 });
    expect(REGLAS_MONOPOLY.renegociacion).toEqual({ multiplicador: 2 });
    expect(REGLAS_MONOPOLY.multaDescendido).toBe(25);
    expect(REGLAS_MONOPOLY.turnosEnDescendidoAntesDePerderJugador).toBe(3);
    expect(REGLAS_MONOPOLY.doblesSeguidosParaDescendido).toBe(3);
    expect(REGLAS_MONOPOLY.impuestos).toEqual({ doping: 100, apuestas: 50 });
    expect(REGLAS_MONOPOLY.tiers.liga).toEqual({ malo: 25, normal: 50, raro: 25 });
    expect(REGLAS_MONOPOLY.tiers.ligaCeldaMasCara).toEqual({ malo: 5, normal: 50, raro: 45 });
    expect(REGLAS_MONOPOLY.tiers.restoDelMundo).toEqual({ malo: 40, normal: 20, raro: 40 });
  });

  it("los tramos de cada tier suman 100", () => {
    for (const tramos of [
      REGLAS_MONOPOLY.tiers.liga,
      REGLAS_MONOPOLY.tiers.ligaCeldaMasCara,
      REGLAS_MONOPOLY.tiers.restoDelMundo,
    ]) {
      expect(tramos.malo + tramos.normal + tramos.raro).toBe(100);
    }
  });
});
