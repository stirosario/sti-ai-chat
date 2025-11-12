/**
 * server.js — STI Chat (OpenAI first-only filter) — fix: improved name extraction + ticket fixes from working version
 *
 * Integración mínima: se extrajo la lógica de generación de ticket probada desde la versión vieja
 * y se aplicó en server(actual).js. Se añadió soporte para el token BTN_WHATSAPP y mapeo
 * sin alterar el resto del flujo.
 *
 * Reemplazá tu server.js por este (hacé backup antes).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ===== Session store (external) =====
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== OpenAI (requerido como filtro) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ===== Paths / persistencia =====
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
}
const nowIso = () => new Date().toISOString();

// ===== Simple logging + SSE streaming for real-time logs =====
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
try { if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8'); } catch(e) { /* noop */ }

const sseClients = new Set(); // Set of res objects

function sseSend(res, eventData) {
  // Ensure each line is sent as data: ...
  const payload = String(eventData || '');
  const safe = payload.split(/\r?\n/).map(line => `data: ${line}`).join('\n') + '\n\n';
  try {
    res.write(safe);
  } catch (e) {
    // ignore
  }
}

function broadcastLog(entry) {
  for (const res of Array.from(sseClients)) {
    try {
      sseSend(res, entry);
    } catch (e) {
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
  }
}

function appendLogFile(entry) {
  try {
    fs.appendFileSync(LOG_FILE, entry + '\n', 'utf8');
  } catch (e) { /* noop */ }
}

function formatLog(level, ...parts) {
  const text = parts.map(p => {
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch(e) { return String(p); }
  }).join(' ');
  return `${new Date().toISOString()} [${level}] ${text}`;
}

// Wrap console.log/error to also write to our log file and broadcast over SSE
const _console_log = console.log.bind(console);
const _console_error = console.error.bind(console);

console.log = (...args) => {
  try { _console_log(...args); } catch {}
  try {
    const entry = formatLog('INFO', ...args);
    appendLogFile(entry);
    broadcastLog(entry);
  } catch (e) { /* noop */ }
};

console.error = (...args) => {
  try { _console_error(...args); } catch {}
  try {
    const entry = formatLog('ERROR', ...args);
    appendLogFile(entry);
    broadcastLog(entry);
  } catch (e) { /* noop */ }
};

// ===== EMBEDDED CONFIG (con botones actualizados) =====
const EMBEDDED_CHAT = {
  version: 'from-images-openai-first-filter-v8-fix-name',
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
      // agregado: botón/token para abrir WhatsApp con el ticket
      { token: 'BTN_WHATSAPP', label: 'Hablar con un Técnico', text: 'hablar con un tecnico' }
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

// ===== Chat state derived from EMBEDDED_CHAT =====
let CHAT = {};
let deviceMatchers = [];
let issueMatchers = [];

function loadChatFromEmbedded(){
  try {
    CHAT = EMBEDDED_CHAT || {};
    deviceMatchers = (CHAT?.nlp?.devices || []).map(d => {
      try { return { key: d.key, rx: new RegExp(d.rx, 'i') }; } catch(e){ return null; }
    }).filter(Boolean);
    issueMatchers  = (CHAT?.nlp?.issues  || []).map(i => {
      try { return { key: i.key, rx: new RegExp(i.rx, 'i') }; } catch(e){ return null; }
    }).filter(Boolean);
    console.log('[chat] cargado desde EMBEDDED_CHAT', CHAT.version || '(sin version)');
  } catch (e) {
    CHAT = {}; deviceMatchers = []; issueMatchers = [];
    console.log('[chat] no se cargó EMBEDDED_CHAT (ver variable)');
  }
}
loadChatFromEmbedded();

// ===== Helpers simples =====
function detectDevice(txt = '') { for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key; return null; }
function detectIssue (txt = '') { for (const i of issueMatchers)  if (i.rx.test(txt)) return i.key; return null; }
const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';

const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function emojiForIndex(i){ const n = i+1; return NUM_EMOJIS[n] || `${n}.`; }
function enumerateSteps(arr){ if(!Array.isArray(arr)) return []; return arr.map((s,i)=>`${emojiForIndex(i)} ${s}`); }

const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;
function isValidName(text){
  if(!text) return false;
  const t = String(text).trim();
  if(TECH_WORDS.test(t)) return false;
  return /^[a-záéíóúñ]{2,20}$/i.test(t); // accept 2+ letters
}
function extractName(text){
  if(!text) return null;
  const t = String(text).trim();
  // phrases: "soy X", "me llamo X", "mi nombre es X"
  let m = t.match(/^(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{2,20})$/i);
  if(m) return m[1];
  // single-word name
  if(isValidName(t)) return t;
  return null;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = obj => ({ options: [], ...obj });

// ===== OpenAI helpers (analyzeProblemWithOA used as FIRST filter) =====
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

// ===== App =====
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

// ===== States =====
const STATES = {
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  ASK_DEVICE: 'ask_device',
  BASIC_TESTS: 'basic_tests',
  BASIC_TESTS_AI: 'basic_tests_ai',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
  ENDED: 'ended'
};

// Normaliza sessionId
function getSessionId(req){
  const h = (req.headers['x-session-id']||'').toString().trim();
  const b = (req.body && (req.body.sessionId||req.body.sid)) ? String(req.body.sessionId||req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId||req.query.sid)) ? String(req.query.sessionId||req.query.sid).trim() : '';
  return h || b || q || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req,_res,next)=>{ req.sessionId = getSessionId(req); next(); });

// ===== Endpoints =====

// Health
app.get('/api/health', (_req,res) => {
  res.json({ ok: true, hasOpenAI: !!process.env.OPENAI_API_KEY, openaiModel: OPENAI_MODEL, version: CHAT?.version || 'embedded' });
});

// Reload config
app.post('/api/reload', (_req,res)=>{ try{ loadChatFromEmbedded(); res.json({ ok:true, version: CHAT.version||null }); } catch(e){ res.status(500).json({ ok:false, error: e.message }); } });

// Transcript plain
app.get('/api/transcript/:sid', (req,res)=>{
  const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if(!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type','text/plain; charset=utf-8');
  res.send(fs.readFileSync(file,'utf8'));
});

// ===== Logs endpoints =====
// SSE stream for real-time logs and simple polling mode (mode=once)
app.get('/api/logs/stream', (req, res) => {
  try {
    // optional token protection (same as chatlog.php usage)
    const SSE_TOKEN = process.env.SSE_TOKEN || '';
    if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) {
      return res.status(401).send('unauthorized');
    }

    // If polling mode requested, return the whole log as plain text
    if (String(req.query.mode || '') === 'once') {
      if (!fs.existsSync(LOG_FILE)) return res.status(200).send('');
      res.set('Content-Type', 'text/plain; charset=utf-8');
      const txt = fs.readFileSync(LOG_FILE, 'utf8');
      return res.status(200).send(txt);
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    // Send a first comment
    res.write(': connected\n\n');

    // Optionally send last N lines on connect
    try {
      const LAST_BYTES = 32 * 1024; // last 32KB
      if (fs.existsSync(LOG_FILE)) {
        const stat = fs.statSync(LOG_FILE);
        const start = Math.max(0, stat.size - LAST_BYTES);
        const fd = fs.openSync(LOG_FILE, 'r');
        const buf = Buffer.alloc(stat.size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.closeSync(fd);
        const content = buf.toString('utf8');
        sseSend(res, content);
      }
    } catch (e) {
      // ignore
    }

    // Keep the response open
    sseClients.add(res);
    console.log('[logs] cliente SSE conectado. total=', sseClients.size);

    req.on('close', () => {
      sseClients.delete(res);
      console.log('[logs] cliente SSE desconectado. total=', sseClients.size);
    });
  } catch (e) {
    console.error('[logs/stream] Error', e);
    res.status(500).end();
  }
});

// Also provide simple download/view for a ticket (existing routes use /ticket/:tid and /api/ticket/:tid)
// Provide a small endpoint to retrieve server log
app.get('/api/logs', (req, res) => {
  const SSE_TOKEN = process.env.SSE_TOKEN || '';
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

// WhatsApp ticket generator (API)
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

    const apiPublicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/api/ticket/${ticketId}`;
    const publicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/ticket/${ticketId}`;

    let waText = CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:';
    waText = `${titleLine}\n${waText}\n\nGenerado: ${generatedLabel}\n`;
    if(name) waText += `Cliente: ${name}\n`;
    if(device) waText += `Equipo: ${device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;

    const waNumberRaw = process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422';
    const waNumber = String(waNumberRaw).replace(/\D+/g, '');
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
    res.json({ ok:true, ticketId, publicUrl, apiPublicUrl, waUrl });
  } catch(e){ console.error('[whatsapp-ticket]', e); res.status(500).json({ ok:false, error: e.message }); }
});

// Rutas públicas para tickets (API + vista) — extraídas de la versión vieja para que publicUrl funcione
app.get('/api/ticket/:tid', (req, res) => {
  const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error: 'not_found' });
  res.json({ ok:true, ticketId: tid, content: fs.readFileSync(file,'utf8') });
});

app.get('/ticket/:tid', (req, res) => {
  const tid = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('ticket no encontrado');
  res.set('Content-Type','text/plain; charset=utf-8');
  res.send(fs.readFileSync(file,'utf8'));
});

// Reset session
app.post('/api/reset', async (req,res)=>{
  const sid = req.sessionId;
  const empty = { id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null, tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null };
  await saveSession(sid, empty);
  res.json({ ok:true });
});

// Greeting (start)
app.all('/api/greeting', async (req,res)=>{
  try{
    const sid = req.sessionId;
    const fresh = { id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null, tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null };
    const text = CHAT?.messages_v4?.greeting?.name_request || '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
    fresh.transcript.push({ who:'bot', text, ts: nowIso() });
    await saveSession(sid, fresh);
    return res.json({ ok:true, greeting:text, reply:text, options: [] });
  } catch(e){ console.error(e); return res.json({ ok:true, greeting:'👋 Hola', reply:'👋 Hola', options:[] }); }
});

// ===== Core chat endpoint =====
app.post('/api/chat', async (req,res)=>{
  try{
    const body = req.body || {};
    // token map from embedded buttons
    const tokenMap = {};
    if(Array.isArray(CHAT?.ui?.buttons)){
      for(const b of CHAT.ui.buttons) if(b.token) tokenMap[b.token] = b.text || '';
    } else {
      Object.assign(tokenMap, {
        'BTN_HELP_1': 'ayuda paso 1',
        'BTN_HELP_2': 'ayuda paso 2',
        'BTN_HELP_3': 'ayuda paso 3',
        'BTN_HELP_4': 'ayuda paso 4',
        'BTN_SOLVED': 'lo pude solucionar',
        'BTN_PERSIST': 'el problema persiste',
        'BTN_REPHRASE': 'reformular problema',
        'BTN_CLOSE': 'cerrar chat',
        'BTN_WHATSAPP': 'hablar con un tecnico'
      });
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
      session = { id: sid, userName: null, stage: STATES.ASK_NAME, device:null, problem:null, issueKey:null, tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null };
      console.log('[api/chat] nueva session', sid);
    }

    // If the frontend sent the BTN_WHATSAPP token, handle immediately (create ticket + waUrl)
    if (buttonToken === 'BTN_WHATSAPP') {
      try {
        // Create ticket using current session
        // (reusing working logic from older server)
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
        for(const m of session.transcript || []){ lines.push(`[${m.ts||now.toISOString()}] ${m.who||'user'}: ${m.text||''}`); }
        try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){ /* noop */ }
        const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
        fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

        const publicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/ticket/${ticketId}`;
        const apiPublicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/api/ticket/${ticketId}`;

        let waText = `${titleLine}\n${CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:'}\n\nGenerado: ${generatedLabel}\n`;
        if(session.userName) waText += `Cliente: ${session.userName}\n`;
        if(session.device) waText += `Equipo: ${session.device}\n`;
        waText += `\nTicket: ${ticketId}\nDetalle: ${apiPublicUrl}`;

        const waNumberRaw = process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422';
        const waNumber = String(waNumberRaw).replace(/\D+/g, '');
        const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

        const whoName = session.userName ? cap(session.userName) : 'usuario';
        const replyTech = `🤖 Muy bien, ${whoName}.\nEstoy preparando tu ticket de asistencia 🧠\nSolo tocá el botón verde de WhatsApp, enviá el mensaje tal como está 💬\n🔧 En breve uno de nuestros técnicos tomará tu caso.`;

        session.transcript.push({ who:'bot', text: replyTech, ts: nowIso() });
        session.waEligible = true;
        session.stage = STATES.ESCALATE;
        await saveSession(sid, session);

        return res.json(withOptions({ ok:true, reply: replyTech, stage: session.stage, options: ['Hablar con un Técnico'], waUrl, ticketId, publicUrl, apiPublicUrl, openUrl: waUrl }));
      } catch (errBtn) {
        console.error('[BTN_WHATSAPP]', errBtn);
        session.transcript.push({ who:'bot', text: '❗ No pude preparar el ticket ahora. Probá de nuevo en un momento.', ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:false, reply: '❗ No pude preparar el ticket ahora. Probá de nuevo en un momento.', stage: session.stage, options: ['Generar ticket'] }));
      }
    }

    // save user message in transcript
    if(buttonToken){
      session.transcript.push({ who:'user', text: `[BOTON] ${buttonLabel} (${buttonToken})`, ts: nowIso() });
    } else {
      session.transcript.push({ who:'user', text: t, ts: nowIso() });
    }

    // === Manejo: Reformular problema (botón/text) ===
if (/^\s*reformular\s*problema\s*$/i.test(t)) {
  // Usar el nombre si existe, con capitalización
  const whoName = session.userName ? cap(session.userName) : 'usuario';

  const reply = `¡Intentemos nuevamente, ${whoName}! 👍
  
¿Qué problema estás teniendo?`;

  // Dejamos la sesión en ASK_PROBLEM para que el usuario reescriba
  session.stage = STATES.ASK_PROBLEM;

  // Limpiamos datos previos del problema (opcional, mantener nombre)
  session.problem = null;
  session.issueKey = null;
  session.tests = { basic: [], ai: [], advanced: [] };
  session.lastHelpStep = null;

  session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
  await saveSession(sid, session);

  return res.json(withOptions({
    ok: true,
    reply,
    stage: session.stage,
    options: []
  }));
}
// === fin Manejo Reformular problema ===


    // Use robust extractName() so plain names like "walter" / "lucas" are captured
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

    // intercept help buttons "ayuda paso N"
  // intercept help buttons "ayuda paso N"
const helpMatch = String(t || '').match(/\bayuda\b(?:\s*(?:paso)?\s*)?(\d+)/i);
if (helpMatch) {
  const idx = Math.max(1, Number(helpMatch[1] || 1));
  const srcType = (Array.isArray(session.tests.basic) && session.tests.basic.length > 0)
    ? 'basic'
    : (Array.isArray(session.tests.ai) && session.tests.ai.length > 0) ? 'ai' : null;

  if (srcType) {
    // obtener el texto del paso correspondiente
    const list = session.tests[srcType] || [];
    const stepText = list[idx - 1] || null;

    // marcar que venimos de una ayuda puntual
    session.lastHelpStep = { type: srcType, index: idx };

    // generar contenido de ayuda (puede venir de OpenAI)
    const helpContent = await getHelpForStep(stepText, idx, session.device || '', session.problem || '');

    // nombre para el saludo
    const whoName = session.userName ? cap(session.userName) : 'usuario';

    // construir reply (variable local helpReply para evitar colisiones)
    const helpReply = `Ayuda para realizar el paso ${idx}:\n\n${helpContent}\n\n🦶 Luego de realizar este paso... ¿cómo te fue, ${whoName}? ❔`;

    // guardar y devolver sólo las tres opciones solicitadas
    session.transcript.push({ who: 'bot', text: helpReply, ts: nowIso() });
    await saveSession(sid, session);

    const replyOptions = ['Lo pude solucionar ✔️', 'El problema persiste ❌', 'Cerrar Chat 🔒'];
    return res.json(withOptions({ ok: true, reply: helpReply, stage: session.stage, options: replyOptions }));
  } else {
    const reply = 'No tengo los pasos guardados para ese número. Primero te doy los pasos básicos, después puedo explicar cada uno.';
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
  }
}
  // === fin Ayuda paso a paso ===

    // main state logic
    let reply = ''; let options = [];

    // 1) ASK_NAME
    if(session.stage === STATES.ASK_NAME){
      if(!session.userName){
        reply = CHAT?.messages_v4?.greeting?.name_request || '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
      } else {
        session.stage = STATES.ASK_PROBLEM;
        reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
      }
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json({ ok:true, reply, stage: session.stage, options });
    }

    // 2) ASK_PROBLEM -> OPENAI as FIRST and ONLY FILTER
    else if(session.stage === STATES.ASK_PROBLEM){
      session.problem = t || session.problem;

      if(!openai){
        const fallbackMsg = 'OpenAI no está configurado. No puedo aplicar el filtro solicitado. Configure OPENAI_API_KEY.';
        session.transcript.push({ who:'bot', text: fallbackMsg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:false, reply: fallbackMsg, stage: session.stage, options: [] }));
      }

      const ai = await analyzeProblemWithOA(session.problem || '');
      const isIT = !!ai.isIT && (ai.confidence >= OA_MIN_CONF);

      if(!isIT){
        const replyNotIT = 'Disculpa, no entendi tu problema, o no esta relacionado con el rubro informatico.';
        session.transcript.push({ who:'bot', text: replyNotIT, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: replyNotIT, stage: session.stage, options: ['Reformular problema'] }));
      }

      if(ai.device) session.device = session.device || ai.device;
      if(ai.issueKey) session.issueKey = session.issueKey || ai.issueKey;

      try{
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

        // 529..551 Reemplazar por este bloque:
  // 530..569: construir mensaje sin mostrar la lista de "Ayuda paso N" como texto
  const stepsAr = steps.map(s => s);
  const numbered = enumerateSteps(stepsAr);
  const intro = `Entiendo, ${session.userName || 'usuario'}. Probemos esto primero:`;

  // Preparar las opciones de ayuda (se usarán como botones, no como texto)
  const helpOptions = stepsAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);

  // Construir el mensaje con las secciones en el orden solicitado,
  const footerTop = [
    '',
    '🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.',
    ''
  ].join('\n');

  const footerBottom = [
    '',
    '🤔 Contanos cómo te fue utilizando los botones:'
  ].join('\n');

  const fullMsg = intro + '\n\n' + numbered.join('\n') + '\n\n' + footerTop + '\n' + footerBottom;

  // Guardar estado/transcript como antes
  session.tests.basic = stepsAr;
  session.stepsDone.push('basic_tests_shown');
  session.waEligible = false;
  session.lastHelpStep = null;
  session.stage = STATES.BASIC_TESTS;

  session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
  await saveSession(sid, session);

  // En options devolvemos las opciones de ayuda (botones) y luego los botones finales
  const optionsResp = [...helpOptions, 'Lo pude solucionar ✔️', 'El problema persiste ❌'];
  return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: stepsAr }));


      } catch(err){
        console.error('diagnóstico ASK_PROBLEM', err);
        return res.json(withOptions({ ok:true, reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo.' }));
      }
    }

    // 3) ASK_DEVICE
    else if(session.stage === STATES.ASK_DEVICE || !session.device){
      const msg = `Perfecto. Anoté: “${session.problem || ''}”.\n\n¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
      session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: msg, stage: session.stage, options: ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'] }));
    }

  // 4) BASIC_TESTS / follow-ups
  else {
    const rxYes = /^\s*(s|si|sí|si,|sí,|lo pude solucion|lo pude solucionar|lo pude solucionar ✔️)/i;
    const rxNo  = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;

    if(session.lastHelpStep){
      if (rxYes.test(t)) {
        const whoName = session.userName ? cap(session.userName) : 'usuario';
        const replyYes = `🤖 ¡Excelente trabajo, ${whoName}!\nEl sistema confirma que la misión fue un éxito 💫\nNos seguimos viendo en Instagram @sti.rosario o en 🌐 stia.com.ar ⚡`;
        session.stage = STATES.ENDED;
        session.lastHelpStep = null;
        session.transcript.push({ who: 'bot', text: replyYes, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok: true, reply: replyYes, stage: session.stage, options: [] }));
      } else if(rxNo.test(t)){
        const src = session.lastHelpStep.type;
        const list = (session.tests[src] && session.tests[src].length) ? session.tests[src] : session.tests.basic;
        const numbered = enumerateSteps(list || []);
        reply = `Entiendo. Volvamos a los pasos que te ofrecí:\n\n` + numbered.join('\n') + `\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n\n🤔 Contanos cómo te fue utilizando los botones:`;
        const helpOptions = (list||[]).map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
        options = [...helpOptions,'Lo pude solucionar ✔️','El problema persiste ❌'];
        session.lastHelpStep = null;
        session.waEligible = false;
      } else {
        reply = '¿Lo pudiste solucionar? (Lo pude solucionar ✔️ / El problema persiste ❌)';
        options = ['Lo pude solucionar ✔️','El problema persiste ❌'];
      }
    } else {
      // rama sin lastHelpStep (aquí aplicamos los cambios solicitados)
      if (rxYes.test(t)) {
        const whoName = session.userName ? cap(session.userName) : 'usuario';
        const replyYes = `🤖 ¡Excelente trabajo, ${whoName}!\nEl sistema confirma que la misión fue un éxito 💫\nNos seguimos viendo en Instagram @sti.rosario o en 🌐 stia.com.ar ⚡`;
        reply = replyYes;
        options = [];
        session.stage = STATES.ENDED;
        session.waEligible = false;
        // el guardado y el envío se hacen más abajo (flujo normal)
      } else if (rxNo.test(t)) {
        const whoName = session.userName ? cap(session.userName) : 'usuario';
        reply = `💡 Entiendo, ${whoName} 😉\n¿Querés probar algunas soluciones extra 🔍 o que te conecte con un 🧑‍💻 técnico de STI?\n\n1️⃣ 🔍 Más pruebas\n\n2️⃣ 🧑‍💻 Conectar con Técnico`;
        options = ['1️⃣ 🔍 Más pruebas', '2️⃣ 🧑‍💻 Conectar con Técnico'];
        // NO mostramos el botón verde desde este punto
        session.stage = STATES.ESCALATE;
        session.waEligible = false;
      } else {
        // detectar selección explícita de opción 1 o 2 (por texto, número o emoji)
        const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas|1️⃣\s*🔍)/i;
        const opt2 = /^\s*(?:2\b|2️⃣\b|dos|conectar con t[eé]cnico|conectar con tecnico|2️⃣\s*🧑‍💻)/i;

        if (opt1.test(t)) {
          const reply1 = 'Seleccionaste opcion 1';
          // guardar y responder inmediatamente
          session.transcript.push({ who: 'bot', text: reply1, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok: true, reply: reply1, stage: session.stage, options: [] }));
        } else if (opt2.test(t)) {
          // (Reemplazado) Cuando el usuario elige la opción 2: creamos el ticket con la lógica probada
          const whoName = session.userName ? cap(session.userName) : 'usuario';
          const replyTech = `🤖 Muy bien, ${whoName}.\nEstoy preparando tu ticket de asistencia 🧠\nSolo tocá el botón verde de WhatsApp, enviá el mensaje tal como está 💬\n🔧 En breve uno de nuestros técnicos tomará tu caso.`;

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
            for(const m of session.transcript || []){ lines.push(`[${m.ts||now.toISOString()}] ${m.who||'user'}: ${m.text||''}`); }

            try { fs.mkdirSync(TICKETS_DIR, { recursive: true }); } catch(e){ /* noop */ }
            const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
            fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

            const publicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/ticket/${ticketId}`;
            const apiPublicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/api/ticket/${ticketId}`;
            let waText = `${titleLine}\n${CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:'}\n\nGenerado: ${generatedLabel}\n`;
            if(session.userName) waText += `Cliente: ${session.userName}\n`;
            if(session.device) waText += `Equipo: ${session.device}\n`;
            waText += `\nTicket: ${ticketId}\nDetalle: ${apiPublicUrl}`;

            const waNumberRaw = process.env.WHATSAPP_NUMBER || WHATSAPP_NUMBER || '5493417422422';
            const waNumber = String(waNumberRaw).replace(/\D+/g, '');
            const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

            // Guardamos la respuesta en transcript y session
            session.transcript.push({ who: 'bot', text: replyTech, ts: nowIso() });
            await saveSession(sid, session);

            // Preparamos la respuesta con el botón verde (el frontend debe abrir waUrl)
            reply = replyTech;
            options = ['Hablar con un Técnico'];
            session.waEligible = true;
            session.stage = STATES.ESCALATE;

            return res.json(withOptions({ ok:true, reply, stage: session.stage, options, waUrl, ticketId, publicUrl, apiPublicUrl }));
          } catch (errTick) {
            console.error('[create-ticket]', errTick);
            session.waEligible = false;
            reply = '❗ Ocurrió un problema al preparar el ticket. ¿Querés que intente generar uno de nuevo?';
            options = ['Generar ticket','Volver'];
            session.stage = STATES.ESCALATE;
            await saveSession(sid, session);
            return res.json(withOptions({ ok:false, reply, stage: session.stage, options }));
          }
        }
        // si no coincide con opt1/opt2, caemos en las comprobaciones generales más abajo
      }
    }
  }

  // Guardar respuesta y transcript
  session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
  await saveSession(sid, session);
  try {
    const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
    const userLine = `[${nowIso()}] USER: ${buttonToken ? '[BOTON] ' + buttonLabel : t}\n`;
    const botLine  = `[${nowIso()}] ASSISTANT: ${reply}\n`;
    fs.appendFileSync(tf, userLine);
    fs.appendFileSync(tf, botLine);
  } catch(e){ /* noop */ }

  const response = withOptions({ ok:true, reply, sid, stage: session.stage });
  if(options && options.length) response.options = options;
  if(session.waEligible) response.allowWhatsapp = true;
  if(CHAT?.ui) response.ui = CHAT.ui;
  return res.json(response);

  } catch(e){
    console.error('[api/chat] Error', e);
    return res.status(200).json(withOptions({ ok:true, reply: '😅 Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// List active sessions
app.get('/api/sessions', async (_req,res)=>{
  const sessions = await listActiveSessions();
  res.json({ ok:true, count: sessions.length, sessions });
});

// ===== utils =====
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

// ===== start server =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=> {
  console.log(`STI Chat (OpenAI first-only filter) started on ${PORT}`);
});