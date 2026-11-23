// Estado editable de un baño de la vivienda (sin three: se prueba con node).
//
// El baño guarda su estado de bano-modelo.js en `estancia.contenido` ({ tipo: 'bano', sala, puerta, ventana, estilo,
// opciones, elementos }). La sala (medidas libres y alto), la puerta y la ventana SIEMPRE salen de la casa; lo propio
// del baño (estilo, opciones y piezas) se conserva. Si la estancia cambia de medidas, las piezas se vuelven a repartir
// conservando las opciones de cada una (y su id, para no perder la selección).
import { calcularTabiques, huecosDeBorde, marcoEstancia, CARA } from './modelo-casa.js';
import { nuevoBano, autodistribuir, PAREDES_BANO } from '../bano-modelo.js';

// Puerta y ventana de la estancia en la convención del baño (pared A/B/C/D, x desde la izquierda mirando la pared).
export function huecosReales(casa, est, tabs = calcularTabiques(casa)) {
  const m = marcoEstancia(est);
  let puerta = null, ventana = null;
  for (const L of ['A', 'B', 'C', 'D']) {
    const borde = m.letras[L]; if (borde == null) continue;
    for (const { h, pos } of huecosDeBorde(tabs, est.id, borde)) {
      const x = Math.max(0, Math.round(pos - CARA));
      if (h.tipo === 'ventana' && !ventana) ventana = { activa: true, pared: L, x, ancho: h.ancho, alto: h.alto, antepecho: h.antepecho ?? 100 };
      else if (h.tipo !== 'ventana' && !puerta) {
        // «abre» está guardado respecto a la estancia del hueco; una corredera no barre el suelo
        const propia = h.estancia === est.id;
        const abre = h.tipo === 'corredera' ? 'corredera' : ((h.abre || 'dentro') === 'dentro') === propia ? 'dentro' : 'fuera';
        puerta = { pared: L, x, ancho: h.ancho, alto: h.alto ?? 203, abre };
      }
    }
  }
  return { puerta, ventana };
}

export function banoDe(casa, est) {
  const m = marcoEstancia(est);
  const { puerta, ventana } = casa ? huecosReales(casa, est) : {};
  const base = est.contenido?.tipo === 'bano' ? est.contenido : null;
  const e = nuevoBano({
    ancho: Math.round(m.A), fondo: Math.round(m.fondo), alto: est.alto,
    ...(puerta ? { puerta } : {}), ...(ventana ? { ventana } : {}),
    estilo: { ...(base?.estilo || {}), ...(PAREDES_BANO[est.pintura] ? { pared: est.pintura } : {}) }, opciones: base?.opciones,
  });
  if (base?.elementos) {
    e.elementos = base.elementos;
    if (base.sala?.ancho !== e.sala.ancho || base.sala?.fondo !== e.sala.fondo) autodistribuir(e);
  }
  return e;
}

// Deja el estado del baño en estancia.contenido (lo crea o lo pone al día con la casa) y lo devuelve.
export function materializarBano(casa, est) {
  est.contenido = banoDe(casa, est);
  return est.contenido;
}
