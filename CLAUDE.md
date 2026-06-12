# CLAUDE.md — Plataforma de juegos de cartas multijugador

Guía del proyecto para Claude Code. Léela completa antes de tocar código.

## Documentos clave
- `PLAN.md` — fases del proyecto. Cada sesión implementa UNA fase.
- `REGLAS_CARIOCA.md` — **única fuente de verdad** del reglamento de Carioca.
  Su sección 9 define los contratos como datos (`MANOS`, `VALOR_PUNTOS`, `ESCALA`).

## Stack
| Capa | Tecnología | Paquete |
|------|------------|---------|
| Lógica de juego | TypeScript puro + Vitest | `packages/carioca-core` |
| Servidor | Orquestador autoritativo + transporte intercambiable (adaptador LAN con `ws`) | `packages/server` |
| Cliente | Tauri + Three.js (Fases 3 y 5) | `packages/client` |

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
    └── client/           (Tauri + Three.js)
```

## Comandos
```bash
npm install        # instala todo el monorepo (desde la raíz)
npm run build      # tsc -b: compila los 3 paquetes
npm test           # vitest en carioca-core y server
```

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
  para tests y para el host embebido (Fase 5).
- El modo online (Fase 7) será OTRO adaptador de las mismas interfaces:
  no se toca orquestador, core, hub ni juegos.

### 4. Dependencias permitidas entre paquetes
```
client ──> carioca-core (solo tipos/validaciones de presentación)
client ──> server (solo protocolo, vista e interfaz TransporteCliente)
server ──> carioca-core
carioca-core ──> (nada)
```

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
- ❌ Enviar a un jugador información que no debería ver (manos ajenas, mazo).
- ❌ Cambiar reglas del juego editando código: si una regla cambia, se edita
  REGLAS_CARIOCA.md primero y el código la sigue.
- ❌ Implementar más allá de la fase en curso (ver PLAN.md).
- ❌ Avanzar de fase con tests en rojo o errores de `tsc`.
