import { describe, expect, it } from "vitest";
import {
  bajarseConContrato,
  crearGeneradorSemilla,
  crearPartida,
  type EstadoPartida,
  type PropuestaCombinacion,
} from "@juegos/carioca-core";
import type { TestigoMision } from "./misionToco.js";
import { armarTestigoToco, MISION_TOCO, NUMERO_MISION_TOCO } from "./misionToco.js";

/** Deja al jugador en turno con la mano dada y en fase "descartar" (listo para bajarse). */
function estadoConMano(mano: TestigoMision["mano"]): {
  estado: EstadoPartida;
  turnoId: string;
} | null {
  const creada = crearPartida(
    [
      { id: "ana", nombre: "Ana" },
      { id: "beto", nombre: "Beto" },
    ],
    crearGeneradorSemilla(3),
  );
  if (!creada.ok) return null;
  const turnoId = creada.valor.turno.jugadorId;
  return {
    turnoId,
    estado: {
      ...creada.valor,
      jugadores: creada.valor.jugadores.map((j) =>
        j.id === turnoId ? { ...j, mano } : j,
      ),
      turno: { ...creada.valor.turno, fase: "descartar" },
    },
  };
}

describe("MISION_TOCO", () => {
  it("es la misión única y fija: una escala sucia", () => {
    expect(MISION_TOCO.numero).toBe(NUMERO_MISION_TOCO);
    expect(MISION_TOCO.nombre).toBe("TOCO · escala sucia");
    expect(MISION_TOCO.cartasRepartidas).toBe(12);
    expect(MISION_TOCO.requisitos).toEqual([{ tipo: "escalaSucia" }]);
    expect(MISION_TOCO.comodinesPorCombinacion).toBe(1);
    expect(MISION_TOCO.cierreAutomatico).toBe(true);
  });

  it("formar la escala sucia GANA la mano vía bajarseConContrato (costura S1)", () => {
    const testigo = armarTestigoToco();
    const preparado = estadoConMano(testigo.mano);
    expect(preparado).not.toBeNull();
    if (preparado === null) return;

    const res = bajarseConContrato(
      preparado.estado,
      preparado.turnoId,
      testigo.propuesta,
      MISION_TOCO,
    );
    expect(res.ok).toBe(true);
    // Las 13 cartas vacían la mano → el core cierra solo (la victoria de TOCO).
    if (res.ok) expect(res.valor.ganadorManoId).toBe(preparado.turnoId);
  });

  it("el comodín es PERMITIDO, no obligatorio: la escala limpia también cumple", () => {
    const testigo = armarTestigoToco(false);
    const preparado = estadoConMano(testigo.mano);
    expect(preparado).not.toBeNull();
    if (preparado === null) return;

    const res = bajarseConContrato(
      preparado.estado,
      preparado.turnoId,
      testigo.propuesta,
      MISION_TOCO,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.valor.ganadorManoId).toBe(preparado.turnoId);
  });

  it("una escala incompleta NO cumple la misión", () => {
    const testigo = armarTestigoToco();
    const preparado = estadoConMano(testigo.mano);
    expect(preparado).not.toBeNull();
    if (preparado === null) return;

    // Deja fuera el Rey: 12 de las 13 cartas.
    const primera = testigo.propuesta[0];
    expect(primera).toBeDefined();
    if (primera === undefined) return;
    const incompleta: readonly PropuestaCombinacion[] = [
      { tipo: "escalaSucia", cartaIds: primera.cartaIds.slice(0, -1) },
    ];

    const res = bajarseConContrato(
      preparado.estado,
      preparado.turnoId,
      incompleta,
      MISION_TOCO,
    );
    expect(res.ok).toBe(false);
  });
});
