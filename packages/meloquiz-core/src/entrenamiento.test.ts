// Modo entrenamiento (REGLAS_MELOQUIZ.md §6): partida de UN jugador, opt-in.
// Lo único que cambia es el rango de jugadores admitidos; el resto del
// reglamento (fases, opciones, puntaje plano) es el de siempre.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { crearPartida, expirarFase, puntosDe, votar } from "./partida.js";
import type { DatosJugador } from "./partida.js";
import { exito, opcionCorrecta, poolDePrueba, relojFalso } from "./apoyoPruebas.js";

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

  it("una partida de entrenamiento se juega entera y deja al jugador en ganadores", () => {
    const reloj = relojFalso();
    let e = exito(
      crearPartida(SOLO, POOL, { entrenamiento: true, rondas: 2 }, rng(), reloj.ahora()),
    );

    for (let ronda = 1; ronda <= 2; ronda++) {
      expect(e.fase).toBe("precarga");
      // El ack del único jugador cierra la precarga sin esperar el timeout (§3.2).
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.precarga), rng())); // → clip
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.clip), rng())); // → voto
      // Vota bien: al votar TODOS (aquí, uno) la ventana cierra de inmediato (§5).
      e = exito(votar(e, "j1", opcionCorrecta(e), reloj.avanzar(500)));
      expect(e.fase).toBe("revelar");
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.revelar), rng())); // → puntaje
      e = exito(expirarFase(e, reloj.avanzar(e.duraciones.puntaje), rng())); // → sig. ronda
    }

    expect(e.fase).toBe("final");
    expect(puntosDe(e, "j1")).toBe(2);
    expect(e.ganadores).toEqual(["j1"]);
  });

  it("gana igual sin aciertos: es el único participante", () => {
    const reloj = relojFalso();
    let e = exito(
      crearPartida(SOLO, POOL, { entrenamiento: true, rondas: 1 }, rng(), reloj.ahora()),
    );
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.precarga), rng())); // → clip
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.clip), rng())); // → voto
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.voto), rng())); // → revelar (sin votar)
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.revelar), rng())); // → puntaje
    e = exito(expirarFase(e, reloj.avanzar(e.duraciones.puntaje), rng())); // → final

    expect(e.fase).toBe("final");
    expect(puntosDe(e, "j1")).toBe(0);
    expect(e.ganadores).toEqual(["j1"]);
  });
});
