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
    allowedTokens: ['si', 'no', 'BTN_LANG_ES_AR', 'BTN_LANG_EN'],
    defaultButtons: [
      { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español (Argentina)', order: 1 },
      { token: 'BTN_LANG_EN', label: '🇬🇧 English', order: 2 }
    ],
    prompt: {
      'es-AR': 'Perfecto 😊\n\nElegí el idioma en el que te resulte más cómodo:',
      'en-US': 'Select the language you feel most comfortable with:'
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
      { token: 'BTN_USER_LEVEL_BASIC', label: '🟢 Básico — Uso lo esencial', order: 1 },
      { token: 'BTN_USER_LEVEL_INTERMEDIATE', label: '🟡 Intermedio — Entiendo lo común', order: 2 },
      { token: 'BTN_USER_LEVEL_ADVANCED', label: '🔵 Avanzado — Ya hice pruebas técnicas', order: 3 }
    ],
    prompt: {
      'es-AR': 'Para ayudarte mejor, decime qué tan cómodo te sentís con la tecnología.',
      'en-US': 'Say how comfortable you are with technology so I can guide you better.'
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
      { token: 'BTN_DEVICE_DESKTOP', label: '🖥️ PC de escritorio', order: 1 },
      { token: 'BTN_DEVICE_NOTEBOOK', label: '💻 Notebook', order: 2 },
      { token: 'BTN_DEVICE_ALLINONE', label: '🧩 All in One', order: 3 }
    ],
    prompt: {
      'es-AR': 'Bien, para seguir necesito saber una cosa más.\n\n¿Qué tipo de equipo estás usando?',
      'en-US': 'To continue, I just need one more thing: what type of device are you using?'
    }
  },
  ASK_OS: {
    type: 'DETERMINISTIC',
    allowButtons: true,
    allowedTokens: ['BTN_OS_WINDOWS', 'BTN_OS_MACOS', 'BTN_OS_LINUX', 'BTN_OS_UNKNOWN'],
    defaultButtons: [
      { token: 'BTN_OS_WINDOWS', label: '🪟 Windows', order: 1 },
      { token: 'BTN_OS_MACOS', label: '🍎 macOS', order: 2 },
      { token: 'BTN_OS_LINUX', label: '🐧 Linux', order: 3 },
      { token: 'BTN_OS_UNKNOWN', label: '❓ No lo sé', order: 4 }
    ],
    prompt: {
      'es-AR': '¿Qué sistema operativo estás usando?',
      'en-US': 'What operating system are you using?'
    }
  },
  DIAGNOSTIC_STEP: {
    type: 'AI_GOVERNED',
    allowButtons: true,
    allowedTokens: ['BTN_SOLVED', 'BTN_PERSIST', 'BTN_HELP_CONTEXT', 'BTN_BACK', 'BTN_CONNECT_TECH', 'BTN_PWR_NO_SIGNS', 'BTN_PWR_FANS', 'BTN_PWR_BEEPS', 'BTN_PWR_ON_OFF', 'BTN_STEP_DONE', 'BTN_STEP_STILL', 'BTN_STEP_HELP', 'BTN_INET_WIFI', 'BTN_INET_CABLE', 'BTN_INET_BOTH'],
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
      { token: 'BTN_REASON_NOT_RESOLVED', label: '❌ No resolvió el problema', order: 1 },
      { token: 'BTN_REASON_HARD_TO_UNDERSTAND', label: '🤔 Fue difícil de entender', order: 2 },
      { token: 'BTN_REASON_TOO_MANY_STEPS', label: '⏱️ Demasiados pasos', order: 3 },
      { token: 'BTN_REASON_WANTED_TECH', label: '👨‍💻 Prefería hablar con un técnico', order: 4 },
      { token: 'BTN_REASON_OTHER', label: '💬 Otro motivo', order: 5 }
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
  'BTN_SOLVED': { label: { 'es-AR': '🎉 ¡Sí, ya funciona!', 'en-US': '🎉 Yes, it works now!' } },
  'BTN_PERSIST': { label: { 'es-AR': '❌ Sigue igual, no cambió nada', 'en-US': '❌ Still the same, nothing changed' } },
  'BTN_ADVANCED_TESTS': { label: { 'es-AR': '🔧 Pruebas avanzadas', 'en-US': '🔧 Advanced tests' } },
  'BTN_CONNECT_TECH': { label: { 'es-AR': '👨‍💻 Hablar con técnico', 'en-US': '👨‍💻 Talk to technician' } },
  'BTN_BACK': { label: { 'es-AR': '⬅️ Volver atrás', 'en-US': '⬅️ Go back' } },
  'BTN_CLOSE': { label: { 'es-AR': '❌ Cerrar chat', 'en-US': '❌ Close chat' } },
  // Nuevos botones para sistema híbrido
  'BTN_DEVICE_DESKTOP': { label: { 'es-AR': '🖥️ PC de escritorio', 'en-US': '🖥️ Desktop PC' } },
  'BTN_DEVICE_NOTEBOOK': { label: { 'es-AR': '💻 Notebook', 'en-US': '💻 Notebook' } },
  'BTN_DEVICE_ALLINONE': { label: { 'es-AR': '🧩 All in One', 'en-US': '🧩 All-in-One' } },
  'BTN_OS_WINDOWS': { label: { 'es-AR': '🪟 Windows', 'en-US': '🪟 Windows' } },
  'BTN_OS_MACOS': { label: { 'es-AR': '🍎 macOS', 'en-US': '🍎 macOS' } },
  'BTN_OS_LINUX': { label: { 'es-AR': '🐧 Linux', 'en-US': '🐧 Linux' } },
  'BTN_OS_UNKNOWN': { label: { 'es-AR': '❓ No lo sé', 'en-US': '❓ I don\'t know' } },
  'BTN_HELP_CONTEXT': { label: { 'es-AR': '❓ ¿Cómo hago esto?', 'en-US': '❓ How do I do this?' } },
  'BTN_FEEDBACK_YES': { label: { 'es-AR': '👍 Sí, me sirvió', 'en-US': '👍 Yes, it helped me' } },
  'BTN_FEEDBACK_NO': { label: { 'es-AR': '👎 No, no me sirvió', 'en-US': '👎 No, it didn\'t help me' } },
  'BTN_REASON_NOT_RESOLVED': { label: { 'es-AR': '❌ No resolvió el problema', 'en-US': '❌ Didn\'t resolve the problem' } },
  'BTN_REASON_HARD_TO_UNDERSTAND': { label: { 'es-AR': '🤔 Fue difícil de entender', 'en-US': '🤔 Hard to understand' } },
  'BTN_REASON_TOO_MANY_STEPS': { label: { 'es-AR': '⏱️ Demasiados pasos', 'en-US': '⏱️ Too many steps' } },
  'BTN_REASON_WANTED_TECH': { label: { 'es-AR': '👨‍💻 Prefería hablar con un técnico', 'en-US': '👨‍💻 Wanted to talk to a technician' } },
  'BTN_REASON_OTHER': { label: { 'es-AR': '💬 Otro motivo', 'en-US': '💬 Other reason' } },
  // Botones para diagnóstico de encendido (wont_turn_on)
  'BTN_PWR_NO_SIGNS': { label: { 'es-AR': '🔌 No enciende nada', 'en-US': '🔌 Nothing happens' } },
  'BTN_PWR_FANS': { label: { 'es-AR': '💡 Prenden luces o gira el ventilador', 'en-US': '💡 Lights on / fan spins' } },
  'BTN_PWR_BEEPS': { label: { 'es-AR': '🔊 Escucho pitidos', 'en-US': '🔊 I hear beeps' } },
  'BTN_PWR_ON_OFF': { label: { 'es-AR': '🔄 Enciende y se apaga enseguida', 'en-US': '🔄 Turns on and off immediately' } },
  // Botones para pasos de diagnóstico
  'BTN_STEP_DONE': { label: { 'es-AR': '✅ Listo, ya lo probé', 'en-US': '✅ Done, I tried it' } },
  'BTN_STEP_STILL': { label: { 'es-AR': '❌ Sigue igual, no cambió nada', 'en-US': '❌ Still the same, nothing changed' } },
  'BTN_STEP_HELP': { label: { 'es-AR': '🙋 Prefiero que me ayude un técnico', 'en-US': '🙋 I prefer a technician' } },
  // Botones para diagnóstico de internet/conectividad
  'BTN_INET_WIFI': { label: { 'es-AR': '📶 WiFi', 'en-US': '📶 WiFi' } },
  'BTN_INET_CABLE': { label: { 'es-AR': '🔌 Cable', 'en-US': '🔌 Cable' } },
  'BTN_INET_BOTH': { label: { 'es-AR': '❓ No estoy seguro', 'en-US': '❓ I\'m not sure' } }
};

function getStageContract(stage) {
  return STAGE_CONTRACT[stage] || null;
}

// ========================================================
// SANEAMIENTO DE BOTONES
// ========================================================

function sanitizeButtonsForStage(stage, incomingButtons = [], locale = 'es-AR') {
  const contract = getStageContract(stage);
  if (!contract || !contract.allowButtons) {
    return [];
  }

  const allowed = new Set(contract.allowedTokens || []);
  const sanitized = [];

  function resolveLabel(token, providedLabel) {
    // 1) Catálogo: siempre manda (evita que el usuario vea tokens o labels "de código")
    const catalog = BUTTON_CATALOG[token];
    if (catalog && catalog.label) {
      const catalogLabel = catalog.label[locale] || catalog.label['es-AR'] || Object.values(catalog.label)[0];
      if (catalogLabel && catalogLabel !== token) {
        return catalogLabel;
      }
    }

    // 2) Defaults del contrato (por si hay tokens fuera del catálogo, ej: 'si'/'no')
    const fromContract = (contract.defaultButtons || []).find(b => b.token === token)?.label;
    if (fromContract && fromContract !== token) {
      return fromContract;
    }

    // 3) Label provista (si no parece token)
    if (typeof providedLabel === 'string' && providedLabel.trim()) {
      const trimmed = providedLabel.trim();
      const looksLikeToken = trimmed === token || /^BTN_[A-Z0-9_]+$/.test(trimmed);
      if (!looksLikeToken) return trimmed;
    }

    // 4) Último recurso: si es un token conocido, intentar formatearlo de forma amigable
    // Pero NUNCA devolver el token crudo si parece código
    if (/^BTN_[A-Z0-9_]+$/.test(token)) {
      console.warn(`[sanitizeButtonsForStage] ⚠️ Token sin label: ${token}, usando fallback`);
      // Intentar extraer un nombre amigable del token
      const friendlyName = token.replace(/^BTN_/, '').replace(/_/g, ' ').toLowerCase();
      return friendlyName.charAt(0).toUpperCase() + friendlyName.slice(1);
    }

    return token; // Solo como último recurso absoluto
  }

  // Normalizar formatos entrantes
  for (const btn of incomingButtons) {
    let token = null;
    let label = null;
    let order = sanitized.length + 1;

    if (typeof btn === 'string') {
      token = btn;
    } else if (btn && typeof btn === 'object') {
      if (btn.token) token = btn.token;
      else if (btn.value) token = btn.value;

      label = btn.label || btn.text || btn.title || null;
      if (btn.order) order = btn.order;
    }

    if (token && allowed.has(token)) {
      sanitized.push({
        token,
        label: resolveLabel(token, label),
        order
      });
    }
  }

  // Si es determinístico y quedó vacío, usar defaults
  if (contract.type === 'DETERMINISTIC' && sanitized.length === 0) {
    return (contract.defaultButtons || []).map(btn => ({
      token: btn.token,
      label: resolveLabel(btn.token, btn.label),
      order: btn.order
    }));
  }

  // Ordenar por order
  return sanitized.sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Helpers: normalización de labels para mapear clicks a tokens (compat con frontends legacy)
function _normalizeLabelForMatch(s) {
  if (!s || typeof s !== 'string') return '';
  // Lowercase + recorte
  let out = s.toLowerCase().trim();
  // Remover emojis/símbolos comunes dejando letras/números/espacios
  // (evita depender de properties unicode no soportadas en algunos runtimes)
  out = out.replace(/[\u2000-\u2BFF\uD800-\uDFFF\uFE00-\uFE0F]/g, ' '); // bloques comunes de símbolos/variantes
  out = out.replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function mapButtonValueToToken(stage, buttonValue, locale = 'es-AR') {
  if (!buttonValue) return null;

  // Tokens reales o valores especiales (consentimiento)
  if (buttonValue === 'si' || buttonValue === 'no') return buttonValue;
  if (/^BTN_[A-Z0-9_]+$/.test(buttonValue)) return buttonValue;

  const contract = getStageContract(stage);
  if (!contract) return null;

  const target = _normalizeLabelForMatch(buttonValue);
  if (!target) return null;

  // 1) Defaults del contrato
  const defaults = contract.defaultButtons || [];
  for (const b of defaults) {
    const cand = _normalizeLabelForMatch(b.label);
    if (cand && cand === target) return b.token;
  }

  // 2) Catálogo (para tokens permitidos del stage)
  const allowed = contract.allowedTokens || [];
  for (const tok of allowed) {
    const cat = BUTTON_CATALOG[tok];
    if (!cat || !cat.label) continue;

    // comparar contra todas las variantes de idioma (por robustez)
    for (const lab of Object.values(cat.label)) {
      const cand = _normalizeLabelForMatch(lab);
      if (cand && cand === target) return tok;
    }
  }

  // 3) Heurística: a veces el frontend arma algo como "Device PC de escritorio"
  // Si empieza con "device " lo recortamos y reintentamos contra defaults
  if (target.startsWith('device ')) {
    const trimmed = target.replace(/^device\s+/, '').trim();
    for (const b of defaults) {
      const cand = _normalizeLabelForMatch(b.label);
      if (cand && cand === trimmed) return b.token;
    }
  }

  return null;
}

// Convertir a formato legacy para frontend
// Nota: algunos frontends muestran el texto del botón usando `value` (no `text`).
// Para evitar que se vean tokens tipo "BTN_DEVICE_*", enviamos `value = label` y además incluimos `token`.
function toLegacyButtons(buttons) {
  return buttons.map(btn => {
    // Asegurar que siempre haya un label válido (no mostrar tokens al usuario)
    const label = btn.label || btn.text || btn.value || btn.token || 'Opción';
    const token = btn.token || btn.value || 'UNKNOWN';
    
    return {
      text: label,
      value: label, // UI-friendly - usar label para que el usuario vea texto, no tokens
      token: token, // machine-friendly (compat)
      label: label, // CRÍTICO: siempre debe tener label para que el frontend lo muestre
      order: btn.order || 0
    };
  });
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
    const consentText = '👋 Antes de empezar, necesito contarte algo importante.\n\n📋 **Política de Privacidad**\n\n• Voy a guardar tu nombre y esta conversación durante **48 horas**\n• Uso estos datos solo para ayudarte con soporte técnico\n• Podés pedirme que borre tus datos cuando quieras\n• No compartimos tu información con nadie\n• Cumplimos con normas de privacidad (GDPR)\n\n🔗 Ver política completa: https://stia.com.ar/politica-privacidad.html\n\n¿Seguimos?';
    
    if (buttonToken === 'si' || userText?.toLowerCase().includes('si') || userText?.toLowerCase().includes('yes') || userText?.toLowerCase().includes('acepto') || userText?.toLowerCase().includes('accept')) {
      session.gdprConsent = true;
      session.gdprConsentDate = nowIso();
      
      const reply = `🆔 **${session.id}**\n\nPerfecto 😊\n\nElegí el idioma en el que te resulte más cómodo:`;
      
      return {
        reply,
        stage: 'ASK_LANGUAGE',
        buttons: getStageContract('ASK_LANGUAGE').defaultButtons
      };
    }
    
    if (buttonToken === 'no' || userText?.toLowerCase().includes('no') || userText?.toLowerCase().includes('prefiero salir') || userText?.toLowerCase().includes('salir')) {
      return {
        reply: 'Todo bien 👍\n\nPara usar este servicio necesitás aceptar la política de privacidad.\nSi en otro momento te parece, podés volver cuando quieras.\n\n¡Que tengas un buen día!',
        stage: 'ENDED',
        buttons: []
      };
    }
    
    // EXCEPCIÓN: Botones Sí/No (siempre determinísticos, bilingües)
    return {
      reply: consentText,
      stage: 'ASK_LANGUAGE',
      buttons: [
        { token: 'si', label: '✅ Sí, acepto y continuamos', order: 1 },
        { token: 'no', label: '❌ No, prefiero salir', order: 2 }
      ]
    };
  }
  
  // EXCEPCIÓN: Botones de Idioma (siempre determinísticos)
  if (buttonToken === 'BTN_LANG_ES_AR' || userText?.toLowerCase().includes('español') || userText?.toLowerCase().includes('spanish')) {
    session.userLocale = 'es-AR';
    return {
      reply: 'Genial 👍\n\n¿Cómo te llamás?',
      stage: 'ASK_NAME',
      buttons: []
    };
  }
  
  if (buttonToken === 'BTN_LANG_EN' || userText?.toLowerCase().includes('english') || userText?.toLowerCase().includes('inglés')) {
    session.userLocale = 'en-US';
    return {
      reply: "Great! What's your name?",
      stage: 'ASK_NAME',
      buttons: []
    };
  }
  
  // Retry (bilingüe hasta que elijan)
  const contract = getStageContract('ASK_LANGUAGE');
  return {
    reply: 'Perfecto 😊\n\nElegí el idioma en el que te resulte más cómodo:',
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
        ? `Nice to meet you, ${name}! How comfortable are you with technology?`
        : `¡Un gusto conocerte, ${name}! 😊\n\nPara ayudarte mejor, decime qué tan cómodo te sentís con la tecnología.`,
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
  const contract = getStageContract('ASK_NEED');
  return {
    reply: isEn
      ? `Perfect! I'll explain everything in a way that matches your level.\n\nWhat problem are you having?`
      : `Perfecto 👍\n\nVoy a explicarte todo de una forma acorde a tu nivel.\n\nContame, ¿qué problema estás teniendo?`,
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
- intent: string (canonical intent. MUST be one of: "wont_turn_on", "no_internet", "slow", "freezes", "peripherals", "keyboard_issue", "mouse_issue", "display_issue", "software_issue", "browser_issue", "virus", "general_question", "other")
- missing_device: boolean (does the description lack device type info like desktop/notebook/allinone?)
- missing_os: boolean (does the description lack OS info? optional, only if really needed)
- needs_clarification: boolean (does the problem need more details?)
- confidence: string (one of: "high", "medium", "low" - how confident are you in the intent classification?)

IMPORTANT:
- "wont_turn_on" = device won't power on
- "no_internet" = connectivity/network issues
- "keyboard_issue" = keyboard not working
- "mouse_issue" = mouse/trackpad not working
- "display_issue" = screen/monitor problems
- "software_issue" = application/program problems (e.g., "chrome no abre" = software_issue)
- "browser_issue" = web browser specific problems
- "slow" = performance issues
- "freezes" = system freezing/hanging
- "peripherals" = external devices (printers, scanners, etc.)
- "virus" = malware/virus concerns

Return ONLY valid JSON, no other text. Example: {"valid": true, "intent": "wont_turn_on", "missing_device": true, "missing_os": false, "needs_clarification": false, "confidence": "high"}`
        : `Sos un asistente de soporte técnico. Analizá la descripción del problema del usuario y devolvé un objeto JSON con:
- valid: boolean (¿es un problema técnico válido?)
- intent: string (intent canónico. DEBE ser uno de: "wont_turn_on", "no_internet", "slow", "freezes", "peripherals", "keyboard_issue", "mouse_issue", "display_issue", "software_issue", "browser_issue", "virus", "general_question", "other")
- missing_device: boolean (¿falta información del tipo de dispositivo como desktop/notebook/allinone?)
- missing_os: boolean (¿falta información del sistema operativo? opcional, solo si realmente se necesita)
- needs_clarification: boolean (¿el problema necesita más detalles?)
- confidence: string (uno de: "high", "medium", "low" - qué tan seguro estás de la clasificación del intent)

IMPORTANTE:
- "wont_turn_on" = el equipo no enciende
- "no_internet" = problemas de conectividad/red
- "keyboard_issue" = el teclado no funciona
- "mouse_issue" = el mouse/trackpad no funciona
- "display_issue" = problemas de pantalla/monitor
- "software_issue" = problemas con aplicaciones/programas (ej: "chrome no abre" = software_issue)
- "browser_issue" = problemas específicos del navegador web
- "slow" = problemas de rendimiento
- "freezes" = el sistema se congela
- "peripherals" = dispositivos externos (impresoras, scanners, etc.)
- "virus" = preocupaciones de malware/virus

Devolvé SOLO JSON válido, sin otro texto. Ejemplo: {"valid": true, "intent": "wont_turn_on", "missing_device": true, "missing_os": false, "needs_clarification": false, "confidence": "high"}`;
      
      const openaiPromise = openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Problem description: ${problemText}` }
        ],
        temperature: 0.3,
        max_tokens: 200
      });
      
      console.log(`[ASK_PROBLEM] [${sessionId}] 🔍 Llamando a OpenAI con timeout 12s`);
      console.log(`[ASK_PROBLEM] [${sessionId}] 📝 Texto a analizar: "${problemText}"`);
      
      const completion = await withTimeout(openaiPromise, 12000, 'OpenAI timeout');
      
      const analysisText = completion.choices[0]?.message?.content || '{}';
      console.log(`[ASK_PROBLEM] [${sessionId}] 📥 Respuesta cruda de OpenAI:`, analysisText);
      
      let analysis;
      try {
        // Limpiar respuesta de OpenAI (puede venir con markdown o texto adicional)
        let cleanText = analysisText.trim();
        // Remover markdown code blocks si existen
        cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
        // Buscar el primer objeto JSON válido
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanText = jsonMatch[0];
        }
        analysis = JSON.parse(cleanText);
      } catch (parseErr) {
        console.error(`[ASK_PROBLEM] [${sessionId}] ❌ Error parseando JSON de OpenAI:`, parseErr);
        console.error(`[ASK_PROBLEM] [${sessionId}] 📄 Texto que falló:`, analysisText);
        throw new Error(`OpenAI response parsing failed: ${parseErr.message}`);
      }
      
      // VALIDACIÓN CRÍTICA: Verificar que el análisis sea válido
      if (!analysis || typeof analysis !== 'object') {
        throw new Error('OpenAI returned invalid analysis object');
      }
      
      // Validar que el intent sea válido
      const validIntents = ['wont_turn_on', 'no_internet', 'slow', 'freezes', 'peripherals', 'keyboard_issue', 'mouse_issue', 'display_issue', 'software_issue', 'browser_issue', 'virus', 'general_question', 'other'];
      const detectedIntent = analysis.intent || 'unknown';
      const isValidIntent = validIntents.includes(detectedIntent);
      
      if (!isValidIntent && detectedIntent !== 'unknown') {
        console.warn(`[ASK_PROBLEM] [${sessionId}] ⚠️ Intent no válido detectado: "${detectedIntent}", usando "other"`);
        analysis.intent = 'other';
      }
      
      // PERSISTIR RESULTADO DEL ANÁLISIS EN LA SESIÓN
      session.problem_validated = true;
      session.intent = analysis.intent || 'unknown';
      session.problem_intent = analysis.intent || 'unknown'; // Mantener por compatibilidad
      session.problem_needs_clarification = analysis.needs_clarification || false;
      session.problem_confidence = analysis.confidence || 'medium';
      session.problem_analysis_timestamp = nowIso();
      
      // Resetear diagnostic cuando hay un problema nuevo
      session.diagnostic = null;
      
      // LOGS DETALLADOS PARA DEBUG
      console.log(`[ASK_PROBLEM] [${sessionId}] ✅ Análisis completado:`, {
        intent: analysis.intent,
        confidence: analysis.confidence || 'medium',
        valid: analysis.valid,
        missing_device: analysis.missing_device,
        missing_os: analysis.missing_os,
        needs_clarification: analysis.needs_clarification
      });
      console.log(`[ASK_PROBLEM] [${sessionId}] 💾 Estado de sesión actualizado:`, {
        problem_raw: session.problem_raw,
        intent: session.intent,
        problem_intent: session.problem_intent,
        problem_confidence: session.problem_confidence
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
      const isParseError = err.message && err.message.includes('parsing');
      
      console.error(`[ASK_PROBLEM] [${sessionId}] ❌ Error OpenAI${isTimeout ? ' (TIMEOUT)' : isParseError ? ' (PARSE ERROR)' : ''}:`, err.message);
      console.error(`[ASK_PROBLEM] [${sessionId}] 📝 Texto que causó el error: "${problemText}"`);
      
      // FALLBACK EXPLÍCITO Y TRAZABLE: Intentar análisis heurístico básico
      let fallbackIntent = 'unknown';
      let fallbackMissingDevice = true;
      
      const textLower = problemText.toLowerCase();
      
      // Heurísticas básicas para detectar intent sin IA
      if (textLower.includes('no enciende') || textLower.includes('no prende') || textLower.includes('no arranca')) {
        fallbackIntent = 'wont_turn_on';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "wont_turn_on"`);
      } else if (textLower.includes('internet') || textLower.includes('conexión') || textLower.includes('wifi') || textLower.includes('red')) {
        fallbackIntent = 'no_internet';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "no_internet"`);
      } else if (textLower.includes('teclado') || textLower.includes('keyboard')) {
        fallbackIntent = 'keyboard_issue';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "keyboard_issue"`);
      } else if (textLower.includes('mouse') || textLower.includes('ratón')) {
        fallbackIntent = 'mouse_issue';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "mouse_issue"`);
      } else if (textLower.includes('lento') || textLower.includes('slow')) {
        fallbackIntent = 'slow';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "slow"`);
      } else if (textLower.includes('se congela') || textLower.includes('freeze') || textLower.includes('cuelga')) {
        fallbackIntent = 'freezes';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "freezes"`);
      } else if (textLower.includes('chrome') || textLower.includes('navegador') || textLower.includes('browser') || textLower.includes('no abre')) {
        fallbackIntent = 'software_issue';
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback heurístico: detectado "software_issue"`);
      }
      
      // Detectar dispositivo en el texto
      if (textLower.includes('notebook') || textLower.includes('laptop') || textLower.includes('portátil')) {
        session.device_type = 'notebook';
        fallbackMissingDevice = false;
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback: dispositivo inferido: notebook`);
      } else if (textLower.includes('desktop') || textLower.includes('escritorio') || textLower.includes('pc de escritorio')) {
        session.device_type = 'desktop';
        fallbackMissingDevice = false;
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback: dispositivo inferido: desktop`);
      } else if (textLower.includes('all in one') || textLower.includes('all-in-one')) {
        session.device_type = 'allinone';
        fallbackMissingDevice = false;
        console.log(`[ASK_PROBLEM] [${sessionId}] 🔧 Fallback: dispositivo inferido: allinone`);
      }
      
      // PERSISTIR RESULTADO DEL FALLBACK
      session.problem_validated = true;
      session.intent = fallbackIntent;
      session.problem_intent = fallbackIntent;
      session.problem_confidence = 'low'; // Baja confianza porque es fallback
      session.openai_failed = true;
      session.problem_analysis_timestamp = nowIso();
      session.diagnostic = null;
      
      console.log(`[ASK_PROBLEM] [${sessionId}] ⚠️ FALLBACK ACTIVADO - Estado guardado:`, {
        problem_raw: session.problem_raw,
        intent: session.intent,
        problem_confidence: session.problem_confidence,
        openai_failed: session.openai_failed
      });
      
      // Continuar con el flujo según lo detectado
      if (fallbackMissingDevice) {
        const contract = getStageContract('ASK_DEVICE');
        console.log(`[ASK_PROBLEM] [${sessionId}] ➡️ Fallback: avanzando a ASK_DEVICE`);
        return {
          reply: isEn
            ? `I understand you're having: ${problemText}\n\nWhat type of device are you using?`
            : `Entiendo que tenés: ${problemText}\n\n¿Qué tipo de dispositivo estás usando?`,
          stage: 'ASK_DEVICE',
          buttons: contract.defaultButtons
        };
      } else {
        // Tenemos dispositivo, avanzar a diagnóstico
        console.log(`[ASK_PROBLEM] [${sessionId}] ➡️ Fallback: dispositivo detectado, avanzando a DIAGNOSTIC_STEP`);
        const diagnosticResult = await handleDiagnosticStepStage(session, '', null, sessionId);
        return diagnosticResult;
      }
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

// Función para generar pasos de diagnóstico con IA
async function generateDiagnosticStep(session, userText, buttonToken, sessionId) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  const userLevel = session.userLevel || 'intermediate';
  const intent = session.intent || session.problem_intent || 'unknown';
  const deviceType = session.device_type || 'unknown';
  const os = session.os || 'unknown';
  const problemRaw = session.problem_raw || '';
  const currentStep = session.diagnostic?.step || 1;
  const diagnosticData = session.diagnostic?.data || {};
  
  // Cargar historial de la conversación
  const history = loadConversationHistory(sessionId);
  const recentTurns = history.slice(-5).map(turn => ({
    stage: turn.stage_after,
    user_event: turn.user_event,
    bot_reply: turn.bot_reply?.substring(0, 200) // Limitar longitud
  }));
  
  if (!openai) {
    // Fallback sin IA
    return {
      reply: isEn
        ? 'I understand your problem. Unfortunately, AI diagnostic support is not available right now. I recommend talking to a technician.'
        : 'Entiendo tu problema. Lamentablemente, el soporte de diagnóstico por IA no está disponible en este momento. Te recomiendo hablar con un técnico.',
      buttons: [
        { token: 'BTN_CONNECT_TECH', label: BUTTON_CATALOG['BTN_CONNECT_TECH'].label[locale], order: 1 }
      ]
    };
  }
  
  // Construir contexto según nivel
  let levelContext = '';
  if (userLevel === 'basic') {
    levelContext = isEn
      ? 'The user is BASIC level. Use VERY simple language, step-by-step guidance with numbered steps, frequent confirmations. Avoid ALL technical jargon. Explain what to look for visually (icons, buttons, lights).'
      : 'El usuario es nivel BÁSICO. Usá lenguaje MUY simple, guía paso a paso con pasos numerados, confirmaciones frecuentes. Evitá TODA jerga técnica. Explicá qué buscar visualmente (íconos, botones, luces).';
  } else if (userLevel === 'advanced') {
    levelContext = isEn
      ? 'The user is ADVANCED level. Be technical, precise, use commands and technical terms. Get straight to the point. You can mention Task Manager, Device Manager, command line tools, BIOS, etc.'
      : 'El usuario es nivel AVANZADO. Sé técnico, preciso, usá comandos y términos técnicos. Ve directo al grano. Podés mencionar Administrador de tareas, Administrador de dispositivos, herramientas de línea de comandos, BIOS, etc.';
  } else {
    levelContext = isEn
      ? 'The user is INTERMEDIATE level. Use common technical terms, moderate detail. Balance between simple and technical.'
      : 'El usuario es nivel INTERMEDIO. Usá términos técnicos comunes, detalle moderado. Balance entre simple y técnico.';
  }
  
  // Obtener tokens permitidos para botones
  const contract = getStageContract('DIAGNOSTIC_STEP');
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
  
  // Construir prompt del sistema
  const systemPrompt = isEn
    ? `You are Tecnos, a friendly IT technician for STI — Intelligent Technical Service. Answer ONLY in ${locale === 'en-US' ? 'English (US)' : 'Spanish (Argentina)'}.

${levelContext}

CONTEXT INFORMATION:
- Problem reported: "${problemRaw}"
- Problem type (intent): ${intent}
- Device type: ${deviceType}
- Operating system: ${os}
- Current diagnostic step: ${currentStep}
- Previous diagnostic data: ${JSON.stringify(diagnosticData)}

RULES FOR DIAGNOSTIC STEPS:
1. Generate step-by-step diagnostic instructions based on the problem, device type, OS, and user level
2. If step 1: Start with the most common/easiest solution first
3. If step > 1: Build on previous steps, don't repeat what was already tried
4. Adapt language and complexity to user level (${userLevel})
5. Suggest 2-4 relevant buttons from available catalog
6. Format buttons as JSON array: [{token: "BTN_XXX", label: "Label", order: 1}]
7. If user clicked a button, respond accordingly (e.g., if BTN_STEP_DONE, ask if problem is solved)
8. If problem persists after 2 attempts, suggest talking to technician

Available buttons: ${JSON.stringify(availableButtons.map(b => b.token))}

Return your response with diagnostic steps, then include buttons as JSON array at the end.`
    : `Sos Tecnos, técnico informático de STI — Servicio Técnico Inteligente. Respondé SOLO en ${locale === 'es-AR' ? 'español rioplatense (Argentina), usando voseo ("vos")' : 'español neutro latino, usando "tú"'}.

${levelContext}

INFORMACIÓN DE CONTEXTO:
- Problema reportado: "${problemRaw}"
- Tipo de problema (intent): ${intent}
- Tipo de dispositivo: ${deviceType}
- Sistema operativo: ${os}
- Paso de diagnóstico actual: ${currentStep}
- Datos de diagnóstico previos: ${JSON.stringify(diagnosticData)}

REGLAS PARA PASOS DE DIAGNÓSTICO:
1. Generá instrucciones de diagnóstico paso a paso basadas en el problema, tipo de dispositivo, OS y nivel de usuario
2. Si es paso 1: Empezá con la solución más común/fácil primero
3. Si es paso > 1: Construí sobre pasos previos, no repitas lo que ya se intentó
4. Adaptá el lenguaje y complejidad al nivel del usuario (${userLevel})
5. Sugerí 2-4 botones relevantes del catálogo disponible
6. Formato de botones como array JSON: [{token: "BTN_XXX", label: "Etiqueta", order: 1}]
7. Si el usuario hizo clic en un botón, respondé acorde (ej: si BTN_STEP_DONE, preguntá si se resolvió)
8. Si el problema persiste después de 2 intentos, sugerí hablar con técnico

Botones disponibles: ${JSON.stringify(availableButtons.map(b => b.token))}

Devolvé tu respuesta con pasos de diagnóstico, luego incluí los botones como array JSON al final.`;
  
  // Construir mensaje del usuario
  let userMessage = '';
  if (buttonToken === 'BTN_STEP_DONE') {
    userMessage = isEn
      ? 'User clicked: "Done, I tried it". Ask if the problem is solved.'
      : 'Usuario hizo clic: "Listo, ya lo probé". Preguntá si el problema se resolvió.';
  } else if (buttonToken === 'BTN_PERSIST') {
    userMessage = isEn
      ? `User clicked: "Still the same, nothing changed". This is attempt ${(diagnosticData.still_count || 0) + 1}. Provide next diagnostic step or suggest technician if this is the 2nd attempt.`
      : `Usuario hizo clic: "Sigue igual, no cambió nada". Este es el intento ${(diagnosticData.still_count || 0) + 1}. Proporcioná el siguiente paso de diagnóstico o sugerí técnico si es el 2do intento.`;
  } else if (buttonToken === 'BTN_STEP_HELP') {
    userMessage = isEn
      ? 'User clicked: "I prefer a technician". Suggest talking to a technician and ask for feedback.'
      : 'Usuario hizo clic: "Prefiero que me ayude un técnico". Sugerí hablar con un técnico y pedí feedback.';
  } else if (buttonToken) {
    userMessage = isEn
      ? `User clicked button: ${buttonToken}. Respond accordingly.`
      : `Usuario hizo clic en botón: ${buttonToken}. Respondé acorde.`;
  } else if (userText) {
    userMessage = isEn
      ? `User said: ${userText}`
      : `Usuario dijo: ${userText}`;
  } else {
    userMessage = isEn
      ? `Generate the first diagnostic step for this problem.`
      : `Generá el primer paso de diagnóstico para este problema.`;
  }
  
  // Agregar contexto de conversación reciente
  if (recentTurns.length > 0) {
    userMessage += '\n\n' + (isEn ? 'Recent conversation context:' : 'Contexto de conversación reciente:') + '\n' + JSON.stringify(recentTurns, null, 2);
  }
  
  try {
    console.log(`[DIAGNOSTIC_STEP] [${sessionId}] 🤖 Consultando IA para paso ${currentStep}`);
    console.log(`[DIAGNOSTIC_STEP] [${sessionId}] 📝 Contexto: problema="${problemRaw}", intent=${intent}, device=${deviceType}, os=${os}, nivel=${userLevel}`);
    
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 800
      }),
      15000,
      'OpenAI timeout'
    );
    
    const aiResponse = completion.choices[0]?.message?.content || '';
    console.log(`[DIAGNOSTIC_STEP] [${sessionId}] 📥 Respuesta de IA recibida (${aiResponse.length} caracteres)`);
    
    // Extraer botones sugeridos (si la IA los incluye en formato JSON)
    let suggestedButtons = [];
    try {
      const buttonMatch = aiResponse.match(/\[[\s\S]*?\]/);
      if (buttonMatch) {
        suggestedButtons = JSON.parse(buttonMatch[0]);
        console.log(`[DIAGNOSTIC_STEP] [${sessionId}] ✅ Botones extraídos de IA:`, suggestedButtons);
      }
    } catch (e) {
      console.warn(`[DIAGNOSTIC_STEP] [${sessionId}] ⚠️ No se pudieron extraer botones de la respuesta de IA`);
    }
    
    // Limpiar respuesta (remover JSON de botones si está al final)
    let cleanReply = aiResponse.trim();
    if (suggestedButtons.length > 0) {
      // Remover el JSON de botones del final del texto
      cleanReply = cleanReply.replace(/\[[\s\S]*?\]\s*$/, '').trim();
    }
    
    return {
      reply: cleanReply,
      buttons: suggestedButtons
    };
  } catch (err) {
    const isTimeout = err.message && err.message.includes('timeout');
    console.error(`[DIAGNOSTIC_STEP] [${sessionId}] ❌ Error IA${isTimeout ? ' (TIMEOUT)' : ''}:`, err.message);
    
    // Fallback seguro
    return {
      reply: isEn
        ? 'I understand your problem. Unfortunately, I\'m having trouble generating diagnostic steps right now. I recommend talking to a technician.'
        : 'Entiendo tu problema. Lamentablemente, estoy teniendo problemas para generar pasos de diagnóstico en este momento. Te recomiendo hablar con un técnico.',
      buttons: [
        { token: 'BTN_CONNECT_TECH', label: BUTTON_CATALOG['BTN_CONNECT_TECH'].label[locale], order: 1 }
      ]
    };
  }
}

// Handler para diagnóstico paso a paso (motor real de pasos)
async function handleDiagnosticStepStage(session, userText, buttonToken, sessionId) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.startsWith('en');
  const userLevel = session.userLevel || 'intermediate';
  
  // VALIDACIÓN CRÍTICA: Verificar que el intent esté registrado
  const intent = session.intent || session.problem_intent || 'unknown';
  
  // Si el intent es unknown y tenemos problem_raw, intentar analizar de nuevo
  if (intent === 'unknown' && session.problem_raw && !session.openai_failed) {
    console.warn(`[DIAGNOSTIC_STEP] [${sessionId}] ⚠️ Intent es 'unknown' pero tenemos problem_raw, reintentando análisis...`);
    // No reintentar aquí para evitar loops, pero loguear el problema
    console.warn(`[DIAGNOSTIC_STEP] [${sessionId}] ⚠️ Problema detectado pero no clasificado: "${session.problem_raw}"`);
  }
  
  const deviceType = session.device_type || 'unknown';
  
  // Log del estado actual para debugging
  console.log(`[DIAGNOSTIC_STEP] [${sessionId}] 📊 Estado de sesión:`, {
    intent: intent,
    problem_raw: session.problem_raw,
    device_type: deviceType,
    problem_validated: session.problem_validated,
    problem_confidence: session.problem_confidence
  });
  
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
  
  // Manejar botones de persistencia
  if (buttonToken === 'BTN_PERSIST' || buttonToken === 'BTN_STEP_STILL') {
    const stillCount = (session.diagnostic.data.still_count || 0) + 1;
    session.diagnostic.data.still_count = stillCount;
    
    if (stillCount >= 2) {
      const contract = getStageContract('FEEDBACK_REQUIRED');
      return {
        reply: isEn
          ? 'I understand the problem persists after multiple attempts. I recommend talking to a technician for a more detailed diagnosis. Was this session helpful?'
          : 'Entiendo que el problema persiste después de varios intentos. Te recomiendo hablar con un técnico para un diagnóstico más detallado. ¿Te sirvió esta ayuda?',
        stage: 'FEEDBACK_REQUIRED',
        buttons: contract.defaultButtons
      };
    }
    
    // Continuar con siguiente paso
    session.diagnostic.step = currentStep + 1;
  }
  
  if (buttonToken === 'BTN_STEP_HELP') {
    const contract = getStageContract('FEEDBACK_REQUIRED');
    return {
      reply: isEn
        ? 'I understand you need more help. I recommend talking to a technician. Was this session helpful?'
        : 'Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico. ¿Te sirvió esta ayuda?',
      stage: 'FEEDBACK_REQUIRED',
      buttons: contract.defaultButtons
    };
  }
  
  // Si el usuario hizo clic en BTN_STEP_DONE, avanzar paso y preguntar si se resolvió
  if (buttonToken === 'BTN_STEP_DONE') {
    session.diagnostic.step = currentStep + 1;
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
  }
  
  // CONSULTAR CON IA PARA GENERAR PASO DE DIAGNÓSTICO
  const aiResult = await generateDiagnosticStep(session, userText, buttonToken, sessionId);
  
  // Guardar información del paso en diagnostic.data si hay botones específicos
  if (buttonToken && buttonToken.startsWith('BTN_')) {
    session.diagnostic.data[`step_${currentStep}_button`] = buttonToken;
  }
  
  return {
    reply: aiResult.reply,
    stage: 'DIAGNOSTIC_STEP',
    buttons: aiResult.buttons || []
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
        ? 'Thanks for trusting STI! 🙌\n\nIf you need help later, I\'ll be here.'
        : '¡Gracias por confiar en STI! 🙌\n\nSi necesitás ayuda más adelante, acá voy a estar.',
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
    return {
      reply: isEn
        ? 'Thanks for your feedback. We\'ll use it to improve our service.'
        : 'Gracias por tu feedback. Lo vamos a usar para mejorar nuestro servicio.',
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
        { text: '✅ Yes, I Accept / Sí Acepto', value: 'si', order: 1 },
        { text: '❌ No, I Do Not Accept / No Acepto', value: 'no', order: 2 }
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
    
    let userText = action === 'button' ? null : text;
    let buttonToken = action === 'button' ? value : null;

    // Compat: algunos frontends envían en `value` el LABEL (ej: "🖥️ PC de escritorio" o "Device PC de escritorio")
    // y no el token. Intentamos mapear a token, y si no se puede, lo tratamos como texto del usuario.
    if (action === 'button' && buttonToken) {
      const mapped = mapButtonValueToToken(session.stage, buttonToken, session.userLocale || 'es-AR');
      if (mapped) {
        buttonToken = mapped;
      } else if (!/^BTN_[A-Z0-9_]+$/.test(buttonToken) && buttonToken !== 'si' && buttonToken !== 'no') {
        userText = buttonToken; // fallback a heurística por texto
        buttonToken = null;
      }
    }
    
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
    const sanitizedButtons = sanitizeButtonsForStage(result.stage, result.buttons || [], session.userLocale || 'es-AR');
    
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
    
    // Debug: ver qué botones se están enviando
    if (legacyButtons.length > 0) {
      console.log(`[CHAT] [${sessionId}] 🔍 Botones a enviar:`, JSON.stringify(legacyButtons, null, 2));
    }
    
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
        problem_intent: session.intent || session.problem_intent || 'unknown', // CRÍTICO: Intent detectado
        problem_confidence: session.problem_confidence || 'unknown',
        problem_validated: session.problem_validated || false,
        openai_failed: session.openai_failed || false,
        device_type: session.device_type || null,
        os: session.os || null,
        user_level: session.userLevel || null,
        diagnostic_steps_count: getExecutedDiagnosticSteps(loadConversationHistory(sessionId)).length,
        ended_at: nowIso(),
        problem_analysis_timestamp: session.problem_analysis_timestamp || null
      };
      
      // VALIDACIÓN FINAL: Verificar que el problema esté registrado
      if (!session.problem_raw || !session.intent || session.intent === 'unknown') {
        console.warn(`[CHAT] [${sessionId}] ⚠️ CONVERSACIÓN FINALIZADA SIN PROBLEMA REGISTRADO:`, {
          problem_raw: session.problem_raw,
          intent: session.intent,
          problem_validated: session.problem_validated
        });
      } else {
        console.log(`[CHAT] [${sessionId}] ✅ CONVERSACIÓN FINALIZADA CON PROBLEMA REGISTRADO:`, {
          problem_raw: session.problem_raw,
          intent: session.intent,
          confidence: session.problem_confidence
        });
      }
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
