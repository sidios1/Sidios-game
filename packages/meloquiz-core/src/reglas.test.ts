// Las constantes del núcleo deben coincidir con REGLAS_MELOQUIZ.md.
// Si el reglamento cambia, se edita el doc primero y este test lo delata.

import { describe, expect, it } from "vitest";
import { REGLAS_MELOQUIZ } from "./reglas.js";
import { validarPool } from "./catalogo.js";
import type { PoolPartida } from "./catalogo.js";
import { poolDePrueba } from "./apoyoPruebas.js";

describe("REGLAS_MELOQUIZ como datos", () => {
  it("duraciones de fase (§4)", () => {
    expect(REGLAS_MELOQUIZ.duraciones).toEqual({
      precarga: 15_000,
      clip: 10_000,
      voto: 10_000,
      revelar: 5_000,
      puntaje: 5_000,
    });
  });

  it("4 opciones por ronda: correcta + 3 distractores (§5)", () => {
    expect(REGLAS_MELOQUIZ.opcionesPorRonda).toBe(4);
  });

  it("puntaje PLANO: 1 punto por acierto, sin bonus (§5)", () => {
    expect(REGLAS_MELOQUIZ.puntosPorAcierto).toBe(1);
  });

  it("mínimo de 4 canciones para iniciar (§2)", () => {
    expect(REGLAS_MELOQUIZ.minimoCanciones).toBe(4);
  });

  it("jugadores 2–8 y desempate compartido (§6)", () => {
    expect(REGLAS_MELOQUIZ.jugadores).toEqual({ min: 2, max: 8 });
    expect(REGLAS_MELOQUIZ.empateCompartido).toBe(true);
  });

  it("modo entrenamiento: exactamente 1 jugador (§6)", () => {
    expect(REGLAS_MELOQUIZ.jugadoresEntrenamiento).toEqual({ min: 1, max: 1 });
  });
});

describe("validarPool (§2)", () => {
  it("acepta un pool con el mínimo de canciones", () => {
    expect(validarPool(poolDePrueba(4)).ok).toBe(true);
  });

  it("rechaza un pool con menos del mínimo", () => {
    const r = validarPool(poolDePrueba(3));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe("POOL_INVALIDO");
  });

  it("rechaza ids duplicados", () => {
    const base = poolDePrueba(4).canciones;
    const primera = base[0];
    if (primera === undefined) return;
    const pool: PoolPartida = { canciones: [...base, { ...primera }] };
    const r = validarPool(pool);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.mensaje).toContain("duplicados");
  });

  it("rechaza un título vacío", () => {
    const base = [...poolDePrueba(4).canciones];
    const primera = base[0];
    if (primera === undefined) return;
    base[0] = { ...primera, titulo: "" };
    const r = validarPool({ canciones: base });
    expect(r.ok).toBe(false);
  });

  it("rechaza un segundo de inicio negativo", () => {
    const base = [...poolDePrueba(4).canciones];
    const primera = base[0];
    if (primera === undefined) return;
    base[0] = { ...primera, segundoInicio: -1 };
    const r = validarPool({ canciones: base });
    expect(r.ok).toBe(false);
  });
});
