// Proyección por jugador: el GUARDIÁN de la información oculta.
// SPIKE_MELOQUIZ.md §6.4 + pivote 2026-07-21 — el título correcto no puede
// estar en la vista antes de la fase `revelar` (protege la gracia de adivinar
// de viva voz), y de la votación solo viaja `haVotado` hasta que cierra.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { crearPartida, expirarFase, marcarListo, votar, type EstadoMeloquiz } from "./partida.js";
import { construirVistaMeloquiz } from "./vista.js";
import { JUGADORES, cancionDe, exito, poolDePrueba } from "./apoyoPruebas.js";

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

  it('desde "revelar" aparece la respuesta y sigue visible en "voto" (se vota viéndola, §4)', () => {
    for (const fase of ["revelar", "voto", "puntaje"] as const) {
      const estado = hasta(partidaNueva(), fase);
      const vista = construirVistaMeloquiz(estado, "j1");
      const { titulo } = correcta(estado);
      expect(vista.tituloCorrecto).toBe(titulo);
      expect(vista.artistaCorrecto).not.toBeNull();
    }
  });

  it("los campos de respuesta son null antes de revelar", () => {
    for (const fase of ["precarga", "clip"] as const) {
      const vista = construirVistaMeloquiz(hasta(partidaNueva(), fase), "j1");
      expect(vista.tituloCorrecto).toBeNull();
      expect(vista.artistaCorrecto).toBeNull();
    }
  });

  it("no queda NINGÚN resto de opciones de canción en la vista (pivote §5)", () => {
    for (const fase of ["precarga", "clip", "revelar", "voto", "puntaje"] as const) {
      const vista = construirVistaMeloquiz(hasta(partidaNueva(), fase), "j1");
      const claves = Object.keys(vista);
      expect(claves).not.toContain("opciones");
      expect(claves).not.toContain("opcionCorrectaId");
      expect(claves).not.toContain("tuVotoId");
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

describe("votos por jugador (§5)", () => {
  it("cada jugador ve SOLO su propio voto", () => {
    let estado = hasta(partidaNueva(), "voto");
    estado = exito(votar(estado, "j1", "j2", 10));
    estado = exito(votar(estado, "j2", "j2", 20));

    const deJ1 = construirVistaMeloquiz(estado, "j1");
    const deJ3 = construirVistaMeloquiz(estado, "j3");

    expect(deJ1.tuVotoJugadorId).toBe("j2");
    expect(deJ3.tuVotoJugadorId).toBeNull();
    // De los demás solo se sabe SI votaron, no A QUIÉN.
    expect(deJ3.jugadores.map((j) => j.haVotado)).toEqual([true, true, false]);
  });

  it("los conteos son null hasta `puntaje`: publicarlos en vivo sesgaría al grupo", () => {
    let estado = hasta(partidaNueva(), "voto");
    estado = exito(votar(estado, "j1", "j2", 10));

    const enVoto = construirVistaMeloquiz(estado, "j1");
    expect(enVoto.jugadores.every((j) => j.votosRecibidos === null)).toBe(true);
    expect(enVoto.ganadorRonda).toBeNull();
  });

  it("en `puntaje` la tabla trae el conteo por jugador y el ganador de la ronda", () => {
    let estado = hasta(partidaNueva(), "voto");
    estado = exito(votar(estado, "j1", "j2", 10));
    estado = exito(votar(estado, "j2", "j2", 20));
    estado = exito(votar(estado, "j3", "j1", 30)); // cierre anticipado → puntaje

    const vista = construirVistaMeloquiz(estado, "j1");
    expect(vista.fase).toBe("puntaje");
    expect(vista.jugadores.map((j) => j.votosRecibidos)).toEqual([1, 2, 0]);
    expect(vista.ganadorRonda).toBe("j2");
  });

  it("empate en `puntaje`: conteos visibles pero sin ganador de ronda (§5)", () => {
    let estado = hasta(partidaNueva(), "voto");
    estado = exito(votar(estado, "j1", "j2", 10));
    estado = exito(votar(estado, "j2", "j1", 20));
    estado = hasta(estado, "puntaje"); // j3 calló: 1-1

    const vista = construirVistaMeloquiz(estado, "j3");
    expect(vista.jugadores.map((j) => j.votosRecibidos)).toEqual([1, 1, 0]);
    expect(vista.ganadorRonda).toBeNull();
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
