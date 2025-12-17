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
    allowedTokens: ['BTN_SOLVED', 'BTN_PERSIST', 'BTN_HELP_CONTEXT', 'BTN_BACK', 'BTN_CONNECT_TECH'],
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
  'BTN_REASON_OTHER': { label: { 'es-AR': 'Otro motivo', 'en-US': 'Other reason' } }
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
      session.problem_intent = analysis.intent || 'unknown';
      session.problem_needs_clarification = analysis.needs_clarification || false;
      
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
      
      // Si no falta dispositivo, avanzar a diagnóstico
      // El siguiente turno generará automáticamente el primer paso cuando el usuario responda
      session.device_type = session.device_type || 'unknown';
      console.log(`[ASK_PROBLEM] [${sessionId}] No falta dispositivo, avanzando a DIAGNOSTIC_STEP`);
      
      // Retornar mensaje de confirmación - el siguiente turno generará el primer paso
      return {
        reply: isEn
          ? `I understand your problem: ${problemText}. Let me guide you through the solution step by step.`
          : `Entiendo tu problema: ${problemText}. Déjame guiarte paso a paso para solucionarlo.`,
        stage: 'DIAGNOSTIC_STEP',
        buttons: []
      };
      
    } catch (err) {
      const isTimeout = err.message && err.message.includes('timeout');
      console.error(`[ASK_PROBLEM] [${sessionId}] Error OpenAI${isTimeout ? ' (TIMEOUT)' : ''}:`, err.message);
      
      // Fallback seguro: pedir dispositivo directamente
      session.problem_validated = true;
      session.problem_intent = 'unknown';
      session.openai_failed = true;
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
    // Iniciar diagnóstico
    console.log(`[ASK_DEVICE] [${logSessionId}] Dispositivo seleccionado: ${deviceType}, avanzando a DIAGNOSTIC_STEP`);
    return {
      reply: isEn
        ? 'Perfect! Let me help you diagnose the issue.'
        : '¡Perfecto! Déjame ayudarte a diagnosticar el problema.',
      stage: 'DIAGNOSTIC_STEP',
      buttons: []
    };
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
    // Continuar con diagnóstico
    console.log(`[ASK_OS] [${logSessionId}] OS seleccionado: ${osType}, avanzando a DIAGNOSTIC_STEP`);
    return {
      reply: isEn
        ? 'Perfect! Let me help you diagnose the issue.'
        : '¡Perfecto! Déjame ayudarte a diagnosticar el problema.',
      stage: 'DIAGNOSTIC_STEP',
      buttons: []
    };
  }
  
  // Retry
  const contract = getStageContract('ASK_OS');
  return {
    reply: contract.prompt[locale] || contract.prompt['es-AR'],
    stage: 'ASK_OS',
    buttons: contract.defaultButtons
  };
}

// Handler para diagnóstico paso a paso (sistema híbrido)
async function handleDiagnosticStepStage(session, userText, buttonToken, sessionId) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  const userLevel = session.userLevel || 'intermediate';
  
  console.log(`[DIAGNOSTIC_STEP] [${sessionId}] Iniciando, buttonToken: ${buttonToken || 'null'}, userText: ${userText ? userText.substring(0, 30) : 'null'}`);
  
  // Cargar historial como memoria
  const history = loadConversationHistory(sessionId);
  const executedSteps = getExecutedDiagnosticSteps(history);
  console.log(`[DIAGNOSTIC_STEP] [${sessionId}] Pasos ejecutados: ${executedSteps.length}`);
  
  // Contar pasos básicos y avanzados
  const basicSteps = executedSteps.filter(s => s.step_number <= 5).length;
  const advancedSteps = executedSteps.filter(s => s.step_number > 5).length;
  const maxBasicSteps = 5;
  const maxAdvancedSteps = 5;
  
  // Verificar si hay 2 "Sigue igual" seguidos
  const lastTwoResults = [];
  for (let i = history.length - 1; i >= 0 && lastTwoResults.length < 2; i--) {
    const turn = history[i];
    if (turn.stage_after === 'DIAGNOSTIC_STEP' && turn.user_event) {
      if (typeof turn.user_event === 'string' && turn.user_event.includes('BTN_PERSIST')) {
        lastTwoResults.push('BTN_PERSIST');
      } else if (typeof turn.user_event === 'object' && turn.user_event.token === 'BTN_PERSIST') {
        lastTwoResults.push('BTN_PERSIST');
      }
    }
  }
  const twoPersistsInRow = lastTwoResults.length === 2 && lastTwoResults[0] === 'BTN_PERSIST' && lastTwoResults[1] === 'BTN_PERSIST';
  
  // Si se alcanzó el límite o hay 2 "Sigue igual", recomendar técnico
  if (basicSteps >= maxBasicSteps && advancedSteps >= maxAdvancedSteps || twoPersistsInRow) {
    const contract = getStageContract('FEEDBACK_REQUIRED');
    return {
      reply: isEn
        ? "I've reached the limit of diagnostic steps. I recommend talking to a technician. Let me know if this session was helpful."
        : 'Alcanzé el límite de pasos de diagnóstico. Te recomiendo hablar con un técnico. ¿Te sirvió esta ayuda?',
      stage: 'FEEDBACK_REQUIRED',
      buttons: contract.defaultButtons
    };
  }
  
  // Manejar botones de resultado
  if (buttonToken === 'BTN_SOLVED') {
    // Problema resuelto, pedir feedback
    const contract = getStageContract('FEEDBACK_REQUIRED');
    return {
      reply: isEn
        ? 'Great! I\'m glad it worked. Did this help you?'
        : '¡Genial! Me alegra que haya funcionado. ¿Te sirvió esta ayuda?',
      stage: 'FEEDBACK_REQUIRED',
      buttons: contract.defaultButtons
    };
  }
  
  if (buttonToken === 'BTN_HELP_CONTEXT') {
    // Ayuda contextual: NO avanza el flujo, solo explica el paso actual
    const lastStep = executedSteps[executedSteps.length - 1];
    if (lastStep && lastStep.action) {
      // Generar ayuda contextual adaptada al nivel del usuario
      if (openai) {
        try {
          const levelContext = userLevel === 'basic'
            ? (isEn ? 'Explain in very simple terms, step by step.' : 'Explicá en términos muy simples, paso a paso.')
            : userLevel === 'advanced'
              ? (isEn ? 'Be technical and precise.' : 'Sé técnico y preciso.')
              : (isEn ? 'Use common technical terms.' : 'Usá términos técnicos comunes.');
          
          const helpPrompt = isEn
            ? `The user needs contextual help for this action: "${lastStep.action}". ${levelContext} Provide clear instructions without advancing the flow.`
            : `El usuario necesita ayuda contextual para esta acción: "${lastStep.action}". ${levelContext} Proporcioná instrucciones claras sin avanzar el flujo.`;
          
          const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
              { role: 'system', content: 'You are Tecnos, an IT support assistant.' },
              { role: 'user', content: helpPrompt }
            ],
            temperature: 0.5,
            max_tokens: 300
          });
          
          const helpText = completion.choices[0]?.message?.content || '';
          // Volver al mismo paso con los mismos botones
          const lastTurn = history[history.length - 1];
          const helpReply = `${lastTurn?.bot_reply || ''}\n\n---\n\n${helpText}`;
          return {
            reply: helpReply,
            stage: 'DIAGNOSTIC_STEP',
            buttons: lastTurn?.buttons_shown || []
          };
        } catch (err) {
          console.error('[DIAGNOSTIC_STEP] Error generating help:', err);
        }
      }
    }
    // Si no hay último paso o falla, continuar normalmente
  }
  
  if (buttonToken === 'BTN_BACK') {
    // Volver al paso anterior: usar el paso previo sin llamar a OpenAI
    if (executedSteps.length >= 2) {
      const previousStep = executedSteps[executedSteps.length - 2];
      // Encontrar el turn correspondiente y reutilizar
      const previousTurn = history.find(t => t.diagnostic_step && t.diagnostic_step.step_id === previousStep.step_id);
      if (previousTurn) {
        return {
          reply: previousTurn.bot_reply,
          stage: 'DIAGNOSTIC_STEP',
          buttons: previousTurn.buttons_shown || []
        };
      }
    }
  }
  
  // Generar nuevo paso de diagnóstico solo si:
  // - El usuario hizo clic en "BTN_PERSIST" (sigue igual)
  // - Es el primer paso (no hay pasos ejecutados)
  // Si no hay botón y ya hay pasos, mostrar el último paso nuevamente
  if (!buttonToken && executedSteps.length > 0) {
    // Si no hay botón y ya hay pasos, mostrar el último paso
    const lastTurn = history[history.length - 1];
    if (lastTurn && lastTurn.bot_reply && lastTurn.stage_after === 'DIAGNOSTIC_STEP') {
      return {
        reply: lastTurn.bot_reply,
        stage: 'DIAGNOSTIC_STEP',
        buttons: lastTurn.buttons_shown || []
      };
    }
  }
  
  // Si no hay pasos ejecutados (primer acceso a DIAGNOSTIC_STEP), generar el primer paso automáticamente
  // incluso si no hay buttonToken (el usuario acaba de entrar a este stage)
  if (executedSteps.length === 0) {
    console.log(`[DIAGNOSTIC_STEP] [${sessionId}] Primer acceso, generando primer paso automáticamente`);
    // Continuar con la generación del paso (el código más abajo lo hará)
  } else if (executedSteps.length > 0 && buttonToken !== 'BTN_PERSIST') {
    // Si ya hay pasos y no es "BTN_PERSIST", mostrar el último paso
    const lastTurn = history[history.length - 1];
    const lastReply = lastTurn?.bot_reply || '';
    
    // NUNCA retornar reply vacío
    if (!lastReply || lastReply.trim() === '') {
      console.warn(`[DIAGNOSTIC_STEP] [${sessionId}] ⚠️ Last turn reply vacío, usando fallback`);
      return {
        reply: isEn
          ? 'Please continue with the previous step.'
          : 'Por favor, continuá con el paso anterior.',
        stage: 'DIAGNOSTIC_STEP',
        buttons: lastTurn?.buttons_shown || []
      };
    }
    
    return {
      reply: lastReply,
      stage: 'DIAGNOSTIC_STEP',
      buttons: lastTurn?.buttons_shown || []
    };
  }
  
  if (openai) {
    try {
      // Construir contexto del problema
      const problemContext = session.problem_raw || '';
      const deviceContext = session.device_type ? `Device: ${session.device_type}` : '';
      const osContext = session.os ? `OS: ${session.os}` : '';
      const stepsContext = executedSteps.length > 0
        ? `Previous steps executed: ${executedSteps.map(s => s.action).join(', ')}`
        : 'No previous steps';
      
      const levelContext = userLevel === 'basic'
        ? (isEn ? 'Use very simple language, step by step.' : 'Usá lenguaje muy simple, paso a paso.')
        : userLevel === 'advanced'
          ? (isEn ? 'Be technical and precise.' : 'Sé técnico y preciso.')
          : (isEn ? 'Use common technical terms.' : 'Usá términos técnicos comunes.');
      
      const stepNumber = basicSteps < maxBasicSteps ? basicSteps + 1 : advancedSteps + 1 + maxBasicSteps;
      const isBasicStep = stepNumber <= maxBasicSteps;
      
      const diagnosticPrompt = isEn
        ? `You are Tecnos, an IT support assistant. The user has this problem: "${problemContext}". ${deviceContext} ${osContext}. ${stepsContext}

Generate the next diagnostic step (step ${stepNumber}, ${isBasicStep ? 'basic' : 'advanced'}). ${levelContext}

Return a JSON object with:
- action: string (one single action the user should perform, e.g. "Press Ctrl+Alt+Del" or "Check if the power LED is on")
- explanation: string (brief explanation of why this step is needed, adapted to user level)

Return ONLY valid JSON, no other text.`
        : `Sos Tecnos, asistente de soporte técnico. El usuario tiene este problema: "${problemContext}". ${deviceContext} ${osContext}. ${stepsContext}

Generá el siguiente paso de diagnóstico (paso ${stepNumber}, ${isBasicStep ? 'básico' : 'avanzado'}). ${levelContext}

Devolvé un objeto JSON con:
- action: string (una sola acción que el usuario debe realizar, ej. "Presioná Ctrl+Alt+Del" o "Verificá si el LED de encendido está prendido")
- explanation: string (breve explicación de por qué este paso es necesario, adaptada al nivel del usuario)

Devolvé SOLO JSON válido, sin otro texto.`;
      
      const openaiPromise = openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: 'You are Tecnos, an IT support assistant. Return only valid JSON.' },
          { role: 'user', content: diagnosticPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });
      
      console.log(`[DIAGNOSTIC_STEP] [${sessionId}] Llamando a OpenAI con timeout 12s para generar paso ${stepNumber}`);
      const completion = await withTimeout(openaiPromise, 12000, 'OpenAI timeout');
      
      const stepText = completion.choices[0]?.message?.content || '{}';
      let stepData;
      try {
        stepData = JSON.parse(stepText.trim());
      } catch (parseErr) {
        console.error(`[DIAGNOSTIC_STEP] [${sessionId}] Error parseando JSON de OpenAI:`, parseErr);
        stepData = { action: '', explanation: '' }; // Fallback seguro
      }
      
      const stepId = `step_${stepNumber}_${Date.now()}`;
      const action = stepData.action || '';
      const explanation = stepData.explanation || '';
      
      // Construir mensaje completo - NUNCA vacío
      let reply = '';
      if (action && explanation) {
        reply = `${action}\n\n${explanation}`;
      } else if (action) {
        reply = action;
      } else if (explanation) {
        reply = explanation;
      } else {
        // Fallback si ambos están vacíos
        console.warn(`[DIAGNOSTIC_STEP] [${sessionId}] ⚠️ Action y explanation vacíos, usando fallback`);
        reply = isEn
          ? 'Let me guide you through this step by step.'
          : 'Déjame guiarte paso a paso.';
      }
      
      // Botones del paso: resultado + ayuda + volver
      const contract = getStageContract('DIAGNOSTIC_STEP');
      const buttons = [
        { token: 'BTN_SOLVED', label: BUTTON_CATALOG['BTN_SOLVED'].label[locale], order: 1 },
        { token: 'BTN_PERSIST', label: BUTTON_CATALOG['BTN_PERSIST'].label[locale], order: 2 },
        { token: 'BTN_HELP_CONTEXT', label: BUTTON_CATALOG['BTN_HELP_CONTEXT'].label[locale], order: 3 }
      ];
      
      // Solo agregar "Volver" si hay pasos anteriores
      if (executedSteps.length > 0) {
        buttons.push({ token: 'BTN_BACK', label: BUTTON_CATALOG['BTN_BACK'].label[locale], order: 4 });
      }
      
      return {
        reply,
        stage: 'DIAGNOSTIC_STEP',
        buttons,
        diagnostic_step: {
          step_id: stepId,
          step_number: stepNumber,
          action,
          explanation,
          is_basic: isBasicStep
        }
      };
      
    } catch (err) {
      const isTimeout = err.message && err.message.includes('timeout');
      console.error(`[DIAGNOSTIC_STEP] [${sessionId}] Error OpenAI${isTimeout ? ' (TIMEOUT)' : ''}:`, err.message);
      // Fallback seguro
      return {
        reply: isEn
          ? 'I need more information. Could you describe the problem again?'
          : 'Necesito más información. ¿Podrías describir el problema nuevamente?',
        stage: 'DIAGNOSTIC_STEP',
        buttons: []
      };
    }
  }
  
  // Sin OpenAI: fallback
  return {
    reply: isEn
      ? 'I need more information. Could you describe the problem again?'
      : 'Necesito más información. ¿Podrías describir el problema nuevamente?',
    stage: 'DIAGNOSTIC_STEP',
    buttons: []
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
