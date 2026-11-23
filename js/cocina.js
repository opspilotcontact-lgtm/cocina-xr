// Construye la cocina 3D a partir del modelo: cascos, frentes, tiradores, encimera con huecos, fregadero,
// placa, campanas, electrodomésticos, frontal, zócalo y LED. Todo con medidas reales.
// Pensada para verse bien en las gafas, donde no hay oclusión ambiental ni postproceso: el oscurecimiento de contacto
// va horneado en piezas planas («contacto»), las holguras entre puertas tienen fondo oscuro («holgura») y la decoración
// comparte una sola textura de paleta («deco»). Todo se fusiona por material: pocas mallas.
import * as THREE from 'three';
import { M, COLUMNAS, tramosDe } from './modelo.js';
import { Lote, matrizTramo, tronco, RoundedBoxGeometry } from './geo.js';
import { CELDAS_DECO } from './texturas.js';

const GAP = 0.003;
const DECORATIVAS = new Set(['piramidal', 'plana', 'inclinada']);
const ALTO_CON_CASCO = new Set(['puertas', 'abatible', 'vitrina', 'microondas']);

// Distancia entre tornillos de los tiradores de barra según el ancho del frente (medidas de catálogo).
const ccPor = a => a < 0.3 ? 0.128 : a < 0.45 ? 0.16 : a < 0.6 ? 0.192 : 0.32;

// Cuadrilátero suelto con UV propias: o = origen, a = largo, b = ancho; uv para o, o+a, o+a+b, o+b.
function quad(o, a, b, uv) {
  const p = [o, o.clone().add(a), o.clone().add(a).add(b), o.clone().add(b)];
  const pos = new Float32Array(18), uvs = new Float32Array(12);
  [0, 1, 2, 0, 2, 3].forEach((k, i) => { pos.set([p[k].x, p[k].y, p[k].z], i * 3); uvs.set(uv[k], i * 2); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Lleva las UV (0..1) de una geometría a una celda del atlas de la decoración (8 x 8).
function celda(g, nombre) {
  const i = CELDAS_DECO[nombre] ?? 0, c = i % 8, r = (i / 8) | 0;
  const uv = g.attributes.uv;
  const cl = x => Math.max(0, Math.min(1, x));
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + 0.15 + 0.7 * cl(uv.getX(k))) / 8, 1 - (r + 1) / 8 + (0.15 + 0.7 * cl(uv.getY(k))) / 8);
  return g;
}

// Perfil de gola en J (bajo la encimera) y en C (entre cajones), en el plano (z, y) y extruido a lo largo de x.
function perfilJ() {
  const t = 0.0015, s = new THREE.Shape();
  s.moveTo(0.024, 0.035); s.lineTo(0, 0.035); s.lineTo(0, 0.008); s.quadraticCurveTo(0, 0, 0.008, 0); s.lineTo(0.017, 0);
  s.quadraticCurveTo(0.025, 0, 0.025, 0.008); s.lineTo(0.025, 0.013); s.lineTo(0.025 - t, 0.013); s.lineTo(0.025 - t, 0.008);
  s.quadraticCurveTo(0.025 - t, t, 0.017, t); s.lineTo(0.008, t); s.quadraticCurveTo(t, t, t, 0.008); s.lineTo(t, 0.035 - t); s.lineTo(0.024, 0.035 - t);
  s.closePath();
  return s;
}
function perfilC(h, d) {
  const t = 0.0015, s = new THREE.Shape();
  s.moveTo(d, 0); s.lineTo(0, 0); s.lineTo(0, h); s.lineTo(d, h); s.lineTo(d, h - t); s.lineTo(t, h - t); s.lineTo(t, t); s.lineTo(d, t); s.closePath();
  return s;
}
function extruirPerfil(forma, x, y, z, w) {
  const g = new THREE.ExtrudeGeometry(forma, { depth: w, bevelEnabled: false, curveSegments: 4 });
  g.rotateY(-Math.PI / 2); g.translate(x + w, y, z);
  return g;
}

export function construirCocina(e) {
  const L = new Lote();
  const picks = [];
  const ledes = [];
  const est = e.estilo;
  const gola = est.tirador === 'unero';
  const v = e.ventana;
  const H = e.sala.alto / 100;
  const frigoLibre = est.frigo !== 'integrado';
  const zf = M.fondoB, za = M.fondoA, ya = M.altoY, ha = M.altoH;
  const hF = M.casco - (gola ? 0.035 : 0);
  const fz = est.frontal === 'pintura' ? 0 : est.frontal === 'encimera' ? 0.012 : 0.008; // cara del frontal
  const decorar = est.decoracion !== false;
  const zonas = [];      // tramos de encimera libres para la decoración
  const huecosLibres = []; // módulos «hueco» (taburetes)
  let barraHorno = null; // primera barra de horno (paño)

  // ---------- oscurecimiento de contacto horneado ----------
  // Franja: o origen sobre la línea de contacto, a = largo, b = hacia donde se aclara. k0 = intensidad de salida
  // (0 = la más oscura, 1 = nada). ext > 0 funde los extremos en ese largo (m).
  const V3 = a => new THREE.Vector3(a[0], a[1], a[2]);
  const sombra = (o, a, b, k0 = 0, ext = 0) => {
    const O = V3(o), A = V3(a), B = V3(b), largo = A.length();
    if (largo < 0.005 || B.length() < 0.005) return;
    const trozo = (o2, a2, u0, u1) => L.add(quad(o2, a2, B, [[u0, k0], [u1, k0], [u1, 1], [u0, 1]]), 'contacto', { uvPropias: true, sinSombra: true });
    if (ext > 0 && largo > 2 * ext + 0.01) {
      const d = A.clone().normalize(), aE = d.clone().multiplyScalar(ext);
      trozo(O, aE, 0, 0.094);
      trozo(O.clone().add(aE), d.clone().multiplyScalar(largo - 2 * ext), 0.25, 0.25);
      trozo(O.clone().add(A).sub(aE), aE, 0.406, 0.5);
    } else trozo(O, A, 0.25, 0.25);
  };
  // Mancha redonda horizontal (bajo objetos sueltos)
  const mancha = (cx, y, cz, rx, rz = rx) => L.add(quad(new THREE.Vector3(cx - rx, y, cz - rz), new THREE.Vector3(2 * rx, 0, 0), new THREE.Vector3(0, 0, 2 * rz), [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]), 'contacto', { uvPropias: true, sinSombra: true });
  // Fondo oscuro detrás de un frente (solo se ve por las holguras)
  const fondo = (x, y, w, h, z) => { if (w > 0 && h > 0) L.add(quad(new THREE.Vector3(x, y, z + 0.0003), new THREE.Vector3(w, 0, 0), new THREE.Vector3(0, h, 0), [[0, 0], [1, 0], [1, 1], [0, 1]]), 'holgura', { uvPropias: true, sinSombra: true }); };

  // ---------- piezas ----------
  // cc = distancia entre tornillos; la barra sobresale 14 mm por cada lado
  const tirador = (x, y, z, orient, cc) => {
    if (est.tirador === 'unero' || est.tirador === 'sin') return;
    if (est.tirador === 'pomo') { L.cilindro('tirador', x, y, z + 0.014, 0.012, 0.028, 'z', 20); return; }
    const sep = 0.028, r = 0.0055, largo = cc + 0.028;
    if (orient === 'v') {
      L.cilindro('tirador', x, y, z + sep, r, largo, 'y', 14);
      for (const d of [-1, 1]) L.cilindro('tirador', x, y + d * cc / 2, z + sep / 2, 0.0042, sep, 'z', 10);
    } else {
      L.cilindro('tirador', x, y, z + sep, r, largo, 'x', 14);
      for (const d of [-1, 1]) L.cilindro('tirador', x + d * cc / 2, y, z + sep / 2, 0.0042, sep, 'z', 10);
    }
  };

  const puertas = (mat, x0, y0, w, h, z, n, pos, abre = 'der') => {
    const dw = w / n;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * dw;
      L.panel(mat, x + GAP / 2, y0 + GAP / 2, z, dw - GAP, h - GAP);
      const lado = n === 1 ? abre : (k === 0 ? 'der' : 'izq');
      const hx = lado === 'der' ? x + dw - 0.042 : x + 0.042;
      const cc = h > 1.0 ? 0.32 : Math.min(0.192, ccPor(dw), h * 0.45);
      const largo = cc + 0.028;
      const hy = pos === 'arriba' ? y0 + h - 0.05 - largo / 2 : pos === 'abajo' ? y0 + 0.05 + largo / 2 : y0 + h / 2;
      tirador(hx, est.tirador === 'pomo' ? (pos === 'abajo' ? y0 + 0.05 : y0 + h - 0.05) : hy, z + 0.018, 'v', cc);
    }
  };

  const cajones = (mat, x0, y0, w, h, z, fr) => {
    let y = y0 + h;
    fr.forEach((f, k) => {
      const hh = M.casco * f - (k === 0 && gola ? 0.035 : 0);
      y -= hh;
      const hg = gola && k > 0 ? 0.03 : 0;
      L.panel(mat, x0 + GAP / 2, y + GAP / 2, z, w - GAP, hh - GAP - hg);
      if (hg) L.add(extruirPerfil(perfilC(hg, 0.012), x0, y + hh - hg, z + 0.001, w), 'gola');
      tirador(x0 + w / 2, y + hh - hg - (hh > 0.22 ? 0.055 : (hh - hg) / 2), z + 0.018, 'h', ccPor(w));
    });
  };

  const tiradorElectro = (x, y, z, largo, eje) => {
    L.cilindro('inox', x, y, z + 0.035, 0.0075, largo, eje, 14);
    for (const d of [-1, 1]) {
      if (eje === 'x') L.cilindro('inox', x + d * (largo / 2 - 0.03), y, z + 0.0175, 0.005, 0.035, 'z', 10);
      else L.cilindro('inox', x, y + d * (largo / 2 - 0.03), z + 0.0175, 0.005, 0.035, 'z', 10);
    }
  };

  // mando giratorio: arandela, cuerpo troncocónico, aleta de agarre y marca
  const mando = (x, y, z, mat) => {
    L.cilindro(mat, x, y, z + 0.0015, 0.021, 0.003, 'z', 28);
    const g = new THREE.CylinderGeometry(0.0165, 0.0185, 0.02, 28); g.rotateX(Math.PI / 2); g.translate(x, y, z + 0.013); L.add(g, mat);
    L.panel(mat, x - 0.0035, y - 0.0135, z + 0.022, 0.007, 0.027, 0.008, 0.002);
    L.caja('blancoElectro', x - 0.0007, y + 0.005, z + 0.0301, 0.0014, 0.008, 0.0006, { sinSombra: true });
  };

  const horno = (x, y, w, z, h = 0.595) => {
    const banda = est.horno === 'inox' ? 'inox' : 'cristalNegro';
    fondo(x, y, w, h, z);
    L.panel(banda, x + 0.003, y + h - 0.092, z, w - 0.006, 0.089, 0.022, 0.002);
    for (const dx of [0.075, w - 0.075]) mando(x + dx, y + h - 0.046, z + 0.022, est.horno === 'inox' ? 'inox' : 'negroMetal');
    L.caja('pantalla', x + w / 2 - 0.045, y + h - 0.058, z + 0.0225, 0.09, 0.024, 0.001, { sinSombra: true });
    L.panel('cristalNegro', x + 0.003, y + 0.003, z, w - 0.006, h - 0.097, 0.024, 0.002);
    tiradorElectro(x + w / 2, y + h - 0.13, z + 0.024, w - 0.14, 'x');
    return { x: x + w / 2, y: y + h - 0.13, z: z + 0.024 + 0.035, largo: w - 0.14 };
  };

  const micro = (x, y, w, z, h = 0.38) => {
    const marco = est.horno === 'inox' ? 'inox' : 'cristalNegro';
    fondo(x, y, w, h, z);
    L.panel(marco, x + 0.003, y + 0.003, z, w - 0.006, h - 0.006, 0.02, 0.002);
    L.panel('cristalNegro', x + 0.035, y + 0.045, z + 0.02, (w - 0.006) * 0.64, h - 0.09, 0.004, 0.001);
    L.caja('pantalla', x + w * 0.76, y + h - 0.1, z + 0.0205, 0.07, 0.02, 0.001, { sinSombra: true });
    mando(x + w * 0.8, y + h * 0.42, z + 0.02, est.horno === 'inox' ? 'inox' : 'negroMetal');
  };

  // ---------- tramos ----------
  for (const t of tramosDe(e)) {
    const R = matrizTramo(t.a, t.dir);
    L.usar(R);
    const sl = []; let s = t.ini;
    t.mods.forEach((m, i) => { const w = m.ancho / 100; sl.push({ m, i, s, w, col: COLUMNAS.has(m.bajo) }); s += w; });
    const fin = s;
    const ultimo = sl.length - 1;

    // ventana en esta pared (m)
    const vent = (v.activa && v.pared === t.id) ? { x0: v.x / 100, x1: (v.x + v.ancho) / 100, sill: v.antepecho / 100, top: (v.antepecho + v.alto) / 100 } : null;

    for (const { m, i, s: x, w, col } of sl) {
      const enEsqIzq = m.bajo === 'rincon' && i === 0 && t.esqIni;
      const enEsqDer = m.bajo === 'rincon' && i === ultimo && t.esqFin;

      // ---------- abajo ----------
      if (!col) {
        const conCasco = !['lavadora', 'hueco'].includes(m.bajo);
        const conGola = gola && conCasco && m.bajo !== 'regleta';
        if (conCasco) {
          // bajo el fregadero el casco es más bajo: si no, su tapa blanca tapa la cubeta
          const hCasco = m.bajo === 'fregadero' ? M.casco - 0.22 : M.casco;
          if (conGola) {
            // el casco se retranquea arriba para que la gola en J tenga fondo de verdad
            L.caja('casco', x, M.zoc, 0, w, Math.min(hCasco, M.casco - 0.035), zf);
            if (m.bajo !== 'fregadero') L.caja('casco', x, M.topBajo - 0.035, 0, w, 0.035, zf - 0.025);
            L.add(extruirPerfil(perfilJ(), x, M.topBajo - 0.035, zf - 0.025, w), 'gola');
          } else L.caja('casco', x, M.zoc, 0, w, hCasco, zf);
          // fondo oscuro de todo el frente (el horno pone el suyo)
          if (m.bajo !== 'horno' && m.bajo !== 'regleta') fondo(x, M.zoc, w, hF, zf);
        }
        switch (m.bajo) {
          case 'puertas': puertas('frenteBajo', x, M.zoc, w, hF, zf, w > 0.6 ? 2 : 1, 'arriba', i === 0 ? 'der' : 'izq'); break;
          case 'fregadero': puertas('frenteBajo', x, M.zoc, w, hF, zf, w > 0.6 ? 2 : 1, 'arriba'); break;
          case 'cajonero': case 'placa': cajones('frenteBajo', x, M.zoc, w, hF, zf, [0.25, 0.25, 0.5]); break;
          case 'horno': {
            const top = M.topBajo - (gola ? 0.035 : 0);
            const b = horno(x, top - 0.595, w, zf);
            if (!barraHorno) barraHorno = { R, ...b };
            const hc = top - 0.6 - M.zoc;
            if (hc > 0.03) { fondo(x, M.zoc, w, hc, zf); L.panel('frenteBajo', x + GAP / 2, M.zoc + GAP / 2, zf, w - GAP, hc - GAP); tirador(x + w / 2, M.zoc + hc / 2, zf + 0.018, 'h', ccPor(w)); }
            break;
          }
          case 'lavavajillas':
            L.panel('frenteBajo', x + GAP / 2, M.zoc + GAP / 2, zf, w - GAP, hF - GAP);
            tirador(x + w / 2, M.zoc + hF - 0.055, zf + 0.018, 'h', ccPor(w));
            break;
          case 'lavadora': {
            L.panel('blancoElectro', x + 0.006, 0.01, 0.02, w - 0.012, M.topBajo - 0.025, 0.565, 0.012);
            const cx = x + w / 2, cy = 0.42;
            const toro = new THREE.TorusGeometry(0.165, 0.022, 12, 40); toro.translate(cx, cy, 0.588); L.add(toro, 'cromo');
            L.cilindro('cristalNegro', cx, cy, 0.585, 0.155, 0.012, 'z', 40);
            L.caja('plasticoNegro', x + 0.03, M.topBajo - 0.13, 0.584, w - 0.06, 0.07, 0.002, { sinSombra: true });
            mando(x + w - 0.12, M.topBajo - 0.095, 0.585, 'cromo');
            sombra([x, 0.0012, 0.585], [w, 0, 0], [0, 0, 0.15], 0.15);
            break;
          }
          case 'hueco': {
            L.caja('interior', x + 0.005, M.zoc, 0, w - 0.01, M.casco, zf - 0.03);
            // el hueco es oscuro arriba (bajo la encimera) y en los costados
            const zh = zf - 0.03 + 0.0008;
            sombra([x + 0.005, M.topBajo, zh], [w - 0.01, 0, 0], [0, -0.32, 0], 0.15);
            sombra([x + 0.005, M.zoc, zh], [0, M.casco, 0], [0.1, 0, 0], 0.4);
            sombra([x + w - 0.005, M.zoc, zh], [0, M.casco, 0], [-0.1, 0, 0], 0.4);
            if (w >= 0.4) huecosLibres.push({ R, x, w });
            break;
          }
          case 'regleta': L.panel('frenteBajo', x, M.zoc + GAP / 2, zf, w, hF - GAP); break;
          case 'rincon': {
            if (enEsqIzq || enEsqDer) {
              const oculto = 0.60, wv = w - oculto;
              const x0 = enEsqIzq ? x + oculto : x;
              if (wv > 0.02) { L.panel('frenteBajo', enEsqIzq ? x0 : x0 + wv - 0.03, M.zoc + GAP / 2, zf, 0.03, hF - GAP); }
              if (wv > 0.12) puertas('frenteBajo', enEsqIzq ? x0 + 0.03 : x0, M.zoc, wv - 0.03, hF, zf, 1, 'arriba', enEsqIzq ? 'der' : 'izq');
            } else puertas('frenteBajo', x, M.zoc, w, hF, zf, w > 0.6 ? 2 : 1, 'arriba');
            break;
          }
        }
      } else {
        // ---------- columnas ----------
        const y0 = M.zoc, hc = M.colTop - M.zoc;
        if (m.bajo === 'frigo' && frigoLibre) {
          const mat = est.frigo === 'inox' ? 'inox' : 'blancoElectro';
          L.panel('frenteAlto', x, 0, 0, 0.018, M.colTop, 0.62);
          L.panel('frenteAlto', x + w - 0.018, 0, 0, 0.018, M.colTop, 0.62);
          const fx = x + 0.023, fw = w - 0.046;
          L.panel(mat, fx, 0.012, 0.02, fw, 1.85, 0.6, 0.015);
          L.panel(mat, fx, 0.62, 0.62, fw, 1.242, 0.035, 0.008);
          L.panel(mat, fx, 0.012, 0.62, fw, 0.6, 0.035, 0.008);
          tiradorElectro(fx + fw - 0.04, 0.62 + 0.45, 0.655, 0.45, 'y');
          tiradorElectro(fx + fw - 0.04, 0.42, 0.655, 0.3, 'y');
          const yp = 1.9;
          L.caja('casco', x + 0.018, yp, 0, w - 0.036, M.colTop - yp, zf);
          fondo(x + 0.018, yp, w - 0.036, M.colTop - yp, zf);
          puertas('frenteAlto', x + 0.018, yp, w - 0.036, M.colTop - yp, zf, 1, 'abajo');
          // suelo delante del frigorífico y rendija oscura entre el frigorífico y los laterales
          sombra([x, 0.0012, 0.655], [w, 0, 0], [0, 0, 0.16], 0.12);
          fondo(x + 0.018, 0.012, w - 0.036, yp - 0.012, 0.005);
        } else {
          L.caja('casco', x, y0, 0, w, hc, zf);
          fondo(x, y0, w, hc, zf);
          const fm = 'frenteAlto';
          if (m.bajo === 'columnaHorno') {
            puertas(fm, x, y0, w, 0.72, zf, 1, 'arriba');
            const b = horno(x, y0 + 0.72, w, zf);
            if (!barraHorno) barraHorno = { R, ...b };
            micro(x, y0 + 0.72 + 0.595, w, zf);
            const yt = y0 + 0.72 + 0.595 + 0.38;
            puertas(fm, x, yt, w, M.colTop - yt, zf, 1, 'abajo');
          } else if (m.bajo === 'frigo') {
            puertas(fm, x, y0, w, 0.72, zf, 1, 'arriba');
            puertas(fm, x, y0 + 0.72, w, hc - 0.72, zf, 1, 'centro');
          } else {
            puertas(fm, x, y0, w, 1.3, zf, w > 0.6 ? 2 : 1, 'arriba');
            puertas(fm, x, y0 + 1.3, w, hc - 1.3, zf, w > 0.6 ? 2 : 1, 'abajo');
          }
        }
        // techo y pared sobre la columna
        if (H - M.colTop < 0.9) sombra([x, H - 0.0008, 0], [w, 0, 0], [0, 0, zf + 0.25], 0.5 + 0.4 * Math.min(1, (H - M.colTop) / 0.9), 0);
      }

      // ---------- arriba ----------
      if (!col && m.alto !== 'vacio') {
        const campDecor = m.alto === 'campana' && DECORATIVAS.has(est.campana);
        const yd = gola ? 0.02 : 0; // el uñero de los altos: la puerta baja 2 cm
        if (!campDecor && m.alto !== 'estante') L.caja(m.alto === 'vitrina' ? 'interior' : 'casco', x, ya, 0, w, ha, za);
        if (!campDecor && m.alto !== 'estante' && m.alto !== 'vitrina') fondo(x, ya - yd, w, ha + yd, za);
        const altoOculto = (enEsqIzq || enEsqDer) ? 0.35 : 0;
        const ax = enEsqIzq ? x + altoOculto : x, aw = w - altoOculto;
        // la parte del rincón que debería tapar la otra pared: si allí no hay alto, se vería el casco blanco
        if (altoOculto && ALTO_CON_CASCO.has(m.alto)) L.panel('frenteAlto', enEsqIzq ? x + GAP / 2 : x + w - altoOculto + GAP / 2, ya - yd + GAP / 2, za, altoOculto - GAP, ha + yd - GAP);
        switch (m.alto) {
          case 'puertas': if (aw > 0.1) puertas('frenteAlto', ax, ya - yd, aw, ha + yd, za, aw > 0.6 ? 2 : 1, 'abajo'); break;
          case 'abatible':
            for (const k of [0, 1]) {
              const y = ya - (k === 0 ? yd : 0) + k * ha / 2, h = ha / 2 + (k === 0 ? yd : 0);
              L.panel('frenteAlto', ax + GAP / 2, y + GAP / 2, za, aw - GAP, h - GAP);
              tirador(ax + aw / 2, y + 0.045, za + 0.018, 'h', ccPor(aw));
            }
            break;
          case 'vitrina': {
            const n = aw > 0.6 ? 2 : 1, dw = aw / n, mar = 0.055;
            // interior: balda vista (canto) y sombras en el techo, el suelo y los costados de la caja
            const zi = za + 0.0008, ym = ya + ha / 2;
            L.caja('casco', x + 0.01, ym, za, w - 0.02, 0.018, 0.005);
            sombra([x, ya + ha, zi], [w, 0, 0], [0, -0.14, 0], 0.35);
            sombra([x, ym, zi], [w, 0, 0], [0, -0.07, 0], 0.45);
            sombra([x, ya, zi], [w, 0, 0], [0, 0.06, 0], 0.5);
            sombra([x, ym + 0.018, zi], [w, 0, 0], [0, 0.05, 0], 0.55);
            sombra([x, ya, zi], [0, ha, 0], [0.08, 0, 0], 0.5);
            sombra([x + w, ya, zi], [0, ha, 0], [-0.08, 0, 0], 0.5);
            for (let k = 0; k < n; k++) {
              const dx = ax + k * dw + GAP / 2, dwi = dw - GAP, y0 = ya - yd + GAP / 2, h = ha + yd - GAP;
              L.panel('frenteAlto', dx, y0, za, mar, h); L.panel('frenteAlto', dx + dwi - mar, y0, za, mar, h);
              L.panel('frenteAlto', dx + mar, y0, za, dwi - 2 * mar, mar); L.panel('frenteAlto', dx + mar, y0 + h - mar, za, dwi - 2 * mar, mar);
              L.caja('vidrioVitrina', dx + mar, y0 + mar, za + 0.008, dwi - 2 * mar, h - 2 * mar, 0.004, { sinSombra: true });
              const cc = Math.min(0.192, ccPor(dwi));
              tirador(k === 0 && n === 2 ? dx + dwi - 0.03 : (n === 1 ? dx + dwi - 0.03 : dx + 0.03), y0 + 0.05 + (cc + 0.028) / 2, za + 0.018, 'v', cc);
            }
            break;
          }
          case 'microondas': {
            micro(x, ya, w, za, 0.38);
            puertas('frenteAlto', x, ya + 0.38, w, ha - 0.38, za, 1, 'abajo');
            break;
          }
          case 'estante':
            for (const k of [0, 1, 2]) {
              const y = ya + k * 0.33;
              L.caja('frenteAlto', x + 0.004, y, 0, w - 0.008, 0.025, 0.28);
              sombra([x + 0.004, y, k === 0 ? fz + 0.0008 : 0.0008], [w - 0.008, 0, 0], [0, -0.08, 0], 0.5);
              sombra([x + 0.004, y + 0.025, 0.0008], [w - 0.008, 0, 0], [0, 0.06, 0], 0.55);
              sombra([x + 0.004, y + 0.0258, 0], [w - 0.008, 0, 0], [0, 0, 0.07], 0.5);
            }
            break;
          case 'campana': {
            if (est.campana === 'telescopica' || est.campana === 'integrada') {
              if (aw > 0.1) puertas('frenteAlto', ax, ya - yd, aw, ha + yd, za, aw > 0.6 ? 2 : 1, 'abajo');
              if (est.campana === 'telescopica') L.panel('inox', x + 0.012, ya - 0.032 - yd, za - 0.27, w - 0.024, 0.03, 0.31, 0.003);
              else L.caja('aluminio', x + 0.05, ya - 0.004, 0.03, w - 0.1, 0.004, 0.26);
            } else {
              const hw = w >= 0.85 ? 0.9 : Math.min(0.6, w), cx = x + w / 2, hb = M.encTop + 0.65;
              if (est.campana === 'piramidal') {
                L.panel('inox', cx - hw / 2, hb, 0, hw, 0.05, 0.5, 0.004);
                L.add(tronco([cx - hw / 2 + 0.012, cx + hw / 2 - 0.012, 0, 0.485], [cx - 0.14, cx + 0.14, 0, 0.26], hb + 0.05, hb + 0.40), 'inox');
                L.caja('inox', cx - 0.14, hb + 0.40, 0, 0.28, H - hb - 0.40, 0.26);
                L.caja('plasticoNegro', cx - hw / 2 + 0.03, hb - 0.0008, 0.03, hw - 0.06, 0.001, 0.44, { sinSombra: true });
              } else if (est.campana === 'plana') {
                L.panel('inox', cx - hw / 2, hb, 0, hw, 0.06, 0.5, 0.004);
                L.caja('inox', cx - 0.14, hb + 0.06, 0, 0.28, H - hb - 0.06, 0.26);
                L.caja('plasticoNegro', cx - hw / 2 + 0.03, hb - 0.0008, 0.03, hw - 0.06, 0.001, 0.44, { sinSombra: true });
              } else {
                L.caja('negroMetal', cx - hw / 2, hb + 0.02, 0, hw, 0.48, 0.13);
                L.caja('negroMetal', cx - hw / 2, hb - 0.01, 0, hw, 0.014, 0.40);
                const ang = -Math.atan2(0.26, 0.5);
                const g = new RoundedBoxGeometry(hw, 0.55, 0.008, 2, 0.003); g.rotateX(ang); g.translate(cx, hb + 0.255, 0.27);
                L.add(g, 'cristalNegro');
                // canto pulido del cristal: asoma 2 mm por todo el perímetro
                const gc = new RoundedBoxGeometry(hw + 0.004, 0.554, 0.005, 1, 0.002); gc.translate(0, 0, -0.0015); gc.rotateX(ang); gc.translate(cx, hb + 0.255, 0.27);
                L.add(gc, 'cantoCristal');
                L.caja('negroMetal', cx - 0.13, hb + 0.5, 0, 0.26, H - hb - 0.5, 0.2);
              }
              for (const d of [-1, 1]) L.cilindro('led', cx + d * hw * 0.25, hb - 0.0005, 0.25, 0.025, 0.002, 'y', 16, { sinSombra: true });
              // la chimenea contra la pared
              sombra([cx - 0.14, hb + 0.4, 0.0008], [0.28, 0, 0], [0, -0.06, 0], 0.6);
            }
            break;
          }
        }
      }

      // pared sobre los altos y las columnas (la parte de arriba toca la pared)
      const arribaCasco = col ? true : (ALTO_CON_CASCO.has(m.alto) || (m.alto === 'campana' && !DECORATIVAS.has(est.campana)));
      if (arribaCasco && H - M.colTop > 0.03) sombra([x, M.colTop, 0.0008], [w, 0, 0], [0, Math.min(0.14, H - M.colTop), 0], 0.55);

      // caja de selección
      const alto = col ? M.colTop : (m.alto !== 'vacio' ? ya + ha : M.encTop);
      picks.push({ R, x0: x, x1: x + w, y1: alto, z1: zf + 0.03, tramo: t.id, idx: i });
    }

    // ---------- costados vistos entre módulos (alto junto a la ventana, bajo junto a la lavadora…) ----------
    const altoConCasco = q => q && !q.col && (ALTO_CON_CASCO.has(q.m.alto) || (q.m.alto === 'campana' && !DECORATIVAS.has(est.campana)));
    const bajoConCasco = q => q && !q.col && !['lavadora', 'hueco'].includes(q.m.bajo);
    sl.forEach((q, k) => {
      const prev = sl[k - 1], next = sl[k + 1];
      const yd = gola ? 0.02 : 0;
      if (altoConCasco(q)) {
        if (prev && !prev.col && !altoConCasco(prev)) L.caja('frenteAlto', q.s - 0.004, ya - yd, 0, 0.004, ha + yd, za + 0.018);
        if (next && !next.col && !altoConCasco(next)) L.caja('frenteAlto', q.s + q.w, ya - yd, 0, 0.004, ha + yd, za + 0.018);
      }
      if (bajoConCasco(q)) {
        if (prev && !prev.col && !bajoConCasco(prev)) L.caja('frenteBajo', q.s - 0.004, M.zoc, 0, 0.004, M.casco, zf + 0.018);
        if (next && !next.col && !bajoConCasco(next)) L.caja('frenteBajo', q.s + q.w, M.zoc, 0, 0.004, M.casco, zf + 0.018);
      }
    });

    // ---------- encimera, fregaderos y placas ----------
    const segmentos = [];
    let cur = null;
    for (const q of sl) {
      if (q.col) { if (cur) segmentos.push(cur); cur = null; continue; }
      if (!cur) cur = { x0: q.s, x1: q.s + q.w, sl: [] };
      cur.x1 = q.s + q.w; cur.sl.push(q);
    }
    if (cur) segmentos.push(cur);

    const enc = est.grosorEncimera === 'fina' ? 0.02 : M.enc;
    const encTop = M.topBajo + enc;
    for (const sg of segmentos) {
      let x0 = sg.x0, x1 = sg.x1;
      if (t.esqFinPared) x1 = Math.min(x1, t.largoPared - M.esquinaEnc);
      if (t.esqIniPared) x0 = Math.max(x0, M.esquinaEnc);
      // canto libre: la encimera vuela 2 cm sobre el costado
      if (Math.abs(sg.x1 - fin) < 1e-6 && fin < t.largoPared - 0.01 && !t.esqFin && !t.esqFinPared) x1 += 0.02;
      if (Math.abs(sg.x0 - t.ini) < 1e-6 && t.ini > 0.01 && !t.esqIni && !t.esqIniPared) x0 -= 0.02;
      if (x1 - x0 < 0.05) continue;
      const bT = 0.0015;
      const forma = new THREE.Shape();
      forma.moveTo(x0 + bT, bT); forma.lineTo(x1 - bT, bT); forma.lineTo(x1 - bT, M.encFondo - bT); forma.lineTo(x0 + bT, M.encFondo - bT); forma.closePath();
      const fregs = sg.sl.filter(q => q.m.bajo === 'fregadero');
      const cubetas = [];
      for (const q of fregs) {
        const bw = Math.min(q.w - 0.14, 0.5); if (bw < 0.2) continue;
        const cx = q.s + q.w / 2, z0 = 0.1, z1 = 0.5;
        const h = new THREE.Path(); const r = 0.03;
        h.moveTo(cx - bw / 2 + r, z0); h.lineTo(cx + bw / 2 - r, z0); h.quadraticCurveTo(cx + bw / 2, z0, cx + bw / 2, z0 + r);
        h.lineTo(cx + bw / 2, z1 - r); h.quadraticCurveTo(cx + bw / 2, z1, cx + bw / 2 - r, z1); h.lineTo(cx - bw / 2 + r, z1);
        h.quadraticCurveTo(cx - bw / 2, z1, cx - bw / 2, z1 - r); h.lineTo(cx - bw / 2, z0 + r); h.quadraticCurveTo(cx - bw / 2, z0, cx - bw / 2 + r, z0);
        forma.holes.push(h); cubetas.push({ cx, bw, z0, z1, path: h });
      }
      const g = new THREE.ExtrudeGeometry(forma, { depth: enc - 2 * bT, bevelEnabled: true, bevelThickness: bT, bevelSize: bT, bevelSegments: 2, curveSegments: 6 });
      g.rotateX(Math.PI / 2); g.translate(0, encTop - bT, 0);
      L.add(g, 'encimera');

      // encuentro encimera-frontal: línea de sombra en los dos planos
      sombra([x0, encTop + 0.0008, fz], [x1 - x0, 0, 0], [0, 0, 0.075], 0.35, 0.05);
      sombra([x0, encTop, fz + 0.0008], [x1 - x0, 0, 0], [0, 0.06, 0], 0.45, 0.05);

      for (const c of cubetas) {
        // aro de inox sobre la encimera
        const aro = new THREE.Shape(); const mg = 0.035;
        aro.moveTo(c.cx - c.bw / 2 - mg, c.z0 - mg); aro.lineTo(c.cx + c.bw / 2 + mg, c.z0 - mg); aro.lineTo(c.cx + c.bw / 2 + mg, c.z1 + mg); aro.lineTo(c.cx - c.bw / 2 - mg, c.z1 + mg); aro.closePath();
        aro.holes.push(c.path);
        const ga = new THREE.ExtrudeGeometry(aro, { depth: 0.002, bevelEnabled: false, curveSegments: 6 });
        ga.rotateX(Math.PI / 2); ga.translate(0, encTop + 0.002, 0);
        L.add(ga, 'inox');
        const cub = new THREE.BoxGeometry(c.bw, 0.19, c.z1 - c.z0); cub.translate(c.cx, encTop - 0.094, (c.z0 + c.z1) / 2);
        L.add(cub, 'inoxCubeta');
        // desagüe con rejilla y rebosadero
        const yb = encTop - 0.189, cz = (c.z0 + c.z1) / 2 + 0.06;
        L.cilindro('cromo', c.cx, yb + 0.0015, cz, 0.043, 0.003, 'y', 32);
        L.cilindro('plasticoNegro', c.cx, yb + 0.0032, cz, 0.035, 0.0006, 'y', 28, { sinSombra: true });
        for (const rr of [0.012, 0.022, 0.031]) { const tr = new THREE.TorusGeometry(rr, 0.0014, 4, 32); tr.rotateX(Math.PI / 2); tr.translate(c.cx, yb + 0.0038, cz); L.add(tr, 'cromo'); }
        L.caja('cromo', c.cx - 0.034, yb + 0.0032, cz - 0.0015, 0.068, 0.0014, 0.003);
        L.caja('cromo', c.cx - 0.0015, yb + 0.0032, cz - 0.034, 0.003, 0.0014, 0.068);
        L.cilindro('cromo', c.cx, yb + 0.0045, cz, 0.006, 0.002, 'y', 16);
        L.panel('cromo', c.cx - 0.03, encTop - 0.05, c.z0 + 0.0002, 0.06, 0.016, 0.002, 0.006);
        L.caja('plasticoNegro', c.cx - 0.022, encTop - 0.0455, c.z0 + 0.0021, 0.044, 0.007, 0.0004, { sinSombra: true });
        // grifo: embellecedor, cuerpo, caño y aireador
        const zg = c.z0 - 0.05, yS = encTop + 0.27, zS = zg + 0.24;
        L.cilindro('cromo', c.cx, encTop + 0.004, zg, 0.03, 0.008, 'y', 28);
        L.cilindro('cromo', c.cx, encTop + 0.035, zg, 0.023, 0.06, 'y', 24);
        const curva = new THREE.CubicBezierCurve3(
          new THREE.Vector3(c.cx, encTop + 0.05, zg), new THREE.Vector3(c.cx, encTop + 0.45, zg),
          new THREE.Vector3(c.cx, encTop + 0.45, zS), new THREE.Vector3(c.cx, yS, zS));
        L.add(new THREE.TubeGeometry(curva, 32, 0.011, 12), 'cromo');
        L.cilindro('cromo', c.cx, yS - 0.008, zS, 0.0135, 0.026, 'y', 20);
        L.cilindro('plasticoNegro', c.cx, yS - 0.0215, zS, 0.0098, 0.0012, 'y', 16, { sinSombra: true });
        // maneta
        L.cilindro('cromo', c.cx + 0.023, encTop + 0.058, zg, 0.009, 0.014, 'x', 16);
        const mn = new THREE.CylinderGeometry(0.0045, 0.006, 0.085, 12); mn.rotateZ(-Math.PI / 2 + 0.25); mn.translate(c.cx + 0.07, encTop + 0.068, zg); L.add(mn, 'cromo');
        mancha(c.cx, encTop + 0.0009, zg, 0.05, 0.05);
      }
      for (const q of sg.sl.filter(q => q.m.bajo === 'horno' || q.m.bajo === 'placa')) {
        const cx = q.s + q.w / 2, zc = 0.31;
        if (est.placa === 'gas') {
          L.caja('inox', cx - 0.29, encTop, zc - 0.25, 0.58, 0.008, 0.5);
          for (const [dx, dz, r] of [[-0.14, -0.11, 0.045], [0.14, -0.11, 0.035], [-0.14, 0.12, 0.035], [0.14, 0.12, 0.055]]) {
            L.cilindro('fundicion', cx + dx, encTop + 0.018, zc + dz, r, 0.02, 'y', 28);
            L.cilindro('negroMetal', cx + dx, encTop + 0.03, zc + dz, r * 0.7, 0.006, 'y', 28);
          }
          for (const h of [-1, 1]) {
            const gx = cx + h * 0.145;
            for (const dz of [-0.23, 0.23]) L.caja('fundicion', gx - 0.135, encTop + 0.035, zc + dz - 0.006, 0.27, 0.012, 0.012);
            for (const dx of [-0.13, 0.13]) L.caja('fundicion', gx + dx - 0.006, encTop + 0.035, zc - 0.23, 0.012, 0.012, 0.46);
            L.caja('fundicion', gx - 0.006, encTop + 0.035, zc - 0.23, 0.012, 0.012, 0.46);
          }
        } else {
          const gp = new THREE.BoxGeometry(0.59, 0.006, 0.52); gp.translate(cx, encTop + 0.003, zc);
          L.add(gp, 'placa', { uvPropias: true });
        }
      }

      // zonas libres de encimera para la decoración (lejos del fregadero y de la placa)
      if (decorar) {
        let libres = [[x0 + 0.03, x1 - 0.03]];
        for (const q of sg.sl.filter(q => ['fregadero', 'horno', 'placa'].includes(q.m.bajo))) {
          const a = q.s - 0.07, b = q.s + q.w + 0.07;
          libres = libres.flatMap(([p, r]) => [[p, Math.min(r, a)], [Math.max(p, b), r]]).filter(([p, r]) => r - p > 0.2);
        }
        for (const [a, b] of libres) zonas.push({ R, a, b, encTop, tramo: t.id, n: 0, usado: [] });
      }

      // ---------- frontal ----------
      if (est.frontal !== 'pintura') {
        let f0 = sg.x0, f1 = sg.x1;
        if (t.esqFinPared) f1 = t.largoPared - 0.01;
        if (t.esqIniPared) f0 = 0.01;
        const grosor = est.frontal === 'encimera' ? 0.012 : 0.008;
        const tramosF = [];
        if (vent && vent.x1 > f0 && vent.x0 < f1) {
          if (vent.x0 > f0) tramosF.push([f0, vent.x0, ya]);
          tramosF.push([Math.max(f0, vent.x0), Math.min(f1, vent.x1), Math.min(ya, vent.sill)]);
          if (vent.x1 < f1) tramosF.push([vent.x1, f1, ya]);
        } else tramosF.push([f0, f1, ya]);
        for (const [a, b, top] of tramosF) if (top - encTop > 0.03 && b - a > 0.01) L.caja('frontal', a, encTop, 0, b - a, top - encTop, grosor);
      }
    }

    // ---------- esquinas interiores entre tramos: sombra vertical en la pared ----------
    const esquinas = [];
    if (t.esqIni || t.esqIniPared) esquinas.push([0, 1]);
    if (t.esqFin || t.esqFinPared) esquinas.push([t.largoPared, -1]);
    for (const [xc, d] of esquinas) {
      sombra([xc, M.encTop, fz + 0.0008], [0, ya - M.encTop, 0], [d * 0.13, 0, 0], 0.4);
      sombra([xc, ya, 0.0008], [0, H - ya, 0], [d * 0.13, 0, 0], 0.5);
    }

    // ---------- zócalo ----------
    let z0 = null;
    const cierraZ = (xEnd) => {
      if (z0 === null) return;
      let a = z0, b = xEnd;
      if (t.esqFinPared && Math.abs(b - fin) < 1e-6) b += 0.07;
      if (t.esqIniPared && Math.abs(a - t.ini) < 1e-6) a -= 0.07;
      L.caja('zocalo', a, 0.002, zf - 0.05, b - a, M.zoc - 0.004, 0.016);
      // suelo bajo el vuelo de los frentes
      sombra([a, 0.0012, zf - 0.034], [b - a, 0, 0], [0, 0, 0.21], 0.06);
      z0 = null;
    };
    for (const q of sl) {
      const sinZ = q.m.bajo === 'lavadora' || (q.m.bajo === 'frigo' && frigoLibre);
      if (sinZ) { cierraZ(q.s); continue; }
      if (z0 === null) z0 = q.s;
    }
    cierraZ(fin);

    // ---------- costados vistos en extremos libres ----------
    const libreIni = t.ini > 0.01 && !t.esqIni && !t.esqIniPared;
    const libreFin = fin < t.largoPared - 0.01 && !t.esqFin && !t.esqFinPared;
    const costado = (q, xc) => {
      if (!q) return;
      if (q.col) { if (!(q.m.bajo === 'frigo' && frigoLibre)) L.panel('frenteAlto', xc, 0, 0, 0.018, M.colTop, zf + 0.018); return; }
      L.panel('frenteBajo', xc, 0, 0, 0.018, M.topBajo, zf + 0.018);
      if (q.m.alto !== 'vacio' && !(q.m.alto === 'campana' && DECORATIVAS.has(est.campana)) && q.m.alto !== 'estante') L.panel('frenteAlto', xc, ya - (gola ? 0.02 : 0), 0, 0.018, ha + (gola ? 0.02 : 0), za + 0.018);
    };
    if (libreIni && sl.length) costado(sl[0], t.ini - 0.018);
    if (libreFin && sl.length) costado(sl[ultimo], fin);

    // relleno de la esquina de los altos (B en L/U)
    if (t.esqFinPared && sl.length && Math.abs(fin - (t.largoPared - M.esquina)) < 0.005) {
      const q = sl[ultimo];
      if (!q.col && q.m.alto !== 'vacio') { L.caja('casco', fin, ya, 0, M.esquina - M.fondoA, ha, za); L.panel('frenteAlto', fin, ya - (gola ? 0.02 : 0), za, M.esquina - M.fondoA - 0.002, ha + (gola ? 0.02 : 0)); }
    }
    if (t.esqIniPared && sl.length && Math.abs(t.ini - M.esquina) < 0.005) {
      const q = sl[0];
      if (!q.col && q.m.alto !== 'vacio') { L.caja('casco', M.fondoA, ya, 0, M.esquina - M.fondoA, ha, za); L.panel('frenteAlto', M.fondoA + 0.002, ya - (gola ? 0.02 : 0), za, M.esquina - M.fondoA - 0.002, ha + (gola ? 0.02 : 0)); }
    }

    // ---------- LED bajo los altos (y sombra de contacto de los altos sobre el frontal) ----------
    let l0 = null;
    const cierraL = (xe) => {
      if (l0 === null) return;
      if (xe - l0 > 0.2) { L.caja('led', l0 + 0.02, ya - 0.006, za - 0.07, xe - l0 - 0.04, 0.004, 0.012, { sinSombra: true }); ledes.push({ R, x0: l0, x1: xe, y: ya - 0.012, z: za - 0.12, n: t.n }); }
      if (xe - l0 > 0.05) sombra([l0, ya, fz + 0.0008], [xe - l0, 0, 0], [0, -0.17, 0], 0.5, 0.04);
      l0 = null;
    };
    for (const q of sl) {
      const conCasco = !q.col && (ALTO_CON_CASCO.has(q.m.alto) || (q.m.alto === 'campana' && !DECORATIVAS.has(est.campana)));
      if (!conCasco) { cierraL(q.s); continue; }
      if (l0 === null) l0 = q.s;
    }
    cierraL(fin);
  }

  if (decorar) decoracion(L, { zonas, huecosLibres, barraHorno, mancha, zf });

  return { lote: L, picks, ledes };
}

// ---------- Decoración por código (sin modelos descargados): una sola malla con la paleta del atlas ----------
function decoracion(L, { zonas, huecosLibres, barraHorno, mancha, zf }) {
  const D = (g, nombre) => L.add(celda(g, nombre), 'deco', { uvPropias: true });
  const cil = (rT, rB, h, seg = 24) => new THREE.CylinderGeometry(rT, rB, h, seg);
  const esfera = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);

  const botes = (x, y, z) => {
    [[0.2, 0.056], [0.16, 0.052], [0.125, 0.048]].forEach(([h, r], k) => {
      const cx = x + 0.06 + k * 0.122;
      const b = cil(r, r, h); b.translate(cx, y + h / 2, z); D(b, 'bote');
      const t = cil(r + 0.002, r + 0.002, 0.02); t.translate(cx, y + h + 0.01, z); D(t, 'madera');
      const p = esfera(0.012, 10, 6); p.scale(1, 0.6, 1); p.translate(cx, y + h + 0.022, z); D(p, 'maderaOscura');
      mancha(cx, y + 0.0009, z, r * 1.7);
    });
  };
  const planta = (x, y, z) => {
    const cx = x + 0.1;
    const m = cil(0.075, 0.056, 0.14); m.translate(cx, y + 0.07, z); D(m, 'terracota');
    const bo = new THREE.TorusGeometry(0.074, 0.006, 6, 28); bo.rotateX(Math.PI / 2); bo.translate(cx, y + 0.138, z); D(bo, 'terracota');
    const ti = cil(0.069, 0.069, 0.004); ti.translate(cx, y + 0.141, z); D(ti, 'tierra');
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996, alto = 0.04 + (i % 5) * 0.035, inc = 0.25 + (i % 4) * 0.22, largo = 0.05 + (i % 3) * 0.012;
      const tallo = cil(0.0025, 0.003, alto, 5); tallo.translate(0, alto / 2, 0); tallo.rotateZ(0.12 * Math.cos(a)); tallo.rotateX(0.12 * Math.sin(a)); tallo.translate(cx, y + 0.14, z); D(tallo, 'tallo');
      const h = esfera(1, 12, 8); h.scale(largo * 0.5, 0.006, largo); h.translate(0, 0, largo * 0.9); h.rotateX(-inc); h.rotateY(a);
      h.translate(cx + 0.12 * Math.cos(a) * alto, y + 0.14 + alto, z - 0.12 * Math.sin(a) * alto); D(h, i % 2 ? 'hoja' : 'hojaClara');
    }
    mancha(cx, y + 0.0009, z, 0.12);
  };
  const frutero = (x, y, z) => {
    const cx = x + 0.16;
    const perfil = [[0.0, 0.016], [0.06, 0.016], [0.1, 0.03], [0.128, 0.057], [0.134, 0.069], [0.14, 0.07], [0.135, 0.06], [0.11, 0.03], [0.07, 0.012], [0.062, 0], [0.0, 0]]
      .map(([r, h]) => new THREE.Vector2(r, h));
    const cu = new THREE.LatheGeometry(perfil, 32); cu.translate(cx, y, z); D(cu, 'ceramica');
    const fr = [[-0.045, 0.054, -0.012, 0.038, 'naranja', 1], [0.046, 0.054, -0.02, 0.037, 'naranja', 1], [0.0, 0.056, 0.05, 0.036, 'manzanaRoja', 0.9], [-0.004, 0.058, -0.06, 0.035, 'manzanaVerde', 0.9], [0.012, 0.094, -0.01, 0.03, 'limon', 1]];
    for (const [dx, dy, dz, r, c, sy] of fr) {
      const f = esfera(r); f.scale(c === 'limon' ? 1.35 : 1, sy, 1);
      if (c === 'limon') f.rotateY(0.6);
      f.translate(cx + dx, y + dy, z + dz); D(f, c);
      if (c.startsWith('manzana')) { const p = cil(0.0018, 0.0022, 0.016, 5); p.rotateZ(0.3); p.translate(cx + dx, y + dy + r * sy + 0.004, z + dz); D(p, 'rabito'); }
    }
    mancha(cx, y + 0.0009, z, 0.17);
  };
  const tabla = (x, y, z) => {
    const cx = x + 0.21;
    const g = new RoundedBoxGeometry(0.4, 0.28, 0.018, 2, 0.006); g.translate(0, 0.14, 0); g.rotateX(-0.2); g.translate(cx, y, z + 0.07);
    D(g, 'madera');
    const a = cil(0.014, 0.014, 0.019, 16); a.rotateX(Math.PI / 2 - 0.2); a.translate(cx, y + 0.235, z + 0.07 - 0.047); D(a, 'maderaOscura');
    mancha(cx, y + 0.0009, z + 0.07, 0.22, 0.05);
  };
  const OBJ = [
    { f: botes, w: 0.38, z: 0.11 },
    { f: planta, w: 0.2, z: 0.13 },
    { f: frutero, w: 0.32, z: 0.33 },
    { f: tabla, w: 0.42, z: 0.012 },
  ];
  for (const o of OBJ) {
    const orden = [...zonas].sort((p, q) => (p.usado.length - q.usado.length) || ((q.b - q.a) - (p.b - p.a)));
    let puesto = false;
    for (const zn of orden) {
      for (const c of [zn.a + 0.02, zn.b - 0.02 - o.w, (zn.a + zn.b - o.w) / 2]) {
        if (c < zn.a || c + o.w > zn.b) continue;
        if (zn.usado.some(([p, r]) => c < r + 0.1 && c + o.w > p - 0.1)) continue;
        L.usar(zn.R); o.f(c, zn.encTop, o.z); zn.usado.push([c, c + o.w]); puesto = true; break;
      }
      if (puesto) break;
    }
  }

  // paño colgado de la barra del horno
  if (barraHorno) {
    const { R, x, y, z } = barraHorno, w = 0.2;
    L.usar(R);
    const rollo = cil(0.0125, 0.0125, w, 16); rollo.rotateZ(Math.PI / 2); rollo.translate(x - 0.12, y, z); D(rollo, 'pano');
    const del = new RoundedBoxGeometry(w, 0.3, 0.004, 1, 0.0015); del.translate(x - 0.12, y - 0.15, z + 0.0115); D(del, 'pano');
    const tra = new RoundedBoxGeometry(w, 0.2, 0.004, 1, 0.0015); tra.translate(x - 0.12, y - 0.1, z - 0.0115); D(tra, 'pano');
  }

  // taburetes delante de los huecos libres
  for (const hq of huecosLibres) {
    L.usar(hq.R);
    const n = Math.max(1, Math.floor(hq.w / 0.45));
    for (let k = 0; k < n; k++) {
      const cx = hq.x + hq.w * (k + 0.5) / n, cz = zf + 0.2;
      const as = cil(0.17, 0.16, 0.045, 32); as.translate(cx, 0.645, cz); D(as, 'madera');
      for (let p = 0; p < 4; p++) {
        const a = Math.PI / 4 + p * Math.PI / 2;
        const pata = cil(0.011, 0.012, 0.64, 10); pata.translate(0, 0.32, 0); pata.rotateZ(-0.05 * Math.cos(a)); pata.rotateX(0.05 * Math.sin(a));
        pata.translate(cx + 0.115 * Math.cos(a), 0, cz - 0.115 * Math.sin(a)); D(pata, 'negro');
      }
      const ar = new THREE.TorusGeometry(0.13, 0.006, 6, 32); ar.rotateX(Math.PI / 2); ar.translate(cx, 0.25, cz); D(ar, 'negro');
      mancha(cx, 0.0012, cz, 0.26);
    }
  }
}
