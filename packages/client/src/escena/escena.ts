// Escena base: renderer, mesa, cámara y luces, más las zonas clickeables
// fijas (mazo/pozo) según el juego. La paleta, las luces y qué zonas se arman
// son PARÁMETROS (`OpcionesEscena`) con defaults = Carioca, para que UNO logre
// su estética propia sin un motor de escena nuevo.

import * as THREE from "three";
import { camaraPara, radioMesa } from "./dimensionesMesa.js";
import { POSE_MAZO, POSE_POZO } from "./disposicion.js";
import { ALTO_CARTA, ANCHO_CARTA, asignarInteraccion } from "./mallaCarta.js";

/** Número de jugadores con que se arma la mesa antes de la primera vista. */
const JUGADORES_INICIAL = 2;

/** Zonas fijas (planos clickeables) que puede armar la escena. */
export type ZonaFija = "mazo" | "pozo" | "mesaBajada";

export interface ConfigLuz {
  readonly color: string;
  readonly intensidad: number;
}

/** Estética de la escena; todo opcional con defaults = Carioca. */
export interface OpcionesEscena {
  readonly fondo?: string;
  readonly fieltro?: string;
  readonly borde?: string;
  readonly colorZona?: string;
  readonly luzAmbiente?: ConfigLuz;
  readonly luzFocal?: ConfigLuz;
  /** Qué zonas fijas armar (default: las tres de Carioca). */
  readonly zonas?: readonly ZonaFija[];
}

const DEFAULTS: Required<Omit<OpcionesEscena, "zonas">> & { zonas: readonly ZonaFija[] } = {
  fondo: "#101418",
  fieltro: "#1d5c3a",
  borde: "#5a3a22",
  colorZona: "#163d28",
  luzAmbiente: { color: "#ffffff", intensidad: 0.85 },
  luzFocal: { color: "#fff4e0", intensidad: 1.4 },
  zonas: ["mazo", "pozo", "mesaBajada"],
};

export class Escena {
  readonly escena: THREE.Scene;
  readonly camara: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** Grupo donde viven las cartas dinámicas (lo puebla el sincronizador). */
  readonly cartas: THREE.Group;
  /** Objetos fijos que también responden al puntero (zonas de mazo/pozo). */
  readonly zonasFijas: THREE.Object3D[] = [];

  private detenido = false;
  private readonly contenedor: HTMLElement;
  private readonly opciones: typeof DEFAULTS;
  private readonly ajustar: () => void;
  /** Fieltro y borde: se reescalan cuando cambia el número de jugadores. */
  private fieltro!: THREE.Mesh;
  private fieltroMaterial!: THREE.MeshLambertMaterial;
  private borde!: THREE.Mesh;
  /** Último número de jugadores aplicado (para no reconstruir en cada vista). */
  private jugadoresMesa = JUGADORES_INICIAL;

  constructor(contenedor: HTMLElement, opciones: OpcionesEscena = {}) {
    this.contenedor = contenedor;
    this.opciones = { ...DEFAULTS, ...opciones };
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(this.opciones.fondo);

    this.camara = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const vista = camaraPara(JUGADORES_INICIAL);
    this.camara.position.set(vista.x, vista.y, vista.z);
    this.camara.lookAt(vista.miraX, vista.miraY, vista.miraZ);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    contenedor.appendChild(this.renderer.domElement);

    this.cartas = new THREE.Group();
    this.escena.add(this.cartas);

    this.armarMesa();
    this.armarLuces();
    this.armarZonas();

    this.ajustar = () => {
      const ancho = contenedor.clientWidth || window.innerWidth;
      const alto = contenedor.clientHeight || window.innerHeight;
      this.camara.aspect = ancho / alto;
      this.camara.updateProjectionMatrix();
      this.renderer.setSize(ancho, alto);
    };
    this.ajustar();
    window.addEventListener("resize", this.ajustar);
  }

  private armarMesa(): void {
    const radio = radioMesa(this.jugadoresMesa);
    this.fieltroMaterial = new THREE.MeshLambertMaterial({ color: this.opciones.fieltro });
    this.fieltro = new THREE.Mesh(new THREE.CircleGeometry(radio, 48), this.fieltroMaterial);
    this.fieltro.rotation.x = -Math.PI / 2;
    this.escena.add(this.fieltro);

    this.borde = new THREE.Mesh(
      new THREE.TorusGeometry(radio, 0.28, 12, 48),
      new THREE.MeshLambertMaterial({ color: this.opciones.borde }),
    );
    this.borde.rotation.x = -Math.PI / 2;
    this.escena.add(this.borde);
  }

  /**
   * Reescala el fieltro, el borde y la cámara para que entre la mesa de
   * `numJugadores`. Idempotente: si el número no cambió, no hace nada (no
   * reconstruye geometría en cada vista).
   */
  ajustarMesa(numJugadores: number): void {
    const n = Math.max(numJugadores, 1);
    if (n === this.jugadoresMesa) return;
    this.jugadoresMesa = n;

    const radio = radioMesa(n);
    this.fieltro.geometry.dispose();
    this.fieltro.geometry = new THREE.CircleGeometry(radio, 48);
    this.borde.geometry.dispose();
    this.borde.geometry = new THREE.TorusGeometry(radio, 0.28, 12, 48);

    const vista = camaraPara(n);
    this.camara.position.set(vista.x, vista.y, vista.z);
    this.camara.lookAt(vista.miraX, vista.miraY, vista.miraZ);
    this.camara.updateProjectionMatrix();
  }

  /**
   * Tinta sutil del fieltro con el color activo (UNO refleja en la mesa el color
   * vigente; Carioca nunca lo llama). `null` apaga el tinte. Es solo presentación.
   */
  resaltarColor(hex: string | null): void {
    if (hex === null) {
      this.fieltroMaterial.emissive.set("#000000");
      this.fieltroMaterial.emissiveIntensity = 0;
      return;
    }
    this.fieltroMaterial.emissive.set(hex);
    this.fieltroMaterial.emissiveIntensity = 0.32;
  }

  private armarLuces(): void {
    const amb = this.opciones.luzAmbiente;
    this.escena.add(new THREE.AmbientLight(amb.color, amb.intensidad));
    const f = this.opciones.luzFocal;
    const focal = new THREE.DirectionalLight(f.color, f.intensidad);
    focal.position.set(3, 10, 5);
    this.escena.add(focal);
  }

  /** Marcas planas bajo las zonas pedidas: siempre clickeables y visibles. */
  private armarZonas(): void {
    const zonas = new Set(this.opciones.zonas);
    const geometria = new THREE.PlaneGeometry(ANCHO_CARTA + 0.3, ALTO_CARTA + 0.3);
    const material = new THREE.MeshLambertMaterial({
      color: this.opciones.colorZona,
      side: THREE.DoubleSide,
    });

    if (zonas.has("mazo")) {
      const zonaMazo = new THREE.Mesh(geometria, material);
      zonaMazo.rotation.x = -Math.PI / 2;
      zonaMazo.position.set(POSE_MAZO.x, 0.002, POSE_MAZO.z);
      asignarInteraccion(zonaMazo, { tipo: "mazo" });
      this.escena.add(zonaMazo);
      this.zonasFijas.push(zonaMazo);
    }

    if (zonas.has("pozo")) {
      const zonaPozo = new THREE.Mesh(geometria, material);
      zonaPozo.rotation.x = -Math.PI / 2;
      zonaPozo.position.set(POSE_POZO.x, 0.002, POSE_POZO.z);
      asignarInteraccion(zonaPozo, { tipo: "pozo" });
      this.escena.add(zonaPozo);
      this.zonasFijas.push(zonaPozo);
    }

    if (zonas.has("mesaBajada")) {
      // Zona central de bajada: sutil afordancia para "soltar aquí para bajarse".
      const zonaMesa = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 6),
        new THREE.MeshLambertMaterial({
          color: "#1f6e44",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.14,
        }),
      );
      zonaMesa.rotation.x = -Math.PI / 2;
      zonaMesa.position.set(0, 0.001, -1.2);
      asignarInteraccion(zonaMesa, { tipo: "mesaBajada" });
      this.escena.add(zonaMesa);
      this.zonasFijas.push(zonaMesa);
    }
  }

  /** Arranca el bucle de render; alTick recibe el delta en segundos. */
  iniciar(alTick: (dt: number) => void): void {
    let anterior = performance.now();
    const cuadro = (ahora: number) => {
      if (this.detenido) return;
      const dt = Math.min((ahora - anterior) / 1000, 0.05);
      anterior = ahora;
      alTick(dt);
      this.renderer.render(this.escena, this.camara);
      requestAnimationFrame(cuadro);
    };
    requestAnimationFrame(cuadro);
  }

  detener(): void {
    this.detenido = true;
  }

  /** Detiene el bucle y libera el render: quita el canvas y sus listeners. */
  dispose(): void {
    this.detener();
    window.removeEventListener("resize", this.ajustar);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.contenedor) {
      this.contenedor.removeChild(this.renderer.domElement);
    }
  }
}
