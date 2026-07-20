// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import type { PanelConfigLobby } from "../juego/configLobby.js";
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
  /** Simula la caída del canal (socket muerto detectado por el latido). */
  caer(): void {
    this.oyentes?.alDesconectar();
  }
}

/** Programador manual: acumula los reintentos agendados y los dispara a mano. */
class ProgramadorManual {
  llamadas = 0;
  private pendientes: Array<{ readonly fn: () => void }> = [];
  readonly programar = (_ms: number, fn: () => void): (() => void) => {
    this.llamadas += 1;
    const entrada = { fn };
    this.pendientes.push(entrada);
    return () => {
      this.pendientes = this.pendientes.filter((e) => e !== entrada);
    };
  };
  get pendientesActivos(): number {
    return this.pendientes.length;
  }
  dispararTodos(): void {
    const fns = this.pendientes.map((e) => e.fn);
    this.pendientes = [];
    for (const fn of fns) fn();
  }
}

/** Deja correr las microtareas/macrotareas en vuelo (conectar es async). */
function vaciar(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function bienvenida(token: string): string {
  return JSON.stringify({ tipo: "bienvenida", jugadorId: "j1", token });
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
    descriptorCorto: "juego de prueba",
    jugadores: { min: 2, max: 4 },
    estado: "jugable",
    portada: { tipo: "componente", componente: () => document.createElement("div") },
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

function crearCoordinador(
  espia: ReturnType<typeof crearEspia>,
  transporte: TransporteFalso,
  programar?: ProgramadorManual,
) {
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
    ...(programar !== undefined ? { programar: programar.programar } : {}),
  });
  return { coordinador, contenedorHud };
}

describe("Coordinador", () => {
  it("arranca mostrando el menú de juegos", () => {
    const espia = crearEspia();
    const { coordinador, contenedorHud } = crearCoordinador(espia, new TransporteFalso());
    coordinador.iniciar();
    expect(contenedorHud.querySelector("article.carta-juego")).not.toBeNull();
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
      // El game-id seleccionado en el hub viaja en unirse (selección local).
      juego: "falso",
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

  it("lobby con config: renderiza el panel, difunde actualizarConfig y adjunta la config al iniciar", async () => {
    const espia = crearEspia();
    // Holder (no `let` suelto): la CFA no ve la asignación dentro del closure y
    // narrowaría a `null`; una propiedad se re-ensancha tras cada llamada.
    const captura: { alCambiar: ((v: Record<string, unknown>) => void) | null } = {
      alCambiar: null,
    };
    const panelFake: PanelConfigLobby = {
      valorActual: () => ({ hpj: 2 }),
      fijarValor: () => {},
      bloqueoInicio: () => null,
      render: () => {
        const div = document.createElement("div");
        div.className = "panel-fake";
        return div;
      },
    };
    espia.definicion.crearConfigLobby = (alCambiar) => {
      captura.alCambiar = alCambiar;
      return panelFake;
    };
    const transporte = new TransporteFalso();
    const { coordinador, contenedorHud } = crearCoordinador(espia, transporte);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");
    transporte.recibir(bienvenida("t1")); // soy j1 (anfitrión)
    transporte.recibir(
      JSON.stringify({
        tipo: "estadoSala",
        jugadores: [
          { jugadorId: "j1", nombre: "Ana", esAnfitrion: true },
          { jugadorId: "j2", nombre: "Ben", esAnfitrion: false },
        ],
      }),
    );

    // El panel de config se pintó en la sala.
    expect(contenedorHud.querySelector(".panel-fake")).not.toBeNull();

    // Editar un control difunde la config por actualizarConfig.
    captura.alCambiar?.({ hpj: 3 });
    expect(transporte.enviados.map((d) => JSON.parse(d))).toContainEqual({
      tipo: "actualizarConfig",
      config: { hpj: 3 },
    });

    // "Iniciar" adjunta la config actual del panel (congelada al iniciar).
    const boton = [...contenedorHud.querySelectorAll("button")].find(
      (b) => b.textContent === "Iniciar partida",
    );
    expect(boton).toBeDefined();
    boton?.click();
    expect(transporte.enviados.map((d) => JSON.parse(d))).toContainEqual({
      tipo: "iniciarPartida",
      config: { hpj: 2 },
    });
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
    expect(veloVisible?.querySelector("article.carta-juego")).not.toBeNull();
  });

  it("tras una caída reconecta SOLO con el token, sin intervención", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const prog = new ProgramadorManual();
    const { coordinador } = crearCoordinador(espia, transporte, prog);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");

    transporte.recibir(bienvenida("tok-1")); // guarda la sesión (token)
    transporte.recibir(vista(1)); // arranca el juego, oculta la conexión

    transporte.caer(); // socket muerto detectado por el latido
    expect(prog.pendientesActivos).toBe(1); // hay un reintento agendado
    expect(espia.avisos).toContain("Conexión perdida. Reconectando…");

    prog.dispararTodos();
    await vaciar();

    // El reintento se une CON el token guardado: reattach al mismo asiento.
    const unirsesConToken = transporte.enviados
      .map((d) => JSON.parse(d))
      .filter((m) => m.tipo === "unirse" && m.token === "tok-1");
    expect(unirsesConToken.length).toBeGreaterThanOrEqual(1);
  });

  it("reconexión repetida no encola intentos duplicados (idempotente)", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const prog = new ProgramadorManual();
    const { coordinador } = crearCoordinador(espia, transporte, prog);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");
    transporte.recibir(bienvenida("tok-1"));
    transporte.recibir(vista(1));

    transporte.caer();
    transporte.caer(); // segunda caída del MISMO canal: no debe apilar
    expect(prog.pendientesActivos).toBe(1);
    expect(prog.llamadas).toBe(1);
  });

  it("el botón Reconectar fuerza un intento inmediato (respaldo)", async () => {
    const espia = crearEspia();
    const transporte = new TransporteFalso();
    const prog = new ProgramadorManual();
    const { coordinador } = crearCoordinador(espia, transporte, prog);
    coordinador.iniciar();
    coordinador.elegirJuego(espia.definicion);
    await coordinador.conectar("local", "127.0.0.1:35711");
    transporte.recibir(bienvenida("tok-1"));
    transporte.recibir(vista(1));

    const antes = transporte.enviados.length;
    await coordinador.reconectar(); // respaldo: intento inmediato, sin esperar backoff
    await vaciar();

    expect(transporte.enviados.length).toBeGreaterThan(antes);
    expect(prog.pendientesActivos).toBe(0); // inmediato: no usa el backoff
    const ultimo = JSON.parse(transporte.enviados[transporte.enviados.length - 1] ?? "{}");
    expect(ultimo).toMatchObject({ tipo: "unirse", token: "tok-1" });
  });
});
