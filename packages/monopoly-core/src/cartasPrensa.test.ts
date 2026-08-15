import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { CARTAS_PRENSA_DEPORTIVA, crearMazoPrensa, esNombreLigaValido, robarCartaPrensa } from "./cartasPrensa.js";

describe("cartasPrensa", () => {
  it("tiene las 16 cartas del §5 con ids únicos 1..16", () => {
    expect(CARTAS_PRENSA_DEPORTIVA).toHaveLength(16);
    const ids = CARTAS_PRENSA_DEPORTIVA.map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("crearMazoPrensa es determinista con la misma semilla", () => {
    const mazo1 = crearMazoPrensa(crearGeneradorSemilla(7));
    const mazo2 = crearMazoPrensa(crearGeneradorSemilla(7));
    expect(mazo1.map((c) => c.id)).toEqual(mazo2.map((c) => c.id));
    expect(mazo1).toHaveLength(16);
  });

  it("robar devuelve la de arriba y la manda al fondo: el mazo nunca se agota", () => {
    let mazo = crearMazoPrensa(crearGeneradorSemilla(1));
    const primeraId = mazo[0]?.id;
    const primeraVuelta = robarCartaPrensa(mazo);
    expect(primeraVuelta.carta.id).toBe(primeraId);
    expect(primeraVuelta.mazo).toHaveLength(16);
    expect(primeraVuelta.mazo[15]?.id).toBe(primeraId);

    // 16 robos más (17 en total) vuelve a dar la primera carta original.
    mazo = primeraVuelta.mazo;
    let ultimaCarta = primeraVuelta.carta;
    for (let i = 0; i < 16; i++) {
      const paso = robarCartaPrensa(mazo);
      ultimaCarta = paso.carta;
      mazo = paso.mazo;
    }
    expect(ultimaCarta.id).toBe(primeraId);
  });

  it("esNombreLigaValido valida contra las 8 ligas del tablero", () => {
    expect(esNombreLigaValido("MLS")).toBe(true);
    expect(esNombreLigaValido("Bundesliga")).toBe(true);
    expect(esNombreLigaValido("Premier League")).toBe(true);
    expect(esNombreLigaValido("Liga Chilena")).toBe(false);
    expect(esNombreLigaValido("")).toBe(false);
  });
});
