// server.js V4.8.3 — STI Chat (Redis + Tickets + Transcript) + NameFix + CORS + Reload + GreeterFix + FlowFix
// Resumen del flujo y features implementadas
// - Estados: ASK_NAME → ASK_PROBLEM → ASK_DEVICE → BASIC/ADVANCED/ESCALATE
// - Sesión por 'x-session-id' / 'sid' (si ya hay nombre no reinicia)
// - pendingUtterance: guarda el problema si lo mandan antes del nombre
// - CORS sólido con OPTIONS para preflight
// - Endpoints: /  /api/health  /api/reload(GET/POST)  /api/greeting  /api/chat
//              /api/transcript/:sid  /api/whatsapp-ticket  /ticket/:id  /api/sessions  /api/reset
// - OpenAI opcional para análisis/steps; si no hay API Key usa fallback local

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ===== OpenAI (opcional) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ===== Persistencia / paths =====
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Crea directorios si no existen
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}
const nowIso = () => new Date().toISOString();

// ===== Carga chat JSON =====
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = {};
let deviceMatchers = [];
let issueMatchers  = [];

function loadChat() {
  try {
    CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
    console.log('[chat] ✅ Cargado', CHAT.version, 'desde', CHAT_JSON_PATH);
    deviceMatchers = (CHAT?.nlp?.devices || []).map(d => ({ key: d.key, rx: new RegExp(d.rx, 'i') }));
    issueMatchers  = (CHAT?.nlp?.issues  || []).map(i => ({ key: i.key, rx: new RegExp(i.rx, 'i') }));
  } catch (e) {
    console.error('[chat] ❌ No pude cargar sti-chat.json:', e.message);
    CHAT = {}; deviceMatchers = []; issueMatchers = [];
  }
}
loadChat();

// Helpers NLP
const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';
function detectDevice(txt = '') { for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key; return null; }
function detectIssue (txt = '') { for (const i of issueMatchers)  if (i.rx.test(txt)) return i.key; return null; }

// Template (si lo necesitás más adelante)
function tplDefault({ nombre = '', device = 'equipo', issueKey = null }) {
  const base = CHAT?.nlp?.response_templates?.default ||
    'Entiendo, {{nombre}}. Revisemos tu {{device}} con {{issue_human}}.';
  return base.replace('{{nombre}}', nombre || '')
             .replace('{{device}}', device || 'equipo')
             .replace('{{issue_human}}', issueHuman(issueKey));
}

// ===== Store de sesiones (Redis u otro) =====
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== App =====
const app = express();
app.set('trust proxy', 1);

// CORS + preflight
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-session-id','x-session-fresh']
}));
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-session-id','x-session-fresh']
}));

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// No cache
app.use((req, res, next) => { res.set('Cache-Control','no-store'); next(); });

// Landing
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html><meta charset="utf-8">
  <style>body{font:14px system-ui;margin:24px}a{color:#2563eb;text-decoration:none}</style>
  <h1>🚀 STI Rosario AI</h1>
  <p>Servicio en línea. Endpoints útiles:</p>
  <ul>
    <li><a href="/api/health">/api/health</a></li>
    <li><a href="/api/sessions">/api/sessions</a></li>
  </ul>`);
});

// ===== Estados / helpers =====
const STATES = {
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  ASK_DEVICE: 'ask_device',
  BASIC_TESTS: 'basic_tests',
  BASIC_TESTS_AI: 'basic_tests_ai',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
};

const TECH_WORDS = /^(pc|notebook|netbook|laptop|ultrabook|macbook|monitor|pantalla|teclado|mouse|raton|touchpad|trackpad|impresora|printer|scanner|escaner|router|modem|switch|hub|repetidor|accesspoint|servidor|server|cpu|gabinete|fuente|mother|motherboard|placa|placa madre|gpu|video|grafica|ram|memoria|disco|ssd|hdd|pendrive|usb|auricular|auriculares|headset|microfono|camara|webcam|altavoz|parlante|red|ethernet|wifi|wi-?fi|bluetooth|internet|nube|cloud|telefono|celular|movil|smartphone|tablet|ipad|android|iphone|ios|windows|linux|macos|bios|uefi|driver|controlador|actualizacion|formateo|virus|malware|pantallazo|backup|respaldo|sistema operativo|office|problema|error|fallo|falla|bug|reparacion|tecnico|compu|computadora|equipo|hardware|software|programa|sistema)$/i;

const problemHint = /(no (prende|enciende|arranca|funciona|anda|conecta|detecta|reconoce|responde|da señal|muestra imagen|carga|enciende la pantalla)|no (da|tiene) (video|imagen|sonido|internet|conexion|red|wifi|señal)|no inicia|no arranca|no anda|no funca|lento|va lento|se tilda|se cuelga|se congela|pantalla (negra|azul|blanca|con rayas)|sin imagen|sin sonido|sin señal|se apaga|se reinicia|se reinicia solo|no carga|no enciende|no muestra nada|hace ruido|no hace nada|tiene olor|saca humo|parpadea|no detecta|no reconoce|no conecta|problema|error|fallo|falla|bug|no abre|no responde|bloqueado|traba|lag|p(é|e)rdida de conexi(ó|o)n|sin internet|sin wi[- ]?fi|no se escucha|no se ve|no imprime|no escanea|sin color|no gira|no arranca el ventilador)/i;

function isValidName(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (TECH_WORDS.test(t)) return false;
  return /^[a-záéíóúñ]{3,20}$/i.test(t);
}
function extractName(text) {
  if (!text) return null;
  const t = String(text).trim();
  const m = t.match(/(?:^|\b)(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{3,20})(?:\b|$)/i);
  if (m) return m[1];
  if (/^[a-záéíóúñ]{3,20}$/i.test(t) && !TECH_WORDS.test(t)) return t;
  return null;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = (obj) => ({ options: [], ...obj });

function getSessionId(req) {
  const hSid = (req.headers['x-session-id'] || '').toString().trim();
  const bSid = (req.body && (req.body.sessionId || req.body.sid)) ? String(req.body.sessionId || req.body.sid).trim() : '';
  const qSid = (req.query && (req.query.sessionId || req.query.sid)) ? String(req.query.sessionId || req.query.sid).trim() : '';
  const raw = hSid || bSid || qSid;
  return raw || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req, _res, next) => { req.sessionId = getSessionId(req); next(); });

// ===== Config diagnóstico OA =====
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF || 0.6);

// ===== Análisis con OpenAI =====
async function analyzeProblemWithOA(problemText = '') {
  if (!openai) return { device: null, issueKey: null, confidence: 0 };

  const prompt = [
    'Sos técnico informático argentino, claro y profesional.',
    'Tu tarea: analizar el texto del cliente y detectar:',
    '• device → equipo involucrado (ej: pc, notebook, monitor, etc.)',
    '• issueKey → tipo de problema (ej: no_prende, no_internet, pantalla_negra, etc.)',
    '• confidence → número entre 0 y 1 según tu seguridad.',
    '',
    'Respondé SOLO un JSON válido con esas tres claves, sin texto adicional.',
    '',
    `Texto del cliente: "${problemText}"`
  ].join('\n');

  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g, '');
    const obj = JSON.parse(raw);
    return {
      device: (obj.device || null),
      issueKey: (obj.issueKey || null),
      confidence: Math.max(0, Math.min(1, Number(obj.confidence || 0)))
    };
  } catch (e) {
    console.error('[analyzeProblemWithOA] ❌', e.message);
    return { device: null, issueKey: null, confidence: 0 };
  }
}

// ===== OpenAI quick tests (prioriza pasos específicos) =====
async function aiQuickTests(problemText = '', device = '') {
  if (!openai) return [];

  const sys = [
    'Sos un técnico informático argentino. Escribís claro, conciso y amable.',
    'Devolvés SOLAMENTE un JSON array de strings (cada string = un paso).',
    'Prohibido saludar, justificar, explicar o poner formato extra.',
    'Nunca uses emojis ni numeraciones, solo frases imperativas cortas.',
    'Adaptá los pasos al problema y al dispositivo indicado.',
    'No sugieras pasos de energía/enchufe/botón I/O/forzar apagado salvo que el problema sea explícitamente "no enciende / no prende / no power".'
  ].join(' ');

  const usr = [
    `Problema: "${(problemText || '').trim()}"${device ? ` en "${device}"` : ''}.`,
    'Entregá 4 a 6 pasos concretos, seguros y verificables para diagnóstico/solución rápida.',
    'Ejemplo de temas válidos: red/Internet, periféricos, cuelgues, pantalla negra, drivers, impresoras, audio.'
  ].join(' ');

  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: usr }
      ],
      temperature: 0.2
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || '[]';
    const jsonText = raw.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(jsonText);
    return Array.isArray(arr)
      ? Array.from(new Set(arr.filter(x => typeof x === 'string' && x.trim()).map(s => s.trim()))).slice(0, 6)
      : [];
  } catch (e) {
    console.error('[aiQuickTests] Error:', e.message);
    return [];
  }
}

// ===== Fallbacks específicos por issue (sin genéricos de energía) =====
function getIssueFallbackSteps(issueKey = '') {
  const MAP = {
    no_internet: [
      'Reiniciá el módem/router 30 segundos y esperá 2 minutos',
      'Probá con datos móviles u otra red para descartar tu ISP',
      'Conectá por cable Ethernet y probá un sitio conocido',
      'Ejecutá el solucionador de problemas de red en Windows',
      'Verificá si otros dispositivos también pierden conexión'
    ],
    wifi_lento_o_inestable: [
      'Ubicá el equipo más cerca del router y probá',
      'Cambiá la banda a 5 GHz si está disponible',
      'Olvidá y volvé a conectar la red Wi-Fi',
      'Actualizá el driver de la tarjeta Wi-Fi',
      'Probá canal menos congestionado en el router'
    ],
    mouse_no_responde: [
      'Si es inalámbrico, cambiá pilas o recargalo',
      'Probá otro puerto USB y quitá hubs intermedios',
      'Probá el mouse en otra PC para descartar falla del mouse',
      'Reinstalá el driver del mouse desde Administrador de dispositivos',
      'Limpíá el sensor y cambiá la superficie de apoyo'
    ],
    teclado_no_responde: [
      'Probá otro puerto USB o reconectalo',
      'Desactivá Teclas de filtro en Accesibilidad',
      'Probá el teclado en otra PC',
      'Reinstalá el driver del teclado en Administrador de dispositivos',
      'Si es inalámbrico, cambiá batería o emparejalo de nuevo'
    ],
    se_cuelga: [
      'Medí temperatura con HWInfo; si supera 85°C, limpiá y renová pasta',
      'Ejecutá SFC /scannow y comprobación de disco',
      'Probá en Modo seguro para descartar software',
      'Actualizá drivers de video y chipset',
      'Desinstalá programas instalados recientemente'
    ],
    pantalla_negra: [
      'Probá otro cable o puerto de video y otro monitor',
      'Iniciá con periféricos mínimos conectados',
      'Verificá si aparece BIOS; si aparece, el problema es del sistema',
      'Accedé a reparación de inicio desde el entorno de recuperación',
      'Si hay GPU dedicada, probá la salida de la integrada'
    ],
    impresora_no_imprime: [
      'Verificá cola de impresión y cancelá trabajos atascados',
      'Reinstalá el driver de la impresora',
      'Probá impresión de prueba desde el panel de control',
      'Conectá por USB directo para descartar red',
      'Revisá nivel de tinta o tóner y papel atascado'
    ],
    audio_no_suena: [
      'Seleccioná el dispositivo de salida correcto en Windows',
      'Actualizá o reinstalá el driver de audio',
      'Probá con auriculares y con parlantes externos',
      'Ejecutá el solucionador de problemas de audio',
      'Desactivá mejoras de audio que puedan causar conflictos'
    ],
    arranque_lento: [
      'Desactivá programas de inicio innecesarios',
      'Verificá estado del disco con SMART',
      'Actualizá Windows y drivers',
      'Escaneá malware con un antivirus confiable',
      'Ejecutá limpieza de archivos temporales'
    ],
    default: [
      'Probá el componente en otra PC o puerto si aplica',
      'Actualizá o reinstalá drivers relacionados',
      'Probá en Modo seguro o con un usuario limpio',
      'Desinstalá software reciente que pueda interferir'
    ]
  };
  return MAP[issueKey] || MAP.default;
}

// ===== Saludos: normalizador + detección + respuesta =====
function norm(s = '') {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function isGreetingMessage(text = '') {
  const t = norm(text);
  const esStarts = [
    '^hola(?:\\s*che)?\\b', '^che\\b', '^buen[oa]s?\\b', '^holis\\b', '^bue+nas\\b',
    '^que\\s*onda\\b', '^como\\s*va\\b', '^todo\\s*bien\\b', '^ey+\\b', '^ei+\\b',
  ];
  const esInline = [
    '\\bque\\s*onda\\b', '\\bcomo\\s*va\\b', '\\btodo\\s*bien\\b',
    '\\bbuen(?:os|as)?\\s*dias?\\b', '\\bbuenas\\s*tardes\\b', '\\bbuenas\\s*noches\\b',
    '\\bholis\\b', '\\bwena+s\\b',
  ];
  const enStarts = [
    '^hi\\b', '^hello\\b', '^hey\\b', '^yo\\b', '^sup\\b',
    '^good\\s*morning\\b', '^good\\s*afternoon\\b', '^good\\s*evening\\b',
    '^whats?\\s*up\\b'
  ];
  const enInline = [
    '\\bhi\\b', '\\bhello\\b', '\\bhey\\b', '\\byo\\b', '\\bwhats?\\s*up\\b',
    '\\bgood\\s*morning\\b', '\\bgood\\s*afternoon\\b', '\\bgood\\s*evening\\b'
  ];
  const rx = new RegExp(`(?:${[...esStarts, ...enStarts, ...esInline, ...enInline].join('|')})`, 'i');
  const hasProblemHints = /\b(no\s+tengo|no\s*anda|no\s*funciona|se\s*cuelga|pantalla|internet|wifi|mouse|teclado|impresora|audio|lento|no\s*prende|no\s*enciende)\b/i;
  return rx.test(t) && !hasProblemHints.test(t);
}
function greetingVariant(original = '') {
  const t = norm(original);
  const h = new Date().getHours();
  if (/\bbuen(?:os|as)?\s*dias?\b/.test(t) || (h >= 5 && h < 12)) return '¡Buen día! ☀️';
  if (/\bbuenas\s*tardes\b/.test(t) || (h >= 12 && h < 19))       return '¡Buenas tardes! 🌤️';
  if (/\bbuenas\s*noches\b/.test(t) || (h >= 19 || h < 5))        return '¡Buenas noches! 🌙';
  if (/\b(que\s*onda|como\s*va|todo\s*bien)\b/.test(t)) return '¡Todo piola! 🧉';
  if (/\bhi\b|\bhello\b|\bhey\b/i.test(original))       return '¡Hola! 👋';
  return '¡Hola! 👋';
}
function buildGreetingReply(session, userText) {
  const base = greetingVariant(userText);
  if (session?.userName) {
    return `${base} ${session.userName}. Soy Tecnos de STI. Contame, ¿qué problema estás teniendo?`;
  }
  return `${base} Soy Tecnos, tu Asistente Inteligente. ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas")`;
}

// ===== Endpoints =====

// Health
app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openaiReady: !!openai,
    openaiModel: OPENAI_MODEL || null,
    usingNewFlows: true,
    version: CHAT?.version || '4.8.3',
    paths: { data: DATA_BASE, transcripts: TRANSCRIPTS_DIR, tickets: TICKETS_DIR }
  });
});

// Reload chat config
app.all('/api/reload', (_req, res) => {
  try { loadChat(); res.json({ ok: true, version: CHAT.version }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Transcript plano
app.get('/api/transcript/:sid', (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(fs.readFileSync(file, 'utf8'));
});

// WhatsApp ticket
app.post('/api/whatsapp-ticket', async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    let transcript = history;
    const sid = sessionId || req.sessionId;

    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }

    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;

    const lines = [];
    lines.push(`STI • Servicio Técnico Inteligente — Ticket ${ticketId}`);
    lines.push(`Generado: ${nowIso()}`);
    if (name)   lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sid)    lines.push(`Session: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    for (const m of transcript || []) {
      const who = m.who === 'user' ? 'USER' : 'ASSISTANT';
      lines.push(`[${m.ts || nowIso()}] ${who}: ${m.text || ''}`);
    }
    fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), lines.join('\n'), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    let waText = CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI 👋. Vengo del chat web. Dejo mi consulta:';
    waText += '\n';
    if (name)   waText += `\n👤 Cliente: ${name}\n`;
    if (device) waText += `💻 Equipo: ${device}\n`;
    waText += `\n🎫 Ticket: ${ticketId}\n📄 Detalle completo: ${publicUrl}`;

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
    res.json({ ok: true, ticketId, publicUrl, waUrl });
  } catch (e) {
    console.error('[whatsapp-ticket] ❌', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Página pública del ticket
app.get('/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/[^A-Z0-9-]/g, '');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('Ticket no encontrado');
  const content = fs.readFileSync(file, 'utf8');
  const title = `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  const desc = (content.split('\n').slice(0, 8).join(' ') || '').slice(0, 200);
  const url  = `${PUBLIC_BASE_URL}/ticket/${id}`;
  const logo = `${PUBLIC_BASE_URL}/logo.png`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${logo}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${logo}">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px;background:#f5f5f5}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto}
h1{font-size:20px;margin:0 0 6px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
</style></head>
<body>
<h1>${title}</h1>
<p><a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a></p>
<pre>${content.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>
</body></html>`);
});

// Reset de sesión
app.post('/api/reset', async (req, res) => {
  const sid = req.sessionId;
  const empty = {
    id: sid, userName: null, stage: STATES.ASK_NAME,
    device:null, problem:null, issueKey:null,
    tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
    fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null
  };
  await saveSession(sid, empty);
  res.json({ ok: true });
});

// ====== GREETING con reinicio forzado ======
app.all('/api/greeting', async (req, res) => {
  try {
    const sid = req.sessionId;
    const fresh = {
      id: sid,
      userName: null,
      stage: STATES.ASK_NAME,
      device: null,
      problem: null,
      issueKey: null,
      tests: { basic: [], advanced: [], ai: [] },
      stepsDone: [],
      fallbackCount: 0,
      waEligible: false,
      transcript: [],
      pendingUtterance: null
    };
    const text = CHAT?.messages_v4?.greeting?.name_request
      || '👋 ¡Hola! Soy Tecnos,  tu Asistente Inteligente. Cual es tu nombre?';

    fresh.transcript.push({ who: 'bot', text, ts: nowIso() });
    await saveSession(sid, fresh);

    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  } catch (e) {
    console.error('[api/greeting RESET] error:', e);
    const text = '👋 ¡Hola! Soy Tecnos,  tu Asistente Inteligente. Cual es tu nombre?';
    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  }
});

// ===== Chat principal =====
app.post('/api/chat', async (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const t = String(text).trim();
    const sid = req.sessionId;

    let session = await getSession(sid);
    if (!session) {
      session = {
        id: sid, userName: null, stage: STATES.ASK_NAME,
        device:null, problem:null, issueKey:null,
        tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
        fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null
      };
      console.log(`[api/chat] ✨ Nueva sesión: ${sid}`);
    }

    // Log del usuario
    session.transcript.push({ who: 'user', text: t, ts: nowIso() });

    let reply = ''; let options = [];

    // === DETECCIÓN DE SALUDO ===
    if (isGreetingMessage(t)) {
      const lastBot = session.transcript?.slice().reverse().find(m => m.who === 'bot')?.text || '';
      const alreadyAskingName = /¿c[oó]mo te llam[aá]s\?/i.test(lastBot);

      session.greeted = true;

      let replyG = buildGreetingReply(session, t);
      if (alreadyAskingName && session?.userName) {
        replyG = `Perfecto, ${session.userName}. Contame, ¿qué problema estás teniendo?`;
      }

      session.transcript.push({ who: 'bot', text: replyG, ts: nowIso() });
      await saveSession(sid, session);
      return res.json({ ok: true, reply: replyG, stage: session.stage, options: [] });
    }

    // ===== 1) Estado: pedir nombre
    if (session.stage === STATES.ASK_NAME) {
      if (problemHint.test(t) && !extractName(t)) session.pendingUtterance = t;

      const name = extractName(t);
      if (/^omitir$/i.test(t)) {
        session.userName = session.userName || 'usuario';
      } else if (!session.userName && name) {
        session.userName = cap(name);
      }

      if (!session.userName) {
        reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas")';
      } else {
        session.stage = STATES.ASK_PROBLEM;
        if (session.pendingUtterance) {
          session.problem = session.pendingUtterance;
          session.pendingUtterance = null;
          session.stage = STATES.ASK_DEVICE;
          options = ['PC','Notebook','Teclado','Mouse','Monitor','Internet / Wi-Fi'];
          reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa?`;
        } else {
          reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
        }
      }
    }

    // ===== 2) Estado: pedir problema
    else if (session.stage === STATES.ASK_PROBLEM) {
      session.problem = t || session.problem;

      try {
        let device    = detectDevice(session.problem);
        let issueKey  = detectIssue(session.problem);
        let confidence = issueKey ? 0.6 : 0;

        if (openai) {
          const ai = await analyzeProblemWithOA(session.problem);
          if ((ai.confidence || 0) >= confidence) {
            device     = ai.device || device;
            issueKey   = ai.issueKey || issueKey;
            confidence = ai.confidence || confidence;
          }
        }

        // Si tenemos suficiente confianza, vamos a pasos básicos específicos
        if (confidence >= OA_MIN_CONF && (issueKey || device)) {
          session.device   = session.device || device || 'equipo';
          session.issueKey = issueKey || session.issueKey || null;
          session.stage    = STATES.BASIC_TESTS;

          // Prioridad: OA → JSON → fallback específico
          let steps = await aiQuickTests(session.problem || '', session.device || '');
          if (!steps.length) {
            const k = session.issueKey || 'default';
            steps = (CHAT?.nlp?.basic_steps?.[k] || []).slice(0, 6);
          }
          if (!steps.length) steps = getIssueFallbackSteps(session.issueKey).slice(0, 5);

          const intro = `Entiendo, ${session.userName}. Probemos esto primero:`;
          const footer = [
            '',
            '🧩 ¿Se solucionó?',
            'Si no, puedo ofrecerte algunas pruebas más avanzadas.',
            '',
            'Decime: "sí", "no" o "avanzadas".'
          ].join('\n');

          session.tests.basic = steps;
          session.stepsDone.push('basic_tests_shown');
          session.waEligible = true;

          const fullMsg = intro + '\n\n• ' + steps.join('\n• ') + '\n' + footer;

          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);

          try {
            const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
            fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${intro}\n`);
            steps.forEach(s => fs.appendFileSync(tf, ` - ${s}\n`));
            fs.appendFileSync(tf, `\n${footer}\n`);
          } catch {}

          return res.json({
            ok: true,
            reply: fullMsg,
            steps,
            stepsType: 'basic',
            options: ['Sí, se solucionó ✅', 'No, sigue igual ❌', 'Avanzadas 🔧', 'WhatsApp'],
            stage: session.stage,
            allowWhatsapp: true
          });
        }

        // Si no hay confianza suficiente → pedir equipo
        session.stage = STATES.ASK_DEVICE;
        const msg = `Enseguida te ayudo con ese problema 🔍\n\nPerfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
        await saveSession(sid, session);
        return res.json({ ok: true, reply: msg, options: ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi'] });

      } catch (err) {
        console.error('diagnóstico ASK_PROBLEM:', err);
        return res.json({ ok: true, reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo en un momento.' });
      }
    }

    // ===== 3) Estado: pedir equipo y derivar a tests
    else if (session.stage === STATES.ASK_DEVICE || !session.device) {
      const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();
      if (dev && dev.length >= 2) {
        session.device = dev;

        const issueKey = detectIssue(`${session.problem || ''} ${t}`.trim());
        if (issueKey) {
          session.issueKey = issueKey;
          session.stage    = STATES.BASIC_TESTS;

          // Prioridad de pasos aquí también
          let pasos = await aiQuickTests(session.problem || '', session.device || '');
          if (!pasos.length) {
            const k = session.issueKey || 'default';
            pasos = (CHAT?.nlp?.basic_steps?.[k] || (CHAT?.nlp?.advanced_steps?.[k] || [])).slice(0, 3);
          }
          if (!pasos.length) pasos = getIssueFallbackSteps(session.issueKey).slice(0, 3);

          reply  = `Entiendo, ${session.userName}. Tu ${session.device} tiene el problema: ${issueHuman(issueKey)} 🔍\n\n`;
          reply += `🔧 Pasos iniciales:\n\n`;
          pasos.forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });

          reply += `\n🧩 ¿Se solucionó?\n`;
          reply += `Si no, puedo ofrecerte algunas pruebas más avanzadas.\n\n`;
          reply += `Decime: "sí", "no" o "avanzadas".\n`;

          session.tests.basic = pasos.slice(0, 3);
          session.stepsDone.push('basic_tests_shown');
          options = ['Sí, se solucionó ✅','No, sigue igual ❌','Avanzadas 🔧','WhatsApp'];
          session.waEligible = true;
        } else {
          session.stage = STATES.BASIC_TESTS_AI;
          try {
            const ai = await aiQuickTests(session.problem || '', session.device || '');
            if (ai.length) {
              reply  = `Entiendo, ${session.userName}. Probemos esto rápido 🔍\n\n`;
              reply += `🔧 Pasos iniciales:\n\n`;
              ai.forEach(s => reply += `• ${s}\n`);

              reply += `\n🧩 ¿Se solucionó?\n`;
              reply += `Si no, puedo ofrecerte algunas pruebas más avanzadas.\n\n`;
              reply += `Decime: "sí", "no" o "avanzadas".\n`;

              session.tests.ai = ai;
              session.stepsDone.push('ai_basic_shown');
              session.waEligible = true;
              options = ['Sí, se solucionó ✅','No, sigue igual ❌','Avanzadas 🔧','WhatsApp'];
            } else {
              reply = `Perfecto, ${session.userName}. Anotado: ${session.device}.\n\nContame un poco más del problema.`;
            }
          } catch (e) {
            console.error('[aiQuickTests] ❌', e.message);
            reply = 'No pude generar sugerencias ahora. Contame un poco más del problema.';
          }
        }
      } else {
        reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
        options = ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'];
      }
    }

    // ===== 4) Estados de pruebas y escalación
    else {
      const rxYes = /\b(s[ií]|sí se solucion[oó]|se solucion[oó]|funcion[oó]|ya anda|listo funcion[oó])\b/i;
      const rxNo  = /\b(no|todav[ií]a no|no funcion[oó]|sigue igual|no cambi[oó]|tampoco)\b/i;
      const rxAdv = /\b(avanzadas?|m[aá]s pruebas|pruebas t[eé]cnicas|continuar|seguir)\b/i;

      if (rxYes.test(t)) {
        reply  = `¡Excelente, ${session.userName}! 🙌\n`;
        reply += `Me alegra que se haya solucionado 💪\n`;
        reply += `Si vuelve a ocurrir o necesitás revisar otro equipo, podés contactarnos nuevamente cuando quieras.\n\n`;
        reply += `¡Gracias por confiar en STI! ⚡\n\n`;
        reply += `Si querés hacerle algún comentario al cuerpo técnico, pulsá el botón verde y se enviará un ticket por WhatsApp con esta conversación.\n`;
        reply += `Enviá el mensaje sin modificarlo, y luego podés hacer el comentario que quieras. 📨`;
        options = ['WhatsApp'];
        session.stage = STATES.ESCALATE;
        session.waEligible = true;

      } else if (rxNo.test(t)) {
        session.stepsDone.push('user_says_not_working');
        const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
        if (adv.length > 0) {
          session.stage = STATES.ADVANCED_TESTS;
          session.tests.advanced = adv;
          reply = `Entiendo, ${session.userName} 😔\n`;
          reply += `Entonces vamos a hacer unas pruebas más avanzadas para tratar de solucionarlo. 🔍\n\n`;
          adv.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
          session.waEligible = true;
          options = ['Volver a básicas','WhatsApp'];
        } else {
          reply = 'Entiendo. Te paso con un técnico que te va a ayudar personalmente. Hacé clic en el botón verde y un ticket con esta conversación se enviará a un técnico para agilizar los tiempos.';
          session.waEligible = true; options = ['WhatsApp'];
          session.stage = STATES.ESCALATE;
        }

      } else if (rxAdv.test(t)) {
        const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
        if (adv.length > 0) {
          session.stage = STATES.ADVANCED_TESTS;
          session.tests.advanced = adv;
          reply  = `Perfecto 👍\n`;
          reply += `Te muestro las pruebas más avanzadas para este caso:\n\n`;
          adv.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
          session.waEligible = true;
          options = ['Volver a básicas','WhatsApp'];
        } else {
          reply = 'No tengo más pasos automáticos para este caso. Te paso con un técnico para seguimiento por WhatsApp.';
          session.waEligible = true; options = ['WhatsApp'];
          session.stage = STATES.ESCALATE;
        }

      } else if (/\b(whatsapp|t[ée]cnico|derivar|persona|humano)\b/i.test(t)) {
        session.waEligible = true;
        reply = 'Te preparo un ticket con el historial para WhatsApp.';
        options = ['Enviar a WhatsApp (con ticket)'];

      } else if (/\b(dale|ok|bueno|joya|b[áa]rbaro|listo|perfecto|prob[ée]|hice)\b/i.test(t)) {
        session.stepsDone.push('user_confirmed_basic');
        if (session.stage === STATES.BASIC_TESTS && ((session.tests.basic || []).length >= 2 || (session.tests.ai || []).length >= 2)) {
          const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
          if (adv.length > 0) {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = adv;
            reply = `Genial, ${session.userName}. Sigamos con pasos más avanzados 🔧\n\n`;
            adv.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
            reply += `\n¿Pudiste probar alguno?`;
            session.waEligible = true;
            options = ['Volver a básicas','WhatsApp'];
          } else {
            reply = 'Perfecto. Si persiste, te paso con un técnico.';
            session.waEligible = true;
            options = ['WhatsApp'];
          }
        } else {
          reply = 'Perfecto. ¿Alguno de esos pasos ayudó?';
          options = ['Pasar a avanzadas','WhatsApp'];
        }

      } else {
        reply = `Recordá que estamos revisando tu ${session.device || 'equipo'} por ${issueHuman(session.issueKey)} 🔍\n\n` +
                `¿Probaste los pasos que te sugerí?\n\n` +
                'Decime:\n• "sí" si los probaste\n• "no" si no funcionaron\n• "avanzadas" para ver más pruebas\n• "ayuda" para hablar con un técnico';
        options = ['Avanzadas 🔧','WhatsApp'];
      }
    }

    // Persistencia del mensaje del bot
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);

    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`);
      fs.appendFileSync(tf,  `[${nowIso()}] ASSISTANT: ${reply}\n`);
    } catch (e) { console.warn('[transcript] no pude escribir:', e.message); }

    const response = withOptions({ ok: true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;
    if (session.waEligible) response.allowWhatsapp = true;
    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json(withOptions({ ok: true, reply: 'Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// Listar sesiones activas
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  res.json({ ok: true, count: sessions.length, sessions });
});

// ===== Server =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 [STI Chat V4.8.3-FlowFix] Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📂 Data: ${DATA_BASE}`);
  console.log(`${CHAT?.version ? `📋 Chat config: ${CHAT.version}` : '⚠️  No chat config loaded'}`);
  console.log('='.repeat(60) + '\n');
});
