import { describe, expect, it } from "vitest";
import { barajar, crearGeneradorSemilla } from "./aleatorio.js";
import { crearCartaNormal, PINTAS, VALORES } from "./carta.js";
import {
  comodinesParaJugadores,
  crearMazoCompleto,
  mazosParaJugadores,
  repartir,
  reponerMazoDesdePozo,
} from "./mazo.js";

/** Cartas por mazo inglés: 4 pintas × 13 valores. */
const CARTAS_POR_MAZO = PINTAS.length * VALORES.length; // 52

describe("mazosParaJugadores", () => {
  it("escala según la fórmula 2 × máx(1, piso(j/4))", () => {
    expect(mazosParaJugadores(2)).toBe(2);
    expect(mazosParaJugadores(4)).toBe(2);
    expect(mazosParaJugadores(6)).toBe(2);
    expect(mazosParaJugadores(8)).toBe(4);
    expect(mazosParaJugadores(12)).toBe(6);
    expect(mazosParaJugadores(16)).toBe(8);
  });

  it("los comodines escalan a 2 por mazo", () => {
    for (const j of [2, 4, 6, 8, 12, 16]) {
      expect(comodinesParaJugadores(j)).toBe(mazosParaJugadores(j) * 2);
    }
  });
});

describe("crearMazoCompleto", () => {
  it("con 2–6 jugadores es el mazo clásico: 108 cartas (2 mazos + 4 comodines)", () => {
    const mazo = crearMazoCompleto(2);
    expect(mazo).toHaveLength(108);
    expect(mazo.filter((c) => c.tipo === "comodin")).toHaveLength(4);
  });

  it("tiene la cantidad de cartas y comodines de la fórmula para cada conteo", () => {
    for (const j of [2, 4, 6, 8, 12, 16]) {
      const numMazos = mazosParaJugadores(j);
      const mazo = crearMazoCompleto(j);
      expect(mazo).toHaveLength(
        numMazos * CARTAS_POR_MAZO + comodinesParaJugadores(j),
      );
      expect(mazo.filter((c) => c.tipo === "comodin")).toHaveLength(
        comodinesParaJugadores(j),
      );
    }
  });

  it("contiene tantas copias de cada carta normal como mazos haya", () => {
    const j = 8; // 4 mazos
    const mazo = crearMazoCompleto(j);
    for (const pinta of PINTAS) {
      for (const valor of VALORES) {
        const copias = mazo.filter(
          (c) => c.tipo === "normal" && c.pinta === pinta && c.valor === valor,
        );
        expect(copias).toHaveLength(mazosParaJugadores(j));
      }
    }
  });

  it("tiene ids únicos para cualquier cantidad de jugadores", () => {
    for (const j of [2, 4, 6, 8, 12, 16]) {
      const mazo = crearMazoCompleto(j);
      expect(new Set(mazo.map((c) => c.id)).size).toBe(mazo.length);
    }
  });

  it("reparte 12 cartas a cada jugador y deja cartas para abrir el pozo", () => {
    for (const j of [2, 4, 6, 8, 12, 16]) {
      const mazo = crearMazoCompleto(j);
      const { manos, mazoRestante } = repartir(mazo, j, 12);
      expect(manos).toHaveLength(j);
      for (const mano of manos) expect(mano).toHaveLength(12);
      expect(mazoRestante.length).toBe(mazo.length - j * 12);
      expect(mazoRestante.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("barajar", () => {
  it("es determinista con la misma semilla", () => {
    const mazo = crearMazoCompleto(4);
    const a = barajar(mazo, crearGeneradorSemilla(42));
    const b = barajar(mazo, crearGeneradorSemilla(42));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("produce órdenes distintos con semillas distintas", () => {
    const mazo = crearMazoCompleto(4);
    const a = barajar(mazo, crearGeneradorSemilla(1));
    const b = barajar(mazo, crearGeneradorSemilla(2));
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });

  it("no muta el mazo original y conserva las 108 cartas", () => {
    const mazo = crearMazoCompleto(4);
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
    const mazo = crearMazoCompleto(4);
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
