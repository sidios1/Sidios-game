// La prueba de fuego de S1b: el orquestador GENÉRICO moviendo solo una partida
// dirigida por reloj. Con el `programar` inyectado no pasa tiempo real: el test
// dispara los vencimientos a mano y verifica que las fases avanzan igual.
//
// Antes de esta sesión, esta partida se congelaba en `precarga`: el reloj se
// armaba pero `alVencerTurno` salía por `jugadorEnTurno() === null` (SPIKE §1.2).

import { describe, expect, it } from "vitest";
import { Orquestador } from "../../orquestador.js";
import type { Programador } from "../../orquestador.js";
import type { MensajeCliente, MensajeServidor } from "../../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../../protocolo.js";
import type { TransporteCliente } from "../../transporte.js";
import { TransporteMemoria } from "../../transporteMemoria.js";
import type { VistaJuego } from "../../vistaJuego.js";
import type { VistaMeloquizSala } from "./vistaMeloquiz.js";
import { poolMock } from "../../pruebas/poolMeloquiz.js";
import { crearMotorMeloquiz } from "./motorMeloquiz.js";

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

/**
 * Reloj manual: acumula los temporizadores y los dispara con `avanzar()`. Mismo
 * patrón que el de orquestador.test.ts; `msProgramados` deja distinguir CUÁNDO
 * se arma un timer de cuándo se dispara.
 */
class RelojManual {
  private pendientes = new Map<number, () => void>();
  private contador = 0;
  readonly msProgramados: number[] = [];

  readonly programar: Programador = (ms, fn) => {
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

function comoMeloquiz(vista: VistaJuego): VistaMeloquizSala {
  if (!("juego" in vista) || vista.juego !== "meloquiz") {
    throw new Error("se esperaba una vista de MeloQuiz");
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

  desconectar(): Promise<void> {
    return this.cliente.desconectar();
  }

  ultimaVista(): VistaMeloquizSala {
    const vistas = this.mensajes
      .filter((m): m is Extract<MensajeServidor, { tipo: "vista" }> => m.tipo === "vista")
      .map((m) => comoMeloquiz(m.vista));
    const ultima = vistas[vistas.length - 1];
    if (ultima === undefined) throw new Error(`${this.jugadorId} no recibió ninguna vista`);
    return ultima;
  }
}

interface OpcionesAbrir {
  readonly rondas?: number;
}

async function abrir(opciones: OpcionesAbrir = {}) {
  const reloj = new RelojManual();
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({
    transporte,
    motor: crearMotorMeloquiz(poolMock(), {
      ...(opciones.rondas !== undefined ? { rondas: opciones.rondas } : {}),
    }),
    programar: reloj.programar,
  });
  const codigo = await orquestador.iniciar();
  const j1 = new ClientePrueba(transporte.crearCliente());
  const j2 = new ClientePrueba(transporte.crearCliente());
  await j1.conectar(codigo);
  j1.enviar({ tipo: "unirse", nombre: "Ana", juego: "meloquiz" });
  await asentar();
  await j2.conectar(codigo);
  j2.enviar({ tipo: "unirse", nombre: "Bruno", juego: "meloquiz" });
  await asentar();
  // Sin `turbo: true`: el reloj de fase NO es opt-in del anfitrión.
  j1.enviar({ tipo: "iniciarPartida" });
  await asentar();
  return { orquestador, reloj, transporte, j1, j2 };
}

describe("MeloQuiz en el orquestador (reloj de fase de sala)", () => {
  it("arma el reloj al iniciar SIN pedir turbo (gate aflojado)", async () => {
    const { orquestador, reloj, j1 } = await abrir();
    expect(reloj.msProgramados).toEqual([15_000]); // duración de precarga
    expect(j1.ultimaVista().fase).toBe("precarga");
    await orquestador.detener();
  });

  it("las fases avanzan SOLAS al vencer, sin acción de jugador ni tiempo real", async () => {
    const { orquestador, reloj, j1 } = await abrir();

    reloj.avanzar();
    await asentar();
    expect(j1.ultimaVista().fase).toBe("clip");

    reloj.avanzar();
    await asentar();
    expect(j1.ultimaVista().fase).toBe("voto");

    reloj.avanzar();
    await asentar();
    expect(j1.ultimaVista().fase).toBe("revelar");

    reloj.avanzar();
    await asentar();
    expect(j1.ultimaVista().fase).toBe("puntaje");

    // Cada fase re-armó el reloj con SU duración (§4).
    expect(reloj.msProgramados).toEqual([15_000, 10_000, 10_000, 5_000, 5_000]);
    await orquestador.detener();
  });

  it("una acción DENTRO de la misma fase no reinicia la cuenta", async () => {
    const { orquestador, reloj, j1, j2 } = await abrir();

    // Solo j1 ackea: la fase de precarga sigue siendo "1:precarga".
    j1.enviar({ tipo: "listoPrecarga" });
    await asentar();
    expect(j1.ultimaVista().fase).toBe("precarga");
    expect(j1.ultimaVista().listos).toEqual([j1.jugadorId]);
    expect(reloj.msProgramados).toEqual([15_000]); // NO se re-armó

    // Ackea el segundo: cierre anticipado ⇒ cambia la clave ⇒ se re-arma.
    j2.enviar({ tipo: "listoPrecarga" });
    await asentar();
    expect(j1.ultimaVista().fase).toBe("clip");
    expect(reloj.msProgramados).toEqual([15_000, 10_000]);

    await orquestador.detener();
  });

  it("la vista lleva los DOS campos del reloj: relativo y absoluto", async () => {
    const antes = Date.now();
    const { orquestador, j1 } = await abrir();
    const vista = j1.ultimaVista();

    // Relativo: el contador de la fase.
    expect(vista.faseMsRestantes).toBeGreaterThan(14_000);
    expect(vista.faseMsRestantes).toBeLessThanOrEqual(15_000);
    // Absoluto: el `start_at` en reloj del host (SPIKE §2.2).
    expect(vista.faseInicioMs).toBeGreaterThanOrEqual(antes);
    expect(vista.faseInicioMs).toBeLessThanOrEqual(Date.now());
    expect(vista.duracionFaseMs).toBe(15_000);

    await orquestador.detener();
  });

  it("al terminar la partida el reloj se apaga y no queda timer colgado", async () => {
    const { orquestador, reloj, j1 } = await abrir({ rondas: 1 });

    // precarga → clip → voto → revelar → puntaje → final
    for (let i = 0; i < 5; i++) {
      reloj.avanzar();
      await asentar();
    }

    const vista = j1.ultimaVista();
    expect(vista.fase).toBe("final");
    expect(vista.faseMsRestantes).toBeNull();
    expect(vista.faseInicioMs).toBeNull();
    expect(vista.ganadores.length).toBeGreaterThan(0);
    // La última expiración NO volvió a armar: 5 timers, ni uno más.
    expect(reloj.msProgramados).toHaveLength(5);

    // Y avanzar de nuevo no revive nada.
    reloj.avanzar();
    await asentar();
    expect(j1.ultimaVista().fase).toBe("final");

    await orquestador.detener();
  });

  it("modo entrenamiento: UN jugador juega la partida entera (REGLAS §6, no roto por S4)", async () => {
    const reloj = new RelojManual();
    const transporte = new TransporteMemoria();
    const orquestador = new Orquestador({
      transporte,
      motor: crearMotorMeloquiz(poolMock(), { rondas: 1 }),
      programar: reloj.programar,
    });
    const codigo = await orquestador.iniciar();
    const solo = new ClientePrueba(transporte.crearCliente());
    await solo.conectar(codigo);
    solo.enviar({ tipo: "unirse", nombre: "Ana", juego: "meloquiz" });
    await asentar();

    // La config viaja opaca; el motor (autoridad) valida el 1 jugador.
    solo.enviar({ tipo: "iniciarPartida", config: { entrenamiento: true } });
    await asentar();
    expect(solo.ultimaVista().fase).toBe("precarga");

    // El ack ÚNICO cierra la precarga al instante: el timeout nunca corre.
    expect(reloj.msProgramados).toEqual([15_000]);
    solo.enviar({ tipo: "listoPrecarga" });
    await asentar();
    const clip = solo.ultimaVista();
    expect(clip.fase).toBe("clip");
    // El start_at absoluto viaja igual que en multijugador: con offset 0
    // (RelojHost sin muestras) el plan de arranque es idéntico para el solitario.
    expect(clip.faseInicioMs).not.toBeNull();

    reloj.avanzar(); // clip → voto
    await asentar();
    const opciones = solo.ultimaVista().opciones;
    const primera = opciones[0];
    if (primera === undefined) throw new Error("la ronda no trajo opciones");
    solo.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();
    expect(solo.ultimaVista().fase).toBe("revelar"); // cierre anticipado con 1 voto

    reloj.avanzar(); // revelar → puntaje
    await asentar();
    reloj.avanzar(); // puntaje → final
    await asentar();
    const final = solo.ultimaVista();
    expect(final.fase).toBe("final");
    expect(final.ganadores).toEqual([solo.jugadorId]); // gana él, acierte o no

    await orquestador.detener();
  });

  it("reconexión POR TOKEN a mitad de voto: mismo asiento, puntaje intacto (REGLAS §7)", async () => {
    const { orquestador, reloj, transporte, j1, j2 } = await abrir();

    // Hasta la votación, con ambos conectados.
    j1.enviar({ tipo: "listoPrecarga" });
    j2.enviar({ tipo: "listoPrecarga" });
    await asentar();
    reloj.avanzar(); // clip → voto
    await asentar();
    expect(j1.ultimaVista().fase).toBe("voto");

    // j2 se cae y vuelve con su token (el que guarda sessionStorage).
    const idOriginal = j2.jugadorId;
    const token = j2.token;
    expect(token).not.toBe("");
    await j2.desconectar();
    await asentar();

    const j2Bis = new ClientePrueba(transporte.crearCliente());
    await j2Bis.conectar("memoria");
    j2Bis.enviar({ tipo: "unirse", nombre: "Bruno", juego: "meloquiz", token });
    await asentar();

    // Mismo asiento (no un jugador nuevo) y la partida sigue donde estaba.
    expect(j2Bis.jugadorId).toBe(idOriginal);
    const vista = j2Bis.ultimaVista();
    expect(vista.fase).toBe("voto");
    expect(vista.jugadores).toHaveLength(2);

    // Y el reingresado puede votar como si nada.
    const opciones = vista.opciones;
    const primera = opciones[0];
    if (primera === undefined) throw new Error("la ronda no trajo opciones");
    j1.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();
    j2Bis.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();
    expect(j2Bis.ultimaVista().fase).toBe("revelar");

    await orquestador.detener();
  });

  it("un desconocido SIN token no puede sumarse a mitad de partida (REGLAS §7)", async () => {
    const { orquestador, transporte, j1 } = await abrir();
    expect(j1.ultimaVista().fase).toBe("precarga"); // la partida ya arrancó

    const intruso = new ClientePrueba(transporte.crearCliente());
    await intruso.conectar("memoria");
    intruso.enviar({ tipo: "unirse", nombre: "Zoe", juego: "meloquiz" });
    await asentar();

    const error = intruso.mensajes.find((m) => m.tipo === "error");
    expect(error?.tipo === "error" && error.codigo).toBe("partidaYaIniciada");
    // Y la sala sigue con sus 2 asientos.
    expect(j1.ultimaVista().jugadores).toHaveLength(2);

    await orquestador.detener();
  });

  it("un voto puntúa y el marcador se aplica en la fase de puntaje", async () => {
    const { orquestador, reloj, j1, j2 } = await abrir();

    reloj.avanzar(); // → clip
    await asentar();
    reloj.avanzar(); // → voto
    await asentar();

    const opciones = j1.ultimaVista().opciones;
    expect(opciones).toHaveLength(4);

    // j1 y j2 votan: cierre anticipado de la votación → revelar.
    const primera = opciones[0];
    if (primera === undefined) throw new Error("la ronda no trajo opciones");
    j1.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();
    j2.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();

    const revelada = j1.ultimaVista();
    expect(revelada.fase).toBe("revelar");
    expect(revelada.opcionCorrectaId).not.toBeNull();
    // Tu voto viaja; el ajeno no, solo el booleano.
    expect(revelada.tuVotoId).toBe(primera.id);
    expect(revelada.jugadores.every((j) => j.haVotado)).toBe(true);

    reloj.avanzar(); // → puntaje (aquí se aplica el marcador, §5)
    await asentar();
    const conPuntaje = j1.ultimaVista();
    expect(conPuntaje.fase).toBe("puntaje");
    const acerto = revelada.opcionCorrectaId === primera.id;
    expect(conPuntaje.jugadores.every((j) => j.puntos === (acerto ? 1 : 0))).toBe(true);

    await orquestador.detener();
  });
});
