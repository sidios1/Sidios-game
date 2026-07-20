// Selectores modales de targeting para las habilidades de Rumble. Mismo patrón que
// HudUno.pedirColor(): velo + Promise<T | null>, cancelable por botón y por click en
// el fondo, cierre idempotente. Son PRESENTACIÓN pura: solo recogen la elección del
// jugador; quien decide el resultado de la habilidad es siempre el servidor.
//
// El robo de PILLO se elige por ÍNDICE, no por id: los ids de carta codifican la
// carta, así que la mano de la víctima nunca viaja al cliente (ver vistaRumble.ts).

import type { Carta, Pinta, ValorCarta } from "@juegos/carioca-core";
import { PINTAS, VALORES } from "@juegos/carioca-core";
import { etiquetaCorta } from "../../hud/formatoCarta.js";

const SIMBOLOS: Readonly<Record<Pinta, string>> = {
  corazones: "♥",
  diamantes: "♦",
  treboles: "♣",
  picas: "♠",
};

const NOMBRE_PINTA: Readonly<Record<Pinta, string>> = {
  corazones: "Corazones",
  diamantes: "Diamantes",
  treboles: "Tréboles",
  picas: "Picas",
};

const ETIQUETAS: Readonly<Record<ValorCarta, string>> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

/** Jugador elegible como objetivo (id + nombre para mostrar). */
export interface CandidatoObjetivo {
  readonly id: string;
  readonly nombre: string;
}

/** Especificación de carta adivinada: pinta + valor, sin id (no la ves). */
export interface EspecCarta {
  readonly pinta: Pinta;
  readonly valor: ValorCarta;
}

/**
 * Gestor de un único modal a la vez. Vive en el HudRumble: abrir un selector cierra
 * el anterior (resolviéndolo con null), y `destruir()` limpia el que quede abierto
 * para no dejar promesas colgadas al salir de la partida.
 */
export class Selectores {
  private cerrarActivo: ((valor: never) => void) | null = null;
  private eleActivo: HTMLElement | null = null;

  constructor(private readonly raiz: HTMLElement) {}

  /** Cierra el modal abierto (si lo hay) resolviéndolo con null. */
  cerrar(): void {
    const resolver = this.cerrarActivo;
    this.cerrarActivo = null;
    this.eleActivo?.remove();
    this.eleActivo = null;
    if (resolver !== null) (resolver as (v: null) => void)(null);
  }

  destruir(): void {
    this.cerrar();
  }

  /**
   * Base común: monta el velo con título y contenido, y devuelve la promesa. El
   * `construir` recibe una función `elegir` para resolver con el valor escogido.
   */
  private abrir<T>(
    titulo: string,
    ayuda: string | null,
    construir: (cuerpo: HTMLElement, elegir: (valor: T) => void) => void,
  ): Promise<T | null> {
    this.cerrar();
    return new Promise<T | null>((resolver) => {
      const finalizar = (valor: T | null): void => {
        if (this.cerrarActivo === null) return;
        this.cerrarActivo = null;
        this.eleActivo?.remove();
        this.eleActivo = null;
        resolver(valor);
      };
      this.cerrarActivo = finalizar as (valor: never) => void;

      const velo = document.createElement("div");
      velo.className = "rumble-selector";

      const panel = document.createElement("div");
      panel.className = "rumble-selector-panel";

      const tit = document.createElement("div");
      tit.className = "rumble-selector-titulo";
      tit.textContent = titulo;
      panel.appendChild(tit);

      if (ayuda !== null) {
        const p = document.createElement("p");
        p.className = "rumble-selector-ayuda";
        p.textContent = ayuda;
        panel.appendChild(p);
      }

      const cuerpo = document.createElement("div");
      cuerpo.className = "rumble-selector-cuerpo";
      construir(cuerpo, (valor) => finalizar(valor));
      panel.appendChild(cuerpo);

      const cancelar = document.createElement("button");
      cancelar.className = "rumble-selector-cancelar";
      cancelar.textContent = "Cancelar";
      cancelar.addEventListener("click", () => finalizar(null));
      panel.appendChild(cancelar);

      velo.appendChild(panel);
      velo.addEventListener("click", (e) => {
        if (e.target === velo) finalizar(null);
      });
      this.eleActivo = velo;
      this.raiz.appendChild(velo);
    });
  }

  /** Elegir un jugador objetivo (SAPO, CHATO, TROLL, PILLO). */
  pedirJugador(
    candidatos: readonly CandidatoObjetivo[],
    titulo = "Elige un jugador",
  ): Promise<string | null> {
    return this.abrir<string>(titulo, null, (cuerpo, elegir) => {
      const lista = document.createElement("div");
      lista.className = "rumble-selector-lista";
      for (const c of candidatos) {
        const boton = document.createElement("button");
        boton.className = "rumble-opcion";
        boton.textContent = c.nombre;
        boton.addEventListener("click", () => elegir(c.id));
        lista.appendChild(boton);
      }
      cuerpo.appendChild(lista);
    });
  }

  /** Elegir una pinta (GUASON). */
  pedirPinta(titulo = "Elige una pinta"): Promise<Pinta | null> {
    return this.abrir<Pinta>(titulo, null, (cuerpo, elegir) => {
      const grid = document.createElement("div");
      grid.className = "rumble-selector-pintas";
      for (const pinta of PINTAS) {
        const boton = document.createElement("button");
        boton.className = `rumble-pinta ${pinta === "corazones" || pinta === "diamantes" ? "roja" : "negra"}`;
        boton.textContent = SIMBOLOS[pinta];
        boton.title = NOMBRE_PINTA[pinta];
        boton.setAttribute("aria-label", NOMBRE_PINTA[pinta]);
        boton.addEventListener("click", () => elegir(pinta));
        grid.appendChild(boton);
      }
      cuerpo.appendChild(grid);
    });
  }

  /**
   * Adivinar una carta por pinta + valor (DECRETALO, MISH, PILLO). Dos pasos:
   * primero la pinta, luego el valor, dentro del mismo modal.
   */
  pedirCarta(titulo: string, ayuda: string | null = null): Promise<EspecCarta | null> {
    return this.abrir<EspecCarta>(titulo, ayuda, (cuerpo, elegir) => {
      let pintaElegida: Pinta | null = null;

      const paso = document.createElement("div");
      paso.className = "rumble-selector-paso";
      cuerpo.appendChild(paso);

      const grid = document.createElement("div");
      grid.className = "rumble-selector-pintas";
      cuerpo.appendChild(grid);

      const valores = document.createElement("div");
      valores.className = "rumble-selector-valores";
      cuerpo.appendChild(valores);

      const pintarPintas = (): void => {
        paso.textContent = "1 · Pinta";
        grid.replaceChildren();
        valores.replaceChildren();
        for (const pinta of PINTAS) {
          const boton = document.createElement("button");
          boton.className = `rumble-pinta ${pinta === "corazones" || pinta === "diamantes" ? "roja" : "negra"}`;
          boton.textContent = SIMBOLOS[pinta];
          boton.title = NOMBRE_PINTA[pinta];
          boton.setAttribute("aria-label", NOMBRE_PINTA[pinta]);
          boton.addEventListener("click", () => {
            pintaElegida = pinta;
            pintarValores();
          });
          grid.appendChild(boton);
        }
      };

      const pintarValores = (): void => {
        const pinta = pintaElegida;
        if (pinta === null) return;
        paso.textContent = `2 · Valor  (${NOMBRE_PINTA[pinta]} ${SIMBOLOS[pinta]})`;
        grid.replaceChildren();
        valores.replaceChildren();
        for (const valor of VALORES) {
          const boton = document.createElement("button");
          boton.className = "rumble-valor";
          boton.textContent = ETIQUETAS[valor];
          boton.addEventListener("click", () => elegir({ pinta, valor }));
          valores.appendChild(boton);
        }
        const volver = document.createElement("button");
        volver.className = "rumble-volver";
        volver.textContent = "← Cambiar pinta";
        volver.addEventListener("click", () => {
          pintaElegida = null;
          pintarPintas();
        });
        valores.appendChild(volver);
      };

      pintarPintas();
    });
  }

  /** Elegir una carta PROPIA por id (la ves, así que el id es legítimo). */
  pedirCartaPropia(
    mano: readonly Carta[],
    titulo = "Elige una carta tuya",
    ayuda: string | null = null,
  ): Promise<string | null> {
    return this.abrir<string>(titulo, ayuda, (cuerpo, elegir) => {
      const lista = document.createElement("div");
      lista.className = "rumble-selector-mano";
      for (const carta of mano) {
        const boton = document.createElement("button");
        boton.className = "rumble-carta";
        boton.textContent = etiquetaCorta(carta);
        boton.addEventListener("click", () => elegir(carta.id));
        lista.appendChild(boton);
      }
      cuerpo.appendChild(lista);
    });
  }

  /**
   * Robo a ciegas de PILLO: N dorsos indistinguibles, se elige una POSICIÓN. El
   * cliente no sabe (ni puede saber) qué carta hay en cada una.
   */
  pedirDorsoCiego(
    numeroCartas: number,
    titulo = "Róbale una carta",
  ): Promise<number | null> {
    return this.abrir<number>(
      titulo,
      "No sabes cuál es cada una: elige a ciegas.",
      (cuerpo, elegir) => {
        const lista = document.createElement("div");
        lista.className = "rumble-selector-dorsos";
        for (let i = 0; i < numeroCartas; i += 1) {
          const boton = document.createElement("button");
          boton.className = "rumble-dorso";
          boton.textContent = String(i + 1);
          boton.setAttribute("aria-label", `Carta en la posición ${i + 1}`);
          boton.addEventListener("click", () => elegir(i));
          lista.appendChild(boton);
        }
        cuerpo.appendChild(lista);
      },
    );
  }
}
