// Proyección por jugador: el GUARDIÁN de la información oculta.
// SPIKE_MELOQUIZ.md §6.4 — el título correcto no puede estar en la vista antes
// de la fase `revelar`. Si alguien añade un campo revelador, este archivo cae.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { crearPartida, expirarFase, marcarListo, votar, type EstadoMeloquiz } from "./partida.js";
import { construirVistaMeloquiz } from "./vista.js";
import {
  JUGADORES,
  cancionDe,
  exito,
  opcionCorrecta,
  opcionIncorrecta,
  poolDePrueba,
} from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(555);
const POOL = poolDePrueba(6);

function partidaNueva(rondas = 2): EstadoMeloquiz {
  return exito(crearPartida(JUGADORES, POOL, { rondas }, rng(), 0));
}

/** Avanza por reloj hasta la fase pedida. */
function hasta(estado: EstadoMeloquiz, fase: EstadoMeloquiz["fase"]): EstadoMeloquiz {
  let e = estado;
  while (e.fase !== fase) e = exito(expirarFase(e, 0, rng()));
  return e;
}

/** Datos de la canción que suena en la ronda en curso. */
function correcta(estado: EstadoMeloquiz): { titulo: string; archivo: string; artista: string } {
  const id = estado.rondaActual?.cancionId ?? "";
  const c = cancionDe(POOL, id);
  return { titulo: c.titulo, archivo: c.claveArchivo, artista: c.artista ?? "" };
}

describe("ocultamiento de la respuesta (SPIKE §6.4)", () => {
  for (const fase of ["precarga", "clip"] as const) {
    it(`en "${fase}" la vista serializada NO contiene el título correcto`, () => {
      const estado = hasta(partidaNueva(), fase);
      const { titulo, archivo, artista } = correcta(estado);
      const serializada = JSON.stringify(construirVistaMeloquiz(estado, "j1"));

      expect(serializada).not.toContain(titulo);
      expect(serializada).not.toContain(archivo);
      expect(serializada).not.toContain(artista);
    });
  }

  it('en "voto" el título correcto está, pero INDISTINGUIBLE entre las 4 opciones', () => {
    const estado = hasta(partidaNueva(), "voto");
    const { titulo, archivo, artista } = correcta(estado);
    const vista = construirVistaMeloquiz(estado, "j1");
    const serializada = JSON.stringify(vista);

    // Tiene que estar: es una de las opciones a votar. Lo que no puede haber es
    // NADA que lo señale como la correcta.
    expect(vista.opciones.map((o) => o.titulo)).toContain(titulo);
    expect(vista.opcionCorrectaId).toBeNull();
    expect(vista.tituloCorrecto).toBeNull();
    expect(vista.jugadores.every((j) => j.acerto === null)).toBe(true);
    // Y el resto de los metadatos de la canción sigue oculto.
    expect(serializada).not.toContain(archivo);
    expect(serializada).not.toContain(artista);
  });

  it('en "revelar" sí aparece la respuesta', () => {
    const estado = hasta(partidaNueva(), "revelar");
    const vista = construirVistaMeloquiz(estado, "j1");
    const { titulo } = correcta(estado);

    expect(vista.tituloCorrecto).toBe(titulo);
    expect(vista.artistaCorrecto).not.toBeNull();
    expect(vista.opcionCorrectaId).toBe(estado.rondaActual?.opcionCorrectaId);
  });

  it("los campos de respuesta son null antes de revelar", () => {
    for (const fase of ["precarga", "clip", "voto"] as const) {
      const vista = construirVistaMeloquiz(hasta(partidaNueva(), fase), "j1");
      expect(vista.tituloCorrecto).toBeNull();
      expect(vista.artistaCorrecto).toBeNull();
      expect(vista.opcionCorrectaId).toBeNull();
    }
  });

  it("la vista nunca expone el cancionId de las opciones (sería comparable con pistaId)", () => {
    const estado = hasta(partidaNueva(), "voto");
    const vista = construirVistaMeloquiz(estado, "j1");
    for (const opcion of vista.opciones) {
      expect(Object.keys(opcion).sort()).toEqual(["id", "titulo"]);
    }
  });

  it("la vista nunca lleva el pool ni la clave de archivo", () => {
    const estado = hasta(partidaNueva(), "revelar");
    const serializada = JSON.stringify(construirVistaMeloquiz(estado, "j1"));
    for (const c of POOL.canciones) {
      expect(serializada).not.toContain(c.claveArchivo);
    }
  });
});

describe("la orden de reproducción (§1: la orden, no el archivo)", () => {
  it("publica pistaId y segundoInicio desde la precarga", () => {
    const estado = partidaNueva();
    const vista = construirVistaMeloquiz(estado, "j1");
    expect(vista.pistaId).toBe(estado.rondaActual?.cancionId);
    expect(vista.segundoInicio).toBe(cancionDe(POOL, vista.pistaId ?? "").segundoInicio);
  });
});

describe("opciones y votos", () => {
  it("las opciones están vacías antes de la votación", () => {
    expect(construirVistaMeloquiz(hasta(partidaNueva(), "precarga"), "j1").opciones).toEqual([]);
    expect(construirVistaMeloquiz(hasta(partidaNueva(), "clip"), "j1").opciones).toEqual([]);
  });

  it("en votación llegan las 4 opciones", () => {
    const vista = construirVistaMeloquiz(hasta(partidaNueva(), "voto"), "j1");
    expect(vista.opciones).toHaveLength(4);
  });

  it("cada jugador ve SOLO su propio voto", () => {
    let estado = hasta(partidaNueva(), "voto");
    estado = exito(votar(estado, "j1", opcionCorrecta(estado), 10));
    estado = exito(votar(estado, "j2", opcionIncorrecta(estado), 20));

    const deJ1 = construirVistaMeloquiz(estado, "j1");
    const deJ3 = construirVistaMeloquiz(estado, "j3");

    expect(deJ1.tuVotoId).not.toBeNull();
    expect(deJ3.tuVotoId).toBeNull();
    // De los demás solo se sabe SI votaron, no qué votaron.
    expect(deJ3.jugadores.map((j) => j.haVotado)).toEqual([true, true, false]);
  });

  it("`acerto` es null hasta revelar y luego dice la verdad", () => {
    let estado = hasta(partidaNueva(), "voto");
    estado = exito(votar(estado, "j1", opcionCorrecta(estado), 10));
    estado = exito(votar(estado, "j2", opcionIncorrecta(estado), 20));

    const enVoto = construirVistaMeloquiz(estado, "j1");
    expect(enVoto.jugadores.every((j) => j.acerto === null)).toBe(true);

    const enRevelar = construirVistaMeloquiz(hasta(estado, "revelar"), "j1");
    expect(enRevelar.jugadores.map((j) => j.acerto)).toEqual([true, false, false]);
  });

  it("los acks de precarga sí son públicos (§3.2)", () => {
    let estado = partidaNueva();
    estado = exito(marcarListo(estado, "j2", 10));
    expect(construirVistaMeloquiz(estado, "j1").listos).toEqual(["j2"]);
  });
});

describe("metadatos de fase y cierre", () => {
  it("publica clave y duración de la fase para el contador del HUD", () => {
    const vista = construirVistaMeloquiz(hasta(partidaNueva(), "voto"), "j1");
    expect(vista.claveFase).toBe("1:voto");
    expect(vista.duracionFaseMs).toBe(10_000);
  });

  it("en final no hay fase temporizada y sí ganadores", () => {
    const estado = hasta(partidaNueva(1), "final");
    const vista = construirVistaMeloquiz(estado, "j1");
    expect(vista.claveFase).toBeNull();
    expect(vista.duracionFaseMs).toBeNull();
    expect(vista.pistaId).toBeNull();
    expect(vista.ganadores.length).toBeGreaterThan(0);
  });
});
