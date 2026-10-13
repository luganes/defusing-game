// ================= El local: club de jazz acogedor =================
// Todo cuelga del grupo recibido (aquí llamado scene para no tocar el código):
// al ocultar el grupo se oculta la sala entera.
// Luz cálida y baja: lámpara de mesa de juego sobre vuestra mesa, velas en las mesitas,
// apliques en las paredes, barra con botellas retroiluminadas y un pequeño escenario.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TABLE_R } from '../config.js';

// Mesitas del público (NO mover: world.js sienta ahí a los figurantes)
const SIDE_TABLES = [
  [-5.4, -4.4, 0.4], [5.6, -3.8, 2.1], [-6.3, 1.6, 1.2], [6.5, 1.2, 3.3], [0, -7.4, 4.4],
  [-5.5, 6.2, 5.5], [5.5, 5.8, 6.6], [-9, 4.5, 7.7], [9, 4.0, 8.8],
];
const ROOM = 15;      // media anchura de la sala (paredes en ±15)
const CEIL = 6.4;     // techo bajo: más recogido

// Plazas de figurantes (3 por mesa, detrás de su taburete mirando a la mesa).
export function getSideSpots() {
  const spots = [];
  SIDE_TABLES.forEach(([cx, cz, seed]) => {
    for (let k = 0; k < 3; k++) {
      const a = seed + k * (Math.PI * 2 / 3);
      const sx = cx + Math.sin(a) * 1.75, sz = cz + Math.cos(a) * 1.75;
      spots.push({ x: cx + (sx - cx) * 1.18, z: cz + (sz - cz) * 1.18, tx: cx, tz: cz });
    }
  });
  return spots;
}

// ---------- Utilidades ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
  return t;
}
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); // siempre igual
const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

// Brillo suave (halo) para bombillas y velas: un sprite aditivo, sin coste de luz real
let glowTex = null;
function glow(color, size, opacity = 0.8) {
  glowTex ||= canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

// ---------- Texturas pintadas a mano (canvas) ----------
function woodFloorTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 300;
      while (x < w) {
        const len = 180 + rnd() * 200, tone = 0.75 + rnd() * 0.35;
        g.fillStyle = `rgb(${Math.round(92 * tone)},${Math.round(56 * tone)},${Math.round(30 * tone)})`;
        g.fillRect(x, r * rh, len, rh);
        g.strokeStyle = 'rgba(30,15,6,0.25)'; g.lineWidth = 1; // vetas
        for (let k = 0; k < 6; k++) {
          const y = r * rh + 4 + rnd() * (rh - 8);
          g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 6, x + len * 0.7, y + (rnd() - 0.5) * 6, x + len, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(15,7,3,0.85)'; g.fillRect(x, r * rh, 2, rh); // junta
        x += len;
      }
      g.fillStyle = 'rgba(15,7,3,0.9)'; g.fillRect(0, r * rh, w, 2);
    }
  }, 7, 7);
}
function wallpaperTex() { // damasco granate con dibujo dorado tenue
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#4a1620'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(214,160,90,0.22)'; g.fillStyle = 'rgba(214,160,90,0.13)'; g.lineWidth = 3;
    const motif = (cx, cy, s) => {
      g.beginPath(); // medallón (rombo curvo) con hoja en el centro
      g.moveTo(cx, cy - 56 * s); g.quadraticCurveTo(cx + 42 * s, cy, cx, cy + 56 * s);
      g.quadraticCurveTo(cx - 42 * s, cy, cx, cy - 56 * s); g.stroke();
      g.beginPath(); g.ellipse(cx, cy, 10 * s, 24 * s, 0, 0, Math.PI * 2); g.fill();
      for (const d of [-1, 1]) {
        g.beginPath(); g.moveTo(cx, cy + 10 * s);
        g.quadraticCurveTo(cx + d * 30 * s, cy - 6 * s, cx + d * 22 * s, cy - 30 * s); g.stroke();
      }
    };
    motif(w / 2, w / 2, 1); motif(0, 0, 1); motif(w, 0, 1); motif(0, w, 1); motif(w, w, 1);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < w; i += 16) g.fillRect(i, 0, 1, w); // rayado muy fino
  }, 10, 2.2);
}
function rugTex() { // alfombra redonda persa (granate, oro y azul noche)
  return canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    const ring = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill(); };
    ring(512, '#2b0f12'); ring(500, '#c79a4a'); ring(484, '#6e1a22'); ring(420, '#c79a4a'); ring(410, '#1d2440');
    ring(330, '#7a2028'); ring(140, '#c79a4a'); ring(128, '#1d2440');
    g.save(); g.translate(c, c);
    for (let k = 0; k < 24; k++) { // hojas del borde
      g.rotate(Math.PI / 12); g.fillStyle = '#d8b06a';
      g.beginPath(); g.ellipse(0, -452, 10, 24, 0, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 16; k++) { // pétalos del campo
      g.rotate(Math.PI / 8);
      g.fillStyle = '#a63a3a'; g.beginPath(); g.ellipse(0, -235, 40, 85, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d8b06a'; g.beginPath(); g.ellipse(0, -235, 12, 40, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8d2a0'; g.beginPath(); g.arc(0, -372, 9, 0, Math.PI * 2); g.fill();
    }
    for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = '#7a2028'; g.beginPath(); g.ellipse(0, -70, 18, 46, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    const img = g.getImageData(0, 0, w, w), d = img.data; // textura de lana
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  });
}
function runnerTex() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#5e161d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c79a4a'; g.fillRect(0, 8, w, 6); g.fillRect(0, h - 14, w, 6);
    g.fillStyle = '#1d2440';
    for (let x = 30; x < w; x += 60) { g.beginPath(); g.moveTo(x, h / 2 - 28); g.lineTo(x + 22, h / 2); g.lineTo(x, h / 2 + 28); g.lineTo(x - 22, h / 2); g.fill(); }
  }, 3, 1);
}
function feltTex() {
  return canvasTex(512, 512, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 40, w / 2, w / 2, w / 2);
    r.addColorStop(0, '#16804a'); r.addColorStop(1, '#0b4a2a');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(230,200,120,0.35)'; g.lineWidth = 4;
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.44, 0, Math.PI * 2); g.stroke();
    const img = g.getImageData(0, 0, w, w), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  });
}
function curtainTex() {
  return canvasTex(512, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 16; i++) gr.addColorStop(i / 16, i % 2 ? '#3a0710' : '#8a1626');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function neonTex() { // cartel inventado del local
  return canvasTex(1024, 320, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const line = (txt, y, size, col) => {
      g.font = `italic 700 ${size}px "Segoe Script", "Brush Script MT", "Lobster", cursive`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.lineJoin = 'round';
      for (const [b, lw, a] of [[40, 14, 0.35], [18, 8, 0.7], [6, 3, 1]]) {
        g.shadowBlur = b; g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = lw; g.strokeText(txt, w / 2, y);
      }
      g.globalAlpha = 1; g.shadowBlur = 0; g.fillStyle = '#fff4fb'; g.fillText(txt, w / 2, y);
    };
    line('Kittens Club', 120, 132, '#ff4fb4');
    g.font = '700 46px "Nunito", "Segoe UI", sans-serif'; g.textAlign = 'center';
    g.shadowColor = '#5fd4ff'; g.shadowBlur = 22; g.fillStyle = '#d8f6ff';
    g.fillText('·  LIVE JAZZ  ·  CARDS  ·  BOOM  ·', w / 2, 252);
  });
}
function paintingTex(kind) { // cuadros originales y sencillos
  return canvasTex(256, 320, (g, w, h) => {
    if (kind === 0) { // gato en el tejado bajo la luna
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#13183a'); sky.addColorStop(1, '#3b2a5a');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3e4b0'; g.beginPath(); g.arc(170, 90, 46, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,230,0.7)'; g.fillRect(rnd() * w, rnd() * 160, 2, 2); }
      g.fillStyle = '#0c0c14'; g.fillRect(0, 240, w, 80);
      g.beginPath(); g.moveTo(0, 240); g.lineTo(60, 205); g.lineTo(130, 240); g.fill();
      g.beginPath(); g.ellipse(170, 222, 26, 22, 0, 0, Math.PI * 2); g.fill(); // cuerpo
      g.beginPath(); g.arc(170, 190, 14, 0, Math.PI * 2); g.fill(); // cabeza
      g.beginPath(); g.moveTo(158, 184); g.lineTo(160, 168); g.lineTo(168, 180); g.fill();
      g.beginPath(); g.moveTo(182, 184); g.lineTo(180, 168); g.lineTo(172, 180); g.fill();
      g.strokeStyle = '#0c0c14'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(194, 232); g.quadraticCurveTo(222, 230, 214, 200); g.stroke(); // cola
    } else if (kind === 1) { // abstracto: círculos y líneas (tipo música)
      g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
      [['#b33a3a', 80, 90, 52], ['#1d3a6e', 170, 170, 64], ['#e0a030', 110, 230, 34], ['#2a2a2a', 190, 70, 18]]
        .forEach(([c, x, y, r]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 3;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(20, 270 + i * 8); g.lineTo(236, 250 + i * 8); g.stroke(); }
      g.lineWidth = 2; g.beginPath(); g.moveTo(30, 30); g.lineTo(230, 300); g.stroke();
    } else { // sol art déco
      g.fillStyle = '#1b2a2a'; g.fillRect(0, 0, w, h);
      g.save(); g.translate(w / 2, h * 0.62);
      for (let i = 0; i < 18; i++) {
        g.rotate(Math.PI / 18); g.fillStyle = i % 2 ? '#c79a4a' : '#8a6a2a';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-12, -260); g.lineTo(12, -260); g.fill();
      }
      g.restore();
      g.fillStyle = '#e8c070'; g.beginPath(); g.arc(w / 2, h * 0.62, 50, Math.PI, 0); g.fill();
      g.fillStyle = '#1b2a2a'; g.fillRect(0, h * 0.62, w, h);
      g.strokeStyle = '#c79a4a'; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(30, h * 0.7 + i * 14); g.lineTo(w - 30, h * 0.7 + i * 14); g.stroke(); }
    }
  });
}
function keysTex() {
  return canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
    const n = 36, kw = w / n;
    g.fillStyle = '#555'; for (let i = 0; i <= n; i++) g.fillRect(i * kw, 0, 1, h);
    g.fillStyle = '#111';
    for (let i = 0; i < n; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) g.fillRect((i + 0.65) * kw, 0, kw * 0.7, h * 0.6);
  });
}

// =====================================================================
export function buildCasino(scene, { cardMesh, BACK, tips }) {
  const flicker = []; // luces que tiemblan (velas)
  const ceiling = new THREE.Group(); scene.add(ceiling); // se oculta si la cámara sube por encima
  const darkWood = std(0x3a2212, 0.6), midWood = std(0x6b3f1d, 0.55), brass = std(0xc9a14a, 0.35, 0.8);
  const leather = std(0x5a1a14, 0.55), leatherDark = std(0x2a0e0a, 0.6), black = std(0x111111, 0.25, 0.2);
  const add = (geo, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ===== Suelo de tarima y alfombras =====
  const floor = add(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), std(0xffffff, 0.7, 0, { map: woodFloorTex() }), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  const rug = add(new THREE.CircleGeometry(4.7, 64), std(0xffffff, 1, 0, { map: rugTex() }), 0, 0.012, 0);
  rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true;
  const runner = add(new THREE.PlaneGeometry(11, 1.6), std(0xffffff, 1, 0, { map: runnerTex() }), 0, 0.01, -10.6);
  runner.rotation.x = -Math.PI / 2; runner.receiveShadow = true;

  // ===== Paredes: zócalo de madera con cuarterones + papel damasco + molduras doradas =====
  const paper = std(0xffffff, 0.9, 0, { map: wallpaperTex() });
  const panelM = std(0x4a2a14, 0.6), panelIn = std(0x3a2010, 0.65);
  function buildWall(px, pz, ry) {
    const grp = new THREE.Group(); grp.position.set(px, 0, pz); grp.rotation.y = ry; scene.add(grp);
    const W = ROOM * 2;
    add(new THREE.BoxGeometry(W, 1.3, 0.3), panelM, 0, 0.65, 0, grp);
    for (let x = -W / 2 + 1; x < W / 2 - 0.5; x += 1.5) add(new THREE.BoxGeometry(1.2, 0.85, 0.04), panelIn, x + 0.6, 0.65, 0.17, grp);
    add(new THREE.BoxGeometry(W, 0.08, 0.4), brass, 0, 1.32, 0, grp);          // moldura (barandilla)
    const up = add(new THREE.BoxGeometry(W, CEIL - 1.36, 0.3), paper, 0, 1.36 + (CEIL - 1.36) / 2, 0, grp);
    up.receiveShadow = true;
    add(new THREE.BoxGeometry(W, 0.22, 0.42), darkWood, 0, CEIL - 0.11, 0, grp); // cornisa
    add(new THREE.BoxGeometry(W, 0.12, 0.34), darkWood, 0, 0.06, 0.02, grp);     // rodapié
    return grp;
  }
  const wallN = buildWall(0, -ROOM, 0), wallS = buildWall(0, ROOM, Math.PI);
  const wallE = buildWall(ROOM, 0, -Math.PI / 2), wallW = buildWall(-ROOM, 0, Math.PI / 2);

  // ===== Techo de madera oscura con vigas (solo se ve desde abajo) =====
  const ceil = add(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), std(0x4a3220, 0.95, 0, { emissive: 0x1a0e06 }), 0, CEIL, 0, ceiling);
  ceil.rotation.x = Math.PI / 2;
  for (let z = -12; z <= 12; z += 4) add(new THREE.BoxGeometry(ROOM * 2, 0.3, 0.4), darkWood, 0, CEIL - 0.15, z, ceiling);

  // ===== Apliques de pared (pantalla + bombilla + halo; sin luz real) =====
  const shadeM = std(0xf0c890, 0.7, 0, { emissive: 0xffb060, emissiveIntensity: 0.9 });
  function sconce(wall, x, y = 2.65) {
    const g = new THREE.Group(); g.position.set(x, y, 0.2); wall.add(g);
    add(new THREE.BoxGeometry(0.16, 0.3, 0.05), brass, 0, 0, 0, g);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), brass, 0, 0, 0.11, g).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.1, 0.17, 0.24, 16, 1, true), shadeM, 0, 0.08, 0.24, g).material.side = THREE.DoubleSide;
    const h = glow(0xffb870, 1.5, 0.55); h.position.set(0, 0.05, 0.26); g.add(h);
    const pool = glow(0xffa860, 2.8, 0.18); pool.position.set(0, 0.25, 0.02); g.add(pool); // luz en el papel
  }
  [-11, -5.5, 5.5, 11].forEach(x => { sconce(wallE, x); sconce(wallS, x); });
  [-11, -5.5, 5.5].forEach(x => sconce(wallW, x)); // la esquina del escenario lleva telón
  sconce(wallN, 12.5);

  // ===== Cuadros con marco dorado =====
  const frameM = std(0xb08a3a, 0.4, 0.7);
  function painting(wall, x, kind, y = 3.6, s = 1) {
    const g = new THREE.Group(); g.position.set(x, y, 0.2); wall.add(g);
    add(new THREE.BoxGeometry(1.3 * s, 1.6 * s, 0.08), frameM, 0, 0, 0, g);
    add(new THREE.PlaneGeometry(1.1 * s, 1.4 * s), std(0xffffff, 0.8, 0, { map: paintingTex(kind) }), 0, 0, 0.045, g);
  }
  painting(wallE, -8.3, 0); painting(wallE, 2.8, 2); painting(wallE, 8.3, 1);
  painting(wallW, 1.5, 1); painting(wallW, -8.3, 2);
  painting(wallS, -8.3, 2); painting(wallS, 8.3, 0);

  // ===== Barra al fondo: mostrador, taburetes, botellero retroiluminado y cartel de neón =====
  const BZ = -12.4; // frente del mostrador
  const counter = new THREE.Group(); scene.add(counter);
  add(new THREE.BoxGeometry(12, 1.1, 0.9), darkWood, 0, 0.55, BZ - 0.45, counter);
  for (let x = -5.6; x <= 5.61; x += 0.8) add(new THREE.BoxGeometry(0.62, 0.8, 0.04), midWood, x, 0.55, BZ + 0.02, counter);
  add(new THREE.BoxGeometry(12.3, 0.08, 1.15), std(0x5a2e12, 0.25, 0.1), 0, 1.14, BZ - 0.45, counter); // encimera barnizada
  add(new THREE.CylinderGeometry(0.03, 0.03, 12, 10), brass, 0, 0.22, BZ + 0.22, counter).rotation.z = Math.PI / 2; // reposapiés
  const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 });
  [[-4.2, 0.2], [-1.3, -0.2], [2.4, 0.1], [4.6, -0.1]].forEach(([x, dz]) => { // copas sobre la barra
    add(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 12), glassM, x, 1.25, BZ - 0.35 + dz, counter);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), std(0xe0a040, 0.3, 0, { emissive: 0x6a3a08 }), x, 1.21, BZ - 0.35 + dz, counter);
  });
  // tirador de cerveza
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), brass, 1, 1.42, BZ - 0.6, counter);
  for (let x = -5; x <= 5.01; x += 1.25) { // taburetes de barra (vacíos)
    const g = new THREE.Group(); g.position.set(x, 0, BZ + 0.65); counter.add(g);
    add(new THREE.CylinderGeometry(0.24, 0.22, 0.12, 18), leather, 0, 0.82, 0, g);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8), brass, 0, 0.41, 0, g);
    add(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 18), brass, 0, 0.02, 0, g);
    add(new THREE.TorusGeometry(0.17, 0.015, 6, 20), brass, 0, 0.3, 0, g).rotation.x = Math.PI / 2;
  }
  // botellero: fondo ámbar que brilla, baldas y botellas de colores
  const backZ = -ROOM + 0.2;
  add(new THREE.BoxGeometry(11, 3.2, 0.1), std(0x000000, 1, 0, { emissive: 0xd88a30, emissiveIntensity: 0.55 }), 0, 2.75, backZ + 0.05);
  add(new THREE.BoxGeometry(11.6, 3.5, 0.08), darkWood, 0, 2.75, backZ);
  [-5.65, 5.65].forEach(x => add(new THREE.BoxGeometry(0.3, 3.5, 0.6), darkWood, x, 2.75, backZ + 0.3));
  add(new THREE.BoxGeometry(11.6, 0.9, 0.7), darkWood, 0, 0.45, backZ + 0.35); // mueble bajo
  const bottleCols = [0x1f6b2a, 0x7a3a10, 0xa8661a, 0x2a4a8a, 0x8a1a2a, 0xd8c890, 0x3a2a1a, 0x5a8a3a];
  const bottleMats = bottleCols.map(c => std(c, 0.12, 0.1, { emissive: c, emissiveIntensity: 0.25 }));
  const profile = [[0, 0], [0.11, 0], [0.11, 0.42], [0.09, 0.5], [0.04, 0.56], [0.04, 0.72], [0, 0.72]].map(([x, y]) => new THREE.Vector2(x, y));
  const bottleGeo = new THREE.LatheGeometry(profile, 12);
  [1.55, 2.6, 3.65].forEach(y => {
    add(new THREE.BoxGeometry(10.9, 0.05, 0.42), darkWood, 0, y - 0.03, backZ + 0.3);
    for (let x = -5.1; x <= 5.1; x += 0.36 + rnd() * 0.12) {
      const b = add(bottleGeo, bottleMats[Math.floor(rnd() * bottleMats.length)], x, y, backZ + 0.3);
      b.scale.setScalar(0.8 + rnd() * 0.45);
    }
  });
  // cartel de neón
  const neon = add(new THREE.PlaneGeometry(5.2, 1.62), new THREE.MeshBasicMaterial({ map: neonTex(), transparent: true, depthWrite: false, fog: false }), 0, 5.25, backZ + 0.12);
  neon.renderOrder = 2;
  const neonGlow = glow(0xff4fb4, 7, 0.22); neonGlow.position.set(0, 5.25, backZ + 0.3); neonGlow.scale.set(8, 3, 1); scene.add(neonGlow);
  const barLight = new THREE.PointLight(0xffa050, 9, 9, 2); barLight.position.set(0, 3.4, -12.6); scene.add(barLight);

  // ===== Escenario en la esquina: tarima, telón, piano vertical y micro =====
  const stage = new THREE.Group(); stage.position.set(-11.6, 0, -11.4); scene.add(stage);
  add(new THREE.CylinderGeometry(5.6, 5.6, 0.28, 40, 1, false, 0, Math.PI / 2), midWood, -3.4, 0.14, -3.6, stage); // cuarto de círculo en la esquina
  add(new THREE.TorusGeometry(5.6, 0.04, 6, 40, Math.PI / 2), brass, -3.4, 0.28, -3.6, stage).rotation.x = Math.PI / 2;
  const curtM = std(0xffffff, 0.85, 0, { map: curtainTex() });
  add(new THREE.PlaneGeometry(6.6, CEIL - 0.3), curtM, -0.6, (CEIL - 0.3) / 2, -3.2, stage);           // pared de fondo
  add(new THREE.PlaneGeometry(6.6, CEIL - 0.3), curtM, -3.2, (CEIL - 0.3) / 2, -0.6, stage).rotation.y = Math.PI / 2; // pared lateral
  // piano vertical
  const piano = new THREE.Group(); piano.position.set(-1.2, 0.28, -2.6); piano.rotation.y = 0.25; stage.add(piano);
  add(new THREE.BoxGeometry(1.6, 1.3, 0.6), black, 0, 0.65, 0, piano);
  add(new THREE.BoxGeometry(1.6, 0.06, 0.32), black, 0, 0.75, 0.42, piano);
  add(new THREE.PlaneGeometry(1.5, 0.22), std(0xffffff, 0.4, 0, { map: keysTex() }), 0, 0.785, 0.42, piano).rotation.x = -Math.PI / 2;
  add(new THREE.BoxGeometry(1.6, 0.05, 0.64), black, 0, 1.32, 0, piano);
  [[-0.7, 0.42], [0.7, 0.42]].forEach(([x, z]) => add(new THREE.BoxGeometry(0.08, 0.72, 0.08), black, x, 0.36, z, piano));
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 10), std(0xfff0c0, 0.4, 0, { emissive: 0xffc070, emissiveIntensity: 1 }), 0.55, 1.47, 0, piano); // velita
  add(new THREE.BoxGeometry(0.9, 0.08, 0.36), black, 0, 0.5, 0.95, piano); // banqueta
  [[-0.38, -0.12], [0.38, -0.12], [-0.38, 0.12], [0.38, 0.12]].forEach(([x, z]) => add(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 6), black, x, 0.23, 0.95 + z, piano));
  // micro de pie
  const mic = new THREE.Group(); mic.position.set(0.6, 0.28, -0.5); stage.add(mic);
  add(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 20), black, 0, 0.015, 0, mic);
  add(new THREE.CylinderGeometry(0.018, 0.018, 1.55, 8), brass, 0, 0.8, 0, mic);
  add(new THREE.CapsuleGeometry(0.05, 0.09, 4, 10), std(0xc0c0c0, 0.3, 0.9), 0, 1.62, 0.04, mic).rotation.x = 0.5;
  // foco de escenario: cono de luz visible (sin luz real) y un charco de luz en la tarima
  const coneM = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cone = add(new THREE.ConeGeometry(1.2, CEIL - 0.3, 32, 1, true), coneM, 0.3, (CEIL - 0.3) / 2 + 0.28, -0.8, stage);
  const pool = add(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }), 0.3, 0.3, -0.8, stage);
  pool.rotation.x = -Math.PI / 2; cone.renderOrder = pool.renderOrder = 3;
  const stageLight = new THREE.PointLight(0xffc890, 6, 7, 2); stageLight.position.set(-0.6, 3.2, -1.2); stage.add(stageLight);

  // ===== Reservados: sofás de cuero contra la pared derecha con mesita y vela =====
  function booth(z) {
    const g = new THREE.Group(); g.position.set(ROOM - 0.75, 0, z); g.rotation.y = -Math.PI / 2; scene.add(g);
    add(new RoundedBoxGeometry(3.2, 0.42, 0.95, 3, 0.08), leather, 0, 0.32, 0, g);
    add(new RoundedBoxGeometry(3.2, 0.9, 0.3, 3, 0.1), leather, 0, 0.9, -0.42, g);
    for (let k = -1; k <= 1; k += 2) add(new RoundedBoxGeometry(0.3, 0.7, 0.95, 3, 0.1), leatherDark, k * 1.6, 0.55, 0, g);
    for (let k = 0; k < 6; k++) add(new THREE.SphereGeometry(0.03, 6, 6), brass, -1.25 + k * 0.5, 1.12, -0.26, g); // botones
    const t = add(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), darkWood, 0, 0.62, 1.05, g);
    t.castShadow = true;
    add(new THREE.CylinderGeometry(0.06, 0.2, 0.6, 10), brass, 0, 0.3, 1.05, g);
    candle(g, 0.12, 0.65, 1.0, false);
  }
  // ===== Velas (con halo; las de las mesitas llevan luz que tiembla) =====
  function candle(parent, x, y, z, light) {
    add(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 14), std(0x8a1a2a, 0.3, 0, { transparent: true, opacity: 0.85 }), x, y + 0.02, z, parent);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), std(0xf4ecd8, 0.6), x, y + 0.08, z, parent);
    const flame = add(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd080 }), x, y + 0.17, z, parent);
    flame.scale.y = 1.8;
    const h = glow(0xffa040, 0.7, 0.75); h.position.set(x, y + 0.17, z); parent.add(h);
    let pool = null;
    if (light) { // en vez de una luz real (cara en móviles), un charco de luz cálida sobre la mesa
      pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9a48,
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x + 0.45, y + 0.005, z); pool.userData.keep = true; parent.add(pool);
    }
    flicker.push({ pool, h, ph: rnd() * 10 });
  }
  booth(-3); booth(-9);

  // ===== Plantas: helechos y ficus en maceta de latón =====
  function fern(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    add(new THREE.CylinderGeometry(0.32, 0.25, 0.55, 16), brass, 0, 0.27, 0, g);
    const leafM = std(0x2f6b2a, 0.9, 0, { side: THREE.DoubleSide });
    const frond = new THREE.PlaneGeometry(0.22, 1.1); frond.translate(0, 0.55, 0);
    for (let k = 0; k < 14; k++) {
      const f = new THREE.Mesh(frond, leafM);
      f.position.y = 0.5; f.rotation.order = 'YXZ'; f.rotation.y = k * 2.4; f.rotation.x = 0.5 + (k % 3) * 0.25;
      g.add(f);
    }
  }
  function ficus(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    add(new THREE.CylinderGeometry(0.34, 0.27, 0.6, 16), std(0x3a2a20, 0.7), 0, 0.3, 0, g);
    add(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 8), std(0x5a4030, 1), 0, 1.3, 0, g);
    const leaf = std(0x2a5e2a, 0.9);
    [[0, 2.3, 0, 0.6], [0.35, 2.0, 0.15, 0.45], [-0.3, 2.1, -0.15, 0.48], [0.1, 1.75, -0.3, 0.4], [-0.15, 2.6, 0.1, 0.38]]
      .forEach(([dx, h, dz, r]) => add(new THREE.IcosahedronGeometry(r, 1), leaf, dx, h, dz, g));
  }
  fern(-13.8, -6.6, 1.2); fern(13.8, 13.8, 1.3); fern(-13.8, 13.8, 1.3); fern(7.2, -13.9, 1.1); fern(-7.2, -13.9, 1.1);
  ficus(13.9, -13.9, 1.2); ficus(-13.9, 9.6, 1.1); ficus(13.9, 2.4, 1);

  // Puerta de entrada (pared de detrás de ti) con letrero
  const door = new THREE.Group(); door.position.set(0, 0, ROOM - 0.2); door.rotation.y = Math.PI; scene.add(door);
  add(new THREE.BoxGeometry(2.2, 3.1, 0.12), darkWood, 0, 1.55, 0, door);
  [-0.55, 0.55].forEach(x => add(new THREE.BoxGeometry(0.95, 2.8, 0.06), std(0x5a2e12, 0.4), x, 1.5, 0.08, door));
  add(new THREE.BoxGeometry(2.6, 0.2, 0.2), brass, 0, 3.2, 0, door);
  const exitG = glow(0x40ff80, 0.9, 0.4); exitG.position.set(0, 3.55, 0.1); door.add(exitG);

  // ===== Vuestra mesa: tapete verde con canto de madera, pie central y lámpara colgante =====
  const top = add(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.12, 64), std(0xffffff, 0.95, 0, { map: feltTex() }), 0, 0.75, 0);
  top.receiveShadow = true;
  const rim = add(new THREE.TorusGeometry(TABLE_R + 0.04, 0.085, 12, 72), std(0x5a2e12, 0.35, 0.05), 0, 0.8, 0);
  rim.rotation.x = Math.PI / 2; rim.castShadow = true;
  add(new THREE.CylinderGeometry(TABLE_R + 0.02, TABLE_R - 0.15, 0.14, 64), midWood, 0, 0.64, 0);
  const ped = add(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 16), darkWood, 0, 0.3, 0); ped.castShadow = true;
  add(new THREE.CylinderGeometry(0.9, 1.0, 0.06, 24), darkWood, 0, 0.03, 0);
  // lámpara colgante de pantalla verde (tipo mesa de billar)
  const LAMP_Y = 4.1;
  add(new THREE.CylinderGeometry(0.012, 0.012, CEIL - LAMP_Y, 6), black, 0, (CEIL + LAMP_Y) / 2, 0);
  const shade = add(new THREE.CylinderGeometry(0.22, 0.75, 0.42, 32, 1, true), std(0x0f4a2a, 0.35, 0.3, { side: THREE.DoubleSide }), 0, LAMP_Y, 0);
  add(new THREE.CylinderGeometry(0.75, 0.75, 0.02, 32, 1, true), brass, 0, LAMP_Y - 0.2, 0).material.side = THREE.DoubleSide;
  add(new THREE.CircleGeometry(0.7, 32), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }), 0, LAMP_Y - 0.12, 0).rotation.x = Math.PI / 2; // interior encendido
  shade.castShadow = false;
  const spot = new THREE.SpotLight(0xffe0b0, 95, 0, 0.85, 0.65, 2);
  spot.position.set(0, LAMP_Y - 0.15, 0); spot.target.position.set(0, 0, 0);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 9;
  scene.add(spot); scene.add(spot.target);

  // ===== Mesitas del público =====
  function stool(x, z) { // taburete tapizado (el figurante se sienta aquí: asiento a 0,46)
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    add(new THREE.CylinderGeometry(0.25, 0.23, 0.1, 18), leather, 0, 0.46, 0, g);
    add(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 8), brass, 0, 0.21, 0, g);
    add(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 16), brass, 0, 0.015, 0, g);
  }
  function moneyStack(x, y, z, ry) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
    const bill = std(0x2e7d32, 0.9);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.34, 0.035, 0.16), bill, 0, i * 0.04, 0, g);
    add(new THREE.BoxGeometry(0.07, 0.13, 0.17), std(0xe8dcc0), 0, 0.04, 0, g);
  }
  function ashtrayWithCigs(x, y, z) {
    add(new THREE.CylinderGeometry(0.17, 0.13, 0.05, 16), std(0x8a8070, 0.3, 0.7), x, y, z);
    [[0.3, 0.1], [-0.4, 2.2]].forEach(([dx, a]) => {
      const cig = add(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), std(0xf5f5f5), x + dx * 0.3, y + 0.05, z + dx * 0.15);
      cig.rotation.z = Math.PI / 2; cig.rotation.y = a;
      const tip = add(new THREE.SphereGeometry(0.028, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a00 }),
        x + dx * 0.3 + Math.cos(a) * 0.15, y + 0.05, z + dx * 0.15 - Math.sin(a) * 0.15);
      tips.push(tip.position.clone());
    });
  }
  function wineGlass(x, y, z, wine) {
    add(new THREE.CylinderGeometry(0.06, 0.03, 0.12, 12), glassM, x, y + 0.2, z);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), glassM, x, y + 0.07, z);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), glassM, x, y + 0.005, z);
    if (wine) add(new THREE.CylinderGeometry(0.048, 0.035, 0.05, 12), std(0x6a0a18, 0.2, 0, { emissive: 0x2a0008 }), x, y + 0.175, z);
  }
  function sideTable(cx, cz, seed) {
    const t = add(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 36), std(0x4a2412, 0.35, 0.05), cx, 0.72, cz); t.receiveShadow = true;
    add(new THREE.TorusGeometry(1.15, 0.035, 8, 48), brass, cx, 0.72, cz).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 10), darkWood, cx, 0.35, cz);
    add(new THREE.CylinderGeometry(0.45, 0.5, 0.04, 20), brass, cx, 0.02, cz);
    for (let k = 0; k < 3; k++) {
      const a = seed + k * (Math.PI * 2 / 3);
      stool(cx + Math.sin(a) * 1.75, cz + Math.cos(a) * 1.75); // el figurante lo pone world.js
    }
    for (let k = 0; k < 2; k++) { // cartas boca abajo
      const cm = cardMesh('Nope', false); cm.material[4] = new THREE.MeshStandardMaterial({ map: BACK });
      cm.position.set(cx - 0.22 + k * 0.45, 0.77, cz - 0.55); cm.rotation.x = -Math.PI / 2; cm.rotation.z = seed + k * 0.2;
      scene.add(cm);
    }
    moneyStack(cx - 0.25, 0.775, cz + 0.5, seed);
    moneyStack(cx + 0.25, 0.775, cz + 0.5, seed + 1);
    ashtrayWithCigs(cx, 0.785, cz + 0.02);
    wineGlass(cx + 0.7, 0.76, cz - 0.15, true);
    wineGlass(cx + 0.55, 0.76, cz + 0.2, seed > 4);
    candle(scene, cx - 0.62, 0.76, cz - 0.05, true);
  }
  SIDE_TABLES.forEach(([cx, cz, seed]) => sideTable(cx, cz, seed));
  // Vuestra mesa: fajos + cenicero (zona central libre de cartas y mazo)
  moneyStack(0.75, 0.81, -0.35, 0.3);
  moneyStack(-0.15, 0.81, -0.8, -0.4);
  ashtrayWithCigs(0.3, 0.81, 0.6);

  bakeStatic(ceiling); ceiling.children.forEach(m => { m.userData.keep = true; }); // el techo va aparte (se oculta)
  bakeStatic(scene);

  // ===== Animación: velas que tiemblan; techo oculto si miras desde arriba =====
  let t = 0;
  function update(dt, camera) {
    t += dt;
    for (const f of flicker) {
      const n = 0.82 + 0.1 * Math.sin(t * 7.3 + f.ph) + 0.08 * Math.sin(t * 13.1 + f.ph * 2.7);
      if (f.pool) f.pool.material.opacity = 0.5 * n;
      f.h.material.opacity = 0.6 * n;
    }
    if (camera) ceiling.visible = camera.position.y < CEIL - 0.2;
  }
  return { tips, update };
}

// Junta todo el decorado quieto en pocas mallas (una por material): de ~500 dibujados a unas decenas.
// Se quedan sueltos: cartas (varios materiales), sprites, y lo marcado con userData.keep.
function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh || o.isSprite || Array.isArray(o.material) || o.userData.keep) return;
    if (o.material.transparent && o.material.blending === THREE.AdditiveBlending) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (!p.isGroup && !p.isObject3D) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) return;
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    groups.get(key).geos.push(g); drop.push(o);
  });
  drop.forEach(o => o.parent.remove(o));
  for (const { mat, cast, recv, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = cast; m.receiveShadow = recv;
    root.add(m);
  }
}
