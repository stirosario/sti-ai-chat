/**
 * server.js — STI Chat (stable) — WhatsApp button + Logs SSE compatible with chatlog.php
 *
 * This file merges the working parts of the provided servers and ensures:
 *  - /api/logs/stream supports SSE and polling mode=once (used by chatlog.php)
 *  - logs are written to LOG_FILE and broadcast to SSE clients
 *  - /api/chat handles BTN_WHATSAPP and BTN_CONNECT_TECH returning waUrl/waWebUrl/waAppUrl/waIntentUrl and ui.buttons
 *  - /api/whatsapp-ticket remains available as API to generate ticket + waUrl/waWebUrl/waAppUrl/waIntentUrl
 *  - /api/ticket/:tid returns content (raw) and messages[] parsed for chat presentation
 *
 * Environment variables:
 *  - PORT (default 3001)
 *  - DATA_BASE (default /data)
 *  - PUBLIC_BASE_URL (used to build public ticket links)
 *  - WHATSAPP_NUMBER (digits only or with +, default '5493417422422')
 *  - OPENAI_API_KEY (optional)
 *  - OPENAI_MODEL (optional)
 *  - OA_MIN_CONF (optional; 0..1)
 *  - SSE_TOKEN (optional; if defined, chatlog.php must set same token via GET param token=...)
 *
 * Note: this server expects a sessionStore.js module with getSession/saveSession/listActiveSessions
 *       (same as your previous versions). If you don't have it, create a simple in-memory fallback.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

// Session store (expected to exist in your repo)
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// OpenAI client (optional)
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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

// SSE clients set
const sseClients = new Set();

// Logging stream (best-effort)
let logStream = null;
try {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
} catch (e) {
  console.error('[init] no pude abrir stream de logs', e && e.message);
}

// helpers
const nowIso = () => new Date().toISOString();
function formatLog(level, ...parts) {
  const text = parts.map(p => {
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch(e) { return String(p); }
  }).join(' ');
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

// wrap console to log to file + SSE
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

// Embedded chat config (kept minimal / compatible)
const EMBEDDED_CHAT = {
  version: 'stable-v1',
  messages_v4: { greeting: { name_request: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?' } },
  settings: { OA_MIN_CONF: '0.6', whatsapp_ticket: { prefix: 'Hola STI. Vengo del chat web. Dejo mi consulta:' } },
  ui: {
    buttons: [
      { token: 'BTN_HELP_1', label: 'Ayuda paso 1', text: 'ayuda paso 1' },
      { token: 'BTN_HELP_2', label: 'Ayuda paso 2', text: 'ayuda paso 2' },
      { token: 'BTN_HELP_3', label: 'Ayuda paso 3', text: 'ayuda paso 3' },
      { token: 'BTN_HELP_4', label: 'Ayuda paso 4', text: 'ayuda paso 4' },
      { token: 'BTN_SOLVED', label: 'Lo pude Solucionar ✔️', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: 'El problema Persiste ❌', text: 'el problema persiste' },
      { token: 'BTN_REPHRASE', label: 'Reformular Problema', text: 'reformular problema' },
      { token: 'BTN_CLOSE', label: 'Cerrar Chat 🔒', text: 'cerrar chat' },
      { token: 'BTN_WHATSAPP', label: 'Enviar WhatsApp', text: 'hablar con un tecnico' },
      { token: 'BTN_MORE_TESTS', label: '1️⃣ 🔍 Más pruebas', text: '1️⃣ 🔍 Más pruebas' },
      { token: 'BTN_CONNECT_TECH', label: '2️⃣ 🧑‍💻 Conectar con Técnico', text: '2️⃣ 🧑‍💻 Conectar con Técnico' }
    ],
    states: {}
  },
  nlp: {
    devices: [
      { key: 'pc', rx: '\\b(pc|computadora|ordenador)\\b' },
      { key: 'notebook', rx: '\\b(notebook|laptop)\\b' },
      { key: 'router', rx: '\\b(router|modem)\\b' }
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

// derived helpers
let CHAT = EMBEDDED_CHAT || {};
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

// Build an "external" button structure (explicit url) to maximize frontend compatibility
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

// small NLP helpers (copied/compatible)
const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function emojiForIndex(i){ const n = i+1; return NUM_EMOJIS[n] || `${n}.`; }
function enumerateSteps(arr){ if(!Array.isArray(arr)) return []; return arr.map((s,i)=>`${emojiForIndex(i)} ${s}`); }
const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;
function isValidName(text){
  if(!text) return false;
  const t = String(text).trim();
  if(TECH_WORDS.test(t)) return false;
  return /^[a-záéíóúñ]{2,20}$/i.test(t);
}
function extractName(text){
  if(!text) return null;
  const t = String(text).trim();
  let m = t.match(/^(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{2,20})$/i);
  if(m) return m[1];
  if(isValidName(t)) return t;
  return null;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = obj => ({ options: [], ...obj });

// OpenAI helpers (used as filter)
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF || Number(CHAT?.settings?.OA_MIN_CONF || 0.6));

async function analyzeProblemWithOA(problemText = ''){
  if(!openai) return { isIT: false, device: null, issueKey: null, confidence: 0 };
  const prompt = [
    "Sos técnico informático argentino, claro y profesional.",
    "Decidí si el siguiente texto corresponde a un problema del rubro informático.",
    "Si es informático, detectá device (equipo), issueKey (tipo de problema) y confidence (0..1).",
    "Respondé SOLO un JSON con {isIT: true|false, device, issueKey, confidence}.",
    `Texto: "${problemText}"`
  ].join('\n');
  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g,'');
    try {
      const obj = JSON.parse(raw);
      return {
        isIT: !!obj.isIT,
        device: obj.device || null,
        issueKey: obj.issueKey || null,
        confidence: Math.max(0, Math.min(1, Number(obj.confidence || 0)))
      };
    } catch(parseErr){
      console.error('[analyzeProblemWithOA] parse error', parseErr.message, 'raw:', raw);
      return { isIT: false, device: null, issueKey: null, confidence: 0 };
    }
  } catch (e) {
    console.error('[analyzeProblemWithOA]', e.message);
    return { isIT: false, device: null, issueKey: null, confidence: 0 };
  }
}

async function aiQuickTests(problemText = '', device = ''){
  if(!openai){
    return [
      'Reiniciar la aplicación donde ocurre el problema',
      'Probar en otro documento o programa para ver si persiste',
      'Reiniciar el equipo',
      'Comprobar actualizaciones del sistema',
      'Verificar conexiones físicas'
    ];
  }
  const prompt = [
    "Sos técnico informático argentino, claro y amable.",
    `Problema: "${problemText}"${device ? ` en ${device}` : ''}.`,
    "Indicá 4–6 pasos simples y seguros.",
    "Devolvé solo un JSON array de strings."
  ].join('\n');
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });
    const raw = (resp.choices?.[0]?.message?.content||'').replace(/```json|```/g,'').trim();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x=>typeof x==='string').slice(0,6) : [];
  } catch (e) {
    console.error('[aiQuickTests] Error', e.message);
    return ['Reiniciar la aplicación','Reiniciar el equipo','Comprobar actualizaciones','Verificar conexiones físicas'];
  }
}

async function getHelpForStep(stepText='', stepIndex=1, device='', problem=''){
  if(!stepText) return 'No tengo el detalle de ese paso. Revisá los pasos que te ofrecí anteriormente.';
  if(!openai){
    return `Para realizar el paso ${stepIndex}:\n\n${stepText}\n\nConsejos: hacelo con calma, verificá conexiones y avisame cualquier mensaje de error.`;
  }
  const prompt = [
    "Sos técnico informático argentino, claro y amable.",
    `Explicá cómo ejecutar este paso para un usuario no técnico: "${stepText}"`,
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
    console.error('[getHelpForStep] Error', e.message);
    return `Para realizar el paso ${stepIndex}: ${stepText}\nSi necesitás más ayuda decímelo.`;
  }
}

// Express app
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

// States
const STATES = {
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  ASK_DEVICE: 'ask_device',
  BASIC_TESTS: 'basic_tests',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
  ENDED: 'ended'
};

// session id normalization
function getSessionId(req){
  const h = (req.headers['x-session-id']||'').toString().trim();
  const b = (req.body && (req.body.sessionId||req.body.sid)) ? String(req.body.sessionId||req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId||req.query.sid)) ? String(req.query.sessionId||req.query.sid).trim() : '';
  return h || b || q || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req,_res,next)=>{ req.sessionId = getSessionId(req); next(); });

// Health
app.get('/api/health', (_req,res) => {
  res.json({ ok:true, hasOpenAI: !!process.env.OPENAI_API_KEY, openaiModel: OPENAI_MODEL, version: CHAT?.version || 'embedded' });
});

// reload config (hot)
app.post('/api/reload', (_req,res)=>{ try{ /* nothing dynamic for now */ res.json({ ok:true, version: CHAT.version||null }); } catch(e){ res.status(500).json({ ok:false, error: e.message }); } });
...