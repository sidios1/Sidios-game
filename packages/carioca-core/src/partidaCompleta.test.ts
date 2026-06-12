import { describe, expect, it } from "vitest";
import type { EspecCarta } from "./apoyoPruebas.js";
import { idsSegunEspecs, mazoParaDos, n } from "./apoyoPruebas.js";
import type { TipoCombinacion } from "./combinaciones.js";
import { MANOS } from "./contratos.js";
import type {
  EstadoPartida,
  PropuestaCombinacion,
  Resultado,
} from "./partida.js";
import {
  bajarse,
  crearPartidaConMazo,
  descartar,
  ganadores,
  iniciarSiguienteManoConMazo,
  robarDelMazo,
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

interface GuionCombinacion {
  readonly tipo: TipoCombinacion;
  readonly especs: readonly EspecCarta[];
}

/**
 * Guion de cada mano: quien abre recibe el contrato completo en el reparto,
 * roba una carta, se baja y (salvo cierre automático) descarta la robada,
 * cerrando la mano en su primer turno.
 */
interface GuionMano {
  readonly ganadorIdx: 0 | 1;
  readonly manoGanador: readonly EspecCarta[];
  readonly pozo: EspecCarta;
  readonly robo: EspecCarta;
  readonly propuesta: readonly GuionCombinacion[];
  readonly descarte: EspecCarta | null; // null = gana sin descartar (sucia/real)
}

const GUIONES: readonly GuionMano[] = [
  {
    // Mano 1 — 2 tríos (uno con comodín)
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
    // Mano 2 — 1 trío + 1 escala
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
      {
        tipo: "escala",
        especs: [
          n("diamantes", 4), n("diamantes", 5), n("diamantes", 6), n("diamantes", 7), n("diamantes", 8),
          n("diamantes", 9), n("diamantes", 10), n("diamantes", 11), n("diamantes", 12),
        ],
      },
    ],
    descarte: n("treboles", 2),
  },
  {
    // Mano 3 — 2 escalas (una con As puente: Q-K-A-2-3-4)
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
    // Mano 4 — 3 tríos
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
    // Mano 5 — 2 tríos + 1 escala
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
    // Mano 6 — 1 trío + 2 escalas
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
    // Mano 7 — 3 escalas
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
    // Mano 8 — escala sucia: la 13ª carta robada cierra sin descartar
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
    // Mano 9 — escala real: misma pinta, sin comodín, cierre sin descartar
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

describe("partida completa", () => {
  it("se juega de la mano 1 a la 9, con comodines, As puente, cierres automáticos y puntaje", () => {
    expect(GUIONES).toHaveLength(MANOS.length);
    const puntosEsperados = new Map<string, number>([
      ["ana", 0],
      ["beto", 0],
    ]);
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
      expect(estado.manoActual).toBe(numero);
      expect(estado.fase).toBe("jugandoMano");

      const ganadorId = guion.ganadorIdx === 0 ? "ana" : "beto";
      const perdedorId = guion.ganadorIdx === 0 ? "beto" : "ana";
      // el reparto rota: abre (y en este guion gana) el siguiente al repartidor
      expect(estado.turno.jugadorId).toBe(ganadorId);
      const manoPerdedor = jugador(estado, perdedorId).mano;
      expect(manoPerdedor).toHaveLength(12);

      estado = ok(robarDelMazo(estado, ganadorId));
      const disponibles = [...jugador(estado, ganadorId).mano];
      const propuesta: PropuestaCombinacion[] = guion.propuesta.map((parte) => ({
        tipo: parte.tipo,
        cartaIds: idsSegunEspecs(disponibles, parte.especs),
      }));
      estado = ok(bajarse(estado, ganadorId, propuesta));
      if (guion.descarte !== null) {
        const idDescarte = unId(
          idsSegunEspecs([...jugador(estado, ganadorId).mano], [guion.descarte]),
        );
        estado = ok(descartar(estado, ganadorId, idDescarte));
      }

      // la mano termina (en sucia/real, sin haber descartado)
      expect(estado.fase).toBe(numero === MANOS.length ? "partidaTerminada" : "manoTerminada");
      expect(estado.ganadorManoId).toBe(ganadorId);
      expect(jugador(estado, ganadorId).mano).toHaveLength(0);

      // §7: quien cierra suma 0; el otro suma las cartas que le quedaron
      const acumulado = (puntosEsperados.get(perdedorId) ?? 0) + puntosMano(manoPerdedor);
      puntosEsperados.set(perdedorId, acumulado);
      expect(jugador(estado, perdedorId).puntosAcumulados).toBe(acumulado);
      expect(jugador(estado, ganadorId).puntosAcumulados).toBe(
        puntosEsperados.get(ganadorId) ?? 0,
      );
    }

    if (estado === null) throw new Error("la partida no se jugó");
    const minimo = Math.min(
      ...[...puntosEsperados.values()],
    );
    const esperadosGanadores = estado.jugadores
      .filter((j) => (puntosEsperados.get(j.id) ?? -1) === minimo)
      .map((j) => j.id);
    expect(ganadores(estado).map((j) => j.id)).toEqual(esperadosGanadores);
  });
});
