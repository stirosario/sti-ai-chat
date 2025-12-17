/**
 * utils/logger.js
 * ✅ MEDIO-2: Sistema de logging con niveles para filtrar en producción
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Determinar nivel de log según entorno
const isDevelopment = process.env.NODE_ENV !== 'production';
const currentLogLevel = isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

/**
 * Logger con niveles
 */
export const logger = {
  debug: (...args) => {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  info: (...args) => {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log('[INFO]', ...args);
    }
  },
  
  warn: (...args) => {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn('[WARN]', ...args);
    }
  },
  
  error: (...args) => {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }
};
