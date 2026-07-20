import { describe, expect, it } from "vitest";
import { cargaDisponible, consumirCarga, crearCargasIniciales, ventanaVigente } from "./cargas.js";
import type { HabilidadId } from "./habilidades.js";
import { habilidadPorId } from "./habilidades.js";

function h(id: HabilidadId) {
  const habilidad = habilidadPorId(id);
  if (habilidad === undefined) throw new Error(`id desconocida: ${id}`);
  return habilidad;
}

describe("cargas iniciales (§2.1)", () => {
  it("traduce cada tipo de carga a sus restantes", () => {
    expect(crearCargasIniciales(h("MISH"))).toEqual({ restantes: 1 }); // usos
    expect(crearCargasIniciales(h("DECRETALO"))).toEqual({ restantes: 3 }); // robos
    expect(crearCargasIniciales(h("AUGURIO"))).toEqual({ restantes: 3 }); // consultas
    expect(crearCargasIniciales(h("RADAR"))).toEqual({ restantes: null }); // pasiva
  });
});

describe("consumir y disponer cargas", () => {
  it("consume sin bajar de cero y respeta las pasivas", () => {
    const usos = crearCargasIniciales(h("MISH"));
    const tras = consumirCarga(usos);
    expect(tras).toEqual({ restantes: 0 });
    expect(consumirCarga(tras)).toEqual({ restantes: 0 });
    const pasiva = crearCargasIniciales(h("PESAO"));
    expect(consumirCarga(pasiva)).toEqual({ restantes: null });
  });

  it("cargaDisponible es verdadera mientras queden usos o sea pasiva", () => {
    expect(cargaDisponible({ restantes: 2 })).toBe(true);
    expect(cargaDisponible({ restantes: 0 })).toBe(false);
    expect(cargaDisponible({ restantes: null })).toBe(true);
  });
});

describe("ventanaVigente (B1 — ventana global de 3 turnos)", () => {
  it("primeros3Turnos vale en los turnos 1–3 de la ronda y no después", () => {
    for (const turno of [1, 2, 3]) {
      expect(ventanaVigente(h("GINYU"), turno)).toBe(true);
      expect(ventanaVigente(h("EXODIA"), turno)).toBe(true);
    }
    expect(ventanaVigente(h("GINYU"), 4)).toBe(false);
    expect(ventanaVigente(h("EXODIA"), 4)).toBe(false);
  });

  it("las de ronda (incluida MATO) valen todo el tiempo", () => {
    expect(ventanaVigente(h("MATO"), 1)).toBe(true);
    expect(ventanaVigente(h("MATO"), 9)).toBe(true);
    expect(ventanaVigente(h("DOBLE"), 20)).toBe(true);
  });
});
