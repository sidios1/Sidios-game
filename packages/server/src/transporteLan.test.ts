// Test (b) de la fase: dos clientes reales conectados por WebSocket (ws)
// al adaptador LAN juegan una partida completa por mensajes. Es el mismo
// conductor guionizado del test en memoria: solo cambia el transporte,
// que es exactamente lo que la costura promete.

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Orquestador } from "./orquestador.js";
import { TransporteLanCliente, TransporteLanServidor } from "./transporteLan.js";
import type { ProgramarIntervalo, ProgramarTimeout } from "./latido.js";
import { PING, PONG } from "./latido.js";
import type { OyentesServidor } from "./transporte.js";
import {
  cartasFiltradasEnVista,
  fabricaMazoParaMano,
  GUIONES,
  jugarPartidaGuionizada,
} from "./pruebas/guion.js";

/** Temporizadores manuales para probar el latido sin esperas reales. */
class Relojes {
  private timeouts = new Map<number, () => void>();
  private contador = 0;

  readonly timeout: ProgramarTimeout = (_ms, fn) => {
    const id = this.contador++;
    this.timeouts.set(id, fn);
    return () => {
      this.timeouts.delete(id);
    };
  };

  // El sondeo del server no se usa en estos tests: intervalo inerte.
  readonly intervalo: ProgramarIntervalo = () => () => {};

  vencerTimeouts(): void {
    const aDisparar = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const fn of aDisparar) fn();
  }
}

function oyentesEspia(): {
  oyentes: OyentesServidor;
  conectados: string[];
  desconectados: string[];
  recibidos: Array<[string, string]>;
} {
  const conectados: string[] = [];
  const desconectados: string[] = [];
  const recibidos: Array<[string, string]> = [];
  return {
    conectados,
    desconectados,
    recibidos,
    oyentes: {
      alConectar: (id) => conectados.push(id),
      alDesconectar: (id) => desconectados.push(id),
      alRecibir: (id, datos) => recibidos.push([id, datos]),
    },
  };
}

describe("transporte LAN: partida completa por WebSocket", () => {
  let orquestador: Orquestador | null = null;

  afterEach(async () => {
    // No dejar puertos abiertos aunque el test falle.
    await orquestador?.detener();
    orquestador = null;
  });

  it(
    "dos clientes juegan las 9 manos contra el host por la red local",
    { timeout: 20_000 },
    async () => {
      const transporte = new TransporteLanServidor({
        puerto: 0,
        ipAnunciada: "127.0.0.1",
      });
      orquestador = new Orquestador({
        transporte,
        mazoParaMano: fabricaMazoParaMano(GUIONES),
      });
      const codigo = await orquestador.iniciar();
      expect(codigo).toMatch(/^127\.0\.0\.1:\d+$/);

      const registros = await jugarPartidaGuionizada(
        codigo,
        [new TransporteLanCliente(), new TransporteLanCliente()],
        GUIONES,
      );

      expect(registros).toHaveLength(2);
      for (const registro of registros) {
        expect(registro.errores).toEqual([]);
        const manosVistas = new Set(registro.vistas.map((v) => v.manoActual));
        expect([...manosVistas].sort((a, b) => a - b)).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
        // La información oculta también se respeta a través del cable real.
        for (const vista of registro.vistas) {
          expect(cartasFiltradasEnVista(vista)).toEqual([]);
        }
        const final = registro.vistas[registro.vistas.length - 1];
        expect(final?.fase).toBe("partidaTerminada");
        expect(final?.ganadoresIds).not.toBeNull();
        expect(final?.resumenMano).not.toBeNull();
      }
      const finales = registros.map((r) => r.vistas[r.vistas.length - 1]);
      expect(finales[0]?.ganadoresIds).toEqual(finales[1]?.ganadoresIds);
    },
  );

  it("rechaza códigos de sala malformados sin tocar la red", async () => {
    const cliente = new TransporteLanCliente();
    await expect(
      cliente.conectar("sin-puerto", { alRecibir: () => {}, alDesconectar: () => {} }),
    ).rejects.toThrow("código de sala inválido");
  });
});

describe("transporte LAN: latido (heartbeat)", () => {
  let servidor: TransporteLanServidor | null = null;
  let crudo: WebSocket | null = null;

  afterEach(async () => {
    crudo?.close();
    crudo = null;
    await servidor?.detener();
    servidor = null;
  });

  it("responde PONG a un PING app-level sin entregarlo al orquestador", async () => {
    const espia = oyentesEspia();
    servidor = new TransporteLanServidor({ puerto: 0, ipAnunciada: "127.0.0.1" });
    const codigo = await servidor.iniciar(espia.oyentes);

    const cliente = new WebSocket(`ws://${codigo}`);
    crudo = cliente;
    const pong = await new Promise<string>((resolver, rechazar) => {
      cliente.on("open", () => cliente.send(PING));
      cliente.on("message", (datos) => resolver(datos.toString()));
      cliente.on("error", rechazar);
    });

    expect(pong).toBe(PONG);
    // El frame de control NO llega a los oyentes (sería "mensajeInvalido").
    expect(espia.recibidos).toEqual([]);
  });

  it("termina una conexión zombi cuando vence el vigía de silencio", async () => {
    const relojes = new Relojes();
    const espia = oyentesEspia();
    servidor = new TransporteLanServidor({
      puerto: 0,
      ipAnunciada: "127.0.0.1",
      intervalo: relojes.intervalo,
      timeout: relojes.timeout,
    });
    const codigo = await servidor.iniciar(espia.oyentes);

    const cliente = new WebSocket(`ws://${codigo}`);
    crudo = cliente;
    const cerrado = new Promise<void>((resolver) => cliente.on("close", () => resolver()));
    await new Promise<void>((resolver, rechazar) => {
      cliente.on("open", () => resolver());
      cliente.on("error", rechazar);
    });
    // Espera a que el server registre la conexión y arme su vigía.
    await new Promise((r) => setTimeout(r, 0));
    expect(espia.conectados).toHaveLength(1);

    // El cliente queda ocioso (no manda nada): al vencer el silencio, terminate().
    relojes.vencerTimeouts();
    await cerrado;
    await new Promise((r) => setTimeout(r, 0));
    expect(espia.desconectados).toEqual(espia.conectados);
  });
});
