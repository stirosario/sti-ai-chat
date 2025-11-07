/**
 * server.js — STI Chat (configuración EMBEDDED según las imágenes, ahora generalizado)
 *
 * Cambios claves en esta versión:
 * - El flujo ya no está limitado a "mi pc no enciende".
 * - Se agregó la función isITRelated() para decidir si el problema
 *   es del rubro informático. Si NO lo es, el bot responde:
 *     "Disculpa, no entendi tu problema, o no esta relacionado con el rubro informatico."
 *   y da opciones para reformular o cerrar el chat.
 * - Si el problema PARECE informático, continúa el flujo habitual:
 *   detección de device/issue, sugerir pasos básicos/AI, ayuda por paso, escalado, etc.
 *
 * Mantengo el resto de la lógica original (sessions, OpenAI opcional, generación de ticket).
 * Reemplazá tu server.js por este (hacé backup antes).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ===== OpenAI (opcional) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ===== Paths / persistencia =====
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Ensure directories exist
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
}
const nowIso = () => new Date().toISOString();

// ===== CONFIGURACIÓN EMBEDDED (según lo observado en las imágenes) =====
const EMBEDDED_CHAT = {
  version: 'from-images-v2-general',
  messages_v4: {
    greeting: {
      name_request: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?'
    }
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
      { token: 'BTN_SOLVED', label: 'Lo pude solucionar', text: 'sí' },
      { token: 'BTN_PERSIST', label: 'El problema persiste', text: 'no' },
      { token: 'BTN_CLOSE_CHAT', label: 'Cerrar chat', text: 'cerrar chat' }
    ],
    states: {
      greeting_name_request: {
        reply: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?',
        options: []
      }
    }
  },
  nlp: {
    devices: [
      { key: 'pc', rx: '\\b(pc|computadora|ordenador)\\b' },
      { key: 'notebook', rx: '\\b(notebook|laptop)\\b' },
      { key: 'impresora', rx: '\\b(impresora)\\b' },
      { key: 'router', rx: '\\b(router|modem)\\b' }
    ],
    // Ejemplos de issues; podés extenderlos según tu Excel
    issues: [
      { key: 'no_prende', rx: '\\b(no\\s*enciende|no\\s*prende|no\\s*arranca|mi\\s*pc\\s*no\\s*enciende)\\b', label: 'no enciende' },
      { key: 'sin_internet', rx: '\\b(sin\\s*internet|no\\s*hay\\s*internet|wifi\\s*caido)\\b', label: 'sin conexión' },
      { key: 'lentitud', rx: '\\b(lento|lentitud|se\\s*traba|se\\s*cuelga)\\b', label: 'lentitud / cuelgues' }
    ],
    advanced_steps: {
      no_prende: [
        'Verificá que el cable de alimentación esté correctamente conectado a la computadora y a la toma de corriente.',
        'Asegurate de que el interruptor de la fuente de alimentación (si tiene) esté encendido.',
        'Intentá presionar el botón de encendido durante unos segundos para ver si responde.',
        'Desconectá todos los dispositivos externos (USB, impresoras, etc.) y volvé a intentar encender la PC.'
      ],
      sin_internet: [
        'Reiniciá el router y el equipo.',
        'Comprobá que el Wi‑Fi esté activado en el equipo.',
        'Probá conectar con cable ethernet.',
        'Verificá la configuración de red y la IP asignada.'
      ],
      lentitud: [
        'Cerrá aplicaciones innecesarias y reiniciá el equipo.',
        'Comprobá el uso de CPU y memoria en el administrador de tareas.',
        'Analizá si hay actualizaciones pendientes o procesos en segundo plano que consumen recursos.',
        'Escaneá el sistema con antivirus o herramienta de diagnóstico.'
      ]
    },
    issue_labels: {
      no_prende: 'no enciende',
      sin_internet: 'sin conexión',
      lentitud: 'lentitud / cuelgues'
    }
  }
};
// ===== FIN EMBEDDED CONFIG =====

/* ===== Chat state derived from EMBEDDED_CHAT ===== */
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

// Palabras técnicas/básicas para detectar ámbito informático
const TECH_KEYWORDS = new RegExp([
  '\\b(pc|computadora|ordenador|notebook|laptop|monitor|pantalla|teclado|mouse|impresora|router|modem|wifi|internet|red|servidor|email|correo|sistema|windows|linux|mac|driver|controlador|actualizaci[oó]n|instalaci[oó]n|error|pantalla azul|bsod|reinici|arranc|enciend|cuelg|largas|lentitud|virus|malware)\\b'
].join('|'), 'i');

const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;
function isValidName(text){
  if(!text) return false;
  const t = String(text).trim();
  if(TECH_WORDS.test(t)) return false;
  return /^[a-záéíóúñ]{3,20}$/i.test(t);
}
function extractName(text){
  if(!text) return null;
  const t = String(text).trim();
  const m = t.match(/^(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{3,20})$/i);
  if(m) return m[1];
  if(isValidName(t)) return t;
  return null;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = obj => ({ options: [], ...obj });

// ===== Nueva función: decidir si el texto está relacionado con IT =====
function isITRelated(text = ''){
  if(!text) return false;
  const t = String(text).trim();
  if(detectDevice(t)) return true;
  if(detectIssue(t)) return true;
  if(TECH_KEYWORDS.test(t)) return true;
  // si es muy corto y no coincide con tecnicismos, consideramos no IT
  if(t.length < 6) return false;
  // fallback: si contiene alguna palabra común de problema y no contiene palabras claramente no-tecnicas,
  // asumimos que puede ser IT para permitir que el flujo siga (evitamos rechazar en falso positivo).
  return false;
}

// ===== Session store (external) =====
// Implementá getSession/saveSession/listActiveSessions en sessionStore.js
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== Config OA =====
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF || Number(CHAT?.settings?.OA_MIN_CONF || 0.6));

// ===== OpenAI helpers =====
async function analyzeProblemWithOA(problemText = ''){
  if(!openai) return { device: null, issueKey: null, confidence: 0 };
  const prompt = [
    "Sos técnico informático argentino, claro y profesional.",
    "Detectá: device (equipo), issueKey (tipo de problema) y confidence (0..1).",
    "Respondé SOLO un JSON con {device, issueKey, confidence}.",
    `Texto: "${problemText}"`
  ].join('\n');
  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g,'');
    const obj = JSON.parse(raw);
    return { device: obj.device||null, issueKey: obj.issueKey||null, confidence: Math.max(0,Math.min(1,Number(obj.confidence||0))) };
  } catch (e) {
    console.error('[analyzeProblemWithOA]', e.message);
    return { device: null, issueKey: null, confidence: 0 };
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
  res.json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openaiModel: OPENAI_MODEL,
    version: CHAT?.version || 'embedded'
  });
});

// Reload chat config (relee EMBEDDED_CHAT en memoria)
app.post('/api/reload', (_req,res)=>{ try{ loadChatFromEmbedded(); res.json({ ok:true, version: CHAT.version||null }); } catch(e){ res.status(500).json({ ok:false, error: e.message }); } });

// Transcript plain
app.get('/api/transcript/:sid', (req,res)=>{
  const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if(!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type','text/plain; charset=utf-8');
  res.send(fs.readFileSync(file,'utf8'));
});

// WhatsApp ticket generator (keeps compatibility)
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
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');
    const apiPublicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/api/ticket/${ticketId}`;
    const publicUrl = `${PUBLIC_BASE_URL.replace(/\/$/,'')}/ticket/${ticketId}`;
    let waText = CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI. Vengo del chat web. Dejo mi consulta:';
    waText = `${titleLine}\n${waText}\n\nGenerado: ${generatedLabel}\n`;
    if(name) waText += `Cliente: ${name}\n`;
    if(device) waText += `Equipo: ${device}\n`;
    waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;
    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
    res.json({ ok:true, ticketId, publicUrl, apiPublicUrl, waUrl });
  } catch(e){ console.error('[whatsapp-ticket]', e); res.status(500).json({ ok:false, error: e.message }); }
});

// Reset session
app.post('/api/reset', async (req,res)=>{
  const sid = req.sessionId;
  const empty = {
    id: sid, userName: null, stage: STATES.ASK_NAME,
    device:null, problem:null, issueKey:null,
    tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0,
    waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null
  };
  await saveSession(sid, empty);
  res.json({ ok:true });
});

// Greeting (start)
app.all('/api/greeting', async (req,res)=>{
  try{
    const sid = req.sessionId;
    const fresh = {
      id: sid, userName: null, stage: STATES.ASK_NAME,
      device:null, problem:null, issueKey:null,
      tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0,
      waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null
    };
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
    // Mapa tokens -> texto (ahora cargado desde CHAT.ui.buttons)
    const tokenMap = {};
    if(Array.isArray(CHAT?.ui?.buttons)){
      for(const b of CHAT.ui.buttons) if(b.token) tokenMap[b.token] = b.text || '';
    } else {
      Object.assign(tokenMap, {
        'BTN_HELP_1': 'ayuda paso 1',
        'BTN_HELP_2': 'ayuda paso 2',
        'BTN_HELP_3': 'ayuda paso 3',
        'BTN_HELP_4': 'ayuda paso 4',
        'BTN_YES': 'sí',
        'BTN_NO' : 'no',
        'BTN_CLOSE_CHAT': 'cerrar chat',
        'BTN_DEVICE_PC': 'pc',
        'BTN_DEVICE_NOTEBOOK': 'notebook',
        'BTN_OTHER': ''
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
      session = {
        id: sid, userName: null, stage: STATES.ASK_NAME,
        device:null, problem:null, issueKey:null,
        tests:{ basic:[], ai:[], advanced:[] }, stepsDone:[], fallbackCount:0,
        waEligible:false, transcript:[], pendingUtterance:null, lastHelpStep:null
      };
      console.log('[api/chat] nueva session', sid);
    }

    // Registrar entrada en transcript (si viene de botón lo marcamos)
    if(buttonToken){
      session.transcript.push({ who:'user', text: `[BOTON] ${buttonLabel} (${buttonToken})`, ts: nowIso() });
    } else {
      session.transcript.push({ who:'user', text: t, ts: nowIso() });
    }

    // Extraer nombre si el usuario lo envió
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

    // Manejo de "cerrar chat" directo
    if(/^\s*(cerrar(?:\s+chat)?|cerrar-chat)\s*$/i.test(t)){
      const replyc = 'Cerrando chat. ¡Hasta luego! 👋';
      session.stage = STATES.ENDED;
      session.transcript.push({ who:'bot', text: replyc, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: replyc, stage: session.stage, options: [] }));
    }

    // Interceptar "ayuda paso N"
    const helpMatch = String(t||'').match(/\bayuda\b(?:\s*(?:paso)?\s*)?(\d+)/i);
    if(helpMatch){
      const idx = Math.max(1, Number(helpMatch[1]||1));
      const sourceType = (Array.isArray(session.tests.basic) && session.tests.basic.length>0) ? 'basic' :
                         (Array.isArray(session.tests.ai) && session.tests.ai.length>0) ? 'ai' : null;
      if(sourceType){
        const list = session.tests[sourceType] || [];
        const stepText = list[idx-1] || null;
        session.lastHelpStep = { type: sourceType, index: idx };
        const helpContent = await getHelpForStep(stepText, idx, session.device||'', session.problem||'');
        const reply = `Ayuda para realizar el paso ${idx}:\n\n${helpContent}\n\n¿Lo pudiste solucionar?`;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        const options = ['Lo pude solucionar','El problema persiste','Cerrar chat'];
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options }));
      } else {
        const reply = 'No tengo los pasos guardados para ese número. Primero te doy los pasos básicos, después puedo explicar cada uno.';
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage, options: [] }));
      }
    }

    // Flujos por estado
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

    // 2) ASK_PROBLEM
    else if(session.stage === STATES.ASK_PROBLEM){
      session.problem = t || session.problem;

      // Nuevo: si el usuario describe algo que NO parece del rubro informático,
      // devolvemos el mensaje solicitado y no avanzamos en detecciones.
      if(!isITRelated(session.problem)){
        const replyNotIT = 'Disculpa, no entendi tu problema, o no esta relacionado con el rubro informatico.';
        session.transcript.push({ who:'bot', text: replyNotIT, ts: nowIso() });
        // dejamos la sesión en ASK_PROBLEM para que el usuario pueda reformular
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: replyNotIT, stage: session.stage, options: ['Reformular problema','Cerrar chat'] }));
      }

      try{
        let device = detectDevice(session.problem);
        let issueKey = detectIssue(session.problem);
        let confidence = issueKey ? 0.6 : 0;
        if(openai){
          const ai = await analyzeProblemWithOA(session.problem);
          if((ai.confidence||0) >= confidence){
            device = ai.device || device;
            issueKey = ai.issueKey || issueKey;
            confidence = ai.confidence || confidence;
          }
        }
        const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length>0);
        if(confidence >= OA_MIN_CONF && (device || hasConfiguredSteps)){
          session.device = session.device || device || 'equipo';
          session.issueKey = issueKey || session.issueKey || null;
          session.stage = STATES.BASIC_TESTS;
          const stepsSrc = session.issueKey ? (CHAT?.nlp?.advanced_steps?.[session.issueKey] || null) : null;
          let steps;
          if(Array.isArray(stepsSrc) && stepsSrc.length>0) steps = stepsSrc.slice(0,4);
          else {
            let aiSteps = [];
            try{ aiSteps = await aiQuickTests(session.problem||'', session.device||''); }catch(e){}
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
          const footer = [
            '',
            '🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.',
            '',
            '🤔 Contanos cómo te fue utilizando los botones:'
          ].join('\n');
          session.tests.basic = stepsAr;
          session.stepsDone.push('basic_tests_shown');
          session.waEligible = false;
          session.lastHelpStep = null;
          const fullMsg = intro + '\n\n' + numbered.join('\n') + '\n\n' + footer;
          session.transcript.push({ who:'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);
          const helpOptions = stepsAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
          options = [...helpOptions, 'Lo pude solucionar', 'El problema persiste', 'Cerrar chat'];
          return res.json(withOptions({ ok:true, reply: fullMsg, stage: session.stage, options, steps: stepsAr }));
        }
        // pedir device
        session.stage = STATES.ASK_DEVICE;
        const msg = `Perfecto. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
        session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply: msg, stage: session.stage, options: ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'] }));
      } catch(err){
        console.error('diagnóstico ASK_PROBLEM', err);
        return res.json(withOptions({ ok:true, reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo.' }));
      }
    }

    // 3) ASK_DEVICE
    else if(session.stage === STATES.ASK_DEVICE || !session.device){
      const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi,'').trim();
      if(dev && dev.length>=2){
        session.device = dev;
        // intentar detectar issue con device
        const issueKey = detectIssue(`${session.problem||''} ${t}`.trim());
        if(issueKey){
          session.issueKey = issueKey;
          session.stage = STATES.BASIC_TESTS;
          const pasosSrc = CHAT?.nlp?.advanced_steps?.[issueKey];
          const pasos = Array.isArray(pasosSrc) ? pasosSrc.slice(0,4) : ['Reiniciar el equipo','Verificar conexiones físicas','Probar en modo seguro'];
          const pasosAr = pasos.map(x=>x);
          const numbered = enumerateSteps(pasosAr);
          reply = `Entiendo, ${session.userName || 'usuario'}. Tu ${session.device} podría tener: ${issueHuman(issueKey)}\n\n🔧 Pasos básicos:\n\n` + numbered.slice(0,3).join('\n') + '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n\n🤔 Contanos cómo te fue utilizando los botones:';
          session.tests.basic = pasosAr.slice(0,3);
          session.stepsDone.push('basic_tests_shown');
          session.lastHelpStep = null;
          options = [...session.tests.basic.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`),'Lo pude solucionar','El problema persiste','Cerrar chat'];
        } else {
          session.stage = STATES.BASIC_TESTS_AI;
          try{
            const ai = await aiQuickTests(session.problem||'', session.device||'');
            if(ai.length){
              const aiAr = ai.map(x=>x);
              reply = `Entiendo, ${session.userName || 'usuario'}. Probemos esto rápido:\n\n` + enumerateSteps(aiAr).join('\n') + '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n\n🤔 Contanos cómo te fue utilizando los botones:';
              session.tests.ai = aiAr;
              session.stepsDone.push('ai_basic_shown');
              options = [...aiAr.map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`),'Lo pude solucionar','El problema persiste','Cerrar chat'];
              session.lastHelpStep = null;
            } else {
              reply = `Perfecto, ${session.userName || 'usuario'}. Anotado: ${session.device}. Contame más del problema.`;
            }
          } catch(e){
            console.error('[aiQuickTests]', e.message);
            reply = 'No pude generar sugerencias ahora. Contame un poco más del problema.';
          }
        }
      } else {
        reply = '¿Podés decirme el tipo de equipo? (Ej: PC, notebook, monitor, teclado)';
        options = ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'];
      }
    }

    // 4) Estados de pruebas / respuestas generales
    else {
      const rxYes = /^\s*(s|si|sí|si,|sí,|lo pude solucion|lo pude solucionar)\b/i;
      const rxNo  = /^\s*(no|n|el problema persiste|persiste)\b/i;
      if(session.lastHelpStep){
        if(rxYes.test(t)){
          const replyYes = 'Genial! Fue un placer ayudarte! Estaré aquí cuando me vuelvas a necesitar.';
          session.stage = STATES.ENDED;
          session.lastHelpStep = null;
          session.transcript.push({ who:'bot', text: replyYes, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply: replyYes, stage: session.stage, options: ['Cerrar chat'] }));
        } else if(rxNo.test(t)){
          const src = session.lastHelpStep.type;
          const list = (session.tests[src] && session.tests[src].length) ? session.tests[src] : session.tests.basic;
          const numbered = enumerateSteps(list || []);
          reply = `Entiendo. Volvamos a los pasos que te ofrecí:\n\n` + numbered.join('\n') + `\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n\n🤔 Contanos cómo te fue utilizando los botones:`;
          const helpOptions = (list||[]).map((_,i)=>`${emojiForIndex(i)} Ayuda paso ${i+1}`);
          options = [...helpOptions,'Lo pude solucionar','El problema persiste','Cerrar chat'];
          session.lastHelpStep = null;
          session.waEligible = false;
        } else if(/cerrar/i.test(t)){
          const replyc = 'Cerrando chat. ¡Hasta luego! 👋';
          session.stage = STATES.ENDED;
          session.lastHelpStep = null;
          session.transcript.push({ who:'bot', text: replyc, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok:true, reply: replyc, stage: session.stage, options: [] }));
        } else {
          reply = '¿Lo pudiste solucionar? (Lo pude solucionar / El problema persiste / Cerrar chat)';
          options = ['Lo pude solucionar','El problema persiste','Cerrar chat'];
        }
      } else {
        if(rxYes.test(t)){
          reply = `¡Excelente! Me alegra que se haya solucionado. Si necesitás más ayuda, volvé cuando quieras.`;
          options = ['Cerrar chat'];
          session.stage = STATES.ENDED;
          session.waEligible = false;
        } else if(rxNo.test(t)){
          session.stepsDone.push('user_says_not_working');
          const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3,6);
          const advAr = Array.isArray(adv) ? adv : [];
          if(advAr.length>0){
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advAr;
            reply = `Entiendo. Vamos con algunas pruebas más avanzadas:\n\n` + advAr.map((p,i)=>`${i+1}. ${p}`).join('\n') + '\n\nSi querés, también puedo generar un ticket para que te atienda un técnico.';
            options = ['Volver a básicas','Generar ticket'];
          } else {
            session.stage = STATES.ESCALATE;
            reply = 'No tengo más pasos automáticos para este caso. Te paso con un técnico o genero un ticket con el historial.';
            options = ['Generar ticket','Cerrar chat'];
            session.waEligible = true;
          }
        } else if(/generar ticket|whatsapp|t[eé]cnico|humano/i.test(t)){
          session.waEligible = true;
          reply = '✅ Puedo generar un ticket con esta conversación y enviarlo por WhatsApp. ¿Querés que lo haga?';
          options = ['Generar ticket','Cerrar chat'];
        } else {
          reply = `Recordá que estamos revisando tu ${session.device||'equipo'} por ${issueHuman(session.issueKey)}.\n\n¿Probaste los pasos que te sugerí?`;
          options = ['Volver a básicas','Generar ticket','Cerrar chat'];
        }
      }
    }

    // Guardar respuesta y transcript
    session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${buttonToken ? `[BOTON] ${buttonLabel}` : t}\n`);
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`);
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
  console.log(`STI Chat (embedded general) started on ${PORT}`);
});