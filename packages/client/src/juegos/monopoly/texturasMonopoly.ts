// Cartas de Mi Club: fondo/textos por canvas 2D (mismo patrón que
// escena/texturasCarta.ts), más la foto REAL del jugador/técnico compuesta
// encima. Las fotos se descargaron una vez a packages/client/public/datos/
// (jugadores/<jugadorId>.png, tecnicos/<id>.png — mismo motivo de CORS que
// texturasClubes.ts) y se cargan async: la carta se ve completa de inmediato
// con el layout base: dorado/degradado, y la foto se compone encima apenas
// carga (`textura.needsUpdate`). Si el jugador no tiene foto en el dataset
// (~15% de los 4200, HTTP 404 en la descarga), la carta se queda con el
// layout base — degradación silenciosa, no es un error de la partida.
// Los 3 fondos de carta reales del dataset (`imagenCartaUrl`) también se
// descargaron a packages/client/public/datos/cartasFondo/ pero no se usan
// todavía (candidata de pulido visual futuro: alinear texto sobre ese marco
// en vez del degradado propio requiere inspeccionar el asset primero).
// Placas de celda y caras de dado siguen siendo 100% canvas procedural.

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

/** Rectángulo donde se compone la foto (mismo lugar en jugador y técnico). */
const FOTO = { x: 38, y: 88, w: ANCHO_CARTA - 76, h: 172, r: 14 };

function dibujarMarcoFoto(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(FOTO.x, FOTO.y, FOTO.w, FOTO.h, FOTO.r);
  ctx.stroke();
  ctx.restore();
}

/** Compone `img` recortada ("cover") dentro del rectángulo de foto. */
function dibujarFoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(FOTO.x, FOTO.y, FOTO.w, FOTO.h, FOTO.r);
  ctx.clip();
  const escala = Math.max(FOTO.w / img.naturalWidth, FOTO.h / img.naturalHeight);
  const w = img.naturalWidth * escala;
  const h = img.naturalHeight * escala;
  ctx.drawImage(img, FOTO.x + (FOTO.w - w) / 2, FOTO.y + (FOTO.h - h) / 2, w, h);
  ctx.restore();
  dibujarMarcoFoto(ctx);
}

function dibujarBadgeRating(ctx: CanvasRenderingContext2D, rating: number, posicion: string): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 64, 68, 10);
  ctx.fill();
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "bold 30px Georgia, serif";
  ctx.fillText(String(rating), 40, 42);
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.fillText(posicion, 40, 64);
  ctx.restore();
}

function dibujarEtiquetaTecnico(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 90, 30, 8);
  ctx.fill();
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.fillText("TÉCNICO", 53, 28);
  ctx.restore();
}

function dibujarBandaNombre(
  ctx: CanvasRenderingContext2D,
  nombre: string,
  apellido: string,
  pieDePagina?: string,
): void {
  const y0 = ALTO_CARTA - 90;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, y0, ANCHO_CARTA, ALTO_CARTA - y0);
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText(nombre, ANCHO_CARTA / 2, y0 + 34);
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText(apellido, ANCHO_CARTA / 2, y0 + 66);
  if (pieDePagina !== undefined) {
    ctx.font = "18px Arial, sans-serif";
    ctx.fillText(pieDePagina, ANCHO_CARTA / 2, ALTO_CARTA - 8);
  }
  ctx.restore();
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
  dibujarMarcoFoto(ctx);
  dibujarBadgeRating(ctx, rating, posicion);
  dibujarBandaNombre(ctx, nombre, apellido, calidad === "Icon" ? "★ ICON ★" : undefined);
}

/** Técnicos: siempre fondo "dorado" (nota de diseño de SPIKE_DATOS_JUGADORES.md §8). */
function dibujarCartaTecnico(
  ctx: CanvasRenderingContext2D,
  nombre: string,
  apellido: string,
): void {
  fondoCarta(ctx, ORO, ORO_OSCURO);
  dibujarMarcoFoto(ctx);
  dibujarEtiquetaTecnico(ctx);
  dibujarBandaNombre(ctx, nombre, apellido);
}

/** Carga `/datos/<carpeta>/<id>.png` y compone la foto + reescribe texto encima; no-op si falla (404 esperado para ~15% del dataset). */
function componerFoto(
  textura: THREE.CanvasTexture,
  ctx: CanvasRenderingContext2D,
  carpeta: "jugadores" | "tecnicos",
  id: string,
  redibujarTexto: () => void,
): void {
  const img = new Image();
  img.onload = () => {
    dibujarFoto(ctx, img);
    redibujarTexto();
    textura.needsUpdate = true;
  };
  img.onerror = () => {
    // Sin foto en el dataset para este id: la carta se queda con el layout base.
  };
  img.src = `/datos/${carpeta}/${id}.png`;
}

const cacheCartas = new Map<string, THREE.CanvasTexture>();

/** Cara de una carta de Mi Club (jugador o técnico), cacheada por su id. */
export function texturaCartaMiClub(carta: CartaMiClub): THREE.CanvasTexture {
  const existente = cacheCartas.get(carta.id);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo(ANCHO_CARTA, ALTO_CARTA);
  const textura = aTextura(ctx);
  if (carta.tipo === "jugador") {
    const { nombre, apellido, rating, posicion, calidad, jugadorId } = carta.jugador;
    dibujarCartaJugador(ctx, nombre, apellido, rating, posicion, calidad);
    componerFoto(textura, ctx, "jugadores", jugadorId, () => {
      dibujarBadgeRating(ctx, rating, posicion);
      dibujarBandaNombre(ctx, nombre, apellido, calidad === "Icon" ? "★ ICON ★" : undefined);
    });
  } else {
    const { nombre, apellido, id } = carta.tecnico;
    dibujarCartaTecnico(ctx, nombre, apellido);
    componerFoto(textura, ctx, "tecnicos", id, () => {
      dibujarEtiquetaTecnico(ctx);
      dibujarBandaNombre(ctx, nombre, apellido);
    });
  }
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
