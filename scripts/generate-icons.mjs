/**
 * SkyMeet PWA Icon Generator
 * Renders SVG to PNG using @resvg/resvg-js (pure WebAssembly, no native deps)
 * Run: node scripts/generate-icons.mjs
 */

import { writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

// ── SVG Icon Design ──────────────────────────────────────────────────────────
// Squircle, sky gradient, bold "SKY / MEET" text, airplane in the Y,
// top-right badge (pin + clock + heart), cloud wisps, vapor trail arc.
// ─────────────────────────────────────────────────────────────────────────────
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Sky gradient: bright azure → deep sapphire -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#7dd3fc"/>
      <stop offset="40%"  stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>

  <!-- ── Squircle background ─────────────────────────────────── -->
  <rect width="512" height="512" rx="112" ry="112" fill="url(#bg)"/>

  <!-- ── Cloud wisps (top area) ─────────────────────────────── -->
  <g fill="white">
    <ellipse cx="105" cy="92"  rx="82"  ry="20" opacity="0.13"/>
    <ellipse cx="178" cy="77"  rx="62"  ry="16" opacity="0.10"/>
    <ellipse cx="365" cy="112" rx="72"  ry="19" opacity="0.09"/>
    <ellipse cx="435" cy="98"  rx="48"  ry="15" opacity="0.08"/>
  </g>

  <!-- ── Vapor / arc trail connecting Y → MEET ──────────────── -->
  <path d="M 310 200 Q 350 272 302 338"
        stroke="white" stroke-width="2.8" fill="none"
        opacity="0.30" stroke-linecap="round" stroke-dasharray="7 5"/>

  <!-- ── Airplane silhouette (emerges from the Y in SKY) ─────── -->
  <!--  transform: positioned at ~end-of-Y, rotated to fly up-right -->
  <g transform="translate(308,186) rotate(-42) scale(0.95)" fill="white">
    <!-- fuselage -->
    <ellipse cx="0" cy="0" rx="27" ry="7"/>
    <!-- nose cone -->
    <path d="M27,0 L40,-2 L40,2 Z"/>
    <!-- main wings -->
    <path d="M-3,-7 L-3,7 L-34,24 L-38,17 Z"/>
    <path d="M-3,-7 L-3,7 L-34,-24 L-38,-17 Z"/>
    <!-- tail fins -->
    <path d="M-20,-7 L-20, 0 L-35,-17 L-31,-14 Z"/>
    <path d="M-20, 0 L-20, 7 L-35, 17 L-31, 14 Z"/>
  </g>

  <!-- ── "SKY" — top line, slightly left of center for plane space ── -->
  <text x="218" y="222"
        font-family="'Arial Black', Arial, Helvetica, sans-serif"
        font-weight="900" font-size="116"
        fill="white" text-anchor="middle" letter-spacing="-2">SKY</text>

  <!-- ── "MEET" — bottom line, dominant & grounded ────────────── -->
  <text x="256" y="370"
        font-family="'Arial Black', Arial, Helvetica, sans-serif"
        font-weight="900" font-size="138"
        fill="white" text-anchor="middle" letter-spacing="-4">MEET</text>

  <!-- ── Top-right badge: location pin ＋ clock face ＋ heart ─── -->
  <g transform="translate(416,82)">
    <!-- pin body -->
    <path d="M0,-25 C-12,-25 -21,-16 -21,-5 C-21,9 0,30 0,30 C0,30 21,9 21,-5 C21,-16 12,-25 0,-25 Z"
          fill="white"/>
    <!-- clock face inside pin -->
    <circle cx="0" cy="-5" r="10" fill="#0ea5e9"/>
    <!-- clock hands: 10:10 -->
    <line x1="0" y1="-5" x2="-5.5" y2="-12" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <line x1="0" y1="-5" x2=" 5.5" y2="-12" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <circle cx="0" cy="-5" r="1.8" fill="white"/>
    <!-- heart (connection symbol) -->
    <path d="M0,36 C0,36 -9,29 -9,23 C-9,19 -5,17 0,21 C5,17 9,19 9,23 C9,29 0,36 0,36 Z"
          fill="white" opacity="0.88"/>
  </g>

  <!-- ── Outer white border (subtle) ───────────────────────── -->
  <rect width="512" height="512" rx="112" ry="112"
        fill="none" stroke="white" stroke-width="10" opacity="0.22"/>
</svg>`;

// ── Render and save ───────────────────────────────────────────────────────────
function renderAt(size, outPath) {
  const resvg = new Resvg(SVG, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  writeFileSync(outPath, png);
  console.log(`✓  ${outPath}  (${size}×${size})`);
}

renderAt(512, 'public/icon-512.png');
renderAt(512, 'public/icon.png');        // alias requested by user
renderAt(192, 'public/icon-192.png');
renderAt(180, 'public/apple-icon.png');

console.log('\nAll PWA icons generated!');
