// La decisión de CUÁNDO y DESDE DÓNDE arrancar el clip, como función pura
// (REGLAS §3.4): el host difunde `faseInicioMs` (start_at absoluto en SU reloj)
// y cada cliente lo traduce a hora local con su propio offset. Es pura para
// testearla con tabla de casos sin DOM: jsdom no implementa `audio.play()`.
//
// El instante de arranque NO es `faseInicioMs` a secas: el orquestador lo
// estampa cuando la fase YA arrancó y la difusión viaja después, así que para
// todos los clientes está en el pasado. `instanteArranqueHost` le suma el
// MARGEN compartido — el mismo número absoluto para todos ⇒ arrancan juntos.

import { instanteArranqueHost } from "@juegos/server/sincroniaReloj";

export type PlanArranque =
  /** El instante cae en el futuro: programar el play() para ese momento. */
  | { readonly tipo: "programar"; readonly esperaMs: number; readonly desdeSegundo: number }
  /** Llegamos tarde (reconexión, offset sucio): sonar YA, con seek adelante. */
  | { readonly tipo: "yaMismo"; readonly desdeSegundo: number }
  /** La fase de clip ya terminó de hecho (vista vieja): no sonar nada. */
  | { readonly tipo: "omitir" };

export interface EntradaPlan {
  /** `faseInicioMs` de la vista (reloj del HOST), o null si no hay reloj. */
  readonly faseInicioMs: number | null;
  /** Segundo del archivo donde empieza el clip (~30 %, lo fija el pool). */
  readonly segundoInicio: number | null;
  /** Duración de la fase de clip, o null si la vista no la trae. */
  readonly duracionFaseMs: number | null;
  /** Desfase local contra el host (relojHost.offsetMs; 0 sin muestras). */
  readonly offsetMs: number;
  /** `Date.now()` del cliente. */
  readonly ahoraMs: number;
}

export function planificarArranque(entrada: EntradaPlan): PlanArranque {
  const base = entrada.segundoInicio ?? 0;
  // Sin start_at no hay nada que traducir: el comportamiento de S3 (sonar al
  // entrar en la fase). No debería pasar en una sala real.
  if (entrada.faseInicioMs === null) return { tipo: "yaMismo", desdeSegundo: base };

  // El instante compartido de arranque, traducido del reloj del host al local.
  const arranqueLocal = instanteArranqueHost(entrada.faseInicioMs) - entrada.offsetMs;
  const esperaMs = arranqueLocal - entrada.ahoraMs;
  if (esperaMs > 0) return { tipo: "programar", esperaMs, desdeSegundo: base };

  // Llegamos tarde. Los que arrancaron a tiempo ya van `retraso` ms adentro
  // del clip: seek adelante para sonar EN EL MISMO PUNTO que el resto.
  const retrasoMs = -esperaMs;
  const finLocal =
    entrada.duracionFaseMs === null
      ? null
      : entrada.faseInicioMs + entrada.duracionFaseMs - entrada.offsetMs;
  if (finLocal !== null && entrada.ahoraMs >= finLocal) return { tipo: "omitir" };
  return { tipo: "yaMismo", desdeSegundo: base + retrasoMs / 1000 };
}
