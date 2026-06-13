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

  describe("montaje de mi mano (baseline y cascada de solape)", () => {
    const mano = [
      carta("corazones", 3),
      carta("picas", 7),
      carta("treboles", 10),
      carta("diamantes", 12),
      carta("corazones", 5),
    ];
    const vista = crearVista({ tuJugadorId: "j1", tuMano: mano });

    /** Poses de mi mano en el orden de `tuMano` (el Map conserva inserción). */
    function posesMano(seleccion: ReadonlySet<string> = new Set()) {
      const objetivos = calcularDisposicion(vista, seleccion);
      return mano.map((c) => {
        const objetivo = objetivos.get(`carta:${c.id}`);
        if (objetivo === undefined) throw new Error(`falta carta:${c.id}`);
        return objetivo.pose;
      });
    }

    it("baseline único: sin selección, todas a la misma altura (mismo Y)", () => {
      const ys = posesMano().map((p) => p.y);
      expect(new Set(ys).size).toBe(1);
    });

    it("cascada por índice: Z estrictamente creciente de izquierda a derecha", () => {
      const zs = posesMano().map((p) => p.z);
      for (let i = 1; i < zs.length; i++) {
        expect(zs[i]!).toBeGreaterThan(zs[i - 1]!);
      }
    });

    it("espaciado constante: X creciente con diferencia uniforme entre vecinas", () => {
      const xs = posesMano().map((p) => p.x);
      const paso = xs[1]! - xs[0]!;
      expect(paso).toBeGreaterThan(0);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]! - xs[i - 1]!).toBeCloseTo(paso);
      }
    });

    it("la carta seleccionada sobresale; las demás siguen en el baseline", () => {
      const idSel = mano[2]!.id;
      const poses = posesMano(new Set([idSel]));
      const baseline = poses[0]!.y;
      expect(poses[2]!.y).toBeGreaterThan(baseline);
      poses.forEach((p, i) => {
        if (i !== 2) expect(p.y).toBeCloseTo(baseline);
      });
    });
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
