import { describe, expect, it } from "vitest";
import type { EstadoPartida, Resultado } from "@juegos/carioca-core";
import {
  bajarse,
  crearPartidaConMazo,
  descartar,
  puntosMano,
  robarDelMazo,
} from "@juegos/carioca-core";
import {
  idsSegunEspecs,
  mazoParaDos,
} from "../../carioca-core/src/apoyoPruebas.js";
import { cartasFiltradasEnVista, GUIONES } from "./pruebas/guion.js";
import type { MetaSala } from "./vista.js";
import { construirVista } from "./vista.js";

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

function meta(parcial?: Partial<MetaSala>): MetaSala {
  return {
    conectados: new Set(["ana", "beto"]),
    listos: new Set(),
    votosNecesarios: 2,
    ...parcial,
  };
}

function guionMano1() {
  const guion = GUIONES[0];
  if (guion === undefined) throw new Error("no hay guion para la mano 1");
  return guion;
}

function partidaMano1(): EstadoPartida {
  const guion = guionMano1();
  return ok(
    crearPartidaConMazo(
      DATOS,
      mazoParaDos({
        manoP0: "relleno",
        manoP1: guion.manoGanador,
        pozo: guion.pozo,
        robos: [guion.robo],
      }),
    ),
  );
}

describe("construirVista: proyección por jugador", () => {
  it("muestra la mano propia y solo conteos de lo demás", () => {
    const estado = partidaMano1();
    const vista = construirVista(estado, "ana", meta());

    expect(vista.tuJugadorId).toBe("ana");
    expect(vista.tuMano).toHaveLength(12);
    expect(vista.manoActual).toBe(1);
    expect(vista.contrato.numero).toBe(1);
    expect(vista.fase).toBe("jugandoMano");
    expect(vista.resumenMano).toBeNull();
    expect(vista.ganadoresIds).toBeNull();

    const beto = vista.jugadores.find((j) => j.id === "beto");
    expect(beto?.numeroCartas).toBe(12);
    expect(beto?.conectado).toBe(true);
    expect(beto?.seBajo).toBe(false);

    // 108 cartas: 24 repartidas, 1 al pozo, 83 en el mazo.
    expect(vista.numeroMazo).toBe(estado.mazo.length);
    expect(vista.numeroPozo).toBe(1);
    expect(vista.pozoTope?.id).toBe(estado.pozo[estado.pozo.length - 1]?.id);
  });

  it("no filtra ninguna carta ajena ni del mazo (invariante recursiva)", () => {
    const estado = partidaMano1();
    for (const jugadorId of ["ana", "beto"]) {
      expect(cartasFiltradasEnVista(construirVista(estado, jugadorId, meta()))).toEqual([]);
    }
  });

  it("en manoTerminada trae el resumen de puntos y los votos", () => {
    const guion = guionMano1();
    let estado = partidaMano1();
    const manoAna = estado.jugadores.find((j) => j.id === "ana")?.mano ?? [];

    estado = ok(robarDelMazo(estado, "beto"));
    const disponibles = [...(estado.jugadores.find((j) => j.id === "beto")?.mano ?? [])];
    estado = ok(
      bajarse(
        estado,
        "beto",
        guion.propuesta.map((parte) => ({
          tipo: parte.tipo,
          cartaIds: idsSegunEspecs(disponibles, parte.especs),
        })),
      ),
    );
    if (guion.descarte === null) throw new Error("la mano 1 descarta");
    const idDescarte = idsSegunEspecs(
      [...(estado.jugadores.find((j) => j.id === "beto")?.mano ?? [])],
      [guion.descarte],
    )[0];
    if (idDescarte === undefined) throw new Error("no se encontró el descarte");
    estado = ok(descartar(estado, "beto", idDescarte));

    expect(estado.fase).toBe("manoTerminada");
    const vista = construirVista(
      estado,
      "ana",
      meta({ listos: new Set(["beto"]) }),
    );
    expect(vista.resumenMano).not.toBeNull();
    expect(vista.resumenMano?.ganadorManoId).toBe("beto");
    expect(vista.resumenMano?.votosListos).toBe(1);
    expect(vista.resumenMano?.votosNecesarios).toBe(2);
    const filaAna = vista.resumenMano?.filas.find((f) => f.jugadorId === "ana");
    const filaBeto = vista.resumenMano?.filas.find((f) => f.jugadorId === "beto");
    expect(filaAna?.puntosMano).toBe(puntosMano(manoAna));
    expect(filaBeto?.puntosMano).toBe(0);
    const beto = vista.jugadores.find((j) => j.id === "beto");
    expect(beto?.listoSiguienteMano).toBe(true);
    // Las cartas que le quedaron a ana siguen sin viajar en la vista de beto.
    expect(cartasFiltradasEnVista(construirVista(estado, "beto", meta()))).toEqual([]);
  });
});
