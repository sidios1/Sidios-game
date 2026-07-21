// Estilo reducer compartido por todo el núcleo: cada acción devuelve el estado
// nuevo o un error tipado. Mentiroso y UNO lo declaran dentro de `partida.ts`,
// pero aquí vive aparte porque `catalogo.ts` (más básico que la partida) también
// lo necesita para `validarPool`, y así se evita el ciclo catalogo ↔ partida.

/** Códigos de error del núcleo; viajan tal cual al cliente. */
export type CodigoError =
  | "JUGADORES_INVALIDOS"
  | "POOL_INVALIDO"
  | "RONDAS_INVALIDAS"
  | "PARTIDA_TERMINADA"
  | "FASE_INVALIDA"
  | "JUGADOR_DESCONOCIDO"
  | "YA_VOTASTE"
  | "YA_LISTO"
  | "VOTADO_DESCONOCIDO";

export interface ErrorJuego {
  readonly codigo: CodigoError;
  readonly mensaje: string;
}

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: ErrorJuego };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function error<T>(codigo: CodigoError, mensaje: string): Resultado<T> {
  return { ok: false, error: { codigo, mensaje } };
}
