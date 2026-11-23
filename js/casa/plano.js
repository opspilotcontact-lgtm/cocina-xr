// Editor de planta 2D (vista «Plano»): SVG encima del 3D con cotas en cm. Arrastrar vértices y tabiques (ajuste
// a 5 cm), mover huecos por su tabique, añadir/quitar estancias, poner puertas y ventanas. En móvil se puede ver,
// seleccionar y arrastrar con el dedo.
import {
  TIPOS, HUECOS, calcularTabiques, bordesDe, puntoInterior, utilEstancia, cajaCasa, estanciaPorId, moverVertice,
  moverBorde, ajustar, edCasa, esPuerta, validar, superficies, CARA,
} from './modelo-casa.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...hijos) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const h of hijos) if (h != null) e.append(h.nodeType ? h : document.createTextNode(h));
  return e;
};
const html = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
  for (const h of hijos) if (h != null) e.append(h.nodeType ? h : document.createTextNode(h));
  return e;
};

export function montarPlano(app) {
  const cont = document.getElementById('plano');
  const barra = html('div', { class: 'plano-barra' });
  const svg = el('svg', { class: 'plano-svg', preserveAspectRatio: 'xMidYMid meet' });
  const pie = html('div', { class: 'plano-pie' });
  cont.append(barra, svg, pie);
  let abierto = false, caja = null, arrastre = null, escala = 1;

  // ---------- coordenadas ----------
  function aPlano(ev) {
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    const m = svg.getScreenCTM(); if (!m) return [0, 0];
    const q = p.matrixTransform(m.inverse()); return [q.x, q.y];
  }
  function encuadrar() {
    const c = cajaCasa(app.casa), m = 110;
    caja = { x: c.x0 - m, y: c.y0 - m, w: c.x1 - c.x0 + 2 * m, h: c.y1 - c.y0 + 2 * m };
    svg.setAttribute('viewBox', `${caja.x} ${caja.y} ${caja.w} ${caja.h}`);
  }
  function medirEscala() {
    const r = svg.getBoundingClientRect();
    escala = r.width && caja ? Math.max(caja.w / r.width, caja.h / r.height) : 1; // cm por píxel
  }

  // ---------- dibujo ----------
  function pintar() {
    if (!abierto) return;
    medirEscala();
    const casa = app.casa, sel = app.casaSel;
    const tabs = calcularTabiques(casa);
    const px = v => v * escala;
    svg.replaceChildren();
    // rejilla de 1 m
    const g0 = el('g', { class: 'rejilla' });
    for (let x = Math.ceil(caja.x / 100) * 100; x < caja.x + caja.w; x += 100) g0.append(el('line', { x1: x, y1: caja.y, x2: x, y2: caja.y + caja.h }));
    for (let y = Math.ceil(caja.y / 100) * 100; y < caja.y + caja.h; y += 100) g0.append(el('line', { x1: caja.x, y1: y, x2: caja.x + caja.w, y2: y }));
    svg.append(g0);
    // estancias
    for (const e of casa.estancias) {
      const p = el('polygon', { points: e.poligono.map(q => q.join(',')).join(' '), fill: (TIPOS[e.tipo] || TIPOS.otro).color, class: 'est' + (sel.estancia === e.id ? ' sel' : '') });
      p.addEventListener('pointerdown', ev => { ev.stopPropagation(); app.seleccionarCasa({ estancia: e.id }); });
      svg.append(p);
    }
    // tabiques (rellenos con su grosor real)
    for (const t of tabs.tabiques) {
      const q = (p, s) => [p[0] + t.n[0] * s, p[1] + t.n[1] * s];
      const pts = [q(t.a, t.emas), q(t.b, t.emas), q(t.b, -t.emenos), q(t.a, -t.emenos)];
      const w = el('polygon', { points: pts.map(p => p.join(',')).join(' '), class: 'tab' + (t.exterior ? ' ext' : '') });
      svg.append(w);
    }
    // bordes seleccionables (por estancia) + cotas libres
    const gc = el('g', { class: 'cotas' });
    for (const e of casa.estancias) {
      for (const b of bordesDe(e.poligono)) {
        const esSel = sel.estancia === e.id && sel.borde === b.i;
        const hit = el('line', { x1: b.a[0] + b.n[0] * 8, y1: b.a[1] + b.n[1] * 8, x2: b.b[0] + b.n[0] * 8, y2: b.b[1] + b.n[1] * 8, class: 'borde' + (esSel ? ' sel' : ''), 'stroke-width': Math.max(14, px(12)) });
        hit.addEventListener('pointerdown', ev => empezar(ev, { tipo: 'borde', est: e.id, borde: b.i, n: b.n }));
        svg.append(hit);
        // cota: medida libre dentro de la estancia
        const libre = Math.round(b.largo - 2 * CARA);
        const m = [b.a[0] + b.dir[0] * b.largo / 2 + b.n[0] * px(16), b.a[1] + b.dir[1] * b.largo / 2 + b.n[1] * px(16)];
        let ang = Math.atan2(b.dir[1], b.dir[0]) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
        if (b.largo > px(40)) gc.append(el('text', { x: m[0], y: m[1], transform: `rotate(${ang} ${m[0]} ${m[1]})`, 'font-size': px(11), class: esSel ? 'sel' : '' }, String(libre)));
      }
    }
    // huecos
    for (const t of tabs.tabiques) for (const q of t.huecos) {
      const h = q.h, a = [t.a[0] + t.dir[0] * q.s0, t.a[1] + t.dir[1] * q.s0], b = [t.a[0] + t.dir[0] * q.s1, t.a[1] + t.dir[1] * q.s1];
      const off = (p, s) => [p[0] + t.n[0] * s, p[1] + t.n[1] * s];
      const g = el('g', { class: 'hueco ' + h.tipo + (app.casaSel.hueco === h.id ? ' sel' : '') });
      g.append(el('polygon', { points: [off(a, t.emas), off(b, t.emas), off(b, -t.emenos), off(a, -t.emenos)].map(p => p.join(',')).join(' '), class: 'vano' }));
      if (h.tipo === 'abatible') {
        const lado = q.lado, sa = (h.abre === 'fuera' ? -1 : 1) * lado, izq = (h.mano || 'izquierda') === 'izquierda';
        const enA = (lado > 0) === izq, zf = sa > 0 ? t.emas : -t.emenos, w = h.ancho;
        const piv = off(enA ? a : b, zf), cerr = off(enA ? b : a, zf);
        const fin = [piv[0] + t.n[0] * sa * w, piv[1] + t.n[1] * sa * w];
        const v1 = [fin[0] - piv[0], fin[1] - piv[1]], v2 = [cerr[0] - piv[0], cerr[1] - piv[1]];
        const barrido = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0;
        g.append(el('line', { x1: piv[0], y1: piv[1], x2: fin[0], y2: fin[1], class: 'hoja' }));
        g.append(el('path', { d: `M ${fin[0]} ${fin[1]} A ${w} ${w} 0 0 ${barrido} ${cerr[0]} ${cerr[1]}`, class: 'arco' }));
      } else if (h.tipo === 'corredera') {
        const sa = (h.abre === 'fuera' ? -1 : 1) * q.lado, z = sa > 0 ? t.emas + 3 : -t.emenos - 3;
        g.append(el('line', { x1: off(a, z)[0], y1: off(a, z)[1], x2: off(b, z)[0], y2: off(b, z)[1], class: 'hoja' }));
      } else {
        for (const s of [-1, 0, 1]) { const z = s * (t.grosor / 2 - 2) + (t.emas - t.emenos) / 2; g.append(el('line', { x1: off(a, z)[0], y1: off(a, z)[1], x2: off(b, z)[0], y2: off(b, z)[1], class: 'cristal' })); }
      }
      g.addEventListener('pointerdown', ev => empezar(ev, { tipo: 'hueco', id: h.id }));
      svg.append(g);
    }
    svg.append(gc);
    // nombres
    for (const e of casa.estancias) {
      const c = puntoInterior(e.poligono);
      svg.append(el('text', { x: c[0], y: c[1], 'font-size': px(13), class: 'nombre' }, e.nombre));
      svg.append(el('text', { x: c[0], y: c[1] + px(16), 'font-size': px(11), class: 'm2' }, `${utilEstancia(e).toFixed(1).replace('.', ',')} m²`));
    }
    // vértices
    const vistos = new Set();
    for (const e of casa.estancias) for (const p of e.poligono) {
      const k = Math.round(p[0]) + ',' + Math.round(p[1]); if (vistos.has(k)) continue; vistos.add(k);
      const c = el('circle', { cx: p[0], cy: p[1], r: px(6), class: 'vert' });
      c.addEventListener('pointerdown', ev => empezar(ev, { tipo: 'vertice', p: [p[0], p[1]] }));
      svg.append(c);
    }
    pintarBarra(tabs);
  }

  function pintarBarra(tabs) {
    const casa = app.casa, sel = app.casaSel;
    const est = estanciaPorId(casa, sel.estancia);
    const conBorde = est && sel.borde != null;
    const tipo = html('select', { title: 'Tipo de la estancia nueva' }, ...Object.entries(TIPOS).map(([k, v]) => html('option', { value: k }, v.nombre)));
    tipo.value = 'dormitorio';
    const hueco = t => html('button', { disabled: !conBorde, title: conBorde ? '' : 'Toca primero un tabique', onclick: () => app.cambiarCasa(c => { const h = edCasa.anadirHueco(c, t, sel.estancia, sel.borde); return h ? { estancia: sel.estancia, borde: sel.borde, hueco: h.id } : undefined; }) }, '+ ' + HUECOS[t]);
    barra.replaceChildren(
      html('div', { class: 'grupo' }, tipo, html('button', { onclick: () => app.cambiarCasa(c => ({ estancia: edCasa.anadirEstancia(c, tipo.value).id })) }, '+ Estancia')),
      html('div', { class: 'grupo' }, hueco('abatible'), hueco('corredera'), hueco('ventana'), hueco('balconera')),
      html('div', { class: 'grupo' },
        html('button', { disabled: !sel.hueco && !est, class: 'peligro', onclick: quitar }, sel.hueco ? 'Quitar hueco' : 'Quitar estancia'),
        html('button', { onclick: () => { encuadrar(); pintar(); } }, 'Encuadrar'),
        html('button', { class: 'fuerte', onclick: () => app.vista('general') }, 'Ver en 3D')),
    );
    const v = validar(casa, tabs), s = superficies(casa);
    const errores = v.filter(x => x.nivel === 'error');
    pie.replaceChildren(
      html('span', {}, `${casa.estancias.length} estancias · ${s.construida.toFixed(1).replace('.', ',')} m² a ejes · ${s.util.toFixed(1).replace('.', ',')} m² útiles`),
      html('span', { class: errores.length ? 'mal' : 'bien' }, errores.length ? `${errores.length} problema${errores.length > 1 ? 's' : ''}: ${errores[0].texto}` : 'Sin problemas'),
      html('span', { class: 'ayuda' }, 'Arrastra esquinas y tabiques (cada 5 cm) · toca un tabique para poner puertas y ventanas'),
    );
  }

  function quitar() {
    const sel = app.casaSel;
    if (sel.hueco) { app.cambiarCasa(c => { edCasa.quitarHueco(c, sel.hueco); return { estancia: sel.estancia, borde: sel.borde }; }); return; }
    if (!sel.estancia) return;
    const est = estanciaPorId(app.casa, sel.estancia);
    if (!window.confirm(`Quitar «${est.nombre}» y sus puertas y ventanas. ¿Seguro?`)) return;
    let ok = true;
    app.cambiarCasa(c => { ok = edCasa.quitarEstancia(c, sel.estancia); return ok ? { estancia: null } : undefined; });
    if (!ok) aviso('La única cocina no se puede quitar');
  }
  function aviso(t) { document.getElementById('aviso').textContent = t; document.getElementById('aviso').hidden = false; setTimeout(() => { document.getElementById('aviso').hidden = true; }, 3000); }

  // ---------- arrastres ----------
  function empezar(ev, que) {
    ev.stopPropagation(); ev.preventDefault();
    const p = aPlano(ev);
    arrastre = { ...que, inicio: p, aplicado: 0, movido: false };
    if (que.tipo === 'borde') app.seleccionarCasa({ estancia: que.est, borde: que.borde });
    if (que.tipo === 'hueco') {
      const h = app.casa.huecos.find(x => x.id === que.id);
      app.seleccionarCasa({ estancia: h.estancia, borde: h.borde, hueco: h.id });
      const est = estanciaPorId(app.casa, h.estancia), b = bordesDe(est.poligono)[h.borde];
      arrastre.b = b; arrastre.off = (p[0] - b.a[0]) * b.dir[0] + (p[1] - b.a[1]) * b.dir[1] - h.pos;
    }
    if (que.tipo === 'vertice') arrastre.actual = que.p;
    svg.setPointerCapture?.(ev.pointerId);
  }
  svg.addEventListener('pointermove', ev => {
    if (!arrastre) return;
    const p = aPlano(ev), a = arrastre, casa = app.casa;
    const primera = () => { if (!a.movido) { app.instantanea(); a.movido = true; } };
    if (a.tipo === 'vertice') {
      const q = [ajustar(p[0]), ajustar(p[1])];
      if (q[0] === a.actual[0] && q[1] === a.actual[1]) return;
      primera(); moverVertice(casa, a.actual, q); a.actual = q;
    } else if (a.tipo === 'borde') {
      const d = ajustar(-((p[0] - a.inicio[0]) * a.n[0] + (p[1] - a.inicio[1]) * a.n[1]));
      if (d === a.aplicado) return;
      primera(); moverBorde(casa, a.est, a.borde, d - a.aplicado); a.aplicado = d;
    } else if (a.tipo === 'hueco') {
      const h = casa.huecos.find(x => x.id === a.id), b = a.b;
      const pos = Math.max(CARA, Math.min(b.largo - h.ancho - CARA, ajustar((p[0] - b.a[0]) * b.dir[0] + (p[1] - b.a[1]) * b.dir[1] - a.off)));
      if (pos === h.pos) return;
      primera(); h.pos = pos;
    }
    pintar();
  });
  const soltar = () => {
    if (!arrastre) return;
    const movido = arrastre.movido; arrastre = null;
    if (movido) app.cambiarCasa(() => { }, { instantanea: false });
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('pointerdown', () => app.seleccionarCasa({ estancia: null }));
  addEventListener('keydown', ev => {
    if (!abierto || ev.target.closest?.('input,select,textarea')) return;
    if (ev.code === 'Escape') app.vista('general');
    if ((ev.code === 'Delete' || ev.code === 'Backspace') && app.casaSel.hueco) quitar();
  });
  addEventListener('resize', () => { if (abierto) pintar(); });

  return {
    get abierto() { return abierto; },
    abrir() { if (abierto) { pintar(); return; } abierto = true; cont.hidden = false; document.body.classList.add('con-plano'); encuadrar(); pintar(); app.irA?.('casa'); },
    cerrar() { if (!abierto) return; abierto = false; cont.hidden = true; document.body.classList.remove('con-plano'); arrastre = null; },
    refrescar() { if (abierto && !arrastre) pintar(); },
  };
}
