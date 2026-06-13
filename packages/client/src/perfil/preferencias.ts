// Preferencias locales de presentación del cliente (no son estado de juego ni
// viajan a la partida). Mismo patrón que perfil.ts: un Storage inyectable, con
// localStorage como default para que sobrevivan al reabrir la app.

const CLAVE_OCULTAR_STAGED = "juegos-pref-ocultar-staged";

/** Storage por defecto: localStorage si existe (navegador/Tauri), o null. */
export function almacenPreferenciasPorDefecto(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Algunos entornos lanzan al tocar localStorage (políticas de privacidad).
    return null;
  }
}

/** Si la mano oculta las cartas ya cargadas en el modal de bajar (default false). */
export function leerOcultarStaged(almacen: Storage): boolean {
  const crudo = almacen.getItem(CLAVE_OCULTAR_STAGED);
  if (crudo === null) return false;
  try {
    return JSON.parse(crudo) === true;
  } catch {
    return false;
  }
}

export function guardarOcultarStaged(almacen: Storage, valor: boolean): void {
  almacen.setItem(CLAVE_OCULTAR_STAGED, JSON.stringify(valor));
}
