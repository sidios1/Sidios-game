import { describe, expect, it } from "vitest";
import { guardarOcultarStaged, leerOcultarStaged } from "./preferencias.js";

/** Storage mínimo en memoria. */
function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => {
      datos.delete(k);
    },
    setItem: (k, v) => {
      datos.set(k, v);
    },
  };
}

describe("preferencias: ocultarStaged", () => {
  it("guarda y lee el valor", () => {
    const almacen = almacenFalso();
    guardarOcultarStaged(almacen, true);
    expect(leerOcultarStaged(almacen)).toBe(true);
    guardarOcultarStaged(almacen, false);
    expect(leerOcultarStaged(almacen)).toBe(false);
  });

  it("sin valor guardado devuelve false", () => {
    expect(leerOcultarStaged(almacenFalso())).toBe(false);
  });

  it("ante datos corruptos devuelve false", () => {
    const almacen = almacenFalso();
    almacen.setItem("juegos-pref-ocultar-staged", "{rotos");
    expect(leerOcultarStaged(almacen)).toBe(false);
  });
});
