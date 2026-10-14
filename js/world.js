// ================= World: escena 3D (mesa, jugadores, local mafioso) =================
// Todo lo visual Three.js. La lógica vive en game.js; el DOM en ui.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { SEATS, seatAngle, CARD_W, CARD_H, MY_SEAT, ROSTER, css, shuffle, seededRandom, logoOf, HEAVY_MODELS } from './config.js';
import { loadLogo } from './icons.js';
import { rigFor, resetPose, play, updateAnims, preloadAll, danceDeal } from './anims.js';
import { BACK, frontTex } from './art.js';
import { buildCasino, getSideSpots } from './maps/casino.js';
import { setupFX, updateFX, fxState, fxReset } from './cardfx.js';
import { G, threat } from './game.js';

// Toques en la mesa 3D: los conecta ui.js (robar del mazo, elegir/jugar tu carta, apuntar a un rival)
const pick = { deck() {}, card() {}, avatar() {} };
export function setPickHandlers(h) { Object.assign(pick, h); }

let scene, camera, renderer, controls, raycaster, pointer;
let deckMeshes = [], discardMeshes = [], handGroups = [], avatars = [];
let threatLine = null, threatRing = null; // flecha roja actor->objetivo + anillo en el objetivo
let bursts = [], deaths = {}; // explosiones 3D + jugadores caídos (progreso 0..1)
let smokeUniforms = null;
const casinoTips = []; // brasas del casino (su humo)

// ===== Mesa única (casino): medidas de cartas y asientos =====
const TABLE = { tableR: 2.1, topY: 0.81, cardY: 1.06, deckY: 0.85, cardScale: 0.8, fanGap: 0.32 };
const chairGroups = [];
let casinoGroup = null, casinoFx = null;

function seatPos(p) { return { x: SEATS[p].x, z: SEATS[p].z }; } // silla del MAPA

function layoutChairs() {
  chairGroups.forEach((g, i) => {
    g.position.set(SEATS[i].x * 1.2, 0, SEATS[i].z * 1.2);
  });
}

function seatXZ(p) { return seatPos(p); } // alias del mapa (anillo, explosiones)

function updateThreat() {
  const th = threat();
  if (!threatLine || !th) { if (threatLine) threatLine.visible = false; if (threatRing) threatRing.visible = false; if (!th) return; }
  const a = seatXZ(th.from), b = seatXZ(th.to);
  const pos = threatLine.geometry.attributes.position;
  pos.setXYZ(0, a.x, 2.2, a.z); pos.setXYZ(1, b.x, 2.2, b.z); pos.needsUpdate = true;
  threatLine.visible = true;
  threatRing.position.set(b.x, 0.04, b.z); threatRing.visible = true;
}

function cardMesh(type, faceUp = true) {
  const edge = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const f = faceUp
    ? new THREE.MeshStandardMaterial({ map: frontTex(type), roughness: .6 })
    : new THREE.MeshStandardMaterial({ map: BACK, roughness: .6 });
  const b = new THREE.MeshStandardMaterial({ map: BACK, roughness: .6 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.03), [edge, edge, edge, edge, f, b]);
  m.castShadow = true; m.userData.type = type; return m;
}
function nameSprite(text, sub, color, logo) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 190;
  const g = c.getContext('2d');
  // Nombres largos ("Mark Zuckerberg", "Spider-Man (Spider-Verse)"): la letra se encoge hasta caber.
  const fit = (str, size, maxW) => {
    for (; size > 18; size -= 2) { g.font = `bold ${size}px sans-serif`; if (g.measureText(str).width <= maxW) break; }
  };
  const draw = img => {
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,.62)';
    g.beginPath(); g.roundRect(56, 14, 400, 160, 26); g.fill();
    g.fillStyle = color; g.fillRect(56, 14, 26, 160);
    g.textAlign = 'center';
    g.fillStyle = '#fff'; fit(text, 54, 360);
    g.fillText(text, 272, 84);
    if (img) { // logo (serie / bandera / empresa) a la izquierda del nombre
      const h = 44, w = Math.min(90, h * img.width / img.height);
      g.drawImage(img, 92 + (90 - w) / 2, 128 - h / 2, w, h);
      g.fillStyle = '#ffe066'; fit(sub, 44, 260);
      g.fillText(sub, 316, 142);
    } else { // sin logo: solo el nombre
      g.fillStyle = '#ffe066'; fit(sub, 44, 360);
      g.fillText(sub, 272, 142);
    }
  };
  draw(null);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  loadLogo(logo).then(img => { if (img) { draw(img); t.needsUpdate = true; } });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(1.9, 0.71, 1); return sp;
}

// Copia independiente de un modelo (huesos y materiales propios). Se aparta userData
// mientras se copia: guarda el rig y referencias circulares que no se pueden duplicar.
const tableClaims = new Map();
function cloneModel(src) {
  // se copia en su pose de reposo (el original puede estar sentado o bailando en otra silla)
  const rest = src.userData.restBones;
  const now = rest && rest.map(([b]) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  if (rest) rest.forEach(([b, p, q, sc]) => { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(sc); });
  const kept = new Map();
  src.traverse(o => { if (Object.keys(o.userData).length) { kept.set(o, o.userData); o.userData = {}; } });
  let c;
  try { c = skeletonClone(src); } finally {
    kept.forEach((ud, o) => { o.userData = ud; });
    if (rest) rest.forEach(([b], i) => { b.position.copy(now[i][0]); b.quaternion.copy(now[i][1]); b.scale.copy(now[i][2]); });
  }
  c.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); });
  const bt = src.userData.baseT;
  if (bt) c.userData.baseT = { p: bt.p.clone(), q: bt.q.clone(), s: bt.s.clone() };
  return c;
}

// Presets en mesa (para restaurar color al reiniciar). Los cambia rebuildPlayers.
let tablePresets = [ROSTER[0], ROSTER[1], ROSTER[2], ROSTER[3]];

// Modelos GLB/FBX externos: se cargan una vez y se reutilizan.
const modelCache = {};
function describeModel(preset, scene, animations) {
  const names = [];
  scene.traverse(o => { if (o.isMesh || o.isBone) names.push(`${o.isMesh ? 'mesh' : 'bone'}:${o.name || '?'}`); });
  console.log(`[model] ${preset.model} | anims: [${animations.map(a => a.name).join(', ') || 'ninguna'}] | ${names.slice(0, 12).join(', ')}${names.length > 12 ? `…(+${names.length - 12})` : ''}`);
}
function loadPresetModel(preset) {
  if (!preset.model) return Promise.resolve(null);
  if (!modelCache[preset.model]) {
    modelCache[preset.model] = new Promise(resolve => {
      // Guarda la pose base: al reutilizar el modelo entre partidas hay que restaurarla
      // antes de encajar, si no escala/posición/rotación se acumulan en cada cambio.
      const ready = (scene, animations) => {
        scene.userData.baseT = { p: scene.position.clone(), q: scene.quaternion.clone(), s: scene.scale.clone() };
        describeModel(preset, scene, animations);
        resolve({ scene, animations });
      };
      const loadGltf = (path, fail) => new GLTFLoader().load(path,
        gltf => ready(gltf.scene, gltf.animations), undefined, fail);
      const giveUp = path => err => { console.warn('[model] no cargó', path, err?.message || err); resolve(null); };
      if (/\.fbx$/i.test(preset.model)) {
        // FBX de Mixamo (ya con esqueleto). Si falta, se usa el scene.gltf de la misma carpeta.
        const gltfPath = preset.model.replace(/[^/]+$/, 'scene.gltf');
        new FBXLoader().load(preset.model, obj => {
          // Mixamo no guarda normales al venir de un OBJ: sin ellas el modelo sale negro.
          obj.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); });
          ready(obj, obj.animations || []);
        }, undefined, err => {
          console.warn('[model] no cargó', preset.model, '→ uso', gltfPath, err?.message || err);
          loadGltf(gltfPath, giveUp(gltfPath));
        });
      } else if (!/scene\.gltf$/.test(preset.model)) {
        // .glb ya animable (Mixamo convertido). Si falta, el scene.gltf original de la carpeta.
        const gltfPath = preset.model.replace(/[^/]+$/, 'scene.gltf');
        loadGltf(preset.model, err => {
          console.warn('[model] no cargó', preset.model, '→ uso', gltfPath, err?.message || err);
          loadGltf(gltfPath, giveUp(gltfPath));
        });
      } else {
        loadGltf(preset.model, giveUp(preset.model));
      }
    });
  }
  return modelCache[preset.model];
}

// Encaja un modelo a ~1,7 de alto, pies en y=0 y centrado.
// - Ignora huesos (falsean el box) y mallas basura (vértices a cientos de miles).
// - En skinned meshes usa el box con skinning aplicado, no las posiciones en crudo.
function fitModel(root, preset, targetH = 1.9) {
  if (root.parent) root.parent.remove(root); // medir sin la sede anterior: si no, la medida hereda su posición/giro y el modelo cae en otro sitio
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let found = false, noUv = 0, total = 0;
  const tmp = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.visible === false) return; // lo oculto no cuenta (basura del generador)
    if (!o.geometry.attributes.uv) { noUv++; total++; return; } // sin UV = color plano erróneo
    total++;
    let b = null;
    try {
      if (o.isSkinnedMesh && typeof o.computeBoundingBox === 'function') {
        if (o.skeleton) o.skeleton.update(); // sin esto los huesos están rancios y la medida sale tumbada
        o.computeBoundingBox();
        const bb = o.boundingBox;
        // Se acepta la medida con huesos AUNQUE la pieza sea pequeña (ojos, dientes, pestañas).
        // Antes las piezas de < 5 cm caían a la geometría en crudo, que en los rips de
        // Fortnite/Sketchfab está en otro espacio (~1,6 m detrás del modelo): eso movía
        // el centro y Speed, Aang, Shrek, Taylor y Eminem salían desplazados de su silla.
        if (bb && isFinite(bb.min.x + bb.min.y + bb.min.z + bb.max.x + bb.max.y + bb.max.z)) {
          b = bb.clone().applyMatrix4(o.matrixWorld);
        }
      }
    } catch (e) { b = null; }
    if (!b) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!isFinite(g.boundingBox.min.x + g.boundingBox.max.x)) return;
      b = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    }
    b.getSize(tmp);
    if (!isFinite(tmp.x + tmp.y + tmp.z)) return; // box corrupto: fuera
    box.union(b);
    found = true;
  });
  if (!found) { console.warn('[model-fit] sin mallas válidas, no se usa'); return null; }
  if (noUv * 2 >= total) { // mayoría sin UV = saldría blanco/plano: mejor procedural
    console.warn(`[model-fit] ${preset.model || '?'} sin UVs (${noUv}/${total}), se usa procedural`);
    return null;
  }
  const size = new THREE.Vector3(); box.getSize(size);
  // Ajuste manual por preset (los GLB de IA traen basura geométrica: el auto-fit no es fiable).
  const manual = preset.fit?.scale != null; // solo una escala fija desactiva el auto-fit (fit: { turn } solo gira)
  const s = preset.fit?.scale ?? targetH / Math.max(size.y, 0.001);
  const dy = preset.fit?.dy ?? 0;
  const c = new THREE.Vector3(); box.getCenter(c);
  // Validación sobre la UNIÓN (el modelo entero): talla humana, o grande-pero
  // centrado con pies cerca del origen. No se filtra por pieza: en modelos
  // grandes y limpios las piezas son grandes y hay que aceptarlas.
  const saneBox = Math.abs(c.x) <= size.y * 0.5 && Math.abs(c.z) <= size.y * 0.5 && box.min.y >= -size.y * 0.5;
  const sane = manual ? (s >= 0.02 && s <= 100) : ((size.y >= 0.5 && size.y <= 3.0) || (size.y > 3.0 && size.y <= 60 && saneBox));
  if (!sane) {
    console.warn(`[model-fit] ${preset.model || '?'} corrupto (alto=${size.y.toFixed(1)} centro=(${c.x.toFixed(1)},${c.z.toFixed(1)}) minY=${box.min.y.toFixed(1)}), se usa procedural`);
    return null;
  }
  console.log(`[model-fit] alto=${size.y.toFixed(2)} escala=${s.toFixed(3)}${manual ? ' (manual)' : ''}`);
  root.scale.setScalar(s);
  if (!manual) { // solo el auto-fit recentra (el manual ya viene calibrado)
    root.position.x -= c.x * s;
    root.position.z -= c.z * s;
    root.position.y -= box.min.y * s;
  } else {
    root.position.y += dy;
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return s;
}

// Tinte gris al morir / restaurar al reiniciar (vale para procedural y GLB).
// Los originales se guardan por material (los GLB cacheados comparten materiales entre partidas).
const origColors = new Map();
function setAvatarGray(grp, gray) {
  grp.traverse(o => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (!m || !m.color) return;
      if (gray) {
        if (!origColors.has(m.uuid)) origColors.set(m.uuid, m.color.getHex());
        m.color.set(0x555555);
      } else if (origColors.has(m.uuid)) {
        m.color.set(origColors.get(m.uuid));
      }
    });
  });
}

// Construye un mafioso: procedural al instante; si el preset trae GLB lo sustituye al llegar.
function buildAvatar(preset, labelText) {  const grp = new THREE.Group();
  const swap = []; // mallas procedurales a retirar cuando llegue el modelo
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .6, 6, 14),
    new THREE.MeshStandardMaterial({ color: preset.suit, roughness: .6 }));
  body.position.y = .75; body.castShadow = true; grp.add(body); swap.push(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 20, 20),
    new THREE.MeshStandardMaterial({ color: preset.skin }));
  head.position.y = 1.45; head.castShadow = true; grp.add(head); swap.push(head);
  if (preset.acc === 'hat') {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: .7 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .04, 16), dark);
    brim.position.y = 1.66; grp.add(brim); swap.push(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .18, 16), dark);
    top.position.y = 1.77; grp.add(top); swap.push(top);
  } else if (preset.acc === 'glasses') {
    const gm = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .3 });
    [-1, 1].forEach(d => {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(.13, .1, .03), gm);
      lens.position.set(d * .11, 1.47, .2); grp.add(lens); swap.push(lens);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(.06, .02, .02), gm);
    bridge.position.set(0, 1.47, .2); grp.add(bridge); swap.push(bridge);
  }
  if (labelText) { // (sin partida, la mesa de fondo va sin carteles)
    const tag = nameSprite(labelText, preset.name, css(preset.suit), logoOf(preset));
    tag.position.y = 2.2; grp.add(tag);
  }
  if (preset.model) {
    loadPresetModel(preset).then(gltf => {
      if (!gltf || !grp.parent) return; // si cambió de personaje antes, se ignora
      // Dos jugadores con el mismo personaje: el segundo lleva una copia del modelo
      const owner = tableClaims.get(preset.model);
      const root = owner && owner !== grp ? cloneModel(gltf.scene) : gltf.scene;
      if (!owner) tableClaims.set(preset.model, grp);
      const bt = root.userData.baseT; // restaura pose base: sin esto, re-elegir acumulaba escala/rotación
      if (bt) { root.position.copy(bt.p); root.quaternion.copy(bt.q); root.scale.copy(bt.s); }
      resetPose(root); // si venía bailando/sentado de otra partida, a T-pose antes de medir
      if (fitModel(root, preset) == null) return; // corrupto: se queda el procedural
      swap.forEach(m => grp.remove(m));
      console.log(`[model-swap] ${preset.name} ✓`);
      if (preset.fit?.turn) root.rotation.y += preset.fit.turn; // este archivo mira al revés
      // Retrocede el modelo (poses inclinadas se meten bajo las cartas si no)
      const back = preset.fit?.back || 0;
      if (back) {
        const out = new THREE.Vector3(grp.position.x, 0, grp.position.z).normalize();
        out.applyAxisAngle(new THREE.Vector3(0, 1, 0), -grp.rotation.y);
        root.position.addScaledVector(out, back);
      }
      const rig = rigFor(root);
      if (rig) { // esqueleto de Mixamo: se anima. El "holder" lo lleva hasta la silla al sentarse.
        const holder = new THREE.Group();
        holder.userData.chairBack = grp.userData.chairBack || 0;
        holder.add(root); grp.add(holder);
        rig.holder = holder; grp.userData.rig = rig;
        if (grp.userData.dead) play(rig, 'death'); else play(rig, 'sit');
      } else grp.add(root);
    });
  }
  return grp;
}

function rebuildPlayers(presets, labels = [null, null, null, null], seed = null) {
  tablePresets = presets;
  tableClaims.clear();
  // Los GLB están en caché y comparten materiales: si alguien murió (gris) hay que devolverle
  // el color ANTES de soltarlo, o saldría gris en la próxima mesa o entre el público.
  avatars.forEach(g => { setAvatarGray(g, false); g.rotation.x = 0; scene.remove(g); });
  avatars = [];
  for (let i = 0; i < 4; i++) {
    const a = seatAngle(i); // del MAPA: avatar siempre sobre su silla
    const grp = buildAvatar(presets[i], labels[i]);
    const sp = seatPos(i);
    grp.position.set(sp.x, 0, sp.z);
    grp.rotation.y = a + Math.PI; // mirar al centro SIN lookAt (lookAt generaba un euler degenerado que espejaba a P1 bajo el suelo)
    grp.userData.chairBack = Math.hypot(sp.x, sp.z) * 0.2; // la silla está al 120% del radio del asiento
    grp.traverse(o => { o.userData.player = i; }); // clicar cualquier parte elige objetivo
    if (i === 0 && camMode === 'head') grp.visible = false; // en 1ª persona no ves tu cuerpo
    scene.add(grp); avatars.push(grp);
  }
  rebuildBackground(presets, seed);
}

// Figurantes de las mesas de fondo: SIEMPRE modelos distintos a los 4 de la mesa
// (sin repetir) y elegidos al azar. Rellenan las 27 plazas alrededor de las mesas laterales.
const bgGroups = [];
// El público se carga de 2 en 2 y después de la mesa: por internet, primero lo que importa
let crowdActive = 0; const crowdWaiting = [];
function crowdLoad(preset) {
  return new Promise(res => {
    const run = () => {
      crowdActive++;
      loadPresetModel(preset).then(r => { crowdActive--; res(r); const next = crowdWaiting.shift(); if (next) next(); });
    };
    if (crowdActive < 2) setTimeout(run, 300); else crowdWaiting.push(run);
  });
}
const STOOL_AHEAD = 1.75 * 0.18; // el figurante está al 118% del radio del taburete (ver maps/casino.js)
function rebuildBackground(tablePresets, seed = null) { // con semilla: el mismo público para todos
  bgGroups.forEach(g => scene.remove(g));
  bgGroups.length = 0;
  const light = p => !HEAVY_MODELS.includes(p.model.split('/')[1]);
  const pool = shuffle(ROSTER.filter(p => !tablePresets.includes(p) && p.model && light(p)), seed ? seededRandom(seed) : Math.random);
  if (!pool.length) return;
  const used = new Set();
  getSideSpots().forEach((s, i) => {
    let preset = pool[i % pool.length];
    const grp = new THREE.Group();
    grp.position.set(s.x, 0, s.z);
    grp.rotation.y = Math.atan2(s.tx - s.x, s.tz - s.z);
    grp.scale.setScalar(0.94 + (i % 5) * 0.03);
    scene.add(grp); bgGroups.push(grp);
    if (used.has(preset)) { addFallbackBody(grp, preset); return; } // sin hueco: procedural
    used.add(preset);
    crowdLoad(preset).then(gltf => {
      if (!gltf || !grp.parent) return;
      const root = gltf.scene;
      const bt = root.userData.baseT;
      if (bt) { root.position.copy(bt.p); root.quaternion.copy(bt.q); root.scale.copy(bt.s); }
      resetPose(root);
      if (fitModel(root, preset) == null) { addFallbackBody(grp, preset); return; }
      const rig = rigFor(root);
      if (rig) { // animado: se sienta en su taburete (0,315 delante, hacia la mesa); si llega tarde a la fiesta, baila
        const holder = new THREE.Group();
        holder.userData.chairBack = -STOOL_AHEAD;
        holder.add(root); grp.add(holder);
        rig.holder = holder; grp.userData.rig = rig;
        if (celebrated) crowdDance(); else play(rig, 'sit');
      } else grp.add(root);
    });
  });
}

function addFallbackBody(grp, preset) { // relleno procedural si el modelo falla
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 6, 12),
    new THREE.MeshStandardMaterial({ color: preset.suit, roughness: 0.8 }));
  body.position.y = 0.72; grp.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: preset.skin }));
  head.position.y = 1.38; grp.add(head);
}

function fitCamera() { // encuadre responsive para el modo ORBITAL
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  if (a < 0.8) { camera.position.set(0, 13, 14.5); camera.fov = 62; }
  else if (a < 1.2) { camera.position.set(0, 10.5, 12.5); camera.fov = 55; }
  else { camera.position.set(0, 9, 11); camera.fov = 50; }
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, -1);
  camera.lookAt(controls.target);
}

// ===== Cámaras: cabeza (fija, defecto) y orbital (con límite) =====
let camMode = 'head';
let lookYaw = 0, lookPitch = 0, wantYaw = 0, wantPitch = 0, headTouch = false;
// Ojo y base fijos (una sola sala)
const HEAD = { eye: [0, 1.95, 4.35], base: [0, 0.75, -0.8] };
const headEye = new THREE.Vector3(), headBase = new THREE.Vector3();
let headYaw0 = 0, headPitch0 = 0;
function applyHeadPose() {
  headEye.set(...HEAD.eye); headBase.set(...HEAD.base);
  headYaw0 = 0;
  headPitch0 = Math.atan2(headBase.y - headEye.y, Math.hypot(headBase.x - headEye.x, headBase.z - headEye.z));
}

function headDir(yaw, pitch) {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

function setCamMode(m) {
  camMode = m;
  controls.enabled = (m === 'orbit');
  if (avatars[0]) avatars[0].visible = (m === 'orbit'); // en 1ª persona no te ves a ti mismo (tapabas tus cartas)
  if (m === 'orbit') fitCamera();
  else { applyHeadPose(); camera.position.copy(headEye); }
  if (handGroups[MY_SEAT]) handGroups[MY_SEAT].visible = m !== 'head';
  const b = document.getElementById('btn-cam');
  if (b) b.title = m === 'head' ? 'Cámara: tu silla (C para cambiar)' : 'Cámara: vista general (C para cambiar)';
}

function init() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0806);
  scene.fog = new THREE.Fog(0x1a0f08, 18, 46); // un poco de bruma de garito
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 100);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true });
  renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 4; controls.maxDistance = 13; // límite al echar para atrás (no sales del local)
  setCamMode('head'); controls.enablePan = false; controls.maxPolarAngle = Math.PI / 2.15;
  // luz cálida y baja: la mesa la ilumina su lámpara colgante (maps/casino.js)
  scene.add(new THREE.HemisphereLight(0xffdcb4, 0x2a1810, 0.75));
  const key = new THREE.DirectionalLight(0xffc890, 0.55); key.position.set(4, 8, 3); scene.add(key);
  casinoGroup = new THREE.Group(); scene.add(casinoGroup);
  casinoFx = buildCasino(casinoGroup, { cardMesh, BACK, tips: casinoTips });
  buildSmoke(casinoTips, casinoGroup);
  setupFX({ // cartas volando (cardfx.js)
    scene, camera, cardMesh, TABLE, seatAngle, seatXZ, mySeat: MY_SEAT,
    deckCount: () => G ? G.deck.length : 0,
    discardCount: () => G ? Math.max(0, G.discard.length - fxState.discardLag) : 0,
    relayout: () => { if (G) { layoutHands(); layoutDeck(); } },
  });
  preloadAll(); // animaciones de Mixamo en segundo plano
  rebuildPlayers(shuffle(ROSTER.filter(p => p.model)).slice(0, 4)); // mesa de fondo mientras eliges
  for (let i = 0; i < 4; i++) { const hg = new THREE.Group(); scene.add(hg); handGroups.push(hg); }
  // Sillas fijas: marcan cada asiento (los avatares se reconstruyen siempre encima).
  function chair(x, z, yaw) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw;
    const woodM = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.75 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.55), woodM);
    seat.position.y = 0.46; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.09), woodM);
    back.position.set(0, 0.85, -0.26); back.castShadow = true; g.add(back);
    [[-0.25, -0.22], [0.25, -0.22], [-0.25, 0.22], [0.25, 0.22]].forEach(([dx, dz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.46, 8), woodM);
      leg.position.set(dx, 0.23, dz); g.add(leg);
    });
    scene.add(g);
    chairGroups.push(g);
  }
  for (let i = 0; i < 4; i++) { // silla un poco detrás del avatar (del MAPA)
    const a = seatAngle(i);
    chair(SEATS[i].x * 1.2, SEATS[i].z * 1.2, a + Math.PI);
  }
  layoutChairs();
  // flecha de ataque (oculta hasta que alguien apunte a otro)
  threatLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xff3333 }));
  threatLine.visible = false; threatLine.frustumCulled = false; scene.add(threatLine);
  threatRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 40),
    new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  threatRing.rotation.x = -Math.PI / 2; threatRing.visible = false; scene.add(threatRing);
  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('click', onClick3D);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    if (camMode === 'orbit') fitCamera();
    renderer.setSize(innerWidth, innerHeight);
  });
  // Mirar con la cabeza: ratón (sin pulsar) o arrastrar en táctil
  renderer.domElement.addEventListener('pointermove', e => {
    if (camMode !== 'head') return;
    if (e.pointerType !== 'mouse' && !headTouch) return;
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    wantYaw = THREE.MathUtils.clamp(-nx * 0.7, -0.7, 0.7);
    wantPitch = THREE.MathUtils.clamp(-ny * 0.35, -0.35, 0.35);
  });
  renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') headTouch = true; });
  addEventListener('pointerup', () => headTouch = false);
  const clock = new THREE.Clock();
  (function anim() {
    requestAnimationFrame(anim);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (smokeUniforms) smokeUniforms.uTime.value += dt;
    casinoFx?.update?.(dt, camera); // velas y techo
    updateAnims(dt);
    updateFX(dt);
    if (G && G.over && !celebrated) celebrate(G.winner); // G es null hasta empezar la primera partida
    for (const k in deaths) { // caídos: a tumbarse en el suelo (los animados usan su animación de muerte)
      if (avatars[k]?.userData.rig) { deaths[k] = 1; continue; }
      if (deaths[k] < 1) {
        deaths[k] = Math.min(1, deaths[k] + dt * 1.1);
        const e = 1 - Math.pow(1 - deaths[k], 2);
        avatars[k].rotation.x = -e * Math.PI / 2 * 0.92;
      }
    }
    for (let i = bursts.length - 1; i >= 0; i--) { // metralla
      const b = bursts[i]; b.life += dt;
      const s = 1 + b.life * 5;
      b.mesh.scale.set(s, s, s);
      b.mesh.material.opacity = Math.max(0, 0.95 - b.life * 0.8);
      const pos = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        b.vel[j].y -= 9 * dt;
        pos.setXYZ(j, pos.getX(j) + b.vel[j].x * dt, Math.max(0.03, pos.getY(j) + b.vel[j].y * dt), pos.getZ(j) + b.vel[j].z * dt);
      }
      pos.needsUpdate = true;
      if (b.life > 1.4) { scene.remove(b.mesh); scene.remove(b.pts); bursts.splice(i, 1); }
    }
    if (camMode === 'orbit') controls.update();
    else { // cabeza: mirada suavizada hacia donde apunta el ratón/dedo
      lookYaw += (wantYaw - lookYaw) * Math.min(1, dt * 6);
      lookPitch += (wantPitch - lookPitch) * Math.min(1, dt * 6);
      const d = headDir(headYaw0 + lookYaw, headPitch0 + lookPitch);
      camera.position.copy(headEye);
      camera.lookAt(headEye.x + d.x * 6, headEye.y + d.y * 6, headEye.z + d.z * 6);
    }
    renderer.render(scene, camera);
  })();
}

// El eliminado EXPLOTA (destello + metralla 3D) y su muñeco cae al suelo gris.
function explodePlayer(p) {
  const sp = seatXZ(p);
  setAvatarGray(avatars[p], true);
  deaths[p] = 0;
  avatars[p].userData.dead = true;
  if (avatars[p].userData.rig) play(avatars[p].userData.rig, 'death'); // salta por los aires (Mixamo)
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.95 }));
  flash.position.set(sp.x, 1.1, sp.z);
  scene.add(flash);
  const N = 70, arr = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) {
    arr[i * 3] = sp.x; arr[i * 3 + 1] = 1.1; arr[i * 3 + 2] = sp.z;
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3.5;
    vel.push({ x: Math.cos(a) * s, y: 2 + Math.random() * 4, z: Math.sin(a) * s });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff7722, size: 0.13 }));
  scene.add(pts);
  bursts.push({ mesh: flash, pts, vel, life: 0 });
}

function resetAvatars() {
  fxReset(); // nada volando de la partida anterior
  gestureTimers.forEach(clearTimeout); gestureTimers = [];
  bursts.forEach(b => { scene.remove(b.mesh); scene.remove(b.pts); });
  bursts = []; deaths = {};
  for (let p = 0; p < 4; p++) {
    avatars[p].rotation.x = 0;
    avatars[p].userData.dead = false;
    setAvatarGray(avatars[p], false);
    if (avatars[p].userData.rig) play(avatars[p].userData.rig, 'sit'); // otra partida: a sentarse
  }
  stopCelebration();
}

function stopCelebration() {
  celebrated = false; winnerDance = null;
  bgGroups.forEach(g => { if (g.userData.rig) play(g.userData.rig, 'sit'); }); // el público vuelve a sentarse
}

// Alguien ATACA a otro (Attack, Favor, pareja, trío): el atacante hace un gesto
// mirando a su víctima, la víctima reacciona cuando le llega la carta y el resto
// de la mesa hace algo más sencillo (aplaudir). Solo los personajes animados.
let gestureTimers = [];
function tableGesture(actor, target) {
  gestureTimers.forEach(clearTimeout); gestureTimers = [];
  const alive = p => avatars[p] && !avatars[p].userData.dead && avatars[p].userData.rig;
  if (alive(actor) && target >= 0 && avatars[target]) {
    const g = avatars[actor];
    g.updateMatrixWorld(true);
    const to = g.worldToLocal(avatars[target].getWorldPosition(new THREE.Vector3()));
    const yaw = THREE.MathUtils.clamp(Math.atan2(to.x, to.z), -1.2, 1.2);
    play(g.userData.rig, 'attack', { yaw });
  }
  if (alive(target)) gestureTimers.push(setTimeout(() => { // cuando le llega la carta
    if (alive(target) && !G?.over) play(avatars[target].userData.rig, 'react');
  }, 600));
  for (let p = 0; p < 4; p++) {
    if (p === actor || p === target || !alive(p)) continue;
    gestureTimers.push(setTimeout(() => { if (alive(p) && !G?.over) play(avatars[p].userData.rig, 'cheer'); }, 250 + Math.random() * 500));
  }
}

// Tecla V (prueba): ver la celebración sin tener que ganar. Tú bailas ~12 s y el
// público celebra; luego todo vuelve a la partida (los vivos se vuelven a sentar).
let previewTimer = null;
function previewVictory() {
  if (G?.over) return; // si la partida ya terminó de verdad, ya se está celebrando
  clearTimeout(previewTimer);
  celebrate(0);
  previewTimer = setTimeout(() => {
    if (G?.over) return;
    stopCelebration();
    avatars.forEach(g => { if (g.userData.rig && !g.userData.dead) play(g.userData.rig, 'sit'); });
  }, 12000);
}

// ===== Victoria: el ganador se levanta y baila (baile ÚNICO); el público celebra =====
let celebrated = false, winnerDance = null;
function celebrate(w) {
  celebrated = true;
  const dancers = bgGroups.filter(g => g.userData.rig);
  const deal = danceDeal(dancers.length);
  winnerDance = deal.winner;
  const wg = avatars[w];
  if (wg?.userData.rig && deal.winner) play(wg.userData.rig, 'dance', { path: deal.winner });
  crowdDance(deal.crowd);
}
function crowdDance(list) { // público: bailes al azar, nunca el del ganador
  const dancers = bgGroups.filter(g => g.userData.rig && g.userData.rig.state !== 'dance');
  const paths = list || danceDeal(dancers.length).crowd.filter(p => p !== winnerDance);
  dancers.forEach((g, i) => { if (paths.length) play(g.userData.rig, 'dance', { path: paths[i % paths.length] }); });
}

function layoutHands() {
  handGroups.forEach(g => { while (g.children.length) g.remove(g.children[0]); });
  // con la cámara en tu cabeza tus cartas 3D taparían la mesa: ya las tienes abajo en la pantalla
  handGroups[MY_SEAT].visible = camMode !== 'head';
  for (let p = 0; p < 4; p++) {
    const a = seatAngle(p), px = Math.sin(a), pz = Math.cos(a); // dirección de la silla (del MAPA)
    // Las cartas que aún vienen volando hacia esta mano no se dibujan hasta que lleguen
    const flying = [...fxState.hide[p]];
    const shown = [];
    G.hands[p].forEach((type, k) => {
      const f = flying.indexOf(type);
      if (f >= 0) flying.splice(f, 1); else shown.push([type, k]);
    });
    const n = shown.length;
    shown.forEach(([type, k], v) => {
      // Privacidad 3D: tu mano de frente; las rivales son DORSOS por ambas caras
      // (misma posición en abanico frente a cada silla, pero sin dibujo visible).
      const m = cardMesh(type, p === MY_SEAT);
      m.userData.player = p; m.userData.index = k; // para jugar tocando la carta 3D
      m.scale.setScalar(TABLE.cardScale);
      const spread = (v - (n - 1) / 2) * TABLE.fanGap, r = TABLE.tableR - .15; // abanico al borde, cerca del jugador
      m.position.set(px * r + Math.cos(a) * spread, TABLE.cardY, pz * r - Math.sin(a) * spread);
      m.lookAt(px * 10, 1.1, pz * 10); m.rotateX(-.3);
      handGroups[p].add(m);
    });
  }
}

function layoutDeck() {
  deckMeshes.forEach(m => scene.remove(m)); deckMeshes = [];
  const dy = TABLE.deckY;
  const nDeck = fxState.deckHidden ? 0 : Math.max(0, Math.min(G.deck.length, 10) - fxState.deckHideTop);
  for (let i = 0; i < nDeck; i++) {
    const m = cardMesh('Shuffle', false); m.material[4] = new THREE.MeshStandardMaterial({ map: BACK });
    m.scale.setScalar(TABLE.cardScale);
    m.position.set(-.55, dy + i * .03, 0); m.rotation.x = -Math.PI / 2; m.userData.isDeck = true;
    scene.add(m); deckMeshes.push(m);
  }
  layoutDiscard();
}

// Descarte a la derecha del mazo, boca arriba (las que aún vuelan hacia él no cuentan)
function layoutDiscard() {
  discardMeshes.forEach(m => scene.remove(m)); discardMeshes = [];
  const vis = Math.max(0, G.discard.length - fxState.discardLag);
  const from = Math.max(0, vis - 6);
  for (let i = from; i < vis; i++) {
    const m = cardMesh(G.discard[i], true);
    m.scale.setScalar(TABLE.cardScale);
    m.position.set(.55, TABLE.deckY + (i - from) * .006, .05);
    m.rotation.set(-Math.PI / 2, 0, Math.sin(i * 12.9898) * 0.25); // un poco desordenado
    scene.add(m); discardMeshes.push(m);
  }
}

function onClick3D(e) {
  if (!G) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.intersectObjects(deckMeshes).length) { pick.deck(); return; }
  const ownHits = handGroups[MY_SEAT].visible ? raycaster.intersectObjects(handGroups[MY_SEAT].children) : [];
  if (ownHits.length) { pick.card(ownHits[0].object.userData.index); return; }
  const hits = raycaster.intersectObjects(avatars.filter(a => a.visible), true);
  if (!hits.length) return;
  let o = hits[0].object; // sube hasta el grupo del jugador (el modelo se carga después y no lleva la marca)
  while (o && o.userData.player === undefined) o = o.parent;
  if (o && o.userData.player !== MY_SEAT) pick.avatar(o.userData.player);
}

export { init, layoutHands, layoutDeck, updateThreat, setCamMode, camMode, explodePlayer, resetAvatars, rebuildPlayers, previewVictory, tableGesture };


  function buildSmoke(tips, parent) { // un sistema de partículas por mapa
    const PER = 7, n = tips.length * PER;
    if (!n) return;
    const pos = new Float32Array(n * 3), tip = new Float32Array(n * 3), ph = new Float32Array(n);
    let k = 0;
    tips.forEach(t => {
      for (let i = 0; i < PER; i++, k++) {
        pos[k * 3] = t.x; pos[k * 3 + 1] = t.y; pos[k * 3 + 2] = t.z;
        tip[k * 3] = t.x; tip[k * 3 + 1] = t.y; tip[k * 3 + 2] = t.z;
        ph[k] = Math.random();
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    smokeUniforms = { uTime: { value: Math.random() * 10 }, uPx: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: smokeUniforms, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 aTip; attribute float aPhase;
        uniform float uTime; uniform float uPx;
        varying float vAlpha;
        void main() {
          float age = fract(uTime * 0.22 + aPhase);
          vec3 p = aTip;
          p.y += age * 1.1;
          float sw = age * age;
          p.x += sin(age * 9.0 + aPhase * 40.0) * 0.09 * sw;
          p.z += cos(age * 7.0 + aPhase * 31.0) * 0.07 * sw;
          vAlpha = (1.0 - age) * 0.32 * smoothstep(0.0, 0.12, age);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.25 + age * 0.55) * uPx / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.82, 0.84, 0.88, a);
        }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    parent.add(pts);
}