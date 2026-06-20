// Implementación por defecto de la señalización: PeerJS (broker en la nube
// gratis). Es el ÚNICO módulo que conoce el SDK `peerjs`; lo carga con import()
// dinámico para no arrastrarlo al bundle hasta que se use el modo online (igual
// que servidorEmbebido.ts hace con @tauri-apps). La config ICE (STUN/TURN) y la
// del broker se inyectan desde iceConfig.ts (entorno, nunca hardcodeadas).
//
// Para self-hostear el broker más adelante basta otra implementación de
// ClienteSenalizacion; el resto del transporte online no cambia.

import type { CanalDatos, ClienteSenalizacion, OyentesHost } from "./senalizacion.js";
import { configSenalizacion, construirRTCConfig } from "./iceConfig.js";
import { idBroker } from "./codigoSala.js";

/** Lo mínimo que usamos de una DataConnection de PeerJS. */
interface ConexionPeer {
  readonly open: boolean;
  send(datos: unknown): void;
  close(): void;
  on(evento: "data", cb: (datos: unknown) => void): void;
  on(evento: "open" | "close", cb: () => void): void;
  on(evento: "error", cb: (error: unknown) => void): void;
}

/** Lo mínimo que usamos de un Peer de PeerJS. */
interface PeerInstancia {
  connect(id: string, opciones?: Record<string, unknown>): ConexionPeer;
  destroy(): void;
  on(evento: "open", cb: (id: string) => void): void;
  on(evento: "connection", cb: (conexion: ConexionPeer) => void): void;
  on(evento: "error", cb: (error: unknown) => void): void;
}

type FabricaPeer = new (id?: string, opciones?: Record<string, unknown>) => PeerInstancia;

const SERIALIZACION = "none"; // mandamos strings JSON tal cual; sin re-encodear.
const LIMITE_CONEXION_MS = 15_000;
const MAX_INTENTOS_CODIGO = 10;

/** Envuelve una DataConnection de PeerJS como CanalDatos neutro. */
class CanalPeerJs implements CanalDatos {
  constructor(private readonly conexion: ConexionPeer) {}

  get abierto(): boolean {
    return this.conexion.open;
  }

  enviar(datos: string): void {
    if (this.conexion.open) this.conexion.send(datos);
  }

  alMensaje(manejador: (datos: string) => void): void {
    this.conexion.on("data", (datos) => {
      if (typeof datos === "string") manejador(datos);
    });
  }

  alCerrar(manejador: () => void): void {
    this.conexion.on("close", manejador);
    this.conexion.on("error", manejador);
  }

  cerrar(): void {
    this.conexion.close();
  }
}

export class SenalizacionPeerJs implements ClienteSenalizacion {
  private peer: PeerInstancia | null = null;

  async registrarHost(generarCodigo: () => string, oyentes: OyentesHost): Promise<string> {
    const Peer = await cargarPeer();
    for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento += 1) {
      const codigo = generarCodigo();
      try {
        const peer = await this.abrirPeer(Peer, idBroker(codigo));
        this.peer = peer;
        peer.on("connection", (conexion) => {
          // Cada jugador entrante: esperamos a que su canal abra para entregarlo.
          conexion.on("open", () => oyentes.alNuevoCanal(new CanalPeerJs(conexion)));
        });
        return codigo;
      } catch (error) {
        if (esIdEnUso(error)) continue; // colisión: probamos otro código.
        throw aError(error, "no se pudo abrir la sala online");
      }
    }
    throw new Error("no se pudo asignar un código de sala libre");
  }

  async conectarAHost(codigo: string): Promise<CanalDatos> {
    const Peer = await cargarPeer();
    const peer = await this.abrirPeer(Peer); // id autoasignado por el broker.
    this.peer = peer;
    return await new Promise<CanalDatos>((resolver, rechazar) => {
      let listo = false;
      const conexion = peer.connect(idBroker(codigo), {
        reliable: true,
        serialization: SERIALIZACION,
      });
      const limite = setTimeout(() => {
        if (!listo) rechazar(new Error("la sala no respondió a tiempo"));
      }, LIMITE_CONEXION_MS);
      conexion.on("open", () => {
        listo = true;
        clearTimeout(limite);
        resolver(new CanalPeerJs(conexion));
      });
      const fallar = (error: unknown): void => {
        if (listo) return;
        clearTimeout(limite);
        rechazar(aError(error, "no se pudo conectar a la sala"));
      };
      conexion.on("error", fallar);
      peer.on("error", fallar); // p. ej. peer-unavailable: el código no existe.
    });
  }

  cerrar(): void {
    this.peer?.destroy();
    this.peer = null;
  }

  /** Crea un Peer y resuelve cuando abre; rechaza (y lo destruye) si falla antes. */
  private abrirPeer(Peer: FabricaPeer, id?: string): Promise<PeerInstancia> {
    const opciones: Record<string, unknown> = {
      config: construirRTCConfig(),
      ...configSenalizacion(),
    };
    const peer = new Peer(id, opciones);
    return new Promise<PeerInstancia>((resolver, rechazar) => {
      let abierto = false;
      peer.on("open", () => {
        abierto = true;
        resolver(peer);
      });
      peer.on("error", (error) => {
        if (abierto) return; // error tras abrir: lo gestionan otros oyentes.
        peer.destroy();
        rechazar(error);
      });
    });
  }
}

/** Carga el SDK de PeerJS bajo demanda y devuelve su constructor `Peer`. */
async function cargarPeer(): Promise<FabricaPeer> {
  const modulo = (await import("peerjs")) as unknown as { default: FabricaPeer };
  return modulo.default;
}

/** ¿El broker rechazó el id por estar en uso (colisión de código)? */
function esIdEnUso(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "unavailable-id"
  );
}

/** Normaliza un error desconocido del SDK a un Error con mensaje legible. */
function aError(error: unknown, contexto: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null && "type" in error) {
    return new Error(`${contexto} (${String((error as { type?: unknown }).type)})`);
  }
  return new Error(contexto);
}
