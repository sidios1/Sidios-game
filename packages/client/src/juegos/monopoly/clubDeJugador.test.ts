import { describe, expect, it } from "vitest";
import { clubDeJugador } from "./clubDeJugador.js";
import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";

function club(id: string): ClubPool {
  return {
    id,
    nombre: `Club ${id}`,
    nombreOficial: `Club Oficial ${id}`,
    liga: "Premier League",
    imagenClaraUrl: `https://ejemplo.test/${id}-claro.png`,
    imagenOscuraUrl: `https://ejemplo.test/${id}-oscuro.png`,
  };
}

describe("clubDeJugador", () => {
  it("es determinístico: mismo jugadorId siempre da el mismo club", () => {
    const catalogo = [club("1"), club("2"), club("3")];
    const primero = clubDeJugador(catalogo, "jugador-abc");
    const segundo = clubDeJugador(catalogo, "jugador-abc");
    expect(primero).toEqual(segundo);
  });

  it("jugadores distintos pueden caer en clubes distintos", () => {
    const catalogo = Array.from({ length: 50 }, (_, i) => club(String(i)));
    const asignados = new Set(
      ["j1", "j2", "j3", "j4", "j5"].map((id) => clubDeJugador(catalogo, id)?.id),
    );
    expect(asignados.size).toBeGreaterThan(1);
  });

  it("devuelve null si el catálogo está vacío", () => {
    expect(clubDeJugador([], "j1")).toBeNull();
  });

  it("siempre devuelve un club presente en el catálogo", () => {
    const catalogo = [club("1"), club("2")];
    const asignado = clubDeJugador(catalogo, "cualquier-id");
    expect(catalogo.some((c) => c.id === asignado?.id)).toBe(true);
  });
});
