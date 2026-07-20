import { describe, expect, it } from "vitest";
import {
  crearGeneradorSemilla,
  crearCartaNormal,
  PINTAS,
  VALORES,
  type Carta,
} from "@juegos/carioca-core";
import { CONFIG_DEFAULT, type ConfigRumble, type HabilidadId } from "@juegos/rumble-core";
import type { MetaSala } from "../../vista.js";
import type { VistaJuego } from "../../vistaJuego.js";
import { crearMotorRumble } from "./motorRumble.js";
import { armarTestigoToco, MISION_TOCO } from "./misionToco.js";
import type { AccionRumble, EstadoRumble } from "./estadoRumble.js";
import type { VistaRumble } from "./vistaRumble.js";

const META: MetaSala = {
  estados: new Map(),
  anfitrionId: "ana",
  listos: new Set(),
  votosNecesarios: 2,
};

const JUGADORES = [
  { id: "ana", nombre: "Ana" },
  { id: "beto", nombre: "Beto" },
];

/** Producto pinta × valor, para buscar una carta que una mano NO tenga. */
const VALORES_Y_PINTAS = PINTAS.flatMap((pinta) => VALORES.map((valor) => ({ pinta, valor })));

function motorYEstado(
  overrides?: Partial<ConfigRumble> | "sinConfig",
  seed = 1,
): { motor: ReturnType<typeof crearMotorRumble>; estado: EstadoRumble } {
  const motor = crearMotorRumble({ rng: crearGeneradorSemilla(7) });
  const config: unknown =
    overrides === "sinConfig" || overrides === undefined
      ? undefined
      : { ...CONFIG_DEFAULT, ...overrides };
  const res = motor.crear(JUGADORES, crearGeneradorSemilla(seed), config);
  if (!res.ok) throw new Error(`crear falló: ${res.error.mensaje}`);
  return { motor, estado: res.valor };
}

function vistaRumble(vista: VistaJuego): VistaRumble {
  if (!("rumble" in vista)) throw new Error("no es una VistaRumble");
  return vista;
}

function parsear(
  motor: ReturnType<typeof crearMotorRumble>,
  crudo: Record<string, unknown>,
): AccionRumble {
  const a = motor.parsearAccion({ tipo: String(crudo["tipo"]), ...crudo });
  if (a === null) throw new Error(`parseo nulo: ${JSON.stringify(crudo)}`);
  return a;
}

describe("MotorRumble — delegación y estado", () => {
  it("crea con config default: asigna una habilidad a cada jugador y guarda el slice", () => {
    const { estado } = motorYEstado("sinConfig");
    expect(estado.base.fase).toBe("jugandoMano");
    expect(Object.keys(estado.slice.asignaciones).sort()).toEqual(["ana", "beto"]);
    for (const id of ["ana", "beto"]) {
      expect(estado.slice.asignaciones[id]?.length).toBe(1);
    }
  });

  it("delega una acción base (robarDelMazo) sin regresión y conserva el slice", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["MISH"] });
    const enTurno = estado.base.turno.jugadorId;
    const manosAntes = estado.base.jugadores.find((j) => j.id === enTurno)?.mano.length ?? 0;
    const res = motor.aplicarAccion(estado, enTurno, parsear(motor, { tipo: "robarDelMazo" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const manosDespues = res.valor.base.jugadores.find((j) => j.id === enTurno)?.mano.length ?? 0;
    expect(manosDespues).toBe(manosAntes + 1);
    expect(res.valor.base.turno.fase).toBe("descartar");
    // El slice sigue presente (sobrevive a cada transición → y a la reconexión).
    expect(res.valor.slice.asignaciones[enTurno]).toEqual(["MISH"]);
  });
});

describe("MotorRumble — config-threading (autoridad)", () => {
  it("rechaza una config con forma inválida", () => {
    const motor = crearMotorRumble();
    const res = motor.crear(JUGADORES, crearGeneradorSemilla(1), { basura: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.codigo).toBe("CONFIG_INVALIDA");
  });

  it("rechaza una config inviable (pool vacío)", () => {
    const motor = crearMotorRumble();
    const res = motor.crear(JUGADORES, crearGeneradorSemilla(1), {
      ...CONFIG_DEFAULT,
      poolActivo: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.codigo).toBe("CONFIG_INVALIDA");
  });

  it("sin config usa el default (18 habilidades en el pool)", () => {
    const { estado } = motorYEstado("sinConfig");
    expect(estado.slice.config.poolActivo.length).toBe(18);
  });
});

describe("MotorRumble — revelaciones por solicitante", () => {
  it("SAPO revela 4 cartas SOLO en la vista del solicitante", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["SAPO"] });
    const res = motor.aplicarAccion(estado, "ana", parsear(motor, { tipo: "rumble/sapo", objetivoId: "beto" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const vAna = vistaRumble(motor.construirVista(res.valor, "ana", META));
    const vBeto = vistaRumble(motor.construirVista(res.valor, "beto", META));
    expect(vAna.rumble.sapo?.objetivoId).toBe("beto");
    expect(vAna.rumble.sapo?.cartas.length).toBe(4);
    expect(vBeto.rumble.sapo).toBeUndefined();
  });

  it("PESAO invierte el pozo para los no-dueños sin cambiar numeroPozo", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["PESAO"] });
    // Forzamos que solo ana tenga PESAO para observar la inversión.
    const conPesao: EstadoRumble = { ...estado, slice: { ...estado.slice, pesao: ["ana"] } };
    const vAna = vistaRumble(motor.construirVista(conPesao, "ana", META));
    const vBeto = vistaRumble(motor.construirVista(conPesao, "beto", META));
    expect(vAna.pozoTope).not.toBeNull(); // el dueño ve el foso
    expect(vBeto.pozoTope).toBeNull(); // el resto no
    expect(vBeto.numeroPozo).toBe(vAna.numeroPozo); // no filtra de más
  });
});

describe("MotorRumble — validación de autoridad", () => {
  it("rechaza usar una habilidad no asignada", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["MISH"] });
    const res = motor.aplicarAccion(estado, "ana", parsear(motor, { tipo: "rumble/sapo", objetivoId: "beto" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.codigo).toBe("HABILIDAD_NO_ASIGNADA");
  });

  it("rechaza GUASON fuera de su ventana (turno.numero > 3)", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["GUASON"] });
    const tarde: EstadoRumble = {
      ...estado,
      base: { ...estado.base, turno: { ...estado.base.turno, numero: 4 } },
    };
    const res = motor.aplicarAccion(tarde, "ana", parsear(motor, { tipo: "rumble/guason", pinta: "picas" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.codigo).toBe("FUERA_DE_VENTANA");
  });

  it("GUASON acuña un comodín-de-pinta dentro de la ventana", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["GUASON"] });
    const res = motor.aplicarAccion(estado, "ana", parsear(motor, { tipo: "rumble/guason", pinta: "corazones" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ana = res.valor.base.jugadores.find((j) => j.id === "ana");
    expect(ana?.mano.some((c) => c.tipo === "comodinPinta")).toBe(true);
  });
});

describe("MotorRumble — hooks de turno y puntaje", () => {
  // Construye un estado donde `ana` está por descartar su última carta y cerrar.
  function estadoCierreInminente(
    pool: readonly HabilidadId[],
    manoBeto: readonly Carta[],
    slicePatch?: Partial<EstadoRumble["slice"]>,
  ): { motor: ReturnType<typeof crearMotorRumble>; estado: EstadoRumble; cartaAna: Carta } {
    const { motor, estado } = motorYEstado({ poolActivo: [...pool] });
    const cartaAna = crearCartaNormal("treboles", 3, "ana-x");
    const estado2: EstadoRumble = {
      ...estado,
      base: {
        ...estado.base,
        jugadores: estado.base.jugadores.map((j) =>
          j.id === "ana" ? { ...j, mano: [cartaAna] } : { ...j, mano: manoBeto },
        ),
        turno: { jugadorId: "ana", fase: "descartar", numero: 5 },
      },
      slice: { ...estado.slice, ...slicePatch },
    };
    return { motor, estado: estado2, cartaAna };
  }

  it("DOBLE duplica el puntaje de los rivales cuando el dueño gana", () => {
    const manoBeto = [crearCartaNormal("picas", 5, "b1"), crearCartaNormal("picas", 7, "b2")]; // 12 pts
    const { motor, estado, cartaAna } = estadoCierreInminente(["DOBLE"], manoBeto, {
      doble: ["ana"],
    });
    const res = motor.aplicarAccion(estado, "ana", parsear(motor, { tipo: "descartar", cartaId: cartaAna.id }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.ganadorManoId).toBe("ana");
    const beto = res.valor.base.jugadores.find((j) => j.id === "beto");
    // 12 (cierre normal) + 12 (DOBLE) = 24.
    expect(beto?.puntosAcumulados).toBe(24);
  });

  it("OJO salta el turno del que iba a cerrar y le da 1 carta de compensación", () => {
    const manoBeto = [crearCartaNormal("picas", 5, "b1")];
    const { motor, estado, cartaAna } = estadoCierreInminente(["OJO"], manoBeto, {
      ojoArmado: ["beto"],
    });
    const res = motor.aplicarAccion(estado, "ana", parsear(motor, { tipo: "descartar", cartaId: cartaAna.id }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // No cerró: OJO revirtió el cierre.
    expect(res.valor.base.fase).toBe("jugandoMano");
    expect(res.valor.base.ganadorManoId).toBeNull();
    const ana = res.valor.base.jugadores.find((j) => j.id === "ana");
    // Conserva su carta (no descartó) + 1 de compensación.
    expect(ana?.mano.length).toBe(2);
    // El turno pasó (ya no es de ana).
    expect(res.valor.base.turno.jugadorId).not.toBe("ana");
    // OJO consumido.
    expect(res.valor.slice.ojoArmado).not.toContain("beto");
  });

  it("EXTRA (perder turno): al volver el turno al que la usó, se salta", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["EXTRA"], penalizacionExtra: "perderTurno" });
    // beto en turno (fase descartar) con una carta; ana marcada para perder turno.
    const cartaBeto = crearCartaNormal("treboles", 4, "b-x");
    const estado2: EstadoRumble = {
      ...estado,
      base: {
        ...estado.base,
        jugadores: estado.base.jugadores.map((j) =>
          j.id === "beto"
            ? { ...j, mano: [cartaBeto, crearCartaNormal("treboles", 9, "b-y")] }
            : j,
        ),
        turno: { jugadorId: "beto", fase: "descartar", numero: 5 },
      },
      slice: { ...estado.slice, saltarProximoTurno: ["ana"] },
    };
    const res = motor.aplicarAccion(estado2, "beto", parsear(motor, { tipo: "descartar", cartaId: cartaBeto.id }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // beto descarta → tocaría ana, pero ana pierde el turno → vuelve a beto.
    expect(res.valor.base.turno.jugadorId).toBe("beto");
    expect(res.valor.slice.saltarProximoTurno).not.toContain("ana");
  });

  it("EXTRA (descartar2): roba 2 y exige un descarte extra antes de pasar el turno", () => {
    const { motor, estado } = motorYEstado({ poolActivo: ["EXTRA"], penalizacionExtra: "descartar2" });
    const enTurno = estado.base.turno.jugadorId; // fase "robar"
    const r1 = motor.aplicarAccion(estado, enTurno, parsear(motor, { tipo: "rumble/extra" }));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const tras = r1.valor.base.jugadores.find((j) => j.id === enTurno);
    expect(tras?.mano.length).toBe(14); // 12 + 2
    expect(r1.valor.slice.descartesPendientes[enTurno]).toBe(1);
    expect(r1.valor.base.turno.fase).toBe("descartar");

    // Primer descarte = penalización (no pasa el turno).
    const carta1 = tras?.mano[0];
    const r2 = motor.aplicarAccion(r1.valor, enTurno, parsear(motor, { tipo: "descartar", cartaId: carta1?.id ?? "" }));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.valor.base.turno.jugadorId).toBe(enTurno); // sigue su turno
    expect(r2.valor.slice.descartesPendientes[enTurno]).toBe(0);

    // Segundo descarte = normal (pasa el turno).
    const carta2 = r2.valor.base.jugadores.find((j) => j.id === enTurno)?.mano[0];
    const r3 = motor.aplicarAccion(r2.valor, enTurno, parsear(motor, { tipo: "descartar", cartaId: carta2?.id ?? "" }));
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.valor.base.turno.jugadorId).not.toBe(enTurno);
  });
});

describe("MotorRumble — condición de victoria sustituida (TOCO / EXODIA)", () => {
  // Mano 1 = "2 tríos". Damos a ana justo eso + 1 carta suelta, para que bajarse
  // NO vacíe la mano: así el cierre solo puede venir de la condición sustituida.
  const TRIO_A = [
    crearCartaNormal("corazones", 5, "a1"),
    crearCartaNormal("picas", 5, "a2"),
    crearCartaNormal("treboles", 5, "a3"),
  ];
  const TRIO_B = [
    crearCartaNormal("corazones", 9, "a4"),
    crearCartaNormal("picas", 9, "a5"),
    crearCartaNormal("treboles", 9, "a6"),
  ];
  const SUELTA = crearCartaNormal("diamantes", 2, "a7");
  const PROPUESTA_2_TRIOS = [
    { tipo: "trio", cartaIds: TRIO_A.map((c) => c.id) },
    { tipo: "trio", cartaIds: TRIO_B.map((c) => c.id) },
  ];
  // Beto se queda con 12 puntos en la mano, para verificar el puntaje del cierre.
  const MANO_BETO = [crearCartaNormal("picas", 5, "b1"), crearCartaNormal("picas", 7, "b2")];

  /** Ana en turno, ya robó (fase "descartar"), con 2 tríos + 1 suelta. */
  function estadoListoParaBajarse(
    pool: readonly HabilidadId[],
    numeroTurno: number,
    manoAna: readonly Carta[] = [...TRIO_A, ...TRIO_B, SUELTA],
    slicePatch?: Partial<EstadoRumble["slice"]>,
  ): { motor: ReturnType<typeof crearMotorRumble>; estado: EstadoRumble } {
    const { motor, estado } = motorYEstado({ poolActivo: [...pool] });
    return {
      motor,
      estado: {
        ...estado,
        base: {
          ...estado.base,
          jugadores: estado.base.jugadores.map((j) =>
            j.id === "ana" ? { ...j, mano: manoAna } : { ...j, mano: MANO_BETO },
          ),
          turno: { jugadorId: "ana", fase: "descartar", numero: numeroTurno },
        },
        slice: { ...estado.slice, ...slicePatch },
      },
    };
  }

  it("EXODIA: bajarse en la ventana (turno ≤ 3) gana la mano aunque queden cartas", () => {
    const { motor, estado } = estadoListoParaBajarse(["EXODIA"], 3);
    const res = motor.aplicarAccion(
      estado,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: PROPUESTA_2_TRIOS }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.fase).toBe("manoTerminada");
    expect(res.valor.base.ganadorManoId).toBe("ana");
    // Gana con una carta aún en la mano y puntúa 0; beto suma las suyas.
    const ana = res.valor.base.jugadores.find((j) => j.id === "ana");
    expect(ana?.mano.length).toBe(1);
    expect(ana?.puntosAcumulados).toBe(0);
    expect(res.valor.base.jugadores.find((j) => j.id === "beto")?.puntosAcumulados).toBe(12);
  });

  it("EXODIA fuera de la ventana (turno 4) no hace nada: la mano sigue abierta", () => {
    const { motor, estado } = estadoListoParaBajarse(["EXODIA"], 4);
    const res = motor.aplicarAccion(
      estado,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: PROPUESTA_2_TRIOS }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.fase).toBe("jugandoMano");
    expect(res.valor.base.ganadorManoId).toBeNull();
  });

  it("EXODIA no se salta a OJO: el cierre forzado también puede interceptarse", () => {
    const { motor, estado } = estadoListoParaBajarse(["EXODIA", "OJO"], 3, undefined, {
      ojoArmado: ["beto"],
    });
    const conExodia: EstadoRumble = {
      ...estado,
      slice: { ...estado.slice, asignaciones: { ana: ["EXODIA"], beto: ["OJO"] } },
    };
    const res = motor.aplicarAccion(
      conExodia,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: PROPUESTA_2_TRIOS }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.fase).toBe("jugandoMano");
    expect(res.valor.slice.ojoArmado).not.toContain("beto");
  });

  it("TOCO: se valida contra la misión, no contra el contrato de la mano, y gana al cumplirla", () => {
    // La misión fija (§3.3): una escala sucia. Imposible bajo el contrato de la mano 1.
    const mision = MISION_TOCO;
    const testigo = armarTestigoToco();
    // La escala sucia es de cierre automático: la mano son sus 13 cartas, sin sobrante.
    const manoAna = testigo.mano;

    const { motor, estado } = estadoListoParaBajarse(["TOCO"], 5, manoAna, {
      asignaciones: { ana: ["TOCO"], beto: [] },
      misionToco: { ana: mision },
    });

    // Control: esa misma propuesta NO cumple el contrato global de la mano 1.
    const sinToco: EstadoRumble = {
      ...estado,
      slice: { ...estado.slice, asignaciones: { ana: [], beto: [] }, misionToco: {} },
    };
    const control = motor.aplicarAccion(
      sinToco,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: testigo.propuesta }),
    );
    expect(control.ok).toBe(false);
    if (!control.ok) expect(control.error.codigo).toBe("CONTRATO_INVALIDO");

    // Con TOCO: la misión sustituye al contrato y cumplirla cierra la mano.
    const res = motor.aplicarAccion(
      estado,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: testigo.propuesta }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.fase).toBe("manoTerminada");
    expect(res.valor.base.ganadorManoId).toBe("ana");
    expect(res.valor.base.jugadores.find((j) => j.id === "beto")?.puntosAcumulados).toBe(12);
    // El cierre lo hace el core (la misión vacía la mano), pero la victoria de TOCO
    // se sigue anunciando: no se pierde por no pasar por `cerrarManoManual`.
    expect(res.valor.slice.eventos["beto"]?.some((e) => e.tipo === "victoria")).toBe(true);
  });

  it("TOCO: su misión viaja como `contrato` en la vista de su dueño, no en la ajena", () => {
    const mision = MISION_TOCO;
    const { motor, estado } = estadoListoParaBajarse(["TOCO"], 2, undefined, {
      asignaciones: { ana: ["TOCO"], beto: [] },
      misionToco: { ana: mision },
    });
    const vAna = vistaRumble(motor.construirVista(estado, "ana", META));
    const vBeto = vistaRumble(motor.construirVista(estado, "beto", META));
    expect(vAna.contrato).toEqual(mision);
    expect(vAna.rumble.misionToco).toEqual(mision);
    // Beto sigue viendo el contrato real de la mano y no se entera de la misión.
    expect(vBeto.contrato.numero).toBe(1);
    expect(vBeto.rumble.misionToco).toBeUndefined();
  });

  it("NO-REGRESIÓN: sin TOCO ni EXODIA, bajarse deja la mano abierta como siempre", () => {
    const { motor, estado } = estadoListoParaBajarse(["MISH"], 2);
    const res = motor.aplicarAccion(
      estado,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: PROPUESTA_2_TRIOS }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.fase).toBe("jugandoMano");
    expect(res.valor.base.ganadorManoId).toBeNull();
    expect(res.valor.base.mesa.length).toBe(2);
    expect(res.valor.base.jugadores.find((j) => j.id === "ana")?.mano.length).toBe(1);
    // El slice queda intacto: la ruta base no lo toca.
    expect(res.valor.slice).toEqual(estado.slice);
  });

  it("NO-REGRESIÓN: sin TOCO ni EXODIA, vaciar la mano al bajarse cierra como siempre", () => {
    const { motor, estado } = estadoListoParaBajarse(["MISH"], 2, [...TRIO_A, ...TRIO_B]);
    const res = motor.aplicarAccion(
      estado,
      "ana",
      parsear(motor, { tipo: "bajarse", propuesta: PROPUESTA_2_TRIOS }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor.base.fase).toBe("manoTerminada");
    expect(res.valor.base.ganadorManoId).toBe("ana");
  });
});

describe("MotorRumble — PILLO y el robo a ciegas por índice", () => {
  /**
   * Monta un PILLO FALLIDO: el que está en turno adivina una carta que el objetivo
   * no tiene, así queda el pendiente para que el objetivo elija a ciegas.
   */
  function conPilloFallido(): {
    motor: ReturnType<typeof crearMotorRumble>;
    estado: EstadoRumble;
    atacante: string;
    objetivo: string;
  } {
    const { motor, estado } = motorYEstado({ poolActivo: ["PILLO"] });
    const atacante = estado.base.turno.jugadorId;
    const objetivo = JUGADORES.find((j) => j.id !== atacante)?.id ?? "";
    const manoObjetivo = estado.base.jugadores.find((j) => j.id === objetivo)?.mano ?? [];
    // Buscamos una carta normal que el objetivo NO tenga, para garantizar el fallo.
    const inexistente = VALORES_Y_PINTAS.find(
      ({ pinta, valor }) =>
        !manoObjetivo.some((c) => c.tipo === "normal" && c.pinta === pinta && c.valor === valor),
    );
    if (inexistente === undefined) throw new Error("no hay carta ausente que adivinar");
    const propia = estado.base.jugadores.find((j) => j.id === atacante)?.mano[0];
    const res = motor.aplicarAccion(
      estado,
      atacante,
      parsear(motor, {
        tipo: "rumble/pillo",
        objetivoId: objetivo,
        carta: { pinta: inexistente.pinta, valor: inexistente.valor },
        cartaEntregadaId: propia?.id ?? "",
      }),
    );
    if (!res.ok) throw new Error(`pillo falló: ${res.error.mensaje}`);
    return { motor, estado: res.valor, atacante, objetivo };
  }

  it("al fallar deja el pendiente y el objetivo roba por índice posicional", () => {
    const { motor, estado, atacante, objetivo } = conPilloFallido();
    expect(estado.slice.pilloPendiente).toEqual({ victimaId: atacante, ladronId: objetivo });

    const manoAtacante = estado.base.jugadores.find((j) => j.id === atacante)?.mano ?? [];
    const esperada = manoAtacante[2];
    const antesObjetivo = estado.base.jugadores.find((j) => j.id === objetivo)?.mano.length ?? 0;

    const res = motor.aplicarAccion(
      estado,
      objetivo,
      parsear(motor, { tipo: "rumble/pilloRobo", indice: 2 }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const manoObjetivo = res.valor.base.jugadores.find((j) => j.id === objetivo)?.mano ?? [];
    expect(manoObjetivo.length).toBe(antesObjetivo + 1);
    // El índice se resolvió a ESA carta, del lado autoritativo.
    expect(manoObjetivo.some((c) => c.id === esperada?.id)).toBe(true);
    expect(res.valor.base.jugadores.find((j) => j.id === atacante)?.mano.length).toBe(
      manoAtacante.length - 1,
    );
    expect(res.valor.slice.pilloPendiente).toBeNull();
  });

  it("rechaza un índice fuera de rango sin tocar el estado", () => {
    const { motor, estado, objetivo } = conPilloFallido();
    const res = motor.aplicarAccion(
      estado,
      objetivo,
      parsear(motor, { tipo: "rumble/pilloRobo", indice: 999 }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.codigo).toBe("INDICE_FUERA_DE_RANGO");
  });

  it("rechaza el robo si quien lo manda no es el ladrón del pendiente", () => {
    const { motor, estado, atacante } = conPilloFallido();
    const res = motor.aplicarAccion(
      estado,
      atacante, // el que falló, no el que elige
      parsear(motor, { tipo: "rumble/pilloRobo", indice: 0 }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.codigo).toBe("PILLO_SIN_PENDIENTE");
  });

  it("el parseo rechaza índices no enteros o negativos (no confiar en el cliente)", () => {
    const { motor } = motorYEstado({ poolActivo: ["PILLO"] });
    expect(motor.parsearAccion({ tipo: "rumble/pilloRobo", indice: -1 })).toBeNull();
    expect(motor.parsearAccion({ tipo: "rumble/pilloRobo", indice: 1.5 })).toBeNull();
    expect(motor.parsearAccion({ tipo: "rumble/pilloRobo", indice: "0" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "rumble/pilloRobo" })).toBeNull();
  });

  it("el pendiente solo viaja en la vista del ladrón, nunca en la de la víctima", () => {
    const { motor, estado, atacante, objetivo } = conPilloFallido();
    const delLadron = vistaRumble(motor.construirVista(estado, objetivo, META));
    const deLaVictima = vistaRumble(motor.construirVista(estado, atacante, META));

    const manoVictima = estado.base.jugadores.find((j) => j.id === atacante)?.mano.length ?? 0;
    expect(delLadron.rumble.pilloPendiente).toEqual({
      victimaId: atacante,
      numeroCartas: manoVictima,
    });
    expect(deLaVictima.rumble.pilloPendiente).toBeUndefined();
    // Solo esas dos claves: ningún id de carta viaja (filtraría la carta entera).
    expect(Object.keys(delLadron.rumble.pilloPendiente ?? {}).sort()).toEqual([
      "numeroCartas",
      "victimaId",
    ]);
  });
});
