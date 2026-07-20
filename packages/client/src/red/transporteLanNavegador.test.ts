// Integración del stack de red del CLIENTE contra el servidor real:
// TransporteLanNavegador usa el WebSocket nativo (global en Node 22, igual
// que en el navegador) y juega mensajes de verdad contra el Orquestador con
// su adaptador LAN. Importar el server completo AQUÍ es legítimo: el test
// hospeda la sala; la app solo usa protocolo/vista/transporte.

import { afterEach, describe, expect, it } from "vitest";
import type { JugadorEnSala } from "@juegos/server/protocolo";
import type { VistaPartida } from "@juegos/server/vista";
import type { ProgramarIntervalo, ProgramarTimeout } from "@juegos/server/latido";
import { PING, PONG } from "@juegos/server/latido";
import { crearSala, TransporteLanServidor } from "@juegos/server";
import type { SalaJuego } from "@juegos/server";
import { Conexion } from "./conexion.js";
import type { SocketNavegador } from "./transporteLanNavegador.js";
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
    alConfigSala: () => {},
    alVista: (vista) => {
      // Sala de Carioca: la vista es siempre "carioca" (narrowing por discriminante).
      if (vista.juego === "carioca") cliente.vistas.push(vista);
    },
    alError: () => {},
    alSalaCerrada: () => {},
    alDesconectar: () => {},
  });
  conexion.unirse(nombre);
  return cliente;
}

describe("TransporteLanNavegador contra el orquestador real", () => {
  let orquestador: SalaJuego | null = null;
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
    const salaCarioca = crearSala("carioca", {
      transporte: new TransporteLanServidor({ ipAnunciada: "127.0.0.1" }),
    });
    if (salaCarioca === undefined) throw new Error("juego 'carioca' no registrado");
    orquestador = salaCarioca;
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

// ── Latido y anti-throttling con dobles deterministas ──────────────────────

/** Socket falso: el adaptador lo recibe vía `crearSocket`; el test lo maneja. */
class SocketFalso implements SocketNavegador {
  readyState = 0; // CONNECTING
  readonly enviados: string[] = [];
  private readonly oyentes = new Map<string, Array<(e: { data: unknown }) => void>>();

  send(datos: string): void {
    this.enviados.push(datos);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3; // CLOSED
    this.emitir("close");
  }

  addEventListener(tipo: "message", o: (e: { data: unknown }) => void): void;
  addEventListener(tipo: "open" | "error" | "close", o: () => void): void;
  addEventListener(tipo: string, o: (e: { data: unknown }) => void): void {
    const lista = this.oyentes.get(tipo) ?? [];
    lista.push(o);
    this.oyentes.set(tipo, lista);
  }

  // Helpers del test:
  abrir(): void {
    this.readyState = 1; // OPEN
    this.emitir("open");
  }
  recibir(data: string): void {
    this.emitir("message", data);
  }
  private emitir(tipo: string, data?: string): void {
    for (const o of this.oyentes.get(tipo) ?? []) o({ data });
  }
}

/** Documento falso para visibilitychange sin DOM real. */
class DocumentoFalso {
  hidden = false;
  private oyentes: Array<() => void> = [];
  addEventListener(_tipo: "visibilitychange", o: () => void): void {
    this.oyentes.push(o);
  }
  removeEventListener(_tipo: "visibilitychange", o: () => void): void {
    this.oyentes = this.oyentes.filter((x) => x !== o);
  }
  cambiar(hidden: boolean): void {
    this.hidden = hidden;
    for (const o of [...this.oyentes]) o();
  }
}

/** Temporizadores manuales. */
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
  vencerTimeouts(): void {
    const aDisparar = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const fn of aDisparar) fn();
  }
  pulsarIntervalos(): void {
    for (const fn of [...this.intervalos.values()]) fn();
  }
}

interface MontajeLatido {
  readonly socket: SocketFalso;
  readonly doc: DocumentoFalso;
  readonly relojes: Relojes;
  readonly recibidos: string[];
  desconectado: boolean;
}

async function montarConLatido(): Promise<MontajeLatido> {
  const socket = new SocketFalso();
  const doc = new DocumentoFalso();
  const relojes = new Relojes();
  const recibidos: string[] = [];
  const montaje: MontajeLatido = { socket, doc, relojes, recibidos, desconectado: false };
  const adaptador = new TransporteLanNavegador({
    intervalo: relojes.intervalo,
    timeout: relojes.timeout,
    documento: doc,
    crearSocket: () => socket,
  });
  const conectando = adaptador.conectar("127.0.0.1:1234", {
    alRecibir: (datos) => recibidos.push(datos),
    alDesconectar: () => {
      montaje.desconectado = true;
    },
  });
  socket.abrir();
  await conectando;
  return montaje;
}

describe("TransporteLanNavegador: latido", () => {
  it("manda PING periódico y, sin respuesta, cierra y desconecta", async () => {
    const montaje = await montarConLatido();
    montaje.relojes.pulsarIntervalos();
    expect(montaje.socket.enviados).toContain(PING);
    montaje.relojes.vencerTimeouts(); // vence el silencio → alMorir → close
    expect(montaje.socket.readyState).toBe(3);
    expect(montaje.desconectado).toBe(true);
  });

  it("no entrega los frames de control (PONG) a los oyentes", async () => {
    const montaje = await montarConLatido();
    montaje.socket.recibir(PONG);
    expect(montaje.recibidos).toEqual([]);
  });

  it("entrega los mensajes del juego a los oyentes", async () => {
    const montaje = await montarConLatido();
    const mensaje = '{"tipo":"vista"}';
    montaje.socket.recibir(mensaje);
    expect(montaje.recibidos).toEqual([mensaje]);
  });

  it("al volver al frente (visible) sondea de inmediato con un PING", async () => {
    const montaje = await montarConLatido();
    expect(montaje.socket.enviados).not.toContain(PING); // aún no pulsamos el intervalo
    montaje.doc.cambiar(false); // visibilitychange → hidden=false
    expect(montaje.socket.enviados).toContain(PING);
  });

  it("estando oculto no sondea", async () => {
    const montaje = await montarConLatido();
    montaje.doc.cambiar(true); // hidden=true
    expect(montaje.socket.enviados).not.toContain(PING);
  });
});
