// La restricción CRÍTICA de MeloQuiz multijugador (REGLAS §1): ningún archivo
// de audio ni carátula viaja del host a los peers — solo id de pista + start_at
// + opciones. Este test la afirma sobre el CABLE: captura cada frame crudo tal
// como salió del transporte, antes de parsear, así atrapa también campos que el
// analizador del cliente ignoraría.
//
// Tres capas, de la fuga conocida a la que nadie pensó:
//  1. La marca del pool (claveArchivo/claveCaratula) no aparece en ningún frame.
//  2. Presupuesto de tamaño: ningún clip ni carátula entra en 8 KB por frame,
//     se codifique como se codifique (base64, array de bytes, data URL).
//  3. Forma: sin arrays numéricos largos (un Uint8Array serializado), sin
//     strings gigantes, sin claves con nombre de payload binario.

import { describe, expect, it } from "vitest";
import { Orquestador } from "../../orquestador.js";
import type { Programador } from "../../orquestador.js";
import type { MensajeCliente, MensajeServidor } from "../../protocolo.js";
import { analizarMensajeServidor, serializarCliente } from "../../protocolo.js";
import type { TransporteCliente } from "../../transporte.js";
import { TransporteMemoria } from "../../transporteMemoria.js";
import type { VistaJuego } from "../../vistaJuego.js";
import type { VistaMeloquizSala } from "./vistaMeloquiz.js";
import { MARCA_SECRETA, poolMarcado } from "../../pruebas/poolMeloquiz.js";
import { crearMotorMeloquiz } from "./motorMeloquiz.js";

// Una vista de MeloQuiz con 2 jugadores mide hoy ~700 bytes; 8 KB deja margen
// de sobra para crecer sin dejar pasar ni la carátula más chica. Subirlo es una
// decisión consciente, no un ajuste de test.
const PRESUPUESTO_FRAME = 8 * 1024;
const PRESUPUESTO_PARTIDA = 128 * 1024;
/** Un array de números más largo que esto huele a Uint8Array serializado. */
const MAX_ARRAY_NUMERICO = 64;
const MAX_STRING = 512;
const CLAVES_SOSPECHOSAS = /bytes|base64|blob|buffer|binario|audio|imagen|caratula/i;

function asentar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

class RelojManual {
  private pendientes = new Map<number, () => void>();
  private contador = 0;

  readonly programar: Programador = (ms, fn) => {
    void ms;
    const id = this.contador++;
    this.pendientes.set(id, fn);
    return () => {
      this.pendientes.delete(id);
    };
  };

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

/** Cliente que además guarda cada frame CRUDO: el assert va sobre el cable. */
class ClientePrueba {
  readonly crudos: string[] = [];
  readonly mensajes: MensajeServidor[] = [];
  jugadorId = "";

  constructor(private readonly cliente: TransporteCliente) {}

  async conectar(codigo: string): Promise<void> {
    await this.cliente.conectar(codigo, {
      alRecibir: (datos) => {
        this.crudos.push(datos);
        const mensaje = analizarMensajeServidor(datos);
        if (mensaje === null) throw new Error(`mensaje ilegible: ${datos}`);
        this.mensajes.push(mensaje);
        if (mensaje.tipo === "bienvenida") this.jugadorId = mensaje.jugadorId;
      },
      alDesconectar: () => {},
    });
  }

  enviar(mensaje: MensajeCliente): void {
    this.cliente.enviar(serializarCliente(mensaje));
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

/**
 * Camina el JSON parseado buscando FORMA de payload binario. Devuelve la ruta
 * del hallazgo (p. ej. `vista.jugadores[0].bytes`) o null si está limpio.
 */
function buscarPayloadBinario(valor: unknown, ruta: string): string | null {
  if (typeof valor === "string") {
    return valor.length > MAX_STRING ? `${ruta} (string de ${valor.length} chars)` : null;
  }
  if (Array.isArray(valor)) {
    if (valor.length > MAX_ARRAY_NUMERICO && valor.every((v) => typeof v === "number")) {
      return `${ruta} (array numérico de ${valor.length} elementos)`;
    }
    for (let i = 0; i < valor.length; i++) {
      const hallazgo = buscarPayloadBinario(valor[i], `${ruta}[${i}]`);
      if (hallazgo !== null) return hallazgo;
    }
    return null;
  }
  if (typeof valor === "object" && valor !== null) {
    for (const [clave, hijo] of Object.entries(valor)) {
      if (CLAVES_SOSPECHOSAS.test(clave)) return `${ruta}.${clave} (clave sospechosa)`;
      const hallazgo = buscarPayloadBinario(hijo, `${ruta}.${clave}`);
      if (hallazgo !== null) return hallazgo;
    }
  }
  return null;
}

/** Juega una partida COMPLETA de `rondas` rondas con votos, y junta los frames. */
async function jugarPartidaCompleta(rondas: number) {
  const reloj = new RelojManual();
  const transporte = new TransporteMemoria();
  const orquestador = new Orquestador({
    transporte,
    motor: crearMotorMeloquiz(poolMarcado(), { rondas }),
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
  j1.enviar({ tipo: "iniciarPartida" });
  await asentar();

  for (let ronda = 0; ronda < rondas; ronda++) {
    // precarga: ambos ackean (cierre anticipado → clip).
    j1.enviar({ tipo: "listoPrecarga" });
    j2.enviar({ tipo: "listoPrecarga" });
    await asentar();
    expect(j1.ultimaVista().fase).toBe("clip");

    reloj.avanzar(); // clip → voto
    await asentar();
    expect(j1.ultimaVista().fase).toBe("voto");

    // Ambos votan (cierre anticipado → revelar, la fase de la carátula).
    const opciones = j1.ultimaVista().opciones;
    const primera = opciones[0];
    if (primera === undefined) throw new Error("la ronda no trajo opciones");
    j1.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();
    j2.enviar({ tipo: "votar", opcionId: primera.id });
    await asentar();
    expect(j1.ultimaVista().fase).toBe("revelar");

    reloj.avanzar(); // revelar → puntaje
    await asentar();
    reloj.avanzar(); // puntaje → precarga siguiente (o final)
    await asentar();
  }
  expect(j1.ultimaVista().fase).toBe("final");

  await orquestador.detener();
  return { j1, j2, todos: [...j1.crudos, ...j2.crudos] };
}

describe("aislamiento host↛peer (REGLAS §1): solo la orden viaja, jamás bytes", () => {
  it("una partida completa no filtra la marca, ni payloads, ni frames gigantes", async () => {
    const { todos } = await jugarPartidaCompleta(2);
    expect(todos.length).toBeGreaterThan(0);

    // Capa 1 — la fuga conocida: claveArchivo/claveCaratula del pool marcado.
    for (const frame of todos) {
      expect(frame).not.toContain(MARCA_SECRETA);
    }

    // Capa 2 — presupuesto: ningún audio ni carátula entra acá, se codifique
    // como se codifique.
    for (const frame of todos) {
      expect(frame.length, `frame de ${frame.length} bytes: ${frame.slice(0, 120)}…`)
        .toBeLessThan(PRESUPUESTO_FRAME);
    }
    const totalPorCliente = todos.reduce((a, f) => a + f.length, 0) / 2;
    expect(totalPorCliente).toBeLessThan(PRESUPUESTO_PARTIDA);

    // Capa 3 — forma: nada con pinta de payload binario, con la ruta exacta
    // en el mensaje de error para cuando falle dentro de tres meses.
    for (const frame of todos) {
      const hallazgo = buscarPayloadBinario(JSON.parse(frame), "$");
      expect(hallazgo, `payload binario en ${hallazgo ?? ""}`).toBeNull();
    }
  });

  it("la fase revelar publica título/artista pero nunca claves del disco del host", async () => {
    // Refuerzo puntual de la fase más tentadora: `revelar` es donde la carátula
    // es relevante y donde un atajo "mandemos la clave" reaparecería.
    const reloj = new RelojManual();
    const transporte = new TransporteMemoria();
    const orquestador = new Orquestador({
      transporte,
      motor: crearMotorMeloquiz(poolMarcado(), { rondas: 1 }),
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
    j1.enviar({ tipo: "iniciarPartida" });
    await asentar();

    reloj.avanzar(); // precarga → clip (por timeout, sin acks)
    await asentar();
    reloj.avanzar(); // clip → voto
    await asentar();
    reloj.avanzar(); // voto → revelar (por timeout, sin votos)
    await asentar();

    const revelada = j1.ultimaVista();
    expect(revelada.fase).toBe("revelar");
    expect(revelada.tituloCorrecto).not.toBeNull();
    expect(revelada.artistaCorrecto).not.toBeNull();
    // La vista revelada, serializada entera, sigue sin la marca del host.
    expect(JSON.stringify(revelada)).not.toContain(MARCA_SECRETA);
    expect("claveCaratula" in revelada).toBe(false);
    expect("claveArchivo" in revelada).toBe(false);

    await orquestador.detener();
  });
});
