import { describe, expect, it } from "vitest";

import { posicionesElegibles, POSICIONES_FORMACION } from "./elegibilidad.js";
import type { JugadorCrudo } from "./tiposCrudos.js";

function crudo(posicion: JugadorCrudo["posicion"], posicionesPosibles: JugadorCrudo["posicionesPosibles"]): JugadorCrudo {
  return {
    id: 1,
    nombre: "Nombre",
    apellido: "Apellido",
    rating: 80,
    posicion,
    posicionesPosibles,
    liga: "Premier League",
    calidad: "Rare",
  };
}

describe("posicionesElegibles (§3)", () => {
  it("primaria en las 9, sin secundaria útil → 1 elegible", () => {
    expect(posicionesElegibles(crudo("ST", ["ST"]))).toEqual(["ST"]);
  });

  it("primaria excluida (CDM/LM/RM) pero secundaria elegible → 1 elegible = la secundaria", () => {
    // Salah real: primaria RM, posicionesPosibles ["RM","RW"]
    expect(posicionesElegibles(crudo("RM", ["RM", "RW"]))).toEqual(["RW"]);
  });

  it("primaria y todas las secundarias excluidas → 0 elegibles", () => {
    expect(posicionesElegibles(crudo("CDM", ["CDM", "LM", "RM"]))).toEqual([]);
  });

  it("primaria y una secundaria distinta, ambas elegibles → 2 elegibles, en el orden fijo de POSICIONES_FORMACION", () => {
    // primaria CB, secundaria LB: en POSICIONES_FORMACION, RB va antes que CB, CB antes que LB
    expect(posicionesElegibles(crudo("CB", ["CB", "LB"]))).toEqual(["CB", "LB"]);
  });

  it("el orden de salida no depende del orden de posicionesPosibles en el JSON crudo", () => {
    // Ronaldinho real: posicion "LW", posicionesPosibles ["LM","CAM","LW"] (primaria al final)
    expect(posicionesElegibles(crudo("LW", ["LM", "CAM", "LW"]))).toEqual(["CAM", "LW"]);
  });

  it("no duplica una posición que aparece elegible más de una vez", () => {
    expect(posicionesElegibles(crudo("ST", ["ST", "ST"]))).toEqual(["ST"]);
  });

  it("POSICIONES_FORMACION tiene exactamente las 9 posiciones del §3/§7", () => {
    expect(POSICIONES_FORMACION).toEqual(["GK", "RB", "CB", "LB", "CM", "CAM", "RW", "ST", "LW"]);
  });
});
