/**
 * utils/common.js
 * Utilidades comunes usadas en múltiples módulos
 */

/**
 * Genera timestamp ISO actual
 * @returns {string} Timestamp en formato ISO
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Helper para crear objetos con opciones
 * @param {object} obj - Objeto base
 * @returns {object} Objeto con options array agregado
 */
export function withOptions(obj) {
  return { options: [], ...obj };
}
