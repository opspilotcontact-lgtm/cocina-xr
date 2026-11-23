// Pruebas puras del modelo de vivienda (sin three ni navegador):  node tools/prueba-casa.mjs
import {
  calcularTabiques, nuevaEstancia, nuevoHueco, rect, casaDesdeCocina, cargarCasa, leerGuardado, validar, PLANTILLAS,
  haciaCocina, desdeCocina, moverBorde, moverVertice, huecosDeBorde, superficies, CLAVE_V1, CLAVE_CASA, marcoEstancia,
  edCasa, cocinaActiva,
} from '../js/casa/modelo-casa.js';
import { estadoInicial, clonar, infoTramos } from '../js/modelo.js';

let fallos = 0, total = 0;
const ok = (cond, txt) => { total++; if (!cond) { fallos++; console.log('  ✗ ' + txt); } else console.log('  ✓ ' + txt); };
const casa = (...est) => ({ version: 2, estancias: est, huecos: [], cocinaActiva: null });
const errores = c => validar(c).filter(v => v.nivel === 'error');

console.log('Tabiques compartidos');
{
  const a = nuevaEstancia('salon', rect(0, 0, 300, 300)), b = nuevaEstancia('dormitorio', rect(300, 0, 600, 300));
  const { tabiques } = calcularTabiques(casa(a, b));
  ok(tabiques.length === 7, `dos estancias pegadas → 7 tabiques (hay ${tabiques.length})`);
  const comp = tabiques.filter(t => t.mas && t.menos);
  ok(comp.length === 1 && comp[0].grosor === 10, 'el compartido sale una vez y mide 10 cm');
  ok(tabiques.filter(t => t.exterior).every(t => t.grosor === 25), 'los exteriores miden 25 cm');
  const ext = tabiques.find(t => t.exterior && t.mas === a.id && Math.abs(t.a[1]) < 1);
  ok(ext && ext.emenos === 20 && ext.emas === 5, 'el exterior crece hacia fuera (5 dentro, 20 fuera)');
}
{
  const a = nuevaEstancia('salon', rect(0, 0, 600, 300));
  const b = nuevaEstancia('dormitorio', rect(0, 300, 300, 600)), c = nuevaEstancia('bano', rect(300, 300, 600, 600));
  const { tabiques, porBorde } = calcularTabiques(casa(a, b, c));
  ok(tabiques.length === 10, `encuentro en T: el borde largo se parte en dos (10 tabiques, hay ${tabiques.length})`);
  ok(porBorde[a.id + ':2'].length === 2, 'el borde inferior del salón tiene dos tramos');
  ok(porBorde[a.id + ':2'].every(s => s.tab.mas && s.tab.menos), 'y cada tramo sabe qué estancia tiene a cada lado');
}

console.log('Huecos');
{
  const a = nuevaEstancia('salon', rect(0, 0, 300, 300)), b = nuevaEstancia('dormitorio', rect(300, 0, 600, 300));
  const c = casa(a, b);
  c.huecos.push(nuevoHueco('abatible', a.id, 1, 100));
  const T = calcularTabiques(c);
  const comp = T.tabiques.find(t => t.mas && t.menos);
  ok(comp.huecos.length === 1, 'una puerta en el tabique compartido aparece una vez');
  const desdeVecino = huecosDeBorde(T, b.id, 3);
  ok(desdeVecino.length === 1 && Math.abs(desdeVecino[0].pos - (300 - 100 - 80)) < 0.01, 'el vecino la ve en su borde, medida desde su lado');
  ok(errores(c).length === 0, 'sin errores');
  c.huecos.push(nuevoHueco('ventana', a.id, 0, 250, { ancho: 120 }));
  ok(errores(c).some(e => /se sale/.test(e.texto)), 'una ventana que se sale del tabique da error');
  c.huecos.pop();
  c.huecos.push(nuevoHueco('abatible', a.id, 1, 150));
  ok(errores(c).some(e => /pisa/.test(e.texto)), 'dos huecos que se pisan dan error');
  c.huecos.pop();
  c.huecos.push(nuevoHueco('ventana', a.id, 0, 100, { alto: 200, antepecho: 100 }));
  ok(errores(c).some(e => /techo/.test(e.texto)), 'una ventana más alta que el techo da error');
}
{
  const a = nuevaEstancia('salon', rect(0, 0, 600, 300));
  const b = nuevaEstancia('dormitorio', rect(0, 300, 300, 600)), c = nuevaEstancia('bano', rect(300, 300, 600, 600));
  const k = casa(a, b, c);
  k.huecos.push(nuevoHueco('abatible', a.id, 2, 260));
  ok(errores(k).some(e => /cruza una esquina/.test(e.texto)), 'una puerta que cruza el encuentro en T da error');
}
{
  const a = nuevaEstancia('salon', rect(0, 0, 400, 400)), b = nuevaEstancia('dormitorio', rect(300, 100, 600, 300));
  ok(errores(casa(a, b)).some(e => /solapan/.test(e.texto)), 'dos estancias que se pisan dan error');
  const c = nuevaEstancia('bano', rect(100, 100, 200, 200));
  ok(errores(casa(a, c)).some(e => /solapan/.test(e.texto)), 'una estancia dentro de otra da error');
}

console.log('Migración v1');
{
  const v1 = estadoInicial();
  const copia = clonar(v1);
  const almacen = { getItem: k => (k === CLAVE_V1 ? JSON.stringify(copia) : null) };
  const c = leerGuardado(almacen);
  ok(c.version === 2 && c.estancias.length === 1, 'la cocina v1 pasa a ser una casa de una estancia');
  const k = cocinaActiva(c).cocina;
  ok(k.sala.A === v1.sala.A && k.sala.fondo === v1.sala.fondo && k.sala.B === v1.sala.B, 'las medidas libres se conservan');
  ok(JSON.stringify(k.ventana) === JSON.stringify(v1.ventana), 'la ventana se conserva');
  ok(JSON.stringify(k.tramos) === JSON.stringify(v1.tramos), 'los módulos se conservan');
  ok(c.huecos.length === 1 && c.huecos[0].tipo === 'ventana', 'la ventana pasa a ser un hueco de la casa');
  const almacen2 = { getItem: k2 => (k2 === CLAVE_CASA ? JSON.stringify(c) : k2 === CLAVE_V1 ? '{"version":1}' : null) };
  ok(leerGuardado(almacen2).estancias[0].id === c.estancias[0].id, 'si ya hay casa guardada, manda la casa');
  ok(errores(c).length === 0, 'sin errores');
  ok(cargarCasa({ version: 7 }) === null, 'un archivo raro no se carga');
}

console.log('Cocina ↔ casa');
{
  const c = casaDesdeCocina(estadoInicial());
  const est = c.estancias[0];
  const antes = JSON.stringify(est.cocina);
  haciaCocina(c, est);
  ok(JSON.stringify(est.cocina) === antes, 'sincronizar dos veces no cambia nada');
  est.cocina.sala.A += 50;
  desdeCocina(c, est); haciaCocina(c, est);
  ok(est.cocina.sala.A === 410 && marcoEstancia(est).A === 410, 'ensanchar la pared A en la cocina mueve el tabique');
  est.cocina.ventana.x = 40; est.cocina.ventana.pared = 'D';
  desdeCocina(c, est); haciaCocina(c, est);
  ok(c.huecos.length === 1 && c.huecos[0].borde === 2 && est.cocina.ventana.pared === 'D' && est.cocina.ventana.x === 40, 'mover la ventana a la pared D mueve el hueco');
  est.cocina.ventana.activa = false; desdeCocina(c, est);
  ok(c.huecos.length === 0, 'quitar la ventana quita el hueco');
}

console.log('Plantillas');
for (const [id, p] of Object.entries(PLANTILLAS)) {
  const c = p.crear();
  const e = errores(c);
  const s = superficies(c);
  const av = validar(c).filter(v => v.nivel !== "error");
  ok(av.length === 0, `${p.nombre}: sin avisos${av.length ? " → " + av.map(x => x.texto).join("; ") : ""}`);
  ok(e.length === 0, `${p.nombre}: sin errores${e.length ? ' → ' + e.map(x => x.texto).join('; ') : ''} (${s.construida.toFixed(1)} m² a ejes, ${s.util.toFixed(1)} útiles)`);
  const k = cocinaActiva(c);
  ok(k && infoTramos(k.cocina).every(t => t.libre >= 0), `${p.nombre}: la cocina cabe (${k.cocina.forma}, ${k.cocina.sala.A}×${k.cocina.sala.fondo})`);
  if (id === 'piso2') ok(Math.abs(s.construida - 70) < 6, `${p.nombre}: ronda los 70 m²`);
  if (id === 'piso1') ok(Math.abs(s.construida - 55) < 6, `${p.nombre}: ronda los 55 m²`);
  if (id === 'piso3') ok(Math.abs(s.construida - 90) < 6, `${p.nombre}: ronda los 90 m²`);
}

console.log('Edición de planta');
{
  const c = PLANTILLAS.piso3.crear();
  const pas = c.estancias.find(e => e.tipo === 'pasillo');
  moverBorde(c, pas.id, 0, 20); // el tabique de arriba del pasillo sube 20 cm
  const coc = c.estancias.find(e => e.tipo === 'cocina'), d3 = c.estancias.find(e => e.nombre === 'Dormitorio 3');
  ok(coc.poligono.some(p => p[0] === 360 && p[1] === 290) && d3.poligono.some(p => p[0] === 530 && p[1] === 290), 'mover un tabique arrastra los vértices que tiene encima (también el del encuentro en T)');
  ok(errores(c).length === 0, 'y la casa sigue sin errores');
  moverVertice(c, [530, 820], [530, 840]); // esquina común de salón, dormitorio principal y terraza
  ok(['Salón-comedor', 'Dormitorio principal', 'Terraza'].every(n => c.estancias.find(e => e.nombre === n).poligono.some(p => p[0] === 530 && p[1] === 840)), 'mover un vértice lo mueve en todas las estancias que lo comparten');
  const n = c.estancias.length;
  const nueva = edCasa.anadirEstancia(c, 'dormitorio');
  ok(c.estancias.length === n + 1 && errores(c).length === 0, 'añadir estancia la pega a la casa sin solapes');
  ok(edCasa.quitarEstancia(c, nueva.id) && c.estancias.length === n, 'y se puede quitar');
  ok(!edCasa.quitarEstancia(c, coc.id), 'la única cocina no se puede quitar');
}

console.log(`\n${total - fallos}/${total} correctas`);
process.exit(fallos ? 1 : 0);
