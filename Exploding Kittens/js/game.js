// ================= Game: estado + reglas + IA (solo lo ejecuta el ANFITRIÓN) =================
// Lógica pura del Exploding Kittens con asientos explícitos (0..3). No toca el DOM ni el 3D:
// todo lo visible sale como EVENTOS (emit) que session.js reparte a la pantalla local y a
// los demás jugadores. En los invitados, G no es el estado real sino su VISTA (setView):
// girada para que ellos sean el asiento 0 y sin las cartas que no deben ver.

import { CATS } from './config.js';

export let G = null;
let emitFn = () => {};
export function setEmitter(fn) { emitFn = fn; }
export function setView(v) { G = v; }
const emit = (t, d = {}) => emitFn({ t, ...d });

// Tiempos (ms). 0 = sin límite. session.js los ajusta: en solitario se espera sin prisa;
// online hay límites para que nadie se quede colgado (si alguien se va, sigue la partida).
export const RULES = { nopeWait: 0, favorWait: 0, bombWait: 0, turnWait: 0 };

export const isCat = c => CATS.includes(c);
export const countIn = (p, c) => G.hands[p].filter(x => x === c).length;
export const nameOf = p => G?.names?.[p] || `P${p + 1}`;
const isHuman = p => G.ctrl[p] === 'human';
const aliveCount = () => G.alive.filter(Boolean).length;
const nextAlive = from => { let t = from; do { t = (t + 1) % 4; } while (!G.alive[t]); return t; };
const rnd = n => Math.floor(Math.random() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function removeFrom(p, c, n = 1) {
  if (countIn(p, c) < n) return false;
  for (let i = 0; i < n; i++) G.hands[p].splice(G.hands[p].indexOf(c), 1);
  return true;
}
const log = msg => emit('log', { msg });

// ---------- Consultas (las usan la UI y el 3D, también sobre la vista) ----------
export function stagedTarget() {
  const s = G?.staged; if (!s) return -1;
  if (s.kind === 'Attack') return s.next ?? -1;
  return s.target ?? -1;
}
export function threat() {
  if (!G) return null;
  if (G.staged) { const t = stagedTarget(); if (t >= 0) return { from: G.staged.actor, to: t, kind: G.staged.kind }; }
  if (G.pending?.type === 'favor') return { from: G.pending.to, to: G.pending.from, kind: 'Favor' };
  return null;
}
export const canAct = (p = 0) => !!G && !G.over && G.turn === p && G.alive[p] && !G.staged && !G.pending;
export const bombsLeft = () => G ? (G.bombs ?? G.deck.filter(c => c === 'Exploding Kitten').length) : 0;
// ¿Puede ese jugador responder con NOPE ahora mismo?
export const canNope = (p = 0) => !!G?.staged && G.alive[p] && G.hands[p].includes('Nope');
export const waitingOn = () => G?.waiting || [];

// ---------- Nueva partida ----------
// seats: [{ name, ctrl: 'human'|'ai', preset }] × 4 (preset = nombre del personaje)
export function newGame(seats) {
  clearTimers();
  G = {
    deck: [], hands: [[], [], [], []], discard: [], turn: 0, turnsRem: 1,
    alive: [true, true, true, true], staged: null, pending: null, lastSeen: [[], [], [], []],
    over: false, winner: -1, waiting: [], passed: [], deadline: 0, bombs: 3,
    names: seats.map(s => s.name), ctrl: seats.map(s => s.ctrl), presets: seats.map(s => s.preset),
    round: (G?.round || 0) + 1,
  };
  const d = [];
  const add = (t, n) => { for (let i = 0; i < n; i++) d.push(t); };
  add('Attack', 4); add('Skip', 4); add('Favor', 4); add('Shuffle', 4);
  add('See Future', 5); add('Nope', 5);
  CATS.forEach(c => add(c, 4));
  shuffle(d);
  for (let r = 0; r < 7; r++) for (let p = 0; p < 4; p++) G.hands[p].push(d.pop());
  for (let p = 0; p < 4; p++) G.hands[p].push('Defuse');
  d.push('Defuse', 'Defuse', 'Exploding Kitten', 'Exploding Kitten', 'Exploding Kitten');
  G.deck = shuffle(d);
  G.turn = rnd(4); // empieza alguien al azar
  emit('reset');
  log(`Nueva partida: 7 cartas + 1 Defuse para cada uno. Hay 3 bombas en el mazo. Empieza ${nameOf(G.turn)}.`);
  commit();
}

// ---------- Ciclo: tras cada cambio ----------
let aiTimer = null, winTimer = null, waitTimer = null;
export function clearTimers() { clearTimeout(aiTimer); clearTimeout(winTimer); clearTimeout(waitTimer); }

function commit() {
  G.bombs = G.deck.filter(c => c === 'Exploding Kitten').length;
  clearTimeout(waitTimer);
  if (!G.staged) { G.deadline = 0; G.waiting = []; }
  if (!G.over && !G.staged) {
    if (G.pending?.type === 'favor' && isHuman(G.pending.from) && RULES.favorWait) {
      G.deadline = Date.now() + RULES.favorWait;
      waitTimer = setTimeout(() => { // no eligió a tiempo: va una al azar
        const P = G.pending; if (P?.type !== 'favor') return;
        giveFavor(P.from, G.hands[P.from][rnd(G.hands[P.from].length)]);
      }, RULES.favorWait);
    } else if (G.pending?.type === 'bomb' && isHuman(G.pending.from) && RULES.bombWait) {
      G.deadline = Date.now() + RULES.bombWait;
      waitTimer = setTimeout(() => { const P = G.pending; if (P?.type === 'bomb') placeBomb(P.from, rnd(G.deck.length + 1)); }, RULES.bombWait);
    } else if (!G.pending && isHuman(G.turn) && G.alive[G.turn] && RULES.turnWait) {
      G.deadline = Date.now() + RULES.turnWait;
      const p = G.turn, r = G.round;
      waitTimer = setTimeout(() => { if (G.round === r && canAct(p)) { log(`${nameOf(p)} tardó demasiado: roba automáticamente.`); draw(p); } }, RULES.turnWait);
    } else if (!G.pending) G.deadline = 0;
    if (!G.pending && !isHuman(G.turn)) scheduleAI(900);
  }
  emit('state');
}

// ---------- Jugadas ----------
function stage(p, kind, cards, extra = {}) {
  G.staged = { actor: p, kind, cards, target: extra.target ?? -1, wanted: extra.wanted ?? null, nopes: 0,
    next: kind === 'Attack' ? nextAlive(p) : -1 };
  emit('play', { actor: p, cards, target: stagedTarget(), kind });
  if (['Attack', 'Favor', 'Pair', 'Triple'].includes(kind)) emit('gesture', { actor: p, target: stagedTarget() });
  const t = stagedTarget();
  const what = { Attack: 'ATTACK', Skip: 'SKIP', Shuffle: 'SHUFFLE', SeeFuture: 'VER EL FUTURO', Favor: 'FAVOR', Pair: `pareja de ${cards[0]}`, Triple: `trío de ${cards[0]}` }[kind];
  log(`${nameOf(p)} juega ${what}${t >= 0 ? ' contra ' + nameOf(t) : ''}${kind === 'Triple' ? ` (pide ${extra.wanted})` : ''}.`);
  openWindow();
  return true;
}

// p juega una carta de su mano. opts: { target, wanted, asPair }
export function play(p, card, opts = {}) {
  if (!canAct(p) || !G.hands[p].includes(card)) return false;
  const t = opts.target;
  const validTarget = t !== undefined && t >= 0 && t !== p && G.alive[t];
  switch (card) {
    case 'Attack': removeFrom(p, card); return stage(p, 'Attack', [card]);
    case 'Skip': removeFrom(p, card); return stage(p, 'Skip', [card]);
    case 'Shuffle': removeFrom(p, card); return stage(p, 'Shuffle', [card]);
    case 'See Future': removeFrom(p, card); return stage(p, 'SeeFuture', [card]);
    case 'Favor':
      if (!validTarget || !G.hands[t].length) return false;
      removeFrom(p, card); return stage(p, 'Favor', [card], { target: t });
  }
  if (isCat(card)) {
    if (!validTarget) return false;
    const n = countIn(p, card);
    if (n >= 3 && !opts.asPair && opts.wanted) { removeFrom(p, card, 3); return stage(p, 'Triple', [card, card, card], { target: t, wanted: opts.wanted }); }
    if (n >= 2 && G.hands[t].length) { removeFrom(p, card, 2); return stage(p, 'Pair', [card, card], { target: t }); }
  }
  return false;
}

export function nope(p) {
  if (!canNope(p) || G.staged.nopes >= 6) return false;
  removeFrom(p, 'Nope');
  G.discard.push('Nope'); G.staged.nopes++;
  const cancelled = G.staged.nopes % 2 === 1;
  emit('nope', { p, cancelled });
  log(`${nameOf(p)} juega NOPE: ${cancelled ? 'la jugada queda CANCELADA' : 'la jugada vuelve a valer'}.`);
  openWindow();
  return true;
}

// Un humano no quiere responder con NOPE
export function pass(p) {
  if (!G.staged || G.passed.includes(p)) return false;
  G.passed.push(p);
  G.waiting = waitingHumans();
  if (!G.waiting.length && G.windowReady) { clearTimeout(winTimer); winTimer = setTimeout(resolve, 250); }
  emit('state');
  return true;
}

// ---------- Ventana NOPE ----------
function waitingHumans() {
  const s = G.staged; if (!s) return [];
  return [0, 1, 2, 3].filter(p => G.alive[p] && isHuman(p) && G.hands[p].includes('Nope') && !G.passed.includes(p)
    && !(p === s.actor && s.nopes % 2 === 0)); // el que juega no se veta a sí mismo
}
function openWindow() {
  clearTimeout(winTimer); clearTimeout(waitTimer); clearTimeout(aiTimer);
  G.passed = []; G.windowReady = false;
  G.waiting = waitingHumans(); G.deadline = 0;
  winTimer = setTimeout(aiReactOrResolve, 1300); // tiempo para ver la carta llegar
  emit('state');
}
function aiReactOrResolve() {
  const s = G.staged; if (!s || G.over) return;
  const cancelled = s.nopes % 2 === 1;
  const t = stagedTarget();
  const ais = shuffle([0, 1, 2, 3].filter(p => G.alive[p] && !isHuman(p) && G.hands[p].includes('Nope')));
  for (const p of ais) {
    let chance;
    if (!cancelled) chance = p === s.actor ? 0 : (p === t ? 0.45 : 0.1); // le atacan a ella: más ganas
    else chance = p === s.actor ? 0.4 : 0.05; // su jugada fue vetada: la defiende
    if (Math.random() < chance) { nope(p); return; }
  }
  G.windowReady = true;
  G.waiting = waitingHumans();
  if (G.waiting.length) {
    if (RULES.nopeWait) { G.deadline = Date.now() + RULES.nopeWait; winTimer = setTimeout(resolve, RULES.nopeWait); }
    emit('state');
    return;
  }
  resolve();
}

function resolve() {
  clearTimeout(winTimer);
  const s = G.staged; if (!s) return;
  const cancelled = s.nopes % 2 === 1;
  const t = stagedTarget();
  s.cards.forEach(c => G.discard.push(c));
  emit('resolve', { cancelled, kind: s.kind, actor: s.actor, target: t });
  G.staged = null; G.waiting = []; G.passed = [];
  if (cancelled) { log(`La jugada de ${nameOf(s.actor)} no tiene efecto.`); return commit(); }
  if (s.kind === 'Attack') {
    G.turn = t; G.turnsRem = 2;
    log(`${nameOf(t)} tiene que jugar 2 turnos seguidos.`);
  } else if (s.kind === 'Skip') { consumeTurn(); }
  else if (s.kind === 'Shuffle') { shuffle(G.deck); G.lastSeen = [[], [], [], []]; log('El mazo queda barajado.'); }
  else if (s.kind === 'SeeFuture') {
    G.lastSeen[s.actor] = G.deck.slice(-3).reverse();
    emit('future', { actor: s.actor });
    emit('seeFuture', { p: s.actor, cards: G.lastSeen[s.actor] });
  } else if (s.kind === 'Favor') {
    G.pending = { type: 'favor', from: s.target, to: s.actor };
    if (!isHuman(s.target)) { // la IA entrega una al azar
      const h = G.hands[s.target], got = h.splice(rnd(h.length), 1)[0];
      G.hands[s.actor].push(got); G.pending = null;
      emit('transfer', { from: s.target, to: s.actor, card: got, delay: 0.9 });
      log(`${nameOf(s.target)} le da una carta a ${nameOf(s.actor)}.`);
    } else log(`${nameOf(s.target)} tiene que elegir qué carta darle a ${nameOf(s.actor)}.`);
  } else if (s.kind === 'Pair') {
    const vh = G.hands[s.target];
    if (vh.length) {
      const got = vh.splice(rnd(vh.length), 1)[0];
      G.hands[s.actor].push(got);
      emit('transfer', { from: s.target, to: s.actor, card: got, delay: 0.9 });
      log(`${nameOf(s.actor)} le roba una carta al azar a ${nameOf(s.target)}.`);
    }
  } else if (s.kind === 'Triple') {
    const vh = G.hands[s.target], i = vh.indexOf(s.wanted);
    if (i >= 0) {
      vh.splice(i, 1); G.hands[s.actor].push(s.wanted);
      emit('transfer', { from: s.target, to: s.actor, card: s.wanted, delay: 0.9 });
      log(`${nameOf(s.actor)} consigue ${s.wanted} de ${nameOf(s.target)}.`);
    } else log(`${nameOf(s.target)} no tenía ${s.wanted}.`);
  }
  commit();
}

function consumeTurn() {
  G.turnsRem--;
  if (G.turnsRem <= 0) { if (aliveCount() <= 1) return endCheck(); G.turn = nextAlive(G.turn); G.turnsRem = 1; }
}
function endCheck() {
  if (aliveCount() === 1) { G.over = true; G.winner = G.alive.findIndex(Boolean); log(`${nameOf(G.winner)} GANA LA PARTIDA.`); }
}

// ---------- Robar ----------
export function draw(p) {
  if (!canAct(p)) return false;
  if (!G.deck.length) {
    G.deck = shuffle(G.discard.filter(c => c !== 'Exploding Kitten')); G.discard = [];
    log('El mazo se acabó: se baraja el descarte.');
  }
  if (!G.deck.length) { consumeTurn(); commit(); return true; } // (no quedan cartas en ningún sitio)
  const c = G.deck.pop();
  G.lastSeen.forEach(a => a.shift()); // lo que alguien vio arriba ya no está
  if (c === 'Exploding Kitten') {
    const di = G.hands[p].indexOf('Defuse');
    if (di >= 0) {
      G.hands[p].splice(di, 1); G.discard.push('Defuse');
      log(`${nameOf(p)} robó una BOMBA pero la desactiva con Defuse.`);
      if (isHuman(p)) {
        G.pending = { type: 'bomb', from: p, card: c };
        emit('defuse', { p, reinsertNow: false });
        emit('bombAsk', { p });
      } else {
        G.deck.splice(rnd(G.deck.length + 1), 0, c); G.lastSeen = [[], [], [], []];
        emit('defuse', { p, reinsertNow: true });
        log(`${nameOf(p)} vuelve a esconder la bomba en el mazo.`);
        consumeTurn();
      }
    } else {
      G.discard.push(c);
      const lost = [...G.hands[p]];
      lost.forEach(x => G.discard.push(x)); G.hands[p] = [];
      G.alive[p] = false;
      emit('kitten', { p, hand: lost });
      log(`${nameOf(p)} robó una BOMBA sin Defuse: ¡EXPLOTA!`);
      endCheck();
      if (!G.over) { G.turn = nextAlive(p); G.turnsRem = 1; }
    }
  } else {
    G.hands[p].push(c);
    emit('draw', { p, card: c });
    log(`${nameOf(p)} roba una carta.`);
    consumeTurn();
  }
  commit();
  return true;
}

// ---------- Respuestas de un humano ----------
export function giveFavor(p, card) {
  const P = G.pending;
  if (P?.type !== 'favor' || P.from !== p || !G.hands[p].includes(card)) return false;
  G.hands[p].splice(G.hands[p].indexOf(card), 1);
  G.hands[P.to].push(card); G.pending = null;
  emit('transfer', { from: p, to: P.to, card, delay: 0 });
  log(`${nameOf(p)} le da una carta a ${nameOf(P.to)}.`);
  commit();
  return true;
}

// pos: 0 = arriba del todo … deck.length = abajo del todo
export function placeBomb(p, pos) {
  const P = G.pending;
  if (P?.type !== 'bomb' || P.from !== p) return false;
  pos = Math.max(0, Math.min(G.deck.length, pos | 0));
  G.deck.splice(G.deck.length - pos, 0, P.card); G.pending = null; G.lastSeen = [[], [], [], []];
  emit('reinsert');
  log(`${nameOf(p)} vuelve a esconder la bomba en el mazo.`);
  consumeTurn();
  commit();
  return true;
}

// Alguien se desconecta: su asiento lo lleva la IA desde ya
export function toAI(p) {
  if (!G || G.ctrl[p] === 'ai') return;
  log(`${nameOf(p)} se desconectó: a partir de ahora juega la IA en su lugar.`);
  G.ctrl[p] = 'ai'; G.names[p] += ' (IA)';
  if (G.staged) { G.passed = G.passed.filter(x => x !== p); G.waiting = waitingHumans(); if (!G.waiting.length && G.windowReady) resolve(); else emit('state'); return; }
  if (G.pending?.from === p) {
    if (G.pending.type === 'favor') return giveFavor(p, G.hands[p][rnd(G.hands[p].length)]);
    if (G.pending.type === 'bomb') return placeBomb(p, rnd(G.deck.length + 1));
  }
  commit();
}

// ---------- IA ----------
function scheduleAI(ms) {
  clearTimeout(aiTimer);
  aiTimer = setTimeout(() => { if (!G.over && !isHuman(G.turn) && !G.staged && !G.pending) aiTurn(); }, ms);
}
function aiTurn() {
  const p = G.turn, r = Math.random() * 100, has = c => G.hands[p].includes(c);
  const others = [0, 1, 2, 3].filter(i => i !== p && G.alive[i] && G.hands[i].length);
  const pick = () => others[rnd(others.length)];
  // Si sabe (por See Future) que arriba hay bomba y no tiene Defuse, intenta librarse
  const danger = G.lastSeen[p][0] === 'Exploding Kitten' && !has('Defuse');
  let ok = false;
  if (danger && has('Skip')) ok = play(p, 'Skip');
  else if (danger && has('Attack')) ok = play(p, 'Attack');
  else if (danger && has('Shuffle')) ok = play(p, 'Shuffle');
  else if (r < 10 && has('Attack')) ok = play(p, 'Attack');
  else if (r < 20 && has('Skip')) ok = play(p, 'Skip');
  else if (r < 25 && has('Shuffle')) ok = play(p, 'Shuffle');
  else if (r < 32 && has('See Future')) ok = play(p, 'See Future');
  else if (r < 40 && has('Favor') && others.length) ok = play(p, 'Favor', { target: pick() });
  else if (r < 48 && others.length) {
    const pair = CATS.find(c => countIn(p, c) >= 2);
    if (pair) ok = play(p, pair, { target: pick(), asPair: true });
  }
  if (!ok) draw(p);
}
