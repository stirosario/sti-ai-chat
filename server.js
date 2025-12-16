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

// ✅ FASE 5-4: Imports organizados por categoría

// ========================================================
// LIBRERÍAS EXTERNAS
// ========================================================
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

// ========================================================
// MÓDULOS INTERNOS - SERVICES
// ========================================================
import { getSession, saveSession, listActiveSessions, deleteSession } from './sessionStore.js';
import { logFlowInteraction, detectLoops, getSessionAudit, generateAuditReport, exportToExcel, maskPII } from './flowLogger.js';
import { createTicket, generateWhatsAppLink, getTicket, getTicketPublicUrl, listTickets, updateTicketStatus } from './ticketing.js';
import { markSessionDirty, saveSessionImmediate, flushPendingSaves } from './services/sessionSaver.js';
import { processImages, analyzeImagesWithVision } from './services/imageProcessor.js';
import { processMessage } from './services/messageProcessor.js';
import {
  isSupervisorActivationCommand,
  isSupervisorModeActive,
  authenticateSupervisor,
  processSupervisorCommand
} from './src/services/supervisorMode.js';

// ========================================================
// MÓDULOS INTERNOS - HANDLERS
// ========================================================
import { handleAskNameStage, extractName, isValidName, isValidHumanName, looksClearlyNotName, capitalizeToken, analyzeNameWithOA } from './handlers/nameHandler.js';
import { handleAskLanguageStage, handleAskUserLevelStage } from './handlers/stageHandlers.js';
import { isValidTransition, getStageInfo, getNextStages, STATE_MACHINE, STATES, changeStage } from './handlers/stateMachine.js';
import { handleBasicTestsStage } from './handlers/basicTestsHandler.js';
import { handleEscalateStage } from './handlers/escalateHandler.js';
import { handleAdvancedTestsStage } from './handlers/advancedTestsHandler.js';
import { handleDeviceStage } from './handlers/deviceHandler.js';
import { handleOSStage } from './handlers/osHandler.js';
import ticketsRouter from './routes/tickets.js';

// ========================================================
// MÓDULOS INTERNOS - UTILS
// ========================================================
import { sanitizeInput, sanitizeFilePath } from './utils/sanitization.js';
import { validateSessionId, getSessionId as getSessionIdUtil, generateSessionId, isPathSafe } from './utils/validation.js';
import { nowIso, withOptions } from './utils/common.js';
import { buildTimeGreeting, buildLanguagePrompt, buildNameGreeting } from './utils/helpers.js';
import { validateCSRF, generateCSRFToken, cleanupExpiredCSRFTokens } from './utils/security.js';
import { 
  getPersonalizedGreeting, 
  getProgressIndicator, 
  getConfirmationMessage, 
  getFriendlyErrorMessage,
  getProgressSummary,
  getProactiveTip,
  getCelebrationMessage
} from './utils/uxHelpers.js';
import { emojiForIndex, enumerateSteps, enumerateStepsWithDifficulty, normalizeStepText, getDifficultyForStep } from './utils/stepsUtils.js';
import { 
  validateBeforeAdvancing, 
  getConfirmationPrompt, 
  detectInconsistency 
} from './utils/validationHelpers.js';
import { 
  detectReturnAfterInactivity, 
  getWelcomeBackMessage, 
  updateLastActivity 
} from './utils/sessionHelpers.js';
import { 
  estimateResolutionTime, 
  estimateStepTime, 
  estimateTotalTime 
} from './utils/timeEstimates.js';
import { 
  calculateProgressPercentage, 
  generateProgressBar, 
  detectAchievements, 
  getAchievementMessage, 
  getMotivationalMessage, 
  updateSessionAchievements 
} from './utils/gamification.js';
import { runRobotFix, getRobotFixStats } from './services/robotFix.js';

// ========================================================
// MÓDULOS INTERNOS - HELPERS Y UTILIDADES
// ========================================================
import { normalizarTextoCompleto } from './normalizarTexto.js';
import { detectAmbiguousDevice, DEVICE_DISAMBIGUATION } from './deviceDetection.js';
import { detectProblemPattern, hasProblemPattern } from './problemPatterns.js';

// ========================================================
// GOBERNANZA + OBSERVABILIDAD
// ========================================================
import {
  getStageContract,
  getDefaultButtons,
  sanitizeButtonsForStage,
  getStageViewModel
} from './src/governance/stageContract.js';
import { enforceStage } from './src/governance/enforcer.js';
import { startTurn, endTurn } from './src/logging/turnLogger.js';

// ========================================================
// CONSTANTES
// ========================================================
import { 
  MAX_CACHED_SESSIONS, 
  SESSION_CACHE_TTL, 
  CSRF_TOKEN_TTL,
  MAX_IMAGES_PER_SESSION,
  MAX_NAME_ATTEMPTS,
  OPENAI_TIMEOUT,
  MAX_TRANSCRIPT_SLICE,
  MAX_CONVERSATION_CONTEXT,
  MAX_CONCURRENT_USERS,
  USER_SESSION_TIMEOUT_MS
} from './constants.js';

// ========================================================
// 🧠 SISTEMA INTELIGENTE DE TECNOS
// Motor de análisis de intención con OpenAI
// Autor: STI AI Team | Fecha: 2025-12-06
// ========================================================
import { 
  initializeIntelligentSystem, 
  handleWithIntelligence,
  setIntelligentMode,
  getIntelligentSystemStatus
} from './src/core/integrationPatch.js';

console.log('[IMPORTS] ✅ Sistema inteligente importado');

// ========================================================
// MODULAR ARCHITECTURE (Feature Flag)
// ========================================================
const USE_MODULAR_ARCHITECTURE = process.env.USE_MODULAR_ARCHITECTURE === 'true';
const USE_ORCHESTRATOR = process.env.USE_ORCHESTRATOR === 'true';
let chatAdapter = null;
let conversationOrchestrator = null;
const BUILD_ID =
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_SHA ||
  process.env.BUILD_ID ||
  new Date().toISOString();

if (USE_MODULAR_ARCHITECTURE) {
  const { handleChatMessage } = await import('./src/adapters/chatAdapter.js');
  chatAdapter = { handleChatMessage };
  console.log('[MODULAR] 🏗️  Arquitectura modular ACTIVADA');
  console.log('[MODULAR] ✅ chatAdapter cargado correctamente');
} else {
  console.log('[MODULAR] 📦 Usando arquitectura legacy (USE_MODULAR_ARCHITECTURE=false)');
}

// ========================================================
// CONVERSATION ORCHESTRATOR (Feature Flag)
// ========================================================
if (USE_ORCHESTRATOR) {
  const { orchestrateTurn } = await import('./services/conversationOrchestrator.js');
  conversationOrchestrator = { orchestrateTurn };
  console.log('[ORCHESTRATOR] 🧠 Conversation Orchestrator ACTIVADO');
  console.log('[ORCHESTRATOR] ✅ orchestrateTurn cargado correctamente');
} else {
  console.log('[ORCHESTRATOR] 📦 Orchestrator desactivado (USE_ORCHESTRATOR=false)');
}

// FORCE REBUILD 2025-11-25 16:45 - Debugging deviceDetection import
console.log('[INIT] deviceDetection imported successfully:', typeof detectAmbiguousDevice);
console.log('[INIT] DEVICE_DISAMBIGUATION keys:', Object.keys(DEVICE_DISAMBIGUATION).length);

// ========================================================
// Security: CSRF Token Store (in-memory, production should use Redis)
// ========================================================
// 🔧 REFACTOR: csrfTokenStore y funciones CSRF movidas a utils/security.js
const REQUEST_ID_HEADER = 'x-request-id';

// PERFORMANCE: Session cache (LRU-style, max 1000 sessions)
const sessionCache = new Map(); // Map<sessionId, {data, lastAccess}>
// ✅ FASE 5-3: Usar constante centralizada

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

// 🔧 REFACTOR: generateCSRFToken y cleanup movidos a utils/security.js
// Cleanup expired CSRF tokens every 30 minutes
setInterval(() => {
  cleanupExpiredCSRFTokens();
}, 30 * 60 * 1000);

// ========================================================
// 🔐 CSRF VALIDATION MIDDLEWARE (Production-Ready)
// ========================================================
// 🔧 REFACTOR: validateCSRF movida a utils/security.js

function generateRequestId() {
  return `req-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

// ========================================================
// Configuration & Clients
// ========================================================
// ✅ PRODUCCIÓN: Validación estricta de variables de entorno críticas
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION) {
  console.log('\n' + '='.repeat(80));
  console.log('🔒 VALIDACIÓN DE CONFIGURACIÓN DE PRODUCCIÓN');
  console.log('='.repeat(80));
  
  // Validar NODE_ENV
  if (!IS_PRODUCTION) {
    console.error('[ERROR] NODE_ENV debe ser "production" en producción');
    process.exit(1);
  }
  console.log('✅ NODE_ENV=production');
  
  // Validar LOG_TOKEN (ya validado más abajo, pero confirmar aquí)
  if (!process.env.LOG_TOKEN && !process.env.SSE_TOKEN) {
    console.error('[ERROR] LOG_TOKEN es OBLIGATORIO en producción');
    console.error('[ERROR] Generar con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  console.log('✅ LOG_TOKEN configurado');
  
  // Validar ALLOWED_ORIGINS
  if (!process.env.ALLOWED_ORIGINS) {
    console.error('[ERROR] ALLOWED_ORIGINS es OBLIGATORIO en producción');
    console.error('[ERROR] Configurar con tus dominios reales separados por comas');
    console.error('[ERROR] Ejemplo: ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com');
    process.exit(1);
  }
  const allowedOriginsList = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  console.log(`✅ ALLOWED_ORIGINS configurado (${allowedOriginsList.length} dominio(s))`);
  allowedOriginsList.forEach(origin => {
    console.log(`   - ${origin}`);
  });
  
  // Validar OPENAI_API_KEY (recomendado pero no crítico si no se usa IA)
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WARN] OPENAI_API_KEY no configurada. Funciones de IA avanzadas deshabilitadas.');
    console.warn('[WARN] Para activar IA: definir OPENAI_API_KEY en .env');
  } else {
    console.log('✅ OPENAI_API_KEY configurado');
  }
  
  console.log('='.repeat(80) + '\n');
} else {
  // En desarrollo, solo advertir
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WARN] OPENAI_API_KEY no configurada. Funciones de IA deshabilitadas.');
  }
  if (!process.env.ALLOWED_ORIGINS) {
    console.warn('[WARN] ALLOWED_ORIGINS no configurada. Usando valores por defecto.');
  }
  if (!process.env.LOG_TOKEN) {
    console.warn('[WARN] LOG_TOKEN no configurado. Endpoint /api/logs sin protección.');
  }
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const OA_NAME_REJECT_CONF = Number(process.env.OA_NAME_REJECT_CONF || 0.75);

// ========================================================
// 🧠 INICIALIZAR SISTEMA INTELIGENTE DE TECNOS
// ========================================================
// ✅ PRODUCCIÓN: Activar por defecto para conversación natural
const USE_INTELLIGENT_MODE = process.env.USE_INTELLIGENT_MODE !== 'false'; // Activado por defecto
console.log(`\n${'='.repeat(60)}`);
console.log(`  🧠 SISTEMA INTELIGENTE DE TECNOS`);
console.log(`${'='.repeat(60)}`);
console.log(`  Estado: ${USE_INTELLIGENT_MODE ? '✅ ACTIVADO' : '⏭️ DESACTIVADO (usando legacy)'}`);
// ✅ FASE 4-3: No exponer estado de API key en logs
const hasOpenAI = !!process.env.OPENAI_API_KEY;
console.log(`  OpenAI: ${hasOpenAI ? '✅ Disponible' : '⚠️ No disponible'}`);

const intelligentSystemStatus = initializeIntelligentSystem(
  process.env.OPENAI_API_KEY,
  USE_INTELLIGENT_MODE
);

if (intelligentSystemStatus.enabled && hasOpenAI) {
  console.log(`  Modo: 🚀 INTELIGENTE (análisis con OpenAI)`);
  console.log(`  Features:`);
  console.log(`    - ✅ Análisis de intención contextual`);
  console.log(`    - ✅ Validación de acciones`);
  console.log(`    - ✅ Respuestas dinámicas`);
  console.log(`    - ✅ Prevención de saltos ilógicos`);
} else if (intelligentSystemStatus.enabled && !hasOpenAI) {
  console.log(`  Modo: ⚠️ INTELIGENTE ACTIVADO pero sin OPENAI_API_KEY`);
  console.log(`  Estado: Funciones de IA deshabilitadas hasta configurar OPENAI_API_KEY`);
} else {
  console.log(`  Modo: 📚 LEGACY (stages rígidos)`);
  console.log(`  Para activar: USE_INTELLIGENT_MODE=true en .env`);
}
console.log(`${'='.repeat(60)}\n`);

// ========================================================
// 🧠 MODO SUPER INTELIGENTE - AI-Powered Analysis
// ========================================================
// ✅ PRODUCCIÓN: Activar por defecto para análisis inteligente
const SMART_MODE_ENABLED = process.env.SMART_MODE !== 'false'; // Activado por defecto

// Log estado de SMART_MODE
if (SMART_MODE_ENABLED && process.env.OPENAI_API_KEY) {
  console.log('[SMART_MODE] 🧠 Modo Super Inteligente: ✅ ACTIVADO (con OpenAI)');
} else if (SMART_MODE_ENABLED && !process.env.OPENAI_API_KEY) {
  console.log('[SMART_MODE] 🧠 Modo Super Inteligente: ⚠️ ACTIVADO pero sin OPENAI_API_KEY');
} else {
  console.log('[SMART_MODE] 🧠 Modo Super Inteligente: ❌ DESACTIVADO');
}

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
    // ✅ DETECCIÓN DE PATRONES DE PROBLEMAS (1000 expresiones)
    // ========================================
    const patternDetection = detectProblemPattern(originalText || normalizedText);
    let forcedProblemDetection = null;
    
    if (patternDetection.detected) {
      console.log('[PATTERN_DETECTION] ✅ Problema detectado por patrón:', {
        category: patternDetection.category,
        pattern: patternDetection.pattern,
        confidence: patternDetection.confidence
      });
      
      // Forzar detección de problema con alta confianza
      forcedProblemDetection = {
        detected: true,
        summary: patternDetection.summary || `Problema con ${patternDetection.category}`,
        category: patternDetection.category === 'keyboard' ? 'hardware' :
                  patternDetection.category === 'mouse' ? 'hardware' :
                  patternDetection.category === 'internet' ? 'connectivity' :
                  patternDetection.category === 'printer' ? 'hardware' :
                  patternDetection.category === 'windows' ? 'software' :
                  patternDetection.category === 'hardware' ? 'hardware' :
                  patternDetection.category === 'software' ? 'software' :
                  patternDetection.category === 'network' ? 'connectivity' :
                  patternDetection.category === 'security' ? 'security' :
                  patternDetection.category === 'advanced' ? 'other' : 'other',
        urgency: patternDetection.category === 'security' ? 'high' : 'medium',
        keywords: patternDetection.keywords || [],
        confidence: patternDetection.confidence || 0.95
      };
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
    "suggestedResponse": "${isEnglish ? 'empathetic AND technical response based on what you SEE. Use the user\'s name if available, avoid repetitive greetings like "Hello, how are you?". Be direct and helpful.' : 'respuesta empática Y técnica basada en lo que VES, con voseo argentino. Usá el nombre del usuario si está disponible, evitá saludos repetitivos como "Hola, ¿cómo estás?". Sé directo y útil.'}"
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
**TONO:** ${isEnglish ? 'Professional, empathetic, conversational - like talking to a helpful colleague' : 'Profesional argentino, empático, conversacional - como hablar con un compañero que te ayuda. Usá voseo natural (contame, fijate, podés, probá). Sé amigable pero técnico.'}

**CONTEXTO PREVIO:**
${conversationContext}

**MENSAJE ORIGINAL:** "${originalText}"
**TEXTO NORMALIZADO:** "${normalizedText}"

**ANÁLISIS REQUERIDO:**
Detectá intención, dispositivo probable, problema, sentimiento y urgencia.
Tolerá errores ortográficos y frases ambiguas.
Usá el texto normalizado para mejor comprensión.

**✅ DETECCIÓN ESPECIAL DE TECLADO:**
Si el mensaje menciona "teclado" (o variantes como "tekado", "teclao", "keyboard") o frases como:
- "no me anda el teclado"
- "no me nada el teclado" (error común)
- "problema con mi teclado"
- "el teclado no responde"
- "no funciona el teclado"
Entonces DEBÉS detectar:
- "device": {"detected": true, "type": "teclado" o el dispositivo que contiene el teclado}
- "problem": {"detected": true, "summary": "problema con teclado", "category": "hardware"}
- "confidence": 0.8 o superior (alta confianza)

**Respondé en JSON:**
{
  "intent": "diagnose_problem|ask_question|express_frustration|confirm|cancel|greeting|other",
  "confidence": 0.0-1.0,
  "device": {
    "detected": true/false,
    "type": "notebook|desktop|monitor|smartphone|tablet|printer|router|teclado|other",
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
      "suggestedResponse": "${isEnglish ? 'natural, empathetic, conversational response - like a helpful colleague' : 'respuesta natural, empática y conversacional con voseo argentino - como un compañero que te ayuda'}",
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
    
    // ✅ INTEGRACIÓN: Si se detectó un patrón, forzar la detección del problema
    if (forcedProblemDetection) {
      console.log('[PATTERN_DETECTION] 🔧 Forzando detección de problema basada en patrón');
      analysis.problem = forcedProblemDetection;
      analysis.confidence = Math.max(analysis.confidence || 0.5, forcedProblemDetection.confidence);
      analysis.clarificationNeeded = false; // NO pedir aclaración genérica
      
      // ✅ CORRECCIÓN: NO forzar useStructuredFlow = false si estamos en ASK_PROBLEM
      // En ASK_PROBLEM queremos SIEMPRE usar el flujo estructurado con 15 pasos
      if (session.stage !== 'ASK_PROBLEM') {
        analysis.useStructuredFlow = false; // Usar respuesta IA directa solo si NO estamos en ASK_PROBLEM
      } else {
        console.log('[PATTERN_DETECTION] ⚠️ Patrón detectado pero estamos en ASK_PROBLEM - manteniendo flujo estructurado para 15 pasos');
      }
      
      // Si el patrón detectó un dispositivo específico, actualizar device
      if (patternDetection.category === 'keyboard' || patternDetection.category === 'mouse') {
        analysis.device = {
          detected: true,
          type: patternDetection.category === 'keyboard' ? 'teclado' : 'mouse',
          confidence: 0.9,
          ambiguous: false,
          inferredFrom: `Patrón detectado: ${patternDetection.pattern}`
        };
      }
    }
    
    console.log('[SMART_MODE] ✅ Análisis de texto completado:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      device: analysis.device?.type,
      problem: analysis.problem?.summary,
      needsHuman: analysis.needsHumanHelp,
      patternDetected: patternDetection.detected
    });

    return { 
      analyzed: true, 
      hasVision: false, 
      originalText,
      normalizedText,
      patternDetected: patternDetection.detected,
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
    // ✅ FASE 5-3: Usar constante centralizada
    const conversationHistory = session.transcript.slice(-MAX_TRANSCRIPT_SLICE).map(msg =>
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

**PERSONALIDAD - NEW PERSONA ENGINE v3:**
- Profesional técnico pero humano y conversacional - como un compañero experto que te ayuda
- Empático y comprensivo - entendés el problema desde la perspectiva del usuario
- Directo y claro - sin rodeos, vas al grano pero de forma amigable
- Usa emojis con moderación (1-2 máximo) solo cuando aporten valor
- Balance perfecto: técnico cuando es necesario, simple cuando no lo es
- Si el usuario está frustrado → mostrá empatía genuina y ofrecé soluciones concretas inmediatas
- Conversá de forma natural - como hablar con un técnico amigable que sabe lo que hace
- NUNCA uses saludos genéricos repetitivos como "Hola, ¿cómo estás?" - variá tus saludos o usá el nombre del usuario
- NUNCA te repitas - si ya dijiste algo, no lo vuelvas a decir en la misma respuesta
- Si ya te presentaste, NO vuelvas a decir "Soy Tecnos" - el usuario ya sabe quién sos

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
1. Variá tus saludos - NUNCA uses "Hola, ¿cómo estás?" de forma repetitiva. Usá el nombre del usuario si lo conocés, o saludos variados como "Entendido ${userName}", "Perfecto", "Dale", "Bien", etc.
2. Sé claro, directo y conversacional - como hablar con un técnico amigable que sabe lo que hace
3. Da pasos accionables y específicos (1-2 líneas máximo por paso, no vagos ni genéricos)
4. Si hay error técnico → explicalo en términos simples pero técnicamente correctos
5. Si necesita ayuda humana → ofrecé opciones claras: "¿Querés que revise tu PC?", "¿Querés pruebas avanzadas?", "¿Querés abrir ticket con técnico?"
6. ${isEnglish ? 'Use natural, conversational English - like a helpful technical colleague' : 'Usá voseo argentino SIEMPRE - conversá de forma natural'}
7. Máximo 3-4 párrafos cortos y legibles
8. ${context.includeNextSteps ? 'Incluí 2-3 pasos concretos numerados (1-2 líneas cada uno)' : ''}
9. Soná humano y técnico a la vez - evitá sonar como un bot o un manual técnico
10. NUNCA te repitas - si ya dijiste "Soy Tecnos" o algo similar, NO lo vuelvas a decir
11. Cuando preguntes por sistema operativo, mencioná que podés mostrar botones para elegir (Windows, macOS, Linux)
12. ✅ CORRECCIÓN 2: NUNCA repitas el mismo mensaje genérico como "Necesito entender mejor qué necesitás" - si el usuario repite el problema, avanzá directamente a hacer preguntas específicas o ofrecé soluciones concretas
13. ✅ CORRECCIÓN 3: Si el usuario menciona un problema específico (ej: teclado) y ya lo mencionó antes, NO vuelvas a pedir aclaración genérica - avanzá directamente con preguntas técnicas relevantes o pasos de solución

**EJEMPLOS DE RESPUESTA CORRECTA (ES-AR):**

Ejemplo 1 - Problema técnico:
"Entendido ${userName} 👍 Vamos a revisar juntos por qué tu PC se vuelve lenta después de unas horas.

Este comportamiento suele ser por acumulación de procesos en memoria o temperatura alta.

**Probá estos pasos:**
1. Abrí Administrador de Tareas (Ctrl+Shift+Esc) y revisá qué consume más CPU/memoria
2. Verificá la temperatura del procesador con un programa como HWMonitor
3. Limpiá archivos temporales con CCleaner o el limpiador de Windows

¿Querés que te guíe paso a paso o preferís que genere un ticket para un técnico?"

Ejemplo 2 - Pregunta por sistema operativo:
"Para darte la guía correcta, ¿qué sistema operativo estás usando?

Podés elegir:
🪟 Windows
🍏 macOS  
🐧 Linux

O simplemente decime cuál usás."

Ejemplo 3 - Cierre de conversación:
"${buildTimeGreeting(session.userName || '')}

Si necesitás más ayuda, podés:
🌐 Visitar nuestra web: https://stia.com.ar
📱 Seguirnos en Instagram: @stirosario

¡Que tengas un buen día!"

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
  // ✅ PRIORIDAD ABSOLUTA: ASK_PROBLEM SIEMPRE usa flujo estructurado
  // DEBE evaluarse ANTES de cualquier otra condición
  // para garantizar que siempre se muestren los 15 pasos con dificultad y tiempo
  // ========================================
  if (session.stage === 'ASK_PROBLEM' || session.stage === 'DIAGNOSING_PROBLEM') {
    // ✅ CORRECCIÓN CRÍTICA DEFINITIVA: En ASK_PROBLEM, SIEMPRE usar flujo estructurado
    // No importa si hay análisis, problema detectado, o cualquier otra condición
    // El nuevo formato de 15 pasos DEBE mostrarse cuando el usuario escribe el problema
    console.log('[DECISION] 📋 FORZANDO flujo estructurado - ASK_PROBLEM/DIAGNOSING_PROBLEM detectado, SIEMPRE mostrar 15 pasos');
    
    // Forzar detección de problema si no está detectado (para que el resto del flujo funcione)
    if (!analysis.problem || !analysis.problem.detected) {
      const problemText = analysis.originalText || analysis.normalizedText || session.problem || 'problema técnico';
      analysis.problem = {
        detected: true,
        summary: problemText,
        category: 'other',
        urgency: 'medium',
        keywords: []
      };
      console.log('[DECISION] 📋 Problema forzado en ASK_PROBLEM:', problemText);
    }
    
    return true; // RETORNAR INMEDIATAMENTE, sin evaluar otras condiciones
  }
  
  // ========================================
  // SIEMPRE FLUJO ESTRUCTURADO (crítico)
  // ========================================
  if (!analysis.analyzed) return true; // Fallback si no hay análisis
  if (session.stage === 'ASK_LANGUAGE') return true; // Inicio siempre estructurado
  if (session.stage === 'ASK_NAME') return true; // Recolección de nombre
  if (analysis.intent === 'confirm' || analysis.intent === 'cancel') return true; // Confirmaciones
  
  // ========================================
  // PRIORIZAR IA (mejor experiencia) - Solo para casos especiales
  // ========================================
  
  // ✅ DETECCIÓN DE PATRONES: Si se detectó un patrón de problema (pero NO en ASK_PROBLEM), usar IA directa
  if ((analysis.patternDetected || analysis.useStructuredFlow === false) && session.stage !== 'ASK_PROBLEM') {
    console.log('[DECISION] 🎯 Usando IA - Patrón de problema detectado (1000 expresiones)');
    return false;
  }
  
  // ✅ CORRECCIÓN 1 y 4: Problemas de teclado → SIEMPRE usar IA con flujo específico
  if (session.keyboardProblemDetected || 
      analysis.problem?.summary?.toLowerCase().includes('teclado') ||
      analysis.problem?.keywords?.some(k => /teclado|keyboard/i.test(k)) ||
      analysis.device?.type === 'teclado') {
    console.log('[DECISION] ⌨️ Usando IA - Problema de teclado detectado');
    return false;
  }
  
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
  
  // ✅ CORRECCIÓN 6: Corregir "nada" -> "anda" en contexto de "no me nada"
  // Detectar patrones como "no me nada el teclado" -> "no me anda el teclado"
  normalized = normalized.replace(/\bno\s+me\s+nada\b/gi, 'no me anda');
  normalized = normalized.replace(/\bno\s+nada\b/gi, 'no anda');
  
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
    
    // ✅ CORRECCIÓN 6: Variantes comunes de "teclado" con errores
    'tekado': 'teclado',
    'teclao': 'teclado',
    'teclado': 'teclado', // Mantener para consistencia
    'keyboard': 'teclado',
    
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
const HISTORIAL_CHAT_DIR = process.env.HISTORIAL_CHAT_DIR || path.join(DATA_BASE, 'historial_chat');
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/$/, '');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// SECURITY: Generar token seguro si no está configurado
// ✅ AUDITORÍA CRÍTICO-4: LOG_TOKEN obligatorio en producción
// Permitir fallback desde `SSE_TOKEN` en .env para despliegues donde se use ese nombre
let LOG_TOKEN = process.env.LOG_TOKEN || process.env.SSE_TOKEN;

// En producción, LOG_TOKEN es obligatorio por seguridad
if (process.env.NODE_ENV === 'production') {
  if (!LOG_TOKEN) {
    console.error('\n'.repeat(3) + '='.repeat(80));
    console.error('[SECURITY CRITICAL] ❌ LOG_TOKEN REQUIRED IN PRODUCTION!');
    console.error('[SECURITY] The server will not start without LOG_TOKEN configured.');
    console.error('[SECURITY] ');
    console.error('[SECURITY] To fix: Add to your .env file:');
    console.error('[SECURITY] LOG_TOKEN=<your-secure-random-token>');
    console.error('[SECURITY] Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('='.repeat(80) + '\n'.repeat(2));
    process.exit(1);
  }
  // En producción, NUNCA imprimir el token
} else {
  // En desarrollo, generar token aleatorio si no está configurado (pero advertir)
  if (!LOG_TOKEN) {
    LOG_TOKEN = crypto.randomBytes(32).toString('hex');
    console.warn('\n'.repeat(2) + '='.repeat(80));
    console.warn('[SECURITY] ⚠️  LOG_TOKEN NOT CONFIGURED (DEVELOPMENT MODE)');
    console.warn('[SECURITY] Generated RANDOM token for this session ONLY.');
    console.warn('[SECURITY] This token will change on every restart!');
    console.warn('[SECURITY] ');
    console.warn('[SECURITY] To fix: Add to your .env file:');
    console.warn('[SECURITY] LOG_TOKEN=<generated-token>');
    console.warn('[SECURITY] (Token not shown for security - check logs on first run)');
    console.warn('='.repeat(80) + '\n'.repeat(2));
  }
}

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR, UPLOADS_DIR, HISTORIAL_CHAT_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
}

// ✅ AUDITORÍA CRÍTICO-4: No escribir LOG_TOKEN a archivo en producción (riesgo de exposición)
// Escribir token de logs a archivo seguro para interfaces administrativas locales (solo desarrollo)
if (process.env.NODE_ENV !== 'production') {
  try {
    const tokenPath = path.join(LOGS_DIR, 'log_token.txt');
    try { fs.writeFileSync(tokenPath, LOG_TOKEN, { mode: 0o600 }); } catch (e) { fs.writeFileSync(tokenPath, LOG_TOKEN); }
    console.log('[SECURITY] Wrote log token to', tokenPath, '(development only)');
  } catch (e) {
    console.error('[SECURITY] Failed to write log token file:', e && e.message);
  }
}

// Additionally attempt to write a copy into the repo's public_html/logs
// (common deployment where PHP admin UI reads that path). This is best-effort
// and won't override existing permissions if the folder isn't writable.
try {
  const altPath = path.join(process.cwd(), '..', 'public_html', 'logs', 'log_token.txt');
  try { fs.mkdirSync(path.dirname(altPath), { recursive: true }); } catch (e) { /* ignore */ }
  try { fs.writeFileSync(altPath, LOG_TOKEN, { mode: 0o600 }); } catch (e) {
    try { fs.writeFileSync(altPath, LOG_TOKEN); } catch (err) { throw err; }
  }
  console.log('[SECURITY] Wrote public copy of log token to', altPath);
} catch (e) {
  console.warn('[SECURITY] Could not write public copy of log token:', e && e.message);
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
let logStream = null;
try {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
} catch (e) {
  console.error('[init] no pude abrir stream de logs', e && e.message);
}

// ✅ AUDITORÍA CRÍTICO-1: Eliminadas redeclaraciones de nowIso y withOptions
// Estas funciones ya están importadas desde './utils/common.js' (línea 77)
// Las redeclaraciones causaban SyntaxError al arrancar el módulo

/**
 * Helper para registrar respuestas del bot en el transcript
 * @param {object} session - Sesión actual
 * @param {string} reply - Texto de respuesta del bot
 * @param {string} stage - Stage actual o resultante
 */
/**
 * Registra una respuesta del bot en el transcript
 * 🔧 FIX ALTO-7: Marca automáticamente la sesión como dirty
 * @param {object} session - Sesión actual
 * @param {string} reply - Texto de respuesta del bot
 * @param {string} stage - Stage actual o resultante
 * @param {string} sessionId - ID de sesión (opcional, necesario para marcar como dirty)
 */
async function registerBotResponse(session, reply, stage, sessionId = null) {
  if (!session.transcript) {
    session.transcript = [];
  }
  
  const botTimestamp = nowIso();
  
  session.transcript.push({
    who: 'bot',
    text: reply,
    stage: stage || session.stage,
    ts: botTimestamp
  });
  
  // 🔧 FIX ALTO-7: Marcar automáticamente la sesión como dirty
  if (sessionId) {
    markSessionDirty(sessionId, session);
  }
  
  console.log('[TRANSCRIPT] 🤖 Respuesta del bot registrada:', reply.substring(0, 50));
}

/**
 * 🔧 Handler especializado para GUIDING_INSTALLATION
 * Detecta OS en el mensaje del usuario y genera guía de instalación
 * 
 * @param {object} session - Sesión actual
 * @param {string} userMessage - Mensaje del usuario
 * @param {object} activeIntent - Intent activo (opcional)
 * @param {string} locale - Locale del usuario
 * @returns {object|null} - { reply, options } o null si no pudo manejar
 */
function handleGuidingInstallationOSReply(session, userMessage, activeIntent, locale = 'es-AR') {
  const isEn = String(locale).toLowerCase().startsWith('en');
  const msgLower = userMessage.toLowerCase().trim();
  
  // 🔍 DETECCIÓN DE SISTEMA OPERATIVO (con todas las variantes)
  let detectedOS = null;
  
  // Detectar variantes de Windows (incluir mayúsculas)
  if (/(windows\s*11|win\s*11|w11|win11)/i.test(userMessage)) {
    detectedOS = 'Windows 11';
  } else if (/(windows\s*10|win\s*10|w10|win10)/i.test(userMessage)) {
    detectedOS = 'Windows 10';
  } else if (/(windows\s*8|win\s*8|w8|win8)/i.test(userMessage)) {
    detectedOS = 'Windows 8';
  } else if (/(windows\s*7|win\s*7|w7|win7)/i.test(userMessage)) {
    detectedOS = 'Windows 7';
  } else if (/windows/i.test(userMessage)) {
    detectedOS = 'Windows';
  } else if (/mac\s*os|macos/i.test(userMessage)) {
    detectedOS = 'macOS';
  } else if (/\bmac\b/i.test(userMessage)) {
    detectedOS = 'macOS';
  } else if (/linux|ubuntu|debian/i.test(userMessage)) {
    detectedOS = 'Linux';
  }
  
  // Si detectamos OS válido, generar guía de instalación
  if (detectedOS) {
    session.operatingSystem = detectedOS;
    console.log('[GUIDING_INSTALLATION] ✅ OS detectado:', detectedOS, '(mensaje:', userMessage, ')');
    
    // Obtener el software que quiere instalar
    const softwareName = activeIntent?.software || 
                        activeIntent?.originalMessage || 
                        session.problem || 
                        'el software que necesitás';
    
    // Generar guía de instalación específica
    const installationSteps = isEn
      ? [
          'Download the installer from the official website',
          'Run the downloaded file (double-click)',
          'Follow the installation wizard',
          'Accept the license agreement',
          'Choose installation folder (default is fine)',
          'Click "Install" and wait',
          'Restart if prompted'
        ]
      : [
          'Descargá el instalador desde el sitio oficial',
          'Ejecutá el archivo descargado (doble clic)',
          'Seguí el asistente de instalación',
          'Aceptá el acuerdo de licencia',
          'Elegí la carpeta de instalación (la predeterminada está bien)',
          'Hacé clic en "Instalar" y esperá',
          'Reiniciá si te lo pide'
        ];
    const numberedSteps = enumerateSteps(installationSteps).join('\n\n');
    const reply = isEn
      ? `Perfect! I'll guide you through installing ${softwareName} on ${detectedOS}.\n\n**Installation Steps:**\n\n${numberedSteps}\n\n✅ Once installed, you can launch it from the Start menu.\n\nDid this help you?\n\n— I'm Tecnos, from STI — Intelligent Technical Service 🛠️`
      : `¡Perfecto! Te guío para instalar ${softwareName} en ${detectedOS}.\n\n**Pasos de Instalación:**\n\n${numberedSteps}\n\n✅ Una vez instalado, lo podés abrir desde el menú Inicio.\n\n¿Te sirvió esta guía?`;
    
    const options = buildUiButtonsFromTokens(['BTN_SUCCESS', 'BTN_NEED_HELP'], locale);
    
    return { reply, options };
  }
  
  // No se detectó OS válido - pedir aclaración CON BOTONES (NO fallback genérico)
  console.log('[GUIDING_INSTALLATION] ⚠️ No se detectó OS en:', userMessage);
  
  const reply = isEn
    ? `I'll help you with the installation. Let me guide you through the specific steps for your system.\n\nWhat operating system are you using?`
    : `Te ayudo con la instalación. Dejame guiarte con los pasos específicos para tu sistema.\n\n¿Qué sistema operativo estás usando?`;
  
  // ✅ CORRECCIÓN B: Agregar botones interactivos para sistema operativo
  const osButtons = isEn
    ? [
        { token: 'BTN_OS_WINDOWS', label: '🪟 Windows', text: 'Windows' },
        { token: 'BTN_OS_MACOS', label: '🍏 macOS', text: 'macOS' },
        { token: 'BTN_OS_LINUX', label: '🐧 Linux', text: 'Linux' }
      ]
    : [
        { token: 'BTN_OS_WINDOWS', label: '🪟 Windows', text: 'Windows' },
        { token: 'BTN_OS_MACOS', label: '🍏 macOS', text: 'macOS' },
        { token: 'BTN_OS_LINUX', label: '🐧 Linux', text: 'Linux' }
      ];
  
  return { reply, options: osButtons };
}

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

// ✅ AUDITORÍA CRÍTICO-2: Implementar logMsg como wrapper de formatLog + appendToLogFile
// logMsg se usa en compressImage, cleanup, upload handlers pero no estaba definido
function logMsg(...args) {
  try {
    const entry = formatLog('INFO', ...args);
    appendToLogFile(entry);
    // También mostrar en consola para debugging
    console.log(...args);
  } catch (e) {
    // Fallback silencioso si falla el logging
    console.log(...args);
  }
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
      { token: 'BTN_LANG_EN', label: '🇬🇧 English', text: 'English' },
      // ✅ LÍNEA ELIMINADA: BTN_NO_NAME ya no se usa

      // ========================================================
      // ✅ BOTONES LEGACY DESHABILITADOS - Sistema inteligente maneja intenciones
      // ========================================================
      // Estos botones fueron parte del sistema legacy que obligaba al usuario a
      // elegir entre "Problema" o "Consulta". Ahora el sistema inteligente analiza
      // automáticamente la intención del usuario sin necesidad de categorización manual.
      //
      // { token: 'BTN_PROBLEMA', label: '🔧 Solucionar / Diagnosticar Problema', text: 'tengo un problema' },
      // { token: 'BTN_CONSULTA', label: '💡 Consulta / Asistencia Informática', text: 'tengo una consulta' },
      // ========================================================

      { token: 'BTN_DESKTOP', label: 'Desktop 💻', text: 'desktop' },
      { token: 'BTN_ALLINONE', label: 'All-in-One 🖥️', text: 'all in one' },
      { token: 'BTN_NOTEBOOK', label: 'Notebook 💼', text: 'notebook' },
      { token: 'BTN_SOLVED', label: '👍 Ya lo solucioné', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: '❌ Todavía no funciona', text: 'el problema persiste' },
      { token: 'BTN_ADVANCED_TESTS', label: '🔬 Pruebas Avanzadas', text: 'pruebas avanzadas' },
      { token: 'BTN_MORE_TESTS', label: '🔍 Más pruebas', text: 'más pruebas' },
      { token: 'BTN_TECH', label: '🧑‍💻 Técnico real', text: 'hablar con técnico' },
      { token: 'BTN_HELP_1', label: 'Ayuda paso 1', text: 'ayuda paso 1' },
      { token: 'BTN_HELP_2', label: 'Ayuda paso 2', text: 'ayuda paso 2' },
      { token: 'BTN_HELP_3', label: 'Ayuda paso 3', text: 'ayuda paso 3' },
      { token: 'BTN_HELP_4', label: 'Ayuda paso 4', text: 'ayuda paso 4' },
      { token: 'BTN_REPHRASE', label: 'Cambiar problema', text: 'cambiar problema' },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', text: 'cerrar chat' },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', text: 'enviar por whatsapp' },
      { token: 'BTN_CONNECT_TECH', label: '👨‍🏭 Conectar con Técnico', text: 'conectar con técnico' },
      { token: 'BTN_WHATSAPP_TECNICO', label: '💚 Hablar con un Técnico', text: 'hablar con un técnico' },
      { token: 'BTN_CONFIRM_TICKET', label: 'Sí, generar ticket ✅', text: 'sí, generar ticket' },
      { token: 'BTN_CANCEL', label: 'Cancelar ❌', text: 'cancelar' },
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
      { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', text: 'notebook' },
      // operating system tokens
      { token: 'BTN_OS_WINDOWS', label: '🪟 Windows', text: 'Windows' },
      { token: 'BTN_OS_MACOS', label: '🍏 macOS', text: 'macOS' },
      { token: 'BTN_OS_LINUX', label: '🐧 Linux', text: 'Linux' },
      { token: 'BTN_BACK_TO_STEPS', label: '⏪ Volver a los pasos', text: 'volver a los pasos' },
      { token: 'BTN_BACK', label: '⏪ Volver atrás', text: 'volver atrás' },
      { token: 'BTN_CHANGE_TOPIC', label: '🔄 Cambiar de tema', text: 'cambiar de tema' },
      { token: 'BTN_MORE_INFO', label: 'ℹ️ Más información', text: 'más información' },
      // Botones para instalaciones y guías
      { token: 'BTN_SUCCESS', label: '✅ Funcionó', text: 'funcionó' },
      { token: 'BTN_NEED_HELP', label: '❓ Necesito ayuda', text: 'necesito ayuda' },
      { token: 'BTN_YES', label: '✅ Sí', text: 'sí' },
      { token: 'BTN_NO', label: '❌ No', text: 'no' }
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
// ✅ REFACTOR: emojiForIndex, enumerateSteps, normalizeStepText ahora se importan de utils/stepsUtils.js
const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;

const IT_HEURISTIC_RX = /\b(pc|computadora|compu|notebook|laptop|router|modem|wi[-\s]*fi|wifi|impresora|printer|tv\s*stick|stick\s*tv|amazon\s*stick|fire\s*stick|magistv|magis\s*tv|windows|android|correo|email|outlook|office|word|excel)\b/i;

const FRUSTRATION_RX = /(esto no sirve|no sirve para nada|qué porquería|que porquería|no funciona nada|estoy cansado de esto|me cansé de esto|ya probé todo|sigo igual|no ayuda|no me ayuda)/i;

// Regex para detectar cuando el usuario no quiere dar su nombre
const NO_NAME_RX = /(prefiero no|no quiero|no te lo|no dar|no digo|no decir|sin nombre|anonimo|anónimo|skip|saltar|omitir)/i;

const NAME_STOPWORDS = new Set([
  'hola', 'buenas', 'buenos', 'gracias', 'gracias!', 'gracias.', 'gracias,', 'help', 'ayuda', 'porfa', 'por favor', 'hola!', 'buenas tardes', 'buenas noches', 'buen dia', 'buen dí­a', 'si', 'no'
]);

// 🔧 REFACTOR FASE 2: Constantes mantenidas para compatibilidad
const NAME_TOKEN_RX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,20}$/u;
const MAX_NAME_TOKENS = 3;
const MIN_NAME_TOKENS = 1;

// 🔧 REFACTOR FASE 2: Funciones eliminadas - ahora se usan desde handlers/nameHandler.js
// Las siguientes funciones están importadas en la línea 60:
// - capitalizeToken
// - isValidName
// - isValidHumanName (alias de isValidName)
// - extractName
// - looksClearlyNotName
// - analyzeNameWithOA
// 
// Estas funciones duplicadas fueron eliminadas de forma segura (~158 líneas).
// Todas las referencias ahora usan las funciones importadas desde handlers/nameHandler.js

// ========================================================
// TRANSCRIPT JSON HELPER (for Codex analysis)
// ========================================================

/**
 * ✅ MEDIO-6: Función consolidada - Lee y formatea una conversación del historial para análisis
 * ✅ ALTA PRIORIDAD-1: Migrado a async para usar fs.promises
 * @param {string} conversationId - ID de la conversación a leer
 * @returns {Promise<object|null>} - Datos formateados o null si no existe
 */
async function readHistorialChat(conversationId) {
  try {
    const historialPath = path.join(HISTORIAL_CHAT_DIR, `${conversationId}.json`);
    
    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    try {
      await fs.promises.access(historialPath);
    } catch (e) {
      console.log(`[HISTORIAL] ⚠️  Conversación no encontrada: ${conversationId}`);
      return null;
    }

    const data = JSON.parse(await fs.promises.readFile(historialPath, 'utf8'));
    
    // Formatear para lectura humana
    console.log('\n' + '='.repeat(80));
    console.log(`📋 HISTORIAL DE CONVERSACIÓN: ${conversationId}`);
    console.log('='.repeat(80));
    console.log(`👤 Usuario: ${data.usuario}`);
    console.log(`📅 Fecha: ${new Date(data.fecha_inicio).toLocaleString('es-AR')}`);
    console.log(`📱 Dispositivo: ${data.dispositivo}`);
    console.log(`🌍 Idioma: ${data.idioma}`);
    console.log(`💬 Total mensajes: ${data.metadata.total_mensajes} (${data.metadata.mensajes_usuario} usuario / ${data.metadata.mensajes_bot} bot)`);
    console.log('='.repeat(80) + '\n');
    
    // Mostrar conversación si existe
    if (data.conversacion && Array.isArray(data.conversacion)) {
      data.conversacion.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString('es-AR');
        const icon = msg.quien === 'USUARIO' ? '👤' : '🤖';
        console.log(`[${time}] ${icon} ${msg.quien}:`);
        console.log(`   ${msg.mensaje}`);
        console.log(`   (stage: ${msg.stage})`);
        console.log('');
      });
    }
    
    console.log('='.repeat(80));
    console.log(`📊 Stage inicial: ${data.metadata.stage_inicial}`);
    console.log(`📊 Stage final: ${data.metadata.stage_final}`);
    console.log(`✅ Solucionado: ${data.metadata.solucion_aplicada ? 'SÍ' : 'NO'}`);
    if (data.metadata.ticket_generado) {
      console.log(`🎫 Ticket generado: ${data.metadata.ticket_generado}`);
    }
    console.log('='.repeat(80) + '\n');
    
    return data;
  } catch (error) {
    console.error(`[HISTORIAL] ❌ Error leyendo conversación ${conversationId}:`, error.message);
    return null;
  }
}

// 🔧 REFACTOR: changeStage movida a handlers/stateMachine.js

/**
 * Guarda transcript de sesión en formato JSON para análisis por Codex
 * ✅ ALTA PRIORIDAD-1: Migrado a async para usar fs.promises
 * @param {string} sessionId - ID de la sesión
 * @param {object} session - Objeto de sesión completo
 * @returns {Promise<boolean>} - true si se guardó correctamente
 */
async function saveTranscriptJSON(sessionId, session) {
  if (!sessionId || !session) {
    console.error('[TRANSCRIPT] ❌ Missing sessionId or session data');
    return false;
  }
  
  try {
    // ✅ FASE 4-3: Limpieza de datos sensibles en logs - declarar una vez al inicio
    const sessionIdPreview = sessionId ? `${sessionId.substring(0, 8)}...` : 'null';
    console.log(`[TRANSCRIPT] Starting save for session: ${sessionIdPreview}`);
    
    const transcriptData = {
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      device: session.device || 'unknown',
      initialStage: session.initialStage || session.stage || 'greeting',
      finalStage: session.stage || 'unknown',
      messages: [],
      nlpAnalysis: {
        intent: session.intent || 'unknown',
        device: session.device || 'unknown',
        urgency: session.urgency || 'normal',
        confidence: session.confidence || 0
      },
      stageTransitions: session.stageTransitions || [],
      visionAnalysis: session.visionAnalysis || null
    };

    // Convertir transcript a formato de mensajes
    if (session.transcript && Array.isArray(session.transcript)) {
      transcriptData.messages = session.transcript.map(entry => ({
        sender: entry.who === 'user' ? 'user' : 'bot',
        role: entry.who === 'user' ? 'user' : 'assistant',
        text: entry.text || '',
        content: entry.text || '',
        timestamp: entry.ts || new Date().toISOString(),
        stage: entry.stage || session.stage,
        error: entry.error || false
      }));
    }

    // Agregar transiciones de stage si no existen
    if (!transcriptData.stageTransitions || transcriptData.stageTransitions.length === 0) {
      // Intentar reconstruir desde los mensajes
      const stages = new Set();
      session.transcript?.forEach(entry => {
        if (entry.stage) stages.add(entry.stage);
      });
      
      if (stages.size > 1) {
        const stagesArray = Array.from(stages);
        transcriptData.stageTransitions = stagesArray.slice(0, -1).map((stage, idx) => ({
          from: stage,
          to: stagesArray[idx + 1],
          timestamp: new Date().toISOString()
        }));
      }
    }

    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    // Guardar archivo JSON en transcripts (para Codex)
    const jsonPath = path.join(TRANSCRIPTS_DIR, `${sessionId}.json`);
    console.log(`[TRANSCRIPT] Saving to transcripts: ${jsonPath}`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(transcriptData, null, 2), 'utf8');
    console.log(`[TRANSCRIPT] ✅ Codex JSON saved successfully`);
    
    // ========================================================
    // HISTORIAL_CHAT: Guardar conversación legible para análisis manual
    // ========================================================
    const historialData = {
      id: sessionId,
      fecha_inicio: transcriptData.timestamp,
      fecha_ultima_actualizacion: new Date().toISOString(),
      usuario: session.userName || 'Anónimo',
      dispositivo: session.device || 'unknown',
      idioma: session.userLocale || 'es-AR',
      conversacion: []
    };

    // Construir conversación en formato legible
    if (session.transcript && Array.isArray(session.transcript)) {
      historialData.conversacion = session.transcript.map((entry, index) => {
        const timestamp = entry.ts || new Date().toISOString();
        const quien = entry.who === 'user' ? 'USUARIO' : 'TECNOS';
        
        const msg = {
          orden: index + 1,
          timestamp: timestamp,
          quien: quien,
          mensaje: entry.text || '',
          stage: entry.stage || 'unknown'
        };
        
        // Agregar botones/opciones si existen
        if (entry.opciones && Array.isArray(entry.opciones) && entry.opciones.length > 0) {
          msg.opciones_ofrecidas = entry.opciones;
        }
        
        return msg;
      });
    }

    // Agregar metadata adicional
    historialData.metadata = {
      total_mensajes: historialData.conversacion.length,
      mensajes_usuario: historialData.conversacion.filter(m => m.quien === 'USUARIO').length,
      mensajes_bot: historialData.conversacion.filter(m => m.quien === 'TECNOS').length,
      stage_inicial: session.initialStage || session.stage || 'greeting',
      stage_final: session.stage || 'unknown',
      problema_detectado: session.problem || null,
      solucion_aplicada: session.stage === 'ENDED' || session.stage === 'SOLVED',
      ticket_generado: session.ticketId || null,
      imagenes_enviadas: session.imageUrls ? session.imageUrls.length : 0
    };

    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    // Guardar en historial_chat con formato legible
    const historialPath = path.join(HISTORIAL_CHAT_DIR, `${sessionId}.json`);
    console.log(`[HISTORIAL] Saving to historial_chat: ${historialPath}`);
    await fs.promises.writeFile(historialPath, JSON.stringify(historialData, null, 2), 'utf8');
    
    // ✅ FASE 4-3: Limpieza de datos sensibles en logs
    const sessionIdPreview2 = sessionId ? `${sessionId.substring(0, 8)}...` : 'null';
    console.log(`[HISTORIAL] Conversación guardada: ID ${sessionIdPreview2} (${historialData.conversacion.length} mensajes)`);
    console.log(`[TRANSCRIPT] JSON saved for Codex: ${sessionIdPreview2}.json`);
    
    return true;
  } catch (error) {
    console.error(`[TRANSCRIPT] ❌ Error saving JSON for ${sessionId}:`, error.message);
    console.error(`[TRANSCRIPT] Error stack:`, error.stack);
    console.error(`[TRANSCRIPT] TRANSCRIPTS_DIR:`, TRANSCRIPTS_DIR);
    console.error(`[TRANSCRIPT] HISTORIAL_CHAT_DIR:`, HISTORIAL_CHAT_DIR);
    return false;
  }
}

/**
 * Helper function: Save session to Redis AND save transcript JSON files
 * Combines saveSession() + saveTranscriptJSON() to ensure files are always created
 * @param {string} sessionId - Session ID
 * @param {object} sessionData - Complete session object
 */
async function saveSessionAndTranscript(sessionId, sessionData) {
  await saveSession(sessionId, sessionData);
  await saveTranscriptJSON(sessionId, sessionData);
}

/**
 * ✅ MEDIO-12: Helper para respuestas optimizadas con guardado diferido
 * Envuelve res.json() y hace flush de guardados pendientes antes de responder
 * Reduce múltiples escrituras a disco a una sola operación por request
 * 
 * @param {object} res - Express response object
 * @param {string} sessionId - Session ID
 * @param {object} session - Session object actualizado
 * @param {object} payload - Payload para enviar al cliente {ok, reply, stage, options?, ...}
 * @returns {Promise<void>} Resuelve cuando la respuesta se envió
 */
async function sendResponseWithSave(res, sessionId, session, payload) {
  // Flush todos los guardados pendientes antes de responder
  await flushPendingSaves(sessionId, session, saveSessionAndTranscript);
  
  // Enviar respuesta
  return res.json(payload);
}

// ✅ REFACTOR: addBotMessageToTranscript eliminada - no se usaba en ningún lugar
// Los mensajes del bot se agregan directamente con session.transcript.push()

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
    // ✅ FASE 4-2 y FASE 5-3: Timeout con constante centralizada
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);
    
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
      console.log('[analyzeProblemWithOA] 🖼️ Análisis de imagen recibido:', imageAnalysis.substring(0, 200) + '...');
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

  // ✅ CORRECCIÓN 2 y 3: Detectar si es teclado de notebook para generar pasos específicos
  const isNotebookKeyboard = /notebook|laptop|portátil/i.test(deviceLabel) && /teclado|keyboard/i.test(userText);
  const notebookKeyboardContext = isNotebookKeyboard ? [
    '',
    '⚠️ CONTEXTO ESPECIAL: El problema es con el teclado de una NOTEBOOK.',
    'Los pasos deben ser ESPECÍFICOS para teclado de notebook (NO teclado externo):',
    '- Verificar si funciona en BIOS (al iniciar)',
    '- Probar combinación Fn + NumLock o Fn + F11/F12 (desbloqueo de teclado)',
    '- Activar teclado en pantalla (On-Screen Keyboard)',
    '- Preguntar si hubo derrame de líquido reciente',
    '- Preguntar si la notebook sufrió golpe o caída',
    '- Recargar driver del teclado (si el usuario puede usar mouse)',
    '- NO sugerir revisar cables USB o conexiones (no aplica a teclado integrado)',
    ''
  ].join('\n') : '';

  const prompt = [
    'Generá una lista de 15 pasos numerados para ayudar a un usuario final a diagnosticar y resolver un problema técnico.',
    `El usuario habla en el idioma: ${profile.languageTag}.`,
    `Dispositivo (si se conoce): ${deviceLabel}.`,
    imageContext, // Incluir análisis de imagen aquí
    notebookKeyboardContext, // ✅ CORRECCIÓN 2 y 3: Contexto específico para teclado de notebook
    '',
    'ESTRUCTURA DE DIFICULTAD:',
    '- Pasos 1-3: Muy fáciles (ej: reiniciar, verificar conexiones básicas)',
    '- Pasos 4-6: Fáciles (ej: revisar configuraciones simples, limpiar caché)',
    '- Pasos 7-9: Intermedios (ej: actualizar drivers, verificar logs)',
    '- Pasos 10-12: Difíciles (ej: modificar configuraciones avanzadas, usar herramientas del sistema)',
    '- Pasos 13-15: Muy difíciles (ej: análisis profundo, comandos técnicos avanzados)',
    '',
    'IMPORTANTE:',
    '- Respondé SOLO en el idioma del usuario.',
    '- Devolvé la respuesta SOLO como un array JSON de strings (sin explicación extra).',
    '- Cada string debe describir un paso concreto, simple y seguro.',
    '- Los primeros pasos deben ser muy simples y seguros.',
    '- La complejidad debe aumentar gradualmente.',
    '- Evitá cualquier acción peligrosa o destructiva.',
    '- NO incluyas el nivel de dificultad en el texto del paso (se agregará automáticamente).',
    imageAnalysis ? '- Los pasos deben ser RELEVANTES al error específico mostrado en la imagen.' : '',
    isNotebookKeyboard ? '- Los pasos deben ser ESPECÍFICOS para teclado de notebook (no teclado externo).' : '',
    '',
    // Si se recibieron pasos a evitar, pedí explícitamente no repetirlos
    (Array.isArray(avoidSteps) && avoidSteps.length) ? (`- NO repitas los siguientes pasos ya probados por el usuario: ${avoidSteps.map(s => '"' + String(s).replace(/\s+/g,' ').trim().slice(0,80) + '"').join(', ')}`) : '',
    '',
    'Ejemplo de formato de salida:',
    '["Reiniciar el equipo completamente", "Verificar conexiones de cables", "Revisar indicadores LED", ...]',
    '',
    'Texto del usuario (descripción del problema):',
    userText
  ].filter(Boolean).join('\n');

  try {
    // ✅ FASE 4-2 y FASE 5-3: Timeout con constante centralizada
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1200
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
      const fallbackSteps = isEn ? [
        'Restart the device and check if the problem persists.',
        'Verify cables and connections and check for visible damage.',
        'If possible, test the device on another TV, monitor or power outlet.',
        'Check for software updates and install any pending updates.',
        'Review system logs for errors or warnings.',
        'Test the device in safe mode to isolate software issues.',
        'Perform a system restore to a previous working state.',
        'Check device manager for hardware conflicts or driver issues.',
        'Run system diagnostics tools provided by the manufacturer.',
        'Verify BIOS/UEFI settings are correct for your hardware.',
        'Test individual components (RAM, hard drive, etc.) using diagnostic tools.',
        'Review and modify advanced system settings if necessary.',
        'Clear temporary files and cache to free up system resources.',
        'Update or reinstall device drivers from the manufacturer\'s website.',
        'If the problem persists, contact a technician with details.'
      ] : [
        'Reiniciá el equipo y fijate si el problema sigue.',
        'Revisá cables y conexiones y verificá que no haya daño visible.',
        'Si podés, probá el equipo en otro televisor, monitor o enchufe.',
        'Verificá actualizaciones de software e instalá las pendientes.',
        'Revisá los registros del sistema en busca de errores o advertencias.',
        'Probá el equipo en modo seguro para aislar problemas de software.',
        'Realizá una restauración del sistema a un estado anterior que funcionaba.',
        'Revisá el administrador de dispositivos en busca de conflictos de hardware o problemas de drivers.',
        'Ejecutá herramientas de diagnóstico del sistema proporcionadas por el fabricante.',
        'Verificá que la configuración del BIOS/UEFI sea correcta para tu hardware.',
        'Probá componentes individuales (RAM, disco duro, etc.) usando herramientas de diagnóstico.',
        'Revisá y modificá configuraciones avanzadas del sistema si es necesario.',
        'Limpiá archivos temporales y caché para liberar recursos del sistema.',
        'Actualizá o reinstalá los drivers del dispositivo desde el sitio web del fabricante.',
        'Si el problema continúa, contactá a un técnico y comentale estos pasos que ya probaste.'
      ];
      // Asegurar exactamente 15 pasos
      return fallbackSteps.slice(0, 15);
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      // Si no hay pasos parseados, devolver 15 pasos genéricos
      const isEn = profile.code === 'en';
      const genericSteps = isEn ? [
        'Restart the device and check if the problem persists.',
        'Verify cables and connections and check for visible damage.',
        'If possible, test the device on another TV, monitor or power outlet.',
        'Check for software updates and install any pending updates.',
        'Review system logs for errors or warnings.',
        'Test the device in safe mode to isolate software issues.',
        'Perform a system restore to a previous working state.',
        'Check device manager for hardware conflicts or driver issues.',
        'Run system diagnostics tools provided by the manufacturer.',
        'Verify BIOS/UEFI settings are correct for your hardware.',
        'Test individual components (RAM, hard drive, etc.) using diagnostic tools.',
        'Review and modify advanced system settings if necessary.',
        'Clear temporary files and cache to free up system resources.',
        'Update or reinstall device drivers from the manufacturer\'s website.',
        'If the problem persists, contact a technician with details.'
      ] : [
        'Reiniciá el equipo y fijate si el problema sigue.',
        'Revisá cables y conexiones y verificá que no haya daño visible.',
        'Si podés, probá el equipo en otro televisor, monitor o enchufe.',
        'Verificá actualizaciones de software e instalá las pendientes.',
        'Revisá los registros del sistema en busca de errores o advertencias.',
        'Probá el equipo en modo seguro para aislar problemas de software.',
        'Realizá una restauración del sistema a un estado anterior que funcionaba.',
        'Revisá el administrador de dispositivos en busca de conflictos de hardware o problemas de drivers.',
        'Ejecutá herramientas de diagnóstico del sistema proporcionadas por el fabricante.',
        'Verificá que la configuración del BIOS/UEFI sea correcta para tu hardware.',
        'Probá componentes individuales (RAM, disco duro, etc.) usando herramientas de diagnóstico.',
        'Revisá y modificá configuraciones avanzadas del sistema si es necesario.',
        'Limpiá archivos temporales y caché para liberar recursos del sistema.',
        'Actualizá o reinstalá los drivers del dispositivo desde el sitio web del fabricante.',
        'Si el problema continúa, contactá a un técnico y comentale estos pasos que ya probaste.'
      ];
      return genericSteps.slice(0, 15);
    }
    // Retornar hasta 15 pasos, rellenar si hay menos
    const steps = parsed.map(s => String(s)).slice(0, 15);
    // Si hay menos de 15 pasos, generar pasos genéricos adicionales
    if (steps.length < 15) {
      const isEn = profile.code === 'en';
      const genericSteps = isEn ? [
        'Check for software updates',
        'Review system logs for errors',
        'Test in safe mode',
        'Perform a system restore',
        'Check device manager for hardware conflicts',
        'Run system diagnostics tools',
        'Verify BIOS/UEFI settings',
        'Test individual components',
        'Review and modify advanced system settings',
        'Clear temporary files and cache',
        'Update or reinstall device drivers',
        'Contact technical support with detailed information',
        'Verify all external connections',
        'Check for malware or virus infections',
        'If the problem persists, contact a technician with details'
      ] : [
        'Verificar actualizaciones de software',
        'Revisar registros del sistema en busca de errores',
        'Probar en modo seguro',
        'Realizar una restauración del sistema',
        'Revisar administrador de dispositivos por conflictos de hardware',
        'Ejecutar herramientas de diagnóstico del sistema',
        'Verificar configuración del BIOS/UEFI',
        'Probar componentes individuales',
        'Revisar y modificar configuraciones avanzadas del sistema',
        'Limpiar archivos temporales y caché',
        'Actualizar o reinstalar drivers del dispositivo',
        'Contactar soporte técnico con información detallada',
        'Verificar todas las conexiones externas',
        'Verificar infecciones de malware o virus',
        'Si el problema continúa, contactar a un técnico con detalles'
      ];
      const existingSet = new Set(steps.map(normalizeStepText));
      const newGeneric = genericSteps.filter(s => !existingSet.has(normalizeStepText(s)));
      while (steps.length < 15 && newGeneric.length > 0) {
        steps.push(newGeneric.shift());
      }
      // Si aún faltan pasos, completar con pasos genéricos repetidos pero variados
      while (steps.length < 15) {
        const fallback = isEn 
          ? `Additional diagnostic step ${steps.length + 1}: Review and document any error messages or unusual behavior.`
          : `Paso de diagnóstico adicional ${steps.length + 1}: Revisá y documentá cualquier mensaje de error o comportamiento inusual.`;
        steps.push(fallback);
      }
    }
    // Asegurar exactamente 15 pasos
    return steps.slice(0, 15);
  } catch (err) {
    console.error('[aiQuickTests] error:', err?.message || err);
    const isEn = getLocaleProfile(locale).code === 'en';
    const errorFallbackSteps = isEn ? [
      'Restart the device completely (turn it off and unplug it for 30 seconds).',
      'Check connections (power, HDMI, network) and try again.',
      'Check for software updates and install any pending updates.',
      'Review system logs for errors or warnings.',
      'Test the device in safe mode to isolate software issues.',
      'Perform a system restore to a previous working state.',
      'Check device manager for hardware conflicts or driver issues.',
      'Run system diagnostics tools provided by the manufacturer.',
      'Verify BIOS/UEFI settings are correct for your hardware.',
      'Test individual components (RAM, hard drive, etc.) using diagnostic tools.',
      'Review and modify advanced system settings if necessary.',
      'Clear temporary files and cache to free up system resources.',
      'Update or reinstall device drivers from the manufacturer\'s website.',
      'Contact technical support with detailed information about the problem and steps already tried.',
      'If the problem persists, contact a technician with details of what you already tried.'
    ] : [
      'Reiniciá el equipo por completo (apagalo y desenchufalo 30 segundos).',
      'Revisá conexiones (corriente, HDMI, red) y probá de nuevo.',
      'Verificá actualizaciones de software e instalá las pendientes.',
      'Revisá los registros del sistema en busca de errores o advertencias.',
      'Probá el equipo en modo seguro para aislar problemas de software.',
      'Realizá una restauración del sistema a un estado anterior que funcionaba.',
      'Revisá el administrador de dispositivos en busca de conflictos de hardware o problemas de drivers.',
      'Ejecutá herramientas de diagnóstico del sistema proporcionadas por el fabricante.',
      'Verificá que la configuración del BIOS/UEFI sea correcta para tu hardware.',
      'Probá componentes individuales (RAM, disco duro, etc.) usando herramientas de diagnóstico.',
      'Revisá y modificá configuraciones avanzadas del sistema si es necesario.',
      'Limpiá archivos temporales y caché para liberar recursos del sistema.',
      'Actualizá o reinstalá los drivers del dispositivo desde el sitio web del fabricante.',
      'Contactá soporte técnico con información detallada sobre el problema y los pasos que ya probaste.',
      'Si el problema continúa, contactá a un técnico con el detalle de lo que ya probaste.'
    ];
    // Asegurar exactamente 15 pasos
    return errorFallbackSteps.slice(0, 15);
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
    // ✅ FASE 4-2 y FASE 5-3: Timeout con constante centralizada
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);
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
// 🔧 REFACTOR: validateCSRF movida a utils/security.js

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
  : [
      'https://stia.com.ar',
      'https://www.stia.com.ar',
      'https://sti-rosario-ai.onrender.com' // Render backend URL
    ];

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
    const token = String(req.query?.token || '');
    if (isLogsPath && LOG_TOKEN && token && token === String(LOG_TOKEN)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      return next();
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
  keyGenerator: (req) => {
    // Rate limit por IP + Session (más estricto)
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const sid = req.sessionId || 'no-session';
    return `${ip}:${sid}`;
  },
  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] Upload blocked: IP=${req.ip}, Session=${req.sessionId}`);
    res.status(429).json({ ok: false, error: 'Demasiadas imágenes subidas. Esperá un momento.' });
  }
});

// ========================================================
// 🔐 RATE LIMITERS (Production-Ready)
// ========================================================

// ========================================================
// 👥 CONCURRENT USER LIMIT (Production: 10 usuarios máximo)
// ========================================================
const activeUsers = new Map(); // Map<sessionId, {lastActivity, createdAt}>
// ✅ PRODUCCIÓN: Confirmar límite de 10 usuarios
const MAX_CONCURRENT = MAX_CONCURRENT_USERS || 10;
if (MAX_CONCURRENT !== 10) {
  console.warn(`[WARN] MAX_CONCURRENT_USERS es ${MAX_CONCURRENT}, no 10. Ajustar en constants.js si es necesario.`);
} else {
  console.log(`[CONCURRENT_USERS] ✅ Límite configurado: ${MAX_CONCURRENT} usuarios simultáneos`);
}

/**
 * Verifica si se puede aceptar un nuevo usuario concurrente
 * @param {string} sessionId - ID de sesión
 * @returns {Object} {allowed: boolean, reason?: string, activeCount: number}
 */
function checkConcurrentUserLimit(sessionId) {
  const now = Date.now();
  
  // Limpiar usuarios inactivos (sin actividad por 30 minutos)
  for (const [sid, data] of activeUsers.entries()) {
    if (now - data.lastActivity > USER_SESSION_TIMEOUT_MS) {
      activeUsers.delete(sid);
      console.log(`[CONCURRENT_USERS] Removed inactive session: ${sid.substring(0, 8)}...`);
    }
  }
  
  const activeCount = activeUsers.size;
  
  // Si la sesión ya está activa, actualizar timestamp y permitir
  if (activeUsers.has(sessionId)) {
    activeUsers.set(sessionId, {
      lastActivity: now,
      createdAt: activeUsers.get(sessionId).createdAt
    });
    return { allowed: true, activeCount };
  }
  
  // Si hay espacio, agregar nuevo usuario
  if (activeCount < MAX_CONCURRENT) {
    activeUsers.set(sessionId, {
      lastActivity: now,
      createdAt: now
    });
    console.log(`[CONCURRENT_USERS] ✅ New user accepted. Active: ${activeCount + 1}/${MAX_CONCURRENT}`);
    return { allowed: true, activeCount: activeCount + 1 };
  }
  
  // Límite alcanzado
  console.warn(`[CONCURRENT_USERS] ❌ Limit reached. Active: ${activeCount}/${MAX_CONCURRENT}. Rejecting session: ${sessionId.substring(0, 8)}...`);
  return { 
    allowed: false, 
    reason: `Límite de ${MAX_CONCURRENT} usuarios concurrentes alcanzado. Por favor, intentá más tarde.`,
    activeCount 
  };
}

/**
 * Actualiza la actividad de un usuario activo
 * @param {string} sessionId - ID de sesión
 */
function updateUserActivity(sessionId) {
  if (activeUsers.has(sessionId)) {
    activeUsers.set(sessionId, {
      ...activeUsers.get(sessionId),
      lastActivity: Date.now()
    });
  }
}

/**
 * Remueve un usuario de la lista de activos (al cerrar sesión)
 * @param {string} sessionId - ID de sesión
 */
function removeActiveUser(sessionId) {
  if (activeUsers.delete(sessionId)) {
    console.log(`[CONCURRENT_USERS] Removed user. Active: ${activeUsers.size}/${MAX_CONCURRENT}`);
  }
}

// Limpiar usuarios inactivos cada 5 minutos
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [sid, data] of activeUsers.entries()) {
    if (now - data.lastActivity > USER_SESSION_TIMEOUT_MS) {
      activeUsers.delete(sid);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CONCURRENT_USERS] Cleaned ${cleaned} inactive user(s). Active: ${activeUsers.size}/${MAX_CONCURRENT}`);
  }
}, 5 * 60 * 1000);

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
  keyGenerator: (req) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return ip;
  },
  handler: (req, res) => {
    console.warn(`[RATE_LIMIT] IP BLOCKED - Too many messages:`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Session: ${req.sessionId}`);
    console.warn(`  Path: ${req.path}`);
    updateMetric('errors', 'count', 1);
    res.status(429).json({
      ok: false,
      reply: '😅 Estás escribiendo muy rápido desde esta conexión. Esperá un momento.',
      error: 'Demasiados mensajes desde esta IP. Esperá un momento.',
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
// 🔧 REFACTOR: STATES movido a handlers/stateMachine.js

// 🔧 REFACTOR: generateSessionId movida a utils/validation.js

// ========================================================
// Security: Input Validation & Sanitization
// ========================================================
// 🔧 REFACTOR: Funciones movidas a utils/sanitization.js y utils/validation.js
// Las funciones sanitizeInput, sanitizeFilePath, isPathSafe, validateSessionId, getSessionId
// ahora están importadas desde los módulos utils

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

// Transcript retrieval (REQUIERE AUTENTICACIÓN)
app.get('/api/transcript/:sid', async (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');

  // SECURITY: Validar que el usuario tenga permiso para ver este transcript
  const requestSessionId = req.sessionId || req.headers['x-session-id'];
  const adminToken = req.headers.authorization || req.query.token;

  // Permitir solo si:
  // 1. El session ID del request coincide con el transcript solicitado
  // 2. O tiene un admin token válido
  if (sid !== requestSessionId && adminToken !== LOG_TOKEN) {
    console.warn(`[SECURITY] Unauthorized transcript access attempt: requested=${sid}, session=${requestSessionId}, IP=${req.ip}`);
    return res.status(403).json({ ok: false, error: 'No autorizado para ver este transcript' });
  }

  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
  try {
    await fs.promises.access(file);
  } catch (e) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
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

// Transcript JSON retrieval (REQUIERE AUTENTICACIÓN) - Para admin.php
app.get('/api/transcript-json/:sid', async (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');

  // SECURITY: Validar autenticación con admin token
  let adminToken = req.headers.authorization || req.query.token;
  
  if (adminToken && adminToken.startsWith('Bearer ')) {
    adminToken = adminToken.substring(7);
  }

  if (adminToken !== LOG_TOKEN) {
    console.warn(`[SECURITY] Unauthorized transcript-json access attempt: requested=${sid}, IP=${req.ip}`);
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }

  const file = path.join(TRANSCRIPTS_DIR, `${sid}.json`);
  
  // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
  try {
    await fs.promises.access(file);
  } catch (e) {
    return res.status(404).json({ ok: false, error: 'Transcript no encontrado' });
  }

  try {
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    
    // Extraer solo los mensajes del transcript
    const transcript = data.messages || [];
    
    res.json({ 
      ok: true, 
      transcript: transcript,
      sessionId: data.sessionId,
      timestamp: data.timestamp,
      device: data.device,
      initialStage: data.initialStage,
      finalStage: data.finalStage
    });
  } catch (e) {
    console.error('[api/transcript-json] error', e && e.message);
    res.status(500).json({ ok: false, error: 'Error al leer transcript' });
  }
});

// ========================================================
// HISTORIAL_CHAT: Obtener conversación completa
// ========================================================
app.get('/api/historial/:conversationId', async (req, res) => {
  const conversationId = String(req.params.conversationId || '').replace(/[^a-zA-Z0-9._-]/g, '');

  // SECURITY: Validar autenticación
  const requestSessionId = req.sessionId || req.headers['x-session-id'];
  let adminToken = req.headers.authorization || req.query.token;
  
  // Extraer token si viene como "Bearer <token>"
  if (adminToken && adminToken.startsWith('Bearer ')) {
    adminToken = adminToken.substring(7);
  }

  // Permitir solo si:
  // 1. El session ID del request coincide con el conversationId solicitado
  // 2. O tiene un admin token válido (LOG_TOKEN para admin panel)
  if (conversationId !== requestSessionId && adminToken !== LOG_TOKEN) {
    console.warn(`[SECURITY] Unauthorized historial access attempt: requested=${conversationId}, session=${requestSessionId}, IP=${req.ip}`);
    return res.status(403).json({ ok: false, error: 'No autorizado para ver este historial' });
  }

  const historialPath = path.join(HISTORIAL_CHAT_DIR, `${conversationId}.json`);
  
  // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
  try {
    await fs.promises.access(historialPath);
  } catch (e) {
    return res.status(404).json({ ok: false, error: 'Conversación no encontrada' });
  }

  try {
    const data = JSON.parse(await fs.promises.readFile(historialPath, 'utf8'));
    
    // Opcional: Maskear PII si no es admin
    if (adminToken !== LOG_TOKEN && data.usuario) {
      data.usuario = data.usuario.substring(0, 1) + '***';
    }

    res.json({ ok: true, historial: data });
  } catch (error) {
    console.error('[api/historial] Error:', error.message);
    res.status(500).json({ ok: false, error: 'Error al leer historial' });
  }
});

// ========================================================
// RUTAS MODULARES
// ========================================================
app.use('/', ticketsRouter);

// Logs SSE and plain endpoints
app.get('/api/logs/stream', async (req, res) => {
  try {
    if (LOG_TOKEN && String(req.query.token || '') !== LOG_TOKEN) {
      return res.status(401).send('unauthorized');
    }
    if (String(req.query.mode || '') === 'once') {
      const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(txt);
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.flushHeaders && res.flushHeaders();
    res.write(': connected\n\n');

    // Límite de clientes SSE para prevenir memory leak
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      res.write('data: ERROR: Maximum SSE clients reached\n\n');
      try { res.end(); } catch (_) { }
      return;
    }

    (async function sendLast() {
      try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stat = await fs.promises.stat(LOG_FILE);
        const start = Math.max(0, stat.size - (32 * 1024));
        const stream = createReadStream(LOG_FILE, { start, end: stat.size - 1, encoding: 'utf8' });
        for await (const chunk of stream) {
          sseSend(res, chunk);
        }
      } catch (e) { /* ignore */ }
    })();

    sseClients.add(res);
    console.log('[logs] SSE cliente conectado. total=', sseClients.size);

    const hbInterval = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
    }, 20_000);

    req.on('close', () => {
      clearInterval(hbInterval);
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
  if (LOG_TOKEN && String(req.query.token || '') !== LOG_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    let txt = '';
    try {
      await fs.promises.access(LOG_FILE);
      txt = await fs.promises.readFile(LOG_FILE, 'utf8');
    } catch (e) {
      // Archivo no existe, usar string vacío
    }
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(txt);
  } catch (e) {
    console.error('[api/logs] Error', e.message);
    res.status(500).json({ ok: false, error: e.message });
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

    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    try { await fs.promises.mkdir(TICKETS_DIR, { recursive: true }); } catch (e) { /* noop */ }
    const ticketPathTxt = path.join(TICKETS_DIR, `${ticketId}.txt`);
    await fs.promises.writeFile(ticketPathTxt, lines.join('\n'), 'utf8');

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
    await fs.promises.writeFile(ticketPathJson, JSON.stringify(ticketJson, null, 2), 'utf8');

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

    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    // Leer todos los archivos JSON del directorio de tickets
    const files = (await fs.promises.readdir(TICKETS_DIR)).filter(f => f.endsWith('.json'));
    const tickets = [];

    for (const file of files) {
      try {
        const filePath = path.join(TICKETS_DIR, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
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

    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    let txtExists = false;
    let jsonExists = false;
    try {
      await fs.promises.access(txtFile);
      txtExists = true;
    } catch (e) { /* noop */ }
    try {
      await fs.promises.access(jsonFile);
      jsonExists = true;
    } catch (e) { /* noop */ }

    if (!txtExists && !jsonExists) {
      return res.status(404).json({ ok: false, error: 'Ticket no encontrado' });
    }

    // Eliminar archivos
    let deletedFiles = [];
    if (txtExists) {
      await fs.promises.unlink(txtFile);
      deletedFiles.push('txt');
    }
    if (jsonExists) {
      await fs.promises.unlink(jsonFile);
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

// ✅ RUTAS MOVIDAS A routes/tickets.js
// app.get('/api/ticket/:tid', ...) - Ahora manejado por ticketsRouter
// app.get('/ticket/:tid', ...) - Ahora manejado por ticketsRouter

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
  CANCEL: 'BTN_CANCEL'
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

    // ✅ FASE 4-3: Limpieza de datos sensibles en logs - declarar una vez al inicio
    const sessionIdPreview = sessionId ? `${sessionId.substring(0, 8)}...` : 'null';
    
    // Verificar que la sesión existe y está activa
    const session = await getSession(sessionId);

    if (!session) {
      console.log(`[SESSION] Validación fallida: sesión no encontrada ${sessionIdPreview}`);
      return res.json({ valid: false, error: 'Sesión no encontrada' });
    }

    // Verificar que no haya expirado (48 horas)
    const MAX_AGE = 48 * 60 * 60 * 1000;
    const sessionAge = Date.now() - (session.createdAt || 0);

    if (sessionAge > MAX_AGE) {
      console.log(`[SESSION] Validación fallida: sesión expirada ${sessionIdPreview}, age=${Math.floor(sessionAge / 1000 / 60)}min`);
      await deleteSession(sessionId);
      return res.json({ valid: false, error: 'Sesión expirada' });
    }

    console.log(`[SESSION] Validación exitosa: ${sessionIdPreview}, stage=${session.stage}`);

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

// ========================================================
// AUTO-LEARNING ENDPOINTS (Protected by LOG_TOKEN)
// ========================================================
import {
  analyzeAndSuggestImprovements,
  applySafeImprovements,
  loadConfig as loadLearningConfig,
  SAFETY_CONFIG
} from './services/learningService.js';

/**
 * GET /api/learning/report
 * Analiza conversaciones y genera reporte de sugerencias (READ-ONLY)
 */
app.get('/api/learning/report', async (req, res) => {
  // Verificar autenticación
  if (LOG_TOKEN && String(req.query.token || '') !== LOG_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    console.log('[LEARNING] Iniciando análisis de conversaciones...');
    const result = await analyzeAndSuggestImprovements();

    if (!result.ok) {
      return res.status(400).json(result);
    }

    console.log(`[LEARNING] Análisis completado: ${result.stats.suggestionsGenerated} sugerencias generadas`);

    // Devolver reporte completo
    res.json({
      ok: true,
      timestamp: result.timestamp,
      stats: result.stats,
      suggestions: result.suggestions,
      config: {
        minConversations: SAFETY_CONFIG.minConversationsRequired,
        minConfidence: SAFETY_CONFIG.minConfidenceThreshold,
        maxSuggestions: SAFETY_CONFIG.maxSuggestionsPerRun
      }
    });

  } catch (error) {
    console.error('[LEARNING] Error en análisis:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/learning/apply
 * Aplica sugerencias de mejora a archivos de configuración JSON
 * REQUIERE: AUTO_LEARNING_ENABLED=true en config
 */
app.post('/api/learning/apply', async (req, res) => {
  // Verificar autenticación
  if (LOG_TOKEN && String(req.query.token || '') !== LOG_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const { suggestions, dryRun = false } = req.body;

    if (!suggestions) {
      return res.status(400).json({
        ok: false,
        error: 'Falta parámetro "suggestions"'
      });
    }

    // Verificar que AUTO_LEARNING esté habilitado
    const featuresConfig = await loadLearningConfig('app-features.json');
    if (!featuresConfig || !featuresConfig.features.autoLearning) {
      return res.status(403).json({
        ok: false,
        error: 'AUTO_LEARNING está deshabilitado. Activalo en config/app-features.json'
      });
    }

    if (dryRun) {
      console.log('[LEARNING] Dry-run mode: no se aplicarán cambios');
      return res.json({
        ok: true,
        dryRun: true,
        message: 'Modo dry-run: ningún cambio fue aplicado',
        suggestions
      });
    }

    console.log('[LEARNING] Aplicando mejoras...');
    const result = await applySafeImprovements(suggestions);

    if (!result.ok) {
      return res.status(500).json(result);
    }

    console.log(`[LEARNING] Aplicación completada: ${result.applied} mejoras aplicadas`);

    res.json({
      ok: true,
      applied: result.applied,
      results: result.results,
      timestamp: result.timestamp,
      message: `Se aplicaron ${result.applied} mejoras exitosamente`
    });

  } catch (error) {
    console.error('[LEARNING] Error aplicando mejoras:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/learning/config
 * Devuelve configuración actual de auto-learning
 */
app.get('/api/learning/config', async (req, res) => {
  // Verificar autenticación
  if (LOG_TOKEN && String(req.query.token || '') !== LOG_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const featuresConfig = await loadLearningConfig('app-features.json');

    res.json({
      ok: true,
      config: featuresConfig,
      safetyRules: SAFETY_CONFIG
    });

  } catch (error) {
    console.error('[LEARNING] Error cargando config:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * GET /api/learning/status
 * Devuelve estado actual del sistema de auto-learning
 */
app.get('/api/learning/status', async (req, res) => {
  // Verificar autenticación
  if (LOG_TOKEN && String(req.query.token || '') !== LOG_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const { getAutoLearningStatus } = await import('./services/learningService.js');
    const status = await getAutoLearningStatus();

    res.json(status);

  } catch (error) {
    console.error('[LEARNING] Error obteniendo status:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
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
    
    // ✅ PRODUCCIÓN: Verificar límite de usuarios concurrentes
    const concurrentCheck = checkConcurrentUserLimit(sid);
    if (!concurrentCheck.allowed) {
      console.warn(`[CONCURRENT_USERS] Rejected new greeting. Active: ${concurrentCheck.activeCount}/${MAX_CONCURRENT}`);
      return res.status(503).json({
        ok: false,
        error: concurrentCheck.reason || `Límite de ${MAX_CONCURRENT} usuarios concurrentes alcanzado. Por favor, intentá más tarde.`,
        retryAfter: 60,
        activeUsers: concurrentCheck.activeCount,
        maxUsers: MAX_CONCURRENT
      });
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
      locale = 'en-US';
    } else if (accept.startsWith('es')) {
      locale = accept.includes('ar') ? 'es-AR' : 'es-419';
    }

    // Generar CSRF token para esta sesión
    const csrfToken = generateCSRFToken(sid);

    const fresh = {
      id: sid,
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
    fresh.transcript.push({ who: 'bot', text: fullGreeting.text, ts: nowIso() });
    await saveSession(sid, fresh);

    // CON botones para GDPR
    // Incluir CSRF token en respuesta
    return res.json({
      ok: true,
      greeting: fullGreeting.text,
      reply: fullGreeting.text,
      stage: fresh.stage,
      sessionId: sid,
      csrfToken: csrfToken,
      buttons: fullGreeting.buttons || []
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'greeting_failed' });
  }
});


// 🔧 REFACTOR FASE 2: Función eliminada - ahora se usa desde utils/helpers.js
// La función buildTimeGreeting está importada en la línea 64

function buildLanguageSelectionGreeting() {
  return {
    text: `📋 **Privacy Policy and Consent / Política de Privacidad y Consentimiento**

Before continuing, I want to inform you: / Antes de continuar, quiero informarte:

✅ I will store your name and our conversation for **48 hours** / Guardaré tu nombre y nuestra conversación durante **48 horas**
✅ Data will be used **only to provide technical support** / Los datos se usarán **solo para brindarte soporte técnico**
✅ You can request **deletion of your data** at any time / Podés solicitar **eliminación de tus datos** en cualquier momento
✅ **We do not share** your information with third parties / **No compartimos** tu información con terceros
✅ We comply with **GDPR and privacy regulations** / Cumplimos con **GDPR y normativas de privacidad**

🔗 Full policy / Política completa: https://stia.com.ar/politica-privacidad.html

**Do you accept these terms? / ¿Aceptás estos términos?**`,
    buttons: [
      { text: 'Yes, I Accept ✔️ / Sí Acepto ✔️', value: 'si' },
      { text: 'No, I Do Not Accept ❌ / No Acepto ❌', value: 'no' }
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


// 🔧 REFACTOR FASE 2: Función eliminada - ahora se usa desde utils/helpers.js
// La función buildLanguagePrompt está importada en la línea 64

// 🔧 REFACTOR FASE 2: Función eliminada - ahora se usa desde utils/helpers.js
// La función buildNameGreeting está importada en la línea 64



// Helper: create ticket & WhatsApp response
async function createTicketAndRespond(session, sid, res) {
  // Prevenir race condition con lock simple
  if (ticketCreationLocks.has(sid)) {
    const waitTime = Date.now() - ticketCreationLocks.get(sid);
    if (waitTime < 5000) { // Si hace menos de 5 segundos que se está creando
      return res.json(withOptions({
        ok: false,
        reply: '⏳ Ya estoy generando tu ticket. Esperá unos segundos...',
        stage: session.stage,
        options: []
      }));
    }
  }
  ticketCreationLocks.set(sid, Date.now());

  // ✅ MEJORA UX FASE 2: Validación proactiva antes de crear ticket
  const locale = session.userLocale || 'es-AR';
  const validation = validateBeforeAdvancing(session, STATES.CREATE_TICKET, locale);
  if (validation && validation.needsConfirmation) {
    session.transcript.push({ who: 'bot', text: validation.message, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    ticketCreationLocks.delete(sid); // Liberar lock
    return res.json(withOptions({
      ok: false,
      reply: validation.message,
      stage: session.stage,
      options: validation.options || buildUiButtonsFromTokens(['BTN_BACK'], locale)
    }));
  }

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

    // ✅ ALTA PRIORIDAD-1: Migrado a fs.promises para evitar bloqueo del event loop
    try { await fs.promises.mkdir(TICKETS_DIR, { recursive: true }); } catch (e) { /* noop */ }

    // Public masked text file
    const ticketPathTxt = path.join(TICKETS_DIR, `${ticketId}.txt`);
    await fs.promises.writeFile(ticketPathTxt, lines.join('\n'), 'utf8');

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
      accessToken: accessToken, // Token para acceso público
      stepsDone: session.stepsDone || [],
      transcript: transcriptData,
      redactPublic: true
    };
    const ticketPathJson = path.join(TICKETS_DIR, `${ticketId}.json`);
    await fs.promises.writeFile(ticketPathJson, JSON.stringify(ticketJson, null, 2), 'utf8');

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
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;
    waText += `\n\nAviso: al enviar esto, parte de esta conversación se comparte con un técnico de STI vía WhatsApp. No incluyas contraseñas ni datos bancarios.`;

    const waNumberRaw = String(process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422');
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g, '');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `https://api.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;

    session.waEligible = true;
    markSessionDirty(sid, session);

    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const replyLines = [];

    if (isEn) {
      replyLines.push('Perfect, I will generate a summary ticket with what we tried so far.');
      replyLines.push('You can send it by WhatsApp to a human technician so they can continue helping you.');
      replyLines.push('When you are ready, tap the green WhatsApp button and send the message without changing its text.');
    } else {
      replyLines.push('Listo, voy a generar un ticket con el resumen de esta conversación y los pasos que ya probamos.');
      replyLines.push('Presioná el botón **Hablar con un Técnico** para continuar por WhatsApp. El técnico recibirá todo el contexto de nuestra conversación.');
      replyLines.push('Cuando estés listo, tocá el botón verde y enviá el mensaje sin modificar el texto.');
      replyLines.push('Aviso: no compartas contraseñas ni datos bancarios. Yo ya enmascaré información sensible si la hubieras escrito.');
    }

    const resp = withOptions({
      ok: true,
      reply: replyLines.join('\n\n'),
      stage: session.stage,
      options: buildUiButtonsFromTokens(['BTN_WHATSAPP_TECNICO', BUTTONS.CLOSE], locale)
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
    return res.json(resp);
  } catch (err) {
    console.error('[createTicketAndRespond] Error', err && err.message);
    ticketCreationLocks.delete(sid); // Liberar lock en error
    session.waEligible = false;
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({
      ok: false,
      reply: '❗ Ocurrió un error al generar el ticket. Si querés, podés intentar de nuevo en unos minutos o contactar directamente a STI por WhatsApp.',
      stage: session.stage,
      options: buildUiButtonsFromTokens(['BTN_WHATSAPP_TECNICO', BUTTONS.CLOSE], locale)
    }));
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
    session.transcript.push({ who: 'bot', text: replyTxt, ts });
    markSessionDirty(sid, session);
    // ✅ FORMATO UNIFICADO: Emojis al inicio para consistencia visual
    return { ok: true, reply: replyTxt, stage: session.stage, options: ['✔️ Lo pude solucionar', '❌ El problema persiste'] };
  } else {
    const replyTxt = `${prefix} 😊.\n\nDecime sobre qué paso querés ayuda (1, 2, 3, ...) o tocá el botón del número y te lo explico con más calma.`;
    const ts = nowIso();
    session.transcript.push({ who: 'bot', text: replyTxt, ts });
    markSessionDirty(sid, session);
    // ✅ FORMATO UNIFICADO: Emojis al inicio para consistencia visual
    return { ok: true, reply: replyTxt, stage: session.stage, options: ['✔️ Lo pude solucionar', '❌ El problema persiste'] };
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

  const locale = session.userLocale || 'es-AR';
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  // ✅ NUEVO SISTEMA: Mostrar pasos con dificultad, tiempo estimado y botón de ayuda
  const stepsWithHelp = stepsAr.map((step, idx) => {
    const emoji = emojiForIndex(idx);
    const difficulty = getDifficultyForStep(idx);
    const estimatedTime = estimateStepTime(step, idx, locale);
    const timeLabel = isEn ? '⏱️ Estimated time:' : '⏱️ Tiempo estimado:';
    const helpButtonText = isEn ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`;
    return `Paso ${emoji} Dificultad: ${difficulty.stars}\n\n${timeLabel} ${estimatedTime}\n\n${step}\n\n${helpButtonText}`;
  });
  const stepsText = stepsWithHelp.join('\n\n');

  const whoLabel = session.userName ? capitalizeToken(session.userName) : 'Usuari@';
  const intro = stepsKey === 'advanced'
    ? (isEn 
        ? `Let's return to the advanced tests, ${whoLabel}:`
        : `Volvemos a las pruebas avanzadas, ${whoLabel}:`)
    : (isEn
        ? `Let's return to the suggested steps:`
        : `Volvemos a los pasos sugeridos:`);
  const footer = isEn
    ? '\n\nWhen you finish trying these steps, let me know the result by selecting one of the options below:'
    : '\n\nCuando termines de probar estos pasos, avisame el resultado seleccionando una de las opciones abajo:';
  const fullMsg = intro + '\n\n' + stepsText + footer;

  // Generar botones: ayuda para cada paso + botones finales
  const options = [];
  
  // Botones de ayuda para cada paso
  stepsAr.forEach((step, idx) => {
    const emoji = emojiForIndex(idx);
    options.push({
      text: isEn ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`,
      value: `BTN_HELP_STEP_${idx}`,
      description: isEn ? `Get detailed help for step ${idx + 1}` : `Obtener ayuda detallada para el paso ${idx + 1}`
    });
  });

  // Botones finales
  options.push({
    text: isEn ? '❌ The Problem Persists' : '❌ El Problema Persiste',
    value: 'BTN_PERSIST',
    description: isEn ? 'I still have the issue' : 'Sigo con el inconveniente'
  });
  
  options.push({
    text: isEn ? '✔️ I Solved It' : '✔️ Lo pude Solucionar',
    value: 'BTN_SOLVED',
    description: isEn ? 'The problem is gone' : 'El problema desapareció'
  });
  
  options.push({
    text: isEn ? '🧑‍🔧 Talk to a Technician' : '🧑‍🔧 Hablar con un Técnico',
    value: 'BTN_WHATSAPP_TECNICO',
    description: isEn ? 'Connect with a human technician' : 'Conectar con un técnico humano'
  });

  return { error: false, msg: fullMsg, options, steps: stepsAr };
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

    // Generar 15 pasos con niveles de dificultad
    let steps = [];
    const playbookForDevice = device && issueKey && DEVICE_PLAYBOOKS?.[device]?.[issueKey];
    
    if (!isEn && playbookForDevice && Array.isArray(playbookForDevice.es) && playbookForDevice.es.length > 0) {
      // Si hay playbook, usarlo como base pero generar 15 pasos
      steps = playbookForDevice.es.slice(0, 15);
    } else if (hasConfiguredSteps) {
      // Si hay pasos configurados, usarlos como base pero generar 15 pasos
      steps = CHAT.nlp.advanced_steps[issueKey].slice(0, 15);
    }
    
    // Si no hay suficientes pasos o no hay playbook/configurados, generar con IA
    if (steps.length < 15) {
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
        
        // Incluir sistema operativo en el contexto del problema si está disponible
        let problemWithOS = problemWithContext;
        if (session.userOS || session.operatingSystem) {
          const os = session.userOS || session.operatingSystem;
          problemWithOS = `${problemWithContext}\n\nSistema operativo: ${os}`;
        }
        
        // Pasar imageAnalysis como parámetro adicional
        aiSteps = await aiQuickTests(
          problemWithOS, 
          device || '', 
          locale, 
          [], // Ya no usamos avoidSteps
          imageAnalysisText
        );
      } catch (e) {
        aiSteps = [];
      }
      
      if (Array.isArray(aiSteps) && aiSteps.length > 0) {
        // Combinar pasos existentes con los generados por IA
        const existingSet = new Set(steps.map(normalizeStepText));
        const newSteps = aiSteps.filter(s => !existingSet.has(normalizeStepText(s)));
        steps = [...steps, ...newSteps].slice(0, 15);
      }
    }
    
    // Si aún no hay 15 pasos, rellenar con pasos genéricos
    if (steps.length < 15) {
      const genericSteps = isEn ? [
        'Complete shutdown: Unplug the device from the wall, wait 30 seconds and plug it back in.',
        'Check connections: Power cable firmly connected. Monitor connected (HDMI / VGA / DP). Try turning it on again.',
        'Check for software updates and install any pending updates.',
        'Review system logs for errors or warnings.',
        'Test the device in safe mode to isolate software issues.',
        'Perform a system restore to a previous working state.',
        'Check device manager for hardware conflicts or driver issues.',
        'Run system diagnostics tools provided by the manufacturer.',
        'Verify BIOS/UEFI settings are correct for your hardware.',
        'Test individual components (RAM, hard drive, etc.) using diagnostic tools.',
        'Review and modify advanced system settings if necessary.',
        'Contact technical support with detailed information about the problem and steps already tried.'
      ] : [
        'Apagado completo: Desenchufá el equipo de la pared, esperá 30 segundos y volvé a conectarlo.',
        'Revisá las conexiones: Cable de corriente bien firme. Monitor conectado (HDMI / VGA / DP). Probá encender nuevamente.',
        'Verificá actualizaciones de software e instalá las pendientes.',
        'Revisá los registros del sistema en busca de errores o advertencias.',
        'Probá el equipo en modo seguro para aislar problemas de software.',
        'Realizá una restauración del sistema a un estado anterior que funcionaba.',
        'Revisá el administrador de dispositivos en busca de conflictos de hardware o problemas de drivers.',
        'Ejecutá herramientas de diagnóstico del sistema proporcionadas por el fabricante.',
        'Verificá que la configuración del BIOS/UEFI sea correcta para tu hardware.',
        'Probá componentes individuales (RAM, disco duro, etc.) usando herramientas de diagnóstico.',
        'Revisá y modificá configuraciones avanzadas del sistema si es necesario.',
        'Contactá soporte técnico con información detallada sobre el problema y los pasos que ya probaste.'
      ];
      
      const existingSet = new Set(steps.map(normalizeStepText));
      const newGeneric = genericSteps.filter(s => !existingSet.has(normalizeStepText(s)));
      steps = [...steps, ...newGeneric].slice(0, 15);
    }
    
    // Asegurar exactamente 15 pasos
    while (steps.length < 15) {
      const fallback = isEn 
        ? `Additional diagnostic step ${steps.length + 1}: Review and document any error messages or unusual behavior.`
        : `Paso de diagnóstico adicional ${steps.length + 1}: Revisá y documentá cualquier mensaje de error o comportamiento inusual.`;
      steps.push(fallback);
    }
    steps = steps.slice(0, 15);

    // ✅ MEJORA UX FASE 2: Validación proactiva antes de avanzar
    const validation = validateBeforeAdvancing(session, STATES.BASIC_TESTS, locale);
    if (validation && validation.needsConfirmation) {
      session.transcript.push({ who: 'bot', text: validation.message, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({
        ok: false,
        reply: validation.message,
        stage: session.stage,
        options: validation.options || buildUiButtonsFromTokens(['BTN_BACK'], locale)
      }));
    }
    
    changeStage(session, STATES.BASIC_TESTS);
    session.basicTests = steps;
    // Mantener compatibilidad con estructuras que usan session.tests
    session.tests = session.tests || {};
    session.tests.basic = Array.isArray(steps) ? steps : [];
    session.currentTestIndex = 0;

    // ✅ MEJORA UX: Personalización consistente con nombre del usuario
    const who = session.userName ? getPersonalizedGreeting(session.userName, locale, Math.floor(Math.random() * 5)) : null;
    // Usar deviceLabel (label legible) en lugar de device (ID)
    const deviceLabel = session.deviceLabel || device || (isEn ? 'device' : 'equipo');
    const pSummary = (session.problem || '').trim().slice(0, 200);

    // ✅ MEJORA UX: Confirmación del problema
    const problemConfirmation = getConfirmationMessage('problem', { problem: pSummary }, locale);
    
    // ✅ MEJORA UX: Tip proactivo relacionado con el problema
    const proactiveTip = getProactiveTip(pSummary, deviceLabel, locale);

    let intro;
    if (isEn) {
      intro = who
        ? `${who}.\n\n${problemConfirmation}\n\nSo, with your ${deviceLabel}, let's try a few quick steps together 🔧⚡:`
        : `${problemConfirmation}\n\nSo, with your ${deviceLabel}, let's try a few quick steps together 🔧⚡:`;
    } else if (isEsLatam) {
      intro = who
        ? `${who}.\n\n${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`
        : `${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`;
    } else {
      intro = who
        ? `${who}.\n\n${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`
        : `${problemConfirmation}\n\nEntonces, con tu ${deviceLabel}, vamos a probar unos pasos rápidos juntos 🔧⚡:`;
    }
    
    // Agregar tip proactivo si existe
    if (proactiveTip) {
      intro += `\n\n${proactiveTip}`;
    }

    // Formatear pasos con emojis, niveles de dificultad, tiempo estimado y botones de ayuda
    // ✅ NUEVO SISTEMA: Mostrar 15 pasos con niveles, tiempo estimado y botón de ayuda debajo de cada uno
    const stepsWithHelp = steps.map((step, idx) => {
      const emoji = emojiForIndex(idx);
      const difficulty = getDifficultyForStep(idx);
      const estimatedTime = estimateStepTime(step, idx, locale);
      const timeLabel = isEn ? '⏱️ Estimated time:' : '⏱️ Tiempo estimado:';
      const helpButtonText = isEn ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`;
      return `Paso ${emoji} Dificultad: ${difficulty.stars}\n\n${timeLabel} ${estimatedTime}\n\n${step}\n\n${helpButtonText}`;
    });
    const stepsText = stepsWithHelp.join('\n\n');

    let footer;
    if (isEn) {
      footer = '\n\nWhen you finish trying these steps, let me know the result by selecting one of the options below:';
    } else {
      footer = '\n\nCuando termines de probar estos pasos, avisame el resultado seleccionando una de las opciones abajo:';
    }
    
    // ✅ NUEVO SISTEMA: Solo mostrar los pasos con sus tiempos individuales, sin progreso general
    const reply = `${intro}\n\n${stepsText}${footer}`;

    // Generar botones: ayuda para cada paso + botones finales
    const options = [];

    // Botones de ayuda para cada paso (debajo de cada paso)
    steps.forEach((step, idx) => {
      const emoji = emojiForIndex(idx);
      options.push({
        text: isEn ? `🆘 Help Step ${emoji}` : `🆘 Ayuda Paso ${emoji}`,
        value: `BTN_HELP_STEP_${idx}`,
        description: isEn ? `Get detailed help for step ${idx + 1}` : `Obtener ayuda detallada para el paso ${idx + 1}`
      });
    });

    // Botones finales (3 botones principales)
    // 1. Botón El Problema Persiste
    options.push({
      text: isEn ? '❌ The Problem Persists' : '❌ El Problema Persiste',
      value: 'BTN_PERSIST',
      description: isEn ? 'I still have the issue' : 'Sigo con el inconveniente'
    });

    // 2. Botón Lo pude Solucionar
    options.push({
      text: isEn ? '✔️ I Solved It' : '✔️ Lo pude Solucionar',
      value: 'BTN_SOLVED',
      description: isEn ? 'The problem is gone' : 'El problema desapareció'
    });

    // 3. Botón Hablar con un Técnico
    options.push({
      text: isEn ? '🧑‍🔧 Talk to a Technician' : '🧑‍🔧 Hablar con un Técnico',
      value: 'BTN_WHATSAPP_TECNICO',
      description: isEn ? 'Connect with a human technician' : 'Conectar con un técnico humano'
    });

    const payload = withOptions({ ok: true, reply, options });
    markSessionDirty(sid, session);
    return await sendResponseWithSave(res, sid, session, payload);
  } catch (err) {
    console.error('[generateAndShowSteps] error:', err?.message || err);
    const locale = session?.userLocale || 'es-AR';
    const friendlyError = getFriendlyErrorMessage(err, locale, 'preparing diagnostic steps');
    return res.status(200).json(withOptions({
      ok: true,
      reply: friendlyError,
      stage: session?.stage,
      options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CLOSE'], locale)
    }));
  }
}

// ========================================================
// Image upload endpoint: /api/upload-image
// ========================================================
app.post('/api/upload-image', uploadLimiter, upload.single('image'), async (req, res) => {
  const uploadStartTime = Date.now();
  let uploadedFilePath = null;

  try {
    // Validación básica
    if (!req.file) {
      updateMetric('uploads', 'failed', 1);
      return res.status(400).json({ ok: false, error: 'No se recibió ninguna imagen' });
    }

    uploadedFilePath = req.file.path;

    // Validar session ID
    const sid = req.sessionId;
    if (!validateSessionId(sid)) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: 'Session ID inválido' });
    }

    const session = await getSession(sid);

    if (!session) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: 'Sesión no encontrada' });
    }

    // Limitar uploads por sesión
    if (!session.images) session.images = [];
    // ✅ FASE 5-3: Usar constante centralizada
    if (session.images.length >= MAX_IMAGES_PER_SESSION) {
      updateMetric('uploads', 'failed', 1);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      return res.status(400).json({ ok: false, error: `Límite de imágenes por sesión alcanzado (${MAX_IMAGES_PER_SESSION} máx)` });
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
    } else if (compressionResult.success) {
      // Original was smaller, delete compressed
      fs.unlinkSync(compressedPath);
    }

    // Build image URL (sanitized)
    const safeFilename = path.basename(req.file.filename);
    const imageUrl = `${PUBLIC_BASE_URL}/uploads/${safeFilename}`;

    // Analyze image with OpenAI Vision if available
    let imageAnalysis = null;
    const analysisStartTime = Date.now();

    if (openai) {
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

        logMsg(`[VISION] Analyzed image for session ${sid} in ${analysisTime}ms: ${imageAnalysis.problemDetected || 'No problem detected'}`);
      } catch (visionErr) {
        console.error('[VISION] Error analyzing image:', visionErr);
        imageAnalysis = { error: 'No se pudo analizar la imagen' };
        updateMetric('errors', 'count', 1);
        updateMetric('errors', 'lastError', { type: 'vision', message: visionErr.message, timestamp: new Date().toISOString() });
      }
    }

    // Store image data in session
    const imageData = {
      url: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: finalSize,
      uploadedAt: new Date().toISOString(),
      analysis: imageAnalysis
    };

    session.images.push(imageData);

    // Add to transcript
    session.transcript.push({
      who: 'user',
      text: '[Imagen subida]',
      imageUrl: imageUrl,
      ts: nowIso()
    });

    await saveSessionAndTranscript(sid, session);

    // Build response
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

    await saveSessionAndTranscript(sid, session);

    // Update metrics
    updateMetric('uploads', 'total', 1);
    updateMetric('uploads', 'success', 1);
    updateMetric('uploads', 'totalBytes', finalSize);

    const totalUploadTime = Date.now() - uploadStartTime;
    logMsg(`[UPLOAD] Completed in ${totalUploadTime}ms (${(finalSize / 1024).toFixed(1)}KB)`);

    res.json({
      ok: true,
      imageUrl,
      analysis: imageAnalysis,
      reply: replyText,
      sessionId: sid
    });

  } catch (err) {
    console.error('[UPLOAD] Error:', err);
    updateMetric('uploads', 'failed', 1);
    updateMetric('errors', 'count', 1);
    updateMetric('errors', 'lastError', { type: 'upload', message: err.message, timestamp: new Date().toISOString() });
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

  let session = null;
  let turnContext = null;
  let stageBeforeForTurn = null;
  let stageAfterForTurn = null;
  let lastPayloadForTurn = null;
  let turnClosed = false;
  let pendingViolations = [];
  let pendingReason = null;
  const defaultStageForView = STATES?.ASK_LANGUAGE || 'ASK_LANGUAGE';
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    if (payload && typeof payload === 'object') {
      const stageAfter =
        payload.stage ||
        stageAfterForTurn ||
        session?.stage ||
        stageBeforeForTurn ||
        defaultStageForView;
      const rawButtons =
        payload.buttons ||
        payload.options ||
        payload.ui ||
        [];
      const sanitizedButtons = sanitizeButtonsForStage(stageAfter, rawButtons);
      const legacyButtons = sanitizedButtons.map((btn, idx) => ({
        text: btn.label || btn.token,
        label: btn.label || btn.token,
        value: btn.token,
        order: btn.order || idx + 1
      }));
      payload.buttons = legacyButtons;
      payload.options = legacyButtons;
      payload.ui = legacyButtons;

      if (!payload.viewModel) {
        payload.viewModel = getStageViewModel(stageAfter);
      }

      stageAfterForTurn = stageAfter;
      lastPayloadForTurn = {
        stageAfter,
        buttons: sanitizedButtons,
        reply: payload.reply || '',
        reason: payload.reason || payload.transition_reason || pendingReason || 'reply'
      };
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload.buildId = payload.buildId || BUILD_ID;
    }
    res.set('X-STI-BUILD', BUILD_ID);
    return originalJson(payload);
  };

  res.once('finish', () => {
    if (turnClosed || !turnContext || !session) {
      return;
    }
    const finalStage =
      lastPayloadForTurn?.stageAfter ||
      session.stage ||
      stageBeforeForTurn ||
      defaultStageForView;
    const finalButtons = lastPayloadForTurn?.buttons || [];
    const finalReply = lastPayloadForTurn?.reply || '';
    const finalReason = lastPayloadForTurn?.reason || pendingReason || 'reply';

    endTurn(turnContext, {
      session,
      botReply: finalReply,
      buttonsShown: finalButtons,
      stageAfter: finalStage,
      reason: finalReason,
      violations: pendingViolations
    });
    turnClosed = true;
    pendingViolations = [];
    pendingReason = null;
    lastPayloadForTurn = null;
    stageAfterForTurn = null;
    turnContext = null;
  });

  // Helper para retornar y loggear automáticamente
  const logAndReturn = (response, stage, nextStage, trigger = 'N/A', action = 'response_sent') => {
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

    return res.json(response);
  };

  try {
    // 🔐 PASO 1: Verificar rate-limit POR SESIÓN
    const sessionId = req.body.sessionId || req.sessionId;
    // ✅ FASE 4-3: Limpieza de datos sensibles en logs - solo mostrar primeros caracteres
    const sessionIdPreview = sessionId ? `${sessionId.substring(0, 8)}...` : 'null';
    console.log('[DEBUG /api/chat] INICIO - sessionId:', sessionIdPreview);
    
    // ✅ PRODUCCIÓN: Verificar límite de usuarios concurrentes
    if (sessionId) {
      const concurrentCheck = checkConcurrentUserLimit(sessionId);
      if (!concurrentCheck.allowed) {
        console.warn(`[CONCURRENT_USERS] Rejected chat request. Active: ${concurrentCheck.activeCount}/${MAX_CONCURRENT}`);
        return res.status(503).json({
          ok: false,
          reply: concurrentCheck.reason || `Límite de ${MAX_CONCURRENT} usuarios concurrentes alcanzado. Por favor, intentá más tarde.`,
          error: 'concurrent_user_limit',
          retryAfter: 60,
          activeUsers: concurrentCheck.activeCount,
          maxUsers: MAX_CONCURRENT
        });
      }
      // Actualizar actividad del usuario
      updateUserActivity(sessionId);
    }
    
    // Log body sin imágenes para no saturar
    const bodyWithoutImages = { ...req.body };
    if (bodyWithoutImages.images && Array.isArray(bodyWithoutImages.images)) {
      console.log('[DEBUG /api/chat] 🖼️ Body tiene', bodyWithoutImages.images.length, 'imagen(es)');
      console.log('[DEBUG /api/chat] 🖼️ Primera imagen:', {
        name: bodyWithoutImages.images[0]?.name,
        hasData: !!bodyWithoutImages.images[0]?.data,
        dataLength: bodyWithoutImages.images[0]?.data?.length,
        dataPreview: bodyWithoutImages.images[0]?.data?.substring(0, 100)
      });
      bodyWithoutImages.images = bodyWithoutImages.images.map(img => ({
        name: img.name,
        hasData: img.data ? `${img.data.substring(0, 50)}... (${img.data.length} chars)` : 'no data'
      }));
    } else {
      console.log('[DEBUG /api/chat] ⚠️ NO hay imágenes en el body');
    }
    console.log('[DEBUG /api/chat] Body keys:', Object.keys(req.body));
    console.log('[DEBUG /api/chat] Headers x-session-id:', req.headers['x-session-id']);

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
    const tokenMap = {};
    if (Array.isArray(CHAT?.ui?.buttons)) {
      for (const b of CHAT.ui.buttons) {
        if (b.token) tokenMap[b.token] = b.text || '';
      }
    }

    // 🔧 FIX: Leer mensaje de múltiples campos posibles (body.message, body.text)
    // El frontend envía 'message', pero mantenemos compatibilidad con 'text'
    // ✅ MEDIO-1: Aplicar sanitización de inputs para prevenir XSS
    let incomingText = sanitizeInput(String(body.message || body.text || '').trim());
    let buttonToken = null;
    let buttonLabel = null;

    if (body.action === 'button' && body.value) {
      // ✅ MEDIO-1: Sanitizar buttonToken para prevenir XSS
      buttonToken = sanitizeInput(String(body.value));
      console.log('[DEBUG BUTTON] Received button - action:', body.action, 'value:', body.value, 'token:', buttonToken);
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

    const t = String(incomingText || '').trim();

    const normalizedUserEvent = buttonToken
      ? {
          type: 'button',
          token: buttonToken,
          label: buttonLabel || buttonToken,
          rawText: buttonLabel || buttonToken,
          normalized: buttonLabel || buttonToken
        }
      : {
          type: 'text',
          rawText: t,
          normalized: t
        };

    const sid = req.sessionId;

    // ✅ FASE 4-3: Limpieza de datos sensibles en logs
    const sidPreview = sid ? `${sid.substring(0, 8)}...` : 'null';
    console.log('[DEBUG /api/chat] SessionId:', sidPreview, 'buttonToken:', buttonToken, 'text:', t?.substring(0, 50));

    // Inicializar datos de log
    flowLogData.sessionId = sid;
    flowLogData.userInput = buttonToken ? `[BTN] ${buttonLabel || buttonToken}` : t;

    session = await getSession(sid);
    console.log('[DEBUG] Session loaded - stage:', session?.stage, 'userName:', session?.userName, 'gdprConsent:', session?.gdprConsent, 'userLocale:', session?.userLocale);
    
    // ✅ FASE 3: Detección de retorno después de inactividad
    if (session && session.transcript && session.transcript.length > 0) {
      const returnInfo = detectReturnAfterInactivity(session, 5 * 60 * 1000); // 5 minutos
      if (returnInfo && returnInfo.isReturning && !buttonToken) {
        console.log('[FASE3] 🔄 Usuario volviendo después de inactividad:', returnInfo.minutesAway, 'minutos');
        const welcomeMessage = getWelcomeBackMessage(returnInfo, session.userLocale || 'es-AR', session);
        
        // Actualizar última actividad
        updateLastActivity(session);
        
        session.transcript.push({ 
          who: 'user', 
          text: t || (session.userLocale?.startsWith('en') ? 'Continue' : 'Continuar'), 
          ts: nowIso() 
        });
        session.transcript.push({ who: 'bot', text: welcomeMessage, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        
        const locale = session.userLocale || 'es-AR';
        const options = buildUiButtonsFromTokens(['BTN_BACK_TO_STEPS', 'BTN_CHANGE_TOPIC', 'BTN_CONNECT_TECH'], locale);
        
        return res.json(withOptions({
          ok: true,
          reply: welcomeMessage,
          stage: session.stage,
          options,
          session,
          locale
        }));
      }
      
      // Actualizar última actividad en cada interacción
      updateLastActivity(session);
    }
    
    // 🆕 Si no existe sesión, crear y retornar mensaje de GDPR inicial
    if (!session) {
      console.log('[api/chat] 🆕 Nueva sesión detectada - enviando mensaje de GDPR');
      
      const fullGreeting = buildLanguageSelectionGreeting();
      
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
        images: [],
        frustrationCount: 0,
        pendingAction: null
      };
      
      // Agregar mensaje de GDPR al transcript
      session.transcript.push({ who: 'bot', text: fullGreeting.text, ts: nowIso() });
      
      await saveSessionAndTranscript(sid, session);
      console.log('[api/chat] ✅ Sesión nueva guardada con mensaje de GDPR');

      const stageBefore = session.stage || STATES.ASK_LANGUAGE;
      stageBeforeForTurn = stageBefore;
      turnContext = startTurn({
        sessionId: sid,
        stageBefore,
        userEvent: normalizedUserEvent
      });
      pendingReason = 'new_session';
      
      // Retornar mensaje de GDPR con botones
      return res.json({
        ok: true,
        reply: fullGreeting.text,
        stage: STATES.ASK_LANGUAGE,
        buttons: fullGreeting.buttons || [],
        sessionId: sid
      });
    }

    const stageBefore = session.stage || STATES.ASK_LANGUAGE;
    stageBeforeForTurn = stageBefore;
    if (!turnContext) {
      turnContext = startTurn({
        sessionId: sid,
        stageBefore,
        userEvent: normalizedUserEvent
      });
    }

    // 🔐 ASK_LANGUAGE y ASK_USER_LEVEL: Procesar ANTES de enforceStage para evitar que bloquee los botones
    if (session.stage === STATES.ASK_LANGUAGE) {
      const stageInfo = getStageInfo(session.stage);
      if (!stageInfo) {
        console.warn(`[STAGE] ⚠️ Stage inválido detectado: ${session.stage}, usando fallback`);
      }
      try {
        // Recargar sesión para asegurar que tenemos los datos más recientes (especialmente gdprConsent)
        const freshSession = await getSession(sid);
        if (freshSession) {
          // Actualizar la sesión con los datos más recientes
          Object.assign(session, freshSession);
        }
        
        console.log('[ASK_LANGUAGE] Llamando handler con:', {
          buttonToken,
          userText: t?.substring(0, 50),
          gdprConsent: session.gdprConsent,
          userLocale: session.userLocale
        });
        
        const result = await handleAskLanguageStage(
          session,
          t,
          buttonToken,
          sid,
          res,
          {
            STATES,
            saveSessionAndTranscript,
            buildLanguageSelectionGreeting,
            changeStage,
            getSession: getSession
          }
        );
        
        if (result && result.handled) {
          console.log('[ASK_LANGUAGE] Handler retornó:', {
            ok: result.ok,
            stage: result.stage,
            hasReply: !!result.reply,
            hasButtons: !!result.buttons
          });
          // ✅ Enviar respuesta con guardado optimizado
          return await sendResponseWithSave(res, sid, session, {
            ok: result.ok,
            reply: result.reply,
            stage: result.stage,
            buttons: result.buttons
          });
        }
      } catch (languageHandlerError) {
        console.error('[ASK_LANGUAGE] Error en stageHandlers:', languageHandlerError);
        // Continuar con el flujo normal si el handler falla
      }
    }

    // 🔐 ASK_USER_LEVEL: Procesar ANTES de enforceStage
    if (session.stage === STATES.ASK_USER_LEVEL) {
      try {
        // Recargar sesión para asegurar datos actualizados
        const freshSession = await getSession(sid);
        if (freshSession) {
          Object.assign(session, freshSession);
        }
        
        console.log('[ASK_USER_LEVEL] Llamando handler con:', {
          buttonToken,
          userText: t?.substring(0, 50),
          userLevel: session.userLevel
        });
        
        const result = await handleAskUserLevelStage(
          session,
          t,
          buttonToken,
          sid,
          res,
          {
            STATES,
            saveSessionAndTranscript,
            changeStage,
            getSession: getSession
          }
        );
        
        if (result && result.handled) {
          console.log('[ASK_USER_LEVEL] Handler retornó:', {
            ok: result.ok,
            stage: result.stage,
            hasReply: !!result.reply,
            hasButtons: !!result.buttons
          });
          return await sendResponseWithSave(res, sid, session, {
            ok: result.ok,
            reply: result.reply,
            stage: result.stage,
            buttons: result.buttons
          });
        }
      } catch (userLevelHandlerError) {
        console.error('[ASK_USER_LEVEL] Error en stageHandlers:', userLevelHandlerError);
      }
    }

    const enforcementResult = enforceStage({ session, userEvent: normalizedUserEvent });
    pendingViolations = enforcementResult.violations || [];
    pendingReason = enforcementResult.reason || null;

    if (!enforcementResult.allowed) {
      const contract = getStageContract(stageBefore) || {};
      const deterministicButtons = getDefaultButtons(stageBefore);
      const fallbackReply =
        contract.prompt ||
        (session.userLocale && session.userLocale.startsWith('en')
          ? 'I need that info to continue.'
          : 'Necesito esa informacion para seguir.');
      return res.json({
        ok: true,
        reply: fallbackReply,
        stage: stageBefore,
        buttons: deterministicButtons
      });
    }

    // ========================================================
    // 🔧 MODO SUPERVISOR - Verificar comandos especiales
    // ========================================================
    // Permite corregir fallas en el flujo desde el mismo chat
    // Solo accesible con autenticación especial
    if (isSupervisorActivationCommand(t)) {
      // Solicitar autenticación
      const authPrompt = `🔐 **MODO SUPERVISOR**\n\nPara activar el modo supervisor, necesitás autenticarte.\n\n**Opciones:**\n1. Enviá tu token secreto\n2. O enviá tu contraseña\n\nEjemplo: \`token: TU_TOKEN_AQUI\` o \`password: TU_PASSWORD\``;
      
      session.transcript.push({
        who: 'user',
        text: t,
        stage: session.stage,
        ts: nowIso()
      });
      
      session.transcript.push({
        who: 'bot',
        text: authPrompt,
        ts: nowIso()
      });
      
      markSessionDirty(sid, session);
      
      return res.json({
        ok: true,
        reply: authPrompt,
        supervisorMode: false
      });
    }
    
    // Verificar si el mensaje contiene token o password
    const tokenMatch = t.match(/token:\s*(.+)/i);
    const passwordMatch = t.match(/password:\s*(.+)/i);
    
    if (tokenMatch || passwordMatch) {
      const providedToken = tokenMatch ? tokenMatch[1].trim() : null;
      const providedPassword = passwordMatch ? passwordMatch[1].trim() : null;
      
      const authResult = authenticateSupervisor(sid, providedToken, providedPassword);
      
      session.transcript.push({
        who: 'user',
        text: '[Autenticación supervisor]',
        stage: session.stage,
        ts: nowIso()
      });
      
      if (authResult.success) {
        session.transcript.push({
          who: 'bot',
          text: `✅ ${authResult.message}\n\n🔧 **MODO SUPERVISOR ACTIVADO**\n\nUsá /help para ver comandos disponibles.`,
          ts: nowIso()
        });
        
        markSessionDirty(sid, session);
        
        return res.json({
          ok: true,
          reply: `✅ ${authResult.message}\n\n🔧 **MODO SUPERVISOR ACTIVADO**\n\nUsá /help para ver comandos disponibles.`,
          supervisorMode: true
        });
      } else {
        session.transcript.push({
          who: 'bot',
          text: `❌ ${authResult.message}\n\nIntentá de nuevo o usá /admin para ver las opciones.`,
          ts: nowIso()
        });
        
        markSessionDirty(sid, session);
        
        return res.json({
          ok: true,
          reply: `❌ ${authResult.message}\n\nIntentá de nuevo o usá /admin para ver las opciones.`,
          supervisorMode: false
        });
      }
    }
    
    // Si está en modo supervisor, procesar comandos
    if (isSupervisorModeActive(sid)) {
      const supervisorResponse = await processSupervisorCommand(
        sid,
        t,
        session,
        async (sessionId, sessionData) => {
          await saveSessionAndTranscript(sessionId, sessionData);
        }
      );
      
      if (supervisorResponse) {
        // Registrar mensaje del usuario
        session.transcript.push({
          who: 'user',
          text: t,
          stage: session.stage,
          ts: nowIso()
        });
        
        // Registrar respuesta del bot (si no fue inyectada)
        if (!supervisorResponse.injected) {
          session.transcript.push({
            who: 'bot',
            text: supervisorResponse.reply,
            stage: session.stage,
            ts: nowIso(),
            supervisorCommand: true
          });
        }
        
        markSessionDirty(sid, session);
        
        return res.json(supervisorResponse);
      }
    }
    
    // ========================================================
    // 📝 REGISTRO UNIVERSAL DEL MENSAJE DEL USUARIO
    // ========================================================
    // Registrar SIEMPRE el mensaje del usuario en el transcript
    // ANTES de cualquier procesamiento (inteligente, modular, legacy)
    const userTimestamp = nowIso();
    const userMessage = buttonToken ? `[BTN] ${buttonLabel || buttonToken}` : t;
    
    console.log('[TRANSCRIPT] 📝 Registrando mensaje del usuario:', userMessage.substring(0, 50));
    
    if (!session.transcript) {
      session.transcript = [];
    }
    
    session.transcript.push({
      who: 'user',
      text: userMessage,
      stage: session.stage,
      ts: userTimestamp
    });
    
    // 🔧 REFACTOR FASE 2: Marcar sesión como dirty (guardado diferido)
    // El guardado se hará al final del request antes de enviar la respuesta
    markSessionDirty(sid, session);
    console.log('[TRANSCRIPT] ✅ Mensaje del usuario registrado (guardado diferido)');

    // ========================================================
    // 🧠 SISTEMA INTELIGENTE - PROCESAMIENTO PRIORITARIO
    // ========================================================
    // Si el modo inteligente está activado y el mensaje lo requiere,
    // procesamos con el motor de intención EN LUGAR de la lógica legacy.
    //
    // ¿Cuándo se activa?
    // - Texto libre del usuario (no botones simples)
    // - Botones problemáticos que requieren validación contextual
    // - Mensajes ambiguos que necesitan análisis de intención
    //
    // ¿Qué hace?
    // 1. Analiza la intención real con OpenAI
    // 2. Valida que la acción sea coherente con el contexto
    // 3. Genera respuesta dinámica apropiada
    // 4. Propone opciones lógicas para el siguiente paso
    //
    // Si se procesa exitosamente, retorna la respuesta y TERMINA.
    // Si no se activa o falla, continúa con la lógica legacy.
    // ========================================================
    
    // ✅ CRÍTICO: En ASK_NAME, la calibración debe ejecutarse ANTES del sistema inteligente
    // Esto previene que el sistema inteligente interprete incorrectamente "con pedro" como escalación
    if (session.stage === STATES.ASK_NAME) {
      console.log('[api/chat] 🎯 ASK_NAME detectado - saltando sistema inteligente para usar calibración');
      // NO llamar a handleWithIntelligence en ASK_NAME - dejar que nameHandler.js lo maneje con calibración
    } else {
      console.log('[api/chat] 🔍 Evaluando si usar sistema inteligente...');
      
      const intelligentResponse = await handleWithIntelligence(
        req, 
        res, 
        session, 
        t, 
        buttonToken
      );

      if (intelligentResponse) {
        // ✅ El sistema inteligente procesó exitosamente
        console.log('[api/chat] ✅ Procesado con sistema inteligente');
        console.log('[api/chat] 📊 Intent:', intelligentResponse.intentDetected);
        console.log('[api/chat] 📊 Stage:', intelligentResponse.stage);
        console.log('[api/chat] 📊 Options:', intelligentResponse.options?.length || 0);
        
        // NOTA: No registrar aquí - integrationPatch.js ya registró la respuesta en el transcript
        
        // 🔧 REFACTOR FASE 2: Marcar sesión como dirty (guardado diferido)
        markSessionDirty(sid, session);
      
      // Log flow interaction
      flowLogData.currentStage = intelligentResponse.stage || session.stage;
      flowLogData.nextStage = intelligentResponse.stage;
      flowLogData.botResponse = intelligentResponse.reply;
      flowLogData.serverAction = 'intelligent_system';
      flowLogData.duration = Date.now() - startTime;
      logFlowInteraction(flowLogData);
      
      // 🔧 REFACTOR FASE 2: Enviar respuesta con guardado optimizado
      return await sendResponseWithSave(res, sid, session, intelligentResponse);
      }
    }

    // ⏭️ Si llegó aquí, el sistema inteligente no se activó
    // Continuar con la lógica legacy basada en stages
    console.log('[api/chat] ⏭️ Sistema inteligente no se activó - procesando con legacy');
    
    // ========================================================
    // 🏗️  MODULAR ARCHITECTURE TOGGLE
    // ========================================================
    console.log('[DEBUG] USE_MODULAR_ARCHITECTURE:', USE_MODULAR_ARCHITECTURE);
    console.log('[DEBUG] chatAdapter exists:', !!chatAdapter);
    console.log('[DEBUG] chatAdapter.handleChatMessage exists:', !!(chatAdapter?.handleChatMessage));
    
    if (USE_MODULAR_ARCHITECTURE && chatAdapter) {
      console.log('[MODULAR] 🔀 Redirigiendo a chatAdapter.handleChatMessage()');
      
      try {
        const modularResponse = await chatAdapter.handleChatMessage(body, sid);
        
        // Registrar respuesta del bot en transcript
        // ✅ registerBotResponse ahora marca automáticamente como dirty
        await registerBotResponse(session, modularResponse.reply, modularResponse.stage || session.stage, sid);
        
        // Log flow interaction
        flowLogData.currentStage = modularResponse.stage || session.stage;
        flowLogData.nextStage = modularResponse.stage;
        flowLogData.botResponse = modularResponse.reply;
        flowLogData.serverAction = 'modular_adapter';
        flowLogData.duration = Date.now() - startTime;
        logFlowInteraction(flowLogData);
        
        // Métricas
        updateMetric('chat', 'modular', 1);
        
        console.log('[MODULAR] ✅ Respuesta generada por arquitectura modular');
        
        // ✅ Enviar respuesta con guardado optimizado
        return await sendResponseWithSave(res, sid, session, modularResponse);
      } catch (modularError) {
        console.error('[MODULAR] ❌ Error en chatAdapter:', modularError);
        console.error('[MODULAR] Stack:', modularError.stack);
        // Fallback a legacy
        console.log('[MODULAR] 🔄 Fallback a arquitectura legacy');
        updateMetric('errors', 'modular_fallback', 1);
        // Continuar con código legacy abajo
      }
    } else {
      console.log('[DEBUG] Usando legacy porque: USE_MODULAR=', USE_MODULAR_ARCHITECTURE, 'chatAdapter=', !!chatAdapter);
    }
    
    // ========================================================
    // 🧠 CONVERSATION ORCHESTRATOR TOGGLE
    // ========================================================
    console.log('[DEBUG] USE_ORCHESTRATOR:', USE_ORCHESTRATOR);
    console.log('[DEBUG] conversationOrchestrator exists:', !!conversationOrchestrator);
    console.log('[DEBUG] orchestrateTurn exists:', !!(conversationOrchestrator?.orchestrateTurn));
    
    if (USE_ORCHESTRATOR && conversationOrchestrator) {
      console.log('[ORCHESTRATOR] 🧠 Redirigiendo a orchestrateTurn()');
      
      try {
        // Preparar imágenes (ya procesadas arriba en el código legacy)
        const images = body.images || [];
        
        // Preparar smartAnalysis (si existe)
        const smartAnalysis = session.smartAnalysis || null;
        
        // Llamar al orchestrator
        const orchestratorResponse = await conversationOrchestrator.orchestrateTurn({
          session: session,
          userMessage: t,
          buttonToken: buttonToken,
          images: images,
          smartAnalysis: smartAnalysis
        });
        
        console.log('[ORCHESTRATOR] Response received:', {
          ok: orchestratorResponse.ok,
          stage: orchestratorResponse.stage,
          hasReply: !!orchestratorResponse.reply,
          hasButtons: orchestratorResponse.ui?.buttons?.length || 0
        });
        
        // Guardar sesión actualizada
        const updatedSession = orchestratorResponse.updatedSession;
        if (updatedSession) {
          console.log('[ORCHESTRATOR] Guardando sesión actualizada - stage:', updatedSession.stage);
          await saveSession(sid, updatedSession);
        }
        
        // Log flow interaction
        flowLogData.currentStage = session.stage;
        flowLogData.nextStage = orchestratorResponse.stage;
        flowLogData.botResponse = orchestratorResponse.reply;
        flowLogData.serverAction = 'orchestrator';
        flowLogData.duration = Date.now() - startTime;
        logFlowInteraction(flowLogData);
        
        // Detectar loops
        const loopDetection = detectLoops(flowLogData.sessionId);
        if (loopDetection && loopDetection.detected) {
          console.warn('[ORCHESTRATOR]', loopDetection.message);
        }
        
        // Métricas
        updateMetric('chat', 'orchestrator', 1);
        
        // Agregar transcript a sesión
        if (updatedSession) {
          updatedSession.transcript = updatedSession.transcript || [];
          updatedSession.transcript.push({
            who: 'user',
            text: buttonToken ? `[BTN] ${buttonLabel || buttonToken}` : t,
            ts: nowIso()
          });
          updatedSession.transcript.push({
            who: 'bot',
            text: orchestratorResponse.reply,
            ts: nowIso()
          });
          await saveSession(sid, updatedSession);
        }
        
        console.log('[ORCHESTRATOR] ✅ Respuesta generada por orchestrator');
        return res.json(orchestratorResponse);
      } catch (orchestratorError) {
        console.error('[ORCHESTRATOR] ❌ Error en orchestrateTurn:', orchestratorError);
        console.error('[ORCHESTRATOR] Stack:', orchestratorError.stack);
        // Fallback a legacy
        console.log('[ORCHESTRATOR] 🔄 Fallback a arquitectura legacy');
        updateMetric('errors', 'orchestrator_fallback', 1);
        // Continuar con código legacy abajo
      }
    } else {
      console.log('[DEBUG] Orchestrator desactivado: USE_ORCHESTRATOR=', USE_ORCHESTRATOR, 'conversationOrchestrator=', !!conversationOrchestrator);
    }
    
    // ========================================================
    // 📦 LEGACY ARCHITECTURE (Código original continúa aquí)
    // ========================================================

    // 🖼️ Procesar imágenes si vienen en el body (DESPUÉS de obtener sesión)
    // 🔧 REFACTOR: Procesamiento de imágenes movido a services/imageProcessor.js
    const images = body.images || [];
    let imageContext = '';
    let savedImageUrls = [];
    
    if (images.length > 0) {
      console.log(`[IMAGE_UPLOAD] Received ${images.length} image(s) from session ${sid}`);
      
      // Procesar imágenes usando el servicio modular
      const imageResults = await processImages(images, sid, UPLOADS_DIR, PUBLIC_BASE_URL);
      
      // Extraer URLs de imágenes guardadas exitosamente
      savedImageUrls = imageResults
        .filter(result => result.success)
        .map(result => result.url);
      
      if (savedImageUrls.length > 0) {
        console.log(`[IMAGE] Total images saved: ${savedImageUrls.length}`);
        
        // 🔍 ANALIZAR IMÁGENES CON VISION API
        const analysisText = await analyzeImagesWithVision(savedImageUrls, openai);
        
        if (analysisText) {
          imageContext = `\n\n🔍 **Análisis de la imagen:**\n${analysisText}`;
          
          // Guardar análisis en la sesión
          if (!session.images) session.images = [];
          if (session.images.length > 0) {
            session.images[session.images.length - 1].analysis = analysisText;
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


    // ========================================================
    // 🎯 DETECCIÓN DE HARD INTENT - INTENCIÓN FUERTE DE HABLAR CON TÉCNICO
    // ========================================================
    // Detecta cuando el usuario expresa claramente que quiere hablar con un técnico
    // y ejecuta la acción inmediatamente sin preguntas adicionales
    const hardIntentPatterns = [
      /^\s*(quiero|necesito|dame|dame|quiero hablar|necesito hablar|hablar con un técnico|hablar con técnico|hablar con un tecnico|hablar con tecnico)\s*(con\s+)?(un\s+)?(técnico|tecnico|técnico humano|tecnico humano|especialista|soporte humano|atencion humana|atención humana|ayuda humana)\s*[!.]*\s*$/i,
      /^\s*(hacelo|hazlo|hacelo ya|hazlo ya|conectame|conectame ya|conecta|conecta ya|dame un técnico|dame un tecnico|quiero un técnico|quiero un tecnico)\s*[!.]*\s*$/i,
      /^\s*(hay\s+un\s+técnico|hay\s+un\s+tecnico|hay\s+técnico|hay\s+tecnico|disponible|puedo\s+hablar|puedo\s+hablar\s+con)\s*(con\s+)?(un\s+)?(técnico|tecnico)\s*[?]?\s*$/i,
      /^\s*(sí|si|ok|dale|perfecto|bueno|vamos|adelante|claro|por supuesto|yes|okay|sure|alright)\s*(quiero|necesito|dame|hablar|conectar|conecta|técnico|tecnico)\s*(con\s+)?(un\s+)?(técnico|tecnico)\s*[!.]*\s*$/i
    ];
    
    const hasHardIntent = hardIntentPatterns.some(pattern => pattern.test(t));
    const isEscalateStage = session.stage === STATES.ESCALATE;
    const isConnectTechButton = buttonToken === 'BTN_CONNECT_TECH' || buttonToken === 'BTN_WHATSAPP_TECNICO';
    
    // Si hay intención fuerte O está en stage ESCALATE y confirma, ejecutar inmediatamente
    if (hasHardIntent || (isEscalateStage && /^\s*(sí|si|ok|dale|perfecto|bueno|vamos|adelante|claro|por supuesto|yes|okay|sure|alright|hacelo|hazlo)\s*$/i.test(t)) || isConnectTechButton) {
      console.log('[HARD_INTENT] ✅ Intención fuerte detectada - escalando inmediatamente');
      changeStage(session, STATES.ESCALATE);
      return await createTicketAndRespond(session, sid, res);
    }

    // ✅ CORRECCIÓN 4: Detectar confirmación "Sí" cuando hay pendingAction de tipo create_ticket
    if (session.pendingAction && session.pendingAction.type === 'create_ticket') {
      // Detectar confirmación por texto (sí, si, ok, dale, perfecto, etc.)
      const confirmRx = /^\s*(sí|si|ok|dale|perfecto|bueno|vamos|adelante|claro|por supuesto|yes|okay|sure|alright)\s*$/i;
      if (confirmRx.test(t) || buttonToken === BUTTONS.CONFIRM_TICKET) {
        session.pendingAction = null;
        await saveSessionAndTranscript(sid, session);
        try {
          return await createTicketAndRespond(session, sid, res);
        } catch (errCT) {
          console.error('[CONFIRM_TICKET]', errCT && errCT.message);
          const failReply = '❗ No pude generar el ticket en este momento. Probá de nuevo en unos minutos o escribí directo a STI por WhatsApp.';
          session.transcript.push({ who: 'bot', text: failReply, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          return res.json(withOptions({ ok: false, reply: failReply, stage: session.stage, options: [BUTTONS.CLOSE] }));
        }
      }
      // Si no es confirmación, continuar con el flujo normal
    }
    
    // Confirm / cancel pending ticket actions (legacy - ahora manejado arriba)
    if (buttonToken === BUTTONS.CONFIRM_TICKET && session.pendingAction && session.pendingAction.type === 'create_ticket') {
      session.pendingAction = null;
      await saveSessionAndTranscript(sid, session);
      try {
        return await createTicketAndRespond(session, sid, res);
      } catch (errCT) {
        console.error('[CONFIRM_TICKET]', errCT && errCT.message);
        const failReply = '❗ No pude generar el ticket en este momento. Probá de nuevo en unos minutos o escribí directo a STI por WhatsApp.';
        session.transcript.push({ who: 'bot', text: failReply, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: false, reply: failReply, stage: session.stage, options: [BUTTONS.CLOSE] }));
      }
    }
    if (buttonToken === BUTTONS.CANCEL && session.pendingAction) {
      session.pendingAction = null;
      markSessionDirty(sid, session);
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
    const maskedPreview = maskPII(t);
    if (maskedPreview !== t) {
      session.frustrationCount = session.frustrationCount || 0;
      const piiLocale = session.userLocale || 'es-AR';
      if (String(piiLocale).toLowerCase().startsWith('en')) {
        session.transcript.push({ who: 'bot', text: 'For your security I do not need passwords or bank details. Please, never send that kind of information here.', ts: nowIso() });
      } else {
        session.transcript.push({ who: 'bot', text: 'Por seguridad no necesito ni debo recibir contraseñas ni datos bancarios. Por favor, nunca los envíes por chat.', ts: nowIso() });
      }
    }

    if (FRUSTRATION_RX.test(t)) {
      session.frustrationCount = (session.frustrationCount || 0) + 1;
      await saveSessionAndTranscript(sid, session);
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

    // ========================================================
    // ✅ CORRECCIÓN C: Detectar solicitud de habilitar subida de imágenes
    // ========================================================
    if (/habilitar.*imagen|habilitar.*adjuntar|enable.*image|enable.*upload|adjuntar.*habilit/i.test(t)) {
      console.log('[IMAGE_UPLOAD] Usuario solicita habilitar subida de imágenes');
      session.imageUploadEnabled = true;
      markSessionDirty(sid, session);
      
      const locale = session.userLocale || 'es-AR';
      const isEn = locale.toLowerCase().startsWith('en');
      const reply = isEn
        ? `✅ Image upload is now enabled! You can attach images of your problem using the attachment button.`
        : `✅ ¡Subida de imágenes habilitada! Ya podés adjuntar imágenes de tu problema usando el botón de adjuntar.`;
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      
      return res.json(withOptions({
        ok: true,
        reply: reply,
        stage: session.stage,
        options: [BUTTONS.CLOSE],
        imageUploadEnabled: true
      }));
    }

    // ========================================================
    // ✅ CORRECCIÓN B: Manejar botones de sistema operativo
    // ========================================================
    // ========================================================
    // 🔄 SISTEMA DE CONVERSACIÓN FLEXIBLE
    // Detección de cambio de tema, retroceso, y solicitudes de información adicional
    // ========================================================
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    
    // Detectar intenciones de navegación conversacional
    const topicChangePatterns = isEn
      ? [
          /^(change|switch|new|different|otra|otro|diferente|nuevo|nueva)\s+(topic|subject|question|problem|issue|tema|problema|pregunta|consulta)/i,
          /^(let'?s?\s+)?(talk|speak|discuss|hablar|hablamos|hablemos)\s+(about|de|sobre)\s+(something|algo|otra|otro)/i,
          /^(i\s+)?(want|need|quiero|necesito)\s+(to\s+)?(ask|preguntar|consultar)\s+(about|sobre|de)\s+(something|algo|otra|otro)/i,
          /^(can|could|puedo|podr[ií]a)\s+(we|i|yo|nosotros)\s+(talk|speak|discuss|hablar|hablamos)\s+(about|de|sobre)\s+(something|algo|otra|otro)/i,
          /^(forget|olvid[ae]|dej[ae])\s+(that|this|eso|esto|lo)/i,
          /^(instead|en\s+vez|mejor)\s+(let'?s?\s+)?(talk|speak|discuss|hablar|hablamos)/i
        ]
      : [
          /^(cambiar|nuevo|nueva|otro|otra|diferente)\s+(tema|problema|pregunta|consulta|asunto)/i,
          /^(hablar|hablamos|hablemos|quiero\s+hablar|necesito\s+hablar)\s+(de|sobre|acerca\s+de)\s+(otro|otra|algo|algo\s+m[aá]s|nuevo|nueva)/i,
          /^(quiero|necesito)\s+(preguntar|consultar)\s+(sobre|de|acerca\s+de)\s+(otro|otra|algo|algo\s+m[aá]s)/i,
          /^(puedo|podr[ií]a)\s+(preguntar|consultar|hablar)\s+(sobre|de|acerca\s+de)\s+(otro|otra|algo)/i,
          /^(olvid[ae]|dej[ae])\s+(eso|esto|lo|ese|este)/i,
          /^(en\s+vez|mejor)\s+(hablar|hablamos|hablemos|preguntar)/i,
          /^(tengo\s+)?(otra|otro)\s+(pregunta|consulta|duda|problema)/i
        ];
    
    const moreInfoPatterns = isEn
      ? [
          /^(tell|explain|give|dame|decime|explicame)\s+(me\s+)?(more|m[aá]s|m[aá]s\s+info|m[aá]s\s+informaci[oó]n)/i,
          /^(i\s+)?(want|need|quiero|necesito)\s+(more|m[aá]s)\s+(information|info|details|detalles|informaci[oó]n)/i,
          /^(can|could|puedo|podr[ií]a)\s+(you|tu)\s+(explain|tell|explicar|decir)\s+(more|m[aá]s)/i,
          /^(what|qu[eé])\s+(else|m[aá]s)\s+(can|should|puedo|debo)\s+(i|yo)\s+(know|saber|hacer)/i,
          /^(any|alguna|algún)\s+(other|otra|otro)\s+(way|way|forma|manera|opci[oó]n)/i
        ]
      : [
          /^(decime|dame|explicame|cuentame)\s+(m[aá]s|m[aá]s\s+info|m[aá]s\s+informaci[oó]n|m[aá]s\s+detalles)/i,
          /^(quiero|necesito)\s+(m[aá]s|m[aá]s\s+info|m[aá]s\s+informaci[oó]n|m[aá]s\s+detalles)/i,
          /^(puedo|podr[ií]a)\s+(saber|conocer|obtener)\s+(m[aá]s|m[aá]s\s+info|m[aá]s\s+informaci[oó]n)/i,
          /^(hay|existe)\s+(otra|otro|alguna|algún)\s+(forma|manera|opci[oó]n|alternativa)/i,
          /^(qu[eé])\s+(m[aá]s|otra|otro)\s+(puedo|debo|deber[ií]a)\s+(saber|hacer|probar)/i
        ];
    
    const goBackPatterns = isEn
      ? [
          /^(go|volver|regresar)\s+(back|atr[aá]s|anterior)/i,
          /^(let'?s?\s+)?(go|volver|regresar)\s+(to|a)\s+(the\s+)?(previous|last|anterior|último)/i,
          /^(i\s+)?(want|quiero)\s+(to\s+)?(go|volver|regresar)\s+(back|atr[aá]s)/i,
          /^(can|puedo)\s+(we|i|yo)\s+(go|volver|regresar)\s+(back|atr[aá]s)/i,
          /^(return|volver|regresar)\s+(to|a)\s+(the\s+)?(previous|last|anterior|último)/i
        ]
      : [
          /^(volver|regresar|ir)\s+(atr[aá]s|anterior|a\s+lo\s+anterior)/i,
          /^(quiero|necesito)\s+(volver|regresar|ir)\s+(atr[aá]s|anterior)/i,
          /^(puedo|podr[ií]a)\s+(volver|regresar|ir)\s+(atr[aá]s|anterior)/i,
          /^(volver|regresar)\s+(a|al|a\s+la)\s+(anterior|último|pasado)/i,
          /^(dame|mu[eé]strame)\s+(lo\s+)?(anterior|último|pasado)/i
        ];
    
    // Detectar intenciones de navegación conversacional
    const wantsTopicChange = !buttonToken && topicChangePatterns.some(pattern => pattern.test(t));
    const wantsMoreInfo = !buttonToken && moreInfoPatterns.some(pattern => pattern.test(t));
    const wantsGoBack = !buttonToken && goBackPatterns.some(pattern => pattern.test(t));
    
    // ========================================================
    // 🔙 HANDLER: BTN_BACK - Volver atrás (mostrar respuesta anterior del bot)
    // ========================================================
    if (buttonToken === 'BTN_BACK' || wantsGoBack) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      
      // Buscar la última respuesta del bot en el transcript (excluyendo la actual si existe)
      const transcript = session.transcript || [];
      let previousBotMessage = null;
      let previousStage = null;
      let messageIndex = -1;
      
      // Buscar desde el final hacia atrás, saltando mensajes del usuario y el mensaje actual
      for (let i = transcript.length - 1; i >= 0; i--) {
        const msg = transcript[i];
        if (msg.who === 'bot' && msg.text && msg.text.trim()) {
          // Saltar si es el mismo mensaje que acabamos de mostrar (último mensaje del bot)
          if (i === transcript.length - 1 && transcript[transcript.length - 1].who === 'bot') {
            // Buscar el mensaje anterior del bot
            continue;
          }
          previousBotMessage = msg.text;
          previousStage = msg.stage || session.stage;
          messageIndex = i;
          break;
        }
      }
      
      if (previousBotMessage && messageIndex >= 0) {
        // Si hay una respuesta anterior, mostrarla
        const reply = previousBotMessage;
        
        // Reconstruir opciones según el stage que tenía ese mensaje
        let options = [];
        const stageToUse = previousStage || session.stage;
        
        if (stageToUse === STATES.BASIC_TESTS) {
          // Si hay pasos básicos, mostrar botones de ayuda + solucionado/persiste
          if (session.tests && session.tests.basic && session.tests.basic.length > 0) {
            const helpOptions = session.tests.basic.map((_, i) => `🆘🛠️ Ayuda paso ${emojiForIndex(i)}`);
            options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST'], locale);
            options = [...helpOptions, ...options];
          } else {
            options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH'], locale);
          }
        } else if (stageToUse === STATES.ADVANCED_TESTS) {
          // Si hay pasos avanzados, mostrar botones de ayuda + solucionado/persiste
          if (session.tests && session.tests.advanced && session.tests.advanced.length > 0) {
            const helpOptions = session.tests.advanced.map((_, i) => `🆘🛠️ Ayuda paso ${emojiForIndex(i)}`);
            options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST'], locale);
            options = [...helpOptions, ...options];
          } else {
            options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH'], locale);
          }
        } else if (stageToUse === STATES.ESCALATE) {
          options = buildUiButtonsFromTokens(['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
        } else if (stageToUse === STATES.ASK_DEVICE) {
          options = buildUiButtonsFromTokens(['BTN_DEV_PC_DESKTOP', 'BTN_DEV_NOTEBOOK', 'BTN_DEV_PC_ALLINONE'], locale);
        } else if (stageToUse === STATES.ASK_LANGUAGE) {
          options = buildUiButtonsFromTokens(['BTN_LANG_ES_AR', 'BTN_LANG_EN'], locale);
        } else {
          // Opciones por defecto: volver atrás y cerrar
          options = buildUiButtonsFromTokens(['BTN_BACK', 'BTN_CLOSE'], locale);
        }
        
        // Restaurar el stage anterior si es diferente
        if (previousStage && previousStage !== session.stage) {
          changeStage(session, previousStage);
        }
        
        session.transcript.push({ 
          who: 'user', 
          text: isEn ? 'Go back' : 'Volver atrás', 
          ts: nowIso() 
        });
        session.transcript.push({ 
          who: 'bot', 
          text: reply, 
          ts: nowIso(),
          stage: stageToUse
        });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ 
          ok: true, 
          reply, 
          stage: stageToUse, 
          options,
          session,
          locale
        }));
      } else {
        // No hay respuesta anterior, mostrar mensaje de error amigable
        const errorMsg = isEn
          ? "I don't have a previous message to show. This is the beginning of our conversation."
          : "No tengo un mensaje anterior para mostrar. Este es el inicio de nuestra conversación.";
        const options = buildUiButtonsFromTokens(['BTN_CLOSE'], locale);
        session.transcript.push({ 
          who: 'user', 
          text: isEn ? 'Go back' : 'Volver atrás', 
          ts: nowIso() 
        });
        session.transcript.push({ 
          who: 'bot', 
          text: errorMsg, 
          ts: nowIso() 
        });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ 
          ok: false, 
          reply: errorMsg, 
          stage: session.stage, 
          options 
        }));
      }
    }

    // ========================================================
    // 🔄 HANDLER: BTN_CHANGE_TOPIC - Cambiar de tema
    // ========================================================
    if (buttonToken === 'BTN_CHANGE_TOPIC' || wantsTopicChange) {
      console.log('[FLEXIBLE_CONVERSATION] 🔄 Cambio de tema solicitado');
      
      // Guardar el contexto actual como "punto de conversación"
      if (!session.conversationPoints) {
        session.conversationPoints = [];
      }
      
      const currentPoint = {
        stage: session.stage,
        problem: session.problem,
        device: session.device,
        timestamp: nowIso(),
        summary: session.transcript.slice(-5).filter(m => m.who === 'bot').map(m => m.text).join(' ').slice(0, 200)
      };
      
      if (currentPoint.stage && currentPoint.stage !== STATES.ASK_LANGUAGE && currentPoint.stage !== STATES.ASK_NAME) {
        session.conversationPoints.push(currentPoint);
      }
      
      // Limpiar contexto actual para nuevo tema
      session.problem = null;
      session.device = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.stepsDone = [];
      changeStage(session, STATES.ASK_NEED);
      
      const reply = isEn
        ? "No problem! Let's talk about something else. What do you need help with?"
        : "¡No hay problema! Hablemos de otra cosa. ¿Con qué necesitás ayuda?";
      
      session.transcript.push({ 
        who: 'user', 
        text: buttonToken === 'BTN_CHANGE_TOPIC' ? (isEn ? 'Change topic' : 'Cambiar de tema') : t, 
        ts: nowIso() 
      });
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      
      return res.json(withOptions({
        ok: true,
        reply,
        stage: session.stage,
        options: buildUiButtonsFromTokens(['BTN_BACK'], locale)
      }));
    }

    // ========================================================
    // ℹ️ HANDLER: BTN_MORE_INFO - Más información
    // ========================================================
    if (buttonToken === 'BTN_MORE_INFO' || wantsMoreInfo) {
      console.log('[FLEXIBLE_CONVERSATION] ℹ️ Solicitud de más información');
      
      // Buscar el último mensaje del bot para expandir
      const lastBotMessages = session.transcript
        .filter(msg => msg.who === 'bot')
        .slice(-3);
      
      if (lastBotMessages.length > 0 && SMART_MODE_ENABLED && openai) {
        const lastBotMessage = lastBotMessages[lastBotMessages.length - 1];
        
        // Generar información adicional usando IA
        try {
          const contextPrompt = isEn
            ? `The user asked for more information about this: "${lastBotMessage.text}". Provide detailed, helpful additional information that expands on this topic. Be specific and actionable.`
            : `El usuario pidió más información sobre esto: "${lastBotMessage.text}". Proporcioná información adicional detallada y útil que amplíe este tema. Sé específico y accionable.`;
          
          const expandedInfo = await generateSmartResponse(
            { analyzed: true, needsMoreInfo: true, problem: { detected: true, summary: lastBotMessage.text } },
            session,
            { 
              expandLastMessage: true,
              lastMessage: lastBotMessage.text,
              includeNextSteps: true,
              specificPrompt: contextPrompt
            }
          );
          
          if (expandedInfo) {
            const reply = isEn
              ? `Here's more detailed information:\n\n${expandedInfo}`
              : `Acá tenés información más detallada:\n\n${expandedInfo}`;
            
            session.transcript.push({ 
              who: 'user', 
              text: buttonToken === 'BTN_MORE_INFO' ? (isEn ? 'More information' : 'Más información') : t, 
              ts: nowIso() 
            });
            session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);
            
            return res.json(withOptions({
              ok: true,
              reply,
              stage: session.stage,
              options: buildUiButtonsFromTokens(['BTN_BACK', 'BTN_MORE_INFO', 'BTN_CLOSE'], locale)
            }));
          }
        } catch (error) {
          console.error('[FLEXIBLE_CONVERSATION] Error generando más información:', error);
        }
      }
      
      // Fallback: ofrecer opciones de ayuda
      const reply = isEn
        ? "I can help you with more details. What specifically would you like to know more about? You can ask me questions or I can provide more information about what we were discussing."
        : "Te puedo ayudar con más detalles. ¿Qué específicamente querés saber más? Podés hacerme preguntas o puedo darte más información sobre lo que estábamos hablando.";
      
      session.transcript.push({ 
        who: 'user', 
        text: buttonToken === 'BTN_MORE_INFO' ? (isEn ? 'More information' : 'Más información') : t, 
        ts: nowIso() 
      });
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      
      return res.json(withOptions({
        ok: true,
        reply,
        stage: session.stage,
        options: buildUiButtonsFromTokens(['BTN_BACK', 'BTN_MORE_INFO', 'BTN_CLOSE'], locale)
      }));
    }

    if (buttonToken && (buttonToken === 'BTN_OS_WINDOWS' || buttonToken === 'BTN_OS_MACOS' || buttonToken === 'BTN_OS_LINUX')) {
      const osMap = {
        'BTN_OS_WINDOWS': 'Windows',
        'BTN_OS_MACOS': 'macOS',
        'BTN_OS_LINUX': 'Linux'
      };
      const selectedOS = osMap[buttonToken];
      session.operatingSystem = selectedOS;
      console.log('[OS_SELECTION] Usuario seleccionó:', selectedOS);
      
      // Continuar con el flujo de instalación usando el OS seleccionado
      const activeIntent = session.activeIntent || {};
      const softwareName = activeIntent.software || session.problem || 'el software que necesitás';
      
      const locale = session.userLocale || 'es-AR';
      const isEn = locale.toLowerCase().startsWith('en');
      
      const reply = isEn
        ? `Perfect! I'll guide you through installing ${softwareName} on ${selectedOS}.\n\n**Installation Steps:**\n\n1. Download the installer from the official website\n2. Run the downloaded file (double-click)\n3. Follow the installation wizard\n4. Accept the license agreement\n5. Choose installation folder (default is fine)\n6. Click "Install" and wait\n7. Restart if prompted\n\n✅ Once installed, you can launch it from the Start menu.\n\nDid this help you?`
        : `¡Perfecto! Te guío para instalar ${softwareName} en ${selectedOS}.\n\n**Pasos de Instalación:**\n\n1. Descargá el instalador desde el sitio oficial\n2. Ejecutá el archivo descargado (doble clic)\n3. Seguí el asistente de instalación\n4. Aceptá el acuerdo de licencia\n5. Elegí la carpeta de instalación (la predeterminada está bien)\n6. Hacé clic en "Instalar" y esperá\n7. Reiniciá si te lo pide\n\n✅ Una vez instalado, lo podés abrir desde el menú Inicio.\n\n¿Te sirvió esta guía?`;
      
      const options = buildUiButtonsFromTokens(['BTN_SUCCESS', 'BTN_NEED_HELP'], locale);
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      
      return res.json(withOptions({
        ok: true,
        reply: reply,
        stage: session.stage,
        options: options
      }));
    }

    // ✅ HANDLER: BTN_SUCCESS y BTN_NEED_HELP para instalaciones
    const isInstallationContext = session.stage === STATES.GUIDING_INSTALLATION || 
                                   session.operatingSystem || 
                                   (session.activeIntent && (session.activeIntent.type === 'install' || session.activeIntent.type === 'setup'));
    
    if (isInstallationContext && (buttonToken === 'BTN_SUCCESS' || buttonToken === 'BTN_NEED_HELP')) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
      
      if (buttonToken === 'BTN_SUCCESS') {
        // Usuario confirma que la instalación funcionó
        const celebration = getCelebrationMessage('installation_success', {}, locale);
        const firstLine = whoLabel
          ? (isEn ? `Excellent, ${whoLabel}! 🙌` : `¡Qué buena noticia, ${whoLabel}! 🙌`)
          : (isEn ? `Excellent! 🙌` : `¡Qué buena noticia! 🙌`);
        
        const deviceName = session.device || session.activeIntent?.software || 'dispositivo';
        const reply = isEn
          ? `${firstLine}\n\n${celebration}\n\nI'm glad the installation worked! Your ${deviceName} should be ready to use now. 💻✨\n\nIf you need help with anything else, or want to install/configure something else, I'll be here. Just open the Tecnos chat. 🤝🤖\n\n📲 Follow us for more tips: @sti.rosario\n🌐 STI Web: https://stia.com.ar\n 🚀\n\nThanks for trusting Tecnos! 😉`
          : `${firstLine}\n\n${celebration}\n\nMe alegra que la instalación haya funcionado! Tu ${deviceName} debería estar listo para usar ahora. 💻✨\n\nSi necesitás ayuda con otra cosa, o querés instalar/configurar algo más, acá voy a estar. Solo abrí el chat de Tecnos. 🤝🤖\n\n📲 Seguinos para más tips: @sti.rosario\n🌐 Web de STI: https://stia.com.ar\n 🚀\n\n¡Gracias por confiar en Tecnos! 😉`;
        
        changeStage(session, STATES.ENDED);
        session.waEligible = false;
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
      } else if (buttonToken === 'BTN_NEED_HELP') {
        // Usuario necesita más ayuda con la instalación
        const reply = isEn
          ? `No problem! Let me help you troubleshoot the installation. What specific issue are you encountering? You can describe the error message, what step you're stuck on, or any other details that might help.`
          : `¡No hay problema! Dejame ayudarte a resolver el problema de instalación. ¿Qué problema específico estás teniendo? Podés describir el mensaje de error, en qué paso te quedaste trabado, o cualquier otro detalle que pueda ayudar.`;
        
        const options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
        changeStage(session, STATES.ESCALATE);
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
      }
    }

    // ========================================================
    // 🧠 MODO SUPER INTELIGENTE - Análisis del mensaje
    // ========================================================
    let smartAnalysis = null;
    const imageUrlsForAnalysis = savedImageUrls || [];
    
    // Solo analizar si no es un botón (los botones ya tienen intención clara)
    if (!buttonToken && SMART_MODE_ENABLED && openai) {
      smartAnalysis = await analyzeUserMessage(t, session, imageUrlsForAnalysis);
      
      // ✅ CORRECCIÓN 1: Detección específica de problemas de teclado
      const normalizedText = normalizeUserInput(t);
      const keyboardKeywords = /teclado|keyboard|tekado|teclao/i;
      const isKeyboardProblem = keyboardKeywords.test(normalizedText) || 
                                keyboardKeywords.test(t) ||
                                (smartAnalysis.analyzed && (
                                  smartAnalysis.problem?.summary?.toLowerCase().includes('teclado') ||
                                  smartAnalysis.problem?.keywords?.some(k => /teclado|keyboard/i.test(k)) ||
                                  smartAnalysis.device?.type === 'teclado'
                                ));
      
      if (isKeyboardProblem) {
        console.log('[KEYBOARD_DETECTION] ⌨️ Problema de teclado detectado');
        
        // Actualizar análisis para reflejar problema de teclado
        if (smartAnalysis.analyzed) {
          if (!smartAnalysis.problem?.detected) {
            smartAnalysis.problem = {
              detected: true,
              summary: 'problema con teclado',
              category: 'hardware',
              urgency: 'medium',
              keywords: ['teclado', 'keyboard']
            };
          }
          if (!smartAnalysis.device?.detected || smartAnalysis.device.type === 'other') {
            // Intentar detectar si es notebook o desktop
            const isNotebook = /notebook|laptop|portátil/i.test(normalizedText) || 
                              /notebook|laptop|portátil/i.test(t);
            smartAnalysis.device = {
              detected: true,
              type: isNotebook ? 'notebook' : 'desktop',
              confidence: 0.7,
              ambiguous: false,
              inferredFrom: 'detección de teclado'
            };
          }
          smartAnalysis.confidence = Math.max(smartAnalysis.confidence || 0.5, 0.8);
        }
        
        // ✅ CORRECCIÓN 4: Activar flujo específico de teclado
        session.keyboardProblemDetected = true;
        session.keyboardMentions = (session.keyboardMentions || 0) + 1;
        markSessionDirty(sid, session);
      }
      
      // ✅ CORRECCIÓN 2 y 5: Detectar repetición del mismo problema y evitar mensajes genéricos repetidos
      const lastBotMessages = session.transcript
        .filter(msg => msg.who === 'bot')
        .slice(-3)
        .map(msg => msg.text.toLowerCase());
      
      const lastUserMessages = session.transcript
        .filter(msg => msg.who === 'user')
        .slice(-3)
        .map(msg => normalizeUserInput(msg.text));
      
      // Detectar si el usuario está repitiendo el mismo problema
      const userRepeatingProblem = lastUserMessages.length >= 2 && 
                                   lastUserMessages[lastUserMessages.length - 1] === lastUserMessages[lastUserMessages.length - 2];
      
      // Detectar si el bot ya dio una respuesta genérica similar
      const genericResponses = [
        'necesito entender mejor',
        'entender mejor qué necesitás',
        'puedo ayudarte',
        'ayudarte mejor',
        'qué necesitás'
      ];
      const botRepeatedGeneric = lastBotMessages.some(msg => 
        genericResponses.some(gen => msg.includes(gen))
      ) && lastBotMessages.length >= 2 && 
         lastBotMessages[lastBotMessages.length - 1].includes(genericResponses.find(gen => 
           lastBotMessages[lastBotMessages.length - 2].includes(gen)
         ) || '');
      
      // Si el usuario repite el problema o el bot ya dio respuesta genérica, avanzar automáticamente
      if ((userRepeatingProblem || botRepeatedGeneric) && isKeyboardProblem && session.keyboardMentions >= 2) {
        console.log('[KEYBOARD_DETECTION] ⚡ Usuario insiste con teclado - avanzando automáticamente');
        // Forzar que NO use flujo estructurado para generar respuesta específica
        smartAnalysis.useStructuredFlow = false;
        smartAnalysis.clarificationNeeded = false;
      }
      
      // ✅ INTEGRACIÓN: Si se detectó un patrón de problema, forzar respuesta directa sin mensajes genéricos
      // ✅ CORRECCIÓN: NO forzar useStructuredFlow = false si estamos en ASK_PROBLEM
      // En ASK_PROBLEM queremos SIEMPRE usar el flujo estructurado con 15 pasos
      if (smartAnalysis.patternDetected) {
        console.log('[PATTERN_DETECTION] ⚡ Patrón detectado - activando flujo directo sin mensajes genéricos');
        smartAnalysis.clarificationNeeded = false;
        // Solo forzar respuesta IA directa si NO estamos en ASK_PROBLEM
        if (session.stage !== 'ASK_PROBLEM') {
          smartAnalysis.useStructuredFlow = false;
        }
      }
      
      // Si estamos en ASK_PROBLEM / DIAGNOSING_PROBLEM, nunca usar smartReply: forzar flujo estructurado
      if (session.stage === 'ASK_PROBLEM' || session.stage === 'DIAGNOSING_PROBLEM') {
        console.log('[SMART_MODE] ⛔ Saltando smartReply en ASK_PROBLEM/DIAGNOSING_PROBLEM - se usará flujo estructurado');
      }
      // Si el análisis detecta que NO debe usar flujo estructurado, generar respuesta IA (solo fuera de ASK_PROBLEM/DIAGNOSING_PROBLEM)
      else if (smartAnalysis.analyzed && !shouldUseStructuredFlow(smartAnalysis, session)) {
        console.log('[SMART_MODE] 🎯 Usando respuesta IA en lugar de flujo estructurado');
        
        // ✅ CORRECCIÓN 3 y 4: Generar respuesta específica para teclado
        let specificPrompt = smartAnalysis.problem?.detected 
          ? `El usuario reporta: ${smartAnalysis.problem.summary}. Respondé de forma útil y empática.`
          : 'Ayudá al usuario a clarificar su problema.';
        
        if (isKeyboardProblem) {
          const isNotebook = smartAnalysis.device?.type === 'notebook' || 
                            /notebook|laptop|portátil/i.test(normalizedText);
          
          specificPrompt = `El usuario tiene un problema con el teclado${isNotebook ? ' de su notebook' : ''}.

IMPORTANTE:
- NO repitas mensajes genéricos como "Necesito entender mejor"
- Si ya mencionó el teclado antes, avanzá directamente a hacer preguntas específicas
- Hacé preguntas útiles como:
  * ¿Es teclado de notebook o externo?
  * ¿Responde alguna tecla o ninguna?
  * ¿Hubo algún derrame de líquido o golpe reciente?
  * ¿Funciona en la pantalla de inicio (BIOS)?
- Ofrecé pasos concretos de solución
- Si no podés resolver, ofrecé conectar con un técnico

Respondé de forma directa, empática y técnica.`;
        }
        
        const smartReply = await generateSmartResponse(smartAnalysis, session, {
          includeNextSteps: true,
          specificPrompt: specificPrompt
        });
        
        if (smartReply) {
          // ✅ CORRECCIÓN D: Determinar opciones basadas en el contexto - ofrecer ticket cuando corresponde
          let smartOptions = [];
          
          // ✅ CORRECCIÓN 5 y 6: Si hay problema detectado y no se ha ofrecido ticket aún, ofrecer opciones de escalamiento
          const hasProblem = smartAnalysis.problem?.detected || isKeyboardProblem;
          const needsHelp = smartAnalysis.needsHumanHelp;
          const isFrustrated = smartAnalysis.sentiment === 'frustrated' || smartAnalysis.sentiment === 'angry';
          const problemNotResolved = hasProblem && !session.ticketOffered;
          
          // ✅ CORRECCIÓN 6: Para problemas de teclado, siempre ofrecer asistencia si no se resolvió
          if (isKeyboardProblem && !session.ticketOffered) {
            const locale = session.userLocale || 'es-AR';
            const isEn = locale.toLowerCase().startsWith('en');
            
            // Agregar oferta de asistencia al final de la respuesta
            const assistanceOffer = isEn
              ? `\n\nIf this doesn't solve your keyboard issue, I can:\n• Connect you with a technician\n• Run advanced diagnostics\n• Create a support ticket`
              : `\n\nSi esto no resuelve el problema del teclado, puedo:\n• Conectarte con un técnico\n• Hacer diagnósticos avanzados\n• Generar un ticket de soporte`;
            
            const enhancedReply = smartReply + assistanceOffer;
            session.ticketOffered = true;
            markSessionDirty(sid, session);
            
            const keyboardOptions = [BUTTONS.CONNECT_TECH, BUTTONS.ADVANCED_TESTS, BUTTONS.CLOSE];
            
            session.transcript.push({ who: 'bot', text: enhancedReply, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);
            
            return logAndReturn({
              ok: true,
              reply: enhancedReply,
              stage: session.stage,
              options: keyboardOptions,
              buttons: keyboardOptions,
              aiPowered: true
            }, session.stage, session.stage, 'smart_ai_response', 'ai_replied');
          }
          
          if (needsHelp || isFrustrated || problemNotResolved) {
            // ✅ Ofrecer opciones de escalamiento cuando hay problema no resuelto
            const locale = session.userLocale || 'es-AR';
            const isEn = locale.toLowerCase().startsWith('en');
            
            if (problemNotResolved && !session.ticketOffered) {
              // Marcar que ya se ofreció ticket para no repetir
              session.ticketOffered = true;
              markSessionDirty(sid, session);
              
              // Agregar mensaje ofreciendo opciones
              const ticketOffer = isEn
                ? `\n\nWould you like me to:\n\n1️⃣ Review your ${smartAnalysis.problem?.summary || 'problem'}\n\n2️⃣ Run advanced tests\n\n3️⃣ Create a ticket with a technician?`
                : `\n\n¿Querés que:\n\n1️⃣ Revise tu ${smartAnalysis.problem?.summary || 'problema'}\n\n2️⃣ Haga pruebas avanzadas\n\n3️⃣ Genere un ticket con un técnico?`;
              
              // Agregar al reply
              const enhancedReply = smartReply + ticketOffer;
              
              smartOptions = [BUTTONS.MORE_TESTS, BUTTONS.ADVANCED_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
              
              session.transcript.push({ who: 'bot', text: enhancedReply, ts: nowIso() });
              await saveSessionAndTranscript(sid, session);
              
              return logAndReturn({
                ok: true,
                reply: enhancedReply,
                stage: session.stage,
                options: smartOptions,
                buttons: smartOptions,
                aiPowered: true
              }, session.stage, session.stage, 'smart_ai_response', 'ai_replied');
            }
            
            smartOptions = [BUTTONS.CONNECT_TECH, BUTTONS.MORE_TESTS, BUTTONS.CLOSE];
          } else if (hasProblem) {
            smartOptions = [BUTTONS.MORE_TESTS, BUTTONS.ADVANCED_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
          } else {
            smartOptions = [BUTTONS.CLOSE];
          }
          
          session.transcript.push({ who: 'bot', text: smartReply, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          
          return logAndReturn({
            ok: true,
            reply: smartReply,
            stage: session.stage,
            options: smartOptions,
            buttons: smartOptions,
            aiPowered: true
          }, session.stage, session.stage, 'smart_ai_response', 'ai_replied');
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

    // ✅ CORRECCIÓN E y 5: Cerrar chat de forma prolija CON CTAs y ofrecer asistencia si hay problema no resuelto
    if (buttonToken === 'BTN_CLOSE' || /^\s*cerrar\s+chat\b/i.test(t)) {
      const whoLabel = session.userName ? capitalizeToken(session.userName) : 'Usuari@';
      const locale = session.userLocale || 'es-AR';
      const isEn = locale.toLowerCase().startsWith('en');
      
      // ✅ CORRECCIÓN 5: Verificar si hay problema no resuelto antes de cerrar
      const hasUnresolvedProblem = session.keyboardProblemDetected || 
                                   session.problem || 
                                   (smartAnalysis && smartAnalysis.problem?.detected && !session.ticketOffered);
      
      if (hasUnresolvedProblem && !session.ticketOffered) {
        // Ofrecer asistencia humana antes de cerrar
        const assistanceOffer = isEn
          ? `Before closing, I noticed you mentioned a problem with ${session.problem || 'your device'}.\n\nWould you like me to:\n• Connect you with a technician?\n• Generate a ticket with the conversation summary?\n• Try more advanced troubleshooting steps?`
          : `Antes de cerrar, noté que mencionaste un problema con ${session.problem || 'tu dispositivo'}.\n\n¿Querés que:\n• Te conecte con un técnico?\n• Genere un ticket con el resumen de la conversación?\n• Pruebe pasos de diagnóstico más avanzados?`;
        
        session.ticketOffered = true; // Marcar para no repetir
        markSessionDirty(sid, session);
        
        const options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_WHATSAPP', 'BTN_CLOSE'], locale);
        
        session.transcript.push({ who: 'bot', text: assistanceOffer, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        
        return res.json(withOptions({
          ok: true,
          reply: assistanceOffer,
          stage: session.stage,
          options: options
        }));
      }
      
      // ✅ Saludo acorde al horario
      const timeGreeting = buildTimeGreeting(whoLabel);
      
      // ✅ CTAs con links
      const ctaLinks = isEn
        ? `\n\nIf you need more help:\n🌐 Visit our website: https://stia.com.ar\n📱 Follow us on Instagram: @stirosario`
        : `\n\nSi necesitás más ayuda:\n🌐 Visitá nuestra web: https://stia.com.ar\n📱 Seguinos en Instagram: @stirosario`;
      
      const replyClose = `${timeGreeting}\n\n${ctaLinks}`;
      
      const tsClose = nowIso();
      changeStage(session, STATES.ENDED);
      session.waEligible = false;
      session.transcript.push({ who: 'bot', text: replyClose, ts: tsClose });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: true, reply: replyClose, stage: session.stage, options: [] }));
    }

    // Quick escalate via button or text (confirmation step)
    // ✅ CORRECCIÓN: Si el usuario pide hablar con técnico, ejecutar directamente sin confirmación adicional
    if (buttonToken === 'BTN_WHATSAPP' || /^\s*(?:enviar\s+whats?app|hablar con un tecnico|enviar whatsapp)$/i.test(t)) {
      // Si hay intención fuerte, ejecutar inmediatamente
      const hasStrongIntent = /^\s*(hablar con un tecnico|hablar con técnico|quiero hablar|necesito hablar|dame un técnico|dame un tecnico)\s*$/i.test(t);
      if (hasStrongIntent || buttonToken === 'BTN_WHATSAPP') {
        changeStage(session, STATES.ESCALATE);
        return await createTicketAndRespond(session, sid, res);
      }
      // Si no, pedir confirmación (comportamiento legacy para compatibilidad)
      session.pendingAction = { type: 'create_ticket' };
      await saveSessionAndTranscript(sid, session);
      const loc = session.userLocale || 'es-AR';
      const isEnCT = String(loc).toLowerCase().startsWith('en');
      const replyVariations = isEnCT ? [
        "I see you want to talk with a technician. Should I create a ticket with this chat summary?",
        "I understand you'd like to speak with a technician. Would you like me to generate a ticket with our conversation summary?",
        "You want to connect with a technician. Can I create a ticket with the chat summary for you?"
      ] : [
        "Veo que querés hablar con un técnico. ¿Querés que genere un ticket con el resumen de esta conversación?",
        "Entiendo que querés hablar con un especialista. ¿Te genero un ticket con el resumen de nuestra charla?",
        "Querés conectarte con un técnico. ¿Querés que prepare un ticket con el resumen de la conversación?"
      ];
      const variationIndex = (sid ? sid.charCodeAt(0) : 0) % replyVariations.length;
      const replyCT = replyVariations[variationIndex];
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
    if (buttonToken && /^BTN_HELP_STEP_\d+$/.test(buttonToken)) {
      const m = buttonToken.match(/^BTN_HELP_STEP_(\d+)$/);
      if (m) {
        // El índice en el token es 0-based, convertirlo a 1-based
        helpRequestedIndex = Number(m[1]) + 1;
      }
    } else if (buttonToken && /^BTN_HELP_\d+$/.test(buttonToken)) {
      // Compatibilidad con formato antiguo
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
          session.transcript.push({ who: 'bot', text: msg, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          return res.json(withOptions({ ok: false, reply: msg, stage: session.stage, options: [] }));
        }

        if (idx < 1 || idx > steps.length) {
          const msg = `Paso inválido. Elegí un número entre 1 y ${steps.length}.`;
          session.transcript.push({ who: 'bot', text: msg, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          return res.json(withOptions({ ok: false, reply: msg, stage: session.stage, options: [] }));
        }

        session.helpAttempts[idx] = (session.helpAttempts[idx] || 0) + 1;
        session.lastHelpStep = idx;
        if (!session.stage) {
          changeStage(session, STATES.BASIC_TESTS);
        }

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
        session.transcript.push({ who: 'bot', text: reply, ts });
        await saveSessionAndTranscript(sid, session);

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
        
        // Construir botones con texto personalizado según contexto
        const solvedBtn = buildUiButtonsFromTokens(['BTN_SOLVED'], locale)[0];
        const connectTechBtn = buildUiButtonsFromTokens(['BTN_CONNECT_TECH'], locale)[0];
        const backToStepsBtn = {
          token: 'BTN_BACK_TO_STEPS',
          label: isEn 
            ? (isAdvanced ? '⏪ Back to advanced steps' : '⏪ Back to steps')
            : (isAdvanced ? '⏪ Volver a los pasos avanzados' : '⏪ Volver a los pasos'),
          text: isEn 
            ? (isAdvanced ? 'back to advanced steps' : 'back to steps')
            : (isAdvanced ? 'volver a los pasos avanzados' : 'volver a los pasos')
        };
        
        // Asegurar que backToStepsBtn siempre esté presente
        const unifiedOpts = [];
        if (solvedBtn) unifiedOpts.push(solvedBtn);
        unifiedOpts.push(backToStepsBtn); // Siempre incluir este botón
        if (connectTechBtn) unifiedOpts.push(connectTechBtn);
        
        return res.json(withOptions({ ok: true, help: { stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: unifiedOpts }));
      } catch (err) {
        console.error('[help_step] Error generando ayuda:', err && err.message);
        const msg = 'No pude preparar la ayuda ahora. Probá de nuevo en unos segundos.';
        session.transcript.push({ who: 'bot', text: msg, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: false, reply: msg, stage: session.stage, options: [] }));
      }
    }

    // Limitar transcript a últimos 100 mensajes para prevenir crecimiento indefinido
    if (session.transcript.length > 100) {
      // ✅ BUG 3 FIX: Corregido - session es un objeto, debe ser session.transcript.slice()
      session.transcript = session.transcript ? session.transcript.slice(-100) : [];
    }

    // ✅ ASK_LANGUAGE ahora se procesa ANTES de enforceStage (ver línea ~5466)
    // Esto evita que enforceStage bloquee los botones de idioma

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
    
    // ========================================================
    // ✅ BLOQUE LEGACY DESHABILITADO - ASK_NEED manejado por sistema inteligente
    // ========================================================
    // Este bloque ha sido DESHABILITADO como parte de la unificación del sistema.
    // Ahora TODO el flujo después de ASK_NAME es manejado por el sistema inteligente
    // (handleWithIntelligence) que analiza automáticamente la intención del usuario
    // sin necesidad de botones BTN_PROBLEMA/BTN_CONSULTA.
    //
    // 📅 Deshabilitado: 06/12/2025
    // 🎯 Razón: Unificación completa con sistema inteligente
    // 🔄 Alternativa: Ver handleWithIntelligence() en línea ~4826
    //
    // ✅ MEDIO-10: Comentarios obsoletos limpiados
    // Este bloque fue eliminado porque ASK_NEED ahora es manejado por el sistema inteligente

    // ========================================================
    // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #3
    // ========================================================
    // 🔧 REFACTOR: Este bloque ha sido movido a handlers/nameHandler.js
    // La funcionalidad se mantiene idéntica, solo cambió la ubicación
    // ========================================================
    // ASK_USER_LEVEL: Procesar selección de nivel de usuario
    // ========================================================
    if (session.stage === STATES.ASK_USER_LEVEL) {
      try {
        const result = await handleAskUserLevelStage(
          session,
          t,
          buttonToken,
          sid,
          res,
          {
            STATES,
            saveSessionAndTranscript,
            changeStage,
            getSession: getSession
          }
        );
        
        if (result && result.handled) {
          return await sendResponseWithSave(res, sid, session, {
            ok: result.ok,
            reply: result.reply,
            stage: result.stage,
            buttons: result.buttons
          });
        }
      } catch (userLevelHandlerError) {
        console.error('[ASK_USER_LEVEL] Error en stageHandlers:', userLevelHandlerError);
      }
    }

    // ========================================================
    // ASK_NAME: Handler modularizado con validación defensiva

    // 🔧 REFACTOR: ASK_NAME ahora manejado por handlers/nameHandler.js
    if (session.stage === STATES.ASK_NAME) {
      try {
        const result = await handleAskNameStage(
          session,
          t,
          buttonToken,
          sid,
          res,
          {
            STATES,
            nowIso,
            saveSessionAndTranscript,
            markSessionDirty,
            capitalizeToken,
            changeStage,
            buildUiButtonsFromTokens
          }
        );
        
        if (result && result.handled) {
          // 🔧 FIX CRÍTICO-1: Usar sendResponseWithSave para mantener consistencia con guardado optimizado
          return await sendResponseWithSave(res, sid, session, {
            ok: result.ok,
            reply: result.reply,
            stage: result.stage,
            options: result.options || []
          });
        }
      } catch (nameHandlerError) {
        console.error('[ASK_NAME] Error en nameHandler:', nameHandlerError);
        // ✅ BUG 4 FIX: Fallback seguro - definir variables necesarias si el handler falla
        // Si el handler falla, el código continúa normalmente y necesita estas variables
        // Las definimos aquí para que estén disponibles en el scope del bloque if (session.stage === STATES.ASK_NAME)
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        
        // Fallback básico: responder con mensaje de error amigable
        const fallbackReply = isEn
          ? "I'm sorry, there was an error processing your name. Please try again."
          : "Lo siento, hubo un error procesando tu nombre. Por favor, intentá de nuevo.";
        
        session.transcript.push({ who: 'bot', text: fallbackReply, ts: nowIso() });
        markSessionDirty(sid, session);
        
        return await sendResponseWithSave(res, sid, session, {
          ok: true,
          reply: fallbackReply,
          stage: session.stage
        });
      }
    }
    
    // ✅ MEDIO-10: Comentarios obsoletos limpiados - ASK_NAME manejado por handlers/nameHandler.js

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
      changeStage(session, STATES.ASK_PROBLEM);
      session.problem = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      return await sendResponseWithSave(res, sid, session, withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    }

    // ✅ CORRECCIÓN 8: Manejo de "volver al menú principal" - mostrar botones claros
    const menuRequestRx = /^\s*(volver\s+al\s+men[uú]\s+principal|men[uú]\s+principal|volver\s+al\s+inicio|volver\s+al\s+comienzo|empezar\s+de\s+nuevo|reiniciar|restart|main\s+menu|volver|inicio)\s*$/i;
    if (menuRequestRx.test(t)) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const whoName = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
      
      // Resetear sesión a estado inicial pero mantener nombre e idioma
      const savedName = session.userName;
      const savedLocale = session.userLocale;
      const savedGdprConsent = session.gdprConsent;
      
      // Resetear todo excepto datos básicos
      session.problem = null;
      session.device = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      session.stepProgress = {};
      session.stepsDone = [];
      session.ticketOffered = false;
      session.pendingAction = null;
      
      // Volver al stage de problema pero con saludo amigable
      changeStage(session, STATES.ASK_PROBLEM);
      
      const menuReplies = isEn ? [
        `Sure, ${whoName}! Let's start fresh. What problem are you having or what do you need help with?`,
        `Of course, ${whoName}! Let's begin again. Tell me: what problem are you experiencing?`,
        `No problem, ${whoName}! Starting over. What can I help you with today?`
      ] : [
        `¡Dale, ${whoName}! Empecemos de nuevo. ¿Qué problema estás teniendo o en qué necesitás ayuda?`,
        `¡Por supuesto, ${whoName}! Volvamos al inicio. Contame: ¿qué problema tenés?`,
        `¡Sin problema, ${whoName}! Reiniciemos. ¿En qué puedo ayudarte hoy?`
      ];
      const replyIndex = (sid ? sid.charCodeAt(0) : 0) % menuReplies.length;
      const reply = menuReplies[replyIndex];
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      return await sendResponseWithSave(res, sid, session, withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    }

    // State machine core: ASK_PROBLEM -> ASK_DEVICE -> BASIC_TESTS -> ...
    let reply = '';
    let options = [];

  // ✅ CORRECCIÓN: Tratar DIAGNOSING_PROBLEM como ASK_PROBLEM para mostrar pasos
  if (session.stage === 'DIAGNOSING_PROBLEM') {
    console.log('[STAGE] 🔄 Convirtiendo DIAGNOSING_PROBLEM → ASK_PROBLEM para forzar pasos estructurados');
    session.stage = STATES.ASK_PROBLEM;
    markSessionDirty(sid, session);
  }

    // ✅ MEDIO-9: Validar stage antes de procesar
    if (session.stage === STATES.ASK_PROBLEM) {
      // ✅ CORRECCIÓN CRÍTICA DEFINITIVA: Si estamos en ASK_PROBLEM con texto libre del usuario,
      // saltar DIRECTAMENTE a generateAndShowSteps sin pasar por ninguna otra lógica
      // Esto garantiza que el nuevo formato de 15 pasos SIEMPRE se muestre cuando el usuario escribe el problema
      if (!buttonToken && t && t.trim().length > 0) {
        console.log('[ASK_PROBLEM] 🚀 Texto libre detectado - saltando directamente a generateAndShowSteps');
        session.problem = t || session.problem;
        // Asegurar que tenemos un dispositivo (si no, se pedirá en generateAndShowSteps)
        // Continuar directamente a generar pasos
        return await generateAndShowSteps(session, sid, res);
      }
      
      const stageInfo = getStageInfo(session.stage);
      if (!stageInfo) {
        console.warn(`[STAGE] ⚠️ Stage inválido detectado: ${session.stage}, usando fallback`);
      }
      // ✅ MEJORA UX FASE 2: Validación proactiva - detectar inconsistencias
      const newProblem = t || session.problem;
      if (session.problem && session.problem !== newProblem) {
        const inconsistency = detectInconsistency(session, newProblem, 'problem', session.userLocale || 'es-AR');
        if (inconsistency && inconsistency.hasInconsistency) {
          session.transcript.push({ who: 'bot', text: inconsistency.message, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          return res.json(withOptions({
            ok: false,
            reply: inconsistency.message,
            stage: session.stage,
            options: buildUiButtonsFromTokens(inconsistency.options || ['BTN_BACK'], session.userLocale || 'es-AR')
          }));
        }
      }
      session.problem = newProblem;
      
      // ✅ FASE 3: Confirmación proactiva del problema (solo si es muy diferente del anterior)
      if (session.problem && session.problem.trim() && session.problem.length > 10) {
        const previousProblem = session.previousProblem;
        if (previousProblem && previousProblem !== session.problem) {
          const inconsistency = detectInconsistency(session, session.problem, 'problem', session.userLocale || 'es-AR');
          if (inconsistency && inconsistency.hasInconsistency) {
            session.previousProblem = session.problem; // Guardar para no repetir
            session.transcript.push({ who: 'bot', text: inconsistency.message, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);
            const locale = session.userLocale || 'es-AR';
            return res.json(withOptions({
              ok: false,
              reply: inconsistency.message,
              stage: session.stage,
              options: buildUiButtonsFromTokens(['BTN_BACK', 'BTN_CLOSE'], locale),
              session,
              locale
            }));
          }
        }
        // Guardar problema actual como anterior para próximas comparaciones
        session.previousProblem = session.problem;
      }
      console.log('[ASK_PROBLEM] session.device:', session.device, 'session.problem:', session.problem);
      console.log('[ASK_PROBLEM] imageContext:', imageContext ? 'YES (' + imageContext.length + ' chars)' : 'NO');

      // 🎯 DETECTAR BOTONES DE ACCIÓN ANTES DE ANALIZAR
      // Si el usuario clickea un botón de acción (Pruebas Avanzadas, Conectar Técnico, etc.)
      // NO analizar ese texto como un problema - dejar que caiga al handler correspondiente más abajo
      const rxAdvanced = /^\s*(pruebas avanzadas|más pruebas)\b/i;
      const rxConnectTech = /^\s*(conectar con técnico|hablar con técnico)\b/i;
      const rxClose = /^\s*(cerrar|terminar)\b/i;
      
      const isActionButton = 
        buttonToken === 'BTN_ADVANCED_TESTS' || 
        buttonToken === 'BTN_MORE_TESTS' ||
        buttonToken === 'BTN_CONNECT_TECH' ||
        buttonToken === 'BTN_CLOSE' ||
        rxAdvanced.test(t) ||
        rxConnectTech.test(t) ||
        rxClose.test(t);
      
      if (isActionButton) {
        console.log('[ASK_PROBLEM] ⏭️ Botón de acción detectado:', buttonToken || t, '- Skip análisis AI, ir a handler');
        
        // 🔬 HANDLER: BTN_ADVANCED_TESTS desde ASK_PROBLEM
        // Usuario clickea "Pruebas Avanzadas" sin haber visto pasos básicos primero
        if (rxAdvanced.test(t) || buttonToken === 'BTN_ADVANCED_TESTS' || buttonToken === 'BTN_MORE_TESTS') {
          try {
            const locale = session.userLocale || 'es-AR';
            const isEn = String(locale).toLowerCase().startsWith('en');
            const device = session.device || '';
            
            // Primero, asegurarse de que hay pasos básicos guardados
            // Si no hay, generarlos primero antes de mostrar avanzados
            if (!session.tests || !session.tests.basic || session.tests.basic.length === 0) {
              console.log('[ASK_PROBLEM → ADVANCED] No hay pasos básicos aún, generando primero...');
              // Generar pasos básicos y continuar con avanzados
              return await generateAndShowSteps(session, sid, res);
            }
            
            // Generar pruebas avanzadas
            let aiSteps = [];
            try {
              aiSteps = await aiQuickTests(
                session.problem || '', 
                device || '', 
                locale, 
                Array.isArray(session.tests?.basic) ? session.tests.basic : []
              );
            } catch (e) { 
              console.error('[ASK_PROBLEM → ADVANCED] Error calling aiQuickTests:', e);
              aiSteps = []; 
            }
            
            let limited = Array.isArray(aiSteps) ? aiSteps.slice(0, 8) : [];

            // Filtrar resultados avanzados que ya estén en pasos básicos
            session.tests = session.tests || {};
            const basicList = Array.isArray(session.tests.basic) ? session.tests.basic : [];
            const basicSet = new Set((basicList || []).map(normalizeStepText));
            limited = limited.filter(s => !basicSet.has(normalizeStepText(s)));
            limited = limited.slice(0, 4);

            if (!limited || limited.length === 0) {
              const noMore = isEn
                ? "I don't have more advanced tests that are different from the ones you already tried. I can connect you with a technician if you want."
                : 'No tengo más pruebas avanzadas distintas a las que ya probaste. ¿Querés que te conecte con un técnico?';
              changeStage(session, STATES.ESCALATE);
              session.transcript.push({ who: 'bot', text: noMore, ts: nowIso() });
              await saveSessionAndTranscript(sid, session);
              return res.json(withOptions({ ok: true, reply: noMore, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH','BTN_CLOSE'], locale) }));
            }

            session.tests.advanced = limited;
            session.stepProgress = session.stepProgress || {};
            limited.forEach((_, i) => session.stepProgress[`adv_${i + 1}`] = 'pending');

            const help = isEn
              ? `💡 Try these more specific tests. If they don't work, I'll connect you with a technician.`
              : `💡 Probá estas pruebas más específicas. Si no funcionan, te conecto con un técnico.`;

            const formattedSteps = enumerateSteps(limited);
            const stepBlock = formattedSteps.join('\n\n');
            let reply = `${help}\n\n**🔬 PRUEBAS AVANZADAS:**\n${stepBlock}\n\n`;

            const prompt = isEn
              ? `Did any of these tests solve the problem?`
              : `¿Alguna de estas pruebas solucionó el problema?`;
            reply += prompt;

            changeStage(session, STATES.ADVANCED_TESTS);
            const options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH'], locale);

            session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);
            return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
          } catch (err) {
            console.error('[ASK_PROBLEM → ADVANCED] Error generating advanced tests:', err);
            changeStage(session, STATES.ESCALATE);
            await saveSessionAndTranscript(sid, session);
            return await createTicketAndRespond(session, sid, res);
          }
        }
        
        // 👨‍💻 HANDLER: BTN_CONNECT_TECH desde ASK_PROBLEM
        if (rxConnectTech.test(t) || buttonToken === 'BTN_CONNECT_TECH') {
          changeStage(session, STATES.ESCALATE);
          
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          
          // ✅ CORRECCIÓN: Variaciones de respuesta para evitar repetición
          const escalationReplies = isEn ? [
            `Perfect! I'll connect you with a human technician.\n\n✅ The technician will receive the complete conversation history so you don't have to explain everything again.\n\nPress the button below to continue:`,
            `Great! I'll get you in touch with a specialist.\n\n✅ They'll have access to our full conversation history.\n\nUse the button below to continue:`,
            `Excellent! I'll connect you with a technician.\n\n✅ All the context from our chat will be shared with them.\n\nTap the button below to continue:`
          ] : (locale === 'es-419' ? [
            `¡Perfecto! Te conecto con un técnico humano.\n\n✅ El técnico recibirá el historial completo de nuestra conversación para que no tengas que volver a explicar todo.\n\nHacé clic en el botón de abajo para continuar:`,
            `¡Genial! Te voy a poner en contacto con un especialista.\n\n✅ Va a recibir todo el contexto de nuestra charla.\n\nUsá el botón de abajo para continuar:`,
            `¡Excelente! Te conecto con un técnico.\n\n✅ Le comparto todo el historial de nuestra conversación.\n\nTocá el botón de abajo para continuar:`
          ] : [
            `¡Perfecto! Te conecto con un técnico humano.\n\n✅ El técnico recibirá el historial completo de nuestra conversación para que no tengas que volver a explicar todo.\n\nPresioná el botón de abajo para continuar:`,
            `¡Genial! Te voy a poner en contacto con un especialista.\n\n✅ Va a recibir todo el contexto de nuestra charla.\n\nUsá el botón de abajo para continuar:`,
            `¡Excelente! Te conecto con un técnico.\n\n✅ Le comparto todo el historial de nuestra conversación.\n\nTocá el botón de abajo para continuar:`
          ]);
          const replyIndex = (sid ? sid.charCodeAt(0) : 0) % escalationReplies.length;
          const escalationReply = escalationReplies[replyIndex];
          
          session.transcript.push({ who: 'bot', text: escalationReply, ts: nowIso(), stage: session.stage });
          await saveSessionAndTranscript(sid, session);
          
          // Crear botón de WhatsApp personalizado
          const whatsappButton = {
            token: 'BTN_WHATSAPP_TECNICO',
            label: isEn ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
            text: 'hablar con un técnico',
            emoji: '💚',
            action: 'external',
            style: 'primary'
          };
          
          return res.json({
            ok: true,
            reply: escalationReply,
            stage: session.stage,
            options: [whatsappButton],
            ui: {
              buttons: [whatsappButton]
            }
          });
        }
        
        // 💚 HANDLER: BTN_WHATSAPP_TECNICO - Enviar historial por WhatsApp
        if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          
          // Preparar historial de conversación
          const transcriptText = session.transcript
            .map((msg, idx) => {
              const time = msg.ts ? new Date(msg.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
              const who = msg.who === 'user' ? '👤 Cliente' : '🤖 Tecnos';
              const stage = msg.stage ? ` [${msg.stage}]` : '';
              return `${idx + 1}. ${who} ${time}${stage}:\n   ${msg.text}`;
            })
            .join('\n\n');
          
          // Información técnica recopilada
          const technicalInfo = [
            `📱 *Información Técnica:*`,
            session.operatingSystem ? `• OS: ${session.operatingSystem}` : null,
            session.device ? `• Dispositivo: ${session.device}` : null,
            session.deviceBrand ? `• Marca: ${session.deviceBrand}` : null,
            session.problemCategory ? `• Categoría: ${session.problemCategory}` : null,
            session.activeIntent ? `• Intent: ${session.activeIntent.type} (${Math.round(session.activeIntent.confidence * 100)}%)` : null
          ].filter(Boolean).join('\n');
          
          // Preparar mensaje completo para WhatsApp
          const whatsappMessage = encodeURIComponent(
            `🆘 *Solicitud de Soporte Técnico*\n\n` +
            `📋 *ID Sesión:* ${sid}\n\n` +
            `${technicalInfo}\n\n` +
            `📝 *Historial de Conversación:*\n\n` +
            `${transcriptText}\n\n` +
            `⏰ *Hora de solicitud:* ${new Date().toLocaleString('es-AR')}`
          );
          
          // Número de WhatsApp del soporte (ajustar según configuración)
          const whatsappNumber = process.env.WHATSAPP_SUPPORT_NUMBER || '5492323569443'; // STI Support
          const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
          
          const confirmMsg = isEn
            ? `Perfect! Click the link below to open WhatsApp with all the conversation history ready to send:\n\n${whatsappUrl}\n\n✅ The technician will receive all the context and will be able to help you quickly.`
            : (locale === 'es-419'
              ? `¡Perfecto! Hacé clic en el enlace de abajo para abrir WhatsApp con todo el historial de conversación listo para enviar:\n\n${whatsappUrl}\n\n✅ El técnico va a recibir todo el contexto y va a poder ayudarte rápidamente.`
              : `¡Perfecto! Hacé clic en el enlace de abajo para abrir WhatsApp con todo el historial de conversación listo para enviar:\n\n${whatsappUrl}\n\n✅ El técnico va a recibir todo el contexto y va a poder ayudarte rápidamente.`);
          
          session.transcript.push({ who: 'bot', text: confirmMsg, ts: nowIso(), stage: session.stage });
          await saveSessionAndTranscript(sid, session);
          
          return res.json(withOptions({
            ok: true,
            reply: confirmMsg,
            stage: session.stage,
            whatsappUrl: whatsappUrl,
            metadata: {
              action: 'open_whatsapp',
              url: whatsappUrl
            },
            options: buildUiButtonsFromTokens(['BTN_WHATSAPP_TECNICO', BUTTONS.CLOSE], locale)
          }));
        }
        
        // 🚪 HANDLER: BTN_CLOSE desde ASK_PROBLEM
        if (rxClose.test(t) || buttonToken === 'BTN_CLOSE') {
          const locale = session.userLocale || 'es-AR';
          const isEn = String(locale).toLowerCase().startsWith('en');
          const farewell = isEn
            ? 'Okay, if you need help in the future, I\'ll be here. Have a great day! 👋'
            : (locale === 'es-419'
              ? 'Dale, cualquier cosa que necesites en el futuro, acá estoy. ¡Que tengas un buen día! 👋'
              : 'Dale, cualquier cosa que necesites en el futuro, acá estoy. ¡Que tengas un buen día! 👋');
          changeStage(session, STATES.ENDED);
          session.transcript.push({ who: 'bot', text: farewell, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          return res.json({ ok: true, reply: farewell, stage: session.stage, close: true });
        }
        
        // Si no hay handler específico, continuar con análisis AI normal
      } else {
        // SOLO ANALIZAR CON AI SI NO ES UN BOTÓN DE ACCIÓN
        
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
        
        session.transcript.push({ who: 'bot', text: responseText, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        
        return logAndReturn({
          ok: true,
          reply: responseText,
          stage: session.stage,
          options: nextOptions,
          buttons: nextOptions
        }, session.stage, session.stage, 'image_analysis', 'image_analyzed');
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
            changeStage(session, 'CONFIRM_DEVICE');
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

            session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);

            return res.json({
              ok: true,
              reply: replyText,
              stage: session.stage,
              options: confirmButtons,
              buttons: confirmButtons
            });
          }

          // CASO 2: Baja confianza (<0.33) - Mostrar todos los botones
          changeStage(session, 'CHOOSE_DEVICE');
          session.ambiguousTerm = ambiguousResult.term;

          const replyText = isEn
            ? `To help you better, what type of device is your **${ambiguousResult.term}**?`
            : (locale === 'es-419'
              ? `Para ayudarte mejor, ¿qué tipo de dispositivo es tu **${ambiguousResult.term}**?`
              : `Para ayudarte mejor, ¿qué tipo de dispositivo es tu **${ambiguousResult.term}**?`);

          const deviceButtons = generateDeviceButtons(ambiguousResult.candidates);

          session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);

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
          changeStage(session, STATES.ASK_DEVICE);
          session.pendingDeviceGroup = 'compu';
          const replyText = isEn
            ? `Perfect. When you say "${shownWord}", which of these devices do you mean?`
            : (locale === 'es-419'
              ? `Perfecto. Cuando dices "${shownWord}", ¿a cuál de estos dispositivos te refieres?`
              : `Perfecto. Cuando decís "${shownWord}", ¿a cuál de estos dispositivos te referís?`);
          const optionTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
          const uiButtons = buildUiButtonsFromTokens(optionTokens, locale);
          const ts = nowIso();
          session.transcript.push({ who: 'bot', text: replyText, ts });
          await saveSessionAndTranscript(sid, session);

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
        session.transcript.push({ who: 'bot', text: replyNotIT, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: true, reply: replyNotIT, stage: session.stage, options: [reformBtn] }));
      }

      // 🎯 VALIDACIÓN: Solo aceptar device de AI si el problema menciona explícitamente el dispositivo
      // Para evitar que "pantalla azul" asuma "notebook" sin confirmación
      if (ai.device && !session.device) {
        const problemLower = (session.problem || '').toLowerCase();
        const deviceKeywords = {
          'notebook': ['notebook', 'note book', 'laptop', 'portátil', 'portatil'],
          'pc': ['pc', 'compu', 'computadora', 'ordenador', 'escritorio', 'desktop', 'torre'],
          'router': ['router', 'modem', 'módem'],
          'impresora': ['impresora', 'printer'],
          'fire_tv': ['fire tv', 'firetv', 'fire stick'],
          'chromecast': ['chromecast', 'chrome cast'],
          'roku': ['roku'],
          'android_tv': ['android tv', 'google tv'],
          'apple_tv': ['apple tv', 'appletv'],
          'smart_tv_samsung': ['samsung', 'smart tv samsung'],
          'smart_tv_lg': ['lg', 'smart tv lg'],
          'smart_tv_sony': ['sony', 'smart tv sony'],
          'smart_tv_generic': ['smart tv', 'televisor', 'televisión'],
          'webcam': ['webcam', 'cámara web', 'camara web'],
          'mouse': ['mouse', 'ratón', 'raton'],
          'teclado': ['teclado', 'keyboard'],
          'monitor': ['monitor', 'pantalla']
        };
        
        const keywords = deviceKeywords[ai.device] || [];
        const deviceMentioned = keywords.some(kw => problemLower.includes(kw));
        
        if (deviceMentioned) {
          session.device = ai.device;
          console.log(`[ASK_PROBLEM] ✅ Device detectado y validado: ${ai.device} (mencionado en problema)`);
        } else {
          console.log(`[ASK_PROBLEM] ⚠️ Device AI sugerido (${ai.device}) pero NO mencionado en problema - no asignar automáticamente`);
          // No asignar device - dejar que el flujo pida confirmación
        }
      }
      
      if (ai.issueKey) session.issueKey = session.issueKey || ai.issueKey;

      // Detectar si es solicitud de ayuda (How-To) o problema técnico
      if (ai.isHowTo && !ai.isProblem) {
        // Es una solicitud de guía/instalación/configuración
        session.isHowTo = true;
        changeStage(session, STATES.ASK_HOWTO_DETAILS);
        
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

        session.transcript.push({ who: 'bot', text: replyHowTo, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json({ ok: true, reply: replyHowTo, stage: session.stage });
      }

      // Si llegó acá, es un PROBLEMA técnico → generar pasos de diagnóstico
      session.isProblem = true;
      session.isHowTo = false;

      // 🎯 VALIDACIÓN PRE-STEPS: Si no conocemos el dispositivo, preguntar antes de generar pasos
      if (!session.device) {
        console.log('[ASK_PROBLEM] ⚠️ Device desconocido - solicitar al usuario');
        
        const askDeviceMsg = isEn
          ? `To give you the most accurate steps, I need to know:\n\n**What device are you having trouble with?**`
          : (locale === 'es-419'
            ? `Para darte los pasos más precisos, necesito saber:\n\n**¿Con qué dispositivo tenés el problema?**`
            : `Para darte los pasos más precisos, necesito saber:\n\n**¿Con qué dispositivo tenés el problema?**`);
        
        session.stage = 'CHOOSE_DEVICE';
        
        // Botones comunes de dispositivos
        const commonDeviceButtons = [
          { token: 'DEVICE_PC_DESKTOP', icon: '🖥️', label: isEn ? 'Desktop PC' : 'PC de Escritorio', description: isEn ? 'Tower or all-in-one' : 'Torre o todo en uno', text: isEn ? 'Desktop PC' : 'PC de Escritorio' },
          { token: 'DEVICE_NOTEBOOK', icon: '💻', label: 'Notebook', description: isEn ? 'Laptop' : 'Portátil', text: 'Notebook' },
          { token: 'DEVICE_MONITOR', icon: '🖥️', label: isEn ? 'Monitor' : 'Monitor', description: isEn ? 'External screen' : 'Pantalla externa', text: isEn ? 'Monitor' : 'Monitor' },
          { token: 'DEVICE_PRINTER', icon: '🖨️', label: isEn ? 'Printer' : 'Impresora', description: isEn ? 'Printer or scanner' : 'Impresora o escáner', text: isEn ? 'Printer' : 'Impresora' },
          { token: 'DEVICE_ROUTER', icon: '📡', label: 'Router', description: isEn ? 'Internet router/modem' : 'Router/módem de internet', text: 'Router' },
          { token: 'DEVICE_OTHER', icon: '❓', label: isEn ? 'Other device' : 'Otro dispositivo', description: isEn ? 'Something else' : 'Otra cosa', text: isEn ? 'Other device' : 'Otro dispositivo' }
        ];
        
        session.transcript.push({ who: 'bot', text: askDeviceMsg, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        
        return res.json({
          ok: true,
          reply: askDeviceMsg,
          stage: session.stage,
          options: commonDeviceButtons,
          buttons: commonDeviceButtons
        });
      }

      // Generate and show steps
      return await generateAndShowSteps(session, sid, res);
      
      } // End of else - skip AI analysis for action buttons

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
        changeStage(session, STATES.BASIC_TESTS); // Reuse BASIC_TESTS flow for showing steps

        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
        let replyText = isEn
          ? `Perfect, ${whoLabel}! Here's the guide for ${deviceName} on ${session.userOS}:\n\n`
          : (locale === 'es-419'
            ? `Perfecto, ${whoLabel}! Acá tienes la guía para ${deviceName} en ${session.userOS}:\n\n`
            : `Perfecto, ${whoLabel}! Acá tenés la guía para ${deviceName} en ${session.userOS}:\n\n`);

        if (guideData.steps && guideData.steps.length > 0) {
          // ✅ FORMATO UNIFICADO: Usar enumerateSteps para consistencia visual
          const formattedSteps = enumerateSteps(guideData.steps).join('\n\n');
          replyText += formattedSteps;
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

        session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);

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
        session.transcript.push({ who: 'bot', text: errorMsg, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json({ ok: true, reply: errorMsg, stage: session.stage });
      }

    } else if (session.stage === STATES.ASK_DEVICE) {
      // Delegar al handler especializado
      const deps = {
        buildUiButtonsFromTokens,
        saveSessionAndTranscript,
        generateAndShowSteps,
        capitalizeToken
      };
      return await handleDeviceStage(session, sid, res, t, buttonToken, deps);

      // ========================================================
      // 🎯 HANDLER: ASK_OS (Preguntar sistema operativo)
      // ========================================================
    } else if (session.stage === STATES.ASK_OS) {
      const deps = {
        buildUiButtonsFromTokens,
        saveSessionAndTranscript,
        generateAndShowSteps,
        capitalizeToken
      };
      return await handleOSStage(session, sid, res, t, buttonToken, deps);

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

        session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
        changeStage(session, STATES.ASK_PROBLEM);
        await saveSessionAndTranscript(sid, session);

        // Continuar con generación de pasos
        return await generateAndShowSteps(session, sid, res);
      }

      // Usuario dijo NO - mostrar todas las opciones
      if (buttonToken === 'DEVICE_CONFIRM_NO' || /^(no|n|nop|not)$/i.test(buttonToken) || /otro/i.test(buttonToken)) {
        changeStage(session, 'CHOOSE_DEVICE');
        const ambiguousResult = detectAmbiguousDevice(session.problem);

        const replyText = isEn
          ? `No problem. Please choose the correct device:`
          : (locale === 'es-419'
            ? `No hay problema. Por favor, elegí el dispositivo correcto:`
            : `No hay problema. Por favor, elegí el dispositivo correcto:`);

        const deviceButtons = ambiguousResult
          ? generateDeviceButtons(ambiguousResult.candidates)
          : [];

        session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);

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
      session.transcript.push({ who: 'bot', text: fallbackMsg, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
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
        // Mapeo directo de tokens a device IDs (para botones comunes sin ambiguousResult)
        const directDeviceMap = {
          'DEVICE_PC_DESKTOP': { id: 'pc-escritorio', label: isEn ? 'Desktop PC' : 'PC de Escritorio' },
          'DEVICE_NOTEBOOK': { id: 'notebook', label: 'Notebook' },
          'DEVICE_MONITOR': { id: 'monitor', label: isEn ? 'Monitor' : 'Monitor' },
          'DEVICE_PRINTER': { id: 'impresora', label: isEn ? 'Printer' : 'Impresora' },
          'DEVICE_ROUTER': { id: 'router', label: 'Router' },
          'DEVICE_OTHER': { id: 'generic', label: isEn ? 'Other device' : 'Otro dispositivo' }
        };
        
        let selectedDevice = null;
        
        // Intento 1: Mapeo directo de tokens comunes
        if (directDeviceMap[buttonToken]) {
          selectedDevice = directDeviceMap[buttonToken];
        }
        
        // Intento 2: Buscar en ambiguousResult si existe
        if (!selectedDevice) {
          const ambiguousResult = detectAmbiguousDevice(session.problem);
          
          if (ambiguousResult) {
            // Buscar por token (formato: DEVICE_PC_DESKTOP)
            if (buttonToken.startsWith('DEVICE_')) {
              const deviceId = buttonToken.replace('DEVICE_', '');
              selectedDevice = ambiguousResult.candidates.find(d => d.id === deviceId);
            }

            // Buscar por label exacto (formato: "PC de Escritorio")
            if (!selectedDevice) {
              selectedDevice = ambiguousResult.candidates.find(d => d.label === buttonToken);
            }

            // Buscar por label case-insensitive
            if (!selectedDevice) {
              const lowerToken = buttonToken.toLowerCase();
              selectedDevice = ambiguousResult.candidates.find(d => d.label.toLowerCase() === lowerToken);
            }
          }
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

        session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
        changeStage(session, STATES.ASK_PROBLEM);
        await saveSessionAndTranscript(sid, session);

          console.log('[CHOOSE_DEVICE] ✅ Dispositivo seleccionado:', selectedDevice.label, '(', selectedDevice.id, ')');

          // Continuar con generación de pasos
          return await generateAndShowSteps(session, sid, res);
        }
      }

      // Fallback
      const fallbackMsg = isEn
        ? 'Please choose one of the device options.'
        : (locale === 'es-419'
          ? 'Por favor, elegí una de las opciones de dispositivo.'
          : 'Por favor, elegí una de las opciones de dispositivo.');
      session.transcript.push({ who: 'bot', text: fallbackMsg, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);

      console.log('[CHOOSE_DEVICE] ⚠️ No se reconoció el dispositivo. buttonToken:', buttonToken);

      return res.json({ ok: true, reply: fallbackMsg, stage: session.stage });

    } else if (session.stage === STATES.BASIC_TESTS) {
      // Delegar al handler especializado
      const deps = {
        generateAndShowSteps,
        explainStepWithAI,
        handleDontUnderstand,
        createTicketAndRespond,
        aiQuickTests,
        buildUiButtonsFromTokens,
        addEmpatheticResponse,
        saveSessionAndTranscript,
        capitalizeToken,
        emojiForIndex
      };
      return await handleBasicTestsStage(session, sid, res, t, buttonToken, deps);
    } else if (session.stage === STATES.ESCALATE) {
      // Delegar al handler especializado
      const deps = {
        createTicketAndRespond,
        aiQuickTests,
        buildUiButtonsFromTokens,
        addEmpatheticResponse,
        saveSessionAndTranscript,
        capitalizeToken,
        emojiForIndex
      };
      return await handleEscalateStage(session, sid, res, t, buttonToken, deps);
      
      const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas|pruebas avanzadas)/i;
      const isOpt1 = opt1.test(t) || buttonToken === 'BTN_MORE_TESTS' || buttonToken === 'BTN_ADVANCED_TESTS';

      if (isOpt1) {
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
            session.transcript.push({ who: 'bot', text: noMore, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);
            return res.json(withOptions({ ok: true, reply: noMore, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH','BTN_CLOSE'], locale) }));
          }

          // ✅ MEJORA UX FASE 2: Validación proactiva antes de avanzar a ADVANCED_TESTS
          const validation = validateBeforeAdvancing(session, STATES.ADVANCED_TESTS, locale);
          if (validation && validation.needsConfirmation) {
            session.transcript.push({ who: 'bot', text: validation.message, ts: nowIso() });
            await saveSessionAndTranscript(sid, session);
            return res.json(withOptions({
              ok: false,
              reply: validation.message,
              stage: session.stage,
              options: validation.options || buildUiButtonsFromTokens(['BTN_BACK'], locale)
            }));
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
          const fullMsg = intro + '\n\n' + numbered.join('\n\n') + footer;
          session.stepsDone = session.stepsDone || [];
          session.stepsDone.push('advanced_tests_shown');
          session.waEligible = false;
          session.lastHelpStep = null;
          changeStage(session, STATES.ADVANCED_TESTS);
          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          const helpOptions = limited.map((_, i) => `🆘🛠️ Ayuda paso ${emojiForIndex(i)}`);
          // ✅ FORMATO UNIFICADO: Emojis al inicio para consistencia visual
          const solvedBtn = isEn ? '✔️ I solved it' : '✔️ Lo pude solucionar';
          const persistBtn = isEn ? '❌ Still not working' : '❌ El problema persiste';
          const optionsResp = [...helpOptions, solvedBtn, persistBtn];
          return res.json(withOptions({ ok: true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: limited }));
        } catch (errOpt1) {
          console.error('[ESCALATE][more_tests] Error', errOpt1 && errOpt1.message);
          const locale = session.userLocale || 'es-AR';
          const friendlyError = getFriendlyErrorMessage(errOpt1, locale, 'generating more tests');
          session.transcript.push({ who: 'bot', text: friendlyError, ts: nowIso() });
          await saveSessionAndTranscript(sid, session);
          return res.json(withOptions({ ok: false, reply: friendlyError, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CLOSE'], locale) }));
        }
      } else {
        // ✅ CORRECCIÓN: Si no entendió en ESCALATE, ofrecer directamente el botón sin más preguntas
        const locale = session.userLocale || 'es-AR';
        const isEn = String(locale).toLowerCase().startsWith('en');
        const escalationVariations = [
          isEn
            ? "I'll connect you with a technician. Press the button below to continue on WhatsApp:"
            : "Te conecto con un técnico. Presioná el botón de abajo para continuar por WhatsApp:",
          isEn
            ? "Let me connect you with a specialist. Use the WhatsApp button to continue:"
            : "Déjame conectarte con un especialista. Usá el botón de WhatsApp para continuar:",
          isEn
            ? "I'll get you in touch with a technician. Tap the button below:"
            : "Te voy a poner en contacto con un técnico. Tocá el botón de abajo:"
        ];
        const variationIndex = (sid ? sid.charCodeAt(0) : 0) % escalationVariations.length;
        reply = escalationVariations[variationIndex];
        
        const whatsappButton = {
          token: 'BTN_WHATSAPP_TECNICO',
          label: isEn ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
          text: 'hablar con un técnico',
          emoji: '💚',
          action: 'external',
          style: 'primary'
        };
        options = [whatsappButton];
      }
    } else if (session.stage === STATES.ADVANCED_TESTS) {
      // Delegar al handler especializado
      const deps = {
        handleShowSteps,
        handleDontUnderstand,
        createTicketAndRespond,
        buildUiButtonsFromTokens,
        addEmpatheticResponse,
        saveSessionAndTranscript,
        capitalizeToken
      };
      return await handleAdvancedTestsStage(session, sid, res, t, buttonToken, deps);
    } else {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      
      // 🔧 INTERCEPTAR ESCALATE ANTES DEL FALLBACK - NO debe dispararse fallback en ESCALATE
      if (session.stage === STATES.ESCALATE) {
        console.log('[FALLBACK] 🔧 Stage ESCALATE detectado - ofreciendo botón de WhatsApp directamente');
        // Si está en ESCALATE y no entendió, ofrecer directamente el botón sin más preguntas
        const escalationVariations = [
          isEn 
            ? "I'll connect you with a technician. Press the button below to continue on WhatsApp:"
            : "Te conecto con un técnico. Presioná el botón de abajo para continuar por WhatsApp:",
          isEn
            ? "Let me connect you with a specialist. Use the WhatsApp button to continue:"
            : "Déjame conectarte con un especialista. Usá el botón de WhatsApp para continuar:",
          isEn
            ? "I'll get you in touch with a technician. Tap the button below:"
            : "Te voy a poner en contacto con un técnico. Tocá el botón de abajo:"
        ];
        // Usar variación basada en el hash de la sesión para evitar repetición
        const variationIndex = (sid ? sid.charCodeAt(0) : 0) % escalationVariations.length;
        reply = escalationVariations[variationIndex];
        
        const whatsappButton = {
          token: 'BTN_WHATSAPP_TECNICO',
          label: isEn ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
          text: 'hablar con un técnico',
          emoji: '💚',
          action: 'external',
          style: 'primary'
        };
        options = [whatsappButton];
      } else if (session.stage === STATES.GUIDING_INSTALLATION) {
        console.log('[FALLBACK] 🔧 Stage GUIDING_INSTALLATION detectado - usando handler especializado');
        const handled = handleGuidingInstallationOSReply(session, t, session.activeIntent, locale);
        if (handled) {
          reply = handled.reply;
          options = handled.options;
        }
      } else {
        // Comportamiento original para otros contextos
        reply = isEn
          ? 'I\'m not sure how to respond to that now. You can restart or write "Rephrase Problem".'
          : (locale === 'es-419'
            ? 'No estoy seguro cómo responder eso ahora. Puedes reiniciar o escribir "Reformular Problema".'
            : 'No estoy seguro cómo responder eso ahora. Podés reiniciar o escribir "Reformular Problema".');
        const reformBtn = isEn ? 'Rephrase Problem' : 'Reformular Problema';
        options = [reformBtn];
      }
    }

    // Save bot reply + persist transcripts to file (single ts pair)
    const pairTs = nowIso();
    session.transcript.push({ who: 'bot', text: reply, ts: pairTs, stage: session.stage });
    await saveSessionAndTranscript(sid, session);
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      const userLine = `[${pairTs}] USER: ${buttonToken ? '[BOTON] ' + buttonLabel : t}\n`;
      const botLine = `[${pairTs}] ASSISTANT: ${reply}\n`;
      fs.appendFile(tf, userLine, () => { });
      fs.appendFile(tf, botLine, () => { });
      
      // Guardar también en formato JSON para Codex y historial_chat
      const saveResult = saveTranscriptJSON(sid, session);
      if (!saveResult) {
        console.error('[TRANSCRIPT] ⚠️  saveTranscriptJSON returned false - check logs above');
      }
    } catch (e) { 
      console.error('[TRANSCRIPT] ❌ Error guardando transcript:', e.message);
      console.error('[TRANSCRIPT] Stack:', e.stack);
    }

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
    let session = null;
    try {
      const sid = req.sessionId;
      session = await getSession(sid);
      if (session && session.userLocale) {
        locale = session.userLocale;
      }
    } catch (errLocale) {
      // Si falla, usar el default
    }

    const isEn = String(locale).toLowerCase().startsWith('en');
    const errorMsg = isEn
      ? '😅 I had a momentary problem. Please try again.'
      : '😅 Tuve un problema momentáneo. Probá de nuevo.';
    
    // 🔥 CRÍTICO: Guardar mensaje de error en transcript para que aparezca en historial
    if (session && req.sessionId) {
      try {
        session.transcript = session.transcript || [];
        session.transcript.push({ who: 'bot', text: errorMsg, ts: nowIso() });
        await saveSessionAndTranscript(req.sessionId, session);
        console.log('[api/chat] ✅ Mensaje de error guardado en transcript:', req.sessionId);
      } catch (saveErr) {
        console.error('[api/chat] ⚠️ No se pudo guardar mensaje de error en transcript:', saveErr.message);
      }
    }
    
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
  const token = req.headers.authorization || req.query.token;

  // Optional authentication
  if (LOG_TOKEN && token !== LOG_TOKEN) {
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
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, async () => {
  console.log(`STI Chat (v7) started on ${PORT}`);
  console.log('[Logs] SSE available at /api/logs/stream (use token param if LOG_TOKEN set)');
  console.log('[Performance] Compression enabled (gzip/brotli)');
  console.log('[Performance] Session cache enabled (max 1000 sessions)');
  
  // ========================================
  // AUTO-LEARNING: Inicialización y Scheduler
  // ========================================
  if (process.env.AUTO_LEARNING_ENABLED === 'true') {
    try {
      const { runAutoLearningCycle, getAutoLearningStatus } = await import('./services/learningService.js');
      
      console.log('[AUTO-LEARNING] 🧠 Sistema de auto-evolución ACTIVADO');
      
      // Ejecutar al iniciar si está configurado
      const statusCheck = await getAutoLearningStatus();
      if (statusCheck.config?.autoRunOnStartup) {
        console.log('[AUTO-LEARNING] 🚀 Ejecutando ciclo inicial...');
        setTimeout(async () => {
          try {
            const result = await runAutoLearningCycle();
            if (result.ok && result.applied > 0) {
              console.log(`[AUTO-LEARNING] ✅ Ciclo inicial: ${result.applied} mejoras aplicadas`);
            } else if (result.noChanges) {
              console.log('[AUTO-LEARNING] ℹ️  Ciclo inicial: sin cambios para aplicar');
            }
          } catch (err) {
            console.error('[AUTO-LEARNING] ❌ Error en ciclo inicial:', err.message);
          }
        }, 30000); // 30 segundos después de iniciar
      }
      
      // Configurar scheduler periódico
      const intervalHours = parseInt(process.env.AUTO_LEARNING_INTERVAL_HOURS || '24', 10);
      const intervalMs = intervalHours * 60 * 60 * 1000;
      
      setInterval(async () => {
        console.log(`[AUTO-LEARNING] ⏰ Ejecutando ciclo programado (cada ${intervalHours}h)...`);
        try {
          const result = await runAutoLearningCycle();
          if (result.ok && result.applied > 0) {
            console.log(`[AUTO-LEARNING] ✅ Ciclo programado: ${result.applied} mejoras aplicadas`);
          } else if (result.noChanges) {
            console.log('[AUTO-LEARNING] ℹ️  Ciclo programado: sin cambios para aplicar');
          } else if (result.skipped) {
            console.log(`[AUTO-LEARNING] ⏭️  Ciclo saltado: ${result.reason}`);
          }
        } catch (err) {
          console.error('[AUTO-LEARNING] ❌ Error en ciclo programado:', err.message);
        }
      }, intervalMs);
      
      console.log(`[AUTO-LEARNING] ⏰ Scheduler configurado (intervalo: ${intervalHours}h)`);
      
    } catch (err) {
      console.error('[AUTO-LEARNING] ❌ Error al inicializar:', err.message);
    }
  } else {
    console.log('[AUTO-LEARNING] 📦 Sistema de auto-evolución DESACTIVADO');
  }
});

// PERFORMANCE: Enable HTTP keep-alive
server.keepAliveTimeout = 65000; // 65 segundos
server.headersTimeout = 66000; // Ligeramente mayor que keepAlive

// ========================================================
// ROBOT FIX - Sistema Automático de Corrección
// ========================================================
const ENABLE_ROBOT_FIX = process.env.ENABLE_ROBOT_FIX !== 'false'; // Habilitado por defecto

if (ENABLE_ROBOT_FIX) {
  console.log('[RobotFix] 🤖 Sistema de corrección automática ACTIVADO');
  
  // Ejecutar inmediatamente al iniciar (solo si hay problemas pendientes)
  setTimeout(async () => {
    try {
      const stats = await getRobotFixStats();
      if (stats && stats.pending > 0) {
        console.log(`[RobotFix] 🔍 Detectados ${stats.pending} problemas pendientes - ejecutando análisis inicial`);
        await runRobotFix();
      }
    } catch (error) {
      console.error('[RobotFix] Error en ejecución inicial:', error.message);
    }
  }, 30000); // Esperar 30 segundos después del inicio
  
  // Configurar ejecución automática cada 30 minutos
  // Cron: cada 30 minutos = '*/30 * * * *'
  cron.schedule('*/30 * * * *', async () => {
    console.log('[RobotFix] ⏰ Ejecución programada iniciada');
    try {
      const result = await runRobotFix();
      if (result.success) {
        console.log(`[RobotFix] ✅ Ejecución completada: ${result.resolved} resueltos, ${result.errors} errores`);
      } else {
        console.error(`[RobotFix] ❌ Error en ejecución: ${result.error}`);
      }
    } catch (error) {
      console.error('[RobotFix] ❌ Error crítico en ejecución programada:', error.message);
    }
  });
  
  console.log('[RobotFix] ⏰ Programado para ejecutarse cada 30 minutos');
  
  // Endpoint manual para ejecutar Robot Fix
  app.post('/api/robot-fix/run', async (req, res) => {
    const token = req.headers.authorization || req.query.token;
    
    // Verificar autenticación (usar LOG_TOKEN)
    if (LOG_TOKEN && token !== LOG_TOKEN) {
      return res.status(401).json({ ok: false, error: 'No autorizado' });
    }
    
    try {
      const result = await runRobotFix();
      return res.json({
        ok: true,
        success: result.success,
        processed: result.processed,
        resolved: result.resolved,
        errors: result.errors,
        duration: result.duration
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });
  
  // Endpoint para obtener estadísticas
  app.get('/api/robot-fix/stats', async (req, res) => {
    const token = req.headers.authorization || req.query.token;
    
    if (LOG_TOKEN && token !== LOG_TOKEN) {
      return res.status(401).json({ ok: false, error: 'No autorizado' });
    }
    
    try {
      const stats = await getRobotFixStats();
      return res.json({
        ok: true,
        stats
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });
  
} else {
  console.log('[RobotFix] 📦 Sistema de corrección automática DESACTIVADO');
}

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

