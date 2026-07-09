import { describe, expect, it } from "vitest";
import { CATALOGO } from "./catalogo.js";

describe("catálogo de juegos", () => {
  it("incluye Carioca con metadatos coherentes", () => {
    const carioca = CATALOGO.find((d) => d.id === "carioca");
    expect(carioca).toBeDefined();
    expect(carioca?.nombre).toBe("Carioca");
    // max:null = sin tope; si hay tope, debe ser ≥ min.
    if (carioca && carioca.jugadores.max !== null) {
      expect(carioca.jugadores.min).toBeLessThanOrEqual(carioca.jugadores.max);
    }
    expect(carioca?.jugadores.min).toBeGreaterThanOrEqual(2);
  });

  it("cada definición crea un IJuego con el ciclo de vida completo", () => {
    for (const definicion of CATALOGO) {
      const juego = definicion.crear();
      // crear() no debe montar nada todavía (sin DOM/WebGL): solo construir.
      expect(typeof juego.iniciar).toBe("function");
      expect(typeof juego.sincronizarEstado).toBe("function");
      expect(typeof juego.procesarAccion).toBe("function");
      expect(typeof juego.finalizar).toBe("function");
    }
  });

  it("no repite ids de juego", () => {
    const ids = CATALOGO.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
