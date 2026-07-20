import { describe, expect, it } from "vitest";
import type { Carta } from "@juegos/carioca-core";
import { crearCartaNormal, crearComodin } from "@juegos/carioca-core";
import { snapshotPintaMayoritaria } from "./snapshots.js";

let contador = 0;
function carta(pinta: "corazones" | "diamantes" | "treboles" | "picas", valor: number): Carta {
  contador += 1;
  return crearCartaNormal(pinta, valor as 1, String(contador));
}

describe("snapshotPintaMayoritaria (RADAR §3.1)", () => {
  it("reporta la pinta con más cartas normales por jugador", () => {
    const manos: Record<string, readonly Carta[]> = {
      ana: [carta("corazones", 2), carta("corazones", 5), carta("corazones", 9), carta("picas", 3), crearComodin(1)],
      beto: [carta("picas", 2), carta("picas", 4), carta("diamantes", 6)],
    };
    const snap = snapshotPintaMayoritaria(manos);
    expect(snap.ana).toBe("corazones");
    expect(snap.beto).toBe("picas");
  });

  it("devuelve null cuando la mano no tiene cartas normales", () => {
    const manos: Record<string, readonly Carta[]> = {
      vacio: [],
      soloComodines: [crearComodin(2), crearComodin(3)],
    };
    const snap = snapshotPintaMayoritaria(manos);
    expect(snap.vacio).toBeNull();
    expect(snap.soloComodines).toBeNull();
  });

  it("desempata de forma determinista por el orden de PINTAS", () => {
    // 2 corazones vs 2 diamantes → gana corazones (aparece antes en PINTAS)
    const manos: Record<string, readonly Carta[]> = {
      empate: [carta("diamantes", 2), carta("diamantes", 3), carta("corazones", 4), carta("corazones", 5)],
    };
    expect(snapshotPintaMayoritaria(manos).empate).toBe("corazones");
  });
});
