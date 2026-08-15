// Texturas generadas 100% por canvas 2D (sin assets externos), mismo patrón que
// escena/texturasCarta.ts: cartas de Mi Club (jugador/técnico), placas de celda
// y caras de dado. No hay imágenes reales de jugador/técnico en el dataset que
// llega al cliente (deliberado, ver SPIKE_DATOS_JUGADORES.md sobre no republicar
// assets de EA) — los logos de club SÍ son reales, ver texturasClubes.ts aparte.

import * as THREE from "three";
import type { CartaMiClub } from "@juegos/monopoly-core";
import type { CeldaTablero } from "@juegos/monopoly-core";
import { colorDeCelda, etiquetaDeCelda } from "./ligaColores.js";

const ANCHO_CARTA = 256;
const ALTO_CARTA = 358;
const RADIO_ESQUINA = 18;

const ORO = "#d4af37";
const ORO_OSCURO = "#8a6d1f";
const AZUL_RARE = "#3f6f99";
const AZUL_RARE_OSCURO = "#274b6d";
const GRIS_BASE = "#6b7280";
const GRIS_BASE_OSCURO = "#3f4550";

function crearLienzo(ancho: number, alto: number): CanvasRenderingContext2D {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const contexto = lienzo.getContext("2d");
  if (contexto === null) throw new Error("no se pudo crear el contexto 2D");
  return contexto;
}

function aTextura(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const textura = new THREE.CanvasTexture(ctx.canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

function degradado(
  ctx: CanvasRenderingContext2D,
  claro: string,
  oscuro: string,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, ALTO_CARTA);
  g.addColorStop(0, claro);
  g.addColorStop(1, oscuro);
  return g;
}

/** Fondo de carta según calidad: Icon → dorado, Rare → azul, resto → gris neutro. */
function coloresPorCalidad(calidad: string): readonly [string, string] {
  if (calidad === "Icon") return [ORO, ORO_OSCURO];
  if (calidad === "Rare") return [AZUL_RARE, AZUL_RARE_OSCURO];
  return [GRIS_BASE, GRIS_BASE_OSCURO];
}

function fondoCarta(ctx: CanvasRenderingContext2D, claro: string, oscuro: string): void {
  ctx.fillStyle = degradado(ctx, claro, oscuro);
  ctx.beginPath();
  ctx.roundRect(0, 0, ANCHO_CARTA, ALTO_CARTA, RADIO_ESQUINA);
  ctx.fill();
  ctx.strokeStyle = "#fbf9f4";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(2, 2, ANCHO_CARTA - 4, ALTO_CARTA - 4, RADIO_ESQUINA);
  ctx.stroke();
}

function dibujarCartaJugador(
  ctx: CanvasRenderingContext2D,
  nombre: string,
  apellido: string,
  rating: number,
  posicion: string,
  calidad: string,
): void {
  const [claro, oscuro] = coloresPorCalidad(calidad);
  fondoCarta(ctx, claro, oscuro);
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "bold 56px Georgia, serif";
  ctx.fillText(String(rating), ANCHO_CARTA / 2, 76);
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText(posicion, ANCHO_CARTA / 2, 112);
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText(nombre, ANCHO_CARTA / 2, ALTO_CARTA - 90);
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillText(apellido, ANCHO_CARTA / 2, ALTO_CARTA - 56);
  if (calidad === "Icon") {
    ctx.font = "22px Arial, sans-serif";
    ctx.fillText("★ ICON ★", ANCHO_CARTA / 2, ALTO_CARTA - 24);
  }
}

/** Técnicos: siempre fondo "dorado" (nota de diseño de SPIKE_DATOS_JUGADORES.md §8). */
function dibujarCartaTecnico(
  ctx: CanvasRenderingContext2D,
  nombre: string,
  apellido: string,
): void {
  fondoCarta(ctx, ORO, ORO_OSCURO);
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "bold 24px Arial, sans-serif";
  ctx.fillText("TÉCNICO", ANCHO_CARTA / 2, 90);
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText(nombre, ANCHO_CARTA / 2, ALTO_CARTA / 2);
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillText(apellido, ANCHO_CARTA / 2, ALTO_CARTA / 2 + 36);
}

const cacheCartas = new Map<string, THREE.CanvasTexture>();

/** Cara de una carta de Mi Club (jugador o técnico), cacheada por su id. */
export function texturaCartaMiClub(carta: CartaMiClub): THREE.CanvasTexture {
  const existente = cacheCartas.get(carta.id);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo(ANCHO_CARTA, ALTO_CARTA);
  if (carta.tipo === "jugador") {
    dibujarCartaJugador(
      ctx,
      carta.jugador.nombre,
      carta.jugador.apellido,
      carta.jugador.rating,
      carta.jugador.posicion,
      carta.jugador.calidad,
    );
  } else {
    dibujarCartaTecnico(ctx, carta.tecnico.nombre, carta.tecnico.apellido);
  }
  const textura = aTextura(ctx);
  cacheCartas.set(carta.id, textura);
  return textura;
}

let cacheSobre: THREE.CanvasTexture | null = null;

/** Cara cerrada del sobre (antes de abrirlo). */
export function texturaSobre(): THREE.CanvasTexture {
  if (cacheSobre !== null) return cacheSobre;
  const ctx = crearLienzo(ANCHO_CARTA, ALTO_CARTA);
  ctx.fillStyle = degradado(ctx, "#274b6d", "#16283a");
  ctx.beginPath();
  ctx.roundRect(0, 0, ANCHO_CARTA, ALTO_CARTA, RADIO_ESQUINA);
  ctx.fill();
  ctx.strokeStyle = "#fbf9f4";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(2, 2, ANCHO_CARTA - 4, ALTO_CARTA - 4, RADIO_ESQUINA);
  ctx.stroke();
  // Solapa del sobre.
  ctx.beginPath();
  ctx.moveTo(16, 16);
  ctx.lineTo(ANCHO_CARTA / 2, ALTO_CARTA * 0.42);
  ctx.lineTo(ANCHO_CARTA - 16, 16);
  ctx.stroke();
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText("SOBRE", ANCHO_CARTA / 2, ALTO_CARTA - 40);
  cacheSobre = aTextura(ctx);
  return cacheSobre;
}

const ANCHO_CELDA = 220;
const ALTO_CELDA = 150;
const cacheCeldas = new Map<number, THREE.CanvasTexture>();

/** Placa de una celda del tablero: color de fondo + etiqueta, cacheada por índice. */
export function texturaCelda(celda: CeldaTablero): THREE.CanvasTexture {
  const existente = cacheCeldas.get(celda.indice);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo(ANCHO_CELDA, ALTO_CELDA);
  ctx.fillStyle = colorDeCelda(celda);
  ctx.fillRect(0, 0, ANCHO_CELDA, ALTO_CELDA);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, ANCHO_CELDA - 3, ALTO_CELDA - 3);
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 20px Arial, sans-serif";
  const lineas = etiquetaDeCelda(celda).split("\n");
  const inicioY = ALTO_CELDA / 2 - ((lineas.length - 1) * 24) / 2;
  lineas.forEach((linea, i) => ctx.fillText(linea, ANCHO_CELDA / 2, inicioY + i * 24));
  const textura = aTextura(ctx);
  cacheCeldas.set(celda.indice, textura);
  return textura;
}

let cachePrensa: THREE.CanvasTexture | null = null;

/**
 * Reverso genérico de "se robó una carta de Prensa Deportiva": el mazo viaja
 * en la vista solo como conteo (orden oculto, ver vistaMonopoly.ts), así que
 * el cliente no conoce el contenido real de la carta robada — solo que se
 * robó una. Simplificación deliberada de esta sesión (sin tocar el servidor
 * más allá del `ultimaTirada` ya aprobado).
 */
export function texturaPrensa(): THREE.CanvasTexture {
  if (cachePrensa !== null) return cachePrensa;
  const ctx = crearLienzo(ANCHO_CARTA, ALTO_CARTA);
  fondoCarta(ctx, "#8a4ac0", "#4a2470");
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "48px Arial, sans-serif";
  ctx.fillText("📰", ANCHO_CARTA / 2, ALTO_CARTA / 2 - 20);
  ctx.font = "bold 24px Arial, sans-serif";
  ctx.fillText("PRENSA", ANCHO_CARTA / 2, ALTO_CARTA / 2 + 40);
  ctx.fillText("DEPORTIVA", ANCHO_CARTA / 2, ALTO_CARTA / 2 + 72);
  cachePrensa = aTextura(ctx);
  return cachePrensa;
}

const TAMANO_DADO = 128;
const cacheDados = new Map<number, THREE.CanvasTexture>();

const PIPS_POR_VALOR: Readonly<Record<number, readonly [number, number][]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.28, 0.28],
    [0.5, 0.5],
    [0.72, 0.72],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.5, 0.5],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  6: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
};

/** Cara de dado con los pips de `valor` (1..6), cacheada por valor. */
export function texturaDado(valor: number): THREE.CanvasTexture {
  const existente = cacheDados.get(valor);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo(TAMANO_DADO, TAMANO_DADO);
  ctx.fillStyle = "#fbf9f4";
  ctx.beginPath();
  ctx.roundRect(0, 0, TAMANO_DADO, TAMANO_DADO, 14);
  ctx.fill();
  ctx.strokeStyle = "#c9c4ba";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, TAMANO_DADO - 4, TAMANO_DADO - 4, 14);
  ctx.stroke();
  ctx.fillStyle = "#22272e";
  const pips = PIPS_POR_VALOR[valor] ?? PIPS_POR_VALOR[1]!;
  for (const [px, py] of pips) {
    ctx.beginPath();
    ctx.arc(px * TAMANO_DADO, py * TAMANO_DADO, TAMANO_DADO * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  const textura = aTextura(ctx);
  cacheDados.set(valor, textura);
  return textura;
}
