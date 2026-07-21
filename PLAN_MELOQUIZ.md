# PLAN_MELOQUIZ.md

> Plan de sesiones de Claude Code para implementar **MeloQuiz**.
> Rige `REGLAS_MELOQUIZ.md` (diseño) y `SPIKE_MELOQUIZ.md` (hallazgos de S0).
>
> Método Sidios: **una sesión a la vez** (`/clear` entre sesiones), **Plan Mode**, dependencia
> secuencial, sesiones **additive**.

---

## Estado

```
S0 Spike ✓ ─► S1 Núcleo ✓ ─► S1b Reloj de fases ✓ ─► S2 Fuente LOCAL ✓ ─► S3 Render 1-cliente ✓ ─► [N] Normalización ─► S4 Multiplayer ─► [T] Empaquetado Tauri
```

MeloQuiz es **jugable en solitario de punta a punta** en web/dev (render DOM, `<audio>`, contador de
fase, carátula perezosa, orden de fases correcto). Falta: pulir normalización, multiplayer, y empaquetar.

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
- **Nota:** es chica y toca la experiencia de juego visible ahora; conviene hacerla **antes** de S4.

---

## S4 — Multiplayer (host-autoridad + sync)

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

## [T] — Empaquetado Tauri (al final)

- **Depende de:** S4 (empaquetar cuando el juego está completo).
- **Rige:** REGLAS §8 (render/empaquetado).
- **Motivo:** S3 corrió en web/dev; `src-tauri` no tiene `plugin-fs`/`plugin-dialog` y el CSP no tiene
  `media-src` (un `<audio>` quedaría bloqueado).
- **Produce:** adaptador `crearSistemaArchivosTauri` sobre `plugin-fs`/`plugin-dialog`, `assetProtocol`
  + `media-src` en el CSP, `CARPETA_MUSICA` desde `servidorEmbebido.ts`, selección de carpeta antes de
  spawnear el sidecar.
- **Criterio de hecho:** MeloQuiz jugable en la app Tauri empaquetada, no solo en web/dev.

---

## Higiene (a MEJORAS.md, no bloqueante)

- `transporteLanNavegador.test.ts` flaky por timing de WebSocket real (sin relación con MeloQuiz).
- `typecheck:tests` del servidor en rojo: narrowing de `VistaJuego` no discriminada (pre-existente,
  documentado). `vistaMeloquiz` debe entrar cuando se haga la sesión de discriminar `VistaJuego`.

---

## Fuera del plan (permanente / v2)

- Envío host→peer de archivos de audio. **Permanente.**
- Modo video en fuente local; Android; migración de host. **v2 / diferido.**
