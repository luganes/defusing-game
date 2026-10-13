// ================= Art: texturas y dibujos de cartas =================
// Tus fotos (ART_FILES) con dibujos propios de respaldo. Cada carta se reconoce
// por dibujo + color, sin leer.

import * as THREE from 'three';
import { refresh } from './ui.js';
import { G } from './game.js';

const BACK_CANVAS = document.createElement('canvas'); BACK_CANVAS.width = 256; BACK_CANVAS.height = 352;

function makeBack() {
  const g = BACK_CANVAS.getContext('2d');
  g.fillStyle = '#1a1a2e'; g.fillRect(0, 0, 256, 352);
  g.fillStyle = '#c9482e'; g.fillRect(14, 14, 228, 324);
  g.fillStyle = '#fff'; g.font = 'bold 80px serif'; g.textAlign = 'center'; g.fillText('💥', 128, 200);
  const t = new THREE.CanvasTexture(BACK_CANVAS); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const BACK = makeBack();

const CARD_BG = {
  'Exploding Kitten': '#5a0d0d', 'Defuse': '#0e5a34', 'Attack': '#4a1a5e',
  'Skip': '#14467d', 'Favor': '#8a6d14', 'Shuffle': '#3d4451',
  'See Future': '#2c2a6e', 'Nope': '#7c1212', 'Taco Cat': '#c07f1f',
  'Melon Cat': '#3f8a3c', 'Hairy Cat': '#7a5c33', 'Beardy Cat': '#8a5a2e', 'Rainbow Cat': '#4a3fb5',
};

const customArt = {};

function tryLoad(urls, onload) { // prueba candidatos en orden hasta que uno cargue
  const next = i => {
    if (i >= urls.length) return;
    const img = new Image();
    img.onload = () => onload(img);
    img.onerror = () => next(i + 1);
    img.src = encodeURI(urls[i]);
  };
  next(0);
}

// Tus fotos en art/ (versiones finales con "card" primero, luego las simples)
const ART_FILES = {
  'Exploding Kitten': ['art/explodingkitten.jpg'],
  'Defuse': ['art/Defuse Card.jpg', 'art/defuse.jpg'],
  'Attack': ['art/attack.jpg'],
  'Skip': ['art/Skip card.jpg', 'art/skip.jpg'],
  'Favor': ['art/Favor Card.jpg', 'art/favor.jpg'],
  'Shuffle': ['art/Shuffle Card.jpg', 'art/shuffle.jpg'],
  'See Future': ['art/SeeFuture Card.jpg', 'art/seefuture.jpg'],
  'Nope': ['art/Nope Card.jpg', 'art/nope.jpg'],
  'Taco Cat': ['art/TacoCat card.jpg', 'art/tacocat.jpg'],
  'Melon Cat': ['art/MelonCat card.jpg', 'art/meloncat.jpg'],
  'Hairy Cat': ['art/HairyCat Card.jpg', 'art/hairycat.jpg'],
  'Beardy Cat': ['art/Beardycat card.jpg', 'art/beardycat.jpg'],
  'Rainbow Cat': ['art/RainbowCat card.jpg', 'art/rainbowcat.jpg'],
};

// Versión ligera para la web (art/web/, mucho menos pesada); si no está, las originales.
const WEB_ART = { 'Exploding Kitten': 'explodingkitten', 'Defuse': 'defuse', 'Attack': 'attack', 'Skip': 'skip',
  'Favor': 'favor', 'Shuffle': 'shuffle', 'See Future': 'seefuture', 'Nope': 'nope', 'Taco Cat': 'tacocat',
  'Melon Cat': 'meloncat', 'Hairy Cat': 'hairycat', 'Beardy Cat': 'beardycat', 'Rainbow Cat': 'rainbowcat' };

Object.keys(CARD_BG).forEach(t => {
  tryLoad([...(WEB_ART[t] ? [`art/web/${WEB_ART[t]}.jpg`] : []), ...(ART_FILES[t] || [])], img => { customArt[t] = img; if (G) refresh(); });
});

function drawCover(g, img, x, y, w, h) { // encaja sin deformar (recorta centro)
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

{ // dorso: tu imagen de Gemini
  tryLoad(['art/web/back.jpg', 'art/Gemini_Generated_Image_3mzb1e3mzb1e3mzb.jpg'], back => {
    const g = BACK_CANVAS.getContext('2d');
    drawCover(g, back, 0, 0, 256, 352);
    BACK.needsUpdate = true;
    if (G) refresh();
  });
}

function circle(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }

function star(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5, a2 = a + Math.PI / 5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45);
    const a3 = a + Math.PI * 2 / 5;
    g.lineTo(cx + Math.cos(a3) * r, cy + Math.sin(a3) * r);
    g.closePath(); g.fill();
  }
}

function eyes(g, x1, y1, x2, y2, r) {
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x1, y1, r, 0, 7); g.fill();
  g.beginPath(); g.arc(x2, y2, r, 0, 7); g.fill();
  g.fillStyle = '#111';
  g.beginPath(); g.arc(x1, y1 + r * 0.15, r * 0.45, 0, 7); g.fill();
  g.beginPath(); g.arc(x2, y2 + r * 0.15, r * 0.45, 0, 7); g.fill();
}

function whiskers(g, cx, cy, s) {
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([d, e]) => {
    g.beginPath(); g.moveTo(cx + d * s * 0.35, cy + e * 8); g.lineTo(cx + d * s * 0.95, cy + e * 13); g.stroke();
  });
}

function catHead(g, cx, cy, r, fur, opts = {}) {
  g.fillStyle = fur;
  [-1, 1].forEach(d => {
    g.beginPath();
    g.moveTo(cx + d * r * 0.95, cy - r * 0.3);
    g.lineTo(cx + d * r * 0.72, cy - r * 1.3);
    g.lineTo(cx + d * r * 0.22, cy - r * 0.62);
    g.closePath(); g.fill();
    g.fillStyle = opts.ear || '#e8909c';
    g.beginPath();
    g.moveTo(cx + d * r * 0.76, cy - r * 0.48);
    g.lineTo(cx + d * r * 0.66, cy - r * 1.02);
    g.lineTo(cx + d * r * 0.36, cy - r * 0.6);
    g.closePath(); g.fill();
    g.fillStyle = fur;
  });
  if (opts.hair) {
    g.strokeStyle = '#2b1c10'; g.lineWidth = 5;
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(cx + i * r * 0.24, cy - r * 0.92); g.lineTo(cx + i * r * 0.32, cy - r * 1.32); g.stroke();
    }
  }
  g.lineWidth = 6; g.strokeStyle = '#1c1008';
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.stroke();
  if (opts.beard) {
    g.fillStyle = opts.beard;
    g.beginPath(); g.arc(cx, cy + r * 0.5, r * 0.85, 0, Math.PI); g.fill();
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(cx + i * r * 0.33, cy + r * 1.0, r * 0.22, 0, 7); g.fill(); }
  }
  const mood = opts.mood || (opts.happy ? 'happy' : 'normal');
  const ey = cy - r * 0.08;
  if (mood === 'happy') {
    g.strokeStyle = '#111'; g.lineWidth = 5;
    [-1, 1].forEach(d => { g.beginPath(); g.arc(cx + d * r * 0.35, ey, r * 0.2, Math.PI, 0); g.stroke(); });
  } else if (mood === 'wow') {
    circle(g, cx - r * 0.35, ey, r * 0.3, '#fff'); circle(g, cx + r * 0.35, ey, r * 0.3, '#fff');
    circle(g, cx - r * 0.35, ey + 2, r * 0.1, '#111'); circle(g, cx + r * 0.35, ey + 2, r * 0.1, '#111');
  } else if (mood === 'angry') {
    eyes(g, cx - r * 0.35, ey, cx + r * 0.35, ey, r * 0.24);
    g.strokeStyle = '#111'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(cx - r * 0.62, ey - r * 0.55); g.lineTo(cx - r * 0.1, ey - r * 0.25); g.stroke();
    g.beginPath(); g.moveTo(cx + r * 0.62, ey - r * 0.55); g.lineTo(cx + r * 0.1, ey - r * 0.25); g.stroke();
  } else if (mood === 'mischief') {
    g.fillStyle = '#fff';
    [-1, 1].forEach(d => { g.beginPath(); g.ellipse(cx + d * r * 0.35, ey, r * 0.28, r * 0.16, 0, 0, 7); g.fill(); });
    circle(g, cx - r * 0.28, ey, r * 0.1, '#111'); circle(g, cx + r * 0.42, ey, r * 0.1, '#111');
  } else {
    eyes(g, cx - r * 0.35, ey, cx + r * 0.35, ey, r * 0.26);
  }
  if (mood === 'wow') {
    g.fillStyle = '#5a0000';
    g.beginPath(); g.ellipse(cx, cy + r * 0.55, r * 0.22, r * 0.3, 0, 0, 7); g.fill();
  } else if (mood === 'angry') {
    g.strokeStyle = '#111'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy + r * 0.62, r * 0.28, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  } else if (mood === 'mischief') {
    g.strokeStyle = '#111'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx + r * 0.1, cy + r * 0.38, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  } else {
    g.fillStyle = '#e86a7a';
    g.beginPath(); g.moveTo(cx - r * 0.12, cy + r * 0.27); g.lineTo(cx + r * 0.12, cy + r * 0.27); g.lineTo(cx, cy + r * 0.4); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, cy + r * 0.4); g.lineTo(cx, cy + r * 0.52); g.stroke();
    g.beginPath(); g.arc(cx - r * 0.15, cy + r * 0.5, r * 0.15, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(cx + r * 0.15, cy + r * 0.5, r * 0.15, 0, Math.PI); g.stroke();
  }
  if (opts.blush) {
    g.fillStyle = 'rgba(232,106,122,.55)';
    g.beginPath(); g.ellipse(cx - r * 0.62, cy + r * 0.3, r * 0.16, r * 0.11, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + r * 0.62, cy + r * 0.3, r * 0.16, r * 0.11, 0, 0, 7); g.fill();
  }
  if (opts.sweat) {
    g.fillStyle = '#7ec8e3';
    g.beginPath(); g.ellipse(cx + r * 0.85, cy - r * 0.55, r * 0.12, r * 0.18, 0.3, 0, 7); g.fill();
  }
  whiskers(g, cx, cy + r * 0.4, r);
}

function burst(g, cx, cy, r1, r2, n, color) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = (i / (n * 2)) * Math.PI * 2;
    i ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
}

function rays(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a, a + Math.PI / 12); g.closePath(); g.fill();
  }
}

const ART = {
  'Exploding Kitten'(g) {
    burst(g, 128, 165, 132, 62, 12, '#ffb300');
    burst(g, 128, 165, 96, 44, 12, '#ff5722');
    burst(g, 128, 165, 58, 26, 10, '#fff3c4');
    g.fillStyle = '#141414';
    g.beginPath(); g.ellipse(128, 205, 50, 58, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(128, 132, 42, 0, 7); g.fill();
    [-1, 1].forEach(d => {
      g.beginPath();
      g.moveTo(128 + d * 38, 105); g.lineTo(128 + d * 30, 62); g.lineTo(128 + d * 8, 95);
      g.closePath(); g.fill();
    });
    eyes(g, 112, 128, 144, 128, 13);
    g.fillStyle = '#141414';
    g.beginPath(); g.ellipse(128, 158, 10, 14, 0, 0, 7); g.fill();
    for (let i = 0; i < 8; i++) star(g, 20 + Math.random() * 216, 20 + Math.random() * 250, 7, '#ffe066');
  },
  'Defuse'(g) {
    g.fillStyle = '#dfe6ea';
    g.beginPath();
    g.moveTo(128, 60); g.lineTo(196, 90); g.lineTo(196, 165);
    g.quadraticCurveTo(196, 225, 128, 265); g.quadraticCurveTo(60, 225, 60, 165);
    g.lineTo(60, 90); g.closePath(); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#222'; g.stroke();
    g.strokeStyle = '#1faa55'; g.lineWidth = 14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(95, 160); g.lineTo(120, 188); g.lineTo(168, 128); g.stroke();
    g.lineCap = 'butt';
    g.strokeStyle = '#c0392b'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(30, 285); g.lineTo(100, 285); g.stroke();
    g.strokeStyle = '#2980b9'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(156, 285); g.lineTo(226, 285); g.stroke();
    burst(g, 128, 285, 26, 12, 8, '#ffe066');
  },
  'Attack'(g) {
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6;
    [-1, 1].forEach(d => { g.beginPath(); g.arc(128, 170, 95, d > 0 ? -0.9 : Math.PI - 0.9, d > 0 ? 0.9 : Math.PI + 0.9); g.stroke(); });
    [-1, 1].forEach(d => {
      g.save(); g.translate(128, 165); g.rotate(d * 0.6);
      g.fillStyle = '#cfd6dd'; g.fillRect(-11, -120, 22, 130);
      g.beginPath(); g.moveTo(-11, -120); g.lineTo(11, -120); g.lineTo(0, -152); g.closePath(); g.fill();
      g.fillStyle = '#d4a017'; g.fillRect(-30, 8, 60, 16);
      g.fillStyle = '#5a3a1a'; g.fillRect(-9, 24, 18, 60);
      circle(g, 0, 92, 13, '#d4a017');
      g.restore();
    });
  },
  'Skip'(g) {
    g.fillStyle = 'rgba(255,255,255,.9)';
    [0, 1].forEach(k => {
      const x = 78 + k * 62;
      g.beginPath(); g.moveTo(x, 90); g.lineTo(x + 58, 165); g.lineTo(x, 240); g.closePath(); g.fill();
    });
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(24, 70 + i * 40); g.lineTo(52, 70 + i * 40); g.stroke();
      g.beginPath(); g.moveTo(204, 70 + i * 40); g.lineTo(232, 70 + i * 40); g.stroke();
    }
  },
  'Favor'(g) {
    g.fillStyle = '#a93226'; g.fillRect(68, 130, 120, 100);
    g.fillStyle = '#7b241c'; g.fillRect(68, 130, 120, 18);
    g.fillStyle = '#f1c40f'; g.fillRect(118, 130, 20, 100);
    g.fillStyle = '#f1c40f'; g.fillRect(58, 108, 140, 24);
    g.fillStyle = '#f7dc6f';
    g.beginPath(); g.ellipse(108, 92, 24, 16, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(148, 92, 24, 16, 0.5, 0, 7); g.fill();
    circle(g, 128, 108, 12, '#c0392b');
    g.fillStyle = '#e91e63';
    g.beginPath();
    g.moveTo(128, 285);
    g.bezierCurveTo(80, 250, 95, 215, 128, 232);
    g.bezierCurveTo(161, 215, 176, 250, 128, 285);
    g.fill();
  },
  'Shuffle'(g) {
    g.strokeStyle = '#fff'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 110); g.bezierCurveTo(110, 110, 140, 200, 210, 210); g.stroke();
    g.beginPath(); g.moveTo(40, 220); g.bezierCurveTo(110, 220, 140, 130, 210, 120); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#fff';
    [[216, 210, 0.5], [216, 120, -0.5]].forEach(([x, y, r]) => {
      g.save(); g.translate(x, y); g.rotate(r);
      g.beginPath(); g.moveTo(0, -20); g.lineTo(26, 8); g.lineTo(-4, 8); g.closePath(); g.fill();
      g.restore();
    });
  },
  'See Future'(g) {
    for (let i = 0; i < 10; i++) star(g, 25 + Math.random() * 206, 30 + Math.random() * 240, 8, '#ffe066');
    const grad = g.createRadialGradient(108, 140, 10, 128, 165, 85);
    grad.addColorStop(0, '#d6ecff'); grad.addColorStop(1, '#5dade2');
    g.fillStyle = grad;
    g.beginPath(); g.arc(128, 165, 78, 0, 7); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#1a2a6b'; g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(128, 165, 48, 30, 0, 0, 7); g.fill();
    circle(g, 128, 165, 17, '#1a2a6b');
    circle(g, 128, 165, 8, '#000');
    circle(g, 122, 158, 5, 'rgba(255,255,255,.9)');
    g.fillStyle = '#8e6f3e'; g.fillRect(88, 245, 80, 22);
  },
  'Nope'(g) {
    g.save(); g.translate(128, 160); g.rotate(-0.12);
    g.fillStyle = '#f5f1e6'; g.fillRect(-62, -80, 124, 160);
    g.lineWidth = 6; g.strokeStyle = '#222'; g.strokeRect(-62, -80, 124, 160);
    g.fillStyle = '#4a3fb5'; g.fillRect(-48, -66, 96, 70);
    g.fillStyle = '#111'; g.fillRect(-48, 20, 96, 12);
    g.restore();
    g.lineWidth = 26; g.strokeStyle = '#e60000';
    g.beginPath(); g.arc(128, 160, 88, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(66, 222); g.lineTo(190, 98); g.stroke();
  },
  'Taco Cat'(g) {
    g.fillStyle = '#8a5a2e';
    g.beginPath(); g.arc(128, 175, 88, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = '#e8b64c';
    g.beginPath(); g.arc(128, 175, 76, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = '#c98f2e';
    for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; circle(g, 128 + Math.cos(a) * 62, 175 + Math.sin(a) * 62, 5, '#c98f2e'); }
    g.fillStyle = '#58b368';
    for (let i = 0; i < 7; i++) { const x = 62 + i * 22; g.beginPath(); g.arc(x, 168, 14, Math.PI, 0); g.fill(); }
    g.fillStyle = '#e74c3c';
    circle(g, 92, 160, 9, '#e74c3c'); circle(g, 164, 160, 9, '#e74c3c');
    catHead(g, 128, 175, 52, '#f0c987', { happy: true });
  },
  'Melon Cat'(g) {
    g.fillStyle = '#1e6b22';
    g.beginPath(); g.ellipse(128, 180, 88, 80, 0, 0, 7); g.fill();
    g.strokeStyle = '#14501a'; g.lineWidth = 10;
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.ellipse(128, 180, 58 + Math.abs(i) * 12, 74, i * 0.12, 0, 7); g.stroke();
    }
    g.strokeStyle = '#5a3a1a'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(128, 102); g.quadraticCurveTo(132, 84, 148, 78); g.stroke();
    catHead(g, 128, 175, 50, '#7bc96f', { happy: true });
  },
  'Hairy Cat'(g) {
    g.fillStyle = '#8a6a3e';
    g.beginPath(); g.ellipse(128, 185, 80, 88, 0.1, 0, 7); g.fill();
    g.fillStyle = '#6e532e';
    circle(g, 95, 150, 9, '#6e532e'); circle(g, 160, 170, 11, '#6e532e'); circle(g, 120, 220, 8, '#6e532e');
    g.strokeStyle = '#2b1c10'; g.lineWidth = 6;
    for (let i = -3; i <= 3; i++) {
      g.beginPath(); g.moveTo(128 + i * 20, 108); g.quadraticCurveTo(128 + i * 24, 82, 128 + i * 30, 66); g.stroke();
    }
    catHead(g, 128, 180, 50, '#a9804e', { hair: true, happy: true });
  },
  'Beardy Cat'(g) {
    catHead(g, 128, 150, 62, '#c98d4b', { beard: '#f3e6cf' });
  },
  'Rainbow Cat'(g) {
    const cols = ['#e60000', '#ff8c00', '#ffe066', '#35b835', '#4da3ff'];
    g.lineWidth = 15;
    cols.forEach((c, i) => {
      g.strokeStyle = c;
      g.beginPath(); g.arc(128, 210, 100 - i * 15, Math.PI, 0); g.stroke();
    });
    for (let i = 0; i < 6; i++) star(g, 30 + Math.random() * 196, 40 + Math.random() * 120, 8, '#fff');
    catHead(g, 128, 200, 52, '#9d8df1', { happy: true });
  },
};

// ===== Segunda pasada: personalidad (expresiones, movimiento, accesorios) =====
ART['Exploding Kitten'] = function (g) {
  rays(g, 128, 165, 210, 'rgba(255,255,255,.07)');
  burst(g, 128, 165, 140, 66, 12, '#ffb300');
  burst(g, 128, 165, 102, 46, 12, '#ff5722');
  burst(g, 128, 165, 62, 26, 10, '#fff3c4');
  g.fillStyle = '#141414'; // gato en pánico, orejas aplastadas
  g.beginPath(); g.ellipse(128, 210, 52, 56, 0, 0, 7); g.fill();
  [-1, 1].forEach(d => {
    g.beginPath();
    g.moveTo(128 + d * 40, 108); g.lineTo(128 + d * 80, 92); g.lineTo(128 + d * 44, 128);
    g.closePath(); g.fill();
  });
  g.beginPath(); g.arc(128, 134, 44, 0, 7); g.fill();
  circle(g, 111, 130, 15, '#fff'); circle(g, 145, 130, 15, '#fff');
  circle(g, 111, 132, 6, '#111'); circle(g, 145, 132, 6, '#111');
  g.fillStyle = '#5a0000';
  g.beginPath(); g.ellipse(128, 164, 12, 16, 0, 0, 7); g.fill();
  g.fillStyle = '#2b2b2b';
  circle(g, 40, 60, 8, '#2b2b2b'); circle(g, 216, 70, 6, '#2b2b2b');
  circle(g, 60, 280, 7, '#2b2b2b'); circle(g, 200, 275, 9, '#2b2b2b');
  for (let i = 0; i < 6; i++) star(g, 25 + Math.random() * 206, 25 + Math.random() * 240, 8, '#ffe066');
};

ART['Attack'] = function (g) {
  rays(g, 128, 165, 210, 'rgba(255,255,255,.06)');
  g.save(); g.translate(128, 150); g.rotate(-0.6); // espadazo en diagonal
  g.fillStyle = '#cfd6dd'; g.fillRect(-13, -140, 26, 150);
  g.beginPath(); g.moveTo(-13, -140); g.lineTo(13, -140); g.lineTo(0, -176); g.closePath(); g.fill();
  g.fillStyle = '#d4a017'; g.fillRect(-34, 8, 68, 18);
  g.fillStyle = '#5a3a1a'; g.fillRect(-10, 26, 20, 66);
  circle(g, 0, 104, 14, '#d4a017');
  g.restore();
  burst(g, 200, 80, 44, 20, 8, '#fff');
  circle(g, 200, 80, 12, '#ffb300');
  catHead(g, 110, 215, 54, '#8a8a8a', { mood: 'angry', blush: true });
  g.fillStyle = '#c0392b'; g.fillRect(50, 150, 124, 17); // cinta de guerra
  circle(g, 176, 158, 10, '#c0392b');
};

ART['Skip'] = function (g) {
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 8; // viento
  for (let i = 0; i < 5; i++) {
    g.beginPath(); g.moveTo(18, 80 + i * 34); g.lineTo(66, 80 + i * 34); g.stroke();
    g.beginPath(); g.moveTo(190, 80 + i * 34); g.lineTo(238, 80 + i * 34); g.stroke();
  }
  catHead(g, 128, 160, 56, '#e8a13d', { mood: 'wow', sweat: true });
  g.fillStyle = '#fff'; // »» corriendo
  [0, 1].forEach(k => {
    const x = 196 + k * 24;
    g.beginPath(); g.moveTo(x, 44); g.lineTo(x + 22, 66); g.lineTo(x, 88); g.closePath(); g.fill();
  });
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(128, 252, 70, 12, 0, 0, 7); g.fill();
};

ART['Favor'] = function (g) {
  rays(g, 128, 165, 210, 'rgba(255,255,255,.08)');
  g.fillStyle = '#a93226'; g.fillRect(48, 205, 105, 80); // regalo
  g.fillStyle = '#7b241c'; g.fillRect(48, 205, 105, 16);
  g.fillStyle = '#f1c40f'; g.fillRect(93, 205, 18, 80);
  g.fillStyle = '#f1c40f'; g.fillRect(40, 188, 121, 20);
  g.fillStyle = '#f7dc6f';
  g.beginPath(); g.ellipse(80, 176, 20, 13, -0.5, 0, 7); g.fill();
  g.beginPath(); g.ellipse(116, 176, 20, 13, 0.5, 0, 7); g.fill();
  circle(g, 98, 190, 10, '#c0392b');
  catHead(g, 172, 140, 50, '#c9a06a', { mood: 'mischief', blush: true }); // ojitos de favor
  g.strokeStyle = '#c9a06a'; g.lineWidth = 17; g.lineCap = 'round'; // patita pidiendo
  g.beginPath(); g.moveTo(150, 200); g.quadraticCurveTo(128, 222, 112, 212); g.stroke();
  g.lineCap = 'butt';
  for (let i = 0; i < 5; i++) star(g, 30 + Math.random() * 196, 30 + Math.random() * 100, 7, '#fff3c4');
};

ART['Shuffle'] = function (g) {
  catHead(g, 66, 96, 26, '#95a5a6', { mood: 'wow' });
  catHead(g, 190, 234, 26, '#e8a13d', { mood: 'happy' });
  g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round';
  g.beginPath(); g.moveTo(40, 130); g.bezierCurveTo(110, 130, 140, 200, 205, 205); g.stroke();
  g.beginPath(); g.moveTo(40, 215); g.bezierCurveTo(110, 215, 140, 145, 205, 140); g.stroke();
  g.lineCap = 'butt';
  g.fillStyle = '#fff';
  [[211, 205, 0.5], [211, 140, -0.5]].forEach(([x, y, r]) => {
    g.save(); g.translate(x, y); g.rotate(r);
    g.beginPath(); g.moveTo(0, -20); g.lineTo(26, 8); g.lineTo(-4, 8); g.closePath(); g.fill();
    g.restore();
  });
};

ART['See Future'] = function (g) {
  for (let i = 0; i < 10; i++) star(g, 25 + Math.random() * 206, 30 + Math.random() * 240, 8, '#ffe066');
  const grad = g.createRadialGradient(108, 100, 8, 128, 118, 62);
  grad.addColorStop(0, '#eaf6ff'); grad.addColorStop(1, '#5dade2');
  g.fillStyle = grad;
  g.beginPath(); g.arc(128, 118, 58, 0, 7); g.fill();
  g.lineWidth = 7; g.strokeStyle = '#1a2a6b'; g.stroke();
  g.fillStyle = '#1a2a6b'; // remolino del futuro
  g.beginPath(); g.arc(128, 118, 34, 0.6, 4.2); g.stroke();
  g.lineWidth = 9;
  g.beginPath(); g.arc(128, 118, 20, 2.2, 6.0); g.stroke();
  circle(g, 128, 118, 7, '#1a2a6b');
  circle(g, 112, 100, 9, 'rgba(255,255,255,.85)');
  g.fillStyle = '#8e6f3e'; g.fillRect(96, 180, 64, 16);
  catHead(g, 128, 245, 44, '#7d7d9e', { mood: 'wow' }); // mirando la bola
};

ART['Nope'] = function (g) {
  catHead(g, 128, 175, 58, '#777', { mood: 'angry' });
  g.lineWidth = 30; g.strokeStyle = '#e60000';
  g.beginPath(); g.arc(128, 165, 95, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(60, 232); g.lineTo(196, 98); g.stroke();
};

ART['Taco Cat'] = function (g) {
  rays(g, 128, 175, 210, 'rgba(255,255,255,.08)');
  g.fillStyle = '#8a5a2e';
  g.beginPath(); g.arc(128, 175, 88, Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = '#e8b64c';
  g.beginPath(); g.arc(128, 175, 76, Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = '#c98f2e';
  for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; circle(g, 128 + Math.cos(a) * 62, 175 + Math.sin(a) * 62, 5, '#c98f2e'); }
  g.fillStyle = '#58b368';
  for (let i = 0; i < 7; i++) { const x = 62 + i * 22; g.beginPath(); g.arc(x, 168, 14, Math.PI, 0); g.fill(); }
  g.fillStyle = '#e74c3c';
  circle(g, 92, 160, 9, '#e74c3c'); circle(g, 164, 160, 9, '#e74c3c');
  catHead(g, 128, 175, 52, '#f0c987', { mood: 'happy', blush: true });
};

ART['Melon Cat'] = function (g) {
  rays(g, 128, 180, 210, 'rgba(255,255,255,.08)');
  g.fillStyle = '#1e6b22';
  g.beginPath(); g.ellipse(128, 180, 88, 80, 0, 0, 7); g.fill();
  g.strokeStyle = '#14501a'; g.lineWidth = 10;
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.ellipse(128, 180, 58 + Math.abs(i) * 12, 74, i * 0.12, 0, 7); g.stroke();
  }
  g.strokeStyle = '#5a3a1a'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(128, 102); g.quadraticCurveTo(132, 84, 148, 78); g.stroke();
  g.fillStyle = '#2e8a34';
  g.beginPath(); g.ellipse(80, 130, 14, 22, -0.3, 0, 7); g.fill();
  catHead(g, 128, 175, 50, '#7bc96f', { mood: 'happy', blush: true });
};

ART['Hairy Cat'] = function (g) {
  rays(g, 128, 185, 210, 'rgba(255,255,255,.07)');
  g.fillStyle = '#8a6a3e';
  g.beginPath(); g.ellipse(128, 185, 80, 88, 0.1, 0, 7); g.fill();
  g.fillStyle = '#6e532e';
  circle(g, 95, 150, 9, '#6e532e'); circle(g, 160, 170, 11, '#6e532e'); circle(g, 120, 220, 8, '#6e532e');
  g.strokeStyle = '#2b1c10'; g.lineWidth = 6;
  for (let i = -3; i <= 3; i++) {
    g.beginPath(); g.moveTo(128 + i * 20, 108); g.quadraticCurveTo(128 + i * 24, 82, 128 + i * 30, 66); g.stroke();
  }
  catHead(g, 128, 180, 50, '#a9804e', { hair: true, mood: 'mischief', blush: true });
};

ART['Beardy Cat'] = function (g) {
  rays(g, 128, 165, 210, 'rgba(255,255,255,.07)');
  catHead(g, 128, 150, 62, '#c98d4b', { beard: '#f3e6cf' });
  g.strokeStyle = '#d4a017'; g.lineWidth = 5; // monóculo distinguido
  g.beginPath(); g.arc(128 + 62 * 0.35, 150 - 62 * 0.08, 62 * 0.34, 0, 7); g.stroke();
  g.beginPath();
  g.moveTo(128 + 62 * 0.6, 150 + 62 * 0.2);
  g.quadraticCurveTo(128 + 62 * 0.95, 150 + 62 * 0.8, 128 + 62 * 0.5, 150 + 62 * 1.2);
  g.stroke();
  star(g, 40, 70, 10, '#fff3c4'); star(g, 216, 90, 10, '#fff3c4');
};

ART['Rainbow Cat'] = function (g) {
  const cols = ['#e60000', '#ff8c00', '#ffe066', '#35b835', '#4da3ff'];
  g.lineWidth = 15;
  cols.forEach((c, i) => {
    g.strokeStyle = c;
    g.beginPath(); g.arc(128, 215, 102 - i * 15, Math.PI, 0); g.stroke();
  });
  for (let i = 0; i < 8; i++) star(g, 25 + Math.random() * 206, 30 + Math.random() * 130, 8, '#fff');
  catHead(g, 128, 205, 52, '#9d8df1', { mood: 'happy', blush: true });
  g.fillStyle = '#e91e63'; // gorrito de fiesta
  g.beginPath(); g.moveTo(100, 158); g.lineTo(128, 92); g.lineTo(150, 152); g.closePath(); g.fill();
  g.fillStyle = '#ffe066';
  for (let i = 0; i < 3; i++) g.fillRect(106 + i * 14, 138 - i * 12, 12, 8);
  circle(g, 128, 90, 9, '#fff');
};

ART['Defuse'] = function (g) {
  rays(g, 128, 165, 210, 'rgba(255,255,255,.08)');
  g.fillStyle = '#dfe6ea';
  g.beginPath();
  g.moveTo(128, 55); g.lineTo(198, 86); g.lineTo(198, 162);
  g.quadraticCurveTo(198, 224, 128, 266); g.quadraticCurveTo(58, 224, 58, 162);
  g.lineTo(58, 86); g.closePath(); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#222'; g.stroke();
  g.strokeStyle = '#1faa55'; g.lineWidth = 15; g.lineCap = 'round';
  g.beginPath(); g.moveTo(93, 158); g.lineTo(119, 188); g.lineTo(169, 126); g.stroke();
  g.lineCap = 'butt';
  g.strokeStyle = '#c0392b'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(28, 288); g.lineTo(98, 288); g.stroke();
  g.strokeStyle = '#2980b9'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(158, 288); g.lineTo(228, 288); g.stroke();
  burst(g, 128, 288, 26, 12, 8, '#ffe066');
  for (let i = 0; i < 4; i++) star(g, 35 + Math.random() * 186, 40 + Math.random() * 60, 7, '#fff');
};

export function paintCard(type, g, W, H) {
  if (customArt[type] && customArt[type].naturalWidth) {
    drawCover(g, customArt[type], 0, 0, W, H);
  } else {
    g.fillStyle = CARD_BG[type] || '#333'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, W, H * 0.35);
    (ART[type] || ART['Shuffle'])(g, W, H);
  }
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
  g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(10, H - 58, W - 20, 48);
  g.fillStyle = '#fff'; g.font = 'bold 21px sans-serif'; g.textAlign = 'center';
  const words = type.toUpperCase().split(' ');
  g.fillText(words.length > 1 ? words.join(' ') : type.toUpperCase(), W / 2, H - 26);
}

export function frontTex(type) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 352;
  paintCard(type, c.getContext('2d'), 256, 352);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const urlCache = {};

export function cardURL(type) {
  if (customArt[type]) return customArt[type].src;
  if (!urlCache[type]) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 352;
    paintCard(type, c.getContext('2d'), 256, 352);
    urlCache[type] = c.toDataURL();
  }
  return urlCache[type];
}
