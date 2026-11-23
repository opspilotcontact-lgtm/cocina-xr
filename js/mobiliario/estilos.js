// Cuatro estilos de home staging. Cada uno decide paleta (celdas del atlas), madera, tejido principal y FORMAS
// (patas, brazos del sofá, cabecero, lámparas…), para que no sean el mismo piso con otro color.
export const ESTILOS = {
  nordico: {
    nombre: 'Nórdico', madera: '#cfae84', vetaSeed: 11, barniz: 0.05,
    tela: '#cfcac1', telaTipo: 'tejido', ropaCama: '#f3f1ec', cabecero: 'madera',
    acentos: ['salvia', 'mostaza', 'rosaPalo', 'perla'], cojines: ['cojinGeo', 'salvia', 'mostaza', 'perla'], manta: 'mantaPunto',
    metal: 'negroMate', laca: 'lacaBlanca', patas: 'conicas', brazo: 'fino', alfombra: 'alfombraNordica',
    marco: 'maderaClara', cuadros: ['cuadro1', 'cuadro3', 'cuadro7', 'cuadro5'], maceta: 'ceramica', cortina: 'blanco',
    lampara: 'tripode', colgante: 'globo', silla: 'varillas', mesa: 'redonda',
  },
  moderno: {
    nombre: 'Moderno', madera: '#7b5538', vetaSeed: 23, barniz: 0.15,
    tela: '#6e7073', telaTipo: 'tejido', ropaCama: '#eeeeec', cabecero: 'tapizado',
    acentos: ['petroleo', 'terracotaSuave', 'piedra', 'grafito'], cojines: ['petroleo', 'terracotaSuave', 'cojinRayas', 'piedra'], manta: 'mantaRayas',
    metal: 'negroMate', laca: 'lacaBlanca', patas: 'metal', brazo: 'recto', alfombra: 'alfombraModerna',
    marco: 'negro', cuadros: ['cuadro0', 'cuadro2', 'cuadro6', 'cuadro5'], maceta: 'ceramicaNegra', cortina: 'lino',
    lampara: 'arco', colgante: 'cupula', silla: 'tapizada', mesa: 'rect',
  },
  industrial: {
    nombre: 'Industrial', madera: '#8a6446', vetaSeed: 37, barniz: 0,
    tela: '#8a5634', telaTipo: 'cuero', ropaCama: '#d9d4ca', cabecero: 'metal',
    acentos: ['oliva', 'oxido', 'hormigon', 'mostaza'], cojines: ['oliva', 'cojinCuadros', 'oxido', 'hormigon'], manta: 'mantaOcre',
    metal: 'aceroNegro', laca: 'lacaNegra', patas: 'tubo', brazo: 'ancho', alfombra: 'alfombraVintage',
    marco: 'aceroNegro', cuadros: ['cuadro2', 'cuadro6', 'cuadro0', 'cuadro1'], maceta: 'hormigon', cortina: 'lino',
    lampara: 'foco', colgante: 'campana', silla: 'metal', mesa: 'rect',
  },
  clasico: {
    nombre: 'Clásico', madera: '#6b432c', vetaSeed: 51, barniz: 0.35,
    tela: '#3f5a48', telaTipo: 'terciopelo', ropaCama: '#f1ebdd', cabecero: 'capitone',
    acentos: ['burdeos', 'oroViejo', 'beige', 'verdeBotella'], cojines: ['cojinDamasco', 'beige', 'burdeos', 'oroViejo'], manta: 'mantaRayas',
    metal: 'laton', laca: 'lacaCrema', patas: 'torneadas', brazo: 'enrollado', alfombra: 'alfombraPersa',
    marco: 'oroViejo', cuadros: ['cuadro4', 'cuadro3', 'cuadro7', 'cuadro1'], maceta: 'ceramicaAzul', cortina: 'crema',
    lampara: 'plisada', colgante: 'arana', silla: 'clasica', mesa: 'rect',
  },
};
for (const [k, v] of Object.entries(ESTILOS)) v.id = k;
export const ESTILO_DEFECTO = 'nordico';
export const DENSIDADES = { minimo: 'Lo justo', completo: 'Completo (piso piloto)' };

// Configuración de mobiliario con valores por defecto. La pone la UI (otra rama) en casa.mobiliario =
// { estilo, densidad, activo? }; una estancia puede llevar la suya en est.mobiliario y manda sobre la de la casa.
export function leerMobiliario(casa, est = null) {
  const m = { ...(casa?.mobiliario || {}), ...(est?.mobiliario || {}) };
  return {
    activo: m.activo !== false,
    estilo: ESTILOS[m.estilo] ? m.estilo : ESTILO_DEFECTO,
    densidad: m.densidad === 'minimo' ? 'minimo' : 'completo',
  };
}
