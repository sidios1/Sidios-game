// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { VistaMentiroso } from "@juegos/server/vistaJuego";
import type { MensajeCliente } from "@juegos/server/protocolo";
import type { ContextoJuego } from "../../juego/ijuego.js";
import { JuegoMentiroso } from "./juegoMentiroso.js";

function contextoFalso(): { contexto: ContextoJuego; enviados: MensajeCliente[]; salidas: number } {
  const enviados: MensajeCliente[] = [];
  const estado = { salidas: 0 };
  const contexto: ContextoJuego = {
    contenedorEscena: document.createElement("div"),
    contenedorHud: document.createElement("div"),
    enviar: (mensaje) => enviados.push(mensaje),
    salirAlHub: () => {
      estado.salidas += 1;
    },
    reconectar: () => {},
  };
  return { contexto, enviados, get salidas() { return estado.salidas; } };
}

function vistaBase(parcial: Partial<VistaMentiroso> = {}): VistaMentiroso {
  return {
    juego: "mentiroso",
    tuJugadorId: "j1",
    tuMano: [
      { palo: "picas", id: "p1" },
      { palo: "corazones", id: "c1" },
    ],
    anfitrionId: "j1",
    jugadores: [
      { id: "j1", nombre: "Ana", numeroCartas: 2, conectado: true, estadoConexion: "conectado" },
      { id: "j2", nombre: "Ben", numeroCartas: 3, conectado: true, estadoConexion: "conectado" },
    ],
    paloRonda: "picas",
    numeroPila: 1,
    jugadorEnTurnoId: "j1",
    ultimaJugada: { jugadorId: "j2", cantidad: 1 },
    ultimaResolucion: null,
    ganadorId: null,
    ganadorPendienteId: null,
    ...parcial,
  };
}

describe("JuegoMentiroso (UI mínima)", () => {
  it("renderiza tu mano y, en tu turno, permite jugar la cantidad elegida", () => {
    const { contexto, enviados } = contextoFalso();
    const juego = new JuegoMentiroso();
    juego.iniciar(contexto);
    juego.sincronizarEstado(vistaBase());

    const hud = contexto.contenedorHud;
    expect(hud.querySelector(".mentiroso")).not.toBeNull();
    expect(hud.querySelectorAll(".mentiroso-mano .mentiroso-carta").length).toBe(2);

    // Elegir 2 cartas y jugar emite la acción con esa cantidad.
    const botonDos = [...hud.querySelectorAll<HTMLButtonElement>(".mentiroso-cant")].find(
      (b) => b.textContent === "2",
    );
    botonDos?.click();
    hud.querySelector<HTMLButtonElement>(".mentiroso-accion.jugar")?.click();
    expect(enviados).toContainEqual({ tipo: "jugar", cantidad: 2 });

    juego.finalizar();
    expect(hud.querySelector(".mentiroso")).toBeNull();
  });

  it("habilita acusar solo contra la jugada ajena y emite la acción", () => {
    const { contexto, enviados } = contextoFalso();
    const juego = new JuegoMentiroso();
    juego.iniciar(contexto);
    juego.sincronizarEstado(vistaBase());

    const acusar = contexto.contenedorHud.querySelector<HTMLButtonElement>(".mentiroso-accion.acusar");
    expect(acusar?.disabled).toBe(false);
    acusar?.click();
    expect(enviados).toContainEqual({ tipo: "acusar" });

    juego.finalizar();
  });

  it("no permite acusar la propia jugada", () => {
    const { contexto } = contextoFalso();
    const juego = new JuegoMentiroso();
    juego.iniciar(contexto);
    juego.sincronizarEstado(vistaBase({ ultimaJugada: { jugadorId: "j1", cantidad: 1 } }));

    const acusar = contexto.contenedorHud.querySelector<HTMLButtonElement>(".mentiroso-accion.acusar");
    expect(acusar?.disabled).toBe(true);
    juego.finalizar();
  });

  it("al terminar muestra el ganador y el botón vuelve al hub", () => {
    const ctx = contextoFalso();
    const juego = new JuegoMentiroso();
    juego.iniciar(ctx.contexto);
    juego.sincronizarEstado(vistaBase({ ganadorId: "j1", jugadorEnTurnoId: null }));

    const fin = ctx.contexto.contenedorHud.querySelector(".mentiroso-fin");
    expect(fin?.textContent).toContain("Ana");
    fin?.querySelector<HTMLButtonElement>("button")?.click();
    expect(ctx.salidas).toBe(1);
    juego.finalizar();
  });
});
