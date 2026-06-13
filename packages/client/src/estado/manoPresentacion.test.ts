import { describe, expect, it } from "vitest";
import { reconciliarMano, reordenar } from "./manoPresentacion.js";
import { carta } from "../pruebas/fabricas.js";

describe("reconciliarMano", () => {
  it("desde vacío toma el orden de la mano", () => {
    const mano = [carta("corazones", 5), carta("picas", 9)];
    expect(reconciliarMano([], mano)).toEqual([mano[0]!.id, mano[1]!.id]);
  });

  it("conserva el orden elegido de los ids que sobreviven", () => {
    const a = carta("corazones", 5);
    const b = carta("picas", 9);
    const c = carta("treboles", 2);
    // El jugador reordenó a [c, a, b]; la mano real sigue teniendo las 3.
    expect(reconciliarMano([c.id, a.id, b.id], [a, b, c])).toEqual([
      c.id,
      a.id,
      b.id,
    ]);
  });

  it("agrega las cartas nuevas al final, en orden de la mano", () => {
    const a = carta("corazones", 5);
    const b = carta("picas", 9);
    const nueva = carta("treboles", 2);
    expect(reconciliarMano([b.id, a.id], [a, b, nueva])).toEqual([
      b.id,
      a.id,
      nueva.id,
    ]);
  });

  it("descarta los ids que ya no están en mano", () => {
    const a = carta("corazones", 5);
    const b = carta("picas", 9);
    expect(reconciliarMano([a.id, b.id], [b])).toEqual([b.id]);
  });
});

describe("reordenar", () => {
  const ids = ["a", "b", "c", "d"];

  it("mueve una carta a una posición posterior", () => {
    expect(reordenar(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("mueve una carta a una posición anterior", () => {
    expect(reordenar(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("clampa el destino al final", () => {
    expect(reordenar(ids, "a", 99)).toEqual(["b", "c", "d", "a"]);
  });

  it("ignora un id que no está en el orden", () => {
    expect(reordenar(ids, "z", 0)).toEqual(ids);
  });
});
