import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { exito } from "./apoyoPruebas.js";
import { comprarSobre, forzarCompra } from "./economia.js";
import type { DecisionPendiente, EstadoMonopoly } from "./estado.js";
import { jugadorDe } from "./estado.js";
import { colaRng, dado, partidaDePrueba, sinMiClub } from "./pruebasComunes.js";
import { tirarDados } from "./turnos.js";

function conCompraPendiente(
  estado: EstadoMonopoly,
  jugadorId: string,
  celdaIndice: number,
): EstadoMonopoly {
  const pend: DecisionPendiente = {
    jugadorId,
    fueDoble: false,
    detalle: { tipo: "compraODeclina", celdaIndice },
  };
  return { ...estado, decisionPendiente: pend };
}

function comprarDirecto(estado: EstadoMonopoly, jugadorId: string, celdaIndice: number): EstadoMonopoly {
  return exito(comprarSobre(conCompraPendiente(estado, jugadorId, celdaIndice), jugadorId, crearGeneradorSemilla(1), "GK"));
}

function conPosicion(estado: EstadoMonopoly, jugadorId: string, posicion: number): EstadoMonopoly {
  return { ...estado, jugadores: estado.jugadores.map((j) => (j.id === jugadorId ? { ...j, posicion } : j)) };
}

describe("ventana de renegociación (§3)", () => {
  it("se abre con turnoDeCierre = turnoGlobal + cantidad de jugadores (una vuelta completa)", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = comprarDirecto(base, "j1", 3); // MLS $20M
    expect(comprado.ventanasAbiertas[3]?.turnoDeCierre).toBe(base.turnoGlobal + base.ordenJugadores.length);
  });

  it("forzar compra transfiere la carta y paga al titular despojado, NO al Palco del Club", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = conPosicion(comprarDirecto(base, "j1", 3), "j2", 3);
    const presupuestoJ1Antes = jugadorDe(comprado, "j1").presupuesto;

    const resultado = exito(forzarCompra(comprado, "j2"));

    expect(jugadorDe(resultado, "j2").presupuesto).toBe(1000 - 40); // 200% de 20
    expect(jugadorDe(resultado, "j1").presupuesto).toBe(presupuestoJ1Antes + 40);
    expect(jugadorDe(resultado, "j1").miClub).toHaveLength(0);
    expect(jugadorDe(resultado, "j2").miClub).toHaveLength(1);
    expect(resultado.palcoDelClub).toBe(0);
    expect(resultado.ventanasAbiertas[3]?.titularActualId).toBe("j2");
    expect(resultado.ventanasAbiertas[3]?.precioActual).toBe(40);
  });

  it("snipe compuesto: 2 renegociaciones seguidas cobran 4x el precio original, no 3x", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = comprarDirecto(base, "j1", 3);
    const turnoDeCierreOriginal = comprado.ventanasAbiertas[3]?.turnoDeCierre;

    const paso1 = exito(forzarCompra(conPosicion(comprado, "j2", 3), "j2"));
    expect(paso1.ventanasAbiertas[3]?.precioActual).toBe(40); // 20 * 2

    const paso2 = exito(forzarCompra(conPosicion(paso1, "j3", 3), "j3"));
    expect(paso2.ventanasAbiertas[3]?.precioActual).toBe(80); // 40 * 2, NO 20 * 3
    expect(jugadorDe(paso2, "j3").presupuesto).toBe(1000 - 80);
    expect(jugadorDe(paso2, "j3").miClub).toHaveLength(1);

    // La ventana sigue anclada al comprador original; turnoDeCierre NO se reinicia.
    expect(paso2.ventanasAbiertas[3]?.compradorOriginalId).toBe("j1");
    expect(paso2.ventanasAbiertas[3]?.turnoDeCierre).toBe(turnoDeCierreOriginal);
  });

  it("no aplica si no hay ninguna ventana abierta en la celda del jugador", () => {
    const base = sinMiClub(partidaDePrueba());
    const resultado = forzarCompra(base, "j1");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("SIN_VENTANA_ABIERTA");
  });

  it("el titular actual no puede forzarse a sí mismo", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = conPosicion(comprarDirecto(base, "j1", 3), "j1", 3);
    const resultado = forzarCompra(comprado, "j1");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("CELDA_NO_COMPRABLE");
  });

  it("sigue corriendo igual si el comprador cae en Descendido en el medio", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = comprarDirecto(base, "j1", 3);
    const turnoDeCierre = comprado.ventanasAbiertas[3]?.turnoDeCierre;

    const j1Descendido: EstadoMonopoly = {
      ...comprado,
      jugadores: comprado.jugadores.map((j) =>
        j.id === "j1" ? { ...j, enDescendido: true, turnosEnDescendido: 1 } : j,
      ),
    };
    // El estado de Descendido de j1 no altera la ventana: sigue con el mismo turnoDeCierre.
    expect(j1Descendido.ventanasAbiertas[3]?.turnoDeCierre).toBe(turnoDeCierre);

    const resultado = exito(forzarCompra(conPosicion(j1Descendido, "j2", 3), "j2"));
    expect(jugadorDe(resultado, "j2").miClub).toHaveLength(1);
    expect(resultado.ventanasAbiertas[3]?.titularActualId).toBe("j2");
  });

  it("cierre exacto: un turno antes de turnoDeCierre sigue abierta; en turnoDeCierre ya cerró", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = comprarDirecto(base, "j1", 3);
    const turnoDeCierre = comprado.ventanasAbiertas[3]?.turnoDeCierre ?? -1;

    const unAntes = conPosicion({ ...comprado, turnoGlobal: turnoDeCierre - 1 }, "j2", 3);
    const abiertaTodavia = exito(forzarCompra(unAntes, "j2"));
    expect(jugadorDe(abiertaTodavia, "j2").miClub).toHaveLength(1);

    const enElCierre = conPosicion({ ...comprado, turnoGlobal: turnoDeCierre }, "j2", 3);
    const yaCerrada = forzarCompra(enElCierre, "j2");
    expect(yaCerrada.ok).toBe(false);
    if (!yaCerrada.ok) expect(yaCerrada.error.codigo).toBe("VENTANA_CERRADA");
  });

  it("tras cerrarse, el próximo que cae ahí compra un sobre NUEVO: la celda se rehabilita", () => {
    const base = sinMiClub(partidaDePrueba());
    const comprado = comprarDirecto(base, "j1", 3);
    const turnoDeCierre = comprado.ventanasAbiertas[3]?.turnoDeCierre ?? -1;

    const listoParaAterrizar: EstadoMonopoly = {
      ...conPosicion(comprado, "j2", 0),
      numeroRonda: 2,
      turnoGlobal: turnoDeCierre,
      jugadorEnTurno: "j2",
    };
    const resultado = exito(tirarDados(listoParaAterrizar, "j2", colaRng([dado(1), dado(2)]))); // suma 3 -> celda 3
    expect(resultado.decisionPendiente?.detalle).toEqual({ tipo: "compraODeclina", celdaIndice: 3 });
    expect(resultado.ventanasAbiertas[3]).toBeUndefined();
  });
});
