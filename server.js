/**
 * server.js — STI • Tecnos (production-ready, audited)
 *
 * Purpose:
 * - Backend for "Tecnos — Servicio Técnico Inteligente"
 * - Conversational assistant for basic diagnosis, guided steps, and escalation to technician via ticket/WhatsApp
 *
 * Key features implemented for audit:
 * - Timezone-aware greeting (uses header `x-timezone` or TIMEZONE env)
 * - Tolerant name validation with optional OpenAI advisory check (does not block flow)
 * - Device disambiguation uses exact captured token (e.g., "pc")
 * - Robust OpenAI wrappers with timeout/fallback
 * - Rate limiting for ticket creation (express-rate-limit) + per-session anti-spam
 * - SSE logs with optional SSE_TOKEN protection
 * - Transcript retrieval with optional protection token (TRANSCRIPT_READ_TOKEN)
 * - Session persistence delegated to sessionStore.js (getSession, saveSession, listActiveSessions)
 * - Defensive error handling: endpoints always return JSON (friendly messages)
 * - Extensive inline documentation matching the audit checklist
 *
 * Requirements (package.json must include):
 *  - "express", "cors", "dotenv", "openai", "express-rate-limit", "ioredis" (or your session store), "nodemon" (dev)
 *  - devDependencies: jest / supertest (for tests)
 *
 * Environment variables (documented):
 *  - PORT (default 3001)
 *  - TIMEZONE (default 'UTC') — used if client doesn't send x-timezone
 *  - CORS_ORIGINS (comma-separated allowed origins, default '*'; in production set to frontend origin)
 *  - OPENAI_API_KEY (optional)
 *  - OPENAI_MODEL (optional)
 *  - OPENAI_TIMEOUT_MS (default 8000)
 *  - OA_MIN_CONF, OA_NAME_REJECT_CONF (optional thresholds for advisory checks)
 *  - WHATSAPP_NUMBER (for wa.me links)
 *  - PUBLIC_BASE_URL (for ticket links)
 *  - SSE_TOKEN (optional, protects /api/logs/stream)
 *  - TRANSCRIPT_READ_TOKEN (optional, protects /api/transcript/:sid)
 *  - SESSION_TTL_SECS (doc only — ensure sessionStore implements TTL)
 *
 * Security note:
 *  - Do NOT hardcode secrets. All keys/tokens must be provided through process.env.
 *  - In production TLS/HTTPS must be handled by infrastructure (Render / Nginx / CDN). Do not rely on this server for TLS.
 *
 * Endpoints (documented):
 *  - GET  /api/health
 *  - ALL  /api/greeting             -> greeting (sends timezone-aware message)
 *  - POST /api/chat                 -> core chat interaction (text or button actions)
 *  - POST /api/reset                -> resets session state
 *  - GET  /api/transcript/:sid      -> transcript (plain text). If TRANSCRIPT_READ_TOKEN set, requires header 'x-transcript-token'
 *  - POST /api/whatsapp-ticket      -> prepares ticket + whatsapp links (rate-limited)
 *  - GET  /api/ticket/:tid          -> ticket JSON content
 *  - GET  /ticket/:tid              -> human-readable ticket page
 *  - GET  /api/logs                 -> raw logs (requires SSE_TOKEN if set)
 *  - GET  /api/logs/stream          -> SSE stream of logs (requires SSE_TOKEN if set)
 *
 * Audit checklist note:
 *  - Run `npm audit` in your environment and resolve HIGH/CRITICAL vulnerabilities before production.
 *  - sessionStore.js must handle persistence and optionally TTL/expiry. Prefer Redis for multi-instance deployments.
 *
 * Author: Copilot (as auditor/implementor), adapted for STI
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs, { createReadStream } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

// sessionStore contract: must export async getSession(id), saveSession(id,obj), listActiveSessions()
// Provide your own implementation (Redis recommended). This module is required.
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ---------------------------
// Configuration (env) & directories
// ---------------------------
const PORT = Number(process.env.PORT || 3001);
const TIMEZONE_DEFAULT = process.env.TIMEZONE || 'UTC';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const DATA_BASE = process.env.DATA_BASE || path.join(process.cwd(), 'data');
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR = process.env.TICKETS_DIR || path.join(DATA_BASE, 'tickets');
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 8000);
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF ?? 0.6);
const OA_NAME_REJECT_CONF = Number(process.env.OA_NAME_REJECT_CONF ?? 0.9);

const SSE_TOKEN = process.env.SSE_TOKEN || '';
const TRANSCRIPT_READ_TOKEN = process.env.TRANSCRIPT_READ_TOKEN || ''; // optional protection for transcript retrieval
const SESSION_TTL_SECS = Number(process.env.SESSION_TTL_SECS || 60 * 60 * 24 * 7); // doc only — ensure sessionStore honors TTL

// Ensure directories exist
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* ignore */ }
}

// ---------------------------
// Logging helpers & SSE stream
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
  const text = parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  return `${new Date().toISOString()} [${level}] ${text}`;
}
function appendToLogFile(entry) {
  try {
    if (logStream && logStream.writable) logStream.write(entry + '\n');
    else fs.appendFileSync(LOG_FILE, entry + '\n', 'utf8');
  } catch (e) { /* noop */ }
}
function broadcastLog(entry) {
  for (const res of Array.from(sseClients)) {
    try { res.write(`data: ${entry.replace(/\r?\n/g, '\ndata: ')}\n\n`); } catch (e) { try { res.end(); } catch(_){} sseClients.delete(res); }
  }
}
const _origLog = console.log.bind(console);
const _origErr = console.error.bind(console);
console.log = (...args) => { try { _origLog(...args); } catch(_){} try { const entry = formatLog('INFO', ...args); appendToLogFile(entry); broadcastLog(entry); } catch(e){} };
console.error = (...args) => { try { _origErr(...args); } catch(_){} try { const entry = formatLog('ERROR', ...args); appendToLogFile(entry); broadcastLog(entry); } catch(e){} };

// ---------------------------
// OpenAI client (optional)
// Encapsulated with timeout wrapper and safe fallbacks
// ---------------------------
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/**
 * callOpenAIWithTimeout:
 * - runs the OpenAI call function (fn) but rejects if it does not complete within OPENAI_TIMEOUT_MS.
 * - returns the function result or throws. Caller must handle fallback.
 */
async function callOpenAIWithTimeout(fn, timeout = OPENAI_TIMEOUT_MS) {
  if (!openai) throw new Error('no_openai');
  // Promise.race with manual timeout
  return await Promise.race([
    fn(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('openai_timeout')), timeout))
  ]);
}

// ---------------------------
// Chat config, UI tokens & NLP data
// ---------------------------
const EMBEDDED_CHAT = {
  version: 'audited-v1',
  settings: {
    whatsapp_ticket_prefix: 'Hola STI. Vengo del chat web. Dejo mi consulta:'
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
    ]
  },
  nlp: {
    devices: [
      { key: 'pc', rx: /\b(pc|computadora|ordenador|compu)\b/i },
      { key: 'notebook', rx: /\b(notebook|laptop)\b/i },
      { key: 'router', rx: /\b(router|modem|wifi)\b/i },
      { key: 'stick', rx: /\b(stick|fire stick|stick tv|android tv stick)\b/i },
      { key: 'printer', rx: /\b(impresora|printer)\b/i }
    ],
    advanced_steps: {
      no_prende: [
        'Verificá que el cable de alimentación esté correctamente conectado.',
        'Comprobá que la fuente y el interruptor (si aplica) estén encendidos.',
        'Intentá mantener presionado el botón de encendido 5–10 segundos.',
        'Desconectá dispositivos USB/externos y probá nuevamente.'
      ]
    }
  }
};
let CHAT = EMBEDDED_CHAT;

// helper: get button definition
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
    const text = def?.text || label;
    return { token: String(t), label, text };
  }).filter(Boolean);
}
function withOptions(obj) { return { options: [], ...obj }; }

// ---------------------------
// NLP & name utilities (tolerant)
// ---------------------------
const NAME_TOKEN_RX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60}$/u;
const NAME_STOPWORDS = new Set(['hola','buenas','buenos','gracias','help','ayuda','porfa','por favor','si','no']);
const BLACKLIST_NAMES = new Set(['pepelito','papelito','pepito','probando','aaaa','jjjj','zzzz','asdasd','qwerty','basura']);

function capitalizeToken(tok) {
  if (!tok) return tok;
  return tok.split(/\s+/).map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function isValidName(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.trim();
  if (!s) return false;
  if (/^\d+$/.test(s)) return false; // purely numeric
  if (s.length < 2) return false;
  if (BLACKLIST_NAMES.has(s.toLowerCase())) return false;
  // allow accents and hyphens/apostrophes
  if (!NAME_TOKEN_RX.test(s)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length > 3) return false;
  for (const t of tokens) if (t.replace(/['’\-]/g,'').length < 2) return false;
  // avoid tech words
  if (/\b(pc|notebook|router|impresora|wifi|modem|stick)\b/i.test(s)) return false;
  return true;
}

function extractName(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim().replace(/[.,!?]+$/,'').trim();
  const patterns = [
    /\b(?:me llamo|soy|mi nombre es|me presento como)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})$/i,
    /^\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\-\s]{2,60})\s*$/i
  ];
  for (const rx of patterns) {
    const m = s.match(rx);
    if (m && m[1]) {
      const candidate = m[1].trim().replace(/\s+/g,' ');
      if (isValidName(candidate)) return candidate.split(/\s+/).slice(0,3).map(capitalizeToken).join(' ');
    }
  }
  // last resort: if the whole string looks like name
  if (isValidName(s)) return s.split(/\s+/).slice(0,3).map(capitalizeToken).join(' ');
  return null;
}

function looksClearlyNotName(text) {
  if (!text || typeof text !== 'string') return true;
  const s = text.trim().toLowerCase();
  if (!s) return true;
  if (NAME_STOPWORDS.has(s)) return true;
  if (s.length <= 3) return false; // could be 'Ana'
  if (/\d{3,}/.test(s)) return true;
  if (s.split(/\s+/).length > 6) return true;
  return false;
}

// Optional OpenAI name analyzer — advisory only
async function analyzeNameWithOA(nameText = '') {
  if (!openai) return { isValid: true, confidence: 1, reason: 'no_openai' };
  const prompt = [
    "Sos un asistente que valida si un texto es un nombre humano real en español (Argentina).",
    "Respondé SOLO un JSON con {isValid: true|false, confidence: 0..1, reason: 'breve texto'}.",
    `Texto: "${String(nameText).replace(/"/g,'\\"')}"`
  ].join('\n');

  try {
    const fn = async () => {
      const r = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 120
      });
      return r;
    };
    const r = await callOpenAIWithTimeout(fn);
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

// ---------------------------
// OpenAI-based problem analysis & step generation (safe wrappers)
// ---------------------------
async function analyzeProblemWithOA(problemText = '') {
  if (!openai) return { isIT: false, device: null, issueKey: null, confidence: 0 };
  const prompt = [
    "Sos técnico informático argentino, claro y profesional.",
    "Decidí si el siguiente texto corresponde a un problema informático.",
    "Si es informático, detectá device (equipo), issueKey (tipo de problema) y confidence (0..1).",
    "Respondé SOLO un JSON con {isIT: true|false, device, issueKey, confidence}.",
    `Texto: "${String(problemText).replace(/"/g,'\\"')}"`
  ].join('\n');

  try {
    const fn = async () => await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 250
    });
    const r = await callOpenAIWithTimeout(fn);
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
      'Probá en otra aplicación o documento para ver si persiste.',
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
    const fn = async () => await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400
    });
    const resp = await callOpenAIWithTimeout(fn);
    const raw = (resp.choices?.[0]?.message?.content || '').replace(/```json|```/g,'').trim();
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(x => typeof x === 'string').slice(0,6) : [];
    } catch (e) {
      console.error('[aiQuickTests] parse error', e && e.message, 'raw:', raw);
      return ['Reiniciá la aplicación','Reiniciá el equipo','Comprobá actualizaciones','Verificar conexiones físicas'];
    }
  } catch (e) {
    console.error('[aiQuickTests] Error or timeout', e && e.message);
    return ['Reiniciá la aplicación','Reiniciá el equipo','Comprobá actualizaciones','Verificar conexiones físicas'];
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
    const fn = async () => await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 400
    });
    const resp = await callOpenAIWithTimeout(fn);
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

// CORS: prefer explicit origins in production
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
app.use((req, res, next) => { res.set('Cache-Control','no-store'); next(); });

// Basic rate limiter for ticket endpoint using express-rate-limit
const ticketRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok:false, error:'rate_limited', message:'Se alcanzó el límite de tickets por hora. Probá en unos minutos.' }
});

// Per-session anti-spam map (additional protection)
const perSessionTicketCounts = new Map(); // sid -> { tsWindowStart, count }

function canCreateTicketPerSession(sid) {
  const now = Date.now();
  const rec = perSessionTicketCounts.get(sid) || { start: now, count: 0 };
  if (now - rec.start > 60 * 60 * 1000) { rec.start = now; rec.count = 0; }
  if (rec.count >= 3) return false;
  rec.count += 1;
  perSessionTicketCounts.set(sid, rec);
  return true;
}

// session id helper (random, non-guessable)
function getSessionId(req) {
  const h = (req.headers['x-session-id'] || '').toString().trim();
  const b = (req.body && (req.body.sessionId || req.body.sid)) ? String(req.body.sessionId || req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId || req.query.sid)) ? String(req.query.sessionId || req.query.sid).trim() : '';
  const base = h || b || q;
  if (base) return base;
  // generate random id
  return `sess-${crypto.randomBytes(8).toString('hex')}`;
}
app.use((req, _res, next) => { req.sessionId = getSessionId(req); next(); });

// ---------------------------
// States: conversational flow (consistent naming)
// ---------------------------
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

// ---------------------------
// Utilities
// ---------------------------
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
function safeTrim(s, n = 200) { if (!s) return ''; return String(s).trim().slice(0, n); }

// ---------------------------
// Device disambiguation (uses exact matched token)
// ---------------------------
function getDeviceDisambiguation(rawText) {
  if (!rawText) return null;
  const t = String(rawText).toLowerCase();
  const patterns = [
    { rx: /\b(pc|computadora|ordenador|compu)\b/i, key:'pc' },
    { rx: /\b(notebook|laptop)\b/i, key:'notebook' },
    { rx: /\b(router|modem|wifi)\b/i, key:'router' },
    { rx: /\b(stick|fire stick|stick tv|android tv stick)\b/i, key:'stick' },
    { rx: /\b(impresora|printer)\b/i, key:'printer' }
  ];
  for (const p of patterns) {
    const m = t.match(p.rx);
    if (m) {
      const found = m[1] || p.key;
      if (p.key === 'pc') {
        return {
          baseLabel: found,
          variants: [
            { token: 'BTN_DEV_PC_DESKTOP', label: 'PC de escritorio', device: 'pc', extra: { pcType: 'desktop' } },
            { token: 'BTN_DEV_PC_ALLINONE', label: 'PC All in One', device: 'pc', extra: { pcType: 'all_in_one' } },
            { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', device: 'notebook', extra: {} }
          ]
        };
      }
      if (p.key === 'notebook') return { baseLabel: found, variants: [{ token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', device: 'notebook', extra: {} }] };
      return { baseLabel: found, variants: [] };
    }
  }
  return null;
}

// ---------------------------
// Generate steps & create ticket helpers
// ---------------------------
async function generateAndShowSteps(session, sid, res) {
  try {
    const issueKey = session.issueKey;
    const device = session.device || null;
    const hasConfigured = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey]);
    let steps;
    if (hasConfigured) steps = CHAT.nlp.advanced_steps[issueKey].slice(0,4);
    else {
      let aiSteps = [];
      try { aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e){ aiSteps = []; }
      if (Array.isArray(aiSteps) && aiSteps.length > 0) steps = aiSteps.slice(0,4);
      else steps = [
        'Reiniciá la aplicación o dispositivo donde ocurre el problema.',
        'Probá en otra aplicación o documento para ver si persiste.',
        'Reiniciá el equipo.',
        'Comprobá las conexiones físicas y la alimentación.'
      ];
    }

    const stepsAr = steps.map(s => s);
    const numbered = stepsAr.map((s,i) => `Paso ${i+1}: ${s}`);
    const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
    let deviceLabel = session.device ? session.device : (session.pendingDeviceGroup ? session.pendingDeviceGroup : 'equipo');
    if (deviceLabel === 'pc') deviceLabel = 'PC';
    const pSummary = safeTrim(session.problem || '', 200);
    const intro = `Perfecto, ${who}: entonces con tu ${deviceLabel} pasa esto: "${pSummary}".\n\nVamos a intentar estos pasos, ordenados y simples:`;
    const footer = '\n\nSi necesitás ayuda con un paso, tocá en su número o escribí "ayuda paso N". Cuando pruebes, decime: "Lo pude solucionar" o "El problema persiste".';
    const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;

    session.tests = session.tests || {};
    session.tests.basic = stepsAr;
    session.stepProgress = session.stepProgress || {};
    session.helpAttempts = session.helpAttempts || {};
    for (let i = 0; i < stepsAr.length; i++) { const idx = i+1; if (!session.stepProgress[idx]) session.stepProgress[idx] = 'pending'; if (!session.helpAttempts[idx]) session.helpAttempts[idx] = 0; }
    session.stepsDone = session.stepsDone || [];
    session.stepsDone.push('basic_tests_shown');
    session.waEligible = false;
    session.lastHelpStep = null;
    session.stage = STATES.BASIC_TESTS;
    session.lastActivityAt = nowIso();

    const ts = nowIso();
    session.transcript.push({ who:'bot', text: fullMsg, ts });
    await saveSession(sid, session);

    const btnTokens = stepsAr.map((_,i) => `BTN_HELP_${i+1}`);
    const uiButtons = buildUiButtonsFromTokens(btnTokens);
    const helpOptions = stepsAr.map((_,i) => `Paso ${i+1} — Ayuda`);
    const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];

    return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr, ui: { buttons: uiButtons } }));
  } catch (e) {
    console.error('[generateAndShowSteps] Error', e && e.message);
    session.transcript.push({ who:'bot', text: 'Ocurrió un error generando pasos. Probá de nuevo más tarde.', ts: nowIso() });
    await saveSession(sid, session);
    return res.json(withOptions({ ok:false, reply: 'Ocurrió un error generando pasos. Probá de nuevo más tarde.', stage: session.stage, options: [] }));
  }
}

function buildWhatsAppUrl(waNumberRaw, waText) {
  const waNumber = String(waNumberRaw || WHATSAPP_NUMBER || '5493417422422').replace(/\D+/g, '');
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
}

// ---------------------------
// Create ticket helper (safe, rate-limited)
// ---------------------------
async function createTicketAndRespond(session, sid, res) {
  const ts = nowIso();
  try {
    if (!canCreateTicketPerSession(sid)) {
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

    const safeName = (session.userName || '').toString().replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').replace(/\s+/g,' ').trim();
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

    const whoName = (session.userName || '').toString().trim();
    const waIntro = whoName ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.` : (CHAT?.settings?.whatsapp_ticket_prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:');
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if (session.userName) waText += `Cliente: ${session.userName}\n`;
    if (session.device) waText += `Equipo: ${session.device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle: ${apiPublicUrl}`;

    const waUrl = buildWhatsAppUrl(WHATSAPP_NUMBER, waText);
    const waNumber = String(WHATSAPP_NUMBER).replace(/\D+/g,'');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `intent://send?phone=${waNumber}&text=${encodeURIComponent(waText)}#Intent;package=com.whatsapp;scheme=whatsapp;end`;

    const whoLabel = session.userName ? capitalizeToken(session.userName) : 'usuario';
    const replyTech = `🤖 Muy bien, ${whoLabel}.\nEstoy preparando tu ticket. Toca el botón para abrir WhatsApp y enviarlo al equipo técnico.`;

    session.transcript.push({ who:'bot', text: replyTech, ts });
    session.waEligible = true;
    session.stage = STATES.ESCALATE;
    session.lastActivityAt = nowIso();
    await saveSession(sid, session);

    const resp = withOptions({ ok:true, reply: replyTech, stage: session.stage, options: ['BTN_WHATSAPP'] });
    resp.ui = resp.ui || {};
    resp.ui.buttons = buildUiButtonsFromTokens(['BTN_WHATSAPP']);
    resp.ui.externalButtons = [
      { token: 'BTN_WHATSAPP_WEB', label: 'Enviar WhatsApp (Web)', url: waWebUrl, openExternal: true },
      { token: 'BTN_WHATSAPP_APP', label: 'Enviar WhatsApp (App)', url: waAppUrl, openExternal: true },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', url: waUrl, openExternal: true }
    ];
    resp.waUrl = waUrl;
    resp.waWebUrl = waWebUrl;
    resp.waAppUrl = waAppUrl;
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
// Infra endpoints
// ---------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok:true, version: CHAT.version || null, hasOpenAI: !!OPENAI_API_KEY, node: process.version });
});

/**
 * /api/greeting
 * - Returns timezone-aware greeting. Frontend is encouraged to send 'x-timezone' header (Intl.DateTimeFormat().resolvedOptions().timeZone).
 */
function buildNameGreeting(now = new Date(), tz = null) {
  try {
    const timezone = tz || TIMEZONE_DEFAULT || 'UTC';
    const hourStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now);
    const hour = Number(String(hourStr).replace(/\D/g, '')) || now.getHours();
    let prefix;
    if (hour >= 0 && hour < 5) prefix = '🌙 Buenas noches';
    else if (hour >= 5 && hour < 12) prefix = '🌞 Buen día';
    else if (hour >= 12 && hour < 19) prefix = '🌇 Buenas tardes';
    else prefix = '🌙 Buenas noches';
    return `${prefix} 👋 Soy Tecnos, asistente de STI — Servicio Técnico Inteligente.\n\nEstoy para ayudarte con problemas y consultas de PC, notebook, WiFi e impresoras. Para ayudarte mejor, ¿cómo te llamás?`;
  } catch (e) {
    const h = now.getHours();
    const prefix = (h >= 5 && h < 12) ? '🌞 Buen día' : (h >= 12 && h < 19) ? '🌇 Buenas tardes' : '🌙 Buenas noches';
    return `${prefix} 👋 Soy Tecnos, asistente de STI — Servicio Técnico Inteligente.\n\nPara ayudarte mejor, ¿cómo te llamás?`;
  }
}

app.all('/api/greeting', async (req, res) => {
  try {
    const sid = req.sessionId;
    const tzHeader = req.headers['x-timezone'] || req.headers['x-client-tz'] || null;
    const sess = {
      id: sid,
      userName: null,
      stage: STATES.ASK_NAME,
      device: null,
      problem: null,
      issueKey: null,
      tests: { basic: [], ai: [], advanced: [] },
      stepsDone: [],
      waEligible: false,
      transcript: [],
      startedAt: nowIso(),
      nameAttempts: 0,
      lastActivityAt: nowIso()
    };
    const text = buildNameGreeting(new Date(), tzHeader || TIMEZONE_DEFAULT);
    sess.transcript.push({ who:'bot', text, ts: nowIso() });
    await saveSession(sid, sess);
    return res.json({ ok:true, greeting: text, reply: text, options: [] });
  } catch (e) {
    console.error('[greeting] error', e && e.message);
    return res.json({ ok:true, greeting: '👋 Hola — Soy Tecnos', reply: '👋 Hola — Soy Tecnos', options: [] });
  }
});

/**
 * /api/transcript/:sid
 * - Returns plain text transcript for a session.
 * - If TRANSCRIPT_READ_TOKEN is set, request must include header 'x-transcript-token' equal to it.
 * - Note: Protect this endpoint in production or require authentication if transcripts must be private.
 */
app.get('/api/transcript/:sid', async (req, res) => {
  try {
    if (TRANSCRIPT_READ_TOKEN) {
      const token = req.headers['x-transcript-token'] || '';
      if (token !== TRANSCRIPT_READ_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });
    }
    const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
    const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
    res.set('Content-Type','text/plain; charset=utf-8');
    return res.send(fs.readFileSync(file,'utf8'));
  } catch (e) {
    console.error('[api/transcript] error', e && e.message);
    return res.status(500).json({ ok:false, error: 'internal_error' });
  }
});

/**
 * /api/logs/stream
 * - Server-Sent Events for logs. If SSE_TOKEN set, requires ?token=...
 */
app.get('/api/logs/stream', async (req, res) => {
  try {
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).send('unauthorized');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
    res.write(': connected\n\n');

    // send last chunk of file to client
    (async function sendLast() {
      try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stat = await fs.promises.stat(LOG_FILE);
        const start = Math.max(0, stat.size - (32 * 1024));
        const stream = createReadStream(LOG_FILE, { start, end: stat.size - 1, encoding: 'utf8' });
        for await (const chunk of stream) res.write(`data: ${chunk.replace(/\r?\n/g, '\ndata: ')}\n\n`);
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

app.get('/api/logs', (req, res) => {
  try {
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).json({ ok:false, error: 'unauthorized' });
    const txt = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE,'utf8') : '';
    res.set('Content-Type','text/plain; charset=utf-8');
    return res.send(txt);
  } catch (e) {
    console.error('[api/logs] Error', e && e.message);
    return res.status(500).json({ ok:false, error: 'internal_error' });
  }
});

/**
 * /api/whatsapp-ticket
 * - Rate-limited by express-rate-limit (3 per hour) and per-session anti-spam.
 * - Accepts: { name, device, sessionId, history }
 */
app.post('/api/whatsapp-ticket', ticketRateLimiter, async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    const sid = sessionId || req.sessionId;
    if (!canCreateTicketPerSession(sid)) return res.status(429).json({ ok:false, error:'rate_limited', message:'Se alcanzó el límite de tickets por hora. Probá en unos minutos.' });

    let transcript = history;
    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }

    // Create ticket as in createTicketAndRespond but lighter (does not change session)
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric' });
    const timeFormatter = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', hour12:false });
    const datePart = dateFormatter.format(now).replace(/\//g,'-');
    const timePart = timeFormatter.format(now);
    const generatedLabel = `${datePart} ${timePart} (ART)`;

    const safeName = (name || '').toString().replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').replace(/\s+/g,' ').trim();
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

    const whoName = name || '';
    const waIntro = whoName ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.` : (CHAT?.settings?.whatsapp_ticket_prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:');
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`;
    if (name) waText += `Cliente: ${name}\n`;
    if (device) waText += `Equipo: ${device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;

    const waUrl = buildWhatsAppUrl(WHATSAPP_NUMBER, waText);
    const waNumber = String(WHATSAPP_NUMBER).replace(/\D+/g,'');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;

    return res.json({ ok:true, ticketId, publicUrl, apiPublicUrl, waUrl, waWebUrl, ui: { externalButtons: [{ token: 'BTN_WHATSAPP_WEB', label: 'WhatsApp (Web)', url: waWebUrl }] } });
  } catch (e) {
    console.error('[whatsapp-ticket] error', e && e.message);
    return res.status(500).json({ ok:false, error: 'internal_error' });
  }
});

/**
 * /api/ticket/:tid -> returns ticket content as JSON
 */
app.get('/api/ticket/:tid', (req, res) => {
  try {
    const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
    const file = path.join(TICKETS_DIR, `${tid}.txt`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error: 'not_found' });
    const raw = fs.readFileSync(file,'utf8');
    // Parse into messages if possible
    const lines = raw.split(/\r?\n/);
    const messages = [];
    for (const ln of lines) {
      if (!ln || /^\s*$/.test(ln)) continue;
      const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
      if (m) messages.push({ ts: m[1], who: String(m[2]).trim(), text: String(m[3]).trim() });
      else messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
    return res.json({ ok:true, ticketId: tid, content: raw, messages });
  } catch (e) {
    console.error('[api/ticket] error', e && e.message);
    return res.status(500).json({ ok:false, error:'internal_error' });
  }
});

// public ticket view (simple HTML)
app.get('/ticket/:tid', (req, res) => {
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

    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Ticket ${escapeHtml(tid)}</title><style>:root{--bg:#f5f7fb;--bot:#fff;--user:#dcf8c6}body{font-family:Inter,system-ui,Arial;margin:12px;background:var(--bg);color:#222}.chat-wrap{max-width:860px;margin:0 auto}.bubble{max-width:78%;display:flex;margin-bottom:10px}.bubble.user{align-self:flex-end}.bubble.bot{align-self:flex-start}.bubble-inner{background:var(--bot);padding:10px;border-radius:12px}.bubble.user .bubble-inner{background:var(--user)}.who{font-weight:700;margin-bottom:6px}.txt{white-space:pre-wrap}.ts{font-size:12px;color:#666;margin-top:6px}.sys{color:#666;text-align:center}</style></head><body><div class="chat-wrap"><div class="chat">${chatLines}</div><div style="margin-top:12px;"><pre>${safeRaw}</pre></div></div></body></html>`;
    res.set('Content-Type','text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    console.error('[ticket/view] error', e && e.message);
    return res.status(500).send('error interno');
  }
});

// ---------------------------
// Reset session endpoint
// ---------------------------
app.post('/api/reset', async (req, res) => {
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
      waEligible: false,
      transcript: [],
      startedAt: nowIso(),
      nameAttempts: 0,
      stepProgress: {},
      lastActivityAt: nowIso()
    };
    await saveSession(sid, empty);
    return res.json({ ok:true });
  } catch (e) {
    console.error('[api/reset] error', e && e.message);
    return res.status(500).json({ ok:false, error: 'internal_error' });
  }
});

// ---------------------------
// Core chat endpoint (/api/chat)
// Accepts text messages or button actions (action=button, value=token)
// ---------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const body = req.body || {};
    let incomingText = String(body.text || '').trim();
    let buttonToken = null;
    let buttonLabel = null;

    if (body.action === 'button' && body.value) {
      buttonToken = String(body.value);
      const def = getButtonDefinition(buttonToken);
      if (def) incomingText = def.text || def.label || buttonToken;
      else {
        // support help buttons mapping
        if (buttonToken.startsWith('BTN_HELP_')) {
          const n = buttonToken.split('_').pop();
          incomingText = `ayuda paso ${n}`;
        } else incomingText = buttonToken;
      }
      buttonLabel = body.label || (getButtonDefinition(buttonToken)?.label) || buttonToken;
    }

    const t = String(incomingText || '').trim();
    const sid = req.sessionId;

    // get or create session
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
        waEligible: false,
        transcript: [],
        pendingUtterance: null,
        lastHelpStep: null,
        startedAt: nowIso(),
        helpAttempts: {},
        nameAttempts: 0,
        stepProgress: {},
        lastActivityAt: nowIso()
      };
      console.log('[api/chat] new session', sid);
    }

    // Log user message
    const userTs = nowIso();
    if (buttonToken) session.transcript.push({ who:'user', text: `[BOTON] ${buttonLabel} (${buttonToken})`, ts: userTs });
    else session.transcript.push({ who:'user', text: t, ts: userTs });
    session.lastActivityAt = nowIso();

    // Quick escalate via button or intent text
    if (buttonToken === 'BTN_WHATSAPP' || /^\s*(?:enviar\s+whats?app|hablar con un tecnico|enviar whatsapp|conectar con tecnico)$/i.test(t)) {
      return await createTicketAndRespond(session, sid, res);
    }

    // Detect help for step requests
    session.helpAttempts = session.helpAttempts || {};
    session.lastHelpStep = session.lastHelpStep || null;
    let helpRequestedIndex = null;
    if (buttonToken && /^BTN_HELP_\d+$/.test(buttonToken)) {
      const m = buttonToken.match(/^BTN_HELP_(\d+)$/);
      if (m) helpRequestedIndex = Number(m[1]);
    } else {
      const mText = (t || '').match(/\bayuda(?:\s+paso)?\s*(\d+)\b/i);
      if (mText) helpRequestedIndex = Number(mText[1]);
      else {
        const m2 = (t || '').match(/\b(paso\s*)?(\d+)\b.*ayuda/i);
        if (m2) helpRequestedIndex = Number(m2[2]);
      }
    }

    if (helpRequestedIndex) {
      // Provide step help without changing stage unexpectedly
      const idx = Number(helpRequestedIndex);
      let steps = [];
      if (session.stage === STATES.ADVANCED_TESTS) steps = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
      else if (session.stage === STATES.BASIC_TESTS) steps = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
      if (!steps || steps.length === 0) {
        const msg = 'Aún no propuse pasos para este nivel. Primero describí el problema para que te ofrezca pasos.';
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
      const stepText = steps[idx-1];
      let helpDetail = await getHelpForStep(stepText, idx, session.device || '', session.problem || '');
      if (!helpDetail || String(helpDetail).trim() === '') helpDetail = `Para realizar el paso ${idx}: ${stepText}\nSi necesitás más ayuda decímelo.`;
      const attempts = session.helpAttempts[idx] || 0;
      const extraLine = attempts >= 2 ? '\n\nVeo que este paso viene costando. Si querés, te puedo conectar con un técnico por WhatsApp.' : '';
      const reply = `🛠️ Ayuda — Paso ${idx}\n\n${helpDetail}${extraLine}\n\nDespués de probar esto, ¿cómo te fue?`;
      const ts2 = nowIso();
      session.transcript.push({ who:'bot', text: reply, ts: ts2 });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, help:{ stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: ['Lo pude solucionar ✔️', 'Volver a mostrar los pasos'] }));
    }

    // Handle "prefiero no decirlo" name choice
    const NO_NAME_RX = /^\s*(?:prefiero\s+no\s+decir(?:l[aeo])?|prefiero\s+no\s+dar\s+mi\s+nombre|no\s+quiero\s+decir\s+mi\s+nombre|no\s+deseo\s+decir\s+mi\s+nombre|prefiero\s+reservarme\s+el\s+nombre)\s*$/i;
    if (body.action === 'button' && buttonToken === 'BTN_REPHRASE' && session.stage === STATES.ASK_NAME) {
      // allow button to skip name if used in ASK_NAME context
      session.userName = 'Usuario';
      session.stage = STATES.ASK_PROBLEM;
      const msg = 'Perfecto. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?';
      session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: msg, stage: session.stage, options: [] }));
    }
    if (NO_NAME_RX.test(t) && session.stage === STATES.ASK_NAME) {
      session.userName = 'Usuario';
      session.stage = STATES.ASK_PROBLEM;
      const reply = 'Perfecto. Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?';
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
    }

    // ASK_NAME state handling
    if (session.stage === STATES.ASK_NAME) {
      if (looksClearlyNotName(t)) {
        session.nameAttempts = (session.nameAttempts || 0) + 1;
        await saveSession(sid, session);
        const reply = 'No detecté un nombre claro. ¿Podés decirme solo tu nombre? Por ejemplo: "Ana" o "Juan Pablo".';
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Prefiero no decirlo'] }));
      }

      const candidate = extractName(t);
      if (candidate && isValidName(candidate)) {
        // Optional OpenAI advisory check — tolerant
        if (openai) {
          try {
            const oa = await analyzeNameWithOA(candidate);
            if (!oa.isValid && oa.confidence >= OA_NAME_REJECT_CONF) {
              session.nameAttempts = (session.nameAttempts || 0) + 1;
              await saveSession(sid, session);
              const reply = 'Ese nombre no me suena correcto. ¿Podés escribir tu nombre real o tocar "Prefiero no decirlo"?';
              session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
              return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Prefiero no decirlo'] }));
            }
          } catch (e) { console.error('[ask_name][OA] error', e && e.message); /* continue */ }
        }

        session.userName = candidate;
        session.stage = STATES.ASK_PROBLEM;
        const reply = `¡Genial, ${capitalizeToken(session.userName)}! 👍\n\nAhora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      }

      session.nameAttempts = (session.nameAttempts || 0) + 1;
      const reply = 'Escribime solo tu nombre, por ejemplo: "María" o "Juan Pablo".';
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Prefiero no decirlo'] }));
    }

    // Inline name capture when user supplies name elsewhere
    {
      const nmInline = extractName(t);
      if (nmInline && !session.userName) {
        session.userName = nmInline;
        if (session.stage === STATES.ASK_NAME) {
          session.stage = STATES.ASK_PROBLEM;
          const reply = `¡Genial, ${capitalizeToken(session.userName)}! Ahora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`;
          session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
        }
      }
    }

    // Reformulate problem / change problem
    if (/^\s*(reformular|reformular problema|cambiar problema|no era eso)\b/i.test(t) || buttonToken === 'BTN_REPHRASE') {
      const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
      const reply = `Perfecto, ${who}. Contame nuevamente el problema con tus palabras.`;
      session.stage = STATES.ASK_PROBLEM;
      session.problem = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
    }

    // ASK_PROBLEM handling
    if (session.stage === STATES.ASK_PROBLEM) {
      // If user provides problem text
      if (t) session.problem = t;
      session.lastActivityAt = nowIso();

      // If we can detect device from text, disambiguate using exact token
      if (!session.device) {
        const dis = getDeviceDisambiguation(session.problem || '');
        if (dis) {
          session.stage = STATES.ASK_DEVICE;
          session.pendingDeviceGroup = dis.baseLabel || '';
          const spokenLabel = dis.baseLabel || 'ese equipo';
          const optionLabels = (dis.variants && dis.variants.length > 0) ? dis.variants.map(v => v.label) : ['PC de escritorio','Notebook','Otro'];
          const replyText = `Cuando decís "${spokenLabel}", ¿a cuál de estos dispositivos te referís?`;
          const uiButtons = buildUiButtonsFromTokens(dis.variants.map(v => v.token));
          session.transcript.push({ who:'bot', text: replyText, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply: replyText, stage: session.stage, options: optionLabels, ui: { buttons: uiButtons } }));
        }
      }

      // Optional OpenAI analyze intent; advisory only
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
        } catch (e) { console.error('[ask_problem][OA] error', e && e.message); /* ignore and continue */ }
      }

      // Summarize and ask for confirmation before producing steps
      const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
      const deviceLabel = session.device ? session.device : (session.pendingDeviceGroup ? session.pendingDeviceGroup : '');
      const pSummary = safeTrim(session.problem || '', 180);
      const summary = `Perfecto, ${who}: entonces${deviceLabel ? ' con tu ' + deviceLabel : ''} pasa esto: "${pSummary}". ¿Es correcto?`;
      session.pendingConfirmation = { problem: session.problem, device: session.device || null };
      session.stage = STATES.CONFIRM_PROBLEM;
      session.transcript.push({ who:'bot', text: summary, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: summary, stage: session.stage, options: ['Sí, es ese problema','No, cambiar'] }));
    }

    // ASK_DEVICE handling — expects button tokens from disambiguation
    if (session.stage === STATES.ASK_DEVICE) {
      if (!buttonToken || !/^BTN_DEV_/.test(buttonToken)) {
        const replyText = 'Por favor, elegí una de las opciones con los botones para indicar el tipo exacto de equipo.';
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
    }

    // CONFIRM_PROBLEM handling
    if (session.stage === STATES.CONFIRM_PROBLEM) {
      const optConfirm = /^\s*(s|si|sí|correcto|es correcto|sí es correcto)$/i;
      const optNo = /^\s*(no|n|no es ese|no, cambiar|no era eso)/i;
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
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: 'Perfecto, contame nuevamente el problema con tus palabras.', stage: session.stage, options: [] }));
      } else {
        const rep = 'Decime si es correcto o si querés cambiar la descripción del problema.';
        session.transcript.push({ who:'bot', text: rep, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: rep, stage: session.stage, options: ['Sí, es ese problema','No, cambiar'] }));
      }
    }

    // BASIC_TESTS handling
    if (session.stage === STATES.BASIC_TESTS) {
      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar)/i;
      const rxNo = /^\s*(no|n|el problema persiste|persiste)/i;
      const rxMore = /^\s*(mas pruebas|más pruebas|más)/i;
      const rxTech = /^\s*(conectar con tecnico|conectar|conectar con t[eé]cnico)/i;
      const rxShow = /^\s*(volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShow.test(t)) {
        const stepsAr = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
        if (!stepsAr || stepsAr.length === 0) {
          const msg = 'No tengo pasos guardados para mostrar. Primero describí el problema para que te ofrezca pasos.';
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
        }
        const numbered = stepsAr.map((s,i) => `Paso ${i+1}: ${s}`);
        const fullMsg = `Volvemos a los pasos sugeridos:\n\n${numbered.join('\n')}\n\nSi necesitás ayuda en un paso tocá en el número.`;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        const helpOptions = stepsAr.map((_,i) => `Paso ${i+1} — Ayuda`);
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'] }));
      }

      if (rxYes.test(t)) {
        const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
        const reply = `¡Genial, ${who} 🙌! ¿Querés que cierre este chat por ahora? Si necesitás, podés abrirlo de nuevo cuando quieras.\n\nGracias por usar Tecnos de STI — Servicio Técnico Inteligente.`;
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
        // advanced tests flow
        const device = session.device || '';
        let aiSteps = [];
        try { aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e){ aiSteps = []; }
        const limited = Array.isArray(aiSteps) ? aiSteps.slice(0,4) : [];
        session.tests = session.tests || {};
        session.tests.advanced = limited;
        if (!limited || limited.length === 0) return await createTicketAndRespond(session, sid, res);
        session.stepProgress = session.stepProgress || {};
        limited.forEach((_,i) => session.stepProgress[`adv_${i+1}`] = 'pending');
        const numbered = limited.map((s,i) => `Paso ${i+1}: ${s}`);
        const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
        const fullMsg = `Entiendo, ${who}. Probemos ahora algunas pruebas más avanzadas:\n\n${numbered.join('\n')}\n\nSi necesitás ayuda en un paso tocá en el número.`;
        session.stepsDone = session.stepsDone || [];
        session.stepsDone.push('advanced_tests_shown');
        session.waEligible = false;
        session.lastHelpStep = null;
        session.stage = STATES.ADVANCED_TESTS;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        const helpOptions = limited.map((_,i) => `Paso ${i+1} — Ayuda`);
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'], steps: limited }));
      } else if (rxTech.test(t)) {
        return await createTicketAndRespond(session, sid, res);
      } else {
        const reply = `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o elegir "Más pruebas" o "Conectar con Técnico".`;
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Lo pude solucionar ✔️','El problema persiste ❌','Más pruebas 🔍','Conectar con Técnico 🧑‍💻'] }));
      }
    }

    // ADVANCED_TESTS handling (similar to BASIC_TESTS)
    if (session.stage === STATES.ADVANCED_TESTS) {
      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar)/i;
      const rxNo = /^\s*(no|n|el problema persiste|persiste)/i;
      const rxTech = /^\s*(conectar con tecnico|conectar|conectar con t[eé]cnico)/i;
      const rxShow = /^\s*(volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShow.test(t)) {
        const stepsAr = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
        if (!stepsAr || stepsAr.length === 0) {
          const msg = 'No tengo pasos avanzados guardados para mostrar. Primero pedí "Más pruebas".';
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
        }
        const numbered = stepsAr.map((s,i) => `Paso ${i+1}: ${s}`);
        const fullMsg = `Volvemos a las pruebas avanzadas:\n\n${numbered.join('\n')}\n\nSi necesitás ayuda en un paso tocá en el número.`;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        const helpOptions = stepsAr.map((_,i) => `Paso ${i+1} — Ayuda`);
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'] }));
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
    }

    // ESCALATE handling (user chooses more tests or connect)
    if (session.stage === STATES.ESCALATE) {
      const optMore = /^\s*(mas pruebas|más pruebas|más|1)/i;
      const optConnect = /^\s*(conectar|conectar con tecnico|2)/i;
      if (optMore.test(t) || buttonToken === 'BTN_MORE_TESTS') {
        // reuse advanced tests flow
        const device = session.device || '';
        let aiSteps = [];
        try { aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e){ aiSteps = []; }
        const limited = Array.isArray(aiSteps) ? aiSteps.slice(0,4) : [];
        session.tests = session.tests || {};
        session.tests.advanced = limited;
        if (!limited || limited.length === 0) return await createTicketAndRespond(session, sid, res);
        session.stepProgress = session.stepProgress || {};
        limited.forEach((_,i) => session.stepProgress[`adv_${i+1}`] = 'pending');
        const numbered = limited.map((s,i) => `Paso ${i+1}: ${s}`);
        const who = session.userName ? capitalizeToken(session.userName) : 'usuario';
        const fullMsg = `Entiendo, ${who}. Probemos ahora algunas pruebas más avanzadas:\n\n${numbered.join('\n')}\n\nSi necesitás ayuda en un paso tocá en el número.`;
        session.stepsDone = session.stepsDone || [];
        session.stepsDone.push('advanced_tests_shown');
        session.waEligible = false;
        session.lastHelpStep = null;
        session.stage = STATES.ADVANCED_TESTS;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: [...limited.map((_,i)=>`Paso ${i+1} — Ayuda`), 'Lo pude solucionar ✔️', 'El problema persiste ❌'], steps: limited }));
      } else if (optConnect.test(t) || buttonToken === 'BTN_CONNECT_TECH' || buttonToken === 'BTN_WHATSAPP') {
        return await createTicketAndRespond(session, sid, res);
      } else {
        const reply = 'Decime si querés "Más pruebas" o "Conectar con Técnico".';
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Más pruebas 🔍','Conectar con Técnico 🧑‍💻'] }));
      }
    }

    // ENDED handling (closed chat)
    if (session.stage === STATES.ENDED) {
      const reply = 'El chat quedó cerrado. Si necesitás volver a abrirlo, escribí "reiniciar" o tocá "Nuevo chat".';
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Reiniciar'] }));
    }

    // Default fallback for unknown states
    const reply = 'No estoy seguro cómo responder ahora. Podés reiniciar o escribir "Reformular Problema".';
    return res.json(withOptions({ ok:true, reply, stage: session.stage, options: ['Reformular Problema'] }));
  } catch (e) {
    console.error('[api/chat] Error', e && e.message);
    // Return friendly generic error; never expose stack to client
    return res.status(200).json(withOptions({ ok:false, reply: 'Hubo un inconveniente al procesar tu mensaje, pero ya podemos seguir. Volveme a contar en qué necesitás ayuda y lo vemos juntos.' }));
  }
});

// ---------------------------
// Admin: list sessions (reads via sessionStore)
// ---------------------------
app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await listActiveSessions();
    return res.json({ ok:true, count: sessions.length, sessions });
  } catch (e) {
    console.error('[api/sessions] error', e && e.message);
    return res.status(500).json({ ok:false, error: 'internal_error' });
  }
});

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, () => {
  console.log(`STI • Tecnos started on ${PORT}`);
  console.log(`[INFO] Public base URL: ${PUBLIC_BASE_URL}`);
  console.log('[INFO] SSE available at /api/logs/stream (use token param if SSE_TOKEN set)');
  console.log('[INFO] Ensure TIMEZONE, CORS_ORIGINS and OPENAI_API_KEY are configured appropriately for production.');
});

/**
 * Notes for maintainers & auditor:
 * - The sessionStore.js module must implement persistence and TTL (recommended Redis).
 * - Run `npm audit` and resolve HIGH/CRITICAL issues before production.
 * - Frontend should send client's timezone header: 'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
 * - For transcripts privacy, set TRANSCRIPT_READ_TOKEN env or protect the endpoint behind auth.
 * - This file intentionally does not print secrets to logs or send process.env to clients.
 *
 * Responsible technical contact: (fill with actual maintainer)
 * - Name: Lucas Bertolino (STI Rosario) — replace with project owner/contact in production
 * - Email: [maintainer@example.com] — replace with real contact before production
 *
 * Regression test checklist (minimum, include in CI):
 * - Greeting with x-timezone returns expected greeting (morning/afternoon/night)
 * - Name capture: POST /api/chat with {"text":"laura"} -> moves to ASK_PROBLEM
 * - Problem submission & device disambiguation: POST /api/chat with {"text":"mi pc no enciende"} -> asks about pc variants
 * - Basic tests generation: choose device -> get steps, numbered
 * - Help per step: "ayuda paso 1" -> returns explanation
 * - Escalation: "Conectar con Técnico" -> creates ticket and returns waUrl
 * - Ticket rate limiting: more than 3 requests/hour -> 429
 *
 * End of server.js
 */