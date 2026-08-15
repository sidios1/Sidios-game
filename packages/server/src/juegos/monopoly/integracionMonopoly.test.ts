// Test de integración LAN de Monopoly Ultimate Team (sin red real): dos
// clientes se conectan por el transporte en memoria, el orquestador GENÉRICO
// delega en el motor de Monopoly y juegan por mensajes reales. Verifica el
// enganche al REGISTRO, el arranque de sala con `poolMonopoly`, la vista
// inicial (Mi Club público, pool/mazoPrensa nunca crudos) y que la autoridad
// de turno del orquestador se respeta a través de la costura MotorJuego.
//
// NO conduce la partida hasta una decisión pendiente concreta (comprar/
// declinar): eso depende del resultado de los dados, y forzarlo de forma
// determinista por mensajes de red agregaría mucha complejidad sin probar
// nada que motorMonopoly.test.ts no cubra ya (ahí se construye un
// `decisionPendiente` directamente y se verifica su resolución/timeout).
// Esta suite se queda en lo que es EXCLUSIVO del nivel de integración:
// conexión, orden de mensajes, difusión de vistas y autoridad de turno.

import { describe, expect, it } from "vitest";
import { Orquestador } from "../../orquestador.js";
import { crearSala, juegoRegistrado } from "../../registroMotores.js";
import type { MensajeCliente, MensajeServidor } from "../../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../../protocolo.js";
import type { TransporteCliente } from "../../transporte.js";
import { TransporteMemoria } from "../../transporteMemoria.js";
import type { VistaJuego } from "../../vistaJuego.js";
import type { VistaMonopoly } from "./vistaMonopoly.js";
import { crearMotorMonopoly } from "./motorMonopoly.js";
import { poolMock } from "../../pruebas/poolMonopoly.js";

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

function comoMonopoly(vista: VistaJuego): VistaMonopoly {
  if (!("juego" in vista) || vista.juego !== "monopoly") {
    throw new Error("se esperaba una vista de Monopoly");
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

  vistas(): VistaMonopoly[] {
    return this.mensajes
      .filter((m): m is Extract<MensajeServidor, { tipo: "vista" }> => m.tipo === "vista")
      .map((m) => comoMonopoly(m.vista));
  }

  ultimaVista(): VistaMonopoly {
    const vistas = this.vistas();
    const ultima = vistas[vistas.length - 1];
    if (ultima === undefined) throw new Error(`${this.jugadorId} no recibió ninguna vista`);
    return ultima;
  }

  errores(): Extract<MensajeServidor, { tipo: "error" }>[] {
    return this.mensajes.filter((m): m is Extract<MensajeServidor, { tipo: "error" }> => m.tipo === "error");
  }
}

async function abrir() {
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({ transporte, motor: crearMotorMonopoly(poolMock()) });
  const codigo = await orquestador.iniciar();
  const j1 = new ClientePrueba(transporte.crearCliente());
  const j2 = new ClientePrueba(transporte.crearCliente());
  await j1.conectar(codigo);
  j1.enviar({ tipo: "unirse", nombre: "Ana", juego: "monopoly" });
  await asentar();
  await j2.conectar(codigo);
  j2.enviar({ tipo: "unirse", nombre: "Ben", juego: "monopoly" });
  await asentar();
  j1.enviar({ tipo: "iniciarPartida", config: { rondasTotales: 5 } });
  await asentar();
  return { orquestador, j1, j2 };
}

describe("Monopoly Ultimate Team en LAN (transporte en memoria)", () => {
  it("el game-id 'monopoly' está registrado y exige poolMonopoly para armar la sala", async () => {
    expect(juegoRegistrado("monopoly")).toBe(true);
    const transporte = new TransporteMemoria();
    expect(() => crearSala("monopoly", { transporte })).toThrow(/poolMonopoly/);

    const sala = crearSala("monopoly", { transporte, poolMonopoly: poolMock() });
    expect(sala).toBeDefined();
    const codigo = await sala?.iniciar();
    expect(typeof codigo).toBe("string");
    await sala?.detener();
  });

  it("al iniciar, ambos jugadores ven la config del host, presupuesto inicial y Mi Club público", async () => {
    const { orquestador, j1, j2 } = await abrir();

    for (const cliente of [j1, j2]) {
      const vista = cliente.ultimaVista();
      expect(vista.rondasTotales).toBe(5);
      expect(vista.jugadorEnTurnoId).toBe(j1.jugadorId);
      expect(vista.terminada).toBe(false);
      expect(vista.jugadores).toHaveLength(2);
      for (const jugador of vista.jugadores) {
        expect(jugador.presupuesto).toBe(1000);
        expect(Array.isArray(jugador.miClub)).toBe(true);
      }
      // El pool crudo y el mazo de Prensa Deportiva ordenado nunca viajan.
      expect("pool" in vista).toBe(false);
      expect("mazoPrensa" in vista).toBe(false);
      expect(typeof vista.numeroMazoPrensa).toBe("number");
    }

    // Mi Club de j2 es información PÚBLICA (§3, sin mano oculta como en Carioca):
    // ambos clientes ven exactamente el mismo contenido para ese jugador.
    const miClubDeJ2SegunJ1 = j1.ultimaVista().jugadores.find((j) => j.id === j2.jugadorId)?.miClub;
    const miClubDeJ2SegunJ2 = j2.ultimaVista().jugadores.find((j) => j.id === j2.jugadorId)?.miClub;
    expect(miClubDeJ2SegunJ1).toEqual(miClubDeJ2SegunJ2);

    await orquestador.detener();
  });

  it("el orquestador rechaza actuar fuera de turno a través de la costura del motor", async () => {
    const { orquestador, j1, j2 } = await abrir();
    expect(j1.ultimaVista().jugadorEnTurnoId).toBe(j1.jugadorId);

    j2.enviar({ tipo: "tirarDados" });
    await asentar();

    const error = j2.errores().at(-1);
    expect(error?.codigo).toBe("NO_ES_TU_TURNO");
    // El estado no cambió: sigue siendo el turno de j1.
    expect(j1.ultimaVista().jugadorEnTurnoId).toBe(j1.jugadorId);

    await orquestador.detener();
  });

  it("tirarDados del jugador en turno mueve su ficha y se difunde a ambas vistas", async () => {
    const { orquestador, j1, j2 } = await abrir();

    j1.enviar({ tipo: "tirarDados" });
    await asentar();

    expect(j1.errores()).toHaveLength(0);
    const posicionJ1EnJ1 = j1.ultimaVista().jugadores.find((j) => j.id === j1.jugadorId)?.posicion;
    const posicionJ1EnJ2 = j2.ultimaVista().jugadores.find((j) => j.id === j1.jugadorId)?.posicion;
    expect(posicionJ1EnJ1).not.toBe(0);
    // La posición es pública: ambos clientes la ven igual (nada de mano oculta acá).
    expect(posicionJ1EnJ2).toBe(posicionJ1EnJ1);

    await orquestador.detener();
  });
});
