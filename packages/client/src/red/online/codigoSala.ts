// Código de sala online: corto y legible para dictárselo a un amigo. Se usa
// como identificador del host en el broker de señalización. El alfabeto evita
// caracteres ambiguos (0/O, 1/I/L) para que no haya confusiones al teclearlo.

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGITUD = 6;
/** Prefijo del id en el broker, para no colisionar con otros usos del mismo. */
const PREFIJO = "jr-";

/** Genera un código de sala aleatorio (p. ej. "K7P2Q9"). */
export function generarCodigoSala(): string {
  let codigo = "";
  for (let i = 0; i < LONGITUD; i += 1) {
    const indice = Math.floor(Math.random() * ALFABETO.length);
    codigo += ALFABETO[indice];
  }
  return codigo;
}

/** ¿El texto tiene la forma de un código de sala válido? */
export function esCodigoSala(texto: string): boolean {
  if (texto.length !== LONGITUD) return false;
  for (const caracter of texto) {
    if (!ALFABETO.includes(caracter)) return false;
  }
  return true;
}

/** Identificador del host en el broker a partir del código de sala. */
export function idBroker(codigo: string): string {
  return `${PREFIJO}${codigo}`;
}
