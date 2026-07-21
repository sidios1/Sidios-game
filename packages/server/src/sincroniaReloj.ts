// Sincronía de reloj cliente↔host: espejo de latido.ts, en la CAPA DE
// TRANSPORTE (SPIKE_MELOQUIZ.md §2). Son frames de control que los adaptadores
// consumen y NUNCA pasan a sus oyentes: el orquestador no sabe que existen, y el
// pong es un send directo del adaptador (medir el RTT real, no el trabajo del
// orquestador). El offset resultante es estado 100 % LOCAL del cliente — el host
// jamás conoce el desfase de nadie (SPIKE §2.1): cada cliente traduce el
// `faseInicioMs` que difunde la vista a SU hora local.
//
// A diferencia del latido (strings literales), estos frames llevan payload
// variable (timestamps), así que el detector chequea el PREFIJO antes de parsear
// — O(10) sobre cada mensaje, sin escanear vistas de varios KB.
//
// Es lógica pura: temporizadores INYECTABLES (los de latido.ts), relojes
// inyectables, cero dependencias. Browser-safe: lo importan el adaptador ws del
// server y los adaptadores del navegador (LAN y WebRTC).

import type { ProgramarIntervalo } from "./latido.js";
import { intervaloReal } from "./latido.js";

// ── Frames ─────────────────────────────────────────────────────────────────

/** Los frames SIEMPRE se serializan con `__sinc` como primera clave. */
export const PREFIJO_SINC = '{"__sinc":';

export interface PingSincronia {
  readonly tipo: "ping";
  /** `Date.now()` del cliente al enviar. */
  readonly t0: number;
}

export interface PongSincronia {
  readonly tipo: "pong";
  /** El t0 del ping, devuelto intacto para casar la muestra. */
  readonly t0: number;
  /** `Date.now()` del host al responder. */
  readonly t1: number;
}

export type FrameSincronia = PingSincronia | PongSincronia;

/** Frame que el cliente manda para muestrear el reloj del host. */
export function pingSincronia(t0: number): string {
  return `{"__sinc":"ping","t0":${t0}}`;
}

/** Respuesta del host a un ping: t0 intacto + su propia hora. */
export function pongSincronia(t0: number, t1: number): string {
  return `{"__sinc":"pong","t0":${t0},"t1":${t1}}`;
}

/**
 * Si `datos` es un frame de sincronía, lo devuelve parseado; si no, null.
 * Los adaptadores lo usan para CONSUMIR el frame sin entregarlo a sus oyentes.
 * Un frame con el prefijo pero malformado también devuelve null: cae al camino
 * normal y el orquestador responde `mensajeInvalido` (no desaparece en silencio).
 */
export function frameSincronia(datos: string): FrameSincronia | null {
  if (!datos.startsWith(PREFIJO_SINC)) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(datos);
  } catch {
    return null;
  }
  if (typeof crudo !== "object" || crudo === null) return null;
  const campos = crudo as Record<string, unknown>;
  const t0 = campos["t0"];
  if (typeof t0 !== "number" || !Number.isFinite(t0)) return null;
  const marca = campos["__sinc"];
  if (marca === "ping") return { tipo: "ping", t0 };
  if (marca === "pong") {
    const t1 = campos["t1"];
    if (typeof t1 !== "number" || !Number.isFinite(t1)) return null;
    return { tipo: "pong", t0, t1 };
  }
  return null;
}

/**
 * La respuesta que el ADAPTADOR SERVIDOR manda por send directo ante un frame
 * ya detectado: pong para un ping, nada para todo lo demás (un pong recibido
 * por el servidor se consume en silencio).
 */
export function responderSincronia(frame: FrameSincronia, ahoraMs: number): string | null {
  return frame.tipo === "ping" ? pongSincronia(frame.t0, ahoraMs) : null;
}

// ── Arranque sincronizado ──────────────────────────────────────────────────

/**
 * Colchón sobre `faseInicioMs` para que el instante de arranque del audio caiga
 * en el FUTURO de todos los clientes: el orquestador estampa `faseInicioMs`
 * cuando la fase YA arrancó, y a eso se suma el vuelo de la difusión. Debe
 * superar el one-way típico + el error de offset. Todos los clientes derivan el
 * MISMO instante absoluto del MISMO `faseInicioMs`, así que arrancan juntos.
 */
export const MARGEN_ARRANQUE_MS = 500;

/** Instante (reloj del HOST) en que todos deben disparar `play()`. */
export function instanteArranqueHost(faseInicioMs: number): number {
  return faseInicioMs + MARGEN_ARRANQUE_MS;
}

// ── Estimador de offset (lado cliente) ─────────────────────────────────────

/** Muestras de la ráfaga inicial (offset usable en ~1 s, caliente en el lobby). */
export const MUESTRAS_RAFAGA = 5;
export const INTERVALO_RAFAGA_MS = 250;
/** Cadencia de mantenimiento tras la ráfaga. */
export const INTERVALO_SINC_MS = 5_000;
/** Cuántas muestras recientes considera el filtro de mínimo RTT. */
export const VENTANA_MUESTRAS = 8;
/** Un RTT mayor no es red: es el scheduler congelado (background). Se descarta. */
export const RTT_MAXIMO_MS = 2_000;
/**
 * Si el RTT medido con `Date.now` y con `performance.now` divergen más que
 * esto, el reloj de pared SALTÓ entre t0 y t2 (NTP, resume de suspensión): la
 * muestra pasa el filtro de mínimo RTT con un offset catastrófico, así que se
 * descarta por divergencia. El monótono no salta jamás; el de pared sí.
 */
export const DIVERGENCIA_RELOJ_MS = 50;

export interface OpcionesEstimador {
  /** Cómo enviar un ping ya serializado (p. ej. socket.send(frame)). */
  readonly enviarPing: (frame: string) => void;
  /** Aviso tras cada muestra ACEPTADA, con el offset vigente. */
  readonly alActualizar?: (offsetMs: number) => void;
  readonly muestrasRafaga?: number;
  readonly intervaloRafagaMs?: number;
  readonly intervaloMs?: number;
  readonly ventana?: number;
  readonly rttMaximoMs?: number;
  readonly divergenciaRelojMs?: number;
  readonly intervalo?: ProgramarIntervalo;
  /** Reloj de pared (dominio del offset: `faseInicioMs` es Date.now del host). */
  readonly ahora?: () => number;
  /** Reloj monótono, solo para medir RTT sin sufrir saltos del de pared. */
  readonly monotono?: () => number;
}

interface Muestra {
  readonly offsetMs: number;
  readonly rttMs: number;
}

/**
 * Estimador NTP-simplificado del desfase contra el reloj del host:
 * `offset = t1 - (t0 + t2) / 2`, quedándose con la muestra de MENOR RTT de la
 * ventana (menos cola de red ⇒ menos error). Sin muestras el offset es 0 — la
 * garantía formal del modo entrenamiento: un jugador solo no sufre traslación.
 */
export class EstimadorOffset {
  private readonly enviarPing: (frame: string) => void;
  private readonly alActualizar: ((offsetMs: number) => void) | null;
  private readonly muestrasRafaga: number;
  private readonly intervaloRafagaMs: number;
  private readonly intervaloMs: number;
  private readonly ventana: number;
  private readonly rttMaximoMs: number;
  private readonly divergenciaRelojMs: number;
  private readonly intervalo: ProgramarIntervalo;
  private readonly ahora: () => number;
  private readonly monotono: () => number;

  /** t0 → instante monótono del envío, para casar el pong y medir su RTT. */
  private readonly pendientes = new Map<number, number>();
  private muestrasVentana: Muestra[] = [];
  private cancelarIntervalo: (() => void) | null = null;
  private detenido = false;

  constructor(opciones: OpcionesEstimador) {
    this.enviarPing = opciones.enviarPing;
    this.alActualizar = opciones.alActualizar ?? null;
    this.muestrasRafaga = opciones.muestrasRafaga ?? MUESTRAS_RAFAGA;
    this.intervaloRafagaMs = opciones.intervaloRafagaMs ?? INTERVALO_RAFAGA_MS;
    this.intervaloMs = opciones.intervaloMs ?? INTERVALO_SINC_MS;
    this.ventana = opciones.ventana ?? VENTANA_MUESTRAS;
    this.rttMaximoMs = opciones.rttMaximoMs ?? RTT_MAXIMO_MS;
    this.divergenciaRelojMs = opciones.divergenciaRelojMs ?? DIVERGENCIA_RELOJ_MS;
    this.intervalo = opciones.intervalo ?? intervaloReal;
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.monotono = opciones.monotono ?? (() => performance.now());
  }

  /** Offset vigente (ms que el reloj del host va POR DELANTE del local); 0 sin muestras. */
  get offsetMs(): number {
    return this.mejorMuestra()?.offsetMs ?? 0;
  }

  /** RTT de la mejor muestra de la ventana, o null sin muestras. */
  get rttMs(): number | null {
    return this.mejorMuestra()?.rttMs ?? null;
  }

  /** Cuántas muestras ACEPTADAS hay en la ventana. */
  get muestras(): number {
    return this.muestrasVentana.length;
  }

  /** Arranca la ráfaga inicial y luego la cadencia de mantenimiento. */
  iniciar(): void {
    this.resincronizar();
  }

  /**
   * Re-ráfaga inmediata: al volver de segundo plano (visibilitychange) o tras
   * un silencio largo, la ventana puede estar envenenada de muestras congeladas
   * y conviene repoblarla rápido.
   */
  resincronizar(): void {
    if (this.detenido) return;
    this.cancelarIntervalo?.();
    this.cancelarIntervalo = null;
    this.mandarPing();
    let restantes = this.muestrasRafaga - 1;
    if (restantes <= 0) {
      this.pasarACadencia();
      return;
    }
    this.cancelarIntervalo = this.intervalo(this.intervaloRafagaMs, () => {
      this.mandarPing();
      restantes -= 1;
      if (restantes <= 0) this.pasarACadencia();
    });
  }

  /** Llamar con cada frame pong recibido; las muestras sucias se descartan. */
  registrarPong(frame: PongSincronia): void {
    const mono0 = this.pendientes.get(frame.t0);
    if (mono0 === undefined) return; // pong huérfano o duplicado: se ignora.
    this.pendientes.delete(frame.t0);

    const t2 = this.ahora();
    const rttReloj = t2 - frame.t0;
    const rttMono = this.monotono() - mono0;
    // Congelado por el scheduler (background): no es una medición de red.
    if (rttMono < 0 || rttMono > this.rttMaximoMs) return;
    // El reloj de pared saltó entre t0 y t2 (NTP/suspensión): offset inválido.
    if (Math.abs(rttReloj - rttMono) > this.divergenciaRelojMs) return;

    const offsetMs = frame.t1 - (frame.t0 + t2) / 2;
    this.muestrasVentana.push({ offsetMs, rttMs: rttMono });
    if (this.muestrasVentana.length > this.ventana) this.muestrasVentana.shift();
    this.alActualizar?.(this.offsetMs);
  }

  detener(): void {
    this.detenido = true;
    this.cancelarIntervalo?.();
    this.cancelarIntervalo = null;
    this.pendientes.clear();
  }

  private mejorMuestra(): Muestra | null {
    let mejor: Muestra | null = null;
    for (const muestra of this.muestrasVentana) {
      if (mejor === null || muestra.rttMs < mejor.rttMs) mejor = muestra;
    }
    return mejor;
  }

  private mandarPing(): void {
    const t0 = this.ahora();
    const mono0 = this.monotono();
    // Poda de pings que jamás recibirán respuesta (canal mudo, pong perdido):
    // el mapa no debe crecer sin techo durante una sesión larga.
    for (const [t0Viejo, monoViejo] of this.pendientes) {
      if (mono0 - monoViejo > this.rttMaximoMs * 2) this.pendientes.delete(t0Viejo);
    }
    this.pendientes.set(t0, mono0);
    this.enviarPing(pingSincronia(t0));
  }

  private pasarACadencia(): void {
    this.cancelarIntervalo?.();
    this.cancelarIntervalo = this.intervalo(this.intervaloMs, () => {
      this.mandarPing();
    });
  }
}
