// Modelo de vivienda: estancias (polígonos en cm), tabiques generados desde los bordes, huecos (puertas y ventanas)
// y la cocina de siempre guardada dentro de su estancia. Sin three: se prueba con node (tools/prueba-casa.mjs).
//
// Convenciones
// - Coordenadas de planta en cm: x → derecha, y → «hacia el fondo» (en 3D, x = x/100 y z = y/100).
// - Los polígonos van por el EJE de los tabiques y con área positiva (fórmula del lazo): así la normal interior
//   de cada borde a→b es n = (−dy, dx), que es el mismo convenio que las paredes de la cocina (modelo.js).
// - Todo tabique deja 5 cm de grosor hacia cada estancia; los exteriores crecen 20 cm más hacia fuera.
//   Por eso la medida libre de una estancia rectangular es siempre su lado menos 10 cm.
// - Un hueco se ancla a un borde de una estancia (estancia, borde, pos desde el inicio del borde). Al calcular los
//   tabiques se traslada al tabique que cubre ese tramo; si el tabique lo comparten dos estancias, sale una vez.
import { estadoInicial, autodistribuir, ajustarAltos, fondoSala, SUELOS, PAREDES } from '../modelo.js';

export const VERSION_CASA = 2;
export const CLAVE_CASA = 'cocina-xr-casa-v2';
export const CLAVE_V1 = 'cocina-xr-estado-v1';

export const CARA = 5;          // medio tabique hacia cada estancia (cm)
export const EXTRA_EXT = 20;    // cara de un tabique exterior hacia fuera (total 5 + 20 = 25 cm)
export const PRETIL = 105;      // alto del murete de una terraza
export const REJILLA = 5;       // ajuste del editor (cm)

export const TIPOS = {
  cocina: { nombre: 'Cocina', suelo: 'porcelanico', pintura: 'blanco', color: '#f2dfc1' },
  salon: { nombre: 'Salón', suelo: 'tarima', pintura: 'arena', color: '#e6ddcc' },
  dormitorio: { nombre: 'Dormitorio', suelo: 'tarima', pintura: 'blanco', color: '#dde3d6' },
  bano: { nombre: 'Baño', suelo: 'porcelanico', pintura: 'blanco', color: '#d5e2e8' },
  pasillo: { nombre: 'Pasillo', suelo: 'tarima', pintura: 'blanco', color: '#ece8e0' },
  recibidor: { nombre: 'Recibidor', suelo: 'tarima', pintura: 'blanco', color: '#ece8e0' },
  lavadero: { nombre: 'Lavadero', suelo: 'porcelanico', pintura: 'blanco', color: '#e1e4e6' },
  terraza: { nombre: 'Terraza', suelo: 'beige', pintura: 'blanco', color: '#e9e3d2' },
  otro: { nombre: 'Otra', suelo: 'porcelanico', pintura: 'blanco', color: '#e8e6e1' },
};

export const PINTURAS = {
  ...PAREDES,
  salvia: { nombre: 'Verde salvia', color: '#d3dacb' },
  niebla: { nombre: 'Azul niebla', color: '#d4dbe0' },
  arcilla: { nombre: 'Arcilla', color: '#e4cfbf' },
};
export const SUELOS_CASA = SUELOS;
export const FACHADA = '#e7e1d5';
export const YESO = '#f0eee9';

export const HUECOS = { abatible: 'Puerta abatible', corredera: 'Puerta corredera', ventana: 'Ventana', balconera: 'Balconera' };
export const esPuerta = h => h.tipo === 'abatible' || h.tipo === 'corredera';
export const HUECO_DEFECTO = {
  abatible: { ancho: 80, alto: 210, antepecho: 0 },
  corredera: { ancho: 80, alto: 210, antepecho: 0 },
  ventana: { ancho: 120, alto: 120, antepecho: 100 },
  balconera: { ancho: 140, alto: 215, antepecho: 0 },
};

let cont = 1;
export const nuevoIdCasa = p => p + (cont++).toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------- geometría de planta ----------------
export const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function areaFirmada(pol) {
  let s = 0;
  for (let i = 0; i < pol.length; i++) { const [x0, y0] = pol[i], [x1, y1] = pol[(i + 1) % pol.length]; s += x0 * y1 - x1 * y0; }
  return s / 2;
}
export const area = pol => Math.abs(areaFirmada(pol));
export const perimetro = pol => pol.reduce((s, p, i) => s + Math.hypot(pol[(i + 1) % pol.length][0] - p[0], pol[(i + 1) % pol.length][1] - p[1]), 0);
export function centroide(pol) {
  const A = areaFirmada(pol); if (Math.abs(A) < 1e-6) return [pol[0][0], pol[0][1]];
  let cx = 0, cy = 0;
  for (let i = 0; i < pol.length; i++) {
    const [x0, y0] = pol[i], [x1, y1] = pol[(i + 1) % pol.length]; const f = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [cx / (6 * A), cy / (6 * A)];
}
export function puntoEnPoligono([x, y], pol) {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
// Un punto dentro de la estancia aunque sea en L (el centroide de una L puede caer fuera)
export function puntoInterior(pol) {
  const c = centroide(pol); if (puntoEnPoligono(c, pol)) return c;
  for (const b of bordesDe(pol)) { const p = [b.a[0] + b.dir[0] * b.largo / 2 + b.n[0] * 30, b.a[1] + b.dir[1] * b.largo / 2 + b.n[1] * 30]; if (puntoEnPoligono(p, pol)) return p; }
  return c;
}
export function normalizarPoligono(pol) { return areaFirmada(pol) < 0 ? [...pol].reverse() : pol; }

export function bordesDe(pol) {
  return pol.map((a, i) => {
    const b = pol[(i + 1) % pol.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], largo = Math.hypot(dx, dy) || 1e-9;
    const dir = [dx / largo, dy / largo];
    return { i, a, b, largo, dir, n: [-dir[1], dir[0]] };
  });
}
export function caja(pol) {
  const xs = pol.map(p => p[0]), ys = pol.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
export function cajaCasa(casa) {
  const todos = casa.estancias.flatMap(e => e.poligono);
  return todos.length ? caja(todos) : { x0: 0, y0: 0, x1: 100, y1: 100 };
}
const cruz = (a, b) => a[0] * b[1] - a[1] * b[0];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1];
const resta = (a, b) => [a[0] - b[0], a[1] - b[1]];
function distRecta(p, a, dir) { return Math.abs(cruz(dir, resta(p, a))); }
export function distSegmento(p, a, b) {
  const d = resta(b, a), L2 = punto(d, d) || 1e-9;
  const t = Math.max(0, Math.min(1, punto(resta(p, a), d) / L2));
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t);
}
// cruce propio de dos segmentos (no cuenta tocarse ni ir superpuestos)
function cruzan(a, b, c, d) {
  const d1 = cruz(resta(b, a), resta(c, a)), d2 = cruz(resta(b, a), resta(d, a));
  const d3 = cruz(resta(d, c), resta(a, c)), d4 = cruz(resta(d, c), resta(b, c));
  const e = 1e-6;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}
export function esRectangulo(pol) {
  if (pol.length !== 4) return false;
  const B = bordesDe(pol);
  return B.every((b, i) => Math.abs(punto(b.dir, B[(i + 1) % 4].dir)) < 1e-3);
}

// ---------------- estancias y casa ----------------
export function nuevaEstancia(tipo, poligono, extra = {}) {
  const T = TIPOS[tipo] || TIPOS.otro;
  return {
    id: nuevoIdCasa('e'), nombre: T.nombre, tipo, poligono: normalizarPoligono(poligono.map(p => [p[0], p[1]])),
    suelo: T.suelo, pintura: T.pintura, alto: tipo === 'terraza' ? 0 : 260, paredA: 0, ...extra,
  };
}
export function nuevoHueco(tipo, estancia, borde, pos, extra = {}) {
  return { id: nuevoIdCasa('h'), tipo, estancia, borde, pos, ...HUECO_DEFECTO[tipo], mano: 'izquierda', abre: 'dentro', ...extra };
}
export const estanciaPorId = (casa, id) => casa.estancias.find(e => e.id === id);
export const cocinas = casa => casa.estancias.filter(e => e.tipo === 'cocina' && e.cocina);
export function cocinaActiva(casa) {
  const c = cocinas(casa);
  return c.find(e => e.id === casa.cocinaActiva) || c[0] || null;
}
export const esFuera = est => !est || est.tipo === 'terraza';

// ---------------- tabiques ----------------
// Devuelve { tabiques, porBorde } donde porBorde['idEstancia:borde'] = [{ tab, t0, t1, mismo }]
// (t0..t1 en cm sobre el borde; mismo = el tabique va en el mismo sentido que el borde).
export function calcularTabiques(casa) {
  const TOL = 0.6;
  const segs = [];
  for (const est of casa.estancias) for (const b of bordesDe(est.poligono)) segs.push({ est, ...b });
  const colineal = (s, o) => Math.abs(cruz(s.dir, o.dir)) < 1e-3 && distRecta(o.a, s.a, s.dir) < TOL;
  const mapa = new Map(), tabiques = [], porBorde = {};
  const clave = (p, q) => {
    const r = v => (Math.round(v * 10) / 10).toFixed(1);
    const A = r(p[0]) + ',' + r(p[1]), B = r(q[0]) + ',' + r(q[1]);
    return A < B ? A + '|' + B : B + '|' + A;
  };
  for (const s of segs) {
    const cortes = [0, s.largo];
    const vecinos = segs.filter(o => o.est !== s.est && colineal(s, o));
    for (const o of vecinos) for (const p of [o.a, o.b]) {
      const t = punto(resta(p, s.a), s.dir);
      if (t > TOL && t < s.largo - TOL) cortes.push(t);
    }
    cortes.sort((x, y) => x - y);
    const ts = cortes.filter((t, i) => i === 0 || t - cortes[i - 1] > TOL);
    if (s.largo - ts[ts.length - 1] < TOL) ts[ts.length - 1] = s.largo; else ts.push(s.largo);
    const lista = porBorde[s.est.id + ':' + s.i] = [];
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < TOL) continue;
      const p0 = [s.a[0] + s.dir[0] * t0, s.a[1] + s.dir[1] * t0], p1 = [s.a[0] + s.dir[0] * t1, s.a[1] + s.dir[1] * t1];
      const tm = (t0 + t1) / 2, m = [s.a[0] + s.dir[0] * tm, s.a[1] + s.dir[1] * tm];
      const otra = vecinos.find(o => punto(o.dir, s.dir) < 0 && (() => { const u = punto(resta(m, o.a), o.dir); return u > TOL && u < o.largo - TOL; })());
      const k2 = clave(p0, p1);
      let tab = mapa.get(k2);
      if (!tab) {
        tab = { id: 't' + tabiques.length, a: p0, b: p1, largo: t1 - t0, dir: s.dir, n: s.n, mas: s.est.id, menos: otra ? otra.est.id : null, huecos: [] };
        mapa.set(k2, tab); tabiques.push(tab);
      }
      const mismo = Math.hypot(tab.a[0] - p0[0], tab.a[1] - p0[1]) < 1;
      lista.push({ tab, t0, t1, mismo });
    }
  }
  // grosores y altos
  const porId = Object.fromEntries(casa.estancias.map(e => [e.id, e]));
  for (const t of tabiques) {
    const em = porId[t.mas], en = t.menos ? porId[t.menos] : null;
    const fm = esFuera(em), fn = esFuera(en);
    t.exterior = fm || fn;
    // cara hacia cada lado (cm): 5 hacia una estancia; el lado de fuera se lleva el grosor de fachada
    if (fm && fn) { t.emas = CARA; t.emenos = en ? CARA : EXTRA_EXT; } // terraza ↔ calle o terraza ↔ terraza
    else if (fn) { t.emas = CARA; t.emenos = EXTRA_EXT; }
    else if (fm) { t.emas = EXTRA_EXT; t.emenos = CARA; }
    else { t.emas = CARA; t.emenos = CARA; }
    t.grosor = t.emas + t.emenos;
    const altos = [em, en].filter(e => e && !esFuera(e)).map(e => e.alto);
    t.alto = altos.length ? Math.max(...altos) : PRETIL;
  }
  // huecos → tabique
  for (const h of casa.huecos) {
    const r = ubicarHueco(porBorde, h);
    if (r) r.tab.huecos.push({ h, s0: r.s0, s1: r.s0 + h.ancho, lado: r.lado });
  }
  for (const t of tabiques) t.huecos.sort((x, y) => x.s0 - y.s0);
  return { tabiques, porBorde };
}

// tramo del tabique en el que cae un hueco; null si se sale del borde o cruza un cambio de tabique
export function ubicarHueco(porBorde, h) {
  const lista = porBorde[h.estancia + ':' + h.borde]; if (!lista) return null;
  const seg = lista.find(s => h.pos >= s.t0 - 0.5 && h.pos + h.ancho <= s.t1 + 0.5);
  if (!seg) return null;
  const s0 = seg.mismo ? h.pos - seg.t0 : seg.t1 - (h.pos + h.ancho);
  return { tab: seg.tab, s0, lado: seg.mismo ? 1 : -1 };
}

// Huecos que caen en un borde de una estancia (estén guardados en esa estancia o en la vecina), en coords del borde.
export function huecosDeBorde(tabs, estId, borde) {
  const lista = tabs.porBorde[estId + ':' + borde] || [];
  const out = [];
  for (const s of lista) for (const q of s.tab.huecos) {
    const pos = s.mismo ? s.t0 + q.s0 : s.t1 - q.s1;
    if (pos >= s.t0 - 0.5 && pos + q.h.ancho <= s.t1 + 0.5) out.push({ h: q.h, pos });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

// ---------------- marco local de una estancia (cocina, baño…) ----------------
// Origen en la esquina interior entre la pared B y la pared A; x a lo largo de A, z hacia dentro. Medidas libres.
export function marcoEstancia(est) {
  const B = bordesDe(est.poligono), n = B.length, k = ((est.paredA || 0) % n + n) % n;
  const a = B[k];
  const origen = [a.a[0] + a.dir[0] * CARA + a.n[0] * CARA, a.a[1] + a.dir[1] * CARA + a.n[1] * CARA];
  // fondo: lo más lejano del polígono respecto a la pared A
  let fondo = 0;
  for (const p of est.poligono) fondo = Math.max(fondo, punto(resta(p, a.a), a.n));
  const rect = esRectangulo(est.poligono);
  return {
    k, origen, dir: a.dir, n: a.n, rect,
    A: a.largo - 2 * CARA, fondo: fondo - 2 * CARA, alto: est.alto,
    letras: rect ? { A: k, C: (k + 1) % 4, D: (k + 2) % 4, B: (k + 3) % 4 } : { A: k },
  };
}
export const planoALocal = (m, p) => { const d = resta(p, m.origen); return [punto(d, m.dir), punto(d, m.n)]; };
export const localAPlano = (m, [x, z]) => [m.origen[0] + m.dir[0] * x + m.n[0] * z, m.origen[1] + m.dir[1] * x + m.n[1] * z];

// ---------------- sincronización cocina ↔ casa ----------------
function ventanaDerivada(casa, est, tabs) {
  const m = marcoEstancia(est);
  for (const L of ['A', 'B', 'C', 'D']) {
    const borde = m.letras[L]; if (borde == null) continue;
    const v = huecosDeBorde(tabs, est.id, borde).find(q => q.h.tipo === 'ventana');
    if (v) return { hueco: v.h, borde, v: { pared: L, x: Math.round(v.pos - CARA), ancho: v.h.ancho, alto: v.h.alto, antepecho: v.h.antepecho, activa: true } };
  }
  return null;
}

// La casa manda: medidas, alto, suelo, pintura y ventana pasan al estado de la cocina.
export function haciaCocina(casa, est, tabs = calcularTabiques(casa)) {
  const k = est.cocina; if (!k) return;
  const m = marcoEstancia(est);
  k.sala.A = Math.round(m.A);
  const fondo = Math.round(m.fondo);
  if (k.forma === 'paralelo') k.sala.pasillo = Math.max(60, fondo - 120);
  else { k.sala.fondo = fondo; k.sala.B = Math.min(k.sala.B, fondo); k.sala.C = Math.min(k.sala.C, fondo); }
  k.sala.alto = est.alto;
  if (SUELOS[est.suelo]) k.estilo.suelo = est.suelo;
  if (PAREDES[est.pintura]) k.estilo.pared = est.pintura;
  const antes = JSON.stringify(k.ventana);
  const d = ventanaDerivada(casa, est, tabs);
  if (d) k.ventana = { ...k.ventana, ...d.v };
  else k.ventana = { ...k.ventana, activa: false };
  if (JSON.stringify(k.ventana) !== antes) ajustarAltos(k);
}

// La cocina manda (tras editar en las pestañas de cocina): mueve tabiques, alto, suelo, pintura y ventana.
export function desdeCocina(casa, est) {
  const k = est.cocina; if (!k) return;
  let m = marcoEstancia(est);
  if (m.rect) {
    const dA = k.sala.A - m.A;
    if (Math.abs(dA) >= 0.5) moverBorde(casa, est.id, m.letras.C, dA);
    const dD = Math.round(fondoSala(k) * 100) - m.fondo;
    if (Math.abs(dD) >= 0.5) moverBorde(casa, est.id, m.letras.D, dD);
    m = marcoEstancia(est);
  }
  est.alto = k.sala.alto;
  est.suelo = k.estilo.suelo;
  est.pintura = k.estilo.pared;
  const tabs = calcularTabiques(casa);
  const d = ventanaDerivada(casa, est, tabs);
  const v = k.ventana;
  if (!v.activa) { if (d) casa.huecos = casa.huecos.filter(h => h !== d.hueco); return; }
  const borde = m.letras[v.pared] ?? m.letras.A;
  const datos = { estancia: est.id, borde, pos: v.x + CARA, ancho: v.ancho, alto: v.alto, antepecho: v.antepecho };
  if (d) {
    const igual = d.v.pared === v.pared && d.v.x === v.x && d.v.ancho === v.ancho && d.v.alto === v.alto && d.v.antepecho === v.antepecho;
    if (!igual) Object.assign(d.hueco, datos);
  } else casa.huecos.push(nuevoHueco('ventana', est.id, borde, datos.pos, datos));
}

export function sincronizarCocinas(casa) {
  const tabs = calcularTabiques(casa);
  for (const e of cocinas(casa)) haciaCocina(casa, e, tabs);
}

// ---------------- ediciones de planta ----------------
const cerca = (p, q, tol = 1) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;

// Guarda la posición absoluta de cada hueco para devolverlos a su sitio tras mover vértices.
function fijarHuecos(casa) {
  return casa.huecos.map(h => {
    const est = estanciaPorId(casa, h.estancia); if (!est) return null;
    const b = bordesDe(est.poligono)[h.borde]; if (!b) return null;
    return { h, p: [b.a[0] + b.dir[0] * h.pos, b.a[1] + b.dir[1] * h.pos] };
  });
}
function restaurarHuecos(casa, fijos) {
  for (const f of fijos) {
    if (!f) continue;
    const est = estanciaPorId(casa, f.h.estancia); const b = bordesDe(est.poligono)[f.h.borde];
    const pos = punto(resta(f.p, b.a), b.dir);
    f.h.pos = Math.round(Math.max(CARA, Math.min(b.largo - f.h.ancho - CARA, pos)) * 10) / 10;
  }
}

export function moverVertice(casa, desde, hasta) {
  const fijos = fijarHuecos(casa);
  for (const e of casa.estancias) for (const p of e.poligono) if (cerca(p, desde)) { p[0] = hasta[0]; p[1] = hasta[1]; }
  restaurarHuecos(casa, fijos);
}

// Desplaza un borde hacia fuera de su estancia d cm (negativo: hacia dentro). Arrastra los vértices de otras
// estancias que estén sobre ese tabique, para que los tabiques compartidos sigan siéndolo.
export function moverBorde(casa, estId, borde, d) {
  const est = estanciaPorId(casa, estId); if (!est) return;
  const b = bordesDe(est.poligono)[borde]; if (!b) return;
  const desp = [-b.n[0] * d, -b.n[1] * d];
  const a0 = [...b.a], b0 = [...b.b];
  const fijos = fijarHuecos(casa);
  for (const e of casa.estancias) for (const p of e.poligono) {
    if (distSegmento(p, a0, b0) < 1) { p[0] += desp[0]; p[1] += desp[1]; }
  }
  restaurarHuecos(casa, fijos);
}

export const ajustar = v => Math.round(v / REJILLA) * REJILLA;

export const edCasa = {
  anadirEstancia(casa, tipo = 'dormitorio', ancho = 300, fondo = 300) {
    const c = cajaCasa(casa);
    const x0 = casa.estancias.length ? ajustar(c.x1) : 0, y0 = casa.estancias.length ? ajustar(c.y0) : 0;
    const est = nuevaEstancia(tipo, rect(x0, y0, x0 + ancho, y0 + fondo));
    casa.estancias.push(est);
    if (tipo === 'cocina') prepararCocina(casa, est);
    return est;
  },
  quitarEstancia(casa, id) {
    const est = estanciaPorId(casa, id); if (!est) return false;
    if (est.tipo === 'cocina' && cocinas(casa).length <= 1) return false;
    casa.estancias = casa.estancias.filter(e => e !== est);
    casa.huecos = casa.huecos.filter(h => h.estancia !== id);
    if (casa.cocinaActiva === id) casa.cocinaActiva = cocinas(casa)[0]?.id ?? null;
    return true;
  },
  cambiarTipo(casa, id, tipo) {
    const est = estanciaPorId(casa, id); if (!est || est.tipo === tipo) return false;
    if (est.tipo === 'cocina' && cocinas(casa).length <= 1) return false;
    const T = TIPOS[tipo] || TIPOS.otro;
    if (est.nombre === (TIPOS[est.tipo]?.nombre)) est.nombre = T.nombre;
    est.tipo = tipo; est.suelo = T.suelo; est.pintura = T.pintura;
    if (tipo === 'terraza') est.alto = 0; else if (!est.alto) est.alto = 260;
    if (tipo === 'cocina') prepararCocina(casa, est); else delete est.cocina;
    return true;
  },
  anadirHueco(casa, tipo, estId, borde) {
    const est = estanciaPorId(casa, estId); if (!est) return null;
    const b = bordesDe(est.poligono)[borde]; if (!b) return null;
    const ancho = Math.min(HUECO_DEFECTO[tipo].ancho, Math.max(40, b.largo - 2 * CARA - 10));
    const h = nuevoHueco(tipo, estId, borde, ajustar(b.largo / 2 - ancho / 2), { ancho });
    casa.huecos.push(h); return h;
  },
  quitarHueco(casa, id) { casa.huecos = casa.huecos.filter(h => h.id !== id); },
};

export function prepararCocina(casa, est) {
  if (est.cocina) return;
  const k = estadoInicial();
  est.cocina = k;
  if (!casa.cocinaActiva || !estanciaPorId(casa, casa.cocinaActiva)) casa.cocinaActiva = est.id;
  haciaCocina(casa, est);
  const m = marcoEstancia(est);
  k.forma = m.A >= 240 && m.fondo >= 230 ? 'L' : 'lineal';
  if (k.forma === 'L') k.sala.B = Math.min(250, Math.round(m.fondo));
  autodistribuir(k);
}

// ---------------- plantillas ----------------
function casaVacia(nombre) { return { version: VERSION_CASA, nombre, estancias: [], huecos: [], cocinaActiva: null }; }

function montar(nombre, defs, huecos) {
  const casa = casaVacia(nombre);
  const ids = {};
  for (const [clave, tipo, pol, extra] of defs) { const e = nuevaEstancia(tipo, pol, extra); ids[clave] = e.id; casa.estancias.push(e); }
  for (const [tipo, clave, borde, pos, extra] of huecos) casa.huecos.push(nuevoHueco(tipo, ids[clave], borde, pos, extra));
  for (const e of casa.estancias) if (e.tipo === 'cocina') prepararCocina(casa, e);
  sincronizarCocinas(casa);
  return casa;
}

// Pisos de dos crujías, como los de cualquier bloque español: la fila de arriba (y = 0) da al patio (cocina, baño y
// dormitorios secundarios), la de abajo a la calle (salón y dormitorio principal) y entre las dos va la banda de
// recibidor y pasillo (1 m libre). La entrada está en el lado izquierdo (x = 0), que es el rellano: ahí no hay
// ventanas. Los tabiques transversales siguen la misma línea a los dos lados del pasillo siempre que se puede, todas
// las puertas abren hacia la estancia a la que dan (no barren el pasillo) y los baños abren al pasillo, nunca a la
// cocina. La cocina deja libres las paredes A (ventana) y B (izquierda) para la L: su puerta va en la pared D.
// Bordes de un rect(x0, y0, x1, y1): 0 = arriba (y0, de x0 a x1), 1 = derecha (x1, de y0 a y1),
// 2 = abajo (y1, de x1 a x0), 3 = izquierda (x0, de y1 a y0); «pos» se mide desde el inicio del borde.
export const PLANTILLAS = {
  soloCocina: { nombre: 'Solo cocina', sub: 'una estancia, como antes', crear: () => casaDesdeCocina(estadoInicial()) },
  piso1: {
    nombre: 'Piso 1 dormitorio', sub: '≈ 55 m² · salón, cocina, dormitorio, baño',
    crear: () => montar('Piso 1 dormitorio', [
      ['cocina', 'cocina', rect(0, 0, 300, 300)],
      ['bano', 'bano', rect(300, 0, 480, 300)],
      ['dorm', 'dormitorio', rect(480, 0, 760, 410)],
      ['recibidor', 'recibidor', rect(0, 300, 480, 410)],
      ['salon', 'salon', rect(0, 410, 760, 730), { nombre: 'Salón-comedor' }],
    ], [
      ['abatible', 'recibidor', 3, 15, { ancho: 85, mano: 'derecha' }],          // entrada desde el rellano
      ['abatible', 'cocina', 2, 20, { ancho: 80 }],
      ['ventana', 'cocina', 0, 110, { ancho: 120, alto: 120, antepecho: 105 }],
      ['abatible', 'bano', 2, 20, { ancho: 70 }],
      ['ventana', 'bano', 0, 55, { ancho: 60, alto: 60, antepecho: 150 }],
      ['abatible', 'dorm', 3, 15, { ancho: 80 }],                                // al fondo del recibidor
      ['ventana', 'dorm', 0, 75, { ancho: 120 }],
      ['abatible', 'salon', 0, 150, { ancho: 90 }],                              // recibidor ↔ salón
      ['balconera', 'salon', 2, 140, { ancho: 160 }],
      ['ventana', 'salon', 2, 500, { ancho: 140 }],
    ]),
  },
  piso2: {
    nombre: 'Piso 2 dormitorios', sub: '≈ 70 m² · salón, cocina, 2 dormitorios, 1 baño',
    crear: () => montar('Piso 2 dormitorios', [
      ['cocina', 'cocina', rect(0, 0, 400, 300)],
      ['bano', 'bano', rect(400, 0, 580, 300)],
      ['dorm2', 'dormitorio', rect(580, 0, 860, 410), { nombre: 'Dormitorio 2', pintura: 'salvia' }],
      ['recibidor', 'recibidor', rect(0, 300, 580, 410), { nombre: 'Recibidor y distribuidor' }],
      ['salon', 'salon', rect(0, 410, 480, 810), { nombre: 'Salón-comedor' }],
      ['dorm1', 'dormitorio', rect(480, 410, 860, 810), { nombre: 'Dormitorio principal' }],
    ], [
      ['abatible', 'recibidor', 3, 15, { ancho: 85, mano: 'derecha' }],          // entrada desde el rellano
      ['abatible', 'cocina', 2, 20, { ancho: 80 }],
      ['ventana', 'cocina', 0, 140, { ancho: 120, alto: 120, antepecho: 105 }],
      ['abatible', 'salon', 0, 150, { ancho: 90 }],                              // recibidor ↔ salón
      ['abatible', 'bano', 2, 15, { ancho: 70 }],
      ['ventana', 'bano', 0, 55, { ancho: 60, alto: 60, antepecho: 150 }],
      ['abatible', 'dorm2', 3, 15, { ancho: 80 }],                               // al fondo del distribuidor
      ['ventana', 'dorm2', 0, 75, { ancho: 120 }],
      ['abatible', 'dorm1', 0, 10, { ancho: 80 }],
      ['ventana', 'dorm1', 2, 120, { ancho: 140 }],
      ['balconera', 'salon', 2, 60, { ancho: 140 }],
      ['ventana', 'salon', 2, 300, { ancho: 120 }],
    ]),
  },
  piso3: {
    nombre: 'Piso 3 dormitorios', sub: '≈ 89 m² · baño, dormitorio en suite con vestidor y terraza',
    crear: () => montar('Piso 3 dormitorios', [
      ['cocina', 'cocina', rect(0, 0, 360, 310)],
      ['bano', 'bano', rect(360, 0, 530, 310)],
      ['dorm3', 'dormitorio', rect(530, 0, 820, 310), { nombre: 'Dormitorio 3', pintura: 'niebla' }],
      ['dorm2', 'dormitorio', rect(820, 0, 1080, 420), { nombre: 'Dormitorio 2', pintura: 'salvia' }],
      ['recibidor', 'recibidor', rect(0, 310, 360, 420)],
      ['pasillo', 'pasillo', rect(360, 310, 820, 420)],
      ['salon', 'salon', rect(0, 420, 530, 820), { nombre: 'Salón-comedor' }],
      ['dorm1', 'dormitorio', rect(530, 420, 920, 820), { nombre: 'Dormitorio principal' }],
      ['vestidor', 'otro', rect(920, 420, 1080, 580), { nombre: 'Vestidor', suelo: 'tarima' }],
      ['suite', 'bano', rect(920, 580, 1080, 820), { nombre: 'Baño en suite' }],
      ['terraza', 'terraza', rect(0, 820, 530, 970)],
    ], [
      ['abatible', 'recibidor', 3, 15, { ancho: 85, mano: 'derecha' }],          // entrada desde el rellano
      ['abatible', 'cocina', 2, 20, { ancho: 80 }],
      ['ventana', 'cocina', 0, 120, { ancho: 120, alto: 120, antepecho: 105 }],
      ['abatible', 'salon', 0, 150, { ancho: 90 }],                              // recibidor ↔ salón
      ['abatible', 'pasillo', 3, 15, { ancho: 80 }],            // paso a la zona de noche
      ['abatible', 'bano', 2, 15, { ancho: 70 }],
      ['ventana', 'bano', 0, 50, { ancho: 60, alto: 60, antepecho: 150 }],
      ['abatible', 'dorm3', 2, 200, { ancho: 80, mano: 'derecha' }],
      ['ventana', 'dorm3', 0, 85, { ancho: 120 }],
      ['abatible', 'dorm2', 3, 15, { ancho: 80 }],                               // al fondo del pasillo
      ['ventana', 'dorm2', 0, 65, { ancho: 120 }],
      ['abatible', 'dorm1', 0, 10, { ancho: 80 }],
      ['ventana', 'dorm1', 2, 125, { ancho: 140 }],
      ['corredera', 'vestidor', 3, 80, { ancho: 70 }],                           // vestidor y baño en suite: desde el dormitorio
      ['abatible', 'suite', 3, 155, { ancho: 70 }],
      ['ventana', 'suite', 2, 50, { ancho: 60, alto: 60, antepecho: 150 }],
      ['balconera', 'salon', 2, 170, { ancho: 200 }],                            // salón ↔ terraza
      ['ventana', 'salon', 2, 390, { ancho: 120 }],
    ]),
  },
};

// ---------------- migración y carga ----------------
// Estado v1 (una cocina) → casa con una sola estancia cocina. Las cuatro paredes pasan a ser fachada.
export function casaDesdeCocina(e) {
  const W = e.sala.A + 2 * CARA, D = Math.round(fondoSala(e) * 100) + 2 * CARA;
  const est = nuevaEstancia('cocina', rect(0, 0, W, D), { alto: e.sala.alto, suelo: e.estilo.suelo, pintura: e.estilo.pared, cocina: e });
  const casa = { ...casaVacia('Cocina'), estancias: [est], cocinaActiva: est.id };
  const v = e.ventana;
  if (v?.activa) {
    const borde = { A: 0, C: 1, D: 2, B: 3 }[v.pared] ?? 0;
    casa.huecos.push(nuevoHueco('ventana', est.id, borde, v.x + CARA, { ancho: v.ancho, alto: v.alto, antepecho: v.antepecho }));
  }
  sincronizarCocinas(casa);
  return casa;
}

// Acepta una casa (v2) o una cocina suelta (v1). Devuelve null si no lo entiende.
export function cargarCasa(dato) {
  if (!dato || typeof dato !== 'object') return null;
  if (dato.version === VERSION_CASA && Array.isArray(dato.estancias)) {
    for (const e of dato.estancias) e.poligono = normalizarPoligono(e.poligono);
    dato.huecos ||= [];
    if (!cocinaActiva(dato) && cocinas(dato).length) dato.cocinaActiva = cocinas(dato)[0].id;
    sincronizarCocinas(dato);
    return dato;
  }
  if (dato.version === 1 && dato.sala && dato.tramos) return casaDesdeCocina(dato);
  return null;
}

// Lee de localStorage (o de un objeto con getItem): primero la casa; si no hay, migra la cocina v1.
export function leerGuardado(almacen) {
  const leer = k => { try { return JSON.parse(almacen.getItem(k)); } catch { return null; } };
  return cargarCasa(leer(CLAVE_CASA)) || cargarCasa(leer(CLAVE_V1)) || PLANTILLAS.soloCocina.crear();
}

// ---------------- validaciones ----------------
function autocruce(pol) {
  const n = pol.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cruzan(pol[i], pol[(i + 1) % n], pol[j], pol[(j + 1) % n])) return true;
  }
  return false;
}
function solapan(p, q) {
  for (const a of bordesDe(p)) for (const b of bordesDe(q)) if (cruzan(a.a, a.b, b.a, b.b)) return true;
  // contención: un punto claramente interior de una dentro de la otra
  const dentro = (x, y) => { const c = puntoInterior(x); return puntoEnPoligono(c, y) && !bordesDe(y).some(b => distSegmento(c, b.a, b.b) < 1); };
  if (dentro(p, q) || dentro(q, p)) return true;
  // mismo borde recorrido en el mismo sentido = se pisan
  for (const a of bordesDe(p)) for (const b of bordesDe(q)) {
    if (Math.abs(cruz(a.dir, b.dir)) < 1e-3 && punto(a.dir, b.dir) > 0 && distRecta(b.a, a.a, a.dir) < 0.6) {
      const t0 = punto(resta(b.a, a.a), a.dir), t1 = t0 + b.largo;
      if (Math.min(t1, a.largo) - Math.max(t0, 0) > 1) return true;
    }
  }
  return false;
}

export function validar(casa, tabs = calcularTabiques(casa)) {
  const out = [];
  const err = (texto, extra) => out.push({ nivel: 'error', texto, ...extra });
  const avi = (texto, extra) => out.push({ nivel: 'aviso', texto, ...extra });
  for (const e of casa.estancias) {
    if (e.poligono.length < 3) err(`${e.nombre}: necesita al menos 3 esquinas`, { estancia: e.id });
    else if (area(e.poligono) < 10000) err(`${e.nombre}: mide menos de 1 m²`, { estancia: e.id });
    else if (autocruce(e.poligono)) err(`${e.nombre}: sus paredes se cruzan`, { estancia: e.id });
    if (e.tipo !== 'terraza' && (e.alto < 220 || e.alto > 400)) avi(`${e.nombre}: alto de techo raro (${e.alto} cm)`, { estancia: e.id });
  }
  for (let i = 0; i < casa.estancias.length; i++) for (let j = i + 1; j < casa.estancias.length; j++) {
    const a = casa.estancias[i], b = casa.estancias[j];
    if (solapan(a.poligono, b.poligono)) err(`${a.nombre} y ${b.nombre} se solapan`, { estancia: a.id });
  }
  for (const h of casa.huecos) {
    const est = estanciaPorId(casa, h.estancia);
    const nom = `${HUECOS[h.tipo] || 'Hueco'}${est ? ' de ' + est.nombre : ''}`;
    if (!est || !bordesDe(est.poligono)[h.borde]) { err(`${nom}: no está en ningún tabique`, { hueco: h.id }); continue; }
    if (h.ancho < 40) err(`${nom}: demasiado estrecho (${h.ancho} cm)`, { hueco: h.id });
    const r = ubicarHueco(tabs.porBorde, h);
    if (!r) { err(`${nom}: se sale del tabique o cruza una esquina`, { hueco: h.id }); continue; }
    if (r.s0 < CARA - 0.5 || r.s0 + h.ancho > r.tab.largo - CARA + 0.5) err(`${nom}: se mete en el tabique de al lado`, { hueco: h.id });
    if (h.antepecho + h.alto > r.tab.alto - 5) err(`${nom}: más alto que el techo`, { hueco: h.id });
    const otros = r.tab.huecos.filter(q => q.h !== h && q.s0 < r.s0 + h.ancho && q.s1 > r.s0);
    if (otros.length) err(`${nom}: se pisa con otro hueco`, { hueco: h.id });
    if (esPuerta(h) && r.tab.alto <= PRETIL) avi(`${nom}: puerta en un murete de terraza`, { hueco: h.id });
  }
  if (!cocinas(casa).length) avi('La vivienda no tiene cocina');
  return out;
}

// m² a ejes y útiles aproximados (descontando medio tabique por todo el perímetro)
export function superficies(casa) {
  let construida = 0, util = 0;
  for (const e of casa.estancias) {
    const A = area(e.poligono) / 1e4;
    const u = (area(e.poligono) - perimetro(e.poligono) * CARA) / 1e4;
    if (e.tipo !== 'terraza') { construida += A; util += u; }
  }
  return { construida, util };
}
export const utilEstancia = e => Math.max(0, (area(e.poligono) - perimetro(e.poligono) * CARA) / 1e4);
