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
    violations: turnData.violations || []
  }) + '\n';
  
  try {
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    console.error(`[Conversation] Error appending to ${sessionId}:`, err.message);
  }
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
    allowButtons: true,
    allowedTokens: ['BTN_PROBLEMA', 'BTN_CONSULTA', 'BTN_NO_ENCIENDE', 'BTN_NO_INTERNET', 'BTN_LENTITUD', 'BTN_BLOQUEO', 'BTN_PERIFERICOS', 'BTN_VIRUS'],
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
  }
};

// Catálogo de botones disponibles para IA
const BUTTON_CATALOG = {
  'BTN_PROBLEMA': { label: { 'es-AR': 'Tengo un problema', 'en-US': 'I have a problem' } },
  'BTN_CONSULTA': { label: { 'es-AR': 'Es una consulta', 'en-US': 'It\'s a question' } },
  'BTN_NO_ENCIENDE': { label: { 'es-AR': 'No enciende', 'en-US': 'Won\'t turn on' } },
  'BTN_NO_INTERNET': { label: { 'es-AR': 'Sin internet', 'en-US': 'No internet' } },
  'BTN_LENTITUD': { label: { 'es-AR': 'Lentitud', 'en-US': 'Slowness' } },
  'BTN_BLOQUEO': { label: { 'es-AR': 'Bloqueos', 'en-US': 'Freezes' } },
  'BTN_PERIFERICOS': { label: { 'es-AR': 'Periféricos', 'en-US': 'Peripherals' } },
  'BTN_VIRUS': { label: { 'es-AR': 'Virus o malware', 'en-US': 'Virus or malware' } },
  'BTN_SOLVED': { label: { 'es-AR': 'Listo, se arregló', 'en-US': 'Done, it\'s fixed' } },
  'BTN_PERSIST': { label: { 'es-AR': 'Sigue igual', 'en-US': 'Still the same' } },
  'BTN_ADVANCED_TESTS': { label: { 'es-AR': 'Pruebas avanzadas', 'en-US': 'Advanced tests' } },
  'BTN_CONNECT_TECH': { label: { 'es-AR': 'Hablar con técnico', 'en-US': 'Talk to technician' } },
  'BTN_BACK': { label: { 'es-AR': 'Volver atrás', 'en-US': 'Go back' } },
  'BTN_CLOSE': { label: { 'es-AR': 'Cerrar chat', 'en-US': 'Close chat' } }
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
    
    // Si no hay botones sugeridos, usar lógica simple basada en el stage
    if (suggestedButtons.length === 0 && stage === 'ASK_NEED') {
      // Botones comunes para ASK_NEED
      suggestedButtons = [
        { token: 'BTN_PROBLEMA', label: BUTTON_CATALOG['BTN_PROBLEMA'].label[locale], order: 1 },
        { token: 'BTN_CONSULTA', label: BUTTON_CATALOG['BTN_CONSULTA'].label[locale], order: 2 }
      ];
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
  
  // Avanzar a ASK_NEED
  const levelLabel = isEn
    ? (session.userLevel === 'basic' ? 'basic' : session.userLevel === 'intermediate' ? 'intermediate' : 'advanced')
    : (session.userLevel === 'basic' ? 'básico' : session.userLevel === 'intermediate' ? 'intermedio' : 'avanzado');
  
  return {
    reply: isEn
      ? `Perfect! I'll adjust my explanations to your ${levelLabel} level. What can I help you with today?`
      : `¡Perfecto! Voy a ajustar mis explicaciones a tu nivel ${levelLabel}. ¿En qué puedo ayudarte hoy?`,
    stage: 'ASK_NEED',
    buttons: [] // IA decidirá los botones
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
    } else if (session.stage === 'ASK_NEED' || session.stage === 'ASK_PROBLEM' || session.stage === 'BASIC_TESTS') {
      // Stages gobernados por IA
      const aiResult = await generateAIResponse(session.stage, session, userText, buttonToken);
      result = {
        reply: aiResult.reply,
        stage: session.stage, // Mantener stage actual (o avanzar según lógica)
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
    
    // Si es determinístico y quedó vacío después del saneamiento, usar defaults
    const contract = getStageContract(result.stage);
    const finalButtons = (contract?.type === 'DETERMINISTIC' && sanitizedButtons.length === 0)
      ? (contract.defaultButtons || [])
      : sanitizedButtons;
    
    const legacyButtons = toLegacyButtons(finalButtons);
    
    turnLog.stage_after = result.stage;
    turnLog.bot_reply = result.reply;
    turnLog.buttons_shown = finalButtons; // Guardar formato interno {token, label, order}
    
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
