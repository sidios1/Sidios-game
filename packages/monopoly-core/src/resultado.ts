// Estilo reducer compartido por todo el núcleo: cada acción devuelve el estado
// nuevo o un error tipado. Vive aparte de partida.ts porque tablero.ts,
// fuenteSobres.ts, muestreo.ts, estado.ts y todos los archivos de acción
// (turnos/economia/descendido/cartasPrensaEfectos/intercambios) lo necesitan
// sin poder importarse entre sí — mismo motivo que meloquiz-core/resultado.ts.

/** Códigos de error del núcleo; viajan tal cual al cliente. */
export type CodigoError =
  | "JUGADORES_INVALIDOS"
  | "CONFIG_INVALIDA"
  | "POOL_INVALIDO"
  | "PARTIDA_TERMINADA"
  | "NO_ES_TU_TURNO"
  | "JUGADOR_DESCONOCIDO"
  | "JUGADOR_EN_QUIEBRA"
  | "ACCION_NO_ESPERADA"
  | "TABLERO_NO_HABILITADO"
  | "CELDA_NO_COMPRABLE"
  | "POSICION_REQUERIDA"
  | "POSICION_INVALIDA"
  | "SALDO_INSUFICIENTE"
  | "SUBASTA_NO_EN_CURSO"
  | "SUBASTA_YA_EN_CURSO"
  | "PUJA_INVALIDA"
  | "YA_PASASTE"
  | "VENTANA_CERRADA"
  | "SIN_VENTANA_ABIERTA"
  | "NO_ESTAS_EN_DESCENDIDO"
  | "NO_TIENES_CARTAS"
  | "CARTA_DESCONOCIDA"
  | "RIVAL_INVALIDO"
  | "OFERTA_INVALIDA"
  | "LIGA_INVALIDA"
  // Fase de armado y votación final (§7): aditivo, ver armadoEquipo.ts/votacionFinal.ts.
  | "SLOT_INVALIDO"
  | "CARTA_NO_ELEGIBLE"
  | "CARTA_YA_ASIGNADA"
  | "VOTANTE_DESCONOCIDO"
  | "CATEGORIA_SIN_CANDIDATOS";

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
