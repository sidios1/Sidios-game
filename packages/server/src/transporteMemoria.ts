// Transporte en memoria: servidor y clientes en el mismo proceso, sin red.
// Lo usan los tests del orquestador (criterio (a) de la fase) y le servirá
// al host de la Fase 5 para jugar contra su propio servidor embebido.
// Los datos viajan como string igual que por el cable: lo no serializable
// falla aquí igual que fallaría en la LAN.

import type {
  IdConexion,
  OyentesCliente,
  OyentesServidor,
  TransporteCliente,
  TransporteServidor,
} from "./transporte.js";
import { frameSincronia, responderSincronia } from "./sincroniaReloj.js";

export const CODIGO_SALA_MEMORIA = "memoria";

class ClienteMemoria implements TransporteCliente {
  private oyentes: OyentesCliente | null = null;
  private conexionId: IdConexion | null = null;

  constructor(private readonly servidor: TransporteMemoria) {}

  conectar(codigo: string, oyentes: OyentesCliente): Promise<void> {
    if (codigo !== CODIGO_SALA_MEMORIA) {
      return Promise.reject(new Error(`sala desconocida: ${codigo}`));
    }
    this.oyentes = oyentes;
    this.conexionId = this.servidor.registrar(this);
    return Promise.resolve();
  }

  enviar(datos: string): void {
    if (this.conexionId === null) return;
    this.servidor.entregarAlServidor(this.conexionId, datos);
  }

  desconectar(): Promise<void> {
    if (this.conexionId !== null) {
      this.servidor.olvidar(this.conexionId);
      this.conexionId = null;
    }
    return Promise.resolve();
  }

  /** Llamado por el servidor; entrega asíncrona, como un socket real. */
  recibir(datos: string): void {
    const oyentes = this.oyentes;
    if (oyentes === null) return;
    queueMicrotask(() => oyentes.alRecibir(datos));
  }

  /** Llamado por el servidor cuando cierra la conexión desde su lado. */
  cerradoPorServidor(): void {
    const oyentes = this.oyentes;
    this.conexionId = null;
    if (oyentes === null) return;
    queueMicrotask(() => oyentes.alDesconectar());
  }
}

export class TransporteMemoria implements TransporteServidor {
  private oyentes: OyentesServidor | null = null;
  private contador = 0;
  private readonly conexiones = new Map<IdConexion, ClienteMemoria>();

  iniciar(oyentes: OyentesServidor): Promise<string> {
    this.oyentes = oyentes;
    return Promise.resolve(CODIGO_SALA_MEMORIA);
  }

  enviar(conexionId: IdConexion, datos: string): void {
    this.conexiones.get(conexionId)?.recibir(datos);
  }

  cerrarConexion(conexionId: IdConexion): void {
    const cliente = this.conexiones.get(conexionId);
    if (cliente === undefined) return;
    this.conexiones.delete(conexionId);
    cliente.cerradoPorServidor();
    this.avisarDesconexion(conexionId);
  }

  detener(): Promise<void> {
    for (const conexionId of [...this.conexiones.keys()]) {
      this.cerrarConexion(conexionId);
    }
    this.oyentes = null;
    return Promise.resolve();
  }

  crearCliente(): TransporteCliente {
    return new ClienteMemoria(this);
  }

  // ── Usados por ClienteMemoria ─────────────────────────────────────────────

  registrar(cliente: ClienteMemoria): IdConexion {
    this.contador += 1;
    const conexionId = `mem-${this.contador}`;
    this.conexiones.set(conexionId, cliente);
    const oyentes = this.oyentes;
    if (oyentes !== null) {
      queueMicrotask(() => oyentes.alConectar(conexionId));
    }
    return conexionId;
  }

  entregarAlServidor(conexionId: IdConexion, datos: string): void {
    const oyentes = this.oyentes;
    if (oyentes === null || !this.conexiones.has(conexionId)) return;
    // La invariante vale para TODO TransporteServidor, sin excepciones: los
    // frames de control se consumen en el adaptador y nunca llegan al
    // orquestador (si no, caerían en `accionJuego`/`mensajeInvalido`).
    const sinc = frameSincronia(datos);
    if (sinc !== null) {
      const pong = responderSincronia(sinc, Date.now());
      if (pong !== null) this.conexiones.get(conexionId)?.recibir(pong);
      return;
    }
    queueMicrotask(() => oyentes.alRecibir(conexionId, datos));
  }

  olvidar(conexionId: IdConexion): void {
    if (!this.conexiones.delete(conexionId)) return;
    this.avisarDesconexion(conexionId);
  }

  private avisarDesconexion(conexionId: IdConexion): void {
    const oyentes = this.oyentes;
    if (oyentes === null) return;
    queueMicrotask(() => oyentes.alDesconectar(conexionId));
  }
}
