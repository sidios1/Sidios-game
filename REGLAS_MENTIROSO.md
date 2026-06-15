# REGLAS_MENTIROSO.md — Fuente de verdad del segundo juego

> Juego de faroleo basado en una baraja inglesa, donde **solo importan los palos** (no los valores).
> Es el input del motor del juego Mentiroso y de su implementación de IJuego (Fase 6).

---

## 1. Materiales y jugadores
- **Una baraja inglesa de 52 cartas.** Solo importa el **palo** de cada carta, no su número.
- 4 palos (13 cartas cada uno): ♠ Picas, ♥ Corazones, ♦ Diamantes, ♣ Tréboles.
- 2 o más jugadores.

## 2. Objetivo
Ser el **primer jugador en quedarse sin cartas**.

## 3. Preparación
- Se reparte **toda la baraja** entre los jugadores (lo más parejo posible).

## 4. Desarrollo del turno
1. La ronda tiene un **palo declarado** (lo fija quien la inicia).
2. En su turno, el jugador coloca **1, 2 o 3 cartas boca abajo** sobre la pila y declara cuántas
   pone, del palo de la ronda. Ej: "un corazón", "dos picas", "tres tréboles".
3. El siguiente jugador **debe continuar con el mismo palo**, agregando 1-3 cartas boca abajo.
   Ej: "otro corazón", "otros dos corazones".
4. **Las cartas reales pueden o no corresponder al palo declarado** (ahí está el faroleo).

## 5. Acusación ("¡Mentiroso!")
1. Cualquier jugador puede acusar diciendo **"¡Mentiroso!"** sobre la **última jugada** (las cartas
   que el jugador anterior acaba de poner).
2. Se revelan **solo esas últimas cartas** del acusado:
   - Si **todas** son del palo declarado → el **acusador** recoge toda la pila.
   - Si **alguna no** es del palo declarado → el **acusado** recoge toda la pila.

## 6. Fin de ronda y nueva ronda
- Quien recoge la pila **inicia la siguiente ronda**.
- La nueva ronda **debe declarar un palo distinto** al de la ronda anterior.

## 7. Fin del juego
- Gana el **primer jugador que se queda sin cartas**.

---

## 8. Decisiones fijadas (casos que las reglas base no fijaban)
Estos casos borde quedaron decididos antes de codear (mentiroso-core los implementa):

1. **Ganar con la última carta.** Un jugador que juega sus últimas cartas **NO gana al
   instante**: debe sobrevivir a una posible acusación de esa jugada final. Gana **solo si
   nadie lo acusa con éxito**; la victoria queda confirmada cuando la jugada se "acepta"
   (ver punto 3). Si lo acusan y mentía, recoge la pila y sigue.
2. **Quién puede acusar.** Cualquier jugador **excepto el que acaba de jugar** (no hay
   auto-acusación). La acusación apunta siempre a la última jugada (`ultimaJugada`).
3. **Ventana de acusación.** Abierta **hasta que el siguiente jugador coloca sus cartas**:
   al jugar de nuevo, `ultimaJugada` se reemplaza y la jugada anterior queda "aceptada".
   Si quien jugó sus últimas cartas no es acusado antes de esa aceptación, gana.
4. **Inicio de la primera ronda.** Empieza el **primer jugador del orden de reparto**. El
   palo de la ronda lo **fija el motor** (no viaja en la acción `jugar`, ver §9): el palo
   inicial se elige al azar entre los 4; cada ronda nueva elige un palo **distinto** al
   de la ronda anterior.

---

## 9. Datos para el motor (mentiroso-core)

```ts
type Palo = "picas" | "corazones" | "diamantes" | "treboles";

interface EstadoPartida {
  manos: Record<string, Carta[]>;   // cartas por jugador (oculto para los demás)
  pila: Carta[];                     // cartas jugadas boca abajo (ocultas)
  paloRonda: Palo;                   // palo declarado de la ronda actual
  paloRondaAnterior: Palo | null;    // para forzar un palo distinto al iniciar ronda
  jugadorEnTurno: string;
  ultimaJugada: {                    // para resolver una acusación
    jugador: string;
    cantidad: number;                // 1 a 3
    cartas: Carta[];                 // las cartas reales recién puestas
  } | null;
  ganador: string | null;
}

// Intenciones que un jugador envía al orquestador
type Accion =
  | { tipo: "jugar"; cantidad: 1 | 2 | 3 } // pone esas cartas del frente de su mano, declarando paloRonda
  | { tipo: "acusar" };                    // "¡Mentiroso!" sobre ultimaJugada

// Reglas duras
export const REGLAS_MENTIROSO = {
  cartasPorTurno: { min: 1, max: 3 },
  palos: ["picas", "corazones", "diamantes", "treboles"] as Palo[],
  nuevaRondaPaloDistinto: true, // el palo de la nueva ronda != paloRondaAnterior
  soloImportaElPalo: true,      // el valor de la carta es irrelevante
};
```

---

*Reglamento del segundo juego. Si cambia una regla, este archivo es el único lugar que se edita.*
