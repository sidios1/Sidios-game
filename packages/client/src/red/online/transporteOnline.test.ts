// Integración del transporte ONLINE contra el orquestador real, SIN red: una
// señalización falsa en-memoria conecta un TransporteOnlineServidor (con su
// Orquestador) con clientes TransporteOnlineCliente por canales simulados. Así
// se verifica el contrato (unión por código, vistas por jugador con info oculta
// y reattach por token) sin PeerJS ni WebRTC reales. Importar el server para
// HOSPEDAR la sala en un test es legítimo (igual que transporteLanNavegador.test).

import { afterEach, describe, expect, it } from "vitest";
import type { JugadorEnSala } from "@juegos/server/protocolo";
import type { VistaJuego, VistaMentiroso } from "@juegos/server/vistaJuego";
import type { VistaPartida } from "@juegos/server/vista";
import { crearSala } from "@juegos/server/registroMotores";
import type { SalaJuego } from "@juegos/server/registroMotores";
import type { TransporteCliente } from "@juegos/server/transporte";
import { Conexion } from "../conexion.js";
import type { CanalDatos, ClienteSenalizacion, OyentesHost } from "./senalizacion.js";
import { TransporteOnlineServidor } from "./transporteOnlineServidor.js";
import { TransporteOnlineCliente } from "./transporteOnlineCliente.js";

// ── Dobles de señalización en-memoria ──────────────────────────────────────

/** Un extremo de un par de canales conectados (pipe bidireccional). */
class CanalFalso implements CanalDatos {
  abierto = true;
  private otro: CanalFalso | null = null;
  private manejadorMensaje: ((datos: string) => void) | null = null;
  private manejadorCierre: (() => void) | null = null;
  private cerrado = false;

  enlazar(otro: CanalFalso): void {
    this.otro = otro;
  }

  enviar(datos: string): void {
    if (this.cerrado) return;
    queueMicrotask(() => this.otro?.recibir(datos));
  }

  alMensaje(manejador: (datos: string) => void): void {
    this.manejadorMensaje = manejador;
  }

  alCerrar(manejador: () => void): void {
    this.manejadorCierre = manejador;
  }

  cerrar(): void {
    if (this.cerrado) return;
    this.marcarCerrado();
    this.otro?.marcarCerrado();
  }

  private recibir(datos: string): void {
    this.manejadorMensaje?.(datos);
  }

  private marcarCerrado(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.abierto = false;
    queueMicrotask(() => this.manejadorCierre?.());
  }
}

function crearParCanales(): [CanalDatos, CanalDatos] {
  const a = new CanalFalso();
  const b = new CanalFalso();
  a.enlazar(b);
  b.enlazar(a);
  return [a, b];
}

/** Broker en-memoria: empareja al host (por código) con los jugadores. */
class BrokerFalso {
  private readonly hosts = new Map<string, OyentesHost>();

  registrar(codigo: string, oyentes: OyentesHost): void {
    this.hosts.set(codigo, oyentes);
  }

  desregistrar(codigo: string): void {
    this.hosts.delete(codigo);
  }

  conectar(codigo: string): CanalDatos {
    const host = this.hosts.get(codigo);
    if (host === undefined) throw new Error(`sala inexistente: ${codigo}`);
    const [ladoCliente, ladoHost] = crearParCanales();
    queueMicrotask(() => host.alNuevoCanal(ladoHost));
    return ladoCliente;
  }
}

class SenalizacionFalsa implements ClienteSenalizacion {
  private codigo: string | null = null;

  constructor(private readonly broker: BrokerFalso) {}

  registrarHost(generarCodigo: () => string, oyentes: OyentesHost): Promise<string> {
    const codigo = generarCodigo();
    this.codigo = codigo;
    this.broker.registrar(codigo, oyentes);
    return Promise.resolve(codigo);
  }

  conectarAHost(codigo: string): Promise<CanalDatos> {
    return Promise.resolve(this.broker.conectar(codigo));
  }

  cerrar(): void {
    if (this.codigo !== null) this.broker.desregistrar(this.codigo);
    this.codigo = null;
  }
}

// ── Helpers de cliente de prueba ────────────────────────────────────────────

function esperar<T>(
  descripcion: string,
  condicion: () => T | null,
  limiteMs = 3000,
): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const inicio = Date.now();
    const intentar = (): void => {
      const valor = condicion();
      if (valor !== null) {
        resolver(valor);
        return;
      }
      if (Date.now() - inicio > limiteMs) {
        rechazar(new Error(`tiempo agotado esperando: ${descripcion}`));
        return;
      }
      setTimeout(intentar, 10);
    };
    intentar();
  });
}

interface ClienteDePrueba {
  readonly conexion: Conexion;
  jugadorId: string | null;
  token: string | null;
  sala: readonly JugadorEnSala[];
  vistas: VistaJuego[];
  readonly ultimaVista: () => VistaJuego | null;
}

async function conectarCon(
  transporte: TransporteCliente,
  nombre: string,
  codigo: string,
  token?: string,
): Promise<ClienteDePrueba> {
  const conexion = new Conexion(transporte);
  const cliente: ClienteDePrueba = {
    conexion,
    jugadorId: null,
    token: null,
    sala: [],
    vistas: [],
    ultimaVista: () => cliente.vistas[cliente.vistas.length - 1] ?? null,
  };
  await conexion.conectar(codigo, {
    alBienvenida: (jugadorId, tk) => {
      cliente.jugadorId = jugadorId;
      cliente.token = tk;
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
  conexion.unirse(nombre, undefined, token);
  await esperar(`bienvenida de ${nombre}`, () => (cliente.jugadorId !== null ? cliente : null));
  return cliente;
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe("TransporteOnline contra el orquestador real (señalización falsa)", () => {
  let sala: SalaJuego | null = null;
  const clientes: ClienteDePrueba[] = [];

  afterEach(async () => {
    for (const cliente of clientes) {
      await cliente.conexion.desconectar();
    }
    clientes.length = 0;
    await sala?.detener();
    sala = null;
  });

  /** Arma una sala del juego pedido y devuelve { servidor, codigo }. */
  async function montarSala(
    juego: string,
    codigoFijo: string,
  ): Promise<{ servidor: TransporteOnlineServidor; codigo: string; broker: BrokerFalso }> {
    const broker = new BrokerFalso();
    const servidor = new TransporteOnlineServidor(new SenalizacionFalsa(broker), {
      generarCodigo: () => codigoFijo,
    });
    const creada = crearSala(juego, { transporte: servidor });
    if (creada === undefined) throw new Error(`juego '${juego}' no registrado`);
    sala = creada;
    const codigo = await creada.iniciar();
    return { servidor, codigo, broker };
  }

  it("host (loopback) y jugador remoto juegan un ciclo de turno en Carioca", async () => {
    const { servidor, codigo, broker } = await montarSala("carioca", "ABCDEF");
    expect(codigo).toBe("ABCDEF");

    // El host se une por su cliente LOOPBACK (en-proceso, sin WebRTC).
    const ana = await conectarCon(servidor.crearClienteLocal(), "Ana", "loopback");
    // El jugador remoto, por un TransporteOnlineCliente sobre canales simulados.
    const beto = await conectarCon(
      new TransporteOnlineCliente({ senalizacion: new SenalizacionFalsa(broker) }),
      "Beto",
      codigo,
    );
    clientes.push(ana, beto);

    const salaVista = await esperar("la sala con 2 jugadores", () =>
      beto.sala.length === 2 ? beto.sala : null,
    );
    expect(salaVista.map((j) => j.nombre)).toEqual(["Ana", "Beto"]);
    expect(salaVista[0]?.esAnfitrion).toBe(true); // el host (loopback) es anfitrión.

    ana.conexion.enviarMensaje({ tipo: "iniciarPartida" });
    const [vAna, vBeto] = await esperar("las vistas iniciales", () => {
      const a = ana.ultimaVista() as VistaPartida | null;
      const b = beto.ultimaVista() as VistaPartida | null;
      return a !== null && b !== null ? [a, b] : null;
    });
    expect(vAna.tuMano).toHaveLength(vAna.contrato.cartasRepartidas);
    expect(vBeto.tuMano).toHaveLength(12);
    expect(vAna.tuJugadorId).not.toBe(vBeto.tuJugadorId);

    // Turno completo de quien corresponda: roba del mazo y descarta.
    const enTurno = vAna.turno.jugadorId === ana.jugadorId ? ana : beto;
    const manoAntes = (enTurno.ultimaVista() as VistaPartida).tuMano.length;
    enTurno.conexion.enviarMensaje({ tipo: "robarDelMazo" });
    const trasRobo = await esperar("la vista tras robar", () => {
      const v = enTurno.ultimaVista() as VistaPartida | null;
      return v !== null && v.tuMano.length === manoAntes + 1 ? v : null;
    });
    expect(trasRobo.turno.fase).toBe("descartar");

    const cartaId = trasRobo.tuMano[0]?.id ?? "";
    enTurno.conexion.enviarMensaje({ tipo: "descartar", cartaId });
    const trasDescarte = await esperar("el cambio de turno", () => {
      const v = enTurno.ultimaVista() as VistaPartida | null;
      return v !== null && v.turno.jugadorId !== trasRobo.turno.jugadorId ? v : null;
    });
    expect(trasDescarte.pozoTope?.id).toBe(cartaId);

    // Información oculta: de los demás solo viajan conteos, no sus cartas.
    const otro = trasDescarte.jugadores.find((j) => j.id !== trasDescarte.tuJugadorId);
    expect(otro?.numeroCartas).toBe(12);
  });

  it("host y jugador remoto inician una partida de Mentiroso", async () => {
    const { servidor, codigo, broker } = await montarSala("mentiroso", "MENTIR");

    const ana = await conectarCon(servidor.crearClienteLocal(), "Ana", "loopback");
    const beto = await conectarCon(
      new TransporteOnlineCliente({ senalizacion: new SenalizacionFalsa(broker) }),
      "Beto",
      codigo,
    );
    clientes.push(ana, beto);

    await esperar("la sala con 2 jugadores", () => (beto.sala.length === 2 ? beto.sala : null));
    ana.conexion.enviarMensaje({ tipo: "iniciarPartida" });

    const [vAna, vBeto] = await esperar("las vistas de Mentiroso", () => {
      const a = ana.ultimaVista() as VistaMentiroso | null;
      const b = beto.ultimaVista() as VistaMentiroso | null;
      return a !== null && b !== null ? [a, b] : null;
    });
    expect(vAna.tuJugadorId).not.toBe(vBeto.tuJugadorId);
    expect(vAna.juego).toBe("mentiroso");
    expect(vBeto.juego).toBe("mentiroso");
  });

  it("reattach por token: reconectar recupera el MISMO asiento, sin crear otro", async () => {
    const { servidor, codigo, broker } = await montarSala("carioca", "TOKENS");

    const ana = await conectarCon(servidor.crearClienteLocal(), "Ana", "loopback");
    const beto = await conectarCon(
      new TransporteOnlineCliente({ senalizacion: new SenalizacionFalsa(broker) }),
      "Beto",
      codigo,
    );
    clientes.push(ana, beto);

    await esperar("la sala con 2 jugadores", () => (beto.sala.length === 2 ? beto.sala : null));
    const idOriginal = beto.jugadorId;
    const token = beto.token;
    expect(token).not.toBeNull();

    // El asiento solo se conserva EN PARTIDA (en lobby, desconectarse es salir).
    ana.conexion.enviarMensaje({ tipo: "iniciarPartida" });
    await esperar("la vista inicial de Beto", () => beto.ultimaVista());

    // Simula la caída del canal de Beto y su reconexión con el token guardado.
    await beto.conexion.desconectar();
    const betoReconectado = await conectarCon(
      new TransporteOnlineCliente({ senalizacion: new SenalizacionFalsa(broker) }),
      "Beto",
      codigo,
      token ?? undefined,
    );
    clientes.push(betoReconectado);

    expect(betoReconectado.jugadorId).toBe(idOriginal); // mismo asiento, no uno nuevo.
    // Tras reattach el orquestador reenvía su vista: sigue habiendo 2 jugadores.
    const vista = (await esperar(
      "la vista tras reattach",
      () => betoReconectado.ultimaVista(),
    )) as VistaPartida;
    expect(vista.jugadores).toHaveLength(2);
  });
});
