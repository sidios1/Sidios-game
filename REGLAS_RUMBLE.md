# REGLAS_RUMBLE.md

> Fuente de verdad del modo **Rumble** para Carioca.
> Este documento se autoría ANTES de cualquier sesión de implementación.
> Los agentes lo leen para no resolver ambigüedades de diseño por su cuenta.

---

## 1. Propósito y encuadre

**Rumble** es un **modo modificador aditivo** sobre Carioca, no un juego nuevo.
No introduce un `IJuego` nuevo: es una capa que se engancha sobre la Carioca
existente sin reescribir su lógica.

Regla del modo: **en cada ronda** (`2t`, `1t&1E`, `Real`, etc.) se asigna a cada
jugador **una habilidad aleatoria**. Cada habilidad tiene restricciones de uso,
límite o perjuicio. Las habilidades se reasignan al inicio de cada ronda.

---

## 2. Principios de balance

Estos principios rigen toda restricción del documento y deben respetarse si en el
futuro se agregan habilidades nuevas:

1. **Cargas limitadas.** Toda habilidad de efecto fuerte tiene cargas limitadas
   (1 uso, o 2–3 usos/ronda). Nunca "pasiva ilimitada", salvo que sea puramente
   informativa y de bajo impacto.
2. **Recorte de información.** Las habilidades de información total (ver mano
   completa, ver mazo) llevan un recorte: no todo, no todo el tiempo.
3. **Transparencia en disrupción.** Las habilidades disruptivas (resetear,
   intercambiar) tienen transparencia: el afectado se entera. Evita que se sienta
   griefing puro.
4. **Romper regla base = 1 uso/ronda.** Las que rompen una regla base del juego
   (tomar cualquier carta del foso, cambiar la condición de victoria) se limitan a
   1 uso por ronda.
5. **Ventana mínima para lo swingy.** Las que dan la ronda directamente tienen la
   ventana de uso más acotada de todas.

---

## 3. Habilidades

Formato de cada entrada: **efecto** · **restricción final** · **cargas** · **notas de balance**.

### 3.1 Grupo General

#### DECRETALO
- **Efecto:** Aumenta la probabilidad de que te salga una carta.
- **Restricción:** Eliges 1 carta específica al inicio de ronda. **+35%** de
  probabilidad (NO garantizada) en tus próximos 3 robos del mazo, luego se agota.
- **Cargas:** 3 robos afectados / ronda.
- **Notas:** Sin el tope de 3 robos se siente como manipular el RNG sin límite.
  Valor aprobado tras medición (antes 0.25): 0.35 nominal rinde algo más de acierto
  efectivo por robo; gastando las 3 cargas la probabilidad de al menos un acierto
  sube por encima del ~70%. Ajustable en playtest.

#### MISH
- **Efecto:** Descubre la locación de una carta.
- **Restricción:** Indica si la carta está en el mazo, en el foso, o en mano de
  qué jugador. NO revela la posición exacta.
- **Cargas:** 1 uso / ronda.
- **Notas:** Ubicación exacta sería demasiada información por tan bajo costo.

#### RADAR
- **Efecto:** Ve la pinta mayoritaria de cada jugador.
- **Restricción:** Foto fija (snapshot) al inicio de ronda. NO se actualiza en vivo.
- **Cargas:** Pasiva, 1 snapshot / ronda.
- **Notas:** Si se actualizara turno a turno sería casi full-info permanente.

#### AUGURIO
- **Efecto:** Ve la carta de arriba del mazo.
- **Restricción:** 3 consultas por ronda (no "toda la ronda").
- **Cargas:** 3 consultas / ronda.
- **Notas:** Ver la cima del mazo sin límite es demasiado fuerte para quien ya
  sabe cuándo conviene robar.

#### SAPO
- **Efecto:** Ve la mano de un jugador.
- **Restricción:** Muestra solo **4 cartas al azar** de la mano objetivo, no la
  mano completa.
- **Cargas:** 1 uso / ronda.
- **Notas:** Ver la mano entera es de las más rompedoras de la lista sin el recorte.

#### JUDIO
- **Efecto:** Puedes sacar del foso cualquier carta que se haya tirado.
- **Restricción:** 1 uso / ronda. Al usarla, el resto ve qué carta tomaste
  (transparencia parcial).
- **Cargas:** 1 uso / ronda.
- **Notas:** Rompe la regla base de "solo tomas la última del foso". La
  transparencia evita el swap silencioso. Ver §4 (anti-combo con PESAO).

#### PESAO
- **Efecto:** Solo tú puedes ver el foso esa ronda.
- **Restricción:** Dura la ronda entera. **No se combina con JUDIO** en la misma
  ronda para el mismo jugador (ver §4).
- **Cargas:** Pasiva / ronda.
- **Notas:** Sola es aceptable; junto a JUDIO es demasiado (tomas lo que quieras
  y nadie ve nada).

#### OJO
- **Efecto:** Cuando alguien vaya a terminar el juego, se salta el turno.
- **Restricción:** 1 uso / ronda. Salta el turno una sola vez (no bloqueo
  repetido). El afectado recibe 1 carta extra como compensación.
- **Cargas:** 1 uso / ronda.
- **Notas:** La compensación evita que sea pura frustración de "me arruinaste la
  ronda".

### 3.2 Grupo Primeros 3 Turnos

> La ventana temporal (solo primeros 3 turnos) ya hace gran parte del balance:
> el costo de perder o alterar la mano tan temprano es bajo.
>
> **Definición de la ventana (B1 — resuelta):** es **global** — los turnos 1, 2 y 3
> de la ronda (`turno.numero ≤ 3`, se reinicia por mano). NO son los 3 turnos
> propios de cada jugador. Consecuencia de balance: los asientos tardíos tienen
> menos (o ningún) turno propio dentro de la ventana, así que estas habilidades
> favorecen a los asientos tempranos; refuerza a EXODIA como "premio de lotería"
> alcanzable casi solo por los primeros en jugar.

#### GINYU
- **Efecto:** Intercambia tu mano con otro jugador.
- **Restricción:** 1 uso, dentro de los primeros 3 turnos. El objetivo es
  **aleatorio**, NO elegible.
- **Cargas:** 1 uso (ventana 3 turnos).
- **Notas:** Si fuera elegible se volvería "snipear al líder" apenas empieza la
  ronda.

#### CHATO
- **Efecto:** Reset a la mano de un jugador.
- **Restricción:** 1 uso, dentro de los primeros 3 turnos. El afectado se entera.
- **Cargas:** 1 uso (ventana 3 turnos).
- **Notas:** Sin cambios respecto al diseño original.

#### MATO
- **Efecto:** Reset a tu mano o a tu habilidad.
- **Restricción:** 1 uso. **Excepción de ventana:** al ser auto-perjuicio /
  auto-beneficio (no ataque), funciona **toda la ronda**, no solo primeros 3 turnos.
- **Cargas:** 1 uso / ronda.
- **Notas:** Es la única del grupo que no ataca a otro jugador; por eso su ventana
  es distinta.

#### TROLL
- **Efecto:** Si alguien tiene un trío o una escala, se resetean esas cartas.
- **Restricción:** 1 uso, dentro de los primeros 3 turnos. El afectado se entera.
- **Cargas:** 1 uso (ventana 3 turnos).
- **Notas:** Sin cambios respecto al diseño original.

#### EXODIA
- **Efecto:** Si te bajas, ganas la ronda.
- **Restricción:** Solo válida dentro de los primeros 3 turnos. Ventana **estricta**,
  no ampliable.
- **Cargas:** 1 ronda (condición pasiva).
- **Notas:** La más swingy de la lista (victoria instantánea). Bajarse en 3 turnos
  en Carioca es casi imposible, así que funciona como "premio de lotería", no como
  problema real de balance. Mantener la ventana estricta ES lo que la balancea.

#### GUASON
- **Efecto:** Eliges una carta y **acuñas un comodín-de-pinta** de esa pinta (solo
  picas, solo corazones, etc.).
- **Restricción:** Dentro de los primeros 3 turnos (ventana global B1, §3.2). Con
  costo: reemplazas una carta de tu mano por el comodín-de-pinta.
- **Cargas:** 1 uso (ventana 3 turnos).
- **Comodín-de-pinta (carta NUEVA):** representa **cualquier carta de su pinta**
  (cualquier valor); sirve tanto en escalas como en tríos de esa pinta. Es MENOS
  flexible que el comodín normal (que sirve para cualquier pinta). NO es el comodín
  sin pinta de `carta.ts` — es un tipo de carta nuevo a modelar (Sesión 2).
- **Notas de implementación (del reporte de S1):**
  - **Se ACUÑA, no se saca del mazo.** A diferencia del comodín normal, no hay pool
    finito: la carta se genera. Por eso el modo de fallo `SIN_COMODINES` NO aplica a
    GUASON.
  - **Excepción al invariante de multiset:** acuñar una carta nueva mete al juego
    una carta que no existía. Es la ÚNICA costura que rompe deliberadamente el
    invariante de mazo que S1 preserva; debe declararse como excepción explícita.
  - **Decisiones abiertas** (ver §8): puntaje del comodín-de-pinta y destino de la
    carta reemplazada de la mano.

### 3.3 Grupo Doble Filo

> Estas habilidades tienen riesgo/beneficio incorporado por diseño.

#### DOBLE
- **Efecto:** Si ganas, los demás ganan el doble de puntos; si pierdes, ganas 50%
  más de puntos.
- **Restricción:** Se **anuncia públicamente** al resto que ese jugador tiene DOBLE
  esa ronda.
- **Cargas:** Pasiva / ronda.
- **Notas:** El anuncio genera tensión: todos tratarán de frenarlo.

#### PILLO
- **Efecto:** Si adivinas una carta de un jugador, la intercambias por la que
  quieras; si fallas, él elige qué carta robarte.
- **Restricción:** 1 intento / ronda.
- **Cargas:** 1 uso / ronda.
- **Notas:** Riesgo mutuo real ya incorporado. El tope de 1 intento evita spameo.

#### TOCO
- **Efecto:** Tu misión de victoria de esa ronda cambia a **una misión única y fija:
  formar una escala sucia** (escala con comodín permitido). Al formarla, ganas la
  ronda.
- **Restricción:** Reemplaza tu contrato normal esa ronda. No hay generación
  aleatoria ni presupuesto de dificultad — la misión es siempre la misma.
- **Cargas:** 1 ronda (condición de victoria sobrescrita).
- **Notas:** Esta versión **retira** el sistema anterior de "combinación aleatoria de
  12 cartas contra un presupuesto fijo" (B2), que en playtest salía descalibrado
  (p. ej. "3 escalas" en la mano 2). Una misión única y legible es más fácil de
  balancear: no hay modelo de dificultad ni constante `DIFICULTAD_MEDIA_9_MANOS`.
  A vigilar en playtest: una sola escala sucia es una meta **achievable/rápida**, así
  que el riesgo ahora es el opuesto — que TOCO sea demasiado fácil (victoria temprana).
  Diales si hiciera falta endurecerla: exigir que la escala sea **limpia**, o pedir
  una escala **más larga** que el mínimo de 4.

#### EXTRA
- **Efecto:** Puedes sacar dos cartas en un turno, ya sea del mazo o del foso.
- **Restricción:** **Con penalización** (para que sea doble filo real): al usarla,
  descartas 2 cartas ese turno (no 1) **o** pierdes tu próximo turno completo.
  Elegir cuál de las dos penalizaciones aplica queda como decisión abierta (§7).
- **Cargas:** 1 uso / ronda.
- **Notas:** Tal como estaba descrita era solo ventaja sin costo — la más fuerte
  de la lista sin trade-off. La penalización la convierte en verdadero doble filo.

---

## 4. Reglas anti-combo

Combinaciones prohibidas para un mismo jugador en una misma ronda:

| Combo | Motivo | Resolución |
|---|---|---|
| **PESAO + JUDIO** | Tomas cualquier carta del foso y nadie ve el foso: swap total e invisible | El pool de asignación no puede entregar ambas al mismo jugador la misma ronda |

> Nota de implementación: con 1 habilidad por jugador (§6.1 default) este combo
> solo surgiría si una habilidad concediera otra — hoy no ocurre. Pero si la
> config asigna **2 o 3 habilidades por jugador** (§6.1), el combo pasa a ser
> posible y el muestreo DEBE evitar entregar PESAO y JUDIO al mismo jugador en la
> misma ronda. Invariante a respetar en la Sesión 1 (core).

---

## 5. Sistema de pesos por tier

La asignación aleatoria NO es uniforme. El pool se pondera por tier para que sacar
una habilidad de alto impacto sea raro y sacar utilidad/info sea común.

| Tier | Peso | Habilidades |
|---|---|---|
| **Alto impacto (raras)** | 1 | EXODIA, GINYU, SAPO, JUDIO, DOBLE |
| **Impacto medio** | 2 | CHATO, TROLL, OJO, TOCO, PILLO, EXTRA |
| **Utilidad / info (comunes)** | 4 | DECRETALO, MISH, RADAR, AUGURIO, PESAO, GUASON, MATO |

> **Pesos 1/2/4 (aprobados tras medición).** Con 5 habilidades altas, 6 medias y 7
> comunes, el tier alto se lleva 11.1% del pool (5/45). El reparto original 1/3/6
> dejaba el tier alto en 7.7%: en una partida de 4 jugadores × 9 manos (36
> asignaciones), una habilidad rara concreta aparecía ~0.55 veces — prácticamente
> invisible. 1/2/4 la sube a ~0.8 y hace que el tier alto en conjunto salga ~4
> veces por partida, sin aplanar demasiado. Ajustable en playtest si se quiere más
> o menos caos.

---

## 6. Panel de configuración

Antes de iniciar la partida se abre un **panel de configuración**. Toda opción
tiene un valor por defecto para que "empezar rápido" funcione sin tocar nada. Los
ajustes se congelan al iniciar la partida (no se cambian a mitad de juego) y se
serializan como parte del estado de la sala, para que el host los propague a
todos los clientes por ambos transportes.

### 6.1 Habilidades por jugador
- **Qué controla:** cuántas habilidades recibe cada jugador por ronda.
- **Rango:** 1–3. **Default:** 1.
- **Notas:** con 2+, la regla anti-combo (§4) deja de ser hipotética y empieza a
  importar de verdad — hay que muestrear evitando pares prohibidos en el mismo
  jugador. Con 2+, considerar reducir cargas globales para no saturar la ronda.

### 6.2 Rondas a jugar
- **Qué controla:** qué manos de Carioca componen la partida.
- **Opciones:**
  - *Completa* — las 9 manos en orden estándar (**default**).
  - *Subconjunto* — elegir cuáles manos entran y en qué orden (ej. solo `Real` +
    `2t&1E`).
  - *Corta* — primeras N manos (partida rápida).
- **Notas:** Rumble reasigna habilidades por ronda (§6.5), así que menos rondas =
  menos rotación de habilidades por partida.

### 6.3 Pool de habilidades activas
- **Qué controla:** qué habilidades pueden salir en el sorteo.
- **Opciones:** toggle por **grupo** (General / Primeros 3 turnos / Doble filo) y
  toggle por **habilidad individual**. **Default:** todas activas.
- **Notas:** si un grupo queda vacío, el pool cae automáticamente a las restantes.
  Debe haber al menos tantas habilidades activas como exija §6.1 sin violar §6.6.

### 6.4 Preset de pesos
- **Qué controla:** la ponderación por tier del sorteo (§5).
- **Opciones:**
  - *Equilibrado* — tiers 1/2/4, raras son raras pero visibles (**default**).
  - *Caos* — uniforme, todas igual de probables (más alto impacto).
  - *Personalizado* — pesos manuales por tier.

### 6.5 Reasignación
- **Qué controla:** cuándo se reparten las habilidades.
- **Opciones:** *Por ronda* (se reasignan cada mano, **default**) / *Fijas*
  (una habilidad por jugador para toda la partida).

### 6.6 Repetición y colisión
- **Repetición entre rondas:** *permitir* / *excluir la última recibida*
  (**default: permitir**). Si se excluye, el pool necesita memoria por jugador
  entre rondas.
- **Colisión en la misma ronda:** *permitir duplicados* / *únicas por ronda*
  (muestreo sin reemplazo) (**default: permitir duplicados**).
- **Notas:** *únicas por ronda* exige `nº jugadores × §6.1 ≤` habilidades activas
  (§6.3); si no se cumple, el panel debe bloquear el inicio o forzar duplicados.

### 6.7 Penalización de EXTRA
- **Qué controla:** el filo de la habilidad EXTRA (§3.3).
- **Opciones:** *descartar 2 cartas ese turno* / *perder el próximo turno* /
  *aleatorio entre las dos*. **Default:** por decidir en playtesting (§8).

### 6.8 Visibilidad de la habilidad propia
- **Qué controla:** si cada jugador ve las habilidades ajenas.
- **Opciones:** *Secreta* (solo ves la tuya, **default**) / *Pública* (todos ven
  todo).
- **Notas:** DOBLE se anuncia igual (§3.3) aunque el modo sea *Secreta* — su
  anuncio es parte de su diseño, no una fuga de config.

> **Validación cruzada del panel:** antes de permitir "Iniciar", validar la
> viabilidad conjunta de §6.1 + §6.3 + §6.6 (habilidades suficientes) y que el
> pool activo no quede vacío. Estas validaciones viven en el core (Sesión 1).

---

## 7. Ciclo de asignación por ronda

1. Al **inicio de cada ronda** de Carioca (`2t`, `1t&1E`, `Real`, ...), se asigna
   a cada jugador el **número de habilidades definido en la config (§6.1)**,
   muestreadas del pool activo (§6.3) ponderado según el preset (§6.4).
2. Se resetean **cargas** y **ventanas de validez** (primeros 3 turnos, doble filo).
3. Se evalúan invariantes anti-combo (§4) y las reglas de repetición/colisión
   de la config (§6.6) antes de confirmar la asignación.
4. Las habilidades **pasivas de info** que dependen de snapshot (RADAR) toman su
   foto en este momento.
5. La asignación es **determinista bajo semilla** para poder testear (Sesión 1).

---

## 8. Decisiones abiertas

Marcadas para resolver antes o durante la implementación. Los agentes NO deben
resolverlas por su cuenta.

> Nota: la repetición entre rondas, la colisión de asignaciones y la penalización
> de EXTRA son opciones del panel de configuración (§6.6 y §6.7). Sus **valores por
> defecto** siguen abiertos donde se indica.

**Resueltas:**
- ✔ **Semántica de "primeros 3 turnos"** (B1): ventana **global**, turnos 1–3 de la
  ronda. Ver §3.2.
- ✔ **Métrica de dificultad de TOCO** (B2): **retirada.** TOCO pasó a **misión única
  fija: formar una escala sucia** (no hay presupuesto ni generación aleatoria). Ver
  §3.3 TOCO.
- ✔ **Modelo de autoridad de info oculta** (SAPO, RADAR, AUGURIO, MISH, PESAO):
  host autoritativo, revelaciones calculadas en el host. Ver `SPIKE_RUMBLE.md` §3.a.
- ✔ **Sobrescritura de condición de victoria** (EXODIA, TOCO): hoy NO existe → es un
  refactor aditivo de `carioca-core`. Ver `SPIKE_RUMBLE.md` §3.b.
- ✔ **Pesos por tier** (aprobados tras medición): **1/2/4**. Ver §5. Ajustable en
  playtest.
- ✔ **DECRETALO — probabilidad por robo** (aprobado tras medición): **0.35**. Ver
  §3.1. Ajustable en playtest.

**Abiertas** (todas de *feel* puro — se calibran jugando, no con tests):
1. **EXTRA — penalización por defecto:** el panel ofrece las tres opciones (§6.7);
   S2 dejó `descartar2` como default provisional. Pendiente de playtesting.
2. **GUASON — puntaje del comodín-de-pinta:** el comodín normal vale 30. Al ser
   menos flexible (una sola pinta), ¿vale 30 igual, o menos? S2 usó 30 provisional.
3. **GUASON — tier:** ¿sigue en común (peso 4) o sube a medio (peso 2) por el refuerzo
   del acuñado? Acoplado con su puntaje; se decide junto en playtest (§5).
4. **TOCO — dificultad de la misión única:** una escala sucia puede ser demasiado
   fácil (victoria rápida). Diales: exigir escala limpia, o una escala más larga que
   el mínimo. Pendiente de playtest (§3.3).

---

## 9. Inventario rápido (18 habilidades)

**General (8):** DECRETALO, MISH, RADAR, AUGURIO, SAPO, JUDIO, PESAO, OJO
**Primeros 3 turnos (6):** GINYU, CHATO, MATO, TROLL, EXODIA, GUASON
**Doble filo (4):** DOBLE, PILLO, TOCO, EXTRA
