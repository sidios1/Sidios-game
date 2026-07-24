// Checklist de categorías (subcarpetas, REGLAS_MELOQUIZ §11) que el HOST ve
// justo después de elegir su carpeta de música, ANTES de crear la sala (mismo
// momento que `elegirCarpeta.ts`). Standalone: se monta sobre `document.body`
// como `elegirCarpetaWeb()` — todavía no existe el HUD del juego en
// `prepararHosteo`, así que no puede depender de él.

/**
 * Muestra el checklist (todas marcadas por defecto) y resuelve con las
 * categorías elegidas, o `null` si el host cancela.
 */
export function mostrarSelectorCategorias(
  categorias: readonly string[],
): Promise<readonly string[] | null> {
  return new Promise((resolver) => {
    const velo = document.createElement("div");
    velo.className = "meloquiz-selector-categorias";

    const panel = document.createElement("div");
    panel.className = "meloquiz-selector-categorias-panel";

    const titulo = document.createElement("div");
    titulo.className = "meloquiz-selector-categorias-titulo";
    titulo.textContent = "Elegí las categorías de la partida";
    panel.appendChild(titulo);

    const ayuda = document.createElement("p");
    ayuda.className = "meloquiz-selector-categorias-ayuda";
    ayuda.textContent =
      "El catálogo se arma con las canciones de las categorías marcadas.";
    panel.appendChild(ayuda);

    const lista = document.createElement("div");
    lista.className = "meloquiz-selector-categorias-lista";
    const checks = new Map<string, HTMLInputElement>();
    for (const categoria of categorias) {
      const fila = document.createElement("label");
      fila.className = "meloquiz-selector-categorias-fila";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = true;
      checks.set(categoria, check);

      const texto = document.createElement("span");
      texto.textContent = categoria;

      fila.append(check, texto);
      lista.appendChild(fila);
    }
    panel.appendChild(lista);

    const terminar = (valor: readonly string[] | null): void => {
      velo.remove();
      resolver(valor);
    };

    const botones = document.createElement("div");
    botones.className = "meloquiz-selector-categorias-botones";

    const confirmar = document.createElement("button");
    confirmar.className = "principal";
    confirmar.textContent = "Confirmar";
    confirmar.addEventListener("click", () => {
      terminar(categorias.filter((categoria) => checks.get(categoria)?.checked === true));
    });

    const cancelar = document.createElement("button");
    cancelar.textContent = "Cancelar";
    cancelar.addEventListener("click", () => terminar(null));

    botones.append(confirmar, cancelar);
    panel.appendChild(botones);

    velo.appendChild(panel);
    // Click en el fondo cancela, igual que los selectores de Rumble.
    velo.addEventListener("click", (evento) => {
      if (evento.target === velo) terminar(null);
    });
    document.body.appendChild(velo);
  });
}
