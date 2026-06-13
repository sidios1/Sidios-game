import { describe, expect, it } from "vitest";
import { crearComodin } from "@juegos/carioca-core";
import {
  agregarGrupo,
  cartasComprometidas,
  evaluarPropuesta,
  podarPropuesta,
  PROPUESTA_VACIA,
  quitarGrupo,
  validarGrupo,
} from "./propuesta.js";
import { carta, contrato, manoConDosTrios } from "../pruebas/fabricas.js";

const ids = (cartas: readonly { id: string }[]): string[] => cartas.map((c) => c.id);

describe("propuesta", () => {
  it("agrega y quita grupos, y reporta las cartas comprometidas", () => {
    const trio = [carta("corazones", 5), carta("picas", 5), carta("treboles", 5)];
    let propuesta = agregarGrupo(PROPUESTA_VACIA, "trio", ids(trio));
    expect(cartasComprometidas(propuesta).has(trio[0]?.id ?? "")).toBe(true);
    propuesta = quitarGrupo(propuesta, 0);
    expect(propuesta).toEqual([]);
  });

  it("valida un trío con los validadores del core (comodines según contrato)", () => {
    const mano = [
      carta("corazones", 5),
      carta("picas", 5),
      crearComodin(1),
      crearComodin(2),
    ];
    // Mano 1: máximo 1 comodín por combinación.
    const conUno = validarGrupo("trio", ids(mano.slice(0, 3)), mano, contrato(1));
    expect(conUno.valida).toBe(true);
    const conDos = validarGrupo("trio", ids(mano), mano, contrato(1));
    expect(conDos.valida).toBe(false);
  });

  it("valida una escala con la longitud mínima del contrato", () => {
    const mano = [
      carta("corazones", 5),
      carta("corazones", 6),
      carta("corazones", 7),
      carta("corazones", 8),
    ];
    const corta = validarGrupo("escala", ids(mano.slice(0, 3)), mano, contrato(2));
    expect(corta.valida).toBe(false);
    const completa = validarGrupo("escala", ids(mano), mano, contrato(2));
    expect(completa.valida).toBe(true);
  });

  it("evalúa la propuesta contra los requisitos reales del contrato", () => {
    const mano = manoConDosTrios();
    const primerTrio = ids(mano.slice(0, 3));
    const segundoTrio = ids(mano.slice(3, 6));

    const incompleta = agregarGrupo(PROPUESTA_VACIA, "trio", primerTrio);
    const faltante = evaluarPropuesta(incompleta, mano, contrato(1));
    expect(faltante.completa).toBe(false);
    expect(faltante.motivos.join(" ")).toContain("falta");

    const completa = agregarGrupo(incompleta, "trio", segundoTrio);
    expect(evaluarPropuesta(completa, mano, contrato(1)).completa).toBe(true);

    const excedida = agregarGrupo(completa, "trio", primerTrio);
    const sobrante = evaluarPropuesta(excedida, mano, contrato(1));
    expect(sobrante.completa).toBe(false);
    expect(sobrante.motivos.join(" ")).toContain("sobra");
  });

  it("poda los grupos cuyas cartas ya no están en la mano", () => {
    const mano = manoConDosTrios();
    const propuesta = agregarGrupo(PROPUESTA_VACIA, "trio", ids(mano.slice(0, 3)));
    expect(podarPropuesta(propuesta, mano)).toHaveLength(1);
    expect(podarPropuesta(propuesta, mano.slice(3))).toHaveLength(0);
  });
});
