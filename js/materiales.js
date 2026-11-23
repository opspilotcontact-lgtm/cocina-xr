// Materiales PBR por papel («frenteBajo», «encimera»…) a partir del estilo elegido.
// Pensados para verse bien sin postproceso (gafas): cada familia tiene su rugosidad propia para que madera, laca,
// encimera e inox se distingan incluso con luz plana.
import * as THREE from 'three';
import { SERIES, ENCIMERAS, PAREDES } from './modelo.js';
import * as T from './texturas.js';

const cache = new Map();
const una = (clave, fn) => { if (!cache.has(clave)) cache.set(clave, fn()); return cache.get(clave); };

// ---------- Reflejos de la propia sala ----------
// setEnv(tex, caja?) hace que encimeras, inox, cromo y cristales reflejen una textura de entorno propia (p. ej. la de un
// CubeCamera colocado en el centro de la cocina) en vez de scene.environment. Con `caja` ({ min, max, centro }, Vector3 en
// coordenadas de mundo) el reflejo se corrige por paralaje («box projection»): la ventana se refleja donde está.
// setEnv(null) vuelve al entorno de la escena.
const entorno = { tex: null, intensidad: 1 };
const U = { cajaMin: { value: new THREE.Vector3() }, cajaMax: { value: new THREE.Vector3() }, cajaCentro: { value: new THREE.Vector3() }, usarCaja: { value: 0 } };
const reflejan = new Set();

const PARS_CAJA = /* glsl */`
uniform vec3 cajaMin; uniform vec3 cajaMax; uniform vec3 cajaCentro; uniform float usarCaja;
varying vec3 vPosMundo;
vec3 proyectarCaja( vec3 dir ) {
  if ( usarCaja < 0.5 ) return dir;
  vec3 tMax = ( cajaMax - vPosMundo ) / dir;
  vec3 tMin = ( cajaMin - vPosMundo ) / dir;
  vec3 t = max( tMax, tMin );
  float d = min( min( t.x, t.y ), t.z );
  return normalize( vPosMundo + dir * d - cajaCentro );
}
`;
function parcheCaja(shader) {
  Object.assign(shader.uniforms, U);
  shader.vertexShader = 'varying vec3 vPosMundo;\n' + shader.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\n#if defined( USE_ENVMAP ) || defined( USE_SHADOWMAP )\nvPosMundo = worldPosition.xyz;\n#else\nvPosMundo = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#endif');
  shader.fragmentShader = shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',
    PARS_CAJA + THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
      'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
      'reflectVec = proyectarCaja( inverseTransformDirection( reflectVec, viewMatrix ) );'));
}

function aplicarEntorno(mat) {
  const antes = !!mat.envMap;
  mat.envMap = entorno.tex;
  mat.envMapIntensity = (mat.userData.envBase ?? 1) * (entorno.tex ? entorno.intensidad : 1);
  if (antes !== !!entorno.tex) mat.needsUpdate = true;
}
// Marca un material para que use el entorno propio cuando lo haya.
function refleja(mat, envBase = 1) {
  mat.userData.envBase = envBase;
  mat.envMapIntensity = envBase;
  mat.onBeforeCompile = parcheCaja;
  mat.customProgramCacheKey = () => 'cajaEnv';
  reflejan.add(mat);
  if (entorno.tex) aplicarEntorno(mat);
  return mat;
}

export function setEnv(tex, caja = null, intensidad = 1) {
  entorno.tex = tex || null; entorno.intensidad = intensidad;
  if (caja && tex) { U.cajaMin.value.copy(caja.min); U.cajaMax.value.copy(caja.max); U.cajaCentro.value.copy(caja.centro); U.usarCaja.value = 1; }
  else U.usarCaja.value = 0;
  for (const m of reflejan) aplicarEntorno(m);
}

// Intensidad del oscurecimiento de contacto horneado (1 = gafas; con GTAO conviene ~0.5 para no oscurecer dos veces).
export function setContacto(k = 1) { matContacto().opacity = k; }
const matContacto = () => una('contacto', () => new THREE.MeshBasicMaterial({
  map: T.contacto(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
}));

// ---------- Frentes ----------
function frente(serieId) {
  const s = SERIES[serieId] || SERIES.cadiz;
  return una('frente:' + serieId, () => {
    if (s.tipo === 'madera') {
      // madera: mate y con poro; la rugosidad sale de la propia veta (0,68-0,95)
      const t = T.madera(s.color, serieId.length * 17 + 3);
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, roughness: 1.15, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 0.06, clearcoatRoughness: 0.55, specularIntensity: 0.7 });
    }
    // laca brillo: espejo con barniz
    if (s.brillo) return refleja(new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 }));
    // laca mate: rugosidad media (≈0,5) con un sheen suave que la separa de la pintura de la pared en los bordes
    const sheen = new THREE.Color(s.color).lerp(new THREE.Color('#ffffff'), 0.2);
    return new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.88, roughnessMap: T.ruidoRugosidad(150, 25), sheen: 0.25, sheenRoughness: 0.6, sheenColor: sheen, specularIntensity: 0.8 });
  });
}

// ---------- Encimeras ----------
function encimera(tipo, acabado) {
  return una(`enc:${tipo}:${acabado}`, () => {
    const d = ENCIMERAS[tipo] || ENCIMERAS.blanco; const brillo = acabado === 'brillo';
    let mapas = {};
    if (d.textura === 'cuarzo') mapas = T.cuarzo(d.color, tipo.length * 7);
    if (d.textura === 'marmol') mapas = T.marmol(3);
    if (d.textura === 'cemento') mapas = T.cemento(d.color);
    if (d.textura === 'madera') mapas = T.madera(d.color, 99, [1.2, 1.2]);
    const madera = d.textura === 'madera';
    // brillo: pulido espejo (0,05 + barniz); mate: apomazado (≈0,5); madera: aceitada (0,55-0,8 según la veta)
    let roughness, roughnessMap;
    if (brillo) { roughness = madera ? 0.22 : 0.05; roughnessMap = null; }
    else if (madera) { roughness = 0.95; roughnessMap = mapas.roughnessMap; }
    else { roughness = 0.82; roughnessMap = T.ruidoRugosidad(160, 30); }
    return refleja(new THREE.MeshPhysicalMaterial({
      map: mapas.map || null, color: mapas.map ? 0xffffff : d.color,
      roughness, roughnessMap,
      normalMap: madera ? mapas.normalMap : null, normalScale: new THREE.Vector2(0.2, 0.2),
      clearcoat: brillo ? 1 : 0, clearcoatRoughness: 0.03,
    }), brillo ? 1 : 0.8);
  });
}

export function materiales(estilo) {
  const m = {};
  m.frenteBajo = frente(estilo.serie);
  m.frenteAlto = frente(estilo.serieAltos && estilo.serieAltos !== 'igual' ? estilo.serieAltos : estilo.serie);
  m.casco = una('casco', () => new THREE.MeshStandardMaterial({ color: '#efeee9', roughness: 0.55 }));
  m.interior = una('interior', () => new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.7 }));
  m.encimera = encimera(estilo.encimera, estilo.acabadoEncimera);
  // inox cepillado: anisotropía real de MeshPhysicalMaterial (three ≥ 0.153). La tangente sale de las UV (u = largo de la
  // pieza en los frentes), así que las rayas van en horizontal y el brillo se estira en vertical.
  m.inox = una('inox', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#d8dadc', metalness: 1, roughness: 0.85, roughnessMap: T.cepillado(), anisotropy: 0.3, anisotropyRotation: Math.PI / 2 })));
  m.inoxCubeta = una('inoxCubeta', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#9a9da0', metalness: 1, roughness: 0.32, anisotropy: 0.3, side: THREE.BackSide }), 0.8));
  m.cromo = una('cromo', () => refleja(new THREE.MeshStandardMaterial({ color: '#e3e4e6', metalness: 1, roughness: 0.07 })));
  m.negroMetal = una('negroMetal', () => new THREE.MeshStandardMaterial({ color: '#1b1b1c', metalness: 0.6, roughness: 0.45 }));
  m.cristalNegro = una('cristalNegro', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#060607', roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.6 })));
  // canto pulido del cristal (verdoso, como el vidrio real visto de lado)
  m.cantoCristal = una('cantoCristal', () => new THREE.MeshPhysicalMaterial({ color: '#4d5f58', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }));
  m.plasticoNegro = una('plasticoNegro', () => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55 }));
  m.blancoElectro = una('blancoElectro', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#f1f1ef', roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.1 }), 0.8));
  m.fundicion = una('fundicion', () => new THREE.MeshStandardMaterial({ color: '#101010', roughness: 0.75, metalness: 0.3 }));
  m.placa = una('placa', () => refleja(new THREE.MeshPhysicalMaterial({ map: T.texPlaca('induccion'), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 })));
  m.pantalla = una('pantalla', () => new THREE.MeshBasicMaterial({ color: '#9fe7ff' }));
  m.aluminio = una('aluminio', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#b9bcbf', metalness: 0.9, roughness: 0.38, anisotropy: 0.4, anisotropyRotation: Math.PI / 2 }), 0.8));
  m.gola = una('gola:' + (SERIES[estilo.serie]?.color || ''), () => {
    const oscura = ['segovia', 'zaragoza', 'menorca'].includes(estilo.serie);
    return new THREE.MeshStandardMaterial({ color: oscura ? '#2b2b2c' : '#a7aaad', metalness: oscura ? 0.4 : 0.85, roughness: 0.4 });
  });
  m.tirador = estilo.tirador === 'barraNegra' ? m.negroMetal : una('tiradorInox', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#d4d6d8', metalness: 1, roughness: 0.24, anisotropy: 0.6 })));
  m.zocalo = estilo.zocalo === 'frente' ? m.frenteBajo : estilo.zocalo === 'negro' ? m.plasticoNegro : m.aluminio;
  m.azulejo = una('azulejo', () => { const t = T.azulejoMetro(); return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.08, normalScale: new THREE.Vector2(0.7, 0.7) }); });
  m.frontal = estilo.frontal === 'encimera' ? m.encimera : m.azulejo;
  m.vidrio = una('vidrio', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, clearcoat: 1 })));
  m.vidrioVitrina = una('vidrioVitrina', () => refleja(new THREE.MeshPhysicalMaterial({ color: '#dfe7e4', roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false })));
  m.led = una('led', () => new THREE.MeshBasicMaterial({ color: '#fff1d6' }));
  m.downlight = una('downlight', () => new THREE.MeshBasicMaterial({ color: '#fff7ea' }));
  // Realismo sin postproceso
  m.contacto = matContacto();
  // fondo de las holguras entre puertas: lo que se ve por la rendija de 3 mm es sombra, no el casco blanco
  m.holgura = una('holgura', () => new THREE.MeshBasicMaterial({ color: '#0e0d0c' }));
  m.deco = una('deco', () => { const p = T.paletaDeco(); return new THREE.MeshStandardMaterial({ map: p.map, roughnessMap: p.roughnessMap, roughness: 1 }); });
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
