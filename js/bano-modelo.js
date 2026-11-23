// Modelo del baño: sala rectangular, puerta, ventana, revestimientos y piezas sobre paredes. Todo en cm y sin three,
// para poder probarlo en node (tools/prueba-bano.mjs). La escena 3D (js/bano.js) lo pasa a metros.
//
// Paredes (igual que la cocina): A en z=0 (de referencia), B en x=0, C en x=ancho, D en z=fondo.
// En cada pared, s va de izquierda a derecha mirándola desde dentro y d es la distancia hacia dentro.
// Cada pieza guarda `pared`, `x` = CENTRO sobre la pared (cm; en el inodoro y el bidé es el eje) y sus medidas.
// La puerta y la ventana guardan `x` = INICIO del hueco (como la ventana de la cocina).
import { SERIES, PAREDES } from './modelo.js';

export { SERIES };

// ---------- Catálogos ----------
export const ANCHOS_MUEBLE = [60, 80, 100, 120];
export const MONTAJES = { suspendido: 'Suspendido', suelo: 'Al suelo' };
export const FRENTES_MUEBLE = { cajones: 'Cajones', puertas: 'Puertas' };
export const LAVABOS = { integrado: 'Integrado (encimera de porcelana)', sobre: 'Sobre encimera' };
export const ESPEJOS = { rectangular: 'Rectangular', redondo: 'Redondo', ninguno: 'Sin espejo' };
export const CISTERNAS = { empotrada: 'Empotrada (pulsador)', vista: 'Vista' };
export const COLORES_PLATO = {
  blanco: { nombre: 'Blanco', color: '#ecebe7' }, gris: { nombre: 'Gris', color: '#8e8f8f' },
  negro: { nombre: 'Negro', color: '#2b2b2d' }, arena: { nombre: 'Arena', color: '#cbb99d' },
};
export const MAMPARAS = { corredera: 'Corredera', abatible: 'Abatible', fija: 'Fija (walk-in)', ninguna: 'Sin mampara' };
export const MAMPARAS_BANERA = { ninguna: 'Sin mampara', fija: 'Panel fijo' };
export const ACABADOS_METAL = { cromo: 'Cromo', negro: 'Negro mate', oro: 'Oro cepillado' };
export const ROCIADORES = { techo: 'Rociador de techo', columna: 'Columna termostática' };
export const LARGOS_BANERA = [160, 170, 180];
export const PLATO = { anchoMin: 70, anchoMax: 200, fondoMin: 70, fondoMax: 90 };
export const REVESTIMIENTOS = {
  r30x60: { nombre: 'Rectangular 30×60', ancho: 60, alto: 30 },
  r60x120: { nombre: 'Gran formato 60×120', ancho: 60, alto: 120 },
  metro: { nombre: 'Metro 7,5×15', ancho: 15, alto: 7.5 },
  hexagonal: { nombre: 'Hexagonal 20 cm', ancho: 17.3, alto: 20 },
};
export const ALTURAS_ALICATADO = { completa: 'Hasta el techo', media: 'Media altura (120 cm)', ducha: 'Solo zona de agua' };
export const COLORES_AZULEJO = {
  blanco: { nombre: 'Blanco', color: '#f1f0ec' }, arena: { nombre: 'Arena', color: '#ddd1bd' },
  gris: { nombre: 'Gris perla', color: '#bdbcb8' }, verde: { nombre: 'Verde salvia', color: '#9dab97' },
  antracita: { nombre: 'Antracita', color: '#46474a' },
};
export const SUELOS_BANO = {
  gris: { nombre: 'Porcelánico gris', color: '#c9c7c2' }, beige: { nombre: 'Porcelánico beige', color: '#d6cab6' },
  antracita: { nombre: 'Porcelánico antracita', color: '#6d6c69' }, madera: { nombre: 'Porcelánico madera', color: '#b48d62' },
};
export const PAREDES_BANO = PAREDES; // la pintura del baño en la vivienda es la de su estancia (bano-estado.js la copia)
export const TIPOS = { mueble: 'Mueble de lavabo', inodoro: 'Inodoro', bide: 'Bidé', ducha: 'Plato de ducha', banera: 'Bañera', radiador: 'Radiador toallero' };

// Medidas fijas (cm)
export const MED = {
  fondoMueble: 46, bastidor: 18, taza: 36, fondoTaza: 54, fondoTazaSuelo: 56, fondoConCisterna: 66,
  huecoInodoro: 38, huecoBide: 36, zonaUso: 70, fondoBanera: 70, fondoRadiador: 12, pasoDucha: 55,
  alturaMedia: 120, alturaMampara: 195, alturaBastidor: 120,
};

const ORDEN_TIPOS = ['ducha', 'banera', 'inodoro', 'bide', 'mueble', 'radiador'];
let contador = 1;
export const nuevoId = () => 'b' + (contador++).toString(36) + Math.random().toString(36).slice(2, 5);

// ---------- Geometría de la sala ----------
export const VECINOS = { A: ['B', 'C'], B: ['D', 'A'], C: ['A', 'D'], D: ['C', 'B'] }; // pared en s=0 y en s=largo
export const OPUESTA = { A: 'D', D: 'A', B: 'C', C: 'B' };

export function paredesBano(e) {
  const W = e.sala.ancho, D = e.sala.fondo;
  return {
    A: { id: 'A', a: [0, 0], dir: [1, 0], n: [0, 1], largo: W },
    B: { id: 'B', a: [0, D], dir: [0, -1], n: [1, 0], largo: D },
    C: { id: 'C', a: [W, 0], dir: [0, 1], n: [-1, 0], largo: D },
    D: { id: 'D', a: [W, D], dir: [-1, 0], n: [0, -1], largo: W },
  };
}

// Rectángulo en planta (x, z de la sala) a partir de coordenadas de pared (s, d).
export function rectPared(P, s0, s1, d0, d1) {
  const xs = [], zs = [];
  for (const s of [s0, s1]) for (const d of [d0, d1]) { xs.push(P.a[0] + P.dir[0] * s + P.n[0] * d); zs.push(P.a[1] + P.dir[1] * s + P.n[1] * d); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
// Y al revés: un rectángulo de planta visto desde una pared → rangos s y d.
export function aPared(P, r) {
  const ss = [], dd = [];
  for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) {
    const vx = x - P.a[0], vz = z - P.a[1];
    ss.push(vx * P.dir[0] + vz * P.dir[1]); dd.push(vx * P.n[0] + vz * P.n[1]);
  }
  return { s0: Math.min(...ss), s1: Math.max(...ss), d0: Math.min(...dd), d1: Math.max(...dd) };
}
const solape = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const cruzan = (r, q, tol = 0.5) => solape(r.x0, r.x1, q.x0, q.x1) > tol && solape(r.z0, r.z1, q.z0, q.z1) > tol;
const fuera = (r, e, tol = 0.5) => r.x0 < -tol || r.z0 < -tol || r.x1 > e.sala.ancho + tol || r.z1 > e.sala.fondo + tol;

export const necesitaBastidor = el => (el.tipo === 'inodoro' && (el.montaje === 'suspendido' || el.cisterna === 'empotrada')) || (el.tipo === 'bide' && el.montaje === 'suspendido');

// Medidas de una pieza sobre su pared: huella [s0,s1]×[0,d], hueco de reparto (con holgura lateral) y zona de uso delante.
export function medidas(el) {
  const x = el.x;
  switch (el.tipo) {
    case 'mueble': return { s0: x - el.ancho / 2, s1: x + el.ancho / 2, d: MED.fondoMueble, h0: x - el.ancho / 2, h1: x + el.ancho / 2, zona: [x - el.ancho / 2, x + el.ancho / 2] };
    case 'inodoro': {
      const d = necesitaBastidor(el) ? MED.bastidor + (el.montaje === 'suspendido' ? MED.fondoTaza : MED.fondoTazaSuelo) : MED.fondoConCisterna;
      return { s0: x - MED.taza / 2, s1: x + MED.taza / 2, d, h0: x - MED.huecoInodoro, h1: x + MED.huecoInodoro, zona: [x - 35, x + 35] };
    }
    case 'bide': {
      const d = (el.montaje === 'suspendido' ? MED.bastidor : 0) + MED.fondoTaza;
      return { s0: x - MED.taza / 2, s1: x + MED.taza / 2, d, h0: x - MED.huecoBide, h1: x + MED.huecoBide, zona: [x - 35, x + 35] };
    }
    case 'ducha': return { s0: x - el.ancho / 2, s1: x + el.ancho / 2, d: el.fondo, h0: x - el.ancho / 2, h1: x + el.ancho / 2, zona: null };
    case 'banera': return { s0: x - el.largo / 2, s1: x + el.largo / 2, d: MED.fondoBanera, h0: x - el.largo / 2, h1: x + el.largo / 2, zona: null };
    case 'radiador': return { s0: x - el.ancho / 2, s1: x + el.ancho / 2, d: MED.fondoRadiador, h0: x - el.ancho / 2, h1: x + el.ancho / 2, zona: null };
  }
  return null;
}

// Huellas en planta de todas las piezas.
export function planta(e) {
  const P = paredesBano(e);
  return e.elementos.map(el => {
    const p = P[el.pared], m = medidas(el);
    // bañera a menos de 25 cm de una pared: el hueco se cierra con un poyete alicatado que cuenta como parte de ella
    if (el.tipo === 'banera') {
      if (m.s0 > 0 && m.s0 < 25) { m.poyete0 = m.s0; m.s0 = m.h0 = 0; }
      if (m.s1 < p.largo && p.largo - m.s1 < 25) { m.poyete1 = p.largo - m.s1; m.s1 = m.h1 = p.largo; }
    }
    return {
      el, id: el.id, tipo: el.tipo, pared: el.pared, ...m,
      rect: rectPared(p, m.s0, m.s1, 0, m.d),
      huecoRect: rectPared(p, m.h0, m.h1, 0, m.d),
      zonaRect: m.zona ? rectPared(p, m.zona[0], m.zona[1], m.d, m.d + MED.zonaUso) : null,
    };
  });
}

// Barrido de la puerta (si abre hacia dentro): el cuadrado que recorre la hoja.
export function barridoPuerta(e) {
  const pu = e.puerta; if (!pu || pu.abre !== 'dentro') return null;
  return rectPared(paredesBano(e)[pu.pared], pu.x, pu.x + pu.ancho, 0, pu.ancho);
}

// Huecos por pared (cm, coordenadas de pared) para recortar tabiques y alicatado: puerta, ventana y hornacina.
export function huecosBano(e) {
  const h = { A: [], B: [], C: [], D: [] };
  const pu = e.puerta;
  if (pu) h[pu.pared].push({ tipo: 'puerta', x0: pu.x, x1: pu.x + pu.ancho, y0: 0, y1: pu.alto });
  const v = e.ventana;
  if (v?.activa) h[v.pared].push({ tipo: 'ventana', x0: v.x, x1: v.x + v.ancho, y0: v.antepecho, y1: Math.min(e.sala.alto - 5, v.antepecho + v.alto) });
  const n = hornacina(e);
  if (n) h[n.pared].push({ tipo: 'hornacina', x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1, fondo: n.fondo });
  return h;
}

// Grifería de la ducha: en la pared del plato, en el extremo `grifoLado`.
export function grifoDucha(el) {
  const s0 = el.x - el.ancho / 2, s1 = el.x + el.ancho / 2;
  const off = Math.min(35, el.ancho / 2 - 5);
  return el.grifoLado === 'der' ? s1 - off : s0 + off;
}

export function hornacina(e) {
  const el = e.elementos.find(q => q.tipo === 'ducha' && q.hornacina);
  if (!el) return null;
  const ancho = el.ancho >= 100 ? 45 : 30;
  const g = grifoDucha(el);
  const s0 = el.x - el.ancho / 2, s1 = el.x + el.ancho / 2;
  // lejos del grifo: en el centro del tramo que queda entre el grifo y el otro extremo
  let c = el.grifoLado === 'der' ? (s0 + g) / 2 : (g + s1) / 2;
  c = Math.max(s0 + ancho / 2 + 8, Math.min(s1 - ancho / 2 - 8, c));
  return { pared: el.pared, x0: c - ancho / 2, x1: c + ancho / 2, y0: 105, y1: 135, fondo: 8 };
}

// Paredes y tramos que van alicatados hasta el techo por ser zona de agua.
export function zonasAgua(e) {
  const P = paredesBano(e);
  const out = [];
  for (const el of e.elementos) {
    if (el.tipo !== 'ducha' && el.tipo !== 'banera') continue;
    const m = medidas(el), p = P[el.pared];
    const r = rectPared(p, m.s0, m.s1, 0, m.d);
    for (const id of ['A', 'B', 'C', 'D']) {
      const q = aPared(P[id], r);
      if (q.d0 > 1) continue; // no toca esa pared
      out.push({ pared: id, x0: Math.max(0, q.s0), x1: Math.min(P[id].largo, q.s1), y1: e.sala.alto });
    }
  }
  return out;
}

// ---------- Estado inicial ----------
export function nuevoBano(op = {}) {
  const ancho = op.ancho ?? 200, fondo = op.fondo ?? 250;
  const corto = ancho <= fondo ? 'D' : 'C';
  const e = {
    version: 1, tipo: 'bano',
    sala: { ancho, fondo, alto: op.alto ?? 250 },
    puerta: { pared: corto, x: 10, ancho: 72, alto: 203, abre: 'dentro', ...(op.puerta || {}) },
    ventana: { activa: false, pared: 'B', x: 40, ancho: 60, alto: 60, antepecho: 150, ...(op.ventana || {}) },
    estilo: {
      griferia: 'cromo', revestimiento: 'r30x60', colorAzulejo: 'blanco', alturaAlicatado: 'completa',
      suelo: 'gris', pared: 'blanco', ...(op.estilo || {}),
    },
    opciones: { zonaAgua: 'ducha', bide: false, radiador: true, ...(op.opciones || {}) },
    elementos: [],
  };
  autodistribuir(e);
  return e;
}

const POR_DEFECTO = {
  mueble: { montaje: 'suspendido', senos: 1, frente: 'cajones', serie: 'bormujos', lavabo: 'integrado', espejo: 'rectangular', led: true },
  inodoro: { montaje: 'suspendido', cisterna: 'empotrada' },
  bide: { montaje: 'suspendido' },
  ducha: { color: 'blanco', mampara: 'corredera', perfil: 'cromo', rociador: 'techo', hornacina: true, grifoLado: 'izq' },
  banera: { mampara: 'ninguna', perfil: 'cromo' },
  radiador: { ancho: 50, alto: 100, acabado: 'blanco' },
};

// ---------- Reparto automático ----------
// Pensado para baños de 2–5 m²: zona de agua en una pared corta (la contraria a la puerta), inodoro pegado a ella con el
// eje a 38 cm, bidé y mueble a continuación en la pared larga más alejada de la puerta, 70 cm libres delante de cada
// pieza, nada dentro del barrido de la puerta y el radiador en un hueco libre. Conserva las opciones de cada pieza.
export function autodistribuir(e) {
  const avisos = [];
  const P = paredesBano(e);
  const W = e.sala.ancho, D = e.sala.fondo;
  const previo = {};
  for (const el of e.elementos || []) if (!previo[el.tipo]) previo[el.tipo] = el;
  const opc = (tipo, extra) => ({ ...POR_DEFECTO[tipo], ...strip(previo[tipo]), ...extra, id: previo[tipo]?.id || nuevoId(), tipo });
  e.elementos = [];

  const cortas = W <= D ? ['A', 'D'] : ['B', 'C'];
  const largas = W <= D ? ['B', 'C'] : ['A', 'D'];
  const pu = e.puerta;
  const pc = centroPuerta(e);
  // pared de la zona de agua
  let hw;
  if (cortas.includes(pu.pared)) hw = OPUESTA[pu.pared];
  else hw = dist(pc, P[cortas[0]]) >= dist(pc, P[cortas[1]]) ? cortas[0] : cortas[1];
  // pared larga para los sanitarios: la más alejada de la puerta
  const lp = dist(pc, P[largas[0]]) >= dist(pc, P[largas[1]]) ? largas[0] : largas[1];
  const lo = OPUESTA[lp];
  const Ls = P[hw].largo, Lg = P[lp].largo;
  const esquinaIzq = VECINOS[hw][0] === lp; // la zona de agua se pega a la pared de los sanitarios

  // --- zona de agua ---
  let zona = e.opciones.zonaAgua;
  if (zona === 'banera') {
    const largo = [...LARGOS_BANERA].reverse().find(l => l <= Ls);
    if (!largo) { avisos.push({ nivel: 'aviso', texto: `No cabe una bañera de 160 en una pared de ${Ls} cm: pongo plato de ducha.` }); zona = 'ducha'; }
    else {
      const x = esquinaIzq ? largo / 2 : Ls - largo / 2;
      e.elementos.push(opc('banera', { pared: hw, x, largo }));
    }
  }
  if (zona === 'ducha') {
    const fondo = Lg >= 280 ? 90 : Lg >= 220 ? 80 : 70;
    const ancho = Ls <= PLATO.anchoMax ? Ls : 160; // los extraplanos tipo pizarra se cortan a medida
    const x = esquinaIzq ? ancho / 2 : Ls - ancho / 2;
    const prev = previo.ducha;
    e.elementos.push(opc('ducha', { pared: hw, x, ancho: Math.max(PLATO.anchoMin, ancho), fondo, grifoLado: prev?.grifoLado || (esquinaIzq ? 'izq' : 'der') }));
  }

  // --- sanitarios ---
  const area = W * D / 1e4;
  const anchosMueble = area >= 6.5 ? [120, 100, 80, 60] : area >= 4 ? [100, 80, 60] : [80, 60];
  const paredesSan = [lp, lo, pu.pared, hw].filter((v, i, a) => a.indexOf(v) === i);
  const colocar = (proto, anchos = [null]) => {
    for (const id of paredesSan) for (const a of anchos) {
      const el = { ...proto, pared: id, ...(a ? { ancho: a } : {}) };
      const s = buscarSitio(e, el, hw);
      if (s != null) { el.x = s; if (el.tipo === 'mueble' && el.ancho < 120) el.senos = 1; e.elementos.push(el); return el; }
    }
    return null;
  };
  if (!colocar(opc('inodoro', { x: 0 }))) avisos.push({ nivel: 'error', texto: 'No encuentro sitio para el inodoro con 70 cm libres delante.' });
  if (e.opciones.bide && !colocar(opc('bide', { x: 0 }))) avisos.push({ nivel: 'aviso', texto: 'El bidé no cabe con 70 cm libres delante: lo quito.' });
  const pm = opc('mueble', { x: 0 });
  if (!colocar(pm, anchosMueble.includes(previo.mueble?.ancho) ? [previo.mueble.ancho, ...anchosMueble.filter(a => a < previo.mueble.ancho)] : anchosMueble))
    avisos.push({ nivel: 'error', texto: 'No cabe ni un mueble de lavabo de 60 cm con 70 cm libres delante.' });
  if (e.opciones.radiador) {
    const r = opc('radiador', { x: 0 });
    let ok = false;
    for (const id of [lo, pu.pared, lp, hw].filter((v, i, a) => a.indexOf(v) === i)) {
      const s = buscarSitio(e, { ...r, pared: id }, hw);
      if (s != null) { r.pared = id; r.x = s; e.elementos.push(r); ok = true; break; }
    }
    if (!ok) avisos.push({ nivel: 'info', texto: 'No queda pared libre para el radiador toallero.' });
  }
  ordenar(e);
  return { avisos };
}

function strip(el) { if (!el) return {}; const { id, tipo, pared, x, ...resto } = el; delete resto.ancho; delete resto.largo; delete resto.fondo; return resto; }
function ordenar(e) { e.elementos.sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo)); }
function centroPuerta(e) {
  const pu = e.puerta, P = paredesBano(e)[pu.pared], s = pu.x + pu.ancho / 2;
  return [P.a[0] + P.dir[0] * s, P.a[1] + P.dir[1] * s];
}
function dist(pt, P) { return Math.abs((pt[0] - P.a[0]) * P.n[0] + (pt[1] - P.a[1]) * P.n[1]); }

// Busca la posición (centro, cm) más pegada a la zona de agua donde la pieza cabe sin chocar con nada,
// fuera del barrido de la puerta y con su zona de uso libre. null si no cabe en esa pared.
function buscarSitio(e, el, hw) {
  const P = paredesBano(e), p = P[el.pared];
  const m0 = medidas({ ...el, x: 0 });
  const ancho = m0.h1 - m0.h0, off = -m0.h0; // centro = inicio del hueco + off
  if (ancho > p.largo) return null;
  const huellas = planta(e);
  const barrido = barridoPuerta(e);
  const pu = e.puerta;
  const hacia = VECINOS[el.pared][1] === hw ? -1 : 1; // recorrer desde el lado de la zona de agua
  // candidatos: rejilla de 5 cm y los bordes de lo que ya hay (para arrimar sin dejar huecos)
  const max = p.largo - ancho;
  const set = new Set([0, max]);
  for (let s = 0; s <= max; s += 5) set.add(s);
  for (const q of huellas) { const r = aPared(p, q.huecoRect); set.add(r.s1); set.add(r.s0 - ancho); }
  if (pu.pared === el.pared) { set.add(pu.x + pu.ancho + 5); set.add(pu.x - 5 - ancho); }
  if (barrido) { const r = aPared(p, barrido); set.add(r.s1); set.add(r.s0 - ancho); }
  const candidatos = [...set].filter(s => s >= -1e-6 && s <= max + 1e-6).sort((a, b) => (a - b) * hacia);
  for (const h0 of candidatos) {
    const x = h0 + off;
    const m = medidas({ ...el, x });
    const hueco = rectPared(p, m.h0, m.h1, 0, m.d);
    const zona = m.zona ? rectPared(p, m.zona[0], m.zona[1], m.d, m.d + MED.zonaUso) : null;
    if (zona && fuera(zona, e)) return null; // no hay fondo para la zona de uso en esta pared
    if (pu.pared === el.pared && solape(m.h0, m.h1, pu.x - 5, pu.x + pu.ancho + 5) > 0) continue;
    if (barrido && cruzan(hueco, barrido)) continue;
    let ok = true;
    for (const q of huellas) {
      if (cruzan(hueco, q.huecoRect)) { ok = false; break; }
      if (zona && cruzan(zona, q.rect)) { ok = false; break; }
      if (q.zonaRect && cruzan(hueco, q.zonaRect)) { ok = false; break; }
    }
    if (ok) return x;
  }
  return null;
}

// ---------- Validaciones ----------
const NOMBRE = { mueble: 'el mueble de lavabo', inodoro: 'el inodoro', bide: 'el bidé', ducha: 'el plato de ducha', banera: 'la bañera', radiador: 'el radiador' };
const nombre = q => NOMBRE[q.tipo] || q.tipo;
const r0 = v => Math.round(v);

export function validar(e) {
  const av = [];
  const add = (nivel, texto, ids = []) => av.push({ nivel, texto, ids });
  const P = paredesBano(e);
  const W = e.sala.ancho, D = e.sala.fondo;
  const area = W * D / 1e4;
  if (area < 2 || area > 5) add('info', `El baño mide ${area.toFixed(1).replace('.', ',')} m²: el reparto automático está pensado para 2–5 m².`);
  if (e.sala.alto < 220) add('aviso', `Techo a ${e.sala.alto} cm: por debajo de 220 cm la ducha resulta agobiante.`);

  // puerta y ventana
  const pu = e.puerta;
  if (pu.x < 0 || pu.x + pu.ancho > P[pu.pared].largo) add('error', 'La puerta se sale de su pared.');
  if (pu.ancho < 62) add('aviso', `Puerta de ${pu.ancho} cm: por menos de 62 cm de paso cuesta meter los sanitarios.`);
  const v = e.ventana;
  if (v?.activa) {
    if (v.x < 0 || v.x + v.ancho > P[v.pared].largo || v.antepecho + v.alto > e.sala.alto) add('error', 'La ventana se sale de su pared.');
    if (v.pared === pu.pared && solape(v.x, v.x + v.ancho, pu.x, pu.x + pu.ancho) > 0) add('error', 'La ventana y la puerta se pisan.');
  }

  const H = planta(e);
  const tiene = t => H.some(q => q.tipo === t);
  if (!tiene('inodoro')) add('aviso', 'Falta el inodoro.');
  if (!tiene('mueble')) add('aviso', 'Falta el lavabo.');
  if (!tiene('ducha') && !tiene('banera')) add('aviso', 'Falta la ducha o la bañera.');

  // medidas de catálogo
  for (const q of H) {
    const el = q.el;
    if (el.tipo === 'mueble') {
      if (!ANCHOS_MUEBLE.includes(el.ancho)) add('aviso', `Mueble de ${el.ancho} cm: los de serie son de 60, 80, 100 y 120.`, [el.id]);
      if (el.senos === 2 && el.ancho < 120) add('aviso', 'Dos senos necesitan un mueble de 120 cm.', [el.id]);
    }
    if (el.tipo === 'ducha') {
      if (el.ancho < PLATO.anchoMin || el.ancho > PLATO.anchoMax || el.fondo < PLATO.fondoMin || el.fondo > PLATO.fondoMax)
        add('error', `Plato de ${el.fondo}×${el.ancho}: los extraplanos van de 70×70 a 90×200 cm.`, [el.id]);
      if (el.rociador === 'techo' && e.sala.alto > 290) add('info', 'Con el techo tan alto, mejor columna o brazo de pared que rociador de techo.', [el.id]);
      if (el.mampara === 'abatible' && el.ancho < 70) add('aviso', 'Una mampara abatible necesita al menos 70 cm de frente.', [el.id]);
    }
    if (el.tipo === 'banera' && !LARGOS_BANERA.includes(el.largo)) add('aviso', `Bañera de ${el.largo} cm: las de serie son de 160, 170 y 180.`, [el.id]);
    if (el.tipo === 'inodoro' && el.montaje === 'suspendido' && el.cisterna === 'vista') add('aviso', 'Un inodoro suspendido lleva bastidor con cisterna empotrada: no admite cisterna vista.', [el.id]);
  }

  // dentro de la sala y sin solapes
  for (const q of H) if (fuera(q.rect, e)) add('error', `${cap(nombre(q))} se sale de la pared ${q.pared}.`, [q.id]);
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
    const a = H[i], b = H[j];
    if (cruzan(a.rect, b.rect, 1)) {
      const sx = solape(a.rect.x0, a.rect.x1, b.rect.x0, b.rect.x1), sz = solape(a.rect.z0, a.rect.z1, b.rect.z0, b.rect.z1);
      add('error', `${cap(nombre(a))} y ${nombre(b)} se solapan ${r0(Math.min(sx, sz))} cm.`, [a.id, b.id]);
    }
  }

  // espacio libre delante (inodoro, bidé, lavabo)
  for (const q of H) {
    if (!q.zona) continue;
    const p = P[q.pared];
    let libre = (q.pared === 'A' || q.pared === 'D' ? D : W) - q.d, contra = 'la pared de enfrente';
    for (const o of H) {
      if (o === q) continue;
      const r = aPared(p, o.rect);
      if (solape(r.s0, r.s1, q.zona[0], q.zona[1]) <= 2 || r.d1 <= q.d + 1) continue;
      const l = Math.max(0, r.d0 - q.d);
      if (l < libre) { libre = l; contra = nombre(o); }
    }
    if (libre < MED.zonaUso) add('aviso', `Delante de ${nombre(q)} quedan ${r0(libre)} cm hasta ${contra} (mínimo recomendable 70).`, [q.id]);
  }

  // eje del inodoro y del bidé respecto a lo que tienen al lado
  for (const q of H) {
    if (q.tipo !== 'inodoro' && q.tipo !== 'bide') continue;
    const p = P[q.pared], eje = q.el.x;
    let izq = { d: eje, que: 'la pared' }, der = { d: p.largo - eje, que: 'la pared' };
    for (const o of H) {
      if (o === q) continue;
      const r = aPared(p, o.rect);
      if (r.d0 >= q.d - 1 || r.d1 <= 1) continue; // no está a su lado
      if (r.s1 <= eje && eje - r.s1 < izq.d) izq = { d: eje - r.s1, que: nombre(o) };
      if (r.s0 >= eje && r.s0 - eje < der.d) der = { d: r.s0 - eje, que: nombre(o) };
    }
    const min = izq.d < der.d ? izq : der;
    if (min.d < 35) add('aviso', `El eje de ${nombre(q)} queda a ${r0(min.d)} cm de ${min.que} (recomendado 35–40).`, [q.id]);
  }

  // barrido de la puerta
  const bp = barridoPuerta(e);
  if (bp) for (const q of H) if (cruzan(bp, q.rect, 1)) add('aviso', `La puerta, al abrir, choca con ${nombre(q)}: valora puerta corredera o que abra hacia fuera.`, [q.id]);

  // entrada a la ducha o a la bañera
  for (const q of H) {
    if (q.tipo !== 'ducha' && q.tipo !== 'banera') continue;
    const p = P[q.pared];
    const bloq = [];
    for (const o of H) {
      if (o === q) continue;
      const r = aPared(p, o.rect);
      if (r.d1 <= q.d + 1 || r.d0 >= q.d + 60) continue;
      bloq.push([r.s0, r.s1]);
    }
    const huecos = restar([q.s0, q.s1], bloq);
    const max = Math.max(0, ...huecos.map(([a, b]) => b - a));
    if (max < MED.pasoDucha) add('aviso', `La entrada a ${nombre(q)} queda con ${r0(max)} cm de paso (mínimo cómodo 55).`, [q.id]);
    if (v?.activa) {
      const zw = zonasAgua(e).filter(z => z.pared === v.pared);
      if (zw.some(z => solape(z.x0, z.x1, v.x, v.x + v.ancho) > 0)) add('info', 'La ventana cae en la zona de agua: carpintería de PVC o aluminio y vidrio traslúcido.', [q.id]);
    }
  }

  // radiador fuera del agua; espejo y ventana
  for (const q of H) {
    if (q.tipo === 'radiador' && H.some(o => (o.tipo === 'ducha' || o.tipo === 'banera') && cruzan(o.rect, rectPared(P[q.pared], q.s0, q.s1, 0, 30), 1)))
      add('error', 'El radiador toallero no puede ir dentro de la zona de ducha.', [q.id]);
    if (q.tipo === 'mueble' && q.el.espejo !== 'ninguno' && v?.activa && v.pared === q.pared && solape(q.s0, q.s1, v.x, v.x + v.ancho) > 2 && v.antepecho < 190)
      add('aviso', 'El espejo cae delante de la ventana: mueve el lavabo o pon espejo en otra pared.', [q.id]);
  }
  return av;
}

function restar([a, b], bloques) {
  let libres = [[a, b]];
  for (const [c, d] of bloques) {
    const out = [];
    for (const [x, y] of libres) {
      if (d <= x || c >= y) { out.push([x, y]); continue; }
      if (c > x) out.push([x, c]);
      if (d < y) out.push([d, y]);
    }
    libres = out;
  }
  return libres;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Ediciones sencillas ----------
export function clonar(e) { return JSON.parse(JSON.stringify(e)); }
export function elemento(e, id) { return e.elementos.find(q => q.id === id) || null; }
export function primero(e, tipo) { return e.elementos.find(q => q.tipo === tipo) || null; }

// ---------- Ediciones de pieza (las usa js/opciones.js) ----------
// Todas mutan el estado `e`; las que pueden fallar devuelven un texto de aviso (string) o null.

// Pared de la zona de agua: la de la ducha o la bañera; si no hay, la corta contraria a la puerta (como el reparto).
export function paredAgua(e) {
  const z = e.elementos.find(q => q.tipo === 'ducha' || q.tipo === 'banera');
  if (z) return z.pared;
  const cortas = e.sala.ancho <= e.sala.fondo ? ['A', 'D'] : ['B', 'C'];
  return cortas.includes(e.puerta?.pared) ? OPUESTA[e.puerta.pared] : cortas[0];
}

// Centro mínimo y máximo de una pieza sobre su pared (que la huella no se salga).
function limitesX(e, el) {
  const m = medidas({ ...el, x: 0 }), largo = paredesBano(e)[el.pared].largo;
  return [-m.s0, largo - m.s1];
}
const encajar = (e, el, x) => { const [a, b] = limitesX(e, el); return Math.round(Math.max(a, Math.min(Math.max(a, b), x))); };
const sinPieza = (e, el) => ({ ...e, elementos: e.elementos.filter(q => q !== el) });

// Medidas de catálogo al crear o convertir una pieza
function medidasNuevas(e, tipo, pared) {
  const largo = paredesBano(e)[pared].largo;
  if (tipo === 'mueble') return { ancho: 80 };
  if (tipo === 'ducha') return { ancho: Math.max(PLATO.anchoMin, Math.min(120, largo)), fondo: 80 };
  if (tipo === 'banera') return { largo: [...LARGOS_BANERA].reverse().find(l => l <= largo) || LARGOS_BANERA[0] };
  return {};
}

export const edBano = {
  // Desplaza la pieza d cm a lo largo de su pared
  mover(e, id, d) { const el = elemento(e, id); if (el) el.x = encajar(e, el, el.x + d); },
  // Centro de la pieza (cm desde el extremo izquierdo de la pared mirándola)
  posicion(e, id, x) { const el = elemento(e, id); if (el) el.x = encajar(e, el, x); },
  // Cambia de pared: busca el primer sitio libre como el reparto; si no lo hay, la deja centrada (avisa validar()).
  pared(e, id, pared) {
    const el = elemento(e, id); if (!el || el.pared === pared || !paredesBano(e)[pared]) return null;
    const resto = sinPieza(e, el);
    const s = buscarSitio(resto, { ...el, pared }, paredAgua(resto));
    el.pared = pared;
    el.x = s ?? encajar(e, el, paredesBano(e)[pared].largo / 2);
    return s == null ? 'No hay un sitio libre en esa pared: queda centrada, revisa los avisos.' : null;
  },
  // Cambia una medida (ancho, fondo, largo, alto…) y la recoloca dentro de la pared
  medida(e, id, campo, v) {
    const el = elemento(e, id); if (!el) return;
    el[campo] = v;
    if (el.tipo === 'mueble' && campo === 'ancho' && v < 120) el.senos = 1;
    el.x = encajar(e, el, el.x);
  },
  duplicar(e, id) {
    const el = elemento(e, id); if (!el) return null;
    const copia = { ...el, id: nuevoId() };
    const hw = paredAgua(e);
    for (const p of [el.pared, ...['A', 'B', 'C', 'D'].filter(x => x !== el.pared)]) {
      const s = buscarSitio(e, { ...copia, pared: p }, hw);
      if (s != null) { copia.pared = p; copia.x = s; e.elementos.push(copia); ordenar(e); return copia.id; }
    }
    const m = medidas(el);
    copia.x = encajar(e, copia, el.x + (m.s1 - m.s0) + 5);
    e.elementos.push(copia); ordenar(e);
    return copia.id;
  },
  borrar(e, id) { e.elementos = e.elementos.filter(q => q.id !== id); sincronizarOpciones(e); },
  // Añade una pieza de catálogo en el primer sitio libre; si no cabe, en el centro de la pared más larga.
  anadir(e, tipo) {
    if (!POR_DEFECTO[tipo]) return null;
    const hw = paredAgua(e);
    const P = paredesBano(e);
    const orden = tipo === 'ducha' || tipo === 'banera' ? [hw, ...['A', 'B', 'C', 'D'].filter(p => p !== hw)] : ['A', 'B', 'C', 'D'];
    const base = { ...POR_DEFECTO[tipo], id: nuevoId(), tipo, x: 0 };
    for (const p of orden) {
      const el = { ...base, ...medidasNuevas(e, tipo, p), pared: p };
      const s = buscarSitio(e, el, hw);
      if (s != null) { el.x = s; e.elementos.push(el); ordenar(e); sincronizarOpciones(e); return { id: el.id, cabe: true }; }
    }
    const p = Object.values(P).sort((a, b) => b.largo - a.largo)[0].id;
    const el = { ...base, ...medidasNuevas(e, tipo, p), pared: p };
    el.x = encajar(e, el, P[p].largo / 2);
    e.elementos.push(el); ordenar(e); sincronizarOpciones(e);
    return { id: el.id, cabe: false };
  },
  // Ducha ↔ bañera en el mismo sitio (pegada a la misma esquina). Devuelve un aviso si no cabe.
  zonaAgua(e, zona) {
    const tipo = zona === 'banera' ? 'banera' : 'ducha';
    e.opciones.zonaAgua = tipo;
    const vieja = e.elementos.find(q => q.tipo === 'ducha' || q.tipo === 'banera');
    if (!vieja) { const r = edBano.anadir(e, tipo); return r?.cabe ? null : 'No hay sitio libre: revisa los avisos.'; }
    if (vieja.tipo === tipo) return null;
    const P = paredesBano(e)[vieja.pared], m = medidas(vieja);
    const izq = m.s0 <= P.largo - m.s1;
    const comun = { id: nuevoId(), pared: vieja.pared, grifoLado: vieja.grifoLado, perfil: vieja.perfil };
    let nueva;
    if (tipo === 'banera') {
      const largo = [...LARGOS_BANERA].reverse().find(l => l <= P.largo);
      if (!largo) { e.opciones.zonaAgua = 'ducha'; return `No cabe una bañera de ${LARGOS_BANERA[0]} cm en una pared de ${P.largo} cm.`; }
      nueva = { ...POR_DEFECTO.banera, ...comun, tipo, largo };
      nueva.x = izq ? Math.max(0, m.s0) + largo / 2 : Math.min(P.largo, m.s1) - largo / 2;
    } else {
      const ancho = Math.max(PLATO.anchoMin, Math.min(PLATO.anchoMax, Math.round(m.s1 - m.s0)));
      nueva = { ...POR_DEFECTO.ducha, ...comun, tipo, ancho, fondo: 80 };
      nueva.x = izq ? m.s0 + ancho / 2 : m.s1 - ancho / 2;
    }
    nueva.x = encajar(e, nueva, nueva.x);
    e.elementos[e.elementos.indexOf(vieja)] = nueva;
    return null;
  },
  // Pone o quita todas las piezas de un tipo opcional (bidé, radiador)
  opcional(e, tipo, si) {
    const hay = e.elementos.some(q => q.tipo === tipo);
    if (si && !hay) { const r = edBano.anadir(e, tipo); return r?.cabe ? null : `No queda sitio libre para ${NOMBRE[tipo] || tipo}: revisa los avisos.`; }
    if (!si) e.elementos = e.elementos.filter(q => q.tipo !== tipo);
    sincronizarOpciones(e);
    return null;
  },
};

// Las opciones del baño reflejan lo que hay de verdad (para que «Repartir de nuevo» respete lo elegido)
function sincronizarOpciones(e) {
  e.opciones.bide = e.elementos.some(q => q.tipo === 'bide');
  e.opciones.radiador = e.elementos.some(q => q.tipo === 'radiador');
  const z = e.elementos.find(q => q.tipo === 'ducha' || q.tipo === 'banera');
  if (z) e.opciones.zonaAgua = z.tipo;
}
