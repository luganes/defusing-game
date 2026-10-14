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

// Se conecta a TODOS los repetidores a la vez y se queda con los que respondan.
// Así da igual que la red de alguien bloquee uno: con que coincidáis en uno, funciona.
const brokerUrl = b => (typeof b === 'string' ? b : b.url);
function connectAll(opts) {
  return new Promise((resolve, reject) => {
    const ok = []; let left = MQTT_BROKERS.length, done = false, grace = null;
    const finish = () => {
      if (done) return; done = true; clearTimeout(grace);
      ok.length ? resolve([...ok]) : reject('sin-red');
    };
    MQTT_BROKERS.forEach(b => {
      mqttConnect(brokerUrl(b), { clientId: 'ek3d-' + newId(), username: b.username, password: b.password, ...opts })
        .then(c => {
          if (done) { c.end(); return; } // llegó tarde: no hace falta
          c.broker = brokerUrl(b); ok.push(c);
          grace ||= setTimeout(finish, 2500); // tras el primero, damos un poco de margen al resto
        })
        .catch(e => console.warn('[net] repetidor', brokerUrl(b), e))
        .finally(() => { if (--left === 0) finish(); });
    });
  });
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
  const mqs = await connectAll({ will: { topic: `${T(n)}/info`, payload: '', retain: true } });
  // ¿Hay ya alguien en esta sala? (el mensaje retenido llega nada más suscribirse)
  let other = null;
  mqs.forEach(mq => mq.on('message', (topic, msg) => {
    if (topic !== `${T(n)}/info`) return;
    const d = parse(msg);
    if (d?.hostId && d.hostId !== myId) other = d;
  }));
  await Promise.all(mqs.map(mq => mq.subscribe(`${T(n)}/info`)));
  await new Promise(r => setTimeout(r, 1200));
  if (other) { mqs.forEach(mq => mq.end()); throw 'ocupada'; }
  const publishInfo = () => {
    const msg = JSON.stringify({ hostId: myId, ts: Date.now(), info: getInfo() });
    mqs.forEach(mq => mq.publish(`${T(n)}/info`, msg, { retain: true }));
  };
  publishInfo();
  await new Promise(r => setTimeout(r, 800)); // si dos crean la misma sala a la vez, gana el id menor
  if (other && other.hostId < myId) { mqs.forEach(mq => mq.end()); throw 'ocupada'; }
  if (other) publishInfo(); // ganamos: que el estado retenido sea el nuestro

  const guests = new Map(); // id -> { h, fire, last, mq }
  const toGuest = (id, m) => guests.get(id)?.mq.publish(`${T(n)}/c/${id}`, JSON.stringify(m));
  mqs.forEach(mq => mq.on('message', (topic, msg) => {
    if (topic !== `${T(n)}/host`) return;
    const m = parse(msg); if (!m?.from) return;
    const g = guests.get(m.from);
    if (m.t === 'hello' && !g) {
      const h = { data: [], close: [] };
      let closed = false;
      const id = m.from;
      const conn = {
        meta: m.meta || {},
        send: d => { if (!closed) toGuest(id, { t: 'data', d }); },
        close: () => { if (closed) return; toGuest(id, { t: 'bye' }); fire(); },
        on: (ev, fn) => h[ev].push(fn),
      };
      const fire = () => { if (closed) return; closed = true; guests.delete(id); h.close.forEach(f => f()); };
      guests.set(id, { h, fire, last: Date.now(), mq }); // se le contesta por el mismo repetidor
      toGuest(id, { t: 'accept' });
      onConn(conn);
      return;
    }
    if (!g || g.mq !== mq) return;
    g.last = Date.now();
    if (m.t === 'data') g.h.data.forEach(f => f(m.d));
    if (m.t === 'bye') g.fire();
  }));
  await Promise.all(mqs.map(mq => mq.subscribe(`${T(n)}/host`)));
  const beat = setInterval(() => { // latido: la sala sigue viva; y fuera los invitados mudos
    publishInfo();
    for (const [id, g] of guests) { toGuest(id, { t: 'ping' }); if (Date.now() - g.last > 45000) g.fire(); }
  }, 15000);
  mqs.forEach(mq => mq.on('close', () => { for (const g of [...guests.values()]) if (g.mq === mq) g.fire(); }));
  return {
    update: publishInfo,
    close: () => {
      clearInterval(beat);
      for (const [id, g] of [...guests]) { toGuest(id, { t: 'bye' }); g.fire(); }
      mqs.forEach(mq => mq.publish(`${T(n)}/info`, '', { retain: true })); // borra la sala de la lista
      setTimeout(() => mqs.forEach(mq => mq.end()), 200);
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
  const all = await connectAll({ will: { topic: `${T(n)}/host`, payload: JSON.stringify({ t: 'bye', from: myId }) } });
  // ¿En qué repetidor está la sala? Nos quedamos con el primero que la tenga.
  const mq = await new Promise(res => {
    let done = false;
    const pick = c => { if (done) return; done = true; clearTimeout(t); res(c); };
    const t = setTimeout(() => pick(null), 4000);
    all.forEach(c => {
      c.on('message', (topic, msg) => { if (topic === `${T(n)}/info` && parse(msg)?.hostId) pick(c); });
      c.subscribe(`${T(n)}/info`);
    });
  });
  all.forEach(c => { if (c !== mq) c.end(); });
  if (!mq) throw 'libre';
  const h = { data: [], close: [] };
  let accepted = false, closed = false, last = Date.now();
  const fire = () => { if (closed) return; closed = true; clearInterval(beat); h.close.forEach(f => f()); mq.end(); };
  const toHost = m => mq.publish(`${T(n)}/host`, JSON.stringify({ ...m, from: myId }));
  let onAccept = null;
  mq.on('message', (topic, msg, retained) => {
    if (topic === `${T(n)}/info`) { // la sala desaparece (el anfitrión se fue): cerramos
      if (!msg && accepted && !retained) fire();
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
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { clearInterval(beat); closed = true; mq.end(); reject('sin-respuesta'); }, timeout);
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
  let all;
  try { all = await connectAll({}); } catch { return range.map(n => ({ n, state: 'error', info: null })); }
  const found = {}; // sala -> info (de cualquier repetidor)
  all.forEach(mq => mq.on('message', (topic, msg) => {
    const m = /\/sala\/(\d+)\/info$/.exec(topic); if (!m) return;
    const d = msg ? parse(msg) : null;
    if (d?.info && Date.now() - (d.ts || 0) < 10 * 60 * 1000) found[m[1]] = d.info;
  }));
  await Promise.all(all.map(mq => mq.subscribe(`ek3d/${NET_APP}/v2/sala/+/info`)));
  await new Promise(r => setTimeout(r, 1500)); // los retenidos llegan enseguida
  all.forEach(mq => mq.end());
  return range.map(n => found[n] ? { n, state: 'room', info: found[n] } : { n, state: 'free', info: null });
}
