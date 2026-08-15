import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { exito } from "./apoyoPruebas.js";
import type { CartaPrensa } from "./cartasPrensa.js";
import { CARTAS_PRENSA_DEPORTIVA } from "./cartasPrensa.js";
import {
  aplicarCartaPrensa,
  elegirCambioAgente,
  elegirLigaDobleFichaje,
  elegirRoboPrensa,
} from "./cartasPrensaEfectos.js";
import { elegirPosicionSobre } from "./economia.js";
import { jugadorDe, type EstadoMonopoly } from "./estado.js";
import type { CartaMiClub } from "./miClub.js";
import { colaRng, dado, partidaDePrueba, sinMiClub } from "./pruebasComunes.js";
import { tirarDados } from "./turnos.js";

function carta(id: number): CartaPrensa {
  const c = CARTAS_PRENSA_DEPORTIVA.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no existe la carta ${id}`);
  return c;
}

function conJugador(
  estado: EstadoMonopoly,
  jugadorId: string,
  cambios: Partial<EstadoMonopoly["jugadores"][number]>,
): EstadoMonopoly {
  return { ...estado, jugadores: estado.jugadores.map((j) => (j.id === jugadorId ? { ...j, ...cambios } : j)) };
}

function cartaTecnico(id: string): CartaMiClub {
  return { tipo: "tecnico", id, tecnico: { id: `t-${id}`, nombre: "N", apellido: "A" } };
}

describe("cartasPrensaEfectos: efectos automáticos", () => {
  it("#1 Fichaje bomba: activa el próximo sobre a mitad de precio", () => {
    const { estado } = aplicarCartaPrensa(partidaDePrueba(), "j1", carta(1), false, crearGeneradorSemilla(1));
    expect(jugadorDe(estado, "j1").proximoSobreMitadPrecio).toBe(true);
  });

  it("#2/#6/#9/#15 recibirDinero: pagan el monto exacto de la carta", () => {
    const casos: ReadonlyArray<readonly [number, number]> = [
      [2, 50],
      [6, 25],
      [9, 35],
      [15, 60],
    ];
    for (const [id, monto] of casos) {
      const { estado } = aplicarCartaPrensa(partidaDePrueba(), "j1", carta(id), false, crearGeneradorSemilla(1));
      expect(jugadorDe(estado, "j1").presupuesto).toBe(1000 + monto);
    }
  });

  it("#3 Escándalo de vestuario: suma un turno a perder", () => {
    const { estado } = aplicarCartaPrensa(partidaDePrueba(), "j1", carta(3), false, crearGeneradorSemilla(1));
    expect(jugadorDe(estado, "j1").turnosAPerder).toBe(1);
  });

  it("#4 Lesión: pierde un jugador aleatorio de Mi Club (no-op si está vacío)", () => {
    const conCarta = conJugador(partidaDePrueba(), "j1", { miClub: [cartaTecnico("c1")] });
    const { estado } = aplicarCartaPrensa(conCarta, "j1", carta(4), false, crearGeneradorSemilla(1));
    expect(jugadorDe(estado, "j1").miClub).toHaveLength(0);

    const { estado: sinCambio } = aplicarCartaPrensa(sinMiClub(partidaDePrueba()), "j1", carta(4), false, crearGeneradorSemilla(1));
    expect(jugadorDe(sinCambio, "j1").miClub).toHaveLength(0);
  });

  it("#5 Descendiste: manda a Descendido", () => {
    const { estado } = aplicarCartaPrensa(partidaDePrueba(), "j1", carta(5), false, crearGeneradorSemilla(1));
    expect(jugadorDe(estado, "j1").enDescendido).toBe(true);
  });

  it("#7/#10/#14 pagarDinero: cobran y alimentan el Palco del Club", () => {
    const casos: ReadonlyArray<readonly [number, number]> = [
      [7, 40],
      [10, 30],
      [14, 20],
    ];
    for (const [id, monto] of casos) {
      const { estado } = aplicarCartaPrensa(partidaDePrueba(), "j1", carta(id), false, crearGeneradorSemilla(1));
      expect(jugadorDe(estado, "j1").presupuesto).toBe(1000 - monto);
      expect(estado.palcoDelClub).toBe(monto);
    }
  });

  it("#11 Portada de revista: avanza a Salida y cobra el bono (aterrizaje real)", () => {
    const base = partidaDePrueba();
    const conCarta: EstadoMonopoly = {
      ...conJugador(base, "j1", { posicion: 4 }),
      mazoPrensa: [carta(11), ...base.mazoPrensa.filter((c) => c.id !== 11)],
    };
    const resultado = exito(tirarDados(conCarta, "j1", colaRng([dado(1), dado(2)]))); // 4 -> 7 (Prensa)
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.posicion).toBe(0);
    expect(j1.presupuesto).toBe(1000 + 100);
  });

  it("#12 Suspensión mediática: retrocede 3 SIN bono, encadenando el efecto de la celda destino", () => {
    const base = partidaDePrueba();
    const conCarta: EstadoMonopoly = {
      ...conJugador(base, "j1", { posicion: 4 }),
      mazoPrensa: [carta(12), ...base.mazoPrensa.filter((c) => c.id !== 12)],
    };
    // 4 -> 7 (Prensa, roba #12) -> retrocede 3 -> 4 (Multa por Doping, se encadena)
    const resultado = exito(tirarDados(conCarta, "j1", colaRng([dado(1), dado(2)])));
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.posicion).toBe(4);
    expect(j1.presupuesto).toBe(1000 - 100);
    expect(resultado.palcoDelClub).toBe(100);
  });
});

describe("#8 Fichaje sorpresa: robar un jugador rival", () => {
  it("no-op si ningún rival tiene cartas en Mi Club", () => {
    const { estado, movimiento } = aplicarCartaPrensa(
      sinMiClub(partidaDePrueba()),
      "j1",
      carta(8),
      false,
      crearGeneradorSemilla(1),
    );
    expect(movimiento).toBeNull();
    expect(estado.decisionPendiente).toBeNull();
  });

  it("deja elegir a quién robarle si algún rival tiene cartas", () => {
    const base = conJugador(sinMiClub(partidaDePrueba()), "j2", { miClub: [cartaTecnico("c1")] });
    const { estado } = aplicarCartaPrensa(base, "j1", carta(8), false, crearGeneradorSemilla(1));
    expect(estado.decisionPendiente?.detalle.tipo).toBe("elegirRoboPrensa");
    expect(estado.decisionPendiente?.jugadorId).toBe("j1");

    const resultado = exito(elegirRoboPrensa(estado, "j1", "j2", "c1"));
    expect(jugadorDe(resultado, "j2").miClub).toHaveLength(0);
    expect(jugadorDe(resultado, "j1").miClub).toHaveLength(1);
    expect(resultado.decisionPendiente).toBeNull();
  });

  it("rechaza robar una carta que el rival no tiene", () => {
    const base = conJugador(partidaDePrueba(), "j2", { miClub: [cartaTecnico("c1")] });
    const { estado } = aplicarCartaPrensa(base, "j1", carta(8), false, crearGeneradorSemilla(1));
    const resultado = elegirRoboPrensa(estado, "j1", "j2", "no-existe");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("CARTA_DESCONOCIDA");
  });
});

describe("#13 Doble fichaje: 2 sobres al precio de uno, misma liga elegida", () => {
  it("cobra una sola vez (celda más barata de la liga) y entrega 2 sobres independientes", () => {
    const base = sinMiClub(partidaDePrueba());
    const { estado } = aplicarCartaPrensa(base, "j1", carta(13), false, crearGeneradorSemilla(1));
    expect(estado.decisionPendiente?.detalle.tipo).toBe("elegirLigaDobleFichaje");

    const conLiga = exito(elegirLigaDobleFichaje(estado, "j1", "MLS")); // celda más barata: $10M
    expect(jugadorDe(conLiga, "j1").presupuesto).toBe(1000 - 10);
    expect(conLiga.decisionPendiente?.detalle).toMatchObject({ tipo: "elegirPosicionSobre", sobresRestantes: 2 });

    const rng = crearGeneradorSemilla(5);
    const conPrimerSobre = exito(elegirPosicionSobre(conLiga, "j1", "GK", rng));
    expect(jugadorDe(conPrimerSobre, "j1").miClub).toHaveLength(1);
    expect(conPrimerSobre.decisionPendiente?.detalle).toMatchObject({ tipo: "elegirPosicionSobre", sobresRestantes: 1 });

    const conSegundoSobre = exito(elegirPosicionSobre(conPrimerSobre, "j1", "ST", rng));
    expect(jugadorDe(conSegundoSobre, "j1").miClub).toHaveLength(2);
    expect(conSegundoSobre.decisionPendiente).toBeNull();
    expect(Object.keys(conSegundoSobre.ventanasAbiertas)).toHaveLength(0); // nunca abre ventana
  });

  it("rechaza una liga inválida", () => {
    const base = partidaDePrueba();
    const { estado } = aplicarCartaPrensa(base, "j1", carta(13), false, crearGeneradorSemilla(1));
    const resultado = elegirLigaDobleFichaje(estado, "j1", "Liga Chilena");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("LIGA_INVALIDA");
  });
});

describe("#16 Cambio de agente", () => {
  it("no-op si Mi Club está vacío", () => {
    const { estado, movimiento } = aplicarCartaPrensa(
      sinMiClub(partidaDePrueba()),
      "j1",
      carta(16),
      false,
      crearGeneradorSemilla(1),
    );
    expect(movimiento).toBeNull();
    expect(estado.decisionPendiente).toBeNull();
  });

  it("cambia un jugador propio por un sobre nuevo de la misma liga, en la misma posición", () => {
    const base = partidaDePrueba();
    const original: CartaMiClub = {
      tipo: "jugador",
      id: "c1",
      origen: { clase: "liga", liga: "MLS" },
      jugador: { id: "p-original", jugadorId: "p-original", nombre: "X", apellido: "Y", rating: 70, posicion: "GK", calidad: "Normal" },
    };
    const conCarta = conJugador(base, "j1", { miClub: [original] });
    const { estado } = aplicarCartaPrensa(conCarta, "j1", carta(16), false, crearGeneradorSemilla(1));
    expect(estado.decisionPendiente?.detalle.tipo).toBe("elegirCambioAgente");

    const resultado = exito(elegirCambioAgente(estado, "j1", "c1", crearGeneradorSemilla(3)));
    const miClub = jugadorDe(resultado, "j1").miClub;
    expect(miClub).toHaveLength(1);
    expect(miClub[0]?.id).not.toBe("c1");
    const nueva = miClub[0];
    if (nueva?.tipo === "jugador") {
      expect(nueva.jugador.posicion).toBe("GK");
      expect(nueva.origen).toEqual({ clase: "liga", liga: "MLS" });
    } else {
      throw new Error("se esperaba una carta de jugador");
    }
  });

  it("cambia un técnico por un técnico nuevo", () => {
    const base = partidaDePrueba();
    const original: CartaMiClub = { tipo: "tecnico", id: "c1", tecnico: { id: "t-original", nombre: "A", apellido: "B" } };
    const conCarta = conJugador(base, "j1", { miClub: [original] });
    const { estado } = aplicarCartaPrensa(conCarta, "j1", carta(16), false, crearGeneradorSemilla(1));
    const resultado = exito(elegirCambioAgente(estado, "j1", "c1", crearGeneradorSemilla(3)));
    const miClub = jugadorDe(resultado, "j1").miClub;
    expect(miClub).toHaveLength(1);
    expect(miClub[0]?.tipo).toBe("tecnico");
  });

  it("rechaza cambiar una carta que no está en Mi Club", () => {
    const base = conJugador(partidaDePrueba(), "j1", { miClub: [cartaTecnico("c1")] });
    const { estado } = aplicarCartaPrensa(base, "j1", carta(16), false, crearGeneradorSemilla(1));
    const resultado = elegirCambioAgente(estado, "j1", "no-existe", crearGeneradorSemilla(1));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("CARTA_DESCONOCIDA");
  });
});
