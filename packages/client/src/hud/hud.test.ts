// @vitest-environment jsdom
// El HUD muestra la cuenta atrás del turno solo en modo +Turbo.

import { describe, expect, it } from "vitest";
import { contratoDeMano } from "@juegos/carioca-core";
import type { VistaPartida } from "@juegos/server/vista";
import { ESTADO_INICIAL } from "../estado/maquinaInteraccion.js";
import type { EstadoInteraccion } from "../estado/maquinaInteraccion.js";
import { Hud } from "./hud.js";

function jugador(id: string, nombre: string) {
  return {
    id,
    nombre,
    numeroCartas: 12,
    puntosAcumulados: 0,
    seBajo: false,
    conectado: true,
    estadoConexion: "conectado" as const,
    listoSiguienteMano: false,
  };
}

function vistaBase(turbo: boolean, turboMsRestantes: number | null): VistaPartida {
  const contrato = contratoDeMano(1);
  if (contrato === undefined) throw new Error("sin contrato de la mano 1");
  return {
    tuJugadorId: "j1",
    tuMano: [],
    anfitrionId: "j1",
    jugadores: [jugador("j1", "A"), jugador("j2", "B")],
    manoActual: 1,
    contrato,
    numeroMazo: 50,
    pozoTope: null,
    numeroPozo: 1,
    mesa: [],
    turno: { jugadorId: "j1", fase: "robar", numero: 1 },
    fase: "jugandoMano",
    turbo,
    turboMsRestantes,
    resumenMano: null,
    ganadoresIds: null,
  };
}

function estadoCon(vista: VistaPartida): EstadoInteraccion {
  return { ...ESTADO_INICIAL, modo: "robar", vista };
}

describe("Hud: reloj de +Turbo", () => {
  it("muestra la cuenta atrás del turno cuando la sala está en turbo", () => {
    const raiz = document.createElement("div");
    const hud = new Hud(raiz, () => {});
    hud.actualizar(estadoCon(vistaBase(true, 15_000)));
    const reloj = raiz.querySelector(".reloj-turbo");
    expect(reloj).not.toBeNull();
    expect(reloj?.textContent).toMatch(/^\d+s$/);
    hud.destruir();
  });

  it("no muestra reloj en una partida normal (sin turbo)", () => {
    const raiz = document.createElement("div");
    const hud = new Hud(raiz, () => {});
    hud.actualizar(estadoCon(vistaBase(false, null)));
    expect(raiz.querySelector(".reloj-turbo")).toBeNull();
    hud.destruir();
  });
});
