// Accesorios de baño de piso piloto: toallas en el radiador (o en un toallero), dispensador y vaso en la encimera,
// toallero de aro, portarrollos, botes en la hornacina, alfombrilla delante de la ducha, planta y cesto.
// El baño en sí (sanitarios, mueble, mampara, alicatado) lo construye js/bano.js; esto solo lo viste.
//
//   decorarBano(e, estilo = 'nordico', densidad = 'completo', semilla = 1) → Lote
//
// `e` es el estado del baño (bano-modelo.js; en la casa: estadoBanoCasa). El lote va en las coordenadas de la sala del
// baño en metros (pared A en z = 0, x a lo largo de A), que son las mismas que el marco local de su estancia.
import { Lote } from '../geo.js';
import { rng } from '../texturas.js';
import { paredesBano, planta as huellas, barridoPuerta, hornacina, rectPared } from '../bano-modelo.js';
import { Kit, tf, gToro } from './kit.js';
import { ESTILOS } from './estilos.js';
import * as P from './piezas.js';

const cm = v => v / 100;
const solapa = (a, b, t = 0.5) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > t && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > t;
const TOALLAS = { nordico: ['toallaBlanca', 'toallaSalvia'], moderno: ['toallaGris', 'toallaBlanca'], industrial: ['toallaArena', 'toallaRayas'], clasico: ['toallaBlanca', 'toallaRayas'] };
const METAL = { cromo: 'cromo', negro: 'negroMate', oro: 'laton' };

// Toalla colgada de una barra horizontal en (x, y, z) del marco de pared: cae por delante y por detrás.
function toallaColgada(k, celda, x, y, z, ancho, largo) {
  k.cil(celda, x, y, z, 0.018, 0.018, ancho, 12, 'x');
  k.panel(celda, x - ancho / 2, y - largo, z + 0.006, ancho, largo, 0.014, 0.006);
  k.panel(celda, x - ancho / 2 + 0.01, y - largo * 0.62, z - 0.02, ancho - 0.02, largo * 0.62, 0.012, 0.006);
}

export function decorarBano(e, estilo = 'nordico', densidad = 'completo', semilla = 1) {
  const st = ESTILOS[estilo] || ESTILOS.nordico;
  const completo = densidad !== 'minimo';
  const r = rng(semilla);
  const L = new Lote(), k = new Kit(L);
  const Pa = paredesBano(e), H = huellas(e);
  const metal = METAL[e.estilo?.griferia] || 'cromo';
  const [t1, t2] = TOALLAS[st.id];
  const W = e.sala.ancho, D = e.sala.fondo;
  // marco de una pared de la sala (cm → m)
  const en = (id, s = 0, d = 0, y = 0) => {
    const p = Pa[id];
    k.en(cm(p.a[0] + p.dir[0] * s + p.n[0] * d), cm(p.a[1] + p.dir[1] * s + p.n[1] * d), Math.atan2(-p.dir[1], p.dir[0]), y);
  };
  const ocupado = [];                                                // rectángulos de planta (cm) ya usados
  for (const q of H) { ocupado.push(q.rect); if (q.zonaRect) ocupado.push(q.zonaRect); }
  const barrido = barridoPuerta(e); if (barrido) ocupado.push(barrido);
  const puertaEn = (id, s0, s1) => e.puerta && e.puerta.pared === id && Math.min(s1, e.puerta.x + e.puerta.ancho + 5) - Math.max(s0, e.puerta.x - 5) > 0;
  const ventanaEn = (id, s0, s1, y) => e.ventana?.activa && e.ventana.pared === id && y > e.ventana.antepecho - 5 && Math.min(s1, e.ventana.x + e.ventana.ancho) - Math.max(s0, e.ventana.x) > 0;
  // ¿hay alguna pieza en esa pared en [s0,s1] (cm)?
  const piezaEn = (id, s0, s1, menos = null) => H.some(q => q !== menos && q.pared === id && Math.min(q.s1, s1) - Math.max(q.s0, s0) > 0);
  const enSala = (s, id, d = 10) => s >= d && s <= Pa[id].largo - d;

  // ---------- mueble de lavabo ----------
  const mu = H.find(q => q.tipo === 'mueble');
  if (mu) {
    const el = mu.el, x0 = cm(mu.s0), w = cm(el.ancho);
    const top = el.lavabo === 'sobre' ? 0.762 : 0.83;
    en(mu.pared);
    // dispensador de jabón y vaso con cepillos en las esquinas de atrás
    k.cil(st.id === 'industrial' ? 'vidrioAmbar' : st.id === 'moderno' ? 'ceramicaNegra' : 'ceramica', x0 + 0.055, top, 0.07, 0.028, 0.03, 0.12, 14);
    k.cil(metal, x0 + 0.055, top + 0.12, 0.07, 0.009, 0.009, 0.03, 8);
    k.barra(metal, [x0 + 0.055, top + 0.145, 0.07], [x0 + 0.055, top + 0.145, 0.105], 0.004, 5);
    k.cil('cristal', x0 + w - 0.055, top, 0.07, 0.03, 0.026, 0.1, 14);
    for (const [dx, c] of [[-0.008, 'plasticoBlanco'], [0.009, st.id === 'nordico' ? 'salvia' : 'piedra']]) k.barra(c, [x0 + w - 0.055 + dx, top + 0.02, 0.07], [x0 + w - 0.055 + dx * 2.5, top + 0.2, 0.065], 0.004, 5);
    if (completo && w >= 0.95) {
      // toallitas dobladas y una vela
      k.panel(t1, x0 + w - 0.33, top, 0.06, 0.22, 0.03, 0.16, 0.008); k.panel(t2, x0 + w - 0.325, top + 0.03, 0.065, 0.21, 0.028, 0.15, 0.008);
      P.vela(k, x0 + 0.15, top, 0.08, 0.07, 0.03);
    }
    // toallero de aro con toalla de manos junto al mueble
    for (const lado of [1, -1]) {
      const s = lado > 0 ? mu.s1 + 20 : mu.s0 - 20;
      if (!enSala(s, mu.pared, 16) || piezaEn(mu.pared, s - 16, s + 16) || puertaEn(mu.pared, s - 16, s + 16) || ventanaEn(mu.pared, s - 16, s + 16, 60)) continue;
      en(mu.pared);
      const x = cm(s), y = 1.12;
      k.cil(metal, x, y + 0.1, 0.012, 0.022, 0.022, 0.024, 12, 'z');
      k.barra(metal, [x, y + 0.1, 0.02], [x, y + 0.1, 0.045], 0.006, 6);
      k.geo(metal, tf(gToro(0.085, 0.0055, 6, 28), { x, y: y + 0.02, z: 0.05 }));
      toallaColgada(k, t2, x, y - 0.065, 0.05, 0.3, 0.42);
      break;
    }
  }

  // ---------- radiador toallero (toallas dobladas sobre las barras) o toallero de barra ----------
  const ra = H.find(q => q.tipo === 'radiador');
  if (ra) {
    const x0 = cm(ra.s0), w = cm(ra.el.ancho), alto = cm(ra.el.alto), y0 = 0.15;
    en(ra.pared);
    toallaColgada(k, t1, x0 + w / 2, y0 + alto * 0.7, 0.055, w - 0.07, Math.min(0.55, alto * 0.45));
    if (completo) toallaColgada(k, t2, x0 + w / 2, y0 + alto * 0.28, 0.055, w - 0.14, Math.min(0.24, alto * 0.2));
  } else {
    // barra en un paño libre (sin piezas, puerta ni ventana) a 1,15 m
    salir: for (const id of ['A', 'B', 'C', 'D']) {
      for (let s = 45; s <= Pa[id].largo - 45; s += 10) {
        if (piezaEn(id, s - 40, s + 40) || puertaEn(id, s - 40, s + 40) || ventanaEn(id, s - 40, s + 40, 70)) continue;
        en(id);
        const x = cm(s), y = 1.15;
        for (const dx of [-0.3, 0.3]) k.cil(metal, x + dx, y, 0.03, 0.012, 0.012, 0.06, 8, 'z');
        k.cil(metal, x, y, 0.06, 0.009, 0.009, 0.62, 10, 'x');
        toallaColgada(k, t1, x, y, 0.06, 0.5, 0.55);
        break salir;
      }
    }
  }

  // ---------- inodoro: portarrollos (y escobillero) ----------
  const ino = H.find(q => q.tipo === 'inodoro');
  if (ino) {
    for (const lado of [1, -1]) {
      const s = ino.el.x + lado * 36;
      if (!enSala(s, ino.pared, 8) || piezaEn(ino.pared, s - 8, s + 8, ino) || puertaEn(ino.pared, s - 8, s + 8)) continue;
      en(ino.pared);
      const x = cm(s), y = 0.72;
      k.cil(metal, x, y, 0.0, 0.025, 0.025, 0.02, 12, 'z');
      k.barra(metal, [x, y, 0.01], [x, y, 0.07], 0.005, 6);
      k.cil('papel', x, y - 0.03, 0.07, 0.055, 0.055, 0.1, 18, 'x');
      if (completo) {
        // escobillero en el suelo, al mismo lado
        const rr = rectPared(Pa[ino.pared], s - 7, s + 7, 3, 17);
        if (!ocupado.some(o => o !== ino.rect && o !== ino.zonaRect && solapa(rr, o))) {
          k.cil(st.id === 'clasico' ? 'laton' : st.id === 'moderno' ? 'negroMate' : 'ceramica', x, 0, 0.1, 0.05, 0.045, 0.3, 14);
          k.cil(metal, x, 0.3, 0.1, 0.008, 0.008, 0.1, 6);
        }
      }
      break;
    }
  }

  // ---------- ducha: repisa de rejilla con botes (bajo la hornacina, o junto al grifo) ----------
  const du = H.find(q => q.tipo === 'ducha');
  if (du && completo) {
    const n = hornacina(e);
    const x0 = n ? cm(n.x0) : cm(du.s0) + 0.1, x1 = n ? cm(n.x1) : Math.min(cm(du.s1) - 0.1, x0 + 0.32), y = n ? cm(n.y0) - 0.16 : 1.0;
    en(du.pared);
    k.caja(metal, x0, y - 0.008, 0.01, x1 - x0, 0.008, 0.11);
    k.caja(metal, x0, y - 0.008, 0.115, x1 - x0, 0.035, 0.005);
    for (const xx of [x0 + 0.01, x1 - 0.01]) k.caja(metal, xx - 0.004, y - 0.06, 0.0, 0.008, 0.06, 0.012);
    const botes = [['plasticoBlanco', 0.2, 0.03], [st.id === 'nordico' ? 'salvia' : st.id === 'clasico' ? 'burdeos' : 'ceramicaNegra', 0.17, 0.028], ['vidrioAmbar', 0.13, 0.026]];
    let x = x0 + 0.045;
    for (const [c, h, rr] of botes) { if (x + rr > x1 - 0.01) break; k.cil(c, x, y, 0.062, rr, rr, h, 12); k.cil('negro', x, y + h, 0.062, rr * 0.5, rr * 0.5, 0.025, 8); x += 2 * rr + 0.02; }
  }
  const ag = H.find(q => q.tipo === 'ducha') || H.find(q => q.tipo === 'banera');
  if (ag) {
    const p = Pa[ag.pared], an = Math.min(80, ag.s1 - ag.s0 - 10), fondo = 50;
    for (const desp of [0, -15, 15, -30, 30]) {
      const sc = (ag.s0 + ag.s1) / 2 + desp;
      const rr = rectPared(p, sc - an / 2, sc + an / 2, ag.d + 4, ag.d + 4 + fondo);
      if (rr.x0 < 2 || rr.z0 < 2 || rr.x1 > W - 2 || rr.z1 > D - 2) continue;
      if (ocupado.some(o => o !== ag.rect && solapa(rr, o) && o !== H.find(q => q.tipo === 'mueble')?.zonaRect)) continue;
      if (barrido && solapa(rr, barrido)) continue;
      en(ag.pared, sc, ag.d + 4);
      k.caja('alfombraBano', -cm(an) / 2, 0, 0, cm(an), 0.01, cm(fondo));
      ocupado.push(rr);
      break;
    }
  }

  // ---------- planta y cesto en esquinas libres ----------
  if (completo) {
    let puestos = 0;
    for (const [x, z] of [[22, 22], [W - 22, 22], [W - 22, D - 22], [22, D - 22]]) {
      if (puestos >= 2) break;
      const rr = { x0: x - 18, x1: x + 18, z0: z - 18, z1: z + 18 };
      if (rr.x0 < 0 || rr.z0 < 0 || rr.x1 > W || rr.z1 > D || ocupado.some(o => solapa(rr, o))) continue;
      ocupado.push(rr);
      k.en(cm(x), cm(z), 0);
      if (puestos === 0) P.planta(k, r, 0, 0, 0, st.id === 'clasico' ? 'boj' : 'sansevieria', st.maceta, 1);
      else { k.cil(st.id === 'industrial' ? 'cuerda' : 'mimbre', 0, 0, 0, 0.17, 0.15, 0.5, 18); k.cil('lino', 0, 0.5, 0, 0.165, 0.165, 0.02, 18); }
      k.mancha(0, 0, 0.22);
      puestos++;
    }
  }
  return L;
}
