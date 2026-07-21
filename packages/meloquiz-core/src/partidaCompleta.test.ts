// Partida entera, determinista, sobre un PoolPartida mock y con reloj inyectado
// (REGLAS_MELOQUIZ.md §5/§6): cada ronda la gana el más votado por el grupo;
// victoria final por más puntos y empate COMPARTIDO.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import {
  crearPartida,
  expirarFase,
  puntosDe,
  votar,
  type EstadoMeloquiz,
} from "./partida.js";
import { JUGADORES, exito, poolDePrueba, relojFalso } from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(2024);
const POOL = poolDePrueba(8);

/** votante → jugador votado; null = no vota (se desconectó, §7). */
type PlanRonda = Readonly<Record<string, string | null>>;

const reloj = relojFalso();

/**
 * Juega una ronda completa desde `precarga` y deja el estado en la precarga de
 * la ronda siguiente (o en `final`). Todo el tiempo entra como parámetro.
 */
function jugarRonda(estado: EstadoMeloquiz, plan: PlanRonda): EstadoMeloquiz {
  let e = estado;
  e = exito(expirarFase(e, reloj.avanzar(e.duraciones.precarga), rng())); // → clip
  e = exito(expirarFase(e, reloj.avanzar(e.duraciones.clip), rng())); // → revelar
  e = exito(expirarFase(e, reloj.avanzar(e.duraciones.revelar), rng())); // → voto
  for (const [id, votadoId] of Object.entries(plan)) {
    if (votadoId === null) continue;
    e = exito(votar(e, id, votadoId, reloj.avanzar(500)));
  }
  // Si alguien no votó, la ventana la cierra el reloj (§4).
  if (e.fase === "voto") e = exito(expirarFase(e, reloj.avanzar(e.duraciones.voto), rng()));
  e = exito(expirarFase(e, reloj.avanzar(e.duraciones.puntaje), rng())); // → precarga | final
  return e;
}

function partidaDe(rondas: number): EstadoMeloquiz {
  return exito(crearPartida(JUGADORES, POOL, { rondas }, rng(), 0));
}

describe("partida completa (§6)", () => {
  it("3 rondas: gana quien más rondas se llevó y el marcador cuadra", () => {
    let estado = partidaDe(3);
    estado = jugarRonda(estado, { j1: "j1", j2: "j1", j3: "j2" }); // gana j1
    estado = jugarRonda(estado, { j1: "j2", j2: "j2", j3: "j1" }); // gana j2
    estado = jugarRonda(estado, { j1: "j1", j2: "j1", j3: null }); // gana j1

    expect(estado.fase).toBe("final");
    expect(puntosDe(estado, "j1")).toBe(2);
    expect(puntosDe(estado, "j2")).toBe(1);
    expect(puntosDe(estado, "j3")).toBe(0);
    expect(estado.ganadores).toEqual(["j1"]);
  });

  it("empate COMPARTIDO: los que empatan en el máximo comparten el puesto", () => {
    let estado = partidaDe(2);
    estado = jugarRonda(estado, { j1: "j1", j2: "j1", j3: "j1" }); // gana j1
    estado = jugarRonda(estado, { j1: "j2", j2: "j2", j3: "j2" }); // gana j2

    expect(estado.fase).toBe("final");
    expect(puntosDe(estado, "j1")).toBe(1);
    expect(puntosDe(estado, "j2")).toBe(1);
    expect(estado.ganadores).toEqual(["j1", "j2"]);
  });

  it("EMPATE en cada ronda: todos quedan en 0 y todos empatan (§5)", () => {
    let estado = partidaDe(2);
    estado = jugarRonda(estado, { j1: "j2", j2: "j1", j3: null }); // 1-1: nadie suma
    estado = jugarRonda(estado, { j1: "j3", j2: null, j3: "j1" }); // 1-1: nadie suma

    expect(estado.fase).toBe("final");
    for (const j of JUGADORES) expect(puntosDe(estado, j.id)).toBe(0);
    expect(estado.ganadores).toEqual(["j1", "j2", "j3"]);
  });

  it("nadie vota en toda la partida: termina igual, sin colgarse", () => {
    let estado = partidaDe(2);
    estado = jugarRonda(estado, { j1: null, j2: null, j3: null });
    estado = jugarRonda(estado, { j1: null, j2: null, j3: null });

    expect(estado.fase).toBe("final");
    expect(estado.ganadores).toEqual(["j1", "j2", "j3"]);
  });

  it("cada ronda usa una canción distinta", () => {
    let estado = partidaDe(3);
    const sonadas: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = estado.rondaActual?.cancionId;
      if (id !== undefined) sonadas.push(id);
      estado = jugarRonda(estado, { j1: "j1", j2: "j1", j3: "j2" });
    }
    expect(sonadas).toHaveLength(3);
    expect(new Set(sonadas).size).toBe(3);
  });

  it("es reproducible: misma semilla y mismo plan ⇒ mismo resultado", () => {
    const jugar = (): EstadoMeloquiz => {
      let e = exito(crearPartida(JUGADORES, POOL, { rondas: 2 }, crearGeneradorSemilla(99), 0));
      e = jugarRonda(e, { j1: "j3", j2: "j3", j3: "j1" });
      e = jugarRonda(e, { j1: "j2", j2: "j2", j3: "j2" });
      return e;
    };
    const a = jugar();
    const b = jugar();
    expect(a.puntajes).toEqual(b.puntajes);
    expect(a.ganadores).toEqual(b.ganadores);
    expect(a.ordenCanciones).toEqual(b.ordenCanciones);
  });
});
