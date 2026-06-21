// Captura centralizada de fallos en runtime hacia el registro: errores no
// atrapados, promesas rechazadas y console.error/warn. Es OBSERVACIÓN pura —
// los originales de consola se siguen llamando, solo se añade el registro.
//
// No registra datos sensibles por sí misma: solo refleja lo que ya se loguea o
// lanza. Quien loguee credenciales/tokens es responsable de no hacerlo.

import { registro } from "./registro.js";

let instalada = false;

/** Convierte un argumento de consola/error en texto acotado y legible. */
function aTexto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor instanceof Error) {
    return valor.stack ?? `${valor.name}: ${valor.message}`;
  }
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}

function formatear(args: readonly unknown[]): string {
  const texto = args.map(aTexto).join(" ");
  // Acota para no inflar el buffer con volcados enormes.
  return texto.length > 2000 ? `${texto.slice(0, 2000)}…` : texto;
}

/**
 * Instala la captura global (idempotente). Llamar una vez al arrancar la app.
 */
export function instalarCapturaGlobal(): void {
  if (instalada) return;
  instalada = true;

  window.addEventListener("error", (evento) => {
    const ubic =
      evento.filename !== ""
        ? ` (${evento.filename}:${evento.lineno}:${evento.colno})`
        : "";
    const detalle =
      evento.error instanceof Error ? aTexto(evento.error) : evento.message;
    registro.error(`Error no atrapado: ${detalle}${ubic}`);
  });

  window.addEventListener("unhandledrejection", (evento) => {
    registro.error(`Promesa rechazada: ${aTexto(evento.reason)}`);
  });

  const errorOriginal = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    errorOriginal(...args);
    registro.error(formatear(args));
  };

  const warnOriginal = console.warn.bind(console);
  console.warn = (...args: unknown[]): void => {
    warnOriginal(...args);
    registro.warn(formatear(args));
  };
}
