// Normalización de título (REGLAS_MELOQUIZ.md §2).
//
// "Limpiar sufijos y ruido del nombre de archivo (`_320kbps_HQ`, guiones bajos,
// etc.) — ese texto es literalmente el botón de respuesta que ven los jugadores."
//
// Lógica PURA: sin disco, sin tags, sin red. Se aplica tanto al tag ID3 como al
// nombre de archivo, porque los tags de una librería real también vienen sucios.

/** Ruido de calidad/procedencia que nunca es parte del título. */
const PATRONES_RUIDO: readonly RegExp[] = [
  // Bloques entre paréntesis/corchetes: (Official Video), [Lyrics], (Remastered 2011)…
  /[([{]\s*(?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?|letra)\s*(?:oficial)?\s*[)\]}]/gi,
  /[([{]\s*(?:video|audio)\s*oficial\s*[)\]}]/gi,
  /[([{]\s*(?:with\s+)?lyrics?\s*[)\]}]/gi,
  /[([{]\s*remaster(?:ed)?(?:\s*\d{4})?\s*[)\]}]/gi,
  /[([{]\s*(?:hq|hd|4k)\s*[)\]}]/gi,
  // Tokens sueltos: 320kbps, 128 kbps, HQ, HD…
  /\b\d{2,4}\s*kbps\b/gi,
  /\b(?:hq|hd|4k|high\s*quality)\b/gi,
  // Procedencia: www.sitio.com, sitio.com
  /\bwww\.[\w-]+\.\w{2,}\b/gi,
  /\b[\w-]+\.(?:com|net|org)\b/gi,
];

/**
 * Numeración de pista al inicio: `01 - `, `01. `, `01_`, `(01) `.
 * Exige un separador explícito tras los dígitos para no comerse títulos que
 * empiezan con número ("99 Luftballons" sobrevive; "01 - 99 Luftballons" no
 * pierde el 99).
 */
const NUMERACION_PISTA = /^\s*[([]?\s*\d{1,3}\s*[)\]]?\s*[-._–—]+\s*|^\s*[([]\s*\d{1,3}\s*[)\]]\s*/;

/** Separadores que sobran en los extremos una vez limpio el ruido. */
const BORDES_SOBRANTES = /^[\s\-–—_.]+|[\s\-–—_.]+$/g;

const EXTENSION = /\.[a-z0-9]{1,5}$/i;

/** Quita la extensión del nombre de archivo (`Tema.mp3` → `Tema`). */
export function quitarExtension(nombreArchivo: string): string {
  return nombreArchivo.replace(EXTENSION, "");
}

/** Limpia ruido y espacios; sirve para tags y para nombres de archivo. */
export function limpiarRuido(texto: string): string {
  let salida = texto.replace(/_/g, " ");
  for (const patron of PATRONES_RUIDO) salida = salida.replace(patron, " ");
  return salida.replace(/\s+/g, " ").replace(BORDES_SOBRANTES, "").trim();
}

/**
 * Normaliza un título ya conocido (tag ID3). Devuelve "" si no queda nada
 * aprovechable: quien llama decide el fallback.
 */
export function normalizarTitulo(texto: string): string {
  return limpiarRuido(texto);
}

export interface TituloDerivado {
  readonly titulo: string;
  /** Artista deducido del patrón `Artista - Título`; `null` si no aplica. */
  readonly artista: string | null;
}

/**
 * Deriva título (y quizá artista) del nombre de archivo (§1, fallback cuando
 * falta el tag). El patrón `Artista - Título` es el layout dominante en
 * librerías reales, y separarlo evita que el botón de voto repita el artista.
 */
export function derivarDeNombreArchivo(nombreArchivo: string): TituloDerivado {
  const sinExtension = quitarExtension(nombreArchivo);

  // Los puntos separan palabras solo en nombres tipo `Artista.Tema.Aqui`; si el
  // nombre ya usa espacios, un punto suele ser parte del texto ("Mr. Brightside").
  const conSeparadores = sinExtension.includes(" ")
    ? sinExtension
    : sinExtension.replace(/\./g, " ");

  // La numeración se quita ANTES de tocar los guiones bajos: en `01_Tema` el
  // `_` ES el separador de la pista, y convertirlo en espacio lo escondería.
  const sinNumeracion = conSeparadores.replace(NUMERACION_PISTA, "").replace(/_/g, " ");

  const corte = sinNumeracion.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (corte !== null) {
    const izquierda = limpiarRuido(corte[1] ?? "");
    const derecha = limpiarRuido(corte[2] ?? "");
    if (izquierda.length > 0 && derecha.length > 0) {
      return { titulo: derecha, artista: izquierda };
    }
  }

  return { titulo: limpiarRuido(sinNumeracion), artista: null };
}

/**
 * Resuelve el par (título, artista) definitivo de una canción: manda el tag y,
 * si falta, se deriva del nombre de archivo (§1). Título vacío ⇒ la fuente
 * descarta el archivo.
 */
export function resolverTituloYArtista(
  tituloTag: string | null,
  artistaTag: string | null,
  nombreArchivo: string,
): TituloDerivado {
  const desdeNombre = derivarDeNombreArchivo(nombreArchivo);
  const artistaLimpio = artistaTag === null ? "" : limpiarRuido(artistaTag);
  const artista = artistaLimpio.length > 0 ? artistaLimpio : desdeNombre.artista;

  const tituloLimpio = tituloTag === null ? "" : normalizarTitulo(tituloTag);
  if (tituloLimpio.length > 0) return { titulo: tituloLimpio, artista };

  return { titulo: desdeNombre.titulo, artista };
}
