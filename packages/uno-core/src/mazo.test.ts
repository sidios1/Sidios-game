import { describe, expect, it } from "vitest";
import { COLORES, esComodin } from "./carta.js";
import { crearMazoCompleto, TOTAL_CARTAS } from "./mazo.js";
import { barajar, crearGeneradorSemilla } from "./aleatorio.js";

describe("crearMazoCompleto", () => {
  it("tiene 108 cartas", () => {
    expect(crearMazoCompleto()).toHaveLength(TOTAL_CARTAS);
  });

  it("tiene ids únicos", () => {
    const ids = crearMazoCompleto().map((c) => c.id);
    expect(new Set(ids).size).toBe(TOTAL_CARTAS);
  });

  it("respeta las cantidades por color (25 cada uno)", () => {
    const mazo = crearMazoCompleto();
    for (const color of COLORES) {
      const delColor = mazo.filter((c) => !esComodin(c) && c.color === color);
      expect(delColor).toHaveLength(25);
      // un 0, dos de cada 1–9 (18), dos de cada símbolo (6).
      expect(delColor.filter((c) => c.tipo === "numero" && c.valor === 0)).toHaveLength(1);
      expect(delColor.filter((c) => c.tipo === "numero" && c.valor === 7)).toHaveLength(2);
      expect(delColor.filter((c) => c.tipo === "skip")).toHaveLength(2);
      expect(delColor.filter((c) => c.tipo === "reverse")).toHaveLength(2);
      expect(delColor.filter((c) => c.tipo === "mas2")).toHaveLength(2);
    }
  });

  it("tiene 4 wild y 4 +4", () => {
    const mazo = crearMazoCompleto();
    expect(mazo.filter((c) => c.tipo === "wild")).toHaveLength(4);
    expect(mazo.filter((c) => c.tipo === "mas4")).toHaveLength(4);
  });
});

describe("barajar", () => {
  it("es determinista con la misma semilla", () => {
    const a = barajar(crearMazoCompleto(), crearGeneradorSemilla(123)).map((c) => c.id);
    const b = barajar(crearMazoCompleto(), crearGeneradorSemilla(123)).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("semillas distintas dan órdenes distintos", () => {
    const a = barajar(crearMazoCompleto(), crearGeneradorSemilla(1)).map((c) => c.id);
    const b = barajar(crearMazoCompleto(), crearGeneradorSemilla(2)).map((c) => c.id);
    expect(a).not.toEqual(b);
  });
});
