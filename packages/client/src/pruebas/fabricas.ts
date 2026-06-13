// Fábricas para los tests del cliente: cartas reales del core y vistas
// completas con valores por defecto razonables.

import type {
  Carta,
  CartaNormal,
  ContratoMano,
  Pinta,
  ValorCarta,
} from "@juegos/carioca-core";
import { contratoDeMano, crearCartaNormal } from "@juegos/carioca-core";
import type { JugadorVista, VistaPartida } from "@juegos/server/vista";

export function carta(pinta: Pinta, valor: ValorCarta, copia = "a"): CartaNormal {
  return crearCartaNormal(pinta, valor, copia);
}

export function contrato(numero: number): ContratoMano {
  const encontrado = contratoDeMano(numero);
  if (encontrado === undefined) {
    throw new Error(`mano desconocida en las fábricas de test: ${numero}`);
  }
  return encontrado;
}

export function jugadorVista(
  id: string,
  parcial: Partial<JugadorVista> = {},
): JugadorVista {
  return {
    id,
    nombre: `Jugador ${id}`,
    numeroCartas: 12,
    puntosAcumulados: 0,
    seBajo: false,
    conectado: true,
    estadoConexion: "conectado",
    listoSiguienteMano: false,
    ...parcial,
  };
}

export function crearVista(parcial: Partial<VistaPartida> = {}): VistaPartida {
  const base: VistaPartida = {
    tuJugadorId: "j1",
    tuMano: [],
    anfitrionId: "j1",
    jugadores: [jugadorVista("j1"), jugadorVista("j2")],
    manoActual: 1,
    contrato: contrato(1),
    numeroMazo: 80,
    pozoTope: null,
    numeroPozo: 0,
    mesa: [],
    turno: { jugadorId: "j1", fase: "robar", numero: 1 },
    fase: "jugandoMano",
    resumenMano: null,
    ganadoresIds: null,
  };
  return { ...base, ...parcial };
}

/** Mano propia de ejemplo: dos tríos limpios + cartas sueltas. */
export function manoConDosTrios(): readonly Carta[] {
  return [
    carta("corazones", 5),
    carta("picas", 5),
    carta("treboles", 5),
    carta("diamantes", 9),
    carta("picas", 9),
    carta("corazones", 9, "b"),
    carta("treboles", 2),
    carta("diamantes", 11),
  ];
}
