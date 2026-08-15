import { describe, expect, it } from "vitest";
import { FORMACION_4_3_3, type IdSlotFormacion } from "./formacion.js";
import type { EquipoArmado } from "./armadoEquipo.js";
import {
  crearVotacionFinal,
  resolverCategoria,
  resolverDesempate,
  resolverVotacionFinal,
  votarCategoria,
  type EstadoVotacionFinal,
} from "./votacionFinal.js";

/** Equipo con solo los `slotsLlenos` ocupados (cartaId arbitrario); el resto queda en banca. */
function equipo(jugadorId: string, slotsLlenos: readonly IdSlotFormacion[]): EquipoArmado {
  return {
    jugadorId,
    asignaciones: FORMACION_4_3_3.map((slot) => ({
      slotId: slot.id,
      cartaId: slotsLlenos.includes(slot.id) ? `${jugadorId}-${slot.id}` : null,
    })),
  };
}

function votar(
  estado: EstadoVotacionFinal,
  votanteId: string,
  slotId: IdSlotFormacion,
  jugadorVotadoId: string,
): EstadoVotacionFinal {
  const r = votarCategoria(estado, votanteId, slotId, jugadorVotadoId);
  if (!r.ok) throw new Error(`voto inválido en el test: ${r.error.mensaje}`);
  return r.valor;
}

describe("votacionFinal", () => {
  it("resuelve una categoría por mayoría simple", () => {
    const equipos = [equipo("j1", ["DC"]), equipo("j2", ["DC"]), equipo("j3", ["DC"])];
    let estado = crearVotacionFinal(equipos, ["j1", "j2", "j3"]);
    estado = votar(estado, "j1", "DC", "j1");
    estado = votar(estado, "j2", "DC", "j1");
    estado = votar(estado, "j3", "DC", "j2");

    const resultado = resolverCategoria(estado, "DC");
    expect(resultado).toEqual({ estado: "resuelta", ganadorId: "j1", conteos: { j1: 2, j2: 1, j3: 0 } });
  });

  it("permite autovoto: un jugador puede votar por su propio equipo", () => {
    const equipos = [equipo("j1", ["POR"]), equipo("j2", ["POR"])];
    let estado = crearVotacionFinal(equipos, ["j1", "j2"]);
    estado = votar(estado, "j1", "POR", "j1"); // autovoto
    estado = votar(estado, "j2", "POR", "j1");

    const resultado = resolverCategoria(estado, "POR");
    expect(resultado.estado).toBe("resuelta");
    if (resultado.estado === "resuelta") expect(resultado.ganadorId).toBe("j1");
  });

  it("un slot vacío excluye a ese jugador de la categoría (no compite, los demás votan igual)", () => {
    const equipos = [equipo("j1", ["DC"]), equipo("j2", ["DC"]), equipo("j3", [])]; // j3 sin DC
    let estado = crearVotacionFinal(equipos, ["j1", "j2", "j3"]);
    estado = votar(estado, "j1", "DC", "j2");
    estado = votar(estado, "j3", "DC", "j2");

    const resultado = resolverCategoria(estado, "DC");
    expect(resultado.conteos).toEqual({ j1: 0, j2: 2 }); // j3 nunca aparece: no cubre esa categoría
    expect(resultado.estado).toBe("resuelta");
    if (resultado.estado === "resuelta") expect(resultado.ganadorId).toBe("j2");

    // no se puede votar por j3 en DC: su slot está vacío.
    const votoInvalido = votarCategoria(estado, "j2", "DC", "j3");
    expect(votoInvalido.ok).toBe(false);
    if (!votoInvalido.ok) expect(votoInvalido.error.codigo).toBe("CATEGORIA_SIN_CANDIDATOS");
  });

  it("empate dentro de una categoría: expone a los empatados para poder revotar (no hay 'nadie gana')", () => {
    const equipos = [equipo("j1", ["DC"]), equipo("j2", ["DC"])];
    let estado = crearVotacionFinal(equipos, ["j1", "j2", "j3"]);
    estado = votar(estado, "j1", "DC", "j1");
    estado = votar(estado, "j2", "DC", "j2");

    const resultado = resolverCategoria(estado, "DC");
    expect(resultado).toEqual({
      estado: "sinGanador",
      motivo: "empate",
      conteos: { j1: 1, j2: 1 },
      empatados: ["j1", "j2"],
    });
  });

  it("empate dentro de una categoría con 3+ empatados: expone a todos los empatados", () => {
    const equipos = [equipo("j1", ["DC"]), equipo("j2", ["DC"]), equipo("j3", ["DC"])];
    let estado = crearVotacionFinal(equipos, ["v1", "v2", "v3"]);
    estado = votar(estado, "v1", "DC", "j1");
    estado = votar(estado, "v2", "DC", "j2");
    estado = votar(estado, "v3", "DC", "j3");

    const resultado = resolverCategoria(estado, "DC");
    expect(resultado).toEqual({
      estado: "sinGanador",
      motivo: "empate",
      conteos: { j1: 1, j2: 1, j3: 1 },
      empatados: ["j1", "j2", "j3"],
    });
  });

  it("resolverVotacionFinal: sin empate en categorías ganadas", () => {
    const equipos = [equipo("j1", ["POR", "LD"]), equipo("j2", ["POR", "LD"])];
    let estado = crearVotacionFinal(equipos, ["v1", "v2", "v3"]);
    estado = votar(estado, "v1", "POR", "j1");
    estado = votar(estado, "v2", "POR", "j1");
    estado = votar(estado, "v3", "POR", "j2");
    estado = votar(estado, "v1", "LD", "j2");
    estado = votar(estado, "v2", "LD", "j1");
    estado = votar(estado, "v3", "LD", "j1");

    const resolucion = resolverVotacionFinal(estado);
    expect(resolucion.categoriasGanadas).toEqual({ j1: 2, j2: 0 });
    expect(resolucion.ganadorFinal).toBe("j1");
    expect(resolucion.empatados).toBeNull();
  });

  it("resolverVotacionFinal: empate en categorías ganadas → ganadorFinal null, empatados con los 2 ids", () => {
    const equipos = [equipo("j1", ["POR", "LD"]), equipo("j2", ["POR", "LD"])];
    let estado = crearVotacionFinal(equipos, ["v1", "v2", "v3"]);
    // POR: gana j1 (2 a 1)
    estado = votar(estado, "v1", "POR", "j1");
    estado = votar(estado, "v2", "POR", "j1");
    estado = votar(estado, "v3", "POR", "j2");
    // LD: gana j2 (2 a 1)
    estado = votar(estado, "v1", "LD", "j2");
    estado = votar(estado, "v2", "LD", "j2");
    estado = votar(estado, "v3", "LD", "j1");

    const resolucion = resolverVotacionFinal(estado);
    expect(resolucion.categoriasGanadas).toEqual({ j1: 1, j2: 1 });
    expect(resolucion.ganadorFinal).toBeNull();
    expect(resolucion.empatados).not.toBeNull();
    expect(new Set(resolucion.empatados)).toEqual(new Set(["j1", "j2"]));
  });

  describe("resolverDesempate (§7: revota solo entre los empatados hasta que quede un ganador claro)", () => {
    it("resuelve el desempate cuando hay exactamente 2 empatados y un voto claro", () => {
      const r = resolverDesempate(["j1", "j2"], { v1: "j1", v2: "j1", v3: "j2" });
      expect(r).toEqual({ resuelto: true, ganadorId: "j1" });
    });

    it("3+ empatados: resuelve en una sola ronda si hay un puntero claro", () => {
      const r = resolverDesempate(["j1", "j2", "j3"], { v1: "j1", v2: "j1", v3: "j2", v4: "j3" });
      expect(r).toEqual({ resuelto: true, ganadorId: "j1" });
    });

    it("3+ empatados sin ganador claro: la ronda siguiente revota solo entre el subconjunto que sigue empatado", () => {
      // ronda 1: j1 y j2 quedan con 1 voto cada uno, j3 se cae (0 votos) → el grupo se achica a 2
      const ronda1 = resolverDesempate(["j1", "j2", "j3"], { v1: "j1", v2: "j2" });
      expect(ronda1).toEqual({ resuelto: false, empatados: ["j1", "j2"] });
      if (ronda1.resuelto) throw new Error("no debería resolver en la ronda 1");

      // ronda 2: se revota solo entre los que siguen empatados (j1, j2) — j3 ya no participa
      const ronda2 = resolverDesempate(ronda1.empatados, { v1: "j1", v2: "j1", v3: "j2" });
      expect(ronda2).toEqual({ resuelto: true, ganadorId: "j1" });
    });

    it("2 empatados: un re-empate en la ronda 1 se resuelve recién en la ronda 2 (sin límite de rondas)", () => {
      const ronda1 = resolverDesempate(["j1", "j2"], { v1: "j1", v2: "j2" });
      expect(ronda1).toEqual({ resuelto: false, empatados: ["j1", "j2"] });
      if (ronda1.resuelto) throw new Error("no debería resolver en la ronda 1");

      // §7: "No hay ... límite de rondas de revotación" — se repite entre los mismos 2
      const ronda2 = resolverDesempate(ronda1.empatados, { v1: "j1", v2: "j1", v3: "j2" });
      expect(ronda2).toEqual({ resuelto: true, ganadorId: "j1" });
    });
  });
});
