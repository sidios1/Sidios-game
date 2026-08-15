// Fase de armado de §7: cada jugador elige, desde su "Mi Club" (inventario
// plano de miClub.ts), qué carta ocupa cada slot de FORMACION_4_3_3. Lo que
// no se asigna queda en banca — un slot vacío es un armado VÁLIDO (§7:
// "un slot vacío hace que ese jugador pierda automáticamente esa categoría",
// no bloquea el armado).

import { buscarCarta, type CartaMiClub } from "./miClub.js";
import { error, ok, type Resultado } from "./resultado.js";
import { FORMACION_4_3_3, type IdSlotFormacion } from "./formacion.js";

export interface AsignacionSlot {
  readonly slotId: IdSlotFormacion;
  /** `null` = slot vacío (banca por descarte del jugador o por no tener carta). */
  readonly cartaId: string | null;
}

export interface EquipoArmado {
  readonly jugadorId: string;
  /** Siempre 12 entradas, una por slot de FORMACION_4_3_3, en ese orden. */
  readonly asignaciones: readonly AsignacionSlot[];
}

/**
 * `asignaciones`: solo los slots que el jugador llenó (slotId -> cartaId de
 * Mi Club). Los slots omitidos del Map quedan `cartaId: null` en el resultado.
 */
export function armarEquipo(
  jugadorId: string,
  miClub: readonly CartaMiClub[],
  asignaciones: ReadonlyMap<IdSlotFormacion, string>,
): Resultado<EquipoArmado> {
  const cartaIdsUsadas = new Set<string>();

  for (const [slotId, cartaId] of asignaciones) {
    const slot = FORMACION_4_3_3.find((s) => s.id === slotId);
    if (slot === undefined) {
      return error("SLOT_INVALIDO", `"${slotId}" no es un slot de la formación 4-3-3`);
    }

    const carta = buscarCarta(miClub, cartaId);
    if (carta === undefined) {
      return error("CARTA_DESCONOCIDA", `no tienes la carta "${cartaId}" en Mi Club`);
    }

    if (cartaIdsUsadas.has(cartaId)) {
      return error("CARTA_YA_ASIGNADA", `la carta "${cartaId}" ya está asignada a otro slot`);
    }
    cartaIdsUsadas.add(cartaId);

    if (slot.tipo === "tecnico") {
      if (carta.tipo !== "tecnico") {
        return error("CARTA_NO_ELEGIBLE", `el slot "${slotId}" requiere un técnico`);
      }
    } else {
      if (carta.tipo !== "jugador") {
        return error("CARTA_NO_ELEGIBLE", `el slot "${slotId}" requiere un jugador`);
      }
      const posicionesAceptadas = slot.posicionesAceptadas ?? [];
      if (!posicionesAceptadas.includes(carta.jugador.posicion)) {
        return error(
          "CARTA_NO_ELEGIBLE",
          `la posición "${carta.jugador.posicion}" no calza con el slot "${slotId}"`,
        );
      }
    }
  }

  const equipoArmado: EquipoArmado = {
    jugadorId,
    asignaciones: FORMACION_4_3_3.map((slot) => ({
      slotId: slot.id,
      cartaId: asignaciones.get(slot.id) ?? null,
    })),
  };
  return ok(equipoArmado);
}
