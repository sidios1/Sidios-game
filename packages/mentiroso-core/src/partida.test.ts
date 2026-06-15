import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import type { Carta, Palo } from "./carta.js";
import { crearBarajaCompleta } from "./baraja.js";
import {
  crearPartida,
  crearPartidaConBaraja,
  jugar,
  type DatosJugador,
} from "./partida.js";

const JUGADORES: readonly DatosJugador[] = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Beto" },
];

function carta(palo: Palo, id: string): Carta {
  return { palo, id };
}

describe("crearPartida", () => {
  it("reparte TODA la baraja entre los jugadores", () => {
    const r = crearPartida(JUGADORES, crearGeneradorSemilla(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const total = JUGADORES.reduce(
      (acc, j) => acc + (r.valor.manos[j.id] ?? []).length,
      0,
    );
    expect(total).toBe(crearBarajaCompleta().length); // 52
    expect(r.valor.pila).toHaveLength(0);
    expect(r.valor.ganador).toBeNull();
    expect(r.valor.ganadorPendiente).toBeNull();
    expect(r.valor.jugadorEnTurno).toBe("j1");
    expect(r.valor.ultimaJugada).toBeNull();
  });

  it("rechaza menos de 2 jugadores", () => {
    const r = crearPartida([{ id: "j1", nombre: "Ana" }], crearGeneradorSemilla(1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("rechaza ids duplicados", () => {
    const r = crearPartida(
      [
        { id: "j1", nombre: "Ana" },
        { id: "j1", nombre: "Otra" },
      ],
      crearGeneradorSemilla(1),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });
});

describe("jugar", () => {
  // Baraja determinista: round-robin reparte índices pares a j1, impares a j2.
  // j1 = [picas-a, picas-c], j2 = [picas-b, corazones-d].
  const baraja: readonly Carta[] = [
    carta("picas", "picas-a"),
    carta("picas", "picas-b"),
    carta("picas", "picas-c"),
    carta("corazones", "corazones-d"),
  ];

  it("mueve cartas del frente de la mano a la pila y avanza el turno", () => {
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    expect(inicio.ok).toBe(true);
    if (!inicio.ok) return;
    const r = jugar(inicio.valor, "j1", 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.manos["j1"]).toHaveLength(0);
    expect(r.valor.pila).toHaveLength(2);
    expect(r.valor.pila.map((c) => c.id)).toEqual(["picas-a", "picas-c"]);
    expect(r.valor.ultimaJugada).toEqual({
      jugador: "j1",
      cantidad: 2,
      cartas: [carta("picas", "picas-a"), carta("picas", "picas-c")],
    });
    expect(r.valor.jugadorEnTurno).toBe("j2");
  });

  it("rechaza jugar fuera de turno", () => {
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const r = jugar(inicio.valor, "j2", 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("NO_ES_TU_TURNO");
  });

  it("rechaza una cantidad fuera de 1..3", () => {
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    for (const cantidad of [0, 4]) {
      const r = jugar(inicio.valor, "j1", cantidad);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.codigo).toBe("CANTIDAD_INVALIDA");
    }
  });

  it("rechaza jugar más cartas de las que se tienen", () => {
    // j1 solo tiene 2 cartas; pedir 3 debe fallar.
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const r = jugar(inicio.valor, "j1", 3);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("CARTAS_INSUFICIENTES");
  });
});
