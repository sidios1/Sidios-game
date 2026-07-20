// Portada de Carioca Rumble para la tarjeta del hub: la baraja de Carioca con un
// destello de "habilidad" (rayo) que la distingue del modo base. SVG
// autocontenido, sin assets externos ni Three.js. El hub la monta vía la ficha.

const SVG = `
<svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Carioca Rumble: cartas con un rayo de habilidad">
  <rect width="120" height="160" fill="#1E2749"/>
  <g transform="translate(60 156)" font-family="Georgia, 'Times New Roman', serif">
    <g transform="rotate(-20)">
      <rect x="-23" y="-118" width="46" height="66" rx="6" fill="#F4ECDD" stroke="#0E1329" stroke-width="1.5"/>
      <text x="-17" y="-99" font-size="13" font-weight="700" fill="#1A1A1A">A</text>
      <text x="0" y="-76" font-size="26" text-anchor="middle" fill="#1A1A1A">&#9824;</text>
    </g>
    <g transform="rotate(20)">
      <rect x="-23" y="-118" width="46" height="66" rx="6" fill="#F4ECDD" stroke="#0E1329" stroke-width="1.5"/>
      <text x="-17" y="-99" font-size="13" font-weight="700" fill="#C0392B">A</text>
      <text x="0" y="-76" font-size="26" text-anchor="middle" fill="#C0392B">&#9829;</text>
    </g>
  </g>
  <path d="M64 34 L48 86 L62 86 L54 122 L84 70 L68 70 Z"
        fill="#FFD23F" stroke="#0E1329" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

export function portadaRumble(): HTMLElement {
  const nodo = document.createElement("div");
  nodo.className = "portada portada-rumble";
  nodo.innerHTML = SVG;
  return nodo;
}
