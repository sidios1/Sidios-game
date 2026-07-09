// @vitest-environment jsdom
// Flujo de la Fase 5: en la app de escritorio, "Crear partida" arranca el
// servidor embebido y luego el host se une con el código que este anuncia.
// Se mockea red/servidorEmbebido.js (la capa Tauri) para probar el cableado
// sin proceso real; el mock vive aislado en este archivo.
import { describe, expect, it, vi } from "vitest";

vi.mock("../red/servidorEmbebido.js", () => ({
  PUERTO_EMBEBIDO: 35711,
  hayServidorEmbebido: () => true,
  iniciarServidorEmbebido: vi.fn(() => Promise.resolve("192.168.1.50:35711")),
  detenerServidorEmbebido: vi.fn(() => Promise.resolve()),
}));

import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import type { ContextoJuego, DefinicionJuego, IJuego, SenalJuego } from "../juego/ijuego.js";
import { Coordinador } from "./coordinador.js";
import { POOL_AVATARES } from "../perfil/avatares.js";
import { guardarPerfil } from "../perfil/perfil.js";
import {
  detenerServidorEmbebido,
  iniciarServidorEmbebido,
} from "../red/servidorEmbebido.js";

const AVATAR = POOL_AVATARES[0] ?? "identicon-1";

/** Transporte falso que recuerda con qué código se le pidió conectar. */
class TransporteFalso implements TransporteCliente {
  readonly enviados: string[] = [];
  codigo: string | null = null;
  conectar(codigo: string, _oyentes: OyentesCliente): Promise<void> {
    this.codigo = codigo;
    return Promise.resolve();
  }
  enviar(datos: string): void {
    this.enviados.push(datos);
  }
  desconectar(): Promise<void> {
    return Promise.resolve();
  }
}

function definicionFalsa(): DefinicionJuego {
  const juego: IJuego = {
    iniciar: (_c: ContextoJuego) => {},
    sincronizarEstado: () => {},
    procesarAccion: (_s: SenalJuego) => {},
    finalizar: () => {},
  };
  return {
    id: "falso",
    nombre: "Falso",
    descriptorCorto: "juego de prueba",
    jugadores: { min: 2, max: 4 },
    estado: "jugable",
    portada: { tipo: "componente", componente: () => document.createElement("div") },
    crear: () => juego,
  };
}

function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, v),
  };
}

function boton(raiz: HTMLElement, texto: string): HTMLButtonElement {
  const encontrado = [...raiz.querySelectorAll("button")].find(
    (b) => b.textContent?.startsWith(texto) ?? false,
  );
  if (encontrado === undefined) throw new Error(`no hay botón "${texto}"`);
  return encontrado;
}

describe("Coordinador con servidor embebido (escritorio)", () => {
  it("'Crear partida' arranca el servidor y se une con el código anunciado", async () => {
    const transporte = new TransporteFalso();
    const definicion = definicionFalsa();
    const contenedorEscena = document.createElement("div");
    const contenedorHud = document.createElement("div");
    document.body.append(contenedorEscena, contenedorHud);
    const almacenPerfil = almacenFalso();
    guardarPerfil(almacenPerfil, { nickname: "Ana", avatarId: AVATAR });
    const coordinador = new Coordinador({
      contenedorEscena,
      contenedorHud,
      catalogo: [definicion],
      crearTransporte: () => transporte,
      almacen: almacenFalso(),
      almacenPerfil,
    });
    coordinador.iniciar();
    coordinador.elegirJuego(definicion);

    boton(contenedorHud, "Local").click();
    // El nickname/avatar vienen del perfil; "Crear partida" ya no pide nombre.
    boton(contenedorHud, "Crear partida").click();

    await vi.waitFor(() => expect(transporte.codigo).toBe("192.168.1.50:35711"));
    expect(iniciarServidorEmbebido).toHaveBeenCalledTimes(1);
    // El host arranca el sidecar con SU juego seleccionado (game-id).
    expect(iniciarServidorEmbebido).toHaveBeenCalledWith("falso");
    expect(transporte.enviados.map((d) => JSON.parse(d))).toContainEqual({
      tipo: "unirse",
      nombre: "Ana",
      avatar: AVATAR,
      juego: "falso",
    });

    // Al volver al hub, el host apaga su servidor embebido.
    coordinador.volverAlHub();
    expect(detenerServidorEmbebido).toHaveBeenCalled();
  });
});
