// Test de integración LAN de Mentiroso (sin red real): dos clientes se conectan
// por el transporte en memoria, el orquestador GENÉRICO delega en el motor de
// Mentiroso y juegan una partida completa por mensajes. Verifica la información
// oculta (manos ajenas y pila nunca viajan; la resolución sí al acusar) y que el
// game-id queda registrado en el registro de motores.

import { describe, expect, it } from "vitest";
import type { Carta } from "@juegos/mentiroso-core";
import { Orquestador } from "../../orquestador.js";
import { crearSala, juegoRegistrado } from "../../registroMotores.js";
import type { MensajeCliente, MensajeServidor } from "../../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../../protocolo.js";
import type { TransporteCliente } from "../../transporte.js";
import { TransporteMemoria } from "../../transporteMemoria.js";
import type { VistaJuego } from "../../vistaJuego.js";
import type { VistaMentiroso } from "./vistaMentiroso.js";
import { crearMotorMentiroso } from "./motorMentiroso.js";

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

function carta(palo: Carta["palo"], id: string): Carta {
  return { palo, id };
}

function comoMentiroso(vista: VistaJuego): VistaMentiroso {
  if (!("juego" in vista) || vista.juego !== "mentiroso") {
    throw new Error("se esperaba una vista de Mentiroso");
  }
  return vista;
}

class ClientePrueba {
  readonly mensajes: MensajeServidor[] = [];
  jugadorId = "";
  token = "";

  constructor(private readonly cliente: TransporteCliente) {}

  async conectar(codigo: string): Promise<void> {
    await this.cliente.conectar(codigo, {
      alRecibir: (datos) => {
        const mensaje = analizarMensajeServidor(datos);
        if (mensaje === null) throw new Error(`mensaje ilegible: ${datos}`);
        this.mensajes.push(mensaje);
        if (mensaje.tipo === "bienvenida") {
          this.jugadorId = mensaje.jugadorId;
          this.token = mensaje.token;
        }
      },
      alDesconectar: () => {},
    });
  }

  enviar(mensaje: MensajeCliente): void {
    this.cliente.enviar(serializarCliente(mensaje));
  }

  vistas(): VistaMentiroso[] {
    return this.mensajes
      .filter((m): m is Extract<MensajeServidor, { tipo: "vista" }> => m.tipo === "vista")
      .map((m) => comoMentiroso(m.vista));
  }

  ultimaVista(): VistaMentiroso {
    const vistas = this.vistas();
    const ultima = vistas[vistas.length - 1];
    if (ultima === undefined) throw new Error(`${this.jugadorId} no recibió ninguna vista`);
    return ultima;
  }
}

interface OpcionesSalaMentiroso {
  readonly baraja: readonly Carta[];
  readonly paloInicial?: Carta["palo"];
}

async function abrir(opciones: OpcionesSalaMentiroso) {
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({
    transporte,
    motor: crearMotorMentiroso({
      baraja: opciones.baraja,
      ...(opciones.paloInicial !== undefined ? { paloInicial: opciones.paloInicial } : {}),
    }),
  });
  const codigo = await orquestador.iniciar();
  const j1 = new ClientePrueba(transporte.crearCliente());
  const j2 = new ClientePrueba(transporte.crearCliente());
  await j1.conectar(codigo);
  j1.enviar({ tipo: "unirse", nombre: "Ana", juego: "mentiroso" });
  await asentar();
  await j2.conectar(codigo);
  j2.enviar({ tipo: "unirse", nombre: "Ben", juego: "mentiroso" });
  await asentar();
  j1.enviar({ tipo: "iniciarPartida" });
  await asentar();
  return { orquestador, j1, j2 };
}

describe("Mentiroso en LAN (transporte en memoria)", () => {
  it("dos jugadores juegan una partida completa hasta el ganador, sin filtrar cartas", async () => {
    // j1 = [picas-a], j2 = [picas-b]; j1 juega su única carta y j2 la acepta.
    const { orquestador, j1, j2 } = await abrir({
      baraja: [carta("picas", "picas-a"), carta("picas", "picas-b")],
      paloInicial: "picas",
    });

    expect(j1.ultimaVista().jugadorEnTurnoId).toBe(j1.jugadorId);
    expect(j1.ultimaVista().tuMano.map((c) => c.id)).toEqual(["picas-a"]);

    j1.enviar({ tipo: "jugar", cantidad: 1 });
    await asentar();
    expect(j1.ultimaVista().ganadorPendienteId).toBe(j1.jugadorId);

    j2.enviar({ tipo: "jugar", cantidad: 1 });
    await asentar();

    expect(j1.ultimaVista().ganadorId).toBe(j1.jugadorId);
    expect(j2.ultimaVista().ganadorId).toBe(j1.jugadorId);
    expect(j1.ultimaVista().jugadorEnTurnoId).toBeNull();

    // Información oculta: la carta de j2 nunca aparece en las vistas de j1, ni la
    // de j1 (enterrada en la pila) en las de j2.
    for (const vista of j1.vistas()) expect(JSON.stringify(vista)).not.toContain("picas-b");
    for (const vista of j2.vistas()) expect(JSON.stringify(vista)).not.toContain("picas-a");

    await orquestador.detener();
  });

  it("una acusación a una mentira destapa SOLO esas cartas al resolver", async () => {
    // j1 = [corazones-a, picas-c]; declara picas y juega corazones → miente.
    const { orquestador, j1, j2 } = await abrir({
      baraja: [
        carta("corazones", "corazones-a"),
        carta("picas", "picas-b"),
        carta("picas", "picas-c"),
        carta("picas", "picas-d"),
      ],
      paloInicial: "picas",
    });

    j1.enviar({ tipo: "jugar", cantidad: 1 });
    await asentar();
    // Antes de acusar, la carta jugada va boca abajo: nadie la ve.
    expect(JSON.stringify(j2.ultimaVista())).not.toContain("corazones-a");

    j2.enviar({ tipo: "acusar" });
    await asentar();

    const resolucion = j2.ultimaVista().ultimaResolucion;
    expect(resolucion?.mentia).toBe(true);
    expect(resolucion?.acusadoId).toBe(j1.jugadorId);
    expect(resolucion?.cartas.map((c) => c.id)).toEqual(["corazones-a"]);
    // El mentiroso recoge la pila e inicia ronda nueva con palo distinto.
    expect(j2.ultimaVista().jugadorEnTurnoId).toBe(j1.jugadorId);
    expect(j2.ultimaVista().paloRonda).not.toBe("picas");

    await orquestador.detener();
  });

  it("el game-id 'mentiroso' está registrado y crea su sala", async () => {
    expect(juegoRegistrado("mentiroso")).toBe(true);
    const transporte = new TransporteMemoria();
    const sala = crearSala("mentiroso", { transporte });
    expect(sala).toBeDefined();
    const codigo = await sala?.iniciar();
    expect(typeof codigo).toBe("string");
    await sala?.detener();
  });
});
