// Comodín-de-pinta (modo Rumble / GUASON, §3.2 REGLAS_RUMBLE.md): un tipo de carta
// nuevo que actúa como comodín PERO restringido a su pinta (en escalas de esa pinta)
// y libre en tríos. Y la costura `acunarComodinDePinta`, la ÚNICA que rompe el
// invariante de multiset (mete al juego una carta nueva).

import { describe, expect, it } from "vitest";
import {
  crearCartaNormal,
  crearComodin,
  crearComodinDePinta,
  type Carta,
} from "./carta.js";
import {
  extenderEscala,
  validarEscala,
  validarEscalaReal,
  validarTrio,
} from "./combinaciones.js";
import { puntosCarta } from "./puntaje.js";
import { acunarComodinDePinta, crearPartida } from "./partida.js";
import { crearGeneradorSemilla } from "./aleatorio.js";

const cp = (pinta: Parameters<typeof crearComodinDePinta>[0]) =>
  crearComodinDePinta(pinta, 0);
const normal = crearCartaNormal;

function multiset(estado: {
  mazo: readonly Carta[];
  pozo: readonly Carta[];
  jugadores: readonly { mano: readonly Carta[] }[];
  mesa: readonly { combinacion: { cartas: readonly Carta[] } }[];
}): string[] {
  return [
    ...estado.mazo,
    ...estado.pozo,
    ...estado.jugadores.flatMap((j) => j.mano),
    ...estado.mesa.flatMap((m) => m.combinacion.cartas),
  ]
    .map((c) => c.id)
    .sort();
}

describe("comodín-de-pinta en combinaciones", () => {
  it("sirve como comodín en un trío (cualquier pinta)", () => {
    const trio = [normal("picas", 7, "a"), normal("corazones", 7, "b"), cp("diamantes")];
    expect(validarTrio(trio, 0).valida).toBe(true);
  });

  it("rechaza dos comodines-de-pinta en la misma combinación", () => {
    const trio = [normal("picas", 7, "a"), cp("diamantes"), cp("corazones")];
    expect(validarTrio(trio, 0).valida).toBe(false);
  });

  it("sirve en una escala de SU pinta y toma valor posicional", () => {
    // 4♠ [comodín-de-picas=5♠] 6♠ 7♠
    const escala = [
      normal("picas", 4, "a"),
      cp("picas"),
      normal("picas", 6, "b"),
      normal("picas", 7, "c"),
    ];
    expect(validarEscala(escala, 4, 0).valida).toBe(true);
  });

  it("NO sirve en una escala de otra pinta", () => {
    const escala = [
      normal("picas", 4, "a"),
      cp("corazones"),
      normal("picas", 6, "b"),
      normal("picas", 7, "c"),
    ];
    expect(validarEscala(escala, 4, 0).valida).toBe(false);
  });

  it("queda prohibido en la escala real", () => {
    const real: Carta[] = [];
    for (let v = 1; v <= 13; v++) {
      real.push(v === 5 ? cp("picas") : normal("picas", v as never, "x" + v));
    }
    expect(validarEscalaReal(real, 0).valida).toBe(false);
  });

  it("extiende una escala por el extremo solo si coincide la pinta", () => {
    const escala = [
      normal("picas", 4, "a"),
      normal("picas", 5, "b"),
      normal("picas", 6, "c"),
      normal("picas", 7, "d"),
    ];
    expect(extenderEscala(escala, cp("picas"), "fin")).not.toBeNull();
    expect(extenderEscala(escala, cp("corazones"), "fin")).toBeNull();
  });

  it("puntúa como el comodín normal (30)", () => {
    expect(puntosCarta(cp("picas"))).toBe(puntosCarta(crearComodin(0)));
    expect(puntosCarta(cp("picas"))).toBe(30);
  });
});

describe("acunarComodinDePinta (única ruptura del multiset)", () => {
  const jugadores = [
    { id: "ana", nombre: "Ana" },
    { id: "beto", nombre: "Beto" },
  ];

  it("acuña una carta nueva: el multiset crece EXACTAMENTE en el comodín acuñado", () => {
    const creada = crearPartida(jugadores, crearGeneradorSemilla(7));
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    const estado = creada.valor;
    const ana = estado.jugadores.find((j) => j.id === "ana");
    const salienteId = ana?.mano[0]?.id;
    expect(salienteId).toBeDefined();

    const antes = multiset(estado);
    const res = acunarComodinDePinta(
      estado,
      "ana",
      "picas",
      crearGeneradorSemilla(1),
      salienteId,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const despues = multiset(res.valor);

    // El multiset gana exactamente 1 carta: el comodín-de-pinta acuñado.
    expect(despues.length).toBe(antes.length + 1);
    const nuevos = despues.filter((id) => !antes.includes(id));
    // Nota: la carta saliente sigue en juego (fue al fondo del mazo), así que el
    // único id genuinamente nuevo es el comodín acuñado.
    expect(nuevos).toContain("comodinPinta-picas-0");
    expect(nuevos).toHaveLength(1);
  });

  it("la carta saliente va al fondo del mazo (sigue en circulación)", () => {
    const creada = crearPartida(jugadores, crearGeneradorSemilla(3));
    if (!creada.ok) return;
    const estado = creada.valor;
    const ana = estado.jugadores.find((j) => j.id === "ana");
    const saliente = ana?.mano[0];
    const salienteId = saliente?.id;
    const res = acunarComodinDePinta(
      estado,
      "ana",
      "corazones",
      crearGeneradorSemilla(1),
      salienteId,
    );
    if (!res.ok) return;
    // fondo del mazo = índice 0 (la cima es el último elemento).
    expect(res.valor.mazo[0]?.id).toBe(salienteId);
    // La mano de Ana ya no tiene la saliente pero sí el comodín acuñado.
    const anaDespues = res.valor.jugadores.find((j) => j.id === "ana");
    expect(anaDespues?.mano.some((c) => c.id === salienteId)).toBe(false);
    expect(anaDespues?.mano.some((c) => c.tipo === "comodinPinta")).toBe(true);
  });

  it("falla con jugador desconocido", () => {
    const creada = crearPartida(jugadores, crearGeneradorSemilla(1));
    if (!creada.ok) return;
    const res = acunarComodinDePinta(
      creada.valor,
      "fantasma",
      "picas",
      crearGeneradorSemilla(1),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.codigo).toBe("JUGADOR_DESCONOCIDO");
  });
});
