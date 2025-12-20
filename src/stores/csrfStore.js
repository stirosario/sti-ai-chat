/**
 * csrfStore.js - CSRF Token Store
 * 
 * Store para tokens CSRF con interfaz desacoplada.
 * Actualmente usa memoria (Map), preparado para migrar a Redis.
 * 
 * @module csrfStore
 */

const mem = new Map(); // Map<sessionId, {token, createdAt}>

/**
 * Obtener entrada CSRF para una sesión
 * @param {string} sessionId - ID de sesión
 * @returns {Object|null} Entry con {token, createdAt} o null si no existe
 */
export function get(sessionId) {
  return mem.get(sessionId) || null;
}

/**
 * Guardar entrada CSRF para una sesión
 * @param {string} sessionId - ID de sesión
 * @param {Object} entry - Entry con {token, createdAt}
 */
export function set(sessionId, entry) {
  mem.set(sessionId, entry);
}

/**
 * Eliminar entrada CSRF para una sesión
 * @param {string} sessionId - ID de sesión
 */
export function del(sessionId) {
  mem.delete(sessionId);
}

/**
 * Limpiar entradas CSRF expiradas
 * @param {number} now - Timestamp actual (default: Date.now())
 * @param {number} maxAge - Edad máxima en ms (default: 1 hora)
 */
export function cleanup(now = Date.now(), maxAge = 60 * 60 * 1000) {
  const cutoff = now - maxAge;
  for (const [sid, entry] of mem.entries()) {
    if (entry?.createdAt && entry.createdAt < cutoff) {
      mem.delete(sid);
    }
  }
}

