# CLAUDE.md — Plataforma de juegos de cartas multijugador

Guía del proyecto para Claude Code. Léela completa antes de tocar código.

## Documentos clave
- `PLAN.md` — fases del proyecto. Cada sesión implementa UNA fase.
- `REGLAS_CARIOCA.md` — **única fuente de verdad** del reglamento de Carioca.
  Su sección 9 define los contratos como datos (`MANOS`, `VALOR_PUNTOS`, `ESCALA`).
- `HUB.md` — contrato `FichaCatalogo` (ficha de catálogo del launcher) y cómo
  registra su tarjeta un módulo nuevo sin tocar `src/hub/`.

## Stack
| Capa | Tecnología | Paquete |
|------|------------|---------|
| Lógica de juego | TypeScript puro + Vitest | `packages/carioca-core` |
| Servidor | Orquestador autoritativo + transporte intercambiable (adaptador LAN con `ws`) | `packages/server` |
| Cliente | Three.js + Vite (app web, Fase 3); Tauri la empaqueta en la Fase 5 | `packages/client` |

- Monorepo con **npm workspaces** (Node >= 22, npm >= 10).
- Nombres de paquetes con scope: `@juegos/carioca-core`, `@juegos/server`, `@juegos/client`.

## Estructura de carpetas
```
/
├── PLAN.md
├── REGLAS_CARIOCA.md
├── CLAUDE.md
├── package.json          (raíz: workspaces + scripts build/test)
├── tsconfig.base.json    (opciones strict compartidas)
├── tsconfig.json         (references a los 3 paquetes)
└── packages/
    ├── carioca-core/     (lógica + tests; src/**/*.test.ts)
    ├── server/           (orquestador + transportes; src/**/*.test.ts)
    │                     (src/embebido.ts + scripts/construir-sidecar.mjs: sidecar Fase 5)
    └── client/           (Three.js + Vite; src/red, src/estado, src/escena, src/hud)
        └── src-tauri/    (app de escritorio Tauri, Fase 5; binaries/ = sidecar del servidor)
```

## Comandos
```bash
npm install        # instala todo el monorepo (desde la raíz)
npm run build      # tsc -b: compila los 3 paquetes
npm test           # vitest en carioca-core, server y client
```

### Desarrollo web del cliente (servidor aparte)
```bash
npm run build       # primero: el cliente resuelve @juegos/server contra dist/
npm run dev:server  # sala LAN en el puerto 35711 (env PUERTO lo cambia);
                    # imprime el código ip:puerto que usan los que se unen
npm run dev:client  # Vite en http://localhost:5173
```
- En el NAVEGADOR (sin Tauri) el host elige "Local → Crear partida" (se conecta a
  `127.0.0.1:35711`, asumiendo `dev:server` corriendo); los demás "Local → Unirse"
  con el código que imprimió la consola del servidor.
- Para probar 2 jugadores en una máquina: segunda ventana en incógnito
  (el token de reconexión vive en `sessionStorage`; duplicar pestaña lo copia).

### App de escritorio con servidor LAN embebido (Fase 5)
En la app empaquetada con Tauri, "Crear partida" arranca el servidor por dentro:
el flujo manual de `dev:server` ya NO hace falta.
```bash
npm run empaquetar:sidecar -w @juegos/server  # construye el sidecar (Node SEA)
npm run tauri:dev   -w @juegos/client         # app en desarrollo (requiere Rust)
npm run tauri:build -w @juegos/client         # ejecutable/instalador distribuible
```
- Requisitos para compilar Tauri: **toolchain de Rust** (`rustup`) y WebView2 (ya
  viene en Windows 11). El sidecar se construye solo con Node (sin Rust).
- Flujo del host: "Local → Crear partida" arranca el sidecar, que escucha en la LAN
  e imprime su `ip:puerto`; la app se une a ese código y lo muestra en la sala para
  compartir. Los amigos de la misma WiFi entran con "Local → Unirse".
- Primer arranque en Windows: el Firewall pedirá permitir la app en redes privadas.

#### Cómo y dónde se levanta el servidor embebido
- **Sidecar:** `packages/server/src/embebido.ts` (mismo orquestador + adaptador LAN
  de la Fase 2; imprime una línea marcador `CODIGO=ip:puerto`). Se empaqueta como
  ejecutable autocontenido con **Node SEA** vía `packages/server/scripts/construir-sidecar.mjs`
  (esbuild → blob SEA → postject) y queda en `packages/client/src-tauri/binaries/`
  con el target triple que exige `bundle.externalBin` de Tauri.
- **Lanzador (cliente):** `packages/client/src/red/servidorEmbebido.ts` es el ÚNICO
  módulo del cliente que conoce `@tauri-apps/*` (vía `import()` dinámico, para no
  arrastrar Tauri al bundle web ni a los tests). `hayServidorEmbebido()` detecta la
  app; `iniciarServidorEmbebido()` lanza el sidecar (`Command.sidecar`) y resuelve
  con su código; `detenerServidorEmbebido()` lo apaga al volver al hub.
- **Puerto:** constante `PUERTO_EMBEBIDO` en `servidorEmbebido.ts` (default `35711`),
  que se pasa al sidecar como env `PUERTO`. Cámbialo en ese único lugar.
- **Permiso/seguridad Tauri:** `src-tauri/capabilities/default.json` autoriza ejecutar
  el sidecar `binaries/servidor`; el CSP de `tauri.conf.json` permite `ws://` en la LAN.
  Solo LAN: el servidor escucha en `0.0.0.0` sin exponerse a internet.
- **Metadatos de empaquetado:** el editor es **Sidios** y el identificador del bundle
  `cl.sidios.sidiosgame`. Viven en `tauri.conf.json` (`identifier` +
  `bundle.publisher` / `bundle.copyright` / `bundle.homepage`, homepage `https://sidios.cl`).

## Convenciones
- **TypeScript strict** en todos los paquetes (además: `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). No relajar opciones del
  `tsconfig.base.json`; nada de `any` ni `as` para silenciar errores.
- **Nombres en español**: tipos, funciones, variables, archivos y mensajes
  (`Carta`, `Mazo`, `validarTrio`, `robarDelPozo`). Las palabras reservadas y
  APIs externas quedan en inglés, obviamente.
- ESM en todo el repo (`"type": "module"`).
- Tests de carioca-core junto al código: `src/**/*.test.ts`.

## Reglas de arquitectura

### 1. `carioca-core` es lógica pura
- Sin dependencias de runtime: ni Three.js, ni Colyseus, ni Node APIs, ni DOM.
- Funciones deterministas y testeables. La aleatoriedad (barajar) recibe el
  generador/semilla como parámetro, no usa `Math.random` directo.
- Los contratos de las manos se cargan desde datos (sección 9 de
  REGLAS_CARIOCA.md), no se hardcodean en condicionales.

### 2. El servidor es la autoridad del estado
- El cliente envía **intenciones** (robar, descartar, bajarse, pegar);
  el servidor las valida con carioca-core y emite el estado resultante.
- El cliente jamás decide reglas ni muta estado por su cuenta: solo renderiza
  lo que el servidor sincroniza.
- Información oculta: cada jugador recibe SU mano; nunca las manos ajenas.
  La proyección vive en `construirVista` (`packages/server/src/vista.ts`):
  de lo ajeno y del mazo solo viajan conteos; del pozo, la carta superior.

### 3. El transporte es un adaptador (la costura LAN/online)
- El orquestador (`packages/server/src/orquestador.ts`) solo conoce las
  interfaces `TransporteServidor`/`TransporteCliente` de
  `packages/server/src/transporte.ts`. No sabe si habla por LAN, online o
  memoria; las interfaces transportan strings JSON, sin tipos de Node.
- `transporteLan.ts` (librería `ws`, escucha en 0.0.0.0, código de sala =
  `ip:puerto`) es la primera implementación; `transporteMemoria.ts` sirve
  para tests. En la Fase 5 el host embebido usa el adaptador LAN dentro de un
  sidecar (ver "App de escritorio con servidor LAN embebido"), no la memoria.
- El modo online (Fase 7) será OTRO adaptador de las mismas interfaces:
  no se toca orquestador, core, hub ni juegos.
- En el CLIENTE, `src/red/transporteLanNavegador.ts` implementa
  `TransporteCliente` con el WebSocket nativo del navegador (el
  `TransporteLanCliente` del server usa `ws` de Node y no corre ahí). Es el
  ÚNICO módulo del cliente que conoce WebSocket; `src/red/fabricaTransporte.ts`
  elige el adaptador según el modo ("online" es el enganche de la Fase 7,
  hoy deshabilitado en la pantalla de conexión).
- **Latido (heartbeat) y reconexión.** El keepalive vive en la CAPA DE
  TRANSPORTE, no en el orquestador: son frames de control (`@juegos/server/latido`,
  `{"__lat":"ping"|"pong"}`) que los adaptadores LAN consumen y NUNCA pasan a sus
  oyentes. El servidor sondea con ping nativo de `ws` + un vigía por conexión que
  termina las zombis; el cliente manda PING app-level y vigila el silencio (el
  WebSocket del navegador no expone ping/pong). Si el canal muere, el cliente lo
  cierra y el coordinador (`hub/coordinador.ts`) reconecta SOLO con backoff y
  reattach por token (idempotente: una `gen` descarta los canales viejos). El
  botón "Reconectar" del HUD es respaldo de TODOS los jugadores; el anfitrión
  además tiene "Reabrir conexión" por jugador (`reabrirConexion`, no expulsa).
- **Anti-throttling.** El servidor embebido corre como proceso aparte (sidecar),
  inmune al throttling del webview. Del lado cliente, `transporteLanNavegador.ts`
  escucha `visibilitychange`: al volver al frente sondea de inmediato para
  detectar a tiempo un canal caído y forzar el resync (la vista que difunde el
  orquestador).

### 4. Dependencias permitidas entre paquetes
```
client ──> carioca-core (solo tipos/validaciones de presentación)
client ──> rumble-core (solo config §6 + catálogo de habilidades para el panel del lobby)
client ──> server (solo protocolo, vista e interfaz TransporteCliente)
server ──> carioca-core, mentiroso-core, rumble-core
rumble-core ──> carioca-core (solo tipos: Carta/Pinta y el RNG determinista)
carioca-core ──> (nada)
mentiroso-core ──> (nada)
```
- `rumble-core` es la lógica pura del modo Rumble (modelo de las 18 habilidades
  como datos, config §6 + validación cruzada, muestreo ponderado determinista).
  Depende de `carioca-core` SOLO por tipos (`Carta`/`Pinta` para el snapshot RADAR,
  el RNG `GeneradorAleatorio`); cero Three.js/red/orquestador. Ver REGLAS_RUMBLE.md.
  Es browser-safe, así que el CLIENTE puede importarlo directo SOLO para el panel
  de config del lobby (`ConfigRumble`, `CONFIG_DEFAULT`, `validarConfigRumble`,
  `HABILIDADES`): reusa el schema y la validación §6 sin duplicar reglas. El resto
  de Rumble (motor, vista) sigue viviendo en el server; el cliente NO lo importa.
- El cliente importa SIEMPRE los subpaths `@juegos/server/protocolo`,
  `@juegos/server/vista`, `@juegos/server/vistaJuego`, `@juegos/server/transporte`
  y `@juegos/server/latido` (definidos en el `exports` del server; todos
  type-only o puros, sin `ws`/Node), nunca la raíz `@juegos/server`: la raíz
  reexporta `transporteLan.ts` y arrastraría `ws`/`node:os` al bundle del
  navegador. `vistaJuego.ts` es el punto de composición de las vistas: exporta
  la unión DISCRIMINADA `VistaJuego` (la vista de cualquier juego) y reexporta las
  formas de Mentiroso y los tipos de carta de su core (el cliente no depende de
  mentiroso-core directamente). El discriminante es el campo `juego` (= game-id)
  en las cuatro variantes: `"carioca"` (VistaPartida), `"carioca-rumble"`
  (VistaRumble), `"mentiroso"`, `"uno"`; con él se estrecha la unión con seguridad
  (`vista.juego === "…"`), además del narrowing bivariante que hace cada juego.
  (Excepción: los tests del cliente pueden importar la raíz para HOSPEDAR
  una sala real, como hace `transporteLanNavegador.test.ts`.)
- **Modo online (Fase 7): el host corre el orquestador en el webview
  (cliente-host).** A diferencia de LAN (servidor en un sidecar Node), online no
  tiene proceso aparte: el host instancia el `Orquestador` DENTRO del webview
  sobre `TransporteOnlineServidor` (WebRTC). Para eso el cliente importa los
  subpaths *browser-safe* `@juegos/server/orquestador`, `@juegos/server/registroMotores`
  y `@juegos/server/motor`: son puros (no arrastran `ws`/Node, igual que
  protocolo/vista/transporte). La raíz `@juegos/server` SIGUE prohibida. El
  host-jugador se conecta a su propio orquestador por un cliente LOOPBACK
  en-proceso (`crearClienteLocal`), no por WebRTC.

### 3.bis Transporte online (WebRTC + señalización pluggable)
- `TransporteOnline*` vive SOLO en el cliente (`src/red/online/`) e implementa las
  MISMAS interfaces de `transporte.ts`; el orquestador no cambia. `transporteOnlineCliente.ts`
  (jugador) es el espejo de `transporteLanNavegador.ts` y reusa `Latido` + el
  `visibilitychange` anti-throttling; `transporteOnlineServidor.ts` (host) atiende
  peers remotos (WebRTC) + el loopback del host, y consume los frames de latido
  como `transporteLan.ts`.
- **Señalización pluggable:** la interfaz `ClienteSenalizacion` (`senalizacion.ts`)
  abstrae al broker; `senalizacionPeerJs.ts` es la impl por defecto (PeerJS, broker
  en la nube) y el ÚNICO módulo que conoce `peerjs` (lo carga con `import()`
  dinámico). Para self-hostear el broker basta otra impl, sin tocar el resto.
- **Config ICE/credenciales:** `iceConfig.ts` lee STUN/TURN y el broker desde
  `import.meta.env` (Vite). Las credenciales de TURN viven en
  `packages/client/.env.local` (gitignored); `.env.example` documenta las claves.
  NUNCA se hardcodean ni se versionan. STUN público va como default (no secreto).
- **Código de sala online:** corto y legible (`codigoSala.ts`), usado como id del
  host en el broker; el lanzador del host vive en `red/hostOnline.ts`
  (`iniciarHostOnline`/`detenerHostOnline`, análogo a `servidorEmbebido.ts`).

### 5. En el cliente, la vista del servidor es la verdad
- `aplicacion.ts` recibe cada `VistaPartida`, calcula un diff
  (`estado/difVista.ts`) y el sincronizador (`escena/animaciones.ts`) lleva
  cada malla a su pose objetivo (`escena/disposicion.ts`) con tweens
  (`escena/interpolacion.ts`). Si llega otra vista a mitad de una animación,
  las mallas se REDIRIGEN: el final siempre refleja la última vista.
- Las animaciones solo representan el estado: jamás lo deciden ni lo bloquean.
  El HUD y la máquina de interacción (`estado/maquinaInteraccion.ts`, pura)
  leen siempre la última vista, no la escena.
- Las validaciones locales (armar la bajada, elegir extremo al pegar) son
  cortesía de UI con los validadores de carioca-core; el servidor revalida.

## Qué NO hacer
- ❌ Importar Three.js o cualquier API de red/render en `carioca-core`.
- ❌ Importar `ws` (o cualquier API de red/Node) en `orquestador.ts`,
  `protocolo.ts`, `vista.ts` o `transporte.ts`: solo `transporteLan.ts`
  conoce la red. El orquestador habla únicamente con la interfaz.
- ❌ Duplicar reglas del juego en `server` o `client`: las reglas viven SOLO en
  `carioca-core`.
- ❌ Hardcodear contratos de manos, puntajes o longitudes de escala: usar los
  datos de la sección 9 de REGLAS_CARIOCA.md.
- ❌ Confiar en el cliente: toda acción se valida en el servidor.
- ❌ Importar la raíz `@juegos/server` (o `ws`) desde el código del cliente:
  solo los subpaths protocolo/vista/transporte (ver regla 4).
- ❌ Enviar a un jugador información que no debería ver (manos ajenas, mazo).
- ❌ Cambiar reglas del juego editando código: si una regla cambia, se edita
  REGLAS_CARIOCA.md primero y el código la sigue.
- ❌ Implementar más allá de la fase en curso (ver PLAN.md).
- ❌ Avanzar de fase con tests en rojo o errores de `tsc`.
