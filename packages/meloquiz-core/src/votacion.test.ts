// Votación y puntaje PLANO (REGLAS_MELOQUIZ.md §5): 4 opciones, cada acierto
// vale 1 punto, sin bonus por velocidad ni ganador por rapidez.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import {
  crearPartida,
  expirarFase,
  puntosDe,
  votar,
  type EstadoMeloquiz,
} from "./partida.js";
import { REGLAS_MELOQUIZ } from "./reglas.js";
import {
  JUGADORES,
  cancionDe,
  exito,
  opcionCorrecta,
  opcionIncorrecta,
  poolDePrueba,
} from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(42);
const POOL = poolDePrueba(6);

/** Partida llevada hasta la fase de votación de la ronda 1. */
function enVotacion(): EstadoMeloquiz {
  let estado = exito(crearPartida(JUGADORES, POOL, {}, rng(), 0));
  estado = exito(expirarFase(estado, 0, rng())); // clip
  estado = exito(expirarFase(estado, 0, rng())); // voto
  return estado;
}

/** Cierra la ronda por reloj para que se aplique el marcador. */
function hastaPuntaje(estado: EstadoMeloquiz): EstadoMeloquiz {
  let e = estado;
  while (e.fase !== "puntaje") e = exito(expirarFase(e, 0, rng()));
  return e;
}

describe("opciones de la ronda (§5)", () => {
  it("son 4: la correcta más 3 distractores del mismo pool", () => {
    const estado = enVotacion();
    const ronda = estado.rondaActual;
    expect(ronda).not.toBeNull();
    if (ronda === null) return;
    expect(ronda.opciones).toHaveLength(REGLAS_MELOQUIZ.opcionesPorRonda);
    const titulos = ronda.opciones.map((o) => o.titulo);
    expect(new Set(titulos).size).toBe(REGLAS_MELOQUIZ.opcionesPorRonda);
    expect(titulos).toContain(cancionDe(POOL, ronda.cancionId).titulo);
    for (const o of ronda.opciones) {
      expect(POOL.canciones.some((c) => c.id === o.cancionId)).toBe(true);
    }
  });

  it("la opción correcta apunta a la canción que suena", () => {
    const estado = enVotacion();
    const ronda = estado.rondaActual;
    if (ronda === null) return;
    const correcta = ronda.opciones.find((o) => o.id === ronda.opcionCorrectaId);
    expect(correcta?.cancionId).toBe(ronda.cancionId);
  });
});

describe("puntaje plano (§5)", () => {
  it("acertar suma exactamente 1 punto", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", opcionCorrecta(estado), 100));
    estado = hastaPuntaje(estado);
    expect(puntosDe(estado, "j1")).toBe(1);
  });

  it("fallar no suma", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", opcionIncorrecta(estado), 100));
    estado = hastaPuntaje(estado);
    expect(puntosDe(estado, "j1")).toBe(0);
  });

  it("no votar no suma (§7: quien se desconecta pierde la ronda)", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", opcionCorrecta(estado), 100));
    estado = hastaPuntaje(estado);
    expect(puntosDe(estado, "j2")).toBe(0);
  });

  it("NADIE acierta ⇒ nadie suma y la partida sigue", () => {
    let estado = enVotacion();
    for (const j of JUGADORES) {
      estado = exito(votar(estado, j.id, opcionIncorrecta(estado), 100));
    }
    estado = hastaPuntaje(estado);
    for (const j of JUGADORES) expect(puntosDe(estado, j.id)).toBe(0);
    expect(estado.fase).toBe("puntaje");
  });

  it("votar primero no da ninguna ventaja: dos aciertos valen 1 cada uno", () => {
    let estado = enVotacion();
    const correcta = opcionCorrecta(estado);
    estado = exito(votar(estado, "j1", correcta, 50)); // votó apenas empezó
    estado = exito(votar(estado, "j2", correcta, 9_900)); // votó sobre la bocina
    estado = hastaPuntaje(estado);
    expect(puntosDe(estado, "j1")).toBe(1);
    expect(puntosDe(estado, "j2")).toBe(1);
  });
});

describe("cierre anticipado de la votación (§5)", () => {
  it("cuando votan todos, se pasa a revelar de inmediato", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", opcionCorrecta(estado), 10));
    expect(estado.fase).toBe("voto");
    estado = exito(votar(estado, "j2", opcionCorrecta(estado), 20));
    expect(estado.fase).toBe("voto");
    estado = exito(votar(estado, "j3", opcionCorrecta(estado), 30));
    expect(estado.fase).toBe("revelar");
    expect(estado.faseIniciadaEnMs).toBe(30);
  });

  it("el marcador se aplica al salir de revelar, no al votar", () => {
    let estado = enVotacion();
    const correcta = opcionCorrecta(estado);
    for (const j of JUGADORES) estado = exito(votar(estado, j.id, correcta, 10));
    expect(estado.fase).toBe("revelar");
    expect(puntosDe(estado, "j1")).toBe(0); // todavía no
    estado = exito(expirarFase(estado, 0, rng()));
    expect(estado.fase).toBe("puntaje");
    expect(puntosDe(estado, "j1")).toBe(1);
  });
});

describe("votación: errores", () => {
  it("votar dos veces es YA_VOTASTE", () => {
    let estado = enVotacion();
    const correcta = opcionCorrecta(estado);
    estado = exito(votar(estado, "j1", correcta, 10));
    const r = votar(estado, "j1", correcta, 20);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("YA_VOTASTE");
  });

  it("una opción inexistente es OPCION_DESCONOCIDA", () => {
    const r = votar(enVotacion(), "j1", "1-op99", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("OPCION_DESCONOCIDA");
  });

  it("votar con el id de la CANCIÓN no cuela (se vota por id de opción)", () => {
    const estado = enVotacion();
    const r = votar(estado, "j1", estado.rondaActual?.cancionId ?? "", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("OPCION_DESCONOCIDA");
  });

  it("votar fuera de la fase de voto es FASE_INVALIDA", () => {
    const estado = exito(crearPartida(JUGADORES, POOL, {}, rng(), 0)); // precarga
    const r = votar(estado, "j1", "1-op1", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("FASE_INVALIDA");
  });

  it("un jugador ajeno a la partida es JUGADOR_DESCONOCIDO", () => {
    const estado = enVotacion();
    const r = votar(estado, "intruso", opcionCorrecta(estado), 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADOR_DESCONOCIDO");
  });

  it("los votos se limpian entre rondas", () => {
    let estado = exito(crearPartida(JUGADORES, POOL, { rondas: 2 }, rng(), 0));
    for (let i = 0; i < 2; i++) estado = exito(expirarFase(estado, 0, rng())); // voto
    estado = exito(votar(estado, "j1", opcionCorrecta(estado), 10));
    for (let i = 0; i < 3; i++) estado = exito(expirarFase(estado, 0, rng()));
    expect(estado.ronda).toBe(2);
    expect(estado.votos).toEqual({});
  });
});
