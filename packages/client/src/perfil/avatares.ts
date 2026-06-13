// Pool de avatares generado 100% por código (canvas 2D), sin assets externos.
// Híbrido: los ids "emblema-*" pintan un emblema geométrico nítido sobre un
// fondo de color; cualquier otro id (los "identicon-*" y fallbacks) pinta una
// cuadrícula 5×5 simétrica derivada del id de forma determinista. Mismo espíritu
// que escena/texturasCarta.ts: dibujar en canvas; aquí devolvemos un <canvas>
// para el DOM del HUD y del picker.
//
// jsdom (tests) no implementa getContext("2d") y devuelve null: `crearAvatar`
// degrada a un canvas en blanco en vez de lanzar, para no romper los tests.

interface Emblema {
  readonly forma:
    | "circulo"
    | "estrella"
    | "rombo"
    | "triangulo"
    | "hexagono"
    | "corazon"
    | "anillo"
    | "rayo";
  readonly fondo: string;
  readonly tinta: string;
}

const EMBLEMAS: Readonly<Record<string, Emblema>> = {
  "emblema-estrella-ambar": { forma: "estrella", fondo: "#c77d18", tinta: "#fff5e0" },
  "emblema-rombo-esmeralda": { forma: "rombo", fondo: "#1f7a4d", tinta: "#e7fff2" },
  "emblema-circulo-rubi": { forma: "circulo", fondo: "#b3243b", tinta: "#ffe8ec" },
  "emblema-triangulo-zafiro": { forma: "triangulo", fondo: "#2454b3", tinta: "#e6efff" },
  "emblema-hexagono-violeta": { forma: "hexagono", fondo: "#6a3bb0", tinta: "#f1e9ff" },
  "emblema-corazon-cian": { forma: "corazon", fondo: "#1b8a9c", tinta: "#e6feff" },
  "emblema-anillo-naranja": { forma: "anillo", fondo: "#c2511a", tinta: "#ffeede" },
  "emblema-rayo-grafito": { forma: "rayo", fondo: "#3a4250", tinta: "#dfe6f0" },
};

const IDENTICONS: readonly string[] = [
  "identicon-1",
  "identicon-2",
  "identicon-3",
  "identicon-4",
  "identicon-5",
  "identicon-6",
  "identicon-7",
  "identicon-8",
];

/** Pool por defecto que ve el usuario en el picker (orden estable). */
export const POOL_AVATARES: readonly string[] = [
  ...Object.keys(EMBLEMAS),
  ...IDENTICONS,
];

export function esAvatarValido(id: string): boolean {
  return POOL_AVATARES.includes(id);
}

/** Elige un avatar del pool de forma determinista a partir de una semilla. */
export function avatarPorDefecto(semilla: string): string {
  const indice = hash(semilla) % POOL_AVATARES.length;
  return POOL_AVATARES[indice] ?? POOL_AVATARES[0] ?? "identicon-1";
}

/** Hash FNV-1a de 32 bits (determinista, sin dependencias). */
function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Crea un <canvas> cuadrado con el avatar dibujado. En entornos sin contexto 2D
 * (jsdom) devuelve el canvas en blanco del tamaño pedido, sin lanzar.
 */
export function crearAvatar(avatarId: string, tam: number): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = tam;
  lienzo.height = tam;
  const ctx = lienzo.getContext("2d");
  if (ctx !== null) dibujarAvatar(ctx, avatarId, tam);
  return lienzo;
}

/** Dibuja el avatar en el contexto dado, en un cuadrado de lado `tam`. */
export function dibujarAvatar(
  ctx: CanvasRenderingContext2D,
  avatarId: string,
  tam: number,
): void {
  ctx.clearRect(0, 0, tam, tam);
  const emblema = EMBLEMAS[avatarId];
  if (emblema !== undefined) {
    dibujarEmblema(ctx, emblema, tam);
  } else {
    dibujarIdenticon(ctx, avatarId, tam);
  }
}

function dibujarEmblema(ctx: CanvasRenderingContext2D, e: Emblema, tam: number): void {
  const c = tam / 2;
  const r = tam * 0.3;
  ctx.fillStyle = e.fondo;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.tinta;
  ctx.strokeStyle = e.tinta;
  switch (e.forma) {
    case "circulo":
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "estrella":
      estrella(ctx, c, c, r, 5);
      return;
    case "rombo":
      poligono(ctx, c, c, r, 4, -Math.PI / 2);
      return;
    case "triangulo":
      poligono(ctx, c, c, r, 3, -Math.PI / 2);
      return;
    case "hexagono":
      poligono(ctx, c, c, r, 6, -Math.PI / 2);
      return;
    case "corazon":
      corazon(ctx, c, c, r);
      return;
    case "anillo":
      ctx.lineWidth = r * 0.36;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case "rayo":
      rayo(ctx, c, c, r);
      return;
  }
}

function poligono(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lados: number,
  rot: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < lados; i++) {
    const a = rot + (i * 2 * Math.PI) / lados;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function estrella(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  puntas: number,
): void {
  const interior = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < puntas * 2; i++) {
    const radio = i % 2 === 0 ? r : interior;
    const a = -Math.PI / 2 + (i * Math.PI) / puntas;
    const x = cx + Math.cos(a) * radio;
    const y = cy + Math.sin(a) * radio;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function corazon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.72);
  ctx.bezierCurveTo(cx + r * 1.2, cy - r * 0.2, cx + r * 0.5, cy - r, cx, cy - r * 0.3);
  ctx.bezierCurveTo(cx - r * 0.5, cy - r, cx - r * 1.2, cy - r * 0.2, cx, cy + r * 0.72);
  ctx.closePath();
  ctx.fill();
}

function rayo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const puntos: readonly (readonly [number, number])[] = [
    [0.15, -0.65],
    [-0.3, 0.1],
    [0.0, 0.1],
    [-0.15, 0.65],
    [0.35, -0.1],
    [0.05, -0.1],
  ];
  ctx.beginPath();
  puntos.forEach(([dx, dy], i) => {
    const x = cx + dx * r * 1.4;
    const y = cy + dy * r * 1.1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

function dibujarIdenticon(
  ctx: CanvasRenderingContext2D,
  id: string,
  tam: number,
): void {
  const h = hash(id);
  const matiz = h % 360;
  // Fondo redondeado claro.
  ctx.fillStyle = "#efeae0";
  rectRedondeado(ctx, 0, 0, tam, tam, tam * 0.18);
  ctx.fill();
  ctx.fillStyle = `hsl(${matiz}, 58%, 45%)`;
  const celdas = 5;
  const margen = tam * 0.12;
  const area = tam - 2 * margen;
  const paso = area / celdas;
  for (let fila = 0; fila < celdas; fila++) {
    for (let col = 0; col < 3; col++) {
      const bit = (h >> (fila * 3 + col)) & 1;
      if (bit === 0) continue;
      for (const c of new Set([col, celdas - 1 - col])) {
        ctx.fillRect(margen + c * paso, margen + fila * paso, paso + 0.5, paso + 0.5);
      }
    }
  }
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
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, radio);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, radio);
  ctx.arcTo(x, y + alto, x, y, radio);
  ctx.arcTo(x, y, x + ancho, y, radio);
  ctx.closePath();
}
