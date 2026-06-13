// Panel para armar la bajada: grupos ya agregados, tipos que ofrece el
// contrato, motivos de invalidez y confirmación. Solo DOM; los eventos van
// a la máquina de interacción.

import type { TipoCombinacion } from "@juegos/carioca-core";
import { describirCarta } from "@juegos/carioca-core";
import type { VistaPartida } from "@juegos/server/vista";
import type {
  EstadoInteraccion,
  EventoInteraccion,
} from "../estado/maquinaInteraccion.js";
import {
  evaluarPropuesta,
  nombreTipo,
  requisitosDelContrato,
} from "../estado/propuesta.js";

export function renderPanelBajada(
  contenedor: HTMLElement,
  estado: EstadoInteraccion,
  vista: VistaPartida,
  despachar: (evento: EventoInteraccion) => void,
): void {
  contenedor.replaceChildren();
  contenedor.classList.add("panel");

  const titulo = document.createElement("h3");
  titulo.textContent = `Bajarse — ${vista.contrato.nombre}`;
  contenedor.appendChild(titulo);

  const porId = new Map(vista.tuMano.map((c) => [c.id, c]));

  // Grupos ya armados.
  estado.propuesta.forEach((grupo, indice) => {
    const fila = document.createElement("div");
    fila.className = "grupo-bajada";
    const texto = document.createElement("span");
    const cartas = grupo.cartaIds
      .map((id) => {
        const carta = porId.get(id);
        return carta === undefined ? "?" : describirCarta(carta);
      })
      .join(", ");
    texto.textContent = `${nombreTipo(grupo.tipo)}: ${cartas}`;
    const quitar = document.createElement("button");
    quitar.textContent = "Quitar";
    quitar.addEventListener("click", () =>
      despachar({ tipo: "quitarGrupo", indice }),
    );
    fila.append(texto, quitar);
    contenedor.appendChild(fila);
  });

  // Agregar la selección actual como grupo, según los tipos del contrato.
  const tiposDelContrato: readonly TipoCombinacion[] = [
    ...requisitosDelContrato(vista.contrato).keys(),
  ];
  const acciones = document.createElement("div");
  acciones.className = "fila-botones";
  for (const tipo of tiposDelContrato) {
    const boton = document.createElement("button");
    boton.textContent = `Agregar ${nombreTipo(tipo)} (${estado.seleccion.length} cartas)`;
    boton.disabled = estado.seleccion.length === 0;
    boton.addEventListener("click", () =>
      despachar({ tipo: "agregarGrupo", tipoCombinacion: tipo }),
    );
    acciones.appendChild(boton);
  }
  contenedor.appendChild(acciones);

  // Estado de la propuesta frente al contrato.
  const evaluacion = evaluarPropuesta(
    estado.propuesta,
    vista.tuMano,
    vista.contrato,
  );
  if (!evaluacion.completa && estado.propuesta.length > 0) {
    const motivos = document.createElement("p");
    motivos.className = "motivos";
    motivos.textContent = evaluacion.motivos.join(" · ");
    contenedor.appendChild(motivos);
  }

  const cierre = document.createElement("div");
  cierre.className = "fila-botones";
  const confirmar = document.createElement("button");
  confirmar.className = "principal";
  confirmar.textContent = "Bajarse";
  confirmar.disabled = !evaluacion.completa;
  confirmar.addEventListener("click", () => despachar({ tipo: "confirmarBajada" }));
  const cancelar = document.createElement("button");
  cancelar.textContent = "Cerrar";
  cancelar.addEventListener("click", () => despachar({ tipo: "cerrarBajada" }));
  cierre.append(confirmar, cancelar);
  contenedor.appendChild(cierre);
}
