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
 * - POST /api/reload              → Recargar configuración
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
 * - Set SSE_TOKEN to protect logs endpoint
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs, { createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';

import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

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
if (!process.env.SSE_TOKEN) {
  console.warn('[WARN] SSE_TOKEN no configurado. Endpoint /api/logs sin protección.');
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const OA_NAME_REJECT_CONF = Number(process.env.OA_NAME_REJECT_CONF || 0.75);

// Paths / persistence
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const LOG_FILE        = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/$/, '');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
const SSE_TOKEN       = process.env.SSE_TOKEN || '';

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
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

const nowIso = () => new Date().toISOString();

const withOptions = obj => ({ options: [], ...obj });

function maskPII(text) {
  if (!text) return text;
  let s = String(text);
  // Emails
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  // Tarjetas de crédito (16 dígitos en bloques)
  s = s.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[tarjeta]');
  // Teléfonos largos (10+ dígitos seguidos)
  s = s.replace(/\b\d{10,}\b/g, '[tel]');
  // DNI u otros documentos (7-8 dígitos)
  s = s.replace(/\b\d{7,8}\b/g, '[dni]');
  return s;
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
      fs.appendFile(LOG_FILE, entry + '\n', 'utf8', ()=>{});
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
      try { res.end(); } catch(_) {}
      sseClients.delete(res);
    }
  }
}

// Wrap console
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => {
  try { _origLog(...args); } catch (_) {}
  try {
    const entry = formatLog('INFO', ...args);
    appendToLogFile(entry);
    broadcastLog(entry);
  } catch (e) { /* noop */ }
};
console.error = (...args) => {
  try { _origErr(...args); } catch (_) {}
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
  ui: {
    buttons: [
      { token: 'BTN_HELP_1', label: 'Ayuda paso 1', text: 'ayuda paso 1' },
      { token: 'BTN_HELP_2', label: 'Ayuda paso 2', text: 'ayuda paso 2' },
      { token: 'BTN_HELP_3', label: 'Ayuda paso 3', text: 'ayuda paso 3' },
      { token: 'BTN_HELP_4', label: 'Ayuda paso 4', text: 'ayuda paso 4' },
      { token: 'BTN_SOLVED', label: 'Lo pude solucionar ✔️', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: 'El problema persiste ❌', text: 'el problema persiste' },
      { token: 'BTN_REPHRASE', label: 'Cambiar problema', text: 'cambiar problema' },
      { token: 'BTN_CLOSE', label: 'Cerrar chat 🔒', text: 'cerrar chat' },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', text: 'hablar con un tecnico' },
      { token: 'BTN_MORE_TESTS', label: 'Más pruebas 🔍', text: 'más pruebas' },
      { token: 'BTN_CONNECT_TECH', label: 'Conectar con Técnico 🧑‍💻', text: 'conectar con técnico' },
      { token: 'BTN_CONFIRM_TICKET', label: 'Sí, generar ticket ✅', text: 'sí, generar ticket' },
      { token: 'BTN_CANCEL', label: 'Cancelar ❌', text: 'cancelar' },
      { token: 'BTN_MORE_SIMPLE', label: 'Explicar más simple', text: 'explicalo más simple' },
      { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español (Argentina)', text: 'Español (Argentina)' },
      { token: 'BTN_LANG_ES', label: '🌎 Español', text: 'Español (Latinoamérica)' },
      { token: 'BTN_LANG_EN', label: '🇬🇧 English', text: 'English' },
      { token: 'BTN_NO_NAME', label: 'Prefiero no decirlo', text: 'Prefiero no decirlo' },
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
function getButtonDefinition(token){
  if(!token || !CHAT?.ui?.buttons) return null;
  return CHAT.ui.buttons.find(b => String(b.token) === String(token)) || null;
}
function buildUiButtonsFromTokens(tokens = []){
  if(!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if(!t) return null;
    const def = getButtonDefinition(t);
    const label = def?.label || def?.text || (typeof t === 'string' ? t : String(t));
    const text  = def?.text  || label;
    return { token: String(t), label, text };
  }).filter(Boolean);
}
function buildExternalButtonsFromTokens(tokens = [], urlMap = {}) {
  if(!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if(!t) return null;
    const def = getButtonDefinition(t);
    const label = def?.label || def?.text || String(t);
    const url = urlMap[String(t)] || null;
    return { token: String(t), label, url, openExternal: !!url };
  }).filter(Boolean);
}

// ========================================================
// NLP & Name utilities
// ========================================================
const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function emojiForIndex(i){ const n = i+1; return NUM_EMOJIS[n] || `${n}.`; }
function enumerateSteps(arr){ if(!Array.isArray(arr)) return []; return arr.map((s,i)=>`${emojiForIndex(i)} ${s}`); }
const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;

const IT_HEURISTIC_RX = /\b(pc|computadora|compu|notebook|laptop|router|modem|wi[-\s]*fi|wifi|impresora|printer|tv\s*stick|stick\s*tv|amazon\s*stick|fire\s*stick|magistv|magis\s*tv|windows|android|correo|email|outlook|office|word|excel)\b/i;

const FRUSTRATION_RX = /(esto no sirve|no sirve para nada|qué porquería|que porquería|no funciona nada|estoy cansado de esto|me cansé de esto|ya probé todo|sigo igual|no ayuda|no me ayuda)/i;

const NAME_STOPWORDS = new Set([
  'hola','buenas','buenos','gracias','gracias!','gracias.','gracias,','help','ayuda','porfa','por favor','hola!','buenas tardes','buenas noches','buen dia','buen dí­a','si','no'
]);

const NAME_TOKEN_RX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,20}$/u;
const MAX_NAME_TOKENS = 3;
const MIN_NAME_TOKENS = 1;

function capitalizeToken(tok){
  if(!tok) return tok;
  return tok.split(/[-'’\u2019]/).map(part => {
    if (!part) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('-');
}

function isValidName(text){
  if(!text || typeof text !== 'string') return false;
  const s = String(text).trim();
  if(!s) return false;

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
    'pepelito','papelito','pepito','probando','aaaa','jjjj','zzzz','asdasd','qwerty','basurita','basura','tuerquita','chuchuki',
    'corcho','coco','pepe','toto','nene','nena','pibe','piba','guacho','wacho','bobo','boludo','pelotudo',
    'chicle','goma','lapiz','papel','mesa','silla','puerta','ventana','techo','piso','pared',
    'amigo','amiga','hermano','hermana','primo','prima','tio','tia','abuelo','abuela',
    'test','testing','prueba','ejemplo','admin','usuario','user','cliente','persona',
    'hola','chau','gracias','perdon','disculpa','sorry','hello','bye'
  ];
  if (blacklist.includes(s.toLowerCase())) return false;

  for (const tok of tokens) {
    // each token must match token regex
    if (!NAME_TOKEN_RX.test(tok)) return false;
    // token stripped of punctuation should be at least 2 chars
    if (tok.replace(/['’\-]/g,'').length < 2) return false;
  }

  // passed validations
  return true;
}

const isValidHumanName = isValidName;

function extractName(text){
  if(!text || typeof text !== 'string') return null;
  const sRaw = String(text).trim();
  if(!sRaw) return null;
  const s = sRaw.replace(/[.,!?]+$/,'').trim();

  // patterns: "me llamo X", "soy X", "mi nombre es X"
  const patterns = [
    /\b(?:me llamo|soy|mi nombre es|me presento como)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})$/i,
    /^\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})\s*$/i
  ];

  for (const rx of patterns){
    const m = s.match(rx);
    if (m && m[1]){
      let candidate = m[1].trim().replace(/\s+/g,' ');
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

function looksClearlyNotName(text){
  if(!text || typeof text !== 'string') return true;
  const s = text.trim().toLowerCase();
  if(!s) return true;

  // clear short greetings
  if (s.length <= 6 && ['hola','hola!','buenas','buenos','buen día','buen dia'].includes(s)) return true;

  if (NAME_STOPWORDS.has(s)) return true;

  if (TECH_WORDS.test(s)) return true;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) return true;

  const indicators = ['mi','no','enciende','tengo','problema','problemas','se','me','con','esta','está','tiene'];
  for (const w of words){ if (indicators.includes(w)) return true; }

  return false;
}

// OpenAI name analyzer - STRICT validation
async function analyzeNameWithOA(nameText = '') {
  if(!openai) return { isValid: false, confidence: 0, reason: 'no_openai' };
  const prompt = [
    "Sos un validador MUY ESTRICTO de nombres humanos reales en español (Argentina).",
    "",
    "RECHAZÁ automáticamente:",
    "- Apodos o sobrenombres: Coco, Pepe, Toto, Corcho, Chicle, Pibe, Nene, Gordo, Flaco, etc.",
    "- Palabras comunes: Mesa, Silla, Lapiz, Goma, Puerta, etc.",
    "- Saludos o expresiones: Hola, Gracias, Chau, etc.",
    "- Palabras inventadas o sin sentido: Aaaa, Zzzz, Asdasd, etc.",
    "- Nombres de marcas, objetos o conceptos",
    "- Cualquier texto que NO sea un nombre COMPLETO y REAL de una persona",
    "",
    "ACEPTÁ únicamente:",
    "- Nombres reales completos usados en Argentina: María, Juan, Ana, Carlos, Laura, José, Lucía, etc.",
    "- Nombres compuestos reales: María Elena, Juan Carlos, Ana Laura, José Luis, etc.",
    "",
    "Si tenés la mínima duda de que NO sea un nombre real, RECHAZALO.",
    "",
    "Respondé SOLO un JSON con {isValid: true|false, confidence: 0..1, reason: 'explicación clara'}.",
    `Texto a validar: "${String(nameText).replace(/"/g,'\\"')}"`
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
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g,'');
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

async function analyzeProblemWithOA(problemText = '', locale = 'es-AR'){
  if(!openai) {
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }

  const profile = getLocaleProfile(locale);
  const trimmed = String(problemText || '').trim();
  if(!trimmed){
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }

  const userText = trimmed.slice(0, 800);

  const systemMsg = profile.system;

  const prompt = [
    'Analizá (o analiza) el siguiente mensaje de un usuario final y decidí si es un problema de soporte de tecnología/computación o de dispositivos de streaming/SmartTV.',
    '',
    'Tu tarea es devolver SOLO JSON (sin explicación adicional), con este formato:',
    '{',
    '  "isIT": boolean,',
    '  "device": "pc" | "notebook" | "router" | "fire_tv" | "chromecast" | "roku" | "android_tv" | "apple_tv" | "smart_tv_samsung" | "smart_tv_lg" | "smart_tv_sony" | "smart_tv_generic" | null,',
    '  "issueKey": "no_prende" | "boot_issue" | "wifi_connectivity" | "remote_pairing" | "hdmi_signal" | "activation_error" | "app_crash" | "sound_issue" | "generic" | null,',
    '  "confidence": number between 0 and 1,',
    `  "language": "${profile.languageTag}"`,
    '}',
    '',
    'Algunos ejemplos rápidos:',
    '- "mi compu no prende" → isIT:true, device:"pc", issueKey:"no_prende"',
    '- "mi notebook no se conecta al wifi" → isIT:true, device:"notebook", issueKey:"wifi_connectivity"',
    '- "no puedo instalar magistv en el fire tv stick" → isIT:true, device:"fire_tv", issueKey:"app_crash" o "activation_error", elegí la más cercana con confidence alto.',
    '- "mi smart tv samsung no se conecta a internet" → isIT:true, device:"smart_tv_samsung", issueKey:"wifi_connectivity".',
    '- "tengo un problema con la heladera" → isIT:false',
    '',
    'Texto del usuario:',
    userText
  ].join('\n');

  try{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: 300,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const raw = r?.choices?.[0]?.message?.content || '';
    let parsed;
    try{
      const cleaned = raw.trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '');
      parsed = JSON.parse(cleaned);
    }catch(e){
      return { isIT: false, device: null, issueKey: null, confidence: 0 };
    }

    const isIT = !!parsed.isIT;
    const device = typeof parsed.device === 'string' ? parsed.device : null;
    const issueKey = typeof parsed.issueKey === 'string' ? parsed.issueKey : null;
    let confidence = Number(parsed.confidence || 0);
    if(!Number.isFinite(confidence) || confidence < 0) confidence = 0;
    if(confidence > 1) confidence = 1;

    return { isIT, device, issueKey, confidence };
  }catch(err){
    console.error('[analyzeProblemWithOA] error:', err?.message || err);
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }
}

async function aiQuickTests(problemText = '', device = '', locale = 'es-AR'){
  const profile = getLocaleProfile(locale);
  const trimmed = String(problemText || '').trim();
  if(!openai || !trimmed){
    // Fallback local sencillo, reutilizando idioma
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

  const prompt = [
    'Generá una lista corta de pasos numerados para ayudar a un usuario final a diagnosticar y resolver un problema técnico.',
    `El usuario habla en el idioma: ${profile.languageTag}.`,
    `Dispositivo (si se conoce): ${deviceLabel}.`,
    '',
    'IMPORTANTE:',
    '- Respondé SOLO en el idioma del usuario.',
    '- Devolvé la respuesta SOLO como un array JSON de strings (sin explicación extra).',
    '- Cada string debe describir un paso concreto, simple y seguro.',
    '- Evitá cualquier acción peligrosa o avanzada (no tocar BIOS, no usar comandos destructivos).',
    '',
    'Ejemplo de formato de salida:',
    '["Paso 1: ...", "Paso 2: ...", "Paso 3: ..."]',
    '',
    'Texto del usuario (descripción del problema):',
    userText
  ].join('\n');

  try{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 400,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const raw = r?.choices?.[0]?.message?.content || '';
    let parsed;
    try{
      const cleaned = raw.trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '');
      parsed = JSON.parse(cleaned);
    }catch(e){
      // Si no se pudo parsear como JSON, devolvemos un fallback simple.
      const isEn = profile.code === 'en';
      if (isEn) {
        return [
          'Restart the device and check if the problem persists.',
          'Verify cables and connections and check for visible damage.',
          'If possible, test the device on another TV, monitor or power outlet.',
          'If the problem persists, contact a technician with these details.'
        ];
      }
      return [
        'Reiniciá el equipo y fijate si el problema sigue.',
        'Revisá cables y conexiones y verificá que no haya daño visible.',
        'Si podés, probá el equipo en otro televisor, monitor o enchufe.',
        'Si el problema continúa, contactá a un técnico y comentale estos pasos que ya probaste.'
      ];
    }

    if(!Array.isArray(parsed) || !parsed.length){
      return [];
    }
    return parsed.map(s => String(s)).slice(0, 6);
  }catch(err){
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

async function getHelpForStep(stepText = '', stepIndex = 1, device = '', problem = '', locale = 'es-AR'){
  const profile = getLocaleProfile(locale);
  const isEn = profile.code === 'en';
  if(!openai){
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

  try{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 400,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const raw = r?.choices?.[0]?.message?.content || '';
    return raw.trim();
  }catch(err){
    console.error('[getHelpForStep] error:', err?.message || err);
    if (isEn) {
      return `Step ${stepIndex}: ${stepText}\n\nTry to follow it calmly. If you get stuck, tell me exactly at which part you got blocked and I will guide you.`;
    }
    return `Paso ${stepIndex}: ${stepText}\n\nIntentá seguirlo con calma. Si te trabás en alguna parte, decime exactamente en cuál y te voy guiando.`;
  }
}

// ========================================================
// Express app, endpoints, and core chat flow
// ========================================================
// Express app, endpoints, and core chat flow
// ========================================================
const app = express();
// CORS: lista blanca de orígenes permitidos (configurable vía ALLOWED_ORIGINS)
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://stia.com.ar', 'https://www.stia.com.ar', 'http://localhost:3000', 'http://localhost:5173'];

app.use(cors({ 
  origin: (origin, callback) => {
    // Permite requests sin origin (ej: mobile apps, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true 
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

// Content Security Policy para PWA
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://stia.com.ar https://api.openai.com https://sti-rosario-ai.onrender.com; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "manifest-src 'self' https://stia.com.ar;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CORS para PWA desde dominio principal
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
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

const STATES = {
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  ASK_DEVICE: 'ask_device',
  BASIC_TESTS: 'basic_tests',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
  ENDED: 'ended'
};

function getSessionId(req){
  const h = (req.headers['x-session-id']||'').toString().trim();
  const b = (req.body && (req.body.sessionId||req.body.sid)) ? String(req.body.sessionId||req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId||req.query.sid)) ? String(req.query.sessionId||req.query.sid).trim() : '';
  return h || b || q || `srv-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
app.use((req,_res,next)=>{ req.sessionId = getSessionId(req); next(); });

// Health & maintenance endpoints
app.get('/api/health', (_req,res) => {
  res.json({ ok:true, hasOpenAI: !!process.env.OPENAI_API_KEY, openaiModel: OPENAI_MODEL, version: CHAT?.version || 'embedded' });
});
app.post('/api/reload', (_req,res)=>{ try{ res.json({ ok:true, version: CHAT.version||null }); } catch(e){ res.status(500).json({ ok:false, error: e.message }); } });

// Transcript retrieval
app.get('/api/transcript/:sid', (req,res)=>{
  const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if(!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type','text/plain; charset=utf-8');
  try {
    const raw = fs.readFileSync(file,'utf8');
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
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) {
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
      try { res.end(); } catch(_) {}
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
      try { res.end(); } catch (_) {}
      console.log('[logs] SSE cliente desconectado. total=', sseClients.size);
    });
  } catch (e) {
    console.error('[logs/stream] Error', e && e.message);
    try { res.status(500).end(); } catch(_) {}
  }
});

app.get('/api/logs', (req, res) => {
  if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) {
    return res.status(401).json({ ok:false, error: 'unauthorized' });
  }
  try {
    const txt = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
    res.set('Content-Type','text/plain; charset=utf-8');
    res.send(txt);
  } catch (e) {
    console.error('[api/logs] Error', e.message);
    res.status(500).json({ ok:false, error: e.message });
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

app.post('/api/whatsapp-ticket', async (req,res)=>{
  try{
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
    if((!transcript || transcript.length===0) && sid){
      const s = await getSession(sid);
      if(s?.transcript) transcript = s.transcript;
    }

    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const nowDate = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR',{
      timeZone: 'America/Argentina/Buenos_Aires',
      day:'2-digit', month:'2-digit', year:'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('es-AR',{
      timeZone: 'America/Argentina/Buenos_Aires',
      hour:'2-digit', minute:'2-digit', hour12:false
    });
    const datePart = dateFormatter.format(nowDate).replace(/\//g,'-');
    const timePart = timeFormatter.format(nowDate);
    const generatedLabel = `${datePart} ${timePart} (ART)`;
    let safeName = '';
    if(name){ 
      safeName = String(name)
        .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'')
        .replace(/\s+/g,' ')
        .trim()
        .toUpperCase(); 
    }
    const titleLine = safeName ? `STI • Ticket ${ticketId}-${safeName}` : `STI • Ticket ${ticketId}`;
    const lines = [];
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if(name) lines.push(`Cliente: ${name}`);
    if(device) lines.push(`Equipo: ${device}`);
    if(sid) lines.push(`Sesión: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');

    const transcriptData = [];
    for(const m of transcript || []){
      const rawText = (m.text || '').toString();
      const safeText = maskPII(rawText);
      lines.push(`[${m.ts||now.toISOString()}] ${m.who||'user'}: ${safeText}`);
      transcriptData.push({
        ts: m.ts || now.toISOString(),
        who: m.who || 'user',
        text: safeText
      });
    }

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){ /* noop */ }
    const ticketPathTxt = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPathTxt, lines.join('\n'), 'utf8');

    const ticketJson = {
      id: ticketId,
      createdAt: now.toISOString(),
      label: generatedLabel,
      name: name || null,
      device: device || null,
      sid: sid || null,
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
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.`
      : (CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:');
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if(name) waText += `Cliente: ${name}\n`;
    if(device) waText += `Equipo: ${device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;
    waText += `\n\nAviso: al enviar esto, parte de esta conversación se comparte con un técnico de STI vía WhatsApp. No incluyas contraseñas ni datos bancarios.`;

    const waNumberRaw = String(process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422');
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g,'');
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
      ok:true, 
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
  } catch(e){ 
    console.error('[whatsapp-ticket]', e); 
    res.status(500).json({ ok:false, error: e.message }); 
  }
});

// ticket public routes
app.get('/api/ticket/:tid', (req, res) => {
  const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error: 'not_found' });

  const raw = fs.readFileSync(file,'utf8');
  const maskedRaw = maskPII(raw);

  // parse lines into messages: expected lines like "[TIMESTAMP] who: text"
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

  res.json({ ok:true, ticketId: tid, content: maskedRaw, messages });
});

// Pretty ticket view
app.get('/ticket/:tid', (req, res) => {
  const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('ticket no encontrado');

  const raw = fs.readFileSync(file,'utf8');
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

  res.set('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

// Reset session
app.post('/api/reset', async (req,res)=>{
  const sid = req.sessionId;
  const empty = {
    id: sid,
    userName: null,
    stage: STATES.ASK_NAME,
    device:null,
    problem:null,
    issueKey:null,
    tests:{ basic:[], ai:[], advanced:[] },
    stepsDone:[],
    fallbackCount:0,
    waEligible:false,
    transcript:[],
    pendingUtterance:null,
    lastHelpStep:null,
    startedAt: nowIso(),
    nameAttempts: 0,
    stepProgress: {},
    pendingDeviceGroup: null
  };
  await saveSession(sid, empty);
  res.json({ ok:true });
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

// Greeting endpoint
app.all('/api/greeting', async (req,res)=>{
  try{
    const sid = req.sessionId;

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

    const fresh = {
      id: sid,
      userName: null,
      stage: STATES.ASK_NAME,
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
      userLocale: locale
    };
    const text = buildNameGreeting(locale);
    const langPrompt = buildLanguagePrompt(locale);
    const fullGreeting = `${text}\n\n${langPrompt}`;
    fresh.transcript.push({ who:'bot', text: fullGreeting, ts: nowIso() });
    await saveSession(sid, fresh);
    const langOptions = ['BTN_LANG_ES_AR','BTN_LANG_ES','BTN_LANG_EN'];
    return res.json(withOptions({
      ok: true,
      greeting: fullGreeting,
      reply: fullGreeting,
      stage: fresh.stage,
      sessionId: sid,
      options: langOptions
    }));
  } catch(e){
    console.error(e);
    return res.status(500).json({ ok:false, error:'greeting_failed' });
  }
});

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
      return res.json(withOptions({
        ok: false,
        reply: '⏳ Ya estoy generando tu ticket. Esperá unos segundos...',
        stage: session.stage,
        options: []
      }));
    }
  }
  ticketCreationLocks.set(sid, Date.now());
  
  const ts = nowIso();
  try {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
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
    return res.json(resp);
  } catch (err) {
    console.error('[createTicketAndRespond] Error', err && err.message);
    ticketCreationLocks.delete(sid); // Liberar lock en error
    session.waEligible = false;
    await saveSession(sid, session);
    return res.json(withOptions({
      ok: false,
      reply: '❗ Ocurrió un error al generar el ticket. Si querés, podés intentar de nuevo en unos minutos o contactar directamente a STI por WhatsApp.',
      stage: session.stage,
      options: [BUTTONS.CLOSE]
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
    session.transcript.push({ who:'bot', text: replyTxt, ts });
    await saveSession(sid, session);
    return { ok:true, reply: replyTxt, stage: session.stage, options: ['Lo pude solucionar ✔️','El problema persiste ❌'] };
  } else {
    const replyTxt = `${prefix} 😊.\n\nDecime sobre qué paso querés ayuda (1, 2, 3, ...) o tocá el botón del número y te lo explico con más calma.`;
    const ts = nowIso();
    session.transcript.push({ who:'bot', text: replyTxt, ts });
    await saveSession(sid, session);
    return { ok:true, reply: replyTxt, stage: session.stage, options: ['Lo pude solucionar ✔️','El problema persiste ❌'] };
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
  const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
  const intro = stepsKey === 'advanced' 
    ? `Volvemos a las pruebas avanzadas, ${whoLabel}:`
    : `Volvemos a los pasos sugeridos:`;
  const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
  const fullMsg = intro + '\n\n' + numbered + footer;
  
  const helpOptions = stepsAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
  const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
  
  return { error: false, msg: fullMsg, options: optionsResp, steps: stepsAr };
}

// ========================================================
// Generate and present diagnostic steps (used in ASK_PROBLEM and after selecting device)
// ========================================================
async function generateAndShowSteps(session, sid, res){
  try {
    const issueKey = session.issueKey;
    const device = session.device || null;
    const locale = session.userLocale || 'es-AR';
    const profile = getLocaleProfile(locale);
    const isEn = profile.code === 'en';
    const isEsLatam = profile.code === 'es-419';

    const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length>0);

    // Playbook local para dispositivos de streaming / SmartTV (prioridad en español)
    let steps;
    const playbookForDevice = device && issueKey && DEVICE_PLAYBOOKS?.[device]?.[issueKey];
    if (!isEn && playbookForDevice && Array.isArray(playbookForDevice.es) && playbookForDevice.es.length>0) {
      steps = playbookForDevice.es.slice(0,4);
    } else if (hasConfiguredSteps) {
      steps = CHAT.nlp.advanced_steps[issueKey].slice(0,4);
    } else {
      let aiSteps = [];
      try {
        aiSteps = await aiQuickTests(session.problem || '', device || '', locale);
      } catch(e){
        aiSteps = [];
      }
      if(Array.isArray(aiSteps) && aiSteps.length>0) steps = aiSteps.slice(0,4);
      else {
        if (isEn) {
          steps = [
            'Restart the device completely (turn it off, unplug it for 30 seconds and plug it back in).',
            'Check that all cables and connections are firmly plugged in (power, HDMI, network).',
            'If possible, test the device on another TV, monitor or power outlet.',
            'If the issue persists, contact a technician and share these steps you already tried.'
          ];
        } else {
          steps = [
            'Reiniciá el equipo por completo (apagalo, desenchufalo 30 segundos y volvé a enchufarlo).',
            'Revisá que todos los cables y conexiones estén firmes (corriente, HDMI, red).',
            'Si podés, probá el equipo en otro televisor, monitor o enchufe.',
            'Si el problema sigue, contactá a un técnico y comentale estos pasos que ya probaste.'
          ];
        }
      }
    }

    session.stage = STATES.BASIC_TESTS;
    session.basicTests = steps;
    session.currentTestIndex = 0;

    const who = session.userName ? capitalizeToken(session.userName) : null;
    const deviceLabel = device || (isEn ? 'equipo' : 'equipo');
    const pSummary = (session.problem || '').trim().slice(0,200);

    let intro;
    if (isEn) {
      intro = who
        ? `Perfect, ${who}: so with your ${deviceLabel} this is happening: "${pSummary}".\n\nLet us try a few simple steps together:`
        : `Perfect: so with your ${deviceLabel} this is happening: "${pSummary}".\n\nLet us try a few simple steps together:`;
    } else if (isEsLatam) {
      intro = who
        ? `Perfecto, ${who}: entonces con tu ${deviceLabel} pasa esto: "${pSummary}".\n\nVamos a probar unos pasos sencillos juntos:`
        : `Perfecto: entonces con tu ${deviceLabel} pasa esto: "${pSummary}".\n\nVamos a probar unos pasos sencillos juntos:`;
    } else {
      intro = who
        ? `Perfecto, ${who}: entonces con tu ${deviceLabel} pasa esto: "${pSummary}".\n\nVamos a probar unos pasos sencillos juntos:`
        : `Perfecto: entonces con tu ${deviceLabel} pasa esto: "${pSummary}".\n\nVamos a probar unos pasos sencillos juntos:`;
    }

    function enumerateSteps(list){
      return list.map((s,idx) => `${idx+1}. ${s}`).join('\n');
    }

    const stepsText = enumerateSteps(steps);

    let footer;
    if (isEn) {
      footer = '\n\nWhen you complete the steps, let me know:\n' +
        '- If the problem was solved, choose "Lo pude solucionar ✔️".\n' +
        '- If it persists, choose "El problema persiste ❌".\n' +
        'You can also tell me "I did not understand step X" and I will explain it in more detail.';
    } else {
      footer = '\n\nCuando completes los pasos, contame:\n' +
        '- Si se solucionó, elegí "Lo pude solucionar ✔️".\n' +
        '- Si sigue igual, elegí "El problema persiste ❌".\n' +
        'También podés decirme "No entendí el paso X" y te lo explico con más detalle.';
    }

    const reply = `${intro}\n\n${stepsText}${footer}`;

    const options = [
      BUTTONS.SOLVED,
      BUTTONS.PERSIST,
      BUTTONS.MORE_TESTS,
      BUTTONS.CONNECT_TECH
    ];

    const payload = withOptions({ ok:true, reply }, options);
    await saveSession(sid, session);
    return res.status(200).json(payload);
  } catch(err){
    console.error('[generateAndShowSteps] error:', err?.message || err);
    return res.status(200).json(withOptions({
      ok:true,
      reply: '😅 Tuve un problema al preparar los pasos. Probá de nuevo o contame si querés que conecte con un técnico.'
    }));
  }
}

// ========================================================
// Core chat endpoint: /api/chat
// ========================================================
app.post('/api/chat', async (req,res)=>{
  try {
    const body = req.body || {};
    const tokenMap = {};
    if (Array.isArray(CHAT?.ui?.buttons)) {
      for (const b of CHAT.ui.buttons) {
        if (b.token) tokenMap[b.token] = b.text || '';
      }
    }

    let incomingText = String(body.text || '').trim();
    let buttonToken = null;
    let buttonLabel = null;

    if (body.action === 'button' && body.value) {
      buttonToken = String(body.value);
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
    const sid = req.sessionId;
    let session = await getSession(sid);
    if (!session) {
      session = {
        id: sid,
        userName: null,
        stage: STATES.ASK_NAME,
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
        helpAttempts: {},
        frustrationCount: 0,
        pendingAction: null
      };
      console.log('[api/chat] nueva session', sid);
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
        return res.json(withOptions({ ok:false, reply: failReply, stage: session.stage, options: [BUTTONS.CLOSE] }));
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
      await saveSession(sid, session);
      const loc = session.userLocale || 'es-AR';
      const isEnFr = String(loc).toLowerCase().startsWith('en');
      let replyFr;
      let optsFr;
      if (isEnFr) {
        replyFr = "Sorry if I wasn’t clear. We can try one more quick thing or I can create a ticket so a human technician can help you. What do you prefer?";
        optsFr = [BUTTONS.MORE_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
      } else {
        replyFr = "Perdón si no fui claro. Podemos probar una cosa rápida más o genero un ticket para que te ayude un técnico humano. ¿Qué preferís?";
        optsFr = [BUTTONS.MORE_TESTS, BUTTONS.CONNECT_TECH, BUTTONS.CLOSE];
      }
      return res.json(withOptions({
        ok: true,
        reply: replyFr,
        stage: session.stage,
        options: optsFr
      }));
    }
    // Selección de idioma (puede usarse al inicio del chat)
    if (buttonToken === 'BTN_LANG_ES_AR' || buttonToken === 'BTN_LANG_ES' || buttonToken === 'BTN_LANG_EN') {
      let locale = 'es-AR';
      if (buttonToken === 'BTN_LANG_EN') {
        locale = 'en';
      } else if (buttonToken === 'BTN_LANG_ES') {
        locale = 'es-419';
      } else {
        locale = 'es-AR';
      }
      session.userLocale = locale;
      const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
      let reply;
      if (locale === 'en') {
        reply = whoLabel
          ? `Great, ${whoLabel}. We'll continue in English. What problem are you having or what do you need help with?`
          : "Great, we'll continue in English. What's your name?";
      } else if (locale === 'es-419') {
        reply = whoLabel
          ? `Perfecto, ${whoLabel}. Seguimos en español neutro. Ahora contame: ¿qué problema estás teniendo o en qué necesitas ayuda?`
          : 'Perfecto, seguimos en español neutro. Para ayudarte mejor, ¿cómo te llamas?';
      } else {
        reply = whoLabel
          ? `Perfecto, ${whoLabel}. Seguimos en español (Argentina). Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`
          : 'Perfecto, seguimos en español (Argentina). Para ayudarte mejor, ¿cómo te llamás?';
      }
      const tsLang = nowIso();
      session.stage = whoLabel ? STATES.ASK_PROBLEM : STATES.ASK_NAME;
      session.transcript.push({ who: 'bot', text: reply, ts: tsLang });
      await saveSession(sid, session);
      return res.json(withOptions({
        ok: true,
        reply,
        stage: session.stage,
        options: session.stage === STATES.ASK_NAME ? ['BTN_NO_NAME'] : []
      }));
    }

    // Cerrar chat de forma prolija (movido fuera del bloque de creación)
    if (buttonToken === 'BTN_CLOSE' || /^\s*cerrar\s+chat\b/i.test(t)) {
      const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
      const replyClose = `Gracias por usar Tecnos de STI — Servicio Técnico Inteligente, ${whoLabel}. Si más adelante necesitás ayuda con tu PC o dispositivos, podés volver a escribir por acá. 😉`;
      const tsClose = nowIso();
      session.stage = STATES.ENDED;
      session.waEligible = false;
      session.transcript.push({ who:'bot', text: replyClose, ts: tsClose });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: replyClose, stage: session.stage, options: [] }));
    }

    // Quick escalate via button or text (confirmation step)
    if (buttonToken === 'BTN_WHATSAPP' || /^\s*(?:enviar\s+whats?app|hablar con un tecnico|enviar whatsapp)$/i.test(t) ) {
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
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
        }

        if (idx < 1 || idx > steps.length) {
          const msg = `Paso inválido. Elegí un número entre 1 y ${steps.length}.`;
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
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

        const userMsg = buttonToken ? `[BOTON] ${buttonLabel || ('BTN_HELP_' + idx)}` : `ayuda paso ${idx}`;
        session.transcript.push({ who:'user', text: userMsg, ts });
        session.transcript.push({ who:'bot', text: reply, ts });
        await saveSession(sid, session);

        try {
          const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
          const userLine = `[${ts}] USER: ${userMsg}\n`;
          const botLine  = `[${ts}] ASSISTANT: ${reply}\n`;
          fs.appendFile(tf, userLine, ()=>{});
          fs.appendFile(tf, botLine, ()=>{});
        } catch(e){ /* noop */ }

        const unifiedOpts = ['Lo pude solucionar ✔️', 'Volver a mostrar los pasos. ⏪'];
        return res.json(withOptions({ ok:true, help:{ stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: unifiedOpts }));
      } catch (err) {
        console.error('[help_step] Error generando ayuda:', err && err.message);
        const msg = 'No pude preparar la ayuda ahora. Probá de nuevo en unos segundos.';
        session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
      }
    }

    // Handle "Prefiero no decirlo"
    const NO_NAME_RX = /^\s*(?:prefiero\s+no\s+decir(?:l[aeo])?|prefiero\s+no\s+dar\s+mi\s+nombre|no\s+quiero\s+decir\s+mi\s+nombre|no\s+deseo\s+decir\s+mi\s+nombre|prefiero\s+reservarme\s+el\s+nombre)\s*$/i;
    if (buttonToken || NO_NAME_RX.test(t)) {
      const btnText = (buttonLabel || buttonToken || incomingText || '').toString().trim();
      if (NO_NAME_RX.test(btnText)) {
        try {
          session.userName = 'Usuario';
          session.stage = STATES.ASK_PROBLEM;
          const reply = 'Perfecto. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?';
          const ts = nowIso();
          session.transcript.push({ who: 'user', text: btnText, ts });
          session.transcript.push({ who: 'bot', text: reply, ts });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
        } catch (e) {
          console.error('[prefiero-no-decirlo] Error', e && e.message);
        }
      }
    }

    // Record user message in transcript (masked for PII)
    const userTs = nowIso();
    if (buttonToken) {
      const safeUserText = maskPII(`[BOTON] ${buttonLabel} (${buttonToken})`);
      session.transcript.push({ who: 'user', text: safeUserText, ts: userTs });
    } else {
      const safeUserText = maskPII(t);
      session.transcript.push({ who: 'user', text: safeUserText, ts: userTs });
    }
    
    // Limitar transcript a últimos 100 mensajes para prevenir crecimiento indefinido
    if (session.transcript.length > 100) {
      session.transcript = session.transcript.slice(-100);
    }

    // ASK_NAME consolidated: validate locally and with OpenAI if available
    if (session.stage === STATES.ASK_NAME) {
      // Límite de intentos: después de 5 intentos, asignar nombre genérico y continuar
      if ((session.nameAttempts || 0) >= 5) {
        session.userName = 'Usuario';
        session.stage = STATES.ASK_PROBLEM;
        const reply = 'Sigamos adelante. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?';
        const ts = nowIso();
        session.transcript.push({ who: 'bot', text: reply, ts });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      }
      
      if (looksClearlyNotName(t)) {
        session.nameAttempts = (session.nameAttempts || 0) + 1;
        await saveSession(sid, session);
        const reply = 'No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: "Ana" o "Juan Pablo".';
        const ts = nowIso();
        session.transcript.push({ who:'bot', text: reply, ts });
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options:['Prefiero no decirlo'] }));
      }

      const candidate = extractName(t);
      if (candidate && isValidHumanName(candidate)) {
        // MANDATORY OpenAI validation when available
        if (openai) {
          const oa = await analyzeNameWithOA(candidate);
          console.log('[name-validation] OpenAI result:', { candidate, isValid: oa.isValid, confidence: oa.confidence, reason: oa.reason });
          
          // Rechazar si OpenAI dice que NO es válido con confianza >= 0.4 (umbral estricto)
          if (!oa.isValid && oa.confidence >= 0.4) {
            session.nameAttempts = (session.nameAttempts || 0) + 1;
            await saveSession(sid, session);
            const reply = `Ese nombre no parece real (${oa.reason}). ¿Podés decirme tu nombre verdadero o tocar "Prefiero no decirlo"?`;
            const ts = nowIso();
            session.transcript.push({ who:'bot', text: reply, ts });
            return res.json(withOptions({ ok:true, reply, stage: session.stage, options:['Prefiero no decirlo'] }));
          }
          
          // Rechazar también si OpenAI dice que SÍ es válido pero con confianza muy baja
          if (oa.isValid && oa.confidence < 0.7) {
            session.nameAttempts = (session.nameAttempts || 0) + 1;
            await saveSession(sid, session);
            const reply = 'No estoy seguro de que ese sea un nombre real. ¿Podés escribirlo de nuevo o tocar "Prefiero no decirlo"?';
            const ts = nowIso();
            session.transcript.push({ who:'bot', text: reply, ts });
            return res.json(withOptions({ ok:true, reply, stage: session.stage, options:['Prefiero no decirlo'] }));
          }
        } else {
          // Si NO hay OpenAI, rechazar por defecto para ser más estrictos
          session.nameAttempts = (session.nameAttempts || 0) + 1;
          await saveSession(sid, session);
          const reply = 'No puedo validar nombres en este momento. Por favor, tocá "Prefiero no decirlo" para continuar.';
          const ts = nowIso();
          session.transcript.push({ who:'bot', text: reply, ts });
          return res.json(withOptions({ ok:true, reply, stage: session.stage, options:['Prefiero no decirlo'] }));
        }

        session.userName = candidate;
        session.stage = STATES.ASK_PROBLEM;
        const reply = `Gracias, ${capitalizeToken(session.userName)}. 👍

Estoy para ayudarte con tu PC, notebook, WiFi o impresora. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
        const ts = nowIso();
        session.transcript.push({ who:'bot', text: reply, ts });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      }

      session.nameAttempts = (session.nameAttempts || 0) + 1;
      await saveSession(sid, session);
      const reply = 'Escribime solo tu nombre, por ejemplo: "María" o "Juan Pablo".';
      const ts2 = nowIso();
      session.transcript.push({ who:'bot', text: reply, ts: ts2 });
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options:['Prefiero no decirlo'] }));
    }

    // Inline fallback extraction (if we are not in ASK_NAME)
    {
      const nmInline2 = extractName(t);
      if(nmInline2 && !session.userName && isValidHumanName(nmInline2)){
        session.userName = nmInline2;
        if(session.stage === STATES.ASK_NAME){
          session.stage = STATES.ASK_PROBLEM;
          const reply = `¡Genial, ${session.userName}! 👍\n\nEstoy para ayudarte con tu PC, notebook, WiFi o impresora. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
          session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
          await saveSession(sid, session);
          return res.json({ ok:true, reply, stage: session.stage, options: [] });
        }
      }
    }

    // Reformulate problem
    if (/^\s*reformular\s*problema\s*$/i.test(t)) {
      const whoName = session.userName ? capitalizeToken(session.userName) : 'usuario';
      const reply = `¡Intentemos nuevamente, ${whoName}! 👍\n\nAhora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
      session.stage = STATES.ASK_PROBLEM;
      session.problem = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    }

    // State machine core: ASK_PROBLEM -> ASK_DEVICE -> BASIC_TESTS -> ...
    let reply = '';
    let options = [];

    if (session.stage === STATES.ASK_PROBLEM){
      session.problem = t || session.problem;

// Device disambiguation: when user mentions "pc / compu / computadora" but device is still unknown
if (!session.device) {
  const mWord = (session.problem || '').match(/\b(compu|computadora|ordenador|pc)\b/i);
  if (mWord) {
    const rawWord = mWord[1];
    let shownWord;
    if (/^pc$/i.test(rawWord)) shownWord = 'PC';
    else if (/^compu$/i.test(rawWord)) shownWord = 'la compu';
    else shownWord = rawWord.toLowerCase();
    session.stage = STATES.ASK_DEVICE;
    session.pendingDeviceGroup = 'compu';
    const replyText = `Perfecto. Cuando decís "${shownWord}", ¿a cuál de estos dispositivos te referís?`;
    const optionTokens = ['BTN_DEV_PC_DESKTOP','BTN_DEV_PC_ALLINONE','BTN_DEV_NOTEBOOK'];
    const uiButtons = buildUiButtonsFromTokens(optionTokens);
    const ts = nowIso();
    session.transcript.push({ who:'bot', text: replyText, ts });
    await saveSession(sid, session);
    
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

      // OA analyze problem (optional)
      const ai = await analyzeProblemWithOA(session.problem || '');
      const isIT = !!ai.isIT && (ai.confidence >= OA_MIN_CONF);
      if(!isIT){
        const replyNotIT = 'Disculpa, no entendí tu problema o no es informático. ¿Querés reformular el problema?';
        session.transcript.push({ who:'bot', text: replyNotIT, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: replyNotIT, stage: session.stage, options: ['Reformular Problema'] }));
      }
      if(ai.device) session.device = session.device || ai.device;
      if(ai.issueKey) session.issueKey = session.issueKey || ai.issueKey;

      // Generate and show steps
      return await generateAndShowSteps(session, sid, res);

    } else if (session.stage === STATES.ASK_DEVICE) {
      // Fallback handler for ASK_DEVICE
      if (!buttonToken || !/^BTN_DEV_/.test(buttonToken)) {
        const replyText = 'Por favor, elegí una de las opciones con los botones que te mostré.';
        session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
        await saveSession(sid, session);
        const optionTokens = ['BTN_DEV_PC_DESKTOP','BTN_DEV_PC_ALLINONE','BTN_DEV_NOTEBOOK'];
        return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: optionTokens }));
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
          if (!session.problem || String(session.problem||'').trim()==='') {
            session.stage = STATES.ASK_PROBLEM;
            const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
            const replyText = `Perfecto, ${whoLabel}. Tomo que te referís a ${devCfg.label}. Contame, ¿qué problema presenta?`;
            session.transcript.push({ who:'bot', text: replyText, ts: nowIso() });
            await saveSession(sid, session);
            return res.json(withOptions({ ok:true, reply: replyText, stage: session.stage, options: [] }));
          } else {
            // Provide short confirmation then show steps
            session.stage = STATES.ASK_PROBLEM;
            const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
            const replyIntro = `Perfecto, ${whoLabel}. Tomo que te referís a ${devCfg.label}. Voy a generar algunos pasos para este problema:`;
            const ts = nowIso();
            session.transcript.push({ who:'bot', text: replyIntro, ts });
            await saveSession(sid, session);
            // proceed to generate steps
            return await generateAndShowSteps(session, sid, res);
          }
        }
      }

      const fallbackMsg = 'No reconozco esa opción. Elegí por favor usando los botones.';
      session.transcript.push({ who:'bot', text: fallbackMsg, ts: nowIso() });
      await saveSession(sid, session);
      const optionTokens = ['BTN_DEV_PC_DESKTOP','BTN_DEV_PC_ALLINONE','BTN_DEV_NOTEBOOK'];
      return res.json(withOptions({ ok:true, reply: fallbackMsg, stage: session.stage, options: optionTokens }));
    } else if (session.stage === STATES.BASIC_TESTS) {
      const rxDontKnow = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
      if (rxDontKnow.test(t)) {
        const result = await handleDontUnderstand(session, sid, t);
        return res.json(withOptions(result));
      }

      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
      const rxNo  = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
      const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico)$/i;
      const rxShowSteps = /^\s*(volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShowSteps.test(t)) {
        const result = handleShowSteps(session, 'basic');
        if (result.error) {
          session.transcript.push({ who:'bot', text: result.msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: result.msg, stage: session.stage, options: [] }));
        }
        session.transcript.push({ who:'bot', text: result.msg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: result.msg, stage: session.stage, options: result.options, steps: result.steps }));
      }

      if (rxYes.test(t)){
        const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
        const firstLine = whoLabel
          ? `¡Me alegro que lo hayas podido resolver, ${whoLabel}! 🙌`
          : '¡Me alegro que lo hayas podido resolver! 🙌';
        reply = `${firstLine}\n\nSi en algún momento vuelve a fallar, podés abrir de nuevo el chat de Tecnos y seguimos desde donde lo dejamos.\n\nPodés seguirnos en Instagram para tips y novedades: https://instagram.com/sti.rosario\nY visitar nuestra web de STI — Servicio Técnico Inteligente para servicios y soporte: https://stia.com.ar 🚀\n\nGracias por usar Tecnos de STI — Servicio Técnico Inteligente. 😉`;
        session.stage = STATES.ENDED;
        session.waEligible = false;
        options = [];
      } else if (rxNo.test(t)){
        reply = `💡 Entiendo. ¿Querés probar algunas soluciones extra o que te conecte con un técnico?`;
        options = ['BTN_MORE_TESTS','BTN_CONNECT_TECH'];
        session.stage = STATES.ESCALATE;
      } else if (rxTech.test(t)) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        reply = `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o elegir 1/2.`;
        options = ['BTN_SOLVED','BTN_PERSIST'];
      }
    } else if (session.stage === STATES.ESCALATE) {
      const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas)/i;
      const opt2 = /^\s*(?:2\b|2️⃣\b|dos|conectar con t[eé]cnico|conectar con tecnico)/i;
      const isOpt1 = opt1.test(t) || buttonToken === 'BTN_MORE_TESTS';
      const isOpt2 = opt2.test(t) || buttonToken === 'BTN_CONNECT_TECH';
      
      if (isOpt1){
        try {
          const device = session.device || '';
          let aiSteps = [];
          try { aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e){ aiSteps = []; }
          const limited = Array.isArray(aiSteps) ? aiSteps.slice(0,4) : [];
          session.tests = session.tests || {};
          session.tests.advanced = limited;
          if (!limited || limited.length === 0) return await createTicketAndRespond(session, sid, res);
          session.stepProgress = session.stepProgress || {};
          limited.forEach((_,i)=> session.stepProgress[`adv_${i+1}`] = 'pending');
          const numbered = enumerateSteps(limited);
          const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
          const intro = `Entiendo, ${whoLabel}. Probemos ahora con algunas pruebas más avanzadas:`;
          const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
          const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
          session.stepsDone = session.stepsDone || [];
          session.stepsDone.push('advanced_tests_shown');
          session.waEligible = false;
          session.lastHelpStep = null;
          session.stage = STATES.ADVANCED_TESTS;
          session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);
          const helpOptions = limited.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
          const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
          return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: limited }));
        } catch (errOpt1) {
          console.error('[ESCALATE][more_tests] Error', errOpt1 && errOpt1.message);
          reply = 'Ocurrió un error generando más pruebas. Probá de nuevo o pedime que te conecte con un técnico.';
          session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply, stage: session.stage, options: ['BTN_CONNECT_TECH'] }));
        }
      } else if (isOpt2){
        return await createTicketAndRespond(session, sid, res);
      } else {
        reply = 'Decime si querés probar más soluciones o conectar con un técnico.';
        options = ['BTN_MORE_TESTS','BTN_CONNECT_TECH'];
      }
    } else if (session.stage === STATES.ADVANCED_TESTS) {
      const rxDontKnowAdv = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
      if (rxDontKnowAdv.test(t)) {
        const result = await handleDontUnderstand(session, sid, t);
        return res.json(withOptions(result));
      }

      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
      const rxNo  = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
      const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico)$/i;
      const rxShowSteps = /^\s*(volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShowSteps.test(t)) {
        const result = handleShowSteps(session, 'advanced');
        if (result.error) {
          session.transcript.push({ who:'bot', text: result.msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: result.msg, stage: session.stage, options: [] }));
        }
        session.transcript.push({ who:'bot', text: result.msg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: result.msg, stage: session.stage, options: result.options, steps: result.steps }));
      }

      if (rxYes.test(t)){
        const idx = session.lastHelpStep;
        if (typeof idx === 'number' && idx >= 1) {
          session.stepProgress = session.stepProgress || {};
          session.stepProgress[`adv_${idx}`] = 'done';
          await saveSession(sid, session);
        }
        const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
        const firstLine = whoLabel
          ? `¡Excelente, ${whoLabel}! 🙌`
          : '¡Excelente, me alegra que lo hayas podido resolver! 🙌';
        reply = `${firstLine}\n\nSi más adelante vuelve a fallar, podés volver a abrir el chat y retomamos el diagnóstico juntos.`;
        session.stage = STATES.ENDED;
        session.waEligible = false;
        options = [];
      } else if (rxNo.test(t)){
        reply = `Entiendo. ¿Querés que te conecte con un técnico para que lo vean más a fondo?`;
        options = ['BTN_CONNECT_TECH'];
        session.stage = STATES.ESCALATE;
      } else if (rxTech.test(t)) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        reply = `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o pedir conectar con técnico.`;
        options = ['BTN_SOLVED','BTN_PERSIST','BTN_CONNECT_TECH'];
      }
    } else {
      reply = 'No estoy seguro cómo responder eso ahora. Podés reiniciar o escribir "Reformular Problema".';
      options = ['Reformular Problema'];
    }

    // Save bot reply + persist transcripts to file (single ts pair)
    const pairTs = nowIso();
    session.transcript.push({ who:'bot', text: reply, ts: pairTs });
    await saveSession(sid, session);
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      const userLine = `[${pairTs}] USER: ${buttonToken ? '[BOTON] ' + buttonLabel : t}\n`;
      const botLine  = `[${pairTs}] ASSISTANT: ${reply}\n`;
      fs.appendFile(tf, userLine, ()=>{});
      fs.appendFile(tf, botLine, ()=>{});
    } catch(e){ /* noop */ }

    const response = withOptions({ ok:true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;

    try {
      const areAllTokens = Array.isArray(options) && options.length > 0 && options.every(o => typeof o === 'string' && o.startsWith('BTN_'));
      if (areAllTokens) {
        const btns = buildUiButtonsFromTokens(options);
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
      const shortLog = `${sid} => reply len=${String(reply||'').length} options=${(options||[]).length}`;
      const entry = formatLog('INFO', shortLog);
      appendToLogFile(entry);
      broadcastLog(entry);
    } catch (e) { /* noop */ }

    return res.json(response);

  } catch(e){
    console.error('[api/chat] Error', e && e.message);
    return res.status(200).json(withOptions({ ok:true, reply: '😅 Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// Sessions listing
app.get('/api/sessions', async (_req,res)=>{
  const sessions = await listActiveSessions();
  res.json({ ok:true, count: sessions.length, sessions });
});

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, ()=> {
  console.log(`STI Chat (v7) started on ${PORT}`);
  console.log('[Logs] SSE available at /api/logs/stream (use token param if SSE_TOKEN set)');
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Iniciando apagado graceful...`);
  
  // Cerrar SSE clients
  console.log(`[shutdown] Cerrando ${sseClients.size} clientes SSE...`);
  for (const client of Array.from(sseClients)) {
    try {
      client.write('data: SERVER_SHUTDOWN\n\n');
      client.end();
    } catch(e) { /* ignore */ }
  }
  sseClients.clear();
  
  // Cerrar log stream
  if (logStream && logStream.writable) {
    try { logStream.end(); } catch(e) { /* ignore */ }
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