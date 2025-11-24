/**
 * STI Chat - Constantes Globales
 * Centraliza todos los valores configurables y magic numbers
 */

// ========================================================
// LÍMITES DE SEGURIDAD
// ========================================================
export const LIMITS = {
  // Tamaños máximos
  MAX_REQUEST_SIZE: 10 * 1024 * 1024,     // 10MB - Límite para Content-Length
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,         // 5MB - Tamaño máximo de imagen
  MAX_INPUT_LENGTH: 10000,                 // Caracteres máximos en inputs
  MAX_MESSAGE_LENGTH: 1000,                // Caracteres máximos en mensajes chat
  
  // Rate Limiting
  UPLOAD_MAX_PER_MINUTE: 3,                // 3 uploads por minuto
  CHAT_MAX_PER_MINUTE: 20,                 // 20 mensajes por minuto
  GREETING_MAX_PER_MINUTE: 5,              // 5 inicios por minuto
  TICKET_MAX_PER_HOUR: 3,                  // 3 tickets por hora
  
  // Sesiones
  SESSION_TTL: 48 * 60 * 60 * 1000,        // 48 horas (en ms)
  SESSION_INACTIVE_TIMEOUT: 30 * 60 * 1000, // 30 minutos inactividad
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000,    // 24 horas edad máxima
  MAX_CACHED_SESSIONS: 1000,               // Máximo en cache LRU
  SESSION_CLEANUP_INTERVAL: 10 * 60 * 1000, // Cada 10 minutos
  
  // CSRF Tokens
  CSRF_TTL: 60 * 60 * 1000,                // 1 hora
  CSRF_CLEANUP_INTERVAL: 30 * 60 * 1000,   // Cada 30 minutos
  
  // OpenAI
  OPENAI_TIMEOUT: 30000,                   // 30 segundos timeout
  OPENAI_MAX_RETRIES: 3,                   // 3 reintentos
  OPENAI_RETRY_DELAY: 1000,                // 1 segundo entre reintentos
  
  // Redis
  REDIS_MAX_RETRIES: 3,                    // 3 reintentos de conexión
  REDIS_RETRY_BASE_DELAY: 50,              // 50ms delay base
  REDIS_RETRY_MAX_DELAY: 2000,             // 2s delay máximo
  
  // Sharp (Image Processing)
  SHARP_MAX_CACHE_MEMORY: 50 * 1024 * 1024, // 50MB cache
  SHARP_CONCURRENCY: 2,                    // 2 imágenes en paralelo
  SHARP_RESIZE_MAX: 1920,                  // 1920px máximo
  SHARP_JPEG_QUALITY: 85,                  // 85% calidad JPEG
  SHARP_TIMEOUT: 10000,                    // 10s timeout processing
  
  // Logs
  MAX_LOG_CACHE: 1000,                     // 1000 interacciones en memoria
  LOG_FLUSH_INTERVAL: 100,                 // Flush cada 100ms
  LOG_ROTATION_SIZE: 50 * 1024 * 1024,     // Rotar a 50MB
  LOG_MAX_FILES: 10                        // Mantener 10 archivos rotados
};

// ========================================================
// ESTADOS DEL CHATBOT
// ========================================================
export const STATES = {
  INITIAL: 'INITIAL',
  ASK_LANGUAGE: 'ASK_LANGUAGE',
  ASK_NAME: 'ASK_NAME',
  ASK_AREA: 'ASK_AREA',
  ASK_DEVICE: 'ASK_DEVICE',
  ASK_PROBLEM: 'ASK_PROBLEM',
  ASK_DESCRIPTION: 'ASK_DESCRIPTION',
  SHOW_STEPS: 'SHOW_STEPS',
  ASK_WORKED: 'ASK_WORKED',
  ASK_CONTACT: 'ASK_CONTACT',
  ASK_CONTACT_CONFIRM: 'ASK_CONTACT_CONFIRM',
  TICKET_CREATED: 'TICKET_CREATED',
  ASK_MORE: 'ASK_MORE',
  GOODBYE: 'GOODBYE',
  PAUSED: 'PAUSED'
};

// ========================================================
// TOKENS DE BOTONES
// ========================================================
export const BUTTON_TOKENS = {
  // Idiomas
  SPANISH: 'BTN_ES',
  ENGLISH: 'BTN_EN',
  
  // Áreas
  HARDWARE: 'BTN_AREA_HARDWARE',
  SOFTWARE: 'BTN_AREA_SOFTWARE',
  NETWORK: 'BTN_AREA_NETWORK',
  ACCOUNT: 'BTN_AREA_ACCOUNT',
  PRINTER: 'BTN_AREA_PRINTER',
  OTHER: 'BTN_AREA_OTHER',
  
  // Respuestas
  YES: 'BTN_YES',
  NO: 'BTN_NO',
  
  // Navegación
  TICKET: 'BTN_TICKET',
  TRY_AGAIN: 'BTN_TRY_AGAIN',
  MORE_HELP: 'BTN_MORE_HELP',
  CANCEL: 'BTN_CANCEL',
  MORE_SIMPLE: 'BTN_MORE_SIMPLE'
};

// ========================================================
// CONFIGURACIÓN DE SEGURIDAD
// ========================================================
export const SECURITY = {
  // Headers HSTS
  HSTS_MAX_AGE: 63072000, // 2 años en segundos
  
  // CORS
  DEFAULT_ALLOWED_ORIGINS: [
    'https://stia.com.ar',
    'https://www.stia.com.ar'
  ],
  
  DEV_ALLOWED_ORIGINS: [
    'http://localhost:3004',
    'http://localhost:5173',
    'http://127.0.0.1:3004',
    'http://[::1]:3004'
  ],
  
  // CSP
  CSP_NONCE_LENGTH: 32,
  
  // Passwords en PII mask
  PASSWORD_PATTERNS: [
    /(?:password|pwd|pass|passw|passwd|clave|contraseña|contrasena|key|secret|token|auth)\s*[=:]\s*[^\s"']+/gi,
    /(?:api[_-]?key|access[_-]?token|bearer)\s*[=:]\s*[^\s"']+/gi
  ]
};

// ========================================================
// TIPOS DE ARCHIVO PERMITIDOS
// ========================================================
export const ALLOWED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  MIME_TO_EXT: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  }
};

// ========================================================
// CONFIGURACIÓN DE LOGGING
// ========================================================
export const LOGGING = {
  LEVELS: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    CRITICAL: 4
  },
  
  FORMATS: {
    CSV: 'csv',
    JSON: 'json',
    TEXT: 'text'
  },
  
  // Colores para console
  COLORS: {
    DEBUG: '\x1b[36m',    // Cyan
    INFO: '\x1b[32m',     // Green
    WARN: '\x1b[33m',     // Yellow
    ERROR: '\x1b[31m',    // Red
    CRITICAL: '\x1b[35m', // Magenta
    RESET: '\x1b[0m'
  }
};

// ========================================================
// MENSAJES DE ERROR
// ========================================================
export const ERROR_MESSAGES = {
  es: {
    RATE_LIMIT: 'Demasiados intentos. Por favor esperá un momento.',
    CSRF_INVALID: 'Token de seguridad inválido. Por favor recargá la página.',
    CSRF_EXPIRED: 'Sesión expirada. Por favor recargá la página.',
    SESSION_NOT_FOUND: 'Sesión no encontrada. Por favor iniciá una nueva conversación.',
    SESSION_EXPIRED: 'Tu sesión expiró por inactividad. Comenzá de nuevo.',
    UNAUTHORIZED: 'No autorizado para acceder a este recurso.',
    FILE_TOO_LARGE: 'El archivo es demasiado grande. Máximo 5MB.',
    FILE_TYPE_INVALID: 'Tipo de archivo no permitido. Solo imágenes JPG, PNG, GIF o WebP.',
    SERVER_ERROR: 'Error del servidor. Por favor intentá de nuevo más tarde.',
    OPENAI_TIMEOUT: 'La respuesta está tardando mucho. Por favor intentá de nuevo.'
  },
  en: {
    RATE_LIMIT: 'Too many attempts. Please wait a moment.',
    CSRF_INVALID: 'Invalid security token. Please reload the page.',
    CSRF_EXPIRED: 'Session expired. Please reload the page.',
    SESSION_NOT_FOUND: 'Session not found. Please start a new conversation.',
    SESSION_EXPIRED: 'Your session expired due to inactivity. Start again.',
    UNAUTHORIZED: 'Unauthorized to access this resource.',
    FILE_TOO_LARGE: 'File is too large. Maximum 5MB.',
    FILE_TYPE_INVALID: 'File type not allowed. Only JPG, PNG, GIF or WebP images.',
    SERVER_ERROR: 'Server error. Please try again later.',
    OPENAI_TIMEOUT: 'Response is taking too long. Please try again.'
  }
};

// ========================================================
// CONFIGURACIÓN DE NODE/EXPRESS
// ========================================================
export const SERVER = {
  DEFAULT_PORT: 3004,
  COMPRESSION_THRESHOLD: 1024,      // 1KB
  COMPRESSION_LEVEL: 6,             // Nivel gzip (0-9)
  JSON_LIMIT: '2mb',
  URLENCODED_LIMIT: '2mb',
  
  // Graceful shutdown
  SHUTDOWN_TIMEOUT: 10000,          // 10s para terminar conexiones
  
  // Health check
  HEALTH_CHECK_INTERVAL: 60000      // Check cada 1 minuto
};

// ========================================================
// MÉTRICAS Y MONITOREO
// ========================================================
export const METRICS = {
  // Umbrales de alerta
  ERROR_RATE_THRESHOLD: 0.05,       // 5% de requests con error
  LATENCY_P95_THRESHOLD: 2000,      // 2s latencia P95
  MEMORY_USAGE_THRESHOLD: 0.90,     // 90% memoria usada
  
  // Ventanas de tiempo
  METRICS_WINDOW: 60 * 60 * 1000,   // 1 hora
  METRICS_RETENTION: 24 * 60 * 60 * 1000 // 24 horas
};

export default {
  LIMITS,
  STATES,
  BUTTON_TOKENS,
  SECURITY,
  ALLOWED_FILE_TYPES,
  LOGGING,
  ERROR_MESSAGES,
  SERVER,
  METRICS
};
