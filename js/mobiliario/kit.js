// Kit de construcción sobre un Lote: cada mueble se dibuja en SU marco (x centrado, z = 0 contra la pared y +z hacia la
// estancia, y = 0 en el suelo) y el kit lo lleva a su sitio con una matriz. Materiales: mob:atlas (celdas),
// mob:madera, mob:tela y mob:contacto (ver atlas.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../geo.js';
import { aCelda } from './atlas.js';

const _m = new THREE.Matrix4();

// Transformaciones sobre una geometría suelta (devuelven la misma geometría).
export function tf(g, { s = null, rx = 0, ry = 0, rz = 0, x = 0, y = 0, z = 0 } = {}) {
  if (s) g.scale(...(Array.isArray(s) ? s : [s, s, s]));
  if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
  if (x || y || z) g.translate(x, y, z);
  return g;
}
export const gCaja = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// RoundedBoxGeometry es cara de generar (≈1 ms): se guarda por medidas al milímetro y se clona.
const panelesHechos = new Map();
export function gPanel(w, h, d, r = 0.01, seg = 2) {
  const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const k = [w, h, d, rr].map(v => Math.round(v * 1000)).join(',') + ',' + seg;
  let g = panelesHechos.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, seg, rr); if (panelesHechos.size > 3000) panelesHechos.clear(); panelesHechos.set(k, g); }
  return g.clone();
}
// Primitivas guardadas por parámetros y clonadas (las plantas y los libros repiten miles de veces la misma forma).
const hechas = new Map();
const guardada = (k, fn) => { let g = hechas.get(k); if (!g) { if (hechas.size > 4000) hechas.clear(); g = fn(); hechas.set(k, g); } return g.clone(); };
const mm = v => Math.round(v * 10000);
export const gCil = (rT, rB, h, seg = 16) => guardada(`c${mm(rT)},${mm(rB)},${mm(h)},${seg}`, () => new THREE.CylinderGeometry(rT, rB, h, seg));
export const gEsfera = (r, ws = 12, hs = 8) => guardada(`e${mm(r)},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const gTorno = (perfil, seg = 20) => guardada('t' + perfil.map(([r, y]) => mm(r) + ':' + mm(y)).join(';') + ',' + seg, () => new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg));
export const gToro = (R, r, rs = 6, ts = 20) => new THREE.TorusGeometry(R, r, rs, ts);

export class Kit {
  constructor(L) { this.L = L; this.M = new THREE.Matrix4(); }
  // marco del mueble: posición en la estancia y giro (rad, en torno a y)
  en(x, z, rot = 0, y = 0) { this.M = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z); this.L.usar(this.M); return this; }
  // sub-marco dentro del actual (p. ej. una silla girada alrededor de la mesa)
  dentro(x, z, rot = 0, y = 0, fn) {
    const antes = this.M;
    this.M = antes.clone().multiply(_m.makeRotationY(rot).setPosition(x, y, z)); this.L.usar(this.M);
    fn(); this.M = antes; this.L.usar(antes);
  }
  // ----- atlas -----
  geo(celda, g, sub) { return this.L.add(aCelda(g, celda, sub), 'mob:atlas', { uvPropias: true }); }
  caja(celda, x, y, z, w, h, d, o) { if (w <= 0 || h <= 0 || d <= 0) return null; return this.geo(celda, tf(gCaja(w, h, d), { x: x + w / 2, y: y + h / 2, z: z + d / 2, ...o })); }
  panel(celda, x, y, z, w, h, d, r = 0.01, o, seg = 2) { if (w <= 0 || h <= 0 || d <= 0) return null; return this.geo(celda, tf(gPanel(w, h, d, r, seg), { x: x + w / 2, y: y + h / 2, z: z + d / 2, ...o })); }
  // vertical: base en y; eje 'x' o 'z': tumbado y centrado en (x, y, z)
  cil(celda, x, y, z, rT, rB, h, seg = 16, eje = 'y') {
    const g = gCil(rT, rB, h, seg);
    if (eje === 'x') { g.rotateZ(Math.PI / 2); g.translate(x, y, z); }
    else if (eje === 'z') { g.rotateX(Math.PI / 2); g.translate(x, y, z); }
    else g.translate(x, y + h / 2, z);
    return this.geo(celda, g);
  }
  esfera(celda, x, y, z, rx, ry = rx, rz = rx, ws = 12, hs = 8) { return this.geo(celda, tf(gEsfera(1, ws, hs), { s: [rx, ry, rz], x, y, z })); }
  torno(celda, perfil, x, y, z, seg = 20, s = 1) { return this.geo(celda, tf(gTorno(perfil, seg), { s, x, y, z })); }
  // barra entre dos puntos (tubos, patas inclinadas)
  barra(celda, a, b, r, seg = 8, mat = 'mob:atlas', rB = r) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    if (L < 1e-4) return null;
    const g = gCil(rB, r, L, seg); g.translate(0, L / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
    g.translate(A.x, A.y, A.z);
    return mat === 'mob:atlas' ? this.geo(celda, g) : this.L.add(g, mat);
  }
  // ----- madera y tela (UV en metros) -----
  madera(x, y, z, w, h, d, r = 0.004) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    if (r <= 0) return this.L.caja('mob:madera', x, y, z, w, h, d);
    return this.L.add(tf(gPanel(w, h, d, r), { x: x + w / 2, y: y + h / 2, z: z + d / 2 }), 'mob:madera');
  }
  maderaGeo(g) { return this.L.add(g, 'mob:madera'); }
  tela(x, y, z, w, h, d, r = 0.04, o = null, seg = 3) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const g = tf(gPanel(w, h, d, r, seg), { ...(o || {}), x: x + w / 2 + (o?.x || 0), y: y + h / 2 + (o?.y || 0), z: z + d / 2 + (o?.z || 0) });
    return this.L.add(g, 'mob:tela');
  }
  telaGeo(g) { return this.L.add(g, 'mob:tela'); }
  // ----- sombra de contacto en el suelo (o en un tablero a la altura y) -----
  mancha(cx, cz, rx, rz = rx, y = 0.002) {
    const g = new THREE.PlaneGeometry(2 * rx, 2 * rz); g.rotateX(-Math.PI / 2); g.translate(cx, y, cz);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 0.5 + uv.getX(k) * 0.5);
    return this.L.add(g, 'mob:contacto', { uvPropias: true, sinSombra: true });
  }
}
