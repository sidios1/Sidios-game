# REGLAS_MELOQUIZ.md

> Documento de decisiones de diseño para **MeloQuiz**, juego de adivinar canciones dentro de Sidios.
> Se escribe **antes** de cualquier sesión de implementación, para fijar las decisiones que un agente
> resolvería autónomamente. Todas las decisiones abiertas quedaron cerradas en esta versión.

---

## 0. Qué es y por qué es distinto

MeloQuiz es el juego más disímil del catálogo de Sidios. A diferencia de Carioca, Mentiroso, UNO
(y del futuro Monopoly), **no es por turnos**: es **simultáneo** (todos escuchan y votan a la vez).

Por eso funciona como **stress test ortogonal** al de Monopoly:
- Monopoly rompe el molde "cartas/mano/mazo" pero sigue siendo secuencial por turnos.
- MeloQuiz rompe el eje **turno** y el eje **tiempo real** (reproducción simultánea de audio).

Verificar que el núcleo actual pueda modelar una partida **dirigida por reloj** (fases que avanzan por
tiempo, no por acción de jugador) es el objetivo del spike de Session 0 (ver §10).

**Nota de alcance del bonus por velocidad:** una versión previa contemplaba puntaje por rapidez del
voto, lo que exigía sincronía *sub-segundo con medición justa por cliente*. Esa decisión se revirtió
(§6): **el puntaje es plano, cada acierto vale 1 punto.** La sincronía sigue siendo deseable por la
experiencia (la gracia es escuchar todos juntos), pero el listón de ingeniería baja de "medición justa
sub-segundo" a "que se sienta simultáneo". Esto elimina la curva de bonus, el "ganador por rapidez" y
la medición local como pieza crítica.

---

## 1. Fuente de catálogo — LOCAL (audio + carátula)

MeloQuiz usa una **única fuente**: una **carpeta de archivos de audio en el disco de cada cliente**,
detrás del contrato `IFuenteCatalogo`. El núcleo puro consume un `PoolPartida` y le da igual cómo se
armó: la máquina de fases, la votación y el puntaje son agnósticos de la fuente (por si a futuro se
agrega otra, el contrato queda listo).

- **Formato: audio + carátula** (no video). Es el caso natural de una librería musical; el preload es
  trivial y la sync queda muy fina por ser archivos chicos.
- **Fase de "revelar" (§5):** muestra **carátula + título**, no un clip de video.
- **Formatos de audio:** mp3, m4a/AAC, flac, opus — todos reproducibles en WebView2 (Chromium) vía
  `<audio>` HTML5. (MKV/AVI/otros contenedores de video quedan fuera; no aplica a audio+carátula.)
- **Metadatos (respuesta correcta + distractores):** tags **ID3** (título, artista) de cada archivo,
  con **fallback al nombre del archivo** si falta el tag. Los 3 distractores salen de otros archivos de
  la misma carpeta.
- **Carátula:** arte embebido en ID3; si falta, placeholder genérico.
- **Punto de inicio del clip:** **inicio fijo ~30% del archivo.**

### Regla de arquitectura — CERRADA
> **Cada cliente lee su propia carpeta local. El host NO envía archivos de audio a los peers.**

El host elige el tema y difunde "reproduzcan la pista X en `start_at`" — **la orden, no el archivo**.
Cada cliente toca su copia local. Esto es **sincronizar reproductores, no redistribuir**. Si un peer no
tiene los archivos, simplemente no puede jugar (el caso de uso es "amigos con la misma librería" o un
pack común que cada quien copió a su disco). Poblar esa carpeta (pack compartido, música propia,
material libre de derechos) es **upstream, fuera de la app**. La app es un reproductor sincronizado que
toca lo que ya está en disco.

---

## 2. Carga de catálogo

El host (o cada cliente) apunta a una **carpeta**. Se leen los archivos de audio soportados, se extraen
tags ID3 + carátula, se normalizan los títulos y se arma el `PoolPartida`. Sin red, sin scraping.

- **Mínimo de canciones válidas para iniciar:** **4** (lo justo para una votación de 4 opciones). Si la
  carpeta tiene menos, se bloquea el inicio y se avisa.
- **Normalización de título:** limpiar sufijos y ruido del nombre de archivo (`_320kbps_HQ`, guiones
  bajos, etc.) — ese texto es literalmente el botón de respuesta que ven los jugadores.
- **Archivo ilegible / corrupto / formato no soportado:** se excluye del pool, se cuenta como
  descartado.

---

## 3. Sincronía de reproducción

Objetivo: **que se sienta simultáneo** (con puntaje plano ya no hace falta medición justa sub-segundo).
No hay ads de ningún tipo — la reproducción es de archivos locales.

### Precarga con ack
1. **Sync de reloj:** cada cliente hace varios pings ida-y-vuelta contra el **host** para estimar
   latencia y desfase respecto al reloj del host.
2. **Precarga con ack:** el host anuncia la ronda con anticipación. Cada cliente precarga el archivo,
   lo deja **pauseado en el segundo exacto** (~30% del tema), y **confirma "listo" (ack)** al host.
3. **`start_at` sobre estado confirmado:** el host **no fija `start_at` hasta que todos ackearon**.
   - **Timeout de ack:** si un cliente no confirma a tiempo, **se arranca sin él** y se le marca
     "no listo" esa ronda (no se frena la partida).
4. **Arranque:** cada cliente traduce `start_at` a su hora local (desfase del paso 1) y dispara
   `play()` sobre audio **ya cargado localmente**.
5. Verificar estado del reproductor antes de armar el arranque; margen de buffer algo mayor que el clip.

Al ser archivos en disco, la precarga es trivial y la sync queda especialmente fina.

**Precisión para S4 (spike §2.2 — `start_at` absoluto ≠ contador relativo):** la vista del orquestador
hoy difunde tiempo **relativo** (`msRestantes = venceEn - Date.now()`), inmune al desfase entre relojes
— correcto para un **contador de fase**. Pero para el **arranque del audio no alcanza**: la vista se
serializa cliente por cliente y el tiempo de vuelo difiere, así que un "faltan 800 ms" llega distinto a
cada uno (justo el error que la sync vino a eliminar). Por eso la vista debe llevar **dos campos con
propósitos distintos**: un `msRestantes` **relativo** para el contador de fase, y un **`start_at`
absoluto en reloj del host** para el arranque sincronizado. No sustituir uno por el otro.

**El desfase es 100% local del cliente (spike §2.1):** como cada cliente traduce `start_at` con su
propio offset, el host **nunca** necesita conocer el offset de nadie. El orquestador ni se entera de
que la sync existe.

**Carátula — CERRADO en S3 (peer lee su archivo local, no viaja por el cable).** La carátula que se
revela **no** se difunde en bytes por la vista (sería pesado y va contra host↛peer). Cada cliente la
saca de **su propio archivo local** al entrar en la fase revelar: parseo **perezoso y parcial** del ID3
de ese único archivo (vía `music-metadata`, browser-safe), resuelto por el `hash→ruta` que el peer ya
tiene del índice por huella. Se cachea el resultado (incluido el caso "sin arte") y **se descarta si la
fase cambia mientras el parseo async resuelve**, para no pisar el render siguiente. Esto confirma que el
peer necesita **parseo parcial en revelar**, no el índice completo con metadatos que se descartó — la
decisión "solo índice por huella" sigue vigente, con este parseo puntual encima.

---

## 4. Flujo de una ronda — PIVOTADO (2026-07-21)

> **Cambio de concepto:** el juego **no juzga** quién acertó. Los jugadores adivinan la canción **fuera
> de la app** (en la misma pieza, o por voz). El juego reproduce, revela, y registra el **veredicto del
> grupo**: los participantes votan entre ellos quién ganó la ronda. El juego es escribano, no árbitro.
> Con esto, revelar-antes-de-votar es el orden correcto (el grupo necesita ver la respuesta para juzgar).

| Fase | Duración | Qué pasa |
|---|---|---|
| Precarga (lobby de ronda) | variable | Sync de reloj, precarga, ack de todos. Recién aquí se fija `start_at`. |
| Clip | 10 s | Suena el audio desde el punto de inicio (~30%); solo audio, nada identificable visible. Los jugadores adivinan de viva voz, fuera de la app. |
| Revelar | 5 s | Se muestra **carátula + título**; el audio sigue sonando desde donde iba. Ahora todos saben cuál era. |
| Votación | 10 s (o hasta que todos voten) | Cada jugador vota por el **participante** que cree que ganó la ronda (la adivinó primero / mejor). Auto-voto permitido. |
| Tabla de puntos | 5 s | Se computa la mayoría y se actualiza el marcador. |

Al terminar tabla de puntos → nueva canción, vuelta a Precarga.

**Modo entrenamiento (1 jugador):** sin votación — el flujo es Precarga → Clip → Revelar → (siguiente),
saltando de canción en canción. Es un reproductor de práctica.

---

## 5. Votación y puntuación — PIVOTADO (2026-07-21)

- **Se vota por JUGADOR, no por título.** Las opciones son los participantes de la partida. No hay
  distractores ni alternativas de canción — eso pertenecía al concepto anterior (quiz autónomo) y quedó
  eliminado.
- **El juego no conoce "la respuesta".** Los metadatos ID3 solo sirven para revelar la canción; el
  ganador lo determina el grupo, no el motor.
- **Cierre anticipado:** si todos votaron antes del tiempo, se cierra la ventana de inmediato.
- **Resolución: mayoría simple.** El jugador con más votos suma **1 punto**. **Empate = nadie suma** y
  se sigue. Auto-voto **permitido**.
- **Riesgo conocido (aceptado por ahora):** con 2 jugadores y auto-voto permitido, si ambos se votan a
  sí mismos hay empate perpetuo y nadie suma nunca. Se asume que con amigos no se juega así; si en la
  práctica molesta, la corrección candidata es prohibir auto-voto solo cuando hay 2 jugadores.
- **Sin voto = no participa del conteo** de esa ronda (el desconectado o el que no votó no aporta voto).

> **Invariantes de S1 tras el pivote:** "título oculto hasta revelar" **sigue vigente** (no mostrar la
> respuesta mientras suena el clip — protege la gracia del juego, ya no una votación). El `pistaId`
> opaco **sigue vigente** por la misma razón. El "voto por id de opción" muta a "voto por id de
> jugador".

---

## 6. Parámetros de partida — CERRADO

- **Rondas por partida:** **configurable**; por defecto **= cantidad de canciones válidas en el pool**.
- **Condición de victoria:** mayor cantidad de aciertos tras la última ronda.
- **Desempate:** **empate compartido** (sin velocidad no hay criterio secundario; los que empatan
  comparten el puesto).
- **Mín / máx jugadores:** propuesto **2 / 8** (ajustable).
- **¿El host vota?** **Sí** — cliente igual con el control extra de iniciar rondas.
- **Modo entrenamiento (1 jugador, opt-in) — CERRADO en S3, ajustado por el pivote.** Modo de 1 jugador
  activable desde el lobby, config opaca `{entrenamiento: true}` por el mismo seam que Rumble. **Tras el
  pivote (§4): sin votación** — salta de canción en canción (Precarga → Clip → Revelar → siguiente). **Comportamiento del ack/timeout:** con 1
  jugador el ack de precarga cierra al instante (el set de listos se completa con el único jugador), así
  que el timeout de precarga nunca corre. **Restricción para S4:** la sync de reloj real no debe romper
  este camino — con 1 jugador el offset es 0 y el ack sigue siendo instantáneo; el modo entrenamiento
  debe seguir jugable después de cablear el multiplayer.

---

## 7. Desconexiones y reingreso — CERRADO

- **Desconexión a mitad de ronda:** el jugador pierde esa ronda (sin voto = sin punto); la partida
  continúa para el resto.
- **Reingreso a partida en curso:** **permitido** — entra en la siguiente precarga, con su puntaje
  conservado (el host mantiene su slot).
- **Caída del host:** en v1 la **partida termina** (host-autoridad). Migración de host = fuera de
  alcance.

---

## 8. Separación de capas (encaje con la arquitectura Sidios)

- **Fuente de catálogo (`IFuenteCatalogo`, implementación LOCAL):** lee carpeta, extrae ID3 + carátula,
  normaliza títulos → `PoolPartida`. Sin red. El contrato queda abstracto por si a futuro se suma otra
  fuente, pero v1 tiene una sola.
- **Núcleo puro (Vitest):** consume `PoolPartida` y es determinista. Máquina de fases (precarga → clip
  → revelar → voto → puntaje), conteo de votos, **puntaje plano**, condición de victoria. **Recibe el
  tiempo como entrada (reloj inyectado); jamás llama `Date.now()`** — igual que la aleatoriedad se
  inyecta hoy (CLAUDE.md regla 1). El avance de ronda **no** usa `esperandoContinuar`/`continuar` (quedan
  en `false`/no-op, como Mentiroso y UNO): la ronda avanza dentro de la expiración de la fase "tabla de
  puntos".
- **Extensión del motor (spike §1.3 — obligatoria, mínima):** dos métodos **opcionales** en `MotorJuego`
  — `faseTemporizada(estado) → {clave, duracionMs} | null` y `expirarFase(estado, rng) → Resultado` —,
  hermanos de `turnoTurbo`/`expirarTurno` pero **sin `jugadorId`** (son fases de **sala**, no de
  jugador). En el orquestador, la ruta espejo de `reprogramarTurnoTurbo`/`alVencerTurno` **sin** el
  lookup de `jugadorEnTurno`. Se afloja el gate: `faseTemporizada` se arma por el solo hecho de que el
  motor la implemente, sin depender del flag `turbo` del lobby. `IJuego` (cliente) **no** se toca.
- **Render:** reproducción con **`<audio>` HTML5** dentro del webview de Tauri. No se necesita Electron.
  La reproducción es **consecuencia de la vista**, no una decisión del cliente (CLAUDE.md regla 5).
- **Multiplayer:** host-autoridad + transporte existente. **Solo-Windows en v1** (coherente con no
  haber medido aún el throttling de timers en background de Android — Session 1c). El reloj de fases se
  arma con el seam inyectable **`OpcionesOrquestador.programar`** (el mismo que ya usan +Turbo y la
  ventana de gracia), lo que permite tests deterministas sin esperar tiempo real.
  > **Corrección (spike §5):** una versión previa de esta sección decía que los timers "mapean sobre
  > `GRACIA_MS` y `ProgramadorResiliente`". Es incorrecto: `GRACIA_MS` es la ventana de desconexión de
  > un jugador (no tiene relación con fases), y **`ProgramadorResiliente` todavía no existe** (es trabajo
  > futuro de la Sesión 1c de Android). El seam real es `OpcionesOrquestador.programar`.
- **Sync de reloj — subsistema SEPARADO en la capa de transporte (spike §2):** módulo puro (p.ej.
  `sincroniaReloj.ts`), **espejo de `latido.ts`**, consumido por los adaptadores, **no** dentro del
  orquestador. Sus frames son control de alta frecuencia, irrelevantes para las reglas, y deben poder
  medir RTT sin atravesar el pipeline del orquestador. Debe estar caliente **antes** de que haya
  partida (en el lobby el orquestador es mudo).
- **Ack de precarga (spike §3):** viaja como una `AccionJuego` común por el sobre genérico existente
  (`{tipo:"listoPrecarga", rondaId}` cae en la rama `default` del parser). **Cero cambios de protocolo.**
  No reciclar `listoSiguienteMano` (está cableado a `esperandoContinuar`, que MeloQuiz deja en `false`).
- **Neto nuevo (no existe hoy en la base):** los dos métodos de fase temporizada + su ruta en el
  orquestador, el subsistema de sync de reloj, la fase de precarga con acks, y la implementación LOCAL
  de `IFuenteCatalogo`.

---

## 9. Preguntas para el spike (Session 0) — RESUELTAS

Respondidas por `SPIKE_MELOQUIZ.md` (2026-07-21). Veredictos:

1. **¿El núcleo modela una partida dirigida por reloj?** → **Hay que extender**, mínimamente: los dos
   métodos de fase de sala (§8, "Extensión del motor"). La simultaneidad ya encaja; `IJuego` no se toca.
2. **¿Dónde vive la sync de reloj?** → **Subsistema separado en la capa de transporte**, espejo de
   `latido.ts`; el orquestador ni se entera (§8).
3. **¿El ack pide handshake nuevo?** → **No.** Viaja como `AccionJuego` por el sobre existente; lo único
   que faltaba (el timeout) es la misma pieza del punto 1 (§8).

Ver el spike para el detalle con referencias de código.

---

## 10. Fuera de alcance v1

- Envío de archivos de audio host→peer (§1). **Permanente.**
- Modo video en la fuente local (se eligió audio + carátula).
- Android (diferido; depende de Session 1c — throttling de timers en background).
- Migración de host ante caída.
- Chat (eliminado; única interacción es el voto).

---

## 11. Selección de categorías (subcarpetas) — CERRADO (2026-07-23)

Librerías reales de MeloQuiz organizan las pistas en subcarpetas (p. ej.
`Facil/`, `Normal/`, `Dificil/`, `Extremo/`); el host quiere poder incluir solo
algunas en la partida.

- **Categoría = nombre de la subcarpeta de primer nivel** que contiene el
  archivo. Un solo nivel: subcarpetas dentro de subcarpetas NO se distinguen
  entre sí (§1/§2 siguen leyendo "una carpeta", ahora con un nivel de
  profundidad extra, no un árbol arbitrario).
- **Archivos sueltos directamente en la carpeta raíz** (sin subcarpeta) no
  tienen categoría (`null`) y **siempre entran al pool**, sin importar la
  selección: no hay forma de excluirlos por categoría porque no pertenecen a
  ninguna.
- **Quién elige:** solo el **host**, **antes de iniciar la partida** — en el
  mismo momento en que hoy elige la carpeta (no es una opción de cada jugador,
  no cambia en caliente durante la partida).
- **Multi-selección:** el host marca cero, una o varias categorías; el pool
  final es la unión de las canciones de las categorías marcadas (más los
  archivos sueltos, siempre).
- **Sin selección explícita (host no interactúa, o carpeta sin subcarpetas):
  entran TODAS las categorías** — compatibilidad con carpetas planas
  existentes, que siguen funcionando exactamente igual que antes de esta
  sección.
- **No es config de partida:** a diferencia de "modo entrenamiento" (§6), la
  selección de categorías es un filtro sobre QUÉ ARCHIVOS SE LEEN al armar el
  `PoolPartida`, resuelto antes de que la sala exista — no viaja como blob
  opaco de `PanelConfigLobby` ni la revalida el motor en `iniciarPartida`.
