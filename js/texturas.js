// Texturas procedurales (propias, sin licencias). Cada textura sabe cuántos metros mide (repeat = 1/metros),
// porque las UV de la escena van en metros reales.
import * as THREE from 'three';

const cache = new Map();
export function cacheada(clave, fn) { if (!cache.has(clave)) cache.set(clave, fn()); return cache.get(clave); }

export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function lienzo(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mul = (c, k) => c.map(v => Math.max(0, Math.min(255, v * k)));

export function aTextura(canvas, metros = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / metros[0], 1 / metros[1]);
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Mapa de normales a partir de la luminancia de un lienzo de alturas (tileable).
export function normalDesde(canvas, fuerza = 2) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = lienzo(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * fuerza;
    const dy = (H(x, y + 1) - H(x, y - 1)) * fuerza;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    out.data[i] = (dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

function ruidoGrano(g, w, h, r, amp, alpha = 1) {
  const img = g.getImageData(0, 0, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp * alpha; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

function manchas(g, w, h, r, n, rad, colores, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, R = rad[0] + r() * (rad[1] - rad[0]);
    const c = colores[(r() * colores.length) | 0];
    const offX = [0, ...(x < R ? [w] : []), ...(x > w - R ? [-w] : [])];
    const offY = [0, ...(y < R ? [h] : []), ...(y > h - R ? [-h] : [])];
    for (const ox of offX) for (const oy of offY) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R);
      gr.addColorStop(0, rgba(c, alpha)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(x + ox - R, y + oy - R, R * 2, R * 2);
    }
  }
}

// ---------- Madera (veta vertical, en V) ----------
function pintarMadera(color, seed, N = 1024) {
  const r = rng(seed);
  const base = hex(color), osc = mul(base, 0.62), cla = mul(base, 1.14);
  const [c, g] = lienzo(N, N); const [cr, gr] = lienzo(N, N);
  g.fillStyle = rgba(base, 1); g.fillRect(0, 0, N, N);
  gr.fillStyle = 'rgb(150,150,150)'; gr.fillRect(0, 0, N, N);
  // bandas anchas de tono
  for (let i = 0; i < 26; i++) {
    const x = r() * N, w = 30 + r() * 140, oscura = r() < 0.5;
    const col = oscura ? osc : cla;
    for (const off of [-N, 0, N]) {
      const gg = g.createLinearGradient(x + off, 0, x + off + w, 0);
      gg.addColorStop(0, rgba(col, 0)); gg.addColorStop(0.5, rgba(col, 0.12)); gg.addColorStop(1, rgba(col, 0));
      g.fillStyle = gg; g.fillRect(x + off, 0, w, N);
    }
  }
  // vetas finas
  const veta = (ctx, col, x0, a1, f1, ph, a2, f2, lw, al) => {
    ctx.strokeStyle = col(al); ctx.lineWidth = lw;
    const offs = [0, ...(x0 < 14 ? [N] : []), ...(x0 > N - 14 ? [-N] : [])];
    for (const off of offs) {
      ctx.beginPath();
      for (let y = 0; y <= N; y += 8) {
        const x = x0 + off + Math.sin(y / N * Math.PI * 2 * f1 + ph) * a1 + Math.sin(y / N * Math.PI * 2 * f2 + ph * 2) * a2;
        y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  for (let i = 0; i < 900; i++) {
    const x0 = r() * N, a1 = 2 + r() * 7, f1 = 1 + ((r() * 2) | 0), ph = r() * 6.28, a2 = r() * 2.5, f2 = 3 + ((r() * 5) | 0);
    const lw = 0.4 + r() * r() * 2.6, al = 0.05 + r() * 0.2;
    veta(g, a => rgba(osc, a), x0, a1, f1, ph, a2, f2, lw, al);
    veta(gr, a => `rgba(205,205,205,${a})`, x0, a1, f1, ph, a2, f2, lw, al);
  }
  // catedrales (vetas en V)
  for (let k = 0; k < 5; k++) {
    const cx = r() * N, y0 = r() * N, w = 40 + r() * 70, alto = N * (0.25 + r() * 0.3);
    for (let j = 0; j < 9; j++) {
      const ww = w * (1 - j / 10), yy = y0 + j * 10;
      g.strokeStyle = rgba(osc, 0.14); g.lineWidth = 1.4; gr.strokeStyle = 'rgba(200,200,200,0.15)'; gr.lineWidth = 1.4;
      for (const ctx of [g, gr]) for (const oy of [-N, 0, N]) {
        ctx.beginPath();
        for (let t = 0; t <= 1.001; t += 0.05) {
          const x = cx - ww * Math.sqrt(1 - t) , y = yy + oy + alto * t; t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        for (let t = 1; t >= -0.001; t -= 0.05) { const x = cx + ww * Math.sqrt(1 - t), y = yy + oy + alto * t; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
  }
  // poros
  for (let i = 0; i < 5000; i++) {
    const x = r() * N, y = r() * N, l = 2 + r() * 7;
    g.fillStyle = rgba(osc, 0.25); g.fillRect(x, y, 0.8, l);
    gr.fillStyle = 'rgba(225,225,225,0.4)'; gr.fillRect(x, y, 0.8, l);
  }
  ruidoGrano(g, N, N, r, 10);
  return [c, cr];
}

export function madera(color, seed = 7, metros = [0.8, 0.8]) {
  return cacheada(`madera:${color}:${seed}`, () => {
    const [c, cr] = pintarMadera(color, seed);
    return { map: aTextura(c, metros), roughnessMap: aTextura(cr, metros, false), normalMap: aTextura(normalDesde(cr, 1.2), metros, false) };
  });
}

// ---------- Mármol veteado ----------
export function marmol(seed = 3, metros = [1.6, 0.8]) {
  return cacheada(`marmol:${seed}`, () => {
    const r = rng(seed); const W = 2048, H = 1024;
    const [c, g] = lienzo(W, H);
    g.fillStyle = '#efedea'; g.fillRect(0, 0, W, H);
    manchas(g, W, H, r, 220, [60, 260], [[205, 202, 198], [225, 222, 218], [245, 244, 242]], 0.18);
    // sin filtros de desenfoque (en lienzos de CPU son carísimos): el halo sale de trazos anchos y transparentes
    const camino = (x, y, ang, pasos) => {
      const pts = [[x, y]];
      for (let i = 0; i < pasos; i++) { ang += (r() - 0.5) * 0.45; x += Math.cos(ang) * 7; y += Math.sin(ang) * 7; pts.push([x, y]); }
      return pts;
    };
    const trazo = (pts, ancho, col, alpha) => {
      g.strokeStyle = rgba(col, alpha); g.lineWidth = ancho; g.lineCap = 'round'; g.lineJoin = 'round';
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const offX = [0], offY = [0];
      if (Math.min(...xs) < 40) offX.push(W); if (Math.max(...xs) > W - 40) offX.push(-W);
      if (Math.min(...ys) < 40) offY.push(H); if (Math.max(...ys) > H - 40) offY.push(-H);
      for (const ox of offX) for (const oy of offY) {
        g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke();
      }
    };
    for (let i = 0; i < 9; i++) {
      const ang = -0.5 + (r() - 0.5) * 0.6;
      const pts = camino(r() * W, r() * H, ang, 140 + r() * 200);
      for (const [a, al] of [[26, 0.035], [16, 0.05], [8, 0.07]]) trazo(pts, a * (0.7 + r() * 0.6), [150, 146, 142], al);
      trazo(pts, 1.2 + r() * 1.6, [105, 100, 96], 0.55);
      for (let b = 0; b < 3; b++) { const p = pts[(r() * pts.length) | 0]; trazo(camino(p[0], p[1], ang + (r() - 0.5) * 1.6, 30 + r() * 60), 0.9, [120, 116, 112], 0.4); }
    }
    ruidoGrano(g, W, H, r, 6);
    return { map: aTextura(c, metros) };
  });
}

// ---------- Cuarzo / compacto con grano ----------
export function cuarzo(color, seed = 11, metros = [0.6, 0.6]) {
  return cacheada(`cuarzo:${color}:${seed}`, () => {
    const r = rng(seed); const N = 1024; const base = hex(color);
    const [c, g] = lienzo(N, N);
    g.fillStyle = rgba(base, 1); g.fillRect(0, 0, N, N);
    const oscuro = (base[0] + base[1] + base[2]) / 3 < 100;
    manchas(g, N, N, r, 60, [40, 160], [mul(base, 0.94), mul(base, 1.05)], 0.25);
    for (let i = 0; i < 26000; i++) {
      const x = r() * N, y = r() * N, rad = 0.4 + r() * r() * 1.8;
      const v = r();
      const col = oscuro ? (v < 0.6 ? [90, 90, 92] : v < 0.9 ? [40, 40, 42] : [200, 200, 205]) : (v < 0.6 ? [200, 198, 194] : v < 0.9 ? [170, 168, 165] : [130, 128, 125]);
      g.fillStyle = rgba(col, 0.35 + r() * 0.4); g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.fill();
    }
    ruidoGrano(g, N, N, r, 6);
    return { map: aTextura(c, metros) };
  });
}

// ---------- Cemento ----------
export function cemento(color, seed = 5, metros = [1, 1]) {
  return cacheada(`cemento:${color}:${seed}`, () => {
    const r = rng(seed); const N = 1024; const base = hex(color);
    const [c, g] = lienzo(N, N);
    g.fillStyle = rgba(base, 1); g.fillRect(0, 0, N, N);
    manchas(g, N, N, r, 300, [20, 140], [mul(base, 0.86), mul(base, 1.1), mul(base, 0.95)], 0.22);
    for (let i = 0; i < 4000; i++) { g.fillStyle = rgba(mul(base, 0.7), 0.3); g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2); }
    ruidoGrano(g, N, N, r, 14);
    return { map: aTextura(c, metros) };
  });
}

// ---------- Azulejo metro 7,5 x 15 ----------
export function azulejoMetro(color = '#f3f3f0', metros = [0.6, 0.3]) {
  return cacheada(`metro:${color}`, () => {
    const r = rng(21); const W = 1024, H = 512; // 60 x 30 cm → 4 columnas x 4 filas
    const pxcm = W / 60;
    const [c, g] = lienzo(W, H); const [ch, gh] = lienzo(W, H); const [cr, gr] = lienzo(W, H);
    const base = hex(color);
    g.fillStyle = '#c9c7c2'; g.fillRect(0, 0, W, H);
    gh.fillStyle = '#000'; gh.fillRect(0, 0, W, H);
    gr.fillStyle = 'rgb(230,230,230)'; gr.fillRect(0, 0, W, H);
    const junta = 0.2 * pxcm;
    for (let fila = 0; fila < 4; fila++) {
      const y = fila * 7.5 * pxcm, off = (fila % 2) * 7.5 * pxcm;
      for (let k = -1; k < 5; k++) {
        const x = k * 15 * pxcm + off;
        const tono = mul(base, 0.97 + r() * 0.05);
        const x0 = x + junta / 2, y0 = y + junta / 2, w = 15 * pxcm - junta, h = 7.5 * pxcm - junta;
        g.fillStyle = rgba(tono, 1); g.fillRect(x0, y0, w, h);
        // brillo del bisel
        const gg = g.createLinearGradient(0, y0, 0, y0 + h); gg.addColorStop(0, 'rgba(255,255,255,0.25)'); gg.addColorStop(0.12, 'rgba(255,255,255,0)'); gg.addColorStop(0.88, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(0,0,0,0.10)');
        g.fillStyle = gg; g.fillRect(x0, y0, w, h);
        // alturas: bisel redondeado
        for (let b = 0; b < 6; b++) { const v = 90 + b * 33; gh.fillStyle = `rgb(${v},${v},${v})`; gh.fillRect(x0 + b, y0 + b, w - 2 * b, h - 2 * b); }
        gr.fillStyle = 'rgb(28,28,28)'; gr.fillRect(x0, y0, w, h);
      }
    }
    return { map: aTextura(c, metros), normalMap: aTextura(normalDesde(ch, 3), metros, false), roughnessMap: aTextura(cr, metros, false) };
  });
}

// ---------- Porcelánico 60 x 60 ----------
export function porcelanico(color, seed = 31, metros = [1.2, 1.2]) {
  return cacheada(`porcelanico:${color}`, () => {
    const r = rng(seed); const N = 1024; const base = hex(color); const px = N / 120;
    const [c, g] = lienzo(N, N); const [ch, gh] = lienzo(N, N); const [cr, gr] = lienzo(N, N);
    g.fillStyle = rgba(base, 1); g.fillRect(0, 0, N, N);
    manchas(g, N, N, r, 260, [15, 120], [mul(base, 0.92), mul(base, 1.06), mul(base, 0.97)], 0.25);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rgba(mul(base, r() < 0.5 ? 0.85 : 1.1), 0.35); g.fillRect(r() * N, r() * N, 1.2, 1.2); }
    ruidoGrano(g, N, N, r, 8);
    gh.fillStyle = '#fff'; gh.fillRect(0, 0, N, N);
    gr.fillStyle = 'rgb(95,95,95)'; gr.fillRect(0, 0, N, N);
    manchas(gr, N, N, r, 120, [30, 160], [[70, 70, 70], [130, 130, 130]], 0.3);
    const j = 0.25 * px;
    for (let k = 0; k <= 2; k++) {
      const p = k * 60 * px;
      // tono distinto por pieza
      for (let q = 0; q < 2; q++) { g.fillStyle = rgba(mul(base, 0.96 + r() * 0.06), 0.25); g.fillRect(q * 60 * px, (k % 2) * 60 * px, 60 * px, 60 * px); }
      for (const ctx of [g, gh, gr]) {
        ctx.fillStyle = ctx === g ? rgba(mul(base, 0.7), 1) : ctx === gh ? '#000' : 'rgb(235,235,235)';
        ctx.fillRect(p - j / 2, 0, j, N); ctx.fillRect(0, p - j / 2, N, j);
      }
    }
    return { map: aTextura(c, metros), normalMap: aTextura(normalDesde(ch, 2), metros, false), roughnessMap: aTextura(cr, metros, false) };
  });
}

// ---------- Tarima de roble (lamas 20 x 120) ----------
export function tarima(color = '#b48d62', metros = [1.2, 1.2]) {
  return cacheada(`tarima:${color}`, () => {
    const r = rng(41); const N = 1024; const px = N / 120;
    const [mc] = pintarMadera(color, 77, 1024);
    const [c, g] = lienzo(N, N); const [ch, gh] = lienzo(N, N);
    gh.fillStyle = '#fff'; gh.fillRect(0, 0, N, N);
    for (let col = 0; col < 6; col++) {
      const x = col * 20 * px, desfase = r() * 120 * px;
      for (let k = -1; k < 2; k++) {
        const y = k * 120 * px + desfase;
        g.save(); g.beginPath(); g.rect(x, y, 20 * px, 120 * px); g.clip();
        // la veta de la madera va a lo largo de la lama (vertical en el lienzo)
        g.drawImage(mc, (r() * 0.7) * N, 0, 20 * px, N, x, y, 20 * px, 120 * px);
        g.fillStyle = `rgba(${r() < 0.5 ? '40,25,10' : '255,240,220'},${0.04 + r() * 0.08})`; g.fillRect(x, y, 20 * px, 120 * px);
        g.restore();
        gh.fillStyle = '#000'; gh.fillRect(x, y, 20 * px, 1.5); gh.fillRect(x, y, 1.5, 120 * px);
        g.fillStyle = 'rgba(40,25,12,0.6)'; g.fillRect(x, y, 20 * px, 1.2); g.fillRect(x, y, 1.2, 120 * px);
      }
    }
    return { map: aTextura(c, metros), normalMap: aTextura(normalDesde(ch, 1.5), metros, false) };
  });
}

// ---------- Ruido fino de rugosidad (laca, pintura) ----------
export function ruidoRugosidad(valor = 140, amp = 30, metros = [0.5, 0.5]) {
  return cacheada(`ruidoRug:${valor}:${amp}`, () => {
    const r = rng(9); const N = 256; const [c, g] = lienzo(N, N);
    g.fillStyle = `rgb(${valor},${valor},${valor})`; g.fillRect(0, 0, N, N);
    manchas(g, N, N, r, 50, [10, 50], [[valor - amp, valor - amp, valor - amp], [valor + amp, valor + amp, valor + amp]], 0.35);
    ruidoGrano(g, N, N, r, amp * 0.6);
    return aTextura(c, metros, false);
  });
}

// ---------- Inox cepillado (rugosidad en rayas horizontales) ----------
export function cepillado(metros = [0.4, 0.4]) {
  return cacheada('cepillado', () => {
    const r = rng(13); const N = 512; const [c, g] = lienzo(N, N);
    g.fillStyle = 'rgb(110,110,110)'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 3000; i++) {
      const y = r() * N, v = 70 + r() * 110; g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(r() * N - 100, y, 60 + r() * 400, 0.6 + r());
    }
    const t = aTextura(c, metros, false); return t;
  });
}

// ---------- Placa de inducción (UV propias 0..1) ----------
export function texPlaca(tipo = 'induccion') {
  return cacheada('placa:' + tipo, () => {
    const W = 1024, H = 900; const [c, g] = lienzo(W, H);
    const gg = g.createLinearGradient(0, 0, W, H); gg.addColorStop(0, '#151517'); gg.addColorStop(1, '#0b0b0c');
    g.fillStyle = gg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 3;
    const zonas = [[300, 330, 190], [730, 300, 150], [700, 640, 120]];
    for (const [x, y, rr] of zonas) {
      g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.stroke();
      g.lineWidth = 2; for (const a of [0, 1.57, 3.14, 4.71]) { g.beginPath(); g.moveTo(x + Math.cos(a) * (rr - 18), y + Math.sin(a) * (rr - 18)); g.lineTo(x + Math.cos(a) * (rr + 0), y + Math.sin(a) * (rr + 0)); g.stroke(); }
      g.lineWidth = 3;
    }
    // mandos táctiles
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '28px sans-serif';
    for (let i = 0; i < 9; i++) g.fillText(String(i + 1), 230 + i * 45, 830);
    g.fillRect(200, 790, 460, 2);
    g.beginPath(); g.arc(120, 815, 20, 0, 6.283); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.font = '22px sans-serif'; g.fillText('3,5 kW', 850, 830);
    const t = aTextura(c, [1, 1]); t.repeat.set(1, 1); return t;
  });
}

// ---------- Cielo exterior para la ventana ----------
export function texExterior() {
  return cacheada('exterior', () => {
    // a baja resolución: al ampliarse en la escena queda desenfocado como un fondo real (sin filtros caros)
    const r = rng(55); const W = 512, H = 256; const [c, g] = lienzo(W, H);
    const gg = g.createLinearGradient(0, 0, 0, H);
    gg.addColorStop(0, '#8fb9e3'); gg.addColorStop(0.55, '#d7e6f1'); gg.addColorStop(0.62, '#e9eef0'); gg.addColorStop(1, '#a9ad9c');
    g.fillStyle = gg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = 20 + r() * 70, R = 30 + r() * 50;
      const rg = g.createRadialGradient(x, y, 0, x, y, R); rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    for (let i = 0; i < 16; i++) {
      const w = 30 + r() * 65, h = 30 + r() * 65, x = r() * W, y = H * 0.62 - h;
      const v = 200 + r() * 40; g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.fillRect(x, y, w, h + 10);
      g.fillStyle = 'rgba(120,130,140,0.35)';
      for (let a = 0; a < w - 8; a += 10) for (let b = 5; b < h - 5; b += 12) g.fillRect(x + a + 3, y + b, 4, 6);
    }
    for (let i = 0; i < 40; i++) {
      const v = r(), x = r() * W, y = H * 0.66 + r() * 15, R = 15 + r() * 28;
      const rg = g.createRadialGradient(x, y, 0, x, y, R); const col = `${70 + v * 40},${100 + v * 40},${60 + v * 20}`;
      rg.addColorStop(0, `rgba(${col},0.95)`); rg.addColorStop(0.7, `rgba(${col},0.8)`); rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    const t = aTextura(c, [1, 1]); t.repeat.set(1, 1); return t;
  });
}
