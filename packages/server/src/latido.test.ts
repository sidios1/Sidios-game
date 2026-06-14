// Tests del helper de latido: frames de control, vigía de silencio y el Latido
// del cliente. Todos los temporizadores son MANUALES, así no hay esperas reales.

import { describe, expect, it } from "vitest";
import type { ProgramarIntervalo, ProgramarTimeout } from "./latido.js";
import { frameLatido, Latido, PING, PONG, Watchdog } from "./latido.js";

/** Temporizadores manuales: acumulan los callbacks y se disparan a mano. */
class Relojes {
  private timeouts = new Map<number, () => void>();
  private intervalos = new Map<number, () => void>();
  private contador = 0;

  readonly timeout: ProgramarTimeout = (_ms, fn) => {
    const id = this.contador++;
    this.timeouts.set(id, fn);
    return () => {
      this.timeouts.delete(id);
    };
  };

  readonly intervalo: ProgramarIntervalo = (_ms, fn) => {
    const id = this.contador++;
    this.intervalos.set(id, fn);
    return () => {
      this.intervalos.delete(id);
    };
  };

  /** Dispara los timeouts pendientes (los de un solo uso se descartan). */
  vencerTimeouts(): void {
    const aDisparar = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const fn of aDisparar) fn();
  }

  /** Dispara cada intervalo una vez (siguen registrados, como un setInterval). */
  pulsarIntervalos(): void {
    for (const fn of [...this.intervalos.values()]) fn();
  }

  get intervalosActivos(): number {
    return this.intervalos.size;
  }
}

describe("frameLatido", () => {
  it("reconoce ping y pong y deja pasar lo demás", () => {
    expect(frameLatido(PING)).toBe("ping");
    expect(frameLatido(PONG)).toBe("pong");
    expect(frameLatido('{"tipo":"robarDelMazo"}')).toBeNull();
    expect(frameLatido("")).toBeNull();
  });
});

describe("Watchdog", () => {
  it("dispara alVencer si no se reinicia a tiempo", () => {
    const relojes = new Relojes();
    let muerto = false;
    const wd = new Watchdog(100, () => (muerto = true), relojes.timeout);
    wd.reiniciar();
    relojes.vencerTimeouts();
    expect(muerto).toBe(true);
  });

  it("reiniciar() pospone el vencimiento", () => {
    const relojes = new Relojes();
    let muerto = false;
    const wd = new Watchdog(100, () => (muerto = true), relojes.timeout);
    wd.reiniciar();
    wd.reiniciar(); // cancela el anterior y reprograma
    relojes.vencerTimeouts();
    // Solo el último timeout sigue vivo: un único disparo.
    expect(muerto).toBe(true);
  });

  it("detener() cancela el vencimiento", () => {
    const relojes = new Relojes();
    let muerto = false;
    const wd = new Watchdog(100, () => (muerto = true), relojes.timeout);
    wd.reiniciar();
    wd.detener();
    relojes.vencerTimeouts();
    expect(muerto).toBe(false);
  });
});

describe("Latido (cliente)", () => {
  it("envía pings periódicos y muere por silencio", () => {
    const relojes = new Relojes();
    const pings: number[] = [];
    let muerto = false;
    const latido = new Latido({
      enviarPing: () => pings.push(1),
      alMorir: () => (muerto = true),
      intervalo: relojes.intervalo,
      timeout: relojes.timeout,
    });
    latido.iniciar();
    relojes.pulsarIntervalos();
    relojes.pulsarIntervalos();
    expect(pings.length).toBe(2);
    relojes.vencerTimeouts();
    expect(muerto).toBe(true);
  });

  it("registrarTrafico() reinicia el vigía y evita la muerte", () => {
    const relojes = new Relojes();
    let muerto = false;
    const latido = new Latido({
      enviarPing: () => {},
      alMorir: () => (muerto = true),
      intervalo: relojes.intervalo,
      timeout: relojes.timeout,
    });
    latido.iniciar();
    latido.registrarTrafico(); // cancela el timeout inicial y reprograma uno nuevo
    latido.detener(); // y al detener, ese también se cancela
    relojes.vencerTimeouts();
    expect(muerto).toBe(false);
  });

  it("detener() corta el envío de pings", () => {
    const relojes = new Relojes();
    const pings: number[] = [];
    const latido = new Latido({
      enviarPing: () => pings.push(1),
      alMorir: () => {},
      intervalo: relojes.intervalo,
      timeout: relojes.timeout,
    });
    latido.iniciar();
    expect(relojes.intervalosActivos).toBe(1);
    latido.detener();
    expect(relojes.intervalosActivos).toBe(0);
    relojes.pulsarIntervalos();
    expect(pings.length).toBe(0);
  });

  it("pingAhora() envía un ping fuera del ritmo", () => {
    const relojes = new Relojes();
    const pings: number[] = [];
    const latido = new Latido({
      enviarPing: () => pings.push(1),
      alMorir: () => {},
      intervalo: relojes.intervalo,
      timeout: relojes.timeout,
    });
    latido.iniciar();
    latido.pingAhora();
    expect(pings.length).toBe(1);
  });
});
