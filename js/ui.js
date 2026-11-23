// Interfaz de escritorio/móvil: panel con pestañas + inspector del módulo seleccionado.
import {
  SERIES, ENCIMERAS, TIRADORES, CAMPANAS, PLACAS, HORNOS, FRIGOS, FRONTALES, ZOCALOS, SUELOS, PAREDES, FORMAS,
  USOS_BAJO, USOS_ALTO, COLUMNAS, ANCHOS, autodistribuir, ajustarAltos, infoTramos, ed, moduloEn,
} from './modelo.js';
import {
  TIPOS, PINTURAS, HUECOS, PLANTILLAS, CARA, estanciaPorId, calcularTabiques, validar, superficies, utilEstancia,
  edCasa, esRectangulo, bordesDe, moverBorde, huecosDeBorde,
} from './casa/modelo-casa.js';

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
  let pestana = app.casa.estancias.length > 1 ? 'casa' : 'estilo';
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
    const varias = app.casa.estancias.length > 1;
    return [
      cabeceraCocina(),
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
      varias && h('p', { class: 'nota' }, 'Son medidas libres de la estancia: al cambiarlas se mueven sus tabiques en la vivienda.'),
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
        h('button', { onclick: () => { if (confirmar('Empezar una cocina nueva en esta estancia. ¿Seguro?')) app.nuevo(); } }, 'Nueva')),
    ];
  }

  // ---------- pestaña Casa ----------
  const setCasa = fn => app.cambiarCasa(fn);
  const texto = (valor, onSet) => { const i = h('input', { type: 'text', value: valor, class: 'texto' }); i.addEventListener('change', () => onSet(i.value.trim() || valor)); return i; };
  const m2 = v => v.toFixed(1).replace('.', ',') + ' m²';

  function pintarCasa() {
    const casa = app.casa, sel = app.casaSel;
    const est = estanciaPorId(casa, sel.estancia);
    const tabs = calcularTabiques(casa);
    const val = validar(casa, tabs);
    const sup = superficies(casa);
    const out = [
      titulo('Vivienda'),
      h('p', { class: 'nota' }, `${casa.estancias.length} estancia${casa.estancias.length > 1 ? 's' : ''} · ${m2(sup.construida)} a ejes · ${m2(sup.util)} útiles aprox.`),
      h('div', { class: 'plantillas' }, Object.entries(PLANTILLAS).map(([k, p]) => h('button', { onclick: () => { if (confirmar(`Cambiar a «${p.nombre}». Se pierde la vivienda actual (se puede deshacer). ¿Seguro?`)) app.plantilla(k); } }, h('b', {}, p.nombre), h('small', {}, p.sub)))),
      h('div', { class: 'fila' }, h('button', { class: 'fuerte', onclick: () => app.vista('plano') }, 'Editar plano'), h('button', { onclick: () => app.vista('general') }, 'Ver toda la casa')),
      titulo('Estancias'),
      h('div', { class: 'estancias' }, casa.estancias.map(e => h('div', { class: 'estancia' + (e.id === sel.estancia ? ' on' : '') },
        h('button', { class: 'nombre', onclick: () => app.seleccionarCasa({ estancia: e.id }) }, h('i', { style: `background:${(TIPOS[e.tipo] || TIPOS.otro).color}` }), h('b', {}, e.nombre), h('small', {}, m2(utilEstancia(e)) + (e.id === casa.cocinaActiva ? ' · en edición' : ''))),
        h('button', { onclick: () => app.entrar(e.id), title: 'Ver la estancia por dentro' }, 'Entrar')))),
    ];
    if (est) out.push(...pintarEstancia(est, tabs));
    else out.push(h('p', { class: 'nota' }, 'Toca una estancia en la lista, en el plano o en el suelo del 3D para editarla.'));
    out.push(
      titulo('Añadir estancia'),
      h('div', { class: 'seg' }, ['dormitorio', 'bano', 'salon', 'cocina', 'terraza', 'lavadero'].map(t => h('button', { onclick: () => setCasa(c => ({ estancia: edCasa.anadirEstancia(c, t).id })) }, TIPOS[t].nombre))),
      h('p', { class: 'nota' }, 'Se añade pegada a la derecha de la vivienda; después se ajusta en el plano.'),
    );
    if (val.length) out.push(titulo('Revisión'), h('ul', { class: 'revision' }, val.map(v => h('li', { class: v.nivel }, v.texto))));
    out.push(
      titulo('Proyecto'),
      h('div', { class: 'fila' },
        h('button', { onclick: () => bajar('vivienda.json', 'data:application/json;charset=utf-8,' + encodeURIComponent(app.exportar())) }, 'Guardar archivo'),
        h('button', { onclick: () => $('#abrir').click() }, 'Abrir archivo')),
    );
    return out;
  }

  function pintarEstancia(est, tabs) {
    const sel = app.casaSel;
    const tipo = h('select', {}, Object.entries(TIPOS).map(([k, v]) => h('option', { value: k, selected: k === est.tipo }, v.nombre)));
    tipo.addEventListener('change', () => { let ok = true; setCasa(c => { ok = edCasa.cambiarTipo(c, est.id, tipo.value); }); if (!ok) aviso('La única cocina no puede cambiar de tipo'); });
    const pol = est.poligono;
    const rectEje = esRectangulo(pol) && Math.abs(pol[1][1] - pol[0][1]) < 0.5;
    const bordes = bordesDe(pol);
    const out = [
      titulo(est.nombre),
      h('div', { class: 'rejilla' },
        campo('Nombre', texto(est.nombre, v => setCasa(c => { estanciaPorId(c, est.id).nombre = v; }))),
        campo('Tipo', tipo)),
      rectEje
        ? h('div', { class: 'rejilla' },
          campo('Ancho libre', num(Math.round(bordes[0].largo - 2 * CARA), v => setCasa(c => { moverBorde(c, est.id, 1, v - (bordes[0].largo - 2 * CARA)); }), { min: 60, max: 2000 })),
          campo('Fondo libre', num(Math.round(bordes[1].largo - 2 * CARA), v => setCasa(c => { moverBorde(c, est.id, 2, v - (bordes[1].largo - 2 * CARA)); }), { min: 60, max: 2000 })))
        : h('p', { class: 'nota' }, 'Paredes: ' + bordes.map(b => Math.round(b.largo - 2 * CARA)).join(' · ') + ' cm (se ajustan en el plano).'),
      est.tipo !== 'terraza' && campo('Alto de techo', num(est.alto, v => setCasa(c => { estanciaPorId(c, est.id).alto = v; }), { min: 220, max: 400 })),
      titulo('Suelo'),
      seg(SUELOS, est.suelo, k => setCasa(c => { estanciaPorId(c, est.id).suelo = k; })),
      est.tipo !== 'terraza' && titulo('Pintura'),
      est.tipo !== 'terraza' && seg(Object.fromEntries(Object.entries(PINTURAS).map(([k, v]) => [k, v.nombre])), est.pintura, k => setCasa(c => { estanciaPorId(c, est.id).pintura = k; })),
    ];
    if (est.cocina) out.push(h('button', { class: 'ancho' + (app.casa.cocinaActiva === est.id ? '' : ' fuerte'), onclick: () => { app.activarCocina(est.id); irA('espacio'); } }, app.casa.cocinaActiva === est.id ? 'Editar los muebles de esta cocina' : 'Editar esta cocina'));
    // huecos de la estancia (estén guardados aquí o en la vecina)
    const hs = bordes.flatMap(b => huecosDeBorde(tabs, est.id, b.i).map(q => ({ ...q, borde: b.i })));
    out.push(titulo('Puertas y ventanas'));
    if (!hs.length) out.push(h('p', { class: 'nota' }, 'Sin huecos. En el plano, toca un tabique y añade una puerta o una ventana.'));
    out.push(h('div', { class: 'estancias' }, hs.map(q => h('div', { class: 'estancia' + (q.h.id === sel.hueco ? ' on' : '') },
      h('button', { class: 'nombre', onclick: () => app.seleccionarCasa({ estancia: est.id, borde: q.borde, hueco: q.h.id }) }, h('b', {}, HUECOS[q.h.tipo]), h('small', {}, `${q.h.ancho} × ${q.h.alto} cm · pared ${q.borde + 1}`))))));
    const hsel = hs.find(q => q.h.id === sel.hueco)?.h;
    if (hsel) out.push(...pintarHueco(hsel));
    out.push(h('div', { class: 'fila' },
      h('button', { onclick: () => app.entrar(est.id) }, 'Entrar'),
      h('button', { onclick: () => app.vista('plano') }, 'Ver en plano'),
      h('button', { class: 'peligro', onclick: () => { if (!confirmar(`Quitar «${est.nombre}». ¿Seguro?`)) return; let ok = true; setCasa(c => { ok = edCasa.quitarEstancia(c, est.id); return ok ? { estancia: null } : undefined; }); if (!ok) aviso('La única cocina no se puede quitar'); } }, 'Quitar')));
    return out;
  }

  function pintarHueco(hu) {
    const ed2 = fn => setCasa(c => { const x = c.huecos.find(y => y.id === hu.id); if (x) fn(x); });
    const puerta = hu.tipo === 'abatible' || hu.tipo === 'corredera';
    return [
      h('div', { class: 'hueco-ed' },
        seg(HUECOS, hu.tipo, k => ed2(x => { x.tipo = k; if (k === 'ventana' && !x.antepecho) Object.assign(x, { antepecho: 100, alto: 120 }); if (k !== 'ventana') x.antepecho = 0; if (k !== 'ventana' && x.alto < 200) x.alto = k === 'balconera' ? 215 : 210; })),
        h('div', { class: 'rejilla' },
          campo('Ancho', num(hu.ancho, v => ed2(x => { x.ancho = v; }), { min: 40, max: 400 })),
          campo('Alto', num(hu.alto, v => ed2(x => { x.alto = v; }), { min: 40, max: 300 })),
          !puerta && hu.tipo === 'ventana' && campo('Antepecho', num(hu.antepecho, v => ed2(x => { x.antepecho = v; }), { min: 0, max: 200 })),
          campo('Desde la esquina', num(Math.round(hu.pos - CARA), v => ed2(x => { x.pos = v + CARA; }), { min: 0, max: 2000 })),
          puerta && campo('Mano', seg({ izquierda: 'Izquierda', derecha: 'Derecha' }, hu.mano || 'izquierda', k => ed2(x => { x.mano = k; }))),
          puerta && campo('Abre hacia', seg({ dentro: 'Dentro', fuera: 'Fuera' }, hu.abre || 'dentro', k => ed2(x => { x.abre = k; })))),
        h('button', { class: 'ancho peligro', onclick: () => setCasa(c => { edCasa.quitarHueco(c, hu.id); return { estancia: app.casaSel.estancia }; }) }, 'Quitar este hueco')),
    ];
  }

  // con varias cocinas en la vivienda, dice cuál se está editando
  function cabeceraCocina() {
    const cs = app.casa.estancias.filter(x => x.cocina);
    if (cs.length < 2) return null;
    return h('div', { class: 'seg cocinas' }, cs.map(c => h('button', { class: c.id === app.casa.cocinaActiva ? 'on' : '', onclick: () => app.activarCocina(c.id) }, c.nombre)));
  }

  function pintarEstilo() {
    const s = app.estado.estilo;
    const altos = s.serieAltos || 'igual';
    return [
      cabeceraCocina(),
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
      cabeceraCocina(),
      titulo('Campana'),
      seg(CAMPANAS, s.campana, k => set(st => { st.estilo.campana = k; }), { col: true }),
      h('p', { class: 'nota' }, 'Telescópica e integrada van dentro de un alto; piramidal, plana e inclinada son decorativas con chimenea hasta el techo.'),
      titulo('Placa'), seg(PLACAS, s.placa, k => set(st => { st.estilo.placa = k; })),
      titulo('Horno y microondas'), seg(HORNOS, s.horno, k => set(st => { st.estilo.horno = k; })),
      titulo('Frigorífico'), seg(FRIGOS, s.frigo, k => set(st => { st.estilo.frigo = k; }), { col: true }),
      h('p', { class: 'nota' }, 'Para mover el frigorífico, el fregadero o el horno: toca el módulo en la cocina y cambia su uso o muévelo con las flechas.'),
    ];
  }

  function pintarLuz() {
    const l = app.estado.luz;
    const hora = h('input', { type: 'range', min: 6, max: 23.5, step: 0.25, value: l.hora });
    const etq = h('b', {}, fmtHora(l.hora));
    hora.addEventListener('input', () => { app.estado.luz.hora = Number(hora.value); etq.textContent = fmtHora(app.estado.luz.hora); app.aplicarLuz(); });
    hora.addEventListener('change', () => app.cambiar(() => { }, { reconstruir: false }));
    return [
      cabeceraCocina(),
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
    const contenido = { casa: pintarCasa, espacio: pintarEspacio, estilo: pintarEstilo, electro: pintarElectro, luz: pintarLuz }[pestana]();
    cuerpo.replaceChildren(...contenido.filter(Boolean));
    cuerpo.scrollTop = scroll;
    document.querySelectorAll('#pestanas button').forEach(b => b.classList.toggle('on', b.dataset.p === pestana));
    pintarInspector();
    const xrDisp = app.xrDisponible || {};
    $('#btnVR').disabled = !xrDisp.vr; $('#btnAR').disabled = !xrDisp.ar;
  }

  function irA(p) { pestana = p; document.body.classList.add('panel-abierto'); refrescar(); }
  app.irA = irA;
  document.querySelectorAll('#pestanas button').forEach(b => b.addEventListener('click', () => irA(b.dataset.p)));
  document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => app.vista(b.dataset.vista)));
  $('#btnDeshacer').addEventListener('click', () => app.deshacer());
  $('#btnRehacer').addEventListener('click', () => app.rehacer());
  $('#btnPanel').addEventListener('click', () => document.body.classList.toggle('panel-abierto'));
  $('#abrir').addEventListener('change', async ev => { const f = ev.target.files[0]; if (f) { try { app.importar(await f.text()); } catch { aviso('Ese archivo no es una vivienda ni una cocina válida'); } } ev.target.value = ''; });

  return { refrescar, accion };
}

function fmtHora(x) { const hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; }
function bajar(nombre, url) { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove(); }
function confirmar(txt) { return window.confirm(txt); }
export function aviso(txt) { const el = document.getElementById('aviso'); el.textContent = txt; el.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 3500); }
