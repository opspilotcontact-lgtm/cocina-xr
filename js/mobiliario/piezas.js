// Muebles de piso piloto. Cada función dibuja en el marco actual del kit: x centrado en el mueble, z = 0 contra la
// pared (o el respaldo) y +z hacia la estancia, y = 0 en el suelo. El estilo (estilos.js) cambia FORMAS: patas,
// brazos, cabecero, tiradores, lámparas, sillas…; no solo colores.
import * as THREE from 'three';
import { tf, gCil, gTorno, gEsfera } from './kit.js';
import { filaLibros, pilaLibros, jarron, flores, planta, vela, cuenco, bandeja, marcoFoto, lamparaMesa, bodegon, LIBROS } from './objetos.js';

const PI = Math.PI;
const elegir = (r, l) => l[(r() * l.length) | 0];

// ---------- patas ----------
const perfilTorneado = h => [[0, 0], [0.014, 0], [0.017, 0.06], [0.012, 0.2], [0.021, 0.36], [0.025, 0.52], [0.017, 0.72], [0.023, 0.86], [0.022, 1], [0, 1]].map(([a, b]) => [a, b * h]);
// puntos: [x, z, sx, sz] con (sx, sz) hacia fuera (las cónicas se abren un poco)
export function patas(k, st, puntos, h, y = 0, tipo = st.patas) {
  if (h <= 0.005) return;
  for (const [x, z, sx = 0, sz = 0] of puntos) {
    if (tipo === 'conicas') k.barra(null, [x + sx * 0.022, y, z + sz * 0.022], [x, y + h, z], 0.011, 8, 'mob:madera', 0.019);
    else if (tipo === 'metal') k.caja(st.metal, x - 0.009, y, z - 0.009, 0.018, h, 0.018);
    else if (tipo === 'tubo') k.cil(st.metal, x, y, z, 0.015, 0.015, h, 10);
    else k.maderaGeo(tf(gTorno(perfilTorneado(h), 12), { x, y, z }));
  }
}
const esquinas = (x0, x1, z0, z1, m = 0.04) => [[x0 + m, z0 + m, -1, -1], [x1 - m, z0 + m, 1, -1], [x1 - m, z1 - m, 1, 1], [x0 + m, z1 - m, -1, 1]];
const altoPata = st => ({ conicas: 0.16, metal: 0.12, tubo: 0.1, torneadas: 0.11 }[st.patas]);

// Tirador según estilo, centrado en (x, y) sobre un frente en z
function tirador(k, st, x, y, z, vertical = false, largo = 0.16) {
  if (st.id === 'nordico') k.esfera('maderaClara', x, y, z + 0.012, 0.014, 0.014, 0.012, 10, 6);
  else if (st.id === 'moderno') vertical ? k.caja('negroMate', x - 0.006, y - largo / 2, z, 0.012, largo, 0.018) : k.caja('negroMate', x - largo / 2, y - 0.006, z, largo, 0.012, 0.018);
  else if (st.id === 'industrial') { k.caja('aceroNegro', x - 0.05, y - 0.012, z, 0.1, 0.024, 0.006); k.barra('aceroNegro', [x - 0.04, y, z + 0.02], [x + 0.04, y, z + 0.02], 0.005, 6); }
  else { k.cil('laton', x, y, z + 0.006, 0.006, 0.006, 0.012, 8, 'z'); k.esfera('laton', x, y, z + 0.018, 0.012, 0.012, 0.01, 10, 6); }
}

// ---------- cuerpo genérico (aparador, mueble TV, cómoda, mesilla, consola) ----------
// frentes: 'puertas' | 'cajones' | 'abierto'; colgado: sin patas (moderno, mueble TV). Devuelve el alto del tablero.
export function cuerpo(k, st, w, d, h, { frentes = 'puertas', n = null, colgado = false, y0 = null } = {}) {
  const x0 = -w / 2, t = 0.02;
  const base = y0 != null ? y0 : colgado ? 0.24 : st.id === 'clasico' ? 0.1 : st.id === 'industrial' ? 0.04 : altoPata(st);
  const hc = h - base;
  if (st.id === 'industrial') {
    // bastidor de acero con baldas de madera
    for (const [x, z] of [[x0 + 0.015, 0.015], [-x0 - 0.015, 0.015], [-x0 - 0.015, d - 0.015], [x0 + 0.015, d - 0.015]]) k.caja(st.metal, x - 0.015, 0, z - 0.015, 0.03, h, 0.03);
    for (const y of [base, h - 0.035]) { k.caja(st.metal, x0, y - 0.03, 0, 0.03, 0.03, d); k.caja(st.metal, -x0 - 0.03, y - 0.03, 0, 0.03, 0.03, d); }
    k.madera(x0, h - 0.035, -0.005, w, 0.035, d + 0.01, 0.003);
    k.madera(x0 + 0.03, base, 0.01, w - 0.06, 0.03, d - 0.02, 0.002);
    if (frentes === 'cajones' || hc > 0.5) {
      // cajonera central de madera con asas de chapa
      const nn = n || Math.max(1, Math.round(hc / 0.2));
      const cw = frentes === 'cajones' ? w - 0.06 : Math.min(0.5, w * 0.4);
      const hh = (h - 0.035 - base - 0.03) / nn;
      for (let i = 0; i < nn; i++) {
        k.madera(-cw / 2, base + 0.03 + i * hh + 0.004, 0.02, cw, hh - 0.008, d - 0.04, 0.003);
        tirador(k, st, 0, base + 0.03 + i * hh + hh / 2, d - 0.02);
      }
    }
    return h;
  }
  // casco
  const frente = st.id === 'nordico' ? st.laca : st.id === 'moderno' ? null : null; // null → madera
  if (st.id === 'clasico') {
    k.madera(x0 + 0.02, 0, 0.02, w - 0.04, base, d - 0.04, 0.004);                 // zócalo
    k.madera(x0 - 0.015, h - 0.03, -0.0, w + 0.03, 0.03, d + 0.02, 0.006);           // cornisa
    k.madera(x0, h - 0.045, 0, w, 0.015, d + 0.008, 0.002);
  } else {
    k.madera(x0, h - t, 0, w, t, d, 0.004);
    if (!colgado) patas(k, st, esquinas(x0, -x0, 0, d, 0.05), base);
  }
  k.madera(x0, base, 0, t, hc - (st.id === 'clasico' ? 0.045 : t), d, 0.002);
  k.madera(-x0 - t, base, 0, t, hc - (st.id === 'clasico' ? 0.045 : t), d, 0.002);
  k.madera(x0 + t, base, 0, w - 2 * t, t, d, 0.002);
  k.madera(x0 + t, base, 0, w - 2 * t, hc - t, 0.012, 0);
  const yf0 = base + 0.004, yf1 = h - (st.id === 'clasico' ? 0.05 : t) - 0.003, hf = yf1 - yf0;
  const pintarFrente = (fx, fy, fw, fh) => {
    if (frente) k.panel(frente, fx, fy, d - 0.002, fw, fh, 0.019, 0.003);
    else k.madera(fx, fy, d - 0.002, fw, fh, 0.019, 0.003);
    if (st.id === 'clasico') k.madera(fx + 0.04, fy + 0.04, d + 0.016, fw - 0.08, fh - 0.08, 0.008, 0.004);   // cuarterón
  };
  if (frentes === 'abierto') {
    k.madera(x0 + t, base + hc * 0.48, 0.012, w - 2 * t, 0.018, d - 0.02, 0);
    return h;
  }
  if (frentes === 'cajones') {
    const nn = n || Math.max(1, Math.round(hf / 0.19));
    const hh = hf / nn;
    for (let i = 0; i < nn; i++) {
      const fy = yf0 + i * hh;
      pintarFrente(x0 + t + 0.002, fy + 0.002, w - 2 * t - 0.004, hh - 0.004);
      if (w > 0.7 && st.id === 'clasico') { tirador(k, st, -w * 0.25, fy + hh / 2, d + 0.017); tirador(k, st, w * 0.25, fy + hh / 2, d + 0.017); }
      else tirador(k, st, 0, fy + hh / 2 + (st.id === 'moderno' ? hh / 2 - 0.03 : 0), d + 0.017, false, Math.min(0.3, w * 0.4));
    }
    return h;
  }
  const nn = n || Math.max(1, Math.round((w - 2 * t) / 0.5));
  const pw = (w - 2 * t) / nn;
  for (let i = 0; i < nn; i++) {
    const fx = x0 + t + i * pw;
    pintarFrente(fx + 0.002, yf0, pw - 0.004, hf);
    const lado = i % 2 === 0 ? 1 : -1;
    const tx = nn === 1 ? 0 : fx + pw / 2 + lado * (pw / 2 - 0.05);
    if (st.id === 'moderno') tirador(k, st, fx + pw / 2, yf1 - 0.03, d + 0.017, false, Math.min(0.25, pw * 0.5));
    else tirador(k, st, tx, yf0 + hf * (h < 0.6 ? 0.5 : 0.72), d + 0.017, true, 0.12);
  }
  return h;
}

// ---------- sofá y butaca ----------
// Huella: ancho × 0.9. Brazos y patas según estilo; cojines del atlas.
export function sofa(k, st, W, r, { completo = true, butaca = false } = {}) {
  const D = butaca ? 0.82 : 0.9;
  const ba = { fino: 0.09, recto: 0.15, ancho: 0.22, enrollado: 0.18 }[st.brazo];
  const hp = { conicas: 0.15, metal: 0.1, tubo: 0.07, torneadas: 0.1 }[st.patas];
  const hArm = { fino: 0.6, recto: 0.56, ancho: 0.68, enrollado: 0.66 }[st.brazo];
  const hBack = { nordico: 0.84, moderno: 0.76, industrial: 0.76, clasico: 0.92 }[st.id];
  const ys = 0.31;                       // tapa de la base = apoyo de los cojines
  const x0 = -W / 2, xi = x0 + ba, wi = W - 2 * ba;
  k.tela(xi - 0.01, hp, 0, wi + 0.02, ys - hp, D, 0.025);                     // base
  k.tela(xi - 0.01, hp, 0, wi + 0.02, hBack - hp, 0.2, st.id === 'clasico' ? 0.08 : 0.05);  // respaldo
  for (const s of [-1, 1]) {
    const ax = s < 0 ? x0 : -x0 - ba;
    if (st.brazo === 'enrollado') {
      k.tela(ax, hp, 0, ba, hArm - hp - 0.06, D, 0.03);
      const g = tf(gCil(0.085, 0.085, D - 0.02, 18), { rx: PI / 2, x: ax + ba / 2 + s * 0.02, y: hArm - 0.07, z: D / 2 });
      k.telaGeo(g);
    } else k.tela(ax, hp, 0, ba, hArm - hp, D, st.brazo === 'ancho' ? 0.06 : st.brazo === 'recto' ? 0.02 : 0.035);
  }
  // cojines de asiento y de respaldo
  const n = butaca ? 1 : wi > 1.6 ? 3 : 2, cw = wi / n;
  for (let i = 0; i < n; i++) {
    const cx = xi + i * cw;
    k.tela(cx + 0.004, ys, 0.19, cw - 0.008, 0.13, D - 0.21, 0.05);
    if (st.id !== 'moderno' || !butaca) k.tela(cx + 0.006, ys + 0.1, 0.17, cw - 0.012, hBack - ys - 0.04, 0.17, 0.07, { rx: -0.13 });
  }
  // cojines decorativos
  const sitios = butaca ? [0] : completo ? [-1, -0.62, 0.62, 1] : [-1, 1];
  sitios.forEach((f, i) => {
    const cel = st.cojines[i % st.cojines.length];
    const lado = Math.sign(f) || 1, a = Math.abs(f);
    const t = st.id === 'moderno' ? 0.5 : 0.45, cxp = butaca ? 0 : lado * (wi / 2 - 0.27 - (a < 1 ? 0.3 : 0));
    k.panel(cel, cxp - t / 2, ys + 0.13, 0.27, t, t, 0.13, 0.055, { rx: -0.33 + (r() - 0.5) * 0.06, rz: lado * (0.05 + r() * 0.08) }, 3);
  });
  if (completo && !butaca && st.manta) {
    // manta doblada sobre un brazo
    const ax = -x0 - ba / 2;
    k.panel(st.manta, ax - ba / 2 - 0.02, hArm - (st.brazo === 'enrollado' ? 0 : 0.0), D * 0.25, ba + 0.04, 0.025, 0.42, 0.01);
    k.panel(st.manta, -x0 + 0.004, hArm - 0.36, D * 0.25, 0.02, 0.36, 0.42, 0.008);
  }
  // patas
  const P = esquinas(x0, -x0, 0, D, 0.06);
  if (st.patas === 'tubo') {
    // patín de tubo negro a cada lado (industrial)
    for (const x of [x0 + 0.06, -x0 - 0.06]) { k.barra(st.metal, [x, 0.012, 0.06], [x, 0.012, D - 0.06], 0.012, 8); k.barra(st.metal, [x, 0.012, 0.08], [x, hp, 0.08], 0.012, 8); k.barra(st.metal, [x, 0.012, D - 0.08], [x, hp, D - 0.08], 0.012, 8); }
  } else patas(k, st, P, hp);
  k.mancha(0, D / 2, W / 2 + 0.1, D / 2 + 0.1);
  return { ancho: W, fondo: D, alto: Math.max(hArm, hBack) };
}

// ---------- mesa de centro ----------
export function mesaCentro(k, st, r, completo) {
  const h = 0.4;
  if (st.id === 'nordico') {
    const R = 0.42;
    k.maderaGeo(tf(gCil(R, R, 0.03, 36), { x: 0, y: h - 0.015, z: 0 }));
    k.maderaGeo(tf(gCil(R * 0.8, R * 0.8, 0.02, 30), { x: 0, y: 0.14, z: 0 }));
    patas(k, st, [0, 1, 2, 3].map(i => { const a = i * PI / 2 + PI / 4; return [Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7, Math.cos(a), Math.sin(a)]; }), h - 0.03);
    k.mancha(0, 0, R + 0.08);
    if (completo) bodegon(k, r, 0, h, 0, 0.5, st, 1);
    return { ancho: 2 * R, fondo: 2 * R, alto: h };
  }
  const w = st.id === 'clasico' ? 1.0 : 1.1, d = 0.6;
  if (st.id === 'moderno') {
    // tablero de madera sobre dos patines de pletina negra
    k.madera(-w / 2, h - 0.035, -d / 2, w, 0.035, d, 0.006);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.12);
      k.caja(st.metal, x - 0.01, 0, -d / 2 + 0.04, 0.02, 0.015, d - 0.08);
      k.caja(st.metal, x - 0.01, h - 0.05, -d / 2 + 0.04, 0.02, 0.015, d - 0.08);
      for (const z of [-d / 2 + 0.04, d / 2 - 0.06]) k.caja(st.metal, x - 0.01, 0, z, 0.02, h - 0.035, 0.02);
    }
  } else if (st.id === 'industrial') {
    k.madera(-w / 2, h - 0.05, -d / 2, w, 0.05, d, 0.004);
    k.madera(-w / 2 + 0.05, 0.1, -d / 2 + 0.05, w - 0.1, 0.03, d - 0.1, 0.003);
    for (const [x, z] of [[-w / 2 + 0.04, -d / 2 + 0.04], [w / 2 - 0.04, -d / 2 + 0.04], [w / 2 - 0.04, d / 2 - 0.04], [-w / 2 + 0.04, d / 2 - 0.04]]) k.caja(st.metal, x - 0.015, 0, z - 0.015, 0.03, h - 0.05, 0.03);
    for (const z of [-d / 2 + 0.025, d / 2 - 0.055]) k.caja(st.metal, -w / 2 + 0.04, 0.07, z, w - 0.08, 0.03, 0.03);
    // ruedas
    for (const [x, z] of [[-w / 2 + 0.04, -d / 2 + 0.04], [w / 2 - 0.04, d / 2 - 0.04]]) k.cil('negro', x, 0.035, z, 0.035, 0.035, 0.02, 12, 'x');
  } else {
    k.madera(-w / 2, h - 0.035, -d / 2, w, 0.035, d, 0.008);
    k.madera(-w / 2 + 0.04, h - 0.1, -d / 2 + 0.04, w - 0.08, 0.065, d - 0.08, 0.003);
    k.madera(-w / 2 + 0.06, 0.1, -d / 2 + 0.06, w - 0.12, 0.022, d - 0.12, 0.003);
    patas(k, st, esquinas(-w / 2, w / 2, -d / 2, d / 2, 0.06), h - 0.035);
  }
  k.mancha(0, 0, w / 2 + 0.08, d / 2 + 0.08);
  if (completo) bodegon(k, r, 0, h, 0, w, st, st.id === 'moderno' ? 0 : st.id === 'industrial' ? 2 : 1);
  return { ancho: w, fondo: d, alto: h };
}

// ---------- alfombra (rectangular, en el atlas) ----------
export function alfombra(k, celda, w, d, x = 0, z = 0) {
  k.caja(celda, x - w / 2, 0, z - d / 2, w, 0.008, d);
}

// ---------- mueble de TV con televisor ----------
export function muebleTV(k, st, w, r, completo, H) {
  const d = 0.42;
  const colgado = st.id === 'moderno';
  const h = colgado ? 0.48 : 0.5;
  const top = cuerpo(k, st, w, d, h, { frentes: st.id === 'clasico' ? 'puertas' : st.id === 'nordico' ? 'puertas' : 'abierto', n: st.id === 'clasico' ? 2 : 3, colgado });
  // televisor 55″ (1,23 × 0,71) en la pared (moderno, nórdico) o sobre peana
  const tw = Math.min(1.23, w - 0.25), th = tw * 0.577;
  const enPared = st.id === 'moderno' || st.id === 'nordico';
  const yc = enPared ? Math.max(top + 0.15 + th / 2, 1.05) : top + 0.07 + th / 2;
  const zt = enPared ? 0.02 : 0.1;
  k.panel('negro', -tw / 2, yc - th / 2, zt, tw, th, 0.028, 0.004);
  k.caja('pantallaTV', -tw / 2 + 0.008, yc - th / 2 + 0.008, zt + 0.028, tw - 0.016, th - 0.016, 0.001);
  if (!enPared) {
    k.caja('negro', -0.12, top, zt - 0.06, 0.24, 0.008, 0.16);
    k.caja('negro', -0.025, top, zt - 0.02, 0.05, 0.07, 0.02);
  }
  if (completo) {
    const xs = w / 2 - 0.17;
    planta(k, r, -xs, top, d * 0.5, 'pequena', st.maceta, 1.1);
    const yy = pilaLibros(k, r, xs, top, d * 0.5, 2, 0.2, 0.2);
    vela(k, xs, yy, d * 0.5, 0.08, 0.03);
  }
  if (!colgado) k.mancha(0, d / 2, w / 2 + 0.06, d / 2 + 0.06);
  return { ancho: w, fondo: d, alto: Math.max(h, enPared ? 0 : yc + th / 2) };
}

// ---------- estantería con libros y objetos ----------
export function estanteria(k, st, w, h, r) {
  const d = 0.33, t = 0.022;
  const nb = Math.max(4, Math.round(h / 0.38));
  const hb = (h - 0.08) / nb;
  const baldas = Array.from({ length: nb + 1 }, (_, i) => 0.06 + i * hb);
  if (st.id === 'industrial') {
    for (const x of [-w / 2 + 0.015, w / 2 - 0.015]) for (const z of [0.015, d - 0.015]) k.caja(st.metal, x - 0.015, 0, z - 0.015, 0.03, h, 0.03);
    k.barra(st.metal, [-w / 2 + 0.02, 0.1, 0.01], [w / 2 - 0.02, h - 0.1, 0.01], 0.006, 6);
    k.barra(st.metal, [w / 2 - 0.02, 0.1, 0.01], [-w / 2 + 0.02, h - 0.1, 0.01], 0.006, 6);
    for (const y of baldas) k.madera(-w / 2 + 0.005, y, 0.005, w - 0.01, 0.03, d - 0.01, 0.003);
  } else if (st.id === 'moderno') {
    for (const x of [-w / 2, -t / 2, w / 2 - t]) k.panel(st.laca, x, 0.05, 0, t, h - 0.05, d, 0.002);
    for (const y of baldas) k.panel(st.laca, -w / 2, y - t / 2, 0, w, t, d, 0.002);
    k.caja('negro', -w / 2 + 0.02, 0, 0.02, w - 0.04, 0.05, d - 0.04);
  } else {
    k.madera(-w / 2, 0, 0, t, h, d, 0.003); k.madera(w / 2 - t, 0, 0, t, h, d, 0.003);
    for (const y of baldas) k.madera(-w / 2 + t, y - t / 2, 0, w - 2 * t, t, d, 0.002);
    if (st.id === 'clasico') { k.madera(-w / 2 - 0.02, h, -0.0, w + 0.04, 0.04, d + 0.03, 0.006); k.madera(-w / 2 + t, 0, 0, w - 2 * t, 0.06, d, 0.003); k.madera(-w / 2 + t, 0, 0, w - 2 * t, h, 0.01, 0); }
  }
  // contenido por balda (la de abajo, cestos; el resto, libros y objetos)
  const ancho = st.id === 'moderno' ? w / 2 - t * 1.5 : w - 2 * t - 0.01;
  const cols = st.id === 'moderno' ? [-w / 2 + t, t / 2] : [-w / 2 + t + 0.005];
  for (let i = 0; i < nb; i++) {
    const y = baldas[i] + t / 2, hl = hb - t - 0.03;
    for (const x0 of cols) {
      const v = (i + (x0 > 0 ? 1 : 0) + ((r() * 3) | 0)) % 4;
      if (i === 0) {
        if (st.id === 'clasico') { filaLibros(k, r, x0 + 0.01, y, 0.06, ancho - 0.02, Math.min(hl, 0.32)); continue; }
        const cb = Math.min(0.32, ancho * 0.45);
        for (const cx of ancho > 0.6 ? [x0 + 0.03, x0 + ancho - cb - 0.03] : [x0 + (ancho - cb) / 2]) k.panel(st.id === 'industrial' ? 'cuerda' : 'mimbre', cx, y, 0.05, cb, Math.min(hl, 0.24), 0.25, 0.01);
        continue;
      }
      if (v === 0) filaLibros(k, r, x0 + 0.01, y, 0.06, ancho * 0.7, Math.min(hl, 0.3));
      else if (v === 1) { filaLibros(k, r, x0 + 0.01, y, 0.06, ancho * 0.4, Math.min(hl, 0.28)); jarron(k, x0 + ancho * 0.72, y, d / 2, Math.min(hl, 0.22), elegir(r, ['ceramica', 'ceramicaArena', st.maceta]), (r() * 4) | 0); }
      else if (v === 2) { const yy = pilaLibros(k, r, x0 + ancho * 0.3, y, d / 2, 3, Math.min(0.26, ancho * 0.45)); cuenco(k, x0 + ancho * 0.3, yy, d / 2, 0.08, 'ceramicaArena'); if (ancho > 0.5) planta(k, r, x0 + ancho * 0.78, y, d / 2, 'pequena', st.maceta, 1.1); }
      else { marcoFoto(k, x0 + ancho * 0.25, y, 0.08, 0.13, Math.min(hl - 0.02, 0.18), st.marco); if (ancho > 0.4) filaLibros(k, r, x0 + ancho * 0.5, y, 0.06, ancho * 0.45, Math.min(hl, 0.26)); }
    }
  }
  return { ancho: w, fondo: d, alto: h };
}

// ---------- lámpara de pie (base en el origen); hacia: lado al que vuela el arco ----------
export function lamparaPie(k, st, hacia = 1) {
  if (st.lampara === 'tripode') {
    for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3 + PI / 6; k.barra(null, [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], [0, 1.0, 0], 0.012, 8, 'mob:madera', 0.014); }
    k.cil('negroMate', 0, 0.98, 0, 0.008, 0.008, 0.28, 6);
    k.cil('pantallaLino', 0, 1.22, 0, 0.17, 0.2, 0.3, 24);
    return 1.52;
  }
  if (st.lampara === 'arco') {
    k.cil('piedra', 0, 0, 0, 0.16, 0.17, 0.07, 24);
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * PI * 0.62; pts.push([hacia * (1 - Math.cos(a)) * 0.95, 0.07 + Math.sin(a) * 1.9 * (t < 0.5 ? 1 : 1) - (t > 0.7 ? (t - 0.7) * 0.6 : 0), 0]); }
    for (let i = 0; i < 10; i++) k.barra('cromo', pts[i], pts[i + 1], 0.011, 8);
    const [ex, ey] = pts[10];
    const dentro = [[0, 0.17], [0.07, 0.165], [0.13, 0.13], [0.17, 0.06], [0.19, 0]];
    k.torno('negroMate', dentro, ex, ey - 0.2, 0, 24);
    k.torno('blanco', [...dentro].reverse().map(([a, b]) => [a * 0.96, b * 0.96]), ex, ey - 0.2, 0, 24);
    k.cil('bombilla', ex, ey - 0.17, 0, 0.05, 0.05, 0.02, 14);
    return 1.9;
  }
  if (st.lampara === 'foco') {
    for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3 + PI / 2; k.barra(st.metal, [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [0, 1.2, 0], 0.01, 6); }
    k.dentro(0, 0, 0, 1.3, () => {
      k.geo('aceroNegro', tf(gCil(0.13, 0.11, 0.24, 20), { rx: 1.1, z: 0.05 }));
      k.geo('bombilla', tf(gCil(0.115, 0.115, 0.004, 20), { rx: 1.1, z: 0.16, y: -0.054 }));
    });
    return 1.45;
  }
  k.torno('laton', [[0, 0], [0.15, 0], [0.15, 0.02], [0.06, 0.05], [0.02, 0.1], [0.014, 1.2], [0.03, 1.24], [0.012, 1.3], [0, 1.3]], 0, 0, 0, 20);
  k.cil('pantallaPlisada', 0, 1.22, 0, 0.13, 0.24, 0.3, 28);
  return 1.52;
}

// ---------- lámpara de techo colgada en (x, z) desde el techo H hasta y ----------
export function colgante(k, st, x, z, H, y) {
  const caida = H - y;
  k.cil(st.id === 'clasico' ? 'laton' : 'blanco', x, H - 0.03, z, 0.05, 0.05, 0.03, 16);
  k.cil('negro', x, y + 0.1, z, 0.0025, 0.0025, caida - 0.12, 4);
  if (st.colgante === 'globo') { k.cil('negroMate', x, y + 0.24, z, 0.02, 0.02, 0.04, 10); k.esfera('pantallaLuz', x, y + 0.08, z, 0.17, 0.165, 0.17, 20, 14); return; }
  if (st.colgante === 'cupula' || st.colgante === 'campana') {
    const P = st.colgante === 'cupula'
      ? [[0.2, 0], [0.19, 0.06], [0.16, 0.12], [0.1, 0.17], [0.03, 0.19], [0, 0.19]]
      : [[0.21, 0], [0.18, 0.04], [0.09, 0.12], [0.05, 0.22], [0.04, 0.27], [0, 0.27]];
    k.torno(st.colgante === 'cupula' ? 'negroMate' : 'aceroNegro', [...P].reverse(), x, y, z, 28);
    k.torno('blanco', P.map(([a, b]) => [a * 0.95, b * 0.95]), x, y, z, 28);
    k.esfera('bombilla', x, y + 0.06, z, 0.05, 0.05, 0.05, 10, 8);
    return;
  }
  // araña clásica: columna de latón, brazos curvos y velas
  k.torno('laton', [[0, 0], [0.04, 0], [0.05, 0.05], [0.02, 0.12], [0.03, 0.25], [0.012, 0.35], [0, 0.35]], x, y - 0.05, z, 14);
  for (let i = 0; i < 6; i++) {
    const a = i * PI / 3, ex = x + Math.cos(a) * 0.28, ez = z + Math.sin(a) * 0.28;
    k.barra('laton', [x, y + 0.02, z], [x + Math.cos(a) * 0.2, y - 0.02, z + Math.sin(a) * 0.2], 0.007, 6);
    k.barra('laton', [x + Math.cos(a) * 0.2, y - 0.02, z + Math.sin(a) * 0.2], [ex, y + 0.08, ez], 0.007, 6);
    k.cil('laton', ex, y + 0.08, ez, 0.03, 0.02, 0.015, 10);
    k.cil('blanco', ex, y + 0.095, ez, 0.011, 0.011, 0.08, 8);
    k.esfera('bombilla', ex, y + 0.195, ez, 0.014, 0.024, 0.014, 8, 6);
  }
}

// ---------- cuadro en la pared, centrado en (x, yc) ----------
export function cuadro(k, st, celda, x, yc, w, h) {
  const fr = st.id === 'clasico' ? 0.05 : 0.022, pp = st.id === 'nordico' || st.id === 'clasico' ? 0.06 : 0;
  k.caja(st.marco, x - w / 2, yc - h / 2, 0.002, w, h, 0.03);
  if (st.id === 'clasico') {
    // moldura: un marco en relieve alrededor (sin tapar la lámina)
    const m = 0.03, x0 = x - w / 2 + 0.01, y0 = yc - h / 2 + 0.01, ww = w - 0.02, hh = h - 0.02;
    for (const [a, b, c, d] of [[x0, y0, ww, m], [x0, y0 + hh - m, ww, m], [x0, y0, m, hh], [x0 + ww - m, y0, m, hh]]) k.caja(st.marco, a, b, 0.032, c, d, 0.01);
  }
  if (pp) k.caja('papel', x - w / 2 + fr, yc - h / 2 + fr, 0.032, w - 2 * fr, h - 2 * fr, 0.003);
  k.caja(celda, x - w / 2 + fr + pp, yc - h / 2 + fr + pp, 0.035, w - 2 * (fr + pp), h - 2 * (fr + pp), 0.002);
}
// Composición de cuadros sobre un mueble (o la cama) centrada en x, con la base a yb y ancho disponible
export function cuadros(k, st, r, x, yb, ancho, H, n = null) {
  const techo = H - 0.25;
  const hMax = Math.min(0.9, techo - yb - 0.05);
  if (hMax < 0.3) return;
  const lista = st.cuadros;
  if ((n ?? (ancho > 1.5 ? 2 : 1)) >= 2 && ancho > 1.2) {
    const w = Math.min(0.6, ancho * 0.3), h = Math.min(hMax, w * 1.3);
    for (const s of [-1, 1]) cuadro(k, st, lista[(s + 1) / 2], x + s * (w / 2 + 0.05), yb + 0.05 + h / 2, w, h);
  } else {
    const w = Math.min(1.0, ancho * 0.7), h = Math.min(hMax, w * 0.72);
    cuadro(k, st, lista[(r() * lista.length) | 0], x, yb + 0.05 + h / 2, w, h);
  }
}

// ---------- cortinas a los lados de una ventana [x0, x1] (marco de pared) ----------
function gPliegues(w, h, n, amp) {
  const cols = n * 6, pos = [], uv = [], idx = [];
  for (const cara of [1, -1]) {
    const b = pos.length / 3;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, x = (u - 0.5) * w, z = amp * Math.sin(u * n * 2 * PI) - (cara < 0 ? 0.002 : 0);
      pos.push(x, -h / 2, z, x, h / 2, z); uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < cols; i++) {
      const a = b + 2 * i, bb = a + 1, c = a + 2, d = a + 3;
      if (cara > 0) idx.push(a, c, bb, bb, c, d); else idx.push(a, bb, c, bb, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function cortinas(k, st, x0, x1, yVentana1, H, lados = [true, true]) {
  const yb = Math.min(H - 0.06, yVentana1 + 0.16);
  const ext = 0.22, z = 0.1;
  k.barra(st.metal, [x0 - ext - 0.04, yb, z], [x1 + ext + 0.04, yb, z], 0.009, 8);
  for (const x of [x0 - ext - 0.05, x1 + ext + 0.05]) k.esfera(st.metal, x, yb, z, 0.018, 0.018, 0.018, 8, 6);
  for (const x of [x0 + 0.03, x1 - 0.03]) k.caja(st.metal, x - 0.006, yb - 0.006, 0, 0.012, 0.012, z);
  const hp = yb - 0.03 - 0.012;
  [[x0 - ext, x0 + 0.1], [x1 - 0.1, x1 + ext]].forEach(([a, b], i) => {
    if (!lados[i]) return;
    const g = gPliegues(b - a, hp, 5, 0.03);
    g.translate((a + b) / 2, 0.012 + hp / 2, z);
    k.geo(st.cortina, g);
  });
}

// ---------- mesa de comedor y sillas ----------
export function mesaComedor(k, st, forma, w, d) {
  const h = 0.75;
  if (forma === 'redonda') {
    const R = w / 2;
    k.maderaGeo(tf(gCil(R, R, 0.035, 40), { y: h - 0.0175 }));
    patas(k, st, [0, 1, 2, 3].map(i => { const a = i * PI / 2 + PI / 4; return [Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, Math.cos(a), Math.sin(a)]; }), h - 0.035);
    k.maderaGeo(tf(gCil(R * 0.72, R * 0.72, 0.05, 32), { y: h - 0.06 }));
    k.mancha(0, 0, R + 0.15);
    return h;
  }
  if (st.id === 'moderno') {
    k.madera(-w / 2, h - 0.03, -d / 2, w, 0.03, d, 0.006);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.12);
      k.caja(st.metal, x - 0.02, 0, -d / 2 + 0.06, 0.04, 0.02, d - 0.12);
      k.caja(st.metal, x - 0.02, h - 0.05, -d / 2 + 0.06, 0.04, 0.02, d - 0.12);
      for (const z of [-d / 2 + 0.06, d / 2 - 0.1]) k.caja(st.metal, x - 0.02, 0, z, 0.04, h - 0.03, 0.04);
    }
  } else if (st.id === 'industrial') {
    k.madera(-w / 2, h - 0.05, -d / 2, w, 0.05, d, 0.004);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.15);
      k.barra(st.metal, [x - 0.25, 0, 0], [x, h - 0.05, 0], 0.02, 8); k.barra(st.metal, [x + 0.25, 0, 0], [x, h - 0.05, 0], 0.02, 8);
      k.caja(st.metal, x - 0.3, 0, -0.025, 0.6, 0.03, 0.05);
      k.caja(st.metal, x - 0.03, h - 0.08, -d / 2 + 0.05, 0.06, 0.03, d - 0.1);
    }
    k.barra(st.metal, [-w / 2 + 0.15, 0.25, 0], [w / 2 - 0.15, 0.25, 0], 0.015, 8);
  } else {
    k.madera(-w / 2, h - 0.035, -d / 2, w, 0.035, d, 0.006);
    k.madera(-w / 2 + 0.05, h - 0.12, -d / 2 + 0.05, w - 0.1, 0.085, d - 0.1, 0.002);
    patas(k, st, esquinas(-w / 2, w / 2, -d / 2, d / 2, 0.07), h - 0.035);
  }
  k.mancha(0, 0, w / 2 + 0.2, d / 2 + 0.2);
  return h;
}
// Silla con el respaldo en z = -0.22 y el asiento mirando a +z
export function silla(k, st) {
  const ys = 0.46, w = 0.44, d0 = -0.22, d1 = 0.2;
  if (st.silla === 'varillas') {
    patas(k, st, esquinas(-w / 2, w / 2, d0, d1, 0.04), ys - 0.03, 0, 'conicas');
    k.madera(-w / 2, ys - 0.03, d0, w, 0.03, d1 - d0, 0.01);
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) k.barra(null, [x, ys, d0 + 0.03], [x, 0.86, d0 - 0.02], 0.012, 8, 'mob:madera', 0.012);
    k.madera(-w / 2 + 0.02, 0.78, d0 - 0.035, w - 0.04, 0.07, 0.025, 0.01);
    for (let i = 1; i < 6; i++) { const x = -w / 2 + 0.04 + i * (w - 0.08) / 6; k.barra(null, [x, ys, d0 + 0.025], [x, 0.78, d0 - 0.015], 0.006, 6, 'mob:madera'); }
  } else if (st.silla === 'tapizada') {
    patas(k, st, esquinas(-w / 2, w / 2, d0, d1, 0.04), ys - 0.07, 0, 'metal');
    k.tela(-w / 2, ys - 0.07, d0, w, 0.08, d1 - d0, 0.03);
    k.tela(-w / 2 + 0.01, ys, d0 - 0.02, w - 0.02, 0.42, 0.06, 0.025, { rx: -0.1 });
  } else if (st.silla === 'metal') {
    const m = st.metal;
    for (const [x, z, sx, sz] of esquinas(-w / 2, w / 2, d0, d1, 0.03)) k.barra(m, [x + sx * 0.04, 0, z + sz * 0.04], [x, ys, z], 0.011, 6);
    k.panel(m, -w / 2, ys - 0.02, d0, w, 0.02, d1 - d0, 0.006);
    k.caja(m, -w / 2, ys - 0.06, d1 - 0.02, w, 0.04, 0.008);
    // respaldo de chapa (tipo taller): dos montantes y una pala curvada en tres tramos
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) k.barra(m, [x, ys, d0 + 0.02], [x * 0.92, 0.82, d0 - 0.03], 0.01, 6);
    for (const [a, ry] of [[-0.13, 0.35], [0, 0], [0.13, -0.35]]) k.panel(m, a - 0.075, 0.6, d0 - 0.03 + Math.abs(a) * 0.12, 0.15, 0.22, 0.012, 0.004, { rx: -0.12, ry });
  } else {
    // clásica: patas torneadas, asiento tapizado y respaldo con medallón
    patas(k, st, esquinas(-w / 2, w / 2, d0, d1, 0.035), ys - 0.04, 0, 'torneadas');
    k.madera(-w / 2, ys - 0.06, d0, w, 0.04, d1 - d0, 0.006);
    k.panel('beige', -w / 2 + 0.01, ys - 0.025, d0 + 0.01, w - 0.02, 0.06, d1 - d0 - 0.02, 0.025, null, 3);
    for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) k.barra(null, [x, ys, d0 + 0.035], [x, 0.95, d0 - 0.01], 0.016, 8, 'mob:madera', 0.013);
    k.madera(-w / 2 + 0.02, 0.9, d0 - 0.03, w - 0.04, 0.06, 0.03, 0.012);
    k.esfera('beige', 0, 0.72, d0 - 0.005, 0.15, 0.15, 0.025, 16, 10);
  }
  k.mancha(0, 0, 0.28);
}
// Mesa + sillas alrededor (marco: centro de la mesa). Devuelve la huella con sillas.
export function comedor(k, st, forma, w, d, nPorLado, cabeceras) {
  const h = mesaComedor(k, st, forma, w, d);
  const sillas = [];
  if (forma === 'redonda') { for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4, x = Math.cos(a) * (w / 2 + 0.05), z = Math.sin(a) * (w / 2 + 0.05); sillas.push([x, z, Math.atan2(x, z) + PI]); } }
  else {
    for (let i = 0; i < nPorLado; i++) {
      const x = -w / 2 + (i + 0.5) * w / nPorLado;
      sillas.push([x, -d / 2 - 0.06, 0]); sillas.push([x, d / 2 + 0.06, PI]);
    }
    if (cabeceras) { sillas.push([-w / 2 - 0.08, 0, PI / 2]); sillas.push([w / 2 + 0.08, 0, -PI / 2]); }
  }
  // cada silla con su +z mirando a la mesa
  for (const [x, z, giro] of sillas) k.dentro(x, z, giro, 0, () => silla(k, st));
  return h;
}

// ---------- dormitorio ----------
// Cama de ancho W (colchón) y largo L; cabecero en z = 0. Devuelve la huella.
export function cama(k, st, W, L, r, completo) {
  const fw = W + 0.08, cz = 0.07, z1 = cz + L + 0.05;
  const hb = 0.3, hm = 0.2;              // tapa del somier y grueso del colchón
  // base
  if (st.id === 'moderno') {
    k.caja('negro', -fw / 2 + 0.08, 0, cz + 0.08, fw - 0.16, 0.06, L - 0.12);
    k.panel('tapizGris', -fw / 2, 0.06, cz, fw, hb - 0.06, L + 0.05, 0.02);
  } else if (st.id === 'industrial') {
    k.caja(st.metal, -fw / 2, hb - 0.12, cz, 0.04, 0.06, L + 0.05); k.caja(st.metal, fw / 2 - 0.04, hb - 0.12, cz, 0.04, 0.06, L + 0.05);
    k.caja(st.metal, -fw / 2, hb - 0.12, z1 - 0.04, fw, 0.06, 0.04);
    k.madera(-fw / 2 + 0.04, hb - 0.08, cz, fw - 0.08, 0.08, L + 0.01, 0.002);
    patas(k, st, [[-fw / 2 + 0.02, z1 - 0.02], [fw / 2 - 0.02, z1 - 0.02], [-fw / 2 + 0.02, cz + 0.04], [fw / 2 - 0.02, cz + 0.04]], hb - 0.12);
  } else {
    k.madera(-fw / 2, hb - 0.16, cz, 0.035, 0.16, L + 0.05, 0.004); k.madera(fw / 2 - 0.035, hb - 0.16, cz, 0.035, 0.16, L + 0.05, 0.004);
    k.madera(-fw / 2, hb - 0.16, z1 - 0.035, fw, 0.16, 0.035, 0.004);
    k.caja('grisClaro', -fw / 2 + 0.035, hb - 0.06, cz, fw - 0.07, 0.06, L + 0.015);
    patas(k, st, esquinas(-fw / 2, fw / 2, cz, z1, 0.03), hb - 0.16);
    if (st.id === 'clasico') { k.madera(-fw / 2, hb - 0.16, z1 - 0.035, fw, 0.38, 0.035, 0.006); k.madera(-fw / 2 - 0.01, hb + 0.2, z1 - 0.045, fw + 0.02, 0.03, 0.055, 0.008); }
  }
  // colchón
  k.panel('blanco', -W / 2, hb, cz + 0.02, W, hm, L, 0.04, null, 3);
  const yt = hb + hm;
  // edredón: encima del colchón desde la almohada hasta los pies, cayendo por los lados
  const ze = cz + 0.42;
  const caida = 0.24;
  k.tela(-W / 2 - 0.03, yt - 0.005, ze, W + 0.06, 0.06, z1 - ze + 0.01, 0.03);
  for (const s of [-1, 1]) k.tela(s < 0 ? -W / 2 - 0.035 : W / 2 + 0.005, yt - caida, ze, 0.03, caida + 0.03, z1 - ze, 0.012);
  k.tela(-W / 2 - 0.03, yt - caida, z1 - 0.01, W + 0.06, caida + 0.03, 0.035, 0.012);
  k.tela(-W / 2 - 0.02, yt + 0.02, ze - 0.06, W + 0.04, 0.07, 0.24, 0.035);          // embozo doblado
  // almohadas y cojines
  const na = W > 1.1 ? 2 : 1, aw = Math.min(0.72, (W - 0.06) / na - 0.03);
  for (let i = 0; i < na; i++) {
    const x = na === 1 ? 0 : (i ? 1 : -1) * (aw / 2 + 0.02);
    k.tela(x - aw / 2, yt + 0.0, cz + 0.06, aw, 0.36, 0.14, 0.06, { rx: 0.42 });
  }
  const nc = completo ? (W > 1.1 ? 3 : 2) : (W > 1.1 ? 2 : 1);
  for (let i = 0; i < nc; i++) {
    const t = 0.42, x = (i - (nc - 1) / 2) * (t + 0.03);
    k.panel(st.cojines[i % st.cojines.length], x - t / 2, yt + 0.06, cz + 0.27, t, t, 0.13, 0.055, { rx: 0.3, rz: (r() - 0.5) * 0.1 }, 3);
  }
  if (completo) {
    // pie de cama (plaid) que cuelga por los lados
    const zp = z1 - 0.62;
    k.panel(st.manta, -W / 2 - 0.05, yt + 0.055, zp, W + 0.1, 0.02, 0.5, 0.008);
    for (const s of [-1, 1]) k.panel(st.manta, s < 0 ? -W / 2 - 0.06 : W / 2 + 0.04, yt - 0.2, zp, 0.02, 0.27, 0.5, 0.006);
  }
  // cabecero
  const cw = fw + 0.1;
  if (st.cabecero === 'madera') {
    const n = Math.round(cw / 0.11);
    for (let i = 0; i < n; i++) k.madera(-cw / 2 + i * cw / n + 0.006, 0.12, 0.01, cw / n - 0.012, 0.98, 0.035, 0.004);
    k.madera(-cw / 2, 1.1, 0, cw, 0.035, 0.06, 0.004);
  } else if (st.cabecero === 'tapizado') {
    const n = Math.max(4, Math.round(cw / 0.22));
    for (let i = 0; i < n; i++) k.panel('tapizGris', -cw / 2 + i * cw / n, 0.28, 0.0, cw / n, 0.85, 0.07, 0.03, null, 3);
  } else if (st.cabecero === 'metal') {
    for (const x of [-cw / 2 + 0.03, cw / 2 - 0.03]) k.cil(st.metal, x, 0, 0.04, 0.016, 0.016, 1.05, 10);
    for (const y of [0.55, 1.02]) k.barra(st.metal, [-cw / 2 + 0.03, y, 0.04], [cw / 2 - 0.03, y, 0.04], 0.013, 8);
    const n = Math.round(cw / 0.14);
    for (let i = 1; i < n; i++) k.barra(st.metal, [-cw / 2 + i * cw / n, 0.55, 0.04], [-cw / 2 + i * cw / n, 1.02, 0.04], 0.007, 6);
    for (const x of [-cw / 2 + 0.03, cw / 2 - 0.03]) k.esfera('laton', x, 1.07, 0.04, 0.022, 0.022, 0.022, 10, 8);
  } else {
    // capitoné: panel tapizado con botones y marco de madera
    k.madera(-cw / 2 - 0.03, 0.0, 0.0, cw + 0.06, 1.3, 0.04, 0.012);
    k.panel('tapizVerde', -cw / 2, 0.35, 0.035, cw, 0.9, 0.06, 0.03, null, 3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < Math.round(cw / 0.2); i++) {
      const x = -cw / 2 + 0.1 + i * 0.2 + (j % 2) * 0.1; if (x > cw / 2 - 0.08) continue;
      k.esfera('verdeBotella', x, 0.55 + j * 0.25, 0.096, 0.012, 0.012, 0.008, 6, 4);
    }
  }
  k.mancha(0, (cz + z1) / 2, fw / 2 + 0.12, (z1 - cz) / 2 + 0.12);
  return { ancho: cw, fondo: z1, alto: 1.2 };
}
// Mesilla con lámpara y algo encima. Devuelve el alto.
export function mesilla(k, st, r, completo, lado = 1) {
  const w = 0.45, d = 0.38;
  const h = st.id === 'moderno' ? cuerpo(k, st, w, d, 0.5, { frentes: 'cajones', n: 1, colgado: true, y0: 0.32 }) : cuerpo(k, st, w, d, 0.55, { frentes: 'cajones', n: st.id === 'clasico' ? 2 : 1 });
  lamparaMesa(k, -lado * 0.07, h, d * 0.45, st, 0.85);
  if (completo) {
    if (r() < 0.5) { const yy = pilaLibros(k, r, lado * 0.12, h, d * 0.55, 2, 0.17, 0.4); if (r() < 0.5) vela(k, lado * 0.12, yy, d * 0.55, 0.07, 0.025); }
    else { jarron(k, lado * 0.13, h, d * 0.55, 0.13, st.maceta, 1); flores(k, r, lado * 0.13, h + 0.11, d * 0.55, 0.16, st.id === 'industrial' ? null : 'florBlanca', 4); }
  }
  if (st.id !== 'moderno') k.mancha(0, d / 2, w / 2 + 0.05, d / 2 + 0.05);
  return h;
}
// Armario de puertas (ancho libre, fondo 0,6)
export function armario(k, st, w, h) {
  const d = 0.6, t = 0.02, zb = 0.08;
  k.caja('negro', -w / 2 + 0.03, 0, 0.03, w - 0.06, zb, d - 0.06);
  k.madera(-w / 2, zb, 0, t, h - zb, d - 0.02, 0.002); k.madera(w / 2 - t, zb, 0, t, h - zb, d - 0.02, 0.002);
  k.madera(-w / 2, h - t, 0, w, t, d - 0.02, 0.002);
  const n = Math.max(2, Math.round(w / 0.5)), pw = (w - 0.004) / n;
  const fr = st.id === 'nordico' ? st.laca : st.id === 'moderno' ? 'lacaGris' : null;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.002 + i * pw;
    if (fr) k.panel(fr, x + 0.0015, zb + 0.004, d - 0.02, pw - 0.003, h - zb - 0.008, 0.019, 0.003);
    else k.madera(x + 0.0015, zb + 0.004, d - 0.02, pw - 0.003, h - zb - 0.008, 0.019, 0.003);
    if (st.id === 'industrial') {
      // marco de pletina en cada puerta
      for (const [a, b, c, e] of [[x + 0.02, zb + 0.02, pw - 0.04, 0.02], [x + 0.02, h - 0.04, pw - 0.04, 0.02], [x + 0.02, zb + 0.02, 0.02, h - zb - 0.06], [x + pw - 0.04, zb + 0.02, 0.02, h - zb - 0.06]]) k.caja(st.metal, a, b, d - 0.001, c, e, 0.004);
    }
    if (st.id === 'clasico') { k.madera(x + 0.05, zb + 0.06, d + 0.0, pw - 0.1, (h - zb) * 0.55, 0.008, 0.004); k.madera(x + 0.05, zb + (h - zb) * 0.66, d, pw - 0.1, (h - zb) * 0.28, 0.008, 0.004); }
    const der = i % 2 === 0;
    tirador(k, st, der ? x + pw - 0.05 : x + 0.05, 1.05, d + 0.0, true, 0.3);
  }
  if (st.id === 'clasico') k.madera(-w / 2 - 0.02, h - 0.005, -0.0, w + 0.04, 0.05, d + 0.01, 0.008);
  return { ancho: w, fondo: d, alto: h };
}
// Banco a los pies de la cama
export function banco(k, st, w) {
  const d = 0.4, h = 0.46;
  if (st.id === 'industrial') { k.madera(-w / 2, h - 0.05, 0, w, 0.05, d, 0.004); for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) { k.caja(st.metal, x - 0.015, 0, 0.03, 0.03, h - 0.05, 0.03); k.caja(st.metal, x - 0.015, 0, d - 0.06, 0.03, h - 0.05, 0.03); k.caja(st.metal, x - 0.015, 0.0, 0.03, 0.03, 0.03, d - 0.06); } }
  else {
    const hp = st.id === 'moderno' ? 0.14 : 0.18;
    k.panel(st.id === 'clasico' ? 'tapizVerde' : st.id === 'moderno' ? 'tapizGris' : 'tapizArena', -w / 2, hp, 0, w, h - hp, d, 0.03, null, 3);
    patas(k, st, esquinas(-w / 2, w / 2, 0, d, 0.05), hp);
  }
  k.mancha(0, d / 2, w / 2 + 0.06, d / 2 + 0.06);
}

// ---------- recibidor ----------
export function espejo(k, st, x, yc, w, h) {
  if (st.id === 'nordico' || st.id === 'moderno') {
    const R = Math.min(w, h) / 2;
    k.geo(st.id === 'nordico' ? 'maderaClara' : 'negroMate', tf(gCil(R, R, 0.025, 40), { rx: PI / 2, x, y: yc, z: 0.013 }));
    k.geo('espejo', tf(gCil(R - 0.02, R - 0.02, 0.004, 40), { rx: PI / 2, x, y: yc, z: 0.027 }));
    if (st.id === 'nordico') { k.barra('cuero', [x, yc + R, 0.02], [x, yc + R + 0.22, 0.005], 0.006, 5); }
    return;
  }
  const fr = st.id === 'clasico' ? 0.06 : 0.025;
  k.caja(st.marco, x - w / 2, yc - h / 2, 0.002, w, h, 0.03);
  k.caja('espejo', x - w / 2 + fr, yc - h / 2 + fr, 0.032, w - 2 * fr, h - 2 * fr, 0.003);
}
export function paraguero(k, st, x, z) {
  k.cil(st.id === 'clasico' ? 'ceramicaAzul' : st.id === 'industrial' ? 'aceroNegro' : 'ceramica', x, 0, z, 0.11, 0.1, 0.5, 18);
  k.barra('negro', [x - 0.02, 0.1, z], [x + 0.03, 0.85, z - 0.02], 0.012, 6);
  k.torno('negro', [[0.012, 0.85], [0.02, 0.88], [0.045, 0.86], [0.06, 0.8], [0.055, 0.78]], x + 0.03, 0, z - 0.02, 8);
}
export function perchero(k, st, x, y, w) {
  if (st.id === 'industrial') { k.barra(st.metal, [x - w / 2, y, 0.06], [x + w / 2, y, 0.06], 0.012, 8); for (let i = 0; i < 4; i++) k.barra(st.metal, [x - w / 2 + 0.08 + i * (w - 0.16) / 3, y, 0.06], [x - w / 2 + 0.08 + i * (w - 0.16) / 3, y - 0.08, 0.1], 0.006, 5); return; }
  k.madera(x - w / 2, y - 0.04, 0, w, 0.08, 0.02, 0.004);
  for (let i = 0; i < 4; i++) {
    const xx = x - w / 2 + 0.08 + i * (w - 0.16) / 3;
    if (st.id === 'nordico') k.esfera('maderaClara', xx, y, 0.04, 0.025, 0.025, 0.025, 10, 8);
    else k.barra(st.metal, [xx, y, 0.02], [xx, y + 0.03, 0.08], 0.006, 6);
  }
  // un abrigo y un bolso colgados
  const xa = x - w / 2 + 0.08;
  k.panel(st.id === 'clasico' ? 'azulNoche' : st.id === 'moderno' ? 'grafito' : 'arena', xa - 0.2, y - 0.95, 0.03, 0.4, 0.93, 0.1, 0.04, { rz: 0.02 });
  k.panel(st.id === 'industrial' ? 'cueroOscuro' : 'cuero', x - w / 2 + 0.08 + (w - 0.16) * 2 / 3 - 0.13, y - 0.38, 0.05, 0.26, 0.24, 0.08, 0.03);
}

export { planta, bodegon, vela, jarron, flores, cuenco, bandeja, pilaLibros, filaLibros, lamparaMesa, marcoFoto, LIBROS, gEsfera };
