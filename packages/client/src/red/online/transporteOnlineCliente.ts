// Adaptador ONLINE del lado jugador: implementa TransporteCliente (Fase 2) sobre
// un canal de datos WebRTC abierto por la señalización. Es el espejo de
// transporteLanNavegador.ts, pero el "socket" es un CanalDatos en vez del
// WebSocket nativo:
//   • Latido (heartbeat): manda PING app-level y vigila el silencio; si el canal
//     queda mudo, el vigía lo cierra y dispara alDesconectar, que el coordinador
//     convierte en reconexión automática (con reattach por token).
//   • Anti-throttling: al volver al frente (visibilitychange) sondea de inmediato
//     para detectar a tiempo un canal caído mientras la ventana estuvo oculta.
//
// La señalización es PLUGGABLE (PeerJS por defecto); los tests inyectan un doble.

import type { OyentesCliente, TransporteCliente } from "@juegos/server/transporte";
import type { ProgramarIntervalo, ProgramarTimeout } from "@juegos/server/latido";
import { frameLatido, Latido, PING } from "@juegos/server/latido";
import type { FuenteVisibilidad } from "../transporteLanNavegador.js";
import type { CanalDatos, ClienteSenalizacion } from "./senalizacion.js";
import { SenalizacionPeerJs } from "./senalizacionPeerJs.js";

function documentoPorDefecto(): FuenteVisibilidad | null {
  if (typeof document === "undefined") return null;
  return {
    get hidden() {
      return document.hidden;
    },
    addEventListener: (tipo, oyente) => document.addEventListener(tipo, oyente),
    removeEventListener: (tipo, oyente) => document.removeEventListener(tipo, oyente),
  };
}

export interface OpcionesOnlineCliente {
  /** Señalización a usar; por defecto, PeerJS. Inyectable en tests. */
  readonly senalizacion?: ClienteSenalizacion;
  readonly intervaloPingMs?: number;
  readonly timeoutSilencioMs?: number;
  readonly intervalo?: ProgramarIntervalo;
  readonly timeout?: ProgramarTimeout;
  /** Fuente de visibilidad; default: `document` global si existe. */
  readonly documento?: FuenteVisibilidad;
}

export class TransporteOnlineCliente implements TransporteCliente {
  private senal: ClienteSenalizacion | null = null;
  private canal: CanalDatos | null = null;
  private latido: Latido | null = null;
  private readonly documento: FuenteVisibilidad | null;
  private oyenteVisibilidad: (() => void) | null = null;
  private readonly opciones: OpcionesOnlineCliente;

  constructor(opciones: OpcionesOnlineCliente = {}) {
    this.opciones = opciones;
    this.documento = opciones.documento ?? documentoPorDefecto();
  }

  /** El código de sala es el código corto del host (su id en el broker). */
  async conectar(codigo: string, oyentes: OyentesCliente): Promise<void> {
    const senal = this.opciones.senalizacion ?? new SenalizacionPeerJs();
    this.senal = senal;
    const canal = await senal.conectarAHost(codigo); // rechaza si no conecta.
    this.canal = canal;
    let cerrado = false;
    canal.alMensaje((datos) => {
      this.latido?.registrarTrafico();
      if (frameLatido(datos) !== null) return; // PONG: no es del juego.
      oyentes.alRecibir(datos);
    });
    canal.alCerrar(() => {
      if (cerrado) return;
      cerrado = true;
      this.limpiarLatido();
      oyentes.alDesconectar();
    });
    this.iniciarLatido(canal);
  }

  private iniciarLatido(canal: CanalDatos): void {
    const latido = new Latido({
      enviarPing: () => {
        if (canal.abierto) canal.enviar(PING);
      },
      alMorir: () => {
        if (canal.abierto) canal.cerrar();
      },
      ...(this.opciones.intervaloPingMs !== undefined
        ? { intervaloPingMs: this.opciones.intervaloPingMs }
        : {}),
      ...(this.opciones.timeoutSilencioMs !== undefined
        ? { timeoutSilencioMs: this.opciones.timeoutSilencioMs }
        : {}),
      ...(this.opciones.intervalo !== undefined
        ? { intervalo: this.opciones.intervalo }
        : {}),
      ...(this.opciones.timeout !== undefined ? { timeout: this.opciones.timeout } : {}),
    });
    this.latido = latido;
    latido.iniciar();
    // Anti-throttling: al volver al frente, sondea ya y reinicia el vigía.
    if (this.documento !== null) {
      const oyente = (): void => {
        if (this.documento?.hidden === false && canal.abierto) {
          latido.pingAhora();
          latido.registrarTrafico();
        }
      };
      this.oyenteVisibilidad = oyente;
      this.documento.addEventListener("visibilitychange", oyente);
    }
  }

  private limpiarLatido(): void {
    this.latido?.detener();
    this.latido = null;
    if (this.documento !== null && this.oyenteVisibilidad !== null) {
      this.documento.removeEventListener("visibilitychange", this.oyenteVisibilidad);
    }
    this.oyenteVisibilidad = null;
  }

  enviar(datos: string): void {
    this.canal?.enviar(datos);
  }

  desconectar(): Promise<void> {
    this.limpiarLatido();
    this.canal?.cerrar();
    this.canal = null;
    this.senal?.cerrar();
    this.senal = null;
    return Promise.resolve();
  }
}
