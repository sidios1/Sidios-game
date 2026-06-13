// Integración del stack de red del CLIENTE contra el servidor real:
// TransporteLanNavegador usa el WebSocket nativo (global en Node 22, igual
// que en el navegador) y juega mensajes de verdad contra el Orquestador con
// su adaptador LAN. Importar el server completo AQUÍ es legítimo: el test
// hospeda la sala; la app solo usa protocolo/vista/transporte.

import { afterEach, describe, expect, it } from "vitest";
import type { JugadorEnSala } from "@juegos/server/protocolo";
import type { VistaPartida } from "@juegos/server/vista";
import { Orquestador, TransporteLanServidor } from "@juegos/server";
import { Conexion } from "./conexion.js";
import { TransporteLanNavegador } from "./transporteLanNavegador.js";

function esperar<T>(
  descripcion: string,
  condicion: () => T | null,
  limiteMs = 3000,
): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const inicio = Date.now();
    const intentar = () => {
      const valor = condicion();
      if (valor !== null) {
        resolver(valor);
        return;
      }
      if (Date.now() - inicio > limiteMs) {
        rechazar(new Error(`tiempo agotado esperando: ${descripcion}`));
        return;
      }
      setTimeout(intentar, 15);
    };
    intentar();
  });
}

interface ClienteDePrueba {
  readonly conexion: Conexion;
  jugadorId: string | null;
  sala: readonly JugadorEnSala[];
  vistas: VistaPartida[];
  readonly ultimaVista: () => VistaPartida | null;
}

async function conectarCliente(codigo: string, nombre: string): Promise<ClienteDePrueba> {
  const conexion = new Conexion(new TransporteLanNavegador());
  const cliente: ClienteDePrueba = {
    conexion,
    jugadorId: null,
    sala: [],
    vistas: [],
    ultimaVista: () => cliente.vistas[cliente.vistas.length - 1] ?? null,
  };
  await conexion.conectar(codigo, {
    alBienvenida: (jugadorId) => {
      cliente.jugadorId = jugadorId;
    },
    alEstadoSala: (jugadores) => {
      cliente.sala = jugadores;
    },
    alVista: (vista) => {
      cliente.vistas.push(vista);
    },
    alError: () => {},
    alSalaCerrada: () => {},
    alDesconectar: () => {},
  });
  conexion.unirse(nombre);
  return cliente;
}

describe("TransporteLanNavegador contra el orquestador real", () => {
  let orquestador: Orquestador | null = null;
  const clientes: ClienteDePrueba[] = [];

  afterEach(async () => {
    for (const cliente of clientes) {
      await cliente.conexion.desconectar();
    }
    clientes.length = 0;
    await orquestador?.detener();
    orquestador = null;
  });

  it("dos clientes juegan un ciclo de turno por la red", async () => {
    orquestador = new Orquestador({
      transporte: new TransporteLanServidor({ ipAnunciada: "127.0.0.1" }),
    });
    const codigo = await orquestador.iniciar();

    const ana = await conectarCliente(codigo, "Ana");
    const beto = await conectarCliente(codigo, "Beto");
    clientes.push(ana, beto);

    const sala = await esperar("la sala con 2 jugadores", () =>
      beto.sala.length === 2 ? beto.sala : null,
    );
    expect(sala.map((j) => j.nombre)).toEqual(["Ana", "Beto"]);
    expect(sala[0]?.esAnfitrion).toBe(true);

    // El anfitrión inicia; ambos reciben SU vista con 12 cartas propias.
    ana.conexion.enviarMensaje({ tipo: "iniciarPartida" });
    const [vistaAna, vistaBeto] = await esperar("las vistas iniciales", () => {
      const a = ana.ultimaVista();
      const b = beto.ultimaVista();
      return a !== null && b !== null ? [a, b] : null;
    });
    expect(vistaAna.tuMano).toHaveLength(vistaAna.contrato.cartasRepartidas);
    expect(vistaBeto.tuMano).toHaveLength(12);
    expect(vistaAna.tuJugadorId).not.toBe(vistaBeto.tuJugadorId);

    // Turno completo de quien corresponda: roba del mazo y descarta.
    const enTurno = vistaAna.turno.jugadorId === ana.jugadorId ? ana : beto;
    const manoAntes = enTurno.ultimaVista()?.tuMano.length ?? 0;
    enTurno.conexion.enviarMensaje({ tipo: "robarDelMazo" });
    const trasRobo = await esperar("la vista tras robar", () => {
      const v = enTurno.ultimaVista();
      return v !== null && v.tuMano.length === manoAntes + 1 ? v : null;
    });
    expect(trasRobo.turno.fase).toBe("descartar");

    const cartaId = trasRobo.tuMano[0]?.id ?? "";
    enTurno.conexion.enviarMensaje({ tipo: "descartar", cartaId });
    const trasDescarte = await esperar("el cambio de turno", () => {
      const v = enTurno.ultimaVista();
      return v !== null && v.turno.jugadorId !== trasRobo.turno.jugadorId ? v : null;
    });
    expect(trasDescarte.pozoTope?.id).toBe(cartaId);
    expect(trasDescarte.tuMano).toHaveLength(manoAntes);

    // Información oculta: la vista solo trae conteos de los demás.
    const otro = trasDescarte.jugadores.find(
      (j) => j.id !== trasDescarte.tuJugadorId,
    );
    expect(otro?.numeroCartas).toBe(12);
  });
});
