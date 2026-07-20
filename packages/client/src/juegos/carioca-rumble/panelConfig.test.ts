// @vitest-environment jsdom
// Panel de config de Rumble (Sesión 3): valida contra @juegos/rumble-core (no
// duplica reglas), edita config inmutable y bloquea "Iniciar" ante config
// infactible. En modo solo-lectura (no anfitrión) todos los controles quedan disabled.

import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULT } from "@juegos/rumble-core";
import { PanelConfigRumble } from "./panelConfig.js";

describe("PanelConfigRumble", () => {
  it("arranca en CONFIG_DEFAULT y no bloquea el inicio con defaults", () => {
    const panel = new PanelConfigRumble(() => {});
    expect(panel.valorActual()).toEqual(CONFIG_DEFAULT);
    expect(panel.bloqueoInicio(2)).toBeNull();
    expect(panel.bloqueoInicio(4)).toBeNull();
  });

  it("bloquea el inicio si 'únicas por ronda' es infactible (§6.6)", () => {
    const panel = new PanelConfigRumble(() => {});
    // hpj=2 cabe en el pool (3), pero sin reemplazo 3 jugadores × 2 = 6 > 3.
    panel.fijarValor({
      ...CONFIG_DEFAULT,
      habilidadesPorJugador: 2,
      colision: "unicasPorRonda",
      poolActivo: ["MISH", "SAPO", "RADAR"],
    });
    const motivo = panel.bloqueoInicio(3);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("únicas por ronda");
  });

  it("ignora un blob de config malformado (no rompe)", () => {
    const panel = new PanelConfigRumble(() => {});
    panel.fijarValor({ habilidadesPorJugador: "muchas" });
    expect(panel.valorActual()).toEqual(CONFIG_DEFAULT);
  });

  it("editar un control emite la config nueva (anfitrión)", () => {
    let ultima: Record<string, unknown> | null = null;
    const panel = new PanelConfigRumble((v) => {
      ultima = v;
    });
    const nodo = panel.render(true, 2);
    const select = nodo.querySelector("select");
    if (select === null) throw new Error("no hay ningún select en el panel");
    // El primer select es "habilidades por jugador" (1..3): elegir 3.
    select.value = "3";
    select.dispatchEvent(new Event("change"));
    expect(ultima).not.toBeNull();
    expect(ultima?.["habilidadesPorJugador"]).toBe(3);
    expect(panel.valorActual()["habilidadesPorJugador"]).toBe(3);
  });

  it("en solo-lectura (no anfitrión) todos los controles están deshabilitados", () => {
    const panel = new PanelConfigRumble(() => {});
    const nodo = panel.render(false, 2);
    const controles = nodo.querySelectorAll("select, input");
    expect(controles.length).toBeGreaterThan(0);
    for (const c of controles) {
      // `.disabled = true` refleja el atributo content en jsdom (bool reflejado).
      expect(c.hasAttribute("disabled")).toBe(true);
    }
  });
});
