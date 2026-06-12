# PLAN.md — Plataforma de juegos multijugador (ejecución por Claude Code)

> **Cómo usar este archivo.** Cada fase es **una sesión**. Para cada una:
> 1. `/clear` (contexto limpio).  2. Plan Mode (Shift+Tab dos veces).  3. Pega el PROMPT de la fase.
> 4. Aprueba el plan que propone.  5. Implementa → tests verdes → commit.  6. `/clear` y siguiente.
>
> **Estado actual: las Fases 0 y 1 ya están hechas.** Empieza en la **Fase 2**.
> Docs de apoyo que el agente lee cada sesión: `PLAN.md`, `REGLAS_CARIOCA.md` y `CLAUDE.md`.

---

## Alcance de red: LAN ahora, ONLINE próximamente
- **Ahora:** todos en la **misma red local (WiFi)**. El **host levanta el servidor internamente**
  al crear la partida; los demás se conectan a su IP local. Sin NAT, sin relay, sin nada que desplegar.
- **Próximamente:** modo online (jugar a distancia). Por eso la red se construye **detrás de una
  interfaz de transporte**: LAN es la primera implementación; online será otra implementación de la
  misma interfaz.
- **Principio clave (la costura):** la *autoridad de la partida* (validar con carioca-core, armar
  vistas por jugador) se escribe una sola vez y es independiente del transporte. Agregar online
  = un adaptador de transporte nuevo + la pantalla de conexión. No se toca core, hub, juegos ni
  la lógica de la partida.

## Stack
| Capa | Tecnología | Estado |
|------|-----------|--------|
| Lenguaje | TypeScript | — |
| carioca-core | lógica pura + Vitest | ✅ hecho (Fase 1) |
| server | **Orquestador de partida** (autoritativo, sobre carioca-core) + **transporte** intercambiable; adaptador `TransporteLAN` (`ws`) embebido en el host | Fase 2 |
| client | **Tauri** (escritorio) + **Three.js** (cartas, mesa, animaciones) | Fase 3 |

## Estructura del repo
```
/
├── PLAN.md
├── REGLAS_CARIOCA.md
├── CLAUDE.md
└── packages/
    ├── carioca-core/   ✅ lógica + tests
    ├── server/         servidor WebSocket LAN
    └── client/         Tauri + Three.js
```

---

# ✅ FASE 0 — Scaffolding + CLAUDE.md  (COMPLETADA)
Monorepo con workspaces, TypeScript strict, Vitest, y CLAUDE.md creados. Repo compila.

# ✅ FASE 1 — Motor `carioca-core`  (COMPLETADA)
Lógica pura de Carioca según REGLAS_CARIOCA.md (modelos, validadores de trío/escala,
máquina de turnos, comodines, puntaje, 9 manos), con suite de tests en verde.

> A partir de aquí, el agente **importa** carioca-core como dependencia y **no lo modifica**.

---

# FASE 2 — Orquestador de partida + transporte LAN  `[CLAUDE CODE]`

**Objetivo:** la autoridad de la partida (validación + vistas por jugador) separada del transporte,
con LAN como primera implementación. Diseñado para que online sea, después, solo otro adaptador.

**PROMPT:**
```text
<rol>
Eres un ingeniero de backend experto en servidores autoritativos de juegos por turnos y en
diseño con puertos/adaptadores (separar la lógica del transporte de red).
</rol>

<contexto>
Lee CLAUDE.md, PLAN.md y REGLAS_CARIOCA.md. carioca-core ya está implementado y testeado
(Fase 1); impórtalo, NO lo modifiques. Trabaja en packages/server.
Alcance: AHORA solo LAN (misma red, sin NAT/relay/servicios externos), pero ONLINE viene
pronto, así que la red debe quedar detrás de una interfaz de transporte intercambiable.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Orquestador de partida (autoritativo, INDEPENDIENTE del transporte): recibe intenciones
   (robar, descartar, bajarse, pegar), las valida con carioca-core, actualiza el estado y
   produce una VISTA POR JUGADOR (que oculta las cartas ajenas). Soporta 2-4 jugadores,
   turnos y el avance entre las 9 manos.
2. Interfaz de transporte que el orquestador usa para comunicarse, con dos roles:
   - lado servidor/host: aceptar conexiones, recibir intenciones, enviar vistas de estado.
   - lado cliente: conectar a una sala (por código), enviar intenciones, recibir vistas.
3. Adaptador TransporteLAN que implementa esa interfaz con la librería `ws`:
   escucha en 0.0.0.0 (puerto configurable); el "código" de la sala es la IP:puerto del host.
4. El orquestador NO debe importar `ws` ni saber nada de WebSocket: solo habla con la interfaz.
5. Actualiza CLAUDE.md: red = orquestador transport-agnóstico + adaptador LAN; online a futuro
   será otro adaptador sin tocar el orquestador.
</instrucciones>

<ejemplos>
<!-- Información oculta (responsabilidad del orquestador, no del transporte) -->
CORRECTO:   la vista del Jugador A incluye SU mano, el descarte y la mesa.
INCORRECTO: la vista del Jugador A incluye las cartas en mano del Jugador B.

<!-- La costura: el orquestador no conoce el transporte -->
CORRECTO:   orquestador depende de la interfaz Transporte; el adaptador LAN la implementa.
INCORRECTO: el orquestador llama directamente a `new WebSocketServer(...)`.
</ejemplos>

<restricciones>
- No modifiques carioca-core; la lógica de reglas vive ahí, no la dupliques.
- El orquestador no importa `ws` ni ninguna librería de red: solo la interfaz Transporte.
- Solo LAN por ahora: nada de Colyseus, Playroom, NAT traversal ni relay (eso es la Fase 7).
- El adaptador LAN debe poder arrancarse desde código (lo embeberá el host en la Fase 5).
</restricciones>

<criterio_de_hecho>
Tests: (a) un test del orquestador que simula una partida completa de 2-4 jugadores con vistas
por jugador correctas, sin red; (b) un test de integración donde dos clientes se conectan por
el adaptador LAN y juegan una partida completa por mensajes.
</criterio_de_hecho>

<cierre>
Commit: "feat(server): orquestador autoritativo + transporte LAN".
</cierre>
```

**Hecho cuando:** el orquestador pasa sus tests sin red, y dos clientes juegan una partida completa por el adaptador LAN respetando la información oculta.

---

# FASE 3 — Cliente Three.js: render, animaciones y conexión  `[CLAUDE CODE]`

**Objetivo:** ver y jugar Carioca, con un selector de modo "Online"/"Local" (Local activo por LAN; Online deshabilitado por ahora).

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend gráfico experto en Three.js y animación de interfaces de juego.
Generas los visuales por código, sin assets externos.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Usa la interfaz de transporte de la Fase 2 (no llames a WebSocket
directamente). En desarrollo, el servidor se levanta por separado (npm run dev); la integración
de "el host lo arranca solo" es de la Fase 5. Online vendrá después (Fase 7).
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Con Three.js y TypeScript:
1. Escena 3D: mesa, cámara y luces.
2. Cartas como planos con textura generada por código (canvas: número + pinta).
3. Raycasting para seleccionar cartas con el mouse.
4. Animaciones con tweening: repartir, robar (mazo o pozo), descartar, bajarse.
5. Pantalla de conexión con un SELECTOR DE MODO de dos botones, "Online" ARRIBA y "Local"
   ABAJO. El modo elegido determina qué adaptador de transporte se usa:
   - "Local" (funcional ahora) -> TransporteLAN: "Crear partida" (el host usa su servidor
     local) y "Unirse" (ingresar IP:puerto del host de la LAN).
   - "Online" (ARRIBA): visible pero DESHABILITADO con etiqueta "próximamente". Reservado
     para el adaptador online de la Fase 7; no implementes su lógica ahora.
   Renderiza el estado sincronizado que entrega el transporte.
6. HUD: tu mano, de quién es el turno, y el contrato de la mano actual.
</instrucciones>

<restricciones>
- El cliente habla con la INTERFAZ de transporte, no con `ws` directamente.
- El botón "Online" queda deshabilitado; deja el punto de enganche del adaptador listo, sin lógica.
- El estado del transporte es la verdad; las animaciones solo lo representan, NO lo alteran.
- Nada de assets externos: las caras de las cartas se generan por código.
</restricciones>

<criterio_de_hecho>
Dos instancias en la misma red, en modo "Local", juegan una partida completa de Carioca, con
cartas y animaciones visibles, una como host y otra uniéndose por IP. El botón "Online" aparece
arriba, deshabilitado.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): render Three.js + animaciones + selector de modo (Local activo, Online próximamente)".
</cierre>
```

> Tras esta fase: **playtest tuyo** `[HUMANO]` en dos máquinas de tu WiFi.

---

# FASE 4 — Hub modular  `[CLAUDE CODE]`

**Objetivo:** la plataforma que aloja varios juegos, con Carioca enchufado vía interfaz común.

**PROMPT:**
```text
<rol>
Eres un arquitecto de software experto en diseño de plugins e interfaces que desacoplan
módulos, de modo que agregar funcionalidad nueva no obligue a tocar lo existente.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client y en código compartido.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Una interfaz común IJuego (iniciar, sincronizarEstado, procesarAcción, finalizar) en una
   ubicación compartida.
2. Refactoriza Carioca para que IMPLEMENTE IJuego, sin cambiar su lógica de reglas ni su red.
3. Una pantalla de hub: sala de espera y selección de juego, sobre el flujo de crear/unirse LAN.
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

# FASE 5 — Empaquetado de escritorio + servidor embebido (Tauri)  `[CLAUDE CODE]`

**Objetivo:** un ejecutable donde el host levanta el servidor internamente al crear partida.

**PROMPT:**
```text
<rol>
Eres un ingeniero experto en empaquetar apps web con Tauri, incluyendo el arranque de
procesos/sidecars locales desde la aplicación.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client y su integración con packages/server.
Objetivo clave: que "Crear partida" levante el servidor de la Fase 2 DENTRO de la app del host,
sin que el usuario tenga que correr nada por separado.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Configura Tauri para empaquetar el cliente como app de escritorio.
2. Embebe el servidor: al crear partida, el host arranca el servidor WebSocket internamente
   (sidecar de Tauri o proceso lanzado por la app) escuchando en la LAN.
3. Muestra al host su dirección de la LAN (IP:puerto) para que los amigos la usen al unirse.
4. Documenta en CLAUDE.md cómo se levanta el servidor embebido y dónde se configura el puerto.
</instrucciones>

<restricciones>
- Solo LAN: el servidor escucha en la red local; nada de exponerlo a internet.
- No cambies la lógica de juego ni el protocolo; esta fase es empaquetado e integración.
</restricciones>

<criterio_de_hecho>
Un ejecutable: el host hace "Crear partida" (sin correr nada aparte), ve su IP:puerto, y otro
jugador de la misma WiFi se une y juegan una partida completa.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): app de escritorio con servidor LAN embebido".
</cierre>
```

---

# FASE 6 — Validar modularidad: segundo juego  `[CLAUDE CODE]`

**Objetivo:** demostrar que la arquitectura aguanta un juego nuevo sin tocar lo existente.

**PROMPT:**
```text
<rol>
Eres un ingeniero que valida arquitecturas implementando casos reales contra una abstracción
existente, sin modificarla.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Ya existen la interfaz IJuego, el hub y la red LAN.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Agrega un segundo juego simple (por ejemplo, dados de mentira tipo Liar's Bar) implementando
la interfaz IJuego. Debe aparecer en el hub junto a Carioca y funcionar sobre la misma red LAN.
</instrucciones>

<restricciones>
- NO modifiques el hub, la capa de red ni carioca-core.
- Si crees que necesitas cambiarlos, DETENTE y avísame: significa que la abstracción IJuego
  está incompleta. Ese es el verdadero objetivo de esta fase.
</restricciones>

<criterio_de_hecho>
El segundo juego se juega desde el hub, en LAN, sin haber tocado hub, red ni core.
</criterio_de_hecho>

<cierre>
Commit: "feat(games): segundo juego validando IJuego".
</cierre>
```

---

# FASE 7 — Online (FUTURO, aún no implementar)  `[CLAUDE CODE]` + decisión `[HUMANO]`

**Objetivo:** habilitar el botón "Online" agregando un adaptador de transporte para jugar a
distancia. Gracias a la costura de la Fase 2, esto NO toca core, orquestador, hub ni juegos.

**Lo que cambia (solo esto):**
- Un nuevo adaptador de transporte (`TransporteOnline`) que implementa la MISMA interfaz que
  `TransporteLAN`.
- Activar el botón "Online" (ya presente, deshabilitado desde la Fase 3) y su pantalla de
  crear/unirse con código.

**Decisión previa `[HUMANO]` (al llegar aquí):** elegir el proveedor del transporte online.
- **Servidor desplegado** (el mismo orquestador en un hosting): máximo control, requiere desplegar.
- **Playroom u otro serverless**: sin gestionar servidor, modelo cliente-autoritativo, con límites
  de plan. Encaja bien para hobby. *(Si se elige Playroom, el orquestador puede correr en el
  cliente-host en vez de un servidor.)*

> No se escribe el prompt definitivo de esta fase hasta elegir proveedor. El resto del sistema
> ya está listo para recibirlo.

---

## Riesgos
| Riesgo | Mitigación |
|---|---|
| Cablear la red a WebSocket y bloquear online | Orquestador detrás de una interfaz de transporte; LAN es solo el primer adaptador. |
| Adelantar trabajo de online antes de tiempo | En la Fase 3 el botón "Online" queda deshabilitado; el adaptador es la Fase 7. |
| Duplicar reglas en el servidor | La lógica vive en carioca-core; el orquestador solo valida y arma vistas. |
| Filtrar cartas ajenas en el estado | Vista por jugador en el orquestador; test de información oculta. |
| Animaciones que "pelean" con el estado | El estado del transporte es la verdad; las animaciones solo lo representan. |
| Acoplar un juego nuevo al hub/red | Interfaz IJuego; la Fase 6 lo verifica a propósito. |

## Notas finales
- **Un prompt = una sesión.** Entre fases, siempre `/clear`.
- Si fallan los tests, no avances; itera en la misma sesión hasta que pasen.
- `REGLAS_CARIOCA.md` es la única fuente de verdad de las reglas.
- El diseño en capas deja abierto el modo online (Fase 7): se agrega un adaptador de transporte
  y se habilita el botón "Online", sin tocar core, orquestador, hub ni juegos.

*Plan con prompts por fase (estructura XML + few-shot). Fases 0-1 hechas; red LAN ahora, online preparado como adaptador futuro.*
