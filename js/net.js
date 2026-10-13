// ================= Red: salas sin servidor propio =================
// Quien crea la sala ES el servidor: su navegador lleva la partida y los demás se conectan
// a él directamente (WebRTC con PeerJS). Solo hace falta el "buzón" gratuito de PeerJS para
// presentarse; las cartas viajan de navegador a navegador.
//
// Hay NUM_ROOMS salas fijas. Cada una tiene un nombre de red fijo (ek3d-<app>-sala-N):
// crear la sala = quedarse ese nombre; si ya está cogido, la sala está ocupada.
// Para ver la lista, se pregunta a las 7 a la vez quién está y cómo va.
//
// Con ?red=local se usa un canal del propio navegador (varias pestañas en el mismo PC):
// sirve para probar sin internet.

import { NET_APP, NUM_ROOMS, METERED_TURN } from './config.js';

const LOCAL = /[?&]red=local\b/.test(location.search);
const roomId = n => `ek3d-${NET_APP}-sala-${n}`;

// ---------- Servidores para atravesar routers (STUN / TURN) ----------
// STUN: le dice a cada navegador su dirección pública (basta en la mayoría de redes).
// TURN: si dos redes no se dejan conectar directamente (muy típico: datos del móvil
// contra el wifi de casa), los mensajes pasan por un servidor intermedio. Ponemos varios
// gratuitos; si uno no responde, WebRTC prueba con los demás.
const STATIC_SECRET = 'openrelayprojectsecret'; // clave PÚBLICA del proyecto gratuito Open Relay (metered.ca)
async function openRelayCreds() { // credenciales temporales (formato TURN REST: usuario = caducidad, clave = HMAC-SHA1)
  try {
    const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:ek3d`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(STATIC_SECRET), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(username)));
    return { username, credential: btoa(String.fromCharCode(...sig)) };
  } catch { return null; } // sin crypto.subtle (página abierta como archivo): seguimos sin este
}
let icePromise = null;
function iceServers() {
  icePromise ||= (async () => {
    const list = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ];
    const or = await openRelayCreds();
    if (or) list.push({ urls: ['turn:staticauth.openrelay.metered.ca:80', 'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
      'turns:staticauth.openrelay.metered.ca:443?transport=tcp'], ...or });
    if (METERED_TURN?.app && METERED_TURN?.apiKey) { // TURN propio gratuito (20 GB/mes) si se configura en config.js
      try {
        const r = await fetch(`https://${METERED_TURN.app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED_TURN.apiKey)}`);
        if (r.ok) list.unshift(...(await r.json()));
      } catch (e) { console.warn('[net] TURN metered', e); }
    }
    return list;
  })();
  return icePromise;
}
const peerOpts = async () => ({ debug: 1, config: { iceServers: await iceServers(), sdpSemantics: 'unified-plan' } });

export const netAvailable = () => LOCAL || typeof window.Peer === 'function';
export const netMode = () => (LOCAL ? 'local' : 'peerjs');

// ---------- Conexión envuelta (misma forma para PeerJS y para el canal local) ----------
// conn: { meta, send(obj), close(), on('data'|'close', fn) }
function wrapPeerConn(c) {
  const h = { data: [], close: [] };
  let closed = false;
  const fireClose = () => { if (closed) return; closed = true; h.close.forEach(f => f()); };
  c.on('data', d => h.data.forEach(f => f(d)));
  c.on('close', fireClose);
  c.on('error', fireClose);
  // Si el otro cierra la pestaña a lo bruto, WebRTC tarda en avisar: vigilamos el canal.
  const iv = setInterval(() => { if (!c.open && !closed) { clearInterval(iv); fireClose(); } }, 3000);
  return {
    meta: c.metadata || {},
    send: obj => { try { if (c.open) c.send(obj); } catch (e) { console.warn('[net] send', e); } },
    close: () => { clearInterval(iv); try { c.close(); } catch {} fireClose(); },
    on: (ev, fn) => h[ev].push(fn),
  };
}

// ---------- Canal local (pruebas) ----------
const bc = LOCAL ? new BroadcastChannel('ek3d-red-local') : null;
const myLocalId = 'p' + Math.random().toString(36).slice(2, 10);
const localHandlers = new Set();
if (bc) bc.onmessage = e => localHandlers.forEach(f => f(e.data));
const bcSend = m => bc.postMessage({ ...m, from: m.from || myLocalId });

function localConn(remote, meta, linkId) {
  const h = { data: [], close: [] };
  let closed = false;
  const onMsg = m => {
    if (m.link !== linkId || m.from !== remote) return;
    if (m.type === 'data') h.data.forEach(f => f(m.data));
    if (m.type === 'close') fire();
  };
  const fire = () => { if (closed) return; closed = true; localHandlers.delete(onMsg); h.close.forEach(f => f()); };
  localHandlers.add(onMsg);
  return {
    meta, send: data => { if (!closed) bcSend({ type: 'data', to: remote, link: linkId, data }); },
    close: () => { if (!closed) bcSend({ type: 'close', to: remote, link: linkId }); fire(); },
    on: (ev, fn) => h[ev].push(fn),
  };
}

// ---------- Anfitrión ----------
// onConn(conn) se llama con cada conexión entrante. Devuelve { close() } o lanza 'ocupada'.
export function hostRoom(n, onConn) {
  if (LOCAL) {
    return new Promise((resolve, reject) => {
      const id = roomId(n);
      let taken = false;
      const probe = m => { if (m.type === 'ihave' && m.room === id && m.to === myLocalId) taken = true; };
      localHandlers.add(probe);
      bcSend({ type: 'whohas', room: id });
      setTimeout(() => {
        localHandlers.delete(probe);
        if (taken) return reject('ocupada');
        const serve = m => {
          if (m.room !== id) return;
          if (m.type === 'whohas') bcSend({ type: 'ihave', room: id, to: m.from });
          if (m.type === 'connect') {
            const conn = localConn(m.from, m.meta || {}, m.link);
            bcSend({ type: 'accept', to: m.from, link: m.link, room: id });
            onConn(conn);
          }
        };
        localHandlers.add(serve);
        resolve({ close: () => localHandlers.delete(serve) });
      }, 300);
    });
  }
  return peerOpts().then(opts => new Promise((resolve, reject) => {
    if (!netAvailable()) return reject('sin-red');
    const peer = new window.Peer(roomId(n), opts);
    let opened = false;
    peer.on('open', () => { opened = true; resolve({ close: () => { try { peer.destroy(); } catch {} } }); });
    peer.on('connection', c => c.on('open', () => onConn(wrapPeerConn(c))));
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
    peer.on('error', e => {
      console.warn('[net] host', e.type, e);
      if (!opened) reject(e.type === 'unavailable-id' ? 'ocupada' : (e.type || 'error'));
    });
  }));
}

// ---------- Unirse a una sala ----------
export function joinRoom(n, meta, timeout = 25000) { // por TURN puede tardar unos segundos más
  if (LOCAL) {
    return new Promise((resolve, reject) => {
      const id = roomId(n), link = 'l' + Math.random().toString(36).slice(2, 10);
      const t = setTimeout(() => { localHandlers.delete(wait); reject('libre'); }, Math.min(timeout, 1500));
      const wait = m => {
        if (m.type === 'accept' && m.link === link && m.to === myLocalId) {
          clearTimeout(t); localHandlers.delete(wait);
          resolve(localConn(m.from, meta, link));
        }
      };
      localHandlers.add(wait);
      bcSend({ type: 'connect', room: id, link, meta });
    });
  }
  return peerOpts().then(opts => new Promise((resolve, reject) => {
    if (!netAvailable()) return reject('sin-red');
    const peer = new window.Peer(opts);
    let offered = false; // el servidor de PeerJS encontró la sala: si luego no conecta, es la red
    let done = false;
    const fail = why => { if (done) return; done = true; clearTimeout(t); try { peer.destroy(); } catch {} reject(why); };
    const t = setTimeout(() => fail(offered ? 'sin-conexion' : 'sin-respuesta'), timeout);
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'libre' : (e.type || 'error')));
    peer.on('open', () => {
      setTimeout(() => { offered = true; }, 7000); // sin "no existe" en 7 s: la sala está ahí
      const c = peer.connect(roomId(n), { reliable: true, serialization: 'json', metadata: meta });
      watchIce(c, `sala ${n}`);
      c.on('open', () => {
        if (done) return; done = true; clearTimeout(t);
        const w = wrapPeerConn(c);
        w.on('close', () => setTimeout(() => { try { peer.destroy(); } catch {} }, 500));
        resolve(w);
      });
    });
  }));
}

// Deja en la consola cómo va la conexión (directa, por TURN o fallida): ayuda a ver qué pasa.
function watchIce(c, label) {
  const pc = () => c.peerConnection;
  let tries = 0;
  const iv = setInterval(() => {
    const p = pc(); if (!p && ++tries < 20) return;
    clearInterval(iv); if (!p) return;
    p.addEventListener('iceconnectionstatechange', () => console.info(`[net] ${label}: ${p.iceConnectionState}`));
  }, 250);
}

// ---------- Lista de salas ----------
// Una sola conexión al servidor de PeerJS pregunta por las NUM_ROOMS salas a la vez.
// Cada sala acaba en uno de estos estados:
//   free   -> el servidor dice que nadie tiene ese nombre (sala libre)
//   room   -> el anfitrión contestó con { info }
//   noanswer -> la sala existe pero no llegó respuesta (la red no deja conectar, o tarda)
// Si no se puede ni hablar con el servidor de PeerJS, todas salen 'error'.
export async function probeRooms() {
  const range = Array.from({ length: NUM_ROOMS }, (_, i) => i + 1);
  if (LOCAL) {
    const ask = n => joinRoom(n, { probe: true }, 7000).then(conn => new Promise(res => {
      const t = setTimeout(() => { conn.close(); res({ n, state: 'noanswer', info: null }); }, 3000);
      conn.on('data', d => { if (d?.k === 'info') { clearTimeout(t); conn.close(); res({ n, state: 'room', info: d.info }); } });
    })).catch(() => ({ n, state: 'free', info: null }));
    return Promise.all(range.map(ask));
  }
  if (!netAvailable()) return range.map(n => ({ n, state: 'error', info: null }));
  const opts = await peerOpts();
  return new Promise(resolve => {
    const st = {}; let finished = false, opened = false;
    const peer = new window.Peer(opts);
    const finish = () => {
      if (finished) return; finished = true; clearTimeout(T);
      setTimeout(() => { try { peer.destroy(); } catch {} }, 300);
      resolve(range.map(n => st[n] || { n, state: opened ? 'noanswer' : 'error', info: null }));
    };
    const check = () => { if (range.every(n => st[n])) finish(); };
    const T = setTimeout(finish, 15000);
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') {
        const m = /sala-(\d+)/.exec(e.message || '');
        if (m && !st[m[1]]) { st[m[1]] = { n: +m[1], state: 'free', info: null }; check(); }
        return;
      }
      console.warn('[net] lista', e.type, e);
      if (!opened) finish(); // no hay servidor de salas
    });
    peer.on('open', () => {
      opened = true;
      range.forEach(n => {
        const c = peer.connect(roomId(n), { reliable: true, serialization: 'json', metadata: { probe: true } });
        watchIce(c, `lista sala ${n}`);
        c.on('data', d => { if (d?.k === 'info' && !st[n]) { st[n] = { n, state: 'room', info: d.info }; try { c.close(); } catch {} check(); } });
      });
    });
  });
}
