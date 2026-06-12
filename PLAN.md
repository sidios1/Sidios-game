# PLAN.md — Plataforma de juegos multijugador (ejecución por Claude Code)

> **Cómo usar este archivo.** Cada fase es **una sesión**. Para cada una:
> 1. `/clear` (contexto limpio).  2. Plan Mode (Shift+Tab dos veces).  3. Pega el PROMPT de la fase.
> 4. Aprueba el plan que propone.  5. Implementa → tests verdes → commit.  6. `/clear` y siguiente.
>
> Los prompts están escritos con técnicas de prompt engineering de Anthropic: estructura XML
> (rol, contexto, instrucciones, restricciones, ejemplos, criterio de hecho), y ejemplos few-shot
> concentrados donde hay ambigüedad de patrones (sobre todo Fase 1).
>
> Docs de apoyo que el agente lee cada sesión: `PLAN.md`, `REGLAS_CARIOCA.md` y `CLAUDE.md`
> (se crea en la Fase 0).

---

## Stack (referencia rápida)
- **TypeScript** en todo el monorepo.
- **carioca-core**: lógica pura, sin Three.js ni Colyseus → testeable con **Vitest**.
- **server**: **Colyseus** (salas con código, estado autoritativo).
- **client**: **Tauri** (escritorio) + **Three.js** (cartas, mesa, animaciones).

## Estructura objetivo del repo
```
/
├── PLAN.md
├── REGLAS_CARIOCA.md
├── CLAUDE.md
├── package.json (workspaces)
└── packages/
    ├── carioca-core/   (lógica + tests)
    ├── server/         (Colyseus)
    └── client/         (Tauri + Three.js)
```

---

# FASE 0 — Scaffolding del repo + CLAUDE.md  `[CLAUDE CODE]`

**Objetivo:** monorepo vacío, herramientas y `CLAUDE.md` del proyecto.

**PROMPT:**
```text
<rol>
Eres un ingeniero senior de TypeScript especializado en monorepos y tooling. Configuras
proyectos limpios, con tipado estricto y separación clara de responsabilidades.
</rol>

<contexto>
Inicio de un proyecto nuevo: una plataforma de juegos de cartas multijugador para escritorio,
cuyo primer juego será Carioca. En la raíz están PLAN.md y REGLAS_CARIOCA.md. Léelos.
</contexto>

<instrucciones>
Antes de tocar archivos, propón un plan y espera mi aprobación.
Implementa SOLO la Fase 0:
1. Monorepo con workspaces (npm o pnpm) y tres paquetes vacíos: packages/carioca-core,
   packages/server, packages/client.
2. TypeScript en modo strict en todos.
3. Vitest configurado en carioca-core.
4. Crea CLAUDE.md (menos de 200 líneas) con: stack, estructura de carpetas, convenciones
   (TS strict, nombres en español), la regla de que carioca-core es lógica pura, que el
   servidor es la autoridad del estado, y un apartado "qué NO hacer".
5. git init y commit inicial.
</instrucciones>

<restricciones>
- carioca-core NO debe depender de Three.js ni Colyseus.
- No implementes lógica de juego todavía; esta fase es solo estructura.
</restricciones>

<criterio_de_hecho>
`tsc` compila sin errores, `vitest` corre (aunque haya 0 tests) y existe CLAUDE.md.
</criterio_de_hecho>

<cierre>
Commit: "chore: scaffolding monorepo + CLAUDE.md".
</cierre>
```

---

# FASE 1 — Motor `carioca-core` (lógica + tests)  `[CLAUDE CODE]`

**Objetivo:** toda la lógica de Carioca, autoverificada, sin render ni red.

**PROMPT:**
```text
<rol>
Eres un ingeniero de TypeScript experto en motores de juegos de cartas y en diseño guiado
por tests. Escribes lógica pura, determinista y bien cubierta por pruebas.
</rol>

<contexto>
Lee CLAUDE.md, PLAN.md y REGLAS_CARIOCA.md. La sección 9 de REGLAS_CARIOCA.md trae los
contratos como datos (MANOS, VALOR_PUNTOS, ESCALA); úsalos como configuración, no hardcodees.
Trabaja SOLO en packages/carioca-core.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Implementa:
1. Modelos: Carta, Mazo (2 mazos ingleses + 4 comodines = 108 cartas), Mano, Jugador.
2. Validadores: trío, escala, y cumplimiento del contrato de cada una de las 9 manos.
3. Comodines: máximo 1 por combinación; escala sucia admite 1; escala real ninguno.
4. Máquina de turnos: robar (mazo o pozo), descartar, bajarse (solo con el contrato exacto),
   pegar (solo en turnos posteriores al de bajarse).
5. Puntaje: 2-9 su número, 10/J/Q/K = 10, As = 20, comodín = 30. Quien se baja suma 0.
6. Manos finales (sucia y real): al completar la escala de 13 se gana sin descartar.
</instrucciones>

<ejemplos>
<!-- Trío: 3 cartas del mismo número, cualquier pinta -->
VÁLIDO   trío:   7♥ 7♣ 7♠
INVÁLIDO trío:   7♥ 7♥ 8♥        (no es el mismo número)
VÁLIDO   trío:   7♥ 7♣ [comodín] (1 comodín permitido)

<!-- Escala: 4+ consecutivas de la MISMA pinta. As es puente (K-A-2 válido), la secuencia
     da la vuelta por el As -->
VÁLIDO   escala: 4♦ 5♦ 6♦ 7♦
VÁLIDO   escala: Q♠ K♠ A♠ 2♠ 3♠ (As conectando los extremos)
INVÁLIDO escala: 4♦ 5♦ 6♣ 7♦    (pintas mezcladas)
INVÁLIDO escala: 4♦ 5♦ 6♦       (solo 3 cartas; mínimo 4)
</ejemplos>

<restricciones>
- No toques packages/server ni packages/client.
- Nada de dependencias de Three.js ni Colyseus.
</restricciones>

<criterio_de_hecho>
Tests en Vitest que cubran: una partida completa simulada de la mano 1 a la 9, uso de
comodines, As como puente, manos inválidas y cálculo de puntaje. Todos en verde, sin errores
de tipos.
</criterio_de_hecho>

<cierre>
Commit: "feat(core): motor de reglas de Carioca + tests".
</cierre>
```

---

# FASE 2 — Servidor Colyseus (red)  `[CLAUDE CODE]`

**Objetivo:** salas con código, estado autoritativo, información oculta por jugador.

**PROMPT:**
```text
<rol>
Eres un ingeniero de backend experto en multijugador en tiempo real con Colyseus y en
arquitecturas con servidor autoritativo.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/server. Importa carioca-core como dependencia
pero NO lo modifiques.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Implementa con Colyseus:
1. CariocaRoom: crear sala devuelve un código; otros se unen pegando ese código.
2. Estado sincronizado con @colyseus/schema. El servidor es la autoridad: el cliente envía
   intenciones (robar, descartar, bajarse, pegar) y el servidor las valida con carioca-core.
3. Información oculta por jugador.
4. Soporte de 2 a 4 jugadores, turnos y avance entre las 9 manos.
</instrucciones>

<ejemplos>
<!-- Principio de información oculta -->
CORRECTO:   el estado que recibe el Jugador A incluye SU mano, el descarte y la mesa.
INCORRECTO: el estado que recibe el Jugador A incluye las cartas en mano del Jugador B.
</ejemplos>

<restricciones>
- No modifiques carioca-core; solo consúmelo.
- La lógica de reglas vive en carioca-core, no la dupliques en el servidor.
</restricciones>

<criterio_de_hecho>
Un test de integración simula dos clientes que se conectan por código y juegan una partida
completa mediante mensajes (sin UI). Pasa en verde.
</criterio_de_hecho>

<cierre>
Commit: "feat(server): CariocaRoom con salas por código".
</cierre>
```

---

# FASE 3 — Cliente Three.js: render y animaciones  `[CLAUDE CODE]`

**Objetivo:** ver y jugar Carioca conectado a la sala.

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend gráfico experto en Three.js y en animación de interfaces de
juego. Generas visuales por código, sin depender de assets externos.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client y conéctate al servidor de la Fase 2.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Implementa con Three.js y TypeScript:
1. Escena 3D: mesa, cámara y luces.
2. Cartas como planos con textura generada por código (canvas: número + pinta).
3. Raycasting para seleccionar cartas con el mouse.
4. Animaciones con tweening: repartir, robar del mazo o del pozo, descartar, bajarse.
5. Cliente Colyseus: unirse por código y renderizar el estado sincronizado.
6. HUD: tu mano, de quién es el turno, y el contrato de la mano actual.
</instrucciones>

<restricciones>
- El estado de la red es la verdad; las animaciones solo lo representan, NO lo alteran.
- Nada de assets externos: las caras de las cartas se generan por código.
</restricciones>

<criterio_de_hecho>
Se juega una partida completa de Carioca online entre dos instancias, con cartas y
animaciones visibles.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): render Three.js + animaciones".
</cierre>
```

> Tras esta fase: **playtest tuyo** `[HUMANO]` para ajustar sensación y velocidad.

---

# FASE 4 — Hub modular  `[CLAUDE CODE]`

**Objetivo:** la plataforma que aloja varios juegos, con Carioca enchufado vía interfaz común.

**PROMPT:**
```text
<rol>
Eres un arquitecto de software experto en diseño de plugins y en interfaces que desacoplan
módulos. Priorizas que agregar funcionalidad nueva no obligue a tocar lo existente.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client y en código compartido.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Implementa:
1. Una interfaz común IJuego (iniciar, sincronizarEstado, procesarAcción, finalizar) en
   una ubicación compartida.
2. Refactoriza Carioca para que IMPLEMENTE IJuego, sin cambiar su lógica de reglas ni su red.
3. Una pantalla de hub: sala de espera y selección de juego.
4. Flujo: entrar al hub -> elegir Carioca -> jugar -> volver al hub.
</instrucciones>

<restricciones>
- Regla de oro: agregar un juego nuevo no debe requerir tocar el hub ni la capa de red.
- No alteres carioca-core ni el servidor.
</restricciones>

<criterio_de_hecho>
Se completa el flujo hub -> Carioca -> hub sin tocar carioca-core ni server.
</criterio_de_hecho>

<cierre>
Commit: "feat(hub): interfaz IJuego + selección de juego".
</cierre>
```

---

# FASE 5 — Empaquetado de escritorio (Tauri)  `[CLAUDE CODE]` + `[HUMANO]`

**Objetivo:** un ejecutable de escritorio.

**PROMPT:**
```text
<rol>
Eres un ingeniero experto en empaquetar aplicaciones web como apps de escritorio con Tauri.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Configura Tauri para empaquetar el cliente como app de escritorio.
2. El build debe abrir el hub y permitir unirse a una sala por código.
3. Documenta en CLAUDE.md cómo correr el build y dónde se configura la URL del servidor.
</instrucciones>

<restricciones>
- No cambies la lógica de juego ni la red; esta fase es solo empaquetado y configuración.
</restricciones>

<criterio_de_hecho>
Se genera un ejecutable que abre el hub y conecta a una sala por código.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): empaquetado de escritorio con Tauri".
</cierre>
```

> `[HUMANO]`, una sola vez: desplegar el servidor Colyseus en un hosting barato si quieren
> jugar a distancia, y poner esa URL en la config del cliente.

---

# FASE 6 — Validar modularidad: segundo juego  `[CLAUDE CODE]`

**Objetivo:** demostrar que la arquitectura aguanta un juego nuevo sin tocar lo existente.

**PROMPT:**
```text
<rol>
Eres un ingeniero que valida arquitecturas implementando casos de prueba reales contra una
abstracción existente, sin modificarla.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Ya existe la interfaz IJuego y el hub de la Fase 4.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Agrega un segundo juego simple (por ejemplo, dados de mentira tipo Liar's Bar) implementando
la interfaz IJuego. Debe aparecer en el hub junto a Carioca.
</instrucciones>

<restricciones>
- NO modifiques el hub, la capa de red ni carioca-core.
- Si crees que necesitas cambiarlos, DETENTE y avísame: significa que la abstracción IJuego
  está incompleta. Ese es el verdadero objetivo de esta fase.
</restricciones>

<criterio_de_hecho>
El segundo juego se juega desde el hub sin haber tocado hub, red ni core.
</criterio_de_hecho>

<cierre>
Commit: "feat(games): segundo juego validando IJuego".
</cierre>
```

---

## Notas finales
- **Un prompt = una sesión.** Entre fases, siempre `/clear`.
- Si en Plan Mode el agente propone partir una fase por tamaño, acéptalo.
- Si fallan los tests, no avances; itera en la misma sesión hasta que pasen.
- `REGLAS_CARIOCA.md` es la única fuente de verdad de las reglas.

*Plan con prompts por fase (estructura XML + few-shot), listo para ejecución modular con Claude Code.*
