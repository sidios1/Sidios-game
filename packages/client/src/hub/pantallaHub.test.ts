// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { DefinicionJuego, IJuego } from "../juego/ijuego.js";
import { PantallaHub } from "./pantallaHub.js";

function juegoFalso(): IJuego {
  return {
    iniciar: () => {},
    sincronizarEstado: () => {},
    procesarAccion: () => {},
    finalizar: () => {},
  };
}

function definicion(id: string, nombre: string): DefinicionJuego {
  return {
    id,
    nombre,
    descripcion: `descripción de ${nombre}`,
    minJugadores: 2,
    maxJugadores: 4,
    crear: juegoFalso,
  };
}

describe("PantallaHub", () => {
  it("renderiza un botón por cada juego del catálogo", () => {
    const raiz = document.createElement("div");
    const catalogo = [definicion("a", "Uno"), definicion("b", "Dos")];
    const hub = new PantallaHub(raiz, catalogo, { alElegir: () => {} });
    hub.mostrar();
    const botones = raiz.querySelectorAll("button.juego");
    expect(botones.length).toBe(2);
    expect(botones[0]?.textContent).toContain("Uno");
    expect(botones[1]?.textContent).toContain("Dos");
  });

  it("al pulsar un juego avisa con su definición", () => {
    const raiz = document.createElement("div");
    const elegida = definicion("b", "Dos");
    let recibido: DefinicionJuego | null = null;
    const hub = new PantallaHub(raiz, [definicion("a", "Uno"), elegida], {
      alElegir: (def) => {
        recibido = def;
      },
    });
    hub.mostrar();
    raiz.querySelector<HTMLButtonElement>('button[data-juego="b"]')?.click();
    expect(recibido).toBe(elegida);
  });

  it("ocultar marca la pantalla como no visible", () => {
    const raiz = document.createElement("div");
    const hub = new PantallaHub(raiz, [definicion("a", "Uno")], {
      alElegir: () => {},
    });
    hub.mostrar();
    expect(hub.visible).toBe(true);
    hub.ocultar();
    expect(hub.visible).toBe(false);
  });
});
