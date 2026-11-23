// Modo maqueta (RV y RM): la cocina entera a escala 1:20 sobre una mesa, como una casa de muñecas.
// Se agarra con el botón lateral (squeeze) o, con las manos, pellizcando y manteniendo:
//   una mano = mover y girar; dos manos = escalar (distancia entre manos) y girar alrededor del punto medio.
// Todo se hace transformando el grupo `mundo` (posición, giro en Y y escala uniforme).
import * as THREE from 'three';

export const ESCALA_MIN = 1 / 50, ESCALA_MAX = 1, ESCALA_MAQUETA = 1 / 20;
const DENOMINADORES = [50, 33, 25, 20, 15, 10, 5, 2, 1];
const UP = new THREE.Vector3(0, 1, 0);
const suave = t => t * t * (3 - 2 * t);
const yawQ = a => new THREE.Quaternion().setFromAxisAngle(UP, a);
// ángulo en el plano XZ con el mismo convenio que un giro en Y de three.js
const angXZ = v => Math.atan2(-v.z, v.x);

export function crearMaqueta({ app, scene, camera, mundo, luces, sombraSuelo, sueloY, mesas, alSalir }) {
  let activa = false;
  let escalaMaqueta = ESCALA_MAQUETA;   // la última escala de maqueta usada (para volver a ella)
  let anim = null;
  const agarres = new Map();            // mando → true
  let base = null;                      // estado al empezar a agarrar
  let compensada = false;               // luces compensadas por escala

  // ---------- peana y suelo para RV (en RM la mesa es la real) ----------
  const matPeana = new THREE.MeshStandardMaterial({ color: '#cfc7bb', roughness: 0.85 });
  const geoPeana = new THREE.BoxGeometry(1, 1, 1); geoPeana.translate(0, -0.5, 0);
  const peana = new THREE.Mesh(geoPeana, matPeana);
  peana.receiveShadow = true; peana.visible = false; peana.name = 'peanaMaqueta';
  const sueloRV = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48), new THREE.MeshStandardMaterial({ color: '#bfb9b0', roughness: 1 }));
  sueloRV.rotation.x = -Math.PI / 2; sueloRV.receiveShadow = true; sueloRV.visible = false; sueloRV.name = 'sueloMaqueta';
  scene.add(peana, sueloRV);

  const cabeza = () => camera.getWorldPosition(new THREE.Vector3());
  const adelante = () => {
    const f = camera.getWorldDirection(new THREE.Vector3()).setY(0);
    return f.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, -1) : f.normalize();
  };
  const centroLocal = () => { const { W, D } = app.dims; return new THREE.Vector3(W / 2, 0, D / 2); };
  const aMundo = P => P.clone().multiplyScalar(mundo.scale.x).applyQuaternion(mundo.quaternion).add(mundo.position);

  // coloca `mundo` para que el punto local P quede en Pw con giro q y escala s
  function poner(P, Pw, q, s) {
    mundo.quaternion.copy(q); mundo.scale.setScalar(s);
    mundo.position.copy(P).multiplyScalar(s).applyQuaternion(q).negate().add(Pw);
  }

  // transición suave: P (local) viaja en línea recta de donde está a Pw1; escala en logarítmico
  function animar(P, Pw1, q1, s1, dur = 1, fin = null) {
    agarres.clear(); base = null;
    anim = { t: 0, dur, P: P.clone(), Pw0: aMundo(P), Pw1: Pw1.clone(), q0: mundo.quaternion.clone(), q1: q1.clone(), s0: mundo.scale.x, s1, fin };
  }
  function pasoAnim(dt) {
    const a = anim;
    a.t = Math.min(1, a.t + dt / a.dur);
    const k = suave(a.t);
    const s = Math.exp(THREE.MathUtils.lerp(Math.log(a.s0), Math.log(a.s1), k));
    const q = new THREE.Quaternion().slerpQuaternions(a.q0, a.q1, k);
    poner(a.P, new THREE.Vector3().lerpVectors(a.Pw0, a.Pw1, k), q, s);
    if (a.t >= 1) { anim = null; a.fin?.(); }
  }

  // dónde va la maqueta: una mesa detectada (0,5–1,1 m) o 0,9 m delante del usuario
  function destino() {
    const h = cabeza(), f = adelante(), y0 = sueloY();
    let T = null, mesa = null;
    for (const m of mesas()) {
      const alto = m.centro.y - y0;
      if (alto < 0.5 || alto > 1.1) continue;
      const v = m.centro.clone().sub(h).setY(0), d = v.length();
      if (d > 2.5) continue;
      // se prefiere la mesa que el usuario tiene delante: una a la espalda penaliza 2 m
      const coste = d + (v.dot(f) < 0 ? 2 : 0);
      if (!mesa || coste < mesa.coste) mesa = { ...m, coste };
    }
    if (mesa) T = mesa.centro.clone().setY(mesa.centro.y + 0.003);
    else { T = h.clone().addScaledVector(f, 0.9); T.y = THREE.MathUtils.clamp(h.y - 0.7, y0 + 0.6, y0 + 1.0); }
    const u = h.clone().sub(T).setY(0); if (u.lengthSq() < 1e-6) u.copy(f).negate(); u.normalize();
    // la pared A al fondo y el lado abierto (+z local) hacia el usuario
    return { T, q: yawQ(Math.atan2(u.x, u.z)), enMesa: !!mesa };
  }

  function entrar() {
    const { T, q, enMesa } = destino();
    activa = true;
    // el suelo de la maqueta tiene 2 cm de grosor por debajo de y=0: se sube para que apoye
    const s = escalaMaqueta;
    animar(centroLocal(), T.clone().setY(T.y + 0.02 * s), q, s, 1.1);
    return enMesa;
  }

  // vuelta a 1:1 dentro de la cocina, mirando a la pared A
  function tamanoReal() {
    if (!activa) return;
    if (!anim) escalaMaqueta = THREE.MathUtils.clamp(mundo.scale.x, ESCALA_MIN, 0.2);
    const { W, D } = app.dims;
    const P = new THREE.Vector3(W / 2, 0, Math.min(THREE.MathUtils.clamp(D - 0.6, 1.2, 2.2), D - 0.3));
    const h = cabeza(), f = adelante();
    animar(P, new THREE.Vector3(h.x, sueloY(), h.z), yawQ(Math.atan2(-f.x, -f.z)), 1, 1.2, () => { activa = false; restaurar(); });
  }

  // salida inmediata (al terminar la sesión o antes de colocar/alinear)
  function reset() {
    anim = null; agarres.clear(); base = null;
    if (activa) { activa = false; mundo.scale.setScalar(1); }
    restaurar();
  }

  function restaurar() {
    mundo.scale.setScalar(1);
    compensarLuces(1); compensada = false;
    peana.visible = false; sueloRV.visible = false;
    sombraSuelo.position.y = 0.002;
    for (const ex of exteriores) ex.visible = true;
    alSalir?.();
  }

  // escala con los botones del panel, alrededor del centro de la cocina
  function pasoEscala(d) {
    if (!activa) return;
    const den = 1 / mundo.scale.x;
    // d > 0 amplía (denominador menor), d < 0 reduce
    const cand = d > 0 ? DENOMINADORES.filter(n => n < den - 0.5) : DENOMINADORES.filter(n => n > den + 0.5);
    if (!cand.length) return;
    const n = d > 0 ? Math.max(...cand) : Math.min(...cand);
    const C = centroLocal();
    // alrededor del centro de la cocina, que no se mueve
    animar(C, aMundo(C), mundo.quaternion, 1 / n, 0.35);
  }
  function girar(ang) {
    if (!activa) return;
    const C = centroLocal();
    animar(C, aMundo(C), yawQ(ang).multiply(mundo.quaternion), mundo.scale.x, 0.35);
  }

  // ---------- agarrar ----------
  function yawMando(c) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion).setY(0);
    return f.lengthSq() < 0.09 ? null : Math.atan2(-f.x, -f.z);
  }
  function reiniciarAgarre() {
    const cs = [...agarres.keys()];
    if (!cs.length) { base = null; return; }
    base = { pos: mundo.position.clone(), q: mundo.quaternion.clone(), s: mundo.scale.x };
    if (cs.length === 1) { base.h = cs[0].position.clone(); base.yaw = yawMando(cs[0]); }
    else {
      const [a, b] = cs;
      base.mid = a.position.clone().add(b.position).multiplyScalar(0.5);
      base.d = Math.max(0.02, a.position.distanceTo(b.position));
      base.ang = angXZ(b.position.clone().sub(a.position));
    }
  }
  function agarrar(c) {
    if (!activa || anim) return false;
    agarres.set(c, true);
    while (agarres.size > 2) agarres.delete(agarres.keys().next().value);
    reiniciarAgarre(); return true;
  }
  function soltar(c) { if (agarres.delete(c)) reiniciarAgarre(); }

  function pasoAgarre() {
    const cs = [...agarres.keys()];
    if (!base || !cs.length) return;
    if (cs.length === 1) {
      const c = cs[0], y = yawMando(c);
      const dy = base.yaw === null || y === null ? 0 : y - base.yaw;
      const q = yawQ(dy);
      mundo.position.copy(base.pos).sub(base.h).applyQuaternion(q).add(c.position);
      mundo.quaternion.copy(q).multiply(base.q);
      return;
    }
    const [a, b] = cs;
    const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
    const d = a.position.distanceTo(b.position);
    const s = THREE.MathUtils.clamp(base.s * d / base.d, ESCALA_MIN, ESCALA_MAX);
    const k = s / base.s;
    const q = yawQ(angXZ(b.position.clone().sub(a.position)) - base.ang);
    mundo.position.copy(base.pos).sub(base.mid).multiplyScalar(k).applyQuaternion(q).add(mid);
    mundo.quaternion.copy(q).multiply(base.q);
    mundo.scale.setScalar(s);
  }

  // ---------- luces: que sigan viéndose igual al escalar ----------
  // PointLight con caída física (decay 2): la irradiancia va con 1/d², así que se multiplica por s².
  // RectAreaLight: three ignora la escala del padre en width/height; se escalan a mano (la luminancia no cambia).
  // Sombra del sol: la cámara de sombras está en metros del mundo; se escala su volumen y el normalBias.
  const registro = new WeakMap();
  function ajustar(obj, props) {
    let u = registro.get(obj);   // WeakMap: LightShadow no tiene userData
    if (!u) registro.set(obj, u = { base: {}, puesto: {} });
    for (const [p, f] of props) {
      if (obj[p] !== u.puesto[p]) u.base[p] = obj[p];   // alguien (aplicarLuz, montar) lo cambió: nueva base
      obj[p] = u.base[p] * f;
      u.puesto[p] = obj[p];
    }
  }
  function compensarLuces(s) {
    for (const l of luces.focos) ajustar(l, [['intensity', s * s], ['distance', s]]);
    for (const l of [...luces.ledes, luces.cielo]) ajustar(l, [['width', s], ['height', s]]);
    const cam = luces.sol.shadow.camera;
    ajustar(cam, [['left', s], ['right', s], ['top', s], ['bottom', s], ['near', s], ['far', s]]);
    cam.updateProjectionMatrix();
    ajustar(luces.sol.shadow, [['normalBias', s]]);
  }

  // ---------- casa de muñecas ----------
  let cacheSala = null, exteriores = [];
  function casaMunecas() {
    const g = app.salaGrupo; if (!g) return;
    if (cacheSala !== g) { cacheSala = g; exteriores = []; g.traverse(o => { if (o.name === 'exterior') exteriores.push(o); }); }
    const cam = mundo.worldToLocal(cabeza());
    const v = new THREE.Vector3();
    for (const o of g.children) {
      if (o.name === 'techo') o.visible = false;
      else if (o.userData?.n && o.userData?.punto) o.visible = v.copy(cam).sub(o.userData.punto).dot(o.userData.n) > -0.05;
      else o.visible = true;
    }
    for (const ex of exteriores) ex.visible = false;
  }

  function porFrame(dt, modo) {
    if (!activa) return;
    if (anim) { pasoAnim(dt); if (!activa) return; } else pasoAgarre();
    mundo.updateMatrixWorld();
    const s = mundo.scale.x;
    compensarLuces(s); compensada = true;
    casaMunecas();
    // sombras sobre la mesa real (RM): plano ShadowMaterial justo bajo el suelo de la maqueta
    sombraSuelo.visible = modo === 'ar';
    sombraSuelo.position.y = -0.021;
    // RV: peana bajo la maqueta y un suelo de referencia
    const C = aMundo(centroLocal());
    const { W, D } = app.dims;
    const arriba = C.y - 0.02 * s, alto = arriba - sueloY();
    peana.visible = modo === 'vr' && alto > 0.05 && s < 0.5;
    if (peana.visible) {
      peana.position.set(C.x, arriba, C.z); peana.quaternion.copy(mundo.quaternion);
      peana.scale.set((W + 0.5) * s + 0.08, alto, (D + 0.5) * s + 0.08);
    }
    sueloRV.visible = modo === 'vr' && s < 0.5;
    sueloRV.position.set(C.x, sueloY() + 0.001, C.z);
  }

  return {
    get activa() { return activa; },
    get animando() { return !!anim; },
    get agarrando() { return agarres.size > 0; },
    get escala() { return mundo.scale.x; },
    get compensada() { return compensada; },
    entrar, tamanoReal, reset, pasoEscala, girar, agarrar, soltar, porFrame,
  };
}
