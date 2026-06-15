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

const rng = () => crearGeneradorSemilla(99);

describe("acusar: resolución de la acusación (§5)", () => {
  it("si el acusado MENTÍA (alguna no es del palo), el ACUSADO recoge la pila", () => {
    // paloRonda = picas; j1 juega una carta de corazones (mentira).
    // round-robin: j1 = [corazones-a, picas-c], j2 = [picas-b, picas-d].
    const baraja: readonly Carta[] = [
      carta("corazones", "corazones-a"),
      carta("picas", "picas-b"),
      carta("picas", "picas-c"),
      carta("picas", "picas-d"),
    ];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const jugado = jugar(inicio.valor, "j1", 1); // pila = [corazones-a]
    if (!jugado.ok) return;
    const r = acusar(jugado.valor, "j2", rng());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // El acusado (j1) recoge la pila: recupera corazones-a.
    expect(r.valor.manos["j1"]?.map((c) => c.id)).toContain("corazones-a");
    expect(r.valor.manos["j1"]).toHaveLength(2); // picas-c + corazones-a recogida
    expect(r.valor.pila).toHaveLength(0);
    expect(r.valor.ultimaJugada).toBeNull();
    expect(r.valor.jugadorEnTurno).toBe("j1"); // quien recoge inicia
  });

  it("si el acusado DECÍA VERDAD (todas del palo), el ACUSADOR recoge la pila", () => {
    // paloRonda = picas; j1 juega una carta de picas (verdad).
    const baraja: readonly Carta[] = [
      carta("picas", "picas-a"),
      carta("corazones", "corazones-b"),
      carta("picas", "picas-c"),
      carta("picas", "picas-d"),
    ];
    const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
    if (!inicio.ok) return;
    const jugado = jugar(inicio.valor, "j1", 1); // pila = [picas-a]
    if (!jugado.ok) return;
    const r = acusar(jugado.valor, "j2", rng());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // El acusador (j2) recoge la pila: suma picas-a a su mano.
    expect(r.valor.manos["j2"]?.map((c) => c.id)).toContain("picas-a");
    expect(r.valor.manos["j2"]).toHaveLength(3); // 2 iniciales + picas-a recogida
    expect(r.valor.pila).toHaveLength(0);
    expect(r.valor.jugadorEnTurno).toBe("j2"); // quien recoge inicia
  });

  it("no se puede acusar si no hay una jugada (§inicio de ronda)", () => {
    const inicio = crearPartidaConBaraja(JUGADORES, crearBarajaSimple(), "picas");
    if (!inicio.ok) return;
    const r = acusar(inicio.valor, "j2", rng());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("NADA_QUE_ACUSAR");
  });

  it("no se puede acusar la propia jugada", () => {
    const inicio = crearPartidaConBaraja(JUGADORES, crearBarajaSimple(), "picas");
    if (!inicio.ok) return;
    const jugado = jugar(inicio.valor, "j1", 1);
    if (!jugado.ok) return;
    const r = acusar(jugado.valor, "j1", rng());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("NO_AUTO_ACUSACION");
  });
});

describe("nueva ronda tras acusar (§6)", () => {
  it("la ronda nueva usa un palo distinto al anterior, con cualquier semilla", () => {
    const baraja: readonly Carta[] = [
      carta("picas", "picas-a"),
      carta("picas", "picas-b"),
      carta("picas", "picas-c"),
      carta("picas", "picas-d"),
    ];
    for (let semilla = 0; semilla < 50; semilla++) {
      const inicio = crearPartidaConBaraja(JUGADORES, baraja, "picas");
      if (!inicio.ok) return;
      const jugado = jugar(inicio.valor, "j1", 1);
      if (!jugado.ok) return;
      const r = acusar(jugado.valor, "j2", crearGeneradorSemilla(semilla));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valor.paloRondaAnterior).toBe("picas");
      expect(r.valor.paloRonda).not.toBe("picas");
    }
  });
});

/** Baraja pequeña sin importar palos, para casos donde el palo no influye. */
function crearBarajaSimple(): readonly Carta[] {
  return [
    carta("picas", "picas-a"),
    carta("picas", "picas-b"),
    carta("picas", "picas-c"),
    carta("picas", "picas-d"),
  ];
}
