// Máquina de fases dirigida por reloj (REGLAS_MELOQUIZ.md §4; SPIKE §6.1/§6.2).
// El reloj es SIEMPRE inyectado: ningún test espera tiempo real y el núcleo
// nunca consulta la hora.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import {
  crearPartida,
  expirarFase,
  faseTemporizada,
  terminada,
  votar,
  type EstadoMeloquiz,
} from "./partida.js";
import { REGLAS_MELOQUIZ } from "./reglas.js";
import { JUGADORES, exito, poolDePrueba, relojFalso } from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(1234);

function partidaNueva(rondas = 2): EstadoMeloquiz {
  return exito(
    crearPartida(JUGADORES, poolDePrueba(6), { rondas }, rng(), 0),
  );
}

describe("máquina de fases: orden y duraciones (§4)", () => {
  it("arranca en precarga, ronda 1, con la ronda ya armada", () => {
    const estado = partidaNueva();
    expect(estado.fase).toBe("precarga");
    expect(estado.ronda).toBe(1);
    expect(estado.rondaActual).not.toBeNull();
    expect(estado.faseIniciadaEnMs).toBe(0);
  });

  it("recorre precarga → clip → revelar → voto → puntaje y abre la ronda 2", () => {
    const reloj = relojFalso();
    let estado = partidaNueva(2);
    const recorrido: string[] = [estado.fase];

    for (let i = 0; i < 5; i++) {
      const fase = faseTemporizada(estado);
      expect(fase).not.toBeNull();
      estado = exito(expirarFase(estado, reloj.avanzar(fase?.duracionMs ?? 0), rng()));
      recorrido.push(estado.fase);
    }

    expect(recorrido).toEqual(["precarga", "clip", "revelar", "voto", "puntaje", "precarga"]);
    expect(estado.ronda).toBe(2);
  });

  it("sella en faseIniciadaEnMs el instante que le pasan (nunca el reloj real)", () => {
    const estado = partidaNueva();
    const avanzado = exito(expirarFase(estado, 987_654, rng()));
    expect(avanzado.faseIniciadaEnMs).toBe(987_654);
  });

  it("faseTemporizada devuelve {clave, duracionMs} con las duraciones de §4", () => {
    const { duraciones } = REGLAS_MELOQUIZ;
    let estado = partidaNueva();
    const esperado: readonly [string, number][] = [
      ["1:precarga", duraciones.precarga],
      ["1:clip", duraciones.clip],
      ["1:revelar", duraciones.revelar],
      ["1:voto", duraciones.voto],
      ["1:puntaje", duraciones.puntaje],
    ];
    for (const [clave, duracionMs] of esperado) {
      expect(faseTemporizada(estado)).toEqual({ clave, duracionMs });
      estado = exito(expirarFase(estado, 0, rng()));
    }
  });

  it("la clave NO cambia por una acción dentro de la misma fase (no reinicia el timer)", () => {
    let estado = partidaNueva();
    estado = exito(expirarFase(estado, 0, rng())); // clip
    estado = exito(expirarFase(estado, 0, rng())); // revelar
    estado = exito(expirarFase(estado, 0, rng())); // voto
    const antes = faseTemporizada(estado);

    // Vota UNO solo: la fase sigue siendo la misma, así que la clave no cambia.
    estado = exito(votar(estado, "j1", "j2", 100));
    expect(estado.fase).toBe("voto");
    expect(faseTemporizada(estado)).toEqual(antes);
  });

  it("la clave cambia de ronda en ronda", () => {
    let estado = partidaNueva(2);
    for (let i = 0; i < 5; i++) estado = exito(expirarFase(estado, 0, rng()));
    expect(faseTemporizada(estado)?.clave).toBe("2:precarga");
  });
});

describe("fin de partida", () => {
  it("tras la última ronda entra en final, sin fase temporizada", () => {
    let estado = partidaNueva(1);
    for (let i = 0; i < 5; i++) estado = exito(expirarFase(estado, 0, rng()));
    expect(estado.fase).toBe("final");
    expect(terminada(estado)).toBe(true);
    expect(estado.rondaActual).toBeNull();
    expect(faseTemporizada(estado)).toBeNull();
  });

  it("expirar en final es un error, no un avance", () => {
    let estado = partidaNueva(1);
    for (let i = 0; i < 5; i++) estado = exito(expirarFase(estado, 0, rng()));
    const r = expirarFase(estado, 0, rng());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("PARTIDA_TERMINADA");
  });
});

describe("creación: validaciones", () => {
  it("rechaza menos jugadores que el mínimo (§6)", () => {
    const r = crearPartida([{ id: "j1", nombre: "Ana" }], poolDePrueba(6), {}, rng(), 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("rechaza ids de jugador duplicados", () => {
    const dobles = [
      { id: "j1", nombre: "Ana" },
      { id: "j1", nombre: "Otro" },
    ];
    const r = crearPartida(dobles, poolDePrueba(6), {}, rng(), 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("rechaza un pool con menos de 4 canciones (§2)", () => {
    const r = crearPartida(JUGADORES, poolDePrueba(3), {}, rng(), 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("POOL_INVALIDO");
  });

  it("rondas por defecto = cantidad de canciones del pool (§6)", () => {
    const estado = exito(crearPartida(JUGADORES, poolDePrueba(7), {}, rng(), 0));
    expect(estado.rondasTotales).toBe(7);
  });

  it("rechaza más rondas que canciones disponibles", () => {
    const r = crearPartida(JUGADORES, poolDePrueba(5), { rondas: 6 }, rng(), 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("RONDAS_INVALIDAS");
  });

  it("acepta duraciones a medida sin perder las demás", () => {
    const estado = exito(
      crearPartida(JUGADORES, poolDePrueba(5), { duraciones: { clip: 3_000 } }, rng(), 0),
    );
    expect(estado.duraciones.clip).toBe(3_000);
    expect(estado.duraciones.voto).toBe(REGLAS_MELOQUIZ.duraciones.voto);
  });

  it("no repite canción entre rondas", () => {
    const estado = exito(crearPartida(JUGADORES, poolDePrueba(6), {}, rng(), 0));
    expect(new Set(estado.ordenCanciones).size).toBe(estado.ordenCanciones.length);
  });

  it("es determinista: misma semilla ⇒ mismo sorteo", () => {
    const a = exito(crearPartida(JUGADORES, poolDePrueba(6), {}, rng(), 0));
    const b = exito(crearPartida(JUGADORES, poolDePrueba(6), {}, rng(), 0));
    expect(a.ordenCanciones).toEqual(b.ordenCanciones);
    expect(a.rondaActual).toEqual(b.rondaActual);
  });
});
