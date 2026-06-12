// Test (a) de la fase: el orquestador completo SIN red, sobre el transporte
// en memoria. Partida guionizada de 9 manos, vistas por jugador, información
// oculta, lobby, reconexión y votos de avance de mano.

import { describe, expect, it } from "vitest";
import type { Carta } from "@juegos/carioca-core";
import { crearGeneradorSemilla } from "@juegos/carioca-core";
import { idsSegunEspecs } from "../../carioca-core/src/apoyoPruebas.js";
import { Orquestador } from "./orquestador.js";
import type { OpcionesOrquestador } from "./orquestador.js";
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

async function abrirSala(
  nombres: readonly string[],
  opciones?: Partial<OpcionesOrquestador>,
): Promise<Sala> {
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({ transporte, ...opciones });
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
      mazoParaMano: fabricaMazoParaMano(GUIONES),
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
  it("rechaza al quinto jugador con salaLlena y cierra su conexión", async () => {
    const sala = await abrirSala(["A", "B", "C", "D"]);
    const quinto = new ClientePrueba(sala.transporte.crearCliente());
    await quinto.conectar(sala.codigo);
    quinto.enviar({ tipo: "unirse", nombre: "E" });
    await asentar();
    expect(quinto.ultimoError().codigo).toBe("salaLlena");
    expect(quinto.desconectado).toBe(true);
    await sala.orquestador.detener();
  });

  it("solo el anfitrión inicia, y la regla 2-4 la valida el core", async () => {
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
