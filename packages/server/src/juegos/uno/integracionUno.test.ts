// Test de integración LAN de UNO (sin red real): dos clientes se conectan por el
// transporte en memoria, el orquestador GENÉRICO delega en el motor de UNO y juegan
// una ronda completa por mensajes. Verifica una cadena de "+" resuelta por robo, la
// información oculta (manos ajenas y montón de robo nunca viajan) y que el game-id
// queda registrado en el registro de motores.

import { describe, expect, it } from "vitest";
import type { Carta, Color, Simbolo, Valor, VistaUno } from "@juegos/uno-core";
import { Orquestador } from "../../orquestador.js";
import { crearSala, juegoRegistrado } from "../../registroMotores.js";
import type { MensajeCliente, MensajeServidor } from "../../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../../protocolo.js";
import type { TransporteCliente } from "../../transporte.js";
import { TransporteMemoria } from "../../transporteMemoria.js";
import type { VistaJuego } from "../../vistaJuego.js";
import { crearMotorUno } from "./motorUno.js";

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

function num(color: Color, valor: Valor, id: string): Carta {
  return { id, color, tipo: "numero", valor };
}

function simb(color: Color, tipo: Simbolo, id: string): Carta {
  return { id, color, tipo };
}

function comoUno(vista: VistaJuego): VistaUno {
  if (!("juego" in vista) || vista.juego !== "uno") {
    throw new Error("se esperaba una vista de UNO");
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

  vistas(): VistaUno[] {
    return this.mensajes
      .filter((m): m is Extract<MensajeServidor, { tipo: "vista" }> => m.tipo === "vista")
      .map((m) => comoUno(m.vista));
  }

  ultimaVista(): VistaUno {
    const vistas = this.vistas();
    const ultima = vistas[vistas.length - 1];
    if (ultima === undefined) throw new Error(`${this.jugadorId} no recibió ninguna vista`);
    return ultima;
  }
}

/**
 * Mazo determinista de la partida: j1 (rojas) puede vaciar su mano encadenando
 * (con 2 jugadores, skip/reverse devuelven el turno al mismo jugador). Por el
 * camino j1 y j2 apilan dos +2 y j2 resuelve el acumulado robando.
 */
function mazoPartida(): Carta[] {
  return [
    // j1 (mazo[0..6])
    simb("rojo", "mas2", "rojo-mas2-a"),
    simb("rojo", "mas2", "rojo-mas2-b"),
    simb("rojo", "skip", "rojo-skip-a"),
    simb("rojo", "skip", "rojo-skip-b"),
    simb("rojo", "reverse", "rojo-reverse-a"),
    simb("rojo", "reverse", "rojo-reverse-b"),
    num("rojo", 3, "rojo-3-a"),
    // j2 (mazo[7..13])
    simb("azul", "mas2", "azul-mas2-a"),
    num("azul", 1, "azul-1-a"),
    num("azul", 2, "azul-2-a"),
    num("azul", 3, "azul-3-a"),
    num("azul", 4, "azul-4-a"),
    num("azul", 5, "azul-5-a"),
    num("azul", 6, "azul-6-a"),
    // inicial (mazo[14])
    num("rojo", 9, "rojo-9-a"),
    // montón de robo (mazo[15..]); j2 roba 6 al resolver el acumulado
    num("verde", 1, "verde-1-a"),
    num("verde", 2, "verde-2-a"),
    num("verde", 3, "verde-3-a"),
    num("verde", 4, "verde-4-a"),
    num("verde", 5, "verde-5-a"),
    num("verde", 6, "verde-6-a"),
    num("verde", 7, "verde-7-a"),
    num("verde", 8, "verde-8-a"),
  ];
}

async function abrir(mazo: readonly Carta[]) {
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({ transporte, motor: crearMotorUno({ mazo }) });
  const codigo = await orquestador.iniciar();
  const j1 = new ClientePrueba(transporte.crearCliente());
  const j2 = new ClientePrueba(transporte.crearCliente());
  await j1.conectar(codigo);
  j1.enviar({ tipo: "unirse", nombre: "Ana", juego: "uno" });
  await asentar();
  await j2.conectar(codigo);
  j2.enviar({ tipo: "unirse", nombre: "Ben", juego: "uno" });
  await asentar();
  j1.enviar({ tipo: "iniciarPartida" });
  await asentar();
  return { orquestador, j1, j2 };
}

describe("UNO en LAN (transporte en memoria)", () => {
  it("juega una ronda completa con cadena de '+' resuelta por robo, sin filtrar cartas", async () => {
    const { orquestador, j1, j2 } = await abrir(mazoPartida());

    expect(j1.ultimaVista().jugadorEnTurnoId).toBe(j1.jugadorId);

    // Cadena de "+": j1 inicia +2, j2 apila +2, j1 apila +2, j2 resuelve robando.
    j1.enviar({ tipo: "jugar", cartaId: "rojo-mas2-a" });
    await asentar();
    // j2 aún no juega: su vista no debe contener cartas privadas de j1.
    expect(JSON.stringify(j2.ultimaVista())).not.toContain("rojo-skip-a");

    j2.enviar({ tipo: "jugar", cartaId: "azul-mas2-a" });
    await asentar();
    expect(j1.ultimaVista().acumuladoPendiente).toBe(4);

    j1.enviar({ tipo: "jugar", cartaId: "rojo-mas2-b" });
    await asentar();
    expect(j2.ultimaVista().acumuladoPendiente).toBe(6);

    j2.enviar({ tipo: "resolverAcumulado" });
    await asentar();
    expect(j1.ultimaVista().acumuladoPendiente).toBe(0);
    // j2 robó las 6 del acumulado: 7 iniciales - 1 jugada + 6 = 12.
    expect(j1.ultimaVista().jugadores.find((j) => j.id === j2.jugadorId)?.numeroCartas).toBe(12);

    // j1 vacía su mano: con 2 jugadores skip/reverse le devuelven el turno.
    j1.enviar({ tipo: "jugar", cartaId: "rojo-skip-a" });
    await asentar();
    j1.enviar({ tipo: "jugar", cartaId: "rojo-skip-b" });
    await asentar();
    j1.enviar({ tipo: "jugar", cartaId: "rojo-reverse-a" });
    await asentar();
    j1.enviar({ tipo: "jugar", cartaId: "rojo-reverse-b" });
    await asentar();
    j1.enviar({ tipo: "jugar", cartaId: "rojo-3-a" });
    await asentar();

    expect(j1.ultimaVista().ganadorId).toBe(j1.jugadorId);
    expect(j2.ultimaVista().ganadorId).toBe(j1.jugadorId);
    expect(j1.ultimaVista().jugadorEnTurnoId).toBeNull();

    // Información oculta: las cartas que j2 robó (montón de robo) NUNCA viajan a j1.
    for (const vista of j1.vistas()) expect(JSON.stringify(vista)).not.toContain("verde");

    await orquestador.detener();
  });

  it("el game-id 'uno' está registrado y crea su sala", async () => {
    expect(juegoRegistrado("uno")).toBe(true);
    const transporte = new TransporteMemoria();
    const sala = crearSala("uno", { transporte });
    expect(sala).toBeDefined();
    const codigo = await sala?.iniciar();
    expect(typeof codigo).toBe("string");
    await sala?.detener();
  });
});
