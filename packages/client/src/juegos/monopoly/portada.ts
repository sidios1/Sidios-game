// Portada de Monopoly Ultimate Team para la tarjeta del hub: tablero
// esquemático (4 esquinas + celdas de color) con un balón al centro. SVG
// autocontenido, sin assets externos ni Three.js.

const SVG = `
<svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Tablero de Monopoly Ultimate Team">
  <rect x="0" y="0" width="120" height="120" fill="#123a25"/>
  <rect x="8" y="8" width="104" height="104" fill="none" stroke="#1d5c3a" stroke-width="2"/>
  <rect x="8" y="8" width="18" height="18" fill="#2fbf4f"/>
  <rect x="94" y="8" width="18" height="18" fill="#c0392b"/>
  <rect x="8" y="94" width="18" height="18" fill="#d4af37"/>
  <rect x="94" y="94" width="18" height="18" fill="#6b6b6b"/>
  <rect x="30" y="8" width="16" height="10" fill="#3fa34d"/>
  <rect x="50" y="8" width="16" height="10" fill="#e0b23a"/>
  <rect x="70" y="8" width="16" height="10" fill="#8a3ac7"/>
  <rect x="8" y="30" width="10" height="16" fill="#c73a5c"/>
  <rect x="8" y="50" width="10" height="16" fill="#e0603a"/>
  <rect x="8" y="70" width="10" height="16" fill="#2fa39a"/>
  <rect x="30" y="102" width="16" height="10" fill="#6fbf3f"/>
  <rect x="50" y="102" width="16" height="10" fill="#c9d13a"/>
  <rect x="70" y="102" width="16" height="10" fill="#e08a3a"/>
  <rect x="102" y="30" width="10" height="16" fill="#5a6b7a"/>
  <rect x="102" y="50" width="10" height="16" fill="#5a6b7a"/>
  <rect x="102" y="70" width="10" height="16" fill="#5a6b7a"/>
  <circle cx="60" cy="60" r="20" fill="#fbf9f4"/>
  <text x="60" y="66" text-anchor="middle" font-size="24" font-family="Arial, Helvetica, sans-serif">⚽</text>
</svg>`;

export function portadaMonopoly(): HTMLElement {
  const nodo = document.createElement("div");
  nodo.className = "portada portada-monopoly";
  nodo.innerHTML = SVG;
  return nodo;
}
