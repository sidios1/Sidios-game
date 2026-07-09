import { describe, expect, it } from "vitest";
import type { Carta, JugadorUno } from "./index.js";
import { crearGeneradorSemilla } from "./aleatorio.js";
import {
  crearPartida,
  crearPartidaConMazo,
  jugar,
  jugadorEnTurno,
  pasar,
  robar,
} from "./partida.js";
import { comodin, estadoDePrueba, exito, mazoDesde, num, simbolo } from "./apoyoPruebas.js";

function J(id: string): JugadorUno {
  return { id, nombre: id };
}

/** Mano de relleno de exactamente 7 cartas (reparto en bloque). */
function mano7(): Carta[] {
  return [
    num("amarillo", 1),
    num("amarillo", 2),
    num("amarillo", 3),
    num("amarillo", 4),
    num("amarillo", 5),
    num("amarillo", 6),
    num("amarillo", 7),
  ];
}

describe("crearPartida (barajado)", () => {
  it("rechaza menos de 2 jugadores", () => {
    const r = crearPartida([J("a")], crearGeneradorSemilla(1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("reparte 7 cartas a cada jugador y deja una cima", () => {
    const e = exito(crearPartida([J("a"), J("b"), J("c")], crearGeneradorSemilla(7)));
    expect(e.manos["a"]).toHaveLength(7);
    expect(e.manos["b"]).toHaveLength(7);
    expect(e.manos["c"]).toHaveLength(7);
    expect(e.descarte).toHaveLength(1);
    expect(e.fase).toBe("jugando");
  });

  it("es determinista con la misma semilla", () => {
    const a = exito(crearPartida([J("a"), J("b")], crearGeneradorSemilla(42)));
    const b = exito(crearPartida([J("a"), J("b")], crearGeneradorSemilla(42)));
    expect(a.manos["a"]?.map((c) => c.id)).toEqual(b.manos["a"]?.map((c) => c.id));
    expect(a.descarte.map((c) => c.id)).toEqual(b.descarte.map((c) => c.id));
  });
});

describe("legalidad de la jugada", () => {
  it("matchea color, número o comodín; rechaza lo que no", () => {
    const r3 = num("rojo", 3);
    const v5 = num("verde", 5);
    const a7 = num("azul", 7);
    const w = comodin("wild");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [r3, v5, a7, w], b: [num("amarillo", 1)] },
      descarte: [num("rojo", 5)],
      colorActivo: "rojo",
    });
    expect(jugar(est, "a", r3.id).ok).toBe(true); // color
    expect(jugar(est, "a", v5.id).ok).toBe(true); // número
    expect(jugar(est, "a", w.id, "azul").ok).toBe(true); // comodín

    const ilegal = jugar(est, "a", a7.id);
    expect(ilegal.ok).toBe(false);
    if (!ilegal.ok) expect(ilegal.error.codigo).toBe("JUGADA_ILEGAL");

    const sinColor = jugar(est, "a", w.id);
    expect(sinColor.ok).toBe(false);
    if (!sinColor.ok) expect(sinColor.error.codigo).toBe("COLOR_REQUERIDO");
  });

  it("matchea por símbolo aunque cambie el color", () => {
    const sv = simbolo("verde", "skip");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [sv, num("azul", 2)], b: [num("amarillo", 1)] },
      descarte: [simbolo("rojo", "skip")],
      colorActivo: "rojo",
    });
    expect(jugar(est, "a", sv.id).ok).toBe(true);
  });

  it("rechaza jugar fuera de turno", () => {
    const c = num("rojo", 1);
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [num("amarillo", 1)], b: [c] },
      descarte: [num("rojo", 5)],
      colorActivo: "rojo",
    });
    const r = jugar(est, "b", c.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe("NO_ES_TU_TURNO");
  });
});

describe("cartas de acción", () => {
  it("Skip salta al siguiente", () => {
    const sk = simbolo("rojo", "skip");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b"), J("c")],
      manos: { a: [sk, num("rojo", 1)], b: [num("amarillo", 1)], c: [num("amarillo", 2)] },
      descarte: [num("rojo", 4)],
      colorActivo: "rojo",
    });
    expect(jugadorEnTurno(exito(jugar(est, "a", sk.id)))).toBe("c");
  });

  it("Reverse invierte la dirección", () => {
    const rv = simbolo("rojo", "reverse");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b"), J("c")],
      manos: { a: [rv, num("rojo", 1)], b: [num("amarillo", 1)], c: [num("amarillo", 2)] },
      descarte: [num("rojo", 4)],
      colorActivo: "rojo",
    });
    const e = exito(jugar(est, "a", rv.id));
    expect(e.direccion).toBe(-1);
    expect(jugadorEnTurno(e)).toBe("c");
  });

  it("Reverse con 2 jugadores actúa como Skip", () => {
    const rv = simbolo("rojo", "reverse");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [rv, num("rojo", 1)], b: [num("amarillo", 1)] },
      descarte: [num("rojo", 4)],
      colorActivo: "rojo",
    });
    expect(jugadorEnTurno(exito(jugar(est, "a", rv.id)))).toBe("a");
  });

  it("+2 abre el acumulador sobre el siguiente", () => {
    const m2 = simbolo("rojo", "mas2");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [m2, num("rojo", 1)], b: [num("amarillo", 1)] },
      descarte: [num("rojo", 4)],
      colorActivo: "rojo",
    });
    const e = exito(jugar(est, "a", m2.id));
    expect(e.acumuladoPendiente).toBe(2);
    expect(jugadorEnTurno(e)).toBe("b");
  });

  it("comodín fija el color elegido", () => {
    const w = comodin("wild");
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [w, num("rojo", 1)], b: [num("amarillo", 1)] },
      descarte: [num("rojo", 4)],
      colorActivo: "rojo",
    });
    expect(exito(jugar(est, "a", w.id, "verde")).colorActivo).toBe("verde");
  });
});

describe("robar cuando no puedes jugar", () => {
  it("robar una carta no jugable pasa el turno", () => {
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [num("azul", 9)], b: [num("amarillo", 1)] },
      mazo: [num("azul", 2)],
      descarte: [num("rojo", 5)],
      colorActivo: "rojo",
    });
    const e = exito(robar(est, "a", crearGeneradorSemilla(1)));
    expect(jugadorEnTurno(e)).toBe("b");
    expect(e.robadaPendiente).toBeNull();
    expect(e.manos["a"]).toHaveLength(2);
  });

  it("robar una carta jugable la deja pendiente y solo permite jugarla o pasar", () => {
    const a9 = num("azul", 9);
    const robable = num("rojo", 1);
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [a9], b: [num("amarillo", 1)] },
      mazo: [robable],
      descarte: [num("rojo", 5)],
      colorActivo: "rojo",
    });
    const e = exito(robar(est, "a", crearGeneradorSemilla(1)));
    expect(jugadorEnTurno(e)).toBe("a");
    expect(e.robadaPendiente?.cartaId).toBe(robable.id);

    const otra = jugar(e, "a", a9.id);
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.codigo).toBe("JUGADA_ILEGAL");

    const jugó = exito(jugar(e, "a", robable.id));
    expect(jugadorEnTurno(jugó)).toBe("b");

    const pasó = exito(pasar(e, "a"));
    expect(jugadorEnTurno(pasó)).toBe("b");
    expect(pasó.robadaPendiente).toBeNull();
  });
});

describe("carta inicial de acción (cuatro variantes)", () => {
  it("+2 abre acumulador sobre el primero", () => {
    const mazo = mazoDesde({
      manos: [mano7(), mano7()],
      inicial: simbolo("rojo", "mas2"),
      robos: [num("rojo", 1), num("rojo", 2)],
    });
    const e = exito(crearPartidaConMazo([J("a"), J("b")], mazo));
    expect(e.acumuladoPendiente).toBe(2);
    expect(jugadorEnTurno(e)).toBe("a");
    expect(e.colorActivo).toBe("rojo");
  });

  it("Skip salta al primero", () => {
    const mazo = mazoDesde({ manos: [mano7(), mano7(), mano7()], inicial: simbolo("rojo", "skip") });
    const e = exito(crearPartidaConMazo([J("a"), J("b"), J("c")], mazo));
    expect(jugadorEnTurno(e)).toBe("b");
  });

  it("Reverse con >2 jugadores invierte y salta al jugador 0", () => {
    const mazo = mazoDesde({ manos: [mano7(), mano7(), mano7()], inicial: simbolo("rojo", "reverse") });
    const e = exito(crearPartidaConMazo([J("a"), J("b"), J("c")], mazo));
    expect(e.direccion).toBe(-1);
    expect(jugadorEnTurno(e)).toBe("c");
  });

  it("Reverse con 2 jugadores actúa como Skip", () => {
    const mazo = mazoDesde({ manos: [mano7(), mano7()], inicial: simbolo("rojo", "reverse") });
    const e = exito(crearPartidaConMazo([J("a"), J("b")], mazo));
    expect(jugadorEnTurno(e)).toBe("b");
  });

  it("Wild/+4 inicial se re-voltea reinsertando el comodín al fondo", () => {
    const inicialReal = num("rojo", 5);
    const mazo = mazoDesde({
      manos: [mano7(), mano7()],
      inicial: comodin("wild"),
      robos: [inicialReal, num("rojo", 6)],
    });
    const e = exito(crearPartidaConMazo([J("a"), J("b")], mazo));
    const cima = e.descarte[e.descarte.length - 1];
    expect(cima?.id).toBe(inicialReal.id);
    expect(cima?.tipo).toBe("numero");
    expect(e.colorActivo).toBe("rojo");
    expect(e.mazo[e.mazo.length - 1]?.tipo).toBe("wild");
  });
});
