// Reglas duras de MeloQuiz como DATOS (REGLAS_MELOQUIZ.md §2, §4, §5, §6).
// Transcripción fiel del reglamento: si una regla cambia, se edita el doc
// primero y este archivo lo sigue. La máquina de fases no hardcodea estos
// valores en condicionales sueltos: los lee de aquí.

/** Duración de cada fase temporizada, en milisegundos (§4). */
export interface DuracionesFase {
  /** Timeout del ack de precarga: al vencer se arranca sin los rezagados (§3.3). */
  readonly precarga: number;
  /** Suena el clip desde ~30%; nada visible aún (§4). */
  readonly clip: number;
  /** Se revela la respuesta: carátula + título; el audio sigue (§4). */
  readonly revelar: number;
  /** Ventana para votar QUÉ JUGADOR ganó; cierra antes si votan todos (§5). */
  readonly voto: number;
  /** Tabla de puntos: se computa la mayoría y se actualiza el marcador (§4). */
  readonly puntaje: number;
}

export interface ReglasMeloquiz {
  readonly duraciones: DuracionesFase;
  /** Mínimo de canciones válidas para iniciar (§2). */
  readonly minimoCanciones: number;
  /** Puntaje PLANO: el más votado de la ronda suma 1; empate = nadie (§5). */
  readonly puntosPorRonda: number;
  /** Jugadores admitidos (§6). */
  readonly jugadores: { readonly min: number; readonly max: number };
  /**
   * Jugadores admitidos en MODO ENTRENAMIENTO (§6): partida de a uno, opt-in
   * desde el lobby. El resto del reglamento no cambia.
   */
  readonly jugadoresEntrenamiento: { readonly min: number; readonly max: number };
  /** Desempate: empate compartido, sin criterio secundario (§6). */
  readonly empateCompartido: boolean;
}

export const REGLAS_MELOQUIZ: ReglasMeloquiz = {
  duraciones: {
    precarga: 15_000,
    clip: 10_000,
    revelar: 5_000,
    voto: 10_000,
    puntaje: 5_000,
  },
  minimoCanciones: 4,
  puntosPorRonda: 1,
  jugadores: { min: 2, max: 8 },
  jugadoresEntrenamiento: { min: 1, max: 1 },
  empateCompartido: true,
};
