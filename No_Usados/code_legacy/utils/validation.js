/**
 * utils/validation.js
 * Funciones de validación de inputs y sessionId
 */

import path from 'path';
import crypto from 'crypto';
import { sanitizeInput } from './sanitization.js';

/**
 * Valida que un sessionId tenga el formato correcto
 * @param {string} sid - Session ID a validar
 * @returns {boolean} true si es válido
 */
export function validateSessionId(sid) {
  if (!sid || typeof sid !== 'string') {
    return false;
  }

  // Permitir tanto sesiones del servidor (srv-) como del cliente web (web-)
  if (!sid.startsWith('srv-') && !sid.startsWith('web-')) {
    return false;
  }

  // Para sesiones del servidor: formato srv-TIMESTAMP-HASH64
  if (sid.startsWith('srv-')) {
    if (sid.length !== 82) {
      return false;
    }
    const sessionIdRegex = /^srv-\d{13}-[a-f0-9]{64}$/;
    return sessionIdRegex.test(sid);
  }

  // Para sesiones del cliente web: formato flexible
  if (sid.startsWith('web-')) {
    // Validación flexible: permitir letras, números y guiones
    if (sid.length < 10 || sid.length > 60) {
      return false;
    }
    // Formato: web- seguido de caracteres alfanuméricos y guiones
    const webSessionRegex = /^web-[a-zA-Z0-9_-]+$/;
    return webSessionRegex.test(sid);
  }

  return false;
}

/**
 * Obtiene el sessionId de la request (header, body o query)
 * @param {object} req - Request object de Express
 * @returns {string} Session ID válido o generado
 */
export function getSessionId(req) {
  const h = sanitizeInput(req.headers['x-session-id'] || '', 128);
  const b = sanitizeInput(req.body?.sessionId || req.body?.sid || '', 128);
  const q = sanitizeInput(req.query?.sessionId || req.query?.sid || '', 128);

  const sid = h || b || q;

  if (sid && validateSessionId(sid)) {
    return sid;
  }

  // Generate new session ID si no es válido
  return generateSessionId();
}

/**
 * Genera un nuevo sessionId único
 * @returns {string} Session ID generado
 */
export function generateSessionId() {
  return 'web-' + crypto.randomBytes(12).toString('hex');
}

/**
 * Valida que un path de archivo esté dentro del directorio permitido
 * @param {string} filePath - Ruta del archivo
 * @param {string} allowedDir - Directorio base permitido
 * @returns {boolean} true si el path es seguro
 */
export function isPathSafe(filePath, allowedDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(allowedDir);
  return resolvedPath.startsWith(resolvedBase);
}
