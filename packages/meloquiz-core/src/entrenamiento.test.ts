// Modo entrenamiento (REGLAS_MELOQUIZ.md §4/§6, pivote 2026-07-21): partida de
// UN jugador, opt-in, SIN fase de votación — precarga → clip → revelar →
// siguiente canción. Reproductor de práctica: se salta de canción en canción.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { crearPartida, expirarFase, faseTemporizada, puntosDe, votar } from "./partida.js";
import type { DatosJugador } from "./partida.js";
import { exito, poolDePrueba, relojFalso } from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(7);
const POOL = poolDePrueba(6);
const SOLO: readonly DatosJugador[] = [{ id: "j1", nombre: "Ana" }];
const DOS: readonly DatosJugador[] = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Bruno" },
];

describe("modo entrenamiento (§6)", () => {
  it("rechaza 1 jugador en una partida normal", () => {
    const r = crearPartida(SOLO, POOL, {}, rng(), 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("acepta 1 jugador con el flag", () => {
    const r = crearPartida(SOLO, POOL, { entrenamiento: true }, rng(), 0);
    expect(r.ok).toBe(true);
  });

  it("el flag NO relaja el máximo: 2 jugadores en entrenamiento se rechazan", () => {
    const r = crearPartida(DOS, POOL, { entrenamiento: true }, rng(), 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("SIN votación: revelar salta directo a la precarga de la siguiente canción (§4)", () => {
    const reloj = relojFalso();
    let e = exito(
      crearPartida(SOLO, POOL, { entrenamiento: true, rondas: 2 }, rng(), reloj.ahora()),
    );

    expect(e.fase).toBe("precarga");
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.precarga), rng())); // → clip
    expect(e.fase).toBe("clip");
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.clip), rng())); // → revelar
    expect(e.fase).toBe("revelar");
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.revelar), rng())); // → ¡precarga 2!
    expect(e.fase).toBe("precarga");
    expect(e.ronda).toBe(2);
    expect(faseTemporizada(e)?.clave).toBe("2:precarga");
  });

  it("votar en entrenamiento es FASE_INVALIDA: la fase de voto nunca llega", () => {
    const reloj = relojFalso();
    let e = exito(
      crearPartida(SOLO, POOL, { entrenamiento: true, rondas: 1 }, rng(), reloj.ahora()),
    );
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.precarga), rng())); // → clip
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.clip), rng())); // → revelar
    const r = votar(e, "j1", "j1", reloj.avanzar(500));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("FASE_INVALIDA");
  });

  it("una partida entera salta de canción en canción y termina sin puntos", () => {
    const reloj = relojFalso();
    let e = exito(
      crearPartida(SOLO, POOL, { entrenamiento: true, rondas: 3 }, rng(), reloj.ahora()),
    );

    const sonadas: string[] = [];
    for (let ronda = 1; ronda <= 3; ronda++) {
      expect(e.fase).toBe("precarga");
      const id = e.rondaActual?.cancionId;
      if (id !== undefined) sonadas.push(id);
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.precarga), rng())); // → clip
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.clip), rng())); // → revelar
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.revelar), rng())); // → sig. | final
    }

    expect(e.fase).toBe("final");
    expect(new Set(sonadas).size).toBe(3);
    // Sin votación no hay puntos, pero es el único participante: gana igual (§6).
    expect(puntosDe(e, "j1")).toBe(0);
    expect(e.ganadores).toEqual(["j1"]);
  });
});
