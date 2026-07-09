# SPIKE_ANDROID.md — Auditoría de acoplamiento a Node del orchestrator

> **Sesión 0** de la extracción a Android (ver `PORT_ANDROID.md`). Diagnóstico
> puro: cero código de producción, cero refactor. Cada afirmación cita
> `archivo:línea` real; lo no verificable está en "Preguntas abiertas".

---

## 1. Resumen / veredicto

| Pregunta del spike | Veredicto |
|--------------------|-----------|
| ¿El orchestrator es lógica JS pura, agnóstica de transporte? | **SÍ.** Solo usa `setTimeout`/`clearTimeout` (inyectables) y `Math.random`. Cero `node:*`, `ws`, `process`, `Buffer`, `fs`. |
| ¿El motor de servidor está desacoplado del juego concreto? | **SÍ.** `MotorJuego<E,A>` inyectado; el orchestrator nunca inspecciona `E`/`A`. (Cierra el hueco de Phase 6.) |
| ¿Existe un adaptador WebRTC con rol de HOST/autoridad (no solo cliente)? | **SÍ, y ya está cableado a la UI.** El orchestrator corre dentro del webview sobre `TransporteOnlineServidor` (WebRTC) + loopback en-proceso para el host-jugador. |
| ¿Hay acoplamiento a Node que bloquee correr en el WebView? | **Confinado a la capa LAN** (`transporteLan.ts`, `embebido.ts`, `dev.ts`), que es exactamente lo que Android NO usa. No está en el grafo de imports del cliente. |
| ¿Se requiere refactor de desacople antes de implementar Android? | **No bloqueante.** Quedan verificaciones/riesgos menores (sección 6), no un desacople pendiente. |

**Conclusión:** la "regla de oro" de `PORT_ANDROID.md` (la lógica no se ramifica
por plataforma; solo se ramifica qué adaptador de transporte se inyecta) **ya se
cumple en el código actual**. El tercer caso de la abstracción dual-transport
(WebRTC-host) no hay que construirlo: existe y se usa hoy en PC.

---

## 2. Mapa de la capa de servidor

| Pieza | Archivo | Rol |
|-------|---------|-----|
| Orchestrator (autoridad genérica) | `packages/server/src/orquestador.ts` | Recibe intenciones por transporte, delega al motor, emite vista por jugador. No conoce reglas ni transporte concreto. |
| Puerto del motor (costura por juego) | `packages/server/src/motor.ts` | Interfaz `MotorJuego<E,A>`; tipos neutros, no importa ningún core. |
| Registro de motores (composición) | `packages/server/src/registroMotores.ts` | Mapea game-id → fábrica de sala (`crearSala`). Único lugar que conoce juegos concretos. |
| Motores concretos | `packages/server/src/juegos/{carioca/motorCarioca,mentiroso/motorMentiroso,uno/motorUno}.ts` | Envuelven cada `*-core`. |
| Interfaz de transporte | `packages/server/src/transporte.ts` | `TransporteServidor` / `TransporteCliente`; solo `string` + `Promise`. La costura LAN/online/memoria. |
| Adaptador LAN (Node) | `packages/server/src/transporteLan.ts` | `ws` + `node:os`. **Levanta el `WebSocketServer` en `:88`.** No usado por Android. |
| Adaptador memoria (tests) | `packages/server/src/transporteMemoria.ts` | Doble en-proceso para tests. |
| Adaptador online HOST (WebRTC) | `packages/client/src/red/online/transporteOnlineServidor.ts` | `TransporteServidor` sobre canales WebRTC + loopback. Corre en el webview. |
| Adaptador online JUGADOR (WebRTC) | `packages/client/src/red/online/transporteOnlineCliente.ts` | `TransporteCliente` sobre un `CanalDatos`. Espejo del LAN-navegador. |
| Lanzador host online | `packages/client/src/red/hostOnline.ts` | Arranca el `Orquestador` en el webview vía `crearSala` (subpath browser-safe). |
| Señalización (interfaz pluggable) | `packages/client/src/red/online/senalizacion.ts` | `ClienteSenalizacion` (`registrarHost` / `conectarAHost`). |
| Señalización por defecto | `packages/client/src/red/online/senalizacionPeerJs.ts` | PeerJS (`import()` dinámico). Único módulo que conoce el SDK. |
| Entry sidecar LAN (escritorio) | `packages/server/src/embebido.ts` | `process.*`. Ejecutable Node, no librería. No aplica a Android. |
| Entry dev LAN | `packages/server/src/dev.ts` | `process.*`. `npm run dev:server`. No aplica. |
| Raíz del paquete | `packages/server/src/index.ts` | Reexporta TODO, incluido `transporteLan.ts` → por eso el cliente nunca importa la raíz. |

**Quién levanta el server WebSocket actual:** `transporteLan.ts:88`
(`new WebSocketServer({ host: "0.0.0.0", port: this.puerto })`), dentro de
`TransporteLanServidor.iniciar`. Es la única escucha de puerto en todo el repo.

**Subpaths browser-safe** (`packages/server/package.json:9-46`): `./protocolo`,
`./vista`, `./vistaJuego`, `./transporte`, `./latido`, `./motor`, `./orquestador`,
`./registroMotores`. Ninguno arrastra `ws`/Node. La raíz `.` SÍ (reexporta el LAN)
y está prohibida en el cliente.

---

## 3. Inventario de dependencias de Node APIs

| Archivo | Línea | API de Node | Para qué | ¿Bloquea WebView? |
|---------|-------|-------------|----------|-------------------|
| `packages/server/src/transporteLan.ts` | 15, 52 | `node:os` → `networkInterfaces()` | Detectar la IPv4 local para armar el código `ip:puerto`. | Sí, pero **fuera del grafo Android** (adaptador LAN, no se inyecta en móvil). |
| `packages/server/src/transporteLan.ts` | 16, 88, 102, 107… | `ws` (`WebSocket`, `WebSocketServer`) | Servidor WebSocket real + ping nativo. | Sí, **fuera del grafo Android**. |
| `packages/server/src/embebido.ts` | 17, 21, 26, 31, 42, 51, 53-54 | `process.env`/`process.exit`/`process.on` | Entry del sidecar de escritorio (puerto, juego, cierre SIGINT/SIGTERM). | Sí, pero es un **ejecutable Node**, no lógica; Android no lo empaqueta. |
| `packages/server/src/dev.ts` | 11-44 | `process.*` | Entry de `npm run dev:server`. | Sí, **no aplica** (solo desarrollo PC). |
| `packages/server/src/transporteLan.test.ts` | 7 | `ws` | Test del adaptador LAN. | N/A (test). |
| `packages/client/src/red/online/senalizacionPeerJs.ts` | 156 | `import("peerjs")` | Cargar el SDK PeerJS bajo demanda. | **No** — es paquete de navegador, no Node. |

**Orchestrator y grafo browser-safe — sin APIs de Node:**
- `orquestador.ts`, `motor.ts`, `registroMotores.ts`, `protocolo.ts`, `vista.ts`,
  `vistaJuego.ts`, `transporte.ts`, `latido.ts` y `juegos/*/motor*.ts`: el `grep`
  de `node:`/`ws`/`require(`/`process.`/`Buffer`/`child_process` no arroja
  coincidencias en estos archivos.
- Cores `carioca-core`, `mentiroso-core`, `uno-core`: `grep` sin coincidencias de
  APIs de Node (consistente con la regla "core es lógica pura" de CLAUDE.md).

**Lectura:** TODO el acoplamiento a Node vive en piezas que Android no usa (LAN +
entries de escritorio/dev). La capa lógica que debe correr en el WebView ya está
limpia.

---

## 4. Veredicto de pureza del orchestrator: **SÍ**

Evidencia en `packages/server/src/orquestador.ts`:

- **Imports:** solo type-only de `./motor.js`, `./protocolo.js`, `./transporte.js`,
  `./vista.js`, más las funciones puras `analizarMensajeCliente`/`serializarServidor`
  de `protocolo.js` (L8-17). Ningún `node:*`, ningún `ws`.
- **Únicas APIs de runtime:**
  - `setTimeout`/`clearTimeout` vía `programadorReal` (L22-25), que es el **default
    inyectable** de `OpcionesOrquestador.programar` (L41-42, L101). Los tests
    inyectan un programador determinista; ambas APIs existen en el WebView.
  - `Math.random` en `tokenAleatorio` (L75) y como RNG default (L98) — también
    inyectable (`rng`, `generarToken`).
- **Transporte inyectado:** `this.transporte` se asigna desde el constructor
  (L80, L96) y solo se usa por la interfaz: `iniciar` (L106), `detener` (L116),
  `enviar` (L478), `cerrarConexion` (L233, L271, L325). El orchestrator **no sabe**
  si es LAN, online o memoria; lo dice su propio comentario de cabecera (L1-6).
- **Motor inyectado y opaco:** `MotorJuego<E,A>` (L81); el orchestrator nunca
  inspecciona `E` ni `A`, solo los pasa entre `crear`/`aplicarAccion`/
  `construirVista`/etc. `registroMotores.ts:35-39` compone Carioca/Mentiroso/UNO
  **sin tocar el orchestrator** → la abstracción que faltaba en Phase 6 está
  completa del lado servidor.

Conclusión: el orchestrator recibe acciones, emite estados y atraviesa un
transporte inyectado sin conocerlo. Corre tal cual dentro del WebView.

---

## 5. Estado del adaptador WebRTC: **rol HOST/autoridad implementado HOY** (no solo cliente)

- **Host (autoridad):** `transporteOnlineServidor.ts` implementa la interfaz
  `TransporteServidor` (L41). `iniciar` registra al host en el broker vía
  `senal.registrarHost(...)` (L57-62); cada peer entrante se vuelve una conexión
  (`aceptarRemoto`, L95-128) con vigía de latido (Watchdog) idéntico al patrón LAN.
  No escucha ningún puerto — coincide con `PORT_ANDROID.md` ("autoridad lógica
  pura, no socket servidor").
- **Host-jugador (loopback en-proceso):** `crearClienteLocal()` (L84-86) devuelve
  un `ClienteLoopback` (L166-204) que entrega mensajes con `queueMicrotask`, sin
  WebRTC. Así una sola instancia de servidor sirve al host local y a los remotos.
- **Arranque dentro del webview:** `hostOnline.ts:iniciarHostOnline()` (L24-38)
  instancia `TransporteOnlineServidor` + `SenalizacionPeerJs`, llama
  `crearSala(juego, { transporte })` por el subpath browser-safe
  `@juegos/server/registroMotores` (L11-12) y hace `sala.iniciar()`. Sin sidecar,
  sin Node. `clienteLocalHostOnline()` (L44-49) entrega el loopback del host.
- **Señalización host:** `senalizacionPeerJs.ts:registrarHost` (L73-91) abre un
  Peer con un código corto como id y emite un `CanalDatos` por cada `connection`.
  El SDK se carga con `import("peerjs")` (L155-158): no entra al bundle hasta usar
  online.
- **Jugador (cliente):** `transporteOnlineCliente.ts` implementa `TransporteCliente`
  sobre un `CanalDatos` (L42), espejo del LAN-navegador, con latido +
  anti-throttling por `visibilitychange` (L97-107).
- **Ya cableado en la UI (no es código muerto):**
  `pantallaConexion.ts` "Online → Crear partida" (L88-92, L192-199) →
  `coordinador.ts:crearPartidaOnline()` (L260-273) → `iniciarHostOnline(...)` →
  el host (re)conecta por `fabricaTransporteHost = () => clienteLocalHostOnline()`
  (L271). El selector de transporte en `coordinador.ts:296-300` usa el loopback
  para el host y el adaptador WebRTC para los jugadores.

> ⚠️ La nota de `CLAUDE.md` ("online es el enganche de la Fase 7, hoy
> deshabilitado en la pantalla de conexión") está **desactualizada**: el flujo
> online de crear/unirse está activo en `pantallaConexion.ts`.

---

## 6. Refactors / verificaciones priorizados

El spike concluye que **no hay refactor de desacople bloqueante** para correr la
capa lógica en el WebView con transporte WebRTC-host. Lo que queda son
verificaciones y riesgos menores, ordenados por riesgo:

1. **(Riesgo medio) Throttling de `setTimeout` en el host-Android en background.**
   El orchestrator agenda la gracia de reconexión (`GRACIA_MS = 10s`,
   `orquestador.ts:68`, `marcarAusente` L197-207) y el salto de turnos con
   `setTimeout` global. En LAN ese reloj vive en el sidecar (proceso aparte, inmune
   al throttling); en online-host vive en el MISMO webview. Si Android suspende
   timers cuando la app pasa a background, la gracia/salto de turnos del **host**
   podría congelarse para todos los remotos. El cliente ya mitiga el lado jugador
   (`visibilitychange`), pero el host-autoridad es nuevo en este contexto. → Probar
   en dispositivo; evaluar si hace falta mantener vivo el reloj del host.
2. **(Riesgo bajo) Confirmar que el bundle de Vite no arrastre Node.** `crearSala`/
   `registroMotores` son browser-safe por diseño, pero conviene validar con un
   build real del cliente (`npm run build`) que ninguna import transitiva tire de
   `ws`/`node:os`. Es una verificación, no un cambio.
3. **(Doc, fuera de esta sesión) Actualizar `CLAUDE.md`:** la frase "online …
   deshabilitado en la pantalla de conexión" ya no es cierta.

---

## 7. Preguntas abiertas

- **Timers del host en background (Android):** ¿el WebView de Android pausa
  `setTimeout` con la app en segundo plano? Si sí, ¿cómo afecta a la gracia de
  reconexión y al salto de turnos que decide el host-autoridad para los remotos?
  (No verificable leyendo el repo; requiere prueba en dispositivo.)
- **Broker PeerJS público:** ¿la fiabilidad/latencia del broker por defecto basta
  en redes móviles, o se planea self-hostear la señalización (la interfaz
  `ClienteSenalizacion` ya lo permite sin tocar transporte)?
- **TURN en móvil:** las credenciales TURN viven en `client/.env.local`
  (gitignored). ¿El build de Android inyecta esas env (`import.meta.env`) en CI/
  release, o hay que documentar un paso de build específico?
- **game-id del host:** hoy `iniciarHostOnline` y `embebido.ts` fijan `"carioca"`
  por defecto. ¿Android elige el juego antes de crear la sala (ya lo hace la UI vía
  `juegoSeleccionado`), y se confirma que el game-id viaja correcto en el flujo
  online?
- **Reentrada/lifecycle Android:** al minimizar/restaurar o rotar, ¿el webview
  preserva el `Orquestador` host en memoria, o Android puede recrear la Activity y
  perder la partida? (Lifecycle de Tauri Android, no verificable en el repo.)
