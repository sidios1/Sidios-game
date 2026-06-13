// Apoyo de pruebas: guion determinista de las 9 manos y un conductor de
// clientes guionizados que juega una partida completa contra el orquestador
// a través de CUALQUIER TransporteCliente (memoria o LAN: el mismo conductor
// sirve para los dos tests, que es justamente lo que valida la costura).
//
// Importa los helpers de mazos apilados directo del src de carioca-core
// (no son parte de su API pública); solo se permite aquí, en código de test.

import type { Carta, TipoCombinacion } from "@juegos/carioca-core";
import { crearMazoCompleto } from "@juegos/carioca-core";
import type { EspecCarta } from "../../../carioca-core/src/apoyoPruebas.js";
import {
  coincide,
  idsSegunEspecs,
  mazoParaDos,
  n,
} from "../../../carioca-core/src/apoyoPruebas.js";
import type {
  MensajeCliente,
  MensajeServidor,
} from "../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../protocolo.js";
import type { TransporteCliente } from "../transporte.js";
import type { VistaPartida } from "../vista.js";

interface GuionCombinacion {
  readonly tipo: TipoCombinacion;
  readonly especs: readonly EspecCarta[];
}

/**
 * Guion de cada mano (mismo patrón que partidaCompleta.test.ts del core):
 * quien abre recibe el contrato completo en el reparto, roba, se baja y
 * (salvo cierre automático) descarta la robada, cerrando en su primer turno.
 */
export interface GuionMano {
  readonly ganadorIdx: 0 | 1;
  readonly manoGanador: readonly EspecCarta[];
  readonly pozo: EspecCarta;
  readonly robo: EspecCarta;
  readonly propuesta: readonly GuionCombinacion[];
  readonly descarte: EspecCarta | null; // null = gana sin descartar (sucia/real)
}

export const GUIONES: readonly GuionMano[] = [
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

/** Mazos apilados por número de mano, para inyectar en el orquestador. */
export function fabricaMazoParaMano(
  guiones: readonly GuionMano[],
): (numeroMano: number) => readonly Carta[] {
  return (numeroMano) => {
    const guion = guiones[numeroMano - 1];
    if (guion === undefined) {
      throw new Error(`el guion no cubre la mano ${numeroMano}`);
    }
    return mazoParaDos({
      manoP0: guion.ganadorIdx === 0 ? guion.manoGanador : "relleno",
      manoP1: guion.ganadorIdx === 1 ? guion.manoGanador : "relleno",
      pozo: guion.pozo,
      robos: [guion.robo],
    });
  };
}

/**
 * Variante de mazoParaDos para 2-4 jugadores: el ganador recibe la mano
 * especificada y el resto, relleno. Mismo orden de salida que el reparto del
 * core: manos en bloque desde la cima, luego el pozo y después los robos.
 */
export function mazoApilado(
  numJugadores: number,
  opciones: {
    readonly ganadorIdx: number;
    readonly manoGanador: readonly EspecCarta[];
    readonly pozo: EspecCarta;
    readonly robos: readonly EspecCarta[];
  },
): Carta[] {
  // 2–4 jugadores → 2 mazos (108 cartas); el pool calza con el del core.
  const pool = crearMazoCompleto(numJugadores);
  const sacar = (espec: EspecCarta): Carta => {
    const idx = pool.findIndex((carta) => coincide(carta, espec));
    if (idx === -1) {
      throw new Error(`carta agotada en el mazo apilado: ${JSON.stringify(espec)}`);
    }
    const carta = pool[idx];
    if (carta === undefined) throw new Error("extracción imposible del mazo apilado");
    pool.splice(idx, 1);
    return carta;
  };
  const manoGanador = opciones.manoGanador.map(sacar);
  const cartaPozo = sacar(opciones.pozo);
  const robos = opciones.robos.map(sacar);
  const manos: Carta[][] = [];
  for (let i = 0; i < numJugadores; i++) {
    manos.push(i === opciones.ganadorIdx ? manoGanador : pool.splice(0, 12));
  }
  const salida = [...manos.flat(), cartaPozo, ...robos];
  return [...pool, ...salida.reverse()];
}

// ── Verificación de información oculta ──────────────────────────────────────

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function recolectarIdsDeCartas(valor: unknown, ids: Set<string>): void {
  if (Array.isArray(valor)) {
    for (const item of valor) recolectarIdsDeCartas(item, ids);
    return;
  }
  if (!esRegistro(valor)) return;
  const id = valor["id"];
  if (
    (valor["tipo"] === "normal" || valor["tipo"] === "comodin") &&
    typeof id === "string"
  ) {
    ids.add(id);
  }
  for (const interno of Object.values(valor)) {
    recolectarIdsDeCartas(interno, ids);
  }
}

/**
 * Toda carta presente en el JSON de la vista debe ser visible para su dueño:
 * la propia mano, la mesa o el tope del pozo. Si aparece cualquier otra,
 * el orquestador filtró información ajena.
 */
export function cartasFiltradasEnVista(vista: VistaPartida): readonly string[] {
  const visibles = new Set<string>([
    ...vista.tuMano.map((c) => c.id),
    ...vista.mesa.flatMap((m) => m.combinacion.cartas.map((c) => c.id)),
  ]);
  if (vista.pozoTope !== null) visibles.add(vista.pozoTope.id);
  const presentes = new Set<string>();
  recolectarIdsDeCartas(vista, presentes);
  return [...presentes].filter((id) => !visibles.has(id));
}

// ── Conductor de clientes guionizados ───────────────────────────────────────

export interface RegistroCliente {
  readonly jugadorId: string;
  readonly vistas: readonly VistaPartida[];
  readonly errores: readonly { codigo: string; mensaje: string }[];
}

interface EstadoConductor {
  jugadorId: string;
  readonly indice: number;
  readonly vistas: VistaPartida[];
  readonly errores: { codigo: string; mensaje: string }[];
  readonly manosVotadas: Set<number>;
}

function primerId(ids: readonly string[]): string {
  const primero = ids[0];
  if (primero === undefined) throw new Error("lista de ids vacía");
  return primero;
}

/** Decide la siguiente jugada según el guion, o null si no toca actuar. */
function reaccionar(
  yo: EstadoConductor,
  vista: VistaPartida,
  guiones: readonly GuionMano[],
): MensajeCliente | null {
  if (vista.fase === "manoTerminada") {
    if (yo.manosVotadas.has(vista.manoActual)) return null;
    yo.manosVotadas.add(vista.manoActual);
    return { tipo: "listoSiguienteMano" };
  }
  if (vista.fase !== "jugandoMano") return null;
  if (vista.turno.jugadorId !== yo.jugadorId) return null;
  const guion = guiones[vista.manoActual - 1];
  if (guion === undefined) {
    throw new Error(`el guion no cubre la mano ${vista.manoActual}`);
  }
  if (guion.ganadorIdx !== yo.indice) return null;
  if (vista.turno.fase === "robar") {
    return { tipo: "robarDelMazo" };
  }
  const yoEnVista = vista.jugadores.find((j) => j.id === yo.jugadorId);
  if (yoEnVista === undefined) {
    throw new Error("el conductor no aparece en su propia vista");
  }
  if (!yoEnVista.seBajo) {
    const disponibles: Carta[] = [...vista.tuMano];
    return {
      tipo: "bajarse",
      propuesta: guion.propuesta.map((parte) => ({
        tipo: parte.tipo,
        cartaIds: idsSegunEspecs(disponibles, parte.especs),
      })),
    };
  }
  if (guion.descarte === null) return null;
  return {
    tipo: "descartar",
    cartaId: primerId(idsSegunEspecs([...vista.tuMano], [guion.descarte])),
  };
}

/**
 * Conecta los clientes a la sala, juega la partida completa según los
 * guiones y devuelve todo lo que cada cliente recibió. Funciona sobre
 * cualquier TransporteCliente: memoria o LAN.
 */
export async function jugarPartidaGuionizada(
  codigo: string,
  clientes: readonly TransporteCliente[],
  guiones: readonly GuionMano[],
): Promise<readonly RegistroCliente[]> {
  const conductores: EstadoConductor[] = clientes.map((_, indice) => ({
    jugadorId: "",
    indice,
    vistas: [],
    errores: [],
    manosVotadas: new Set<number>(),
  }));
  const bienvenidas: Promise<void>[] = [];
  const finales: Promise<void>[] = [];

  for (const [indice, cliente] of clientes.entries()) {
    const yo = conductores[indice];
    if (yo === undefined) throw new Error("conductor sin estado");
    let resolverBienvenida = () => {};
    let resolverFinal = () => {};
    let rechazarFinal: (error: Error) => void = () => {};
    bienvenidas.push(new Promise<void>((res) => (resolverBienvenida = res)));
    finales.push(
      new Promise<void>((res, rej) => {
        resolverFinal = res;
        rechazarFinal = rej;
      }),
    );

    const alRecibir = (datos: string): void => {
      const mensaje: MensajeServidor | null = analizarMensajeServidor(datos);
      if (mensaje === null) {
        rechazarFinal(new Error(`mensaje de servidor ilegible: ${datos}`));
        return;
      }
      switch (mensaje.tipo) {
        case "bienvenida":
          yo.jugadorId = mensaje.jugadorId;
          resolverBienvenida();
          return;
        case "estadoSala":
        case "salaCerrada":
          return;
        case "error":
          yo.errores.push({ codigo: mensaje.codigo, mensaje: mensaje.mensaje });
          rechazarFinal(
            new Error(`error del servidor: ${mensaje.codigo} — ${mensaje.mensaje}`),
          );
          return;
        case "vista": {
          yo.vistas.push(mensaje.vista);
          if (mensaje.vista.fase === "partidaTerminada") {
            resolverFinal();
            return;
          }
          const jugada = reaccionar(yo, mensaje.vista, guiones);
          if (jugada !== null) {
            cliente.enviar(serializarCliente(jugada));
          }
          return;
        }
      }
    };

    await cliente.conectar(codigo, {
      alRecibir,
      alDesconectar: () => {},
    });
    cliente.enviar(
      serializarCliente({ tipo: "unirse", nombre: `Jugador ${indice + 1}` }),
    );
  }

  await Promise.all(bienvenidas);
  const anfitrion = clientes[0];
  if (anfitrion === undefined) throw new Error("no hay clientes");
  anfitrion.enviar(serializarCliente({ tipo: "iniciarPartida" }));
  await Promise.all(finales);
  return conductores.map((c) => ({
    jugadorId: c.jugadorId,
    vistas: c.vistas,
    errores: c.errores,
  }));
}
