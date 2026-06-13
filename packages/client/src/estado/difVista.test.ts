import { describe, expect, it } from "vitest";
import { crearComodin } from "@juegos/carioca-core";
import { difVista } from "./difVista.js";
import { carta, crearVista, jugadorVista } from "../pruebas/fabricas.js";

describe("difVista", () => {
  it("sin vista anterior es un reparto inicial", () => {
    expect(difVista(null, crearVista())).toEqual([{ tipo: "repartoInicial" }]);
  });

  it("cambio de mano es un reparto inicial", () => {
    const anterior = crearVista({ manoActual: 1 });
    const nueva = crearVista({ manoActual: 2 });
    expect(difVista(anterior, nueva)).toEqual([{ tipo: "repartoInicial" }]);
  });

  it("detecta mi robo del mazo con la carta concreta", () => {
    const cinco = carta("corazones", 5);
    const anterior = crearVista({ tuMano: [], numeroMazo: 80 });
    const nueva = crearVista({ tuMano: [cinco], numeroMazo: 79 });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "roboPropio", origen: "mazo", carta: cinco },
    ]);
  });

  it("detecta mi robo del pozo", () => {
    const tope = carta("picas", 8);
    const anterior = crearVista({ tuMano: [], pozoTope: tope, numeroPozo: 3 });
    const nueva = crearVista({
      tuMano: [tope],
      pozoTope: carta("treboles", 2),
      numeroPozo: 2,
    });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "roboPropio", origen: "pozo", carta: tope },
    ]);
  });

  it("detecta un robo ajeno solo por conteos", () => {
    const anterior = crearVista({
      jugadores: [jugadorVista("j1"), jugadorVista("j2", { numeroCartas: 12 })],
      numeroMazo: 80,
    });
    const nueva = crearVista({
      jugadores: [jugadorVista("j1"), jugadorVista("j2", { numeroCartas: 13 })],
      numeroMazo: 79,
    });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "roboAjeno", jugadorId: "j2", origen: "mazo" },
    ]);
  });

  it("detecta mi descarte", () => {
    const dos = carta("treboles", 2);
    const anterior = crearVista({ tuMano: [dos], numeroPozo: 0 });
    const nueva = crearVista({ tuMano: [], pozoTope: dos, numeroPozo: 1 });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "descarte", jugadorId: "j1", carta: dos },
    ]);
  });

  it("atribuye el descarte ajeno al jugador del turno anterior", () => {
    const reina = carta("diamantes", 12);
    const anterior = crearVista({
      numeroPozo: 1,
      pozoTope: carta("picas", 3),
      turno: { jugadorId: "j2", fase: "descartar", numero: 4 },
    });
    const nueva = crearVista({
      numeroPozo: 2,
      pozoTope: reina,
      turno: { jugadorId: "j1", fase: "robar", numero: 5 },
    });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "descarte", jugadorId: "j2", carta: reina },
    ]);
  });

  it("detecta una bajada con sus combinaciones nuevas", () => {
    const anterior = crearVista({ mesa: [] });
    const nueva = crearVista({
      mesa: [
        {
          duenoId: "j2",
          combinacion: {
            tipo: "trio",
            cartas: [carta("corazones", 5), carta("picas", 5), carta("treboles", 5)],
          },
        },
        {
          duenoId: "j2",
          combinacion: {
            tipo: "trio",
            cartas: [carta("corazones", 9), carta("picas", 9), carta("diamantes", 9)],
          },
        },
      ],
    });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "bajada", jugadorId: "j2", mesaIdxNuevos: [0, 1] },
    ]);
  });

  it("detecta una pegada mía sobre una combinación existente", () => {
    const cuatro = carta("corazones", 4);
    const escala = [carta("corazones", 5), carta("corazones", 6), carta("corazones", 7), carta("corazones", 8)];
    const anterior = crearVista({
      tuMano: [cuatro],
      mesa: [{ duenoId: "j2", combinacion: { tipo: "escala", cartas: escala } }],
    });
    const nueva = crearVista({
      tuMano: [],
      mesa: [
        {
          duenoId: "j2",
          combinacion: { tipo: "escala", cartas: [cuatro, ...escala] },
        },
      ],
    });
    expect(difVista(anterior, nueva)).toEqual([
      { tipo: "pegada", jugadorId: "j1", mesaIdx: 0, cartaId: cuatro.id },
    ]);
  });

  it("detecta el reciclaje del pozo hacia el mazo", () => {
    const anterior = crearVista({ numeroMazo: 0, numeroPozo: 31 });
    const nueva = crearVista({
      numeroMazo: 30,
      numeroPozo: 1,
      pozoTope: crearComodin(1),
    });
    expect(difVista(anterior, nueva)).toEqual([{ tipo: "reciclajeMazo" }]);
  });

  it("anuncia el fin de mano y el fin de partida", () => {
    const jugando = crearVista({ fase: "jugandoMano" });
    const manoLista = crearVista({ fase: "manoTerminada" });
    const partidaLista = crearVista({ fase: "partidaTerminada" });
    expect(difVista(jugando, manoLista)).toEqual([{ tipo: "finMano" }]);
    expect(difVista(manoLista, partidaLista)).toEqual([{ tipo: "finPartida" }]);
  });
});
