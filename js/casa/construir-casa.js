// 3D de la vivienda: tabiques con huecos (puertas con hoja y marco, ventanas), suelos por estancia, rodapié, techos,
// focos y exteriores tras las ventanas. Todo en metros y en coordenadas de la casa (x = x/100, z = y/100).
//
// Rendimiento: los tabiques, el rodapié y la carpintería son cajas → una InstancedMesh por material (1 llamada de
// dibujo cada una, color de pintura por instancia). Así el recorte de casa de muñecas oculta tabiques sueltos
// poniendo a cero sus instancias, sin partir la fusión. Suelos, techos y focos se fusionan por material.
import * as THREE from 'three';
import { Lote, fusionar, matrizTramo } from '../geo.js';
import { matSombra } from '../sala.js';
import {
  calcularTabiques, bordesDe, marcoEstancia, PINTURAS, FACHADA, YESO, esFuera, caja, puntoEnPoligono, esPuerta,
} from './modelo-casa.js';
import { contenidoEstancia } from './contenido.js';

const caja1 = new THREE.BoxGeometry(1, 1, 1);
const CERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _t = new THREE.Matrix4(), _s = new THREE.Matrix4(), _r = new THREE.Matrix4();

// Cajas sueltas agrupadas por material; cada una sabe a qué tabique pertenece (para el recorte).
class Piezas {
  constructor() { this.por = new Map(); }
  matriz(mat, m, { color = null, tab = -1 } = {}) {
    if (!this.por.has(mat)) this.por.set(mat, []);
    this.por.get(mat).push({ m, color, tab });
  }
  caja(mat, M, x, y, z, w, h, d, opt) {
    if (w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return null;
    const m = M.clone().multiply(_t.makeTranslation(x + w / 2, y + h / 2, z + d / 2)).multiply(_s.makeScale(w, h, d));
    this.matriz(mat, m, opt); return m;
  }
  mallas(mats) {
    const out = [];
    const c = new THREE.Color();
    for (const [mat, lista] of this.por) {
      const material = mats[mat]; if (!material || !lista.length) continue;
      const im = new THREE.InstancedMesh(caja1, material, lista.length);
      im.name = mat; im.frustumCulled = false;
      lista.forEach((p, i) => { im.setMatrixAt(i, p.m); if (p.color) im.setColorAt(i, c.set(p.color)); });
      if (lista.some(p => p.color)) lista.forEach((p, i) => { if (!p.color) im.setColorAt(i, c.set('#ffffff')); });
      im.receiveShadow = !material.isMeshBasicMaterial;
      im.castShadow = false;
      im.userData.piezas = lista;
      out.push(im);
    }
    return out;
  }
}

// Oculta (o enseña) las instancias de los tabiques indicados
export function ocultarTabiques(mallas, ocultos) {
  for (const im of mallas) {
    const L = im.userData.piezas; if (!L) continue;
    L.forEach((p, i) => im.setMatrixAt(i, p.tab >= 0 && ocultos.has(p.tab) ? CERO : p.m));
    im.instanceMatrix.needsUpdate = true;
  }
}

// rectángulos (x0,x1,y0,y1) de un paño [x0,x1]×[0,H] menos sus huecos
function panos(x0, x1, H, huecos) {
  const out = []; let c = x0;
  for (const h of huecos) {
    const a = Math.max(h.x0, x0), b = Math.min(h.x1, x1); if (b <= a) continue;
    if (a > c) out.push([c, a, 0, H]);
    if (h.y0 > 0) out.push([a, b, 0, Math.min(h.y0, H)]);
    if (h.y1 < H) out.push([a, b, h.y1, H]);
    c = Math.max(c, b);
  }
  if (c < x1) out.push([c, x1, 0, H]);
  return out.filter(r => r[1] - r[0] > 1e-4 && r[3] - r[2] > 1e-4);
}

// Encuentros entre tabiques: cuánto alargar el núcleo en cada extremo y dónde empieza la pintura de cada cara.
function encuentros(tabiques) {
  const nodos = new Map();
  const k = p => Math.round(p[0]) + ',' + Math.round(p[1]);
  tabiques.forEach(t => { for (const e of [0, 1]) { const c = k(e ? t.b : t.a); if (!nodos.has(c)) nodos.set(c, []); nodos.get(c).push({ t, e }); } });
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cara = (o, w) => (dot(w, o.t.n) > 0 ? o.t.emas : o.t.emenos);
  for (const t of tabiques) {
    t.ext = [0, 0]; t.piel = { 1: [0, 0], [-1]: [0, 0] };
    for (const e of [0, 1]) {
      const u = e ? [-t.dir[0], -t.dir[1]] : t.dir;
      const otros = nodos.get(k(e ? t.b : t.a)).filter(o => o.t !== t).map(o => ({ ...o, v: o.e ? [-o.t.dir[0], -o.t.dir[1]] : o.t.dir }));
      const sigue = otros.some(o => dot(o.v, u) < -0.99);
      const pasante = otros.some(o1 => Math.abs(dot(o1.v, u)) < 0.99 && otros.some(o2 => o2 !== o1 && dot(o1.v, o2.v) < -0.99));
      const cruzados = otros.filter(o => Math.abs(dot(o.v, u)) < 0.99);
      const ext = sigue || pasante ? 0 : Math.max(0, ...cruzados.map(o => cara(o, [-u[0], -u[1]])));
      t.ext[e] = ext;
      for (const s of [1, -1]) {
        const ns = [t.n[0] * s, t.n[1] * s];
        const tapan = cruzados.filter(o => dot(o.v, ns) > 0.3);
        t.piel[s][e] = tapan.length ? Math.max(...tapan.map(o => cara(o, u))) : sigue ? 0 : -ext;
      }
    }
  }
}

const hex = c => new THREE.Color(c);

export function construirCasa(casa, mats, { cocinaId = null } = {}) {
  const { tabiques } = calcularTabiques(casa);
  encuentros(tabiques);
  const porId = Object.fromEntries(casa.estancias.map(e => [e.id, e]));
  const P = new Piezas(), Psombra = new Piezas();
  const L = new Lote();                      // suelos, techos, focos, exteriores
  const Lt = new Lote();                     // techos (también dan sombra)
  const ventanas = [], focos = [];

  tabiques.forEach((t, idx) => {
    t.idx = idx;
    const M = matrizTramo([t.a[0] / 100, t.a[1] / 100], t.dir);
    const Lm = t.largo / 100, H = t.alto / 100, zp = t.emas / 100, zm = -t.emenos / 100, G = zp - zm;
    const em = porId[t.mas], en = t.menos ? porId[t.menos] : null;
    const opt = { tab: idx };
    const huecos = t.huecos.map(q => ({ ...q, x0: q.s0 / 100, x1: q.s1 / 100, y0: q.h.antepecho / 100, y1: Math.min(H, (q.h.antepecho + q.h.alto) / 100) }));
    // núcleo
    const colorNucleo = t.exterior ? FACHADA : YESO;
    for (const [x0, x1, y0, y1] of panos(-t.ext[0] / 100, Lm + t.ext[1] / 100, H, huecos)) {
      P.caja('muro', M, x0, y0, zm, x1 - x0, y1 - y0, G, { ...opt, color: colorNucleo });
      Psombra.caja('sombra', M, x0, y0, zm, x1 - x0, y1 - y0, G);
    }
    // pintura y rodapié de cada cara que da a una estancia cubierta
    for (const s of [1, -1]) {
      const est = s > 0 ? em : en;
      if (!est || esFuera(est)) continue;
      const color = (PINTURAS[est.pintura] || PINTURAS.blanco).color;
      const x0 = t.piel[s][0] / 100, x1 = Lm - t.piel[s][1] / 100, Hs = Math.min(H, est.alto / 100);
      const z = s > 0 ? zp + 0.0008 : zm - 0.0028;
      for (const [a, b, y0, y1] of panos(x0, x1, Hs, huecos)) P.caja('muro', M, a, y0, z, b - a, y1 - y0, 0.002, { ...opt, color });
      const zr = s > 0 ? zp : zm - 0.012;
      for (const [a, b] of panos(x0, x1, 0.07, huecos.filter(h => h.y0 < 0.07))) P.caja('rodapie', M, a, 0, zr, b - a, 0.07, 0.012, opt);
    }
    // huecos
    const fuera = t.exterior ? (en == null || esFuera(en) ? -1 : 1) : 0; // lado de la calle/terraza (0 si es interior)
    for (const q of huecos) {
      const h = q.h, w = q.x1 - q.x0, ht = q.y1 - q.y0;
      if (esPuerta(h)) puerta(P, M, q, h, zm, zp, opt, t);
      else {
        const fd = 0.07, zc = (zm + zp) / 2 - fd / 2, pf = 0.065;
        P.caja('marco', M, q.x0, q.y0, zc, pf, ht, fd, opt); P.caja('marco', M, q.x1 - pf, q.y0, zc, pf, ht, fd, opt);
        P.caja('marco', M, q.x0, q.y0, zc, w, pf, fd, opt); P.caja('marco', M, q.x0, q.y1 - pf, zc, w, pf, fd, opt);
        if (w > 0.8) P.caja('marco', M, q.x0 + w / 2 - pf * 0.6, q.y0, zc + 0.005, pf * 1.2, ht, fd, opt);
        P.caja('vidrio', M, q.x0 + pf, q.y0 + pf, zc + 0.03, w - 2 * pf, ht - 2 * pf, 0.006, opt);
        // revestimiento del hueco (para que no se vea el núcleo en bruto)
        if (h.tipo === 'ventana') {
          for (const s of [1, -1]) {
            if (s === fuera) continue;
            const z0 = s > 0 ? zc + fd : zm - 0.02, z1 = s > 0 ? zp + 0.02 : zc;
            P.caja('alfeizar', M, q.x0 - 0.02, q.y0 - 0.02, z0, w + 0.04, 0.02, z1 - z0, opt);
          }
        }
        if (fuera) {
          // exterior lejos, para que haya paralaje
          const ex = new THREE.PlaneGeometry(16, 9);
          if (fuera > 0) ex.rotateY(Math.PI);
          ex.translate((q.x0 + q.x1) / 2, q.y0 + 1.0, fuera * (7 + (ventanas.length % 5) * 0.03));
          ex.applyMatrix4(M);
          L.add(ex, 'exterior', { uvPropias: true, sinSombra: true });
        }
        const dentro = fuera ? -fuera : 1;
        const centro = new THREE.Vector3((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, 0).applyMatrix4(M);
        const n = new THREE.Vector3(t.n[0] * dentro, 0, t.n[1] * dentro);
        ventanas.push({ centro, n, dir: new THREE.Vector3(t.dir[0], 0, t.dir[1]), ancho: w, alto: ht, exterior: !!fuera, estancias: [t.mas, t.menos].filter(Boolean), hueco: h.id });
      }
    }
  });

  // suelos, techos y focos por estancia
  for (const est of casa.estancias) {
    const pol = est.poligono;
    const forma = new THREE.Shape(pol.map(p => new THREE.Vector2(p[0] / 100, -p[1] / 100)));
    const gs = new THREE.ShapeGeometry(forma); gs.rotateX(-Math.PI / 2);
    L.add(gs, 'suelo:' + est.suelo);
    if (esFuera(est)) continue;
    const H = est.alto / 100;
    const ft = new THREE.Shape(pol.map(p => new THREE.Vector2(p[0] / 100, p[1] / 100)));
    const gt = new THREE.ShapeGeometry(ft); gt.rotateX(Math.PI / 2); gt.translate(0, H, 0);
    Lt.add(gt, 'techo');
    const c = caja(pol);
    const w = (c.x1 - c.x0) / 100, d = (c.y1 - c.y0) / 100;
    const nx = Math.min(3, Math.max(1, Math.round(w / 1.9))), nz = Math.min(3, Math.max(1, Math.round(d / 1.9)));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = c.x0 + (c.x1 - c.x0) * (i + 0.5) / nx, y = c.y0 + (c.y1 - c.y0) * (k + 0.5) / nz;
      if (!puntoEnPoligono([x, y], pol)) continue;
      Lt.cilindro('downlight', x / 100, H - 0.001, y / 100, 0.045, 0.002, 'y', 20, { sinSombra: true });
      focos.push({ p: new THREE.Vector3(x / 100, H - 0.08, y / 100), estancia: est.id });
    }
  }

  // contenido de estancias (baño, otras cocinas…); la cocina activa va aparte, en su propio marco
  const contenidos = [], picks = [];
  for (const est of casa.estancias) {
    if (est.id === cocinaId) continue;
    const m = marcoEstancia(est);
    const r = contenidoEstancia(est.tipo, est, m);
    if (!r?.lote) continue;
    const Me = matrizTramo([m.origen[0] / 100, m.origen[1] / 100], m.dir);
    for (const p of r.lote.partes) p.m = Me.clone().multiply(p.m);
    contenidos.push({ lote: r.lote, mats: r.mats });
    for (const l of r.luces || []) focos.push({ p: new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(Me), estancia: est.id });
    // piezas seleccionables (las que traen id, p. ej. las del baño): caja en coords de su pared → casa
    for (const p of r.picks || []) {
      if (p.id == null) continue;
      picks.push({ M: Me.clone().multiply(p.R), x0: p.x0, x1: p.x1, y0: p.y0 ?? 0, y1: p.y1, z0: p.z0 ?? 0, z1: p.z1, userData: { ambito: 'elemento', estancia: est.id, id: p.id, tipo: p.tipo } });
    }
  }

  // ---------- mallas ----------
  const grupo = new THREE.Group(); grupo.name = 'casa';
  const inst = P.mallas(mats);
  inst.forEach(m => grupo.add(m));
  const fijas = fusionar(L, mats, { sombras: false });
  const suelos = [], exteriores = [];
  for (const m of [...fijas.children]) { grupo.add(m); if (m.name.startsWith('suelo:')) suelos.push(m); if (m.name === 'exterior') exteriores.push(m); }
  const techos = fusionar(Lt, mats, { sombras: false });
  let techo = null; const deTecho = [];
  for (const m of [...techos.children]) { grupo.add(m); deTecho.push(m); if (m.name === 'techo') techo = m; }
  // copias de sombra: el núcleo de los tabiques y los techos siguen dando sombra aunque se recorten u oculten
  const sombras = Psombra.mallas({ sombra: matSombra })[0];
  if (sombras) { sombras.castShadow = true; sombras.receiveShadow = false; sombras.userData.sombraProxy = true; sombras.name = 'sombras'; grupo.add(sombras); }
  if (techo) { const s = new THREE.Mesh(techo.geometry, matSombra); s.castShadow = true; s.userData.sombraProxy = true; s.name = 'sombraTecho'; grupo.add(s); }
  for (const c of contenidos) {
    const g = fusionar(c.lote, c.mats ? { ...mats, ...c.mats } : mats);
    for (const m of [...g.children]) { m.name = 'contenido:' + m.name; grupo.add(m); }
  }

  const todo = casa.estancias.flatMap(e => e.poligono);
  const cj = caja(todo);
  const altoMax = Math.max(2.2, ...casa.estancias.filter(e => !esFuera(e)).map(e => e.alto / 100));
  return {
    grupo, instancias: inst, techo, deTecho, suelos, exteriores, ventanas, focos, picks,
    tabiques: tabiques.map(t => ({ idx: t.idx, a: [t.a[0] / 100, t.a[1] / 100], b: [t.b[0] / 100, t.b[1] / 100], n: t.n, alto: t.alto / 100, exterior: t.exterior })),
    caja: { x0: cj.x0 / 100, z0: cj.y0 / 100, x1: cj.x1 / 100, z1: cj.y1 / 100, alto: altoMax },
  };
}

// Puerta con cerco, tapajuntas por las dos caras, hoja abierta (abatible) o desplazada (corredera) y manilla.
function puerta(P, M, q, h, zm, zp, opt, t) {
  const w = q.x1 - q.x0, ht = q.y1 - q.y0, e = 0.02;
  // cerco cubriendo el grueso del hueco
  P.caja('marco', M, q.x0, 0, zm - 0.004, e, ht, zp - zm + 0.008, opt);
  P.caja('marco', M, q.x1 - e, 0, zm - 0.004, e, ht, zp - zm + 0.008, opt);
  P.caja('marco', M, q.x0, ht - e, zm - 0.004, w, e, zp - zm + 0.008, opt);
  // tapajuntas en cada cara
  for (const s of [1, -1]) {
    const z = s > 0 ? zp : zm - 0.012;
    P.caja('marco', M, q.x0 - 0.06, 0, z, 0.06, ht + 0.06, 0.012, opt);
    P.caja('marco', M, q.x1, 0, z, 0.06, ht + 0.06, 0.012, opt);
    P.caja('marco', M, q.x0, ht, z, w, 0.06, 0.012, opt);
  }
  const lado = q.lado;                                    // +1: la estancia del hueco está en +n del tabique
  const sa = (h.abre === 'fuera' ? -1 : 1) * lado;        // cara hacia la que abre
  const izq = (h.mano || 'izquierda') === 'izquierda';
  const hw = w - 2 * e - 0.006, hh = ht - e - 0.012, gr = 0.04;
  if (h.tipo === 'abatible') {
    // bisagra en un lado del hueco; hoja abierta 80° hacia la cara sa. Vista desde la estancia, «izquierda»
    // es el lado de menor x si la estancia está en +n.
    const enX0 = (lado > 0) === izq;
    const s = enX0 ? 1 : -1;
    const hx = enX0 ? q.x0 + e : q.x1 - e;
    const hz = sa > 0 ? zp - gr : zm + gr;
    const phi = -sa * s * THREE.MathUtils.degToRad(80);
    const base = M.clone().multiply(_t.makeTranslation(hx, 0.008, hz)).multiply(_r.makeRotationY(phi));
    P.matriz('puerta', base.clone().multiply(_t.makeTranslation(s * hw / 2, hh / 2, 0)).multiply(_s.makeScale(hw, hh, gr)), opt);
    for (const zz of [gr / 2 + 0.03, -gr / 2 - 0.03]) {
      P.matriz('herraje', base.clone().multiply(_t.makeTranslation(s * (hw - 0.09), 1.05, zz)).multiply(_s.makeScale(0.13, 0.018, 0.018)), opt);
      P.matriz('herraje', base.clone().multiply(_t.makeTranslation(s * (hw - 0.04), 1.05, zz * 0.6)).multiply(_s.makeScale(0.05, 0.05, Math.abs(zz) * 0.8)), opt);
    }
  } else {
    // corredera vista: hoja por la cara sa, abierta hacia el lado de la mano
    const ancho = w + 0.06;
    const haciaX0 = (sa > 0) === izq;
    const x = haciaX0 ? q.x0 - ancho * 0.85 : q.x1 - ancho * 0.15;
    const z = sa > 0 ? zp + 0.025 : zm - 0.025 - gr;
    P.caja('puerta', M, x, 0.01, z, ancho, ht + 0.02, gr, opt);
    P.caja('herraje', M, Math.min(x, q.x0) - 0.02, ht + 0.035, sa > 0 ? zp + 0.012 : zm - 0.042, Math.max(x + ancho, q.x1) - Math.min(x, q.x0) + 0.04, 0.03, 0.03, opt);
    P.caja('herraje', M, haciaX0 ? x + ancho - 0.06 : x + 0.04, 0.95, sa > 0 ? z + gr : z - 0.012, 0.02, 0.2, 0.012, opt);
  }
}

// Materiales propios de la casa (los de la cocina se reutilizan para techo, vidrio, marco, exterior…)
const cache = new Map();
export function materialesCasa(base, suelos) {
  const una = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
  const m = {
    muro: una('muro', () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 })),
    rodapie: una('rodapie', () => new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.45 })),
    puerta: una('puerta', () => new THREE.MeshStandardMaterial({ color: '#f5f4f0', roughness: 0.38 })),
    herraje: base.inox,
    marco: base.marco, vidrio: base.vidrio, alfeizar: base.alfeizar, exterior: base.exterior, downlight: base.downlight, techo: base.techo,
  };
  for (const [k, mat] of Object.entries(suelos)) m['suelo:' + k] = mat;
  return m;
}
export { hex };
