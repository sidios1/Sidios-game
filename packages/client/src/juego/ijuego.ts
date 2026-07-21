// Contrato común que TODOS los juegos del hub implementan. El hub habla solo
// con esta interfaz: no conoce Carioca ni ningún juego concreto. Así, agregar
// un juego nuevo (Fase 6) no obliga a tocar el hub ni la capa de red.
//
// El servidor sigue siendo la autoridad: el juego recibe el estado por
// sincronizarEstado y emite intenciones por contexto.enviar; jamás decide reglas.

import type { MensajeCliente } from "@juegos/server/protocolo";
import type { OpcionesSala } from "@juegos/server/registroMotores";
import type { VistaJuego } from "@juegos/server/vistaJuego";
import type { PanelConfigLobby } from "./configLobby.js";
import type { FichaCatalogo } from "./ficha.js";

/** Recursos y canales que el hub entrega al juego al arrancarlo. */
export interface ContextoJuego {
  /** Contenedor para la escena/render del juego. */
  readonly contenedorEscena: HTMLElement;
  /** Contenedor para el HUD del juego (DOM superpuesto). */
  readonly contenedorHud: HTMLElement;
  /** El juego emite una intención; el hub la manda por la conexión. */
  readonly enviar: (mensaje: MensajeCliente) => void;
  /** El juego pide volver al menú del hub (p. ej. al terminar la partida). */
  readonly salirAlHub: () => void;
  /** Reinicia el intento de reconexión al anfitrión con el token guardado. */
  readonly reconectar: () => void;
}

/** Señal del servidor dirigida al juego que NO es estado completo. */
export type SenalJuego = { readonly tipo: "aviso"; readonly mensaje: string };

/** Opciones de sala que un juego puede aportar al hostear (sin el transporte). */
export type OpcionesSalaHosteo = Omit<OpcionesSala, "transporte" | "programar">;

/**
 * Recursos que un juego reúne ANTES de que el host cree su sala (p. ej. MeloQuiz
 * pide la carpeta de música). El coordinador los pasa tal cual al lanzador:
 * `env` va al sidecar LAN embebido; `opcionesSala` a `crearSala` del host online.
 */
export interface RecursosHosteo {
  readonly env?: Readonly<Record<string, string>>;
  readonly opcionesSala?: OpcionesSalaHosteo;
}

/**
 * Ciclo de vida de un juego dentro del hub:
 * iniciar → (sincronizarEstado | procesarAccion)* → finalizar.
 */
export interface IJuego {
  /** Monta escena y HUD sobre los contenedores y arranca su bucle. */
  iniciar(contexto: ContextoJuego): void;
  /**
   * Aplica un estado autoritativo recién llegado del servidor. El tipo del canal
   * es `VistaJuego` (la unión de todos los juegos); cada juego recibe la forma de
   * SU sala (por método bivariante, declara su propia vista sin discriminar).
   */
  sincronizarEstado(vista: VistaJuego): void;
  /** Procesa una señal del servidor que no es estado (p. ej. un aviso). */
  procesarAccion(senal: SenalJuego): void;
  /** Desmonta escena/HUD y libera todos sus recursos. */
  finalizar(): void;
}

/**
 * Lo que cada juego aporta al catálogo del hub: su ficha de presentación
 * (`FichaCatalogo`: nombre, jugadores, estado, portada…) más la fábrica que
 * instancia el juego. El hub solo necesita la ficha para pintar la tarjeta; el
 * coordinador usa además `crear()` al lanzar la partida.
 */
export interface DefinicionJuego extends FichaCatalogo {
  /** Crea una instancia nueva del juego, sin montar nada todavía. */
  crear(): IJuego;
  /**
   * Opcional: crea el panel de configuración del lobby para juegos con opciones
   * (hoy Rumble). El coordinador lo cablea genéricamente; `alCambiar` recibe el
   * valor opaco nuevo cada vez que el anfitrión edita un control (para difundirlo
   * por `actualizarConfig`). Los juegos sin config lo omiten. La ficha de catálogo
   * (`FichaCatalogo`) sigue siendo solo presentación: la config vive aquí.
   */
  crearConfigLobby?(alCambiar: (valor: Record<string, unknown>) => void): PanelConfigLobby;
  /**
   * Opcional: reúne los recursos que el HOST necesita antes de crear la sala
   * (hoy MeloQuiz: la carpeta de música). `modo` distingue el sidecar LAN
   * embebido ("local", solo en la app Tauri) del cliente-host online. Devuelve
   * `null` si el usuario canceló (el coordinador vuelve a la portada sin error);
   * lanza para reportar un problema real. Los juegos sin recursos lo omiten.
   */
  prepararHosteo?(modo: "local" | "online"): Promise<RecursosHosteo | null>;
}
