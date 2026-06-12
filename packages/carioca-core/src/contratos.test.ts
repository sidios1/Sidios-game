import { describe, expect, it } from "vitest";
import type { Carta, Pinta, ValorCarta } from "./carta.js";
import { crearCartaNormal, crearComodin, VALORES } from "./carta.js";
import type { Combinacion } from "./combinaciones.js";
import { validarContrato } from "./combinaciones.js";
import { contratoDeMano, MANOS } from "./contratos.js";

let secuencia = 0;
function c(pinta: Pinta, valor: ValorCarta): Carta {
  secuencia += 1;
  return crearCartaNormal(pinta, valor, `t${secuencia}`);
}

function trio(valor: ValorCarta): Combinacion {
  return {
    tipo: "trio",
    cartas: [c("corazones", valor), c("treboles", valor), c("picas", valor)],
  };
}

function escala(pinta: Pinta, desde: number): Combinacion {
  const cartas = VALORES.slice(desde - 1, desde - 1 + 4).map((v) => c(pinta, v));
  return { tipo: "escala", cartas };
}

function sucia(): Combinacion {
  const pintas: readonly Pinta[] = ["corazones", "treboles", "diamantes", "picas"];
  return {
    tipo: "escalaSucia",
    cartas: VALORES.map((v, i) => c(pintas[i % pintas.length] ?? "picas", v)),
  };
}

function real(pinta: Pinta): Combinacion {
  return { tipo: "escalaReal", cartas: VALORES.map((v) => c(pinta, v)) };
}

function contrato(numero: number) {
  const encontrado = contratoDeMano(numero);
  if (encontrado === undefined) throw new Error(`no existe la mano ${numero}`);
  return encontrado;
}

describe("validarContrato: las 9 manos", () => {
  const casos: ReadonlyArray<{
    numero: number;
    valida: readonly Combinacion[];
    invalida: readonly Combinacion[];
  }> = [
    { numero: 1, valida: [trio(7), trio(9)], invalida: [trio(7)] },
    { numero: 2, valida: [trio(13), escala("diamantes", 4)], invalida: [trio(13), trio(4)] },
    { numero: 3, valida: [escala("picas", 2), escala("corazones", 5)], invalida: [escala("picas", 2)] },
    { numero: 4, valida: [trio(4), trio(8), trio(11)], invalida: [trio(4), trio(8)] },
    {
      numero: 5,
      valida: [trio(5), trio(10), escala("treboles", 1)],
      invalida: [trio(5), escala("treboles", 1), escala("corazones", 6)],
    },
    {
      numero: 6,
      valida: [trio(12), escala("picas", 3), escala("diamantes", 8)],
      invalida: [trio(12), trio(3), escala("diamantes", 8)],
    },
    {
      numero: 7,
      valida: [escala("corazones", 1), escala("treboles", 6), escala("picas", 10)],
      invalida: [escala("corazones", 1), escala("treboles", 6)],
    },
    { numero: 8, valida: [sucia()], invalida: [real("picas")] },
    { numero: 9, valida: [real("diamantes")], invalida: [sucia()] },
  ];

  it("cubre las 9 manos definidas en los datos", () => {
    expect(casos.map((caso) => caso.numero)).toEqual(MANOS.map((m) => m.numero));
  });

  for (const caso of casos) {
    it(`mano ${caso.numero} (${contrato(caso.numero).nombre}): acepta el contrato exacto`, () => {
      expect(validarContrato(contrato(caso.numero), caso.valida).valida).toBe(true);
    });

    it(`mano ${caso.numero}: rechaza una propuesta que no calza`, () => {
      expect(validarContrato(contrato(caso.numero), caso.invalida).valida).toBe(false);
    });
  }

  it("rechaza combinaciones de más, aunque sean válidas", () => {
    expect(
      validarContrato(contrato(1), [trio(7), trio(9), trio(11)]).valida,
    ).toBe(false);
  });

  it("mano 9: rechaza una escala real con comodín (contrato sin comodines)", () => {
    const conComodin = real("picas").cartas.map((carta, i) =>
      i === 6 ? crearComodin(999) : carta,
    );
    const propuesta: Combinacion[] = [{ tipo: "escalaReal", cartas: conComodin }];
    expect(validarContrato(contrato(9), propuesta).valida).toBe(false);
  });
});
