// Objetos pequeños de decoración (todos en el atlas): libros, jarrones, flores, plantas, velas, cuencos, bandejas,
// lámparas de sobremesa… Cada función dibuja en el marco actual del kit con base en (x, y, z).
import * as THREE from 'three';
import { tf, gEsfera, gCil, gTorno } from './kit.js';

export const LIBROS = ['libro0', 'libro1', 'libro2', 'libro3', 'libro4', 'libro5', 'libro6', 'libro7', 'libro8', 'libro9'];
const elegir = (r, lista) => lista[(r() * lista.length) | 0];

// Fila de libros de pie desde x0 hasta x0 + ancho (devuelve lo que ocupa). Alguno inclinado al final.
export function filaLibros(k, r, x0, y, z, ancho, hMax = 0.3, fondoMax = 0.22) {
  let x = x0; const fin = x0 + ancho;
  while (x < fin - 0.03) {
    const w = 0.018 + r() * 0.03, h = Math.min(hMax, 0.17 + r() * 0.13), d = Math.min(fondoMax, 0.13 + r() * 0.09);
    if (x + w > fin) break;
    k.caja(elegir(r, LIBROS), x, y, z + (fondoMax - d) * 0.3, w, h, d);
    x += w + 0.001;
  }
  if (fin - x > 0.06) {
    // el último, apoyado
    const h = Math.min(hMax, 0.22), w = 0.025, d = 0.17;
    k.geo(elegir(r, LIBROS), tf(new THREE.BoxGeometry(w, h, d), { rz: -0.32, x: x + 0.035 + w / 2 + h * 0.15, y: y + h / 2 - 0.012, z: z + d / 2 }));
  }
  return x - x0;
}
// Pila de libros tumbados
export function pilaLibros(k, r, x, y, z, n = 3, ancho = 0.24, giro = 0) {
  let yy = y;
  for (let i = 0; i < n; i++) {
    const w = ancho - i * 0.025 - r() * 0.02, d = w * 0.72, h = 0.025 + r() * 0.02;
    k.geo(elegir(r, LIBROS), tf(new THREE.BoxGeometry(w, h, d), { ry: giro + (r() - 0.5) * 0.25, x, y: yy + h / 2, z }));
    yy += h;
  }
  return yy;
}
// Jarrón torneado; forma 0..3
export function jarron(k, x, y, z, alto = 0.25, celda = 'ceramica', forma = 0) {
  const F = [
    [[0, 0], [0.32, 0], [0.42, 0.15], [0.45, 0.45], [0.3, 0.8], [0.2, 0.92], [0.22, 1], [0.19, 1], [0, 0.9]],
    [[0, 0], [0.3, 0], [0.38, 0.5], [0.36, 0.9], [0.38, 1], [0.34, 1], [0, 0.95]],
    [[0, 0], [0.22, 0], [0.48, 0.3], [0.5, 0.45], [0.4, 0.62], [0.16, 0.78], [0.14, 1], [0.11, 1], [0, 0.85]],
    [[0, 0], [0.45, 0], [0.5, 0.1], [0.5, 0.3], [0.46, 0.38], [0, 0.36]],
  ][forma % 4];
  k.torno(celda, F.map(([a, b]) => [a * alto * 0.5, b * alto]), x, y, z, 16);
}
// Ramas secas o flores en un jarrón (alto del jarrón, desde y)
export function flores(k, r, x, y, z, alto = 0.35, celda = 'florBlanca', n = 7) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + r(), inc = 0.12 + r() * 0.22, L = alto * (0.7 + r() * 0.45);
    const tx = x + Math.cos(a) * Math.sin(inc) * L, tz = z + Math.sin(a) * Math.sin(inc) * L, ty = y + Math.cos(inc) * L;
    k.barra('tallo', [x, y, z], [tx, ty, tz], 0.0025, 4);
    if (celda) k.esfera(celda, tx, ty, tz, 0.022 + r() * 0.012, 0.018, 0.022 + r() * 0.012, 7, 5);
    // un par de hojas por tallo
    const h = tf(gEsfera(1, 6, 4), { s: [0.012, 0.002, 0.035], rx: -0.6, ry: a + 1.2, x: (x + tx) / 2, y: (y + ty) / 2, z: (z + tz) / 2 });
    k.geo(i % 2 ? 'hoja' : 'hojaClara', h);
  }
}
// Hoja suelta (elipsoide aplastado con el pecíolo en el origen) orientada con azimut a e inclinación inc.
export function hoja(k, celda, x, y, z, largo, ancho, a, inc) {
  const g = gEsfera(1, 6, 4); g.scale(ancho / 2, 0.004, largo / 2); g.translate(0, 0, largo / 2); g.rotateX(-inc); g.rotateY(a); g.translate(x, y, z);
  k.geo(celda, g);
}
// Plantas en maceta. tipo: ficus | monstera | olivo | lavanda | boj | pequena | sansevieria
export function planta(k, r, x, y, z, tipo = 'ficus', maceta = 'ceramica', escala = 1) {
  const s = escala;
  const rm = { ficus: 0.17, monstera: 0.2, olivo: 0.22, lavanda: 0.18, boj: 0.2, pequena: 0.07, sansevieria: 0.13 }[tipo] * s;
  const hm = { ficus: 0.32, monstera: 0.34, olivo: 0.4, lavanda: 0.3, boj: 0.32, pequena: 0.09, sansevieria: 0.26 }[tipo] * s;
  // maceta: torneada con labio
  k.torno(maceta, [[0, 0], [rm * 0.78, 0], [rm * 0.95, hm * 0.85], [rm, hm], [rm * 0.93, hm], [rm * 0.88, hm * 0.94], [0, hm * 0.94]], x, y, z, 18);
  k.cil('tierra', x, y + hm * 0.9, z, rm * 0.87, rm * 0.87, 0.01, 12);
  const yb = y + hm * 0.92;
  if (tipo === 'ficus' || tipo === 'olivo') {
    const H = (tipo === 'ficus' ? 1.35 : 1.5) * s;
    k.barra('tronco', [x, yb, z], [x + 0.03 * s, yb + H * 0.55, z], 0.022 * s, 6);
    const ramas = tipo === 'ficus' ? 5 : 6;
    for (let b = 0; b < ramas; b++) {
      const a = b * 2.2 + r(), y0 = yb + H * (0.35 + 0.08 * b), L = (0.25 + r() * 0.2) * s;
      const tx = x + Math.cos(a) * L, tz = z + Math.sin(a) * L, ty = y0 + L * (0.6 + r() * 0.4);
      k.barra('tronco', [x + 0.02 * s, y0, z], [tx, ty, tz], 0.008 * s, 5);
      const nh = tipo === 'ficus' ? 9 : 11;
      for (let i = 0; i < nh; i++) {
        const aa = r() * Math.PI * 2, d = r() * 0.16 * s;
        hoja(k, tipo === 'olivo' ? 'hojaOlivo' : (i % 3 ? 'hoja' : 'hojaOscura'), tx + Math.cos(aa) * d, ty + (r() - 0.3) * 0.18 * s, tz + Math.sin(aa) * d,
          (tipo === 'olivo' ? 0.07 : 0.11) * s, (tipo === 'olivo' ? 0.018 : 0.06) * s, aa, -0.3 + r() * 0.9);
      }
    }
  } else if (tipo === 'monstera') {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996 + r() * 0.3, L = (0.35 + r() * 0.45) * s, inc = 0.35 + r() * 0.5;
      const tx = x + Math.cos(a) * Math.sin(inc) * L, tz = z + Math.sin(a) * Math.sin(inc) * L, ty = yb + Math.cos(inc) * L;
      k.barra('hojaClara', [x, yb, z], [tx, ty, tz], 0.006 * s, 4);
      hoja(k, i % 2 ? 'hoja' : 'hojaOscura', tx, ty, tz, (0.28 + r() * 0.12) * s, (0.22 + r() * 0.08) * s, -a + Math.PI / 2, 0.25 + r() * 0.4);
    }
  } else if (tipo === 'sansevieria') {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996, d = 0.03 * s * (i % 3), alto = (0.35 + r() * 0.3) * s;
      const g = gEsfera(1, 6, 4); g.scale(0.025 * s, alto / 2, 0.006); g.translate(0, alto / 2, 0); g.rotateZ((r() - 0.5) * 0.25); g.rotateY(a); g.translate(x + Math.cos(a) * d, yb, z + Math.sin(a) * d);
      k.geo(i % 2 ? 'hojaOscura' : 'hoja', g);
    }
  } else if (tipo === 'lavanda') {
    for (let i = 0; i < 22; i++) {
      const a = r() * Math.PI * 2, inc = r() * 0.5, L = (0.25 + r() * 0.15) * s;
      const tx = x + Math.cos(a) * Math.sin(inc) * L, tz = z + Math.sin(a) * Math.sin(inc) * L, ty = yb + Math.cos(inc) * L;
      k.barra('hojaOlivo', [x + Math.cos(a) * 0.04, yb, z + Math.sin(a) * 0.04], [tx, ty, tz], 0.003, 3);
      k.esfera('lavanda', tx, ty, tz, 0.012, 0.03, 0.012, 5, 4);
    }
  } else if (tipo === 'boj') {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1, d = i ? 0.09 * s : 0;
      k.esfera(i % 2 ? 'hoja' : 'hojaOscura', x + Math.cos(a) * d, yb + 0.2 * s + (i ? 0.02 : 0.06) * s, z + Math.sin(a) * d, 0.15 * s, 0.14 * s, 0.15 * s, 9, 6);
    }
  } else {
    // pequeña: hojas carnosas
    for (let i = 0; i < 8; i++) hoja(k, i % 2 ? 'hoja' : 'hojaClara', x, yb, z, 0.07 * s, 0.035 * s, i * 2.39996, -0.5 - (i % 3) * 0.3);
  }
}
export function vela(k, x, y, z, alto = 0.08, r = 0.03, celda = 'blanco') {
  k.cil(celda, x, y, z, r, r, alto, 14);
  k.cil('velaLuz', x, y + alto, z, 0.004, 0.0015, 0.016, 5);
}
export function cuenco(k, x, y, z, R = 0.1, celda = 'ceramicaArena') {
  k.torno(celda, [[0, 0], [R * 0.45, 0], [R * 0.8, R * 0.22], [R, R * 0.48], [R * 0.95, R * 0.5], [R * 0.75, R * 0.27], [0, R * 0.08]], x, y, z, 18);
}
export function bandeja(k, x, y, z, w = 0.36, d = 0.24, celda = 'maderaMedia') {
  k.panel(celda, x - w / 2, y, z - d / 2, w, 0.008, d, 0.003);
  for (const s of [-1, 1]) { k.caja(celda, x - w / 2, y, z + s * (d / 2 - 0.006) - 0.003, w, 0.03, 0.006); k.caja(celda, x + s * (w / 2 - 0.006) - 0.003, y, z - d / 2, 0.006, 0.03, d); }
  return y + 0.008;
}
export function marcoFoto(k, x, y, z, w = 0.13, h = 0.18, celda = 'negro', giro = 0) {
  k.dentro(x, z, giro, y, () => {
    k.caja(celda, -w / 2, 0, 0, w, h, 0.012, { rx: -0.12 });
    k.caja('foto', -w / 2 + 0.012, 0.012, 0.0125, w - 0.024, h - 0.024, 0.001, { rx: -0.12 });
  });
}
// Lámpara de sobremesa por estilo; devuelve la altura total
export function lamparaMesa(k, x, y, z, st, escala = 1) {
  const s = escala;
  if (st.lampara === 'tripode' || st.lampara === 'arco') {
    // pie de cerámica en bola y pantalla cilíndrica
    k.torno(st.lampara === 'arco' ? 'ceramicaNegra' : 'ceramica', [[0, 0], [0.05, 0], [0.085, 0.06], [0.08, 0.14], [0.03, 0.2], [0.012, 0.22], [0, 0.22]].map(([a, b]) => [a * s, b * s]), x, y, z, 16);
    k.cil('aluminio', x, y + 0.22 * s, z, 0.006, 0.006, 0.08 * s, 6);
    k.cil('pantallaLino', x, y + 0.27 * s, z, 0.13 * s, 0.14 * s, 0.18 * s, 20);
    return 0.45 * s;
  }
  if (st.lampara === 'foco') {
    k.cil('aceroNegro', x, y, z, 0.06 * s, 0.07 * s, 0.015, 14);
    k.barra('aceroNegro', [x, y, z], [x, y + 0.3 * s, z + 0.04], 0.006, 6);
    k.cil('aceroNegro', x, y + 0.27 * s, z + 0.05, 0.07 * s, 0.1 * s, 0.13 * s, 16);
    k.cil('bombilla', x, y + 0.265 * s, z + 0.05, 0.08 * s, 0.08 * s, 0.004, 14);
    return 0.42 * s;
  }
  // plisada (clásico): pie de latón torneado
  k.torno('laton', [[0, 0], [0.07, 0], [0.07, 0.015], [0.03, 0.03], [0.02, 0.12], [0.045, 0.16], [0.02, 0.2], [0.012, 0.3], [0, 0.3]].map(([a, b]) => [a * s, b * s]), x, y, z, 16);
  k.cil('pantallaPlisada', x, y + 0.27 * s, z, 0.09 * s, 0.16 * s, 0.2 * s, 20);
  return 0.5 * s;
}
// Composición de sobremesa (mesa de centro, cómoda, consola, mueble TV): según el hueco disponible.
export function bodegon(k, r, x, y, z, ancho, st, variante = 0) {
  const v = variante % 4;
  if (v === 0) { const yy = pilaLibros(k, r, x - ancho * 0.2, y, z, 3, 0.26); jarron(k, x - ancho * 0.2, yy, z, 0.12, st.acentos[0] === 'salvia' ? 'ceramicaVerde' : 'ceramica', 3); if (ancho > 0.5) vela(k, x + ancho * 0.25, y, z, 0.09); }
  if (v === 1) { jarron(k, x - ancho * 0.18, y, z, 0.3, st.maceta, 0); flores(k, r, x - ancho * 0.18, y + 0.26, z, 0.32, st.id === 'clasico' ? 'florRosa' : st.id === 'industrial' ? null : 'florBlanca', 6); if (ancho > 0.5) cuenco(k, x + ancho * 0.2, y, z, 0.11); }
  if (v === 2) { const yy = bandeja(k, x, y, z, Math.min(0.4, ancho * 0.6), 0.24); vela(k, x - 0.08, yy, z, 0.1); vela(k, x + 0.03, yy, z + 0.03, 0.065, 0.028); jarron(k, x + 0.1, yy, z - 0.03, 0.12, 'vidrioAmbar', 1); }
  if (v === 3) { planta(k, r, x - ancho * 0.22, y, z, 'pequena', st.maceta, 1.2); pilaLibros(k, r, x + ancho * 0.15, y, z, 2, 0.22, 0.3); }
}
export { gCil, gTorno };
