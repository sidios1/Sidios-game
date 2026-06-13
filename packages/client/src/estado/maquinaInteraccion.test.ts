import { describe, expect, it } from "vitest";
import type { Carta } from "@juegos/carioca-core";
import { crearComodin } from "@juegos/carioca-core";
import type { VistaPartida } from "@juegos/server/vista";
import type {
  EstadoInteraccion,
  EventoInteraccion,
} from "./maquinaInteraccion.js";
import { ESTADO_INICIAL, transicion } from "./maquinaInteraccion.js";
import { carta, crearVista, jugadorVista, manoConDosTrios } from "../pruebas/fabricas.js";

/** Aplica eventos en cadena y devuelve el estado final. */
function aplicar(
  eventos: readonly EventoInteraccion[],
  desde: EstadoInteraccion = ESTADO_INICIAL,
): EstadoInteraccion {
  let estado = desde;
  for (const evento of eventos) {
    estado = transicion(estado, evento).estado;
  }
  return estado;
}

function vistaMiTurnoDescartar(parcial: Partial<VistaPartida> = {}): VistaPartida {
  return crearVista({
    tuMano: manoConDosTrios(),
    turno: { jugadorId: "j1", fase: "descartar", numero: 1 },
    ...parcial,
  });
}

describe("maquinaInteraccion: modos según la vista", () => {
  it("deriva el modo del turno y la fase", () => {
    const robar = aplicar([{ tipo: "vista", vista: crearVista() }]);
    expect(robar.modo).toBe("robar");

    const ajeno = aplicar([
      {
        tipo: "vista",
        vista: crearVista({ turno: { jugadorId: "j2", fase: "robar", numero: 2 } }),
      },
    ]);
    expect(ajeno.modo).toBe("esperandoTurno");

    const descartar = aplicar([{ tipo: "vista", vista: vistaMiTurnoDescartar() }]);
    expect(descartar.modo).toBe("descartar");

    const terminada = aplicar([
      { tipo: "vista", vista: crearVista({ fase: "manoTerminada" }) },
    ]);
    expect(terminada.modo).toBe("manoTerminada");
  });

  it("limpia la selección de cartas que ya no están en la mano", () => {
    const mano = manoConDosTrios();
    const id = mano[0]?.id ?? "";
    const conSeleccion = aplicar([
      { tipo: "vista", vista: vistaMiTurnoDescartar() },
      { tipo: "clickCarta", cartaId: id },
    ]);
    expect(conSeleccion.seleccion).toEqual([id]);
    const trasVista = aplicar(
      [{ tipo: "vista", vista: vistaMiTurnoDescartar({ tuMano: mano.slice(1) }) }],
      conSeleccion,
    );
    expect(trasVista.seleccion).toEqual([]);
  });
});

describe("maquinaInteraccion: robar y descartar", () => {
  it("en modo robar solo el mazo y el pozo generan comandos", () => {
    const estado = aplicar([{ tipo: "vista", vista: crearVista() }]);
    expect(transicion(estado, { tipo: "clickMazo" }).comandos).toEqual([
      { tipo: "robarDelMazo" },
    ]);
    expect(transicion(estado, { tipo: "clickPozo" }).comandos).toEqual([
      { tipo: "robarDelPozo" },
    ]);
    expect(
      transicion(estado, { tipo: "clickCarta", cartaId: "x" }).estado.seleccion,
    ).toEqual([]);
  });

  it("descartar exige exactamente una carta seleccionada", () => {
    const base = aplicar([{ tipo: "vista", vista: vistaMiTurnoDescartar() }]);
    const sinSeleccion = transicion(base, { tipo: "botonDescartar" });
    expect(sinSeleccion.comandos).toEqual([]);
    expect(sinSeleccion.aviso).not.toBeNull();

    const id = manoConDosTrios()[0]?.id ?? "";
    const conUna = aplicar([{ tipo: "clickCarta", cartaId: id }], base);
    const resultado = transicion(conUna, { tipo: "botonDescartar" });
    expect(resultado.comandos).toEqual([{ tipo: "descartar", cartaId: id }]);
    expect(resultado.estado.seleccion).toEqual([]);
  });

  it("el click al pozo en fase de descartar funciona como atajo", () => {
    const id = manoConDosTrios()[0]?.id ?? "";
    const estado = aplicar([
      { tipo: "vista", vista: vistaMiTurnoDescartar() },
      { tipo: "clickCarta", cartaId: id },
    ]);
    expect(transicion(estado, { tipo: "clickPozo" }).comandos).toEqual([
      { tipo: "descartar", cartaId: id },
    ]);
  });
});

describe("maquinaInteraccion: bajarse", () => {
  const mano = manoConDosTrios();
  const idsTrio1 = mano.slice(0, 3).map((c) => c.id);
  const idsTrio2 = mano.slice(3, 6).map((c) => c.id);

  function armarBajada(): EstadoInteraccion {
    const eventos: EventoInteraccion[] = [
      { tipo: "vista", vista: vistaMiTurnoDescartar() },
      { tipo: "abrirBajada" },
      ...idsTrio1.map((cartaId) => ({ tipo: "clickCarta", cartaId }) as const),
      { tipo: "agregarGrupo", tipoCombinacion: "trio" },
      ...idsTrio2.map((cartaId) => ({ tipo: "clickCarta", cartaId }) as const),
      { tipo: "agregarGrupo", tipoCombinacion: "trio" },
    ];
    return aplicar(eventos);
  }

  it("arma grupos válidos y emite bajarse cuando cubre el contrato", () => {
    const estado = armarBajada();
    expect(estado.modo).toBe("construyendoBajada");
    expect(estado.propuesta).toHaveLength(2);
    const resultado = transicion(estado, { tipo: "confirmarBajada" });
    expect(resultado.comandos).toEqual([
      {
        tipo: "bajarse",
        propuesta: [
          { tipo: "trio", cartaIds: idsTrio1 },
          { tipo: "trio", cartaIds: idsTrio2 },
        ],
      },
    ]);
  });

  it("rechaza con aviso un grupo inválido y una propuesta incompleta", () => {
    const base = aplicar([
      { tipo: "vista", vista: vistaMiTurnoDescartar() },
      { tipo: "abrirBajada" },
    ]);
    const malGrupo = aplicar(
      [
        { tipo: "clickCarta", cartaId: idsTrio1[0] ?? "" },
        { tipo: "clickCarta", cartaId: idsTrio2[0] ?? "" },
      ],
      base,
    );
    const invalido = transicion(malGrupo, {
      tipo: "agregarGrupo",
      tipoCombinacion: "trio",
    });
    expect(invalido.aviso).not.toBeNull();
    expect(invalido.estado.propuesta).toHaveLength(0);

    const incompleta = transicion(base, { tipo: "confirmarBajada" });
    expect(incompleta.comandos).toEqual([]);
    expect(incompleta.aviso).not.toBeNull();
  });

  it("la vista con seBajo limpia la propuesta y cierra el panel", () => {
    const estado = armarBajada();
    const vistaBajado = vistaMiTurnoDescartar({
      tuMano: mano.slice(6),
      jugadores: [jugadorVista("j1", { seBajo: true }), jugadorVista("j2")],
    });
    const tras = aplicar([{ tipo: "vista", vista: vistaBajado }], estado);
    expect(tras.modo).toBe("descartar");
    expect(tras.propuesta).toHaveLength(0);
  });
});

describe("maquinaInteraccion: pegar", () => {
  const nueve = carta("diamantes", 9, "c");
  const escala = [
    carta("corazones", 5),
    carta("corazones", 6),
    carta("corazones", 7),
    carta("corazones", 8),
  ];

  function vistaParaPegar(manoPropia: readonly Carta[]): VistaPartida {
    return vistaMiTurnoDescartar({
      tuMano: manoPropia,
      jugadores: [jugadorVista("j1", { seBajo: true }), jugadorVista("j2")],
      mesa: [
        {
          duenoId: "j2",
          combinacion: {
            tipo: "trio",
            cartas: [carta("picas", 9), carta("treboles", 9), carta("corazones", 9)],
          },
        },
        { duenoId: "j2", combinacion: { tipo: "escala", cartas: escala } },
      ],
    });
  }

  it("pegar a un trío envía directo, sin extremo", () => {
    const estado = aplicar([
      { tipo: "vista", vista: vistaParaPegar([nueve]) },
      { tipo: "clickCarta", cartaId: nueve.id },
    ]);
    const resultado = transicion(estado, { tipo: "clickCombinacion", mesaIdx: 0 });
    expect(resultado.comandos).toEqual([
      { tipo: "pegar", cartaId: nueve.id, mesaIdx: 0 },
    ]);
  });

  it("pegar a una escala con un solo extremo válido lo resuelve solo", () => {
    const cuatro = carta("corazones", 4);
    const estado = aplicar([
      { tipo: "vista", vista: vistaParaPegar([cuatro]) },
      { tipo: "clickCarta", cartaId: cuatro.id },
    ]);
    const resultado = transicion(estado, { tipo: "clickCombinacion", mesaIdx: 1 });
    expect(resultado.comandos).toEqual([
      { tipo: "pegar", cartaId: cuatro.id, mesaIdx: 1, extremo: "inicio" },
    ]);
  });

  it("con ambos extremos válidos pide elegir y luego envía", () => {
    const comodin = crearComodin(1);
    const estado = aplicar([
      { tipo: "vista", vista: vistaParaPegar([comodin]) },
      { tipo: "clickCarta", cartaId: comodin.id },
      { tipo: "clickCombinacion", mesaIdx: 1 },
    ]);
    expect(estado.modo).toBe("eligiendoExtremo");
    const resultado = transicion(estado, { tipo: "elegirExtremo", extremo: "fin" });
    expect(resultado.comandos).toEqual([
      { tipo: "pegar", cartaId: comodin.id, mesaIdx: 1, extremo: "fin" },
    ]);
    expect(resultado.estado.modo).toBe("descartar");
  });

  it("avisa cuando la carta no extiende la escala o no te has bajado", () => {
    const reina = carta("picas", 12);
    const noCalza = aplicar([
      { tipo: "vista", vista: vistaParaPegar([reina]) },
      { tipo: "clickCarta", cartaId: reina.id },
    ]);
    expect(
      transicion(noCalza, { tipo: "clickCombinacion", mesaIdx: 1 }).aviso,
    ).not.toBeNull();

    const sinBajar = aplicar([
      { tipo: "vista", vista: vistaMiTurnoDescartar() },
    ]);
    expect(
      transicion(sinBajar, { tipo: "clickCombinacion", mesaIdx: 0 }).aviso,
    ).toContain("bajarte");
  });
});

describe("maquinaInteraccion: gestos de arrastre", () => {
  const mano = manoConDosTrios();

  it("soltar en el pozo descarta esa carta concreta, sin selección previa", () => {
    const id = mano[6]?.id ?? "";
    const estado = aplicar([{ tipo: "vista", vista: vistaMiTurnoDescartar() }]);
    const resultado = transicion(estado, { tipo: "soltarEnPozo", cartaId: id });
    expect(resultado.comandos).toEqual([{ tipo: "descartar", cartaId: id }]);
  });

  it("soltar en el pozo fuera de la fase de descarte no hace nada", () => {
    const id = mano[6]?.id ?? "";
    const enRobar = aplicar([{ tipo: "vista", vista: crearVista() }]);
    const resultado = transicion(enRobar, { tipo: "soltarEnPozo", cartaId: id });
    expect(resultado.comandos).toEqual([]);
  });

  it("soltar en una combinación pega como el click equivalente", () => {
    const nueve = carta("diamantes", 9, "c");
    const vista = vistaMiTurnoDescartar({
      tuMano: [nueve],
      jugadores: [jugadorVista("j1", { seBajo: true }), jugadorVista("j2")],
      mesa: [
        {
          duenoId: "j2",
          combinacion: {
            tipo: "trio",
            cartas: [carta("picas", 9), carta("treboles", 9), carta("corazones", 9)],
          },
        },
      ],
    });
    const estado = aplicar([{ tipo: "vista", vista }]);
    const resultado = transicion(estado, {
      tipo: "soltarEnCombinacion",
      cartaId: nueve.id,
      mesaIdx: 0,
    });
    expect(resultado.comandos).toEqual([
      { tipo: "pegar", cartaId: nueve.id, mesaIdx: 0 },
    ]);
  });

  it("soltar en una combinación sin haberse bajado avisa", () => {
    const estado = aplicar([{ tipo: "vista", vista: vistaMiTurnoDescartar() }]);
    const resultado = transicion(estado, {
      tipo: "soltarEnCombinacion",
      cartaId: mano[0]?.id ?? "",
      mesaIdx: 0,
    });
    expect(resultado.comandos).toEqual([]);
    expect(resultado.aviso).toContain("bajarte");
  });

  it("soltar en la zona de mesa abre la bajada y deja la carta staged", () => {
    const id = mano[0]?.id ?? "";
    const estado = aplicar([{ tipo: "vista", vista: vistaMiTurnoDescartar() }]);
    const resultado = transicion(estado, { tipo: "soltarEnMesaBajada", cartaId: id });
    expect(resultado.estado.modo).toBe("construyendoBajada");
    expect(resultado.estado.seleccion).toEqual([id]);
    expect(resultado.comandos).toEqual([]);
  });

  it("soltar en la zona de mesa si ya te bajaste avisa", () => {
    const vista = vistaMiTurnoDescartar({
      jugadores: [jugadorVista("j1", { seBajo: true }), jugadorVista("j2")],
    });
    const estado = aplicar([{ tipo: "vista", vista }]);
    const resultado = transicion(estado, {
      tipo: "soltarEnMesaBajada",
      cartaId: mano[0]?.id ?? "",
    });
    expect(resultado.aviso).not.toBeNull();
    expect(resultado.estado.modo).toBe("descartar");
  });
});

describe("maquinaInteraccion: fin de mano", () => {
  it("vota listo una sola vez", () => {
    const estado = aplicar([
      { tipo: "vista", vista: crearVista({ fase: "manoTerminada" }) },
    ]);
    const primero = transicion(estado, { tipo: "votarListo" });
    expect(primero.comandos).toEqual([{ tipo: "listoSiguienteMano" }]);
    const segundo = transicion(primero.estado, { tipo: "votarListo" });
    expect(segundo.comandos).toEqual([]);
  });
});
