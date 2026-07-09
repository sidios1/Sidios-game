// Portada de Carioca para la tarjeta del hub: fondo borgoña con un abanico de
// tres ases (A♠ / A♥ / A♣). SVG autocontenido, sin assets externos ni Three.js.
// El hub la monta vía la ficha (ver ../../juego/ficha.ts).

const SVG = `
<svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Tres ases de Carioca">
  <rect width="120" height="160" fill="#7A1626"/>
  <g transform="translate(60 156)" font-family="Georgia, 'Times New Roman', serif">
    <g transform="rotate(-24)">
      <rect x="-23" y="-120" width="46" height="66" rx="6" fill="#F4ECDD" stroke="#2A1A1E" stroke-width="1.5"/>
      <text x="-17" y="-101" font-size="13" font-weight="700" fill="#1A1A1A">A</text>
      <text x="0" y="-78" font-size="26" text-anchor="middle" fill="#1A1A1A">&#9824;</text>
    </g>
    <g transform="rotate(0)">
      <rect x="-23" y="-124" width="46" height="66" rx="6" fill="#F4ECDD" stroke="#2A1A1E" stroke-width="1.5"/>
      <text x="-17" y="-105" font-size="13" font-weight="700" fill="#C0392B">A</text>
      <text x="0" y="-82" font-size="26" text-anchor="middle" fill="#C0392B">&#9829;</text>
    </g>
    <g transform="rotate(24)">
      <rect x="-23" y="-120" width="46" height="66" rx="6" fill="#F4ECDD" stroke="#2A1A1E" stroke-width="1.5"/>
      <text x="-17" y="-101" font-size="13" font-weight="700" fill="#1A1A1A">A</text>
      <text x="0" y="-78" font-size="26" text-anchor="middle" fill="#1A1A1A">&#9827;</text>
    </g>
  </g>
</svg>`;

export function portadaCarioca(): HTMLElement {
  const nodo = document.createElement("div");
  nodo.className = "portada portada-carioca";
  nodo.innerHTML = SVG;
  return nodo;
}
