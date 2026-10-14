// ================= Red: salas sin servidor propio =================
// Quien crea la sala ES el servidor del juego: su navegador lleva la partida.
// Los mensajes viajan por un "repetidor" MQTT público y gratuito (no hace falta cuenta):
// todos se conectan a él por WebSocket, así que funciona entre redes distintas
// (wifi, datos del móvil, otro país...) sin depender de que los routers se dejen conectar.
//
// Temas (canales) de cada sala N, bajo  ek3d/<app>/v2/sala/N/ :
//   info        -> el anfitrión deja aquí (retenido) el estado de la sala; si se cae, el
//                  repetidor lo borra solo ("último mensaje"). La lista de salas lee esto.
//   host        -> lo que los invitados le mandan al anfitrión
//   c/<id>      -> lo que el anfitrión le manda a cada invitado
//
// Con ?red=local se usa un canal del propio navegador (varias pestañas en el mismo PC).

import { NET_APP, NUM_ROOMS, MQTT_BROKERS } from './config.js';
import { mqttConnect } from './mqtt.js';

const LOCAL = /[?&]red=local\b/.test(location.search);
const roomId = n => `ek3d-${NET_APP}-sala-${n}`;
const T = n => `ek3d/${NET_APP}/v2/sala/${n}`;
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const netAvailable = () => LOCAL || typeof WebSocket === 'function';
export const netMode = () => (LOCAL ? 'local' : 'mqtt');

// Conecta al primer repetidor que responda (todos prueban en el mismo orden, así coinciden).
let goodBroker = null;
async function connectBroker(opts) {
  const list = goodBroker ? [goodBroker, ...MQTT_BROKERS.filter(b => b !== goodBroker)] : MQTT_BROKERS;
  let last = 'sin-red';
  for (const url of list) {
    try {
      const c = await mqttConnect(url, { clientId: 'ek3d-' + newId(), ...opts });
      goodBroker = url; return c;
    } catch (e) { last = 'sin-red'; console.warn('[net] repetidor', url, e); }
  }
  throw last;
}
const parse = s => { try { return JSON.parse(s); } catch { return null; } };

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
// onConn(conn) por cada invitado; getInfo() da el estado de la sala para la lista.
// Devuelve { close(), update() } o falla con 'ocupada' / 'sin-red'.
export async function hostRoom(n, onConn, getInfo = () => ({})) {
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
  const myId = newId();
  const mq = await connectBroker({ will: { topic: `${T(n)}/info`, payload: '', retain: true } });
  // ¿Hay ya alguien en esta sala? (el mensaje retenido llega nada más suscribirse)
  let other = null;
  const onInfo = (topic, msg) => {
    if (topic !== `${T(n)}/info`) return;
    const d = parse(msg);
    if (d?.hostId && d.hostId !== myId) other = d;
  };
  mq.on('message', onInfo);
  await mq.subscribe(`${T(n)}/info`);
  await new Promise(r => setTimeout(r, 1200));
  if (other) { mq.end(); throw 'ocupada'; }
  const publishInfo = () => mq.publish(`${T(n)}/info`, JSON.stringify({ hostId: myId, ts: Date.now(), info: getInfo() }), { retain: true });
  publishInfo();
  await new Promise(r => setTimeout(r, 800)); // si dos crean la misma sala a la vez, gana el id menor
  if (other && other.hostId < myId) { mq.end(); throw 'ocupada'; }
  if (other) publishInfo(); // ganamos: que el estado retenido sea el nuestro

  const guests = new Map(); // id -> { fire(ev, data), last }
  const toGuest = (id, m) => mq.publish(`${T(n)}/c/${id}`, JSON.stringify(m));
  mq.on('message', (topic, msg) => {
    if (topic !== `${T(n)}/host`) return;
    const m = parse(msg); if (!m?.from) return;
    const g = guests.get(m.from);
    if (m.t === 'hello' && !g) {
      const h = { data: [], close: [] };
      let closed = false;
      const conn = {
        meta: m.meta || {},
        send: d => { if (!closed) toGuest(m.from, { t: 'data', d }); },
        close: () => { if (closed) return; toGuest(m.from, { t: 'bye' }); fire(); },
        on: (ev, fn) => h[ev].push(fn),
      };
      const fire = () => { if (closed) return; closed = true; guests.delete(m.from); h.close.forEach(f => f()); };
      guests.set(m.from, { h, fire, last: Date.now() });
      toGuest(m.from, { t: 'accept' });
      onConn(conn);
      return;
    }
    if (!g) return;
    g.last = Date.now();
    if (m.t === 'data') g.h.data.forEach(f => f(m.d));
    if (m.t === 'bye') g.fire();
  });
  await mq.subscribe(`${T(n)}/host`);
  const beat = setInterval(() => { // latido: la sala sigue viva; y fuera los invitados mudos
    publishInfo();
    for (const [id, g] of guests) { toGuest(id, { t: 'ping' }); if (Date.now() - g.last > 45000) g.fire(); }
  }, 15000);
  mq.on('close', () => { clearInterval(beat); for (const g of [...guests.values()]) g.fire(); });
  return {
    update: publishInfo,
    close: () => {
      clearInterval(beat);
      for (const [id, g] of [...guests]) { toGuest(id, { t: 'bye' }); g.fire(); }
      mq.publish(`${T(n)}/info`, '', { retain: true }); // borra la sala de la lista
      setTimeout(() => mq.end(), 200);
    },
  };
}

// ---------- Unirse a una sala ----------
export async function joinRoom(n, meta, timeout = 10000) {
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
  const myId = newId();
  const mq = await connectBroker({ will: { topic: `${T(n)}/host`, payload: JSON.stringify({ t: 'bye', from: myId }) } });
  const h = { data: [], close: [] };
  let accepted = false, closed = false, last = Date.now(), roomSeen = false;
  const fire = () => { if (closed) return; closed = true; clearInterval(beat); h.close.forEach(f => f()); mq.end(); };
  const toHost = m => mq.publish(`${T(n)}/host`, JSON.stringify({ ...m, from: myId }));
  let onAccept = null;
  mq.on('message', (topic, msg, retained) => {
    if (topic === `${T(n)}/info`) { // la sala desaparece (el anfitrión se fue): cerramos
      if (msg) roomSeen = true;
      else if (accepted && !retained) fire();
      return;
    }
    if (topic !== `${T(n)}/c/${myId}`) return;
    const m = parse(msg); if (!m) return;
    last = Date.now();
    if (m.t === 'accept' && !accepted) { accepted = true; onAccept?.(); }
    else if (m.t === 'data') h.data.forEach(f => f(m.d));
    else if (m.t === 'bye') fire();
  });
  const beat = setInterval(() => {
    if (!accepted) return;
    toHost({ t: 'ping' });
    if (Date.now() - last > 45000) fire(); // el anfitrión no da señales
  }, 10000);
  mq.on('close', fire);
  await mq.subscribe(`${T(n)}/c/${myId}`);
  await mq.subscribe(`${T(n)}/info`);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { clearInterval(beat); closed = true; mq.end(); reject(roomSeen ? 'sin-respuesta' : 'libre'); }, timeout);
    onAccept = () => {
      clearTimeout(t);
      resolve({
        meta: {},
        send: d => { if (!closed) toHost({ t: 'data', d }); },
        close: () => { if (closed) return; toHost({ t: 'bye' }); setTimeout(fire, 100); },
        on: (ev, fn) => h[ev].push(fn),
      });
    };
    toHost({ t: 'hello', meta });
  });
}

// ---------- Lista de salas ----------
// Lee los estados retenidos de todas las salas: [{ n, state: 'room'|'free'|'error', info }]
export async function probeRooms() {
  const range = Array.from({ length: NUM_ROOMS }, (_, i) => i + 1);
  if (LOCAL) {
    const ask = n => joinRoom(n, { probe: true }, 7000).then(conn => new Promise(res => {
      const t = setTimeout(() => { conn.close(); res({ n, state: 'noanswer', info: null }); }, 3000);
      conn.on('data', d => { if (d?.k === 'info') { clearTimeout(t); conn.close(); res({ n, state: 'room', info: d.info }); } });
    })).catch(() => ({ n, state: 'free', info: null }));
    return Promise.all(range.map(ask));
  }
  let mq;
  try { mq = await connectBroker({}); } catch { return range.map(n => ({ n, state: 'error', info: null })); }
  const found = {};
  mq.on('message', (topic, msg) => {
    const m = /\/sala\/(\d+)\/info$/.exec(topic); if (!m) return;
    const d = msg ? parse(msg) : null;
    if (d?.info && Date.now() - (d.ts || 0) < 10 * 60 * 1000) found[m[1]] = d.info; else delete found[m[1]];
  });
  await mq.subscribe(`ek3d/${NET_APP}/v2/sala/+/info`);
  await new Promise(r => setTimeout(r, 1500)); // los retenidos llegan enseguida
  mq.end();
  return range.map(n => found[n] ? { n, state: 'room', info: found[n] } : { n, state: 'free', info: null });
}
