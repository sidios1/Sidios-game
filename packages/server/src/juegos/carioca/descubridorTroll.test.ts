import { describe, expect, it } from "vitest";
import {
  crearCartaNormal,
  crearComodin,
  resetearCartasDeMano,
  crearGeneradorSemilla,
  crearPartida,
  type Carta,
  type EstadoPartida,
} from "@juegos/carioca-core";
import { descubrirCombinacionesTroll } from "./descubridorTroll.js";

const N = crearCartaNormal;

describe("descubrirCombinacionesTroll", () => {
  it("descubre un trío (3 del mismo número)", () => {
    const mano: Carta[] = [
      N("picas", 7, "a"),
      N("corazones", 7, "b"),
      N("treboles", 7, "c"),
      N("picas", 2, "d"),
    ];
    const ids = descubrirCombinacionesTroll(mano);
    expect(ids.sort()).toEqual(
      [mano[0]!.id, mano[1]!.id, mano[2]!.id].sort(),
    );
  });

  it("descubre una escala (4 consecutivas de la misma pinta)", () => {
    const mano: Carta[] = [
      N("picas", 4, "a"),
      N("picas", 5, "b"),
      N("picas", 6, "c"),
      N("picas", 7, "d"),
      N("corazones", 10, "e"),
    ];
    const ids = descubrirCombinacionesTroll(mano);
    expect(new Set(ids)).toEqual(
      new Set([mano[0]!.id, mano[1]!.id, mano[2]!.id, mano[3]!.id]),
    );
  });

  it("no descubre nada si no hay combinaciones", () => {
    const mano: Carta[] = [
      N("picas", 2, "a"),
      N("corazones", 5, "b"),
      N("treboles", 9, "c"),
      crearComodin(0),
    ];
    expect(descubrirCombinacionesTroll(mano)).toEqual([]);
  });

  it("los ids descubiertos se pueden resetear vía resetearCartasDeMano (costura S1)", () => {
    const creada = crearPartida(
      [
        { id: "ana", nombre: "Ana" },
        { id: "beto", nombre: "Beto" },
      ],
      crearGeneradorSemilla(1),
    );
    if (!creada.ok) return;
    const manoTroll: Carta[] = [
      N("picas", 4, "a"),
      N("picas", 5, "b"),
      N("picas", 6, "c"),
      N("picas", 7, "d"),
      N("corazones", 9, "e"),
    ];
    const estado: EstadoPartida = {
      ...creada.valor,
      jugadores: creada.valor.jugadores.map((j, i) =>
        i === 0 ? { ...j, mano: manoTroll } : j,
      ),
    };
    const objetivoId = estado.jugadores[0]!.id;
    const ids = descubrirCombinacionesTroll(manoTroll);
    expect(ids.length).toBe(4);
    const res = resetearCartasDeMano(estado, objetivoId, ids, crearGeneradorSemilla(9));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const nueva = res.valor.jugadores[0]!.mano;
      // La mano conserva su tamaño (se repartieron 4 nuevas por las 4 reseteadas).
      expect(nueva.length).toBe(manoTroll.length);
    }
  });
});
