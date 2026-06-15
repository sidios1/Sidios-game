import { describe, expect, it } from "vitest";
import { barajar, crearGeneradorSemilla } from "./aleatorio.js";
import { PALOS } from "./carta.js";
import {
  CARTAS_POR_BARAJA,
  CARTAS_POR_PALO,
  crearBarajaCompleta,
  repartir,
} from "./baraja.js";

describe("crearBarajaCompleta", () => {
  it("tiene 52 cartas: 13 por palo", () => {
    const baraja = crearBarajaCompleta();
    expect(baraja).toHaveLength(CARTAS_POR_BARAJA);
    expect(baraja).toHaveLength(52);
    for (const palo of PALOS) {
      expect(baraja.filter((c) => c.palo === palo)).toHaveLength(CARTAS_POR_PALO);
    }
  });

  it("tiene ids únicos", () => {
    const baraja = crearBarajaCompleta();
    expect(new Set(baraja.map((c) => c.id)).size).toBe(baraja.length);
  });
});

describe("repartir", () => {
  it("reparte TODA la baraja sin perder cartas", () => {
    const baraja = crearBarajaCompleta();
    for (const n of [2, 3, 4, 5]) {
      const manos = repartir(baraja, n);
      expect(manos).toHaveLength(n);
      const total = manos.reduce((acc, m) => acc + m.length, 0);
      expect(total).toBe(baraja.length);
    }
  });

  it("reparte lo más parejo posible (a lo sumo 1 carta de diferencia)", () => {
    const baraja = crearBarajaCompleta(); // 52
    const manos = repartir(baraja, 3); // 18, 17, 17
    const tamanos = manos.map((m) => m.length);
    expect(Math.max(...tamanos) - Math.min(...tamanos)).toBeLessThanOrEqual(1);
    expect(tamanos).toEqual([18, 17, 17]);
  });
});

describe("barajar", () => {
  it("es determinista con la misma semilla", () => {
    const baraja = crearBarajaCompleta();
    const a = barajar(baraja, crearGeneradorSemilla(42));
    const b = barajar(baraja, crearGeneradorSemilla(42));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("produce órdenes distintos con semillas distintas", () => {
    const baraja = crearBarajaCompleta();
    const a = barajar(baraja, crearGeneradorSemilla(1));
    const b = barajar(baraja, crearGeneradorSemilla(2));
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });

  it("no muta la baraja original y conserva las 52 cartas", () => {
    const baraja = crearBarajaCompleta();
    const idsOriginales = baraja.map((c) => c.id);
    const barajada = barajar(baraja, crearGeneradorSemilla(7));
    expect(baraja.map((c) => c.id)).toEqual(idsOriginales);
    expect([...barajada.map((c) => c.id)].sort()).toEqual(
      [...idsOriginales].sort(),
    );
  });
});
