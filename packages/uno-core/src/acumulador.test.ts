import { describe, expect, it } from "vitest";
import type { JugadorUno } from "./index.js";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { jugar, jugadorEnTurno, resolverAcumulado, robar } from "./partida.js";
import { comodin, estadoDePrueba, exito, num, simbolo } from "./apoyoPruebas.js";

function J(id: string): JugadorUno {
  return { id, nombre: id };
}

describe("acumulador de +", () => {
  it("cross-stacking +2↔+4 sin límite y resolución por robo", () => {
    const m4 = comodin("mas4");
    const m2 = simbolo("azul", "mas2");
    const v1 = num("verde", 1);
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b"), J("c")],
      manos: {
        a: [m4, v1],
        b: [m2, num("verde", 2)],
        c: [num("verde", 3), num("verde", 4)],
      },
      descarte: [simbolo("rojo", "mas2")],
      colorActivo: "rojo",
      acumuladoPendiente: 2,
      mazo: [
        num("rojo", 0),
        num("rojo", 1),
        num("rojo", 2),
        num("rojo", 3),
        num("verde", 5),
        num("verde", 6),
        num("verde", 7),
        num("azul", 8),
        num("azul", 9),
      ],
    });

    // Bajo acumulador, una carta normal es ilegal...
    const malo = jugar(est, "a", v1.id);
    expect(malo.ok).toBe(false);
    if (!malo.ok) expect(malo.error.codigo).toBe("JUGADA_ILEGAL");
    // ...y robar voluntario también.
    const noRobar = robar(est, "a", crearGeneradorSemilla(1));
    expect(noRobar.ok).toBe(false);

    // Apilar +4 sobre +2 (cross-stacking) fija el color del último +.
    const e1 = exito(jugar(est, "a", m4.id, "azul"));
    expect(e1.acumuladoPendiente).toBe(6);
    expect(e1.colorActivo).toBe("azul");
    expect(jugadorEnTurno(e1)).toBe("b");

    // Apilar +2 sobre +4.
    const e2 = exito(jugar(e1, "b", m2.id));
    expect(e2.acumuladoPendiente).toBe(8);
    expect(jugadorEnTurno(e2)).toBe("c");

    // c no puede apilar: roba el total y pierde el turno.
    const e3 = exito(resolverAcumulado(e2, "c", crearGeneradorSemilla(1)));
    expect(e3.acumuladoPendiente).toBe(0);
    expect(e3.manos["c"]).toHaveLength(10); // 2 + 8 robadas
    expect(jugadorEnTurno(e3)).toBe("a"); // sigue la dirección actual
  });

  it("resolverAcumulado sin acumulador es ilegal", () => {
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [num("rojo", 1)], b: [num("rojo", 2)] },
      descarte: [num("rojo", 5)],
      colorActivo: "rojo",
    });
    const r = resolverAcumulado(est, "a", crearGeneradorSemilla(1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe("NADA_QUE_RESOLVER");
  });
});
