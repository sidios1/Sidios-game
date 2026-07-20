// Tests de las costuras aditivas para modos (Rumble). Verifican que cada costura
// es pura, preserva el invariante de multiset del mazo y NO altera las reglas base.
// La no-regresión de las 9 manos vive aquí (equivalencia bajarse ≡ bajarseConContrato
// con el contrato global) y en `partidaCompleta.test.ts` (recorrido completo).

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import type { Carta } from "./carta.js";
import type { EspecCarta } from "./apoyoPruebas.js";
import { idsSegunEspecs, mazoParaDos, n } from "./apoyoPruebas.js";
import type { TipoCombinacion } from "./combinaciones.js";
import type { ContratoMano } from "./contratos.js";
import { contratoDeMano, MANOS } from "./contratos.js";
import type {
  EstadoPartida,
  PropuestaCombinacion,
  Resultado,
} from "./partida.js";
import {
  bajarse,
  bajarseConContrato,
  cerrarManoManual,
  crearPartidaConMazo,
  descartar,
  intercambiarManos,
  iniciarSiguienteManoConMazo,
  reemplazarCartaPorComodin,
  resetearCartasDeMano,
  resetearManoJugador,
  robarDelMazo,
  robarDelMazoSesgado,
  robarDelPozoPorId,
  robarDobleDelMazo,
  transferirCarta,
} from "./partida.js";
import { puntosMano } from "./puntaje.js";

const DATOS = [
  { id: "ana", nombre: "Ana" },
  { id: "beto", nombre: "Beto" },
];

function ok(resultado: Resultado<EstadoPartida>): EstadoPartida {
  if (!resultado.ok) {
    throw new Error(`la acción falló: ${resultado.error.codigo} — ${resultado.error.mensaje}`);
  }
  return resultado.valor;
}

function codigo(resultado: Resultado<EstadoPartida>): string {
  if (resultado.ok) throw new Error("se esperaba un error y la acción tuvo éxito");
  return resultado.error.codigo;
}

function jugador(estado: EstadoPartida, id: string) {
  const encontrado = estado.jugadores.find((j) => j.id === id);
  if (encontrado === undefined) throw new Error(`no existe el jugador ${id}`);
  return encontrado;
}

function unId(ids: readonly string[]): string {
  const primero = ids[0];
  if (primero === undefined) throw new Error("lista de ids vacía");
  return primero;
}

function cartaTope(monton: readonly Carta[]): Carta {
  const carta = monton[monton.length - 1];
  if (carta === undefined) throw new Error("montón vacío");
  return carta;
}

function cartaRobada(antes: readonly Carta[], despues: readonly Carta[]): Carta {
  const nueva = despues.find((c) => !antes.some((a) => a.id === c.id));
  if (nueva === undefined) throw new Error("no se robó ninguna carta");
  return nueva;
}

/** Multiset (ordenado) de todos los ids de carta del estado: mazo ∪ pozo ∪ manos ∪ mesa. */
function idsMultiset(estado: EstadoPartida): string[] {
  return [
    ...estado.mazo.map((c) => c.id),
    ...estado.pozo.map((c) => c.id),
    ...estado.jugadores.flatMap((j) => j.mano.map((c) => c.id)),
    ...estado.mesa.flatMap((m) => m.combinacion.cartas.map((c) => c.id)),
  ].sort();
}

/** Estado base: 2 jugadores, mano 1; abre "beto" (repartidor 0 → siguiente). */
function estadoBase(pozo: EspecCarta = n("picas", 5)): EstadoPartida {
  const mazo = mazoParaDos({ manoP0: "relleno", manoP1: "relleno", pozo });
  return ok(crearPartidaConMazo(DATOS, mazo));
}

const rngCero = () => 0; // siempre dispara el sesgo / elige el índice 0

describe("robarDelMazoSesgado (DECRETALO)", () => {
  it("con el sesgo activo roba una carta que casa el objetivo, no la cima", () => {
    const estado = estadoBase();
    expect(estado.turno.jugadorId).toBe("beto");
    const tope = cartaTope(estado.mazo);
    const objetivoCarta = estado.mazo.find(
      (c) =>
        c.tipo === "normal" &&
        !(tope.tipo === "normal" && c.pinta === tope.pinta && c.valor === tope.valor),
    );
    if (objetivoCarta === undefined || objetivoCarta.tipo !== "normal") {
      throw new Error("no se encontró carta objetivo distinta de la cima");
    }
    const objetivo = { pinta: objetivoCarta.pinta, valor: objetivoCarta.valor };
    const despues = ok(robarDelMazoSesgado(estado, "beto", objetivo, rngCero));
    const robada = cartaRobada(jugador(estado, "beto").mano, jugador(despues, "beto").mano);
    expect(robada.tipo).toBe("normal");
    if (robada.tipo === "normal") {
      expect(robada.pinta).toBe(objetivo.pinta);
      expect(robada.valor).toBe(objetivo.valor);
    }
    expect(despues.turno.fase).toBe("descartar");
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("sin disparar el sesgo roba la cima, igual que robarDelMazo", () => {
    const estado = estadoBase();
    const tope = cartaTope(estado.mazo);
    const objetivo = { valor: 7 as const };
    const noSesga = () => 0.9; // 0.9 < 0.25 es falso → cae a la cima
    const despues = ok(robarDelMazoSesgado(estado, "beto", objetivo, noSesga));
    const robada = cartaRobada(jugador(estado, "beto").mano, jugador(despues, "beto").mano);
    expect(robada.id).toBe(tope.id);
    // el robo normal saca exactamente la misma cima
    const normal = ok(robarDelMazo(estado, "beto"));
    expect(cartaRobada(jugador(estado, "beto").mano, jugador(normal, "beto").mano).id).toBe(tope.id);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("rechaza robar fuera de turno", () => {
    const estado = estadoBase();
    expect(codigo(robarDelMazoSesgado(estado, "ana", { valor: 7 }, rngCero))).toBe("NO_ES_TU_TURNO");
  });
});

describe("robarDelPozoPorId (JUDIO)", () => {
  it("saca una carta arbitraria del pozo, no solo la cima", () => {
    const estado0 = estadoBase();
    const idFondoPozo = cartaTope(estado0.pozo).id; // el pozo abre con 1 carta
    // beto roba y descarta una carta normal → el pozo queda [apertura, descarte]
    const trasRobo = ok(robarDelMazo(estado0, "beto"));
    const normalBeto = jugador(trasRobo, "beto").mano.find((c) => c.tipo === "normal");
    if (normalBeto === undefined) throw new Error("beto no tiene carta normal");
    const estado = ok(descartar(trasRobo, "beto", normalBeto.id));
    expect(estado.turno.jugadorId).toBe("ana");
    expect(estado.pozo).toHaveLength(2);
    // ana toma la carta del FONDO del pozo (la apertura), no la cima
    const despues = ok(robarDelPozoPorId(estado, "ana", idFondoPozo));
    expect(jugador(despues, "ana").mano.some((c) => c.id === idFondoPozo)).toBe(true);
    expect(despues.pozo.some((c) => c.id === idFondoPozo)).toBe(false);
    expect(despues.turno.fase).toBe("descartar");
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("falla si la carta no está en el pozo", () => {
    const estado = estadoBase();
    expect(codigo(robarDelPozoPorId(estado, "beto", "inexistente"))).toBe("CARTA_NO_ESTA_EN_POZO");
  });
});

describe("intercambiarManos (GINYU)", () => {
  it("permuta las manos completas de dos jugadores", () => {
    const estado = estadoBase();
    const manoAna = jugador(estado, "ana").mano.map((c) => c.id);
    const manoBeto = jugador(estado, "beto").mano.map((c) => c.id);
    const despues = ok(intercambiarManos(estado, "ana", "beto"));
    expect(jugador(despues, "ana").mano.map((c) => c.id)).toEqual(manoBeto);
    expect(jugador(despues, "beto").mano.map((c) => c.id)).toEqual(manoAna);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("rechaza el mismo jugador o un id desconocido", () => {
    const estado = estadoBase();
    expect(codigo(intercambiarManos(estado, "ana", "ana"))).toBe("JUGADOR_DESCONOCIDO");
    expect(codigo(intercambiarManos(estado, "ana", "nadie"))).toBe("JUGADOR_DESCONOCIDO");
  });
});

describe("resetearManoJugador (CHATO / MATO-propia)", () => {
  it("reparte una mano nueva del mismo tamaño y conserva el multiset", () => {
    const estado = estadoBase();
    const tam = jugador(estado, "ana").mano.length;
    const tamMazo = estado.mazo.length;
    const despues = ok(resetearManoJugador(estado, "ana", crearGeneradorSemilla(7)));
    expect(jugador(despues, "ana").mano).toHaveLength(tam);
    expect(despues.mazo).toHaveLength(tamMazo);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("es determinista bajo la misma semilla", () => {
    const estado = estadoBase();
    const a = ok(resetearManoJugador(estado, "ana", crearGeneradorSemilla(42)));
    const b = ok(resetearManoJugador(estado, "ana", crearGeneradorSemilla(42)));
    expect(a).toEqual(b);
  });

  it("rechaza un jugador desconocido", () => {
    const estado = estadoBase();
    expect(codigo(resetearManoJugador(estado, "nadie", rngCero))).toBe("JUGADOR_DESCONOCIDO");
  });
});

describe("resetearCartasDeMano (TROLL genérica)", () => {
  it("resetea solo las cartas indicadas y conserva tamaño y multiset", () => {
    const estado = estadoBase();
    const mano = jugador(estado, "ana").mano;
    const objetivos = [mano[0], mano[1]].filter((c): c is Carta => c !== undefined);
    const ids = objetivos.map((c) => c.id);
    const tamMazo = estado.mazo.length;
    const despues = ok(resetearCartasDeMano(estado, "ana", ids, crearGeneradorSemilla(3)));
    expect(jugador(despues, "ana").mano).toHaveLength(mano.length);
    expect(despues.mazo).toHaveLength(tamMazo);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("falla si alguna carta a resetear no está en la mano", () => {
    const estado = estadoBase();
    expect(codigo(resetearCartasDeMano(estado, "ana", ["inexistente"], rngCero))).toBe(
      "CARTA_NO_ESTA_EN_MANO",
    );
  });
});

describe("transferirCarta (PILLO)", () => {
  it("mueve una carta concreta de una mano a otra", () => {
    const estado = estadoBase();
    const carta = unId(jugador(estado, "ana").mano.map((c) => c.id));
    const tamAna = jugador(estado, "ana").mano.length;
    const tamBeto = jugador(estado, "beto").mano.length;
    const despues = ok(transferirCarta(estado, "ana", "beto", carta));
    expect(jugador(despues, "ana").mano.some((c) => c.id === carta)).toBe(false);
    expect(jugador(despues, "beto").mano.some((c) => c.id === carta)).toBe(true);
    expect(jugador(despues, "ana").mano).toHaveLength(tamAna - 1);
    expect(jugador(despues, "beto").mano).toHaveLength(tamBeto + 1);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("rechaza mismo jugador, carta ausente o jugador desconocido", () => {
    const estado = estadoBase();
    const carta = unId(jugador(estado, "ana").mano.map((c) => c.id));
    expect(codigo(transferirCarta(estado, "ana", "ana", carta))).toBe("JUGADOR_DESCONOCIDO");
    expect(codigo(transferirCarta(estado, "ana", "beto", "inexistente"))).toBe("CARTA_NO_ESTA_EN_MANO");
    expect(codigo(transferirCarta(estado, "ana", "nadie", carta))).toBe("JUGADOR_DESCONOCIDO");
  });
});

describe("reemplazarCartaPorComodin (GUASON)", () => {
  // Manos sin comodines para que los 4 comodines queden en el mazo.
  const manoSinComodin = [
    n("corazones", 2), n("corazones", 3), n("corazones", 4), n("corazones", 5),
    n("corazones", 6), n("corazones", 7), n("corazones", 8), n("corazones", 9),
    n("corazones", 10), n("corazones", 11), n("corazones", 12), n("corazones", 13),
  ];
  const otraManoSinComodin = [
    n("picas", 2), n("picas", 3), n("picas", 4), n("picas", 5),
    n("picas", 6), n("picas", 7), n("picas", 8), n("picas", 9),
    n("picas", 10), n("picas", 11), n("picas", 12), n("picas", 13),
  ];

  function estadoConComodinesEnMazo(): EstadoPartida {
    const mazo = mazoParaDos({ manoP0: manoSinComodin, manoP1: otraManoSinComodin, pozo: n("treboles", 2) });
    return ok(crearPartidaConMazo(DATOS, mazo));
  }

  it("cambia una carta propia por un comodín del mazo, conservando tamaños y multiset", () => {
    const estado = estadoConComodinesEnMazo();
    expect(estado.mazo.some((c) => c.tipo === "comodin")).toBe(true);
    const saliente = unId(jugador(estado, "ana").mano.map((c) => c.id));
    const tamMano = jugador(estado, "ana").mano.length;
    const tamMazo = estado.mazo.length;
    const despues = ok(reemplazarCartaPorComodin(estado, "ana", rngCero, saliente));
    const mano = jugador(despues, "ana").mano;
    expect(mano).toHaveLength(tamMano);
    expect(mano.some((c) => c.tipo === "comodin")).toBe(true);
    expect(mano.some((c) => c.id === saliente)).toBe(false);
    expect(despues.mazo.some((c) => c.id === saliente)).toBe(true);
    expect(despues.mazo).toHaveLength(tamMazo);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("sin id de saliente elige una carta al azar (rng) y también conserva el multiset", () => {
    const estado = estadoConComodinesEnMazo();
    const despues = ok(reemplazarCartaPorComodin(estado, "ana", rngCero));
    expect(jugador(despues, "ana").mano.some((c) => c.tipo === "comodin")).toBe(true);
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("falla con SIN_COMODINES si el mazo no tiene comodines", () => {
    const estado = estadoConComodinesEnMazo();
    const sinComodines: EstadoPartida = {
      ...estado,
      mazo: estado.mazo.filter((c) => c.tipo !== "comodin"),
    };
    expect(codigo(reemplazarCartaPorComodin(sinComodines, "ana", rngCero))).toBe("SIN_COMODINES");
  });
});

describe("robarDobleDelMazo (EXTRA)", () => {
  it("roba dos cartas de la cima en un turno y pasa a fase descartar", () => {
    const estado = estadoBase();
    const tam = jugador(estado, "beto").mano.length;
    const tamMazo = estado.mazo.length;
    const dos = [estado.mazo[estado.mazo.length - 1], estado.mazo[estado.mazo.length - 2]]
      .filter((c): c is Carta => c !== undefined)
      .map((c) => c.id);
    const despues = ok(robarDobleDelMazo(estado, "beto"));
    expect(jugador(despues, "beto").mano).toHaveLength(tam + 2);
    expect(despues.mazo).toHaveLength(tamMazo - 2);
    for (const id of dos) {
      expect(jugador(despues, "beto").mano.some((c) => c.id === id)).toBe(true);
    }
    expect(despues.turno.fase).toBe("descartar");
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("rechaza robar doble fuera de turno", () => {
    const estado = estadoBase();
    expect(codigo(robarDobleDelMazo(estado, "ana"))).toBe("NO_ES_TU_TURNO");
  });
});

describe("cerrarManoManual (EXODIA)", () => {
  it("cierra la mano por condición externa aunque al ganador le queden cartas", () => {
    const estado = ok(robarDelMazo(estadoBase(), "beto"));
    const manoAna = jugador(estado, "ana").mano;
    expect(jugador(estado, "beto").mano.length).toBeGreaterThan(0);
    const despues = ok(cerrarManoManual(estado, "beto"));
    expect(despues.fase).toBe("manoTerminada");
    expect(despues.ganadorManoId).toBe("beto");
    expect(jugador(despues, "beto").puntosAcumulados).toBe(0);
    expect(jugador(despues, "ana").puntosAcumulados).toBe(puntosMano(manoAna));
    // el cierre no mueve cartas: el multiset se conserva
    expect(idsMultiset(despues)).toEqual(idsMultiset(estado));
  });

  it("rechaza cerrar fuera de una mano en curso o con ganador desconocido", () => {
    const cerrado = ok(cerrarManoManual(ok(robarDelMazo(estadoBase(), "beto")), "beto"));
    expect(codigo(cerrarManoManual(cerrado, "beto"))).toBe("FASE_INCORRECTA");
    expect(codigo(cerrarManoManual(estadoBase(), "nadie"))).toBe("JUGADOR_DESCONOCIDO");
  });
});

describe("bajarseConContrato (TOCO) y no-regresión de las 9 manos", () => {
  interface GuionCombinacion {
    readonly tipo: TipoCombinacion;
    readonly especs: readonly EspecCarta[];
  }
  interface GuionMano {
    readonly ganadorIdx: 0 | 1;
    readonly manoGanador: readonly EspecCarta[];
    readonly pozo: EspecCarta;
    readonly robo: EspecCarta;
    readonly propuesta: readonly GuionCombinacion[];
    readonly descarte: EspecCarta | null;
  }

  // Fixture canónico de manos ganadoras válidas, una por contrato (§9).
  const GUIONES: readonly GuionMano[] = [
    {
      ganadorIdx: 1,
      manoGanador: [
        n("corazones", 7), n("diamantes", 7), n("treboles", 7), n("picas", 7), n("corazones", 7), "comodin",
        n("corazones", 9), n("diamantes", 9), n("treboles", 9), n("picas", 9), n("corazones", 9), n("diamantes", 9),
      ],
      pozo: n("diamantes", 4),
      robo: n("treboles", 3),
      propuesta: [
        { tipo: "trio", especs: [n("corazones", 7), n("diamantes", 7), n("treboles", 7), n("picas", 7), n("corazones", 7), "comodin"] },
        { tipo: "trio", especs: [n("corazones", 9), n("diamantes", 9), n("treboles", 9), n("picas", 9), n("corazones", 9), n("diamantes", 9)] },
      ],
      descarte: n("treboles", 3),
    },
    {
      ganadorIdx: 0,
      manoGanador: [
        n("corazones", 13), n("diamantes", 13), n("treboles", 13),
        n("diamantes", 4), n("diamantes", 5), n("diamantes", 6), n("diamantes", 7), n("diamantes", 8),
        n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12),
      ],
      pozo: n("picas", 6),
      robo: n("treboles", 2),
      propuesta: [
        { tipo: "trio", especs: [n("corazones", 13), n("diamantes", 13), n("treboles", 13)] },
        { tipo: "escala", especs: [n("diamantes", 4), n("diamantes", 5), n("diamantes", 6), n("diamantes", 7), n("diamantes", 8), n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12)] },
      ],
      descarte: n("treboles", 2),
    },
    {
      ganadorIdx: 1,
      manoGanador: [
        n("picas", 12), n("picas", 13), n("picas", 1), n("picas", 2), n("picas", 3), n("picas", 4),
        n("corazones", 5), n("corazones", 6), n("corazones", 7), n("corazones", 8), n("corazones", 9), n("corazones", 10),
      ],
      pozo: n("treboles", 8),
      robo: n("diamantes", 2),
      propuesta: [
        { tipo: "escala", especs: [n("picas", 12), n("picas", 13), n("picas", 1), n("picas", 2), n("picas", 3), n("picas", 4)] },
        { tipo: "escala", especs: [n("corazones", 5), n("corazones", 6), n("corazones", 7), n("corazones", 8), n("corazones", 9), n("corazones", 10)] },
      ],
      descarte: n("diamantes", 2),
    },
    {
      ganadorIdx: 0,
      manoGanador: [
        n("treboles", 4), n("diamantes", 4), n("corazones", 4), n("picas", 4),
        n("treboles", 8), n("diamantes", 8), n("corazones", 8), n("picas", 8),
        n("treboles", 11), n("diamantes", 11), n("corazones", 11), n("picas", 11),
      ],
      pozo: n("diamantes", 6),
      robo: n("corazones", 2),
      propuesta: [
        { tipo: "trio", especs: [n("treboles", 4), n("diamantes", 4), n("corazones", 4), n("picas", 4)] },
        { tipo: "trio", especs: [n("treboles", 8), n("diamantes", 8), n("corazones", 8), n("picas", 8)] },
        { tipo: "trio", especs: [n("treboles", 11), n("diamantes", 11), n("corazones", 11), n("picas", 11)] },
      ],
      descarte: n("corazones", 2),
    },
    {
      ganadorIdx: 1,
      manoGanador: [
        n("treboles", 5), n("diamantes", 5), n("corazones", 5),
        n("treboles", 10), n("diamantes", 10), n("corazones", 10),
        n("treboles", 1), n("treboles", 2), n("treboles", 3), n("treboles", 4), n("treboles", 5), n("treboles", 6),
      ],
      pozo: n("diamantes", 13),
      robo: n("picas", 9),
      propuesta: [
        { tipo: "trio", especs: [n("treboles", 5), n("diamantes", 5), n("corazones", 5)] },
        { tipo: "trio", especs: [n("treboles", 10), n("diamantes", 10), n("corazones", 10)] },
        { tipo: "escala", especs: [n("treboles", 1), n("treboles", 2), n("treboles", 3), n("treboles", 4), n("treboles", 5), n("treboles", 6)] },
      ],
      descarte: n("picas", 9),
    },
    {
      ganadorIdx: 0,
      manoGanador: [
        n("treboles", 12), n("diamantes", 12), n("corazones", 12),
        n("picas", 3), n("picas", 4), n("picas", 5), n("picas", 6),
        n("diamantes", 8), n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12),
      ],
      pozo: n("corazones", 7),
      robo: n("picas", 2),
      propuesta: [
        { tipo: "trio", especs: [n("treboles", 12), n("diamantes", 12), n("corazones", 12)] },
        { tipo: "escala", especs: [n("picas", 3), n("picas", 4), n("picas", 5), n("picas", 6)] },
        { tipo: "escala", especs: [n("diamantes", 8), n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12)] },
      ],
      descarte: n("picas", 2),
    },
    {
      ganadorIdx: 1,
      manoGanador: [
        n("corazones", 1), n("corazones", 2), n("corazones", 3), n("corazones", 4),
        n("treboles", 6), n("treboles", 7), n("treboles", 8), n("treboles", 9),
        n("picas", 11), n("picas", 12), n("picas", 13), n("picas", 1),
      ],
      pozo: n("diamantes", 10),
      robo: n("diamantes", 5),
      propuesta: [
        { tipo: "escala", especs: [n("corazones", 1), n("corazones", 2), n("corazones", 3), n("corazones", 4)] },
        { tipo: "escala", especs: [n("treboles", 6), n("treboles", 7), n("treboles", 8), n("treboles", 9)] },
        { tipo: "escala", especs: [n("picas", 11), n("picas", 12), n("picas", 13), n("picas", 1)] },
      ],
      descarte: n("diamantes", 5),
    },
    {
      ganadorIdx: 0,
      manoGanador: [
        n("corazones", 1), n("treboles", 2), n("diamantes", 3), n("picas", 4), n("corazones", 5), "comodin",
        n("diamantes", 7), n("picas", 8), n("corazones", 9), n("treboles", 10), n("diamantes", 11), n("picas", 12),
      ],
      pozo: n("diamantes", 6),
      robo: n("corazones", 13),
      propuesta: [
        {
          tipo: "escalaSucia",
          especs: [
            n("corazones", 1), n("treboles", 2), n("diamantes", 3), n("picas", 4), n("corazones", 5), "comodin",
            n("diamantes", 7), n("picas", 8), n("corazones", 9), n("treboles", 10), n("diamantes", 11), n("picas", 12),
            n("corazones", 13),
          ],
        },
      ],
      descarte: null,
    },
    {
      ganadorIdx: 1,
      manoGanador: [
        n("diamantes", 1), n("diamantes", 2), n("diamantes", 3), n("diamantes", 4), n("diamantes", 5), n("diamantes", 6),
        n("diamantes", 7), n("diamantes", 8), n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12),
      ],
      pozo: n("picas", 5),
      robo: n("diamantes", 13),
      propuesta: [
        {
          tipo: "escalaReal",
          especs: [
            n("diamantes", 1), n("diamantes", 2), n("diamantes", 3), n("diamantes", 4), n("diamantes", 5), n("diamantes", 6),
            n("diamantes", 7), n("diamantes", 8), n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12),
            n("diamantes", 13),
          ],
        },
      ],
      descarte: null,
    },
  ];

  it("cubre las 9 manos", () => {
    expect(GUIONES).toHaveLength(MANOS.length);
  });

  it("bajarse ≡ bajarseConContrato(contrato global) en cada una de las 9 manos", () => {
    let estado: EstadoPartida | null = null;
    for (const [indice, guion] of GUIONES.entries()) {
      const numero = indice + 1;
      const mazo = mazoParaDos({
        manoP0: guion.ganadorIdx === 0 ? guion.manoGanador : "relleno",
        manoP1: guion.ganadorIdx === 1 ? guion.manoGanador : "relleno",
        pozo: guion.pozo,
        robos: [guion.robo],
      });
      estado =
        estado === null
          ? ok(crearPartidaConMazo(DATOS, mazo))
          : ok(iniciarSiguienteManoConMazo(estado, mazo));
      const ganadorId = guion.ganadorIdx === 0 ? "ana" : "beto";
      estado = ok(robarDelMazo(estado, ganadorId));
      const disponibles = [...jugador(estado, ganadorId).mano];
      const propuesta: PropuestaCombinacion[] = guion.propuesta.map((parte) => ({
        tipo: parte.tipo,
        cartaIds: idsSegunEspecs(disponibles, parte.especs),
      }));
      const contratoGlobal = contratoDeMano(numero);
      if (contratoGlobal === undefined) throw new Error(`falta el contrato de la mano ${numero}`);

      // La costura con el contrato global debe dar EXACTAMENTE lo mismo que bajarse.
      const porBajarse = bajarse(estado, ganadorId, propuesta);
      const porContrato = bajarseConContrato(estado, ganadorId, propuesta, contratoGlobal);
      expect(porContrato).toEqual(porBajarse);

      estado = ok(porBajarse);
      if (guion.descarte !== null) {
        const idDescarte = unId(idsSegunEspecs([...jugador(estado, ganadorId).mano], [guion.descarte]));
        estado = ok(descartar(estado, ganadorId, idDescarte));
      }
      expect(estado.fase).toBe(numero === MANOS.length ? "partidaTerminada" : "manoTerminada");
      expect(estado.ganadorManoId).toBe(ganadorId);
    }
  });

  it("valida contra una misión alterna por jugador (contrato distinto al de la mano)", () => {
    // Mano 3 (2 escalas) pero con una MISIÓN de 3 tríos (contrato de la mano 4).
    const manoMision = [
      n("treboles", 4), n("diamantes", 4), n("corazones", 4),
      n("treboles", 8), n("diamantes", 8), n("corazones", 8),
      n("treboles", 11), n("diamantes", 11), n("corazones", 11),
      n("picas", 2), n("picas", 6), n("picas", 9),
    ];
    const mazo = mazoParaDos({ manoP0: "relleno", manoP1: manoMision, pozo: n("corazones", 10), robos: [n("treboles", 3)] });
    let estado = ok(crearPartidaConMazo(DATOS, mazo)); // mano 1; abre beto
    estado = ok(robarDelMazo(estado, "beto"));
    const mision: ContratoMano = {
      numero: 99,
      nombre: "misión TOCO (3 tríos)",
      cartasRepartidas: 12,
      requisitos: [{ tipo: "trio", cantidad: 3 }],
      comodinesPorCombinacion: 1,
      cierreAutomatico: false,
    };
    const disponibles = [...jugador(estado, "beto").mano];
    const propuesta: PropuestaCombinacion[] = [
      { tipo: "trio", cartaIds: idsSegunEspecs(disponibles, [n("treboles", 4), n("diamantes", 4), n("corazones", 4)]) },
      { tipo: "trio", cartaIds: idsSegunEspecs(disponibles, [n("treboles", 8), n("diamantes", 8), n("corazones", 8)]) },
      { tipo: "trio", cartaIds: idsSegunEspecs(disponibles, [n("treboles", 11), n("diamantes", 11), n("corazones", 11)]) },
    ];
    // Contra la misión (3 tríos) es válido...
    expect(bajarseConContrato(estado, "beto", propuesta, mision).ok).toBe(true);
    // ...pero contra el contrato REAL de la mano 3 (2 escalas) la misma propuesta falla.
    expect(codigo(bajarse(estado, "beto", propuesta))).toBe("CONTRATO_INVALIDO");
  });
});
