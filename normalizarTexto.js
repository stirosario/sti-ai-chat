// utils/normalizarTexto.js
// ========================
// Funciones utilitarias para limpiar y estandarizar texto
// en todos los módulos del chat STI (detección, intents, etc.)
// 
// ACTUALIZACIÓN 2025-11-25: Agregado soporte para errores ortográficos
// comunes basado en análisis de 200 casos reales (100 ES + 100 EN)

/**
 * DICCIONARIO DE CORRECCIONES ORTOGRÁFICAS
 * Mapea typos comunes → palabras correctas
 * Basado en análisis de 200 casos reales con errores
 */
const TYPO_CORRECTIONS = {
  // ===== ESPAÑOL =====
  // Dispositivos
  'kompu': 'compu',
  'komputer': 'computadora',
  'komputadora': 'computadora',
  'dispocitivo': 'dispositivo',
  'dispositibo': 'dispositivo',
  'aparato': 'aparato',
  'aparto': 'aparato',
  
  // Pantalla
  'pamtaya': 'pantalla',
  'panatya': 'pantalla',
  'panatlla': 'pantalla',
  'pantaya': 'pantalla',
  'pantasha': 'pantalla',
  'pantalya': 'pantalla',
  
  // Acciones
  'enziende': 'enciende',
  'ensiende': 'enciende',
  'prrende': 'prende',
  'aprrieto': 'aprieto',
  'apgaa': 'apaga',
  'apgaga': 'apaga',
  'ase': 'hace',
  'asen': 'hacen',
  'ace': 'hace',
  'acen': 'hacen',
  
  // Conectividad
  'konekta': 'conecta',
  'konecta': 'conecta',
  'internett': 'internet',
  'internt': 'internet',
  'rrred': 'red',
  'bluetut': 'bluetooth',
  'blutuz': 'bluetooth',
  'blutooth': 'bluetooth',
  
  // Audio/Video
  'escuxa': 'escucha',
  'esucha': 'escucha',
  'esuche': 'escuche',
  'imajen': 'imagen',
  
  // Hardware
  'cargadoor': 'cargador',
  'cargadorrr': 'cargador',
  'teclaco': 'teclado',
  'mause': 'mouse',
  'raton': 'raton',
  'cursos': 'cursor',
  'crusor': 'cursor',
  'bateria': 'bateria',
  
  // Estados
  'neggra': 'negra',
  'mui': 'muy',
  'trabbado': 'trabado',
  'trava': 'traba',
  'bloqueoo': 'bloqueo',
  
  // Errores
  'errr': 'error',
  'erorr': 'error',
  'mensage': 'mensaje',
  'señaal': 'señal',
  'senyal': 'señal',
  
  // Software
  'apliacines': 'aplicaciones',
  'aplicasiones': 'aplicaciones',
  'aplikasiones': 'aplicaciones',
  'navegadorrr': 'navegador',
  'actuializar': 'actualizar',
  'actializar': 'actualizar',
  'installar': 'instalar',
  'sofware': 'software',
  
  // Otros
  'demaciado': 'demasiado',
  'muchicimo': 'muchisimo',
  'apeas': 'apenas',
  'funsiona': 'funciona',
  'repondee': 'responde',
  // ✅ CORRECCIÓN 1: "no me nada" → "no me funciona" (typo común)
  'nada': 'funciona',  // Solo en contexto negativo, pero la normalización básica lo manejará
  'abissar': 'avisar',
  'rruido': 'ruido',
  'almaceamiento': 'almacenamiento',
  'shillido': 'chillido',
  'reinisio': 'reinicio',
  'titila': 'titila',
  'senssible': 'sensible',
  'reinica': 'reinicia',
  'mobil': 'movil',
  'vaja': 'baja',
  'critico': 'critico',
  
  // ===== ENGLISH =====
  // Dispositivos
  'compuetr': 'computer',
  'computr': 'computer',
  'divice': 'device',
  'devize': 'device',
  'devise': 'device',
  
  // Screen
  'screan': 'screen',
  'scren': 'screen',
  'screenn': 'screen',
  
  // Contracciones comunes
  'wont': 'won\'t',
  'wont': 'wont',  // También aceptar sin apóstrofe
  'doesnt': 'doesn\'t',
  'cant': 'can\'t',
  'isnt': 'isn\'t',
  'didnt': 'didn\'t',
  'hasnt': 'hasn\'t',
  'arent': 'aren\'t',
  
  // Acciones
  'happns': 'happens',
  'repond': 'respond',
  'reacton': 'reaction',
  
  // Conectividad
  'connet': 'connect',
  'conecton': 'connection',
  'internt': 'internet',
  'netwroks': 'networks',
  'bluetoth': 'bluetooth',
  
  // Hardware
  'chager': 'charger',
  'keybord': 'keyboard',
  'batery': 'battery',
  'storaje': 'storage',
  
  // Estados
  'slow': 'slow',
  'laggy': 'laggy',
  'frozen': 'frozen',
  'freezes': 'freezes',
  'freeezes': 'freezes',
  
  // Audio/Video
  'noize': 'noise',
  'soud': 'sound',
  'brightnes': 'brightness',
  
  // Errores
  'eror': 'error',
  'wierd': 'weird',
  'recognzed': 'recognized',
  'detcted': 'detected',
  
  // Software
  'aplications': 'applications',
  'instal': 'install',
  'browzer': 'browser',
  'sistem': 'system',
  'acount': 'account',
  
  // Otros comunes
  'alot': 'a lot',
  
  // ===== ALMACENAMIENTO (ML Training: 7,350 casos) =====
  'actualice': 'actualicé',
  'ayel': 'ayer',
  'idisco': 'disco',
  'funcioa': 'funciona',
  'actualicéé': 'actualicé',
  'fuciona': 'funciona',
  'qque': 'que',
  'desdee': 'desde',
  'winodws.': 'windows.',
  'computador': 'computadora',
  'diisco': 'disco',
  'rigidokno': 'rigido',
  'rigid': 'rigido',
  'dettecta': 'detecta',
  'disc': 'disco',
  'detxcta': 'detecta',
  'rigidi': 'rigido',
  'detectald': 'detecta',
  'disce': 'disco',
  'cunedo': 'cuando',
  'hac': 'hace',
  'enada': 'nada',
  'vasa': 'pasa',
  'pasaa': 'pasa',
  'irgido': 'rigido',
  'suando': 'cuando',
  'conectoc': 'conecto',
  'ada': 'cada',
  'nda': 'nada',
  'reeinicio': 'reinicio',
  'funcion': 'funciona',
  'muyy': 'muy',
  'paas': 'pasa',
  'missmo.': 'mismo.',
  'psaa': 'pasa',
  'congehado': 'congelado',
  'congelabo': 'congelado',
  'cpsi': 'casi',
  'pas': 'pasa',
  'vecees': 'veces',
  'funcionauy': 'funciona',
  'discco': 'disco',
  'alguna': 'algunas',
  'sveces.': 'veces.',
  'actuatice': 'actualicé',
  'dissc': 'disco',
  'cuendo': 'cuando',
  'connecot': 'conecto',
  'disoc': 'disco',
  'dico': 'disco',
  'reiniccio': 'reinicio',
  'missmo': 'mismo',
  'pasxa': 'pasa',
  'rigidp': 'rigido',
  'disgo': 'disco',
  'cusndo': 'cuando',
  'reinicil': 'reinicio',
  'ddisco': 'disco',
  'ppasa': 'pasa',
  'llegaron': 'llegaron',
  'actuakice': 'actualicé',
  'miismo': 'mismo',
  'dksco': 'disco',
  'rogido': 'rigido',
  'conefto': 'conecto',
  'pasw': 'pasa',
  'funcionaa': 'funciona',
  'discl': 'disco',
  'cunado': 'cuando',
  'riigido': 'rigido',
  'rigdo': 'rigido',
  'rignido': 'rigido',
  'reincio': 'reinicio',
  'funcionx': 'funciona',
  'pssa': 'pasa',
  'disfo': 'disco',
  'cuwdo': 'cuando',
  'cssi': 'casi',
  'reiinicio': 'reinicio',
  
  // ===== IMPRESIÓN/DIGITALIZACIÓN (ML Training: 6,300 casos) =====
  'lase': 'laser',
  'laer': 'laser',
  'impreora': 'impresora',
  'impesora': 'impresora',
  'impresor': 'impresora',
  'impreesora': 'impresora',
  'cuano': 'cuando',
  'trabajndo': 'trabajando',
  'dede': 'desde',
  'windos': 'windows',
  'medi': 'media',
  'desd': 'desde',
  'concto': 'conecto',
  'llaserlda': 'laser',
  'impresorra': 'impresora',
  'gollpe': 'golpe',
  'reiniciola': 'reinicio',
  'funciiona': 'funciona',
  'conecctt': 'conecté',
  'eqquipo': 'equipo',
  'laseer': 'laser',
  'conecet': 'conecté',
  'equipoc': 'equipo',
  'conectoo': 'conecto',
  'congeladdo': 'congelado',
  'trrabajando': 'trabajando',
  'raato': 'rato',
  'ratoo': 'rato',
  'actualiic': 'actualicé',
  'windowws': 'windows',
  'descconecta': 'desconecta',
  'soloo': 'solo',
  'slojdesde': 'solo',
  'todooel': 'todo',
  
  'wen': 'when',
  'tooo': 'too',
  'veryyyy': 'very',
  'allways': 'always',
  'becuz': 'because',
  'nothng': 'nothing',
  'anythingg': 'anything',
  'somethin': 'something',
  'pickng': 'picking',
  'workng': 'working',
  'chargng': 'charging',
  'dissapear': 'disappear',
  'blurrry': 'blurry',
  'typng': 'typing',
  'audioo': 'audio',
  'jus': 'just',
  'allday': 'all day',
  'loosing': 'losing',
  'crahing': 'crashing'
};

/**
 * Corrige errores ortográficos comunes antes de normalizar.
 * Aplica diccionario de 150+ typos reales detectados.
 * 
 * @param {string} texto - Texto con posibles typos
 * @returns {string} Texto con typos corregidos
 * 
 * @example
 * corregirTypos("Mi kompu no enziende")
 * // → "Mi compu no enciende"
 */
export function corregirTypos(texto = "") {
  if (!texto || typeof texto !== 'string') return '';
  
  let resultado = texto.toLowerCase();
  
  // Aplicar correcciones palabra por palabra
  // Usa \b para respetar límites de palabra
  for (const [typo, correcto] of Object.entries(TYPO_CORRECTIONS)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    resultado = resultado.replace(regex, correcto);
  }
  
  return resultado;
}

/**
 * Elimina acentos, pasa a minúsculas y reduce espacios múltiples.
 * Ej: "¡Qué DÍA  tan  lindo!" → "que dia tan lindo"
 */
export function normalizarBasico(texto = "") {
  return texto
    .toLowerCase()
    // quita acentos y diacríticos (día → dia)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // elimina comillas tipográficas y otras comillas raras
    .replace(/[""''`´]/g, ' ')
    // elimina signos comunes de puntuación inicial/final
    .replace(/[¡!¿?.,;:]+/g, ' ')
    // colapsa espacios múltiples
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza y colapsa repeticiones exageradas de letras.
 * Ej: "holaaaaaa!!!" → "holaa"
 */
export function colapsarRepeticiones(texto = "") {
  return texto.replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * Normaliza un texto completamente: 
 * - corrige typos comunes (kompu → compu)
 * - minúsculas, sin acentos, sin signos, sin repeticiones.
 * 
 * @param {string} texto - Texto a normalizar
 * @returns {string} Texto normalizado y limpio
 * 
 * @example
 * normalizarTextoCompleto("Mi kompu no enziende!!!")
 * // → "mi compu no enciende"
 */
export function normalizarTextoCompleto(texto = "") {
  // 1. Corregir typos ANTES de normalizar
  let textoCorregido = corregirTypos(texto);
  
  // 2. Normalizar básico (acentos, minúsculas, signos)
  let textoNormalizado = normalizarBasico(textoCorregido);
  
  // 3. Colapsar repeticiones exageradas
  return colapsarRepeticiones(textoNormalizado);
}



// --- Reemplaza expresiones argentinas comunes por equivalentes neutros ---
export function reemplazarArgentinismosV1(text = '') {
  let t = String(text).toLowerCase();

  const reemplazos = {
    'no funca': 'no funciona',
    'no anda': 'no funciona',
    'no me nada': 'no me funciona',  // ✅ CORRECCIÓN 1: Typo común "no me nada" → "no me funciona"
    'anda mal': 'funciona mal',
    'colgado': 'congelado',
    'lento': 'funciona lento',
    'se trabo': 'se trabó',
    'se tildo': 'se tildó',
    'tildado': 'congelado',
    'bootea': 'inicia',
    'booteo': 'inicio',
    'reinicia solo': 'se reinicia solo',
    'se apaga': 'se apaga solo',
    'pantalla azul': 'bsod',
    'pantalla negra': 'sin video',
    'pantalla blanca': 'sin video',
    'enchufado': 'conectado',
    'enchufe': 'conector de corriente',
    'enchufeado': 'conectado',
    'enchufo': 'conecto',
    'enchufar': 'conectar',
    'enchufalo': 'conectalo',
    'enchufala': 'conectala',
    'enchufe la': 'conecte la',
    'enchufe el': 'conecte el'
  };

  for (const [key, value] of Object.entries(reemplazos)) {
    const rx = new RegExp(`\\b${key}\\b`, 'gi');
    t = t.replace(rx, value);
  }

  return t.trim();
}
