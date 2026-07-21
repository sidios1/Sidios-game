# SPIKE S0 — MeloQuiz: ¿el núcleo modela una partida dirigida por reloj?

**Tipo:** spike de auditoría (solo lectura). No se modificó ni una línea de
código de producción.
**Fecha:** 2026-07-21
**Rige:** `REGLAS_MELOQUIZ.md` §0 y §9; `PLAN_MELOQUIZ.md` S0.
**Alcance:** las tres preguntas de REGLAS §9, validadas contra el modo LOCAL
(carpeta de audio en disco, sin red externa — §1, CERRADA).

---

## Resumen ejecutivo

1. **Pregunta 1 — HAY QUE EXTENDER.** La simultaneidad encaja sin cambios (el
   orquestador nunca consulta el turno antes de aplicar una acción), pero el
   reloj no: el único temporizador que hoy mueve el estado sin acción de jugador
   (+Turbo) está modelado **por jugador** y aborta cuando no hay turno activo.
   Faltan dos métodos opcionales en `MotorJuego`: `faseTemporizada`/`expirarFase`.
2. **Pregunta 2 — Subsistema SEPARADO, en la capa de transporte**, espejo de
   `latido.ts`. Además, por §3.4 el desfase es estado 100% local del cliente: el
   orquestador ni siquiera necesita enterarse de que existe.
3. **Pregunta 3 — Encaja sin handshake nuevo.** El ack viaja como `AccionJuego`
   por el sobre genérico que ya existe. Lo único que falta es el *timeout* del
   ack, que es la misma pieza que falta en la Pregunta 1.
4. **`IJuego` (cliente) NO necesita cambios.**
5. REGLAS §8 contiene una imprecisión que conviene corregir (ver §5 de este doc):
   `ProgramadorResiliente` todavía no existe.

---

## 1. Pregunta 1 — Veredicto: **HAY QUE EXTENDER**

### 1.1 Lo que YA encaja (no requiere nada)

**La simultaneidad no es problema del orquestador.** `procesarAccionJuego`
(`packages/server/src/orquestador.ts:428-448`) **nunca** consulta de quién es el
turno: recibe la acción y llama al motor directo.

```ts
const resultado = this.motor.aplicarAccion(this.estado, jugadorId, accion);
```

Quién puede actuar lo decide el motor, por dentro. Un motor que acepte el voto de
cualquiera que no haya votado todavía es perfectamente legal con la interfaz de
hoy. La regla "el cliente envía intenciones, el servidor valida" (CLAUDE.md
regla 2) no presupone turnos en ningún punto.

**La maquinaria de turnos se puede neutralizar, y hay precedente.**
`saltarTurnosAusentes` (`orquestador.ts:518-541`) hace `return` inmediato si
`motor.jugadorEnTurno(estado) === null` (línea 524). Y dos motores ya neutralizan
las partes del contrato que no les aplican: `motorMentiroso.ts:139-146` y
`motorUno.ts:130` devuelven `esperandoContinuar → false` con `continuar` como
no-op. MeloQuiz haría lo mismo con `jugadorEnTurno → null` y `saltarTurno →
estado sin cambios`.

**El "cierre anticipado" del voto (§5) sale gratis.** Si `aplicarAccion` devuelve
un estado que ya cambió de fase (llegó el último voto), `reaccionar()`
(`orquestador.ts:504-509`) re-arma el reloj y difunde en el mismo tick. Ese
mecanismo ya está construido.

**Desconexión y reingreso (§7) ya están cubiertos.** El jugador desconectado
simplemente no vota. `procesarReconexion` (`orquestador.ts:297-326`) reattacha
por token conservando asiento y estado del motor (= su puntaje). Precisión
importante para S4: es **reconexión por token**, no alta de jugador nuevo —
`procesarUnirse` (`orquestador.ts:262-266`) rechaza a un desconocido a mitad de
partida con `partidaYaIniciada`. Eso es exactamente lo que §7 describe ("el host
mantiene su slot"), así que no hay conflicto.

### 1.2 Lo que NO encaja — el supuesto de "turno" incrustado

El único reloj que hoy mueve el estado sin acción de jugador es el modo **+Turbo**,
y está modelado **por jugador**, no por sala:

```ts
// packages/server/src/motor.ts:74,80
turnoTurbo?(estado: E): { clave: string; jugadorId: string; duracionMs: number } | null;
expirarTurno?(estado: E, jugadorId: string, rng: GeneradorAleatorio): Resultado<E>;
```

`alVencerTurno` (`orquestador.ts:574-589`) es el corazón del problema:

```ts
const jugadorId = this.motor.jugadorEnTurno(estado);
if (jugadorId === null) return;              // ← MeloQuiz muere acá
const resultado = this.motor.expirarTurno(estado, jugadorId, this.rng);
```

Una fase de MeloQuiz (clip 10 s → revelar 5 s → voto 10 s → tabla 5 s, §4) vence
**para la sala**, no para un jugador. Con `jugadorEnTurno → null` el reloj se
arma pero al vencer no hace nada: la partida se congela en la primera fase.

Ese es el veredicto binario: **la extensión es obligatoria**, y es exactamente
esta.

### 1.3 Qué extender, exactamente (mínimo viable)

Dos métodos opcionales en `MotorJuego`, hermanos de los de +Turbo pero **sin
`jugadorId`**:

```ts
/** Fase temporizada de SALA (no de jugador). null = sin reloj corriendo. */
faseTemporizada?(estado: E): { clave: string; duracionMs: number } | null;
/** Política al vencer la fase: la decide el juego. */
expirarFase?(estado: E, rng: GeneradorAleatorio): Resultado<E>;
```

En el orquestador, la ruta espejo de `reprogramarTurnoTurbo`/`alVencerTurno`
(`orquestador.ts:551-589`) **sin** el lookup de `jugadorEnTurno`. La mecánica de
re-armado por `clave` (línea 560: "mismo turno ⇒ sigue corriendo") se reusa tal
cual: es justo lo que necesita una máquina de fases para no reiniciar la cuenta
ante acciones dentro de la misma fase.

Tres detalles que abaratan la extensión:

- **`turnoTurbo.jugadorId` es campo muerto.** El orquestador solo lee
  `desc.clave` y `desc.duracionMs` (`orquestador.ts:560-564`); el `jugadorId` del
  descriptor **nunca se lee** — `alVencerTurno` lo saca de `motor.jugadorEnTurno`.
  Es decir: `faseTemporizada` no es una interfaz nueva, es `turnoTurbo` con el
  campo inútil borrado. (Ver MEJORA 12.)
- **El canal de "cuánto falta" ya existe y ya se difunde.**
  `MetaSala.turboMsRestantes` (`vista.ts:86-87`) se calcula en `difundirVistas`
  (`orquestador.ts:667`) y viaja en la vista. Solo hay que generalizarlo a un
  `msRestantes` de fase.
- **El gate de activación hay que aflojarlo.** Hoy el reloj es opt-in del
  anfitrión: `this.turbo = turbo && this.motor.turnoTurbo !== undefined`
  (`orquestador.ts:416`), y `reprogramarTurnoTurbo` (línea 552) sale si
  `!this.turbo`. En MeloQuiz el reloj **no es opcional**: es el motor de la
  partida. `faseTemporizada` debe armarse por el solo hecho de que el motor la
  implemente, sin depender del flag `turbo` del lobby.

### 1.4 `IJuego` (cliente): NO hay que extenderlo

`packages/client/src/juego/ijuego.ts:34-47` — el ciclo
`iniciar / sincronizarEstado(vista) / procesarAccion / finalizar` alcanza:

- el `<audio>` HTML5 se monta en `contexto.contenedorEscena`,
- el voto sale por `contexto.enviar`,
- la fase actual y el `start_at` llegan dentro de la `VistaJuego`.

Es el mismo patrón de CLAUDE.md regla 5 ("la vista del servidor es la verdad; las
animaciones solo representan el estado, jamás lo deciden ni lo bloquean"), con
audio en lugar de tweens. La reproducción es una consecuencia de la vista, no una
decisión del cliente.

---

## 2. Pregunta 2 — Sync de reloj: **subsistema SEPARADO, en la capa de transporte**

**Recomendación:** un módulo puro (p. ej. `packages/server/src/sincroniaReloj.ts`)
consumido por los adaptadores, **espejo exacto de `latido.ts`**. No dentro del
orquestador.

Cinco razones, todas con evidencia:

1. **El precedente es literalmente este.** `latido.ts` es lógica pura (solo
   `setTimeout`/`setInterval`, con temporizadores inyectables para tests
   deterministas), la comparten el adaptador Node y el del navegador, y sus
   frames los **consume el adaptador sin pasarlos nunca a los oyentes**
   (`latido.ts:1-26`). CLAUDE.md regla 3 lo fija: "el keepalive vive en la CAPA DE
   TRANSPORTE, no en el orquestador". Los frames de sync tienen idéntica
   naturaleza: control, alta frecuencia, irrelevantes para las reglas.
2. **El orquestador hoy NO PUEDE responder un pedido puntual.** `MensajeServidor`
   (`protocolo.ts:88-100`) es una unión **cerrada**: bienvenida / estadoSala /
   configSala / vista / error / salaCerrada. El sentido cliente→servidor sí es
   abierto (cualquier `tipo` desconocido cae en `accionJuego`,
   `protocolo.ts:187-190`), pero el de vuelta **no**. Meter el sync adentro obliga
   a una variante nueva de `MensajeServidor` que pagan los cuatro juegos
   existentes.
3. **Calidad de medición.** Un pong que atraviesa `analizarMensajeCliente` →
   `procesarAccionJuego` → `motor.aplicarAccion` → `difundirVistas` (que serializa
   una vista por jugador, `orquestador.ts:650-676`) mide el trabajo del
   orquestador, no el RTT. En el transporte el pong es un `send` directo.
4. **El desfase es propiedad del CANAL, no del juego.** Vive host↔peer y sirve a
   cualquier juego futuro que lo necesite.
5. **Tiene que funcionar antes de que haya partida.** `difundirVistas` hace
   `return` si `estado === null` (`orquestador.ts:651-652`): en el lobby el
   orquestador es mudo, pero el estimador ya debería estar caliente para la
   primera precarga.

### 2.1 El corolario que simplifica todo

Por §3.4, **cada cliente traduce `start_at` a su hora local con su propio
desfase**. Entonces el host **nunca necesita conocer el offset de nadie**: el
offset es estado 100 % local del cliente, y el orquestador ni se entera de que
existe. Eso convierte la decisión en trivial — no es que "convenga" separarlo, es
que el orquestador no tiene por qué verlo.

### 2.2 Salvedad concreta para S4: relativo vs. absoluto

Hoy la vista difunde un tiempo **relativo**
(`turboMsRestantes = venceEn - Date.now()`, `orquestador.ts:667`), inmune al
desfase entre relojes — decisión correcta y deliberada para un contador de turno.

Para el arranque del audio **no alcanza**: `difundirVistas` es un `for` serial
sobre asientos (`orquestador.ts:669-675`) y el tiempo de vuelo difiere por
cliente, así que un "faltan 800 ms" llega distinto a cada uno — que es
precisamente el error que la sync de reloj vino a eliminar.

MeloQuiz necesita un **`start_at` absoluto en reloj del host** dentro de la vista,
*además* del `msRestantes` relativo para el contador de fase. Son dos campos con
dos propósitos distintos; no sustituir uno por el otro.

---

## 3. Pregunta 3 — Ack de precarga: **encaja, sin handshake nuevo**

Las tres piezas del flujo §3 ya tienen carril en el modelo de eventos actual:

| Pieza | Carril existente |
|---|---|
| Host anuncia la ronda ("precarguen la pista X") | La vista difundida por `difundirVistas` (`orquestador.ts:650`) |
| Cliente confirma listo (ack) | Una `AccionJuego` común: `{tipo:"listoPrecarga", rondaId}` cae en la rama `default` de `analizarMensajeCliente` (`protocolo.ts:187-190`), la valida `motor.parsearAccion` y la acumula `aplicarAccion`. **Cero cambios de protocolo.** |
| "No fijar `start_at` hasta que todos ackeen" | Estado interno del motor: cuando el set de acks está completo, `aplicarAccion` devuelve el estado ya en fase "clip" con `start_at` estampado, y `reaccionar()` re-arma el reloj y difunde |

La forma "acumular confirmaciones y avanzar al alcanzar el umbral" **ya está
implementada** en el orquestador para las manos (`listos` / `esperandoContinuar` /
`FRACCION_VOTOS = 0.75`, `orquestador.ts:450-496`). MeloQuiz no la reusa —necesita
"todos, con timeout", no "75 % de los conectados"— pero confirma que el modelo de
eventos soporta el patrón sin violencia.

**Lo único que falta es el timeout de ack** (§3.3: "si un cliente no confirma a
tiempo, se arranca sin él") — y es **la misma pieza de la Pregunta 1**: un
temporizador de sala sin jugador en turno. Con `faseTemporizada`/`expirarFase`, la
precarga es sencillamente otra fase temporizada cuyo vencimiento arranca sin los
rezagados. No se necesita ningún mecanismo de handshake aparte.

**Trampa a evitar en S4:** no reciclar `listoSiguienteMano` para el ack.
`procesarListo` (`orquestador.ts:450-461`) está cableado duro a
`motor.esperandoContinuar` y responde `accionInvalida` si es false — y MeloQuiz
devuelve `esperandoContinuar → false` siempre. El ack va como acción de juego, y
el protocolo de lobby queda intacto.

---

## 4. Validación contra el modo LOCAL (§1, fuente v1)

- **S1 y S2 no tocan nada de esto.** El núcleo puro se testea con un reloj
  **inyectado**: la máquina de fases no debe llamar `Date.now()` jamás, igual que
  hoy la aleatoriedad se inyecta (CLAUDE.md regla 1: "la aleatoriedad recibe el
  generador/semilla como parámetro, no usa `Math.random` directo"). **Esta es la
  restricción más importante que S1 debe respetar**, y sale de este spike.
- **S3 (un cliente) es la prueba de que la extensión basta:** con un solo jugador
  la sync de reloj es un no-op (offset 0) y el ack se resuelve instantáneo. Lo
  único imprescindible para jugar una partida entera es el reloj de fases — lo que
  confirma el orden de PLAN_MELOQUIZ (el neto nuevo de red queda todo en S4).
- **La regla host↛peer (§1, CERRADA) calza con la proyección existente.** Por la
  vista viaja la **orden** (id de pista + `start_at` + las 4 opciones), nunca
  bytes de audio. Y el título correcto **no debe estar en la vista antes de la
  fase revelar**: es exactamente el trabajo que ya hace `construirVista` con las
  manos ajenas (`vista.ts:1-3`, CLAUDE.md regla 2 — "nunca enviar a un jugador
  información que no debería ver").
- Nada del análisis depende de fuentes externas de audio; §10 las deja fuera de
  forma permanente.

---

## 5. Corrección a REGLAS §8

La línea de §8 (multiplayer):

> Los timers de fase mapean sobre el orquestador existente (`setTimeout`,
> `GRACIA_MS`, `ProgramadorResiliente`).

es **optimista** y conviene corregirla antes de S4:

- `GRACIA_MS` (`orquestador.ts:68`) es la ventana de desconexión de un jugador;
  no tiene relación con fases de juego.
- `ProgramadorResiliente` **todavía no existe**. Solo aparece mencionado en
  `PORT_ANDROID.md:62,151` y `MEDICION_RELOJ_ANDROID.md` como trabajo futuro
  dependiente de la Sesión 1c (medición de throttling en Android). Como v1 es
  solo-Windows, no bloquea nada, pero no se puede "mapear sobre" algo inexistente.

Lo que **sí** existe y sí sirve es el seam inyectable
`OpcionesOrquestador.programar` (`orquestador.ts:20-25,42`), que ya usan tanto
+Turbo como la ventana de gracia, y que permite tests deterministas del reloj de
fases sin esperar tiempo real.

---

## 6. Qué condiciona esto en S1

1. La máquina de fases del núcleo recibe el tiempo como **entrada** (reloj
   inyectado), nunca lo consulta.
2. El núcleo expone la fase actual y su duración de forma que un futuro
   `faseTemporizada` pueda derivar `{clave, duracionMs}` sin lógica adicional en
   el servidor.
3. El avance de ronda **no** usa `esperandoContinuar`/`continuar` (queda en false
   / no-op, como Mentiroso y UNO): las rondas avanzan dentro de la expiración de
   la fase "tabla de puntos".
4. La proyección por jugador debe ocultar el título correcto hasta la fase
   revelar.

> **Nota de S1 (2026-07-21).** Al implementar el núcleo se detectó que la tabla
> de REGLAS §4 listaba *Revelar* **antes** de *Votación*, lo que hacía trivial la
> votación. El orden quedó corregido a `precarga → clip → voto → revelar →
> puntaje` (ver la nota de corrección en REGLAS §4). El punto 4 de arriba **no
> cambia de contenido** —el título sigue oculto hasta `revelar`—, solo se mueve
> la frontera: ahora `revelar` va después del voto, que es lo que le da sentido.
