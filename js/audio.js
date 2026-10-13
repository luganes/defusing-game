// ================= Sonido: música y efectos =================
// Todo se genera en el navegador (Web Audio), sin archivos: así funciona siempre.
// Si quieres usar tus propias canciones o efectos, pon el archivo en la carpeta Audio/
// y apúntalo en AUDIO_FILES (config.js), p. ej. { musica: 'Audio/musica.mp3' }.
// Nombres posibles: musica, victoria, fiesta y cualquier efecto (attack, nope, boom...).

import { AUDIO_FILES } from './config.js';

let ctx = null, master, musicBus, sfxBus, noiseBuf, musicIn, LOOK = 1.6;
const files = {};             // nombre -> AudioBuffer (archivos del usuario)
const load = k => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const prefs = { music: load('ek-music') !== '0', sfx: load('ek-sfx') !== '0' };

// El navegador solo deja sonar audio tras un toque/clic: se llama desde el primer botón.
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.32 : 0; musicBus.connect(comp);
  // un poco de sala (reverb) para la música: suena a garito, no a ordenador
  musicIn = ctx.createGain();
  const wet = ctx.createGain(); wet.gain.value = 0.32;
  const room = ctx.createConvolver(); room.buffer = makeRoom(2.6);
  musicIn.connect(musicBus); musicIn.connect(room); room.connect(wet); wet.connect(musicBus);
  sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 0.75 : 0; sfxBus.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const [k, url] of Object.entries(AUDIO_FILES || {})) {
    fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(b => ctx.decodeAudioData(b))
      .then(buf => { files[k] = buf; if ({ musica: 'mesa', fiesta: 'fiesta' }[k] === wantMusic) startMusic(wantMusic, true); })
      .catch(e => console.warn('[audio] no cargó', url, e));
  }
  if (wantMusic) startMusic(wantMusic, true);
}

export const musicOn = () => prefs.music;
export const sfxOn = () => prefs.sfx;
export function setMusic(on) { prefs.music = on; save('ek-music', on ? '1' : '0'); if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.1); }
export function setSfx(on) { prefs.sfx = on; save('ek-sfx', on ? '1' : '0'); if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.75 : 0, ctx.currentTime, 0.05); }

// Respuesta de una sala: ruido que se apaga poco a poco (estéreo, un poco distinto en cada lado)
function makeRoom(secs) {
  const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 200 ? i / 200 : 1);
  }
  return b;
}

// ---------- Piezas básicas ----------
const now = () => ctx.currentTime;
function env(g, t, a, peak, dec, sus = 0, rel = 0.05, len = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  if (len) { g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec); g.gain.setValueAtTime(Math.max(sus, 0.0001), t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + rel); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(bus, { type = 'sine', f = 440, f2 = null, t = now(), a = 0.005, d = 0.3, peak = 0.3, len = 0, sus = 0, rel = 0.08, filter = null, detune = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (len || d));
  let out = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = filter.type || 'lowpass'; fl.frequency.value = filter.f; fl.Q.value = filter.q || 0.7; o.connect(fl); out = fl; }
  out.connect(g); g.connect(bus);
  env(g, t, a, peak, d, sus, rel, len);
  o.start(t); o.stop(t + a + Math.max(d, len) + rel + 0.05);
  return o;
}
function noise(bus, { t = now(), d = 0.2, peak = 0.3, type = 'bandpass', f = 2000, f2 = null, q = 1, a = 0.003 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = ctx.createGain(); s.connect(fl); fl.connect(g); g.connect(bus);
  env(g, t, a, peak, d);
  s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05);
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function playFile(name, bus, loop = false, vol = 1) {
  const s = ctx.createBufferSource(); s.buffer = files[name]; s.loop = loop;
  const g = ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(bus); s.start();
  return { stop: (t = 0.4) => { g.gain.setTargetAtTime(0, now(), t / 3); s.stop(now() + t + 0.1); } };
}

// ---------- Efectos ----------
const SFX = {
  ui: () => tone(sfxBus, { type: 'triangle', f: 1200, d: 0.05, peak: 0.12 }),
  card: () => { noise(sfxBus, { d: 0.09, f: 3500, q: 0.8, peak: 0.35 }); tone(sfxBus, { type: 'triangle', f: 900, f2: 1400, d: 0.06, peak: 0.08 }); },
  draw: () => noise(sfxBus, { d: 0.22, f: 1200, f2: 4000, q: 1.2, peak: 0.3 }),
  attack: () => { noise(sfxBus, { d: 0.35, f: 400, f2: 3000, q: 1.2, peak: 1.0 }); tone(sfxBus, { type: 'sawtooth', f: 180, f2: 90, d: 0.3, peak: 0.12, filter: { f: 900 } }); },
  punch: () => { tone(sfxBus, { type: 'sine', f: 150, f2: 45, d: 0.25, peak: 0.9 }); noise(sfxBus, { d: 0.08, type: 'lowpass', f: 1500, peak: 0.6 }); },
  skip: () => { tone(sfxBus, { type: 'sine', f: 500, f2: 1500, d: 0.16, peak: 0.25 }); tone(sfxBus, { type: 'sine', f: 750, f2: 2200, t: now() + 0.08, d: 0.14, peak: 0.15 }); },
  shuffle: () => { for (let i = 0; i < 16; i++) noise(sfxBus, { t: now() + i * 0.045 + Math.random() * 0.01, d: 0.035, f: 2500 + Math.random() * 2500, q: 1.5, peak: 0.25 }); },
  future: () => [76, 79, 83, 88, 91].forEach((m, i) => tone(sfxBus, { type: 'sine', f: mtof(m), t: now() + i * 0.07, d: 0.9, peak: 0.12 })),
  favor: () => { tone(sfxBus, { type: 'sine', f: mtof(79), d: 0.5, peak: 0.18 }); tone(sfxBus, { type: 'sine', f: mtof(84), t: now() + 0.12, d: 0.7, peak: 0.18 }); },
  nope: () => { [0, 0.2].forEach((dt, i) => tone(sfxBus, { type: 'square', f: i ? 140 : 190, t: now() + dt, a: 0.01, d: 0.16, len: 0.14, sus: 0.2, peak: 0.22, filter: { f: 1400 } })); },
  fizzle: () => noise(sfxBus, { d: 0.5, f: 3000, f2: 300, q: 3, peak: 0.2 }),
  cat: () => { // miau sintetizado
    const t = now(), o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(820, t + 0.12); o.frequency.linearRampToValueAtTime(560, t + 0.45);
    f1.type = 'bandpass'; f1.frequency.setValueAtTime(900, t); f1.frequency.linearRampToValueAtTime(1800, t + 0.15); f1.frequency.linearRampToValueAtTime(1000, t + 0.45); f1.Q.value = 4;
    f2.type = 'lowpass'; f2.frequency.value = 3500;
    o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(sfxBus);
    env(g, t, 0.04, 0.5, 0.42); o.start(t); o.stop(t + 0.55);
  },
  steal: () => { noise(sfxBus, { d: 0.25, f: 2500, f2: 600, q: 1.5, peak: 0.25 }); tone(sfxBus, { type: 'sine', f: mtof(88), t: now() + 0.18, d: 0.25, peak: 0.1 }); },
  kitten: () => { // mecha encendida + tono amenazante
    noise(sfxBus, { d: 1.0, f: 5000, q: 0.6, peak: 0.12, type: 'highpass' });
    tone(sfxBus, { type: 'sawtooth', f: 55, d: 1.0, len: 0.8, sus: 0.2, peak: 0.3, filter: { f: 300 } });
    tone(sfxBus, { type: 'sawtooth', f: 58, d: 1.0, len: 0.8, sus: 0.2, peak: 0.25, filter: { f: 300 } });
  },
  boom: () => {
    noise(sfxBus, { d: 1.6, type: 'lowpass', f: 2200, f2: 120, q: 0.5, peak: 1.0, a: 0.005 });
    tone(sfxBus, { type: 'sine', f: 90, f2: 28, d: 1.2, peak: 1.0 });
  },
  defuse: () => {
    [0, 0.07].forEach(dt => noise(sfxBus, { t: now() + dt, d: 0.03, f: 6000, q: 3, peak: 0.4 }));
    [72, 76, 79].forEach((m, i) => tone(sfxBus, { type: 'triangle', f: mtof(m), t: now() + 0.18 + i * 0.08, d: 0.5, peak: 0.2 }));
  },
  turn: () => { tone(sfxBus, { type: 'sine', f: 880, d: 0.6, peak: 0.16 }); tone(sfxBus, { type: 'sine', f: 1320, t: now() + 0.09, d: 0.7, peak: 0.12 }); },
  tick: () => tone(sfxBus, { type: 'square', f: 1600, d: 0.03, peak: 0.07, filter: { f: 3000 } }),
  sad: () => [[67, 0], [66, 0.35], [65, 0.7], [64, 1.05]].forEach(([m, dt], i) => tone(sfxBus, { type: 'sawtooth', f: mtof(m - 12), f2: i === 3 ? mtof(m - 13) : null, t: now() + dt, a: 0.03, d: 0.3, len: i === 3 ? 0.9 : 0.3, sus: 0.3, peak: 0.25, filter: { f: 900 } })),
};
export function sfx(name) {
  if (!ctx || !prefs.sfx) return;
  if (files[name]) { playFile(name, sfxBus); return; }
  try { SFX[name]?.(); } catch (e) { console.warn('[audio]', name, e); }
}

// ---------- Música ----------
// 'mesa': jazz de garito (walking bass, escobillas, acordes de piano eléctrico), en bucle.
// 'fiesta': la misma banda, más rápida y en mayor, para la celebración.
// 'victoria': fanfarria corta (luego suena 'fiesta').
let wantMusic = null, current = null;
const SONGS = {
  mesa: { bpm: 96, swing: 0.62, chords: [[57, 'm7'], [62, 'm7'], [64, '7'], [57, 'm7'], [53, 'maj7'], [62, 'm7'], [64, '7'], [64, '7b9']] },
  fiesta: { bpm: 124, swing: 0.58, chords: [[60, 'maj7'], [57, 'm7'], [62, 'm7'], [55, '7'], [60, 'maj7'], [57, '7'], [62, 'm7'], [55, '7']] },
};
const QUALITY = { m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], '7b9': [0, 4, 10, 13] };

// ---------- Jazz tranquilo ('mesa') ----------
// Balada a 66 bpm en Fa: piano eléctrico con acordes de 9ª y 13ª, contrabajo a dos tiempos,
// escobillas muy suaves y, de vez en cuando, una frase de vibráfono. Cada vuelta cambia algo.
const BALLAD = [ // [fundamental MIDI, intervalos del acorde]
  [55, [0, 3, 7, 10, 14]],      // Gm9
  [48, [0, 4, 10, 14, 21]],     // C13
  [53, [0, 4, 7, 11, 14]],      // Fmaj9
  [50, [0, 3, 7, 10, 14]],      // Dm9
  [58, [0, 4, 7, 11, 18]],      // Bbmaj7#11
  [57, [0, 3, 7, 10]],          // Am7
  [55, [0, 3, 7, 10, 14]],      // Gm9
  [48, [0, 5, 7, 10, 14]],      // C7sus4 (9)
];
const F_SCALE = [65, 67, 69, 70, 72, 74, 76, 77, 79, 81]; // notas de la melodía (Fa mayor, registro medio-agudo)
function rhodes(bus, m, t, len, vel) { // piano eléctrico: fundamental + octava suave + "campanita" al atacar
  tone(bus, { type: 'sine', f: mtof(m), t, a: 0.02, d: 0.6, len, sus: vel * 0.5, peak: vel, rel: 0.9 });
  tone(bus, { type: 'sine', f: mtof(m + 12), t, a: 0.01, d: 0.4, peak: vel * 0.18, rel: 0.3 });
  tone(bus, { type: 'sine', f: mtof(m) * 3.5, t, a: 0.002, d: 0.18, peak: vel * 0.05 });
}
function vibes(bus, m, t, vel) { // vibráfono con su vibrato
  const o = tone(bus, { type: 'sine', f: mtof(m), t, a: 0.004, d: 2.2, peak: vel });
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = mtof(m) * 0.004;
  lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 2.4);
  tone(bus, { type: 'sine', f: mtof(m) * 4, t, a: 0.002, d: 0.25, peak: vel * 0.12 });
}
function startBallad() {
  const beat = 60 / 66, swing = 0.6;
  let bar = 0, nextBar = now() + 0.15, stopped = false, lastMel = 72;
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(musicIn || musicBus);
  bus.gain.setTargetAtTime(1, now(), 1.2); // entra despacito
  const schedule = () => {
    if (stopped || !ctx) return;
    while (nextBar < now() + LOOK) {
      const [root, iv] = BALLAD[bar % BALLAD.length], next = BALLAD[(bar + 1) % BALLAD.length][0];
      const t0 = nextBar, sw = i => t0 + (Math.floor(i / 2) + (i % 2 ? swing : 0)) * beat;
      // contrabajo a dos tiempos (y en la última de cada vuelta, caminando hacia el siguiente)
      const walk = bar % 8 === 7;
      const bass = walk ? [root, root + iv[2], root + 10, next - 1] : [root, null, root + 7, null];
      bass.forEach((m, i) => { if (m !== null) tone(bus, { type: 'triangle', f: mtof(m - 24), t: t0 + i * beat, a: 0.02, d: beat * (walk ? 0.9 : 1.8), peak: 0.42, filter: { f: 480 } }); });
      // piano eléctrico: el acorde arpegiado muy rápido al empezar el compás, y un eco suave en el "y" del 3
      iv.forEach((s, k) => rhodes(bus, root + 12 + s, t0 + k * 0.025, beat * 3.2, 0.055));
      if (bar % 2) iv.slice(1, 4).forEach((s, k) => rhodes(bus, root + 12 + s, sw(5) + k * 0.02, beat * 1.2, 0.03));
      // escobillas: barrido continuo en cada tiempo y un toque leve en 2 y 4
      for (let b = 0; b < 4; b++) noise(bus, { t: t0 + b * beat, d: beat * 0.9, f: 4500, q: 0.6, peak: 0.018, a: beat * 0.35 });
      [1, 3].forEach(b => noise(bus, { t: t0 + b * beat, d: 0.14, f: 3000, q: 0.8, peak: 0.03 }));
      for (const i of [0, 2, 3, 4, 6, 7]) noise(bus, { t: sw(i), d: 0.1, f: 8000, q: 0.7, peak: i % 2 ? 0.008 : 0.013, type: 'highpass' });
      // melodía de vibráfono: frases cortas cada pocos compases, por grados conjuntos
      if (bar % 4 === 1 || (bar % 4 === 2 && Math.random() < 0.5)) {
        const n = 2 + Math.floor(Math.random() * 3), chord = iv.map(s => (root + s) % 12);
        const slots = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
        slots.forEach(sl => {
          let i = F_SCALE.indexOf(lastMel); if (i < 0) i = 4;
          i = Math.max(0, Math.min(F_SCALE.length - 1, i + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
          let m = F_SCALE[i];
          if (sl === slots[slots.length - 1]) { // la última nota cae en una nota del acorde
            const ok = F_SCALE.filter(x => chord.includes(x % 12));
            m = ok.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a, ok[0] ?? m);
          }
          lastMel = m;
          vibes(bus, m, sw(sl), 0.07);
        });
      }
      bar++; nextBar += 4 * beat;
    }
  };
  schedule();
  const iv = setInterval(schedule, 300);
  return { stop: (fade = 1.2) => { stopped = true; clearInterval(iv); bus.gain.setTargetAtTime(0, now(), fade / 3); setTimeout(() => bus.disconnect(), fade * 1000 + 2500); } };
}

function startSong(name) {
  if (name === 'mesa') return startBallad();
  const song = SONGS[name], beat = 60 / song.bpm;
  let bar = 0, nextBar = now() + 0.1, stopped = false;
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(musicIn || musicBus);
  bus.gain.setTargetAtTime(1, now(), 0.3);
  const schedule = () => {
    if (stopped || !ctx) return;
    while (nextBar < now() + 1.2) {
      const [root, q] = song.chords[bar % song.chords.length], iv = QUALITY[q];
      const nextRoot = song.chords[(bar + 1) % song.chords.length][0];
      const t0 = nextBar;
      const sw = i => t0 + (Math.floor(i / 2) + (i % 2 ? song.swing : 0)) * beat; // corcheas con swing
      // contrabajo: negras (fundamental, 3ª/5ª y nota de paso hacia el siguiente acorde)
      const bass = [root, root + iv[1], root + iv[2], nextRoot + (Math.random() < 0.5 ? 1 : -1)].map(m => m - 24);
      bass.forEach((m, i) => tone(bus, { type: 'triangle', f: mtof(m), t: t0 + i * beat, a: 0.01, d: beat * 0.95, peak: 0.55, filter: { f: 700 } }));
      // batería con escobillas: ride en swing, charles en 2 y 4, bombo suave en 1
      for (const i of [0, 2, 3, 4, 6, 7]) noise(bus, { t: sw(i), d: 0.12, f: 7000, q: 0.7, peak: i % 2 ? 0.05 : 0.08, type: 'highpass' });
      [1, 3].forEach(b => noise(bus, { t: t0 + b * beat, d: 0.18, f: 2500, q: 0.6, peak: 0.07 }));
      tone(bus, { type: 'sine', f: 70, f2: 40, t: t0, d: 0.18, peak: 0.35 });
      // piano eléctrico: acordes en el "y" del 2 y en el 4 (charleston)
      for (const at of [sw(3), t0 + 3 * beat]) iv.forEach((s, k) => {
        tone(bus, { type: 'sine', f: mtof(root + 12 + s), t: at, a: 0.01, d: 0.5, len: 0.25, sus: 0.05, peak: 0.07, detune: k * 3 });
        tone(bus, { type: 'triangle', f: mtof(root + 24 + s), t: at, a: 0.005, d: 0.25, peak: 0.02 });
      });
      // de vez en cuando, un adorno de vibráfono
      if (bar % 4 === 3) [0, 1, 2, 3].forEach(i => tone(bus, { type: 'sine', f: mtof(root + 24 + iv[i % 4]), t: sw(4 + i), d: 0.6, peak: 0.05 }));
      bar++; nextBar += 4 * beat;
    }
  };
  schedule();
  const iv = setInterval(schedule, 250);
  return { stop: (fade = 0.6) => { stopped = true; clearInterval(iv); bus.gain.setTargetAtTime(0, now(), fade / 3); setTimeout(() => bus.disconnect(), fade * 1000 + 1500); } };
}

function fanfare() {
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(musicIn || musicBus);
  const t = now() + 0.05, brass = (m, at, len, p = 0.18) => [0, 7].forEach(dt => tone(bus, { type: 'sawtooth', f: mtof(m), t: at, a: 0.03, d: 0.15, len, sus: p * 0.7, peak: p, rel: 0.3, detune: dt, filter: { f: 2200 } }));
  [[60, 0, 0.18], [64, 0.2, 0.18], [67, 0.4, 0.18], [72, 0.6, 0.5], [67, 1.15, 0.15], [72, 1.35, 1.4]].forEach(([m, at, len]) => brass(m, t + at, len));
  [48, 55, 64].forEach(m => brass(m, t + 1.35, 1.4, 0.1));
  noise(bus, { t: t + 1.35, d: 1.8, f: 6000, q: 0.5, peak: 0.25, type: 'highpass' }); // platillo
  return { stop: () => bus.gain.setTargetAtTime(0, now(), 0.1) };
}

// name: 'mesa' | 'victoria' | null (silencio)
export function startMusic(name, force = false) {
  if (name === wantMusic && !force && current) return;
  wantMusic = name;
  if (!ctx) return; // sonará al desbloquear el audio
  current?.stop(); current = null;
  if (!name) return;
  if (name.startsWith('win:')) return winSong(name, name.slice(4));
  const fileKey = { mesa: 'musica', victoria: 'victoria', fiesta: 'fiesta' }[name];
  if (name === 'victoria') {
    if (files.victoria) current = playFile('victoria', musicBus);
    else current = fanfare();
    const mine = current;
    setTimeout(() => { if (current === mine && wantMusic === 'victoria') { wantMusic = 'fiesta'; current = files.fiesta ? playFile('fiesta', musicBus, true) : startSong('fiesta'); } },
      files.victoria ? files.victoria.duration * 1000 : 3200);
    return;
  }
  current = files[fileKey] ? playFile(fileKey, musicBus, true) : startSong(name);
}

// Canción de victoria propia de un personaje ('win:Audio/x.mp3', ver winSong en config.js).
// Se descarga la primera vez que hace falta; mientras llega suena la fanfarria normal.
// Si el archivo no carga, se queda la victoria de siempre.
const loading = {};
function winSong(key, url) {
  const play = () => {
    if (wantMusic !== key) return; // ya se pasó a otra música
    current?.stop(0.2);
    current = playFile(key, musicBus, true, 0.6); // la canción viene muy alta: un poco más baja
  };
  if (files[key]) return play();
  current = fanfare();
  loading[key] ||= fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
    .then(b => ctx.decodeAudioData(b)).then(buf => { files[key] = buf; });
  loading[key].then(play).catch(e => {
    console.warn('[audio] no cargó', url, e); delete loading[key];
    if (wantMusic === key) { current?.stop(); current = null; wantMusic = null; startMusic('victoria'); }
  });
}

// (para pruebas) Renderiza un efecto o un trozo de música sin tiempo real y mide su volumen.
export async function _audioProbe(kind, name, secs = 2, full = false) {
  const saved = [ctx, master, musicBus, sfxBus, noiseBuf];
  const off = new OfflineAudioContext(1, Math.ceil(44100 * secs), 44100);
  const savedIn = musicIn, savedLook = LOOK;
  ctx = off; master = off.destination; musicBus = off.createGain(); sfxBus = off.createGain(); musicIn = null;
  musicBus.connect(master); sfxBus.connect(master);
  if (full) { // tal cual sonaría en el juego: con la sala y la canción entera programada
    LOOK = secs + 1; musicBus.gain.value = 0.32 * 0.9;
    musicIn = off.createGain(); const wet = off.createGain(); wet.gain.value = 0.32;
    const room = off.createConvolver(); room.buffer = makeRoom(2.6);
    musicIn.connect(musicBus); musicIn.connect(room); room.connect(wet); wet.connect(musicBus);
  }
  noiseBuf = off.createBuffer(1, 44100, 44100); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  let song = null;
  try {
    if (kind === 'sfx') SFX[name]();
    else if (name === 'victoria') fanfare(); else song = startSong(name);
  } finally { [ctx, master, musicBus, sfxBus, noiseBuf] = saved; musicIn = savedIn; LOOK = savedLook; }
  const out = (await off.startRendering()).getChannelData(0);
  if (song) { const real = ctx; ctx = off; song.stop(0.01); ctx = real; }
  let s = 0, pk = 0; for (const v of out) { s += v * v; pk = Math.max(pk, Math.abs(v)); }
  return { rms: Math.sqrt(s / out.length), peak: pk, data: full ? Array.from(out) : undefined };
}
export const _sfxNames = () => Object.keys(SFX);
