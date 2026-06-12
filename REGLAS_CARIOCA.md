# REGLAS_CARIOCA.md — Fuente de verdad del reglamento

> Versión acordada para el proyecto. Es el **input directo** del motor `carioca-core`.
> La sección 9 entrega los contratos como datos para evitar hardcodear reglas.

---

## 1. Materiales y jugadores
- **2 mazos ingleses + 4 comodines = 108 cartas.**
- Cada carta existe por duplicado (dos mazos).
- **2 a 4 jugadores.**
- Se reparten **12 cartas** por jugador.
- El reparto rota de jugador en jugador en cada mano.

---

## 2. Combinaciones

### Trío
- **3 cartas del mismo número**, sin importar la pinta.
- Mínimo 3. Después de bajarse, se pueden "pegar" más cartas del mismo número.

### Escala
- **4 cartas consecutivas de la misma pinta** (mínimo 4).
- **El As es puente:** el orden es A‑2‑3‑…‑J‑Q‑K y además **K‑A‑2 es válido**. El As puede ir alto, bajo o conectando ambos extremos (la secuencia "da la vuelta" por el As).
  - Ejemplo válido: Q‑K‑A‑2‑3 de la misma pinta.

### Escalas especiales (solo en las manos finales, usan 13 cartas)
- **Escala sucia:** del As al Rey en orden, **sin importar la pinta**. Admite 1 comodín.
- **Escala real:** del As al Rey, **todas de la misma pinta**. **Sin comodín.**

---

## 3. Comodines
- Reemplazan cualquier carta.
- **Máximo 1 comodín por combinación** al momento de bajarse.
- Los **2 rojos NO son comodines** (cuentan como carta normal).
- No se descartan comodines al pozo, salvo en manos donde no se permiten (escala real).

---

## 4. Secuencia de manos (9 en total, en orden)
Hay que cumplir la combinación exacta de cada mano para pasar a la siguiente.

| # | Mano | Combinación |
|---|------|-------------|
| 1 | 2 tríos | TT |
| 2 | 1 trío + 1 escala | TE |
| 3 | 2 escalas | EE |
| 4 | 3 tríos | TTT |
| 5 | 2 tríos + 1 escala | TTE |
| 6 | 1 trío + 2 escalas | TEE |
| 7 | 3 escalas | EEE |
| 8 | Escala sucia | 13 cartas, cualquier pinta |
| 9 | Escala real | 13 cartas, misma pinta, sin comodín |

---

## 5. Flujo del turno
1. **Robar** una carta: del mazo o de la cima del pozo de descarte (lo que tomas del pozo lo ven todos).
2. **Bajarse** (opcional): solo si tienes completa la combinación exacta de la mano. Al bajarte, ese turno ya no bajas más combinaciones.
3. **Descartar** una carta al pozo para terminar el turno.

---

## 6. Bajarse y pegar
- Te bajas colocando tus combinaciones boca arriba sobre la mesa.
- **Pegar cartas** (a combinaciones propias o ajenas en mesa) solo se permite **en los turnos siguientes** al que te bajaste, no en el mismo.
- Solo puedes pegar si ya bajaste la combinación requerida de la mano.
- La mano termina cuando un jugador se deshace de todas sus cartas.

### Manos finales (escala sucia y real)
- Se reparten 12 cartas; al completar la escala de 13 (con la carta robada), el jugador baja las 13 y **gana la mano automáticamente, sin descartar**.

---

## 7. Puntaje
Cuando un jugador se baja del todo, los demás suman las cartas que les quedaron en mano:

| Carta | Puntos |
|-------|--------|
| 2 a 9 | su número |
| 10, J, Q, K | 10 |
| As | **20** |
| Comodín | **30** |

- Quien se bajó suma **0** esa mano.
- Las cartas ya bajadas a la mesa **no** suman.
- **Gana quien acumule menos puntos** al terminar las 9 manos.

---

## 8. Resumen de decisiones (defaults confirmados)
- Escala = 4 cartas; trío = 3 cartas.
- K‑A‑2 válido (As puente).
- Solo escalas especiales: sucia y real.
- 2 rojos NO son comodines.
- 1 comodín por combinación al bajarse.
- Pegar solo en el turno siguiente al de bajarse.
- As = 20 pts, comodín = 30 pts.

---

## 9. Contratos como datos (para `carioca-core`)

```ts
// Tipos de requisito por mano
type Requisito =
  | { tipo: "trio"; cantidad: number }
  | { tipo: "escala"; cantidad: number; longitudMin: number }
  | { tipo: "escalaSucia" }  // 13 cartas, cualquier pinta, 1 comodín
  | { tipo: "escalaReal" };  // 13 cartas, misma pinta, sin comodín

interface Mano {
  numero: number;
  nombre: string;
  cartasRepartidas: number;        // siempre 12
  requisitos: Requisito[];
  comodinesPorCombinacion: number; // máximo de comodines por combinación
  cierreAutomatico: boolean;       // true en sucia/real: usa la 13ª y gana sin descartar
}

export const MANOS: Mano[] = [
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

// Valor de cada carta para el conteo de puntos
export const VALOR_PUNTOS = {
  numeros2a9: "valorNominal", // 2..9 valen su número
  diez_J_Q_K: 10,
  as: 20,
  comodin: 30,
};

// Reglas de escala
export const ESCALA = {
  longitudMin: 4,
  asPuente: true, // K-A-2 válido; la secuencia da la vuelta por el As
};
```

---

*Reglamento congelado. Si más adelante cambian una regla, este archivo es el único lugar que se edita.*
