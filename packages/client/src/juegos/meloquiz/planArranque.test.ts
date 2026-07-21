// Tabla de casos del plan de arranque: la pieza que convierte la sync de reloj
// en reproducción que SE SIENTE simultánea. La invariante central: dos clientes
// con offsets distintos derivan el MISMO instante físico de arranque.

import { describe, expect, it } from "vitest";
import { MARGEN_ARRANQUE_MS } from "@juegos/server/sincroniaReloj";
import { planificarArranque } from "./planArranque.js";

const T = 1_700_000_000_000; // faseInicioMs estampado por el host
const CLIP_MS = 10_000;

function plan(sobrescribe: Partial<Parameters<typeof planificarArranque>[0]>) {
  return planificarArranque({
    faseInicioMs: T,
    segundoInicio: 45,
    duracionFaseMs: CLIP_MS,
    offsetMs: 0,
    ahoraMs: T,
    ...sobrescribe,
  });
}

describe("planificarArranque", () => {
  it("offset 0 y llegada instantánea (modo entrenamiento): programa el margen completo", () => {
    // Un jugador solo, sin muestras de sync: offset 0 por contrato del RelojHost.
    expect(plan({})).toEqual({
      tipo: "programar",
      esperaMs: MARGEN_ARRANQUE_MS,
      desdeSegundo: 45,
    });
  });

  it("la difusión tardó en volar: espera el margen MENOS el vuelo", () => {
    expect(plan({ ahoraMs: T + 200 })).toEqual({
      tipo: "programar",
      esperaMs: MARGEN_ARRANQUE_MS - 200,
      desdeSegundo: 45,
    });
  });

  it("dos clientes con offsets opuestos derivan el MISMO instante físico", () => {
    // El host va 3 s por delante del cliente A (offsetMs = +3000): el instante
    // físico "T de host" es T-3000 en el reloj de A. Si a A la vista le llegó
    // 200 ms después de ese instante físico, su espera debe ser margen - 200,
    // exactamente igual que la del cliente con offset 0 de la fila anterior.
    const a = plan({ offsetMs: 3_000, ahoraMs: T - 3_000 + 200 });
    expect(a).toEqual({
      tipo: "programar",
      esperaMs: MARGEN_ARRANQUE_MS - 200,
      desdeSegundo: 45,
    });

    // Y el cliente B con el host 3 s POR DETRÁS (offsetMs = -3000), mismo vuelo.
    const b = plan({ offsetMs: -3_000, ahoraMs: T + 3_000 + 200 });
    expect(b).toEqual(a);
  });

  it("llegada tardía (reconexión a mitad de clip): suena YA con seek adelante", () => {
    // 2 500 ms después del start_at compartido: el resto va 2 s adentro del clip
    // (el margen consumió los primeros 500 ms).
    const p = plan({ ahoraMs: T + MARGEN_ARRANQUE_MS + 2_000 });
    expect(p).toEqual({ tipo: "yaMismo", desdeSegundo: 47 });
  });

  it("con la fase de clip ya vencida no suena nada (vista vieja)", () => {
    expect(plan({ ahoraMs: T + CLIP_MS })).toEqual({ tipo: "omitir" });
    expect(plan({ ahoraMs: T + CLIP_MS + 5_000 })).toEqual({ tipo: "omitir" });
  });

  it("sin duración de fase no hay límite: seek adelante aunque sea tarde", () => {
    const p = plan({ duracionFaseMs: null, ahoraMs: T + MARGEN_ARRANQUE_MS + 4_000 });
    expect(p).toEqual({ tipo: "yaMismo", desdeSegundo: 49 });
  });

  it("sin faseInicioMs cae al comportamiento de S3: sonar al entrar en la fase", () => {
    expect(plan({ faseInicioMs: null })).toEqual({ tipo: "yaMismo", desdeSegundo: 45 });
  });

  it("sin segundoInicio arranca del principio del archivo", () => {
    expect(plan({ segundoInicio: null })).toEqual({
      tipo: "programar",
      esperaMs: MARGEN_ARRANQUE_MS,
      desdeSegundo: 0,
    });
  });

  it("el borde exacto (espera 0) suena ya, sin timer de 0 ms", () => {
    expect(plan({ ahoraMs: T + MARGEN_ARRANQUE_MS })).toEqual({
      tipo: "yaMismo",
      desdeSegundo: 45,
    });
  });
});
