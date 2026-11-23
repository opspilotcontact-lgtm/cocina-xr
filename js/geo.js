// Utilidades de geometría: piezas en coordenadas locales de un tramo, UV en metros reales y fusión por material
// (pocas llamadas de dibujo → aguanta en las Quest).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Lote {
  constructor() { this.partes = []; this.matriz = new THREE.Matrix4(); }
  usar(m) { this.matriz = m; return this; }
  add(geo, mat, opt = {}) { this.partes.push({ geo, mat, m: this.matriz, uvPropias: !!opt.uvPropias, sinSombra: !!opt.sinSombra }); return geo; }
  caja(mat, x, y, z, w, h, d, opt) {
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x + w / 2, y + h / 2, z + d / 2); return this.add(g, mat, opt);
  }
  panel(mat, x, y, z, w, h, d = 0.018, r = 0.0018, opt) {
    if (w <= 0 || h <= 0) return null;
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const g = new RoundedBoxGeometry(w, h, d, 2, rr); g.translate(x + w / 2, y + h / 2, z + d / 2); return this.add(g, mat, opt);
  }
  cilindro(mat, x, y, z, r, largo, eje = 'y', seg = 16, opt) {
    const g = new THREE.CylinderGeometry(r, r, largo, seg);
    if (eje === 'x') g.rotateZ(Math.PI / 2); if (eje === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z); return this.add(g, mat, opt);
  }
}

// UV planares en metros según la cara: frentes (x,y) → veta vertical; tapas (z,x) → veta a lo largo del tramo.
function uvMetros(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getZ(i); v = p.getX(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function limpiar(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  ng.morphAttributes = {};
  ng.clearGroups();
  return ng;
}

// Devuelve un Group con una malla por material.
export function fusionar(lote, mats, { sombras = true } = {}) {
  const cubos = new Map();
  for (const p of lote.partes) {
    let g = limpiar(p.geo);
    if (!p.uvPropias) uvMetros(g);
    g.applyMatrix4(p.m);
    const clave = p.mat + (p.sinSombra ? '|ns' : '');
    if (!cubos.has(clave)) cubos.set(clave, []);
    cubos.get(clave).push(g);
  }
  const grupo = new THREE.Group();
  for (const [clave, geos] of cubos) {
    const [mat, ns] = clave.split('|');
    const material = mats[mat];
    if (!material) { console.warn('material sin definir', mat); continue; }
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material);
    const transparente = material.transparent || material.isMeshBasicMaterial;
    mesh.castShadow = sombras && !transparente && ns !== 'ns';
    mesh.receiveShadow = !material.isMeshBasicMaterial;
    mesh.name = mat;
    grupo.add(mesh);
  }
  return grupo;
}

export function liberar(obj) {
  obj?.traverse?.(o => { if (o.geometry) o.geometry.dispose(); });
}

// Matriz de un tramo: x local → dir, z local → normal hacia dentro, origen en a.
export function matrizTramo(a, dir) {
  return new THREE.Matrix4().makeRotationY(Math.atan2(-dir[1], dir[0])).setPosition(a[0], 0, a[1]);
}

// Tronco de pirámide rectangular (campanas): base y techo como [x0,x1,z0,z1].
export function tronco(base, techo, y0, y1) {
  const [bx0, bx1, bz0, bz1] = base, [tx0, tx1, tz0, tz1] = techo;
  const B = [[bx0, y0, bz0], [bx1, y0, bz0], [bx1, y0, bz1], [bx0, y0, bz1]];
  const Tt = [[tx0, y1, tz0], [tx1, y1, tz0], [tx1, y1, tz1], [tx0, y1, tz1]];
  const pos = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // cara exterior (orden antihorario visto desde fuera)
    pos.push(...B[i], ...Tt[j], ...B[j], ...B[i], ...Tt[i], ...Tt[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // asegurar normales hacia fuera
  const c = new THREE.Vector3((bx0 + bx1) / 2, (y0 + y1) / 2, (bz0 + bz1) / 2);
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  v.set(p.getX(0), p.getY(0), p.getZ(0)).sub(c); nn.set(n.getX(0), n.getY(0), n.getZ(0));
  if (v.dot(nn) < 0) { g.index = null; const a = p.array; for (let k = 0; k < a.length; k += 9) { for (let q = 0; q < 3; q++) { const t = a[k + 3 + q]; a[k + 3 + q] = a[k + 6 + q]; a[k + 6 + q] = t; } } g.computeVertexNormals(); }
  return g;
}

export { RoundedBoxGeometry };
