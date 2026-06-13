// Escena base: renderer, mesa, cámara y luces, más las zonas clickeables
// fijas de mazo y pozo (visibles aunque las pilas estén vacías).

import * as THREE from "three";
import { camaraPara, radioMesa } from "./dimensionesMesa.js";
import { POSE_MAZO, POSE_POZO } from "./disposicion.js";
import { ALTO_CARTA, ANCHO_CARTA, asignarInteraccion } from "./mallaCarta.js";

/** Número de jugadores con que se arma la mesa antes de la primera vista. */
const JUGADORES_INICIAL = 2;

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
  private readonly ajustar: () => void;
  /** Fieltro y borde: se reescalan cuando cambia el número de jugadores. */
  private fieltro!: THREE.Mesh;
  private borde!: THREE.Mesh;
  /** Último número de jugadores aplicado (para no reconstruir en cada vista). */
  private jugadoresMesa = JUGADORES_INICIAL;

  constructor(contenedor: HTMLElement) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color("#101418");

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
    this.fieltro = new THREE.Mesh(
      new THREE.CircleGeometry(radio, 48),
      new THREE.MeshLambertMaterial({ color: "#1d5c3a" }),
    );
    this.fieltro.rotation.x = -Math.PI / 2;
    this.escena.add(this.fieltro);

    this.borde = new THREE.Mesh(
      new THREE.TorusGeometry(radio, 0.28, 12, 48),
      new THREE.MeshLambertMaterial({ color: "#5a3a22" }),
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

  private armarLuces(): void {
    this.escena.add(new THREE.AmbientLight("#ffffff", 0.85));
    const focal = new THREE.DirectionalLight("#fff4e0", 1.4);
    focal.position.set(3, 10, 5);
    this.escena.add(focal);
  }

  /** Marcas planas bajo el mazo y el pozo: siempre clickeables y visibles. */
  private armarZonas(): void {
    const geometria = new THREE.PlaneGeometry(ANCHO_CARTA + 0.3, ALTO_CARTA + 0.3);
    const material = new THREE.MeshLambertMaterial({
      color: "#163d28",
      side: THREE.DoubleSide,
    });
    const zonaMazo = new THREE.Mesh(geometria, material);
    zonaMazo.rotation.x = -Math.PI / 2;
    zonaMazo.position.set(POSE_MAZO.x, 0.002, POSE_MAZO.z);
    asignarInteraccion(zonaMazo, { tipo: "mazo" });

    const zonaPozo = new THREE.Mesh(geometria, material);
    zonaPozo.rotation.x = -Math.PI / 2;
    zonaPozo.position.set(POSE_POZO.x, 0.002, POSE_POZO.z);
    asignarInteraccion(zonaPozo, { tipo: "pozo" });

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

    this.escena.add(zonaMazo, zonaPozo, zonaMesa);
    this.zonasFijas.push(zonaMazo, zonaPozo, zonaMesa);
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
