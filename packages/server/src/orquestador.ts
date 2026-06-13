// Orquestador de partida: la autoridad. Recibe intenciones por el transporte,
// las valida con carioca-core (aquí no vive ninguna regla del juego), y emite
// a cada jugador SU vista. Solo conoce las interfaces de transporte.ts: no
// sabe si habla por LAN, online o memoria.

import type {
  Carta,
  DatosJugador,
  EstadoPartida,
  GeneradorAleatorio,
  Resultado,
} from "@juegos/carioca-core";
import {
  bajarse,
  crearGeneradorSemilla,
  crearPartida,
  crearPartidaConMazo,
  descartar,
  iniciarSiguienteMano,
  iniciarSiguienteManoConMazo,
  pegar,
  robarDelMazo,
  robarDelPozo,
} from "@juegos/carioca-core";
import type {
  CodigoErrorServidor,
  JugadorEnSala,
  MensajeCliente,
  MensajeServidor,
} from "./protocolo.js";
import { analizarMensajeCliente, serializarServidor } from "./protocolo.js";
import type { IdConexion, TransporteServidor } from "./transporte.js";
import { construirVista } from "./vista.js";

export interface OpcionesOrquestador {
  readonly transporte: TransporteServidor;
  /** Barajado real; por defecto, semilla derivada del reloj. */
  readonly rng?: GeneradorAleatorio;
  /** Inyección determinista para tests: el mazo ya ordenado de cada mano. */
  readonly mazoParaMano?: (numeroMano: number) => readonly Carta[];
  /** Tokens de reconexión; el default basta para una LAN entre amigos. */
  readonly generarToken?: () => string;
  /**
   * Cupo del lobby. Por defecto SIN tope (jugadores ilimitados): los mazos
   * escalan en el core, que solo exige el mínimo de 2 al iniciar. Se puede
   * fijar un cupo explícito para limitar una sala.
   */
  readonly maxJugadores?: number;
}

type FaseSala = "lobby" | "enPartida" | "terminada";

interface Asiento {
  readonly jugadorId: string;
  readonly nombre: string;
  readonly token: string;
  conexionId: IdConexion | null;
}

/** Fracción de jugadores conectados que debe votar para repartir la siguiente mano. */
const FRACCION_VOTOS = 0.75;

function tokenAleatorio(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

export class Orquestador {
  private readonly transporte: TransporteServidor;
  private readonly rng: GeneradorAleatorio;
  private readonly mazoParaMano: ((numeroMano: number) => readonly Carta[]) | null;
  private readonly generarToken: () => string;
  private readonly maxJugadores: number;

  private faseSala: FaseSala = "lobby";
  private readonly asientos: Asiento[] = [];
  private readonly porConexion = new Map<IdConexion, string>();
  private readonly pendientes = new Set<IdConexion>();
  private estado: EstadoPartida | null = null;
  private readonly listos = new Set<string>();
  private contadorJugadores = 0;

  constructor(opciones: OpcionesOrquestador) {
    this.transporte = opciones.transporte;
    this.rng = opciones.rng ?? crearGeneradorSemilla(Date.now());
    this.mazoParaMano = opciones.mazoParaMano ?? null;
    this.generarToken = opciones.generarToken ?? tokenAleatorio;
    this.maxJugadores = opciones.maxJugadores ?? Number.POSITIVE_INFINITY;
  }

  /** Arranca el transporte y devuelve el código de sala. */
  iniciar(): Promise<string> {
    return this.transporte.iniciar({
      alConectar: (conexionId) => this.alConectar(conexionId),
      alRecibir: (conexionId, datos) => this.alRecibir(conexionId, datos),
      alDesconectar: (conexionId) => this.alDesconectar(conexionId),
    });
  }

  async detener(): Promise<void> {
    this.difundir({ tipo: "salaCerrada", motivo: "la sala fue cerrada" });
    await this.transporte.detener();
  }

  // ── Eventos del transporte ────────────────────────────────────────────────

  private alConectar(conexionId: IdConexion): void {
    this.pendientes.add(conexionId);
  }

  private alRecibir(conexionId: IdConexion, datos: string): void {
    const mensaje = analizarMensajeCliente(datos);
    if (mensaje === null) {
      this.enviarError(conexionId, "mensajeInvalido", "mensaje malformado o desconocido");
      return;
    }
    if (mensaje.tipo === "unirse") {
      this.procesarUnirse(conexionId, mensaje.nombre, mensaje.token);
      return;
    }
    const jugadorId = this.porConexion.get(conexionId);
    if (jugadorId === undefined) {
      this.enviarError(conexionId, "debesUnirtePrimero", "primero envía unirse");
      return;
    }
    switch (mensaje.tipo) {
      case "iniciarPartida":
        this.procesarIniciarPartida(conexionId, jugadorId);
        return;
      case "listoSiguienteMano":
        this.procesarListo(conexionId, jugadorId);
        return;
      default:
        this.procesarIntencion(conexionId, jugadorId, mensaje);
    }
  }

  private alDesconectar(conexionId: IdConexion): void {
    if (this.pendientes.delete(conexionId)) return;
    const jugadorId = this.porConexion.get(conexionId);
    if (jugadorId === undefined) return;
    this.porConexion.delete(conexionId);
    const idx = this.asientos.findIndex((a) => a.jugadorId === jugadorId);
    const asiento = this.asientos[idx];
    if (asiento === undefined) return;
    if (this.faseSala === "lobby") {
      // En el lobby, desconectarse es salir; si se va el anfitrión, el
      // siguiente asiento pasa a serlo (es siempre el primero de la lista).
      this.asientos.splice(idx, 1);
      this.difundirEstadoSala();
      return;
    }
    // En partida el asiento se conserva para la reconexión por token.
    asiento.conexionId = null;
    this.listos.delete(jugadorId);
    this.avanzarManoSiCorresponde();
    this.difundirVistas();
  }

  // ── Mensajes del cliente ──────────────────────────────────────────────────

  private procesarUnirse(
    conexionId: IdConexion,
    nombre: string,
    token: string | undefined,
  ): void {
    if (this.porConexion.has(conexionId)) {
      this.enviarError(conexionId, "accionInvalida", "ya estás en la sala");
      return;
    }
    if (token !== undefined) {
      this.procesarReconexion(conexionId, token);
      return;
    }
    if (this.faseSala !== "lobby") {
      this.enviarError(conexionId, "partidaYaIniciada", "la partida ya comenzó");
      this.transporte.cerrarConexion(conexionId);
      return;
    }
    if (this.asientos.length >= this.maxJugadores) {
      this.enviarError(conexionId, "salaLlena", "la sala está llena");
      this.transporte.cerrarConexion(conexionId);
      return;
    }
    this.pendientes.delete(conexionId);
    this.contadorJugadores += 1;
    const asiento: Asiento = {
      jugadorId: `j${this.contadorJugadores}`,
      nombre,
      token: this.generarToken(),
      conexionId,
    };
    this.asientos.push(asiento);
    this.porConexion.set(conexionId, asiento.jugadorId);
    this.enviarA(conexionId, {
      tipo: "bienvenida",
      jugadorId: asiento.jugadorId,
      token: asiento.token,
    });
    this.difundirEstadoSala();
  }

  private procesarReconexion(conexionId: IdConexion, token: string): void {
    const asiento = this.asientos.find(
      (a) => a.token === token && a.conexionId === null,
    );
    if (asiento === undefined) {
      this.enviarError(conexionId, "tokenInvalido", "token de reconexión inválido");
      this.transporte.cerrarConexion(conexionId);
      return;
    }
    this.pendientes.delete(conexionId);
    asiento.conexionId = conexionId;
    this.porConexion.set(conexionId, asiento.jugadorId);
    this.enviarA(conexionId, {
      tipo: "bienvenida",
      jugadorId: asiento.jugadorId,
      token: asiento.token,
    });
    // La reconexión puede cambiar el umbral de votos (sube el denominador).
    this.avanzarManoSiCorresponde();
    this.difundirVistas();
  }

  private procesarIniciarPartida(conexionId: IdConexion, jugadorId: string): void {
    if (this.faseSala !== "lobby") {
      this.enviarError(conexionId, "accionInvalida", "la partida ya comenzó");
      return;
    }
    const anfitrion = this.asientos[0];
    if (anfitrion === undefined || anfitrion.jugadorId !== jugadorId) {
      this.enviarError(conexionId, "noEresAnfitrion", "solo el anfitrión puede iniciar");
      return;
    }
    const datos: DatosJugador[] = this.asientos.map((a) => ({
      id: a.jugadorId,
      nombre: a.nombre,
    }));
    const resultado =
      this.mazoParaMano === null
        ? crearPartida(datos, this.rng)
        : crearPartidaConMazo(datos, this.mazoParaMano(1));
    if (!resultado.ok) {
      this.enviarError(conexionId, resultado.error.codigo, resultado.error.mensaje);
      return;
    }
    this.estado = resultado.valor;
    this.faseSala = "enPartida";
    this.difundirVistas();
  }

  private procesarIntencion(
    conexionId: IdConexion,
    jugadorId: string,
    mensaje: MensajeCliente,
  ): void {
    if (this.faseSala !== "enPartida" || this.estado === null) {
      this.enviarError(conexionId, "accionInvalida", "no hay una partida en curso");
      return;
    }
    const resultado = this.aplicarIntencion(this.estado, jugadorId, mensaje);
    if (resultado === null) {
      this.enviarError(conexionId, "accionInvalida", "esa acción no existe");
      return;
    }
    if (!resultado.ok) {
      this.enviarError(conexionId, resultado.error.codigo, resultado.error.mensaje);
      return;
    }
    this.estado = resultado.valor;
    if (resultado.valor.fase === "partidaTerminada") {
      this.faseSala = "terminada";
    }
    this.difundirVistas();
  }

  /** Traduce la intención a la función del core. Cero reglas propias. */
  private aplicarIntencion(
    estado: EstadoPartida,
    jugadorId: string,
    mensaje: MensajeCliente,
  ): Resultado<EstadoPartida> | null {
    switch (mensaje.tipo) {
      case "robarDelMazo":
        return robarDelMazo(estado, jugadorId);
      case "robarDelPozo":
        return robarDelPozo(estado, jugadorId);
      case "bajarse":
        return bajarse(estado, jugadorId, mensaje.propuesta);
      case "pegar":
        return mensaje.extremo === undefined
          ? pegar(estado, jugadorId, mensaje.cartaId, mensaje.mesaIdx)
          : pegar(estado, jugadorId, mensaje.cartaId, mensaje.mesaIdx, mensaje.extremo);
      case "descartar":
        return descartar(estado, jugadorId, mensaje.cartaId);
      default:
        return null;
    }
  }

  private procesarListo(conexionId: IdConexion, jugadorId: string): void {
    if (
      this.faseSala !== "enPartida" ||
      this.estado === null ||
      this.estado.fase !== "manoTerminada"
    ) {
      this.enviarError(conexionId, "accionInvalida", "no hay mano terminada que confirmar");
      return;
    }
    this.listos.add(jugadorId);
    this.avanzarManoSiCorresponde();
    this.difundirVistas();
  }

  // ── Avance de mano por votos ──────────────────────────────────────────────

  private contarConectados(): number {
    return this.asientos.filter((a) => a.conexionId !== null).length;
  }

  private votosNecesarios(): number {
    return Math.max(1, Math.ceil(FRACCION_VOTOS * this.contarConectados()));
  }

  /**
   * Reparte la siguiente mano cuando votó al menos el 75% de los jugadores
   * conectados. Se reevalúa tras cada voto, desconexión y reconexión: una
   * desconexión baja el denominador y puede disparar el avance.
   */
  private avanzarManoSiCorresponde(): void {
    if (
      this.faseSala !== "enPartida" ||
      this.estado === null ||
      this.estado.fase !== "manoTerminada"
    ) {
      return;
    }
    if (this.contarConectados() === 0) return;
    if (this.listos.size < this.votosNecesarios()) return;
    const resultado =
      this.mazoParaMano === null
        ? iniciarSiguienteMano(this.estado, this.rng)
        : iniciarSiguienteManoConMazo(
            this.estado,
            this.mazoParaMano(this.estado.manoActual + 1),
          );
    if (!resultado.ok) {
      // Invariante rota (mano siguiente inexistente con fase manoTerminada):
      // no hay emisor a quien culpar; se deja la sala como está.
      return;
    }
    this.estado = resultado.valor;
    this.listos.clear();
  }

  // ── Envío de mensajes ─────────────────────────────────────────────────────

  private enviarA(conexionId: IdConexion, mensaje: MensajeServidor): void {
    this.transporte.enviar(conexionId, serializarServidor(mensaje));
  }

  private enviarError(
    conexionId: IdConexion,
    codigo: CodigoErrorServidor,
    mensaje: string,
  ): void {
    this.enviarA(conexionId, { tipo: "error", codigo, mensaje });
  }

  private difundir(mensaje: MensajeServidor): void {
    for (const asiento of this.asientos) {
      if (asiento.conexionId !== null) {
        this.enviarA(asiento.conexionId, mensaje);
      }
    }
  }

  private difundirEstadoSala(): void {
    const jugadores: JugadorEnSala[] = this.asientos.map((a, idx) => ({
      jugadorId: a.jugadorId,
      nombre: a.nombre,
      esAnfitrion: idx === 0,
    }));
    this.difundir({ tipo: "estadoSala", jugadores });
  }

  /** Cada jugador conectado recibe SU vista; las manos ajenas nunca viajan. */
  private difundirVistas(): void {
    if (this.estado === null) return;
    const meta = {
      conectados: new Set(
        this.asientos.filter((a) => a.conexionId !== null).map((a) => a.jugadorId),
      ),
      listos: this.listos,
      votosNecesarios: this.votosNecesarios(),
    };
    for (const asiento of this.asientos) {
      if (asiento.conexionId === null) continue;
      this.enviarA(asiento.conexionId, {
        tipo: "vista",
        vista: construirVista(this.estado, asiento.jugadorId, meta),
      });
    }
  }
}
