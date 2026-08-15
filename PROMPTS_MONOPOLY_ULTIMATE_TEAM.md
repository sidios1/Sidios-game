# PROMPTS_MONOPOLY_ULTIMATE_TEAM.md

## Roadmap de sesiones

Patrón establecido en Sidios: core puro con Vitest → fuente de datos → integración server → render cliente → multiplayer. Sesiones estrictamente secuenciales, `/clear` entre cada una, Plan Mode primero.

- [x] **S0** — Spike de arquitectura → `SPIKE_MONOPOLY_ULTIMATE_TEAM.md`
- [x] **S0b** — Mini-spike de datos (jugadores/técnicos/clubes) → `SPIKE_DATOS_JUGADORES.md`
- [ ] **S1** — Core puro + Vitest (tablero, turnos, economía, cartas, quiebra, Descendido) — prompt abajo
- [ ] **S2** — Fuente de datos real (`jugadores_monopoly.json`, `tecnicos_monopoly.json`, `clubes_monopoly.json`), sistema de tiers por percentil, reemplaza los mocks de S1
- [ ] **S3** — Integración server (`motorMonopoly.ts` implementando `MotorJuego<EstadoMonopoly, AccionMonopoly>`, alta en `REGISTRO`, `VistaMonopoly` en la unión de `VistaJuego`)
- [ ] **S4** — Render cliente single-client (tablero, fichas/clubes, sobres, dados, cartas)
- [ ] **S5** — Multiplayer + fase de armado y votación final (5 min, 12 categorías todos-contra-todos, desempate 1 a 1)

Los prompts de S2 en adelante se redactan al terminar la sesión anterior, con contexto real del código ya escrito — no se prediseñan de antemano (mismo criterio que MeloQuiz).

---

## Sesión S1 — Core puro + Vitest

> Modo Plan primero (Shift+Tab twice). `/clear` antes de empezar.

```xml
<rol>
Eres un ingeniero de software senior implementando el core puro de un nuevo motor de juego en un monorepo TypeScript (Sidios), siguiendo el patrón ya probado en `mentiroso-core`/`meloquiz-core`: paquete standalone, sin dependencias declaradas a otros paquetes del monorepo, testeado con Vitest antes de tocar servidor o cliente.
</rol>

<contexto>
Estás implementando `monopoly-core` para **Monopoly Ultimate Team**: modo tipo Monopoly (celdas, dados, presupuesto) donde las celdas representan ligas de fútbol y, en vez de comprar propiedades, los jugadores compran "sobres" con jugadores aleatorios para armar un equipo.

El reglamento completo y cerrado está en `REGLAS_MONOPOLY_ULTIMATE_TEAM.md`. La auditoría de arquitectura (`SPIKE_MONOPOLY_ULTIMATE_TEAM.md`) ya determinó:
- `monopoly-core` es un motor **standalone de primer orden** (patrón Mentiroso/MeloQuiz), NO un wrapper tipo `MotorRumble` — no envuelve ningún motor existente.
- `MotorJuego<E,A>` no requiere modificarse — el puerto ya es genérico (probado por MeloQuiz, que tampoco usa cartas/mazo).
- El RNG determinista se **duplica** dentro de `monopoly-core` (no se reusa el de `carioca-core`) para mantenerlo 100% standalone.
- La ventana de renegociación se modela como **marca de turno de cierre** (`turnoDeCierre`) comparada contra un contador global de turnos del motor — no como fase temporizada de reloj real.

Esta sesión NO incluye la fuente de datos real de jugadores/técnicos/clubes (eso es S2) ni la integración con el servidor/orquestador (eso es S3) — usa una fuente de datos mockeada/inyectable.
</contexto>

<instrucciones>
1. Lee `REGLAS_MONOPOLY_ULTIMATE_TEAM.md` completo y `SPIKE_MONOPOLY_ULTIMATE_TEAM.md` secciones 2, 3 y 7.
2. Crea el paquete `monopoly-core` con:
   - **Tipos de estado**: `EstadoMonopoly` (posición de cada jugador, presupuesto, "Mi Club" — inventario único de jugadores/técnicos conseguidos, celdas con ventana de renegociación abierta y su `turnoDeCierre`, estado Descendido por jugador, mazo de Prensa Deportiva, pozo de Palco del Club).
   - **Tipos de acción**: `AccionMonopoly` (tirar dados, comprar sobre, declinar/pujar en subasta, renegociar, intercambiar, pagar multa para salir de Descendido).
   - **Tablero**: las 40 celdas en el orden clásico de Monopoly reskineado (sección 2 del reglamento) — 8 grupos de liga (22 celdas), Resto del Mundo (4), Técnicos (2), las 4 esquinas, las 2 celdas de impuesto, 3 Prensa Deportiva, 3 Pausa de Hidratación.
   - **Motor de turnos**: 2 dados, dobles = turno extra, 3 dobles seguidos → Descendido (sección 2.1).
   - **Economía**: compra directa o subasta (con obligación de comprar si nadie puja), ventana de renegociación forzada con `turnoDeCierre` (aplica solo a compra directa, no a subasta; sigue corriendo aunque el jugador esté en Descendido), reactivación de celda tras cerrarse la ventana, quiebra inmediata sin liquidación (sección 3, 3.3).
   - **Descendido**: entrada por "Ir a la Cárcel", 3 dobles seguidos, o carta "Descendiste"; salida por multa o dobles antes del turno 3; pérdida de jugador aleatorio si no sale a tiempo (sección 4).
   - **Cartas de Prensa Deportiva**: las 16 cartas de la sección 5, con sus efectos.
   - **Fuente de datos de sobres**: interfaz inyectable (`FuenteSobres` o similar) que S2 va a implementar con datos reales — para esta sesión, usa una implementación mock/de prueba con jugadores ficticios.
3. Cubre con Vitest: movimiento y dobles, compra/subasta/obligación de comprar, ventana de renegociación (apertura, snipe compuesto al 200%, cierre por `turnoDeCierre`, no-aplica-a-subasta, sigue corriendo con Descendido de por medio), reactivación de celda tras la ventana, Descendido (las 3 vías de entrada, las 2 de salida, pérdida de jugador), quiebra, y al menos las cartas con efecto económico o de movimiento.
</instrucciones>

<restricciones>
- Aditivo únicamente: no tocar código funcionando de otros paquetes.
- `monopoly-core` sin sección `dependencies` en su `package.json` — 100% standalone, como `mentiroso-core`.
- No implementar la fuente de datos real ni tocar el servidor/orquestador — fuera de alcance de esta sesión.
- No resolver autónomamente ninguna ambigüedad de reglas — si aparece algo que `REGLAS_MONOPOLY_ULTIMATE_TEAM.md` no cubre, se documenta como pregunta abierta, no se asume.
- Si el tiempo no alcanza para la votación final (agregación de las 12 categorías), queda fuera de esta sesión y se anota como candidato a S1b — no se apura ni se deja a medio implementar.
</restricciones>

<criterio_de_hecho>
La sesión se considera completa cuando `monopoly-core` compila, pasa `typecheck` en modo estricto, y los tests de Vitest cubren cada punto del punto 3 de <instrucciones> con casos concretos (no solo el camino feliz — incluir bordes como "nadie puja", "3 dobles seguidos", "renegociación con Descendido de por medio").
</criterio_de_hecho>

<cierre>
Al terminar, resume en 3-5 líneas qué quedó implementado, qué se dejó fuera de alcance (ej. votación final si no alcanzó), y qué necesita la sesión S2 (fuente de datos) de la interfaz `FuenteSobres` para integrarse sin fricción.
</cierre>
```
