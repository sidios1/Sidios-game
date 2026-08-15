import { describe, expect, it } from "vitest";
import { exito } from "./apoyoPruebas.js";
import { jugadorDe, type EstadoMonopoly } from "./estado.js";
import { intercambiar, type OfertaIntercambio } from "./intercambios.js";
import type { CartaMiClub } from "./miClub.js";
import { partidaDePrueba } from "./pruebasComunes.js";

function conJugador(
  estado: EstadoMonopoly,
  jugadorId: string,
  cambios: Partial<EstadoMonopoly["jugadores"][number]>,
): EstadoMonopoly {
  return { ...estado, jugadores: estado.jugadores.map((j) => (j.id === jugadorId ? { ...j, ...cambios } : j)) };
}

function cartaTecnico(id: string): CartaMiClub {
  return { tipo: "tecnico", id, tecnico: { id: `t-${id}`, nombre: "N", apellido: "A" } };
}

const vacia: OfertaIntercambio = { dinero: 0, cartaIds: [] };

describe("intercambiar (§3: libre, en cualquier momento)", () => {
  it("intercambia dinero y cartas en ambas direcciones", () => {
    const base = partidaDePrueba();
    const conCartas = conJugador(conJugador(base, "j1", { miClub: [cartaTecnico("c1")] }), "j2", {
      miClub: [cartaTecnico("c2")],
    });
    const resultado = exito(
      intercambiar(conCartas, "j1", "j2", { dinero: 50, cartaIds: ["c1"] }, { dinero: 0, cartaIds: ["c2"] }),
    );
    expect(jugadorDe(resultado, "j1").presupuesto).toBe(950);
    expect(jugadorDe(resultado, "j2").presupuesto).toBe(1050);
    expect(jugadorDe(resultado, "j1").miClub.map((c) => c.id)).toEqual(["c2"]);
    expect(jugadorDe(resultado, "j2").miClub.map((c) => c.id)).toEqual(["c1"]);
  });

  it("no requiere que sea el turno de ninguno de los dos", () => {
    const base = partidaDePrueba();
    expect(base.jugadorEnTurno).toBe("j1");
    const conCarta = conJugador(base, "j2", { miClub: [cartaTecnico("c1")] });
    const resultado = intercambiar(conCarta, "j2", "j3", { dinero: 10, cartaIds: [] }, vacia);
    expect(resultado.ok).toBe(true);
  });

  it("rechaza intercambiar consigo mismo", () => {
    const resultado = intercambiar(partidaDePrueba(), "j1", "j1", vacia, vacia);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("RIVAL_INVALIDO");
  });

  it("rechaza ofrecer una carta que no se tiene", () => {
    const resultado = intercambiar(partidaDePrueba(), "j1", "j2", { dinero: 0, cartaIds: ["no-existe"] }, vacia);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("CARTA_DESCONOCIDA");
  });

  it("rechaza si no hay saldo suficiente para lo ofrecido", () => {
    const resultado = intercambiar(partidaDePrueba(), "j1", "j2", { dinero: 5000, cartaIds: [] }, vacia);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("SALDO_INSUFICIENTE");
  });

  it("un jugador en quiebra no puede intercambiar", () => {
    const base = conJugador(partidaDePrueba(), "j1", { enQuiebra: true });
    const resultado = intercambiar(base, "j1", "j2", vacia, vacia);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("JUGADOR_EN_QUIEBRA");
  });
});
