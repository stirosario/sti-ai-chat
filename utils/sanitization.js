/**
 * utils/sanitization.js
 * Funciones de sanitización de inputs para prevenir XSS y otros ataques
 */

/**
 * Sanitiza un input de texto removiendo caracteres peligrosos
 * @param {string} input - Texto a sanitizar
 * @param {number} maxLength - Longitud máxima permitida
 * @returns {string} Texto sanitizado
 */
export function sanitizeInput(input, maxLength = 1000) {
  if (!input) return '';
  return String(input)
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'`]/g, '') // Remove potential XSS characters
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

/**
 * Sanitiza un nombre de archivo para prevenir path traversal
 * @param {string} fileName - Nombre de archivo a sanitizar
 * @returns {string|null} Nombre sanitizado o null si es inválido
 */
export function sanitizeFilePath(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;

  // Remover path traversal patterns
  const sanitized = fileName
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 255);

  // Validar que no esté vacío después de sanitizar
  if (!sanitized || sanitized.length === 0) return null;

  return sanitized;
}
