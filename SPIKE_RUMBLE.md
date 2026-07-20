# SPIKE_RUMBLE.md — Sesión 0 (auditoría de arquitectura)

> Objetivo: verificar si la arquitectura actual admite Rumble como **capa aditiva
> sobre Carioca** sin reescribir su lógica. Documento de investigación: no propone
> código de producción. Basado en lectura del código real (rutas citadas).
>
> Fuentes leídas: `packages/server/src/{motor,orquestador,registroMotores,vista,vistaJuego,protocolo}.ts`,
> `packages/server/src/juegos/carioca/motorCarioca.ts`,
> `packages/carioca-core/src/{partida,contratos,aleatorio}.ts`,
> `packages/client/src/hub/coordinador.ts`, `HUB.md`, `REGLAS_RUMBLE.md`.

---

## Resumen ejecutivo

Rumble **encaja** en la arquitectura como un **motor decorador** (`MotorRumble`)
que envuelve `crearMotorCarioca()` e implementa el mismo puerto `MotorJuego<E,A>`.
El orquestador, el transporte (LAN/online) y el modelo de autoridad (host
autoritativo + vistas delgadas por jugador) **sirven tal cual**, sin tocarse.

Pero "sin reescribir Carioca" es cierto solo en parte: **~6 habilidades y 1 pieza
de la config exigen refactor ADITIVO de `carioca-core`** (nuevas costuras puras:
sesgar el robo, tomar carta arbitraria del pozo, mutar mano ajena, sobrescribir la
condición de victoria/misión por jugador, multiplicar puntaje). Son añadidos, no
cambios de reglas existentes; las reglas base de Carioca no se modifican. Lo que NO
existe hoy y hay que crear entero: el **estado de habilidades**, el **muestreo
ponderado con anti-combo**, la **extensión de vista para revelaciones**, y el
**contrato de configuración de partida + su propagación en el lobby**.

Nota afortunada: las **acciones de habilidad** (activar SAPO, usar JUDIO, etc.)
viajan en el sobre opaco `AccionJuego` del protocolo, que deja pasar cualquier
`tipo` sin conocerlo (`protocolo.ts:16-19,155-159`). El motor las parsea. Por eso
**activar habilidades no requiere tocar el protocolo**; solo la config sí.

---

## 1. Mapa habilidad → hook

Categorías de hook:
- **INFO** — revelar estado oculto (recortado) → proyección de vista por jugador.
- **ROBO** — sesgar/alterar de dónde y qué se roba.
- **MUT-PROPIA** — mutar la mano propia.
- **MUT-AJENA** — mutar estado de otro jugador + notificarle.
- **VICTORIA** — sobrescribir condición de victoria/misión por jugador.
- **TURNO** — interceptar/saltar turnos.
- **PUNTAJE** — alterar el puntaje de cierre de mano.
- **PASIVA/ESTADO** — solo estado de habilidad (cargas, ventana, snapshot).

| # | Habilidad | Categoría | Hook técnico concreto |
|---|-----------|-----------|-----------------------|
| 1 | DECRETALO | ROBO | Sesgar los próximos 3 robos del mazo hacia una carta elegida (+25%). `robarDelMazo` hoy solo hace `mazo.pop()` sin RNG (`partida.ts:307-334`). |
| 2 | MISH | INFO | Consultar ubicación (mazo / pozo / mano-de-quién) de una carta desde el estado completo del host, sin posición exacta. |
| 3 | RADAR | INFO/PASIVA | Snapshot al inicio de ronda de la pinta mayoritaria por jugador. Se calcula del estado completo en el punto de asignación y se guarda. |
| 4 | AUGURIO | INFO | Ver la cima del mazo (`mazo[mazo.length-1]`), 3 consultas/ronda. |
| 5 | SAPO | INFO | Revelar 4 cartas al azar (semilla) de la mano de un objetivo. |
| 6 | JUDIO | ROBO | Tomar **cualquier** carta del pozo, no solo la cima. `robarDelPozo` solo hace `pozo.pop()` (`partida.ts:336-356`). Transparencia: avisar qué carta se tomó. |
| 7 | PESAO | INFO/PASIVA | Ocultar `pozoTope`/pozo al resto esa ronda (sólo el dueño lo ve). Invierte el filtro de vista (`vista.ts:137`). Anti-combo con JUDIO (§4). |
| 8 | OJO | TURNO | Al detectar que alguien va a **cerrar la mano**, saltar ese turno una vez + darle 1 carta extra de compensación. |
| 9 | GUASON | MUT-PROPIA | Reemplazar una carta **al azar** de la mano propia por un comodín de pinta elegida. |
| 10 | GINYU | MUT-AJENA | Intercambiar la mano propia con la de un jugador **aleatorio** (ventana 3 turnos). |
| 11 | CHATO | MUT-AJENA | Repartir de nuevo la mano de un objetivo (reset) + notificarle (ventana 3 turnos). |
| 12 | MATO | MUT-PROPIA | Reset de la mano propia **o** de la habilidad propia (toda la ronda). |
| 13 | TROLL | MUT-AJENA | Detectar tríos/escalas en la mano de un objetivo y resetear esas cartas + notificar (ventana 3 turnos). |
| 14 | EXODIA | VICTORIA | Ganar la ronda si te bajas dentro de los 3 primeros turnos. Sobrescribe la condición de cierre por jugador. |
| 15 | DOBLE | PUNTAJE | Al cerrar la mano, multiplicar puntos (×2 a rivales si gana; +50% propio si pierde) + anuncio público. |
| 16 | PILLO | MUT-AJENA/INFO | Adivinar una carta de un rival: acierto → intercambio elegido; fallo → el rival te roba una carta que elige. |
| 17 | TOCO | VICTORIA | Cambiar la misión propia a una combinación aleatoria de 12 cartas de dificultad equivalente. Sobrescribe `contratoActual` por jugador. |
| 18 | EXTRA | ROBO/TURNO | Robar 2 cartas en un turno; penalización = descartar 2 **o** perder el próximo turno (reusa el hook TURNO). |

Transversal a las 18: **ESTADO** de habilidades (asignación, cargas, ventanas de
validez, snapshots, flags como PESAO/DOBLE). Hoy **no existe** ninguna ranura para
esto en `EstadoPartida` (`partida.ts:89-101`).

---

## 2. Inventario de hooks — [YA EXISTE] / [HAY QUE CREAR] / [REQUIERE REFACTOR]

### Costuras que YA EXISTEN y se reusan
| Hook | Dónde | Estado |
|------|-------|--------|
| Motor autoritativo genérico (valida, transiciona, proyecta) | `MotorJuego<E,A>` en `motor.ts:41-84` | **YA EXISTE** |
| Registro de motores por game-id | `registroMotores.ts:35-45` (añadir una entrada) | **YA EXISTE** |
| Punto de inicio de ronda (asignación) | `motor.crear` (mano 1) y `motor.continuar` (`motorCarioca.ts:104,210`) | **YA EXISTE** |
| Sobre opaco para acciones de habilidad | `AccionJuego` (`protocolo.ts:16-19,155-159`) + `parsearAccion` (`motor.ts:49`) | **YA EXISTE** |
| Proyección de vista por jugador (info oculta) | `construirVista(estado, jugadorId, meta)` (`vista.ts:88`) | **YA EXISTE** (base; hay que extender payload) |
| Difusión de estado de sala a todos, agnóstica de transporte | `Orquestador.difundirEstadoSala` (`orquestador.ts:590-598`) sobre `TransporteServidor` (LAN y WebRTC idénticos) | **YA EXISTE** |
| Aleatoriedad determinista con semilla | `crearGeneradorSemilla` / `barajar` (`aleatorio.ts:9-32`) | **YA EXISTE** (para muestreo §7.5 y sesgos) |
| Detección de tríos/escalas | `combinaciones.ts` (`validarContrato`, `extenderEscala`) — usada por TROLL | **YA EXISTE** |
| Skip de turno (mecánica) | `motor.saltarTurno` + `pasarTurno` (`motorCarioca.ts:168`, `partida.ts:578`) | **YA EXISTE** (reusable por OJO/EXTRA, ver refactor de disparo) |

### Hooks que HAY QUE CREAR (aditivos, sin tocar reglas base de Carioca)
| Hook | Habilidades | Notas |
|------|-------------|-------|
| **Estado de habilidades** (slice nuevo: asignaciones, cargas, ventanas, snapshots, flags) | Todas | Vive en el estado del `MotorRumble` (envoltura de `EstadoPartida`), no en `carioca-core`. |
| **Muestreo ponderado por tier + anti-combo + colisión/repetición** | §5, §4, §6.6 | Lógica pura nueva, determinista bajo semilla. Candidata a `rumble-core`. |
| **Extensión de vista** (revelaciones recortadas + estado de habilidad propio + ocultar pozo) | MISH, RADAR, AUGURIO, SAPO, PESAO | Nuevos campos en la vista (ver §3.a). El host TIENE el estado completo → las revelaciones se calculan ahí. |
| **Canal de notificación de disrupción** (aviso al afectado) | CHATO, GINYU, TROLL, OJO, JUDIO, PILLO | Campo de evento/log en la vista del afectado (transparencia §2.3/§4). |
| **Acciones de habilidad** (parseo de forma) | JUDIO, SAPO, GUASON, PILLO, MISH, AUGURIO, MATO, DECRETALO, EXTRA… | Se parsean en `MotorRumble.parsearAccion`; NO tocan `protocolo.ts`. |
| **Contrato de configuración de partida + propagación en lobby + congelado** | Panel §6 | Ver §4 (preguntas g–i). |
| **Post-proceso de puntaje al cerrar mano** | DOBLE | El `MotorRumble` puede ajustar `puntosAcumulados` sobre el estado ya cerrado sin tocar `cerrarMano` del core (aritmética). Si se quiere en el core, sería refactor. |

### Hooks que REQUIEREN REFACTOR (aditivo) de `carioca-core`
> Todas son **ampliaciones aditivas** (nuevas funciones/costuras puras); ninguna
> cambia una regla existente de Carioca. Se hacen en `carioca-core` porque las
> reglas del juego viven SOLO ahí (CLAUDE.md, "Qué NO hacer").

| Hook | Habilidades | Por qué es refactor |
|------|-------------|---------------------|
| **Sesgar el robo del mazo** | DECRETALO | `robarDelMazo` no recibe RNG ni permite influir qué carta sale (`partida.ts:307-334`). Hace falta una costura (p. ej. reordenar el mazo bajo peso, o un robo parametrizado). |
| **Tomar carta arbitraria del pozo** | JUDIO | `robarDelPozo` solo saca la cima (`partida.ts:336-356`). Nueva función pura que valide y extraiga por id. |
| **Mutar mano ajena de forma segura** (reset / swap / transferir carta) | GINYU, CHATO, TROLL, PILLO | El core solo muta vía `conManoActualizada(unSoloId)` (`partida.ts:282-288`); no hay operación entre jugadores. Nuevas transiciones puras (rebarajar una mano, intercambiar dos manos, transferir carta) manteniendo invariantes de mazo. |
| **Reemplazar carta propia / robar dos** | GUASON, MATO, EXTRA | No existe "reemplazar por comodín", "rebarajar mi mano", ni "robar 2". Nuevas funciones puras. |
| **Condición de victoria/misión por jugador** | EXODIA, TOCO | `cerrarMano` se dispara SOLO con `manoRestante.length === 0` (`partida.ts:291-305, 420, 512, 554`) y la misión es un único `contratoActual(estado)` global por mano (`partida.ts:377, 458`). No hay override por jugador. Refactor: `cerrarMano`/`validarContrato` deben aceptar una condición/misión por jugador. |
| **Disparo de skip de turno por evento de juego** | OJO, EXTRA (perder turno) | La mecánica de saltar existe, pero se dispara solo por ausencia (`orquestador.ts:476-499`). OJO necesita además detectar "alguien va a cerrar la mano", que hoy no es un evento observable. |
| **Multiplicador de puntaje por jugador** (si se hace en el core) | DOBLE | Opcional: `cerrarMano` calcula puntos fijos (`partida.ts:291-305`). Alternativa sin refactor: ajustarlo en el wrapper (ver arriba). |

---

## 3. Modelo de autoridad y arquitectura (preguntas a–f)

### a. ¿Motor autoritativo con clientes como vistas delgadas, o estado replicado?
**Autoritativo en el host, clientes = vistas delgadas.** El `Orquestador` guarda el
único `estado` (`orquestador.ts:94`), aplica cada acción con el motor y emite a
**cada jugador SU vista** con `difundirVistas` → `motor.construirVista(estado,
jugadorId, meta)` (`orquestador.ts:600-627`). La info oculta ya se filtra en
`vista.ts`: manos ajenas y mazo viajan como **conteo**, del pozo solo la cima
(`vista.ts:22-24, 137, 145`). **Consecuencia para Rumble:** las revelaciones (SAPO,
RADAR, AUGURIO, MISH) se **piden al host** vía una acción y el host —que tiene el
estado completo— las calcula y las inyecta **solo en la vista del solicitante**. El
juego base ya filtra correctamente lo que no debe verse; falta añadir **campos de
revelación** a la vista (hoy `VistaPartida` no los tiene, `vista.ts:48-71`) y, para
PESAO, **invertir** el filtro del pozo por ronda.

### b. ¿Victoria por-jugador-sobrescribible o constante global?
**Constante global, hardcodeada en `carioca-core`.** La mano cierra únicamente
cuando un jugador vacía su mano (`cerrarMano` llamado desde `bajarse`/`pegar`/
`descartar` con `manoRestante.length === 0`, `partida.ts:420,512,554`), y la misión
es un solo `ContratoMano` por mano para todos (`contratoActual`, `partida.ts:244`).
**No es sobrescribible por jugador.** EXODIA (ganar al bajarse en 3 turnos) y TOCO
(misión alterna de 12 cartas) **REQUIEREN REFACTOR** de `cerrarMano`/`validarContrato`
para aceptar condición/misión por jugador.

### c. ¿El orquestador expone un punto para interceptar/saltar turnos?
**Parcialmente.** Existe la mecánica (`motor.saltarTurno` + `jugadorEnTurno`,
`motorCarioca.ts:164-170`), pero el orquestador solo la **dispara por ausencia/
gracia** (`saltarTurnosAusentes`, `orquestador.ts:476-499`). No hay un hook para
"saltar por habilidad", ni un evento "alguien va a cerrar la mano" que OJO necesita.
El avance de turno normal vive dentro del core (`descartar`/`pasarTurno`). → Para
OJO hay que **crear** el disparo y la detección (refactor). La mecánica de EXTRA
"pierde el próximo turno" reusa este mismo hook.

### d. ¿Se puede mutar la mano de otro jugador autoritativa Y notificada?
**Autoritativa: sí es posible en el host** (tiene todo el estado), **pero no hay
operación en el core** que lo haga: `conManoActualizada` toca un solo `jugadorId`
(`partida.ts:282-288`) y no existe swap/transfer/reset entre jugadores. Hay que
**crear esas transiciones** (refactor aditivo del core). **Notificación: casi
gratis** — como cada jugador recibe su propia vista tras cada cambio, el afectado
verá su mano nueva en el siguiente snapshot; falta un **campo de aviso/evento** en
la vista para la transparencia explícita (§2.3/§4). Aplica a CHATO, GINYU, TROLL, PILLO.

### e. ¿Existe un punto de extensión tipo "modificador" sobre un IJuego?
**No.** Hay el puerto `MotorJuego` y el `registroMotores`, pero **ningún decorador/
capa de modificador**. Rumble se diseña **desde cero** como un **motor que envuelve**
`crearMotorCarioca()` (patrón decorador sobre el mismo puerto): delega las acciones
base al motor interno y añade estado + acciones de habilidad. Se registra como una
entrada nueva en `registroMotores.ts` (game-id `"carioca-rumble"` o `carioca` con
config que active Rumble — **decisión abierta**, ver §6).

### f. ¿Dónde vive el ciclo de ronda donde inyectar la asignación?
**En el motor**, no en el orquestador. El inicio de la mano 1 es `motor.crear`
(`motorCarioca.ts:104`) y el de cada mano siguiente es `motor.continuar`
(`motorCarioca.ts:210`, llamado por `orquestador.avanzarRondaSiCorresponde`,
`orquestador.ts:446`). `MotorRumble.crear/continuar` envuelven a los de Carioca y,
tras obtener el nuevo `EstadoPartida`, ejecutan el **ciclo §7**: muestrear del pool
ponderado, resetear cargas/ventanas, validar anti-combo, tomar snapshots (RADAR).
La aleatoriedad determinista ya está disponible (`aleatorio.ts`).

---

## 4. Estado de sala y punto de inyección de la config (preguntas g–i)

### g. ¿Dónde vive el estado de sala/lobby y cómo se propaga por ambos transportes?
**Servidor (autoridad):** el lobby es `Orquestador.asientos` + `faseSala === "lobby"`
(`orquestador.ts:45-62, 90-96`). Se difunde con `difundirEstadoSala` →
mensaje `estadoSala { jugadores }` (`orquestador.ts:590-598`, `protocolo.ts:80`).
**Cliente:** lo pinta `PantallaConexion.mostrarSala(jugadores, codigo)`, cableado en
`coordinador.ts:323-326`.
**Ambos transportes son transparentes:** el orquestador solo conoce la interfaz
`TransporteServidor` y emite el mismo `MensajeServidor` serializado; LAN (`ws`) y
online (WebRTC) lo entregan **idéntico**. → **El objeto de config se inyecta
añadiéndolo a `estadoSala`** (o un mensaje `configSala` nuevo) que el host edita en
el lobby; viaja gratis por ambos caminos, sin trabajo por transporte.

### h. ¿Existe hoy "opciones de partida configurables por juego"?
**No, salvo un único booleano.** Lo más parecido es `turbo` en `iniciarPartida`
(`protocolo.ts:33`, `coordinador.ts:125-130`): lo decide el anfitrión al arrancar,
**no se sincroniza en el lobby** ni es un esquema por juego. Una búsqueda de
`config`/`opciones` en `packages/server/src` no arroja ningún contrato de partida.
→ **El contrato de config se crea desde cero.** Para no romper la genericidad del
orquestador, debe llevar la config como **blob opaco** (el orquestador la guarda y
retransmite; el `MotorRumble` la valida/consume, igual que hace con `AccionJuego`).

### i. ¿Se congela al iniciar y cómo se garantiza la misma config para todos?
**Garantía por autoridad única.** Flujo propuesto:
1. El host edita la config en el panel del lobby (§6). Solo el anfitrión (asiento 0)
   puede; se manda un mensaje host-only `actualizarConfig` (análogo al guard de
   `reabrirConexion`/`iniciarPartida`, `orquestador.ts:328-331, 359-363`).
2. El orquestador guarda la **copia autoritativa** y la **redifunde a todos** por
   `estadoSala`/`configSala`. Como el servidor es la única fuente, todos ven la
   MISMA config en vivo (no la ediciones locales de nadie más).
3. Al `iniciarPartida`, la config se **pasa a `MotorRumble.crear`** y queda
   **embebida en el estado** → inmutable durante la partida.

**Refactor necesario para el congelado:** `motor.crear(jugadores, rng)` no recibe
config (`motor.ts:43`). Hay que **ampliar el puerto** `MotorJuego` con un parámetro
de config opaco (o un método `configurar/validarConfig`), y propagarlo en
`iniciarPartida` (`protocolo.ts:33`, `orquestador.ts:350-379`). Es aditivo: los
motores que no la usan (Mentiroso, UNO) la ignoran. La **validación cruzada §6**
(pool no vacío, `nº jugadores × §6.1 ≤` activas para "únicas por ronda") vive en el
core de Rumble y debe correr **antes de permitir "Iniciar"** (cliente, cortesía) y
**revalidarse en el host** (autoridad) al recibir `iniciarPartida`.

**Panel (UI):** vive en `PantallaConexion` (donde ya está la sala y el botón
Iniciar); es la extensión natural. La ficha del hub (`HUB.md`, `FichaCatalogo`) es
solo presentación y **no** modela config: no es el lugar del panel.

---

## 5. Recomendación de división en sesiones

- **Sesión 0 — este spike** (auditoría). ✔
- **Sesión 1 — `carioca-core`: refactors aditivos + `rumble-core` puro.**
  - En `carioca-core` (aditivo, sin cambiar reglas): costura de robo sesgado,
    robo de carta arbitraria del pozo, swap/reset/transferencia de manos,
    reemplazo/rebaraja de mano propia, robo doble, y condición de victoria/misión
    **por jugador**. Cada una con tests puros.
  - Nuevo paquete `rumble-core` (o módulo): pool + **muestreo ponderado §5**,
    **anti-combo §4**, colisión/repetición §6.6, cargas/ventanas, snapshots,
    todo **determinista bajo semilla** y testeado (distribución §5).
- **Sesión 2 — servidor: `MotorRumble` + vista + config-threading.**
  - `MotorRumble` decorando `crearMotorCarioca` (nuevo estado, acciones de
    habilidad en `parsearAccion`/`aplicarAccion`, asignación en `crear`/`continuar`).
  - Extensión de vista (revelaciones recortadas, estado de habilidad propio,
    ocultar pozo PESAO, eventos de disrupción) — nueva forma en `vistaJuego.ts`.
  - Entrada en `registroMotores.ts`; ampliar puerto `MotorJuego` + `iniciarPartida`
    para la config opaca; post-proceso de puntaje DOBLE.
- **Sesión 3 — cliente: panel de config + propagación en lobby.**
  - Panel en `PantallaConexion`; mensaje host-only `actualizarConfig` + difusión por
    `estadoSala`/`configSala`; validación cruzada §6 (cliente cortesía + host
    autoridad). Ficha del hub para el modo (id nuevo o toggle).
- **Sesión 4 — presentación de habilidades + calibración.**
  - HUD para activar habilidades y ver revelaciones/anuncio DOBLE; métrica de
    "dificultad equivalente" de TOCO; defaults por playtesting (EXTRA, pesos).

---

## 6. Riesgos y decisiones abiertas

**Decisiones abiertas de REGLAS_RUMBLE.md §8 (NO resueltas aquí, por restricción):**
- Penalización por defecto de EXTRA (§7/§8.1).
- Pesos numéricos exactos del preset *Equilibrado* (§5/§8.2).
- Métrica de "dificultad equivalente" de TOCO (§8.3) — **bloquea la Sesión 2**.
- (§8.4 resuelto por este spike: **host autoritativo**, revelaciones calculadas en
  el host; §8.5 resuelto: la victoria **NO** es sobrescribible hoy → REQUIERE REFACTOR.)

**Decisiones abiertas NUEVAS que surgen del código (no están en REGLAS_RUMBLE.md):**
1. **Semántica de "primeros 3 turnos"** (GINYU/CHATO/MATO/TROLL/EXODIA): ¿es el
   contador global `turno.numero ≤ 3` (`partida.ts:85-87`, se reinicia por mano) o
   los 3 primeros turnos **propios** de cada jugador? Cambia radicalmente la ventana.
   No está definido → **decisión de reglas** (editar REGLAS_RUMBLE.md primero).
2. **Identidad del modo:** ¿game-id nuevo `"carioca-rumble"` (ficha aparte en el hub)
   o `"carioca"` con un flag de config que active Rumble? Afecta `registroMotores.ts`,
   catálogo del cliente y el `env JUEGO` del sidecar (`coordinador.ts:250`).
3. **DOBLE — dónde vive el multiplicador:** post-proceso en el wrapper (sin tocar
   core) vs. refactor de `cerrarMano`. Recomendado: wrapper, salvo que se quiera la
   regla en el core por consistencia.
4. **Notificación de disrupción:** forma del canal de eventos en la vista (log
   efímero por jugador vs. campo persistente) para CHATO/GINYU/TROLL/OJO/JUDIO/PILLO.

**Riesgos técnicos:**
- **Refactor de la condición de victoria** (`cerrarMano`/`validarContrato`) toca el
  corazón de Carioca; aunque aditivo, exige tests de no-regresión de las 9 manos.
- **Interacción OJO ↔ +Turbo ↔ salto por ausencia:** tres fuentes que alteran el
  turno (`orquestador.ts` reloj turbo + saltarTurnosAusentes + hook OJO nuevo)
  pueden pisarse. Diseñar el orden de precedencia explícitamente.
- **Reconexión:** el estado de habilidades DEBE vivir dentro del `estado` del
  orquestador para sobrevivir a la reconexión por token (`orquestador.ts:282-311`);
  si se guardara aparte, se perdería al reattachar. (Encaja bien: es parte del
  estado del `MotorRumble`.)
- **Ampliar el puerto `MotorJuego` con config** impacta a los 3 motores (Carioca,
  Mentiroso, UNO); debe ser opcional para no obligar a los otros a cambiar.
- **Vista más pesada:** revelaciones + estado de habilidad aumentan el payload por
  jugador; cuidar que PESAO/SAPO no filtren de más al recalcular el diff en el
  cliente (`estado/difVista.ts`).
- **Volumen de acciones nuevas** (~10 acciones de habilidad) sobre el sobre opaco:
  ventaja (no toca protocolo) pero exige validación de forma estricta en
  `MotorRumble.parsearAccion` para no romper el invariante "no confiar en el cliente".

---

## 7. Deuda abierta tras la Sesión 4 (HUD)

La S4 cableó la presentación de las habilidades. Al hacerlo quedó a la vista lo que
el MOTOR todavía no hace. Nada de esto lo arregla el HUD.

### 7.1 TOCO y EXODIA no están cableadas al motor — **resuelto en S5**

El refactor aditivo de la condición de victoria ya estaba hecho en S1
(`bajarseConContrato`, `cerrarManoManual`); lo que faltaba era que el motor las
INVOCARA. Ahora hay un único punto de enganche, `aplicarBajarse` en
`motorRumble.ts`, al que `aplicarBase` desvía la acción `bajarse`:

- **TOCO**: si el actor la tiene asignada, el bajarse se valida con
  `bajarseConContrato(base, id, propuesta, slice.misionToco[id])` en vez del
  contrato de la mano, y cumplir la misión **cierra la mano a su favor**
  (`cerrarManoManual`) — condición de victoria sobrescrita (§3.3).
- **EXODIA**: tras un bajarse exitoso dentro de la ventana global
  (`ventanaVigente(EXODIA, base.turno.numero)`, o sea turno ≤ 3, §3.2 B1) se
  llama `cerrarManoManual`: gana aunque le queden cartas y puntúa 0.

El cierre forzado ocurre **antes** de `postProceso`, así OJO puede interceptarlo y
DOBLE ajustar el puntaje igual que en cualquier otro cierre. Para quien no tiene
ninguna de las dos, `aplicarBajarse` es `interno.aplicarAccion` + `postProceso`
con el slice intacto: la ruta base queda idéntica (no-regresión de las 9 manos
verde, más dos tests explícitos en `motorRumble.test.ts`).

Corolario de presentación: la misión de TOCO se proyecta también como
`vista.contrato` de su dueño (`vistaRumble.ts`). Sin eso el panel de bajada del
cliente ofrecería los tipos del contrato global y su validación de cortesía nunca
dejaría confirmar la misión — TOCO era injugable desde la UI. La autoridad no
cambia: el motor revalida contra esa misma misión.

### 7.2 PILLO: el robo a ciegas iba por id de carta — **resuelto en S4**

`rumble/pilloRobo` pedía un `cartaId` de la mano de la víctima, que el cliente
**nunca puede conocer**: los ids codifican la carta (`${pinta}-${valor}-${copia}`),
así que enviarlos filtraría la mano entera. La acción era literalmente
inconstruible por un cliente honesto.

Resuelto pasando a **índice posicional**: la vista proyecta
`pilloPendiente: {victimaId, numeroCartas}` **solo al objetivo** (revelación
dirigida, como SAPO) y la acción es `rumble/pilloRobo{indice}`; el motor resuelve
índice → carta del lado autoritativo. Regla general que conviene recordar: **un id
de carta jamás puede viajar como identificador de algo que el jugador no ve.**

### 7.3 Cosmético

`TipoEventoRumble` declara `"compensacion"` y **nunca se emite**: OJO usa `"skip"`
con el texto de compensación (`motorRumble.ts:307`). O se emite, o se quita del tipo.

---

## Criterio de hecho (autoverificación)
- ✔ Seis secciones presentes.
- ✔ Las 18 habilidades mapeadas a un hook y clasificadas (existe/crear/refactor) en §1–§2.
- ✔ Preguntas a–i respondidas con rutas de código reales en §3–§4.
- ✔ Estado de sala localizado (`Orquestador.asientos` + `difundirEstadoSala`; cliente
  `PantallaConexion`) y punto de inyección de config identificado (`estadoSala` +
  `iniciarPartida` → `MotorRumble.crear`).
