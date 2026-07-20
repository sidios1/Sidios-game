// Round-trip del protocolo para los mensajes de config de la sala (Sesión 3):
// `actualizarConfig` (cliente → orquestador) y `configSala` (orquestador →
// clientes). La config viaja como blob OPACO: el protocolo solo valida "objeto
// presente"; su forma la revalida el motor.

import { describe, expect, it } from "vitest";
import {
  analizarMensajeCliente,
  analizarMensajeServidor,
  serializarCliente,
  serializarServidor,
} from "./protocolo.js";

describe("protocolo: actualizarConfig (cliente)", () => {
  it("acepta un objeto de config y lo devuelve tal cual (opaco)", () => {
    const config = { habilidadesPorJugador: 2, poolActivo: ["MISH", "SAPO"] };
    const parseado = analizarMensajeCliente(serializarCliente({ tipo: "actualizarConfig", config }));
    expect(parseado).toEqual({ tipo: "actualizarConfig", config });
  });

  it("rechaza config ausente, null o no-objeto", () => {
    expect(analizarMensajeCliente(JSON.stringify({ tipo: "actualizarConfig" }))).toBeNull();
    expect(
      analizarMensajeCliente(JSON.stringify({ tipo: "actualizarConfig", config: null })),
    ).toBeNull();
    expect(
      analizarMensajeCliente(JSON.stringify({ tipo: "actualizarConfig", config: [1, 2] })),
    ).toBeNull();
    expect(
      analizarMensajeCliente(JSON.stringify({ tipo: "actualizarConfig", config: "x" })),
    ).toBeNull();
  });
});

describe("protocolo: configSala (servidor)", () => {
  it("hace round-trip de un objeto de config", () => {
    const config = { visibilidad: "publica", rondas: { tipo: "corta", n: 3 } };
    const datos = serializarServidor({ tipo: "configSala", config });
    expect(analizarMensajeServidor(datos)).toEqual({ tipo: "configSala", config });
  });

  it("rechaza configSala sin un objeto config", () => {
    expect(analizarMensajeServidor(JSON.stringify({ tipo: "configSala" }))).toBeNull();
    expect(
      analizarMensajeServidor(JSON.stringify({ tipo: "configSala", config: null })),
    ).toBeNull();
    expect(
      analizarMensajeServidor(JSON.stringify({ tipo: "configSala", config: 5 })),
    ).toBeNull();
  });
});
