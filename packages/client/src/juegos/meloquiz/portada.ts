// Portada de MeloQuiz para la tarjeta del hub: disco de vinilo sobre fondo
// violeta, con ondas de sonido y un signo de pregunta al centro (adivinar la
// canción). SVG autocontenido, sin assets externos ni Three.js.

const SVG = `
<svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="Disco de vinilo con un signo de pregunta">
  <rect width="120" height="160" fill="#2A1E4A"/>
  <!-- Ondas de sonido a los costados -->
  <g stroke="#7A5CC4" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.8">
    <path d="M 14 66 L 14 94"/>
    <path d="M 24 56 L 24 104"/>
    <path d="M 96 56 L 96 104"/>
    <path d="M 106 66 L 106 94"/>
  </g>
  <!-- Vinilo -->
  <circle cx="60" cy="80" r="34" fill="#101216" stroke="#3D2E63" stroke-width="2"/>
  <circle cx="60" cy="80" r="27" fill="none" stroke="#2A2233" stroke-width="1.5"/>
  <circle cx="60" cy="80" r="21" fill="none" stroke="#2A2233" stroke-width="1.5"/>
  <circle cx="60" cy="80" r="13" fill="#C0392B"/>
  <text x="60" y="87" text-anchor="middle" font-size="17" font-weight="800"
        font-family="Arial, Helvetica, sans-serif" fill="#F4ECDD">?</text>
  <!-- Nota musical arriba -->
  <g fill="#F7B500" transform="translate(60 34)">
    <rect x="4" y="-14" width="2.5" height="16" rx="1"/>
    <ellipse cx="1" cy="2" rx="5" ry="3.6" transform="rotate(-20 1 2)"/>
    <path d="M 6.5 -14 q 7 2 7 7 q -2 -4 -7 -4 Z"/>
  </g>
</svg>`;

export function portadaMeloquiz(): HTMLElement {
  const nodo = document.createElement("div");
  nodo.className = "portada portada-meloquiz";
  nodo.innerHTML = SVG;
  return nodo;
}
