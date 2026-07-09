// Portada de UNO para la tarjeta del hub: cuatro cuadrantes (rojo/amarillo/azul/
// verde) con un sello "UNO" ovalado al centro. SVG autocontenido, sin assets
// externos ni Three.js. El hub la monta vía la ficha (ver ../../juego/ficha.ts).

const SVG = `
<svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Sello de UNO sobre cuatro colores">
  <rect x="0" y="0" width="60" height="80" fill="#D7282F"/>
  <rect x="60" y="0" width="60" height="80" fill="#F7B500"/>
  <rect x="0" y="80" width="60" height="80" fill="#0A6FB8"/>
  <rect x="60" y="80" width="60" height="80" fill="#3F9C35"/>
  <g transform="translate(60 80) rotate(-20)">
    <ellipse rx="46" ry="28" fill="#101216"/>
    <text x="0" y="11" text-anchor="middle" font-size="30" font-weight="800"
          font-family="Arial, Helvetica, sans-serif" fill="#F7B500"
          stroke="#FFFFFF" stroke-width="1">UNO</text>
  </g>
</svg>`;

export function portadaUno(): HTMLElement {
  const nodo = document.createElement("div");
  nodo.className = "portada portada-uno";
  nodo.innerHTML = SVG;
  return nodo;
}
