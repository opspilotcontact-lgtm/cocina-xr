// Interfaz de escritorio/móvil. Casi todo sale del catálogo común (js/opciones.js → grupos(app)), el mismo que usa el
// panel de las gafas: aquí solo se decide CÓMO se pinta cada fila (muestras, botones, deslizador…) y dónde.
//
// Pestañas:  Casa (plantillas, plano, estancias) · <estancia elegida> (con subapartados en cocina y baño) · Luz · Proyecto
// Inspector flotante: lo seleccionado en el 3D (módulo de cocina o pieza del baño).
// Partes a medida (no salen de grupos(), y por qué):
// - la lista de estancias de Casa: en pantalla cabe una lista con m² y «Entrar»; en las gafas basta el ciclo del grupo
// - el nombre de la estancia (texto libre: no hay fila de texto en el contrato y en las gafas no se teclea)
// - Proyecto (guardar/abrir archivo y captura) y la calidad de imagen: son cosas del navegador, no del modelo
// - el plano 2D vive en js/casa/plano.js (editor SVG con arrastre: no es una lista de opciones)
import { grupos, estanciaElegida, accionSeleccion } from './opciones.js';
import { TIPOS, utilEstancia } from './casa/modelo-casa.js';

const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, ...hijos) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const m2 = v => v.toFixed(1).replace('.', ',') + ' m²';
const fondoMuestra = m => {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.tipo === 'madera') return `repeating-linear-gradient(90deg, ${m.color} 0 6px, color-mix(in srgb, ${m.color} 82%, #3a2410) 6px 7px, ${m.color} 7px 11px)`;
  return m.color || '';
};

export function montarUI(app) {
  let pestana = app.casa.estancias.length > 1 ? 'casa' : 'estancia';
  const seccionPorTipo = {};       // subapartado elegido en la pestaña de estancia (por tipo de estancia)
  let claveSel = '';
  const cuerpo = $('#panelCuerpo');
  const insp = $('#inspector');

  // ---------- filas ----------
  const resultado = r => { if (typeof r === 'string' && r) aviso(r); };
  const fijar = (f, v) => resultado(f.set(v));
  const ejecutar = f => { if (f.confirmar && !window.confirm(f.confirmar)) return; resultado(f.fn()); };
  const etq = t => h('span', { class: 'etq' }, t);

  function pintarCiclo(f) {
    const o = f.opciones(), a = f.actual();
    let ctrl;
    if (o.some(x => x.muestra)) {
      ctrl = h('div', { class: 'muestras' }, o.map(x => h('button', { class: 'muestra' + (x.v === a ? ' on' : ''), title: x.label, onclick: () => fijar(f, x.v) },
        h('i', { style: `background:${fondoMuestra(x.muestra)}` }), h('b', {}, x.label))));
    } else if (o.length > 1 && o.every(x => x.label.length <= 4)) {
      ctrl = h('div', { class: 'seg chico' }, o.map(x => h('button', { class: x.v === a ? 'on' : '', onclick: () => fijar(f, x.v) }, x.label)));
    } else if (o.length <= 4 && o.reduce((s, x) => s + x.label.length, 0) <= 42) {
      ctrl = h('div', { class: 'seg' }, o.map(x => h('button', { class: x.v === a ? 'on' : '', onclick: () => fijar(f, x.v) }, x.label)));
    } else {
      const s = h('select', {}, o.map((x, i) => h('option', { value: i, selected: x.v === a }, x.label)));
      if (!o.some(x => x.v === a)) s.prepend(h('option', { value: '', selected: true, disabled: true }, f.valor()));
      s.addEventListener('change', () => { const x = o[Number(s.value)]; if (x) fijar(f, x.v); });
      ctrl = s;
    }
    return h('div', { class: 'op' }, etq(f.label), ctrl);
  }

  function pintarNum(f) {
    const a = f.actual();
    if (f.deslizador) {
      const r = h('input', { type: 'range', min: f.min, max: f.max, step: f.paso, value: a });
      const v = h('b', {}, f.valor());
      let orig = null;
      r.addEventListener('input', () => {
        if (orig == null) orig = f.actual();
        const n = Number(r.value);
        if (f.previsualizar) f.previsualizar(n);
        v.textContent = f.fmt ? f.fmt(n) : String(n);
      });
      r.addEventListener('change', () => { const n = Number(r.value); if (orig != null && f.previsualizar) f.previsualizar(orig); orig = null; r.blur(); fijar(f, n); });
      return h('div', { class: 'op' }, etq(f.label), h('div', { class: 'hora' }, r, v));
    }
    const i = h('input', { type: 'number', value: a, min: f.min, max: f.max, step: f.paso, inputmode: 'decimal' });
    i.addEventListener('change', () => fijar(f, Number(i.value)));
    const paso = d => () => fijar(f, f.actual() + d * f.paso);
    return h('div', { class: 'op campo' }, etq(f.label),
      h('div', { class: 'num' },
        h('button', { class: 'paso', type: 'button', onclick: paso(-1), disabled: a <= f.min, title: `−${f.paso}` }, '−'),
        i, f.unidad ? h('em', {}, f.unidad) : null,
        h('button', { class: 'paso', type: 'button', onclick: paso(1), disabled: a >= f.max, title: `+${f.paso}` }, '+')));
  }

  function pintarToggle(f) {
    const a = !!f.actual();
    return h('div', { class: 'op campo' }, etq(f.label), h('div', { class: 'seg' },
      h('button', { class: a ? 'on' : '', onclick: () => { if (!a) fijar(f, true); } }, 'Sí'),
      h('button', { class: !a ? 'on' : '', onclick: () => { if (a) fijar(f, false); } }, 'No')));
  }

  function pintarAccion(f) {
    const elegida = f.id.startsWith('elegir-') && app.seleccion?.id === f.id.slice(7);
    return h('button', { class: (f.peligro ? 'peligro' : '') + (elegida ? ' on' : ''), onclick: () => ejecutar(f) }, f.label);
  }

  // Une filas seguidas del mismo estilo: números y sí/no en rejilla de dos, acciones en una botonera
  function pintarFilas(filas) {
    const out = [];
    let acc = null, rej = null;
    for (const f of filas) {
      if (f.tipo === 'accion') {
        rej = null;
        if (!acc) { acc = h('div', { class: 'acciones' }); out.push(acc); }
        if (f.label.length > 26) acc.classList.add('col');
        acc.append(pintarAccion(f)); continue;
      }
      acc = null;
      if ((f.tipo === 'num' && !f.deslizador) || f.tipo === 'toggle') {
        if (!rej) { rej = h('div', { class: 'rejilla' }); out.push(rej); }
        rej.append(f.tipo === 'num' ? pintarNum(f) : pintarToggle(f)); continue;
      }
      rej = null;
      if (f.tipo === 'ciclo') out.push(pintarCiclo(f));
      else if (f.tipo === 'num') out.push(pintarNum(f));
      else if (f.tipo === 'texto') out.push(h('p', { class: 'nota' + (f.nivel ? ' ' + f.nivel : '') }, f.texto));
    }
    return out;
  }
  const bloque = (titulo, hijos) => h('section', { class: 'bloque' }, titulo && h('h3', {}, titulo), ...hijos);

  // ---------- pestaña Casa ----------
  function listaEstancias() {
    const casa = app.casa, sel = estanciaElegida(app)?.id;
    return [h('div', { class: 'estancias' }, casa.estancias.map(e => h('div', { class: 'estancia' + (e.id === sel ? ' on' : '') },
      h('button', { class: 'nombre', onclick: () => { app.seleccionar({ ambito: 'estancia', estancia: e.id }); irA('estancia'); } },
        h('i', { style: `background:${(TIPOS[e.tipo] || TIPOS.otro).color}` }), h('b', {}, e.nombre),
        h('small', {}, m2(utilEstancia(e)) + (e.id === casa.cocinaActiva && casa.estancias.filter(x => x.cocina).length > 1 ? ' · en edición' : ''))),
      h('button', { onclick: () => { app.entrar(e.id); irA('estancia'); }, title: 'Ver la estancia por dentro' }, 'Entrar'))))];
  }
  function pintarCasa(gs) {
    return gs.filter(g => g.ambito === 'casa').map(g => g.id === 'casa-estancias' ? bloque(g.titulo, listaEstancias()) : bloque(g.titulo, pintarFilas(g.filas)));
  }

  // ---------- pestaña de la estancia ----------
  function pintarEstancia(gs) {
    const est = estanciaElegida(app);
    if (!est) return [h('p', { class: 'nota' }, 'Toca una estancia en el 3D o en la lista de Casa.')];
    const gsE = gs.filter(g => g.ambito === 'estancia');
    const secciones = [...new Set(gsE.map(g => g.seccion || 'Estancia'))];
    let sec = seccionPorTipo[est.tipo];
    if (!secciones.includes(sec)) sec = secciones[0];
    const nombre = h('input', { type: 'text', value: est.nombre, class: 'texto', 'aria-label': 'Nombre de la estancia' });
    nombre.addEventListener('change', () => { const v = nombre.value.trim(); if (v && v !== est.nombre) app.cambiarCasa(c => { const e = c.estancias.find(x => x.id === est.id); if (e) e.nombre = v; }); });
    const out = [h('div', { class: 'cab-estancia' }, h('i', { style: `background:${(TIPOS[est.tipo] || TIPOS.otro).color}` }), nombre,
      h('small', {}, `${(TIPOS[est.tipo] || TIPOS.otro).nombre} · ${m2(utilEstancia(est))}`))];
    if (secciones.length > 1) out.push(h('nav', { class: 'sub' }, secciones.map(s => h('button', { class: s === sec ? 'on' : '', onclick: () => { seccionPorTipo[est.tipo] = s; refrescar(); } }, s))));
    for (const g of gsE.filter(g => (g.seccion || 'Estancia') === sec)) out.push(bloque(g.id === 'estancia' ? 'Tipo, medidas y acabados' : g.titulo, pintarFilas(g.filas)));
    return out;
  }

  // ---------- Luz y Proyecto ----------
  function pintarLuz(gs) {
    return [
      ...gs.filter(g => g.ambito === 'luz').map(g => bloque(null, pintarFilas(g.filas))),
      bloque('Calidad de imagen', [h('div', { class: 'seg' }, [['alta', 'Alta (sombras de contacto)'], ['normal', 'Normal']].map(([k, t]) =>
        h('button', { class: (app.calidad ? 'alta' : 'normal') === k ? 'on' : '', onclick: () => { app.setCalidad(k === 'alta'); refrescar(); } }, t))),
      h('p', { class: 'nota' }, 'Si el equipo va justo, la calidad baja sola a Normal.')]),
    ];
  }
  function pintarProyecto() {
    return [
      bloque('Archivo', [
        h('div', { class: 'acciones' },
          h('button', { onclick: () => bajar('vivienda.json', 'data:application/json;charset=utf-8,' + encodeURIComponent(app.exportar())) }, 'Guardar archivo'),
          h('button', { onclick: () => $('#abrir').click() }, 'Abrir archivo')),
        h('p', { class: 'nota' }, 'El proyecto se guarda solo en este navegador a cada cambio. El archivo sirve para llevarlo a otro equipo o a las gafas. También abre cocinas sueltas de la versión anterior.'),
      ]),
      bloque('Imagen para el cliente', [
        h('div', { class: 'acciones' }, h('button', { class: 'fuerte', onclick: () => bajar('vista.jpg', app.capturar()) }, 'Descargar captura de esta vista')),
        h('p', { class: 'nota' }, 'Encuadra antes con las vistas de abajo (General, Dentro, Detalle…).'),
      ]),
      bloque('Empezar de nuevo', [
        h('div', { class: 'acciones' }, h('button', { onclick: () => irA('casa') }, 'Elegir una plantilla de vivienda')),
      ]),
    ];
  }

  // ---------- inspector ----------
  function pintarInspector(gs) {
    const g = gs.find(x => x.ambito === 'seleccion');
    insp.hidden = !g;
    if (!g) return;
    const s = app.seleccion, scroll = insp.querySelector('.insp-cuerpo')?.scrollTop || 0;
    const cerrar = () => app.seleccionar(s?.ambito === 'elemento' ? { ambito: 'estancia', estancia: s.estancia } : null);
    const c = h('div', { class: 'insp-cuerpo' }, ...pintarFilas(g.filas));
    insp.replaceChildren(h('header', {}, h('b', {}, g.titulo), h('button', { class: 'x', onclick: cerrar, title: 'Cerrar (Esc)' }, '×')), c);
    c.scrollTop = scroll;
  }

  function refrescar() {
    const foco = document.activeElement;
    if (foco && foco.type === 'range' && (cuerpo.contains(foco) || insp.contains(foco))) return;
    const gs = grupos(app);
    // al elegir algo en el 3D estando en Casa, se pasa a su estancia
    const s = app.seleccion, clave = s ? `${s.ambito}:${s.estancia || ''}:${s.id ?? s.idx ?? ''}` : '';
    if (clave !== claveSel) { if (s && s.ambito !== 'modulo' && pestana === 'casa') pestana = 'estancia'; claveSel = clave; }
    const scroll = cuerpo.scrollTop;
    const contenido = { casa: pintarCasa, estancia: pintarEstancia, luz: pintarLuz, proyecto: pintarProyecto }[pestana](gs);
    cuerpo.replaceChildren(...contenido.filter(Boolean));
    cuerpo.scrollTop = scroll;
    const est = estanciaElegida(app);
    const bEst = document.querySelector('#pestanas [data-p="estancia"]');
    if (bEst) { bEst.textContent = est?.nombre || 'Estancia'; bEst.title = est ? `Opciones de ${est.nombre}` : ''; }
    document.querySelectorAll('#pestanas button').forEach(b => b.classList.toggle('on', b.dataset.p === pestana));
    pintarInspector(gs);
    const xrDisp = app.xrDisponible || {};
    $('#btnVR').disabled = !xrDisp.vr; $('#btnAR').disabled = !xrDisp.ar;
  }

  function irA(p) {
    if (p === 'espacio' || p === 'estilo' || p === 'electro') p = 'estancia'; // nombres antiguos
    pestana = p; document.body.classList.add('panel-abierto'); refrescar();
  }
  app.irA = irA;
  document.querySelectorAll('#pestanas button').forEach(b => b.addEventListener('click', () => irA(b.dataset.p)));
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => app.vista(b.dataset.vista)));
  $('#btnDeshacer').addEventListener('click', () => app.deshacer());
  $('#btnRehacer').addEventListener('click', () => app.rehacer());
  $('#btnPanel').addEventListener('click', () => document.body.classList.toggle('panel-abierto'));
  $('#abrir').addEventListener('change', async ev => { const f = ev.target.files[0]; if (f) { try { app.importar(await f.text()); } catch { aviso('Ese archivo no es una vivienda ni una cocina válida'); } } ev.target.value = ''; });

  // acciones de teclado sobre lo seleccionado (Supr → 'borrar')
  const accion = id => resultado(accionSeleccion(app, id));
  return { refrescar, accion };
}

function bajar(nombre, url) { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove(); }
export function aviso(txt) { const el = document.getElementById('aviso'); el.textContent = txt; el.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 3500); }
