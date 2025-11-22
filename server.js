/**
 * serverSTI.js — STI • Tecnos (merged, audited)
 *
 * Objectives:
 * - Implements a conversational assistant "Tecnos" for STI — Servicio Técnico Inteligente
 * - Combines best parts of two provided servers into a robust, production-ready single file
 * - Optional OpenAI integration via OPENAI_API_KEY
 * - Session persistence delegated to sessionStore.js (getSession, saveSession, listActiveSessions)
 * - Persistent transcripts & tickets in disk directories (configurable via env)
 * - SSE logs, WhatsApp ticket generation with safe encoding, UI button tokens, robust state machine
 *
 * Notes:
 * - This file assumes an ESM environment (node >= 18 recommended). package.json should include "type": "module".
 * - sessionStore.js MUST export: getSession(id), saveSession(id,obj), listActiveSessions()
 * - Environment variables:
 *    PORT, DATA_BASE, TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR, PUBLIC_BASE_URL,
 *    OPENAI_API_KEY, OPENAI_MODEL, OA_MIN_CONF, OA_NAME_REJECT_CONF, WHATSAPP_NUMBER,
 *    SSE_TOKEN, CORS_ORIGINS (comma-separated allowed origins; defaults to '*')
 *
 * Recommended minimal package.json:
 * {
 *   "name": "sti-tecnos",
 *   "type": "module",
 *   "engines": { "node": ">=18" },
 *   "dependencies": {
 *     "express": "^4.18.2",
 *     "cors": "^2.8.5",
 *     "openai": "^4.0.0",
 *     "dotenv": "^16.0.0"
 *   }
 * }
 *
 * Keep sessionStore.js secure and tested.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs, { createReadStream } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';

import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ---------------------------
// Configuration / env
// ---------------------------
const PORT = Number(process.env.PORT || 3001);
const DATA_BASE = process.env.DATA_BASE || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR = process.env.TICKETS_DIR || path.join(DATA_BASE, 'tickets');
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/$/, '');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
const SSE_TOKEN = process.env.SSE_TOKEN || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF ?? 0.6);
const OA_NAME_REJECT_CONF = Number(process.env.OA_NAME_REJECT_CONF ?? 0.75);

// Ensure directories
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
}

// ---------------------------
// Logging & SSE
// ---------------------------
const sseClients = new Set();
let logStream = null;
try {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
} catch (e) {
  console.error('[init] could not open log stream', e && e.message);
}
const nowIso = () => new Date().toISOString();
function formatLog(level, ...parts) {
  const text = parts.map(p => {
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch (e) { return String(p); }
  }).join(' ');
  return `${new Date().toISOString()} [${level}] ${text}`;
}
function appendToLogFile(entry) {
  try {
    if (logStream && logStream.writable) logStream.write(entry + '\n');
    else fs.appendFile(LOG_FILE, entry + '\n', 'utf8', ()=>{});
  } catch (e) { /* noop */ }
}
function sseSend(res, eventData) {
  const payload = String(eventData || '');
  const safe = payload.split(/\r?\n/).map(line => `data: ${line}`).join('\n') + '\n\n';
  try { res.write(safe); } catch (e) { /* noop */ }
}
function broadcastLog(entry) {
  for (const res of Array.from(sseClients)) {
    try { sseSend(res, entry); } catch (e) { try { res.end(); } catch(_){} sseClients.delete(res); }
  }
}
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => { try { _origLog(...args); } catch(_){} try { const entry = formatLog('INFO', ...args); appendToLogFile(entry); broadcastLog(entry); } catch(e){} };
console.error = (...args) => { try { _origErr(...args); } catch(_){} try { const entry = formatLog('ERROR', ...args); appendToLogFile(entry); broadcastLog(entry); } catch(e){} };

// ---------------------------
// Chat config (buttons, NLP, defaults)
// ---------------------------
const EMBEDDED_CHAT = {
  version: 'merged-v1',
  messages_v4: {
    greeting: { name_request: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente de STI. ¿Cómo te llamás?' }
  },
  settings: {
    OA_MIN_CONF: String(OA_MIN_CONF),
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
      { token: 'BTN_REPHRASE', label: 'Cambiar problema', text: 'reformular problema' },
      { token: 'BTN_CLOSE', label: 'Cerrar Chat 🔒', text: 'cerrar chat' },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', text: 'hablar con un tecnico' },
      { token: 'BTN_MORE_TESTS', label: 'Más pruebas 🔍', text: 'más pruebas' },
      { token: 'BTN_CONNECT_TECH', label: 'Conectar con Técnico 🧑‍💻', text: 'conectar con tecnico' },
      { token: 'BTN_DEV_PC_DESKTOP', label: 'PC de escritorio', text: 'pc de escritorio' },
      { token: 'BTN_DEV_PC_ALLINONE', label: 'PC All in One', text: 'pc all in one' },
      { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', text: 'notebook' }
    ],
    states: {}
  },
  nlp: {
    devices: [
      { key: 'pc', rx: '\\b(pc|computadora|ordenador|compu)\\b' },
      { key: 'notebook', rx: '\\b(notebook|laptop)\\b' },
      { key: 'router', rx: '\\b(router|modem|wifi)\\b' },
      { key: 'stick', rx: '\\b(stick|stick tv|fire stick|android tv stick)\\b' }
    ],
    issues: [
      { key: 'no_prende', rx: '\\b(no\\s*enciende|no\\s*prende|no\\s*arranca)\\b', label: 'no enciende' },
      { key: 'sin_internet', rx: '\\b(no\\s*tengo\\s*internet|sin\\s*internet|no\\s*hay\\s*internet)\\b', label: 'sin internet' },
      { key: 'instalar_app', rx: '\\b(instal(ar|ación)|cómo\\s+instalo|como\\s+instalo)\\b', label: 'instalar app' }
    ],
    advanced_steps: {
      no_prende: [
        'Verificá que el cable de alimentación esté bien conectado a la alternativa y a la PC.',
        'Comprobá que la fuente tenga el interruptor encendido (si aplica).',
        'Intentá encender manteniendo pulsado el botón de encendido 5–10 segundos.',
        'Desconectá dispositivos USB/externos y probá encender de nuevo.'
      ]
    },
    issue_labels: { no_prende: 'no enciende' }
  }
};
let CHAT = EMBEDDED_CHAT;

// helper: button defs
function getButtonDefinition(token) {
  if (!token || !CHAT?.ui?.buttons) return null;
  return CHAT.ui.buttons.find(b => String(b.token) === String(token)) || null;
}
function buildUiButtonsFromTokens(tokens = []) {
  if (!Array.isArray(tokens)) return [];
  return tokens.map(t => {
    if (!t) return null;
    const def = getButtonDefinition(t);
    const label = def?.label || def?.text || String(t);
    const text  = def?.text  || label;
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
function withOptions(obj) { return { options: [], ...obj }; }

// ---------------------------
// NLP & Name utilities
// ---------------------------
const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function emojiForIndex(i){ const n = i+1; return NUM_EMOJIS[n] || `${n}.`; }
function enumerateSteps(arr){ if(!Array.isArray(arr)) return []; return arr.map((s,i)=>`Paso ${i+1}: ${s}`); }

const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red|stick)$/i;
const NAME_STOPWORDS = new Set(['hola','buenas','buenos','gracias','help','ayuda','porfa','por favor','si','no']);
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
  if (/[0-9@#\$%\^&\*\(\)_=\+\[\]\{\}\\\/<>]/.test(s)) return false;
  if (TECH_WORDS.test(s)) return false;
  const lower = s.toLowerCase();
  for (const w of lower.split(/\s+/)) if (NAME_STOPWORDS.has(w)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < MIN_NAME_TOKENS || tokens.length > MAX_NAME_TOKENS) return false;
  if (tokens.some(tok => !NAME_TOKEN_RX.test(tok))) return false;
  if (tokens.some(tok => tok.replace(/['’\-]/g,'').length < 2)) return false;
  const blacklist = ['pepelito','papelito','pepito','probando','aaaa','jjjj','zzzz','asdasd','qwerty','basura','tuerquita','chuchuki'];
  if (blacklist.includes(s.toLowerCase())) return false;
  return true;
}
const isValidHumanName = isValidName;

function extractName(text){
  if(!text || typeof text !== 'string') return null;
  const sRaw = String(text).trim();
  if(!sRaw) return null;
  const s = sRaw.replace(/[.,!?]+$/,'').trim();
  const patterns = [
    /\b(?:me llamo|soy|mi nombre es|me presento como)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})$/i,
    /^\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})\s*$/i
  ];
  for (const rx of patterns) {
    const m = s.match(rx);
    if (m && m[1]) {
      let candidate = m[1].trim().replace(/\s+/g,' ');
      const tokens = candidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
      const normalized = tokens.map(t => capitalizeToken(t)).join(' ');
      if (isValidName(normalized)) return normalized;
    }
  }
  if (isValidName(s)) {
    const tokens = s.split(/\s+/).slice(0, MAX_NAME_TOKENS);
    return tokens.map(capitalizeToken).join(' ');
  }
  return null;
}

function looksClearlyNotName(text){
  if(!text || typeof text !== 'string') return true;
  const s = text.trim().toLowerCase();
  if(!s) return true;
  if (s.length <= 6 && ['hola','hola!','buenas','buenos','buen día','buen dia'].includes(s)) return true;
  if (NAME_STOPWORDS.has(s)) return true;
  if (TECH_WORDS.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) return true;
  const indicators = ['mi','no','enciende','tengo','problema','problemas','se','me','con','esta','está','tiene'];
  for (const w of words) if (indicators.includes(w)) return true;
  return false;
}

// ---------------------------
// Optional OpenAI helpers
// ---------------------------
async function analyzeNameWithOA(nameText = '') {
  if (!openai) return { isValid: true, confidence: 1, reason: 'no_openai' };
  const prompt = [
    "Sos un asistente que valida si un texto es un nombre humano real en español (Argentina).",
    "Respondé SOLO un JSON con {isValid: true|false, confidence: 0..1, reason: 'breve'}",
    `Texto: "${String(nameText).replace(/"/g,'\\"')}"`
  ].join('\n');
  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 120
    });
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g,'');
    try {
      const parsed = JSON.parse(raw);
      return { isValid: !!parsed.isValid, confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))), reason: parsed.reason || '' };
    } catch (e) {
      console.error('[analyzeNameWithOA] parse error', e && e.message, 'raw:', raw);
      return { isValid: true, confidence: 0, reason: 'parse_error' };
    }
  } catch (e) {
    console.error('[analyzeNameWithOA] error', e && e.message);
    return { isValid: true, confidence: 0, reason: 'error' };
  }
}

async function analyzeProblemWithOA(problemText = '') {
  if(!openai) return { isIT: false, device: null, issueKey: null, confidence: 0 };
  const prompt = [
    "Sos técnico informático argentino, claro y profesional.",
    "Decidí si el siguiente texto corresponde a un problema informático.",
    "Si es informático, detectá device (equipo), issueKey (tipo de problema) y confidence (0..1).",
    "Respondé SOLO un JSON con {isIT: true|false, device, issueKey, confidence}.",
    `Texto: "${String(problemText).replace(/"/g,'\\"')}"`
  ].join('\n');
  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 250
    });
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g,'');
    try {
      const obj = JSON.parse(raw);
      return { isIT: !!obj.isIT, device: obj.device || null, issueKey: obj.issueKey || null, confidence: Math.max(0, Math.min(1, Number(obj.confidence || 0))) };
    } catch (e) {
      console.error('[analyzeProblemWithOA] parse error', e && e.message, 'raw:', raw);
      return { isIT: false, device: null, issueKey: null, confidence: 0 };
    }
  } catch (e) {
    console.error('[analyzeProblemWithOA] error', e && e.message);
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }
}

async function aiQuickTests(problemText = '', device = '') {
  if (!openai) {
    return [
      'Reiniciá la aplicación o dispositivo donde ocurre el problema.',
      'Probá en otro documento o app para ver si persiste.',
      'Reiniciá el equipo.',
      'Comprobá las conexiones físicas y la alimentación.'
    ];
  }
  const prompt = [
    "Sos técnico informático argentino, claro y amable.",
    `Problema: "${String(problemText).replace(/"/g,'\\"')}"${device ? ` en ${device}` : ''}.`,
    "Indicá 4–6 pasos simples y seguros.",
    "Devolvé solo un JSON array de strings."
  ].join('\n');
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400
    });
    const raw = (resp.choices?.[0]?.message?.content || '').replace(/```json|```/g,'').trim();
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(x=>typeof x==='string').slice(0,6) : [];
    } catch (e) {
      console.error('[aiQuickTests] parse error', e && e.message, 'raw:', raw);
      return ['Reiniciar la aplicación','Reiniciar el equipo','Comprobar actualizaciones','Verificar conexiones físicas'];
    }
  } catch (e) {
    console.error('[aiQuickTests] Error', e && e.message);
    return ['Reiniciar la aplicación','Reiniciar el equipo','Comprobar actualizaciones','Verificar conexiones físicas'];
  }
}

async function getHelpForStep(stepText = '', stepIndex = 1, device = '', problem = '') {
  if (!stepText) return 'No tengo el detalle de ese paso. Si querés puedo describirlo con más calma.';
  if (!openai) {
    return `Paso ${stepIndex}: ${stepText}\n\nConsejos breves: hacelo con calma y avisame cualquier mensaje de error.`;
  }
  const prompt = [
    "Sos técnico informático argentino, claro y amable.",
    `Explicá cómo ejecutar este paso para un usuario no técnico: "${String(stepText).replace(/"/g,'\\"')}"`,
    device ? `Equipo: ${device}.` : '',
    problem ? `Problema: ${problem}.` : '',
    "Dalo en 3–6 acciones claras, en español rioplatense (voseo).",
    "Si hay precauciones mínimas, indicálas."
  ].filter(Boolean).join('\n');
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 400
    });
    return (resp.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    console.error('[getHelpForStep] Error', e && e.message);
    return `Para realizar el paso ${stepIndex}: ${stepText}\nSi necesitás más ayuda decímelo.`;
  }
}

// ---------------------------
// Express app & middleware
// ---------------------------
const app = express();

// CORS: allow origins from env or allow all if '*' (careful in prod)
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow server-to-server or curl
    if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

const STATES = {
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  ASK_DEVICE: 'ask_device',
  CONFIRM_PROBLEM: 'confirm_problem',
  BASIC_TESTS: 'basic_tests',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
  ENDED: 'ended'
};

function getSessionId(req){
  const h = (req.headers['x-session-id']||'').toString().trim();
  const b = (req.body && (req.body.sessionId||req.body.sid)) ? String(req.body.sessionId||req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId||req.query.sid)) ? String(req.query.sessionId||req.query.sid).trim() : '';
  return h || b || q || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req,_res,next)=>{ req.sessionId = getSessionId(req); next(); });

// Basic rate limiting for ticket creation to avoid spam (per-session)
const ticketRateLimiter = new Map(); // sid -> { lastTs, count }

function canCreateTicket(sid) {
  const now = Date.now();
  const rec = ticketRateLimiter.get(sid) || { lastTs: 0, count: 0 };
  if (now - rec.lastTs > 60 * 60 * 1000) { // reset every hour
    rec.count = 0;
    rec.lastTs = now;
  }
  if (rec.count >= 3) return false;
  rec.count += 1;
  rec.lastTs = now;
  ticketRateLimiter.set(sid, rec);
  return true;
}

// ---------------------------
// Infra endpoints
// ---------------------------
app.get('/api/health', (_req,res) => {
  res.json({ ok:true, hasOpenAI: !!OPENAI_API_KEY, openaiModel: OPENAI_MODEL, version: CHAT?.version || 'embedded' });
});

app.post('/api/reload', (_req,res)=>{ res.json({ ok:true, version: CHAT.version||null }); });

app.get('/api/transcript/:sid', (req,res) => {
  try {
    const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
    const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
    res.set('Content-Type','text/plain; charset=utf-8');
    res.send(fs.readFileSync(file,'utf8'));
  } catch (e) {
    console.error('[api/transcript] error', e && e.message);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// logs SSE
app.get('/api/logs/stream', async (req,res) => {
  try {
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).send('unauthorized');
    if (String(req.query.mode || '') === 'once') {
      const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE,'utf8') : '';
      res.set('Content-Type','text/plain; charset=utf-8');
      return res.status(200).send(txt);
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.flushHeaders && res.flushHeaders();
    res.write(': connected\n\n');

    (async function sendLast() {
      try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stat = await fs.promises.stat(LOG_FILE);
        const start = Math.max(0, stat.size - (32 * 1024));
        const stream = createReadStream(LOG_FILE, { start, end: stat.size - 1, encoding: 'utf8' });
        for await (const chunk of stream) sseSend(res, chunk);
      } catch (e) { /* ignore */ }
    })();

    sseClients.add(res);
    console.log('[logs] SSE client connected. total=', sseClients.size);

    const hbInterval = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){} }, 20_000);
    req.on('close', () => { clearInterval(hbInterval); sseClients.delete(res); try{ res.end(); }catch(_){} console.log('[logs] SSE client disconnected. total=', sseClients.size); });
  } catch (e) {
    console.error('[logs/stream] Error', e && e.message);
    try { res.status(500).end(); } catch(_) {}
  }
});

app.get('/api/logs', (req,res) => {
  try {
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).json({ ok:false, error: 'unauthorized' });
    const txt = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE,'utf8') : '';
    res.set('Content-Type','text/plain; charset=utf-8');
    res.send(txt);
  } catch (e) {
    console.error('[api/logs] Error', e && e.message);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// ---------------------------
// Tickets & WhatsApp helpers
// ---------------------------
function buildWhatsAppUrl(waNumberRaw, waText) {
  const waNumber = String(waNumberRaw || WHATSAPP_NUMBER || '5493417422422').replace(/\D+/g, '');
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
}
function safeClientName(n){
  if(!n) return '';
  return String(n).replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').replace(/\s+/g,' ').trim();
}

app.post('/api/whatsapp-ticket', async (req,res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    const sid = sessionId || req.sessionId;
    if (!canCreateTicket(sid)) return res.status(429).json({ ok:false, error:'rate_limited', message:'Se alcanzó el límite de tickets por hora. Probá en unos minutos.' });

    let transcript = history;
    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric' });
    const timeFormatter = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', hour12:false });
    const datePart = dateFormatter.format(now).replace(/\//g,'-');
    const timePart = timeFormatter.format(now);
    const generatedLabel = `${datePart} ${timePart} (ART)`;

    const safeName = safeClientName(name || '');
    const titleLine = safeName ? `STI • Ticket ${ticketId} - ${safeName}` : `STI • Ticket ${ticketId}`;
    const lines = [titleLine, `Generado: ${generatedLabel}`];
    if (name) lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sid) lines.push(`Session: ${sid}`);
    lines.push('', '=== HISTORIAL DE CONVERSACIÓN ===');
    for (const m of transcript || []) lines.push(`[${m.ts||now.toISOString()}] ${m.who||'user'}: ${m.text||''}`);

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){}
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;

    const userSess = sid ? await getSession(sid) : null;
    const whoName = (name || userSess?.userName || '').toString().trim();
    const waIntro = whoName
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.`
      : (CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:');
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if (name) waText += `Cliente: ${name}\n`;
    if (device) waText += `Equipo: ${device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;

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

    res.json({ ok:true, ticketId, publicUrl, apiPublicUrl, waUrl, waWebUrl, waAppUrl, waIntentUrl, ui: { buttons: uiButtons, externalButtons }, allowWhatsapp: true });
  } catch (e) {
    console.error('[whatsapp-ticket] error', e && e.message);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// ticket APIs/view
app.get('/api/ticket/:tid', (req,res) => {
  try {
    const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
    const file = path.join(TICKETS_DIR, `${tid}.txt`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error: 'not_found' });
    const raw = fs.readFileSync(file,'utf8');
    const lines = raw.split(/\r?\n/);
    const messages = [];
    for (const ln of lines) {
      if (!ln || /^\s*$/.test(ln)) continue;
      const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
      if (m) messages.push({ ts: m[1], who: String(m[2]).trim(), text: String(m[3]).trim() });
      else messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
    res.json({ ok:true, ticketId: tid, content: raw, messages });
  } catch (e) {
    console.error('[api/ticket] error', e && e.message);
    res.status(500).json({ ok:false, error: e.message });
  }
});

app.get('/ticket/:tid', (req,res) => {
  try {
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
      if (m) messages.push({ ts: m[1], who: String(m[2]).trim().toLowerCase(), text: String(m[3]).trim() });
      else messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
    const chatLines = messages.map(msg => {
      if (msg.who === 'system') return `<div class="sys">${escapeHtml(msg.text)}</div>`;
      const side = (msg.who === 'user' || msg.who === 'usuario') ? 'user' : 'bot';
      const whoLabel = side === 'user' ? 'Vos' : 'Tecnos';
      const ts = msg.ts ? `<div class="ts">${escapeHtml(msg.ts)}</div>` : '';
      return `<div class="bubble ${side}"><div class="bubble-inner"><div class="who">${escapeHtml(whoLabel)}</div><div class="txt">${escapeHtml(msg.text)}</div>${ts}</div></div>`;
    }).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ticket ${escapeHtml(tid)}</title><style>:root{--bg:#f5f7fb;--bot:#fff;--user:#dcf8c6;--accent:#0b7cff;--muted:#777}body{font-family:Inter,system-ui,Arial;margin:12px;background:var(--bg);color:#222}/* minimal styles */.chat-wrap{max-width:860px;margin:0 auto}.bubble{max-width:78%;display:flex;margin-bottom:10px}.bubble.user{align-self:flex-end}.bubble.bot{align-self:flex-start}.bubble-inner{background:var(--bot);padding:10px;border-radius:12px}.bubble.user .bubble-inner{background:var(--user)}.who{font-weight:700;margin-bottom:6px}.txt{white-space:pre-wrap}.ts{font-size:12px;color:#666;margin-top:6px}.sys{color:#666;text-align:center}</style></head><body><div class="controls"><label><input id="fmt" type="checkbox"/> Ver vista cruda</label><a class="btn" href="/api/ticket/${encodeURIComponent(tid)}" target="_blank" rel="noopener">Ver JSON (API)</a></div><div class="chat-wrap"><div class="chat" id="chatContent">${chatLines}</div><div id="rawView" style="display:none;margin-top:12px;"><pre>${safeRaw}</pre></div></div><script>(function(){const chk=document.getElementById('fmt');const chat=document.getElementById('chatContent');const raw=document.getElementById('rawView');chk.addEventListener('change',()=>{if(chk.checked){chat.style.display='none';raw.style.display='block';}else{chat.style.display='flex';raw.style.display='none';}})})();</script></body></html>`;
    res.set('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[ticket/view] error', e && e.message);
    res.status(500).send('error interno');
  }
});

// ---------------------------
// Reset & Greeting
// ---------------------------
app.post('/api/reset', async (req,res) => {
  try {
    const sid = req.sessionId;
    const empty = {
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
      lastActivityAt: nowIso()
    };
    await saveSession(sid, empty);
    res.json({ ok:true });
  } catch (e) {
    console.error('[api/reset] error', e && e.message);
    res.status(500).json({ ok:false, error: e.message });
  }
});

function buildNameGreeting(now = new Date()) {
  const hour = now.getHours();
  let prefix;
  if (hour >= 0 && hour < 5) prefix = '🌙 Buenas noches';
  else if (hour >= 5 && hour < 12) prefix = '🌞 Buen día';
  else if (hour >= 12 && hour < 19) prefix = '🌇 Buenas tardes';
  else prefix = '🌙 Buenas noches';
  return `${prefix} 👋 Soy Tecnos, asistente de STI — Servicio Técnico Inteligente.\n\nPara ayudarte mejor, ¿cómo te llamás?`;
}

app.all('/api/greeting', async (req,res) => {
  try {
    const sid = req.sessionId;
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
      lastActivityAt: nowIso()
    };
    const text = buildNameGreeting();
    const intro = text + '\n\nSoy Tecnos: te ayudo con problemas y consultas de PC, notebook, WiFi, impresoras y otros temas informáticos. Voy a guiarte paso a paso.';
    fresh.transcript.push({ who:'bot', text:intro, ts: nowIso() });
    await saveSession(sid, fresh);
    return res.json({ ok:true, greeting:intro, reply:intro, options: [] });
  } catch (e) {
    console.error('[greeting] error', e && e.message);
    return res.json({ ok:true, greeting:'👋 Hola', reply:'👋 Hola', options: [] });
  }
});

// ---------------------------
// Device disambiguation helper
// ---------------------------
function getDeviceDisambiguation(rawText) {
  if (!rawText) return null;
  const t = String(rawText).toLowerCase();
  if (/\b(compu|computadora|ordenador|pc|notebook|laptop|compu)\b/.test(t)) {
    return {
      baseLabel: 'compu',
      variants: [
        { token: 'BTN_DEV_PC_DESKTOP', label: 'PC de escritorio', device: 'pc', extra: { pcType: 'desktop' } },
        { token: 'BTN_DEV_PC_ALLINONE', label: 'PC All in One', device: 'pc', extra: { pcType: 'all_in_one' } },
        { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', device: 'notebook', extra: {} }
      ]
    };
  }
  if (/\b(router|modem|wifi)\b/.test(t)) {
    return { baseLabel: 'router', variants: [] };
  }
  if (/\b(impresora|printer)\b/.test(t)) {
    return { baseLabel: 'impresora', variants: [] };
  }
  if (/\b(stick|fire stick|android tv|stick tv)\b/.test(t)) {
    return { baseLabel: 'stick', variants: [] };
  }
  return null;
}

// ---------------------------
// Generate steps + create ticket
// ---------------------------
async function generateAndShowSteps(session, sid, res) {
  try {
    const issueKey = session.issueKey;
    const device = session.device || null;
    const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length > 0);
    let steps;
    if (hasConfiguredSteps) steps = CHAT.nlp.advanced_steps[issueKey].slice(0,4);
    else {
      let aiSteps = [];
      try { aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e) { aiSteps = []; }
      if (Array.isArray(aiSteps) && aiSteps.length > 0) steps = aiSteps.slice(0,4);
      else steps = [
        'Reiniciá la aplicación o dispositivo donde ocurre el problema.',
        'Probá en otro documento o aplicación para ver si persiste.',
        'Reiniciá el equipo.',
        'Comprobá las conexiones físicas y la alimentación.'
      ];
    }

    const stepsAr = steps.map(s => s);
    const numbered = enumerateSteps(stepsAr);
    const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
    let deviceLabel = session.device ? session.device : (session.pendingDeviceGroup ? session.pendingDeviceGroup : 'equipo');
    if (deviceLabel === 'pc') deviceLabel = 'PC';
    const pSummary = (session.problem || '').trim().slice(0, 200);
    const intro = `Perfecto, ${who}: entonces con tu ${deviceLabel} pasa esto: "${pSummary}".\n\nVamos a intentar estos pasos, ordenados y simples:`;
    const footer = '\n\nSi necesitás ayuda con un paso tocá en el número. Cuando pruebes, contame cómo te fue: "Lo pude solucionar" o "El problema persiste".';
    const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;

    session.tests = session.tests || {};
    session.tests.basic = stepsAr;
    session.stepProgress = session.stepProgress || {};
    session.helpAttempts = session.helpAttempts || {};
    for (let i = 0; i < stepsAr.length; i++) {
      const idx = i+1;
      if (!session.stepProgress[idx]) session.stepProgress[idx] = 'pending';
      if (!session.helpAttempts[idx]) session.helpAttempts[idx] = 0;
    }
    session.stepsDone = session.stepsDone || [];
    session.stepsDone.push('basic_tests_shown');
    session.waEligible = false;
    session.lastHelpStep = null;
    session.stage = STATES.BASIC_TESTS;
    session.lastActivityAt = nowIso();

    const ts = nowIso();
    session.transcript.push({ who:'bot', text: fullMsg, ts });
    await saveSession(sid, session);

    const helpOptions = stepsAr.map((_,i)=>`Paso ${i+1} — Ayuda`);
    const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];

    const btnTokens = stepsAr.map((_,i)=>`BTN_HELP_${i+1}`);
    const uiButtons = buildUiButtonsFromTokens(btnTokens);
    return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr, ui: { buttons: uiButtons } }));
  } catch (e) {
    console.error('[generateAndShowSteps] Error', e && e.message);
    session.transcript.push({ who:'bot', text: 'Ocurrió un error generando pasos. Probá de nuevo.', ts: nowIso() });
    await saveSession(sid, session);
    return res.json(withOptions({ ok:false, reply: 'Ocurrió un error generando pasos. Probá de nuevo.', stage: session.stage, options: [] }));
  }
}

async function createTicketAndRespond(session, sid, res) {
  const ts = nowIso();
  try {
    if (!canCreateTicket(sid)) {
      const msg = 'Por seguridad no puedo crear más tickets ahora. Probá de nuevo en unos minutos.';
      session.transcript.push({ who:'bot', text: msg, ts });
      await saveSession(sid, session);
      return res.status(429).json(withOptions({ ok:false, reply: msg }));
    }

    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric' });
    const timeFormatter = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', hour12:false });
    const datePart = dateFormatter.format(now).replace(/\//g,'-');
    const timePart = timeFormatter.format(now);
    const generatedLabel = `${datePart} ${timePart} (ART)`;

    let safeName = '';
    if (session.userName) safeName = safeClientName(session.userName).toUpperCase();
    const titleLine = safeName ? `STI • Ticket ${ticketId} - ${safeName}` : `STI • Ticket ${ticketId}`;
    const lines = [titleLine, `Generado: ${generatedLabel}`];
    if (session.userName) lines.push(`Cliente: ${session.userName}`);
    if (session.device) lines.push(`Equipo: ${session.device}`);
    if (sid) lines.push(`Session: ${sid}`);
    lines.push('', '=== HISTORIAL DE CONVERSACIÓN ===');
    for (const m of session.transcript || []) lines.push(`[${m.ts||ts}] ${m.who||'user'}: ${m.text||''}`);

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){}
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;

    const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
    const waIntro = session.userName
      ? `Hola STI, me llamo ${session.userName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.`
      : (CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:');
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if (session.userName) waText += `Cliente: ${session.userName}\n`;
    if (session.device) waText += `Equipo: ${session.device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle: ${apiPublicUrl}`;

    const waNumberRaw = String(process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422');
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g,'');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `intent://send?phone=${waNumber}&text=${encodeURIComponent(waText)}#Intent;package=com.whatsapp;scheme=whatsapp;end`;

    const replyTech = `🤖 Muy bien, ${whoLabel}.\nEstoy preparando tu ticket. Toca el botón para abrir WhatsApp y enviarlo al equipo técnico.`;

    session.transcript.push({ who:'bot', text: replyTech, ts });
    session.waEligible = true;
    session.stage = STATES.ESCALATE;
    session.lastActivityAt = nowIso();
    await saveSession(sid, session);

    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      const botLine = `[${ts}] ASSISTANT: ${replyTech}\n`;
      fs.appendFile(tf, botLine, ()=>{});
    } catch(e) {}

    const resp = withOptions({ ok:true, reply: replyTech, stage: session.stage, options: ['BTN_WHATSAPP'] });
    resp.ui = resp.ui || {};
    resp.ui.buttons = buildUiButtonsFromTokens(['BTN_WHATSAPP']);
    const labelBtn2 = (getButtonDefinition && getButtonDefinition('BTN_WHATSAPP')?.label) || 'Enviar WhatsApp';
    resp.ui.externalButtons = [
      { token: 'BTN_WHATSAPP_WEB', label: labelBtn2 + ' (Web)', url: waWebUrl, openExternal: true },
      { token: 'BTN_WHATSAPP_INTENT', label: labelBtn2 + ' (Abrir App - Android)', url: waIntentUrl, openExternal: true },
      { token: 'BTN_WHATSAPP_APP', label: labelBtn2 + ' (App)', url: waAppUrl, openExternal: true },
      { token: 'BTN_WHATSAPP', label: labelBtn2, url: waUrl, openExternal: true }
    ];
    resp.waUrl = waUrl;
    resp.waWebUrl = waWebUrl;
    resp.waAppUrl = waAppUrl;
    resp.waIntentUrl = waIntentUrl;
    resp.ticketId = ticketId;
    resp.publicUrl = publicUrl;
    resp.apiPublicUrl = apiPublicUrl;
    resp.allowWhatsapp = true;
    return res.json(resp);
  } catch (err) {
    console.error('[createTicketAndRespond] Error', err && err.message);
    session.waEligible = false;
    await saveSession(sid, session);
    return res.json(withOptions({ ok:false, reply: '❗ Ocurrió un error generando el ticket. Probá de nuevo.' }));
  }
}

// ---------------------------
// Core chat endpoint (/api/chat)
// ---------------------------
app.post('/api/chat', async (req,res) => {
  try {
    const body = req.body || {};
    const tokenMap = {};
    if (Array.isArray(CHAT?.ui?.buttons)) {
      for (const b of CHAT.ui.buttons) if (b.token) tokenMap[b.token] = b.text || '';
    }

    let incomingText = String(body.text || '').trim();
    let buttonToken = null;
    let buttonLabel = null;

    if (body.action === 'button' && body.value) {
      buttonToken = String(body.value);
      const def = getButtonDefinition(buttonToken);
      if (tokenMap[buttonToken] !== undefined) incomingText = tokenMap[buttonToken];
      else if (buttonToken.startsWith('BTN_HELP_')) {
        const n = buttonToken.split('_').pop();
        incomingText = `ayuda paso ${n}`;
      } else incomingText = buttonToken;
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
        lastActivityAt: nowIso()
      };
      console.log('[api/chat] new session', sid);
    }

    // record user action (button vs text)
    const userTs = nowIso();
    if (buttonToken) session.transcript.push({ who:'user', text: `[BOTON] ${buttonLabel} (${buttonToken})`, ts: userTs });
    else session.transcript.push({ who:'user', text: t, ts: userTs });
    session.lastActivityAt = nowIso();

    // quick escalate to WhatsApp via button or text
    if (buttonToken === 'BTN_WHATSAPP' || /^\s*(?:enviar\s+whats?app|hablar con un tecnico|enviar whatsapp|conectar con tecnico)$/i.test(t)) {
      try { return await createTicketAndRespond(session, sid, res); }
      catch (errBtn) {
        console.error('[BTN_WHATSAPP]', errBtn && errBtn.message);
        session.transcript.push({ who:'bot', text: '❗ No pude preparar el ticket ahora. Probá de nuevo en un momento.', ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:false, reply:'❗ No pude preparar el ticket ahora. Probá de nuevo en un momento.' }));
      }
    }

    // detect "ayuda paso N"
    session.helpAttempts = session.helpAttempts || {};
    session.lastHelpStep = session.lastHelpStep || null;
    let helpRequestedIndex = null;
    if (buttonToken && /^BTN_HELP_\d+$/.test(buttonToken)) {
      const m = buttonToken.match(/^BTN_HELP_(\d+)$/);
      if (m) helpRequestedIndex = Number(m[1]);
    } else {
      const mText = (t || '').match(/\b(paso\s*)?(\d+)\b.*ayuda|\bayuda(?:\s+paso)?\s*(\d+)\b/i);
      if (mText) {
        const found = mText[3] || mText[2];
        helpRequestedIndex = found ? Number(found) : null;
      }
    }

    if (helpRequestedIndex) {
      try {
        const idx = Number(helpRequestedIndex);
        let steps = [];
        if (session.stage === STATES.ADVANCED_TESTS) steps = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
        else if (session.stage === STATES.BASIC_TESTS) steps = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
        else steps = [];

        if (!steps || steps.length === 0) {
          const msg = 'Aún no propuse pasos. Primero contame el problema para ofrecerte pasos claros.';
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
        if (!helpDetail || String(helpDetail).trim() === '') helpDetail = `Para realizar el paso ${idx}: ${stepText}\nSi necesitás más ayuda decímelo.`;

        const attempts = session.helpAttempts[idx] || 0;
        let extraLine = '';
        if (attempts >= 2) extraLine = '\n\nVeo que este paso viene costando. Si querés, te puedo conectar con un técnico por WhatsApp.';

        const reply = `🛠️ Ayuda — Paso ${idx}\n\n${helpDetail}${extraLine}\n\nDespués de probar esto, ¿cómo te fue?`;
        const ts2 = nowIso();
        session.transcript.push({ who:'bot', text: reply, ts: ts2 });
        await saveSession(sid, session);

        try {
          const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
          const userLine = `[${ts2}] USER: ${buttonToken ? `[BOTON] ${buttonLabel}` : t}\n`;
          const botLine  = `[${ts2}] ASSISTANT: ${reply}\n`;
          fs.appendFile(tf, userLine, ()=>{});
          fs.appendFile(tf, botLine, ()=>{});
        } catch(e){}

        const unifiedOpts = ['Lo pude solucionar ✔️', 'Volver a mostrar los pasos. ⏪'];
        return res.json(withOptions({ ok:true, help:{ stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: unifiedOpts }));
      } catch (err) {
        console.error('[help_step] Error', err && err.message);
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
        session.userName = 'Usuario';
        session.stage = STATES.ASK_PROBLEM;
        const reply = 'Perfecto. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?';
        const ts3 = nowIso();
        session.transcript.push({ who:'bot', text: reply, ts: ts3 });
        session.lastActivityAt = nowIso();
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      }
    }

    // ASK_NAME handling
    if (session.stage === STATES.ASK_NAME) {
      if (looksClearlyNotName(t)) {
        session.nameAttempts = (session.nameAttempts || 0) + 1;
        await saveSession(sid, session);
        const reply = 'No detecté un nombre claro. ¿Podés decirme solo tu nombre? Por ejemplo: "Ana" o "Juan Pablo".';
        const ts4 = nowIso();
        session.transcript.push({ who:'bot', text: reply, ts: ts4 });
        session.lastActivityAt = nowIso();
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Prefiero no decirlo'] }));
      }

      const candidate = extractName(t);
      if (candidate && isValidHumanName(candidate)) {
        // optional OA check
        if (openai) {
          try {
            const oa = await analyzeNameWithOA(candidate);
            if (!oa.isValid && oa.confidence >= OA_NAME_REJECT_CONF) {
              session.nameAttempts = (session.nameAttempts || 0) + 1;
              await saveSession(sid, session);
              const reply = 'Ese nombre no parece real. ¿Podés decirme tu nombre verdadero? O tocá "Prefiero no decirlo".';
              const ts5 = nowIso();
              session.transcript.push({ who:'bot', text: reply, ts: ts5 });
              session.lastActivityAt = nowIso();
              return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Prefiero no decirlo'] }));
            }
          } catch (e) { console.error('[ask_name][OA] error', e && e.message); }
        }

        session.userName = candidate;
        session.stage = STATES.ASK_PROBLEM;
        const reply = `¡Genial, ${capitalizeToken(session.userName)}! 👍\n\nAhora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
        const ts6 = nowIso();
        session.transcript.push({ who:'bot', text: reply, ts: ts6 });
        session.lastActivityAt = nowIso();
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      }

      // fallback ask simpler
      session.nameAttempts = (session.nameAttempts || 0) + 1;
      await saveSession(sid, session);
      const reply = 'Escribime solo tu nombre, por ejemplo: "María" o "Juan Pablo".';
      const ts7 = nowIso();
      session.transcript.push({ who:'bot', text: reply, ts: ts7 });
      session.lastActivityAt = nowIso();
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Prefiero no decirlo'] }));
    }

    // Inline fallback: capture name if present while not in ASK_NAME
    {
      const nmInline2 = extractName(t);
      if (nmInline2 && !session.userName && isValidHumanName(nmInline2)) {
        session.userName = nmInline2;
        if (session.stage === STATES.ASK_NAME) {
          session.stage = STATES.ASK_PROBLEM;
          const reply = `¡Genial, ${session.userName}! 👍\n\nAhora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
          session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
          session.lastActivityAt = nowIso();
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
        }
      }
    }

    // Reformulate problem
    if (/^\s*(reformular|reformular problema|cambiar problema|no era eso)\b/i.test(t) || buttonToken === 'BTN_REPHRASE') {
      const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
      const reply = `Perfecto, ${who}. Contame nuevamente el problema con tus palabras.`;
      session.stage = STATES.ASK_PROBLEM;
      session.problem = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      session.lastActivityAt = nowIso();
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
    }

    // State machine core
    if (session.stage === STATES.ASK_PROBLEM) {
      session.problem = t || session.problem;
      session.lastActivityAt = nowIso();

      // device disambiguation
      if (!session.device) {
        const disambig = getDeviceDisambiguation(session.problem || '');
        if (disambig && Array.isArray(disambig.variants) && disambig.variants.length > 0) {
          session.stage = STATES.ASK_DEVICE;
          session.pendingDeviceGroup = disambig.baseLabel;
          const replyText = `Cuando decís "${disambig.baseLabel}", ¿a cuál de estos dispositivos te referís?`;
          const uiButtons = buildUiButtonsFromTokens(disambig.variants.map(v => v.token));
          session.transcript.push({ who:'bot', text: replyText, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply: replyText, stage: session.stage, options: disambig.variants.map(v=>v.label), ui: { buttons: uiButtons } }));
        }
      }

      // analyze with OA optionally
      if (openai) {
        try {
          const ai = await analyzeProblemWithOA(session.problem || '');
          const isIT = !!ai.isIT && (ai.confidence >= OA_MIN_CONF);
          if (!isIT) {
            const replyNotIT = 'Disculpa, no me quedó claro si eso es un problema informático. ¿Podés dar más detalles o reformularlo?';
            session.transcript.push({ who:'bot', text: replyNotIT, ts: nowIso() });
            await saveSession(sid, session);
            return res.json(withOptions({ ok:true, reply: replyNotIT, stage: session.stage, options: ['Reformular Problema'] }));
          }
          if (ai.device) session.device = session.device || ai.device;
          if (ai.issueKey) session.issueKey = session.issueKey || ai.issueKey;
        } catch(e){ console.error('[ask_problem][OA] error', e && e.message); }
      }

      // Summarize before acting
      const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
      const deviceLabel = session.device ? session.device : (session.pendingDeviceGroup ? session.pendingDeviceGroup : '');
      const shortDevice = deviceLabel ? ` ${deviceLabel}` : '';
      const pSummary = (session.problem || '').trim().slice(0,180);
      const summary = `Perfecto, ${who}: entonces${deviceLabel ? ' con tu ' + deviceLabel : ''} pasa esto: "${pSummary}". ¿Es correcto?`;
      const confirmButtons = buildUiButtonsFromTokens(['BTN_CONFIRM_PROBLEM','BTN_REPHRASE']);
      session.pendingConfirmation = { problem: session.problem, device: session.device || null };
      session.stage = STATES.CONFIRM_PROBLEM;
      session.transcript.push({ who:'bot', text: summary, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: summary, stage: session.stage, options: ['Sí, es ese problema','No, cambiar'], ui: { buttons: confirmButtons } }));
    } else if (session.stage === STATES.ASK_DEVICE) {
      if (!buttonToken || !/^BTN_DEV_/.test(buttonToken)) {
        const replyText = 'Por favor elegí una de las opciones con los botones, así sé el tipo exacto de equipo.';
        session.transcript.push({ who:'bot', text: replyText, ts: nowIso() });
        await saveSession(sid, session);
        const optionTokens = ['BTN_DEV_PC_DESKTOP','BTN_DEV_PC_ALLINONE','BTN_DEV_NOTEBOOK'];
        const uiButtons = buildUiButtonsFromTokens(optionTokens);
        return res.json(withOptions({ ok:true, reply: replyText, stage: session.stage, options: optionTokens, ui: { buttons: uiButtons } }));
      }

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
        const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
        const replyIntro = `Perfecto, ${who}. Entendido: te referís a ${devCfg.label}. Voy a generar algunos pasos para ese problema.`;
        session.transcript.push({ who:'bot', text: replyIntro, ts: nowIso() });
        await saveSession(sid, session);
        return await generateAndShowSteps(session, sid, res);
      } else {
        const fallbackMsg = 'No reconozco esa opción. Elegí por favor usando los botones.';
        session.transcript.push({ who:'bot', text: fallbackMsg, ts: nowIso() });
        await saveSession(sid, session);
        const optionTokens = ['BTN_DEV_PC_DESKTOP','BTN_DEV_PC_ALLINONE','BTN_DEV_NOTEBOOK'];
        const uiButtons = buildUiButtonsFromTokens(optionTokens);
        return res.json(withOptions({ ok:true, reply: fallbackMsg, stage: session.stage, options: optionTokens, ui: { buttons: uiButtons } }));
      }
    } else if (session.stage === STATES.CONFIRM_PROBLEM) {
      const optConfirm = /^\s*(s|si|sí|si,|sí,|correcto|así|es correcto|sí es correcto|sí es ese|sí ese)$/i;
      const optNo = /^\s*(no|n|no,|no es ese|no, cambiar|no era eso)/i;
      if (buttonToken === 'BTN_CONFIRM_PROBLEM' || optConfirm.test(t)) {
        session.stage = STATES.BASIC_TESTS;
        session.lastActivityAt = nowIso();
        await saveSession(sid, session);
        return await generateAndShowSteps(session, sid, res);
      } else if (buttonToken === 'BTN_REPHRASE' || optNo.test(t) || /^\s*reformular\b/i.test(t)) {
        session.stage = STATES.ASK_PROBLEM;
        session.problem = null;
        session.issueKey = null;
        session.transcript.push({ who:'bot', text: 'Perfecto, contame nuevamente el problema con tus palabras.', ts: nowIso() });
        session.lastActivityAt = nowIso();
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: 'Perfecto, contame nuevamente el problema con tus palabras.', stage: session.stage, options: [] }));
      } else {
        const rep = 'Decime si es correcto o si querés cambiar la descripción del problema.';
        session.transcript.push({ who:'bot', text: rep, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: rep, stage: session.stage, options: ['Sí, es ese problema','No, cambiar'] }));
      }
    } else if (session.stage === STATES.BASIC_TESTS) {
      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️|solucionado)/i;
      const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌|sigue)/i;
      const rxMore = /^\s*(mas pruebas|más pruebas|más|1\b|1️⃣)/i;
      const rxTech = /^\s*(conectar con tecnico|conectar con t[eé]cnico|conectar|2\b|2️⃣)/i;
      const rxShow = /^\s*(volver a mostrar|mostrar pasos|⏪|volver)/i;

      if (rxShow.test(t)) {
        const stepsAr = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
        if (!stepsAr || stepsAr.length === 0) {
          const msg = 'No tengo pasos guardados para mostrar. Primero describí el problema para que te ofrezca pasos.';
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
        }
        const numbered = enumerateSteps(stepsAr);
        const intro = `Volvemos a los pasos sugeridos:`;
        const footer = '\n\nSi necesitás ayuda en un paso tocá en el número.';
        const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        const helpOptions = stepsAr.map((_,i)=>`Paso ${i+1} — Ayuda`);
        const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr }));
      }

      if (rxYes.test(t)) {
        const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
        const reply = `¡Genial, ${who} 🙌! ¿Querés que cierre este chat por ahora? Si necesitás más ayuda, podés volver a escribir cuando quieras.\n\nGracias por usar Tecnos — STI.`;
        session.stage = STATES.ENDED;
        session.waEligible = false;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      } else if (rxNo.test(t)) {
        const reply = `Entiendo. ¿Querés probar más pruebas o que te conecte con un técnico por WhatsApp?`;
        session.stage = STATES.ESCALATE;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Más pruebas 🔍','Conectar con Técnico 🧑‍💻'] }));
      } else if (rxMore.test(t)) {
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
          const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
          const intro = `Entiendo, ${who}. Probemos ahora algunas pruebas más avanzadas:`;
          const footer = '\n\nSi necesitás ayuda en un paso tocá en el número.';
          const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
          session.stepsDone = session.stepsDone || [];
          session.stepsDone.push('advanced_tests_shown');
          session.waEligible = false;
          session.lastHelpStep = null;
          session.stage = STATES.ADVANCED_TESTS;
          session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);
          const helpOptions = limited.map((_,i)=>`Paso ${i+1} — Ayuda`);
          const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
          return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: limited }));
        } catch (errOpt1) {
          console.error('[ESCALATE][more_tests] Error', errOpt1 && errOpt1.message);
          const reply = 'Ocurrió un error generando más pruebas. Probá de nuevo o pedime que te conecte con un técnico.';
          session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply, stage: session.stage, options: ['Conectar con Técnico 🧑‍💻'] }));
        }
      } else if (rxTech.test(t)) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        const reply = `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o elegir "Más pruebas" o "Conectar con Técnico".`;
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Lo pude solucionar ✔️','El problema persiste ❌','Más pruebas 🔍','Conectar con Técnico 🧑‍💻'] }));
      }
    } else if (session.stage === STATES.ADVANCED_TESTS) {
      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
      const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
      const rxTech = /^\s*(conectar con tecnico|conectar con t[eé]cnico|conectar)/i;
      const rxShow = /^\s*(volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShow.test(t)) {
        const stepsAr = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
        if (!stepsAr || stepsAr.length === 0) {
          const msg = 'No tengo pasos avanzados guardados para mostrar. Primero pedí "Más pruebas".';
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
        }
        const numbered = enumerateSteps(stepsAr);
        const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
        const intro = `Volvemos a las pruebas avanzadas, ${who}:`;
        const footer = '\n\nSi necesitás ayuda en un paso tocá en el número.';
        const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        const helpOptions = stepsAr.map((_,i)=>`Paso ${i+1} — Ayuda`);
        const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr }));
      }

      if (rxYes.test(t)) {
        const idx = session.lastHelpStep;
        if (typeof idx === 'number' && idx >= 1) {
          session.stepProgress = session.stepProgress || {};
          session.stepProgress[`adv_${idx}`] = 'done';
          await saveSession(sid, session);
        }
        const reply = `¡Me alegro que lo hayas podido resolver! Si necesitás algo más, estoy acá para ayudarte.`;
        session.stage = STATES.ENDED;
        session.waEligible = false;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      } else if (rxNo.test(t)) {
        const reply = `Entiendo. ¿Querés que te conecte con un técnico por WhatsApp para que lo revisen más a fondo?`;
        session.stage = STATES.ESCALATE;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Conectar con Técnico 🧑‍💻'] }));
      } else if (rxTech.test(t)) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        const reply = `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o pedir conectar con técnico.`;
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Lo pude solucionar ✔️','El problema persiste ❌','Conectar con Técnico 🧑‍💻'] }));
      }
    } else if (session.stage === STATES.ESCALATE) {
      const opt1 = /^\s*(?:1\b|1️⃣|mas pruebas|más pruebas|más)/i;
      const opt2 = /^\s*(?:2\b|2️⃣|dos|conectar|conectar con tecnico|conectar con t[eé]cnico)/i;
      if (opt1.test(t) || /más pruebas/i.test(t) || buttonToken === 'BTN_MORE_TESTS') {
        try { return await (async ()=>{
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
          const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
          const intro = `Entiendo, ${who}. Probemos ahora algunas pruebas más avanzadas:`;
          const footer = '\n\nSi necesitás ayuda en un paso tocá en el número.';
          const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
          session.stepsDone = session.stepsDone || [];
          session.stepsDone.push('advanced_tests_shown');
          session.waEligible = false;
          session.lastHelpStep = null;
          session.stage = STATES.ADVANCED_TESTS;
          session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);
          const helpOptions = limited.map((_,i)=>`Paso ${i+1} — Ayuda`);
          const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
          return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: limited }));
        })(); } catch (err) { console.error('[ESCALATE] more tests error', err && err.message); return res.json(withOptions({ ok:false, reply: 'Error generando más pruebas', stage: session.stage })); }
      } else if (opt2.test(t) || buttonToken === 'BTN_CONNECT_TECH' || /conectar con tecnico/i.test(t)) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        const reply = 'Decime si querés "Más pruebas" o "Conectar con Técnico".';
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Más pruebas 🔍','Conectar con Técnico 🧑‍💻'] }));
      }
    } else if (session.stage === STATES.ENDED) {
      const reply = 'El chat quedó cerrado. Si necesitás volver a abrirlo, escribí "reiniciar" o tocá "Nuevo chat".';
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Reiniciar'] }));
    } else {
      const reply = 'No estoy seguro cómo responder ahora. Podés reiniciar o escribir "Reformular Problema".';
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Reformular Problema'] }));
    }
  } catch (e) {
    console.error('[api/chat] Error', e && e.message);
    // safe friendly error for users (never expose stack or raw)
    return res.status(200).json(withOptions({ ok:false, reply: 'Hubo un inconveniente al procesar tu mensaje, pero ya podemos seguir. Volveme a contar en qué necesitás ayuda y lo vemos juntos.' }));
  }
});

// sessions listing
app.get('/api/sessions', async (_req,res) => {
  try {
    const sessions = await listActiveSessions();
    res.json({ ok:true, count: sessions.length, sessions });
  } catch (e) {
    console.error('[api/sessions] error', e && e.message);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// ---------------------------
// Utilities
// ---------------------------
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;' }[ch])); }

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, ()=> {
  console.log(`STI • Tecnos started on ${PORT}`);
  console.log('[Logs] SSE available at /api/logs/stream (use token param if SSE_TOKEN set)');
});