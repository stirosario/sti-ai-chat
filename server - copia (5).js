/**
 * server.js — STI Chat (v8) — Híbrido + Escalable
 * 
 * Server nuevo desde cero, modular y escalable:
 * - Flujo híbrido: FSM determinística + IA gobernada
 * - ID único AA0000-ZZ9999 para chat/ticket
 * - Guardado indefinido de conversaciones (JSONL)
 * - Botones por IA con excepciones
 * - Contrato de stages centralizado
 * - Logging turn-based para admin.php
 * - Respuestas adaptadas al nivel de usuario
 * 
 * Compatible con frontend y admin.php existentes.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';

// ========================================================
// CONFIGURACIÓN Y CONSTANTES
// ========================================================

const PORT = process.env.PORT || 3000;
const BUILD_ID = process.env.BUILD_ID || `build-${Date.now()}`;
const LOG_TOKEN = process.env.LOG_TOKEN || 'dev-token-change-in-production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim());

// Directorios
const DATA_BASE = process.env.DATA_BASE || path.join(process.cwd(), 'data');
const CONVERSATIONS_DIR = path.join(DATA_BASE, 'conversations');
const TICKETS_DIR = path.join(DATA_BASE, 'tickets');
const LOGS_DIR = path.join(DATA_BASE, 'logs');

// Asegurar directorios
[CONVERSATIONS_DIR, TICKETS_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// OpenAI
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ========================================================
// UTILIDADES
// ========================================================

function nowIso() {
  return new Date().toISOString();
}

function generateBuildId() {
  return `build-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

// ========================================================
// ID ÚNICO AA0000-ZZ9999
// ========================================================

const ID_REGISTRY_FILE = path.join(DATA_BASE, 'id-registry.json');
let idRegistry = { used: new Set() };

// Cargar registro de IDs usados
function loadIdRegistry() {
  try {
    if (fs.existsSync(ID_REGISTRY_FILE)) {
      const data = JSON.parse(fs.readFileSync(ID_REGISTRY_FILE, 'utf8'));
      idRegistry.used = new Set(data.used || []);
    }
  } catch (err) {
    console.warn('[ID Registry] Error loading, starting fresh:', err.message);
  }
}

// Guardar registro de IDs
function saveIdRegistry() {
  try {
    fs.writeFileSync(
      ID_REGISTRY_FILE,
      JSON.stringify({ used: Array.from(idRegistry.used) }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[ID Registry] Error saving:', err.message);
  }
}

// Generar ID único AA0000-ZZ9999 (sin Ñ)
function generateUniqueId() {
  const letters = 'ABCDEFGHIJKLMOPQRSTUVWXYZ'; // Sin Ñ
  const maxAttempts = 1000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const letter1 = letters[Math.floor(Math.random() * letters.length)];
    const letter2 = letters[Math.floor(Math.random() * letters.length)];
    const numbers = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const id = `${letter1}${letter2}${numbers}`;
    
    if (!idRegistry.used.has(id)) {
      idRegistry.used.add(id);
      saveIdRegistry();
      return id;
    }
  }
  
  // Si se agotan los IDs, extender a 3 letras (futuro)
  throw new Error('ID space exhausted. Consider extending to 3 letters + 4 numbers.');
}

// Verificar si un ID está disponible
function isIdAvailable(id) {
  return !idRegistry.used.has(id);
}

// Inicializar registro al arrancar
loadIdRegistry();

// ========================================================
// GUARDADO INDEFINIDO DE CONVERSACIONES (JSONL)
// ========================================================

function appendConversationTurn(turnData) {
  const { sessionId, ts } = turnData;
  const filePath = path.join(CONVERSATIONS_DIR, `${sessionId}.jsonl`);
  
  const line = JSON.stringify({
    ts,
    sessionId,
    stage_before: turnData.stage_before,
    stage_after: turnData.stage_after,
    user_event: turnData.user_event,
    bot_reply: turnData.bot_reply,
    buttons_shown: turnData.buttons_shown || [],
    reason: turnData.reason || 'user_interaction',
    violations: turnData.violations || [],
    diagnostic_step: turnData.diagnostic_step || null,
    metadata: turnData.metadata || {}
  }) + '\n';
  
  try {
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    console.error(`[Conversation] Error appending to ${sessionId}:`, err.message);
  }
}

// Cargar historial como memoria operativa
function loadConversationHistory(sessionId) {
  try {
    const filePath = path.join(CONVERSATIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (err) {
    console.error(`[Conversation] Error loading history for ${sessionId}:`, err.message);
    return [];
  }
}

// Obtener pasos de diagnóstico ya ejecutados (para no repetir)
function getExecutedDiagnosticSteps(history) {
  const steps = [];
  history.forEach(turn => {
    if (turn.diagnostic_step) {
      steps.push({
        step_id: turn.diagnostic_step.step_id,
        action: turn.diagnostic_step.action,
        step_number: turn.diagnostic_step.step_number,
        timestamp: turn.ts
      });
    }
  });
  return steps;
}

// ========================================================
// CONTRATO DE STAGES (FUENTE ÚNICA)
// ========================================================

const STAGE_CONTRACT = {
  ASK_LANGUAGE: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_LANG_ES_AR', 'BTN_LANG_EN'],
    defaultButtons: [
      { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español (Argentina)', order: 1 },
      { token: 'BTN_LANG_EN', label: '🇬🇧 English', order: 2 }
    ],
    prompt: {
      'es-AR': 'Seleccioná tu idioma para continuar.',
      'en-US': 'Select your language to continue.'
    }
  },
  ASK_NAME: {
    type: 'DETERMINISTIC',
    allowButtons: false,
    allowedTokens: [],
    defaultButtons: [],
    prompt: {
      'es-AR': '¿Con quién tengo el gusto de hablar?',
      'en-US': "What's your name?"
    }
  },
  ASK_USER_LEVEL: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_USER_LEVEL_BASIC', 'BTN_USER_LEVEL_INTERMEDIATE', 'BTN_USER_LEVEL_ADVANCED'],
    defaultButtons: [
      { token: 'BTN_USER_LEVEL_BASIC', label: 'Básico', order: 1 },
      { token: 'BTN_USER_LEVEL_INTERMEDIATE', label: 'Intermedio', order: 2 },
      { token: 'BTN_USER_LEVEL_ADVANCED', label: 'Avanzado', order: 3 }
    ],
    prompt: {
      'es-AR': 'Seleccioná tu nivel de conocimiento técnico:',
      'en-US': 'Select your technical knowledge level:'
    }
  },
  ASK_NEED: {
    type: 'AI_GOVERNED',
    allowButtons: false, // Pregunta abierta, sin botones de problemas típicos
    allowedTokens: [],
    defaultButtons: [],
    prompt: {
      'es-AR': '¿En qué puedo ayudarte hoy?',
      'en-US': 'What can I help you with today?'
    }
  },
  ASK_PROBLEM: {
    type: 'AI_GOVERNED',
    allowButtons: true,
    allowedTokens: ['BTN_BACK', 'BTN_CLOSE', 'BTN_CONNECT_TECH'],
    defaultButtons: [],
    prompt: {
      'es-AR': 'Describí el problema con el mayor detalle posible.',
      'en-US': 'Describe the problem in as much detail as possible.'
    }
  },
  BASIC_TESTS: {
    type: 'AI_GOVERNED',
    allowButtons: true,
    allowedTokens: ['BTN_SOLVED', 'BTN_PERSIST', 'BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE', 'BTN_BACK'],
    defaultButtons: [],
    prompt: {
      'es-AR': 'Te voy guiando paso a paso, avisame como sale.',
      'en-US': "I'll guide you step by step, let me know how it goes."
    }
  },
  ASK_DEVICE: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_DEVICE_DESKTOP', 'BTN_DEVICE_NOTEBOOK', 'BTN_DEVICE_ALLINONE'],
    defaultButtons: [
      { token: 'BTN_DEVICE_DESKTOP', label: 'PC de escritorio', order: 1 },
      { token: 'BTN_DEVICE_NOTEBOOK', label: 'Notebook', order: 2 },
      { token: 'BTN_DEVICE_ALLINONE', label: 'All In One', order: 3 }
    ],
    prompt: {
      'es-AR': '¿Qué tipo de dispositivo estás usando?',
      'en-US': 'What type of device are you using?'
    }
  },
  ASK_OS: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_OS_WINDOWS', 'BTN_OS_MACOS', 'BTN_OS_LINUX', 'BTN_OS_UNKNOWN'],
    defaultButtons: [
      { token: 'BTN_OS_WINDOWS', label: 'Windows', order: 1 },
      { token: 'BTN_OS_MACOS', label: 'macOS', order: 2 },
      { token: 'BTN_OS_LINUX', label: 'Linux', order: 3 },
      { token: 'BTN_OS_UNKNOWN', label: 'No lo sé', order: 4 }
    ],
    prompt: {
      'es-AR': '¿Qué sistema operativo estás usando?',
      'en-US': 'What operating system are you using?'
    }
  },
  DIAGNOSTIC_STEP: {
    type: 'AI_GOVERNED',
    allowButtons: true,
    allowedTokens: ['BTN_SOLVED', 'BTN_PERSIST', 'BTN_HELP_CONTEXT', 'BTN_BACK', 'BTN_CONNECT_TECH', 'BTN_PWR_NO_SIGNS', 'BTN_PWR_FANS', 'BTN_PWR_BEEPS', 'BTN_PWR_ON_OFF', 'BTN_STEP_DONE', 'BTN_STEP_STILL', 'BTN_STEP_HELP'],
    defaultButtons: [],
    prompt: {
      'es-AR': 'Siguiente paso de diagnóstico',
      'en-US': 'Next diagnostic step'
    }
  },
  FEEDBACK_REQUIRED: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_FEEDBACK_YES', 'BTN_FEEDBACK_NO'],
    defaultButtons: [
      { token: 'BTN_FEEDBACK_YES', label: '👍 Sí, me sirvió', order: 1 },
      { token: 'BTN_FEEDBACK_NO', label: '👎 No, no me sirvió', order: 2 }
    ],
    prompt: {
      'es-AR': '¿Te sirvió esta ayuda?',
      'en-US': 'Did this help you?'
    }
  },
  FEEDBACK_REASON: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_REASON_NOT_RESOLVED', 'BTN_REASON_HARD_TO_UNDERSTAND', 'BTN_REASON_TOO_MANY_STEPS', 'BTN_REASON_WANTED_TECH', 'BTN_REASON_OTHER'],
    defaultButtons: [
      { token: 'BTN_REASON_NOT_RESOLVED', label: 'No resolvió el problema', order: 1 },
      { token: 'BTN_REASON_HARD_TO_UNDERSTAND', label: 'Fue difícil de entender', order: 2 },
      { token: 'BTN_REASON_TOO_MANY_STEPS', label: 'Demasiados pasos', order: 3 },
      { token: 'BTN_REASON_WANTED_TECH', label: 'Prefería hablar con un técnico', order: 4 },
      { token: 'BTN_REASON_OTHER', label: 'Otro motivo', order: 5 }
    ],
    prompt: {
      'es-AR': '¿Cuál fue el motivo?',
      'en-US': 'What was the reason?'
    }
  },
  ENDED: {
    type: 'DETERMINISTIC',
    allowButtons: false,
    allowedTokens: [],
    defaultButtons: [],
    prompt: {
      'es-AR': 'Conversación finalizada',
      'en-US': 'Conversation ended'
    }
  }
};

// Catálogo de botones disponibles para IA
// NOTA: Los botones marcados como DEPRECATED no deben usarse en stages activos
// Se mantienen solo por compatibilidad legacy si es necesario
const BUTTON_CATALOG = {
  // DEPRECATED - NO USAR EN STAGES: Estos botones fueron reemplazados por el sistema híbrido
  // ASK_NEED ahora es pregunta abierta, OpenAI valida el problema desde texto
  'BTN_PROBLEMA': { label: { 'es-AR': 'Tengo un problema', 'en-US': 'I have a problem' }, deprecated: true },
  'BTN_CONSULTA': { label: { 'es-AR': 'Es una consulta', 'en-US': 'It\'s a question' }, deprecated: true },
  'BTN_NO_ENCIENDE': { label: { 'es-AR': 'No enciende', 'en-US': 'Won\'t turn on' }, deprecated: true },
  'BTN_NO_INTERNET': { label: { 'es-AR': 'Sin internet', 'en-US': 'No internet' }, deprecated: true },
  'BTN_LENTITUD': { label: { 'es-AR': 'Lentitud', 'en-US': 'Slowness' }, deprecated: true },
  'BTN_BLOQUEO': { label: { 'es-AR': 'Bloqueos', 'en-US': 'Freezes' }, deprecated: true },
  'BTN_PERIFERICOS': { label: { 'es-AR': 'Periféricos', 'en-US': 'Peripherals' }, deprecated: true },
  'BTN_VIRUS': { label: { 'es-AR': 'Virus o malware', 'en-US': 'Virus or malware' }, deprecated: true },
  'BTN_SOLVED': { label: { 'es-AR': 'Listo, se arregló', 'en-US': 'Done, it\'s fixed' } },
  'BTN_PERSIST': { label: { 'es-AR': 'Sigue igual', 'en-US': 'Still the same' } },
  'BTN_ADVANCED_TESTS': { label: { 'es-AR': 'Pruebas avanzadas', 'en-US': 'Advanced tests' } },
  'BTN_CONNECT_TECH': { label: { 'es-AR': 'Hablar con técnico', 'en-US': 'Talk to technician' } },
  'BTN_BACK': { label: { 'es-AR': 'Volver atrás', 'en-US': 'Go back' } },
  'BTN_CLOSE': { label: { 'es-AR': 'Cerrar chat', 'en-US': 'Close chat' } },
  // Nuevos botones para sistema híbrido
  'BTN_DEVICE_DESKTOP': { label: { 'es-AR': 'PC de escritorio', 'en-US': 'Desktop PC' } },
  'BTN_DEVICE_NOTEBOOK': { label: { 'es-AR': 'Notebook', 'en-US': 'Notebook' } },
  'BTN_DEVICE_ALLINONE': { label: { 'es-AR': 'All In One', 'en-US': 'All In One' } },
  'BTN_OS_WINDOWS': { label: { 'es-AR': 'Windows', 'en-US': 'Windows' } },
  'BTN_OS_MACOS': { label: { 'es-AR': 'macOS', 'en-US': 'macOS' } },
  'BTN_OS_LINUX': { label: { 'es-AR': 'Linux', 'en-US': 'Linux' } },
  'BTN_OS_UNKNOWN': { label: { 'es-AR': 'No lo sé', 'en-US': 'I don\'t know' } },
  'BTN_HELP_CONTEXT': { label: { 'es-AR': '¿Cómo hago esto?', 'en-US': 'How do I do this?' } },
  'BTN_FEEDBACK_YES': { label: { 'es-AR': '👍 Sí, me sirvió', 'en-US': '👍 Yes, it helped' } },
  'BTN_FEEDBACK_NO': { label: { 'es-AR': '👎 No, no me sirvió', 'en-US': '👎 No, it didn\'t help' } },
  'BTN_REASON_NOT_RESOLVED': { label: { 'es-AR': 'No resolvió el problema', 'en-US': 'Didn\'t resolve the problem' } },
  'BTN_REASON_HARD_TO_UNDERSTAND': { label: { 'es-AR': 'Fue difícil de entender', 'en-US': 'Hard to understand' } },
  'BTN_REASON_TOO_MANY_STEPS': { label: { 'es-AR': 'Demasiados pasos', 'en-US': 'Too many steps' } },
  'BTN_REASON_WANTED_TECH': { label: { 'es-AR': 'Prefería hablar con un técnico', 'en-US': 'Wanted to talk to a technician' } },
  'BTN_REASON_OTHER': { label: { 'es-AR': 'Otro motivo', 'en-US': 'Other reason' } },
  // Botones para diagnóstico de encendido (wont_turn_on)
  'BTN_PWR_NO_SIGNS': { label: { 'es-AR': 'No enciende nada (sin luces ni ventilador)', 'en-US': 'Nothing happens (no lights or fan)' } },
  'BTN_PWR_FANS': { label: { 'es-AR': 'Prenden luces o gira el ventilador', 'en-US': 'Lights turn on or fan spins' } },
  'BTN_PWR_BEEPS': { label: { 'es-AR': 'Escucho pitidos (beeps)', 'en-US': 'I hear beeps' } },
  'BTN_PWR_ON_OFF': { label: { 'es-AR': 'Enciende y se apaga enseguida', 'en-US': 'Turns on and off immediately' } },
  // Botones para pasos de diagnóstico
  'BTN_STEP_DONE': { label: { 'es-AR': 'Listo, probé esto', 'en-US': 'Done, I tried this' } },
  'BTN_STEP_STILL': { label: { 'es-AR': 'Sigue igual', 'en-US': 'Still the same' } },
  'BTN_STEP_HELP': { label: { 'es-AR': 'No puedo hacerlo / necesito ayuda', 'en-US': "I can't do this / I need help" } }
};

function getStageContract(stage) {
  return STAGE_CONTRACT[stage] || null;
}

// ========================================================
// SANEAMIENTO DE BOTONES
// ========================================================

function sanitizeButtonsForStage(stage, incomingButtons = []) {
  const contract = getStageContract(stage);
  if (!contract || !contract.allowButtons) {
    return [];
  }
  
  const allowed = new Set(contract.allowedTokens || []);
  const sanitized = [];
  
  // Normalizar formatos entrantes
  for (const btn of incomingButtons) {
    let token = null;
    let label = null;
    let order = sanitized.length + 1;
    
    if (typeof btn === 'string') {
      token = btn;
    } else if (btn.token) {
      token = btn.token;
      label = btn.label;
      order = btn.order || order;
    } else if (btn.value) {
      token = btn.value;
      label = btn.text || btn.label;
      order = btn.order || order;
    }
    
    if (token && allowed.has(token)) {
      sanitized.push({
        token,
        label: label || token,
        order
      });
    }
  }
  
  // Si es determinístico y quedó vacío, usar defaults
  if (contract.type === 'DETERMINISTIC' && sanitized.length === 0) {
    return contract.defaultButtons.map(btn => ({ ...btn }));
  }
  
  // Ordenar por order
  return sanitized.sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Convertir a formato legacy para frontend
function toLegacyButtons(buttons) {
  return buttons.map(btn => ({
    text: btn.label,
    value: btn.token,
    label: btn.label,
    order: btn.order
  }));
}

// ========================================================
// EXPRESS APP
// ========================================================

const app = express();

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Permitir inline scripts para widget
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    if (ALLOWED_ORIGINS.includes('*') || !origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy (necesario para Render y otros proxies reversos)
// Permite override por .env: TRUST_PROXY=1 (default en producción) o TRUST_PROXY=0 (local)
const trustProxy = process.env.TRUST_PROXY !== undefined ? parseInt(process.env.TRUST_PROXY) : 1;
app.set('trust proxy', trustProxy);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // 100 requests por ventana
});
app.use('/api/', limiter);

// ========================================================
// SESSION STORE (MEMORIA SIMPLE + PERSISTENCIA)
// ========================================================

const sessions = new Map();

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function saveSession(sessionId, session) {
  sessions.set(sessionId, { ...session, lastActivity: nowIso() });
}

// ========================================================
// IA GOBERNADA PARA BOTONES Y RESPUESTAS
// ========================================================

async function generateAIResponse(stage, session, userText, buttonToken) {
  if (!openai) {
    // Fallback sin IA
    const contract = getStageContract(stage);
    const locale = session.userLocale || 'es-AR';
    return {
      reply: contract?.prompt[locale] || contract?.prompt['es-AR'] || 'How can I help you?',
      buttons: []
    };
  }
  
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  const userLevel = session.userLevel || 'intermediate';
  
  // Construir contexto según nivel
  let levelContext = '';
  if (userLevel === 'basic') {
    levelContext = isEn
      ? 'The user is a BASIC level. Use simple language, step-by-step guidance, frequent confirmations. Avoid technical jargon.'
      : 'El usuario es nivel BÁSICO. Usá lenguaje simple, guía paso a paso, confirmaciones frecuentes. Evitá jerga técnica.';
  } else if (userLevel === 'advanced') {
    levelContext = isEn
      ? 'The user is ADVANCED level. Be technical, precise, less filler. Get straight to the point.'
      : 'El usuario es nivel AVANZADO. Sé técnico, preciso, menos relleno. Ve directo al grano.';
  } else {
    levelContext = isEn
      ? 'The user is INTERMEDIATE level. Use common technical terms, moderate detail.'
      : 'El usuario es nivel INTERMEDIO. Usá términos técnicos comunes, detalle moderado.';
  }
  
  // Obtener tokens permitidos para el stage
  const contract = getStageContract(stage);
  const allowedTokens = contract?.allowedTokens || [];
  const availableButtons = allowedTokens
    .map(token => {
      const catalog = BUTTON_CATALOG[token];
      if (!catalog) return null;
      return {
        token,
        label: catalog.label[locale] || catalog.label['es-AR']
      };
    })
    .filter(Boolean);
  
  const systemPrompt = isEn
    ? `You are Tecnos, a friendly IT technician for STI — Intelligent Technical Service. Answer ONLY in ${locale === 'en-US' ? 'English (US)' : 'Spanish (Argentina)'}.

${levelContext}

Rules:
- Suggest 2-4 buttons from the available catalog (never more than 4)
- Buttons must be relevant to the conversation context
- Never suggest buttons not in the allowed list
- Format buttons as: [{token: "BTN_XXX", label: "Label", order: 1}]

Available buttons: ${JSON.stringify(availableButtons.map(b => b.token))}`
    : `Sos Tecnos, técnico informático de STI — Servicio Técnico Inteligente. Respondé SOLO en ${locale === 'es-AR' ? 'español rioplatense (Argentina), usando voseo ("vos")' : 'español neutro latino, usando "tú"'}.

${levelContext}

Reglas:
- Sugerí 2-4 botones del catálogo disponible (nunca más de 4)
- Los botones deben ser relevantes al contexto de la conversación
- Nunca sugerir botones que no estén en la lista permitida
- Formato de botones: [{token: "BTN_XXX", label: "Etiqueta", order: 1}]

Botones disponibles: ${JSON.stringify(availableButtons.map(b => b.token))}`;
  
  const userMessage = buttonToken
    ? `User clicked button: ${buttonToken}`
    : `User said: ${userText}`;
  
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    const aiResponse = completion.choices[0]?.message?.content || '';
    
    // Extraer botones sugeridos (si la IA los incluye en formato JSON)
    let suggestedButtons = [];
    try {
      const buttonMatch = aiResponse.match(/\[.*?\]/s);
      if (buttonMatch) {
        suggestedButtons = JSON.parse(buttonMatch[0]);
      }
    } catch (e) {
      // Si no hay botones en formato JSON, la IA no los sugirió explícitamente
    }
    
    // ASK_NEED: pregunta abierta, SIEMPRE sin botones (incluso si la IA sugiere)
    if (stage === 'ASK_NEED') {
      return {
        reply: aiResponse.trim(),
        buttons: [] // Forzar array vacío para ASK_NEED
      };
    }
    
    return {
      reply: aiResponse.trim(),
      buttons: suggestedButtons
    };
  } catch (err) {
    console.error('[AI] Error:', err);
    // Fallback
    const contract = getStageContract(stage);
    return {
      reply: contract?.prompt[locale] || 'How can I help you?',
      buttons: []
    };
  }
}

// ========================================================
// HANDLERS DE STAGES DETERMINÍSTICOS
// ========================================================

async function handleAskLanguageStage(session, userText, buttonToken) {
  // BILINGÜE: Antes de elegir idioma, todo es bilingüe
  // EXCEPCIÓN: Botones Sí/No y Idioma siempre determinísticos
  
  // Si no hay consentimiento, pedirlo primero (BILINGÜE)
  if (!session.gdprConsent) {
    const consentText = '📋 **Privacy Policy and Consent / Política de Privacidad y Consentimiento**\n\nBefore continuing, I want to inform you: / Antes de continuar, quiero informarte:\n\n✅ I will store your name and our conversation for **48 hours** / Guardaré tu nombre y nuestra conversación durante **48 horas**\n✅ Data will be used **only to provide technical support** / Los datos se usarán **solo para brindarte soporte técnico**\n✅ You can request **deletion of your data** at any time / Podés solicitar **eliminación de tus datos** en cualquier momento\n✅ **We do not share** your information with third parties / **No compartimos** tu información con terceros\n✅ We comply with **GDPR and privacy regulations** / Cumplimos con **GDPR y normativas de privacidad**\n\n🔗 Full policy / Política completa: https://stia.com.ar/politica-privacidad.html\n\n**Do you accept these terms? / ¿Aceptás estos términos?**';
    
    if (buttonToken === 'si' || userText?.toLowerCase().includes('si') || userText?.toLowerCase().includes('yes') || userText?.toLowerCase().includes('acepto') || userText?.toLowerCase().includes('accept')) {
      session.gdprConsent = true;
      session.gdprConsentDate = nowIso();
      
      const reply = `🆔 **${session.id}**\n\nGracias por aceptar. / Thank you for accepting.\n\nSeleccioná tu idioma / Select your language:`;
      
      return {
        reply,
        stage: 'ASK_LANGUAGE',
        buttons: getStageContract('ASK_LANGUAGE').defaultButtons
      };
    }
    
    // EXCEPCIÓN: Botones Sí/No (siempre determinísticos, bilingües)
    return {
      reply: consentText,
      stage: 'ASK_LANGUAGE',
      buttons: [
        { token: 'si', label: 'Yes, I Accept ✔️ / Sí Acepto ✔️', order: 1 },
        { token: 'no', label: 'No, I Do Not Accept ❌ / No Acepto ❌', order: 2 }
      ]
    };
  }
  
  // EXCEPCIÓN: Botones de Idioma (siempre determinísticos)
  if (buttonToken === 'BTN_LANG_ES_AR' || userText?.toLowerCase().includes('español') || userText?.toLowerCase().includes('spanish')) {
    session.userLocale = 'es-AR';
    return {
      reply: '¡Perfecto! Vamos a continuar en Español. ¿Con quién tengo el gusto de hablar?',
      stage: 'ASK_NAME',
      buttons: []
    };
  }
  
  if (buttonToken === 'BTN_LANG_EN' || userText?.toLowerCase().includes('english') || userText?.toLowerCase().includes('inglés')) {
    session.userLocale = 'en-US';
    return {
      reply: "Great! Let's continue in English. What's your name?",
      stage: 'ASK_NAME',
      buttons: []
    };
  }
  
  // Retry (bilingüe hasta que elijan)
  const contract = getStageContract('ASK_LANGUAGE');
  return {
    reply: 'Por favor, seleccioná un idioma. / Please select a language.',
    stage: 'ASK_LANGUAGE',
    buttons: contract.defaultButtons
  };
}

async function handleAskNameStage(session, userText) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  // Extraer nombre simple
  const name = userText?.trim().split(/\s+/)[0];
  
  if (name && name.length >= 2 && name.length <= 30) {
    session.userName = name;
    return {
      reply: isEn
        ? `Nice to meet you, ${name}! Please select your technical knowledge level:`
        : `¡Encantado de conocerte, ${name}! Por favor, seleccioná tu nivel de conocimiento técnico:`,
      stage: 'ASK_USER_LEVEL',
      buttons: getStageContract('ASK_USER_LEVEL').defaultButtons
    };
  }
  
  const contract = getStageContract('ASK_NAME');
  return {
    reply: contract.prompt[locale] || contract.prompt['es-AR'],
    stage: 'ASK_NAME',
    buttons: []
  };
}

async function handleAskUserLevelStage(session, userText, buttonToken) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  if (buttonToken === 'BTN_USER_LEVEL_BASIC' || userText?.toLowerCase().includes('básico') || userText?.toLowerCase().includes('basic')) {
    session.userLevel = 'basic';
  } else if (buttonToken === 'BTN_USER_LEVEL_INTERMEDIATE' || userText?.toLowerCase().includes('intermedio') || userText?.toLowerCase().includes('intermediate')) {
    session.userLevel = 'intermediate';
  } else if (buttonToken === 'BTN_USER_LEVEL_ADVANCED' || userText?.toLowerCase().includes('avanzado') || userText?.toLowerCase().includes('advanced')) {
    session.userLevel = 'advanced';
  } else {
    const contract = getStageContract('ASK_USER_LEVEL');
    return {
      reply: contract.prompt[locale] || contract.prompt['es-AR'],
      stage: 'ASK_USER_LEVEL',
      buttons: contract.defaultButtons
    };
  }
  
  // Avanzar a ASK_NEED (pregunta abierta, sin botones)
  const levelLabel = isEn
    ? (session.userLevel === 'basic' ? 'basic' : session.userLevel === 'intermediate' ? 'intermediate' : 'advanced')
    : (session.userLevel === 'basic' ? 'básico' : session.userLevel === 'intermediate' ? 'intermedio' : 'avanzado');
  
  const contract = getStageContract('ASK_NEED');
  return {
    reply: isEn
      ? `Perfect! I'll adjust my explanations to your ${levelLabel} level. ${contract.prompt[locale]}`
      : `¡Perfecto! Voy a ajustar mis explicaciones a tu nivel ${levelLabel}. ${contract.prompt[locale]}`,
    stage: 'ASK_NEED',
    buttons: [] // Pregunta abierta, sin botones
  };
}

// Handler para pregunta abierta (ASK_NEED)
async function handleAskNeedStage(session, userText, sessionId) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  try {
    // Guardar la descripción del problema
    if (userText && userText.trim()) {
      session.problem_raw = userText.trim();
      console.log(`[ASK_NEED] [${sessionId}] Texto recibido: "${userText.trim().substring(0, 50)}...", guardado en problem_raw, avanzando a procesar`);
      
      // Inmediatamente procesar validación (esto puede tomar tiempo con OpenAI)
      // handleAskProblemStage manejará el timeout y fallback
      return await handleAskProblemStage(session, null, sessionId); // null porque ya está en problem_raw
    }
    
    // Si no hay texto, pedir descripción
    console.log(`[ASK_NEED] [${sessionId}] Sin texto, pidiendo descripción`);
    const contract = getStageContract('ASK_NEED');
    return {
      reply: contract.prompt[locale] || contract.prompt['es-AR'],
      stage: 'ASK_NEED',
      buttons: []
    };
  } catch (err) {
    console.error(`[ASK_NEED] [${sessionId}] Error en handler:`, err.message);
    // Fallback seguro: pedir dispositivo directamente
    const contract = getStageContract('ASK_DEVICE');
    return {
      reply: isEn
        ? 'I understand. To continue, please tell me what type of device you are using.'
        : 'Entiendo. Para seguir, decime qué tipo de equipo es.',
      stage: 'ASK_DEVICE',
      buttons: contract.defaultButtons
    };
  }
}

// Helper para timeout de promises
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Handler para validar descripción del problema con OpenAI
async function handleAskProblemStage(session, userText, sessionId) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  // Si ya tenemos problem_raw, validarlo con OpenAI
  const problemText = session.problem_raw || userText;
  
  if (!problemText || !problemText.trim()) {
    console.log(`[ASK_PROBLEM] [${sessionId}] Sin texto, pidiendo descripción`);
    return {
      reply: isEn
        ? 'Please describe your problem or what you need help with.'
        : 'Por favor, describí tu problema o en qué necesitás ayuda.',
      stage: 'ASK_PROBLEM',
      buttons: []
    };
  }
  
  console.log(`[ASK_PROBLEM] [${sessionId}] Procesando problema: "${problemText.substring(0, 50)}..."`);
  
  // Validar con OpenAI: detectar intent canónico y información faltante
  if (openai) {
    try {
      const systemPrompt = isEn
        ? `You are an IT support assistant. Analyze the user's problem description and return a JSON object with:
- valid: boolean (is this a valid technical problem?)
- intent: string (canonical intent like "wont_turn_on", "no_internet", "slow", "freezes", "peripherals", "virus", "general_question", etc.)
- missing_device: boolean (does the description lack device type info?)
- missing_os: boolean (does the description lack OS info? optional, only if really needed)
- needs_clarification: boolean (does the problem need more details?)

Return ONLY valid JSON, no other text.`
        : `Sos un asistente de soporte técnico. Analizá la descripción del problema del usuario y devolvé un objeto JSON con:
- valid: boolean (¿es un problema técnico válido?)
- intent: string (intent canónico como "wont_turn_on", "no_internet", "slow", "freezes", "peripherals", "virus", "general_question", etc.)
- missing_device: boolean (¿falta información del tipo de dispositivo?)
- missing_os: boolean (¿falta información del sistema operativo? opcional, solo si realmente se necesita)
- needs_clarification: boolean (¿el problema necesita más detalles?)

Devolvé SOLO JSON válido, sin otro texto.`;
      
      const openaiPromise = openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Problem description: ${problemText}` }
        ],
        temperature: 0.3,
        max_tokens: 200
      });
      
      console.log(`[ASK_PROBLEM] [${sessionId}] Llamando a OpenAI con timeout 12s`);
      const completion = await withTimeout(openaiPromise, 12000, 'OpenAI timeout');
      
      const analysisText = completion.choices[0]?.message?.content || '{}';
      let analysis;
      try {
        analysis = JSON.parse(analysisText.trim());
      } catch (parseErr) {
        console.error(`[ASK_PROBLEM] [${sessionId}] Error parseando JSON de OpenAI:`, parseErr);
        analysis = { missing_device: true }; // Fallback seguro
      }
      
      session.problem_validated = true;
      session.intent = analysis.intent || 'unknown'; // Guardar como intent (usado por DIAGNOSTIC_STEP)
      session.problem_intent = analysis.intent || 'unknown'; // Mantener por compatibilidad
      session.problem_needs_clarification = analysis.needs_clarification || false;
      
      // Resetear diagnostic cuando hay un problema nuevo
      session.diagnostic = null;
      
      console.log(`[ASK_PROBLEM] [${sessionId}] Análisis recibido:`, {
        intent: analysis.intent,
        missing_device: analysis.missing_device,
        missing_os: analysis.missing_os
      });
      
      // Si falta dispositivo, ir a ASK_DEVICE
      if (analysis.missing_device) {
        const contract = getStageContract('ASK_DEVICE');
        console.log(`[ASK_PROBLEM] [${sessionId}] Falta dispositivo, avanzando a ASK_DEVICE`);
        return {
          reply: isEn
            ? `I understand you're having: ${problemText}\n\nWhat type of device are you using?`
            : `Entiendo que tenés: ${problemText}\n\n¿Qué tipo de dispositivo estás usando?`,
          stage: 'ASK_DEVICE',
          buttons: contract.defaultButtons
        };
      }
      
      // Si no falta dispositivo, verificar si podemos inferirlo del texto
      if (!session.device_type || session.device_type === 'unknown') {
        const textLower = problemText.toLowerCase();
        if (textLower.includes('notebook') || textLower.includes('laptop') || textLower.includes('portátil')) {
          session.device_type = 'notebook';
          console.log(`[ASK_PROBLEM] [${sessionId}] Dispositivo inferido desde texto: notebook`);
        } else if (textLower.includes('desktop') || textLower.includes('escritorio') || textLower.includes('pc de escritorio')) {
          session.device_type = 'desktop';
          console.log(`[ASK_PROBLEM] [${sessionId}] Dispositivo inferido desde texto: desktop`);
        } else if (textLower.includes('all in one') || textLower.includes('all-in-one')) {
          session.device_type = 'allinone';
          console.log(`[ASK_PROBLEM] [${sessionId}] Dispositivo inferido desde texto: allinone`);
        }
      }
      
      // Si aún falta dispositivo, ir a ASK_DEVICE
      if (!session.device_type || session.device_type === 'unknown') {
        const contract = getStageContract('ASK_DEVICE');
        console.log(`[ASK_PROBLEM] [${sessionId}] Dispositivo aún desconocido, avanzando a ASK_DEVICE`);
        return {
          reply: isEn
            ? `I understand you're having: ${problemText}\n\nWhat type of device are you using?`
            : `Entiendo que tenés: ${problemText}\n\n¿Qué tipo de dispositivo estás usando?`,
          stage: 'ASK_DEVICE',
          buttons: contract.defaultButtons
        };
      }
      
      // Si tenemos dispositivo, avanzar a diagnóstico
      console.log(`[ASK_PROBLEM] [${sessionId}] Dispositivo: ${session.device_type}, avanzando a DIAGNOSTIC_STEP`);
      
      // Iniciar diagnóstico automáticamente: llamar al handler para generar el primer paso
      const diagnosticResult = await handleDiagnosticStepStage(session, '', null, sessionId);
      return diagnosticResult;
      
    } catch (err) {
      const isTimeout = err.message && err.message.includes('timeout');
      console.error(`[ASK_PROBLEM] [${sessionId}] Error OpenAI${isTimeout ? ' (TIMEOUT)' : ''}:`, err.message);
      
      // Fallback seguro: pedir dispositivo directamente
      session.problem_validated = true;
      session.intent = 'unknown'; // Guardar como intent
      session.problem_intent = 'unknown'; // Mantener por compatibilidad
      session.openai_failed = true;
      // Resetear diagnostic cuando hay un problema nuevo
      session.diagnostic = null;
      const contract = getStageContract('ASK_DEVICE');
      console.log(`[ASK_PROBLEM] [${sessionId}] Usando fallback: avanzando a ASK_DEVICE`);
      return {
        reply: isEn
          ? 'I understand. To continue, please tell me what type of device you are using.'
          : 'Entiendo. Para seguir, decime qué tipo de equipo es.',
        stage: 'ASK_DEVICE',
        buttons: contract.defaultButtons
      };
    }
  } else {
    // Sin OpenAI: pedir dispositivo directamente
    console.log(`[ASK_PROBLEM] [${sessionId}] OpenAI no disponible, pidiendo dispositivo directamente`);
    const contract = getStageContract('ASK_DEVICE');
    return {
      reply: isEn
        ? 'To continue, please tell me what type of device you are using.'
        : 'Para seguir, decime qué tipo de equipo es.',
      stage: 'ASK_DEVICE',
      buttons: contract.defaultButtons
    };
  }
}

// Handler para selección de dispositivo
async function handleAskDeviceStage(ctx) {
  // Validación estructural defensiva
  if (!ctx || !ctx.session) {
    console.error('[ASK_DEVICE] Error: ctx o ctx.session faltante');
    return {
      ok: false,
      error: 'missing_ctx',
      message: 'Context or session missing in handleAskDeviceStage'
    };
  }
  
  const { sessionId, session, userText, buttonToken } = ctx;
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  // Validación defensiva: si falta sessionId, usar fallback pero continuar
  const logSessionId = sessionId || 'unknown';
  
  let deviceType = null;
  
  if (buttonToken === 'BTN_DEVICE_DESKTOP') {
    deviceType = 'desktop';
  } else if (buttonToken === 'BTN_DEVICE_NOTEBOOK') {
    deviceType = 'notebook';
  } else if (buttonToken === 'BTN_DEVICE_ALLINONE') {
    deviceType = 'allinone';
  } else if (userText) {
    const text = userText.toLowerCase();
    if (text.includes('desktop') || text.includes('escritorio') || text.includes('pc')) {
      deviceType = 'desktop';
    } else if (text.includes('notebook') || text.includes('laptop')) {
      deviceType = 'notebook';
    } else if (text.includes('all in one') || text.includes('all-in-one')) {
      deviceType = 'allinone';
    }
  }
  
  if (deviceType) {
    session.device_type = deviceType;
    // Iniciar diagnóstico automáticamente: llamar al handler para generar el primer paso
    console.log(`[ASK_DEVICE] [${logSessionId}] Dispositivo seleccionado: ${deviceType}, avanzando a DIAGNOSTIC_STEP`);
    const diagnosticResult = await handleDiagnosticStepStage(session, '', null, sessionId);
    return diagnosticResult;
  }
  
  // Retry
  const contract = getStageContract('ASK_DEVICE');
  return {
    reply: contract.prompt[locale] || contract.prompt['es-AR'],
    stage: 'ASK_DEVICE',
    buttons: contract.defaultButtons
  };
}

// Handler para OS (opcional, solo cuando realmente se necesita)
async function handleAskOsStage(ctx) {
  // Validación estructural defensiva
  if (!ctx || !ctx.session) {
    console.error('[ASK_OS] Error: ctx o ctx.session faltante');
    return {
      ok: false,
      error: 'missing_ctx',
      message: 'Context or session missing in handleAskOsStage'
    };
  }
  
  const { sessionId, session, userText, buttonToken } = ctx;
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  // Validación defensiva: si falta sessionId, usar fallback pero continuar
  const logSessionId = sessionId || 'unknown';
  
  let osType = null;
  
  if (buttonToken === 'BTN_OS_WINDOWS') {
    osType = 'windows';
  } else if (buttonToken === 'BTN_OS_MACOS') {
    osType = 'macos';
  } else if (buttonToken === 'BTN_OS_LINUX') {
    osType = 'linux';
  } else if (buttonToken === 'BTN_OS_UNKNOWN') {
    osType = 'unknown';
  } else if (userText) {
    const text = userText.toLowerCase();
    if (text.includes('windows')) {
      osType = 'windows';
    } else if (text.includes('mac') || text.includes('macos')) {
      osType = 'macos';
    } else if (text.includes('linux')) {
      osType = 'linux';
    } else if (text.includes('no sé') || text.includes("don't know") || text.includes('unknown')) {
      osType = 'unknown';
    }
  }
  
  if (osType !== null) {
    session.os = osType;
    // Iniciar diagnóstico automáticamente: llamar al handler para generar el primer paso
    console.log(`[ASK_OS] [${logSessionId}] OS seleccionado: ${osType}, avanzando a DIAGNOSTIC_STEP`);
    const diagnosticResult = await handleDiagnosticStepStage(session, '', null, sessionId);
    return diagnosticResult;
  }
  
  // Retry
  const contract = getStageContract('ASK_OS');
  return {
    reply: contract.prompt[locale] || contract.prompt['es-AR'],
    stage: 'ASK_OS',
    buttons: contract.defaultButtons
  };
}

// Handler para diagnóstico paso a paso (motor real de pasos)
async function handleDiagnosticStepStage(session, userText, buttonToken, sessionId) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  const userLevel = session.userLevel || 'intermediate';
  const intent = session.intent || 'unknown';
  const deviceType = session.device_type || 'unknown';
  
  // GATE: No permitir DIAGNOSTIC_STEP sin device_type válido
  if (!session.device_type || session.device_type === 'unknown') {
    console.log(`[DIAGNOSTIC_STEP] [${sessionId}] ⚠️ device_type faltante o unknown, redirigiendo a ASK_DEVICE`);
    const contract = getStageContract('ASK_DEVICE');
    return {
      reply: isEn
        ? 'To help you better, I need to know what type of device you are using.'
        : 'Para ayudarte mejor, necesito saber qué tipo de dispositivo estás usando.',
      stage: 'ASK_DEVICE',
      buttons: contract.defaultButtons
    };
  }
  
  // Inicializar o resetear estado de diagnóstico
  const expectedPath = `${intent}:${deviceType}`;
  if (!session.diagnostic || session.diagnostic.path !== expectedPath) {
    // Resetear si es un problema nuevo o el path cambió
    session.diagnostic = {
      step: 1,
      path: expectedPath,
      data: {}
    };
    console.log(`[DIAGNOSTIC_STEP] [${sessionId}] Diagnostic inicializado/reseteado: path=${expectedPath}`);
  }
  
  const currentStep = session.diagnostic.step;
  const diagnosticPath = session.diagnostic.path;
  
  console.log(`[DIAGNOSTIC_STEP] [${sessionId}] step=${currentStep} path=${diagnosticPath} selected=${buttonToken || 'null'}`);
  
  // Manejar botones de resultado final
  if (buttonToken === 'BTN_SOLVED') {
    const contract = getStageContract('FEEDBACK_REQUIRED');
    return {
      reply: isEn
        ? 'Great! I\'m glad it worked. Did this help you?'
        : '¡Genial! Me alegra que haya funcionado. ¿Te sirvió esta ayuda?',
      stage: 'FEEDBACK_REQUIRED',
      buttons: contract.defaultButtons
    };
  }
  
  // Implementación de pasos para wont_turn_on + desktop (todos los niveles, filtrado por nivel dentro)
  if (intent === 'wont_turn_on' && deviceType === 'desktop') {
    // PASO 1: Pregunta inicial sobre síntomas de encendido
    if (currentStep === 1 && !buttonToken) {
      const buttons = [
        { token: 'BTN_PWR_NO_SIGNS', text: BUTTON_CATALOG['BTN_PWR_NO_SIGNS'].label[locale], label: BUTTON_CATALOG['BTN_PWR_NO_SIGNS'].label[locale], order: 1 },
        { token: 'BTN_PWR_FANS', text: BUTTON_CATALOG['BTN_PWR_FANS'].label[locale], label: BUTTON_CATALOG['BTN_PWR_FANS'].label[locale], order: 2 },
        { token: 'BTN_PWR_BEEPS', text: BUTTON_CATALOG['BTN_PWR_BEEPS'].label[locale], label: BUTTON_CATALOG['BTN_PWR_BEEPS'].label[locale], order: 3 },
        { token: 'BTN_PWR_ON_OFF', text: BUTTON_CATALOG['BTN_PWR_ON_OFF'].label[locale], label: BUTTON_CATALOG['BTN_PWR_ON_OFF'].label[locale], order: 4 }
      ];
      
      return {
        reply: isEn
          ? 'When you press the power button, what happens?'
          : 'Cuando apretás el botón de encendido, ¿qué pasa?',
        stage: 'DIAGNOSTIC_STEP',
        buttons
      };
    }
    
    // PASO 2: Ramificación según síntoma seleccionado
    if (currentStep === 1 && buttonToken && buttonToken.startsWith('BTN_PWR_')) {
      // Guardar selección
      session.diagnostic.data.power_symptom = buttonToken;
      session.diagnostic.step = 2;
      
      let reply = '';
      let buttons = [];
      
      if (buttonToken === 'BTN_PWR_NO_SIGNS') {
        // Sin señales: revisar alimentación/cable/fuente
        reply = isEn
          ? 'No signs of power usually means a problem with the power supply or cable. Let\'s check:\n\n1. Check if the power cable is properly connected to the PC and the wall outlet.\n2. Try a different power outlet.\n3. Check if the power supply switch (if it has one) is in the ON position.'
          : 'Sin señales de encendido suele ser un problema con la alimentación o el cable. Revisemos:\n\n1. Verificá que el cable de alimentación esté bien conectado a la PC y al enchufe.\n2. Probá con otro enchufe.\n3. Verificá si la fuente tiene un interruptor y que esté en ON.';
        
        buttons = [
          { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
          { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
          { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
        ];
      } else if (buttonToken === 'BTN_PWR_FANS' || buttonToken === 'BTN_PWR_BEEPS') {
        // Luces/ventilador o pitidos: revisar POST/RAM/monitor/cables
        // FILTRADO POR NIVEL: Solo usuarios AVANZADO pueden abrir el dispositivo
        if (userLevel === 'advanced') {
          reply = isEn
            ? 'Good, there\'s some power. Now let\'s check:\n\n1. Check if the monitor is on and connected.\n2. Check if the RAM memory modules are properly seated (if you feel comfortable opening the PC).\n3. Try disconnecting and reconnecting all cables.'
            : 'Bien, hay algo de energía. Ahora revisemos:\n\n1. Verificá que el monitor esté prendido y conectado.\n2. Verificá que los módulos de memoria RAM estén bien colocados (si te sentís cómodo abriendo la PC).\n3. Probá desconectar y volver a conectar todos los cables.';
        } else {
          // BÁSICO e INTERMEDIO: NO pueden abrir el dispositivo
          reply = isEn
            ? 'Good, there\'s some power. Now let\'s check:\n\n1. Check if the monitor is on and connected.\n2. Try disconnecting and reconnecting all external cables (HDMI, DisplayPort, VGA).\n3. Check if the monitor is set to the correct input source.'
            : 'Bien, hay algo de energía. Ahora revisemos:\n\n1. Verificá que el monitor esté prendido y conectado.\n2. Probá desconectar y volver a conectar todos los cables externos (HDMI, DisplayPort, VGA).\n3. Verificá que el monitor esté en la entrada correcta.';
        }
        
        buttons = [
          { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
          { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
          { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
        ];
      } else if (buttonToken === 'BTN_PWR_ON_OFF') {
        // Enciende y se apaga: revisar temperatura/sobrecarga
        reply = isEn
          ? 'If it turns on and off immediately, it could be overheating or a power issue. Let\'s check:\n\n1. Make sure the PC is not overheating (check if fans are working).\n2. Try disconnecting non-essential devices (USB, external drives).\n3. Check if the power supply is adequate for your components.'
          : 'Si enciende y se apaga enseguida, puede ser sobrecalentamiento o problema de alimentación. Revisemos:\n\n1. Asegurate de que la PC no se esté sobrecalentando (verificá que los ventiladores funcionen).\n2. Probá desconectar dispositivos no esenciales (USB, discos externos).\n3. Verificá que la fuente de alimentación sea adecuada para tus componentes.';
        
        buttons = [
          { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
          { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
          { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
        ];
      }
      
      return {
        reply,
        stage: 'DIAGNOSTIC_STEP',
        buttons
      };
    }
    
    // PASO 3+: Manejar botones de resultado de paso
    if (currentStep >= 2 && buttonToken && (buttonToken.startsWith('BTN_STEP_') || buttonToken === 'BTN_PERSIST')) {
      // Mapear BTN_STEP_STILL a BTN_PERSIST para unificación
      if (buttonToken === 'BTN_STEP_STILL') {
        buttonToken = 'BTN_PERSIST';
      }
      
      if (buttonToken === 'BTN_STEP_DONE') {
        // Usuario probó el paso, preguntar si se resolvió (no cerrar prematuramente)
        return {
          reply: isEn
            ? 'Did this solve the problem?'
            : '¿Esto resolvió el problema?',
          stage: 'DIAGNOSTIC_STEP',
          buttons: [
            { token: 'BTN_SOLVED', text: BUTTON_CATALOG['BTN_SOLVED'].label[locale], label: BUTTON_CATALOG['BTN_SOLVED'].label[locale], order: 1 },
            { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
            { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
          ]
        };
      } else if (buttonToken === 'BTN_PERSIST') {
        // Sigue igual, contar intentos y recomendar técnico si es necesario
        const stillCount = (session.diagnostic.data.still_count || 0) + 1;
        session.diagnostic.data.still_count = stillCount;
        
        if (stillCount >= 2) {
          const contract = getStageContract('FEEDBACK_REQUIRED');
          return {
            reply: isEn
              ? 'I understand the problem persists. I recommend talking to a technician for a more detailed diagnosis. Was this session helpful?'
              : 'Entiendo que el problema persiste. Te recomiendo hablar con un técnico para un diagnóstico más detallado. ¿Te sirvió esta ayuda?',
            stage: 'FEEDBACK_REQUIRED',
            buttons: contract.defaultButtons
          };
        }
        
        // Continuar con otro paso
        session.diagnostic.step = currentStep + 1;
        
        // FILTRADO POR NIVEL: Solo usuarios AVANZADO pueden abrir el dispositivo
        let nextStepReply = '';
        if (userLevel === 'advanced') {
          nextStepReply = isEn
            ? 'Let\'s try another approach. Check the power supply connections inside the PC (if you feel comfortable). Make sure all internal cables are properly connected. Do you feel comfortable opening the PC?'
            : 'Probemos otro enfoque. Revisá las conexiones de la fuente dentro de la PC (si te sentís cómodo). Asegurate de que todos los cables internos estén bien conectados. ¿Te sentís cómodo abriendo la PC?';
        } else {
          // BÁSICO e INTERMEDIO: NO pueden abrir el dispositivo
          nextStepReply = isEn
            ? 'Let\'s try another approach. Check if all external cables are properly connected. Try using a different power outlet or power strip. If the problem persists, I recommend talking to a technician.'
            : 'Probemos otro enfoque. Verificá que todos los cables externos estén bien conectados. Probá con otro enchufe o regleta. Si el problema persiste, te recomiendo hablar con un técnico.';
        }
        
        return {
          reply: nextStepReply,
          stage: 'DIAGNOSTIC_STEP',
          buttons: [
            { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
            { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
            { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
          ]
        };
      } else if (buttonToken === 'BTN_STEP_HELP') {
        // Usuario necesita ayuda, ofrecer técnico
        const contract = getStageContract('FEEDBACK_REQUIRED');
        return {
          reply: isEn
            ? 'I understand you need more help. I recommend talking to a technician. Was this session helpful?'
            : 'Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico. ¿Te sirvió esta ayuda?',
          stage: 'FEEDBACK_REQUIRED',
          buttons: contract.defaultButtons
        };
      }
    }
  }
  
  // Implementación de pasos para wont_turn_on + notebook (todos los niveles, filtrado por nivel dentro)
  if (intent === 'wont_turn_on' && deviceType === 'notebook') {
    // PASO 1: Pregunta inicial sobre síntomas de encendido (automático al entrar)
    if (currentStep === 1 && !buttonToken) {
      const buttons = [
        { token: 'BTN_PWR_NO_SIGNS', text: BUTTON_CATALOG['BTN_PWR_NO_SIGNS'].label[locale], label: BUTTON_CATALOG['BTN_PWR_NO_SIGNS'].label[locale], order: 1 },
        { token: 'BTN_PWR_FANS', text: BUTTON_CATALOG['BTN_PWR_FANS'].label[locale], label: BUTTON_CATALOG['BTN_PWR_FANS'].label[locale], order: 2 },
        { token: 'BTN_PWR_BEEPS', text: BUTTON_CATALOG['BTN_PWR_BEEPS'].label[locale], label: BUTTON_CATALOG['BTN_PWR_BEEPS'].label[locale], order: 3 },
        { token: 'BTN_PWR_ON_OFF', text: BUTTON_CATALOG['BTN_PWR_ON_OFF'].label[locale], label: BUTTON_CATALOG['BTN_PWR_ON_OFF'].label[locale], order: 4 }
      ];
      
      return {
        reply: isEn
          ? 'When you press the power button, what happens?'
          : 'Cuando apretás el botón de encendido, ¿qué pasa?',
        stage: 'DIAGNOSTIC_STEP',
        buttons
      };
    }
    
    // PASO 2: Ramificación según síntoma seleccionado (notebook)
    if (currentStep === 1 && buttonToken && buttonToken.startsWith('BTN_PWR_')) {
      // Guardar selección
      session.diagnostic.data.power_symptom = buttonToken;
      session.diagnostic.step = 2;
      
      let reply = '';
      let buttons = [];
      
      if (buttonToken === 'BTN_PWR_NO_SIGNS') {
        // Sin señales: revisar cargador, toma, LED de carga, batería
        reply = isEn
          ? 'No signs of power on a notebook usually means a problem with the charger or battery. Let\'s check:\n\n1. Check if the charger is properly connected to the notebook and the wall outlet.\n2. Try a different power outlet.\n3. Check if the charging LED lights up (if your notebook has one).\n4. Try removing the battery (if it\'s removable) and connecting only with the charger.'
          : 'Sin señales de encendido en una notebook suele ser un problema con el cargador o la batería. Revisemos:\n\n1. Verificá que el cargador esté bien conectado a la notebook y al enchufe.\n2. Probá con otro enchufe.\n3. Verificá si el LED de carga se prende (si tu notebook tiene uno).\n4. Probá sacar la batería (si es removible) y conectar solo con el cargador.';
        
        buttons = [
          { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
          { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
          { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
        ];
      } else if (buttonToken === 'BTN_PWR_FANS' || buttonToken === 'BTN_PWR_BEEPS') {
        // Luces/ventilador o pitidos: revisar periféricos, pantalla, hard reset
        reply = isEn
          ? 'Good, there\'s some power. Now let\'s check:\n\n1. Disconnect all external devices (USB, mouse, external monitor, etc.).\n2. Check if the screen shows anything (even if it\'s black, check for backlight).\n3. Try a hard reset: hold the power button for 15 seconds, then release and press it again.'
          : 'Bien, hay algo de energía. Ahora revisemos:\n\n1. Desconectá todos los dispositivos externos (USB, mouse, monitor externo, etc.).\n2. Verificá si la pantalla muestra algo (aunque sea negro, verificá si hay retroiluminación).\n3. Probá un hard reset: mantené presionado el botón de encendido durante 15 segundos, soltalo y volvé a presionarlo.';
        
        buttons = [
          { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
          { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
          { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
        ];
      } else if (buttonToken === 'BTN_PWR_ON_OFF') {
        // Enciende y se apaga: revisar sobrecalentamiento, cargador, cortos
        reply = isEn
          ? 'If it turns on and off immediately, it could be overheating, a charger issue, or a short circuit. Let\'s check:\n\n1. Make sure the notebook is not overheating (check if the fan is working and if the vents are clear).\n2. Try a different charger if you have one available.\n3. Check if there are any visible signs of damage or liquid spills.'
          : 'Si enciende y se apaga enseguida, puede ser sobrecalentamiento, problema con el cargador o un cortocircuito. Revisemos:\n\n1. Asegurate de que la notebook no se esté sobrecalentando (verificá que el ventilador funcione y que las rejillas estén despejadas).\n2. Probá con otro cargador si tenés uno disponible.\n3. Verificá si hay signos visibles de daño o derrames de líquido.';
        
        buttons = [
          { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
          { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
          { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
        ];
      }
      
      return {
        reply,
        stage: 'DIAGNOSTIC_STEP',
        buttons
      };
    }
    
    // PASO 3+: Manejar botones de resultado de paso (notebook)
    if (currentStep >= 2 && buttonToken && (buttonToken.startsWith('BTN_STEP_') || buttonToken === 'BTN_PERSIST')) {
      // Mapear BTN_STEP_STILL a BTN_PERSIST para unificación
      if (buttonToken === 'BTN_STEP_STILL') {
        buttonToken = 'BTN_PERSIST';
      }
      
      if (buttonToken === 'BTN_STEP_DONE') {
        // Usuario probó el paso, preguntar si se resolvió (no cerrar prematuramente)
        return {
          reply: isEn
            ? 'Did this solve the problem?'
            : '¿Esto resolvió el problema?',
          stage: 'DIAGNOSTIC_STEP',
          buttons: [
            { token: 'BTN_SOLVED', text: BUTTON_CATALOG['BTN_SOLVED'].label[locale], label: BUTTON_CATALOG['BTN_SOLVED'].label[locale], order: 1 },
            { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
            { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
          ]
        };
      } else if (buttonToken === 'BTN_PERSIST') {
        // Sigue igual, contar intentos y recomendar técnico si es necesario
        const stillCount = (session.diagnostic.data.still_count || 0) + 1;
        session.diagnostic.data.still_count = stillCount;
        
        if (stillCount >= 2) {
          const contract = getStageContract('FEEDBACK_REQUIRED');
          return {
            reply: isEn
              ? 'I understand the problem persists. I recommend talking to a technician for a more detailed diagnosis. Was this session helpful?'
              : 'Entiendo que el problema persiste. Te recomiendo hablar con un técnico para un diagnóstico más detallado. ¿Te sirvió esta ayuda?',
            stage: 'FEEDBACK_REQUIRED',
            buttons: contract.defaultButtons
          };
        }
        
        // Continuar con otro paso
        session.diagnostic.step = currentStep + 1;
        
        // FILTRADO POR NIVEL: Solo usuarios AVANZADO pueden abrir el dispositivo
        let nextStepReply = '';
        if (userLevel === 'advanced') {
          nextStepReply = isEn
            ? 'Let\'s try another approach. Check the internal connections and try resetting the BIOS/CMOS (if you feel comfortable). You can also try connecting an external monitor to see if the problem is with the screen. Do you feel comfortable opening the notebook?'
            : 'Probemos otro enfoque. Revisá las conexiones internas y probá resetear la BIOS/CMOS (si te sentís cómodo). También podés probar conectar un monitor externo para ver si el problema es con la pantalla. ¿Te sentís cómodo abriendo la notebook?';
        } else {
          // BÁSICO e INTERMEDIO: NO pueden abrir el dispositivo
          nextStepReply = isEn
            ? 'Let\'s try another approach. Check if all external cables are properly connected. Try using a different power outlet or power strip. You can also try connecting an external monitor to see if the problem is with the screen. If the problem persists, I recommend talking to a technician.'
            : 'Probemos otro enfoque. Verificá que todos los cables externos estén bien conectados. Probá con otro enchufe o regleta. También podés probar conectar un monitor externo para ver si el problema es con la pantalla. Si el problema persiste, te recomiendo hablar con un técnico.';
        }
        
        return {
          reply: nextStepReply,
          stage: 'DIAGNOSTIC_STEP',
          buttons: [
            { token: 'BTN_STEP_DONE', text: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], label: BUTTON_CATALOG['BTN_STEP_DONE'].label[locale], order: 1 },
            { token: 'BTN_PERSIST', text: BUTTON_CATALOG['BTN_PERSIST'].label[locale], label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
            { token: 'BTN_STEP_HELP', text: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], label: BUTTON_CATALOG['BTN_STEP_HELP'].label[locale], order: 3 }
          ]
        };
      } else if (buttonToken === 'BTN_STEP_HELP') {
        // Usuario necesita ayuda, ofrecer técnico
        const contract = getStageContract('FEEDBACK_REQUIRED');
        return {
          reply: isEn
            ? 'I understand you need more help. I recommend talking to a technician. Was this session helpful?'
            : 'Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico. ¿Te sirvió esta ayuda?',
          stage: 'FEEDBACK_REQUIRED',
          buttons: contract.defaultButtons
        };
      }
    }
  }
  
  // Fallback para otros intents/device_types/user_levels (por ahora)
  return {
    reply: isEn
      ? 'I\'m working on expanding diagnostic support for this type of problem. For now, I recommend talking to a technician.'
      : 'Estoy trabajando en expandir el soporte de diagnóstico para este tipo de problema. Por ahora, te recomiendo hablar con un técnico.',
    stage: 'DIAGNOSTIC_STEP',
    buttons: [
      { token: 'BTN_CONNECT_TECH', label: BUTTON_CATALOG['BTN_CONNECT_TECH'].label[locale], order: 1 }
    ]
  };
}

// Handler para feedback obligatorio
async function handleFeedbackRequiredStage(session, userText, buttonToken) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  if (buttonToken === 'BTN_FEEDBACK_YES') {
    session.feedback = 'positive';
    session.feedback_reason = null;
    // Cerrar chat con resultado positivo
    return {
      reply: isEn
        ? 'Thank you! Have a great day!'
        : '¡Gracias! ¡Que tengas un buen día!',
      stage: 'ENDED',
      buttons: []
    };
  }
  
  if (buttonToken === 'BTN_FEEDBACK_NO') {
    // Preguntar motivo
    const contract = getStageContract('FEEDBACK_REASON');
    return {
      reply: contract.prompt[locale] || contract.prompt['es-AR'],
      stage: 'FEEDBACK_REASON',
      buttons: contract.defaultButtons
    };
  }
  
  // Retry
  const contract = getStageContract('FEEDBACK_REQUIRED');
  return {
    reply: contract.prompt[locale] || contract.prompt['es-AR'],
    stage: 'FEEDBACK_REQUIRED',
    buttons: contract.defaultButtons
  };
}

// Handler para motivo del feedback negativo
async function handleFeedbackReasonStage(session, userText, buttonToken) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  
  let reason = null;
  
  if (buttonToken === 'BTN_REASON_NOT_RESOLVED') {
    reason = 'not_resolved';
  } else if (buttonToken === 'BTN_REASON_HARD_TO_UNDERSTAND') {
    reason = 'hard_to_understand';
  } else if (buttonToken === 'BTN_REASON_TOO_MANY_STEPS') {
    reason = 'too_many_steps';
  } else if (buttonToken === 'BTN_REASON_WANTED_TECH') {
    reason = 'wanted_tech';
  } else if (buttonToken === 'BTN_REASON_OTHER') {
    reason = 'other';
  }
  
  if (reason) {
    session.feedback = 'negative';
    session.feedback_reason = reason;
    // Cerrar chat con resultado negativo
    return {
      reply: isEn
        ? 'Thank you for your feedback. I\'ll work on improving. Have a great day!'
        : 'Gracias por tu feedback. Voy a trabajar en mejorar. ¡Que tengas un buen día!',
      stage: 'ENDED',
      buttons: []
    };
  }
  
  // Retry
  const contract = getStageContract('FEEDBACK_REASON');
  return {
    reply: contract.prompt[locale] || contract.prompt['es-AR'],
    stage: 'FEEDBACK_REASON',
    buttons: contract.defaultButtons
  };
}

// ========================================================
// ENDPOINTS
// ========================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', buildId: BUILD_ID });
});

// Greeting (crear sesión inicial)
app.all('/api/greeting', async (req, res) => {
  try {
    const sessionId = generateUniqueId();
    const csrfToken = crypto.randomBytes(32).toString('hex');
    
    const session = {
      id: sessionId,
      stage: 'ASK_LANGUAGE',
      userLocale: null,
      userName: null,
      userLevel: null,
      gdprConsent: false,
      csrfToken,
      createdAt: nowIso()
    };
    
    saveSession(sessionId, session);
    
    const greeting = {
      ok: true,
      greeting: '📋 **Privacy Policy and Consent / Política de Privacidad y Consentimiento**\n\nBefore continuing, I want to inform you: / Antes de continuar, quiero informarte:\n\n✅ I will store your name and our conversation for **48 hours** / Guardaré tu nombre y nuestra conversación durante **48 horas**\n✅ Data will be used **only to provide technical support** / Los datos se usarán **solo para brindarte soporte técnico**\n✅ You can request **deletion of your data** at any time / Podés solicitar **eliminación de tus datos** en cualquier momento\n✅ **We do not share** your information with third parties / **No compartimos** tu información con terceros\n✅ We comply with **GDPR and privacy regulations** / Cumplimos con **GDPR y normativas de privacidad**\n\n🔗 Full policy / Política completa: https://stia.com.ar/politica-privacidad.html\n\n**Do you accept these terms? / ¿Aceptás estos términos?**',
      reply: '📋 **Privacy Policy and Consent / Política de Privacidad y Consentimiento**\n\nBefore continuing, I want to inform you: / Antes de continuar, quiero informarte:\n\n✅ I will store your name and our conversation for **48 hours** / Guardaré tu nombre y nuestra conversación durante **48 horas**\n✅ Data will be used **only to provide technical support** / Los datos se usarán **solo para brindarte soporte técnico**\n✅ You can request **deletion of your data** at any time / Podés solicitar **eliminación de tus datos** en cualquier momento\n✅ **We do not share** your information with third parties / **No compartimos** tu información con terceros\n✅ We comply with **GDPR and privacy regulations** / Cumplimos con **GDPR y normativas de privacidad**\n\n🔗 Full policy / Política completa: https://stia.com.ar/politica-privacidad.html\n\n**Do you accept these terms? / ¿Aceptás estos términos?**',
      stage: 'ASK_LANGUAGE',
      sessionId,
      csrfToken,
      buttons: [
        { text: 'Yes, I Accept ✔️ / Sí Acepto ✔️', value: 'si', order: 1 },
        { text: 'No, I Do Not Accept ❌ / No Acepto ❌', value: 'no', order: 2 }
      ],
      options: [],
      ui: [],
      buildId: BUILD_ID
    };
    
    res.set('X-STI-BUILD', BUILD_ID);
    res.json(greeting);
  } catch (err) {
    console.error('[Greeting] Error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// Chat principal
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  let session = null;
  let turnLog = {
    ts: nowIso(),
    sessionId: null,
    stage_before: null,
    stage_after: null,
    user_event: null,
    bot_reply: null,
    buttons_shown: [],
    reason: 'user_interaction',
    violations: []
  };
  
  try {
    const { sessionId, text, action, value, label, csrfToken } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId required' });
    }
    
    // Cargar sesión
    session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }
    
    // Validar CSRF si aplica
    if (csrfToken && session.csrfToken !== csrfToken) {
      return res.status(403).json({ ok: false, error: 'Invalid CSRF token' });
    }
    
    turnLog.sessionId = sessionId;
    turnLog.stage_before = session.stage;
    
    const userText = action === 'button' ? null : text;
    const buttonToken = action === 'button' ? value : null;
    
    turnLog.user_event = buttonToken ? `[BTN] ${buttonToken}` : userText;
    
    // Procesar según stage
    let result = null;
    
    // EXCEPCIÓN 1: Stages determinísticos (Siempre usan sus botones por defecto, nunca IA)
    if (session.stage === 'ASK_LANGUAGE') {
      result = await handleAskLanguageStage(session, userText, buttonToken);
      // Forzar botones del contrato si es determinístico
      const contract = getStageContract('ASK_LANGUAGE');
      if (contract?.type === 'DETERMINISTIC' && (!result.buttons || result.buttons.length === 0)) {
        result.buttons = contract.defaultButtons;
      }
    } else if (session.stage === 'ASK_NAME') {
      result = await handleAskNameStage(session, userText);
      // ASK_NAME nunca tiene botones
      result.buttons = [];
    } else if (session.stage === 'ASK_USER_LEVEL') {
      result = await handleAskUserLevelStage(session, userText, buttonToken);
      // Forzar botones del contrato si es determinístico
      const contract = getStageContract('ASK_USER_LEVEL');
      if (contract?.type === 'DETERMINISTIC' && (!result.buttons || result.buttons.length === 0)) {
        result.buttons = contract.defaultButtons;
      }
    } else if (session.stage === 'ASK_NEED') {
      console.log(`[CHAT] [${sessionId}] Procesando ASK_NEED con texto: "${userText?.substring(0, 50) || 'null'}..."`);
      try {
        result = await handleAskNeedStage(session, userText, sessionId);
      } catch (err) {
        console.error(`[CHAT] [${sessionId}] Error en handleAskNeedStage:`, err);
        // Fallback absoluto
        const contract = getStageContract('ASK_DEVICE');
        result = {
          reply: session.userLocale?.startsWith('en')
            ? 'I understand. To continue, please tell me what type of device you are using.'
            : 'Entiendo. Para seguir, decime qué tipo de equipo es.',
          stage: 'ASK_DEVICE',
          buttons: contract.defaultButtons
        };
      }
    } else if (session.stage === 'ASK_PROBLEM') {
      console.log(`[CHAT] [${sessionId}] Procesando ASK_PROBLEM`);
      try {
        result = await handleAskProblemStage(session, userText, sessionId);
      } catch (err) {
        console.error(`[CHAT] [${sessionId}] Error en handleAskProblemStage:`, err);
        // Fallback absoluto
        const contract = getStageContract('ASK_DEVICE');
        result = {
          reply: session.userLocale?.startsWith('en')
            ? 'I understand. To continue, please tell me what type of device you are using.'
            : 'Entiendo. Para seguir, decime qué tipo de equipo es.',
          stage: 'ASK_DEVICE',
          buttons: contract.defaultButtons
        };
      }
    } else if (session.stage === 'ASK_DEVICE') {
      console.log(`[CHAT] [${sessionId}] Procesando ASK_DEVICE`);
      result = await handleAskDeviceStage({ sessionId, session, userText, buttonToken });
      // Si el handler retorna error estructurado, propagarlo
      if (result && result.ok === false) {
        console.error(`[CHAT] [${sessionId}] Error estructurado de handleAskDeviceStage:`, result.error);
        return res.status(500).json({ ok: false, error: result.error, message: result.message });
      }
    } else if (session.stage === 'ASK_OS') {
      console.log(`[CHAT] [${sessionId}] Procesando ASK_OS`);
      result = await handleAskOsStage({ sessionId, session, userText, buttonToken });
      // Si el handler retorna error estructurado, propagarlo
      if (result && result.ok === false) {
        console.error(`[CHAT] [${sessionId}] Error estructurado de handleAskOsStage:`, result.error);
        return res.status(500).json({ ok: false, error: result.error, message: result.message });
      }
    } else if (session.stage === 'DIAGNOSTIC_STEP') {
      console.log(`[CHAT] [${sessionId}] Procesando DIAGNOSTIC_STEP`);
      try {
        result = await handleDiagnosticStepStage(session, userText, buttonToken, sessionId);
      } catch (err) {
        console.error(`[CHAT] [${sessionId}] Error en handleDiagnosticStepStage:`, err);
        // Fallback absoluto
        result = {
          reply: session.userLocale?.startsWith('en')
            ? 'I need more information. Could you describe the problem again?'
            : 'Necesito más información. ¿Podrías describir el problema nuevamente?',
          stage: 'DIAGNOSTIC_STEP',
          buttons: []
        };
      }
    } else if (session.stage === 'FEEDBACK_REQUIRED') {
      result = await handleFeedbackRequiredStage(session, userText, buttonToken);
    } else if (session.stage === 'FEEDBACK_REASON') {
      result = await handleFeedbackReasonStage(session, userText, buttonToken);
    } else if (session.stage === 'BASIC_TESTS') {
      // Mantener compatibilidad con BASIC_TESTS legacy
      const aiResult = await generateAIResponse(session.stage, session, userText, buttonToken);
      result = {
        reply: aiResult.reply,
        stage: session.stage,
        buttons: aiResult.buttons || []
      };
    } else {
      result = {
        reply: 'Unknown stage',
        stage: session.stage,
        buttons: []
      };
    }
    
    // Actualizar sesión
    session.stage = result.stage;
    saveSession(sessionId, session);
    
    // Saneamiento de botones (CRÍTICO: Filtra y normaliza)
    // NUNCA heredar botones del turno anterior
    const sanitizedButtons = sanitizeButtonsForStage(result.stage, result.buttons || []);
    
    // Obtener contrato del stage para validar
    const contract = getStageContract(result.stage);
    
    // Si el stage no permite botones (allowButtons: false), forzar array vacío
    // Esto protege especialmente ASK_NEED que debe ser pregunta abierta
    let finalButtons;
    if (contract && contract.allowButtons === false) {
      finalButtons = [];
    } else if (contract?.type === 'DETERMINISTIC' && sanitizedButtons.length === 0) {
      // Si es determinístico y quedó vacío después del saneamiento, usar defaults
      finalButtons = contract.defaultButtons || [];
    } else {
      finalButtons = sanitizedButtons;
    }
    
    const legacyButtons = toLegacyButtons(finalButtons);
    
    turnLog.stage_after = result.stage;
    
    // NUNCA permitir reply vacío - validación crítica
    if (!result.reply || result.reply.trim() === '') {
      console.warn(`[CHAT] [${sessionId}] ⚠️ Reply vacío detectado, usando fallback`);
      const locale = session.userLocale || 'es-AR';
      const isEn = locale.startsWith('en');
      result.reply = isEn
        ? 'I understand. Let me help you with that.'
        : 'Entiendo. Déjame ayudarte con eso.';
    }
    
    turnLog.bot_reply = result.reply;
    turnLog.buttons_shown = finalButtons; // Guardar formato interno {token, label, order}
    
    // Log final del turno
    console.log(`[CHAT] [${sessionId}] ✅ Turno completado: ${turnLog.stage_before} → ${turnLog.stage_after}, reply length: ${turnLog.bot_reply.length}`);
    
    // Guardar metadata del diagnóstico si existe
    if (result.diagnostic_step) {
      turnLog.diagnostic_step = result.diagnostic_step;
    }
    
    // Si el stage es ENDED, guardar evento final con metadata completa
    if (result.stage === 'ENDED') {
      turnLog.metadata = {
        result: session.feedback || 'unknown',
        feedback_reason: session.feedback_reason || null,
        problem: session.problem_raw || null,
        device_type: session.device_type || null,
        os: session.os || null,
        user_level: session.userLevel || null,
        diagnostic_steps_count: getExecutedDiagnosticSteps(loadConversationHistory(sessionId)).length,
        ended_at: nowIso()
      };
    }
    
    // Guardar turno en conversación
    appendConversationTurn(turnLog);
    
    // Respuesta al frontend
    const response = {
      ok: true,
      reply: result.reply,
      stage: result.stage,
      sessionId,
      csrfToken: session.csrfToken,
      buttons: legacyButtons,
      options: legacyButtons, // Legacy mirror
      ui: legacyButtons, // Legacy mirror
      buildId: BUILD_ID
    };
    
    res.set('X-STI-BUILD', BUILD_ID);
    res.json(response);
    
  } catch (err) {
    console.error('[Chat] Error:', err);
    
    if (session) {
      turnLog.bot_reply = 'Error processing request';
      turnLog.reason = 'error';
      appendConversationTurn(turnLog);
    }
    
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
      buildId: BUILD_ID
    });
  }
});

// Historial para admin.php
app.get('/api/historial/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (token !== LOG_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  
  try {
    const filePath = path.join(CONVERSATIONS_DIR, `${sessionId}.jsonl`);
    
    if (!fs.existsSync(filePath)) {
      return res.json({ ok: true, sessionId, turns: [] });
    }
    
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    const turns = lines.map(line => JSON.parse(line));
    
    res.json({ ok: true, sessionId, turns });
  } catch (err) {
    console.error('[Historial] Error:', err);
    res.status(500).json({ ok: false, error: 'Error reading history' });
  }
});

// Reset (si el widget lo llama)
app.post('/api/reset', (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    sessions.delete(sessionId);
  }
  
  res.json({ ok: true, message: 'Session reset' });
});

// ========================================================
// SERVER START
// ========================================================

app.listen(PORT, () => {
  console.log(`🚀 STI Chat Server v8 (Híbrido + Escalable)`);
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🏗️  Build ID: ${BUILD_ID}`);
  console.log(`📁 Conversations: ${CONVERSATIONS_DIR}`);
  console.log(`🆔 ID Registry: ${idRegistry.used.size} IDs used`);
});
