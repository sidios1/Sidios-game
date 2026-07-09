# PORT_ANDROID.md

Documento de decisiones para la extracción de Sidios a Android. Es source of
truth: el agente lo lee antes de cualquier sesión relacionada. Las ambigüedades
se resuelven acá, no dentro del agente.

---

## Objetivo y directriz

- El proyecto se programa **principalmente para PC**. Android es un **target de
  extracción** de la misma codebase, no un fork ni una rama paralela.
- La extracción a Android es un paso de build (`tauri android build`), no un
  reescribe. Tauri 2 (estable desde oct 2024) soporta Android como target de
  primera clase: mismo frontendDist, WebView Chromium-based, WebGL/Three.js
  corre nativo.
- **Regla de oro de la extracción:** la lógica nunca se ramifica por plataforma.
  Lo único que se ramifica es **qué adaptador de transporte se inyecta**.
  `MotorJuego`, hub, orchestrator y render quedan byte-por-byte iguales PC/Android.

---

## Decisiones fijadas

### Transporte: solo online (WebRTC)
- Android NO opera en LAN local. Todo multiplayer en móvil va por el transporte
  online ya existente (WebRTC / PeerJS signaling + STUN + TURN ExpressTURN).
- Consecuencia: **no se escribe nada de código nativo (Rust/Kotlin) para red.**
  No hay socket servidor, no hay puente IPC, no hay foreground service. La
  extracción es 1:1 respecto de PC.

### Android puede crear partidas
- "Crear partida" = el dispositivo es la **autoridad / host lógico** de la
  partida. NO implica abrir un socket servidor.
- Vía WebRTC el host es autoridad lógica pura: no escucha en ningún puerto, el
  signaling server externo arma las conexiones peer-to-peer.
- Esto es el tercer caso de la abstracción dual-transport ya existente
  (PC inyecta WebSocket-host; Android inyecta WebRTC-host). No es bifurcación de
  código, es selección de adaptador.

### Orientación: landscape forzado
- Se fuerza orientación horizontal en la config de Android.
- Cámara/mesa ya son horizontales → rework mínimo. Ajustes pendientes: aspect
  ratios de teléfono (más extremos que monitor) y safe areas (notch/cutout).

---

## Estado post-Sesión 0 (spike completado) — decisiones cerradas

El spike (`SPIKE_ANDROID.md`) concluyó **sin refactor de desacople bloqueante**:
- Orchestrator ya es lógica pura agnóstica de transporte (`orquestador.ts`).
- Acoplamiento a Node confinado a la capa LAN, que Android no importa.
- **WebRTC-host ya existe y está cableado a la UI** ("Online → Crear partida").
  El tercer caso de la abstracción dual-transport no hay que construirlo.

Decisiones tomadas a partir de los hallazgos:

1. **Modelo de background:** host minimizado = **partida pausada para todos,
   reanuda consistente** al volver al frente. SIN foreground service nativo (eso
   rompería la extracción limpia y queda fuera de v1).
2. **Reloj del host:** se mitiga vía la costura ya inyectable
   `OpcionesOrquestador.programar`. En Android se inyecta un **ProgramadorResiliente**
   que no confía en la precisión del callback: recomputa transiciones (gracia de
   reconexión `GRACIA_MS`, salto de turno) contra wall-clock (`Date.now()`) al
   reanudar, escuchando resume/`visibilitychange` del webview. La lógica del
   orchestrator NO se toca — mismo patrón "inyectar adaptador, no ramificar lógica",
   aplicado al reloj. **La forma exacta se define recién tras medir en dispositivo**
   (Tauri Android puede dar throttle suave o pausa dura según versión/fabricante/Doze).
3. **Señalización:** broker **PeerJS público** para v1. La interfaz
   `ClienteSenalizacion` permite self-hostear después sin tocar transporte.
4. **TURN en el build de Android:** las credenciales viven en `client/.env.local`
   (gitignored). Resolver cómo `import.meta.env` las inyecta en el release Android.
   Tarea de build de la próxima sesión.

---

## Spike obligatorio antes de cualquier sesión de producción

**Sesión 0 — Auditoría de acoplamiento a Node del orchestrator.**

Riesgo central: si el "servidor" lógico actual toca APIs de Node (`http`, `net`,
`ws` con server real, `fs`, etc.), no corre en el WebView ni se traslada a
WebRTC sin desacoplar. Mismo hallazgo que en Phase 6 (orchestrator Carioca-
specific) — hay que descubrirlo antes, no a mitad de implementación.

**Criterio de hecho del spike:**
- Inventario de toda dependencia de Node APIs en hub / orchestrator / motor de
  servidor.
- Confirmación de que el orchestrator es lógica JS pura: recibe acciones, emite
  estados, atraviesa un transporte **inyectado**, sin saber qué transporte es.
- Lista de refactors necesarios (si los hay) para que la misma capa lógica corra
  dentro del WebView con transporte WebRTC.
- Salida documentada en `SPIKE_ANDROID.md`. Cero código de producción.

---

## Trabajo Android-específico (UI / plataforma, no lógica)

Ninguno de estos toca `MotorJuego` ni la lógica de juego.

- **Input táctil:** el raycasting de Three.js asume mouse. Migrar a Pointer
  Events. Revisar hover states (no existen en touch), drag de cartas y tap-target
  por carta.
- **Safe areas:** notch/cutout en landscape. Padding vía `env(safe-area-inset-*)`
  en overlays HTML.
- **Overlays responsive:** indicador de color UNO, contador +N, selector de Wild,
  indicador de dirección — verificar a anchos de teléfono.
- **Rendimiento WebGL:** las texturas procedurales generadas en runtime con canvas
  pueden pegar en gama baja. Evaluar cacheo / atlas pre-generado si hace falta.
- **Permisos Android:** `INTERNET`, `ACCESS_NETWORK_STATE`. (No se necesita
  multicast lock: no hay LAN.)

---

## Fuera de alcance (v1 Android)

- LAN local en Android (jugar sin internet entre teléfonos). Requeriría un puente
  Rust nativo (socket servidor → IPC al WebView). Descartado por decisión de
  transporte solo-online. Documentado acá por si se reabre a futuro.
- iOS. No está en scope todavía.
- Plugins de Tauri desktop no portados a móvil — revisar caso a caso si alguno se
  usa.

---

## Secuencia

1. ~~**Sesión 0 (spike):** auditoría de acoplamiento a Node → `SPIKE_ANDROID.md`.~~
   **COMPLETADA.** Sin refactor de desacople bloqueante (ver sección post-Sesión 0).
2. ~~**Sesión 1a (prep, sin toolchain):**~~ **COMPLETADA.** Config Android autorada
   (override `tauri.android.conf.json` que excluye sidecar Node/externalBin;
   `BUILD_ANDROID.md` con prerequisitos, secuencia init y diff del AndroidManifest
   para landscape + permisos). TURN resuelto vía `import.meta.env.VITE_*` horneado
   por `vite build` (sin código nuevo, documentado en `.env.example` + nota CI).
   Instrumentación de medición `medicionReloj.ts` lista (gated por flag, verificada
   ausente del bundle). `MEDICION_RELOJ_ANDROID.md` con método, tablas vacías y
   rúbrica de recomendación. Build + 95 tests verdes. Orchestrator/cores intactos.
   GATE: requiere instalar toolchain (JDK + Android SDK/NDK + rust android targets).
3. **Sesión 1b (init + build + correr en emulador):** toolchain ya instalado
   (JDK 21 JBR, SDK, NDK 30.0.14904198, 4 targets Rust, env vars verificadas).
   Corré `tauri android init`, aplicá el diff del manifest (landscape + permisos),
   buildeá el APK, corré en emulador y creá una partida online contra un peer PC
   para confirmar que el flujo funciona end-to-end en Android. **NO incluye
   medición del reloj** (requiere device físico; ver 1c).
4. **Sesión 1c (medición en dispositivo) — DIFERIDA hasta tener teléfono físico:**
   con device real vía USB debugging, llenar las tablas de `MEDICION_RELOJ_ANDROID.md`
   con deltas reales (esperado vs `Date.now()` al disparar, para 5s/30s/2min de
   background). El emulador NO sirve: no reproduce Doze/throttle confiablemente.
   La rúbrica del doc dicta la forma del ProgramadorResiliente. La instrumentación
   `medicionReloj.ts` ya está autorada y gated, lista para esto.
5. **Sesión 2:** ProgramadorResiliente inyectado según lo medido (depende de 1c) +
   input táctil (Pointer Events, drag de cartas) + safe areas + overlays responsive.
6. Pruebas en dispositivo físico y pulido.

Una sesión a la vez, `/clear` entre sesiones, Plan Mode antes de cada una.
