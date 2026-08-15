import { describe, expect, it } from "vitest";
import { FORMACION_4_3_3, slotPorId, type IdSlotFormacion } from "./formacion.js";

describe("formacion", () => {
  it("tiene 12 slots (11 de jugador + técnico), en el orden de §7", () => {
    expect(FORMACION_4_3_3).toHaveLength(12);
    expect(FORMACION_4_3_3.map((s) => s.id)).toEqual([
      "POR",
      "LD",
      "DFC_1",
      "DFC_2",
      "LI",
      "MC_1",
      "MCO",
      "MC_2",
      "ED",
      "DC",
      "EI",
      "TECNICO",
    ]);
  });

  it("los slots DFC_1/DFC_2 y MC_1/MC_2 comparten etiqueta pero son categorías independientes", () => {
    const dfc1 = slotPorId("DFC_1");
    const dfc2 = slotPorId("DFC_2");
    expect(dfc1.etiqueta).toBe("DFC");
    expect(dfc2.etiqueta).toBe("DFC");
    expect(dfc1.id).not.toBe(dfc2.id);
  });

  it("solo TECNICO tiene tipo tecnico; el resto es jugador con posicionesAceptadas", () => {
    for (const slot of FORMACION_4_3_3) {
      if (slot.id === "TECNICO") {
        expect(slot.tipo).toBe("tecnico");
        expect(slot.posicionesAceptadas).toBeUndefined();
      } else {
        expect(slot.tipo).toBe("jugador");
        expect(slot.posicionesAceptadas).toBeDefined();
      }
    }
  });

  it("slotPorId resuelve cada id del union", () => {
    const ids: readonly IdSlotFormacion[] = FORMACION_4_3_3.map((s) => s.id);
    for (const id of ids) {
      expect(slotPorId(id).id).toBe(id);
    }
  });
});
