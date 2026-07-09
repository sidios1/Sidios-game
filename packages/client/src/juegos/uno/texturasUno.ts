// Caras de carta de UNO generadas 100% por código (canvas 2D, sin assets): fondo
// del color saturado, óvalo blanco central (firma visual de UNO), número o símbolo
// de acción (skip, reverse, +2) y los comodines (wild = molinete de 4 colores,
// +4 = molinete + "+4"). Misma técnica que escena/texturasCarta.ts (Carioca), pero
// con la identidad propia de UNO. Texturas cacheadas por id de carta.

import * as THREE from "three";
import type { CartaUno, ColorUno } from "@juegos/server/vistaJuego";

const ANCHO = 256;
const ALTO = 358;
const RADIO_ESQUINA = 20;

/** Paleta saturada de los cuatro colores de UNO. */
export const COLOR_HEX: Readonly<Record<ColorUno, string>> = {
  rojo: "#e2231a",
  amarillo: "#f4b400",
  verde: "#2aa844",
  azul: "#1d6fd6",
};

const NEGRO = "#16181d";
const BLANCO = "#fbf9f4";

function crearLienzo(): CanvasRenderingContext2D {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const contexto = lienzo.getContext("2d");
  if (contexto === null) {
    throw new Error("no se pudo crear el contexto 2D para las cartas de UNO");
  }
  return contexto;
}

function rectRedondeado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  radio: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, radio);
}

/** Fondo de color saturado + borde blanco grueso (marco de UNO). */
function fondo(ctx: CanvasRenderingContext2D, color: string): void {
  rectRedondeado(ctx, 0, 0, ANCHO, ALTO, RADIO_ESQUINA);
  ctx.fillStyle = color;
  ctx.fill();
  rectRedondeado(ctx, 8, 8, ANCHO - 16, ALTO - 16, RADIO_ESQUINA - 4);
  ctx.lineWidth = 12;
  ctx.strokeStyle = BLANCO;
  ctx.stroke();
}

/** Óvalo blanco inclinado en el centro: la firma visual de las cartas de UNO. */
function ovaloCentral(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(ANCHO / 2, ALTO / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.beginPath();
  ctx.ellipse(0, 0, ANCHO * 0.34, ALTO * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = BLANCO;
  ctx.fill();
  ctx.restore();
}

/** Texto central grande con contorno (legible sobre el óvalo). */
function glifoCentral(ctx: CanvasRenderingContext2D, texto: string, color: string, px: number): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${px}px Arial, sans-serif`;
  ctx.lineWidth = px * 0.12;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.fillText(texto, ANCHO / 2, ALTO / 2 + 6);
  ctx.restore();
}

/** Etiquetas pequeñas en las dos esquinas opuestas (blanco sobre el color). */
function esquinas(ctx: CanvasRenderingContext2D, texto: string): void {
  const dibujar = (rotada: boolean): void => {
    ctx.save();
    if (rotada) {
      ctx.translate(ANCHO, ALTO);
      ctx.rotate(Math.PI);
    }
    ctx.fillStyle = BLANCO;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 40px Arial, sans-serif";
    ctx.fillText(texto, 38, 46);
    ctx.restore();
  };
  dibujar(false);
  dibujar(true);
}

/** Círculo con barra diagonal = Skip (prohibido). */
function dibujarSkip(ctx: CanvasRenderingContext2D, color: string): void {
  const cx = ANCHO / 2;
  const cy = ALTO / 2 + 4;
  const r = 56;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.72, cy - r * 0.72);
  ctx.lineTo(cx + r * 0.72, cy + r * 0.72);
  ctx.stroke();
  ctx.restore();
}

/** Dos flechas opuestas = Reverse (cambia el sentido). */
function dibujarReverse(ctx: CanvasRenderingContext2D, color: string): void {
  const cx = ANCHO / 2;
  const cy = ALTO / 2 + 4;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  const flecha = (sentido: 1 | -1): void => {
    const dx = 46 * sentido;
    const off = 22 * sentido;
    ctx.beginPath();
    ctx.moveTo(cx - dx + off, cy - 26 * sentido);
    ctx.lineTo(cx + dx + off, cy - 26 * sentido);
    ctx.stroke();
    // punta
    ctx.beginPath();
    ctx.moveTo(cx + dx + off, cy - 26 * sentido);
    ctx.lineTo(cx + dx - 20 * sentido + off, cy - 44 * sentido);
    ctx.lineTo(cx + dx - 20 * sentido + off, cy - 8 * sentido);
    ctx.closePath();
    ctx.fill();
  };
  flecha(1);
  flecha(-1);
  ctx.restore();
}

/** Molinete de los cuatro colores (centro de los comodines). */
function molinete(ctx: CanvasRenderingContext2D, r: number): void {
  const cx = ANCHO / 2;
  const cy = ALTO / 2 + 4;
  const cuartos: readonly ColorUno[] = ["rojo", "amarillo", "verde", "azul"];
  cuartos.forEach((c, i) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
    ctx.closePath();
    ctx.fillStyle = COLOR_HEX[c];
    ctx.fill();
  });
}

function aTextura(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const textura = new THREE.CanvasTexture(ctx.canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

function dibujarCara(ctx: CanvasRenderingContext2D, carta: CartaUno): void {
  switch (carta.tipo) {
    case "wild":
      fondo(ctx, NEGRO);
      ovaloCentral(ctx);
      molinete(ctx, 70);
      esquinas(ctx, "★");
      return;
    case "mas4":
      fondo(ctx, NEGRO);
      ovaloCentral(ctx);
      molinete(ctx, 58);
      glifoCentral(ctx, "+4", BLANCO, 92);
      esquinas(ctx, "+4");
      return;
    case "numero": {
      const color = COLOR_HEX[carta.color];
      fondo(ctx, color);
      ovaloCentral(ctx);
      glifoCentral(ctx, String(carta.valor), color, 200);
      esquinas(ctx, String(carta.valor));
      return;
    }
    case "skip": {
      const color = COLOR_HEX[carta.color];
      fondo(ctx, color);
      ovaloCentral(ctx);
      dibujarSkip(ctx, color);
      esquinas(ctx, "Ø");
      return;
    }
    case "reverse": {
      const color = COLOR_HEX[carta.color];
      fondo(ctx, color);
      ovaloCentral(ctx);
      dibujarReverse(ctx, color);
      esquinas(ctx, "⇄");
      return;
    }
    case "mas2": {
      const color = COLOR_HEX[carta.color];
      fondo(ctx, color);
      ovaloCentral(ctx);
      glifoCentral(ctx, "+2", color, 120);
      esquinas(ctx, "+2");
      return;
    }
  }
}

function dibujarDorso(ctx: CanvasRenderingContext2D): void {
  fondo(ctx, NEGRO);
  ctx.save();
  ctx.translate(ANCHO / 2, ALTO / 2);
  ctx.rotate(-Math.PI / 5);
  ctx.beginPath();
  ctx.ellipse(0, 0, ANCHO * 0.36, ALTO * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_HEX.rojo;
  ctx.fill();
  ctx.fillStyle = BLANCO;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 88px Arial, sans-serif";
  ctx.fillText("UNO", 0, 4);
  ctx.restore();
}

const cacheCaras = new Map<string, THREE.CanvasTexture>();
let cacheDorso: THREE.CanvasTexture | null = null;

export function texturaCaraUno(carta: CartaUno): THREE.CanvasTexture {
  const existente = cacheCaras.get(carta.id);
  if (existente !== undefined) return existente;
  const ctx = crearLienzo();
  dibujarCara(ctx, carta);
  const textura = aTextura(ctx);
  cacheCaras.set(carta.id, textura);
  return textura;
}

export function texturaDorsoUno(): THREE.CanvasTexture {
  if (cacheDorso !== null) return cacheDorso;
  const ctx = crearLienzo();
  dibujarDorso(ctx);
  cacheDorso = aTextura(ctx);
  return cacheDorso;
}
