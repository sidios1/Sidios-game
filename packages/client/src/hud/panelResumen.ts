// Resumen de fin de mano (puntos + voto "listo") y pantalla final de partida.

import type { VistaPartida } from "@juegos/server/vista";
import type {
  EstadoInteraccion,
  EventoInteraccion,
} from "../estado/maquinaInteraccion.js";

function nombreDe(vista: VistaPartida, jugadorId: string): string {
  return vista.jugadores.find((j) => j.id === jugadorId)?.nombre ?? jugadorId;
}

export function renderPanelResumen(
  contenedor: HTMLElement,
  estado: EstadoInteraccion,
  vista: VistaPartida,
  despachar: (evento: EventoInteraccion) => void,
): void {
  contenedor.replaceChildren();
  contenedor.classList.add("panel");

  const esFinal = vista.fase === "partidaTerminada";
  const titulo = document.createElement("h3");
  titulo.textContent = esFinal
    ? "Fin de la partida"
    : `Fin de la mano ${vista.manoActual} — ${vista.contrato.nombre}`;
  contenedor.appendChild(titulo);

  const resumen = vista.resumenMano;
  if (resumen !== null) {
    const ganador = document.createElement("p");
    ganador.textContent = `Ganó la mano: ${nombreDe(vista, resumen.ganadorManoId)}`;
    contenedor.appendChild(ganador);

    const tabla = document.createElement("table");
    const encabezado = document.createElement("tr");
    for (const texto of ["Jugador", "Puntos de la mano", "Total"]) {
      const celda = document.createElement("th");
      celda.textContent = texto;
      encabezado.appendChild(celda);
    }
    tabla.appendChild(encabezado);
    for (const fila of resumen.filas) {
      const tr = document.createElement("tr");
      for (const texto of [
        nombreDe(vista, fila.jugadorId),
        String(fila.puntosMano),
        String(fila.puntosAcumulados),
      ]) {
        const celda = document.createElement("td");
        celda.textContent = texto;
        tr.appendChild(celda);
      }
      tabla.appendChild(tr);
    }
    contenedor.appendChild(tabla);
  }

  if (esFinal) {
    const ganadores = document.createElement("p");
    ganadores.className = "ganadores";
    const nombres = (vista.ganadoresIds ?? []).map((id) => nombreDe(vista, id));
    ganadores.textContent = `🏆 Ganador(es): ${nombres.join(", ")}`;
    contenedor.appendChild(ganadores);
    return;
  }

  if (resumen !== null) {
    const votos = document.createElement("p");
    votos.textContent = `Listos para la siguiente mano: ${resumen.votosListos}/${resumen.votosNecesarios}`;
    contenedor.appendChild(votos);
  }
  const listo = document.createElement("button");
  listo.className = "principal";
  listo.textContent = estado.votoEmitido ? "Esperando al resto…" : "¡Listo!";
  listo.disabled = estado.votoEmitido;
  listo.addEventListener("click", () => despachar({ tipo: "votarListo" }));
  contenedor.appendChild(listo);
}
