import { describe, expect, it } from "vitest";
import { easeOut, Interpolador } from "./interpolacion.js";

describe("Interpolador", () => {
  it("avanza con easing y termina llamando alTerminar", () => {
    const interpolador = new Interpolador();
    const valores: number[] = [];
    let terminado = false;
    interpolador.agregar({
      duracion: 1,
      easing: (t) => t,
      alAvanzar: (t) => valores.push(t),
      alTerminar: () => {
        terminado = true;
      },
    });
    interpolador.actualizar(0.5);
    expect(valores).toEqual([0.5]);
    expect(terminado).toBe(false);
    interpolador.actualizar(0.6);
    expect(valores[1]).toBe(1);
    expect(terminado).toBe(true);
    expect(interpolador.cantidadActiva).toBe(0);
  });

  it("respeta el retraso antes de empezar", () => {
    const interpolador = new Interpolador();
    const valores: number[] = [];
    interpolador.agregar({
      duracion: 1,
      retraso: 1,
      easing: (t) => t,
      alAvanzar: (t) => valores.push(t),
    });
    interpolador.actualizar(0.5);
    expect(valores).toEqual([]);
    interpolador.actualizar(1.0);
    expect(valores).toEqual([0.5]);
  });

  it("cancelar corta sin completar; terminar salta al final", () => {
    const interpolador = new Interpolador();
    const valoresA: number[] = [];
    const valoresB: number[] = [];
    const manejadorA = interpolador.agregar({
      duracion: 1,
      alAvanzar: (t) => valoresA.push(t),
    });
    const manejadorB = interpolador.agregar({
      duracion: 1,
      alAvanzar: (t) => valoresB.push(t),
    });
    manejadorA.cancelar();
    manejadorB.terminar();
    interpolador.actualizar(2);
    expect(valoresA).toEqual([]);
    expect(valoresB).toEqual([1]);
  });

  it("saltarTodo completa todos los tweens pendientes", () => {
    const interpolador = new Interpolador();
    let completados = 0;
    for (let i = 0; i < 3; i++) {
      interpolador.agregar({
        duracion: 5,
        retraso: i,
        alAvanzar: () => {},
        alTerminar: () => {
          completados += 1;
        },
      });
    }
    interpolador.saltarTodo();
    expect(completados).toBe(3);
    expect(interpolador.cantidadActiva).toBe(0);
  });

  it("easeOut empieza rápido y llega exacto a 1", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});
