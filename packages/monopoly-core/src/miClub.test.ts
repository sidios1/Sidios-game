import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { agregarCarta, buscarCarta, elegirCartaAleatoria, quitarCarta, type CartaMiClub } from "./miClub.js";

function cartaTecnico(id: string): CartaMiClub {
  return { tipo: "tecnico", id, tecnico: { id: `t-${id}`, nombre: "N", apellido: "A" } };
}

describe("miClub", () => {
  it("agrega y busca cartas por id", () => {
    const inv = agregarCarta([], cartaTecnico("c1"));
    expect(buscarCarta(inv, "c1")).toBeDefined();
    expect(buscarCarta(inv, "c2")).toBeUndefined();
  });

  it("quita cartas por id sin afectar las demás", () => {
    const inv = [cartaTecnico("c1"), cartaTecnico("c2")];
    const sinC1 = quitarCarta(inv, "c1");
    expect(sinC1).toHaveLength(1);
    expect(buscarCarta(sinC1, "c1")).toBeUndefined();
    expect(buscarCarta(sinC1, "c2")).toBeDefined();
  });

  it("elegirCartaAleatoria devuelve undefined si el inventario está vacío", () => {
    const rng = crearGeneradorSemilla(1);
    expect(elegirCartaAleatoria([], rng)).toBeUndefined();
  });

  it("elegirCartaAleatoria elige una carta que existe en el inventario", () => {
    const inv = [cartaTecnico("c1"), cartaTecnico("c2"), cartaTecnico("c3")];
    const rng = crearGeneradorSemilla(42);
    const elegida = elegirCartaAleatoria(inv, rng);
    expect(elegida).toBeDefined();
    expect(inv.map((c) => c.id)).toContain(elegida?.id);
  });

  it("las operaciones son inmutables (no mutan el arreglo de entrada)", () => {
    const inv: readonly CartaMiClub[] = [cartaTecnico("c1")];
    agregarCarta(inv, cartaTecnico("c2"));
    expect(inv).toHaveLength(1);
    quitarCarta(inv, "c1");
    expect(inv).toHaveLength(1);
  });
});
