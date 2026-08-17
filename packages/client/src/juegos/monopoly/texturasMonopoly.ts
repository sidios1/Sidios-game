// Cartas de Mi Club: marco REAL del dataset (packages/client/public/datos/cartasFondo/,
// 3 variantes: Icon mármol+dorado, Rare oro ≥75, Rare plata <75 — el corte de
// rating es exacto en el dataset real, sin overlap, así que se deriva de
// calidad+rating sin tocar el pipeline de datos) + la foto REAL del
// jugador/técnico (packages/client/public/datos/{jugadores,tecnicos}/) compuestas
// encima del degradado propio. Todo carga async — mismo motivo de CORS que
// texturasClubes.ts — así que la carta se ve completa de inmediato con el
// degradado de respaldo y se repinta cada vez que el marco o la foto
// terminan de cargar (`textura.needsUpdate`), en cualquier orden. Si el
// jugador no tiene foto en el dataset (~15% de los 4200, HTTP 404 en la
// descarga), la carta se queda con el marco real pero sin foto —
// degradación silenciosa, no es un error de la partida.
// Las placas de celda de tipo "liga" también componen el escudo real de la
// liga (logosLiga.ts, Wikimedia Commons) como marca de agua detrás del
// texto; el resto de las celdas y los dados siguen siendo 100% procedural.

import * as THREE from "three";
import type { CartaMiClub } from "@juegos/monopoly-core";
import type { CeldaTablero } from "@juegos/monopoly-core";
import { colorDeCelda, etiquetaDeCelda } from "./ligaColores.js";
import { rutaLogoLiga } from "./logosLiga.js";

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

/** Marco de carta real (dataset), 75 = corte exacto observado en el dataset (§oro/plata, sin overlap). */
const MARCO_ICON = "/datos/cartasFondo/cards_bg_e_1_12_0.png";
const MARCO_RARE_ORO = "/datos/cartasFondo/cards_bg_e_0_0_3.png";
const MARCO_RARE_PLATA = "/datos/cartasFondo/cards_bg_e_0_0_2.png";
const RATING_CORTE_ORO = 75;

function rutaMarcoJugador(calidad: string, rating: number): string {
  if (calidad === "Icon") return MARCO_ICON;
  return rating >= RATING_CORTE_ORO ? MARCO_RARE_ORO : MARCO_RARE_PLATA;
}

/** Técnicos no tienen calidad/rating propios: siempre el marco dorado (SPIKE_DATOS_JUGADORES.md §8). */
const RUTA_MARCO_TECNICO = MARCO_RARE_ORO;

/** Fondo con el marco real, estirado al tamaño de la carta sobre una base sólida (por si el PNG tiene bordes transparentes). */
function dibujarMarcoReal(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  ctx.clearRect(0, 0, ANCHO_CARTA, ALTO_CARTA);
  ctx.fillStyle = "#16283a";
  ctx.beginPath();
  ctx.roundRect(0, 0, ANCHO_CARTA, ALTO_CARTA, RADIO_ESQUINA);
  ctx.fill();
  ctx.drawImage(img, 0, 0, ANCHO_CARTA, ALTO_CARTA);
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

/** Carga `url`; llama `alCargar` si resuelve, o `alFallar` si no (404/red). */
function cargarImagen(url: string, alCargar: (img: HTMLImageElement) => void, alFallar?: () => void): void {
  const img = new Image();
  img.onload = () => alCargar(img);
  img.onerror = () => alFallar?.();
  img.src = url;
}

const cacheImagenes = new Map<string, HTMLImageElement>();

/**
 * Como `cargarImagen`, pero cacheada por url: si ya se cargó antes, llama
 * `alCargar` de inmediato (sync). Los 3 marcos de carta (Icon/Rare-oro/
 * Rare-plata) son un set fijo y chico que conviene precargar así — la
 * revelación de sobre en 3D dura ~2s (ver DURACION_REVELACION_MS en
 * juegoMonopoly.ts) y una carga async desde cero no siempre llega a tiempo
 * antes de que la malla desaparezca; con el marco ya en caché, se compone
 * en el primer repintado de cada carta nueva.
 */
function cargarImagenCacheada(url: string, alCargar: (img: HTMLImageElement) => void): void {
  const existente = cacheImagenes.get(url);
  if (existente !== undefined) {
    alCargar(existente);
    return;
  }
  cargarImagen(url, (img) => {
    cacheImagenes.set(url, img);
    alCargar(img);
  });
}

/** Precarga los 3 marcos de carta reales; llamar una vez al arrancar el juego. */
export function precargarMarcosCarta(): void {
  for (const url of [MARCO_ICON, MARCO_RARE_ORO, MARCO_RARE_PLATA]) {
    cargarImagenCacheada(url, () => undefined);
  }
}

/**
 * Repinta una carta de Mi Club desde cero, en el orden fijo fondo→marco→foto→texto,
 * usando lo que ya haya cargado de `marco`/`foto` (cualquiera de los dos puede
 * llegar primero, o nunca si el fetch falla — degradación silenciosa).
 */
function repintarCarta(
  ctx: CanvasRenderingContext2D,
  claro: string,
  oscuro: string,
  marco: HTMLImageElement | null,
  foto: HTMLImageElement | null,
  dibujarTexto: () => void,
): void {
  if (marco !== null) {
    dibujarMarcoReal(ctx, marco);
  } else {
    fondoCarta(ctx, claro, oscuro);
    dibujarMarcoFoto(ctx);
  }
  if (foto !== null) dibujarFoto(ctx, foto);
  dibujarTexto();
}

const cacheCartas = new Map<string, THREE.CanvasTexture>();

/** Cara de una carta de Mi Club (jugador o técnico), cacheada por su id. */
export function texturaCartaMiClub(carta: CartaMiClub): THREE.CanvasTexture {
  const existente = cacheCartas.get(carta.id);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo(ANCHO_CARTA, ALTO_CARTA);
  const textura = aTextura(ctx);

  let marco: HTMLImageElement | null = null;
  let foto: HTMLImageElement | null = null;

  if (carta.tipo === "jugador") {
    const { nombre, apellido, rating, posicion, calidad, jugadorId } = carta.jugador;
    const [claro, oscuro] = coloresPorCalidad(calidad);
    const dibujarTexto = (): void => {
      dibujarBadgeRating(ctx, rating, posicion);
      dibujarBandaNombre(ctx, nombre, apellido, calidad === "Icon" ? "★ ICON ★" : undefined);
    };
    const repintar = (): void => {
      repintarCarta(ctx, claro, oscuro, marco, foto, dibujarTexto);
      textura.needsUpdate = true;
    };
    repintar();
    cargarImagenCacheada(rutaMarcoJugador(calidad, rating), (img) => {
      marco = img;
      repintar();
    });
    cargarImagen(`/datos/jugadores/${jugadorId}.png`, (img) => {
      foto = img;
      repintar();
    });
  } else {
    const { nombre, apellido, id } = carta.tecnico;
    const dibujarTexto = (): void => {
      dibujarEtiquetaTecnico(ctx);
      dibujarBandaNombre(ctx, nombre, apellido);
    };
    const repintar = (): void => {
      repintarCarta(ctx, ORO, ORO_OSCURO, marco, foto, dibujarTexto);
      textura.needsUpdate = true;
    };
    repintar();
    cargarImagenCacheada(RUTA_MARCO_TECNICO, (img) => {
      marco = img;
      repintar();
    });
    cargarImagen(`/datos/tecnicos/${id}.png`, (img) => {
      foto = img;
      repintar();
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

function dibujarFondoCelda(ctx: CanvasRenderingContext2D, celda: CeldaTablero): void {
  ctx.fillStyle = colorDeCelda(celda);
  ctx.fillRect(0, 0, ANCHO_CELDA, ALTO_CELDA);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, ANCHO_CELDA - 3, ALTO_CELDA - 3);
}

function dibujarTextoCelda(ctx: CanvasRenderingContext2D, celda: CeldaTablero): void {
  ctx.fillStyle = "#fbf9f4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 20px Arial, sans-serif";
  const lineas = etiquetaDeCelda(celda).split("\n");
  const inicioY = ALTO_CELDA / 2 - ((lineas.length - 1) * 24) / 2;
  lineas.forEach((linea, i) => ctx.fillText(linea, ANCHO_CELDA / 2, inicioY + i * 24));
}

/** Escudo de la liga como marca de agua semitransparente, centrado ("contain": nunca se recorta). */
function dibujarLogoLiga(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  const margen = 14;
  const escala = Math.min(
    (ANCHO_CELDA - margen * 2) / img.naturalWidth,
    (ALTO_CELDA - margen * 2) / img.naturalHeight,
  );
  const w = img.naturalWidth * escala;
  const h = img.naturalHeight * escala;
  ctx.drawImage(img, (ANCHO_CELDA - w) / 2, (ALTO_CELDA - h) / 2, w, h);
  ctx.restore();
}

/** Placa de una celda del tablero: color de fondo + etiqueta (+ escudo real si es de liga), cacheada por índice. */
export function texturaCelda(celda: CeldaTablero): THREE.CanvasTexture {
  const existente = cacheCeldas.get(celda.indice);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo(ANCHO_CELDA, ALTO_CELDA);
  dibujarFondoCelda(ctx, celda);
  dibujarTextoCelda(ctx, celda);
  const textura = aTextura(ctx);
  if (celda.tipo === "liga") {
    cargarImagenCacheada(rutaLogoLiga(celda.liga), (img) => {
      dibujarFondoCelda(ctx, celda);
      dibujarLogoLiga(ctx, img);
      dibujarTextoCelda(ctx, celda);
      textura.needsUpdate = true;
    });
  }
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
