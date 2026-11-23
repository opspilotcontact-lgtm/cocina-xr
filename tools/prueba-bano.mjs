// Pruebas puras del modelo del baño (sin dependencias): node tools/prueba-bano.mjs
import { nuevoBano, autodistribuir, validar, planta, paredesBano, aPared, medidas, huecosBano, zonasAgua, clonar, primero, MED } from '../js/bano-modelo.js';

let fallos = 0, pruebas = 0;
const ok = (cond, msg) => { pruebas++; if (!cond) { fallos++; console.log('  ✗ ' + msg); } };
const solape = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// Comprobaciones independientes del validador (para no fiarnos solo de él).
function comprobar(e, etiqueta, { bide = false } = {}) {
  const H = planta(e), P = paredesBano(e);
  const W = e.sala.ancho, D = e.sala.fondo;
  const t = tipo => H.filter(q => q.tipo === tipo);
  ok(t('inodoro').length === 1, `${etiqueta}: hay un inodoro`);
  ok(t('mueble').length === 1, `${etiqueta}: hay un mueble de lavabo`);
  ok(t('ducha').length + t('banera').length === 1, `${etiqueta}: hay ducha o bañera`);
  if (bide) ok(t('bide').length === 1, `${etiqueta}: hay bidé`);
  for (const q of H) ok(q.rect.x0 >= -0.5 && q.rect.z0 >= -0.5 && q.rect.x1 <= W + 0.5 && q.rect.z1 <= D + 0.5, `${etiqueta}: ${q.tipo} dentro de la sala`);
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
    const a = H[i].rect, b = H[j].rect;
    ok(!(solape(a.x0, a.x1, b.x0, b.x1) > 0.5 && solape(a.z0, a.z1, b.z0, b.z1) > 0.5), `${etiqueta}: ${H[i].tipo} y ${H[j].tipo} no se solapan`);
  }
  // ≥ 70 libres delante de inodoro, bidé y lavabo
  for (const q of H.filter(q => q.zona)) {
    const p = P[q.pared];
    let libre = (q.pared === 'A' || q.pared === 'D' ? D : W) - q.d;
    for (const o of H) {
      if (o === q) continue;
      const r = aPared(p, o.rect);
      if (solape(r.s0, r.s1, q.zona[0], q.zona[1]) > 2 && r.d1 > q.d + 1) libre = Math.min(libre, r.d0 - q.d);
    }
    ok(libre >= 70, `${etiqueta}: ${q.tipo} con ${Math.round(libre)} cm libres delante (≥ 70)`);
  }
  // eje del inodoro a 35–40 de lo que tenga al lado (o más lejos si no hay nada)
  for (const q of t('inodoro')) {
    const p = P[q.pared];
    let lat = Math.min(q.el.x, p.largo - q.el.x);
    for (const o of H) {
      if (o === q) continue;
      const r = aPared(p, o.rect);
      if (r.d0 >= q.d - 1 || r.d1 <= 1) continue;
      if (r.s1 <= q.el.x) lat = Math.min(lat, q.el.x - r.s1);
      if (r.s0 >= q.el.x) lat = Math.min(lat, r.s0 - q.el.x);
    }
    ok(lat >= 35, `${etiqueta}: eje del inodoro a ${Math.round(lat)} cm (≥ 35)`);
  }
  // nada en el barrido de la puerta
  const pu = e.puerta, pp = P[pu.pared];
  for (const q of H) {
    const r = aPared(pp, q.rect);
    ok(!(solape(r.s0, r.s1, pu.x, pu.x + pu.ancho) > 0.5 && r.d0 < pu.ancho - 0.5), `${etiqueta}: ${q.tipo} fuera del barrido de la puerta`);
  }
  const av = validar(e);
  const errores = av.filter(a => a.nivel === 'error'), avisos = av.filter(a => a.nivel === 'aviso');
  ok(errores.length === 0, `${etiqueta}: sin errores (${errores.map(a => a.texto).join(' | ')})`);
  ok(avisos.length === 0, `${etiqueta}: sin avisos (${avisos.map(a => a.texto).join(' | ')})`);
  return av;
}

function resumen(e) {
  return e.elementos.map(q => {
    const m = medidas(q);
    const med = q.tipo === 'ducha' ? ` ${q.fondo}×${q.ancho}` : q.tipo === 'banera' ? ` ${q.largo}` : q.tipo === 'mueble' ? ` ${q.ancho}` : '';
    return `${q.tipo}${med}@${q.pared}:${Math.round(m.s0)}–${Math.round(m.s1)}`;
  }).join('  ');
}

const salas = [[160, 220], [200, 250], [250, 300]];
for (const [ancho, fondo] of salas) {
  for (const zonaAgua of ['ducha', 'banera']) {
    for (const bide of [false, true]) {
      if (bide && ancho * fondo < 6e4) continue; // el bidé solo en el grande
      const et = `${ancho / 100}×${fondo / 100} ${zonaAgua}${bide ? ' + bidé' : ''}`;
      const e = nuevoBano({ ancho, fondo, opciones: { zonaAgua, bide } });
      const r = autodistribuir(e);
      ok(r.avisos.filter(a => a.nivel !== 'info').length === 0, `${et}: reparto sin avisos (${r.avisos.map(a => a.texto).join(' | ')})`);
      const av = comprobar(e, et, { bide });
      console.log(`${et.padEnd(24)} ${resumen(e)}${av.length ? '\n    · ' + av.map(a => a.texto).join('\n    · ') : ''}`);
    }
  }
}

// Puerta en una pared larga
{
  const e = nuevoBano({ ancho: 200, fondo: 250, puerta: { pared: 'B', x: 150 } });
  comprobar(e, 'puerta en pared larga');
  console.log(`${'puerta en B'.padEnd(24)} ${resumen(e)}`);
}

// Validaciones: deben saltar
{
  const e = nuevoBano({ ancho: 200, fondo: 250 });
  const wc = primero(e, 'inodoro'), mu = primero(e, 'mueble');
  const m = clonar(e); primero(m, 'inodoro').x = 20;
  ok(validar(m).some(a => /eje de el inodoro|se sale/.test(a.texto)), 'inodoro pegado a la pared → aviso de eje o se sale');
  const s = clonar(e); primero(s, 'mueble').x = wc.x; primero(s, 'mueble').pared = wc.pared;
  ok(validar(s).some(a => a.nivel === 'error' && /solapan/.test(a.texto)), 'mueble encima del inodoro → error de solape');
  const f = clonar(e); primero(f, 'ducha').ancho = 210;
  ok(validar(f).some(a => /extraplanos/.test(a.texto)), 'plato de 210 → error de medida');
  const z = clonar(e); z.sala.ancho = 120;
  ok(validar(z).some(a => /libres/.test(a.texto) || /se sale/.test(a.texto)), 'sala estrecha → aviso de espacio delante');
  const p = clonar(e); p.puerta = { ...p.puerta, pared: mu.pared, x: mu.x - 36 - (p.puerta.pared === mu.pared ? 0 : 0) };
  ok(validar(p).some(a => /puerta/.test(a.texto)), 'puerta junto al mueble → aviso de barrido o choque');
  const w = clonar(e); primero(w, 'inodoro').cisterna = 'vista';
  ok(validar(w).some(a => /cisterna vista/.test(a.texto)), 'suspendido con cisterna vista → aviso');
  const b = clonar(e); b.opciones.zonaAgua = 'banera'; b.sala.ancho = 150; b.sala.fondo = 200;
  const rb = autodistribuir(b);
  ok(rb.avisos.some(a => /bañera/.test(a.texto)) && primero(b, 'ducha'), 'bañera que no cabe → plato de ducha y aviso');
  const h = huecosBano(e);
  ok(Object.values(h).flat().some(q => q.tipo === 'puerta') && Object.values(h).flat().some(q => q.tipo === 'hornacina'), 'huecos: puerta y hornacina');
  ok(zonasAgua(e).length >= 2, 'zonas de agua: el plato toca al menos dos paredes');
}

console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones correctas${fallos ? ` · ${fallos} FALLOS` : ''}`);
process.exit(fallos ? 1 : 0);
