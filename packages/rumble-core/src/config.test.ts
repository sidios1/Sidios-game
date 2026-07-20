import { describe, expect, it } from "vitest";
import type { ConfigRumble } from "./config.js";
import {
  CONFIG_DEFAULT,
  parsearConfigRumble,
  validarConfigRumble,
} from "./config.js";

function con(cambios: Partial<ConfigRumble>): ConfigRumble {
  return { ...CONFIG_DEFAULT, ...cambios };
}

function motivo(config: ConfigRumble, numJugadores: number): string {
  const r = validarConfigRumble(config, numJugadores);
  if (r.valida) throw new Error("se esperaba una config inválida");
  return r.motivo;
}

describe("validarConfigRumble", () => {
  it("acepta la config por defecto para varias cantidades de jugadores", () => {
    expect(validarConfigRumble(CONFIG_DEFAULT, 2).valida).toBe(true);
    expect(validarConfigRumble(CONFIG_DEFAULT, 6).valida).toBe(true);
  });

  it("rechaza un pool vacío", () => {
    expect(motivo(con({ poolActivo: [] }), 4)).toMatch(/pool/i);
  });

  it("rechaza habilidadesPorJugador fuera de 1..3", () => {
    expect(motivo(con({ habilidadesPorJugador: 0 }), 4)).toMatch(/habilidadesPorJugador/);
    expect(motivo(con({ habilidadesPorJugador: 4 }), 4)).toMatch(/habilidadesPorJugador/);
    expect(motivo(con({ habilidadesPorJugador: 1.5 }), 4)).toMatch(/habilidadesPorJugador/);
  });

  it("rechaza 'únicas por ronda' cuando no alcanzan las habilidades", () => {
    // 4 jugadores × 3 = 12 necesarias, pool de 4 → infactible
    const config = con({
      colision: "unicasPorRonda",
      habilidadesPorJugador: 3,
      poolActivo: ["MISH", "RADAR", "AUGURIO", "GUASON"],
    });
    expect(motivo(config, 4)).toMatch(/únicas por ronda/i);
  });

  it("acepta 'únicas por ronda' cuando sí alcanzan", () => {
    const config = con({
      colision: "unicasPorRonda",
      habilidadesPorJugador: 2,
      // 2 jugadores × 2 = 4 ≤ 5 activas
      poolActivo: ["MISH", "RADAR", "AUGURIO", "GUASON", "MATO"],
    });
    expect(validarConfigRumble(config, 2).valida).toBe(true);
  });

  it("respeta la capacidad por jugador con anti-combo (§4)", () => {
    // Pool = solo el par prohibido: capacidad por jugador = 1
    const dosDelPar = con({ poolActivo: ["PESAO", "JUDIO"], habilidadesPorJugador: 2 });
    expect(motivo(dosDelPar, 2)).toMatch(/anti-combo/i);
    // Con 1 habilidad por jugador el mismo pool es válido
    const unaDelPar = con({ poolActivo: ["PESAO", "JUDIO"], habilidadesPorJugador: 1 });
    expect(validarConfigRumble(unaDelPar, 2).valida).toBe(true);
  });

  it("valida pesos personalizados", () => {
    const cero = con({ presetPesos: { tipo: "personalizado", pesos: { alto: 0, medio: 0, utilidad: 0 } } });
    expect(motivo(cero, 2)).toMatch(/positivo/i);
    const negativo = con({ presetPesos: { tipo: "personalizado", pesos: { alto: -1, medio: 2, utilidad: 3 } } });
    expect(motivo(negativo, 2)).toMatch(/negativ/i);
    const ok = con({ presetPesos: { tipo: "personalizado", pesos: { alto: 1, medio: 2, utilidad: 3 } } });
    expect(validarConfigRumble(ok, 2).valida).toBe(true);
  });

  it("valida la selección de rondas (§6.2)", () => {
    expect(motivo(con({ rondas: { tipo: "subconjunto", manos: [] } }), 2)).toMatch(/subconjunto/i);
    expect(motivo(con({ rondas: { tipo: "subconjunto", manos: [1, 10] } }), 2)).toMatch(/entre 1 y 9/);
    expect(motivo(con({ rondas: { tipo: "corta", n: 0 } }), 2)).toMatch(/corta/i);
    expect(validarConfigRumble(con({ rondas: { tipo: "corta", n: 4 } }), 2).valida).toBe(true);
  });
});

describe("parsearConfigRumble (forma estricta)", () => {
  it("acepta la config por defecto y hace round-trip por JSON", () => {
    const crudo = JSON.parse(JSON.stringify(CONFIG_DEFAULT)) as unknown;
    expect(parsearConfigRumble(crudo)).toEqual(CONFIG_DEFAULT);
  });

  it("acepta preset personalizado y rondas subconjunto", () => {
    const cfg = {
      ...CONFIG_DEFAULT,
      rondas: { tipo: "subconjunto", manos: [3, 5] },
      presetPesos: { tipo: "personalizado", pesos: { alto: 2, medio: 2, utilidad: 2 } },
    };
    expect(parsearConfigRumble(cfg)).toEqual(cfg);
  });

  it("rechaza (null) valores mal tipados o campos faltantes", () => {
    expect(parsearConfigRumble(null)).toBeNull();
    expect(parsearConfigRumble(42)).toBeNull();
    expect(parsearConfigRumble([])).toBeNull();
    expect(parsearConfigRumble({})).toBeNull();
    expect(parsearConfigRumble({ ...CONFIG_DEFAULT, habilidadesPorJugador: "1" })).toBeNull();
    expect(parsearConfigRumble({ ...CONFIG_DEFAULT, poolActivo: ["NO_EXISTE"] })).toBeNull();
    expect(parsearConfigRumble({ ...CONFIG_DEFAULT, visibilidad: "abierta" })).toBeNull();
    expect(parsearConfigRumble({ ...CONFIG_DEFAULT, rondas: { tipo: "infinita" } })).toBeNull();
    expect(
      parsearConfigRumble({
        ...CONFIG_DEFAULT,
        presetPesos: { tipo: "personalizado", pesos: { alto: 1, medio: 1, utilidad: "x" } },
      }),
    ).toBeNull();
  });

  it("copia los arrays (no comparte referencia con el crudo)", () => {
    const manos = [1, 2, 3];
    const parsed = parsearConfigRumble({
      ...CONFIG_DEFAULT,
      rondas: { tipo: "subconjunto", manos },
    });
    if (parsed?.rondas.tipo === "subconjunto") {
      expect(parsed.rondas.manos).not.toBe(manos);
      expect(parsed.rondas.manos).toEqual(manos);
    } else {
      throw new Error("se esperaba rondas subconjunto");
    }
  });
});
