import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { JUGADORES, exito, poolDePrueba } from "./apoyoPruebas.js";
import {
  comprarSobre,
  declinarCompra,
  elegirPosicionSobre,
  pasarSubasta,
  pujar,
} from "./economia.js";
import type { DecisionPendiente, EstadoMonopoly } from "./estado.js";
import { jugadorDe } from "./estado.js";
import type { JugadorPool } from "./fuenteSobres.js";
import { crearPartida } from "./partida.js";
import { partidaDePrueba, sinMiClub } from "./pruebasComunes.js";

/** Fuerza una decisión "compraODeclina" pendiente en `celdaIndice` para `jugadorId`, sin depender de `tirarDados`. */
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

describe("comprarSobre (compra directa, §3)", () => {
  it("cobra el precio de lista, agrega la carta a Mi Club y abre una ventana de renegociación", () => {
    const base = sinMiClub(partidaDePrueba());
    const estado = conCompraPendiente(base, "j1", 3); // MLS, $20M
    const resultado = exito(comprarSobre(estado, "j1", crearGeneradorSemilla(1), "GK"));

    const j1 = jugadorDe(resultado, "j1");
    expect(j1.presupuesto).toBe(1000 - 20);
    expect(j1.miClub).toHaveLength(1);
    expect(resultado.decisionPendiente).toBeNull();

    const ventana = resultado.ventanasAbiertas[3];
    expect(ventana).toBeDefined();
    expect(ventana?.compradorOriginalId).toBe("j1");
    expect(ventana?.titularActualId).toBe("j1");
    expect(ventana?.precioActual).toBe(20);
    expect(ventana?.turnoDeCierre).toBe(base.turnoGlobal + base.ordenJugadores.length);
  });

  it("requiere posición para celdas de liga/Resto del Mundo", () => {
    const base = partidaDePrueba();
    const estado = conCompraPendiente(base, "j1", 3);
    const resultado = comprarSobre(estado, "j1", crearGeneradorSemilla(1));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("POSICION_REQUERIDA");
  });

  it("no requiere posición para Técnicos y abre ventana igual", () => {
    const base = sinMiClub(partidaDePrueba());
    const estado = conCompraPendiente(base, "j1", 12); // Técnicos
    const resultado = exito(comprarSobre(estado, "j1", crearGeneradorSemilla(1)));
    const j1 = jugadorDe(resultado, "j1");
    expect(j1.miClub).toHaveLength(1);
    expect(j1.miClub[0]?.tipo).toBe("tecnico");
    expect(resultado.ventanasAbiertas[12]).toBeDefined();
  });

  it("aplica mitad de precio si el jugador tiene la carta #1 activa", () => {
    const base = partidaDePrueba();
    const conFlag = {
      ...base,
      jugadores: base.jugadores.map((j) => (j.id === "j1" ? { ...j, proximoSobreMitadPrecio: true } : j)),
    };
    const estado = conCompraPendiente(conFlag, "j1", 9); // Arabia Saudita, $45M
    const resultado = exito(comprarSobre(estado, "j1", crearGeneradorSemilla(1), "GK"));
    expect(jugadorDe(resultado, "j1").presupuesto).toBe(1000 - 23); // round(45/2)
    expect(jugadorDe(resultado, "j1").proximoSobreMitadPrecio).toBe(false); // se consume
  });

  it("rechaza si no hay una compra pendiente para ese jugador", () => {
    const base = partidaDePrueba();
    const resultado = comprarSobre(base, "j1", crearGeneradorSemilla(1), "GK");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("ACCION_NO_ESPERADA");
  });
});

describe("comprarSobre — exclusión de futbolista real ya sorteado (§9)", () => {
  function jp(id: string, jugadorId: string, posicion: JugadorPool["posicion"], rating: number): JugadorPool {
    return { id, jugadorId, nombre: id, apellido: "", rating, posicion, calidad: "Normal" };
  }

  /**
   * MLS (celdas 1 y 3) tiene un único futbolista real ("1") con 2 entradas
   * (GK/ST) + relleno SOLO de posición ST (sin relleno GK): así el sorteo de
   * GK siempre resuelve a "1-GK" por la cascada de fallback (nivel1, único
   * match de esa posición en el pool) sin importar el tier/rng, y el sorteo
   * de ST tras excluir a "1" siempre cae en el relleno — el test queda
   * determinista sin depender de qué tier sortee `elegirTier`.
   */
  function partidaConMlsCompartido(): EstadoMonopoly {
    const base = poolDePrueba();
    const mls: readonly JugadorPool[] = [
      jp("1-GK", "1", "GK", 80),
      jp("1-ST", "1", "ST", 80),
      jp("relleno-0", "relleno-0", "ST", 50),
      jp("relleno-1", "relleno-1", "ST", 55),
      jp("relleno-2", "relleno-2", "ST", 60),
    ];
    const pool = { ...base, porLiga: { ...base.porLiga, MLS: mls } };
    const partida = sinMiClub(
      exito(crearPartida(JUGADORES, pool, crearGeneradorSemilla(999), { rondasTotales: 20 })),
    );
    // Los 6 sobres iniciales (§1.1) ya pudieron sortear del pool de MLS antes
    // de que arranque este test; se resetea el registro para aislar el
    // comportamiento de `comprarSobre` (mismo espíritu que `sinMiClub`).
    return { ...partida, jugadoresRealesSorteados: [] };
  }

  function cartaJugadorDe(estado: EstadoMonopoly, jugadorId: string): JugadorPool {
    const carta = jugadorDe(estado, jugadorId).miClub[0];
    if (carta === undefined || carta.tipo !== "jugador") {
      throw new Error("se esperaba una carta de jugador en Mi Club");
    }
    return carta.jugador;
  }

  it("un futbolista con 2 posiciones elegibles no puede salir sorteado dos veces en la misma partida", () => {
    const base = partidaConMlsCompartido();

    const conCompraJ1 = conCompraPendiente(base, "j1", 1); // MLS $10M
    const r1 = exito(comprarSobre(conCompraJ1, "j1", crearGeneradorSemilla(1), "GK"));
    expect(cartaJugadorDe(r1, "j1").jugadorId).toBe("1");
    expect(r1.jugadoresRealesSorteados).toEqual(["1"]);

    const conCompraJ2 = conCompraPendiente(r1, "j2", 3); // MLS $20M, misma liga
    const r2 = exito(comprarSobre(conCompraJ2, "j2", crearGeneradorSemilla(2), "ST"));
    expect(cartaJugadorDe(r2, "j2").jugadorId).not.toBe("1");
    expect(r2.jugadoresRealesSorteados).toContain("1");
  });

  it("el pool sigue funcionando con normalidad para los demás futbolistas no sorteados", () => {
    const base = partidaConMlsCompartido();
    const conCompraJ1 = conCompraPendiente(base, "j1", 1);
    const r1 = exito(comprarSobre(conCompraJ1, "j1", crearGeneradorSemilla(1), "GK"));

    const conCompraJ2 = conCompraPendiente(r1, "j2", 3);
    const r2 = exito(comprarSobre(conCompraJ2, "j2", crearGeneradorSemilla(2), "ST"));
    expect(cartaJugadorDe(r2, "j2")).toBeDefined();
    expect(r2.jugadoresRealesSorteados).toHaveLength(2);
  });
});

describe("declinarCompra + subasta (§3)", () => {
  it("declinar abre una subasta libre ascendente", () => {
    const base = partidaDePrueba();
    const estado = conCompraPendiente(base, "j1", 3);
    const resultado = exito(declinarCompra(estado, "j1"));
    expect(resultado.decisionPendiente).toBeNull();
    expect(resultado.subastaEnCurso).toEqual({
      celdaIndice: 3,
      jugadorQueDeclino: "j1",
      fueDoble: false,
      pujaActual: null,
      jugadoresPasados: [],
    });
  });

  it("si nadie puja, el que declinó queda obligado a comprar al precio de lista, sin ventana", () => {
    const base = sinMiClub(partidaDePrueba());
    const conSubasta = exito(declinarCompra(conCompraPendiente(base, "j1", 3), "j1"));

    const rng = crearGeneradorSemilla(1);
    const p1 = exito(pasarSubasta(conSubasta, "j1", rng));
    expect(p1.subastaEnCurso).not.toBeNull();
    const p2 = exito(pasarSubasta(p1, "j2", rng));
    expect(p2.subastaEnCurso).not.toBeNull();
    const p3 = exito(pasarSubasta(p2, "j3", rng));

    expect(p3.subastaEnCurso).toBeNull();
    expect(jugadorDe(p3, "j1").presupuesto).toBe(1000 - 20); // precio de lista de la celda 3
    expect(p3.decisionPendiente?.detalle.tipo).toBe("elegirPosicionSobre");
    expect(Object.keys(p3.ventanasAbiertas)).toHaveLength(0); // §3: la subasta NUNCA abre ventana

    const final = exito(elegirPosicionSobre(p3, "j1", "GK", rng));
    expect(jugadorDe(final, "j1").miClub).toHaveLength(1);
    expect(Object.keys(final.ventanasAbiertas)).toHaveLength(0);
  });

  it("con varios postores, gana el mayor postor y tampoco se abre ventana", () => {
    const base = partidaDePrueba();
    const conSubasta = exito(declinarCompra(conCompraPendiente(base, "j1", 3), "j1"));

    const p1 = exito(pujar(conSubasta, "j2", 10));
    const p2 = exito(pujar(p1, "j3", 20));
    const p3 = exito(pasarSubasta(p2, "j1", crearGeneradorSemilla(1)));
    const p4 = exito(pasarSubasta(p3, "j2", crearGeneradorSemilla(1)));

    expect(p4.subastaEnCurso).toBeNull();
    expect(jugadorDe(p4, "j3").presupuesto).toBe(1000 - 20);
    expect(p4.decisionPendiente?.jugadorId).toBe("j3");
    expect(Object.keys(p4.ventanasAbiertas)).toHaveLength(0);
  });

  it("la puja mínima respeta el incremento de §3 ($10M inicial, $10M mínimo)", () => {
    const base = partidaDePrueba();
    const conSubasta = exito(declinarCompra(conCompraPendiente(base, "j1", 3), "j1"));
    const bajaDeMas = pujar(conSubasta, "j2", 5);
    expect(bajaDeMas.ok).toBe(false);
    const primeraOk = exito(pujar(conSubasta, "j2", 10));
    const incrementoInsuficiente = pujar(primeraOk, "j3", 15);
    expect(incrementoInsuficiente.ok).toBe(false);
    const segundaOk = pujar(primeraOk, "j3", 20);
    expect(segundaOk.ok).toBe(true);
  });
});

describe("quiebra (§3.3)", () => {
  it("una compra obligada que supera el presupuesto marca al jugador en quiebra", () => {
    const base = partidaDePrueba();
    const pobre = {
      ...base,
      jugadores: base.jugadores.map((j) => (j.id === "j1" ? { ...j, presupuesto: 5 } : j)),
    };
    const conSubasta = exito(declinarCompra(conCompraPendiente(pobre, "j1", 3), "j1")); // MLS $20M
    const rng = crearGeneradorSemilla(1);
    const p1 = exito(pasarSubasta(conSubasta, "j1", rng));
    const p2 = exito(pasarSubasta(p1, "j2", rng));
    const p3 = exito(pasarSubasta(p2, "j3", rng));
    const j1 = jugadorDe(p3, "j1");
    expect(j1.presupuesto).toBe(5 - 20);
    expect(j1.enQuiebra).toBe(true);
  });

  it("un jugador en quiebra no puede tirar los dados", () => {
    const base = partidaDePrueba();
    const enQuiebra = {
      ...base,
      jugadores: base.jugadores.map((j) => (j.id === "j1" ? { ...j, enQuiebra: true } : j)),
    };
    const rng = crearGeneradorSemilla(1);
    const resultado = pujar({ ...enQuiebra, subastaEnCurso: null }, "j1", 10);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("SUBASTA_NO_EN_CURSO");
  });
});
