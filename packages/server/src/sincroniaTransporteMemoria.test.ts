// La invariante vale para TODO TransporteServidor, sin excepciones: los frames
// de sincronía se consumen en el adaptador y NUNCA llegan a los oyentes del
// orquestador (caerían en `accionJuego`/`mensajeInvalido`). El transporte en
// memoria solo se usa en tests, pero si un test de integración montara un
// estimador, el síntoma sería un `mensajeInvalido` sin relación aparente — este
// archivo compra esa sesión de debugging por tres asserts.

import { describe, expect, it } from "vitest";

import { frameSincronia, pingSincronia } from "./sincroniaReloj.js";
import { TransporteMemoria } from "./transporteMemoria.js";

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

describe("TransporteMemoria y la sincronía de reloj", () => {
  it("consume el ping, responde el pong directo y el oyente del servidor no ve nada", async () => {
    const recibidosServidor: string[] = [];
    const recibidosCliente: string[] = [];
    const transporte = new TransporteMemoria();
    const codigo = await transporte.iniciar({
      alConectar: () => {},
      alDesconectar: () => {},
      alRecibir: (_id, datos) => recibidosServidor.push(datos),
    });

    const cliente = transporte.crearCliente();
    await cliente.conectar(codigo, {
      alRecibir: (datos) => recibidosCliente.push(datos),
      alDesconectar: () => {},
    });

    const t0 = 123_456;
    cliente.enviar(pingSincronia(t0));
    await asentar();

    expect(recibidosServidor).toEqual([]); // jamás llegó al "orquestador"
    expect(recibidosCliente).toHaveLength(1);
    const pong = frameSincronia(recibidosCliente[0] ?? "");
    expect(pong?.tipo).toBe("pong");
    if (pong?.tipo === "pong") expect(pong.t0).toBe(t0);

    // Y un mensaje normal sigue pasando igual que siempre.
    cliente.enviar('{"tipo":"unirse","nombre":"Ana"}');
    await asentar();
    expect(recibidosServidor).toEqual(['{"tipo":"unirse","nombre":"Ana"}']);

    await transporte.detener();
  });
});
