// Punto de entrada: arma el coordinador del hub sobre los contenedores del DOM
// y arranca en el menú de juegos. Todo el ciclo (menú → conexión/sala →
// juego → volver) lo gobierna el Coordinador; el token de reconexión vive en
// sessionStorage (por pestaña).

import { Coordinador } from "./hub/coordinador.js";
import { CATALOGO } from "./juego/catalogo.js";
import { instalarCapturaGlobal } from "./registro/capturaGlobal.js";
import { PanelRegistro } from "./registro/panelRegistro.js";

function elemento(id: string): HTMLElement {
  const encontrado = document.getElementById(id);
  if (encontrado === null) throw new Error(`falta #${id} en index.html`);
  return encontrado;
}

// Observabilidad: captura centralizada de fallos + visor de log embebido. Se
// arma antes del coordinador para no perder errores tempranos.
instalarCapturaGlobal();
new PanelRegistro(elemento("hud"));

const coordinador = new Coordinador({
  contenedorEscena: elemento("escena"),
  contenedorHud: elemento("hud"),
  catalogo: CATALOGO,
});
coordinador.iniciar();
