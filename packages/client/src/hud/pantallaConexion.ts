// Pantalla de conexión y lobby. Selector de modo con "Online" ARRIBA
// (deshabilitado, "próximamente": su adaptador llega en la Fase 7) y
// "Local" ABAJO (funcional por LAN): crear partida o unirse por ip:puerto.

import type { JugadorEnSala } from "@juegos/server/protocolo";
import type { ModoConexion } from "../red/fabricaTransporte.js";

/** Puerto del servidor de desarrollo (packages/server: npm run dev). */
export const PUERTO_LOCAL_POR_DEFECTO = 35711;

export interface AccionesConexion {
  readonly alConectar: (modo: ModoConexion, codigo: string, nombre: string) => void;
  readonly alIniciarPartida: () => void;
  /** Volver al menú del hub desde la portada de modo (opcional). */
  readonly alVolver?: () => void;
}

/** Datos del juego elegido que la pantalla muestra (título y cupo de la sala). */
export interface JuegoElegido {
  readonly nombre: string;
  readonly minJugadores: number;
  readonly maxJugadores: number;
}

const JUEGO_POR_DEFECTO: JuegoElegido = {
  nombre: "Partida local",
  minJugadores: 2,
  maxJugadores: 4,
};

export class PantallaConexion {
  private readonly velo: HTMLElement;
  private miJugadorId: string | null = null;
  private juego: JuegoElegido = JUEGO_POR_DEFECTO;

  constructor(
    raiz: HTMLElement,
    private readonly acciones: AccionesConexion,
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

    // ARRIBA: Online, visible pero deshabilitado (adaptador de la Fase 7).
    const online = document.createElement("button");
    online.className = "modo";
    online.disabled = true;
    online.textContent = "Online";
    const etiqueta = document.createElement("span");
    etiqueta.className = "etiqueta";
    etiqueta.textContent = "próximamente";
    online.appendChild(etiqueta);
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

    const nombre = document.createElement("input");
    nombre.placeholder = "Tu nombre";
    nombre.maxLength = 20;
    tarjeta.appendChild(campo("Nombre", nombre));

    // Crear: en desarrollo el servidor corre aparte (npm run dev); la app
    // del host se conecta a su propia máquina. En la Fase 5 lo arrancará sola.
    const crear = document.createElement("button");
    crear.className = "principal";
    crear.textContent = "Crear partida";
    const notaCrear = document.createElement("p");
    notaCrear.className = "nota";
    notaCrear.textContent =
      `Requiere el servidor local corriendo (npm run dev:server). ` +
      `Comparte con tus amigos el código ip:puerto que imprime su consola.`;
    crear.addEventListener("click", () => {
      this.conectarSiHayNombre(nombre, `127.0.0.1:${PUERTO_LOCAL_POR_DEFECTO}`);
    });

    const codigo = document.createElement("input");
    codigo.placeholder = "ip:puerto del anfitrión";
    const unirse = document.createElement("button");
    unirse.textContent = "Unirse";
    unirse.addEventListener("click", () => {
      this.conectarSiHayNombre(nombre, codigo.value.trim());
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

  private conectarSiHayNombre(nombre: HTMLInputElement, codigo: string): void {
    const valor = nombre.value.trim();
    if (valor.length === 0) {
      this.mostrarError("escribe tu nombre primero");
      nombre.focus();
      return;
    }
    if (codigo.length === 0 || !codigo.includes(":")) {
      this.mostrarError("el código de sala tiene la forma ip:puerto");
      return;
    }
    this.acciones.alConectar("local", codigo, valor);
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
      const partes = [jugador.nombre];
      if (jugador.esAnfitrion) partes.push("(anfitrión)");
      if (jugador.jugadorId === this.miJugadorId) partes.push("(tú)");
      item.textContent = partes.join(" ");
      lista.appendChild(item);
    }
    tarjeta.appendChild(lista);

    const soyAnfitrion =
      jugadores.find((j) => j.jugadorId === this.miJugadorId)?.esAnfitrion ?? false;
    if (soyAnfitrion) {
      const iniciar = document.createElement("button");
      iniciar.className = "principal";
      iniciar.textContent = "Iniciar partida";
      iniciar.disabled = jugadores.length < this.juego.minJugadores;
      iniciar.addEventListener("click", () => this.acciones.alIniciarPartida());
      tarjeta.appendChild(iniciar);
      if (jugadores.length < this.juego.minJugadores) {
        const nota = document.createElement("p");
        nota.className = "nota";
        nota.textContent = `Se necesitan ${this.juego.minJugadores} a ${this.juego.maxJugadores} jugadores.`;
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

  mostrarMensajeFinal(mensaje: string): void {
    this.velo.replaceChildren();
    this.velo.classList.remove("oculto");
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta";
    const texto = document.createElement("p");
    texto.textContent = mensaje;
    const recargar = document.createElement("button");
    recargar.className = "principal";
    recargar.textContent = "Volver a empezar";
    recargar.addEventListener("click", () => window.location.reload());
    tarjeta.append(texto, recargar);
    this.velo.appendChild(tarjeta);
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

function campo(etiqueta: string, control: HTMLElement): HTMLElement {
  const envoltura = document.createElement("label");
  envoltura.className = "campo";
  const texto = document.createElement("span");
  texto.textContent = etiqueta;
  envoltura.append(texto, control);
  return envoltura;
}
