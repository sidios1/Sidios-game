// Votación por JUGADOR y veredicto del grupo (REGLAS_MELOQUIZ.md §5, pivote
// 2026-07-21): el juego no juzga aciertos; los participantes votan quién ganó
// la ronda. Mayoría simple, empate = nadie suma, auto-voto permitido, quien no
// vota no aporta.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import {
  crearPartida,
  expirarFase,
  puntosDe,
  resolverVotacion,
  votar,
  type EstadoMeloquiz,
} from "./partida.js";
import { JUGADORES, exito, poolDePrueba } from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(42);
const POOL = poolDePrueba(6);

/** Partida llevada hasta la fase de votación de la ronda 1. */
function enVotacion(): EstadoMeloquiz {
  let estado = exito(crearPartida(JUGADORES, POOL, {}, rng(), 0));
  estado = exito(expirarFase(estado, 0, rng())); // clip
  estado = exito(expirarFase(estado, 0, rng())); // revelar
  estado = exito(expirarFase(estado, 0, rng())); // voto
  return estado;
}

/** Cierra la votación por reloj para que se compute la mayoría. */
function hastaPuntaje(estado: EstadoMeloquiz): EstadoMeloquiz {
  let e = estado;
  while (e.fase !== "puntaje") e = exito(expirarFase(e, 0, rng()));
  return e;
}

describe("mayoría simple (§5)", () => {
  it("el más votado suma exactamente 1 punto; los demás no", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j2", 10));
    estado = exito(votar(estado, "j2", "j2", 20));
    estado = exito(votar(estado, "j3", "j1", 30));
    expect(puntosDe(estado, "j2")).toBe(1);
    expect(puntosDe(estado, "j1")).toBe(0);
    expect(puntosDe(estado, "j3")).toBe(0);
  });

  it("EMPATE en el máximo ⇒ nadie suma y la partida sigue", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j2", 10));
    estado = exito(votar(estado, "j2", "j1", 20));
    estado = hastaPuntaje(estado); // j3 no votó: 1-1, empate
    for (const j of JUGADORES) expect(puntosDe(estado, j.id)).toBe(0);
    expect(estado.fase).toBe("puntaje");
  });

  it("el AUTO-VOTO vale igual que cualquier voto (§5)", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j1", 10)); // se vota a sí mismo
    estado = exito(votar(estado, "j2", "j1", 20));
    estado = exito(votar(estado, "j3", "j2", 30));
    expect(puntosDe(estado, "j1")).toBe(1);
  });

  it("quien no vota no aporta voto (§5) y no bloquea la ronda", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j3", 10)); // j2 y j3 callados
    estado = hastaPuntaje(estado);
    expect(puntosDe(estado, "j3")).toBe(1); // 1 voto contra 0: mayoría igual
    expect(estado.fase).toBe("puntaje");
  });

  it("NADIE vota ⇒ nadie suma y la partida sigue", () => {
    let estado = enVotacion();
    estado = hastaPuntaje(estado);
    for (const j of JUGADORES) expect(puntosDe(estado, j.id)).toBe(0);
    expect(estado.fase).toBe("puntaje");
  });

  it("votar primero no da ninguna ventaja: cuentan los votos, no la hora", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j3", 50)); // votó apenas empezó
    estado = exito(votar(estado, "j2", "j3", 9_900)); // votó sobre la bocina
    estado = hastaPuntaje(estado);
    expect(puntosDe(estado, "j3")).toBe(1);
  });
});

describe("resolverVotacion: la regla en un solo lugar (§5)", () => {
  it("publica el conteo por jugador, con cero para quien no recibió votos", () => {
    const { conteos } = resolverVotacion({ j1: "j2", j2: "j2", j3: "j1" }, JUGADORES);
    expect(conteos).toEqual({ j1: 1, j2: 2, j3: 0 });
  });

  it("sin votos: todos en cero y sin ganador", () => {
    const r = resolverVotacion({}, JUGADORES);
    expect(r.conteos).toEqual({ j1: 0, j2: 0, j3: 0 });
    expect(r.ganadorId).toBeNull();
  });

  it("empate en el máximo: sin ganador", () => {
    const r = resolverVotacion({ j1: "j2", j2: "j1" }, JUGADORES);
    expect(r.ganadorId).toBeNull();
  });
});

describe("cierre anticipado de la votación (§5)", () => {
  it("cuando votan todos, la ventana cierra y se pasa a la tabla de inmediato", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j1", 10));
    expect(estado.fase).toBe("voto");
    estado = exito(votar(estado, "j2", "j1", 20));
    expect(estado.fase).toBe("voto");
    estado = exito(votar(estado, "j3", "j1", 30));
    expect(estado.fase).toBe("puntaje");
    expect(estado.faseIniciadaEnMs).toBe(30);
    expect(puntosDe(estado, "j1")).toBe(1); // la mayoría ya está computada
  });

  it("con 2 jugadores y doble auto-voto hay empate perpetuo: riesgo ACEPTADO (§5)", () => {
    const dos = JUGADORES.slice(0, 2);
    let estado = exito(crearPartida(dos, POOL, {}, rng(), 0));
    for (let i = 0; i < 3; i++) estado = exito(expirarFase(estado, 0, rng())); // voto
    estado = exito(votar(estado, "j1", "j1", 10));
    estado = exito(votar(estado, "j2", "j2", 20));
    expect(estado.fase).toBe("puntaje");
    expect(puntosDe(estado, "j1")).toBe(0);
    expect(puntosDe(estado, "j2")).toBe(0);
  });
});

describe("votación: errores", () => {
  it("votar dos veces es YA_VOTASTE", () => {
    let estado = enVotacion();
    estado = exito(votar(estado, "j1", "j2", 10));
    const r = votar(estado, "j1", "j3", 20);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("YA_VOTASTE");
  });

  it("votar por alguien ajeno a la partida es VOTADO_DESCONOCIDO", () => {
    const r = votar(enVotacion(), "j1", "fantasma", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("VOTADO_DESCONOCIDO");
  });

  it("votar con el id de la CANCIÓN no cuela (se vota por jugador)", () => {
    const estado = enVotacion();
    const r = votar(estado, "j1", estado.rondaActual?.cancionId ?? "", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("VOTADO_DESCONOCIDO");
  });

  it("votar fuera de la fase de voto es FASE_INVALIDA", () => {
    const estado = exito(crearPartida(JUGADORES, POOL, {}, rng(), 0)); // precarga
    const r = votar(estado, "j1", "j2", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("FASE_INVALIDA");
  });

  it("votar durante revelar TAMBIÉN es FASE_INVALIDA (la ventana aún no abrió)", () => {
    let estado = exito(crearPartida(JUGADORES, POOL, {}, rng(), 0));
    estado = exito(expirarFase(estado, 0, rng())); // clip
    estado = exito(expirarFase(estado, 0, rng())); // revelar
    const r = votar(estado, "j1", "j2", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("FASE_INVALIDA");
  });

  it("un votante ajeno a la partida es JUGADOR_DESCONOCIDO", () => {
    const r = votar(enVotacion(), "intruso", "j1", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADOR_DESCONOCIDO");
  });

  it("los votos se limpian entre rondas", () => {
    let estado = exito(crearPartida(JUGADORES, POOL, { rondas: 2 }, rng(), 0));
    for (let i = 0; i < 3; i++) estado = exito(expirarFase(estado, 0, rng())); // voto
    estado = exito(votar(estado, "j1", "j1", 10));
    for (let i = 0; i < 2; i++) estado = exito(expirarFase(estado, 0, rng())); // puntaje → precarga
    expect(estado.ronda).toBe(2);
    expect(estado.votos).toEqual({});
  });
});
