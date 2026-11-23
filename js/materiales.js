// Materiales PBR por papel («frenteBajo», «encimera»…) a partir del estilo elegido.
import * as THREE from 'three';
import { SERIES, ENCIMERAS, PAREDES } from './modelo.js';
import * as T from './texturas.js';

const cache = new Map();
const una = (clave, fn) => { if (!cache.has(clave)) cache.set(clave, fn()); return cache.get(clave); };

function frente(serieId) {
  const s = SERIES[serieId] || SERIES.cadiz;
  return una('frente:' + serieId, () => {
    if (s.tipo === 'madera') {
      const t = T.madera(s.color, serieId.length * 17 + 3);
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, roughness: 1.15, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 0.08, clearcoatRoughness: 0.6 });
    }
    if (s.brillo) return new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
    return new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 1, roughnessMap: T.ruidoRugosidad(150, 25), sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color(s.color) });
  });
}

function encimera(tipo, acabado) {
  return una(`enc:${tipo}:${acabado}`, () => {
    const d = ENCIMERAS[tipo] || ENCIMERAS.blanco; const brillo = acabado === 'brillo';
    let mapas = {};
    if (d.textura === 'cuarzo') mapas = T.cuarzo(d.color, tipo.length * 7);
    if (d.textura === 'marmol') mapas = T.marmol(3);
    if (d.textura === 'cemento') mapas = T.cemento(d.color);
    if (d.textura === 'madera') mapas = T.madera(d.color, 99, [1.2, 1.2]);
    return new THREE.MeshPhysicalMaterial({
      map: mapas.map || null, color: mapas.map ? 0xffffff : d.color,
      roughness: brillo ? 0.07 : (d.textura === 'madera' ? 0.55 : 0.42),
      roughnessMap: brillo ? null : T.ruidoRugosidad(160, 30),
      normalMap: d.textura === 'madera' ? mapas.normalMap : null, normalScale: new THREE.Vector2(0.2, 0.2),
      clearcoat: brillo ? 0.6 : 0, clearcoatRoughness: 0.03,
    });
  });
}

export function materiales(estilo) {
  const m = {};
  m.frenteBajo = frente(estilo.serie);
  m.frenteAlto = frente(estilo.serieAltos && estilo.serieAltos !== 'igual' ? estilo.serieAltos : estilo.serie);
  m.casco = una('casco', () => new THREE.MeshStandardMaterial({ color: '#efeee9', roughness: 0.55 }));
  m.interior = una('interior', () => new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.7 }));
  m.encimera = encimera(estilo.encimera, estilo.acabadoEncimera);
  m.inox = una('inox', () => new THREE.MeshStandardMaterial({ color: '#c8cacc', metalness: 1, roughness: 1, roughnessMap: T.cepillado() }));
  m.inoxCubeta = una('inoxCubeta', () => new THREE.MeshStandardMaterial({ color: '#7d8083', metalness: 1, roughness: 0.38, side: THREE.BackSide }));
  m.cromo = una('cromo', () => new THREE.MeshStandardMaterial({ color: '#e3e4e6', metalness: 1, roughness: 0.07 }));
  m.negroMetal = una('negroMetal', () => new THREE.MeshStandardMaterial({ color: '#1b1b1c', metalness: 0.6, roughness: 0.45 }));
  m.cristalNegro = una('cristalNegro', () => new THREE.MeshPhysicalMaterial({ color: '#060607', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.6 }));
  m.plasticoNegro = una('plasticoNegro', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55 }));
  m.blancoElectro = una('blancoElectro', () => new THREE.MeshPhysicalMaterial({ color: '#f1f1ef', roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.1 }));
  m.fundicion = una('fundicion', () => new THREE.MeshStandardMaterial({ color: '#101010', roughness: 0.75, metalness: 0.3 }));
  m.placa = una('placa', () => new THREE.MeshPhysicalMaterial({ map: T.texPlaca('induccion'), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }));
  m.pantalla = una('pantalla', () => new THREE.MeshBasicMaterial({ color: '#9fe7ff' }));
  m.aluminio = una('aluminio', () => new THREE.MeshStandardMaterial({ color: '#b9bcbf', metalness: 0.9, roughness: 0.38 }));
  m.gola = una('gola:' + (SERIES[estilo.serie]?.color || ''), () => {
    const oscura = ['segovia', 'zaragoza', 'menorca'].includes(estilo.serie);
    return new THREE.MeshStandardMaterial({ color: oscura ? '#2b2b2c' : '#a7aaad', metalness: oscura ? 0.4 : 0.85, roughness: 0.4 });
  });
  m.tirador = estilo.tirador === 'barraNegra' ? m.negroMetal : una('tiradorInox', () => new THREE.MeshStandardMaterial({ color: '#d4d6d8', metalness: 1, roughness: 0.22 }));
  m.zocalo = estilo.zocalo === 'frente' ? m.frenteBajo : estilo.zocalo === 'negro' ? m.plasticoNegro : m.aluminio;
  m.azulejo = una('azulejo', () => { const t = T.azulejoMetro(); return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.08, normalScale: new THREE.Vector2(0.7, 0.7) }); });
  m.frontal = estilo.frontal === 'encimera' ? m.encimera : m.azulejo;
  m.vidrio = una('vidrio', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, clearcoat: 1 }));
  m.vidrioVitrina = una('vidrioVitrina', () => new THREE.MeshPhysicalMaterial({ color: '#dfe7e4', roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }));
  m.led = una('led', () => new THREE.MeshBasicMaterial({ color: '#fff1d6' }));
  m.downlight = una('downlight', () => new THREE.MeshBasicMaterial({ color: '#fff7ea' }));
  // Sala
  const pared = PAREDES[estilo.pared] || PAREDES.blanco;
  m.pared = una('pared:' + estilo.pared, () => new THREE.MeshStandardMaterial({ color: pared.color, roughness: 1, roughnessMap: T.ruidoRugosidad(235, 12, [0.8, 0.8]) }));
  m.techo = una('techo', () => new THREE.MeshStandardMaterial({ color: '#f4f3f0', roughness: 0.95 }));
  m.suelo = una('suelo:' + estilo.suelo, () => {
    if (estilo.suelo === 'tarima') { const t = T.tarima(); return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.3 }); }
    const t = T.porcelanico(estilo.suelo === 'beige' ? '#d8cdbb' : '#cfcdc8');
    return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 0.9, normalScale: new THREE.Vector2(0.6, 0.6) });
  });
  m.marco = una('marco', () => new THREE.MeshStandardMaterial({ color: '#f3f3f1', roughness: 0.4 }));
  m.alfeizar = una('alfeizar', () => new THREE.MeshPhysicalMaterial({ map: T.cuarzo('#e9e7e2', 4).map, roughness: 0.3 }));
  m.exterior = una('exterior', () => new THREE.MeshBasicMaterial({ map: T.texExterior(), fog: false }));
  return m;
}
