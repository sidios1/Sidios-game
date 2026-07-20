import { describe, expect, it } from "vitest";
import type { HabilidadId, TierHabilidad } from "./habilidades.js";
import {
  ANTI_COMBOS,
  esAntiCombo,
  HABILIDADES,
  habilidadPorId,
  PESOS_TIER,
  TODAS_LAS_IDS,
} from "./habilidades.js";

function ids(tier: TierHabilidad): HabilidadId[] {
  return HABILIDADES.filter((h) => h.tier === tier).map((h) => h.id).sort();
}

describe("catálogo de habilidades", () => {
  it("define exactamente las 18 habilidades con ids únicas", () => {
    expect(HABILIDADES).toHaveLength(18);
    expect(TODAS_LAS_IDS).toHaveLength(18);
    expect(new Set(TODAS_LAS_IDS).size).toBe(18);
  });

  it("es serializable (round-trip JSON sin pérdidas ni funciones)", () => {
    const copia = JSON.parse(JSON.stringify(HABILIDADES)) as unknown;
    expect(copia).toEqual(HABILIDADES);
  });

  it("clasifica los tiers según §5", () => {
    expect(ids("alto")).toEqual(["DOBLE", "EXODIA", "GINYU", "JUDIO", "SAPO"]);
    expect(ids("medio")).toEqual(["CHATO", "EXTRA", "OJO", "PILLO", "TOCO", "TROLL"]);
    expect(ids("utilidad")).toEqual([
      "AUGURIO",
      "DECRETALO",
      "GUASON",
      "MATO",
      "MISH",
      "PESAO",
      "RADAR",
    ]);
  });

  it("agrupa 8 general / 6 primeros3Turnos / 4 dobleFilo (§9)", () => {
    const cuenta = (g: string) => HABILIDADES.filter((h) => h.grupo === g).length;
    // GUASON vive en primeros3Turnos (§9): acuña con costo dentro de la ventana B1.
    expect(cuenta("general")).toBe(8);
    expect(cuenta("primeros3Turnos")).toBe(6);
    expect(cuenta("dobleFilo")).toBe(4);
  });

  it("modela las ventanas de §3.2 (B1)", () => {
    const ventana = (id: HabilidadId) => habilidadPorId(id)?.ventana;
    expect(ventana("GINYU")).toEqual({ tipo: "primeros3Turnos", estricta: false });
    expect(ventana("CHATO")).toEqual({ tipo: "primeros3Turnos", estricta: false });
    expect(ventana("TROLL")).toEqual({ tipo: "primeros3Turnos", estricta: false });
    // GUASON: ventana de primeros 3 turnos (no estricta), movida desde General.
    expect(ventana("GUASON")).toEqual({ tipo: "primeros3Turnos", estricta: false });
    // EXODIA: ventana estricta (no ampliable)
    expect(ventana("EXODIA")).toEqual({ tipo: "primeros3Turnos", estricta: true });
    // MATO: excepción de ventana → toda la ronda
    expect(ventana("MATO")).toEqual({ tipo: "ronda" });
  });

  it("expone el anti-combo PESAO+JUDIO (§4), simétrico", () => {
    expect(ANTI_COMBOS).toContainEqual(["PESAO", "JUDIO"]);
    expect(esAntiCombo("PESAO", "JUDIO")).toBe(true);
    expect(esAntiCombo("JUDIO", "PESAO")).toBe(true);
    expect(esAntiCombo("PESAO", "SAPO")).toBe(false);
  });

  it("PESOS_TIER es el preset equilibrado 1/3/6 (PROVISIONAL §5)", () => {
    expect(PESOS_TIER).toEqual({ alto: 1, medio: 3, utilidad: 6 });
  });

  it("habilidadPorId encuentra cada id del catálogo", () => {
    for (const id of TODAS_LAS_IDS) {
      expect(habilidadPorId(id)?.id).toBe(id);
    }
  });
});
