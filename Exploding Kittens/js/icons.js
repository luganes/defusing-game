// ================= Logos de personaje (selección y etiqueta 3D) =================
// Un logo es un archivo de logos/ ("logos/naruto.png") o una bandera ("flag:ar").
// Las banderas se dibujan aquí en SVG. Los logos de series/empresas los pones tú
// en la carpeta logos/ (ver logos/LEEME.txt): si falta un archivo, no pasa nada.

const W = 30, H = 20;
const stripesH = cols => cols.map((c, i) =>
  `<rect x="0" y="${(H / cols.length) * i}" width="${W}" height="${H / cols.length + 0.05}" fill="${c}"/>`).join('');
const star = (cx, cy, r, fill) => { // estrella de 5 puntas
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};

const FLAGS = {
  do: '<rect width="30" height="20" fill="#ffffff"/><rect width="13.5" height="8.5" fill="#002d62"/>' +
      '<rect x="16.5" width="13.5" height="8.5" fill="#ce1126"/><rect y="11.5" width="13.5" height="8.5" fill="#ce1126"/>' +
      '<rect x="16.5" y="11.5" width="13.5" height="8.5" fill="#002d62"/><circle cx="15" cy="10" r="1.3" fill="#2d7d3a"/>',
  ar: stripesH(['#74acdf', '#ffffff', '#74acdf']) + '<circle cx="15" cy="10" r="2.6" fill="#f6b40e"/>',
  pt: '<rect width="30" height="20" fill="#da291c"/><rect width="12" height="20" fill="#046a38"/>' +
      '<circle cx="12" cy="10" r="4" fill="#ffe900"/><circle cx="12" cy="10" r="2.4" fill="#da291c"/>',
  es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  br: '<rect width="30" height="20" fill="#009c3b"/><polygon points="15,2 28,10 15,18 2,10" fill="#ffdf00"/>' +
      '<circle cx="15" cy="10" r="4.4" fill="#002776"/>',
  ru: stripesH(['#ffffff', '#0039a6', '#d52b1e']),
  il: '<rect width="30" height="20" fill="#ffffff"/><rect y="2" width="30" height="2.6" fill="#0038b8"/>' +
      '<rect y="15.4" width="30" height="2.6" fill="#0038b8"/>' +
      '<g fill="none" stroke="#0038b8" stroke-width="0.9"><polygon points="15,6 18.5,12 11.5,12"/><polygon points="15,14 18.5,8 11.5,8"/></g>',
  us: stripesH(Array.from({ length: 13 }, (_, i) => (i % 2 ? '#ffffff' : '#b22234'))) +
      '<rect width="13" height="10.8" fill="#3c3b6e"/>' +
      [[2.5, 2.5], [6.5, 2.5], [10.5, 2.5], [4.5, 5.4], [8.5, 5.4], [2.5, 8.3], [6.5, 8.3], [10.5, 8.3]]
        .map(([x, y]) => star(x, y, 1.1, '#ffffff')).join(''),
  ve: stripesH(['#ffcc00', '#00247d', '#cf142b']) +
      Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI * (0.15 + 0.7 * i / 7);
        return star(15 - Math.cos(a) * 5.2, 11.6 - Math.sin(a) * 4.2, 0.75, '#ffffff');
      }).join(''),
};

const flagURL = code => FLAGS[code]
  ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 4}" height="${H * 4}">${FLAGS[code]}</svg>`)
  : null;

const isFlag = spec => typeof spec === 'string' && spec.startsWith('flag:');
const logoURL = spec => !spec ? null : (isFlag(spec) ? flagURL(spec.slice(5)) : spec);

// Imagen del logo para el DOM. Si el archivo no existe se sustituye por `fallback()`
// (o desaparece si no hay fallback).
export function logoEl(spec, cls, fallback) {
  const url = logoURL(spec);
  if (!url) return fallback ? fallback() : document.createComment('sin logo');
  const img = document.createElement('img');
  img.className = cls + (isFlag(spec) ? ' flag' : '');
  img.alt = ''; img.draggable = false; img.src = url;
  img.onerror = () => { if (fallback) img.replaceWith(fallback()); else img.remove(); };
  return img;
}

// Para canvas (etiqueta 3D): promesa con la imagen ya cargada, o null si no hay logo.
const cache = {};
export function loadLogo(spec) {
  const url = logoURL(spec);
  if (!url) return Promise.resolve(null);
  if (!cache[url]) cache[url] = new Promise(res => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = () => res(null);
    img.src = url;
  });
  return cache[url];
}
