// Reglas duras de Monopoly Ultimate Team como DATOS
// (REGLAS_MONOPOLY_ULTIMATE_TEAM.md §1.1, §2, §2.1, §3, §3.1, §3.2, §3.3, §4).
// Transcripción fiel del reglamento: si una regla cambia, se edita el doc
// primero y este archivo lo sigue. El motor no hardcodea estos valores en
// condicionales sueltos: los lee de aquí.

/** Tramos porcentuales Malo/Normal/Raro; deben sumar 100 (§3.2). */
export interface TramosTier {
  readonly malo: number;
  readonly normal: number;
  readonly raro: number;
}

export interface ReglasMonopoly {
  /** Presupuesto inicial de cada jugador, en $M (§3). */
  readonly presupuestoInicial: number;
  /** Sobres gratuitos que cada jugador abre antes de empezar a mover (§1.1). */
  readonly sobresIniciales: number;
  /** Ronda desde la que el tablero se activa; la ronda 1 no compra ni subasta (§1.1). */
  readonly rondaActivacionTablero: number;
  /** Monto que se cobra al pasar/caer en Nueva Temporada (§2). */
  readonly nuevaTemporadaMonto: number;
  readonly subasta: {
    readonly inicial: number;
    readonly incrementoMinimo: number;
  };
  /** Multiplicador compuesto de la renegociación forzada (200% = x2) (§3). */
  readonly renegociacion: { readonly multiplicador: number };
  /** Multa para salir de Descendido (§4). */
  readonly multaDescendido: number;
  /** Turnos en Descendido antes de perder un jugador aleatorio (§4). */
  readonly turnosEnDescendidoAntesDePerderJugador: number;
  /** Dobles seguidos que mandan directo a Descendido (§2.1). */
  readonly doblesSeguidosParaDescendido: number;
  readonly impuestos: {
    readonly doping: number;
    readonly apuestas: number;
  };
  readonly tiers: {
    /** Celdas de liga normales (§3.2). */
    readonly liga: TramosTier;
    /** La celda más cara de cada liga (§3.2: +20pp Raro, a costa de Malo). */
    readonly ligaCeldaMasCara: TramosTier;
    /** Las 4 celdas de Resto del Mundo (§3.2). */
    readonly restoDelMundo: TramosTier;
  };
}

export const REGLAS_MONOPOLY: ReglasMonopoly = {
  presupuestoInicial: 1000,
  sobresIniciales: 6,
  rondaActivacionTablero: 2,
  nuevaTemporadaMonto: 100,
  subasta: { inicial: 10, incrementoMinimo: 10 },
  renegociacion: { multiplicador: 2 },
  multaDescendido: 25,
  turnosEnDescendidoAntesDePerderJugador: 3,
  doblesSeguidosParaDescendido: 3,
  impuestos: { doping: 100, apuestas: 50 },
  tiers: {
    liga: { malo: 25, normal: 50, raro: 25 },
    ligaCeldaMasCara: { malo: 5, normal: 50, raro: 45 },
    restoDelMundo: { malo: 40, normal: 20, raro: 40 },
  },
};
