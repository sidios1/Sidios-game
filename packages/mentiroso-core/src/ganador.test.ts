import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import type { Carta, Palo } from "./carta.js";
import { acusar, crearPartidaConBaraja, jugar, type DatosJugador } from "./partida.js";

const JUGADORES: readonly DatosJugador[] = [
  { id: "j1", nombre: "Ana" },
  { id: "j2", nombre: "Beto" },
];

function carta(palo: Palo, id: string): Carta {
  return { palo, id };
}

const rng = () => crearGeneradorSemilla(5);

describe("detección de ganador (§7 y §8.1)", () => {
  it("queda PENDIENTE al vaciar la mano, no gana al instante", () => {
    // Baraja de 2: j1 = [picas-a], j2 = [picas-b].
    const baraja = [carta("picas", "picas-a"), carta("picas", "picas-b")];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const r = jugar(inicio.valor, "j1", 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.manos["j1"]).toHaveLength(0);
    expect(r.valor.ganadorPendiente).toBe("j1");
    expect(r.valor.ganador).toBeNull();
  });

  it("la victoria se confirma cuando el siguiente jugador juega (jugada aceptada)", () => {
    const baraja = [carta("picas", "picas-a"), carta("picas", "picas-b")];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const tras1 = jugar(inicio.valor, "j1", 1);
    if (!tras1.ok) return;
    const tras2 = jugar(tras1.valor, "j2", 1); // acepta la jugada final de j1
    expect(tras2.ok).toBe(true);
    if (!tras2.ok) return;
    expect(tras2.valor.ganador).toBe("j1");
  });

  it("si sobrevive a una acusación (decía verdad), gana", () => {
    // paloRonda = picas; j1 juega su última carta y ES de picas (verdad).
    const baraja = [carta("picas", "picas-a"), carta("corazones", "corazones-b")];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const tras1 = jugar(inicio.valor, "j1", 1);
    if (!tras1.ok) return;
    const r = acusar(tras1.valor, "j2", rng()); // acusación fallida => j2 recoge
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.ganador).toBe("j1");
  });

  it("si lo acusan y MENTÍA en su jugada final, recoge la pila y NO gana", () => {
    // paloRonda = picas; j1 juega su última carta pero es de corazones (mentira).
    const baraja = [carta("corazones", "corazones-a"), carta("picas", "picas-b")];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const tras1 = jugar(inicio.valor, "j1", 1);
    if (!tras1.ok) return;
    const r = acusar(tras1.valor, "j2", rng()); // acusación exitosa => j1 recoge
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.ganador).toBeNull();
    expect(r.valor.ganadorPendiente).toBeNull();
    expect(r.valor.manos["j1"]?.map((c) => c.id)).toContain("corazones-a");
    expect(r.valor.jugadorEnTurno).toBe("j1");
  });

  it("no se puede jugar tras haber un ganador confirmado", () => {
    const baraja = [carta("picas", "picas-a"), carta("picas", "picas-b")];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const tras1 = jugar(inicio.valor, "j1", 1);
    if (!tras1.ok) return;
    const tras2 = jugar(tras1.valor, "j2", 1); // confirma a j1
    if (!tras2.ok) return;
    const r = jugar(tras2.valor, "j1", 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("PARTIDA_TERMINADA");
  });
});
