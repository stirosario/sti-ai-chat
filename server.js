/**
 * server.js — STI Chat (stable) — WhatsApp button + Logs SSE compatible with chatlog.php
 *
 * Environment variables:
 *  - PORT (default 3001)
 *  - DATA_BASE (default /data)
 *  - PUBLIC_BASE_URL
 *  - WHATSAPP_NUMBER (default '5493417422422')
 *  - OPENAI_API_KEY (optional)
 *  - OPENAI_MODEL (optional)
 *  - OA_MIN_CONF (optional; 0..1)
 *  - SSE_TOKEN (optional)
 *
 * Note: expects sessionStore.js with getSession/saveSession/listActiveSessions
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

// Transcript
app.get('/api/transcript/:sid', (req,res)=>{
  const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if(!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type','text/plain; charset=utf-8');
  res.send(fs.readFileSync(file,'utf8'));
});

// Logs endpoints
app.get('/api/logs/stream', async (req, res) => {
  try {
    // SSE token protection
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) {
      return res.status(401).send('unauthorized');
    }

    // polling mode (mode=once) — used by chatlog.php fallback
    if (String(req.query.mode || '') === 'once') {
      const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(txt);
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.flushHeaders && res.flushHeaders();

    // initial comment
    res.write(': connected\n\n');

    // send last chunk of log asynchronously (non-blocking)
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

    // heartbeat to survive proxies
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

// Helper to build whatsapp url
function buildWhatsAppUrl(waNumberRaw, waText) {
  const waNumber = String(waNumberRaw || WHATSAPP_NUMBER || '5493417422422').replace(/\D+/g, '');
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
}

// WhatsApp ticket API (reusable)
app.post('/api/whatsapp-ticket', async (req,res)=>{
  try{
    const { name, device, sessionId, history = [] } = req.body || {};
    let transcript = history;
    const sid = sessionId || req.sessionId;
    if((!transcript || transcript.length===0) && sid){
      const s = await getSession(sid);
      if(s?.transcript) transcript = s.transcript;
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
    if(name){ safeName = String(name).replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
    const titleLine = safeName ? `STI • Ticket ${ticketId}-${safeName}` : `STI • Ticket ${ticketId}`;
    const lines = [];
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if(name) lines.push(`Cliente: ${name}`);
    if(device) lines.push(`Equipo: ${device}`);
    if(sid) lines.push(`Session: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    for(const m of transcript || []){ lines.push(`[${m.ts||now.toISOString()}] ${m.who||'user'}: ${m.text||''}`); }

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){ /* noop */ }
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;

    // [STI-CHANGE] personalizar prefijo de WhatsApp usando el nombre del usuario si está disponible
    const userSess = sid ? await getSession(sid) : null; // [STI-CHANGE]
    const whoName = (name || userSess?.userName || '').toString().trim(); // [STI-CHANGE]
    const waIntro = whoName
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.` // [STI-CHANGE]
      : (CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:'); // [STI-CHANGE]
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`; // [STI-CHANGE]
    if(name) waText += `Cliente: ${name}\n`;
    if(device) waText += `Equipo: ${device}\n`;
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
  } catch(e){ console.error('[whatsapp-ticket]', e); res.status(500).json({ ok:false, error: e.message }); }
});

// ticket public routes
// /api/ticket/:tid returns content (raw) AND messages[] parsed to facilitate chat-like rendering in frontend
app.get('/api/ticket/:tid', (req, res) => {
  const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error: 'not_found' });

  const raw = fs.readFileSync(file,'utf8');

  // parse lines into messages: expected lines like "[TIMESTAMP] who: text"
  const lines = raw.split(/\r?\n/);
  const messages = [];
  for (const ln of lines) {
    if (!ln || /^\s*$/.test(ln)) continue;
    const m = ln.match(/^\s*\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
    if (m) {
      messages.push({ ts: m[1], who: String(m[2]).trim(), text: String(m[3]).trim() });
    } else {
      // non timestamp line (title, metadata), push as system message
      messages.push({ ts: null, who: 'system', text: ln.trim() });
    }
  }

  res.json({ ok:true, ticketId: tid, content: raw, messages });
});

// Mejor presentación HTML del ticket: vista cascada estilo conversación
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

// reset session
app.post('/api/reset', async (req,res)=>{
  const sid = req.sessionId;
  const empty = { id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null, tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null, startedAt: nowIso() };
  await saveSession(sid, empty);
  res.json({ ok:true });
});

// greeting
app.all('/api/greeting', async (req,res)=>{
  try{
    const sid = req.sessionId;
    const fresh = { id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null, tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null, startedAt: nowIso() };
    const text = CHAT?.messages_v4?.greeting?.name_request || '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
    fresh.transcript.push({ who:'bot', text, ts: nowIso() });
    await saveSession(sid, fresh);
    return res.json({ ok:true, greeting:text, reply:text, options: [] });
  } catch(e){ console.error(e); return res.json({ ok:true, greeting:'👋 Hola', reply:'👋 Hola', options:[] }); }
});

// helper reutilizable para crear ticket y responder con wa URLs
async function createTicketAndRespond(session, sid, res) {
  const ts = nowIso();
  try {
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
    if(session.userName){ safeName = String(session.userName).replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
    const titleLine = safeName ? `STI • Ticket ${ticketId}-${safeName}` : `STI • Ticket ${ticketId}`;
    const lines = [];
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if(session.userName) lines.push(`Cliente: ${session.userName}`);
    if(session.device) lines.push(`Equipo: ${session.device}`);
    if(sid) lines.push(`Session: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    for(const m of session.transcript || []){ lines.push(`[${m.ts||ts}] ${m.who||'user'}: ${m.text||''}`); }

    try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){ /* noop */ }
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;

    // [STI-CHANGE] personalizar prefijo de WhatsApp usando el nombre del usuario de la sesión
    const whoName = (session?.userName || '').toString().trim(); // [STI-CHANGE]
    const waIntro = whoName
      ? `Hola STI, me llamo ${whoName}. Vengo del chat web y dejo mi consulta para que un técnico especializado revise mi caso.` // [STI-CHANGE]
      : (CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:'); // [STI-CHANGE]
    let waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n`; // [STI-CHANGE]
    if(session.userName) waText += `Cliente: ${session.userName}\n`; // [STI-CHANGE]
    if(session.device) waText += `Equipo: ${session.device}\n`; // [STI-CHANGE]
    waText += `\nTicket: ${ticketId}\nDetalle: ${apiPublicUrl}`;

    const waNumberRaw = String(process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422');
    const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
    const waNumber = waNumberRaw.replace(/\D+/g,'');
    const waWebUrl = `https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waAppUrl = `whatsapp://send?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    const waIntentUrl = `intent://send?phone=${waNumber}&text=${encodeURIComponent(waText)}#Intent;package=com.whatsapp;scheme=whatsapp;end`;

    const whoLabel = session.userName ? cap(session.userName) : 'usuario';
    const replyTech = `🤖 Muy bien, ${whoLabel}.\nEstoy preparando tu ticket. Toca el botón para abrir WhatsApp.`;

    session.transcript.push({ who:'bot', text: replyTech, ts });
    session.waEligible = true;
    session.stage = STATES.ESCALATE;
    await saveSession(sid, session);

    // append transcript lines to file using same ts
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      const botLine  = `[${ts}] ASSISTANT: ${replyTech}\n`;
      fs.appendFile(tf, botLine, ()=>{});
    } catch (e) { /* noop */ }

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

// chat core (main endpoint)
app.post('/api/chat', async (req,res)=>{
  try{
    const body = req.body || {};
    // token map from embedded buttons
    const tokenMap = {};
    if(Array.isArray(CHAT?.ui?.buttons)){
      for(const b of CHAT.ui.buttons) if(b.token) tokenMap[b.token] = b.text || '';
    }

    let incomingText = String(body.text || '').trim();
    let buttonToken = null;
    let buttonLabel = null;
    if(body.action === 'button' && body.value){
      buttonToken = String(body.value);
      if(tokenMap[buttonToken] !== undefined) incomingText = tokenMap[buttonToken];
      else if(buttonToken.startsWith('BTN_HELP_')){
        const n = buttonToken.split('_').pop();
        incomingText = `ayuda paso ${n}`;
      } else incomingText = buttonToken;
      buttonLabel = body.label || buttonToken;
    }
    const t = String(incomingText || '').trim();
    const sid = req.sessionId;

    let session = await getSession(sid);
    if(!session){
      // agregar campos mínimos para manejo de "ayuda paso N"
      session = { id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null, tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null, startedAt: nowIso(), helpAttempts: {} };
      console.log('[api/chat] nueva session', sid);
    }

    // quick BTN_WHATSAPP: create ticket and return waUrl + UI button definition
    if (buttonToken === 'BTN_WHATSAPP' || /^\s*(?:enviar\s+whats?app|hablar con un tecnico|enviar whatsapp)$/i.test(t) ) {
      try {
        return await createTicketAndRespond(session, sid, res); // [STI-CHANGE]
      } catch (errBtn) {
        console.error('[BTN_WHATSAPP]', errBtn);
        session.transcript.push({ who:'bot', text: '❗ No pude preparar el ticket ahora. Probá de nuevo en un momento.', ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:false, reply: '❗ No pude preparar el ticket ahora. Probá de nuevo en un momento.', stage: session.stage, options: [] }));
      }
    }

    // Manejo ligero y seguro de "Ayuda paso N"
    // Detectar petición de ayuda por botón (BTN_HELP_1, BTN_HELP_2...) o por texto "ayuda paso N"
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

    // [STI-CHANGE] UNIFICACIÓN del handler de "Ayuda paso N": elegir array según el estado actual (basic vs advanced)
    if (helpRequestedIndex) {
      try {
        const idx = Number(helpRequestedIndex);

        // elegir array según estado
        let steps = [];
        if (session.stage === STATES.ADVANCED_TESTS) {
          steps = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
        } else if (session.stage === STATES.BASIC_TESTS) {
          steps = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
        } else {
          // Si no estamos en ningún estado de pasos específico, preferimos no asumir: fallback mensaje
          steps = [];
        }

        if (!steps || steps.length === 0) {
          const msg = 'Aún no propuse pasos para este nivel. Probá primero con las opciones anteriores.'; // [STI-CHANGE]
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session); // [STI-CHANGE]
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] })); // [STI-CHANGE]
        }

        if (idx < 1 || idx > steps.length) {
          const msg = `Paso inválido. Elegí un número entre 1 y ${steps.length}.`; // [STI-CHANGE]
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session); // [STI-CHANGE]
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] })); // [STI-CHANGE]
        }

        // incrementar contador de intentos para ese paso y guardar lastHelpStep
        session.helpAttempts[idx] = (session.helpAttempts[idx] || 0) + 1;
        session.lastHelpStep = idx;
        session.stage = session.stage || STATES.BASIC_TESTS;

        const stepText = steps[idx - 1];
        let helpDetail = await getHelpForStep(stepText, idx, session.device || '', session.problem || '');
        if (!helpDetail || String(helpDetail).trim() === '') {
          helpDetail = `Para realizar el paso ${idx}: ${stepText}\nSi necesitás más ayuda respondé "No entendí" o tocá 'Conectar con Técnico'.`;
        }

        // usar helpAttempts para reforzar la sugerencia si el usuario ya pidió ayuda varias veces
        const attempts = session.helpAttempts[idx] || 0;
        let extraLine = '';
        if (attempts >= 2) {
          extraLine = '\n\nVeo que este paso viene costando. Si querés, te puedo conectar con un técnico por WhatsApp.';
        }

        const ts = nowIso(); // usar mismo timestamp para transcript y archivo
        const reply = `🛠️ Ayuda — Paso ${idx}\n\n${helpDetail}${extraLine}\n\nDespués de probar esto, ¿cómo te fue?`;

        // registrar también el mensaje del usuario en la sesión/transcript (importante para tickets/historial)
        const userMsg = buttonToken ? `[BOTON] ${buttonLabel || ('BTN_HELP_' + idx)}` : `ayuda paso ${idx}`;
        session.transcript.push({ who:'user', text: userMsg, ts });
        session.transcript.push({ who:'bot', text: reply, ts });
        await saveSession(sid, session);

        // además registrar en el archivo de transcripts para mantener coherencia con el resto del flujo
        try {
          const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
          const userLine = `[${ts}] USER: ${userMsg}\n`;
          const botLine  = `[${ts}] ASSISTANT: ${reply}\n`;
          fs.appendFile(tf, userLine, ()=>{});
          fs.appendFile(tf, botLine, ()=>{});
        } catch(e){ /* noop */ }

        // Opciones dependientes del nivel:
        if (session.stage === STATES.BASIC_TESTS) {
          // [STI-CHANGE] En BASIC_TESTS incluimos helpOptions + Lo pude solucionar + El problema persiste
          const helpOptions = steps.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`); // [STI-CHANGE]
          const opts = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌']; // [STI-CHANGE]
          return res.json(withOptions({ ok:true, help:{ stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: opts })); // [STI-CHANGE]
        } else {
          // [STI-CHANGE] ADVANCED_TESTS: solo dos opciones (solucionado / volver a mostrar)
          const opts = ['Lo pude solucionar ✔️', 'Volver a mostrar los pasos. ⏪']; // [STI-CHANGE]
          return res.json(withOptions({ ok:true, help:{ stepIndex: idx, stepText, detail: helpDetail }, reply, stage: session.stage, options: opts })); // [STI-CHANGE]
        }

      } catch (err) {
        console.error('[STI-CHANGE][help_step] Error generando ayuda:', err && err.message);
        const msg = 'No pude preparar la ayuda ahora. Probá de nuevo en unos segundos.';
        session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
      }
    }
    // [FIN STI-CHANGE] unificado handler de ayuda

    // record user message
    if(buttonToken){
      session.transcript.push({ who:'user', text: `[BOTON] ${buttonLabel} (${buttonToken})`, ts: nowIso() });
    } else {
      session.transcript.push({ who:'user', text: t, ts: nowIso() });
    }

    // name extraction
    const nmInline = extractName(t);
    if(nmInline && !session.userName){
      session.userName = cap(nmInline);
      if(session.stage === STATES.ASK_NAME){
        session.stage = STATES.ASK_PROBLEM;
        const reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json({ ok:true, reply, stage: session.stage, options: [] });
      }
    }

    // simple "reformular problema"
    if (/^\s*reformular\s*problema\s*$/i.test(t)) {
      const whoName = session.userName ? cap(session.userName) : 'usuario';
      const reply = `¡Intentemos nuevamente, ${whoName}! 👍\n\n¿Qué problema estás teniendo?`;
      session.stage = STATES.ASK_PROBLEM;
      session.problem = null;
      session.issueKey = null;
      session.tests = { basic: [], ai: [], advanced: [] };
      session.lastHelpStep = null;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    }

    // very small state machine to demonstrate behavior (you can expand)
    let reply = '';
    let options = [];

    if(session.stage === STATES.ASK_NAME){
      reply = CHAT?.messages_v4?.greeting?.name_request || '👋 ¡Hola! ¿Cuál es tu nombre?';
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply, stage: session.stage, options }));
    } else if (session.stage === STATES.ASK_PROBLEM){
      session.problem = t || session.problem;
      if(!openai){
        const fallbackMsg = 'OpenAI no está configurado. Procedo sin filtro.';
        console.log('[api/chat] OpenAI no configurado, continuación sin filtro.');
      } else {
        // apply OA filter
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
      }

      // produce simple steps (either configured or generated)
      const issueKey = session.issueKey;
      const device = session.device || null;
      const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length>0);
      let steps;
      if(hasConfiguredSteps) steps = CHAT.nlp.advanced_steps[issueKey].slice(0,4);
      else {
        let aiSteps = [];
        try{ aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e){ aiSteps = []; }
        if(Array.isArray(aiSteps) && aiSteps.length>0) steps = aiSteps.slice(0,4);
        else steps = [
          'Reiniciar la aplicación donde ocurre el problema',
          'Probar en otro documento o programa para ver si persiste',
          'Reiniciar el equipo',
          'Comprobar actualizaciones del sistema'
        ];
      }

      const stepsAr = steps.map(s => s);
      const numbered = enumerateSteps(stepsAr);
      const intro = `Entiendo, ${session.userName || 'usuario'}. Probemos esto primero:`;
      const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
      const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;

      session.tests = session.tests || {};
      session.tests.basic = stepsAr;
      // inicializar tracking por pasos
      session.stepProgress = session.stepProgress || {};
      session.helpAttempts = session.helpAttempts || {};
      for (let i = 0; i < stepsAr.length; i++) {
        const idx = i+1;
        if (!session.stepProgress[idx]) session.stepProgress[idx] = 'pending';
        if (!session.helpAttempts[idx]) session.helpAttempts[idx] = 0;
      }
      session.stepsDone.push('basic_tests_shown');
      session.waEligible = false;
      session.lastHelpStep = null;
      session.stage = STATES.BASIC_TESTS;

      session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
      await saveSession(sid, session);

      const helpOptions = stepsAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
      const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
      return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr }));
    } else if (session.stage === STATES.BASIC_TESTS) {
      // interpret answers (very small logic)
      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
      const rxNo  = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
      const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico)$/i;
      // [STI-CHANGE] detectar petición "Volver a mostrar los pasos" desde la ayuda
      const rxShowSteps = /^\s*(volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)/i; // [STI-CHANGE]

      // [STI-CHANGE] Si el usuario pide volver a mostrar los pasos, reenviar la lista numerada de session.tests.basic
      if (rxShowSteps.test(t)) { // [STI-CHANGE]
        const stepsAr = Array.isArray(session.tests?.basic) ? session.tests.basic : []; // [STI-CHANGE]
        if (!stepsAr || stepsAr.length === 0) { // [STI-CHANGE]
          const msg = 'No tengo pasos guardados para mostrar. Primero describí el problema para que te ofrezca pasos.'; // [STI-CHANGE]
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() }); // [STI-CHANGE]
          await saveSession(sid, session); // [STI-CHANGE]
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] })); // [STI-CHANGE]
        } // [STI-CHANGE]

        const numbered = enumerateSteps(stepsAr); // [STI-CHANGE]
        const intro = `Volvemos a los pasos sugeridos:`; // [STI-CHANGE]
        const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:'; // [STI-CHANGE]
        const fullMsg = intro + '\n\n' + numbered.join('\n') + footer; // [STI-CHANGE]

        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() }); // [STI-CHANGE]
        await saveSession(sid, session); // [STI-CHANGE]

        const helpOptions = stepsAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`); // [STI-CHANGE]
        const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌']; // [STI-CHANGE]
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr })); // [STI-CHANGE]
      } // [STI-CHANGE]

      if (rxYes.test(t)){
        // [STI-CHANGE] respuesta de despedida al confirmar "Lo pude solucionar ✔️"
        reply = `¡Me alegro que lo hayas podido resolver! Si volvés a necesitar asistencia, estoy acá 24/7 para ayudarte.

Podés seguirnos en Instagram para tips y novedades: https://instagram.com/sti.rosario
Y visitar nuestra web para servicios y soporte: https://stia.com.ar 🚀

¡Que tengas un excelente día!`; // [STI-CHANGE]
        session.stage = STATES.ENDED;
        session.waEligible = false;
        options = [];
      } else if (rxNo.test(t)){
        reply = `💡 Entiendo. ¿Querés probar algunas soluciones extra o que te conecte con un técnico?\n\n1️⃣ Más pruebas\n2️⃣ Conectar con Técnico`;
        options = ['BTN_MORE_TESTS','BTN_CONNECT_TECH'];
        session.stage = STATES.ESCALATE;
      } else if (rxTech.test(t)) {
        // user requested connecting with technician — reuse helper
        return await createTicketAndRespond(session, sid, res); // [STI-CHANGE]
      } else {
        reply = `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o elegir 1/2.`;
        options = ['Lo pude solucionar ✔️','El problema persiste ❌'];
      }
    } else if (session.stage === STATES.ESCALATE){
      // if user typed option 1 or 2
      const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas)/i;
      const opt2 = /^\s*(?:2\b|2️⃣\b|dos|conectar con t[eé]cnico|conectar con tecnico)/i;
      if (opt1.test(t)){
        // User selected "Más pruebas" -> generate advanced tests and show them
        try {
          const device = session.device || '';
          let aiSteps = [];
          try { aiSteps = await aiQuickTests(session.problem || '', device || ''); } catch(e){ aiSteps = []; }
          // [STI-CHANGE-A] LIMITAR A 4 PASOS y guardar siempre en session.tests.advanced
          const limited = Array.isArray(aiSteps) ? aiSteps.slice(0,4) : [];
          session.tests = session.tests || {};
          session.tests.advanced = limited; // [STI-CHANGE-A]
          // Si no hay pasos avanzados, usar flujo de hablar con técnico
          if (!limited || limited.length === 0) {
            // no advanced suggestions -> escalate
            return await createTicketAndRespond(session, sid, res); // [STI-CHANGE-A]
          }

          // [STI-CHANGE-C] registro de progreso avanzado (pending)
          session.stepProgress = session.stepProgress || {};
          limited.forEach((_,i)=> session.stepProgress[`adv_${i+1}`] = 'pending');
          // [STI-CHANGE-C]

          // [STI-CHANGE-B] FORMATO VISUAL PREMIUM IGUAL A LOS BÁSICOS
          const numbered = enumerateSteps(limited);
          const whoLabel = session.userName ? cap(session.userName) : 'usuario';
          const intro = `Entiendo, ${whoLabel}. Probemos ahora con algunas pruebas más avanzadas:`;
          const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
          const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
          // [STI-CHANGE-B]

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
          return res.json(withOptions({ ok:false, reply, stage: session.stage, options: ['2️⃣ Conectar con Técnico'] }));
        }
      } else if (opt2.test(t)){
        // create ticket and return BTN_WHATSAPP UI button (same as earlier flow)
        return await createTicketAndRespond(session, sid, res); // [STI-CHANGE]
      } else {
        reply = 'Decime si querés 1 (Más pruebas) o 2 (Conectar con Técnico).';
        options = ['1️⃣ Más pruebas','2️⃣ Conectar con Técnico'];
      }
    } else if (session.stage === STATES.ADVANCED_TESTS) {
      // New handler for advanced tests responses (mirrors BASIC_TESTS but marks adv progress)
      const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
      const rxNo  = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
      const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico)$/i;
      const rxShowSteps = /^\s*(volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)/i;

      if (rxShowSteps.test(t)) {
        const stepsAr = Array.isArray(session.tests?.advanced) ? session.tests.advanced : [];
        if (!stepsAr || stepsAr.length === 0) {
          const msg = 'No tengo pasos avanzados guardados para mostrar. Primero pedí "Más pruebas".';
          session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:false, reply: msg, stage: session.stage, options: [] }));
        }
        const numbered = enumerateSteps(stepsAr);
        const whoLabel = session.userName ? cap(session.userName) : 'usuario';
        const intro = `Volvemos a las pruebas avanzadas, ${whoLabel}:`;
        const footer = '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
        const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
        session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
        await saveSession(sid, session);
        const helpOptions = stepsAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
        const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
        return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr }));
      }

      if (rxYes.test(t)){
        // [STI-CHANGE-C] marcar progreso avanzado si venimos de una ayuda (lastHelpStep)
        const idx = session.lastHelpStep;
        if (typeof idx === 'number' && idx >= 1) {
          session.stepProgress = session.stepProgress || {};
          session.stepProgress[`adv_${idx}`] = 'done';
          await saveSession(sid, session); // [STI-CHANGE-C]
        }
        // respuesta final
        reply = `¡Me alegro que lo hayas podido resolver! Si volvés a necesitar asistencia, estoy acá 24/7 para ayudarte.`;
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
        options = ['Lo pude solucionar ✔️','El problema persiste ❌','2️⃣ Conectar con Técnico'];
      }
    } else {
      reply = 'No estoy seguro cómo responder eso ahora. Podés reiniciar o escribir "Reformular Problema".';
      options = ['Reformular Problema'];
    }

    // save bot reply + transcript + append transcripts file
    session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      const userLine = `[${nowIso()}] USER: ${buttonToken ? '[BOTON] ' + buttonLabel : t}\n`;
      const botLine  = `[${nowIso()}] ASSISTANT: ${reply}\n`;
      fs.appendFile(tf, userLine, ()=>{});
      fs.appendFile(tf, botLine, ()=>{});
    } catch(e){ /* noop */ }

    const response = withOptions({ ok:true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;

    // if options are BTN_ tokens, add UI definitions so frontend (chatlog) can render the green button
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

    // small log broadcast
    try {
      const shortLog = `${sid} => reply len=${String(reply||'').length} options=${(options||[]).length}`;
      const entry = formatLog('INFO', shortLog);
      appendToLogFile(entry);
      broadcastLog(entry);
    } catch (e) { /* noop */ }

    return res.json(response);

  } catch(e){
    console.error('[api/chat] Error', e);
    return res.status(200).json(withOptions({ ok:true, reply: '😅 Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// list sessions
app.get('/api/sessions', async (_req,res)=>{
  const sessions = await listActiveSessions();
  res.json({ ok:true, count: sessions.length, sessions });
});

// utils
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

// start
const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=> {
  console.log(`STI Chat (stable) started on ${PORT}`);
  console.log('[Logs] SSE available at /api/logs/stream (use token param if SSE_TOKEN set)');
});