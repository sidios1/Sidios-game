// El motor server de MeloQuiz contra un pool mock. Aquí NO se reprueban las
// reglas (esas tienen 68 tests en meloquiz-core): se prueba la COSTURA con el
// contrato MotorJuego — en particular que expone la ruta de fase de sala y que
// las piezas de turno quedan neutras (jugadorEnTurno null, saltarTurno no-op),
// que es exactamente lo que congelaba la partida antes de S1b.

import { describe, expect, it } from "vitest";
import type { MetaSala } from "../../vista.js";
import {
  JUGADORES_MELOQUIZ as JUGADORES,
  poolMock,
  rngFijo,
} from "../../pruebas/poolMeloquiz.js";
import { crearMotorMeloquiz } from "./motorMeloquiz.js";

const META: MetaSala = {
  estados: new Map([["j1", "conectado" as const]]),
  anfitrionId: "j1",
  listos: new Set<string>(),
  votosNecesarios: 1,
};

function motorYEstado(pool = poolMock()) {
  const motor = crearMotorMeloquiz(pool, { ahora: () => 1_000 });
  const creado = motor.crear(JUGADORES, rngFijo());
  if (!creado.ok) throw new Error(`no se pudo crear la partida: ${creado.error.mensaje}`);
  return { motor, estado: creado.valor };
}

describe("motor de MeloQuiz (costura con MotorJuego)", () => {
  it("crea la partida en la fase de precarga sellando el reloj inyectado", () => {
    const { estado } = motorYEstado();
    expect(estado.fase).toBe("precarga");
    expect(estado.faseIniciadaEnMs).toBe(1_000);
    expect(estado.ronda).toBe(1);
  });

  it("pasa el modo entrenamiento de la config OPACA del lobby al núcleo (§6)", () => {
    const motor = crearMotorMeloquiz(poolMock(), { ahora: () => 1_000 });
    const solo = [{ id: "j1", nombre: "Ana" }];

    // Sin config, una partida de 1 jugador la rechaza el núcleo.
    const sinFlag = motor.crear(solo, rngFijo());
    expect(sinFlag.ok).toBe(false);
    if (!sinFlag.ok) expect(sinFlag.error.codigo).toBe("JUGADORES_INVALIDOS");

    // Con el flag, la misma partida se crea.
    expect(motor.crear(solo, rngFijo(), { entrenamiento: true }).ok).toBe(true);
  });

  it("ignora una config con forma inesperada: cualquier cosa que no sea true es partida normal", () => {
    const motor = crearMotorMeloquiz(poolMock(), { ahora: () => 1_000 });
    const solo = [{ id: "j1", nombre: "Ana" }];
    for (const config of [null, "entrenamiento", { entrenamiento: "sí" }, { otra: true }]) {
      expect(motor.crear(solo, rngFijo(), config).ok).toBe(false);
    }
  });

  it("no tiene turnos: jugadorEnTurno es null y saltarTurno no cambia el estado", () => {
    const { motor, estado } = motorYEstado();
    expect(motor.jugadorEnTurno(estado)).toBeNull();
    const saltado = motor.saltarTurno(estado, "j1");
    expect(saltado.ok).toBe(true);
    if (saltado.ok) expect(saltado.valor).toBe(estado);
  });

  it("expone faseTemporizada/expirarFase y NO las de turno (+Turbo)", () => {
    const { motor } = motorYEstado();
    expect(motor.faseTemporizada).toBeDefined();
    expect(motor.expirarFase).toBeDefined();
    expect(motor.turnoTurbo).toBeUndefined();
    expect(motor.expirarTurno).toBeUndefined();
  });

  it("faseTemporizada describe la fase con clave `ronda:fase` y su duración", () => {
    const { motor, estado } = motorYEstado();
    expect(motor.faseTemporizada?.(estado)).toEqual({
      clave: "1:precarga",
      duracionMs: 15_000,
    });
  });

  it("expirarFase avanza la máquina sin consultar jugador alguno", () => {
    const { motor, estado } = motorYEstado();
    const clip = motor.expirarFase?.(estado, rngFijo());
    expect(clip?.ok).toBe(true);
    if (clip?.ok !== true) return;
    expect(clip.valor.fase).toBe("clip");
    expect(motor.faseTemporizada?.(clip.valor)).toEqual({
      clave: "1:clip",
      duracionMs: 10_000,
    });
  });

  it("faseTemporizada se apaga (null) cuando la partida termina", () => {
    // 1 sola ronda: precarga → clip → revelar → voto → puntaje → final.
    const motor = crearMotorMeloquiz(poolMock(), { rondas: 1, ahora: () => 0 });
    const creado = motor.crear(JUGADORES, rngFijo());
    if (!creado.ok) throw new Error("no se pudo crear");
    let estado = creado.valor;
    for (let i = 0; i < 5; i++) {
      const paso = motor.expirarFase?.(estado, rngFijo());
      if (paso?.ok !== true) throw new Error(`la fase ${estado.fase} no expiró`);
      estado = paso.valor;
    }
    expect(estado.fase).toBe("final");
    expect(motor.terminada(estado)).toBe(true);
    expect(motor.faseTemporizada?.(estado)).toBeNull();
  });

  it("parsea el ack de precarga y el voto; rechaza lo demás", () => {
    const { motor } = motorYEstado();
    expect(motor.parsearAccion({ tipo: "listoPrecarga" })).toEqual({ tipo: "listoPrecarga" });
    expect(motor.parsearAccion({ tipo: "votar", votadoId: "j2" })).toEqual({
      tipo: "votar",
      votadoId: "j2",
    });
    expect(motor.parsearAccion({ tipo: "votar" })).toBeNull();
    expect(motor.parsearAccion({ tipo: "votar", votadoId: 7 })).toBeNull();
    expect(motor.parsearAccion({ tipo: "robar" })).toBeNull();
  });

  it("nunca pausa por votación de continuar (las rondas avanzan por reloj)", () => {
    const { motor, estado } = motorYEstado();
    expect(motor.esperandoContinuar(estado)).toBe(false);
    const seguido = motor.continuar(estado, rngFijo());
    expect(seguido.ok).toBe(true);
    if (seguido.ok) expect(seguido.valor).toBe(estado);
  });

  it("la vista suma los datos de sala sin destapar la respuesta en precarga", () => {
    const { motor, estado } = motorYEstado();
    const vista = motor.construirVista(estado, "j1", {
      ...META,
      faseMsRestantes: 12_000,
      faseInicioMs: 1_700_000_000_000,
    });
    if (vista.juego !== "meloquiz") throw new Error("se esperaba una vista de MeloQuiz");
    expect(vista.anfitrionId).toBe("j1");
    expect(vista.faseMsRestantes).toBe(12_000);
    expect(vista.faseInicioMs).toBe(1_700_000_000_000);
    expect(vista.estadosConexion).toEqual({ j1: "conectado", j2: "conectado" });
    // La invariante del núcleo sigue en pie a través del envoltorio.
    expect(vista.tituloCorrecto).toBeNull();
    expect("opciones" in vista).toBe(false);
  });
});
