// Realidad virtual y mixta (Quest): sesiones, mandos y manos, panel (muñeca o flotante) dibujado desde
// opciones.js, recorrer todas las estancias de la vivienda, teletransporte en RV, colocar y alinear una estancia
// con una pared real (RM) y modo maqueta (ver maqueta.js).
//
// Contrato con opciones.js — grupos(app) → [{ id, titulo, filas }]:
//   { tipo:'ciclo',  id, label, valor(), opciones() → [{ v, label, muestra? }], actual(), set(v) }
//   { tipo:'num',    id, label, valor(), unidad, min, max, paso, actual(), set(n) }
//   { tipo:'toggle', id, label, actual(), set(b) }
//   { tipo:'accion', id, label, fn(), peligro? }
//   { tipo:'texto',  texto }
// Al elegir algo con el rayo, el panel salta al grupo cuyo id coincide con su ámbito ('modulo', 'elemento',
// 'estancia'); si no hay ninguno, al primero.
//
// Marco: `mundo` está en coords de la cocina activa; la casa entera cuelga de él (app.matrizCasa: planta → mundo).
// En XR se mueve `mundo` (posición + giro en Y, y escala en maqueta) para poner cada estancia donde está el usuario.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { ajustarAltos } from './modelo.js';
import {
  estanciaPorId, marcoEstancia, localAPlano, puntoEnPoligono, puntoInterior, moverBorde, cocinaActiva, TIPOS, utilEstancia,
} from './casa/modelo-casa.js';
import { grupos as gruposOpciones } from './opciones.js';
import { aviso } from './ui.js';
import { crearMaqueta } from './maqueta.js';

const UP = new THREE.Vector3(0, 1, 0);
const yawQ = a => new THREE.Quaternion().setFromAxisAngle(UP, a);
const angXZ = v => Math.atan2(-v.z, v.x);   // mismo convenio que un giro en Y de three.js
const m2 = v => v.toFixed(1).replace('.', ',');

export function montarXR(app, { renderer, scene, camera, mundo, luces, fondo }) {
  const disp = { vr: false, ar: false };
  app.xrDisponible = disp;
  const btnVR = document.getElementById('btnVR'), btnAR = document.getElementById('btnAR');
  function comprobarSoporte() {
    if (!navigator.xr) return;
    navigator.xr.isSessionSupported('immersive-vr').then(v => { disp.vr = v; btnVR.disabled = !v; }).catch(() => { });
    navigator.xr.isSessionSupported('immersive-ar').then(v => { disp.ar = v; btnAR.disabled = !v; }).catch(() => { });
  }
  comprobarSoporte();
  navigator.xr?.addEventListener?.('devicechange', comprobarSoporte);
  btnVR.addEventListener('click', () => entrar('vr'));
  btnAR.addEventListener('click', () => entrar('ar'));

  const fovEscritorio = camera.fov;
  let modo = null;          // 'vr' | 'ar'
  let sesion = null;
  let sueloY = 0;           // altura del suelo real en el espacio de referencia ('local' no lo conoce)
  let accion = null;        // 'colocar' | 'alinear' | null
  let ajustar = false, pielNueva = false;
  let pagina = 'casa';      // pestaña: 'g:<id de grupo>' | 'casa' | 'vista' | 'sala'
  const paginas = new Map();// pestaña → página de filas
  let medida = null;        // { ancho, id, ventana? } de la última pared real alineada
  let nota = '';            // aviso dentro del panel (el aviso HTML no se ve con las gafas)
  let ancla = null;         // { id, Ow, dW }: dónde está (en el mundo real) el origen de una estancia y hacia dónde su pared A

  const cabeza = () => camera.getWorldPosition(new THREE.Vector3());
  const adelante = () => { const f = camera.getWorldDirection(new THREE.Vector3()).setY(0); return f.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, -1) : f.normalize(); };

  // ---------- estancias en coords del mundo ----------
  const aLocal = (p, y = 0) => new THREE.Vector3(p[0] / 100, y, p[1] / 100).applyMatrix4(app.matrizCasa);
  const dirLocal = d => new THREE.Vector3(d[0], 0, d[1]).transformDirection(app.matrizCasa);
  function marcoLocal(id) {
    const est = estanciaPorId(app.casa, id); if (!est) return null;
    const m = marcoEstancia(est);
    return { est, m, O: aLocal(m.origen), dir: dirLocal(m.dir), n: dirLocal(m.n) };
  }
  const _inv = new THREE.Matrix4();
  function estanciaEnLocal(v) {
    const q = v.clone().applyMatrix4(_inv.copy(app.matrizCasa).invert());
    return app.casa.estancias.find(e => puntoEnPoligono([q.x * 100, q.z * 100], e.poligono)) || null;
  }
  // la estancia con la que se trabaja: la elegida (escritorio o gafas) o la cocina activa
  const estXR = () => (estanciaPorId(app.casa, app.casaSel?.estancia) || cocinaActiva(app.casa) || app.casa.estancias[0])?.id ?? null;
  const nombreDe = id => estanciaPorId(app.casa, id)?.nombre ?? '';

  // dónde estar dentro de una estancia: centrado frente a su pared A, a ~70 % del fondo, mirándola
  function puntoDeEstar(id) {
    const ml = marcoLocal(id); if (!ml) return null;
    const { est, m } = ml;
    const z = Math.max(40, Math.min(m.fondo * 0.7, m.fondo - 60));
    let p = localAPlano(m, [m.A / 2, z]);
    if (!puntoEnPoligono(p, est.poligono)) p = puntoInterior(est.poligono);
    return { P: aLocal(p), d: ml.n.clone().negate() };
  }

  // coloca `mundo` (escala 1) para que el punto local P quede en Pw y la dirección local dL apunte a dW
  function ponerMundo(P, Pw, dL, dW) {
    const q = yawQ(angXZ(dW) - angXZ(dL));
    mundo.scale.setScalar(1); mundo.quaternion.copy(q);
    mundo.position.copy(P).applyQuaternion(q).negate().add(Pw);
    mundo.updateMatrixWorld();
  }
  // el ancla mantiene la estancia en su sitio real aunque la casa se reconstruya (otro marco, otra medida)
  function fijarAncla(id = ancla?.id ?? estXR()) {
    if (!modo || maq.activa) return;
    const ml = marcoLocal(id); if (!ml) { ancla = null; return; }
    mundo.updateMatrixWorld();
    ancla = { id, Ow: ml.O.clone().applyMatrix4(mundo.matrixWorld), dW: ml.dir.clone().applyQuaternion(mundo.quaternion) };
  }
  function aplicarAncla() {
    if (!ancla || !modo || maq.activa) return;
    const ml = marcoLocal(ancla.id); if (!ml) { ancla = null; return; }
    ponerMundo(ml.O, ancla.Ow, ml.dir, ancla.dW);
  }

  // «Ir»: la estancia se pone alrededor del usuario, mirando a su pared principal (RV y RM)
  function irA(id) {
    const est = estanciaPorId(app.casa, id); if (!est) return;
    // la pose de la cabeza antes de nada: activarCocina mueve la cámara de escritorio (OrbitControls)
    const h = cabeza(), f = adelante();
    if (maq.activa) maq.reset();
    accion = null; mostrarPlanos(false);
    if (est.cocina && cocinaActiva(app.casa)?.id !== id) app.activarCocina(id);
    const pe = puntoDeEstar(id); if (!pe) return;
    ponerMundo(pe.P, new THREE.Vector3(h.x, sueloY, h.z), pe.d, f);
    app.seleccionar({ ambito: 'estancia', estancia: id });
    fijarAncla(id);
    if (medida?.id !== id) medida = null;
    nota = modo === 'ar' ? `${est.nombre} está aquí. Si quieres, alinéala a una pared real.` : `Estás en ${est.nombre}.`;
    sucio = true;
  }

  // ---------- suelo que recibe sombras (RM y mesa de la maqueta) ----------
  const sombraSuelo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32 }));
  sombraSuelo.rotation.x = -Math.PI / 2; sombraSuelo.position.y = 0.002; sombraSuelo.receiveShadow = true; sombraSuelo.visible = false;
  sombraSuelo.name = 'sombraSuelo';
  mundo.add(sombraSuelo);
  function ajustarSombra() {
    const c = app.cajaCasa;
    if (c) { sombraSuelo.scale.set(c.x1 - c.x0 + 1.5, c.z1 - c.z0 + 1.5, 1); sombraSuelo.position.x = c.cx; sombraSuelo.position.z = c.cz; return; }
    const { W, D } = app.dims; sombraSuelo.scale.set(W + 1.5, D + 1.5, 1); sombraSuelo.position.x = W / 2; sombraSuelo.position.z = D / 2;
  }

  // ---------- estancia elegida resaltada en el suelo ----------
  const resalte = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: '#ff6a2b', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  resalte.name = 'resalteEstancia'; resalte.renderOrder = 8; resalte.visible = false; mundo.add(resalte);
  let generacion = 0, resalteClave = '';
  function actualizarResalte() {
    const id = modo && app.casa.estancias.length > 1 ? app.casaSel?.estancia : null;
    const clave = id ? `${id}:${generacion}` : '';
    if (clave === resalteClave) return;
    resalteClave = clave;
    resalte.geometry.dispose(); resalte.geometry = new THREE.BufferGeometry(); resalte.visible = false;
    const est = id && estanciaPorId(app.casa, id); if (!est) return;
    const pol = est.poligono;
    const tris = THREE.ShapeUtils.triangulateShape(pol.map(p => new THREE.Vector2(p[0], p[1])), []);
    const pos = pol.flatMap(p => aLocal(p, 0.012).toArray());
    resalte.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    resalte.geometry.setIndex(tris.flat());
    resalte.material.opacity = modo === 'ar' ? 0.24 : 0.14;
    resalte.visible = true;
  }

  // ---------- planos detectados (RM) ----------
  const planos = new Map(); // XRPlane → { linea, malla, etiqueta, t, datos }
  const grupoPlanos = new THREE.Group(); grupoPlanos.visible = false; scene.add(grupoPlanos);
  function mostrarPlanos(v) { grupoPlanos.visible = v; }

  // ---------- maqueta ----------
  const maq = crearMaqueta({
    app, scene, camera, mundo, luces, sombraSuelo,
    sueloY: () => sueloY,
    mesas: () => [...planos.values()].map(v => v.datos).filter(d => d.horizontal && /table|desk|mesa/.test(d.etq)),
    alSalir: () => { visibilidadSala(); if (modo) fijarAncla(estXR()); sucio = true; },
    vuelta: () => puntoDeEstar(estXR()),
  });
  let escalaMostrada = 0;
  function verMaqueta() {
    accion = null; mostrarPlanos(false);
    const enMesa = maq.entrar();
    nota = enMesa ? 'Apoyada en la mesa detectada.' : (modo === 'ar' ? 'No se ha detectado ninguna mesa: va delante de ti.' : '');
    pagina = 'vista'; sucio = true;
  }

  // ---------- mandos y manos ----------
  const fabrica = new XRControllerModelFactory();
  const lineaGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const esMano = c => !!c.userData.fuente?.hand;
  const N_ARCO = 64;
  const matArco = new THREE.LineBasicMaterial({ color: '#ff6a2b', transparent: true, opacity: 0.9 });
  const matArcoMal = new THREE.LineBasicMaterial({ color: '#9a958c', transparent: true, opacity: 0.6 });
  const geoAro = new THREE.RingGeometry(0.16, 0.2, 32); geoAro.rotateX(-Math.PI / 2);
  const mandos = [0, 1].map(i => {
    const c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i);
    g.add(fabrica.createControllerModel(g));
    const linea = new THREE.Line(lineaGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
    linea.scale.z = 3; c.add(linea);
    const punto = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff6a2b', depthTest: false }));
    punto.renderOrder = 20; punto.visible = false; scene.add(punto);
    // arco de teletransporte (RV) y aro de destino
    const geoArco = new THREE.BufferGeometry(); geoArco.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_ARCO * 3), 3));
    const arco = new THREE.Line(geoArco, matArco); arco.frustumCulled = false; arco.visible = false; arco.renderOrder = 19; scene.add(arco);
    const aro = new THREE.Mesh(geoAro, new THREE.MeshBasicMaterial({ color: '#ff6a2b', transparent: true, opacity: 0.85, depthTest: false }));
    aro.renderOrder = 19; aro.visible = false; scene.add(aro);
    c.userData = { i, linea, punto, arco, aro, mano: null, fuente: null, grip: g };
    c.addEventListener('connected', ev => {
      const f = ev.data; if (!f) return;
      c.userData.mano = f.handedness; c.userData.fuente = f; g.userData.mano = f.handedness;
      if (f.handedness !== 'left') return;
      if (f.hand) { if (panel.parent === g) panelFlotante(); }   // mano sin mando: el panel flota
      else if (!arrastre) anclarPanel(g);
    });
    c.addEventListener('disconnected', () => {
      maq.soltar(c); pellizcos.delete(c);
      if (arrastre?.c === c) arrastre = null;
      c.userData.fuente = null; c.userData.punto.visible = false; arco.visible = false; aro.visible = false;
      if (panel.parent === g && modo) panelFlotante();
    });
    c.addEventListener('selectstart', () => disparar(c));
    c.addEventListener('selectend', () => soltarGatillo(c));
    c.addEventListener('squeezestart', () => { if (maq.activa && maq.agarrar(c)) pulso(c, 0.25, 20); });
    c.addEventListener('squeezeend', () => maq.soltar(c));
    scene.add(c, g);
    return { c, g };
  });
  function pulso(c, fuerza = 0.35, ms = 25) {
    try { c.userData.fuente?.gamepad?.hapticActuators?.[0]?.pulse?.(fuerza, ms); } catch { /* sin vibración */ }
  }
  const modoManos = () => mandos.some(({ c }) => esMano(c)) && !mandos.some(({ c }) => c.userData.fuente && !esMano(c));

  // ---------- panel ----------
  // Lienzo 1024 px = 0,30 m → 1 px ≈ 0,29 mm. Botones de 96 px ≈ 2,8 cm (objetivo ≥ 2,5 cm).
  const PW = 1024, PH = 1024, ANCHO = 0.30;
  const lienzo = document.createElement('canvas'); lienzo.width = PW; lienzo.height = PH;
  const ctx = lienzo.getContext('2d');
  const texPanel = new THREE.CanvasTexture(lienzo); texPanel.colorSpace = THREE.SRGBColorSpace; texPanel.anisotropy = 4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, ANCHO * PH / PW), new THREE.MeshBasicMaterial({ map: texPanel, transparent: true, toneMapped: false }));
  panel.visible = false; panel.renderOrder = 15; panel.name = 'panelXR';
  let botones = [], hover = null, sucio = true;
  let arrastre = null;      // { c, dist } mientras se recoloca el panel con el asa
  function anclarPanel(grip) { grip.add(panel); panel.position.set(0, 0.18, -0.05); panel.rotation.set(-0.65, 0, 0); }
  function panelFlotante() {
    scene.add(panel);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(-0.22, -0.18, -0.55).applyMatrix4(camera.matrixWorld);
    panel.position.copy(p); panel.lookAt(cabeza());
  }

  // grupos de opciones (comunes con el escritorio); un fallo ahí no debe dejar el panel en blanco
  const erroresVistos = new Set();
  function registrar(msg, err) { const k = msg + String(err?.message || err); if (!erroresVistos.has(k)) { erroresVistos.add(k); console.error(msg, err); } }
  function leerGrupos() { try { return (gruposOpciones(app) || []).filter(g => g && g.id != null); } catch (err) { registrar('XR: grupos() falló', err); return []; } }

  function pestanas(gs) {
    return [
      ...gs.map(g => ({ id: 'g:' + g.id, t: g.titulo || g.id })),
      { id: 'casa', t: 'Casa' }, { id: 'vista', t: 'Vista' }, { id: 'sala', t: modo === 'ar' ? 'Sala real' : 'Moverse' },
    ];
  }
  // tras elegir algo, a su grupo
  function saltarA(ambito) {
    const gs = leerGrupos();
    const g = gs.find(x => x.id === ambito) || gs.find(x => String(x.id).startsWith(ambito)) || (ambito === 'estancia' ? null : gs[0]);
    pagina = g ? 'g:' + g.id : 'casa'; sucio = true;
  }

  // filas de las pestañas fijas (mismo formato que opciones.js, más 'pasos' e 'ir', que solo usa el panel)
  function filasCasa() {
    const casa = app.casa, actual = estXR(), dentro = ancla?.id;
    const out = [{ tipo: 'texto', texto: `${casa.nombre || 'Vivienda'} · ${casa.estancias.length} estancias. «Ir» te lleva dentro; el nombre la elige para editarla.` }];
    for (const e of casa.estancias) {
      out.push({
        tipo: 'ir', label: e.nombre, sub: `${(TIPOS[e.tipo] || TIPOS.otro).nombre} · ${m2(utilEstancia(e))} m²${e.id === dentro ? ' · estás aquí' : ''}`,
        marcada: e.id === actual,
        elegir: () => { app.seleccionar({ ambito: 'estancia', estancia: e.id }); if (e.cocina && cocinaActiva(app.casa)?.id !== e.id) app.activarCocina(e.id); saltarA(e.cocina ? 'estilo' : 'estancia'); },
        ir: () => irA(e.id),
      });
    }
    return out;
  }
  function filasVista() {
    const out = [];
    if (!maq.activa) {
      out.push({ tipo: 'texto', texto: 'La vivienda en miniatura (1:20) sobre una mesa. Si las gafas detectan una mesa, se apoya en ella; si no, aparece delante de ti.' });
      out.push({ tipo: 'accion', label: 'Ver como maqueta', fn: verMaqueta });
    } else {
      out.push({ tipo: 'texto', texto: modoManos() ? 'Pellizca y mantén para moverla; con las dos manos, escala y gira. Apunta a un suelo para elegir la estancia.' : 'Botón lateral para agarrarla; con los dos mandos, escala y gira. Apunta a un suelo para elegir la estancia.' });
      out.push({ tipo: 'pasos', label: 'Escala', valor: `1:${Math.round(1 / maq.escala)}`, menos: () => maq.pasoEscala(-1), mas: () => maq.pasoEscala(1) });
      out.push({ tipo: 'pasos', label: 'Girar', valor: '90°', menos: () => maq.girar(Math.PI / 2), mas: () => maq.girar(-Math.PI / 2) });
      out.push({ tipo: 'accion', label: 'Recolocar', fn: verMaqueta });
      out.push({ tipo: 'accion', label: 'Tamaño real', fn: () => { maq.tamanoReal(); nota = `Vuelves a ${nombreDe(estXR())}.`; } });
    }
    out.push({ tipo: 'toggle', label: 'Luz LED real', actual: () => !luces.ligero, set: b => { luces.ligero = !b; app.aplicarLuz(); sucio = true; } });
    out.push({ tipo: 'accion', label: 'Deshacer', fn: () => app.deshacer() });
    out.push({ tipo: 'accion', label: 'Rehacer', fn: () => app.rehacer() });
    if (nota) out.push({ tipo: 'texto', texto: nota });
    return out;
  }
  function filasSala() {
    const out = [], id = estXR(), nom = nombreDe(id);
    if (modo === 'ar') {
      out.push({ tipo: 'texto', texto: `Realidad mixta · estancia: ${nom}` });
      out.push({ tipo: 'accion', label: 'Traerla aquí', fn: () => irA(id) });
      out.push({ tipo: 'accion', label: 'Colocar con el mando', fn: () => { maq.reset(); accion = 'colocar'; sucio = true; } });
      out.push({ tipo: 'accion', label: 'Alinear a pared real', fn: () => { maq.reset(); accion = 'alinear'; sucio = true; mostrarPlanos(true); } });
      out.push({ tipo: 'toggle', label: 'Paredes nuevas', actual: () => pielNueva, set: b => { pielNueva = b; visibilidadSala(); sucio = true; } });
      out.push({ tipo: 'toggle', label: 'Sticks: mover', actual: () => ajustar, set: b => { ajustar = b; sucio = true; } });
      if (accion === 'alinear' && !planos.size) {
        out.push({ tipo: 'texto', texto: 'Las gafas no comparten paredes: configura el espacio (límite y paredes) en los ajustes de las Quest.' });
        if (sesion?.initiateRoomCapture) out.push({ tipo: 'accion', label: 'Escanear la sala', fn: () => sesion.initiateRoomCapture().catch(() => { }) });
      }
      if (medida && medida.id === id) {
        const ml = marcoLocal(id);
        out.push({ tipo: 'texto', texto: `Pared real: ${Math.round(medida.ancho * 100)} cm (${nom}: ${Math.round(ml?.m.A ?? 0)} cm)${medida.ventana ? ` · ventana ${Math.round(medida.ventana.ancho)} cm` : ''}` });
        out.push({ tipo: 'accion', label: 'Usar esa medida', fn: () => usarMedida(id) });
        if (medida.ventana) out.push({ tipo: 'accion', label: 'Usar la ventana', fn: usarVentana });
      }
    } else {
      out.push({ tipo: 'texto', texto: modoManos() ? `Realidad virtual · ${nom}. Apunta al suelo y pellizca para ir allí.` : `Realidad virtual · ${nom}. Apunta al suelo (arco) y gatillo para ir; stick izq. andar, dcho. girar.` });
      out.push({ tipo: 'accion', label: 'Volver al centro', fn: () => irA(id) });
      out.push({ tipo: 'accion', label: 'Maqueta', fn: verMaqueta });
    }
    if (accion) out.push({ tipo: 'texto', texto: accion === 'colocar' ? `Apunta al suelo donde va el centro de la pared principal de ${nom} y pulsa el gatillo.` : `Apunta a la pared real (contorno) donde va la pared principal de ${nom} y pulsa el gatillo.` });
    if (nota && !maq.activa) out.push({ tipo: 'texto', texto: nota });
    return out;
  }
  function usarMedida(id) {
    const ml = marcoLocal(id); if (!ml || !medida) return;
    const cm = Math.round(medida.ancho * 100);
    if (ml.est.cocina && cocinaActiva(app.casa)?.id === id) app.cambiar(st => { st.sala.A = cm; });
    else if (ml.m.rect) app.cambiarCasa(c => { moverBorde(c, id, ml.m.letras.C, cm - ml.m.A); return { estancia: id }; });
    else { nota = 'Solo se puede ajustar la medida de estancias rectangulares.'; sucio = true; return; }
    nota = `${ml.est.nombre}: pared principal a ${cm} cm.`; sucio = true;
  }
  function usarVentana() {
    const v = medida?.ventana; if (!v) return;
    app.cambiar(st => { Object.assign(st.ventana, { activa: true, pared: 'A', ...v }); for (const k of ['x', 'ancho', 'alto', 'antepecho']) st.ventana[k] = Math.round(st.ventana[k]); ajustarAltos(st); });
  }

  // ---------- dibujo del panel ----------
  const ALTO_FILA = 112, ALTO_BOTON = 96, Y0 = 180, Y1 = PH - 120;
  const F_BOTON = '600 34px system-ui, sans-serif', F_TEXTO = '32px system-ui, sans-serif';
  const C = { fondo: 'rgba(247,245,241,0.97)', tinta: '#1f1f1d', suave: '#ece9e3', suaveH: '#e3dfd8', acento: '#ff6a2b', peligro: '#b8402a', gris: '#7a766e', texto: '#4f4c46', linea: '#e2ded7' };

  function boton(id, r, fn, texto, { estilo = 'oscuro', fuente = F_BOTON, alinear = 'center' } = {}) {
    const h = hover === id;
    const bg = { oscuro: h ? C.acento : C.tinta, claro: h ? C.suaveH : C.suave, activo: h ? C.acento : '#3c3a35', peligro: h ? C.acento : C.peligro }[estilo];
    ctx.fillStyle = bg; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (texto != null) {
      ctx.fillStyle = estilo === 'claro' && !h ? C.tinta : '#fff'; ctx.font = fuente; ctx.textAlign = alinear;
      const x = alinear === 'center' ? r.x + r.w / 2 : r.x + 24;
      ctx.fillText(recortar(texto, r.w - 30), x, r.y + r.h / 2 + 2); ctx.textAlign = 'left';
    }
    botones.push({ id, ...r, fn, texto });
  }

  function pintarFila(f, y, k) {
    const yc = y + ALTO_BOTON / 2;
    ctx.fillStyle = C.gris; ctx.font = '30px system-ui, sans-serif'; ctx.fillText(recortar(f.label ?? '', 220), 32, yc);
    const valor = (txt, x = 262, w = 470) => { ctx.fillStyle = C.tinta; ctx.font = '600 38px system-ui, sans-serif'; ctx.fillText(recortar(txt, w), x, yc); };
    const flechas = (menos, mas, sim = ['◀', '▶']) => {
      boton(k + 'm', { x: 752, y, w: 120, h: ALTO_BOTON }, menos, sim[0], { fuente: '600 40px system-ui, sans-serif' });
      boton(k + 'p', { x: 884, y, w: 120, h: ALTO_BOTON }, mas, sim[1], { fuente: '600 40px system-ui, sans-serif' });
    };
    if (f.tipo === 'ciclo') {
      const ops = f.opciones?.() || [];
      const cur = f.actual?.();
      const i = Math.max(0, ops.findIndex(o => o.v === cur));
      const muestra = ops[i]?.muestra;
      if (muestra) { ctx.fillStyle = muestra; ctx.fillRect(262, yc - 22, 44, 44); ctx.strokeStyle = '#00000033'; ctx.lineWidth = 2; ctx.strokeRect(262, yc - 22, 44, 44); }
      valor(f.valor?.() ?? ops[i]?.label ?? '', muestra ? 318 : 262, muestra ? 414 : 470);
      const ir = d => () => { if (!ops.length) return; f.set(ops[(i + d + ops.length) % ops.length].v); };
      flechas(ir(-1), ir(1));
    } else if (f.tipo === 'num') {
      const u = f.unidad ? ' ' + f.unidad : '';
      const v = String(f.valor?.() ?? f.actual?.());
      valor(u && v.endsWith(f.unidad) ? v : v + u);
      const paso = d => () => {
        const a = Number(f.actual?.()) || 0, p = f.paso || 1;
        const n = Math.round(THREE.MathUtils.clamp(a + d * p, f.min ?? -Infinity, f.max ?? Infinity) * 1000) / 1000;
        if (n !== a) f.set(n);
      };
      flechas(paso(-1), paso(1), ['−', '+']);
    } else if (f.tipo === 'pasos') {
      valor(f.valor); flechas(f.menos, f.mas);
    } else if (f.tipo === 'toggle') {
      const on = !!f.actual?.();
      ctx.fillStyle = C.tinta; ctx.font = '600 38px system-ui, sans-serif'; ctx.fillText(on ? 'Sí' : 'No', 262, yc);
      boton(k + 't', { x: 752, y, w: 252, h: ALTO_BOTON }, () => f.set(!on), on ? 'Activado ✓' : 'Activar', { estilo: on ? 'activo' : 'claro' });
    } else if (f.tipo === 'ir') {
      const r = { x: 20, y, w: PW - 40 - 210, h: ALTO_BOTON };
      boton(k + 'e', r, f.elegir, null, { estilo: f.marcada ? 'activo' : 'claro' });
      const claro = !f.marcada && hover !== k + 'e';
      ctx.fillStyle = claro ? C.tinta : '#fff'; ctx.font = '600 36px system-ui, sans-serif'; ctx.fillText(recortar(f.label, 380), 44, yc);
      ctx.fillStyle = claro ? C.gris : '#ffffffcc'; ctx.font = '28px system-ui, sans-serif'; ctx.fillText(recortar(f.sub || '', r.w - 440), 440, yc);
      boton(k + 'i', { x: PW - 20 - 200, y, w: 200, h: ALTO_BOTON }, f.ir, 'Ir');
    } else return;
    ctx.fillStyle = C.linea; ctx.fillRect(32, y + ALTO_BOTON + 7, PW - 64, 2);
  }

  // filas → renglones con alto conocido (las acciones seguidas se juntan de 1 a 3 por renglón)
  function renglones(filas) {
    const out = [];
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]; if (!f) continue;
      if (f.tipo === 'accion') {
        const run = [f]; while (filas[i + 1]?.tipo === 'accion') run.push(filas[++i]);
        ctx.font = F_BOTON;
        for (let k = 0; k < run.length;) {
          let n = Math.min(3, run.length - k);
          while (n > 1 && run.slice(k, k + n).some(a => ctx.measureText(String(a.label)).width > (PW - 40) / n - 40)) n--;
          const trozo = run.slice(k, k + n); k += n;
          out.push({
            alto: ALTO_FILA, pintar: (y, id) => {
              const bw = (PW - 40) / trozo.length;
              trozo.forEach((a, j) => boton(id + 'a' + j, { x: 20 + j * bw, y, w: bw - 10, h: ALTO_BOTON }, a.fn, a.label, { estilo: a.peligro ? 'peligro' : 'oscuro' }));
            },
          });
        }
        continue;
      }
      if (f.tipo === 'texto') {
        ctx.font = F_TEXTO;
        const ls = lineas(String(f.texto ?? ''), PW - 64);
        out.push({ alto: 18 + ls.length * 40, pintar: y => { ctx.fillStyle = C.texto; ctx.font = F_TEXTO; ls.forEach((l, j) => ctx.fillText(l, 32, y + 24 + j * 40)); } });
        continue;
      }
      out.push({ alto: ALTO_FILA, pintar: (y, id) => pintarFila(f, y, id) });
    }
    return out;
  }
  function paginar(rs) {
    const pags = []; let cur = [], h = 0;
    for (const r of rs) {
      if (cur.length && h + r.alto > Y1 - Y0) { pags.push(cur); cur = []; h = 0; }
      cur.push(r); h += r.alto;
    }
    if (cur.length || !pags.length) pags.push(cur);
    return pags;
  }

  function dibujar() {
    sucio = false; botones = [];
    ctx.clearRect(0, 0, PW, PH);
    ctx.fillStyle = C.fondo; ctx.beginPath(); ctx.roundRect(0, 0, PW, PH, 28); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    // asa para recolocar el panel
    const asa = { id: 'asa', x: 300, y: 8, w: PW - 600, h: 56 };
    ctx.fillStyle = hover === 'asa' || arrastre ? C.acento : '#cfc9bf'; ctx.beginPath(); ctx.roundRect(asa.x + 120, asa.y + 20, asa.w - 240, 16, 8); ctx.fill();
    botones.push({ ...asa, fn: null });

    // pestañas: grupos de opciones + fijas; si no caben, ◀ ▶ pasan a la anterior/siguiente
    const gs = leerGrupos();
    const tabs = pestanas(gs);
    let ia = tabs.findIndex(t => t.id === pagina);
    if (ia < 0) { ia = 0; pagina = tabs[0].id; }
    const caben = tabs.length <= 5 ? tabs.length : 4;
    const ini = THREE.MathUtils.clamp(ia - Math.floor(caben / 2), 0, tabs.length - caben);
    let x0 = 20, x1 = PW - 20;
    if (caben < tabs.length) {
      boton('tab<', { x: 20, y: 68, w: 84, h: ALTO_BOTON }, () => { pagina = tabs[(ia - 1 + tabs.length) % tabs.length].id; accion = null; mostrarPlanos(false); }, '◀', { estilo: 'claro' });
      boton('tab>', { x: PW - 104, y: 68, w: 84, h: ALTO_BOTON }, () => { pagina = tabs[(ia + 1) % tabs.length].id; accion = null; mostrarPlanos(false); }, '▶', { estilo: 'claro' });
      x0 = 112; x1 = PW - 112;
    }
    const tw = (x1 - x0) / caben;
    tabs.slice(ini, ini + caben).forEach((t, j) => {
      const r = { x: x0 + j * tw, y: 68, w: tw - 8, h: ALTO_BOTON };
      const activa = t.id === pagina;
      boton('tab:' + t.id, r, () => { pagina = t.id; if (t.id !== 'sala') { accion = null; mostrarPlanos(false); } }, t.t, { estilo: activa ? 'oscuro' : 'claro', fuente: '600 32px system-ui, sans-serif' });
      if (activa) { ctx.fillStyle = C.acento; ctx.fillRect(r.x, r.y + r.h - 6, r.w, 6); }
    });

    // filas de la pestaña, paginadas
    let filas = [];
    try {
      if (pagina.startsWith('g:')) filas = gs.find(g => 'g:' + g.id === pagina)?.filas || [];
      else filas = pagina === 'casa' ? filasCasa() : pagina === 'vista' ? filasVista() : filasSala();
    } catch (err) { registrar('XR: filas de la pestaña', err); }
    const pags = paginar(renglones(filas));
    const np = Math.min(paginas.get(pagina) || 0, pags.length - 1);
    paginas.set(pagina, np);
    let y = Y0;
    pags[np].forEach((r, j) => {
      try { r.pintar(y, `f${np}.${j}.`); } catch (err) { registrar('XR: fila', err); }
      y += r.alto;
    });

    // pie: páginas y salir
    const yp = PH - 108;
    if (pags.length > 1) {
      boton('pag-', { x: 20, y: yp, w: 120, h: ALTO_BOTON }, () => paginas.set(pagina, Math.max(0, np - 1)), '▲', { estilo: np > 0 ? 'oscuro' : 'claro' });
      ctx.fillStyle = C.gris; ctx.font = '600 32px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${np + 1} / ${pags.length}`, 220, yp + ALTO_BOTON / 2); ctx.textAlign = 'left';
      boton('pag+', { x: 300, y: yp, w: 120, h: ALTO_BOTON }, () => paginas.set(pagina, Math.min(pags.length - 1, np + 1)), '▼', { estilo: np < pags.length - 1 ? 'oscuro' : 'claro' });
    }
    boton('salir', { x: PW - 260, y: yp, w: 240, h: ALTO_BOTON }, () => sesion?.end().catch(() => { }), 'Salir');
    texPanel.needsUpdate = true;
  }
  function recortar(t, maxW) { t = String(t); if (ctx.measureText(t).width <= maxW) return t; while (ctx.measureText(t + '…').width > maxW && t.length > 3) t = t.slice(0, -1); return t + '…'; }
  function lineas(t, maxW) {
    const out = []; let l = '';
    for (const p of t.split(' ')) { const prueba = l ? l + ' ' + p : p; if (ctx.measureText(prueba).width > maxW && l) { out.push(l); l = p; } else l = prueba; }
    out.push(l); return out;
  }

  // ---------- planos detectados (RM) ----------
  function etiqueta(txt, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,20,20,0.8)'; g.fillRect(0, 0, 512, 128); g.fillStyle = color; g.fillRect(0, 0, 12, 128);
    g.fillStyle = '#fff'; g.font = '600 56px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(txt, 32, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(0.36, 0.09, 1); s.renderOrder = 18; return s;
  }
  function quitarPlano(v) {
    for (const o of [v.linea, v.malla, v.etiqueta]) {
      if (!o) continue;
      grupoPlanos.remove(o); o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose();
    }
  }
  function limpiarPlanos() { for (const v of planos.values()) quitarPlano(v); planos.clear(); }
  function actualizarPlanos(frame) {
    const det = frame.detectedPlanes; if (!det) return;   // sin plane-detection o sin permiso
    const ref = renderer.xr.getReferenceSpace(); if (!ref) return;
    for (const [p, v] of planos) if (!det.has(p)) { quitarPlano(v); planos.delete(p); }
    for (const p of det) {
      const prev = planos.get(p);
      if (prev && prev.t === p.lastChangedTime) continue;
      let pose = null;
      try { pose = frame.getPose(p.planeSpace, ref); } catch { pose = null; }
      if (!pose || !p.polygon?.length) continue;
      if (prev) quitarPlano(prev);
      const Mx = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const pts = p.polygon.map(q => new THREE.Vector3(q.x, q.y, q.z).applyMatrix4(Mx));
      const etq = (p.semanticLabel || (p.orientation === 'vertical' ? 'wall' : 'floor')).toLowerCase();
      const color = etq.includes('window') ? '#4fb3ff' : etq.includes('door') ? '#ffd24f' : etq === 'wall' ? '#ff6a2b' : /table|desk/.test(etq) ? '#d18fd1' : '#8fd18f';
      const linea = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
      const centro = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const pos = []; for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
      const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const malla = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      const n = new THREE.Vector3().setFromMatrixColumn(Mx, 1).normalize();
      const datos = { etq, n, centro, pts, vertical: Math.abs(n.y) < 0.3, horizontal: Math.abs(n.y) > 0.7 };
      let et = null;
      if (datos.vertical) {
        const t = new THREE.Vector3().crossVectors(UP, n).normalize();
        const s = pts.map(q => q.clone().sub(centro).dot(t)), y = pts.map(q => q.y);
        datos.ancho = Math.max(...s) - Math.min(...s); datos.alto = Math.max(...y) - Math.min(...y); datos.ymin = Math.min(...y) - sueloY;
        const nom = etq.includes('window') ? 'Ventana' : etq.includes('door') ? 'Puerta' : 'Pared';
        et = etiqueta(`${nom} ${(datos.ancho).toFixed(2).replace('.', ',')} m`, color);
        et.position.copy(centro).setY(Math.min(sueloY + 1.7, centro.y + 0.2)).addScaledVector(n, 0.03);
      }
      malla.userData.plano = datos;
      grupoPlanos.add(linea, malla); if (et) grupoPlanos.add(et);
      planos.set(p, { linea, malla, etiqueta: et, t: p.lastChangedTime, datos });
    }
  }

  // la pared principal (A) de la estancia elegida se pega a la pared real: su esquina izquierda al extremo
  // izquierdo del contorno (visto desde el usuario)
  function alinearAPared(d) {
    const id = estXR(), ml = marcoLocal(id); if (!ml) return;
    const n = d.n.clone().setY(0).normalize();
    if (n.dot(cabeza().sub(d.centro)) < 0) n.negate();
    const dir = new THREE.Vector3(n.z, 0, -n.x);
    const s = d.pts.map(q => q.clone().sub(d.centro).dot(dir));
    const a = d.centro.clone().addScaledVector(dir, Math.min(...s)); a.y = sueloY;
    ponerMundo(ml.O, a, ml.dir, dir);
    fijarAncla(id);
    medida = { ancho: d.ancho, id };
    // ventana real en esa pared (solo la cocina la usa)
    if (ml.est.cocina) {
      for (const { datos: w } of planos.values()) {
        if (!w.etq.includes('window') || !w.vertical) continue;
        if (Math.abs(w.centro.clone().sub(a).dot(n)) > 0.4) continue;
        const sw = w.pts.map(q => q.clone().sub(a).dot(dir));
        medida.ventana = { pared: 'A', x: Math.min(...sw) * 100, ancho: (Math.max(...sw) - Math.min(...sw)) * 100, antepecho: w.ymin * 100, alto: w.alto * 100 };
      }
    }
    accion = null; mostrarPlanos(false); pagina = 'sala'; nota = ''; sucio = true;
    app.seleccionar({ ambito: 'estancia', estancia: id });
    aviso(`${ml.est.nombre} alineada a una pared de ${Math.round(d.ancho * 100)} cm`);
  }

  // ---------- rayos, arco, gatillo y pellizco ----------
  const rc = new THREE.Raycaster(); const mrot = new THREE.Matrix4();
  function rayoDe(c) { mrot.identity().extractRotation(c.matrixWorld); rc.ray.origin.setFromMatrixPosition(c.matrixWorld); rc.ray.direction.set(0, 0, -1).applyMatrix4(mrot); rc.far = Infinity; return rc; }
  // forma común de lo elegido (los picks de la cocina antiguos solo traen tramo/idx)
  function selDe(u) {
    if (u.ambito === 'elemento') return { ambito: 'elemento', estancia: u.estancia, id: u.id };
    if (u.ambito === 'estancia') return { ambito: 'estancia', estancia: u.estancia };
    if (u.tramo != null) return { ambito: 'modulo', tramo: u.tramo, idx: u.idx };
    return null;
  }
  // parábola desde el mando hasta el suelo (RV)
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _v = new THREE.Vector3();
  function trazarArco(c, r) {
    const pos = c.userData.arco.geometry.attributes.position;
    _p.copy(r.ray.origin); _v.copy(r.ray.direction).multiplyScalar(7);
    pos.setXYZ(0, _p.x, _p.y, _p.z);
    const dt = 0.03;
    for (let i = 1; i < N_ARCO; i++) {
      _q.copy(_p).addScaledVector(_v, dt); _v.y -= 9.8 * dt;
      if (_q.y <= sueloY) {
        const t = (_p.y - sueloY) / Math.max(1e-6, _p.y - _q.y);
        const hit = _p.clone().lerp(_q, t);
        pos.setXYZ(i, hit.x, hit.y, hit.z); pos.needsUpdate = true;
        c.userData.arco.geometry.setDrawRange(0, i + 1);
        return hit;
      }
      pos.setXYZ(i, _q.x, _q.y, _q.z); _p.copy(_q);
    }
    return null;
  }
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
      if (d.y < -0.05) { const t = (sueloY - o.y) / d.y; return { tipo: 'suelo', punto: o.clone().addScaledVector(d, t), dist: t }; }
      return null;
    }
    if (accion === 'alinear') {
      const h = r.intersectObjects(grupoPlanos.children.filter(o => o.isMesh && o.userData.plano?.vertical), false)[0];
      return h ? { tipo: 'plano', punto: h.point, dist: h.distance, plano: h.object.userData.plano } : null;
    }
    // muebles y elementos (a tamaño real, a menos de 5 m para no elegir a través de media casa)
    const lejos = maq.activa ? Infinity : 5;
    const hp = r.intersectObjects(app.picks, false).find(h => h.distance < lejos && selDe(h.object.userData));
    if (hp) return { tipo: 'pick', punto: hp.point, dist: hp.distance, sel: selDe(hp.object.userData) };
    // RV a tamaño real: arco de teletransporte; RM y maqueta: rayo recto al suelo de una estancia
    if (modo === 'vr' && !maq.activa) {
      const hit = trazarArco(c, r); if (!hit) return null;
      const est = estanciaEnLocal(mundo.worldToLocal(hit.clone()));
      return { tipo: 'teleport', punto: hit, dist: hit.distanceTo(r.ray.origin), est, valido: !!est };
    }
    const hs = r.intersectObjects(app.suelos, false)[0];
    if (hs) {
      const est = estanciaEnLocal(mundo.worldToLocal(hs.point.clone()));
      if (est) return { tipo: 'estancia', punto: hs.point, dist: hs.distance, id: est.id };
    }
    return null;
  }

  const pellizcos = new Map(); // mano → { t, p, a } (en maqueta, pellizcar y mantener = agarrar)
  function disparar(c) {
    const a = apuntar(c);
    if (a?.tipo === 'panel') {
      if (a.boton?.id === 'asa') { arrastre = { c, dist: a.dist }; scene.attach(panel); sucio = true; return; }
      if (a.boton?.fn) { try { a.boton.fn(); } catch (err) { registrar('XR: botón', err); } pulso(c); }
      sucio = true; return;
    }
    if (maq.activa && esMano(c) && !accion) {
      pellizcos.set(c, { t: performance.now(), p: c.position.clone(), a });
      maq.agarrar(c); return;
    }
    ejecutar(a, c);
  }
  function soltarGatillo(c) {
    if (arrastre?.c === c) { arrastre = null; sucio = true; }
    const pz = pellizcos.get(c);
    if (pz) {
      pellizcos.delete(c); maq.soltar(c);
      // pellizco corto y quieto = toque: selecciona como el gatillo
      if (performance.now() - pz.t < 300 && c.position.distanceTo(pz.p) < 0.02) ejecutar(pz.a, c);
    }
  }
  function teletransportar(a) {
    const h = cabeza();
    mundo.position.x += h.x - a.punto.x; mundo.position.z += h.z - a.punto.z;
    mundo.updateMatrixWorld();
    if (a.est && a.est.id !== app.casaSel?.estancia) app.seleccionar({ ambito: 'estancia', estancia: a.est.id });
    fijarAncla(a.est?.id);
    nota = a.est ? `Estás en ${a.est.nombre}.` : ''; sucio = true;
  }
  function ejecutar(a, c) {
    if (a?.tipo === 'suelo') {
      // la pared principal de la estancia queda 30 cm detrás del punto, centrada y de frente al usuario
      const id = estXR(), ml = marcoLocal(id); if (!ml) return;
      const n = cabeza().sub(a.punto).setY(0).normalize();
      const dir = new THREE.Vector3(n.z, 0, -n.x);
      const P = ml.O.clone().addScaledVector(ml.dir, ml.m.A / 200);
      ponerMundo(P, a.punto.clone().addScaledVector(n, -0.3).setY(sueloY), ml.dir, dir);
      fijarAncla(id);
      accion = null; sucio = true; return;
    }
    if (a?.tipo === 'plano') { alinearAPared(a.plano); return; }
    if (a?.tipo === 'pick') { app.seleccionar(a.sel); saltarA(a.sel.ambito); if (c) pulso(c, 0.2, 15); return; }
    if (a?.tipo === 'estancia') { app.seleccionar({ ambito: 'estancia', estancia: a.id }); saltarA('estancia'); if (c) pulso(c, 0.2, 15); return; }
    if (a?.tipo === 'teleport') { if (a.valido) { teletransportar(a); if (c) pulso(c, 0.3, 20); } return; }
    if (!accion) app.seleccionar(null);
  }

  // ---------- sticks ----------
  let giroListo = true;
  const botonPrevio = new WeakMap();
  function moverRotarAlrededor(pivote, ang) { const q = yawQ(ang); mundo.position.sub(pivote).applyQuaternion(q).add(pivote); mundo.quaternion.premultiply(q); }
  function sticks(dt) {
    let izq = null, der = null;
    for (const { c } of mandos) { const f = c.userData.fuente; if (!f?.gamepad || f.hand) continue; if (f.handedness === 'left') izq = f.gamepad; else der = f.gamepad; }
    if (!izq && !der) return;
    const h = cabeza(), f = adelante();
    const derecha = new THREE.Vector3().crossVectors(f, UP).normalize();
    const ax = g => [g?.axes?.[2] ?? 0, g?.axes?.[3] ?? 0];
    const [lx, ly] = ax(izq), [rx] = ax(der);
    const zona = v => Math.abs(v) < 0.15 ? 0 : v;
    let movido = false;
    if (maq.activa) {
      // en maqueta el stick derecho gira la maqueta a saltos; no se anda
      if (Math.abs(rx) > 0.7 && giroListo && !maq.animando && !maq.agarrando) { maq.girar(-Math.sign(rx) * Math.PI / 6); giroListo = false; }
    } else if (modo === 'vr') {
      const v = 1.4 * dt;
      if (zona(lx) || zona(ly)) { mundo.position.sub(f.clone().multiplyScalar(-zona(ly) * v).addScaledVector(derecha, zona(lx) * v)); movido = true; }
      if (Math.abs(rx) > 0.7 && giroListo) { moverRotarAlrededor(h, -Math.sign(rx) * Math.PI / 6); giroListo = false; movido = true; }
    } else if (modo === 'ar' && ajustar) {
      const v = 0.35 * dt;
      if (zona(lx) || zona(ly)) { mundo.position.addScaledVector(f, -zona(ly) * v).addScaledVector(derecha, zona(lx) * v); movido = true; }
      if (zona(rx)) {
        // gira alrededor del centro de la pared principal de la estancia anclada
        const ml = marcoLocal(ancla?.id ?? estXR());
        const pivote = ml ? ml.O.clone().addScaledVector(ml.dir, ml.m.A / 200).addScaledVector(ml.n, 0.3).applyMatrix4(mundo.matrixWorld) : h;
        moverRotarAlrededor(pivote, -zona(rx) * dt * 0.5); movido = true;
      }
    }
    if (movido) fijarAncla();
    if (Math.abs(rx) < 0.3) giroListo = true;
    // Y (mando izq.) o B (dcho.): mostrar/ocultar panel
    for (const g of [izq, der]) {
      if (!g) continue;
      const b = !!g.buttons?.[5]?.pressed;
      if (b && !botonPrevio.get(g)) {
        panel.visible = !panel.visible;
        if (panel.visible) {
          sucio = true;
          if (panel.parent === scene && panel.position.distanceTo(h) > 1.5) panelFlotante();
        }
      }
      botonPrevio.set(g, b);
    }
  }

  // ---------- sesión ----------
  // RM: sin «Paredes nuevas» solo se ven los muebles (cocina y contenido de las estancias); con ellas, toda la casa sin techo
  function visibilidadSala() {
    const g = app.salaGrupo; if (!g) return;
    if (maq.activa) return;  // la maqueta gestiona su propia visibilidad cada fotograma
    const ar = modo === 'ar';
    for (const o of g.children) {
      let v = !ar || pielNueva || o.name.startsWith('contenido:');
      if (ar && pielNueva && (o.name === 'techo' || o.name === 'downlight')) v = false;
      o.visible = v;
    }
    sombraSuelo.visible = ar && !pielNueva;
  }

  async function entrar(m) {
    if (renderer.xr.isPresenting || sesion || !navigator.xr) return;
    const opciones = m === 'ar'
      ? { requiredFeatures: ['local-floor'], optionalFeatures: ['plane-detection', 'hit-test', 'anchors', 'hand-tracking'] }
      : { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
    let s = null;
    try {
      // requestSession tiene que llamarse sin esperas previas (activación del usuario)
      s = await navigator.xr.requestSession(m === 'ar' ? 'immersive-ar' : 'immersive-vr', opciones);
      sesion = s;
      s.addEventListener('end', terminar);
      // 'local-floor' casi siempre existe en Quest; si no, 'local' (origen en la cabeza, suelo ~1,6 m abajo)
      let tipo = 'local-floor';
      try { await s.requestReferenceSpace('local-floor'); } catch { tipo = 'local'; }
      sueloY = tipo === 'local' ? -1.6 : 0;
      renderer.xr.setReferenceSpaceType(tipo);
      renderer.xr.setFoveation(1);
      await renderer.xr.setSession(s);
    } catch (err) {
      if (s) { s.removeEventListener('end', terminar); s.end().catch(() => { }); }
      sesion = null; terminar();
      aviso('No se pudo entrar en ' + (m === 'ar' ? 'realidad mixta' : 'realidad virtual') + ': ' + (err?.message || err));
      return;
    }
    modo = m; app.modoXR = m; accion = null; medida = null; nota = ''; ancla = null; paginas.clear();
    const gs = leerGrupos();
    pagina = m === 'ar' ? 'sala' : (gs[0] ? 'g:' + gs[0].id : 'casa');
    luces.ligero = true;
    luces.sol.shadow.mapSize.set(1024, 1024); luces.sol.shadow.map?.dispose(); luces.sol.shadow.map = null;
    // RM: fondo transparente para ver la sala real a través de las cámaras
    scene.background = m === 'ar' ? null : fondo;
    app.salaGrupo?.traverse(o => { if (o.name === 'exterior') o.visible = true; });
    // se empieza dentro de la estancia elegida en el escritorio (o la cocina), mirando a su pared principal
    const id = estXR(), pe = puntoDeEstar(id);
    if (pe) { ponerMundo(pe.P, new THREE.Vector3(0, sueloY, 0), pe.d, new THREE.Vector3(0, 0, -1)); fijarAncla(id); }
    if (id && id !== app.casaSel?.estancia) app.seleccionar({ ambito: 'estancia', estancia: id });
    ajustarSombra(); visibilidadSala(); generacion++;
    panel.visible = true; sucio = true;
    // si en 1,5 s no hay mando izquierdo (manos o un solo mando), el panel flota delante
    setTimeout(() => { if (modo && panel.parent !== mandos.find(({ c }) => c.userData.mano === 'left' && !esMano(c))?.g) panelFlotante(); }, 1500);
    app.aplicarLuz();
  }

  function terminar() {
    sesion = null;
    modo = null; app.modoXR = null; accion = null; arrastre = null; hover = null; ancla = null; pellizcos.clear();
    maq.reset();
    mundo.position.set(0, 0, 0); mundo.rotation.set(0, 0, 0); mundo.scale.setScalar(1);
    scene.background = fondo; panel.visible = false; mostrarPlanos(false); limpiarPlanos();
    sombraSuelo.visible = false;
    luces.ligero = false;
    luces.sol.shadow.mapSize.set(2048, 2048); luces.sol.shadow.map?.dispose(); luces.sol.shadow.map = null;
    visibilidadSala(); actualizarResalte();
    for (const { c } of mandos) { c.userData.punto.visible = false; c.userData.arco.visible = false; c.userData.aro.visible = false; }
    // three deja en la cámara el campo de visión de las gafas: se devuelve el de escritorio
    camera.fov = fovEscritorio; camera.zoom = 1; camera.scale.set(1, 1, 1);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    app.aplicarLuz();
    app.vista('general');
  }

  // un error aquí cortaría el bucle de animación de la sesión y dejaría las gafas congeladas:
  // se registra (una vez por mensaje) y se sigue con el siguiente fotograma
  function porFrame(frame, dt) {
    if (!modo) return;
    try { paso(frame, dt); } catch (err) { registrar('XR: error en el fotograma', err); }
  }
  let estPrevia = null;
  function paso(frame, dt) {
    if (modo === 'ar') actualizarPlanos(frame);
    sticks(dt);
    maq.porFrame(dt, modo);
    if (maq.activa && pagina === 'vista') { const e = Math.round(1 / maq.escala); if (e !== escalaMostrada) { escalaMostrada = e; sucio = true; } }
    if (app.casaSel?.estancia !== estPrevia) { estPrevia = app.casaSel?.estancia; sucio = true; }
    actualizarResalte();
    if (arrastre) {
      const r = rayoDe(arrastre.c);
      panel.position.copy(r.ray.origin).addScaledVector(r.ray.direction, arrastre.dist);
      panel.lookAt(cabeza());
    }
    scene.updateMatrixWorld();
    let nuevoHover = null;
    for (const { c } of mandos) {
      const u = c.userData;
      if (!u.fuente) { u.punto.visible = false; u.arco.visible = false; u.aro.visible = false; continue; }
      const a = apuntar(c);
      const enArco = a?.tipo === 'teleport';
      u.arco.visible = enArco; u.aro.visible = enArco; u.linea.visible = !enArco;
      if (enArco) {
        u.arco.material = a.valido ? matArco : matArcoMal;
        u.aro.position.copy(a.punto).setY(sueloY + 0.01); u.aro.material.opacity = a.valido ? 0.85 : 0.3;
      }
      u.linea.scale.z = a && !enArco ? Math.max(0.01, a.dist) : 3;
      u.punto.visible = !!a && !enArco; if (a) u.punto.position.copy(a.punto);
      if (a?.tipo === 'panel' && a.boton) nuevoHover = a.boton.id;
    }
    if (nuevoHover !== hover) { hover = nuevoHover; sucio = true; }
    if (sucio && panel.visible) dibujar();
  }

  // depuración / pruebas con el emulador
  app.xr = {
    get modo() { return modo; }, get pagina() { return pagina; }, set pagina(p) { pagina = p; sucio = true; },
    get ancla() { return ancla; }, get botones() { return botones.map(b => b.texto ?? b.id); },
    // pulsa un botón del panel por su texto o id, como si se apuntase y se diese al gatillo
    pulsar(t) { if (sucio) dibujar(); const b = botones.find(q => q.texto === t || q.id === t); if (!b?.fn) return false; b.fn(); sucio = true; dibujar(); return true; },
    irA, teletransportar: (puntoMundo) => teletransportar({ punto: puntoMundo, est: estanciaEnLocal(mundo.worldToLocal(puntoMundo.clone())) }),
    elegir: (a) => ejecutar(a), apuntar: i => apuntar(mandos[i].c),
    maqueta: maq, verMaqueta, panel, mandos: mandos.map(m => m.c), lienzo,
  };

  return {
    porFrame,
    refrescar() { sucio = true; },
    alReconstruir() { generacion++; ajustarSombra(); if (modo) { aplicarAncla(); visibilidadSala(); } sucio = true; },
  };
}
