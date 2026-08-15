import { describe, expect, it } from "vitest";

import { construirCatalogoClubes } from "./clubes.js";
import type { ClubCrudo } from "./tiposCrudos.js";

function club(datos: Partial<ClubCrudo> & { id: number }): ClubCrudo {
  return {
    nombre: "Club",
    nombreOficial: "Club Oficial",
    liga: "Bundesliga",
    imagenClaraUrl: "https://example.com/light.png",
    imagenOscuraUrl: "https://example.com/dark.png",
    ...datos,
  };
}

describe("construirCatalogoClubes (§1.1)", () => {
  it("mapea 1:1 con id string", () => {
    const clubes = construirCatalogoClubes([
      club({ id: 22, nombre: "Borussia Dortmund", nombreOficial: "Borussia Dortmund" }),
    ]);
    expect(clubes).toEqual([
      {
        id: "22",
        nombre: "Borussia Dortmund",
        nombreOficial: "Borussia Dortmund",
        liga: "Bundesliga",
        imagenClaraUrl: "https://example.com/light.png",
        imagenOscuraUrl: "https://example.com/dark.png",
      },
    ]);
  });

  it("preserva la cantidad de entrada", () => {
    const clubes = construirCatalogoClubes([club({ id: 1 }), club({ id: 2 }), club({ id: 3 })]);
    expect(clubes).toHaveLength(3);
  });
});
