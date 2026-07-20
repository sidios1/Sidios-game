// INSTRUMENTACIÓN de calibración (§8 de REGLAS_RUMBLE.md), no decisión.
//
// §8 dice explícitamente que los provisionales NO se resuelven por cuenta propia:
// estos tests MIDEN y emiten tablas para que un humano decida. No cambian ningún
// valor ni quitan ningún marcador `// PROVISIONAL`.
//
// Deterministas: RNG sembrado, así que las tablas son reproducibles y las
// aserciones no son flaky.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "@juegos/carioca-core";
import { CONFIG_DEFAULT } from "./config.js";
import type { HabilidadId, TierHabilidad } from "./habilidades.js";
import { HABILIDADES, PESOS_TIER, habilidadPorId } from "./habilidades.js";
import { asignarHabilidadesRonda } from "./muestreo.js";

const RONDAS = 20000;
const JUGADORES = ["j1", "j2", "j3", "j4"];

/** Cuenta cuántas veces sale cada habilidad en N rondas de asignación. */
function medirFrecuencias(): {
  porId: Map<HabilidadId, number>;
  porTier: Map<TierHabilidad, number>;
  total: number;
} {
  const rng = crearGeneradorSemilla(20260719);
  const porId = new Map<HabilidadId, number>();
  const porTier = new Map<TierHabilidad, number>();
  let total = 0;
  for (let r = 0; r < RONDAS; r += 1) {
    const { porJugador } = asignarHabilidadesRonda({
      config: CONFIG_DEFAULT,
      jugadorIds: JUGADORES,
      rng,
    });
    for (const ids of Object.values(porJugador)) {
      for (const id of ids) {
        porId.set(id, (porId.get(id) ?? 0) + 1);
        const tier = habilidadPorId(id)?.tier;
        if (tier !== undefined) porTier.set(tier, (porTier.get(tier) ?? 0) + 1);
        total += 1;
      }
    }
  }
  return { porId, porTier, total };
}

/** Probabilidad teórica de un tier con los pesos actuales. */
function esperadoPorTier(): Map<TierHabilidad, number> {
  const suma = HABILIDADES.reduce((acc, h) => acc + PESOS_TIER[h.tier], 0);
  const mapa = new Map<TierHabilidad, number>();
  for (const h of HABILIDADES) {
    mapa.set(h.tier, (mapa.get(h.tier) ?? 0) + PESOS_TIER[h.tier] / suma);
  }
  return mapa;
}

describe("Calibración §8.2 — pesos por tier (PROVISIONAL 1/3/6)", () => {
  it("mide la distribución empírica por tier y por habilidad", () => {
    const { porId, porTier, total } = medirFrecuencias();
    const esperado = esperadoPorTier();

    const filasTier = [...porTier.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tier, n]) => ({
        tier,
        peso: PESOS_TIER[tier],
        habilidades: HABILIDADES.filter((h) => h.tier === tier).length,
        observado: `${((n / total) * 100).toFixed(2)}%`,
        esperado: `${(((esperado.get(tier) ?? 0) as number) * 100).toFixed(2)}%`,
      }));

    const filasId = [...porId.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({
        habilidad: id,
        tier: habilidadPorId(id)?.tier ?? "?",
        frecuencia: `${((n / total) * 100).toFixed(2)}%`,
        porRonda: (n / RONDAS).toFixed(3),
      }));

    console.log(`\n── §8.2 Distribución por tier · ${RONDAS} rondas × ${JUGADORES.length} jugadores ──`);
    console.table(filasTier);
    console.log("── Frecuencia por habilidad ──");
    console.table(filasId);

    // Invariante: con pesos 1/3/6 el orden de masa por tier es utilidad > medio > alto.
    const orden = [...porTier.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    expect(orden).toEqual(["utilidad", "medio", "alto"]);

    // Y cada tier cae cerca de su probabilidad teórica (±1 punto porcentual).
    for (const [tier, n] of porTier) {
      expect(Math.abs(n / total - (esperado.get(tier) ?? 0))).toBeLessThan(0.01);
    }
  });

  it("mide cuánto sube el tier alto si se aplanan los pesos (referencia para decidir)", () => {
    // Comparativa útil para §8.2: cuánto cambia la exposición a las 5 altas.
    const variantes: ReadonlyArray<readonly [string, Record<TierHabilidad, number>]> = [
      ["actual 1/3/6", { alto: 1, medio: 3, utilidad: 6 }],
      ["1/2/4", { alto: 1, medio: 2, utilidad: 4 }],
      ["1/2/3", { alto: 1, medio: 2, utilidad: 3 }],
      ["caos 1/1/1", { alto: 1, medio: 1, utilidad: 1 }],
    ];
    const filas = variantes.map(([nombre, pesos]) => {
      const suma = HABILIDADES.reduce((acc, h) => acc + pesos[h.tier], 0);
      const masa = (tier: TierHabilidad): string => {
        const p = HABILIDADES.filter((h) => h.tier === tier).reduce(
          (acc, h) => acc + pesos[h.tier] / suma,
          0,
        );
        return `${(p * 100).toFixed(1)}%`;
      };
      return { preset: nombre, alto: masa("alto"), medio: masa("medio"), utilidad: masa("utilidad") };
    });
    console.log("\n── §8.2 Masa por tier según preset (teórica) ──");
    console.table(filas);
    expect(filas).toHaveLength(4);
  });
});

describe("Calibración §5/§8.4 — exposición de GUASON", () => {
  it("mide con qué frecuencia aparece GUASON (hoy tier utilidad)", () => {
    const { porId, total } = medirFrecuencias();
    const guason = porId.get("GUASON") ?? 0;
    const rondasConGuason = guason / RONDAS; // esperado por ronda, 4 jugadores

    console.log("\n── §5 GUASON · exposición con el tier actual ──");
    console.table([
      {
        tier: habilidadPorId("GUASON")?.tier ?? "?",
        peso: PESOS_TIER[habilidadPorId("GUASON")?.tier ?? "utilidad"],
        "% de asignaciones": `${((guason / total) * 100).toFixed(2)}%`,
        "apariciones por ronda (4 jug.)": rondasConGuason.toFixed(3),
        "rondas hasta 1 aparición": (1 / rondasConGuason).toFixed(2),
      },
    ]);

    // GUASON está en utilidad: aparece más que cualquier habilidad de tier alto.
    const sapo = porId.get("SAPO") ?? 0; // tier alto de referencia
    expect(guason).toBeGreaterThan(sapo);
  });
});
