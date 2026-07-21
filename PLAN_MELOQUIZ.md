# PLAN_MELOQUIZ.md

> Plan de sesiones de Claude Code para implementar **MeloQuiz**.
> Rige `REGLAS_MELOQUIZ.md` (diseño) y `SPIKE_MELOQUIZ.md` (hallazgos de S0).
>
> Método Sidios: **una sesión a la vez** (`/clear` entre sesiones), **Plan Mode**, dependencia
> secuencial, sesiones **additive**.

---

## Estado

```
S0 ✓ ─► S1 ✓ ─► S1b ✓ ─► S2 ✓ ─► S3 ✓ ─► S4 ✓ ─► [P] Pivote de votación ✓ ─► [T] Empaquetado Tauri + cable online ✓ ─► (prueba de oído) ─► [N] Normalización
```

**Nota:** [T] se adelantó a la prueba de oído y a [N] (pedido 2026-07-21: "no puedo jugar en la app
instalada"), y absorbió además el **cable online** (el `poolMeloquiz` del cliente-host, que no estaba
en el alcance original).

**Nota de secuencia:** S4 se ejecutó ANTES que [P] (sobre la votación vieja de 4 opciones). No es
problema: sync, planArranque, huella cruzada, aislamiento y reconexión viven en fases/capas que [P] no
toca. [P] reworkea votación/puntaje del núcleo y la UI de voto; el cable de S4 queda igual. La **prueba
de oído** ("se siente simultáneo", criterio pendiente de S4) se hace DESPUÉS de [P], sobre el juego
final, para no validar dos veces.

**PIVOTE (2026-07-21, REGLAS §4/§5):** el juego ya no juzga aciertos — los jugadores adivinan fuera de
la app, el juego revela y el grupo **vota qué participante ganó** (mayoría simple, empate = nadie suma,
auto-voto permitido). Orden nuevo: `Precarga → Clip → Revelar → Votación → Tabla`. Entrenamiento = sin
votación, salta de canción en canción. Esto reworkea las fases votación/puntaje del núcleo (S1) y la UI
de voto (S3); sobreviven intactos máquina de fases, sync, fuente, huella y carátula.

---

## [P] — Sesión de pivote: voto entre participantes ✓ COMPLETADA

- **Depende de:** S3 (lógica) — y convive con S4 ya hecho. **Rige:** REGLAS §4/§5 pivotadas.
- **Convivencia con S4 (no tocar):** sync, `planArranque`, huella, aislamiento y reconexión no se
  modifican. Verificar que `aislamientoMeloquiz.test.ts` y los tests de arranque sigan verdes tras el
  reorden de fases, y que la vista de votación publique **jugadores**, no opciones de canción.
- **Produce (núcleo):** opciones de voto = jugadores de la partida (auto-voto permitido); eliminar
  distractores/opciones de canción; resolución por mayoría simple, empate = nadie suma, sin-voto no
  cuenta; reordenar fases a Clip → **Revelar** → **Votación** → Tabla; entrenamiento sin fase de
  votación.
- **Produce (UI):** botones de voto = participantes (nombre/avatar); revelar antes de votar; tabla con
  el conteo de votos.
- **Invariantes que persisten:** título oculto hasta revelar; `pistaId` opaco; reloj inyectado.
- **Criterio de hecho:** partida multiventana-lista a nivel de lógica (tests del núcleo reflejan el
  nuevo flujo, incluidos empate y auto-voto); entrenamiento salta canciones sin votar; suite verde.
- **Resultado (2026-07-21):** hecho tal cual. Núcleo: `resolverVotacion` (mayoría en un solo lugar,
  la usan puntaje y vista), voto por `votadoId` (error `VOTADO_DESCONOCIDO`), fases
  `precarga → clip → revelar → voto → puntaje`, flag `entrenamiento` en el estado (revelar salta a la
  ronda siguiente). Vista: sin `opciones`/`opcionCorrectaId`/`acerto`; `tuVotoJugadorId`,
  `votosRecibidos` (null hasta `puntaje`, voto secreto) y `ganadorRonda`. Server: acción
  `{tipo:"votar", votadoId}`; `vistaMeloquiz` inyecta `avatar` (patrón `vistaMentiroso`). UI: botones
  de voto = participantes con avatar (auto-voto habilitado), revelar antes de votar, tabla con conteo.
  El único archivo de S4 tocado fue el GUION de `aislamientoMeloquiz.test.ts` (pasos y forma del voto);
  sus 3 capas de aserciones quedaron byte a byte. Suite completa del monorepo verde (669 tests).

---

## S0–S3 ✓ COMPLETADAS

- **S0 Spike:** veredicto "extender mínimo" (`SPIKE_MELOQUIZ.md`).
- **S1 Núcleo puro:** `IFuenteCatalogo`/`PoolPartida`, máquina de fases con reloj inyectado, puntaje
  plano, empate compartido, título oculto hasta revelar, ack en el núcleo. Vitest verde.
- **S1b Reloj de fases:** `faseTemporizada`/`expirarFase` en `MotorJuego` + ruta espejo en orquestador
  (sin `jugadorEnTurno`, gate aflojado), `faseMsRestantes` + `faseInicioMs` en la vista. Additive puro
  (los otros 4 juegos intactos).
- **S2 Fuente LOCAL:** paquete `meloquiz-fuente-local` con puertos FS + metadatos inyectados, ID3 +
  carátula, normalización, huella `SHA-256(64KB++tamaño)` con guardián de colisión, inicio ~30%.
- **S3 Render 1-cliente:** modo entrenamiento (1 jugador), alta en registro/CATALOGO, pool desde disco
  vía `CARPETA_MUSICA`, adaptador FS sobre File API, índice por huella, `<audio>`, UI de fases, contador
  interpolado 200ms, carátula perezosa. Jugable en solitario en web/dev contra carpeta real.
- **S4 Multiplayer:** `sincroniaReloj.ts` (espejo de `latido.ts`, frames `__sinc` por `startsWith`,
  fórmula NTP con filtro de mínimo RTT, ráfaga al conectar + cadencia 5 s + `visibilitychange`),
  offset 100% local en `relojHost.ts` con generaciones de sesión; **arranque**: `faseInicioMs` siempre
  está en el pasado ⇒ `instanteArranqueHost() = faseInicioMs + MARGEN_ARRANQUE_MS (500)`, y
  `planArranque.ts` puro (programar / ya-mismo-con-seek para reconexión a mitad de clip / omitir;
  `pointerdown` replanifica si autoplay bloqueado); huella Node↔File API bit-idéntica con vector dorado
  + test cruzado sobre fixture real; `aislamientoMeloquiz.test.ts` (3 capas: marca secreta / presupuesto
  8 KB / walker de forma) — de paso se eliminó `claveCaratula` (campo muerto que filtraba catálogo);
  entrenamiento degenera formalmente al caso trivial (reloj identidad, offset 0). Los 5 adaptadores
  consumen los frames; el orquestador nunca los ve. **Pendiente de S4: la prueba de oído** (se hace
  tras [P]).

**Decisiones cerradas en el camino** (ya reflejadas en REGLAS): orden de fases
`Precarga → Clip → Votación → Revelar → Tabla` (corrige el bug de votación trivial); carátula = peer lee
su archivo local en revelar (§3); modo entrenamiento con ack instantáneo (§6).

---

## [N] — Mini-sesión: normalización de títulos

- **Depende de:** S2 (toca `normalizarTitulo.ts`).
- **Rige:** REGLAS §2 (normalización).
- **Motivo:** el juicio humano contra la carpeta real (pendiente de S2, ejercido en S3) encontró
  puntuación desbalanceada: `"Accel World Opening Full [ May'n - Chase the World ].mp3"` →
  `"Chase the World ]"`. Ese texto es el botón de voto; un corchete huérfano confunde correcta vs.
  distractor.
- **Produce:** manejo de corchetes/paréntesis desbalanceados y otros restos de puntuación, con los
  casos reales de la carpeta como fixtures de test.
- **Criterio de hecho:** los títulos problemáticos salen limpios; tests nuevos verdes; nada más tocado.
- **Nota (post-pivote):** bajó de prioridad — el título ya no es botón de voto, solo la revelación.
  Sigue valiendo el fix (es lo que todos leen al revelar), pero va después de [P] y de la prueba de
  oído.

---

## S4 — Multiplayer (host-autoridad + sync) ✓ COMPLETADA (ver resumen arriba)

- **Depende de:** S3 (+ idealmente [N]).
- **Rige:** REGLAS §1 (host↛peer), §3 (sync + carátula), §6 (entrenamiento), §7; SPIKE §2, §3.
- **Ya resuelto en sesiones previas (NO rehacer):** el ack de precarga viaja por la rama `default` del
  parser (S1) y `faseInicioMs` es el `start_at` absoluto (S1b). S4 solo cablea el transporte.
- **Produce:**
  - **Sync de reloj:** módulo puro **espejo de `latido.ts`**, en la capa de transporte, caliente desde
    el lobby. Offset = estado local del cliente (el host no lo ve).
  - **Índice por huella en el peer:** cada cliente resuelve `pistaId → su archivo local` (WebCrypto,
    huella bit-idéntica a la de Node — test de igualdad Node/browser sobre fixture).
  - **Carátula:** parseo parcial del archivo local del peer en revelar (ya prototipado en S3).
  - Arranque con `faseInicioMs` traducido a hora local; difusión de la **orden** (id + start_at +
    opciones), nunca bytes de audio.
  - Desconexión/reingreso por token; caída de host ⇒ termina (v1).
  - **No romper el modo entrenamiento** (1 jugador, offset 0, ack instantáneo).
- **Restricción crítica:** ningún archivo de audio viaja host→peer.
- **Criterio de hecho:** 2+ clientes Windows escuchan de forma que **se siente** simultánea, votan, el
  marcador cuadra; ningún audio viaja host→peer; el modo entrenamiento sigue jugable.

---

## [T] — Empaquetado Tauri + cable online ✓ COMPLETADA (2026-07-21, v0.9.0)

- **Dependía de:** S4. **Rige:** REGLAS §8 (render/empaquetado) y §1 (el pool lo arma el host).
- **Motivo:** S3 corrió en web/dev; en la app instalada "Crear partida" moría (el sidecar exigía
  `CARPETA_MUSICA` y nadie se la pasaba) y en online faltaba el `poolMeloquiz` de `crearSala`.
- **Resultado (difiere del plan original, decisión razonada):** NO hicieron falta `plugin-fs`,
  `crearSistemaArchivosTauri` ni `assetProtocol` — el webview es WebView2 (Chromium): el picker
  `webkitdirectory`, la File API y los blob URLs del pipeline S3/S4 funcionan igual que en el
  navegador. Los huecos reales eran tres y se cerraron así:
  1. **`media-src 'self' blob:`** en el CSP (`tauri.conf.json`): sin esto el `<audio>` moría.
  2. **Hook genérico `DefinicionJuego.prepararHosteo(modo)`** (`juego/ijuego.ts`): recursos que el
     juego reúne ANTES de crear la sala; el coordinador los pasa a ciegas (sigue sin conocer juegos).
     MeloQuiz (`definicion.ts`): en **"local"** (app Tauri) el diálogo NATIVO (`plugin-dialog`, único
     agregado Rust: Cargo.toml + lib.rs + capability `dialog:default`) da la RUTA absoluta que viaja
     al sidecar como env `CARPETA_MUSICA` (`iniciarServidorEmbebido(juego, envExtra)`); en **"online"**
     el pool se arma EN EL WEBVIEW (`poolLocal.ts` sobre el subpath puro nuevo
     `@juegos/meloquiz-fuente-local/fuenteLocal` + File API) y va a
     `iniciarHostOnline(juego, {poolMeloquiz})`; la misma carpeta se indexa en `indiceLocal`, así el
     host online no la re-elige en el lobby. Cancelar el picker devuelve `null` = ni sala ni error.
  3. **Doble elección solo en LAN-Tauri** (ruta para el sidecar + File input del lobby para
     reproducir): la File API no puede leer una ruta absoluta; pulido posible a futuro, documentado.
- **Tests:** `poolLocal.test.ts` (pool válido, `pistaId` resuelve contra el índice de los MISMOS File,
  mínimo §2, descartes) + `coordinador.embebido.test.ts` extendido (env del hook, cancelación).
- **Criterio de hecho:** MeloQuiz jugable en la app Tauri empaquetada (v0.9.0), local y online.

---

## Higiene (a MEJORAS.md, no bloqueante)

- `transporteLanNavegador.test.ts` flaky por timing de WebSocket real (sin relación con MeloQuiz).
- `typecheck:tests` del servidor en rojo: narrowing de `VistaJuego` no discriminada (pre-existente,
  documentado). `vistaMeloquiz` debe entrar cuando se haga la sesión de discriminar `VistaJuego`.

---

## Fuera del plan (permanente / v2)

- Envío host→peer de archivos de audio. **Permanente.**
- Modo video en fuente local; Android; migración de host. **v2 / diferido.**
