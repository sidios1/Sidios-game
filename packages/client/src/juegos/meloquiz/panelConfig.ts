// Panel de lobby de MeloQuiz. Hace DOS cosas de naturaleza distinta, y la
// diferencia importa:
//
//  1. Modo entrenamiento (REGLAS §6) — es CONFIG DE PARTIDA: solo la edita el
//     anfitrión, viaja opaca por `actualizarConfig`/`iniciarPartida` y la revalida
//     el motor. Es lo ÚNICO que devuelve `valorActual()`.
//  2. Carpeta de música — es ESTADO LOCAL de cada jugador: cada uno elige la
//     suya, no viaja por red y el anfitrión ni se entera (REGLAS §1). Se elige
//     acá, en el lobby, para que el índice esté listo antes de la ronda 1: si se
//     eligiera al montar el juego, la primera precarga se perdería esperándolo.
//
// El servidor arma su pool leyendo SU carpeta (env CARPETA_MUSICA); este selector
// es el otro extremo: la carpeta contra la que este cliente resuelve las pistas.

import type { PanelConfigLobby } from "../../juego/configLobby.js";
import { indiceLocal } from "./indiceLocal.js";

export class PanelConfigMeloquiz implements PanelConfigLobby {
  private entrenamiento = false;
  private estadoCarpeta: "vacio" | "indexando" | "listo" = "vacio";
  private mensajeCarpeta = "";
  private raiz: HTMLElement | null = null;
  private ultimoAnfitrion = false;

  constructor(private readonly alCambiar: (valor: Record<string, unknown>) => void) {}

  valorActual(): Record<string, unknown> {
    return { entrenamiento: this.entrenamiento };
  }

  fijarValor(valor: Record<string, unknown>): void {
    // Debe tolerar blobs malformados: cualquier cosa que no sea true es normal.
    this.entrenamiento = valor["entrenamiento"] === true;
    this.repintar();
  }

  bloqueoInicio(numJugadores: number): string | null {
    if (this.entrenamiento && numJugadores !== 1) {
      return "El modo entrenamiento es de 1 jugador.";
    }
    if (!this.entrenamiento && numJugadores < 2) {
      return "Hacen falta 2 jugadores (o activá el modo entrenamiento).";
    }
    if (indiceLocal.vacio) {
      return "Elegí tu carpeta de música para poder sonar las pistas.";
    }
    return null;
  }

  render(esAnfitrion: boolean): HTMLElement {
    this.ultimoAnfitrion = esAnfitrion;
    const raiz = document.createElement("div");
    raiz.className = "config-meloquiz";
    this.raiz = raiz;
    this.pintarEn(raiz, esAnfitrion);
    return raiz;
  }

  // ── Interno ─────────────────────────────────────────────────────────────

  private repintar(): void {
    if (this.raiz === null) return;
    this.pintarEn(this.raiz, this.ultimoAnfitrion);
  }

  private pintarEn(raiz: HTMLElement, esAnfitrion: boolean): void {
    raiz.replaceChildren();
    raiz.appendChild(this.filaEntrenamiento(esAnfitrion));
    raiz.appendChild(this.filaCarpeta());
  }

  private filaEntrenamiento(esAnfitrion: boolean): HTMLElement {
    const fila = document.createElement("label");
    fila.className = "config-meloquiz-fila";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = this.entrenamiento;
    check.disabled = !esAnfitrion;
    check.addEventListener("change", () => {
      this.entrenamiento = check.checked;
      this.alCambiar(this.valorActual());
    });

    const texto = document.createElement("span");
    texto.textContent = "Modo entrenamiento (1 jugador)";

    const nota = document.createElement("small");
    nota.className = "config-meloquiz-nota";
    nota.textContent = esAnfitrion
      ? "Para practicar solo contra tu propia carpeta."
      : "Lo decide el anfitrión.";

    fila.append(check, texto, nota);
    return fila;
  }

  private filaCarpeta(): HTMLElement {
    const fila = document.createElement("div");
    fila.className = "config-meloquiz-fila config-meloquiz-carpeta";

    const etiqueta = document.createElement("span");
    etiqueta.textContent = "Tu carpeta de música";

    const input = document.createElement("input");
    input.type = "file";
    // webkitdirectory no está en los tipos del DOM: es un atributo, no una prop.
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("multiple", "");
    input.disabled = this.estadoCarpeta === "indexando";
    input.addEventListener("change", () => {
      void this.indexar(input.files);
    });

    const estado = document.createElement("small");
    estado.className = "config-meloquiz-nota";
    estado.textContent =
      this.mensajeCarpeta.length > 0
        ? this.mensajeCarpeta
        : "Cada jugador toca su propia copia: el audio nunca viaja por la red.";

    fila.append(etiqueta, input, estado);
    return fila;
  }

  private async indexar(lista: FileList | null): Promise<void> {
    const files = lista === null ? [] : [...lista];
    if (files.length === 0) return;

    this.estadoCarpeta = "indexando";
    this.mensajeCarpeta = `Indexando ${files.length} archivos…`;
    this.repintar();

    try {
      const { indexados, omitidos } = await indiceLocal.indexar(files);
      this.estadoCarpeta = indexados > 0 ? "listo" : "vacio";
      this.mensajeCarpeta =
        indexados === 0
          ? "No se encontró ningún audio soportado en esa carpeta."
          : `${indexados} pistas listas` + (omitidos > 0 ? ` (${omitidos} omitidas).` : ".");
    } catch (error) {
      this.estadoCarpeta = "vacio";
      this.mensajeCarpeta = `No se pudo leer la carpeta: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    this.repintar();
  }
}
