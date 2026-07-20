// Test (a) de la fase: el orquestador completo SIN red, sobre el transporte
// en memoria. Partida guionizada de 9 manos, vistas por jugador, información
// oculta, lobby, reconexión y votos de avance de mano.

import { describe, expect, it } from "vitest";
import type { Carta } from "@juegos/carioca-core";
import { crearGeneradorSemilla, esComodin } from "@juegos/carioca-core";
import { idsSegunEspecs } from "../../carioca-core/src/apoyoPruebas.js";
import { Orquestador } from "./orquestador.js";
import type { Programador } from "./orquestador.js";
import type { GeneradorAleatorio } from "./motor.js";
import { crearMotorCarioca } from "./juegos/carioca/motorCarioca.js";
import type { MensajeCliente, MensajeServidor } from "./protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "./protocolo.js";
import type { TransporteCliente } from "./transporte.js";
import { TransporteMemoria } from "./transporteMemoria.js";
import type { VistaPartida } from "./vista.js";
import {
  cartasFiltradasEnVista,
  fabricaMazoParaMano,
  GUIONES,
  jugarPartidaGuionizada,
  mazoApilado,
} from "./pruebas/guion.js";
import type { GuionMano } from "./pruebas/guion.js";

/** Deja vaciar la cola de microtareas: asienta todos los mensajes en vuelo. */
function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

/**
 * Reloj manual para las gracias de desconexión: acumula los callbacks y los
 * dispara con `avanzar()`. Así los tests controlan la expiración de los 10s sin
 * esperar tiempo real ni interferir con el `setTimeout(0)` de `asentar()`.
 */
class RelojManual {
  private pendientes = new Map<number, () => void>();
  private contador = 0;
  /** Duraciones (ms) de cada temporizador armado; útil para el reloj +Turbo. */
  readonly msProgramados: number[] = [];

  readonly programar = (ms: number, fn: () => void): (() => void) => {
    this.msProgramados.push(ms);
    const id = this.contador++;
    this.pendientes.set(id, fn);
    return () => {
      this.pendientes.delete(id);
    };
  };

  /** Dispara (y descarta) todos los temporizadores pendientes. */
  avanzar(): void {
    const aDisparar = [...this.pendientes.values()];
    this.pendientes.clear();
    for (const fn of aDisparar) fn();
  }
}

/** B roba y descarta una carta normal: cierra su turno sin ganar la mano. */
async function jugarTurnoSimple(cliente: ClientePrueba): Promise<void> {
  cliente.enviar({ tipo: "robarDelMazo" });
  await asentar();
  const carta = cliente.ultimaVista().tuMano.find((c) => !esComodin(c));
  if (carta === undefined) throw new Error("no hay carta normal para descartar");
  cliente.enviar({ tipo: "descartar", cartaId: carta.id });
  await asentar();
}

function estadoConexionDe(cliente: ClientePrueba, jugadorId: string): string | undefined {
  return cliente.ultimaVista().jugadores.find((j) => j.id === jugadorId)?.estadoConexion;
}

class ClientePrueba {
  readonly mensajes: MensajeServidor[] = [];
  desconectado = false;
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
      alDesconectar: () => {
        this.desconectado = true;
      },
    });
  }

  enviar(mensaje: MensajeCliente): void {
    this.cliente.enviar(serializarCliente(mensaje));
  }

  enviarCrudo(datos: string): void {
    this.cliente.enviar(datos);
  }

  desconectar(): Promise<void> {
    return this.cliente.desconectar();
  }

  ultimaVista(): VistaPartida {
    for (let i = this.mensajes.length - 1; i >= 0; i--) {
      const mensaje = this.mensajes[i];
      if (mensaje !== undefined && mensaje.tipo === "vista") return mensaje.vista;
    }
    throw new Error(`${this.jugadorId || "el cliente"} no recibió ninguna vista`);
  }

  ultimoError(): { codigo: string; mensaje: string } {
    for (let i = this.mensajes.length - 1; i >= 0; i--) {
      const mensaje = this.mensajes[i];
      if (mensaje !== undefined && mensaje.tipo === "error") return mensaje;
    }
    throw new Error(`${this.jugadorId || "el cliente"} no recibió ningún error`);
  }
}

interface Sala {
  readonly orquestador: Orquestador;
  readonly transporte: TransporteMemoria;
  readonly codigo: string;
  readonly clientes: readonly ClientePrueba[];
}

interface OpcionesAbrir {
  readonly rng?: GeneradorAleatorio;
  readonly maxJugadores?: number;
  readonly mazoParaMano?: (numeroMano: number) => readonly Carta[];
  readonly programar?: Programador;
}

async function abrirSala(
  nombres: readonly string[],
  opciones?: OpcionesAbrir,
): Promise<Sala> {
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({
    transporte,
    motor: crearMotorCarioca(
      opciones?.mazoParaMano !== undefined ? { mazoParaMano: opciones.mazoParaMano } : {},
    ),
    ...(opciones?.rng !== undefined ? { rng: opciones.rng } : {}),
    ...(opciones?.maxJugadores !== undefined ? { maxJugadores: opciones.maxJugadores } : {}),
    ...(opciones?.programar !== undefined ? { programar: opciones.programar } : {}),
  });
  const codigo = await orquestador.iniciar();
  const clientes: ClientePrueba[] = [];
  for (const nombre of nombres) {
    const cliente = new ClientePrueba(transporte.crearCliente());
    await cliente.conectar(codigo);
    cliente.enviar({ tipo: "unirse", nombre });
    await asentar();
    clientes.push(cliente);
  }
  return { orquestador, transporte, codigo, clientes };
}

async function iniciarPartida(sala: Sala): Promise<void> {
  sala.clientes[0]?.enviar({ tipo: "iniciarPartida" });
  await asentar();
}

/** El ganador del guion cierra la mano en su primer turno. */
async function cerrarManoSegunGuion(
  ganador: ClientePrueba,
  guion: GuionMano,
): Promise<void> {
  ganador.enviar({ tipo: "robarDelMazo" });
  await asentar();
  const disponibles = [...ganador.ultimaVista().tuMano];
  ganador.enviar({
    tipo: "bajarse",
    propuesta: guion.propuesta.map((parte) => ({
      tipo: parte.tipo,
      cartaIds: idsSegunEspecs(disponibles, parte.especs),
    })),
  });
  await asentar();
  if (guion.descarte !== null) {
    const ids = idsSegunEspecs([...ganador.ultimaVista().tuMano], [guion.descarte]);
    const cartaId = ids[0];
    if (cartaId === undefined) throw new Error("no se encontró el descarte del guion");
    ganador.enviar({ tipo: "descartar", cartaId });
    await asentar();
  }
}

const GUION_MANO_1: GuionMano = (() => {
  const guion = GUIONES[0];
  if (guion === undefined) throw new Error("no hay guion para la mano 1");
  return guion;
})();

/** Mazos válidos para salas de 3-4 jugadores (la mano 1 la gana el asiento 1). */
function mazosParaSala(numJugadores: number) {
  return (): readonly Carta[] =>
    mazoApilado(numJugadores, {
      ganadorIdx: 1,
      manoGanador: GUION_MANO_1.manoGanador,
      pozo: GUION_MANO_1.pozo,
      robos: [GUION_MANO_1.robo],
    });
}

describe("orquestador: partida completa sin red (transporte en memoria)", () => {
  it("2 jugadores juegan las 9 manos con vistas correctas y sin filtraciones", async () => {
    const transporte = new TransporteMemoria();
    const orquestador = new Orquestador({
      transporte,
      motor: crearMotorCarioca({ mazoParaMano: fabricaMazoParaMano(GUIONES) }),
    });
    const codigo = await orquestador.iniciar();

    const registros = await jugarPartidaGuionizada(
      codigo,
      [transporte.crearCliente(), transporte.crearCliente()],
      GUIONES,
    );

    expect(registros).toHaveLength(2);
    for (const registro of registros) {
      expect(registro.errores).toEqual([]);
      // Se recorrieron las 9 manos.
      const manosVistas = new Set(registro.vistas.map((v) => v.manoActual));
      expect([...manosVistas].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      // Ninguna vista filtró cartas ajenas, del mazo ni del pozo enterrado.
      for (const vista of registro.vistas) {
        expect(cartasFiltradasEnVista(vista)).toEqual([]);
        expect(vista.tuJugadorId).toBe(registro.jugadorId);
      }
      // Cada mano terminada llegó con su resumen de puntos.
      const resumenes = registro.vistas.filter((v) => v.fase !== "jugandoMano");
      expect(resumenes.length).toBeGreaterThanOrEqual(9);
      for (const vista of resumenes) {
        expect(vista.resumenMano).not.toBeNull();
      }
      // Final: partida terminada y ganadores = menor puntaje acumulado.
      const final = registro.vistas[registro.vistas.length - 1];
      expect(final?.fase).toBe("partidaTerminada");
      const minimo = Math.min(...(final?.jugadores.map((j) => j.puntosAcumulados) ?? []));
      expect(final?.ganadoresIds).toEqual(
        final?.jugadores.filter((j) => j.puntosAcumulados === minimo).map((j) => j.id),
      );
    }
    // Ambos clientes coinciden en el resultado.
    const finales = registros.map((r) => r.vistas[r.vistas.length - 1]);
    expect(finales[0]?.ganadoresIds).toEqual(finales[1]?.ganadoresIds);

    await orquestador.detener();
  });

  it("reparte bien con 3 y 4 jugadores", async () => {
    for (const cantidad of [3, 4]) {
      const nombres = Array.from({ length: cantidad }, (_, i) => `Jugador ${i + 1}`);
      const sala = await abrirSala(nombres, { rng: crearGeneradorSemilla(7) });
      await iniciarPartida(sala);
      for (const cliente of sala.clientes) {
        const vista = cliente.ultimaVista();
        expect(vista.tuMano).toHaveLength(12);
        expect(vista.jugadores).toHaveLength(cantidad);
        for (const jugador of vista.jugadores) {
          expect(jugador.numeroCartas).toBe(12);
        }
        // Abre el asiento siguiente al repartidor.
        expect(vista.turno.jugadorId).toBe(sala.clientes[1]?.jugadorId);
        expect(cartasFiltradasEnVista(vista)).toEqual([]);
      }
      await sala.orquestador.detener();
    }
  });
});

describe("orquestador: lobby y casos borde", () => {
  it("por defecto no hay tope: un quinto jugador se une sin problema", async () => {
    const sala = await abrirSala(["A", "B", "C", "D"]);
    const quinto = new ClientePrueba(sala.transporte.crearCliente());
    await quinto.conectar(sala.codigo);
    quinto.enviar({ tipo: "unirse", nombre: "E" });
    await asentar();
    expect(quinto.desconectado).toBe(false);
    expect(quinto.jugadorId).not.toBeNull();
    const estadoSala = [...quinto.mensajes]
      .reverse()
      .find((m) => m.tipo === "estadoSala");
    if (estadoSala?.tipo !== "estadoSala") throw new Error("no llegó estadoSala");
    expect(estadoSala.jugadores).toHaveLength(5);
    await sala.orquestador.detener();
  });

  it("con un cupo explícito (maxJugadores) rechaza al excedente con salaLlena", async () => {
    const sala = await abrirSala(["A", "B", "C", "D"], { maxJugadores: 4 });
    const quinto = new ClientePrueba(sala.transporte.crearCliente());
    await quinto.conectar(sala.codigo);
    quinto.enviar({ tipo: "unirse", nombre: "E" });
    await asentar();
    expect(quinto.ultimoError().codigo).toBe("salaLlena");
    expect(quinto.desconectado).toBe(true);
    await sala.orquestador.detener();
  });

  it("solo el anfitrión inicia, y el mínimo de 2 lo valida el core", async () => {
    const sala = await abrirSala(["A", "B"]);
    sala.clientes[1]?.enviar({ tipo: "iniciarPartida" });
    await asentar();
    expect(sala.clientes[1]?.ultimoError().codigo).toBe("noEresAnfitrion");

    const solitaria = await abrirSala(["A"]);
    solitaria.clientes[0]?.enviar({ tipo: "iniciarPartida" });
    await asentar();
    expect(solitaria.clientes[0]?.ultimoError().codigo).toBe("JUGADORES_INVALIDOS");

    await sala.orquestador.detener();
    await solitaria.orquestador.detener();
  });

  it("responde mensajeInvalido ante JSON roto o tipo desconocido, sin cerrar", async () => {
    const sala = await abrirSala(["A", "B"]);
    const cliente = sala.clientes[0];
    if (cliente === undefined) throw new Error("sin cliente");
    cliente.enviarCrudo("esto no es json");
    await asentar();
    expect(cliente.ultimoError().codigo).toBe("mensajeInvalido");
    cliente.enviarCrudo(JSON.stringify({ tipo: "hackear" }));
    await asentar();
    expect(cliente.ultimoError().codigo).toBe("mensajeInvalido");
    expect(cliente.desconectado).toBe(false);
    await sala.orquestador.detener();
  });

  it("una intención fuera de turno devuelve el error del core SOLO al emisor", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const [fueraDeTurno, enTurno] = sala.clientes;
    if (fueraDeTurno === undefined || enTurno === undefined) throw new Error("sin clientes");
    const mensajesPrevios = enTurno.mensajes.length;
    // En la mano 1 abre el asiento 1: el asiento 0 está fuera de turno.
    fueraDeTurno.enviar({ tipo: "robarDelMazo" });
    await asentar();
    expect(fueraDeTurno.ultimoError().codigo).toBe("NO_ES_TU_TURNO");
    expect(enTurno.mensajes.length).toBe(mensajesPrevios);
    await sala.orquestador.detener();
  });

  it("no se puede entrar sin token con la partida ya iniciada", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const tardio = new ClientePrueba(sala.transporte.crearCliente());
    await tardio.conectar(sala.codigo);
    tardio.enviar({ tipo: "unirse", nombre: "Tardío" });
    await asentar();
    expect(tardio.ultimoError().codigo).toBe("partidaYaIniciada");
    expect(tardio.desconectado).toBe(true);
    await sala.orquestador.detener();
  });

  it("si el anfitrión sale del lobby, el siguiente asiento queda de anfitrión", async () => {
    const sala = await abrirSala(["A", "B", "C"]);
    const segundo = sala.clientes[1];
    if (segundo === undefined) throw new Error("sin cliente");
    await sala.clientes[0]?.desconectar();
    await asentar();
    const estadoSala = [...segundo.mensajes]
      .reverse()
      .find((m) => m.tipo === "estadoSala");
    if (estadoSala?.tipo !== "estadoSala") throw new Error("no llegó estadoSala");
    expect(estadoSala.jugadores).toHaveLength(2);
    expect(estadoSala.jugadores[0]?.jugadorId).toBe(segundo.jugadorId);
    expect(estadoSala.jugadores[0]?.esAnfitrion).toBe(true);
    // Y puede iniciar la partida con los 2 que quedan.
    segundo.enviar({ tipo: "iniciarPartida" });
    await asentar();
    expect(segundo.ultimaVista().jugadores).toHaveLength(2);
    await sala.orquestador.detener();
  });
});

describe("orquestador: reconexión", () => {
  it("conserva el asiento, avisa a los demás y restaura la mano con el token", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const [caido, testigo] = sala.clientes;
    if (caido === undefined || testigo === undefined) throw new Error("sin clientes");
    const manoAntes = caido.ultimaVista().tuMano.map((c) => c.id);

    await caido.desconectar();
    await asentar();
    const vistaTrasCaida = testigo.ultimaVista();
    expect(
      vistaTrasCaida.jugadores.find((j) => j.id === caido.jugadorId)?.conectado,
    ).toBe(false);

    const repuesto = new ClientePrueba(sala.transporte.crearCliente());
    await repuesto.conectar(sala.codigo);
    repuesto.enviar({ tipo: "unirse", nombre: "A bis", token: caido.token });
    await asentar();
    expect(repuesto.jugadorId).toBe(caido.jugadorId);
    expect(repuesto.ultimaVista().tuMano.map((c) => c.id)).toEqual(manoAntes);
    expect(
      testigo.ultimaVista().jugadores.find((j) => j.id === caido.jugadorId)?.conectado,
    ).toBe(true);
    await sala.orquestador.detener();
  });

  it("reattacha aunque el canal anterior siga vivo (cierra el socket zombi)", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const a = sala.clientes[0];
    if (a === undefined) throw new Error("sin cliente");
    const manoA = a.ultimaVista().tuMano.map((c) => c.id);

    // A reconecta SIN desconectar antes: el canal viejo sigue abierto.
    const rep = new ClientePrueba(sala.transporte.crearCliente());
    await rep.conectar(sala.codigo);
    rep.enviar({ tipo: "unirse", nombre: "A", token: a.token });
    await asentar();

    expect(rep.jugadorId).toBe(a.jugadorId);
    expect(rep.ultimaVista().tuMano.map((c) => c.id)).toEqual(manoA);
    expect(a.desconectado).toBe(true); // el zombi se cerró
    await sala.orquestador.detener();
  });

  it("rechaza un token inválido y cierra esa conexión", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const impostor = new ClientePrueba(sala.transporte.crearCliente());
    await impostor.conectar(sala.codigo);
    impostor.enviar({ tipo: "unirse", nombre: "Impostor", token: "token-falso" });
    await asentar();
    expect(impostor.ultimoError().codigo).toBe("tokenInvalido");
    expect(impostor.desconectado).toBe(true);
    await sala.orquestador.detener();
  });
});

describe("orquestador: votos para la siguiente mano (75% de conectados)", () => {
  it("con 2 jugadores exige 2 votos y un voto duplicado no cuenta doble", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const [primero, ganador] = sala.clientes;
    if (primero === undefined || ganador === undefined) throw new Error("sin clientes");

    await cerrarManoSegunGuion(ganador, GUION_MANO_1);
    expect(primero.ultimaVista().fase).toBe("manoTerminada");
    expect(primero.ultimaVista().resumenMano?.votosNecesarios).toBe(2);

    ganador.enviar({ tipo: "listoSiguienteMano" });
    await asentar();
    expect(primero.ultimaVista().manoActual).toBe(1);
    ganador.enviar({ tipo: "listoSiguienteMano" });
    await asentar();
    expect(primero.ultimaVista().manoActual).toBe(1);
    expect(primero.ultimaVista().resumenMano?.votosListos).toBe(1);

    primero.enviar({ tipo: "listoSiguienteMano" });
    await asentar();
    expect(primero.ultimaVista().manoActual).toBe(2);
    expect(primero.ultimaVista().fase).toBe("jugandoMano");
    await sala.orquestador.detener();
  });

  it("una desconexión baja el denominador y puede disparar el avance", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const [primero, ganador] = sala.clientes;
    if (primero === undefined || ganador === undefined) throw new Error("sin clientes");

    await cerrarManoSegunGuion(ganador, GUION_MANO_1);
    ganador.enviar({ tipo: "listoSiguienteMano" });
    await asentar();
    expect(ganador.ultimaVista().manoActual).toBe(1);

    await primero.desconectar();
    await asentar();
    // Queda 1 conectado: ceil(0.75 × 1) = 1 voto, ya emitido → avanza.
    expect(ganador.ultimaVista().manoActual).toBe(2);
    await sala.orquestador.detener();
  });

  it("con 3 jugadores exige 3 votos y con 4 exige 3", async () => {
    for (const cantidad of [3, 4]) {
      const nombres = Array.from({ length: cantidad }, (_, i) => `Jugador ${i + 1}`);
      const sala = await abrirSala(nombres, { mazoParaMano: mazosParaSala(cantidad) });
      await iniciarPartida(sala);
      const ganador = sala.clientes[1];
      if (ganador === undefined) throw new Error("sin ganador");

      await cerrarManoSegunGuion(ganador, GUION_MANO_1);
      const necesarios = cantidad === 3 ? 3 : 3; // ceil(0.75×3)=3, ceil(0.75×4)=3
      expect(ganador.ultimaVista().resumenMano?.votosNecesarios).toBe(necesarios);

      for (let i = 0; i < necesarios; i++) {
        expect(ganador.ultimaVista().manoActual).toBe(1);
        sala.clientes[i]?.enviar({ tipo: "listoSiguienteMano" });
        await asentar();
      }
      expect(ganador.ultimaVista().manoActual).toBe(2);
      await sala.orquestador.detener();
    }
  });
});

describe("orquestador: gracia, salto de turno y suspensión", () => {
  /** Sala de 2 con mano 1 guionizada y reloj manual para las gracias. */
  async function salaConReloj(): Promise<{ sala: Sala; reloj: RelojManual }> {
    const reloj = new RelojManual();
    const sala = await abrirSala(["A", "B"], {
      mazoParaMano: fabricaMazoParaMano(GUIONES),
      programar: reloj.programar,
    });
    await iniciarPartida(sala);
    return { sala, reloj };
  }

  it("reconectar dentro de la gracia vuelve a conectado sin saltar el turno", async () => {
    const { sala } = await salaConReloj();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");
    const manoA = a.ultimaVista().tuMano.map((c) => c.id);

    await a.desconectar(); // a (j1) no es el de turno (abre j2)
    await asentar();
    expect(estadoConexionDe(b, a.jugadorId)).toBe("ausente");

    const rep = new ClientePrueba(sala.transporte.crearCliente());
    await rep.conectar(sala.codigo);
    rep.enviar({ tipo: "unirse", nombre: "A", token: a.token });
    await asentar();

    expect(rep.jugadorId).toBe(a.jugadorId);
    expect(rep.ultimaVista().tuMano.map((c) => c.id)).toEqual(manoA);
    expect(estadoConexionDe(rep, a.jugadorId)).toBe("conectado");
    // El turno nunca se movió: sigue en B y A no fue saltado.
    expect(rep.ultimaVista().turno.jugadorId).toBe(b.jugadorId);
    await sala.orquestador.detener();
  });

  it("al expirar la gracia se salta el turno del ausente", async () => {
    const { sala, reloj } = await salaConReloj();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");

    await a.desconectar();
    await asentar();
    // B juega: el turno pasa a A, pero A está en gracia → se espera (no se salta).
    await jugarTurnoSimple(b);
    expect(b.ultimaVista().turno.jugadorId).toBe(a.jugadorId);

    reloj.avanzar(); // expira la gracia de A
    await asentar();
    expect(b.ultimaVista().turno.jugadorId).toBe(b.jugadorId);
    await sala.orquestador.detener();
  });

  it("si se desconecta el jugador en turno, se espera su gracia antes de saltar", async () => {
    const { sala, reloj } = await salaConReloj();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");

    await b.desconectar(); // B (j2) es el de turno
    await asentar();
    // No se salta mientras corre la gracia: el turno sigue en B.
    expect(a.ultimaVista().turno.jugadorId).toBe(b.jugadorId);
    expect(estadoConexionDe(a, b.jugadorId)).toBe("ausente");

    reloj.avanzar();
    await asentar();
    expect(a.ultimaVista().turno.jugadorId).toBe(a.jugadorId);
    await sala.orquestador.detener();
  });

  it("tras dos turnos saltados queda suspendido y se le salta siempre", async () => {
    const { sala, reloj } = await salaConReloj();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");

    await a.desconectar();
    await asentar();

    await jugarTurnoSimple(b); // turno → A (en gracia)
    reloj.avanzar(); // expira gracia → salta A (1) → turno B
    await asentar();
    expect(estadoConexionDe(b, a.jugadorId)).toBe("ausente");

    await jugarTurnoSimple(b); // turno → A (gracia expirada) → salta A (2) → suspendido
    expect(estadoConexionDe(b, a.jugadorId)).toBe("suspendido");
    expect(b.ultimaVista().turno.jugadorId).toBe(b.jugadorId);

    // Suspendido: se le sigue saltando solo en cada ronda.
    await jugarTurnoSimple(b);
    expect(b.ultimaVista().turno.jugadorId).toBe(b.jugadorId);
    await sala.orquestador.detener();
  });

  it("el suspendido se reconecta, vuelve a conectado y recupera asiento y mano", async () => {
    const { sala, reloj } = await salaConReloj();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");
    const manoA = a.ultimaVista().tuMano.map((c) => c.id);

    await a.desconectar();
    await asentar();
    await jugarTurnoSimple(b);
    reloj.avanzar();
    await asentar();
    await jugarTurnoSimple(b); // A queda suspendido
    expect(estadoConexionDe(b, a.jugadorId)).toBe("suspendido");

    const rep = new ClientePrueba(sala.transporte.crearCliente());
    await rep.conectar(sala.codigo);
    rep.enviar({ tipo: "unirse", nombre: "A", token: a.token });
    await asentar();

    expect(rep.jugadorId).toBe(a.jugadorId);
    expect(rep.ultimaVista().tuMano.map((c) => c.id)).toEqual(manoA);
    expect(estadoConexionDe(rep, a.jugadorId)).toBe("conectado");
    await sala.orquestador.detener();
  });
});

describe("orquestador: el anfitrión reabre la conexión (sin expulsar)", () => {
  it("cierra el canal trabado y el jugador reentra con su token conservando todo", async () => {
    const reloj = new RelojManual();
    const sala = await abrirSala(["A", "B"], {
      mazoParaMano: fabricaMazoParaMano(GUIONES),
      programar: reloj.programar,
    });
    await iniciarPartida(sala);
    const [anfitrion, atascado] = sala.clientes;
    if (anfitrion === undefined || atascado === undefined) throw new Error("sin clientes");
    const manoB = atascado.ultimaVista().tuMano.map((c) => c.id);

    // El anfitrión (asiento 0) reabre el canal de B (que seguía "conectado").
    anfitrion.enviar({ tipo: "reabrirConexion", jugadorId: atascado.jugadorId });
    await asentar();
    expect(atascado.desconectado).toBe(true);

    // B reentra con su token: mismo asiento y misma mano (no se creó uno nuevo).
    const repuesto = new ClientePrueba(sala.transporte.crearCliente());
    await repuesto.conectar(sala.codigo);
    repuesto.enviar({ tipo: "unirse", nombre: "B bis", token: atascado.token });
    await asentar();
    expect(repuesto.jugadorId).toBe(atascado.jugadorId);
    expect(repuesto.ultimaVista().tuMano.map((c) => c.id)).toEqual(manoB);
    expect(estadoConexionDe(repuesto, atascado.jugadorId)).toBe("conectado");
    // Nadie fue expulsado: el asiento sigue presente.
    expect(anfitrion.ultimaVista().jugadores).toHaveLength(2);
    await sala.orquestador.detener();
  });

  it("un no-anfitrión que intenta reabrir recibe noEresAnfitrion", async () => {
    const sala = await abrirSala(["A", "B"], { mazoParaMano: fabricaMazoParaMano(GUIONES) });
    await iniciarPartida(sala);
    const noAnfitrion = sala.clientes[1];
    if (noAnfitrion === undefined) throw new Error("sin cliente");
    noAnfitrion.enviar({ tipo: "reabrirConexion", jugadorId: "j1" });
    await asentar();
    expect(noAnfitrion.ultimoError().codigo).toBe("noEresAnfitrion");
    await sala.orquestador.detener();
  });
});

describe("orquestador: modo +Turbo (reloj por turno)", () => {
  /** Sala de 2 con mano 1 guionizada, reloj manual y turbo activado por el anfitrión. */
  async function salaTurbo(): Promise<{ sala: Sala; reloj: RelojManual }> {
    const reloj = new RelojManual();
    const sala = await abrirSala(["A", "B"], {
      mazoParaMano: fabricaMazoParaMano(GUIONES),
      programar: reloj.programar,
    });
    sala.clientes[0]?.enviar({ tipo: "iniciarPartida", turbo: true });
    await asentar();
    return { sala, reloj };
  }

  it("difunde turbo activo y ~60s en el primer turno de la mano", async () => {
    const { sala, reloj } = await salaTurbo();
    const b = sala.clientes[1]; // abre el asiento 1 en la mano 1
    if (b === undefined) throw new Error("sin cliente");
    const vista = b.ultimaVista();
    expect(vista.turbo).toBe(true);
    expect(vista.turboMsRestantes).not.toBeNull();
    expect(vista.turboMsRestantes ?? 0).toBeGreaterThan(59_000);
    expect(vista.turboMsRestantes ?? 0).toBeLessThanOrEqual(60_000);
    expect(reloj.msProgramados[0]).toBe(60_000);
    await sala.orquestador.detener();
  });

  it("los turnos siguientes al primero de la mano duran 15s", async () => {
    const { sala, reloj } = await salaTurbo();
    const b = sala.clientes[1];
    if (b === undefined) throw new Error("sin cliente");
    // B completa su turno (rob + descarte): el turno pasa a A (numero 2 → 15s).
    await jugarTurnoSimple(b);
    expect(reloj.msProgramados).toEqual([60_000, 15_000]);
    await sala.orquestador.detener();
  });

  it("si el tiempo vence SIN robar, se salta el turno", async () => {
    const { sala, reloj } = await salaTurbo();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");
    expect(b.ultimaVista().turno.jugadorId).toBe(b.jugadorId); // B en turno, fase robar
    reloj.avanzar(); // vence el turno de B sin haber robado
    await asentar();
    expect(a.ultimaVista().turno.jugadorId).toBe(a.jugadorId); // saltó a A
    // B no perdió cartas (no descartó): sigue en 12.
    expect(a.ultimaVista().jugadores.find((j) => j.id === b.jugadorId)?.numeroCartas).toBe(12);
    await sala.orquestador.detener();
  });

  it("si el tiempo vence DESPUÉS de robar, se bota una carta (no comodín) y pasa el turno", async () => {
    const { sala, reloj } = await salaTurbo();
    const [a, b] = sala.clientes;
    if (a === undefined || b === undefined) throw new Error("sin clientes");
    b.enviar({ tipo: "robarDelMazo" });
    await asentar();
    expect(b.ultimaVista().tuMano).toHaveLength(13); // robó
    reloj.avanzar(); // vence en fase descartar → descarte aleatorio
    await asentar();
    expect(a.ultimaVista().turno.jugadorId).toBe(a.jugadorId); // pasó el turno
    // Robó (+1) y botó una carta (−1): vuelve a 12.
    expect(a.ultimaVista().jugadores.find((j) => j.id === b.jugadorId)?.numeroCartas).toBe(12);
    // La carta botada nunca es un comodín (descartarlo es ilegal).
    const pozoTope = a.ultimaVista().pozoTope;
    expect(pozoTope !== null && esComodin(pozoTope)).toBe(false);
    await sala.orquestador.detener();
  });

  it("abrir la bajada suma 5s al turno UNA sola vez", async () => {
    const { sala, reloj } = await salaTurbo();
    const b = sala.clientes[1];
    if (b === undefined) throw new Error("sin cliente");
    b.enviar({ tipo: "robarDelMazo" });
    await asentar();
    b.enviar({ tipo: "extenderTurboBajada" });
    await asentar();
    const restanteTrasUno = b.ultimaVista().turboMsRestantes ?? 0;
    expect(restanteTrasUno).toBeGreaterThan(64_000);
    expect(restanteTrasUno).toBeLessThanOrEqual(65_000);
    // Un segundo aviso en el mismo turno no vuelve a sumar.
    b.enviar({ tipo: "extenderTurboBajada" });
    await asentar();
    expect(b.ultimaVista().turboMsRestantes ?? 0).toBeLessThanOrEqual(65_000);
    // Se re-armó el temporizador con el nuevo vencimiento (60000 y luego ~65000).
    expect(reloj.msProgramados[0]).toBe(60_000);
    expect(reloj.msProgramados[reloj.msProgramados.length - 1]).toBeGreaterThan(64_000);
    await sala.orquestador.detener();
  });

  it("sin turbo (partida normal) no se arma ningún reloj de turno", async () => {
    const reloj = new RelojManual();
    const sala = await abrirSala(["A", "B"], {
      mazoParaMano: fabricaMazoParaMano(GUIONES),
      programar: reloj.programar,
    });
    await iniciarPartida(sala); // sin turbo
    expect(reloj.msProgramados).toEqual([]);
    const vista = sala.clientes[0]?.ultimaVista();
    expect(vista?.turbo).toBe(false);
    expect(vista?.turboMsRestantes).toBeNull();
    await sala.orquestador.detener();
  });
});

describe("orquestador: sincronización de config de sala (Sesión 3)", () => {
  /** Última config que recibió el cliente por `configSala` (null si ninguna). */
  function ultimaConfig(cliente: ClientePrueba): Record<string, unknown> | null {
    for (let i = cliente.mensajes.length - 1; i >= 0; i--) {
      const m = cliente.mensajes[i];
      if (m !== undefined && m.tipo === "configSala") return m.config;
    }
    return null;
  }

  it("el anfitrión fija la config y TODOS reciben el mismo configSala", async () => {
    const sala = await abrirSala(["Ana", "Ben"]);
    const [ana, ben] = sala.clientes;
    if (ana === undefined || ben === undefined) throw new Error("faltan clientes");
    const config = { habilidadesPorJugador: 2, visibilidad: "publica" };
    ana.enviar({ tipo: "actualizarConfig", config });
    await asentar();
    expect(ultimaConfig(ana)).toEqual(config);
    expect(ultimaConfig(ben)).toEqual(config);
    await sala.orquestador.detener();
  });

  it("un no-anfitrión recibe noEresAnfitrion y no se difunde su config", async () => {
    const sala = await abrirSala(["Ana", "Ben"]);
    const ben = sala.clientes[1];
    if (ben === undefined) throw new Error("falta el cliente");
    ben.enviar({ tipo: "actualizarConfig", config: { visibilidad: "publica" } });
    await asentar();
    expect(ben.ultimoError().codigo).toBe("noEresAnfitrion");
    expect(ultimaConfig(ben)).toBeNull();
    await sala.orquestador.detener();
  });

  it("quien se une tarde recibe la config autoritativa vigente", async () => {
    const sala = await abrirSala(["Ana"]);
    const ana = sala.clientes[0];
    if (ana === undefined) throw new Error("falta el anfitrión");
    const config = { habilidadesPorJugador: 3 };
    ana.enviar({ tipo: "actualizarConfig", config });
    await asentar();
    const cami = new ClientePrueba(sala.transporte.crearCliente());
    await cami.conectar(sala.codigo);
    cami.enviar({ tipo: "unirse", nombre: "Cami" });
    await asentar();
    expect(ultimaConfig(cami)).toEqual(config);
    await sala.orquestador.detener();
  });

  it("actualizar la config en partida ya iniciada da accionInvalida", async () => {
    const sala = await abrirSala(["Ana", "Ben"], { mazoParaMano: mazosParaSala(2) });
    const ana = sala.clientes[0];
    if (ana === undefined) throw new Error("falta el anfitrión");
    await iniciarPartida(sala);
    ana.enviar({ tipo: "actualizarConfig", config: { visibilidad: "publica" } });
    await asentar();
    expect(ana.ultimoError().codigo).toBe("accionInvalida");
    await sala.orquestador.detener();
  });
});
