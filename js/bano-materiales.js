// Materiales del baño (claves propias para no chocar con las de la cocina) y sus texturas procedurales:
// alicatados con junta (30×60, 60×120, metro, hexagonal), plato extraplano tipo pizarra, porcelana, grifería…
// Sin filtros de desenfoque: los lienzos son de CPU.
import * as THREE from 'three';
import * as T from './texturas.js';
import { SERIES, COLORES_PLATO, COLORES_AZULEJO, SUELOS_BANO, PAREDES_BANO } from './bano-modelo.js';

const cache = new Map();
const una = (clave, fn) => { if (!cache.has(clave)) cache.set(clave, fn()); return cache.get(clave); };

function lienzo(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mul = (c, k) => c.map(v => Math.max(0, Math.min(255, v * k)));

function grano(g, w, h, r, amp) {
  const img = g.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

// ---------- Alicatado ----------
// Pinta piezas (polígonos) sobre tres lienzos: color, alturas (bisel → normal) y rugosidad (pieza brillante, junta mate).
function pintarPiezas(W, H, piezas, base, junta, r, { brillo = 26, bisel = 4 } = {}) {
  const [c, g] = lienzo(W, H), [ch, gh] = lienzo(W, H), [cr, gr] = lienzo(W, H);
  const oscura = (base[0] + base[1] + base[2]) / 3 < 110;
  g.fillStyle = rgba(oscura ? mul(base, 0.8) : mul(base, 0.83)); g.fillRect(0, 0, W, H);
  gh.fillStyle = '#000'; gh.fillRect(0, 0, W, H);
  gr.fillStyle = 'rgb(235,235,235)'; gr.fillRect(0, 0, W, H);
  const camino = (ctx, pts, enc = 0) => {
    // encoger el polígono `enc` píxeles por eje (exacto en rectángulos, aproximado en hexágonos) para dejar la junta
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const mx = Math.max(...pts.map(p => Math.abs(p[0] - cx))) || 1, my = Math.max(...pts.map(p => Math.abs(p[1] - cy))) || 1;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const dx = x - cx, dy = y - cy;
      const px = x - Math.sign(dx) * enc * Math.abs(dx) / mx, py = y - Math.sign(dy) * enc * Math.abs(dy) / my;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
  };
  for (const pts of piezas) {
    const tono = mul(base, 0.965 + r() * 0.06);
    for (const [ox, oy] of [[0, 0], [-W, 0], [W, 0], [0, -H], [0, H]]) {
      const q = pts.map(([x, y]) => [x + ox, y + oy]);
      if (q.every(([x]) => x < -2 || x > W + 2) || q.every(([, y]) => y < -2 || y > H + 2)) continue;
      camino(g, q, junta / 2); g.fillStyle = rgba(tono); g.fill();
      // nube suave por pieza (porcelánico) sin filtros: un degradado radial grande
      const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cy = q.reduce((s, p) => s + p[1], 0) / q.length;
      const R = Math.max(...q.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      const rg = g.createRadialGradient(cx + (r() - 0.5) * R, cy + (r() - 0.5) * R, 0, cx, cy, R);
      rg.addColorStop(0, rgba(mul(tono, 1.03), 0.5)); rg.addColorStop(1, rgba(mul(tono, 0.97), 0));
      g.fillStyle = rg; camino(g, q, junta / 2); g.fill();
      for (let b = 0; b < bisel; b++) { const v = 120 + b * (135 / bisel); gh.fillStyle = `rgb(${v},${v},${v})`; camino(gh, q, junta / 2 + b); gh.fill(); }
      gr.fillStyle = `rgb(${brillo},${brillo},${brillo})`; camino(gr, q, junta / 2); gr.fill();
    }
  }
  grano(g, W, H, r, 5);
  return [c, ch, cr];
}

const TEX_ALICATADO = {
  // 60 ancho × 30 alto, junta corrida; el lienzo cubre 1,2 × 0,6 m
  r30x60: () => ({ W: 1024, H: 512, m: [1.2, 0.6], piezas: rejilla(1024, 512, 2, 2, 0) }),
  // 60 ancho × 120 alto; el lienzo cubre 1,2 × 2,4 m
  r60x120: () => ({ W: 512, H: 1024, m: [1.2, 2.4], piezas: rejilla(512, 1024, 2, 2, 0) }),
  hexagonal: () => {
    // hexágonos de 20 cm de punta a punta (lado 10 cm), punta arriba; celda repetible √3·s × 3·s
    const s = 0.1, cw = Math.sqrt(3) * s, chh = 3 * s;
    const m = [cw * 3, chh * 2]; const W = 920, H = Math.round(W * m[1] / m[0]);
    const px = W / m[0];
    const piezas = [];
    for (let fila = -1; fila < 5; fila++) for (let col = -1; col < 4; col++) {
      const cx = (col * cw + (fila % 2 ? cw / 2 : 0)) * px, cy = fila * 1.5 * s * px;
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; pts.push([cx + Math.cos(a) * s * px, cy + Math.sin(a) * s * px]); }
      piezas.push(pts);
    }
    return { W, H, m, piezas, junta: 0.35 * px / 100 };
  },
};
function rejilla(W, H, nx, ny, desfase) {
  const out = [], w = W / nx, h = H / ny;
  for (let j = 0; j < ny; j++) for (let i = -1; i <= nx; i++) {
    const x = i * w + (j % 2) * desfase * w, y = j * h;
    out.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  }
  return out;
}

export function texAlicatado(tipo, color) {
  return T.cacheada(`alicatado:${tipo}:${color}`, () => {
    if (tipo === 'metro') return T.azulejoMetro(color);
    const def = (TEX_ALICATADO[tipo] || TEX_ALICATADO.r30x60)();
    const pxcm = def.W / (def.m[0] * 100);
    const junta = 0.25 * pxcm;
    const [c, ch, cr] = pintarPiezas(def.W, def.H, def.piezas, hex(color), Math.max(2, junta), T.rng(tipo.length * 13 + 5), { bisel: tipo === 'hexagonal' ? 3 : 4 });
    return { map: T.aTextura(c, def.m), normalMap: T.aTextura(T.normalDesde(ch, 2.2), def.m, false), roughnessMap: T.aTextura(cr, def.m, false) };
  });
}

// ---------- Plato extraplano tipo pizarra ----------
export function texPizarra(color) {
  return T.cacheada(`pizarra:${color}`, () => {
    const r = T.rng(77); const N = 512; const base = hex(color);
    const [c, g] = lienzo(N, N), [ch, gh] = lienzo(N, N);
    g.fillStyle = rgba(base); g.fillRect(0, 0, N, N);
    gh.fillStyle = 'rgb(128,128,128)'; gh.fillRect(0, 0, N, N);
    // lajas: bandas alargadas y suaves en una dirección, como la piedra exfoliada
    for (let i = 0; i < 260; i++) {
      const x = r() * N, y = r() * N, L = 40 + r() * 220, A = 4 + r() * 26, ang = -0.25 + (r() - 0.5) * 0.3;
      const claro = r() < 0.5, v = claro ? 150 + r() * 60 : 70 + r() * 50;
      for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
        gh.save(); gh.translate(x + ox, y + oy); gh.rotate(ang);
        const gr = gh.createLinearGradient(0, -A, 0, A); gr.addColorStop(0, `rgba(${v},${v},${v},0)`); gr.addColorStop(0.5, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        gh.fillStyle = gr; gh.fillRect(-L / 2, -A, L, 2 * A); gh.restore();
        g.save(); g.translate(x + ox, y + oy); g.rotate(ang);
        g.fillStyle = rgba(mul(base, claro ? 1.05 : 0.95), 0.18); g.fillRect(-L / 2, -A / 2, L, A); g.restore();
      }
    }
    grano(gh, N, N, r, 40);
    grano(g, N, N, r, 9);
    const m = [0.5, 0.5];
    return { map: T.aTextura(c, m), normalMap: T.aTextura(T.normalDesde(ch, 1.6), m, false) };
  });
}

// ---------- Metales ----------
function metal(acabado) {
  return una('metal:' + acabado, () => {
    if (acabado === 'negro') return new THREE.MeshStandardMaterial({ color: '#1c1c1d', metalness: 0.45, roughness: 0.5 });
    if (acabado === 'oro') return new THREE.MeshStandardMaterial({ color: '#c8a46a', metalness: 1, roughness: 0.9, roughnessMap: T.cepillado([0.15, 0.15]) });
    return new THREE.MeshStandardMaterial({ color: '#e6e7e9', metalness: 1, roughness: 0.06 });
  });
}

function frente(serieId) {
  const s = SERIES[serieId] || SERIES.cadiz;
  return una('frenteBano:' + serieId, () => {
    if (s.tipo === 'madera') {
      const t = T.madera(s.color, serieId.length * 17 + 3);
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, roughness: 1.1, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 0.12, clearcoatRoughness: 0.5 });
    }
    if (s.brillo) return new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
    return new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 1, roughnessMap: T.ruidoRugosidad(150, 25), sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color(s.color) });
  });
}

// Mapa de materiales para construirBano + construirSalaBano. `estado` es el del baño (bano-modelo).
export function materialesBano(e) {
  const est = e.estilo;
  const m = {};
  const ali = COLORES_AZULEJO[est.colorAzulejo] || COLORES_AZULEJO.blanco;
  m.alicatado = una(`alicatado:${est.revestimiento}:${ali.color}`, () => {
    const t = texAlicatado(est.revestimiento, ali.color);
    return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8), clearcoat: 0.35, clearcoatRoughness: 0.08 });
  });
  const su = SUELOS_BANO[est.suelo] || SUELOS_BANO.gris;
  m.sueloBano = una('sueloBano:' + est.suelo, () => {
    if (est.suelo === 'madera') { const t = T.tarima(su.color); return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.35 }); }
    const t = T.porcelanico(su.color);
    return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 0.85, normalScale: new THREE.Vector2(0.6, 0.6) });
  });
  const pa = PAREDES_BANO[est.pared] || PAREDES_BANO.blanco;
  m.paredBano = una('paredBano:' + est.pared, () => new THREE.MeshStandardMaterial({ color: pa.color, roughness: 1, roughnessMap: T.ruidoRugosidad(235, 12, [0.8, 0.8]) }));
  m.techoBano = una('techoBano', () => new THREE.MeshStandardMaterial({ color: '#f4f3f0', roughness: 0.95 }));
  m.forjado = una('forjado', () => new THREE.MeshStandardMaterial({ color: '#9a978f', roughness: 1 }));
  m.porcelana = una('porcelana', () => new THREE.MeshPhysicalMaterial({ color: '#f7f7f4', roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }));
  m.encimeraBano = una('encimeraBano', () => new THREE.MeshPhysicalMaterial({ color: '#efeeea', roughness: 0.38, roughnessMap: T.ruidoRugosidad(150, 20) }));
  m.griferia = metal(est.griferia);
  m.manilla = metal('cromo');
  // cada pieza puede llevar su acabado; para no multiplicar mallas, mampara y radiador usan el del primero que haya
  const ducha = e.elementos.find(q => q.tipo === 'ducha' || q.tipo === 'banera');
  m.perfilMampara = metal(ducha?.perfil || est.griferia);
  const rad = e.elementos.find(q => q.tipo === 'radiador');
  m.radiador = rad?.acabado === 'griferia' ? m.griferia : una('radiadorBlanco', () => new THREE.MeshPhysicalMaterial({ color: '#f2f2f0', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
  const mu = e.elementos.find(q => q.tipo === 'mueble');
  m.frenteBano = frente(mu?.serie || 'bormujos');
  const pl = e.elementos.find(q => q.tipo === 'ducha');
  const cp = (COLORES_PLATO[pl?.color] || COLORES_PLATO.blanco).color;
  m.plato = una('plato:' + cp, () => { const t = texPizarra(cp); return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.78 }); });
  m.vidrioMampara = una('vidrioMampara', () => new THREE.MeshPhysicalMaterial({ color: '#f4fbfa', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide }));
  m.espejo = una('espejo', () => new THREE.MeshStandardMaterial({ color: '#d7dadb', metalness: 1, roughness: 0.015 }));
  m.ledBano = una('ledBano', () => new THREE.MeshBasicMaterial({ color: '#fff4e0' }));
  m.fondoOscuro = una('fondoOscuro', () => new THREE.MeshStandardMaterial({ color: '#1d1d1e', roughness: 0.6 }));
  m.puerta = una('puerta', () => new THREE.MeshPhysicalMaterial({ color: '#f4f4f1', roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.2 }));
  m.marcoPuerta = una('marcoPuerta', () => new THREE.MeshStandardMaterial({ color: '#efefec', roughness: 0.4 }));
  m.carpinteria = una('carpinteria', () => new THREE.MeshStandardMaterial({ color: '#f3f3f1', roughness: 0.4 }));
  m.vidrioVentana = una('vidrioVentana', () => new THREE.MeshPhysicalMaterial({ color: '#eef2f3', roughness: 0.6, transmission: 0, transparent: true, opacity: 0.85 }));
  m.alfeizarBano = una('alfeizarBano', () => new THREE.MeshPhysicalMaterial({ map: T.cuarzo('#e9e7e2', 4).map, roughness: 0.3 }));
  m.downlightBano = una('downlightBano', () => new THREE.MeshBasicMaterial({ color: '#fff7ea' }));
  return m;
}
