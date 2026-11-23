// Amueblado de piso piloto (home staging) para toda la vivienda salvo las cocinas (tienen su motor).
//
//   engancharMobiliario(casa, casaR, { cocinaId } = {}) → { grupo, mallas, piezas, ms, cache }
//
// - `casa` es el modelo (modelo-casa.js) y `casaR` lo que devuelve construirCasa(); el grupo de muebles se añade a
//   casaR.grupo en coordenadas de la casa, así hereda la matriz que app.js le pone y se libera con ella.
// - Lee casa.mobiliario = { estilo, densidad, activo } (por defecto nórdico, completo; ver estilos.js).
// - Salón(-comedor), dormitorios, recibidor/pasillo y terraza se amueblan aquí; el baño lo construye js/bano.js y aquí
//   solo se viste con decorarBano (bano-deco.js). Cocinas, lavaderos y «otras» se dejan como están.
// - Rendimiento: TODO el piso se fusiona por material → atlas + madera + contacto + un tejido por color (≈ 5 mallas
//   para un piso de 3 dormitorios). Se guarda la última construcción: si la planta y el estilo no cambian (p. ej. se
//   edita la cocina) se reutiliza tal cual.
import { Lote, fusionar, matrizTramo } from '../geo.js';
import { calcularTabiques, marcoEstancia, area } from '../casa/modelo-casa.js';
import { estadoBanoCasa } from '../casa/bano-enganche.js';
import { rng } from '../texturas.js';
import { Kit } from './kit.js';
import { Espacio, salon, dormitorio, recibidor, terraza } from './estancias.js';
import { decorarBano } from './bano-deco.js';
import { ESTILOS, leerMobiliario } from './estilos.js';
import { matAtlas, matMadera, matTela, matContacto } from './atlas.js';

const semilla = txt => { let h = 2166136261; for (const c of String(txt)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
let ultimo = null;   // { clave, grupo, info }

// Tejido principal de cada tipo de estancia: [color, tipo]
function telaDe(tipo, st) {
  if (tipo === 'dormitorio') return [st.ropaCama, st.id === 'nordico' || st.id === 'clasico' ? 'lino' : 'tejido'];
  return [st.tela, st.telaTipo];
}

export function engancharMobiliario(casa, casaR, { cocinaId = null } = {}) {
  const t0 = performance.now();
  if (!casa || !casaR?.grupo) return null;
  const cfgCasa = leerMobiliario(casa);
  const clave = JSON.stringify({ c: cfgCasa, e: casa.estancias.map(e => ({ ...e, cocina: undefined, contenido: e.tipo === 'bano' ? e.contenido : undefined })), h: casa.huecos });
  if (ultimo?.clave === clave) {
    casaR.grupo.add(ultimo.grupo);
    return { ...ultimo.info, ms: performance.now() - t0, cache: true };
  }
  const tabs = calcularTabiques(casa);
  const total = new Lote();
  const mats = { 'mob:atlas': matAtlas(), 'mob:contacto': matContacto() };
  const dorms = casa.estancias.filter(e => e.tipo === 'dormitorio');
  const principal = dorms.reduce((m, e) => (!m || area(e.poligono) > area(m.poligono) ? e : m), null);
  let piezas = 0;
  for (const est of casa.estancias) {
    if (est.tipo === 'cocina' || est.id === cocinaId) continue;
    const cfg = leerMobiliario(casa, est);
    if (!cfg.activo) continue;
    const st = ESTILOS[cfg.estilo], completo = cfg.densidad === 'completo';
    const r = rng(semilla(est.id + cfg.estilo));
    let L = null;
    try {
      if (est.tipo === 'bano') {
        L = decorarBano(estadoBanoCasa(casa, est), cfg.estilo, cfg.densidad, semilla(est.id));
      } else if (['salon', 'dormitorio', 'recibidor', 'pasillo', 'terraza'].includes(est.tipo)) {
        L = new Lote();
        const k = new Kit(L), E = new Espacio(est, tabs);
        if (est.tipo === 'salon') salon(E, k, st, r, completo);
        else if (est.tipo === 'dormitorio') dormitorio(E, k, st, r, completo, est === principal);
        else if (est.tipo === 'terraza') terraza(E, k, st, r, completo);
        else recibidor(E, k, st, r, completo, est.tipo === 'pasillo');
      }
    } catch (err) { console.warn('mobiliario de', est.nombre || est.tipo, 'falló:', err); L = null; }
    if (!L?.partes.length) continue;
    const m = marcoEstancia(est);
    const Me = matrizTramo([m.origen[0] / 100, m.origen[1] / 100], m.dir);
    const [col, tipo] = telaDe(est.tipo, st);
    const kTela = `mob:tela:${col}:${tipo}`;
    const kMadera = 'mob:madera:' + cfg.estilo;
    mats[kMadera] ||= matMadera(cfg.estilo);
    for (const p of L.partes) {
      let mat = p.mat;
      if (mat === 'mob:tela') { mat = kTela; mats[kTela] ||= matTela(col, tipo); }
      else if (mat === 'mob:madera') mat = kMadera;
      total.partes.push({ ...p, mat, m: Me.clone().multiply(p.m) });
    }
    piezas += L.partes.length;
  }
  const tF = performance.now();
  const grupo = fusionar(total, mats);
  grupo.name = 'mobiliario';
  grupo.traverse(o => { if (o.isMesh) o.name = 'mobiliario:' + o.name; });
  casaR.grupo.add(grupo);
  const info = { grupo, mallas: grupo.children.length, piezas, estilo: cfgCasa.estilo, densidad: cfgCasa.densidad, msFusion: performance.now() - tF };
  ultimo = { clave, grupo, info };
  return { ...info, ms: performance.now() - t0, cache: false };
}

export { decorarBano } from './bano-deco.js';
export { ESTILOS, DENSIDADES, leerMobiliario } from './estilos.js';
