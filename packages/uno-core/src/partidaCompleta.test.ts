import { describe, expect, it } from "vitest";
import type { Carta, JugadorUno } from "./index.js";
import { crearGeneradorSemilla } from "./aleatorio.js";
import {
  crearPartidaConMazo,
  jugar,
  jugadorEnTurno,
  puntajeRonda,
  resolverAcumulado,
  robar,
} from "./partida.js";
import { estadoDePrueba, exito, mazoDesde, num, simbolo } from "./apoyoPruebas.js";

function J(id: string): JugadorUno {
  return { id, nombre: id };
}

describe("ronda completa de principio a fin (solo el core)", () => {
  it("carta inicial +2, cadena de + resuelta por robo, y fin con puntaje", () => {
    // "a" apila sobre el +2 inicial y luego encadena Skips (con 2 jugadores el
    // Skip le devuelve el turno) hasta vaciar su mano. "b" no puede apilar y
    // resuelve el acumulador robando.
    const aStack = simbolo("rojo", "mas2");
    const skips: Carta[] = [
      simbolo("rojo", "skip"),
      simbolo("rojo", "skip"),
      simbolo("rojo", "skip"),
      simbolo("rojo", "skip"),
      simbolo("rojo", "skip"),
      simbolo("rojo", "skip"),
    ];
    const aHand: Carta[] = [aStack, ...skips];
    const bHand: Carta[] = [
      num("amarillo", 9),
      num("amarillo", 9),
      num("amarillo", 9),
      num("amarillo", 9),
      num("amarillo", 9),
      num("amarillo", 9),
      num("amarillo", 9),
    ];
    const robos: Carta[] = [
      num("amarillo", 0),
      num("amarillo", 0),
      num("amarillo", 0),
      num("amarillo", 0),
    ];

    const mazo = mazoDesde({ manos: [aHand, bHand], inicial: simbolo("rojo", "mas2"), robos });
    let e = exito(crearPartidaConMazo([J("a"), J("b")], mazo));

    // Carta inicial +2: el primero debe responder.
    expect(e.acumuladoPendiente).toBe(2);
    expect(jugadorEnTurno(e)).toBe("a");

    // a apila +2: la cadena sube a 4 y pasa a b.
    e = exito(jugar(e, "a", aStack.id));
    expect(e.acumuladoPendiente).toBe(4);
    expect(jugadorEnTurno(e)).toBe("b");

    // b no tiene "+": roba el acumulado y pierde el turno.
    e = exito(resolverAcumulado(e, "b", crearGeneradorSemilla(1)));
    expect(e.acumuladoPendiente).toBe(0);
    expect(e.manos["b"]).toHaveLength(11); // 7 + 4 robadas
    expect(jugadorEnTurno(e)).toBe("a");

    // a encadena Skips (2 jugadores → conserva el turno) hasta vaciar su mano.
    for (const sk of skips) {
      expect(e.fase).toBe("jugando");
      e = exito(jugar(e, "a", sk.id));
    }

    expect(e.fase).toBe("terminada");
    expect(e.ganadorId).toBe("a");

    const p = puntajeRonda(e);
    expect(p?.ganadorId).toBe("a");
    // b: 7 × amarillo-9 (63) + 4 × amarillo-0 (0) = 63.
    expect(p?.puntos).toBe(63);
  });

  it("agotamiento y rebarajado determinista por semilla", () => {
    const cima = num("rojo", 5);
    const enterrado: Carta[] = [num("verde", 1), num("verde", 2), num("verde", 3)];
    const est = estadoDePrueba({
      jugadores: [J("a"), J("b")],
      manos: { a: [num("azul", 9)], b: [num("amarillo", 1)] },
      mazo: [], // vacío → al robar se rebaraja el descarte (menos la cima)
      descarte: [...enterrado, cima],
      colorActivo: "rojo",
    });

    const e1 = exito(robar(est, "a", crearGeneradorSemilla(99)));
    const e2 = exito(robar(est, "a", crearGeneradorSemilla(99)));

    // Misma semilla → misma carta robada (determinista).
    expect(e1.manos["a"]?.map((c) => c.id)).toEqual(e2.manos["a"]?.map((c) => c.id));
    // La cima permanece en el descarte; el resto se rebarajó al mazo.
    expect(e1.descarte).toHaveLength(1);
    expect(e1.descarte[0]?.id).toBe(cima.id);
    expect(e1.manos["a"]).toHaveLength(2); // robó una carta
  });
});
