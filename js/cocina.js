// Construye la cocina 3D a partir del modelo: cascos, frentes, tiradores, encimera con huecos, fregadero,
// placa, campanas, electrodomésticos, frontal, zócalo y LED. Todo con medidas reales.
import * as THREE from 'three';
import { M, COLUMNAS, tramosDe } from './modelo.js';
import { Lote, matrizTramo, tronco, RoundedBoxGeometry } from './geo.js';

const GAP = 0.003;
const DECORATIVAS = new Set(['piramidal', 'plana', 'inclinada']);
const ALTO_CON_CASCO = new Set(['puertas', 'abatible', 'vitrina', 'microondas']);

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

  // ---------- piezas ----------
  const tirador = (x, y, z, orient, largo) => {
    if (est.tirador === 'unero' || est.tirador === 'sin') return;
    if (est.tirador === 'pomo') { L.cilindro('tirador', x, y, z + 0.014, 0.012, 0.028, 'z', 20); return; }
    const sep = 0.028, r = 0.0055;
    if (orient === 'v') {
      L.cilindro('tirador', x, y, z + sep, r, largo, 'y', 14);
      for (const d of [-1, 1]) L.cilindro('tirador', x, y + d * (largo / 2 - 0.016), z + sep / 2, 0.0042, sep, 'z', 10);
    } else {
      L.cilindro('tirador', x, y, z + sep, r, largo, 'x', 14);
      for (const d of [-1, 1]) L.cilindro('tirador', x + d * (largo / 2 - 0.016), y, z + sep / 2, 0.0042, sep, 'z', 10);
    }
  };

  const puertas = (mat, x0, y0, w, h, z, n, pos, abre = 'der') => {
    const dw = w / n;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * dw;
      L.panel(mat, x + GAP / 2, y0 + GAP / 2, z, dw - GAP, h - GAP);
      const lado = n === 1 ? abre : (k === 0 ? 'der' : 'izq');
      const hx = lado === 'der' ? x + dw - 0.042 : x + 0.042;
      const largo = Math.min(0.16, h * 0.45);
      const hy = pos === 'arriba' ? y0 + h - 0.05 - largo / 2 : pos === 'abajo' ? y0 + 0.05 + largo / 2 : y0 + h / 2;
      tirador(hx, est.tirador === 'pomo' ? (pos === 'abajo' ? y0 + 0.05 : y0 + h - 0.05) : hy, z + 0.018, 'v', largo);
    }
  };

  const cajones = (mat, x0, y0, w, h, z, fr) => {
    let y = y0 + h;
    fr.forEach((f, k) => {
      const hh = M.casco * f - (k === 0 && gola ? 0.035 : 0);
      y -= hh;
      const hg = gola && k > 0 ? 0.03 : 0;
      L.panel(mat, x0 + GAP / 2, y + GAP / 2, z, w - GAP, hh - GAP - hg);
      if (hg) L.caja('gola', x0, y + hh - hg, z - 0.02, w, hg, 0.02);
      const largo = Math.min(0.32, w * 0.5);
      tirador(x0 + w / 2, y + hh - hg - (hh > 0.22 ? 0.055 : (hh - hg) / 2), z + 0.018, 'h', largo);
    });
  };

  const tiradorElectro = (x, y, z, largo, eje) => {
    L.cilindro('inox', x, y, z + 0.035, 0.0075, largo, eje, 14);
    for (const d of [-1, 1]) {
      if (eje === 'x') L.cilindro('inox', x + d * (largo / 2 - 0.03), y, z + 0.0175, 0.005, 0.035, 'z', 10);
      else L.cilindro('inox', x, y + d * (largo / 2 - 0.03), z + 0.0175, 0.005, 0.035, 'z', 10);
    }
  };

  const horno = (x, y, w, z, h = 0.595) => {
    const banda = est.horno === 'inox' ? 'inox' : 'cristalNegro';
    L.panel(banda, x + 0.003, y + h - 0.092, z, w - 0.006, 0.089, 0.022, 0.002);
    for (const dx of [0.075, w - 0.075]) L.cilindro(est.horno === 'inox' ? 'inox' : 'plasticoNegro', x + dx, y + h - 0.046, z + 0.03, 0.017, 0.018, 'z', 24);
    L.caja('pantalla', x + w / 2 - 0.045, y + h - 0.058, z + 0.0225, 0.09, 0.024, 0.001, { sinSombra: true });
    L.panel('cristalNegro', x + 0.003, y + 0.003, z, w - 0.006, h - 0.097, 0.024, 0.002);
    tiradorElectro(x + w / 2, y + h - 0.13, z + 0.024, w - 0.14, 'x');
  };

  const micro = (x, y, w, z, h = 0.38) => {
    const marco = est.horno === 'inox' ? 'inox' : 'cristalNegro';
    L.panel(marco, x + 0.003, y + 0.003, z, w - 0.006, h - 0.006, 0.02, 0.002);
    L.panel('cristalNegro', x + 0.035, y + 0.045, z + 0.02, (w - 0.006) * 0.64, h - 0.09, 0.004, 0.001);
    L.caja('pantalla', x + w * 0.76, y + h - 0.1, z + 0.0205, 0.07, 0.02, 0.001, { sinSombra: true });
    L.cilindro('plasticoNegro', x + w * 0.8, y + h * 0.42, z + 0.026, 0.016, 0.014, 'z', 20);
  };

  const hueco = (matF, x, y, w, h) => { L.caja('casco', x, y, 0, w, h, zf); };

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
        if (conCasco) L.caja('casco', x, M.zoc, 0, w, M.casco, zf);
        if (gola && conCasco && m.bajo !== 'regleta') L.caja('gola', x, M.topBajo - 0.035, zf - 0.025, w, 0.035, 0.025);
        switch (m.bajo) {
          case 'puertas': puertas('frenteBajo', x, M.zoc, w, hF, zf, w > 0.6 ? 2 : 1, 'arriba', i === 0 ? 'der' : 'izq'); break;
          case 'fregadero': puertas('frenteBajo', x, M.zoc, w, hF, zf, w > 0.6 ? 2 : 1, 'arriba'); break;
          case 'cajonero': case 'placa': cajones('frenteBajo', x, M.zoc, w, hF, zf, [0.25, 0.25, 0.5]); break;
          case 'horno': {
            const top = M.topBajo - (gola ? 0.035 : 0);
            horno(x, top - 0.595, w, zf);
            const hc = top - 0.6 - M.zoc;
            if (hc > 0.03) { L.panel('frenteBajo', x + GAP / 2, M.zoc + GAP / 2, zf, w - GAP, hc - GAP); tirador(x + w / 2, M.zoc + hc / 2, zf + 0.018, 'h', Math.min(0.32, w * 0.5)); }
            break;
          }
          case 'lavavajillas':
            L.panel('frenteBajo', x + GAP / 2, M.zoc + GAP / 2, zf, w - GAP, hF - GAP);
            tirador(x + w / 2, M.zoc + hF - 0.055, zf + 0.018, 'h', Math.min(0.32, w * 0.5));
            break;
          case 'lavadora': {
            L.panel('blancoElectro', x + 0.006, 0.01, 0.02, w - 0.012, M.topBajo - 0.025, 0.565, 0.012);
            const cx = x + w / 2, cy = 0.42;
            const toro = new THREE.TorusGeometry(0.165, 0.022, 12, 40); toro.translate(cx, cy, 0.588); L.add(toro, 'cromo');
            L.cilindro('cristalNegro', cx, cy, 0.585, 0.155, 0.012, 'z', 40);
            L.caja('plasticoNegro', x + 0.03, M.topBajo - 0.13, 0.584, w - 0.06, 0.07, 0.002, { sinSombra: true });
            L.cilindro('cromo', x + w - 0.12, M.topBajo - 0.095, 0.59, 0.025, 0.02, 'z', 24);
            break;
          }
          case 'hueco': L.caja('interior', x + 0.005, M.zoc, 0, w - 0.01, M.casco, zf - 0.03); break;
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
          puertas('frenteAlto', x + 0.018, yp, w - 0.036, M.colTop - yp, zf, 1, 'abajo');
        } else {
          L.caja('casco', x, y0, 0, w, hc, zf);
          const fm = 'frenteAlto';
          if (m.bajo === 'columnaHorno') {
            puertas(fm, x, y0, w, 0.72, zf, 1, 'arriba');
            horno(x, y0 + 0.72, w, zf);
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
      }

      // ---------- arriba ----------
      if (!col && m.alto !== 'vacio') {
        const campDecor = m.alto === 'campana' && DECORATIVAS.has(est.campana);
        const yd = gola ? 0.02 : 0; // el uñero de los altos: la puerta baja 2 cm
        if (!campDecor && m.alto !== 'estante') L.caja(m.alto === 'vitrina' ? 'interior' : 'casco', x, ya, 0, w, ha, za);
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
              tirador(ax + aw / 2, y + 0.045, za + 0.018, 'h', Math.min(0.32, aw * 0.5));
            }
            break;
          case 'vitrina': {
            const n = aw > 0.6 ? 2 : 1, dw = aw / n, mar = 0.055;
            L.caja('casco', x + 0.01, ya + ha / 2, 0.01, w - 0.02, 0.018, za - 0.02);
            for (let k = 0; k < n; k++) {
              const dx = ax + k * dw + GAP / 2, dwi = dw - GAP, y0 = ya - yd + GAP / 2, h = ha + yd - GAP;
              L.panel('frenteAlto', dx, y0, za, mar, h); L.panel('frenteAlto', dx + dwi - mar, y0, za, mar, h);
              L.panel('frenteAlto', dx + mar, y0, za, dwi - 2 * mar, mar); L.panel('frenteAlto', dx + mar, y0 + h - mar, za, dwi - 2 * mar, mar);
              L.caja('vidrioVitrina', dx + mar, y0 + mar, za + 0.008, dwi - 2 * mar, h - 2 * mar, 0.004, { sinSombra: true });
              tirador(k === 0 && n === 2 ? dx + dwi - 0.03 : (n === 1 ? dx + dwi - 0.03 : dx + 0.03), y0 + 0.05 + 0.08, za + 0.018, 'v', 0.16);
            }
            break;
          }
          case 'microondas': {
            micro(x, ya, w, za, 0.38);
            puertas('frenteAlto', x, ya + 0.38, w, ha - 0.38, za, 1, 'abajo');
            break;
          }
          case 'estante':
            for (const k of [0, 1, 2]) L.caja('frenteAlto', x + 0.004, ya + k * 0.33, 0, w - 0.008, 0.025, 0.28);
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
              } else if (est.campana === 'plana') {
                L.panel('inox', cx - hw / 2, hb, 0, hw, 0.06, 0.5, 0.004);
                L.caja('inox', cx - 0.14, hb + 0.06, 0, 0.28, H - hb - 0.06, 0.26);
              } else {
                L.caja('negroMetal', cx - hw / 2, hb + 0.02, 0, hw, 0.48, 0.13);
                L.caja('negroMetal', cx - hw / 2, hb - 0.01, 0, hw, 0.014, 0.40);
                const g = new RoundedBoxGeometry(hw, 0.55, 0.008, 2, 0.003); g.rotateX(-Math.atan2(0.26, 0.5)); g.translate(cx, hb + 0.255, 0.27);
                L.add(g, 'cristalNegro');
                L.caja('negroMetal', cx - 0.13, hb + 0.5, 0, 0.26, H - hb - 0.5, 0.2);
              }
              for (const d of [-1, 1]) L.cilindro('led', cx + d * hw * 0.25, hb - 0.0005, 0.25, 0.025, 0.002, 'y', 16, { sinSombra: true });
            }
            break;
          }
        }
      }

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
        L.cilindro('plasticoNegro', c.cx, encTop - 0.188, (c.z0 + c.z1) / 2, 0.035, 0.004, 'y', 24);
        // grifo
        const zg = c.z0 - 0.05;
        L.cilindro('cromo', c.cx, encTop + 0.03, zg, 0.024, 0.06, 'y', 24);
        const curva = new THREE.CubicBezierCurve3(
          new THREE.Vector3(c.cx, encTop + 0.05, zg), new THREE.Vector3(c.cx, encTop + 0.45, zg),
          new THREE.Vector3(c.cx, encTop + 0.45, zg + 0.24), new THREE.Vector3(c.cx, encTop + 0.27, zg + 0.24));
        L.add(new THREE.TubeGeometry(curva, 32, 0.011, 12), 'cromo');
        L.caja('cromo', c.cx + 0.02, encTop + 0.075, zg - 0.008, 0.09, 0.012, 0.016);
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

    // ---------- zócalo ----------
    let z0 = null;
    const cierraZ = (xEnd) => { if (z0 === null) return; let a = z0, b = xEnd; if (t.esqFinPared && Math.abs(b - fin) < 1e-6) b += 0.07; if (t.esqIniPared && Math.abs(a - t.ini) < 1e-6) a -= 0.07; L.caja('zocalo', a, 0.002, zf - 0.05, b - a, M.zoc - 0.004, 0.016); z0 = null; };
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

    // ---------- LED bajo los altos ----------
    let l0 = null;
    const cierraL = (xe) => { if (l0 === null) return; if (xe - l0 > 0.2) { L.caja('led', l0 + 0.02, ya - 0.006, za - 0.07, xe - l0 - 0.04, 0.004, 0.012, { sinSombra: true }); ledes.push({ R, x0: l0, x1: xe, y: ya - 0.012, z: za - 0.12, n: t.n }); } l0 = null; };
    for (const q of sl) {
      const conCasco = !q.col && (ALTO_CON_CASCO.has(q.m.alto) || (q.m.alto === 'campana' && !DECORATIVAS.has(est.campana)));
      if (!conCasco) { cierraL(q.s); continue; }
      if (l0 === null) l0 = q.s;
    }
    cierraL(fin);
  }

  return { lote: L, picks, ledes };
}
