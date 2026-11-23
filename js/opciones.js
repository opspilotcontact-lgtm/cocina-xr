// Opciones comunes (escritorio y gafas) como datos: grupos de filas que cada interfaz dibuja a su manera.
// VERSIÓN MÍNIMA de prueba para la rama del panel XR: al fusionar se sustituye por la completa.
//   grupos(app) → [{ id, titulo, filas, ambito, seccion? }]   (ver el contrato en xr.js)
import { SERIES, ENCIMERAS, TIRADORES, SUELOS, PAREDES, USOS_BAJO, USOS_ALTO, COLUMNAS, ed, moduloEn } from './modelo.js';
import { estanciaPorId, PINTURAS } from './casa/modelo-casa.js';

const lista = (obj, nombre = v => v) => () => Object.entries(obj).map(([v, x]) => ({ v, label: typeof x === 'string' ? x : nombre(x), muestra: x?.color }));
const etiqueta = (obj, k) => { const x = obj[k]; return typeof x === 'string' ? x : x?.nombre ?? String(k); };

function ciclo(id, label, obj, get, set) {
  return { tipo: 'ciclo', id, label, valor: () => etiqueta(obj, get()), opciones: lista(obj, x => x.nombre), actual: get, set };
}

export function grupos(app) {
  const out = [];
  const st = app.estado, sel = app.seleccion;
  const cambiar = fn => app.cambiar(fn);

  if (sel && (sel.ambito === 'modulo' || (!sel.ambito && sel.tramo != null)) && moduloEn(st, sel)) {
    const m = () => moduloEn(app.estado, app.seleccion) || {};
    out.push({
      id: 'modulo', ambito: 'seleccion', titulo: 'Módulo', filas: [
        { tipo: 'texto', texto: `Pared ${sel.tramo} · módulo ${sel.idx + 1}` },
        { tipo: 'num', id: 'ancho', label: 'Ancho', valor: () => String(m().ancho), unidad: 'cm', min: 5, max: 150, paso: 5, actual: () => m().ancho, set: n => cambiar(e => { ed.ancho(e, app.seleccion, n); }) },
        ciclo('bajo', 'Abajo', USOS_BAJO, () => m().bajo, v => cambiar(e => { ed.bajo(e, app.seleccion, v); })),
        ...(COLUMNAS.has(m().bajo) ? [] : [ciclo('alto', 'Arriba', USOS_ALTO, () => m().alto, v => cambiar(e => { ed.alto(e, app.seleccion, v); }))]),
        { tipo: 'accion', id: 'duplicar', label: 'Duplicar', fn: () => cambiar(e => ed.duplicar(e, app.seleccion)) },
        { tipo: 'accion', id: 'borrar', label: 'Borrar', peligro: true, fn: () => cambiar(e => ed.borrar(e, app.seleccion)) },
      ],
    });
  }

  const est = estanciaPorId(app.casa, app.casaSel?.estancia);
  if (est && !est.cocina) {
    out.push({
      id: 'estancia', ambito: 'estancia', seccion: 'Estancia', titulo: est.nombre, filas: [
        { tipo: 'texto', texto: est.nombre },
        ciclo('suelo', 'Suelo', SUELOS, () => est.suelo, v => app.cambiarCasa(c => { estanciaPorId(c, est.id).suelo = v; return { estancia: est.id }; })),
        ciclo('pintura', 'Pintura', PINTURAS, () => est.pintura, v => app.cambiarCasa(c => { estanciaPorId(c, est.id).pintura = v; return { estancia: est.id }; })),
        { tipo: 'num', id: 'altoEst', label: 'Alto', valor: () => String(est.alto), unidad: 'cm', min: 220, max: 320, paso: 5, actual: () => est.alto, set: n => app.cambiarCasa(c => { estanciaPorId(c, est.id).alto = n; return { estancia: est.id }; }) },
      ],
    });
  }

  if (st) {
    const s = () => app.estado.estilo;
    out.push({
      id: 'estilo', ambito: 'estancia', seccion: 'Acabados', titulo: 'Estilo', filas: [
        { tipo: 'ciclo', id: 'serie', label: 'Frentes', valor: () => `${SERIES[s().serie].nombre} · ${SERIES[s().serie].sub}`, opciones: lista(SERIES, x => x.nombre), actual: () => s().serie, set: v => cambiar(e => { e.estilo.serie = v; }) },
        ciclo('encimera', 'Encimera', ENCIMERAS, () => s().encimera, v => cambiar(e => { e.estilo.encimera = v; })),
        ciclo('tirador', 'Tirador', TIRADORES, () => s().tirador, v => cambiar(e => { e.estilo.tirador = v; })),
        ciclo('suelo', 'Suelo', SUELOS, () => s().suelo, v => cambiar(e => { e.estilo.suelo = v; })),
        ciclo('pared', 'Paredes', PAREDES, () => s().pared, v => cambiar(e => { e.estilo.pared = v; })),
      ],
    });
    const l = () => app.estado.luz;
    out.push({
      id: 'luz', ambito: 'luz', titulo: 'Luz', filas: [
        { tipo: 'num', id: 'hora', label: 'Hora', valor: () => { const h = l().hora; return `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`; }, unidad: '', min: 6, max: 23.5, paso: 0.5, deslizador: true, previsualizar: v => { app.estado.luz.hora = v; app.aplicarLuz?.(); }, actual: () => l().hora, set: n => app.cambiar(e => { e.luz.hora = n; }, { reconstruir: false }) },
        { tipo: 'toggle', id: 'led', label: 'LED bajo altos', actual: () => !!l().led, set: b => cambiar(e => { e.luz.led = b; }) },
        { tipo: 'toggle', id: 'techo', label: 'Focos techo', actual: () => !!l().techo, set: b => app.cambiar(e => { e.luz.techo = b; }, { reconstruir: false }) },
        { tipo: 'accion', id: 'deshacer', label: 'Deshacer', fn: () => app.deshacer() },
        { tipo: 'accion', id: 'rehacer', label: 'Rehacer', fn: () => app.rehacer() },
      ],
    });
  }
  return out;
}
