// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import type {
  ContextoJuego,
  DefinicionJuego,
  IJuego,
  SenalJuego,
} from "../juego/ijuego.js";
import { Coordinador } from "./coordinador.js";
import { POOL_AVATARES } from "../perfil/avatares.js";
import { guardarPerfil } from "../perfil/perfil.js";

const AVATAR = POOL_AVATARES[0] ?? "identicon-1";

/** Transporte falso: guarda lo enviado e inyecta mensajes crudos del servidor. */
class TransporteFalso implements TransporteCliente {
  readonly enviados: string[] = [];
  oyentes: OyentesCliente | null = null;
  desconectado = false;

  conectar(_codigo: string, oyentes: OyentesCliente): Promise<void> {
    this.oyentes = oyentes;
    return Promise.resolve();
  }
  enviar(datos: string): void {
    this.enviados.push(datos);
  }
  desconectar(): Promise<void> {
    this.desconectado = true;
    return Promise.resolve();
  }
  /** Simula un mensaje JSON llegando del servidor. */
  recibir(datos: string): void {
    this.oyentes?.alRecibir(datos);
  }
}

/** Storage mínimo en memoria. */
function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => {
      datos.delete(k);
    },
    setItem: (k, v) => {
      datos.set(k, v);
    },
  };
}

/** IJuego espía: registra cada llamada del ciclo de vida. */
function crearEspia(): {
  definicion: DefinicionJuego;
  iniciados: number;
  vistas: unknown[];
  avisos: string[];
  finalizados: number;
  contexto: () => ContextoJuego | null;
} {
  let contexto: ContextoJuego | null = null;
  const reg = { iniciados: 0, vistas: [] as unknown[], avisos: [] as string[], finalizados: 0 };
  const juego: IJuego = {
    iniciar: (c: ContextoJuego) => {
      reg.iniciados += 1;
      contexto = c;
    },
    sincronizarEstado: (v) => reg.vistas.push(v),
    procesarAccion: (s: SenalJuego) => reg.avisos.push(s.mensaje),
    finalizar: () => {
      reg.finalizados += 1;
    },
  };
  const definicion: DefinicionJuego = {
    id: "falso",
    nombre: "Falso",
    descripcion: "juego de prueba",
    minJugadores: 2,
    maxJugadores: 4,
    crear: () => juego,
  };
  return {
    definicion,
    get iniciados() {
      return reg.iniciados;
    },
    get vistas() {
      return reg.vistas;
    },
    get avisos() {
      return reg.avisos;
    },
    get finalizados() {
      return reg.finalizados;
    },
    contexto: () => contexto,
  };
}

function vista(marca: number): string {
  return JSON.stringify({ tipo: "vista", vista: { marca } });
}

function crearCoordinador(espia: ReturnType<typeof crearEspia>, transporte: TransporteFalso) {
  const contenedorEscena = document.createElement("div");
  const contenedorHud = document.createElement("div");
  document.body.append(contenedorEscena, contenedorHud);
  const almacenPerfil = almacenFalso();
  guardarPerfil(almacenPerfil, { nickname: "Ana", avatarId: AVATAR });
  const coordinador = new Coordinador({
    contenedorEscena,
    contenedorHud,
    catalogo: [espia.definicion],
    crearTransporte: () => transporte,
    almacen: almacenFalso(),
    almacenPerfil,
  });
  return { coordinador, contenedorHud };
}

describe("Coordinador", () => {
  it("arranca mostrando el menú de juegos", () => {
    const espia = crearEspia();
    const { coordinador, contenedorHud } = crearCoordinador(espia, new TransporteFalso());
    coordinador.iniciar();
    expect(contenedorHud.querySelector("button.juego")).not.toBeNull();
  });

  it("al elegir juego y conectar, envía unirse y NO instancia el juego todavía", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const { coordinador } = crearCoordinador(espia, transporte);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");
    expect(transporte.oyentes).not.toBeNull();
    expect(transporte.enviados.map((d) => JSON.parse(d))).toContainEqual({
      tipo: "unirse",
      nombre: "Ana",
      avatar: AVATAR,
    });
    expect(espia.iniciados).toBe(0);
  });

  it("instancia el juego en la primera vista y reusa la instancia en las siguientes", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const { coordinador } = crearCoordinador(espia, transporte);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");

    transporte.recibir(vista(1));
    expect(espia.iniciados).toBe(1);
    expect(espia.vistas).toEqual([{ marca: 1 }]);

    transporte.recibir(vista(2));
    expect(espia.iniciados).toBe(1); // no se recrea
    expect(espia.vistas).toEqual([{ marca: 1 }, { marca: 2 }]);
  });

  it("un error durante la partida llega al juego como aviso", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const { coordinador } = crearCoordinador(espia, transporte);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");
    transporte.recibir(vista(1));
    transporte.recibir(
      JSON.stringify({ tipo: "error", codigo: "accionInvalida", mensaje: "no puedes" }),
    );
    expect(espia.avisos).toContain("no puedes");
  });

  it("salir al hub finaliza el juego, desconecta y vuelve al menú", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const { coordinador, contenedorHud } = crearCoordinador(espia, transporte);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");
    transporte.recibir(vista(1));

    // El juego pide volver al hub a través de su contexto.
    espia.contexto()?.salirAlHub();

    expect(espia.finalizados).toBe(1);
    expect(transporte.desconectado).toBe(true);
    const veloVisible = contenedorHud.querySelector(".velo:not(.oculto)");
    expect(veloVisible?.querySelector("button.juego")).not.toBeNull();
  });
});
