import { describe, expect, it } from "vitest";
import { barajar, crearGeneradorSemilla } from "./aleatorio.js";
import { crearCartaNormal, PINTAS, VALORES } from "./carta.js";
import {
  CANTIDAD_COMODINES,
  crearMazoCompleto,
  repartir,
  reponerMazoDesdePozo,
} from "./mazo.js";

describe("crearMazoCompleto", () => {
  it("tiene 108 cartas: 2 mazos ingleses + 4 comodines", () => {
    const mazo = crearMazoCompleto();
    expect(mazo).toHaveLength(108);
    expect(mazo.filter((c) => c.tipo === "comodin")).toHaveLength(
      CANTIDAD_COMODINES,
    );
  });

  it("contiene exactamente 2 copias de cada carta normal", () => {
    const mazo = crearMazoCompleto();
    for (const pinta of PINTAS) {
      for (const valor of VALORES) {
        const copias = mazo.filter(
          (c) => c.tipo === "normal" && c.pinta === pinta && c.valor === valor,
        );
        expect(copias).toHaveLength(2);
      }
    }
  });

  it("tiene ids únicos", () => {
    const mazo = crearMazoCompleto();
    expect(new Set(mazo.map((c) => c.id)).size).toBe(mazo.length);
  });
});

describe("barajar", () => {
  it("es determinista con la misma semilla", () => {
    const mazo = crearMazoCompleto();
    const a = barajar(mazo, crearGeneradorSemilla(42));
    const b = barajar(mazo, crearGeneradorSemilla(42));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("produce órdenes distintos con semillas distintas", () => {
    const mazo = crearMazoCompleto();
    const a = barajar(mazo, crearGeneradorSemilla(1));
    const b = barajar(mazo, crearGeneradorSemilla(2));
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });

  it("no muta el mazo original y conserva las 108 cartas", () => {
    const mazo = crearMazoCompleto();
    const idsOriginales = mazo.map((c) => c.id);
    const barajado = barajar(mazo, crearGeneradorSemilla(7));
    expect(mazo.map((c) => c.id)).toEqual(idsOriginales);
    expect([...barajado.map((c) => c.id)].sort()).toEqual(
      [...idsOriginales].sort(),
    );
  });
});

describe("repartir", () => {
  it("entrega 12 cartas a cada jugador desde la cima", () => {
    const mazo = crearMazoCompleto();
    const { manos, mazoRestante } = repartir(mazo, 4, 12);
    expect(manos).toHaveLength(4);
    for (const mano of manos) expect(mano).toHaveLength(12);
    expect(mazoRestante).toHaveLength(108 - 48);
    const primeraRepartida = manos[0]?.[0];
    expect(primeraRepartida?.id).toBe(mazo[mazo.length - 1]?.id);
  });
});

describe("reponerMazoDesdePozo", () => {
  it("conserva la cima del pozo y la última carta descartada se roba primero", () => {
    const c1 = crearCartaNormal("corazones", 3, "a");
    const c2 = crearCartaNormal("picas", 8, "a");
    const c3 = crearCartaNormal("treboles", 11, "b");
    const { mazo, pozo } = reponerMazoDesdePozo([c1, c2, c3]);
    expect(pozo.map((c) => c.id)).toEqual([c3.id]);
    // la cima del mazo (último elemento) debe ser c2: se roba antes que c1
    expect(mazo.map((c) => c.id)).toEqual([c1.id, c2.id]);
  });

  it("con 1 carta o menos no hay nada que reponer", () => {
    const c1 = crearCartaNormal("diamantes", 5, "a");
    expect(reponerMazoDesdePozo([c1])).toEqual({ mazo: [], pozo: [c1] });
    expect(reponerMazoDesdePozo([])).toEqual({ mazo: [], pozo: [] });
  });
});
