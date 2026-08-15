import { LIGAS } from "@juegos/monopoly-core";
import { describe, expect, it } from "vitest";

import { construirPoolSobres } from "./construirPoolSobres.js";
import type { JugadorCrudo, TecnicoCrudo } from "./tiposCrudos.js";

function jugador(datos: Partial<JugadorCrudo> & { id: number }): JugadorCrudo {
  return {
    nombre: "Nombre",
    apellido: "Apellido",
    rating: 80,
    posicion: "ST",
    posicionesPosibles: ["ST"],
    liga: "Premier League",
    calidad: "Rare",
    ...datos,
  };
}

function tecnico(datos: Partial<TecnicoCrudo> & { id: number }): TecnicoCrudo {
  return { nombre: "Tecnico", apellido: "Apellido", ...datos };
}

describe("construirPoolSobres (§3, §3.2)", () => {
  it("un jugador con 2 posiciones elegibles genera 2 entradas con ids sufijados distintos y mismo rating/calidad", () => {
    const j = jugador({
      id: 1,
      posicion: "CB",
      posicionesPosibles: ["CB", "LB"],
      liga: "Premier League",
      rating: 88,
      calidad: "Icon",
    });
    const pool = construirPoolSobres([j], []);
    const entradas = pool.porLiga["Premier League"];
    expect(entradas).toHaveLength(2);
    expect(entradas.map((e) => e.id).sort()).toEqual(["1-CB", "1-LB"]);
    for (const e of entradas) {
      expect(e.rating).toBe(88);
      expect(e.calidad).toBe("Icon");
      expect(e.nombre).toBe("Nombre");
      expect(e.jugadorId).toBe("1");
    }
    expect(entradas.map((e) => e.posicion).sort()).toEqual(["CB", "LB"]);
  });

  it("las entradas de un mismo jugador comparten jugadorId aunque el id de entrada difiera (§9)", () => {
    const j = jugador({
      id: 7,
      posicion: "CB",
      posicionesPosibles: ["CB", "LB", "RB"],
      liga: "Premier League",
    });
    const pool = construirPoolSobres([j], []);
    const entradas = pool.porLiga["Premier League"];
    expect(entradas).toHaveLength(3);
    expect(new Set(entradas.map((e) => e.jugadorId))).toEqual(new Set(["7"]));
    expect(new Set(entradas.map((e) => e.id)).size).toBe(3);
  });

  it("un jugador 100% inelegible (CDM/LM/RM únicamente) no aparece en ningún lado", () => {
    const j = jugador({ id: 2, posicion: "CDM", posicionesPosibles: ["CDM", "LM", "RM"] });
    const pool = construirPoolSobres([j], []);
    for (const liga of LIGAS) expect(pool.porLiga[liga]).toHaveLength(0);
    expect(pool.restoDelMundo).toHaveLength(0);
  });

  it('jugador de liga "Icons" cae en restoDelMundo (tras el filtro de elegibilidad)', () => {
    const j = jugador({ id: 3, posicion: "ST", posicionesPosibles: ["ST"], liga: "Icons" });
    const pool = construirPoolSobres([j], []);
    expect(pool.restoDelMundo).toHaveLength(1);
    expect(pool.restoDelMundo[0]?.id).toBe("3-ST");
  });

  it("jugador de liga desconocida (no Icons, no las 8) también cae en restoDelMundo", () => {
    const j = jugador({ id: 4, posicion: "ST", posicionesPosibles: ["ST"], liga: "Eredivisie" });
    const pool = construirPoolSobres([j], []);
    expect(pool.restoDelMundo).toHaveLength(1);
  });

  it("jugador con liga null cae en restoDelMundo", () => {
    const j = jugador({ id: 5, posicion: "ST", posicionesPosibles: ["ST"], liga: null });
    const pool = construirPoolSobres([j], []);
    expect(pool.restoDelMundo).toHaveLength(1);
  });

  it("las 8 ligas están presentes en porLiga aunque no tengan jugadores en el fixture", () => {
    const pool = construirPoolSobres([], []);
    for (const liga of LIGAS) expect(pool.porLiga[liga]).toEqual([]);
  });

  it("los técnicos se mapean 1:1 sin filtro, con id string", () => {
    const t = tecnico({ id: 42, nombre: "Pep", apellido: "Guardiola" });
    const pool = construirPoolSobres([], [t]);
    expect(pool.tecnicos).toEqual([{ id: "42", nombre: "Pep", apellido: "Guardiola" }]);
  });

  it("los ids de JugadorPool son siempre string", () => {
    const j = jugador({ id: 99, posicion: "ST", posicionesPosibles: ["ST"], liga: "Bundesliga" });
    const pool = construirPoolSobres([j], []);
    expect(typeof pool.porLiga.Bundesliga[0]?.id).toBe("string");
  });
});
