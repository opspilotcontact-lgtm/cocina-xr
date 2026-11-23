// Distribución de piso piloto por estancia: decide DÓNDE va cada mueble (contra paredes libres, sin tapar puertas ni
// ventanas, dejando pasos) y luego lo dibuja con piezas.js. Coordenadas locales de la estancia (Espacio), metros.
//
// Regla de oro: primero se PLANEA (rectángulos en Espacio, sin dibujar) y solo se dibuja lo que cabe. Las
// distribuciones del salón se prueban en varias variantes y gana la que menos «trampas» hace.
import { Espacio, rectPared, puntoPared, rotDe, solapa, crecer } from './espacio.js';
import * as P from './piezas.js';

const PI = Math.PI;
const enPared = (k, w, s, sep = 0) => { const [x, z] = puntoPared(w, s, sep); return k.en(x, z, rotDe(w.dir)); };
// AABB del rectángulo [xa,xb]×[za,zb] de un marco (origen o, eje x = dir)
function rectMarco(o, dir, xa, xb, za, zb) {
  const n = [-dir[1], dir[0]], xs = [], zs = [];
  for (const a of [xa, xb]) for (const b of [za, zb]) { xs.push(o[0] + dir[0] * a + n[0] * b); zs.push(o[1] + dir[1] * a + n[1] * b); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
const paredCon = (E, n) => E.paredes.find(w => Math.abs(w.n[0] - n[0]) < 1e-3 && Math.abs(w.n[1] - n[1]) < 1e-3 && w.largo > 0.5);
const tieneHueco = (w, f = () => true) => w.huecos.some(f);
// eje x de un mueble cuyo frente (+z) mira hacia n
const dirPara = n => [n[1], -n[0]];

// Hueco de pared libre para colgar algo centrado en o (marco de un mueble contra la pared) entre yb y yb + alto:
// devuelve { x, ancho } en el marco del mueble (x = desplazamiento del centro) o null si no hay sitio.
function panoLibre(E, o, dir, yb, ancho, alto = 0.9) {
  const w = E.paredes.find(q => Math.abs(q.dir[0] - dir[0]) < 1e-3 && Math.abs(q.dir[1] - dir[1]) < 1e-3 && Math.abs((o[0] - q.a[0]) * q.n[0] + (o[1] - q.a[1]) * q.n[1]) < 0.02);
  if (!w) return null;
  const s = (o[0] - w.a[0]) * w.dir[0] + (o[1] - w.a[1]) * w.dir[1];
  let a = Math.max(0.05, s - ancho / 2), b = Math.min(w.largo - 0.05, s + ancho / 2);
  for (const h of w.huecos) {
    if (!(h.puerta || (h.y0 < yb + alto && h.y1 > yb))) continue;
    const h0 = h.s0 - 0.12, h1 = h.s1 + 0.12;
    if (h1 <= a || h0 >= b) continue;
    if (s < h0) b = Math.min(b, h0); else if (s > h1) a = Math.max(a, h1); else return null;
  }
  // tampoco encima de algo alto que esté pegado a esa pared (estantería, armario, cortina)
  for (const p of E.piezas) {
    if (p.suelo || p.alto < yb) continue;
    const d0 = Math.min((p.x0 - w.a[0]) * w.n[0] + (p.z0 - w.a[1]) * w.n[1], (p.x1 - w.a[0]) * w.n[0] + (p.z1 - w.a[1]) * w.n[1]);
    if (d0 > 0.2) continue;
    const ss = [(p.x0 - w.a[0]) * w.dir[0] + (p.z0 - w.a[1]) * w.dir[1], (p.x1 - w.a[0]) * w.dir[0] + (p.z1 - w.a[1]) * w.dir[1]];
    const p0 = Math.min(...ss) - 0.05, p1 = Math.max(...ss) + 0.05;
    if (p1 <= a || p0 >= b) continue;
    if (s < p0) b = Math.min(b, p0); else if (s > p1) a = Math.max(a, p1); else return null;
  }
  if (b - a < 0.45) return null;
  return { x: (a + b) / 2 - s, ancho: b - a };
}
function cuadrosEn(E, k, st, r, o, dir, yb, ancho, n = null) {
  const q = panoLibre(E, o, dir, yb, ancho);
  if (!q) return;
  k.en(o[0], o[1], rotDe(dir));
  P.cuadros(k, st, r, q.x, yb, q.ancho, E.H, q.ancho < ancho - 0.3 ? 1 : n);
}
// alfombras: solo estorba el barrido de una puerta abatible
const alfombraLibre = (E, ra) => E.dentro(ra) && !E.reservas.some(q => q.tipo === 'puerta' && q.h.tipo !== 'balconera' && solapa(ra, q));

// ---------- cortinas en todas las ventanas (antes que nada: ocupan el paño junto a la ventana) ----------
function cortinas(E, k, st) {
  for (const w of E.paredes) for (const h of w.huecos) {
    if (h.tipo !== 'ventana' && h.tipo !== 'balconera') continue;
    const lados = [[h.s0 - 0.24, h.s0 + 0.1], [h.s1 - 0.1, h.s1 + 0.24]].map(([a, b]) => {
      if (a < 0.01 || b > w.largo - 0.01) return false;
      if (w.huecos.some(o => o !== h && Math.min(o.s1, b) - Math.max(o.s0, a) > -0.03)) return false;
      const r = rectPared(w, a, b, 0, 0.16);
      return E.libre(r, 9, { reservas: false }) && !E.reservas.some(z => z.tipo === 'puerta' && z.h !== h.h && solapa(r, z));
    });
    if (!lados[0] && !lados[1]) continue;
    lados.forEach((ok, i) => { if (ok) E.ocupar(rectPared(w, i ? h.s1 - 0.1 : h.s0 - 0.24, i ? h.s1 + 0.24 : h.s0 + 0.1, 0, 0.16), 'cortina', E.H); });
    enPared(k, w, 0);
    P.cortinas(k, st, h.s0, h.s1, h.y1, E.H, lados);
  }
}

// Planta grande en una esquina libre
function plantaEsquina(E, k, st, r, tipos = ['ficus', 'monstera', 'olivo'], n = 1) {
  let puestas = 0;
  const vistas = [];
  for (const c of E.esquinas(0.26)) {
    if (puestas >= n) break;
    if (vistas.some(v => Math.hypot(v[0] - c.p[0], v[1] - c.p[1]) < 0.3)) continue;
    vistas.push(c.p);
    const rr = { x0: c.p[0] - 0.24, x1: c.p[0] + 0.24, z0: c.p[1] - 0.24, z1: c.p[1] + 0.24 };
    if (!E.libre(rr, 1.6) || E.piezas.some(q => !q.suelo && solapa(crecer(rr, 0.15), q) && q.tipo !== 'cortina')) continue;
    E.ocupar(rr, 'planta', 1.6);
    k.en(c.p[0], c.p[1], 0);
    P.planta(k, r, 0, 0, 0, tipos[(r() * tipos.length) | 0], st.maceta, 1);
    k.mancha(0, 0, 0.28);
    puestas++;
  }
  return puestas;
}

// =====================================================================================================
// SALÓN-COMEDOR
// =====================================================================================================
const anchosSofa = w => [w, 2.0, 1.8, 1.6].filter((v, i, l) => v <= w + 1e-6 && l.indexOf(v) === i);
// Mesa de comedor en cualquier sitio libre de la estancia, lo más cerca posible de `c` (rejilla de 10 cm).
function comedorEnRejilla(E, st, c) {
  const formas = st.mesa === 'redonda' ? [['redonda', 1.1, 1.1, 0, false], ['redonda', 0.95, 0.95, 0, false]] : [];
  formas.push(['rect', 1.6, 0.9, 2, true], ['rect', 1.4, 0.85, 2, false], ['rect', 1.2, 0.8, 2, false], ['redonda', 0.9, 0.9, 0, false]);
  const { x0, x1, z0, z1 } = E.caja;
  for (const [forma, mw, md, npl, cab] of formas) {
    let mejor = null, dMejor = Infinity;
    const red = forma === 'redonda';
    const hl = red || cab ? 0.62 : 0.15;                     // holgura en las cabeceras (lado corto)
    for (const dir of [[1, 0], [0, 1]]) {
      const ex = dir[0] ? mw / 2 + hl : md / 2 + 0.62, ez = dir[0] ? md / 2 + 0.62 : mw / 2 + hl;
      for (let x = x0 + ex; x <= x1 - ex + 1e-6; x += 0.1) for (let z = z0 + ez; z <= z1 - ez + 1e-6; z += 0.1) {
        const d = Math.hypot(x - c[0], z - c[1]);
        if (d >= dMejor) continue;
        const rS = { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez };
        if (!E.libre(rS, 0.85)) continue;
        dMejor = d; mejor = { tipo: 'comedor', forma, w: mw, d: md, npl, cab, o: [x, z], dir, rS };
      }
    }
    if (mejor) return mejor;
  }
  return null;
}
// Reserva: si ninguna variante cabe, sofá contra la pared libre más larga, mesa delante, tele enfrente si se puede
// (aunque no quede centrada) y comedor donde quepa. Un salón nunca se queda sin sofá.
function salonReserva(E, st) {
  const items = [];
  let sf = null;
  for (const an of [2.2, 2.0, 1.8, 1.6]) {
    for (const w of [...E.paredes].sort((a, b) => b.largo - a.largo)) {
      const c = E.buscarEnPared(w, an, 0.9, 0.86, { frente: 1.2 });
      if (c) { sf = { ...c, an }; break; }
    }
    if (sf) break;
  }
  if (!sf) return null;
  E.ocupar(sf.r, 'sofa', 0.86);
  const o = puntoPared(sf.w, sf.s), dir = sf.w.dir;
  items.push({ tipo: 'sofa', o, dir, ancho: sf.an, pegado: true });
  const mesaD = st.id === 'nordico' ? 0.84 : 0.6, mesaW = st.id === 'nordico' ? 0.84 : st.id === 'clasico' ? 1.0 : 1.1;
  const zMesa = 0.9 + 0.42 + mesaD / 2;
  const rMesa = rectMarco(o, dir, -mesaW / 2, mesaW / 2, zMesa - mesaD / 2, zMesa + mesaD / 2);
  if (E.libre(rMesa, 0.45)) { E.ocupar(rMesa, 'mesa', 0.45); items.push({ tipo: 'mesa', o, dir, x: 0, z: zMesa }); }
  const aw = Math.min(sf.an + 0.4, 2.4), az1 = zMesa + mesaD / 2 + 0.5;
  if (alfombraLibre(E, rectMarco(o, dir, -aw / 2, aw / 2, 0.45, az1))) items.push({ tipo: 'alfombra', o, dir, w: aw, z0: 0.45, z1: az1 });
  // tele en la pared de enfrente (paralela)
  const n = sf.w.n;
  const wOp = E.paredes.find(w => Math.abs(w.n[0] + n[0]) < 1e-3 && Math.abs(w.n[1] + n[1]) < 1e-3);
  if (wOp) {
    const pref = (o[0] - wOp.a[0]) * wOp.dir[0] + (o[1] - wOp.a[1]) * wOp.dir[1];
    for (const an of [1.8, 1.6, 1.4]) {
      const tv = E.buscarEnPared(wOp, an, 0.42, 1.4, { pref, frente: 1.0 });
      if (tv && Math.abs(tv.s - pref) < 1.2) {
        E.ocupar(tv.r, 'tv', 1.4); items.push({ tipo: 'tv', o: puntoPared(wOp, tv.s), dir: wOp.dir, ancho: an });
        const gap = (puntoPared(wOp, tv.s)[0] - o[0]) * n[0] + (puntoPared(wOp, tv.s)[1] - o[1]) * n[1];
        E.ocupar(rectMarco(o, dir, -sf.an / 2, sf.an / 2, 0.9, gap - 0.42), 'vista', 0);
        break;
      }
    }
  }
  const g = comedorEnRejilla(E, st, [(E.caja.x0 + E.caja.x1) / 2, (E.caja.z0 + E.caja.z1) / 2]);
  if (g) { E.ocupar(g.rS, 'comedor', 1.0); items.push(g); }
  return { score: -10, items, V: { reserva: true } };
}

// Una variante: zona de estar (TV + sofá enfrentados) y, si cabe, zona de comedor al otro extremo del eje largo.
function planearSalon(E, st, completo) {
  const { x0, x1, z0, z1 } = E.caja, W = x1 - x0, D = z1 - z0;
  const variantes = [];
  for (const eje of ['x', 'z']) {
    const Lg = eje === 'x' ? W : D, A = eje === 'x' ? D : W;
    const zonas = [];
    if (Lg >= 4.3 && A >= 2.6) {
      // varios cortes estar | comedor (el comedor necesita 1,6 m como poco)
      const cortes = new Set([Lg - 2.3, Lg - 2.0, Lg - 1.7].map(v => Math.round(Math.min(3.9, Math.max(2.7, v)) * 100) / 100).filter(v => Lg - v >= 1.6));
      for (const lv of cortes) zonas.push({ estar: [0, lv], comer: [lv, Lg] }, { estar: [Lg - lv, Lg], comer: [0, Lg - lv] });
    }
    zonas.push({ estar: [0, Lg], comer: null });
    for (const z of zonas) for (const plantilla of ['lados', 'ladosB', 'fondo']) variantes.push({ eje, Lg, A, ...z, plantilla });
  }
  // eje 'x': u = x, v = z;  eje 'z': u = z, v = x
  const aLocal = (eje, u, v) => (eje === 'x' ? [x0 + u, z0 + v] : [x0 + v, z0 + u]);
  const dirU = eje => (eje === 'x' ? [1, 0] : [0, 1]);
  const mejor = { score: -1e9, plan: null };
  for (const V of variantes) {
    const marca = E.piezas.length;
    const plan = probarVariante(E, st, completo, V, aLocal, dirU);
    E.piezas.length = marca;
    if (plan && plan.score > mejor.score) { mejor.score = plan.score; mejor.plan = plan; }
  }
  if (!mejor.plan) { const marca = E.piezas.length; mejor.plan = salonReserva(E, st); E.piezas.length = marca; }
  return mejor.plan;
}

// Depuración: con globalThis.__dbgMob = [] se apunta el número de cada variante del salón descartada (ver fallo(n)).
const fallo = n => { if (globalThis.__dbgMob) globalThis.__dbgMob.push(n); return null; };
function probarVariante(E, st, completo, V, aLocal, dirU) {
  const { eje, A, plantilla } = V;
  const [u0, u1] = V.estar, uc = (u0 + u1) / 2, lv = u1 - u0;
  const W = E.caja.x1 - E.caja.x0, D = E.caja.z1 - E.caja.z0;
  const items = [];
  let score = 0;
  // paredes: las del eje (v = 0 y v = A) y las de los extremos (u = 0, u = Lg)
  const nV0 = eje === 'x' ? [0, 1] : [1, 0], nVA = eje === 'x' ? [0, -1] : [-1, 0];
  const nU0 = eje === 'x' ? [1, 0] : [0, 1], nUL = eje === 'x' ? [-1, 0] : [0, -1];
  const sDe = (w, u, v) => { const p = aLocal(eje, u, v); return (p[0] - w.a[0]) * w.dir[0] + (p[1] - w.a[1]) * w.dir[1]; };
  const wTVancho = Math.min(1.8, Math.max(1.4, (plantilla === 'fondo' ? A : lv) - 0.9));
  let sofaW = completo ? 2.2 : 2.0;
  let tv = null, sf = null, sofaPared = null, sofaO = null, sofaDir = null;
  if (plantilla === 'lados' || plantilla === 'ladosB') {
    if (A < 3.0 || lv < 2.6) return fallo(1);
    const wTv = paredCon(E, plantilla === 'lados' ? nV0 : nVA), wSf = paredCon(E, plantilla === 'lados' ? nVA : nV0);
    if (!wTv || !wSf) return fallo(2);
    tv = E.buscarEnPared(wTv, wTVancho, 0.42, 1.4, { pref: sDe(wTv, uc, plantilla === 'lados' ? 0 : A), frente: 1.2 });
    if (!tv || Math.abs(tv.s - sDe(wTv, uc, 0)) > 0.6 && Math.abs(tv.s - sDe(wTv, uc, A)) > 0.6) return fallo(3);
    E.ocupar(tv.r, 'tv', 1.4);
    const dist = A - 0.42 - 0.9;
    if (dist < 1.9) return fallo(4);
    sofaW = Math.min(sofaW, lv - 0.3);
    if (sofaW < 1.6) return fallo(5);
    if (dist <= 3.4) {
      // el sofá, enfrente de la tele; si no cabe ahí, la tele se mueve a su eje
      const sEn = (w, p) => (p[0] - w.a[0]) * w.dir[0] + (p[1] - w.a[1]) * w.dir[1];
      const cTv = puntoPared(tv.w, tv.s);
      for (const an of anchosSofa(sofaW)) { sf = E.buscarEnPared(wSf, an, 0.9, 0.86, { pref: sEn(wSf, cTv), frente: 0.3 }); if (sf) { sofaW = an; break; } }
      if (!sf) return fallo(6);
      if (Math.abs(sEn(wSf, cTv) - sf.s) > 0.3) {
        E.piezas = E.piezas.filter(q => q.tipo !== 'tv');
        tv = E.buscarEnPared(wTv, wTVancho, 0.42, 1.4, { pref: sEn(wTv, puntoPared(wSf, sf.s)), frente: 1.2 });
        if (!tv || Math.abs(sEn(wTv, puntoPared(wSf, sf.s)) - tv.s) > 0.35) return fallo(18);
        E.ocupar(tv.r, 'tv', 1.4);
      }
      sofaPared = wSf;
      score -= Math.abs(dist - 2.8) * 0.6;
    } else {
      // sofá exento a 2,9 m de la tele, de espaldas a la pared contraria
      const v = plantilla === 'lados' ? 0.42 + 2.9 + 0.9 : A - 0.42 - 2.9 - 0.9;
      sofaDir = dirPara(plantilla === 'lados' ? nVA : nV0);
      sofaO = aLocal(eje, uc, v);
      score -= 1.2;
    }
  } else {
    // fondo: TV en la pared del extremo de la zona de estar
    const enU0 = u0 < 0.01, enUL = u1 > V.Lg - 0.01;
    if (!enU0 && !enUL) return fallo(7);
    const ext = enU0 && enUL ? (V.comer ? null : 'u0') : enU0 ? 'u0' : 'uL';
    if (!ext) return fallo(8);
    if (lv < 3.2 || A < 2.6) return fallo(9);
    const wTv = paredCon(E, ext === 'u0' ? nU0 : nUL);
    if (!wTv) return fallo(10);
    tv = E.buscarEnPared(wTv, wTVancho, 0.42, 1.4, { pref: sDe(wTv, ext === 'u0' ? 0 : V.Lg, A / 2), frente: 1.2 });
    if (!tv) return fallo(11);
    E.ocupar(tv.r, 'tv', 1.4);
    sofaW = Math.min(sofaW, A - 0.6);
    if (sofaW < 1.6) return fallo(12);
    const wOp = paredCon(E, ext === 'u0' ? nUL : nU0);
    const pegado = !V.comer && lv - 1.32 <= 3.4 && !!wOp;
    const dist = pegado ? lv - 1.32 : Math.min(2.9, lv - 1.32 - 0.1);
    if (dist < 2.0) return fallo(13);
    const uSofa = ext === 'u0' ? 0.42 + dist + 0.9 : V.Lg - 0.42 - dist - 0.9;
    if (pegado) {
      // frente a la tele
      const tc = [(tv.r.x0 + tv.r.x1) / 2, (tv.r.z0 + tv.r.z1) / 2];
      const pref = (tc[0] - wOp.a[0]) * wOp.dir[0] + (tc[1] - wOp.a[1]) * wOp.dir[1];
      for (const an of anchosSofa(sofaW)) { sf = E.buscarEnPared(wOp, an, 0.9, 0.86, { pref, frente: 0.3 }); if (sf && Math.abs(sf.s - pref) <= 0.5) { sofaW = an; break; } sf = null; }
      if (!sf) return fallo(14);
      sofaPared = wOp;
    } else {
      sofaDir = dirPara(ext === 'u0' ? nUL : nU0);
      const tc = [(tv.r.x0 + tv.r.x1) / 2, (tv.r.z0 + tv.r.z1) / 2];
      const along = eje === 'x' ? tc[1] - E.caja.z0 : tc[0] - E.caja.x0;
      sofaO = aLocal(eje, uSofa, along);
      score -= 0.6;
    }
    score -= 0.3;
  }
  // sofá exento: se busca la huella libre más centrada (ancho y desplazamiento) y la tele le sigue
  if (sofaO) {
    let hecho = null;
    buscar: for (const an of anchosSofa(sofaW)) for (const dx of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6]) {
      const o = ptoEn(sofaO, sofaDir, dx, 0);
      const r = rectMarco(o, sofaDir, -an / 2, an / 2, 0, 0.9);
      if (!E.libre(r, 0.86)) continue;
      // y que quede paso detrás
      if (!E.dentro(rectMarco(o, sofaDir, -an / 2, an / 2, -0.7, 0))) continue;
      hecho = { r, o, an, dx }; break buscar;
    }
    if (!hecho) return fallo(15);
    sofaW = hecho.an;
    if (Math.abs(hecho.dx) > 0.05) {
      const sEn = (w, p) => (p[0] - w.a[0]) * w.dir[0] + (p[1] - w.a[1]) * w.dir[1];
      const wTv = tv.w, pref = sEn(wTv, hecho.o);
      E.piezas = E.piezas.filter(q => q.tipo !== 'tv');
      tv = E.buscarEnPared(wTv, wTVancho, 0.42, 1.4, { pref, frente: 1.2 });
      if (!tv || Math.abs(tv.s - pref) > 0.35 || solapa(tv.r, hecho.r)) return fallo(16);
      E.ocupar(tv.r, 'tv', 1.4);
    }
    E.ocupar(hecho.r, 'sofa', 0.86);
    sf = { r: hecho.r, o: hecho.o, dir: sofaDir };
  } else E.ocupar(sf.r, 'sofa', 0.86);
  // marco del sofá: o (centro del respaldo) y eje x
  const sofaM = sofaPared ? { o: puntoPared(sofaPared, sf.s), dir: sofaPared.dir } : { o: sf.o, dir: sf.dir };
  const tvM = { o: puntoPared(tv.w, tv.s), dir: tv.w.dir };
  const nS = [-sofaM.dir[1], sofaM.dir[0]];
  const gap = (tvM.o[0] - sofaM.o[0]) * nS[0] + (tvM.o[1] - sofaM.o[1]) * nS[1];   // respaldo → pared de la tele
  // mesa de centro a 0,42 del frente del sofá (si la tele queda cerca, en medio)
  const mesaD = st.id === 'nordico' ? 0.84 : 0.6, mesaW = st.id === 'nordico' ? 0.84 : st.id === 'clasico' ? 1.0 : 1.1;
  const zMesa = Math.min(0.9 + 0.42 + mesaD / 2, 0.9 + (gap - 0.9 - 0.42) / 2);
  let xMesa = null, rMesa = null;
  for (const dx of [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3]) {
    rMesa = rectMarco(sofaM.o, sofaM.dir, dx - mesaW / 2, dx + mesaW / 2, zMesa - mesaD / 2, zMesa + mesaD / 2);
    if (E.libre(rMesa, 0.45)) { xMesa = dx; break; }
  }
  if (xMesa == null) return fallo(17);
  E.ocupar(rMesa, 'mesa', 0.45);
  // alfombra: del medio del sofá hasta pasada la mesa
  let alfW = Math.min(sofaW + 0.5, 2.6), alfZ0 = 0.45, alfZ1 = Math.min(gap - 0.55, zMesa + mesaD / 2 + 0.55);
  let rAlf = rectMarco(sofaM.o, sofaM.dir, -alfW / 2, alfW / 2, alfZ0, alfZ1);
  const alfOk = () => alfombraLibre(E, rAlf);
  for (let i = 0; i < 6 && !alfOk(); i++) { alfW -= 0.2; alfZ1 -= 0.05; rAlf = rectMarco(sofaM.o, sofaM.dir, -alfW / 2, alfW / 2, alfZ0, alfZ1); }
  const alf = alfOk() ? { w: alfW, z0: alfZ0, z1: alfZ1 } : null;
  if (alf) score += 0.3;
  items.push({ tipo: 'tv', ...tvM, ancho: wTVancho }, { tipo: 'sofa', ...sofaM, ancho: sofaW, pegado: !!sofaPared }, { tipo: 'mesa', ...sofaM, x: xMesa, z: zMesa }, alf && { tipo: 'alfombra', ...sofaM, ...alf });
  // la línea de vista sofá → tele queda libre (que el comedor no se meta en medio)
  E.ocupar(rectMarco(sofaM.o, sofaM.dir, -sofaW / 2, sofaW / 2, 0.9, gap - 0.42), 'vista', 0);
  // ----- comedor -----
  if (V.comer) {
    const [c0, c1] = V.comer, lc = c1 - c0;
    const formas = st.mesa === 'redonda' ? [['redonda', 1.1, 1.1, 0, false], ['redonda', 0.95, 0.95, 0, false]] : [];
    formas.push(['rect', 1.8, 0.9, 3, false], ['rect', 1.6, 0.9, 2, true], ['rect', 1.4, 0.85, 2, false], ['rect', 1.2, 0.8, 2, false]);
    let puesto = null;
    for (const [forma, mw, md, npl, cab] of formas) {
      // mesa con el lado largo a lo ancho de la zona si cabe; si no, a lo largo
      for (const largoEnU of [false, true]) {
        const du = largoEnU ? mw : md, dv = largoEnU ? md : mw;
        // holgura para sacar las sillas (0,62) en los lados con sillas; 0,15 en las cabeceras vacías
        const red = forma === 'redonda';
        const hu = red ? 0.62 : largoEnU ? (cab ? 0.62 : 0.15) : 0.62, hv = red ? 0.62 : largoEnU ? 0.62 : (cab ? 0.62 : 0.15);
        if (du + 2 * hu > lc + 0.02 || dv + 2 * hv > A - 0.1) continue;
        for (const dvOff of [0, -0.3, 0.3, -0.6, 0.6]) {
          const cu = c0 + lc / 2, cv = A / 2 + dvOff;
          const c = aLocal(eje, cu, cv), ext = eje === 'x' ? [du / 2, dv / 2] : [dv / 2, du / 2];
          const hx = eje === 'x' ? hu : hv, hz = eje === 'x' ? hv : hu;
          const rT = { x0: c[0] - ext[0], x1: c[0] + ext[0], z0: c[1] - ext[1], z1: c[1] + ext[1] };
          const rS = { x0: rT.x0 - hx, x1: rT.x1 + hx, z0: rT.z0 - hz, z1: rT.z1 + hz };
          if (!E.libre(rS, 0.85)) continue;
          // eje x de la mesa = su lado largo
          const dir = (eje === 'x') === largoEnU ? [1, 0] : [0, 1];
          puesto = { tipo: 'comedor', forma, w: mw, d: md, npl, cab, o: c, dir, rS };
          break;
        }
        if (puesto) break;
      }
      if (puesto) break;
    }
    if (puesto) { E.ocupar(puesto.rS, 'comedor', 1.0); items.push(puesto); score += 3; }
    else {
      const g = comedorEnRejilla(E, st, aLocal(eje, (c0 + c1) / 2, A / 2));
      if (g) { E.ocupar(g.rS, 'comedor', 1.0); items.push(g); score += 2; } else score -= 1;
    }
  } else if (A * V.Lg >= 15) {
    // salón-comedor sin zona de comedor separada: la mesa donde quepa
    const g = comedorEnRejilla(E, st, aLocal(eje, V.Lg / 2, A / 2));
    if (g) { E.ocupar(g.rS, 'comedor', 1.0); items.push(g); score += 1.5; }
  }
  // preferencias: sofá contra pared mejor que exento; tele no en la pared de la balconera
  if (tieneHueco(tv.w, h => h.tipo === 'balconera')) score -= 0.8;
  if (sofaW < 2.0) score -= (2.0 - sofaW) * 2;
  if (sofaPared) score += 0.5;
  return { score, items: items.filter(Boolean), V };
}

export { planearSalon };
export function salon(E, k, st, r, completo) {
  let plan = E.rect ? planearSalon(E, st, completo) : null;
  if (!plan) { const marca = E.piezas.length; plan = salonReserva(E, st); E.piezas.length = marca; }
  if (!plan) { plantaEsquina(E, k, st, r, ['ficus', 'monstera'], 2); cortinas(E, k, st); return; }
  // volver a ocupar lo planeado (planear deja las piezas tal cual estaban)
  const H = E.H;
  let sofa = null, mesa = null, tv = null, com = null;
  for (const it of plan.items) {
    if (it.tipo === 'tv') { tv = it; k.en(it.o[0], it.o[1], rotDe(it.dir)); const t = P.muebleTV(k, st, it.ancho, r, completo, H); E.ocupar(rectMarco(it.o, it.dir, -it.ancho / 2, it.ancho / 2, 0, 0.42), 'tv', t.alto); }
    if (it.tipo === 'sofa') { sofa = it; k.en(it.o[0], it.o[1], rotDe(it.dir)); P.sofa(k, st, it.ancho, r, { completo }); E.ocupar(rectMarco(it.o, it.dir, -it.ancho / 2, it.ancho / 2, 0, 0.9), 'sofa', 0.86); }
    if (it.tipo === 'mesa') { mesa = it; k.en(...ptoEn(it.o, it.dir, it.x, it.z), rotDe(it.dir)); P.mesaCentro(k, st, r, completo); }
    if (it.tipo === 'alfombra') { k.en(it.o[0], it.o[1], rotDe(it.dir)); P.alfombra(k, st.alfombra, it.w, it.z1 - it.z0, 0, (it.z0 + it.z1) / 2); }
    if (it.tipo === 'comedor') {
      com = it; k.en(it.o[0], it.o[1], rotDe(it.dir));
      P.comedor(k, st, it.forma, it.w, it.d, it.npl, it.cab);
      E.ocupar(it.rS, 'comedor', 1.0);
      if (completo) P.bodegon(k, r, 0, 0.75, 0, Math.min(0.6, it.w * 0.4), st, 1);
      const yL = Math.min(H - 0.5, 1.62);
      if (it.forma !== 'redonda' && it.w >= 1.6 && (st.colgante === 'cupula' || st.colgante === 'campana')) for (const s of [-1, 1]) P.colgante(k, st, s * it.w * 0.22, 0, H, yL);
      else P.colgante(k, st, 0, 0, H, yL);
    }
  }
  if (mesa) E.ocupar(rectMarco(ptoEn(mesa.o, mesa.dir, mesa.x, mesa.z), mesa.dir, -0.55, 0.55, -0.42, 0.42), 'mesa', 0.45);
  // ----- extras del piso piloto -----
  if (sofa && completo) {
    // lámpara de pie junto a un brazo del sofá (el lado con sitio)
    for (const lado of [1, -1]) {
      const p = ptoEn(sofa.o, sofa.dir, lado * (sofa.ancho / 2 + 0.24), 0.28);
      const rr = { x0: p[0] - 0.2, x1: p[0] + 0.2, z0: p[1] - 0.2, z1: p[1] + 0.2 };
      if (!E.libre(rr, 1.9)) continue;
      E.ocupar(rr, 'lampara', 1.9);
      // el arco vuela hacia el centro del sofá
      k.en(p[0], p[1], rotDe(sofa.dir));
      P.lamparaPie(k, st, -lado);
      k.mancha(0, 0, 0.22);
      break;
    }
    // butaca mirando a la mesa de centro, por el lado libre
    if (mesa) {
      const c = ptoEn(mesa.o, mesa.dir, mesa.x, mesa.z);
      for (const lado of [1, -1]) {
        const d = 0.62 + 0.5;
        const p = ptoEn(c, mesa.dir, lado * d, 0);
        // la butaca mira hacia la mesa
        const dir = dirPara([-lado * mesa.dir[0], -lado * mesa.dir[1]]);
        const o = ptoEn(p, dir, 0, -0.41);
        const rr = rectMarco(o, dir, -0.43, 0.43, 0, 0.82);
        if (!E.libre(rr, 0.8) || !E.dentro(rectMarco(o, dir, -0.43, 0.43, -0.25, 0))) continue;
        E.ocupar(rr, 'butaca', 0.8);
        k.en(o[0], o[1], rotDe(dir));
        P.sofa(k, st, 0.86, r, { completo, butaca: true });
        break;
      }
    }
    // cuadros sobre el sofá si va contra la pared
    if (sofa.pegado) cuadrosEn(E, k, st, r, sofa.o, sofa.dir, 0.98, sofa.ancho);
  }
  // aparador en la zona de comedor y estantería en una pared libre
  if (completo) {
    const zonaCom = com?.rS;
    const paredes = [...E.paredes].sort((a, b) => b.largo - a.largo);
    let apar = null;
    if (zonaCom) {
      const cc = [(zonaCom.x0 + zonaCom.x1) / 2, (zonaCom.z0 + zonaCom.z1) / 2];
      buscar: for (const an of [1.6, 1.4, 1.2]) for (const w of paredes) {
        const pref = (cc[0] - w.a[0]) * w.dir[0] + (cc[1] - w.a[1]) * w.dir[1];
        const c = E.buscarEnPared(w, an, 0.44, 0.82, { pref, frente: 0.15 });
        if (!c) continue;
        const p = puntoPared(w, c.s, 0.22);
        if (Math.hypot(p[0] - cc[0], p[1] - cc[1]) > 2.2) continue;
        apar = { ...c, an }; break buscar;
      }
      if (apar) {
        E.ocupar(apar.r, 'aparador', 0.82);
        enPared(k, apar.w, apar.s);
        const h = P.cuerpo(k, st, apar.an, 0.44, 0.82, { frentes: st.id === 'industrial' ? 'cajones' : 'puertas' });
        P.bodegon(k, r, -apar.an * 0.2, h, 0.22, apar.an * 0.5, st, 0);
        P.bodegon(k, r, apar.an * 0.25, h, 0.22, apar.an * 0.4, st, 2);
        cuadrosEn(E, k, st, r, puntoPared(apar.w, apar.s), apar.w.dir, 1.25, apar.an, 1);
      }
    }
    estant: for (const an of [1.0, 0.8]) for (const w of paredes) {
      const est = E.buscarEnPared(w, an, 0.33, 2.0, { frente: 0.7 });
      if (!est) continue;
      E.ocupar(est.r, 'estanteria', 2.0);
      enPared(k, w, est.s);
      P.estanteria(k, st, an, Math.min(2.0, H - 0.35), r);
      k.mancha(0, 0.17, an / 2 + 0.05, 0.22);
      break estant;
    }
  }
  plantaEsquina(E, k, st, r, st.id === 'clasico' ? ['ficus', 'boj'] : st.id === 'industrial' ? ['olivo', 'sansevieria', 'monstera'] : ['ficus', 'monstera', 'olivo'], completo ? 2 : 1);
  // las cortinas, al final: solo en los lados de ventana que han quedado libres
  cortinas(E, k, st);
}
const ptoEn = (o, dir, x, z) => [o[0] + dir[0] * x - dir[1] * z, o[1] + dir[1] * x + dir[0] * z];

// =====================================================================================================
// DORMITORIO
// =====================================================================================================
export function dormitorio(E, k, st, r, completo, principal) {
  const corto = Math.min(E.W, E.D), area = E.area;
  const opciones = principal && corto >= 3.0 && area >= 10.5 ? [[1.6, 2.0], [1.5, 1.9], [1.35, 1.9], [0.9, 1.9]]
    : corto >= 2.7 && area >= 8.5 ? [[1.5, 1.9], [1.35, 1.9], [0.9, 1.9]] : [[1.35, 1.9], [0.9, 1.9]];
  let mejor = null;
  for (const [cw, cl] of opciones) {
    const fw = cw + 0.18, z1 = 0.07 + cl + 0.05, doble = cw > 1;
    for (const sinVentanas of [false, true]) {
      for (const w of E.paredes) {
        if (w.largo < fw + 0.05) continue;
        const pasoLado = doble ? 0.55 : 0.0;
        for (let s = fw / 2 + 0.02; s <= w.largo - fw / 2 - 0.02 + 1e-6; s += 0.05) {
          const r0 = rectPared(w, s - fw / 2, s + fw / 2, 0, z1);
          if (!E.libre(r0, sinVentanas ? 0.6 : 1.15)) continue;
          // pasos: a los lados (o a uno si es individual) y a los pies
          const ladoL = rectPared(w, s - fw / 2 - 0.55, s - fw / 2, 0.45, z1), ladoR = rectPared(w, s + fw / 2, s + fw / 2 + 0.55, 0.45, z1);
          const ok = q => E.dentro(q) && !E.piezas.some(p => !p.suelo && p.tipo !== 'cortina' && solapa(q, p));
          const L = ok(ladoL), R = ok(ladoR);
          if (doble ? !(L && R) : !(L || R)) continue;
          const pie = rectPared(w, s - fw / 2 + 0.1, s + fw / 2 - 0.1, z1, z1 + 0.6);
          if (!ok(pie)) continue;
          let score = -Math.abs(s - w.largo / 2) * (doble ? 1.2 : 0.3);
          if (tieneHueco(w, h => h.puerta)) score -= 0.8;
          if (tieneHueco(w, h => !h.puerta)) score -= 0.6;
          if (sinVentanas) score -= 2;
          if (!doble) score += (L !== R ? 0.5 : 0) - (s < w.largo / 2 ? 0 : 0.01);
          score += cw * 2;        // cama más grande mejor
          void pasoLado;
          if (!mejor || score > mejor.score) mejor = { w, s, cw, cl, fw, z1, score, L, R, sinVentanas };
        }
      }
      if (mejor) break;
    }
    if (mejor) break;
  }
  // reserva: un dormitorio nunca se queda sin cama → la más pequeña que quepa, solo con 0,4 libres a los pies
  if (!mejor) {
    for (const [cw, cl] of [[1.35, 1.9], [0.9, 1.9]]) {
      const fw = cw + 0.18, z1 = 0.07 + cl + 0.05;
      for (const w of E.paredes) for (let s = fw / 2 + 0.02; s <= w.largo - fw / 2 - 0.02 + 1e-6; s += 0.05) {
        if (!E.libre(rectPared(w, s - fw / 2, s + fw / 2, 0, z1), 0.6) || !E.dentro(rectPared(w, s - fw / 2, s + fw / 2, z1, z1 + 0.4))) continue;
        const score = -Math.abs(s - w.largo / 2) + cw;
        if (!mejor || score > mejor.score) mejor = { w, s, cw, cl, fw, z1, score };
      }
      if (mejor) break;
    }
  }
  if (!mejor) { plantaEsquina(E, k, st, r, ['monstera'], 1); cortinas(E, k, st); return; }
  const { w, s, cw, cl, fw, z1 } = mejor;
  E.ocupar(rectPared(w, s - fw / 2, s + fw / 2, 0, z1), 'cama', 1.15);
  enPared(k, w, s);
  P.cama(k, st, cw, cl, r, completo);
  // mesillas
  for (const lado of [-1, 1]) {
    const sm = s + lado * (fw / 2 + 0.26);
    const rm = rectPared(w, sm - 0.225, sm + 0.225, 0, 0.38);
    if (!E.libre(rm, 0.62)) continue;
    E.ocupar(rm, 'mesilla', 0.62);
    enPared(k, w, sm);
    P.mesilla(k, st, r, completo, lado);
  }
  // cuadro sobre el cabecero
  if (completo) cuadrosEn(E, k, st, r, puntoPared(w, s), w.dir, st.cabecero === 'capitone' ? 1.38 : 1.22, fw + 0.4, cw > 1.3 ? 2 : 1);
  // alfombra bajo los dos tercios de la cama
  if (completo && cw > 1) {
    const aw = Math.min(fw + 1.0, 2.4), az0 = 0.75, az1 = Math.min(z1 + 0.45, z1 + 0.5);
    const ra = rectPared(w, s - aw / 2, s + aw / 2, az0, az1);
    if (alfombraLibre(E, ra)) { enPared(k, w, s); P.alfombra(k, st.alfombra, aw, az1 - az0, 0, (az0 + az1) / 2); }
  }
  // armario: el más ancho que quepa en una pared libre, con 0,7 delante
  const h = Math.min(2.4, E.H - 0.05);
  let arm = null;
  for (const an of [2.4, 2.0, 1.6, 1.2, 1.0]) {
    for (const wa of [...E.paredes].sort((a, b) => b.largo - a.largo)) { arm = E.buscarEnPared(wa, an, 0.6, h, { frente: 0.7 }); if (arm) { arm.an = an; break; } }
    if (arm) break;
  }
  if (arm) { E.ocupar(arm.r, 'armario', h); enPared(k, arm.w, arm.s); P.armario(k, st, arm.an, h); k.mancha(0, 0.3, arm.an / 2 + 0.05, 0.34); }
  // banco a los pies
  if (completo && cw > 1.2) {
    const rb = rectPared(w, s - 0.6, s + 0.6, z1 + 0.02, z1 + 0.42);
    const delante = rectPared(w, s - 0.6, s + 0.6, z1 + 0.42, z1 + 1.0);
    if (E.libre(rb, 0.5) && E.dentro(delante) && !E.piezas.some(p => !p.suelo && solapa(delante, p))) { E.ocupar(rb, 'banco', 0.5); enPared(k, w, s, z1 + 0.02); P.banco(k, st, 1.2); }
  }
  // cómoda con espejo o cuadro
  if (completo) {
    for (const wc of [...E.paredes].sort((a, b) => b.largo - a.largo)) {
      const c = E.buscarEnPared(wc, 1.0, 0.45, 0.82, { frente: 0.65 });
      if (!c) continue;
      E.ocupar(c.r, 'comoda', 0.82);
      enPared(k, wc, c.s);
      const hh = P.cuerpo(k, st, 1.0, 0.45, 0.82, { frentes: 'cajones', n: 3 });
      P.bodegon(k, r, 0.2, hh, 0.24, 0.4, st, 2);
      P.planta(k, r, -0.32, hh, 0.22, 'pequena', st.maceta, 1.1);
      const q = panoLibre(E, puntoPared(wc, c.s), wc.dir, 1.02, 1.0);
      if (q && q.ancho >= 0.7 && Math.abs(q.x) < 0.2 && r() < 0.5) P.espejo(k, st, q.x, 1.45, 0.62, 0.8);
      else cuadrosEn(E, k, st, r, puntoPared(wc, c.s), wc.dir, 1.12, 1.0, 1);
      break;
    }
  }
  plantaEsquina(E, k, st, r, ['monstera', 'sansevieria', 'ficus'], completo ? 1 : 0);
  cortinas(E, k, st);
}

// =====================================================================================================
// RECIBIDOR Y PASILLO
// =====================================================================================================
export function recibidor(E, k, st, r, completo, esPasillo) {
  // la entrada: la puerta en una pared que da a la calle (exterior); si no hay, la primera puerta
  let ent = null;
  for (const w of E.paredes) for (const h of w.huecos) if (h.puerta && (!ent || (w.exterior && !ent.w.exterior))) ent = { w, h };
  const pe = ent ? puntoPared(ent.w, (ent.h.s0 + ent.h.s1) / 2, 0.5) : [(E.caja.x0 + E.caja.x1) / 2, (E.caja.z0 + E.caja.z1) / 2];
  const dist = (w, s) => { const p = puntoPared(w, s, 0.15); return Math.hypot(p[0] - pe[0], p[1] - pe[1]); };
  // consola: la pared más cercana a la entrada con 0,9 de paso delante
  const fondo = esPasillo ? 0.28 : 0.36, paso = esPasillo ? 0.78 : 0.85;
  let mejor = null;
  for (const w of E.paredes) {
    for (const an of [1.1, 0.9, 0.75]) {
      for (let s = an / 2 + 0.03; s < w.largo - an / 2 - 0.03; s += 0.1) {
        const c = E.buscarEnPared(w, an, fondo, 0.82, { pref: s, frente: paso, paso: 1 });
        if (!c || Math.abs(c.s - s) > 0.01) continue;
        const d = dist(w, s) - an * 0.3;
        if (!mejor || d < mejor.d) mejor = { ...c, an, d };
      }
    }
  }
  if (mejor && mejor.d < 3.5) {
    E.ocupar(mejor.r, 'consola', 1.9);
    enPared(k, mejor.w, mejor.s);
    const an = mejor.an;
    const h = P.cuerpo(k, st, an, fondo, 0.8, { frentes: st.id === 'industrial' || st.id === 'nordico' ? 'abierto' : 'cajones', n: st.id === 'clasico' ? 2 : 1, colgado: st.id === 'moderno', y0: st.id === 'moderno' ? 0.45 : null });
    P.espejo(k, st, 0, 1.5, Math.min(0.75, an * 0.8), 0.9);
    if (st.id === 'industrial' || st.id === 'clasico') P.lamparaMesa(k, an * 0.32, h, fondo * 0.5, st, 0.85);
    else P.cuenco(k, an * 0.28, h, fondo * 0.5, 0.11, 'ceramicaArena');
    P.bodegon(k, r, -an * 0.2, h, fondo * 0.5, an * 0.45, st, completo ? 1 : 0);
    if (st.id === 'nordico' || st.id === 'industrial') {
      // cesto bajo la consola
      k.panel(st.id === 'industrial' ? 'cuerda' : 'mimbre', -0.18, 0, 0.04, 0.36, 0.26, fondo - 0.07, 0.015);
    }
    if (st.id !== 'moderno') k.mancha(0, fondo / 2, an / 2 + 0.05, fondo / 2 + 0.05);
    // paragüero al lado
    if (completo) for (const lado of [1, -1]) {
      const sp = mejor.s + lado * (an / 2 + 0.2);
      const rp = rectPared(mejor.w, sp - 0.12, sp + 0.12, 0.03, 0.27);
      const fr = rectPared(mejor.w, sp - 0.12, sp + 0.12, 0.27, 0.27 + paso);
      if (!E.libre(rp, 0.9) || !E.dentro(fr) || E.piezas.some(p => !p.suelo && solapa(fr, p))) continue;
      E.ocupar(rp, 'paraguero', 0.9);
      enPared(k, mejor.w, sp); P.paraguero(k, st, 0, 0.15);
      break;
    }
  }
  // perchero de pared (abrigos) cerca de la entrada
  if (completo) {
    let per = null;
    for (const w of E.paredes) {
      const c = E.buscarEnPared(w, 0.7, 0.16, 1.9, { pref: ent && w === ent.w ? ent.h.s1 + 0.5 : null, frente: paso });
      if (c && (!per || dist(w, c.s) < per.d)) per = { ...c, d: dist(w, c.s) };
    }
    if (per && per.d < 3) { E.ocupar(per.r, 'perchero', 1.9); enPared(k, per.w, per.s); P.perchero(k, st, 0, 1.72, 0.7); }
  }
  // cuadros en los paños largos que quedan
  if (completo) {
    let n = 0;
    for (const w of [...E.paredes].sort((a, b) => b.largo - a.largo)) {
      for (const [a, b] of E.tramosLibres(w, 1.0)) {
        if (n >= (esPasillo ? 3 : 1)) break;
        const sc = (a + b) / 2, rc = rectPared(w, sc - 0.35, sc + 0.35, 0, 0.05);
        const fr = rectPared(w, sc - 0.35, sc + 0.35, 0, 0.9);
        if (!E.dentro(fr) || E.piezas.some(p => !p.suelo && p.alto > 1.0 && solapa(rc, p))) continue;
        enPared(k, w, sc);
        P.cuadro(k, st, st.cuadros[n % st.cuadros.length], 0, 1.55, 0.5, 0.65);
        n++;
      }
    }
  }
  // alfombra en el recibidor (no en el pasillo)
  if (!esPasillo && completo && E.rect) {
    const c = [(E.caja.x0 + E.caja.x1) / 2, (E.caja.z0 + E.caja.z1) / 2];
    const aw = Math.min(1.6, E.W - 0.6), ad = Math.min(1.0, E.D - 0.6);
    const ra = { x0: c[0] - aw / 2, x1: c[0] + aw / 2, z0: c[1] - ad / 2, z1: c[1] + ad / 2 };
    if (aw > 0.6 && ad > 0.5 && alfombraLibre(E, ra)) { k.en(c[0], c[1], 0); P.alfombra(k, st.alfombra, aw, ad); }
  }
  if (!esPasillo) plantaEsquina(E, k, st, r, ['ficus', 'sansevieria'], 1);
}

// Terraza: un par de macetas grandes en las esquinas, sin muebles que se mojen
export function terraza(E, k, st, r, completo) {
  plantaEsquina(E, k, st, r, ['olivo', 'lavanda', 'boj'], completo ? 3 : 1);
}

export { Espacio };
