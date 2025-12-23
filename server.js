/**
 * server.js — STI Chat (v7) — Complete
 *
 * Full server implementation (version 7):
 * - Express API for chat flows (greeting, /api/chat)
 * - Name validation (local + optional OpenAI check)
 * - Device disambiguation with human labels and BTN_DEV_* tokens
 * - Diagnostic steps generation (local fallback + OpenAI)
 * - Help per step, escalation to WhatsApp with ticket generation
 * - Transcripts and tickets persisted to disk
 * - SSE logs endpoint
 *
 * ENDPOINTS DISPONIBLES:
 * - GET  /api/health              → Health check del servidor
 * - ALL  /api/greeting            → Saludo inicial y creación de sesión
 * - POST /api/chat                → Endpoint principal de conversación
 * - POST /api/reset               → Resetear sesión
 * - POST /api/whatsapp-ticket     → Crear ticket y generar links WhatsApp
 * - GET  /api/transcript/:sid     → Obtener transcript de sesión (texto plano)
 * - GET  /api/ticket/:tid         → Obtener ticket (JSON)
 * - GET  /ticket/:tid             → Ver ticket con UI (HTML)
 * - GET  /api/logs                → Obtener logs completos (requiere token)
 * - GET  /api/logs/stream         → Stream de logs en tiempo real vía SSE (requiere token)
 * - GET  /api/sessions            → Listar sesiones activas
 *
 * Notes:
 * - Requires a sessionStore.js that implements getSession, saveSession, listActiveSessions
 * - Optional OpenAI integration controlled by OPENAI_API_KEY env var
 * - Configure directories via env: DATA_BASE, TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR
 * - Set ALLOWED_ORIGINS for CORS security
 * - Set LOG_TOKEN to protect logs endpoint
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import fs, { createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import multer from 'multer';
import sharp from 'sharp';
import cron from 'node-cron';
import compression from 'compression';

import { getSession, saveSession, listActiveSessions } from './sessionStore.js';
import { logFlowInteraction, detectLoops, getSessionAudit, generateAuditReport, exportToExcel, maskPII } from './flowLogger.js';
import { createTicket, generateWhatsAppLink, getTicket, getTicketPublicUrl, listTickets, updateTicketStatus } from './ticketing.js';
import { normalizarTextoCompleto } from './normalizarTexto.js';
import { detectAmbiguousDevice, DEVICE_DISAMBIGUATION } from './deviceDetection.js';
import * as csrfStore from './src/stores/csrfStore.js';

// FORCE REBUILD 2025-11-25 16:45 - Debugging deviceDetection import
console.log('[INIT] deviceDetection imported successfully:', typeof detectAmbiguousDevice);
console.log('[INIT] DEVICE_DISAMBIGUATION keys:', Object.keys(DEVICE_DISAMBIGUATION).length);

// ========================================================
// Security: CSRF Token Store (desacoplado, ver src/stores/csrfStore.js)
// ========================================================
const REQUEST_ID_HEADER = 'x-request-id';

// PERFORMANCE: Session cache (LRU-style, max 1000 sessions)
const sessionCache = new Map(); // Map<sessionId, {data, lastAccess}>
const MAX_CACHED_SESSIONS = 1000;

function cacheSession(sid, data) {
  // Si el cache está lleno, eliminar la sesión menos usada
  if (sessionCache.size >= MAX_CACHED_SESSIONS) {
    let oldestSid = null;
    let oldestTime = Infinity;
    for (const [id, cached] of sessionCache.entries()) {
      if (cached.lastAccess < oldestTime) {
        oldestTime = cached.lastAccess;
        oldestSid = id;
      }
    }
    if (oldestSid) sessionCache.delete(oldestSid);
  }
  sessionCache.set(sid, { data, lastAccess: Date.now() });
}

function getCachedSession(sid) {
  const cached = sessionCache.get(sid);
  if (cached) {
    cached.lastAccess = Date.now(); // Actualizar LRU
    return cached.data;
  }
  return null;
}

// Limpiar cache de sesiones antiguas cada 10 minutos
setInterval(() => {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  for (const [sid, cached] of sessionCache.entries()) {
    if (cached.lastAccess < tenMinutesAgo) {
      sessionCache.delete(sid);
    }
  }
}, 10 * 60 * 1000);

// Cleanup expired CSRF tokens every 30 minutes
setInterval(() => {
  csrfStore.cleanup();
}, 30 * 60 * 1000);

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// ========================================================
// 🆔 CONVERSATION ID SYSTEM (AA-0000 to ZZ-9999)
// ========================================================
// Sistema de IDs únicos para conversaciones con persistencia append-only
// Formato: 2 letras (A-Z, sin Ñ) + guión + 4 dígitos (0000-9999)
// Ejemplo: "QF-0382"

// Set en memoria con todos los IDs usados (cargado al iniciar)
let usedConversationIds = new Set();

/**
 * Genera un Conversation ID único con formato AA-0000
 * @returns {string} Conversation ID (ej: "QF-0382")
 */
function generateConversationId() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // Sin Ñ
  const letter1 = letters[Math.floor(Math.random() * letters.length)];
  const letter2 = letters[Math.floor(Math.random() * letters.length)];
  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${letter1}${letter2}-${digits}`;
}

/**
 * Carga todos los Conversation IDs usados desde el archivo JSONL
 * Se ejecuta al iniciar el servidor
 */
function loadUsedConversationIds() {
  try {
    if (!fs.existsSync(CONVERSATION_IDS_FILE)) {
      console.log('[CONVERSATION_ID] Archivo de IDs no existe, se creará al generar el primero');
      return;
    }
    
    const content = fs.readFileSync(CONVERSATION_IDS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.conversationId) {
          usedConversationIds.add(data.conversationId);
        }
      } catch (e) {
        console.warn('[CONVERSATION_ID] Línea inválida en JSONL:', line.substring(0, 50));
      }
    }
    
    console.log(`[CONVERSATION_ID] Cargados ${usedConversationIds.size} IDs únicos desde archivo`);
  } catch (error) {
    console.error('[CONVERSATION_ID] Error cargando IDs:', error.message);
  }
}

/**
 * Obtiene un lockfile para operaciones atómicas
 * @param {number} maxRetries - Número máximo de reintentos
 * @param {number} retryDelay - Delay entre reintentos en ms
 * @returns {Promise<boolean>} true si obtuvo el lock, false si falló
 */
async function acquireLock(maxRetries = 10, retryDelay = 50) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Intentar crear lockfile con flag 'wx' (exclusive write)
      fs.writeFileSync(CONVERSATION_IDS_LOCK, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // Lock existe, esperar y reintentar
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      throw error;
    }
  }
  return false;
}

/**
 * Libera el lockfile
 */
function releaseLock() {
  try {
    if (fs.existsSync(CONVERSATION_IDS_LOCK)) {
      fs.unlinkSync(CONVERSATION_IDS_LOCK);
    }
  } catch (error) {
    console.warn('[CONVERSATION_ID] Error liberando lock:', error.message);
  }
}

/**
 * Genera y persiste un Conversation ID único (anti-colisión)
 * @param {string} sessionId - Session ID asociado
 * @returns {Promise<string>} Conversation ID único
 */
async function generateAndPersistConversationId(sessionId) {
  let attempts = 0;
  const maxAttempts = 1000; // Máximo de intentos antes de fallar
  
  while (attempts < maxAttempts) {
    const candidateId = generateConversationId();
    
    // Verificar en memoria primero (rápido)
    if (usedConversationIds.has(candidateId)) {
      attempts++;
      continue;
    }
    
    // Obtener lock para operación atómica
    const hasLock = await acquireLock();
    if (!hasLock) {
      throw new Error('No se pudo obtener lock para generar Conversation ID');
    }
    
    try {
      // Re-verificar después de obtener lock (puede haber cambiado)
      if (usedConversationIds.has(candidateId)) {
        releaseLock();
        attempts++;
        continue;
      }
      
      // Persistir en archivo JSONL (append-only)
      const record = {
        conversationId: candidateId,
        createdAt: new Date().toISOString(),
        sessionId: sessionId,
        source: 'web'
      };
      
      fs.appendFileSync(CONVERSATION_IDS_FILE, JSON.stringify(record) + '\n', 'utf8');
      
      // Agregar a Set en memoria
      usedConversationIds.add(candidateId);
      
      // ========================================================
      // P0: Crear registro persistente inmediatamente
      // ========================================================
      // Crear archivo .jsonl vacío (o con evento inicial) para que sea recuperable
      const conversationFile = path.join(CONVERSATIONS_DIR, `${candidateId}.jsonl`);
      try {
        // Si el archivo no existe, crearlo con evento inicial
        if (!fs.existsSync(conversationFile)) {
          const initialEvent = {
            t: new Date().toISOString(),
            role: 'system',
            type: 'conversation_created',
            text: 'Conversación iniciada',
            conversationId: candidateId,
            sessionId: sessionId
          };
          fs.writeFileSync(conversationFile, JSON.stringify(initialEvent) + '\n', 'utf8');
          console.log(`[CONVERSATION_ID] ✅ Archivo de conversación creado: ${candidateId}.jsonl`);
        }
      } catch (error) {
        console.warn(`[CONVERSATION_ID] ⚠️ Error creando archivo de conversación: ${error.message}`);
        // No fallar si no se puede crear el archivo, pero loguear
      }
      
      // Crear meta inicial
      const metaFile = path.join(CONVERSATIONS_DIR, `${candidateId}.meta.json`);
      try {
        const initialMeta = {
          conversationId: candidateId,
          sid: sessionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userName: null,
          device: null,
          language: null,
          stage: null
        };
        fs.writeFileSync(metaFile, JSON.stringify(initialMeta, null, 2), 'utf8');
        console.log(`[CONVERSATION_ID] ✅ Meta de conversación creada: ${candidateId}.meta.json`);
      } catch (error) {
        console.warn(`[CONVERSATION_ID] ⚠️ Error creando meta: ${error.message}`);
      }
      
      console.log(`[CONVERSATION_ID] ✅ Generado y persistido: ${candidateId} para sesión ${sessionId?.substring(0, 20)}...`);
      
      return candidateId;
    } finally {
      releaseLock();
    }
  }
  
  throw new Error(`No se pudo generar Conversation ID único después de ${maxAttempts} intentos`);
}

/**
 * Guarda un evento de conversación en el archivo append-only
 * @param {string} conversationId - Conversation ID
 * @param {Object} event - Evento a guardar {t, role, type, text, stage, ...}
 */
function logConversationEvent(conversationId, event) {
  try {
    if (!conversationId) return;
    
    const conversationFile = path.join(CONVERSATIONS_DIR, `${conversationId}.jsonl`);
    const eventLine = JSON.stringify({
      t: event.t || new Date().toISOString(),
      role: event.role || 'unknown',
      type: event.type || 'text',
      text: event.text || '',
      stage: event.stage || null,
      buttons: event.buttons || null,
      ...event
    }) + '\n';
    
    fs.appendFileSync(conversationFile, eventLine, 'utf8');
  } catch (error) {
    console.error(`[CONVERSATION_LOG] Error guardando evento para ${conversationId}:`, error.message);
  }
}

/**
 * Helper único: Agrega al transcript Y persiste en JSONL
 * @param {Object} session - Session object (se modifica in-place)
 * @param {string} conversationId - Conversation ID (puede ser null)
 * @param {string} who - 'user' | 'bot'
 * @param {string} text - Texto del mensaje
 * @param {Object} options - { type, stage, buttons, buttonToken, hasImages, ts, message_id }
 * @returns {Object} - Entry creado
 */
async function appendAndPersistConversationEvent(session, conversationId, who, text, options = {}) {
  const ts = options.ts || nowIso();
  
  // ========================================================
  // 🆔 IDEMPOTENCIA: Generar message_id único si no existe
  // ========================================================
  const message_id = options.message_id || `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  
  // Verificar si ya existe este message_id (idempotencia)
  if (session.transcript && Array.isArray(session.transcript)) {
    const existing = session.transcript.find(m => m.message_id === message_id);
    if (existing) {
      console.log(`[IDEMPOTENCY] ⚠️ Mensaje duplicado detectado (message_id: ${message_id.substring(0, 20)}...), omitiendo inserción`);
      return existing;
    }
  }
  
  // Generar seq incremental (contador por conversación)
  if (!session.messageSeq) {
    session.messageSeq = 0;
  }
  const seq = ++session.messageSeq;
  
  const entry = {
    message_id,
    seq,
    who,
    text,
    ts,
    ...(options.stage && { stage: options.stage }),
    ...(options.buttons && { buttons: options.buttons }),
    ...(options.imageUrl && { imageUrl: options.imageUrl })
  };
  
  // 1. Agregar al transcript en memoria
  if (!session.transcript) {
    session.transcript = [];
  }
  session.transcript.push(entry);
  
  // 2. Guardar sesión
  if (session.id) {
    await saveSession(session.id, session);
  }
  
  // 3. Persistir en JSONL si hay conversationId
  if (conversationId) {
    logConversationEvent(conversationId, {
      message_id,
      seq,
      t: ts,
      role: who, // 'user' o 'bot'
      type: options.type || 'text',
      text: text,
      stage: options.stage || session.stage || null,
      buttons: options.buttons || null,
      buttonToken: options.buttonToken || null,
      hasImages: options.hasImages || false,
      imageUrl: options.imageUrl || null
    });
  } else {
    // Verificación automática: log warning si hay reply del bot sin conversationId
    if (who === 'bot' && session.id) {
      console.warn(`[PERSISTENCE_CHECK] ⚠️ Bot reply sin conversationId - sid: ${session.id?.substring(0, 20)}..., text: ${text.substring(0, 50)}...`);
    }
  }
  
  return entry;
}


// ========================================================
// 🔐 CSRF VALIDATION MIDDLEWARE (Production-Ready)
// ========================================================
// validateCSRF está declarado más abajo (línea ~1054) con implementación completa

function generateRequestId() {
  return `req-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

// ========================================================
// Configuration & Clients
// ========================================================
// Validar variables de entorno críticas
if (!process.env.OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY no configurada. Funciones de IA deshabilitadas.');
}
if (!process.env.ALLOWED_ORIGINS) {
  console.warn('[WARN] ALLOWED_ORIGINS no configurada. Usando valores por defecto.');
}
if (!process.env.LOG_TOKEN && process.env.NODE_ENV !== 'production') {
  console.warn('[WARN] LOG_TOKEN no configurado. Endpoints admin (/api/logs, /api/metrics, /api/transcript, /api/logs/stream) quedarán deshabilitados.');
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ENABLE_IMAGE_REFS = process.env.ENABLE_IMAGE_REFS !== 'false'; // Default: true
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const OA_NAME_REJECT_CONF = Number(process.env.OA_NAME_REJECT_CONF || 0.75);
let DEBUG_CHAT = process.env.DEBUG_CHAT === '1';
let DEBUG_IMAGES = process.env.DEBUG_IMAGES === '1';

// ========================================================
// 🔒 VALIDATION LIMITS (configurable por env)
// ========================================================
const MAX_TEXT_LEN = parseInt(process.env.MAX_TEXT_LEN || '4000', 10);
const MAX_SESSION_ID_LEN = parseInt(process.env.MAX_SESSION_ID_LEN || '32', 10);
const MAX_BUTTON_TOKEN_LEN = parseInt(process.env.MAX_BUTTON_TOKEN_LEN || '80', 10);
const MAX_IMAGE_REFS = parseInt(process.env.MAX_IMAGE_REFS || '3', 10);
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || String(8*1024*1024), 10); // 8MB
const MAX_IMAGE_URL_LEN = parseInt(process.env.MAX_IMAGE_URL_LEN || '2048', 10);

// ========================================================
// 🧠 MODO SUPER INTELIGENTE - AI-Powered Analysis
// ========================================================
const SMART_MODE_ENABLED = process.env.SMART_MODE !== 'false'; // Activado por defecto

/**
 * 🧠 Análisis Inteligente de Mensaje del Usuario
 * Usa OpenAI para comprender intención, extraer dispositivo/problema
 * 🔍 MODO VISIÓN: Procesa imágenes con GPT-4 Vision cuando están disponibles
 * ✨ NUEVA MEJORA: Normalización de texto y tolerancia a errores
 */
async function analyzeUserMessage(text, session, imageUrls = []) {
  if (!openai || !SMART_MODE_ENABLED) {
    return { analyzed: false, fallback: true };
  }

  try {
    console.log('[SMART_MODE] 🧠 Analizando mensaje con IA...');
    if (imageUrls.length > 0) {
      console.log('[VISION_MODE] 🔍 Modo visión activado -', imageUrls.length, 'imagen(es) detectada(s)');
    }
    
    // ========================================
    // 📝 NORMALIZACIÓN DEL TEXTO (tolerancia a errores)
    // ========================================
    const originalText = text;
    const normalizedText = normalizeUserInput(text);
    if (normalizedText !== text.toLowerCase().trim()) {
      console.log('[NORMALIZE] Original:', originalText);
      console.log('[NORMALIZE] Normalizado:', normalizedText);
    }
    
    // ========================================
    // 🌍 DETECCIÓN DE IDIOMA
    // ========================================
    const locale = session.userLocale || 'es-AR';
    const isEnglish = locale.toLowerCase().startsWith('en');
    const language = isEnglish ? 'English' : 'Español (Argentina)';
    
    const conversationContext = session.transcript.slice(-6).map(msg => 
      `${msg.who === 'user' ? 'Usuario' : 'Bot'}: ${msg.text}`
    ).join('\n');
    
    // ========================================
    // 🔍 ANÁLISIS CON VISIÓN si hay imágenes
    // ========================================
    if (imageUrls.length > 0) {
      console.log('[VISION_MODE] 🖼️ Procesando imágenes con GPT-4 Vision...');
      
      const visionPrompt = `Sos Tecnos, un asistente técnico experto de STI (Argentina). El usuario te envió imagen(es) de su problema técnico.

**IDIOMA DE RESPUESTA:** ${language}
**TONO:** ${isEnglish ? 'Professional, empathetic, clear' : 'Profesional argentino, empático, claro, voseo (contame, fijate, podés)'}

**CONTEXTO DE LA CONVERSACIÓN:**
${conversationContext}

**MENSAJE DEL USUARIO:** "${originalText || 'Ver imagen adjunta'}"
**TEXTO NORMALIZADO:** "${normalizedText}"

**TAREAS OBLIGATORIAS:**
1. 🔍 Analizá TODAS las imágenes en detalle máximo
2. 📝 Si hay texto visible → léelo completo y transcribilo
3. 🖥️ Identificá dispositivo exacto (marca, modelo, tipo)
4. ⚠️ Detectá problema técnico específico
5. 🎯 Determiná urgencia real
6. 💡 Sugerí 2-3 pasos concretos y accionables
7. 🧠 Inferí causas probables del problema

**IMPORTANTE:** 
- NUNCA digas "no puedo ver imágenes" - SIEMPRE analizás
- Si ves código de error → transcribilo exacto
- Si ves configuración → extraé valores clave
- Si está borroso → pedí mejor foto pero mencioná lo que SÍ ves

**Respondé en JSON con TODA la información:**
{
  "imagesAnalyzed": true,
  "language": "${language}",
  "visualContent": {
    "description": "descripción técnica detallada de cada imagen",
    "textDetected": "TODO el texto visible (OCR completo)",
    "errorMessages": ["cada mensaje de error exacto"],
    "errorCodes": ["códigos específicos si hay"],
    "technicalDetails": "specs, config, estado del sistema",
    "imageQuality": "excellent|good|fair|poor|blurry"
  },
  "device": {
    "detected": true,
    "type": "notebook|desktop|monitor|smartphone|tablet|printer|router|server|other",
    "brand": "marca exacta si es visible",
    "model": "modelo si es visible",
    "confidence": 0.0-1.0
  },
  "problem": {
    "detected": true,
    "summary": "descripción específica y técnica del problema",
    "category": "hardware|software|connectivity|performance|display|storage|security|other",
    "urgency": "low|medium|high|critical",
    "possibleCauses": ["causa técnica 1", "causa técnica 2", "causa técnica 3"],
    "affectedComponents": ["componente 1", "componente 2"]
  },
  "intent": "diagnose_problem|ask_question|show_config|report_error|other",
  "confidence": 0.0-1.0,
  "sentiment": "neutral|worried|frustrated|angry|calm",
  "needsHumanHelp": true/false,
  "nextSteps": [
    "paso 1 concreto y accionable",
    "paso 2 concreto y accionable", 
    "paso 3 concreto y accionable"
  ],
  "suggestedResponse": "${isEnglish ? 'empathetic AND technical response based on what you SEE' : 'respuesta empática Y técnica basada en lo que VES, con voseo argentino'}"
}`;

      // Construir mensaje con imágenes
      const messageContent = [
        { type: 'text', text: visionPrompt }
      ];
      
      // Agregar cada imagen
      for (const imgUrl of imageUrls) {
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: imgUrl,
            detail: 'high' // Máxima calidad de análisis
          }
        });
        console.log('[VISION_MODE] 📸 Agregada imagen al análisis:', imgUrl);
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Usar GPT-4 con visión
        messages: [{ 
          role: 'user', 
          content: messageContent 
        }],
        temperature: 0.3, // Baja = más preciso técnicamente
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      console.log('[VISION_MODE] ✅ Análisis visual completado:', {
        imagesAnalyzed: analysis.imagesAnalyzed,
        device: analysis.device?.type,
        problem: analysis.problem?.summary,
        textDetected: analysis.visualContent?.textDetected ? 'SÍ' : 'NO',
        confidence: analysis.confidence
      });

      return { 
        analyzed: true, 
        hasVision: true, 
        originalText,
        normalizedText,
        ...analysis 
      };
    }
    
    // ========================================
    // 📝 ANÁLISIS SIN IMÁGENES (modo texto)
    // ========================================
    const analysisPrompt = `Sos Tecnos, un asistente técnico experto de STI (Argentina) analizando una conversación de soporte.

**IDIOMA:** ${language}
**TONO:** ${isEnglish ? 'Professional, empathetic' : 'Profesional argentino con voseo (contame, fijate, podés)'}

**CONTEXTO PREVIO:**
${conversationContext}

**MENSAJE ORIGINAL:** "${originalText}"
**TEXTO NORMALIZADO:** "${normalizedText}"

**ANÁLISIS REQUERIDO:**
Detectá intención, dispositivo probable, problema, sentimiento y urgencia.
Tolerá errores ortográficos y frases ambiguas.
Usá el texto normalizado para mejor comprensión.

**Respondé en JSON:**
{
  "intent": "diagnose_problem|ask_question|express_frustration|confirm|cancel|greeting|other",
  "confidence": 0.0-1.0,
  "device": {
    "detected": true/false,
    "type": "notebook|desktop|monitor|smartphone|tablet|printer|router|other",
    "confidence": 0.0-1.0,
    "ambiguous": true/false,
    "inferredFrom": "qué palabras usaste para detectarlo"
  },
  "problem": {
    "detected": true/false,
    "summary": "problema específico detectado",
    "category": "hardware|software|connectivity|performance|display|storage|other",
    "urgency": "low|medium|high|critical",
    "keywords": ["palabras clave detectadas"]
  },
  "sentiment": "positive|neutral|negative|frustrated|angry",
  "needsHumanHelp": true/false,
  "language": "${language}",
  "suggestedResponse": "${isEnglish ? 'natural empathetic response' : 'respuesta natural y empática con voseo argentino'}",
  "useStructuredFlow": true/false,
  "clarificationNeeded": true/false
}`;

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    console.log('[SMART_MODE] ✅ Análisis de texto completado:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      device: analysis.device?.type,
      problem: analysis.problem?.summary,
      needsHuman: analysis.needsHumanHelp
    });

    return { 
      analyzed: true, 
      hasVision: false, 
      originalText,
      normalizedText,
      ...analysis 
    };
    
  } catch (error) {
    console.error('[SMART_MODE] ❌ Error en análisis:', error.message);
    return { analyzed: false, error: error.message };
  }
}

/**
 * 🎯 Generador de Respuesta Inteligente
 * Genera respuestas naturales basadas en contexto
 * 🔍 MODO VISIÓN: Responde basándose en lo que VIO en las imágenes
 * 🇦🇷 TONO ARGENTINO: Usa voseo profesional (contame, fijate, podés)
 */
async function generateSmartResponse(analysis, session, context = {}) {
  if (!openai || !SMART_MODE_ENABLED || !analysis.analyzed) {
    return null;
  }

  try {
    console.log('[SMART_MODE] 💬 Generando respuesta inteligente...');
    if (analysis.hasVision) {
      console.log('[VISION_MODE] 🎨 Generando respuesta basada en análisis visual');
    }
    
    // ========================================
    // 🌍 CONFIGURACIÓN DE IDIOMA Y TONO
    // ========================================
    const locale = session.userLocale || 'es-AR';
    const isEnglish = locale.toLowerCase().startsWith('en');
    const userName = session.userName || (isEnglish ? 'friend' : 'amigo/a');
    
    // ========================================
    // 📚 CONTEXTO CONVERSACIONAL
    // ========================================
    const conversationHistory = session.transcript.slice(-8).map(msg =>
      `${msg.who === 'user' ? 'Usuario' : 'Tecnos'}: ${msg.text}`
    ).join('\n');
    
    // ========================================
    // 🔍 CONTEXTO VISUAL (si hay análisis de imágenes)
    // ========================================
    let visualContext = '';
    if (analysis.hasVision && analysis.visualContent) {
      const vc = analysis.visualContent;
      visualContext = `

📸 **INFORMACIÓN VISUAL DETECTADA:**
Descripción: ${vc.description || 'N/A'}
Texto visible (OCR): ${vc.textDetected || 'ninguno'}
Mensajes de error: ${vc.errorMessages?.length > 0 ? vc.errorMessages.join(', ') : 'ninguno'}
Códigos de error: ${vc.errorCodes?.length > 0 ? vc.errorCodes.join(', ') : 'ninguno'}
Detalles técnicos: ${vc.technicalDetails || 'N/A'}
Calidad de imagen: ${vc.imageQuality || 'N/A'}`;

      if (analysis.nextSteps && analysis.nextSteps.length > 0) {
        visualContext += `\nPróximos pasos sugeridos:\n${analysis.nextSteps.map((step, i) => `  ${i+1}. ${step}`).join('\n')}`;
      }
    }
    
    // ========================================
    // 🎯 PROMPT PARA GENERACIÓN DE RESPUESTA
    // ========================================
    const systemPrompt = `Sos Tecnos, el asistente técnico inteligente de STI (Servicio Técnico Inteligente) de Rosario, Argentina.

**PERSONALIDAD:**
- Profesional y confiable
- Empático y comprensivo
- Directo y claro (sin rodeos)
- Usa emojis con moderación (2-3 máximo)
- Evitá jerga técnica innecesaria
- Si el usuario está frustrado → mostrá empatía genuina

**TONO Y LENGUAJE:**
${isEnglish ? `
- Idioma: English
- Tone: Professional, friendly, clear
- Use "you" naturally
- Keep technical terms simple
` : `
- Idioma: Español (Argentina)
- Voseo obligatorio: "contame", "fijate", "podés", "tenés", "querés"
- NUNCA uses "tú" ni "puedes" ni "tienes"
- Ejemplos correctos: "¿Cómo estás?", "Contame qué pasó", "Fijate si podés probar esto"
- Natural y cercano pero profesional
`}

**CONTEXTO DEL USUARIO:**
- Nombre: ${userName}
- Idioma: ${isEnglish ? 'English' : 'Español (Argentina)'}
- Sentimiento actual: ${analysis.sentiment || 'neutral'}
- Dispositivo: ${analysis.device?.type || 'no detectado'}
- Problema: ${analysis.problem?.summary || 'no especificado'}
- Urgencia: ${analysis.problem?.urgency || 'desconocida'}${visualContext}

**CONVERSACIÓN PREVIA:**
${conversationHistory}

**ANÁLISIS IA COMPLETO:**
${JSON.stringify(analysis, null, 2)}

${analysis.hasVision ? `
⚠️ **CRÍTICO:** Acabás de VER la(s) imagen(es) que el usuario envió.
- Respondé basándote específicamente en lo que VISTE
- Mencioná detalles concretos de la imagen (texto, error, configuración)
- NUNCA digas "no puedo ver imágenes"
- Si había texto → incluilo en tu respuesta
- Si había error → explicá qué significa
` : ''}

**INSTRUCCIONES DE RESPUESTA:**
1. Sé claro y directo
2. Da pasos accionables (no vagos)
3. Si hay error técnico → explicalo en términos simples
4. Si necesita ayuda humana → preparalo para escalamiento
5. ${isEnglish ? 'Use natural English' : 'Usá voseo argentino SIEMPRE'}
6. Máximo 3-4 párrafos cortos
7. ${context.includeNextSteps ? 'Incluí 2-3 pasos concretos numerados' : ''}

**EJEMPLO DE RESPUESTA CORRECTA (ES-AR):**
"Veo que tu notebook tiene una pantalla azul con el error DRIVER_IRQL_NOT_LESS_OR_EQUAL 🔍

Este error está relacionado con un driver de red (tcpip.sys) que está causando problemas en Windows.

**Probá estos pasos:**
1. Reiniciá en Modo Seguro (F8 al iniciar)
2. Andá a Administrador de Dispositivos
3. Desinstalá el driver de red y reiniciá

¿Querés que te guíe paso a paso?"

${isEnglish ? '' : '**RECORDÁ:** Usá "contame", "fijate", "podés", "tenés", "querés" - NUNCA "puedes", "tienes", "cuéntame"'}`;

    const userPrompt = context.specificPrompt || (isEnglish 
      ? 'Respond to the user in a helpful and empathetic way.' 
      : 'Respondé al usuario de forma útil y empática.');

    const response = await openai.chat.completions.create({
      model: analysis.hasVision ? 'gpt-4o' : OPENAI_MODEL, // Usar GPT-4o si hubo visión
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7, // Balance creatividad/precisión
      max_tokens: 600
    });

    const smartReply = response.choices[0].message.content;
    console.log('[SMART_MODE] ✅ Respuesta generada:', smartReply.substring(0, 100) + '...');
    
    // ========================================
    // ✅ VALIDACIÓN DE VOSEO (solo para español)
    // ========================================
    if (!isEnglish) {
      const forbiddenWords = ['puedes', 'tienes', 'cuéntame', 'dime', 'quieres'];
      const found = forbiddenWords.filter(word => 
        smartReply.toLowerCase().includes(word)
      );
      
      if (found.length > 0) {
        console.warn('[VOSEO] ⚠️ Respuesta contiene palabras no argentinas:', found);
      }
    }
    
    return smartReply;
    
  } catch (error) {
    console.error('[SMART_MODE] ❌ Error generando respuesta:', error.message);
    return null;
  }
}

/**
 * 🤖 Decisión Inteligente: ¿Usar flujo estructurado o IA?
 * NUEVA LÓGICA: Fusión híbrida en lugar de elección binaria
 */
function shouldUseStructuredFlow(analysis, session) {
  // ========================================
  // SIEMPRE FLUJO ESTRUCTURADO (crítico)
  // ========================================
  if (!analysis.analyzed) return true; // Fallback si no hay análisis
  if (session.stage === 'ASK_LANGUAGE') return true; // Inicio siempre estructurado
  if (session.stage === 'ASK_NAME') return true; // Recolección de nombre
  if (analysis.intent === 'confirm' || analysis.intent === 'cancel') return true; // Confirmaciones
  
  // ========================================
  // PRIORIZAR IA (mejor experiencia)
  // ========================================
  
  // Si analizó imágenes → SIEMPRE usar respuesta IA basada en visión
  if (analysis.hasVision && analysis.imagesAnalyzed) {
    console.log('[DECISION] 🎨 Usando IA - Análisis visual disponible');
    return false;
  }
  
  // Si detectó frustración → IA con empatía
  if (analysis.sentiment === 'frustrated' || analysis.sentiment === 'negative') {
    console.log('[DECISION] 😔 Usando IA - Usuario frustrado');
    return false;
  }
  
  // Si necesita ayuda humana → IA para preparar escalamiento
  if (analysis.needsHumanHelp) {
    console.log('[DECISION] 🆘 Usando IA - Necesita ayuda humana');
    return false;
  }
  
  // Si problema crítico → IA con urgencia
  if (analysis.problem?.urgency === 'critical' || analysis.problem?.urgency === 'high') {
    console.log('[DECISION] ⚡ Usando IA - Problema urgente');
    return false;
  }
  
  // Si contexto ambiguo pero hay confianza media → IA ayuda a clarificar
  if (analysis.device?.ambiguous && analysis.confidence >= 0.5) {
    console.log('[DECISION] 🤔 Usando IA - Contexto ambiguo');
    return false;
  }
  
  // Si el análisis IA es muy confiable → usar IA
  if (analysis.confidence >= 0.8 && analysis.problem?.detected) {
    console.log('[DECISION] ✨ Usando IA - Alta confianza:', analysis.confidence);
    return false;
  }
  
  // ========================================
  // USAR FLUJO ESTRUCTURADO (default seguro)
  // ========================================
  console.log('[DECISION] 📋 Usando flujo estructurado - Confianza:', analysis.confidence || 'N/A');
  return true;
}

/**
 * 🧠 Corrector de Errores Ortográficos y Normalización
 * Mejora comprensión tolerando errores comunes
 */
function normalizeUserInput(text) {
  if (!text || typeof text !== 'string') return '';
  
  let normalized = text.toLowerCase().trim();
  
  // Correcciones comunes en español argentino
  const corrections = {
    // Errores comunes de dispositivos
    'note': 'notebook',
    'note book': 'notebook',
    'notbuk': 'notebook',
    'lap': 'notebook',
    'laptop': 'notebook',
    'compu': 'computadora',
    'pc de escritorio': 'desktop',
    'desk': 'desktop',
    'celu': 'celular',
    'cel': 'celular',
    'smartphone': 'celular',
    'fono': 'celular',
    'impre': 'impresora',
    'impresor': 'impresora',
    
    // Errores comunes de problemas
    'no prende': 'no enciende',
    'no prendia': 'no enciende',
    'no funciona': 'no funciona',
    'no funka': 'no funciona',
    'no anda': 'no funciona',
    'se tildo': 'se colgó',
    'se trabo': 'se colgó',
    'esta lenta': 'está lenta',
    'va lento': 'va lento',
    'no tengo internet': 'sin internet',
    'no hay internet': 'sin internet',
    'sin wifi': 'sin internet',
    
    // Palabras clave
    'ayuda': 'ayuda',
    'problema': 'problema',
    'error': 'error',
    'falla': 'falla'
  };
  
  // Aplicar correcciones
  for (const [wrong, correct] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    normalized = normalized.replace(regex, correct);
  }
  
  return normalized;
}

console.log('[SMART_MODE] 🧠 Modo Super Inteligente:', SMART_MODE_ENABLED ? '✅ ACTIVADO' : '❌ DESACTIVADO');

// Paths / persistence
const DATA_BASE = process.env.DATA_BASE || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR = process.env.TICKETS_DIR || path.join(DATA_BASE, 'tickets');
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_BASE, 'uploads');
const CONVERSATIONS_DIR = process.env.CONVERSATIONS_DIR || path.join(DATA_BASE, 'conversations');
const CONVERSATION_IDS_FILE = path.join(DATA_BASE, 'conversation_ids.jsonl');
const CONVERSATION_IDS_LOCK = path.join(DATA_BASE, 'conversation_ids.lock');
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/$/, '');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// SECURITY: Generar token seguro si no está configurado
// Permitir fallback desde `SSE_TOKEN` en .env para despliegues donde se use ese nombre
const LOG_TOKEN = process.env.LOG_TOKEN || process.env.SSE_TOKEN || crypto.randomBytes(32).toString('hex');

// A3: Fail fast en producción si falta LOG_TOKEN
const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.LOG_TOKEN) {
  console.error('[SECURITY CRITICAL] LOG_TOKEN requerido en producción. Abortando arranque.');
  process.exit(1);
}

if (!process.env.LOG_TOKEN) {
  const maskedToken = LOG_TOKEN.length > 12 
    ? `[masked:${LOG_TOKEN.length}chars]`
    : '***masked***';
  console.error('\n'.repeat(3) + '='.repeat(80));
  console.error('[SECURITY CRITICAL] ⚠️  LOG_TOKEN NOT CONFIGURED!');
  console.error('[SECURITY] Generated RANDOM token for this session ONLY.');
  console.error('[SECURITY] This token will change on every restart!');
  console.error('[SECURITY] ');
  console.error('[SECURITY] Current session token:', maskedToken);
  console.error('[SECURITY] ');
  console.error('[SECURITY] To fix: Add to your .env file:');
  console.error('[SECURITY] LOG_TOKEN=' + maskedToken);
  console.error('='.repeat(80) + '\n'.repeat(2));
}

function getAdminToken(req) {
  const h = String(req.headers.authorization || '');
  const bearer = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  return bearer || String(req.query?.token || '');
}
function isAdmin(req) {
  const tok = getAdminToken(req);
  return !!(process.env.LOG_TOKEN && tok && tok === String(LOG_TOKEN));
}

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR, UPLOADS_DIR, CONVERSATIONS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
}

// Índice de conversaciones para búsqueda rápida
const CONVERSATION_INDEX_FILE = path.join(CONVERSATIONS_DIR, 'index.json');

// Cargar índice al iniciar
let conversationIndex = { byId: {}, bySuffix: {} };
try {
  if (fs.existsSync(CONVERSATION_INDEX_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(CONVERSATION_INDEX_FILE, 'utf8'));
    conversationIndex = {
      byId: loaded.byId || {},
      bySuffix: loaded.bySuffix || {}
    };
  }
} catch (e) {
  console.warn('[CONVERSATION_INDEX] Error cargando índice:', e.message);
  conversationIndex = { byId: {}, bySuffix: {} };
}

// Guardar índice
function saveConversationIndex() {
  try {
    fs.writeFileSync(CONVERSATION_INDEX_FILE, JSON.stringify(conversationIndex, null, 2), 'utf8');
  } catch (e) {
    console.error('[CONVERSATION_INDEX] Error guardando índice:', e.message);
  }
}

// Actualizar índice con nueva conversación
function updateConversationIndex(conversationId, sid, createdAt) {
  if (!conversationId) return;
  
  const normalizedId = conversationId.trim().toUpperCase();
  conversationIndex.byId = conversationIndex.byId || {};
  conversationIndex.bySuffix = conversationIndex.bySuffix || {};
  
  // Actualizar por ID completo
  conversationIndex.byId[normalizedId] = {
    sid,
    createdAt,
    updatedAt: new Date().toISOString()
  };
  
  // Extraer sufijo numérico (ej: OT-4913 -> 4913)
  const suffixMatch = normalizedId.match(/-(\d+)$/);
  if (suffixMatch) {
    const suffix = suffixMatch[1];
    if (!conversationIndex.bySuffix[suffix]) {
      conversationIndex.bySuffix[suffix] = [];
    }
    if (!conversationIndex.bySuffix[suffix].includes(normalizedId)) {
      conversationIndex.bySuffix[suffix].push(normalizedId);
    }
  }
  
  saveConversationIndex();
}

// Guardar/actualizar meta de conversación
function saveConversationMeta(conversationId, session) {
  try {
    if (!conversationId) return;
    
    const normalizedId = conversationId.trim().toUpperCase();
    const metaFile = path.join(CONVERSATIONS_DIR, `${normalizedId}.meta.json`);
    
    const meta = {
      conversationId: normalizedId,
      sid: session.id || session.sid || null,
      createdAt: session.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userName: session.userName || null,
      device: session.device || null,
      language: session.userLocale || 'es-AR',
      stage: session.stage || null,
      needType: session.needType || null,
      isProblem: session.isProblem || false,
      isHowTo: session.isHowTo || false,
      problem: session.problem || null,
      issueKey: session.issueKey || null
    };
    
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');
    
    // Actualizar índice
    updateConversationIndex(normalizedId, meta.sid, meta.createdAt);
  } catch (error) {
    console.error(`[CONVERSATION_META] Error guardando meta para ${conversationId}:`, error.message);
  }
}

// Persistir evento de Consola FULL por conversationId
function persistConsoleEvent(conversationId, level, event, payload = {}) {
  try {
    if (!conversationId) return;
    
    const normalizedId = conversationId.trim().toUpperCase();
    const conversationFile = path.join(CONVERSATIONS_DIR, `${normalizedId}.jsonl`);
    
    const eventRecord = {
      ts: new Date().toISOString(),
      level,
      event,
      data: payload
    };
    
    const eventLine = JSON.stringify(eventRecord) + '\n';
    fs.appendFileSync(conversationFile, eventLine, 'utf8');
  } catch (error) {
    console.error(`[CONSOLE_EVENT] Error guardando evento para ${conversationId}:`, error.message);
  }
}

// Cargar IDs usados al iniciar el servidor (después de inicializar paths y asegurar directorios)
loadUsedConversationIds();

// A4: Escribir token de logs a archivo solo si está habilitado (opt-in)
if (process.env.WRITE_LOG_TOKEN_FILE === 'true') {
  try {
    const tokenPath = path.join(LOGS_DIR, 'log_token.txt');
    try { fs.writeFileSync(tokenPath, LOG_TOKEN, { mode: 0o600 }); } catch (e) { fs.writeFileSync(tokenPath, LOG_TOKEN); }
    console.log('[SECURITY] Wrote log token to', tokenPath);
  } catch (e) {
    console.warn('[SECURITY] Failed to write log token file:', e && e.message);
  }
}


// ========================================================
// 🔒 CORS CONFIGURATION (Production-ready)
// ========================================================
const ALLOWED_ORIGINS = [
  'https://stia.com.ar',
  'https://www.stia.com.ar',
  'http://localhost:3000',
  'http://localhost:5500'
];

if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://127.0.0.1:3000', 'http://127.0.0.1:5500');
}

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como Postman, curl, apps móviles)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[SECURITY] CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// ========================================================
// Metrics & Monitoring
// ========================================================
const metrics = {
  uploads: {
    total: 0,
    success: 0,
    failed: 0,
    totalBytes: 0,
    avgAnalysisTime: 0
  },
  chat: {
    totalMessages: 0,
    sessions: 0
  },
  errors: {
    count: 0,
    lastError: null
  }
};

function updateMetric(category, field, value) {
  if (metrics[category] && field in metrics[category]) {
    if (typeof value === 'number' && field !== 'lastError') {
      metrics[category][field] += value;
    } else {
      metrics[category][field] = value;
    }
  }
}

function getMetrics() {
  return {
    ...metrics,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
}

// ========================================================
// Logging & SSE helpers
// ========================================================
const sseClients = new Set();
const MAX_SSE_CLIENTS = 100;

// ========================================================
// EventBus + Ring Buffer para logs estructurados
// ========================================================
const LOG_RING_MAX = parseInt(process.env.LOG_RING_MAX || '2000', 10);
let LOG_RING = [];

/**
 * Sanitiza payload removiendo datos sensibles
 */
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  
  const sanitized = { ...payload };
  
  // Redactar csrfToken (solo primeros 6 caracteres)
  if (sanitized.csrfToken) {
    sanitized.csrfToken = sanitized.csrfToken.substring(0, 6) + '...';
  }
  
  // Remover cookies/headers de auth
  if (sanitized.cookies) delete sanitized.cookies;
  if (sanitized.headers) {
    const safeHeaders = { ...sanitized.headers };
    ['authorization', 'cookie', 'x-csrf-token'].forEach(key => {
      if (safeHeaders[key]) delete safeHeaders[key];
    });
    sanitized.headers = safeHeaders;
  }
  
  // Remover base64/images
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      if (value.includes('data:image') || value.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        sanitized[key] = '[REDACTED: base64/image]';
      }
      // Redactar texto de usuario completo (guardar solo longitud)
      if (key === 'text' || key === 'message' || key === 'userText') {
        sanitized[key + 'Len'] = value.length;
        delete sanitized[key];
      }
    }
  }
  
  // Best-effort: remover PII común
  const piiPatterns = [
    /\b\d{10,}\b/g, // teléfonos largos
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // emails
  ];
  
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      let cleaned = value;
      piiPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '[REDACTED]');
      });
      if (cleaned !== value) {
        sanitized[key] = cleaned;
      }
    }
  }
  
  return sanitized;
}

/**
 * Emite evento de log estructurado
 */
function emitLogEvent(level, event, payload = {}) {
  const sanitized = sanitizePayload(payload);
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitized
  };
  
  // Push a ring buffer y truncar
  LOG_RING.push(record);
  if (LOG_RING.length > LOG_RING_MAX) {
    LOG_RING = LOG_RING.slice(-LOG_RING_MAX);
  }
  
  // Emitir a clientes SSE conectados
  const eventData = `event: ${event}\ndata: ${JSON.stringify(record)}\n\n`;
  for (const client of Array.from(sseClients)) {
    try {
      client.write(eventData);
    } catch (e) {
      try { client.end(); } catch (_) { }
      sseClients.delete(client);
    }
  }
  
  // Persistir evento por conversationId si está disponible
  if (payload.conversationId || payload.sid) {
    // Intentar obtener conversationId desde payload o desde sesión
    let conversationId = payload.conversationId;
    if (!conversationId && payload.sid) {
      // Si no está en payload, intentar obtenerlo de la sesión (async, no bloqueante)
      getSession(payload.sid).then(session => {
        if (session?.conversationId) {
          persistConsoleEvent(session.conversationId, level, event, sanitized);
        }
      }).catch(() => {});
    } else if (conversationId) {
      persistConsoleEvent(conversationId, level, event, sanitized);
    }
  }
}
let logStream = null;
try {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
} catch (e) {
  console.error('[init] no pude abrir stream de logs', e && e.message);
}

const nowIso = () => new Date().toISOString();

const withOptions = obj => ({ options: [], ...obj });

// maskPII ya está importado desde flowLogger.js (línea 52)

// ========================================================
// 🎯 SISTEMA DE DESAMBIGUACIÓN DE DISPOSITIVOS
// ========================================================
// Importado desde deviceDetection.js (ver línea 54)
// ACTUALIZACIÓN 2025-11-25: DEVICE_DISAMBIGUATION y detectAmbiguousDevice() ahora están en módulo separado

/**
 * Genera botones de desambiguación para que el usuario elija dispositivo
 * @param {Array} candidates - Array de candidatos de DEVICE_DISAMBIGUATION
 * @returns {Array} - Array de botones formateados
 */
function generateDeviceButtons(candidates) {
  return candidates.map(device => ({
    token: `DEVICE_${device.id}`,
    icon: device.icon,
    label: device.label,
    description: device.description,
    text: device.label
  }));
}

function formatLog(level, ...parts) {
  const rawText = parts.map(p => {
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch (e) { return String(p); }
  }).join(' ');
  const text = maskPII(rawText);
  return `${new Date().toISOString()} [${level}] ${text}`;
}

function appendToLogFile(entry) {
  try {
    if (logStream && logStream.writable) {
      logStream.write(entry + '\n');
    } else {
      fs.appendFile(LOG_FILE, entry + '\n', 'utf8', () => { });
    }
  } catch (e) { /* noop */ }
}

function sseSend(res, eventData) {
  const payload = String(eventData || '');
  const safe = payload.split(/\r?\n/).map(line => `data: ${line}`).join('\n') + '\n\n';
  try { res.write(safe); } catch (e) { /* ignore */ }
}

function broadcastLog(entry) {
  for (const res of Array.from(sseClients)) {
    try {
      sseSend(res, entry);
    } catch (e) {
      try { res.end(); } catch (_) { }
      sseClients.delete(res);
    }
  }
}

function logMsg(...args) {
  try {
    let level = 'info';
    let parts = args;

    // Soportar logMsg("warn", "msg") y logMsg("msg")
    if (args.length >= 2) {
      const first = String(args[0] || '').toLowerCase();
      if (['info', 'warn', 'warning', 'error', 'debug'].includes(first)) {
        level = first === 'warning' ? 'warn' : first;
        parts = args.slice(1);
      }
    }

    const line = (typeof formatLog === 'function')
      ? formatLog(level, ...parts)
      : `[${level.toUpperCase()}] ${parts.map(p => String(p)).join(' ')}`;

    if (typeof appendToLogFile === 'function') appendToLogFile(line);
    if (typeof broadcastLog === 'function') broadcastLog(line);

    // fallback visible
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);

    return line;
  } catch (e) {
    try { console.log('[logMsg:fallback]', ...args); } catch (_) {}
    return null;
  }
}

/**
 * Probe public URL accessibility with timeout
 * @param {string} url - URL to probe
 * @param {number} timeoutMs - Timeout in milliseconds (default: 4000)
 * @returns {Promise<{ok: boolean, status: number|null, method: string, error?: string}>}
 */
async function probePublicUrl(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Try HEAD first (more efficient)
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'STI-Chat-Bot/1.0'
        }
      });
      clearTimeout(timeoutId);
      const ok = headResponse.status >= 200 && headResponse.status < 400;
      return {
        ok,
        status: headResponse.status,
        method: 'HEAD'
      };
    } catch (headErr) {
      // If HEAD fails (405 Method Not Allowed), try GET with Range
      if (headErr.name === 'AbortError') {
        clearTimeout(timeoutId);
        return { ok: false, status: null, method: 'HEAD', error: 'timeout' };
      }
      
      // Try GET with Range header (bytes=0-0) to avoid downloading full file
      try {
        const getResponse = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Range': 'bytes=0-0',
            'User-Agent': 'STI-Chat-Bot/1.0'
          }
        });
        clearTimeout(timeoutId);
        const ok = getResponse.status >= 200 && getResponse.status < 400;
        return {
          ok,
          status: getResponse.status,
          method: 'GET'
        };
      } catch (getErr) {
        clearTimeout(timeoutId);
        if (getErr.name === 'AbortError') {
          return { ok: false, status: null, method: 'GET', error: 'timeout' };
        }
        return { ok: false, status: null, method: 'GET', error: getErr.message || 'fetch_error' };
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      status: null,
      method: 'HEAD',
      error: err.name === 'AbortError' ? 'timeout' : (err.message || 'unknown_error')
    };
  }
}

/**
 * Validation helpers (reutilizables, sin deps nuevas)
 */
function asString(v) {
  return (typeof v === 'string') ? v : '';
}

function clampLen(s, max) {
  return s.length > max ? s.slice(0, max) : s;
}

function isSafeId(s) {
  // compatible: IDs tipo KU8006, D1986, etc + guion/underscore si ya existen
  return typeof s === 'string'
    && s.length >= 3
    && s.length <= MAX_SESSION_ID_LEN
    && /^[A-Za-z0-9_-]+$/.test(s);
}

function safeSessionId(inputSid, fallbackSid) {
  const sid = asString(inputSid).trim();
  if (!sid) return fallbackSid;
  if (!isSafeId(sid)) return fallbackSid;  // SOFT: fallback, no 400
  return sid;
}

function badRequest(res, code, message, extra = {}) {
  return res.status(400).json({ ok: false, code, message, ...extra });
}

function tooLarge(res, code, message, extra = {}) {
  return res.status(413).json({ ok: false, code, message, ...extra });
}

function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

// Wrap console
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => {
  try { _origLog(...args); } catch (_) { }
  try {
    const entry = formatLog('INFO', ...args);
    appendToLogFile(entry);
    broadcastLog(entry);
  } catch (e) { /* noop */ }
};
console.error = (...args) => {
  try { _origErr(...args); } catch (_) { }
  try {
    const entry = formatLog('ERROR', ...args);
    appendToLogFile(entry);
    broadcastLog(entry);
  } catch (e) { /* noop */ }
};

// ========================================================
// Embedded chat config (UI, NLP, steps)
// ========================================================
const EMBEDDED_CHAT = {
  version: 'v7',
  messages_v4: {
    greeting: { name_request: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?' }
  },
  settings: {
    OA_MIN_CONF: '0.6',
    whatsapp_ticket: { prefix: 'Hola STI. Vengo del chat web. Dejo mi consulta:' }
  },
  // ============================================
  // 🔒 PROTECCIÓN ACTIVA - NO MODIFICAR SIN AUTORIZACIÓN
  // ============================================
  // BLOQUE: Definiciones de tokens de botones UI
  // Propósito: Tokens centralizados para sistema de botones del flujo conversacional
  // Funcionalidad: 5 opciones principales de servicio (Problema, Asistencia, Configuración, Guías, Consulta)
  // Autor: Sistema STI - GitHub Copilot + Lucas
  // Última modificación: 25/11/2025
  // 
  // ADVERTENCIA: Estos tokens se usan en 3 lugares críticos:
  //   1. Detección de intent (línea ~3675)
  //   2. Renderizado de botones (líneas ~3785, ~3920)
  //   3. buildUiButtonsFromTokens (5 ubicaciones)
  // Modificar sin actualizar todas las referencias causará botones rotos.
  // ============================================
  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #7
  // ========================================================
  // ⚠️  ADVERTENCIA: Esta configuración está funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y OPTIMIZADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. ESTE ES EL SISTEMA DE 2 BOTONES SIMPLIFICADO
  //    2. NO agregar más botones sin actualizar lógica de detección (línea ~3700)
  //    3. NO cambiar tokens sin actualizar handlers (línea ~3720)
  //    4. Las propiedades description/example se renderizan en frontend
  //
  // 📋 Funcionalidad protegida:
  //    - BTN_PROBLEMA: Diagnóstico y solución de problemas técnicos
  //    - BTN_CONSULTA: Instalaciones, configuraciones, guías, ayuda
  //    - Sistema consolidado de 5 → 2 categorías principales
  //
  // 🔗 Dependencias:
  //    - Frontend: renderButtons() en index.php usa description/example
  //    - Backend: Lógica de detección en ASK_NEED (línea ~3700)
  //    - Greetings: Arrays de botones en líneas ~3850 y ~4000
  //
  // 💡 UX Mejorado:
  //    - Usuarios ven solo 2 opciones claras
  //    - Cada botón muestra descripción y ejemplos de uso
  //    - Reducción de confusión (antes 5 botones similares)
  //
  // ========================================================
  ui: {
    buttons: [
      // Botones del flujo según Flujo.csv
      { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español (Argentina)', text: 'Español (Argentina)' },
      { token: 'BTN_LANG_ES_ES', label: '🌎 Español', text: 'Español (Latinoamérica)' },
      { token: 'BTN_LANG_EN', label: '🇬🇧 English', text: 'English' },
      { token: 'BTN_NO_NAME', label: 'Prefiero no decirlo 🙅', text: 'Prefiero no decirlo' },

      // ========================================================
      // 🎯 BOTONES PRINCIPALES (2 CATEGORÍAS SIMPLIFICADAS)
      // ========================================================
      { token: 'BTN_PROBLEMA', label: '🔧 Solucionar / Diagnosticar Problema', text: 'tengo un problema' },
      { token: 'BTN_CONSULTA', label: '💡 Consulta / Asistencia Informática', text: 'tengo una consulta' },
      // ========================================================

      { token: 'BTN_DESKTOP', label: 'Desktop 💻', text: 'desktop' },
      { token: 'BTN_ALLINONE', label: 'All-in-One 🖥️', text: 'all in one' },
      { token: 'BTN_NOTEBOOK', label: 'Notebook 💼', text: 'notebook' },
      { token: 'BTN_SOLVED', label: '👍 Ya lo solucioné', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: '❌ Todavía no funciona', text: 'el problema persiste' },
      { token: 'BTN_ADVANCED_TESTS', label: '🔬 Pruebas Avanzadas', text: 'pruebas avanzadas' },
      { token: 'BTN_MORE_TESTS', label: '🔍 Más pruebas', text: 'más pruebas' },
      { token: 'BTN_TECH', label: '🧑‍💻 Técnico real', text: 'hablar con técnico' },
      { token: 'BTN_MORE', label: '🔍 Más pruebas', text: 'más pruebas' },
      { token: 'BTN_HELP_1', label: 'Ayuda paso 1', text: 'ayuda paso 1' },
      { token: 'BTN_HELP_2', label: 'Ayuda paso 2', text: 'ayuda paso 2' },
      { token: 'BTN_HELP_3', label: 'Ayuda paso 3', text: 'ayuda paso 3' },
      { token: 'BTN_HELP_4', label: 'Ayuda paso 4', text: 'ayuda paso 4' },
      { token: 'BTN_REPHRASE', label: 'Cambiar problema', text: 'cambiar problema' },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', text: 'cerrar chat' },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', text: 'enviar por whatsapp' },
      { token: 'BTN_CONNECT_TECH', label: '👨‍🏭 Conectar con Técnico', text: 'conectar con técnico' },
      { token: 'BTN_CONFIRM_TICKET', label: 'Sí, generar ticket ✅', text: 'sí, generar ticket' },
      { token: 'BTN_CANCEL', label: 'Cancelar ❌', text: 'cancelar' },
      { token: 'BTN_MORE_SIMPLE', label: 'Explicar más simple', text: 'explicalo más simple' },
      // Botones de problemas frecuentes
      { token: 'BTN_NO_ENCIENDE', label: '🔌 El equipo no enciende', text: 'el equipo no enciende' },
      { token: 'BTN_NO_INTERNET', label: '📡 Problemas de conexión a Internet', text: 'problemas de conexión a internet' },
      { token: 'BTN_LENTITUD', label: '🐢 Lentitud del sistema operativo o del equipo', text: 'lentitud del sistema' },
      { token: 'BTN_BLOQUEO', label: '❄️ Bloqueo o cuelgue de programas', text: 'bloqueo de programas' },
      { token: 'BTN_PERIFERICOS', label: '🖨️ Problemas con periféricos externos', text: 'problemas con periféricos' },
      { token: 'BTN_VIRUS', label: '🛡️ Infecciones de malware o virus', text: 'infecciones de virus' },
      // device tokens
      { token: 'BTN_DEV_PC_DESKTOP', label: 'PC de escritorio', text: 'pc de escritorio' },
      { token: 'BTN_DEV_PC_ALLINONE', label: 'PC All in One', text: 'pc all in one' },
      { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', text: 'notebook' }
    ],
    states: {}
  },
  nlp: {
    devices: [
      { key: 'pc', rx: '\\b(pc|computadora|ordenador)\\b' },
      { key: 'notebook', rx: '\\b(notebook|laptop)\\b' },
      { key: 'router', rx: '\\b(router|modem)\\b' },
      { key: 'fire_tv', rx: '\\b(fire ?tv|fire ?stick|amazon fire tv)\\b' },
      { key: 'chromecast', rx: '\\b(chromecast|google tv|google tv stick)\\b' },
      { key: 'roku', rx: '\\b(roku|roku tv|roku stick)\\b' },
      { key: 'android_tv', rx: '\\b(android tv|mi tv stick|tv box)\\b' },
      { key: 'apple_tv', rx: '\\b(apple tv)\\b' },
      { key: 'smart_tv_samsung', rx: '\\b(smart ?tv samsung|samsung tv)\\b' },
      { key: 'smart_tv_lg', rx: '\\b(smart ?tv lg|lg tv)\\b' },
      { key: 'smart_tv_sony', rx: '\\b(smart ?tv sony|sony tv)\\b' }
    ],
    issues: [
      { key: 'no_prende', rx: '\\b(no\\s*enciende|no\\s*prende|no\\s*arranca|mi\\s*pc\\s*no\\s*enciende)\\b', label: 'no enciende' }
    ],
    advanced_steps: {
      no_prende: [
        'Verificá que el cable de alimentación esté correctamente conectado a la computadora y a la toma de corriente.',
        'Asegurate de que el interruptor de la fuente de alimentación (si tiene) esté encendido.',
        'Intentá presionar el botón de encendido durante unos segundos para ver si responde.',
        'Desconectá todos los dispositivos externos (USB, impresoras, etc.) y volvé a intentar encender la PC.'
      ]
    },
    issue_labels: { no_prende: 'no enciende' }
  }
};

let CHAT = EMBEDDED_CHAT || {};

// Helpers: button definitions
function getButtonDefinition(token) {
  if (!token || !CHAT?.ui?.buttons) return null;
  return CHAT.ui.buttons.find(b => String(b.token) === String(token)) || null;
}

// Obtener etiquetas de botones de dispositivos según idioma
function getDeviceButtonLabel(token, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  const deviceLabels = {
    'BTN_DEV_PC_DESKTOP': isEn ? 'Desktop PC' : 'PC de escritorio',
    'BTN_DEV_PC_ALLINONE': isEn ? 'All-in-One PC' : 'PC All in One',
    'BTN_DEV_NOTEBOOK': isEn ? 'Notebook' : 'Notebook'
  };
  return deviceLabels[token] || null;
}

function buildUiButtonsFromTokens(tokens = [], locale = 'es-AR') {
  if (!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if (!t) return null;
    const def = getButtonDefinition(t);
    // Si es un botón de dispositivo, usar etiqueta según idioma
    const deviceLabel = getDeviceButtonLabel(String(t), locale);
    const label = deviceLabel || def?.label || def?.text || (typeof t === 'string' ? t : String(t));
    const text = def?.text || label;
    return { token: String(t), label, text };
  }).filter(Boolean);
}
function buildExternalButtonsFromTokens(tokens = [], urlMap = {}) {
  if (!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if (!t) return null;
    const def = getButtonDefinition(t);
    const label = def?.label || def?.text || String(t);
    const url = urlMap[String(t)] || null;
    return { token: String(t), label, url, openExternal: !!url };
  }).filter(Boolean);
}

// ========================================================
// NLP & Name utilities
// ========================================================
const NUM_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function emojiForIndex(i) { const n = i + 1; return NUM_EMOJIS[n] || `${n}.`; }
function enumerateSteps(arr) { if (!Array.isArray(arr)) return []; return arr.map((s, i) => `${emojiForIndex(i)} ${s}`); }
function normalizeStepText(s){ return String(s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;

const IT_HEURISTIC_RX = /\b(pc|computadora|compu|notebook|laptop|router|modem|wi[-\s]*fi|wifi|impresora|printer|tv\s*stick|stick\s*tv|amazon\s*stick|fire\s*stick|magistv|magis\s*tv|windows|android|correo|email|outlook|office|word|excel)\b/i;

const FRUSTRATION_RX = /(esto no sirve|no sirve para nada|qué porquería|que porquería|no funciona nada|estoy cansado de esto|me cansé de esto|ya probé todo|sigo igual|no ayuda|no me ayuda)/i;

// Regex para detectar cuando el usuario no quiere dar su nombre
const NO_NAME_RX = /(prefiero no|no quiero|no te lo|no dar|no digo|no decir|sin nombre|anonimo|anónimo|skip|saltar|omitir)/i;

const NAME_STOPWORDS = new Set([
  'hola', 'buenas', 'buenos', 'gracias', 'gracias!', 'gracias.', 'gracias,', 'help', 'ayuda', 'porfa', 'por favor', 'hola!', 'buenas tardes', 'buenas noches', 'buen dia', 'buen dí­a', 'si', 'no'
]);

const NAME_TOKEN_RX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,20}$/u;
const MAX_NAME_TOKENS = 3;
const MIN_NAME_TOKENS = 1;

function capitalizeToken(tok) {
  if (!tok) return tok;
  return tok.split(/[-'’\u2019]/).map(part => {
    if (!part) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('-');
}

function isValidName(text) {
  if (!text || typeof text !== 'string') return false;
  const s = String(text).trim();
  if (!s) return false;

  // reject digits or special symbols
  if (/[0-9@#\$%\^&\*\(\)_=\+\[\]\{\}\\\/<>]/.test(s)) return false;

  // reject if includes technical words
  if (TECH_WORDS.test(s)) return false;

  const lower = s.toLowerCase();
  for (const w of lower.split(/\s+/)) {
    if (NAME_STOPWORDS.has(w)) return false;
  }

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < MIN_NAME_TOKENS || tokens.length > MAX_NAME_TOKENS) return false;

  // if too many words overall -> reject
  if (s.split(/\s+/).filter(Boolean).length > 6) return false;

  // blacklist (trolls, apodos, palabras comunes)
  const blacklist = [
    'pepelito', 'papelito', 'pepito', 'probando', 'aaaa', 'jjjj', 'zzzz', 'asdasd', 'qwerty', 'basurita', 'basura', 'tuerquita', 'chuchuki',
    'corcho', 'coco', 'pepe', 'toto', 'nene', 'nena', 'pibe', 'piba', 'guacho', 'wacho', 'bobo', 'boludo', 'pelotudo',
    'chicle', 'goma', 'lapiz', 'papel', 'mesa', 'silla', 'puerta', 'ventana', 'techo', 'piso', 'pared',
    'amigo', 'amiga', 'hermano', 'hermana', 'primo', 'prima', 'tio', 'tia', 'abuelo', 'abuela',
    'test', 'testing', 'prueba', 'ejemplo', 'admin', 'usuario', 'user', 'cliente', 'persona',
    'hola', 'chau', 'gracias', 'perdon', 'disculpa', 'sorry', 'hello', 'bye'
  ];
  if (blacklist.includes(s.toLowerCase())) return false;

  for (const tok of tokens) {
    // each token must match token regex
    if (!NAME_TOKEN_RX.test(tok)) return false;
    // token stripped of punctuation should be at least 2 chars
    if (tok.replace(/['’\-]/g, '').length < 2) return false;
  }

  // passed validations
  return true;
}

const isValidHumanName = isValidName;

function extractName(text) {
  if (!text || typeof text !== 'string') return null;
  const sRaw = String(text).trim();
  if (!sRaw) return null;
  const s = sRaw.replace(/[.,!?]+$/, '').trim();

  // patterns: "me llamo X", "soy X", "mi nombre es X"
  const patterns = [
    /\b(?:me llamo|soy|mi nombre es|me presento como)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})$/i,
    /^\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})\s*$/i
  ];

  for (const rx of patterns) {
    const m = s.match(rx);
    if (m && m[1]) {
      let candidate = m[1].trim().replace(/\s+/g, ' ');
      // limit tokens to MAX_NAME_TOKENS
      const tokens = candidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
      const normalized = tokens.map(t => capitalizeToken(t)).join(' ');
      if (isValidName(normalized)) return normalized;
    }
  }

  // fallback: if the whole short text looks like a name
  const singleCandidate = s;
  if (isValidName(singleCandidate)) {
    const tokens = singleCandidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
    return tokens.map(capitalizeToken).join(' ');
  }

  return null;
}

function looksClearlyNotName(text) {
  if (!text || typeof text !== 'string') return true;
  const s = text.trim().toLowerCase();
  if (!s) return true;

  // clear short greetings
  if (s.length <= 6 && ['hola', 'hola!', 'buenas', 'buenos', 'buen día', 'buen dia'].includes(s)) return true;

  if (NAME_STOPWORDS.has(s)) return true;

  if (TECH_WORDS.test(s)) return true;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) return true;

  const indicators = ['mi', 'no', 'enciende', 'tengo', 'problema', 'problemas', 'se', 'me', 'con', 'esta', 'está', 'tiene'];
  for (const w of words) { if (indicators.includes(w)) return true; }

  return false;
}

// OpenAI name analyzer - RELAXED validation
async function analyzeNameWithOA(nameText = '') {
  if (!openai) return { isValid: true, confidence: 0.8, reason: 'fallback_accepted' };
  const prompt = [
    "Sos un validador de nombres humanos en español (Argentina).",
    "",
    "RECHAZÁ únicamente si es CLARAMENTE:",
    "- Palabras comunes de objetos: Mesa, Silla, Puerta, Celular, Teclado, etc.",
    "- Saludos o frases: Hola, Gracias, Buenos días, Chau, etc.",
    "- Palabras sin sentido: Aaaa, Zzzz, Asdasd, 123, etc.",
    "- Descripciones de problemas: 'tengo un problema', 'mi computadora', etc.",
    "",
    "ACEPTÁ si puede ser un nombre real, aunque sea un apodo o diminutivo:",
    "- Nombres comunes: María, Juan, Ana, Carlos, Raúl, Laura, José, Lucía, Diego, etc.",
    "- Apodos comunes que las personas usan: Pepe, Toto, Coco, Pancho, Lucho, Nico, etc.",
    "- Nombres cortos o diminutivos: Raul, Marcos, Franco, Mateo, etc.",
    "- Nombres compuestos: María Elena, Juan Carlos, Ana Laura, José Luis, etc.",
    "",
    "Ante la duda, ACEPTÁ el nombre.",
    "",
    "Respondé SOLO un JSON con {isValid: true|false, confidence: 0..1, reason: 'explicación clara'}.",
    `Texto a validar: "${String(nameText).replace(/"/g, '\\"')}"`
  ].join('\n');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g, '');
    try {
      const parsed = JSON.parse(raw);
      return {
        isValid: !!parsed.isValid,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
        reason: parsed.reason || ''
      };
    } catch (e) {
      console.error('[analyzeNameWithOA] parse error', e && e.message, 'raw:', raw);
      return { isValid: false, confidence: 0, reason: 'parse_error' };
    }
  } catch (e) {
    console.error('[analyzeNameWithOA] error', e && e.message);
    return { isValid: false, confidence: 0, reason: 'error' };
  }
}

// ========================================================
// OpenAI problem/steps helpers
// ========================================================

function getLocaleProfile(locale = 'es-AR') {
  const norm = (locale || '').toLowerCase();
  if (norm.startsWith('en')) {
    return {
      code: 'en',
      systemName: 'Tecnos',
      system: 'You are Tecnos, a friendly IT technician for STI — Servicio Técnico Inteligente. Answer ONLY in English (US). Be concise, empathetic and step-by-step.',
      shortLabel: 'English',
      voi: 'you',
      languageTag: 'en-US'
    };
  }
  if (norm.startsWith('es-') && !norm.includes('ar')) {
    return {
      code: 'es-419',
      systemName: 'Tecnos',
      system: 'Sos Tecnos, técnico informático de STI — Servicio Técnico Inteligente. Respondé en español neutro latino, de forma clara, amable y paso a paso, usando "tú" o expresiones neutras.',
      shortLabel: 'Español',
      voi: 'tú',
      languageTag: 'es-419'
    };
  }
  return {
    code: 'es-AR',
    systemName: 'Tecnos',
    system: 'Sos Tecnos, técnico informático argentino de STI — Servicio Técnico Inteligente. Respondé en español rioplatense (Argentina), usando voseo ("vos"), de forma clara, cercana y paso a paso.',
    shortLabel: 'Español (AR)',
    voi: 'vos',
    languageTag: 'es-AR'
  };
}

const OA_MIN_CONF = Number(process.env.OA_MIN_CONF || Number(CHAT?.settings?.OA_MIN_CONF || 0.6));

// Playbooks locales para dispositivos de streaming / SmartTV.
// Se usan como prioridad cuando hay match claro (sobre todo en español) antes de caer a OpenAI.
const DEVICE_PLAYBOOKS = {
  fire_tv: {
    boot_issue: {
      'es': [
        'Verificá que el Fire TV Stick esté bien conectado al puerto HDMI del televisor. Si tenés un alargue o adaptador, probá conectarlo directamente.',
        'Conectá el cable de alimentación del Fire TV Stick al adaptador de corriente original y enchufalo a un tomacorriente (evitá usar solo el USB del televisor).',
        'Prendé el televisor y seleccioná manualmente la entrada HDMI donde está conectado el Fire TV Stick.',
        'Si no ves nada en pantalla, desconectá el Fire TV Stick de la energía durante 30 segundos y volvé a conectarlo.',
        'Probá con otro puerto HDMI del televisor o, si es posible, en otro televisor para descartar problemas del puerto.'
      ],
      'en': [
        'Make sure the Fire TV Stick is firmly connected to the TV HDMI port. If you use an HDMI extender or adapter, try plugging it directly.',
        'Connect the power cable to the original Fire TV power adapter and plug it into a wall outlet (avoid using only the TV USB port).',
        'Turn on the TV and manually select the HDMI input where the Fire TV Stick is connected.',
        'If you see no image, unplug the Fire TV Stick from power for 30 seconds and plug it back in.',
        'If possible, try a different HDMI port or even a different TV to rule out HDMI port issues.'
      ]
    },
    wifi_connectivity: {
      'es': [
        'Desde la pantalla de inicio del Fire TV, andá a Configuración → Red.',
        'Elegí tu red WiFi y revisá que la contraseña esté bien escrita (prestá atención a mayúsculas y minúsculas).',
        'Si sigue fallando, reiniciá el router y el Fire TV Stick (desenchufá ambos 30 segundos).',
        'Acercá el Fire TV Stick al router o evitá obstáculos metálicos que puedan bloquear la señal.',
        'Si el problema persiste, probá conectar temporalmente a la zona WiFi de tu celular para descartar fallas del router.'
      ],
      'en': [
        'From the Fire TV home screen, go to Settings → Network.',
        'Select your Wi‑Fi network and double‑check the password (case sensitive).',
        'If it still fails, restart both the router and the Fire TV Stick (unplug them for 30 seconds).',
        'Try to move the Fire TV Stick closer to the router or remove big obstacles between them.',
        'If the issue persists, temporarily connect to your phone hotspot to rule out router problems.'
      ]
    }
  },
  chromecast: {
    boot_issue: {
      'es': [
        'Comprobá que el Chromecast esté conectado al puerto HDMI del televisor y al cargador original.',
        'Verificá que el televisor esté en la entrada HDMI correcta.',
        'Reiniciá el Chromecast: desconectalo de la energía 30 segundos y volvé a conectarlo.',
        'Si aparece la pantalla de inicio pero se queda colgado, intentá un reinicio desde la app Google Home.',
        'Si nada de esto funciona, probá en otro televisor o con otro cargador compatible.'
      ],
      'en': [
        'Check that the Chromecast is plugged into the TV HDMI port and into its original power adapter.',
        'Make sure the TV is set to the correct HDMI input.',
        'Restart the Chromecast: unplug it from power for 30 seconds and plug it back in.',
        'If you see the home screen but it freezes, try restarting it from the Google Home app.',
        'If nothing works, test it on a different TV or with a different compatible power adapter.'
      ]
    }
  },
  smart_tv_samsung: {
    wifi_connectivity: {
      'es': [
        'En el control remoto, presioná el botón Home y andá a Configuración → Red → Abrir configuración de red.',
        'Elegí WiFi, buscá tu red y escribí la contraseña con cuidado.',
        'Si no conecta, reiniciá el televisor manteniendo presionado el botón de encendido hasta que se apague y vuelva a encender.',
        'Reiniciá también el router desenchufándolo 30 segundos.',
        'Si seguís con problemas, probá conectar el televisor por cable de red (LAN) para descartar fallas de WiFi.'
      ],
      'en': [
        'On the remote, press Home and go to Settings → Network → Open Network Settings.',
        'Select Wireless, choose your Wi‑Fi network and enter the password carefully.',
        'If it still fails, restart the TV by holding the power button until it turns off and on again.',
        'Also restart the router by unplugging it for 30 seconds.',
        'If the issue persists, try connecting the TV using a LAN cable to rule out Wi‑Fi problems.'
      ]
    }
  }
};

// ========================================================
// 🔍 VALIDACIÓN DE PROBLEMA: Detectar si es solo dispositivo vs problema real
// ========================================================
/**
 * Normaliza el texto del problema para validación
 */
function normalizeProblem(problemText) {
  if (!problemText) return '';
  return String(problemText).toLowerCase().trim();
}

/**
 * Verifica si el problema es válido (no vacío, no genérico)
 */
function isValidProblem(problemText) {
  const normalized = normalizeProblem(problemText);
  if (!normalized || normalized.length < 3) return false;
  
  // Patrones que indican "sin problema" o "no especificado"
  const invalidPatterns = [
    /no se ha especificado/i,
    /sin problema/i,
    /n\/a/i,
    /na/i,
    /no hay problema/i,
    /ningún problema/i,
    /sin inconveniente/i,
    /no tengo problema/i,
    /no hay inconveniente/i
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(normalized)) return false;
  }
  
  return true;
}

/**
 * Detecta si el input parece ser solo dispositivo/modelo sin problema real
 * @param {string} userText - Texto del usuario
 * @param {string} detectedDevice - Dispositivo detectado por IA
 * @param {string} detectedModel - Modelo detectado por IA
 * @param {string} problemText - Problema detectado por IA
 */
function isDeviceOnly(userText, detectedDevice, detectedModel, problemText) {
  const text = String(userText || '').toLowerCase();
  const problem = normalizeProblem(problemText);
  
  // Si el problema es inválido, es probable que sea solo dispositivo
  if (!isValidProblem(problem)) {
    // Verificar si el texto contiene marcas/modelos comunes
    const deviceBrands = [
      'lenovo', 'dell', 'hp', 'hewlett', 'packard', 'asus', 'acer', 'samsung', 'lg', 'sony',
      'toshiba', 'apple', 'macbook', 'thinkpad', 'ideapad', 'inspiron', 'xps', 'pavilion',
      'envy', 'spectre', 'zenbook', 'vivobook', 'predator', 'nitro', 'chromebook'
    ];
    
    const hasBrand = deviceBrands.some(brand => text.includes(brand));
    
    // Verificar si contiene números que podrían ser modelos (ej: b550, 2720, c920)
    const hasModelNumber = /\b[a-z]?\d{3,5}\b/i.test(text);
    
    // Verificar si NO contiene verbos de falla
    const failureVerbs = [
      'no prende', 'no enciende', 'no funciona', 'no carga', 'se apaga', 'se reinicia',
      'pantalla azul', 'pantalla negra', 'error', 'falla', 'problema', 'no hay wifi',
      'no conecta', 'no imprime', 'no responde', 'se congela', 'se cuelga', 'lento',
      'ruido', 'calor', 'temperatura', 'no arranca', 'no bootea', 'no inicia'
    ];
    
    const hasFailureVerb = failureVerbs.some(verb => text.includes(verb));
    
    // Si tiene marca/modelo pero NO tiene verbo de falla, probablemente es solo dispositivo
    if ((hasBrand || hasModelNumber || detectedDevice || detectedModel) && !hasFailureVerb) {
      return true;
    }
  }
  
  return false;
}

async function analyzeProblemWithOA(problemText = '', locale = 'es-AR', imageUrls = []) {
  if (!openai) {
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }

  const profile = getLocaleProfile(locale);
  const trimmed = String(problemText || '').trim();
  if (!trimmed) {
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }

  const userText = trimmed.slice(0, 800);
  
  // Log imágenes si las hay
  if (imageUrls.length > 0) {
    console.log(`[analyzeProblemWithOA] Analizando con ${imageUrls.length} imagen(es)`);
  }

  const systemMsg = profile.system;

  // Si hay imágenes, modificar el prompt para incluir análisis visual
  let promptIntro = '';
  if (imageUrls.length > 0) {
    promptIntro = [
      '🖼️ ⚠️ ATENCIÓN: El usuario adjuntó imagen(es) del problema.',
      '',
      'INSTRUCCIONES ESPECIALES PARA IMÁGENES:',
      '1. PRIMERO describe en detalle qué ves en la imagen',
      '2. Identifica mensajes de error, ventanas, iconos, texto visible',
      '3. LUEGO combina esa información con el texto del usuario',
      '4. Finalmente clasifica basándote en AMBOS: imagen + texto',
      '',
      '⚠️ IMPORTANTE: La imagen tiene PRIORIDAD sobre el texto del usuario.',
      'Si el usuario dice algo vago como "tengo ese error" pero la imagen muestra',
      'un error específico (ej: archivo corrupto), usa la información de la IMAGEN.',
      '',
      'Ejemplos:',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📝 Usuario: "tengo ese error al abrir un archivo"',
      '🖼️ Imagen: Ventana de Windows con mensaje "Se eliminó el elemento..."',
      '✅ Clasificación: isProblem:true, issueKey:"archivo_corrupto", device:"pc"',
      '',
      '📝 Usuario: "problemas con la pantalla"',
      '🖼️ Imagen: Pantalla azul de Windows (BSOD) con STOP code',
      '✅ Clasificación: isProblem:true, issueKey:"error_pantalla", device:"pc"',
      '',
      '📝 Usuario: "no puedo conectarme"',
      '🖼️ Imagen: Error de red "Sin acceso a internet" en Windows',
      '✅ Clasificación: isProblem:true, issueKey:"wifi_connectivity", device:"pc"',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔍 ANÁLISIS DE LA IMAGEN:',
      '(Describe aquí qué ves en la imagen antes de clasificar)',
      ''
    ].join('\n');
  }

  const prompt = [
    promptIntro,
    'Analizá (o analiza) el siguiente mensaje de un usuario final y clasificalo como:',
    '1. PROBLEMA TÉCNICO: Algo no funciona, falla o tiene error',
    '2. SOLICITUD DE AYUDA: Necesita guía para hacer algo (instalar, configurar, conectar)',
    '3. NO INFORMÁTICO: No es tecnología',
    '',
    'Tu tarea es devolver SOLO JSON (sin explicación adicional), con este formato:',
    '{',
    '  "imageAnalysis": "Descripción detallada de lo que ves en la imagen (solo si hay imagen)" | null,',
    '  "isIT": boolean,',
    '  "isProblem": boolean,',
    '  "isHowTo": boolean,',
    '  "device": "pc" | "notebook" | "router" | "fire_tv" | "chromecast" | "roku" | "android_tv" | "apple_tv" | "smart_tv_samsung" | "smart_tv_lg" | "smart_tv_sony" | "smart_tv_generic" | "impresora" | "scanner" | "webcam" | "mouse" | "teclado" | "monitor" | null,',
    '  "issueKey": "no_prende" | "boot_issue" | "wifi_connectivity" | "no_funciona" | "error_config" | "error_archivo" | "archivo_corrupto" | "error_pantalla" | "install_guide" | "setup_guide" | "connect_guide" | "generic" | null,',
    '  "confidence": number between 0 and 1,',
    `  "language": "${profile.languageTag}"`,
    '}',
    '',
    'Ejemplos de PROBLEMAS (isProblem:true, isHowTo:false):',
    '- "mi compu no prende" → isIT:true, isProblem:true, device:"pc", issueKey:"no_prende"',
    '- "mi impresora no imprime" → isIT:true, isProblem:true, device:"impresora", issueKey:"no_funciona"',
    '- "el mouse no responde" → isIT:true, isProblem:true, device:"mouse", issueKey:"no_funciona"',
    '- "mi smart tv no se conecta al wifi" → isIT:true, isProblem:true, device:"smart_tv_generic", issueKey:"wifi_connectivity"',
    '- "error al abrir archivo" (imagen muestra archivo corrupto) → isIT:true, isProblem:true, device:"pc", issueKey:"archivo_corrupto"',
    '- "pantalla azul de Windows" (imagen muestra BSOD) → isIT:true, isProblem:true, device:"pc", issueKey:"error_pantalla"',
    '',
    'Ejemplos de SOLICITUDES DE AYUDA (isProblem:false, isHowTo:true):',
    '- "quiero instalar una impresora" → isIT:true, isProblem:false, isHowTo:true, device:"impresora", issueKey:"install_guide"',
    '- "necesito configurar mi impresora HP" → isIT:true, isProblem:false, isHowTo:true, device:"impresora", issueKey:"setup_guide"',
    '- "cómo conecto mi fire tv stick" → isIT:true, isProblem:false, isHowTo:true, device:"fire_tv", issueKey:"connect_guide"',
    '- "necesito instalar una webcam" → isIT:true, isProblem:false, isHowTo:true, device:"webcam", issueKey:"install_guide"',
    '- "ayuda para conectar el chromecast" → isIT:true, isProblem:false, isHowTo:true, device:"chromecast", issueKey:"setup_guide"',
    '',
    'Ejemplos de NO INFORMÁTICO (isIT:false):',
    '- "tengo un problema con la heladera" → isIT:false',
    '- "mi auto hace ruido" → isIT:false',
    '',
    'REGLAS IMPORTANTES:',
    '- Si el usuario dice "no funciona", "no prende", "error", "falla" → isProblem:true',
    '- Si el usuario dice "quiero", "necesito", "cómo", "ayuda para", "guía" → isHowTo:true',
    '- Si hay AMBOS (ej: "quiero instalar pero me da error") → isProblem:true, isHowTo:false (priorizar el problema)',
    '- Cualquier dispositivo electrónico/informático ES informático (isIT:true)',
    '',
    'Texto del usuario:',
    userText
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    // Construir mensaje con soporte para imágenes
    let userMessage;
    if (imageUrls.length > 0) {
      // Usar formato Vision API con imágenes
      const content = [
        { type: 'text', text: prompt }
      ];
      
      // Agregar cada imagen
      for (const imageUrl of imageUrls) {
        content.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      }
      
      userMessage = { role: 'user', content };
      console.log(`[analyzeProblemWithOA] Usando Vision API con ${imageUrls.length} imagen(es)`);
    } else {
      // Mensaje de texto simple
      userMessage = { role: 'user', content: prompt };
    }
    
    const r = await openai.chat.completions.create({
      model: imageUrls.length > 0 ? 'gpt-4o' : OPENAI_MODEL, // Usar gpt-4o si hay imágenes
      messages: [
        { role: 'system', content: systemMsg },
        userMessage
      ],
      temperature: 0,
      max_tokens: 300
    });
    clearTimeout(timeoutId);

    const raw = r?.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      const cleaned = raw.trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '');
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { isIT: false, isProblem: false, isHowTo: false, device: null, issueKey: null, confidence: 0 };
    }

    const isIT = !!parsed.isIT;
    const isProblem = !!parsed.isProblem;
    const isHowTo = !!parsed.isHowTo;
    const device = typeof parsed.device === 'string' ? parsed.device : null;
    const issueKey = typeof parsed.issueKey === 'string' ? parsed.issueKey : null;
    let confidence = Number(parsed.confidence || 0);
    if (!Number.isFinite(confidence) || confidence < 0) confidence = 0;
    if (confidence > 1) confidence = 1;
    
    // Extraer análisis de imagen si está presente
    const imageAnalysis = typeof parsed.imageAnalysis === 'string' ? parsed.imageAnalysis : null;
    if (imageAnalysis) {
      console.log('[analyzeProblemWithOA] 🖼️ Análisis de imagen recibido:', {
        hasAnalysis: true,
        length: imageAnalysis.length,
        preview: imageAnalysis.length > 0 ? 'present' : 'empty'
      });
    }

    return { isIT, isProblem, isHowTo, device, issueKey, confidence, imageAnalysis };
  } catch (err) {
    console.error('[analyzeProblemWithOA] error:', err?.message || err);
    return { isIT: false, isProblem: false, isHowTo: false, device: null, issueKey: null, confidence: 0 };
  }
}

async function aiQuickTests(problemText = '', device = '', locale = 'es-AR', avoidSteps = [], imageAnalysis = null) {
  const profile = getLocaleProfile(locale);
  const trimmed = String(problemText || '').trim();
  if (!openai || !trimmed) {
    const isEn = profile.code === 'en';
    if (isEn) {
      return [
        'Restart the device completely (turn it off, unplug it for 30 seconds and plug it back in).',
        'Check that all cables are firmly connected and there are no damaged connectors.',
        'Confirm that the device shows at least some sign of power (LED, sound or logo).',
        'If the problem persists, try a different power outlet or HDMI port if applicable.'
      ];
    }
    return [
      'Reiniciá el equipo por completo (apagalo, desenchufalo 30 segundos y volvé a enchufarlo).',
      'Revisá que todos los cables estén firmes y no haya fichas flojas o dañadas.',
      'Confirmá si el equipo muestra al menos alguna luz, sonido o logo al encender.',
      'Si el problema persiste, probá con otro tomacorriente o, si aplica, otro puerto HDMI.'
    ];
  }

  const userText = trimmed.slice(0, 800);
  const systemMsg = profile.system;
  const deviceLabel = device || 'dispositivo';
  
  // Agregar contexto de imagen si está disponible
  let imageContext = '';
  if (imageAnalysis) {
    imageContext = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🖼️ ANÁLISIS DE IMAGEN ADJUNTA:',
      imageAnalysis,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️ IMPORTANTE: Los pasos deben ser ESPECÍFICOS para el error mostrado en la imagen.',
      'NO generes pasos genéricos de reiniciar o revisar cables si la imagen muestra',
      'un error específico (ej: archivo corrupto, error de permisos, pantalla azul).',
      ''
    ].join('\n');
  }

  const prompt = [
    'Generá una lista corta de pasos numerados para ayudar a un usuario final a diagnosticar y resolver un problema técnico.',
    `El usuario habla en el idioma: ${profile.languageTag}.`,
    `Dispositivo (si se conoce): ${deviceLabel}.`,
    imageContext, // Incluir análisis de imagen aquí
    '',
    'IMPORTANTE:',
    '- Respondé SOLO en el idioma del usuario.',
    '- Devolvé la respuesta SOLO como un array JSON de strings (sin explicación extra).',
    '- Cada string debe describir un paso concreto, simple y seguro.',
    '- Evitá cualquier acción peligrosa o avanzada (no tocar BIOS, no usar comandos destructivos).',
    imageAnalysis ? '- Los pasos deben ser RELEVANTES al error específico mostrado en la imagen.' : '',
    '',
    // Si se recibieron pasos a evitar, pedí explícitamente no repetirlos
    (Array.isArray(avoidSteps) && avoidSteps.length) ? (`- NO repitas los siguientes pasos ya probados por el usuario: ${avoidSteps.map(s => '"' + String(s).replace(/\s+/g,' ').trim().slice(0,80) + '"').join(', ')}`) : '',
    '',
    'Ejemplo de formato de salida:',
    '["Paso 1: ...", "Paso 2: ...", "Paso 3: ..."]',
    '',
    'Texto del usuario (descripción del problema):',
    userText
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 400
    });
    clearTimeout(timeoutId);

    const raw = r?.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      const cleaned = raw.trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '');
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const isEn = profile.code === 'en';
      if (isEn) {
        return [
          'Restart the device and check if the problem persists.',
          'Verify cables and connections and check for visible damage.',
          'If possible, test the device on another TV, monitor or power outlet.',
          'If the problem persists, contact a technician with details.'
        ];
      }
      return [
        'Reiniciá el equipo y fijate si el problema sigue.',
        'Revisá cables y conexiones y verificá que no haya daño visible.',
        'Si podés, probá el equipo en otro televisor, monitor o enchufe.',
        'Si el problema continúa, contactá a un técnico y comentale estos pasos que ya probaste.'
      ];
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      return [];
    }
    return parsed.map(s => String(s)).slice(0, 6);
  } catch (err) {
    console.error('[aiQuickTests] error:', err?.message || err);
    const isEn = getLocaleProfile(locale).code === 'en';
    if (isEn) {
      return [
        'Restart the device completely (turn it off and unplug it for 30 seconds).',
        'Check connections (power, HDMI, network) and try again.',
        'If the problem persists, contact a technician with details of what you already tried.'
      ];
    }
    return [
      'Reiniciá el equipo por completo (apagalo y desenchufalo 30 segundos).',
      'Revisá conexiones (corriente, HDMI, red) y probá de nuevo.',
      'Si el problema continúa, contactá a un técnico con el detalle de lo que ya probaste.'
    ];
  }
}

async function explainStepWithAI(stepText = '', stepIndex = 1, device = '', problem = '', locale = 'es-AR') {
  const profile = getLocaleProfile(locale);
  const isEn = profile.code === 'en';
  if (!openai) {
    if (isEn) {
      return `Step ${stepIndex}: ${stepText}\n\nTry to perform it calmly. If something is not clear, tell me which part you did not understand and I will re-explain it in another way.`;
    }
    return `Paso ${stepIndex}: ${stepText}\n\nTratá de hacerlo con calma. Si hay algo que no se entiende, decime qué parte no te quedó clara y te la explico de otra forma.`;
  }

  const deviceLabel = device || (isEn ? 'device' : 'equipo');
  const userText = String(problem || '').trim().slice(0, 400);

  const systemMsg = profile.system;

  const prompt = [
    isEn
      ? 'You will help a non-technical user complete a specific troubleshooting step on a device.'
      : 'Vas a ayudar a una persona no técnica a completar un paso específico de diagnóstico en un equipo.',
    '',
    isEn
      ? 'Explain the step in a clear, calm and empathetic way, using simple language. The answer must be short and practical.'
      : 'Explicá el paso de forma clara, calma y empática, usando lenguaje simple. La respuesta tiene que ser corta y práctica.',
    '',
    isEn
      ? 'If needed, include small sub-steps or checks (bullets or short sentences), but focus only on this step.'
      : 'Si hace falta, incluí pequeños subpasos o chequeos (viñetas o frases cortas), pero enfocate solo en este paso.',
    '',
    isEn
      ? 'Do NOT mention dangerous actions (no BIOS, no registry edits, no risky commands).'
      : 'NO sugieras acciones peligrosas (nada de BIOS, ni registro de Windows, ni comandos riesgosos).',
    '',
    `Device: ${deviceLabel}`,
    userText ? (isEn ? `Problem summary: ${userText}` : `Resumen del problema: ${userText}`) : '',
    '',
    isEn
      ? `Step ${stepIndex} to explain: ${stepText}`
      : `Paso ${stepIndex} a explicar: ${stepText}`
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 400
    });
    clearTimeout(timeoutId);

    const raw = r?.choices?.[0]?.message?.content || '';
    return raw.trim();
  } catch (err) {
    console.error('[explainStepWithAI] error:', err?.message || err);
    if (isEn) {
      return `Step ${stepIndex}: ${stepText}\n\nTry to follow it calmly. If you get stuck, tell me exactly at which part you got blocked and I will guide you.`;
    }
    return `Paso ${stepIndex}: ${stepText}\n\nIntentá seguirlo con calma. Si te trabás en alguna parte, decime exactamente en cuál y te voy guiando.`;
  }
}

// Alias para compatibilidad
const getHelpForStep = explainStepWithAI;

// ========================================================
// Express app, endpoints, and core chat flow
// ========================================================
const app = express();

// ========================================================
// 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #4
// ========================================================
// ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
// 📅 Última validación: 25/11/2025
// ✅ Estado: FUNCIONAL Y TESTEADO
//
// 🚨 ANTES DE MODIFICAR:
//    1. Consultar con equipo de seguridad
//    2. Verificar que no rompa flujo de autenticación
//    3. Testear con y sin CSRF token
//    4. Validar rechazo 403 funciona correctamente
//
// 📋 Funcionalidad protegida:
//    - Validación de CSRF token en requests POST
//    - Skip para métodos seguros (GET, HEAD, OPTIONS)
//    - Verificación de token contra csrfTokenStore
//    - Expiración de tokens después de 1 hora
//    - Rechazo con 403 si token inválido/expirado
//
// 🔗 Dependencias:
//    - Frontend: sendButton() y sendMsg() deben enviar csrfToken
//    - Greeting: genera y almacena CSRF token inicial
//    - Security: Protección contra ataques CSRF
//    - Todos los endpoints POST dependen de esta validación
//
// ========================================================
// CSRF Validation Middleware
// ========================================================
function validateCSRF(req, res, next) {
  // Skip validación para métodos seguros (GET, HEAD, OPTIONS)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Detectar path del request (soporta diferentes formas de Express)
  const path = req.path || req.route?.path || (req.originalUrl ? new URL(req.originalUrl, 'http://localhost').pathname : '');
  const isHandshake = (path === '/api/greeting');

  const sessionId = req.sessionId;
  const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken;

  // Si no hay sesión, bloquear EXCEPTO en handshake (/api/greeting)
  if (!sessionId) {
    if (!isHandshake) {
      console.warn(`[CSRF] REJECTED - Missing sessionId:`);
      console.warn(`  IP: ${req.ip}`);
      console.warn(`  Method: ${req.method}`);
      console.warn(`  Path: ${req.path}`);
      return res.status(403).json({
        ok: false,
        error: 'CSRF_SESSION_REQUIRED'
      });
    }
    // Permitir handshake sin sessionId
    return next();
  }

  const stored = csrfStore.get(sessionId);

  // Token inválido o no existe
  if (!stored || stored.token !== csrfToken) {
    console.warn(`[CSRF] REJECTED - Invalid or missing token:`);
    console.warn(`  Session: ${sessionId}`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Method: ${req.method}`);
    console.warn(`  Path: ${req.path}`);
    console.warn(`  Token provided: ${csrfToken ? 'YES' : 'NO'}, token length: ${csrfToken ? csrfToken.length : 0}`);
    return res.status(403).json({
      ok: false,
      error: 'CSRF token inválido o expirado. Por favor recargá la página.'
    });
  }

  // Token expirado (1 hora de vida)
  if (Date.now() - stored.createdAt > 60 * 60 * 1000) {
    csrfStore.del(sessionId);
    console.warn(`[CSRF] REJECTED - Expired token: session=${sessionId}, age=${Math.floor((Date.now() - stored.createdAt) / 1000)}s`);
    return res.status(403).json({
      ok: false,
      error: 'CSRF token expirado. Por favor recargá la página.'
    });
  }

  // Token válido
  next();
}

// NOTA: validateCSRF se aplicará selectivamente en endpoints sensibles
// No se aplica globalmente para no bloquear /api/greeting inicial

// SECURITY: Helmet para headers de seguridad
// ========================================================
// 🛡️ HELMET: Security Headers (Producción Segura)
// ========================================================
app.use(helmet({
  contentSecurityPolicy: false, // Lo manejaremos manualmente para PWA
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // Para compatibilidad con PWA
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ========================================================
// 🔐 HTTPS FORZADO (Solo Producción)
// ========================================================
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers['x-forwarded-proto'];
    if (proto && proto !== 'https') {
      console.warn(`[SECURITY] ⚠️  HTTP request redirected to HTTPS: ${req.url}`);
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
  }
  next();
});

// ========================================================
// 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #5
// ========================================================
// ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
// 📅 Última validación: 25/11/2025
// ✅ Estado: FUNCIONAL Y TESTEADO
//
// 🚨 ANTES DE MODIFICAR:
//    1. Consultar con equipo de seguridad
//    2. Verificar que nuevos dominios son legítimos
//    3. NUNCA agregar '*' como origen permitido
//    4. Testear que rechaza null origin (previene file://)
//
// 📋 Funcionalidad protegida:
//    - Whitelist estricta de dominios permitidos
//    - Rechazo de origin null (ataques file://)
//    - Configuración credentials: true para cookies
//    - Localhost permitido solo en desarrollo
//    - Headers CORS correctamente configurados
//
// 🔗 Dependencias:
//    - Frontend: stia.com.ar debe estar en whitelist
//    - Security: Previene ataques CSRF cross-origin
//    - Environment: ALLOWED_ORIGINS en variables de entorno
//    - Todos los requests del frontend dependen de esta config
//
// ========================================================
// 🔒 CORS: WHITELIST ESTRICTA (Producción Ready)
// ========================================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://stia.com.ar', 'https://www.stia.com.ar'];

// Solo en desarrollo agregar localhost
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000'
  );
  console.log('[CORS] Development mode: localhost origins enabled');
}

// Lightweight bypass for logs endpoints: if the request targets /api/logs
// or /api/logs/stream and provides the correct token, allow CORS for that
// request. This keeps the strict whitelist for the rest of the app while
// allowing the admin UI (which may run on a different origin) to connect.
app.use((req, res, next) => {
  try {
    const isLogsPath = String(req.path || '').startsWith('/api/logs');
    if (isLogsPath && isAdmin(req)) {
      const logsAllowed = (process.env.LOGS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      const origin = String(req.headers.origin || '');
      if (origin && logsAllowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        return next();
      }
    }
  } catch (e) { /* ignore and proceed to normal CORS */ }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // SECURITY: Rechazar explícitamente origin null (puede ser ataque CSRF)
    if (origin === 'null' || origin === null) {
      console.warn(`[SECURITY] ⚠️  CORS blocked null origin (potential CSRF attack)`);
      return callback(new Error('CORS: null origin not allowed'), false);
    }

    // Permitir requests sin origin (para health checks, curl, Postman)
    // Estos requests NO tendrán credentials, así que son seguros
    if (!origin) {
      return callback(null, true);
    }

    // Validar contra whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`[SECURITY] 🚨 CORS VIOLATION: Unauthorized origin attempted access: ${origin}`);
      updateMetric('errors', 'count', 1);
      callback(new Error('CORS: origin not allowed'), false);
    }
  },
  credentials: true,
  maxAge: 86400, // 24 horas
  optionsSuccessStatus: 204
}));

// PERFORMANCE: Compression middleware (gzip/brotli)
app.use(compression({
  filter: (req, res) => {
    // No comprimir si el cliente no lo soporta
    if (req.headers['x-no-compression']) return false;
    // Comprimir solo respuestas >1KB
    return compression.filter(req, res);
  },
  threshold: 1024, // 1KB mínimo
  level: 6 // Balance entre velocidad y compresión
}));

app.use(express.json({
  limit: '10mb', // Aumentado para soportar imágenes en base64
  strict: true,
  verify: (req, res, buf) => {
    // Validate JSON structure
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({
  extended: false,
  limit: '10mb', // Aumentado para soportar imágenes
  parameterLimit: 100
}));

// Request ID middleware (para tracking y debugging)
app.use((req, res, next) => {
  const requestId = req.headers[REQUEST_ID_HEADER] || generateRequestId();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
});

// Session ID middleware (extract from header)
app.use((req, res, next) => {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
  if (sessionId && validateSessionId(sessionId)) {
    req.sessionId = sessionId;
  }
  next();
});

// Validar Content-Length (prevenir DOS)
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB máximo

  if (contentLength > maxSize) {
    console.warn(`[${req.requestId}] Content-Length excede límite: ${contentLength} bytes (${(contentLength / 1024 / 1024).toFixed(2)}MB)`);
    return res.status(413).json({ 
      ok: false, 
      error: 'payload_too_large',
      reply: '❌ Las imágenes son muy grandes. El tamaño total no puede superar 10MB. Intenta con imágenes más pequeñas o menos imágenes.'
    });
  }
  next();
});

// Error handler para PayloadTooLargeError
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    console.error(`[${req.requestId}] PayloadTooLargeError:`, err.message);
    return res.status(413).json({
      ok: false,
      error: 'payload_too_large',
      reply: '❌ Las imágenes son muy grandes. El tamaño total no puede superar 10MB. Intenta con imágenes más pequeñas.'
    });
  }
  next(err);
});

// Security headers + cache control
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Content Security Policy para PWA (Strict)
app.use((req, res, next) => {
  // CSP más estricto con nonces para inline scripts
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    `script-src 'self' 'nonce-${nonce}'; ` +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https://stia.com.ar https://api.openai.com https://sti-rosario-ai.onrender.com; " +
    "font-src 'self' data:; " +
    "media-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "upgrade-insecure-requests; " +
    "block-all-mixed-content; " +
    "manifest-src 'self' https://stia.com.ar; " +
    "worker-src 'self'; " +
    "child-src 'none'; " +
    `report-uri /api/csp-report; ` +
    "require-trusted-types-for 'script'; " +
    "trusted-types default;"
  );

  // Security headers completos (mejores prácticas 2024)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'); // 2 años
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // CORS más restrictivo
  const allowedOrigin = req.headers.origin;
  if (allowedOrigins.includes(allowedOrigin) || process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  next();
});

// Servir archivos estáticos de PWA con compression
app.use(express.static('public', {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Headers especiales según tipo de archivo
    if (filePath.endsWith('manifest.json')) {
      res.set('Content-Type', 'application/manifest+json');
      res.set('Cache-Control', 'public, max-age=3600'); // 1 hora
    } else if (filePath.endsWith('sw.js')) {
      res.set('Content-Type', 'application/javascript');
      res.set('Cache-Control', 'no-cache');
      res.set('Service-Worker-Allowed', '/');
    } else if (filePath.match(/\.(png|jpg|jpeg|svg|ico)$/)) {
      res.set('Cache-Control', 'public, max-age=2592000'); // 30 días para imágenes
    }
  }
}));

// ========================================================
// Rate Limiting per Endpoint (IP + Session based)
// ========================================================
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // REDUCIDO: 3 uploads por minuto (era 5)
  message: { ok: false, error: 'Demasiadas imágenes subidas. Esperá un momento antes de intentar de nuevo.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sessionId || req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] Upload blocked: IP=${req.ip}, Session=${req.sessionId}`);
    res.status(429).json({ ok: false, error: 'Demasiadas imágenes subidas. Esperá un momento.' });
  }
});

// ========================================================
// 🔐 RATE LIMITERS (Production-Ready)
// ========================================================

// Rate limit POR SESIÓN (previene abuse de bots)
const sessionMessageCounts = new Map(); // Map<sessionId, {count, resetAt}>

function checkSessionRateLimit(sessionId) {
  if (!sessionId) return { allowed: true };

  const now = Date.now();
  const data = sessionMessageCounts.get(sessionId);

  if (!data || data.resetAt < now) {
    // Nueva ventana
    sessionMessageCounts.set(sessionId, {
      count: 1,
      resetAt: now + (60 * 1000) // 1 minuto
    });
    return { allowed: true, remaining: 19 };
  }

  if (data.count >= 20) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((data.resetAt - now) / 1000) };
  }

  data.count++;
  return { allowed: true, remaining: 20 - data.count };
}

// Limpiar contadores antiguos cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [sid, data] of sessionMessageCounts.entries()) {
    if (data.resetAt < now) {
      sessionMessageCounts.delete(sid);
    }
  }
}, 5 * 60 * 1000);

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 50, // AUMENTADO: 50 mensajes por IP/minuto (el session limit es más restrictivo)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sessionId || req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] BLOCKED - Too many messages:`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Session: ${req.sessionId}`);
    console.warn(`  Path: ${req.path}`);
    updateMetric('errors', 'count', 1);
    res.status(429).json({
      ok: false,
      reply: '😅 Estás escribiendo muy rápido. Esperá un momento.',
      error: 'Demasiados mensajes. Esperá un momento.',
      retryAfter: 60
    });
  }
});

const greetingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // REDUCIDO: 5 inicios por minuto (era 10)
  message: { ok: false, error: 'Demasiados intentos de inicio. Esperá un momento.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] Greeting blocked: IP=${req.ip}`);
    res.status(429).json({ ok: false, error: 'Demasiados intentos. Esperá un momento.' });
  }
});

// ========================================================
// Multer configuration for image uploads
// ========================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Verificar que el directorio existe y es seguro
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o755 });
    }

    // Verificar permisos de escritura
    try {
      fs.accessSync(UPLOADS_DIR, fs.constants.W_OK);
      cb(null, UPLOADS_DIR);
    } catch (err) {
      console.error('[MULTER] Sin permisos de escritura en UPLOADS_DIR:', err);
      cb(new Error('No se puede escribir en el directorio de uploads'));
    }
  },
  filename: (req, file, cb) => {
    try {
      // Sanitizar nombre de archivo con mayor seguridad
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

      if (!allowedExts.includes(ext)) {
        return cb(new Error('Tipo de archivo no permitido'));
      }

      // Generar nombre único con timestamp y random
      const timestamp = Date.now();
      const random = crypto.randomBytes(8).toString('hex');
      const sessionId = validateSessionId(req.sessionId) ? req.sessionId.substring(0, 20) : 'anon';
      const safeName = `${sessionId}_${timestamp}_${random}${ext}`;

      // Verificar que el path final es seguro
      const fullPath = path.join(UPLOADS_DIR, safeName);
      if (!isPathSafe(fullPath, UPLOADS_DIR)) {
        return cb(new Error('Ruta de archivo no válida'));
      }

      cb(null, safeName);
    } catch (err) {
      console.error('[MULTER] Error generando nombre de archivo:', err);
      cb(new Error('Error procesando el archivo'));
    }
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 1, // Solo 1 archivo a la vez
    fields: 10, // Limitar campos
    fieldSize: 1 * 1024 * 1024, // 1MB por campo
    fieldNameSize: 100, // 100 bytes para nombres de campo
    parts: 20 // Limitar partes multipart
  },
  fileFilter: (req, file, cb) => {
    // SECURITY: Validar Content-Type del multipart (no solo MIME del archivo)
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return cb(new Error('Content-Type debe ser multipart/form-data'));
    }

    // Validar MIME type del archivo (doble validación)
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WebP)'));
    }

    // Validar extensión del archivo
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (!allowedExts.includes(ext)) {
      return cb(new Error('Extensión de archivo no permitida'));
    }

    // Validar nombre de archivo
    if (!file.originalname || file.originalname.length > 255) {
      return cb(new Error('Nombre de archivo inválido'));
    }

    // Prevenir path traversal en nombre
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new Error('Nombre de archivo contiene caracteres no permitidos'));
    }

    cb(null, true);
  }
});

// Servir archivos subidos estáticamente
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  etag: true
}));

// ========================================================
// Image Validation Utility
// ========================================================
async function validateImageFile(filePath) {
  try {
    // Read first bytes to check magic number
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(12);
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Check magic numbers
    const magicNumbers = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46, 0x38],
      webp: [0x52, 0x49, 0x46, 0x46] // "RIFF"
    };

    let isValid = false;
    for (const [type, magic] of Object.entries(magicNumbers)) {
      let matches = true;
      for (let i = 0; i < magic.length; i++) {
        if (buffer[i] !== magic[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      return { valid: false, error: 'Archivo no es una imagen válida' };
    }

    // Additional validation with sharp
    const metadata = await sharp(filePath).metadata();

    // Verificar dimensiones razonables
    if (metadata.width > 10000 || metadata.height > 10000) {
      return { valid: false, error: 'Dimensiones de imagen demasiado grandes' };
    }

    if (metadata.width < 10 || metadata.height < 10) {
      return { valid: false, error: 'Dimensiones de imagen demasiado pequeñas' };
    }

    return { valid: true, metadata };
  } catch (err) {
    return { valid: false, error: 'Error validando imagen: ' + err.message };
  }
}

// ========================================================
// Image Compression Utility
// ========================================================
async function compressImage(inputPath, outputPath) {
  try {
    const startTime = Date.now();
    await sharp(inputPath)
      .resize(1920, 1920, { // Max 1920px, mantiene aspect ratio
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 }) // Comprimir a 85% calidad
      .toFile(outputPath);

    const compressionTime = Date.now() - startTime;

    // Get file sizes
    const originalSize = fs.statSync(inputPath).size;
    const compressedSize = fs.statSync(outputPath).size;
    const savedBytes = originalSize - compressedSize;
    const savedPercent = ((savedBytes / originalSize) * 100).toFixed(1);

    logMsg(`[COMPRESS] ${path.basename(inputPath)}: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB (saved ${savedPercent}%) in ${compressionTime}ms`);

    return { success: true, originalSize, compressedSize, savedBytes, compressionTime };
  } catch (err) {
    console.error('[COMPRESS] Error:', err);
    return { success: false, error: err.message };
  }
}

// ========================================================
// Automatic Cleanup Job (runs daily at 3 AM)
// ========================================================
cron.schedule('0 3 * * *', async () => {
  logMsg('[CLEANUP] Iniciando limpieza automática de archivos antiguos...');

  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(UPLOADS_DIR);
    let deletedCount = 0;
    let freedBytes = 0;

    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.mtimeMs < sevenDaysAgo) {
        freedBytes += stats.size;
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    logMsg(`[CLEANUP] Completado: ${deletedCount} archivos eliminados, ${(freedBytes / 1024 / 1024).toFixed(2)}MB liberados`);
  } catch (err) {
    console.error('[CLEANUP] Error:', err);
  }
});

// Manual cleanup endpoint (protected)
app.post('/api/cleanup', async (req, res) => {
  const token = req.headers.authorization || req.query.token;
  if (token !== LOG_TOKEN) {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const daysOld = parseInt(req.body.daysOld || 7);
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(UPLOADS_DIR);
    let deletedCount = 0;
    let freedBytes = 0;

    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.mtimeMs < cutoffTime) {
        freedBytes += stats.size;
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    res.json({
      ok: true,
      deleted: deletedCount,
      freedMB: (freedBytes / 1024 / 1024).toFixed(2),
      daysOld
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Estados del flujo según Flujo.csv
const STATES = {
  ASK_LANGUAGE: 'ASK_LANGUAGE',
  ASK_NAME: 'ASK_NAME',
  ASK_NEED: 'ASK_NEED',
  CLASSIFY_NEED: 'CLASSIFY_NEED',
  ASK_DEVICE: 'ASK_DEVICE',
  ASK_PROBLEM: 'ASK_PROBLEM',
  DETECT_DEVICE: 'DETECT_DEVICE',
  ASK_HOWTO_DETAILS: 'ASK_HOWTO_DETAILS',
  GENERATE_HOWTO: 'GENERATE_HOWTO',
  BASIC_TESTS: 'BASIC_TESTS',
  ADVANCED_TESTS: 'ADVANCED_TESTS',
  ESCALATE: 'ESCALATE',
  CREATE_TICKET: 'CREATE_TICKET',
  TICKET_SENT: 'TICKET_SENT',
  ENDED: 'ENDED'
};

// Función para generar sessionId único
function generateSessionId() {
  return 'web-' + crypto.randomBytes(12).toString('hex');
}

// ========================================================
// Security: Input Validation & Sanitization
// ========================================================
function sanitizeInput(input, maxLength = 1000) {
  if (!input) return '';
  return String(input)
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'`]/g, '') // Remove potential XSS characters
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
}

function sanitizeFilePath(fileName) {
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

function isPathSafe(filePath, allowedDir) {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(allowedDir);
  return resolvedPath.startsWith(resolvedBase);
}

function validateSessionId(sid) {
  if (!sid || typeof sid !== 'string') {
    return false;
  }

  // Permitir tanto sesiones del servidor (srv-) como del cliente web (web-)
  if (!sid.startsWith('srv-') && !sid.startsWith('web-')) {
    return false;
  }

  // Para sesiones del servidor: formato srv-TIMESTAMP-HASH64
  if (sid.startsWith('srv-')) {
    if (sid.length !== 82) { // 4 + 1 + 13 + 1 + 64 = 83, pero verificar
      return false;
    }
    const sessionIdRegex = /^srv-\d{13}-[a-f0-9]{64}$/;
    return sessionIdRegex.test(sid);
  }

  // Para sesiones del cliente web: formato flexible
  // Ejemplos: web-heber-123456, web-lo123abc-xy9z0m, web-1234567890
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

function getSessionId(req) {
  const h = sanitizeInput(req.headers['x-session-id'] || '', 128);
  const b = sanitizeInput(req.body?.sessionId || req.body?.sid || '', 128);
  const q = sanitizeInput(req.query?.sessionId || req.query?.sid || '', 128);

  const sid = h || b || q;

  if (sid && validateSessionId(sid)) {
    return sid;
  }

  // Generate new session ID
  return generateSessionId();
}

// CSP Report endpoint (para monitorear violaciones)
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const report = req.body?.['csp-report'] || req.body;
  console.warn('[CSP_VIOLATION]', JSON.stringify(report, null, 2));

  // Log a archivo para análisis posterior
  const entry = `[${nowIso()}] CSP_VIOLATION: ${JSON.stringify(report)}\n`;
  try {
    fs.appendFile(path.join(LOGS_DIR, 'csp-violations.log'), entry, () => { });
  } catch (e) { /* noop */ }

  res.status(204).end();
});

// ========================================================
// Runtime debug toggles (PR-C)
// ========================================================
app.post('/api/logs/level', async (req, res) => {
  try {
    // Requerir LOG_TOKEN si existe
    if (LOG_TOKEN && !isAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Token requerido' });
    }
    
    const body = req.body || {};
    
    // Actualizar flags en memoria
    if (body.DEBUG_CHAT !== undefined) {
      DEBUG_CHAT = body.DEBUG_CHAT === 1 || body.DEBUG_CHAT === '1';
    }
    if (body.DEBUG_IMAGES !== undefined) {
      DEBUG_IMAGES = body.DEBUG_IMAGES === 1 || body.DEBUG_IMAGES === '1';
    }
    
    // Emitir evento de cambio
    emitLogEvent('info', 'LOG_LEVEL_CHANGED', {
      debugChat: DEBUG_CHAT,
      debugImages: DEBUG_IMAGES
    });
    
    res.json({
      ok: true,
      DEBUG_CHAT,
      DEBUG_IMAGES
    });
  } catch (e) {
    console.error('[logs/level] Error', e && e.message);
    res.status(500).json({ ok: false, error: e?.message || 'Unknown error' });
  }
});

// Transcript retrieval (REQUIERE AUTENTICACIÓN)
app.get('/api/transcript/:sid', async (req, res) => {
  // Validación: sid seguro
  if (!isSafeId(req.params.sid)) {
    return badRequest(res, 'BAD_SESSION_ID', 'Session ID inválido');
  }
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');

  // SECURITY: Validar que el usuario tenga permiso para ver este transcript
  const requestSessionId = req.sessionId || req.headers['x-session-id'];

  // Permitir solo si:
  // 1. El session ID del request coincide con el transcript solicitado
  // 2. O tiene un admin token válido
  if (sid !== requestSessionId && !isAdmin(req)) {
    console.warn(`[SECURITY] Unauthorized transcript access attempt: requested=${sid}, session=${requestSessionId}, IP=${req.ip}`);
    return res.status(403).json({ ok: false, error: 'No autorizado para ver este transcript' });
  }

  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    const masked = maskPII(raw);
    res.send(masked);
  } catch (e) {
    console.error('[api/transcript] error', e && e.message);
    res.send('');
  }
});

// Logs SSE and plain endpoints
app.get('/api/logs/stream', async (req, res) => {
  try {
    // Autenticación: requerir token si LOG_TOKEN existe
    if (LOG_TOKEN && !isAdmin(req)) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Token requerido' });
    }
    
    // Modo 'once' para obtener logs completos una vez
    if (String(req.query.mode || '') === 'once') {
      const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(txt);
    }
    
    // Configurar SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    
    // Endurecer CORS: solo permitir orígenes en allowlist
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.flushHeaders && res.flushHeaders();
    
    // Límite de clientes SSE para prevenir memory leak
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      res.write('event: error\ndata: {"ok":false,"error":"Maximum SSE clients reached"}\n\n');
      try { res.end(); } catch (_) { }
      return;
    }
    
    // Enviar hello event
    const helloEvent = {
      ok: true,
      serverTime: new Date().toISOString(),
      version: '1.0'
    };
    res.write(`event: hello\ndata: ${JSON.stringify(helloEvent)}\n\n`);
    
    // Obtener filtros de query
    const filterLevel = req.query.level;
    const filterEvent = req.query.event;
    const filterSid = req.query.sid;
    const filterConversationId = req.query.conversationId;
    
    // Función para aplicar filtros
    const matchesFilter = (record) => {
      if (filterLevel && record.level !== filterLevel) return false;
      if (filterEvent && record.event !== filterEvent) return false;
      if (filterSid && record.sid !== filterSid) return false;
      if (filterConversationId && record.conversationId !== filterConversationId) return false;
      return true;
    };
    
    // Enviar historial (tail) si se solicita
    const tailCount = parseInt(req.query.tail || '0', 10);
    if (tailCount > 0) {
      const tailRecords = LOG_RING.slice(-tailCount).filter(matchesFilter);
      for (const record of tailRecords) {
        res.write(`event: log\ndata: ${JSON.stringify(record)}\n\n`);
      }
    }
    
    // Agregar cliente a la lista
    sseClients.add(res);
    console.log('[logs] SSE cliente conectado. total=', sseClients.size);
    
    // Keepalive cada 15s
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch (e) {
        clearInterval(keepaliveInterval);
        sseClients.delete(res);
      }
    }, 15000);
    
    // Limpiar al desconectar
    req.on('close', () => {
      clearInterval(keepaliveInterval);
      sseClients.delete(res);
      try { res.end(); } catch (_) { }
      console.log('[logs] SSE cliente desconectado. total=', sseClients.size);
    });
  } catch (e) {
    console.error('[logs/stream] Error', e && e.message);
    try { res.status(500).end(); } catch (_) { }
  }
});

app.get('/api/logs', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const MAX_LOG_BYTES = parseInt(process.env.LOGS_MAX_BYTES || '5242880', 10); // 5MB default
    
    if (!fs.existsSync(LOG_FILE)) {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.send('');
    }

    const stats = await fs.promises.stat(LOG_FILE);
    const size = stats.size;
    const start = Math.max(0, size - MAX_LOG_BYTES);
    
    let content = '';
    let isTruncated = start > 0;
    
    if (start === 0) {
      // Archivo completo cabe en el límite, leer todo
      content = await fs.promises.readFile(LOG_FILE, 'utf8');
    } else {
      // Leer solo el tail
      content = await new Promise((resolve, reject) => {
        const chunks = [];
        const stream = fs.createReadStream(LOG_FILE, { start, end: size - 1, encoding: 'utf8' });
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(chunks.join('')));
        stream.on('error', reject);
      });
      if (isTruncated) {
        content = `[...tail ${(MAX_LOG_BYTES / 1024 / 1024).toFixed(1)}MB...]\n${content}`;
      }
    }

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (e) {
    console.error('[api/logs] Error', e.message);
    res.status(500).json({ ok: false, error: 'Error reading log file' });
  }
});

// ========================================================
// Tickets & WhatsApp endpoints
// ========================================================
function buildWhatsAppUrl(waNumberRaw, waText) {
  const waNumber = String(waNumberRaw || WHATSAPP_NUMBER || '5493417422422').replace(/\D+/g, '');
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
}

// Rate limit mejorado: máximo 3 tickets por sesión con timestamps
const sessionTicketCounts = new Map(); // Map<sessionId, Array<timestamp>>
const ticketCreationLocks = new Map(); // Prevenir race condition

// Limpieza inteligente: solo eliminar tickets antiguos (más de 1 hora)
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sid, timestamps] of sessionTicketCounts.entries()) {
    const recent = timestamps.filter(ts => ts > oneHourAgo);
    if (recent.length === 0) {
      sessionTicketCounts.delete(sid);
    } else {
      sessionTicketCounts.set(sid, recent);
    }
  }
  // Limpiar locks antiguos (más de 10 minutos)
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  for (const [sid, lockTime] of ticketCreationLocks.entries()) {
    if (lockTime < tenMinutesAgo) {
      ticketCreationLocks.delete(sid);
    }
  }
}, 5 * 60 * 1000); // limpiar cada 5 minutos

// ========================================================
// POST /api/whatsapp-ticket — Ticket creation (CSRF Protected)
// ========================================================
app.post('/api/whatsapp-ticket', validateCSRF, async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    const sid = sessionId || req.sessionId;

    // Rate limit check (ventana deslizante de 1 hora)
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const timestamps = sessionTicketCounts.get(sid) || [];
    const recentTickets = timestamps.filter(ts => ts > oneHourAgo);

    if (recentTickets.length >= 3) {
      return res.status(429).json({
        ok: false,
        error: 'rate_limit',
        message: 'Has creado demasiados tickets en poco tiempo. Esperá unos minutos.'
      });
    }

    let transcript = history;
    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }

    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const accessToken = crypto.randomBytes(16).toString('hex'); // Token único para acceso público
    const nowDate = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const datePart = dateFormatter.format(nowDate).replace(/\//g, '-');
    const timePart = timeFormatter.format(nowDate);
    const generatedLabel = `${datePart} ${timePart} (ART)`;
    let safeName = '';
    if (name) {
      safeName = String(name)
        .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const titleLine = safeName ? `STI • Ticket ${ticketId}-${safeName}` : `STI • Ticket ${ticketId}`;
    const lines = [];
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if (name) lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sid) lines.push(`Sesión: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');

    const transcriptData = [];
    for (const m of transcript || []) {
      const rawText = (m.text || '').toString();
      const safeText = maskPII(rawText);
      lines.push(`[${m.ts || now.toISOString()}] ${m.who || 'user'}: ${safeText}`);
      transcriptData.push({
        ts: m.ts || now.toISOString(),
        who: m.who || 'user',
        text: safeText
      });
    }

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch (e) { /* noop */ }
    const ticketPathTxt = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPathTxt, lines.join('\n'), 'utf8');

    const ticketJson = {
      id: ticketId,
      createdAt: now.toISOString(),
      label: generatedLabel,
      name: name || null,
      device: device || null,
      sid: sid || null,
      accessToken: accessToken, // Token para acceso público
      transcript: transcriptData,
      redactPublic: true
    };
    const ticketPathJson = path.join(TICKETS_DIR, `${ticketId}.json`);
    fs.writeFileSync(ticketPathJson, JSON.stringify(ticketJson, null, 2), 'utf8');

    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;

    const userSess = sid ? await getSession(sid) : null;
    const whoName = (name || userSess?.userName || '').toString().trim();
    const waIntro = whoName
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web...`
      : `Hola STI. Vengo del chat web...`;
    
    // Construir texto para WhatsApp con formato limpio
    let waText = `*${titleLine}*\n`;
    waText += `${waIntro}\n\n`;
    waText += `📅 *Generado:* ${generatedLabel}\n`;
    if (name) waText += `👤 *Cliente:* ${name}\n`;
    if (device) waText += `💻 *Equipo:* ${device}\n`;
    waText += `🎫 *Ticket:* ${ticketId}\n`;
    
    // Separador de conversación
    waText += `\n━━━━━━━━━━━━━━━━\n`;
    waText += `💬 *CONVERSACIÓN*\n`;
    waText += `━━━━━━━━━━━━━━━━\n\n`;
    
    // Agregar conversación formateada
    if (transcript && transcript.length > 0) {
      for (const m of transcript) {
        const rawText = (m.text || '').toString();
        const safeText = maskPII(rawText);
        const icon = m.who === 'system' ? '🤖' : '👤';
        const label = m.who === 'system' ? 'Bot' : 'Usuario';
        waText += `${icon} *${label}:*\n${safeText}\n\n`;
      }
    }
    
    waText += `━━━━━━━━━━━━━━━━\n\n`;
    waText += `🔗 *Ticket completo:* ${apiPublicUrl}`;

    const waNumberRaw = String(process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422');
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g, '');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `intent://send?phone=${waNumber}&text=${encodeURIComponent(waText)}#Intent;package=com.whatsapp;scheme=whatsapp;end`;

    const uiButtons = buildUiButtonsFromTokens(['BTN_WHATSAPP']);
    const labelBtn = (getButtonDefinition && getButtonDefinition('BTN_WHATSAPP')?.label) || 'Enviar WhatsApp';
    const externalButtons = [
      { token: 'BTN_WHATSAPP_WEB', label: labelBtn + ' (Web)', url: waWebUrl, openExternal: true },
      { token: 'BTN_WHATSAPP_INTENT', label: labelBtn + ' (Abrir App - Android)', url: waIntentUrl, openExternal: true },
      { token: 'BTN_WHATSAPP_APP', label: labelBtn + ' (App)', url: waAppUrl, openExternal: true },
      { token: 'BTN_WHATSAPP', label: labelBtn, url: waUrl, openExternal: true }
    ];

    // Incrementar contador de tickets para rate limit (agregar timestamp actual)
    recentTickets.push(now);
    sessionTicketCounts.set(sid, recentTickets);

    res.json({
      ok: true,
      ticketId,
      publicUrl,
      apiPublicUrl,
      waUrl,
      waWebUrl,
      waAppUrl,
      waIntentUrl,
      ui: { buttons: uiButtons, externalButtons },
      allowWhatsapp: true
    });
  } catch (e) {
    console.error('[whatsapp-ticket]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ========================================================
// POST /api/ticket/create — Sistema de tickets REAL (CSRF Protected)
// ========================================================
app.post('/api/ticket/create', validateCSRF, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Session ID required' });
    }

    // Obtener sesión
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    // 🔐 PASO 1: Verificar que usuario haya dado consentimiento para compartir datos
    if (!session.gdprConsentWhatsApp) {
      return res.status(403).json({
        ok: false,
        error: 'consent_required',
        message: 'Necesitamos tu consentimiento antes de enviar datos a WhatsApp'
      });
    }

    // PASO 2: Crear ticket
    const ticket = await createTicket(session);

    // PASO 3: Generar URLs
    const publicUrl = getTicketPublicUrl(ticket.id);
    const waUrl = generateWhatsAppLink(ticket);

    // PASO 4: Actualizar métricas
    updateMetric('chat', 'sessions', 1);

    console.log(`[TICKET] ✅ Ticket creado y URLs generadas: ${ticket.id}`);

    res.json({
      ok: true,
      ticket: {
        id: ticket.id,
        createdAt: ticket.createdAt,
        status: ticket.status,
        publicUrl,
        whatsappUrl: waUrl
      }
    });
  } catch (error) {
    console.error('[TICKET] Error creating ticket:', error);
    updateMetric('errors', 'count', 1);
    updateMetric('errors', 'lastError', error.message);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// GET /api/admin/conversation/:id — Obtener conversación completa por ID
app.get('/api/admin/conversation/:id', async (req, res) => {
  const startTime = Date.now();
  const conversationIdParam = req.params.id?.trim().toUpperCase() || '';
  
  console.log(`[CONVERSATION_API] GET /api/admin/conversation/:id - ID: ${conversationIdParam}, hasToken: ${!!(req.headers.authorization || req.query.token)}`);
  
  try {
    // Verificar token de administrador
    const adminToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token;
    const isValidAdmin = adminToken && adminToken === LOG_TOKEN && LOG_TOKEN && process.env.LOG_TOKEN;

    if (!isValidAdmin) {
      console.log(`[CONVERSATION_API] ❌ Unauthorized - ID: ${conversationIdParam}, token provided: ${!!adminToken}`);
      return res.status(200).json({ 
        ok: false, 
        error: 'UNAUTHORIZED',
        message: 'Token de autenticación requerido',
        conversationId: conversationIdParam
      });
    }

    let conversationId = conversationIdParam;
    const tail = parseInt(req.query.tail) || null;

    // Intentar búsqueda exacta primero
    let metaFile = path.join(CONVERSATIONS_DIR, `${conversationId}.meta.json`);
    let eventsFile = path.join(CONVERSATIONS_DIR, `${conversationId}.jsonl`);

    // Si no existe exacto, intentar búsqueda por sufijo
    if (!fs.existsSync(metaFile)) {
      const suffixMatch = conversationId.match(/-(\d+)$/);
      if (suffixMatch) {
        const suffix = suffixMatch[1];
        const candidates = conversationIndex.bySuffix?.[suffix] || [];
        
        if (candidates.length === 1) {
          conversationId = candidates[0];
          metaFile = path.join(CONVERSATIONS_DIR, `${conversationId}.meta.json`);
          eventsFile = path.join(CONVERSATIONS_DIR, `${conversationId}.jsonl`);
        } else if (candidates.length > 1) {
          return res.status(400).json({
            ok: false,
            error: 'ambiguous_suffix',
            message: `Sufijo ${suffix} corresponde a múltiples conversaciones`,
            candidates: candidates
          });
        }
      }
    }

    // Leer meta
    let meta = null;
    if (fs.existsSync(metaFile)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch (e) {
        console.error(`[CONVERSATION] Error leyendo meta para ${conversationId}:`, e.message);
      }
    }

    // Leer eventos (transcript + console events)
    let events = [];
    let transcript = [];

    if (fs.existsSync(eventsFile)) {
      try {
        const lines = fs.readFileSync(eventsFile, 'utf8').split('\n').filter(l => l.trim());
        
        // Aplicar tail si está especificado
        const linesToRead = tail ? lines.slice(-tail) : lines;
        
        for (const line of linesToRead) {
          try {
            const event = JSON.parse(line);
            
            // Separar transcript (role: user/bot) de eventos de consola (level)
            if (event.role === 'user' || event.role === 'bot') {
              transcript.push({
                who: event.role,
                text: event.text || '',
                timestamp: event.t || event.ts,
                stage: event.stage || null,
                buttons: event.buttons || null
              });
            } else {
              // Evento de consola FULL
              events.push({
                timestamp: event.ts || event.t,
                level: event.level || 'info',
                event: event.event || event.type || 'unknown',
                data: event.data || event
              });
            }
          } catch (parseErr) {
            console.warn(`[CONVERSATION] Error parseando línea en ${conversationId}:`, parseErr.message);
          }
        }
      } catch (e) {
        console.error(`[CONVERSATION] Error leyendo eventos para ${conversationId}:`, e.message);
      }
    }

    // Si no hay meta pero hay eventos, crear meta básica
    if (!meta && events.length > 0) {
      meta = {
        conversationId,
        createdAt: events[0]?.timestamp || new Date().toISOString(),
        updatedAt: events[events.length - 1]?.timestamp || new Date().toISOString()
      };
    }

    if (!meta) {
      // Devolver HTTP 200 con ok:false (no 404) según requerimiento
      console.log(`[CONVERSATION_API] ❌ NOT_FOUND - ID: ${conversationId}, metaFile exists: ${fs.existsSync(metaFile)}, eventsFile exists: ${fs.existsSync(eventsFile)}`);
      return res.status(200).json({
        ok: false,
        error: 'NOT_FOUND',
        message: `Conversación ${conversationId} no encontrada`,
        conversationId: conversationIdParam
      });
    }

    // Determinar fuente de datos
    let source = 'disk';
    try {
      const session = await getSession(meta.sid);
      if (session?.conversationId === conversationId) {
        source = 'both'; // Tiene en Redis y disco
      }
    } catch (e) {
      // Ignorar error de sesión, usar solo disco
    }
    
    const duration = Date.now() - startTime;
    console.log(`[CONVERSATION_API] ✅ OK - ID: ${conversationId}, events: ${events.length}, transcript: ${transcript.length}, source: ${source}, duration: ${duration}ms`);
    
    res.json({
      ok: true,
      id: meta.conversationId,
      conversationId: meta.conversationId,
      meta,
      transcript,
      events,
      totalEvents: events.length,
      totalTranscriptEntries: transcript.length,
      source
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[CONVERSATION_API] ❌ ERROR - ID: ${conversationIdParam}, error: ${error.message}, duration: ${duration}ms`);
    res.status(200).json({ 
      ok: false, 
      error: 'INTERNAL_ERROR', 
      message: error.message,
      conversationId: conversationIdParam
    });
  }
});

// ticket public routes (CON AUTENTICACIÓN)
// GET /api/tickets — Listar todos los tickets (Solo admin)
app.get('/api/tickets', async (req, res) => {
  try {
    // Verificar token de administrador
    const adminToken = req.headers.authorization || req.query.token;
    const isValidAdmin = adminToken && adminToken === LOG_TOKEN && LOG_TOKEN && process.env.LOG_TOKEN;

    if (!isValidAdmin) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    // Leer todos los archivos JSON del directorio de tickets
    const files = fs.readdirSync(TICKETS_DIR).filter(f => f.endsWith('.json'));
    const tickets = [];

    for (const file of files) {
      try {
        const filePath = path.join(TICKETS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const ticket = JSON.parse(content);
        tickets.push(ticket);
      } catch (err) {
        console.error(`[Tickets] Error reading ${file}:`, err.message);
      }
    }

    // Ordenar por fecha de creación (más recientes primero)
    tickets.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    res.json({
      ok: true,
      tickets,
      total: tickets.length
    });

  } catch (error) {
    console.error('[Tickets] Error listing tickets:', error);
    res.status(500).json({ ok: false, error: 'Error al listar tickets' });
  }
});

// DELETE /api/ticket/:tid — Eliminar un ticket (Solo admin)
app.delete('/api/ticket/:tid', async (req, res) => {
  try {
    const tid = String(req.params.tid || '').replace(/[^A-Za-z0-9._-]/g, '');
    
    // Verificar token de administrador
    const adminToken = req.headers.authorization || req.query.token;
    const isValidAdmin = adminToken && adminToken === LOG_TOKEN && LOG_TOKEN && process.env.LOG_TOKEN;

    if (!isValidAdmin) {
      return res.status(401).json({ ok: false, error: 'No autorizado' });
    }

    const jsonFile = path.join(TICKETS_DIR, `${tid}.json`);
    const txtFile = path.join(TICKETS_DIR, `${tid}.txt`);

    if (!fs.existsSync(jsonFile) && !fs.existsSync(txtFile)) {
      return res.status(404).json({ ok: false, error: 'Ticket no encontrado' });
    }

    // Eliminar archivos
    let deletedFiles = [];
    if (fs.existsSync(txtFile)) {
      fs.unlinkSync(txtFile);
      deletedFiles.push('txt');
    }
    if (fs.existsSync(jsonFile)) {
      fs.unlinkSync(jsonFile);
      deletedFiles.push('json');
    }

    console.log(`[TICKET] Deleted by admin: ${tid} (files: ${deletedFiles.join(', ')})`);
    
    res.json({ 
      ok: true, 
      message: 'Ticket eliminado correctamente',
      ticketId: tid,
      deletedFiles
    });

  } catch (error) {
    console.error('[Tickets] Error deleting ticket:', error);
    res.status(500).json({ ok: false, error: 'Error al eliminar ticket' });
  }
});

app.get('/api/ticket/:tid', async (req, res) => {
  const tid = String(req.params.tid || '').replace(/[^A-Za-z0-9._-]/g, '');

  const jsonFile = path.join(TICKETS_DIR, `${tid}.json`);
  const txtFile = path.join(TICKETS_DIR, `${tid}.txt`);

  if (!fs.existsSync(txtFile) && !fs.existsSync(jsonFile)) {
    return res.status(404).json({ ok: false, error: 'Ticket no encontrado' });
  }

  // Tickets son completamente públicos - cualquiera con el ID puede verlos
  console.log(`[TICKET] Public access granted: ticket=${tid}`);

  const raw = fs.readFileSync(txtFile, 'utf8');
  const maskedRaw = maskPII(raw);

  // parse lines into messages
  const lines = maskedRaw.split(/\r?\n/);
  const messages = [];
  for (const ln of lines) {
    if (!ln || /^\s*$/.test(ln)) continue;
    const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
    if (m) {
      messages.push({ ts: m[1], who: String(m[2]).trim(), text: String(m[3]).trim() });
    } else {
      messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
  }

  res.json({ ok: true, ticketId: tid, content: maskedRaw, messages });
});

// Pretty ticket view
app.get('/ticket/:tid', (req, res) => {
  const tid = String(req.params.tid || '').replace(/[^A-Za-z0-9._-]/g, '');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('ticket no encontrado');

  const raw = fs.readFileSync(file, 'utf8');
  const safeRaw = escapeHtml(raw);

  const lines = raw.split(/\r?\n/);
  const messages = [];
  for (const ln of lines) {
    if (!ln || /^\s*$/.test(ln)) continue;
    const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
    if (m) {
      messages.push({ ts: m[1], who: String(m[2]).trim().toLowerCase(), text: String(m[3]).trim() });
    } else {
      messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
  }

  const chatLines = messages.map(msg => {
    if (msg.who === 'system') {
      return `<div class="sys">${escapeHtml(msg.text)}</div>`;
    }
    const side = (msg.who === 'user' || msg.who === 'usuario') ? 'user' : 'bot';
    const whoLabel = side === 'user' ? 'Vos' : 'Tecnos';
    const ts = msg.ts ? `<div class="ts">${escapeHtml(msg.ts)}</div>` : '';
    return `<div class="bubble ${side}">
      <div class="bubble-inner">
        <div class="who">${escapeHtml(whoLabel)}</div>
        <div class="txt">${escapeHtml(msg.text)}</div>
        ${ts}
      </div>
    </div>`;
  }).join('\n');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Ticket ${escapeHtml(tid)} — Conversación</title>
      <style>
      :root{--bg:#f5f7fb;--bot:#ffffff;--user:#dcf8c6;--accent:#0b7cff;--muted:#777;}
      body{font-family:Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial; margin:12px; background:var(--bg); color:#222;}
      .controls{display:flex;gap:12px;align-items:center;margin-bottom:10px;}
      .btn{background:var(--accent);color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none;}
      .chat-wrap{max-width:860px;margin:0 auto;background:transparent;padding:8px;}
      .chat{background:transparent;padding:10px;display:flex;flex-direction:column;gap:10px;}
      .bubble{max-width:78%;display:flex;}
      .bubble.user{align-self:flex-end;justify-content:flex-end;}
      .bubble.bot{align-self:flex-start;justify-content:flex-start;}
      .bubble-inner{background:var(--bot);padding:10px 12px;border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,0.05);}
      .bubble.user .bubble-inner{background:var(--user);border-radius:12px;}
      .bubble .who{font-weight:700;font-size:13px;margin-bottom:6px;color:#111;}
      .bubble .txt{white-space:pre-wrap;font-size:15px;line-height:1.3;color:#111;}
      .bubble .ts{font-size:12px;color:var(--muted);margin-top:6px;text-align:right;}
      .sys{align-self:center;background:transparent;color:var(--muted);font-size:13px;padding:6px 10px;border-radius:8px;}
      pre{background:#fff;border:1px solid #e6e6e6;padding:12px;border-radius:8px;white-space:pre-wrap;}
      @media (max-width:640px){ .bubble{max-width:92%;} }
      </style>
    </head>
    <body>
      <div class="controls">
        <label><input id="fmt" type="checkbox"/> Ver vista cruda</label>
        <a class="btn" href="/api/ticket/${encodeURIComponent(tid)}" target="_blank" rel="noopener">Ver JSON (API)</a>
      </div>

      <div class="chat-wrap">
        <div class="chat" id="chatContent">
          ${chatLines}
        </div>

        <div id="rawView" style="display:none;margin-top:12px;">
          <pre>${safeRaw}</pre>
        </div>
      </div>

      <script>
        (function(){
          const chk = document.getElementById('fmt');
          const chat = document.getElementById('chatContent');
          const raw = document.getElementById('rawView');
          chk.addEventListener('change', ()=> {
            if (chk.checked) { chat.style.display='none'; raw.style.display='block'; }
            else { chat.style.display='flex'; raw.style.display='none'; }
          });
        })();
      </script>
    </body>
  </html>`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Reset session
app.post('/api/reset', async (req, res) => {
  const sid = req.sessionId;
  const empty = {
    id: sid,
    userName: null,
    stage: STATES.ASK_LANGUAGE,
    device: null,
    problem: null,
    issueKey: null,
    tests: { basic: [], ai: [], advanced: [] },
    stepsDone: [],
    fallbackCount: 0,
    waEligible: false,
    transcript: [],
    pendingUtterance: null,
    lastHelpStep: null,
    startedAt: nowIso(),
    nameAttempts: 0,
    stepProgress: {},
    pendingDeviceGroup: null,
    needType: null,
    isHowTo: false,
    isProblem: false
  };
  await saveSession(sid, empty);
  res.json({ ok: true });
});

// Constantes de botones
const BUTTONS = {
  SOLVED: 'BTN_SOLVED',
  PERSIST: 'BTN_PERSIST',
  MORE_TESTS: 'BTN_MORE_TESTS',
  CONNECT_TECH: 'BTN_CONNECT_TECH',
  WHATSAPP: 'BTN_WHATSAPP',
  CLOSE: 'BTN_CLOSE',
  REPHRASE: 'BTN_REPHRASE',
  CONFIRM_TICKET: 'BTN_CONFIRM_TICKET',
  CANCEL: 'BTN_CANCEL',
  MORE_SIMPLE: 'BTN_MORE_SIMPLE'
};

// ========================================================
// Session Validation Endpoint (para recuperar sesiones)
// ========================================================
app.post('/api/session/validate', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.json({ valid: false, error: 'SessionId inválido' });
    }

    // Verificar que la sesión existe y está activa
    const session = await getSession(sessionId);

    if (!session) {
      console.log(`[SESSION] Validación fallida: sesión no encontrada ${sessionId}`);
      return res.json({ valid: false, error: 'Sesión no encontrada' });
    }

    // Verificar que no haya expirado (48 horas)
    const MAX_AGE = 48 * 60 * 60 * 1000;
    const sessionAge = Date.now() - (session.createdAt || 0);

    if (sessionAge > MAX_AGE) {
      console.log(`[SESSION] Validación fallida: sesión expirada ${sessionId}, age=${Math.floor(sessionAge / 1000 / 60)}min`);
      await deleteSession(sessionId);
      return res.json({ valid: false, error: 'Sesión expirada' });
    }

    console.log(`[SESSION] Validación exitosa: ${sessionId}, stage=${session.stage}`);

    // Devolver datos de sesión (sin info sensible)
    return res.json({
      valid: true,
      session: {
        stage: session.stage,
        userLocale: session.userLocale,
        transcript: session.transcript || [],
        createdAt: session.createdAt
      }
    });
  } catch (error) {
    console.error('[SESSION] Error validando sesión:', error);
    return res.status(500).json({ valid: false, error: 'Error interno' });
  }
});

// Greeting endpoint (con CSRF token generation)
app.all('/api/greeting', greetingLimiter, async (req, res) => {
  try {
    // Si no hay sessionId, generar uno nuevo
    let sid = req.sessionId;
    if (!sid) {
      sid = generateSessionId();
      req.sessionId = sid;
    }

    // Validar longitud de inputs si vienen en body
    if (req.body) {
      for (const [key, value] of Object.entries(req.body)) {
        if (typeof value === 'string' && value.length > 10000) {
          return res.status(400).json({ ok: false, error: `Campo '${key}' excede longitud máxima` });
        }
      }
    }

    // Detectar locale preferido a partir de headers
    const accept = String(req.headers['accept-language'] || '').toLowerCase();
    const hdrLocale = String(req.headers['x-locale'] || req.headers['x-lang'] || '').toLowerCase();
    let locale = 'es-AR';
    if (hdrLocale) {
      locale = hdrLocale;
    } else if (accept.startsWith('en')) {
      locale = 'en';
    } else if (accept.startsWith('es')) {
      locale = accept.includes('ar') ? 'es-AR' : 'es-419';
    }

    // Generar CSRF token para esta sesión
    const csrfToken = generateCSRFToken();
    csrfStore.set(sid, { token: csrfToken, createdAt: Date.now() });

    // 🆔 CONVERSATION ID: Obtener o crear conversationId único
    let session = await getSession(sid);
    let conversationId = session?.conversationId;
    
    if (!conversationId) {
      // Generar nuevo Conversation ID único
      conversationId = await generateAndPersistConversationId(sid);
    }

    const fresh = {
      id: sid,
      conversationId: conversationId, // 🆔 Asignar Conversation ID
      userName: null,
      stage: STATES.ASK_LANGUAGE,  // Comenzar con GDPR y selección de idioma
      conversationState: 'greeting',  // greeting, has_name, understanding_problem, solving, resolved
      device: null,
      problem: null,
      problemDescription: '',  // Acumula lo que cuenta el usuario
      issueKey: null,
      tests: { basic: [], ai: [], advanced: [] },
      stepsDone: [],
      fallbackCount: 0,
      waEligible: false,
      transcript: [],
      pendingUtterance: null,
      lastHelpStep: null,
      startedAt: nowIso(),
      nameAttempts: 0,
      stepProgress: {},
      pendingDeviceGroup: null,
      userLocale: 'es-AR',
      needType: null,
      isHowTo: false,
      isProblem: false,
      contextWindow: [],  // Últimos 5 mensajes para contexto
      detectedEntities: {  // Detectar automáticamente
        device: null,
        action: null,  // 'no funciona', 'quiero instalar', etc
        urgency: 'normal'
      }
    };
    const fullGreeting = buildLanguageSelectionGreeting();
    
    // Guardar meta de conversación al crear sesión
    if (conversationId) {
      saveConversationMeta(conversationId, fresh);
    }

    // Usar helper único para persistir greeting
    await appendAndPersistConversationEvent(fresh, conversationId, 'bot', fullGreeting.text, {
      type: 'greeting',
      stage: fresh.stage,
      buttons: fullGreeting.buttons || [],
      ts: nowIso()
    });

    // CON botones para GDPR
    // Incluir CSRF token y Conversation ID en respuesta
    return res.json({
      ok: true,
      greeting: fullGreeting.text,
      reply: fullGreeting.text,
      stage: fresh.stage,
      sessionId: sid,
      csrfToken: csrfToken,
      conversationId: conversationId, // 🆔 Incluir Conversation ID
      buttons: fullGreeting.buttons || []
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'greeting_failed' });
  }
});


function buildTimeGreeting() {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 6 && hour < 12) {
    return {
      es: "🌅 Buen día, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.",
      en: "🌅 Good morning, I'm Tecnos, STI's intelligent assistant — Intelligent Technical Service."
    };
  }

  if (hour >= 12 && hour < 19) {
    return {
      es: "🌇 Buenas tardes, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.",
      en: "🌇 Good afternoon, I'm Tecnos, STI's intelligent assistant — Intelligent Technical Service."
    };
  }

  return {
    es: "🌙 Buenas noches, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.",
    en: "🌙 Good evening, I'm Tecnos, STI's intelligent assistant — Intelligent Technical Service."
  };
}

function buildLanguageSelectionGreeting() {
  return {
    text: `📋 **Política de Privacidad y Consentimiento / Privacy Policy & Consent**

---

**🇦🇷 Español:**
Antes de continuar, quiero informarte:

✅ Guardaré tu nombre y nuestra conversación durante **48 horas**
✅ Los datos se usarán **solo para brindarte soporte técnico**
✅ Podés solicitar **eliminación de tus datos** en cualquier momento
✅ **No compartimos** tu información con terceros
✅ Cumplimos con **GDPR y normativas de privacidad**

🔗 Política completa: https://stia.com.ar/politica-privacidad.html

**¿Aceptás estos términos?**

---

**🇺🇸 English:**
Before we continue, please note:

✅ I will store your name and our conversation for **48 hours**
✅ Data will be used **only to provide technical support**
✅ You can request **data deletion** at any time
✅ We **do not share** your information with third parties
✅ We comply with **GDPR and privacy regulations**

🔗 Full policy: https://stia.com.ar/politica-privacidad.html

**Do you accept these terms?**`,
    buttons: [
      { text: 'Sí Acepto / I Agree ✔️', value: 'si' },
      { text: 'No Acepto / I Don\'t Agree ❌', value: 'no' }
    ]
  };
}

// Función para agregar respuestas empáticas según Flujo.csv
function addEmpatheticResponse(stage, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  const responses = {
    ASK_LANGUAGE: isEn ? "I'm here to help you with whatever you need." : "Estoy acá para ayudarte con lo que necesites.",
    ASK_NAME: isEn ? "Nice to meet you." : "Encantado de conocerte.",
    ASK_NEED: isEn ? "Let's solve it together." : "Vamos a resolverlo juntos.",
    ASK_DEVICE: isEn ? "Thanks for clarifying." : "Gracias por aclararlo.",
    ASK_PROBLEM: isEn ? "Thanks for telling me the details." : "Gracias por contarme el detalle.",
    ASK_HOWTO_DETAILS: isEn ? "Perfect, I'll guide you with that." : "Perfecto, con eso te guío.",
    BASIC_TESTS: isEn ? "Great, we're making progress!" : "Genial, vamos por buen camino!",
    ADVANCED_TESTS: isEn ? "This can give us more clues." : "Esto nos puede dar más pistas.",
    ESCALATE: isEn ? "Thanks for your patience." : "Gracias por tu paciencia.",
    ENDED: isEn ? "I hope your device works perfectly." : "Espero que tu equipo funcione perfecto."
  };
  return responses[stage] || '';
}


function buildLanguagePrompt(locale = 'es-AR') {
  const norm = (locale || '').toLowerCase();
  const isEn = norm.startsWith('en');

  if (isEn) {
    return '🌐 You can change the language at any time using the buttons below:';
  }

  return '🌐 Podés cambiar el idioma en cualquier momento usando los botones:';
}

function buildNameGreeting(locale = 'es-AR') {
  const norm = (locale || '').toLowerCase();
  const isEn = norm.startsWith('en');
  const isEsLatam = norm.startsWith('es-') && !norm.includes('ar');

  if (isEn) {
    const line1 = "👋 Hi, I'm Tecnos, the intelligent assistant of STI — Servicio Técnico Inteligente.";
    const line2 = "I can help you with PCs, notebooks, Wi‑Fi, printers and some TV / streaming devices.";
    const line3 = "I can't access your device remotely or make changes for you; we'll try guided steps to diagnose the issue and, if needed, I'll connect you with a human technician.";
    const line4 = "To get started, what's your name?";
    return `${line1}

${line2} ${line3}

${line4}`;
  }

  if (isEsLatam) {
    const line1 = "👋 Hola, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.";
    const line2 = "Puedo ayudarte con PC, notebooks, Wi‑Fi, impresoras y algunos dispositivos de TV y streaming.";
    const line3 = "No puedo acceder a tu equipo ni ejecutar cambios remotos; vamos a probar pasos guiados para diagnosticar y, si hace falta, te derivo a un técnico humano.";
    const line4 = "Para empezar, ¿cómo te llamas?";
    return `${line1}

${line2} ${line3}

${line4}`;
  }

  const line1 = "👋 Hola, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.";
  const line2 = "Puedo ayudarte con PC, notebooks, Wi‑Fi, impresoras y algunos dispositivos de TV y streaming.";
  const line3 = "No puedo acceder a tu equipo ni ejecutar cambios remotos; vamos a probar pasos guiados para diagnosticar y, si hace falta, te derivo a un técnico humano.";
  const line4 = "Para empezar: ¿cómo te llamás?";
  return `${line1}

${line2} ${line3}

${line4}`;
}



// Helper: create ticket & WhatsApp response
async function createTicketAndRespond(session, sid, res) {
  // Prevenir race condition con lock simple
  if (ticketCreationLocks.has(sid)) {
    const waitTime = Date.now() - ticketCreationLocks.get(sid);
    if (waitTime < 5000) { // Si hace menos de 5 segundos que se está creando
      const pendingResp = withOptions({
        ok: false,
        reply: '⏳ Ya estoy generando tu ticket. Esperá unos segundos...',
        stage: session.stage,
        options: []
      });
      
      // Persistir respuesta del bot
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', pendingResp.reply, {
        type: 'reply',
        stage: session.stage,
        buttons: pendingResp.options || null,
        ts: nowIso()
      });
      
      return res.json(pendingResp);
    }
  }
  ticketCreationLocks.set(sid, Date.now());

  const ts = nowIso();
  try {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const accessToken = crypto.randomBytes(16).toString('hex'); // Token único para acceso público
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const datePart = dateFormatter.format(now).replace(/\//g, '-');
    const timePart = timeFormatter.format(now);
    const generatedLabel = `${datePart} ${timePart} (ART)`;

    let safeName = '';
    if (session.userName) {
      safeName = String(session.userName)
        .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const titleLine = safeName
      ? `STI • Ticket ${ticketId}-${safeName}`
      : `STI • Ticket ${ticketId}`;

    const lines = [];
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if (session.userName) lines.push(`Cliente: ${session.userName}`);
    if (session.device) lines.push(`Equipo: ${session.device}`);
    if (session.conversationId) lines.push(`🆔 ID de Conversación: ${session.conversationId}`); // 🆔 Conversation ID
    if (sid) lines.push(`Sesión: ${sid}`);
    if (session.userLocale) lines.push(`Idioma: ${session.userLocale}`);
    lines.push('');
    lines.push('=== RESUMEN DEL PROBLEMA ===');
    if (session.problem) {
      lines.push(String(session.problem));
    } else {
      lines.push('(sin descripción explícita de problema)');
    }
    lines.push('');
    lines.push('=== PASOS PROBADOS / ESTADO ===');
    try {
      const steps = session.stepsDone || [];
      if (steps.length) {
        for (const st of steps) {
          lines.push(`- Paso ${st.step || '?'}: ${st.label || st.id || ''}`);
        }
      } else {
        lines.push('(aún sin pasos registrados)');
      }
    } catch (e) {
      lines.push('(no se pudieron enumerar los pasos)');
    }
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    const transcriptData = [];
    for (const m of session.transcript || []) {
      const rawText = (m.text || '').toString();
      const safeText = maskPII(rawText);
      const line = `[${m.ts || ts}] ${m.who || 'user'}: ${safeText}`;
      lines.push(line);
      transcriptData.push({
        ts: m.ts || ts,
        who: m.who || 'user',
        text: safeText
      });
    }

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch (e) { /* noop */ }

    // Public masked text file
    const ticketPathTxt = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPathTxt, lines.join('\n'), 'utf8');

    // JSON estructurado para integraciones futuras
    const ticketJson = {
      id: ticketId,
      createdAt: ts,
      label: generatedLabel,
      name: session.userName || null,
      device: session.device || null,
      problem: session.problem || null,
      locale: session.userLocale || null,
      sid: sid || null,
      conversationId: session.conversationId || null, // 🆔 Conversation ID
      accessToken: accessToken, // Token para acceso público
      stepsDone: session.stepsDone || [],
      transcript: transcriptData,
      redactPublic: true
    };
    const ticketPathJson = path.join(TICKETS_DIR, `${ticketId}.json`);
    fs.writeFileSync(ticketPathJson, JSON.stringify(ticketJson, null, 2), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;

    const userSess = sid ? await getSession(sid) : null;
    const whoName = (ticketJson.name || userSess?.userName || '').toString().trim();
    const waIntro = whoName
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.`
      : (CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:');

    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if (ticketJson.name) waText += `Cliente: ${ticketJson.name}\n`;
    if (ticketJson.device) waText += `Equipo: ${ticketJson.device}\n`;
    if (ticketJson.conversationId) waText += `🆔 ID de Conversación: ${ticketJson.conversationId}\n`; // 🆔 Conversation ID
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;
    waText += `\n\nAviso: al enviar esto, parte de esta conversación se comparte con un técnico de STI vía WhatsApp. No incluyas contraseñas ni datos bancarios.`;

    const waNumberRaw = String(process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422');
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g, '');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;

    session.waEligible = true;
    await saveSession(sid, session);

    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const replyLines = [];

    if (isEn) {
      replyLines.push('Perfect, I will generate a summary ticket with what we tried so far.');
      replyLines.push('You can send it by WhatsApp to a human technician so they can continue helping you.');
      replyLines.push('When you are ready, tap the green WhatsApp button and send the message without changing its text.');
    } else {
      replyLines.push('Listo, voy a generar un ticket con el resumen de esta conversación y los pasos que ya probamos.');
      replyLines.push('Vas a poder enviarlo por WhatsApp a un técnico humano de STI para que siga ayudándote.');
      replyLines.push('Cuando estés listo, tocá el botón verde de WhatsApp y enviá el mensaje sin modificar el texto.');
      replyLines.push('Aviso: no compartas contraseñas ni datos bancarios. Yo ya enmascaré información sensible si la hubieras escrito.');
    }

    const resp = withOptions({
      ok: true,
      reply: replyLines.join('\n\n'),
      stage: session.stage,
      options: [BUTTONS.CLOSE]
    });
    resp.waUrl = waUrl;
    resp.waWebUrl = waWebUrl;
    resp.waAppUrl = waAppUrl;
    resp.waIntentUrl = waIntentUrl;
    resp.ticketId = ticketId;
    resp.publicUrl = publicUrl;
    resp.apiPublicUrl = apiPublicUrl;
    resp.allowWhatsapp = true;

    ticketCreationLocks.delete(sid); // Liberar lock
    
    // Persistir respuesta del bot con botones
    await appendAndPersistConversationEvent(session, session.conversationId, 'bot', resp.reply, {
      type: 'reply',
      stage: session.stage,
      buttons: resp.options || resp.buttons || null,
      ts: nowIso()
    });
    
    return res.json(resp);
  } catch (err) {
    console.error('[createTicketAndRespond] Error', err && err.message);
    ticketCreationLocks.delete(sid); // Liberar lock en error
    session.waEligible = false;
    await saveSession(sid, session);
    const errorResp = withOptions({
      ok: false,
      reply: '❗ Ocurrió un error al generar el ticket. Si querés, podés intentar de nuevo en unos minutos o contactar directamente a STI por WhatsApp.',
      stage: session.stage,
      options: [BUTTONS.CLOSE]
    });
    
    // Persistir respuesta del bot
    await appendAndPersistConversationEvent(session, session.conversationId, 'bot', errorResp.reply, {
      type: 'reply',
      stage: session.stage,
      buttons: errorResp.options || null,
      ts: nowIso()
    });
    
    return res.json(errorResp);
  }
}

// ========================================================
// Helper: Handle "no entiendo" requests (shared by BASIC and ADVANCED)
// ========================================================
async function handleDontUnderstand(session, sid, t) {
  const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
  const prefix = whoLabel ? `Tranquilo, ${whoLabel}` : 'Tranquilo';
  const stepsKey = session.stage === STATES.ADVANCED_TESTS ? 'advanced' : 'basic';

  if (session.lastHelpStep && session.tests && Array.isArray(session.tests[stepsKey]) && session.tests[stepsKey][session.lastHelpStep - 1]) {
    const idx = session.lastHelpStep;
    const stepText = session.tests[stepsKey][idx - 1];
    const helpDetail = await getHelpForStep(stepText, idx, session.device || '', session.problem || '', session.userLocale || 'es-AR');
    const replyTxt = `${prefix} 😊.\n\nVeamos ese paso más despacio:\n\n${helpDetail}\n\nCuando termines, contame si te ayudó o si preferís que te conecte con un técnico.`;
    const ts = nowIso();
    await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyTxt, {
      type: 'text',
      stage: session.stage,
      buttons: ['Lo pude solucionar ✔️', 'El problema persiste ❌'],
      ts
    });
    return { ok: true, reply: replyTxt, stage: session.stage, options: ['Lo pude solucionar ✔️', 'El problema persiste ❌'] };
  } else {
    const replyTxt = `${prefix} 😊.\n\nDecime sobre qué paso querés ayuda (1, 2, 3, ...) o tocá el botón del número y te lo explico con más calma.`;
    const ts = nowIso();
    await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyTxt, {
      type: 'text',
      stage: session.stage,
      buttons: ['Lo pude solucionar ✔️', 'El problema persiste ❌'],
      ts
    });
    return { ok: true, reply: replyTxt, stage: session.stage, options: ['Lo pude solucionar ✔️', 'El problema persiste ❌'] };
  }
}

// Helper: Show steps again (shared by BASIC and ADVANCED)
function handleShowSteps(session, stepsKey) {
  const stepsAr = Array.isArray(session.tests?.[stepsKey]) ? session.tests[stepsKey] : [];
  if (!stepsAr || stepsAr.length === 0) {
    const msg = stepsKey === 'advanced'
      ? 'No tengo pasos avanzados guardados para mostrar. Primero pedí "Más pruebas".'
      : 'No tengo pasos guardados para mostrar. Primero describí el problema para que te ofrezca pasos.';
    return { error: true, msg };
  }

  const numbered = enumerateSteps(stepsAr);
  const whoLabel = session.userName ? capitalizeToken(session.userName) : 'Usuari@';
  const intro = stepsKey === 'advanced'
    ? `Volvemos a las pruebas avanzadas, ${whoLabel}:`
    : `Volvemos a los pasos sugeridos:`;
  const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
  const fullMsg = intro + '\n\n' + numbered + footer;

  const helpOptions = stepsAr.map((_, i) => `${emojiForIndex(i)} Ayuda paso ${i + 1}`);
  const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];

  return { error: false, msg: fullMsg, options: optionsResp, steps: stepsAr };
}

// ========================================================
// Generate and present diagnostic steps (used in ASK_PROBLEM and after selecting device)
// ========================================================
async function generateAndShowSteps(session, sid, res) {
  try {
    const issueKey = session.issueKey;
    const device = session.device || null;
    const locale = session.userLocale || 'es-AR';
    const profile = getLocaleProfile(locale);
    const isEn = profile.code === 'en';
    const isEsLatam = profile.code === 'es-419';

    const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length > 0);

    // Build context with image analysis if available
    let imageContext = '';
    if (session.images && session.images.length > 0) {
      const latestImage = session.images[session.images.length - 1];
      if (latestImage.analysis) {
        imageContext += '\n\nCONTEXTO DE IMAGEN SUBIDA:\n';
        if (latestImage.analysis.problemDetected) {
          imageContext += `- Problema detectado: ${latestImage.analysis.problemDetected}\n`;
        }
        if (latestImage.analysis.errorMessages && latestImage.analysis.errorMessages.length > 0) {
          imageContext += `- Errores visibles: ${latestImage.analysis.errorMessages.join(', ')}\n`;
        }
        if (latestImage.analysis.technicalDetails) {
          imageContext += `- Detalles técnicos: ${latestImage.analysis.technicalDetails}\n`;
        }
      }
    }

    // Playbook local para dispositivos de streaming / SmartTV (prioridad en español)
    let steps;
    const playbookForDevice = device && issueKey && DEVICE_PLAYBOOKS?.[device]?.[issueKey];
    if (!isEn && playbookForDevice && Array.isArray(playbookForDevice.es) && playbookForDevice.es.length > 0) {
      steps = playbookForDevice.es.slice(0, 4);
    } else if (hasConfiguredSteps) {
      steps = CHAT.nlp.advanced_steps[issueKey].slice(0, 4);
    } else {
      let aiSteps = [];
      try {
        const problemWithContext = (session.problem || '') + imageContext;
        
        // Extraer imageAnalysis si existe
        let imageAnalysisText = null;
        if (session.images && session.images.length > 0) {
          const latestImage = session.images[session.images.length - 1];
          if (latestImage.analysis && latestImage.analysis.problemDetected) {
            imageAnalysisText = latestImage.analysis.problemDetected;
          }
        }
        
        // DEBUG: mostrar pasos básicos antes de pedir pruebas avanzadas a OpenAI
        try {
          console.log('[DEBUG aiQuickTests] session.tests.basic before call (generateAndShowSteps):', JSON.stringify(Array.isArray(session.tests?.basic) ? session.tests.basic : []));
        } catch (e) {
          console.log('[DEBUG aiQuickTests] error serializing session.tests.basic', e && e.message);
        }
        
        // Pasar imageAnalysis como parámetro adicional
        aiSteps = await aiQuickTests(
          problemWithContext, 
          device || '', 
          locale, 
          Array.isArray(session.tests?.basic) ? session.tests.basic : [],
          imageAnalysisText // <-- AGREGAR ANÁLISIS DE IMAGEN
        );
      } catch (e) {
        aiSteps = [];
      }
      if (Array.isArray(aiSteps) && aiSteps.length > 0) steps = aiSteps.slice(0, 4);
      else {
        if (isEn) {
          steps = [
            'Complete shutdown\n\nUnplug the device from the wall, wait 30 seconds and plug it back in.',
            'Check connections\n\nPower cable firmly connected.\n\nMonitor connected (HDMI / VGA / DP).\n\nTry turning it on again.',
            'If nothing changes\n\nDon\'t worry, we\'ve covered the basics.\nWith this you can contact a technician indicating everything you tried.'
          ];
        } else {
          steps = [
            'Apagado completo\n\nDesenchufá el equipo de la pared, esperá 30 segundos y volvé a conectarlo.',
            'Revisá las conexiones\n\nCable de corriente bien firme.\n\nMonitor conectado (HDMI / VGA / DP).\n\nProbá encender nuevamente.',
            'Si nada cambia\n\nTranquil@, ya hicimos lo básico.\nCon esto ya podés contactar a un técnico indicando todo lo que probaste.'
          ];
        }
      }
    }

    // Filtrar pasos avanzados para que no repitan los básicos (comparación normalizada)
    if (session.tests && Array.isArray(session.tests.basic) && Array.isArray(steps)) {
      const basicSet = new Set((session.tests.basic || []).map(normalizeStepText));
      steps = steps.filter(s => !basicSet.has(normalizeStepText(s)));
    }

    session.stage = STATES.BASIC_TESTS;
    session.basicTests = steps;
    // Mantener compatibilidad con estructuras que usan session.tests
    session.tests = session.tests || {};
    session.tests.basic = Array.isArray(steps) ? steps : [];
    session.currentTestIndex = 0;

    const who = session.userName ? capitalizeToken(session.userName) : null;
    // Usar deviceLabel (label legible) en lugar de device (ID)
    const deviceLabel = session.deviceLabel || device || (isEn ? 'device' : 'equipo');
    const pSummary = (session.problem || '').trim().slice(0, 200);

    // Emojis numerados para los pasos
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    let intro;
    if (isEn) {
      intro = who
        ? `Perfect, ${who}.\nSo, with your ${deviceLabel}, the problem we see is:\n"${pSummary}".\n\nLet's try a few quick steps together 🔧⚡:`
        : `Perfect.\nSo, with your ${deviceLabel}, the problem we see is:\n"${pSummary}".\n\nLet's try a few quick steps together 🔧⚡:`;
    } else if (isEsLatam) {
      intro = who
        ? `Perfecto, ${who}.\nEntonces, con tu ${deviceLabel}, el problema que vemos es:\n"${pSummary}".\n\nVamos a probar unos pasos rápidos juntos 🔧⚡:`
        : `Perfecto.\nEntonces, con tu ${deviceLabel}, el problema que vemos es:\n"${pSummary}".\n\nVamos a probar unos pasos rápidos juntos 🔧⚡:`;
    } else {
      intro = who
        ? `Perfecto, ${who}.\nEntonces, con tu ${deviceLabel}, el problema que vemos es:\n"${pSummary}".\n\nVamos a probar unos pasos rápidos juntos 🔧⚡:`
        : `Perfecto.\nEntonces, con tu ${deviceLabel}, el problema que vemos es:\n"${pSummary}".\n\nVamos a probar unos pasos rápidos juntos 🔧⚡:`;
    }

    // Formatear pasos con emojis y saltos de línea visuales
    function enumerateStepsWithEmojis(list) {
      return list.map((s, idx) => {
        const emoji = numberEmojis[idx] || `${idx + 1}️⃣`;
        // Agregar saltos de línea adicionales entre pasos para mejor legibilidad
        return `${emoji} ${s}\n`;
      }).join('\n');
    }

    const stepsText = enumerateStepsWithEmojis(steps);

    let footer;
    if (isEn) {
      footer = '\nIf nothing changes…\n\n' +
        'Don\'t worry, we\'ve done the basics.\n' +
        'With this you can contact a technician indicating everything you tried.\n\n' +
        'When you\'re done, let me know by clicking an option below:';
    } else {
      footer = '\nSi nada cambia…\n\n' +
        'Tranquil@, ya hicimos lo básico.\n' +
        'Con esto ya podés contactar a un técnico indicando todo lo que probaste.\n\n' +
        'Cuando termines, avisame seleccionando una opción abajo:';
    }

    const reply = `${intro}\n\n${stepsText}${footer}`;

    // Generar botones dinámicos
    const options = [];

    // 1. Botón Solucionado
    options.push({
      text: isEn ? '✔️ I solved it' : '✔️ Lo pude solucionar',
      value: 'BTN_SOLVED',
      description: isEn ? 'The problem is gone' : 'El problema desapareció'
    });

    // 2. Botón Persiste
    options.push({
      text: isEn ? '❌ The problem persists' : '❌ El problema persiste',
      value: 'BTN_PERSIST',
      description: isEn ? 'I still have the issue' : 'Sigo con el inconveniente'
    });

    // 3. Botones de Ayuda por cada paso
    steps.forEach((step, idx) => {
      const emoji = numberEmojis[idx] || `${idx + 1}️⃣`;
      options.push({
        text: isEn ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`,
        value: `BTN_HELP_STEP_${idx}`,
        description: isEn ? `Explain step ${idx + 1} in detail` : `Explicar paso ${idx + 1} en detalle`
      });
    });

    const payload = withOptions({ ok: true, reply, options });
    await saveSession(sid, session);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[generateAndShowSteps] error:', err?.message || err);
    return res.status(200).json(withOptions({
      ok: true,
      reply: '😅 Tuve un problema al preparar los pasos. Probá de nuevo o contame si querés que conecte con un técnico.'
    }));
  }
}

// ========================================================
// Image upload endpoint: /api/upload-image
// ========================================================
app.post('/api/upload-image', uploadLimiter, validateCSRF, upload.single('image'), async (req, res) => {
  const uploadStartTime = Date.now();
  let uploadedFilePath = null;

  try {
    // Validación: sid (soft fallback si inválido)
    const sidRaw = req.query?.sessionId || req.body?.sessionId || req.sessionId;
    const sid = safeSessionId(sidRaw, generateSessionId());
    if (sid !== sidRaw && sidRaw) {
      req.sessionId = sid;
    }
    
    // Validación básica: file existe
    if (!req.file) {
      updateMetric('uploads', 'failed', 1);
      return badRequest(res, 'NO_FILE', 'No se recibió archivo de imagen');
    }

    uploadedFilePath = req.file.path;
    
    // Validación: tamaño
    if (req.file.size > MAX_UPLOAD_BYTES) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return tooLarge(res, 'FILE_TOO_LARGE', `Imagen supera el máximo (${MAX_UPLOAD_BYTES} bytes)`);
    }
    
    // Validación: mimetype
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return badRequest(res, 'BAD_MIMETYPE', 'Formato de imagen no permitido', { mimetype: req.file.mimetype });
    }

    const session = await getSession(sid);

    if (!session) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: 'Sesión no encontrada' });
    }

    // Log seguro al inicio (sin base64, sin PII sensible)
    logMsg('info', '[UPLOAD_IMAGE]', {
      sid,
      size: req.file?.size,
      mime: req.file?.mimetype,
      hasSession: !!session
    });
    
    // Instrumentación: UPLOAD_IN
    emitLogEvent('info', 'UPLOAD_IN', {
      sid,
      mime: req.file?.mimetype || 'unknown',
      size: req.file?.size || 0
    });

    // Limitar uploads por sesión
    if (!session.images) session.images = [];
    if (session.images.length >= 10) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: 'Límite de imágenes por sesión alcanzado (10 máx)' });
    }

    // Validar que sea una imagen real
    const validation = await validateImageFile(uploadedFilePath);
    if (!validation.valid) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: validation.error });
    }

    // Compress image
    const originalPath = uploadedFilePath;
    const compressedPath = originalPath.replace(/(\.[^.]+)$/, '-compressed$1');
    const compressionResult = await compressImage(originalPath, compressedPath);

    let finalPath = originalPath;
    let finalSize = req.file.size;

    if (compressionResult.success && compressionResult.compressedSize < req.file.size) {
      // Use compressed version
      fs.unlinkSync(originalPath);
      fs.renameSync(compressedPath, originalPath);
      finalSize = compressionResult.compressedSize;
      logMsg(`[UPLOAD] Compression saved ${(compressionResult.savedBytes / 1024).toFixed(1)}KB`);
      
      // Instrumentación: UPLOAD_COMPRESS
      emitLogEvent('info', 'UPLOAD_COMPRESS', {
        sid,
        beforeKB: Math.round(req.file.size / 1024),
        afterKB: Math.round(compressionResult.compressedSize / 1024),
        savedPct: Math.round((compressionResult.savedBytes / req.file.size) * 100)
      });
    } else if (compressionResult.success) {
      // Original was smaller, delete compressed
      fs.unlinkSync(compressedPath);
    }

    // Build image URL (sanitized)
    const safeFilename = path.basename(req.file.filename);
    const imageUrl = `${PUBLIC_BASE_URL}/uploads/${safeFilename}`;

    // Probe public URL accessibility
    const probe = await probePublicUrl(imageUrl);
    logMsg(probe.ok ? 'info' : 'warn', '[UPLOAD_IMAGE:PROBE]', { sid, ok: probe.ok, status: probe.status, method: probe.method });
    
    // Instrumentación: UPLOAD_PROBE
    emitLogEvent(probe.ok ? 'info' : 'warn', 'UPLOAD_PROBE', {
      sid,
      ok: probe.ok,
      status: probe.status
    });

    // Analyze image with OpenAI Vision if available
    let imageAnalysis = null;
    let usedVision = false;
    const analysisStartTime = Date.now();

    // Solo intentar OpenAI Vision si openai está disponible Y probe.ok
    if (openai && probe.ok) {
      try {
        const analysisPrompt = sanitizeInput(`Analizá esta imagen que subió un usuario de soporte técnico. 
Identificá:
1. ¿Qué tipo de problema o dispositivo se muestra?
2. ¿Hay mensajes de error visibles? ¿Cuáles?
3. ¿Qué información técnica relevante podés extraer?
4. ¿Qué recomendaciones darías?

Respondé en formato JSON:
{
  "deviceType": "tipo de dispositivo",
  "problemDetected": "descripción del problema",
  "errorMessages": ["mensaje1", "mensaje2"],
  "technicalDetails": "detalles técnicos",
  "recommendations": "recomendaciones"
}`, 1500);

        const visionResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: analysisPrompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        });

        const analysisTime = Date.now() - analysisStartTime;

        // Update average analysis time
        const currentAvg = metrics.uploads.avgAnalysisTime;
        const totalUploads = metrics.uploads.success + 1;
        metrics.uploads.avgAnalysisTime = ((currentAvg * metrics.uploads.success) + analysisTime) / totalUploads;

        const analysisText = visionResponse.choices[0]?.message?.content || '{}';
        try {
          imageAnalysis = JSON.parse(analysisText);
        } catch (parseErr) {
          imageAnalysis = { rawAnalysis: analysisText };
        }

        usedVision = true;
        const visionMs = Date.now() - analysisStartTime;
        logMsg('info', '[UPLOAD_IMAGE:VISION]', { sid, usedVision: true, ms: visionMs });
        if (DEBUG_IMAGES) {
          logMsg('info', '[UPLOAD_IMAGE:VISION]', { sid, problemDetected: imageAnalysis.problemDetected || 'No problem detected' });
        }
        
        // Instrumentación: UPLOAD_VISION
        emitLogEvent('info', 'UPLOAD_VISION', {
          sid,
          usedVision: true,
          ms: visionMs
        });
        
        // Instrumentación: UPLOAD_VISION
        emitLogEvent('info', 'UPLOAD_VISION', {
          sid,
          usedVision: true,
          ms: visionMs
        });
      } catch (visionErr) {
        if (DEBUG_IMAGES) {
          console.error('[VISION] Error analyzing image:', visionErr);
        }
        imageAnalysis = { error: 'No se pudo analizar la imagen' };
        updateMetric('errors', 'count', 1);
        updateMetric('errors', 'lastError', { type: 'vision', message: visionErr.message, timestamp: new Date().toISOString() });
      }
    } else if (!probe.ok) {
      // Si probe NO ok, no intentar Vision pero responder claro
      imageAnalysis = { error: 'Imagen recibida pero no pude acceder al enlace público para analizarla (403/404). Reintentá o describime el error.' };
      usedVision = false;
    }

    // Generate unique imageId
    const imageId = `img_${sid.substring(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Store image data in session with full metadata
    const imageData = {
      imageUrl: imageUrl,
      imageId: imageId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mime: req.file.mimetype,
      bytes: finalSize,
      uploadedAt: new Date().toISOString(),
      timestamp: nowIso(),
      analysis: imageAnalysis,
      usedVision,
      probe: { ok: probe.ok, status: probe.status, method: probe.method }
    };

    if (!session.images) session.images = [];
    session.images.push(imageData);

    // Add to transcript
    session.transcript.push({
      who: 'user',
      text: '[Imagen subida]',
      imageUrl: imageUrl,
      ts: nowIso()
    });

    await saveSession(sid, session);

    // Build response with imageRefs support
    let replyText = '✅ Imagen recibida correctamente.';

    if (imageAnalysis && imageAnalysis.problemDetected) {
      replyText += `\n\n🔍 **Análisis de la imagen:**\n${imageAnalysis.problemDetected}`;

      if (imageAnalysis.errorMessages && imageAnalysis.errorMessages.length > 0) {
        replyText += `\n\n**Errores detectados:**\n${imageAnalysis.errorMessages.map(e => `• ${e}`).join('\n')}`;
      }

      if (imageAnalysis.recommendations) {
        replyText += `\n\n**Recomendación:**\n${imageAnalysis.recommendations}`;
      }
    }

    session.transcript.push({
      who: 'bot',
      text: replyText,
      ts: nowIso()
    });

    await saveSession(sid, session);

    // Update metrics
    updateMetric('uploads', 'total', 1);
    updateMetric('uploads', 'success', 1);
    updateMetric('uploads', 'totalBytes', finalSize);

    const totalUploadTime = Date.now() - uploadStartTime;
    logMsg(`[UPLOAD] Completed in ${totalUploadTime}ms (${(finalSize / 1024).toFixed(1)}KB)`);

    // Responder con imageRefs support
    res.json({
      ok: true,
      imageUrl: imageUrl,
      imageId: imageId,
      analysis: imageAnalysis,
      usedVision,
      probe: { ok: probe.ok, status: probe.status },
      reply: replyText,
      sessionId: sid
    });

  } catch (err) {
    console.error('[UPLOAD] Error:', err);
    updateMetric('uploads', 'failed', 1);
    updateMetric('errors', 'count', 1);
    updateMetric('errors', 'lastError', { type: 'upload', message: err.message, timestamp: new Date().toISOString() });
    
    // Instrumentación: UPLOAD_ERR
    const sid = req.sessionId || 'unknown';
    emitLogEvent('error', 'UPLOAD_ERR', {
      sid,
      errorName: err?.name || 'Error',
      message: err?.message || 'Unknown error'
    });
    
    res.status(500).json({
      ok: false,
      error: err.message || 'Error al subir la imagen'
    });
  }
});

// ========================================================
// Core chat endpoint: /api/chat
// ========================================================
// ========================================================
// POST /api/chat — Main conversational endpoint (CSRF + Rate-Limit Protected)
// ========================================================
app.post('/api/chat', chatLimiter, validateCSRF, async (req, res) => {
  const startTime = Date.now(); // Para medir duración
  let flowLogData = {
    sessionId: null,
    currentStage: null,
    userInput: null,
    trigger: null,
    botResponse: null,
    nextStage: null,
    serverAction: null,
    duration: 0
  };

  // Helper para retornar y loggear automáticamente
  const logAndReturn = async (response, stage, nextStage, trigger = 'N/A', action = 'response_sent', sessionParam = null) => {
    // Usar sessionParam si se pasa, sino usar session del scope (con fallback seguro)
    const currentSession = sessionParam || session;
    
    flowLogData.currentStage = stage;
    flowLogData.nextStage = nextStage;
    flowLogData.trigger = trigger;
    flowLogData.botResponse = response.reply;
    flowLogData.serverAction = action;
    flowLogData.duration = Date.now() - startTime;

    // Log la interacción
    logFlowInteraction(flowLogData);

    // Detectar loops
    const loopDetection = detectLoops(flowLogData.sessionId);
    if (loopDetection && loopDetection.detected) {
      console.warn(loopDetection.message);
    }

    // 🆔 Persistir respuesta del bot usando helper único (transcript + JSONL)
    if (currentSession && response.reply) {
      await appendAndPersistConversationEvent(currentSession, currentSession.conversationId, 'bot', response.reply, {
        type: 'reply',
        stage: response.stage || stage || 'unknown',
        buttons: response.options || response.buttons || null,
        ts: new Date().toISOString()
      });
      
      // Actualizar meta de conversación
      if (currentSession.conversationId) {
        saveConversationMeta(currentSession.conversationId, currentSession);
      }
    }

    return res.json(response);
  };

  try {
    // 🔐 PASO 1: Verificar rate-limit POR SESIÓN
    const sessionId = req.body.sessionId || req.sessionId;
    
    // Logs detallados solo si DEBUG_CHAT o DEBUG_IMAGES está habilitado
    if (DEBUG_CHAT || DEBUG_IMAGES) {
      console.log('[DEBUG /api/chat] INICIO - sessionId from body:', req.body.sessionId, 'from req:', req.sessionId, 'final:', sessionId);
      console.log('[DEBUG /api/chat] Body keys:', Object.keys(req.body));
      console.log('[DEBUG /api/chat] Headers x-session-id:', req.headers['x-session-id']);
      
      // Log body sin imágenes para no saturar (nunca base64)
      const bodyWithoutImages = { ...req.body };
      if (bodyWithoutImages.images && Array.isArray(bodyWithoutImages.images)) {
        console.log('[DEBUG /api/chat] 🖼️ Body tiene', bodyWithoutImages.images.length, 'imagen(es)');
        // NUNCA loguear img.data (base64)
        bodyWithoutImages.images = bodyWithoutImages.images.map(img => ({
          name: img.name,
          hasData: !!img.data,
          dataLength: img.data ? img.data.length : 0,
          isBase64: img.data?.startsWith('data:image/') || false
        }));
      } else {
        console.log('[DEBUG /api/chat] ⚠️ NO hay imágenes en el body');
      }
    }

    const sessionRateCheck = checkSessionRateLimit(sessionId);

    if (!sessionRateCheck.allowed) {
      console.warn(`[RATE_LIMIT] SESSION BLOCKED - Session ${sessionId} exceeded 20 msgs/min`);
      updateMetric('errors', 'count', 1);
      return res.status(429).json({
        ok: false,
        reply: '😅 Estás escribiendo muy rápido. Esperá unos segundos antes de continuar.',
        error: 'session_rate_limit',
        retryAfter: sessionRateCheck.retryAfter
      });
    }

    updateMetric('chat', 'totalMessages', 1);

    const body = req.body || {};
    
    // Validación: sid (soft fallback si inválido)
    const sidRaw = body?.sessionId || req.query?.sessionId || req.sessionId;
    const sid = safeSessionId(sidRaw, generateSessionId());
    if (sid !== sidRaw && sidRaw) {
      // Si se reemplazó, actualizar req.sessionId para compatibilidad
      req.sessionId = sid;
    }
    
    // Validación: texto (limitar largo)
    const tRaw = asString(body?.text || body?.message || body?.userText || '');
    if (tRaw.length > MAX_TEXT_LEN) {
      return tooLarge(res, 'TEXT_TOO_LONG', `El mensaje excede el máximo de ${MAX_TEXT_LEN} caracteres`);
    }
    let t = clampLen(tRaw, MAX_TEXT_LEN);
    
    // ========================================================
    // 🎯 P0: PAYLOAD CANÓNICO DE BOTONES
    // ========================================================
    // Prioridad: body.button.token > body.buttonToken > body.value (action=button) > body.button.label (fallback)
    let buttonToken = null;
    let buttonLabel = null;
    
    // Caso 1: Payload canónico { button: { token: "...", label: "..." } }
    if (body?.button && typeof body.button === 'object') {
      buttonToken = asString(body.button.token || '');
      buttonLabel = asString(body.button.label || '');
      console.log('[BUTTON_PAYLOAD] ✅ Payload canónico detectado:', { token: buttonToken.substring(0, 30), label: buttonLabel.substring(0, 30) });
    }
    
    // Caso 2: buttonToken directo (legacy)
    if (!buttonToken && body?.buttonToken) {
      buttonToken = asString(body.buttonToken);
      console.log('[BUTTON_PAYLOAD] ⚠️ Usando buttonToken legacy:', buttonToken.substring(0, 30));
    }
    
    // Caso 3: body.value cuando action=button (legacy)
    if (!buttonToken && body.action === 'button' && body.value) {
      buttonToken = asString(body.value);
      console.log('[BUTTON_PAYLOAD] ⚠️ Usando body.value legacy:', buttonToken.substring(0, 30));
    }
    
    // Caso 4: Fallback - mapear label a token si no hay token pero hay label
    if (!buttonToken && buttonLabel) {
      // Normalizar label (quitar emojis, lowercase, trim, quitar acentos)
      const normalizedLabel = buttonLabel
        .replace(/[^\w\s]/g, '') // Quitar emojis y caracteres especiales
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Quitar acentos
      
      // Mapeo básico de labels comunes a tokens
      const labelToTokenMap = {
        'hablar con tecnico': 'BTN_CONNECT_TECH',
        'conectar con tecnico': 'BTN_CONNECT_TECH',
        'cerrar chat': 'BTN_CLOSE',
        'cerrar': 'BTN_CLOSE',
        'mas pruebas': 'BTN_MORE_TESTS',
        'pruebas avanzadas': 'BTN_ADVANCED_TESTS',
        'lo pude solucionar': 'BTN_SOLVED',
        'el problema persiste': 'BTN_PERSIST'
      };
      
      if (labelToTokenMap[normalizedLabel]) {
        buttonToken = labelToTokenMap[normalizedLabel];
        console.log('[BUTTON_PAYLOAD] ✅ Label mapeado a token:', { label: buttonLabel, token: buttonToken });
      }
    }
    
    // Validar longitud del token
    if (buttonToken && buttonToken.length > MAX_BUTTON_TOKEN_LEN) {
      emitLogEvent('warn', 'CHAT_400', {
        sid: sid || 'unknown',
        conversationId: null,
        code: 'BAD_BUTTON_TOKEN',
        message: `buttonToken demasiado largo (máx ${MAX_BUTTON_TOKEN_LEN})`
      });
      return badRequest(res, 'BAD_BUTTON_TOKEN', `buttonToken demasiado largo (máx ${MAX_BUTTON_TOKEN_LEN})`);
    }
    
    const effectiveButtonToken = buttonToken || '';
    
    // Computar effectiveText: texto efectivo para procesamiento (text || effectiveButtonToken)
    // Esto asegura que los botones funcionen incluso cuando text está vacío
    const effectiveText = (typeof t === 'string' ? t.trim() : '') || effectiveButtonToken || '';
    
    // Logging seguro (solo si DEBUG_CHAT)
    if (DEBUG_CHAT) {
      logMsg('info', '[CHAT:INPUT_EFFECTIVE]', {
        sid,
        textLen: t.length,
        buttonTokenLen: buttonToken ? buttonToken.length : 0,
        effectiveLen: effectiveText.length,
        hasButton: !!buttonToken
      });
    }
    
    // Validación: arrays de imágenes
    const images = Array.isArray(body.images) ? body.images : [];
    const imageRefs = Array.isArray(body.imageRefs) ? body.imageRefs : [];
    
    if (images.length > MAX_IMAGE_REFS) {
      emitLogEvent('warn', 'CHAT_400', {
        sid: sid || 'unknown',
        conversationId: null,
        code: 'TOO_MANY_IMAGES',
        message: `Demasiadas imágenes (máx ${MAX_IMAGE_REFS})`
      });
      return tooLarge(res, 'TOO_MANY_IMAGES', `Demasiadas imágenes (máx ${MAX_IMAGE_REFS})`);
    }
    if (imageRefs.length > MAX_IMAGE_REFS) {
      emitLogEvent('warn', 'CHAT_400', {
        sid: sid || 'unknown',
        conversationId: null,
        code: 'TOO_MANY_IMAGE_REFS',
        message: `Demasiadas referencias de imágenes (máx ${MAX_IMAGE_REFS})`
      });
      return tooLarge(res, 'TOO_MANY_IMAGE_REFS', `Demasiadas referencias de imágenes (máx ${MAX_IMAGE_REFS})`);
    }
    
    // Validación: imageRefs entries
    for (let i = 0; i < imageRefs.length; i++) {
      const ref = imageRefs[i];
      if (ref && typeof ref === 'object') {
        if (ref.imageUrl) {
          const url = asString(ref.imageUrl);
          if (url.length > MAX_IMAGE_URL_LEN) {
            return badRequest(res, 'BAD_IMAGE_REF', `imageUrl demasiado largo en imageRefs[${i}]`, { index: i });
          }
          if (!isHttpUrl(url)) {
            return badRequest(res, 'BAD_IMAGE_REF', `imageUrl inválido en imageRefs[${i}]`, { index: i });
          }
        }
        if (ref.imageId) {
          const id = asString(ref.imageId);
          if (!isSafeId(id)) {
            return badRequest(res, 'BAD_IMAGE_REF', `imageId inválido en imageRefs[${i}]`, { index: i });
          }
        }
      } else if (typeof ref === 'string') {
        // Puede ser URL o imageId
        if (ref.length > MAX_IMAGE_URL_LEN) {
          return badRequest(res, 'BAD_IMAGE_REF', `Referencia demasiado larga en imageRefs[${i}]`, { index: i });
        }
        if (!isHttpUrl(ref) && !isSafeId(ref)) {
          return badRequest(res, 'BAD_IMAGE_REF', `Referencia inválida en imageRefs[${i}]`, { index: i });
        }
      }
    }
    
    // Validación: input no vacío (usar effectiveText o effectiveButtonToken)
    // Acepta si hay texto, buttonToken, o imágenes
    if (!effectiveText && !effectiveButtonToken && images.length === 0 && imageRefs.length === 0) {
      return badRequest(res, 'EMPTY_INPUT', 'Mensaje vacío');
    }
    
    const tokenMap = {};
    if (Array.isArray(CHAT?.ui?.buttons)) {
      for (const b of CHAT.ui.buttons) {
        if (b.token) tokenMap[b.token] = b.text || '';
      }
    }

    let incomingText = effectiveText;
    if (body.action === 'button' && body.value && buttonToken) {
      console.log('[DEBUG BUTTON] Received button - action:', body.action, 'hasValue:', !!body.value, 'tokenLength:', buttonToken.length);
      const def = getButtonDefinition(buttonToken);
      if (tokenMap[buttonToken] !== undefined) {
        incomingText = tokenMap[buttonToken];
      } else if (buttonToken.startsWith('BTN_HELP_')) {
        const n = buttonToken.split('_').pop();
        incomingText = `ayuda paso ${n}`;
      } else {
        incomingText = buttonToken;
      }
      buttonLabel = body.label || (def && def.label) || buttonToken;
    }

    // Log seguro al inicio (sin base64, sin PII sensible)
    const imagesCount = images.length;
    const imageRefsCount = imageRefs.length;
    logMsg('info', '[CHAT:IN]', { sid, msgLen: effectiveText.length, imagesCount, imageRefsCount, hasButton: !!buttonToken });

    if (DEBUG_CHAT || DEBUG_IMAGES) {
      console.log('[DEBUG /api/chat] SessionId:', sid?.substring(0, 30), 'hasButtonToken:', !!buttonToken, 'textLength:', effectiveText?.length || 0);
    }

    // Inicializar datos de log
    flowLogData.sessionId = sid;
    flowLogData.userInput = buttonToken ? `[BTN] ${buttonLabel || buttonToken}` : effectiveText;

    let session = await getSession(sid);
    console.log('[DEBUG] Session loaded - stage:', session?.stage, 'userName:', session?.userName, 'conversationId:', session?.conversationId);
    
    // 🆔 Si la sesión no tiene conversationId, generar uno (puede pasar si se crea sesión fuera de greeting)
    if (session && !session.conversationId) {
      session.conversationId = await generateAndPersistConversationId(sid);
      await saveSession(sid, session);
      console.log(`[CONVERSATION_ID] ✅ Asignado a sesión existente: ${session.conversationId}`);
    }
    
    // Instrumentación: CHAT_IN
    emitLogEvent('info', 'CHAT_IN', {
      sid,
      conversationId: session?.conversationId || null,
      stage: session?.stage || null,
      msgLen: effectiveText.length,
      hasButton: !!buttonToken,
      buttonLen: buttonToken ? buttonToken.length : 0,
      imagesCount,
      imageRefsCount
    });
    
    if (!session) {
      session = {
        id: sid,
        userName: null,
        stage: STATES.ASK_LANGUAGE,
        device: null,
        problem: null,
        issueKey: null,
        tests: { basic: [], ai: [], advanced: [] },
        stepsDone: [],
        fallbackCount: 0,
        waEligible: false,
        transcript: [],
        pendingUtterance: null,
        lastHelpStep: null,
        startedAt: nowIso(),
        helpAttempts: {},
        nameAttempts: 0,
        stepProgress: {},
        pendingDeviceGroup: null,
        userLocale: 'es-AR',
        images: [], // Array para guardar referencias de imágenes
        helpAttempts: {},
        frustrationCount: 0,
        pendingAction: null
      };
      console.log('[api/chat] nueva session', sid);
    }

    // 🖼️ Procesar imágenes si vienen en el body (DESPUÉS de obtener sesión)
    // Soporte para imageRefs (nuevo) y images con base64 (legacy)
    // Nota: images e imageRefs ya están declarados y validados arriba
    let imageContext = '';
    let savedImageUrls = [];
    
    // Procesar imageRefs primero (si está habilitado)
    if (ENABLE_IMAGE_REFS && imageRefs.length > 0) {
      console.log(`[IMAGE_REFS] Received ${imageRefs.length} image reference(s) from session ${sid}`);
      
      for (const ref of imageRefs) {
        try {
          // Resolver referencia: puede ser imageUrl o imageId
          let imageEntry = null;
          
          if (typeof ref === 'string') {
            // Es una URL o imageId
            if (ref.startsWith('http')) {
              // Es una URL
              imageEntry = session.images?.find(img => img.imageUrl === ref);
            } else {
              // Es un imageId
              imageEntry = session.images?.find(img => img.imageId === ref);
            }
          } else if (ref.imageUrl) {
            imageEntry = session.images?.find(img => img.imageUrl === ref.imageUrl);
          } else if (ref.imageId) {
            imageEntry = session.images?.find(img => img.imageId === ref.imageId);
          }
          
          if (imageEntry) {
            savedImageUrls.push(imageEntry.imageUrl);
            console.log(`[IMAGE_REFS] ✅ Resolved: ${imageEntry.imageId || 'unknown'} -> ${imageEntry.imageUrl}`);
          } else {
            console.warn(`[IMAGE_REFS] ⚠️ Reference not found in session:`, typeof ref === 'string' ? ref : (ref.imageUrl || ref.imageId));
          }
        } catch (err) {
          console.error(`[IMAGE_REFS] ❌ Error resolving reference:`, err.message);
        }
      }
      
      // Log solo metadata (nunca base64)
      console.log(`[IMAGE_REFS] Processed ${savedImageUrls.length}/${imageRefs.length} references`, {
        count: savedImageUrls.length,
        imageIds: imageRefs.map(ref => typeof ref === 'string' ? ref.substring(0, 20) : (ref.imageId || ref.imageUrl || 'unknown')).slice(0, 3)
      });
    }
    
    // Procesar imágenes legacy con base64 (solo si no hay imageRefs o si está deshabilitado)
    if (images.length > 0 && (!ENABLE_IMAGE_REFS || savedImageUrls.length === 0)) {
      console.log(`[IMAGE_UPLOAD] Received ${images.length} image(s) from session ${sid}`);
      
      // Guardar las imágenes en disco
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          console.log(`[IMAGE] Processing image ${i + 1}/${images.length}: ${img.name || 'unnamed'}`);
          
          if (!img.data) {
            console.error('[IMAGE] Image data is missing for:', img.name);
            continue;
          }
          
          // Extraer base64 y extensión
          const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          
          console.log(`[IMAGE] Buffer size: ${buffer.length} bytes`);
          
          // Generar nombre único
          const timestamp = Date.now();
          const random = crypto.randomBytes(8).toString('hex');
          const ext = img.name ? path.extname(img.name).toLowerCase() : '.png';
          const fileName = `${sid.substring(0, 20)}_${timestamp}_${random}${ext}`;
          const filePath = path.join(UPLOADS_DIR, fileName);
          
          console.log(`[IMAGE] Saving to: ${filePath}`);
          
          // Guardar imagen
          fs.writeFileSync(filePath, buffer);
          
          // Verificar que se guardó
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`[IMAGE] File saved successfully: ${stats.size} bytes`);
          }
          
          // URL pública para acceder a la imagen
          const imageUrl = `${PUBLIC_BASE_URL}/uploads/${fileName}`;
          savedImageUrls.push(imageUrl);
          
          console.log(`[IMAGE] ✅ Guardada: ${fileName} -> ${imageUrl}`);
        } catch (err) {
          console.error(`[IMAGE] ❌ Error guardando imagen ${i + 1}:`, err.message);
          if (DEBUG_IMAGES) {
            console.error('[IMAGE] Stack:', err.stack);
          }
        }
      }
      
      if (savedImageUrls.length > 0) {
        console.log(`[IMAGE] Total images saved: ${savedImageUrls.length}`);
        
        // 🔍 ANALIZAR IMÁGENES CON VISION API
        if (openai && savedImageUrls.length > 0) {
          try {
            console.log('[VISION] Analyzing image(s) for problem detection...');
            
            const visionMessages = [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analizá esta imagen que subió un usuario de soporte técnico. 
Identificá:
1. ¿Qué tipo de problema o dispositivo se muestra?
2. ¿Hay mensajes de error visibles? ¿Cuáles?
3. ¿Qué información técnica relevante podés extraer?
4. Dame una respuesta conversacional en español para el usuario explicando lo que ves y qué podemos hacer.

Respondé con una explicación clara y útil para el usuario.`
                  },
                  ...savedImageUrls.map(url => ({
                    type: 'image_url',
                    image_url: {
                      url: url,
                      detail: 'high'
                    }
                  }))
                ]
              }
            ];
            
            const visionResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: visionMessages,
              max_tokens: 800,
              temperature: 0.4
            });
            
            const analysisText = visionResponse.choices[0]?.message?.content || '';
            
            if (analysisText) {
              console.log('[VISION] ✅ Analysis completed:', {
                hasAnalysis: true,
                length: analysisText.length,
                preview: 'present'
              });
              imageContext = `\n\n🔍 **Análisis de la imagen:**\n${analysisText}`;
              
              // Guardar análisis en la sesión
              session.images[session.images.length - 1].analysis = analysisText;
            }
            
          } catch (visionErr) {
            console.error('[VISION] ❌ Error analyzing image:', visionErr.message);
            imageContext = `\n\n[Usuario adjuntó ${savedImageUrls.length} imagen(es) del problema]`;
          }
        } else {
          imageContext = `\n\n[Usuario adjuntó ${savedImageUrls.length} imagen(es) del problema]`;
        }
        
        // Guardar referencia de imágenes en la sesión
        if (!session.images) session.images = [];
        session.images.push(...savedImageUrls.map(url => ({
          url: url,
          timestamp: nowIso()
        })));
        
      } else {
        console.warn('[IMAGE] No images were successfully saved');
      }
    }


    // Confirm / cancel pending ticket actions
    if (buttonToken === BUTTONS.CONFIRM_TICKET && session.pendingAction && session.pendingAction.type === 'create_ticket') {
      session.pendingAction = null;
      await saveSession(sid, session);
      try {
        return await createTicketAndRespond(session, sid, res);
      } catch (errCT) {
        console.error('[CONFIRM_TICKET]', errCT && errCT.message);
        const failReply = '❗ No pude generar el ticket en este momento. Probá de nuevo en unos minutos o escribí directo a STI por WhatsApp.';
        return res.json(withOptions({ ok: false, reply: failReply, stage: session.stage, options: [BUTTONS.CLOSE] }));
      }
    }
    if (buttonToken === BUTTONS.CANCEL && session.pendingAction) {
      session.pendingAction = null;
      await saveSession(sid, session);
      const loc = session.userLocale || 'es-AR';
      const isEnCancel = String(loc).toLowerCase().startsWith('en');
      let replyCancel;
      if (isEnCancel) {
        replyCancel = "Perfect, I won’t generate a ticket now. We can keep trying steps or you can change the problem description.";
      } else {
        replyCancel = "Perfecto, no genero el ticket ahora. Podemos seguir probando algunos pasos más o podés cambiar la descripción del problema.";
      }
      return res.json(withOptions({
        ok: true,
        reply: replyCancel,
        stage: session.stage,
        options: [BUTTONS.MORE_TESTS, BUTTONS.REPHRASE, BUTTONS.CLOSE]
      }));
    }

    // Detección rápida de datos sensibles (PII) y frustración
    const maskedPreview = maskPII(effectiveText);
    if (maskedPreview !== effectiveText) {
      session.frustrationCount = session.frustrationCount || 0;
      const piiLocale = session.userLocale || 'es-AR';
      const piiText = String(piiLocale).toLowerCase().startsWith('en')
        ? 'For your security I do not need passwords or bank details. Please, never send that kind of information here.'
        : 'Por seguridad no necesito ni debo recibir contraseñas ni datos bancarios. Por favor, nunca los envíes por chat.';
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', piiText, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });
    }

    if (FRUSTRATION_RX.test(t)) {
      session.frustrationCount = (session.frustrationCount || 0) + 1;
      await saveSession(sid, session);
      const loc = session.userLocale || 'es-AR';
      const isEnFr = String(loc).toLowerCase().startsWith('en');
      let replyFr;
      let optsFr;
      if (isEnFr) {
        replyFr = "Sorry if I wasn’t clear. We can try one more quick thing, some advanced tests, or I can create a ticket so a human technician can help you. What do you prefer?";
        optsFr = [BUTTONS.MORE_TESTS, BUTTONS.ADVANCED_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
      } else {
        replyFr = "Perdón si no fui claro. Podemos probar una cosa rápida más, realizar pruebas avanzadas, o genero un ticket para que te ayude un técnico humano. ¿Qué preferís?";
        optsFr = [BUTTONS.MORE_TESTS, BUTTONS.ADVANCED_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
      }
      return res.json(withOptions({
        ok: true,
        reply: replyFr,
        stage: session.stage,
        options: optsFr
      }));
    }

    // Guardar mensaje del usuario en el transcript (UNA VEZ, al inicio)
    const userTs = nowIso();
    const userMsg = buttonToken ? `[BOTÓN] ${buttonLabel || buttonToken}` : t;
    const conversationId = session.conversationId;
    
    // Usar helper único para persistir
    await appendAndPersistConversationEvent(session, conversationId, 'user', userMsg, {
      type: buttonToken ? 'button' : 'text',
      stage: session.stage,
      buttonToken: buttonToken || null,
      hasImages: images.length > 0,
      ts: userTs
    });

    // ========================================================
    // 🎯 P0: ROUTER GLOBAL DE BOTONES (ANTES de lógica de stage)
    // ========================================================
    // Los botones de control deben rutearse ANTES de cualquier lógica de stage
    // para evitar que caigan en detectAmbiguousDevice o otros handlers incorrectos
    if (buttonToken) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      
      // BTN_CONNECT_TECH: Conectar con técnico (NO pedir dirección/teléfono)
      if (buttonToken === 'BTN_CONNECT_TECH') {
        console.log('[BUTTON_ROUTER] 🎯 BTN_CONNECT_TECH detectado, ejecutando createTicketAndRespond');
        return await createTicketAndRespond(session, sid, res);
      }
      
      // BTN_MORE_TESTS / BTN_ADVANCED_TESTS: Más pruebas
      if (buttonToken === 'BTN_MORE_TESTS' || buttonToken === 'BTN_ADVANCED_TESTS') {
        console.log('[BUTTON_ROUTER] 🎯 BTN_MORE_TESTS/ADVANCED_TESTS detectado');
        // Continuar con lógica de stage normal (puede estar en BASIC_TESTS o ESCALATE)
        // No hacer return aquí, dejar que continúe
      }
      
      // BTN_CLOSE: Cerrar chat
      if (buttonToken === 'BTN_CLOSE') {
        console.log('[BUTTON_ROUTER] 🎯 BTN_CLOSE detectado');
        const whoLabel = session.userName ? capitalizeToken(session.userName) : 'Usuari@';
        const replyClose = isEn
          ? `Thanks for using Tecnos from STI — Intelligent Technical Service, ${whoLabel}. If you need help with your PC or devices later, you can come back here. 😉`
          : `Gracias por usar Tecnos de STI — Servicio Técnico Inteligente, ${whoLabel}. Si más adelante necesitás ayuda con tu PC o dispositivos, podés volver a escribir por acá. 😉`;
        session.stage = STATES.ENDED;
        await saveSession(sid, session);
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyClose, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: true, reply: replyClose, stage: session.stage, options: [] }));
      }
      
      // BTN_SOLVED / BTN_PERSIST: Ya tienen handlers en BASIC_TESTS, no hacer nada aquí
      // Otros botones: continuar con lógica de stage normal
    }

    // ========================================================
    // 🧠 MODO SUPER INTELIGENTE - Análisis del mensaje
    // ========================================================
    let smartAnalysis = null;
    const imageUrlsForAnalysis = savedImageUrls || [];
    const willUseVision = !!openai && Array.isArray(imageUrlsForAnalysis) && imageUrlsForAnalysis.length > 0;
    logMsg('info', '[CHAT:VISION_PLAN]', { sid, willUseVision, imageUrlsCount: (imageUrlsForAnalysis || []).length });
    
    // Solo analizar si no es un botón (los botones ya tienen intención clara)
    if (!buttonToken && SMART_MODE_ENABLED && openai) {
      smartAnalysis = await analyzeUserMessage(t, session, imageUrlsForAnalysis);
      
      // Si el análisis detecta que NO debe usar flujo estructurado, generar respuesta IA
      if (smartAnalysis.analyzed && !shouldUseStructuredFlow(smartAnalysis, session)) {
        console.log('[SMART_MODE] 🎯 Usando respuesta IA en lugar de flujo estructurado');
        
        const smartReply = await generateSmartResponse(smartAnalysis, session, {
          includeNextSteps: true,
          specificPrompt: smartAnalysis.problem?.detected 
            ? `El usuario reporta: ${smartAnalysis.problem.summary}. Respondé de forma útil y empática.`
            : 'Ayudá al usuario a clarificar su problema.'
        });
        
        if (smartReply) {
          // Determinar opciones basadas en el contexto
          let smartOptions = [];
          
          if (smartAnalysis.needsHumanHelp || smartAnalysis.sentiment === 'frustrated') {
            smartOptions = [BUTTONS.CONNECT_TECH, BUTTONS.MORE_TESTS, BUTTONS.CLOSE];
          } else if (smartAnalysis.problem?.detected) {
            smartOptions = [BUTTONS.MORE_TESTS, BUTTONS.ADVANCED_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
          } else {
            smartOptions = [BUTTONS.CLOSE];
          }
          
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', smartReply, {
            type: 'text',
            stage: session.stage,
            buttons: smartOptions,
            ts: nowIso()
          });
          
          return logAndReturn({
            ok: true,
            reply: smartReply,
            stage: session?.stage || 'unknown',
            options: smartOptions,
            buttons: smartOptions,
            aiPowered: true
          }, session?.stage || 'unknown', session?.stage || 'unknown', 'smart_ai_response', 'ai_replied', session);
        }
      }
      
      // Si detectó dispositivo/problema, actualizar sesión
      if (smartAnalysis.analyzed) {
        if (smartAnalysis.device?.detected && smartAnalysis.device.confidence > 0.7) {
          console.log('[SMART_MODE] 📱 Dispositivo detectado por IA:', smartAnalysis.device.type);
          // Mapear tipos de IA a dispositivos del sistema
          const deviceMap = {
            'notebook': 'notebook',
            'desktop': 'pc-escritorio',
            'monitor': 'monitor',
            'smartphone': 'celular',
            'tablet': 'tablet',
            'printer': 'impresora',
            'router': 'router'
          };
          if (deviceMap[smartAnalysis.device.type]) {
            session.device = deviceMap[smartAnalysis.device.type];
          }
        }
        
        if (smartAnalysis.problem?.detected && !session.problem) {
          console.log('[SMART_MODE] 🔍 Problema detectado por IA:', smartAnalysis.problem.summary);
          session.problem = smartAnalysis.problem.summary;
        }
      }
    }

    // Cerrar chat de forma prolija (movido fuera del bloque de creación)
    if (buttonToken === 'BTN_CLOSE' || /^\s*cerrar\s+chat\b/i.test(t)) {
      const whoLabel = session.userName ? capitalizeToken(session.userName) : 'Usuari@';
      const replyClose = `Gracias por usar Tecnos de STI — Servicio Técnico Inteligente, ${whoLabel}. Si más adelante necesitás ayuda con tu PC o dispositivos, podés volver a escribir por acá. 😉`;
      const tsClose = nowIso();
      session.stage = STATES.ENDED;
      session.waEligible = false;
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyClose, {
        type: 'text',
        stage: session.stage,
        ts: tsClose
      });
      return res.json(withOptions({ ok: true, reply: replyClose, stage: session.stage, options: [] }));
    }

    // Quick escalate via button or text (confirmation step)
    if (buttonToken === 'BTN_WHATSAPP' || /^\s*(?:enviar\s+whats?app|hablar con un tecnico|enviar whatsapp)$/i.test(t)) {
      session.pendingAction = { type: 'create_ticket' };
      await saveSession(sid, session);
      const loc = session.userLocale || 'es-AR';
      const isEnCT = String(loc).toLowerCase().startsWith('en');
      let replyCT;
      if (isEnCT) {
        replyCT = "I see you want to talk with a technician. Do you want me to create a ticket with this chat summary so you can send it by WhatsApp?";
      } else {
        replyCT = "Veo que querés hablar con un técnico. ¿Querés que genere un ticket con el resumen de esta conversación para enviarlo por WhatsApp?";
      }
      return res.json(withOptions({
        ok: true,
        reply: replyCT,
        stage: session.stage,
        options: [BUTTONS.CONFIRM_TICKET, BUTTONS.CANCEL]
      }));
    }

    // Help step detection
    session.helpAttempts = session.helpAttempts || {};
    session.lastHelpStep = session.lastHelpStep || null;
    let helpRequestedIndex = null;
    if (buttonToken && /^BTN_HELP_\d+$/.test(buttonToken)) {
      const m = buttonToken.match(/^BTN_HELP_(\d+)$/);
      if (m) helpRequestedIndex = Number(m[1]);
    } else {
      const mText = (t || '').match(/\bayuda(?:\s+paso)?\s*(\d+)\b/i);
      if (mText) helpRequestedIndex = Number(mText[1]);
    }

    if (helpRequestedIndex) {
      try {
        const idx = Number(helpRequestedIndex);
        let steps = [];
        if (session.stage === STATES.ADVANCED_TESTS) steps = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
        else if (session.stage === STATES.BASIC_TESTS) steps = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
        else steps = [];

        if (!steps || steps.length === 0) {
          const msg = 'Aún no propuse pasos para este nivel. Probá primero con las opciones anteriores.';
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', msg, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          return res.json(withOptions({ ok: false, reply: msg, stage: session.stage, options: [] }));
        }

        if (idx < 1 || idx > steps.length) {
          const msg = `Paso inválido. Elegí un número entre 1 y ${steps.length}.`;
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', msg, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          return res.json(withOptions({ ok: false, reply: msg, stage: session.stage, options: [] }));
        }

        session.helpAttempts[idx] = (session.helpAttempts[idx] || 0) + 1;
        session.lastHelpStep = idx;
        session.stage = session.stage || STATES.BASIC_TESTS;

        const stepText = steps[idx - 1];
        let helpDetail = await getHelpForStep(stepText, idx, session.device || '', session.problem || '');
        if (!helpDetail || String(helpDetail).trim() === '') {
          helpDetail = `Para realizar el paso ${idx}: ${stepText}\nSi necesitás más ayuda respondé "No entendí" o tocá 'Conectar con Técnico'.`;
        }

        const attempts = session.helpAttempts[idx] || 0;
        let extraLine = '';
        if (attempts >= 2) extraLine = '\n\nVeo que este paso viene costando. Si querés, te puedo conectar con un técnico por WhatsApp.';

        const ts = nowIso();
        const reply = `🛠️ Ayuda — Paso ${idx}\n\n${helpDetail}${extraLine}\n\nDespués de probar esto, ¿cómo te fue?`;

        // NO duplicar el mensaje del usuario, ya se guardó al inicio
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts
        });

        try {
          const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
          const userLine = `[${ts}] USER: ${buttonToken ? '[BOTON] ' + buttonLabel : `ayuda paso ${idx}`}\n`;
          const botLine = `[${ts}] ASSISTANT: ${reply}\n`;
          fs.appendFile(tf, userLine, () => { });
          fs.appendFile(tf, botLine, () => { });
        } catch (e) { /* noop */ }

        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const isAdvanced = session.stage === STATES.ADVANCED_TESTS;
        const unifiedOpts = isEn 
          ? (isAdvanced 
              ? ['I solved it ✔️', 'Show advanced steps again ⏪', 'Connect with Technician 🧑‍💻']
              : ['I solved it ✔️', 'Show steps again ⏪', 'Connect with Technician 🧑‍💻'])
          : (isAdvanced 
              ? ['Lo pude solucionar ✔️', 'Volver a los pasos avanzados ⏪', 'Conectar con Técnico 🧑‍💻']
              : ['Lo pude solucionar ✔️', 'Volver a los pasos ⏪', 'Conectar con Técnico 🧑‍💻']);
        return res.json(withOptions({ ok: true, help: { stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: unifiedOpts }));
      } catch (err) {
        console.error('[help_step] Error generando ayuda:', err && err.message);
        const msg = 'No pude preparar la ayuda ahora. Probá de nuevo en unos segundos.';
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', msg, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: false, reply: msg, stage: session.stage, options: [] }));
      }
    }

    // Limitar transcript a últimos 100 mensajes para prevenir crecimiento indefinido
    if (session.transcript.length > 100) {
      session.transcript = session.slice(-100);
    }

    // ========================================================
    // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #2
    // ========================================================
    // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
    // 📅 Última validación: 25/11/2025
    // ✅ Estado: FUNCIONAL Y TESTEADO
    //
    // 🚨 ANTES DE MODIFICAR:
    //    1. Consultar con el equipo
    //    2. Verificar compliance GDPR
    //    3. Testear ambos idiomas (ES/EN)
    //    4. Validar flujo de rechazo (botón "No")
    //
    // 📋 Funcionalidad protegida:
    //    - Detección de aceptación GDPR (Sí/acepto/ok/dale)
    //    - Detección de rechazo GDPR (No/no acepto/rechazo)
    //    - Selección de idioma (Español/English)
    //    - Transición a stage ASK_NAME después de idioma
    //    - Guardado de gdprConsent + gdprConsentDate
    //
    // 🔗 Dependencias:
    //    - Frontend: Botones "Sí"/"No" envían estos valores
    //    - Frontend: Botones idioma envían "español"/"english"
    //    - Next stage: ASK_NAME espera userLocale configurado
    //    - Legal: GDPR compliance depende de este consentimiento
    //
    // ========================================================
    // 🔐 ASK_LANGUAGE: Procesar consentimiento GDPR y selección de idioma
    console.log('[DEBUG] Checking ASK_LANGUAGE - Current stage:', session.stage, 'STATES.ASK_LANGUAGE:', STATES.ASK_LANGUAGE, 'Match:', session.stage === STATES.ASK_LANGUAGE);

    if (session.stage === STATES.ASK_LANGUAGE) {
      const lowerMsg = effectiveText.toLowerCase().trim();
      console.log('[ASK_LANGUAGE] DEBUG - Processing:', lowerMsg, 'hasButtonToken:', !!buttonToken, 'GDPR consent:', session.gdprConsent);

      // Detectar aceptación de GDPR
      if (/\b(si|sí|acepto|aceptar|ok|dale|de acuerdo|agree|accept|yes)\b/i.test(lowerMsg)) {
        session.gdprConsent = true;
        session.gdprConsentDate = nowIso();
        console.log('[GDPR] ✅ Consentimiento otorgado:', session.gdprConsentDate);

        // Mostrar selección de idioma
        const reply = `✅ **Gracias por aceptar**\n\n🌍 **Seleccioná tu idioma / Select your language:**`;
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });

        return res.json({
          ok: true,
          reply,
          stage: session.stage,
          buttons: [
            { text: '(🇦🇷) Español 🌎', value: 'español' },
            { text: '(🇺🇸) English 🌎', value: 'english' }
          ]
        });
      }

      // Detectar rechazo de GDPR
      if (/\b(no|no acepto|no quiero|rechazo|cancel|decline)\b/i.test(lowerMsg)) {
        const reply = `😔 Entiendo. Sin tu consentimiento no puedo continuar.\n\nSi cambiás de opinión, podés volver a iniciar el chat.\n\n📧 Para consultas sin registro, escribinos a: web@stia.com.ar`;
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });

        return res.json({
          ok: true,
          reply,
          stage: session.stage
        });
      }

      // Detectar selección de idioma (después de aceptar GDPR)
      if (session.gdprConsent) {
        if (/español|spanish|es-|arg|latino/i.test(lowerMsg)) {
          session.userLocale = 'es-AR';
          session.stage = STATES.ASK_NAME;

          const reply = `✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊`;
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });

          return res.json({
            ok: true,
            reply,
            stage: session.stage,
            buttons: [
              { text: '🙈 Prefiero no decirlo', value: 'prefiero_no_decirlo' }
            ]
          });
        }

        if (/english|inglés|ingles|en-|usa|uk/i.test(lowerMsg)) {
          session.userLocale = 'en-US';
          session.stage = STATES.ASK_NAME;

          const reply = `✅ Great! Let's continue in **English**.\n\nWhat's your name?`;
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });

          return res.json({
            ok: true,
            reply,
            stage: session.stage,
            buttons: [
              { text: '🙈 I prefer not to say', value: 'prefer_not_to_say' }
            ]
          });
        }
      }

      // Si no se reconoce la respuesta, re-mostrar opciones
      const retry = `Por favor, seleccioná una de las opciones usando los botones. / Please select one of the options using the buttons.`;
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', retry, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });

      return res.json({
        ok: true,
        reply: retry,
        stage: session.stage,
        buttons: session.gdprConsent
          ? [
            { text: '(🇦🇷) Español 🌎', value: 'español' },
            { text: '(🇺🇸) English 🌎', value: 'english' }
          ]
          : [
            { text: 'Sí Acepto / I Agree ✔️', value: 'si' },
            { text: 'No Acepto / I Don\'t Agree ❌', value: 'no' }
          ]
      });
    }

    // ============================================
    // ========================================================
    // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #8
    // ========================================================
    // ⚠️  ADVERTENCIA: Esta lógica está funcionando en producción
    // 📅 Última validación: 25/11/2025
    // ✅ Estado: FUNCIONAL Y OPTIMIZADO (Sistema de 2 intents)
    //
    // 🚨 ANTES DE MODIFICAR:
    //    1. Sistema simplificado de 5 → 2 categorías principales
    //    2. Detección automática por palabras clave funcionando
    //    3. NO agregar nuevos needType sin crear handlers
    //    4. Sincronizar con CONFIG.ui.buttons (línea ~348)
    //
    // 📋 Funcionalidad protegida:
    //    - Detección por botones: BTN_PROBLEMA, BTN_CONSULTA
    //    - Detección por texto: palabras clave regex
    //    - Mapeo a 2 intents: problema, consulta_general
    //
    // 🔗 Dependencias:
    //    - CONFIG.ui.buttons debe tener BTN_PROBLEMA y BTN_CONSULTA
    //    - Handlers de respuesta en líneas ~3720-3745
    //    - Frontend muestra description/example de cada botón
    //
    // 💡 Lógica de Detección:
    //    - "problema|no funciona|error|falla" → problema
    //    - "instalar|configurar|cómo hago|guía" → consulta_general
    //
    // ========================================================
    // 🔒 PROTECCIÓN ACTIVA - NO MODIFICAR SIN AUTORIZACIÓN
    // ============================================
    // BLOQUE: Detección de intent por botones y palabras clave
    // Propósito: Mapear botones/texto a tipos de necesidad del usuario
    // Funcionalidad: Detecta 2 intents principales (problema, consulta_general)
    // Autor: Sistema STI - GitHub Copilot + Lucas
    // Última modificación: 25/11/2025 - Simplificado de 5 a 2 categorías
    // 
    // ADVERTENCIA: Esta lógica debe sincronizarse con:
    //   - Tokens en CONFIG.ui.buttons (línea ~348)
    //   - Handlers de cada needType (líneas posteriores)
    // No modificar sin implementar lógica para nuevos tipos.
    // ============================================
    // ASK_NEED: Fallback para sesiones antiguas - redirigir automáticamente a ASK_PROBLEM
    if (session.stage === STATES.ASK_NEED) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const whoName = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
      
      // Redirigir automáticamente a ASK_PROBLEM con el nuevo texto
      session.stage = STATES.ASK_PROBLEM;
      
      const reply = isEn
        ? `🤖 Perfect. Tell me what you need and I'll guide you step by step.\n\nWrite it as it comes to you 👇 (it can be a problem, a question, or something you want to learn/configure).\n\n📌 If you can, add 1 or 2 details (optional):\n• What is it about? (PC / notebook / phone / router / printer / app / account / system)\n• What do you want to achieve or what's happening? (what it does / what it doesn't do / since when)\n• If there's an on-screen message, copy it or tell me roughly what it says\n\n📷 If you have a photo or screenshot, send it with the clip and I'll see it faster 🤖⚡\nIf you don't know the model or there's no error, no problem: describe what you see and that's it 🤖✅`
        : (locale === 'es-419'
          ? `🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`
          : `🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`);
      
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    }

    // ========================================================
    // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #3
    // ========================================================
    // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
    // 📅 Última validación: 25/11/2025
    // ✅ Estado: FUNCIONAL Y TESTEADO
    //
    // 🚨 ANTES DE MODIFICAR:
    //    1. Consultar con el equipo
    //    2. Verificar validación de nombres
    //    3. Testear botón "Prefiero no decirlo"
    //    4. Validar extracción y capitalización de nombres
    //
    // 📋 Funcionalidad protegida:
    //    - Detección de botón "Prefiero no decirlo" (ambos idiomas)
    //    - Validación de nombres con extractName() e isValidName()
    //    - Capitalización de nombres multi-palabra
    //    - Límite de 5 intentos antes de continuar sin nombre
    //    - Transición a stage ASK_NEED con botones técnica/asistencia
    //
    // 🔗 Dependencias:
    //    - Frontend: Botón "Prefiero no decirlo" envía value específico
    //    - Frontend: Input de texto envía nombre como text
    //    - Funciones: extractName(), isValidName(), capitalizeToken()
    //    - Next stage: ASK_NEED usa userName en saludos
    //
    // ========================================================
    // ASK_NAME consolidated: validate locally and with OpenAI if available

    if (session.stage === STATES.ASK_NAME) {
      console.log('[ASK_NAME] DEBUG - hasButtonToken:', !!buttonToken, 'textLength:', effectiveText?.length || 0);
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');

      // 🔘 Detectar botón "Prefiero no decirlo"
      if (buttonToken === 'prefiero_no_decirlo' || buttonToken === 'prefer_not_to_say' || /prefiero\s*no\s*(decir|say)/i.test(effectiveText)) {
        session.userName = isEn ? 'User' : 'Usuari@';
        session.stage = STATES.ASK_PROBLEM;

        const reply = isEn
          ? `✅ No problem! Let's continue.\n\n🤖 Perfect. Tell me what you need and I'll guide you step by step.\n\nWrite it as it comes to you 👇 (it can be a problem, a question, or something you want to learn/configure).\n\n📌 If you can, add 1 or 2 details (optional):\n• What is it about? (PC / notebook / phone / router / printer / app / account / system)\n• What do you want to achieve or what's happening? (what it does / what it doesn't do / since when)\n• If there's an on-screen message, copy it or tell me roughly what it says\n\n📷 If you have a photo or screenshot, send it with the clip and I'll see it faster 🤖⚡\nIf you don't know the model or there's no error, no problem: describe what you see and that's it 🤖✅`
          : `✅ ¡Sin problema! Sigamos.\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`;

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });

        return res.json({
          ok: true,
          reply,
          stage: session.stage,
          options: [],
          buttons: []
        });
      }

      // Límite de intentos: después de 5 intentos, seguimos con nombre genérico
      if ((session.nameAttempts || 0) >= 5) {
        session.userName = isEn ? 'User' : 'Usuario';
        session.stage = STATES.ASK_PROBLEM;

        const reply = isEn
          ? `Let's continue without your name.\n\n🤖 Perfect. Tell me what you need and I'll guide you step by step.\n\nWrite it as it comes to you 👇 (it can be a problem, a question, or something you want to learn/configure).\n\n📌 If you can, add 1 or 2 details (optional):\n• What is it about? (PC / notebook / phone / router / printer / app / account / system)\n• What do you want to achieve or what's happening? (what it does / what it doesn't do / since when)\n• If there's an on-screen message, copy it or tell me roughly what it says\n\n📷 If you have a photo or screenshot, send it with the clip and I'll see it faster 🤖⚡\nIf you don't know the model or there's no error, no problem: describe what you see and that's it 🤖✅`
          : (locale === 'es-419'
            ? `Sigamos sin tu nombre.\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`
            : `Sigamos sin tu nombre.\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`);

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
      }

      // Prefiero no decirlo (texto o botón)
      if (NO_NAME_RX.test(t) || buttonToken === 'BTN_NO_NAME' || buttonToken === 'Prefiero no decirlo 🙅') {
        session.userName = isEn ? 'User' : 'Usuario';
        session.stage = STATES.ASK_PROBLEM;

        const reply = isEn
          ? `No problem, we'll continue without your name.\n\n🤖 Perfect. Tell me what you need and I'll guide you step by step.\n\nWrite it as it comes to you 👇 (it can be a problem, a question, or something you want to learn/configure).\n\n📌 If you can, add 1 or 2 details (optional):\n• What is it about? (PC / notebook / phone / router / printer / app / account / system)\n• What do you want to achieve or what's happening? (what it does / what it doesn't do / since when)\n• If there's an on-screen message, copy it or tell me roughly what it says\n\n📷 If you have a photo or screenshot, send it with the clip and I'll see it faster 🤖⚡\nIf you don't know the model or there's no error, no problem: describe what you see and that's it 🤖✅`
          : (locale === 'es-419'
            ? `Perfecto, seguimos sin tu nombre.\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`
            : `Perfecto, seguimos sin tu nombre.\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`);

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({
          ok: true,
          reply,
          stage: session.stage,
          options: []
        }));
      }

      // Si el texto claramente parece un problema o frase genérica, pedimos solo el nombre
      if (looksClearlyNotName(t)) {
        session.nameAttempts = (session.nameAttempts || 0) + 1;

        const reply = isEn
          ? "I didn't detect a name. Could you tell me just your name? For example: “Ana” or “John Paul”."
          : (locale === 'es-419'
            ? "No detecté un nombre. ¿Podrías decirme solo tu nombre? Por ejemplo: “Ana” o “Juan Pablo”."
            : "No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: “Ana” o “Juan Pablo”.");

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({
          ok: true,
          reply,
          stage: session.stage,
          options: [
            { token: 'BTN_NO_NAME', label: isEn ? "I'd rather not say" : "Prefiero no decirlo" }
          ]
        }));
      }

      const candidate = extractName(t);
      if (!candidate || !isValidName(candidate)) {
        session.nameAttempts = (session.nameAttempts || 0) + 1;

        const reply = isEn
          ? "I didn't detect a valid name. Please tell me only your name, for example: “Ana” or “John Paul”."
          : (locale === 'es-419'
            ? "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: “Ana” o “Juan Pablo”."
            : "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: “Ana” o “Juan Pablo”.");

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({
          ok: true,
          reply,
          stage: session.stage,
          options: [
            { token: 'BTN_NO_NAME', label: isEn ? "I'd rather not say" : "Prefiero no decirlo" }
          ]
        }));
      }

      // Nombre aceptado - transición directa a ASK_PROBLEM (sin clasificación)
      session.userName = candidate;
      session.stage = STATES.ASK_PROBLEM;
      session.nameAttempts = 0;

      const empatheticMsg = addEmpatheticResponse('ASK_NAME', locale);
      const reply = isEn
        ? `${empatheticMsg} Thanks, ${capitalizeToken(session.userName)}. 👍\n\n🤖 Perfect. Tell me what you need and I'll guide you step by step.\n\nWrite it as it comes to you 👇 (it can be a problem, a question, or something you want to learn/configure).\n\n📌 If you can, add 1 or 2 details (optional):\n• What is it about? (PC / notebook / phone / router / printer / app / account / system)\n• What do you want to achieve or what's happening? (what it does / what it doesn't do / since when)\n• If there's an on-screen message, copy it or tell me roughly what it says\n\n📷 If you have a photo or screenshot, send it with the clip and I'll see it faster 🤖⚡\nIf you don't know the model or there's no error, no problem: describe what you see and that's it 🤖✅`
        : (locale === 'es-419'
          ? `${empatheticMsg} Gracias, ${capitalizeToken(session.userName)}. 👍\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`
          : `${empatheticMsg} Gracias, ${capitalizeToken(session.userName)}. 👍\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`);

      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });
      return res.json({
        ok: true,
        reply,
        stage: session.stage,
        options: [],
        buttons: []
      });
    }

    // Inline fallback extraction (if we are not in ASK_NAME)
    {
      const nmInline2 = extractName(effectiveText);
      if (nmInline2 && !session.userName && isValidHumanName(nmInline2)) {
        session.userName = nmInline2;
        if (session.stage === STATES.ASK_NAME) {
          session.stage = STATES.ASK_PROBLEM;
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          const empatia = addEmpatheticResponse('ASK_NAME', locale);
          const reply = isEn
            ? `${empatia} Great, ${session.userName}! 👍\n\n🤖 Perfect. Tell me what you need and I'll guide you step by step.\n\nWrite it as it comes to you 👇 (it can be a problem, a question, or something you want to learn/configure).\n\n📌 If you can, add 1 or 2 details (optional):\n• What is it about? (PC / notebook / phone / router / printer / app / account / system)\n• What do you want to achieve or what's happening? (what it does / what it doesn't do / since when)\n• If there's an on-screen message, copy it or tell me roughly what it says\n\n📷 If you have a photo or screenshot, send it with the clip and I'll see it faster 🤖⚡\nIf you don't know the model or there's no error, no problem: describe what you see and that's it 🤖✅`
            : (locale === 'es-419'
              ? `${empatia} ¡Genial, ${session.userName}! 👍\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`
              : `${empatia} ¡Genial, ${session.userName}! 👍\n\n🤖 Perfecto. Contame qué necesitás y te guío paso a paso.\n\nEscribilo como te salga 👇 (puede ser un problema, una consulta o algo que querés aprender/configurar).\n\n📌 Si podés, sumá 1 o 2 datos (opcional):\n• ¿Sobre qué es? (PC / notebook / celular / router / impresora / app / cuenta / sistema)\n• ¿Qué querés lograr o qué está pasando? (qué hace / qué no hace / desde cuándo)\n• Si hay mensaje en pantalla, copialo o decime más o menos qué dice\n\n📷 Si tenés una foto o captura, mandala con el clip y lo veo más rápido 🤖⚡\nSi no sabés el modelo o no hay error, no pasa nada: describime lo que ves y listo 🤖✅`);
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
        }
      }
    }

    // Reformulate problem
    if (/^\s*reformular\s*problema\s*$/i.test(t)) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const whoName = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
      const reply = isEn
        ? `Let's try again, ${whoName}! 👍\n\nTell me: what problem are you having or what do you need help with?`
        : (locale === 'es-419'
          ? `¡Intentemos nuevamente, ${whoName}! 👍\n\nAhora cuéntame: ¿qué problema estás teniendo o en qué necesitas ayuda?`
          : `¡Intentemos nuevamente, ${whoName}! 👍\n\nAhora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`);
      session.stage = STATES.ASK_PROBLEM;
      session.problem = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    }

    // State machine core: ASK_PROBLEM -> ASK_DEVICE -> BASIC_TESTS -> ...
    let reply = '';
    let options = [];

    if (session.stage === STATES.ASK_PROBLEM) {
      session.problem = effectiveText || session.problem;
      console.log('[ASK_PROBLEM] session.device:', session.device, 'session.problem:', session.problem);
      console.log('[ASK_PROBLEM] imageContext:', imageContext ? 'YES (' + imageContext.length + ' chars)' : 'NO');

      // 🖼️ SI HAY ANÁLISIS DE IMAGEN, RESPONDER CON ESE ANÁLISIS PRIMERO
      if (imageContext && imageContext.includes('🔍 **Análisis de la imagen:**')) {
        console.log('[ASK_PROBLEM] ✅ Respondiendo con análisis de imagen');
        
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        
        const responseText = imageContext + (isEn 
          ? '\n\n**What would you like to do?**' 
          : '\n\n**¿Qué te gustaría hacer?**');
        
        const nextOptions = [
          BUTTONS.MORE_TESTS,
          BUTTONS.ADVANCED_TESTS,
          BUTTONS.CONNECT_TECH,
          BUTTONS.CLOSE
        ];
        
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', responseText, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        
        return logAndReturn({
          ok: true,
          reply: responseText,
          stage: session?.stage || 'unknown',
          options: nextOptions,
          buttons: nextOptions
        }, session?.stage || 'unknown', session?.stage || 'unknown', 'image_analysis', 'image_analyzed', session);
      }

      // ========================================================
      // 🎯 DETECCIÓN INTELIGENTE DE DISPOSITIVOS AMBIGUOS
      // ========================================================
      if (!session.device && session.problem) {
        console.log('[detectAmbiguousDevice] Llamando con:', session.problem);
        
        // 🧠 Priorizar detección por IA si está disponible
        if (smartAnalysis?.device?.detected && smartAnalysis.device.confidence > 0.6) {
          console.log('[SMART_MODE] 🎯 Usando detección de dispositivo por IA');
          const deviceMap = {
            'notebook': 'notebook',
            'desktop': 'pc-escritorio',
            'monitor': 'monitor',
            'smartphone': 'celular',
            'tablet': 'tablet',
            'printer': 'impresora',
            'router': 'router'
          };
          
          if (deviceMap[smartAnalysis.device.type]) {
            session.device = deviceMap[smartAnalysis.device.type];
            console.log('[SMART_MODE] ✅ Dispositivo asignado automáticamente:', session.device);
            // Continuar al siguiente stage sin preguntar
          }
        }
        
        // Si la IA no detectó con confianza, usar el sistema de reglas
        if (!session.device) {
          const ambiguousResult = detectAmbiguousDevice(session.problem);
          console.log('[detectAmbiguousDevice] Resultado:', JSON.stringify(ambiguousResult, null, 2));

          if (ambiguousResult) {
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          const confidence = ambiguousResult.confidence;

          // CASO 1: Alta confianza (>=0.33 = 1+ keywords) - Confirmar con 1 botón
          if (confidence >= 0.33 && ambiguousResult.bestMatch) {
            const device = ambiguousResult.bestMatch;
            session.stage = 'CONFIRM_DEVICE';
            session.pendingDevice = device;

            const replyText = isEn
              ? `Do you mean your **${device.label}**?`
              : (locale === 'es-419'
                ? `¿Te referís a tu **${device.label}**?`
                : `¿Te referís a tu **${device.label}**?`);

            const confirmButtons = [
              {
                token: 'DEVICE_CONFIRM_YES',
                icon: '✅',
                label: isEn ? 'Yes' : 'Sí',
                description: device.description,
                text: isEn ? 'Yes' : 'Sí'
              },
              {
                token: 'DEVICE_CONFIRM_NO',
                icon: '🔄',
                label: isEn ? 'No, it\'s another device' : 'No, es otro dispositivo',
                description: isEn ? 'Show me all options' : 'Mostrar todas las opciones',
                text: isEn ? 'No, other device' : 'No, otro dispositivo'
              }
            ];

            await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
              type: 'text',
              stage: session.stage,
              ts: nowIso()
            });

            return res.json({
              ok: true,
              reply: replyText,
              stage: session.stage,
              options: confirmButtons,
              buttons: confirmButtons
            });
          }

          // CASO 2: Baja confianza (<0.33) - Mostrar todos los botones
          session.stage = 'CHOOSE_DEVICE';
          session.ambiguousTerm = ambiguousResult.term;

          const replyText = isEn
            ? `To help you better, what type of device is your **${ambiguousResult.term}**?`
            : (locale === 'es-419'
              ? `Para ayudarte mejor, ¿qué tipo de dispositivo es tu **${ambiguousResult.term}**?`
              : `Para ayudarte mejor, ¿qué tipo de dispositivo es tu **${ambiguousResult.term}**?`);

          const deviceButtons = generateDeviceButtons(ambiguousResult.candidates);

          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });

          return res.json({
            ok: true,
            reply: replyText,
            stage: session.stage,
            options: deviceButtons,
            buttons: deviceButtons,
            disambiguation: true
          });
          }
        }
      }

      // Device disambiguation: when user mentions "pc / compu / computadora" but device is still unknown
      if (!session.device) {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const mWord = (session.problem || '').match(/\b(compu|computadora|ordenador|pc|computer)\b/i);
        if (mWord) {
          const rawWord = mWord[1];
          let shownWord;
          if (/^pc$/i.test(rawWord)) shownWord = 'PC';
          else if (/^compu$/i.test(rawWord)) shownWord = isEn ? 'computer' : 'la compu';
          else shownWord = rawWord.toLowerCase();
          session.stage = STATES.ASK_DEVICE;
          session.pendingDeviceGroup = 'compu';
          const replyText = isEn
            ? `Perfect. When you say "${shownWord}", which of these devices do you mean?`
            : (locale === 'es-419'
              ? `Perfecto. Cuando dices "${shownWord}", ¿a cuál de estos dispositivos te refieres?`
              : `Perfecto. Cuando decís "${shownWord}", ¿a cuál de estos dispositivos te referís?`);
          const optionTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
          const uiButtons = buildUiButtonsFromTokens(optionTokens, locale);
          const ts = nowIso();
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
            type: 'text',
            stage: session.stage,
            ts
          });

          const response = {
            ok: true,
            reply: replyText,
            stage: session.stage,
            options: uiButtons, // Enviar objetos completos en options
            buttons: uiButtons, // Agregar también en nivel raíz
            ui: {
              buttons: uiButtons
            }
          };

          console.log('[ASK_DEVICE] Response:', JSON.stringify(response, null, 2));

          return res.json(response);
        }
      }

      // OA analyze problem (optional) - incluir imágenes si las hay
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const ai = await analyzeProblemWithOA(session.problem || '', locale, savedImageUrls);
      const isIT = !!ai.isIT && (ai.confidence >= OA_MIN_CONF);
      
      // Guardar análisis de imagen en la sesión si hay imágenes
      if (savedImageUrls.length > 0 && ai.imageAnalysis) {
        console.log('[ASK_PROBLEM] Guardando análisis de imagen:', ai.imageAnalysis);
        // Actualizar la última imagen con el análisis
        if (session.images && session.images.length > 0) {
          const lastImageIndex = session.images.length - 1;
          session.images[lastImageIndex].analysis = {
            problemDetected: ai.imageAnalysis,
            errorMessages: [], // Podríamos extraer esto del análisis
            technicalDetails: ai.imageAnalysis,
            issueKey: ai.issueKey || 'generic',
            device: ai.device || null
          };
        }
      }

      if (!isIT) {
        const replyNotIT = isEn
          ? 'Sorry, I didn\'t understand your query or it\'s not IT-related. Do you want to rephrase?'
          : (locale === 'es-419'
            ? 'Disculpa, no entendí tu consulta o no es informática. ¿Quieres reformular?'
            : 'Disculpa, no entendí tu consulta o no es informática. ¿Querés reformular?');
        const reformBtn = isEn ? 'Rephrase Problem' : 'Reformular Problema';
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyNotIT, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: true, reply: replyNotIT, stage: session.stage, options: [reformBtn] }));
      }

      if (ai.device) session.device = session.device || ai.device;
      if (ai.issueKey) session.issueKey = session.issueKey || ai.issueKey;

      // ========================================================
      // 🚫 P0: VALIDACIÓN DURA - No avanzar sin problema real
      // ========================================================
      const normalizedProblem = normalizeProblem(ai.problem || session.problem || effectiveText);
      const problemValid = isValidProblem(normalizedProblem);
      const looksLikeDeviceOnly = isDeviceOnly(
        effectiveText || session.problem || '',
        ai.device,
        null, // model no viene de analyzeProblemWithOA directamente
        normalizedProblem
      );
      
      // Si el problema no es válido O parece solo dispositivo, NO avanzar
      if (!problemValid || looksLikeDeviceOnly) {
        console.log('[ASK_PROBLEM] ⚠️ Problema inválido o solo dispositivo detectado:', {
          problemValid,
          looksLikeDeviceOnly,
          normalizedProblem: normalizedProblem.substring(0, 100),
          device: ai.device || session.device
        });
        
        // Guardar dispositivo si se detectó, pero NO setear problem_validated
        if (ai.device) {
          session.device = session.device || ai.device;
        }
        
        // NO avanzar a BASIC_TESTS, permanecer en ASK_PROBLEM
        session.problem_validated = false;
        session.problem = null; // Limpiar problema inválido
        
        // Responder pidiendo el problema específico
        const whoName = session.userName ? capitalizeToken(session.userName) : null;
        let replyAskProblem = '';
        
        if (session.device) {
          const deviceLabel = session.deviceLabel || session.device || (isEn ? 'device' : 'equipo');
          if (isEn) {
            replyAskProblem = whoName
              ? `Perfect, ${whoName}. I see you have a ${deviceLabel}. Now tell me: what problem are you experiencing and since when?`
              : `Perfect. I see you have a ${deviceLabel}. Now tell me: what problem are you experiencing and since when?`;
          } else {
            replyAskProblem = whoName
              ? `Perfecto, ${whoName}. Ya tengo que es ${deviceLabel}. Ahora contame: ¿qué problema estás teniendo y desde cuándo?`
              : `Perfecto. Ya tengo que es ${deviceLabel}. Ahora contame: ¿qué problema estás teniendo y desde cuándo?`;
          }
        } else {
          if (isEn) {
            replyAskProblem = whoName
              ? `Thanks, ${whoName}. Now tell me: what problem are you experiencing with your device?`
              : `Thanks. Now tell me: what problem are you experiencing with your device?`;
          } else {
            replyAskProblem = whoName
              ? `Gracias, ${whoName}. Ahora contame: ¿qué problema estás teniendo con tu equipo?`
              : `Gracias. Ahora contame: ¿qué problema estás teniendo con tu equipo?`;
          }
        }
        
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyAskProblem, {
          type: 'text',
          stage: session.stage, // Mantener ASK_PROBLEM
          ts: nowIso()
        });
        
        return res.json(withOptions({ 
          ok: true, 
          reply: replyAskProblem, 
          stage: session.stage, // NO cambiar a BASIC_TESTS
          options: [] 
        }));
      }
      
      // Si llegó acá, el problema es válido → marcar como validado
      session.problem_validated = true;
      session.problem = normalizedProblem || session.problem || effectiveText;

      // Detectar si es solicitud de ayuda (How-To) o problema técnico
      if (ai.isHowTo && !ai.isProblem) {
        // Es una solicitud de guía/instalación/configuración
        session.isHowTo = true;
        session.stage = STATES.ASK_HOWTO_DETAILS;

        let replyHowTo = '';
        const deviceName = ai.device || (isEn ? 'device' : 'dispositivo');

        if (ai.issueKey === 'install_guide') {
          replyHowTo = isEn
            ? `Perfect, I'll help you install your ${deviceName}. To give you the exact instructions, I need to know:\n\n1. What operating system do you use? (Windows 10, Windows 11, Mac, Linux)\n2. What's the brand and model of the ${deviceName}?\n\nExample: "Windows 11, HP DeskJet 2720"`
            : (locale === 'es-419'
              ? `Perfecto, te voy a ayudar a instalar tu ${deviceName}. Para darte las instrucciones exactas, necesito saber:\n\n1. ¿Qué sistema operativo usas? (Windows 10, Windows 11, Mac, Linux)\n2. ¿Cuál es la marca y modelo del ${deviceName}?\n\nEjemplo: "Windows 11, HP DeskJet 2720"`
              : `Perfecto, te voy a ayudar a instalar tu ${deviceName}. Para darte las instrucciones exactas, necesito saber:\n\n1. ¿Qué sistema operativo usás? (Windows 10, Windows 11, Mac, Linux)\n2. ¿Cuál es la marca y modelo del ${deviceName}?\n\nEjemplo: "Windows 11, HP DeskJet 2720"`);
        } else if (ai.issueKey === 'setup_guide' || ai.issueKey === 'connect_guide') {
          replyHowTo = isEn
            ? `Sure, I'll help you set up your ${deviceName}. To give you the right instructions, tell me:\n\n1. What operating system do you have? (Windows 10, Windows 11, Mac, etc.)\n2. Brand and model of the ${deviceName}?\n\nExample: "Windows 10, Logitech C920"`
            : (locale === 'es-419'
              ? `Dale, te ayudo a configurar tu ${deviceName}. Para darte las instrucciones correctas, cuéntame:\n\n1. ¿Qué sistema operativo tienes? (Windows 10, Windows 11, Mac, etc.)\n2. ¿Marca y modelo del ${deviceName}?\n\nEjemplo: "Windows 10, Logitech C920"`
              : `Dale, te ayudo a configurar tu ${deviceName}. Para darte las instrucciones correctas, contame:\n\n1. ¿Qué sistema operativo tenés? (Windows 10, Windows 11, Mac, etc.)\n2. ¿Marca y modelo del ${deviceName}?\n\nEjemplo: "Windows 10, Logitech C920"`);
        } else {
          replyHowTo = isEn
            ? `Sure, I'll help you with your ${deviceName}. To give you specific instructions:\n\n1. What operating system do you use?\n2. Brand and model of the device?\n\nSo I can guide you step by step.`
            : (locale === 'es-419'
              ? `Claro, te ayudo con tu ${deviceName}. Para darte las instrucciones específicas:\n\n1. ¿Qué sistema operativo usas?\n2. ¿Marca y modelo del dispositivo?\n\nAsí puedo guiarte paso a paso.`
              : `Claro, te ayudo con tu ${deviceName}. Para darte las instrucciones específicas:\n\n1. ¿Qué sistema operativo usás?\n2. ¿Marca y modelo del dispositivo?\n\nAsí puedo guiarte paso a paso.`);
        }

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyHowTo, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json({ ok: true, reply: replyHowTo, stage: session.stage });
      }

      // Si llegó acá, es un PROBLEMA técnico → generar pasos de diagnóstico
      session.isProblem = true;
      session.isHowTo = false;

      // Generate and show steps
      return await generateAndShowSteps(session, sid, res);

    } else if (session.stage === STATES.ASK_HOWTO_DETAILS) {
      // User is responding with OS + device model for how-to guide
      const userResponse = t.toLowerCase();

      // Parse OS
      let detectedOS = null;
      if (/windows\s*11/i.test(userResponse)) detectedOS = 'Windows 11';
      else if (/windows\s*10/i.test(userResponse)) detectedOS = 'Windows 10';
      else if (/mac|macos|osx/i.test(userResponse)) detectedOS = 'macOS';
      else if (/linux|ubuntu|debian/i.test(userResponse)) detectedOS = 'Linux';

      // Parse device model (any remaining text after OS)
      let deviceModel = userResponse.trim();
      if (detectedOS) {
        deviceModel = userResponse.replace(/windows\s*(11|10)?|mac(os)?|osx|linux|ubuntu|debian/gi, '').trim();
      }

      // Store in session
      session.userOS = detectedOS || 'No especificado';
      session.deviceModel = deviceModel || 'Modelo no especificado';

      // Generate how-to guide using AI
      const deviceName = session.device || 'dispositivo';
      const issueKey = session.issueKey || 'install_guide';

      try {
        const howToPrompt = `Genera una guía paso a paso para ayudar a un usuario a ${issueKey === 'install_guide' ? 'instalar' :
          issueKey === 'setup_guide' ? 'configurar' :
            issueKey === 'connect_guide' ? 'conectar' : 'trabajar con'
          } su ${deviceName}.

Sistema Operativo: ${session.userOS}
Marca/Modelo: ${session.deviceModel}

Devolvé una respuesta en formato JSON con esta estructura:
{
  "steps": [
    "Paso 1: ...",
    "Paso 2: ...",
    "Paso 3: ..."
  ],
  "additionalInfo": "Información adicional útil (opcional)"
}

La guía debe ser:
- Específica para el SO y modelo mencionados
- Clara y fácil de seguir
- Con 5-8 pasos concretos
- Incluir enlaces oficiales de descarga si aplica (ej: sitio del fabricante)
- En español argentino informal (vos, tené en cuenta, etc.)`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Sos un asistente técnico experto en instalación y configuración de dispositivos.' },
            { role: 'user', content: howToPrompt }
          ],
          temperature: 0.3,
          max_tokens: 1000
        });

        const aiResponse = completion.choices[0]?.message?.content || '{}';
        let guideData = { steps: [], additionalInfo: '' };

        try {
          guideData = JSON.parse(aiResponse);
        } catch (parseErr) {
          console.error('[ASK_HOWTO_DETAILS] JSON parse error:', parseErr);
          // Fallback: extract steps from text
          const stepMatches = aiResponse.match(/Paso \d+:.*$/gm);
          if (stepMatches && stepMatches.length > 0) {
            guideData.steps = stepMatches;
          } else {
            guideData.steps = [aiResponse];
          }
        }

        // Store steps in session
        session.tests = session.tests || {};
        session.tests.howto = guideData.steps || [];
        session.currentStepIndex = 0;
        session.stage = STATES.BASIC_TESTS; // Reuse BASIC_TESTS flow for showing steps

        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
        let replyText = isEn
          ? `Perfect, ${whoLabel}! Here's the guide for ${deviceName} on ${session.userOS}:\n\n`
          : (locale === 'es-419'
            ? `Perfecto, ${whoLabel}! Acá tienes la guía para ${deviceName} en ${session.userOS}:\n\n`
            : `Perfecto, ${whoLabel}! Acá tenés la guía para ${deviceName} en ${session.userOS}:\n\n`);

        if (guideData.steps && guideData.steps.length > 0) {
          replyText += guideData.steps.join('\n\n');
        } else {
          replyText += isEn
            ? 'I could not generate the specific steps, but I recommend visiting the manufacturer official website to download drivers and instructions.'
            : (locale === 'es-419'
              ? 'No pude generar los pasos específicos, pero te recomiendo visitar el sitio oficial del fabricante para descargar drivers e instrucciones.'
              : 'No pude generar los pasos específicos, pero te recomiendo visitar el sitio oficial del fabricante para descargar drivers e instrucciones.');
        }

        if (guideData.additionalInfo) {
          replyText += `\n\n📌 ${guideData.additionalInfo}`;
        }

        replyText += isEn
          ? '\n\nDid it work? Reply "yes" or "no".'
          : '\n\n¿Te funcionó? Respondé "sí" o "no".';

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });

        return res.json(withOptions({
          ok: true,
          reply: replyText,
          stage: session.stage,
          options: buildUiButtonsFromTokens(['BTN_YES', 'BTN_NO'])
        }));

      } catch (aiError) {
        console.error('[ASK_HOWTO_DETAILS] AI generation error:', aiError);
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const errorMsg = isEn
          ? 'I could not generate the guide right now. Can you rephrase your query or try again later?'
          : (locale === 'es-419'
            ? 'No pude generar la guía en este momento. ¿Puedes reformular tu consulta o intentar más tarde?'
            : 'No pude generar la guía en este momento. ¿Podés reformular tu consulta o intentar más tarde?');
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', errorMsg, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json({ ok: true, reply: errorMsg, stage: session.stage });
      }

    } else if (session.stage === STATES.ASK_DEVICE) {
      // Fallback handler for ASK_DEVICE
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      if (!buttonToken || !/^BTN_DEV_/.test(buttonToken)) {
        const replyText = isEn
          ? 'Please choose one of the options using the buttons I showed you.'
          : (locale === 'es-419'
            ? 'Por favor, elige una de las opciones con los botones que te mostré.'
            : 'Por favor, elegí una de las opciones con los botones que te mostré.');
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        const optionTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
        return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: buildUiButtonsFromTokens(optionTokens, locale) }));
      }

      // If user clicked a device token
      if (buttonToken && /^BTN_DEV_/.test(buttonToken)) {
        const deviceMap = {
          BTN_DEV_PC_DESKTOP: { device: 'pc', pcType: 'desktop', label: 'PC de escritorio' },
          BTN_DEV_PC_ALLINONE: { device: 'pc', pcType: 'all_in_one', label: 'PC All in One' },
          BTN_DEV_NOTEBOOK: { device: 'notebook', pcType: null, label: 'Notebook' }
        };
        const devCfg = deviceMap[buttonToken];
        if (devCfg) {
          session.device = devCfg.device;
          if (devCfg.pcType) session.pcType = devCfg.pcType;
          session.pendingDeviceGroup = null;

          // IMPORTANT: do not re-ask the problem; proceed to generate steps using existing session.problem
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          if (!session.problem || String(session.problem || '').trim() === '') {
            session.stage = STATES.ASK_PROBLEM;
            const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
            const replyText = isEn
              ? `Perfect, ${whoLabel}. I understand you're referring to ${devCfg.label}. Tell me, what problem does it have?`
              : (locale === 'es-419'
                ? `Perfecto, ${whoLabel}. Entiendo que te refieres a ${devCfg.label}. Cuéntame, ¿qué problema presenta?`
                : `Perfecto, ${whoLabel}. Tomo que te referís a ${devCfg.label}. Contame, ¿qué problema presenta?`);
            await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
              type: 'text',
              stage: session.stage,
              ts: nowIso()
            });
            return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: [] }));
          } else {
            // Provide short confirmation then show steps
            session.stage = STATES.ASK_PROBLEM;
            const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
            const replyIntro = isEn
              ? `Perfect, ${whoLabel}. I understand you're referring to ${devCfg.label}. I'll generate some steps for this problem:`
              : (locale === 'es-419'
                ? `Perfecto, ${whoLabel}. Entiendo que te refieres a ${devCfg.label}. Voy a generar algunos pasos para este problema:`
                : `Perfecto, ${whoLabel}. Tomo que te referís a ${devCfg.label}. Voy a generar algunos pasos para este problema:`);
            const ts = nowIso();
            await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyIntro, {
              type: 'text',
              stage: session.stage,
              ts
            });
            // proceed to generate steps
            return await generateAndShowSteps(session, sid, res);
          }
        }
      }

      const fallbackMsg = isEn
        ? 'I don\'t recognize that option. Please choose using the buttons.'
        : (locale === 'es-419'
          ? 'No reconozco esa opción. Elige por favor usando los botones.'
          : 'No reconozco esa opción. Elegí por favor usando los botones.');
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', fallbackMsg, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });
      const optionTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
      return res.json(withOptions({ ok: true, reply: fallbackMsg, stage: session.stage, options: buildUiButtonsFromTokens(optionTokens, locale) }));

      // ========================================================
      // 🎯 HANDLER: CONFIRM_DEVICE (Alta confianza - Confirmar dispositivo)
      // ========================================================
    } else if (session.stage === 'CONFIRM_DEVICE') {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');

      // Usuario confirmó el dispositivo
      // Aceptar token específico O variaciones de "Sí"
      if (buttonToken === 'DEVICE_CONFIRM_YES' || /^(si|sí|yes|s|y)$/i.test(buttonToken)) {
        const device = session.pendingDevice;
        session.device = device.id;
        session.deviceLabel = device.label;
        delete session.pendingDevice;

        const replyText = isEn
          ? `Perfect! I'll help you with your **${device.label}**.`
          : (locale === 'es-419'
            ? `¡Perfecto! Te ayudaré con tu **${device.label}**.`
            : `¡Perfecto! Te ayudo con tu **${device.label}**.`);

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        session.stage = STATES.ASK_PROBLEM;

        // Continuar con generación de pasos
        return await generateAndShowSteps(session, sid, res);
      }

      // Usuario dijo NO - mostrar todas las opciones
      if (buttonToken === 'DEVICE_CONFIRM_NO' || /^(no|n|nop|not)$/i.test(buttonToken) || /otro/i.test(buttonToken)) {
        session.stage = 'CHOOSE_DEVICE';
        const ambiguousResult = detectAmbiguousDevice(session.problem);

        const replyText = isEn
          ? `No problem. Please choose the correct device:`
          : (locale === 'es-419'
            ? `No hay problema. Por favor, elegí el dispositivo correcto:`
            : `No hay problema. Por favor, elegí el dispositivo correcto:`);

        const deviceButtons = ambiguousResult
          ? generateDeviceButtons(ambiguousResult.candidates)
          : [];

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });

        return res.json({
          ok: true,
          reply: replyText,
          stage: session.stage,
          options: deviceButtons,
          buttons: deviceButtons
        });
      }

      // Fallback
      const fallbackMsg = isEn
        ? 'Please choose one of the options.'
        : (locale === 'es-419'
          ? 'Por favor, elegí una de las opciones.'
          : 'Por favor, elegí una de las opciones.');
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', fallbackMsg, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });
      return res.json({ ok: true, reply: fallbackMsg, stage: session.stage });

      // ========================================================
      // 🎯 HANDLER: CHOOSE_DEVICE (Baja confianza - Elegir dispositivo)
      // ========================================================
    } else if (session.stage === 'CHOOSE_DEVICE') {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');

      // Usuario eligió un dispositivo
      // Aceptar tanto token (DEVICE_*) como label directo del frontend
      if (buttonToken) {
        const ambiguousResult = detectAmbiguousDevice(session.problem);
        let selectedDevice = null;

        if (ambiguousResult) {
          // Intento 1: Buscar por token (formato: DEVICE_PC_DESKTOP)
          if (buttonToken.startsWith('DEVICE_')) {
            const deviceId = buttonToken.replace('DEVICE_', '');
            selectedDevice = ambiguousResult.candidates.find(d => d.id === deviceId);
          }

          // Intento 2: Buscar por label exacto (formato: "PC de Escritorio")
          if (!selectedDevice) {
            selectedDevice = ambiguousResult.candidates.find(d => d.label === buttonToken);
          }

          // Intento 3: Buscar por label case-insensitive
          if (!selectedDevice) {
            const lowerToken = buttonToken.toLowerCase();
            selectedDevice = ambiguousResult.candidates.find(d => d.label.toLowerCase() === lowerToken);
          }

          if (selectedDevice) {
            session.device = selectedDevice.id;
            session.deviceLabel = selectedDevice.label;
            delete session.ambiguousTerm;

            const replyText = isEn
              ? `Perfect! I'll help you with your **${selectedDevice.label}**.`
              : (locale === 'es-419'
                ? `¡Perfecto! Te ayudaré con tu **${selectedDevice.label}**.`
                : `¡Perfecto! Te ayudo con tu **${selectedDevice.label}**.`);

            await appendAndPersistConversationEvent(session, session.conversationId, 'bot', replyText, {
              type: 'text',
              stage: session.stage,
              ts: nowIso()
            });
            session.stage = STATES.ASK_PROBLEM;
            await saveSession(sid, session);

            console.log('[CHOOSE_DEVICE] ✅ Dispositivo seleccionado:', selectedDevice.label, '(', selectedDevice.id, ')');

            // Continuar con generación de pasos
            return await generateAndShowSteps(session, sid, res);
          }
        }
      }

      // Fallback
      const fallbackMsg = isEn
        ? 'Please choose one of the device options.'
        : (locale === 'es-419'
          ? 'Por favor, elegí una de las opciones de dispositivo.'
          : 'Por favor, elegí una de las opciones de dispositivo.');
      await appendAndPersistConversationEvent(session, session.conversationId, 'bot', fallbackMsg, {
        type: 'text',
        stage: session.stage,
        ts: nowIso()
      });

      console.log('[CHOOSE_DEVICE] ⚠️ No se reconoció el dispositivo. hasButtonToken:', !!buttonToken);

      return res.json({ ok: true, reply: fallbackMsg, stage: session.stage });

    } else if (session.stage === STATES.BASIC_TESTS) {
      // 1. Manejo de "Volver a los pasos"
      if (buttonToken === 'BTN_BACK_TO_STEPS') {
        return await generateAndShowSteps(session, sid, res);
      }

      // 2. Manejo de Ayuda por Paso (BTN_HELP_STEP_X)
      if (buttonToken && buttonToken.startsWith('BTN_HELP_STEP_')) {
        const stepIdx = parseInt(buttonToken.replace('BTN_HELP_STEP_', ''), 10);
        const stepText = session.basicTests[stepIdx];

        if (stepText) {
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');

          // Generar explicación con IA
          let explanation = '';
          try {
            explanation = await explainStepWithAI(stepText, stepIdx + 1, session.deviceLabel, session.problem, locale);
          } catch (err) {
            console.error('[BASIC_TESTS] Error generating help:', err);
            explanation = isEn
              ? "I couldn't generate a detailed explanation, but try to follow the step as best as you can."
              : "No pude generar una explicación detallada, pero tratá de seguir el paso lo mejor que puedas.";
          }

          const reply = isEn
            ? `**Help for Step ${stepIdx + 1}:**\n\n${explanation}`
            : `**Ayuda para el Paso ${stepIdx + 1}:**\n\n${explanation}`;

          const backButton = {
            text: isEn ? '⏪ Back to steps' : '⏪ Volver a los pasos anteriores',
            value: 'BTN_BACK_TO_STEPS'
          };

          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          return res.json(withOptions({ ok: true, reply, stage: session.stage }, [backButton]));
        }
      }

      const rxDontKnow = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
      if (rxDontKnow.test(t)) {
        const result = await handleDontUnderstand(session, sid, t);
        return res.json(withOptions(result));
      }

      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️|BTN_SOLVED)\b/i;
      const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌|BTN_PERSIST)\b/i;
      const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico|BTN_CONNECT_TECH)\b/i;
      const rxShowSteps = /^\s*(volver a los pasos|volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)\b/i;

      if (rxShowSteps.test(t)) {
        return await generateAndShowSteps(session, sid, res);
      }

      if (rxYes.test(t) || buttonToken === 'BTN_SOLVED') {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
        const empatia = addEmpatheticResponse('ENDED', locale);
        const firstLine = whoLabel
          ? (isEn ? `Excellent, ${whoLabel}! 🙌` : `¡Qué buena noticia, ${whoLabel}! 🙌`)
          : (isEn ? `Excellent! 🙌` : `¡Qué buena noticia! 🙌`);

        reply = isEn
          ? `${firstLine}\n\nI'm glad you solved it. Your equipment should work perfectly now. 💻✨\n\nIf another problem appears later, or you want help installing/configuring something, I'll be here. Just open the Tecnos chat. 🤝🤖\n\n📲 Follow us for more tips: @sti.rosario\n🌐 STI Web: https://stia.com.ar\n 🚀\n\nThanks for trusting Tecnos! 😉`
          : `${firstLine}\nMe alegra un montón que lo hayas solucionado. Tu equipo debería andar joya ahora. 💻✨\n\nSi más adelante aparece otro problema, o querés ayuda para instalar/configurar algo, acá voy a estar. Solo abrí el chat de Tecnos. 🤝🤖\n\n📲 Seguinos para más tips: @sti.rosario\n🌐 Web de STI: https://stia.com.ar\n 🚀\n\n¡Gracias por confiar en Tecnos! 😉`;

        session.stage = STATES.ENDED;
        session.waEligible = false;
        options = [];

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));

      } else if (rxNo.test(t) || buttonToken === 'BTN_PERSIST') {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const empatia = addEmpatheticResponse('ESCALATE', locale);
        // Custom message
        reply = isEn
          ? `💡 I understand. ${empatia} What would you like to do?`
          : `💡 Entiendo. ${empatia} ¿Querés que te ayude con algo más?`;
        // Custom buttons (usar una sola opción para solicitar pruebas avanzadas)
        options = buildUiButtonsFromTokens(['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
        session.stage = STATES.ESCALATE;

        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
      } else if (rxTech.test(t) || buttonToken === 'BTN_CONNECT_TECH') {
        // P0: BTN_CONNECT_TECH debe ejecutar acción real, no repreguntar
        console.log('[BASIC_TESTS] 🎯 BTN_CONNECT_TECH detectado, ejecutando createTicketAndRespond');
        return await createTicketAndRespond(session, sid, res);
      } else {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        reply = isEn
          ? `I didn't understand. Please choose an option from the buttons.`
          : (locale === 'es-419'
            ? `No te entendí. Por favor elegí una opción de los botones.`
            : `No te entendí. Por favor elegí una opción de los botones.`);
        // Re-enviar botones originales si no entiende
        return await generateAndShowSteps(session, sid, res);
      }
    } else if (session.stage === STATES.ESCALATE) {
      const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas|pruebas avanzadas)/i;
      const opt2 = /^\s*(?:2\b|2️⃣\b|dos|conectar con t[eé]cnico|conectar con tecnico)/i;
      const isOpt1 = opt1.test(t) || buttonToken === 'BTN_MORE_TESTS' || buttonToken === 'BTN_ADVANCED_TESTS';
      const isOpt2 = opt2.test(t) || buttonToken === 'BTN_CONNECT_TECH';

      if (isOpt2) {
        // P0: BTN_CONNECT_TECH debe ejecutar acción real, no repreguntar
        console.log('[ESCALATE] 🎯 BTN_CONNECT_TECH detectado, ejecutando createTicketAndRespond');
        return await createTicketAndRespond(session, sid, res);
      } else if (isOpt1) {
        try {
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          const device = session.device || '';
          let aiSteps = [];
          try {
            // DEBUG: mostrar pasos básicos antes de pedir pruebas avanzadas a OpenAI (ESCALATE)
            try {
              console.log('[DEBUG aiQuickTests] session.tests.basic before call (ESCALATE):', JSON.stringify(Array.isArray(session.tests?.basic) ? session.tests.basic : []));
            } catch (e) {
              console.log('[DEBUG aiQuickTests] error serializing session.tests.basic', e && e.message);
            }
            aiSteps = await aiQuickTests(session.problem || '', device || '', session.userLocale || 'es-AR', Array.isArray(session.tests?.basic) ? session.tests.basic : []);
          } catch (e) { aiSteps = []; }
          let limited = Array.isArray(aiSteps) ? aiSteps.slice(0, 8) : [];

          // filtrar resultados avanzados que ya estén en pasos básicos (comparación normalizada)
          session.tests = session.tests || {};
          const basicList = Array.isArray(session.tests.basic) ? session.tests.basic : [];
          const basicSet = new Set((basicList || []).map(normalizeStepText));
          limited = limited.filter(s => !basicSet.has(normalizeStepText(s)));

          // limitar a 4 pasos finales
          limited = limited.slice(0, 4);

          // Si no quedan pruebas avanzadas distintas, avisar al usuario y ofrecer conectar con técnico
          if (!limited || limited.length === 0) {
            const noMore = isEn
              ? "I don't have more advanced tests that are different from the ones you already tried. I can connect you with a technician if you want."
              : 'No tengo más pruebas avanzadas distintas a las que ya probaste. ¿Querés que te conecte con un técnico?';
            await appendAndPersistConversationEvent(session, session.conversationId, 'bot', noMore, {
              type: 'text',
              stage: session.stage,
              ts: nowIso()
            });
            return res.json(withOptions({ ok: true, reply: noMore, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH','BTN_CLOSE'], locale) }));
          }

          session.tests.advanced = limited;
          session.stepProgress = session.stepProgress || {};
          limited.forEach((_, i) => session.stepProgress[`adv_${i + 1}`] = 'pending');
          const numbered = enumerateSteps(limited);
          const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
          const empatia = addEmpatheticResponse('ADVANCED_TESTS', locale);
          const intro = isEn
            ? `I understand, ${whoLabel}. ${empatia} Let's try some more advanced tests now:`
            : `Entiendo, ${whoLabel}. ${empatia} Probemos ahora con algunas pruebas más avanzadas:`;
          const footer = isEn
            ? '\n\n🧩 If you need help with any step, tap on the number.\n\n🤔 Tell us how it went using the buttons:'
            : '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
          const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
          session.stepsDone = session.stepsDone || [];
          session.stepsDone.push('advanced_tests_shown');
          session.waEligible = false;
          session.lastHelpStep = null;
          session.stage = STATES.ADVANCED_TESTS;
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', fullMsg, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          const helpOptions = limited.map((_, i) => `${emojiForIndex(i)} Ayuda paso ${i + 1}`);
          const solvedBtn = isEn ? '✔️ I solved it' : 'Lo pude solucionar ✔️';
          const persistBtn = isEn ? '❌ Still not working' : 'El problema persiste ❌';
          const optionsResp = [...helpOptions, solvedBtn, persistBtn];
          return res.json(withOptions({ ok: true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: limited }));
        } catch (errOpt1) {
          console.error('[ESCALATE][more_tests] Error', errOpt1 && errOpt1.message);
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          reply = isEn
            ? 'An error occurred generating more tests. Try again or ask me to connect you with a technician.'
            : 'Ocurrió un error generando más pruebas. Probá de nuevo o pedime que te conecte con un técnico.';
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          return res.json(withOptions({ ok: false, reply, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH'], locale) }));
        }
      } else if (isOpt2) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        reply = 'Decime si querés probar más soluciones o conectar con un técnico.';
        options = buildUiButtonsFromTokens(['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH']);
      }
    } else if (session.stage === STATES.ADVANCED_TESTS) {
      const rxDontKnowAdv = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
      if (rxDontKnowAdv.test(t)) {
        const result = await handleDontUnderstand(session, sid, t);
        return res.json(withOptions(result));
      }

      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
      const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
      const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico)$/i;
      const rxShowSteps = /^\s*(volver a los pasos avanzados|volver a los pasos|volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShowSteps.test(t)) {
        const result = handleShowSteps(session, 'advanced');
        if (result.error) {
          await appendAndPersistConversationEvent(session, session.conversationId, 'bot', result.msg, {
            type: 'text',
            stage: session.stage,
            ts: nowIso()
          });
          return res.json(withOptions({ ok: false, reply: result.msg, stage: session.stage, options: [] }));
        }
        await appendAndPersistConversationEvent(session, session.conversationId, 'bot', result.msg, {
          type: 'text',
          stage: session.stage,
          ts: nowIso()
        });
        return res.json(withOptions({ ok: true, reply: result.msg, stage: session.stage, options: result.options, steps: result.steps }));
      }

      if (rxYes.test(t)) {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const idx = session.lastHelpStep;
        if (typeof idx === 'number' && idx >= 1) {
          session.stepProgress = session.stepProgress || {};
          session.stepProgress[`adv_${idx}`] = 'done';
          await saveSession(sid, session);
        }
        const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
        const empatia = addEmpatheticResponse('ENDED', locale);
        const firstLine = whoLabel
          ? (isEn ? `Excellent, ${whoLabel}! 🙌` : `¡Excelente, ${whoLabel}! 🙌`)
          : (isEn ? `Excellent, I'm glad you were able to solve it! 🙌` : `¡Excelente, me alegra que lo hayas podido resolver! 🙌`);
        reply = isEn
          ? `${firstLine}\n\n${empatia}\n\nIf it fails again later, you can reopen the chat and we'll resume the diagnosis together.`
          : `${firstLine}\n\n${empatia}\n\nSi más adelante vuelve a fallar, podés volver a abrir el chat y retomamos el diagnóstico juntos.`;
        session.stage = STATES.ENDED;
        session.waEligible = false;
        options = [];
      } else if (rxNo.test(t)) {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const empatia = addEmpatheticResponse('ESCALATE', locale);
        reply = isEn
          ? `I understand. ${empatia} Do you want me to connect you with a technician to look into it more deeply?`
          : `Entiendo. ${empatia} ¿Querés que te conecte con un técnico para que lo vean más a fondo?`;
        options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH'], locale);
        session.stage = STATES.ESCALATE;
      } else if (rxTech.test(t) || buttonToken === 'BTN_CONNECT_TECH') {
        // P0: BTN_CONNECT_TECH debe ejecutar acción real, no repreguntar
        console.log('[ESCALATE] 🎯 BTN_CONNECT_TECH detectado, ejecutando createTicketAndRespond');
        return await createTicketAndRespond(session, sid, res);
      } else {
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        reply = isEn
          ? `I didn't understand. You can say "I solved it" or "The problem persists", or ask to connect with a technician.`
          : (locale === 'es-419'
            ? `No te entendí. Puedes decir "Lo pude solucionar" o "El problema persiste", o pedir conectar con técnico.`
            : `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o pedir conectar con técnico.`);
        options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH']);
      }
    } else {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      reply = isEn
        ? 'I\'m not sure how to respond to that now. You can restart or write "Rephrase Problem".'
        : (locale === 'es-419'
          ? 'No estoy seguro cómo responder eso ahora. Puedes reiniciar o escribir "Reformular Problema".'
          : 'No estoy seguro cómo responder eso ahora. Podés reiniciar o escribir "Reformular Problema".');
      const reformBtn = isEn ? 'Rephrase Problem' : 'Reformular Problema';
      options = [reformBtn];
    }

    // Save bot reply + persist transcripts to file (single ts pair)
    const pairTs = nowIso();
    await appendAndPersistConversationEvent(session, session.conversationId, 'bot', reply, {
      type: 'text',
      stage: session.stage,
      ts: pairTs
    });
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      const userLine = `[${pairTs}] USER: ${buttonToken ? '[BOTON] ' + buttonLabel : t}\n`;
      const botLine = `[${pairTs}] ASSISTANT: ${reply}\n`;
      fs.appendFile(tf, userLine, () => { });
      fs.appendFile(tf, botLine, () => { });
    } catch (e) { /* noop */ }

    const response = withOptions({ ok: true, reply, sid, stage: session.stage });
    if (typeof endConversation !== 'undefined' && endConversation) {
      response.endConversation = true;
    }
    if (options && options.length) response.options = options;

    try {
      const areAllTokens = Array.isArray(options) && options.length > 0 && options.every(o => typeof o === 'string' && o.startsWith('BTN_'));
      if (areAllTokens) {
        const locale = session?.userLocale || 'es-AR';
        const btns = buildUiButtonsFromTokens(options, locale);
        response.ui = response.ui || {};
        response.ui.states = CHAT?.ui?.states || response.ui.states || {};
        response.ui.buttons = btns;
      } else if (CHAT?.ui && !response.ui) {
        response.ui = CHAT.ui;
      }
    } catch (e) {
      console.error('[response-ui] Error construyendo botones UI', e && e.message);
    }

    if (session.waEligible) response.allowWhatsapp = true;

    try {
      const shortLog = `${sid} => reply len=${String(reply || '').length} options=${(options || []).length}`;
      const entry = formatLog('INFO', shortLog);
      appendToLogFile(entry);
      broadcastLog(entry);
    } catch (e) { /* noop */ }

    return res.json(response);

  } catch (e) {
    console.error('[api/chat] Error completo:', e);
    console.error('[api/chat] Stack:', e && e.stack);

    // Intentar obtener locale de la request o usar default
    let locale = 'es-AR';
    let sid = req.sessionId;
    let conversationId = null;
    try {
      const existingSession = await getSession(sid);
      if (existingSession && existingSession.userLocale) {
        locale = existingSession.userLocale;
      }
      if (existingSession?.conversationId) {
        conversationId = existingSession.conversationId;
      }
    } catch (errLocale) {
      // Si falla, usar el default
    }

    // Instrumentación: CHAT_ERR
    emitLogEvent('error', 'CHAT_ERR', {
      sid: sid || 'unknown',
      conversationId,
      errorName: e?.name || 'Error',
      message: e?.message || 'Unknown error',
      where: 'main_handler'
    });

    const isEn = String(locale).toLowerCase().startsWith('en');
    const errorMsg = isEn
      ? '😅 I had a momentary problem. Please try again.'
      : '😅 Tuve un problema momentáneo. Probá de nuevo.';
    return res.status(200).json(withOptions({ ok: true, reply: errorMsg }));
  }
});

// ========================================================
// Health check endpoint (Enhanced Production-Ready)
// ========================================================
app.get('/api/health', async (_req, res) => {
  try {
    // Check Redis/sessionStore connectivity
    let redisStatus = 'unknown';
    let activeSessions = 0;

    try {
      const sessions = await listActiveSessions();
      activeSessions = sessions ? sessions.length : 0;
      redisStatus = 'healthy';
    } catch (err) {
      redisStatus = 'error';
      console.error('[HEALTH] Redis check failed:', err.message);
    }

    // Check filesystem writable
    let fsStatus = 'healthy';
    try {
      const testFile = path.join(UPLOADS_DIR, '.health-check');
      fs.writeFileSync(testFile, 'ok', 'utf8');
      fs.unlinkSync(testFile);
    } catch (err) {
      fsStatus = 'error';
      console.error('[HEALTH] Filesystem check failed:', err.message);
    }

    // Check OpenAI connectivity (optional)
    let openaiStatus = openai ? 'configured' : 'not_configured';

    // Check deviceDetection module
    let deviceDetectionStatus = 'unknown';
    try {
      if (typeof detectAmbiguousDevice === 'function' &&
        typeof DEVICE_DISAMBIGUATION === 'object' &&
        Object.keys(DEVICE_DISAMBIGUATION).length > 0) {
        deviceDetectionStatus = 'loaded';
      } else {
        deviceDetectionStatus = 'not_loaded';
      }
    } catch (e) {
      deviceDetectionStatus = `error: ${e.message}`;
    }

    const uptime = process.uptime();
    const memory = process.memoryUsage();

    const health = {
      ok: redisStatus === 'healthy' && fsStatus === 'healthy',
      status: (redisStatus === 'healthy' && fsStatus === 'healthy') ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
      uptimeSeconds: Math.floor(uptime),

      services: {
        redis: redisStatus,
        filesystem: fsStatus,
        openai: openaiStatus,
        deviceDetection: deviceDetectionStatus
      },

      stats: {
        activeSessions: activeSessions,
        totalMessages: metrics.chat.totalMessages || 0,
        totalErrors: metrics.errors.count || 0
      },

      memory: {
        heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(memory.rss / 1024 / 1024).toFixed(2)}MB`
      }
    };

    const statusCode = health.ok ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[HEALTH] Error:', error);
    res.status(500).json({
      ok: false,
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ========================================================
// 🔐 GDPR ENDPOINTS
// ========================================================

/**
 * GET /api/gdpr/my-data/:sessionId
 * Obtener datos personales asociados a una sesión (GDPR Art. 15)
 */
app.get('/api/gdpr/my-data/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Session ID required' });
    }
    
    // Validación: sessionId seguro
    if (!isSafeId(sessionId)) {
      return badRequest(res, 'BAD_SESSION_ID', 'Session ID inválido');
    }

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found or already deleted' });
    }

    // Retornar datos anonimizados/resumidos
    const userData = {
      sessionId: session.id,
      userName: session.userName ? `[REDACTED - First letter: ${session.userName.charAt(0).toUpperCase()}]` : null,
      createdAt: session.startedAt || session.createdAt || 'N/A',
      conversationState: session.conversationState || 'N/A',
      device: session.detectedEntities?.device || session.device || 'N/A',
      transcriptLength: session.transcript ? session.transcript.length : 0,
      gdprConsent: session.gdprConsent || false,
      gdprConsentDate: session.gdprConsentDate || null,
      expiresIn: '48 hours from creation'
    };

    console.log(`[GDPR] 📊 Data request for session: ${sessionId}`);

    res.json({ ok: true, data: userData });
  } catch (error) {
    console.error('[GDPR] Error retrieving user data:', error);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /api/gdpr/delete-me/:sessionId
 * Eliminar todos los datos personales (GDPR Art. 17 - Derecho al Olvido)
 */
app.delete('/api/gdpr/delete-me/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Session ID required' });
    }
    
    // Validación: sessionId seguro
    if (!isSafeId(sessionId)) {
      return badRequest(res, 'BAD_SESSION_ID', 'Session ID inválido');
    }

    console.log(`[GDPR] 🗑️  DELETE request for session: ${sessionId}`);

    // Eliminar sesión de Redis/store
    const session = await getSession(sessionId);
    if (session) {
      // Eliminar transcript asociado
      const transcriptPath = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);
      try {
        if (fs.existsSync(transcriptPath)) {
          fs.unlinkSync(transcriptPath);
          console.log(`[GDPR] ✅ Transcript deleted: ${transcriptPath}`);
        }
      } catch (err) {
        console.error(`[GDPR] ⚠️  Error deleting transcript:`, err.message);
      }

      // Eliminar tickets asociados (buscar por sessionId)
      try {
        const ticketFiles = fs.readdirSync(TICKETS_DIR);
        for (const file of ticketFiles) {
          if (file.endsWith('.json')) {
            const ticketPath = path.join(TICKETS_DIR, file);
            const ticketData = JSON.parse(fs.readFileSync(ticketPath, 'utf8'));
            if (ticketData.sessionId === sessionId) {
              fs.unlinkSync(ticketPath);
              console.log(`[GDPR] ✅ Ticket deleted: ${file}`);
            }
          }
        }
      } catch (err) {
        console.error(`[GDPR] ⚠️  Error deleting tickets:`, err.message);
      }

      // Eliminar sesión
      await saveSession(sessionId, null); // O usar deleteSession si existe
      console.log(`[GDPR] ✅ Session deleted: ${sessionId}`);
    }

    res.json({
      ok: true,
      message: 'Tus datos han sido eliminados permanentemente de nuestros sistemas',
      deletedItems: ['session', 'transcript', 'tickets']
    });
  } catch (error) {
    console.error('[GDPR] Error deleting user data:', error);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// Sessions listing
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  updateMetric('chat', 'sessions', sessions.length);
  res.json({ ok: true, count: sessions.length, sessions });
});

// ========================================================
// Flow Audit Endpoints
// ========================================================

// Get audit for specific session
app.get('/api/flow-audit/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    // Validación: sessionId seguro
    if (!isSafeId(sessionId)) {
      return badRequest(res, 'BAD_SESSION_ID', 'Session ID inválido');
    }
    
    const audit = getSessionAudit(sessionId);
    res.json({ ok: true, audit });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get full audit report
app.get('/api/flow-audit', (req, res) => {
  try {
    const report = generateAuditReport();
    res.setHeader('Content-Type', 'text/markdown');
    res.send(report);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Export audit to Excel
app.get('/api/flow-audit/export', (req, res) => {
  try {
    const filePath = exportToExcel();
    if (filePath) {
      res.download(filePath, path.basename(filePath));
    } else {
      res.status(500).json({ ok: false, error: 'Export failed' });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ========================================================
// Metrics endpoint (Enhanced Production-Ready)
// ========================================================
app.get('/api/metrics', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const sessions = await listActiveSessions();

    // Count tickets
    let ticketsCount = 0;
    try {
      const ticketFiles = fs.readdirSync(TICKETS_DIR);
      ticketsCount = ticketFiles.filter(f => f.endsWith('.json')).length;
    } catch (e) { /* noop */ }

    // Upload stats
    let uploadStats = { count: 0, totalBytes: 0 };
    try {
      const uploadsDir = fs.readdirSync(UPLOADS_DIR);
      uploadStats = uploadsDir.reduce((acc, file) => {
        const filePath = path.join(UPLOADS_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          count: acc.count + 1,
          totalBytes: acc.totalBytes + stats.size
        };
      }, { count: 0, totalBytes: 0 });
    } catch (e) { /* noop */ }

    // Prepare response
    const metricsData = {
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),

      // Core metrics
      chat: {
        totalMessages: metrics.chat.totalMessages || 0,
        activeSessions: sessions.length
      },

      tickets: {
        total: ticketsCount,
        generated: metrics.chat.sessions || 0
      },

      uploads: metrics.uploads,

      errors: {
        count: metrics.errors.count || 0,
        lastError: metrics.errors.lastError || null
      },

      storage: {
        uploads: {
          files: uploadStats.count,
          totalMB: (uploadStats.totalBytes / 1024 / 1024).toFixed(2)
        }
      },

      memory: process.memoryUsage()
    };

    res.json(metricsData);
  } catch (error) {
    console.error('[METRICS] Error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

// Serve index.html for root path
app.get('/', (_req, res) => {
  const indexPath = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  // Render: el backend puede no incluir carpeta /public
  return res.status(200).type('text/plain').send('STI Chat API is running. Try /api/health');
});

function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`STI Chat (v7) started on ${PORT}`);
  console.log('[Logs] SSE available at /api/logs/stream (use token param if LOG_TOKEN set)');
  console.log('[Performance] Compression enabled (gzip/brotli)');
  console.log('[Performance] Session cache enabled (max 1000 sessions)');
});

// PERFORMANCE: Enable HTTP keep-alive
server.keepAliveTimeout = 65000; // 65 segundos
server.headersTimeout = 66000; // Ligeramente mayor que keepAlive

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Iniciando apagado graceful...`);

  // Cerrar SSE clients
  console.log(`[shutdown] Cerrando ${sseClients.size} clientes SSE...`);
  for (const client of Array.from(sseClients)) {
    try {
      client.write('data: SERVER_SHUTDOWN\n\n');
      client.end();
    } catch (e) { /* ignore */ }
  }
  sseClients.clear();

  // Cerrar log stream
  if (logStream && logStream.writable) {
    try { logStream.end(); } catch (e) { /* ignore */ }
  }

  // Cerrar servidor HTTP
  server.close(() => {
    console.log('[shutdown] Servidor HTTP cerrado');
    process.exit(0);
  });

  // Force exit después de 10 segundos
  setTimeout(() => {
    console.error('[shutdown] Forzando salida después de 10s');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===== EXPORTS (Para tests) =====
export { detectAmbiguousDevice };

