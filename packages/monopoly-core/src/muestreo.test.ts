import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import type { JugadorPool } from "./fuenteSobres.js";
import {
  cortesPercentil,
  elegirJugadorParaSobre,
  elegirTecnicoParaSobre,
  elegirTier,
  excluirYaSorteados,
  muestrearPonderado,
} from "./muestreo.js";

function j(
  id: string,
  posicion: JugadorPool["posicion"],
  rating: number,
  jugadorId: string = id,
): JugadorPool {
  return { id, jugadorId, nombre: id, apellido: "", rating, posicion, calidad: "Normal" };
}

describe("muestrearPonderado", () => {
  it("respeta la distribución de pesos (seed fija, N grande)", () => {
    const rng = crearGeneradorSemilla(99);
    const items = ["a", "b", "c"] as const;
    const pesos: Record<string, number> = { a: 10, b: 80, c: 10 };
    const conteos: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 5000; i++) {
      const elegido = muestrearPonderado(items, (x) => pesos[x] ?? 0, rng);
      if (elegido !== undefined) conteos[elegido] = (conteos[elegido] ?? 0) + 1;
    }
    expect(conteos["b"]! / 5000).toBeGreaterThan(0.7);
    expect(conteos["a"]! / 5000).toBeLessThan(0.2);
  });

  it("devuelve undefined si todos los pesos son 0", () => {
    const rng = crearGeneradorSemilla(1);
    expect(muestrearPonderado([1, 2, 3], () => 0, rng)).toBeUndefined();
  });
});

describe("cortesPercentil (§3.2)", () => {
  it("corta 25/50/25 en partes proporcionales, malo = menor rating", () => {
    const pool = Array.from({ length: 20 }, (_, i) => j(`p${i}`, "ST", 50 + i));
    const cortes = cortesPercentil(pool, { malo: 25, normal: 50, raro: 25 });
    expect(cortes.malo).toHaveLength(5);
    expect(cortes.normal).toHaveLength(10);
    expect(cortes.raro).toHaveLength(5);
    expect(Math.max(...cortes.malo.map((p) => p.rating))).toBeLessThanOrEqual(
      Math.min(...cortes.raro.map((p) => p.rating)),
    );
  });

  it("corta 5/50/45 (bono de la celda más cara de cada liga)", () => {
    const pool = Array.from({ length: 20 }, (_, i) => j(`p${i}`, "ST", i));
    const cortes = cortesPercentil(pool, { malo: 5, normal: 50, raro: 45 });
    expect(cortes.malo).toHaveLength(1);
    expect(cortes.normal).toHaveLength(10);
    expect(cortes.raro).toHaveLength(9);
  });

  it("corta 40/20/40 (Resto del Mundo)", () => {
    const pool = Array.from({ length: 20 }, (_, i) => j(`p${i}`, "ST", i));
    const cortes = cortesPercentil(pool, { malo: 40, normal: 20, raro: 40 });
    expect(cortes.malo).toHaveLength(8);
    expect(cortes.normal).toHaveLength(4);
    expect(cortes.raro).toHaveLength(8);
  });
});

describe("elegirTier", () => {
  it("nunca elige un tier con probabilidad 0", () => {
    const rng = crearGeneradorSemilla(5);
    for (let i = 0; i < 200; i++) {
      expect(elegirTier({ malo: 0, normal: 100, raro: 0 }, rng)).toBe("normal");
    }
  });
});

describe("elegirJugadorParaSobre (cascada de fallback, §3.2)", () => {
  const tramos = { malo: 25, normal: 50, raro: 25 };

  it("nivel 0: cuando el tier sorteado tiene jugadores de la posición pedida, los usa", () => {
    const pool = Array.from({ length: 20 }, (_, i) => j(`p${i}`, i % 2 === 0 ? "GK" : "ST", 50 + i));
    const rng = crearGeneradorSemilla(3);
    const elegido = elegirJugadorParaSobre(pool, tramos, "GK", rng);
    expect(elegido?.posicion).toBe("GK");
  });

  it("fallback (nivel 1): un único jugador de la posición pedida en toda la liga siempre aparece, sin importar el tier sorteado", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => j(`st${i}`, "ST", i)),
      j("unico-gk", "GK", 99),
    ];
    const rng = crearGeneradorSemilla(11);
    for (let i = 0; i < 30; i++) {
      expect(elegirJugadorParaSobre(pool, tramos, "GK", rng)?.id).toBe("unico-gk");
    }
  });

  it("nivel 2: si la posición pedida no existe en absoluto en el pool, elige cualquiera del pool", () => {
    const pool = Array.from({ length: 10 }, (_, i) => j(`st${i}`, "ST", i));
    const rng = crearGeneradorSemilla(21);
    const elegido = elegirJugadorParaSobre(pool, tramos, "GK", rng);
    expect(elegido).toBeDefined();
    expect(elegido?.posicion).toBe("ST");
  });
});

describe("excluirYaSorteados (§9)", () => {
  it("filtra todas las entradas del jugadorId excluido, sin importar su id/posición", () => {
    const pool = [j("1-CB", "CB", 80, "1"), j("1-LB", "LB", 80, "1"), j("2-ST", "ST", 80, "2")];
    const resultado = excluirYaSorteados(pool, ["1"]);
    expect(resultado.map((p) => p.id)).toEqual(["2-ST"]);
  });

  it("devuelve el pool sin tocar si no hay excluidos", () => {
    const pool = [j("1-CB", "CB", 80, "1"), j("2-ST", "ST", 80, "2")];
    expect(excluirYaSorteados(pool, [])).toBe(pool);
  });

  it("combinado con elegirJugadorParaSobre: un futbolista ya sorteado no puede volver a salir con otra posición", () => {
    const tramos = { malo: 25, normal: 50, raro: 25 };
    const pool = [
      j("1-CB", "CB", 80, "1"),
      j("1-LB", "LB", 80, "1"),
      ...Array.from({ length: 10 }, (_, i) => j(`relleno${i}`, "ST", 50 + i)),
    ];
    const rng = crearGeneradorSemilla(7);

    const primero = elegirJugadorParaSobre(excluirYaSorteados(pool, []), tramos, "CB", rng);
    expect(primero?.jugadorId).toBe("1");

    const sorteados = [primero!.jugadorId];
    const segundo = elegirJugadorParaSobre(excluirYaSorteados(pool, sorteados), tramos, "LB", rng);
    expect(segundo?.jugadorId).not.toBe("1");
  });
});

describe("elegirTecnicoParaSobre", () => {
  it("elige un técnico del pool (uniforme, sin tier)", () => {
    const pool = [
      { id: "t1", nombre: "A", apellido: "B" },
      { id: "t2", nombre: "C", apellido: "D" },
    ];
    const rng = crearGeneradorSemilla(2);
    const elegido = elegirTecnicoParaSobre(pool, rng);
    expect(pool.map((t) => t.id)).toContain(elegido?.id);
  });

  it("devuelve undefined si el pool está vacío", () => {
    const rng = crearGeneradorSemilla(2);
    expect(elegirTecnicoParaSobre([], rng)).toBeUndefined();
  });
});
