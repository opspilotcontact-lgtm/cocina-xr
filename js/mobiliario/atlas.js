// Materiales del mobiliario (propios, procedurales, sin licencias). Para que un piso entero amueblado quepa en pocas
// mallas, cada estancia usa como mucho cuatro materiales:
//   mob:atlas    → un atlas de 1024² con colores lisos, metales (metalnessMap), pantallas de lámpara que brillan
//                  (emissiveMap), alfombras, cuadros y tejidos estampados. Casi todo lo pequeño va aquí.
//   mob:madera   → madera del estilo con UV en metros (veta continua en tableros grandes).
//   mob:tela     → tejido principal de la estancia (sofá en el salón, ropa de cama en el dormitorio) con trama.
//   mob:contacto → sombras de contacto horneadas bajo los muebles (transparente, sin sombra propia).
// PROHIBIDO ctx.filter='blur' (en las gafas los lienzos se pintan en CPU): todo son rellenos y trazos.
import * as THREE from 'three';
import { aTextura, normalDesde, rng, cacheada, madera, contacto } from '../texturas.js';
import { ESTILOS } from './estilos.js';

const N = 1024, C = 64, COLS = N / C;

// ---------- celdas lisas: nombre → [color, rugosidad 0-1, metal 0-1, brillo propio 0-1] ----------
const LISAS = {
  blanco: ['#f2f0eb', 0.8], crema: ['#e9e1d2', 0.85], lino: ['#ddd5c6', 0.9], arena: ['#d6c7ad', 0.9], grisClaro: ['#c9c8c4', 0.8],
  gris: ['#8d8c89', 0.75], antracita: ['#3c3d3f', 0.7], negro: ['#1b1b1c', 0.6], papel: ['#efe9dc', 0.9],
  lacaBlanca: ['#f1f0ec', 0.32], lacaCrema: ['#ece4d3', 0.35], lacaGris: ['#b9b8b3', 0.35], lacaNegra: ['#232324', 0.3], lacaVerde: ['#5b6e5f', 0.35],
  negroMate: ['#1f1f20', 0.55, 0.7], aceroNegro: ['#2b2b2c', 0.45, 0.85], laton: ['#b8955a', 0.32, 1], oroViejo: ['#a8834a', 0.42, 1],
  cromo: ['#d6d8da', 0.12, 1], aluminio: ['#b5b8bb', 0.35, 1], espejo: ['#e3e7e7', 0.03, 1],
  pantallaTV: ['#0a0b0d', 0.1], cristal: ['#c8d4d2', 0.08], vidrioVerde: ['#4f6a4e', 0.1], vidrioAmbar: ['#9a6a2c', 0.1],
  pantallaLuz: ['#fbefd9', 0.9, 0, 0.85], pantallaLino: ['#efe4cf', 0.9, 0, 0.6], bombilla: ['#fff4dc', 0.3, 0, 1], velaLuz: ['#ffd99a', 0.5, 0, 1],
  ceramica: ['#f1efe9', 0.35], ceramicaNegra: ['#2a2a2a', 0.4], ceramicaArena: ['#d9c9b0', 0.5], ceramicaVerde: ['#8a9e8a', 0.4], ceramicaAzul: ['#3f5f7a', 0.35],
  terracota: ['#b0603c', 0.85], tierra: ['#3a2a1f', 0.98], cesped: ['#6d8a3c', 0.95],
  hoja: ['#3d6a33', 0.6], hojaClara: ['#5f8e45', 0.6], hojaOscura: ['#2c4b28', 0.55], hojaOlivo: ['#7d8c6a', 0.7], tallo: ['#4a3a24', 0.8], tronco: ['#6b5a46', 0.9],
  lavanda: ['#8a77b0', 0.9], florBlanca: ['#f4f1e8', 0.9], florRosa: ['#d98a9a', 0.9], florAmarilla: ['#e8c14a', 0.9], florRoja: ['#b8333a', 0.9],
  maderaClara: ['#c9a67a', 0.7], maderaMedia: ['#9c7048', 0.7], maderaOscura: ['#5e3e28', 0.65], mimbre: ['#c8a46e', 0.95], cuerda: ['#b9a283', 0.95], corcho: ['#a88a62', 0.95],
  pan: ['#b97b3d', 0.9], panClaro: ['#e3c48c', 0.9],
  // libros (lomos)
  libro0: ['#2f4a5c', 0.8], libro1: ['#8b3a2e', 0.8], libro2: ['#d8cdb4', 0.85], libro3: ['#4a5d3e', 0.8], libro4: ['#c79a3c', 0.8], libro5: ['#262626', 0.75],
  libro6: ['#e9e4d8', 0.85], libro7: ['#6c4f6b', 0.8], libro8: ['#a7b3b6', 0.8], libro9: ['#b86f4c', 0.8],
  // acentos de los estilos
  salvia: ['#9aab92', 0.92], mostaza: ['#d2a24c', 0.92], rosaPalo: ['#dcb8ad', 0.92], perla: ['#d9d7d2', 0.9],
  petroleo: ['#2f5361', 0.9], terracotaSuave: ['#c07a5a', 0.9], piedra: ['#a6a39d', 0.9], grafito: ['#4a4b4e', 0.9],
  cuero: ['#8b5a36', 0.55], cueroOscuro: ['#4e3322', 0.55], oliva: ['#5f6440', 0.92], oxido: ['#9a4e2e', 0.9], hormigon: ['#9e9b95', 0.95],
  verdeBotella: ['#2f4a3a', 0.85], burdeos: ['#6d2a2f', 0.85], beige: ['#d8cbb3', 0.9], azulNoche: ['#283a55', 0.85],
  // cabeceros tapizados y tapicerías pequeñas
  tapizGris: ['#8f8f8d', 0.95], tapizArena: ['#cbbca2', 0.95], tapizVerde: ['#4d6352', 0.9], tapizClaro: ['#d9d4cb', 0.95],
  // toallas
  toallaBlanca: ['#f4f2ee', 1], toallaGris: ['#a9a8a4', 1], toallaSalvia: ['#a7b5a0', 1], toallaArena: ['#d8c9b0', 1],
  jabon: ['#e9dcc4', 0.4], plasticoBlanco: ['#f0f0ee', 0.45],
};

// ---------- celdas con dibujo (ocupan w×h celdas) ----------
// pintar(g, x, y, w, h, r) en el lienzo de color; rug/met/emi para los mapas de rugosidad, metal y brillo.
const raya = (g, col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
const PATRONES = {
  cojinRayas: { t: [1, 1], rug: 0.92, pintar(g, x, y, w, h) { raya(g, '#ece6da', x, y, w, h); for (let k = 0; k < 8; k++) raya(g, '#3f5568', x, y + 4 + k * 8, w, 3); } },
  cojinCuadros: { t: [1, 1], rug: 0.92, pintar(g, x, y, w, h) { raya(g, '#d9cdb7', x, y, w, h); for (let k = 0; k < 4; k++) { raya(g, 'rgba(90,60,40,.45)', x + k * 16 + 6, y, 4, h); raya(g, 'rgba(90,60,40,.45)', x, y + k * 16 + 6, w, 4); } } },
  cojinGeo: { t: [1, 1], rug: 0.92, pintar(g, x, y, w, h) { raya(g, '#efe9de', x, y, w, h); g.fillStyle = '#2b2b2b'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.moveTo(x + i * 16 + 8, y + j * 16 + 3); g.lineTo(x + i * 16 + 13, y + j * 16 + 8); g.lineTo(x + i * 16 + 8, y + j * 16 + 13); g.lineTo(x + i * 16 + 3, y + j * 16 + 8); g.closePath(); g.fill(); } } },
  cojinDamasco: { t: [1, 1], rug: 0.85, pintar(g, x, y, w, h) { raya(g, '#6d2a2f', x, y, w, h); g.strokeStyle = '#b48b4a'; g.lineWidth = 2; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.ellipse(x + 16 + i * 32, y + 16 + j * 32, 10, 14, 0, 0, Math.PI * 2); g.stroke(); } raya(g, '#b48b4a', x, y, w, 3); raya(g, '#b48b4a', x, y + h - 3, w, 3); } },
  mantaPunto: { t: [1, 1], rug: 1, pintar(g, x, y, w, h, r) { raya(g, '#e4ddd0', x, y, w, h); for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { g.fillStyle = `rgba(120,100,80,${0.08 + r() * 0.1})`; g.fillRect(x + i * 4, y + j * 4 + (i % 2) * 2, 2, 3); } } },
  mantaRayas: { t: [1, 1], rug: 1, pintar(g, x, y, w, h) { raya(g, '#cfc6b6', x, y, w, h); for (let k = 0; k < 5; k++) raya(g, k % 2 ? '#7c6a55' : '#f0ebe1', x + 6 + k * 12, y, 4, h); } },
  mantaOcre: { t: [1, 1], rug: 1, pintar(g, x, y, w, h, r) { raya(g, '#c08a3e', x, y, w, h); for (let k = 0; k < 220; k++) { g.fillStyle = `rgba(255,240,210,${0.06 + r() * 0.08})`; g.fillRect(x + r() * w, y + r() * h, 2, 2); } raya(g, '#8f6128', x, y + 4, w, 2); raya(g, '#8f6128', x, y + h - 6, w, 2); } },
  toallaRayas: { t: [1, 1], rug: 1, pintar(g, x, y, w, h) { raya(g, '#f3f1ec', x, y, w, h); raya(g, '#5c7486', x, y + 10, w, 4); raya(g, '#5c7486', x, y + 18, w, 2); raya(g, '#5c7486', x, y + h - 16, w, 2); raya(g, '#5c7486', x, y + h - 22, w, 4); } },
  lomoLibros: { t: [1, 1], rug: 0.85, pintar(g, x, y, w, h, r) { const c = ['#2f4a5c', '#8b3a2e', '#d8cdb4', '#4a5d3e', '#c79a3c', '#262626', '#e9e4d8', '#6c4f6b']; let cx = x; while (cx < x + w) { const bw = 3 + (r() * 5 | 0); raya(g, c[(r() * c.length) | 0], cx, y, bw, h); cx += bw; } } },
  pantallaPlisada: { t: [1, 1], rug: 0.9, emi: 0.7, pintar(g, x, y, w, h) { raya(g, '#f1e6cf', x, y, w, h); for (let k = 0; k < 16; k++) raya(g, 'rgba(150,120,80,.18)', x + k * 4, y, 1.5, h); } },
  hierba: { t: [1, 1], rug: 1, pintar(g, x, y, w, h, r) { raya(g, '#5f7f38', x, y, w, h); for (let k = 0; k < 300; k++) { g.fillStyle = r() < 0.5 ? 'rgba(30,50,20,.25)' : 'rgba(190,210,120,.2)'; g.fillRect(x + r() * w, y + r() * h, 1, 3); } } },
  // alfombras (4×4 celdas)
  alfombraNordica: { t: [4, 4], rug: 1, pintar: (g, x, y, w, h, r) => alfombra(g, x, y, w, h, r, 'nordica') },
  alfombraModerna: { t: [4, 4], rug: 1, pintar: (g, x, y, w, h, r) => alfombra(g, x, y, w, h, r, 'moderna') },
  alfombraVintage: { t: [4, 4], rug: 1, pintar: (g, x, y, w, h, r) => alfombra(g, x, y, w, h, r, 'vintage') },
  alfombraPersa: { t: [4, 4], rug: 1, pintar: (g, x, y, w, h, r) => alfombra(g, x, y, w, h, r, 'persa') },
  alfombraYute: { t: [4, 4], rug: 1, pintar: (g, x, y, w, h, r) => alfombra(g, x, y, w, h, r, 'yute') },
  alfombraBano: { t: [2, 2], rug: 1, pintar: (g, x, y, w, h, r) => alfombra(g, x, y, w, h, r, 'bano') },
  // cuadros (2×2 celdas)
  cuadro0: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 0) },
  cuadro1: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 1) },
  cuadro2: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 2) },
  cuadro3: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 3) },
  cuadro4: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 4) },
  cuadro5: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 5) },
  cuadro6: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 6) },
  cuadro7: { t: [2, 2], rug: 0.8, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 7) },
  foto: { t: [1, 1], rug: 0.4, pintar: (g, x, y, w, h, r) => arte(g, x, y, w, h, r, 8) },
};

function alfombra(g, x, y, w, h, r, tipo) {
  const borde = (col, m, grosor) => { g.strokeStyle = col; g.lineWidth = grosor; g.strokeRect(x + m, y + m, w - 2 * m, h - 2 * m); };
  const motas = (n, cols, s = 2) => { for (let k = 0; k < n; k++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x + r() * w, y + r() * h, s, s); } };
  if (tipo === 'nordica') {
    raya(g, '#ece6da', x, y, w, h); motas(2600, ['rgba(160,140,110,.12)', 'rgba(255,255,255,.25)']);
    g.strokeStyle = 'rgba(60,55,50,.8)'; g.lineWidth = 2.2;
    for (let i = -1; i < 5; i++) for (let j = -1; j < 5; j++) {
      const cx = x + 26 + i * 52, cy = y + 26 + j * 52 + (i % 2) * 26;
      g.beginPath(); g.moveTo(cx, cy - 24); g.lineTo(cx + 22, cy); g.lineTo(cx, cy + 24); g.lineTo(cx - 22, cy); g.closePath(); g.stroke();
    }
    raya(g, '#ece6da', x, y, w, 8); raya(g, '#ece6da', x, y + h - 8, w, 8); raya(g, '#ece6da', x, y, 8, h); raya(g, '#ece6da', x + w - 8, y, 8, h);
  } else if (tipo === 'moderna') {
    raya(g, '#a9a7a2', x, y, w, h); motas(3000, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.1)']);
    raya(g, '#6f6e6b', x + 30, y + 40, 120, 70); raya(g, '#d9d6cf', x + 110, y + 90, 110, 110); raya(g, '#2f5361', x + 60, y + 160, 70, 60);
    g.strokeStyle = '#3c3d3f'; g.lineWidth = 3; g.beginPath(); g.arc(x + 190, y + 60, 34, 0, Math.PI * 2); g.stroke();
    borde('#8d8c89', 4, 6);
  } else if (tipo === 'vintage') {
    raya(g, '#8a4a3a', x, y, w, h);
    borde('#2e3f55', 12, 18); borde('#c9a77a', 24, 4);
    g.fillStyle = '#2e3f55'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, 60, 80, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a77a'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, 30, 44, 0, 0, Math.PI * 2); g.fill();
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.fillStyle = '#5a2d24'; g.beginPath(); g.arc(x + w / 2 + dx * 80, y + h / 2 + dy * 80, 16, 0, Math.PI * 2); g.fill(); }
    // desgaste
    motas(5000, ['rgba(230,210,180,.12)', 'rgba(40,20,15,.12)'], 3);
  } else if (tipo === 'persa') {
    raya(g, '#7b2a2c', x, y, w, h);
    borde('#1f2c45', 10, 20); borde('#d8b77a', 24, 3); borde('#d8b77a', 34, 2);
    g.fillStyle = '#e4d3ad'; g.beginPath(); g.moveTo(x + w / 2, y + 50); g.lineTo(x + w - 70, y + h / 2); g.lineTo(x + w / 2, y + h - 50); g.lineTo(x + 70, y + h / 2); g.closePath(); g.fill();
    g.fillStyle = '#1f2c45'; g.beginPath(); g.moveTo(x + w / 2, y + 80); g.lineTo(x + w - 100, y + h / 2); g.lineTo(x + w / 2, y + h - 80); g.lineTo(x + 100, y + h / 2); g.closePath(); g.fill();
    g.fillStyle = '#b8423e'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 22, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(216,183,122,.6)'; g.fillRect(x + 12 + k * 6, y + 18, 2, 4); g.fillRect(x + 12 + k * 6, y + h - 22, 2, 4); }
    motas(3500, ['rgba(255,230,200,.08)', 'rgba(0,0,0,.1)']);
  } else if (tipo === 'yute') {
    raya(g, '#b89c74', x, y, w, h);
    for (let j = 0; j < h; j += 4) for (let i = 0; i < w; i += 4) { g.fillStyle = ((i + j) / 4) % 2 ? 'rgba(90,70,40,.18)' : 'rgba(255,240,210,.12)'; g.fillRect(x + i, y + j, 4, 4); }
    borde('#8c7350', 6, 8);
  } else if (tipo === 'bano') {
    raya(g, '#e9e6df', x, y, w, h);
    for (let j = 0; j < h; j += 3) for (let i = 0; i < w; i += 3) { if (r() < 0.5) { g.fillStyle = 'rgba(150,140,125,.18)'; g.fillRect(x + i, y + j, 2, 2); } }
    borde('#cfc9bd', 6, 6);
  }
}

// Cuadros abstractos (composiciones de formas; ninguno copia una obra real).
function arte(g, x, y, w, h, r, n) {
  const P = [
    ['#efe7d8', '#c46a45', '#2f4a5c', '#d8a548'], ['#e9e4da', '#1f1f1f', '#9aab92', '#c8b79a'], ['#2f3b46', '#d9c7a8', '#b65f3c', '#e9e4da'],
    ['#f2efe8', '#7d8c6a', '#c9b48e', '#3f4a3a'], ['#e2d6c2', '#7b2a2c', '#1f2c45', '#d8b77a'], ['#f4f1ea', '#2b2b2b', '#2b2b2b', '#e0c8a8'],
    ['#cfd6d6', '#6a8796', '#e9e4da', '#3a4a52'], ['#efe6d6', '#e3a27a', '#8aa38c', '#f6f1e7'], ['#dfe6e8', '#8fb3c9', '#e8d9b8', '#5a7a5a'],
  ][n % 9];
  raya(g, P[0], x, y, w, h);
  g.fillStyle = P[1];
  if (n === 0) { g.beginPath(); g.arc(x + w * 0.38, y + h * 0.42, w * 0.22, 0, Math.PI * 2); g.fill(); g.fillStyle = P[2]; g.fillRect(x + w * 0.5, y + h * 0.5, w * 0.32, h * 0.32); g.fillStyle = P[3]; g.fillRect(x + w * 0.15, y + h * 0.72, w * 0.3, h * 0.05); }
  if (n === 1) { g.strokeStyle = P[1]; g.lineWidth = 2; g.beginPath(); for (let t = 0; t <= 1; t += 0.02) { const xx = x + w * (0.15 + 0.7 * t), yy = y + h * (0.5 + 0.25 * Math.sin(t * 9)); t ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); g.fillStyle = P[2]; g.beginPath(); g.arc(x + w * 0.7, y + h * 0.3, w * 0.12, 0, Math.PI * 2); g.fill(); }
  if (n === 2) { for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? P[1] : P[3]; g.fillRect(x + w * 0.12, y + h * (0.12 + k * 0.13), w * (0.3 + r() * 0.5), h * 0.08); } g.fillStyle = P[2]; g.beginPath(); g.arc(x + w * 0.72, y + h * 0.72, w * 0.13, 0, Math.PI * 2); g.fill(); }
  if (n === 3) { g.fillStyle = P[2]; g.fillRect(x, y + h * 0.62, w, h * 0.38); g.fillStyle = P[1]; g.beginPath(); g.moveTo(x, y + h * 0.66); for (let t = 0; t <= 1.001; t += 0.1) g.lineTo(x + w * t, y + h * (0.55 + 0.08 * Math.sin(t * 7))); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill(); g.fillStyle = P[3]; g.beginPath(); g.arc(x + w * 0.7, y + h * 0.3, w * 0.09, 0, Math.PI * 2); g.fill(); }
  if (n === 4) { g.fillStyle = P[1]; g.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8); g.fillStyle = P[3]; g.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6); g.fillStyle = P[2]; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w * 0.18, h * 0.24, 0, 0, Math.PI * 2); g.fill(); }
  if (n === 5) { g.strokeStyle = P[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.2, y + h * 0.8); g.bezierCurveTo(x + w * 0.2, y + h * 0.2, x + w * 0.8, y + h * 0.9, x + w * 0.75, y + h * 0.25); g.stroke(); g.fillStyle = P[3]; g.beginPath(); g.arc(x + w * 0.3, y + h * 0.3, w * 0.08, 0, Math.PI * 2); g.fill(); }
  if (n === 6) { for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? P[1] : P[3]; g.beginPath(); g.moveTo(x, y + h * (0.3 + k * 0.12)); for (let t = 0; t <= 1.001; t += 0.1) g.lineTo(x + w * t, y + h * (0.28 + k * 0.12 + 0.04 * Math.sin(t * 6 + k))); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill(); } }
  if (n === 7) { g.fillStyle = P[1]; g.beginPath(); g.arc(x + w * 0.5, y + h * 0.55, w * 0.3, Math.PI, 0); g.fill(); g.fillStyle = P[2]; g.fillRect(x + w * 0.2, y + h * 0.55, w * 0.6, h * 0.04); g.fillStyle = P[3]; g.fillRect(x + w * 0.45, y + h * 0.2, w * 0.1, h * 0.1); }
  if (n === 8) { g.fillStyle = P[1]; g.fillRect(x, y, w, h * 0.55); g.fillStyle = P[3]; g.fillRect(x, y + h * 0.55, w, h * 0.45); g.fillStyle = P[2]; g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.6); g.lineTo(x + w * 0.4, y + h * 0.3); g.lineTo(x + w * 0.7, y + h * 0.6); g.fill(); }
  // grano de lienzo
  for (let k = 0; k < (w * h) / 6; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},.05)`; g.fillRect(x + r() * w, y + r() * h, 1, 1); }
}

// ---------- reparto del atlas ----------
const REG = {};
(function repartir() {
  const libre = Array.from({ length: COLS }, () => new Uint8Array(COLS));
  const poner = (nombre, tw, th, extra) => {
    for (let fy = 0; fy <= COLS - th; fy++) for (let fx = 0; fx <= COLS - tw; fx++) {
      let ok = true;
      for (let j = 0; j < th && ok; j++) for (let i = 0; i < tw; i++) if (libre[fy + j][fx + i]) { ok = false; break; }
      if (!ok) continue;
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) libre[fy + j][fx + i] = 1;
      REG[nombre] = { px: fx * C, py: fy * C, pw: tw * C, ph: th * C, ...extra };
      return;
    }
    throw new Error('atlas lleno: ' + nombre);
  };
  // primero los grandes (alfombras y cuadros), luego las celdas
  for (const [k, p] of Object.entries(PATRONES).sort((a, b) => b[1].t[0] * b[1].t[1] - a[1].t[0] * a[1].t[1])) poner(k, p.t[0], p.t[1], { patron: true });
  for (const k of Object.keys(LISAS)) poner(k, 1, 1, { patron: false });
})();
for (const r of Object.values(REG)) {
  // UV (flipY): v = 1 en la fila de arriba del lienzo; se deja un margen para que el mipmap no mezcle celdas
  const m = r.patron ? 3 : 0;
  r.u0 = (r.px + m) / N; r.u1 = (r.px + r.pw - m) / N;
  r.v1 = 1 - (r.py + m) / N; r.v0 = 1 - (r.py + r.ph - m) / N;
  r.uc = (r.px + r.pw / 2) / N; r.vc = 1 - (r.py + r.ph / 2) / N;
}
export const existeCelda = n => !!REG[n];

// Lleva las UV (0..1) de una geometría a su celda: lisas → todas al centro (sin sangrado); con dibujo → a su recuadro.
// sub = [u0,v0,u1,v1] dentro del recuadro (p. ej. una franja de la alfombra para un pasillo).
export function aCelda(g, nombre, sub = null) {
  const r = REG[nombre] || REG.gris;
  const uv = g.attributes.uv;
  if (!r.patron) { for (let k = 0; k < uv.count; k++) uv.setXY(k, r.uc, r.vc); uv.needsUpdate = true; return g; }
  const [a0, b0, a1, b1] = sub || [0, 0, 1, 1];
  const cl = x => Math.max(0, Math.min(1, x));
  for (let k = 0; k < uv.count; k++) {
    const u = a0 + (a1 - a0) * cl(uv.getX(k)), v = b0 + (b1 - b0) * cl(uv.getY(k));
    uv.setXY(k, r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v);
  }
  uv.needsUpdate = true;
  return g;
}

function lienzo() { const c = document.createElement('canvas'); c.width = N; c.height = N; return [c, c.getContext('2d', { willReadFrequently: true })]; }

export function texAtlas() {
  return cacheada('mob:atlas', () => {
    const r = rng(907);
    const [c, g] = lienzo(); const [co, go] = lienzo(); const [ce, ge] = lienzo();
    g.fillStyle = '#8d8c89'; g.fillRect(0, 0, N, N);
    go.fillStyle = 'rgb(0,200,0)'; go.fillRect(0, 0, N, N);   // G = rugosidad, B = metal
    ge.fillStyle = '#000'; ge.fillRect(0, 0, N, N);
    const orm = (x, y, w, h, rug, met = 0) => { go.fillStyle = `rgb(0,${Math.round(rug * 255)},${Math.round(met * 255)})`; go.fillRect(x, y, w, h); };
    for (const [k, [col, rug, met = 0, emi = 0]] of Object.entries(LISAS)) {
      const q = REG[k];
      g.fillStyle = col; g.fillRect(q.px, q.py, q.pw, q.ph);
      orm(q.px, q.py, q.pw, q.ph, rug, met);
      if (emi) { ge.fillStyle = col; ge.globalAlpha = emi; ge.fillRect(q.px, q.py, q.pw, q.ph); ge.globalAlpha = 1; }
    }
    for (const [k, p] of Object.entries(PATRONES)) {
      const q = REG[k];
      g.save(); g.beginPath(); g.rect(q.px, q.py, q.pw, q.ph); g.clip();
      p.pintar(g, q.px, q.py, q.pw, q.ph, r);
      g.restore();
      orm(q.px, q.py, q.pw, q.ph, p.rug ?? 0.9, p.met ?? 0);
      if (p.emi) { ge.globalAlpha = p.emi; ge.drawImage(c, q.px, q.py, q.pw, q.ph, q.px, q.py, q.pw, q.ph); ge.globalAlpha = 1; }
    }
    const prep = (cv, srgb) => { const t = aTextura(cv, [1, 1], srgb); t.repeat.set(1, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; return t; };
    return { map: prep(c, true), orm: prep(co, false), emisivo: prep(ce, true) };
  });
}

// Trama de tejido (tileable, 256 px = 8 cm): hilos cruzados con algo de irregularidad.
function texTela(tipo) {
  return cacheada('mob:trama:' + tipo, () => {
    const W = 256, r = rng(tipo.length * 31 + 5);
    const [c, g] = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = W; return [cv, cv.getContext('2d', { willReadFrequently: true })]; })();
    if (tipo === 'cuero') {
      g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, W, W);
      for (let k = 0; k < 2600; k++) { const v = 150 + r() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.beginPath(); g.arc(r() * W, r() * W, 1 + r() * 2.5, 0, Math.PI * 2); g.fill(); }
    } else if (tipo === 'terciopelo') {
      g.fillStyle = 'rgb(205,205,205)'; g.fillRect(0, 0, W, W);
      for (let k = 0; k < 9000; k++) { const v = 170 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v},.25)`; g.fillRect(r() * W, r() * W, 1, 1); }
    } else {
      const paso = tipo === 'lino' ? 4 : 6;
      g.fillStyle = 'rgb(205,205,205)'; g.fillRect(0, 0, W, W);
      for (let y = 0; y < W; y += paso) for (let x = 0; x < W; x += paso) {
        const arriba = ((x + y) / paso) % 2 === 0;
        const v = (arriba ? 232 : 178) + (r() - 0.5) * 30 | 0;
        g.fillStyle = `rgb(${v},${v},${v})`;
        if (arriba) g.fillRect(x, y + 1, paso, paso - 2); else g.fillRect(x + 1, y, paso - 2, paso);
      }
      if (tipo === 'lino') for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(150,150,150,${0.15 + r() * 0.2})`; const y = r() * W; g.fillRect(0, y, W, 1 + r()); }
    }
    const m = [0.08, 0.08];
    const map = aTextura(c, m); const nm = aTextura(normalDesde(c, tipo === 'cuero' ? 1.2 : 2.2), m, false);
    return { map, normalMap: nm };
  });
}

const cache = new Map();
const una = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

export function matAtlas() {
  return una('atlas', () => {
    const t = texAtlas();
    return new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, emissiveMap: t.emisivo, emissive: '#ffffff', emissiveIntensity: 0.9, envMapIntensity: 0.9 });
  });
}
export function matContacto() {
  return una('contacto', () => new THREE.MeshBasicMaterial({ map: contacto(), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
}
export function matMadera(estilo) {
  const s = ESTILOS[estilo] || ESTILOS.nordico;
  return una('madera:' + estilo, () => {
    const t = madera(s.madera, s.vetaSeed, [0.9, 0.9]);
    return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, roughness: 1.05, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: s.barniz, clearcoatRoughness: 0.4 });
  });
}
// tipo: 'tejido' | 'lino' | 'cuero' | 'terciopelo'
export function matTela(color, tipo = 'tejido') {
  return una('tela:' + color + ':' + tipo, () => {
    const t = texTela(tipo);
    const m = new THREE.MeshPhysicalMaterial({ color, map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughness: tipo === 'cuero' ? 0.5 : 0.95, side: THREE.DoubleSide });
    if (tipo === 'terciopelo') { m.sheen = 1; m.sheenRoughness = 0.35; m.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45); }
    else if (tipo !== 'cuero') { m.sheen = 0.35; m.sheenRoughness = 0.7; m.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.3); }
    if (tipo === 'cuero') { m.clearcoat = 0.25; m.clearcoatRoughness = 0.5; }
    return m;
  });
}

// Diccionario de materiales de una estancia amueblada (se fusiona con el de la casa).
export function materialesMobiliario(estilo, tela = null) {
  const s = ESTILOS[estilo] || ESTILOS.nordico;
  const [col, tipo] = tela || [s.tela, s.telaTipo];
  return { 'mob:atlas': matAtlas(), 'mob:madera': matMadera(estilo), 'mob:tela': matTela(col, tipo), 'mob:contacto': matContacto() };
}
