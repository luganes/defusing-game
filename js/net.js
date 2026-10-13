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

import { NET_APP, NUM_ROOMS } from './config.js';

const LOCAL = /[?&]red=local\b/.test(location.search);
const roomId = n => `ek3d-${NET_APP}-sala-${n}`;
const PEER_OPTS = { debug: 1 };

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
  return new Promise((resolve, reject) => {
    if (!netAvailable()) return reject('sin-red');
    const peer = new window.Peer(roomId(n), PEER_OPTS);
    let opened = false;
    peer.on('open', () => { opened = true; resolve({ close: () => { try { peer.destroy(); } catch {} } }); });
    peer.on('connection', c => c.on('open', () => onConn(wrapPeerConn(c))));
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
    peer.on('error', e => {
      console.warn('[net] host', e.type, e);
      if (!opened) reject(e.type === 'unavailable-id' ? 'ocupada' : (e.type || 'error'));
    });
  });
}

// ---------- Unirse a una sala ----------
export function joinRoom(n, meta, timeout = 9000) {
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
  return new Promise((resolve, reject) => {
    if (!netAvailable()) return reject('sin-red');
    const peer = new window.Peer(PEER_OPTS);
    let done = false;
    const fail = why => { if (done) return; done = true; clearTimeout(t); try { peer.destroy(); } catch {} reject(why); };
    const t = setTimeout(() => fail('sin-respuesta'), timeout);
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'libre' : (e.type || 'error')));
    peer.on('open', () => {
      const c = peer.connect(roomId(n), { reliable: true, serialization: 'json', metadata: meta });
      c.on('open', () => {
        if (done) return; done = true; clearTimeout(t);
        const w = wrapPeerConn(c);
        w.on('close', () => setTimeout(() => { try { peer.destroy(); } catch {} }, 500));
        resolve(w);
      });
    });
  });
}

// ---------- Lista de salas ----------
// Pregunta a las NUM_ROOMS salas a la vez. Cada una responde { info } o null (libre).
export async function probeRooms() {
  const ask = n => joinRoom(n, { probe: true }, 7000).then(conn => new Promise(res => {
    const t = setTimeout(() => { conn.close(); res({ n, info: { name: '?', players: 0, started: false, isPublic: false } }); }, 3000);
    conn.on('data', d => { if (d?.k === 'info') { clearTimeout(t); conn.close(); res({ n, info: d.info }); } });
  })).catch(why => ({ n, info: null, why }));
  return Promise.all(Array.from({ length: NUM_ROOMS }, (_, i) => ask(i + 1)));
}
