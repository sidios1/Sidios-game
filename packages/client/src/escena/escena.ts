// Escena base: renderer, mesa, cámara y luces, más las zonas clickeables
// fijas de mazo y pozo (visibles aunque las pilas estén vacías).

import * as THREE from "three";
import { POSE_MAZO, POSE_POZO } from "./disposicion.js";
import { ALTO_CARTA, ANCHO_CARTA, asignarInteraccion } from "./mallaCarta.js";

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

  constructor(contenedor: HTMLElement) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color("#101418");

    this.camara = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camara.position.set(0, 7.6, 8.6);
    this.camara.lookAt(0, 0, 0.4);

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
    const fieltro = new THREE.Mesh(
      new THREE.CircleGeometry(8.2, 48),
      new THREE.MeshLambertMaterial({ color: "#1d5c3a" }),
    );
    fieltro.rotation.x = -Math.PI / 2;
    this.escena.add(fieltro);

    const borde = new THREE.Mesh(
      new THREE.TorusGeometry(8.2, 0.28, 12, 48),
      new THREE.MeshLambertMaterial({ color: "#5a3a22" }),
    );
    borde.rotation.x = -Math.PI / 2;
    this.escena.add(borde);
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

    this.escena.add(zonaMazo, zonaPozo);
    this.zonasFijas.push(zonaMazo, zonaPozo);
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
