// Enganche del motor de baño (js/bano.js) con la vivienda: cada estancia de tipo «bano» se amuebla sola
// con sus medidas libres y con la puerta y la ventana REALES de la casa (para no poner el inodoro donde barre la puerta).
import { registrarContenido } from './contenido.js';
import { calcularTabiques, huecosDeBorde, marcoEstancia, CARA } from './modelo-casa.js';
import { nuevoBano, autodistribuir } from '../bano-modelo.js';
import { construirBano } from '../bano.js';
import { materialesBano } from '../bano-materiales.js';

// Puerta y ventana de la estancia en la convención del baño (pared A/B/C/D, x desde la izquierda mirando la pared).
function huecosReales(casa, est) {
  const m = marcoEstancia(est);
  const tabs = calcularTabiques(casa);
  let puerta = null, ventana = null;
  for (const L of ['A', 'B', 'C', 'D']) {
    const borde = m.letras[L]; if (borde == null) continue;
    for (const { h, pos } of huecosDeBorde(tabs, est.id, borde)) {
      const x = Math.max(0, Math.round(pos - CARA));
      if (h.tipo === 'ventana' && !ventana) ventana = { activa: true, pared: L, x, ancho: h.ancho, alto: h.alto, antepecho: h.antepecho ?? 100 };
      else if (h.tipo !== 'ventana' && !puerta) puerta = { pared: L, x, ancho: h.ancho, alto: h.alto ?? 203, abre: 'dentro' };
    }
  }
  return { puerta, ventana };
}

export function engancharBano(getCasa) {
  registrarContenido('bano', (est, m) => {
    const casa = getCasa();
    const { puerta, ventana } = casa ? huecosReales(casa, est) : {};
    // El estado propio del baño (si algún día se edita) manda; si no, se reparte solo con las medidas actuales.
    const base = est.contenido?.tipo === 'bano' ? est.contenido : null;
    const e = nuevoBano({
      ancho: Math.round(m.A), fondo: Math.round(m.fondo), alto: est.alto,
      ...(puerta ? { puerta } : {}), ...(ventana ? { ventana } : {}),
      estilo: base?.estilo, opciones: base?.opciones,
    });
    if (base?.elementos?.length && base.sala?.ancho === e.sala.ancho && base.sala?.fondo === e.sala.fondo) e.elementos = base.elementos;
    else autodistribuir(e);
    // la casa ya pone suelo y techo; el baño aporta sanitarios, mueble, mampara y alicatado
    const r = construirBano(e, { suelo: false, revestimientos: true });
    return { lote: r.lote, picks: r.picks, mats: materialesBano(e) };
  });
}
