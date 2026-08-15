import { describe, expect, it } from "vitest";
import { celdaEn, celdasDeLiga, esCeldaComprable, TABLERO_MONOPOLY, LIGAS } from "./tablero.js";

describe("tablero", () => {
  it("tiene 40 celdas", () => {
    expect(TABLERO_MONOPOLY).toHaveLength(40);
  });

  it("tiene los conteos correctos por tipo (§2)", () => {
    const conteos: Record<string, number> = {};
    for (const celda of TABLERO_MONOPOLY) {
      conteos[celda.tipo] = (conteos[celda.tipo] ?? 0) + 1;
    }
    expect(conteos["liga"]).toBe(22);
    expect(conteos["restoDelMundo"]).toBe(4);
    expect(conteos["tecnicos"]).toBe(2);
    expect(conteos["salida"]).toBe(1);
    expect(conteos["carcel"]).toBe(1);
    expect(conteos["palcoDelClub"]).toBe(1);
    expect(conteos["descensoALaB"]).toBe(1);
    expect(conteos["multaDoping"]).toBe(1);
    expect(conteos["multaApuestas"]).toBe(1);
    expect(conteos["prensaDeportiva"]).toBe(3);
    expect(conteos["pausaDeHidratacion"]).toBe(3);
  });

  it("respeta la tabla de precios exacta de la §3.1", () => {
    expect(celdasDeLiga("MLS").map((c) => c.precio)).toEqual([10, 20]);
    expect(celdasDeLiga("Arabia Saudita").map((c) => c.precio)).toEqual([30, 30, 45]);
    expect(celdasDeLiga("Liga Portugal").map((c) => c.precio)).toEqual([55, 55, 65]);
    expect(celdasDeLiga("Ligue 1").map((c) => c.precio)).toEqual([75, 75, 90]);
    expect(celdasDeLiga("Bundesliga").map((c) => c.precio)).toEqual([100, 100, 110]);
    expect(celdasDeLiga("Serie A").map((c) => c.precio)).toEqual([120, 120, 135]);
    expect(celdasDeLiga("La Liga").map((c) => c.precio)).toEqual([145, 145, 155]);
    expect(celdasDeLiga("Premier League").map((c) => c.precio)).toEqual([170, 200]);
  });

  it("marca esCeldaMasCara en exactamente la celda más cara de cada liga", () => {
    for (const liga of LIGAS) {
      const celdas = celdasDeLiga(liga);
      const masCaras = celdas.filter((c) => c.esCeldaMasCara);
      expect(masCaras).toHaveLength(1);
      const precioMax = Math.max(...celdas.map((c) => c.precio));
      expect(masCaras[0]?.precio).toBe(precioMax);
    }
  });

  it("ubica la Multa por Doping entre MLS y el primer Resto del Mundo (§2)", () => {
    const doping = TABLERO_MONOPOLY.find((c) => c.tipo === "multaDoping");
    expect(doping?.indice).toBe(4);
    expect(celdaEn(3).tipo).toBe("liga");
    expect(celdaEn(5).tipo).toBe("restoDelMundo");
  });

  it("ubica la Multa por Apuestas entre las dos celdas de Premier League (§2)", () => {
    const apuestas = TABLERO_MONOPOLY.find((c) => c.tipo === "multaApuestas");
    expect(apuestas?.indice).toBe(38);
    const anterior = celdaEn(37);
    const siguiente = celdaEn(39);
    expect(anterior.tipo === "liga" && anterior.liga === "Premier League").toBe(true);
    expect(siguiente.tipo === "liga" && siguiente.liga === "Premier League").toBe(true);
  });

  it("esCeldaComprable distingue celdas comprables de las demás", () => {
    expect(esCeldaComprable(celdaEn(1))).toBe(true); // MLS
    expect(esCeldaComprable(celdaEn(5))).toBe(true); // Resto del Mundo
    expect(esCeldaComprable(celdaEn(12))).toBe(true); // Técnicos
    expect(esCeldaComprable(celdaEn(0))).toBe(false); // Salida
    expect(esCeldaComprable(celdaEn(7))).toBe(false); // Prensa Deportiva
    expect(esCeldaComprable(celdaEn(4))).toBe(false); // Multa por Doping
  });

  it("celdaEn normaliza índices fuera de rango (útil para movimiento circular)", () => {
    expect(celdaEn(40)).toEqual(celdaEn(0));
    expect(celdaEn(-1)).toEqual(celdaEn(39));
  });
});
