// ================= UI: menús, salas, HUD de partida =================
// Todo el DOM. Lee G (estado o vista, siempre con TU asiento = 0) y manda tus jugadas
// con act() de session.js, que se encarga de si eres anfitrión, invitado o juegas solo.

import { WANTED_OPTS, ROSTER, CATEGORIES, SERIES_LOGO, logoOf, css, shuffle, NUM_ROOMS } from './config.js';
import { logoEl } from './icons.js';
import { G, setView, canAct, canNope, stagedTarget, threat, isCat, countIn, bombsLeft, nameOf } from './game.js';
import { S, bindUI, act, startSolo, createRoom, joinAsGuest, startRoomGame, rematch, backToLobby, leave,
  setRoomPublic, sendPreset, setAIPicker } from './session.js';
import { probeRooms, netAvailable, netMode } from './net.js';
import { layoutHands, layoutDeck, updateThreat, setCamMode, camMode, rebuildPlayers, previewVictory,
  explodePlayer, resetAvatars, tableGesture, setPickHandlers } from './world.js';
import { cardURL } from './art.js';
import { fxPlay, fxNope, fxResolve, fxDraw, fxTransfer, fxDefuse, fxReinsert, fxFuture, fxKitten } from './cardfx.js';
import { unlockAudio, sfx, startMusic, setMusic, setSfx, musicOn, sfxOn } from './audio.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const presetByName = n => ROSTER.find(p => p.name === n) || ROSTER[0];
const load = k => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// Estado de la interfaz (solo de esta pantalla)
export const UI = { selected: -1, target: -1, wanted: 'Defuse', bombPos: 0, logOpen: !matchMedia('(max-width: 860px)').matches };
const me = { name: load('ek-name') || '', preset: load('ek-preset') || 'Gojo' };

// ================= Cartas: textos =================
const CARD_ES = { 'Attack': 'Ataque', 'Skip': 'Saltar', 'Favor': 'Favor', 'Shuffle': 'Barajar', 'See Future': 'Ver el futuro',
  'Nope': 'Nope', 'Defuse': 'Desactivar', 'Exploding Kitten': 'Bomba', 'X': '?' };
const cardName = c => CARD_ES[c] || c;
const KIND_ES = { Attack: 'Ataque', Skip: 'Saltar', Shuffle: 'Barajar', SeeFuture: 'Ver el futuro', Favor: 'Favor', Pair: 'Pareja', Triple: 'Trío' };
const HELP = {
  'Attack': 'Terminas tu turno sin robar y el siguiente jugador tiene que jugar 2 turnos.',
  'Skip': 'Terminas tu turno sin robar carta.',
  'Favor': 'Eliges a un rival y él decide qué carta te da.',
  'Shuffle': 'Barajas el mazo: útil si sabes que arriba hay una bomba.',
  'See Future': 'Miras en secreto las 3 cartas de arriba del mazo.',
  'Nope': 'Cancela la jugada de otro. Se usa cuando alguien juega una carta (aunque no sea tu turno).',
  'Defuse': 'Se usa sola si robas una bomba: la desactivas y la vuelves a esconder en el mazo.',
};
const catHelp = c => {
  const n = G ? countIn(0, c) : 0;
  if (n >= 3) return `Tienes ${n}: con 3 iguales pides la carta que quieras a un rival (o juega 2 como pareja).`;
  if (n === 2) return 'Tienes 2 iguales: juégalos como pareja para robarle una carta al azar a un rival.';
  return 'Un gato solo no hace nada: junta 2 iguales (pareja) o 3 (trío).';
};
const ORDER = ['Defuse', 'Nope', 'Attack', 'Skip', 'Favor', 'Shuffle', 'See Future', 'Taco Cat', 'Melon Cat', 'Hairy Cat', 'Beardy Cat', 'Rainbow Cat'];
const rank = c => { const i = ORDER.indexOf(c); return i < 0 ? 99 : i; };

// ================= Iconos (SVG en línea) =================
const ICON = {
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  camera: '<path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  log: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  cards: '<rect x="3" y="6" width="12" height="16" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v14"/>',
  bomb: '<circle cx="11" cy="14" r="7"/><path d="M15 8l2-2M18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  crown: '<path d="M3 18h18l-2-11-5 5-2-7-2 7-5-5z"/>',
  skull: '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.6 5 3 6v3h10v-3c1.4-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.6"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

// ================= Pantallas =================
const SCREENS = ['menu', 'rooms', 'lobby', 'picker', 'hud'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  if (id !== 'hud') { $('gameover').classList.add('hidden'); closeModals(); }
}
let pickerReturn = 'menu';

// ---------- Elegir personaje ----------
function initials(p) {
  const d = el('div', 'logo initials'); d.style.background = css(p.suit);
  d.textContent = p.name.replace(/\(.*?\)/g, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return d;
}
const charLogo = (p, cls = 'logo') => logoEl(logoOf(p), cls, () => initials(p));
let pickerChoice = null;
function openPicker(from) {
  pickerReturn = from; pickerChoice = me.preset;
  renderRoster();
  show('picker');
}
function charCard(p) {
  const d = el('div', 'char' + (p.name === pickerChoice ? ' sel' : ''));
  d.append(charLogo(p), el('div', 'cn', p.name));
  d.onclick = () => {
    pickerChoice = p.name;
    document.querySelectorAll('#roster .char.sel').forEach(x => x.classList.remove('sel'));
    d.classList.add('sel'); updatePicked();
  };
  d.ondblclick = () => { pickerChoice = p.name; confirmPicker(); };
  return d;
}
function group(title, count, cls, open, logo) {
  const det = el('details', cls); det.open = open;
  const sum = el('summary');
  if (logo) sum.appendChild(logoEl(logo, 'ico'));
  sum.append(el('span', '', title), el('span', 'cnt', count));
  det.appendChild(sum); return det;
}
function grid(list) {
  const g = el('div', 'grid');
  list.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(p => g.appendChild(charCard(p)));
  return g;
}
function updatePicked() {
  const p = presetByName(pickerChoice), e = $('picked'); e.textContent = '';
  e.append(logoEl(logoOf(p), 'ico'), ` ${p.name}` + (p.serie ? ` · ${p.serie}` : ''));
}
function renderRoster() {
  const r = $('roster'); r.innerHTML = '';
  const cur = presetByName(pickerChoice);
  CATEGORIES.forEach(cat => {
    const inCat = ROSTER.filter(p => p.cat === cat); if (!inCat.length) return;
    const box = group(cat, inCat.length, 'cat', cur.cat === cat);
    const loose = inCat.filter(p => !p.serie); if (loose.length) box.appendChild(grid(loose));
    [...new Set(inCat.filter(p => p.serie).map(p => p.serie))].sort((a, b) => a.localeCompare(b, 'es')).forEach(serie => {
      const sb = group(serie, inCat.filter(p => p.serie === serie).length, 'serie', cur.serie === serie, SERIES_LOGO[serie]);
      sb.appendChild(grid(inCat.filter(p => p.serie === serie))); box.appendChild(sb);
    });
    r.appendChild(box);
  });
  updatePicked();
}
function confirmPicker() {
  me.preset = pickerChoice; save('ek-preset', me.preset);
  if (pickerReturn === 'lobby') {
    if (S.mode === 'host') { S.lobby.seats[0].preset = me.preset; setRoomPublic(S.lobby.isPublic); }
    else sendPreset(me.preset);
  }
  renderMe(); show(pickerReturn);
}
function renderMe() {
  const p = presetByName(me.preset), box = $('me-char'); box.innerHTML = '';
  box.append(charLogo(p, 'logo'), el('div', 'me-char-txt'));
  box.lastChild.append(el('b', '', p.name), el('span', 'muted', p.serie || p.cat));
}

// ---------- Menú principal ----------
function myName() {
  const v = $('in-name').value.trim().slice(0, 16);
  me.name = v || 'Jugador'; save('ek-name', v);
  return me.name;
}

// ---------- Salas ----------
async function refreshRooms() {
  const list = $('room-list');
  if (!netAvailable()) {
    list.innerHTML = '<p class="warn">Sin conexión.</p>';
    return;
  }
  list.innerHTML = '';
  const rows = [];
  for (let n = 1; n <= NUM_ROOMS; n++) {
    const row = el('div', 'room'); row.innerHTML = `<div class="room-n">Sala ${n}</div><div class="room-st muted">Buscando…</div><div class="room-btns"></div>`;
    list.appendChild(row); rows.push(row);
  }
  $('btn-rooms-refresh').disabled = true;
  const res = await probeRooms().catch(() => []);
  $('btn-rooms-refresh').disabled = false;
  if (res.length && res.every(r => r.state === 'error')) {
    list.innerHTML = '<p class="warn">Sin conexión. Pulsa Actualizar.</p>';
    return;
  }
  res.forEach(({ n, info, state }) => {
    const row = rows[n - 1], st = row.querySelector('.room-st'), btns = row.querySelector('.room-btns');
    btns.innerHTML = ''; st.className = 'room-st';
    if (!info) {
      st.innerHTML = '<span class="dot free"></span>Libre'; st.classList.add('muted');
      const a = el('button', 'sm', 'Crear pública'), b = el('button', 'sm', 'Crear privada');
      a.onclick = () => doCreate(n, true); b.onclick = () => doCreate(n, false);
      btns.append(a, b);
    } else {
      const full = info.players >= 4;
      st.innerHTML = info.started || full ? '<span class="dot busy"></span>Ocupada'
        : `<span class="dot open"></span>${info.isPublic ? '' : icon('lock', 'tiny') + ' '}${escapeHtml(info.host || '?')} · ${info.players}/4`;
      const j = el('button', 'sm primary', 'Unirse');
      j.disabled = info.started || full;
      j.onclick = () => info.isPublic ? doJoin(n, '') : askCode(n);
      btns.append(j);
    }
  });
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function askCode(n) {
  $('code-box').classList.remove('hidden'); $('code-room').textContent = `Sala ${n}`;
  $('in-code').value = ''; $('in-code').focus();
  $('btn-code-ok').onclick = () => { $('code-box').classList.add('hidden'); doJoin(n, $('in-code').value.trim()); };
}
function busy(msg) { $('busy').classList.toggle('hidden', !msg); $('busy-txt').textContent = msg || ''; }
async function doCreate(n, isPublic) {
  busy('Creando sala…');
  try { await createRoom(n, { name: myName(), preset: me.preset }, isPublic); busy(''); show('lobby'); renderLobby(); }
  catch (why) { busy(''); notice(why === 'ocupada' ? 'Sala ocupada.' : 'Sin conexión.'); refreshRooms(); }
}
async function doJoin(n, code) {
  busy('Entrando…');
  try { await joinAsGuest(n, { name: myName(), preset: me.preset }, code); busy(''); show('lobby'); renderLobby(); }
  catch (why) {
    busy('');
    const msg = { libre: 'La sala ya no existe.', 'sin-respuesta': 'No responde.', 'sin-red': 'Sin conexión.' }[why];
    notice(msg || String(why)); refreshRooms();
  }
}
function notice(msg) { $('notice-txt').textContent = msg; $('notice').classList.remove('hidden'); }

// ---------- Sala de espera ----------
function renderLobby() {
  const L = S.lobby; if (!L) return;
  if (L.started && S.mode === 'client') return; // la partida va a empezar
  const host = S.mode === 'host';
  $('lobby-title').textContent = L.name;
  $('lobby-sub').innerHTML = L.isPublic ? `${icon('users', 'tiny')} Pública`
    : `${icon('lock', 'tiny')} Privada${host ? ` · Código <b class="code">${L.code}</b>` : ''}`;
  const seats = $('lobby-seats'); seats.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const s = L.seats[i], row = el('div', 'seat' + (s ? '' : ' empty'));
    if (s) {
      const p = presetByName(s.preset);
      row.append(charLogo(p, 'logo'));
      const t = el('div', 'seat-txt'); t.append(el('b', '', s.name + (S.seat === i ? ' (tú)' : '')), el('span', 'muted', p.name));
      row.append(t);
      if (s.host) row.append(el('span', 'tag', 'Anfitrión'));
    } else {
      row.innerHTML = `${icon('bot', 'seat-ic')}<div class="seat-txt"><b>Libre</b><span class="muted">IA</span></div>`;
    }
    seats.appendChild(row);
  }
  $('lobby-host').classList.toggle('hidden', !host);
  $('btn-lobby-start').classList.toggle('hidden', !host);
  $('lobby-wait').classList.toggle('hidden', host);
  if (host) $('lobby-public').checked = L.isPublic;
}

// ================= HUD de partida =================
let lastSig = '', lastTurnMine = false, timerTotal = 0, lastDeadline = 0, lastTick = 0;

function statusInfo() {
  if (!G) return { text: '', cls: '' };
  if (G.over) return { text: G.winner === 0 ? '¡Has ganado!' : `Gana ${nameOf(G.winner)}`, cls: 'win' };
  const s = G.staged;
  if (s) {
    const t = stagedTarget(), who = s.actor === 0 ? 'Juegas' : `${nameOf(s.actor)} juega`;
    let text = `${who} ${KIND_ES[s.kind]}${t >= 0 ? (t === 0 ? ' contra ti' : ` contra ${nameOf(t)}`) : ''}`;
    if (s.nopes % 2) text += ' — cancelada con Nope';
    if (canNope(0) && (G.waiting || []).includes(0)) text += '. ¿Respondes con NOPE?';
    else if ((G.waiting || []).length) text += '. Esperando respuestas…';
    return { text, cls: t === 0 && !(s.nopes % 2) ? 'danger' : 'warn' };
  }
  const P = G.pending;
  if (P?.type === 'favor') return P.from === 0 ? { text: `${nameOf(P.to)} te pide un favor: elige qué carta le das`, cls: 'danger' }
    : { text: `${nameOf(P.from)} elige qué carta darle a ${nameOf(P.to)}`, cls: '' };
  if (P?.type === 'bomb') return P.from === 0 ? { text: 'Has desactivado la bomba: elige dónde esconderla', cls: 'warn' }
    : { text: `${nameOf(P.from)} esconde la bomba en el mazo…`, cls: '' };
  if (G.turn === 0 && G.alive[0]) return { text: `Tu turno${G.turnsRem > 1 ? ` (te quedan ${G.turnsRem})` : ''}: juega cartas o roba para terminar`, cls: 'mine' };
  if (!G.alive[0]) return { text: `Has explotado. Turno de ${nameOf(G.turn)}`, cls: '' };
  return { text: `Turno de ${nameOf(G.turn)}${G.turnsRem > 1 ? ` (${G.turnsRem} turnos)` : ''}`, cls: '' };
}

function defaultTarget() {
  const t = UI.target;
  if (t > 0 && G.alive[t]) return t;
  for (const p of [1, 2, 3]) if (G.alive[p] && G.hands[p].length) return p;
  return [1, 2, 3].find(p => G.alive[p]) ?? -1;
}

function renderPlayers() {
  const box = $('players'); box.innerHTML = '';
  const th = threat();
  for (const p of [1, 2, 3, 0]) {
    const pre = presetByName(G.presets?.[p]);
    const card = el('div', 'pc');
    if (p === 0) card.classList.add('me');
    if (G.turn === p && !G.over) card.classList.add('turn');
    if (!G.alive[p]) card.classList.add('dead');
    if (p !== 0 && p === shownTarget()) card.classList.add('target');
    if (th && th.to === p) card.classList.add('threat');
    if (G.over && G.winner === p) card.classList.add('winner');
    card.append(charLogo(pre, 'logo'));
    const txt = el('div', 'pc-txt');
    txt.append(el('div', 'pc-name', p === 0 ? `${nameOf(0)} (tú)` : nameOf(p)), el('div', 'pc-char', pre.name));
    const meta = el('div', 'pc-meta');
    if (!G.alive[p]) meta.innerHTML = `${icon('skull', 'tiny')} Eliminado`;
    else {
      meta.innerHTML = `${icon('cards', 'tiny')} ${G.hands[p].length}`;
      if (G.turn === p && G.turnsRem > 1) meta.innerHTML += ' <span class="chip red">2 turnos</span>';
      if (G.ctrl?.[p] === 'ai' && p !== 0) meta.innerHTML += ' <span class="chip">IA</span>';
      if ((G.waiting || []).includes(p) && p !== 0) meta.innerHTML += ' <span class="chip yellow">pensando</span>';
    }
    txt.append(meta); card.append(txt);
    if (p !== 0 && G.alive[p]) {
      card.title = 'Toca para elegir a este jugador como objetivo';
      card.onclick = () => pickTarget(p);
    }
    box.appendChild(card);
  }
}

// Objetivo que se ve marcado: el elegido, o el que se usaría con la carta seleccionada
function shownTarget() {
  const sel = G.hands[0][UI.selected];
  if (sel && (sel === 'Favor' || isCat(sel))) return defaultTarget();
  return UI.target > 0 && G.alive[UI.target] ? UI.target : -1;
}

function renderTableInfo() {
  const n = G.deck.length, b = bombsLeft();
  const risk = n ? Math.round(100 * b / n) : 0;
  $('ti-deck').textContent = n;
  $('ti-bombs').textContent = b;
  $('ti-risk').textContent = `${risk}%`;
  $('ti-risk-bar').style.width = `${Math.min(100, risk * 2)}%`;
  $('ti-risk-bar').className = risk >= 25 ? 'hi' : risk >= 12 ? 'mid' : '';
  $('mini-info').textContent = `Mazo ${n} · ${b} ${b === 1 ? 'bomba' : 'bombas'} · riesgo ${risk}%`;
  const top = G.discard[G.discard.length - 1], d = $('ti-discard');
  d.innerHTML = top ? `<img src="${cardURL(top)}" alt=""><span>${cardName(top)}</span>` : '<span class="muted">vacío</span>';
}

function playableNow(c) {
  if (!canAct(0)) return false;
  if (c === 'Nope' || c === 'Defuse') return false;
  if (isCat(c)) return countIn(0, c) >= 2 && defaultTarget() >= 0;
  if (c === 'Favor') return [1, 2, 3].some(p => G.alive[p] && G.hands[p].length);
  return true;
}

function renderHand() {
  const hb = $('hand'); hb.innerHTML = '';
  const giving = G.pending?.type === 'favor' && G.pending.from === 0;
  G.hands[0].forEach((c, i) => {
    const d = el('button', 'card');
    if (i === UI.selected) d.classList.add('sel');
    if (!giving && G.turn === 0 && !playableNow(c) && !(c === 'Nope' && canNope(0))) d.classList.add('dim');
    if (c === 'Nope' && canNope(0)) d.classList.add('glow');
    d.innerHTML = `<img src="${cardURL(c)}" alt=""><span class="cn">${cardName(c)}</span>`;
    if (isCat(c)) { const k = countIn(0, c); if (k >= 2) d.insertAdjacentHTML('beforeend', `<span class="badge">×${k}</span>`); }
    d.onclick = () => onCardTap(i);
    hb.appendChild(d);
  });
  if (!G.hands[0].length) hb.innerHTML = `<div class="muted empty-hand">${G.alive[0] ? 'Sin cartas' : 'Has explotado: mira cómo termina la partida'}</div>`;
}

function renderActions() {
  const a = $('actions'); a.innerHTML = '';
  const add = (label, cls, fn, key) => { const b = el('button', cls); b.innerHTML = label + (key ? ` <kbd>${key}</kbd>` : ''); b.onclick = () => { sfx('ui'); fn(); }; a.appendChild(b); return b; };
  const sel = G.hands[0][UI.selected];
  const info = $('card-info');
  if (G.over) { info.textContent = ''; return; }
  if (G.staged) {
    if (canNope(0) && (G.waiting || []).includes(0)) {
      add('NOPE', 'nope big', () => act('nope'), 'N');
      add('Dejar pasar', '', () => act('pass'), 'Enter');
      info.textContent = 'Tienes NOPE: cancela la jugada o déjala pasar.';
    } else if (canNope(0)) {
      add('NOPE', 'nope', () => act('nope'), 'N');
      info.textContent = 'Puedes responder con NOPE.';
    } else info.textContent = '';
    return;
  }
  if (G.pending?.type === 'favor' && G.pending.from === 0) {
    const b = add(sel ? `Dar ${cardName(sel)}` : 'Elige una carta', 'primary big', () => { if (sel) { UI.selected = -1; UI.selType = null; act('give', { card: sel }); } });
    b.disabled = !sel;
    info.textContent = `Toca la carta que le das a ${nameOf(G.pending.to)}.`;
    return;
  }
  if (canAct(0)) {
    if (sel) {
      const can = playableNow(sel);
      const needT = sel === 'Favor' || isCat(sel);
      const t = defaultTarget();
      let label = `Jugar ${cardName(sel)}`;
      if (needT && t >= 0) label += ` → ${nameOf(t)}`;
      const b = add(label, 'primary', playSelected, 'Espacio');
      b.disabled = !can;
      info.textContent = (isCat(sel) ? catHelp(sel) : HELP[sel] || '') + (needT && can ? ' Toca un rival para cambiar el objetivo.' : '');
    } else info.textContent = 'Elige una carta para jugarla, o roba para terminar tu turno.';
    add('Robar carta', sel ? '' : 'primary', () => act('draw'), 'R');
    return;
  }
  info.textContent = sel ? (isCat(sel) ? catHelp(sel) : HELP[sel] || '') : '';
}

function renderTimer() {
  const bar = $('status-timer');
  if (!G?.deadline) { bar.classList.add('hidden'); return; }
  if (G.deadline !== lastDeadline) { lastDeadline = G.deadline; timerTotal = Math.max(1000, G.deadline - Date.now()); }
  const left = G.deadline - Date.now();
  bar.classList.remove('hidden');
  bar.firstElementChild.style.width = `${Math.max(0, Math.min(100, 100 * left / timerTotal))}%`;
  bar.dataset.s = Math.max(0, Math.ceil(left / 1000));
  const mineToAnswer = (G.turn === 0 && !G.staged && !G.pending) || (G.staged && (G.waiting || []).includes(0)) || (G.pending && G.pending.from === 0);
  const s = Math.ceil(left / 1000);
  if (mineToAnswer && s <= 5 && s > 0 && s !== lastTick) { lastTick = s; sfx('tick'); }
}
setInterval(() => { if (G && !$('hud').classList.contains('hidden')) renderTimer(); }, 200);

export function refresh() {
  if (!G) return;
  G.hands[0].sort((a, b) => rank(a) - rank(b));
  const sig = G.hands[0].join('|');
  if (sig !== lastSig) { // tu mano cambió: se mantiene la carta elegida si aún la tienes
    lastSig = sig;
    UI.selected = UI.selType ? G.hands[0].indexOf(UI.selType) : -1;
    if (UI.selected < 0) UI.selType = null;
  }
  if (UI.target > 0 && !G.alive[UI.target]) UI.target = -1;
  layoutHands(); layoutDeck(); updateThreat();
  const st = statusInfo();
  const sEl = $('status');
  if ($('status-text').textContent !== st.text) { $('status-text').textContent = st.text; sEl.classList.remove('pop'); void sEl.offsetWidth; sEl.classList.add('pop'); }
  sEl.className = sEl.className.replace(/\b(mine|danger|warn|win)\b/g, '').trim() + (st.cls ? ' ' + st.cls : '');
  renderPlayers(); renderTableInfo(); renderHand(); renderActions(); renderTimer();
  $('room-tag').innerHTML = S.mode === 'solo' ? 'Contra la IA' : `${S.lobby?.name || 'Sala'} · ${S.lobby?.isPublic ? 'pública' : 'privada'}`;
  // modales que dependen del estado
  const bombMine = G.pending?.type === 'bomb' && G.pending.from === 0;
  $('bomb-popup').classList.toggle('hidden', !bombMine);
  if (bombMine) updBomb();
  const myTurn = canAct(0);
  if (myTurn && !lastTurnMine) { sfx('turn'); toast('Es tu turno', 'mine'); }
  lastTurnMine = myTurn;
}

function onCardTap(i) {
  const c = G.hands[0][i];
  if (c === 'Nope' && canNope(0)) { act('nope'); return; }
  if (UI.selected === i && canAct(0) && playableNow(c)) { playSelected(); return; }
  UI.selected = UI.selected === i ? -1 : i;
  UI.selType = UI.selected >= 0 ? c : null;
  sfx('ui'); refresh();
}
function pickTarget(p) {
  if (!G || p === 0 || !G.alive[p]) return;
  UI.target = p; sfx('ui');
  const c = G.hands[0][UI.selected];
  // con una carta que necesita objetivo ya elegida, tocar al rival la lanza
  if (c && canAct(0) && (c === 'Favor' || (isCat(c) && countIn(0, c) === 2))) { playSelected(); return; }
  refresh();
}

function playSelected() {
  if (!canAct(0)) return;
  const c = G.hands[0][UI.selected]; if (!c || !playableNow(c)) return;
  const t = defaultTarget();
  if (isCat(c) && countIn(0, c) >= 3) return openTrio(c);
  UI.selected = -1; UI.selType = null;
  act('play', { card: c, target: (c === 'Favor' || isCat(c)) ? t : undefined, asPair: isCat(c) });
}

// ---------- Ventanas ----------
function closeModals() { ['trio-menu', 'future-popup', 'menu-pop', 'help'].forEach(id => $(id).classList.add('hidden')); }
function openTrio(cat) {
  UI.trioCat = cat;
  $('trio-title').textContent = `Tienes 3 × ${cat}`;
  const render = () => {
    const w = $('trio-wants'); w.innerHTML = '';
    WANTED_OPTS.forEach(o => { const b = el('button', 'sm' + (o === UI.wanted ? ' active' : ''), cardName(o)); b.onclick = () => { UI.wanted = o; render(); }; w.appendChild(b); });
    const t = $('trio-targets'); t.innerHTML = '';
    [1, 2, 3].filter(p => G.alive[p]).forEach(p => { const b = el('button', 'sm' + (p === defaultTarget() ? ' active' : ''), `${nameOf(p)} (${G.hands[p].length})`); b.onclick = () => { UI.target = p; render(); }; t.appendChild(b); });
  };
  render();
  $('trio-menu').classList.remove('hidden');
}
function updBomb() {
  const n = G.deck.length; UI.bombPos = Math.max(0, Math.min(n, UI.bombPos));
  const where = UI.bombPos === 0 ? 'arriba del todo (la roba el siguiente)' : UI.bombPos >= n ? 'abajo del todo' : `${UI.bombPos} cartas por debajo de la de arriba`;
  $('bomb-pos').textContent = `Posición ${UI.bombPos}: ${where}`;
  $('bomb-range').max = n; $('bomb-range').value = UI.bombPos;
}

// ---------- Historial y avisos ----------
function addLog(msg) {
  const d = el('div', 'entry');
  const myName = G?.names?.[0];
  d.textContent = msg;
  if (myName && msg.includes(myName)) d.classList.add('me');
  if (/EXPLOTA|GANA/.test(msg)) d.classList.add('big');
  const L = $('log'); L.prepend(d);
  while (L.children.length > 80) L.lastChild.remove();
}
let toastT = null;
function toast(msg, cls = '') {
  const t = $('toast'); t.textContent = msg; t.className = 'show ' + cls;
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 2600);
}

// ================= Eventos de la partida → 3D, sonido y avisos =================
function onEvent(e) {
  switch (e.t) {
    case 'reset': {
      UI.selected = -1; UI.selType = null; UI.target = -1; lastSig = ''; wasOver = false; $('log').innerHTML = '';
      $('gameover').classList.add('hidden'); closeModals();
      rebuildPlayers(G.presets.map(presetByName), G.names.slice());
      resetAvatars(); show('hud'); startMusic('mesa'); sfx('shuffle');
      break;
    }
    case 'log': addLog(e.msg); break;
    case 'play':
      fxPlay(e.actor, e.cards, e.target); sfx('card');
      if (e.kind === 'Attack') setTimeout(() => sfx('attack'), 120);
      if (e.target === 0 && e.actor !== 0) toast(`${nameOf(e.actor)} te juega ${KIND_ES[e.kind]}`, 'danger');
      break;
    case 'gesture': tableGesture(e.actor, e.target); break;
    case 'nope': fxNope(e.p, e.cancelled); setTimeout(() => sfx('nope'), 450); break;
    case 'resolve':
      fxResolve(e.cancelled, e.kind, e.actor, e.target);
      if (e.cancelled) sfx('fizzle');
      else sfx({ Attack: 'punch', Skip: 'skip', Shuffle: 'shuffle', SeeFuture: 'future', Favor: 'favor', Pair: 'cat', Triple: 'cat' }[e.kind]);
      if (!e.cancelled && e.kind === 'Attack' && e.target === 0) toast('Te atacan: juegas 2 turnos', 'danger');
      break;
    case 'draw': fxDraw(e.p, e.card); sfx('draw'); break;
    case 'transfer':
      fxTransfer(e.from, e.to, e.card, e.delay || 0);
      setTimeout(() => sfx('steal'), (e.delay || 0) * 1000);
      if (e.to === 0 && e.card !== 'X') setTimeout(() => toast(`Recibes: ${cardName(e.card)}`, 'mine'), (e.delay || 0) * 1000 + 600);
      if (e.from === 0 && e.card !== 'X') toast(`Pierdes: ${cardName(e.card)}`, 'danger');
      break;
    case 'future': fxFuture(e.actor); break;
    case 'seeFuture': showFuture(e.cards); break;
    case 'defuse': fxDefuse(e.p, e.reinsertNow); sfx('kitten'); setTimeout(() => sfx('defuse'), 1300); break;
    case 'bombAsk': UI.bombPos = 0; break;
    case 'reinsert': fxReinsert(); break;
    case 'kitten':
      sfx('kitten');
      fxKitten(e.p, e.hand, () => { explodePlayer(e.p); sfx('boom'); if (e.p === 0) setTimeout(() => sfx('sad'), 900); });
      break;
  }
}
function showFuture(cards) {
  const box = $('future-cards'); box.innerHTML = '';
  if (!cards.length) box.innerHTML = '<span class="muted">El mazo está vacío.</span>';
  cards.forEach((c, i) => { const d = el('div', 'fcard'); d.innerHTML = `<img src="${cardURL(c)}" alt=""><span>${i === 0 ? 'Arriba' : i === 1 ? '2ª' : '3ª'}: ${cardName(c)}</span>`; box.appendChild(d); });
  $('future-popup').classList.remove('hidden');
}
let wasOver = false;
function onState() {
  if (!G) return;
  refresh();
  if (G.over && !wasOver) {
    const p = presetByName(G.presets[G.winner]);
    const box = $('go-who'); box.innerHTML = '';
    box.append(charLogo(p, 'logo'), el('div', 'go-txt'));
    box.lastChild.append(el('b', '', G.winner === 0 ? '¡Has ganado!' : `Gana ${nameOf(G.winner)}`), el('span', 'muted', p.name));
    const host = S.mode !== 'client';
    $('btn-go-again').classList.toggle('hidden', !host);
    $('btn-go-lobby').classList.toggle('hidden', S.mode !== 'host');
    $('go-wait').classList.toggle('hidden', host);
    setTimeout(() => { if (G?.over) $('gameover').classList.remove('hidden'); }, 2500);
    startMusic(p?.winSong ? 'win:' + p.winSong : 'victoria'); // algunos personajes traen su propia canción
    if (G.winner !== 0) setTimeout(() => sfx('sad'), 300);
  }
  if (!G.over && wasOver) $('gameover').classList.add('hidden');
  wasOver = !!G.over;
}

// ================= Cableado =================
export function wireUI() {
  setAIPicker(used => { // personajes de la IA: al azar, sin repetir los de la mesa
    const pool = shuffle(ROSTER.filter(p => !used.has(p.name)));
    return (pool[0] || ROSTER[0]).name;
  });
  bindUI({
    onEvent, onState,
    onLobby: () => {
      if (S.mode === 'client' && S.lobby && !S.lobby.started && !$('hud').classList.contains('hidden')) show('lobby');
      if (!$('lobby').classList.contains('hidden') || S.mode === 'host') renderLobby();
    },
    onClosed: msg => { show('menu'); notice(msg); startMusic('mesa'); },
  });
  setPickHandlers({
    deck: () => { if (canAct(0)) act('draw'); },
    card: i => onCardTap(i),
    avatar: p => pickTarget(p),
  });
  // primer toque: desbloquea el audio (el navegador no deja sonar nada antes)
  addEventListener('pointerdown', () => { unlockAudio(); }, { once: true });
  startMusic('mesa');

  // menú
  $('in-name').value = me.name;
  renderMe();
  $('btn-pick').onclick = () => openPicker('menu');
  $('btn-solo').onclick = () => { unlockAudio(); startSolo({ name: myName(), preset: me.preset }); };
  $('btn-online').onclick = () => { unlockAudio(); myName(); show('rooms'); refreshRooms(); };
  $('net-note').textContent = netMode() === 'local' ? 'Modo de prueba: salas solo entre pestañas de este navegador.' : '';
  // salas
  $('btn-rooms-back').onclick = () => show('menu');
  $('btn-rooms-refresh').onclick = refreshRooms;
  $('btn-code-cancel').onclick = () => $('code-box').classList.add('hidden');
  $('in-code').onkeydown = e => { if (e.key === 'Enter') $('btn-code-ok').click(); };
  // sala de espera
  $('btn-lobby-start').onclick = () => startRoomGame();
  $('btn-lobby-leave').onclick = () => { leave(); show('rooms'); refreshRooms(); };
  $('btn-lobby-char').onclick = () => openPicker('lobby');
  $('lobby-public').onchange = e => setRoomPublic(e.target.checked);
  // personaje
  $('btn-picker-ok').onclick = confirmPicker;
  $('btn-picker-cancel').onclick = () => show(pickerReturn);
  // fin de partida
  $('btn-go-again').onclick = () => { $('gameover').classList.add('hidden'); rematch(); };
  $('btn-go-lobby').onclick = () => { $('gameover').classList.add('hidden'); backToLobby(); show('lobby'); renderLobby(); };
  $('btn-go-menu').onclick = exitToMenu;
  $('btn-go-view').onclick = () => $('gameover').classList.add('hidden');
  // HUD
  const syncSound = () => {
    $('btn-music').classList.toggle('off', !musicOn()); $('btn-sfx').classList.toggle('off', !sfxOn());
    $('btn-music').title = musicOn() ? 'Música: sí' : 'Música: no'; $('btn-sfx').title = sfxOn() ? 'Efectos: sí' : 'Efectos: no';
  };
  $('btn-music').innerHTML = icon('music'); $('btn-sfx').innerHTML = icon('sound'); $('btn-cam').innerHTML = icon('camera');
  $('btn-help').innerHTML = icon('help'); $('btn-menu').innerHTML = icon('menu'); $('btn-log').innerHTML = icon('log') + '<span>Historial</span>';
  $('ti-deck-ic').innerHTML = icon('cards'); $('ti-bombs-ic').innerHTML = icon('bomb');
  $('btn-music').onclick = () => { unlockAudio(); setMusic(!musicOn()); syncSound(); };
  $('btn-sfx').onclick = () => { unlockAudio(); setSfx(!sfxOn()); syncSound(); sfx('ui'); };
  syncSound();
  $('btn-cam').onclick = () => setCamMode(camMode === 'head' ? 'orbit' : 'head');
  $('btn-help').onclick = () => $('help').classList.toggle('hidden');
  $('btn-help-ok').onclick = () => $('help').classList.add('hidden');
  $('btn-menu').onclick = () => openMenuPop();
  $('btn-log').onclick = () => { UI.logOpen = !UI.logOpen; $('log-wrap').classList.toggle('open', UI.logOpen); };
  $('log-wrap').classList.toggle('open', UI.logOpen);
  $('btn-future-ok').onclick = () => $('future-popup').classList.add('hidden');
  $('bomb-minus').onclick = () => { UI.bombPos--; updBomb(); };
  $('bomb-plus').onclick = () => { UI.bombPos++; updBomb(); };
  $('bomb-range').oninput = e => { UI.bombPos = +e.target.value; updBomb(); };
  $('btn-bomb-ok').onclick = () => act('bomb', { pos: UI.bombPos });
  $('btn-trio-ok').onclick = () => {
    const c = UI.trioCat; $('trio-menu').classList.add('hidden');
    if (c && canAct(0)) { UI.selected = -1; UI.selType = null; act('play', { card: c, target: defaultTarget(), wanted: UI.wanted }); }
  };
  $('btn-trio-pair').onclick = () => {
    const c = UI.trioCat; $('trio-menu').classList.add('hidden');
    if (c && canAct(0)) { UI.selected = -1; UI.selType = null; act('play', { card: c, target: defaultTarget(), asPair: true }); }
  };
  $('btn-trio-cancel').onclick = () => $('trio-menu').classList.add('hidden');
  $('btn-notice-ok').onclick = () => $('notice').classList.add('hidden');
  // menú dentro de la partida
  $('mp-resume').onclick = () => $('menu-pop').classList.add('hidden');
  $('mp-restart').onclick = () => { $('menu-pop').classList.add('hidden'); rematch(); };
  $('mp-lobby').onclick = () => { $('menu-pop').classList.add('hidden'); backToLobby(); show('lobby'); renderLobby(); };
  $('mp-exit').onclick = exitToMenu;

  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'h') $('help').classList.toggle('hidden');
    if (k === 'escape') { if (!$('hud').classList.contains('hidden')) openMenuPop(); }
    if ($('hud').classList.contains('hidden') || !G) return;
    if (k === 'c') setCamMode(camMode === 'head' ? 'orbit' : 'head');
    if (k === 'v' && S.mode === 'solo') previewVictory();
    if (k === 'r' && canAct(0)) act('draw');
    if (k === ' ' && canAct(0)) { e.preventDefault(); playSelected(); }
    if (k === 'n' && canNope(0)) act('nope');
    if (k === 'enter' && G.staged && (G.waiting || []).includes(0)) act('pass');
  });
  show('menu');
}
function openMenuPop() {
  $('mp-restart').classList.toggle('hidden', S.mode === 'client');
  $('mp-restart').textContent = S.mode === 'host' ? 'Nueva partida (misma sala)' : 'Nueva partida';
  $('mp-lobby').classList.toggle('hidden', S.mode !== 'host');
  $('menu-pop').classList.remove('hidden');
}
function exitToMenu() {
  leave(); $('gameover').classList.add('hidden'); $('menu-pop').classList.add('hidden');
  setView(null); show('menu'); startMusic('mesa');
}
