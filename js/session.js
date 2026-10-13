// ================= Sesión: solitario, anfitrión o invitado =================
// - Solitario: tu navegador lleva la partida; tú eres el asiento 0 y la IA los demás.
// - Anfitrión (crea la sala): igual, pero los demás asientos pueden ser amigos conectados.
//   Tras cada cambio, a cada amigo se le manda SU vista (girada para que él sea el asiento 0
//   y sin las cartas que no debe ver) y los eventos para animarla.
// - Invitado: no calcula nada; recibe vistas y eventos y manda sus acciones al anfitrión.
// Todo lo de pantalla (3D, sonidos, HUD) recibe siempre asientos LOCALES (0 = tú).

import * as Game from './game.js';
import { hostRoom, joinRoom } from './net.js';

export const S = {
  mode: null,          // 'solo' | 'host' | 'client'
  seat: 0,             // tu asiento real (en invitado lo dice el anfitrión)
  room: 0,             // número de sala (online)
  lobby: null,         // { name, isPublic, code, seats: [{name, preset, host}], started }
  status: '',
};

let ui = { onEvent() {}, onState() {}, onLobby() {}, onClosed() {} };
export function bindUI(handlers) { ui = { ...ui, ...handlers }; }

// ---------- Giro de asientos ----------
const toLocal = (g, me) => (g < 0 || g === undefined || g === null) ? g : (g - me + 4) % 4;
const toGlobal = (l, me) => (l < 0 || l === undefined || l === null) ? l : (l + me) % 4;
const rot = (arr, me) => arr.map((_, i) => arr[(i + me) % 4]); // rot[local] = arr[global]

function viewFor(me) {
  const G = Game.G, L = g => toLocal(g, me);
  return {
    hands: rot(G.hands.map((h, g) => g === me ? [...h] : h.map(() => 'X')), me),
    deck: G.deck.map(() => 'X'), discard: [...G.discard],
    turn: L(G.turn), turnsRem: G.turnsRem, alive: rot(G.alive, me),
    staged: G.staged && { ...G.staged, actor: L(G.staged.actor), target: L(G.staged.target), next: L(G.staged.next) },
    pending: G.pending && { type: G.pending.type, from: L(G.pending.from), to: L(G.pending.to) },
    lastSeen: rot(G.lastSeen.map((v, g) => g === me ? v : []), me),
    over: G.over, winner: L(G.winner), waiting: G.waiting.map(L), passed: G.passed.map(L),
    deadline: 0, deadlineIn: G.deadline ? G.deadline - Date.now() : 0, bombs: G.bombs, names: rot(G.names, me), ctrl: rot(G.ctrl, me),
    presets: rot(G.presets, me), round: G.round, windowReady: G.windowReady,
  };
}
const SEAT_KEYS = ['actor', 'target', 'p', 'from', 'to'];
function eventFor(e, me) {
  if ((e.t === 'seeFuture' || e.t === 'bombAsk') && e.p !== me) return null; // privado
  const o = { ...e };
  SEAT_KEYS.forEach(k => { if (typeof o[k] === 'number') o[k] = toLocal(o[k], me); });
  if (e.t === 'draw' && e.p !== me) o.card = 'X';
  if (e.t === 'transfer' && e.from !== me && e.to !== me) o.card = 'X';
  return o;
}

// ---------- Anfitrión / solitario ----------
const clients = new Map(); // seat -> { conn, queue: [] }
let roomHandle = null;

function hostEmit(e) {
  if (e.t === 'state') {
    ui.onState();
    for (const [seat, c] of clients) {
      c.conn.send({ k: 'game', view: viewFor(seat), events: c.queue });
      c.queue = [];
    }
    return;
  }
  const mine = eventFor(e, 0);
  if (mine) ui.onEvent(mine);
  for (const [seat, c] of clients) { const ev = eventFor(e, seat); if (ev) c.queue.push(ev); }
}

export function startSolo(me) { // me = { name, preset }
  leave();
  S.mode = 'solo'; S.seat = 0; S.room = 0; S.lobby = null;
  Object.assign(Game.RULES, { nopeWait: 0, favorWait: 0, bombWait: 0, turnWait: 0 });
  Game.setEmitter(hostEmit);
  newRound([{ name: me.name, preset: me.preset }]);
}

// humans: lista de {name, preset} en orden de asiento (el resto: IA con personaje al azar)
let aiPick = () => 'Gojo';
export function setAIPicker(fn) { aiPick = fn; }
function newRound(humans) {
  const used = new Set(humans.map(h => h.preset));
  const seats = [0, 1, 2, 3].map(i => {
    if (humans[i]) return { name: humans[i].name, ctrl: 'human', preset: humans[i].preset };
    const preset = aiPick(used); used.add(preset);
    return { name: preset, ctrl: 'ai', preset };
  });
  Game.newGame(seats);
}

export async function createRoom(n, me, isPublic) {
  leave();
  S.mode = 'host'; S.seat = 0; S.room = n;
  S.lobby = { name: `Sala ${n}`, isPublic, code: isPublic ? '' : String(1000 + Math.floor(Math.random() * 9000)),
    seats: [{ name: me.name, preset: me.preset, host: true }], started: false };
  Object.assign(Game.RULES, { nopeWait: 10000, favorWait: 25000, bombWait: 25000, turnWait: 60000 });
  Game.setEmitter(hostEmit);
  try {
    roomHandle = await hostRoom(n, onIncoming);
  } catch (why) { S.mode = null; S.lobby = null; throw why; }
  ui.onLobby();
}

function lobbyInfo() {
  const L = S.lobby;
  const here = L.seats.filter((x, i) => x && (i === 0 || clients.has(i))).length; // solo los conectados
  return { name: L.name, isPublic: L.isPublic, players: here, started: L.started,
    host: L.seats[0]?.name || '?' };
}
function broadcastLobby() {
  const L = S.lobby;
  for (const [seat, c] of clients) c.conn.send({ k: 'lobby', lobby: { ...L, code: '' }, seat });
  ui.onLobby();
}

function onIncoming(conn) {
  const m = conn.meta || {};
  if (m.probe) { conn.send({ k: 'info', info: lobbyInfo() }); setTimeout(() => conn.close(), 400); return; }
  const L = S.lobby;
  const reject = reason => { conn.send({ k: 'reject', reason }); setTimeout(() => conn.close(), 400); };
  if (!L) return reject('La sala ya no existe.');
  if (L.started) return reject('La partida ya empezó. Espera a que termine.');
  if (!L.isPublic && String(m.code || '') !== L.code) return reject('Código incorrecto.');
  const seat = [1, 2, 3].find(i => !L.seats[i]);
  if (!seat) return reject('La sala está llena (4 de 4).');
  L.seats[seat] = { name: String(m.name || 'Jugador').slice(0, 16), preset: m.preset };
  clients.set(seat, { conn, queue: [] });
  conn.on('data', d => onClientData(seat, d));
  conn.on('close', () => onClientGone(seat, conn));
  conn.send({ k: 'welcome', seat });
  broadcastLobby();
}

function onClientGone(seat, conn) {
  if (clients.get(seat)?.conn !== conn) return;
  clients.delete(seat);
  const L = S.lobby; if (!L) return;
  if (L.started && Game.G && !Game.G.over) Game.toAI(seat); // la partida sigue: la IA juega por él
  if (!L.started) L.seats[seat] = null;
  broadcastLobby();
}

function onClientData(seat, d) {
  if (d?.k === 'act') runAction(seat, d.a, d.args || {}, true);
  if (d?.k === 'preset' && S.lobby && !S.lobby.started) { S.lobby.seats[seat].preset = d.preset; broadcastLobby(); }
}

export function setRoomPublic(isPublic) {
  if (S.mode !== 'host') return;
  S.lobby.isPublic = isPublic;
  if (!isPublic && !S.lobby.code) S.lobby.code = String(1000 + Math.floor(Math.random() * 9000));
  broadcastLobby();
}

export function startRoomGame() {
  if (S.mode !== 'host') return;
  const L = S.lobby; L.started = true;
  broadcastLobby();
  for (const [, c] of clients) c.conn.send({ k: 'start' });
  newRound(L.seats.map(s => s && { name: s.name, preset: s.preset }));
}

// Otra partida con los mismos (anfitrión o solitario). Los que se fueron, fuera de la sala.
export function rematch() {
  if (S.mode === 'solo') return newRound([{ name: Game.G.names[0], preset: Game.G.presets[0] }]);
  if (S.mode !== 'host') return;
  const L = S.lobby;
  for (let i = 1; i < 4; i++) if (L.seats[i] && !clients.has(i)) L.seats[i] = null;
  startRoomGame();
}

export function backToLobby() { // el anfitrión vuelve a la sala de espera (deja entrar a gente)
  if (S.mode !== 'host') return;
  Game.clearTimers();
  S.lobby.started = false;
  for (let i = 1; i < 4; i++) if (S.lobby.seats[i] && !clients.has(i)) S.lobby.seats[i] = null;
  for (const [, c] of clients) c.conn.send({ k: 'toLobby' });
  broadcastLobby();
}

// ---------- Invitado ----------
let hostConn = null;
export async function joinAsGuest(n, me, code) {
  leave();
  const conn = await joinRoom(n, { name: me.name, preset: me.preset, code });
  return new Promise((resolve, reject) => {
    let ok = false;
    const t = setTimeout(() => { if (!ok) { reject('El anfitrión no responde.'); conn.close(); } }, 8000);
    conn.on('data', d => {
      if (d?.k === 'reject') { clearTimeout(t); reject(d.reason); conn.close(); return; }
      if (d?.k === 'welcome') {
        ok = true; clearTimeout(t);
        S.mode = 'client'; S.seat = d.seat; S.room = n; hostConn = conn;
        resolve();
      }
      if (!ok) return;
      if (d.k === 'lobby') { S.lobby = d.lobby; ui.onLobby(); }
      if (d.k === 'start') { S.lobby && (S.lobby.started = true); }
      if (d.k === 'toLobby') { S.lobby && (S.lobby.started = false); Game.setView(null); ui.onLobby(); }
      if (d.k === 'game') {
        // el reloj de cada PC es distinto: el anfitrión manda cuánto falta, no la hora
        d.view.deadline = d.view.deadlineIn > 0 ? Date.now() + d.view.deadlineIn : 0;
        Game.setView(d.view);
        (d.events || []).forEach(ev => ui.onEvent(ev));
        ui.onState();
      }
    });
    conn.on('close', () => {
      if (S.mode !== 'client' || hostConn !== conn) { if (!ok) { clearTimeout(t); reject('Se cortó la conexión.'); } return; }
      hostConn = null; S.mode = null; S.lobby = null;
      ui.onClosed('El anfitrión cerró la sala o se perdió la conexión.');
    });
  });
}
export function sendPreset(preset) { if (S.mode === 'client') hostConn?.send({ k: 'preset', preset }); }

// ---------- Acciones (la UI siempre habla en asientos locales) ----------
export function act(a, args = {}) {
  if (S.mode === 'client') {
    const g = { ...args };
    if (typeof g.target === 'number') g.target = toGlobal(g.target, S.seat);
    hostConn?.send({ k: 'act', a, args: g });
    return true;
  }
  return runAction(0, a, args, false);
}

function runAction(seat, a, args, remote) {
  if (!Game.G) return false;
  if (remote && Game.G.ctrl[seat] !== 'human') return false;
  switch (a) {
    case 'play': return Game.play(seat, args.card, { target: args.target, wanted: args.wanted, asPair: !!args.asPair });
    case 'nope': return Game.nope(seat);
    case 'pass': return Game.pass(seat);
    case 'draw': return Game.draw(seat);
    case 'give': return Game.giveFavor(seat, args.card);
    case 'bomb': return Game.placeBomb(seat, args.pos);
  }
  return false;
}

// ---------- Salir ----------
export function leave() {
  Game.clearTimers();
  for (const [, c] of clients) { try { c.conn.send({ k: 'bye' }); } catch {} c.conn.close(); }
  clients.clear();
  roomHandle?.close(); roomHandle = null;
  if (hostConn) { const c = hostConn; hostConn = null; c.close(); }
  S.mode = null; S.lobby = null; S.room = 0;
}
addEventListener('beforeunload', leave);
