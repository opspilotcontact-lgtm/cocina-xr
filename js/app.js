// Escena, render, navegación y selección. Une modelo → 3D → interfaz → XR.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { estadoInicial, clonar, fondoSala, M } from './modelo.js';
import { materiales } from './materiales.js';
import { construirCocina } from './cocina.js';
import { construirSala, Luces } from './sala.js';
import { fusionar, liberar } from './geo.js';
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

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 60);
const mundo = new THREE.Group(); mundo.name = 'mundo'; scene.add(mundo);
const luces = new Luces(mundo);

const orbit = new OrbitControls(camera, lienzo);
orbit.enableDamping = true; orbit.dampingFactor = 0.08; orbit.minDistance = 0.4; orbit.maxDistance = 16;
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
const CLAVE = 'cocina-xr-estado-v1';
let estado;
try { estado = JSON.parse(localStorage.getItem(CLAVE)); } catch { estado = null; }
if (!estado || estado.version !== 1) estado = estadoInicial();
let seleccion = null;
const pasado = [], futuro = [];

const app = {
  get estado() { return estado; },
  get seleccion() { return seleccion; },
  cambiar(fn, { reconstruir: rec = true } = {}) {
    pasado.push(JSON.stringify(estado)); if (pasado.length > 80) pasado.shift(); futuro.length = 0;
    const r = fn(estado);
    if (r !== undefined) seleccion = r;
    guardar(); if (rec) reconstruir(); else aplicarLuz();
    ui.refrescar(); xr.refrescar();
  },
  deshacer() { if (!pasado.length) return; futuro.push(JSON.stringify(estado)); estado = JSON.parse(pasado.pop()); seleccion = null; guardar(); reconstruir(); ui.refrescar(); xr.refrescar(); },
  rehacer() { if (!futuro.length) return; pasado.push(JSON.stringify(estado)); estado = JSON.parse(futuro.pop()); seleccion = null; guardar(); reconstruir(); ui.refrescar(); xr.refrescar(); },
  seleccionar(sel) { seleccion = sel; marcarSeleccion(); ui.refrescar(); xr.refrescar(); },
  vista(nombre) { ponerVista(nombre); },
  setCalidad(v) { calidad = v; },
  get calidad() { return calidad; },
  exportar() { return JSON.stringify(estado, null, 2); },
  importar(txt) { const e = JSON.parse(txt); pasado.push(JSON.stringify(estado)); estado = e; seleccion = null; guardar(); reconstruir(); ui.refrescar(); },
  nuevo() { app.cambiar(() => { Object.assign(estado, estadoInicial()); return null; }); },
  capturar() { renderFrame(); return lienzo.toDataURL('image/jpeg', 0.92); },
  renderer, scene, camera, mundo,
  get picks() { return picksGrupo.children; },
  get salaGrupo() { return sala?.grupo; },
  get cocinaGrupo() { return cocinaGrupo; },
  get dims() { return { W: estado.sala.A / 100, D: fondoSala(estado), H: estado.sala.alto / 100 }; },
  modoXR: null,
};
function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* sin almacenamiento */ } }

// ---------- construcción ----------
let sala = null, cocinaGrupo = null, mats = null;
const picksGrupo = new THREE.Group(); picksGrupo.name = 'picks'; mundo.add(picksGrupo);
const marcaSel = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ff6a2b', depthTest: false, transparent: true }));
marcaSel.renderOrder = 10; mundo.add(marcaSel);

function reconstruir() {
  mats = materiales(estado.estilo);
  if (sala) { mundo.remove(sala.grupo); liberar(sala.grupo); }
  if (cocinaGrupo) { mundo.remove(cocinaGrupo); liberar(cocinaGrupo); }
  for (const p of [...picksGrupo.children]) { picksGrupo.remove(p); p.geometry.dispose(); }
  sala = construirSala(estado, mats);
  mundo.add(sala.grupo);
  const { lote, picks, ledes } = construirCocina(estado);
  cocinaGrupo = fusionar(lote, mats); cocinaGrupo.name = 'cocina';
  mundo.add(cocinaGrupo);
  const matPick = new THREE.MeshBasicMaterial();
  for (const p of picks) {
    const g = new THREE.BoxGeometry(p.x1 - p.x0, p.y1, p.z1); g.translate((p.x0 + p.x1) / 2, p.y1 / 2, p.z1 / 2); g.applyMatrix4(p.R);
    const m = new THREE.Mesh(g, matPick); m.visible = false; m.userData = { tramo: p.tramo, idx: p.idx };
    picksGrupo.add(m);
  }
  luces.montar(sala, ledes, mundo);
  if (seleccion && !estado.tramos[seleccion.tramo]?.[seleccion.idx]) seleccion = null;
  marcarSeleccion();
  aplicarLuz();
  xr?.alReconstruir?.();
  document.getElementById('estadoDraw')?.replaceChildren(document.createTextNode(`${cocinaGrupo.children.length + sala.grupo.children.length} mallas`));
}

function aplicarLuz() {
  const r = luces.aplicar(estado, mundo, mats.exterior, app.modoXR === 'ar');
  scene.environmentIntensity = 0.18 + 0.32 * (r?.d ?? 1);
}
app.aplicarLuz = aplicarLuz;

function marcarSeleccion() {
  marcaSel.geometry.dispose();
  const p = seleccion && picksGrupo.children.find(m => m.userData.tramo === seleccion.tramo && m.userData.idx === seleccion.idx);
  if (!p) { marcaSel.geometry = new THREE.BufferGeometry(); marcaSel.visible = false; return; }
  marcaSel.geometry = new THREE.EdgesGeometry(p.geometry); marcaSel.visible = true;
}

// ---------- vistas ----------
function ponerVista(nombre) {
  const { W, D, H } = app.dims;
  salirPaseo();
  orbit.enabled = true;
  if (nombre === 'general') { camera.position.set(W * 0.5 + W * 0.35, H + 1.6, D + 2.6); orbit.target.set(W * 0.45, 1.0, D * 0.35); }
  if (nombre === 'dentro') { camera.position.set(W * 0.62, 1.62, D - 0.25); orbit.target.set(W * 0.4, 1.15, 0.3); }
  if (nombre === 'planta') { camera.position.set(W / 2, H + 5.5, D / 2 + 0.01); orbit.target.set(W / 2, 0, D / 2); }
  if (nombre === 'detalle') { camera.position.set(W * 0.5, 1.45, 1.45); orbit.target.set(W * 0.45, 0.95, 0.2); }
  if (nombre === 'paseo') { entrarPaseo(); return; }
  orbit.update();
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
  const { W, D } = app.dims;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, 0.25, W - 0.25);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, M.fondoB + 0.15, D - 0.2);
  camera.position.y = 1.65;
}

// ---------- recorte de paredes (casa de muñecas) ----------
const tmp = new THREE.Vector3();
function recortar() {
  if (!sala || app.modoXR) return;
  const cam = camera.position;
  for (const m of sala.muros) {
    tmp.copy(cam).sub(m.userData.punto);
    m.visible = tmp.dot(m.userData.n) > -0.05;
  }
  const { W, D, H } = app.dims;
  sala.techo.visible = cam.y < H - 0.02;
  // el exterior de la ventana solo tiene sentido desde dentro de la sala
  const dentro = cam.x > -0.1 && cam.x < W + 0.1 && cam.z > -0.1 && cam.z < D + 0.1 && cam.y < H;
  for (const ex of sala.exteriores) ex.visible = dentro;
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
  app.seleccionar(hit ? { tramo: hit.object.userData.tramo, idx: hit.object.userData.idx } : null);
});

// ---------- bucle ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); gtao.setSize(innerWidth, innerHeight);
});

const reloj = new THREE.Clock();
let fpsT = 0, fpsN = 0, lentos = 0, autoBajada = false;
function renderFrame() {
  if (renderer.xr.isPresenting || !calidad) renderer.render(scene, camera);
  else composer.render();
}
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(0.05, reloj.getDelta());
  if (frame) xr.porFrame(frame, dt);
  else { moverPaseo(dt); if (orbit.enabled) orbit.update(); recortar(); }
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
const xr = montarXR(app, { renderer, scene, camera, mundo, luces, fondo, orbit, gtao });
reconstruir();
ponerVista('general');
ui.refrescar();
window.__app = app;
