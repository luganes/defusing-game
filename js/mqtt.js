// ================= Cliente MQTT mínimo (3.1.1 sobre WebSocket) =================
// Solo lo que necesita el juego: conectar (con "último mensaje" si se cae), suscribirse,
// publicar (QoS 0, con o sin retener) y mantener viva la conexión.
// No hace falta ninguna librería externa.

const te = new TextEncoder(), td = new TextDecoder();

function varint(n) { // longitud restante
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
  return out;
}
const str = s => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const bin = b => [b.length >> 8, b.length & 255, ...b];
const packet = (first, body) => new Uint8Array([first, ...varint(body.length), ...body]);

export function mqttConnect(url, { clientId, will = null, keepalive = 20, timeout = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url, 'mqtt'); } catch (e) { reject(e); return; }
    ws.binaryType = 'arraybuffer';
    const h = { message: [], close: [] };
    const subs = new Map(); // id -> resolve
    let buf = new Uint8Array(0), connected = false, closed = false, lastIn = Date.now(), nextId = 1, pingT = null;
    const fail = why => { if (!connected) { closed = true; try { ws.close(); } catch {} reject(why); } };
    const t = setTimeout(() => fail('timeout'), timeout);
    const send = p => { if (ws.readyState === 1) ws.send(p); };
    const shut = () => {
      if (closed) return; closed = true; clearInterval(pingT);
      try { ws.close(); } catch {}
      if (connected) h.close.forEach(f => f());
    };

    ws.onopen = () => {
      let flags = 0x02; // sesión limpia
      const payload = [...str(clientId)];
      if (will) {
        flags |= 0x04 | (will.retain ? 0x20 : 0);
        payload.push(...str(will.topic), ...bin(te.encode(will.payload || '')));
      }
      send(packet(0x10, [...str('MQTT'), 4, flags, keepalive >> 8, keepalive & 255, ...payload]));
    };
    ws.onerror = () => fail('error');
    ws.onclose = () => { clearTimeout(t); if (!connected) fail('cerrado'); else shut(); };
    ws.onmessage = e => {
      lastIn = Date.now();
      const chunk = new Uint8Array(e.data), nb = new Uint8Array(buf.length + chunk.length);
      nb.set(buf); nb.set(chunk, buf.length); buf = nb;
      for (;;) { // puede llegar más de un paquete (o medio) por mensaje
        if (buf.length < 2) return;
        let len = 0, mul = 1, i = 1, b;
        do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
        if (buf.length < i + len) return;
        const type = buf[0] >> 4, fl = buf[0] & 15, body = buf.subarray(i, i + len);
        buf = buf.slice(i + len);
        handle(type, fl, body);
      }
    };
    function handle(type, fl, body) {
      if (type === 2) { // CONNACK
        clearTimeout(t);
        if (body[1] !== 0) { fail('rechazado ' + body[1]); return; }
        connected = true;
        pingT = setInterval(() => {
          if (Date.now() - lastIn > keepalive * 1500) { shut(); return; } // el servidor no contesta
          send(new Uint8Array([0xC0, 0]));
        }, keepalive * 500);
        resolve(api);
      } else if (type === 3) { // PUBLISH
        const qos = (fl >> 1) & 3, retained = !!(fl & 1);
        const tl = (body[0] << 8) | body[1];
        const topic = td.decode(body.subarray(2, 2 + tl));
        let p = 2 + tl;
        if (qos > 0) { const id = (body[p] << 8) | body[p + 1]; p += 2; send(new Uint8Array([0x40, 2, id >> 8, id & 255])); }
        const msg = td.decode(body.subarray(p));
        h.message.forEach(f => f(topic, msg, retained));
      } else if (type === 9) { // SUBACK
        const id = (body[0] << 8) | body[1];
        subs.get(id)?.(); subs.delete(id);
      }
      // PINGRESP (13) y demás: nada
    }
    const api = {
      publish(topic, payload, { retain = false } = {}) {
        send(packet(0x30 | (retain ? 1 : 0), [...str(topic), ...te.encode(payload)]));
      },
      subscribe(filter) {
        const id = nextId++; if (nextId > 65000) nextId = 1;
        send(packet(0x82, [id >> 8, id & 255, ...str(filter), 0]));
        return new Promise(res => { subs.set(id, res); setTimeout(res, 4000); });
      },
      on(ev, fn) { h[ev].push(fn); },
      end() { send(new Uint8Array([0xE0, 0])); setTimeout(shut, 50); }, // salida limpia: no salta el "último mensaje"
      get open() { return connected && !closed; },
    };
  });
}
