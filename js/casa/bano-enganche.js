// Enganche del motor de baño (js/bano.js) con la vivienda: cada estancia de tipo «bano» se amuebla con su estado
// (estancia.contenido, ver bano-estado.js), con sus medidas libres y con la puerta y la ventana REALES de la casa.
// Al construir se materializa el estado: así las piezas tienen ids estables y se pueden elegir y editar.
import { registrarContenido } from './contenido.js';
import { materializarBano } from './bano-estado.js';
import { construirBano } from '../bano.js';
import { materialesBano } from '../bano-materiales.js';

export function engancharBano(getCasa) {
  registrarContenido('bano', est => {
    const e = materializarBano(getCasa(), est);
    // la casa pone el techo; el baño aporta su suelo, sanitarios, mueble, mampara y alicatado
    const r = construirBano(e, { suelo: true, revestimientos: true });
    return { lote: r.lote, picks: r.picks, mats: materialesBano(e) };
  });
}
