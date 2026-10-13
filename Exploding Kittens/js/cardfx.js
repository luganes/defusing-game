// ================= Cartas en el aire (efectos 3D) =================
// Solo es la parte visual: la lógica (game.js) ya ha movido las cartas en los arrays;
// aquí se ve el viaje. Mientras una carta vuela, su sitio de destino la oculta
// (mano o descarte) para que no aparezca dos veces.
//   jugar carta  -> sube de la mano y vuela hacia la víctima (o al centro) y se queda flotando
//   Nope         -> vuela y se estampa encima; la jugada se pone roja si queda cancelada
//   resolver     -> Attack embiste a la víctima; todo cae al descarte
//   Shuffle      -> la carta flota sobre el mazo mientras este se baraja en el aire
//   See Future   -> las 3 de arriba se levantan en abanico hacia quien mira (boca abajo)
//   robar / Favor / pareja -> la carta viaja boca abajo (boca arriba solo si es para ti)
//   Defuse       -> la bomba sale del mazo latiendo en rojo, el Defuse la corta (destello
//                   verde) y la bomba vuelve a esconderse en el mazo
//   explotar     -> la bomba vuela al jugador, late y explota; su mano cae al descarte
import * as THREE from 'three';

let C = null; // contexto que da world.js
const tweens = new Map(); // mesh -> animación en curso (una por carta)
const timers = [];        // retrasos que se cancelan al empezar otra partida
const live = new Set();   // todo lo que este módulo ha puesto en la escena
let stagedFX = null;      // jugada flotando (ventana Nope)
let pendingBomb = null;   // bomba con Defuse esperando a que la escondas
let clock = 0;

// Lo que world.js consulta al dibujar
export const fxState = {
  hide: [[], [], [], []], // por jugador: tipos de carta que aún vienen volando a esa mano
  discardLag: 0,          // cartas del descarte que aún no han aterrizado
  deckHidden: false,      // el mazo real se oculta mientras se baraja
  deckHideTop: 0,         // cartas de arriba levantadas (See Future / bomba)
};

export function setupFX(ctx) { C = ctx; }

// ---------- utilidades ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function later(sec, fn) { timers.push({ at: clock + sec, fn }); }

function card(type, faceUp, twoFaced = false) {
  const m = C.cardMesh(type, faceUp);
  if (faceUp && twoFaced) m.material = m.material.map((mt, i) => i === 5 ? m.material[4] : mt); // cara por los dos lados
  m.scale.setScalar(C.TABLE.cardScale);
  // por encima de los carteles de nombre (que se dibujan sin profundidad)
  m.material.forEach(mt => { mt.transparent = true; }); m.renderOrder = 5;
  C.scene.add(m); live.add(m);
  return m;
}
function dispose(m) {
  tweens.delete(m); live.delete(m);
  if (m.parent) m.parent.remove(m);
}

// Orientaciones
const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // tumbada, cara arriba
function qFacing(pos, target) { // de pie mirando a un punto (cara +Z hacia target)
  const o = new THREE.Object3D(); o.position.copy(pos); o.lookAt(target); return o.quaternion.clone();
}
function qToCam(pos) { // de pie, girada (solo en Y) hacia la cámara: así se lee desde tu sitio
  const c = C.camera.position; return qFacing(pos, V(c.x, pos.y, c.z));
}
function qUpright(p) { // de pie en la mano del jugador p, cara hacia él
  const h = handPoint(p); return qFacing(h, V(h.x * 10, h.y, h.z * 10));
}

// Puntos de la mesa
function dirOf(p) { const a = C.seatAngle(p); return { x: Math.sin(a), z: Math.cos(a) }; }
function handPoint(p) { const d = dirOf(p), r = C.TABLE.tableR - 0.15; return V(d.x * r, C.TABLE.cardY, d.z * r); }
function hoverPoint(p) { // flotando delante de la víctima
  if (p < 0) return V(0, 1.85, 0);
  const d = dirOf(p), r = p === C.mySeat ? 0.55 : 1.05; // la tuya, más al centro (si no, te tapa la vista)
  return V(d.x * r, 1.75, d.z * r);
}
function chestPoint(p) { const s = C.seatXZ(p); return V(s.x, 1.25, s.z); }
const DECK = () => V(-0.55, C.TABLE.deckY, 0);
const DISCARD = () => V(0.55, C.TABLE.deckY, 0.05);
function deckTop() { return DECK().add(V(0, Math.min(C.deckCount(), 10) * 0.03, 0)); }
function discardTop() { return DISCARD().add(V(0, Math.min(C.discardCount(), 6) * 0.006 + 0.01, 0)); }

// Vuelo en arco: posición por Bézier cuadrática, giro por slerp (+ vueltas opcionales en Y)
function fly(m, to, toQ, dur, { arc = 0.8, spins = 0, scale = null, delay = 0, done } = {}) {
  const from = m.position.clone(), fromQ = m.quaternion.clone(), s0 = m.scale.x, s1 = scale ?? s0;
  const mid = from.clone().lerp(to, 0.5); mid.y = Math.max(from.y, to.y) + arc;
  const tmpQ = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), Y = V(0, 1, 0);
  tweens.set(m, {
    t: -delay, dur, done,
    step(k) {
      const e = ease(k), a = 1 - e;
      m.position.set(
        a * a * from.x + 2 * a * e * mid.x + e * e * to.x,
        a * a * from.y + 2 * a * e * mid.y + e * e * to.y,
        a * a * from.z + 2 * a * e * mid.z + e * e * to.z);
      tmpQ.slerpQuaternions(fromQ, toQ, e);
      if (spins) { spinQ.setFromAxisAngle(Y, Math.sin(Math.PI * e) * spins * Math.PI); tmpQ.premultiply(spinQ); }
      m.quaternion.copy(tmpQ);
      m.scale.setScalar(s0 + (s1 - s0) * e);
    },
  });
}
// Animación libre (fn recibe 0..1)
function anim(m, dur, step, done, delay = 0) { tweens.set(m, { t: -delay, dur, step, done }); }

function flash(pos, color, size = 0.6, life = 0.5) { // destello esférico que se desvanece
  const s = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  s.position.copy(pos); C.scene.add(s); live.add(s);
  anim(s, life, k => { s.scale.setScalar(0.4 + k * 1.6); s.material.opacity = 0.85 * (1 - k); }, () => dispose(s));
}
function ring(pos, color) { // onda plana (corte del Defuse)
  const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  r.position.copy(pos); r.lookAt(C.camera.position); C.scene.add(r); live.add(r);
  anim(r, 0.6, k => { r.scale.setScalar(1 + k * 5); r.material.opacity = 0.9 * (1 - k); }, () => dispose(r));
}
function tint(m, hex) { [].concat(m.material).forEach(mt => mt.emissive && mt.emissive.setHex(hex)); }

// Carta que llega a una mano: oculta allí hasta aterrizar
function toHand(m, p, type, dur, opts = {}, preHidden = false) {
  if (!preHidden) { fxState.hide[p].push(type); C.relayout(); }
  fly(m, handPoint(p), qUpright(p), dur, {
    arc: 0.9, ...opts, scale: C.TABLE.cardScale, done: () => {
      const i = fxState.hide[p].indexOf(type); if (i >= 0) fxState.hide[p].splice(i, 1);
      dispose(m); C.relayout();
    },
  });
}
// Carta que cae al descarte (ya está en G.discard): se ve aterrizar
function toDiscard(m, dur, delay = 0) {
  if (m.parent !== C.scene) C.scene.attach(m);
  const yaw = (Math.random() - 0.5) * 0.5;
  const q = qFlat.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw));
  fly(m, discardTop(), q, dur, {
    arc: 0.5, delay, scale: C.TABLE.cardScale, done: () => {
      fxState.discardLag = Math.max(0, fxState.discardLag - 1);
      dispose(m); C.relayout();
    },
  });
}

// ---------- API para game.js / ui.js ----------

// Se juega una carta (o pareja/trío): sale de la mano y flota hacia el objetivo
export function fxPlay(actor, cards, target) {
  if (!C) return;
  clearStaged();
  // Grupo flotante delante del objetivo; mira siempre hacia tu cámara (ver updateFX)
  const g = new THREE.Group(); g.position.copy(hoverPoint(target)); g.quaternion.copy(qToCam(g.position)); C.scene.add(g);
  g.updateMatrixWorld(true);
  stagedFX = { group: g, meshes: [], target, actor, readyAt: clock + 0.85, nopes: 0, cancelled: false };
  const n = cards.length;
  cards.forEach((type, i) => {
    const m = card(type, true, true);
    m.position.copy(handPoint(actor)); m.quaternion.copy(qUpright(actor));
    const local = V((i - (n - 1) / 2) * 0.32, 0, -0.01 * i);
    fly(m, g.localToWorld(local.clone()), g.quaternion.clone(), 0.75, {
      arc: 0.9, delay: i * 0.1, scale: 1.25, done: () => { if (stagedFX?.group === g) dock(g, m, local); },
    });
    stagedFX.meshes.push(m);
  });
}

function dock(g, m, local, tiltZ = 0) { // se queda pegada al grupo flotante
  g.add(m); m.position.copy(local); m.quaternion.setFromAxisAngle(V(0, 0, 1), tiltZ);
}

// NOPE: vuela y se estampa sobre la jugada
export function fxNope(p, cancelledNow) {
  if (!C || !stagedFX) return;
  const S = stagedFX, g = S.group;
  fxState.discardLag++; // ya está en G.discard
  const m = card('Nope', true, true);
  m.position.copy(handPoint(p)); m.quaternion.copy(qUpright(p));
  S.nopes++;
  const local = V(0.04 * S.nopes, 0.05 * S.nopes, 0.04 * S.nopes); // delante de la jugada (hacia ti)
  const tilt = (Math.random() - 0.5) * 0.6;
  const delay = Math.max(0, S.readyAt - clock) + 0.1;
  S.readyAt = clock + delay + 0.6;
  g.updateMatrixWorld(true);
  const to = g.localToWorld(local.clone());
  const q = g.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), tilt));
  fly(m, to, q, 0.55, {
    arc: 1.1, delay, scale: 1.4, spins: 2, done: () => {
      if (stagedFX !== S) return;
      dock(g, m, local, tilt);
      flash(to, cancelledNow ? 0xff3030 : 0x40c0ff, 0.35, 0.4);
      S.cancelled = cancelledNow;
      S.meshes.forEach(mm => tint(mm, cancelledNow ? 0x661010 : 0x000000));
      const base = g.position.clone();
      anim(g, 0.35, k => g.position.set(base.x + Math.sin(k * 40) * 0.05 * (1 - k), base.y, base.z), () => g.position.copy(base));
    },
  });
  S.meshes.push(m);
}

// Se resuelve la ventana Nope
export function fxResolve(cancelled, kind, actor, target) {
  if (!C || !stagedFX) return;
  const S = stagedFX; stagedFX = null;
  const playCards = S.meshes.slice(0, S.meshes.length - S.nopes);
  fxState.discardLag += playCards.length; // game.js las acaba de pasar al descarte
  const wait = Math.max(0, S.readyAt - clock);
  const dropAll = (d0 = 0) => {
    S.meshes.forEach((m, i) => { tweens.delete(m); toDiscard(m, 0.6, d0 + i * 0.08); });
    later(d0 + S.meshes.length * 0.08 + 0.7, () => { if (S.group.parent) S.group.parent.remove(S.group); });
  };
  if (cancelled) { later(wait, () => dropAll()); return; }
  if (kind === 'Attack' && target >= 0) { // embiste a la víctima y luego al descarte
    later(wait, () => {
      const hit = chestPoint(target);
      playCards.forEach(m => { C.scene.attach(m); fly(m, hit, m.quaternion.clone(), 0.35, { arc: 0.1, spins: 1 }); });
      later(0.35, () => { flash(hit, 0xff5020, 0.5, 0.45); dropAll(0.1); });
    });
  } else if (kind === 'Shuffle') {
    later(wait, () => {
      C.scene.attach(S.group);
      const from = S.group.position.clone(), to = DECK().add(V(0, 1.4, 0));
      anim(S.group, 1.9, k => {
        S.group.position.lerpVectors(from, to, Math.min(1, k * 4));
        S.group.rotation.y = k * Math.PI * 6;
      }, () => dropAll());
      fxShuffleDeck(0.25);
    });
  } else later(wait + 0.25, () => dropAll());
}

// Baraja el mazo en el aire (riffle): dos montones que se intercalan
function fxShuffleDeck(delay = 0) {
  later(delay, () => {
    const n = Math.max(2, Math.min(C.deckCount(), 10));
    fxState.deckHidden = true; C.relayout();
    const base = DECK(), cards = [];
    for (let i = 0; i < n; i++) {
      const m = card('Shuffle', false); m.position.copy(base).add(V(0, i * 0.03, 0)); m.quaternion.copy(qFlat); cards.push(m);
    }
    const order = cards.map((_, i) => i).sort(() => Math.random() - 0.5);
    cards.forEach((m, i) => {
      const side = i % 2 ? 1 : -1, home = m.position.clone();
      const slot = order.indexOf(i);
      anim(m, 1.6, k => {
        // 0-0.3 sube y se separa; 0.3-0.7 da vueltas; 0.7-1 cae intercalada
        const up = Math.sin(Math.min(1, k / 0.3) * Math.PI / 2);
        const fall = k > 0.7 ? ease((k - 0.7) / 0.3) : 0;
        const ang = k * Math.PI * 4 + i;
        const x = home.x + side * 0.38 * up * (1 - fall) + Math.cos(ang) * 0.08 * (1 - fall) * up;
        const y = base.y + (0.55 + i * 0.05) * up * (1 - fall) + slot * 0.03 * fall + (1 - up) * i * 0.03 * (1 - fall);
        m.position.set(x, y, home.z + Math.sin(ang) * 0.08 * (1 - fall) * up);
        m.quaternion.copy(qFlat);
        m.rotateZ(side * 0.4 * up * (1 - fall));
      }, () => {
        dispose(m);
        if (m === cards[cards.length - 1]) { fxState.deckHidden = false; C.relayout(); }
      }, (i % 2) * 0.05);
    });
  });
}

// See Future: las 3 de arriba se levantan en abanico hacia quien mira (boca abajo)
export function fxFuture(actor) {
  if (!C) return;
  const n = Math.min(3, C.deckCount()); if (!n) return;
  fxState.deckHideTop = n; C.relayout();
  const top = deckTop(), d = dirOf(actor);
  const eye = V(d.x * 2.6, 1.6, d.z * 2.6);
  const center = DECK().lerp(eye, 0.35).setY(1.45);
  for (let i = 0; i < n; i++) {
    const m = card('Shuffle', false); m.position.copy(top).add(V(0, -i * 0.03, 0)); m.quaternion.copy(qFlat);
    const q = qFacing(center, eye);
    const off = V((i - (n - 1) / 2) * 0.34, 0.05 * (1 - Math.abs(i - 1)), 0).applyQuaternion(q);
    const to = center.clone().add(off);
    fly(m, to, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (1 - i) * 0.18)), 0.5, {
      arc: 0.3, delay: i * 0.08, done: () => later(1.3, () => fly(m, top.clone().add(V(0, -i * 0.03, 0)), qFlat, 0.45, {
        arc: 0.2, delay: i * 0.06, done: () => { dispose(m); if (i === n - 1) { fxState.deckHideTop = 0; C.relayout(); } },
      })),
    });
  }
}

// Robar del mazo
export function fxDraw(p, type) {
  if (!C) return;
  const m = card(type, p === C.mySeat);
  m.position.copy(deckTop()); m.quaternion.copy(qFlat);
  toHand(m, p, type, 0.6);
}

// Una carta pasa de una mano a otra (Favor, pareja, trío)
export function fxTransfer(from, to, type, delay = 0) {
  if (!C) return;
  const m = card(type, from === C.mySeat || to === C.mySeat);
  m.position.copy(handPoint(from)); m.quaternion.copy(qUpright(from)); m.visible = false;
  fxState.hide[to].push(type); C.relayout(); // ya está en su mano (game.js): oculta hasta que llegue
  later(delay, () => { m.visible = true; toHand(m, to, type, 0.7, { arc: 1.2 }, true); });
}

// Bomba con Defuse. reinsertNow = la IA la esconde ya; si eres tú, espera a fxReinsert().
export function fxDefuse(p, reinsertNow) {
  if (!C) return;
  clearBomb();
  fxState.discardLag++; // el Defuse ya está en el descarte
  const kit = card('Exploding Kitten', true, true);
  kit.position.copy(deckTop()); kit.quaternion.copy(qFlat);
  const hover = hoverPoint(p).add(V(0, 0.15, 0));
  const B = pendingBomb = { kit, p, hover, alive: true };
  fly(kit, hover, qToCam(hover), 0.6, { arc: 0.6, scale: 1.5, done: () => pulse(B) });
  const def = card('Defuse', true, true);
  def.position.copy(handPoint(p)); def.quaternion.copy(qUpright(p));
  const hq = qToCam(hover);
  fly(def, hover.clone().add(V(0, 0, 0.03).applyQuaternion(hq)), hq, 0.5, {
    arc: 0.7, delay: 0.9, scale: 1.5, spins: 2, done: () => {
      flash(hover, 0x40ff80, 0.45, 0.5); ring(hover, 0x40ff80);
      B.defused = true; tint(kit, 0x000000);
      toDiscard(def, 0.6, 0.25);
      if (reinsertNow) later(0.6, () => fxReinsert());
    },
  });
}
function pulse(B) { // late en rojo mientras siga activa (hasta el Defuse)
  if (!B.alive) return;
  anim(B.kit, 0.5, k => {
    const s = 1.5 * (1 + 0.08 * Math.sin(k * Math.PI));
    B.kit.scale.setScalar(s);
    if (!B.defused) tint(B.kit, Math.sin(k * Math.PI) > 0.5 ? 0x880000 : 0x330000);
  }, () => { if (B.alive && !B.reinserting) pulse(B); });
}
// La bomba vuelve al mazo (y se pierde de vista entre las cartas)
export function fxReinsert() {
  const B = pendingBomb; if (!B) return;
  pendingBomb = null; B.reinserting = true; tint(B.kit, 0x000000);
  const top = deckTop();
  fly(B.kit, top.clone().add(V(0.9, 0.25, 0)), qFlat, 0.55, {
    arc: 0.5, scale: C.TABLE.cardScale, done: () => {
      fly(B.kit, top.clone().add(V(0, -0.12, 0)), qFlat, 0.4, { arc: 0, done: () => { B.alive = false; dispose(B.kit); } });
    },
  });
}

// Sin Defuse: la bomba vuela al jugador, late y explota. onBoom = explosión real (world.js)
export function fxKitten(p, handTypes, onBoom) {
  if (!C) { onBoom(); return; }
  fxState.discardLag += 1 + handTypes.length; // la bomba y su mano ya están en el descarte
  const kit = card('Exploding Kitten', true, true);
  kit.position.copy(deckTop()); kit.quaternion.copy(qFlat);
  const to = hoverPoint(p).add(V(0, 0.2, 0));
  let fired = false;
  const boom = () => {
    if (fired) return; fired = true;
    onBoom();
    flash(to, 0xff7a00, 0.6, 0.5);
    fxState.discardLag = Math.max(0, fxState.discardLag - 1); dispose(kit); C.relayout();
    // su mano sale disparada al descarte
    handTypes.forEach((t, i) => {
      const m = card(t, true, true); m.position.copy(handPoint(p)); m.quaternion.copy(qUpright(p));
      toDiscard(m, 0.7, 0.15 + i * 0.06);
    });
  };
  fly(kit, to, qToCam(to), 0.55, {
    arc: 0.6, scale: 1.6, spins: 1, done: () => {
      anim(kit, 0.75, k => {
        kit.scale.setScalar(1.6 * (1 + 0.12 * Math.sin(k * Math.PI * 6)));
        tint(kit, Math.sin(k * Math.PI * 6) > 0 ? 0xaa0000 : 0x220000);
      }, boom);
    },
  });
  later(2.5, boom); // seguro: explota aunque algo corte la animación
}

// Nueva partida: fuera todo lo que esté en el aire
export function fxReset() {
  for (const m of [...tweens.keys()]) if (m.isMesh || m.isGroup) dispose(m);
  for (const m of [...live]) dispose(m); // también las que esperaban su turno (invisibles)
  tweens.clear(); timers.length = 0;
  clearStaged(); clearBomb();
  fxState.hide = [[], [], [], []]; fxState.discardLag = 0; fxState.deckHidden = false; fxState.deckHideTop = 0;
}
function clearStaged() {
  if (!stagedFX) return;
  stagedFX.meshes.forEach(dispose);
  if (stagedFX.group.parent) stagedFX.group.parent.remove(stagedFX.group);
  stagedFX = null;
}
function clearBomb() { if (pendingBomb) { pendingBomb.alive = false; dispose(pendingBomb.kit); pendingBomb = null; } }

// Bucle (lo llama world.js en cada frame)
export function updateFX(dt) {
  clock += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) { const t = timers.splice(i, 1)[0]; t.fn(); }
  for (const [m, tw] of [...tweens]) {
    if (tweens.get(m) !== tw) continue; // la sustituyó otra durante este frame
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.dur);
    tw.step(k);
    if (k >= 1) { if (tweens.get(m) === tw) tweens.delete(m); tw.done?.(); }
  }
  if (stagedFX) { // la jugada flota y gira despacio para que la vea toda la mesa
    const g = stagedFX.group;
    if (!tweens.has(g)) {
      const want = qToCam(g.position).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.sin(clock * 0.9) * 0.25));
      g.quaternion.slerp(want, Math.min(1, dt * 4));
      g.position.y = hoverPoint(stagedFX.target).y + Math.sin(clock * 2.2) * 0.04;
    }
  }
}
