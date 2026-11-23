// Habitación: paredes (con hueco de ventana), suelo, techo, ventana con exterior y luces por hora del día.
import * as THREE from 'three';
import { paredes, fondoSala } from './modelo.js';
import { Lote, fusionar, matrizTramo } from './geo.js';

const GROSOR = 0.25;

export function construirSala(e, mats) {
  const P = paredes(e);
  const H = e.sala.alto / 100, W = e.sala.A / 100, D = fondoSala(e);
  const v = e.ventana;
  const grupo = new THREE.Group(); grupo.name = 'sala';
  const muros = [];
  let ventanaInfo = null;
  const sombras = new THREE.Group(); sombras.name = 'sombras';

  for (const id of ['A', 'B', 'C', 'D']) {
    const p = P[id];
    const R = matrizTramo(p.a, [(p.b[0] - p.a[0]) / p.largo, (p.b[1] - p.a[1]) / p.largo]);
    const L = new Lote().usar(R);
    const ext = (id === 'A' || id === 'D') ? GROSOR : 0; // A y D cierran las esquinas
    const x0 = -ext, x1 = p.largo + ext;
    const vt = v.activa && v.pared === id ? { a: v.x / 100, b: (v.x + v.ancho) / 100, s: v.antepecho / 100, t: Math.min(H - 0.05, (v.antepecho + v.alto) / 100) } : null;
    if (vt) {
      L.caja('pared', x0, 0, -GROSOR, vt.a - x0, H, GROSOR);
      L.caja('pared', vt.b, 0, -GROSOR, x1 - vt.b, H, GROSOR);
      L.caja('pared', vt.a, 0, -GROSOR, vt.b - vt.a, vt.s, GROSOR);
      L.caja('pared', vt.a, vt.t, -GROSOR, vt.b - vt.a, H - vt.t, GROSOR);
      // carpintería (PVC blanco), dos hojas si es ancha
      const zc = -0.13, pf = 0.065, fd = 0.07;
      const w = vt.b - vt.a, h = vt.t - vt.s;
      L.caja('marco', vt.a, vt.s, zc, pf, h, fd); L.caja('marco', vt.b - pf, vt.s, zc, pf, h, fd);
      L.caja('marco', vt.a, vt.s, zc, w, pf, fd); L.caja('marco', vt.a, vt.t - pf, zc, w, pf, fd);
      if (w > 0.8) L.caja('marco', vt.a + w / 2 - pf * 0.6, vt.s, zc + 0.005, pf * 1.2, h, fd);
      L.caja('vidrio', vt.a + pf, vt.s + pf, zc + 0.03, w - 2 * pf, h - 2 * pf, 0.006, { sinSombra: true });
      L.caja('alfeizar', vt.a - 0.02, vt.s - 0.02, -GROSOR + 0.12, w + 0.04, 0.02, GROSOR - 0.1);
      // exterior (lejos, para que haya paralaje)
      const ex = new THREE.PlaneGeometry(16, 9); ex.translate(vt.a + w / 2, vt.s + 1.0, -7);
      L.add(ex, 'exterior', { uvPropias: true, sinSombra: true });
      const centro = new THREE.Vector3(vt.a + w / 2, (vt.s + vt.t) / 2, 0).applyMatrix4(R);
      ventanaInfo = { centro, n: new THREE.Vector3(p.n[0], 0, p.n[1]), dir: new THREE.Vector3(...[(p.b[0] - p.a[0]) / p.largo, 0, (p.b[1] - p.a[1]) / p.largo]), ancho: w, alto: h };
    } else {
      L.caja('pared', x0, 0, -GROSOR, x1 - x0, H, GROSOR);
    }
    const g = fusionar(L, mats);
    g.name = 'pared' + id;
    // las paredes reales no proyectan: lo hacen sus copias de sombra invisibles, que siguen ahí aunque se recorte la pared
    g.children.forEach(o => { o.castShadow = false; if (o.name !== 'exterior' && o.name !== 'vidrio') sombras.add(copiaSombra(o)); });
    g.userData = { punto: new THREE.Vector3(p.a[0], 0, p.a[1]), n: new THREE.Vector3(p.n[0], 0, p.n[1]) };
    grupo.add(g); muros.push(g);
  }

  // suelo y techo
  const Ls = new Lote();
  Ls.caja('suelo', -GROSOR, -0.02, -GROSOR, W + 2 * GROSOR, 0.02, D + 2 * GROSOR);
  const suelo = fusionar(Ls, mats, { sombras: false }); suelo.name = 'suelo'; grupo.add(suelo);
  const Lt = new Lote();
  Lt.caja('techo', -GROSOR, H, -GROSOR, W + 2 * GROSOR, 0.02, D + 2 * GROSOR);
  const puntos = [];
  const nx = W > 3 ? 2 : 1, nz = D > 3 ? 2 : 1;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = W * (i + 0.5) / nx, z = Math.max(0.9, D * (k + 0.5) / nz);
    Lt.cilindro('downlight', x, H - 0.001, z, 0.045, 0.002, 'y', 24, { sinSombra: true });
    puntos.push(new THREE.Vector3(x, H - 0.08, z));
  }
  const techo = fusionar(Lt, mats, { sombras: false }); techo.name = 'techo'; grupo.add(techo);
  techo.children.forEach(o => { if (o.name === 'techo') sombras.add(copiaSombra(o)); });
  grupo.add(sombras);
  const exteriores = [];
  grupo.traverse(o => { if (o.isMesh && o.name === 'exterior') exteriores.push(o); });

  return { grupo, muros, suelo, techo, exteriores, ventana: ventanaInfo, focos: puntos, W, D, H };
}

// invisible en color y profundidad, pero sí entra en el mapa de sombras
const matSombra = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
function copiaSombra(o) {
  const m = new THREE.Mesh(o.geometry, matSombra);
  m.castShadow = true; m.receiveShadow = false; m.userData.sombraProxy = true;
  return m;
}

// Luces de la escena; se actualizan con la hora sin reconstruir nada.
export class Luces {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight('#e8eef5', '#8f8578', 0.35); scene.add(this.hemi);
    this.sol = new THREE.DirectionalLight('#fff3e2', 3);
    this.sol.castShadow = true;
    this.sol.shadow.mapSize.set(2048, 2048);
    this.sol.shadow.bias = -0.0003; this.sol.shadow.normalBias = 0.02; this.sol.shadow.radius = 3;
    this.sol.shadow.camera.layers.enable(5);
    scene.add(this.sol); scene.add(this.sol.target);
    this.cielo = new THREE.RectAreaLight('#dce8ff', 0, 1, 1); scene.add(this.cielo);
    this.relleno = new THREE.DirectionalLight('#ffffff', 0); scene.add(this.relleno); scene.add(this.relleno.target);
    this.focos = []; this.ledes = [];
  }

  montar(sala, ledes, padre) {
    for (const l of [...this.focos, ...this.ledes]) l.parent?.remove(l);
    this.focos = sala.focos.map(p => { const l = new THREE.PointLight('#ffe9cf', 0, 7, 2); l.position.copy(p); padre.add(l); return l; });
    this.ledes = ledes.map(d => {
      const largo = d.x1 - d.x0;
      const r = new THREE.RectAreaLight('#ffe7c4', 0, largo, 0.05);
      const p = new THREE.Vector3((d.x0 + d.x1) / 2, d.y, d.z).applyMatrix4(d.R);
      r.position.copy(p);
      r.up.set(d.n[0], 0, d.n[1]);
      r.lookAt(p.x, p.y - 1, p.z);
      padre.add(r); return r;
    });
    this.sala = sala;
  }

  // hora 0-24 → sol, cielo, focos
  aplicar(e, mundo, matsExterior, ar = false) {
    const s = this.sala; if (!s) return;
    const h = e.luz.hora;
    const d = Math.max(0, Math.sin(Math.PI * (h - 7) / 14));
    const dia = Math.pow(d, 0.6);
    const el = THREE.MathUtils.degToRad(8 + 50 * d), az = THREE.MathUtils.degToRad(((h - 14) / 7) * 60);
    const cx = s.W / 2, cz = s.D / 2;
    const vi = s.ventana;
    // dirección del sol: entra por la ventana si la hay
    const n = vi ? vi.n.clone() : new THREE.Vector3(0, 0, 1);
    const t = vi ? vi.dir.clone() : new THREE.Vector3(1, 0, 0);
    const haciaSol = n.clone().multiplyScalar(-Math.cos(el) * Math.cos(az)).add(t.multiplyScalar(Math.cos(el) * Math.sin(az))).add(new THREE.Vector3(0, Math.sin(el), 0)).normalize();
    const objetivo = new THREE.Vector3(cx, 0.8, cz);
    if (vi) objetivo.copy(vi.centro).addScaledVector(vi.n, 1.6).setY(0.6);
    this.sol.target.position.copy(objetivo);
    this.sol.position.copy(objetivo).addScaledVector(haciaSol, 10);
    const tibio = new THREE.Color('#ffb46b'), blanco = new THREE.Color('#fff4e6');
    this.sol.color.copy(tibio).lerp(blanco, Math.min(1, d * 1.4));
    this.sol.intensity = d > 0.02 ? 4.2 * dia : 0;
    const R = Math.max(s.W, s.D) * 0.9 + 1;
    const cam = this.sol.shadow.camera; cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = 25; cam.updateProjectionMatrix();
    if (mundo) { this.sol.target.updateMatrixWorld(); }
    // luz de cielo que entra por la ventana
    if (vi) {
      this.cielo.width = vi.ancho; this.cielo.height = vi.alto;
      this.cielo.position.copy(vi.centro).addScaledVector(vi.n, 0.02);
      this.cielo.lookAt(vi.centro.clone().add(vi.n));
      this.cielo.intensity = 7 * dia;
    } else this.cielo.intensity = 0;
    this.relleno.position.set(cx, 3, cz + 4); this.relleno.target.position.set(cx, 0.5, cz);
    this.relleno.intensity = vi ? 0.15 * dia : 0.9 * dia;
    this.hemi.intensity = 0.12 + 0.35 * dia;
    const noche = d < 0.05;
    const techo = e.luz.techo || (noche && !ar);
    for (const f of this.focos) f.intensity = techo ? 9 : 0;
    for (const l of this.ledes) l.intensity = e.luz.led && !this.ligero ? 14 : 0;
    if (matsExterior) {
      const k = 0.08 + 1.0 * dia;
      matsExterior.color.setRGB(k * (noche ? 0.5 : 1), k * (noche ? 0.6 : 1), k * (noche ? 1.2 : 1));
    }
    return { d, techo };
  }
}
