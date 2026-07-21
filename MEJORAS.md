# MEJORAS.md — Iteración post-Fase 5

> **Cómo usar.** Cada mejora es **una sesión** de Claude Code: `/clear` → Plan Mode → pega el
> PROMPT → aprueba el plan → implementa → verifica → commit → `/clear`.
> Son independientes entre sí; puedes correrlas en cualquier orden.
> Docs de apoyo que el agente lee: `PLAN.md`, `REGLAS_CARIOCA.md`, `CLAUDE.md`.

---

# MEJORA 1 — Reglas: jugadores ilimitados + mazos escalables  `[CLAUDE CODE]`

**Toca:** REGLAS_CARIOCA.md, carioca-core (con tests), orquestador/servidor y el lobby del cliente.

**PROMPT:**
```text
<rol>
Eres un ingeniero de TypeScript experto en motores de juegos de cartas y diseño guiado por tests.
</rol>

<contexto>
Lee CLAUDE.md, PLAN.md y REGLAS_CARIOCA.md. Hoy el juego asume pocos jugadores y 2 mazos fijos.
Hay que permitir jugadores ilimitados, escalando la cantidad de mazos.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Regla nueva de mazos según número de jugadores:
   mazos = 2 × máx(1, piso(jugadores / 4))
   Tabla de referencia:
     2 jugadores -> 2 mazos
     4 jugadores -> 2 mazos
     6 jugadores -> 2 mazos
     8 jugadores -> 4 mazos
     12 jugadores -> 6 mazos
     16 jugadores -> 8 mazos
   Los comodines escalan igual: 4 comodines por cada par de mazos (2 por mazo).
2. Actualiza REGLAS_CARIOCA.md (sección de materiales y la sección 9 de datos) con esta regla.
3. En carioca-core: construir el mazo y repartir en función del número de jugadores; sin tope
   superior de jugadores.
4. En el orquestador/servidor: aceptar N jugadores (sin límite fijo de 4).
5. En el cliente: el lobby debe permitir que se unan más de 4 jugadores.
</instrucciones>

<restricciones>
- La regla de mazos vive como dato/config en carioca-core, no hardcodeada en varios lugares.
- No cambies otras reglas del juego.
</restricciones>

<criterio_de_hecho>
Tests en carioca-core que verifiquen la cantidad de mazos para 2, 4, 6, 8, 12 y 16 jugadores,
y un reparto válido en cada caso. Tests en verde.
</criterio_de_hecho>

<cierre>
Commit: "feat(core): jugadores ilimitados con mazos escalables".
</cierre>
```

---

# MEJORA 2 — Perfil: nickname + avatar, y su presencia en partida  `[CLAUDE CODE]`

**Toca:** cliente (perfil, persistencia, paso a la partida, presencia en turno).

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend que diseña perfiles de usuario y representación de identidad en
juegos, generando los recursos visuales por código (sin assets externos).
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. La app es de escritorio (Tauri).
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Apartado de Perfil donde el usuario define:
   - un nickname (id),
   - una foto de perfil elegida desde un POOL POR DEFECTO que debes crear.
2. Crea ese pool de avatares por defecto generados por código (estilo identicon o íconos
   simples en SVG/canvas), variados y reconocibles. Nada de imágenes externas.
3. Persiste el perfil localmente (almacenamiento de Tauri o un archivo local), de modo que
   se recuerde entre sesiones.
4. El nickname y el avatar del perfil son los que se usan en las partidas.
5. Dentro del juego, dale MÁS PRESENCIA a la identidad del jugador EN TURNO: muestra de forma
   destacada su avatar y nickname (por ejemplo un banner/indicador claro de "turno de X"),
   además de mostrar avatar+nickname de cada jugador en la mesa.
</instrucciones>

<restricciones>
- Avatares generados por código; sin assets externos.
- El nickname/avatar viajan con el jugador a través de la capa de red existente; no rehagas la red.
</restricciones>

<criterio_de_hecho>
Se puede crear un perfil (nickname + avatar del pool), persiste al reabrir la app, aparece en
la partida, y durante el juego se ve con claridad de quién es el turno con su avatar y nombre.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): perfil con nickname y avatar + presencia de turno".
</cierre>
```

---

# MEJORA 3 — Drag and drop de cartas  `[CLAUDE CODE]`

**Toca:** cliente (interacción y render). Es la mejora más visual; su verificación es por playtest.

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend gráfico experto en Three.js, eventos de puntero, raycasting y
animación de interacción tipo drag-and-drop.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. Las acciones (descartar, bajarse, pegar)
ya existen como intenciones que viajan al orquestador; el drag-and-drop es solo una nueva forma
de DISPARAR esas intenciones, no las reemplaza ni salta la autoridad del servidor.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Las cartas se pueden agarrar y mover con el mouse (drag-and-drop) usando eventos de puntero
   + raycasting; la carta sigue al cursor mientras se arrastra y vuelve/encaja al soltar.
2. La mano del jugador se renderiza MONTADA de izquierda a derecha (cada carta solapando
   parcialmente a la anterior, tipo abanico).
3. Las cartas de la mano se pueden REORGANIZAR: arrastrar una carta a otra posición la reordena.
4. Al iniciar un arrastre, la mano se DESMONTA: las cartas se separan y quedan una al lado de
   la otra (sin solapamiento) para facilitar el drag-and-drop; al soltar, la mano vuelve a
   montarse.
5. Extiende el drag-and-drop a las demás acciones: arrastrar al pozo = descartar; arrastrar a
   la zona de mesa = bajarse; arrastrar sobre una combinación existente = pegar. Cada gesto
   emite la intención correspondiente al orquestador.
</instrucciones>

<ejemplos>
<!-- Estados de la mano -->
EN REPOSO:    cartas montadas, solapadas de izquierda a derecha (abanico).
ARRASTRANDO:  la mano se desmonta; todas las cartas separadas, lado a lado.
AL SOLTAR:    si no fue acción válida, la carta vuelve; la mano se re-monta.

<!-- El drag dispara intenciones, no salta la autoridad -->
CORRECTO:   soltar carta en el pozo -> emite intención "descartar" al orquestador.
INCORRECTO: el cliente mueve la carta al pozo y modifica el estado por su cuenta.
</ejemplos>

<restricciones>
- El estado del orquestador es la verdad; el drag-and-drop solo emite intenciones y anima.
- Si una acción es inválida, la carta regresa a su lugar (no se aplica nada).
- Visuales por código; sin assets externos.
</restricciones>

<criterio_de_hecho>
En playtest: puedo agarrar y mover cartas, reorganizar mi mano (que está montada y se desmonta
al arrastrar), y descartar/bajarme/pegar arrastrando. Las acciones inválidas devuelven la carta.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): interacción de cartas con drag-and-drop".
</cierre>
```

---

# MEJORA 4 — Empaquetado: metadatos de Sidios  `[CLAUDE CODE]`

**Toca:** configuración de Tauri. Rápida.

**PROMPT:**
```text
<rol>
Eres un ingeniero experto en configuración de empaquetado con Tauri.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en la configuración de Tauri de packages/client.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Actualiza los metadatos del empaquetado:
1. Editor / publisher: "Sidios".
2. Identificador del bundle (reverse-domain) basado en sidios.cl: usa "cl.sidios.<nombre-app>".
3. Homepage / dirección: "https://sidios.cl".
4. Copyright: "© Sidios".
5. Refleja estos datos en la config de Tauri y, si corresponde, en CLAUDE.md.
</instrucciones>

<restricciones>
- Solo metadatos de empaquetado; no toques lógica de juego ni red.
</restricciones>

<criterio_de_hecho>
El build muestra a Sidios como editor, el identificador es cl.sidios.<nombre-app> y la homepage
apunta a sidios.cl.
</criterio_de_hecho>

<cierre>
Commit: "chore(client): metadatos de empaquetado de Sidios".
</cierre>
```

---

# MEJORA 5 — Detalle de cartas al pasar el mouse (hover)  `[CLAUDE CODE]`

**Toca:** cliente (render/UI). Verificación por playtest.

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend gráfico experto en Three.js, raycasting de hover y etiquetas/tooltips.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. La mano propia se renderiza montada
(cartas solapadas), por lo que el hover ayuda a identificar cartas parcialmente tapadas.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Al pasar el mouse sobre una combinación bajada en la mesa, muestra el detalle de TODAS sus
   cartas en orden. Ej: A♠-2♠-3♠-4♠-5♠
2. Al pasar el mouse sobre una carta de tu propia mano, muestra el detalle de esa carta.
   Ej: 1♦, J♥, 5♣
</instrucciones>

<ejemplos>
HOVER sobre meld en mesa:  A♠-2♠-3♠-4♠-5♠
HOVER sobre carta en mano: J♥
</ejemplos>

<restricciones>
- Solo visualización; el hover no cambia el estado ni emite intenciones.
</restricciones>

<criterio_de_hecho>
En playtest: el hover sobre un bajado lista sus cartas; el hover sobre una carta de la mano
muestra su valor y pinta correctos.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): detalle de cartas al hover".
</cierre>
```

---

# MEJORA 6 — Modal de bajar: ocultar de la mano las cartas en juego (opcional, con botón)  `[CLAUDE CODE]`

**Toca:** cliente (modal de bajar + vista de la mano). Función activable/desactivable por el usuario.

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend que diseña flujos de staging (preparar una acción antes de confirmarla)
manteniendo coherente la vista.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. Existe un modal de bajar donde el jugador
arma las combinaciones antes de confirmar.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Agrega en el modal de bajar un BOTÓN que activa/desactiva esta función. Por defecto está
   desactivada; al pulsarlo se activa, y al volver a pulsarlo se desactiva (toggle).
2. Con la función ACTIVADA: las cartas que el jugador coloca para bajar dejan de aparecer en su
   mano mientras estén en el modal. Ej: si cargo un trío de K al modal, esas 3 K ya no se ven en
   la mano hasta que se quiten del modal.
3. Con la función DESACTIVADA: las cartas cargadas siguen visibles en la mano (comportamiento normal).
4. Al quitar una carta del modal, vuelve a aparecer en la mano (cuando la función estaba ocultándola).
5. Es solo staging visual: el estado autoritativo no cambia hasta confirmar "bajar"; cancelar
   devuelve todas las cartas a la mano. El estado del toggle puede recordarse entre partidas.
</instrucciones>

<restricciones>
- No mutar el estado del orquestador hasta confirmar la acción; confirmar emite la intención normal.
- La sincronización mano/modal y el toggle son locales; no rehagas la red.
</restricciones>

<criterio_de_hecho>
En playtest: con la función activada, cargar una combinación al modal la oculta de la mano y
quitarla la devuelve; con la función desactivada, las cartas cargadas siguen viéndose en la mano;
el botón alterna entre ambos modos; confirmar baja envía la intención; cancelar restaura la mano.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): toggle opcional para ocultar de la mano las cartas del modal de bajar".
</cierre>
```

---

# MEJORA 7 — Mesa: perfiles fuera, sin manos ajenas, mesa que crece  `[CLAUDE CODE]`

**Toca:** cliente (render/layout). Incluye revisión del bug de solapamiento.

**PROMPT:**
```text
<rol>
Eres un ingeniero de frontend gráfico experto en Three.js y en diseño de layout de mesa de juego
que escala con el número de participantes.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. Usa los perfiles (avatar + nickname) de la
mejora de perfil. El juego ya soporta jugadores escalables en múltiplos de 4.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Deja de renderizar las manos de los demás jugadores sobre la mesa (los montones de cartas
   boca abajo). En su lugar, representa a cada jugador por su PERFIL (avatar + nickname) ubicado
   FUERA de la mesa, alrededor del borde.
2. Las combinaciones bajadas (públicas) SIGUEN visibles e interactuables en la mesa, porque se
   necesitan para pegar.
3. La mesa CRECE cuando hay más jugadores (al aumentar en múltiplos de 4), de modo que todo
   quepa sin amontonarse.
4. Revisa que, una vez quitadas las manos ajenas, ningún otro objeto de la mesa (bajados, pozo,
   mazo, etc.) se solape o pelee en profundidad (z-fighting). Corrige los que queden mal.
</instrucciones>

<restricciones>
- Solo render/layout; no cambies la lógica de juego ni la red.
- Los bajados deben quedar accesibles para la acción de pegar.
</restricciones>

<criterio_de_hecho>
En playtest con 2, 4 y 8 jugadores: no aparecen manos ajenas en la mesa; cada oponente se ve
como perfil fuera de la mesa; la mesa crece con más jugadores; no hay objetos solapados.
</criterio_de_hecho>

<cierre>
Commit: "feat(client): mesa con perfiles externos, escalable y sin solapamientos".
</cierre>
```

---

# MEJORA 8 — Conectividad: desconexión, reconexión y suspensión  `[CLAUDE CODE]`

**Toca:** orquestador/servidor + transporte + cliente. Es la más grande; el agente puede
proponer partirla en Plan Mode.

> Nota: esta mejora define la SEMÁNTICA de desconexión (gracia de 10s, salto de turno, suspensión)
> y el reattach por perfil. La ROBUSTEZ de la conexión (heartbeat, reconexión automática, resync,
> anti-throttling) y la consolidación del flujo se hacen en la **Mejora 11**. El botón "Reconectar"
> del jugador se conserva como respaldo (no es solo del anfitrión).

**PROMPT:**
```text
<rol>
Eres un ingeniero de backend experto en el ciclo de vida de conexiones en juegos en tiempo real:
estados de jugador, reconexión a un asiento existente y tolerancia a desconexiones.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. La autoridad vive en el orquestador. Problema observado: al reconectar,
a veces no se permite volver a entrar. Causa probable: se crea un asiento nuevo en lugar de
reusar el del jugador. La reconexión debe REATTACHAR al mismo asiento y mano por identidad de
perfil.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Modela el estado de conexión de cada jugador en el orquestador: Conectado, Ausente (ventana
   de gracia) y Suspendido.
2. Al desconectarse un jugador, dale 10 segundos de gracia para volver. Si en ese tiempo es su
   turno y sigue ausente, se SALTA ese turno automáticamente.
3. Tras 2 turnos saltados, el jugador queda SUSPENDIDO: se le salta automáticamente en cada turno
   hasta que se reconecte. Al reconectarse, vuelve a estar activo y recupera su mano y asiento.
4. Botón "Reconectar" en el cliente: reinicia el intento de reconexión con el anfitrión.
5. El anfitrión puede REINICIAR MANUALMENTE la conexión de un jugador puntual (para los casos en
   que la reconexión automática no lo deja volver). Esto NO es expulsarlo: el jugador conserva su
   asiento, mano y estado; solo se reabre su canal para que pueda volver a entrar.
6. Si saltar un turno requiere una operación en carioca-core (p. ej. "pasar turno"), agrégala de
   forma mínima SIN alterar las reglas de combinaciones ni el puntaje.
</instrucciones>

<ejemplos>
Jugador se desconecta -> Ausente (10s).
  vuelve dentro de 10s            -> Conectado (sin penalización).
  no vuelve y le toca turno       -> se salta ese turno.
2 turnos saltados                 -> Suspendido (se salta siempre).
Suspendido se reconecta           -> Conectado; recupera asiento y mano.
Anfitrión "reinicia conexión X"   -> reabre el canal de X; X conserva su estado (NO es expulsión).
</ejemplos>

<restricciones>
- NUNCA expulsar jugadores; expulsar no debe ocurrir en ningún caso.
- La reconexión reattacha al asiento y mano existentes por identidad de perfil; no crea uno nuevo.
- La lógica de estados vive en el orquestador (autoridad), no en el cliente.
- No alteres las reglas del juego.
</restricciones>

<criterio_de_hecho>
En prueba: desconectar a un jugador respeta los 10s de gracia; pasados, se salta su turno; tras
2 saltos queda suspendido; al reconectar recupera asiento y mano. El botón "Reconectar" funciona.
El anfitrión puede reabrir la conexión de un jugador sin que este pierda su estado. Nadie es expulsado.
</criterio_de_hecho>

<cierre>
Commit: "feat(net): desconexión con gracia, suspensión de turnos y reconexión al asiento".
</cierre>
```

---

# ✅ MEJORA 9 — Fix: montaje consistente de la mano (z-order + baseline)  (COMPLETADA)

**Toca:** cliente (render/layout de la mano). Bug resuelto: solape inconsistente y carta desalineada.
Hecha: cascada de izquierda a derecha con z-order por índice y baseline único.

<details><summary>Prompt usado (referencia)</summary>

```text
<rol>
Eres un ingeniero de frontend gráfico experto en Three.js y en el orden de profundidad
(z-order / renderOrder) de objetos solapados.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. La mano del jugador se monta mal: el orden
de solape es inconsistente (a veces tapa la carta de la izquierda, a veces la de la derecha) y
una carta queda más alta que el resto en vez de alineada.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
Define el montaje de la mano de forma estricta y sin ambigüedad:
1. BASELINE ÚNICO: todas las cartas a la misma altura (mismo Y). Ninguna sobresale, salvo la que
   esté en hover o seleccionada.
2. ESPACIADO CONSTANTE: de izquierda a derecha con un offset horizontal fijo entre una y otra.
3. ORDEN DE PROFUNDIDAD LIGADO AL ÍNDICE: la carta más a la izquierda va al fondo y cada carta
   hacia la derecha se dibuja ENCIMA de la anterior, de modo que la esquina (número + pinta) de
   CADA carta quede visible.
4. El z-order se deriva del índice de la carta en la mano, no del orden de creación ni de la
   cámara. Revisa renderOrder / depthTest / posición.z para que sea determinista.
</instrucciones>

<restricciones>
- Solo render/layout de la mano; no cambies lógica de juego ni red.
- Mantén compatible el "desmontar al arrastrar" (Mejora 3).
</restricciones>

<criterio_de_hecho>
En playtest con 5+ cartas: cascada limpia de izquierda a derecha, todas a la misma altura, esquina
de cada carta visible, sin cartas sobresaliendo ni solapes invertidos. Se mantiene al reordenar.
</criterio_de_hecho>

<cierre>
Commit: "fix(client): montaje consistente de la mano (z-order y baseline)".
</cierre>
```
</details>

---

# ✅ MEJORA 10 — Fix: layout de GUI sin solapamientos  (COMPLETADA)

**Toca:** cliente (HUD/overlays). Bug resuelto: perfiles/mensajes ya no se montan sobre la mano ni el texto de turno.

<details><summary>Prompt usado (referencia)</summary>

```text
<rol>
Eres un ingeniero de frontend experto en layout de HUD de juego y jerarquía de capas (z-index /
overlays) sobre una escena 3D, evitando solapamientos entre elementos de interfaz.
</rol>

<contexto>
Lee CLAUDE.md y PLAN.md. Trabaja en packages/client. Problemas: el indicador "Esperando a [jugador]"
y los perfiles flotan ENCIMA de la mano, tapándola; en la barra superior, avatares y etiqueta de
nombre se solapan con el texto de turno.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.
1. Define regiones de la GUI que NO se solapen entre sí:
   - Mano de cartas: zona inferior reservada; ningún elemento de GUI la invade.
   - Barra superior (HUD): info de mano/contrato, estado de turno, avatares y controles.
   - Mensajes transitorios ("Esperando a X…", avisos): su propia zona, NUNCA sobre la mano.
2. En la barra superior, distribuye en horizontal sin colisión: las etiquetas de nombre no pisan
   el texto de turno ni a otros avatares (dales espacio o muéstralas como tooltip que no tape texto).
3. "Esperando a [jugador]" se ubica fuera del área de la mano (en el HUD o más arriba), sin tapar cartas.
4. Los perfiles alrededor de la mesa (Mejora 7) no se solapan con la mano ni con los mensajes.
</instrucciones>

<restricciones>
- Solo GUI/layout; no cambies lógica de juego ni red.
- La visibilidad de los botones de reconexión la define la Mejora 11; aquí no la toques.
</restricciones>

<criterio_de_hecho>
En playtest: ningún elemento de GUI se solapa con la mano ni entre sí (avatares, nombres, estado de
turno y mensajes quedan separados y legibles); "Esperando a X" no tapa cartas.
</criterio_de_hecho>

<cierre>
Commit: "fix(client): layout de GUI sin solapamientos".
</cierre>
```
</details>

---

# MEJORA 11 — Fix: estabilidad de conexión LAN + reconexión consolidada  `[CLAUDE CODE]`

**Toca:** orquestador/servidor + transporte + cliente. Consolida la reconexión, que estaba dispersa.

**PROMPT:**
```text
<rol>
Eres un ingeniero de red experto en robustez de WebSocket en tiempo real: heartbeats, detección de
sockets muertos, reconexión automática, reattach a un asiento existente y resincronización de estado.
</rol>

<contexto>
Lee CLAUDE.md, PLAN.md y MEJORAS.md. Síntomas en LAN: la conexión a veces se queda "pegada" (parece
viva pero no responde) y el usuario debe reiniciarla; y "Reconectar no funciona". La lógica de
reconexión quedó dispersa entre la Mejora 8 (semántica de desconexión + reattach) y fixes posteriores.
En LAN la red no es el cuello de botella: el problema está en el ciclo de vida del WebSocket. El
servidor va embebido en la app del anfitrión.
</contexto>

<instrucciones>
Antes de implementar, propón un plan y espera mi aprobación.

DIAGNÓSTICO primero (con logging de conexión: latidos, caídas, intentos, latencia):
1. ¿Se dispara el intento de reconexión (automático al detectar socket muerto)?
2. ¿El socket nuevo alcanza al anfitrión (dirección/puerto LAN correctos)?
3. ¿El orquestador ACEPTA la vuelta y reattacha al MISMO asiento y mano por id de perfil, o lo
   rechaza/crea uno nuevo? (causa probable real)
4. ¿Tras reattachar, el cliente recibe un snapshot completo y deja de estar congelado?
5. ¿La conexión/servidor se frena cuando la ventana del anfitrión se minimiza o pierde foco
   (throttling del webview)?

LUEGO arregla y CONSOLIDA en un flujo único:
6. HEARTBEAT ping/pong en servidor y cliente; si no hay respuesta dentro de un timeout, se trata el
   socket como muerto y se dispara la reconexión (sin esperar a que el usuario lo note).
7. RECONEXIÓN AUTOMÁTICA para TODOS los jugadores como mecanismo primario: reintento con backoff
   acotado, reattach por id de perfil, sin depender de ningún botón.
8. RESYNC: al reconectar, el orquestador envía un snapshot completo del estado autoritativo.
9. ANTI-THROTTLING: el servidor embebido y los latidos siguen corriendo aunque la ventana del host
   esté minimizada/sin foco. Si el webview los frena, evalúa correr el servidor fuera del hilo del
   webview (lado Rust / sidecar de Tauri) o, al menos, detectar el regreso de segundo plano y
   resincronizar de inmediato.
10. CONTROLES MANUALES, sin duplicar lógica:
    - Jugador: botón "Reconectar" como RESPALDO (se mantiene visible para el jugador mientras la
      reconexión automática se estabiliza).
    - Anfitrión: "reiniciar conexión de jugador X" que reabre su canal (NO expulsa; conserva asiento
      y mano).
11. La reconexión debe ser IDEMPOTENTE: reconectar varias veces no duplica asientos ni rompe estado.
</instrucciones>

<restricciones>
- Reattach SIEMPRE al asiento y mano existentes por id de perfil; nunca crear uno nuevo.
- Nunca expulsar jugadores.
- La autoridad vive en el orquestador; el cliente solo solicita y resincroniza.
- No cambies las reglas del juego ni carioca-core.
</restricciones>

<criterio_de_hecho>
En prueba en LAN: si un socket muere, el heartbeat lo detecta y el jugador vuelve solo a su asiento
y mano, sin tocar nada; minimizar/desenfocar la ventana del anfitrión no cuelga la partida; si la
automática falla, el botón del jugador o el reinicio del anfitrión lo traen de vuelta sin perder
estado; reconectar repetido no duplica asientos. Nadie es expulsado.
</criterio_de_hecho>

<cierre>
Commit: "fix(net): estabilidad LAN (heartbeat, anti-throttling) y reconexión consolidada".
</cierre>
```

---

# MEJORA 12 — Deuda: el reloj del orquestador está atado al turno  `[DEUDA — detectada en SPIKE_MELOQUIZ.md]`

**Toca:** `packages/server/src/motor.ts` y `packages/server/src/orquestador.ts`.
**Origen:** spike S0 de MeloQuiz (2026-07-21). **No implementar por separado**: se resuelve dentro de
la sesión que introduzca el reloj de fases (MeloQuiz S1/S4). Esta entrada existe para que ninguna
sesión intermedia rompa los supuestos de abajo.

**Deuda concreta:**

1. **`MotorJuego.turnoTurbo` declara un campo muerto.** La firma
   (`motor.ts:74`) devuelve `{ clave, jugadorId, duracionMs }`, pero el orquestador **solo lee
   `clave` y `duracionMs`** (`orquestador.ts:560-564`); el `jugadorId` del descriptor nunca se lee —
   `alVencerTurno` lo obtiene de `motor.jugadorEnTurno(estado)` (`orquestador.ts:580`). Es un campo
   público que miente sobre lo que el orquestador necesita.
2. **El reloj no puede expresar una fase de SALA.** `alVencerTurno` aborta si
   `jugadorEnTurno === null` (`orquestador.ts:580-581`), así que un juego simultáneo (fases que
   vencen para todos, no para uno) no puede usar el temporizador existente.

**Dirección recomendada:** al agregar `faseTemporizada`/`expirarFase` para MeloQuiz, evaluar
**unificar los dos relojes en uno solo de sala** en vez de dejar dos rutas de temporizador paralelas
en el orquestador. Los juegos por turnos derivarían el jugador de `jugadorEnTurno` — que es
literalmente lo que `alVencerTurno:580` ya hace hoy.

**Supuestos que otras sesiones deben respetar:**

- **El reloj de fases no puede quedar detrás del flag `turbo` del lobby.** Hoy el temporizador es
  opt-in del anfitrión (`orquestador.ts:416` y el early-return de `reprogramarTurnoTurbo:552`). Para
  un juego dirigido por reloj, el temporizador es obligatorio: debe armarse por el solo hecho de que
  el motor implemente el método.
- **`MensajeServidor` (`protocolo.ts:88-100`) es una unión cerrada: el orquestador no puede responder
  un pedido puntual a un cliente.** Cualquier mecanismo de request/response por conexión (sync de
  reloj, sondeos) va en la CAPA DE TRANSPORTE, junto a `latido.ts` — no agregando variantes a
  `MensajeServidor`, que pagarían todos los juegos.
- **Los acks y confirmaciones de juego viajan como `AccionJuego`**, no reciclando `listoSiguienteMano`
  (`procesarListo:450-461` está cableado a `motor.esperandoContinuar`).

---

*Mejoras post-Fase 5 (1-11) + deuda 12. Cada una es una sesión independiente, mismo flujo modular del PLAN.md.*
*Conectividad: la Mejora 8 define la semántica de desconexión; la Mejora 11 consolida la robustez y la reconexión.*
