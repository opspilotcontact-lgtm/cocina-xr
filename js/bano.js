// Construye el baño 3D a partir de bano-modelo.js: alicatado y suelo, mueble de lavabo con lavabo integrado o sobre
// encimera, espejo (LED), inodoro y bidé (suspendidos con bastidor o al suelo), plato extraplano con rejilla y mampara,
// bañera con faldón, grifería, hornacina y radiador toallero. Medidas reales, todo por código.
//
// Coordenadas: las de la estancia, esquina en (0,0,0) y pared de referencia A en z=0 (x a lo largo de A, z hacia dentro,
// metros). Cada pieza se monta en coordenadas locales de su pared (como los tramos de la cocina) con matrizPared().
//
// Sala: construirBano NO dibuja tabiques, techo ni puerta: solo lo que va dentro (revestimientos incluidos, como planos
// a 6 mm de la pared, que no se ven desde fuera por la cara trasera). Para la página de prueba y para usarlo suelto está
// construirSalaBano(), que levanta tabiques de 12 cm con los huecos de huecosBano() (puerta, ventana y hornacina).
// Si se integra en la casa con sus propios tabiques, hay que recortar en ellos esos mismos huecos (la hornacina mete
// 8 cm en el tabique de la ducha) o desactivarla.
import * as THREE from 'three';
import { Lote, matrizTramo, fusionar } from './geo.js';
import { paredesBano, planta, huecosBano, hornacina, zonasAgua, grifoDucha, necesitaBastidor, MED } from './bano-modelo.js';

const cm = v => v / 100;
const PLANO = 0.006; // separación del alicatado respecto al tabique

export function matrizPared(e, id) {
  const P = paredesBano(e)[id];
  return matrizTramo([cm(P.a[0]), cm(P.a[1])], P.dir);
}

// ---------- utilidades de forma ----------
// Rectángulo [x0,x1]×[y0,y1] menos huecos → rectángulos (franjas verticales).
function restarHuecos(r, huecos) {
  let out = [r];
  for (const h of huecos) {
    const sig = [];
    for (const q of out) {
      if (h.x1 <= q.x0 || h.x0 >= q.x1 || h.y1 <= q.y0 || h.y0 >= q.y1) { sig.push(q); continue; }
      const hx0 = Math.max(q.x0, h.x0), hx1 = Math.min(q.x1, h.x1);
      if (hx0 > q.x0) sig.push({ ...q, x1: hx0 });
      if (hx1 < q.x1) sig.push({ ...q, x0: hx1 });
      if (h.y0 > q.y0) sig.push({ x0: hx0, x1: hx1, y0: q.y0, y1: Math.min(q.y1, h.y0) });
      if (h.y1 < q.y1) sig.push({ x0: hx0, x1: hx1, y0: Math.max(q.y0, h.y1), y1: q.y1 });
    }
    out = sig;
  }
  return out.filter(q => q.x1 - q.x0 > 0.002 && q.y1 - q.y0 > 0.002);
}

// Contorno de rectángulo redondeado en planta, [[x,z]...], antihorario visto desde arriba.
function rrect(x0, z0, x1, z1, r, seg = 6) {
  r = Math.min(r, (x1 - x0) / 2 - 1e-4, (z1 - z0) / 2 - 1e-4);
  const c = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI], [x1 - r, z0 + r, 1.5 * Math.PI]];
  const pts = [];
  for (const [cx, cz, a0] of c) for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return pts;
}
function formaRRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}
function caminoRRect(x0, y0, x1, y1, r) {
  const p = new THREE.Path();
  p.moveTo(x0 + r, y0); p.absarc(x0 + r, y0 + r, r, 1.5 * Math.PI, Math.PI, true);
  p.lineTo(x0, y1 - r); p.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true);
  p.lineTo(x1 - r, y1); p.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true);
  p.lineTo(x1, y0 + r); p.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true);
  p.lineTo(x0 + r, y0);
  return p;
}
// Losa horizontal a partir de una forma en planta (x, z): la cara de arriba queda en y=top y baja `grosor`.
function losa(shape, top, grosor, bisel = 0.002) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: grosor - 2 * bisel, bevelEnabled: bisel > 0, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 2, curveSegments: 20 });
  g.rotateX(Math.PI / 2); // forma y → z; extrusión → hacia abajo
  g.translate(0, top - bisel, 0);
  return g;
}
// Superficie entre dos contornos (mismo nº de puntos) + tapa del de abajo. Indexada → normales suaves.
function loft(arriba, yA, abajo, yB, tapa = true) {
  const n = arriba.length, pos = [], idx = [];
  for (const [x, z] of arriba) pos.push(x, yA, z);
  for (const [x, z] of abajo) pos.push(x, yB, z);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + i, j, n + j, n + i); }
  if (tapa) {
    const cx = abajo.reduce((s, p) => s + p[0], 0) / n, cz = abajo.reduce((s, p) => s + p[1], 0) / n;
    const c = pos.length / 3; pos.push(cx, yB, cz);
    // la tapa con sus propios vértices para que el borde no se suavice con la pared
    const b0 = pos.length / 3; for (const [x, z] of abajo) pos.push(x, yB, z);
    for (let i = 0; i < n; i++) idx.push(c, b0 + (i + 1) % n, b0 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const torno = (perfil, seg = 32) => new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---------- constructor ----------
export function construirBano(e, opciones = {}) {
  const { suelo = true, revestimientos = true } = opciones;
  const L = new Lote();
  const picks = [], luces = [];
  const P = paredesBano(e);
  const H = cm(e.sala.alto), W = cm(e.sala.ancho), D = cm(e.sala.fondo);
  const est = e.estilo;
  const huellas = planta(e);
  const huecos = huecosBano(e);
  const zonas = zonasAgua(e);
  const R = id => matrizPared(e, id);
  const enZonaAgua = (pared, s0, s1) => zonas.some(z => z.pared === pared && Math.min(z.x1, s1) - Math.max(z.x0, s0) > 1);
  const alicatadoHasta = (pared, s0, s1) => est.alturaAlicatado === 'completa' || enZonaAgua(pared, s0, s1) ? H : est.alturaAlicatado === 'media' ? cm(MED.alturaMedia) : 0;

  // ---------- revestimientos ----------
  if (suelo) {
    L.usar(new THREE.Matrix4());
    const g = new THREE.PlaneGeometry(W, D); g.rotateX(-Math.PI / 2); g.translate(W / 2, 0.002, D / 2);
    L.add(g, 'sueloBano');
  }
  if (revestimientos) for (const id of ['A', 'B', 'C', 'D']) {
    L.usar(R(id));
    const largo = cm(P[id].largo);
    const hs = huecos[id].map(h => ({ x0: cm(h.x0), x1: cm(h.x1), y0: cm(h.y0), y1: cm(h.y1) }));
    const rects = [];
    if (est.alturaAlicatado === 'completa') rects.push({ x0: 0, x1: largo, y0: 0, y1: H });
    else {
      if (est.alturaAlicatado === 'media') rects.push({ x0: 0, x1: largo, y0: 0, y1: cm(MED.alturaMedia) });
      for (const z of zonas.filter(z => z.pared === id)) rects.push({ x0: cm(z.x0), x1: cm(z.x1), y0: est.alturaAlicatado === 'media' ? cm(MED.alturaMedia) : 0, y1: H });
    }
    for (const r of rects) for (const q of restarHuecos(r, hs)) {
      const g = new THREE.PlaneGeometry(q.x1 - q.x0, q.y1 - q.y0); g.translate((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, PLANO);
      L.add(g, 'alicatado');
    }
    // remate metálico del alicatado a media altura (fuera de la zona de agua)
    if (est.alturaAlicatado === 'media') {
      const tramos = restarHuecos({ x0: 0, x1: largo, y0: cm(MED.alturaMedia) - 0.004, y1: cm(MED.alturaMedia) + 0.004 }, [...hs, ...zonas.filter(z => z.pared === id).map(z => ({ x0: cm(z.x0), x1: cm(z.x1), y0: 0, y1: H }))]);
      // plano (sin caras traseras) para que desaparezca con la pared cuando se mira desde fuera
      for (const q of tramos) { const pg = new THREE.PlaneGeometry(q.x1 - q.x0, 0.008); pg.translate((q.x0 + q.x1) / 2, cm(MED.alturaMedia), PLANO + 0.004); L.add(pg, 'manilla'); }
    }
  }

  // ---------- piezas ----------
  const g = { L, est, H, P };
  for (const q of huellas) {
    const Rm = R(q.pared);
    L.usar(Rm);
    const el = q.el;
    let alto = 1;
    switch (el.tipo) {
      case 'mueble': alto = mueble(g, q, luces, Rm); break;
      case 'inodoro': alto = sanitario(g, q, huellas, alicatadoHasta); break;
      case 'bide': alto = sanitario(g, q, huellas, alicatadoHasta); break;
      case 'ducha': alto = ducha(g, q, e); break;
      case 'banera': alto = banera(g, q); break;
      case 'radiador': alto = radiador(g, q); break;
    }
    picks.push({ R: Rm, x0: cm(q.s0), x1: cm(q.s1), y0: 0, y1: alto, z0: 0, z1: cm(q.d) + 0.02, id: el.id, tipo: el.tipo, pared: el.pared });
  }

  // ---------- hornacina ----------
  const n = hornacina(e);
  if (n) {
    L.usar(R(n.pared));
    const x0 = cm(n.x0), x1 = cm(n.x1), y0 = cm(n.y0), y1 = cm(n.y1), f = cm(n.fondo), w = x1 - x0, h = y1 - y0;
    L.caja('alicatado', x0, y0, -f, w, h, 0.004);                       // fondo
    L.caja('alicatado', x0, y0 - 0.004, -f, w, 0.004, f + PLANO);       // base (con algo de caída no se nota)
    L.caja('alicatado', x0, y1, -f, w, 0.004, f + PLANO);               // techo
    L.caja('alicatado', x0 - 0.004, y0, -f, 0.004, h, f + PLANO);       // lados
    L.caja('alicatado', x1, y0, -f, 0.004, h, f + PLANO);
    const t = 0.009; // perfil de remate en L
    L.caja('perfilMampara', x0 - t, y0 - t, PLANO - 0.002, w + 2 * t, t, 0.004);
    L.caja('perfilMampara', x0 - t, y1, PLANO - 0.002, w + 2 * t, t, 0.004);
    L.caja('perfilMampara', x0 - t, y0, PLANO - 0.002, t, h, 0.004);
    L.caja('perfilMampara', x1, y0, PLANO - 0.002, t, h, 0.004);
  }

  return { lote: L, picks, luces, ledes: luces };
}

// ---------- grifería ----------
// Monomando de lavabo/bidé: base, cuerpo, caño curvo y maneta.
function grifoMonomando(L, x, y, z, alto, cano) {
  L.cilindro('griferia', x, y + 0.003, z, 0.027, 0.006, 'y', 28);
  L.cilindro('griferia', x, y + alto / 2, z, 0.02, alto, 'y', 28);
  L.cilindro('griferia', x, y + alto + 0.004, z, 0.021, 0.008, 'y', 28);
  const c = new THREE.CubicBezierCurve3(
    new THREE.Vector3(x, y + alto - 0.022, z + 0.012), new THREE.Vector3(x, y + alto - 0.01, z + cano * 0.6),
    new THREE.Vector3(x, y + alto - 0.012, z + cano), new THREE.Vector3(x, y + alto - 0.04, z + cano + 0.004));
  L.add(new THREE.TubeGeometry(c, 18, 0.011, 12), 'griferia');
  L.cilindro('fondoOscuro', x, y + alto - 0.041, z + cano + 0.004, 0.0085, 0.003, 'y', 16);
  // maneta hacia atrás
  const m = new THREE.BoxGeometry(0.012, 0.01, 0.075); m.rotateX(-0.18); m.translate(x, y + alto + 0.016, z - 0.03);
  L.add(m, 'griferia');
}

// Flexo de ducha que cuelga entre dos puntos.
function flexo(L, a, b, caida = 0.25) {
  const m1 = new THREE.Vector3().lerpVectors(a, b, 0.3); m1.y = Math.min(a.y, b.y) - caida; m1.z += 0.02;
  const m2 = new THREE.Vector3().lerpVectors(a, b, 0.7); m2.y = Math.min(a.y, b.y) - caida * 0.7; m2.z += 0.03;
  L.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m1, m2, b]), 40, 0.0065, 8), 'griferia');
}

// Teleducha: mango inclinado y cabezal.
function teleducha(L, x, y, z) {
  L.cilindro('griferia', x, y, z, 0.013, 0.2, 'y', 16);
  L.cilindro('griferia', x, y + 0.12, z + 0.012, 0.045, 0.022, 'z', 32);
  L.cilindro('fondoOscuro', x, y + 0.12, z + 0.0235, 0.037, 0.002, 'z', 32);
}

// ---------- mueble de lavabo + lavabo + espejo ----------
function mueble(g, q, luces, Rm) {
  const { L } = g, el = q.el;
  const x0 = cm(q.s0), w = cm(el.ancho), fondo = 0.445, fr = 0.018, gap = 0.003;
  const sobre = el.lavabo === 'sobre';
  const yb = el.montaje === 'suelo' ? 0.1 : 0.3;
  const hc = (el.montaje === 'suelo' ? 0.7 : 0.5) - (sobre ? 0.05 : 0);
  const topC = yb + hc;
  if (el.montaje === 'suelo') L.caja('frenteBano', x0 + 0.015, 0, 0.04, w - 0.03, yb, fondo - 0.07);
  // casco abierto por arriba (costados, trasera y base): el seno de porcelana baja por dentro
  const tc = 0.016;
  L.caja('frenteBano', x0, yb, 0, tc, hc, fondo); L.caja('frenteBano', x0 + w - tc, yb, 0, tc, hc, fondo);
  L.caja('frenteBano', x0 + tc, yb, 0, w - 2 * tc, hc, tc); L.caja('frenteBano', x0 + tc, yb, 0, w - 2 * tc, tc, fondo);
  if (sobre) L.caja('frenteBano', x0 + tc, yb + hc - tc, 0, w - 2 * tc, tc, fondo);
  // frentes
  const bar = (xc, y, largo) => {
    L.cilindro('griferia', xc, y, fondo + fr + 0.022, 0.0055, largo, 'x', 14);
    for (const d of [-1, 1]) L.cilindro('griferia', xc + d * (largo / 2 - 0.015), y, fondo + fr + 0.011, 0.004, 0.022, 'z', 10);
  };
  if (el.frente === 'puertas') {
    const n = w > 0.65 ? 2 : 1, dw = w / n;
    for (let k = 0; k < n; k++) {
      L.panel('frenteBano', x0 + k * dw + gap / 2, yb + gap / 2, fondo, dw - gap, hc - gap, fr, 0.002);
      bar(x0 + k * dw + dw / 2, topC - 0.05, Math.min(0.2, dw * 0.5));
    }
  } else {
    const n = 2, dh = hc / n;
    for (let k = 0; k < n; k++) {
      const y = yb + k * dh;
      L.panel('frenteBano', x0 + gap / 2, y + gap / 2, fondo, w - gap, dh - gap, fr, 0.002);
      bar(x0 + w / 2, y + dh - 0.045, Math.min(0.32, w * 0.45));
    }
  }
  // encimera y senos
  const senos = el.senos === 2 && el.ancho >= 120 ? 2 : 1;
  const cxs = senos === 2 ? [w / 4, 3 * w / 4] : [w / 2];
  let top;
  if (!sobre) {
    const t = 0.03, dep = 0.465;
    top = topC + t;
    const a = Math.min(0.22, w / senos / 2 - 0.08), b = 0.15, cz = 0.255;
    const s = formaRRect(0, 0, w + 0.004, dep, 0.008);
    for (const cx of cxs) { const p = new THREE.Path(); p.absellipse(cx + 0.002, cz, a, b, 0, Math.PI * 2, true); s.holes.push(p); }
    const lg = losa(s, top, t, 0.004); lg.translate(x0 - 0.002, 0, 0);
    L.add(lg, 'porcelana');
    for (const cx of cxs) {
      const cub = torno([[1, 0], [0.985, -0.03], [0.9, -0.075], [0.7, -0.11], [0.35, -0.128], [0, -0.132]], 40);
      cub.scale(a, 1, b); cub.translate(x0 + cx, top - 0.002, cz);
      L.add(cub, 'porcelana');
      L.cilindro('griferia', x0 + cx, top - 0.133, cz + 0.02, 0.019, 0.003, 'y', 20);
      grifoMonomando(L, x0 + cx, top, 0.055, 0.15, 0.115);
    }
  } else {
    const t = 0.012;
    L.panel('encimeraBano', x0, topC, 0, w, t, 0.465, 0.002);
    const base = topC + t;
    for (const cx of cxs) {
      const a = Math.min(0.2, w / senos / 2 - 0.06), b = 0.17, cz = 0.27;
      const per = [[0, 0], [0.45, 0], [0.62, 0.006], [0.84, 0.035], [0.97, 0.085], [1, 0.125], [0.985, 0.132], [0.94, 0.128], [0.86, 0.09], [0.66, 0.045], [0.3, 0.026], [0, 0.024]];
      const cub = torno(per, 40); cub.scale(a, 1, b); cub.translate(x0 + cx, base, cz);
      L.add(cub, 'porcelana');
      L.cilindro('griferia', x0 + cx, base + 0.0255, cz, 0.019, 0.003, 'y', 20);
      grifoMonomando(L, x0 + cx, base, 0.055, 0.3, 0.16);
    }
    top = base + 0.13;
  }
  // espejo
  let techo = top + 0.3;
  if (el.espejo && el.espejo !== 'ninguno') {
    const xc = x0 + w / 2;
    const ye = Math.max(top + 0.22, 1.1);
    const zf = 0.03;
    if (el.espejo === 'redondo') {
      const r = Math.min(0.4, w * 0.4, (Math.min(2.0, g.H - 0.15) - ye) / 2);
      const yc = ye + r;
      L.cilindro('fondoOscuro', xc, yc, 0.012, r - 0.04, 0.024, 'z', 40);
      const d = new THREE.CylinderGeometry(r, r, 0.006, 64); d.rotateX(Math.PI / 2); d.translate(xc, yc, zf); L.add(d, 'espejo');
      if (el.led) {
        const ring = new THREE.RingGeometry(r - 0.035, r - 0.025, 64); ring.translate(xc, yc, zf + 0.0035);
        L.add(ring, 'ledBano', { sinSombra: true });
        luces.push({ R: Rm, x0: xc - r * 0.6, x1: xc + r * 0.6, y: yc - r + 0.02, z: zf + 0.02, n: g.P[el.pared].n });
      }
      techo = yc + r;
    } else {
      const we = Math.min(w, 1.2) - (w > 0.7 ? 0.04 : 0), he = Math.min(0.8, g.H - 0.2 - ye);
      const ex = xc - we / 2;
      L.caja('fondoOscuro', ex + 0.04, ye + 0.04, 0.006, we - 0.08, he - 0.08, 0.02);
      L.panel('espejo', ex, ye, zf - 0.003, we, he, 0.006, 0.003);
      if (el.led) {
        const b = 0.012, m = 0.035, z = zf + 0.0035;
        for (const yy of [ye + m, ye + he - m - b]) L.caja('ledBano', ex + m, yy, z, we - 2 * m, b, 0.0006, { sinSombra: true });
        for (const xx of [ex + m, ex + we - m - b]) L.caja('ledBano', xx, ye + m + b, z, b, he - 2 * m - 2 * b, 0.0006, { sinSombra: true });
        luces.push({ R: Rm, x0: ex + 0.06, x1: ex + we - 0.06, y: ye + 0.01, z: zf + 0.02, n: g.P[el.pared].n });
      }
      techo = ye + he;
    }
  }
  return techo;
}

// ---------- inodoro y bidé ----------
function tramoBastidor(q, huellas, largo) {
  let s0 = q.h0, s1 = q.h1;
  const vecinos = huellas.filter(o => o !== q && o.pared === q.pared);
  // pegar a la pared o a la pieza vecina si queda un hueco de menos de 25 cm (no se deja un rincón sin limpiar)
  const izq = Math.max(0, ...vecinos.filter(o => o.s1 <= q.s0 + 1).map(o => necesitaBastidor(o.el) ? o.h1 : o.s1));
  const der = Math.min(largo, ...vecinos.filter(o => o.s0 >= q.s1 - 1).map(o => necesitaBastidor(o.el) ? o.h0 : o.s0));
  if (s0 - izq < 25) s0 = izq;
  if (der - s1 < 25) s1 = der;
  return [s0, s1];
}

function sanitario(g, q, huellas, alicatadoHasta) {
  const { L } = g, el = q.el;
  const xe = cm(el.x), wc = el.tipo === 'inodoro';
  const bast = necesitaBastidor(el);
  const susp = el.montaje === 'suspendido';
  const z0 = bast ? cm(MED.bastidor) : wc ? 0.12 : 0;
  const frente = cm(q.d);
  const rx = 0.18, rz = 0.25, zc = frente - rz;
  const rim = 0.4;
  let alto = 0.8;
  if (bast) {
    const [s0, s1] = tramoBastidor(q, huellas, g.P[el.pared].largo).map(cm);
    const hb = cm(MED.alturaBastidor);
    const mat = alicatadoHasta(el.pared, s0 * 100, s1 * 100) >= hb - 0.01 ? 'alicatado' : 'paredBano';
    L.caja(mat, s0, 0, 0, s1 - s0, hb, z0 + 0.002);
    alto = hb;
    if (wc) {
      // pulsador doble descarga
      L.panel('griferia', xe - 0.12, 0.95, z0, 0.24, 0.16, 0.008, 0.004);
      L.caja('fondoOscuro', xe - 0.0008, 0.955, z0 + 0.0075, 0.0016, 0.15, 0.001);
      L.cilindro('fondoOscuro', xe - 0.06, 1.03, z0 + 0.0085, 0.012, 0.001, 'z', 20);
    }
  }
  // cuerpo de porcelana (torno escalado a óvalo)
  const perfilSusp = [[0, 0], [0.5, 0], [0.74, 0.025], [0.9, 0.07], [0.98, 0.115], [1, 0.15], [0.975, 0.16], [0.88, 0.158], [0.8, 0.13], [0.58, 0.075], [0.28, 0.05], [0, 0.048]];
  const perfilSuelo = [[0, 0], [0.48, 0], [0.5, 0.02], [0.52, 0.14], [0.66, 0.25], [0.88, 0.33], [0.98, 0.37], [1, 0.39], [0.975, 0.4], [0.88, 0.398], [0.8, 0.37], [0.58, 0.315], [0.28, 0.29], [0, 0.288]];
  const y0 = susp ? rim - 0.16 : 0;
  const cuerpo = torno(susp ? perfilSusp : perfilSuelo, 40);
  cuerpo.scale(rx, 1, rz); cuerpo.translate(xe, y0, zc);
  L.add(cuerpo, 'porcelana');
  // lomo hasta la pared o el bastidor
  const yl = susp ? y0 + 0.025 : 0;
  L.panel('porcelana', xe - 0.15, yl, z0, 0.3, rim - 0.004 - yl, Math.max(0.02, zc - z0), 0.035);
  if (wc) {
    // asiento y tapa (cerrada)
    const aro = new THREE.Shape(); aro.absellipse(0, 0, rx + 0.003, rz - 0.01, 0, Math.PI * 2, false);
    const hueco = new THREE.Path(); hueco.absellipse(0, 0.015, rx - 0.065, rz - 0.085, 0, Math.PI * 2, true); aro.holes.push(hueco);
    const a = losa(aro, rim + 0.018, 0.018, 0.004); a.translate(xe, 0, zc); L.add(a, 'porcelana');
    const tapa = new THREE.Shape(); tapa.absellipse(0, 0, rx - 0.004, rz - 0.018, 0, Math.PI * 2, false);
    const t = losa(tapa, rim + 0.036, 0.016, 0.005); t.translate(xe, 0, zc - 0.004); L.add(t, 'porcelana');
    L.cilindro('porcelana', xe, rim + 0.022, zc - rz + 0.02, 0.012, 0.22, 'x', 16); // bisagra
    if (!bast) {
      // cisterna vista con pulsador arriba
      L.panel('porcelana', xe - 0.19, rim + 0.005, 0.005, 0.38, 0.39, 0.16, 0.02);
      L.cilindro('griferia', xe, rim + 0.4, 0.085, 0.022, 0.008, 'y', 24);
      alto = rim + 0.4;
    }
  } else {
    // bidé: grifo sobre el lomo y desagüe
    grifoMonomando(L, xe, rim - 0.004, zc - rz + 0.03, 0.08, 0.09);
    L.cilindro('griferia', xe, y0 + (susp ? 0.05 : 0.29), zc + 0.02, 0.016, 0.003, 'y', 20);
  }
  return alto;
}

// ---------- plato de ducha, mampara, grifería y rociador ----------
function ducha(g, q, e) {
  const { L, H } = g, el = q.el;
  const x0 = cm(q.s0), x1 = cm(q.s1), w = x1 - x0, f = cm(el.fondo), largo = cm(g.P[el.pared].largo);
  const hp = 0.03;
  L.panel('plato', x0, 0, 0, w, hp, f, 0.004);
  // rejilla bajo la grifería
  const xg = cm(grifoDucha(el));
  const rx = Math.max(x0 + 0.1, Math.min(x1 - 0.1, xg)), rz = f / 2;
  L.caja('manilla', rx - 0.065, hp, rz - 0.065, 0.13, 0.0015, 0.13);
  for (let i = 0; i < 6; i++) L.caja('fondoOscuro', rx - 0.05, hp + 0.0015, rz - 0.05 + i * 0.019, 0.1, 0.0004, 0.007, { sinSombra: true });

  // mampara
  const yb = hp, hm = cm(MED.alturaMampara), zf = f - 0.035, vg = 0.008;
  const izqLibre = q.s0 > 1, derLibre = q.s1 < g.P[el.pared].largo - 1;
  const vidrio = (xa, xb, z) => L.caja('vidrioMampara', xa, yb + 0.006, z, xb - xa, hm - 0.006, vg, { sinSombra: true });
  const perfilV = (x, z) => L.caja('perfilMampara', x - 0.01, yb, z - 0.006, 0.02, hm, 0.02);
  const asaV = (x, z) => {
    L.cilindro('perfilMampara', x, yb + 1.0, z + 0.032, 0.008, 0.3, 'y', 14);
    for (const d of [-1, 1]) L.cilindro('perfilMampara', x, yb + 1.0 + d * 0.13, z + 0.016, 0.005, 0.032, 'z', 10);
  };
  if (el.mampara !== 'ninguna') {
    for (const [libre, x] of [[izqLibre, x0 + 0.012], [derLibre, x1 - 0.012 - vg]]) {
      if (!libre) continue;
      L.caja('vidrioMampara', x, yb + 0.006, 0.0, vg, hm - 0.006, zf, { sinSombra: true });
      L.caja('perfilMampara', x - 0.006, yb, 0, 0.02, hm, 0.02);
    }
    const izqGrifo = el.grifoLado !== 'der';
    if (el.mampara === 'fija') {
      const pw = Math.min(Math.max(0.6, w * 0.6), 1.2, w);
      const xa = izqGrifo ? x0 + 0.01 : x1 - 0.01 - pw, xb = xa + pw;
      vidrio(xa, xb, zf);
      if ((izqGrifo && !izqLibre) || (!izqGrifo && !derLibre)) perfilV(izqGrifo ? x0 + 0.01 : x1 - 0.01, zf);
      const xbr = izqGrifo ? xb - 0.04 : xa + 0.04;
      L.cilindro('perfilMampara', xbr, yb + hm - 0.06, zf / 2, 0.008, zf, 'z', 12); // brazo estabilizador
      L.caja('perfilMampara', xbr - 0.015, yb + hm - 0.075, zf - 0.008, 0.03, 0.03, 0.024);
    } else if (el.mampara === 'corredera') {
      const mid = x0 + w / 2;
      vidrio(x0 + 0.012, mid + 0.04, zf - 0.016);
      vidrio(mid - 0.04, x1 - 0.012, zf);
      L.caja('perfilMampara', x0, yb + hm - 0.01, zf - 0.03, w, 0.035, 0.046);
      L.caja('perfilMampara', x0, yb, zf - 0.024, w, 0.012, 0.034);
      if (!izqLibre) perfilV(x0 + 0.01, zf - 0.008);
      if (!derLibre) perfilV(x1 - 0.01, zf - 0.008);
      for (const xr of [mid + 0.02, x1 - 0.1]) L.cilindro('perfilMampara', xr, yb + hm + 0.01, zf + 0.004, 0.018, 0.012, 'z', 18);
      asaV(izqGrifo ? mid + 0.03 : x1 - 0.06, zf);
    } else if (el.mampara === 'abatible') {
      const dw = Math.min(0.75, w - 0.02);
      // la puerta abre en el lado contrario al grifo; si sobra, panel fijo junto al grifo
      const xa = izqGrifo ? x1 - 0.01 - dw : x0 + 0.01, xb = xa + dw;
      vidrio(xa, xb, zf);
      const restoA = izqGrifo ? x0 + 0.01 : xb + 0.004, restoB = izqGrifo ? xa - 0.004 : x1 - 0.01;
      if (restoB - restoA > 0.1) vidrio(restoA, restoB, zf);
      const xbis = izqGrifo ? xb : xa;
      if ((izqGrifo && !derLibre) || (!izqGrifo && !izqLibre)) perfilV(xbis, zf);
      for (const yy of [0.3, hm - 0.3]) L.caja('perfilMampara', xbis - 0.03, yb + yy - 0.04, zf - 0.008, 0.06, 0.08, 0.024);
      asaV(izqGrifo ? xa + 0.06 : xb - 0.06, zf);
      if (restoB - restoA > 0.1 && ((izqGrifo && !izqLibre) || (!izqGrifo && !derLibre))) perfilV(izqGrifo ? x0 + 0.01 : x1 - 0.01, zf);
    }
  }

  // grifería
  const P0 = PLANO;
  if (el.rociador === 'columna') {
    const top = Math.min(2.15, H - 0.08), ym = 1.1;
    L.cilindro('griferia', xg, ym, P0 + 0.06, 0.03, 0.34, 'x', 28);
    for (const d of [-1, 1]) {
      L.cilindro('griferia', xg + d * 0.185, ym, P0 + 0.06, 0.034, 0.03, 'x', 28);
      L.cilindro('griferia', xg + d * 0.075, ym, P0 + 0.03, 0.012, 0.06, 'z', 14);
    }
    L.cilindro('griferia', xg, (ym + top) / 2, P0 + 0.06, 0.011, top - ym, 'y', 16);
    L.cilindro('griferia', xg, top - 0.2, P0 + 0.03, 0.008, 0.06, 'z', 12);
    L.cilindro('griferia', xg, top, P0 + 0.06 + 0.17, 0.01, 0.34, 'z', 14);
    const zr = P0 + 0.4;
    L.cilindro('griferia', xg, top - 0.012, zr, 0.125, 0.008, 'y', 48);
    L.cilindro('fondoOscuro', xg, top - 0.0165, zr, 0.108, 0.0012, 'y', 48);
    L.caja('griferia', xg - 0.02, 1.5, P0 + 0.06, 0.04, 0.04, 0.04);
    const xt = xg + 0.05;
    teleducha(L, xt, 1.48, P0 + 0.1);
    flexo(L, new THREE.Vector3(xg, ym - 0.03, P0 + 0.06), new THREE.Vector3(xt, 1.38, P0 + 0.1), 0.35);
  } else {
    // termostática empotrada + rociador de techo en el centro del plato
    L.panel('griferia', xg - 0.065, 0.98, P0, 0.13, 0.28, 0.008, 0.004);
    for (const y of [1.06, 1.18]) { L.cilindro('griferia', xg, y, P0 + 0.025, 0.026, 0.035, 'z', 28); L.caja('griferia', xg - 0.004, y + 0.012, P0 + 0.04, 0.008, 0.02, 0.006); }
    const rr = w >= 1.1 ? 0.15 : 0.125;
    const xr = x0 + w / 2, zr = Math.min(f / 2, 0.5);
    L.cilindro('griferia', xr, H - 0.06, zr, 0.01, 0.12, 'y', 14);
    L.cilindro('griferia', xr, H - 0.001, zr, 0.03, 0.004, 'y', 24);
    L.cilindro('griferia', xr, H - 0.124, zr, rr, 0.008, 'y', 48);
    L.cilindro('fondoOscuro', xr, H - 0.1285, zr, rr - 0.018, 0.0012, 'y', 48);
    const xt = xg + (el.grifoLado === 'der' ? -0.2 : 0.2);
    L.caja('griferia', xt - 0.015, 1.24, P0, 0.03, 0.05, 0.03);
    teleducha(L, xt, 1.3, P0 + 0.045);
    L.cilindro('griferia', xg, 0.95, P0 + 0.015, 0.014, 0.03, 'z', 16);
    flexo(L, new THREE.Vector3(xg, 0.95, P0 + 0.03), new THREE.Vector3(xt, 1.2, P0 + 0.045), 0.3);
  }
  return Math.max(yb + hm, 2.0);
}

// ---------- bañera con faldón ----------
function banera(g, q) {
  const { L } = g, el = q.el;
  const Lb = cm(el.largo), x0 = cm(el.x) - Lb / 2, x1 = x0 + Lb, f = cm(MED.fondoBanera), hb = 0.56, t = 0.03;
  const largo = cm(g.P[el.pared].largo);
  // faldón frontal y laterales vistos
  L.panel('porcelana', x0, 0.04, f - 0.025, Lb, hb - t - 0.04, 0.025, 0.006);
  L.caja('fondoOscuro', x0 + 0.01, 0, f - 0.06, Lb - 0.02, 0.04, 0.03);
  if (!q.poyete0 && x0 > 0.01) L.panel('porcelana', x0, 0.04, 0, 0.025, hb - t - 0.04, f, 0.006);
  if (!q.poyete1 && x1 < largo - 0.01) L.panel('porcelana', x1 - 0.025, 0.04, 0, 0.025, hb - t - 0.04, f, 0.006);
  // borde con hueco y cubeta
  const mx = 0.07, mz = 0.065, rr = 0.11;
  const s = formaRRect(0, 0, Lb, f, 0.01);
  s.holes.push(caminoRRect(mx, mz, Lb - mx, f - mz, rr));
  const lg = losa(s, hb, t, 0.004); lg.translate(x0, 0, 0); L.add(lg, 'porcelana');
  const arriba = rrect(x0 + mx, mz, x1 - mx, f - mz, rr, 6);
  const abajo = rrect(x0 + mx + 0.28, mz + 0.07, x1 - mx - 0.05, f - mz - 0.07, rr * 0.8, 6);
  L.add(loft(arriba, hb - t + 0.001, abajo, 0.14), 'porcelana');
  // grifería mural en el extremo del grifo, desagüe y rebosadero
  const izq = el.grifoLado !== 'der';
  const xg = izq ? x0 + 0.32 : x1 - 0.32;
  const xd = izq ? x0 + mx + 0.15 : x1 - mx - 0.15;
  L.cilindro('griferia', xd, 0.142, f / 2, 0.022, 0.003, 'y', 20);
  L.cilindro('griferia', izq ? x0 + mx + 0.004 : x1 - mx - 0.004, hb - 0.13, f / 2, 0.03, 0.006, 'x', 24);
  const ym = hb + 0.22, P0 = PLANO;
  L.cilindro('griferia', xg, ym, P0 + 0.06, 0.028, 0.3, 'x', 28);
  for (const d of [-1, 1]) {
    L.cilindro('griferia', xg + d * 0.165, ym, P0 + 0.06, 0.032, 0.03, 'x', 28);
    L.cilindro('griferia', xg + d * 0.075, ym, P0 + 0.03, 0.012, 0.06, 'z', 14);
  }
  L.cilindro('griferia', xg, ym - 0.035, P0 + 0.13, 0.013, 0.14, 'z', 16);
  L.cilindro('griferia', xg, ym - 0.05, P0 + 0.195, 0.014, 0.03, 'y', 16);
  const xt = xg + (izq ? 0.28 : -0.28);
  L.caja('griferia', xt - 0.015, hb + 0.7, P0, 0.03, 0.05, 0.03);
  teleducha(L, xt, hb + 0.76, P0 + 0.045);
  flexo(L, new THREE.Vector3(xg, ym - 0.03, P0 + 0.06), new THREE.Vector3(xt, hb + 0.66, P0 + 0.045), 0.3);
  // poyetes alicatados que cierran el hueco hasta la pared
  if (q.poyete0) L.caja('alicatado', 0, 0, 0, cm(q.poyete0), hb, f);
  if (q.poyete1) L.caja('alicatado', x1, 0, 0, cm(q.poyete1), hb, f);
  // mampara de bañera (panel fijo de 80 en el extremo del grifo)
  let alto = hb + 0.1;
  if (el.mampara === 'fija') {
    const pw = 0.8, zf = f - 0.09, hm = 1.4;
    const xa = izq ? x0 + 0.01 : x1 - 0.01 - pw;
    L.caja('vidrioMampara', xa, hb, zf, pw, hm, 0.008, { sinSombra: true });
    L.caja('perfilMampara', izq ? x0 : x1 - 0.02, hb, zf - 0.006, 0.02, hm, 0.02);
    alto = hb + hm;
  }
  return alto;
}

// ---------- radiador toallero ----------
function radiador(g, q) {
  const { L } = g, el = q.el;
  const x0 = cm(q.s0), w = cm(el.ancho), alto = cm(el.alto), y0 = 0.15, z = 0.055;
  for (const x of [x0 + 0.015, x0 + w - 0.015]) {
    L.cilindro('radiador', x, y0 + alto / 2, z, 0.014, alto, 'y', 14);
    for (const y of [y0 + 0.08, y0 + alto - 0.08]) L.cilindro('radiador', x, y, z / 2, 0.007, z, 'z', 10);
  }
  // barras en grupos de 4 con hueco para colgar la toalla
  let y = y0 + 0.03;
  let k = 0;
  while (y < y0 + alto - 0.02) {
    L.cilindro('radiador', x0 + w / 2, y, z, 0.0105, w - 0.03, 'x', 12);
    k++; y += k % 4 === 0 ? 0.1 : 0.032;
  }
  return y0 + alto;
}

// ---------- sala propia (página de prueba / uso suelto) ----------
const GROSOR = 0.12;

// Tabiques con huecos, puerta, ventana, techo con focos y forjado. Devuelve lo mismo que construirSala de la cocina
// (grupo, muros con userData {punto, n}, suelo, techo, focos, W, D, H) para poder usar las mismas luces.
export function construirSalaBano(e, mats) {
  const P = paredesBano(e);
  const W = cm(e.sala.ancho), D = cm(e.sala.fondo), H = cm(e.sala.alto);
  const huecos = huecosBano(e);
  const grupo = new THREE.Group(); grupo.name = 'salaBano';
  const muros = [];
  for (const id of ['A', 'B', 'C', 'D']) {
    const p = P[id];
    const R = matrizPared(e, id);
    const L = new Lote().usar(R);
    const ext = (id === 'A' || id === 'D') ? GROSOR : 0;
    const largo = cm(p.largo);
    const hs = huecos[id].map(h => ({ ...h, x0: cm(h.x0), x1: cm(h.x1), y0: cm(h.y0), y1: cm(h.y1) }));
    for (const r of restarHuecos({ x0: -ext, x1: largo + ext, y0: 0, y1: H }, hs)) L.caja('paredBano', r.x0, r.y0, -GROSOR, r.x1 - r.x0, r.y1 - r.y0, GROSOR);
    for (const h of hs) {
      const w = h.x1 - h.x0, hh = h.y1 - h.y0;
      if (h.tipo === 'hornacina') { L.caja('paredBano', h.x0, h.y0, -GROSOR, w, hh, GROSOR - cm(h.fondo)); continue; }
      if (h.tipo === 'puerta') {
        const m = 0.03, tj = 0.07;
        L.caja('marcoPuerta', h.x0, 0, -GROSOR, m, hh, GROSOR); L.caja('marcoPuerta', h.x1 - m, 0, -GROSOR, m, hh, GROSOR);
        L.caja('marcoPuerta', h.x0, hh - m, -GROSOR, w, m, GROSOR);
        for (const z of [0.004, -GROSOR - 0.014]) {
          L.caja('marcoPuerta', h.x0 - tj + m, 0, z, tj, hh + tj - m, 0.01); L.caja('marcoPuerta', h.x1 - m, 0, z, tj, hh + tj - m, 0.01);
          L.caja('marcoPuerta', h.x0 - tj + m, hh - m, z, w + 2 * (tj - m), tj, 0.01);
        }
        L.panel('puerta', h.x0 + m + 0.002, 0.008, -GROSOR / 2 - 0.02, w - 2 * m - 0.004, hh - m - 0.01, 0.04, 0.002);
        const xm = h.x1 - m - 0.07;
        for (const d of [-1, 1]) {
          const zz = -GROSOR / 2 + d * 0.02;
          L.cilindro('manilla', xm, 1.0, zz + d * 0.004, 0.026, 0.008, 'z', 24);
          L.cilindro('manilla', xm, 1.0, zz + d * 0.03, 0.009, 0.05, 'z', 12);
          L.cilindro('manilla', xm - 0.06, 1.0, zz + d * 0.055, 0.009, 0.13, 'x', 12);
        }
      }
      if (h.tipo === 'ventana') {
        const zc = -0.08, pf = 0.06, fd = 0.06;
        L.caja('carpinteria', h.x0, h.y0, zc, pf, hh, fd); L.caja('carpinteria', h.x1 - pf, h.y0, zc, pf, hh, fd);
        L.caja('carpinteria', h.x0, h.y0, zc, w, pf, fd); L.caja('carpinteria', h.x0, h.y1 - pf, zc, w, pf, fd);
        L.caja('vidrioVentana', h.x0 + pf, h.y0 + pf, zc + 0.028, w - 2 * pf, hh - 2 * pf, 0.006, { sinSombra: true });
        L.caja('alfeizarBano', h.x0 - 0.01, h.y0 - 0.02, -GROSOR + 0.05, w + 0.02, 0.02, GROSOR - 0.04);
      }
    }
    const gm = fusionar(L, mats);
    gm.name = 'pared' + id;
    gm.userData = { punto: new THREE.Vector3(cm(p.a[0]), 0, cm(p.a[1])), n: new THREE.Vector3(p.n[0], 0, p.n[1]) };
    grupo.add(gm); muros.push(gm);
  }
  const Ls = new Lote();
  Ls.caja('forjado', -GROSOR, -0.03, -GROSOR, W + 2 * GROSOR, 0.03, D + 2 * GROSOR);
  const suelo = fusionar(Ls, mats, { sombras: false }); suelo.name = 'suelo'; grupo.add(suelo);
  const Lt = new Lote();
  const tg = new THREE.PlaneGeometry(W + 2 * GROSOR, D + 2 * GROSOR); tg.rotateX(Math.PI / 2); tg.translate(W / 2, H, D / 2);
  Lt.add(tg, 'techoBano');
  const focos = [];
  const n = W * D > 4.5 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = W / 2, z = D * (i + 0.5) / n;
    Lt.cilindro('downlightBano', x, H - 0.001, z, 0.04, 0.002, 'y', 24, { sinSombra: true });
    focos.push(new THREE.Vector3(x, H - 0.08, z));
  }
  const techo = fusionar(Lt, mats, { sombras: false }); techo.name = 'techo'; grupo.add(techo);
  return { grupo, muros, suelo, techo, focos, exteriores: [], ventana: null, W, D, H };
}

// Recuento para el presupuesto de rendimiento.
export function medirGrupo(obj) {
  let mallas = 0, triangulos = 0;
  obj.traverse(o => {
    if (!o.isMesh) return; mallas++;
    const gg = o.geometry; triangulos += (gg.index ? gg.index.count : gg.attributes.position.count) / 3;
  });
  return { mallas, triangulos: Math.round(triangulos) };
}
