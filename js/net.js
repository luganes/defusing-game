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

// ---------- Enlace con un repetidor que se reconecta solo ----------
// Si la conexión se cae (wifi que parpadea, móvil que bloquea la pantalla, el repetidor
// la corta...), vuelve a conectar sola, se suscribe otra vez y envía lo que quedó pendiente.
const brokerUrl = b => (typeof b === 'string' ? b : b.url);
function makeLink(b, client) {
  const url = brokerUrl(b);
  const h = { message: [], up: [], down: [] };
  const subs = new Set(), queue = [];
  let mq = client, closed = false, retry = null, tries = 0, will = client._will;
  const wire = c => {
    c.on('message', (t, m, r) => h.message.forEach(f => f(t, m, r)));
    c.on('close', () => { if (mq !== c || closed) return; mq = null; h.down.forEach(f => f()); reconnect(); });
  };
  const reconnect = () => {
    if (closed || retry) return;
    const wait = Math.min(1000 * 2 ** tries, 8000); tries++;
    retry = setTimeout(async () => {
      retry = null;
      try {
        const c = await mqttConnect(url, { clientId: 'ek3d-' + newId(), username: b.username, password: b.password, will });
        if (closed) { c.end(); return; }
        mq = c; tries = 0; wire(c);
        await Promise.all([...subs].map(f => c.subscribe(f)));
        while (queue.length && mq === c) { const [t, m, o] = queue.shift(); c.publish(t, m, o); }
        h.up.forEach(f => f());
      } catch { reconnect(); }
    }, wait);
  };
  wire(client);
  // al volver a la pestaña (móvil), comprobar enseguida
  const vis = () => { if (document.visibilityState === 'visible' && !mq && !closed) { clearTimeout(retry); retry = null; tries = 0; reconnect(); } };
  document.addEventListener('visibilitychange', vis);
  return {
    broker: url,
    get up() { return !!mq?.open; },
    on(ev, fn) { h[ev].push(fn); },
    setWill(w) { will = w; },
    subscribe(f) { subs.add(f); return mq ? mq.subscribe(f) : Promise.resolve(); },
    publish(t, m, o = {}) {
      if (mq?.open) mq.publish(t, m, o);
      else if (!o.retain) { queue.push([t, m, o]); if (queue.length > 300) queue.shift(); }
    },
    end() { closed = true; clearTimeout(retry); document.removeEventListener('visibilitychange', vis); mq?.end(); mq = null; },
  };
}

// Se conecta a TODOS los repetidores a la vez y se queda con los que respondan.
// Así da igual que la red de alguien bloquee uno: con que coincidáis en uno, funciona.
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
          c._will = opts.will; ok.push(makeLink(b, c));
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
  const h = { data: [], close: [], resync: [] };
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

  const guests = new Map(); // id -> { h, fire, last, mq, lostAt }
  const toGuest = (id, m) => guests.get(id)?.mq.publish(`${T(n)}/c/${id}`, JSON.stringify(m));
  mqs.forEach(mq => mq.on('message', (topic, msg) => {
    if (topic !== `${T(n)}/host`) return;
    const m = parse(msg); if (!m?.from) return;
    const g = guests.get(m.from);
    if (m.t === 'hello' && g) { // vuelve tras un corte: mismo asiento, le reenviamos todo
      g.mq = mq; g.last = Date.now(); g.lostAt = 0;
      toGuest(m.from, { t: 'accept' });
      g.h.resync.forEach(f => f());
      return;
    }
    if (m.t === 'hello' && !m.resume) {
      const h = { data: [], close: [], resync: [] };
      let closed = false;
      const id = m.from;
      const conn = {
        meta: m.meta || {},
        send: d => { if (!closed) toGuest(id, { t: 'data', d }); },
        close: () => { if (closed) return; toGuest(id, { t: 'bye' }); fire(); },
        on: (ev, fn) => h[ev].push(fn),
      };
      const fire = () => { if (closed) return; closed = true; guests.delete(id); h.close.forEach(f => f()); };
      guests.set(id, { h, fire, last: Date.now(), mq, lostAt: 0 }); // se le contesta por el mismo repetidor
      toGuest(id, { t: 'accept' });
      onConn(conn);
      return;
    }
    if (m.t === 'hello' && m.resume) { toGuest2(mq, m.from, { t: 'bye' }); return; } // ya no estaba: que vuelva a entrar
    if (!g) return;
    g.last = Date.now(); g.lostAt = 0;
    if (m.t === 'data') g.h.data.forEach(f => f(m.d));
    if (m.t === 'bye') g.fire();               // se fue a propósito
    if (m.t === 'gone') g.lostAt = Date.now(); // se le cortó: le esperamos un rato
  }));
  const toGuest2 = (mq, id, m) => mq.publish(`${T(n)}/c/${id}`, JSON.stringify(m));
  await Promise.all(mqs.map(mq => mq.subscribe(`${T(n)}/host`)));
  mqs.forEach(mq => mq.on('up', publishInfo)); // tras reconectar, la sala vuelve a la lista
  const beat = setInterval(() => { // latido: la sala sigue viva; y fuera quien lleve mucho sin dar señales
    publishInfo();
    const now = Date.now();
    for (const [id, g] of guests) {
      toGuest(id, { t: 'ping' });
      if (now - g.last > 120000 || (g.lostAt && now - g.lostAt > 90000)) g.fire();
    }
  }, 15000);
  return {
    update: publishInfo,
    close: () => {
      clearInterval(beat);
      for (const [id, g] of [...guests]) { toGuest(id, { t: 'bye' }); g.fire(); }
      mqs.forEach(mq => mq.publish(`${T(n)}/info`, '', { retain: true })); // borra la sala de la lista
      setTimeout(() => mqs.forEach(mq => mq.end()), 300);
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
  const will = { topic: `${T(n)}/host`, payload: JSON.stringify({ t: 'gone', from: myId }) };
  // ¿En qué repetidor está la sala? Nos quedamos con el primero que la tenga.
  const findRoom = async () => {
    const all = await connectAll({ will });
    const found = await new Promise(res => {
      let done = false;
      const pick = c => { if (done) return; done = true; clearTimeout(t); res(c); };
      const t = setTimeout(() => pick(null), 4000);
      all.forEach(c => {
        c.on('message', (topic, msg) => { if (topic === `${T(n)}/info` && parse(msg)?.hostId) pick(c); });
        c.subscribe(`${T(n)}/info`);
      });
    });
    all.forEach(c => { if (c !== found) c.end(); });
    return found;
  };
  let mq = await findRoom();
  if (!mq) throw 'libre';
  const h = { data: [], close: [] };
  let accepted = false, closed = false, last = Date.now(), hostLostAt = 0, switching = false;
  const fire = () => { if (closed) return; closed = true; clearInterval(beat); h.close.forEach(f => f()); mq.end(); };
  const toHost = m => mq.publish(`${T(n)}/host`, JSON.stringify({ ...m, from: myId }));
  let onAccept = null;
  const listen = link => {
    link.on('message', (topic, msg) => {
      if (link !== mq) return;
      if (topic === `${T(n)}/info`) { // sin info = el anfitrión se cortó; le damos un rato para volver
        if (!msg) hostLostAt ||= Date.now(); else hostLostAt = 0;
        return;
      }
      if (topic !== `${T(n)}/c/${myId}`) return;
      const m = parse(msg); if (!m) return;
      last = Date.now(); hostLostAt = 0;
      if (m.t === 'accept' && !accepted) { accepted = true; onAccept?.(); }
      else if (m.t === 'data') h.data.forEach(f => f(m.d));
      else if (m.t === 'bye') fire();
    });
    link.on('up', () => { if (link === mq && accepted && !closed) toHost({ t: 'hello', resume: true }); }); // "sigo aquí"
    link.subscribe(`${T(n)}/c/${myId}`);
  };
  listen(mq);
  const beat = setInterval(async () => {
    if (!accepted || closed) return;
    toHost({ t: 'ping' });
    const now = Date.now();
    if (now - last > 120000 || (hostLostAt && now - hostLostAt > 60000)) { fire(); return; } // el anfitrión no vuelve
    // si nuestro repetidor lleva rato caído, probamos a encontrar la sala por otro
    if (!mq.up && now - last > 20000 && !switching) {
      switching = true;
      try {
        const other = await findRoom();
        if (other && !closed) { const old = mq; mq = other; listen(other); old.end(); toHost({ t: 'hello', resume: true }); }
        else other?.end();
      } catch {}
      switching = false;
    }
  }, 10000);
  await mq.subscribe(`${T(n)}/c/${myId}`);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { clearInterval(beat); closed = true; mq.end(); reject('sin-respuesta'); }, timeout);
    onAccept = () => {
      clearTimeout(t);
      resolve({
        meta: {},
        send: d => { if (!closed) toHost({ t: 'data', d }); },
        close: () => { if (closed) return; toHost({ t: 'bye' }); setTimeout(fire, 150); },
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
