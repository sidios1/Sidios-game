# REGLAS_UNO.md — fuente de verdad

## Mazo y reparto
- 108 cartas: por color (rojo, amarillo, verde, azul) un 0, dos de cada 1–9,
  dos Skip, dos Reverse, dos +2. Más 4 Wild y 4 Wild +4.
- Mano inicial: 7 cartas por jugador. Jugadores: 2 a 10.
- Carta inicial: se voltea la cima. Si es Wild o +4, se re-voltea hasta que no
  lo sea. Si es +2, Skip o Reverse, su efecto aplica al primer jugador.

## Jugada
- Legal si matchea color, número o símbolo de la cima; los Wild siempre legales.
- Si no puedes jugar: robas UNA. Si es jugable, puedes bajarla; si no, pasa turno.
- Reverse invierte la dirección. Con 2 jugadores actúa como Skip.
- Skip salta al siguiente. Wild y +4 fijan el color activo (lo elige quien juega).

## Acumulación de "+" (regla de casa de esta plataforma)
- Los "+" se acumulan SIN LÍMITE y SIN distinción de tipo: sobre un +2 o +4 se
  responde con cualquier +2 o +4, encadenando.
- El acumulador suma el total pendiente (+2 suma 2, +4 suma 4).
- Apilar es OPCIONAL: bajo acumulador pendiente puedes apilar otro "+" o robar
  todo el acumulado.
- Quien roba el acumulado pierde su turno; sigue el siguiente en la dirección actual.
- El color activo lo fija el último "+" de la cadena.
- El +4 es jugable en cualquier momento. No hay desafío al +4 en esta versión.

## Fin de ronda y puntaje
- Termina cuando un jugador se queda sin cartas.
- El ganador suma el valor de las cartas en las manos rivales:
  - Números: valor nominal. Skip/Reverse/+2: 20 c/u. Wild/+4: 50 c/u.
- El match se juega a 500 puntos. [Capa posterior, no v1.]

## Fuera de alcance en la primera versión
- Canto de "UNO!" y su penalización: NO implementado.
- Desafío al +4: NO implementado.