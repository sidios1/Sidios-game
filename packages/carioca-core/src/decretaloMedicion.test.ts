// INSTRUMENTACIÓN de calibración de DECRETALO (§3.1 / §8 de REGLAS_RUMBLE.md).
// MIDE, no decide: el valor 0.25 sigue marcado como PROVISIONAL en partida.ts.
//
// El punto no obvio que mide esto: la probabilidad NOMINAL (0.25) no es la tasa
// EFECTIVA. El sesgo solo puede acertar si la carta decretada está en el MAZO en
// ese momento; si está en una mano, en el pozo o en la mesa, el robo cae al normal.
// Determinista: RNG sembrado.

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { crearPartida, robarDelMazoSesgado } from "./partida.js";
import type { EstadoPartida } from "./partida.js";
import type { Pinta, ValorCarta } from "./carta.js";

const JUGADORES = [
  { id: "j1", nombre: "J1" },
  { id: "j2", nombre: "J2" },
];

const OBJETIVO: { pinta: Pinta; valor: ValorCarta } = { pinta: "picas", valor: 12 };

function partidaFresca(semilla: number): EstadoPartida {
  const res = crearPartida(JUGADORES, crearGeneradorSemilla(semilla));
  if (!res.ok) throw new Error(res.error.mensaje);
  return res.valor;
}

/**
 * Simula un robo decretado sobre una partida recién repartida y reporta si acertó
 * (robó una carta que casa con el objetivo) y si la carta estaba disponible en el mazo.
 */
function unRobo(
  semilla: number,
  probabilidad: number,
): { acierto: boolean; habiaEnMazo: boolean } {
  const estado = partidaFresca(semilla);
  const enTurno = estado.turno.jugadorId;
  const habiaEnMazo = estado.mazo.some(
    (c) => c.tipo === "normal" && c.pinta === OBJETIVO.pinta && c.valor === OBJETIVO.valor,
  );
  const antes = estado.jugadores.find((j) => j.id === enTurno)?.mano ?? [];
  const res = robarDelMazoSesgado(
    estado,
    enTurno,
    OBJETIVO,
    crearGeneradorSemilla(semilla * 31 + 7),
    probabilidad,
  );
  if (!res.ok) return { acierto: false, habiaEnMazo };
  const despues = res.valor.jugadores.find((j) => j.id === enTurno)?.mano ?? [];
  const nueva = despues.find((c) => !antes.some((a) => a.id === c.id));
  const acierto =
    nueva !== undefined &&
    nueva.tipo === "normal" &&
    nueva.pinta === OBJETIVO.pinta &&
    nueva.valor === OBJETIVO.valor;
  return { acierto, habiaEnMazo };
}

const MUESTRAS = 4000;

describe("Calibración §3.1 — probabilidad de DECRETALO (PROVISIONAL 0.25)", () => {
  it("mide la tasa EFECTIVA de acierto frente a la nominal", () => {
    const filas = [0.25, 0.35, 0.5, 0.75, 1].map((p) => {
      let aciertos = 0;
      let disponibles = 0;
      for (let s = 1; s <= MUESTRAS; s += 1) {
        const { acierto, habiaEnMazo } = unRobo(s, p);
        if (acierto) aciertos += 1;
        if (habiaEnMazo) disponibles += 1;
      }
      return {
        "prob. nominal": p,
        "acierto efectivo": `${((aciertos / MUESTRAS) * 100).toFixed(2)}%`,
        "carta en mazo": `${((disponibles / MUESTRAS) * 100).toFixed(2)}%`,
        "acierto | disponible": `${((aciertos / Math.max(1, disponibles)) * 100).toFixed(2)}%`,
      };
    });

    console.log(
      `\n── §3.1 DECRETALO · ${MUESTRAS} robos decretados, objetivo Q♠, 2 jugadores ──`,
    );
    console.table(filas);
    console.log(
      "Nota: 'acierto efectivo' < nominal porque el sesgo solo aplica si la carta\n" +
        "sigue en el mazo. Con 3 robos por ronda (cargas de DECRETALO), la probabilidad\n" +
        "de al menos 1 acierto es 1-(1-efectiva)^3.",
    );

    // Con probabilidad 1 y la carta disponible, el sesgo SIEMPRE acierta.
    const pUno = filas[filas.length - 1];
    expect(pUno?.["acierto | disponible"]).toBe("100.00%");
  });

  it("proyecta la probabilidad de al menos un acierto gastando las 3 cargas", () => {
    // Se COMPONE a partir de la tasa efectiva medida arriba en vez de simular la
    // ronda entera: encadenar 3 robos propios exige jugar los turnos intermedios
    // del rival, que además vacían el mazo y contaminarían la medición. La tasa
    // por robo es lo que se mide; el resto es 1-(1-e)^3, independiente entre robos.
    const filas = [0.25, 0.35, 0.5].map((p) => {
      let aciertos = 0;
      for (let s = 1; s <= MUESTRAS; s += 1) {
        if (unRobo(s, p).acierto) aciertos += 1;
      }
      const e = aciertos / MUESTRAS;
      return {
        "prob. nominal": p,
        "efectiva por robo": `${(e * 100).toFixed(2)}%`,
        "≥1 acierto en 3 robos": `${((1 - (1 - e) ** 3) * 100).toFixed(2)}%`,
      };
    });
    console.log("\n── §3.1 DECRETALO · proyección con las 3 cargas de la ronda ──");
    console.table(filas);
    expect(filas).toHaveLength(3);
  });
});
