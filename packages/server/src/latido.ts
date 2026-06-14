// Latido (heartbeat) del transporte: detecta sockets "muertos sin cerrar"
// (zombis) que cuelgan la partida en LAN. Vive en la CAPA DE TRANSPORTE, no en
// el orquestador: son frames de control que los adaptadores LAN consumen y NUNCA
// pasan a sus oyentes (así el orquestador jamás ve un "mensajeInvalido").
//
// Es lógica pura: solo usa setInterval/setTimeout (presentes en Node y en el
// navegador), con temporizadores INYECTABLES para tests deterministas. Por eso
// puede importarlo tanto el adaptador del server (ws) como el del navegador
// (WebSocket nativo) sin arrastrar dependencias.

/** Frame de control que el cliente manda para probar que el canal sigue vivo. */
export const PING = '{"__lat":"ping"}';
/** Respuesta del servidor a un PING. */
export const PONG = '{"__lat":"pong"}';

export type TipoLatido = "ping" | "pong";

/**
 * Si `datos` es un frame de control del latido, devuelve su tipo; si no, null.
 * Los adaptadores lo usan para CONSUMIR el frame sin entregarlo a sus oyentes.
 */
export function frameLatido(datos: string): TipoLatido | null {
  if (datos === PING) return "ping";
  if (datos === PONG) return "pong";
  return null;
}

/** Cada cuánto el cliente manda un ping (ms). */
export const INTERVALO_PING_MS = 4_000;
/** Sin tráfico durante este lapso, el canal se da por muerto (ms). */
export const TIMEOUT_SILENCIO_MS = 12_000;
/** Cada cuánto el servidor sondea sus sockets con ping nativo de ws (ms). */
export const INTERVALO_SONDEO_MS = 5_000;

/** Programa un callback periódico; devuelve una función para cancelarlo. */
export type ProgramarIntervalo = (ms: number, fn: () => void) => () => void;
/** Programa un callback diferido; devuelve una función para cancelarlo. */
export type ProgramarTimeout = (ms: number, fn: () => void) => () => void;

// Las versiones reales cierran sobre el id con su tipo de plataforma (number en
// el navegador, Timeout en Node), así no hace falta ningún cast.
export const intervaloReal: ProgramarIntervalo = (ms, fn) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

export const timeoutReal: ProgramarTimeout = (ms, fn) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * Vigía de silencio: si no se llama `reiniciar()` dentro de `ms`, dispara
 * `alVencer()`. Se reinicia ante cualquier tráfico recibido para confirmar que
 * el canal sigue vivo.
 */
export class Watchdog {
  private cancelar: (() => void) | null = null;

  constructor(
    private readonly ms: number,
    private readonly alVencer: () => void,
    private readonly programar: ProgramarTimeout = timeoutReal,
  ) {}

  reiniciar(): void {
    this.cancelar?.();
    this.cancelar = this.programar(this.ms, () => {
      this.cancelar = null;
      this.alVencer();
    });
  }

  detener(): void {
    this.cancelar?.();
    this.cancelar = null;
  }
}

export interface OpcionesLatido {
  /** Cómo enviar un ping por el socket (p. ej. socket.send(PING)). */
  readonly enviarPing: () => void;
  /** Qué hacer cuando vence el silencio (p. ej. cerrar el socket). */
  readonly alMorir: () => void;
  readonly intervaloPingMs?: number;
  readonly timeoutSilencioMs?: number;
  readonly intervalo?: ProgramarIntervalo;
  readonly timeout?: ProgramarTimeout;
}

/**
 * Latido del lado cliente: envía pings periódicos y vigila el silencio. Lo usan
 * tanto el adaptador Node (`TransporteLanCliente`) como el del navegador
 * (`TransporteLanNavegador`); el servidor responde cada ping con un PONG.
 */
export class Latido {
  private cancelarIntervalo: (() => void) | null = null;
  private readonly watchdog: Watchdog;
  private readonly enviarPing: () => void;
  private readonly intervaloPingMs: number;
  private readonly intervalo: ProgramarIntervalo;

  constructor(opciones: OpcionesLatido) {
    this.enviarPing = opciones.enviarPing;
    this.intervaloPingMs = opciones.intervaloPingMs ?? INTERVALO_PING_MS;
    this.intervalo = opciones.intervalo ?? intervaloReal;
    this.watchdog = new Watchdog(
      opciones.timeoutSilencioMs ?? TIMEOUT_SILENCIO_MS,
      opciones.alMorir,
      opciones.timeout ?? timeoutReal,
    );
  }

  /** Arranca el envío periódico de pings y el vigía de silencio. */
  iniciar(): void {
    this.cancelarIntervalo = this.intervalo(this.intervaloPingMs, () => {
      this.enviarPing();
    });
    this.watchdog.reiniciar();
  }

  /** Llamar ante CUALQUIER dato recibido: confirma que el canal sigue vivo. */
  registrarTrafico(): void {
    this.watchdog.reiniciar();
  }

  /** Ping inmediato fuera del ritmo (p. ej. al volver de segundo plano). */
  pingAhora(): void {
    this.enviarPing();
  }

  detener(): void {
    this.cancelarIntervalo?.();
    this.cancelarIntervalo = null;
    this.watchdog.detener();
  }
}
