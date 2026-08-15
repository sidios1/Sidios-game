import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import { exito, JUGADORES, poolDePrueba } from "./apoyoPruebas.js";
import { jugadorDe } from "./estado.js";
import { aplicarAccion, crearPartida, jugadorEnTurno, terminada } from "./partida.js";
import { REGLAS_MONOPOLY } from "./reglas.js";

describe("crearPartida", () => {
  it("otorga 6 sobres gratis por jugador sin descontar presupuesto (§1.1)", () => {
    const estado = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    for (const jugador of estado.jugadores) {
      expect(jugador.miClub).toHaveLength(REGLAS_MONOPOLY.sobresIniciales);
      expect(jugador.presupuesto).toBe(REGLAS_MONOPOLY.presupuestoInicial);
    }
    expect(estado.numeroRonda).toBe(1);
    expect(estado.jugadorEnTurno).toBe("j1");
    expect(estado.decisionPendiente).toBeNull();
  });

  it("el registro de futbolistas ya sorteados (§9) se resetea entre partidas distintas", () => {
    const p1 = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    expect(p1.jugadoresRealesSorteados.length).toBeGreaterThan(0);

    // mismo seed + mismo pool -> misma secuencia de sorteos -> mismo registro;
    // si `crearPartida` arrastrara estado de una llamada anterior (bug de
    // estado compartido/mutable), este segundo registro tendría el doble de
    // entradas en vez de ser idéntico al primero.
    const p2 = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    expect(p2.jugadoresRealesSorteados).toEqual(p1.jugadoresRealesSorteados);

    // otra partida con otro seed sortea otros futbolistas, sin arrastrar nada
    // de las anteriores: cada `crearPartida` parte de `[]` (partida.ts).
    const p3 = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(2), { rondasTotales: 10 }));
    expect(p3.jugadoresRealesSorteados.length).toBeGreaterThan(0);
    expect(p3.jugadoresRealesSorteados).not.toEqual(p1.jugadoresRealesSorteados);
  });

  it("rechaza menos de 2 jugadores", () => {
    const resultado = crearPartida(
      [{ id: "solo", nombre: "Solo" }],
      poolDePrueba(),
      crearGeneradorSemilla(1),
      { rondasTotales: 10 },
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("rechaza ids de jugador duplicados", () => {
    const resultado = crearPartida(
      [
        { id: "a", nombre: "A" },
        { id: "a", nombre: "B" },
      ],
      poolDePrueba(),
      crearGeneradorSemilla(1),
      { rondasTotales: 10 },
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("JUGADORES_INVALIDOS");
  });

  it("rechaza un pool inválido (una liga sin jugadores)", () => {
    const base = poolDePrueba();
    const poolRoto = { ...base, porLiga: { ...base.porLiga, MLS: [] } };
    const resultado = crearPartida(JUGADORES, poolRoto, crearGeneradorSemilla(1), { rondasTotales: 10 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("POOL_INVALIDO");
  });

  it("rechaza rondasTotales inválido", () => {
    const resultado = crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 0 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("CONFIG_INVALIDA");
  });
});

describe("jugadorEnTurno / terminada (§6)", () => {
  it("jugadorEnTurno refleja el estado; null cuando la partida terminó", () => {
    const estado = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 1 }));
    expect(jugadorEnTurno(estado)).toBe("j1");
    expect(terminada(estado)).toBe(false);

    const acabada = { ...estado, numeroRonda: 2 }; // rondasTotales: 1 -> ya se superó
    expect(terminada(acabada)).toBe(true);
    expect(jugadorEnTurno(acabada)).toBeNull();
  });
});

describe("aplicarAccion (dispatcher)", () => {
  it("rechaza acciones de un jugador desconocido", () => {
    const estado = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    const resultado = aplicarAccion(estado, "fantasma", { tipo: "tirarDados" }, crearGeneradorSemilla(1));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("JUGADOR_DESCONOCIDO");
  });

  it("rechaza tirar los dados si no es tu turno", () => {
    const estado = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    const resultado = aplicarAccion(estado, "j2", { tipo: "tirarDados" }, crearGeneradorSemilla(1));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("NO_ES_TU_TURNO");
  });

  it("rechaza una acción que no corresponde a la decisión pendiente", () => {
    const base = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    const conPendiente = {
      ...base,
      decisionPendiente: {
        jugadorId: "j1",
        fueDoble: false,
        detalle: { tipo: "compraODeclina" as const, celdaIndice: 3 },
      },
    };
    const resultado = aplicarAccion(conPendiente, "j1", { tipo: "tirarDados" }, crearGeneradorSemilla(1));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("ACCION_NO_ESPERADA");
  });

  it("rechaza si la decisión pendiente es de otro jugador", () => {
    const base = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    const conPendiente = {
      ...base,
      decisionPendiente: {
        jugadorId: "j2",
        fueDoble: false,
        detalle: { tipo: "compraODeclina" as const, celdaIndice: 3 },
      },
    };
    const resultado = aplicarAccion(
      conPendiente,
      "j1",
      { tipo: "comprarSobre", posicion: "GK" },
      crearGeneradorSemilla(1),
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe("NO_ES_TU_TURNO");
  });

  it("resuelve compraODeclina y finaliza el segmento de turno automáticamente", () => {
    const base = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    const conPendiente = {
      ...base,
      decisionPendiente: {
        jugadorId: "j1",
        fueDoble: false,
        detalle: { tipo: "compraODeclina" as const, celdaIndice: 3 },
      },
    };
    const resultado = exito(
      aplicarAccion(conPendiente, "j1", { tipo: "comprarSobre", posicion: "GK" }, crearGeneradorSemilla(1)),
    );
    expect(resultado.decisionPendiente).toBeNull();
    expect(resultado.jugadorEnTurno).toBe("j2"); // el dispatcher finalizó el segmento
    expect(jugadorDe(resultado, "j1").miClub.length).toBe(REGLAS_MONOPOLY.sobresIniciales + 1);
  });

  it("declinar deja la subasta abierta: el segmento NO se finaliza (sigue bloqueado)", () => {
    const base = exito(crearPartida(JUGADORES, poolDePrueba(), crearGeneradorSemilla(1), { rondasTotales: 10 }));
    const conPendiente = {
      ...base,
      decisionPendiente: {
        jugadorId: "j1",
        fueDoble: false,
        detalle: { tipo: "compraODeclina" as const, celdaIndice: 3 },
      },
    };
    const resultado = exito(aplicarAccion(conPendiente, "j1", { tipo: "declinarCompra" }, crearGeneradorSemilla(1)));
    expect(resultado.subastaEnCurso).not.toBeNull();
    expect(resultado.jugadorEnTurno).toBe("j1");
  });
});
