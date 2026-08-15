# REGLAS_MONOPOLY_ULTIMATE_TEAM.md

> Estado: **Diseño cerrado + spikes completados** (arquitectura: `SPIKE_MONOPOLY_ULTIMATE_TEAM.md` / datos: `SPIKE_DATOS_JUGADORES.md`) — listo para sesión S1 de implementación (core puro + Vitest)
> Nombre del juego: **Monopoly Ultimate Team**

## 1. Concepto

Modo de juego estilo Monopoly (celdas, dados, presupuesto). En vez de comprar propiedades, los jugadores compran **sobres**: cada celda pertenece a una liga de fútbol, y el sobre contiene un jugador aleatorio de esa liga en la posición que el comprador elija. El objetivo final es armar la mejor plantilla (11 titulares + técnico) y ganarla por votación social del resto de jugadores.

### 1.1 Preparación inicial

- Cada jugador abre **6 sobres iniciales** antes de empezar a mover (elige liga y posición igual que un sobre normal del tablero). **Gratuitos** — no descuentan del presupuesto de 1000M.
- Cada jugador elige gratis un **club como ficha/identidad visual** en el tablero (`datos/clubes_monopoly.json`, 207 clubes) — no es una compra económica, no descuenta presupuesto, sin efecto de juego más allá de lo visual. Si dos jugadores quieren el mismo club, se resuelve por orden de turno: el primero en elegir se lo lleva, no se repiten.
- **Primera ronda: los sobres del tablero no están habilitados.** Si caes en una celda, no pasa nada (ni compra ni subasta) — el tablero se activa recién en la ronda 2.

## 2. Tablero

- **Orden espacial: igual al Monopoly clásico** — mismo orden exacto de 40 casillas (grupos de color, ferrocarriles, servicios y esquinas en las mismas posiciones relativas), solo se reemplazan los nombres por las ligas/conceptos de este juego.
- **8 grupos de color = 8 ligas**, ordenadas de más barata a más cara (Chile/Argentina/Brasil reemplazadas tras el mini-spike de datos — ver `SPIKE_DATOS_JUGADORES.md`):
  MLS → Arabia Saudita (ROSHN Saudi League) → Liga Portugal → Ligue 1 → Bundesliga → Serie A → La Liga → Premier League
- **Ferrocarriles (4 celdas) → "Resto del Mundo"** — sobre da un jugador random de cualquier liga fuera de las 8 principales, incluyendo los 115 jugadores "Icon" del dataset (Pelé, Maradona, etc.). Precio: **$100M** cada una.
- **Servicios (2 celdas) → "Técnicos"** — sobre da un técnico random. Precio: **$20M** cada una.
- **Esquinas:**
  - Salida → **Nueva Temporada** (cobras **$100M** de presupuesto al pasar/caer)
  - Cárcel → **solo de visita**, sin efecto (igual que en el Monopoly clásico — nadie entra en "Descendido" por caer acá directo)
  - Parqueo Gratis → **Palco del Club** (acumula multas y pagos "muertos"; quien cae ahí se lleva el pozo)
  - Ir a la Cárcel → **Descenso a la B** — entras al estado **Descendido** (ver sección 4)
- **Casillas de impuesto (2):** alimentan el Palco del Club (Parqueo Gratis), igual que las otras multas del juego.
  - **Multa por Doping** (equivalente a Income Tax, ubicada entre la liga más barata y el primer ferrocarril): paga **$100M**
  - **Multa por Apuestas** (equivalente a Luxury Tax, ubicada entre las dos celdas de Premier League): paga **$50M**

### 2.1 Turno y dados

- **2 dados de 6 caras**, igual al Monopoly clásico.
- Sacar dobles: tiras de nuevo (turno extra).
- **3 dobles seguidos en la misma secuencia de turno: vas directo a Descendido**, sin avanzar el resultado del tercer dado.

## 3. Economía

- Presupuesto inicial: **1000M** para todos.
- **Durante la fase de tablero, todo lo que consigues (jugadores, técnicos) se guarda en un inventario único: "Mi Club".** No existe distinción entre titular y banca todavía — esa separación recién se define en la fase de armado final (sección 7).
- Al caer en celda libre: comprar sobre (jugador random de esa liga, **posición elegida por el comprador**) o declinar → sale a **subasta**: puja libre y ascendente, arranca en **$10M**, con incremento mínimo de **$10M** entre pujas. **Si nadie puja, el jugador que declinó queda obligado a comprar el sobre al precio de lista.**
- **Filtro de elegibilidad (aplica a todo el pool de jugadores, cualquier fuente — ligas y Resto del Mundo):** un jugador solo puede aparecer en un sobre si su posición **principal o secundaria** (campos `posicion`/`posicionesPosibles` del dataset) coincide con alguna de las 9 posiciones que usa la formación 4-3-3: **GK, RB, CB, LB, CM, CAM, RW, ST, LW**. Un jugador cuya posición principal Y secundaria sean ambas CDM, LM o RM (fuera de esas 9) **nunca puede salir en un sobre** — no entra al pool en absoluto. Esto reduce los casos de jugadores "muertos" que solo podrían ir a banca.
- El sobre es **fijo una vez abierto** — no existen mejoras/niveles. Su único cambio de valor es por reventa forzada.
- **Intercambio entre jugadores: libre**, en cualquier momento — dinero y/o jugadores, sin restricciones.
- **Ventana de renegociación forzada:** al **comprar directamente** (no aplica a sobres ganados por subasta — la subasta es definitiva), la celda queda pausada 1 ronda. Durante esa ventana, cualquiera que caiga ahí puede forzar la compra pagando **200% del último precio pagado** (compuesto: cada nueva renegociación es 200% de la anterior, no del precio original). La ventana cuenta turnos normales — si el comprador cae en Descendido durante la ventana, esta sigue corriendo igual y puede cerrarse mientras está fuera. Se cierra cuando el turno vuelve al comprador original.
- **Nadie es dueño de ninguna celda — solo se es dueño del jugador (carta).** Al cerrarse la ventana de pausa, la celda **se rehabilita** y vuelve a estar disponible: el próximo jugador que caiga ahí compra un **sobre nuevo** (jugador random fresco de esa liga), no pelea por la carta ya asignada. Esto aplica también a Resto del Mundo y Técnicos — ninguna celda se agota nunca, así que la oferta de cartas no tiene techo fijo y las 2 celdas de Técnicos alcanzan para cualquier cantidad de jugadores a lo largo de la partida.
- Precio escalonado dentro de cada liga (como Monopoly clásico) — el precio ya **no** afecta la probabilidad de "mejor jugador" dentro de una misma liga (la idea inicial de "celda más cara = mejor probabilidad" queda reemplazada por el sistema de tiers de la sección 3.2, más simple y siempre sostenible con la data real).

### 3.1 Tabla de precios

| Liga | Celdas | Precio |
|---|---|---|
| MLS | 2 | $10M / $20M |
| Arabia Saudita | 3 | $30M / $30M / $45M |
| Liga Portugal | 3 | $55M / $55M / $65M |
| Ligue 1 | 3 | $75M / $75M / $90M |
| Bundesliga | 3 | $100M / $100M / $110M |
| Serie A | 3 | $120M / $120M / $135M |
| La Liga | 3 | $145M / $145M / $155M |
| Premier League | 2 | $170M / $200M |

Progresión reescalada de $60→$400 (clásico) a **$10M→$200M**, manteniendo las mismas proporciones relativas entre ligas. 22 celdas totales, coherente con el tablero clásico de 22 propiedades.

### 3.2 Tiers y probabilidades del sobre

- **Tiers por `rating`, relativos al pool específico** (no un valor de rating fijo global — cada liga y Resto del Mundo calculan sus propios percentiles de forma independiente, así el sistema siempre es sostenible sin importar cuántos jugadores de alto rating tenga cada liga en el dataset):
  - **Malo** = percentil inferior del pool
  - **Normal** = percentil medio
  - **Raro** = percentil superior del pool
- **Celdas de liga** (las 22 celdas de las 8 ligas principales): 25% Malo / 50% Normal / 25% Raro → tiers definidos como percentil 0-25 / 25-75 / 75-100 de esa liga específica.
  - **Celda más cara de cada liga:** +20 puntos porcentuales a Raro, a costa de Malo (Normal sin cambios) → **5% Malo / 50% Normal / 45% Raro** solo en esa celda.
- **Resto del Mundo** (ferrocarriles): 40% Malo / 20% Normal / 40% Raro → tiers definidos como percentil 0-40 / 40-60 / 60-100 del pool de Resto del Mundo. Sin variación por celda (las 4 celdas de ferrocarriles no tienen precio distinto entre sí, igual que en el Monopoly clásico).
- Ejemplo: el "Raro" de MLS no es el mismo rating que el "Raro" de Premier League (pools muy distintos en calidad), pero ambos tienen la misma probabilidad de salir: 25%, dentro de su propia liga.

### 3.3 Quiebra

- Un jugador entra en **quiebra** si no puede cubrir un pago obligatorio (impuesto, multa de Descendido, renegociación forzada, compra obligatoria por subasta desierta, etc.) y su presupuesto llega a $0 o queda en negativo.
- El jugador en quiebra **deja de jugar el tablero** por el resto de la fase de tablero (no vuelve a tirar dados ni participa en compras/subastas/intercambios) — pero **conserva todos los jugadores/sobres que ya había conseguido**.
- Al terminar la fase de tablero (sección 6), el jugador en quiebra vuelve a participar normalmente: arma su equipo con lo que tenga (fase de 5 minutos) y entra a la votación final igual que los demás.
- *Sin definir todavía (detalle menor, no bloqueante):* si el jugador debe liquidar/vender jugadores antes de ser declarado en quiebra, o si la quiebra es inmediata apenas no puede pagar. Asumido: **inmediata**, sin paso de liquidación forzada.

## 4. Descendido (Descenso a la B)

- Se entra por caer en "Ir a la Cárcel" o por sacar 3 dobles seguidos.
- Al caer, pierdes turnos.
- Para salir: pagar multa de **$25M** o sacar dobles, antes de terminar tu 3er turno ahí.
- Si no lograste ninguna de las dos antes del turno 3: **pierdes un jugador aleatorio de tu equipo** (el contrato se rescinde por bajar de categoría).

## 5. Cartas de evento

Una sola baraja real:
- **Prensa Deportiva** (ocupa las 3 casillas de "Fortuna"/Chance del tablero clásico) — eventos volátiles/impredecibles, se roba una carta al caer.

Las 3 casillas de "Arcas Comunales"/Community Chest del tablero clásico ya **no** tienen baraja — pasan a llamarse **Pausa de Hidratación**: sin ningún efecto, solo un descanso (no se roba carta, no pasa nada).

Set completo de Prensa Deportiva (16 cartas, como Monopoly clásico):

**Prensa Deportiva (volátil):**
1. Fichaje bomba: tu próximo sobre cuesta mitad de precio
2. Viral en redes: recibe $50M en patrocinio
3. Escándalo de vestuario: pierdes 1 turno
4. Lesión de último minuto: pierdes un jugador aleatorio de tu equipo
5. Descendiste: vas directo a Descendido
6. Entrevista exclusiva: recibe $25M
7. Crisis de resultados: paga $40M
8. Fichaje sorpresa: puedes robar un jugador de Mi Club de cualquier rival (si tiene alguno)
9. Renovación de contrato: recibe $35M
10. Rumor de salida: paga $30M en gastos de agente
11. Portada de revista: avanza hasta Nueva Temporada y cobra el paso
12. Suspensión mediática: retrocede 3 casillas
13. Doble fichaje: compra dos sobres al precio de uno (misma liga)
14. Fake news: paga $20M en gestión de crisis
15. Racha ganadora: recibe $60M
16. Cambio de agente: elige un jugador de Mi Club y cámbialo por un sobre nuevo de esa misma liga (si no tienes ningún jugador todavía, la carta no tiene efecto)

## 6. Fin de partida

Termina cuando se cumplen las **rondas fijas** definidas por el host antes de empezar.

## 7. Votación final

- Fase de armado: **5 minutos** para que cada jugador arme su equipo con lo que juntó en "Mi Club". De ahí elige **11 titulares + técnico**; lo que sobra o no se usa queda en la **banca** (no afecta la votación).
- **Formación fija para todos: 4-3-3**, con posiciones nombradas: **POR - LD - DFC - DFC - LI - MC - MCO - MC - ED - DC - EI** (11 slots; los labels DFC y MC se repiten dos veces cada uno, pero cada slot es una categoría de voto independiente).
- **Mapeo slot → posición del dataset** (ratificado): POR→GK, LD→RB, DFC→CB (ambos slots), LI→LB, **MC→CM (ambos slots)**, MCO→CAM, ED→RW, DC→ST, EI→LW. Con el filtro de elegibilidad de la sección 3, los jugadores cuya única posición (principal y secundaria) sea CDM, LM o RM ya ni siquiera entran al pool de sobres — no llegan a "Mi Club" a menos que tengan alguna de las 9 posiciones usadas como secundaria.
- Votación por **12 categorías** (11 posiciones de titular + técnico), voto libre y subjetivo, uno por categoría.
- **Mecanismo de voto:** todos contra todos — cada categoría se vota comparando al jugador de esa posición entre **todos** los equipos a la vez (no par a par); autovoto permitido.
- **Equipo incompleto:** un slot vacío hace que ese jugador **pierda automáticamente esa categoría** (no compite por ella; los demás votan igual entre quienes sí tienen esa posición cubierta).
- **Ganador final:** quien se lleve más categorías.
- **Empate (en cualquier nivel — una categoría individual, o el resultado final entre categorías ganadas):** se **revota solo entre los empatados**, repitiendo la votación las veces que haga falta hasta que quede un ganador claro. No hay "nadie gana" ni límite de rondas de revotación — mismo mecanismo sin importar si son 2 empatados o más.

## 8. Pendientes / Provisionales

> Reabierto tras `SPIKE_MONOPOLY_ULTIMATE_TEAM.md` (arquitectura) y `SPIKE_DATOS_JUGADORES.md` (datos): ambos spikes encontraron huecos reales del reglamento no cubiertos en el cierre original. **Todos los ítems quedan resueltos.**

- [x] Nombre del juego: **Monopoly Ultimate Team**
- [x] Tabla de precios (sección 3.1)
- [x] Set de cartas (sección 5)
- [x] Orden espacial de celdas (sección 2)
- [x] Dados y regla de dobles (sección 2.1)
- [x] Definición de "mejor jugador" (campo `rating` del dataset, ver `SPIKE_DATOS_JUGADORES.md`)
- [x] Fuente de datos de jugadores (dataset EA FC vía futmind.com, 4200 jugadores — ver `SPIKE_DATOS_JUGADORES.md`)
- [x] Cobertura de las 8 ligas (Chile/Argentina/Brasil reemplazadas por MLS/Arabia Saudita/Liga Portugal)
- [x] Orden de precio de MLS/Arabia Saudita/Liga Portugal: confirmado (MLS → Arabia → Portugal)
- [x] Destino de los 115 jugadores "Icon" (van a "Resto del Mundo")
- [x] Si la ventana de renegociación aplica a sobres ganados por subasta (no aplica)
- [x] Qué pasa con la ventana de renegociación si hay saltos de turno de por medio (cuenta igual)
- [x] Validación de un equipo incompleto (slots vacíos del 4-3-3) al llegar a la votación
- [x] Mecanismo exacto de voto por categoría (autovoto, quién vota a quién) y del desempate 1 a 1
- [x] Ficha de jugador = club elegido gratis al inicio (sección 1.1)
- [x] Tabla exacta de probabilidades por precio (sección 3.2 — tiers relativos por percentil, no rating fijo)
- [x] Modelo de ownership: las celdas nunca se agotan — solo se posee al jugador (carta), la celda se rehabilita tras la ventana de pausa (resuelve la escasez de técnicos y de jugadores para 5-6 personas sin tocar la cantidad de celdas)
- [x] Repricing completo: presupuesto 1000M, precios de sobre reescalados a $10M-$200M, y Nueva Temporada/multas/subasta/cartas reescalados proporcionalmente
- [x] Precio de Resto del Mundo ($100M) y Técnicos ($20M) — nunca habían quedado definidos
- [x] Quiebra: inmediata, sin liquidación forzada de activos
- [x] Concepto "Mi Club": inventario único durante la fase de tablero, sin distinción titular/banca hasta la fase de armado final
- [x] Si `monopoly-core` reusa el RNG determinista de `carioca-core` o lo duplica para quedar standalone — **decidido: duplicar**, `monopoly-core` queda 100% standalone sin dependencias
- [x] Implementación concreta de la ventana de renegociación — **decidido: marca de turno de cierre** (`turnoDeCierre`), comparada contra un contador global de turnos del motor. Más robusto que un contador regresivo porque pueden existir varias ventanas abiertas simultáneamente sin que ninguna necesite actualizarse turno a turno.
- [x] Mapeo slot↔posición para los 2 slots "MC": **ambos → CM**, CDM/LM/RM siempre quedan en banca (ratificado; ver tabla completa en `SPIKE_DATOS_JUGADORES.md` sección 6)
- [x] Criterio de empate unificado: cualquier empate (categoría individual o resultado final) se resuelve **revotando solo entre los empatados**, repetido hasta que quede un ganador claro — sin "nadie gana" y sin límite de rondas de revotación

## 9. Pendiente de sincronización código↔reglamento

- [x] ~~`votacionFinal.ts` implementaba "empate en categoría = nadie se la lleva"~~ — corregido en sesión S1c: `resolverDesempate` generalizado sin límite de empatados, usado tanto para empate de categoría como para el resultado final. 129/129 tests, cero regresiones.
- [x] Filtro de elegibilidad de jugadores por posición — implementado en sesión S2 (`packages/monopoly-fuente-datos`).
- [x] **Decisión tomada en S2: un jugador con más de una posición elegible aparece duplicado en el `PoolSobres`, una vez por cada posición.** Afecta al 42% del dataset filtrado. Consecuencia: el mismo futbolista real puede terminar con más de una carta en una misma partida (una por cada posición con la que fue sorteado).
- [x] **Resuelto: un futbolista real puede tener varias entradas en el pool (una por posición elegible), pero solo puede salir sorteado UNA vez por partida.** Una vez que cualquier jugador obtiene a un futbolista (en cualquiera de sus posiciones), todas sus otras entradas (con otras posiciones) se retiran del pool para el resto de esa partida — no puede volver a salir, ni para el mismo jugador ni para un rival. **Implementado en sesión S2b:** `EstadoMonopoly.jugadoresRealesSorteados` (registro inmutable, se resetea solo porque `crearPartida` construye el estado desde cero) + `excluirYaSorteados` en `muestreo.ts`, aplicado en los 3 puntos de sorteo.
