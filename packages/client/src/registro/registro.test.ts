import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ENTRADAS, registro } from "./registro.js";

afterEach(() => {
  registro.limpiar();
  vi.restoreAllMocks();
});

describe("registro", () => {
  it("guarda entradas con nivel y mensaje", () => {
    registro.info("hola");
    registro.warn("ojo");
    registro.error("falla");
    const entradas = registro.entradas();
    expect(entradas.map((e) => [e.nivel, e.mensaje])).toEqual([
      ["info", "hola"],
      ["warn", "ojo"],
      ["error", "falla"],
    ]);
  });

  it("acota el buffer a MAX_ENTRADAS descartando las más viejas", () => {
    for (let i = 0; i < MAX_ENTRADAS + 50; i += 1) registro.info(`m${i}`);
    const entradas = registro.entradas();
    expect(entradas).toHaveLength(MAX_ENTRADAS);
    // La primera conservada es la #50 (las 50 más viejas se descartaron).
    expect(entradas[0]?.mensaje).toBe("m50");
    expect(entradas.at(-1)?.mensaje).toBe(`m${MAX_ENTRADAS + 49}`);
  });

  it("notifica a los suscriptores en cada alta y al limpiar", () => {
    const visto = vi.fn();
    const desuscribir = registro.suscribir(visto);
    registro.info("a");
    registro.error("b");
    registro.limpiar();
    expect(visto).toHaveBeenCalledTimes(3);
    expect(visto.mock.calls.at(-1)?.[0]).toEqual([]);
    desuscribir();
    registro.info("c");
    expect(visto).toHaveBeenCalledTimes(3); // ya no llega tras desuscribir
  });

  it("entradas() devuelve una copia inmutable (no afecta al buffer)", () => {
    registro.info("uno");
    const copia = registro.entradas() as unknown[];
    copia.push({ ts: 0, nivel: "info", mensaje: "intruso" });
    expect(registro.entradas()).toHaveLength(1);
  });
});
