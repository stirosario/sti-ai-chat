/**
 * utils/security.js
 * Utilidades de seguridad: CSRF protection
 */

import crypto from 'crypto';

// ========================================================
// Security: CSRF Token Store (in-memory, production should use Redis)
// ========================================================
const csrfTokenStore = new Map(); // Map<sessionId, {token, createdAt}>

/**
 * Valida el token CSRF de una solicitud
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export function validateCSRF(req, res, next) {
  // Skip validación para métodos seguros (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const sessionId = req.sessionId;
  const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken;

  // Si no hay sesión aún, permitir (será creada en /api/greeting)
  if (!sessionId) {
    return next();
  }

  const stored = csrfTokenStore.get(sessionId);

  // Token inválido o no existe
  if (!stored || stored.token !== csrfToken) {
    console.warn(`[CSRF] REJECTED - Invalid or missing token:`);
    console.warn(`  Session: ${sessionId}`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Method: ${req.method}`);
    console.warn(`  Path: ${req.path}`);
    console.warn(`  Provided Token: ${csrfToken ? csrfToken.substring(0, 10) + '...' : 'NONE'}`);
    return res.status(403).json({
      ok: false,
      error: 'CSRF token inválido o expirado. Por favor recargá la página.'
    });
  }

  // Token expirado (1 hora de vida)
  if (Date.now() - stored.createdAt > 60 * 60 * 1000) {
    csrfTokenStore.delete(sessionId);
    console.warn(`[CSRF] REJECTED - Expired token: session=${sessionId}, age=${Math.floor((Date.now() - stored.createdAt) / 1000)}s`);
    return res.status(403).json({
      ok: false,
      error: 'CSRF token expirado. Por favor recargá la página.'
    });
  }

  // Token válido
  next();
}

/**
 * Genera un token CSRF para una sesión
 * @param {string} sessionId - ID de la sesión
 * @returns {string} Token CSRF generado
 */
export function generateCSRFToken(sessionId) {
  const token = crypto.randomBytes(32).toString('base64url');
  csrfTokenStore.set(sessionId, {
    token,
    createdAt: Date.now()
  });
  return token;
}

/**
 * Obtiene el token CSRF de una sesión
 * @param {string} sessionId - ID de la sesión
 * @returns {string|null} Token CSRF o null si no existe
 */
export function getCSRFToken(sessionId) {
  const stored = csrfTokenStore.get(sessionId);
  return stored ? stored.token : null;
}

/**
 * Limpia tokens CSRF expirados
 */
export function cleanupExpiredCSRFTokens() {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hora
  
  for (const [sid, data] of csrfTokenStore.entries()) {
    if (now - data.createdAt > maxAge) {
      csrfTokenStore.delete(sid);
    }
  }
}

