import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "@juegos/carioca-core";
import type { ConfigRumble } from "./config.js";
import { CONFIG_DEFAULT } from "./config.js";
import type { HabilidadId, TierHabilidad } from "./habilidades.js";
import { habilidadPorId } from "./habilidades.js";
import { asignarHabilidadesRonda, muestrearPonderado } from "./muestreo.js";

function con(cambios: Partial<ConfigRumble>): ConfigRumble {
  return { ...CONFIG_DEFAULT, ...cambios };
}

function jugadores(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

function tierDe(id: HabilidadId): TierHabilidad {
  const h = habilidadPorId(id);
  if (h === undefined) throw new Error(`id desconocida: ${id}`);
  return h.tier;
}

describe("muestrearPonderado", () => {
  it("respeta los pesos de forma determinista", () => {
    const items = ["a", "b", "c"] as const;
    const pesos: Record<string, number> = { a: 0, b: 0, c: 5 };
    // con cualquier umbral solo "c" tiene peso
    const rng = crearGeneradorSemilla(1);
    for (let i = 0; i < 10; i++) {
      expect(muestrearPonderado(items, (it) => pesos[it] ?? 0, rng)).toBe("c");
    }
  });

  it("devuelve undefined si no hay items o todos pesan 0", () => {
    const rng = crearGeneradorSemilla(1);
    expect(muestrearPonderado([], () => 1, rng)).toBeUndefined();
    expect(muestrearPonderado(["a", "b"], () => 0, rng)).toBeUndefined();
  });
});

describe("asignarHabilidadesRonda", () => {
  it("es determinista bajo la misma semilla", () => {
    const config = con({ habilidadesPorJugador: 2 });
    const a = asignarHabilidadesRonda({ config, jugadorIds: jugadores(4), rng: crearGeneradorSemilla(7) });
    const b = asignarHabilidadesRonda({ config, jugadorIds: jugadores(4), rng: crearGeneradorSemilla(7) });
    expect(a).toEqual(b);
  });

  it("da a cada jugador el número de habilidades pedido", () => {
    for (const k of [1, 2, 3]) {
      const config = con({ habilidadesPorJugador: k });
      const { porJugador } = asignarHabilidadesRonda({
        config,
        jugadorIds: jugadores(3),
        rng: crearGeneradorSemilla(k),
      });
      for (const id of jugadores(3)) {
        expect(porJugador[id]).toHaveLength(k);
      }
    }
  });

  it("distribuye por tier según §5 (raras raras, utilidad común)", () => {
    // 1 habilidad por jugador, muchos jugadores, muestreo independiente.
    const config = con({ habilidadesPorJugador: 1 });
    const { porJugador } = asignarHabilidadesRonda({
      config,
      jugadorIds: jugadores(6000),
      rng: crearGeneradorSemilla(12345),
    });
    const cuenta: Record<TierHabilidad, number> = { alto: 0, medio: 0, utilidad: 0 };
    for (const asignadas of Object.values(porJugador)) {
      for (const id of asignadas) cuenta[tierDe(id)] += 1;
    }
    // pesos totales alto:5 medio:18 utilidad:42 → orden estricto esperado
    expect(cuenta.utilidad).toBeGreaterThan(cuenta.medio);
    expect(cuenta.medio).toBeGreaterThan(cuenta.alto);
  });

  it("nunca entrega PESAO+JUDIO al mismo jugador (§4), con 2 y 3 habilidades", () => {
    for (const k of [2, 3]) {
      const config = con({ habilidadesPorJugador: k });
      const { porJugador } = asignarHabilidadesRonda({
        config,
        jugadorIds: jugadores(2000),
        rng: crearGeneradorSemilla(999 + k),
      });
      for (const asignadas of Object.values(porJugador)) {
        const set = new Set(asignadas);
        expect(set.has("PESAO") && set.has("JUDIO")).toBe(false);
        // además, dentro del jugador no hay duplicados
        expect(set.size).toBe(asignadas.length);
      }
    }
  });

  it("con 'únicas por ronda' no repite habilidades entre jugadores", () => {
    const config = con({ colision: "unicasPorRonda", habilidadesPorJugador: 2 });
    const { porJugador } = asignarHabilidadesRonda({
      config,
      jugadorIds: jugadores(4), // 4 × 2 = 8 ≤ 18
      rng: crearGeneradorSemilla(3),
    });
    const todas = Object.values(porJugador).flat();
    expect(todas).toHaveLength(8);
    expect(new Set(todas).size).toBe(8);
  });

  it("con 'excluirUltima' evita la habilidad recibida la ronda previa (§6.6)", () => {
    const config = con({ repeticion: "excluirUltima", habilidadesPorJugador: 1 });
    for (let semilla = 0; semilla < 20; semilla++) {
      const { porJugador } = asignarHabilidadesRonda({
        config,
        jugadorIds: ["p0"],
        memoriaPrevia: { p0: ["SAPO"] },
        rng: crearGeneradorSemilla(semilla),
      });
      expect(porJugador.p0).not.toContain("SAPO");
    }
  });
});
