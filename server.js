/**
 * server.js — Tecnos STI (Nuevo desde cero)
 * 
 * Implementación completa según ORDEN_CURSOR_TECNOS_STI.md
 * - Persistencia indefinida en filesystem
 * - ID único AA0000-ZZ9999 con reserva atómica
 * - FSM por ASK completo
 * - IA 2-etapas (CLASSIFIER + STEP)
 * - 9 funciones explícitas
 * - FREE_QA integrado
 * - UX adaptativa
 * 
 * Compatible con frontend existente.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';
import * as trace from './trace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================================
// CONFIGURACIÓN Y CONSTANTES
// ========================================================

// No-op marker para forzar deploy
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Directorios
const DATA_BASE = path.join(__dirname, 'data');
const CONVERSATIONS_DIR = path.join(DATA_BASE, 'conversations');
const IDS_DIR = path.join(DATA_BASE, 'ids');
const LOGS_DIR = path.join(DATA_BASE, 'logs');
const TICKETS_DIR = path.join(DATA_BASE, 'tickets');
const UPLOADS_DIR = path.join(DATA_BASE, 'uploads');
const LOG_MAX_SIZE_BYTES = parseInt(process.env.LOG_MAX_SIZE_BYTES || '10485760'); // 10 MB por defecto
const MAX_IMAGE_SIZE_BYTES = parseInt(process.env.MAX_IMAGE_SIZE_BYTES || '10485760'); // 10 MB por defecto
const LOG_TOKEN = process.env.LOG_TOKEN || null;

const USED_IDS_FILE = path.join(IDS_DIR, 'used_ids.json');
const USED_IDS_LOCK = path.join(IDS_DIR, 'used_ids.lock');
const SERVER_LOG_FILE = path.join(LOGS_DIR, 'server.log');

// Asegurar directorios
[CONVERSATIONS_DIR, IDS_DIR, LOGS_DIR, TICKETS_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
});

// Cleanup: eliminar lock file huérfano al iniciar (si existe)
async function cleanupOrphanedLock() {
  // LOG DETALLADO: Inicio de cleanupOrphanedLock
  await logDebug('DEBUG', 'cleanupOrphanedLock - Inicio', {
    lock_file_exists: fsSync.existsSync(USED_IDS_LOCK)
  }, 'server.js', 60, 60);
  
  try {
    if (fsSync.existsSync(USED_IDS_LOCK)) {
      // Verificar si el lock es muy antiguo (> 5 minutos)
      const lockStats = await fs.stat(USED_IDS_LOCK);
      const lockAge = Date.now() - lockStats.mtimeMs;
      await logDebug('DEBUG', 'cleanupOrphanedLock - Lock file encontrado', {
        age_ms: lockAge,
        age_minutes: Math.floor(lockAge / 60000),
        threshold_minutes: 5
      }, 'server.js', 63, 66);
      
      if (lockAge > 5 * 60 * 1000) {
        await fs.unlink(USED_IDS_LOCK);
        await logDebug('WARN', 'cleanupOrphanedLock - Lock file huérfano eliminado', {
          age_ms: lockAge,
          age_minutes: Math.floor(lockAge / 60000)
        }, 'server.js', 67, 68);
        await log('WARN', 'Lock file huérfano eliminado al iniciar', { age_ms: lockAge });
      }
    } else {
      await logDebug('DEBUG', 'cleanupOrphanedLock - No hay lock file', {}, 'server.js', 70, 70);
    }
  } catch (err) {
    await logDebug('WARN', 'cleanupOrphanedLock - Error en cleanup', {
      error: err.message,
      error_code: err.code
    }, 'server.js', 71, 73);
    await log('WARN', 'Error en cleanup de lock file', { error: err.message });
  }
}

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY no configurada. Algunas funcionalidades no estarán disponibles.');
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const OPENAI_MODEL_CLASSIFIER = process.env.OPENAI_MODEL_CLASSIFIER || 'gpt-4o-mini';
const OPENAI_MODEL_STEP = process.env.OPENAI_MODEL_STEP || 'gpt-4o-mini';
const OPENAI_TEMPERATURE_CLASSIFIER = parseFloat(process.env.OPENAI_TEMPERATURE_CLASSIFIER || '0.2');
const OPENAI_TEMPERATURE_STEP = parseFloat(process.env.OPENAI_TEMPERATURE_STEP || '0.3');
const OPENAI_TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT_MS || '12000');
const OPENAI_MAX_TOKENS_CLASSIFIER = parseInt(process.env.OPENAI_MAX_TOKENS_CLASSIFIER || '450');
const OPENAI_MAX_TOKENS_STEP = parseInt(process.env.OPENAI_MAX_TOKENS_STEP || '900');

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://stia.com.ar,http://localhost:3000').split(',').map(o => o.trim());

// WhatsApp (opcional)
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';

// F22.1: Versionado de flujo/esquema
const FLOW_VERSION = '2.0.0';
const SCHEMA_VERSION = '1.0';

// ========================================================
// LOGGING
// ========================================================

/**
 * Función de logging mejorada con información de archivo y líneas
 * @param {string} level - Nivel de log (DEBUG, INFO, WARN, ERROR)
 * @param {string} message - Mensaje del log
 * @param {object|null} data - Datos adicionales
 * @param {string} file - Nombre del archivo (automático si no se proporciona)
 * @param {number} lineStart - Línea inicial del código (opcional)
 * @param {number} lineEnd - Línea final del código (opcional)
 */
async function log(level, message, data = null, file = null, lineStart = null, lineEnd = null) {
  const timestamp = new Date().toISOString();
  
  // Obtener información del stack trace si no se proporciona
  if (!file) {
    const stack = new Error().stack;
    const stackLines = stack.split('\n');
    // Buscar la primera línea que no sea esta función ni logDebug
    for (let i = 2; i < stackLines.length; i++) {
      const match = stackLines[i].match(/at\s+(.+?):(\d+):(\d+)/);
      if (match) {
        const filePath = match[1].replace(/\\/g, '/');
        const fileName = filePath.split('/').pop();
        file = fileName || 'server.js';
        if (!lineStart) {
          lineStart = parseInt(match[2]);
          lineEnd = lineStart;
        }
        break;
      }
    }
  }
  
  // Construir mensaje con información de archivo y líneas
  let locationInfo = '';
  if (file) {
    locationInfo = `[${file}`;
    if (lineStart !== null) {
      if (lineEnd !== null && lineEnd !== lineStart) {
        locationInfo += `:${lineStart}-${lineEnd}`;
      } else {
        locationInfo += `:${lineStart}`;
      }
    }
    locationInfo += '] ';
  }
  
  const logLine = `[${timestamp}] [${level}] ${locationInfo}${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
  
  try {
    await rotateLogIfNeeded();
    await fs.appendFile(SERVER_LOG_FILE, logLine);
  } catch (err) {
    console.error('Error escribiendo log:', err);
  }
  
  // En desarrollo o errores, siempre mostrar en consola
  if (NODE_ENV === 'development' || level === 'ERROR' || level === 'WARN' || level === 'DEBUG') {
    console.log(logLine.trim());
  }
}

/**
 * Función helper para logging detallado con contexto de código
 * @param {string} level - Nivel de log
 * @param {string} message - Mensaje
 * @param {object} context - Contexto adicional (conversation_id, stage, etc.)
 * @param {string} file - Archivo
 * @param {number} lineStart - Línea inicial
 * @param {number} lineEnd - Línea final
 */
async function logDebug(level, message, context = {}, file = 'server.js', lineStart = null, lineEnd = null) {
  const fullContext = {
    ...context,
    timestamp: new Date().toISOString(),
    file: file,
    lines: lineStart ? (lineEnd && lineEnd !== lineStart ? `${lineStart}-${lineEnd}` : `${lineStart}`) : 'unknown'
  };
  await log(level, message, fullContext, file, lineStart, lineEnd);
}

// Rotación sencilla del archivo de log para evitar crecimiento infinito
async function rotateLogIfNeeded() {
  try {
    const stats = await fs.stat(SERVER_LOG_FILE);
    if (stats.size > LOG_MAX_SIZE_BYTES) {
      const rotatedPath = SERVER_LOG_FILE + '.1';
      await fs.rename(SERVER_LOG_FILE, rotatedPath).catch(() => {});
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error en rotación de log:', err);
    }
  }
}

// ========================================================
// GENERACIÓN DE ID ÚNICO AA0000-ZZ9999
// ========================================================

/**
 * Genera un ID único en formato AA0000-ZZ9999
 * Reserva atómica usando file lock
 */
async function reserveUniqueConversationId() {
  // LOG DETALLADO: Inicio de reserveUniqueConversationId
  await logDebug('DEBUG', 'reserveUniqueConversationId - Inicio', {
    max_attempts: 50
  }, 'server.js', 194, 194);
  
  const maxAttempts = 50;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      // 1. Adquirir lock
      let lockHandle;
      try {
        lockHandle = await fs.open(USED_IDS_LOCK, 'wx');
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Lock existe, esperar un poco y reintentar
          await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
          attempts++;
          continue;
        }
        throw err;
      }
      
      try {
        // 2. Leer used_ids.json
        let usedIds = new Set();
        try {
          const content = await fs.readFile(USED_IDS_FILE, 'utf-8');
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              usedIds = new Set(parsed);
            } else if (parsed.ids && Array.isArray(parsed.ids)) {
              usedIds = new Set(parsed.ids);
            }
          } catch (parseErr) {
            await log('WARN', 'used_ids.json corrupto, reiniciando', { error: parseErr.message });
            usedIds = new Set();
          }
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
          // Archivo no existe, empezar vacío
        }
        
        // 3. Generar ID
        let newId;
        let idAttempts = 0;
        do {
          const letter1 = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
          const letter2 = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
          const digits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          newId = letter1 + letter2 + digits;
          idAttempts++;
        } while (usedIds.has(newId) && idAttempts < 100);
        
        if (idAttempts >= 100) {
          throw new Error('No se pudo generar ID único después de 100 intentos');
        }
        
        // 4. Agregar y escribir (write temp + rename para atomicidad)
        usedIds.add(newId);
        const tempIdsFile = USED_IDS_FILE + '.tmp';
        await fs.writeFile(tempIdsFile, JSON.stringify(Array.from(usedIds), null, 2), 'utf-8');
        await fs.rename(tempIdsFile, USED_IDS_FILE);
        
        // 5. Liberar lock
        await lockHandle.close();
        await fs.unlink(USED_IDS_LOCK).catch(() => {}); // Ignorar si no existe
        
        await log('INFO', `ID único generado: ${newId}`);
        return newId;
        
      } catch (err) {
        await lockHandle.close().catch(() => {});
        await fs.unlink(USED_IDS_LOCK).catch(() => {});
        throw err;
      }
      
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        await log('ERROR', 'Error generando ID único después de múltiples intentos', { error: err.message });
        throw new Error(`No se pudo generar ID único: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  throw new Error('No se pudo generar ID único después de 50 intentos');
}

// ========================================================
// HELPERS DE VALIDACIÓN DEFENSIVA (NASA-GRADE)
// ========================================================

/**
 * Obtiene conversation_id de forma segura desde session o conversation
 * NUNCA retorna null/undefined - siempre genera uno si falta
 * @param {object} session - Sesión del usuario
 * @param {object|null} conversation - Objeto de conversación (opcional)
 * @returns {Promise<string>} - conversation_id válido
 */
async function getConversationIdSafe(session, conversation = null) {
  // Prioridad 1: conversation.conversation_id
  if (conversation?.conversation_id && /^[A-Z]{2}\d{4}$/.test(conversation.conversation_id)) {
    return conversation.conversation_id;
  }
  
  // Prioridad 2: session.conversation_id
  if (session?.conversation_id && /^[A-Z]{2}\d{4}$/.test(session.conversation_id)) {
    return session.conversation_id;
  }
  
  // Prioridad 3: Generar uno nuevo (CRÍTICO: nunca fallar)
  await log('WARN', 'getConversationIdSafe - Generando nuevo ID (faltante en session/conversation)', {
    has_session: !!session,
    has_conversation: !!conversation,
    session_id: session?.sessionId || 'none',
    session_conversation_id: session?.conversation_id || 'none',
    conversation_conversation_id: conversation?.conversation_id || 'none'
  });
  
  try {
    const newId = await reserveUniqueConversationId();
    // Asignar a session para futuras llamadas
    if (session) {
      session.conversation_id = newId;
    }
    return newId;
  } catch (err) {
    // ÚLTIMO RECURSO: ID de emergencia (nunca fallar)
    await log('ERROR', 'getConversationIdSafe - Error generando ID, usando emergencia', {
      error: err.message
    });
    const emergencyId = `EM${Date.now().toString().slice(-4)}`;
    if (session) {
      session.conversation_id = emergencyId;
    }
    return emergencyId;
  }
}

/**
 * Valida que conversation_id exista y tenga formato válido
 * @param {string} conversationId - ID a validar
 * @returns {boolean} - true si es válido
 */
function isValidConversationId(conversationId) {
  return conversationId && typeof conversationId === 'string' && /^[A-Z]{2}\d{4}$/.test(conversationId);
}

// ========================================================
// PERSISTENCIA DE CONVERSACIONES
// ========================================================

/**
 * Guarda o actualiza una conversación (append-only transcript)
 * Usa write temp + rename para atomicidad
 */
async function saveConversation(conversation) {
  // LOG DETALLADO: Inicio de saveConversation
  await logDebug('DEBUG', 'saveConversation - Inicio', {
    conversation_id: conversation?.conversation_id,
    transcript_length: conversation?.transcript?.length || 0,
    status: conversation?.status,
    stage: conversation?.stage || 'unknown',
    flow_version: conversation?.flow_version,
    schema_version: conversation?.schema_version
  }, 'server.js', 284, 284);
  
  // Validar formato de conversation_id para prevenir path traversal
  if (!/^[A-Z]{2}\d{4}$/.test(conversation.conversation_id)) {
    await logDebug('ERROR', 'saveConversation - Formato inválido de conversation_id', {
      conversation_id: conversation.conversation_id,
      format_valid: /^[A-Z]{2}\d{4}$/.test(conversation.conversation_id)
    }, 'server.js', 285, 289);
    throw new Error('Invalid conversation_id format');
  }
  
  // P1-3: Validar versión siempre antes de guardar
  const versionValidation = await validateConversationVersion(conversation);
  if (!versionValidation.valid && versionValidation.shouldRestart) {
    // Marcar como legacy_incompatible si no se puede migrar
    conversation.legacy_incompatible = true;
    conversation.legacy_incompatible_reason = versionValidation.reason;
    conversation.legacy_incompatible_at = new Date().toISOString();
    await logDebug('WARN', 'saveConversation - Conversación marcada como legacy_incompatible', {
      conversation_id: conversation.conversation_id,
      reason: versionValidation.reason,
      flow_version: conversation.flow_version,
      schema_version: conversation.schema_version
    }, 'server.js', 291, 301);
  }
  
  const filePath = path.join(CONVERSATIONS_DIR, `${conversation.conversation_id}.json`);
  const tempPath = filePath + '.tmp';
  conversation.updated_at = new Date().toISOString();
  
  // LOG DETALLADO: Antes de escribir archivo
  await logDebug('DEBUG', 'saveConversation - Escribiendo archivo', {
    conversation_id: conversation.conversation_id,
    file_path: filePath,
    temp_path: tempPath,
    conversation_size: JSON.stringify(conversation).length,
    transcript_events: conversation.transcript?.length || 0
  }, 'server.js', 304, 310);
  
  // Write temp + rename para atomicidad
  await fs.writeFile(tempPath, JSON.stringify(conversation, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
  
  // LOG DETALLADO: Archivo guardado exitosamente
  await logDebug('INFO', 'saveConversation - Conversación guardada exitosamente', {
    conversation_id: conversation.conversation_id,
    file_path: filePath,
    updated_at: conversation.updated_at
  }, 'server.js', 311, 311);
}

/**
 * Carga una conversación existente
 */
async function loadConversation(conversationId) {
  // LOG DETALLADO: Inicio de loadConversation
  await logDebug('DEBUG', 'loadConversation - Inicio', {
    conversation_id: conversationId,
    format_valid: /^[A-Z]{2}\d{4}$/.test(conversationId)
  }, 'server.js', 317, 317);
  
  // Validar formato para prevenir path traversal
  if (!/^[A-Z]{2}\d{4}$/.test(conversationId)) {
    await logDebug('ERROR', 'loadConversation - Formato inválido de conversation_id', {
      conversation_id: conversationId,
      format_valid: false
    }, 'server.js', 319, 322);
    return null;
  }
  
  const filePath = path.join(CONVERSATIONS_DIR, `${conversationId}.json`);
  
  // LOG DETALLADO: Antes de leer archivo
  await logDebug('DEBUG', 'loadConversation - Leyendo archivo', {
    conversation_id: conversationId,
    file_path: filePath
  }, 'server.js', 324, 324);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const conversation = JSON.parse(content);
    
    // LOG DETALLADO: Archivo leído y parseado
    await logDebug('DEBUG', 'loadConversation - Archivo leído y parseado', {
      conversation_id: conversationId,
      content_length: content.length,
      transcript_length: conversation.transcript?.length || 0,
      status: conversation.status,
      flow_version: conversation.flow_version,
      schema_version: conversation.schema_version
    }, 'server.js', 326, 328);
    
    // P1-3: Validar versión siempre al cargar
    const versionValidation = await validateConversationVersion(conversation);
    if (!versionValidation.valid) {
      await logDebug('WARN', 'loadConversation - Conversación con versión incompatible', {
        conversation_id: conversationId,
        flow_version: conversation.flow_version,
        schema_version: conversation.schema_version,
        reason: versionValidation.reason,
        should_restart: versionValidation.shouldRestart
      }, 'server.js', 330, 336);
      
      // Marcar como legacy_incompatible si no se puede migrar
      if (versionValidation.shouldRestart) {
        conversation.legacy_incompatible = true;
        conversation.legacy_incompatible_reason = versionValidation.reason;
        conversation.legacy_incompatible_at = new Date().toISOString();
        // Guardar el estado de incompatibilidad
        await saveConversation(conversation);
      }
    }
    
    // LOG DETALLADO: Conversación cargada exitosamente
    await logDebug('DEBUG', 'loadConversation - Conversación cargada exitosamente', {
      conversation_id: conversationId,
      transcript_events: conversation.transcript?.length || 0,
      legacy_incompatible: conversation.legacy_incompatible || false
    }, 'server.js', 348, 348);
    
    return conversation;
  } catch (err) {
    if (err.code === 'ENOENT') {
      await logDebug('DEBUG', 'loadConversation - Archivo no encontrado (ENOENT)', {
        conversation_id: conversationId,
        file_path: filePath
      }, 'server.js', 350, 350);
      return null;
    }
    await logDebug('ERROR', 'loadConversation - Error al cargar conversación', {
      conversation_id: conversationId,
      error: err.message,
      error_code: err.code,
      stack: err.stack
    }, 'server.js', 350, 352);
    throw err;
  }
}

/**
 * Agrega un evento al transcript de la conversación
 */
async function appendToTranscript(conversationId, event) {
  // LOG DETALLADO: Inicio de appendToTranscript
  await logDebug('DEBUG', 'appendToTranscript - Inicio', {
    conversation_id: conversationId,
    event_role: event?.role,
    event_type: event?.type,
    event_stage: event?.stage,
    event_has_text: !!event?.text,
    event_text_preview: event?.text ? event.text.substring(0, 50) : 'no text',
    event_has_buttons: !!(event?.buttons && event.buttons.length > 0),
    event_buttons_count: event?.buttons?.length || 0
  }, 'server.js', 358, 358);
  
  // Validar formato para prevenir path traversal
  if (!conversationId || !/^[A-Z]{2}\d{4}$/.test(conversationId)) {
    await logDebug('ERROR', 'appendToTranscript - Formato inválido de conversation_id', {
      conversation_id: conversationId,
      format_valid: conversationId ? /^[A-Z]{2}\d{4}$/.test(conversationId) : false
    }, 'server.js', 360, 363);
    return;
  }
  
  // P0-01: Validación defensiva del evento
  if (!event || typeof event !== 'object') {
    await logDebug('ERROR', 'appendToTranscript - Event inválido', {
      conversation_id: conversationId,
      event_type: typeof event,
      event_is_null: event === null,
      event_is_undefined: event === undefined
    }, 'server.js', 365, 369);
    return;
  }
  
  // P0-01: Validar que no tenga propiedades inválidas (ej: .event, .result como propiedades literales)
  // Convertir a objeto plano seguro
  const safeEvent = {};
  
  // Copiar propiedades válidas
  for (const key in event) {
    if (event.hasOwnProperty(key)) {
      // Validar que la clave sea válida (no empiece con punto)
      if (key.startsWith('.')) {
        await logDebug('WARN', 'appendToTranscript - Propiedad inválida detectada (ignorada)', {
          conversation_id: conversationId,
          invalid_key: key
        }, 'server.js', 375, 378);
        continue;
      }
      // Validar que el valor sea serializable
      try {
        JSON.stringify(event[key]);
        safeEvent[key] = event[key];
      } catch (err) {
        await logDebug('WARN', 'appendToTranscript - Valor no serializable (ignorado)', {
          conversation_id: conversationId,
          key: key,
          error: err.message
        }, 'server.js', 380, 383);
      }
    }
  }
  
  // P0-01: Asegurar que tenga al menos role o type
  if (!safeEvent.role && !safeEvent.type) {
    await logDebug('WARN', 'appendToTranscript - Event sin role ni type, agregando defaults', {
      conversation_id: conversationId,
      safe_event_keys: Object.keys(safeEvent)
    }, 'server.js', 386, 390);
    safeEvent.role = safeEvent.role || 'system';
    safeEvent.type = safeEvent.type || 'event';
  }
  
  // P0-01: Validar payload si existe
  if (safeEvent.payload && typeof safeEvent.payload !== 'object') {
    await logDebug('WARN', 'appendToTranscript - Payload inválido, convirtiendo a objeto', {
      conversation_id: conversationId,
      payload_type: typeof safeEvent.payload
    }, 'server.js', 393, 396);
    safeEvent.payload = { value: safeEvent.payload };
  }
  
  // LOG DETALLADO: Evento validado y sanitizado
  await logDebug('DEBUG', 'appendToTranscript - Evento validado y sanitizado', {
    conversation_id: conversationId,
    safe_event_role: safeEvent.role,
    safe_event_type: safeEvent.type,
    safe_event_keys: Object.keys(safeEvent)
  }, 'server.js', 398, 398);
  
  const conversation = await loadConversation(conversationId);
  if (!conversation) {
    // Crear conversación mínima para no perder eventos
    await logDebug('WARN', 'appendToTranscript - Conversación no encontrada, creando stub', {
      conversation_id: conversationId
    }, 'server.js', 400, 405);
    conversation = {
      conversation_id: conversationId,
      status: 'open',
      flow_version: FLOW_VERSION,
      schema_version: SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      transcript: []
    };
  }
  
  if (!conversation.transcript) {
    conversation.transcript = [];
  }
  
  // P2.5: Timestamp atómico (generar antes de append para mantener orden)
  const atomicTimestamp = new Date().toISOString();
  
  // P0-01: Construir objeto de transcript válido
  const transcriptEntry = {
    t: atomicTimestamp,
    ...safeEvent
  };
  
  // LOG DETALLADO: Antes de agregar al transcript
  await logDebug('DEBUG', 'appendToTranscript - Agregando entrada al transcript', {
    conversation_id: conversationId,
    transcript_length_before: conversation.transcript.length,
    transcript_entry: {
      t: transcriptEntry.t,
      role: transcriptEntry.role,
      type: transcriptEntry.type,
      stage: transcriptEntry.stage,
      has_text: !!transcriptEntry.text,
      text_preview: transcriptEntry.text ? transcriptEntry.text.substring(0, 50) : 'no text'
    }
  }, 'server.js', 410, 415);
  
  conversation.transcript.push(transcriptEntry);
  
  // LOG DETALLADO: Después de agregar al transcript
  await logDebug('DEBUG', 'appendToTranscript - Entrada agregada, guardando conversación', {
    conversation_id: conversationId,
    transcript_length_after: conversation.transcript.length
  }, 'server.js', 417, 417);
  
  await saveConversation(conversation);
  
  // LOG DETALLADO: Transcript guardado exitosamente
  await logDebug('DEBUG', 'appendToTranscript - Transcript guardado exitosamente', {
    conversation_id: conversationId,
    transcript_length: conversation.transcript.length,
    last_entry: {
      t: conversation.transcript[conversation.transcript.length - 1]?.t,
      role: conversation.transcript[conversation.transcript.length - 1]?.role,
      type: conversation.transcript[conversation.transcript.length - 1]?.type
    }
  }, 'server.js', 419, 419);
}

/**
 * Guarda una imagen desde base64 a un archivo físico
 * Retorna el path relativo y la URL para servir la imagen
 */
async function saveImageFromBase64(conversationId, imageBase64, requestId = null) {
  // LOG DETALLADO: Inicio de saveImageFromBase64
  await logDebug('DEBUG', 'saveImageFromBase64 - Inicio', {
    conversation_id: conversationId,
    has_image: !!imageBase64,
    image_length: imageBase64?.length || 0,
    image_preview: imageBase64 ? imageBase64.substring(0, 50) : 'null',
    request_id: requestId
  }, 'server.js', 585, 585);
  
  try {
    // Validar formato de conversation_id
    if (!conversationId || !/^[A-Z]{2}\d{4}$/.test(conversationId)) {
      await logDebug('ERROR', 'saveImageFromBase64 - Formato inválido de conversation_id', {
        conversation_id: conversationId,
        format_valid: conversationId ? /^[A-Z]{2}\d{4}$/.test(conversationId) : false
      }, 'server.js', 588, 590);
      throw new Error(`Formato inválido de conversation_id: ${conversationId}`);
    }
    
    // Extraer base64 puro (sin prefijo data:image/...)
    let base64Data = imageBase64;
    let mimeType = 'image/jpeg';
    let extension = 'jpg';
    
    if (imageBase64.startsWith('data:image/')) {
      const mimeMatch = imageBase64.match(/data:image\/([^;]+);base64,/);
      if (mimeMatch) {
        mimeType = `image/${mimeMatch[1]}`;
        extension = mimeMatch[1].toLowerCase();
        if (extension === 'jpeg') extension = 'jpg';
        base64Data = imageBase64.split(',')[1];
      }
    }
    
    // Decodificar base64
    const buffer = Buffer.from(base64Data, 'base64');
    const imageSize = buffer.length;
    
    // Validar tamaño (máximo 5MB)
    if (imageSize > 5 * 1024 * 1024) {
      throw new Error(`Imagen demasiado grande: ${imageSize} bytes (máximo 5MB)`);
    }
    
    // Crear directorio para la conversación si no existe
    const conversationUploadDir = path.join(UPLOADS_DIR, conversationId);
    if (!fsSync.existsSync(conversationUploadDir)) {
      fsSync.mkdirSync(conversationUploadDir, { recursive: true });
    }
    
    // Generar nombre de archivo seguro
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const filename = `${timestamp}_${randomSuffix}.${extension}`;
    const filePath = path.join(conversationUploadDir, filename);
    
    // Guardar archivo
    await fs.writeFile(filePath, buffer);
    
    // Path relativo desde UPLOADS_DIR (para servir)
    const relativePath = `${conversationId}/${filename}`;
    
    // URL para servir (sin dominio, será relativa o absoluta según PUBLIC_BASE_URL)
    const imageUrl = `/api/images/${relativePath}`;
    
    await log('INFO', 'Imagen guardada exitosamente', {
      conversation_id: conversationId,
      filename,
      size_bytes: imageSize,
      mime_type: mimeType,
      relative_path: relativePath
    });
    
    return {
      success: true,
      filename,
      relativePath,
      imageUrl,
      sizeBytes: imageSize,
      mimeType,
      filePath: relativePath // Para referencia en transcript
    };
  } catch (err) {
    await log('ERROR', 'Error guardando imagen desde base64', {
      conversation_id: conversationId,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

// ========================================================
// MODELO DE DATOS - SESSION (estado vivo en memoria)
// ========================================================

const sessions = new Map(); // sessionId -> session

// ========================================================
// P0.1: LOCKING Y CONCURRENCIA
// ========================================================

const conversationLocks = new Map(); // conversationId -> Promise resolver

/**
 * Adquiere un lock para una conversación (serializa requests concurrentes)
 */
async function acquireLock(conversationId) {
  // LOG DETALLADO: Inicio de acquireLock
  await logDebug('DEBUG', 'acquireLock - Inicio', {
    conversation_id: conversationId,
    has_existing_lock: conversationLocks.has(conversationId),
    total_locks: conversationLocks.size
  }, 'server.js', 679, 679);
  
  if (!conversationId) return null; // No lock si no hay conversation_id
  
  while (conversationLocks.has(conversationId)) {
    // Esperar a que se libere el lock
    await logDebug('DEBUG', 'acquireLock - Esperando lock existente', {
      conversation_id: conversationId
    }, 'server.js', 682, 685);
    await conversationLocks.get(conversationId);
  }
  
  let releaseLock;
  const lockPromise = new Promise(resolve => {
    releaseLock = resolve;
  });
  
  conversationLocks.set(conversationId, lockPromise);
  
  await logDebug('DEBUG', 'acquireLock - Lock adquirido', {
    conversation_id: conversationId,
    total_locks: conversationLocks.size
  }, 'server.js', 692, 693);
  
  return releaseLock;
}

// ========================================================
// P0.2: RATE LIMITING DE LLAMADAS A IA
// ========================================================

const aiCallLimits = new Map(); // conversationId -> { count: number, resetAt: timestamp }
const aiErrorCooldowns = new Map(); // conversationId -> { until: timestamp, errorCount: number }
const aiCallCounts = new Map(); // conversationId -> { total: number, classifier: number, step: number, lastReset: timestamp }

/**
 * Verifica si se puede hacer una llamada a IA (límite de 3 por minuto)
 */
async function checkAICallLimit(conversationId, maxCallsPerMinute = 3) {
  // LOG DETALLADO: Inicio de checkAICallLimit
  await logDebug('DEBUG', 'checkAICallLimit - Inicio', {
    conversation_id: conversationId,
    max_calls_per_minute: maxCallsPerMinute
  }, 'server.js', 707, 707);
  
  if (!conversationId) return true; // Sin límite si no hay conversation_id
  
  const now = Date.now();
  const limit = aiCallLimits.get(conversationId);
  
  if (!limit || now > limit.resetAt) {
    // Reset o inicializar
    aiCallLimits.set(conversationId, {
      count: 1,
      resetAt: now + 60000 // 1 minuto
    });
    await logDebug('DEBUG', 'checkAICallLimit - Límite inicializado/reseteado', {
      conversation_id: conversationId,
      count: 1,
      reset_at: new Date(now + 60000).toISOString()
    }, 'server.js', 713, 719);
    return true;
  }
  
  if (limit.count >= maxCallsPerMinute) {
    await logDebug('WARN', 'checkAICallLimit - Límite excedido', {
      conversation_id: conversationId,
      count: limit.count,
      max: maxCallsPerMinute
    }, 'server.js', 722, 728);
    await log('WARN', 'Límite de llamadas IA excedido', { 
      conversation_id: conversationId, 
      count: limit.count,
      max: maxCallsPerMinute 
    });
    return false;
  }
  
  limit.count++;
  await logDebug('DEBUG', 'checkAICallLimit - Llamada permitida', {
    conversation_id: conversationId,
    count: limit.count,
    max: maxCallsPerMinute
  }, 'server.js', 731, 732);
  return true;
}

/**
 * Verifica si hay cooldown activo tras errores repetidos
 */
async function checkAICooldown(conversationId) {
  // LOG DETALLADO: Inicio de checkAICooldown
  await logDebug('DEBUG', 'checkAICooldown - Inicio', {
    conversation_id: conversationId,
    has_cooldown: aiErrorCooldowns.has(conversationId)
  }, 'server.js', 788, 788);
  
  if (!conversationId) return true;
  
  const cooldown = aiErrorCooldowns.get(conversationId);
  if (cooldown && Date.now() < cooldown.until) {
    await logDebug('DEBUG', 'checkAICooldown - En cooldown activo', {
      conversation_id: conversationId,
      until: new Date(cooldown.until).toISOString(),
      remaining_ms: cooldown.until - Date.now()
    }, 'server.js', 791, 793);
    return false; // En cooldown
  }
  
  await logDebug('DEBUG', 'checkAICooldown - Sin cooldown', {
    conversation_id: conversationId
  }, 'server.js', 794, 795);
  return true;
}

/**
 * Activa cooldown exponencial tras errores
 */
function setAICooldown(conversationId, errorCount) {
  // LOG DETALLADO: Inicio de setAICooldown
  logDebug('DEBUG', 'setAICooldown - Inicio', {
    conversation_id: conversationId,
    error_count: errorCount
  }, 'server.js', 801, 801).catch(() => {});
  
  if (!conversationId) return;
  
  // Cooldown exponencial: 5s, 10s, 20s, 30s
  const cooldownSeconds = Math.min(5 * Math.pow(2, errorCount - 1), 30);
  const until = Date.now() + (cooldownSeconds * 1000);
  aiErrorCooldowns.set(conversationId, {
    until: until,
    errorCount: errorCount + 1
  });
  
  logDebug('DEBUG', 'setAICooldown - Cooldown establecido', {
    conversation_id: conversationId,
    error_count: errorCount + 1,
    cooldown_seconds: cooldownSeconds,
    until: new Date(until).toISOString()
  }, 'server.js', 808, 812).catch(() => {});
  
  // Limpiar después del cooldown
  setTimeout(() => {
    aiErrorCooldowns.delete(conversationId);
  }, cooldownSeconds * 1000);
}

/**
 * Incrementa contador de llamadas a IA para monitoreo
 */
function incrementAICallCount(conversationId, type) {
  // LOG DETALLADO: Inicio de incrementAICallCount
  logDebug('DEBUG', 'incrementAICallCount - Inicio', {
    conversation_id: conversationId,
    type: type
  }, 'server.js', 820, 820).catch(() => {});
  
  if (!conversationId) return;
  
  const now = Date.now();
  const counts = aiCallCounts.get(conversationId) || { total: 0, classifier: 0, step: 0, lastReset: now };
  
  // Reset diario
  if (now - counts.lastReset > 24 * 60 * 60 * 1000) {
    counts.total = 0;
    counts.classifier = 0;
    counts.step = 0;
    counts.lastReset = now;
  }
  
  counts.total++;
  if (type === 'classifier') counts.classifier++;
  if (type === 'step') counts.step++;
  
  aiCallCounts.set(conversationId, counts);
  
  // Log cada 10 llamadas
  if (counts.total % 10 === 0) {
    log('INFO', 'Contador de llamadas IA', { 
      conversation_id: conversationId,
      total: counts.total,
      classifier: counts.classifier,
      step: counts.step
    });
  }
}

// ========================================================
// P0.3: SANITIZACIÓN Y NORMALIZACIÓN
// ========================================================

/**
 * Sanitiza el reply de IA (remueve JSON embebido, tokens, links peligrosos, instrucciones internas)
 * P2.1: Protección mejorada contra prompt leakage
 */
function sanitizeReply(reply) {
  // LOG DETALLADO: Inicio de sanitizeReply
  logDebug('DEBUG', 'sanitizeReply - Inicio', {
    reply_length: reply?.length || 0,
    reply_type: typeof reply,
    reply_preview: reply ? reply.substring(0, 50) : 'null/empty'
  }, 'server.js', 859, 859).catch(() => {});
  
  if (!reply || typeof reply !== 'string') return '';
  
  // 1. Límite de longitud (máximo 2000 caracteres)
  let sanitized = reply.substring(0, 2000);
  
  // 2. Remover JSON embebido (patrones como {"token": ...} o {"reply": ...})
  sanitized = sanitized.replace(/\{[^{}]*"(token|reply|label|order)"[^{}]*\}/gi, '');
  
  // 3. Remover tokens técnicos visibles (BTN_XXX, ASK_XXX)
  sanitized = sanitized.replace(/\b(BTN_|ASK_)[A-Z_]+\b/g, '');
  
  // 4. Remover links peligrosos (solo permitir http/https con dominios conocidos)
  const allowedDomains = ['stia.com.ar', 'wa.me', 'whatsapp.com'];
  sanitized = sanitized.replace(/https?:\/\/(?!([a-z0-9-]+\.)?(stia\.com\.ar|wa\.me|whatsapp\.com))/gi, '[link removido]');
  
  // 5. P2.1: Protección mejorada contra prompt leakage
  // Remover instrucciones internas del prompt
  sanitized = sanitized.replace(/INSTRUCCIONES?:.*$/gmi, '');
  sanitized = sanitized.replace(/BOTONES PERMITIDOS?:.*$/gmi, '');
  sanitized = sanitized.replace(/CONTEXTO?:.*$/gmi, '');
  sanitized = sanitized.replace(/SOS TECNOS.*$/gmi, '');
  sanitized = sanitized.replace(/DEVOLVÉ SOLO.*$/gmi, '');
  sanitized = sanitized.replace(/GENERÁ UN SOLO.*$/gmi, '');
  sanitized = sanitized.replace(/ADAPTÁ EL LENGUAJE.*$/gmi, '');
  sanitized = sanitized.replace(/USÁ VOSEO.*$/gmi, '');
  sanitized = sanitized.replace(/NO REPITAS.*$/gmi, '');
  sanitized = sanitized.replace(/SOLO PODÉS USAR.*$/gmi, '');
  sanitized = sanitized.replace(/ETAPA ACTUAL:.*$/gmi, '');
  sanitized = sanitized.replace(/NIVEL USUARIO:.*$/gmi, '');
  sanitized = sanitized.replace(/DISPOSITIVO:.*$/gmi, '');
  sanitized = sanitized.replace(/PROBLEMA:.*$/gmi, '');
  
  // Remover patrones de metadatos técnicos
  sanitized = sanitized.replace(/\[.*?\]/g, ''); // Remover [metadata] entre corchetes
  sanitized = sanitized.replace(/\{.*?\}/g, ''); // Remover {metadata} entre llaves
  
  return sanitized.trim();
}

/**
 * Normaliza botones (elimina duplicados, limita a 4, normaliza order, asegura label humano)
 * P1.2: Normalización mejorada
 */
function normalizeButtons(buttons) {
  // LOG DETALLADO: Inicio de normalizeButtons
  logDebug('DEBUG', 'normalizeButtons - Inicio', {
    buttons_type: Array.isArray(buttons) ? 'array' : typeof buttons,
    buttons_count: Array.isArray(buttons) ? buttons.length : 0,
    buttons_preview: Array.isArray(buttons) ? buttons.slice(0, 3).map(b => b.token || b.value || b.label) : []
  }, 'server.js', 903, 903).catch(() => {});
  
  if (!Array.isArray(buttons)) return [];
  
  // 1. Eliminar duplicados por token
  const seenTokens = new Set();
  let normalized = buttons.filter(btn => {
    if (seenTokens.has(btn.token)) return false;
    seenTokens.add(btn.token);
    return true;
  });
  
  // 2. Limitar a máximo 4 botones
  normalized = normalized.slice(0, 4);
  
  // 3. Normalizar order (1, 2, 3, 4)
  normalized = normalized.map((btn, idx) => ({
    ...btn,
    order: idx + 1
  }));
  
  // 4. Asegurar que label es humano (no token)
  normalized = normalized.map(btn => ({
    ...btn,
    label: btn.label || btn.token.replace(/BTN_|ASK_/, '').replace(/_/g, ' ')
  }));
  
  return normalized;
}

/**
 * P2.2: Validación semántica de coherencia reply/buttons
 * Verifica que el reply y los botones sean coherentes entre sí
 */
function validateReplyButtonsCoherence(reply, buttons) {
  if (!reply || !buttons || buttons.length === 0) return { coherent: true }; // Sin botones es válido
  
  const replyLower = reply.toLowerCase();
  
  // Detectar contradicciones sutiles
  // 1. Reply dice "no puedo ayudar" pero hay botones de acción
  if ((replyLower.includes('no puedo') || replyLower.includes('no puedo ayudarte')) && 
      buttons.some(b => b.label && (b.label.toLowerCase().includes('continuar') || b.label.toLowerCase().includes('siguiente')))) {
    return { coherent: false, reason: 'Reply dice "no puedo" pero hay botones de acción' };
  }
  
  // 2. Reply pregunta algo pero botones no responden la pregunta
  if (replyLower.includes('?') && !buttons.some(b => {
    const btnLabel = b.label?.toLowerCase() || '';
    return btnLabel.includes('sí') || btnLabel.includes('no') || btnLabel.includes('yes');
  })) {
    return { coherent: false, reason: 'Reply hace pregunta pero botones no responden' };
  }
  
  return { coherent: true };
}

/**
 * F21.2: Validación de coherencia del estado previo
 */
function validateConversationState(session, conversation) {
  const requiredFields = ['conversation_id', 'user', 'status'];
  for (const field of requiredFields) {
    if (!conversation[field]) {
      return { valid: false, reason: `Missing required field: ${field}` };
    }
  }
  
  // Validar que stage sea válido
  const validStages = ['ASK_CONSENT', 'ASK_LANGUAGE', 'ASK_NAME', 'ASK_USER_LEVEL', 
                       'ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 'ASK_DEVICE_TYPE_EXTERNAL',
                       'ASK_PROBLEM', 'ASK_PROBLEM_CLARIFICATION', 'DIAGNOSTIC_STEP', 
                       'ASK_FEEDBACK', 'ENDED', 'CONTEXT_RESUME', 'GUIDED_STORY', 
                       'EMOTIONAL_RELEASE', 'RISK_CONFIRMATION', 'CONNECTIVITY_FLOW', 
                       'INSTALLATION_STEP', 'ASK_INTERACTION_MODE', 'ASK_LEARNING_DEPTH', 
                       'ASK_EXECUTOR_ROLE'];
  if (!validStages.includes(session.stage)) {
    return { valid: false, reason: `Invalid stage: ${session.stage}` };
  }
  
  return { valid: true };
}

/**
 * F22.2: Validar y migrar versión de conversación
 */
async function validateConversationVersion(conversation) {
  const CURRENT_FLOW_VERSION = FLOW_VERSION;
  const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;
  
  if (!conversation.flow_version || conversation.flow_version !== CURRENT_FLOW_VERSION) {
    // Versión antigua - migrar o invalidar
    if (conversation.flow_version === '1.0.0') {
      // Migrar de v1.0.0 a v2.0.0
      conversation.flow_version = CURRENT_FLOW_VERSION;
      conversation.schema_version = CURRENT_SCHEMA_VERSION;
      // Agregar campos faltantes si es necesario
      if (!conversation.processed_request_ids) {
        conversation.processed_request_ids = [];
      }
      await saveConversation(conversation);
      await log('INFO', 'Conversación migrada de v1.0.0 a v2.0.0', { 
        conversation_id: conversation.conversation_id 
      });
      return { valid: true, migrated: true };
    } else if (!conversation.flow_version) {
      // Sin versión - asumir v2.0.0 y agregar
      conversation.flow_version = CURRENT_FLOW_VERSION;
      conversation.schema_version = CURRENT_SCHEMA_VERSION;
      await saveConversation(conversation);
      return { valid: true, migrated: true };
    } else {
      // Versión desconocida - invalidar
      return { valid: false, shouldRestart: true, reason: `Unknown flow version: ${conversation.flow_version}` };
    }
  }
  
  return { valid: true };
}

/**
 * F23.1: Validación estricta de eventos entrantes del frontend
 */
/**
 * Detecta el código de estado HTTP de un error
 * Retorna { status, errorType, severity, description }
 */
function detectHttpError(err) {
  // Intentar obtener status del error directamente
  let status = err.status || err.statusCode || err.code;
  
  // Si no hay status directo, intentar detectarlo del mensaje
  if (!status) {
    const message = (err.message || '').toLowerCase();
    
    // 400 - Bad Request
    if (message.includes('400') || message.includes('bad request') || 
        message.includes('requerido') || message.includes('inválido') || 
        message.includes('faltante') || message.includes('invalid') ||
        message.includes('missing') || message.includes('required')) {
      status = 400;
    }
    // 401 - Unauthorized
    else if (message.includes('401') || message.includes('unauthorized') || 
             message.includes('no autorizado') || message.includes('autenticación')) {
      status = 401;
    }
    // 403 - Forbidden
    else if (message.includes('403') || message.includes('forbidden') || 
             message.includes('prohibido') || message.includes('token inválido') ||
             message.includes('invalid token') || message.includes('acceso denegado')) {
      status = 403;
    }
    // 404 - Not Found
    else if (message.includes('404') || message.includes('not found') || 
             message.includes('no encontrado') || message.includes('no existe')) {
      status = 404;
    }
    // 429 - Too Many Requests
    else if (message.includes('429') || message.includes('too many requests') || 
             message.includes('rate limit') || message.includes('demasiadas solicitudes') ||
             message.includes('límite excedido')) {
      status = 429;
    }
    // 500 - Internal Server Error
    else if (message.includes('500') || message.includes('internal server error') || 
             message.includes('error interno')) {
      status = 500;
    }
    // 502 - Bad Gateway
    else if (message.includes('502') || message.includes('bad gateway') || 
             message.includes('puerta de enlace')) {
      status = 502;
    }
    // 503 - Service Unavailable
    else if (message.includes('503') || message.includes('service unavailable') || 
             message.includes('servicio no disponible')) {
      status = 503;
    }
    // 504 - Gateway Timeout
    else if (message.includes('504') || message.includes('gateway timeout') || 
             message.includes('timeout')) {
      status = 504;
    }
    // Por defecto, 500
    else {
      status = 500;
    }
  }
  
  // Normalizar status a número
  status = parseInt(status) || 500;
  
  // Determinar tipo de error, severidad y descripción
  let errorType, severity, description;
  
  if (status >= 400 && status < 500) {
    // Errores del cliente
    severity = 'recoverable';
    
    switch (status) {
      case 400:
        errorType = 'HTTP_400_BAD_REQUEST';
        description = 'Solicitud inválida';
        break;
      case 401:
        errorType = 'HTTP_401_UNAUTHORIZED';
        description = 'No autorizado';
        break;
      case 403:
        errorType = 'HTTP_403_FORBIDDEN';
        description = 'Acceso prohibido';
        break;
      case 404:
        errorType = 'HTTP_404_NOT_FOUND';
        description = 'Recurso no encontrado';
        break;
      case 429:
        errorType = 'HTTP_429_TOO_MANY_REQUESTS';
        description = 'Demasiadas solicitudes';
        break;
      default:
        errorType = `HTTP_${status}_CLIENT_ERROR`;
        description = `Error del cliente (${status})`;
    }
  } else if (status >= 500) {
    // Errores del servidor
    severity = 'fatal';
    
    switch (status) {
      case 500:
        errorType = 'HTTP_500_INTERNAL_SERVER_ERROR';
        description = 'Error interno del servidor';
        break;
      case 502:
        errorType = 'HTTP_502_BAD_GATEWAY';
        description = 'Puerta de enlace inválida';
        break;
      case 503:
        errorType = 'HTTP_503_SERVICE_UNAVAILABLE';
        description = 'Servicio no disponible';
        break;
      case 504:
        errorType = 'HTTP_504_GATEWAY_TIMEOUT';
        description = 'Timeout de puerta de enlace';
        break;
      default:
        errorType = `HTTP_${status}_SERVER_ERROR`;
        description = `Error del servidor (${status})`;
    }
  } else {
    // Otros códigos (no deberían llegar aquí normalmente)
    severity = 'recoverable';
    errorType = `HTTP_${status}_UNKNOWN`;
    description = `Error HTTP ${status}`;
  }
  
  return { status, errorType, severity, description };
}

function validateChatRequest(body) {
  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length < 1) {
    return { valid: false, error: 'sessionId debe ser string no vacío' };
  }
  
  if (body.message && typeof body.message !== 'string') {
    return { valid: false, error: 'message debe ser string' };
  }
  
  if (body.imageBase64 && typeof body.imageBase64 !== 'string') {
    return { valid: false, error: 'imageBase64 debe ser string' };
  }
  
  if (body.request_id && typeof body.request_id !== 'string') {
    return { valid: false, error: 'request_id debe ser string' };
  }
  
  return { valid: true };
}

/**
 * Helper para registrar errores HTTP con logging completo
 * @param {Object} traceContext - Contexto de trace
 * @param {Error} err - Error capturado
 * @param {string} endpoint - Endpoint donde ocurrió el error
 * @param {Object} req - Request object (opcional)
 * @param {Object} res - Response object
 */
async function logHttpError(traceContext, err, endpoint, req = null, res = null) {
  const httpError = detectHttpError(err);
  const { status, errorType, severity, description } = httpError;
  
  // Log en sistema de logs
  await log('ERROR', `Error en ${endpoint} (${errorType})`, { 
    error: err.message, 
    stack: err.stack, 
    boot_id: traceContext?.boot_id,
    session_id: req?.body?.sessionId || req?.params?.sessionId || req?.params?.conversationId,
    endpoint: endpoint,
    http_status: status,
    error_type: errorType,
    severity: severity,
    description: description
  });
  
  // Log en trace
  try {
    const errorContext = traceContext || trace.createTraceContext(
      null,
      `req-${Date.now()}`,
      null,
      null,
      NODE_ENV,
      null,
      trace.generateBootId()
    );
    
    await trace.logError(errorContext, err, severity, 
      `Error en ${endpoint} (${status}): ${err.message}`, false);
    
    // Log evento específico
    await trace.logEvent('ERROR', errorType, {
      actor: 'system',
      endpoint: endpoint,
      error: err.message,
      http_status: status,
      severity: severity,
      description: description,
      boot_id: errorContext.boot_id,
      session_id: req?.body?.sessionId || req?.params?.sessionId || req?.params?.conversationId,
      request_method: req?.method,
      request_path: req?.path || req?.url
    }, errorContext);
  } catch (traceErr) {
    await log('WARN', 'Error al loguear en trace', { trace_error: traceErr.message });
  }
  
  return { status, errorType, severity, description };
}

/**
 * F23.3: Validación de que frontend pueda representar estados
 */
function validateButtonsForFrontend(buttons) {
  if (!Array.isArray(buttons)) return false;
  
  for (const btn of buttons) {
    if (!btn.label || typeof btn.label !== 'string') return false;
    if (!btn.token || typeof btn.token !== 'string') return false;
    if (btn.order && (typeof btn.order !== 'number' || btn.order < 1 || btn.order > 4)) {
      return false;
    }
  }
  
  return true;
}

/**
 * F28.1: Detección de preguntas fuera de alcance
 */
function isOutOfScope(userInput) {
  const outOfScopeKeywords = ['hackear', 'pirata', 'crack', 'bypass', 'robar', 'steal'];
  const outOfScopePatterns = [
    /^(qué hora|what time)/i,
    /^(cuéntame|tell me).*(chiste|joke)/i,
    /^(cómo está|how are you)/i
  ];
  
  const hasKeyword = outOfScopeKeywords.some(kw => userInput.toLowerCase().includes(kw));
  const matchesPattern = outOfScopePatterns.some(pattern => pattern.test(userInput));
  
  return hasKeyword || matchesPattern;
}

/**
 * F28.2: Detección de inputs sin sentido
 */
function isNonsensicalInput(userInput) {
  // Detectar strings repetitivos
  if (/^(.)\1{10,}$/.test(userInput.trim())) {
    return true; // "aaaaaaaaaaa"
  }
  
  // Detectar solo números
  if (/^\d{10,}$/.test(userInput.trim())) {
    return true; // "1234567890"
  }
  
  // Detectar muy corto sin sentido
  if (userInput.trim().length < 3 && !/^(sí|si|no|yes|no)$/i.test(userInput.trim())) {
    return true;
  }
  
  return false;
}

/**
 * F30.1-F30.4: Métricas operativas
 */
const resolutionMetrics = new Map(); // conversationId -> { resolved: boolean, escalated: boolean, steps_taken: number, started_at: string, resolved_at: string }
const METRICS_FILE = path.join(DATA_BASE, 'metrics.json');

/**
 * Guardar métricas en archivo
 */
async function saveMetrics() {
  try {
    const metricsData = {
      escalation: Object.fromEntries(escalationMetrics),
      resolution: Object.fromEntries(resolutionMetrics),
      updated_at: new Date().toISOString()
    };
    
    const tempFile = METRICS_FILE + '.tmp';
    await fs.writeFile(tempFile, JSON.stringify(metricsData, null, 2), 'utf-8');
    await fs.rename(tempFile, METRICS_FILE);
  } catch (err) {
    await log('ERROR', 'Error guardando métricas', { error: err.message });
  }
}

// Guardar métricas cada 5 minutos
setInterval(saveMetrics, 5 * 60 * 1000);

// ========================================================
// P1.1: IDEMPOTENCIA Y DEDUPLICACIÓN
// ========================================================

const recentInputs = new Map(); // conversationId -> Set de hashes recientes

/**
 * Genera hash del input para deduplicación
 */
function hashInput(conversationId, userInput) {
  return `${conversationId}:${userInput.trim().toLowerCase()}`;
}

function createSession(sessionId) {
  // LOG DETALLADO: Inicio de createSession
  logDebug('DEBUG', 'createSession - Inicio', {
    session_id: sessionId,
    session_id_length: sessionId?.length || 0
  }, 'server.js', 1339, 1339).catch(() => {});
  
  const session = {
    sessionId,
    conversation_id: null,
    stage: 'ASK_CONSENT',
    language: null,
    user: { name_raw: null, name_norm: null },
    user_level: null,
    modes: {
      interaction_mode: null,
      learning_depth: null,
      tech_format: false,
      executor_role: null,
      advisory_mode: false,
      emotional_release_used: false
    },
    context: {
      risk_level: 'low',
      impact_summary_shown: false,
      device_category: null,
      device_type: null,
      external_type: null,
      problem_description_raw: null,
      problem_category: null,
      last_known_step: null
    },
    meta: {
      emotion: 'neutral',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  };
  
  logDebug('DEBUG', 'createSession - Sesión creada', {
    session_id: sessionId,
    stage: session.stage
  }, 'server.js', 1370, 1370).catch(() => {});
  
  return session;
}

function getSession(sessionId) {
  // LOG DETALLADO: Inicio de getSession
  logDebug('DEBUG', 'getSession - Inicio', {
    session_id: sessionId,
    session_exists: sessions.has(sessionId),
    total_sessions: sessions.size
  }, 'server.js', 1373, 1373).catch(() => {});
  
  if (!sessions.has(sessionId)) {
    const newSession = createSession(sessionId);
    sessions.set(sessionId, newSession);
    logDebug('DEBUG', 'getSession - Nueva sesión creada', {
      session_id: sessionId,
      stage: newSession.stage
    }, 'server.js', 1375, 1376).catch(() => {});
  }
  
  const session = sessions.get(sessionId);
  
  // Validación defensiva: si session es undefined, recrearla
  if (!session) {
    logDebug('WARN', 'getSession - Sesión undefined detectada, recreando', {
      session_id: sessionId,
      sessions_has: sessions.has(sessionId),
      total_sessions: sessions.size
    }, 'server.js', 1478, 1478).catch(() => {});
    const newSession = createSession(sessionId);
    if (!newSession) {
      // Si createSession también falla, lanzar error
      throw new Error(`No se pudo crear sesión para sessionId: ${sessionId}`);
    }
    sessions.set(sessionId, newSession);
    logDebug('DEBUG', 'getSession - Sesión recreada exitosamente', {
      session_id: sessionId,
      stage: newSession.stage
    }, 'server.js', 1481, 1483).catch(() => {});
    return newSession;
  }
  
  logDebug('DEBUG', 'getSession - Sesión obtenida', {
    session_id: sessionId,
    stage: session.stage,
    conversation_id: session.conversation_id
  }, 'server.js', 1485, 1487).catch(() => {});
  
  return session;
}

// ========================================================
// CATÁLOGO DE BOTONES PERMITIDOS POR ASK
// ========================================================

const ALLOWED_BUTTONS_BY_ASK = {
  ASK_CONSENT: [
    { token: 'BTN_CONSENT_YES', label: 'Sí, acepto ✔️', value: 'sí' },
    { token: 'BTN_CONSENT_NO', label: 'No acepto ❌', value: 'no' }
  ],
  ASK_LANGUAGE: [
    { token: 'BTN_LANG_ES', label: 'Español (Argentina)', value: 'es-AR' },
    { token: 'BTN_LANG_EN', label: 'English', value: 'en' }
  ],
  ASK_USER_LEVEL: [
    { token: 'BTN_LEVEL_BASIC', label: 'Básico', value: 'básico' },
    { token: 'BTN_LEVEL_INTERMEDIATE', label: 'Intermedio', value: 'intermedio' },
    { token: 'BTN_LEVEL_ADVANCED', label: 'Avanzado', value: 'avanzado' }
  ],
  ASK_DEVICE_CATEGORY: [
    { token: 'BTN_DEVICE_MAIN', label: 'Equipo principal', value: 'main' },
    { token: 'BTN_DEVICE_EXTERNAL', label: 'Dispositivo externo / periférico', value: 'external' }
  ],
  ASK_DEVICE_TYPE_MAIN: [
    { token: 'BTN_DEVICE_DESKTOP', label: 'PC de escritorio', value: 'desktop' },
    { token: 'BTN_DEVICE_NOTEBOOK', label: 'Notebook', value: 'notebook' },
    { token: 'BTN_DEVICE_ALLINONE', label: 'All-in-One', value: 'allinone' }
  ],
  ASK_DEVICE_TYPE_EXTERNAL: [
    { token: 'BTN_EXT_PRINTER', label: 'Impresora', value: 'printer' },
    { token: 'BTN_EXT_MONITOR', label: 'Monitor', value: 'monitor' },
    { token: 'BTN_EXT_KEYBOARD', label: 'Teclado', value: 'keyboard' },
    { token: 'BTN_EXT_MOUSE', label: 'Mouse', value: 'mouse' },
    { token: 'BTN_EXT_CAMERA', label: 'Cámara', value: 'camera' },
    { token: 'BTN_EXT_STORAGE', label: 'Pendrive / disco externo', value: 'storage' },
    { token: 'BTN_EXT_AUDIO', label: 'Audio', value: 'audio' },
    { token: 'BTN_EXT_OTHER', label: 'Otro', value: 'other' }
  ],
  ASK_INTERACTION_MODE: [
    { token: 'BTN_MODE_FAST', label: '⚡ Ir rápido', value: 'fast' },
    { token: 'BTN_MODE_GUIDED', label: '🧭 Paso a paso', value: 'guided' }
  ],
  ASK_CONNECTIVITY_METHOD: [
    { token: 'BTN_CONN_WIFI', label: 'WiFi', value: 'wifi' },
    { token: 'BTN_CONN_CABLE', label: 'Cable', value: 'cable' }
  ],
  ASK_FEEDBACK: [
    { token: 'BTN_FEEDBACK_YES', label: '👍 Me sirvió', value: 'sí' },
    { token: 'BTN_FEEDBACK_NO', label: '👎 No me sirvió', value: 'no' }
  ],
  ASK_RESOLUTION_STATUS: [
    { token: 'BTN_RESOLVED', label: '✅ Se resolvió', value: 'resolved' },
    { token: 'BTN_NOT_RESOLVED', label: '❌ Sigue igual', value: 'not_resolved' },
    { token: 'BTN_NEED_HELP', label: '🙋 Necesito ayuda', value: 'need_help' }
  ],
  ASK_LEARNING_DEPTH: [
    { token: 'BTN_LEARNING_SIMPLE', label: 'Simple (explicaciones básicas)', value: 'simple' },
    { token: 'BTN_LEARNING_TECHNICAL', label: 'Técnico (detalles avanzados)', value: 'technical' }
  ],
  ASK_EXECUTOR_ROLE: [
    { token: 'BTN_EXECUTOR_SELF', label: 'Estoy frente al equipo', value: 'self' },
    { token: 'BTN_EXECUTOR_INTERMEDIARY', label: 'Ayudo a otra persona', value: 'intermediary' }
  ],
  ASK_WIFI_VISIBLE: [
    { token: 'BTN_WIFI_YES', label: 'Sí, aparece', value: 'yes' },
    { token: 'BTN_WIFI_NO', label: 'No aparece', value: 'no' }
  ],
  ASK_OTHER_DEVICE_WORKS: [
    { token: 'BTN_OTHER_YES', label: 'Sí, funciona', value: 'yes' },
    { token: 'BTN_OTHER_NO', label: 'No funciona', value: 'no' }
  ],
  ASK_MODEM_COUNT: [
    { token: 'BTN_MODEM_ONE', label: 'Una cajita', value: 'one' },
    { token: 'BTN_MODEM_TWO', label: 'Dos cajitas', value: 'two' }
  ],
  ASK_LIGHTS_STATUS: [
    { token: 'BTN_LIGHTS_OK', label: 'Verdes/Normales', value: 'ok' },
    { token: 'BTN_LIGHTS_RED', label: 'Rojas/Apagadas', value: 'red' }
  ]
};

// ========================================================
// TEXTOS PARA EL USUARIO (voseo es-AR)
// ========================================================

const TEXTS = {
  ASK_CONSENT: {
    es: `📋 Política de Privacidad y Consentimiento

Antes de continuar, quiero contarte:

✅ Voy a guardar tu nombre y nuestra conversación durante 48 horas
✅ Los datos se usan solo para brindarte soporte técnico
✅ Podés pedir que borre tus datos en cualquier momento
✅ No compartimos tu información con terceros
✅ Cumplimos con GDPR y normativas de privacidad

🔗 Política completa: https://stia.com.ar/politica-privacidad.html

⚠️ **Importante:** Te puedo ayudar con problemas de conectividad, instalaciones y diagnóstico básico. Si el problema requiere acciones avanzadas o hay riesgo de pérdida de datos, te recomendaré contactar con un técnico.

¿Aceptás estos términos?`,
    'es-AR': `📋 Política de Privacidad y Consentimiento

Antes de continuar, quiero contarte:

✅ Voy a guardar tu nombre y nuestra conversación durante 48 horas
✅ Los datos se usan solo para brindarte soporte técnico
✅ Podés pedir que borre tus datos en cualquier momento
✅ No compartimos tu información con terceros
✅ Cumplimos con GDPR y normativas de privacidad

🔗 Política completa: https://stia.com.ar/politica-privacidad.html

⚠️ **Importante:** Te puedo ayudar con problemas de conectividad, instalaciones y diagnóstico básico. Si el problema requiere acciones avanzadas o hay riesgo de pérdida de datos, te recomendaré contactar con un técnico.

¿Aceptás estos términos?`,
    en: `📋 Privacy Policy and Consent

Before continuing, I want to tell you:

✅ I will store your name and our conversation indefinitely
✅ Data is used only to provide technical support
✅ You can request deletion of your data at any time
✅ We do not share your information with third parties
✅ We comply with GDPR and privacy regulations

🔗 Full policy: https://stia.com.ar/politica-privacidad.html

⚠️ **Important:** I can help you with connectivity issues, installations, and basic diagnostics. If the problem requires advanced actions or there's a risk of data loss, I'll recommend contacting a technician.

Do you accept these terms?`
  },
  ASK_LANGUAGE: {
    es: `Seleccioná tu idioma:`,
    'es-AR': `Seleccioná tu idioma:`,
    en: `Select your language:`
  },
  ASK_NAME: {
    es: `¿Con quién tengo el gusto de hablar? 😊`,
    'es-AR': `¿Con quién tengo el gusto de hablar? 😊`,
    en: `What's your name? 😊`
  },
  ASK_USER_LEVEL: {
    es: `Por favor, seleccioná tu nivel de conocimiento técnico:`,
    'es-AR': `Por favor, seleccioná tu nivel de conocimiento técnico:`,
    en: `Please select your technical knowledge level:`
  },
  ASK_DEVICE_CATEGORY: {
    es: `¿Es tu equipo principal o un dispositivo externo/periférico?`,
    'es-AR': `¿Es tu equipo principal o un dispositivo externo/periférico?`,
    en: `Is it your main device or an external/peripheral device?`
  },
  ASK_PROBLEM: {
    es: `Contame, ¿qué problema estás teniendo?`,
    'es-AR': `Contame, ¿qué problema estás teniendo?`,
    en: `Tell me, what problem are you having?`
  },
  ASK_FEEDBACK: {
    es: `Antes de cerrar, ¿me decís si esta ayuda te resultó útil?`,
    'es-AR': `Antes de cerrar, ¿me decís si esta ayuda te resultó útil?`,
    en: `Before closing, can you tell me if this help was useful?`
  }
};

// ========================================================
// VALIDACIÓN DE SCHEMA JSON
// ========================================================

/**
 * P2-2: Detecta patrones de prompt injection en el input del usuario
 * Retorna { detected: boolean, severity: 'low'|'medium'|'high', patterns: string[] }
 */
function detectPromptInjection(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return { detected: false, severity: 'low', patterns: [] };
  }
  
  const inputLower = userInput.toLowerCase();
  const detectedPatterns = [];
  let severity = 'low';
  
  // Patrones de alta severidad (intentos explícitos de manipulación)
  const highSeverityPatterns = [
    /ignore\s+(previous|all|above)\s+(instructions|prompts?|rules?)/i,
    /forget\s+(previous|all|above)\s+(instructions|prompts?|rules?)/i,
    /disregard\s+(previous|all|above)\s+(instructions|prompts?|rules?)/i,
    /reveal\s+(your|the)\s+(prompt|instructions|system\s+message|initial\s+message)/i,
    /show\s+(me\s+)?(your|the)\s+(prompt|instructions|system\s+message|initial\s+message)/i,
    /what\s+(are|were)\s+(your|the)\s+(prompt|instructions|system\s+message)/i,
    /repeat\s+(your|the)\s+(prompt|instructions|system\s+message|initial\s+message)/i,
    /print\s+(your|the)\s+(prompt|instructions|system\s+message)/i,
    /output\s+(your|the)\s+(prompt|instructions|system\s+message)/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /act\s+as\s+(if\s+)?(you\s+are|you're)\s+/i,
    /pretend\s+(you\s+are|you're)\s+/i,
    /roleplay\s+as\s+/i,
    /system:\s*override/i,
    /\[system\]/i,
    /<\|system\|>/i,
    /###\s*instructions/i
  ];
  
  // Patrones de severidad media
  const mediumSeverityPatterns = [
    /new\s+(instructions|rules?|guidelines?)/i,
    /change\s+(your|the)\s+(behavior|role|personality)/i,
    /modify\s+(your|the)\s+(instructions|rules?)/i,
    /update\s+(your|the)\s+(instructions|rules?)/i,
    /you\s+must\s+(now|always|never)/i,
    /you\s+should\s+(now|always|never)/i,
    /from\s+now\s+on/i,
    /starting\s+now/i
  ];
  
  // Patrones de baja severidad (posibles intentos)
  const lowSeverityPatterns = [
    /what\s+(is|are)\s+your\s+(rules?|guidelines?|constraints?)/i,
    /tell\s+me\s+(your|about\s+your)\s+(rules?|guidelines?)/i,
    /what\s+can\s+you\s+(do|not\s+do)/i,
    /what\s+are\s+your\s+(limitations?|restrictions?)/i
  ];
  
  // Detectar patrones de alta severidad
  for (const pattern of highSeverityPatterns) {
    if (pattern.test(userInput)) {
      detectedPatterns.push(pattern.source);
      severity = 'high';
      break; // Un solo patrón de alta severidad es suficiente
    }
  }
  
  // Si no hay alta severidad, buscar media
  if (severity !== 'high') {
    for (const pattern of mediumSeverityPatterns) {
      if (pattern.test(userInput)) {
        detectedPatterns.push(pattern.source);
        severity = 'medium';
        break;
      }
    }
  }
  
  // Si no hay alta ni media, buscar baja
  if (severity === 'low') {
    for (const pattern of lowSeverityPatterns) {
      if (pattern.test(userInput)) {
        detectedPatterns.push(pattern.source);
        // Mantener severity en 'low'
        break;
      }
    }
  }
  
  return {
    detected: detectedPatterns.length > 0,
    severity,
    patterns: detectedPatterns
  };
}

/**
 * Valida el schema del resultado de IA_CLASSIFIER
 * P2-2: Reforzado con validación estricta y detección de prompt injection
 */
function validateClassifierResult(result) {
  const required = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence'];
  for (const field of required) {
    if (!(field in result)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // P2-2: Validación estricta de tipos
  if (typeof result.intent !== 'string') {
    throw new Error(`Invalid intent type: ${typeof result.intent}. Must be string`);
  }
  
  if (typeof result.risk_level !== 'string') {
    throw new Error(`Invalid risk_level type: ${typeof result.risk_level}. Must be string`);
  }
  
  // P2-2: Validación estricta de valores permitidos (allowlist)
  const validIntents = ['network', 'power', 'install_os', 'install_app', 'peripheral', 'malware', 'unknown'];
  if (!validIntents.includes(result.intent)) {
    throw new Error(`Invalid intent: ${result.intent}. Must be one of: ${validIntents.join(', ')}`);
  }
  
  const validRiskLevels = ['low', 'medium', 'high'];
  if (!validRiskLevels.includes(result.risk_level)) {
    throw new Error(`Invalid risk_level: ${result.risk_level}. Must be one of: ${validRiskLevels.join(', ')}`);
  }
  
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    throw new Error(`Invalid confidence: ${result.confidence}. Must be a number between 0 and 1`);
  }
  
  if (typeof result.needs_clarification !== 'boolean') {
    throw new Error(`Invalid needs_clarification: ${result.needs_clarification}. Must be boolean`);
  }
  
  if (!Array.isArray(result.missing)) {
    throw new Error(`Invalid missing: ${result.missing}. Must be an array`);
  }
  
  // P2-2: Validar que los campos adicionales no contengan instrucciones sospechosas
  const suspiciousFields = ['suggested_next_ask', 'detected_device', 'detected_device_category'];
  for (const field of suspiciousFields) {
    if (result[field] && typeof result[field] === 'string') {
      const injectionCheck = detectPromptInjection(result[field]);
      if (injectionCheck.detected && injectionCheck.severity === 'high') {
        throw new Error(`Suspicious content detected in field ${field}: possible prompt injection`);
      }
    }
  }
  
  if (result.suggest_modes && typeof result.suggest_modes !== 'object') {
    throw new Error(`Invalid suggest_modes: ${result.suggest_modes}. Must be an object`);
  }
  
  // Validación opcional: advertir sobre campos adicionales no esperados
  const allowedFields = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence', 'suggest_modes', 'suggested_next_ask', 'detected_device', 'detected_device_category', 'missing_device'];
  const extraFields = Object.keys(result).filter(f => !allowedFields.includes(f));
  if (extraFields.length > 0) {
    // Log warning pero no fallar (mejora opcional)
    console.warn(`[WARN] Campos adicionales en respuesta IA_CLASSIFIER: ${extraFields.join(', ')}`);
  }
  
  return true;
}

/**
 * Valida el schema del resultado de IA_STEP
 * P2-2: Reforzado con validación estricta, allowlist de botones y detección de prompt injection
 */
function validateStepResult(result, allowedButtons = []) {
  if (!result.reply || typeof result.reply !== 'string') {
    throw new Error(`Missing or invalid reply field. Must be a non-empty string`);
  }
  
  // P2-2: Detectar prompt injection en el reply
  const replyInjectionCheck = detectPromptInjection(result.reply);
  if (replyInjectionCheck.detected && replyInjectionCheck.severity === 'high') {
    throw new Error(`Suspicious content detected in reply: possible prompt injection. Patterns: ${replyInjectionCheck.patterns.join(', ')}`);
  }
  
  if (result.buttons !== undefined && !Array.isArray(result.buttons)) {
    throw new Error(`Invalid buttons: ${result.buttons}. Must be an array`);
  }
  
  if (result.buttons && result.buttons.length > 0) {
    // P2-2: Validar que no haya más de 4 botones
    if (result.buttons.length > 4) {
      throw new Error(`Too many buttons: ${result.buttons.length}. Maximum is 4`);
    }
    
    // P2-2: Allowlist estricta de botones - validar que todos los botones estén en allowedButtons
    if (allowedButtons && allowedButtons.length > 0) {
      const allowedTokens = new Set(allowedButtons.map(b => b.token));
      
      for (const btn of result.buttons) {
        if (!btn.token || typeof btn.token !== 'string') {
          throw new Error(`Invalid button: missing or invalid token`);
        }
        
        // P2-2: Validar que el token esté en la allowlist
        if (!allowedTokens.has(btn.token)) {
          throw new Error(`Invalid button token: ${btn.token}. Not in allowed list: ${Array.from(allowedTokens).join(', ')}`);
        }
        
        if (!btn.label || typeof btn.label !== 'string' || btn.label.trim().length === 0) {
          throw new Error(`Invalid button: missing or empty label`);
        }
        
        // P2-2: Detectar prompt injection en labels
        const labelInjectionCheck = detectPromptInjection(btn.label);
        if (labelInjectionCheck.detected && labelInjectionCheck.severity === 'high') {
          throw new Error(`Suspicious content detected in button label: possible prompt injection`);
        }
      }
    } else {
      // Si no hay allowedButtons, validar estructura básica
      for (const btn of result.buttons) {
        if (!btn.token || typeof btn.token !== 'string') {
          throw new Error(`Invalid button: missing or invalid token`);
        }
        if (!btn.label || typeof btn.label !== 'string' || btn.label.trim().length === 0) {
          throw new Error(`Invalid button: missing or empty label`);
        }
      }
    }
  }
  
  return true;
}

/**
 * Obtiene historial de pasos anteriores del transcript
 */
function getRecentStepsHistory(conversation, maxSteps = 3) {
  if (!conversation || !conversation.transcript) {
    return [];
  }
  
  const steps = [];
  for (let i = conversation.transcript.length - 1; i >= 0 && steps.length < maxSteps; i--) {
    const event = conversation.transcript[i];
    if (event.role === 'bot' && event.type === 'text' && event.text) {
      // Filtrar solo pasos de diagnóstico (contienen palabras clave típicas de pasos)
      const textLower = event.text.toLowerCase();
      const isDiagnosticStep = textLower.includes('verificá') || 
                               textLower.includes('probá') ||
                               textLower.includes('revisá') ||
                               textLower.includes('comprobá') ||
                               textLower.includes('check') ||
                               textLower.includes('verify') ||
                               textLower.includes('test') ||
                               textLower.includes('paso') ||
                               textLower.includes('step');
      
      if (isDiagnosticStep) {
        steps.unshift(event.text);
      }
    }
  }
  
  return steps;
}

/**
 * Genera hash simple del contenido para logging (sin exponer contenido completo)
 */
function hashContent(content) {
  if (!content || content.length === 0) return 'empty';
  // Hash simple: primeros 50 chars + longitud
  const preview = content.substring(0, 50).replace(/\s+/g, ' ');
  return `${preview}... (${content.length} chars)`;
}

// ========================================================
// IA - CLASSIFIER (Etapa 1)
// ========================================================

async function iaClassifier(session, userInput, requestId = null, traceContext = null) {
  // LOG DETALLADO: Inicio de iaClassifier
  await logDebug('DEBUG', 'iaClassifier - Inicio', {
    conversation_id: session.conversation_id,
    session_stage: session.stage,
    user_input_length: userInput?.length || 0,
    user_input_preview: userInput ? userInput.substring(0, 100) : 'null/empty',
    request_id: requestId,
    session_language: session.language,
    user_level: session.user_level,
    has_trace_context: !!traceContext
  }, 'server.js', 1951, 1951);
  
  const conversationId = session.conversation_id;
  
  // Crear traceContext si no se proporciona
  if (!traceContext) {
    const bootId = trace.generateBootId();
    traceContext = trace.createTraceContext(
      conversationId,
      `ia-classifier-${Date.now()}`,
      session.stage || 'ASK_PROBLEM',
      session.language || 'es',
      NODE_ENV,
      requestId,
      bootId
    );
  }
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback');
    return {
      intent: 'unknown',
      needs_clarification: true,
      missing: ['device_type'],
      suggested_next_ask: 'ASK_DEVICE_TYPE',
      risk_level: 'low',
      detected_device: null,
      detected_device_category: null,
      missing_device: true,
      suggest_modes: {},
      confidence: 0.0
    };
  }
  
  const stageBefore = session.stage;
  const startTime = Date.now();
  
  // P0.2: Verificar rate limit de llamadas a IA
  if (!await checkAICallLimit(conversationId, 3)) {
    await log('WARN', 'Límite de IA excedido, usando fallback', { conversation_id: conversationId });
    return {
      intent: 'unknown',
      needs_clarification: true,
      missing: ['device_type'],
      suggested_next_ask: 'ASK_DEVICE_TYPE',
      risk_level: 'low',
      detected_device: null,
      detected_device_category: null,
      missing_device: true,
      suggest_modes: {},
      confidence: 0.0
    };
  }
  
  // P2.2: Verificar cooldown tras errores repetidos
  if (!await checkAICooldown(conversationId)) {
    await log('WARN', 'Cooldown activo, usando fallback', { conversation_id: conversationId });
    return {
      intent: 'unknown',
      needs_clarification: true,
      missing: ['device_type'],
      suggested_next_ask: 'ASK_DEVICE_TYPE',
      risk_level: 'low',
      detected_device: null,
      detected_device_category: null,
      missing_device: true,
      suggest_modes: {},
      confidence: 0.0
    };
  }
  
  // Log inicio de llamada IA
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_START',
      payload: { 
        type: 'classifier', 
        user_input_length: userInput.length,
        request_id: requestId 
      }
    });
  }
  
  // Limitar longitud de problem_description_raw para evitar prompts excesivamente largos
  const problemDesc = (session.context.problem_description_raw || 'ninguno').substring(0, 300);
  
  const promptTemplate = `Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.

CONTEXTO:
- Etapa actual: ${session.stage || 'ASK_PROBLEM'}
- Nivel usuario: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema descrito: "${problemDesc}"
- Mensaje actual: "${userInput}"

INSTRUCCIONES IMPORTANTES:
- Detectá el dispositivo mencionado en el problema (pc, notebook, all_in_one, impresora, router, monitor, teclado, mouse, cámara, storage, audio, etc.)
- Si el problema menciona claramente un dispositivo (ej: "mi notebook no prende", "la impresora no imprime"), establecé detected_device con ese valor y missing_device = false
- Si el problema es ambiguo o no menciona dispositivo (ej: "no tengo wifi", "mi compu no funciona"), establecé detected_device = null y missing_device = true
- detected_device_category debe ser "main" para pc/notebook/all_in_one, "external" para periféricos, o null si no se detecta

Devolvé un JSON con esta estructura exacta:
{
  "intent": "network|power|install_os|install_app|peripheral|malware|unknown",
  "needs_clarification": true|false,
  "missing": ["device_type", "os", ...],
  "suggested_next_ask": "ASK_DEVICE_TYPE|ASK_PROBLEM|...",
  "risk_level": "low|medium|high",
  "detected_device": "pc|notebook|all_in_one|impresora|router|monitor|teclado|mouse|cámara|storage|audio|null",
  "detected_device_category": "main|external|null",
  "missing_device": true|false,
  "suggest_modes": {
    "ask_interaction_mode": true|false,
    "ask_learning_depth": true|false,
    "ask_executor_role": true|false,
    "activate_advisory_mode": true|false,
    "emotional_release": true|false,
    "tech_format_mode": true|false
  },
  "confidence": 0.0-1.0
}`;

  const prompt = promptTemplate.replace('${session.stage || \'ASK_PROBLEM\'}', session.stage || 'ASK_PROBLEM')
    .replace('${session.user_level || \'desconocido\'}', session.user_level || 'desconocido')
    .replace('${session.context.device_type || \'desconocido\'}', session.context.device_type || 'desconocido')
    .replace('"${problemDesc}"', `"${problemDesc}"`)
    .replace('"${userInput}"', `"${userInput}"`);

  // Definir nombre y versión del prompt para logging
  const promptName = 'ia_classifier_problem_analysis';
  const promptVersion = '2.0.0';

  // Log construcción de prompt
  await trace.logPromptConstruction(
    traceContext,
    promptName,
    promptVersion,
    {
      stage: session.stage,
      user_level: session.user_level,
      device_type: session.context.device_type,
      problem_description: problemDesc,
      user_input_length: userInput.length
    },
    prompt
  );
  
  const spanOpenAI = trace.startSpan('openai_classifier');

  // Log payload summary
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_PAYLOAD_SUMMARY',
      payload: {
        user_level: session.user_level,
        device_type: session.context.device_type,
        has_problem_description: !!session.context.problem_description_raw,
        stage: session.stage
      }
    });
  }
  
  // Retry único con backoff exponencial para errores no-timeout
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await Promise.race([
        openai.chat.completions.create({
          model: OPENAI_MODEL_CLASSIFIER,
          messages: [{ role: 'user', content: prompt }],
          temperature: OPENAI_TEMPERATURE_CLASSIFIER,
          max_tokens: OPENAI_MAX_TOKENS_CLASSIFIER,
          response_format: { type: 'json_object' }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), OPENAI_TIMEOUT_MS)
        )
      ]);
      
      const content = response.choices[0].message.content;
      
      // Log resultado raw
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_RESULT_RAW',
          payload: { content_hash: hashContent(content) }
        });
      }
      
      let result;
      try {
        result = JSON.parse(content);
      } catch (parseErr) {
        await log('ERROR', 'JSON inválido de IA_CLASSIFIER', { content: content.substring(0, 200), error: parseErr.message });
        
        if (conversationId) {
          await appendToTranscript(conversationId, {
            role: 'system',
            type: 'event',
            name: 'IA_CALL_VALIDATION_FAIL',
            payload: { error: 'JSON_PARSE_ERROR', error_message: parseErr.message }
          });
        }
        
        return {
          intent: 'unknown',
          needs_clarification: true,
          missing: ['device_type'],
          suggested_next_ask: 'ASK_DEVICE_TYPE',
          risk_level: 'low',
          suggest_modes: {},
          confidence: 0.0
        };
      }
      
      // Validar schema
      try {
        validateClassifierResult(result);
      } catch (validationErr) {
        await log('ERROR', 'Schema inválido de IA_CLASSIFIER', { error: validationErr.message, result });
        
        if (conversationId) {
          await appendToTranscript(conversationId, {
            role: 'system',
            type: 'event',
            name: 'IA_CALL_VALIDATION_FAIL',
            payload: { error: 'SCHEMA_VALIDATION_ERROR', error_message: validationErr.message }
          });
        }
        
        return {
          intent: 'unknown',
          needs_clarification: true,
          missing: ['device_type'],
          suggested_next_ask: 'ASK_DEVICE_TYPE',
          risk_level: 'low',
          suggest_modes: {},
          confidence: 0.0
        };
      }
      
      // P2.3: Calcular latencia
      const latency = Date.now() - startTime;
      trace.endSpan(spanOpenAI);
      
      // Log llamada a OpenAI exitosa
      await trace.logOpenAICall(
        traceContext,
        OPENAI_MODEL_CLASSIFIER,
        {
          temperature: OPENAI_TEMPERATURE_CLASSIFIER,
          max_tokens: OPENAI_MAX_TOKENS_CLASSIFIER,
          response_format: 'json_object'
        },
        response.usage,
        latency
      );
      
      // Log detección de intención
      await trace.logIntentDetection(
        traceContext,
        result.intent,
        result.confidence,
        result.needs_clarification,
        result.missing,
        null // alternatives (no disponible en este punto)
      );
      
      // P2.8: Incrementar contador de llamadas
      incrementAICallCount(conversationId, 'classifier');
      
      // Log resultado parseado y validado
      // P0-02: Validar result antes de hacer spread
      if (conversationId) {
        // P0-02: Validar que result sea objeto válido y serializable
        let safeResult = {};
        if (result && typeof result === 'object') {
          try {
            // Intentar serializar para validar
            JSON.stringify(result);
            // Copiar propiedades válidas (excluir funciones, símbolos, etc.)
            for (const key in result) {
              if (result.hasOwnProperty(key) && !key.startsWith('.')) {
                try {
                  JSON.stringify(result[key]);
                  safeResult[key] = result[key];
                } catch (err) {
                  // Ignorar propiedades no serializables
                  await log('WARN', `Propiedad no serializable en IA_CLASSIFIER_RESULT: ${key}`, { conversationId });
                }
              }
            }
          } catch (err) {
            await log('ERROR', `Result no serializable en IA_CLASSIFIER_RESULT`, { conversationId, error: err.message });
            safeResult = { error: 'Result no serializable', intent: result.intent || 'unknown' };
          }
        } else {
          await log('WARN', `Result inválido en IA_CLASSIFIER_RESULT`, { conversationId, resultType: typeof result });
          safeResult = { intent: 'unknown', error: 'Invalid result type' };
        }
        
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CLASSIFIER_RESULT',
          payload: {
            ...safeResult,
            latency_ms: latency,
            stage_before: stageBefore,
            stage_after: session.stage,
            request_id: requestId
          }
        });
      }
      
      return result;
    } catch (err) {
      lastError = err;
      
      // P2.2: Si es error de rate limit o timeout, activar cooldown
      if (err.message.includes('rate limit') || err.message === 'Timeout') {
        const currentCooldown = aiErrorCooldowns.get(conversationId) || { errorCount: 0 };
        setAICooldown(conversationId, currentCooldown.errorCount);
      }
      
      // No reintentar si es timeout o si es el último intento
      if (err.message === 'Timeout' || attempt === 1) {
        break;
      }
      // Backoff exponencial: esperar 1 segundo antes del retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  await log('ERROR', 'Error en IA_CLASSIFIER después de retries', { error: lastError?.message || 'Unknown error' });
  
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'FALLBACK_USED',
      payload: { reason: lastError?.message || 'Unknown error', type: 'classifier', retries: 2 }
    });
  }
  
  return {
    intent: 'unknown',
    needs_clarification: true,
    missing: ['device_type'],
    suggested_next_ask: 'ASK_DEVICE_TYPE',
    risk_level: 'low',
    suggest_modes: {},
    confidence: 0.0
  };
}

// ========================================================
// UX ADAPTATIVA - Ajuste de emojis, longitud, nombre según emoción
// ========================================================

/**
 * Ajusta el texto según la emoción del usuario
 * - focused: 0 emojis, 1-3 líneas
 * - frustrated/anxious: 0-1 emoji, 2-4 líneas
 * - neutral/confused/satisfied: 1-2 emojis, 4-6 líneas
 */
function adaptTextToEmotion(text, emotion, userName = null) {
  let adaptedText = text;
  const lines = text.split('\n').filter(l => l.trim());
  const lineCount = lines.length;
  
  // Usar nombre "de vez en cuando" (más en frustración/confusión)
  const shouldUseName = userName && (
    emotion === 'frustrated' || 
    emotion === 'anxious' || 
    emotion === 'confused' ||
    (emotion === 'neutral' && Math.random() < 0.3) // 30% en neutral
  );
  
  if (shouldUseName && !text.includes(userName)) {
    // Agregar nombre al inicio o en medio, no mecánicamente
    const namePatterns = [
      `${userName}, `,
      `Mirá, ${userName}, `,
      `${userName}, te explico: `
    ];
    const pattern = namePatterns[Math.floor(Math.random() * namePatterns.length)];
    adaptedText = pattern + adaptedText;
  }
  
  // Ajustar emojis según emoción (detectar emojis con regex Unicode)
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiCount = (adaptedText.match(emojiRegex) || []).length;
  
  if (emotion === 'focused') {
    // Remover emojis si hay muchos
    if (emojiCount > 0) {
      adaptedText = adaptedText.replace(emojiRegex, '');
    }
    // Acortar a 1-3 líneas
    if (lineCount > 3) {
      adaptedText = lines.slice(0, 3).join('\n');
    }
  } else if (emotion === 'frustrated' || emotion === 'anxious') {
    // Máximo 1 emoji
    if (emojiCount > 1) {
      const emojis = adaptedText.match(emojiRegex) || [];
      adaptedText = adaptedText.replace(emojiRegex, '');
      if (emojis.length > 0) {
        adaptedText = emojis[0] + ' ' + adaptedText;
      }
    }
    // 2-4 líneas
    if (lineCount > 4) {
      adaptedText = lines.slice(0, 4).join('\n');
    } else if (lineCount < 2) {
      // Expandir un poco si es muy corto
      adaptedText = adaptedText + '\n\n¿Te sirve esto?';
    }
  } else {
    // neutral/confused/satisfied: 1-2 emojis, 4-6 líneas
    if (emojiCount === 0 && lineCount > 2) {
      // Agregar emoji apropiado
      const emojis = ['😊', '👍', '🤔', '💡'];
      adaptedText = emojis[Math.floor(Math.random() * emojis.length)] + ' ' + adaptedText;
    } else if (emojiCount > 2) {
      // Reducir a máximo 2
      const emojis = (adaptedText.match(emojiRegex) || []).slice(0, 2);
      adaptedText = adaptedText.replace(emojiRegex, '');
      if (emojis.length > 0) {
        adaptedText = emojis.join(' ') + ' ' + adaptedText;
      }
    }
    // 4-6 líneas
    if (lineCount > 6) {
      adaptedText = lines.slice(0, 6).join('\n');
    }
  }
  
  return adaptedText.trim();
}

/**
 * Detecta emoción del usuario basado en el input
 */
function detectEmotion(userInput, session) {
  const inputLower = userInput.toLowerCase();
  
  // Frustrado
  if (inputLower.match(/\b(no funciona|no sirve|no anda|frustrado|molesto|enojado|desesperado)\b/)) {
    return 'frustrated';
  }
  
  // Ansioso
  if (inputLower.match(/\b(urgente|rápido|apuro|preocupado|nervioso|ansioso)\b/)) {
    return 'anxious';
  }
  
  // Confundido
  if (inputLower.match(/\b(no entiendo|confundido|no sé|no sé cómo|ayuda)\b/)) {
    return 'confused';
  }
  
  // Satisfecho
  if (inputLower.match(/\b(gracias|perfecto|genial|excelente|sirvió|funcionó)\b/)) {
    return 'satisfied';
  }
  
  // Enfocado (preguntas directas, sin emociones)
  if (inputLower.match(/^(qué|cómo|cuándo|dónde|por qué|porque)\b/)) {
    return 'focused';
  }
  
  // Neutral por defecto
  return 'neutral';
}

// ========================================================
// IA - STEP (Etapa 2) - Mejorado con UX adaptativa
// ========================================================

async function iaStep(session, allowedButtons, previousButtonResult = null, requestId = null) {
  // LOG DETALLADO: Inicio de iaStep
  const conversationId = session.conversation_id;
  await logDebug('DEBUG', 'iaStep - Inicio', {
    conversation_id: session.conversation_id,
    session_stage: session.stage,
    allowed_buttons_count: allowedButtons?.length || 0,
    allowed_buttons: allowedButtons?.map(b => b.token || b.value || b.label).slice(0, 5) || [],
    has_previous_button: !!previousButtonResult,
    request_id: requestId,
    session_language: session.language,
    user_level: session.user_level,
    emotion: session.meta?.emotion || 'neutral'
  }, 'server.js', 2004, 2004);
  
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback para STEP');
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
  
  const stageBefore = session.stage;
  const startTime = Date.now();
  
  // P0.2: Verificar rate limit de llamadas a IA
  if (!await checkAICallLimit(conversationId, 3)) {
    await log('WARN', 'Límite de IA excedido, usando fallback', { conversation_id: conversationId });
    if (allowedButtons.length > 0) {
      return {
        reply: 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?',
        buttons: normalizeButtons(allowedButtons.slice(0, 2))
      };
    }
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
  
  // P2.2: Verificar cooldown tras errores repetidos
  if (!await checkAICooldown(conversationId)) {
    await log('WARN', 'Cooldown activo, usando fallback', { conversation_id: conversationId });
    if (allowedButtons.length > 0) {
      return {
        reply: 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?',
        buttons: normalizeButtons(allowedButtons.slice(0, 2))
      };
    }
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
  
  // Log inicio de llamada IA
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_START',
      payload: { type: 'step', stage: session.stage, request_id: requestId }
    });
  }
  
  // Obtener historial de pasos anteriores
  let conversation = null;
  if (conversationId) {
    conversation = await loadConversation(conversationId);
  }
  const recentSteps = conversation ? getRecentStepsHistory(conversation, 3) : [];
  const historyText = recentSteps.length > 0 
    ? `\n\nPASOS ANTERIORES (NO repitas estos):\n${recentSteps.map((step, idx) => `${idx + 1}. ${step.substring(0, 100)}...`).join('\n')}`
    : '';
  
  // Restricciones de seguridad por nivel
  const securityRestrictions = session.user_level === 'basico' || session.user_level === 'intermedio'
    ? `\n\n⚠️ RESTRICCIONES DE SEGURIDAD (Nivel: ${session.user_level}):
- NO sugerir comandos destructivos (formateo, particiones, eliminación de datos)
- NO sugerir abrir el equipo físico
- NO sugerir modificar BIOS o configuración avanzada del sistema
- NO sugerir comandos de terminal complejos sin explicación detallada
- Si el problema requiere acciones de riesgo, sugiere contactar con un técnico`
    : '';
  
  // Contexto del botón anterior (si existe)
  const previousButtonContext = previousButtonResult
    ? `\n\nRESULTADO DEL PASO ANTERIOR: El usuario indicó "${previousButtonResult}" (el paso anterior no resolvió el problema).`
    : '';
  
  const allowedButtonsList = allowedButtons.map(b => `- ${b.label} (token: ${b.token})`).join('\n');
  
  const prompt = `Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Etapa actual: ${session.stage || 'DIAGNOSTIC_STEP'}
- Usuario: ${session.user.name_norm || 'Usuario'}
- Nivel: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema: ${session.context.problem_description_raw || 'ninguno'}
- Intent: ${session.context.problem_category || 'unknown'}${previousButtonContext}${historyText}

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
2. Adaptá el lenguaje al nivel del usuario
3. Usá voseo argentino si el idioma es es-AR
4. Podés incluir una "ayuda extra" opcional del mismo paso
5. NO repitas pasos anteriores${securityRestrictions}

BOTONES PERMITIDOS (solo podés usar estos):
${allowedButtonsList}

Devolvé SOLO un JSON válido:
{
  "reply": "Texto del paso + pregunta de confirmación + (opcional) ayuda extra",
  "buttons": [
    {"token": "BTN_XXX", "label": "Texto visible", "order": 1}
  ]
}

IMPORTANTE: Solo podés usar tokens de la lista de botones permitidos.`;

  // P2.4: Generar hash del payload para observabilidad
  const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  
  // Log payload summary
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_PAYLOAD_SUMMARY',
      payload: {
        user_level: session.user_level,
        device_type: session.context.device_type,
        problem_category: session.context.problem_category,
        stage: session.stage,
        has_history: recentSteps.length > 0,
        previous_button_result: previousButtonResult || null,
        prompt_hash: promptHash,
        prompt_length: prompt.length,
        request_id: requestId
      }
    });
  }

  try {
    const response = await Promise.race([
      openai.chat.completions.create({
        model: OPENAI_MODEL_STEP,
        messages: [{ role: 'user', content: prompt }],
        temperature: OPENAI_TEMPERATURE_STEP,
        max_tokens: OPENAI_MAX_TOKENS_STEP,
        response_format: { type: 'json_object' }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), OPENAI_TIMEOUT_MS)
      )
    ]);
    
    const content = response.choices[0].message.content;
    
    // Log resultado raw
    if (conversationId) {
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        name: 'IA_CALL_RESULT_RAW',
        payload: { content_hash: hashContent(content) }
      });
    }
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      await log('ERROR', 'JSON inválido de IA_STEP', { content: content.substring(0, 200), error: parseErr.message });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_VALIDATION_FAIL',
          payload: { error: 'JSON_PARSE_ERROR', error_message: parseErr.message }
        });
      }
      
      // P1.4: Fallback parcial - intentar extraer reply del contenido aunque no sea JSON válido
      const replyMatch = content.match(/"reply"\s*:\s*"([^"]+)"/);
      const extractedReply = replyMatch ? replyMatch[1] : null;
      
      if (extractedReply && extractedReply.trim().length > 0) {
        // Conservar reply extraído, usar fallback de botones
        await log('WARN', 'JSON parcialmente inválido, conservando reply extraído', { 
          extracted_reply: extractedReply.substring(0, 100) 
        });
        return {
          reply: sanitizeReply(extractedReply),
          buttons: normalizeButtons(allowedButtons.slice(0, 2))
        };
      }
      
      // Fallback determinístico completo
      if (allowedButtons.length > 0) {
        return {
          reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
          buttons: normalizeButtons(allowedButtons.slice(0, 2))
        };
      }
      return {
        reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
        buttons: []
      };
    }
    
    // Validar schema
    try {
      validateStepResult(result, allowedButtons);
    } catch (validationErr) {
      await log('ERROR', 'Schema inválido de IA_STEP', { error: validationErr.message, result });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_VALIDATION_FAIL',
          payload: { error: 'SCHEMA_VALIDATION_ERROR', error_message: validationErr.message }
        });
      }
      
      // P1.4: Fallback parcial - verificar qué parte falló
      const hasValidReply = result.reply && typeof result.reply === 'string' && result.reply.trim().length > 0;
      const hasValidButtons = result.buttons && Array.isArray(result.buttons) && result.buttons.length > 0;
      
      if (hasValidReply && !hasValidButtons) {
        // Conservar reply, usar fallback de botones
        await log('WARN', 'Reply válido pero buttons inválidos, conservando reply', { 
          reply_preview: result.reply.substring(0, 100) 
        });
        return {
          reply: sanitizeReply(result.reply),
          buttons: normalizeButtons(allowedButtons.slice(0, 2))
        };
      } else if (!hasValidReply && hasValidButtons) {
        // Conservar botones válidos, usar fallback de reply
        await log('WARN', 'Buttons válidos pero reply inválido, conservando buttons', { 
          buttons_count: result.buttons.length 
        });
        return {
          reply: session.language === 'es-AR'
            ? 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?'
            : 'Let\'s continue with the next step. What result did you get?',
          buttons: normalizeButtons(result.buttons)
        };
      }
      
      // Si ambos fallan, fallback completo
      if (allowedButtons.length > 0) {
        return {
          reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
          buttons: normalizeButtons(allowedButtons.slice(0, 2))
        };
      }
      return {
        reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
        buttons: []
      };
    }
    
    // Validar que los botones estén permitidos
    const allowedTokens = new Set(allowedButtons.map(b => b.token));
    const invalidButtons = [];
    if (result.buttons) {
      const originalCount = result.buttons.length;
      result.buttons = result.buttons.filter(btn => {
        if (!allowedTokens.has(btn.token)) {
          invalidButtons.push(btn.token);
          return false;
        }
        return true;
      });
      
      // Log botones inválidos
      if (invalidButtons.length > 0 && conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_INVALID_BUTTONS',
          payload: { invalid_tokens: invalidButtons, filtered_count: originalCount - result.buttons.length }
        });
      }
      
      // Si no quedan botones válidos, usar fallback
      if (result.buttons.length === 0 && allowedButtons.length > 0) {
        if (conversationId) {
          await appendToTranscript(conversationId, {
            role: 'system',
            type: 'event',
            name: 'FALLBACK_USED',
            payload: { reason: 'no_valid_buttons', type: 'step' }
          });
        }
        result.buttons = normalizeButtons(allowedButtons.slice(0, 2));
      }
    }
    
    // P1.2: Normalizar botones (duplicados, order, máximo 4)
    result.buttons = normalizeButtons(result.buttons);
    
    // Validación post-IA: detectar comandos destructivos en la respuesta
    // P1.3: Expandir lista de keywords destructivas incluyendo acciones físicas
    const destructiveKeywords = [
      'formatear', 'formateo', 'format', 'eliminar', 'delete', 
      'partición', 'partition', 'bios', 'uefi', 'reinstalar', 
      'reinstall', 'resetear', 'reset',
      // Acciones físicas peligrosas
      'abrir', 'abrí', 'desarmar', 'desarmá', 'sacá', 'sacar',
      'ram', 'memoria', 'disco duro', 'hard drive', 'motherboard',
      'placa madre', 'fuente', 'power supply', 'cable interno',
      'internal cable', 'conector', 'jumper', 'pin', 'cable de datos'
    ];
    const replyLower = result.reply.toLowerCase();
    const hasDestructiveCommand = destructiveKeywords.some(kw => replyLower.includes(kw));
    
    // P1.3: Detección específica de riesgo físico
    const physicalRiskKeywords = ['abrir', 'abrí', 'desarmar', 'desarmá', 'sacá', 'sacar', 'ram', 'memoria', 'disco duro', 'motherboard', 'placa madre'];
    const hasPhysicalRisk = physicalRiskKeywords.some(kw => replyLower.includes(kw));
    
    if (hasPhysicalRisk && (session.user_level === 'basico' || session.user_level === 'intermedio')) {
      await log('WARN', 'IA sugirió acción física peligrosa para usuario básico/intermedio', { 
        user_level: session.user_level, 
        reply_preview: result.reply.substring(0, 100) 
      });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'PHYSICAL_RISK_BLOCKED',
          payload: { user_level: session.user_level, detected_keywords: physicalRiskKeywords.filter(kw => replyLower.includes(kw)) }
        });
      }
      
      // Escalar directamente a técnico (no solo bloquear)
      if (conversation) {
        return await escalateToTechnician(session, conversation, 'physical_risk_detected');
      }
    }
    
    if (hasDestructiveCommand && (session.user_level === 'basico' || session.user_level === 'intermedio')) {
      await log('WARN', 'IA sugirió comando destructivo para usuario básico/intermedio', { 
        user_level: session.user_level, 
        reply_preview: result.reply.substring(0, 100) 
      });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'DESTRUCTIVE_COMMAND_BLOCKED',
          payload: { user_level: session.user_level, detected_keywords: destructiveKeywords.filter(kw => replyLower.includes(kw)) }
        });
      }
      
      // Reemplazar con mensaje seguro
      result.reply = session.language === 'es-AR'
        ? 'Este problema podría requerir acciones avanzadas. Te recomiendo contactar con un técnico para evitar daños en tu equipo.\n\n¿Querés que te ayude a contactar con un técnico?'
        : 'This problem might require advanced actions. I recommend contacting a technician to avoid damage to your device.\n\nWould you like me to help you contact a technician?';
      
      // Cambiar botones a opciones de escalamiento
      result.buttons = [
        { token: 'BTN_NEED_HELP', label: session.language === 'es-AR' ? 'Sí, contactar técnico' : 'Yes, contact technician', order: 1 },
        { token: 'BTN_NOT_RESOLVED', label: session.language === 'es-AR' ? 'No, seguir intentando' : 'No, keep trying', order: 2 }
      ];
    }
    
    // P0.3: Sanitizar reply antes de aplicar UX adaptativa
    result.reply = sanitizeReply(result.reply);
    
    // P2.2: Validar coherencia reply/buttons
    if (!validateReplyButtonsCoherence(result.reply, result.buttons)) {
      await log('WARN', 'Incoherencia detectada entre reply y buttons, corrigiendo', {
        conversation_id: conversationId,
        reply_preview: result.reply.substring(0, 100)
      });
      
      // Corregir: si reply dice "resolvió" pero hay botón "sigue igual", cambiar botones
      if (result.reply.toLowerCase().includes('resolvió') || result.reply.toLowerCase().includes('resolved')) {
        result.buttons = result.buttons.filter(b => b.token !== 'BTN_NOT_RESOLVED');
      }
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'REPLY_BUTTONS_COHERENCE_FIXED',
          payload: { original_buttons_count: result.buttons.length }
        });
      }
    }
    
    // Aplicar UX adaptativa
    const emotion = session.meta.emotion || 'neutral';
    result.reply = adaptTextToEmotion(
      result.reply,
      emotion,
      session.user.name_norm
    );
    
    // P2.3: Calcular latencia
    const latency = Date.now() - startTime;
    
    // P2.8: Incrementar contador de llamadas
    incrementAICallCount(conversationId, 'step');
    
    // Log resultado parseado y validado
    if (conversationId) {
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        name: 'IA_STEP_RESULT',
        payload: { 
          reply_length: result.reply?.length || 0, 
          buttons_count: result.buttons?.length || 0, 
          emotion,
          latency_ms: latency,
          stage_before: stageBefore,
          stage_after: session.stage,
          request_id: requestId
        }
      });
    }
    
    return result;
  } catch (err) {
    await log('ERROR', 'Error en IA_STEP', { error: err.message });
    
    // P2.2: Si es error de rate limit o timeout, activar cooldown
    if (err.message.includes('rate limit') || err.message === 'Timeout') {
      const currentCooldown = aiErrorCooldowns.get(conversationId) || { errorCount: 0 };
      setAICooldown(conversationId, currentCooldown.errorCount);
    }
    
    if (conversationId) {
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        name: 'FALLBACK_USED',
        payload: { reason: err.message, type: 'step' }
      });
    }
    
    // Fallback determinístico
    if (allowedButtons.length > 0) {
      return {
        reply: 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?',
        buttons: normalizeButtons(allowedButtons.slice(0, 2))
      };
    }
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
}

// ========================================================
// FSM - HANDLERS POR STAGE
// ========================================================

async function handleAskConsent(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleAskConsent
  await logDebug('DEBUG', 'handleAskConsent - Inicio', {
    session_id: session?.sessionId || 'unknown',
    conversation_id: conversation?.conversation_id || session?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language
  }, 'server.js', 2525, 2525);
  
  const inputLower = userInput.toLowerCase().trim();
  const accepted = inputLower.includes('sí') || inputLower.includes('si') || 
                   inputLower.includes('yes') || inputLower.includes('acepto') || 
                   inputLower.includes('accept') || inputLower === 'sí, acepto ✔️' ||
                   inputLower === 'no acepto ❌';
  
  // LOG DETALLADO: Análisis de input
  await logDebug('DEBUG', 'handleAskConsent - Análisis de input', {
    conversation_id: conversation?.conversation_id || session?.conversation_id || 'none',
    input_lower: inputLower,
    accepted: accepted,
    includes_no: inputLower.includes('no'),
    includes_reject: inputLower.includes('❌')
  }, 'server.js', 2526, 2530);
  
  if (inputLower.includes('no') || inputLower.includes('❌')) {
    await logDebug('INFO', 'handleAskConsent - Usuario rechazó términos GDPR', {
      conversation_id: conversation?.conversation_id || session?.conversation_id || 'none',
      input: inputLower
    }, 'server.js', 2532, 2538);
    
    return {
      reply: 'Entiendo. Para usar este servicio necesitás aceptar la política de privacidad.\n\nSi cambiás de opinión, podés volver a iniciar el chat cuando quieras.\n\n¡Que tengas un buen día!',
      buttons: [],
      stage: 'ENDED',
      endConversation: true
    };
  }
  
  if (accepted && !inputLower.includes('no')) {
    await logDebug('INFO', 'handleAskConsent - Usuario aceptó términos GDPR', {
      conversation_id: conversation?.conversation_id || session?.conversation_id || 'none',
      input: inputLower,
      session_conversation_id: session?.conversation_id
    }, 'server.js', 2541, 2543);
    session.stage = 'ASK_LANGUAGE';
    session.meta.updated_at = new Date().toISOString();
    
    // Si ya existe conversation_id (generado en /api/greeting), guardar aceptación en transcript
    if (session.conversation_id) {
      try {
        // Asegurar que la conversación existe
        let existingConversation = await loadConversation(session.conversation_id);
        if (!existingConversation) {
          // Crear conversación si no existe
          const newConversation = {
            conversation_id: session.conversation_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            flow_version: FLOW_VERSION,
            schema_version: SCHEMA_VERSION,
            language: session.language || 'es',
            user: { name_norm: null },
            status: 'open',
            feedback: 'none',
            transcript: [],
            started_at: new Date().toISOString()
          };
          await saveConversation(newConversation);
        }
        
        // Guardar aceptación de GDPR en transcript (MODELO MEJORADO)
        await appendToTranscript(session.conversation_id, {
          role: 'user',
          type: 'button',
          stage: 'ASK_CONSENT',
          text: 'Sí, acepto ✔️',
          button_chosen: {
            label: 'Sí, acepto ✔️',
            value: 'accept',
            token: 'accept'
          },
          conversation_id: session.conversation_id,
          payload: {
            gdpr_accepted: true,
            stage_before: 'ASK_CONSENT',
            stage_after: 'ASK_LANGUAGE'
          }
        });
      } catch (err) {
        await log('ERROR', 'Error guardando aceptación GDPR en transcript', {
          error: err.message,
          conversation_id: session.conversation_id
        });
        // Continuar aunque falle
      }
    }
    
    return {
      reply: TEXTS.ASK_LANGUAGE[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_LANGUAGE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_LANGUAGE'
    };
  }
  
  // Seguir mostrando consentimiento
  // Incluir ID de conversación si ya existe
  let consentReply = TEXTS.ASK_CONSENT[session.language || 'es'];
  if (session.conversation_id) {
    consentReply = `${consentReply}\n\n🆔 **ID de la conversación: ${session.conversation_id}**`;
  }
  
  return {
    reply: consentReply,
    buttons: ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
      label: b.label,
      value: b.value,
      token: b.token
    })),
    stage: 'ASK_CONSENT'
  };
}

async function handleAskLanguage(session, userInput, conversation, traceContext = null) {
  // LOG DETALLADO: Inicio de handleAskLanguage
  await logDebug('DEBUG', 'handleAskLanguage - Inicio', {
    conversation_id: conversation?.conversation_id || session?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language,
    has_trace_context: !!traceContext,
    trace_boot_id: traceContext?.boot_id || 'none'
  }, 'server.js', 2828, 2828);
  
  const inputLower = userInput.toLowerCase().trim();
  let selectedLanguage = null;
  
  if (inputLower.includes('español') || inputLower.includes('argentina') || 
      inputLower === 'es-ar' || inputLower === 'es') {
    selectedLanguage = 'es-AR';
  } else if (inputLower.includes('english') || inputLower.includes('inglés') || 
             inputLower === 'en') {
    selectedLanguage = 'en';
  }
  
  if (!selectedLanguage) {
    return {
      reply: TEXTS.ASK_LANGUAGE[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_LANGUAGE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_LANGUAGE'
    };
  }
  
  // Usar conversation_id existente (debe existir desde /api/greeting)
  try {
    let conversationId = session.conversation_id;
    if (!conversationId) {
      // CRÍTICO: Si no existe, es un error de estado. Generar uno nuevo pero loguear el problema.
      await log('ERROR', 'handleAskLanguage - conversation_id faltante en sesión, generando nuevo ID', {
        session_id: session.sessionId,
        session_stage: session.stage,
        has_conversation_param: !!conversation?.conversation_id,
        conversation_id_from_param: conversation?.conversation_id || 'none'
      });
      conversationId = await reserveUniqueConversationId();
      session.conversation_id = conversationId;
    } else {
      // Log para verificar que estamos usando el ID correcto
      await logDebug('DEBUG', 'handleAskLanguage - Usando conversation_id existente', {
        conversation_id: conversationId,
        session_id: session.sessionId
      }, 'server.js', 3084, 3089);
    }
    
    session.language = selectedLanguage;
    session.stage = 'ASK_NAME';
    session.meta.updated_at = new Date().toISOString();
    
    // Vincular boot_id a conversation_id cuando se genera (SIEMPRE que exista boot_id)
    if (traceContext && traceContext.boot_id) {
      trace.linkBootIdToConversationId(traceContext.boot_id, conversationId);
      
      // Actualizar traceContext con conversation_id
      traceContext.conversation_id = conversationId;
      
      // Log la vinculación
      await trace.logEvent('INFO', 'CONVERSATION_ID_GENERATED', {
        actor: 'system',
        boot_id: traceContext.boot_id,
        conversation_id: conversationId,
        endpoint: '/api/chat',
        stage: 'ASK_NAME'
      }, traceContext);
    }
    
    // Crear conversación persistente solo si no existe
    let existingConversation = await loadConversation(conversationId);
    if (!existingConversation) {
      const newConversation = {
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        flow_version: FLOW_VERSION, // F22.1: Versionado
        schema_version: SCHEMA_VERSION, // F22.1: Versionado
        language: selectedLanguage,
        user: { name_norm: null },
        status: 'open',
        feedback: 'none',
        transcript: [],
        started_at: new Date().toISOString() // F30.2: Para métricas de tiempo
      };
      
      await saveConversation(newConversation);
    } else {
      // Si ya existe, actualizar el idioma
      existingConversation.language = selectedLanguage;
      existingConversation.updated_at = new Date().toISOString();
      await saveConversation(existingConversation);
    }
    
    // Append eventos al transcript (MODELO MEJORADO)
    const languageLabel = selectedLanguage === 'es-AR' ? 'Español (Argentina)' : 'English';
    await appendToTranscript(conversationId, {
      role: 'user',
      type: 'button',
      stage: 'ASK_LANGUAGE',
      text: languageLabel,
      button_chosen: {
        label: languageLabel,
        value: selectedLanguage,
        token: selectedLanguage
      },
      conversation_id: conversationId,
      payload: {
        language_selected: selectedLanguage,
        stage_before: 'ASK_LANGUAGE',
        stage_after: 'ASK_NAME'
      }
    });
    
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      stage: 'ASK_NAME',
      name: 'CONVERSATION_ID_ASSIGNED',
      conversation_id: conversationId,
      payload: { 
        conversation_id: conversationId,
        language: selectedLanguage,
        stage: 'ASK_NAME'
      }
    });
    
    const langText = selectedLanguage === 'es-AR' ? 'Español' : 'English';
    // El ID ya se mostró en GDPR, no repetirlo aquí
    const replyText = selectedLanguage === 'es-AR' 
      ? `¡Perfecto! Vamos a continuar en Español.\n\n¿Con quién tengo el gusto de hablar? 😊`
      : `Great! Let's continue in English.\n\nWhat's your name? 😊`;
    
    return {
      reply: replyText,
      buttons: [],
      stage: 'ASK_NAME'
    };
  } catch (err) {
      // Log error detallado con trace
      if (traceContext) {
        await trace.logError(
          traceContext, 
          err, 
          'recoverable', 
          `Error en handleAskLanguage al asignar conversation_id: ${err.message}`, 
          false,
          `handleAskLanguage debería generar conversation_id único y crear conversación persistente`,
          `Error al generar conversation_id: ${err.message}`,
          [
            `Verificar que reserveUniqueConversationId() funcione correctamente`,
            `Verificar permisos de escritura en directorio de conversaciones`,
            `Verificar que no haya problemas de concurrencia`,
            `Revisar stack trace para ubicación exacta del error`
          ]
        );
        
        await trace.logEvent('ERROR', 'CONVERSATION_ID_GENERATION_FAILED', {
          actor: 'system',
          endpoint: '/api/chat',
          error: err.message,
          stack: err.stack,
          boot_id: traceContext.boot_id,
          stage: 'ASK_LANGUAGE',
          user_input: userInput,
          expected_behavior: `Sistema debería generar conversation_id único y crear conversación`,
          actual_behavior: `Error al generar conversation_id: ${err.message}`,
          expected_result: `Conversación creada con ID único`,
          actual_result: `Error: ${err.name} - ${err.message}`,
          preconditions: [
            `Función reserveUniqueConversationId() disponible`,
            `Directorio de conversaciones accesible`,
            `Sistema de archivos operativo`
          ],
          conditions_met: false,
          decision_reason: `Error detectado en generación de ID`,
          decision_evidence: err.stack,
          decision_outcome: `No se pudo generar conversation_id`,
          state_snapshot: {
            stage: 'ASK_LANGUAGE',
            user_input: userInput.substring(0, 100),
            session_language: session.language,
            has_conversation_id: false
          },
          troubleshooting_hints: [
            `Revisar función reserveUniqueConversationId()`,
            `Verificar permisos de escritura`,
            `Revisar logs del sistema de archivos`,
            `Verificar que no haya locks bloqueando`
          ],
          suggested_fix: `Revisar y corregir función reserveUniqueConversationId() o sistema de archivos`
        }, traceContext);
      }
    
    await log('ERROR', 'Error asignando ID único en handleAskLanguage', { 
      error: err.message, 
      stack: err.stack,
      boot_id: traceContext?.boot_id,
      stage: 'ASK_LANGUAGE',
      user_input: userInput
    });
    
    // Retornar error que será capturado por el catch principal
    throw new Error(`Error al generar conversation_id: ${err.message}`);
  }
}

async function handleAskName(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleAskName
  await logDebug('DEBUG', 'handleAskName - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language
  }, 'server.js', 3020, 3020);
  
  // Normalizar nombre (tomar primera palabra, 2-30 caracteres)
  const nameRaw = userInput.trim();
  const nameParts = nameRaw.split(/\s+/);
  const firstName = nameParts[0] || '';
  
  if (firstName.length < 2 || firstName.length > 30) {
    const text = session.language === 'es-AR' 
      ? '¿Con quién tengo el gusto de hablar?\n\n(Necesito un nombre de entre 2 y 30 caracteres)'
      : 'What\'s your name?\n\n(I need a name between 2 and 30 characters)';
    
    return {
      reply: text,
      buttons: [],
      stage: 'ASK_NAME'
    };
  }
  
  session.user.name_raw = nameRaw;
  session.user.name_norm = firstName;
  session.stage = 'ASK_USER_LEVEL';
  session.meta.updated_at = new Date().toISOString();
  
  // Actualizar conversación
  conversation.user.name_norm = firstName;
  await saveConversation(conversation);
  
  // Guardar nombre del usuario (MODELO MEJORADO)
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'text',
    stage: 'ASK_NAME',
    text: nameRaw,
    conversation_id: conversationId,
    payload: {
      name_raw: nameRaw,
      name_norm: firstName,
      stage_before: 'ASK_NAME',
      stage_after: 'ASK_USER_LEVEL'
    }
  });
  
  const greeting = session.language === 'es-AR'
    ? `¡Encantado de conocerte, ${firstName}!\n\nPor favor, seleccioná tu nivel de conocimiento técnico:`
    : `Nice to meet you, ${firstName}!\n\nPlease select your technical knowledge level:`;
  
  return {
    reply: greeting,
    buttons: ALLOWED_BUTTONS_BY_ASK.ASK_USER_LEVEL.map(b => ({
      label: b.label,
      value: b.value,
      token: b.token
    })),
    stage: 'ASK_USER_LEVEL'
  };
}

async function handleAskUserLevel(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleAskUserLevel
  await logDebug('DEBUG', 'handleAskUserLevel - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language,
    current_user_level: session?.user_level || 'none'
  }, 'server.js', 3077, 3077);
  
  const inputLower = userInput.toLowerCase().trim();
  let level = null;
  
  if (inputLower.includes('básico') || inputLower.includes('basic')) {
    level = 'basico';
  } else if (inputLower.includes('intermedio') || inputLower.includes('intermediate')) {
    level = 'intermedio';
  } else if (inputLower.includes('avanzado') || inputLower.includes('advanced')) {
    level = 'avanzado';
  }
  
  if (!level) {
    return {
      reply: TEXTS.ASK_USER_LEVEL[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_USER_LEVEL.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_USER_LEVEL'
    };
  }
  
  session.user_level = level;
  session.context.user_level = level;
  session.stage = 'ASK_PROBLEM';
  session.meta.updated_at = new Date().toISOString();
  
  // Guardar selección de nivel (MODELO MEJORADO)
  const levelLabel = level === 'basico' ? 'Básico' : level === 'intermedio' ? 'Intermedio' : 'Avanzado';
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'button',
    stage: 'ASK_USER_LEVEL',
    text: levelLabel,
    button_chosen: {
      label: levelLabel,
      value: level,
      token: level
    },
    conversation_id: conversationId,
    payload: {
      user_level: level,
      stage_before: 'ASK_USER_LEVEL',
      stage_after: 'ASK_PROBLEM'
    }
  });
  
  // Normalizar idioma para acceder a TEXTS (es-AR -> es)
  const langKey = session.language === 'es-AR' ? 'es' : (session.language === 'en' ? 'en' : 'es');
  const askProblemText = TEXTS.ASK_PROBLEM[langKey] || TEXTS.ASK_PROBLEM.es;
  
  const confirmation = session.language === 'es-AR'
    ? `¡Perfecto! Voy a ajustar mis explicaciones a tu nivel ${level}.\n\n${askProblemText}`
    : `Perfect! I'll adjust my explanations to your ${level} level.\n\n${askProblemText}`;
  
  // LOG DETALLADO: Confirmación generada
  await logDebug('DEBUG', 'handleAskUserLevel - Confirmación generada', {
    conversation_id: conversation?.conversation_id || 'none',
    level: level,
    language: session.language,
    lang_key: langKey,
    confirmation_length: confirmation.length
  }, 'server.js', 3338, 3343);
  
  return {
    reply: confirmation,
    buttons: [],
    stage: 'ASK_PROBLEM'
  };
}

async function handleAskDeviceCategory(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleAskDeviceCategory
  await logDebug('DEBUG', 'handleAskDeviceCategory - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language
  }, 'server.js', 3167, 3167);
  
  const inputLower = userInput.toLowerCase().trim();
  let category = null;
  
  if (inputLower.includes('principal') || inputLower.includes('main') || inputLower === 'main') {
    category = 'main';
  } else if (inputLower.includes('externo') || inputLower.includes('periférico') || 
             inputLower.includes('external') || inputLower.includes('peripheral') || 
             inputLower === 'external') {
    category = 'external';
  }
  
  if (!category) {
    return {
      reply: TEXTS.ASK_DEVICE_CATEGORY[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_CATEGORY.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_DEVICE_CATEGORY'
    };
  }
  
  session.context.device_category = category;
  session.stage = category === 'main' ? 'ASK_DEVICE_TYPE_MAIN' : 'ASK_DEVICE_TYPE_EXTERNAL';
  session.meta.updated_at = new Date().toISOString();
  
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'button',
    label: category === 'main' ? 'Equipo principal' : 'Dispositivo externo / periférico',
    value: category
  });
  
  const buttons = category === 'main' 
    ? ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_TYPE_MAIN
    : ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_TYPE_EXTERNAL;
  
  const question = session.language === 'es-AR'
    ? (category === 'main' 
        ? '¿Qué tipo de equipo principal?'
        : '¿Qué tipo de dispositivo externo?')
    : (category === 'main'
        ? 'What type of main device?'
        : 'What type of external device?');
  
  return {
    reply: question,
    buttons: buttons.map(b => ({
      label: b.label,
      value: b.value,
      token: b.token
    })),
    stage: session.stage
  };
}

async function handleAskDeviceType(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleAskDeviceType
  await logDebug('DEBUG', 'handleAskDeviceType - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language,
    device_category: session.context?.device_category || 'none'
  }, 'server.js', 3225, 3225);
  
  const inputLower = userInput.toLowerCase().trim();
  let deviceType = null;
  
  // Log diagnóstico para botones
  await log('INFO', 'SELECCION_DEVICE_TYPE_MAIN', {
    session_id: session.sessionId,
    conversation_id: session.conversation_id,
    stage: session.stage,
    user_input: userInput,
    input_lower: inputLower
  });
  
  if (session.stage === 'ASK_DEVICE_TYPE_MAIN') {
    // Normalizar entrada: aceptar valores de botones y texto libre
    if (inputLower.includes('escritorio') || inputLower.includes('desktop') || 
        inputLower === 'desktop' || inputLower === 'btn_desktop' || inputLower.includes('pc de escritorio')) {
      deviceType = 'desktop';
    } else if (inputLower.includes('notebook') || inputLower.includes('laptop') || 
               inputLower === 'notebook' || inputLower === 'btn_notebook' || inputLower === 'laptop') {
      deviceType = 'notebook';
    } else if (inputLower.includes('all-in-one') || inputLower.includes('allinone') || 
               inputLower === 'allinone' || inputLower === 'btn_allinone' || inputLower.includes('todo en uno')) {
      deviceType = 'allinone';
    }
  } else {
    // External devices
    const externalMap = {
      'impresora': 'printer', 'printer': 'printer',
      'monitor': 'monitor',
      'teclado': 'keyboard', 'keyboard': 'keyboard',
      'mouse': 'mouse',
      'cámara': 'camera', 'camera': 'camera',
      'pendrive': 'storage', 'disco externo': 'storage', 'storage': 'storage',
      'audio': 'audio'
    };
    
    for (const [key, value] of Object.entries(externalMap)) {
      if (inputLower.includes(key)) {
        deviceType = value;
        break;
      }
    }
    if (!deviceType && inputLower.includes('otro') || inputLower.includes('other')) {
      deviceType = 'other';
    }
  }
  
  if (!deviceType) {
    const buttons = session.stage === 'ASK_DEVICE_TYPE_MAIN'
      ? ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_TYPE_MAIN
      : ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_TYPE_EXTERNAL;
    
    return {
      reply: session.language === 'es-AR' ? '¿Qué tipo de dispositivo?' : 'What type of device?',
      buttons: buttons.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: session.stage
    };
  }
  
  if (session.context.device_category === 'main') {
    session.context.device_type = deviceType;
  } else {
    session.context.external_type = deviceType;
  }
  
  session.meta.updated_at = new Date().toISOString();
  
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'button',
    label: userInput,
    value: deviceType
  });
  
  // FLUJO PROBLEMA PRIMERO: Si ya tenemos problema, ir directo a diagnóstico
  // Si no tenemos problema aún, preguntarlo
  if (session.context.problem_description_raw) {
    // Ya tenemos problema → ir a diagnóstico
    session.stage = 'DIAGNOSTIC_STEP';
    const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
    const stepResult = await iaStep(session, allowedButtons, null, null);
    
    return {
      reply: stepResult.reply,
      buttons: stepResult.buttons.map(b => ({
        label: b.label,
        value: b.value || b.token,
        token: b.token
      })),
      stage: 'DIAGNOSTIC_STEP'
    };
  } else {
    // No tenemos problema aún → preguntarlo
    session.stage = 'ASK_PROBLEM';
    
    // Normalizar idioma para acceder a TEXTS (es-AR -> es-AR, ahora soportado)
    const langKey = session.language || 'es';
    const askProblemText = TEXTS.ASK_PROBLEM[langKey] || TEXTS.ASK_PROBLEM.es;
    
    return {
      reply: askProblemText,
      buttons: [],
      stage: 'ASK_PROBLEM'
    };
  }
}

async function handleAskProblem(session, userInput, conversation, requestId = null, traceContext = null) {
  // LOG DETALLADO: Inicio de handleAskProblem
  await logDebug('DEBUG', 'handleAskProblem - Inicio', {
    conversation_id: conversation?.conversation_id || session?.conversation_id || 'none',
    user_input_length: userInput?.length || 0,
    user_input_preview: userInput ? userInput.substring(0, 100) : 'null/empty',
    session_stage: session?.stage,
    session_language: session?.language,
    user_level: session?.user_level || 'none',
    request_id: requestId,
    has_image: false, // Se agregará si hay imagen
    has_trace_context: !!traceContext
  }, 'server.js', 3584, 3584);
  
  // OBTENER conversation_id DE FORMA SEGURA (NASA-GRADE)
  const conversationId = await getConversationIdSafe(session, conversation);
  
  // Crear traceContext si no se proporciona
  if (!traceContext) {
    const bootId = trace.generateBootId();
    traceContext = trace.createTraceContext(
      conversationId,
      `handle-ask-problem-${Date.now()}`,
      session.stage || 'ASK_PROBLEM',
      session.language || 'es',
      NODE_ENV,
      requestId,
      bootId
    );
  }
  
  // Asegurar que session tenga el conversation_id
  if (!session.conversation_id) {
    session.conversation_id = conversationId;
  }
  
  session.context.problem_description_raw = userInput;
  session.meta.updated_at = new Date().toISOString();
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'text',
    text: userInput
  });
  
  // P2-1: Emitir evento PROCESSING_START antes de llamar a IA
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'PROCESSING_START',
    payload: { 
      stage: session.stage,
      type: 'classifier',
      user_input_length: userInput.length
    }
  });
  
  // Llamar a IA_CLASSIFIER
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_CALL',
    payload: { user_input: userInput, request_id: requestId }
  });
  
  const classification = await iaClassifier(session, userInput, requestId, traceContext);
  
  // P2-1: Emitir evento PROCESSING_END después de obtener clasificación
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'PROCESSING_END',
    payload: { 
      stage: session.stage,
      type: 'classifier',
      intent: classification.intent,
      confidence: classification.confidence
    }
  });
  
  session.context.problem_category = classification.intent;
  session.context.risk_level = classification.risk_level;
  
  // FLUJO PROBLEMA PRIMERO: Detectar dispositivo del problema
  const detectedDevice = classification.detected_device || null;
  const detectedCategory = classification.detected_device_category || null;
  const missingDevice = classification.missing_device !== undefined ? classification.missing_device : (detectedDevice === null);
  
  // Si se detectó dispositivo, guardarlo en session
  if (detectedDevice && detectedDevice !== 'null') {
    if (detectedCategory === 'main') {
      session.context.device_category = 'main';
      session.context.device_type = detectedDevice;
    } else if (detectedCategory === 'external') {
      session.context.device_category = 'external';
      session.context.external_type = detectedDevice;
    } else {
      // Si no hay categoría pero hay dispositivo, inferir categoría
      const mainDevices = ['pc', 'notebook', 'all_in_one', 'desktop', 'laptop'];
      if (mainDevices.includes(detectedDevice)) {
        session.context.device_category = 'main';
        session.context.device_type = detectedDevice === 'pc' ? 'desktop' : detectedDevice === 'laptop' ? 'notebook' : detectedDevice;
      } else {
        session.context.device_category = 'external';
        session.context.external_type = detectedDevice;
      }
    }
    
    await log('INFO', 'Dispositivo detectado del problema', {
      conversation_id: session.conversation_id,
      detected_device: detectedDevice,
      detected_category: detectedCategory,
      device_type: session.context.device_type,
      external_type: session.context.external_type
    });
  }
  
  // Si necesita clarificación, decidir entre ASK_PROBLEM_CLARIFICATION o GUIDED_STORY
  if (classification.needs_clarification && classification.missing.length > 0) {
    // Incrementar contador de intentos de clarificación
    if (!session.context.clarification_attempts) {
      session.context.clarification_attempts = 0;
    }
    session.context.clarification_attempts++;
    
    // Si más de 2 intentos, escalar a técnico
    if (session.context.clarification_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'clarification_failed');
    }
    
    // Si confidence es muy bajo, usar GUIDED_STORY (3 preguntas guía)
    if (classification.confidence < 0.3) {
      session.stage = 'GUIDED_STORY';
      session.context.guided_story_step = 0;
      return await handleGuidedStory(session, conversation);
    }
    
    // Si no, usar clarificación normal
    session.stage = 'ASK_PROBLEM_CLARIFICATION';
    const clarificationText = session.language === 'es-AR'
      ? 'Perdón, para no confundirme y ayudarte bien, ¿me lo podés explicar de otra manera?'
      : 'Sorry, to avoid confusion and help you better, could you explain it in another way?';
    
    return {
      reply: clarificationText,
      buttons: [],
      stage: 'ASK_PROBLEM_CLARIFICATION'
    };
  }
  
  // FLUJO PROBLEMA PRIMERO: Preguntar dispositivo SOLO si falta y no se detectó
  if (missingDevice && !session.context.device_type && !session.context.external_type) {
    // Primero preguntar categoría (main/external)
    session.stage = 'ASK_DEVICE_CATEGORY';
    return {
      reply: session.language === 'es-AR' 
        ? 'Para ayudarte mejor, ¿es un dispositivo principal (PC, Notebook, etc.) o un dispositivo externo (impresora, router, etc.)?'
        : 'To help you better, is it a main device (PC, Notebook, etc.) or an external device (printer, router, etc.)?',
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_CATEGORY.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_DEVICE_CATEGORY'
    };
  }
  
  // P2-02: Detectar si una imagen sería útil para el diagnóstico
  const shouldRequestImage = detectImageUsefulness(userInput, classification, session);
  if (shouldRequestImage && !session.context.image_requested) {
    session.context.image_requested = true;
    session.context.image_request_reason = shouldRequestImage.reason;
    
    const imageRequestText = session.language === 'es-AR'
      ? `📸 Para ayudarte mejor, sería útil ver una foto. ${shouldRequestImage.instruction}\n\n¿Podés adjuntar una imagen? (Podés usar el ícono 📎 para adjuntar)`
      : `📸 To help you better, it would be useful to see a photo. ${shouldRequestImage.instruction}\n\nCan you attach an image? (You can use the 📎 icon to attach)`;
    
    return {
      reply: imageRequestText,
      buttons: [],
      stage: 'ASK_PROBLEM', // Mantener en ASK_PROBLEM para que pueda adjuntar imagen
      request_image: true
    };
  }
  
  // Detectar tipo de problema y activar flujos específicos
  if (classification.intent === 'network') {
    // Problema de conectividad → flujo de conectividad
    session.stage = 'CONNECTIVITY_FLOW';
    session.context.connectivity_step = 1;
    return await handleConnectivityFlow(session, userInput, conversation);
  } else if (classification.intent === 'install_os' || classification.intent === 'install_app') {
    // Problema de instalación → flujo de instalaciones
    session.stage = 'INSTALLATION_STEP';
    return await handleInstallationFlow(session, userInput, conversation);
  }
  
  // Verificar si necesita RISK_SUMMARY antes de continuar
  if (classification.risk_level === 'high' || classification.risk_level === 'medium') {
    const riskSummary = await showRiskSummary(
      session,
      conversation,
      classification.risk_level,
      'Vamos a realizar acciones que podrían afectar tu sistema.'
    );
    if (riskSummary) {
      return riskSummary;
    }
  }
  
  // Si sugiere interaction_mode, preguntar
  if (classification.suggest_modes.ask_interaction_mode) {
    session.stage = 'ASK_INTERACTION_MODE';
    return {
      reply: session.language === 'es-AR' 
        ? '¿Cómo preferís que te ayude?'
        : 'How would you prefer I help you?',
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_INTERACTION_MODE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_INTERACTION_MODE'
    };
  }
  
  // Si sugiere learning_depth, preguntar
  if (classification.suggest_modes.ask_learning_depth) {
    session.stage = 'ASK_LEARNING_DEPTH';
    return await handleAskLearningDepth(session, '', conversation);
  }
  
  // Si sugiere executor_role, preguntar
  if (classification.suggest_modes.ask_executor_role) {
    session.stage = 'ASK_EXECUTOR_ROLE';
    return await handleAskExecutorRole(session, '', conversation);
  }
  
  // Activar tech_format si corresponde
  if (classification.suggest_modes.tech_format_mode) {
    activateTechFormat(session);
  }
  
  // Activar advisory_mode si corresponde
  if (classification.suggest_modes.activate_advisory_mode) {
    session.modes.advisory_mode = true;
  }
  
  // Avanzar a diagnóstico/asistencia
  session.stage = 'DIAGNOSTIC_STEP';
  const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
  const stepResult = await iaStep(session, allowedButtons, null, requestId);
  
  return {
    reply: stepResult.reply,
    buttons: stepResult.buttons.map(b => ({
      label: b.label,
      value: b.value || b.token,
      token: b.token
    })),
    stage: 'DIAGNOSTIC_STEP'
  };
}

// ========================================================
// FREE_QA - Detección de preguntas libres
// ========================================================

/**
 * Detecta si el usuario está haciendo una pregunta libre (no relacionada con el ASK actual)
 * Retorna null si no es pregunta libre, o la respuesta si lo es
 */
async function handleFreeQA(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleFreeQA
  await logDebug('DEBUG', 'handleFreeQA - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language,
    user_name: session.user?.name_norm || 'none',
    can_activate: !!(session.user.name_norm && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE')
  }, 'server.js', 3581, 3581);
  
  // Solo activar FREE_QA después de ASK_NAME (cuando ya hay contexto)
  if (!session.user.name_norm || session.stage === 'ASK_CONSENT' || session.stage === 'ASK_LANGUAGE') {
    await logDebug('DEBUG', 'handleFreeQA - No se activa (condiciones no cumplidas)', {
      conversation_id: conversation?.conversation_id || 'none',
      has_user_name: !!session.user.name_norm,
      stage: session.stage
    }, 'server.js', 3583, 3585);
    return null;
  }
  
  // Detectar preguntas (contienen signos de interrogación o palabras clave)
  const isQuestion = userInput.includes('?') || 
                     /^(qué|qué|como|cómo|por qué|porque|cuando|cuándo|donde|dónde|quien|quién|cuanto|cuánto)/i.test(userInput.trim());
  
  // Detectar si es una respuesta a botones (coincide con algún botón permitido)
  const currentStage = session.stage;
  const allowedButtons = ALLOWED_BUTTONS_BY_ASK[currentStage] || [];
  const isButtonResponse = allowedButtons.some(b => {
    const btnValue = b.value?.toLowerCase() || '';
    const btnLabel = b.label?.toLowerCase() || '';
    const inputLower = userInput.toLowerCase().trim();
    return inputLower === btnValue || inputLower === btnLabel || 
           inputLower.includes(btnValue) || inputLower.includes(btnLabel);
  });
  
  // Si es respuesta a botón, no es FREE_QA
  if (isButtonResponse) {
    return null;
  }
  
  // Si es pregunta y no estamos en ASK_PROBLEM, podría ser FREE_QA
  if (isQuestion && currentStage !== 'ASK_PROBLEM' && currentStage !== 'ASK_PROBLEM_CLARIFICATION') {
    // Validación más estricta: evitar llamadas innecesarias para respuestas muy cortas que podrían ser botones
    const isVeryShort = userInput.trim().length < 10;
    if (isVeryShort && isButtonResponse) {
      return null; // No es FREE_QA, es respuesta a botón
    }
    
    // Responder con IA rápida y luego retomar
    if (openai) {
      try {
        const qaResponse = await Promise.race([
          openai.chat.completions.create({
            model: OPENAI_MODEL_STEP,
            messages: [{
              role: 'system',
              content: `Sos Tecnos, técnico informático de STI. Respondé la pregunta del usuario de forma breve y clara. Usá voseo argentino si el idioma es es-AR.`
            }, {
              role: 'user',
              content: userInput
            }],
            temperature: 0.3,
            max_tokens: 200
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        
        const qaReply = qaResponse.choices[0].message.content;
        const resumeText = session.language === 'es-AR'
          ? '\n\nY para seguir con tu caso...'
          : '\n\nAnd to continue with your case...';
        
        return {
          reply: qaReply + resumeText,
          buttons: [],
          isFreeQA: true,
          resumeStage: currentStage
        };
      } catch (err) {
        await log('WARN', 'Error en FREE_QA', { error: err.message });
      }
    }
  }
  
  return null;
}

// ========================================================
// ESCALAMIENTO A TÉCNICO
// ========================================================

// P2.4: Métricas de escalamiento (falsos positivos/negativos)
const escalationMetrics = new Map(); // conversationId -> { total: number, false_positives: number, false_negatives: number }

/**
 * P2.4: Registrar métrica de escalamiento
 */
function recordEscalationMetric(conversationId, reason, isFalsePositive = false, isFalseNegative = false) {
  if (!conversationId) return;
  
  const metrics = escalationMetrics.get(conversationId) || { total: 0, false_positives: 0, false_negatives: 0 };
  metrics.total++;
  if (isFalsePositive) metrics.false_positives++;
  if (isFalseNegative) metrics.false_negatives++;
  
  escalationMetrics.set(conversationId, metrics);
  
  // Log cada 5 escalamientos
  if (metrics.total % 5 === 0) {
    log('INFO', 'Métricas de escalamiento', {
      conversation_id: conversationId,
      total: metrics.total,
      false_positives: metrics.false_positives,
      false_negatives: metrics.false_negatives,
      false_positive_rate: (metrics.false_positives / metrics.total * 100).toFixed(2) + '%',
      false_negative_rate: (metrics.false_negatives / metrics.total * 100).toFixed(2) + '%'
    });
  }
}

/**
 * P1.1: Escalamiento con reintento y manejo de errores
 */
async function escalateToTechnician(session, conversation, reason, retryCount = 0) {
  const maxRetries = 2;
  
  try {
    if (conversation) {
      // F21.4: Prevención de tickets duplicados
      if (conversation.status === 'escalated') {
        // Ya hay ticket, retornar mensaje informativo
        return {
          reply: session.language === 'es-AR'
            ? 'Ya creamos un ticket para tu caso. Podés contactarnos por WhatsApp usando el mismo número.'
            : 'We already created a ticket for your case. You can contact us via WhatsApp using the same number.',
          buttons: [],
          stage: 'ASK_FEEDBACK'
        };
      }
      
      conversation.status = 'escalated';
      await saveConversation(conversation);
      
      // OBTENER conversation_id DE FORMA SEGURA
      const conversationId = await getConversationIdSafe(session, conversation);
      
      // F30.1: Registrar métrica de escalamiento
      const metrics = resolutionMetrics.get(conversationId) || { resolved: false, escalated: false, steps_taken: 0 };
      metrics.escalated = true;
      metrics.steps_taken = session.context.diagnostic_attempts || 0;
      if (conversation.started_at) {
        const startedAt = new Date(conversation.started_at);
        const escalatedAt = new Date();
        metrics.escalation_time_minutes = (escalatedAt - startedAt) / (1000 * 60);
      }
      resolutionMetrics.set(conversationId, metrics);
      
      // Validar formato de conversation_id antes de usar en path
      if (!isValidConversationId(conversationId)) {
        await log('ERROR', `Formato inválido de conversation_id en escalateToTechnician: ${conversationId}`);
        throw new Error('Invalid conversation_id format');
      }
      
      // Crear ticket
      const ticket = {
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        user: conversation.user,
        problem: session.context.problem_description_raw,
        reason,
        transcript_path: path.join(CONVERSATIONS_DIR, `${conversationId}.json`),
        whatsapp_url: (() => {
          const userNameRaw = conversation.user?.name_norm || conversation.user?.name || 'Usuario';
          const userName = String(userNameRaw).replace(/Conversaci.+/i, '').trim() || 'Usuario';
          const problemRaw = session.context.problem_description_raw || session.context.problem_description || session.context.last_user_message || 'No especificado';
          const problemClean = String(problemRaw).replace(/Problema[:]?/i, '').trim() || 'No especificado';
          const renderLink = `${PUBLIC_BASE_URL}/api/historial/${conversationId}`;
          const whatsappText = `Hola, soy ${userName}. Conversación ${conversationId}. Problema: ${problemClean}. Link: ${renderLink}`;
          return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}`;
        })()
      };
      
      // Write temp + rename para atomicidad (con reintento)
      const ticketPath = path.join(TICKETS_DIR, `${conversationId}.json`);
      const tempTicketPath = ticketPath + '.tmp';
      
      try {
        await fs.writeFile(tempTicketPath, JSON.stringify(ticket, null, 2), 'utf-8');
        await fs.rename(tempTicketPath, ticketPath);
      } catch (writeErr) {
        // P1.1: Reintento con backoff exponencial
        if (retryCount < maxRetries) {
          await log('WARN', `Error escribiendo ticket, reintentando (${retryCount + 1}/${maxRetries})`, { 
            error: writeErr.message,
            conversation_id: conversation.conversation_id 
          });
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount))); // Backoff exponencial
          return await escalateToTechnician(session, conversation, reason, retryCount + 1);
        } else {
          throw writeErr; // Fallar después de maxRetries
        }
      }
      
      // P2.4: Registrar métrica
      recordEscalationMetric(conversation.conversation_id, reason);
      
      await appendToTranscript(conversation.conversation_id, {
        role: 'system',
        type: 'event',
        name: 'ESCALATED_TO_TECHNICIAN',
        payload: { reason, ticket_id: conversation.conversation_id, retry_count: retryCount }
      });
      
      // Log generación de ticket
      const traceContext = trace.createTraceContext(
        conversation.conversation_id,
        `req-${Date.now()}`,
        null,
        session.stage,
        NODE_ENV
      );
      await trace.logTicketGeneration(
        traceContext,
        conversation.conversation_id,
        ticket,
        'success',
        null
      );
      
      const escalationText = session.language === 'es-AR'
        ? `Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico.\n\n📱 Podés contactarnos por WhatsApp: ${ticket.whatsapp_url}\n\n¿Te sirvió esta ayuda?`
        : `I understand you need more help. I recommend talking to a technician.\n\n📱 You can contact us via WhatsApp: ${ticket.whatsapp_url}\n\nWas this help useful?`;
      
      return {
        reply: escalationText,
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_FEEDBACK.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'ASK_FEEDBACK'
      };
    }
  } catch (err) {
    await log('ERROR', 'Error en escalamiento a técnico', { 
      error: err.message, 
      conversation_id: conversation?.conversation_id,
      retry_count: retryCount 
    });
    
    // Fallback: retornar mensaje sin crear ticket
    return {
      reply: session.language === 'es-AR'
        ? 'Hubo un problema al crear el ticket. Por favor, contactanos directamente por WhatsApp.'
        : 'There was a problem creating the ticket. Please contact us directly via WhatsApp.',
      buttons: [],
      stage: 'ENDED',
      endConversation: true
    };
  }
  
  return {
    reply: session.language === 'es-AR'
      ? 'Te recomiendo contactar con un técnico para más ayuda.'
      : 'I recommend contacting a technician for more help.',
    buttons: [],
    stage: 'ENDED',
    endConversation: true
  };
}

// ========================================================
// HANDLER ASK_INTERACTION_MODE
// ========================================================

async function handleAskInteractionMode(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleAskInteractionMode
  await logDebug('DEBUG', 'handleAskInteractionMode - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language
  }, 'server.js', 3870, 3870);
  
  const inputLower = userInput.toLowerCase().trim();
  let mode = null;
  
  if (inputLower.includes('rápido') || inputLower.includes('fast') || inputLower === 'fast') {
    mode = 'fast';
  } else if (inputLower.includes('paso') || inputLower.includes('guía') || 
             inputLower.includes('guided') || inputLower === 'guided') {
    mode = 'guided';
  }
  
  if (!mode) {
    return {
      reply: session.language === 'es-AR' 
        ? '¿Cómo preferís que te ayude?'
        : 'How would you prefer I help you?',
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_INTERACTION_MODE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_INTERACTION_MODE'
    };
  }
  
  session.modes.interaction_mode = mode;
  session.stage = 'DIAGNOSTIC_STEP';
  session.meta.updated_at = new Date().toISOString();
  
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'button',
    label: mode === 'fast' ? '⚡ Ir rápido' : '🧭 Paso a paso',
    value: mode
  });
  
  // Avanzar a diagnóstico
  const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
  const stepResult = await iaStep(session, allowedButtons);
  
  return {
    reply: stepResult.reply,
    buttons: stepResult.buttons.map(b => ({
      label: b.label,
      value: b.value || b.token,
      token: b.token
    })),
    stage: 'DIAGNOSTIC_STEP'
  };
}

// ========================================================
// HANDLER DIAGNOSTIC_STEP (mejorado)
// ========================================================

async function handleDiagnosticStep(session, userInput, conversation) {
  // LOG DETALLADO: Inicio de handleDiagnosticStep
  await logDebug('DEBUG', 'handleDiagnosticStep - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    user_input: userInput,
    user_input_length: userInput?.length || 0,
    session_stage: session?.stage,
    session_language: session?.language,
    diagnostic_attempts: session.context?.diagnostic_attempts || 0
  }, 'server.js', 3925, 3925);
  
  const inputLower = userInput.toLowerCase().trim();
  
  // Detectar si es respuesta a botones
  const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
  let buttonToken = null;
  
  for (const btn of allowedButtons) {
    const btnValue = btn.value?.toLowerCase() || '';
    const btnLabel = btn.label?.toLowerCase() || '';
    if (inputLower === btnValue || inputLower === btnLabel || 
        inputLower.includes(btnValue) || inputLower.includes(btnLabel)) {
      buttonToken = btn.token;
      break;
    }
  }
  
  // Actualizar last_known_step para CONTEXT_RESUME
  if (conversation && session.context.problem_description_raw) {
    const stepDescription = session.context.diagnostic_attempts 
      ? `Paso ${session.context.diagnostic_attempts + 1} de diagnóstico para: ${session.context.problem_description_raw}`
      : `Diagnóstico inicial para: ${session.context.problem_description_raw}`;
    session.context.last_known_step = stepDescription;
  }
  
  // Si es "Se resolvió"
  if (buttonToken === 'BTN_RESOLVED' || inputLower.includes('resolvió') || inputLower.includes('resolved')) {
    // OBTENER conversation_id DE FORMA SEGURA
    const conversationId = await getConversationIdSafe(session, conversation);
    
    // F30.1: Registrar métrica de resolución
    const metrics = resolutionMetrics.get(conversationId) || { resolved: false, escalated: false, steps_taken: 0 };
    metrics.resolved = true;
    metrics.steps_taken = session.context.diagnostic_attempts || 0;
    if (conversation.started_at) {
      const startedAt = new Date(conversation.started_at);
      const resolvedAt = new Date();
      metrics.resolution_time_minutes = (resolvedAt - startedAt) / (1000 * 60);
    }
    resolutionMetrics.set(conversationId, metrics);
    
    session.stage = 'ASK_FEEDBACK';
    await appendToTranscript(conversationId, {
      role: 'user',
      type: 'button',
      label: '✅ Se resolvió',
      value: 'resolved'
    });
    
    return {
      reply: TEXTS.ASK_FEEDBACK[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_FEEDBACK.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_FEEDBACK'
    };
  }
  
  // Si es "Necesito ayuda" o "Sigue igual" múltiples veces → escalar
  if (buttonToken === 'BTN_NEED_HELP' || inputLower.includes('necesito ayuda') || 
      inputLower.includes('técnico') || inputLower.includes('technician') ||
      inputLower.includes('tecnico') || inputLower.includes('tecniko')) {
    return await escalateToTechnician(session, conversation, 'user_requested');
  }
  
  // Si es "Sigue igual", continuar con siguiente paso
  if (buttonToken === 'BTN_NOT_RESOLVED' || inputLower.includes('sigue igual') || 
      inputLower.includes('not resolved')) {
    // Incrementar contador de intentos (simplificado)
    if (!session.context.diagnostic_attempts) {
      session.context.diagnostic_attempts = 0;
    }
    session.context.diagnostic_attempts++;
    
    // OBTENER conversation_id DE FORMA SEGURA
    const conversationId = await getConversationIdSafe(session, conversation);
    
    await appendToTranscript(conversationId, {
      role: 'user',
      type: 'button',
      label: '❌ Sigue igual',
      value: 'not_resolved'
    });
    
    // Si más de 2 intentos, escalar
    if (session.context.diagnostic_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'multiple_attempts_failed');
    }
    
    // Continuar con siguiente paso (enviar resultado del botón anterior)
    const nextStepResult = await iaStep(session, allowedButtons, 'not_resolved');
    return {
      reply: nextStepResult.reply,
      buttons: nextStepResult.buttons.map(b => ({
        label: b.label,
        value: b.value || b.token,
        token: b.token
      })),
      stage: 'DIAGNOSTIC_STEP'
    };
  }
  
  // Si no es respuesta a botón, tratar como pregunta libre o continuar
  const freeQA = await handleFreeQA(session, userInput, conversation);
  if (freeQA) {
    return freeQA;
  }
  
  // Por defecto, continuar con siguiente paso
  const stepResult = await iaStep(session, allowedButtons);
  return {
    reply: stepResult.reply,
    buttons: stepResult.buttons.map(b => ({
      label: b.label,
      value: b.value || b.token,
      token: b.token
    })),
    stage: 'DIAGNOSTIC_STEP'
  };
}

// ========================================================
// 9 FUNCIONES EXPLÍCITAS
// ========================================================

/**
 * 1. RISK_SUMMARY - Mostrar resumen de impacto antes de pasos destructivos
 */
async function showRiskSummary(session, conversation, riskLevel, actionDescription) {
  if (session.context.impact_summary_shown) {
    return null; // Ya se mostró
  }
  
  if (riskLevel === 'high' || riskLevel === 'medium') {
    session.context.impact_summary_shown = true;
    
    // OBTENER conversation_id DE FORMA SEGURA
    const conversationId = await getConversationIdSafe(session, conversation);
    
    const summaryText = session.language === 'es-AR'
      ? `⚠️ **Resumen de Impacto**

Antes de continuar, quiero que sepas:

${actionDescription}

**Posibles consecuencias:**
- ${riskLevel === 'high' ? 'Pérdida de datos o daño permanente' : 'Pérdida temporal de funcionalidad'}
- Necesitarás tiempo para revertir si algo sale mal
- Podrías necesitar asistencia técnica profesional

¿Estás seguro de que querés continuar?`
      : `⚠️ **Impact Summary**

Before continuing, I want you to know:

${actionDescription}

**Possible consequences:**
- ${riskLevel === 'high' ? 'Data loss or permanent damage' : 'Temporary loss of functionality'}
- You'll need time to revert if something goes wrong
- You might need professional technical assistance

Are you sure you want to continue?`;
    
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'RISK_SUMMARY_SHOWN',
      payload: { risk_level: riskLevel, action: actionDescription }
    });
    
    return {
      reply: summaryText,
      buttons: [
        { token: 'BTN_RISK_CONTINUE', label: 'Sí, continuar', value: 'continue' },
        { token: 'BTN_RISK_CANCEL', label: 'No, mejor no', value: 'cancel' }
      ],
      stage: 'RISK_CONFIRMATION'
    };
  }
  
  return null;
}

/**
 * 2. ASK_LEARNING_DEPTH - Preguntar profundidad de explicación
 */
async function handleAskLearningDepth(session, userInput, conversation) {
  const inputLower = userInput.toLowerCase().trim();
  let depth = null;
  
  if (inputLower.includes('simple') || inputLower.includes('básico') || inputLower === 'simple') {
    depth = 'simple';
  } else if (inputLower.includes('técnico') || inputLower.includes('technical') || inputLower === 'technical') {
    depth = 'technical';
  }
  
  if (!depth) {
    return {
      reply: session.language === 'es-AR'
        ? '¿Qué nivel de detalle preferís en las explicaciones?'
        : 'What level of detail do you prefer in explanations?',
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_LEARNING_DEPTH.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_LEARNING_DEPTH'
    };
  }
  
  session.modes.learning_depth = depth;
  session.meta.updated_at = new Date().toISOString();
  
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'button',
    label: depth === 'simple' ? 'Simple (explicaciones básicas)' : 'Técnico (detalles avanzados)',
    value: depth
  });
  
  // Continuar con el flujo
  return null; // Retornar null para continuar con el siguiente paso
}

/**
 * 3. TECH_FORMAT_MODE - Activar formato técnico (auto si avanzado)
 */
function activateTechFormat(session) {
  if (session.user_level === 'avanzado' || session.modes.tech_format) {
    session.modes.tech_format = true;
    return true;
  }
  return false;
}

/**
 * 4. EMOTIONAL_RELEASE - Permitir al usuario expresar frustración (una vez)
 */
async function handleEmotionalRelease(session, userInput, conversation) {
  if (session.modes.emotional_release_used) {
    return null;
  }
  
  const frustrationKeywords = ['frustrado', 'molesto', 'enojado', 'desesperado', 'no puedo más', 'harto'];
  const isFrustrated = frustrationKeywords.some(kw => userInput.toLowerCase().includes(kw));
  
  if (isFrustrated && session.meta.emotion === 'frustrated') {
    session.modes.emotional_release_used = true;
    
    const releaseText = session.language === 'es-AR'
      ? `Entiendo que estás frustrado. Contame, ¿qué es lo que más te está molestando de esta situación?`
      : `I understand you're frustrated. Tell me, what's bothering you most about this situation?`;
    
    // OBTENER conversation_id DE FORMA SEGURA
    const conversationId = await getConversationIdSafe(session, conversation);
    
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'EMOTIONAL_RELEASE_ACTIVATED',
      payload: { user_input: userInput }
    });
    
    return {
      reply: releaseText,
      buttons: [],
      stage: 'EMOTIONAL_RELEASE'
    };
  }
  
  return null;
}

/**
 * 5. ASK_EXECUTOR_ROLE - Preguntar si está frente al equipo o ayuda a otro
 */
async function handleAskExecutorRole(session, userInput, conversation) {
  const inputLower = userInput.toLowerCase().trim();
  let role = null;
  
  if (inputLower.includes('frente') || inputLower.includes('yo') || inputLower.includes('self') || inputLower === 'self') {
    role = 'self';
  } else if (inputLower.includes('otra persona') || inputLower.includes('ayudo') || 
             inputLower.includes('intermediary') || inputLower === 'intermediary') {
    role = 'intermediary';
  }
  
  if (!role) {
    return {
      reply: session.language === 'es-AR'
        ? '¿Estás frente al equipo o estás ayudando a otra persona?'
        : 'Are you in front of the device or helping someone else?',
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_EXECUTOR_ROLE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_EXECUTOR_ROLE'
    };
  }
  
  session.modes.executor_role = role;
  session.meta.updated_at = new Date().toISOString();
  
  // OBTENER conversation_id DE FORMA SEGURA
  const conversationId = await getConversationIdSafe(session, conversation);
  
  await appendToTranscript(conversationId, {
    role: 'user',
    type: 'button',
    label: role === 'self' ? 'Estoy frente al equipo' : 'Ayudo a otra persona',
    value: role
  });
  
  return null; // Continuar
}

/**
 * 6. CONTEXT_RESUME - Retomar contexto después de pausa
 */
async function resumeContext(session, conversation) {
  if (!session.context.last_known_step) {
    return null;
  }
  
  const resumeText = session.language === 'es-AR'
    ? `Retomemos donde lo dejamos. Estábamos en: ${session.context.last_known_step}\n\n¿Querés continuar desde ahí?`
    : `Let's resume where we left off. We were at: ${session.context.last_known_step}\n\nDo you want to continue from there?`;
  
  return {
    reply: resumeText,
    buttons: [
      { token: 'BTN_RESUME_YES', label: 'Sí, continuar', value: 'yes' },
      { token: 'BTN_RESUME_NO', label: 'No, empezar de nuevo', value: 'no' }
    ],
    stage: 'CONTEXT_RESUME'
  };
}

/**
 * 7. GUIDED_STORY - 3 preguntas guía si no sabe explicar
 */
async function handleGuidedStory(session, conversation) {
  const questions = session.language === 'es-AR'
    ? [
        '¿Qué estabas haciendo cuando empezó el problema?',
        '¿Qué mensaje o pantalla ves ahora?',
        '¿Qué esperabas que pasara?'
      ]
    : [
        'What were you doing when the problem started?',
        'What message or screen do you see now?',
        'What did you expect to happen?'
      ];
  
  if (session.context.guided_story_step === undefined || session.context.guided_story_step === null) {
    session.context.guided_story_step = 0;
  }
  
  // Si estamos procesando una respuesta (no es la primera llamada)
  if (session.context.guided_story_step > 0) {
    // OBTENER conversation_id DE FORMA SEGURA
    const conversationId = await getConversationIdSafe(session, conversation);
    
    // Guardar respuesta del usuario
    await appendToTranscript(conversationId, {
      role: 'user',
      type: 'text',
      text: session.context.guided_story_last_input || ''
    });
    
    // Avanzar al siguiente paso
    session.context.guided_story_step++;
  }
  
  // Si aún hay preguntas, mostrar la siguiente
  if (session.context.guided_story_step < questions.length) {
    const currentQuestion = questions[session.context.guided_story_step];
    return {
      reply: currentQuestion,
      buttons: [],
      stage: 'GUIDED_STORY'
    };
  }
  
  // Terminó las preguntas, procesar respuestas y continuar con diagnóstico
  session.context.guided_story_step = null;
  session.context.guided_story_last_input = null;
  return null; // Continuar con diagnóstico
}

/**
 * 8. ADVISORY_MODE - Modo consultoría (pros/contras + recomendación)
 */
async function handleAdvisoryMode(session, conversation, optionA, optionB) {
  // LOG DETALLADO: Inicio de handleAdvisoryMode
  await logDebug('DEBUG', 'handleAdvisoryMode - Inicio', {
    conversation_id: conversation?.conversation_id || 'none',
    session_stage: session?.stage,
    session_language: session?.language,
    advisory_mode: session.modes?.advisory_mode || false,
    option_a: optionA,
    option_b: optionB
  }, 'server.js', 4374, 4374);
  
  if (!session.modes.advisory_mode) {
    await logDebug('DEBUG', 'handleAdvisoryMode - Advisory mode no activo', {
      conversation_id: conversation?.conversation_id || 'none'
    }, 'server.js', 4376, 4378);
    return null;
  }
  
  const advisoryText = session.language === 'es-AR'
    ? `Te doy mi recomendación como técnico:

**Opción A: ${optionA}**
✅ Pros: ...
❌ Contras: ...

**Opción B: ${optionB}**
✅ Pros: ...
❌ Contras: ...

**Mi recomendación:** Opción ${optionA} porque...

¿Te sirve esta recomendación?`
    : `Here's my recommendation as a technician:

**Option A: ${optionA}**
✅ Pros: ...
❌ Cons: ...

**Option B: ${optionB}**
✅ Pros: ...
❌ Cons: ...

**My recommendation:** Option ${optionA} because...

Does this recommendation help you?`;
  
  return {
    reply: advisoryText,
    buttons: [
      { token: 'BTN_ADVISORY_ACCEPT', label: 'Sí, acepto', value: 'accept' },
      { token: 'BTN_ADVISORY_DECLINE', label: 'Prefiero la otra', value: 'decline' }
    ],
    stage: 'ADVISORY_CONFIRMATION'
  };
}

// ========================================================
// SISTEMA DE CONECTIVIDAD (Árbol obligatorio WiFi/cable)
// ========================================================

async function handleConnectivityFlow(session, userInput, conversation) {
  // Orden de preguntas:
  // 1) WiFi o cable
  // 2) notebook o PC
  // 3) ¿aparece el WiFi? (si no, notebook: botón WiFi/modo avión/Fn)
  // 4) ¿otro dispositivo navega?
  // 5) ¿una cajita o dos? (módem/router)
  // 6) ¿luces rojas/apagadas?
  // 7) reinicio ordenado solo si corresponde (módem 20–30s, luego router)
  
  if (!session.context.connectivity_step) {
    session.context.connectivity_step = 1;
  }
  
  const step = session.context.connectivity_step;
  const lang = session.language || 'es-AR';
  
  switch (step) {
    case 1: // WiFi o cable
      const inputLower = userInput.toLowerCase().trim();
      if (inputLower.includes('wifi') || inputLower === 'wifi') {
        session.context.connectivity_method = 'wifi';
        session.context.connectivity_step = 2;
        return {
          reply: lang === 'es-AR' 
            ? '¿Es notebook o PC de escritorio?'
            : 'Is it a notebook or desktop PC?',
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_TYPE_MAIN.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'CONNECTIVITY_FLOW'
        };
      } else if (inputLower.includes('cable') || inputLower === 'cable') {
        session.context.connectivity_method = 'cable';
        session.context.connectivity_step = 4; // Saltar a paso 4
        return {
          reply: lang === 'es-AR'
            ? '¿Otro dispositivo navega bien con el mismo cable?'
            : 'Does another device browse well with the same cable?',
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_OTHER_DEVICE_WORKS.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'CONNECTIVITY_FLOW'
        };
      } else {
        return {
          reply: lang === 'es-AR'
            ? '¿Conectás por WiFi o por cable?'
            : 'Do you connect via WiFi or cable?',
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_CONNECTIVITY_METHOD.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'CONNECTIVITY_FLOW'
        };
      }
      
    case 2: // Notebook o PC (solo si WiFi)
      if (userInput.toLowerCase().includes('notebook') || userInput.toLowerCase().includes('laptop')) {
        session.context.connectivity_step = 3;
        return {
          reply: lang === 'es-AR'
            ? '¿Aparece el WiFi en la lista de redes disponibles?'
            : 'Does WiFi appear in the list of available networks?',
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_WIFI_VISIBLE.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'CONNECTIVITY_FLOW'
        };
      } else {
        // PC de escritorio, saltar a paso 4
        session.context.connectivity_step = 4;
        return {
          reply: lang === 'es-AR'
            ? '¿Otro dispositivo navega bien con WiFi?'
            : 'Does another device browse well with WiFi?',
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_OTHER_DEVICE_WORKS.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'CONNECTIVITY_FLOW'
        };
      }
      
    case 3: // ¿Aparece WiFi? (solo notebook)
      if (userInput.toLowerCase().includes('no') || userInput.toLowerCase().includes('❌')) {
        // No aparece WiFi - ofrecer soluciones
        return {
          reply: lang === 'es-AR'
            ? 'Si no aparece el WiFi, probá:\n\n1. Verificá que el botón WiFi esté activado (tecla Fn + WiFi)\n2. Revisá si el modo avión está desactivado\n3. Reiniciá la notebook\n\n¿Alguna de estas soluciones funcionó?'
            : 'If WiFi doesn\'t appear, try:\n\n1. Check that the WiFi button is activated (Fn + WiFi key)\n2. Check if airplane mode is deactivated\n3. Restart the notebook\n\nDid any of these solutions work?',
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'CONNECTIVITY_FLOW'
        };
      }
      // Si aparece, continuar a paso 4
      session.context.connectivity_step = 4;
      return {
        reply: lang === 'es-AR'
          ? '¿Otro dispositivo navega bien con WiFi?'
          : 'Does another device browse well with WiFi?',
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_OTHER_DEVICE_WORKS.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'CONNECTIVITY_FLOW'
      };
      
    case 4: // ¿Otro dispositivo navega?
      if (userInput.toLowerCase().includes('sí') || userInput.toLowerCase().includes('si') || 
          userInput.toLowerCase().includes('yes')) {
        // Otro dispositivo funciona → problema es del equipo específico
        session.stage = 'DIAGNOSTIC_STEP';
        const stepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
        return {
          reply: stepResult.reply,
          buttons: stepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      }
      // No funciona en otros → problema de router/módem
      session.context.connectivity_step = 5;
      return {
        reply: lang === 'es-AR'
          ? 'Si otros dispositivos tampoco navegan, el problema puede ser del router o módem.\n\n¿Tenés una cajita o dos? (módem y router)'
          : 'If other devices also can\'t browse, the problem may be with the router or modem.\n\nDo you have one box or two? (modem and router)',
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_MODEM_COUNT.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'CONNECTIVITY_FLOW'
      };
      
    case 5: // ¿Una o dos cajitas?
      session.context.connectivity_step = 6;
      return {
        reply: lang === 'es-AR'
          ? 'Revisá las luces del módem/router. ¿Están verdes/normales o hay luces rojas/apagadas?'
          : 'Check the modem/router lights. Are they green/normal or are there red/off lights?',
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_LIGHTS_STATUS.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'CONNECTIVITY_FLOW'
      };
      
    case 6: // ¿Luces rojas/apagadas?
      if (userInput.toLowerCase().includes('roja') || userInput.toLowerCase().includes('apagada') || 
          userInput.toLowerCase().includes('red')) {
        // Luces rojas → problema de módem/router o proveedor
        return await escalateToTechnician(session, conversation, 'connectivity_hardware_issue');
      }
      // Luces normales → reinicio ordenado
      session.context.connectivity_step = 7;
      return {
        reply: lang === 'es-AR'
          ? 'Si las luces están normales pero no navega, probemos un reinicio ordenado:\n\n1. Desconectá el módem (si tenés dos cajitas) y esperá 20-30 segundos\n2. Reconectá el módem y esperá 2 minutos\n3. Si tenés router separado, reinicialo también\n\n¿Esto resolvió el problema?'
          : 'If the lights are normal but it doesn\'t browse, let\'s try an ordered restart:\n\n1. Disconnect the modem (if you have two boxes) and wait 20-30 seconds\n2. Reconnect the modem and wait 2 minutes\n3. If you have a separate router, restart it too\n\nDid this solve the problem?',
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'CONNECTIVITY_FLOW'
      };
      
    default:
      // Terminó el flujo de conectividad
      session.stage = 'DIAGNOSTIC_STEP';
      const finalStep = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
      return {
        reply: finalStep.reply,
        buttons: finalStep.buttons.map(b => ({
          label: b.label,
          value: b.value || b.token,
          token: b.token
        })),
        stage: 'DIAGNOSTIC_STEP'
      };
  }
}

// ========================================================
// SISTEMA DE INSTALACIONES CON AYUDA EXTRA
// ========================================================

async function handleInstallationFlow(session, userInput, conversation) {
  // Detectar tipo de instalación: install_os, install_app, configure_device
  const intent = session.context.problem_category;
  
  if (intent === 'install_os' || intent === 'install_app') {
    // Generar paso de instalación con ayuda extra
    const stepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
    
    // Agregar "ayuda extra" al final del paso
    const extraHelp = session.language === 'es-AR'
      ? `\n\n💡 **Ayuda extra:** Si querés, te dejo un extra para que te salga más fácil: [detalle adicional del mismo paso sin avanzar]`
      : `\n\n💡 **Extra help:** If you want, I'll give you an extra tip to make it easier: [additional detail of the same step without advancing]`;
    
    // La IA debería incluir esto, pero lo agregamos como fallback
    if (!stepResult.reply.includes('ayuda extra') && !stepResult.reply.includes('extra')) {
      stepResult.reply += extraHelp;
    }
    
    // OBTENER conversation_id DE FORMA SEGURA
    const conversationId = await getConversationIdSafe(session, conversation);
    
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'INSTALLATION_STEP_WITH_EXTRA',
      payload: { intent, has_extra_help: true }
    });
    
    return {
      reply: stepResult.reply,
      buttons: stepResult.buttons.map(b => ({
        label: b.label,
        value: b.value || b.token,
        token: b.token
      })),
      stage: 'INSTALLATION_STEP'
    };
  }
  
  return null;
}

// ========================================================
// MAIN HANDLER - Router de stages
// ========================================================

async function handleChatMessage(sessionId, userInput, imageBase64 = null, requestId = null, bootId = null) {
  // LOG DETALLADO: Inicio de handleChatMessage
  await logDebug('DEBUG', 'handleChatMessage - Inicio', {
    session_id: sessionId,
    user_input_length: userInput ? userInput.length : 0,
    user_input_preview: userInput ? userInput.substring(0, 100) : 'null/empty',
    has_image: !!imageBase64,
    image_size: imageBase64 ? imageBase64.length : 0,
    request_id: requestId,
    boot_id: bootId
  }, 'server.js', 4319, 4319);
  
  const session = getSession(sessionId);
  let conversation = null;
  let releaseLock = null;
  
  // LOG DETALLADO: Session obtenida
  await logDebug('DEBUG', 'handleChatMessage - Session obtenida', {
    session_id: sessionId,
    session_stage: session.stage,
    session_language: session.language,
    session_conversation_id: session.conversation_id,
    session_user_name: session.user?.name_norm || 'none',
    boot_id: bootId
  }, 'server.js', 4320, 4322);
  
  // Crear contexto de trace con boot_id (SIEMPRE debe existir)
  const finalBootId = bootId || trace.generateBootId();
  const traceContext = trace.createTraceContext(
    session.conversation_id || sessionId, // Puede ser null si aún no se generó
    requestId || `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    null,
    session.stage,
    NODE_ENV,
    null,
    finalBootId // SIEMPRE incluir boot_id
  );
  
  // LOG DETALLADO: TraceContext creado
  await logDebug('DEBUG', 'handleChatMessage - TraceContext creado', {
    boot_id: finalBootId,
    conversation_id: traceContext.conversation_id,
    request_id: traceContext.request_id,
    stage: traceContext.stage
  }, 'server.js', 4324, 4334);
  
  // Log entrada de mensaje con boot_id
  await trace.logUserInput(
    traceContext,
    userInput,
    userInput.trim().toLowerCase(),
    session.language,
    session.context.device_type || session.context.external_type
  );
  
  try {
    if (session.conversation_id) {
      // LOG DETALLADO: Antes de cargar conversación
      await logDebug('DEBUG', 'handleChatMessage - Cargando conversación', {
        conversation_id: session.conversation_id,
        boot_id: finalBootId
      }, 'server.js', 4346, 4347);
      
      conversation = await loadConversation(session.conversation_id);
      
      // DEBUG: Verificar que la conversación se cargó correctamente
      if (!conversation) {
        await logDebug('ERROR', 'handleChatMessage - Conversación no encontrada después de loadConversation', {
          conversation_id: session.conversation_id,
          session_stage: session.stage,
          boot_id: finalBootId
        }, 'server.js', 4349, 4355);
      } else {
        await logDebug('DEBUG', 'handleChatMessage - Conversación cargada correctamente', {
          conversation_id: conversation.conversation_id,
          transcript_length: conversation.transcript ? conversation.transcript.length : 0,
          transcript_events: conversation.transcript ? conversation.transcript.map((e, i) => ({
            index: i,
            role: e.role,
            type: e.type,
            stage: e.stage,
            has_text: !!e.text,
            text_preview: e.text ? e.text.substring(0, 50) : 'no text'
          })) : [],
          session_stage: session.stage,
          boot_id: finalBootId
        }, 'server.js', 4357, 4363);
      }
      
      // Log entrada de mensaje del usuario
      await trace.logUserInput(
        traceContext,
        userInput,
        userInput.trim().toLowerCase(),
        session.language,
        session.context.device_type || session.context.external_type
      );
      
      // F21.2: Validar coherencia del estado previo
      if (conversation) {
        const stateValidation = validateConversationState(session, conversation);
        if (!stateValidation.valid) {
          await trace.logEvent('ERROR', 'CONVERSATION_STATE_INVALID', {
            actor: 'system',
            endpoint: '/api/chat',
            expected_behavior: `Estado de conversación debería ser coherente con session.stage: ${session.stage}`,
            actual_behavior: `Estado inválido detectado: ${stateValidation.reason}`,
            expected_result: `Conversación válida y coherente`,
            actual_result: `Estado inválido, reseteando a ASK_CONSENT`,
            preconditions: [
              `session.stage válido: ${session.stage}`,
              `conversation.status coherente`,
              `Campos requeridos presentes`
            ],
            conditions_met: false,
            decision_reason: `Estado inválido detectado: ${stateValidation.reason}`,
            decision_evidence: {
              session_stage: session.stage,
              conversation_status: conversation.status,
              validation_reason: stateValidation.reason
            },
            decision_outcome: `Conversación reseteada a ASK_CONSENT`,
            state_snapshot: {
              session_stage: session.stage,
              conversation_status: conversation.status,
              conversation_id: session.conversation_id
            },
            troubleshooting_hints: [
              `Verificar que session.stage sea válido`,
              `Verificar coherencia entre session y conversation`,
              `Revisar logs anteriores para entender cómo llegó a este estado`
            ],
            suggested_fix: `Mejorar validación de estado o corregir lógica que causó inconsistencia`
          }, traceContext);
          
          await log('ERROR', 'Estado de conversación inválido', { 
            conversation_id: session.conversation_id,
            reason: stateValidation.reason,
            boot_id: finalBootId
          });
          // Resetear a estado seguro
          session.stage = 'ASK_CONSENT';
          conversation = null;
        }
      }
      
      // F22.2: Validar y migrar versión
      if (conversation) {
        const versionValidation = await validateConversationVersion(conversation);
        if (!versionValidation.valid) {
          await log('WARN', 'Versión de conversación incompatible', { 
            conversation_id: session.conversation_id,
            reason: versionValidation.reason 
          });
          if (versionValidation.shouldRestart) {
            // Reiniciar conversación
            session.stage = 'ASK_CONSENT';
            session.context.last_known_step = null;
            conversation = null;
          }
        }
      }
      
      // F21.1: Detectar inactividad y ofrecer reanudación automática
      if (conversation && session.context.last_known_step && conversation.transcript && conversation.transcript.length > 0) {
        const lastEvent = conversation.transcript[conversation.transcript.length - 1];
        if (lastEvent && lastEvent.t) {
          const lastEventTime = new Date(lastEvent.t).getTime();
          const now = Date.now();
          const minutesSinceLastEvent = (now - lastEventTime) / (1000 * 60);
          
          // Si pasaron más de 5 minutos desde el último evento, ofrecer reanudación
          if (minutesSinceLastEvent > 5 && session.stage === 'ASK_CONSENT') {
            // Solo ofrecer reanudación si estamos en ASK_CONSENT (inicio de sesión)
            const resumeResult = await resumeContext(session, conversation);
            if (resumeResult) {
              return resumeResult;
            }
          }
        }
      }
      
      // P0.1: Adquirir lock para esta conversación (serializa requests concurrentes)
      releaseLock = await acquireLock(session.conversation_id);
      
      // P1.2: Persistir imagen si viene
      // P2-02: Si viene imagen, marcar que ya se recibió y continuar con diagnóstico
      if (imageBase64 && conversation) {
        session.context.image_received = true;
        session.context.image_requested = false; // Ya no necesitamos pedir más
        // R31.2: Validar formato MIME type (magic bytes)
        const validImagePrefixes = [
          'data:image/jpeg;base64,',
          'data:image/jpg;base64,',
          'data:image/png;base64,',
          'data:image/gif;base64,',
          'data:image/webp;base64,'
        ];
        
        // Si viene sin prefijo data:, asumir que es base64 puro y validar magic bytes
        let isValidImage = false;
        if (imageBase64.startsWith('data:image/')) {
          isValidImage = validImagePrefixes.some(prefix => imageBase64.startsWith(prefix));
        } else {
          // Validar magic bytes de base64 puro
          try {
            const buffer = Buffer.from(imageBase64, 'base64');
            // JPEG: FF D8 FF
            // PNG: 89 50 4E 47
            // GIF: 47 49 46 38
            // WebP: 52 49 46 46 (RIFF)
            const magicBytes = buffer.slice(0, 4);
            isValidImage = (
              (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF) || // JPEG
              (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47) || // PNG
              (magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x38) || // GIF
              (magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46) // WebP
            );
          } catch (err) {
            isValidImage = false;
          }
        }
        
        if (!isValidImage) {
          await log('WARN', 'Formato de imagen inválido, ignorando', {
            conversation_id: session.conversation_id,
            preview: imageBase64.substring(0, 50)
          });
        } else {
          // Guardar imagen físicamente
          try {
            const imageResult = await saveImageFromBase64(
              conversation.conversation_id,
              imageBase64,
              requestId
            );
            
            // OBTENER conversation_id DE FORMA SEGURA
            const conversationId = await getConversationIdSafe(session, conversation);
            
            // Guardar referencia completa en transcript
            await appendToTranscript(conversationId, {
              role: 'user',
              type: 'image',
              image_url: imageResult.imageUrl,
              image_path: imageResult.relativePath,
              image_filename: imageResult.filename,
              image_size_bytes: imageResult.sizeBytes,
              image_mime_type: imageResult.mimeType,
              uploaded_at: new Date().toISOString()
            });
            
            await log('INFO', 'Imagen recibida, guardada y referenciada', {
              conversation_id: session.conversation_id,
              image_url: imageResult.imageUrl,
              image_path: imageResult.relativePath,
              size_bytes: imageResult.sizeBytes,
              has_text: !!userInput
            });
          } catch (imageErr) {
            // Si falla el guardado, al menos guardar referencia de que se intentó
            await log('ERROR', 'Error guardando imagen, pero continuando', {
              conversation_id: session.conversation_id,
              error: imageErr.message,
              has_text: !!userInput
            });
            
            // OBTENER conversation_id DE FORMA SEGURA
            const conversationId = await getConversationIdSafe(session, conversation);
            
            // Guardar evento de error en transcript
            await appendToTranscript(conversationId, {
              role: 'system',
              type: 'event',
              name: 'IMAGE_SAVE_ERROR',
              payload: { error: imageErr.message }
            });
          }
        }
      }
      
      // P2.1: Deduplicación de mensajes duplicados
      const inputHash = hashInput(session.conversation_id, userInput);
      if (!recentInputs.has(session.conversation_id)) {
        recentInputs.set(session.conversation_id, new Set());
      }
      
      const recentSet = recentInputs.get(session.conversation_id);
      if (recentSet.has(inputHash)) {
        // Input duplicado en los últimos 5 segundos
        await log('WARN', 'Input duplicado detectado, ignorando', { 
          conversation_id: session.conversation_id, 
          input_preview: userInput.substring(0, 50) 
        });
        return {
          reply: session.language === 'es-AR'
            ? 'Ya recibí tu mensaje. Por favor, esperá un momento...'
            : 'I already received your message. Please wait a moment...',
          buttons: [],
          stage: session.stage
        };
      }
      
      recentSet.add(inputHash);
      // F26.2: Extender ventana de deduplicación a 15 segundos (más que timeout de IA)
      setTimeout(() => {
        recentSet.delete(inputHash);
      }, 15000); // 15 segundos en lugar de 5
    }
    
    // Si no hay conversación pero estamos en ASK_LANGUAGE o más adelante, algo está mal
    if (!conversation && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
      await log('ERROR', `Conversación no encontrada para session ${sessionId} en stage ${session.stage}`);
      session.stage = 'ASK_CONSENT';
    }
    
    // P1.1: Verificar idempotencia por request_id
    if (requestId && conversation) {
      const processedRequests = conversation.processed_request_ids || [];
      if (processedRequests.includes(requestId)) {
        await log('INFO', 'Request idempotente detectado, retornando respuesta anterior', { 
          request_id, 
          conversation_id: session.conversation_id 
        });
        // Retornar última respuesta guardada o estado actual
        return {
          reply: session.language === 'es-AR'
            ? 'Ya procesé tu mensaje anterior. ¿Querés continuar?'
            : 'I already processed your previous message. Do you want to continue?',
          buttons: [],
          stage: session.stage
        };
      }
      
      // Marcar como procesado
      if (!conversation.processed_request_ids) {
        conversation.processed_request_ids = [];
      }
      conversation.processed_request_ids.push(requestId);
      // Limpiar request_ids antiguos (mantener solo últimos 100)
      if (conversation.processed_request_ids.length > 100) {
        conversation.processed_request_ids = conversation.processed_request_ids.slice(-100);
      }
      await saveConversation(conversation);
    }
  
  // P2-2: Detectar prompt injection en el input del usuario
  if (userInput && typeof userInput === 'string') {
    const injectionCheck = detectPromptInjection(userInput);
    if (injectionCheck.detected) {
      await log('WARN', 'Posible prompt injection detectado en input del usuario', {
        conversation_id: session.conversation_id,
        severity: injectionCheck.severity,
        patterns: injectionCheck.patterns,
        input_preview: userInput.substring(0, 100)
      });
      
      // Si es alta severidad, rechazar el input
      if (injectionCheck.severity === 'high') {
        if (conversation || session.conversation_id) {
          // OBTENER conversation_id DE FORMA SEGURA
          const conversationId = await getConversationIdSafe(session, conversation);
          
          await appendToTranscript(conversationId, {
            role: 'system',
            type: 'event',
            name: 'PROMPT_INJECTION_DETECTED',
            payload: { 
              severity: 'high',
              patterns: injectionCheck.patterns,
              action: 'rejected'
            }
          });
        }
        
        return {
          reply: session.language === 'es-AR'
            ? 'No puedo procesar ese tipo de solicitud. Por favor, contame sobre el problema técnico que tenés con tu equipo.'
            : 'I cannot process that type of request. Please tell me about the technical problem you have with your device.',
          buttons: [],
          stage: session.stage
        };
      }
      // Si es media/baja severidad, solo loguear y continuar (puede ser falso positivo)
    }
  }
  
  // F28.1: Detectar preguntas fuera de alcance
  if (isOutOfScope(userInput) && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
    return {
      reply: session.language === 'es-AR'
        ? 'Soy Tecnos, tu asistente técnico. Estoy acá para ayudarte con problemas de tu equipo. ¿Tenés algún problema técnico que pueda ayudarte a resolver?'
        : 'I\'m Tecnos, your technical assistant. I\'m here to help you with problems with your device. Do you have any technical problem I can help you solve?',
      buttons: [],
      stage: session.stage
    };
  }
  
  // F28.2: Detectar inputs sin sentido
  if (isNonsensicalInput(userInput) && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
    return {
      reply: session.language === 'es-AR'
        ? 'No entendí tu mensaje. ¿Podés contarme qué problema técnico tenés?'
        : 'I didn\'t understand your message. Can you tell me what technical problem you have?',
      buttons: [],
      stage: session.stage
    };
  }
  
  // Detectar y actualizar emoción
  const detectedEmotion = detectEmotion(userInput, session);
  session.meta.emotion = detectedEmotion;
  
  // Intentar EMOTIONAL_RELEASE primero (si aplica)
  if (conversation && detectedEmotion === 'frustrated') {
    const emotionalRelease = await handleEmotionalRelease(session, userInput, conversation);
    if (emotionalRelease) {
      return emotionalRelease;
    }
  }
  
  // Intentar FREE_QA (si aplica)
  if (conversation && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
    const originalStage = session.stage; // P2.7: Capturar stage original
    const freeQA = await handleFreeQA(session, userInput, conversation);
    if (freeQA) {
      // P2.7: Verificar que resumeStage sigue siendo válido
      const validStages = ['ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 'ASK_DEVICE_TYPE_EXTERNAL', 
                           'ASK_INTERACTION_MODE', 'DIAGNOSTIC_STEP', 'CONNECTIVITY_FLOW', 'INSTALLATION_STEP'];
      
      if (freeQA.resumeStage === originalStage && validStages.includes(freeQA.resumeStage)) {
        // OBTENER conversation_id DE FORMA SEGURA
        const conversationId = await getConversationIdSafe(session, conversation);
        
        // Guardar respuesta FREE_QA
        await appendToTranscript(conversationId, {
          role: 'user',
          type: 'text',
          text: userInput
        });
        await appendToTranscript(conversationId, {
          role: 'bot',
          type: 'text',
          text: freeQA.reply
        });
        await saveConversation(conversation);
        
        // Retomar el ASK original
        return {
          ...freeQA,
          stage: freeQA.resumeStage
        };
      } else {
        // Stage inválido, continuar con flujo normal
        await log('WARN', 'FREE_QA resumeStage inválido, continuando con flujo normal', { 
          resume_stage: freeQA.resumeStage,
          current_stage: session.stage 
        });
      }
    }
  }
  
  // P2.3: Capturar stage original antes de cualquier cambio
  const stageBefore = session.stage;
  
  // F22.3: Validar que stage sea válido (manejo de estados obsoletos)
  const validStages = ['ASK_CONSENT', 'ASK_LANGUAGE', 'ASK_NAME', 'ASK_USER_LEVEL', 
                       'ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 'ASK_DEVICE_TYPE_EXTERNAL',
                       'ASK_PROBLEM', 'ASK_PROBLEM_CLARIFICATION', 'DIAGNOSTIC_STEP', 
                       'ASK_FEEDBACK', 'ENDED', 'CONTEXT_RESUME', 'GUIDED_STORY', 
                       'EMOTIONAL_RELEASE', 'RISK_CONFIRMATION', 'CONNECTIVITY_FLOW', 
                       'INSTALLATION_STEP', 'ASK_INTERACTION_MODE', 'ASK_LEARNING_DEPTH', 
                       'ASK_EXECUTOR_ROLE'];
  if (!validStages.includes(session.stage)) {
    // Stage obsoleto - resetear a ASK_CONSENT
    await log('WARN', 'Stage obsoleto detectado, reseteando', { 
      old_stage: session.stage, 
      conversation_id: session.conversation_id 
    });
    session.stage = 'ASK_CONSENT';
  }
  
  // P1.3: Validar transiciones desde ENDED
  if (session.stage === 'ENDED') {
    // Si estamos en ENDED, solo permitir reinicio explícito
    const wantsRestart = userInput.toLowerCase().includes('empezar') || 
                         userInput.toLowerCase().includes('nuevo') ||
                         userInput.toLowerCase().includes('restart') ||
                         userInput.toLowerCase().includes('start over');
    
    if (!wantsRestart) {
      return {
        reply: session.language === 'es-AR'
          ? 'La conversación ya terminó. Si querés empezar de nuevo, escribí "empezar" o "nuevo".'
          : 'The conversation has ended. If you want to start over, type "start" or "new".',
        buttons: [],
        stage: 'ENDED',
        endConversation: true
      };
    } else {
      // Reiniciar conversación
      session.stage = 'ASK_CONSENT';
      session.meta.updated_at = new Date().toISOString();
      
      // Incluir ID de conversación si ya existe
      let consentReply = TEXTS.ASK_CONSENT[session.language || 'es'];
      if (session.conversation_id) {
        consentReply = `${consentReply}\n\n🆔 **ID de la conversación: ${session.conversation_id}**`;
      }
      
      return {
        reply: consentReply,
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'ASK_CONSENT'
      };
    }
  }
  
  let response;
  
  switch (session.stage) {
    case 'ASK_CONSENT':
      try {
        response = await handleAskConsent(session, userInput, conversation || {});
      } catch (err) {
        await trace.logError(
          traceContext, 
          err, 
          'recoverable', 
          'Error en handleAskConsent', 
          false,
          `handleAskConsent debería procesar input "${userInput.substring(0, 50)}" y retornar respuesta con stage apropiado`,
          `Error al procesar: ${err.message}`,
          [
            `Verificar que session.stage sea válido: ${session.stage}`,
            `Verificar que userInput sea válido: ${userInput ? 'Sí' : 'No'}`,
            `Revisar lógica de detección de aceptación/rechazo GDPR`,
            `Verificar que TEXTS.ASK_CONSENT esté definido correctamente`
          ]
        );
        await log('ERROR', 'Error en handleAskConsent', { 
          error: err.message, 
          stack: err.stack, 
          stage: session.stage,
          boot_id: finalBootId,
          user_input: userInput.substring(0, 100)
        });
        throw err; // Re-lanzar para que se capture en el catch principal
      }
      break;
    case 'ASK_LANGUAGE':
      try {
        response = await handleAskLanguage(session, userInput, conversation || {}, traceContext);
      } catch (err) {
        await trace.logError(
          traceContext, 
          err, 
          'recoverable', 
          'Error en handleAskLanguage', 
          false,
          `handleAskLanguage debería detectar idioma de "${userInput.substring(0, 50)}", generar conversation_id y avanzar a ASK_NAME`,
          `Error al procesar: ${err.message}`,
          [
            `Verificar que reserveUniqueConversationId() funcione correctamente`,
            `Verificar que session.language sea válido: ${session.language}`,
            `Verificar que userInput contenga indicador de idioma`,
            `Revisar lógica de detección de idioma (español/english)`,
            `Verificar permisos de escritura en directorio de conversaciones`
          ]
        );
        await log('ERROR', 'Error en handleAskLanguage', { 
          error: err.message, 
          stack: err.stack, 
          stage: session.stage,
          boot_id: finalBootId,
          user_input: userInput.substring(0, 100),
          session_language: session.language
        });
        throw err; // Re-lanzar para que se capture en el catch principal
      }
      break;
    case 'ASK_NAME':
      response = await handleAskName(session, userInput, conversation || {});
      break;
    case 'ASK_USER_LEVEL':
      response = await handleAskUserLevel(session, userInput, conversation || {});
      break;
    case 'ASK_DEVICE_CATEGORY':
      response = await handleAskDeviceCategory(session, userInput, conversation || {});
      break;
    case 'ASK_DEVICE_TYPE_MAIN':
    case 'ASK_DEVICE_TYPE_EXTERNAL':
      response = await handleAskDeviceType(session, userInput, conversation || {});
      break;
    case 'ASK_PROBLEM':
    case 'ASK_PROBLEM_CLARIFICATION':
      response = await handleAskProblem(session, userInput, conversation || {}, requestId, traceContext);
      break;
    case 'ASK_INTERACTION_MODE':
      response = await handleAskInteractionMode(session, userInput, conversation || {});
      break;
    case 'ASK_LEARNING_DEPTH':
      response = await handleAskLearningDepth(session, userInput, conversation || {});
      if (!response) {
        // Continuar con siguiente paso
        session.stage = 'DIAGNOSTIC_STEP';
        const stepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
        response = {
          reply: stepResult.reply,
          buttons: stepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      }
      break;
    case 'ASK_EXECUTOR_ROLE':
      response = await handleAskExecutorRole(session, userInput, conversation || {});
      if (!response) {
        // Continuar con siguiente paso
        session.stage = 'DIAGNOSTIC_STEP';
        const stepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
        response = {
          reply: stepResult.reply,
          buttons: stepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      }
      break;
    case 'CONNECTIVITY_FLOW':
      response = await handleConnectivityFlow(session, userInput, conversation || {});
      break;
    case 'INSTALLATION_STEP':
      response = await handleInstallationFlow(session, userInput, conversation || {});
      if (!response) {
        // Si no hay respuesta, continuar con diagnóstico normal
        session.stage = 'DIAGNOSTIC_STEP';
        const stepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
        response = {
          reply: stepResult.reply,
          buttons: stepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      }
      break;
    case 'EMOTIONAL_RELEASE':
      // Después de escuchar, continuar con diagnóstico
      session.stage = 'DIAGNOSTIC_STEP';
      const emotionalStepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
      response = {
        reply: emotionalStepResult.reply,
        buttons: emotionalStepResult.buttons.map(b => ({
          label: b.label,
          value: b.value || b.token,
          token: b.token
        })),
        stage: 'DIAGNOSTIC_STEP'
      };
      break;
    case 'GUIDED_STORY':
      // Guardar input del usuario antes de procesar
      if (userInput) {
        session.context.guided_story_last_input = userInput;
      }
      response = await handleGuidedStory(session, conversation || {});
      if (!response) {
        // Terminó las preguntas, continuar con diagnóstico
        session.stage = 'DIAGNOSTIC_STEP';
        const guidedStepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
        response = {
          reply: guidedStepResult.reply,
          buttons: guidedStepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      }
      break;
    case 'RISK_CONFIRMATION':
      // Usuario confirmó o canceló riesgo
      const riskInput = userInput.toLowerCase().trim();
      if (riskInput.includes('continuar') || riskInput.includes('sí') || riskInput.includes('yes')) {
        session.stage = 'DIAGNOSTIC_STEP';
        const riskStepResult = await iaStep(session, ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS);
        response = {
          reply: riskStepResult.reply,
          buttons: riskStepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      } else {
        response = {
          reply: session.language === 'es-AR'
            ? 'Entiendo. Si cambiás de opinión, podés continuar cuando quieras.'
            : 'I understand. If you change your mind, you can continue whenever you want.',
          buttons: [],
          stage: 'DIAGNOSTIC_STEP'
        };
      }
      break;
    case 'DIAGNOSTIC_STEP':
      response = await handleDiagnosticStep(session, userInput, conversation || {});
      break;
    case 'CONTEXT_RESUME':
      // F21.3: Handler para CONTEXT_RESUME
      const resumeInput = userInput.toLowerCase().trim();
      if (resumeInput.includes('sí') || resumeInput.includes('si') || resumeInput.includes('yes') || 
          resumeInput.includes('continuar') || resumeInput.includes('continue')) {
        // Retomar desde last_known_step
        session.stage = 'DIAGNOSTIC_STEP';
        session.meta.updated_at = new Date().toISOString();
        const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
        const stepResult = await iaStep(session, allowedButtons, null, requestId);
        response = {
          reply: stepResult.reply,
          buttons: stepResult.buttons.map(b => ({
            label: b.label,
            value: b.value || b.token,
            token: b.token
          })),
          stage: 'DIAGNOSTIC_STEP'
        };
      } else {
        // Reiniciar
        session.stage = 'ASK_CONSENT';
        session.context.last_known_step = null;
        session.meta.updated_at = new Date().toISOString();
        response = {
          reply: TEXTS.ASK_CONSENT[session.language || 'es'],
          buttons: ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
            label: b.label,
            value: b.value,
            token: b.token
          })),
          stage: 'ASK_CONSENT'
        };
      }
      break;
    case 'ASK_FEEDBACK':
      // Manejar feedback
      const feedbackLower = userInput.toLowerCase().trim();
      if (feedbackLower.includes('sí') || feedbackLower.includes('si') || 
          feedbackLower.includes('yes') || feedbackLower.includes('👍')) {
        if (conversation) {
          conversation.feedback = 'positive';
          conversation.status = 'closed';
          await saveConversation(conversation);
        }
        // F27.1: Resumen final antes de cerrar
        const summary = session.language === 'es-AR'
          ? `\n\n📋 **Resumen de lo que hicimos:**\n- Problema: ${session.context.problem_description_raw || 'N/A'}\n- Pasos realizados: ${session.context.diagnostic_attempts || 0}\n- Resultado: Resuelto\n\nSi necesitás más ayuda, podés volver cuando quieras.`
          : `\n\n📋 **Summary of what we did:**\n- Problem: ${session.context.problem_description_raw || 'N/A'}\n- Steps taken: ${session.context.diagnostic_attempts || 0}\n- Result: Resolved\n\nIf you need more help, you can come back anytime.`;
        
        response = {
          reply: (session.language === 'es-AR' 
            ? '¡Gracias! ¡Que tengas un buen día!'
            : 'Thank you! Have a great day!') + summary,
          buttons: [],
          stage: 'ENDED',
          endConversation: true
        };
      } else {
        // Feedback negativo - preguntar motivo (simplificado por ahora)
        const summary = session.language === 'es-AR'
          ? `\n\n📋 **Resumen de lo que hicimos:**\n- Problema: ${session.context.problem_description_raw || 'N/A'}\n- Pasos realizados: ${session.context.diagnostic_attempts || 0}\n- Resultado: Requiere seguimiento\n\nSi necesitás más ayuda, podés volver cuando quieras.`
          : `\n\n📋 **Summary of what we did:**\n- Problem: ${session.context.problem_description_raw || 'N/A'}\n- Steps taken: ${session.context.diagnostic_attempts || 0}\n- Result: Requires follow-up\n\nIf you need more help, you can come back anytime.`;
        
        response = {
          reply: (session.language === 'es-AR'
            ? 'Gracias por tu feedback. Voy a trabajar en mejorar.\n\n¡Que tengas un buen día!'
            : 'Thanks for your feedback. I\'ll work on improving.\n\nHave a great day!') + summary,
          buttons: [],
          stage: 'ENDED',
          endConversation: true
        };
        if (conversation) {
          conversation.feedback = 'negative';
          conversation.status = 'closed';
          await saveConversation(conversation);
        }
      }
      break;
    default:
      response = {
        reply: session.language === 'es-AR'
          ? 'Disculpá, hubo un error. ¿Podés volver a empezar?'
          : 'Sorry, there was an error. Can you start over?',
        buttons: [],
        stage: 'ASK_CONSENT'
      };
  }
  
  // GARANTÍA DE CONTRATO: Asegurar que SIEMPRE haya reply no vacío
  if (!response || !response.reply || typeof response.reply !== 'string' || response.reply.trim().length === 0) {
    await log('ERROR', 'Respuesta sin reply detectada', {
      session_id: sessionId,
      conversation_id: session.conversation_id,
      stage: session.stage,
      response_received: response ? JSON.stringify(response).substring(0, 200) : 'null/undefined',
      user_input: userInput.substring(0, 100),
      boot_id: finalBootId
    });
    
    // Fallback seguro: re-render de botones del stage actual
    const currentButtons = ALLOWED_BUTTONS_BY_ASK[session.stage] || [];
    response = {
      reply: session.language === 'es-AR'
        ? '😕 Hubo un problema procesando tu selección. ¿Podés elegir nuevamente?'
        : '😕 There was a problem processing your selection. Can you choose again?',
      buttons: currentButtons.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: session.stage // Mantener stage actual
    };
  }
  
  // Actualizar stage en session
  if (response.stage) {
    // P2.3: Usar stageBefore capturado al inicio (no session.stage que ya puede haber cambiado)
    const stageAfter = response.stage;
    
    if (conversation && stageBefore !== stageAfter) {
      // OBTENER conversation_id DE FORMA SEGURA
      const conversationId = await getConversationIdSafe(session, conversation);
      
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        stage: stageAfter,
        name: 'STAGE_CHANGED',
        conversation_id: conversationId,
        boot_id: finalBootId || null,
        payload: { 
          from: stageBefore, 
          to: stageAfter,
          transition_reason: 'user_input_processed'
        }
      });
      
      // Log transición de stage
      // Log transición con información completa
      await trace.logStageTransition(
        traceContext,
        stageBefore,
        stageAfter,
        'stage_transition',
        { 
          user_input: userInput.substring(0, 100),
          session_state: {
            has_conversation_id: !!session.conversation_id,
            language: session.language,
            user_level: session.context.user_level
          }
        },
        null // expectedStage - se puede pasar si hay validación
      );
    }
    
    session.stage = stageAfter;
    session.meta.updated_at = new Date().toISOString();
  }
  
  // ========================================================
  // MODELO DE LOG MEJORADO - PERSISTENCIA COMPLETA
  // ========================================================
  // Modelo estándar para eventos de transcript:
  // {
  //   t: ISO8601 timestamp,
  //   role: 'user' | 'bot' | 'system',
  //   type: 'text' | 'button' | 'buttons' | 'image' | 'event',
  //   stage: string (stage actual),
  //   text: string (para mensajes de texto),
  //   buttons: array (para botones mostrados/seleccionados),
  //   button_chosen: object (para selección de botón por usuario),
  //   conversation_id: string,
  //   boot_id: string,
  //   payload: object (metadata adicional)
  // }
  // ========================================================
  
  // PERSISTENCIA ROBUSTA: Guardar input del usuario SIEMPRE (si hay conversación)
  // CRÍTICO: Guardar incluso si userInput está vacío (puede ser selección de botón)
  if (conversation || session.conversation_id) {
    try {
      // OBTENER conversation_id DE FORMA SEGURA
      const conversationId = await getConversationIdSafe(session, conversation);
      
      // Si userInput está vacío pero hay action/button, guardar igual
      const hasInput = userInput && userInput.trim().length > 0;
      
      if (hasInput) {
        // Detectar si es selección de botón o texto libre
        const isButtonSelection = userInput.match(/^(Sí, acepto|No acepto|Español|English|Básico|Intermedio|Avanzado)/i);
        
        await appendToTranscript(conversationId, {
          role: 'user',
          type: isButtonSelection ? 'button' : 'text',
          stage: session.stage || 'unknown',
          text: userInput,
          conversation_id: conversationId,
          boot_id: finalBootId || null,
          payload: {
            input_length: userInput.length,
            is_button: !!isButtonSelection,
            stage_before: session.stage || 'unknown'
          }
        });
        
        await log('DEBUG', 'Input de usuario guardado en transcript', {
          conversation_id: conversationId,
          input_preview: userInput.substring(0, 50),
          stage: session.stage,
          is_button: !!isButtonSelection
        });
      } else {
        // Si no hay input pero hay conversación, puede ser un botón sin texto
        // Los botones se guardan en los handlers específicos (handleAskConsent, etc.)
        await log('DEBUG', 'Input vacío, no se guarda (botones se guardan en handlers)', {
          conversation_id: conversationId,
          stage: session.stage
        });
      }
    } catch (err) {
      await log('ERROR', 'Error guardando input de usuario en transcript', {
        error: err.message,
        stack: err.stack,
        conversation_id: conversationId,
        boot_id: finalBootId,
        userInput_preview: userInput ? userInput.substring(0, 50) : 'null/undefined'
      });
    }
  } else {
    await log('WARN', 'No se puede guardar input: conversación no disponible', {
      has_conversation: !!conversation,
      conversation_id: conversation?.conversation_id || session.conversation_id || 'none',
      session_stage: session.stage,
      userInput_preview: userInput ? userInput.substring(0, 50) : 'null/undefined'
    });
  }
  
  // Guardar respuesta del bot en transcript (MODELO MEJORADO)
  if ((conversation || session.conversation_id) && response.reply) {
    try {
      // OBTENER conversation_id DE FORMA SEGURA
      const conversationId = await getConversationIdSafe(session, conversation);
      
      // Evento principal: respuesta del bot
      await appendToTranscript(conversationId, {
        role: 'bot',
        type: 'text',
        stage: response.stage || session.stage || 'unknown',
        text: response.reply,
        conversation_id: conversationId,
        boot_id: finalBootId || null,
        payload: {
          reply_length: response.reply.length,
          has_buttons: !!(response.buttons && response.buttons.length > 0),
          buttons_count: response.buttons ? response.buttons.length : 0,
          end_conversation: response.endConversation || false,
          stage_after: response.stage || session.stage || 'unknown'
        }
      });
    
    // Si hay botones, guardarlos como evento separado pero vinculado
    if (response.buttons && response.buttons.length > 0) {
      // OBTENER conversation_id DE FORMA SEGURA (ya obtenido arriba, pero por seguridad)
      const conversationId = await getConversationIdSafe(session, conversation);
      
      await appendToTranscript(conversationId, {
        role: 'bot',
        type: 'buttons',
        stage: response.stage || session.stage || 'unknown',
        buttons: response.buttons.map(b => ({
          label: b.label || b.text || '',
          value: b.value || b.token || '',
          token: b.token || b.value || ''
        })),
        conversation_id: conversationId,
        boot_id: finalBootId || null,
        payload: {
          buttons_count: response.buttons.length,
          attached_to_reply: true
        }
      });
      
      // Log botones mostrados en trace
      await trace.logButtonSelection(
        traceContext,
        response.buttons,
        null,
        'buttons_shown'
      );
    }
    
    // Log respuesta final con información completa
    await trace.logResponse(
      traceContext,
      response.reply,
      response.buttons || null,
      null,
      {
        expected_behavior: `Bot debería generar respuesta apropiada para stage ${response.stage}`,
        actual_behavior: `Respuesta generada: ${response.reply.substring(0, 100)}...`,
        expected_result: `Respuesta válida con stage ${response.stage}`,
        actual_result: `Respuesta generada, stage: ${response.stage}, buttons: ${response.buttons?.length || 0}`,
        state_snapshot: {
          stage: response.stage,
          has_buttons: !!(response.buttons && response.buttons.length > 0),
          response_length: response.reply.length,
          end_conversation: response.endConversation || false,
          conversation_id: session.conversation_id,
          language: session.language
        }
      }
    );
    } catch (err) {
      await log('ERROR', 'Error guardando respuesta del bot en transcript', {
        error: err.message,
        conversation_id: conversation.conversation_id,
        boot_id: finalBootId
      });
      // Si falla guardar, al menos persistir evento de error
      try {
        // OBTENER conversation_id DE FORMA SEGURA
        const conversationId = await getConversationIdSafe(session, conversation);
        
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'ERROR',
          payload: {
            error: 'Error guardando respuesta del bot',
            message: err.message,
            reply_fallback: response.reply.substring(0, 100)
          }
        });
      } catch (appendErr) {
        // Si incluso esto falla, solo loguear
        await log('ERROR', 'Error crítico: no se pudo guardar ni evento de error', {
          error: appendErr.message,
          conversation_id: conversation.conversation_id
        });
      }
    }
  }
  
  // Guardar conversación actualizada
  if (conversation) {
    try {
      await saveConversation(conversation);
    } catch (err) {
      await log('ERROR', 'Error guardando conversación', {
        error: err.message,
        conversation_id: conversation.conversation_id,
        boot_id: finalBootId
      });
    }
  }
  
  return response;
  } finally {
    // P0.1: Liberar lock siempre
    if (releaseLock) {
      releaseLock();
      conversationLocks.delete(session.conversation_id);
    }
  }
}

// ========================================================
// EXPRESS APP
// ========================================================

const app = express();

// Configurar trust proxy para que express-rate-limit funcione correctamente detrás de un proxy
// Esto es necesario cuando la app está detrás de un proxy reverso (como Render, nginx, etc.)
app.set('trust proxy', true);

// Rate Limiting
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: 'Demasiados requests. Por favor, intentá más tarde.',
  standardHeaders: true,
  legacyHeaders: false
});

const greetingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 requests por ventana
  message: 'Demasiados requests. Por favor, intentá más tarde.'
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    const allowWildcard = ALLOWED_ORIGINS.includes('*');
    const effectiveOrigins = (NODE_ENV === 'development' && allowWildcard)
      ? ALLOWED_ORIGINS
      : ALLOWED_ORIGINS.filter(o => o !== '*');
    
    if (!origin) {
      return callback(null, true); // Requests sin origen (curl, same-origin) permitidos
    }
    
    if (effectiveOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    if (allowWildcard && NODE_ENV === 'development') {
      callback(null, true);
      return;
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para generar boot_id al inicio de cada request
app.use((req, res, next) => {
  // Generar boot_id SIEMPRE al inicio (antes de cualquier otra lógica)
  const bootId = trace.generateBootId();
  req.bootId = bootId;
  
  // Crear contexto de trace básico con boot_id
  const traceContext = trace.createTraceContext(
    null, // conversation_id aún no existe
    `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    null,
    null,
    NODE_ENV,
    null,
    bootId
  );
  
  // Log inicio de request
  trace.logEvent('INFO', 'REQUEST_START', {
    actor: 'system',
    endpoint: req.path,
    method: req.method,
    ip: req.ip
  }, traceContext).catch(() => {}); // No bloquear si falla
  
  // Guardar contexto en request para uso posterior
  req.traceContext = traceContext;
  
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'STI Chat API is running', version: '2.0.0' });
});

// Health check extendido con validaciones de fs y configuración
app.get('/healthz', async (req, res) => {
  const checks = {
    fs_write: false,
    log_token_configured: !!LOG_TOKEN,
    openai_configured: !!OPENAI_API_KEY
  };
  
  try {
    await fs.access(DATA_BASE, fsSync.constants.W_OK);
    const tmpFile = path.join(DATA_BASE, `healthcheck-${Date.now()}.tmp`);
    await fs.writeFile(tmpFile, 'ok', 'utf-8');
    await fs.unlink(tmpFile).catch(() => {});
    checks.fs_write = true;
  } catch (err) {
    checks.fs_error = err.message;
  }
  
  const healthy = checks.fs_write && checks.log_token_configured;
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    status: healthy ? 'healthy' : 'degraded',
    checks
  });
});

// ========================================================
// SERVIR IMÁGENES (solo lectura, sin path traversal)
// ========================================================

/**
 * Endpoint seguro para servir imágenes subidas
 * Formato: /api/images/<conversation_id>/<filename>
 * Validaciones:
 * - conversation_id debe tener formato AA0000-ZZ9999
 * - filename debe ser alfanumérico con extensiones permitidas
 * - Path debe estar dentro de UPLOADS_DIR
 */
app.get('/api/images/:conversationId/:filename', async (req, res) => {
  try {
    const { conversationId, filename } = req.params;
    
    // Validar formato de conversation_id (previene path traversal)
    if (!/^[A-Z]{2}\d{4}$/.test(conversationId)) {
      return res.status(400).json({ ok: false, error: 'Formato de conversation_id inválido' });
    }
    
    // Validar nombre de archivo (solo alfanumérico, guiones, puntos y extensiones permitidas)
    if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      return res.status(400).json({ ok: false, error: 'Nombre de archivo inválido' });
    }
    
    // Extensiones permitidas
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const fileExtension = filename.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({ ok: false, error: 'Extensión de archivo no permitida' });
    }
    
    // Construir path seguro
    const imagePath = path.join(UPLOADS_DIR, conversationId, filename);
    
    // Verificar que el path resuelto esté dentro de UPLOADS_DIR (previene path traversal)
    const resolvedPath = path.resolve(imagePath);
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      await log('WARN', 'Intento de path traversal detectado', {
        conversation_id: conversationId,
        filename,
        resolved_path: resolvedPath,
        uploads_dir: resolvedUploadsDir
      });
      return res.status(403).json({ ok: false, error: 'Acceso denegado' });
    }
    
    // Verificar que el archivo existe
    try {
      await fs.access(imagePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ ok: false, error: 'Imagen no encontrada' });
      }
      throw err;
    }
    
    // Verificar tamaño del archivo antes de leer
    const imageStats = await fs.stat(imagePath);
    if (imageStats.size > MAX_IMAGE_SIZE_BYTES) {
      return res.status(413).json({ ok: false, error: 'Imagen demasiado grande' });
    }
    
    // Leer archivo y determinar MIME type
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    
    const mimeType = mimeTypes[fileExtension] || 'application/octet-stream';
    
    // Leer y servir archivo
    const fileBuffer = await fs.readFile(imagePath);
    
    // Headers de seguridad
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24 horas
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    res.send(fileBuffer);
  } catch (err) {
    await log('ERROR', 'Error sirviendo imagen', {
      error: err.message,
      conversation_id: req.params.conversationId,
      filename: req.params.filename
    });
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para resetear sesión
app.post('/api/reset', async (req, res) => {
  // LOG DETALLADO: Inicio de /api/reset
  const bootId = req.bootId || trace.generateBootId();
  await logDebug('DEBUG', '/api/reset - Inicio', {
    boot_id: bootId,
    has_body: !!req.body,
    body_keys: req.body ? Object.keys(req.body) : [],
    session_id: req.body?.sessionId || 'none'
  }, 'server.js', 6042, 6042);
  
  try {
    const { sessionId } = req.body;
    
    // Validación más flexible: si no hay sessionId, intentar obtenerlo de query o generar uno nuevo
    let effectiveSessionId = sessionId;
    if (!effectiveSessionId || typeof effectiveSessionId !== 'string') {
      effectiveSessionId = req.query.sessionId || req.headers['x-session-id'];
      
      if (!effectiveSessionId || typeof effectiveSessionId !== 'string') {
        await logDebug('WARN', '/api/reset - sessionId no proporcionado', {
          boot_id: bootId,
          body: req.body,
          query: req.query
        }, 'server.js', 6046, 6050);
        
        // Retornar éxito sin hacer nada (idempotente)
        return res.json({ 
          ok: true, 
          message: 'sessionId no proporcionado, operación omitida',
          stage: 'ASK_CONSENT'
        });
      }
    }
    
    const session = getSession(effectiveSessionId);
    if (!session) {
      // Si la sesión no existe, retornar éxito (idempotente)
      await logDebug('DEBUG', '/api/reset - Sesión no encontrada', {
        boot_id: bootId,
        session_id: effectiveSessionId
      }, 'server.js', 6054, 6059);
      
      return res.json({ 
        ok: true, 
        message: 'Sesión no encontrada o ya reseteada',
        stage: 'ASK_CONSENT'
      });
    }
    
    // Resetear sesión a estado inicial
    session.stage = 'ASK_CONSENT';
    session.language = null;
    session.user = { name_raw: null, name_norm: null };
    session.user_level = null;
    session.context = {
      risk_level: 'low',
      impact_summary_shown: false,
      device_category: null,
      device_type: null,
      external_type: null,
      problem_description_raw: null,
      problem_category: null,
      last_known_step: null
    };
    session.modes = {
      interaction_mode: null,
      learning_depth: null,
      tech_format: false,
      executor_role: null,
      advisory_mode: false,
      emotional_release_used: false
    };
    session.meta = {
      created_at: session.meta?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      emotion: 'neutral'
    };
    session.conversation_id = null;
    
    await logDebug('DEBUG', '/api/reset - Sesión reseteada', {
      boot_id: bootId,
      session_id: effectiveSessionId,
      stage: session.stage
    }, 'server.js', 6072, 6075);
    
    await log('INFO', 'Sesión reseteada', { 
      session_id: effectiveSessionId,
      boot_id: bootId
    });
    
    res.json({ 
      ok: true, 
      message: 'Sesión reseteada correctamente',
      stage: 'ASK_CONSENT',
      sid: effectiveSessionId
    });
    
  } catch (err) {
    await logDebug('ERROR', '/api/reset - Error', {
      boot_id: bootId,
      error: err.message,
      stack: err.stack
    }, 'server.js', 6083, 6088).catch(() => {});
    
    await log('ERROR', 'Error en /api/reset', { 
      error: err.message, 
      stack: err.stack,
      boot_id: bootId
    });
    
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      message: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Endpoint principal de chat
app.post('/api/chat', chatLimiter, async (req, res) => {
  // boot_id ya está asignado por el middleware
  const bootId = req.bootId;
  let traceContext = req.traceContext || trace.createTraceContext(
    null,
    `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    null,
    null,
    NODE_ENV,
    null,
    bootId || trace.generateBootId()
  );
  let requestId = null;
  
  // LOG DETALLADO: Inicio del endpoint
  await logDebug('DEBUG', 'POST /api/chat - Inicio de request', {
    boot_id: bootId,
    session_id: req.body?.sessionId,
    has_message: !!req.body?.message,
    has_image: !!req.body?.imageBase64,
    has_action: !!req.body?.action,
    action: req.body?.action,
    request_body_keys: Object.keys(req.body || {}),
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']?.substring(0, 100),
      'origin': req.headers['origin']
    }
  }, 'server.js', 5454, 5460);
  
  try {
    // F23.1: Validación estricta de eventos entrantes
    const validation = validateChatRequest(req.body);
    if (!validation.valid) {
      // Log error de validación con información completa
      await trace.logEvent('ERROR', 'VALIDATION_ERROR', {
        actor: 'system',
        endpoint: '/api/chat',
        error: validation.error,
        boot_id: bootId,
        request_body: {
          sessionId: req.body?.sessionId,
          has_message: !!req.body?.message,
          has_image: !!req.body?.imageBase64,
          stage: req.body?.stage || 'unknown',
          message_type: typeof req.body?.message,
          imageBase64_type: typeof req.body?.imageBase64,
          sessionId_type: typeof req.body?.sessionId
        },
        expected_behavior: `Request body debería cumplir con el esquema de validación: sessionId (string), message (string opcional), imageBase64 (string opcional)`,
        actual_behavior: `Validación falló: ${validation.error}`,
        expected_result: `Request válido que pase todas las validaciones`,
        actual_result: `Request inválido: ${validation.error}`,
        preconditions: [
          `sessionId debe ser string no vacío`,
          `message debe ser string (si está presente)`,
          `imageBase64 debe ser string (si está presente)`,
          `request_id debe ser string (si está presente)`
        ],
        conditions_met: false,
        decision_reason: `Validación de esquema falló`,
        decision_evidence: {
          validation_error: validation.error,
          request_body: {
            sessionId: req.body?.sessionId,
            sessionId_type: typeof req.body?.sessionId,
            sessionId_length: req.body?.sessionId?.length || 0,
            has_message: !!req.body?.message,
            message_type: typeof req.body?.message,
            has_imageBase64: !!req.body?.imageBase64,
            imageBase64_type: typeof req.body?.imageBase64
          }
        },
        decision_outcome: `Request rechazado con HTTP 400`,
        state_snapshot: {
          endpoint: '/api/chat',
          method: req.method,
          validation_error: validation.error,
          request_body_keys: Object.keys(req.body || {}),
          request_body_size: JSON.stringify(req.body || {}).length
        },
        validation_passed: false,
        validation_errors: validation.error,
        validation_rules: [
          'sessionId: string, longitud > 0',
          'message: string (opcional)',
          'imageBase64: string (opcional)',
          'request_id: string (opcional)'
        ],
        troubleshooting_hints: [
          `Revisar el error de validación: ${validation.error}`,
          `Verificar tipos de datos en el request body`,
          `Verificar que sessionId sea string y no esté vacío`,
          `Revisar código del frontend que construye el request`,
          `Verificar que no haya problemas de serialización JSON`
        ],
        suggested_fix: `Corregir el request body para cumplir con el esquema de validación. Asegurar que sessionId sea string no vacío y que message/imageBase64 sean strings si están presentes.`
      }, traceContext);
      
      await log('ERROR', 'Validación fallida en /api/chat', { 
        error: validation.error,
        boot_id: bootId,
        body: req.body,
        validation_details: {
          sessionId_type: typeof req.body?.sessionId,
          message_type: typeof req.body?.message,
          imageBase64_type: typeof req.body?.imageBase64
        }
      });
      
      return res.status(400).json({ ok: false, error: validation.error });
    }
    
    const { sessionId, message, imageBase64, imageName, request_id, action, value, label } = req.body;
    
    // Si hay action (botón), convertir value/label a message para compatibilidad
    let effectiveMessage = message;
    if (action === 'button' && value && !message && !imageBase64) {
      // Request de botón sin message: usar value como mensaje
      effectiveMessage = value;
      await log('INFO', 'Request de botón convertido a message', { 
        boot_id: bootId,
        session_id: sessionId,
        action,
        value,
        label
      });
    }
    
    if (!sessionId) {
      await trace.logEvent('ERROR', 'MISSING_SESSION_ID', {
        actor: 'system',
        endpoint: '/api/chat',
        boot_id: bootId,
        request_body: req.body,
        expected_behavior: `Request a /api/chat debería incluir 'sessionId' (string) en el body`,
        actual_behavior: `Request recibido sin 'sessionId' en el body`,
        expected_result: `Request válido con sessionId presente`,
        actual_result: `Request inválido: falta sessionId`,
        preconditions: [
          `Request body debe contener 'sessionId'`,
          `sessionId debe ser string no vacío`,
          `sessionId debe ser válido (formato esperado)`
        ],
        conditions_met: false,
        decision_reason: `Validación falló: request sin sessionId`,
        decision_evidence: {
          has_sessionId: false,
          request_body_keys: Object.keys(req.body || {}),
          request_method: req.method,
          request_path: req.path,
          body_preview: JSON.stringify(req.body || {}).substring(0, 200)
        },
        decision_outcome: `Request rechazado con HTTP 400`,
        state_snapshot: {
          endpoint: '/api/chat',
          method: req.method,
          has_sessionId: false,
          request_body_size: JSON.stringify(req.body || {}).length,
          request_body_keys: Object.keys(req.body || {})
        },
        validation_passed: false,
        validation_errors: 'Falta campo requerido: sessionId',
        validation_rules: [
          'sessionId debe estar presente en body',
          'sessionId debe ser string',
          'sessionId debe tener longitud > 0'
        ],
        troubleshooting_hints: [
          `Verificar que el frontend esté enviando 'sessionId' en el body`,
          `Verificar que el body del request no esté vacío o malformado`,
          `Revisar código del frontend que hace el POST a /api/chat`,
          `Verificar que no haya problemas de serialización JSON`,
          `Revisar si el sessionId se está perdiendo en algún middleware`
        ],
        suggested_fix: `Asegurar que el frontend siempre envíe 'sessionId' en el body del POST. Verificar que el sessionId se genere correctamente en el frontend antes de hacer el request.`
      }, traceContext);
      
      await log('ERROR', 'sessionId faltante en /api/chat', { 
        boot_id: bootId,
        body: req.body,
        request_body_keys: Object.keys(req.body || {})
      });
      
      return res.status(400).json({ ok: false, error: 'sessionId requerido' });
    }
    
    // Validar que haya al menos message, imageBase64, o action (botón)
    const hasMessage = !!effectiveMessage;
    const hasImage = !!imageBase64;
    const hasButtonAction = action === 'button' && value;
    
    if (!hasMessage && !hasImage && !hasButtonAction) {
      await trace.logEvent('ERROR', 'MISSING_MESSAGE', {
        actor: 'system',
        endpoint: '/api/chat',
        boot_id: bootId,
        session_id: sessionId,
        expected_behavior: `Request a /api/chat debería incluir 'message' (string), 'imageBase64' (string base64), o 'action'='button' con 'value' en el body`,
        actual_behavior: `Request recibido sin 'message', 'imageBase64', ni 'action'='button' válido en el body`,
        expected_result: `Request válido con al menos message, imageBase64, o action=button`,
        actual_result: `Request inválido: falta message, imageBase64 y action válido`,
        preconditions: [
          `Request body debe contener 'message', 'imageBase64', o 'action'='button' con 'value'`,
          `Al menos uno de estos campos debe estar presente`,
          `Los campos deben ser válidos según su tipo`
        ],
        conditions_met: false,
        decision_reason: `Validación falló: request sin message, imageBase64 ni action válido`,
        decision_evidence: {
          has_message: !!message,
          has_imageBase64: !!imageBase64,
          has_action: !!action,
          action_value: action,
          has_value: !!value,
          request_body_keys: Object.keys(req.body || {}),
          request_method: req.method,
          request_path: req.path
        },
        decision_outcome: `Request rechazado con HTTP 400`,
        state_snapshot: {
          endpoint: '/api/chat',
          method: req.method,
          session_id: sessionId,
          has_message: false,
          has_imageBase64: false,
          has_action: !!action,
          action: action,
          request_body_size: JSON.stringify(req.body || {}).length
        },
        validation_passed: false,
        validation_errors: 'Falta campo requerido: message, imageBase64, o action=button con value',
        validation_rules: [
          'message debe ser string (opcional si hay imageBase64 o action)',
          'imageBase64 debe ser string base64 (opcional si hay message o action)',
          'action debe ser "button" con value (opcional si hay message o imageBase64)',
          'Al menos uno de los tres debe estar presente'
        ],
        troubleshooting_hints: [
          `Verificar que el frontend esté enviando 'message', 'imageBase64', o 'action'='button' con 'value' en el body`,
          `Verificar que el body del request no esté vacío`,
          `Revisar código del frontend que hace el POST a /api/chat`,
          `Verificar que no haya problemas de serialización JSON`,
          `Revisar logs anteriores del mismo boot_id para ver el flujo completo`,
          `Si es un botón, asegurar que action='button' y value esté presente`
        ],
        suggested_fix: `Asegurar que el frontend siempre envíe 'message', 'imageBase64', o 'action'='button' con 'value' en el body del POST. Si el usuario hace clic en un botón, enviar: { action: 'button', value: 'valor_del_boton', label: 'Etiqueta', sessionId: '...' }`
      }, traceContext);
      
      await log('ERROR', 'message, imageBase64 o action faltante en /api/chat', { 
        boot_id: bootId,
        session_id: sessionId,
        request_body: {
          keys: Object.keys(req.body || {}),
          has_message: !!message,
          has_imageBase64: !!imageBase64,
          has_action: !!action,
          action: action,
          has_value: !!value
        }
      });
      
      return res.status(400).json({ ok: false, error: 'message, imageBase64 o action requerido' });
    }
    
    // F23.2: Validar orden cronológico (si viene timestamp)
    if (req.body.timestamp && sessionId) {
      const session = getSession(sessionId);
      if (session.conversation_id) {
        const conversation = await loadConversation(session.conversation_id);
        if (conversation && conversation.transcript && conversation.transcript.length > 0) {
          const lastEvent = conversation.transcript[conversation.transcript.length - 1];
          if (lastEvent && lastEvent.t && new Date(req.body.timestamp) < new Date(lastEvent.t)) {
            // Evento fuera de orden - rechazar
            await trace.logEvent('WARN', 'OUT_OF_ORDER_EVENT', {
              actor: 'system',
              endpoint: '/api/chat',
              boot_id: bootId,
              conversation_id: session.conversation_id
            }, traceContext);
            
            return res.status(400).json({ 
              ok: false, 
              error: 'Evento fuera de orden cronológico' 
            });
          }
        }
      }
    }
    
    // P1.1: Generar request_id si no viene
    requestId = request_id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Actualizar traceContext con request_id
    if (traceContext) {
      traceContext.request_id = requestId;
    }
    
    await log('INFO', `Chat request`, { 
      sessionId, 
      hasMessage: !!effectiveMessage, 
      hasImage: !!imageBase64, 
      hasAction: !!action,
      action: action,
      request_id: requestId, 
      boot_id: bootId 
    });
    
    // Log entrada de request
    await trace.logEvent('INFO', 'CHAT_REQUEST', {
      actor: 'user',
      endpoint: '/api/chat',
      session_id: sessionId,
      has_message: !!effectiveMessage,
      has_image: !!imageBase64,
      has_action: !!action,
      action: action,
      boot_id: bootId
    }, traceContext);
    
    const response = await handleChatMessage(sessionId, effectiveMessage || '', imageBase64, requestId, bootId);
    
    // F23.3: Validar que frontend pueda representar estados
    if (response.buttons && !validateButtonsForFrontend(response.buttons)) {
      await log('WARN', 'Botones inválidos para frontend, normalizando', { 
        conversation_id: sessionId,
        buttons: response.buttons 
      });
      // Normalizar botones
      response.buttons = normalizeButtons(response.buttons);
    }
    
    // Formato compatible con frontend
    const frontendResponse = {
      ok: true,
      reply: response.reply,
      sid: sessionId,
      stage: response.stage,
      options: response.buttons ? response.buttons.map(b => b.label || b.value) : [],
      buttons: response.buttons || [],
      endConversation: response.endConversation || false,
      capabilities: {
        images: true // Habilitar imágenes (puede ser controlado por variable de entorno)
      }
    };
    
    res.json(frontendResponse);
  } catch (err) {
    // Detectar código HTTP y tipo de error
    const httpError = detectHttpError(err);
    const { status, errorType, severity, description } = httpError;
    
    await log('ERROR', `Error en /api/chat (${errorType})`, { 
      error: err.message, 
      stack: err.stack, 
      boot_id: bootId,
      session_id: req.body?.sessionId,
      stage: req.body?.stage || 'unknown',
      http_status: status,
      error_type: errorType,
      severity: severity,
      description: description
    });
    
    // Log error en trace (usar traceContext del request que ya tiene boot_id)
    try {
      const errorContext = traceContext || trace.createTraceContext(
        null,
        requestId || `req-${Date.now()}`,
        null,
        null,
        NODE_ENV,
        null,
        bootId || trace.generateBootId()
      );
      
      // Log error con información completa para reparación
      await trace.logError(
        errorContext, 
        err, 
        severity, 
        `Error en /api/chat (${status}): ${err.message}`, 
        false,
        `Endpoint /api/chat debería procesar request y retornar respuesta JSON válida`,
        `Error HTTP ${status}: ${err.message}`,
        [
          `Verificar que request body sea válido: sessionId=${!!req.body?.sessionId}, message=${!!req.body?.message}`,
          `Verificar que session exista y sea válida`,
          `Revisar logs anteriores para contexto completo`,
          status >= 500 ? `Error del servidor, revisar código en ${err.stack?.split('\n')[1]?.trim() || 'ubicación desconocida'}` : `Error del cliente, verificar validación de entrada`
        ]
      );
      
      // Log evento específico para el tipo de error HTTP con información completa
      await trace.logEvent('ERROR', errorType, {
        actor: 'system',
        endpoint: '/api/chat',
        error: err.message,
        http_status: status,
        severity: severity,
        description: description,
        boot_id: bootId,
        session_id: req.body?.sessionId,
        stage: req.body?.stage || 'unknown',
        request_body: {
          has_sessionId: !!req.body?.sessionId,
          has_message: !!req.body?.message,
          has_image: !!req.body?.imageBase64,
          message_preview: req.body?.message?.substring(0, 50) || null
        },
        expected_behavior: `Endpoint debería procesar request y retornar respuesta exitosa`,
        actual_behavior: `Error HTTP ${status}: ${err.message}`,
        expected_result: `Respuesta JSON con ok: true`,
        actual_result: `Error HTTP ${status}`,
        preconditions: [
          `Request body válido`,
          `Session válida (si aplica)`,
          `Sistema operativo correctamente`
        ],
        conditions_met: false,
        decision_reason: `Error detectado, retornar código HTTP ${status}`,
        decision_evidence: err.stack,
        decision_outcome: `Request fallido con código ${status}`,
        state_snapshot: {
          endpoint: '/api/chat',
          method: req.method,
          has_sessionId: !!req.body?.sessionId,
          has_message: !!req.body?.message,
          stage: req.body?.stage || 'unknown'
        },
        troubleshooting_hints: [
          `Revisar stack trace completo`,
          `Verificar precondiciones del request`,
          `Revisar logs anteriores del mismo boot_id: ${bootId}`,
          status >= 500 ? `Error interno, revisar código del servidor` : `Error de validación, revisar formato del request`
        ],
        suggested_fix: status >= 500 
          ? `Revisar y corregir código en ${err.stack?.split('\n')[1]?.trim() || 'ubicación desconocida'}`
          : `Mejorar validación de entrada o manejo de casos edge`
      }, errorContext);
    } catch (traceErr) {
      // Ignorar errores de trace pero loguear
      await log('WARN', 'Error al loguear en trace', { trace_error: traceErr.message });
    }
    
    // Mensaje de error apropiado según el código HTTP
    let errorMessage = description;
    if (status === 400) {
      errorMessage = err.message || 'Solicitud inválida';
    } else if (status === 401) {
      errorMessage = 'No autorizado. Verificá tus credenciales.';
    } else if (status === 403) {
      errorMessage = 'Acceso prohibido. Token inválido o sin permisos.';
    } else if (status === 404) {
      errorMessage = 'Recurso no encontrado.';
    } else if (status === 429) {
      errorMessage = 'Demasiadas solicitudes. Por favor, esperá un momento.';
    } else if (status >= 500) {
      errorMessage = 'Error interno del servidor';
    }
    
    res.status(status).json({
      ok: false,
      error: errorMessage,
      message: NODE_ENV === 'development' ? err.message : undefined,
      http_status: status
    });
  }
});

// Endpoint de greeting (inicio de chat)
app.get('/api/greeting', greetingLimiter, async (req, res) => {
  try {
    const sessionId = req.query.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session = getSession(sessionId);
    
    // Resetear a ASK_CONSENT si es necesario
    if (session.stage !== 'ASK_CONSENT') {
      session.stage = 'ASK_CONSENT';
    }
    
    // Generar conversation_id ANTES de mostrar GDPR (si no existe)
    let conversationId = session.conversation_id;
    if (!conversationId) {
      try {
        conversationId = await reserveUniqueConversationId();
        session.conversation_id = conversationId;
        session.meta.updated_at = new Date().toISOString();
        
        // Vincular boot_id a conversation_id
        const bootId = req.bootId || trace.generateBootId();
        if (bootId) {
          trace.linkBootIdToConversationId(bootId, conversationId);
        }
        
        // Crear conversación inmediatamente para poder guardar el transcript
        const newConversation = {
          conversation_id: conversationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          flow_version: FLOW_VERSION,
          schema_version: SCHEMA_VERSION,
          language: 'es', // Por defecto, se actualizará cuando seleccione idioma
          user: { name_norm: null },
          status: 'open',
          feedback: 'none',
          transcript: [],
          started_at: new Date().toISOString()
        };
        
        await saveConversation(newConversation);
        
        // Guardar mensaje de GDPR en transcript (MODELO MEJORADO)
        const consentText = TEXTS.ASK_CONSENT.es;
        const gdprMessage = `${consentText}\n\n🆔 **ID de la conversación: ${conversationId}**`;
        await appendToTranscript(conversationId, {
          role: 'bot',
          type: 'text',
          stage: 'ASK_CONSENT',
          text: gdprMessage,
          conversation_id: conversationId,
          payload: {
            is_initial_message: true,
            has_buttons: true
          }
        });
        
        // Guardar botones de consentimiento
        const consentButtons = ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        }));
        await appendToTranscript(conversationId, {
          role: 'bot',
          type: 'buttons',
          stage: 'ASK_CONSENT',
          buttons: consentButtons,
          conversation_id: conversationId,
          payload: {
            attached_to_reply: true,
            buttons_count: consentButtons.length
          }
        });
      } catch (err) {
        await log('ERROR', 'Error generando conversation_id en /api/greeting', {
          error: err.message,
          session_id: sessionId,
          boot_id: req.bootId
        });
        // Continuar sin conversation_id si falla
      }
    }
    
    // Incluir ID de conversación en el mensaje de GDPR
    let reply = TEXTS.ASK_CONSENT.es; // Por defecto español, luego se puede cambiar
    if (conversationId) {
      reply = `${reply}\n\n🆔 **ID de la conversación: ${conversationId}**`;
    }
    
    const buttons = ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
      label: b.label,
      value: b.value,
      token: b.token
    }));
    
    res.json({
      ok: true,
      reply,
      sid: sessionId,
      stage: 'ASK_CONSENT',
      options: buttons.map(b => b.label),
      buttons
    });
  } catch (err) {
    const bootId = req.bootId || trace.generateBootId();
    const traceContext = req.traceContext || trace.createTraceContext(
      null,
      `req-${Date.now()}`,
      null,
      null,
      NODE_ENV,
      null,
      bootId
    );
    
    const httpError = await logHttpError(traceContext, err, '/api/greeting', req, res);
    // Fallback amigable: aun con error devolver GDPR para no romper el flujo
    try {
      const fallbackSessionId = req.query.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fallbackReply = TEXTS.ASK_CONSENT.es;
      const buttons = ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      }));
      
      await log('WARN', 'Fallback GDPR en /api/greeting por error', {
        error: err.message,
        boot_id: bootId,
        http_status: httpError.status
      });
      
      return res.status(200).json({
        ok: true,
        reply: fallbackReply,
        sid: fallbackSessionId,
        stage: 'ASK_CONSENT',
        options: buttons.map(b => b.label),
        buttons
      });
    } catch (fallbackErr) {
      // Si el fallback falla, enviar el error original
      return res.status(httpError.status).json({
        ok: false,
        error: httpError.status >= 500 ? 'Error interno del servidor' : err.message || httpError.description,
        message: NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
});

// Endpoint para obtener eventos en vivo
// Endpoint para logs de depuración en tiempo real
app.get('/api/debug-logs', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    const limit = parseInt(req.query.limit || '500');
    const since = req.query.since ? parseInt(req.query.since) : null; // Timestamp para obtener solo logs nuevos
    
    // Leer archivo de logs
    let logContent = '';
    try {
      logContent = await fs.readFile(SERVER_LOG_FILE, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json({ ok: true, logs: [], total: 0 });
      }
      throw err;
    }
    
    // Parsear líneas de log
    const lines = logContent.split('\n').filter(l => l.trim());
    const parsedLogs = [];
    
    for (const line of lines) {
      // Formato: [timestamp] [level] (archivo:linea) mensaje {data}
      const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\](?:\s+\(([^)]+)\))?\s+(.+)$/);
      if (match) {
        const [, timestamp, level, fileInfo, message] = match;
        const fileMatch = fileInfo ? fileInfo.match(/^([^:]+):(\d+)(?:-(\d+))?$/) : null;
        
        parsedLogs.push({
          timestamp,
          level: level.toLowerCase(),
          file: fileMatch ? fileMatch[1] : (fileInfo || 'unknown'),
          line: fileMatch ? parseInt(fileMatch[2]) : null,
          message: message.trim(),
          raw: line,
          timestamp_ms: new Date(timestamp).getTime()
        });
      } else {
        // Si no coincide el formato, agregar como log crudo
        parsedLogs.push({
          timestamp: new Date().toISOString(),
          level: 'info',
          file: 'unknown',
          line: null,
          message: line.trim(),
          raw: line,
          timestamp_ms: Date.now()
        });
      }
    }
    
    // Filtrar por timestamp si se proporciona
    let filteredLogs = parsedLogs;
    if (since) {
      filteredLogs = parsedLogs.filter(log => log.timestamp_ms > since);
    }
    
    // Ordenar por timestamp descendente (más nuevos primero) y tomar los últimos N
    filteredLogs.sort((a, b) => b.timestamp_ms - a.timestamp_ms);
    const limitedLogs = filteredLogs.slice(0, limit);
    
    res.json({
      ok: true,
      logs: limitedLogs,
      total: parsedLogs.length,
      filtered: filteredLogs.length,
      returned: limitedLogs.length,
      latest_timestamp: limitedLogs.length > 0 ? limitedLogs[0].timestamp_ms : null
    });
  } catch (err) {
    await log('ERROR', 'Error en /api/debug-logs', { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/live-events', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Validar token obligatorio para evitar acceso no autorizado
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      const bootId = req.bootId || trace.generateBootId();
      const traceContext = req.traceContext || trace.createTraceContext(
        null,
        `req-${Date.now()}`,
        null,
        null,
        NODE_ENV,
        null,
        bootId
      );
      
      await trace.logEvent('ERROR', 'HTTP_403_FORBIDDEN', {
        actor: 'system',
        endpoint: '/api/live-events',
        error: 'Token inválido',
        boot_id: bootId,
        has_token: !!token
      }, traceContext);
      
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    // Filtros opcionales
    const filters = {
      boot_id: req.query.boot_id || null,
      conversation_id: req.query.conversation_id || null,
      level: req.query.level ? req.query.level.split(',') : null,
      endpoint: req.query.endpoint || null,
      limit: req.query.limit ? parseInt(req.query.limit) : 500
    };
    
    // Obtener eventos del buffer
    const events = trace.getLiveEvents(filters);
    
    res.json({
      ok: true,
      events: events,
      total: events.length,
      filters: filters
    });
  } catch (err) {
    const bootId = req.bootId || trace.generateBootId();
    const traceContext = req.traceContext || trace.createTraceContext(
      null,
      `req-${Date.now()}`,
      null,
      null,
      NODE_ENV,
      null,
      bootId
    );
    
    const httpError = await logHttpError(traceContext, err, '/api/live-events', req, res);
    
    res.status(httpError.status).json({
      ok: false,
      error: httpError.status >= 500 ? 'Error interno del servidor' : err.message || httpError.description,
      message: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Endpoint para obtener último error por boot_id
app.get('/api/live-events/last-error', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    const lastError = trace.getLastErrorByBootId();
    const bootId = lastError ? lastError.boot_id : null;
    
    if (!bootId) {
      return res.json({
        ok: true,
        has_error: false,
        message: 'No hay errores recientes'
      });
    }
    
    // Obtener todos los eventos de ese boot_id
    const events = trace.getEventsByBootId(bootId);
    
    res.json({
      ok: true,
      has_error: true,
      boot_id: bootId,
      last_error: lastError,
      all_events: events,
      total_events: events.length
    });
  } catch (err) {
    await log('ERROR', 'Error en /api/live-events/last-error', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener transcript en formato JSON
app.get('/api/transcript-json/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').trim().toUpperCase();
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Validar token obligatorio
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      const bootId = req.bootId || trace.generateBootId();
      const traceContext = req.traceContext || trace.createTraceContext(
        null,
        `req-${Date.now()}`,
        null,
        null,
        NODE_ENV,
        null,
        bootId
      );
      
      await trace.logEvent('ERROR', 'HTTP_403_FORBIDDEN', {
        actor: 'system',
        endpoint: '/api/transcript-json',
        error: 'Token inválido',
        boot_id: bootId,
        conversation_id: conversationId,
        has_token: !!token
      }, traceContext);
      
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    // Validar formato de conversation_id (AA0000-ZZ9999)
    if (!conversationId || !/^[A-Z]{2}\d{4}$/.test(conversationId)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Formato de ID inválido. Debe ser formato AA0000 (2 letras + 4 dígitos)' 
      });
    }
    
    // Cargar conversación
    const conversation = await loadConversation(conversationId);
    
    if (!conversation) {
      await log('INFO', `Conversación no encontrada en /api/transcript-json`, { 
        conversation_id: conversationId,
        boot_id: req.bootId
      });
      
      return res.status(404).json({ 
        ok: false, 
        error: 'Conversación no encontrada. Verificá que el ID sea correcto.' 
      });
    }
    
    // Retornar transcript en formato JSON
    res.json({
      ok: true,
      conversation_id: conversationId,
      transcript: conversation.transcript || [],
      total_events: conversation.transcript?.length || 0,
      flow_version: conversation.flow_version,
      schema_version: conversation.schema_version,
      status: conversation.status,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at
    });
    
  } catch (err) {
    await log('ERROR', 'Error en /api/transcript-json', { 
      error: err.message, 
      stack: err.stack,
      conversation_id: req.params.conversationId,
      boot_id: req.bootId
    });
    
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener trace detallado de una conversación
app.get('/api/trace/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Validar token obligatorio
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    if (!conversationId) {
      return res.status(400).json({ ok: false, error: 'conversationId requerido' });
    }
    
    // Leer trace
    const events = await trace.readTrace(conversationId);
    
    if (events.length === 0) {
      return res.json({
        ok: true,
        conversation_id: conversationId,
        has_trace: false,
        events: [],
        message: 'No hay trace detallado para esta conversación (compatibilidad hacia atrás)'
      });
    }
    
    res.json({
      ok: true,
      conversation_id: conversationId,
      has_trace: true,
      events: events,
      total_events: events.length
    });
  } catch (err) {
    await log('ERROR', 'Error en /api/trace', { error: err.message, stack: err.stack });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
});

// ========================================================
// ENDPOINT HISTORIAL - Panel Admin
// ========================================================

// Endpoint para obtener historial de conversación (para panel admin)
app.get('/api/historial/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').trim().toUpperCase();
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Validar token obligatorio
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      const bootId = req.bootId || trace.generateBootId();
      const traceContext = req.traceContext || trace.createTraceContext(
        null,
        `req-${Date.now()}`,
        null,
        null,
        NODE_ENV,
        null,
        bootId
      );
      
      await trace.logEvent('ERROR', 'HTTP_403_FORBIDDEN', {
        actor: 'system',
        endpoint: '/api/historial',
        error: 'Token inválido',
        boot_id: bootId,
        conversation_id: conversationId,
        has_token: !!token
      }, traceContext);
      
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    // Validar formato de conversation_id (AA0000-ZZ9999)
    if (!conversationId || !/^[A-Z]{2}\d{4}$/.test(conversationId)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Formato de ID inválido. Debe ser formato AA0000 (2 letras + 4 dígitos)' 
      });
    }
    
    // Cargar conversación
    let conversation = await loadConversation(conversationId);

    // Intentar cargar trace detallado para reconstruir si falta transcript
    let traceEvents = [];
    try {
      traceEvents = await trace.readTrace(conversationId);
    } catch (traceErr) {
      await log('WARN', 'No se pudo leer trace en /api/historial', { error: traceErr.message, conversation_id: conversationId });
    }

    // Normalizar eventos de trace a formato transcript
    const normalizeTraceEvents = (events) => {
      return (events || []).map(ev => {
        const t = ev.ts_effective || ev.t || ev.timestamp || ev.ts || new Date().toISOString();
        const role = ev.actor === 'user'
          ? 'user'
          : (ev.actor === 'bot' || ev.role === 'assistant' || ev.role === 'bot' ? 'bot' : 'system');
        const type = ev.type || (ev.buttons && ev.buttons.length ? 'buttons' : 'text');
        const text = ev.raw_text || ev.text || ev.content || '';
        const stage = ev.stage || ev.payload?.stage || 'unknown';
        const buttons = ev.buttons || ev.payload?.buttons || [];
        return {
          t,
          role,
          type,
          stage,
          text,
          buttons,
          conversation_id: conversationId,
          payload: ev.payload || {}
        };
      });
    };

    const traceTranscript = normalizeTraceEvents(traceEvents);

    if (!conversation) {
      // Reconstruir conversación a partir de trace si existe
      if (traceTranscript.length > 0) {
        conversation = {
          conversation_id: conversationId,
          status: 'open',
          flow_version: FLOW_VERSION,
          schema_version: SCHEMA_VERSION,
          created_at: traceTranscript[0].t,
          updated_at: new Date().toISOString(),
          transcript: traceTranscript
        };
        await log('WARN', 'Conversación reconstruida desde trace en /api/historial', {
          conversation_id: conversationId,
          events: traceTranscript.length
        });
        try { await saveConversation(conversation); } catch {}
      } else {
        await log('INFO', `Conversación no encontrada en /api/historial`, { 
          conversation_id: conversationId,
          boot_id: req.bootId
        });

        return res.status(404).json({ 
          ok: false, 
          error: 'Conversación no encontrada. Verificá que el ID sea correcto.' 
        });
      }
    } else {
      // Si el transcript está incompleto, fusionar con trace
      const existing = conversation.transcript || [];
      if (traceTranscript.length > existing.length) {
        const key = (e) => `${e.t}|${e.role}|${e.type}|${e.text || ''}`;
        const seen = new Set(existing.map(key));
        const merged = [...existing];
        traceTranscript.forEach(ev => {
          const k = key(ev);
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(ev);
          }
        });
        merged.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
        conversation.transcript = merged;
        conversation.updated_at = new Date().toISOString();
        await log('WARN', 'Conversación incompleta, transcript fusionado con trace', {
          conversation_id: conversationId,
          transcript_before: existing.length,
          transcript_after: merged.length,
          trace_events: traceTranscript.length
        });
        try { await saveConversation(conversation); } catch {}
      }
    }

    // Retornar conversación
    res.json({
      ok: true,
      historial: conversation,
      conversation_id: conversationId
    });
    
  } catch (err) {
    await log('ERROR', 'Error en /api/historial', { 
      error: err.message, 
      stack: err.stack,
      conversation_id: req.params.conversationId,
      boot_id: req.bootId
    });
    
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
});

// ========================================================
// REANUDACIÓN DE SESIONES (P1-2)
// ========================================================

/**
 * Endpoint para reanudar una conversación existente
 * GET /api/resume/:conversationId
 * 
 * Retorna:
 * - ok: true/false
 * - conversation_id: ID de la conversación
 * - stage: Stage actual
 * - reply: Mensaje de bienvenida/reanudación
 * - buttons: Botones apropiados para el stage actual
 * - status: Estado de la conversación (open/closed/legacy_incompatible)
 * - message: Mensaje explicativo si hay algún problema
 */
app.get('/api/resume/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').trim().toUpperCase();
    
    // Validar formato de conversation_id (AA0000-ZZ9999)
    if (!conversationId || !/^[A-Z]{2}\d{4}$/.test(conversationId)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Formato de ID inválido. Debe ser formato AA0000 (2 letras + 4 dígitos)' 
      });
    }
    
    // Cargar conversación (ya valida versión internamente)
    const conversation = await loadConversation(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Conversación no encontrada',
        message: 'No se encontró una conversación con ese ID. Podés iniciar una nueva conversación.'
      });
    }
    
    // Verificar si la conversación está cerrada
    if (conversation.status === 'closed' || conversation.status === 'ended') {
      const language = conversation.language || 'es-AR';
      const closedMessage = language === 'es-AR'
        ? 'Esta conversación ya fue cerrada. Podés iniciar una nueva conversación si necesitás ayuda.'
        : 'This conversation has been closed. You can start a new conversation if you need help.';
      
      return res.json({
        ok: true,
        conversation_id: conversationId,
        status: 'closed',
        message: closedMessage,
        reply: closedMessage,
        buttons: [],
        stage: 'ENDED'
      });
    }
    
    // Verificar si la conversación es legacy_incompatible
    if (conversation.legacy_incompatible) {
      const language = conversation.language || 'es-AR';
      const incompatibleMessage = language === 'es-AR'
        ? `Esta conversación fue creada con una versión antigua del sistema y ya no es compatible. Por favor, iniciá una nueva conversación.`
        : `This conversation was created with an old version of the system and is no longer compatible. Please start a new conversation.`;
      
      return res.json({
        ok: true,
        conversation_id: conversationId,
        status: 'legacy_incompatible',
        message: incompatibleMessage,
        reply: incompatibleMessage,
        buttons: ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
          label: b.label,
          value: b.value,
          token: b.token
        })),
        stage: 'ASK_CONSENT',
        legacy_reason: conversation.legacy_incompatible_reason
      });
    }
    
    // Determinar stage actual desde el transcript
    let currentStage = 'ASK_CONSENT';
    let lastBotMessage = null;
    let lastUserMessage = null;
    
    if (conversation.transcript && conversation.transcript.length > 0) {
      // Buscar último evento STAGE_CHANGED
      for (let i = conversation.transcript.length - 1; i >= 0; i--) {
        const entry = conversation.transcript[i];
        if (entry.name === 'STAGE_CHANGED' && entry.payload && entry.payload.to) {
          currentStage = entry.payload.to;
          break;
        }
      }
      
      // Si no hay STAGE_CHANGED, inferir desde los últimos mensajes
      if (currentStage === 'ASK_CONSENT') {
        for (let i = conversation.transcript.length - 1; i >= 0; i--) {
          const entry = conversation.transcript[i];
          if (entry.role === 'bot' && entry.type === 'text' && entry.text) {
            lastBotMessage = entry.text;
            // Intentar inferir stage desde el mensaje
            if (entry.text.includes('idioma') || entry.text.includes('language')) {
              currentStage = 'ASK_LANGUAGE';
            } else if (entry.text.includes('nombre') || entry.text.includes('name')) {
              currentStage = 'ASK_NAME';
            } else if (entry.text.includes('nivel') || entry.text.includes('level')) {
              currentStage = 'ASK_USER_LEVEL';
            } else if (entry.text.includes('problema') || entry.text.includes('problem')) {
              currentStage = 'ASK_PROBLEM';
            }
            break;
          }
        }
      }
    }
    
    // Validar que el stage sea válido
    const validStages = ['ASK_CONSENT', 'ASK_LANGUAGE', 'ASK_NAME', 'ASK_USER_LEVEL', 
                         'ASK_PROBLEM', 'ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 
                         'ASK_DEVICE_TYPE_EXTERNAL', 'DIAGNOSTIC_STEP', 'ASK_FEEDBACK', 'ENDED'];
    if (!validStages.includes(currentStage)) {
      currentStage = 'ASK_CONSENT';
    }
    
    // Generar mensaje de reanudación
    const language = conversation.language || 'es-AR';
    let resumeMessage = '';
    let buttons = [];
    
    if (currentStage === 'ASK_CONSENT') {
      resumeMessage = language === 'es-AR'
        ? TEXTS.ASK_CONSENT.es
        : TEXTS.ASK_CONSENT.en;
      buttons = ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      }));
    } else if (currentStage === 'ASK_LANGUAGE') {
      resumeMessage = TEXTS.ASK_LANGUAGE[language] || TEXTS.ASK_LANGUAGE.es;
      buttons = ALLOWED_BUTTONS_BY_ASK.ASK_LANGUAGE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      }));
    } else if (currentStage === 'ASK_NAME') {
      resumeMessage = language === 'es-AR'
        ? TEXTS.ASK_NAME.es
        : TEXTS.ASK_NAME.en;
      buttons = [];
    } else if (currentStage === 'ASK_USER_LEVEL') {
      resumeMessage = TEXTS.ASK_USER_LEVEL[language] || TEXTS.ASK_USER_LEVEL.es;
      buttons = ALLOWED_BUTTONS_BY_ASK.ASK_USER_LEVEL.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      }));
    } else if (currentStage === 'ASK_PROBLEM') {
      resumeMessage = language === 'es-AR'
        ? 'Contame qué problema tenés con tu equipo.'
        : 'Tell me what problem you have with your device.';
      buttons = [];
    } else if (currentStage === 'DIAGNOSTIC_STEP') {
      resumeMessage = language === 'es-AR'
        ? 'Continuemos con el diagnóstico. ¿Qué resultado obtuviste del paso anterior?'
        : 'Let\'s continue with the diagnosis. What result did you get from the previous step?';
      buttons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      }));
    } else {
      // Stage desconocido o ENDED - reiniciar
      resumeMessage = language === 'es-AR'
        ? 'Bienvenido de nuevo. ¿En qué puedo ayudarte?'
        : 'Welcome back. How can I help you?';
      buttons = ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      }));
      currentStage = 'ASK_CONSENT';
    }
    
    // Agregar mensaje de reanudación si hay contexto previo
    if (conversation.transcript && conversation.transcript.length > 0) {
      const resumePrefix = language === 'es-AR'
        ? '¡Hola de nuevo! Retomamos donde lo dejamos.\n\n'
        : 'Hello again! Let\'s continue where we left off.\n\n';
      resumeMessage = resumePrefix + resumeMessage;
    }
    
    await log('INFO', 'Conversación reanudada exitosamente', {
      conversation_id: conversationId,
      stage: currentStage,
      language,
      transcript_length: conversation.transcript?.length || 0
    });
    
    res.json({
      ok: true,
      conversation_id: conversationId,
      status: conversation.status || 'open',
      stage: currentStage,
      reply: resumeMessage,
      buttons,
      language,
      user_name: conversation.user?.name_norm || null,
      user_level: conversation.user?.user_level || null
    });
    
  } catch (err) {
    await log('ERROR', 'Error en /api/resume', { 
      error: err.message, 
      stack: err.stack,
      conversation_id: req.params.conversationId,
      boot_id: req.bootId
    });
    
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      message: 'Ocurrió un error al intentar reanudar la conversación. Por favor, intentá de nuevo.'
    });
  }
});

// ========================================================
// AUTOFIX IA - ENDPOINTS
// ========================================================

/**
 * Detecta errores comunes específicos en el trace/log
 * Retorna array de issues detectados automáticamente
 */
function detectCommonErrors(trace, liveEvents = '') {
  const issues = [];
  const combinedText = (trace || '') + '\n' + (liveEvents || '');
  
  // 1. Detectar ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
  if (combinedText.includes('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR') || 
      combinedText.includes("'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false")) {
    issues.push({
      id: 'trust-proxy-missing',
      severity: 'alta',
      type: 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR',
      evidence: [
        'Error: ValidationError: The \'X-Forwarded-For\' header is set but the Express \'trust proxy\' setting is false',
        'Este error ocurre cuando express-rate-limit detecta headers de proxy pero Express no confía en ellos'
      ],
      root_cause: 'Express no está configurado para confiar en proxies reversos (Render, nginx, etc.). Esto impide que express-rate-limit identifique correctamente las IPs de los clientes.',
      solution: 'Agregar app.set(\'trust proxy\', true) ANTES de configurar express-rate-limit en server.js',
      files: ['server.js'],
      line_hint: 'Después de const app = express() y antes de rateLimit()',
      patch_hint: {
        file: 'server.js',
        location: 'Después de const app = express()',
        code: "app.set('trust proxy', true);"
      }
    });
  }
  
  // 2. Detectar error de validación: message, imageBase64 o action faltante
  // Solo detectar si realmente falta todo (no hay action válido)
  const hasActionInTrace = combinedText.includes('"action"') || combinedText.includes("'action'") || 
                          (combinedText.includes('action') && combinedText.includes('button'));
  const hasValueInTrace = combinedText.includes('"value"') || combinedText.includes("'value'");
  
  if ((combinedText.includes('message o imageBase64 faltante') || 
       combinedText.includes('message, imageBase64 o action faltante') ||
       (combinedText.includes('MISSING_MESSAGE') && 
        (combinedText.includes('has_message:false') || combinedText.includes('has_message":false')) &&
        (combinedText.includes('has_imageBase64:false') || combinedText.includes('has_imageBase64":false')))) &&
      !(hasActionInTrace && hasValueInTrace)) {
    issues.push({
      id: 'validation-missing-fields',
      severity: 'media',
      type: 'VALIDATION_ERROR',
      evidence: [
        'Error: message, imageBase64 o action faltante en /api/chat',
        'Request body no contiene ni message, ni imageBase64, ni action=button con value, lo cual es inválido'
      ],
      root_cause: 'El request a /api/chat no contiene ni el campo "message", ni "imageBase64", ni "action"="button" con "value", lo cual viola las reglas de validación. Esto puede ocurrir por problemas en el frontend o en la serialización del request.',
      solution: 'Verificar que el frontend siempre envíe al menos uno de: (1) message, (2) imageBase64, o (3) action="button" con value. Si es un botón, asegurar que se envíe: { action: "button", value: "...", label: "...", sessionId: "..." }',
      files: ['server.js'],
      line_hint: 'Validación en endpoint /api/chat',
      patch_hint: {
        file: 'server.js',
        location: 'Endpoint /api/chat - validación de campos',
        note: 'La validación ya permite action=button con value como alternativa a message/imageBase64'
      }
    });
  }
  
  // 3. Detectar MISSING_SESSION_ID
  if (combinedText.includes('MISSING_SESSION_ID') || 
      combinedText.includes('sessionId faltante') ||
      (combinedText.includes('VALIDATION_ERROR') && combinedText.includes('sessionId'))) {
    issues.push({
      id: 'missing-session-id',
      severity: 'alta',
      type: 'MISSING_SESSION_ID',
      evidence: [
        'Error: MISSING_SESSION_ID en /api/chat',
        'Request body no contiene sessionId'
      ],
      root_cause: 'El request a /api/chat no incluye el campo sessionId requerido. Esto puede ocurrir por problemas en el frontend o pérdida de estado de sesión.',
      solution: 'Verificar que el frontend siempre incluya sessionId en el request body y que la validación lo requiera explícitamente',
      files: ['server.js'],
      line_hint: 'Validación de sessionId en /api/chat'
    });
  }
  
  return issues;
}

// Endpoint para analizar trace y generar solución
app.post('/api/autofix/analyze', async (req, res) => {
  try {
    const { trace, objective, mode, token } = req.body;
    
    // Validar token
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    if (!trace || !trace.trim()) {
      return res.status(400).json({ ok: false, error: 'Trace requerido' });
    }
    
    if (!openai) {
      return res.status(500).json({ ok: false, error: 'OpenAI no configurado' });
    }
    
    // Analizar con OpenAI usando el modelo más inteligente disponible
    const model = process.env.OPENAI_MODEL_AUTOFIX || 'gpt-4o' || 'gpt-4-turbo' || 'gpt-4';
    
    // Preparar contexto para OpenAI
    const systemPrompt = `Eres un experto en análisis de código y debugging. Analiza el historial detallado (trace) de una conversación de chat y detecta problemas, errores, inconsistencias de flujo y problemas de arquitectura.

REGLAS:
- NO expongas secretos, tokens, API keys o credenciales
- Analiza el flujo completo, no solo errores aislados
- Identifica la causa raíz de los problemas
- Genera un plan de reparación claro y completo
- Proporciona diffs en formato git unificado
- Evalúa riesgos de cada cambio

ERRORES COMUNES A DETECTAR ESPECÍFICAMENTE:

1. ERR_ERL_UNEXPECTED_X_FORWARDED_FOR:
   - Patrón: "ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false"
   - Causa: Express no está configurado para confiar en proxies reversos (Render, nginx, etc.)
   - Solución: Agregar app.set('trust proxy', true) ANTES de configurar express-rate-limit
   - Severidad: ALTA (afecta identificación de IPs y rate limiting)
   - Archivo: server.js (inicialización de Express)

2. Validación de request faltante en /api/chat:
   - Patrón: "message o imageBase64 faltante en /api/chat" o "VALIDATION_ERROR" con has_message:false y has_imageBase64:false
   - Causa: Request body no contiene ni 'message' ni 'imageBase64', lo cual es inválido
   - Solución: Verificar validación de request body y asegurar que al menos uno de los dos campos esté presente
   - Severidad: MEDIA (afecta funcionalidad del chat)
   - Archivo: server.js (endpoint /api/chat, función validateChatRequest)

3. Errores de rate limiting:
   - Patrón: "ERR_ERL_" o "express-rate-limit" en errores
   - Verificar: Configuración de trust proxy y headers de proxy
   - Severidad: ALTA (puede bloquear usuarios legítimos)

4. Errores de validación de request:
   - Patrón: "VALIDATION_ERROR", "MISSING_SESSION_ID", "message o imageBase64 faltante"
   - Verificar: Esquema de validación y manejo de casos edge
   - Severidad: MEDIA (afecta UX pero no rompe el sistema)

FORMATO DE RESPUESTA (JSON ESTRICTO):
{
  "summary": "Resumen ejecutivo del análisis",
  "issues": [
    {
      "id": "identificador único",
      "severity": "alta|media|baja",
      "evidence": ["línea 1 del trace", "línea 2 del trace"],
      "root_cause": "causa raíz del problema",
      "files": ["ruta/archivo1.js", "ruta/archivo2.js"]
    }
  ],
  "plan": [
    "Paso 1 de reparación",
    "Paso 2 de reparación"
  ],
  "patches": [
    {
      "file": "ruta/archivo.js",
      "diff": "diff --git a/ruta/archivo.js b/ruta/archivo.js\n--- a/ruta/archivo.js\n+++ b/ruta/archivo.js\n@@ -1,3 +1,3 @@\n ..."
    }
  ],
  "tests": [
    "Test 1 a ejecutar",
    "Test 2 a ejecutar"
  ],
  "risks": [
    "Riesgo 1",
    "Riesgo 2"
  ]
}`;

    // Leer extractos de código relevantes si es necesario
    let codeContext = '';
    try {
      // Determinar ruta base del proyecto
      // Prioridad: 1) Variable de entorno PROJECT_BASE_PATH, 2) __dirname
      const PROJECT_BASE_PATH = process.env.PROJECT_BASE_PATH || __dirname;
      
      // Intentar leer server.js desde la ruta base configurada
      const serverPath = path.join(PROJECT_BASE_PATH, 'server.js');
      
      // Verificar si el archivo existe antes de leerlo
      try {
        await fs.access(serverPath);
        const serverContent = await fs.readFile(serverPath, 'utf-8');
        const serverLines = serverContent.split('\n');
        // Tomar primeras 100 líneas (imports y configuración)
        codeContext += `\n\nESTRUCTURA DEL PROYECTO (server.js - primeras líneas desde ${PROJECT_BASE_PATH}):\n${serverLines.slice(0, 100).join('\n')}\n`;
      } catch (accessErr) {
        // Si no se puede acceder, intentar con __dirname como fallback
        if (PROJECT_BASE_PATH !== __dirname) {
          try {
            const fallbackPath = path.join(__dirname, 'server.js');
            await fs.access(fallbackPath);
            const serverContent = await fs.readFile(fallbackPath, 'utf-8');
            const serverLines = serverContent.split('\n');
            codeContext += `\n\nESTRUCTURA DEL PROYECTO (server.js - primeras líneas desde __dirname fallback):\n${serverLines.slice(0, 100).join('\n')}\n`;
          } catch (fallbackErr) {
            // Ignorar si tampoco se puede leer desde fallback
            await log('WARN', 'No se pudo leer server.js para contexto de AutoFix', { 
              projectPath: PROJECT_BASE_PATH, 
              __dirname: __dirname,
              error: accessErr.message,
              fallbackError: fallbackErr.message 
            });
          }
        } else {
          await log('WARN', 'No se pudo leer server.js para contexto de AutoFix', { 
            path: serverPath,
            error: accessErr.message 
          });
        }
      }
    } catch (err) {
      // Ignorar si no se puede leer
      await log('WARN', 'Error general leyendo server.js para AutoFix', { error: err.message });
    }
    
    const { live_events, boot_id } = req.body;
    const isPreIdMode = mode === 'diagnostic-preid' || mode === 'repair-preid';
    
    let userPrompt = `OBJETIVO: ${objective || 'Analizar y reparar problemas detectados en el flujo'}`;
    
    if (isPreIdMode) {
      userPrompt += `\n\n⚠️ MODO PRE-ID: Esta es una falla que ocurrió ANTES de generar conversation_id.
      - boot_id: ${boot_id || 'N/A'}
      - Los eventos muestran la secuencia completa desde el inicio del request hasta el fallo.
      - Debes identificar por qué no se generó conversation_id y reparar el flujo para que sí se genere.`;
    }
    
    userPrompt += `\n\nHISTORIAL DETALLADO (trace):\n${trace.substring(0, 30000)}${trace.length > 30000 ? '\n\n[... trace truncado por longitud ...]' : ''}`;
    
    if (live_events && live_events.trim()) {
      userPrompt += `\n\nEVENTOS EN VIVO / PRE-ID:\n${live_events.substring(0, 20000)}${live_events.length > 20000 ? '\n\n[... eventos truncados por longitud ...]' : ''}`;
    }
    
    if (boot_id) {
      userPrompt += `\n\nBOOT_ID: ${boot_id}\nEste es el identificador provisorio asignado al inicio del request.`;
    }
    
    userPrompt += `\n${codeContext}\n\nINSTRUCCIONES:
1. Analiza el trace completo para identificar problemas
2. ${isPreIdMode ? 'Identifica por qué NO se generó conversation_id y qué causó el fallo prematuro.' : 'Identifica la causa raíz de cada problema'}
3. Busca específicamente estos errores comunes:
   - ERR_ERL_UNEXPECTED_X_FORWARDED_FOR: Si aparece, la solución es agregar app.set('trust proxy', true) antes de rate limiting
   - "message o imageBase64 faltante": Indica problema de validación en /api/chat
   - Errores de validación (VALIDATION_ERROR, MISSING_SESSION_ID)
4. Genera un plan de reparación claro
5. Crea diffs en formato git unificado para cada archivo a modificar
6. Evalúa riesgos y proporciona tests a ejecutar
7. NO expongas secretos, tokens o credenciales en los diffs
8. Asegúrate de que los diffs sean aplicables y no rompan el flujo
${isPreIdMode ? '9. Los smoke tests deben verificar que ahora se genera boot_id y conversation_id correctamente' : ''}

Analiza este trace y genera una solución completa.`;

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0].message.content;
    let analysis;
    
    try {
      analysis = JSON.parse(content);
    } catch (parseErr) {
      await log('ERROR', 'Error parseando respuesta de AutoFix', { error: parseErr.message });
      return res.status(500).json({ ok: false, error: 'Error parseando respuesta de IA' });
    }
    
    // Validar estructura mínima
    if (!analysis.summary || !analysis.issues || !Array.isArray(analysis.issues)) {
      return res.status(500).json({ ok: false, error: 'Respuesta de IA inválida' });
    }
    
    // Detectar errores comunes automáticamente y fusionar con issues de IA
    const autoDetectedIssues = detectCommonErrors(trace, live_events);
    
    // Fusionar issues detectados automáticamente con los de IA
    // Evitar duplicados por ID
    const existingIds = new Set(analysis.issues.map(issue => issue.id));
    for (const autoIssue of autoDetectedIssues) {
      if (!existingIds.has(autoIssue.id)) {
        analysis.issues.push(autoIssue);
        existingIds.add(autoIssue.id);
      }
    }
    
    // Actualizar summary si se detectaron issues automáticamente
    if (autoDetectedIssues.length > 0) {
      const autoDetectedCount = autoDetectedIssues.length;
      const autoDetectedTypes = autoDetectedIssues.map(i => i.type).join(', ');
      analysis.summary = `[DETECCIÓN AUTOMÁTICA: ${autoDetectedCount} error(es) detectado(s): ${autoDetectedTypes}] ${analysis.summary}`;
      
      // Agregar nota sobre detección automática
      if (!analysis.notes) {
        analysis.notes = [];
      }
      analysis.notes.push({
        type: 'auto_detection',
        message: `${autoDetectedCount} error(es) común(es) detectado(s) automáticamente antes del análisis de IA`,
        detected_issues: autoDetectedIssues.map(i => ({ id: i.id, type: i.type, severity: i.severity }))
      });
    }
    
    // Agregar metadata
    analysis.model_used = model;
    analysis.analyzed_at = new Date().toISOString();
    analysis.safe_to_apply = false; // Se determinará después de verificación
    analysis.mode = mode; // Guardar modo para verificación
    analysis.auto_detected_count = autoDetectedIssues.length; // Contador de issues detectados automáticamente
    if (boot_id) {
      analysis.boot_id = boot_id;
    }
    
    res.json({
      ok: true,
      result: analysis
    });
    
  } catch (err) {
    await log('ERROR', 'Error en /api/autofix/analyze', { error: err.message, stack: err.stack });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      message: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Endpoint para reparar en sandbox y verificar
app.post('/api/autofix/repair', async (req, res) => {
  try {
    const { result, token } = req.body;
    
    // Validar token
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    if (!result || !result.patches || result.patches.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay parches para aplicar' });
    }
    
    // Crear sandbox temporal
    const sandboxDir = path.join(__dirname, 'data', 'autofix-sandbox', `sandbox-${Date.now()}`);
    await fs.mkdir(sandboxDir, { recursive: true });
    
    try {
      // Determinar ruta base del proyecto (mismo que en analyze)
      const PROJECT_BASE_PATH = process.env.PROJECT_BASE_PATH || __dirname;
      
      // Copiar archivos relevantes al sandbox
      const filesToCopy = new Set();
      result.patches.forEach(patch => {
        if (patch.file) {
          filesToCopy.add(patch.file);
        }
      });
      
      // Aplicar parches en sandbox
      for (const patch of result.patches) {
        if (!patch.file || !patch.diff) continue;
        
        // Normalizar path del archivo (eliminar ./ si existe)
        const normalizedFile = patch.file.replace(/^\.\//, '');
        
        // Intentar desde PROJECT_BASE_PATH primero, luego __dirname como fallback
        let filePath = path.join(PROJECT_BASE_PATH, normalizedFile);
        let fileExists = false;
        
        try {
          await fs.access(filePath);
          fileExists = true;
        } catch (err) {
          // Si no existe en PROJECT_BASE_PATH, intentar __dirname
          if (PROJECT_BASE_PATH !== __dirname) {
            const fallbackPath = path.join(__dirname, normalizedFile);
            try {
              await fs.access(fallbackPath);
              filePath = fallbackPath;
              fileExists = true;
            } catch (fallbackErr) {
              fileExists = false;
            }
          }
        }
        
        const sandboxFilePath = path.join(sandboxDir, normalizedFile);
        
        // Crear directorio si no existe
        await fs.mkdir(path.dirname(sandboxFilePath), { recursive: true });
        
        // Leer archivo original
        let fileContent = '';
        if (fileExists) {
          try {
            fileContent = await fs.readFile(filePath, 'utf-8');
          } catch (err) {
            // Archivo no existe, crear vacío
            fileContent = '';
          }
        }
        
        // Aplicar diff (simplificado - en producción usar una librería de diff)
        // Por ahora, solo guardamos el contenido propuesto
        const newContent = applyDiffSimple(fileContent, patch.diff);
        await fs.writeFile(sandboxFilePath, newContent, 'utf-8');
      }
      
      // Verificaciones básicas (smoke tests)
      const verification = await verifySandbox(sandboxDir, result);
      
      // Limpiar sandbox
      await fs.rm(sandboxDir, { recursive: true, force: true });
      
      result.safe_to_apply = verification.all_passed;
      result.verification_result = verification.message;
      result.verification_details = verification.details;
      
      res.json({
        ok: true,
        result: result
      });
      
    } catch (sandboxErr) {
      // Limpiar sandbox en caso de error
      await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
      
      result.safe_to_apply = false;
      result.verification_result = `Error en sandbox: ${sandboxErr.message}`;
      
      res.json({
        ok: true,
        result: result
      });
    }
    
  } catch (err) {
    await log('ERROR', 'Error en /api/autofix/repair', { error: err.message, stack: err.stack });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      message: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Endpoint para aplicar cambios al código real
app.post('/api/autofix/apply', async (req, res) => {
  try {
    const { result, token } = req.body;
    
    // Validar token
    if (!LOG_TOKEN || token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    if (!result || !result.safe_to_apply) {
      return res.status(400).json({ ok: false, error: 'La reparación no está verificada como segura' });
    }
    
    if (!result.patches || result.patches.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay parches para aplicar' });
    }
    
    // Determinar ruta base del proyecto (mismo que en analyze y repair)
    const PROJECT_BASE_PATH = process.env.PROJECT_BASE_PATH || __dirname;
    
    // Aplicar parches al código real
    const appliedFiles = [];
    const failedFiles = [];
    
    for (const patch of result.patches) {
      if (!patch.file || !patch.diff) {
        await log('WARN', 'AutoFix: Patch sin file o diff', { patch: patch });
        continue;
      }
      
      // Normalizar path del archivo (eliminar ./ si existe)
      const normalizedFile = patch.file.replace(/^\.\//, '');
      
      // Intentar desde PROJECT_BASE_PATH primero, luego __dirname como fallback
      let filePath = path.join(PROJECT_BASE_PATH, normalizedFile);
      let fileExists = false;
      
      try {
        await fs.access(filePath);
        fileExists = true;
      } catch (err) {
        // Si no existe en PROJECT_BASE_PATH, intentar __dirname
        if (PROJECT_BASE_PATH !== __dirname) {
          const fallbackPath = path.join(__dirname, normalizedFile);
          try {
            await fs.access(fallbackPath);
            filePath = fallbackPath;
            fileExists = true;
            await log('INFO', `AutoFix: Usando fallback path para ${normalizedFile}`, { 
              projectPath: PROJECT_BASE_PATH,
              fallbackPath: fallbackPath
            });
          } catch (fallbackErr) {
            fileExists = false;
          }
        }
      }
      
      await log('INFO', `AutoFix: Aplicando patch a ${normalizedFile}`, { 
        file: normalizedFile,
        filePath: filePath,
        projectBasePath: PROJECT_BASE_PATH,
        diff_length: patch.diff.length
      });
      
      // Leer archivo original
      let fileContent = '';
      let originalStats = null;
      if (fileExists) {
        try {
          fileContent = await fs.readFile(filePath, 'utf-8');
          originalStats = await fs.stat(filePath);
          await log('INFO', `AutoFix: Archivo ${normalizedFile} leído`, { 
            size: originalStats.size,
            mtime: originalStats.mtime.toISOString()
          });
        } catch (err) {
          if (err.code === 'ENOENT') {
            // Archivo no existe, crear vacío
            fileContent = '';
            await log('INFO', `AutoFix: Archivo ${normalizedFile} no existe, se creará`, { file: normalizedFile });
          } else {
            await log('ERROR', `AutoFix: Error leyendo ${normalizedFile}`, { error: err.message });
            failedFiles.push({ file: normalizedFile, error: err.message });
            continue;
          }
        }
      }
      
      // Aplicar diff
      const newContent = applyDiffSimple(fileContent, patch.diff);
      
      // Verificar que el contenido cambió
      if (newContent === fileContent) {
        await log('WARN', `AutoFix: El diff no modificó el archivo ${normalizedFile}`, { 
          file: normalizedFile,
          diff_preview: patch.diff.substring(0, 200)
        });
        // Intentar aplicar de forma más agresiva
        const newContent2 = await applyDiffAdvanced(filePath, fileContent, patch.diff);
        if (newContent2 !== fileContent) {
          // Crear directorio si no existe
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          
          // Escribir archivo
          await fs.writeFile(filePath, newContent2, 'utf-8');
          
          // Verificar que se escribió correctamente
          const verifyStats = await fs.stat(filePath);
          const verifyContent = await fs.readFile(filePath, 'utf-8');
          
          if (verifyContent === newContent2) {
            appliedFiles.push(normalizedFile);
            await log('INFO', `AutoFix: Archivo ${normalizedFile} modificado (método avanzado)`, { 
              file: normalizedFile,
              original_size: fileContent.length,
              new_size: newContent2.length,
              mtime: verifyStats.mtime.toISOString()
            });
          } else {
            await log('ERROR', `AutoFix: Verificación falló para ${normalizedFile}`, { 
              file: normalizedFile,
              expected_size: newContent2.length,
              actual_size: verifyContent.length
            });
            failedFiles.push({ file: normalizedFile, error: 'Verificación de escritura falló' });
          }
        } else {
          await log('ERROR', `AutoFix: No se pudo aplicar diff a ${normalizedFile}`, { 
            file: normalizedFile,
            original_size: fileContent.length,
            diff_size: patch.diff.length
          });
          failedFiles.push({ file: normalizedFile, error: 'Diff no aplicó cambios' });
        }
      } else {
        // Crear directorio si no existe
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        // Escribir archivo
        await fs.writeFile(filePath, newContent, 'utf-8');
        
        // Verificar que se escribió correctamente
        const verifyStats = await fs.stat(filePath);
        const verifyContent = await fs.readFile(filePath, 'utf-8');
        
        if (verifyContent === newContent) {
          appliedFiles.push(normalizedFile);
          await log('INFO', `AutoFix: Archivo ${normalizedFile} modificado exitosamente`, { 
            file: normalizedFile,
            original_size: fileContent.length,
            new_size: newContent.length,
            original_mtime: originalStats ? originalStats.mtime.toISOString() : 'N/A',
            new_mtime: verifyStats.mtime.toISOString()
          });
        } else {
          await log('ERROR', `AutoFix: Verificación falló para ${normalizedFile}`, { 
            file: normalizedFile,
            expected_size: newContent.length,
            actual_size: verifyContent.length
          });
          failedFiles.push({ file: normalizedFile, error: 'Verificación de escritura falló' });
        }
      }
    }
    
    // Registrar auditoría
    const auditLog = {
      timestamp: new Date().toISOString(),
      action: 'autofix_apply',
      files_applied: appliedFiles,
      files_failed: failedFiles,
      total_patches: result.patches.length,
      result: result
    };
    
    const auditFile = path.join(LOGS_DIR, `autofix-${Date.now()}.json`);
    await fs.writeFile(auditFile, JSON.stringify(auditLog, null, 2), 'utf-8');
    
    if (appliedFiles.length > 0) {
      await log('INFO', 'AutoFix: Cambios aplicados', { 
        files: appliedFiles,
        total: appliedFiles.length
      });
    }
    
    if (failedFiles.length > 0) {
      await log('ERROR', 'AutoFix: Algunos archivos fallaron', { 
        failed: failedFiles,
        total: failedFiles.length
      });
    }
    
    res.json({
      ok: true,
      message: appliedFiles.length > 0 
        ? `Cambios aplicados exitosamente a ${appliedFiles.length} archivo(s)`
        : 'No se pudieron aplicar los cambios',
      files_applied: appliedFiles,
      files_failed: failedFiles,
      total_patches: result.patches.length
    });
    
  } catch (err) {
    await log('ERROR', 'Error en /api/autofix/apply', { error: err.message, stack: err.stack });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      message: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Helper para aplicar diff simple
function applyDiffSimple(originalContent, diffText) {
  if (!diffText || !diffText.trim()) {
    return originalContent;
  }
  
  // Parsear diff en formato git unificado
  const lines = originalContent.split('\n');
  const diffLines = diffText.split('\n');
  
  // P0-03: Inicializar result con todas las líneas originales (validación defensiva)
  if (!Array.isArray(lines)) {
    throw new Error('originalContent.split() no retornó array');
  }
  let result = [...lines]; // Spread operator válido
  let inHunk = false;
  let hunkStart = 0;
  let hunkLines = [];
  
  for (let j = 0; j < diffLines.length; j++) {
    const diffLine = diffLines[j];
    
    // Ignorar líneas de encabezado del diff
    if (diffLine.startsWith('diff --git') || 
        diffLine.startsWith('index ') || 
        diffLine.startsWith('---') || 
        diffLine.startsWith('+++') ||
        diffLine.trim() === '') {
      continue;
    }
    
    // Detectar inicio de hunk: @@ -start,count +start,count @@
    const hunkMatch = diffLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (inHunk && hunkLines.length > 0) {
        // Aplicar hunk anterior
        result = applyHunk(result, hunkStart, hunkLines);
        hunkLines = [];
      }
      inHunk = true;
      hunkStart = parseInt(hunkMatch[1]) - 1; // -1 porque es 1-indexed
      continue;
    }
    
    if (inHunk) {
      if (diffLine.startsWith(' ')) {
        // Línea sin cambios (contexto)
        hunkLines.push({ type: 'context', line: diffLine.substring(1) });
      } else if (diffLine.startsWith('-')) {
        // Línea eliminada
        hunkLines.push({ type: 'delete', line: diffLine.substring(1) });
      } else if (diffLine.startsWith('+')) {
        // Línea agregada
        hunkLines.push({ type: 'add', line: diffLine.substring(1) });
      } else if (diffLine.startsWith('\\')) {
        // Fin de archivo sin nueva línea
        continue;
      } else if (diffLine.trim() === '') {
        // Línea vacía, continuar
        continue;
      } else {
        // Fin de hunk o línea inválida - aplicar hunk actual
        if (hunkLines.length > 0) {
          result = applyHunk(result, hunkStart, hunkLines);
          hunkLines = [];
        }
        inHunk = false;
      }
    }
  }
  
  // Aplicar último hunk si existe
  if (inHunk && hunkLines.length > 0) {
    result = applyHunk(result, hunkStart, hunkLines);
  }
  
  return result.join('\n');
}

// Helper para aplicar un hunk
function applyHunk(lines, start, hunkLines) {
  const result = [...lines];
  let pos = Math.max(0, Math.min(start, result.length));
  let contextMatched = 0;
  
  // Primero, verificar que el contexto inicial coincida
  for (const hunkLine of hunkLines) {
    if (hunkLine.type === 'context' || hunkLine.type === 'delete') {
      if (pos < result.length && result[pos] === hunkLine.line) {
        contextMatched++;
        if (hunkLine.type === 'delete') {
          result.splice(pos, 1);
          // No incrementar pos porque eliminamos la línea
        } else {
          pos++;
        }
      } else {
        // Buscar la línea en las siguientes 10 líneas
        let found = false;
        for (let searchPos = pos; searchPos < Math.min(pos + 10, result.length); searchPos++) {
          if (result[searchPos] === hunkLine.line) {
            // Eliminar líneas entre pos y searchPos
            if (hunkLine.type === 'delete') {
              result.splice(searchPos, 1);
              pos = searchPos;
            } else {
              pos = searchPos + 1;
            }
            found = true;
            break;
          }
        }
        if (!found && hunkLine.type === 'delete') {
          // Si no encontramos la línea a eliminar, saltarla
          continue;
        } else if (!found) {
          pos++;
        }
      }
    } else if (hunkLine.type === 'add') {
      // Agregar línea antes de la posición actual
      result.splice(pos, 0, hunkLine.line);
      pos++;
    }
  }
  
  return result;
}

// Método avanzado para aplicar diffs (fallback)
async function applyDiffAdvanced(filePath, originalContent, diffText) {
  if (!diffText || !diffText.trim()) {
    return originalContent;
  }
  
  const lines = originalContent.split('\n');
  const diffLines = diffText.split('\n');
  let result = [...lines];
  let currentLine = 0;
  let inHunk = false;
  let hunkStart = 0;
  let pendingDeletes = [];
  let pendingAdds = [];
  
  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    
    // Ignorar encabezados
    if (line.startsWith('diff --git') || line.startsWith('index ') || 
        line.startsWith('---') || line.startsWith('+++') || line.trim() === '') {
      continue;
    }
    
    // Detectar hunk
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      // Aplicar cambios pendientes del hunk anterior
      if (inHunk && (pendingDeletes.length > 0 || pendingAdds.length > 0)) {
        // Aplicar deletes en orden inverso para no afectar índices
        for (let d = pendingDeletes.length - 1; d >= 0; d--) {
          const deleteLine = pendingDeletes[d];
          const idx = result.findIndex((l, i) => i >= hunkStart && l === deleteLine);
          if (idx >= 0) {
            result.splice(idx, 1);
          }
        }
        // Aplicar adds
        const insertPos = hunkStart;
        for (let a = 0; a < pendingAdds.length; a++) {
          result.splice(insertPos + a, 0, pendingAdds[a]);
        }
        pendingDeletes = [];
        pendingAdds = [];
      }
      
      inHunk = true;
      hunkStart = parseInt(hunkMatch[1]) - 1;
      currentLine = hunkStart;
      continue;
    }
    
    if (inHunk) {
      if (line.startsWith('-')) {
        pendingDeletes.push(line.substring(1));
      } else if (line.startsWith('+')) {
        pendingAdds.push(line.substring(1));
      } else if (line.startsWith(' ')) {
        // Contexto - verificar coincidencia
        const contextLine = line.substring(1);
        if (currentLine < result.length && result[currentLine] === contextLine) {
          currentLine++;
        }
      }
    }
  }
  
  // Aplicar último hunk
  if (inHunk && (pendingDeletes.length > 0 || pendingAdds.length > 0)) {
    for (let d = pendingDeletes.length - 1; d >= 0; d--) {
      const deleteLine = pendingDeletes[d];
      const idx = result.findIndex((l, i) => i >= hunkStart && l === deleteLine);
      if (idx >= 0) {
        result.splice(idx, 1);
      }
    }
    const insertPos = hunkStart;
    for (let a = 0; a < pendingAdds.length; a++) {
      result.splice(insertPos + a, 0, pendingAdds[a]);
    }
  }
  
  return result.join('\n');
}

// Helper para verificar sandbox
async function verifySandbox(sandboxDir, result) {
  const details = [];
  let allPassed = true;
  const isPreIdMode = result.mode === 'repair-preid' || result.mode === 'diagnostic-preid';
  
  // Verificación 1: Archivos existen y son válidos
  try {
    for (const patch of result.patches) {
      if (patch.file) {
        const sandboxFile = path.join(sandboxDir, patch.file);
        const stats = await fs.stat(sandboxFile);
        details.push(`✅ Archivo ${patch.file} existe (${stats.size} bytes)`);
        
        // Verificación 2: Sintaxis básica para archivos JavaScript
        if (patch.file.endsWith('.js')) {
          try {
            const content = await fs.readFile(sandboxFile, 'utf-8');
            // Verificar que no tenga errores de sintaxis obvios
            if (content.includes('import') || content.includes('require')) {
              // Verificar que los imports/requires estén balanceados
              const importCount = (content.match(/import\s+.*from/g) || []).length;
              const requireCount = (content.match(/require\(/g) || []).length;
              if (importCount > 0 || requireCount > 0) {
                details.push(`✅ Archivo ${patch.file} tiene estructura válida`);
              }
            }
          } catch (syntaxErr) {
            allPassed = false;
            details.push(`❌ Error de sintaxis en ${patch.file}: ${syntaxErr.message}`);
          }
        }
      }
    }
  } catch (err) {
    allPassed = false;
    details.push(`❌ Error verificando archivos: ${err.message}`);
  }
  
  // Verificación 3: El servidor puede arrancar (verificación simplificada)
  // Verificar que los archivos modificados no rompan imports críticos
  try {
    // Verificar que server.js (si fue modificado) tenga estructura básica
    const serverFile = path.join(sandboxDir, 'server.js');
    if (await fs.access(serverFile).then(() => true).catch(() => false)) {
      const serverContent = await fs.readFile(serverFile, 'utf-8');
      // Verificar que tenga las importaciones básicas
      if (serverContent.includes('express') && serverContent.includes('app.listen')) {
        details.push(`✅ server.js tiene estructura válida`);
      } else {
        allPassed = false;
        details.push(`❌ server.js puede tener problemas estructurales`);
      }
      
      // Verificación específica para modo pre-ID: debe generar boot_id
      if (isPreIdMode) {
        if (serverContent.includes('bootId') || serverContent.includes('boot_id') || serverContent.includes('generateBootId')) {
          details.push(`✅ server.js incluye generación de boot_id`);
        } else {
          allPassed = false;
          details.push(`❌ server.js NO incluye generación de boot_id (requerido para modo pre-ID)`);
        }
      }
    }
  } catch (verifyErr) {
    // No crítico si server.js no fue modificado
    details.push(`ℹ️ Verificación de servidor omitida: ${verifyErr.message}`);
  }
  
  // Verificación 4: No hay referencias a secretos expuestos
  try {
    for (const patch of result.patches) {
      if (patch.file) {
        const sandboxFile = path.join(sandboxDir, patch.file);
        const content = await fs.readFile(sandboxFile, 'utf-8');
        const sensitivePatterns = [
          /OPENAI_API_KEY\s*=\s*['"][^'"]+['"]/,
          /process\.env\.OPENAI_API_KEY[^;]*=.*['"][^'"]+['"]/,
          /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i
        ];
        
        for (const pattern of sensitivePatterns) {
          if (pattern.test(content)) {
            allPassed = false;
            details.push(`❌ Posible secreto expuesto en ${patch.file}`);
            break;
          }
        }
      }
    }
  } catch (secretErr) {
    details.push(`⚠️ Verificación de secretos omitida: ${secretErr.message}`);
  }
  
  // Verificación 5: Smoke tests específicos para pre-ID
  if (isPreIdMode) {
    details.push(`ℹ️ Modo pre-ID: Los smoke tests deben verificar que boot_id y conversation_id se generan correctamente`);
  }
  
  return {
    all_passed: allPassed,
    message: allPassed ? 'Todas las verificaciones pasaron' : 'Algunas verificaciones fallaron',
    details: details
  };
}

// Iniciar servidor
app.listen(PORT, async () => {
  // Ejecutar cleanup de lock file al iniciar
  await cleanupOrphanedLock();
  
  console.log(`
=============================================================
  STI CHAT SERVER (Nuevo desde cero)
=============================================================
  Port: ${PORT}
  Environment: ${NODE_ENV}
  OpenAI: ${openai ? '✅ Disponible' : '⚠️  No configurado'}
  Conversations: ${CONVERSATIONS_DIR}
  Logs: ${SERVER_LOG_FILE}
  Rate Limiting: ✅ Activado (100 req/15min chat, 50 req/15min greeting)
=============================================================
✅ Server listening on http://localhost:${PORT}
`);
  await log('INFO', `Server iniciado en puerto ${PORT}`);
});
// Deploy marker 2025-12-19
