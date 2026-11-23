// Escena, render, navegación y selección. Une modelo (vivienda + cocina) → 3D → interfaz → XR.
//
// Marco de referencia: el «mundo» usa las coordenadas de la COCINA ACTIVA (pared A en z = 0, como antes), así que
// la cocina, sus picks, app.dims y la RV/RM siguen igual. La casa entera se coloca con la inversa de ese marco.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { estadoInicial, autodistribuir, fondoSala, SUELOS } from './modelo.js';
import { materiales } from './materiales.js';
import { construirCocina } from './cocina.js';
import { Luces } from './sala.js';
import { fusionar, liberar, matrizTramo } from './geo.js';
import {
  CLAVE_CASA, leerGuardado, cargarCasa, cocinaActiva, desdeCocina, sincronizarCocinas, marcoEstancia, estanciaPorId,
  puntoEnPoligono, puntoInterior, PLANTILLAS, esFuera, calcularTabiques, huecosDeBorde, bordesDe, esPuerta,
} from './casa/modelo-casa.js';
import { construirCasa, materialesCasa, ocultarTabiques } from './casa/construir-casa.js';
import { montarPlano } from './casa/plano.js';
import { montarUI, aviso as avisar } from './ui.js';
import { montarXR } from './xr.js';

RectAreaLightUniformsLib.init();

const lienzo = document.getElementById('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const fondo = new THREE.Color('#d9d6d0');
scene.background = fondo;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 80);
const mundo = new THREE.Group(); mundo.name = 'mundo'; scene.add(mundo);
const luces = new Luces(mundo);

const orbit = new OrbitControls(camera, lienzo);
orbit.enableDamping = true; orbit.dampingFactor = 0.08; orbit.minDistance = 0.4; orbit.maxDistance = 40;
const paseo = new PointerLockControls(camera, document.body);

// Post: oclusión ambiental (solo fuera de XR)
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
composer.addPass(gtao);
// las copias de sombra (invisibles) no deben entrar en las normales de la oclusión
const ocultarBase = gtao.overrideVisibility.bind(gtao);
gtao.overrideVisibility = () => { ocultarBase(); scene.traverse(o => { if (o.userData.sombraProxy) o.visible = false; }); };
composer.addPass(new OutputPass());
const movil = matchMedia('(pointer: coarse)').matches;
let calidad = !movil;

// ---------- estado ----------
let casa = leerGuardado(localStorage);
const estanciaCocina = () => cocinaActiva(casa);
let seleccion = null;                       // módulo de la cocina activa { tramo, idx }
let casaSel = { estancia: estanciaCocina()?.id ?? null, borde: null, hueco: null };
const pasado = [], futuro = [];

function instantanea() { pasado.push(JSON.stringify(casa)); if (pasado.length > 80) pasado.shift(); futuro.length = 0; }
function tras(rec = true) { guardar(); if (rec) reconstruir(); else aplicarLuz(); ui.refrescar(); xr.refrescar(); plano.refrescar(); }
function restaurar(txt) {
  casa = cargarCasa(JSON.parse(txt)); seleccion = null;
  if (!estanciaPorId(casa, casaSel.estancia)) casaSel = { estancia: estanciaCocina()?.id ?? null, borde: null, hueco: null };
  tras();
}

const app = {
  // estado de la cocina activa (mismo formato que la v1: lo usan ui.js, xr.js y cocina.js)
  get estado() { return estanciaCocina()?.cocina; },
  get casa() { return casa; },
  get seleccion() { return seleccion; },
  get casaSel() { return casaSel; },
  // cambio sobre la cocina activa: después la casa se ajusta a ella (tabiques, ventana, alto, suelo, pintura)
  cambiar(fn, { reconstruir: rec = true } = {}) {
    instantanea();
    const r = fn(app.estado);
    if (r !== undefined) seleccion = r;
    if (rec) { const e = estanciaCocina(); if (e) desdeCocina(casa, e); sincronizarCocinas(casa); }
    tras(rec);
  },
  // cambio sobre la vivienda: después las cocinas se ajustan a sus estancias
  cambiarCasa(fn, { instantanea: inst = true, reconstruir: rec = true } = {}) {
    if (inst) instantanea();
    const r = fn(casa);
    if (r && typeof r === 'object' && 'estancia' in r) casaSel = { borde: null, hueco: null, ...r };
    sincronizarCocinas(casa);
    if (seleccion && !app.estado?.tramos[seleccion.tramo]?.[seleccion.idx]) seleccion = null;
    tras(rec);
  },
  instantanea,
  deshacer() { if (!pasado.length) return; futuro.push(JSON.stringify(casa)); restaurar(pasado.pop()); },
  rehacer() { if (!futuro.length) return; pasado.push(JSON.stringify(casa)); restaurar(futuro.pop()); },
  seleccionar(sel) { seleccion = sel; marcarSeleccion(); ui.refrescar(); xr.refrescar(); },
  seleccionarCasa(sel) {
    casaSel = { estancia: null, borde: null, hueco: null, ...sel };
    marcarEstancia(); ui.refrescar(); plano.refrescar();
  },
  // la estancia cocina con la que trabajan las pestañas Espacio/Estilo/Electro/Luz
  activarCocina(id) {
    const e = estanciaPorId(casa, id); if (!e?.cocina || casa.cocinaActiva === id) return;
    app.cambiarCasa(c => { c.cocinaActiva = id; }); seleccion = null; ponerVista('dentro');
  },
  plantilla(id) {
    instantanea();
    casa = PLANTILLAS[id].crear(); seleccion = null;
    casaSel = { estancia: estanciaCocina()?.id ?? null, borde: null, hueco: null };
    tras(); ponerVista('general');
  },
  vista(nombre) { ponerVista(nombre); },
  entrar(id) { entrarEstancia(id); },
  setCalidad(v) { calidad = v; },
  get calidad() { return calidad; },
  exportar() { return JSON.stringify(casa, null, 2); },
  importar(txt) {
    const c = cargarCasa(JSON.parse(txt)); if (!c) throw new Error('archivo no válido');
    instantanea(); casa = c; seleccion = null; casaSel = { estancia: estanciaCocina()?.id ?? null, borde: null, hueco: null }; tras(); ponerVista('general');
  },
  // cocina nueva en la misma estancia (las medidas y la ventana las pone la casa)
  nuevo() { app.cambiar(st => { const n = estadoInicial(); for (const k of Object.keys(n)) if (k !== 'sala' && k !== 'ventana') st[k] = n[k]; autodistribuir(st); return null; }); },
  capturar() { renderFrame(); return lienzo.toDataURL('image/jpeg', 0.92); },
  renderer, scene, camera, mundo,
  get picks() { return picksGrupo.children; },
  get salaGrupo() { return casaR?.grupo; },
  get cocinaGrupo() { return cocinaGrupo; },
  get dims() { const e = app.estado; return { W: e.sala.A / 100, D: fondoSala(e), H: e.sala.alto / 100 }; },
  get cajaCasa() { return cajaMundo; },
  // mallas que se dibujan (sin contar picks invisibles ni la marca de selección)
  mallas() {
    const r = { total: 0, casa: 0, cocina: 0, sombras: 0, instancias: 0 };
    casaR?.grupo.traverse(o => { if (o.isMesh) { r.total++; r.casa++; if (o.userData.sombraProxy) r.sombras++; if (o.isInstancedMesh) r.instancias += o.count; } });
    cocinaGrupo?.traverse(o => { if (o.isMesh) { r.total++; r.cocina++; } });
    return r;
  },
  modoXR: null,
};
function guardar() { try { localStorage.setItem(CLAVE_CASA, JSON.stringify(casa)); } catch { /* sin almacenamiento */ } }

// ---------- construcción ----------
let casaR = null, cocinaGrupo = null, mats = null, cajaMundo = null, matrizCasa = new THREE.Matrix4();
const picksGrupo = new THREE.Group(); picksGrupo.name = 'picks'; mundo.add(picksGrupo);
const marcaSel = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ff6a2b', depthTest: false, transparent: true }));
marcaSel.renderOrder = 10; mundo.add(marcaSel);
const marcaEst = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ff6a2b', transparent: true, opacity: 0.9 }));
marcaEst.renderOrder = 9; mundo.add(marcaEst);
let ocultosClave = '';

function reconstruir() {
  const ec = estanciaCocina();
  const k = ec.cocina;
  mats = materiales(k.estilo);
  const suelos = Object.fromEntries(Object.keys(SUELOS).map(s => [s, materiales({ ...k.estilo, suelo: s }).suelo]));
  const mc = materialesCasa(mats, suelos);
  if (casaR) { mundo.remove(casaR.grupo); liberarCasa(casaR.grupo); }
  if (cocinaGrupo) { mundo.remove(cocinaGrupo); liberar(cocinaGrupo); }
  for (const p of [...picksGrupo.children]) { picksGrupo.remove(p); p.geometry.dispose(); }

  casaR = construirCasa(casa, mc, { cocinaId: ec.id });
  const m = marcoEstancia(ec);
  matrizCasa = matrizTramo([m.origen[0] / 100, m.origen[1] / 100], m.dir).invert();
  casaR.grupo.applyMatrix4(matrizCasa);
  mundo.add(casaR.grupo);
  casaR.grupo.updateMatrixWorld(true);
  ocultosClave = '';

  const { lote, picks, ledes } = construirCocina(k);
  cocinaGrupo = fusionar(lote, mats); cocinaGrupo.name = 'cocina';
  mundo.add(cocinaGrupo);
  const matPick = new THREE.MeshBasicMaterial();
  for (const p of picks) {
    const g = new THREE.BoxGeometry(p.x1 - p.x0, p.y1, p.z1); g.translate((p.x0 + p.x1) / 2, p.y1 / 2, p.z1 / 2); g.applyMatrix4(p.R);
    const mm = new THREE.Mesh(g, matPick); mm.visible = false; mm.userData = { tramo: p.tramo, idx: p.idx };
    picksGrupo.add(mm);
  }

  // caja de la casa en coords del mundo
  const c = casaR.caja, bb = new THREE.Box3();
  for (const [x, z] of [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]]) bb.expandByPoint(new THREE.Vector3(x, 0, z).applyMatrix4(matrizCasa));
  cajaMundo = { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, alto: c.alto, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2 };
  cajaMundo.R = Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;

  // ventana principal (sol y luz de cielo): la exterior de la cocina, o la más grande
  const ext = casaR.ventanas.filter(v => v.exterior);
  const vp = ext.filter(v => v.estancias.includes(ec.id)).sort((a, b) => b.ancho * b.alto - a.ancho * a.alto)[0]
    || ext.sort((a, b) => b.ancho * b.alto - a.ancho * a.alto)[0] || null;
  const ventana = vp && { ...vp, centro: vp.centro.clone().applyMatrix4(matrizCasa), n: vp.n.clone().transformDirection(matrizCasa), dir: vp.dir.clone().transformDirection(matrizCasa) };
  luces.montar({ focos: casaR.focos.map(f => f.p.clone().applyMatrix4(matrizCasa)), ventana, cx: cajaMundo.cx, cz: cajaMundo.cz, R: cajaMundo.R }, ledes, mundo);

  if (seleccion && !k.tramos[seleccion.tramo]?.[seleccion.idx]) seleccion = null;
  marcarSeleccion(); marcarEstancia();
  aplicarLuz();
  luces.actualizarFocos(mundo.worldToLocal(camera.position.clone()));
  xr?.alReconstruir?.();
  const n = app.mallas();
  const el = document.getElementById('mallas'); if (el) el.textContent = `${n.total} mallas`;
}
// las geometrías compartidas (caja de instancias) no se liberan; el resto sí
function liberarCasa(g) { g.traverse(o => { if (o.geometry && !o.isInstancedMesh && !o.userData.sombraProxy) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); }

function aplicarLuz() {
  const r = luces.aplicar(app.estado, mundo, mats.exterior, app.modoXR === 'ar');
  scene.environmentIntensity = 0.18 + 0.32 * (r?.d ?? 1);
}
app.aplicarLuz = aplicarLuz;

function marcarSeleccion() {
  marcaSel.geometry.dispose();
  const p = seleccion && picksGrupo.children.find(m => m.userData.tramo === seleccion.tramo && m.userData.idx === seleccion.idx);
  if (!p) { marcaSel.geometry = new THREE.BufferGeometry(); marcaSel.visible = false; return; }
  marcaSel.geometry = new THREE.EdgesGeometry(p.geometry); marcaSel.visible = true;
}
function marcarEstancia() {
  marcaEst.geometry.dispose();
  const e = estanciaPorId(casa, casaSel.estancia);
  if (!e || casa.estancias.length < 2) { marcaEst.geometry = new THREE.BufferGeometry(); marcaEst.visible = false; return; }
  marcaEst.geometry = new THREE.BufferGeometry().setFromPoints(e.poligono.map(p => new THREE.Vector3(p[0] / 100, 0.012, p[1] / 100).applyMatrix4(matrizCasa)));
  marcaEst.visible = true;
}

// coords de planta (cm) ↔ mundo (m)
const aMundo = (p, y = 0) => new THREE.Vector3(p[0] / 100, y, p[1] / 100).applyMatrix4(matrizCasa);
const aPlanta = v => { const q = v.clone().applyMatrix4(matrizCasa.clone().invert()); return [q.x * 100, q.z * 100, q.y]; };
function estanciaEn(v) {
  const [x, y] = aPlanta(v);
  return casa.estancias.find(e => puntoEnPoligono([x, y], e.poligono)) || null;
}

// ---------- vistas ----------
function ponerVista(nombre) {
  if (nombre === 'plano') { plano.abrir(); return; }
  plano.cerrar();
  const { W, D, H } = app.dims;
  const c = cajaMundo, sola = casa.estancias.length === 1;
  salirPaseo();
  orbit.enabled = true;
  if (nombre === 'general') {
    if (sola) { camera.position.set(W * 0.5 + W * 0.35, H + 1.6, D + 2.6); orbit.target.set(W * 0.45, 1.0, D * 0.35); }
    else {
      const w = c.x1 - c.x0, d = c.z1 - c.z0, s = Math.max(w, d);
      camera.position.set(c.cx + w * 0.3, c.alto + s * 0.62, c.z1 + s * 0.5); orbit.target.set(c.cx, 0.4, c.cz + d * 0.05);
    }
  }
  if (nombre === 'dentro') { camera.position.set(W * 0.62, 1.62, D - 0.25); orbit.target.set(W * 0.4, 1.15, 0.3); }
  if (nombre === 'planta') {
    if (sola) { camera.position.set(W / 2, H + 5.5, D / 2 + 0.01); orbit.target.set(W / 2, 0, D / 2); }
    else { const s = Math.max(c.x1 - c.x0, (c.z1 - c.z0) * camera.aspect * 0.8); camera.position.set(c.cx, c.alto + s * 0.8 + 1, c.cz + 0.01); orbit.target.set(c.cx, 0, c.cz); }
  }
  if (nombre === 'detalle') { camera.position.set(W * 0.5, 1.45, 1.45); orbit.target.set(W * 0.45, 0.95, 0.2); }
  if (nombre === 'paseo') { entrarPaseo(); return; }
  orbit.update();
}

// Cámara en la puerta de la estancia (si tiene) mirando hacia dentro
function entrarEstancia(id) {
  const e = estanciaPorId(casa, id); if (!e) return;
  if (e.cocina && e.id === estanciaCocina()?.id) { ponerVista('dentro'); app.seleccionarCasa({ estancia: id }); return; }
  plano.cerrar(); salirPaseo(); orbit.enabled = true;
  const pi = puntoInterior(e.poligono);
  const tabs = calcularTabiques(casa);
  let cam = null;
  for (const b of bordesDe(e.poligono)) {
    const p = huecosDeBorde(tabs, e.id, b.i).find(q => esPuerta(q.h)); if (!p) continue;
    const s = p.pos + p.h.ancho / 2;
    const en = d => [b.a[0] + b.dir[0] * s + b.n[0] * d, b.a[1] + b.dir[1] * s + b.n[1] * d];
    const d = [110, 70, 45].find(d => puntoEnPoligono(en(d + 25), e.poligono)) ?? 45;
    cam = en(d); break;
  }
  if (!cam) {
    const lejos = e.poligono.reduce((m, p) => (Math.hypot(p[0] - pi[0], p[1] - pi[1]) > Math.hypot(m[0] - pi[0], m[1] - pi[1]) ? p : m), e.poligono[0]);
    cam = [pi[0] + (lejos[0] - pi[0]) * 0.7, pi[1] + (lejos[1] - pi[1]) * 0.7];
    if (!puntoEnPoligono(cam, e.poligono)) cam = pi;
  }
  let obj = [pi[0] + (pi[0] - cam[0]) * 0.6, pi[1] + (pi[1] - cam[1]) * 0.6];
  if (!puntoEnPoligono(obj, e.poligono)) obj = pi;
  if (Math.hypot(obj[0] - cam[0], obj[1] - cam[1]) < 40) obj = [cam[0] + 60, cam[1]];
  camera.position.copy(aMundo(cam, 1.62)); orbit.target.copy(aMundo(obj, 1.15));
  orbit.update();
  app.seleccionarCasa({ estancia: id });
}

// paseo en primera persona (escritorio)
const teclas = new Set();
let enPaseo = false;
function entrarPaseo() {
  const { W, D } = app.dims;
  orbit.enabled = false; enPaseo = true;
  camera.position.set(W * 0.55, 1.65, Math.max(1.2, D - 0.5));
  camera.lookAt(W * 0.45, 1.3, 0);
  paseo.lock();
}
function salirPaseo() { if (enPaseo) { enPaseo = false; paseo.unlock(); } }
paseo.addEventListener('unlock', () => { if (enPaseo) { enPaseo = false; orbit.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.5)); orbit.enabled = true; ui.refrescar(); } });
addEventListener('keydown', e => {
  if (e.target.closest?.('input,select,textarea')) return;
  teclas.add(e.code);
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? app.rehacer() : app.deshacer(); }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); app.rehacer(); }
  if (plano.abierto) return;
  if (e.code === 'Escape' && seleccion) app.seleccionar(null);
  if ((e.code === 'Delete' || e.code === 'Backspace') && seleccion) ui.accion('borrar');
});
addEventListener('keyup', e => teclas.delete(e.code));

function moverPaseo(dt) {
  if (!enPaseo) return;
  const v = 1.6 * dt;
  const f = (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0) - (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0);
  const r = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0) - (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0);
  paseo.moveForward(f * v); paseo.moveRight(r * v);
  const c = cajaMundo;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, c.x0 + 0.25, c.x1 - 0.25);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, c.z0 + 0.25, c.z1 - 0.25);
  camera.position.y = 1.65;
}

// ---------- recorte de tabiques (casa de muñecas) ----------
// Se oculta un tabique si deja a un lado la cámara y al otro el punto que se mira, y está más cerca que ese punto
// (o la línea de visión lo cruza). Desde dentro de una estancia no se oculta nada; desde arriba, tampoco.
const _c = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
function recortar() {
  if (!casaR) return;
  if (app.modoXR) { if (ocultosClave) { ocultarTabiques(casaR.instancias, new Set()); ocultosClave = ''; } return; }
  casaR.grupo.worldToLocal(_c.copy(camera.position));
  if (enPaseo) _t.copy(camera.position).add(camera.getWorldDirection(_d)); else _t.copy(orbit.target);
  casaR.grupo.worldToLocal(_t);
  const vx = _t.x - _c.x, vz = _t.z - _c.z, dist2 = vx * vx + vz * vz || 1e-6;
  const desdeArriba = _c.y > casaR.caja.alto + 0.3 && camera.getWorldDirection(_d).y < -0.8;
  const ocultos = new Set();
  if (!desdeArriba) {
    for (const t of casaR.tabiques) {
      const sc = (_c.x - t.a[0]) * t.n[0] + (_c.z - t.a[1]) * t.n[1];
      const st = (_t.x - t.a[0]) * t.n[0] + (_t.z - t.a[1]) * t.n[1];
      if (sc * st >= 0 || Math.abs(sc) < 0.06) continue;
      const mx = (t.a[0] + t.b[0]) / 2 - _c.x, mz = (t.a[1] + t.b[1]) / 2 - _c.z;
      const delante = (mx * vx + mz * vz) < dist2;
      const l = sc / (sc - st), px = _c.x + vx * l - t.a[0], pz = _c.z + vz * l - t.a[1];
      const lx = t.b[0] - t.a[0], lz = t.b[1] - t.a[1], L = Math.hypot(lx, lz) || 1e-6;
      const s = (px * lx + pz * lz) / L;
      if (delante || (s > -0.6 && s < L + 0.6)) ocultos.add(t.idx);
    }
  }
  const clave = [...ocultos].join(',');
  if (clave !== ocultosClave) { ocultarTabiques(casaR.instancias, ocultos); ocultosClave = clave; }
  // techo y exterior solo desde dentro de la vivienda
  const est = casa.estancias.find(e => !esFuera(e) && puntoEnPoligono([_c.x * 100, _c.z * 100], e.poligono));
  const dentro = !!est && _c.y < est.alto / 100;
  const verTecho = dentro || _c.y < 2.0;
  for (const m of casaR.deTecho) m.visible = verTecho;
  for (const ex of casaR.exteriores) ex.visible = dentro;
}

// ---------- selección con clic ----------
const ray = new THREE.Raycaster();
let abajo = null;
lienzo.addEventListener('pointerdown', e => { abajo = { x: e.clientX, y: e.clientY }; });
lienzo.addEventListener('pointerup', e => {
  if (!abajo || enPaseo) return;
  const mov = Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y); abajo = null;
  if (mov > 6) return;
  const nd = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(nd, camera);
  const hit = ray.intersectObjects(picksGrupo.children, false)[0];
  if (hit) { app.seleccionar({ tramo: hit.object.userData.tramo, idx: hit.object.userData.idx }); return; }
  // si no es un mueble, ¿qué estancia es?
  const s = casaR && ray.intersectObjects(casaR.suelos, false)[0];
  const est = s && estanciaEn(s.point);
  if (est) casaSel = { estancia: est.id, borde: null, hueco: null };
  app.seleccionar(null);
  marcarEstancia();
});

// ---------- bucle ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); gtao.setSize(innerWidth, innerHeight);
});

const reloj = new THREE.Clock();
let fpsT = 0, fpsN = 0, lentos = 0, autoBajada = false, focosT = 0;
function renderFrame() {
  if (renderer.xr.isPresenting || !calidad) renderer.render(scene, camera);
  else composer.render();
}
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(0.05, reloj.getDelta());
  if (frame) xr.porFrame(frame, dt);
  else { moverPaseo(dt); if (orbit.enabled) orbit.update(); recortar(); }
  focosT += dt;
  if (focosT > 0.3) { focosT = 0; luces.actualizarFocos(mundo.worldToLocal(camera.getWorldPosition(new THREE.Vector3()))); }
  // con el plano abierto la escena queda tapada: no se dibuja
  if (plano.abierto && !frame) return;
  renderFrame();
  fpsN++; fpsT += dt;
  if (fpsT > 1) {
    const fps = Math.round(fpsN / fpsT);
    const el = document.getElementById('fps'); if (el) el.textContent = `${fps} fps`;
    // calidad automática: si el equipo no llega, se apaga la oclusión una vez
    if (calidad && !renderer.xr.isPresenting && !document.hidden && fps < 30) { lentos++; if (lentos >= 3 && !autoBajada) { calidad = false; autoBajada = true; ui.refrescar(); avisar('Calidad normal: este equipo no llega a 30 fps con sombras de contacto'); } } else lentos = 0;
    fpsN = 0; fpsT = 0;
  }
});

// ---------- arranque ----------
const ui = montarUI(app);
const plano = montarPlano(app);
const xr = montarXR(app, { renderer, scene, camera, mundo, luces, fondo, orbit, gtao });
guardar();
reconstruir();
ponerVista('general');
ui.refrescar();
window.__app = app;
