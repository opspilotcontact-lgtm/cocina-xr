// Realidad virtual y mixta (Quest): sesiones, mandos, panel en la muñeca, colocar y alinear con paredes reales.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import {
  SERIES, ENCIMERAS, TIRADORES, CAMPANAS, PLACAS, HORNOS, FRIGOS, FRONTALES, SUELOS, PAREDES, ZOCALOS,
  USOS_BAJO, USOS_ALTO, COLUMNAS, ed, moduloEn, ajustarAltos,
} from './modelo.js';
import { aviso } from './ui.js';

const UP = new THREE.Vector3(0, 1, 0);
const ciclo = (obj, actual, d) => { const k = Object.keys(obj); return k[(k.indexOf(actual) + d + k.length) % k.length]; };
const nombre = v => (typeof v === 'string' ? v : v?.nombre) ?? '';

export function montarXR(app, { renderer, scene, camera, mundo, luces, fondo }) {
  const disp = { vr: false, ar: false };
  app.xrDisponible = disp;
  const btnVR = document.getElementById('btnVR'), btnAR = document.getElementById('btnAR');
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(v => { disp.vr = v; btnVR.disabled = !v; }).catch(() => { });
    navigator.xr.isSessionSupported('immersive-ar').then(v => { disp.ar = v; btnAR.disabled = !v; }).catch(() => { });
  }
  btnVR.addEventListener('click', () => entrar('vr'));
  btnAR.addEventListener('click', () => entrar('ar'));

  let modo = null;          // 'vr' | 'ar'
  let accion = null;        // 'colocar' | 'alinear' | null
  let ajustar = false, pielNueva = false;
  let pagina = 'estilo';
  let medida = null;        // { ancho, ventana? } de la última pared real alineada

  // ---------- suelo que recibe sombras (RM) ----------
  const sombraSuelo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32 }));
  sombraSuelo.rotation.x = -Math.PI / 2; sombraSuelo.position.y = 0.002; sombraSuelo.receiveShadow = true; sombraSuelo.visible = false;
  mundo.add(sombraSuelo);
  function ajustarSombra() { const { W, D } = app.dims; sombraSuelo.scale.set(W + 1.5, D + 1.5, 1); sombraSuelo.position.set(W / 2, 0.002, D / 2); }

  // ---------- mandos ----------
  const fabrica = new XRControllerModelFactory();
  const lineaGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const mandos = [0, 1].map(i => {
    const c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i);
    g.add(fabrica.createControllerModel(g));
    const linea = new THREE.Line(lineaGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    linea.scale.z = 3; c.add(linea);
    const punto = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff6a2b', depthTest: false }));
    punto.renderOrder = 20; punto.visible = false; scene.add(punto);
    c.userData = { i, linea, punto, mano: null, fuente: null };
    c.addEventListener('connected', ev => { c.userData.mano = ev.data.handedness; c.userData.fuente = ev.data; g.userData.mano = ev.data.handedness; if (ev.data.handedness === 'left') anclarPanel(g); });
    c.addEventListener('disconnected', () => { c.userData.fuente = null; });
    c.addEventListener('selectstart', () => disparar(c));
    scene.add(c, g);
    return { c, g };
  });

  // ---------- panel ----------
  const PW = 1024, PH = 800;
  const lienzo = document.createElement('canvas'); lienzo.width = PW; lienzo.height = PH;
  const ctx = lienzo.getContext('2d');
  const texPanel = new THREE.CanvasTexture(lienzo); texPanel.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3 * PH / PW), new THREE.MeshBasicMaterial({ map: texPanel, transparent: true, toneMapped: false }));
  panel.visible = false; panel.renderOrder = 15;
  let botones = [], hover = null, sucio = true;
  function anclarPanel(grip) { grip.add(panel); panel.position.set(0, 0.13, -0.04); panel.rotation.set(-0.65, 0, 0); }
  function panelFlotante() { scene.add(panel); const p = new THREE.Vector3(-0.25, -0.15, -0.55).applyMatrix4(camera.matrixWorld); panel.position.copy(p); panel.lookAt(camera.getWorldPosition(new THREE.Vector3())); }

  function filas() {
    const e = app.estado, s = e.estilo;
    const fila = (label, valor, menos, mas) => ({ label, valor, menos, mas });
    const set = fn => app.cambiar(fn);
    if (pagina === 'estilo') return [
      fila('Frentes', `${SERIES[s.serie].nombre} · ${SERIES[s.serie].sub}`, () => set(st => { st.estilo.serie = ciclo(SERIES, st.estilo.serie, -1); }), () => set(st => { st.estilo.serie = ciclo(SERIES, st.estilo.serie, 1); })),
      fila('Altos', s.serieAltos === 'igual' || !s.serieAltos ? 'Igual que bajos' : SERIES[s.serieAltos].nombre, () => set(st => { st.estilo.serieAltos = ciclo({ igual: 1, ...SERIES }, st.estilo.serieAltos || 'igual', -1); }), () => set(st => { st.estilo.serieAltos = ciclo({ igual: 1, ...SERIES }, st.estilo.serieAltos || 'igual', 1); })),
      fila('Tirador', TIRADORES[s.tirador], () => set(st => { st.estilo.tirador = ciclo(TIRADORES, st.estilo.tirador, -1); }), () => set(st => { st.estilo.tirador = ciclo(TIRADORES, st.estilo.tirador, 1); })),
      fila('Encimera', ENCIMERAS[s.encimera].nombre, () => set(st => { st.estilo.encimera = ciclo(ENCIMERAS, st.estilo.encimera, -1); }), () => set(st => { st.estilo.encimera = ciclo(ENCIMERAS, st.estilo.encimera, 1); })),
      fila('Acabado', s.acabadoEncimera === 'brillo' ? 'Brillo' : 'Mate', () => set(st => { st.estilo.acabadoEncimera = st.estilo.acabadoEncimera === 'brillo' ? 'mate' : 'brillo'; }), () => set(st => { st.estilo.acabadoEncimera = st.estilo.acabadoEncimera === 'brillo' ? 'mate' : 'brillo'; })),
      fila('Frontal', FRONTALES[s.frontal], () => set(st => { st.estilo.frontal = ciclo(FRONTALES, st.estilo.frontal, -1); }), () => set(st => { st.estilo.frontal = ciclo(FRONTALES, st.estilo.frontal, 1); })),
    ];
    if (pagina === 'electro') return [
      fila('Campana', CAMPANAS[s.campana], () => set(st => { st.estilo.campana = ciclo(CAMPANAS, st.estilo.campana, -1); }), () => set(st => { st.estilo.campana = ciclo(CAMPANAS, st.estilo.campana, 1); })),
      fila('Placa', PLACAS[s.placa], () => set(st => { st.estilo.placa = ciclo(PLACAS, st.estilo.placa, -1); }), () => set(st => { st.estilo.placa = ciclo(PLACAS, st.estilo.placa, 1); })),
      fila('Horno', HORNOS[s.horno], () => set(st => { st.estilo.horno = ciclo(HORNOS, st.estilo.horno, -1); }), () => set(st => { st.estilo.horno = ciclo(HORNOS, st.estilo.horno, 1); })),
      fila('Frigorífico', FRIGOS[s.frigo], () => set(st => { st.estilo.frigo = ciclo(FRIGOS, st.estilo.frigo, -1); }), () => set(st => { st.estilo.frigo = ciclo(FRIGOS, st.estilo.frigo, 1); })),
      fila('Zócalo', ZOCALOS[s.zocalo], () => set(st => { st.estilo.zocalo = ciclo(ZOCALOS, st.estilo.zocalo, -1); }), () => set(st => { st.estilo.zocalo = ciclo(ZOCALOS, st.estilo.zocalo, 1); })),
      fila('Suelo', SUELOS[s.suelo], () => set(st => { st.estilo.suelo = ciclo(SUELOS, st.estilo.suelo, -1); }), () => set(st => { st.estilo.suelo = ciclo(SUELOS, st.estilo.suelo, 1); })),
    ];
    if (pagina === 'modulo') {
      const sel = app.seleccion, m = moduloEn(e, sel);
      if (!m) return [{ texto: 'Apuntá a un mueble y pulsá el gatillo para elegirlo.' }];
      const L = e.tramos[sel.tramo];
      return [
        { texto: `Pared ${sel.tramo} · módulo ${sel.idx + 1} de ${L.length}` },
        fila('Ancho', `${m.ancho} cm`, () => set(st => { ed.ancho(st, sel, m.ancho - 5); }), () => set(st => { ed.ancho(st, sel, m.ancho + 5); })),
        fila('Abajo', USOS_BAJO[m.bajo], () => set(st => { ed.bajo(st, sel, ciclo(USOS_BAJO, m.bajo, -1)); }), () => set(st => { ed.bajo(st, sel, ciclo(USOS_BAJO, m.bajo, 1)); })),
        COLUMNAS.has(m.bajo) ? { texto: 'Columna: no lleva alto encima.' } : fila('Arriba', USOS_ALTO[m.alto], () => set(st => { ed.alto(st, sel, ciclo(USOS_ALTO, m.alto, -1)); }), () => set(st => { ed.alto(st, sel, ciclo(USOS_ALTO, m.alto, 1)); })),
        fila('Posición', `${sel.idx + 1}`, () => app.cambiar(st => ed.mover(st, sel, -1)), () => app.cambiar(st => ed.mover(st, sel, 1))),
        { botones: [['Duplicar', () => app.cambiar(st => ed.duplicar(st, sel))], ['+ Al lado', () => app.cambiar(st => ed.insertar(st, sel, 60))], ['Borrar', () => app.cambiar(st => ed.borrar(st, sel))]] },
      ];
    }
    if (pagina === 'luz') {
      const l = e.luz; const hh = Math.floor(l.hora), mm = Math.round((l.hora - hh) * 60);
      return [
        fila('Hora', `${hh}:${String(mm).padStart(2, '0')}`, () => app.cambiar(st => { st.luz.hora = Math.max(6, st.luz.hora - 1); }, { reconstruir: false }), () => app.cambiar(st => { st.luz.hora = Math.min(23.5, st.luz.hora + 1); }, { reconstruir: false })),
        fila('LED bajo altos', l.led ? 'Encendido' : 'Apagado', () => set(st => { st.luz.led = !st.luz.led; }), () => set(st => { st.luz.led = !st.luz.led; })),
        fila('Focos techo', l.techo ? 'Encendidos' : 'Apagados', () => app.cambiar(st => { st.luz.techo = !st.luz.techo; }, { reconstruir: false }), () => app.cambiar(st => { st.luz.techo = !st.luz.techo; }, { reconstruir: false })),
        fila('Paredes', PAREDES[s.pared].nombre, () => set(st => { st.estilo.pared = ciclo(PAREDES, st.estilo.pared, -1); }), () => set(st => { st.estilo.pared = ciclo(PAREDES, st.estilo.pared, 1); })),
        fila('Calidad', luces.ligero ? 'Ligera (LED sin luz)' : 'Alta (LED ilumina)', () => { luces.ligero = !luces.ligero; app.aplicarLuz(); sucio = true; }, () => { luces.ligero = !luces.ligero; app.aplicarLuz(); sucio = true; }),
        { botones: [['Deshacer', () => app.deshacer()], ['Rehacer', () => app.rehacer()]] },
      ];
    }
    // sala
    const out = [];
    out.push({ texto: modo === 'ar' ? 'Realidad mixta' : 'Realidad virtual · stick izq. andar, dcho. girar' });
    out.push({ botones: [['Colocar con el mando', () => { accion = 'colocar'; sucio = true; }], ...(modo === 'ar' ? [['Alinear a pared real', () => { accion = 'alinear'; sucio = true; mostrarPlanos(true); }]] : [])] });
    if (modo === 'ar') {
      out.push({ botones: [[ajustar ? 'Joysticks: mover ✓' : 'Joysticks: mover', () => { ajustar = !ajustar; sucio = true; }], [pielNueva ? 'Paredes nuevas ✓' : 'Paredes nuevas', () => { pielNueva = !pielNueva; visibilidadSala(); sucio = true; }]] });
      if (medida) {
        out.push({ texto: `Pared real: ${Math.round(medida.ancho * 100)} cm${medida.ventana ? ` · ventana ${Math.round(medida.ventana.ancho)} cm` : ''}` });
        const b = [['Usar esa medida', () => app.cambiar(st => { st.sala.A = Math.round(medida.ancho * 100); })]];
        if (medida.ventana) b.push(['Usar la ventana', () => app.cambiar(st => { Object.assign(st.ventana, { activa: true, pared: 'A', ...medida.ventana }); for (const k of ['x', 'ancho', 'alto', 'antepecho']) st.ventana[k] = Math.round(st.ventana[k]); ajustarAltos(st); })]);
        out.push({ botones: b });
      }
    }
    if (accion) out.push({ texto: accion === 'colocar' ? 'Apuntá al suelo donde va el centro de la cocina y pulsá el gatillo.' : 'Apuntá a la pared real (contorno) y pulsá el gatillo.' });
    out.push({ botones: [['Salir', () => renderer.xr.getSession()?.end()]] });
    return out;
  }

  function dibujar() {
    sucio = false; botones = [];
    ctx.clearRect(0, 0, PW, PH);
    ctx.fillStyle = 'rgba(247,245,241,0.96)'; redondo(0, 0, PW, PH, 28); ctx.fill();
    // pestañas
    const tabs = [['estilo', 'Estilo'], ['electro', 'Electro'], ['modulo', 'Módulo'], ['luz', 'Luz'], ['sala', 'Sala']];
    const tw = (PW - 40) / tabs.length;
    tabs.forEach(([id, t], i) => {
      const r = { x: 20 + i * tw, y: 20, w: tw - 8, h: 84 };
      ctx.fillStyle = pagina === id ? '#1f1f1d' : (hover === 'tab' + id ? '#e3dfd8' : '#ece9e3'); ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = pagina === id ? '#fff' : '#1f1f1d'; ctx.font = '600 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t, r.x + r.w / 2, r.y + r.h / 2);
      botones.push({ id: 'tab' + id, ...r, fn: () => { pagina = id; if (id !== 'sala') { accion = null; mostrarPlanos(false); } sucio = true; } });
    });
    let y = 130;
    ctx.textAlign = 'left';
    for (const f of filas()) {
      if (f.texto) { ctx.fillStyle = '#5c5953'; ctx.font = '30px system-ui, sans-serif'; envolver(f.texto, 32, y + 34, PW - 64, 38); y += 80; continue; }
      if (f.botones) {
        const bw = (PW - 40) / f.botones.length;
        f.botones.forEach(([t, fn], i) => {
          const r = { x: 20 + i * bw, y, w: bw - 10, h: 88 }; const id = 'b' + y + i;
          ctx.fillStyle = hover === id ? '#ff6a2b' : '#1f1f1d'; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = '#fff'; ctx.font = '600 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t, r.x + r.w / 2, r.y + r.h / 2 + 2); ctx.textAlign = 'left';
          botones.push({ id, ...r, fn });
        });
        y += 104; continue;
      }
      ctx.fillStyle = '#8a867e'; ctx.font = '28px system-ui, sans-serif'; ctx.fillText(f.label, 32, y + 44);
      ctx.fillStyle = '#1f1f1d'; ctx.font = '600 36px system-ui, sans-serif'; ctx.fillText(recortar(f.valor, 470), 260, y + 44);
      for (const [k, x, t, fn] of [['m', 760, '◀', f.menos], ['p', 884, '▶', f.mas]]) {
        const r = { x, y: y + 4, w: 116, h: 80 }; const id = k + y;
        ctx.fillStyle = hover === id ? '#ff6a2b' : '#1f1f1d'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#fff'; ctx.font = '600 38px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t, r.x + r.w / 2, r.y + r.h / 2 + 2); ctx.textAlign = 'left';
        botones.push({ id, ...r, fn });
      }
      ctx.fillStyle = '#e2ded7'; ctx.fillRect(32, y + 94, PW - 64, 2);
      y += 104;
    }
    texPanel.needsUpdate = true;
  }
  function redondo(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function recortar(t, maxW) { t = String(t); while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2); return t; }
  function envolver(t, x, y, maxW, lh) { const pal = t.split(' '); let l = ''; for (const p of pal) { const prueba = l ? l + ' ' + p : p; if (ctx.measureText(prueba).width > maxW) { ctx.fillText(l, x, y); l = p; y += lh; } else l = prueba; } ctx.fillText(l, x, y); }

  // ---------- planos detectados (RM) ----------
  const planos = new Map(); // XRPlane → { linea, malla, etiqueta, t, datos }
  const grupoPlanos = new THREE.Group(); grupoPlanos.visible = false; scene.add(grupoPlanos);
  function mostrarPlanos(v) { grupoPlanos.visible = v; }
  function etiqueta(txt, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,20,20,0.8)'; g.fillRect(0, 0, 512, 128); g.fillStyle = color; g.fillRect(0, 0, 12, 128);
    g.fillStyle = '#fff'; g.font = '600 56px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(txt, 32, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(0.36, 0.09, 1); s.renderOrder = 18; return s;
  }
  function actualizarPlanos(frame) {
    const det = frame.detectedPlanes; if (!det) return;
    const ref = renderer.xr.getReferenceSpace();
    for (const [p, v] of planos) if (!det.has(p)) { grupoPlanos.remove(v.linea, v.malla, v.etiqueta); planos.delete(p); }
    for (const p of det) {
      const pose = frame.getPose(p.planeSpace, ref); if (!pose) continue;
      const prev = planos.get(p);
      if (prev && prev.t === p.lastChangedTime) continue;
      if (prev) grupoPlanos.remove(prev.linea, prev.malla, prev.etiqueta);
      const Mx = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const pts = p.polygon.map(q => new THREE.Vector3(q.x, q.y, q.z).applyMatrix4(Mx));
      const etq = (p.semanticLabel || (p.orientation === 'vertical' ? 'wall' : 'floor')).toLowerCase();
      const color = etq.includes('window') ? '#4fb3ff' : etq.includes('door') ? '#ffd24f' : etq === 'wall' ? '#ff6a2b' : '#8fd18f';
      const linea = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
      const centro = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const pos = []; for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
      const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const malla = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      const n = new THREE.Vector3().setFromMatrixColumn(Mx, 1).normalize();
      let datos = { etq, n, centro, pts, vertical: Math.abs(n.y) < 0.3 };
      let et = null;
      if (datos.vertical) {
        const t = new THREE.Vector3().crossVectors(UP, n).normalize();
        const s = pts.map(q => q.clone().sub(centro).dot(t)), y = pts.map(q => q.y);
        datos.ancho = Math.max(...s) - Math.min(...s); datos.alto = Math.max(...y) - Math.min(...y); datos.ymin = Math.min(...y);
        const nom = etq.includes('window') ? 'Ventana' : etq.includes('door') ? 'Puerta' : 'Pared';
        et = etiqueta(`${nom} ${(datos.ancho).toFixed(2).replace('.', ',')} m`, color);
        et.position.copy(centro).setY(Math.min(1.7, centro.y + 0.2)).addScaledVector(n, 0.03);
      }
      malla.userData.plano = datos;
      grupoPlanos.add(linea, malla); if (et) grupoPlanos.add(et);
      planos.set(p, { linea, malla, etiqueta: et, t: p.lastChangedTime, datos });
    }
  }

  function alinearAPared(d) {
    const cabeza = camera.getWorldPosition(new THREE.Vector3());
    const n = d.n.clone().setY(0).normalize();
    if (n.dot(cabeza.clone().sub(d.centro)) < 0) n.negate();
    const dir = new THREE.Vector3(n.z, 0, -n.x);
    const s = d.pts.map(q => q.clone().sub(d.centro).dot(dir));
    const smin = Math.min(...s);
    const a = d.centro.clone().addScaledVector(dir, smin); a.y = 0;
    mundo.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
    mundo.position.copy(a);
    medida = { ancho: d.ancho };
    // ventana real en esa pared
    for (const { datos: w } of planos.values()) {
      if (!w.etq.includes('window') || !w.vertical) continue;
      const dist = Math.abs(w.centro.clone().sub(a).dot(n));
      if (dist > 0.4) continue;
      const sw = w.pts.map(q => q.clone().sub(a).dot(dir));
      medida.ventana = { pared: 'A', x: Math.min(...sw) * 100, ancho: (Math.max(...sw) - Math.min(...sw)) * 100, antepecho: w.ymin * 100, alto: w.alto * 100 };
    }
    accion = null; mostrarPlanos(false); pagina = 'sala'; sucio = true;
    aviso(`Cocina alineada a una pared de ${Math.round(d.ancho * 100)} cm`);
  }

  // ---------- rayos y gatillo ----------
  const rc = new THREE.Raycaster(); const mrot = new THREE.Matrix4();
  function rayoDe(c) { mrot.identity().extractRotation(c.matrixWorld); rc.ray.origin.setFromMatrixPosition(c.matrixWorld); rc.ray.direction.set(0, 0, -1).applyMatrix4(mrot); return rc; }
  function apuntar(c) {
    const r = rayoDe(c);
    if (panel.visible) {
      const h = r.intersectObject(panel, false)[0];
      if (h) {
        const px = h.uv.x * PW, py = (1 - h.uv.y) * PH;
        const b = botones.find(q => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h);
        return { tipo: 'panel', punto: h.point, dist: h.distance, boton: b };
      }
    }
    if (accion === 'colocar') {
      const d = r.ray.direction, o = r.ray.origin;
      if (d.y < -0.05) { const t = -o.y / d.y; return { tipo: 'suelo', punto: o.clone().addScaledVector(d, t), dist: t }; }
      return null;
    }
    if (accion === 'alinear') {
      const h = r.intersectObjects(grupoPlanos.children.filter(o => o.isMesh && o.userData.plano?.vertical), false)[0];
      return h ? { tipo: 'plano', punto: h.point, dist: h.distance, plano: h.object.userData.plano } : null;
    }
    const h = r.intersectObjects(app.picks, false)[0];
    return h ? { tipo: 'mueble', punto: h.point, dist: h.distance, sel: { tramo: h.object.userData.tramo, idx: h.object.userData.idx } } : null;
  }
  function disparar(c) {
    const a = apuntar(c);
    if (a?.tipo === 'panel') { a.boton?.fn(); sucio = true; return; }
    if (a?.tipo === 'suelo') {
      const cabeza = camera.getWorldPosition(new THREE.Vector3());
      const n = cabeza.clone().sub(a.punto).setY(0).normalize();
      const dir = new THREE.Vector3(n.z, 0, -n.x);
      const W = app.dims.W;
      mundo.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
      mundo.position.copy(a.punto).addScaledVector(dir, -W / 2).addScaledVector(n, -0.3).setY(0);
      accion = null; sucio = true; return;
    }
    if (a?.tipo === 'plano') { alinearAPared(a.plano); return; }
    if (a?.tipo === 'mueble') { app.seleccionar(a.sel); pagina = 'modulo'; sucio = true; return; }
    if (!accion) app.seleccionar(null);
  }

  // ---------- movimiento con joysticks ----------
  let giroListo = true;
  function moverRotarAlrededor(pivote, ang) { const q = new THREE.Quaternion().setFromAxisAngle(UP, ang); mundo.position.sub(pivote).applyQuaternion(q).add(pivote); mundo.quaternion.premultiply(q); }
  function sticks(dt) {
    let izq = null, der = null;
    for (const { c } of mandos) { const f = c.userData.fuente; if (!f?.gamepad) continue; if (f.handedness === 'left') izq = f.gamepad; else der = f.gamepad; }
    const cabeza = camera.getWorldPosition(new THREE.Vector3());
    const adelante = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const derecha = new THREE.Vector3().crossVectors(adelante, UP).normalize();
    const ax = g => [g?.axes?.[2] ?? 0, g?.axes?.[3] ?? 0];
    const [lx, ly] = ax(izq), [rx] = ax(der);
    const zona = v => Math.abs(v) < 0.15 ? 0 : v;
    if (modo === 'vr') {
      const v = 1.4 * dt;
      const mov = adelante.clone().multiplyScalar(-zona(ly) * v).addScaledVector(derecha, zona(lx) * v);
      mundo.position.sub(mov);
      if (Math.abs(rx) > 0.7 && giroListo) { moverRotarAlrededor(cabeza, -Math.sign(rx) * Math.PI / 6); giroListo = false; }
      if (Math.abs(rx) < 0.3) giroListo = true;
    } else if (modo === 'ar' && ajustar) {
      const v = 0.35 * dt;
      mundo.position.addScaledVector(adelante, -zona(ly) * v).addScaledVector(derecha, zona(lx) * v);
      if (zona(rx)) { const W = app.dims.W; const pivote = new THREE.Vector3(W / 2, 0, 0.3).applyMatrix4(mundo.matrixWorld); moverRotarAlrededor(pivote, -zona(rx) * dt * 0.5); }
    }
    // Y/B: mostrar/ocultar panel
    const by = izq?.buttons?.[5]?.pressed;
    if (by && !sticks.by) panel.visible = !panel.visible;
    sticks.by = by;
  }

  // ---------- sesión ----------
  function visibilidadSala() {
    const g = app.salaGrupo; if (!g) return;
    const verSala = modo !== 'ar' || pielNueva;
    g.traverse(o => { if (o !== g && o.parent === g) o.visible = verSala; });
    if (modo === 'ar' && pielNueva) g.children.forEach(o => { if (o.name === 'techo') o.visible = false; });
    sombraSuelo.visible = modo === 'ar' && !pielNueva;
  }

  async function entrar(m) {
    if (renderer.xr.isPresenting || !navigator.xr) return;
    const opciones = m === 'ar'
      ? { requiredFeatures: ['local-floor'], optionalFeatures: ['plane-detection', 'hit-test', 'anchors', 'hand-tracking'] }
      : { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
    try {
      const s = await navigator.xr.requestSession(m === 'ar' ? 'immersive-ar' : 'immersive-vr', opciones);
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(s);
      modo = m; app.modoXR = m; accion = null; pagina = m === 'ar' ? 'sala' : 'estilo'; medida = null;
      s.addEventListener('end', terminar);
      renderer.xr.setFoveation?.(1);
      luces.ligero = true;
      luces.sol.shadow.mapSize.set(1024, 1024); luces.sol.shadow.map?.dispose(); luces.sol.shadow.map = null;
      scene.background = m === 'ar' ? null : fondo;
      for (const muro of app.salaGrupo.children) muro.visible = true;
      app.salaGrupo.traverse(o => { if (o.name === 'exterior') o.visible = true; });
      const { W, D } = app.dims;
      const zp = m === 'ar' ? 2.0 : THREE.MathUtils.clamp(D - 0.6, 1.2, 2.2);
      mundo.rotation.set(0, 0, 0); mundo.position.set(-W / 2, 0, -zp);
      ajustarSombra(); visibilidadSala();
      panel.visible = true; sucio = true;
      setTimeout(() => { if (!panel.parent || panel.parent === scene) panelFlotante(); }, 1500);
      app.aplicarLuz();
    } catch (err) { aviso('No se pudo entrar en ' + (m === 'ar' ? 'realidad mixta' : 'realidad virtual') + ': ' + err.message); }
  }

  function terminar() {
    modo = null; app.modoXR = null; accion = null;
    mundo.position.set(0, 0, 0); mundo.rotation.set(0, 0, 0);
    scene.background = fondo; panel.visible = false; mostrarPlanos(false);
    sombraSuelo.visible = false;
    luces.ligero = false;
    luces.sol.shadow.mapSize.set(2048, 2048); luces.sol.shadow.map?.dispose(); luces.sol.shadow.map = null;
    visibilidadSala();
    for (const { c } of mandos) c.userData.punto.visible = false;
    app.aplicarLuz();
    app.vista('general');
  }

  function porFrame(frame, dt) {
    if (modo === 'ar') actualizarPlanos(frame);
    sticks(dt);
    let nuevoHover = null;
    for (const { c } of mandos) {
      if (!c.userData.fuente) { c.userData.punto.visible = false; continue; }
      const a = apuntar(c);
      c.userData.linea.scale.z = a ? a.dist : 3;
      c.userData.punto.visible = !!a; if (a) c.userData.punto.position.copy(a.punto);
      if (a?.tipo === 'panel' && a.boton) nuevoHover = a.boton.id;
    }
    if (nuevoHover !== hover) { hover = nuevoHover; sucio = true; }
    if (sucio && panel.visible) dibujar();
  }

  return {
    porFrame,
    refrescar() { sucio = true; },
    alReconstruir() { ajustarSombra(); if (modo) visibilidadSala(); sucio = true; },
  };
}
