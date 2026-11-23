// Modelo de la cocina: sala, estilo y tramos de módulos. Todo en cm; la escena trabaja en metros.
// Un módulo es una «rebanada» vertical: lo de abajo (bajo o columna) y lo de arriba (alto) comparten ancho.

export const SERIES = {
  bormujos: { nombre: 'Bormujos', sub: 'roble claro mate', tipo: 'madera', color: '#cda97e' },
  lugo:     { nombre: 'Lugo', sub: 'roble natural', tipo: 'madera', color: '#a87c4f' },
  cadiz:    { nombre: 'Cádiz', sub: 'blanco mate', tipo: 'laca', color: '#ecebe5' },
  lisboa:   { nombre: 'Lisboa', sub: 'verde salvia mate', tipo: 'laca', color: '#8f9b86' },
  mallorca: { nombre: 'Mallorca', sub: 'blanco brillo', tipo: 'laca', color: '#f4f4f1', brillo: true },
  menorca:  { nombre: 'Menorca', sub: 'gris mate', tipo: 'laca', color: '#8c8b86' },
  zaragoza: { nombre: 'Zaragoza', sub: 'gris brillo', tipo: 'laca', color: '#6e7173', brillo: true },
  segovia:  { nombre: 'Segovia', sub: 'negro mate', tipo: 'laca', color: '#252525' },
};

export const ENCIMERAS = {
  blanco:  { nombre: 'Blanco', color: '#ecebe7', textura: 'cuarzo' },
  negro:   { nombre: 'Negro', color: '#1c1c1c', textura: 'cuarzo' },
  veteado: { nombre: 'Veteado', color: '#efedea', textura: 'marmol' },
  madera:  { nombre: 'Madera', color: '#b88d5c', textura: 'madera' },
  gris:    { nombre: 'Gris cemento', color: '#9d9a94', textura: 'cemento' },
};

export const TIRADORES = { barra: 'Barra inox', barraNegra: 'Barra negra', unero: 'Uñero (gola)', pomo: 'Pomo', sin: 'Sin tirador' };
export const CAMPANAS = { telescopica: 'Telescópica', integrada: 'Integrada en mueble', piramidal: 'Piramidal inox', plana: 'Decorativa plana', inclinada: 'Inclinada negra' };
export const PLACAS = { induccion: 'Inducción', gas: 'Gas' };
export const HORNOS = { inox: 'Inox', negro: 'Cristal negro' };
export const FRIGOS = { integrado: 'Integrado en columna', inox: 'Libre inox', blanco: 'Libre blanco' };
export const FRONTALES = { azulejo: 'Azulejo metro blanco', encimera: 'Igual que la encimera', pintura: 'Solo pintura' };
export const ZOCALOS = { aluminio: 'Aluminio', frente: 'Igual que los frentes', negro: 'Negro' };
export const SUELOS = { porcelanico: 'Porcelánico gris claro', beige: 'Porcelánico beige', tarima: 'Tarima roble' };
export const PAREDES = { blanco: { nombre: 'Blanco roto', color: '#efede8' }, arena: { nombre: 'Arena', color: '#e3dacb' }, perla: { nombre: 'Gris perla', color: '#d9d9d6' } };
export const FORMAS = { lineal: 'Lineal', L: 'En L', U: 'En U', paralelo: 'Paralela' };

export const USOS_BAJO = {
  puertas: 'Puertas', cajonero: 'Cajonero', fregadero: 'Fregadero', horno: 'Horno + placa', placa: 'Cajonero + placa',
  lavavajillas: 'Lavavajillas', lavadora: 'Lavadora', frigo: 'Frigorífico', columnaHorno: 'Columna horno + micro',
  despensa: 'Columna despensa', rincon: 'Rincón', hueco: 'Hueco libre', regleta: 'Regleta',
};
export const USOS_ALTO = { puertas: 'Puertas', abatible: 'Abatible', vitrina: 'Vitrina', campana: 'Campana', microondas: 'Microondas', estante: 'Estantes', vacio: 'Nada' };
export const COLUMNAS = new Set(['frigo', 'columnaHorno', 'despensa']);
export const ANCHOS = [15, 20, 30, 40, 45, 60, 80, 90, 100, 120];

// Medidas fijas (m)
export const M = {
  zoc: 0.12, casco: 0.72, enc: 0.038, fondoB: 0.56, fr: 0.018, encFondo: 0.62,
  altoY: 1.45, altoH: 0.70, fondoA: 0.33, colTop: 2.15, esquina: 0.60, esquinaEnc: 0.62,
};
M.topBajo = M.zoc + M.casco;
M.encTop = M.topBajo + M.enc;

let contador = 1;
export const nuevoId = () => 'm' + (contador++).toString(36) + Math.random().toString(36).slice(2, 5);

export function estadoInicial() {
  const e = {
    version: 1,
    forma: 'L',
    sala: { A: 360, B: 250, C: 250, fondo: 340, alto: 260, pasillo: 120 },
    ventana: { pared: 'A', x: 150, ancho: 110, alto: 120, antepecho: 105, activa: true },
    estilo: {
      serie: 'bormujos', serieAltos: 'igual', tirador: 'barra', encimera: 'blanco', acabadoEncimera: 'mate',
      grosorEncimera: 'normal', frontal: 'azulejo', zocalo: 'aluminio', suelo: 'porcelanico', pared: 'blanco',
      campana: 'piramidal', placa: 'induccion', horno: 'inox', frigo: 'integrado',
    },
    luz: { hora: 11, led: true, techo: false },
    tramos: { A: [], B: [], C: [], D: [] },
  };
  autodistribuir(e);
  return e;
}

// Paredes de la sala (m). a→b es de izquierda a derecha mirando la pared desde dentro; n = normal hacia dentro.
export function paredes(e) {
  const W = e.sala.A / 100, D = fondoSala(e);
  return {
    A: { a: [0, 0], b: [W, 0], n: [0, 1], largo: W },
    B: { a: [0, D], b: [0, 0], n: [1, 0], largo: D },
    C: { a: [W, 0], b: [W, D], n: [-1, 0], largo: D },
    D: { a: [W, D], b: [0, D], n: [0, -1], largo: W },
  };
}

export function fondoSala(e) {
  if (e.forma === 'paralelo') return (2 * 60 + e.sala.pasillo) / 100;
  return Math.max(e.sala.fondo, (e.forma === 'L' || e.forma === 'U') ? Math.max(e.sala.B, e.forma === 'U' ? e.sala.C : 0) : 0) / 100;
}

// Tramos activos: dónde empiezan y acaban los módulos sobre cada pared (m, coordenada s de la pared).
export function tramosDe(e) {
  const P = paredes(e), W = e.sala.A / 100, D = fondoSala(e);
  const t = [];
  const mk = (id, ini, fin, extra = {}) => {
    const p = P[id];
    const dir = [(p.b[0] - p.a[0]) / p.largo, (p.b[1] - p.a[1]) / p.largo];
    t.push({ id, a: p.a, dir, n: p.n, largoPared: p.largo, ini, fin, esqIni: false, esqFin: false, ...extra });
  };
  if (e.forma === 'lineal') mk('A', 0, W);
  if (e.forma === 'L') { mk('A', 0, W, { esqIni: true }); mk('B', D - e.sala.B / 100, D - M.esquina, { esqFinPared: true }); }
  if (e.forma === 'U') {
    mk('A', 0, W, { esqIni: true, esqFin: true });
    mk('B', D - e.sala.B / 100, D - M.esquina, { esqFinPared: true });
    mk('C', M.esquina, e.sala.C / 100, { esqIniPared: true });
  }
  if (e.forma === 'paralelo') { mk('A', 0, W); mk('D', 0, W); }
  for (const r of t) r.mods = e.tramos[r.id] || [];
  return t;
}

export function ocupado(mods) { return mods.reduce((s, m) => s + m.ancho, 0); }

export function infoTramos(e) {
  return tramosDe(e).map(t => {
    const util = Math.round((t.fin - t.ini) * 100);
    const occ = ocupado(t.mods);
    return { id: t.id, util, ocupado: occ, libre: util - occ };
  });
}

// ---------- Reparto automático ----------
const COSTE = { 120: 1.6, 100: 1.4, 90: 1.1, 80: 1, 60: 1, 45: 1.3, 40: 1.3, 30: 1.5, 20: 2.6, 15: 2.6 };
const RELLENO = [90, 80, 60, 45, 40, 30, 20, 15];

// Mejor combinación de anchos estándar que cubre como mucho `cm` (sobra < 5 → regleta).
export function rellenar(cm) {
  cm = Math.floor(cm);
  if (cm < 15) return { anchos: [], sobra: Math.max(0, cm) };
  const best = new Array(cm + 1).fill(null);
  best[0] = { coste: 0, anchos: [] };
  for (let L = 1; L <= cm; L++) {
    for (const a of RELLENO) {
      if (a > L || !best[L - a]) continue;
      const c = best[L - a].coste + COSTE[a];
      if (!best[L] || c < best[L].coste) best[L] = { coste: c, anchos: [...best[L - a].anchos, a] };
    }
  }
  for (let L = cm; L >= 0; L--) if (best[L]) {
    const anchos = [...best[L].anchos].sort((x, y) => y - x);
    return { anchos, sobra: cm - L };
  }
  return { anchos: [], sobra: cm };
}

const mod = (bajo, ancho, alto = 'puertas') => ({ id: nuevoId(), ancho, bajo, alto });

function rellenoMods(cm) {
  const r = rellenar(cm);
  const out = r.anchos.map(a => mod('puertas', a));
  // alternar algún cajonero para que no quede todo igual
  const i60 = out.findIndex(m => m.ancho === 60 || m.ancho === 80);
  if (out.length >= 3 && i60 >= 0) out[i60].bajo = 'cajonero';
  return { mods: out, sobra: r.sobra };
}

// Coloca piezas fijas en su centro deseado y rellena los huecos.
function componer(iniCm, finCm, fijas) {
  fijas = fijas.filter(Boolean).sort((a, b) => a.centro - b.centro);
  const total = finCm - iniCm;
  while (fijas.reduce((s, f) => s + f.ancho, 0) > total && fijas.length) {
    // quitar la de menor prioridad
    let k = 0; fijas.forEach((f, i) => { if ((f.prio ?? 5) < (fijas[k].prio ?? 5)) k = i; });
    fijas.splice(k, 1);
  }
  const out = [];
  let cursor = iniCm;
  fijas.forEach((f, i) => {
    const resto = fijas.slice(i + 1).reduce((s, x) => s + x.ancho, 0);
    let inicio = Math.round(f.centro - f.ancho / 2);
    inicio = Math.max(cursor, Math.min(inicio, finCm - resto - f.ancho));
    if (f.pegado) inicio = cursor;
    const r = rellenoMods(inicio - cursor);
    out.push(...r.mods);
    cursor += ocupado(r.mods);
    if (r.sobra >= 2) { out.push(mod('regleta', r.sobra, 'vacio')); cursor += r.sobra; }
    out.push(mod(f.bajo, f.ancho, f.alto || 'puertas'));
    cursor += f.ancho;
  });
  const r = rellenoMods(finCm - cursor);
  out.push(...r.mods);
  if (r.sobra >= 2) out.push(mod('regleta', r.sobra, 'vacio'));
  return out;
}

export function autodistribuir(e) {
  const T = Object.fromEntries(tramosDe(e).map(t => [t.id, t]));
  const cm = v => Math.round(v * 100);
  const v = e.ventana;
  const centroVentana = id => (v.activa && v.pared === id) ? v.x + v.ancho / 2 : null;
  const nuevos = { A: [], B: [], C: [], D: [] };
  const W = e.sala.A;

  if (e.forma === 'lineal' || e.forma === 'paralelo') {
    const conFrigo = W >= 240;
    const cf = centroVentana('A') ?? W * 0.64;
    const fijasA = [
      conFrigo && { bajo: 'frigo', ancho: 60, centro: 0, pegado: true, prio: 4 },
      { bajo: 'fregadero', ancho: 80, centro: cf, prio: 9 },
      W >= 200 && { bajo: 'lavavajillas', ancho: 60, centro: cf + 70, prio: 3 },
    ];
    if (e.forma === 'lineal') {
      const ch = Math.max(conFrigo ? 150 : 60, W * 0.28);
      fijasA.push({ bajo: 'horno', ancho: 60, centro: ch, alto: 'campana', prio: 8 });
      // el cajonero va al otro lado del horno: el lavavajillas tiene que quedar pegado al fregadero
      if (W >= 300) fijasA.push({ bajo: 'cajonero', ancho: 60, centro: ch - 60, prio: 2 });
    }
    nuevos.A = componer(0, W, fijasA);
    if (e.forma === 'paralelo') {
      nuevos.D = componer(0, W, [
        { bajo: 'horno', ancho: 60, centro: W / 2, alto: 'campana', prio: 8 },
        { bajo: 'cajonero', ancho: 60, centro: W / 2 + 60, prio: 2 },
      ]);
    }
  }

  if (e.forma === 'L' || e.forma === 'U') {
    const rincon = 100;
    const finA = W;
    const cf = centroVentana('A') ?? W * 0.55;
    const fijasA = [
      { bajo: 'rincon', ancho: rincon, centro: 0, pegado: true, prio: 10 },
      { bajo: 'fregadero', ancho: 80, centro: Math.max(cf, rincon + 40), prio: 9 },
      { bajo: 'lavavajillas', ancho: 60, centro: Math.max(cf, rincon + 40) + 70, prio: 3 },
    ];
    if (e.forma === 'U') fijasA.push({ bajo: 'rincon', ancho: rincon, centro: finA, prio: 10 });
    nuevos.A = componer(0, finA, fijasA);
    const tB = T.B, largoB = cm(tB.fin - tB.ini);
    nuevos.B = componer(0, largoB, [
      largoB >= 180 && { bajo: 'frigo', ancho: 60, centro: 0, pegado: true, prio: 4 },
      { bajo: 'horno', ancho: 60, centro: largoB >= 180 ? Math.max(largoB * 0.6, 150) : largoB / 2, alto: 'campana', prio: 8 },
      largoB >= 200 && { bajo: 'cajonero', ancho: 60, centro: Math.max(largoB * 0.6, 150) + 60, prio: 2 },
    ]);
    if (e.forma === 'U') {
      const tC = T.C, largoC = cm(tC.fin - tC.ini);
      nuevos.C = componer(0, largoC, [{ bajo: 'cajonero', ancho: 60, centro: 30, pegado: true, prio: 2 }]);
    }
  }
  e.tramos = nuevos;
  ajustarAltos(e);
}

// Altos automáticos: nada delante de la ventana y nada sobre las columnas.
export function ajustarAltos(e, soloVentana = false) {
  const v = e.ventana;
  for (const t of tramosDe(e)) {
    let s = Math.round(t.ini * 100);
    for (const m of t.mods) {
      const x0 = s, x1 = s + m.ancho; s = x1;
      if (soloVentana) continue;
      if (COLUMNAS.has(m.bajo)) { m.alto = 'vacio'; continue; }
      if (m.bajo === 'regleta') { m.alto = 'vacio'; continue; }
      if (v.activa && v.pared === t.id && x1 > v.x + 2 && x0 < v.x + v.ancho - 2 && v.antepecho + v.alto > M.altoY * 100) { m.alto = 'vacio'; continue; }
      if ((m.bajo === 'horno' || m.bajo === 'placa') && m.alto === 'puertas') m.alto = 'campana';
    }
  }
}

// ---------- Ediciones ----------
export function clonar(e) { return JSON.parse(JSON.stringify(e)); }

export function moduloEn(e, sel) { return sel && e.tramos[sel.tramo] ? e.tramos[sel.tramo][sel.idx] : null; }

export const ed = {
  ancho(e, sel, cm) { const m = moduloEn(e, sel); if (m) m.ancho = Math.max(5, Math.min(150, Math.round(cm))); },
  bajo(e, sel, uso) {
    const m = moduloEn(e, sel); if (!m) return;
    m.bajo = uso;
    if (COLUMNAS.has(uso)) m.alto = 'vacio';
    else if ((uso === 'horno' || uso === 'placa') && m.alto !== 'vacio') m.alto = 'campana';
    else if (m.alto === 'campana') m.alto = 'puertas';
    if (uso === 'regleta') m.alto = 'vacio';
  },
  alto(e, sel, uso) { const m = moduloEn(e, sel); if (m && !COLUMNAS.has(m.bajo)) m.alto = uso; },
  mover(e, sel, d) {
    const L = e.tramos[sel.tramo]; const j = sel.idx + d;
    if (!L || j < 0 || j >= L.length) return sel;
    [L[sel.idx], L[j]] = [L[j], L[sel.idx]];
    return { ...sel, idx: j };
  },
  borrar(e, sel) { const L = e.tramos[sel.tramo]; if (L) L.splice(sel.idx, 1); return null; },
  duplicar(e, sel) {
    const L = e.tramos[sel.tramo]; const m = moduloEn(e, sel); if (!m) return sel;
    L.splice(sel.idx + 1, 0, { ...m, id: nuevoId() }); return { ...sel, idx: sel.idx + 1 };
  },
  insertar(e, sel, ancho = 60) {
    const L = e.tramos[sel.tramo]; if (!L) return sel;
    L.splice(sel.idx + 1, 0, mod('puertas', ancho)); return { ...sel, idx: sel.idx + 1 };
  },
  anadirAlFinal(e, tramo, ancho = 60) {
    const L = e.tramos[tramo] || (e.tramos[tramo] = []);
    L.push(mod('puertas', ancho)); return { tramo, idx: L.length - 1 };
  },
  // Ajusta el último módulo para que el tramo quede justo (sin huecos ni sobrantes)
  cuadrar(e, tramo) {
    const t = tramosDe(e).find(x => x.id === tramo); if (!t) return;
    const util = Math.round((t.fin - t.ini) * 100);
    const L = e.tramos[tramo]; if (!L.length) return;
    const libre = util - ocupado(L);
    if (libre === 0) return;
    if (libre > 0 && libre < 15) L.push(mod('regleta', libre, 'vacio'));
    else { const u = L[L.length - 1]; u.ancho = Math.max(10, u.ancho + libre); }
  },
};
