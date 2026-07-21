// Tests de la sincronía de reloj: el detector de frames (la puerta que decide
// qué consume el adaptador y qué sigue al orquestador) y el estimador de offset
// con relojes y temporizadores inyectados — cero tiempo real, como latido.test.ts.

import { describe, expect, it } from "vitest";

import type { ProgramarIntervalo } from "./latido.js";
import { PING } from "./latido.js";
import type { PongSincronia } from "./sincroniaReloj.js";
import {
  EstimadorOffset,
  frameSincronia,
  instanteArranqueHost,
  MARGEN_ARRANQUE_MS,
  pingSincronia,
  pongSincronia,
  PREFIJO_SINC,
  responderSincronia,
} from "./sincroniaReloj.js";

// ── Detector de frames ─────────────────────────────────────────────────────

describe("frameSincronia", () => {
  it("detecta y parsea un ping y un pong bien formados", () => {
    expect(frameSincronia(pingSincronia(123))).toEqual({ tipo: "ping", t0: 123 });
    expect(frameSincronia(pongSincronia(123, 456))).toEqual({
      tipo: "pong",
      t0: 123,
      t1: 456,
    });
  });

  it("los constructores garantizan el prefijo (así el detector es O(prefijo))", () => {
    expect(pingSincronia(1).startsWith(PREFIJO_SINC)).toBe(true);
    expect(pongSincronia(1, 2).startsWith(PREFIJO_SINC)).toBe(true);
  });

  it("no confunde mensajes del juego, ni un nickname '__sinc', ni el latido", () => {
    expect(frameSincronia('{"tipo":"unirse","nombre":"__sinc","juego":"meloquiz"}')).toBeNull();
    expect(frameSincronia('{"tipo":"votar","opcionId":"__sinc"}')).toBeNull();
    expect(frameSincronia(PING)).toBeNull();
    expect(frameSincronia("")).toBeNull();
  });

  it("un frame con prefijo pero malformado devuelve null (cae al camino normal)", () => {
    expect(frameSincronia('{"__sinc":')).toBeNull(); // JSON roto
    expect(frameSincronia('{"__sinc":"ping"}')).toBeNull(); // sin t0
    expect(frameSincronia('{"__sinc":"ping","t0":"123"}')).toBeNull(); // t0 string
    expect(frameSincronia('{"__sinc":"ping","t0":null}')).toBeNull();
    expect(frameSincronia('{"__sinc":"pong","t0":1}')).toBeNull(); // pong sin t1
    expect(frameSincronia('{"__sinc":"otro","t0":1}')).toBeNull(); // marca desconocida
  });
});

describe("responderSincronia", () => {
  it("responde un ping con un pong que conserva t0 y estampa la hora del host", () => {
    const frame = frameSincronia(pingSincronia(111));
    if (frame === null) throw new Error("el ping no se detectó");
    expect(responderSincronia(frame, 999)).toBe(pongSincronia(111, 999));
  });

  it("un pong recibido por el servidor se consume en silencio (sin respuesta)", () => {
    const frame = frameSincronia(pongSincronia(1, 2));
    if (frame === null) throw new Error("el pong no se detectó");
    expect(responderSincronia(frame, 999)).toBeNull();
  });
});

describe("instanteArranqueHost", () => {
  it("es faseInicioMs + el margen compartido: el MISMO número para todos", () => {
    expect(instanteArranqueHost(10_000)).toBe(10_000 + MARGEN_ARRANQUE_MS);
  });
});

// ── Estimador de offset ────────────────────────────────────────────────────

/** Temporizadores manuales: registran los intervalos y se disparan a mano. */
class Temporizadores {
  readonly registrados: { ms: number; fn: () => void; activo: boolean }[] = [];

  readonly programar: ProgramarIntervalo = (ms, fn) => {
    const entrada = { ms, fn, activo: true };
    this.registrados.push(entrada);
    return () => {
      entrada.activo = false;
    };
  };

  activos(): number[] {
    return this.registrados.filter((e) => e.activo).map((e) => e.ms);
  }

  /** Dispara UNA vez cada intervalo activo con ese período. */
  tick(ms: number): void {
    for (const e of [...this.registrados]) {
      if (e.activo && e.ms === ms) e.fn();
    }
  }
}

/** Banco de pruebas: relojes manuales + captura de pings + pong simulable. */
function banco(opciones: { offsetHost?: number } = {}) {
  const offsetHost = opciones.offsetHost ?? 0;
  const relojes = { pared: 1_000_000, mono: 5_000 };
  const temporizadores = new Temporizadores();
  const enviados: string[] = [];
  const actualizaciones: number[] = [];

  const estimador = new EstimadorOffset({
    enviarPing: (frame) => enviados.push(frame),
    alActualizar: (offset) => actualizaciones.push(offset),
    intervalo: temporizadores.programar,
    ahora: () => relojes.pared,
    monotono: () => relojes.mono,
  });

  /** Avanza los DOS relojes a la vez (el tiempo pasa normal). */
  const avanzar = (ms: number): void => {
    relojes.pared += ms;
    relojes.mono += ms;
  };

  /** Toma el último ping enviado y lo responde como un host a `unaVia` ms. */
  const responderUltimo = (unaVia: number): void => {
    const ultimo = enviados[enviados.length - 1];
    if (ultimo === undefined) throw new Error("no hay ping que responder");
    const frame = frameSincronia(ultimo);
    if (frame === null || frame.tipo !== "ping") throw new Error("no era un ping");
    avanzar(unaVia); // ida
    const t1 = relojes.pared + offsetHost; // la hora del host
    avanzar(unaVia); // vuelta
    const pong = frameSincronia(pongSincronia(frame.t0, t1));
    if (pong === null || pong.tipo !== "pong") throw new Error("pong ilegible");
    estimador.registrarPong(pong);
  };

  return { estimador, temporizadores, enviados, actualizaciones, relojes, avanzar, responderUltimo };
}

describe("EstimadorOffset", () => {
  it("sin muestras: offset 0, rtt null — la garantía del modo entrenamiento", () => {
    const { estimador } = banco();
    expect(estimador.muestras).toBe(0);
    expect(estimador.offsetMs).toBe(0);
    expect(estimador.rttMs).toBeNull();
  });

  it("iniciar() manda un ping YA y completa la ráfaga antes de pasar a cadencia", () => {
    const { estimador, temporizadores, enviados } = banco();
    estimador.iniciar();
    expect(enviados).toHaveLength(1); // el primero es inmediato: caliente en el lobby
    expect(temporizadores.activos()).toEqual([250]);

    for (let i = 0; i < 4; i++) temporizadores.tick(250);
    expect(enviados).toHaveLength(5); // MUESTRAS_RAFAGA
    expect(temporizadores.activos()).toEqual([5_000]); // la ráfaga cedió a la cadencia

    temporizadores.tick(5_000);
    expect(enviados).toHaveLength(6);
    estimador.detener();
    expect(temporizadores.activos()).toEqual([]);
  });

  it("estima el offset del host con la fórmula NTP sobre un viaje simétrico", () => {
    const { estimador, actualizaciones, responderUltimo } = banco({ offsetHost: 3_000 });
    estimador.iniciar();
    responderUltimo(10);
    expect(estimador.muestras).toBe(1);
    expect(estimador.offsetMs).toBe(3_000);
    expect(estimador.rttMs).toBe(20);
    expect(actualizaciones).toEqual([3_000]);
    estimador.detener();
  });

  it("se queda con la muestra de MENOR RTT de la ventana", () => {
    const { estimador, temporizadores, responderUltimo } = banco({ offsetHost: 1_000 });
    estimador.iniciar();
    responderUltimo(400); // rtt 800: viaje lento, offset igual pero menos confiable
    temporizadores.tick(250);
    responderUltimo(5); // rtt 10: la buena
    expect(estimador.muestras).toBe(2);
    expect(estimador.rttMs).toBe(10);
    expect(estimador.offsetMs).toBe(1_000);
    estimador.detener();
  });

  it("descarta un RTT mayor al máximo: es el scheduler congelado, no la red", () => {
    const { estimador, responderUltimo } = banco({ offsetHost: 1_000 });
    estimador.iniciar();
    responderUltimo(1_500); // rtt 3000 > RTT_MAXIMO_MS
    expect(estimador.muestras).toBe(0);
    expect(estimador.offsetMs).toBe(0);
    estimador.detener();
  });

  it("descarta la muestra si el reloj de pared saltó entre t0 y t2 (NTP/suspensión)", () => {
    const { estimador, enviados, relojes } = banco();
    estimador.iniciar();
    const frame = frameSincronia(enviados[0] ?? "");
    if (frame === null || frame.tipo !== "ping") throw new Error("no hubo ping");

    // El viaje real dura 20 ms (monótono), pero el reloj de pared salta 5 s:
    // el RTT de pared parecería 5 020 ms… y el offset saldría corrido ~2.5 s.
    relojes.mono += 20;
    relojes.pared += 5_020;
    const pong = frameSincronia(pongSincronia(frame.t0, relojes.pared - 10));
    if (pong === null || pong.tipo !== "pong") throw new Error("pong ilegible");
    estimador.registrarPong(pong);

    expect(estimador.muestras).toBe(0); // descartada por divergencia
    expect(estimador.offsetMs).toBe(0);
    estimador.detener();
  });

  it("ignora un pong huérfano (t0 desconocido) y uno duplicado", () => {
    const { estimador, responderUltimo } = banco({ offsetHost: 500 });
    estimador.iniciar();
    estimador.registrarPong({ tipo: "pong", t0: 42, t1: 999 } satisfies PongSincronia);
    expect(estimador.muestras).toBe(0);

    responderUltimo(10);
    expect(estimador.muestras).toBe(1);
    // Reinyectar el mismo t0: ya no está pendiente, no crea otra muestra.
    const frame = frameSincronia(pingSincronia(1));
    void frame;
    estimador.registrarPong({ tipo: "pong", t0: 1, t1: 2 });
    expect(estimador.muestras).toBe(1);
    estimador.detener();
  });

  it("la ventana desliza: las muestras viejas dejan de pesar", () => {
    const { estimador, temporizadores, responderUltimo } = banco({ offsetHost: 0 });
    estimador.iniciar();
    responderUltimo(5); // rtt 10, la mejor… hasta que salga de la ventana
    for (let i = 0; i < 10; i++) {
      temporizadores.tick(temporizadores.activos()[0] === 250 ? 250 : 5_000);
      responderUltimo(50); // rtt 100
    }
    // VENTANA_MUESTRAS = 8: la muestra de rtt 10 ya se cayó.
    expect(estimador.muestras).toBe(8);
    expect(estimador.rttMs).toBe(100);
    estimador.detener();
  });

  it("resincronizar() dispara otra ráfaga (el gancho de visibilitychange)", () => {
    const { estimador, temporizadores, enviados } = banco();
    estimador.iniciar();
    for (let i = 0; i < 4; i++) temporizadores.tick(250);
    expect(temporizadores.activos()).toEqual([5_000]);

    estimador.resincronizar();
    expect(enviados).toHaveLength(6); // ping inmediato de la re-ráfaga
    expect(temporizadores.activos()).toEqual([250]); // y la cadencia quedó cancelada
    estimador.detener();
  });

  it("detener() es definitivo: ni resincronizar() lo revive", () => {
    const { estimador, temporizadores, enviados } = banco();
    estimador.iniciar();
    estimador.detener();
    estimador.resincronizar();
    expect(enviados).toHaveLength(1); // solo el ping del iniciar()
    expect(temporizadores.activos()).toEqual([]);
  });
});
