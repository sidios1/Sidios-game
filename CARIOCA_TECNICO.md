# Carioca — Resumen técnico del módulo

Cómo está construido el juego de Carioca de punta a punta: desde el clic en la
mesa 3D hasta la regla que valida cada jugada. El recorrido sigue el camino de
los datos: **GUI → red → orquestador → motor → core puro**, y de vuelta
**core → vista → diff → escena**.

> Documento descriptivo del estado actual del código. Las reglas mandan en
> `REGLAS_CARIOCA.md` (única fuente de verdad); este texto explica el *cómo* del
> software, no el reglamento.

---

## 1. Mapa de capas

```
┌──────────────────────────────────────────────────────────────────────┐
│ CLIENTE (packages/client) — Three.js + Vite                            │
│                                                                        │
│  Hub/Coordinador ── PantallaConexión ── Perfil                         │
│        │ (elige juego, conecta a la sala LAN)                          │
│        ▼                                                               │
│  JuegoCarioca (IJuego)                                                 │
│    ├─ Seleccionador (raycast: puntero → eventos/gestos)                │
│    ├─ MáquinaInteracción (pura: estado+evento → comandos)              │
│    ├─ difVista (qué cambió entre dos vistas)                           │
│    ├─ Sincronizador + disposición (poses objetivo) + Interpolador      │
│    ├─ Escena (renderer, mesa, cámara, luces) + mallaCarta/texturas     │
│    └─ Hud / Insignias / Tooltip (DOM superpuesto)                      │
└───────────────▲───────────────────────────────────┬────────────────────┘
                │ VistaPartida (JSON)                │ MensajeCliente (JSON)
                │                                    ▼
┌───────────────┴────────────────────────────────────────────────────────┐
│ SERVIDOR (packages/server) — autoridad                                  │
│                                                                         │
│  TransporteLan (ws) ── Orquestador (genérico) ── MotorCarioca (puerto)  │
│                              │                          │               │
│                       conexiones, asientos,      traduce intención →    │
│                       reconexión, votos          llamada al core        │
│                              │                          │               │
│                              └──── construirVista ◄──────┘               │
└──────────────────────────────────────────┬──────────────────────────────┘
                                            │ (sin red, sin DOM)
┌───────────────────────────────────────────▼─────────────────────────────┐
│ CARIOCA-CORE (packages/carioca-core) — lógica pura, determinista         │
│  carta · mazo · combinaciones · contratos · puntaje · partida (reducer)  │
└──────────────────────────────────────────────────────────────────────────┘
```

Reglas de oro que se respetan en todo el módulo:

- **El servidor es la autoridad.** El cliente envía *intenciones*; el servidor
  valida con el core y emite el estado resultante. El cliente solo renderiza.
- **El core es puro.** Sin Three.js, sin `ws`, sin DOM, sin `Math.random`
  directo. Funciones deterministas y testeables.
- **Información oculta.** A cada jugador solo le viaja SU mano; de lo ajeno y del
  mazo, solo conteos; del pozo, la carta superior.

---

## 2. `carioca-core` — la lógica pura del juego

Paquete TypeScript sin dependencias de runtime. Todo es determinista: la
aleatoriedad entra como parámetro (un `GeneradorAleatorio`).

### 2.1 Modelo de carta (`carta.ts`)

- `Carta = CartaNormal | CartaComodin`.
- `CartaNormal`: `pinta` (corazones/diamantes/tréboles/picas), `valor` (1=As …
  13=K) e `id` único.
- `CartaComodin`: solo `tipo` e `id`. **Los 2 rojos NO son comodines**: un 2♥ es
  carta normal.
- El `id` codifica `pinta-valor-copia` para distinguir las copias del doble mazo
  (no hay tope de mazos: la copia es un índice).

### 2.2 Mazo y materiales (`mazo.ts` + datos de `contratos.ts`)

- Los materiales **escalan con la cantidad de jugadores** (sin tope superior):
  `mazos = 2 × máx(1, ⌊jugadores/4⌋)`, `comodines = mazos × 2`. Con 2–6
  jugadores son las 108 cartas clásicas (2 mazos + 4 comodines).
- Convención de todo el motor: **la cima de un montón es el último elemento del
  array**.
- `reponerMazoDesdePozo`: al agotarse el mazo se conserva la carta superior del
  pozo y el resto se vuelve mazo **sin barajar** (la última descartada es la
  primera en robarse). Decisión de diseño no cubierta por el reglamento.

### 2.3 Combinaciones (`combinaciones.ts`)

Validadores puros, en el **orden propuesto por el jugador** (ascendente):

- **Trío**: 3+ cartas del mismo número, cualquier pinta.
- **Escala**: 4+ consecutivas de la misma pinta. **As puente** (…Q-K-A-2-3…,
  secuencia circular) configurable por dato `ESCALA.asPuente`.
- **Escala sucia**: 13 cartas A→K en orden, cualquier pinta, admite 1 comodín.
- **Escala real**: como la sucia, una sola pinta, sin comodín.

Los comodines toman el valor de su posición (la escala se ancla en la primera
carta normal). `validarContrato` exige cumplimiento **exacto** del contrato de la
mano: ni más ni menos combinaciones de cada tipo. `extenderEscala` calcula si una
carta extiende una escala por un extremo (para pegar).

### 2.4 Contratos como datos (`contratos.ts`)

Transcripción fiel de la §9 del reglamento. Las 9 manos (`MANOS`) son datos, no
condicionales en el código:

| # | Mano | Requisito | Comodines/comb. | Cierre auto |
|---|------|-----------|-----------------|-------------|
| 1 | 2 tríos | 2 trío | 1 | no |
| 2 | 1 trío + 1 escala | 1 trío, 1 escala(≥4) | 1 | no |
| 3 | 2 escalas | 2 escala(≥4) | 1 | no |
| 4 | 3 tríos | 3 trío | 1 | no |
| 5 | 2 tríos + 1 escala | 2 trío, 1 escala | 1 | no |
| 6 | 1 trío + 2 escalas | 1 trío, 2 escala | 1 | no |
| 7 | 3 escalas | 3 escala(≥4) | 1 | no |
| 8 | Escala sucia | 1 escalaSucia | 1 | **sí** |
| 9 | Escala real | 1 escalaReal | 0 | **sí** |

`VALOR_PUNTOS` (2–9 nominal, 10/J/Q/K = 10, As = 20, comodín = 30) y `MATERIALES`
también viven aquí como dato.

### 2.5 Puntaje (`puntaje.ts`)

`puntosCarta` / `puntosMano` aplican `VALOR_PUNTOS`. Quien cierra la mano suma 0;
los demás suman lo que les quedó en la mano. Gana la partida el **menor** puntaje
acumulado tras las 9 manos.

### 2.6 La partida como reducer puro (`partida.ts`)

Es el corazón del juego: estado **inmutable** y acciones que devuelven un
`Resultado<EstadoPartida>` (éxito con estado nuevo, o error tipado con
`CodigoError`). Ninguna acción muta su entrada.

- **Estado** (`EstadoPartida`): jugadores (cada uno con mano, puntos,
  `turnoEnQueSeBajo`), `manoActual` (1–9), `mazo`, `pozo`, `mesa`
  (combinaciones bajadas con su dueño), `turno` (`jugadorId`, fase
  `robar|descartar`, `numero`), `repartidorIdx`, `fase`
  (`jugandoMano|manoTerminada|partidaTerminada`), `ganadorManoId`.
- **Acciones**: `robarDelMazo`, `robarDelPozo`, `bajarse`, `pegar`, `descartar`,
  `pasarTurno`. Todas pasan por `validarAccion` (fase de mano correcta, turno
  correcto, sub-fase correcta).
- **Ciclo de turno**: robar (mazo o pozo) → opcionalmente bajarse/pegar →
  descartar (pasa el turno al siguiente). En las manos 8 y 9
  (`cierreAutomatico`) el jugador baja sus 13 cartas y gana sin descartar.
- **Bajarse**: solo tras robar, una vez por mano, con el contrato **exacto**. Si
  la mano queda en 0, cierra la mano.
- **Pegar**: a combinaciones propias o ajenas, solo en turnos **posteriores** al
  de bajarse. Comodín pegable solo si la combinación destino aún admite uno
  según el contrato.
- **Descartar**: termina el turno; prohibido descartar comodín salvo en manos
  donde no se permiten (mano 9).
- **`pasarTurno`**: avanza al siguiente jugador sin mover cartas. Lo usa el
  servidor para saltar a un ausente; sus cartas se cuentan normalmente al cerrar.
- **Cierre y avance**: `cerrarMano` reparte puntos y marca la mano/partida
  terminada; `iniciarSiguienteMano` rota el repartidor y reparte con el contrato
  siguiente.

Tests junto al código (`*.test.ts`): combinaciones, contratos, puntaje, partida
y una partida completa de las 9 manos.

---

## 3. `packages/server` — la autoridad

El servidor no conoce las reglas: las delega al core a través de un **puerto de
motor**. Tres piezas clave, todas desacopladas por interfaces.

### 3.1 El puerto `MotorJuego` (`motor.ts`)

Costura que vuelve **genérico** al orquestador. Un `MotorJuego<E, A>` envuelve la
lógica de UN juego y le da al orquestador todo sin que este conozca las reglas:
`crear`, `parsearAccion` (valida solo la FORMA), `aplicarAccion`,
`jugadorEnTurno`, `saltarTurno`, `terminada`, `esperandoContinuar`, `continuar`,
`construirVista`. El orquestador **nunca inspecciona** `E` ni `A`: solo los pasa
entre llamadas. (Análogo al `IJuego` del cliente, pero del lado autoritativo.)

### 3.2 `MotorCarioca` (`juegos/carioca/motorCarioca.ts`)

**Único archivo del servidor que importa `@juegos/carioca-core`.** Hace dos
cosas:

1. **Valida la forma** de cada acción de Carioca (`analizarPropuesta`, tipos de
   combinación, extremos…) y la traduce a una `AccionCarioca` tipada.
2. **Traduce** esa acción a la llamada del core (`robarDelMazo`, `bajarse`,
   `pegar`, `descartar`, …) y proyecta la vista con `construirVista`.

Acepta `mazoParaMano` para inyectar mazos deterministas en tests.

### 3.3 El orquestador (`orquestador.ts`)

Genérico: mantiene jugadores, asientos y el ciclo de conexión; le pide al motor
la validación, la transición de turnos/rondas y la vista. Solo conoce las
interfaces de `transporte.ts` (no sabe si habla LAN, online o memoria).

Responsabilidades propias (no son reglas de juego):

- **Lobby y asientos**: `unirse` crea un asiento con `jugadorId`, nombre, avatar
  y **token de reconexión**. El asiento 0 es el anfitrión.
- **Intenciones**: `accionJuego` → `motor.parsearAccion` (forma) →
  `motor.aplicarAccion` (regla) → estado nuevo o error. La intención **no lleva
  `jugadorId`**: se deriva de la conexión, así nadie actúa por otro.
- **Reconexión por token**: la identidad es el token, sin exigir canal libre. Si
  quedó un socket zombi reteniendo el asiento, se cierra y se reattacha al canal
  nuevo. Nunca se crea un asiento nuevo.
- **Gracia y suspensión**: al desconectarse en partida, el asiento pasa a
  `ausente` con **10 s de gracia** (no se le salta el turno). Pasada la gracia se
  saltan sus turnos; tras **2 saltos** queda `suspendido` (se salta siempre). Al
  reconectar se limpia el historial.
- **Anfitrión reabre conexión**: `reabrirConexion` suelta el canal trabado de un
  jugador y le abre la ventana para reentrar con su token. **No es expulsión**:
  conserva asiento, mano y puntaje.
- **Avance de mano por votos**: la siguiente mano se reparte cuando vota al menos
  el **75 % de los conectados** (`listoSiguienteMano`). Una desconexión baja el
  denominador y puede disparar el avance.
- **`difundirVistas`**: a cada jugador conectado le envía SU vista; las manos
  ajenas nunca viajan.

### 3.4 La vista por jugador (`vista.ts`)

`construirVista` es **donde vive la información oculta**: proyecta el
`EstadoPartida` a una `VistaPartida` segura para un jugador concreto:

- `tuMano`: las cartas reales del jugador.
- De los demás: solo `numeroCartas`, puntos, `seBajo` y estado de conexión.
- Del mazo: solo `numeroMazo`. Del pozo: `pozoTope` (la única conocida) y
  `numeroPozo`.
- `mesa` completa (es pública), contrato, turno, fase, y `resumenMano` /
  `ganadoresIds` al terminar.

`MetaSala` es lo que el orquestador sabe y el core no (conexiones, votos,
avatares); se inyecta en cada `construirVista`.

### 3.5 Transporte (`transporte.ts`, `transporteLan.ts`, `latido.ts`)

- El orquestador habla solo con `TransporteServidor`/`TransporteCliente`
  (strings JSON, sin tipos de Node).
- `transporteLan.ts` (librería `ws`, escucha en `0.0.0.0`, código de sala =
  `ip:puerto`) es el adaptador real; `transporteMemoria.ts` sirve para tests. El
  modo online (futuro) será otro adaptador de las mismas interfaces.
- **Latido/heartbeat** vive en la capa de transporte (frames de control
  `{"__lat":...}` que los adaptadores consumen y nunca pasan a sus oyentes). El
  servidor sondea con ping de `ws`; el cliente manda PING app-level y vigila el
  silencio (el WebSocket del navegador no expone ping/pong).

---

## 4. `packages/client` — del puntero a la pantalla

App Three.js + Vite. La regla de oro del cliente: **la vista del servidor es la
verdad**. Las animaciones solo *representan* el estado; jamás lo deciden ni lo
bloquean.

### 4.1 Entrada: Hub y Coordinador

`Coordinador` (`hub/coordinador.ts`) orquesta el ciclo de vida completo:
**perfil → menú de juegos → conexión/sala LAN → juego → volver al menú**. No
importa ningún juego concreto: solo el catálogo (`DefinicionJuego`), la interfaz
`IJuego`, la `Conexion` y las pantallas. Es dueño del perfil (nickname + avatar),
que viaja a la partida en el mensaje `unirse`.

También es el dueño de la **reconexión automática**:

- Cada intento sube una `gen`; los callbacks de un canal viejo se descartan
  (reconexión **idempotente**: varios intentos no duplican asientos).
- Backoff acotado con jitter: primer reintento ~0.5 s, se duplica hasta ~8 s.
- El botón "Reconectar" del HUD es respaldo: fuerza un intento inmediato por el
  mismo camino (reattach por token).
- En la app de escritorio, "Crear partida" arranca el **servidor LAN embebido**
  (sidecar) y se une a su código `ip:puerto`.

### 4.2 `JuegoCarioca` — el adaptador `IJuego`

`juegos/carioca/juegoCarioca.ts` implementa `IJuego` (iniciar →
sincronizarEstado/procesarAccion* → finalizar). Es el cableado central del
cliente:

- **`iniciar`** monta `Escena`, `Sincronizador`, `Hud`, `Tooltip`,
  `InsigniasMesa`, `Seleccionador` y arranca el bucle de render.
- **`sincronizarEstado(vista)`**: llega una vista nueva del servidor → calcula el
  `difVista` → reconcilia el orden de la mano → despacha el evento `vista` a la
  máquina de interacción.
- **`despachar`** es el hilo conductor: pasa cada evento por la máquina pura,
  envía los comandos resultantes por la conexión, muestra avisos y reaplica la
  escena y el HUD con la última vista.
- Gestiona el **arrastre visual** de cartas (mismas intenciones que el clic
  equivalente al soltar sobre pozo / combinación / zona de bajada).

### 4.3 Captura del puntero: `Seleccionador` (`escena/seleccion.ts`)

Único módulo que conoce el puntero, el raycast y el plano de arrastre. Traduce
gestos a eventos semánticos:

- **Raycasting**: del puntero a la primera malla interactiva (cartas + zonas
  fijas de mazo/pozo/mesa). El `userData` de cada malla declara qué es vía un
  `WeakMap` tipado (sin casts).
- **Tap vs. drag**: un click corto sobre una carta propia emite `clickCarta`;
  pasar el umbral de 6 px lo convierte en arrastre. Mientras se arrastra,
  proyecta el puntero al plano de la mesa y decide el destino (mano, pozo,
  combinación, zona de bajada o "fuera").
- **Hover**: resalta la carta bajo el cursor (emissive) y dispara el tooltip.

### 4.4 La máquina de interacción (`estado/maquinaInteraccion.ts`)

**Pura**: `(estado, evento) → {estado, comandos, aviso}`. No toca DOM ni Three ni
red. Las validaciones locales son cortesía de UI (usan los validadores del core);
**el servidor revalida todo**.

- **Modos**: `sinPartida`, `esperandoTurno`, `robar`, `descartar`,
  `construyendoBajada`, `eligiendoExtremo`, `manoTerminada`, `partidaTerminada`.
- **La vista nueva manda**: al llegar una `VistaPartida`, recalcula el modo según
  fase/turno y **poda** lo que ya no aplica (selección, propuesta, pegada
  pendiente).
- Construye la propuesta de bajada por grupos, resuelve el extremo de una escala
  al pegar cuando la carta calza por ambos lados, y vota "listo" al fin de mano.
- Sus salidas son `MensajeCliente` (las mismas intenciones del protocolo) que el
  contexto del hub envía por la conexión.

### 4.5 De la vista a la escena: diff → poses → tweens

Tres piezas convierten "el estado nuevo" en "movimiento en pantalla":

1. **`difVista` (`estado/difVista.ts`)**: compara dos vistas y describe **qué
   pasó** (robo propio/ajeno, descarte, bajada, pegada, reciclaje del mazo, fin
   de mano/partida) a partir de ids propios y de conteos ajenos. No decide
   reglas; solo aporta **desde dónde** aparece cada carta. Si un cambio no calza
   con ningún patrón, se omite (el layout final igual reflejará la vista nueva).

2. **`calcularDisposicion` (`escena/disposicion.ts`)**: dada la vista, devuelve la
   **pose objetivo** de cada instancia visible (sin tocar Three). Las claves de
   instancia persisten entre zonas, así una carta que pasa de la mano al pozo
   conserva su malla:
   - `carta:<id>` — carta real (mi mano, tope del pozo, mesa).
   - `dorso:mazo:<i>` / `dorso:pozo:<i>` — pilas anónimas.
   - Mi mano se dibuja en abanico (baseline de altura único + cascada de
     profundidad ligada al índice + giro sutil); la seleccionada se levanta.
   - Las manos ajenas **no se dibujan** como cartas: cada rival se representa por
     su insignia (avatar + nick) fuera del fieltro.
   - La mesa de bajadas se acomoda en una cuadrícula que crece con el número de
     jugadores.

3. **`Sincronizador` (`escena/animaciones.ts`)**: lleva cada malla a su pose
   objetivo con tweens (vía `Interpolador`). Crea las mallas que faltan, elimina
   las que ya no están y **redirige** las existentes. Si llega otra vista a mitad
   de una animación, cada malla simplemente apunta a su objetivo nuevo: **el
   final siempre refleja la última vista**. Los `CambioVista` del diff solo
   aportan el punto de origen del vuelo (mazo, pozo o la mano de un jugador) y el
   *stagger* del reparto inicial.

### 4.6 La escena 3D (`escena/escena.ts`, `mallaCarta.ts`, `texturasCarta.ts`)

- **`Escena`**: renderer WebGL, fieltro circular + borde (toro), cámara
  perspectiva, luces (ambiental + direccional), y las **zonas fijas
  clickeables** de mazo, pozo y "soltar para bajarse" (visibles aunque las pilas
  estén vacías). El bucle de render llama a `interpolador.actualizar(dt)` cada
  cuadro. La mesa y la cámara **se reescalan** según el número de jugadores
  (`dimensionesMesa.ts`, fuente única de radios/cámara/asientos).
- **`mallaCarta`**: cada carta es una caja fina (`BoxGeometry`) con cara y dorso
  texturizados; el material de la cara es propio de cada malla para que el hover
  no afecte a otras. La interacción se registra en un `WeakMap` tipado.
- **`texturasCarta`**: las caras se **generan 100 % por código** con canvas 2D
  (índice + pinta en esquinas, símbolo grande al centro; comodín con estrella;
  dorso con trama de rombos). Sin assets externos. Texturas cacheadas por id.

### 4.7 El HUD (`hud/hud.ts` y paneles)

DOM superpuesto al canvas, re-renderizado completo en cada cambio de estado (es
pequeño y barato):

- Barra superior: contrato y turno (banner con avatar del jugador en turno) +
  botón "Reconectar" (respaldo para todos).
- Lista de jugadores a la derecha: cartas, puntos, "bajado", estado de conexión
  (`ausente`/`suspendido`), voto "listo". El anfitrión ve el botón "Reabrir
  conexión" en los jugadores no conectados.
- Acciones contextuales abajo según el modo (robar, descartar, "Bajarse…").
- Paneles modales: construcción de bajada (`panelBajada`), elección de extremo,
  resumen de fin de mano/partida (`panelResumen`).
- Avisos como *toast* temporal (4 s).

---

## 5. El protocolo (`packages/server/protocolo.ts`)

Mensajes JSON entre cliente y orquestador. Las acciones de juego viajan en un
**sobre genérico** (`AccionJuego`, solo garantiza `tipo: string`): el protocolo
no conoce las reglas de ningún juego; la forma concreta la valida el motor.

- **Cliente → servidor** (`MensajeCliente`): de lobby (`unirse` con nombre /
  avatar / token / juego, `iniciarPartida`, `listoSiguienteMano`,
  `reabrirConexion`) o cualquier acción de juego plana (`robarDelMazo`,
  `robarDelPozo`, `bajarse`, `pegar`, `descartar`).
- **Servidor → cliente** (`MensajeServidor`): `bienvenida` (jugadorId + token),
  `estadoSala`, `vista`, `error` (código + mensaje), `salaCerrada`.

---

## 6. Recorrido de una jugada (ejemplo: descartar)

1. El jugador suelta una carta sobre el pozo. `Seleccionador` resuelve el gesto y
   `JuegoCarioca` despacha `soltarEnPozo`.
2. La **máquina de interacción** valida localmente (modo `descartar`, carta en
   mano) y emite el comando `{ tipo: "descartar", cartaId }`.
3. El **coordinador** lo envía por la conexión LAN como JSON.
4. El **orquestador** recibe, deriva el `jugadorId` de la conexión, pide al
   **MotorCarioca** parsear la forma y aplicar la acción.
5. El motor llama a `descartar` del **core**, que valida la regla (es tu turno,
   fase descartar, no es comodín en mano prohibida…) y devuelve el
   `EstadoPartida` nuevo (o un error tipado). El turno pasa al siguiente.
6. El orquestador `reaccionar`: salta turnos de ausentes si toca y
   **`difundirVistas`** — a cada jugador, su `VistaPartida` proyectada.
7. En el cliente, `sincronizarEstado` calcula el `difVista` (un `descarte`), la
   máquina recalcula el modo (`esperandoTurno`) y el **Sincronizador** anima la
   carta volando desde la mano del descartador hacia el pozo. El HUD se
   re-renderiza.

Si el servidor rechaza la jugada, llega un `error` que el HUD muestra como aviso
y el estado local no cambia: **la próxima vista del servidor sigue siendo la
verdad**.

---

## 7. Dónde tocar cada cosa

| Quiero cambiar… | Archivo(s) |
|-----------------|------------|
| Una regla del juego | `REGLAS_CARIOCA.md` primero, luego `carioca-core` (`partida.ts`, `combinaciones.ts`, `contratos.ts`) |
| Un contrato / puntaje / materiales | `carioca-core/contratos.ts` (datos, §9) |
| Qué ve cada jugador (información oculta) | `server/vista.ts` |
| Conexión, reconexión, votos, gracia | `server/orquestador.ts` |
| Traducción intención→core / forma de acción | `server/juegos/carioca/motorCarioca.ts` |
| Layout/poses de la mesa 3D | `client/escena/disposicion.ts` + `dimensionesMesa.ts` |
| Animaciones / desde dónde vuela una carta | `client/escena/animaciones.ts` + `estado/difVista.ts` |
| Lógica de clics/arrastre del usuario | `client/estado/maquinaInteraccion.ts` + `escena/seleccion.ts` |
| Aspecto de las cartas | `client/escena/texturasCarta.ts` / `mallaCarta.ts` |
| HUD / paneles | `client/hud/*` |

> No duplicar reglas en `server` ni `client`: viven **solo** en `carioca-core`.
> No confiar en el cliente: toda acción se revalida en el servidor.
