// Luces de la vivienda (sol por todas las ventanas, cielo por la ventana de la cocina, focos por estancia) y el
// material de las copias de sombra. La geometría de paredes, suelos y techos está en casa/construir-casa.js.
import * as THREE from 'three';

// invisible en color y profundidad, pero sí entra en el mapa de sombras
export const matSombra = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false });

export const MAX_FOCOS = 8;

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
    // reserva fija de focos: siempre las mismas 8 luces (no recompila sombreadores); se mueven a los más cercanos
    this.focos = Array.from({ length: MAX_FOCOS }, () => { const l = new THREE.PointLight('#ffe9cf', 0, 6, 2); scene.add(l); return l; });
    this.puntos = []; this.ledes = []; this.encendidos = false;
  }

  // info: { focos: [Vector3] en coords de `padre`, ventana: {centro,n,dir,ancho,alto} | null, cx, cz, R }
  montar(info, ledes, padre) {
    for (const l of this.ledes) l.parent?.remove(l);
    this.puntos = info.focos;
    this.ledes = ledes.map(d => {
      const largo = d.x1 - d.x0;
      const r = new THREE.RectAreaLight('#ffe7c4', 0, largo, 0.05);
      const p = new THREE.Vector3((d.x0 + d.x1) / 2, d.y, d.z).applyMatrix4(d.R);
      r.position.copy(p);
      r.up.set(d.n[0], 0, d.n[1]);
      r.lookAt(p.x, p.y - 1, p.z);
      padre.add(r); return r;
    });
    this.sala = info;
    this.cerca = null;
  }

  // Coloca la reserva de focos en los puntos más cercanos a `p` (coords del padre). Barato: llamar unas veces por segundo.
  actualizarFocos(p) {
    const orden = this.puntos.map((q, i) => [q.distanceToSquared(p), i]).sort((a, b) => a[0] - b[0]).slice(0, MAX_FOCOS);
    const clave = orden.map(o => o[1]).join(',');
    if (clave !== this.cerca) {
      this.cerca = clave;
      this.focos.forEach((l, i) => { const o = orden[i]; if (o) l.position.copy(this.puntos[o[1]]); });
    }
    this.focos.forEach((l, i) => { l.intensity = this.encendidos && orden[i] ? 9 : 0; });
  }

  // hora 0-24 → sol, cielo, focos
  aplicar(e, mundo, matsExterior, ar = false) {
    const s = this.sala; if (!s) return;
    const h = e.luz.hora;
    const d = Math.max(0, Math.sin(Math.PI * (h - 7) / 14));
    const dia = Math.pow(d, 0.6);
    const el = THREE.MathUtils.degToRad(8 + 50 * d), az = THREE.MathUtils.degToRad(((h - 14) / 7) * 60);
    const { cx, cz } = s;
    const vi = s.ventana;
    // dirección del sol: entra por la ventana principal (la de la cocina si la hay); el resto de ventanas
    // reciben el mismo sol y sus tabiques (copias de sombra) recortan la luz que entra por cada una
    const n = vi ? vi.n.clone() : new THREE.Vector3(0, 0, 1);
    const t = vi ? vi.dir.clone() : new THREE.Vector3(1, 0, 0);
    const haciaSol = n.clone().multiplyScalar(-Math.cos(el) * Math.cos(az)).add(t.multiplyScalar(Math.cos(el) * Math.sin(az))).add(new THREE.Vector3(0, Math.sin(el), 0)).normalize();
    const objetivo = new THREE.Vector3(cx, 0.8, cz);
    this.sol.target.position.copy(objetivo);
    const R = s.R + 0.5;
    this.sol.position.copy(objetivo).addScaledVector(haciaSol, R + 8);
    const tibio = new THREE.Color('#ffb46b'), blanco = new THREE.Color('#fff4e6');
    this.sol.color.copy(tibio).lerp(blanco, Math.min(1, d * 1.4));
    this.sol.intensity = d > 0.02 ? 4.2 * dia : 0;
    const cam = this.sol.shadow.camera; cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = 2 * R + 12; cam.updateProjectionMatrix();
    if (mundo) { this.sol.target.updateMatrixWorld(); }
    // luz de cielo que entra por la ventana principal
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
    this.encendidos = techo;
    for (const f of this.focos) if (!techo) f.intensity = 0;
    for (const l of this.ledes) l.intensity = e.luz.led && !this.ligero ? 14 : 0;
    if (matsExterior) {
      const k = 0.08 + 1.0 * dia;
      matsExterior.color.setRGB(k * (noche ? 0.5 : 1), k * (noche ? 0.6 : 1), k * (noche ? 1.2 : 1));
    }
    return { d, techo };
  }
}
