// ============================================================================
// === INSTRUMENTACIÓN TEMPORAL — MEDICIÓN RELOJ ANDROID — REMOVER ANTES DE CERRAR ===
// ============================================================================
//
// Mide qué le pasa a un `setTimeout` GLOBAL del webview cuando la app Android va a
// background y vuelve (¿pausa dura? ¿throttle suave? ¿ráfaga de catch-up al
// reanudar?). El entregable es `MEDICION_RELOJ_ANDROID.md`.
//
// POR QUÉ ESTE MÓDULO Y NO TOCAR orquestador.ts:
//   El orquestador agenda la gracia de reconexión (GRACIA_MS = 10s) y el salto de
//   turno con el MISMO `setTimeout` global (default `programadorReal`,
//   orquestador.ts). Esta sonda usa exactamente ese API path, así que es
//   REPRESENTATIVA del reloj del host sin tocar la lógica de autoridad.
//
// AISLAMIENTO DEL GRAFO DE PRODUCCIÓN:
//   No lo importa nadie estáticamente. main.ts hace un `import()` dinámico SOLO si
//   la flag de build `VITE_MEDICION_RELOJ` está activa; con la flag ausente Vite lo
//   tree-shakea y no entra al bundle. Se construye un build de medición con
//   `VITE_MEDICION_RELOJ=1` y se BORRA este archivo + el gate de main.ts al cerrar.
//
// CÓMO LEER LOS RESULTADOS EN EL TELÉFONO:
//   Cada evento se escribe al visor de log embebido (singleton `registro`, panel en
//   pantalla) Y a `console.log` (capturado por el webview → `adb logcat`). No hace
//   falta pipe USB para leer; con `adb logcat` se obtiene además timestamp del SO.

import { registro } from "../registro/registro.js";

/** Prefijo único para grepear la medición en el visor y en logcat. */
const ETIQUETA = "[MEDICION_RELOJ]";

/** Duraciones de las sondas one-shot (ms). Cubren los tramos del experimento. */
const DURACIONES_SONDA_MS = [5_000, 30_000, 120_000] as const;

/** Periodo del ticker repetitivo: revela el patrón de throttle tick a tick. */
const PERIODO_TICKER_MS = 1_000;

/** Loguea al visor en pantalla y a la consola (→ logcat) en una sola llamada. */
function log(mensaje: string): void {
  const linea = `${ETIQUETA} ${mensaje}`;
  registro.info(linea);
  // eslint-disable-next-line no-console -- salida intencional a logcat (temporal).
  console.log(linea);
}

/**
 * Agenda un `setTimeout` one-shot y, al dispararse, loguea el delta entre el
 * instante esperado (wall-clock) y el real. Un delta ~0 = el timer no se vio
 * afectado; un delta grande positivo = el callback se atrasó (pausa/throttle).
 */
function sondaUnaVez(ms: number): void {
  const programadoEn = Date.now();
  const esperadoEn = programadoEn + ms;
  log(`sonda ${ms}ms PROGRAMADA (esperado disparar en t+${ms}ms)`);
  setTimeout(() => {
    const realEn = Date.now();
    const delta = realEn - esperadoEn;
    const transcurridoReal = realEn - programadoEn;
    log(
      `sonda ${ms}ms DISPARO: transcurrido_real=${transcurridoReal}ms ` +
        `delta(real-esperado)=${delta}ms`,
    );
  }, ms);
}

/**
 * Ticker repetitivo de período fijo que loguea el intervalo REAL entre ticks.
 * El patrón distingue las tres hipótesis: si los ticks se congelan en background
 * y reanudan = pausa dura; si se espacian a ~1/min = throttle suave; si al volver
 * al frente aparece una ráfaga de ticks atrasados = catch-up.
 */
function arrancarTicker(): void {
  let anteriorEn = Date.now();
  let n = 0;
  setInterval(() => {
    const ahora = Date.now();
    const intervaloReal = ahora - anteriorEn;
    anteriorEn = ahora;
    n += 1;
    // Solo loguea cuando el intervalo se desvía notablemente del esperado, para
    // no inundar el buffer (300 entradas) durante el foreground normal.
    if (Math.abs(intervaloReal - PERIODO_TICKER_MS) > 250) {
      log(
        `ticker #${n}: intervalo_real=${intervaloReal}ms ` +
          `(esperado=${PERIODO_TICKER_MS}ms)`,
      );
    }
  }, PERIODO_TICKER_MS);
}

/** Loguea las transiciones de lifecycle para cruzarlas con los deltas. */
function instalarLifecycle(): void {
  document.addEventListener("visibilitychange", () => {
    log(`visibilitychange -> ${document.visibilityState} @${Date.now()}`);
  });
  window.addEventListener("pagehide", () => log(`pagehide @${Date.now()}`));
  window.addEventListener("pageshow", () => log(`pageshow @${Date.now()}`));
  window.addEventListener("blur", () => log(`window.blur @${Date.now()}`));
  window.addEventListener("focus", () => log(`window.focus @${Date.now()}`));
}

let iniciada = false;

/**
 * Arranca la medición (idempotente). PROCEDIMIENTO en dispositivo:
 *   1. Crear sala "Online → Crear partida" desde Android (host) + peer PC.
 *   2. Esperar a que las sondas estén PROGRAMADAS (se ven en el visor).
 *   3. Mandar la app a background durante ~5s / ~30s / ~2min (una corrida por
 *      duración; reabrir la app re-monta y re-programa las sondas).
 *   4. Volver al frente y leer en el visor / `adb logcat` los DISPARO + deltas y
 *      el patrón del ticker. Volcar a MEDICION_RELOJ_ANDROID.md.
 */
export function iniciarMedicionReloj(): void {
  if (iniciada) return;
  iniciada = true;
  log(`INICIO @${Date.now()} (ua=${navigator.userAgent})`);
  instalarLifecycle();
  arrancarTicker();
  for (const ms of DURACIONES_SONDA_MS) sondaUnaVez(ms);
}
