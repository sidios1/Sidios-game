# SPIKE_UNO.md — ¿Aguanta la abstracción de turnos a UNO?

Sesión exploratoria. Cero código de producción: este documento es el único
entregable. Objetivo: decidir si `MotorJuego`/`IJuego` y el orquestador soportan
las mecánicas anómalas de UNO (Reverse, Skip, +2/+4 acumulables sin límite) **sin
tocar Carioca, Mentiroso ni `MotorJuego`**.

## Resumen ejecutivo

El orquestador (`packages/server/src/orquestador.ts`) **nunca** calcula el
siguiente jugador: sólo consulta `motor.jugadorEnTurno(estado)` y, para ausentes,
`motor.saltarTurno(estado, jugadorId)`. Todo el cálculo del turno (incluida la
dirección y los saltos) vive enteramente en el *core* de cada juego, dentro del
estado opaco `E` que el orquestador transporta sin inspeccionar.

Consecuencia: Reverse, Skip, robo forzado, acciones restringidas y el acumulador
de "+" son **lógica interna del core de UNO** y **no requieren cambios en
`MotorJuego` ni en el orquestador**. Lo único que se toca son las mismas costuras
*aditivas* que ya usó Mentiroso (la unión de vistas, el registro de motores y el
catálogo del cliente).

---

## Punto 1 — ¿Cómo se calcula hoy el "siguiente jugador"? ¿Hardcodeado o configurable?

**Qué existe:** hardcodeado como `(idx + 1) % jugadores.length`, **dentro de cada
core**, sin estado de dirección y sin nada configurable. Rotación monótona hacia
adelante:

- Carioca: `packages/carioca-core/src/partida.ts:558` (al final de `descartar`) y
  `:589` (en `pasarTurno`).
- Mentiroso: `packages/mentiroso-core/src/partida.ts:83-85` (`siguienteJugador`).

**Clave:** ese cálculo es 100 % interno al core. Ni el motor ni el orquestador lo
ven; el orquestador sólo lee el resultado vía `motor.jugadorEnTurno(estado)`
(`motorCarioca.ts:157`, `motorMentiroso.ts:123`).

**Qué falta:** nada en la abstracción. La dirección no existe hoy porque ningún
juego la necesitó, no porque el contrato la prohíba.

**Mínima generalización:** ninguna fuera del core nuevo. El core de UNO guarda su
propia dirección en `EstadoUno` y computa el siguiente como quiera.

---

## Punto 2 — ¿Puede un juego invertir la dirección o saltar jugadores a través de la abstracción, o eso vive en el orquestador?

**Qué existe:** vive en el core, y la abstracción ya lo permite plenamente.
`jugadorEnTurno(estado)` devuelve a quien el core decida; **no hay supuesto de
adyacencia**. Precedente real: en Mentiroso, `acusar` fija el turno en un jugador
**no adyacente** (`quienRecoge`, `mentiroso-core/src/partida.ts:255`). Es decir, el
contrato ya tolera "el siguiente turno es un jugador arbitrario".

**Qué falta:** nada. Reverse = invertir un flag de dirección en `EstadoUno`; Skip =
avanzar dos posiciones en lugar de una. Ambos son aritmética interna del core de
UNO; el orquestador no se entera.

**Mínima generalización:** ninguna. El orquestador es agnóstico al orden de turno.

---

## Punto 3 — ¿Puede un turno producir efectos sobre OTRO jugador (forzar robo / saltarlo)?

**Qué existe:** sí. La firma `aplicarAccion(estado, jugadorId, accion):
Resultado<E>` (`motor.ts:51`) devuelve un `E` **completo y nuevo**; el core es
libre de mutar la mano de cualquier jugador en ese estado nuevo. Precedente: en
Mentiroso `acusar`, el que recoge (otro jugador) carga el pozo.

Para UNO: el +2/+4 = agregar cartas a la mano de otro jugador en el estado nuevo;
Skip = el core adelanta `jugadorEnTurno` saltándose a alguien.

**Qué falta:** nada en la abstracción.

**Mínima generalización:** ninguna.

---

## Punto 4 — ¿La abstracción permite restringir las acciones legales de un turno (p. ej. "solo apilar un + o robar el acumulado")?

**Qué existe (lado autoritativo):** sí. `aplicarAccion` valida y devuelve
`fallo`/`ErrorMotor` ante cualquier acción ilegal (el orquestador lo traduce a un
mensaje de error, `orquestador.ts:370-374`). El core de UNO rechaza todo lo que no
sea "apilar +" o "robar el acumulado" mientras haya un acumulador pendiente. El
servidor ya es la única autoridad de reglas.

**Qué falta (matiz, NO en `MotorJuego`):** que el **cliente** sepa qué ofrecer en
el HUD. Hoy esa información viaja por la **vista**: Carioca lo resuelve con su
`maquinaInteraccion` leyendo la `VistaPartida` (las acciones legales son cortesía
de UI; el servidor revalida). UNO debe exponer en su `VistaUno` el acumulador
pendiente y las acciones legales, para que su HUD muestre sólo "apilar / robar N".
Es trabajo de la vista de UNO, no de la abstracción.

**Mínima generalización:** añadir `VistaUno` a la unión `VistaJuego` en
`packages/server/src/vistaJuego.ts` — cambio *aditivo*, idéntico al que introdujo
`VistaMentiroso`.

---

## Punto 5 — ¿Hay hook para un estado tipo "acumulador de +N pendiente" que persiste entre turnos?

**Qué existe:** sí, implícito. El orquestador guarda `this.estado: E` y lo pasa
intacto entre llamadas (`orquestador.ts:91` y `:375`). `E` es totalmente opaco, así
que `EstadoUno` puede llevar `acumuladoPendiente: number` (más el color/valor de la
carta actual y la dirección) y persiste por sí solo entre turnos.

**Qué falta:** nada; no se necesita un hook dedicado. La persistencia de estado
arbitrario entre acciones ya es la semántica de `E`.

**Mínima generalización:** ninguna.

---

## Punto extra — Aleatoriedad dentro de `aplicarAccion` (la única fricción real)

UNO necesita RNG en mitad de una jugada: elegir/validar el color tras un comodín
+4 y, sobre todo, rebarajar el pozo cuando el mazo se agota. Pero
`aplicarAccion(estado, jugadorId, accion)` **no recibe `rng`** (sólo `crear` y
`continuar` lo reciben, `motor.ts:43,64`).

Mentiroso ya resolvió esto **sin tocar la interfaz**: su `acusar` también necesita
rng y lo **captura** del último `crear`/`continuar` en una clausura del motor
(`motorMentiroso.ts:49-50`, comentario líneas 8-11). UNO reusa ese patrón → cero
cambios de firma. (Si en el futuro se quiere algo más limpio, la opción mínima y
aditiva sería un parámetro `rng` opcional en `aplicarAccion`; pero para "no tocar
Carioca ni Mentiroso", capturar el rng es la ruta de cero modificaciones.)

---

## `saltarTurno` de un ausente — el único punto que UNO debe satisfacer con cuidado

Cuando un jugador está ausente o suspendido, el orquestador llama
`motor.saltarTurno(estado, jugadorId)` (`orquestador.ts:469`). Para UNO ese salto
debe (a) respetar la dirección actual y (b) resolver el acumulador pendiente si el
ausente era justo quien debía apilar o robar (definir la política: típicamente,
robar el acumulado y pasar). Todo eso es implementable dentro del `saltarTurno` del
core/motor de UNO: la firma ya entrega el estado completo y devuelve el estado
completo. **Sin cambio de firma.** Es la pieza a diseñar con cuidado en la Sesión
2, pero no rompe la abstracción.

---

## Recomendación concreta para la Sesión 2

**No extender la superficie de turnos de `MotorJuego`.** No hace falta: dirección,
skip, efectos sobre otros, restricción de acciones legales y acumulador de "+" ya
caben tras `aplicarAccion` / `jugadorEnTurno` / `saltarTurno` como estado opaco del
core.

Construir UNO como módulos nuevos, con ediciones **sólo aditivas** en las costuras
ya probadas por Mentiroso:

1. **Nuevo paquete `packages/uno-core`** (lógica pura + Vitest): `EstadoUno` con
   `direccion`, `acumuladoPendiente` y la carta actual; transiciones que computan
   el siguiente jugador según dirección/skip y aplican el robo forzado. Sin
   dependencias de runtime (regla 1 de CLAUDE.md).
2. **Nuevo `packages/server/src/juegos/uno/`**: motor
   `MotorJuego<EstadoUno, AccionUno>` + `VistaUno`, espejo de `motorMentiroso.ts`;
   con captura de `rng` para el +4 / rebaraje.
3. **Aditivo:** añadir `VistaUno` a la unión en `packages/server/src/vistaJuego.ts`.
4. **Aditivo:** una entrada `uno: crearMotorUno()` en `registroMotores.ts:34`.
5. **Cliente:** `DefinicionJuego` + `IJuego` de UNO en su catálogo
   (`packages/client/src/juegos/uno/`), sin tocar el hub (regla: el hub sólo habla
   con `IJuego`).

Cero modificaciones a Carioca, Mentiroso ni `MotorJuego`. Cero regresiones.

---

## Cierre

Archivos leídos: `packages/server/src/motor.ts`,
`packages/client/src/juego/ijuego.ts`, `packages/server/src/orquestador.ts`,
`packages/server/src/registroMotores.ts`,
`packages/server/src/juegos/carioca/motorCarioca.ts`,
`packages/server/src/juegos/mentiroso/motorMentiroso.ts`,
`packages/carioca-core/src/partida.ts`,
`packages/mentiroso-core/src/partida.ts`. **No se modificó código de producción.**
