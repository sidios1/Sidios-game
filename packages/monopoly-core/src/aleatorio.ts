// Aleatoriedad inyectada: el motor nunca usa Math.random directo.
// Quien baraja/sortea decide el generador (el servidor con una semilla real,
// los tests con una semilla fija). Espejo de carioca-core/aleatorio.ts:
// monopoly-core no depende de ningún otro paquete (lógica pura, sin red).

/** Devuelve un número en [0, 1). */
export type GeneradorAleatorio = () => number;

/** Generador determinista (mulberry32): misma semilla, misma secuencia. */
export function crearGeneradorSemilla(semilla: number): GeneradorAleatorio {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates puro: devuelve una copia barajada, no muta la entrada. */
export function barajar<T>(items: readonly T[], rng: GeneradorAleatorio): T[] {
  const resultado = [...items];
  for (let i = resultado.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = resultado[i];
    const b = resultado[j];
    if (a === undefined || b === undefined) continue;
    resultado[i] = b;
    resultado[j] = a;
  }
  return resultado;
}
