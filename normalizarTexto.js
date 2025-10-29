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
