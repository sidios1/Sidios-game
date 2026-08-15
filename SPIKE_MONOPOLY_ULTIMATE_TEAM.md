# SPIKE_MONOPOLY_ULTIMATE_TEAM.md — spike de arquitectura

> Sesión de investigación pura: no se tocó código funcionando. Objetivo: decidir
> si `MotorJuego` puede soportar Monopoly Ultimate Team (celdas, dados,
> presupuesto) sin modificarse, o si hace falta un wrapper (patrón `MotorRumble`)
> o un motor nuevo standalone (patrón `MotorMentiroso`/`MotorMeloquiz`).
>
> Fuente del ruleset: `REGLAS_MONOPOLY_ULTIMATE_TEAM.md` (estado: **Diseño
> cerrado**, sección 8: "Sin pendientes"). `MEJORAS.md` (623 líneas) fue
> revisado completo y **no contiene ninguna nota sobre este modo** — es backlog
> exclusivo de Carioca (mesa 3D, LAN, etc.), sin overlap temático.

## 1. Resumen del ruleset relevante para arquitectura

- **Tablero** (`REGLAS_MONOPOLY_ULTIMATE_TEAM.md:15-25`): 8 ligas de fútbol
  como grupos de color, sumando **22 celdas de propiedad** (línea 50: "22
  celdas totales, coherente con el tablero clásico de 22 propiedades") + 4
  ferrocarriles → "Resto del Mundo" + 2 servicios → "Técnicos" + 4 esquinas
  (Salida/Nueva Temporada cobra $200M, Cárcel/Lesionado-Suspendido, Parqueo
  Gratis/Fondo de Transferencias, Ir a la Cárcel/Descenso a la B).
- **Economía y sobres** (líneas 27-50): presupuesto inicial $1500M; comprar
  celda libre da un sobre (jugador random de esa liga, posición elegida por el
  comprador) o declinar → subasta libre ascendente desde $20M; sobre fijo una
  vez abierto; intercambio libre entre jugadores; precio escalonado por celda
  dentro de cada liga con mayor probabilidad de "mejor jugador" en la celda más
  cara (línea 35, sin definir qué es "mejor jugador" ni la tabla de
  probabilidades exactas).
- **Ventana de renegociación forzada** (línea 34, cita textual): "al comprar,
  la celda queda pausada 1 ronda. Durante esa ventana, cualquiera que caiga ahí
  puede forzar la compra pagando 200% del último precio pagado (compuesto:
  cada nueva renegociación es 200% de la anterior, no del precio original). La
  ventana se cierra cuando el turno vuelve al comprador original; el dueño en
  ese momento queda fijo de forma permanente."
- **Lesionado/Suspendido** (sección 4): pagar $50M o sacar dobles antes del
  turno 3, si no pierde un jugador aleatorio del equipo.
- **Cartas de evento** (sección 5): dos barajas de 16 cartas — Prensa Deportiva
  (volátil) y Tesorería del Club (administrativa), efectos económicos.
- **Fin de partida** (sección 6): número de rondas fijas (lo define el host) O
  "el presupuesto en circulación en el tablero se agota" (sin definir cómo se
  mide ese agotamiento — no hay un "banco" central con monto finito, a
  diferencia del Monopoly clásico).
- **Votación final** (sección 7): 5 minutos de armado de equipo, formación fija
  4-3-3 (11 slots nombrados: POR-LD-DFC-DFC-LI-MC-MCO-MC-ED-DC-EI), votación
  por 12 categorías (11 posiciones + técnico), voto libre y subjetivo uno por
  categoría, gana quien se lleve más categorías, empate → votación 1 a 1.
- El propio documento **nunca declara explícitamente "por turnos"** — se
  infiere de la mecánica (celdas, dados, "el turno vuelve al comprador
  original"). Confirmación cruzada externa en `REGLAS_MELOQUIZ.md:11-15`: "A
  diferencia de Carioca, Mentiroso, UNO (y del futuro Monopoly), no es por
  turnos [MeloQuiz]: es simultáneo [...] Monopoly rompe el molde
  'cartas/mano/mazo' pero sigue siendo secuencial por turnos."

## 2. ¿`MotorJuego` puede representar estado de tablero sin modificar el core?

**Sí.**

`packages/server/src/motor.ts:41` declara `MotorJuego<E, A>` como interfaz
genérica. El comentario de cabecera (líneas 7-10) es explícito:

> "El orquestador NUNCA inspecciona `E` (estado) ni `A` (acción): solo los pasa
> entre llamadas. Por eso este archivo no importa ningún core: declara tipos
> neutros [...] que ambos cores ya satisfacen de forma estructural."

Ningún método de la interfaz asume mano/mazo/cartas: `crear(jugadores, rng,
config?)`, `parsearAccion(crudo)`, `aplicarAccion(estado, jugadorId, accion)`,
`jugadorEnTurno`, `saltarTurno`, `turnoTurbo?`/`expirarTurno?` (reloj por
jugador opcional), `faseTemporizada?`/`expirarFase?` (reloj de sala opcional),
`terminada`, `esperandoContinuar`, `continuar`, `construirVista` (motor.ts:41-110).

Las acciones tampoco están tipadas por juego a nivel de protocolo:
`AccionJuego` (`packages/server/src/protocolo.ts:16-19`) solo garantiza
`{ tipo: string; [campo: string]: unknown }`; cada motor valida su propia forma
en `parsearAccion`.

**Precedente que ya prueba esto con un juego no-cartas**: `motorMeloquiz.ts`
(trivia musical, sin mano/mazo) implementa el mismo puerto `MotorJuego<E,A>`
sin tocar `motor.ts`, importando solo de `@juegos/meloquiz-core`
(`motorMeloquiz.ts:28,33`).

Un `EstadoMonopoly` (posiciones por celda, presupuesto por jugador, mazos de
cartas de evento, estado de la ventana de renegociación) y `AccionMonopoly`
(tirar dados, comprar, pujar en subasta, renegociar, intercambiar, votar
categoría) encajan sin cambios al puerto existente.

## 3. Ventana de renegociación forzada — ¿reusa el patrón de fases de MeloQuiz o es distinto?

**Parcialmente reusable, con una diferencia de fondo.**

El patrón `faseTemporizada?`/`expirarFase?` (`motor.ts:81-97`) es genérico y ya
está probado: "fase temporizada de SALA (opcional; hermana de `turnoTurbo` pero
SIN `jugadorId`: la fase vence para TODOS, no para un jugador) [...] A
diferencia de +Turbo, el reloj de fase NO es opt-in del anfitrión: el
orquestador lo arma por el solo hecho de que el motor implemente este método."
El orquestador calcula y difunde `faseInicioMs` (`orquestador.ts:641-657` y
`:744-748`); MeloQuiz es hoy el único implementador
(`motorMeloquiz.ts:134-141`), con duraciones como datos en
`meloquiz-core/src/reglas.ts:6-18,38-44`.

**Pero la ventana de renegociación de Monopoly no es de reloj real**: se cierra
"cuando el turno vuelve al comprador original" (línea 34 del reglamento), es
decir, se cuenta en **turnos**, no en `duracionMs` de pared. Eso es distinto de
`faseTemporizada`, que corre con un temporizador de milisegundos reales (como
los 5 minutos de armado de equipo en sección 7, que sí calzaría con
`faseTemporizada`). La ventana de renegociación encajaría mejor como **estado
interno del motor** (p. ej. un contador o marca de "turno de cierre" en
`EstadoMonopoly`) resuelto dentro de `aplicarAccion`/`saltarTurno` cada vez que
el turno avanza, no como una fase de sala temporizada del orquestador.

**Pendiente** (el reglamento no lo aclara, no se resuelve en este spike):
- Qué pasa si un jugador se salta turnos (Lesionado/Suspendido) durante la
  ventana — ¿la "vuelta" se estira o se cuenta igual?
- Si la ventana aplica quien ganó la celda por subasta, o solo a compra directa
  ("al comprar" en el texto no distingue).
- Qué pasa si el mismo jugador cae varias veces en la celda dentro de la misma
  ventana.

## 4. Sistema de sobres — ¿misma fuente que MeloQuiz (archivo+hash) o fuente nueva?

**Fuente nueva — el patrón de MeloQuiz no aplica.**

`meloquiz-fuente-local/src/huella.ts` deriva un id opaco por SHA-256 de los
primeros 64 KB del archivo + tamaño (`huella.ts:28-47`), específicamente para
que el id no delate la respuesta antes de revelarla (`catalogo.ts:16-21`,
`vista.ts:9-16`: "NO viaja en la vista: cada cliente resuelve `id → archivo`
contra su propia carpeta"). El diseño entero asume que el archivo YA vive en el
disco del usuario: "Sin red, sin scraping, sin descargas: la app solo toca lo
que ya está en disco" (`fuenteLocal.ts:5`).

Una base de jugadores de fútbol reales por liga/posición es conceptualmente
distinta: es un dataset que **el proyecto debe proveer y versionar** (no algo
disperso que cada usuario ya tiene en su carpeta local), y no tiene el problema
de "filtrado de la respuesta" que motiva el hash de contenido en MeloQuiz — no
necesita opacidad de id por hash, necesitaría ids estables asignados por el
propio dataset (p. ej. un `jugadorId` de un archivo curado por el proyecto).

El reglamento (línea 35) menciona probabilidad ponderada por precio al abrir el
sobre, pero **no especifica en absoluto** de dónde sale la data de jugadores
reales (nombres, ratings/atributos para "mejor jugador", licencias, estructura
por liga/posición).

**Pendiente explícito para la próxima sesión** (placeholder de diseño, no se
resuelve aquí): fuente de datos de jugadores — archivo estático curado por el
proyecto (JSON/CSV embebido, análogo en espíritu al `PoolPartida` pero
server-side y sin hash de contenido) vs. API externa. El mecanismo de puerto
(`IFuenteCatalogo`-like: `cargar(): Promise<Pool>`) es reusable en abstracto
como forma de contrato, pero no la lógica de huella ni el paquete
`meloquiz-fuente-local` completo.

## 5. Votación de 12 categorías — ¿generaliza el patrón de MeloQuiz o es distinto?

**La función de agregación es reusable; el modelo de estado no.**

`resolverVotacion` (`meloquiz-core/src/partida.ts:150-163`) es mayoría simple
sobre un `Record<jugador, voto>`, con `ganadorId: null` si hay empate en el
máximo o nadie votó. Es trivialmente reusable **por categoría** si se invoca
una vez por cada una de las 12.

Pero el estado actual de MeloQuiz es plano — una sola categoría implícita por
ronda: `votos: Readonly<Record<string, string>>`
(`meloquiz-core/src/partida.ts:73-74`), y la acción `votar`
(`partida.ts:356-383`) valida un voto por jugador por ronda, con cierre
anticipado cuando votan todos (`:379-381`) contando contra
`estado.jugadores.length` — no contra N categorías × jugadores. Adaptar esto a
12 categorías simultáneas requiere reestructurar a
`Record<categoría, Record<jugador, voto>>` y una capa de orquestación nueva que
llame `resolverVotacion` por categoría: **generalización del concepto, no
reuso directo del estado ni de la acción `votar`**.

**Pendiente** (no definido en el reglamento, no se resuelve aquí): mecanismo
exacto de voto (¿puede un jugador votarse a sí mismo en una categoría?, ¿es
"todos contra todos" votando el mejor de cada posición entre todos los
equipos?) y mecanismo exacto de la votación de desempate 1 a 1.

## 6. Encaje en `FichaCatalogo` / registro de motores

Sin sorpresas — sigue el patrón de alta de un juego ya documentado en
`HUB.md` y verificado en `packages/server/src/registroMotores.ts`:

- `REGISTRO` (`registroMotores.ts:49-65`) mapea `game-id → FabricaSala`; el
  comentario de cabecera (líneas 1-8) confirma: "Para agregar un juego se crea
  su motor en `src/juegos/<juego>/` y se añade aquí su entrada; no se toca el
  orquestador." El caso `meloquiz` (líneas 59-64) muestra además el patrón para
  motores que necesitan un recurso de construcción adicional vía
  `OpcionesSala` (`registroMotores.ts:28-45`), útil si Monopoly necesita algo
  similar para el pool de jugadores.
- Pasos para Monopoly: (1) `monopoly-core` + motor en
  `packages/server/src/juegos/monopoly/motorMonopoly.ts` implementando
  `MotorJuego<EstadoMonopoly, AccionMonopoly>`; (2) una línea nueva en
  `REGISTRO`: `monopoly: (opciones) => new Orquestador({ ...opciones, motor: crearMotorMonopoly() })`;
  (3) `VistaMonopoly` nueva añadida a la unión discriminada `VistaJuego`
  (`packages/server/src/vistaJuego.ts:21-26`, discriminante literal `juego`,
  hoy 5 variantes: `"carioca"`, `"carioca-rumble"`, `"mentiroso"`, `"uno"`,
  vista de MeloQuiz — sería la 6ª con `juego: "monopoly"`); (4)
  `packages/client/src/juegos/monopoly/{portada,definicion}.ts` con una
  `FichaCatalogo`/`DefinicionJuego` (contrato en
  `packages/client/src/juego/ficha.ts:27-38`) añadida al array `CATALOGO`
  (`packages/client/src/juego/catalogo.ts:12-18`), **sin tocar `src/hub/`**
  (confirmado: `pantallaHub.ts`/`coordinador.ts` no importan juegos por
  nombre).
- Nota menor: `CLAUDE.md` (línea ~216-218) todavía dice "las cuatro variantes"
  de `VistaJuego` — desactualizado, el código (`vistaJuego.ts:4-5`) ya dice
  "las cinco variantes" (incluye MeloQuiz). No se corrige en este spike
  (aditivo únicamente), solo se deja anotado.

## 7. Invariantes de dependencia para `monopoly-core`

**Standalone, patrón `mentiroso-core`/`meloquiz-core` — NO el patrón `rumble-core`.**

`rumble-core/package.json:14-16` declara `"dependencies": {"@juegos/carioca-core": "*"}`,
usado de forma angosta (solo tipos `Carta`/`Pinta` y el RNG determinista —
`rumble-core/src/muestreo.ts:5`, `snapshots.ts:4-5`) porque Rumble literalmente
ES Carioca sobre el mismo mazo. Verificado que `mentiroso-core` y
`meloquiz-core` **no tienen sección `dependencies`** en su `package.json` (solo
`devDependencies` de build/test) — son standalone puros, como documenta
`CLAUDE.md:172-184`.

Monopoly no comparte modelo de cartas con Carioca (tablero/celdas/dados, no
mano/trío/escala), así que el precedente correcto es `mentiroso-core`/
`meloquiz-core`: `monopoly-core` sin dependencia declarada a ningún otro
paquete del monorepo.

**Pendiente de decisión** (no se resuelve en este spike): si conviene reusar el
`GeneradorAleatorio`/RNG determinista de `carioca-core` (import type, como hace
`rumble-core`) para la probabilidad ponderada de los sobres (línea 35 del
reglamento), o duplicar ese utilitario mínimo dentro de `monopoly-core` para
mantenerlo 100% standalone.

## 8. Veredicto explícito

**Motor nuevo standalone** (mismo nivel que Mentiroso/UNO/MeloQuiz), **NO**
wrapper tipo `MotorRumble`.

`MotorRumble` (`packages/server/src/juegos/carioca/motorRumble.ts:1-4`) es un
decorador que envuelve `crearMotorCarioca()` porque Rumble ES Carioca con un
slice de habilidades encima — el estado literal es `{ base: EstadoPartida;
slice: SliceRumble }` (`estadoRumble.ts:2-3`) y delega turno/saltarTurno/
terminada al motor interno de Carioca. Monopoly no envuelve ningún motor
existente: no hay mano/mazo de Carioca (ni de ningún otro juego) que reusar
como base. Es un dominio de primer orden, como Mentiroso o MeloQuiz.

`MotorJuego<E,A>` **no requiere extensión ni modificación** — el puerto ya es
genérico y MeloQuiz prueba que soporta juegos sin cartas.

## 9. Lista consolidada de pendientes (no resueltos en este spike)

**Del reglamento** (`REGLAS_MONOPOLY_ULTIMATE_TEAM.md` no los define):
1. Orden espacial exacto de las 22+4+2+4 celdas del tablero.
2. Número de dados y reglas de turno detalladas (dobles en turno normal,
   acciones por turno).
3. Definición precisa de "mejor jugador" y tabla exacta de probabilidades
   ponderadas por precio (línea 35).
4. Si la ventana de renegociación aplica a sobres ganados por subasta, y qué
   pasa si hay saltos de turno (Lesionado/Suspendido) dentro de la ventana.
5. Cómo se mide el "presupuesto en circulación" para la condición de fin de
   partida (no hay un banco central con monto finito definido).
6. Validación de un equipo incompleto (slots vacíos del 4-3-3) al llegar a la
   votación.
7. Mecanismo exacto de voto por categoría (autovoto, quién vota a quién) y del
   desempate 1 a 1.

**De la arquitectura** (decisiones de diseño abiertas para la próxima sesión):
8. **Fuente de datos de jugadores reales por liga/posición** — placeholder a
   decidir: archivo estático curado por el proyecto vs. API externa (ver
   sección 4).
9. Si `monopoly-core` reusa el RNG determinista de `carioca-core` (import type)
   o lo duplica para quedar 100% standalone (ver sección 7).
10. Si la ventana de renegociación se modela como estado interno del motor
    (contador de turnos) o si conviene alguna variante del reloj de fase — se
    apuntó una recomendación en sección 3, pero la implementación concreta
    queda para la sesión de diseño detallado.

---

## Resumen (3-5 líneas)

**Veredicto: motor nuevo standalone**, igual que Mentiroso/UNO/MeloQuiz — no
wrapper tipo `MotorRumble` (Monopoly no envuelve ningún motor existente) ni
extensión del core (`MotorJuego<E,A>` ya es genérico, probado por MeloQuiz).
`monopoly-core` debe seguir el patrón standalone sin `dependencies` declaradas
(como `mentiroso-core`), no el de `rumble-core`. El único placeholder duro que
falta para la siguiente sesión es la **fuente de datos de jugadores reales por
liga/posición** (archivo estático del proyecto vs. API externa): el patrón de
`meloquiz-fuente-local` no aplica porque asume archivos que el usuario ya tiene
en disco, mientras que esto es un dataset que el proyecto debe proveer y
versionar.
