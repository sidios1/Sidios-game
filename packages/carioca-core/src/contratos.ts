// Contratos del juego como datos. Transcripción fiel de REGLAS_CARIOCA.md §9
// (única fuente de verdad). Si una regla cambia, se edita ese archivo primero
// y este módulo lo sigue.

export type Requisito =
  | { readonly tipo: "trio"; readonly cantidad: number }
  | {
      readonly tipo: "escala";
      readonly cantidad: number;
      readonly longitudMin: number;
    }
  | { readonly tipo: "escalaSucia" } // 13 cartas, cualquier pinta, 1 comodín
  | { readonly tipo: "escalaReal" }; // 13 cartas, misma pinta, sin comodín

export interface ContratoMano {
  readonly numero: number;
  readonly nombre: string;
  readonly cartasRepartidas: number; // siempre 12
  readonly requisitos: readonly Requisito[];
  readonly comodinesPorCombinacion: number; // máximo de comodines por combinación
  readonly cierreAutomatico: boolean; // true en sucia/real: usa la 13ª y gana sin descartar
}

export const MANOS: readonly ContratoMano[] = [
  { numero: 1, nombre: "2 tríos",            cartasRepartidas: 12, requisitos: [{ tipo: "trio", cantidad: 2 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 2, nombre: "1 trío + 1 escala",  cartasRepartidas: 12, requisitos: [{ tipo: "trio", cantidad: 1 }, { tipo: "escala", cantidad: 1, longitudMin: 4 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 3, nombre: "2 escalas",          cartasRepartidas: 12, requisitos: [{ tipo: "escala", cantidad: 2, longitudMin: 4 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 4, nombre: "3 tríos",            cartasRepartidas: 12, requisitos: [{ tipo: "trio", cantidad: 3 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 5, nombre: "2 tríos + 1 escala", cartasRepartidas: 12, requisitos: [{ tipo: "trio", cantidad: 2 }, { tipo: "escala", cantidad: 1, longitudMin: 4 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 6, nombre: "1 trío + 2 escalas", cartasRepartidas: 12, requisitos: [{ tipo: "trio", cantidad: 1 }, { tipo: "escala", cantidad: 2, longitudMin: 4 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 7, nombre: "3 escalas",          cartasRepartidas: 12, requisitos: [{ tipo: "escala", cantidad: 3, longitudMin: 4 }], comodinesPorCombinacion: 1, cierreAutomatico: false },
  { numero: 8, nombre: "Escala sucia",       cartasRepartidas: 12, requisitos: [{ tipo: "escalaSucia" }], comodinesPorCombinacion: 1, cierreAutomatico: true },
  { numero: 9, nombre: "Escala real",        cartasRepartidas: 12, requisitos: [{ tipo: "escalaReal" }], comodinesPorCombinacion: 0, cierreAutomatico: true },
];

export interface ValorPuntos {
  readonly numeros2a9: "valorNominal"; // 2..9 valen su número
  readonly diez_J_Q_K: number;
  readonly as: number;
  readonly comodin: number;
}

export const VALOR_PUNTOS: ValorPuntos = {
  numeros2a9: "valorNominal",
  diez_J_Q_K: 10,
  as: 20,
  comodin: 30,
};

export interface ConfigEscala {
  readonly longitudMin: number;
  readonly asPuente: boolean; // K-A-2 válido; la secuencia da la vuelta por el As
}

export const ESCALA: ConfigEscala = {
  longitudMin: 4,
  asPuente: true,
};

// §2/§8: trío = 3 cartas mínimo (no aparece en §9, se documenta aquí como dato).
export interface ConfigTrio {
  readonly longitudMin: number;
}

export const TRIO: ConfigTrio = {
  longitudMin: 3,
};

// §1: los materiales escalan con la cantidad de jugadores (sin tope superior).
//   mazos     = mazosPorBloque × máx(1, piso(jugadores / jugadoresPorBloque))
//   comodines = mazos × comodinesPorMazo
// La fórmula se aplica en mazo.ts; aquí viven solo sus parámetros como dato.
export interface ConfigMateriales {
  readonly jugadoresPorBloque: number; // 4: cada 4 jugadores agrega un bloque de mazos
  readonly mazosPorBloque: number; // 2: los mazos se agregan de a pares
  readonly comodinesPorMazo: number; // 2: comodines por mazo (4 por par de mazos)
}

export const MATERIALES: ConfigMateriales = {
  jugadoresPorBloque: 4,
  mazosPorBloque: 2,
  comodinesPorMazo: 2,
};

export function contratoDeMano(numero: number): ContratoMano | undefined {
  return MANOS.find((mano) => mano.numero === numero);
}
