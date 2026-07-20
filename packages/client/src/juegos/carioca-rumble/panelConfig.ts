// Panel de configuración de Rumble en el lobby (REGLAS_RUMBLE.md §6). Implementa
// la interfaz genérica PanelConfigLobby: el coordinador/PantallaConexion no
// conocen Rumble, solo esta forma. Reusa el SCHEMA y la VALIDACIÓN de
// @juegos/rumble-core (no se duplican reglas — CLAUDE.md): cada control escribe en
// una ConfigRumble inmutable y dispara `alCambiar` para difundirla por
// `actualizarConfig`. La validación cruzada §6 es cortesía; el host revalida.

import type {
  ConfigPreset,
  ConfigRondas,
  ConfigRumble,
  GrupoHabilidad,
  HabilidadId,
  TierHabilidad,
} from "@juegos/rumble-core";
import {
  CONFIG_DEFAULT,
  HABILIDADES,
  HABILIDADES_POR_JUGADOR_MAX,
  HABILIDADES_POR_JUGADOR_MIN,
  parsearConfigRumble,
  TODAS_LAS_IDS,
  validarConfigRumble,
} from "@juegos/rumble-core";
import type { PanelConfigLobby } from "../../juego/configLobby.js";

const GRUPOS: readonly { readonly id: GrupoHabilidad; readonly nombre: string }[] = [
  { id: "general", nombre: "General" },
  { id: "primeros3Turnos", nombre: "Primeros 3 turnos" },
  { id: "dobleFilo", nombre: "Doble filo" },
];

const MANOS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export class PanelConfigRumble implements PanelConfigLobby {
  private config: ConfigRumble = CONFIG_DEFAULT;

  constructor(private readonly alCambiar: (valor: Record<string, unknown>) => void) {}

  valorActual(): Record<string, unknown> {
    return aOpaco(this.config);
  }

  fijarValor(valor: Record<string, unknown>): void {
    const parseada = parsearConfigRumble(valor);
    if (parseada !== null) this.config = parseada;
  }

  bloqueoInicio(numJugadores: number): string | null {
    const r = validarConfigRumble(this.config, numJugadores);
    return r.valida ? null : r.motivo;
  }

  render(esAnfitrion: boolean, numJugadores: number): HTMLElement {
    const raiz = document.createElement("div");
    raiz.className = "config-rumble";
    const soloLectura = !esAnfitrion;

    const titulo = document.createElement("h2");
    titulo.className = "config-rumble-titulo";
    titulo.textContent = esAnfitrion ? "Configuración de Rumble" : "Configuración (solo el anfitrión edita)";
    raiz.appendChild(titulo);

    // §6.1 — habilidades por jugador
    raiz.appendChild(
      this.fila(
        "Habilidades por jugador",
        this.selectNumero(
          this.config.habilidadesPorJugador,
          rango(HABILIDADES_POR_JUGADOR_MIN, HABILIDADES_POR_JUGADOR_MAX),
          soloLectura,
          (n) => this.emitir({ ...this.config, habilidadesPorJugador: n }),
        ),
      ),
    );

    // §6.2 — rondas
    raiz.appendChild(this.filaRondas(soloLectura));

    // §6.4 — preset de pesos
    raiz.appendChild(this.filaPreset(soloLectura));

    // §6.5 — reasignación
    raiz.appendChild(
      this.fila(
        "Reasignación",
        this.selectOpciones(
          this.config.reasignacion,
          [
            ["porRonda", "Por ronda"],
            ["fijas", "Fijas toda la partida"],
          ],
          soloLectura,
          (v) => this.emitir({ ...this.config, reasignacion: v }),
        ),
      ),
    );

    // §6.6 — repetición entre rondas
    raiz.appendChild(
      this.fila(
        "Repetición entre rondas",
        this.selectOpciones(
          this.config.repeticion,
          [
            ["permitir", "Permitir"],
            ["excluirUltima", "Excluir la última recibida"],
          ],
          soloLectura,
          (v) => this.emitir({ ...this.config, repeticion: v }),
        ),
      ),
    );

    // §6.6 — colisión en la misma ronda
    raiz.appendChild(
      this.fila(
        "Colisión en la ronda",
        this.selectOpciones(
          this.config.colision,
          [
            ["permitirDuplicados", "Permitir duplicados"],
            ["unicasPorRonda", "Únicas por ronda"],
          ],
          soloLectura,
          (v) => this.emitir({ ...this.config, colision: v }),
        ),
      ),
    );

    // §6.7 — penalización de EXTRA
    raiz.appendChild(
      this.fila(
        "Penalización de EXTRA",
        this.selectOpciones(
          this.config.penalizacionExtra,
          [
            ["descartar2", "Descartar 2 cartas"],
            ["perderTurno", "Perder el próximo turno"],
            ["aleatorio", "Aleatorio"],
          ],
          soloLectura,
          (v) => this.emitir({ ...this.config, penalizacionExtra: v }),
        ),
      ),
    );

    // §6.8 — visibilidad
    raiz.appendChild(
      this.fila(
        "Visibilidad de habilidades",
        this.selectOpciones(
          this.config.visibilidad,
          [
            ["secreta", "Secreta (solo la tuya)"],
            ["publica", "Pública (todos ven)"],
          ],
          soloLectura,
          (v) => this.emitir({ ...this.config, visibilidad: v }),
        ),
      ),
    );

    // §6.3 — pool de habilidades activas (toggles por grupo + individuales)
    raiz.appendChild(this.filaPool(soloLectura));

    return raiz;
  }

  // ── Construcción de config nueva + emisión ──────────────────────────────

  private emitir(nueva: ConfigRumble): void {
    this.config = nueva;
    this.alCambiar(aOpaco(nueva));
  }

  // ── Controles compuestos ────────────────────────────────────────────────

  /** §6.2: select del tipo de rondas + controles dependientes. */
  private filaRondas(soloLectura: boolean): HTMLElement {
    const rondas = this.config.rondas;
    const contenedor = document.createElement("div");
    contenedor.className = "config-rumble-bloque";
    contenedor.appendChild(
      this.fila(
        "Rondas a jugar",
        this.selectOpciones<ConfigRondas["tipo"]>(
          rondas.tipo,
          [
            ["completa", "Completa (9 manos)"],
            ["corta", "Corta (primeras N)"],
            ["subconjunto", "Subconjunto (elegir manos)"],
          ],
          soloLectura,
          (tipo) => this.emitir({ ...this.config, rondas: rondasPorDefecto(tipo) }),
        ),
      ),
    );
    if (rondas.tipo === "corta") {
      contenedor.appendChild(
        this.fila(
          "Cantidad de manos",
          this.selectNumero(rondas.n, rango(1, 9), soloLectura, (n) =>
            this.emitir({ ...this.config, rondas: { tipo: "corta", n } }),
          ),
        ),
      );
    } else if (rondas.tipo === "subconjunto") {
      contenedor.appendChild(
        this.multiManos(rondas.manos, soloLectura, (manos) =>
          this.emitir({ ...this.config, rondas: { tipo: "subconjunto", manos } }),
        ),
      );
    }
    return contenedor;
  }

  /** §6.4: preset de pesos + pesos manuales si "personalizado". */
  private filaPreset(soloLectura: boolean): HTMLElement {
    const preset = this.config.presetPesos;
    const contenedor = document.createElement("div");
    contenedor.className = "config-rumble-bloque";
    contenedor.appendChild(
      this.fila(
        "Preset de pesos",
        this.selectOpciones<ConfigPreset["tipo"]>(
          preset.tipo,
          [
            ["equilibrado", "Equilibrado (1/3/6)"],
            ["caos", "Caos (uniforme)"],
            ["personalizado", "Personalizado"],
          ],
          soloLectura,
          (tipo) => this.emitir({ ...this.config, presetPesos: presetPorDefecto(tipo) }),
        ),
      ),
    );
    if (preset.tipo === "personalizado") {
      const pesos = preset.pesos;
      const tiers: readonly [TierHabilidad, string][] = [
        ["alto", "Alto impacto"],
        ["medio", "Impacto medio"],
        ["utilidad", "Utilidad / info"],
      ];
      for (const [tier, etiqueta] of tiers) {
        contenedor.appendChild(
          this.fila(
            etiqueta,
            this.inputPeso(pesos[tier], soloLectura, (valor) =>
              this.emitir({
                ...this.config,
                presetPesos: { tipo: "personalizado", pesos: { ...pesos, [tier]: valor } },
              }),
            ),
          ),
        );
      }
    }
    return contenedor;
  }

  /** §6.3: por cada grupo, un toggle de grupo + un checkbox por habilidad. */
  private filaPool(soloLectura: boolean): HTMLElement {
    const activas = new Set<HabilidadId>(this.config.poolActivo);
    const contenedor = document.createElement("div");
    contenedor.className = "config-rumble-bloque";
    const titulo = document.createElement("h3");
    titulo.className = "config-rumble-subtitulo";
    titulo.textContent = "Habilidades activas";
    contenedor.appendChild(titulo);

    for (const grupo of GRUPOS) {
      const delGrupo = HABILIDADES.filter((h) => h.grupo === grupo.id);
      const todasActivas = delGrupo.every((h) => activas.has(h.id));

      const cabecera = document.createElement("label");
      cabecera.className = "config-rumble-grupo";
      const chkGrupo = document.createElement("input");
      chkGrupo.type = "checkbox";
      chkGrupo.checked = todasActivas;
      chkGrupo.disabled = soloLectura;
      chkGrupo.addEventListener("change", () => {
        const proximas = new Set(activas);
        for (const h of delGrupo) {
          if (chkGrupo.checked) proximas.add(h.id);
          else proximas.delete(h.id);
        }
        this.emitir({ ...this.config, poolActivo: idsEnOrden(proximas) });
      });
      const nombreGrupo = document.createElement("span");
      nombreGrupo.textContent = grupo.nombre;
      cabecera.append(chkGrupo, nombreGrupo);
      contenedor.appendChild(cabecera);

      const lista = document.createElement("div");
      lista.className = "config-rumble-habilidades";
      for (const h of delGrupo) {
        const item = document.createElement("label");
        item.className = "config-rumble-habilidad";
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = activas.has(h.id);
        chk.disabled = soloLectura;
        chk.addEventListener("change", () => {
          const proximas = new Set(activas);
          if (chk.checked) proximas.add(h.id);
          else proximas.delete(h.id);
          this.emitir({ ...this.config, poolActivo: idsEnOrden(proximas) });
        });
        const nombre = document.createElement("span");
        nombre.textContent = h.nombre;
        item.append(chk, nombre);
        lista.appendChild(item);
      }
      contenedor.appendChild(lista);
    }
    return contenedor;
  }

  // ── Controles primitivos ────────────────────────────────────────────────

  private fila(etiqueta: string, control: HTMLElement): HTMLElement {
    const fila = document.createElement("label");
    fila.className = "config-rumble-fila";
    const texto = document.createElement("span");
    texto.className = "config-rumble-etiqueta";
    texto.textContent = etiqueta;
    fila.append(texto, control);
    return fila;
  }

  private selectNumero(
    valor: number,
    opciones: readonly number[],
    soloLectura: boolean,
    alElegir: (n: number) => void,
  ): HTMLSelectElement {
    return this.selectOpciones(
      valor,
      opciones.map((n) => [n, String(n)] as const),
      soloLectura,
      alElegir,
    );
  }

  private selectOpciones<T extends string | number>(
    valor: T,
    opciones: readonly (readonly [T, string])[],
    soloLectura: boolean,
    alElegir: (v: T) => void,
  ): HTMLSelectElement {
    const select = document.createElement("select");
    select.disabled = soloLectura;
    for (const [v, etiqueta] of opciones) {
      const opcion = document.createElement("option");
      opcion.value = String(v);
      opcion.textContent = etiqueta;
      opcion.selected = v === valor;
      select.appendChild(opcion);
    }
    select.addEventListener("change", () => {
      const elegido = opciones.find(([v]) => String(v) === select.value);
      if (elegido !== undefined) alElegir(elegido[0]);
    });
    return select;
  }

  private inputPeso(
    valor: number,
    soloLectura: boolean,
    alCambiar: (n: number) => void,
  ): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = String(valor);
    input.disabled = soloLectura;
    input.addEventListener("change", () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) alCambiar(n);
    });
    return input;
  }

  private multiManos(
    seleccionadas: readonly number[],
    soloLectura: boolean,
    alCambiar: (manos: readonly number[]) => void,
  ): HTMLElement {
    const activas = new Set<number>(seleccionadas);
    const contenedor = document.createElement("div");
    contenedor.className = "config-rumble-manos";
    for (const mano of MANOS) {
      const item = document.createElement("label");
      item.className = "config-rumble-mano";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = activas.has(mano);
      chk.disabled = soloLectura;
      chk.addEventListener("change", () => {
        const proximas = new Set(activas);
        if (chk.checked) proximas.add(mano);
        else proximas.delete(mano);
        alCambiar(MANOS.filter((m) => proximas.has(m)));
      });
      const nombre = document.createElement("span");
      nombre.textContent = `Mano ${mano}`;
      item.append(chk, nombre);
      contenedor.appendChild(item);
    }
    return contenedor;
  }
}

// ── Helpers puros ──────────────────────────────────────────────────────────

/** La ConfigRumble es JSON-serializable: se ensancha al blob opaco del protocolo. */
function aOpaco(config: ConfigRumble): Record<string, unknown> {
  return { ...config };
}

function rango(min: number, max: number): number[] {
  const salida: number[] = [];
  for (let n = min; n <= max; n++) salida.push(n);
  return salida;
}

/** Mantiene el pool en el orden estable del catálogo (§9). */
function idsEnOrden(activas: ReadonlySet<HabilidadId>): readonly HabilidadId[] {
  return TODAS_LAS_IDS.filter((id) => activas.has(id));
}

function rondasPorDefecto(tipo: ConfigRondas["tipo"]): ConfigRondas {
  switch (tipo) {
    case "completa":
      return { tipo: "completa" };
    case "corta":
      return { tipo: "corta", n: 5 };
    case "subconjunto":
      return { tipo: "subconjunto", manos: [...MANOS] };
  }
}

function presetPorDefecto(tipo: ConfigPreset["tipo"]): ConfigPreset {
  switch (tipo) {
    case "equilibrado":
      return { tipo: "equilibrado" };
    case "caos":
      return { tipo: "caos" };
    case "personalizado":
      return { tipo: "personalizado", pesos: { alto: 1, medio: 3, utilidad: 6 } };
  }
}
