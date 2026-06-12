// Test (b) de la fase: dos clientes reales conectados por WebSocket (ws)
// al adaptador LAN juegan una partida completa por mensajes. Es el mismo
// conductor guionizado del test en memoria: solo cambia el transporte,
// que es exactamente lo que la costura promete.

import { afterEach, describe, expect, it } from "vitest";
import { Orquestador } from "./orquestador.js";
import { TransporteLanCliente, TransporteLanServidor } from "./transporteLan.js";
import {
  cartasFiltradasEnVista,
  fabricaMazoParaMano,
  GUIONES,
  jugarPartidaGuionizada,
} from "./pruebas/guion.js";

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
