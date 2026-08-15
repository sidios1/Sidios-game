import { describe, expect, it } from "vitest";
import type { CartaMiClub } from "./miClub.js";
import type { PosicionJugador } from "./fuenteSobres.js";
import type { IdSlotFormacion } from "./formacion.js";
import { armarEquipo } from "./armadoEquipo.js";

function cartaJugador(id: string, posicion: PosicionJugador): CartaMiClub {
  return {
    tipo: "jugador",
    id,
    origen: { clase: "restoDelMundo" },
    jugador: { id: `j-${id}`, jugadorId: `j-${id}`, nombre: "N", apellido: "A", rating: 80, posicion, calidad: "Normal" },
  };
}

function cartaTecnico(id: string): CartaMiClub {
  return { tipo: "tecnico", id, tecnico: { id: `t-${id}`, nombre: "N", apellido: "A" } };
}

/** Un Mi Club con una carta elegible para cada uno de los 12 slots de §7. */
function miClubCompleto(): readonly CartaMiClub[] {
  return [
    cartaJugador("por", "GK"),
    cartaJugador("ld", "RB"),
    cartaJugador("dfc1", "CB"),
    cartaJugador("dfc2", "CB"),
    cartaJugador("li", "LB"),
    cartaJugador("mc1", "CM"),
    cartaJugador("mco", "CAM"),
    cartaJugador("mc2", "CM"),
    cartaJugador("ed", "RW"),
    cartaJugador("dc", "ST"),
    cartaJugador("ei", "LW"),
    cartaTecnico("tec"),
  ];
}

const ASIGNACION_COMPLETA = new Map<IdSlotFormacion, string>([
  ["POR", "por"],
  ["LD", "ld"],
  ["DFC_1", "dfc1"],
  ["DFC_2", "dfc2"],
  ["LI", "li"],
  ["MC_1", "mc1"],
  ["MCO", "mco"],
  ["MC_2", "mc2"],
  ["ED", "ed"],
  ["DC", "dc"],
  ["EI", "ei"],
  ["TECNICO", "tec"],
]);

describe("armarEquipo", () => {
  it("arma un equipo completo (12/12 slots) con cartas de posición correcta", () => {
    const r = armarEquipo("j1", miClubCompleto(), ASIGNACION_COMPLETA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.jugadorId).toBe("j1");
    expect(r.valor.asignaciones).toHaveLength(12);
    expect(r.valor.asignaciones.every((a) => a.cartaId !== null)).toBe(true);
  });

  it("permite un armado incompleto: los slots no asignados quedan en banca (cartaId null)", () => {
    const parcial = new Map(ASIGNACION_COMPLETA);
    parcial.delete("DC");
    parcial.delete("TECNICO");

    const r = armarEquipo("j1", miClubCompleto(), parcial);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porSlot = new Map(r.valor.asignaciones.map((a) => [a.slotId, a.cartaId]));
    expect(porSlot.get("DC")).toBeNull();
    expect(porSlot.get("TECNICO")).toBeNull();
    expect(porSlot.get("POR")).toBe("por");
  });

  it("rechaza una carta cuya posición no calza con el slot", () => {
    const club = [cartaJugador("dc", "ST")];
    const r = armarEquipo("j1", club, new Map([["POR", "dc"]]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("CARTA_NO_ELEGIBLE");
  });

  it("rechaza asignar una carta de técnico a un slot de jugador y viceversa", () => {
    const club = [cartaTecnico("tec"), cartaJugador("por", "GK")];
    const rTec = armarEquipo("j1", club, new Map([["POR", "tec"]]));
    expect(rTec.ok).toBe(false);
    if (!rTec.ok) expect(rTec.error.codigo).toBe("CARTA_NO_ELEGIBLE");

    const rJug = armarEquipo("j1", club, new Map([["TECNICO", "por"]]));
    expect(rJug.ok).toBe(false);
    if (!rJug.ok) expect(rJug.error.codigo).toBe("CARTA_NO_ELEGIBLE");
  });

  it("rechaza reusar la misma carta en dos slots", () => {
    const club = [cartaJugador("cb", "CB")];
    const r = armarEquipo("j1", club, new Map([["DFC_1", "cb"], ["DFC_2", "cb"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe("CARTA_YA_ASIGNADA");
  });

  it("rechaza un cartaId que no existe en Mi Club", () => {
    const r = armarEquipo("j1", [], new Map([["POR", "inexistente"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe("CARTA_DESCONOCIDA");
  });
});
