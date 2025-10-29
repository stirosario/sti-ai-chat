// utils/normalizarTexto.js
// ========================
// Funciones utilitarias para limpiar y estandarizar texto
// en todos los módulos del chat STI (detección, intents, etc.)

/**
 * Elimina acentos, pasa a minúsculas y reduce espacios múltiples.
 * Ej: "¡Qué DÍA  tan  lindo!" → "que dia tan lindo"
 */
export function normalizarBasico(texto = "") {
  return texto
    .toLowerCase()
    // quita acentos y diacríticos (día → dia)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
 * - minúsculas, sin acentos, sin signos, sin repeticiones.
 */
export function normalizarTextoCompleto(texto = "") {
  return colapsarRepeticiones(normalizarBasico(texto));
}



// --- Reemplaza expresiones argentinas comunes por equivalentes neutros ---
export function reemplazarArgentinismosV1(text = '') {
  let t = String(text).toLowerCase();

  const reemplazos = {
    'no funca': 'no funciona',
    'no anda': 'no funciona',
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
