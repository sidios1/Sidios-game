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

interface OpcionesFicha {
  readonly estado?: DefinicionJuego["estado"];
  readonly max?: number | null;
}

function definicion(
  id: string,
  nombre: string,
  opciones: OpcionesFicha = {},
): DefinicionJuego {
  return {
    id,
    nombre,
    descriptorCorto: `descripción de ${nombre}`,
    jugadores: { min: 2, max: opciones.max === undefined ? 4 : opciones.max },
    estado: opciones.estado ?? "jugable",
    portada: {
      tipo: "componente",
      componente: () => document.createElement("div"),
    },
    crear: juegoFalso,
  };
}

describe("PantallaHub", () => {
  it("renderiza una tarjeta por cada juego del catálogo", () => {
    const raiz = document.createElement("div");
    const catalogo = [definicion("a", "Uno"), definicion("b", "Dos")];
    const hub = new PantallaHub(raiz, catalogo, { alElegir: () => {} });
    hub.mostrar();
    const cartas = raiz.querySelectorAll("article.carta-juego");
    expect(cartas.length).toBe(2);
    expect(cartas[0]?.textContent).toContain("Uno");
    expect(cartas[1]?.textContent).toContain("Dos");
  });

  it("muestra 'Jugadores ilimitados' cuando no hay tope", () => {
    const raiz = document.createElement("div");
    const hub = new PantallaHub(raiz, [definicion("a", "Uno", { max: null })], {
      alElegir: () => {},
    });
    hub.mostrar();
    expect(raiz.querySelector(".carta-jugadores")?.textContent).toBe(
      "Jugadores ilimitados",
    );
  });

  it("muestra el rango '{min}–{max} jugadores' cuando hay tope", () => {
    const raiz = document.createElement("div");
    const hub = new PantallaHub(raiz, [definicion("a", "Uno", { max: 10 })], {
      alElegir: () => {},
    });
    hub.mostrar();
    expect(raiz.querySelector(".carta-jugadores")?.textContent).toBe("2–10 jugadores");
  });

  it("al pulsar 'Jugar' de un juego jugable avisa con su definición", () => {
    const raiz = document.createElement("div");
    const elegida = definicion("b", "Dos");
    let recibido: DefinicionJuego | null = null;
    const hub = new PantallaHub(raiz, [definicion("a", "Uno"), elegida], {
      alElegir: (def) => {
        recibido = def;
      },
    });
    hub.mostrar();
    raiz
      .querySelector<HTMLButtonElement>('[data-juego="b"] .carta-accion')
      ?.click();
    expect(recibido).toBe(elegida);
  });

  it("un juego en desarrollo muestra badge y su acción no es lanzable", () => {
    const raiz = document.createElement("div");
    let elegido = false;
    const hub = new PantallaHub(
      raiz,
      [definicion("m", "Mentiroso", { estado: "en_desarrollo" })],
      { alElegir: () => (elegido = true) },
    );
    hub.mostrar();
    const carta = raiz.querySelector('[data-juego="m"]');
    expect(carta?.querySelector(".badge-desarrollo")?.textContent).toBe(
      "En desarrollo",
    );
    const accion = carta?.querySelector<HTMLButtonElement>(".carta-accion");
    expect(accion?.disabled).toBe(true);
    accion?.click();
    expect(elegido).toBe(false);
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
