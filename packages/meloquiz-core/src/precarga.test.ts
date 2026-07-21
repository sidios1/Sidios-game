// Fase de precarga con acks (REGLAS_MELOQUIZ.md §3.2, §3.3): cierra en cuanto
// ackean todos; si alguno no confirma, el timeout arranca sin él.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { crearPartida, expirarFase, marcarListo, type EstadoMeloquiz } from "./partida.js";
import { JUGADORES, exito, poolDePrueba } from "./apoyoPruebas.js";

const rng = (): (() => number) => crearGeneradorSemilla(7);

function partidaNueva(): EstadoMeloquiz {
  return exito(crearPartida(JUGADORES, poolDePrueba(6), {}, rng(), 0));
}

describe("precarga: ack de todos ⇒ cierre anticipado (§3.2)", () => {
  it("con acks parciales sigue en precarga", () => {
    let estado = partidaNueva();
    estado = exito(marcarListo(estado, "j1", 10));
    expect(estado.fase).toBe("precarga");
    estado = exito(marcarListo(estado, "j2", 20));
    expect(estado.fase).toBe("precarga");
    expect(estado.listos).toEqual(["j1", "j2"]);
  });

  it("al ackear el último pasa a clip sellando ese instante", () => {
    let estado = partidaNueva();
    estado = exito(marcarListo(estado, "j1", 10));
    estado = exito(marcarListo(estado, "j2", 20));
    estado = exito(marcarListo(estado, "j3", 30));
    expect(estado.fase).toBe("clip");
    expect(estado.faseIniciadaEnMs).toBe(30);
  });
});

describe("precarga: timeout (§3.3)", () => {
  it("expirar con acks parciales arranca igual, sin los rezagados", () => {
    let estado = partidaNueva();
    estado = exito(marcarListo(estado, "j1", 10));
    estado = exito(expirarFase(estado, 15_000, rng()));
    expect(estado.fase).toBe("clip");
    // El rezagado no ackeó y la partida no se frenó por él.
    expect(estado.listos).toEqual(["j1"]);
  });

  it("los listos se limpian al empezar la precarga de la ronda siguiente", () => {
    let estado = exito(crearPartida(JUGADORES, poolDePrueba(6), { rondas: 2 }, rng(), 0));
    estado = exito(marcarListo(estado, "j1", 10));
    for (let i = 0; i < 5; i++) estado = exito(expirarFase(estado, 0, rng()));
    expect(estado.fase).toBe("precarga");
    expect(estado.ronda).toBe(2);
    expect(estado.listos).toEqual([]);
  });
});

describe("precarga: errores", () => {
  it("marcarListo fuera de precarga es FASE_INVALIDA", () => {
    let estado = partidaNueva();
    estado = exito(expirarFase(estado, 0, rng())); // clip
    const r = marcarListo(estado, "j1", 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("FASE_INVALIDA");
  });

  it("ackear dos veces es YA_LISTO", () => {
    let estado = partidaNueva();
    estado = exito(marcarListo(estado, "j1", 10));
    const r = marcarListo(estado, "j1", 20);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("YA_LISTO");
  });

  it("un jugador ajeno a la partida es JUGADOR_DESCONOCIDO", () => {
    const r = marcarListo(partidaNueva(), "intruso", 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADOR_DESCONOCIDO");
  });
});
