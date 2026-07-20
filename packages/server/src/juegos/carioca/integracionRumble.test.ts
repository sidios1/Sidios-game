// Integración de Rumble por el orquestador GENÉRICO sobre el transporte en memoria:
// la config viaja opaca por iniciarPartida y el host la revalida; cada jugador recibe
// una VistaRumble con sus habilidades; y el slice de habilidades SOBREVIVE a la
// reconexión por token (vive dentro del único `estado` del orquestador).

import { describe, expect, it } from "vitest";
import { crearGeneradorSemilla } from "@juegos/carioca-core";
import { CONFIG_DEFAULT } from "@juegos/rumble-core";
import { Orquestador } from "../../orquestador.js";
import type { MensajeCliente, MensajeServidor } from "../../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../../protocolo.js";
import type { TransporteCliente } from "../../transporte.js";
import { TransporteMemoria } from "../../transporteMemoria.js";
import type { VistaJuego } from "../../vistaJuego.js";
import type { VistaRumble } from "./vistaRumble.js";
import { crearMotorRumble } from "./motorRumble.js";

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

class Cliente {
  readonly mensajes: MensajeServidor[] = [];
  jugadorId = "";
  token = "";
  constructor(private readonly cliente: TransporteCliente) {}

  async conectar(codigo: string): Promise<void> {
    await this.cliente.conectar(codigo, {
      alRecibir: (datos) => {
        const m = analizarMensajeServidor(datos);
        if (m === null) throw new Error(`mensaje ilegible: ${datos}`);
        this.mensajes.push(m);
        if (m.tipo === "bienvenida") {
          this.jugadorId = m.jugadorId;
          this.token = m.token;
        }
      },
      alDesconectar: () => {},
    });
  }

  enviar(mensaje: MensajeCliente): void {
    this.cliente.enviar(serializarCliente(mensaje));
  }

  desconectar(): Promise<void> {
    return this.cliente.desconectar();
  }

  ultimaVistaRumble(): VistaRumble {
    for (let i = this.mensajes.length - 1; i >= 0; i--) {
      const m = this.mensajes[i];
      if (m !== undefined && m.tipo === "vista") {
        const vista: VistaJuego = m.vista;
        if (!("rumble" in vista)) throw new Error("se esperaba una VistaRumble");
        return vista;
      }
    }
    throw new Error(`${this.jugadorId} no recibió ninguna vista`);
  }

  ultimoError(): { codigo: string; mensaje: string } {
    for (let i = this.mensajes.length - 1; i >= 0; i--) {
      const m = this.mensajes[i];
      if (m !== undefined && m.tipo === "error") return m;
    }
    throw new Error(`${this.jugadorId} no recibió ningún error`);
  }
}

async function abrir(): Promise<{ transporte: TransporteMemoria; codigo: string; a: Cliente; b: Cliente }> {
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({
    transporte,
    motor: crearMotorRumble({ rng: crearGeneradorSemilla(5) }),
    rng: crearGeneradorSemilla(3),
  });
  const codigo = await orquestador.iniciar();
  const a = new Cliente(transporte.crearCliente());
  const b = new Cliente(transporte.crearCliente());
  await a.conectar(codigo);
  a.enviar({ tipo: "unirse", nombre: "Ana" });
  await asentar();
  await b.conectar(codigo);
  b.enviar({ tipo: "unirse", nombre: "Beto" });
  await asentar();
  return { transporte, codigo, a, b };
}

// Config con pool de una sola habilidad: la asignación es determinista (todos MISH).
const CONFIG_MISH = { ...CONFIG_DEFAULT, poolActivo: ["MISH"] };

describe("integración Rumble", () => {
  it("la config viaja por iniciarPartida y cada jugador recibe su VistaRumble", async () => {
    const { a, b } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: CONFIG_MISH });
    await asentar();

    for (const cliente of [a, b]) {
      const vista = cliente.ultimaVistaRumble();
      expect(vista.rumble.misHabilidades.map((h) => h.id)).toEqual(["MISH"]);
    }
  });

  it("rechaza una config inviable (pool vacío)", async () => {
    const { a } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_DEFAULT, poolActivo: [] } });
    await asentar();
    expect(a.ultimoError().codigo).toBe("CONFIG_INVALIDA");
  });

  it("el slice de habilidades sobrevive a la reconexión por token", async () => {
    const { transporte, codigo, a } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: CONFIG_MISH });
    await asentar();
    expect(a.ultimaVistaRumble().rumble.misHabilidades.map((h) => h.id)).toEqual(["MISH"]);

    const token = a.token;
    await a.desconectar();
    await asentar();

    // Reconecta con el mismo token: reattacha al asiento y su estado.
    const reconectado = new Cliente(transporte.crearCliente());
    await reconectado.conectar(codigo);
    reconectado.enviar({ tipo: "unirse", nombre: "Ana", token });
    await asentar();

    // La habilidad asignada sigue ahí: el slice vivía en el estado del orquestador.
    expect(reconectado.ultimaVistaRumble().rumble.misHabilidades.map((h) => h.id)).toEqual(["MISH"]);
  });
});

// Recorrido de punta a punta de lo que CONSUME el HUD de la Sesión 4: activar una
// habilidad por el sobre opaco y comprobar que la revelación llega al solicitante y
// NO a los demás. Es el sustituto verificable del playtest manual de 2 jugadores.
describe("integración Rumble — lo que alimenta al HUD", () => {
  it("AUGURIO: la revelación llega solo a quien la usó, y gasta una carga", async () => {
    const { a, b } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_DEFAULT, poolActivo: ["AUGURIO"] } });
    await asentar();

    const enTurno = a.ultimaVistaRumble().turno.jugadorId;
    const actor = a.jugadorId === enTurno ? a : b;
    const otro = actor === a ? b : a;
    expect(actor.ultimaVistaRumble().rumble.augurio).toBeUndefined();

    actor.enviar({ tipo: "rumble/augurio" });
    await asentar();

    // Quien la usó ve la cima; el otro no recibe el campo (información oculta).
    expect(actor.ultimaVistaRumble().rumble.augurio).toBeDefined();
    expect(otro.ultimaVistaRumble().rumble.augurio).toBeUndefined();
    // Y el HUD ve la carga decrecer: 3 consultas → 2.
    expect(actor.ultimaVistaRumble().rumble.misHabilidades[0]?.cargasRestantes).toBe(2);
  });

  it("SAPO: se revelan como mucho 4 cartas, y solo al espía", async () => {
    const { a, b } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_DEFAULT, poolActivo: ["SAPO"] } });
    await asentar();

    const enTurno = a.ultimaVistaRumble().turno.jugadorId;
    const actor = a.jugadorId === enTurno ? a : b;
    const victima = actor === a ? b : a;

    actor.enviar({ tipo: "rumble/sapo", objetivoId: victima.jugadorId });
    await asentar();

    const sapo = actor.ultimaVistaRumble().rumble.sapo;
    expect(sapo?.objetivoId).toBe(victima.jugadorId);
    expect(sapo?.cartas.length).toBeLessThanOrEqual(4);
    // La víctima no ve su propia mano revelada en el slice del espía.
    expect(victima.ultimaVistaRumble().rumble.sapo).toBeUndefined();
  });

  it("visibilidad §6.8: 'secreta' omite habilidadesAjenas; 'publica' las envía", async () => {
    const secreta = await abrir();
    secreta.a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_MISH, visibilidad: "secreta" } });
    await asentar();
    expect(secreta.a.ultimaVistaRumble().rumble.habilidadesAjenas).toBeUndefined();

    const publica = await abrir();
    publica.a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_MISH, visibilidad: "publica" } });
    await asentar();
    const ajenas = publica.a.ultimaVistaRumble().rumble.habilidadesAjenas;
    expect(ajenas).toBeDefined();
    expect(Object.keys(ajenas ?? {}).sort()).toEqual(
      [publica.a.jugadorId, publica.b.jugadorId].sort(),
    );
  });

  it("DOBLE se anuncia a TODOS aunque el modo sea secreta", async () => {
    const { a, b } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_DEFAULT, poolActivo: ["DOBLE"], visibilidad: "secreta" } });
    await asentar();

    for (const cliente of [a, b]) {
      const vista = cliente.ultimaVistaRumble();
      expect(vista.rumble.habilidadesAjenas).toBeUndefined(); // secreta
      expect(vista.rumble.doblePublico.sort()).toEqual([a.jugadorId, b.jugadorId].sort());
    }
  });

  it("GUASON acuña un comodín-de-pinta en la mano del jugador (la carta que dibuja el HUD)", async () => {
    const { a, b } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_DEFAULT, poolActivo: ["GUASON"] } });
    await asentar();

    const enTurno = a.ultimaVistaRumble().turno.jugadorId;
    const actor = a.jugadorId === enTurno ? a : b;
    const antes = actor.ultimaVistaRumble().tuMano;
    expect(antes.some((c) => c.tipo === "comodinPinta")).toBe(false);

    actor.enviar({ tipo: "rumble/guason", pinta: "picas", cartaSalienteId: antes[0]?.id });
    await asentar();

    const despues = actor.ultimaVistaRumble().tuMano;
    const acunado = despues.find((c) => c.tipo === "comodinPinta");
    expect(acunado).toBeDefined();
    expect(acunado?.tipo === "comodinPinta" ? acunado.pinta : null).toBe("picas");
    // La mano no crece: se cambió una carta por el comodín.
    expect(despues.length).toBe(antes.length);
  });

  it("una acción de habilidad mal formada se rechaza sin tumbar la sala", async () => {
    const { a, b } = await abrir();
    a.enviar({ tipo: "iniciarPartida", config: { ...CONFIG_DEFAULT, poolActivo: ["SAPO"] } });
    await asentar();

    const enTurno = a.ultimaVistaRumble().turno.jugadorId;
    const actor = a.jugadorId === enTurno ? a : b;
    actor.enviar({ tipo: "rumble/sapo", objetivoId: 42 as unknown as string });
    await asentar();

    expect(actor.ultimoError().codigo).toBe("mensajeInvalido");
    // La sala sigue viva: el jugador sigue recibiendo vistas.
    expect(actor.ultimaVistaRumble().rumble.misHabilidades).toHaveLength(1);
  });
});
