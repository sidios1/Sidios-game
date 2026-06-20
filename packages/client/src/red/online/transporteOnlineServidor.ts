// Adaptador ONLINE del lado servidor: implementa TransporteServidor (Fase 2)
// sobre canales de datos WebRTC. Corre DENTRO del webview del host (cliente-host
// de la Fase 7): el Orquestador, que solo conoce la interfaz, no se entera de
// que ahora habla por WebRTC en vez de por `ws`.
//
// Atiende a la vez dos tipos de conexión:
//   • REMOTAS: cada jugador de otra red abre un CanalDatos vía la señalización.
//   • LOCAL (loopback): el propio host-jugador, en el MISMO proceso, sin WebRTC
//     (mismo patrón que transporteMemoria.ts). Así una sola instancia de
//     servidor sirve al host y a los remotos.
//
// Latido: como en transporteLan.ts, los frames de control (PING/PONG) se
// CONSUMEN aquí y nunca llegan al orquestador; un vigía por conexión remota
// termina las zombis. El loopback no necesita latido (no se cae solo).

import type {
  IdConexion,
  OyentesCliente,
  OyentesServidor,
  TransporteCliente,
  TransporteServidor,
} from "@juegos/server/transporte";
import type { ProgramarTimeout } from "@juegos/server/latido";
import { frameLatido, PONG, TIMEOUT_SILENCIO_MS, Watchdog } from "@juegos/server/latido";
import type { CanalDatos, ClienteSenalizacion } from "./senalizacion.js";
import { generarCodigoSala } from "./codigoSala.js";

/** Una conexión viva, sea remota (WebRTC) o local (loopback). */
interface ConexionInterna {
  enviar(datos: string): void;
  cerrar(): void;
}

export interface OpcionesOnlineServidor {
  /** Generador del código de sala; inyectable para tests deterministas. */
  readonly generarCodigo?: () => string;
  readonly timeoutSilencioMs?: number;
  readonly timeout?: ProgramarTimeout;
}

export class TransporteOnlineServidor implements TransporteServidor {
  private oyentes: OyentesServidor | null = null;
  private contador = 0;
  private readonly conexiones = new Map<IdConexion, ConexionInterna>();
  private readonly senal: ClienteSenalizacion;
  private readonly generarCodigo: () => string;
  private readonly timeoutSilencioMs: number;
  private readonly timeout: ProgramarTimeout | undefined;

  constructor(senal: ClienteSenalizacion, opciones: OpcionesOnlineServidor = {}) {
    this.senal = senal;
    this.generarCodigo = opciones.generarCodigo ?? generarCodigoSala;
    this.timeoutSilencioMs = opciones.timeoutSilencioMs ?? TIMEOUT_SILENCIO_MS;
    this.timeout = opciones.timeout;
  }

  iniciar(oyentes: OyentesServidor): Promise<string> {
    this.oyentes = oyentes;
    return this.senal.registrarHost(this.generarCodigo, {
      alNuevoCanal: (canal) => this.aceptarRemoto(canal),
    });
  }

  enviar(conexionId: IdConexion, datos: string): void {
    this.conexiones.get(conexionId)?.enviar(datos);
  }

  cerrarConexion(conexionId: IdConexion): void {
    // Cerrar dispara el camino de cierre de la conexión (que avisa alDesconectar).
    this.conexiones.get(conexionId)?.cerrar();
  }

  detener(): Promise<void> {
    for (const conexion of [...this.conexiones.values()]) {
      conexion.cerrar();
    }
    this.conexiones.clear();
    this.senal.cerrar();
    this.oyentes = null;
    return Promise.resolve();
  }

  /** Cliente loopback en-proceso para el host-jugador (no viaja por WebRTC). */
  crearClienteLocal(): TransporteCliente {
    return new ClienteLoopback(this);
  }

  private nuevoId(): IdConexion {
    this.contador += 1;
    return `con-${this.contador}`;
  }

  // ── Conexiones REMOTAS (WebRTC) ───────────────────────────────────────────

  private aceptarRemoto(canal: CanalDatos): void {
    const oyentes = this.oyentes;
    if (oyentes === null) {
      canal.cerrar();
      return;
    }
    const id = this.nuevoId();
    const vigia = new Watchdog(this.timeoutSilencioMs, () => canal.cerrar(), this.timeout);
    let cerrado = false;
    const alCerrar = (): void => {
      if (cerrado) return;
      cerrado = true;
      vigia.detener();
      this.conexiones.delete(id);
      oyentes.alDesconectar(id);
    };
    this.conexiones.set(id, {
      enviar: (datos) => canal.enviar(datos),
      cerrar: () => canal.cerrar(),
    });
    canal.alMensaje((datos) => {
      vigia.reiniciar(); // cualquier tráfico confirma que el canal sigue vivo.
      const tipo = frameLatido(datos);
      if (tipo === "ping") {
        canal.enviar(PONG); // respondemos el latido sin pasarlo al orquestador.
        return;
      }
      if (tipo !== null) return; // otro frame de control: tampoco es del juego.
      oyentes.alRecibir(id, datos);
    });
    canal.alCerrar(alCerrar);
    vigia.reiniciar();
    oyentes.alConectar(id);
  }

  // ── Conexión LOCAL (loopback en-proceso) ──────────────────────────────────

  registrarLocal(cliente: ClienteLoopback): IdConexion {
    const id = this.nuevoId();
    this.conexiones.set(id, {
      enviar: (datos) => cliente.recibir(datos),
      cerrar: () => {
        if (!this.conexiones.delete(id)) return;
        cliente.cerradoPorServidor();
        this.avisarDesconexion(id);
      },
    });
    const oyentes = this.oyentes;
    if (oyentes !== null) queueMicrotask(() => oyentes.alConectar(id));
    return id;
  }

  entregarDeLocal(conexionId: IdConexion, datos: string): void {
    const oyentes = this.oyentes;
    if (oyentes === null || !this.conexiones.has(conexionId)) return;
    queueMicrotask(() => oyentes.alRecibir(conexionId, datos));
  }

  olvidarLocal(conexionId: IdConexion): void {
    if (!this.conexiones.delete(conexionId)) return;
    this.avisarDesconexion(conexionId);
  }

  private avisarDesconexion(conexionId: IdConexion): void {
    const oyentes = this.oyentes;
    if (oyentes === null) return;
    queueMicrotask(() => oyentes.alDesconectar(conexionId));
  }
}

/** Cliente del host en el mismo proceso: entrega asíncrona, como un socket real. */
class ClienteLoopback implements TransporteCliente {
  private oyentes: OyentesCliente | null = null;
  private conexionId: IdConexion | null = null;

  constructor(private readonly servidor: TransporteOnlineServidor) {}

  conectar(_codigo: string, oyentes: OyentesCliente): Promise<void> {
    this.oyentes = oyentes;
    this.conexionId = this.servidor.registrarLocal(this);
    return Promise.resolve();
  }

  enviar(datos: string): void {
    if (this.conexionId !== null) this.servidor.entregarDeLocal(this.conexionId, datos);
  }

  desconectar(): Promise<void> {
    if (this.conexionId !== null) {
      this.servidor.olvidarLocal(this.conexionId);
      this.conexionId = null;
    }
    return Promise.resolve();
  }

  /** Llamado por el servidor: entrega un mensaje al host de forma asíncrona. */
  recibir(datos: string): void {
    const oyentes = this.oyentes;
    if (oyentes === null) return;
    queueMicrotask(() => oyentes.alRecibir(datos));
  }

  /** Llamado por el servidor cuando cierra esta conexión desde su lado. */
  cerradoPorServidor(): void {
    const oyentes = this.oyentes;
    this.conexionId = null;
    if (oyentes === null) return;
    queueMicrotask(() => oyentes.alDesconectar());
  }
}
