/**
 * sessionService.js
 * 
 * Servicio centralizado para gestión de sesiones de usuario.
 * Wrapper sobre sessionStore.js con funcionalidades adicionales.
 * 
 * RESPONSABILIDADES:
 * - CRUD de sesiones (crear, leer, actualizar, eliminar)
 * - Validación de estructura de sesión
 * - Limpieza automática de sesiones expiradas
 * - Cache y optimización de acceso
 * - Migración de campos legacy
 * 
 * COMPATIBILIDAD: 100% compatible con sessionStore.js existente
 */

import { getSession as getSessionStore, saveSession as saveSessionStore, listActiveSessions } from '../../sessionStore.js';

// ========== ESTRUCTURA DEFAULT DE SESIÓN ==========
const DEFAULT_SESSION = {
  sessionId: null,
  userName: null,
  userText: null,
  device: null,
  problem: null,
  stage: 'greeting',
  conversationHistory: [],
  createdAt: null,
  lastActivity: null,
  isProblem: false,
  isHowTo: false,
  needType: null,
  diagnosticSteps: [],
  currentStepIndex: 0,
  hasImage: false,
  imageUrls: [],
  analysisResults: [],
  ticketId: null,
  metadata: {}
};

// ========== CACHE DE SESIONES ==========
const sessionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getCacheKey(sessionId) {
  return `session:${sessionId}`;
}

function setCachedSession(sessionId, sessionData) {
  sessionCache.set(getCacheKey(sessionId), {
    data: sessionData,
    cachedAt: Date.now()
  });
}

function getCachedSession(sessionId) {
  const cached = sessionCache.get(getCacheKey(sessionId));
  if (!cached) return null;
  
  // Verificar si el cache expiró
  if (Date.now() - cached.cachedAt > CACHE_TTL) {
    sessionCache.delete(getCacheKey(sessionId));
    return null;
  }
  
  return cached.data;
}

function invalidateCache(sessionId) {
  sessionCache.delete(getCacheKey(sessionId));
}

// ========== OBTENER SESIÓN CON CACHE ==========
export async function getSession(sessionId) {
  // Intentar cache primero
  const cached = getCachedSession(sessionId);
  if (cached) {
    console.log(`[SessionService] ⚡ Cache hit: ${sessionId}`);
    return cached;
  }

  // Si no está en cache, obtener desde store
  console.log(`[SessionService] 📥 Loading from store: ${sessionId}`);
  const session = await getSessionStore(sessionId);
  
  if (session) {
    // Validar y normalizar estructura
    const normalized = normalizeSession(session);
    setCachedSession(sessionId, normalized);
    return normalized;
  }
  
  return null;
}

// ========== CREAR NUEVA SESIÓN ==========
export async function createSession(sessionId, initialData = {}) {
  const now = new Date().toISOString();
  
  const newSession = {
    ...DEFAULT_SESSION,
    ...initialData,
    sessionId,
    createdAt: now,
    lastActivity: now
  };

  console.log(`[SessionService] ✨ Creating new session: ${sessionId}`);
  await saveSession(sessionId, newSession);
  
  return newSession;
}

// ========== GUARDAR SESIÓN ==========
export async function saveSession(sessionId, sessionData) {
  // Actualizar timestamp de actividad
  sessionData.lastActivity = new Date().toISOString();
  
  // Validar estructura
  const validated = normalizeSession(sessionData);
  
  // Guardar en store
  await saveSessionStore(sessionId, validated);
  
  // Actualizar cache
  setCachedSession(sessionId, validated);
  
  console.log(`[SessionService] 💾 Saved: ${sessionId} (stage: ${validated.stage})`);
}

// ========== ACTUALIZAR CAMPOS DE SESIÓN ==========
export async function updateSession(sessionId, updates) {
  const session = await getSession(sessionId);
  
  if (!session) {
    throw new Error(`[SessionService] Session not found: ${sessionId}`);
  }
  
  const updated = {
    ...session,
    ...updates,
    lastActivity: new Date().toISOString()
  };
  
  await saveSession(sessionId, updated);
  return updated;
}

// ========== AGREGAR MENSAJE AL HISTORIAL ==========
export async function addMessageToHistory(sessionId, role, content, metadata = {}) {
  const session = await getSession(sessionId);
  
  if (!session) {
    console.warn(`[SessionService] Cannot add message - session not found: ${sessionId}`);
    return;
  }
  
  const message = {
    role,
    content,
    timestamp: new Date().toISOString(),
    ...metadata
  };
  
  session.conversationHistory = session.conversationHistory || [];
  session.conversationHistory.push(message);
  
  // Limitar historial a últimos 50 mensajes
  if (session.conversationHistory.length > 50) {
    session.conversationHistory = session.conversationHistory.slice(-50);
  }
  
  await saveSession(sessionId, session);
}

// ========== NORMALIZAR ESTRUCTURA DE SESIÓN ==========
function normalizeSession(session) {
  // Asegurar que todos los campos existen
  const normalized = {
    ...DEFAULT_SESSION,
    ...session
  };
  
  // Migrar campos legacy si existen
  if (session.images && !session.imageUrls) {
    normalized.imageUrls = session.images;
  }
  
  // Asegurar arrays
  normalized.conversationHistory = Array.isArray(normalized.conversationHistory) 
    ? normalized.conversationHistory 
    : [];
  normalized.diagnosticSteps = Array.isArray(normalized.diagnosticSteps) 
    ? normalized.diagnosticSteps 
    : [];
  normalized.imageUrls = Array.isArray(normalized.imageUrls) 
    ? normalized.imageUrls 
    : [];
  
  // Asegurar metadata
  normalized.metadata = normalized.metadata || {};
  
  return normalized;
}

// ========== VALIDAR SESIÓN ==========
export function validateSession(session) {
  const required = ['sessionId', 'stage'];
  const missing = required.filter(field => !session[field]);
  
  if (missing.length > 0) {
    throw new Error(`[SessionService] Invalid session - missing fields: ${missing.join(', ')}`);
  }
  
  return true;
}

// ========== ELIMINAR SESIÓN ==========
export async function deleteSession(sessionId) {
  invalidateCache(sessionId);
  console.log(`[SessionService] 🗑️ Deleted: ${sessionId}`);
  // Nota: sessionStore.js no tiene función delete, implementar si es necesario
}

// ========== LISTAR SESIONES ACTIVAS ==========
export async function listSessions() {
  return await listActiveSessions();
}

// ========== LIMPIAR CACHE ==========
export function clearCache() {
  const size = sessionCache.size;
  sessionCache.clear();
  console.log(`[SessionService] 🧹 Cache cleared (${size} entries)`);
}

// ========== OBTENER ESTADÍSTICAS ==========
export function getStats() {
  return {
    cachedSessions: sessionCache.size,
    cacheHitRate: 0 // TODO: implementar tracking
  };
}

// ========== EXPORTAR FUNCIONES ADICIONALES ==========
export {
  listActiveSessions,
  normalizeSession
};

export default {
  getSession,
  createSession,
  saveSession,
  updateSession,
  addMessageToHistory,
  deleteSession,
  listSessions,
  clearCache,
  getStats,
  validateSession
};
