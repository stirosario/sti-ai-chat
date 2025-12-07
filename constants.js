/**
 * constants.js
 * ✅ FASE 5-3: Constantes centralizadas para evitar magic numbers
 */

// Límites de sesión y cache
export const MAX_CACHED_SESSIONS = 1000;
export const SESSION_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
export const CSRF_TOKEN_TTL = 60 * 60 * 1000; // 1 hora

// Límites de imágenes
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGES_PER_SESSION = 10;

// Límites de intentos
export const MAX_NAME_ATTEMPTS = 5;
export const MAX_PROBLEM_REFORMULATIONS = 3;

// Timeouts
export const OPENAI_TIMEOUT = 30000; // 30 segundos
export const IMAGE_ANALYSIS_TIMEOUT = 30000; // 30 segundos

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
export const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests por minuto

// Production limits - 10 concurrent users
export const MAX_CONCURRENT_USERS = 10; // Máximo 10 usuarios simultáneos
export const USER_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad para considerar sesión inactiva

// Transcript limits
export const MAX_TRANSCRIPT_SLICE = 8; // Últimos 8 mensajes para contexto
export const MAX_CONVERSATION_CONTEXT = 6; // Últimos 6 mensajes

// Session expiration
export const SESSION_EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 horas
