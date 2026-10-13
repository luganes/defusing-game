// ================= Animaciones (Mixamo) =================
// Las animaciones son FBX de Mixamo descargados "Without Skin" (solo huesos).
// Sirven para TODOS los personajes con esqueleto de Mixamo (huesos "mixamorig..."):
// se aplican por nombre de hueso, así que un baile descargado una vez vale para todos.
// Los personajes sin ese esqueleto se quedan quietos como hasta ahora.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ANIMS, shuffle } from './config.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const SIT_CLIPS = () => Object.values(ANIMS.sentado).flat();
const IDLE_CLIPS = () => ANIMS.depie || [];

// ---------- Clips base (uno por archivo, compartidos) ----------
const baseCache = {};
function loadBase(path) {
  if (!baseCache[path]) {
    baseCache[path] = new FBXLoader().loadAsync(encodeURI(path)).then(obj => {
      const clip = obj.animations[0];
      if (!clip) throw new Error('sin animación');
      let hips = null; obj.traverse(o => { if (!hips && /Hips$/.test(o.name)) hips = o; });
      if (!hips) throw new Error('sin cadera (mixamorigHips)');
      // Pose de reposo de la cadera y orientación de su padre (relativa al archivo):
      // sirven para pasar la cadera al sistema de cada personaje (ver clipFor).
      obj.updateMatrixWorld(true);
      const parentQ = obj.getWorldQuaternion(new THREE.Quaternion()).invert()
        .multiply(hips.parent.getWorldQuaternion(new THREE.Quaternion()));
      // ¿Es una animación sentada? (la cadera nunca sube de ~3/4 de su altura de pie)
      const hp = clip.tracks.find(t => /Hips\.position$/.test(t.name));
      let maxY = -Infinity; if (hp) for (let i = 1; i < hp.values.length; i += 3) maxY = Math.max(maxY, hp.values[i]);
      const seated = !!hp && hips.position.y > 0 && maxY / hips.position.y < 0.75;
      return { clip, path, restPos: hips.position.clone(), restQ: hips.quaternion.clone(), parentQ, seated };
    }).catch(err => { console.warn('[anim] no cargó', path, err?.message || err); return null; });
  }
  return baseCache[path];
}

// Precarga en segundo plano (sentados primero: es lo que se ve al empezar).
export function preloadAll() {
  // lo que se ve enseguida (sentados, gestos, muerte); los bailes, un poco después
  [...SIT_CLIPS(), ...IDLE_CLIPS(), ...ONCE.flatMap(k => ANIMS[POOL[k]] || []), ...ANIMS.muerte].forEach(loadBase);
  setTimeout(() => [...ANIMS.baile, ...ANIMS.celebra].forEach(loadBase), 25000);
}

// Gestos de una sola vez (luego vuelven a sentarse): tipo -> lista de config.js
const POOL = { attack: 'ataque', react: 'reaccion', cheer: 'mesa' };
const ONCE = Object.keys(POOL);

// ---------- Rig: un personaje animable ----------
const rigs = new Set();

// Devuelve el rig del modelo (o null si no tiene esqueleto de Mixamo).
// Los huesos de Sketchfab traen sufijo "_01", "_024"...: se quitan para que
// coincidan con los nombres de las animaciones ("mixamorigHips").
export function rigFor(root) {
  if (root.userData.rig !== undefined) return root.userData.rig;
  const bones = {};
  root.traverse(o => {
    if (!o.isBone || !/^mixamorig/.test(o.name)) return;
    const clean = o.name.replace(/_\d+$/, '');
    if (!bones[clean]) { o.name = clean; bones[clean] = o; }
  });
  const hips = bones.mixamorigHips;
  if (!hips) { root.userData.rig = null; return null; }
  root.updateMatrixWorld(true);
  unifySkeletons(root, bones);
  const parentQ = root.getWorldQuaternion(new THREE.Quaternion()).invert()
    .multiply(hips.parent.getWorldQuaternion(new THREE.Quaternion()));
  const rig = {
    root, bones, hips, restHips: hips.position.clone(), restHipsQ: hips.quaternion.clone(), parentQ,
    mixer: new THREE.AnimationMixer(root),
    clips: {}, current: null, currentPath: null, state: 'idle', token: 0, holder: null,
  };
  rig.mixer.addEventListener('finished', e => { // gesto terminado: de vuelta a la silla
    if (ONCE.includes(rig.state) && e.action === rig.current) play(rig, 'sit');
  });
  rig.mixer.addEventListener('loop', e => { // sentado: al acabar una vuelta, a veces cambia de animación
    if ((rig.state === 'sit' || rig.state === 'idle') && e.action === rig.current && Math.random() < 0.5) play(rig, rig.state);
  });
  root.userData.rig = rig;
  return rig;
}

// Algunos modelos traen el esqueleto repetido (una copia por pieza: alas, pelo...).
// La animación solo mueve la primera copia, así que esas piezas se quedaban quietas y
// se estiraban. Cada pieza pasa a usar los huesos principales (si están en el mismo sitio).
function unifySkeletons(root, bones) {
  const tol = m => 1e-3 * (1 + Math.max(...m.elements.map(Math.abs)));
  const same = (a, b) => { const t = tol(a.matrixWorld); return a.matrixWorld.elements.every((v, i) => Math.abs(v - b.matrixWorld.elements[i]) <= t); };
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    let changed = false;
    const list = o.skeleton.bones.map(b => {
      const main = bones[b.name.replace(/_\d+$/, '')];
      if (main && main !== b && same(main, b)) { changed = true; return main; }
      return b;
    });
    if (changed) o.bind(new THREE.Skeleton(list, o.skeleton.boneInverses), o.bindMatrix);
  });
}

// Vuelve a la pose original del archivo antes de medir/encajar el modelo otra vez.
// La primera vez solo la guarda (el modelo recién cargado ya está en esa pose).
// (No se usa skeleton.pose(): con las matrices aún sin calcular encoge el esqueleto.)
export function resetPose(root) {
  const rig = root.userData.rig;
  if (rig) { rig.mixer.stopAllAction(); rig.current = null; rig.currentPath = null; rig.state = 'idle'; rig.token++; }
  if (!root.userData.restBones) {
    const rest = [];
    root.traverse(o => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    root.userData.restBones = rest;
    return;
  }
  for (const [b, p, q, sc] of root.userData.restBones) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(sc); }
}

// Adapta el clip base a este personaje: solo huesos que tiene, y la cadera
// (rotación y posición) convertida a SU sistema. Hay archivos (p. ej. Cristiano) cuya
// cadera viene girada 90°: copiada tal cual, el cuerpo entero quedaba inclinado.
// Si el sistema coincide con el de la animación, el resultado es el mismo que copiar.
// inPlace = sin desplazarse (bailes y sentados).
// upper = solo de cintura para arriba (piernas y cadera quietas): un "sentado" así
// sirve de pose de pie para el público mientras no haya animaciones de pie.
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const LOWER = /^mixamorig(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;
function clipFor(rig, base, inPlace, upper = false) {
  const key = base.path + (inPlace ? '#ip' : '') + (upper ? '#up' : '');
  if (rig.clips[key]) return rig.clips[key];
  const Ps = base.parentQ, Pt = rig.parentQ;
  const R = Pt.clone().invert().multiply(Ps);                     // padre animación -> padre personaje
  const L = R.clone();                                            // izquierda: inv(Op) = inv(Pt)·Ps
  const O = Ps.clone().multiply(base.restQ).invert().multiply(Pt.clone().multiply(rig.restHipsQ)); // derecha
  const k = rig.restHips.length() / (base.restPos.length() || 1); // tamaño del personaje vs. el de la animación
  const tracks = [];
  for (const t of base.clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (!rig.bones[bone]) continue;
    if (upper && LOWER.test(bone)) continue;
    if (prop === 'quaternion') {
      const tt = t.clone();
      if (bone === 'mixamorigHips') {
        const v = tt.values;
        for (let i = 0; i < v.length; i += 4) {
          _q.fromArray(v, i); _q.premultiply(L).multiply(O); _q.toArray(v, i);
        }
      }
      tracks.push(tt);
    } else if (prop === 'position' && bone === 'mixamorigHips') {
      const tt = t.clone(); const v = tt.values;
      const x0 = v[0], z0 = v[2], rp = base.restPos;
      for (let i = 0; i < v.length; i += 3) {
        // desplazamiento respecto al reposo, en el sistema de la animación (Y arriba)
        _v.set(inPlace ? 0 : v[i] - x0, v[i + 1] - rp.y, inPlace ? 0 : v[i + 2] - z0);
        _v.applyQuaternion(R).multiplyScalar(k).add(rig.restHips);
        _v.toArray(v, i);
      }
      tracks.push(tt);
    }
  }
  return (rig.clips[key] = new THREE.AnimationClip(base.clip.name, base.clip.duration, tracks));
}

// Reproduce una animación del tipo pedido:
//  'sit'   sentado (al azar entre tranquilo/molesto/alterado, en bucle)
//  'death' muerte (una vez, se queda tirado)
//  'dance' baile (en bucle). opts.path fuerza un archivo concreto.
//  'idle'  de pie (público): ANIMS.depie; si está vacío, un sentado solo de cintura para arriba
export async function play(rig, kind, opts = {}) {
  if (!rig) return null;
  const token = ++rig.token;
  rig.state = kind;
  let path = opts.path;
  if (!path) {
    let pool = kind === 'sit' ? SIT_CLIPS() : kind === 'death' ? ANIMS.muerte
      : kind === 'idle' ? (IDLE_CLIPS().length ? IDLE_CLIPS() : SIT_CLIPS())
      : POOL[kind] ? (ANIMS[POOL[kind]] || []) : [...ANIMS.baile, ...ANIMS.celebra];
    if (opts.seatedOnly) { // p. ej. tu propio personaje con la cámara en su cabeza: sin levantarse
      const bases = await Promise.all(pool.map(loadBase));
      if (token !== rig.token) return null;
      pool = pool.filter((p, i) => bases[i]?.seated);
    }
    const options = pool.filter(p => p !== rig.currentPath || pool.length === 1);
    path = pick(options.length ? options : pool);
  }
  if (!path) { if (ONCE.includes(kind)) return play(rig, 'sit'); return null; } // sin animaciones de ese tipo: sigue sentado
  const base = await loadBase(path);
  if (!base || token !== rig.token) return null; // mientras cargaba se pidió otra cosa
  const upper = kind === 'idle' && !IDLE_CLIPS().includes(path);
  const clip = clipFor(rig, base, kind !== 'death', upper);
  const action = rig.mixer.clipAction(clip);
  action.reset();
  if (kind === 'death' || ONCE.includes(kind)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
  else { action.setLoop(THREE.LoopRepeat, Infinity); action.clampWhenFinished = false; }
  const first = !rig.current;
  if ((kind === 'sit' || kind === 'idle') && first) action.time = Math.random() * clip.duration; // que no vayan sincronizados
  if (rig.current && rig.current !== action) { action.play(); rig.current.crossFadeTo(action, 0.35, false); }
  else action.play();
  rig.current = action; rig.currentPath = path;
  // Dónde está el cuerpo: sentado en la silla (un poco hacia atrás) o de pie en su sitio
  // (bailes, muerte y los gestos de pie). Gira hacia opts.yaw (p. ej. mirar a la víctima).
  if (rig.holder) {
    const seated = kind === 'sit' || kind === 'idle' || kind === 'react' || kind === 'cheer' || (kind === 'attack' && base.seated);
    const h = rig.holder.userData;
    h.zT = seated ? -(h.chairBack || 0) : 0;
    h.yawT = opts.yaw || 0;
    if (first) { rig.holder.position.z = h.zT; rig.holder.rotation.y = h.yawT; } // recién puesto: sin transición
  }
  rigs.add(rig);
  return path;
}

export function updateAnims(dt) {
  const k = Math.min(1, dt * 5);
  for (const rig of rigs) {
    let o = rig.root, inScene = false;
    while (o) { if (o.isScene) { inScene = true; break; } o = o.parent; }
    if (!inScene) { rigs.delete(rig); continue; } // ya no está en la mesa ni en el público
    rig.mixer.update(dt);
    const h = rig.holder; // levantarse / sentarse / girarse, suave
    if (h && h.userData.zT !== undefined) {
      h.position.z += (h.userData.zT - h.position.z) * k;
      h.rotation.y += (h.userData.yawT - h.rotation.y) * k;
    }
  }
}

// Bailes para la victoria: uno ÚNICO para el ganador y el resto, barajados, para el
// público (nunca el del ganador mientras haya otros disponibles).
export function danceDeal(nCrowd) {
  const all = [...ANIMS.baile, ...ANIMS.celebra];
  if (!all.length) return { winner: null, crowd: [] };
  const winner = pick(ANIMS.baile.length ? ANIMS.baile : all);
  const rest = all.filter(p => p !== winner);
  const crowd = [];
  let bag = [];
  for (let i = 0; i < nCrowd; i++) {
    if (!bag.length) bag = shuffle(rest.length ? rest : all);
    crowd.push(bag.pop());
  }
  return { winner, crowd };
}
