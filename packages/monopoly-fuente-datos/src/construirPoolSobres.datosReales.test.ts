// Integración contra los datasets REALES de datos/ (no fixtures) — confirma
// que construirPoolSobres() alimenta correctamente la lógica de sorteo YA
// TESTEADA de monopoly-core (muestreo.ts/reglas.ts), sin reimplementarla acá.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cortesPercentil,
  crearGeneradorSemilla,
  elegirJugadorParaSobre,
  elegirTecnicoParaSobre,
  LIGAS,
  REGLAS_MONOPOLY,
  tramosParaLiga,
  validarPoolSobres,
  type NombreLiga,
  type Tier,
} from "@juegos/monopoly-core";
import { beforeAll, describe, expect, it } from "vitest";

import { construirPoolSobres } from "./construirPoolSobres.js";
import type { ArchivoJugadores, ArchivoTecnicos, JugadorCrudo, TecnicoCrudo } from "./tiposCrudos.js";
import type { PoolSobres } from "@juegos/monopoly-core";

const RUTA_DATOS = fileURLToPath(new URL("../../../datos", import.meta.url));

async function leerJson<T>(archivo: string): Promise<T> {
  const contenido = await readFile(join(RUTA_DATOS, archivo), "utf-8");
  return JSON.parse(contenido) as T;
}

let pool: PoolSobres;

beforeAll(async () => {
  const [archivoJugadores, archivoTecnicos] = await Promise.all([
    leerJson<ArchivoJugadores>("jugadores_monopoly.json"),
    leerJson<ArchivoTecnicos>("tecnicos_monopoly.json"),
  ]);
  pool = construirPoolSobres(archivoJugadores.jugadores, archivoTecnicos.tecnicos);
});

describe("construirPoolSobres sobre datos/ reales", () => {
  it("produce un pool válido según validarPoolSobres de monopoly-core", () => {
    const resultado = validarPoolSobres(pool);
    expect(resultado.ok).toBe(true);
  });

  it("las 8 ligas del tablero tienen jugadores", () => {
    for (const liga of LIGAS) {
      expect(pool.porLiga[liga].length).toBeGreaterThan(0);
    }
  });

  it("la liga más chica (Arabia Saudita) no rompe cortesPercentil: tiers no vacíos", () => {
    const cortes = cortesPercentil(pool.porLiga["Arabia Saudita"], tramosParaLiga(false));
    expect(cortes.malo.length).toBeGreaterThan(0);
    expect(cortes.normal.length).toBeGreaterThan(0);
    expect(cortes.raro.length).toBeGreaterThan(0);
  });

  it("hay técnicos y Resto del Mundo no vacíos", () => {
    expect(pool.tecnicos.length).toBeGreaterThan(0);
    expect(pool.restoDelMundo.length).toBeGreaterThan(0);
  });

  it("los cortes de percentil son relativos a cada liga: el rango de rating del tier Raro difiere entre una liga chica y una grande", () => {
    const cortesChica = cortesPercentil(pool.porLiga["Arabia Saudita"], tramosParaLiga(false));
    const cortesGrande = cortesPercentil(pool.porLiga["Premier League"], tramosParaLiga(false));
    const minRaroChica = Math.min(...cortesChica.raro.map((j) => j.rating));
    const minRaroGrande = Math.min(...cortesGrande.raro.map((j) => j.rating));
    expect(minRaroChica).not.toBe(minRaroGrande);
  });

  // CM: posición con representación sólida en malo/normal/raro en TODAS las
  // ligas reales (verificado), así el nivel0 de la cascada (tier ∩ posición)
  // casi nunca cae a fallback — evita que el fallback (que ignora el tier)
  // contamine la medición de probabilidades. GK, en cambio, tiene 0 "malo" en
  // Arabia Saudita y sería una mala elección para este test.
  const POSICION_ROBUSTA = "CM";

  function frecuenciasPorTier(
    poolLiga: PoolSobres["porLiga"][NombreLiga],
    tramos: ReturnType<typeof tramosParaLiga>,
    semilla: number,
    n: number,
  ): Record<Tier, number> {
    const rng = crearGeneradorSemilla(semilla);
    const cortes = cortesPercentil(poolLiga, tramos);
    const frecuencias: Record<Tier, number> = { malo: 0, normal: 0, raro: 0 };
    for (let i = 0; i < n; i++) {
      // Deriva el tier REAL del jugador sorteado (por en qué corte de rating
      // cae), no el tier que internamente eligió la ruleta antes de la
      // cascada de fallback — así la muestra observada refleja lo que el
      // comprador realmente ve.
      const elegido = elegirJugadorParaSobre(poolLiga, tramos, POSICION_ROBUSTA, rng)!;
      if (cortes.malo.includes(elegido)) frecuencias.malo++;
      else if (cortes.raro.includes(elegido)) frecuencias.raro++;
      else frecuencias.normal++;
    }
    return frecuencias;
  }

  it("celda de liga normal: frecuencias observadas cerca de 25/50/25 (Premier League)", () => {
    const n = 6000;
    const frecuencias = frecuenciasPorTier(pool.porLiga["Premier League"], tramosParaLiga(false), 1, n);
    expect(frecuencias.malo / n).toBeCloseTo(0.25, 1);
    expect(frecuencias.normal / n).toBeCloseTo(0.5, 1);
    expect(frecuencias.raro / n).toBeCloseTo(0.25, 1);
  });

  it("celda más cara de liga: frecuencias observadas cerca de 5/50/45 (Premier League)", () => {
    const n = 6000;
    const frecuencias = frecuenciasPorTier(pool.porLiga["Premier League"], tramosParaLiga(true), 2, n);
    expect(frecuencias.malo / n).toBeCloseTo(0.05, 1);
    expect(frecuencias.normal / n).toBeCloseTo(0.5, 1);
    expect(frecuencias.raro / n).toBeCloseTo(0.45, 1);
  });

  it("Resto del Mundo: frecuencias observadas cerca de 40/20/40", () => {
    const n = 6000;
    const frecuencias = frecuenciasPorTier(pool.restoDelMundo, REGLAS_MONOPOLY.tiers.restoDelMundo, 3, n);
    expect(frecuencias.malo / n).toBeCloseTo(0.4, 1);
    expect(frecuencias.normal / n).toBeCloseTo(0.2, 1);
    expect(frecuencias.raro / n).toBeCloseTo(0.4, 1);
  });

  it("celda de liga normal en la liga más chica (Arabia Saudita) también da frecuencias cerca de 25/50/25", () => {
    const n = 6000;
    const frecuencias = frecuenciasPorTier(pool.porLiga["Arabia Saudita"], tramosParaLiga(false), 4, n);
    expect(frecuencias.malo / n).toBeCloseTo(0.25, 1);
    expect(frecuencias.normal / n).toBeCloseTo(0.5, 1);
    expect(frecuencias.raro / n).toBeCloseTo(0.25, 1);
  });

  it("elegirTecnicoParaSobre no falla sobre el pool real de técnicos", () => {
    const rng = crearGeneradorSemilla(5);
    const tecnico = elegirTecnicoParaSobre(pool.tecnicos, rng);
    expect(tecnico).toBeDefined();
  });
});
