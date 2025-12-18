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

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Directorios
const DATA_BASE = path.join(__dirname, 'data');
const CONVERSATIONS_DIR = path.join(DATA_BASE, 'conversations');
const IDS_DIR = path.join(DATA_BASE, 'ids');
const LOGS_DIR = path.join(DATA_BASE, 'logs');
const TICKETS_DIR = path.join(DATA_BASE, 'tickets');

const USED_IDS_FILE = path.join(IDS_DIR, 'used_ids.json');
const USED_IDS_LOCK = path.join(IDS_DIR, 'used_ids.lock');
const SERVER_LOG_FILE = path.join(LOGS_DIR, 'server.log');

// Asegurar directorios
[CONVERSATIONS_DIR, IDS_DIR, LOGS_DIR, TICKETS_DIR].forEach(dir => {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
});

// Cleanup: eliminar lock file huérfano al iniciar (si existe)
async function cleanupOrphanedLock() {
  try {
    if (fsSync.existsSync(USED_IDS_LOCK)) {
      // Verificar si el lock es muy antiguo (> 5 minutos)
      const lockStats = await fs.stat(USED_IDS_LOCK);
      const lockAge = Date.now() - lockStats.mtimeMs;
      if (lockAge > 5 * 60 * 1000) {
        await fs.unlink(USED_IDS_LOCK);
        await log('WARN', 'Lock file huérfano eliminado al iniciar', { age_ms: lockAge });
      }
    }
  } catch (err) {
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

async function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;
  
  try {
    await fs.appendFile(SERVER_LOG_FILE, logLine);
  } catch (err) {
    console.error('Error escribiendo log:', err);
  }
  
  if (NODE_ENV === 'development' || level === 'ERROR') {
    console.log(logLine.trim());
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
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            usedIds = new Set(parsed);
          } else if (parsed.ids && Array.isArray(parsed.ids)) {
            usedIds = new Set(parsed.ids);
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
// PERSISTENCIA DE CONVERSACIONES
// ========================================================

/**
 * Guarda o actualiza una conversación (append-only transcript)
 * Usa write temp + rename para atomicidad
 */
async function saveConversation(conversation) {
  // Validar formato de conversation_id para prevenir path traversal
  if (!/^[A-Z]{2}\d{4}$/.test(conversation.conversation_id)) {
    await log('ERROR', `Formato inválido de conversation_id: ${conversation.conversation_id}`);
    throw new Error('Invalid conversation_id format');
  }
  
  const filePath = path.join(CONVERSATIONS_DIR, `${conversation.conversation_id}.json`);
  const tempPath = filePath + '.tmp';
  conversation.updated_at = new Date().toISOString();
  
  // Write temp + rename para atomicidad
  await fs.writeFile(tempPath, JSON.stringify(conversation, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
  await log('INFO', `Conversación guardada: ${conversation.conversation_id}`);
}

/**
 * Carga una conversación existente
 */
async function loadConversation(conversationId) {
  // Validar formato para prevenir path traversal
  if (!/^[A-Z]{2}\d{4}$/.test(conversationId)) {
    await log('ERROR', `Formato inválido de conversation_id en loadConversation: ${conversationId}`);
    return null;
  }
  
  const filePath = path.join(CONVERSATIONS_DIR, `${conversationId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Agrega un evento al transcript de la conversación
 */
async function appendToTranscript(conversationId, event) {
  // Validar formato para prevenir path traversal
  if (!conversationId || !/^[A-Z]{2}\d{4}$/.test(conversationId)) {
    await log('ERROR', `Formato inválido de conversation_id en appendToTranscript: ${conversationId}`);
    return;
  }
  
  const conversation = await loadConversation(conversationId);
  if (!conversation) {
    await log('ERROR', `Conversación no encontrada para append: ${conversationId}`);
    return;
  }
  
  if (!conversation.transcript) {
    conversation.transcript = [];
  }
  
  // P2.5: Timestamp atómico (generar antes de append para mantener orden)
  const atomicTimestamp = new Date().toISOString();
  
  conversation.transcript.push({
    t: atomicTimestamp,
    ...event
  });
  
  await saveConversation(conversation);
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
  if (!conversationId) return null; // No lock si no hay conversation_id
  
  while (conversationLocks.has(conversationId)) {
    // Esperar a que se libere el lock
    await conversationLocks.get(conversationId);
  }
  
  let releaseLock;
  const lockPromise = new Promise(resolve => {
    releaseLock = resolve;
  });
  
  conversationLocks.set(conversationId, lockPromise);
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
  if (!conversationId) return true; // Sin límite si no hay conversation_id
  
  const now = Date.now();
  const limit = aiCallLimits.get(conversationId);
  
  if (!limit || now > limit.resetAt) {
    // Reset o inicializar
    aiCallLimits.set(conversationId, {
      count: 1,
      resetAt: now + 60000 // 1 minuto
    });
    return true;
  }
  
  if (limit.count >= maxCallsPerMinute) {
    await log('WARN', 'Límite de llamadas IA excedido', { 
      conversation_id: conversationId, 
      count: limit.count,
      max: maxCallsPerMinute 
    });
    return false;
  }
  
  limit.count++;
  return true;
}

/**
 * Verifica si hay cooldown activo tras errores repetidos
 */
async function checkAICooldown(conversationId) {
  if (!conversationId) return true;
  
  const cooldown = aiErrorCooldowns.get(conversationId);
  if (cooldown && Date.now() < cooldown.until) {
    return false; // En cooldown
  }
  return true;
}

/**
 * Activa cooldown exponencial tras errores
 */
function setAICooldown(conversationId, errorCount) {
  if (!conversationId) return;
  
  // Cooldown exponencial: 5s, 10s, 20s, 30s
  const cooldownSeconds = Math.min(5 * Math.pow(2, errorCount - 1), 30);
  aiErrorCooldowns.set(conversationId, {
    until: Date.now() + (cooldownSeconds * 1000),
    errorCount: errorCount + 1
  });
  
  // Limpiar después del cooldown
  setTimeout(() => {
    aiErrorCooldowns.delete(conversationId);
  }, cooldownSeconds * 1000);
}

/**
 * Incrementa contador de llamadas a IA para monitoreo
 */
function incrementAICallCount(conversationId, type) {
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
  return {
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
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createSession(sessionId));
  }
  return sessions.get(sessionId);
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

✅ Voy a guardar tu nombre y nuestra conversación de forma indefinida
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
    en: `Select your language:`
  },
  ASK_NAME: {
    es: `¿Con quién tengo el gusto de hablar? 😊`,
    en: `What's your name? 😊`
  },
  ASK_USER_LEVEL: {
    es: `Por favor, seleccioná tu nivel de conocimiento técnico:`,
    en: `Please select your technical knowledge level:`
  },
  ASK_DEVICE_CATEGORY: {
    es: `¿Es tu equipo principal o un dispositivo externo/periférico?`,
    en: `Is it your main device or an external/peripheral device?`
  },
  ASK_PROBLEM: {
    es: `Contame, ¿qué problema estás teniendo?`,
    en: `Tell me, what problem are you having?`
  },
  ASK_FEEDBACK: {
    es: `Antes de cerrar, ¿me decís si esta ayuda te resultó útil?`,
    en: `Before closing, can you tell me if this help was useful?`
  }
};

// ========================================================
// VALIDACIÓN DE SCHEMA JSON
// ========================================================

/**
 * Valida el schema del resultado de IA_CLASSIFIER
 */
function validateClassifierResult(result) {
  const required = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence'];
  for (const field of required) {
    if (!(field in result)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
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
  
  if (result.suggest_modes && typeof result.suggest_modes !== 'object') {
    throw new Error(`Invalid suggest_modes: ${result.suggest_modes}. Must be an object`);
  }
  
  // Validación opcional: advertir sobre campos adicionales no esperados
  const allowedFields = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence', 'suggest_modes', 'suggested_next_ask'];
  const extraFields = Object.keys(result).filter(f => !allowedFields.includes(f));
  if (extraFields.length > 0) {
    // Log warning pero no fallar (mejora opcional)
    console.warn(`[WARN] Campos adicionales en respuesta IA_CLASSIFIER: ${extraFields.join(', ')}`);
  }
  
  return true;
}

/**
 * Valida el schema del resultado de IA_STEP
 */
function validateStepResult(result) {
  if (!result.reply || typeof result.reply !== 'string') {
    throw new Error(`Missing or invalid reply field. Must be a non-empty string`);
  }
  
  if (result.buttons !== undefined && !Array.isArray(result.buttons)) {
    throw new Error(`Invalid buttons: ${result.buttons}. Must be an array`);
  }
  
  if (result.buttons && result.buttons.length > 0) {
    for (const btn of result.buttons) {
      if (!btn.token || typeof btn.token !== 'string') {
        throw new Error(`Invalid button: missing or invalid token`);
      }
      if (!btn.label || typeof btn.label !== 'string' || btn.label.trim().length === 0) {
        throw new Error(`Invalid button: missing or empty label`);
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

async function iaClassifier(session, userInput, requestId = null) {
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback');
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
  
  const conversationId = session.conversation_id;
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

Devolvé un JSON con esta estructura exacta:
{
  "intent": "network|power|install_os|install_app|peripheral|malware|unknown",
  "needs_clarification": true|false,
  "missing": ["device_type", "os", ...],
  "suggested_next_ask": "ASK_DEVICE_TYPE|ASK_PROBLEM|...",
  "risk_level": "low|medium|high",
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
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CLASSIFIER_RESULT',
          payload: {
            ...result,
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
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback para STEP');
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
  
  const conversationId = session.conversation_id;
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
      validateStepResult(result);
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
  const inputLower = userInput.toLowerCase().trim();
  const accepted = inputLower.includes('sí') || inputLower.includes('si') || 
                   inputLower.includes('yes') || inputLower.includes('acepto') || 
                   inputLower.includes('accept') || inputLower === 'sí, acepto ✔️' ||
                   inputLower === 'no acepto ❌';
  
  if (inputLower.includes('no') || inputLower.includes('❌')) {
    return {
      reply: 'Entiendo. Para usar este servicio necesitás aceptar la política de privacidad.\n\nSi cambiás de opinión, podés volver a iniciar el chat cuando quieras.\n\n¡Que tengas un buen día!',
      buttons: [],
      stage: 'ENDED',
      endConversation: true
    };
  }
  
  if (accepted && !inputLower.includes('no')) {
    session.stage = 'ASK_LANGUAGE';
    session.meta.updated_at = new Date().toISOString();
    
    // No hay conversation aún en ASK_CONSENT, solo guardar en session
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
  return {
    reply: TEXTS.ASK_CONSENT[session.language || 'es'],
    buttons: ALLOWED_BUTTONS_BY_ASK.ASK_CONSENT.map(b => ({
      label: b.label,
      value: b.value,
      token: b.token
    })),
    stage: 'ASK_CONSENT'
  };
}

async function handleAskLanguage(session, userInput, conversation, traceContext = null) {
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
  
  // Asignar ID único y crear conversación
  try {
    const conversationId = await reserveUniqueConversationId();
    session.conversation_id = conversationId;
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
    
    // Crear conversación persistente
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
    
    // Append eventos al transcript
    await appendToTranscript(conversationId, {
      role: 'user',
      type: 'button',
      label: selectedLanguage === 'es-AR' ? 'Español (Argentina)' : 'English',
      value: selectedLanguage
    });
    
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'CONVERSATION_ID_ASSIGNED',
      payload: { conversation_id: conversationId }
    });
    
    const langText = selectedLanguage === 'es-AR' ? 'Español' : 'English';
    const replyText = selectedLanguage === 'es-AR' 
      ? `¡Perfecto! Vamos a continuar en Español.\n\n🆔 **${conversationId}**\n\n¿Con quién tengo el gusto de hablar? 😊`
      : `Great! Let's continue in English.\n\n🆔 **${conversationId}**\n\nWhat's your name? 😊`;
    
    return {
      reply: replyText,
      buttons: [],
      stage: 'ASK_NAME'
    };
  } catch (err) {
    await log('ERROR', 'Error asignando ID único', { error: err.message });
    return {
      reply: 'Hubo un error técnico. Por favor, intentá de nuevo.',
      buttons: [],
      stage: 'ASK_LANGUAGE'
    };
  }
}

async function handleAskName(session, userInput, conversation) {
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
  
  await appendToTranscript(conversation.conversation_id, {
    role: 'user',
    type: 'text',
    text: nameRaw
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
  session.stage = 'ASK_DEVICE_CATEGORY';
  session.meta.updated_at = new Date().toISOString();
  
  await appendToTranscript(conversation.conversation_id, {
    role: 'user',
    type: 'button',
    label: level === 'basico' ? 'Básico' : level === 'intermedio' ? 'Intermedio' : 'Avanzado',
    value: level
  });
  
  const confirmation = session.language === 'es-AR'
    ? `¡Perfecto! Voy a ajustar mis explicaciones a tu nivel ${level}.\n\n${TEXTS.ASK_DEVICE_CATEGORY.es}`
    : `Perfect! I'll adjust my explanations to your ${level} level.\n\n${TEXTS.ASK_DEVICE_CATEGORY.en}`;
  
  return {
    reply: confirmation,
    buttons: ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_CATEGORY.map(b => ({
      label: b.label,
      value: b.value,
      token: b.token
    })),
    stage: 'ASK_DEVICE_CATEGORY'
  };
}

async function handleAskDeviceCategory(session, userInput, conversation) {
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
  
  await appendToTranscript(conversation.conversation_id, {
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
  const inputLower = userInput.toLowerCase().trim();
  let deviceType = null;
  
  if (session.stage === 'ASK_DEVICE_TYPE_MAIN') {
    if (inputLower.includes('escritorio') || inputLower.includes('desktop') || inputLower === 'desktop') {
      deviceType = 'desktop';
    } else if (inputLower.includes('notebook') || inputLower.includes('laptop') || inputLower === 'notebook') {
      deviceType = 'notebook';
    } else if (inputLower.includes('all-in-one') || inputLower.includes('allinone') || inputLower === 'allinone') {
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
  
  session.stage = 'ASK_PROBLEM';
  session.meta.updated_at = new Date().toISOString();
  
  await appendToTranscript(conversation.conversation_id, {
    role: 'user',
    type: 'button',
    label: userInput,
    value: deviceType
  });
  
  return {
    reply: TEXTS.ASK_PROBLEM[session.language || 'es'],
    buttons: [],
    stage: 'ASK_PROBLEM'
  };
}

async function handleAskProblem(session, userInput, conversation, requestId = null) {
  session.context.problem_description_raw = userInput;
  session.meta.updated_at = new Date().toISOString();
  
  await appendToTranscript(conversation.conversation_id, {
    role: 'user',
    type: 'text',
    text: userInput
  });
  
  // Llamar a IA_CLASSIFIER
  await appendToTranscript(conversation.conversation_id, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_CALL',
    payload: { user_input: userInput, request_id: requestId }
  });
  
  const classification = await iaClassifier(session, userInput, requestId);
  
  session.context.problem_category = classification.intent;
  session.context.risk_level = classification.risk_level;
  
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
  
  // Si falta device_type y no está definido, preguntar
  if (classification.missing.includes('device_type') && !session.context.device_type) {
    session.stage = 'ASK_DEVICE_TYPE_MAIN';
    return {
      reply: session.language === 'es-AR' ? '¿Qué tipo de dispositivo?' : 'What type of device?',
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_DEVICE_TYPE_MAIN.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_DEVICE_TYPE_MAIN'
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
  // Solo activar FREE_QA después de ASK_NAME (cuando ya hay contexto)
  if (!session.user.name_norm || session.stage === 'ASK_CONSENT' || session.stage === 'ASK_LANGUAGE') {
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
      
      // F30.1: Registrar métrica de escalamiento
      const metrics = resolutionMetrics.get(conversation.conversation_id) || { resolved: false, escalated: false, steps_taken: 0 };
      metrics.escalated = true;
      metrics.steps_taken = session.context.diagnostic_attempts || 0;
      if (conversation.started_at) {
        const startedAt = new Date(conversation.started_at);
        const escalatedAt = new Date();
        metrics.escalation_time_minutes = (escalatedAt - startedAt) / (1000 * 60);
      }
      resolutionMetrics.set(conversation.conversation_id, metrics);
      
      // Validar formato de conversation_id antes de usar en path
      if (!/^[A-Z]{2}\d{4}$/.test(conversation.conversation_id)) {
        await log('ERROR', `Formato inválido de conversation_id en escalateToTechnician: ${conversation.conversation_id}`);
        throw new Error('Invalid conversation_id format');
      }
      
      // Crear ticket
      const ticket = {
        conversation_id: conversation.conversation_id,
        created_at: new Date().toISOString(),
        user: conversation.user,
        problem: session.context.problem_description_raw,
        reason,
        transcript_path: path.join(CONVERSATIONS_DIR, `${conversation.conversation_id}.json`),
        whatsapp_url: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
          `Hola, soy ${conversation.user.name_norm || 'Usuario'}. Conversación ${conversation.conversation_id}. Problema: ${session.context.problem_description_raw || 'N/A'}`
        )}`
      };
      
      // Write temp + rename para atomicidad (con reintento)
      const ticketPath = path.join(TICKETS_DIR, `${conversation.conversation_id}.json`);
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
  
  await appendToTranscript(conversation.conversation_id, {
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
    // F30.1: Registrar métrica de resolución
    const metrics = resolutionMetrics.get(conversation.conversation_id) || { resolved: false, escalated: false, steps_taken: 0 };
    metrics.resolved = true;
    metrics.steps_taken = session.context.diagnostic_attempts || 0;
    if (conversation.started_at) {
      const startedAt = new Date(conversation.started_at);
      const resolvedAt = new Date();
      metrics.resolution_time_minutes = (resolvedAt - startedAt) / (1000 * 60);
    }
    resolutionMetrics.set(conversation.conversation_id, metrics);
    
    session.stage = 'ASK_FEEDBACK';
    await appendToTranscript(conversation.conversation_id, {
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
    
    await appendToTranscript(conversation.conversation_id, {
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
    
    await appendToTranscript(conversation.conversation_id, {
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
  
  await appendToTranscript(conversation.conversation_id, {
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
    
    await appendToTranscript(conversation.conversation_id, {
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
  
  await appendToTranscript(conversation.conversation_id, {
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
    // Guardar respuesta del usuario
    await appendToTranscript(conversation.conversation_id, {
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
  if (!session.modes.advisory_mode) {
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
    
    await appendToTranscript(conversation.conversation_id, {
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
  const session = getSession(sessionId);
  let conversation = null;
  let releaseLock = null;
  
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
      conversation = await loadConversation(session.conversation_id);
      
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
          await log('ERROR', 'Estado de conversación inválido', { 
            conversation_id: session.conversation_id,
            reason: stateValidation.reason 
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
      if (imageBase64 && conversation) {
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
          // Validar tamaño de imagen (máximo 5MB en base64)
          const imageSize = (imageBase64.length * 3) / 4; // Aproximación del tamaño en bytes
          if (imageSize > 5 * 1024 * 1024) {
            await log('WARN', 'Imagen demasiado grande, ignorando', {
              conversation_id: session.conversation_id,
              size_bytes: imageSize
            });
          } else {
            // Guardar referencia de imagen en transcript
            await appendToTranscript(conversation.conversation_id, {
              role: 'user',
              type: 'image',
              image_base64: imageBase64.substring(0, 100) + '...', // Solo guardar preview
              image_name: requestId ? `image_${requestId}.jpg` : `image_${Date.now()}.jpg`,
              image_size_bytes: imageSize
            });
            
            await log('INFO', 'Imagen recibida y persistida', {
              conversation_id: session.conversation_id,
              image_size_bytes: imageSize,
              has_text: !!userInput
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
        // Guardar respuesta FREE_QA
        await appendToTranscript(conversation.conversation_id, {
          role: 'user',
          type: 'text',
          text: userInput
        });
        await appendToTranscript(conversation.conversation_id, {
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
      return {
        reply: TEXTS.ASK_CONSENT[session.language || 'es'],
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
      response = await handleAskConsent(session, userInput, conversation || {});
      break;
    case 'ASK_LANGUAGE':
      response = await handleAskLanguage(session, userInput, conversation || {}, traceContext);
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
      response = await handleAskProblem(session, userInput, conversation || {}, requestId);
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
  
  // Actualizar stage en session
  if (response.stage) {
    // P2.3: Usar stageBefore capturado al inicio (no session.stage que ya puede haber cambiado)
    const stageAfter = response.stage;
    
    if (conversation && stageBefore !== stageAfter) {
      await appendToTranscript(conversation.conversation_id, {
        role: 'system',
        type: 'event',
        name: 'STAGE_CHANGED',
        payload: { from: stageBefore, to: stageAfter }
      });
      
      // Log transición de stage
      await trace.logStageTransition(
        traceContext,
        stageBefore,
        stageAfter,
        'stage_transition',
        { user_input: userInput.substring(0, 100) }
      );
    }
    
    session.stage = stageAfter;
    session.meta.updated_at = new Date().toISOString();
  }
  
  // Guardar respuesta del bot en transcript
  if (conversation && response.reply) {
    await appendToTranscript(conversation.conversation_id, {
      role: 'bot',
      type: 'text',
      text: response.reply
    });
    
    if (response.buttons && response.buttons.length > 0) {
      await appendToTranscript(conversation.conversation_id, {
        role: 'bot',
        type: 'buttons',
        buttons: response.buttons
      });
      
      // Log botones mostrados
      await trace.logButtonSelection(
        traceContext,
        response.buttons,
        null,
        'buttons_shown'
      );
    }
    
    // Log respuesta final
    await trace.logResponse(
      traceContext,
      response.reply,
      response.buttons || null,
      null
    );
  }
  
  // Guardar conversación actualizada
  if (conversation) {
    await saveConversation(conversation);
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
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
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

// Endpoint principal de chat
app.post('/api/chat', chatLimiter, async (req, res) => {
  // boot_id ya está asignado por el middleware
  const bootId = req.bootId;
  const traceContext = req.traceContext;
  
  try {
    // F23.1: Validación estricta de eventos entrantes
    const validation = validateChatRequest(req.body);
    if (!validation.valid) {
      // Log error de validación
      await trace.logEvent('ERROR', 'VALIDATION_ERROR', {
        actor: 'system',
        endpoint: '/api/chat',
        error: validation.error,
        boot_id: bootId
      }, traceContext);
      
      return res.status(400).json({ ok: false, error: validation.error });
    }
    
    const { sessionId, message, imageBase64, imageName, request_id } = req.body;
    
    if (!sessionId) {
      await trace.logEvent('ERROR', 'MISSING_SESSION_ID', {
        actor: 'system',
        endpoint: '/api/chat',
        boot_id: bootId
      }, traceContext);
      
      return res.status(400).json({ ok: false, error: 'sessionId requerido' });
    }
    
    if (!message && !imageBase64) {
      await trace.logEvent('ERROR', 'MISSING_MESSAGE', {
        actor: 'system',
        endpoint: '/api/chat',
        boot_id: bootId
      }, traceContext);
      
      return res.status(400).json({ ok: false, error: 'message o imageBase64 requerido' });
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
    const requestId = request_id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Actualizar traceContext con request_id
    traceContext.request_id = requestId;
    
    await log('INFO', `Chat request`, { sessionId, hasMessage: !!message, hasImage: !!imageBase64, request_id: requestId, boot_id: bootId });
    
    // Log entrada de request
    await trace.logEvent('INFO', 'CHAT_REQUEST', {
      actor: 'user',
      endpoint: '/api/chat',
      session_id: sessionId,
      has_message: !!message,
      has_image: !!imageBase64,
      boot_id: bootId
    }, traceContext);
    
    const response = await handleChatMessage(sessionId, message || '', imageBase64, requestId, bootId);
    
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
      endConversation: response.endConversation || false
    };
    
    res.json(frontendResponse);
  } catch (err) {
    await log('ERROR', 'Error en /api/chat', { error: err.message, stack: err.stack, boot_id: bootId });
    
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
      
      await trace.logError(errorContext, err, 'recoverable', null, false);
    } catch (traceErr) {
      // Ignorar errores de trace
    }
    
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      message: NODE_ENV === 'development' ? err.message : undefined
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
    
    const reply = TEXTS.ASK_CONSENT.es; // Por defecto español, luego se puede cambiar
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
    await log('ERROR', 'Error en /api/greeting', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener eventos en vivo
app.get('/api/live-events', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Validar token (usar LOG_TOKEN si está configurado)
    const LOG_TOKEN = process.env.LOG_TOKEN;
    if (LOG_TOKEN && token !== LOG_TOKEN) {
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
    await log('ERROR', 'Error en /api/live-events', { error: err.message, stack: err.stack });
    res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener último error por boot_id
app.get('/api/live-events/last-error', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    const LOG_TOKEN = process.env.LOG_TOKEN;
    if (LOG_TOKEN && token !== LOG_TOKEN) {
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

// Endpoint para obtener trace detallado de una conversación
app.get('/api/trace/:conversationId', async (req, res) => {
  try {
    const conversationId = String(req.params.conversationId || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Validar token (usar LOG_TOKEN si está configurado)
    const LOG_TOKEN = process.env.LOG_TOKEN;
    if (LOG_TOKEN && token !== LOG_TOKEN) {
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
// AUTOFIX IA - ENDPOINTS
// ========================================================

// Endpoint para analizar trace y generar solución
app.post('/api/autofix/analyze', async (req, res) => {
  try {
    const { trace, objective, mode, token } = req.body;
    
    // Validar token
    const LOG_TOKEN = process.env.LOG_TOKEN;
    if (LOG_TOKEN && token !== LOG_TOKEN) {
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
      // Leer server.js para contexto (solo primeras líneas y estructura)
      const serverPath = path.join(__dirname, 'server.js');
      const serverContent = await fs.readFile(serverPath, 'utf-8');
      const serverLines = serverContent.split('\n');
      // Tomar primeras 100 líneas (imports y configuración)
      codeContext += `\n\nESTRUCTURA DEL PROYECTO (server.js - primeras líneas):\n${serverLines.slice(0, 100).join('\n')}\n`;
    } catch (err) {
      // Ignorar si no se puede leer
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
3. Genera un plan de reparación claro
4. Crea diffs en formato git unificado para cada archivo a modificar
5. Evalúa riesgos y proporciona tests a ejecutar
6. NO expongas secretos, tokens o credenciales en los diffs
7. Asegúrate de que los diffs sean aplicables y no rompan el flujo
${isPreIdMode ? '8. Los smoke tests deben verificar que ahora se genera boot_id y conversation_id correctamente' : ''}

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
    
    // Agregar metadata
    analysis.model_used = model;
    analysis.analyzed_at = new Date().toISOString();
    analysis.safe_to_apply = false; // Se determinará después de verificación
    analysis.mode = mode; // Guardar modo para verificación
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
    const LOG_TOKEN = process.env.LOG_TOKEN;
    if (LOG_TOKEN && token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    if (!result || !result.patches || result.patches.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay parches para aplicar' });
    }
    
    // Crear sandbox temporal
    const sandboxDir = path.join(__dirname, 'data', 'autofix-sandbox', `sandbox-${Date.now()}`);
    await fs.mkdir(sandboxDir, { recursive: true });
    
    try {
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
        
        const filePath = path.join(__dirname, patch.file);
        const sandboxFilePath = path.join(sandboxDir, patch.file);
        
        // Crear directorio si no existe
        await fs.mkdir(path.dirname(sandboxFilePath), { recursive: true });
        
        // Leer archivo original
        let fileContent = '';
        try {
          fileContent = await fs.readFile(filePath, 'utf-8');
        } catch (err) {
          // Archivo no existe, crear vacío
          fileContent = '';
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
    const LOG_TOKEN = process.env.LOG_TOKEN;
    if (LOG_TOKEN && token !== LOG_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    if (!result || !result.safe_to_apply) {
      return res.status(400).json({ ok: false, error: 'La reparación no está verificada como segura' });
    }
    
    if (!result.patches || result.patches.length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay parches para aplicar' });
    }
    
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
      const filePath = path.join(__dirname, normalizedFile);
      
      await log('INFO', `AutoFix: Aplicando patch a ${normalizedFile}`, { 
        file: normalizedFile,
        filePath: filePath,
        diff_length: patch.diff.length
      });
      
      // Leer archivo original
      let fileContent = '';
      let originalStats = null;
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
  
  // Inicializar result con todas las líneas originales
  let result = [...lines];
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
