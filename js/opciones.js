// Catálogo ÚNICO de opciones del configurador. De aquí beben la UI de escritorio/móvil (ui.js) y el panel de las
// gafas (xr.js): si una opción existe, existe en los dos sitios. Sin three ni DOM (se prueba con node: tools/prueba-opciones.mjs).
//
//   grupos(app) → Grupo[]     según lo elegido: lo seleccionado (módulo/pieza) primero, luego la estancia, la casa y la luz
//
//   Grupo = { id, titulo, filas: Fila[], ambito, seccion? }
//     ambito  'seleccion' | 'estancia' | 'casa' | 'luz'  → dónde lo pinta el escritorio (inspector, pestaña Estancia…)
//     seccion subapartado de la pestaña Estancia: cocina 'Distribución' | 'Acabados' | 'Electro' | 'Estancia';
//             baño 'Piezas' | 'Acabados' | 'Estancia'; el resto de estancias solo 'Estancia'
//   Fila =
//    | { tipo:'ciclo',  id, label, valor():string, opciones():[{v,label,muestra?:'#hex'|{tipo:'madera',color}}], actual(), set(v) }
//    | { tipo:'num',    id, label, valor():string, unidad, min, max, paso, actual():number, set(n) }
//    | { tipo:'toggle', id, label, actual():boolean, set(b) }
//    | { tipo:'accion', id, label, fn(), peligro?:boolean }
//    | { tipo:'texto',  texto }
//   Extras opcionales (quien no los entienda los ignora):
//     accion.confirmar  texto para pedir confirmación antes (el escritorio la pide; en las gafas basta con deshacer)
//     texto.nivel       'error' | 'aviso' | 'info'
//     num.deslizador    true → mejor como deslizador; num.previsualizar(n) cambia en vivo SIN guardar ni deshacer
//     set()/fn()        pueden devolver un texto: es un aviso para enseñar al usuario
//
// Todas las mutaciones van por app.cambiar (cocina activa) o app.cambiarCasa (vivienda): deshacer/rehacer funciona en todo.
// Selección (app.seleccion / app.seleccionar): { ambito:'modulo', tramo, idx } | { ambito:'elemento', estancia, id }
// | { ambito:'estancia', estancia }.
import {
  SERIES, ENCIMERAS, TIRADORES, CAMPANAS, PLACAS, HORNOS, FRIGOS, FRONTALES, ZOCALOS, SUELOS, PAREDES, FORMAS,
  USOS_BAJO, USOS_ALTO, COLUMNAS, ANCHOS, autodistribuir as repartirCocina, infoTramos, ed, moduloEn,
} from './modelo.js';
import {
  TIPOS, PINTURAS, HUECOS, PLANTILLAS, CARA, estanciaPorId, calcularTabiques, validar as validarCasa, superficies,
  utilEstancia, edCasa, esRectangulo, bordesDe, moverBorde, huecosDeBorde, cocinaActiva, esPuerta, ajustar, haciaCocina,
} from './casa/modelo-casa.js';
import {
  TIPOS as PIEZAS, ANCHOS_MUEBLE, MONTAJES, FRENTES_MUEBLE, LAVABOS, ESPEJOS, CISTERNAS, COLORES_PLATO, MAMPARAS,
  MAMPARAS_BANERA, ACABADOS_METAL, ROCIADORES, LARGOS_BANERA, PLATO, REVESTIMIENTOS, ALTURAS_ALICATADO, COLORES_AZULEJO,
  SUELOS_BANO, validar as validarBano, autodistribuir as repartirBano, elemento, edBano,
} from './bano-modelo.js';
import { materializarBano } from './casa/bano-estado.js';

// ---------- muestras de color ----------
const MUESTRA_SUELO = { porcelanico: '#cfcdc8', beige: '#d8cdbb', tarima: { tipo: 'madera', color: '#b48a5f' } };
const MUESTRA_METAL = { cromo: '#dcdee0', negro: '#1c1c1d', oro: '#c8a46a' };
const muestraSerie = s => (s.tipo === 'madera' ? { tipo: 'madera', color: s.color } : s.color);
// Mobiliario (home staging) de salón, dormitorios… Lo pinta el motor de js/mobiliario/ (otra rama). Estado:
//   casa.mobiliario     = { estilo, densidad }             lo de toda la vivienda (grupo 'casa-mobiliario')
//   estancia.mobiliario = { activo, estilo?, densidad? }   activo por defecto; sin estilo/densidad → los de la casa
// mobiliarioDe(casa, est) da el efectivo { activo, estilo, densidad }: es lo que debe leer el motor.
export const ESTILOS_MOBILIARIO = { nordico: 'Nórdico', moderno: 'Moderno', industrial: 'Industrial', clasico: 'Clásico' };
export const DENSIDADES = { minimo: 'Lo justo', completo: 'Completo (piso piloto)' };
export const MOBILIARIO_DEFECTO = { estilo: 'nordico', densidad: 'completo' };
export function mobiliarioCasa(casa) {
  const m = casa?.mobiliario || {};
  return {
    estilo: ESTILOS_MOBILIARIO[m.estilo] ? m.estilo : MOBILIARIO_DEFECTO.estilo,
    densidad: DENSIDADES[m.densidad] ? m.densidad : MOBILIARIO_DEFECTO.densidad,
  };
}
export function mobiliarioDe(casa, est) {
  const base = mobiliarioCasa(casa), m = est?.mobiliario || {};
  return {
    activo: m.activo !== false,
    estilo: ESTILOS_MOBILIARIO[m.estilo] ? m.estilo : base.estilo,
    densidad: DENSIDADES[m.densidad] ? m.densidad : base.densidad,
  };
}

// ---------- constructores de filas ----------
const nombreDe = v => (typeof v === 'string' ? v : v.nombre);
const ops = (mapa, muestra) => Object.entries(mapa).map(([v, x]) => ({ v, label: nombreDe(x), ...(muestra ? { muestra: muestra(v, x) } : {}) }));
function ciclo(id, label, opciones, actual, set, extra = {}) {
  const lista = typeof opciones === 'function' ? opciones : () => opciones;
  return {
    tipo: 'ciclo', id, label, opciones: lista, actual, set,
    valor() { const a = actual(); return lista().find(o => o.v === a)?.label ?? (a == null ? '—' : String(a)); },
    ...extra,
  };
}
function num(id, label, actual, set, { min = 0, max = 1000, paso = 1, unidad = 'cm', fmt, ...extra } = {}) {
  return {
    tipo: 'num', id, label, unidad, min, max, paso, actual,
    set: n => set(Math.max(min, Math.min(max, Number(n) || 0))),
    valor: () => (fmt ? fmt(actual()) : `${actual()}${unidad ? ' ' + unidad : ''}`),
    ...extra,
  };
}
const toggle = (id, label, actual, set) => ({ tipo: 'toggle', id, label, actual, set });
const accion = (id, label, fn, extra = {}) => ({ tipo: 'accion', id, label, fn, ...extra });
const texto = (t, nivel) => ({ tipo: 'texto', texto: t, ...(nivel ? { nivel } : {}) });
const m2 = v => v.toFixed(1).replace('.', ',') + ' m²';
export const fmtHora = x => { const hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; };

// ---------- selección normalizada ----------
export function normalizarSeleccion(s) {
  if (!s) return null;
  if (s.ambito === 'modulo') return { ambito: 'modulo', tramo: s.tramo, idx: s.idx };
  if (s.ambito === 'elemento') return { ambito: 'elemento', estancia: s.estancia, id: s.id };
  if (s.ambito === 'estancia') return { ambito: 'estancia', estancia: s.estancia };
  if ('tramo' in s) return { ambito: 'modulo', tramo: s.tramo, idx: s.idx };
  if (s.estancia && s.id) return { ambito: 'elemento', estancia: s.estancia, id: s.id };
  if (s.estancia) return { ambito: 'estancia', estancia: s.estancia };
  return null;
}

// Estancia con la que se trabaja: la elegida en la casa o, si no hay, la cocina activa
export function estanciaElegida(app) {
  return estanciaPorId(app.casa, app.casaSel?.estancia) || cocinaActiva(app.casa) || app.casa.estancias[0] || null;
}

export function grupos(app) {
  const out = [];
  const s = grupoSeleccion(app); if (s) out.push(s);
  const est = estanciaElegida(app);
  if (est) out.push(...gruposEstancia(app, est));
  out.push(...gruposCasa(app));
  out.push(grupoLuz(app));
  return out;
}

// =====================================================================================================
// Casa
// =====================================================================================================
function gruposCasa(app) {
  const casa = app.casa;
  const sup = superficies(casa);
  const est = estanciaElegida(app);
  const out = [
    {
      id: 'casa-resumen', ambito: 'casa', titulo: casa.nombre || 'Vivienda', filas: [
        texto(`${casa.estancias.length} estancia${casa.estancias.length > 1 ? 's' : ''} · ${m2(sup.construida)} a ejes · ${m2(sup.util)} útiles aprox.`),
        accion('plano', 'Editar plano', () => app.vista('plano')),
        accion('general', 'Ver toda la casa', () => app.vista('general')),
      ],
    },
    {
      // el escritorio lo pinta como lista (con m² y botón Entrar); en las gafas basta el ciclo
      id: 'casa-estancias', ambito: 'casa', titulo: 'Estancias', filas: [
        ciclo('estancia', 'Estancia', () => casa.estancias.map(e => ({ v: e.id, label: e.nombre, muestra: (TIPOS[e.tipo] || TIPOS.otro).color })),
          () => est?.id, v => app.seleccionar({ ambito: 'estancia', estancia: v })),
        est && accion('entrar', `Entrar en ${est.nombre}`, () => app.entrar(est.id)),
      ].filter(Boolean),
    },
    {
      id: 'casa-anadir', ambito: 'casa', titulo: 'Añadir estancia',
      filas: [
        ...['dormitorio', 'bano', 'salon', 'cocina', 'terraza', 'lavadero'].map(t => accion('anadir-' + t, TIPOS[t].nombre,
          () => app.cambiarCasa(c => ({ estancia: edCasa.anadirEstancia(c, t).id })))),
        texto('Se añade pegada a la derecha de la vivienda; después se ajusta en el plano.'),
      ],
    },
    grupoMobiliarioCasa(app),
    {
      id: 'casa-plantillas', ambito: 'casa', titulo: 'Empezar de una plantilla',
      filas: Object.entries(PLANTILLAS).map(([k, p]) => accion('plantilla-' + k, `${p.nombre} · ${p.sub}`, () => app.plantilla(k),
        { confirmar: `Cambiar a «${p.nombre}». Se pierde la vivienda actual (se puede deshacer). ¿Seguro?` })),
    },
  ];
  const val = validarCasa(casa);
  if (val.length) out.push({ id: 'casa-revision', ambito: 'casa', titulo: 'Revisión', filas: val.map(v => texto(v.texto, v.nivel)) });
  return out;
}

// =====================================================================================================
// Estancia elegida (común a todas) + su contenido
// =====================================================================================================
function gruposEstancia(app, est) {
  const activa = !!est.cocina && est.id === cocinaActiva(app.casa)?.id;
  const out = [];
  if (activa) out.push(...gruposCocina(app));
  else if (est.cocina) out.push({ id: 'cocina-otra', ambito: 'estancia', seccion: 'Estancia', titulo: 'Cocina', filas: [
    texto('Hay otra cocina en edición. Esta se ve tal cual; para cambiar sus muebles, actívala.'),
    accion('activar', 'Editar esta cocina', () => app.activarCocina(est.id)),
  ] });
  if (est.tipo === 'bano') out.push(...gruposBano(app, est));
  out.push(grupoGeneral(app, est, activa));
  if (est.tipo !== 'cocina' && est.tipo !== 'bano') out.push(grupoMobiliario(app, est));
  out.push(grupoHuecos(app, est));
  return out;
}

const enEstancia = (app, id, fn) => app.cambiarCasa(c => { const e = estanciaPorId(c, id); if (e) fn(e, c); });

function grupoGeneral(app, est, cocinaActivaAqui) {
  const id = est.id;
  const tipoFila = ciclo('tipo', 'Tipo', ops(TIPOS, (k, v) => v.color), () => est.tipo, v => {
    let ok = true;
    app.cambiarCasa(c => { ok = edCasa.cambiarTipo(c, id, v); });
    return ok ? null : 'La única cocina no puede cambiar de tipo';
  });
  const filas = [tipoFila];
  const pol = est.poligono, bordes = bordesDe(pol);
  const rectEje = esRectangulo(pol) && Math.abs(pol[1][1] - pol[0][1]) < 0.5;
  if (!cocinaActivaAqui) {
    if (rectEje) {
      const libre = i => Math.round(bordes[i].largo - 2 * CARA);
      filas.push(
        num('ancho', 'Ancho libre', () => libre(0), v => app.cambiarCasa(c => { moverBorde(c, id, 1, v - libre(0)); }), { min: 60, max: 2000, paso: 5 }),
        num('fondo', 'Fondo libre', () => libre(1), v => app.cambiarCasa(c => { moverBorde(c, id, 2, v - libre(1)); }), { min: 60, max: 2000, paso: 5 }),
      );
    } else filas.push(texto('Paredes: ' + bordes.map(b => Math.round(b.largo - 2 * CARA)).join(' · ') + ' cm (la forma se ajusta en el plano).'));
    if (est.tipo !== 'terraza') filas.push(num('alto', 'Alto de techo', () => est.alto, v => enEstancia(app, id, e => { e.alto = v; }), { min: 220, max: 400, paso: 5 }));
    // el baño elige su suelo y su pintura en Acabados (son los suyos)
    if (est.tipo !== 'bano') {
      filas.push(ciclo('suelo', 'Suelo', ops(SUELOS, k => MUESTRA_SUELO[k]), () => est.suelo, v => enEstancia(app, id, e => { e.suelo = v; })));
      if (est.tipo !== 'terraza') filas.push(ciclo('pintura', 'Pintura', ops(PINTURAS, (k, v) => v.color), () => est.pintura, v => enEstancia(app, id, e => { e.pintura = v; })));
    }
  }
  // pared de referencia (A) de la cocina y del baño: desde ella se cuentan las paredes y se reparten los muebles
  if ((est.cocina || est.tipo === 'bano') && esRectangulo(pol)) {
    const k = ((est.paredA || 0) % bordes.length + bordes.length) % bordes.length;
    filas.push(ciclo('referencia', est.cocina ? 'Pared principal (A) de los muebles' : 'Pared de referencia (A)',
      bordes.map(b => ({ v: b.i, label: `Pared ${b.i + 1} · ${Math.round(b.largo - 2 * CARA)} cm` })), () => k,
      v => app.cambiarCasa(c => {
        const e = estanciaPorId(c, id); if (!e || e.paredA === v) return;
        e.paredA = v;
        if (e.cocina) { haciaCocina(c, e); repartirCocina(e.cocina); }
        if (e.tipo === 'bano') repartirBano(materializarBano(c, e));
      })));
  }
  filas.push(
    texto(`${m2(utilEstancia(est))} útiles aprox.`),
    accion('entrar', 'Entrar', () => app.entrar(id)),
    accion('ver-plano', 'Ver en el plano', () => { app.seleccionarCasa({ estancia: id }); app.vista('plano'); }),
    accion('quitar', 'Quitar estancia', () => {
      let ok = true;
      app.cambiarCasa(c => { ok = edCasa.quitarEstancia(c, id); return ok ? { estancia: null } : undefined; });
      return ok ? null : 'La única cocina no se puede quitar';
    }, { peligro: true, confirmar: `Quitar «${est.nombre}». ¿Seguro?` }),
  );
  return { id: 'estancia', ambito: 'estancia', seccion: 'Estancia', titulo: est.nombre, filas };
}

// Mobiliario de toda la vivienda: estilo y cantidad por defecto de cada estancia amueblada (casa.mobiliario)
function grupoMobiliarioCasa(app) {
  const mc = mobiliarioCasa(app.casa);
  const fijar = cambios => app.cambiarCasa(c => { c.mobiliario = { ...mobiliarioCasa(c), ...cambios }; });
  return {
    id: 'casa-mobiliario', ambito: 'casa', titulo: 'Mobiliario', filas: [
      ciclo('mob-estilo', 'Estilo', ops(ESTILOS_MOBILIARIO), () => mc.estilo, v => fijar({ estilo: v })),
      ciclo('mob-densidad', 'Cantidad de muebles', ops(DENSIDADES), () => mc.densidad, v => fijar({ densidad: v })),
      texto('Salón, dormitorios y demás estancias se amueblan con este estilo; cada una puede cambiarlo en su pestaña.'),
    ],
  };
}

// Amueblado de salón, dormitorios, pasillo, terraza… (lo pinta el motor de mobiliario: ver mobiliarioDe)
function grupoMobiliario(app, est) {
  const id = est.id, mob = mobiliarioDe(app.casa, est), propio = est.mobiliario || {}, mc = mobiliarioCasa(app.casa);
  // 'casa' = heredar de la vivienda (se borra el campo propio)
  const fijar = (campo, v) => enEstancia(app, id, e => {
    const m = { ...(e.mobiliario || {}) };
    if (v === 'casa') delete m[campo]; else m[campo] = v;
    e.mobiliario = m;
  });
  const filas = [toggle('mobiliario', 'Amueblar', () => mob.activo, b => fijar('activo', !!b))];
  if (mob.activo) filas.push(
    ciclo('mob-estilo', 'Estilo', [{ v: 'casa', label: `Como la casa (${ESTILOS_MOBILIARIO[mc.estilo]})` }, ...ops(ESTILOS_MOBILIARIO)],
      () => (ESTILOS_MOBILIARIO[propio.estilo] ? propio.estilo : 'casa'), v => fijar('estilo', v)),
    ciclo('mob-densidad', 'Cantidad de muebles', [{ v: 'casa', label: `Como la casa (${DENSIDADES[mc.densidad]})` }, ...ops(DENSIDADES)],
      () => (DENSIDADES[propio.densidad] ? propio.densidad : 'casa'), v => fijar('densidad', v)),
  );
  return { id: 'estancia-mobiliario', ambito: 'estancia', seccion: 'Estancia', titulo: 'Mobiliario', filas };
}

// Puertas y ventanas que dan a la estancia (estén guardadas en ella o en la vecina)
function grupoHuecos(app, est) {
  const id = est.id, sel = app.casaSel || {};
  const tabs = calcularTabiques(app.casa);
  const bordes = bordesDe(est.poligono);
  const hs = bordes.flatMap(b => huecosDeBorde(tabs, id, b.i).map(q => ({ ...q, borde: b.i })));
  const exterior = i => (tabs.porBorde[id + ':' + i] || []).some(s => s.tab.exterior);
  const filas = [];
  const etiqueta = q => `${HUECOS[q.h.tipo]} ${q.h.ancho}×${q.h.alto} · pared ${q.borde + 1}`;
  if (!hs.length) filas.push(texto('Sin puertas ni ventanas.'));
  else filas.push(ciclo('hueco', 'Hueco', () => hs.map(q => ({ v: q.h.id, label: etiqueta(q) })), () => (hs.some(q => q.h.id === sel.hueco) ? sel.hueco : null),
    v => { const q = hs.find(x => x.h.id === v); app.seleccionarCasa({ estancia: id, borde: q?.borde ?? null, hueco: v }); }));
  const q = hs.find(x => x.h.id === sel.hueco);
  if (q) {
    const hu = q.h, hid = hu.id;
    const edH = fn => app.cambiarCasa(c => { const x = c.huecos.find(y => y.id === hid); if (x) fn(x, c); });
    const puerta = esPuerta(hu);
    filas.push(
      ciclo('hueco-tipo', 'Tipo de hueco', ops(HUECOS), () => hu.tipo, k => edH(x => {
        x.tipo = k;
        if (k === 'ventana' && !x.antepecho) Object.assign(x, { antepecho: 100, alto: 120 });
        if (k !== 'ventana') x.antepecho = 0;
        if (k !== 'ventana' && x.alto < 200) x.alto = k === 'balconera' ? 215 : 210;
      })),
      num('hueco-ancho', 'Ancho', () => hu.ancho, v => edH(x => { x.ancho = v; }), { min: 40, max: 400, paso: 5 }),
      num('hueco-alto', 'Alto', () => hu.alto, v => edH(x => { x.alto = v; }), { min: 40, max: 300, paso: 5 }),
      hu.tipo === 'ventana' && num('hueco-antepecho', 'Antepecho', () => hu.antepecho, v => edH(x => { x.antepecho = v; }), { min: 0, max: 200, paso: 5 }),
      num('hueco-pos', 'Desde la esquina', () => Math.round(hu.pos - CARA), v => edH(x => { x.pos = v + CARA; }), { min: 0, max: 2000, paso: 5 }),
      ciclo('hueco-pared', 'Pared', bordes.map(b => ({ v: b.i, label: `Pared ${b.i + 1} · ${Math.round(b.largo - 2 * CARA)} cm${exterior(b.i) ? ' · fachada' : ''}` })), () => q.borde,
        k => app.cambiarCasa(c => {
          const x = c.huecos.find(y => y.id === hid), b = bordesDe(estanciaPorId(c, id).poligono)[k]; if (!x || !b) return;
          x.estancia = id; x.borde = k; x.ancho = Math.min(x.ancho, Math.max(40, Math.round(b.largo - 2 * CARA - 10)));
          x.pos = ajustar(b.largo / 2 - x.ancho / 2);
          return { estancia: id, borde: k, hueco: hid };
        })),
      puerta && ciclo('hueco-mano', 'Mano', [{ v: 'izquierda', label: 'Izquierda' }, { v: 'derecha', label: 'Derecha' }], () => hu.mano || 'izquierda', k => edH(x => { x.mano = k; })),
      puerta && ciclo('hueco-abre', 'Abre hacia', [{ v: 'dentro', label: 'Dentro' }, { v: 'fuera', label: 'Fuera' }], () => hu.abre || 'dentro', k => edH(x => { x.abre = k; })),
      accion('hueco-quitar', 'Quitar este hueco', () => app.cambiarCasa(c => { edCasa.quitarHueco(c, hid); return { estancia: id }; }), { peligro: true }),
    );
  }
  // nuevo hueco: en la pared del elegido, o en la fachada más larga (ventana) / la pared interior más larga (puerta)
  const paredPara = tipo => {
    if (q) return q.borde;
    if (sel.estancia === id && sel.borde != null && bordes[sel.borde]) return sel.borde;
    const orden = [...bordes].sort((a, b) => b.largo - a.largo);
    const quiere = tipo === 'ventana' ? orden.find(b => exterior(b.i)) : orden.find(b => !exterior(b.i));
    return (quiere || orden[0]).i;
  };
  const anadir = tipo => app.cambiarCasa(c => { const h = edCasa.anadirHueco(c, tipo, id, paredPara(tipo)); return h ? { estancia: id, borde: h.borde, hueco: h.id } : undefined; });
  filas.push(accion('anadir-ventana', 'Añadir ventana', () => anadir('ventana')), accion('anadir-puerta', 'Añadir puerta', () => anadir('abatible')));
  return { id: 'estancia-huecos', ambito: 'estancia', seccion: 'Estancia', titulo: 'Puertas y ventanas', filas: filas.filter(Boolean) };
}

// =====================================================================================================
// Cocina activa (formato v1 en app.estado)
// =====================================================================================================
function gruposCocina(app) {
  const e = app.estado, s = e.estilo;
  const set = fn => app.cambiar(st => { fn(st); });
  const varias = app.casa.estancias.length > 1;
  const medidas = [
    ciclo('forma', 'Forma', ops(FORMAS), () => e.forma, k => app.cambiar(st => { st.forma = k; repartirCocina(st); return null; })),
    num('paredA', e.forma === 'paralelo' ? 'Largo de cada frente' : 'Pared A (frente)', () => e.sala.A, v => set(st => { st.sala.A = v; }), { min: 120, max: 900, paso: 5 }),
    (e.forma === 'L' || e.forma === 'U') && num('paredB', 'Pared B (izquierda)', () => e.sala.B, v => set(st => { st.sala.B = v; }), { min: 120, max: 900, paso: 5 }),
    e.forma === 'U' && num('paredC', 'Pared C (derecha)', () => e.sala.C, v => set(st => { st.sala.C = v; }), { min: 120, max: 900, paso: 5 }),
    e.forma === 'paralelo'
      ? num('pasillo', 'Pasillo', () => e.sala.pasillo, v => set(st => { st.sala.pasillo = v; }), { min: 80, max: 300, paso: 5 })
      : num('fondoSala', 'Fondo de la sala', () => e.sala.fondo, v => set(st => { st.sala.fondo = v; }), { min: 150, max: 900, paso: 5 }),
    num('altoTecho', 'Alto de techo', () => e.sala.alto, v => set(st => { st.sala.alto = v; }), { min: 220, max: 350, paso: 5 }),
    varias && texto('Son medidas libres de la estancia: al cambiarlas se mueven sus tabiques en la vivienda.'),
  ].filter(Boolean);

  const tramos = [];
  const info = infoTramos(e);
  for (const t of info) {
    const estado = t.libre === 0 ? 'cuadra' : t.libre > 0 ? `sobran ${t.libre} cm` : `faltan ${-t.libre} cm`;
    tramos.push(texto(`Pared ${t.id}: ${t.util} cm · ${estado}`, t.libre < 0 ? 'error' : t.libre > 0 ? 'aviso' : null));
    tramos.push(accion('mas-' + t.id, `+ Módulo en pared ${t.id}`, () => app.cambiar(st => ed.anadirAlFinal(st, t.id, Math.min(60, Math.max(15, t.libre || 60))))));
    if (t.libre !== 0) tramos.push(accion('cuadrar-' + t.id, `Cuadrar pared ${t.id}`, () => set(st => { ed.cuadrar(st, t.id); })));
  }
  tramos.push(
    texto('Toca un módulo en el 3D para cambiar su ancho, su uso o moverlo.'),
    accion('repartir', 'Repartir automático', () => app.cambiar(st => { repartirCocina(st); return null; }), { confirmar: 'Se vuelven a repartir los módulos de todas las paredes. ¿Seguro?' }),
    accion('cocina-nueva', 'Empezar la cocina de cero', () => app.nuevo(), { peligro: true, confirmar: 'Empezar una cocina nueva en esta estancia. ¿Seguro?' }),
  );

  const altos = s.serieAltos || 'igual';
  const sub = { madera: 'roble', marmol: 'tipo mármol' };
  return [
    { id: 'cocina-forma', ambito: 'estancia', seccion: 'Distribución', titulo: 'Forma y medidas', filas: medidas },
    { id: 'cocina-tramos', ambito: 'estancia', seccion: 'Distribución', titulo: 'Muebles por pared', filas: tramos },
    {
      id: 'cocina-frentes', ambito: 'estancia', seccion: 'Acabados', titulo: 'Muebles', filas: [
        ciclo('serie', 'Frentes', ops(SERIES, (k, v) => muestraSerie(v)), () => s.serie, k => set(st => { st.estilo.serie = k; })),
        ciclo('serieAltos', 'Altos y columnas', [{ v: 'igual', label: 'Igual que los bajos', muestra: muestraSerie(SERIES[s.serie]) }, ...ops(SERIES, (k, v) => muestraSerie(v)).filter(o => o.v !== s.serie)],
          () => altos, k => set(st => { st.estilo.serieAltos = k; })),
        ciclo('tirador', 'Tirador', ops(TIRADORES), () => s.tirador, k => set(st => { st.estilo.tirador = k; })),
        ciclo('zocalo', 'Zócalo', ops(ZOCALOS), () => s.zocalo, k => set(st => { st.estilo.zocalo = k; })),
      ],
    },
    {
      id: 'cocina-encimera', ambito: 'estancia', seccion: 'Acabados', titulo: 'Encimera y frontal', filas: [
        ciclo('encimera', 'Encimera', Object.entries(ENCIMERAS).map(([k, v]) => ({ v: k, label: v.nombre + (sub[v.textura] ? ` (${sub[v.textura]})` : ''), muestra: v.textura === 'madera' ? { tipo: 'madera', color: v.color } : v.color })),
          () => s.encimera, k => set(st => { st.estilo.encimera = k; })),
        ciclo('acabadoEncimera', 'Acabado', [{ v: 'mate', label: 'Mate' }, { v: 'brillo', label: 'Brillo' }], () => s.acabadoEncimera, k => set(st => { st.estilo.acabadoEncimera = k; })),
        ciclo('grosorEncimera', 'Grosor', [{ v: 'normal', label: '3,8 cm' }, { v: 'fina', label: '2 cm' }], () => s.grosorEncimera || 'normal', k => set(st => { st.estilo.grosorEncimera = k; })),
        ciclo('frontal', 'Frontal entre encimera y altos', ops(FRONTALES), () => s.frontal, k => set(st => { st.estilo.frontal = k; })),
      ],
    },
    {
      id: 'cocina-sala', ambito: 'estancia', seccion: 'Acabados', titulo: 'Suelo y paredes', filas: [
        ciclo('suelo', 'Suelo', ops(SUELOS, k => MUESTRA_SUELO[k]), () => s.suelo, k => set(st => { st.estilo.suelo = k; })),
        ciclo('pared', 'Pintura', ops(PAREDES, (k, v) => v.color), () => s.pared, k => set(st => { st.estilo.pared = k; })),
        toggle('decoracion', 'Decoración (frutero, plantas, taburetes)', () => s.decoracion !== false, b => set(st => { st.estilo.decoracion = !!b; })),
      ],
    },
    {
      id: 'cocina-electro', ambito: 'estancia', seccion: 'Electro', titulo: 'Electrodomésticos', filas: [
        ciclo('campana', 'Campana', ops(CAMPANAS), () => s.campana, k => set(st => { st.estilo.campana = k; })),
        texto('Telescópica e integrada van dentro de un alto; piramidal, plana e inclinada son decorativas con chimenea hasta el techo.'),
        ciclo('placa', 'Placa', ops(PLACAS), () => s.placa, k => set(st => { st.estilo.placa = k; })),
        ciclo('horno', 'Horno y microondas', ops(HORNOS, k => (k === 'negro' ? '#1a1a1b' : '#c9cbcc')), () => s.horno, k => set(st => { st.estilo.horno = k; })),
        ciclo('frigo', 'Frigorífico', ops(FRIGOS), () => s.frigo, k => set(st => { st.estilo.frigo = k; })),
        texto('Para mover el frigorífico, el fregadero o el horno: toca su módulo en la cocina y cambia su uso o su posición.'),
      ],
    },
  ];
}

// =====================================================================================================
// Baño (estado en estancia.contenido)
// =====================================================================================================
// Ejecuta fn(estadoBaño, estancia) dentro de un cambio de la casa. Si fn devuelve una selección, pasa a ser la actual;
// si devuelve un texto, se devuelve como aviso.
function enBano(app, estId, fn) {
  let r = null;
  app.cambiarCasa(c => {
    const est = estanciaPorId(c, estId); if (!est) return undefined;
    r = fn(materializarBano(c, est), est);
    return r && typeof r === 'object' && r.ambito ? r : undefined;
  });
  return typeof r === 'string' ? r : null;
}
const bano = est => (est.contenido?.tipo === 'bano' ? est.contenido : null);

function nombrePared(e, p) {
  const extra = [e.puerta?.pared === p && 'puerta', e.ventana?.activa && e.ventana.pared === p && 'ventana'].filter(Boolean);
  const largo = p === 'A' || p === 'D' ? e.sala.ancho : e.sala.fondo;
  return `Pared ${p} · ${largo} cm${extra.length ? ' · ' + extra.join(' y ') : ''}`;
}
const etiquetaPieza = el => {
  const T = PIEZAS[el.tipo] || el.tipo;
  const med = el.tipo === 'mueble' || el.tipo === 'radiador' ? ` ${el.ancho}` : el.tipo === 'ducha' ? ` ${el.fondo}×${el.ancho}` : el.tipo === 'banera' ? ` ${el.largo}` : '';
  return `${T}${med} · pared ${el.pared}`;
};

function gruposBano(app, est) {
  const e = bano(est);
  if (!e) return [{ id: 'bano', ambito: 'estancia', seccion: 'Piezas', titulo: 'Baño', filas: [texto('Preparando el baño…')] }];
  const id = est.id, st = e.estilo;
  const setE = fn => enBano(app, id, b => { fn(b.estilo, b); });
  const zona = e.elementos.find(q => q.tipo === 'ducha' || q.tipo === 'banera');
  const avisos = validarBano(e);
  const seleccionar = elId => app.seleccionar({ ambito: 'elemento', estancia: id, id: elId });
  const mueble = e.elementos.find(q => q.tipo === 'mueble');
  return [
    {
      id: 'bano-distribucion', ambito: 'estancia', seccion: 'Piezas', titulo: 'Distribución', filas: [
        texto(`${e.sala.ancho} × ${e.sala.fondo} cm, techo a ${e.sala.alto}. Las medidas, la puerta y la ventana son las de la casa (se cambian en Estancia o en el plano).`),
        ciclo('zonaAgua', 'Zona de agua', [{ v: 'ducha', label: 'Plato de ducha' }, { v: 'banera', label: 'Bañera' }], () => zona?.tipo || e.opciones.zonaAgua,
          v => enBano(app, id, b => edBano.zonaAgua(b, v))),
        toggle('bide', 'Bidé', () => e.elementos.some(q => q.tipo === 'bide'), v => enBano(app, id, b => edBano.opcional(b, 'bide', !!v))),
        toggle('radiador', 'Radiador toallero', () => e.elementos.some(q => q.tipo === 'radiador'), v => enBano(app, id, b => edBano.opcional(b, 'radiador', !!v))),
        accion('repartir', 'Repartir de nuevo', () => enBano(app, id, b => {
          const r = repartirBano(b);
          return r.avisos.map(a => a.texto).join(' ') || null;
        }), { confirmar: 'Se vuelven a colocar todas las piezas (se conservan sus acabados). ¿Seguro?' }),
      ],
    },
    {
      id: 'bano-piezas', ambito: 'estancia', seccion: 'Piezas', titulo: 'Piezas', filas: [
        ...e.elementos.map(el => accion('elegir-' + el.id, etiquetaPieza(el), () => seleccionar(el.id))),
        texto('Toca una pieza (aquí o en el 3D) para moverla, cambiarla de pared o elegir su modelo.'),
        ...Object.entries({ mueble: 'lavabo', inodoro: 'inodoro', bide: 'bidé', ducha: 'plato de ducha', banera: 'bañera', radiador: 'radiador' })
          .map(([t, n]) => accion('anadir-' + t, `+ ${n[0].toUpperCase() + n.slice(1)}`, () => enBano(app, id, b => {
            const r = edBano.anadir(b, t); if (!r) return null;
            if (!r.cabe) return 'No hay sitio libre: queda en el centro de la pared más larga, muévela.';
            return { ambito: 'elemento', estancia: id, id: r.id };
          }))),
      ],
    },
    {
      id: 'bano-revision', ambito: 'estancia', seccion: 'Piezas', titulo: 'Revisión',
      filas: avisos.length ? avisos.map(a => texto(a.texto, a.nivel)) : [texto('Todo en orden: medidas de paso y de uso correctas.', 'info')],
    },
    {
      id: 'bano-revestimientos', ambito: 'estancia', seccion: 'Acabados', titulo: 'Revestimientos', filas: [
        ciclo('revestimiento', 'Azulejo', ops(REVESTIMIENTOS), () => st.revestimiento, v => setE(x => { x.revestimiento = v; })),
        ciclo('colorAzulejo', 'Color del azulejo', ops(COLORES_AZULEJO, (k, v) => v.color), () => st.colorAzulejo, v => setE(x => { x.colorAzulejo = v; })),
        ciclo('alturaAlicatado', 'Alicatado', ops(ALTURAS_ALICATADO), () => st.alturaAlicatado, v => setE(x => { x.alturaAlicatado = v; })),
        ciclo('sueloBano', 'Suelo', ops(SUELOS_BANO, (k, v) => (k === 'madera' ? { tipo: 'madera', color: v.color } : v.color)), () => st.suelo, v => setE(x => { x.suelo = v; })),
        ciclo('pinturaBano', 'Pintura (lo no alicatado)', ops(PINTURAS, (k, v) => v.color), () => est.pintura, v => enBano(app, id, (b, es) => { es.pintura = v; b.estilo.pared = v; })),
      ],
    },
    {
      id: 'bano-griferia', ambito: 'estancia', seccion: 'Acabados', titulo: 'Grifería y mueble', filas: [
        ciclo('griferia', 'Grifería', ops(ACABADOS_METAL, k => MUESTRA_METAL[k]), () => st.griferia, v => setE(x => { x.griferia = v; })),
        mueble && ciclo('serieMueble', 'Mueble de lavabo', ops(SERIES, (k, v) => muestraSerie(v)), () => mueble.serie, v => enBano(app, id, b => { for (const q of b.elementos) if (q.tipo === 'mueble') q.serie = v; })),
      ].filter(Boolean),
    },
  ];
}

// Filas de una pieza del baño (inspector)
function filasPieza(app, est, e, el) {
  const id = est.id, elId = el.id;
  const setP = fn => enBano(app, id, b => { const x = elemento(b, elId); if (x) return fn(x, b); return null; });
  const P = (el.pared === 'A' || el.pared === 'D') ? e.sala.ancho : e.sala.fondo;
  const filas = [];
  const c = (cid, label, mapa, campo, extra) => ciclo(cid, label, Array.isArray(mapa) ? mapa : ops(mapa, extra), () => el[campo], v => setP(x => { x[campo] = v; }));
  const nums = arr => arr.map(v => ({ v, label: String(v) }));
  switch (el.tipo) {
    case 'mueble':
      filas.push(
        ciclo('ancho', 'Ancho', nums(ANCHOS_MUEBLE), () => el.ancho, v => setP((x, b) => { edBano.medida(b, elId, 'ancho', v); })),
        c('montaje', 'Montaje', MONTAJES, 'montaje'),
        c('frente', 'Frente', FRENTES_MUEBLE, 'frente'),
        c('lavabo', 'Lavabo', LAVABOS, 'lavabo'),
        el.ancho >= 120 && ciclo('senos', 'Senos', [{ v: 1, label: '1 seno' }, { v: 2, label: '2 senos' }], () => el.senos || 1, v => setP(x => { x.senos = v; })),
        c('espejo', 'Espejo', ESPEJOS, 'espejo'),
        el.espejo !== 'ninguno' && toggle('led', 'Espejo con luz LED', () => !!el.led, v => setP(x => { x.led = !!v; })),
        ciclo('serie', 'Acabado del mueble', ops(SERIES, (k, v) => muestraSerie(v)), () => el.serie, v => setP(x => { x.serie = v; })),
      );
      break;
    case 'inodoro':
      filas.push(
        ciclo('montaje', 'Montaje', ops(MONTAJES), () => el.montaje, v => setP(x => { x.montaje = v; if (v === 'suspendido') x.cisterna = 'empotrada'; })),
        el.montaje === 'suelo' ? c('cisterna', 'Cisterna', CISTERNAS, 'cisterna') : texto('Suspendido: bastidor con cisterna empotrada y pulsador.'),
      );
      break;
    case 'bide':
      filas.push(c('montaje', 'Montaje', MONTAJES, 'montaje'));
      break;
    case 'ducha':
      filas.push(
        num('ancho', 'Largo del plato', () => el.ancho, v => setP((x, b) => { edBano.medida(b, elId, 'ancho', v); }), { min: PLATO.anchoMin, max: Math.min(PLATO.anchoMax, P), paso: 5 }),
        ciclo('fondo', 'Fondo del plato', nums([70, 80, 90]), () => el.fondo, v => setP((x, b) => { edBano.medida(b, elId, 'fondo', v); })),
        ciclo('color', 'Color del plato', ops(COLORES_PLATO, (k, v) => v.color), () => el.color, v => setP(x => { x.color = v; })),
        c('mampara', 'Mampara', MAMPARAS, 'mampara'),
        el.mampara !== 'ninguna' && ciclo('perfil', 'Perfil de la mampara', ops(ACABADOS_METAL, k => MUESTRA_METAL[k]), () => el.perfil, v => setP(x => { x.perfil = v; })),
        c('rociador', 'Grifería', ROCIADORES, 'rociador'),
        ciclo('grifoLado', 'Grifo en el lado', [{ v: 'izq', label: 'Izquierdo' }, { v: 'der', label: 'Derecho' }], () => el.grifoLado || 'izq', v => setP(x => { x.grifoLado = v; })),
        toggle('hornacina', 'Hornacina en la pared', () => !!el.hornacina, v => setP(x => { x.hornacina = !!v; })),
      );
      break;
    case 'banera':
      filas.push(
        ciclo('largo', 'Largo', nums(LARGOS_BANERA), () => el.largo, v => setP((x, b) => { edBano.medida(b, elId, 'largo', v); })),
        c('mampara', 'Mampara', MAMPARAS_BANERA, 'mampara'),
        el.mampara !== 'ninguna' && ciclo('perfil', 'Perfil de la mampara', ops(ACABADOS_METAL, k => MUESTRA_METAL[k]), () => el.perfil, v => setP(x => { x.perfil = v; })),
        ciclo('grifoLado', 'Grifo en el lado', [{ v: 'izq', label: 'Izquierdo' }, { v: 'der', label: 'Derecho' }], () => el.grifoLado || 'izq', v => setP(x => { x.grifoLado = v; })),
      );
      break;
    case 'radiador':
      filas.push(
        ciclo('ancho', 'Ancho', nums([40, 50, 60]), () => el.ancho, v => setP((x, b) => { edBano.medida(b, elId, 'ancho', v); })),
        ciclo('alto', 'Alto', nums([80, 100, 120]), () => el.alto, v => setP(x => { x.alto = v; })),
        ciclo('acabado', 'Acabado', [{ v: 'blanco', label: 'Blanco', muestra: '#f2f2f0' }, { v: 'griferia', label: 'Como la grifería', muestra: MUESTRA_METAL[e.estilo.griferia] }], () => el.acabado || 'blanco', v => setP(x => { x.acabado = v; })),
      );
      break;
  }
  filas.push(
    ciclo('pared', 'Pared', ['A', 'B', 'C', 'D'].map(p => ({ v: p, label: nombrePared(e, p) })), () => el.pared, v => setP((x, b) => edBano.pared(b, elId, v))),
    num('posicion', el.tipo === 'inodoro' || el.tipo === 'bide' ? 'Eje desde la izquierda' : 'Centro desde la izquierda', () => Math.round(el.x),
      v => setP((x, b) => { edBano.posicion(b, elId, v); }), { min: 0, max: P, paso: 5 }),
  );
  for (const a of validarBano(e).filter(a => a.ids?.includes(elId))) filas.push(texto(a.texto, a.nivel));
  filas.push(
    accion('duplicar', 'Duplicar', () => enBano(app, id, b => { const n = edBano.duplicar(b, elId); return n ? { ambito: 'elemento', estancia: id, id: n } : null; })),
    accion('borrar', 'Borrar', () => enBano(app, id, b => { edBano.borrar(b, elId); return { ambito: 'estancia', estancia: id }; }), { peligro: true }),
  );
  return filas.filter(Boolean);
}

// =====================================================================================================
// Selección: módulo de la cocina o pieza del baño
// =====================================================================================================
function grupoSeleccion(app) {
  const sel = app.seleccion;
  if (sel?.ambito === 'modulo') {
    const e = app.estado, m = moduloEn(e, sel); if (!m) return null;
    const L = e.tramos[sel.tramo], col = COLUMNAS.has(m.bajo);
    const setM = fn => app.cambiar(st => fn(st));
    return {
      id: 'modulo', ambito: 'seleccion', titulo: `Pared ${sel.tramo} · módulo ${sel.idx + 1} de ${L.length}`, filas: [
        num('ancho', 'Ancho', () => m.ancho, v => setM(st => { ed.ancho(st, sel, v); }), { min: 5, max: 150, paso: 5 }),
        ciclo('anchoSerie', 'Anchos de serie', ANCHOS.map(a => ({ v: a, label: String(a) })), () => m.ancho, v => setM(st => { ed.ancho(st, sel, v); })),
        ciclo('bajo', 'Abajo', ops(USOS_BAJO), () => m.bajo, v => setM(st => { ed.bajo(st, sel, v); })),
        col ? texto('Es una columna: no lleva mueble alto.') : ciclo('alto', 'Arriba', ops(USOS_ALTO), () => m.alto, v => setM(st => { ed.alto(st, sel, v); })),
        num('posicion', 'Posición en la pared', () => sel.idx + 1, v => app.cambiar(st => {
          let s = sel; const dest = Math.max(0, Math.min(st.tramos[sel.tramo].length - 1, Math.round(v) - 1));
          while (s.idx !== dest) s = ed.mover(st, s, dest > s.idx ? 1 : -1);
          return s;
        }), { min: 1, max: L.length, paso: 1, unidad: '', fmt: n => `${n} de ${L.length}` }),
        accion('duplicar', 'Duplicar', () => app.cambiar(st => ed.duplicar(st, sel))),
        accion('insertar', '+ Al lado', () => app.cambiar(st => ed.insertar(st, sel, 60))),
        accion('borrar', 'Borrar', () => app.cambiar(st => ed.borrar(st, sel)), { peligro: true }),
      ].filter(Boolean),
    };
  }
  if (sel?.ambito === 'elemento') {
    const est = estanciaPorId(app.casa, sel.estancia), e = est && bano(est), el = e && elemento(e, sel.id);
    if (!el) return null;
    return { id: 'elemento', ambito: 'seleccion', titulo: `${PIEZAS[el.tipo] || el.tipo} · ${est.nombre}`, filas: filasPieza(app, est, e, el) };
  }
  return null;
}

// =====================================================================================================
// Luz (de la cocina activa: la hora mueve el sol de toda la casa)
// =====================================================================================================
function grupoLuz(app) {
  const l = app.estado.luz;
  return {
    id: 'luz', ambito: 'luz', titulo: 'Luz', filas: [
      num('hora', 'Hora del día', () => l.hora, v => app.cambiar(st => { st.luz.hora = v; }, { reconstruir: false }), {
        min: 6, max: 23.5, paso: 0.5, unidad: '', fmt: fmtHora, deslizador: true,
        previsualizar: v => { app.estado.luz.hora = v; app.aplicarLuz?.(); },
      }),
      texto('El sol entra por las ventanas y cambia de color y de ángulo con la hora.'),
      toggle('techo', 'Focos del techo', () => !!l.techo, b => app.cambiar(st => { st.luz.techo = !!b; }, { reconstruir: false })),
      toggle('led', 'LED bajo los muebles altos', () => !!l.led, b => app.cambiar(st => { st.luz.led = !!b; })),
    ],
  };
}

// Ejecuta la acción `id` del grupo de la selección (p. ej. 'borrar' con la tecla Supr)
export function accionSeleccion(app, id) {
  const g = grupoSeleccion(app);
  const f = g?.filas.find(x => x.tipo === 'accion' && x.id === id);
  return f ? f.fn() : null;
}
