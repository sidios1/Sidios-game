# SPIKE_DATOS_JUGADORES.md — mini-spike de la fuente de datos

> Resuelve el pendiente #8 de `SPIKE_MONOPOLY_ULTIMATE_TEAM.md` (fuente de datos de jugadores reales por liga/posición).

## 1. Fuente

Archivo `jugadores_monopoly.json` provisto por Pablo. Scrapeado de `futmind.com/players`
(sitio fan-made que republica datos y cartas de **EA Sports FC 26 Ultimate Team**).

- **4200 jugadores**, generado 2026-08-14.
- Filtrado previo aplicado por la fuente: excluye calidades `bronze`/`silver_common` — el
  dataset ya viene sesgado hacia jugadores de calidad media-alta.
- Campos relevantes: `nombreCompleto`, `rating` (65-95 en este dataset), `posicion` +
  `posicionesPosibles`, `liga`, `nacion`, `club`, `calidad` (`Rare`/`Icon`),
  `imagenJugadorUrl`/`imagenCartaUrl` (hotlink a assets de EA re-hosteados por futmind.com).

## 2. Nota de licencia (no es asesoría legal)

Los nombres de liga vienen tal como aparecen patrocinados **dentro del juego** ("LALIGA EA
SPORTS", "Ligue 1 McDonald's", "Serie A Enilive"), el sistema de rareza (`calidad: "Icon"`,
`rareflag`) es propio de EA FC Ultimate Team, y las imágenes están hotlinkeadas a assets de
EA re-hosteados por un tercero. Para uso privado entre amigos el riesgo es bajo, pero si en
algún momento se usan las imágenes directamente o el proyecto se distribuye más ampliamente,
vale la pena revisarlo con más cuidado — especialmente evitar servir las URLs de imagen
directamente desde el cliente.

## 3. Hallazgo — Brasil no es un bug de scraping

Se confirmó por búsqueda externa: **EA FC 26 no tiene el Brasileirão licenciado como liga
completa**. Bajo la "Lei Pelé" brasileña, EA necesita negociar derechos de imagen jugador por
jugador en vez de un acuerdo colectivo con la liga, lo que ha mantenido al Brasileirão fuera
del juego por años (conversaciones en curso, sin fecha confirmada). Algunos clubes brasileños
aparecen solo vía Libertadores/Sudamericana, con plantillas mayormente genéricas.

Esto significa que **ningún otro dataset de EA FC va a traer Brasil** — no es cuestión de
cambiar de fuente de scraping, es una ausencia real en el juego origen.

## 4. Cobertura por liga (dataset completo, 47 ligas distintas)

| Liga del reglamento original | Jugadores encontrados |
|---|---|
| Chile ("Liga Chile") | **2** |
| Brasil (Brasileirão) | **0** (no existe en el dataset) |
| Argentina ("Liga Profesional de Fútbol") | 276 |
| Premier League | 254 |
| La Liga ("LALIGA EA SPORTS") | 236 |
| Bundesliga | 226 |
| Ligue 1 ("Ligue 1 McDonald's") | 201 |
| Serie A ("Serie A Enilive", Italia) | 280 |

Los 179 jugadores con nacionalidad brasileña del dataset juegan todos en **otras** ligas
(Portugal, Premier League, China, Turquía, Arabia Saudita, etc.) — ninguno en el Brasileirão.

## 5. Decisión: reemplazo de ligas

Chile, Argentina y Brasil se reemplazan por las 3 ligas con mejor cobertura disponibles en
el dataset (decisión de Pablo):

| Slot original | Liga nueva | Jugadores disponibles |
|---|---|---|
| Chile (más barata) | **MLS** | 189 |
| Argentina | **Arabia Saudita** (ROSHN Saudi League) | 129 |
| Brasil | **Liga Portugal** | 136 |

Orden de precio confirmado por Pablo: MLS → Arabia Saudita → Liga Portugal.

Ligas finales del tablero (más barata → más cara):
**MLS → Arabia Saudita → Liga Portugal → Ligue 1 → Bundesliga → Serie A → La Liga → Premier League**

## 6. Mapeo de posiciones (dataset → reglamento)

El dataset usa nomenclatura EA FC estándar (`GK, CB, RB, LB, CDM, CM, CAM, LM, RM, LW, RW,
ST`), distinta a los 11 labels del 4-3-3 del reglamento (`POR-LD-DFC-DFC-LI-MC-MCO-MC-ED-DC-EI`).

| Reglamento | Dataset |
|---|---|
| POR | GK |
| LD | RB |
| DFC (×2) | CB |
| LI | LB |
| MC (×2) | **CM** (ambos slots — ratificado, no se reparte con CDM) |
| MCO | CAM |
| ED | **RW** (extremo puro, decidido) |
| DC | ST |
| EI | **LW** (extremo puro, decidido) |

Las cartas con posición **CDM, LM o RM** del dataset ya no entran al pool de sobres en
absoluto (filtro de elegibilidad, `REGLAS_MONOPOLY_ULTIMATE_TEAM.md` sección 3) — un jugador
solo puede salir si su posición principal o secundaria coincide con alguna de las 9 que usa
la formación. Solo llegan a "Mi Club" si tienen alguna de esas 9 como posición secundaria.

## 7. Resuelto para la próxima sesión de implementación

- Fuente de datos: `jugadores_monopoly.json` (4200 jugadores, EA FC 26 vía futmind.com).
- "Mejor jugador" = campo `rating` (65-95 en este dataset).
- Las 8 ligas y su orden de precio.
- Mapeo completo de posiciones dataset → reglamento.

## 8. Técnicos

Archivo `datos/tecnicos_monopoly.json` en el repo (curado a partir del scrape de
`fctoolshub.com/database/fc25/managers` — otra fuente distinta a la de jugadores, assets
hosteados en `generacion-fut.ams3.cdn.digitaloceanspaces.com`).

- **27 técnicos** (se eliminaron los 3 sin `imagenUrl`: Graham Potter, Diego Martínez,
  Patrick Vieira) — **los 27 restantes tienen imagen**, dataset limpio y completo.
- Filtro aplicado por la fuente: solo 5 ligas grandes de Europa + `real_face: 1` (con rostro
  real escaneado) + género masculino.
- **Pool plano, no atado a liga por celda** — coherente con el reglamento (`REGLAS_MONOPOLY_ULTIMATE_TEAM.md`
  sección 2: "Servicios → Técnicos — sobre da un técnico random"), así que la distribución
  desigual entre ligas no es un problema estructural.
- Distribución tras la limpieza: Premier League 14, LaLiga 8, Serie A 4, Ligue 1 1,
  **Bundesliga 0** (el filtro la incluía pero la fuente no tenía managers con `real_face`
  ahí al momento del scrape).
- Campos: `nombreCompleto` + `nombreComun` (preferir `nombreComun` para mostrar cuando no
  sea `null`, ej. "Josep Guardiola i Sala" → "Pep Guardiola"), `nacion`, `club`, `liga`,
  `altura`, `peso`, `imagenUrl`.
- Nota de Pablo para la sesión de render 2D (no se resuelve acá): fondo de carta estilo "dorada"
  para los técnicos.

**Resuelto:** fuente de datos de técnicos confirmada y limpia (27, pool plano, todos con
imagen, suficiente para las 2 celdas de Servicios). **Pendiente menor:** ampliar cobertura
de Bundesliga si se quiere más variedad — no bloqueante.

## 9. Clubes (ficha del jugador)

Archivo `datos/clubes_monopoly.json` en el repo (scrapeado de
`fctoolshub.com/database/fc25/clubs`, misma fuente/CDN que los técnicos).

- **207 clubes** en 10 ligas — incluye las 8 principales del tablero **más 2 extra**
  (Argentina "Liga Profesional de Fútbol": 28 clubes, y Eredivisie: 18 clubes) que no forman
  parte de las 8 ligas del tablero tras el reemplazo de Chile/Argentina/Brasil. No es un
  problema: la elección de club es puramente cosmética (ficha), no está atada a las ligas
  del tablero ni a la economía de sobres, así que no hace falta filtrarlas.
- Campos: `nombre`, `nombreOficial`, `liga`, `nacion`, `imagenClaraUrl` / `imagenOscuraUrl`
  (logo en versión clara y oscura — útil directo para modo claro/oscuro de la UI). Sin campo
  de precio (coherente con que la elección es gratuita).
- Mecánica (sección 1.1 del reglamento): cada jugador elige un club gratis como ficha antes
  de empezar, sin efecto de juego. Duplicados resueltos por orden de turno.

**Resuelto:** fuente de datos de clubes confirmada (207, con logo claro/oscuro), suficiente
para que cada jugador de una partida (típicamente 2-6) elija sin problema de disponibilidad.

## 10. Tiers y probabilidades — resuelto

Se descartó usar umbrales de `rating` fijos tras verificar la data real: con `Raro>85`,
`Normal 80-85`, `Malo<80`, **Arabia Saudita y Liga Portugal no tienen ningún jugador "Raro"**,
y MLS solo tiene 1 Raro y 3 Normal en total — las probabilidades pedidas (25% Raro, etc.)
eran matemáticamente insostenibles con umbrales fijos en esas ligas.

**Solución:** tiers relativos por percentil, calculados de forma independiente para cada pool
(cada liga y Resto del Mundo por separado) en vez de un valor de rating fijo global. Esto
garantiza que las probabilidades siempre son sostenibles sin importar la calidad real de
cada liga en el dataset. Detalle completo en `REGLAS_MONOPOLY_ULTIMATE_TEAM.md` sección 3.2.

Con esto, **todos los pendientes de datos quedan resueltos.**
