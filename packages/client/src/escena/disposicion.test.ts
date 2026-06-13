// Layout de la mesa: las manos ajenas NO se dibujan (cada rival va por su perfil
// fuera del fieltro) y los asientos de los rivales caen en un anillo justo fuera
// del borde, que crece con el número de jugadores.

import { describe, expect, it } from "vitest";
import { carta, crearVista, jugadorVista } from "../pruebas/fabricas.js";
import { radioMesa } from "./dimensionesMesa.js";
import { calcularDisposicion, poseManoJugador } from "./disposicion.js";

function vistaConJugadores(n: number) {
  const jugadores = Array.from({ length: n }, (_, i) => jugadorVista(`j${i + 1}`));
  return crearVista({ tuJugadorId: "j1", jugadores });
}

describe("calcularDisposicion", () => {
  it("no dibuja las manos ajenas en la mesa (sin claves dorso:<jugadorId>)", () => {
    const vista = vistaConJugadores(4);
    const objetivos = calcularDisposicion(vista, new Set());
    const clavesDorsoAjeno = [...objetivos.keys()].filter(
      (k) => k.startsWith("dorso:") && !k.startsWith("dorso:mazo:") && !k.startsWith("dorso:pozo:"),
    );
    expect(clavesDorsoAjeno).toEqual([]);
  });

  it("las combinaciones bajadas siguen siendo clickeables para pegar", () => {
    const vista = crearVista({
      mesa: [
        {
          duenoId: "j2",
          combinacion: {
            tipo: "trio",
            cartas: [carta("corazones", 5), carta("picas", 5), carta("treboles", 5)],
          },
        },
      ],
    });
    const objetivos = calcularDisposicion(vista, new Set());
    const enMesa = [...objetivos.values()].filter(
      (o) => o.interaccion.tipo === "combinacion",
    );
    expect(enMesa).toHaveLength(3);
  });
});

describe("poseManoJugador", () => {
  it("ubica a los rivales en un anillo FUERA del borde del fieltro", () => {
    for (const n of [2, 4, 8]) {
      const vista = vistaConJugadores(n);
      for (const jugador of vista.jugadores) {
        if (jugador.id === vista.tuJugadorId) continue;
        const pose = poseManoJugador(vista, jugador.id);
        const distancia = Math.hypot(pose.x, pose.z);
        expect(distancia).toBeGreaterThan(radioMesa(n));
      }
    }
  });

  it("a mí me coloca al frente, junto a la cámara (z positivo)", () => {
    const vista = vistaConJugadores(4);
    const pose = poseManoJugador(vista, "j1");
    expect(pose.z).toBeGreaterThan(0);
  });

  it("con 2 jugadores, el rival queda enfrente (z negativo)", () => {
    const vista = vistaConJugadores(2);
    const pose = poseManoJugador(vista, "j2");
    expect(pose.z).toBeLessThan(0);
    expect(pose.x).toBeCloseTo(0);
  });
});
