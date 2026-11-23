// Pruebas puras del catálogo de opciones (js/opciones.js) con una app simulada:  node tools/prueba-opciones.mjs
// Comprueba el contrato de cada fila, que cada opción cambia el estado y que deshacer lo deja como estaba.
import { PLANTILLAS, cocinaActiva, sincronizarCocinas, desdeCocina, cargarCasa, estanciaPorId } from '../js/casa/modelo-casa.js';
import { grupos, normalizarSeleccion, mobiliarioDe, ESTILOS_MOBILIARIO, DENSIDADES } from '../js/opciones.js';
import { materializarBano } from '../js/casa/bano-estado.js';
import { validar as validarBano } from '../js/bano-modelo.js';

let fallos = 0, total = 0;
const ok = (cond, txt) => { total++; if (!cond) { fallos++; console.log('  ✗ ' + txt); } };

// App mínima con la misma semántica que js/app.js (instantánea antes de cada cambio, la casa ↔ cocina se sincronizan,
// los baños se materializan al «construir»).
function crearApp(plantilla = 'piso3') {
  let casa = PLANTILLAS[plantilla].crear(), sel = null, casaSel = { estancia: cocinaActiva(casa).id, borde: null, hueco: null };
  const pasado = [];
  const construir = () => { for (const e of casa.estancias) if (e.tipo === 'bano') materializarBano(casa, e); };
  const valida = s => {
    if (!s) return null;
    if (s.ambito === 'modulo') return app.estado?.tramos[s.tramo]?.[s.idx] ? s : null;
    const est = estanciaPorId(casa, s.estancia); if (!est) return null;
    if (s.ambito === 'elemento') return est.contenido?.elementos?.some(q => q.id === s.id) ? s : null;
    return s;
  };
  construir();
  const app = {
    get casa() { return casa; }, get estado() { return cocinaActiva(casa)?.cocina; }, get seleccion() { return sel; }, get casaSel() { return casaSel; },
    cambiar(fn, { reconstruir = true } = {}) {
      pasado.push(JSON.stringify(casa));
      const r = fn(app.estado); if (r !== undefined) sel = normalizarSeleccion(r);
      if (reconstruir) { desdeCocina(casa, cocinaActiva(casa)); sincronizarCocinas(casa); }
      construir(); sel = valida(sel);
    },
    cambiarCasa(fn) {
      pasado.push(JSON.stringify(casa));
      const r = fn(casa);
      if (r && typeof r === 'object' && r.ambito) { sel = normalizarSeleccion(r); if (sel?.estancia) casaSel = { estancia: sel.estancia, borde: null, hueco: null }; }
      else if (r && typeof r === 'object' && 'estancia' in r) casaSel = { borde: null, hueco: null, ...r };
      sincronizarCocinas(casa); construir(); sel = valida(sel);
    },
    deshacer() { if (pasado.length) { casa = cargarCasa(JSON.parse(pasado.pop())); construir(); sel = valida(sel); } },
    get pasos() { return pasado.length; },
    seleccionar(s) { sel = valida(normalizarSeleccion(s)); const e = sel?.ambito === 'modulo' ? cocinaActiva(casa).id : sel?.estancia; if (e) casaSel = { estancia: e, borde: null, hueco: null }; },
    seleccionarCasa(s) { casaSel = { estancia: null, borde: null, hueco: null, ...s }; },
    vista() {}, entrar() {}, plantilla() {}, activarCocina() {}, nuevo() {}, aplicarLuz() {},
  };
  return app;
}
const porNombre = (app, n) => app.casa.estancias.find(e => e.nombre === n);
const fila = (app, gid, fid) => grupos(app).find(g => g.id === gid)?.filas.find(f => f.id === fid);

// ---------- contrato de cada fila ----------
function revisarContrato(app, donde) {
  const gs = grupos(app);
  const ids = new Set();
  for (const g of gs) {
    ok(typeof g.id === 'string' && typeof g.titulo === 'string' && Array.isArray(g.filas), `${donde}: grupo ${g.id} bien formado`);
    ok(!ids.has(g.id), `${donde}: id de grupo único (${g.id})`); ids.add(g.id);
    ok(['casa', 'estancia', 'seleccion', 'luz'].includes(g.ambito), `${donde}: ${g.id} con ámbito`);
    for (const f of g.filas) {
      const q = `${donde} · ${g.id}/${f.id ?? f.tipo}`;
      try {
        if (f.tipo === 'ciclo') {
          const o = f.opciones();
          ok(Array.isArray(o) && o.length > 0 && o.every(x => 'v' in x && typeof x.label === 'string'), `${q}: opciones`);
          ok(typeof f.valor() === 'string' && typeof f.set === 'function', `${q}: valor/set`);
          for (const x of o) if (x.muestra) ok(typeof x.muestra === 'string' ? /^#[0-9a-f]{6}$/i.test(x.muestra) : x.muestra.tipo === 'madera' && /^#/.test(x.muestra.color), `${q}: muestra ${x.v}`);
        } else if (f.tipo === 'num') {
          ok(typeof f.actual() === 'number' && Number.isFinite(f.actual()), `${q}: actual numérico`);
          ok(f.min <= f.max && f.paso > 0 && typeof f.valor() === 'string', `${q}: rango y valor`);
        } else if (f.tipo === 'toggle') ok(typeof f.actual() === 'boolean' && typeof f.set === 'function', `${q}: toggle`);
        else if (f.tipo === 'accion') ok(typeof f.fn === 'function' && typeof f.label === 'string', `${q}: acción`);
        else if (f.tipo === 'texto') ok(typeof f.texto === 'string', `${q}: texto`);
        else ok(false, `${q}: tipo desconocido ${f.tipo}`);
      } catch (err) { ok(false, `${q}: lanza ${err.message}`); }
    }
  }
  return gs;
}

// Cada opción de cada ciclo/toggle/num cambia algo y deshacer lo deja igual
function revisarDeshacer(app, donde, filtro = () => true) {
  let probadas = 0;
  const gs = grupos(app).filter(filtro);
  for (const g of gs) for (const f0 of g.filas) {
    if (!['ciclo', 'toggle', 'num'].includes(f0.tipo)) continue;
    const valores = f0.tipo === 'ciclo' ? f0.opciones().map(o => o.v) : f0.tipo === 'toggle' ? [!f0.actual()] : [f0.actual() + f0.paso, f0.actual() - f0.paso];
    for (const v of valores) {
      const f = grupos(app).find(x => x.id === g.id)?.filas.find(x => x.id === f0.id); if (!f) break;
      if (f.tipo === 'ciclo' && v === f.actual()) continue;
      if (f.tipo === 'num' && (v < f.min || v > f.max)) continue;
      const antes = JSON.stringify(app.casa), pasos = app.pasos;
      try { f.set(v); } catch (err) { ok(false, `${donde} · ${g.id}/${f.id}=${v}: lanza ${err.message}`); continue; }
      if (app.pasos === pasos) continue; // no era un cambio del modelo (p. ej. elegir hueco)
      probadas++;
      app.deshacer();
      ok(JSON.stringify(app.casa) === antes, `${donde} · ${g.id}/${f.id}=${v}: deshacer lo deja igual`);
    }
  }
  return probadas;
}

console.log('Contrato y deshacer en todas las estancias del piso de 3 dormitorios');
{
  const app = crearApp('piso3');
  for (const e of [...app.casa.estancias]) {
    app.seleccionar({ ambito: 'estancia', estancia: e.id });
    revisarContrato(app, e.nombre);
    const n = revisarDeshacer(app, e.nombre, g => g.ambito === 'estancia' || g.ambito === 'luz');
    ok(n > 0, `${e.nombre}: hay opciones que se pueden cambiar (${n})`);
  }
  revisarContrato(app, 'casa');
  const n = revisarDeshacer(app, 'casa', g => g.id === 'casa-mobiliario');
  ok(n === Object.keys(ESTILOS_MOBILIARIO).length - 1 + Object.keys(DENSIDADES).length - 1, `mobiliario de la casa: todas las opciones se deshacen (${n})`);
}

console.log('Baño editable');
{
  const app = crearApp('piso3');
  const bano = porNombre(app, 'Baño');
  ok(bano.contenido?.tipo === 'bano' && bano.contenido.elementos.length >= 3, 'el baño se materializa en estancia.contenido');
  // el baño del piso3 mide 160×300 libres y tiene puerta abatible al pasillo
  ok(bano.contenido.puerta.pared && bano.contenido.sala.ancho === 160, `sala y puerta salen de la casa (${bano.contenido.sala.ancho}×${bano.contenido.sala.fondo})`);
  ok(bano.contenido.puerta.abre !== 'corredera', 'la abatible de la casa barre su arco');
  const puerta = app.casa.huecos.find(h => h.estancia === bano.id && h.tipo === 'abatible');
  app.cambiarCasa(c => { c.huecos.find(h => h.id === puerta.id).tipo = 'corredera'; });
  ok(porNombre(app, 'Baño').contenido.puerta.abre === 'corredera', 'la corredera de la casa no barre el suelo');
  app.deshacer();
  app.seleccionar({ ambito: 'estancia', estancia: bano.id });
  const gs = grupos(app);
  ok(['bano-distribucion', 'bano-piezas', 'bano-revision', 'bano-revestimientos', 'bano-griferia', 'estancia', 'estancia-huecos'].every(id => gs.some(g => g.id === id)), 'grupos del baño');
  // revestimiento
  fila(app, 'bano-revestimientos', 'colorAzulejo').set('verde');
  ok(porNombre(app, 'Baño').contenido.estilo.colorAzulejo === 'verde', 'cambia el color del azulejo');
  // pieza: inodoro
  const ino = porNombre(app, 'Baño').contenido.elementos.find(q => q.tipo === 'inodoro');
  app.seleccionar({ ambito: 'elemento', estancia: bano.id, id: ino.id });
  ok(grupos(app)[0].id === 'elemento', 'la pieza elegida va primero');
  revisarContrato(app, 'inodoro');
  const x0 = ino.x;
  fila(app, 'elemento', 'posicion').set(x0 + 5);
  const ino2 = porNombre(app, 'Baño').contenido.elementos.find(q => q.id === ino.id);
  ok(ino2.x === x0 + 5 || ino2.x < x0 + 5, `mover +5 cm (de ${x0} a ${ino2.x})`);
  fila(app, 'elemento', 'montaje').set('suelo');
  ok(porNombre(app, 'Baño').contenido.elementos.find(q => q.id === ino.id).montaje === 'suelo', 'inodoro al suelo');
  ok(fila(app, 'elemento', 'cisterna'), 'al suelo deja elegir cisterna');
  const nAntes = porNombre(app, 'Baño').contenido.elementos.length;
  fila(app, 'elemento', 'duplicar').fn();
  ok(porNombre(app, 'Baño').contenido.elementos.length === nAntes + 1 && app.seleccion.id !== ino.id, 'duplicar crea otra pieza y la selecciona');
  fila(app, 'elemento', 'borrar').fn();
  ok(porNombre(app, 'Baño').contenido.elementos.length === nAntes && app.seleccion?.ambito === 'estancia', 'borrar la quita y vuelve a la estancia');
  // cambio de pared
  app.seleccionar({ ambito: 'elemento', estancia: bano.id, id: ino.id });
  const paredInicial = porNombre(app, 'Baño').contenido.elementos.find(q => q.id === ino.id).pared;
  const otra = ['A', 'B', 'C', 'D'].find(p => p !== paredInicial);
  fila(app, 'elemento', 'pared').set(otra);
  ok(porNombre(app, 'Baño').contenido.elementos.find(q => q.id === ino.id).pared === otra, 'cambiar de pared');
  app.deshacer();
  ok(porNombre(app, 'Baño').contenido.elementos.find(q => q.id === ino.id).pared === paredInicial, 'deshacer el cambio de pared');
  // todas las opciones de todas las piezas
  for (const el of porNombre(app, 'Baño').contenido.elementos) {
    app.seleccionar({ ambito: 'elemento', estancia: bano.id, id: el.id });
    revisarContrato(app, el.tipo);
    revisarDeshacer(app, el.tipo, g => g.ambito === 'seleccion');
  }
  // ducha ↔ bañera, bidé y radiador
  app.seleccionar({ ambito: 'estancia', estancia: bano.id });
  fila(app, 'bano-distribucion', 'zonaAgua').set('banera');
  ok(porNombre(app, 'Baño').contenido.elementos.some(q => q.tipo === 'banera') && !porNombre(app, 'Baño').contenido.elementos.some(q => q.tipo === 'ducha'), 'ducha → bañera');
  fila(app, 'bano-distribucion', 'bide').set(true);
  ok(porNombre(app, 'Baño').contenido.elementos.some(q => q.tipo === 'bide'), 'añade bidé');
  fila(app, 'bano-distribucion', 'radiador').set(false);
  ok(!porNombre(app, 'Baño').contenido.elementos.some(q => q.tipo === 'radiador'), 'quita el radiador');
  fila(app, 'bano-distribucion', 'repartir').fn();
  ok(validarBano(porNombre(app, 'Baño').contenido).filter(a => a.nivel === 'error').length === 0, 'repartir de nuevo deja el baño sin errores');
  fila(app, 'bano-piezas', 'anadir-radiador').fn();
  ok(app.seleccion?.ambito === 'elemento' && porNombre(app, 'Baño').contenido.elementos.some(q => q.id === app.seleccion.id && q.tipo === 'radiador'), 'añadir pieza la selecciona');
  // el baño sigue a la casa: al agrandarlo se reparte de nuevo conservando opciones
  app.seleccionar({ ambito: 'estancia', estancia: bano.id });
  fila(app, 'bano-griferia', 'griferia').set('negro');
  const ancho = porNombre(app, 'Baño').contenido.sala.ancho;
  fila(app, 'estancia', 'ancho').set(ancho + 20);
  const b2 = porNombre(app, 'Baño').contenido;
  ok(b2.sala.ancho === ancho + 20 && b2.estilo.griferia === 'negro', `al cambiar la medida de la casa, el baño la sigue (${b2.sala.ancho}) y conserva su estilo`);
}

console.log('Salón, huecos y cocina');
{
  const app = crearApp('piso3');
  const salon = porNombre(app, 'Salón-comedor');
  app.seleccionar({ ambito: 'estancia', estancia: salon.id });
  ok(mobiliarioDe(app.casa, salon).activo === true && fila(app, 'estancia-mobiliario', 'mob-estilo').actual() === 'casa', 'amueblada por defecto y con el estilo de la casa');
  fila(app, 'casa-mobiliario', 'mob-estilo').set('clasico');
  ok(app.casa.mobiliario?.estilo === 'clasico' && mobiliarioDe(app.casa, porNombre(app, 'Salón-comedor')).estilo === 'clasico', 'el estilo de la casa lo heredan las estancias');
  fila(app, 'estancia-mobiliario', 'mob-estilo').set('industrial');
  fila(app, 'estancia-mobiliario', 'mob-densidad').set('minimo');
  let mob = mobiliarioDe(app.casa, porNombre(app, 'Salón-comedor'));
  ok(mob.estilo === 'industrial' && mob.densidad === 'minimo' && mob.activo, 'estilo y densidad propios de la estancia');
  ok(mobiliarioDe(app.casa, porNombre(app, 'Dormitorio 1') || app.casa.estancias.find(e => e.tipo === 'dormitorio')).estilo === 'clasico', 'las demás siguen con el de la casa');
  fila(app, 'estancia-mobiliario', 'mob-estilo').set('casa');
  ok(!('estilo' in porNombre(app, 'Salón-comedor').mobiliario) && mobiliarioDe(app.casa, porNombre(app, 'Salón-comedor')).estilo === 'clasico', '«Como la casa» vuelve a heredar');
  fila(app, 'estancia-mobiliario', 'mobiliario').set(false);
  ok(mobiliarioDe(app.casa, porNombre(app, 'Salón-comedor')).activo === false && !fila(app, 'estancia-mobiliario', 'mob-estilo'), 'sin amueblar no ofrece estilo');
  app.deshacer();
  ok(mobiliarioDe(app.casa, porNombre(app, 'Salón-comedor')).activo === true, 'deshacer vuelve a amueblar');
  // hueco
  const fh = fila(app, 'estancia-huecos', 'hueco');
  ok(fh && fh.opciones().length >= 3, `huecos del salón (${fh?.opciones().length})`);
  fh.set(fh.opciones()[0].v);
  ok(fila(app, 'estancia-huecos', 'hueco-ancho'), 'elegido un hueco, sus medidas');
  revisarDeshacer(app, 'hueco', g => g.id === 'estancia-huecos');
  const nH = app.casa.huecos.length;
  fila(app, 'estancia-huecos', 'anadir-ventana').fn();
  ok(app.casa.huecos.length === nH + 1 && app.casaSel.hueco, 'añadir ventana y elegirla');
  // cocina: módulo
  const coc = cocinaActiva(app.casa);
  app.seleccionar({ tramo: 'A', idx: 1 });
  ok(app.seleccion?.ambito === 'modulo' && app.casaSel.estancia === coc.id, '{ tramo, idx } a secas se normaliza a módulo');
  revisarContrato(app, 'módulo');
  const a0 = app.estado.tramos.A[1].ancho;
  fila(app, 'modulo', 'ancho').set(a0 + 5);
  ok(app.estado.tramos.A[1].ancho === a0 + 5, 'ancho del módulo');
  fila(app, 'modulo', 'posicion').set(3);
  ok(app.seleccion.idx === 2, 'mover el módulo a la posición 3 lo sigue seleccionando');
  revisarDeshacer(app, 'módulo', g => g.ambito === 'seleccion');
}

console.log(`\n${total - fallos}/${total} comprobaciones correctas`);
if (fallos) process.exit(1);
