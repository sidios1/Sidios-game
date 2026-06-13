import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "./aleatorio.js";
import type { Carta } from "./carta.js";
import { crearCartaNormal } from "./carta.js";
import { idsSegunEspecs, mazoParaDos, n } from "./apoyoPruebas.js";
import type {
  EstadoPartida,
  PropuestaCombinacion,
  Resultado,
} from "./partida.js";
import {
  bajarse,
  crearPartida,
  crearPartidaConMazo,
  descartar,
  ganadores,
  iniciarSiguienteManoConMazo,
  pasarTurno,
  pegar,
  robarDelMazo,
  robarDelPozo,
} from "./partida.js";

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

function cartaRobada(antes: readonly Carta[], despues: readonly Carta[]): Carta {
  const nueva = despues.find((c) => !antes.some((a) => a.id === c.id));
  if (nueva === undefined) throw new Error("no se robó ninguna carta");
  return nueva;
}

describe("crearPartida", () => {
  it("reparte 12 cartas por jugador, abre el pozo y le da el turno al siguiente del repartidor", () => {
    const estado = ok(crearPartida(DATOS, crearGeneradorSemilla(99)));
    expect(estado.manoActual).toBe(1);
    expect(estado.fase).toBe("jugandoMano");
    for (const j of estado.jugadores) expect(j.mano).toHaveLength(12);
    expect(estado.pozo).toHaveLength(1);
    expect(estado.mazo).toHaveLength(108 - 24 - 1);
    // repartidor inicial: índice 0 → abre el jugador 1
    expect(estado.turno).toEqual({ jugadorId: "beto", fase: "robar", numero: 1 });
  });

  it("rechaza menos de 2 jugadores", () => {
    const rng = crearGeneradorSemilla(1);
    expect(codigo(crearPartida([{ id: "solo", nombre: "Solo" }], rng))).toBe("JUGADORES_INVALIDOS");
  });

  it("acepta más de 4 jugadores y reparte 12 a cada uno", () => {
    for (const cantidad of [5, 6, 8]) {
      const datos = Array.from({ length: cantidad }, (_, i) => ({
        id: `j${i}`,
        nombre: `J${i}`,
      }));
      const estado = ok(crearPartida(datos, crearGeneradorSemilla(7)));
      expect(estado.jugadores).toHaveLength(cantidad);
      for (const j of estado.jugadores) expect(j.mano).toHaveLength(12);
      expect(estado.pozo).toHaveLength(1);
    }
  });

  it("rechaza un mazo que no sea el juego completo de 108 cartas", () => {
    expect(codigo(crearPartidaConMazo(DATOS, []))).toBe("MAZO_INVALIDO");
  });
});

describe("máquina de turnos: robar, bajarse, pegar y descartar", () => {
  function partidaMano1(): EstadoPartida {
    // Beto (abre) recibe el contrato de la mano 1 con comodín, más cartas sueltas.
    return ok(
      crearPartidaConMazo(
        DATOS,
        mazoParaDos({
          manoP0: [
            n("corazones", 1), n("corazones", 2), n("corazones", 3), n("corazones", 4),
            n("corazones", 5), n("corazones", 6), n("corazones", 8), n("corazones", 10),
            n("corazones", 11), n("corazones", 12), n("corazones", 13), n("diamantes", 1),
          ],
          manoP1: [
            n("corazones", 7), n("diamantes", 7), "comodin",
            n("corazones", 9), n("diamantes", 9), n("treboles", 9),
            n("picas", 7), "comodin", n("treboles", 13), n("diamantes", 13),
            n("diamantes", 2), n("diamantes", 3),
          ],
          pozo: n("treboles", 4),
          robos: [n("treboles", 5), n("treboles", 6)],
        }),
      ),
    );
  }

  it("valida turno y fases, contrato exacto, pegar y comodines", () => {
    let estado = partidaMano1();

    // fuera de turno y fuera de fase
    expect(codigo(robarDelMazo(estado, "ana"))).toBe("NO_ES_TU_TURNO");
    const manoBeto = jugador(estado, "beto").mano;
    expect(codigo(descartar(estado, "beto", unId(idsSegunEspecs([...manoBeto], [n("diamantes", 2)]))))).toBe("FASE_INCORRECTA");

    // beto roba del mazo
    estado = ok(robarDelMazo(estado, "beto"));
    expect(jugador(estado, "beto").mano).toHaveLength(13);
    expect(codigo(robarDelMazo(estado, "beto"))).toBe("FASE_INCORRECTA");

    // bajarse con una propuesta que no cumple el contrato
    const desorden = [...jugador(estado, "beto").mano];
    const malaPropuesta: PropuestaCombinacion[] = [
      { tipo: "trio", cartaIds: idsSegunEspecs(desorden, [n("corazones", 7), n("diamantes", 7), n("corazones", 9)]) },
      { tipo: "trio", cartaIds: idsSegunEspecs(desorden, [n("diamantes", 9), n("treboles", 9), n("treboles", 13)]) },
    ];
    expect(codigo(bajarse(estado, "beto", malaPropuesta))).toBe("CONTRATO_INVALIDO");

    // bajarse con el contrato exacto: 2 tríos, uno con comodín
    const disponibles = [...jugador(estado, "beto").mano];
    const propuesta: PropuestaCombinacion[] = [
      { tipo: "trio", cartaIds: idsSegunEspecs(disponibles, [n("corazones", 7), n("diamantes", 7), "comodin"]) },
      { tipo: "trio", cartaIds: idsSegunEspecs(disponibles, [n("corazones", 9), n("diamantes", 9), n("treboles", 9)]) },
    ];
    estado = ok(bajarse(estado, "beto", propuesta));
    expect(estado.mesa).toHaveLength(2);
    expect(jugador(estado, "beto").mano).toHaveLength(7);
    expect(jugador(estado, "beto").turnoEnQueSeBajo).toBe(1);

    // pegar en el mismo turno en que se bajó: prohibido
    const idSietePicas = unId(idsSegunEspecs([...jugador(estado, "beto").mano], [n("picas", 7)]));
    expect(codigo(pegar(estado, "beto", idSietePicas, 0))).toBe("PEGAR_MISMO_TURNO");

    // bajarse dos veces: prohibido
    expect(codigo(bajarse(estado, "beto", propuesta))).toBe("YA_TE_BAJASTE");

    // descartar un comodín: prohibido en esta mano
    const idComodin = unId(idsSegunEspecs([...jugador(estado, "beto").mano], ["comodin"]));
    expect(codigo(descartar(estado, "beto", idComodin))).toBe("COMODIN_AL_POZO");

    // beto descarta y pasa el turno
    const idDosDiamantes = unId(idsSegunEspecs([...jugador(estado, "beto").mano], [n("diamantes", 2)]));
    estado = ok(descartar(estado, "beto", idDosDiamantes));
    expect(estado.turno).toEqual({ jugadorId: "ana", fase: "robar", numero: 2 });

    // ana roba del pozo la carta que descartó beto
    const pozoAntes = estado.pozo.length;
    estado = ok(robarDelPozo(estado, "ana"));
    expect(estado.pozo).toHaveLength(pozoAntes - 1);
    const manoAna = [...jugador(estado, "ana").mano];
    const idRobada = unId(idsSegunEspecs(manoAna, [n("diamantes", 2)]));

    // ana no se ha bajado: no puede pegar; y su propuesta no es un trío
    expect(codigo(pegar(estado, "ana", idRobada, 0))).toBe("NO_TE_HAS_BAJADO");
    const cartasAna = [...jugador(estado, "ana").mano];
    const propuestaAna: PropuestaCombinacion[] = [
      { tipo: "trio", cartaIds: idsSegunEspecs(cartasAna, [n("corazones", 1), n("corazones", 2), n("corazones", 3)]) },
      { tipo: "trio", cartaIds: idsSegunEspecs(cartasAna, [n("corazones", 4), n("corazones", 5), n("corazones", 6)]) },
    ];
    expect(codigo(bajarse(estado, "ana", propuestaAna))).toBe("CONTRATO_INVALIDO");
    const idDescarteAna = unId(idsSegunEspecs([...jugador(estado, "ana").mano], [n("corazones", 13)]));
    estado = ok(descartar(estado, "ana", idDescarteAna));
    expect(estado.turno).toEqual({ jugadorId: "beto", fase: "robar", numero: 3 });

    // beto, en un turno posterior al de bajarse, ya puede pegar
    estado = ok(robarDelMazo(estado, "beto"));
    const idOtroComodin = unId(idsSegunEspecs([...jugador(estado, "beto").mano], ["comodin"]));
    // el trío de la mesa 0 ya tiene un comodín: no admite otro
    expect(codigo(pegar(estado, "beto", idOtroComodin, 0))).toBe("PEGAR_INVALIDO");
    // el trío de la mesa 1 no tiene comodín: sí admite
    estado = ok(pegar(estado, "beto", idOtroComodin, 1));
    expect(estado.mesa[1]?.combinacion.cartas).toHaveLength(4);
    // pegar una carta del número del trío
    const idSiete = unId(idsSegunEspecs([...jugador(estado, "beto").mano], [n("picas", 7)]));
    estado = ok(pegar(estado, "beto", idSiete, 0));
    expect(estado.mesa[0]?.combinacion.cartas).toHaveLength(4);
    // pegar una carta de otro número: prohibido
    const idRey = unId(idsSegunEspecs([...jugador(estado, "beto").mano], [n("treboles", 13)]));
    expect(codigo(pegar(estado, "beto", idRey, 1))).toBe("PEGAR_INVALIDO");
    // y termina su turno
    const idTresDiamantes = unId(idsSegunEspecs([...jugador(estado, "beto").mano], [n("diamantes", 3)]));
    estado = ok(descartar(estado, "beto", idTresDiamantes));
    expect(estado.turno.jugadorId).toBe("ana");
  });

  it("no se puede iniciar la mano siguiente con la actual en curso", () => {
    const estado = partidaMano1();
    const resultado = iniciarSiguienteManoConMazo(estado, []);
    expect(codigo(resultado)).toBe("MANO_EN_CURSO");
  });

  it("ganadores() está vacío mientras la partida no termine", () => {
    expect(ganadores(partidaMano1())).toEqual([]);
  });
});

describe("pegar a escalas (mano 2)", () => {
  it("extiende por ambos extremos, acepta comodín por el extremo pedido y respeta la pinta", () => {
    // Mano 1 relámpago: beto baja 12 cartas en 2 tríos y descarta la robada.
    let estado = ok(
      crearPartidaConMazo(
        DATOS,
        mazoParaDos({
          manoP0: "relleno",
          manoP1: [
            n("corazones", 7), n("diamantes", 7), n("treboles", 7), n("picas", 7),
            n("corazones", 7), n("diamantes", 7),
            n("corazones", 9), n("diamantes", 9), n("treboles", 9), n("picas", 9),
            n("corazones", 9), n("diamantes", 9),
          ],
          pozo: n("treboles", 4),
          robos: [n("treboles", 3)],
        }),
      ),
    );
    estado = ok(robarDelMazo(estado, "beto"));
    const cartasBeto = [...jugador(estado, "beto").mano];
    estado = ok(
      bajarse(estado, "beto", [
        { tipo: "trio", cartaIds: idsSegunEspecs(cartasBeto, [n("corazones", 7), n("diamantes", 7), n("treboles", 7), n("picas", 7), n("corazones", 7), n("diamantes", 7)]) },
        { tipo: "trio", cartaIds: idsSegunEspecs(cartasBeto, [n("corazones", 9), n("diamantes", 9), n("treboles", 9), n("picas", 9), n("corazones", 9), n("diamantes", 9)]) },
      ]),
    );
    estado = ok(descartar(estado, "beto", unId(idsSegunEspecs([...jugador(estado, "beto").mano], [n("treboles", 3)]))));
    expect(estado.fase).toBe("manoTerminada");
    expect(estado.ganadorManoId).toBe("beto");

    // Mano 2: abre ana con 1 trío + 1 escala.
    estado = ok(
      iniciarSiguienteManoConMazo(
        estado,
        mazoParaDos({
          manoP0: [
            n("corazones", 13), n("diamantes", 13), n("treboles", 13),
            n("diamantes", 5), n("diamantes", 6), n("diamantes", 7), n("diamantes", 8),
            n("diamantes", 4), n("diamantes", 9), "comodin",
            n("picas", 2), n("picas", 3),
          ],
          manoP1: "relleno",
          pozo: n("treboles", 11),
          robos: [n("picas", 10), n("treboles", 1), n("corazones", 10)],
        }),
      ),
    );
    expect(estado.manoActual).toBe(2);
    expect(estado.turno.jugadorId).toBe("ana");

    estado = ok(robarDelMazo(estado, "ana"));
    const cartasAna = [...jugador(estado, "ana").mano];
    estado = ok(
      bajarse(estado, "ana", [
        { tipo: "trio", cartaIds: idsSegunEspecs(cartasAna, [n("corazones", 13), n("diamantes", 13), n("treboles", 13)]) },
        { tipo: "escala", cartaIds: idsSegunEspecs(cartasAna, [n("diamantes", 5), n("diamantes", 6), n("diamantes", 7), n("diamantes", 8)]) },
      ]),
    );
    estado = ok(descartar(estado, "ana", unId(idsSegunEspecs([...jugador(estado, "ana").mano], [n("picas", 2)]))));

    // turno de beto: roba del mazo y descarta esa misma carta
    const antesBeto = jugador(estado, "beto").mano;
    estado = ok(robarDelMazo(estado, "beto"));
    const robadaBeto = cartaRobada(antesBeto, jugador(estado, "beto").mano);
    estado = ok(descartar(estado, "beto", robadaBeto.id));

    // ana, turno siguiente al de su bajada: pega a la escala (mesa[1])
    estado = ok(robarDelMazo(estado, "ana"));
    const id4 = unId(idsSegunEspecs([...jugador(estado, "ana").mano], [n("diamantes", 4)]));
    estado = ok(pegar(estado, "ana", id4, 1));
    expect(estado.mesa[1]?.combinacion.cartas[0]?.id).toBe(id4); // por el inicio
    const id9 = unId(idsSegunEspecs([...jugador(estado, "ana").mano], [n("diamantes", 9)]));
    estado = ok(pegar(estado, "ana", id9, 1));
    expect(estado.mesa[1]?.combinacion.cartas.at(-1)?.id).toBe(id9); // por el fin
    // comodín por el extremo pedido (la escala aún no tiene comodines)
    const idComodin = unId(idsSegunEspecs([...jugador(estado, "ana").mano], ["comodin"]));
    estado = ok(pegar(estado, "ana", idComodin, 1, "inicio"));
    expect(estado.mesa[1]?.combinacion.cartas[0]?.tipo).toBe("comodin");
    // una carta de otra pinta no extiende la escala
    const id10Picas = unId(idsSegunEspecs([...jugador(estado, "ana").mano], [n("picas", 10)]));
    expect(codigo(pegar(estado, "ana", id10Picas, 1))).toBe("PEGAR_INVALIDO");
    // tampoco se pega a un trío una carta de otro número
    expect(codigo(pegar(estado, "ana", id10Picas, 0))).toBe("PEGAR_INVALIDO");
    estado = ok(descartar(estado, "ana", unId(idsSegunEspecs([...jugador(estado, "ana").mano], [n("picas", 3)]))));
    expect(estado.fase).toBe("jugandoMano");
  });
});

describe("reposición del mazo desde el pozo", () => {
  it("al agotarse el mazo, se conserva la cima del pozo y el resto pasa a ser mazo", () => {
    const c1 = crearCartaNormal("corazones", 3, "a");
    const c2 = crearCartaNormal("picas", 8, "a");
    const c3 = crearCartaNormal("treboles", 11, "a");
    const enManoAna = crearCartaNormal("diamantes", 5, "a");
    const enManoBeto = crearCartaNormal("diamantes", 6, "a");
    const estado: EstadoPartida = {
      jugadores: [
        { id: "ana", nombre: "Ana", mano: [enManoAna], puntosAcumulados: 0, turnoEnQueSeBajo: null },
        { id: "beto", nombre: "Beto", mano: [enManoBeto], puntosAcumulados: 0, turnoEnQueSeBajo: null },
      ],
      manoActual: 1,
      mazo: [],
      pozo: [c1, c2, c3],
      mesa: [],
      turno: { jugadorId: "ana", fase: "robar", numero: 5 },
      repartidorIdx: 0,
      fase: "jugandoMano",
      ganadorManoId: null,
    };
    const resultado = ok(robarDelMazo(estado, "ana"));
    // c3 (cima del pozo) se conserva; c2 (última descartada del resto) se roba primero
    expect(jugador(resultado, "ana").mano.map((c) => c.id)).toEqual([enManoAna.id, c2.id]);
    expect(resultado.pozo.map((c) => c.id)).toEqual([c3.id]);
    expect(resultado.mazo.map((c) => c.id)).toEqual([c1.id]);
  });
});

describe("pasarTurno", () => {
  it("avanza al siguiente jugador y sube el número, sin tocar cartas ni puntaje", () => {
    const estado = ok(crearPartida(DATOS, crearGeneradorSemilla(99)));
    // En la mano 1 abre Beto (siguiente del repartidor 0).
    expect(estado.turno).toEqual({ jugadorId: "beto", fase: "robar", numero: 1 });

    const pasado = ok(pasarTurno(estado, "beto"));
    expect(pasado.turno).toEqual({ jugadorId: "ana", fase: "robar", numero: 2 });
    // Manos, mazo, pozo, mesa y puntajes intactos: pasar no mueve ninguna carta.
    expect(pasado.jugadores.map((j) => j.mano)).toEqual(estado.jugadores.map((j) => j.mano));
    expect(pasado.mazo).toEqual(estado.mazo);
    expect(pasado.pozo).toEqual(estado.pozo);
    expect(pasado.mesa).toEqual(estado.mesa);
    expect(pasado.jugadores.map((j) => j.puntosAcumulados)).toEqual(
      estado.jugadores.map((j) => j.puntosAcumulados),
    );
  });

  it("rechaza pasar fuera de turno", () => {
    const estado = ok(crearPartida(DATOS, crearGeneradorSemilla(99)));
    expect(codigo(pasarTurno(estado, "ana"))).toBe("NO_ES_TU_TURNO");
  });

  it("rechaza pasar si la mano no está en curso", () => {
    const estado = ok(crearPartida(DATOS, crearGeneradorSemilla(99)));
    const terminada: EstadoPartida = { ...estado, fase: "manoTerminada" };
    expect(codigo(pasarTurno(terminada, "beto"))).toBe("FASE_INCORRECTA");
  });
});
