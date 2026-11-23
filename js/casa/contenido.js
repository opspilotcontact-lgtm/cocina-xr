// Punto de enganche para amueblar estancias que no son la cocina activa.
//
//   contenidoEstancia(tipo, estancia, marco) → { lote, picks?, luces?, mats? } | null
//
// - `marco` es marcoEstancia(estancia) (modelo-casa.js): A y fondo son las medidas LIBRES (cm) y el origen es la
//   esquina interior entre la pared B (izquierda) y la pared A, igual que la cocina. La casa coloca el lote ahí.
// - El lote (geo.js → Lote) va en coordenadas locales de la estancia, en metros: x a lo largo de la pared A,
//   y hacia arriba, z hacia dentro. Los nombres de material son los de materiales.js; si el motor trae
//   materiales propios, que los devuelva en `mats` (se fusionan con los de la casa).
// - `luces` (opcional): [{ x, y, z }] en coords locales; se suman a los focos de la casa (máx. 8 encendidos).
//
// Motor de baño (js/bano.js, otro módulo): construirBano(estado) → { lote, picks, luces }.
// Para engancharlo basta con, en app.js:
//   import { construirBano } from './bano.js';
//   registrarContenido('bano', (est, m) => construirBano({ ...(est.contenido || {}), sala: { A: m.A, fondo: m.fondo, alto: est.alto }, estancia: est }));
import { construirCocina } from '../cocina.js';

const motores = new Map();

export function registrarContenido(tipo, fn) { motores.set(tipo, fn); }
export function hayContenido(tipo) { return motores.has(tipo); }

export function contenidoEstancia(tipo, estancia, marco) {
  const fn = motores.get(tipo);
  if (!fn) return null;
  try { return fn(estancia, marco) || null; } catch (err) { console.warn('contenido de', tipo, 'falló:', err); return null; }
}

// La cocina se construye igual que siempre a partir de su estado (sala.A/fondo ya sincronizados con la estancia).
registrarContenido('cocina', est => (est.cocina ? construirCocina(est.cocina) : null));
