// Monopoly Ultimate Team como implementación de IJuego (fase de tablero,
// single-client esta sesión — ver PROMPTS_MONOPOLY_ULTIMATE_TEAM.md). Reusa
// el motor de escena 3D genérico (Escena parametrizada, Interpolador,
// SincronizadorPoses) igual que Carioca/UNO, pero con layout PROPIO: un
// tablero cuadrado de 40 celdas en vez de una mesa circular de cartas.
//
// Simplificaciones deliberadas de esta sesión (documentadas también en los
// archivos que las implementan):
//  - Fichas y dados NO pasan por SincronizadorPoses: se animan a mano
//    (paso a paso / arco), porque ese motor tweenea directo al destino y no
//    encadena pasos intermedios. SincronizadorPoses solo gestiona la
//    revelación transitoria de sobre/Prensa Deportiva (disposicionMonopoly.ts).
//  - El panel de jugadores es DOM fijo, no insignias proyectadas sobre la
//    ficha 3D (ver hudMonopoly.ts).
//  - El contenido de una carta de Prensa Deportiva robada no se conoce en el
//    cliente (el mazo viaja solo como conteo): se muestra un reverso genérico.
//  - El logo de club es un hash determinístico de jugadorId (clubDeJugador.ts):
//    no hay acción de servidor para elegir club esta sesión.

import * as THREE from "three";
import { TABLERO_MONOPOLY } from "@juegos/monopoly-core";
import type { VistaMonopoly } from "@juegos/server/vistaJuego";
import type { ClubPool } from "@juegos/monopoly-fuente-datos/clubes";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";
import { Escena } from "../../escena/escena.js";
import type { OpcionesEscena } from "../../escena/escena.js";
import { Interpolador, easeInOut, easeOut } from "../../escena/interpolacion.js";
import type { ManejadorTween } from "../../escena/interpolacion.js";
import { SincronizadorPoses } from "../../escena/sincronizadorPoses.js";
import { MEDIO_LADO_TABLERO, offsetFichaEnCelda, posicionCelda } from "./tableroMonopoly.js";
import type { ObjetivoMonopoly, RevelacionActiva } from "./disposicionMonopoly.js";
import { calcularDisposicionMonopoly } from "./disposicionMonopoly.js";
import { crearOrigenMonopoly, detectarNuevaRevelacion } from "./difVistaMonopoly.js";
import {
  ALTO_FICHA,
  actualizarLogoFicha,
  actualizarValorDado,
  crearMallaCartaMiClub,
  crearMallaCelda,
  crearMallaDado,
  crearMallaFicha,
  crearMallaPrensa,
} from "./mallaMonopoly.js";
import { cargarCatalogoClubes } from "./catalogoClubes.js";
import { clubDeJugador } from "./clubDeJugador.js";
import { HudMonopoly } from "./hudMonopoly.js";

/** Estética del tablero: verde césped, sin las zonas clickeables de mazo/pozo de Carioca. */
const OPCIONES_ESCENA: OpcionesEscena = {
  fondo: "#0a1712",
  fieltro: "#1d5c3a",
  borde: "#123a25",
  luzAmbiente: { color: "#ffffff", intensidad: 0.95 },
  luzFocal: { color: "#fff4e0", intensidad: 1.3 },
  zonas: [],
};

const ALTURA_CELDA = 0.02;
const UMBRAL_PASO_A_PASO = 15;
const DURACION_PASO = 0.13;
const DURACION_ARCO = 0.55;
const ALTURA_ARCO = 1.2;
const DURACION_REVELACION_MS = 1600;

interface UltimaTiradaVista {
  readonly d1: number;
  readonly d2: number;
}

function igualTirada(a: UltimaTiradaVista | null, b: UltimaTiradaVista | null): boolean {
  if (a === null || b === null) return a === b;
  return a.d1 === b.d1 && a.d2 === b.d2;
}

export class JuegoMonopoly implements IJuego {
  private contexto: ContextoJuego | null = null;
  private escena: Escena | null = null;
  private interpolador: Interpolador | null = null;
  private sincronizador: SincronizadorPoses<ObjetivoMonopoly> | null = null;
  private hud: HudMonopoly | null = null;

  private grupoTablero: THREE.Group | null = null;
  private grupoFichas: THREE.Group | null = null;
  private grupoRevelacion: THREE.Group | null = null;
  private dado1: THREE.Mesh | null = null;
  private dado2: THREE.Mesh | null = null;

  private readonly fichas = new Map<string, THREE.Mesh>();
  private readonly tweenFicha = new Map<string, ManejadorTween>();

  private catalogo: readonly ClubPool[] = [];
  private vistaAnterior: VistaMonopoly | null = null;
  private ultimaTiradaVista: UltimaTiradaVista | null = null;
  private revelando: RevelacionActiva | null = null;
  private timerRevelacion: ReturnType<typeof setTimeout> | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.contexto = contexto;
    const escena = new Escena(contexto.contenedorEscena, OPCIONES_ESCENA);
    this.escena = escena;
    escena.camara.position.set(0, MEDIO_LADO_TABLERO * 1.9, MEDIO_LADO_TABLERO * 1.35);
    escena.camara.lookAt(0, 0, 0);
    escena.camara.updateProjectionMatrix();

    const grupoTablero = new THREE.Group();
    const grupoFichas = new THREE.Group();
    const grupoRevelacion = new THREE.Group();
    this.grupoTablero = grupoTablero;
    this.grupoFichas = grupoFichas;
    this.grupoRevelacion = grupoRevelacion;
    escena.escena.add(grupoTablero, grupoFichas, grupoRevelacion);

    for (const celda of TABLERO_MONOPOLY) {
      const malla = crearMallaCelda(celda);
      const pos = posicionCelda(celda.indice);
      malla.position.set(pos.x, ALTURA_CELDA, pos.z);
      grupoTablero.add(malla);
    }

    this.dado1 = crearMallaDado(1);
    this.dado2 = crearMallaDado(1);
    this.dado1.position.set(-0.3, ALTO_FICHA * 2, 0);
    this.dado2.position.set(0.3, ALTO_FICHA * 2, 0);
    escena.escena.add(this.dado1, this.dado2);

    const interpolador = new Interpolador();
    this.interpolador = interpolador;
    this.sincronizador = new SincronizadorPoses<ObjetivoMonopoly>(grupoRevelacion, interpolador, (o) =>
      o.tipo === "cartaMiClub" ? crearMallaCartaMiClub(o.carta) : crearMallaPrensa(),
    );

    this.hud = new HudMonopoly(contexto.contenedorHud, {
      alAccion: (accion) => this.contexto?.enviar(accion),
      alSalir: () => contexto.salirAlHub(),
      alReconectar: () => contexto.reconectar(),
    });

    escena.iniciar((dt) => interpolador.actualizar(dt));

    cargarCatalogoClubes()
      .then((catalogo) => {
        this.catalogo = catalogo;
        for (const [jugadorId, malla] of this.fichas) {
          actualizarLogoFicha(malla, clubDeJugador(catalogo, jugadorId));
        }
        if (this.vistaAnterior !== null) this.hud?.actualizar(this.vistaAnterior, catalogo);
      })
      .catch((error: unknown) => {
        console.error("Monopoly: no se pudo cargar el catálogo de clubes", error);
      });
  }

  sincronizarEstado(vista: VistaMonopoly): void {
    const anterior = this.vistaAnterior;
    if (anterior === null) {
      this.construirFichas(vista);
    } else {
      this.actualizarFichas(anterior, vista);
    }
    this.actualizarDados(vista);
    this.actualizarRevelacion(anterior, vista);
    this.hud?.actualizar(vista, this.catalogo);
    this.vistaAnterior = vista;
  }

  procesarAccion(senal: SenalJuego): void {
    this.hud?.mostrarAviso(senal.mensaje);
  }

  finalizar(): void {
    if (this.timerRevelacion !== null) clearTimeout(this.timerRevelacion);
    this.escena?.dispose();
    this.hud?.destruir();
    this.escena = null;
    this.interpolador = null;
    this.sincronizador = null;
    this.hud = null;
    this.contexto = null;
    this.grupoTablero = null;
    this.grupoFichas = null;
    this.grupoRevelacion = null;
    this.dado1 = null;
    this.dado2 = null;
    this.fichas.clear();
    this.tweenFicha.clear();
    this.catalogo = [];
    this.vistaAnterior = null;
    this.ultimaTiradaVista = null;
    this.revelando = null;
    this.timerRevelacion = null;
  }

  // ── Fichas ───────────────────────────────────────────────────────────────

  private posicionFichaObjetivo(vista: VistaMonopoly, jugadorId: string): { x: number; z: number } {
    const jugador = vista.jugadores.find((j) => j.id === jugadorId);
    if (jugador === undefined) return { x: 0, z: 0 };
    const companeros = vista.jugadores.filter((j) => j.posicion === jugador.posicion);
    const slot = Math.max(
      0,
      companeros.findIndex((j) => j.id === jugadorId),
    );
    const base = posicionCelda(jugador.posicion);
    const offset = offsetFichaEnCelda(slot, companeros.length);
    return { x: base.x + offset.x, z: base.z + offset.z };
  }

  private construirFichas(vista: VistaMonopoly): void {
    const grupo = this.grupoFichas;
    if (grupo === null) return;
    for (const jugador of vista.jugadores) {
      const club = clubDeJugador(this.catalogo, jugador.id);
      const malla = crearMallaFicha(club);
      const pos = this.posicionFichaObjetivo(vista, jugador.id);
      malla.position.set(pos.x, ALTO_FICHA / 2, pos.z);
      grupo.add(malla);
      this.fichas.set(jugador.id, malla);
    }
  }

  private actualizarFichas(anterior: VistaMonopoly, nueva: VistaMonopoly): void {
    const grupo = this.grupoFichas;
    if (grupo === null) return;
    for (const jugador of nueva.jugadores) {
      let malla = this.fichas.get(jugador.id);
      if (malla === undefined) {
        const club = clubDeJugador(this.catalogo, jugador.id);
        malla = crearMallaFicha(club);
        const pos = this.posicionFichaObjetivo(nueva, jugador.id);
        malla.position.set(pos.x, ALTO_FICHA / 2, pos.z);
        grupo.add(malla);
        this.fichas.set(jugador.id, malla);
        continue;
      }
      const previo = anterior.jugadores.find((j) => j.id === jugador.id);
      if (previo !== undefined && previo.posicion !== jugador.posicion) {
        this.animarFicha(jugador.id, previo.posicion, nueva);
      } else if (this.tweenFicha.get(jugador.id) === undefined) {
        // Sin cambio de celda: reajusta el offset si cambió cuántos comparten la celda.
        const destino = this.posicionFichaObjetivo(nueva, jugador.id);
        malla.position.x = destino.x;
        malla.position.z = destino.z;
      }
    }
  }

  /**
   * Anima el paso de `desdePos` a la posición actual del jugador en `vistaNueva`.
   * Heurística pragmática (no 100% fiel, ver difVistaMonopoly.ts): elige la
   * dirección más corta mod 40; si el salto es grande, un arco directo en vez
   * de recorrer celda por celda.
   */
  private animarFicha(jugadorId: string, desdePos: number, vistaNueva: VistaMonopoly): void {
    const malla = this.fichas.get(jugadorId);
    if (malla === undefined) return;
    this.tweenFicha.get(jugadorId)?.cancelar();
    const hastaPos = vistaNueva.jugadores.find((j) => j.id === jugadorId)?.posicion ?? desdePos;
    const destinoFinal = this.posicionFichaObjetivo(vistaNueva, jugadorId);
    const adelante = ((hastaPos - desdePos) % 40 + 40) % 40;
    const atras = 40 - adelante;
    if (adelante === 0) return;

    if (Math.min(adelante, atras) <= UMBRAL_PASO_A_PASO) {
      const paso = adelante <= atras ? 1 : -1;
      const pasos = adelante <= atras ? adelante : atras;
      this.animarPaso(jugadorId, malla, desdePos, paso, pasos, destinoFinal);
    } else {
      this.saltoArco(jugadorId, malla, destinoFinal);
    }
  }

  private animarPaso(
    jugadorId: string,
    malla: THREE.Mesh,
    posicionActual: number,
    paso: number,
    pasosRestantes: number,
    destinoFinal: { x: number; z: number },
  ): void {
    if (this.interpolador === null) return;
    if (pasosRestantes <= 0) {
      this.tweenFicha.delete(jugadorId);
      return;
    }
    const siguiente = ((posicionActual + paso) % 40 + 40) % 40;
    const esUltimo = pasosRestantes === 1;
    const destino = esUltimo ? destinoFinal : posicionCelda(siguiente);
    const desde = { x: malla.position.x, z: malla.position.z };
    const manejador = this.interpolador.agregar({
      duracion: DURACION_PASO,
      easing: easeOut,
      alAvanzar: (t) => {
        malla.position.x = desde.x + (destino.x - desde.x) * t;
        malla.position.z = desde.z + (destino.z - desde.z) * t;
      },
      alTerminar: () => this.animarPaso(jugadorId, malla, siguiente, paso, pasosRestantes - 1, destinoFinal),
    });
    this.tweenFicha.set(jugadorId, manejador);
  }

  private saltoArco(jugadorId: string, malla: THREE.Mesh, destino: { x: number; z: number }): void {
    if (this.interpolador === null) return;
    const desde = { x: malla.position.x, z: malla.position.z };
    const alturaBase = ALTO_FICHA / 2;
    const manejador = this.interpolador.agregar({
      duracion: DURACION_ARCO,
      easing: easeInOut,
      alAvanzar: (t) => {
        malla.position.x = desde.x + (destino.x - desde.x) * t;
        malla.position.z = desde.z + (destino.z - desde.z) * t;
        malla.position.y = alturaBase + Math.sin(t * Math.PI) * ALTURA_ARCO;
      },
      alTerminar: () => {
        malla.position.y = alturaBase;
        this.tweenFicha.delete(jugadorId);
      },
    });
    this.tweenFicha.set(jugadorId, manejador);
  }

  // ── Dados ────────────────────────────────────────────────────────────────

  private actualizarDados(vista: VistaMonopoly): void {
    const tirada = vista.ultimaTirada;
    if (tirada === null || this.dado1 === null || this.dado2 === null) return;
    if (igualTirada(this.ultimaTiradaVista, tirada)) return;
    this.ultimaTiradaVista = tirada;
    actualizarValorDado(this.dado1, tirada.d1);
    actualizarValorDado(this.dado2, tirada.d2);
    this.tumbar(this.dado1);
    this.tumbar(this.dado2);
  }

  private tumbar(malla: THREE.Mesh): void {
    if (this.interpolador === null) return;
    const inicio = { x: malla.rotation.x, z: malla.rotation.z };
    const vueltas = 0.6 + Math.random() * 0.4;
    const destinoX = inicio.x + Math.PI * 2 * vueltas;
    const destinoZ = inicio.z + Math.PI * 2 * vueltas;
    this.interpolador.agregar({
      duracion: 0.4,
      easing: easeOut,
      alAvanzar: (t) => {
        malla.rotation.x = inicio.x + (destinoX - inicio.x) * t;
        malla.rotation.z = inicio.z + (destinoZ - inicio.z) * t;
      },
    });
  }

  // ── Revelación (sobre / Prensa Deportiva) ───────────────────────────────

  private actualizarRevelacion(anterior: VistaMonopoly | null, nueva: VistaMonopoly): void {
    const nuevaRevelacion = detectarNuevaRevelacion(anterior, nueva);
    if (nuevaRevelacion !== null) {
      this.revelando = nuevaRevelacion;
      if (this.timerRevelacion !== null) clearTimeout(this.timerRevelacion);
      this.timerRevelacion = setTimeout(() => {
        this.revelando = null;
        this.timerRevelacion = null;
        this.aplicarRevelacion();
      }, DURACION_REVELACION_MS);
    }
    this.aplicarRevelacion();
  }

  private aplicarRevelacion(): void {
    const objetivos = calcularDisposicionMonopoly(this.revelando);
    this.sincronizador?.aplicar(objetivos, false, crearOrigenMonopoly());
  }
}
