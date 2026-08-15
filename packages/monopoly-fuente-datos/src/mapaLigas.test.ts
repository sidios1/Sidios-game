import { describe, expect, it } from "vitest";

import { resolverLiga } from "./mapaLigas.js";

describe("resolverLiga (§2, §3.2)", () => {
  it("mapea las 8 strings reales del dataset a su NombreLiga", () => {
    expect(resolverLiga("Major League Soccer")).toBe("MLS");
    expect(resolverLiga("ROSHN Saudi League")).toBe("Arabia Saudita");
    expect(resolverLiga("Liga Portugal")).toBe("Liga Portugal");
    expect(resolverLiga("Ligue 1 McDonald's")).toBe("Ligue 1");
    expect(resolverLiga("Bundesliga")).toBe("Bundesliga");
    expect(resolverLiga("Serie A Enilive")).toBe("Serie A");
    expect(resolverLiga("LALIGA EA SPORTS")).toBe("La Liga");
    expect(resolverLiga("Premier League")).toBe("Premier League");
  });

  it('"Icons" no mapea a ninguna de las 8 → Resto del Mundo', () => {
    expect(resolverLiga("Icons")).toBeNull();
  });

  it("liga null → Resto del Mundo", () => {
    expect(resolverLiga(null)).toBeNull();
  });

  it("liga desconocida (fuera de las 8) → Resto del Mundo", () => {
    expect(resolverLiga("Eredivisie")).toBeNull();
    expect(resolverLiga("Liga Profesional de Fútbol")).toBeNull();
  });
});
