// Sesión de reconexión: el token de `bienvenida` se guarda por código de sala
// para reentrar al mismo asiento tras un F5. Recibe el Storage por parámetro
// (sessionStorage en la app: por pestaña, así dos pestañas son dos jugadores).

export interface DatosSesion {
  readonly token: string;
  readonly nombre: string;
  /** Avatar con el que se entró; se reusa al reconectar. */
  readonly avatar?: string;
}

const PREFIJO = "carioca-sesion:";

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function guardarSesion(
  almacen: Storage,
  codigo: string,
  datos: DatosSesion,
): void {
  almacen.setItem(PREFIJO + codigo, JSON.stringify(datos));
}

export function leerSesion(almacen: Storage, codigo: string): DatosSesion | null {
  const crudo = almacen.getItem(PREFIJO + codigo);
  if (crudo === null) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!esObjeto(datos)) return null;
  const token = datos["token"];
  const nombre = datos["nombre"];
  const avatar = datos["avatar"];
  if (typeof token !== "string" || typeof nombre !== "string") return null;
  if (avatar !== undefined && typeof avatar !== "string") return null;
  return { token, nombre, ...(avatar !== undefined ? { avatar } : {}) };
}

export function borrarSesion(almacen: Storage, codigo: string): void {
  almacen.removeItem(PREFIJO + codigo);
}
