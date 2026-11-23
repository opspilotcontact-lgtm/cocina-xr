// Lectura de una estancia para amueblarla: paredes interiores, huecos, zonas que no se pueden tapar y lo ya colocado.
// Todo en el marco local de la estancia (marcoEstancia: x a lo largo de la pared A, z hacia dentro) y en METROS.
//
//   paredes[i] = { i, a:[x,z], dir:[dx,dz], n:[nx,nz], largo, huecos:[{ tipo, puerta, s0, s1, y0, y1 }] }
//   reservas   = rectángulos {x0,z0,x1,z1, alto, tipo} que nada puede pisar (puertas) o solo lo bajo (ventanas)
//   piezas     = lo que ya se ha colocado (muebles), con su alto
//
// Un mueble contra una pared se describe con (pared, s, ancho, fondo, separación): s es el CENTRO sobre la pared.
import { marcoEstancia, bordesDe, planoALocal, huecosDeBorde, esPuerta, CARA } from '../casa/modelo-casa.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cruz = (a, b) => a[0] * b[1] - a[1] * b[0];
export const rotDe = dir => Math.atan2(-dir[1], dir[0]);

export function enPoligono([x, z], pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, zi] = pol[i], [xj, zj] = pol[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) d = !d;
  }
  return d;
}
export const solapa = (a, b, tol = 0.005) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > tol;
export const crecer = (r, m) => ({ ...r, x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });

// Rectángulo (AABB) de un tramo de pared: [s0,s1] a lo largo × [d0,d1] hacia dentro.
export function rectPared(w, s0, s1, d0, d1) {
  const xs = [], zs = [];
  for (const s of [s0, s1]) for (const d of [d0, d1]) { xs.push(w.a[0] + w.dir[0] * s + w.n[0] * d); zs.push(w.a[1] + w.dir[1] * s + w.n[1] * d); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
export const puntoPared = (w, s, d = 0) => [w.a[0] + w.dir[0] * s + w.n[0] * d, w.a[1] + w.dir[1] * s + w.n[1] * d];

export class Espacio {
  constructor(est, tabs) {
    this.est = est;
    this.m = marcoEstancia(est);
    this.H = est.alto / 100;
    const B = bordesDe(est.poligono), nb = B.length;
    const loc = p => planoALocal(this.m, p).map(v => v / 100);
    // polígono interior (cara de los tabiques): esquinas a 90° → vértice + (n_prev + n) · CARA
    const nL = b => { const d = [dot(b.dir, this.m.dir), dot(b.dir, this.m.n)]; return { d, n: [-d[1], d[0]] }; };
    const C = CARA / 100;
    this.poligono = B.map((b, i) => {
      const p = loc(b.a), q = nL(B[(i - 1 + nb) % nb]), r = nL(b);
      const par = Math.abs(cruz(q.d, r.d)) < 1e-3;
      return par ? [p[0] + r.n[0] * C, p[1] + r.n[1] * C] : [p[0] + (q.n[0] + r.n[0]) * C, p[1] + (q.n[1] + r.n[1]) * C];
    });
    this.paredes = B.map((b, i) => {
      const { d, n } = nL(b);
      const prev = nL(B[(i - 1 + nb) % nb]).d, next = nL(B[(i + 1) % nb]).d;
      // esquina convexa → la cara interior empieza CARA más allá; cóncava → CARA antes
      const t0 = cruz(prev, d) > 1e-3 ? C : cruz(prev, d) < -1e-3 ? -C : 0;
      const t1 = cruz(d, next) > 1e-3 ? C : cruz(d, next) < -1e-3 ? -C : 0;
      const p = loc(b.a);
      const a = [p[0] + n[0] * C + d[0] * t0, p[1] + n[1] * C + d[1] * t0];
      const huecos = huecosDeBorde(tabs, est.id, b.i).map(({ h, pos }) => {
        const s0 = pos / 100 - t0, y0 = (h.antepecho || 0) / 100;
        return { tipo: h.tipo, puerta: esPuerta(h) || h.tipo === 'balconera', s0, s1: s0 + h.ancho / 100, y0, y1: y0 + (h.alto || 0) / 100, h };
      });
      const exterior = (tabs.porBorde[est.id + ':' + b.i] || []).some(q => q.tab.exterior || !q.tab.menos);
      return { i, a, dir: d, n, largo: b.largo / 100 - t0 - t1, huecos, exterior };
    });
    this.reservas = [];
    for (const w of this.paredes) for (const h of w.huecos) {
      if (h.puerta) {
        // paso de la puerta: el barrido de la hoja y algo más para entrar sin rodear nada
        // balconera: se pasa por ella pero no barre nada → franja de 0,9 sin holgura lateral
        const bal = h.tipo === 'balconera';
        const f = bal ? 0.9 : Math.min(1.1, Math.max(0.95, h.s1 - h.s0 + 0.15)), m = bal ? 0 : 0.1;
        this.reservas.push({ ...rectPared(w, h.s0 - m, h.s1 + m, 0, f), alto: -1, tipo: 'puerta', pared: w.i, h });
      } else {
        this.reservas.push({ ...rectPared(w, h.s0 - 0.05, h.s1 + 0.05, 0, 0.55), alto: h.y0 - 0.03, tipo: 'ventana', pared: w.i, h });
      }
    }
    this.piezas = [];
    const xs = this.poligono.map(p => p[0]), zs = this.poligono.map(p => p[1]);
    this.caja = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    this.rect = this.m.rect;
  }
  get W() { return this.caja.x1 - this.caja.x0; }
  get D() { return this.caja.z1 - this.caja.z0; }
  get area() { let s = 0; const P = this.poligono; for (let i = 0; i < P.length; i++) s += cruz(P[i], P[(i + 1) % P.length]); return Math.abs(s / 2); }

  // ¿El rectángulo cabe dentro de la estancia? (esquinas dentro y ningún vértice del polígono dentro del rectángulo)
  dentro(r, tol = 0.003) {
    const q = crecer(r, -tol);
    for (const p of [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]]) if (!enPoligono(p, this.poligono)) return false;
    return !this.poligono.some(([x, z]) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
  }
  // ¿Se puede poner aquí algo de este alto? (ignora: tipos de pieza que puede pisar, p. ej. la alfombra)
  libre(r, alto = 1, { ignorar = [], reservas = true } = {}) {
    if (!this.dentro(r)) return false;
    if (reservas) for (const z of this.reservas) if (solapa(r, z) && alto > z.alto) return false;
    // la cortina solo estorba a lo alto (un sofá o una cama baja pueden ir delante)
    for (const p of this.piezas) if (!ignorar.includes(p.tipo) && !p.suelo && !(p.tipo === 'cortina' && alto <= 1.0) && solapa(r, p)) return false;
    return true;
  }
  ocupar(r, tipo, alto = 1, extra = {}) { const p = { ...r, tipo, alto, ...extra }; this.piezas.push(p); return p; }

  // Tramos de pared sin huecos (s0, s1) de al menos `min` metros.
  tramosLibres(w, min = 0.4, yMax = 99) {
    const cortes = w.huecos.filter(h => h.puerta || h.y0 < yMax).map(h => [h.s0 - (h.puerta ? 0.08 : 0.03), h.s1 + (h.puerta ? 0.08 : 0.03)]).sort((a, b) => a[0] - b[0]);
    const out = []; let c = 0;
    for (const [a, b] of cortes) { if (a - c >= min) out.push([c, a]); c = Math.max(c, b); }
    if (w.largo - c >= min) out.push([c, w.largo]);
    return out;
  }
  // Mueble contra la pared: busca el s más cercano a `pref` donde cabe (con `frente` libre delante). null si no cabe.
  buscarEnPared(w, ancho, fondo, alto, { pref = null, frente = 0.6, sep = 0, paso = 0.05, ignorar = [], margen = 0.02 } = {}) {
    const s0 = ancho / 2 + margen, s1 = w.largo - ancho / 2 - margen;
    if (s1 < s0) return null;
    const p = pref == null ? (s0 + s1) / 2 : Math.max(s0, Math.min(s1, pref));
    const cand = [p];
    for (let d = paso; d <= w.largo; d += paso) { if (p - d >= s0) cand.push(p - d); if (p + d <= s1) cand.push(p + d); }
    for (const s of cand) {
      const r = rectPared(w, s - ancho / 2, s + ancho / 2, sep, sep + fondo);
      if (!this.libre(r, alto, { ignorar })) continue;
      if (frente > 0) {
        const f = rectPared(w, s - ancho / 2, s + ancho / 2, sep + fondo, sep + fondo + frente);
        if (!this.dentro(f) || this.piezas.some(q => !q.suelo && q.tipo !== 'cortina' && !ignorar.includes(q.tipo) && solapa(f, q))) continue;
      }
      return { w, s, r };
    }
    return null;
  }
  // Esquinas interiores libres (para plantas, lámparas de pie): punto a `d` de las dos paredes.
  esquinas(d = 0.25) {
    const out = [];
    const P = this.paredes;
    for (let i = 0; i < P.length; i++) {
      const w = P[i];
      for (const [s, sig] of [[0, 1], [w.largo, -1]]) {
        const p = puntoPared(w, s + sig * d, d);
        if (enPoligono(p, this.poligono)) out.push({ p, w, s: s + sig * d });
      }
    }
    return out;
  }
}
