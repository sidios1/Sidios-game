// Rumble como IJuego del cliente. REUSA íntegramente el render de Carioca (la mesa,
// la mano, el HUD base) delegando en JuegoCarioca, y monta ENCIMA su propio HudRumble
// con el slice `rumble`: habilidades, revelaciones, targeting y anuncio DOBLE.
//
// El aislamiento es deliberado y espeja al del servidor (MotorRumble decora a
// MotorCarioca sin tocarlo): aquí no se modifican `hud/hud.ts`, `maquinaInteraccion.ts`
// ni `JuegoCarioca`. Rumble rodea a Carioca.

import type { VistaPartida } from "@juegos/server/vista";
import type { VistaJuego, VistaRumble } from "@juegos/server/vistaJuego";
import type { ContextoJuego, IJuego, SenalJuego } from "../../juego/ijuego.js";
import { JuegoCarioca } from "../carioca/juegoCarioca.js";
import { HudRumble } from "./hudRumble.js";

export class JuegoRumble implements IJuego {
  private readonly base = new JuegoCarioca();
  private hud: HudRumble | null = null;

  iniciar(contexto: ContextoJuego): void {
    this.base.iniciar(contexto);
    this.hud = new HudRumble(contexto.contenedorHud, {
      alIntencion: (intencion) => contexto.enviar(intencion),
    });
  }

  sincronizarEstado(vista: VistaJuego): void {
    // Ahora que se LEE `vista.rumble`, se estrecha por el discriminante en runtime
    // en vez de confiar solo en la bivarianza del método: el campo `juego` existe
    // justamente para eso.
    if (vista.juego !== "carioca-rumble") return;
    const rumble: VistaRumble = vista;
    // Carioca recibe su propia forma: el slice `rumble` no le incumbe.
    const { rumble: _rumble, juego: _juego, ...resto } = rumble;
    const vistaCarioca: VistaPartida = { ...resto, juego: "carioca" };
    this.base.sincronizarEstado(vistaCarioca);
    this.hud?.actualizar(rumble);
  }

  procesarAccion(senal: SenalJuego): void {
    this.base.procesarAccion(senal);
  }

  finalizar(): void {
    this.hud?.destruir();
    this.hud = null;
    this.base.finalizar();
  }
}
