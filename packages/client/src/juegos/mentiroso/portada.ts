// Portada de Mentiroso para la tarjeta del hub: fondo índigo con una carta de
// comodín (JOKER). SVG autocontenido, sin assets externos ni Three.js. El hub la
// monta vía la ficha (ver ../../juego/ficha.ts).

const SVG = `
<svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Carta de comodín (Joker)">
  <rect width="120" height="160" fill="#1E2A4A"/>
  <rect x="34" y="28" width="52" height="104" rx="8" fill="#F4ECDD" stroke="#11182C" stroke-width="2"/>
  <g font-family="Georgia, 'Times New Roman', serif" font-weight="700" fill="#1E2A4A">
    <text x="40" y="48" font-size="11">J</text>
    <text x="80" y="118" font-size="11" transform="rotate(180 80 113)">J</text>
  </g>
  <!-- Gorro de bufón con tres puntas y cascabeles -->
  <g transform="translate(60 78)">
    <path d="M -22 6 L -14 -20 L 0 -6 L 14 -20 L 22 6 Z" fill="#C0392B"/>
    <circle cx="-14" cy="-22" r="3.5" fill="#F7B500"/>
    <circle cx="0" cy="-8" r="3.5" fill="#F7B500"/>
    <circle cx="14" cy="-22" r="3.5" fill="#F7B500"/>
    <rect x="-22" y="6" width="44" height="6" rx="3" fill="#101216"/>
  </g>
  <text x="60" y="104" text-anchor="middle" font-size="13" font-weight="800"
        font-family="Arial, Helvetica, sans-serif" fill="#1E2A4A"
        letter-spacing="1">JOKER</text>
</svg>`;

export function portadaMentiroso(): HTMLElement {
  const nodo = document.createElement("div");
  nodo.className = "portada portada-mentiroso";
  nodo.innerHTML = SVG;
  return nodo;
}
