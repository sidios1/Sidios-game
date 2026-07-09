// Pantalla de conexión y lobby. Selector de modo con "Online" ARRIBA (jugar a
// distancia por WebRTC: crear sala o unirse por código corto) y "Local" ABAJO
// (LAN: crear partida o unirse por ip:puerto).

import type { JugadorEnSala } from "@juegos/server/protocolo";
import type { ModoConexion } from "../red/fabricaTransporte.js";
import { esCodigoSala } from "../red/online/codigoSala.js";
import { crearAvatar, avatarPorDefecto } from "../perfil/avatares.js";
import { crearInsigniaPerfil } from "../perfil/insigniaPerfil.js";
import type { Perfil } from "../perfil/perfil.js";

/** Puerto del servidor de desarrollo (packages/server: npm run dev). */
export const PUERTO_LOCAL_POR_DEFECTO = 35711;

export interface AccionesConexion {
  readonly alConectar: (modo: ModoConexion, codigo: string) => void;
  /** `turbo` = el anfitrión activó el modo +Turbo (reloj por turno). */
  readonly alIniciarPartida: (turbo: boolean) => void;
  /**
   * Crear partida con el servidor EMBEBIDO (Fase 5, app de escritorio): el host
   * arranca su propio servidor LAN. Solo se invoca si servidorEmbebidoDisponible.
   */
  readonly alCrearPartida?: () => void;
  /**
   * Crear partida ONLINE (Fase 7): el host arranca su orquestador en el webview
   * (cliente-host) y obtiene un código corto para compartir.
   */
  readonly alCrearPartidaOnline?: () => void;
  /** Volver al menú del hub desde la portada de modo (opcional). */
  readonly alVolver?: () => void;
  /** Perfil activo (nickname + avatar) que se usará al unirse. */
  readonly perfil?: () => Perfil | null;
  /** Abrir el editor de perfil (opcional). */
  readonly alEditarPerfil?: () => void;
}

/** Datos del juego elegido que la pantalla muestra (título y cupo de la sala). */
export interface JuegoElegido {
  readonly nombre: string;
  readonly minJugadores: number;
  /** Máximo de jugadores; omitido = sin tope. */
  readonly maxJugadores?: number;
  /** El juego soporta el modo +Turbo (ofrece el toggle al anfitrión). */
  readonly soportaTurbo?: boolean;
}

const JUEGO_POR_DEFECTO: JuegoElegido = {
  nombre: "Partida local",
  minJugadores: 2,
};

export class PantallaConexion {
  private readonly velo: HTMLElement;
  private miJugadorId: string | null = null;
  private juego: JuegoElegido = JUEGO_POR_DEFECTO;

  constructor(
    raiz: HTMLElement,
    private readonly acciones: AccionesConexion,
    /** En la app de escritorio (Tauri) el host arranca su propio servidor. */
    private readonly servidorEmbebidoDisponible = false,
  ) {
    this.velo = document.createElement("div");
    this.velo.className = "velo";
    raiz.appendChild(this.velo);
  }

  /** Ajusta título y cupo según el juego elegido en el hub. */
  configurarJuego(juego: JuegoElegido): void {
    this.juego = juego;
  }

  mostrarPortada(): void {
    this.velo.replaceChildren();
    this.velo.classList.remove("oculto");

    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";

    const titulo = document.createElement("h1");
    titulo.textContent = this.juego.nombre;
    const subtitulo = document.createElement("p");
    subtitulo.className = "subtitulo";
    subtitulo.textContent = "Elige el modo de juego";
    tarjeta.append(titulo, subtitulo);

    const cabecera = this.cabeceraPerfil();
    if (cabecera !== null) tarjeta.appendChild(cabecera);

    // ARRIBA: Online (WebRTC), jugar a distancia entre redes distintas.
    const online = document.createElement("button");
    online.className = "modo";
    online.textContent = "Online";
    online.addEventListener("click", () => this.mostrarFormularioOnline());
    tarjeta.appendChild(online);

    // ABAJO: Local (LAN), funcional.
    const local = document.createElement("button");
    local.className = "modo";
    local.textContent = "Local";
    local.addEventListener("click", () => this.mostrarFormularioLocal());
    tarjeta.appendChild(local);

    if (this.acciones.alVolver !== undefined) {
      const volver = document.createElement("button");
      volver.className = "secundario";
      volver.textContent = "← Volver al hub";
      volver.addEventListener("click", () => this.acciones.alVolver?.());
      tarjeta.appendChild(volver);
    }

    this.velo.appendChild(tarjeta);
  }

  private mostrarFormularioLocal(): void {
    this.velo.replaceChildren();
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";

    const titulo = document.createElement("h1");
    titulo.textContent = "Partida local (LAN)";
    tarjeta.appendChild(titulo);

    const cabecera = this.cabeceraPerfil();
    if (cabecera !== null) tarjeta.appendChild(cabecera);

    // Crear partida. En la app de escritorio (Tauri) el host arranca su propio
    // servidor LAN embebido y luego se une a él. En desarrollo web el servidor
    // corre aparte (npm run dev:server) y el host se conecta a su propia máquina.
    const crear = document.createElement("button");
    crear.className = "principal";
    crear.textContent = "Crear partida";
    const notaCrear = document.createElement("p");
    notaCrear.className = "nota";
    if (this.servidorEmbebidoDisponible) {
      notaCrear.textContent =
        `Se iniciará el servidor en tu equipo y aparecerá un código ip:puerto; ` +
        `compártelo con tus amigos de la misma WiFi para que se unan.`;
      crear.addEventListener("click", () => {
        this.acciones.alCrearPartida?.();
      });
    } else {
      notaCrear.textContent =
        `Requiere el servidor local corriendo (npm run dev:server). ` +
        `Comparte con tus amigos el código ip:puerto que imprime su consola.`;
      crear.addEventListener("click", () => {
        this.acciones.alConectar("local", `127.0.0.1:${PUERTO_LOCAL_POR_DEFECTO}`);
      });
    }

    const codigo = document.createElement("input");
    codigo.placeholder = "ip:puerto del anfitrión";
    const unirse = document.createElement("button");
    unirse.textContent = "Unirse";
    unirse.addEventListener("click", () => {
      this.conectarConCodigo(codigo.value.trim());
    });

    const filaUnirse = document.createElement("div");
    filaUnirse.className = "fila-botones";
    filaUnirse.append(codigo, unirse);

    const volver = document.createElement("button");
    volver.textContent = "Volver";
    volver.addEventListener("click", () => this.mostrarPortada());

    tarjeta.append(crear, notaCrear, filaUnirse, volver);
    this.velo.appendChild(tarjeta);
  }

  private conectarConCodigo(codigo: string): void {
    if (codigo.length === 0 || !codigo.includes(":")) {
      this.mostrarError("el código de sala tiene la forma ip:puerto");
      return;
    }
    this.acciones.alConectar("local", codigo);
  }

  private mostrarFormularioOnline(): void {
    this.velo.replaceChildren();
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";

    const titulo = document.createElement("h1");
    titulo.textContent = "Partida online";
    tarjeta.appendChild(titulo);

    const cabecera = this.cabeceraPerfil();
    if (cabecera !== null) tarjeta.appendChild(cabecera);

    // Crear sala: el host arranca su orquestador en el webview (cliente-host) y
    // obtiene un código corto; los amigos se unen por internet, sin VPN ni túnel.
    const crear = document.createElement("button");
    crear.className = "principal";
    crear.textContent = "Crear partida";
    const notaCrear = document.createElement("p");
    notaCrear.className = "nota";
    notaCrear.textContent =
      "Se creará una sala online y aparecerá un código corto; compártelo con " +
      "tus amigos (de cualquier red) para que se unan.";
    crear.addEventListener("click", () => {
      this.acciones.alCrearPartidaOnline?.();
    });

    const codigo = document.createElement("input");
    codigo.placeholder = "código de sala";
    codigo.autocapitalize = "characters";
    const unirse = document.createElement("button");
    unirse.textContent = "Unirse";
    unirse.addEventListener("click", () => {
      this.conectarConCodigoOnline(codigo.value.trim().toUpperCase());
    });

    const filaUnirse = document.createElement("div");
    filaUnirse.className = "fila-botones";
    filaUnirse.append(codigo, unirse);

    const volver = document.createElement("button");
    volver.textContent = "Volver";
    volver.addEventListener("click", () => this.mostrarPortada());

    tarjeta.append(crear, notaCrear, filaUnirse, volver);
    this.velo.appendChild(tarjeta);
  }

  private conectarConCodigoOnline(codigo: string): void {
    if (!esCodigoSala(codigo)) {
      this.mostrarError("el código de sala son 6 caracteres (p. ej. K7P2Q9)");
      return;
    }
    this.acciones.alConectar("online", codigo);
  }

  /** Cabecera con el perfil activo y enlace a editarlo; null si no hay perfil. */
  private cabeceraPerfil(): HTMLElement | null {
    const perfil = this.acciones.perfil?.() ?? null;
    if (perfil === null) return null;
    return crearInsigniaPerfil(perfil, "Editar perfil", () =>
      this.acciones.alEditarPerfil?.(),
    );
  }

  registrarJugadorId(jugadorId: string): void {
    this.miJugadorId = jugadorId;
  }

  mostrarSala(jugadores: readonly JugadorEnSala[], codigo: string): void {
    this.velo.replaceChildren();
    this.velo.classList.remove("oculto");
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";

    const titulo = document.createElement("h1");
    titulo.textContent = "Sala de espera";
    const dondeUnirse = document.createElement("p");
    dondeUnirse.className = "nota";
    dondeUnirse.textContent = `Código de esta sala: ${codigo}`;
    tarjeta.append(titulo, dondeUnirse);

    const lista = document.createElement("ul");
    lista.className = "lista-jugadores";
    for (const jugador of jugadores) {
      const item = document.createElement("li");
      item.className = "jugador-sala";
      const avatar = crearAvatar(
        jugador.avatar ?? avatarPorDefecto(jugador.jugadorId),
        32,
      );
      avatar.className = "avatar-mini";
      const partes = [jugador.nombre];
      if (jugador.esAnfitrion) partes.push("(anfitrión)");
      if (jugador.jugadorId === this.miJugadorId) partes.push("(tú)");
      const texto = document.createElement("span");
      texto.textContent = partes.join(" ");
      item.append(avatar, texto);
      lista.appendChild(item);
    }
    tarjeta.appendChild(lista);

    const soyAnfitrion =
      jugadores.find((j) => j.jugadorId === this.miJugadorId)?.esAnfitrion ?? false;
    if (soyAnfitrion) {
      // Modo +Turbo: solo el anfitrión lo decide, y solo si el juego lo soporta.
      let turboActivado = false;
      if (this.juego.soportaTurbo === true) {
        const opcion = document.createElement("label");
        opcion.className = "opcion-turbo";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.addEventListener("change", () => {
          turboActivado = check.checked;
        });
        const etiqueta = document.createElement("span");
        etiqueta.textContent = "+Turbo (reloj por turno: 60s el primero, 15s el resto)";
        opcion.append(check, etiqueta);
        tarjeta.appendChild(opcion);
      }
      const iniciar = document.createElement("button");
      iniciar.className = "principal";
      iniciar.textContent = "Iniciar partida";
      iniciar.disabled = jugadores.length < this.juego.minJugadores;
      iniciar.addEventListener("click", () => this.acciones.alIniciarPartida(turboActivado));
      tarjeta.appendChild(iniciar);
      if (jugadores.length < this.juego.minJugadores) {
        const nota = document.createElement("p");
        nota.className = "nota";
        nota.textContent =
          this.juego.maxJugadores === undefined
            ? `Se necesitan al menos ${this.juego.minJugadores} jugadores.`
            : `Se necesitan ${this.juego.minJugadores} a ${this.juego.maxJugadores} jugadores.`;
        tarjeta.appendChild(nota);
      }
    } else {
      const nota = document.createElement("p");
      nota.className = "nota";
      nota.textContent = "Esperando a que el anfitrión inicie la partida…";
      tarjeta.appendChild(nota);
    }
    this.velo.appendChild(tarjeta);
  }

  /**
   * Mensaje final con velo. Si se pasa `alReconectar`, ofrece un botón
   * "Reconectar" (reintenta con el token) además de "Volver a empezar".
   */
  mostrarMensajeFinal(mensaje: string, alReconectar?: () => void): void {
    this.velo.replaceChildren();
    this.velo.classList.remove("oculto");
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";
    const texto = document.createElement("p");
    texto.textContent = mensaje;
    tarjeta.append(texto);
    if (alReconectar !== undefined) {
      const reconectar = document.createElement("button");
      reconectar.className = "principal";
      reconectar.textContent = "Reconectar";
      reconectar.addEventListener("click", () => alReconectar());
      tarjeta.append(reconectar);
    }
    const recargar = document.createElement("button");
    recargar.textContent = "Volver a empezar";
    recargar.addEventListener("click", () => window.location.reload());
    tarjeta.append(recargar);
    this.velo.appendChild(tarjeta);
  }

  /**
   * Aviso NO bloqueante de reconexión en curso (la automática trabaja sola). Se
   * anexa a la tarjeta visible (lobby/sala) sin reemplazarla; en partida el velo
   * está oculto y el aviso lo muestra el HUD del juego. Reutilizable: no duplica.
   */
  mostrarReconectando(): void {
    if (this.velo.querySelector(".reconectando") !== null) return;
    const aviso = document.createElement("p");
    aviso.className = "reconectando";
    aviso.textContent = "Conexión perdida. Reconectando…";
    this.velo.querySelector(".tarjeta")?.appendChild(aviso);
  }

  mostrarError(mensaje: string): void {
    const previo = this.velo.querySelector(".error");
    previo?.remove();
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = mensaje;
    this.velo.querySelector(".tarjeta")?.appendChild(error);
  }

  ocultar(): void {
    this.velo.classList.add("oculto");
  }

  get visible(): boolean {
    return !this.velo.classList.contains("oculto");
  }
}
