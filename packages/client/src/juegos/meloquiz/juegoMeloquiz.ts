// MeloQuiz como implementación de IJuego: UI de DOM + un <audio> HTML5.
//
// La reproducción es CONSECUENCIA de la vista, nunca una decisión del cliente
// (CLAUDE.md regla 5): el servidor dice en qué fase estamos y este módulo lleva el
// reproductor a la pose que esa fase exige. No hay lógica de juego acá.
//
// Dos invariantes que rigen el archivo:
//  - El <audio> vive FUERA del subárbol que se repinta. `render()` hace
//    replaceChildren() en cada vista; si el reproductor estuviera adentro, cada
//    sincronización cortaría la canción a la mitad.
//  - Las acciones se disparan por CAMBIO de fase (`claveFase`, que es
//    `${ronda}:${fase}`), no en cada vista: el orquestador redifunde la misma fase
//    muchas veces (cada voto ajeno, cada reconexión) y no se puede reackear ni
//    reiniciar el clip en cada una.
//
// Arranque sincronizado (S4): `faseInicioMs` (el start_at absoluto en reloj del
// host) se traduce a hora local con el offset propio (`relojHost`, alimentado
// por la sync de la capa de transporte) y `planArranque` decide si programar el
// play(), sonar ya con seek adelante (reconexión a mitad de clip) u omitir.
// Todos los clientes derivan el MISMO instante físico ⇒ se escucha simultáneo.

import type {
  ClaveFase,
  JugadorVistaMeloquizSala,
  VistaMeloquizSala,
} from "@juegos/server/vistaJuego";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";
import { avatarPorDefecto, crearAvatar } from "../../perfil/avatares.js";
import { relojHost } from "../../red/relojHost.js";
import { indiceLocal } from "./indiceLocal.js";
import { planificarArranque } from "./planArranque.js";

const ROTULO_FASE: Record<ClaveFase, string> = {
  precarga: "Preparando…",
  clip: "¡Escuchá!",
  revelar: "Era…",
  voto: "¿Quién ganó?",
  puntaje: "Marcador",
  final: "Fin de la partida",
};

/** Lado del avatar en los botones de voto, en px. */
const TAM_AVATAR_VOTO = 28;

/** El avatar elegido en el lobby, o uno determinista por id (patrón del HUD). */
function avatarDe(jugador: JugadorVistaMeloquizSala): string {
  return jugador.avatar ?? avatarPorDefecto(jugador.id);
}

export class JuegoMeloquiz implements IJuego {
  private contexto: ContextoJuego | null = null;
  private raiz: HTMLElement | null = null;
  private botonSalir: HTMLButtonElement | null = null;
  private audio: HTMLAudioElement | null = null;
  private toast: HTMLElement | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  private ultimaVista: VistaMeloquizSala | null = null;
  /** Última fase ya PROCESADA (`${ronda}:${fase}`), para no repetir efectos. */
  private faseProcesada: string | null = null;
  /** Pista que el <audio> tiene cargada, para no recargarla de más. */
  private pistaCargada: string | null = null;
  /** Timer del arranque programado del clip; se cancela al cambiar de fase. */
  private timerArranque: ReturnType<typeof setTimeout> | null = null;
  /** Un play() en vuelo: evita replanes duplicados mientras el promise resuelve. */
  private arrancando = false;
  /** Gesto de respaldo si el autoplay está bloqueado (retoma el clip con seek). */
  private oyenteGesto: (() => void) | null = null;

  /** Nodo del contador; lo repone cada `render()` y lo escribe el ticker. */
  private contadorEl: HTMLElement | null = null;
  private tickerContador: ReturnType<typeof setInterval> | null = null;
  /** `performance.now()` de cuando llegó `faseMsRestantes`, y ese valor. */
  private contadorOrigenMs = 0;
  private contadorRestanteMs: number | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.contexto = contexto;

    const raiz = document.createElement("div");
    raiz.className = "meloquiz";
    contexto.contenedorHud.appendChild(raiz);
    this.raiz = raiz;

    // El reproductor va en la ESCENA (no en el HUD) y fuera de `raiz`: `render()`
    // vacía la raíz en cada vista, y recrearlo cortaría la canción a la mitad.
    const audio = document.createElement("audio");
    audio.preload = "auto";
    contexto.contenedorEscena.appendChild(audio);
    this.audio = audio;

    // Un solo ticker para toda la partida: el contador se interpola localmente
    // porque la vista solo se redifunde cuando el estado cambia, no cada segundo.
    this.tickerContador = setInterval(() => this.pintarContador(), 200);

    this.botonSalir = document.createElement("button");
    this.botonSalir.className = "salir-hub";
    this.botonSalir.textContent = "← Hub";
    this.botonSalir.addEventListener("click", () => contexto.salirAlHub());
    contexto.contenedorHud.appendChild(this.botonSalir);

    this.toast = document.createElement("div");
    this.toast.className = "meloquiz-toast";
    this.toast.style.display = "none";
    contexto.contenedorHud.appendChild(this.toast);

    // Respaldo de autoplay: si el navegador bloqueó el play() (sin gesto previo),
    // el primer toque REPLANIFICA el clip — con el seek adelante del plan, así
    // el rezagado entra en el punto exacto donde va el resto, no desde cero.
    const oyenteGesto = (): void => {
      const vista = this.ultimaVista;
      if (
        vista?.fase === "clip" &&
        this.audio?.paused === true &&
        this.timerArranque === null &&
        !this.arrancando &&
        this.pistaCargada !== null
      ) {
        this.arrancarClip(vista);
      }
    };
    this.oyenteGesto = oyenteGesto;
    document.addEventListener("pointerdown", oyenteGesto);
  }

  sincronizarEstado(vista: VistaMeloquizSala): void {
    this.ultimaVista = vista;
    // El contador se re-ancla con CADA vista, no solo al cambiar de fase: así el
    // reloj del servidor corrige cualquier deriva local (y una reconexión no
    // deja el contador desfasado). Es tiempo RELATIVO, inmune al desfase entre
    // relojes; el arranque del audio usará el absoluto en S4.
    this.contadorRestanteMs = vista.faseMsRestantes;
    this.contadorOrigenMs = performance.now();

    if (vista.claveFase !== this.faseProcesada) {
      this.faseProcesada = vista.claveFase;
      this.alEntrarEnFase(vista);
    } else if (
      vista.fase === "clip" &&
      this.audio?.paused === true &&
      this.timerArranque === null &&
      !this.arrancando &&
      this.pistaCargada !== null
    ) {
      // Reconexión a MITAD de clip: la claveFase no cambió, así que
      // alEntrarEnFase no corre. Si el audio quedó pausado y no hay arranque en
      // vuelo, se replanifica (rama yaMismo del plan, con seek adelante).
      this.arrancarClip(vista);
    }
    this.render();
  }

  procesarAccion(senal: SenalJuego): void {
    this.mostrarToast(senal.mensaje);
  }

  finalizar(): void {
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    if (this.tickerContador !== null) clearInterval(this.tickerContador);
    this.cancelarArranque();
    if (this.oyenteGesto !== null) {
      document.removeEventListener("pointerdown", this.oyenteGesto);
      this.oyenteGesto = null;
    }
    if (this.audio !== null) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load(); // suelta el blob que quedaba en el decodificador
    }
    indiceLocal.liberarUrls();
    this.raiz?.remove();
    this.audio?.remove();
    this.botonSalir?.remove();
    this.toast?.remove();
    this.raiz = null;
    this.audio = null;
    this.botonSalir = null;
    this.toast = null;
    this.toastTimeout = null;
    this.contexto = null;
    this.ultimaVista = null;
    this.faseProcesada = null;
    this.pistaCargada = null;
    this.arrancando = false;
    this.tickerContador = null;
    this.contadorEl = null;
    this.contadorRestanteMs = null;
  }

  // ── Contador de fase ────────────────────────────────────────────────────

  /**
   * Escribe los segundos que faltan en el nodo del contador. Lo llama el ticker
   * (no `render()`): repintar la UI entera cada 200 ms rearmaría los botones de
   * voto y se perdería el foco a mitad de un clic.
   */
  private pintarContador(): void {
    const nodo = this.contadorEl;
    if (nodo === null) return;
    const restante = this.restanteMs();
    nodo.textContent = restante === null ? "" : `${Math.ceil(restante / 1000)}s`;
  }

  /** Milisegundos que faltan, interpolados desde la última vista. */
  private restanteMs(): number | null {
    if (this.contadorRestanteMs === null) return null;
    const transcurrido = performance.now() - this.contadorOrigenMs;
    return Math.max(0, this.contadorRestanteMs - transcurrido);
  }

  // ── Reproductor: efectos por CAMBIO de fase ─────────────────────────────

  private alEntrarEnFase(vista: VistaMeloquizSala): void {
    // Cambió la fase: un arranque programado para la fase anterior ya no vale.
    this.cancelarArranque();
    switch (vista.fase) {
      case "precarga":
        void this.precargar(vista);
        return;
      case "clip":
        this.arrancarClip(vista);
        return;
      case "final":
        this.audio?.pause();
        return;
      // voto / revelar / puntaje: el audio sigue sonando desde donde iba (§4).
      default:
        return;
    }
  }

  /**
   * Precarga (§3.2): resolver la pista contra la carpeta PROPIA, dejarla pauseada
   * en el segundo exacto y recién ahí ackear. El ack va como AccionJuego común
   * por el sobre genérico del protocolo.
   */
  private async precargar(vista: VistaMeloquizSala): Promise<void> {
    const audio = this.audio;
    if (audio === null || vista.pistaId === null) return;

    const url = indiceLocal.urlDe(vista.pistaId);
    if (url === null) {
      // No está en su carpeta: no puede ackear. El timeout de precarga arranca
      // sin él y pierde la ronda (§3.3, §1). No se pide el archivo por red.
      this.mostrarToast("No tenés esta canción en tu carpeta: te salteás la ronda.");
      return;
    }

    if (this.pistaCargada !== vista.pistaId) {
      audio.src = url;
      this.pistaCargada = vista.pistaId;
    }
    const inicio = vista.segundoInicio ?? 0;

    try {
      await this.esperarCargado(audio);
      audio.currentTime = inicio;
      audio.pause();
    } catch {
      this.mostrarToast("No se pudo preparar el audio de esta ronda.");
      return;
    }

    // La fase pudo cambiar mientras cargaba: ackear tarde sería un accionInvalida.
    if (this.ultimaVista?.fase !== "precarga") return;
    this.contexto?.enviar({ tipo: "listoPrecarga" });
  }

  /** Resuelve cuando el audio tiene datos suficientes para sonar sin cortes. */
  private esperarCargado(audio: HTMLAudioElement): Promise<void> {
    // HAVE_ENOUGH_DATA: ya está listo (p. ej. la misma pista de una ronda previa).
    if (audio.readyState >= 4) return Promise.resolve();
    return new Promise((resolver, rechazar) => {
      const limpiar = (): void => {
        audio.removeEventListener("canplaythrough", alCargar);
        audio.removeEventListener("error", alFallar);
      };
      const alCargar = (): void => {
        limpiar();
        resolver();
      };
      const alFallar = (): void => {
        limpiar();
        rechazar(new Error("no se pudo decodificar el audio"));
      };
      audio.addEventListener("canplaythrough", alCargar);
      audio.addEventListener("error", alFallar);
      audio.load();
    });
  }

  /**
   * Arranque sincronizado (§3.4/§3.5): traduce el `faseInicioMs` del host a hora
   * local con el offset propio y sigue el plan — programar el play() para el
   * instante compartido, sonar ya con seek adelante, o nada si llegó tardísimo.
   */
  private arrancarClip(vista: VistaMeloquizSala): void {
    if (this.audio === null || this.pistaCargada === null) return;
    const plan = planificarArranque({
      faseInicioMs: vista.faseInicioMs,
      segundoInicio: vista.segundoInicio,
      duracionFaseMs: vista.duracionFaseMs,
      offsetMs: relojHost.offsetMs,
      ahoraMs: Date.now(),
    });
    switch (plan.tipo) {
      case "omitir":
        return;
      case "yaMismo":
        void this.reproducir(plan.desdeSegundo);
        return;
      case "programar":
        this.timerArranque = setTimeout(() => {
          this.timerArranque = null;
          void this.reproducir(plan.desdeSegundo);
        }, plan.esperaMs);
        return;
    }
  }

  private cancelarArranque(): void {
    if (this.timerArranque !== null) {
      clearTimeout(this.timerArranque);
      this.timerArranque = null;
    }
  }

  private async reproducir(desdeSegundo: number): Promise<void> {
    const audio = this.audio;
    if (audio === null) return;
    this.arrancando = true;
    try {
      // Clampeo contra el archivo real: un seek pasado el final no suena nada.
      const duracion = Number.isFinite(audio.duration) ? audio.duration : null;
      if (duracion !== null && desdeSegundo >= duracion) return;
      // Solo re-seekear si difiere de verdad: en el camino normal la precarga
      // ya dejó `currentTime` clavado en el segundo exacto (§3.2).
      if (Math.abs(audio.currentTime - desdeSegundo) > 0.3) {
        audio.currentTime = desdeSegundo;
      }
      await audio.play();
    } catch {
      // Autoplay bloqueado: el gesto de respaldo (pointerdown) replanifica con
      // seek, así el rezagado entra donde va el resto.
      this.mostrarToast("Tocá la pantalla para habilitar el audio.");
    } finally {
      this.arrancando = false;
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  private render(): void {
    const raiz = this.raiz;
    const vista = this.ultimaVista;
    if (raiz === null || vista === null) return;
    raiz.replaceChildren();

    raiz.appendChild(this.encabezado(vista));

    switch (vista.fase) {
      case "precarga":
        raiz.appendChild(this.panelPrecarga(vista));
        break;
      case "clip":
        raiz.appendChild(this.panelClip());
        break;
      case "revelar":
        // La respuesta ANTES de la votación (§4): el grupo juzga viéndola.
        raiz.appendChild(this.panelRevelar(vista));
        break;
      case "voto":
        raiz.appendChild(this.panelRevelar(vista));
        raiz.appendChild(this.panelVotoJugadores(vista));
        break;
      case "puntaje":
        raiz.appendChild(this.panelRevelar(vista));
        break;
      case "final":
        raiz.appendChild(this.panelFinal(vista));
        break;
    }

    raiz.appendChild(this.marcador(vista));
  }

  private encabezado(vista: VistaMeloquizSala): HTMLElement {
    const cab = document.createElement("div");
    cab.className = "meloquiz-cab";

    const titulo = document.createElement("h2");
    titulo.textContent = ROTULO_FASE[vista.fase];

    const ronda = document.createElement("div");
    ronda.className = "meloquiz-ronda";
    ronda.textContent =
      vista.fase === "final" ? "—" : `Ronda ${vista.ronda} / ${vista.rondasTotales}`;

    // El nodo se repone en cada render (la raíz se vacía); el ticker lo escribe.
    const contador = document.createElement("div");
    contador.className = "meloquiz-contador";
    this.contadorEl = contador;
    this.pintarContador();

    cab.append(titulo, ronda, contador);
    return cab;
  }

  private panelPrecarga(vista: VistaMeloquizSala): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "meloquiz-panel";

    const texto = document.createElement("p");
    if (indiceLocal.vacio) {
      texto.textContent = "No elegiste carpeta: no vas a poder escuchar las pistas.";
    } else if (vista.pistaId !== null && !indiceLocal.tiene(vista.pistaId)) {
      texto.textContent = "Esta canción no está en tu carpeta; se saltea la ronda.";
    } else if (vista.listos.includes(vista.tuJugadorId)) {
      texto.textContent = "Listo. Esperando al resto…";
    } else {
      texto.textContent = "Preparando la pista…";
    }

    const cuenta = document.createElement("small");
    cuenta.className = "meloquiz-nota";
    cuenta.textContent = `${vista.listos.length} de ${vista.jugadores.length} preparados`;

    panel.append(texto, cuenta);
    return panel;
  }

  private panelClip(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "meloquiz-panel meloquiz-clip";
    const texto = document.createElement("p");
    // Durante el clip no se muestra NADA de la canción (§4): solo se escucha.
    texto.textContent = "♪ ♪ ♪";
    panel.appendChild(texto);
    return panel;
  }

  /** Un botón por PARTICIPANTE (§5): se vota quién ganó la ronda, no un título. */
  private panelVotoJugadores(vista: VistaMeloquizSala): HTMLElement {
    const lista = document.createElement("div");
    lista.className = "meloquiz-opciones";

    for (const jugador of vista.jugadores) {
      const boton = document.createElement("button");
      boton.className = "meloquiz-opcion";
      boton.appendChild(crearAvatar(avatarDe(jugador), TAM_AVATAR_VOTO));

      const nombre = document.createElement("span");
      nombre.textContent =
        jugador.id === vista.tuJugadorId ? `${jugador.nombre} (vos)` : jugador.nombre;
      boton.appendChild(nombre);

      if (vista.tuVotoJugadorId === jugador.id) boton.classList.add("votada");

      // Cortesía de UI; el servidor revalida igual (una sola votación por ronda).
      // El botón PROPIO queda habilitado: el auto-voto está permitido (§5).
      boton.disabled = vista.fase !== "voto" || vista.tuVotoJugadorId !== null;
      boton.addEventListener("click", () => {
        this.contexto?.enviar({ tipo: "votar", votadoId: jugador.id });
      });
      lista.appendChild(boton);
    }
    return lista;
  }

  private panelRevelar(vista: VistaMeloquizSala): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "meloquiz-panel meloquiz-revelar";

    // El arte se saca del archivo PROPIO (§1: sus bytes nunca viajan por red).
    // Se pinta el placeholder ya y la imagen cuando el parseo resuelve; si la
    // fase cambió mientras tanto, se descarta para no pisar el render siguiente.
    const arte = document.createElement("div");
    arte.className = "meloquiz-caratula";
    arte.textContent = "♫";
    if (vista.pistaId !== null) {
      const claveAlPedir = vista.claveFase;
      void indiceLocal.caratulaDe(vista.pistaId).then((url) => {
        if (url === null || this.ultimaVista?.claveFase !== claveAlPedir) return;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        arte.replaceChildren(img);
      });
    }

    const titulo = document.createElement("strong");
    titulo.textContent = vista.tituloCorrecto ?? "—";

    const artista = document.createElement("span");
    artista.className = "meloquiz-artista";
    artista.textContent = vista.artistaCorrecto ?? "";

    panel.append(arte, titulo, artista);

    // El veredicto del GRUPO, solo en la tabla (§5): el juego es escribano, no
    // árbitro — acá no existe "acertaste/fallaste", existe el más votado.
    if (vista.fase === "puntaje") {
      const veredicto = document.createElement("p");
      veredicto.className = "meloquiz-veredicto";
      if (vista.ganadorRonda !== null) {
        const ganador = vista.jugadores.find((j) => j.id === vista.ganadorRonda);
        veredicto.textContent = `¡${ganador?.nombre ?? "—"} se lleva la ronda! +1`;
      } else {
        const votosEmitidos = vista.jugadores.reduce((n, j) => n + (j.votosRecibidos ?? 0), 0);
        veredicto.textContent =
          votosEmitidos === 0 ? "Nadie votó: nadie suma." : "Empate: nadie suma.";
      }
      panel.appendChild(veredicto);
    }
    return panel;
  }

  private panelFinal(vista: VistaMeloquizSala): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "meloquiz-panel meloquiz-final";

    const nombres = vista.jugadores
      .filter((j) => vista.ganadores.includes(j.id))
      .map((j) => j.nombre);

    const titulo = document.createElement("strong");
    titulo.textContent =
      nombres.length > 1 ? `Empate: ${nombres.join(", ")}` : `Gana ${nombres[0] ?? "—"}`;

    const boton = document.createElement("button");
    boton.className = "meloquiz-volver";
    boton.textContent = "Volver al hub";
    boton.addEventListener("click", () => this.contexto?.salirAlHub());

    panel.append(titulo, boton);
    return panel;
  }

  private marcador(vista: VistaMeloquizSala): HTMLElement {
    const lista = document.createElement("ul");
    lista.className = "meloquiz-jugadores";

    for (const jugador of vista.jugadores) {
      const item = document.createElement("li");
      item.className = "meloquiz-jugador";
      if (vista.estadosConexion[jugador.id] !== "conectado") {
        item.classList.add("desconectado");
      }
      if (vista.ganadorRonda === jugador.id) item.classList.add("ganador");

      const nombre = document.createElement("span");
      nombre.textContent = jugador.id === vista.tuJugadorId ? `${jugador.nombre} (vos)` : jugador.nombre;

      const puntos = document.createElement("span");
      puntos.className = "meloquiz-puntos";
      puntos.textContent = String(jugador.puntos);

      // En precarga interesa quién ya ackeó; en votación, quién ya votó; en la
      // tabla, el CONTEO de votos que recibió cada uno (§5).
      const marca = document.createElement("span");
      marca.className = "meloquiz-marca";
      if (vista.fase === "precarga") marca.textContent = vista.listos.includes(jugador.id) ? "✓" : "…";
      else if (vista.fase === "voto") marca.textContent = jugador.haVotado ? "✓" : "…";
      else if (vista.fase === "puntaje" && jugador.votosRecibidos !== null) {
        marca.textContent = `${jugador.votosRecibidos} voto${jugador.votosRecibidos === 1 ? "" : "s"}`;
      }

      item.append(nombre, marca, puntos);
      lista.appendChild(item);
    }
    return lista;
  }

  private mostrarToast(mensaje: string): void {
    const toast = this.toast;
    if (toast === null) return;
    toast.textContent = mensaje;
    toast.style.display = "block";
    if (this.toastTimeout !== null) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.display = "none";
    }, 3_000);
  }
}
