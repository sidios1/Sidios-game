// @vitest-environment jsdom
// El HUD de Rumble solo REPRESENTA el slice `rumble` y emite intenciones: nunca
// decide el resultado de una habilidad ni infiere información oculta. Los tests
// fijan sobre todo la costura de visibilidad §6.8 (lo que NO se debe pintar) y que
// ningún botón quede inerte.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { crearVistaRumble, habilidadVista, carta } from "../../pruebas/fabricas.js";
import type { IntencionRumble } from "./hudRumble.js";
import { HudRumble } from "./hudRumble.js";

let raiz: HTMLElement;
let hud: HudRumble;
let enviadas: IntencionRumble[];

function montar(): void {
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  enviadas = [];
  hud = new HudRumble(raiz, { alIntencion: (i) => enviadas.push(i) });
}

beforeEach(montar);
afterEach(() => {
  hud.destruir();
  raiz.remove();
});

describe("HudRumble — barra de habilidades", () => {
  it("muestra nombre, cargas y ventana de cada habilidad propia", () => {
    hud.actualizar(
      crearVistaRumble({}, { misHabilidades: [habilidadVista("SAPO", { cargasRestantes: 2 })] }),
    );
    const tarjeta = raiz.querySelector(".rumble-hab");
    expect(tarjeta).not.toBeNull();
    expect(tarjeta?.querySelector(".rumble-hab-nombre")?.textContent).toBe("SAPO");
    expect(tarjeta?.querySelector(".rumble-hab-cargas")?.textContent).toBe("×2");
  });

  it("muestra 'pasiva' cuando cargasRestantes es null", () => {
    hud.actualizar(
      crearVistaRumble({}, { misHabilidades: [habilidadVista("RADAR", { cargasRestantes: null })] }),
    );
    expect(raiz.querySelector(".rumble-hab-cargas")?.textContent).toBe("pasiva");
  });

  it("deshabilita el botón sin cargas o fuera de ventana", () => {
    hud.actualizar(
      crearVistaRumble(
        {},
        {
          misHabilidades: [
            habilidadVista("SAPO", { cargasRestantes: 0 }),
            habilidadVista("CHATO", { ventanaVigente: false }),
            habilidadVista("AUGURIO", { cargasRestantes: 3 }),
          ],
        },
      ),
    );
    const botones = [...raiz.querySelectorAll<HTMLButtonElement>(".rumble-hab-boton")];
    expect(botones.map((b) => b.disabled)).toEqual([true, true, false]);
  });

  it("no pinta botón para pasivas ni para las que el motor aún no aplica", () => {
    // RADAR/DOBLE son pasivas; TOCO y EXODIA no están cableadas al motor (S2).
    // Sin UI inerte: no hay botón, hay nota.
    for (const id of ["RADAR", "DOBLE", "TOCO", "EXODIA"] as const) {
      hud.actualizar(crearVistaRumble({}, { misHabilidades: [habilidadVista(id)] }));
      expect(raiz.querySelector(".rumble-hab-boton")).toBeNull();
      expect(raiz.querySelector(".rumble-hab-nota")).not.toBeNull();
    }
  });

  it("una habilidad sin targeting emite su intención directo al motor", () => {
    hud.actualizar(crearVistaRumble({}, { misHabilidades: [habilidadVista("AUGURIO")] }));
    raiz.querySelector<HTMLButtonElement>(".rumble-hab-boton")?.click();
    expect(enviadas).toEqual([{ tipo: "rumble/augurio" }]);
  });
});

describe("HudRumble — visibilidad §6.8", () => {
  it("en modo secreta no pinta habilidades ajenas (el campo no viaja)", () => {
    hud.actualizar(crearVistaRumble({}, { misHabilidades: [habilidadVista("SAPO")] }));
    expect(raiz.querySelector(".rumble-ajenas")).toBeNull();
  });

  it("en modo pública sí las pinta, sin repetir la propia", () => {
    hud.actualizar(
      crearVistaRumble(
        { tuJugadorId: "j1" },
        { habilidadesAjenas: { j1: ["SAPO"], j2: ["CHATO"] } },
      ),
    );
    const panel = raiz.querySelector(".rumble-ajenas");
    expect(panel).not.toBeNull();
    const filas = [...(panel?.querySelectorAll("li") ?? [])].map((li) => li.textContent);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toContain("CHATO");
    expect(filas[0]).not.toContain("SAPO");
  });

  it("DOBLE se anuncia SIEMPRE, aunque el modo sea secreta", () => {
    hud.actualizar(crearVistaRumble({ tuJugadorId: "j1" }, { doblePublico: ["j2"] }));
    // Sin habilidadesAjenas (secreta) pero con el anuncio de DOBLE presente.
    expect(raiz.querySelector(".rumble-ajenas")).toBeNull();
    expect(raiz.querySelector(".rumble-doble")?.textContent).toContain("Jugador j2");
  });
});

describe("HudRumble — overlays de revelación", () => {
  it("no pinta ningún overlay si la vista no trae los campos", () => {
    hud.actualizar(crearVistaRumble());
    for (const clase of [".rumble-radar", ".rumble-augurio", ".rumble-sapo", ".rumble-mish"]) {
      expect(raiz.querySelector(clase)).toBeNull();
    }
  });

  it("SAPO muestra solo las cartas que autorizó la vista", () => {
    hud.actualizar(
      crearVistaRumble(
        {},
        { sapo: { objetivoId: "j2", cartas: [carta("picas", 1), carta("corazones", 12)] } },
      ),
    );
    const chips = [...raiz.querySelectorAll(".rumble-carta-chip")].map((c) => c.textContent);
    expect(chips).toEqual(["A♠", "Q♥"]);
  });

  it("AUGURIO distingue mazo vacío de carta revelada", () => {
    hud.actualizar(crearVistaRumble({}, { augurio: null }));
    expect(raiz.querySelector(".rumble-augurio")?.textContent).toContain("vacío");
    hud.actualizar(crearVistaRumble({}, { augurio: carta("treboles", 7) }));
    expect(raiz.querySelector(".rumble-augurio")?.textContent).toContain("7♣");
  });

  it("MISH traduce la ubicación a texto legible", () => {
    hud.actualizar(
      crearVistaRumble(
        {},
        { mish: { descripcion: "Q de corazones", ubicacion: { donde: "mano", jugadorId: "j2" } } },
      ),
    );
    const texto = raiz.querySelector(".rumble-mish")?.textContent ?? "";
    expect(texto).toContain("Q de corazones");
    expect(texto).toContain("Jugador j2");
  });

  it("RADAR muestra un guion cuando la pinta mayoritaria es null", () => {
    hud.actualizar(crearVistaRumble({}, { radar: { j1: "picas", j2: null } }));
    const filas = [...raiz.querySelectorAll(".rumble-radar li")].map((li) => li.textContent);
    expect(filas[0]).toContain("♠");
    expect(filas[1]).toContain("—");
  });
});

describe("HudRumble — PILLO a ciegas", () => {
  it("ofrece tantos dorsos como cartas, y emite el índice elegido", async () => {
    hud.actualizar(
      crearVistaRumble({}, { pilloPendiente: { victimaId: "j2", numeroCartas: 4 } }),
    );
    raiz.querySelector<HTMLButtonElement>(".rumble-pillo button")?.click();

    const dorsos = [...raiz.querySelectorAll<HTMLButtonElement>(".rumble-dorso")];
    expect(dorsos).toHaveLength(4);
    // Los dorsos son indistinguibles: solo dicen su posición, nunca la carta.
    expect(dorsos.map((d) => d.textContent)).toEqual(["1", "2", "3", "4"]);

    dorsos[2]?.click();
    await Promise.resolve();
    expect(enviadas).toEqual([{ tipo: "rumble/pilloRobo", indice: 2 }]);
  });

  it("no emite nada si se cancela el selector", async () => {
    hud.actualizar(
      crearVistaRumble({}, { pilloPendiente: { victimaId: "j2", numeroCartas: 3 } }),
    );
    raiz.querySelector<HTMLButtonElement>(".rumble-pillo button")?.click();
    raiz.querySelector<HTMLButtonElement>(".rumble-selector-cancelar")?.click();
    await Promise.resolve();
    expect(enviadas).toEqual([]);
  });
});

describe("HudRumble — feed de eventos", () => {
  it("lista los eventos ordenados por turno", () => {
    hud.actualizar(
      crearVistaRumble(
        {},
        {
          eventos: [
            { id: "ev-2", tipo: "swap", texto: "segundo", turno: 5 },
            { id: "ev-1", tipo: "reset", texto: "primero", turno: 2 },
          ],
        },
      ),
    );
    const textos = [...raiz.querySelectorAll(".rumble-evento")].map((e) => e.textContent);
    expect(textos).toEqual(["primero", "segundo"]);
  });

  it("un evento ya visto no vuelve a salir como toast", () => {
    const evento = { id: "ev-1", tipo: "reset" as const, texto: "te resetearon", turno: 1 };
    hud.actualizar(crearVistaRumble({}, { eventos: [evento] }));
    const toast = raiz.querySelector<HTMLElement>(".rumble-toast");
    expect(toast?.style.display).toBe("block");

    // Ocultamos y reenviamos LA MISMA vista: el dedup por id evita repetirlo.
    toast?.style.setProperty("display", "none");
    hud.actualizar(crearVistaRumble({}, { eventos: [evento] }));
    expect(toast?.style.display).toBe("none");
  });

  it("un evento nuevo sí sale como toast", () => {
    hud.actualizar(
      crearVistaRumble({}, { eventos: [{ id: "ev-1", tipo: "reset", texto: "uno", turno: 1 }] }),
    );
    hud.actualizar(
      crearVistaRumble(
        {},
        {
          eventos: [
            { id: "ev-1", tipo: "reset", texto: "uno", turno: 1 },
            { id: "ev-2", tipo: "swap", texto: "dos", turno: 2 },
          ],
        },
      ),
    );
    expect(raiz.querySelector(".rumble-toast")?.textContent).toBe("dos");
  });
});
