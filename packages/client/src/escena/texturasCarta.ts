// Caras de carta generadas 100% por código con canvas 2D (sin assets
// externos): índice + pinta en las esquinas, símbolo grande al centro,
// y un dorso con trama geométrica. Texturas cacheadas por id de carta.

import * as THREE from "three";
import type { Carta, Pinta, ValorCarta } from "@juegos/carioca-core";

const ANCHO = 256;
const ALTO = 358;
const RADIO_ESQUINA = 18;

const ROJO = "#b3303a";
const NEGRO = "#22272e";
const AZUL_DORSO = "#274b6d";

const SIMBOLOS: Readonly<Record<Pinta, string>> = {
  corazones: "♥",
  diamantes: "♦",
  treboles: "♣",
  picas: "♠",
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

function colorDePinta(pinta: Pinta): string {
  return pinta === "corazones" || pinta === "diamantes" ? ROJO : NEGRO;
}

function crearLienzo(): CanvasRenderingContext2D {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const contexto = lienzo.getContext("2d");
  if (contexto === null) {
    throw new Error("no se pudo crear el contexto 2D para las cartas");
  }
  return contexto;
}

function fondoBlanco(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fbf9f4";
  ctx.beginPath();
  ctx.roundRect(0, 0, ANCHO, ALTO, RADIO_ESQUINA);
  ctx.fill();
  ctx.strokeStyle = "#c9c4ba";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(2, 2, ANCHO - 4, ALTO - 4, RADIO_ESQUINA);
  ctx.stroke();
}

function dibujarEsquina(
  ctx: CanvasRenderingContext2D,
  etiqueta: string,
  simbolo: string,
  color: string,
  rotada: boolean,
): void {
  ctx.save();
  if (rotada) {
    ctx.translate(ANCHO, ALTO);
    ctx.rotate(Math.PI);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px Georgia, serif";
  ctx.fillText(etiqueta, 34, 40);
  ctx.font = "36px Georgia, serif";
  ctx.fillText(simbolo, 34, 82);
  ctx.restore();
}

function dibujarCaraNormal(
  ctx: CanvasRenderingContext2D,
  pinta: Pinta,
  valor: ValorCarta,
): void {
  fondoBlanco(ctx);
  const color = colorDePinta(pinta);
  const simbolo = SIMBOLOS[pinta];
  const etiqueta = ETIQUETAS[valor];
  dibujarEsquina(ctx, etiqueta, simbolo, color, false);
  dibujarEsquina(ctx, etiqueta, simbolo, color, true);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "150px Georgia, serif";
  ctx.fillText(simbolo, ANCHO / 2, ALTO / 2 + 8);
}

function dibujarCaraComodin(ctx: CanvasRenderingContext2D): void {
  fondoBlanco(ctx);
  ctx.fillStyle = ROJO;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "120px Georgia, serif";
  ctx.fillText("★", ANCHO / 2, ALTO / 2 - 30);
  ctx.font = "bold 34px Georgia, serif";
  ctx.fillText("COMODÍN", ANCHO / 2, ALTO / 2 + 70);
  ctx.font = "bold 30px Georgia, serif";
  ctx.fillText("★", 34, 44);
  ctx.save();
  ctx.translate(ANCHO, ALTO);
  ctx.rotate(Math.PI);
  ctx.fillText("★", 34, 44);
  ctx.restore();
}

/**
 * Comodín-de-pinta (Rumble/GUASON): comodín restringido a una pinta, así que se
 * dibuja con el ★ del comodín PERO en el color de su pinta y con el glifo al lado,
 * para que no se confunda con el comodín libre. Concuerda con el `★♠` que muestran
 * el tooltip y el HUD (hud/formatoCarta.ts).
 */
function dibujarCaraComodinPinta(ctx: CanvasRenderingContext2D, pinta: Pinta): void {
  fondoBlanco(ctx);
  const color = colorDePinta(pinta);
  const simbolo = SIMBOLOS[pinta];
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "110px Georgia, serif";
  ctx.fillText("★", ANCHO / 2, ALTO / 2 - 40);
  ctx.font = "72px Georgia, serif";
  ctx.fillText(simbolo, ANCHO / 2, ALTO / 2 + 42);
  ctx.font = "bold 26px Georgia, serif";
  ctx.fillText("COMODÍN", ANCHO / 2, ALTO / 2 + 108);
  // Esquinas: ★ sobre el glifo de la pinta, en ambas orientaciones.
  dibujarEsquina(ctx, "★", simbolo, color, false);
  dibujarEsquina(ctx, "★", simbolo, color, true);
}

function dibujarDorso(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fbf9f4";
  ctx.beginPath();
  ctx.roundRect(0, 0, ANCHO, ALTO, RADIO_ESQUINA);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(10, 10, ANCHO - 20, ALTO - 20, RADIO_ESQUINA - 6);
  ctx.clip();
  ctx.fillStyle = AZUL_DORSO;
  ctx.fillRect(10, 10, ANCHO - 20, ALTO - 20);
  // Trama de rombos generada por código.
  ctx.strokeStyle = "#3f6f99";
  ctx.lineWidth = 3;
  const paso = 28;
  for (let d = -ALTO; d < ANCHO + ALTO; d += paso) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + ALTO, ALTO);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d, ALTO);
    ctx.lineTo(d + ALTO, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function aTextura(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const textura = new THREE.CanvasTexture(ctx.canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

const cacheCaras = new Map<string, THREE.CanvasTexture>();
let cacheDorso: THREE.CanvasTexture | null = null;

export function texturaCara(carta: Carta): THREE.CanvasTexture {
  const existente = cacheCaras.get(carta.id);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo();
  if (carta.tipo === "comodin") {
    dibujarCaraComodin(ctx);
  } else if (carta.tipo === "comodinPinta") {
    dibujarCaraComodinPinta(ctx, carta.pinta);
  } else {
    dibujarCaraNormal(ctx, carta.pinta, carta.valor);
  }
  const textura = aTextura(ctx);
  cacheCaras.set(carta.id, textura);
  return textura;
}

export function texturaDorso(): THREE.CanvasTexture {
  if (cacheDorso !== null) return cacheDorso;
  const ctx = crearLienzo();
  dibujarDorso(ctx);
  cacheDorso = aTextura(ctx);
  return cacheDorso;
}
