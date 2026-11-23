// Interfaz de escritorio/móvil: panel con pestañas + inspector del módulo seleccionado.
import {
  SERIES, ENCIMERAS, TIRADORES, CAMPANAS, PLACAS, HORNOS, FRIGOS, FRONTALES, ZOCALOS, SUELOS, PAREDES, FORMAS,
  USOS_BAJO, USOS_ALTO, COLUMNAS, ANCHOS, autodistribuir, ajustarAltos, infoTramos, ed, moduloEn,
} from './modelo.js';

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

export function montarUI(app) {
  let pestana = 'estilo';
  const cuerpo = $('#panelCuerpo');
  const insp = $('#inspector');

  const set = (fn) => app.cambiar(fn);
  const seg = (opciones, valor, onPick, extra = {}) => h('div', { class: 'seg' + (extra.col ? ' col' : '') },
    Object.entries(opciones).map(([k, v]) => h('button', { class: k === valor ? 'on' : '', onclick: () => onPick(k), title: typeof v === 'string' ? v : v.nombre }, typeof v === 'string' ? v : v.nombre)));
  const campo = (etq, ...ctrl) => h('label', { class: 'campo' }, h('span', {}, etq), ...ctrl);
  const num = (valor, onSet, { min = 0, max = 1000, paso = 1, suf = 'cm' } = {}) => {
    const i = h('input', { type: 'number', value: valor, min, max, step: paso, inputmode: 'numeric' });
    i.addEventListener('change', () => { const v = Math.max(min, Math.min(max, Number(i.value) || 0)); onSet(v); });
    return h('div', { class: 'num' }, i, h('em', {}, suf));
  };
  const titulo = t => h('h3', {}, t);

  const muestra = (id, s, sel, onPick) => {
    const fondo = s.tipo === 'madera'
      ? `repeating-linear-gradient(90deg, ${s.color} 0 6px, color-mix(in srgb, ${s.color} 82%, #3a2410) 6px 7px, ${s.color} 7px 11px)`
      : s.color;
    return h('button', { class: 'muestra' + (sel ? ' on' : ''), onclick: () => onPick(id) },
      h('i', { style: `background:${fondo}` + (s.brillo ? ';box-shadow: inset 0 8px 10px -6px rgba(255,255,255,.9)' : '') }),
      h('b', {}, s.nombre), h('small', {}, s.sub || ''));
  };

  function pintarEspacio() {
    const e = app.estado;
    const info = infoTramos(e);
    const descuadre = info.some(t => t.libre !== 0);
    return [
      titulo('Forma'),
      seg(FORMAS, e.forma, k => set(st => { st.forma = k; autodistribuir(st); return null; })),
      titulo('Medidas'),
      h('div', { class: 'rejilla' },
        campo(e.forma === 'paralelo' ? 'Largo de cada frente' : 'Pared A (frente)', num(e.sala.A, v => set(st => { st.sala.A = v; }), { min: 120, max: 900 })),
        (e.forma === 'L' || e.forma === 'U') && campo('Pared B (izquierda)', num(e.sala.B, v => set(st => { st.sala.B = v; }), { min: 120, max: 900 })),
        e.forma === 'U' && campo('Pared C (derecha)', num(e.sala.C, v => set(st => { st.sala.C = v; }), { min: 120, max: 900 })),
        e.forma === 'paralelo'
          ? campo('Pasillo', num(e.sala.pasillo, v => set(st => { st.sala.pasillo = v; }), { min: 80, max: 300 }))
          : campo('Fondo de la sala', num(e.sala.fondo, v => set(st => { st.sala.fondo = v; }), { min: 150, max: 900 })),
        campo('Alto de techo', num(e.sala.alto, v => set(st => { st.sala.alto = v; }), { min: 220, max: 350 })),
      ),
      titulo('Ventana'),
      h('div', { class: 'rejilla' },
        campo('Hay ventana', h('div', { class: 'seg' }, h('button', { class: e.ventana.activa ? 'on' : '', onclick: () => set(st => { st.ventana.activa = true; ajustarAltos(st); }) }, 'Sí'), h('button', { class: !e.ventana.activa ? 'on' : '', onclick: () => set(st => { st.ventana.activa = false; }) }, 'No'))),
        e.ventana.activa && campo('Pared', seg({ A: 'A', B: 'B', C: 'C', D: 'D' }, e.ventana.pared, k => set(st => { st.ventana.pared = k; ajustarAltos(st); }))),
        e.ventana.activa && campo('Desde la izquierda', num(e.ventana.x, v => set(st => { st.ventana.x = v; ajustarAltos(st); }), { max: 900 })),
        e.ventana.activa && campo('Ancho', num(e.ventana.ancho, v => set(st => { st.ventana.ancho = v; ajustarAltos(st); }), { min: 40, max: 300 })),
        e.ventana.activa && campo('Alto', num(e.ventana.alto, v => set(st => { st.ventana.alto = v; ajustarAltos(st); }), { min: 40, max: 250 })),
        e.ventana.activa && campo('Antepecho', num(e.ventana.antepecho, v => set(st => { st.ventana.antepecho = v; ajustarAltos(st); }), { min: 0, max: 200 })),
      ),
      titulo('Tramos'),
      h('div', { class: 'tramos' }, info.map(t => h('div', { class: 'tramo' + (t.libre < 0 ? ' mal' : t.libre > 0 ? ' aviso' : '') },
        h('b', {}, 'Pared ' + t.id),
        h('span', {}, `${t.util} cm · ${t.libre === 0 ? 'cuadra' : t.libre > 0 ? `sobran ${t.libre} cm` : `faltan ${-t.libre} cm`}`),
        h('div', { class: 'mini' },
          h('button', { onclick: () => app.cambiar(st => ed.anadirAlFinal(st, t.id, Math.min(60, Math.max(15, t.libre || 60)))) }, '+ módulo'),
          t.libre !== 0 && h('button', { onclick: () => set(st => { ed.cuadrar(st, t.id); }) }, 'Cuadrar'))))),
      h('button', { class: 'ancho' + (descuadre ? ' fuerte' : ''), onclick: () => { if (confirmar('Se vuelven a repartir los módulos de todas las paredes. ¿Seguro?')) set(st => { autodistribuir(st); return null; }); } }, 'Repartir automático'),
      titulo('Proyecto'),
      h('div', { class: 'fila' },
        h('button', { onclick: () => bajar('cocina.json', 'data:application/json;charset=utf-8,' + encodeURIComponent(app.exportar())) }, 'Guardar archivo'),
        h('button', { onclick: () => $('#abrir').click() }, 'Abrir archivo'),
        h('button', { onclick: () => { if (confirmar('Empezar una cocina nueva. ¿Seguro?')) app.nuevo(); } }, 'Nueva')),
    ];
  }

  function pintarEstilo() {
    const s = app.estado.estilo;
    const altos = s.serieAltos || 'igual';
    return [
      titulo('Frentes'),
      h('div', { class: 'muestras' }, Object.entries(SERIES).map(([k, v]) => muestra(k, v, s.serie === k, id => set(st => { st.estilo.serie = id; })))),
      titulo('Altos y columnas'),
      h('div', { class: 'muestras' },
        h('button', { class: 'muestra' + (altos === 'igual' ? ' on' : ''), onclick: () => set(st => { st.estilo.serieAltos = 'igual'; }) }, h('i', { class: 'igual' }), h('b', {}, 'Igual'), h('small', {}, 'que los bajos')),
        Object.entries(SERIES).filter(([k]) => k !== s.serie).map(([k, v]) => muestra(k, v, altos === k, id => set(st => { st.estilo.serieAltos = id; })))),
      titulo('Tirador'),
      seg(TIRADORES, s.tirador, k => set(st => { st.estilo.tirador = k; })),
      titulo('Encimera'),
      h('div', { class: 'muestras' }, Object.entries(ENCIMERAS).map(([k, v]) => muestra(k, { ...v, tipo: v.textura === 'madera' ? 'madera' : 'x', sub: v.textura === 'marmol' ? 'tipo mármol' : v.textura === 'madera' ? 'roble' : 'compacto' }, s.encimera === k, id => set(st => { st.estilo.encimera = id; })))),
      h('div', { class: 'rejilla' },
        campo('Acabado', seg({ mate: 'Mate', brillo: 'Brillo' }, s.acabadoEncimera, k => set(st => { st.estilo.acabadoEncimera = k; }))),
        campo('Grosor', seg({ normal: '3,8 cm', fina: '2 cm' }, s.grosorEncimera || 'normal', k => set(st => { st.estilo.grosorEncimera = k; })))),
      titulo('Frontal entre encimera y altos'),
      seg(FRONTALES, s.frontal, k => set(st => { st.estilo.frontal = k; })),
      titulo('Zócalo'),
      seg(ZOCALOS, s.zocalo, k => set(st => { st.estilo.zocalo = k; })),
      titulo('Suelo'),
      seg(SUELOS, s.suelo, k => set(st => { st.estilo.suelo = k; })),
      titulo('Paredes'),
      seg(Object.fromEntries(Object.entries(PAREDES).map(([k, v]) => [k, v.nombre])), s.pared, k => set(st => { st.estilo.pared = k; })),
    ];
  }

  function pintarElectro() {
    const s = app.estado.estilo;
    return [
      titulo('Campana'),
      seg(CAMPANAS, s.campana, k => set(st => { st.estilo.campana = k; }), { col: true }),
      h('p', { class: 'nota' }, 'Telescópica e integrada van dentro de un alto; piramidal, plana e inclinada son decorativas con chimenea hasta el techo.'),
      titulo('Placa'), seg(PLACAS, s.placa, k => set(st => { st.estilo.placa = k; })),
      titulo('Horno y microondas'), seg(HORNOS, s.horno, k => set(st => { st.estilo.horno = k; })),
      titulo('Frigorífico'), seg(FRIGOS, s.frigo, k => set(st => { st.estilo.frigo = k; }), { col: true }),
      h('p', { class: 'nota' }, 'Para mover el frigorífico, el fregadero o el horno: tocá el módulo en la cocina y cambiá su uso o movelo con las flechas.'),
    ];
  }

  function pintarLuz() {
    const l = app.estado.luz;
    const hora = h('input', { type: 'range', min: 6, max: 23.5, step: 0.25, value: l.hora });
    const etq = h('b', {}, fmtHora(l.hora));
    hora.addEventListener('input', () => { app.estado.luz.hora = Number(hora.value); etq.textContent = fmtHora(app.estado.luz.hora); app.aplicarLuz(); });
    hora.addEventListener('change', () => app.cambiar(() => { }, { reconstruir: false }));
    return [
      titulo('Hora del día'),
      h('div', { class: 'hora' }, hora, etq),
      h('p', { class: 'nota' }, 'El sol entra por la ventana y cambia de color y ángulo con la hora.'),
      titulo('Luces'),
      h('div', { class: 'rejilla' },
        campo('LED bajo los altos', seg({ si: 'Encendido', no: 'Apagado' }, l.led ? 'si' : 'no', k => app.cambiar(st => { st.luz.led = k === 'si'; }, { reconstruir: true }))),
        campo('Focos del techo', seg({ si: 'Encendidos', no: 'Apagados' }, l.techo ? 'si' : 'no', k => app.cambiar(st => { st.luz.techo = k === 'si'; }, { reconstruir: false })))),
      titulo('Calidad de imagen'),
      seg({ alta: 'Alta (sombras de contacto)', normal: 'Normal' }, app.calidad ? 'alta' : 'normal', k => { app.setCalidad(k === 'alta'); refrescar(); }),
      titulo('Imagen para el cliente'),
      h('button', { class: 'ancho', onclick: () => bajar('cocina.jpg', app.capturar()) }, 'Descargar captura de esta vista'),
    ];
  }

  function pintarInspector() {
    const e = app.estado, sel = app.seleccion, m = moduloEn(e, sel);
    insp.hidden = !m;
    if (!m) return;
    const L = e.tramos[sel.tramo];
    const col = COLUMNAS.has(m.bajo);
    const anchos = h('div', { class: 'seg chico' }, ANCHOS.map(a => h('button', { class: a === m.ancho ? 'on' : '', onclick: () => set(st => { ed.ancho(st, sel, a); }) }, String(a))));
    const sb = h('select', {}, Object.entries(USOS_BAJO).map(([k, v]) => h('option', { value: k, selected: k === m.bajo }, v)));
    sb.addEventListener('change', () => set(st => { ed.bajo(st, sel, sb.value); }));
    const sa = h('select', { disabled: col }, Object.entries(USOS_ALTO).map(([k, v]) => h('option', { value: k, selected: k === m.alto }, v)));
    sa.addEventListener('change', () => set(st => { ed.alto(st, sel, sa.value); }));
    insp.replaceChildren(
      h('header', {}, h('b', {}, `Pared ${sel.tramo} · módulo ${sel.idx + 1} de ${L.length}`), h('button', { class: 'x', onclick: () => app.seleccionar(null), title: 'Cerrar' }, '×')),
      campo('Ancho', h('div', { class: 'fila' }, h('button', { onclick: () => set(st => { ed.ancho(st, sel, m.ancho - 5); }) }, '−5'), num(m.ancho, v => set(st => { ed.ancho(st, sel, v); }), { min: 5, max: 150 }), h('button', { onclick: () => set(st => { ed.ancho(st, sel, m.ancho + 5); }) }, '+5'))),
      anchos,
      campo('Abajo', sb),
      campo('Arriba', sa),
      h('div', { class: 'fila' },
        h('button', { onclick: () => accion('izq'), disabled: sel.idx === 0 }, '◀ Mover'),
        h('button', { onclick: () => accion('der'), disabled: sel.idx === L.length - 1 }, 'Mover ▶')),
      h('div', { class: 'fila' },
        h('button', { onclick: () => accion('duplicar') }, 'Duplicar'),
        h('button', { onclick: () => accion('insertar') }, '+ Al lado'),
        h('button', { class: 'peligro', onclick: () => accion('borrar') }, 'Borrar')),
    );
  }

  function accion(a) {
    const sel = app.seleccion; if (!sel) return;
    if (a === 'izq') app.cambiar(st => ed.mover(st, sel, -1));
    if (a === 'der') app.cambiar(st => ed.mover(st, sel, 1));
    if (a === 'duplicar') app.cambiar(st => ed.duplicar(st, sel));
    if (a === 'insertar') app.cambiar(st => ed.insertar(st, sel, 60));
    if (a === 'borrar') app.cambiar(st => ed.borrar(st, sel));
  }

  function refrescar() {
    const foco = document.activeElement;
    if (foco && cuerpo.contains(foco) && foco.type === 'range') { pintarInspector(); return; }
    const scroll = cuerpo.scrollTop;
    const contenido = { espacio: pintarEspacio, estilo: pintarEstilo, electro: pintarElectro, luz: pintarLuz }[pestana]();
    cuerpo.replaceChildren(...contenido.filter(Boolean));
    cuerpo.scrollTop = scroll;
    document.querySelectorAll('#pestanas button').forEach(b => b.classList.toggle('on', b.dataset.p === pestana));
    pintarInspector();
    const xrDisp = app.xrDisponible || {};
    $('#btnVR').disabled = !xrDisp.vr; $('#btnAR').disabled = !xrDisp.ar;
  }

  document.querySelectorAll('#pestanas button').forEach(b => b.addEventListener('click', () => { pestana = b.dataset.p; document.body.classList.add('panel-abierto'); refrescar(); }));
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => app.vista(b.dataset.vista)));
  $('#btnDeshacer').addEventListener('click', () => app.deshacer());
  $('#btnRehacer').addEventListener('click', () => app.rehacer());
  $('#btnPanel').addEventListener('click', () => document.body.classList.toggle('panel-abierto'));
  $('#abrir').addEventListener('change', async ev => { const f = ev.target.files[0]; if (f) { try { app.importar(await f.text()); } catch { aviso('Ese archivo no es una cocina válida'); } } ev.target.value = ''; });

  return { refrescar, accion };
}

function fmtHora(x) { const hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; }
function bajar(nombre, url) { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove(); }
function confirmar(txt) { return window.confirm(txt); }
export function aviso(txt) { const el = document.getElementById('aviso'); el.textContent = txt; el.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 3500); }
