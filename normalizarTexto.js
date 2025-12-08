// utils/normalizarTexto.js
// ========================
// Funciones utilitarias para limpiar y estandarizar texto
// en todos los módulos del chat STI (detección, intents, etc.)
// 
// ACTUALIZACIÓN 2025-11-25: Agregado soporte para errores ortográficos
// comunes basado en análisis de 200 casos reales (100 ES + 100 EN)

/**
 * DICCIONARIO DE CORRECCIONES ORTOGRÁFICAS
 * Mapea typos comunes → palabras correctas (legacy + ampliado)
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
  'wif': 'wifi',  // ✅ CORRECCIÓN: "wif" → "wifi" (error común)
  'wi-fi': 'wifi',
  'wi fi': 'wifi',
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

// ================================
// NUEVO: Mapa de frases completas
// ================================
export const TYPO_PHRASE_MAP = {
  // PROBLEMAS GENERALES
  'no me nada': 'no me anda',
  'no me nad': 'no me anda',
  'no me na': 'no me anda',
  'no nada': 'no anda',
  'no funsiona': 'no funciona',
  'no funsiona bien': 'no funciona bien',
  'no funsiona el wifi': 'no funciona el wifi',
  'no fuinciona': 'no funciona',

  // TECLADO
  'no me nada el teclado': 'no me anda el teclado',
  'no me anda el tekado': 'no me anda el teclado',
  'no me anda el teclao': 'no me anda el teclado',
  'problema con mi tekado': 'problema con mi teclado',
  'no responde el teclao': 'no responde el teclado',

  // MOUSE
  'no me nada el mose': 'no me anda el mouse',
  'no me anda el mose': 'no me anda el mouse',
  'no anda el mause': 'no anda el mouse',
  'problema con el mose': 'problema con el mouse',

  // WIFI / INTERNET
  'no me nada el wif': 'no me anda el wifi',
  'no me anda el wif': 'no me anda el wifi',
  'no me anda el wi fi': 'no me anda el wifi',
  'no anda el wifii': 'no anda el wifi',
  'no tengo wifii': 'no tengo wifi',
  'no tengo interner': 'no tengo internet',
  'no tengo interntet': 'no tengo internet',

  // MODEM / ROUTER
  'problema con el moden': 'problema con el modem',
  'problema con el mobem': 'problema con el modem',
  'no anda el moden': 'no anda el modem',
  'no anda el rauter': 'no anda el router',
  'no anda el router wifi': 'no anda el router wifi',
  'no prenden las luces del moden': 'no prenden las luces del modem',

  // NOTEBOOK / PC
  'no me anda la notbuk': 'no me anda la notebook',
  'no me anda la notbook': 'no me anda la notebook',
  'problema con la notbuk': 'problema con la notebook',
  'no prende la compu de escritorio': 'no prende la pc de escritorio',
  'no prende la compu': 'no prende la pc',
  'no enciende la compu': 'no enciende la pc',

  // IMPRESORA
  'no funsiona la inpresora': 'no funciona la impresora',
  'no funsiona la imprecora': 'no funciona la impresora',
  'no imprme': 'no imprime',
  'no enprme': 'no imprime',
  'no me imprime la inpresora': 'no me imprime la impresora',

  // PANTALLA / MONITOR
  'no da imajen': 'no da imagen',
  'no da imajen el monitor': 'no da imagen el monitor',
  'pantaya en negro': 'pantalla en negro',
  'pantalla neggra': 'pantalla negra',

  // OTROS PROBLEMAS
  'se tilda todo': 'se traba todo',
  'se tilde la compu': 'se trabó la compu',
  'se bloquea todo el tiemo': 'se bloquea todo el tiempo'
};

// ================================
// NUEVO: Mapa de tokens sueltos
// ================================
export const TYPO_TOKEN_MAP = {
  // VERBOS / ESTADO
  'funsiona': 'funciona',
  'fuinciona': 'funciona',
  'funiona': 'funciona',
  'prense': 'prende',
  'enciendee': 'enciende',
  'enciendee': 'enciende',

  // ENTRADA
  'tekado': 'teclado',
  'teclao': 'teclado',
  'teclaco': 'teclado',
  'mose': 'mouse',
  'mause': 'mouse',
  'maus': 'mouse',

  // RED
  'wif': 'wifi',
  'wiffi': 'wifi',
  'wi-fi': 'wifi',
  'wi fi': 'wifi',
  'moden': 'modem',
  'mobem': 'modem',
  'moderm': 'modem',
  'rauter': 'router',
  'ruter': 'router',

  // PC / NOTEBOOK
  'notbuk': 'notebook',
  'notbook': 'notebook',
  'nortbuk': 'notebook',
  'note': 'notebook',
  'compu': 'pc',

  // IMPRESORA
  'inpresora': 'impresora',
  'impresor': 'impresora',
  'imprecora': 'impresora',
  'imprezora': 'impresora',

  // PANTALLA
  'pantaya': 'pantalla',
  'pantallla': 'pantalla',

  // MARCAS / SO
  'windoows': 'windows',
  'windos': 'windows',
  'windws': 'windows',
  'androi': 'android',
  'win10': 'windows 10',
  'w10': 'windows 10',
  'windows10': 'windows 10',
  'windows-10': 'windows 10',
  'windos10': 'windows 10',
  'windos 10': 'windows 10',

  // SERVICIO / PERSONAS
  'tecnico': 'técnico',
  'tecniko': 'técnico'
};

// ================================
// NUEVO: Palabras de dominio (fuzzy)
// ================================
export const DOMAIN_WORDS = [
  // VERBOS / ESTADO
  'problema', 'anda', 'funciona', 'no anda', 'no funciona',
  'no prende', 'no enciende', 'no da imagen', 'se traba', 'se tilda',

  // PC / NOTEBOOK / HARDWARE
  'pc', 'pc de escritorio', 'notebook', 'netbook', 'all in one', 'cpu',
  'torre', 'gabinete', 'monitor', 'pantalla', 'mouse', 'teclado',
  'touchpad', 'trackpad', 'parlantes', 'auriculares', 'microfono',

  // RED / INTERNET
  'wifi', 'modem', 'router', 'repetidor', 'switch', 'ont', 'internet', 'red',

  // IMPRESION
  'impresora', 'multifuncion', 'scanner',

  // MOVILES / SO
  'celular', 'telefono', 'tablet', 'android', 'iphone',
  'windows', 'windows 10', 'w10', 'linux', 'macos',

  // SERVICIO TECNICO
  'tecnico', 'técnico', 'visita', 'domicilio'
];

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

function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function applyPhraseMap(text, phraseMap) {
  let t = text;
  for (const [src, dst] of Object.entries(phraseMap)) {
    const rx = new RegExp(`\\b${src}\\b`, 'gi');
    t = t.replace(rx, dst);
  }
  return t;
}

function applyTokenMap(text, tokenMap) {
  const tokens = text.split(/\s+/);
  const mapped = tokens.map(tok => tokenMap[tok] || tok);
  return mapped.join(' ').trim();
}

function applyDomainFuzzy(text, domainWords) {
  const tokens = text.split(/\s+/);
  const mapped = tokens.map(tok => {
    if (!tok || tok.length < 3) return tok;
    let best = tok;
    let bestDist = Infinity;
    for (const dw of domainWords) {
      const dist = levenshtein(tok, dw);
      const limit = dw.length <= 4 ? 1 : 2;
      if (dist <= limit && dist < bestDist) {
        best = dw;
        bestDist = dist;
      }
    }
    return best;
  });
  return mapped.join(' ').trim();
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
  // 0. Legacy: correcciones de typos previas
  let t = corregirTypos(texto);

  // 1. Normalizar básico (acentos, minúsculas, signos) + colapsar repetidos
  t = colapsarRepeticiones(normalizarBasico(t));

  // 2. Reemplazos de frases completas
  t = applyPhraseMap(t, TYPO_PHRASE_MAP);

  // 3. Reemplazos de tokens directos (nuevo) + legacy corrections
  t = applyTokenMap(t, { ...TYPO_CORRECTIONS, ...TYPO_TOKEN_MAP });

  // 4. Corrección difusa con palabras de dominio
  t = applyDomainFuzzy(t, DOMAIN_WORDS);

  // 5. Limpieza final de espacios
  return t.trim();
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
