// Desde dónde "vuela" cada carta nueva de UNO, comparando la vista anterior con la
// nueva. NO decide reglas: solo da el origen de las animaciones (la vista es la
// verdad; si un cambio no calza, la carta aparece en su sitio). Es el equivalente
// a estado/difVista.ts de Carioca, pero para VistaUno y mucho más simple.

import type { VistaUno } from "@juegos/server/vistaJuego";
import { POSE_MAZO } from "../../escena/disposicion.js";
import type { OrigenAparicion } from "../../escena/sincronizadorPoses.js";
import { elevar } from "../../escena/sincronizadorPoses.js";
import type { ObjetivoUno } from "./disposicionUno.js";
import { poseAsientoUno } from "./disposicionUno.js";

const RETRASO_REPARTO = 0.05;

/** La carta salió de mi mano → fui yo; si no, el jugador del turno previo. */
function quienJugo(anterior: VistaUno, nueva: VistaUno, cartaId: string): string | null {
  const eraMia = anterior.tuMano.some((c) => c.id === cartaId);
  const sigueMia = nueva.tuMano.some((c) => c.id === cartaId);
  if (eraMia && !sigueMia) return nueva.tuJugadorId;
  return anterior.jugadorEnTurnoId;
}

/**
 * Construye el `origen` que consume SincronizadorPoses. En el reparto todo sale del
 * mazo escalonado; luego: la carta jugada vuela del asiento de quien la jugó al
 * descarte, y la robada vuela del mazo a mi mano.
 */
export function crearOrigenUno(
  anterior: VistaUno | null,
  nueva: VistaUno,
  reparto: boolean,
): OrigenAparicion<ObjetivoUno> {
  return (clave, objetivo, siguienteOrden) => {
    if (reparto) {
      if (clave.startsWith("dorso:mazo:")) return { pose: objetivo.pose, retraso: 0 };
      return { pose: elevar(POSE_MAZO), retraso: siguienteOrden() * RETRASO_REPARTO };
    }
    if (anterior === null) return { pose: objetivo.pose, retraso: 0 };

    // Carta nueva en el tope del descarte: vuela del asiento de quien la jugó.
    const tope = nueva.descarteTope;
    if (
      tope !== null &&
      clave === `carta:${tope.id}` &&
      (anterior.descarteTope === null || anterior.descarteTope.id !== tope.id)
    ) {
      const quien = quienJugo(anterior, nueva, tope.id);
      const origen = quien === null ? POSE_MAZO : poseAsientoUno(nueva, quien);
      return { pose: elevar(origen), retraso: 0 };
    }

    // Carta nueva en mi mano: vuela del mazo (robo propio).
    const idsAntes = new Set(anterior.tuMano.map((c) => c.id));
    if (objetivo.carta !== null && clave.startsWith("carta:") && !idsAntes.has(objetivo.carta.id)) {
      const enMiMano = nueva.tuMano.some((c) => c.id === objetivo.carta?.id);
      if (enMiMano) return { pose: elevar(POSE_MAZO), retraso: 0 };
    }

    // Sin explicación conocida: aparece en su sitio.
    return { pose: objetivo.pose, retraso: 0 };
  };
}
