// server.js V4.8.3 — STI Chat (Redis + Tickets + Transcript) + NameFix + CORS + Reload + GreeterFix + FlowFix
// Resumen del flujo y features implementadas
// - Estados: ASK_NAME → ASK_PROBLEM → ASK_DEVICE → BASIC/ADVANCED/ESCALATE
// - Sesión por 'x-session-id' / 'sid' (si ya hay nombre no reinicia)
// - pendingUtterance: guarda el problema si lo mandan antes del nombre
// - CORS sólido con OPTIONS para preflight
// - Endpoints: /  /api/health  /api/reload(GET/POST)  /api/greeting  /api/chat
//              /api/transcript/:sid  /api/whatsapp-ticket  /ticket/:id  /api/sessions  /api/reset
// - OpenAI opcional para análisis/steps; si no hay API Key usa fallback local

import 'dotenv/config';            // Carga variables de entorno desde .env
import express from 'express';     // Framework HTTP
import cors from 'cors';           // Middleware CORS
import fs from 'fs';               // FileSystem para logs, tickets y transcripts
import path from 'path';           // Utilidades de rutas
import OpenAI from 'openai';       // SDK OpenAI (opcional)

// ===== OpenAI (opcional) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';  // Modelo por defecto
// Instancia de cliente OpenAI solo si hay API key (evita crashear en local)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ===== Persistencia / paths =====
// Carpetas base (se pueden mapear a volúmenes en Render/Docker)
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
// URL pública del backend para construir links (tickets, og:image, etc.)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
// Número de WhatsApp destino para derivaciones
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Crea directorios si no existen (recursivo)
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}
const nowIso = () => new Date().toISOString();  // Helper timestamp ISO

// ===== Carga chat JSON =====
// Ruta al archivo de configuración conversacional (nlp, steps, labels)
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = {};             // Objeto con todo el JSON cargado
let deviceMatchers = [];   // Cache de regex para dispositivos
let issueMatchers  = [];   // Cache de regex para issues

// Carga/parsing de sti-chat.json, compila regex de devices/issues para rendimiento
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

// Helpers de NLP (humanización de issue y detecciones por regex)
const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';
function detectDevice(txt = '') { for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key; return null; }
function detectIssue (txt = '') { for (const i of issueMatchers)  if (i.rx.test(txt)) return i.key; return null; }

// Template de respuesta por defecto (permite personalizar en JSON)
function tplDefault({ nombre = '', device = 'equipo', issueKey = null }) {
  const base = CHAT?.nlp?.response_templates?.default ||
    'Entiendo, {{nombre}}. Revisemos tu {{device}} con {{issue_human}}.';
  return base.replace('{{nombre}}', nombre || '')
             .replace('{{device}}', device || 'equipo')
             .replace('{{issue_human}}', issueHuman(issueKey));
}

// ===== Store de sesiones (Redis u otro) =====
// getSession/saveSession/listActiveSessions están abstraídos en sessionStore.js
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== App =====
const app = express();
app.set('trust proxy', 1);  // Confía en cabeceras de proxy (Render/NGINX) para IP real

// CORS fuerte + OPTIONS handler (preflight)
app.use(cors({
  origin: true,                 // Permite cualquier origen (o ajustá a tu dominio)
  credentials: true,            // Permite cookies/headers de auth
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-session-id','x-session-fresh'] // headers custom
}));
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-session-id','x-session-fresh']
}));

// Body parsers (JSON + urlencoded)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// No cache global (evita que proxies sirvan saludos viejos)
app.use((req, res, next) => { res.set('Cache-Control','no-store'); next(); });

// Landing amigable (útil para verificar deploy vivo)
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
// Máquina de estados de la conversación
const STATES = {
  ASK_NAME: 'ask_name',           // pedir nombre
  ASK_PROBLEM: 'ask_problem',     // pedir problema
  ASK_DEVICE: 'ask_device',       // pedir equipo/dispositivo
  BASIC_TESTS: 'basic_tests',     // pasos básicos (desde JSON o AI)
  BASIC_TESTS_AI: 'basic_tests_ai', // pasos básicos generados por AI
  ADVANCED_TESTS: 'advanced_tests', // pasos avanzados
  ESCALATE: 'escalate',           // derivar a humano/WhatsApp
};

// Palabras que NO deben interpretarse como nombre (evita “pc”, “router”, etc.)
const TECH_WORDS = /^(pc|notebook|netbook|laptop|ultrabook|macbook|monitor|pantalla|teclado|mouse|raton|touchpad|trackpad|impresora|printer|scanner|escaner|router|modem|switch|hub|repetidor|accesspoint|servidor|server|cpu|gabinete|fuente|mother|motherboard|placa|placa madre|gpu|video|grafica|ram|memoria|disco|ssd|hdd|pendrive|usb|auricular|auriculares|headset|microfono|camara|webcam|altavoz|parlante|red|ethernet|wifi|wi-?fi|bluetooth|internet|nube|cloud|telefono|celular|movil|smartphone|tablet|ipad|android|iphone|ios|windows|linux|macos|bios|uefi|driver|controlador|actualizacion|formateo|virus|malware|pantallazo|backup|respaldo|sistema operativo|office|problema|error|fallo|falla|bug|reparacion|tecnico|compu|computadora|equipo|hardware|software|programa|sistema)$/i;

// Heurística para detectar que el texto describe un problema (no un nombre)
const problemHint = /(no (prende|enciende|arranca|funciona|anda|conecta|detecta|reconoce|responde|da señal|muestra imagen|carga|enciende la pantalla)|no (da|tiene) (video|imagen|sonido|internet|conexion|red|wifi|señal)|no inicia|no arranca|no anda|no funca|lento|va lento|se tilda|se cuelga|se congela|pantalla (negra|azul|blanca|con rayas)|sin imagen|sin sonido|sin señal|se apaga|se reinicia|se reinicia solo|no carga|no enciende|no muestra nada|hace ruido|no hace nada|tiene olor|saca humo|parpadea|no detecta|no reconoce|no conecta|problema|error|fallo|falla|bug|no abre|no responde|bloqueado|traba|lag|p(é|e)rdida de conexi(ó|o)n|sin internet|sin wi[- ]?fi|no se escucha|no se ve|no imprime|no escanea|sin color|no gira|no arranca el ventilador)/i;

// Validación y extracción de nombre (conformidad básica y frases “soy/mi nombre es”)
function isValidName(text) {
  if (!text) return false;
  const t = String(text).trim();
  if (TECH_WORDS.test(t)) return false;
  return /^[a-záéíóúñ]{3,20}$/i.test(t);
}
function extractName(text) {
  if (!text) return null;
  const t = String(text).trim();
  const m = t.match(/^(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{3,20})$/i);
  if (m) return m[1];
  if (isValidName(t)) return t;
  return null;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; // Capitaliza nombre
const withOptions = (obj) => ({ options: [], ...obj }); // Asegura campo options en respuestas

// Normaliza el sessionId de headers/body/query; genera uno si no viene
function getSessionId(req) {
  // headers en node están en minúscula
  const hSid = (req.headers['x-session-id'] || '').toString().trim();
  const bSid = (req.body && (req.body.sessionId || req.body.sid)) ? String(req.body.sessionId || req.body.sid).trim() : '';
  const qSid = (req.query && (req.query.sessionId || req.query.sid)) ? String(req.query.sessionId || req.query.sid).trim() : '';
  const raw = hSid || bSid || qSid;
  return raw || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req, _res, next) => { req.sessionId = getSessionId(req); next(); });

// ===== Config diagnóstico OA =====
// Umbral mínimo de confianza para aceptar predicción AI/regex
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF || 0.6);

// ===== Análisis con OpenAI =====
// Recibe texto del problema y devuelve {device, issueKey, confidence}
// Si no hay OpenAI, devuelve nulos para mantener el flujo
async function analyzeProblemWithOA(problemText = '') {
  if (!openai) return { device: null, issueKey: null, confidence: 0 };

  const prompt = [
    "Sos técnico informático argentino, claro y profesional.",
    "Tu tarea: analizar el texto del cliente y detectar:",
    "• device → equipo involucrado (ej: pc, notebook, monitor, etc.)",
    "• issueKey → tipo de problema (ej: no_prende, no_internet, pantalla_negra, etc.)",
    "• confidence → número entre 0 y 1 según tu seguridad.",
    "",
    "Respondé SOLO un JSON válido con esas tres claves, sin texto adicional.",
    "",
    `Texto del cliente: "${problemText}"`
  ].join('\n');

  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });
    // Limpieza por si el modelo envuelve en ```json
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

// ===== OpenAI quick tests (opcional) =====
// Genera 4–6 pasos simples de diagnóstico básico (o fallback estático)
async function aiQuickTests(problemText = '', device = '') {
  if (!openai) {
    // Fallback local si no hay API
    return [
      'Verificar conexión eléctrica/toma',
      'Probar con otro cable o cargador',
      'Mantener pulsado el botón de encendido 10 segundos',
      'Conectar directo (sin zapatillas/estabilizador)',
      'Comprobar si hay luces o sonidos al encender'
    ];
  }
  const prompt = [
    `Sos técnico informático argentino, claro y amable.`,
    `Problema: "${problemText}"${device ? ` en ${device}` : ''}.`,
    `Indicá 4–6 pasos simples y seguros.`,
    `Devolvé solo un JSON array de strings.`
  ].join('\n');

  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });
    const raw = resp.choices?.[0]?.message?.content?.trim() || '[]';
    const jsonText = raw.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(jsonText);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string').slice(0, 6) : [];
  } catch (e) {
    console.error('[aiQuickTests] Error:', e.message);
    return ['Verificar cable/fuente', 'Probar otra toma', 'Forzar apagado/encendido', 'Probar otro cable/cargador', 'Chequear luces/sonidos al encender'];
  }
}

// ===== Endpoints =====

// Health: status del servicio y paths útiles
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

// Reload chat config (GET/POST): vuelve a leer sti-chat.json sin reiniciar server
app.all('/api/reload', (_req, res) => {
  try { loadChat(); res.json({ ok: true, version: CHAT.version }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Transcript plano: devuelve el .txt del historial de una sesión (debug/soporte)
app.get('/api/transcript/:sid', (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(fs.readFileSync(file, 'utf8'));
});

// WhatsApp ticket: genera ticket .txt + link público + URL wa.me con texto prellenado
app.post('/api/whatsapp-ticket', async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    let transcript = history;
    const sid = sessionId || req.sessionId;

    // Si no mandan history explícito, intenta sacarlo de la sesión guardada
    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }

    // ID legible: TCK-YYYYMMDD-XXXX
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;

    // Render del contenido del ticket (simple texto)
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

    // Construye link público y texto para WhatsApp
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

// Página pública del ticket (HTML básico con metadatos sociales)
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

// Reset de sesión: útil para botón “Nueva conversación” en el front
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

// ====== GREETING CON REINICIO FORZADO DE SESIÓN ======
// Siempre arranca “limpio”: resetea sesión y devuelve el saludo con pedido de nombre
app.all('/api/greeting', async (req, res) => {
  try {
    const sid = req.sessionId;

    // Crea SIEMPRE una sesión fresca (evita estados pegados)
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

    // Texto configurable desde JSON; fallback literal
    const text = CHAT?.messages_v4?.greeting?.name_request
      || '👋 ¡Hola! Soy Tecnos,  tu Asistente Inteligente. ¿Cuál es tu nombre?';

    fresh.transcript.push({ who: 'bot', text, ts: nowIso() });
    await saveSession(sid, fresh);

    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  } catch (e) {
    console.error('[api/greeting RESET] error:', e);
    const text = '👋 ¡Hola! Soy Tecnos,  tu Asistente Inteligente. ¿Cuál es tu nombre?';
    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  }
});

// Chat principal: corazón del flujo conversacional
app.post('/api/chat', async (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const t = String(text).trim();
    const sid = req.sessionId;

    // Carga o crea sesión si no existe (primer mensaje)
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

    // Log del usuario en transcript (memoria de la conversación)
    session.transcript.push({ who: 'user', text: t, ts: nowIso() });

        // Detección inline de nombre en el mismo mensaje (e.g., "hola, me llamo X")
        const nmInline = extractName(t);
        if (nmInline && !session.userName) {
          session.userName = cap(nmInline);
          if (session.stage === STATES.ASK_NAME) {
            session.stage = STATES.ASK_PROBLEM;
            const reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
            session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
            await saveSession(sid, session);
            return res.json({ ok: true, reply, stage: session.stage, options: [] });
          }
        }
    

    let reply = ''; let options = [];

    // ===== 1) Estado: pedir nombre =====
    if (session.stage === STATES.ASK_NAME) {
      // Si describe problema antes del nombre, guardamos para retomarlo
      if (problemHint.test(t) && !extractName(t)) session.pendingUtterance = t;

      // Detección de nombre u “omitir”
      const name = extractName(t);
      if (/^omitir$/i.test(t)) {
        session.userName = session.userName || 'usuario';
      } else if (!session.userName && name) {
        session.userName = cap(name);
      }

      // Si aún no tenemos nombre, re-preguntamos
      if (!session.userName) {
        reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas")';
      } else {
        // Tenemos nombre → pasamos a pedir problema
        session.stage = STATES.ASK_PROBLEM;
        if (session.pendingUtterance) {
          // Si ya había contado el problema, lo retomamos y pedimos equipo
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

    // ===== 2) Estado: pedir problema =====
    else if (session.stage === STATES.ASK_PROBLEM) {
      session.problem = t || session.problem;

      try {
        // (1) Detección local por regex
        let device    = detectDevice(session.problem);
        let issueKey  = detectIssue(session.problem);
        let confidence = issueKey ? 0.6 : 0;

        // (2) OpenAI si está disponible (puede mejorar device/issueKey/confianza)
        if (openai) {
          const ai = await analyzeProblemWithOA(session.problem);
          if ((ai.confidence || 0) >= confidence) {
            device     = ai.device || device;
            issueKey   = ai.issueKey || issueKey;
            confidence = ai.confidence || confidence;
          }
        }

        // (3) Si la confianza alcanza el umbral → ir directo a pasos básicos
        if (confidence >= OA_MIN_CONF && (issueKey || device)) {
          session.device   = session.device || device || 'equipo';
          session.issueKey = issueKey || session.issueKey || null;
          session.stage    = STATES.BASIC_TESTS;

          // Toma hasta 4 pasos iniciales del JSON (o fallback estándar)
          const key = session.issueKey || 'no_funciona';
          const steps = (CHAT?.nlp?.advanced_steps?.[key])?.slice(0, 4) || [
            'Verificá la energía (enchufe / zapatilla / botón I/O de la fuente)',
            'Probá otro tomacorriente o cable/cargador',
            'Mantené presionado el botón de encendido 15–30 segundos y probá de nuevo',
            'Si hay luces o sonidos, probá desconectar periféricos y volver a encender'
          ];
            // voseo
            const stepsAr = steps.map(arVoseo);

          // Introducción + pie ¿Se solucionó?
          const intro = `Entiendo, ${session.userName}. Probemos esto primero:`;
          const footer = [
         '',
         '🧩 ¿Se solucionó?',
         'Si no, puedo ofrecerte algunas **pruebas más avanzadas**.',
         '',
         'Decime: **"sí"**, **"no"** o **"avanzadas"**.'
        ].join('\n');

session.tests.basic = (typeof stepsAr !== 'undefined' ? stepsAr : steps);
session.stepsDone.push('basic_tests_shown');
session.waEligible = true;

const fullMsg = intro + '\n\n• ' + (typeof stepsAr !== 'undefined' ? stepsAr : steps).join('\n• ') + '\n' + footer;

          // Guardamos transcript de bot
          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);

// También agregamos a archivo de transcript (debug/soporte)
try {
  const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${intro}\n`);
  const list = (typeof stepsAr !== 'undefined' ? stepsAr : steps);
  list.forEach(s => fs.appendFileSync(tf, ` - ${s}\n`));
  fs.appendFileSync(tf, `\n${footer}\n`);
} catch {}

          // Respondemos con pasos + opciones rápidas unificadas
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

        // (4) Si no hay confianza suficiente → pedir equipo
        session.stage = STATES.ASK_DEVICE;
        const msg = `Enseguida te ayudo con ese problema 🔍\n\n` +
                    `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n` +
                    `¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
        await saveSession(sid, session);
        return res.json({ ok: true, reply: msg, options: ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi'] });

      } catch (err) {
        console.error('diagnóstico ASK_PROBLEM:', err);
        return res.json({ ok: true, reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo en un momento.' });
      }
    }

    // ===== 3) Estado: pedir equipo y derivar a tests =====
    else if (session.stage === STATES.ASK_DEVICE || !session.device) {
      // Usa regex o limpia texto (solo letras/espacios) para determinar el equipo
      const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();
      if (dev && dev.length >= 2) {
        session.device = dev;

        // Intento de deducir issue combinando problema + equipo
        const issueKey = detectIssue(`${session.problem || ''} ${t}`.trim());
        if (issueKey) {
          // Tenemos issue → pasos básicos (3 primeros) + pie ¿Se solucionó?
          session.issueKey = issueKey;
          session.stage    = STATES.BASIC_TESTS;
          const pasos = CHAT?.nlp?.advanced_steps?.[issueKey] || [
            'Reiniciar el equipo',
            'Verificar conexiones físicas',
            'Probar en modo seguro',
          ];
            const pasosAr = (pasos || []).map(arVoseo);
          reply  = `Entiendo, ${session.userName}. Tu **${session.device}** tiene el problema: ${issueHuman(issueKey)} 🔍\n\n`;
          reply += `🔧 **Probá estos pasos básicos:**\n\n`;
          pasosAr.slice(0, 3).forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });

          // Pie unificado
          reply += `\n🧩 ¿Se solucionó?\n`;
          reply += `Si no, puedo ofrecerte algunas **pruebas más avanzadas**.\n\n`;
          reply += `Decime: **"sí"**, **"no"** o **"avanzadas"**.\n`;

          session.tests.basic = pasosAr.slice(0, 3);
          session.stepsDone.push('basic_tests_shown');
          options = ['Sí, se solucionó ✅','No, sigue igual ❌','Avanzadas 🔧','WhatsApp'];
          session.waEligible = true;
        } else {
          // No hay issue claro → pedir AI quick tests + pie ¿Se solucionó?
          session.stage = STATES.BASIC_TESTS_AI;
          try {
            const ai = await aiQuickTests(session.problem || '', session.device || '');
            if (ai.length) {
                const aiAr = ai.map(arVoseo);
              reply  = `Entiendo, ${session.userName}. Probemos esto rápido 🔍\n\n`;
              reply += `🔧 **Pasos iniciales:**\n\n`;
              aiAr.forEach(s => reply += `• ${s}\n`);

              // Pie unificado
              reply += `\n🧩 ¿Se solucionó?\n`;
              reply += `Si no, puedo ofrecerte algunas **pruebas más avanzadas**.\n\n`;
              reply += `Decime: **"sí"**, **"no"** o **"avanzadas"**.\n`;

              session.tests.ai = aiAr;
              session.stepsDone.push('ai_basic_shown');
              session.waEligible = true;
              options = ['Sí, se solucionó ✅','No, sigue igual ❌','Avanzadas 🔧','WhatsApp'];
            } else {
              reply = `Perfecto, ${session.userName}. Anotado: **${session.device}** 📝\n\nContame un poco más del problema.`;
            }
          } catch (e) {
            console.error('[aiQuickTests] ❌', e.message);
            reply = 'No pude generar sugerencias ahora 😅. Contame un poco más del problema.';
          }
        }
      } else {
        // Si no reconoce el equipo, ofrece opciones clicables
        reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
        options = ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'];
      }
    }

    // ===== 4) Estados de pruebas y escalación =====
    else {
      // --- NUEVO: manejo explícito de "sí / no / avanzadas" luego del pie ---
      const rxYes = /\b(s[ií]|sí se solucion[oó]|se solucion[oó]|funcion[oó]|ya anda|listo funcion[oó])\b/i;
      const rxNo  = /\b(no|todav[ií]a no|no funcion[oó]|sigue igual|no cambi[oó]|tampoco)\b/i;
      const rxAdv = /\b(avanzadas?|m[aá]s pruebas|pruebas t[eé]cnicas|continuar|seguir)\b/i;

      if (rxYes.test(t)) {
        // Cierre amable + CTA WhatsApp según texto acordado
        reply  = `¡Excelente, ${session.userName}! 🙌\n`;
        reply += `Me alegra que se haya solucionado 💪\n`;
        reply += `Si vuelve a ocurrir o necesitás revisar otro equipo, podés contactarnos nuevamente cuando quieras.\n\n`;
        reply += `¡Gracias por confiar en STI! ⚡\n\n`;
        reply += `Si querés hacerle algún comentario al cuerpo técnico, pulsá el botón verde y se enviará un ticket por WhatsApp con esta conversación.\n`;
        reply += `Enviá el mensaje sin modificarlo, y luego podés hacer el comentario que quieras. 📨`;
        options = ['WhatsApp'];
        session.stage = STATES.ESCALATE;     // marcamos fin del flujo automático
        session.waEligible = true;

      } else if (rxNo.test(t)) {
          session.stepsDone.push('user_says_not_working');
          const triedAdv = (session.stage === STATES.ADVANCED_TESTS);
          const noCount = session.stepsDone.filter(x => x === 'user_says_not_working').length;
          const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
          const advAr = adv.map(arVoseo);
          if (triedAdv || noCount >= 2 || advAr.length === 0) {
            session.stage = STATES.ESCALATE;
            session.waEligible = true;
            reply = 'Entiendo. Te paso con un técnico para ayudarte personalmente. Tocá el botón verde y se enviará un ticket con esta conversación para agilizar la atención.';
            options = ['WhatsApp'];
          } else {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advAr;
            reply = `Entiendo, ${session.userName} 😔\nEntonces vamos a hacer unas **pruebas más avanzadas** para tratar de solucionarlo. 🔍\n\n`;
            advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
            session.waEligible = true
            options = ['Volver a básicas','WhatsApp'];
          }
        } else if (rxAdv.test(t)) {
        // Ir directo a avanzadas sin repetir el discurso
        const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
          const advAr = adv.map(arVoseo);
        if (advAr.length > 0) {
          session.stage = STATES.ADVANCED_TESTS;
          session.tests.advanced = advAr;
          reply  = `Perfecto 👍\n`;
          reply += `Te muestro las **pruebas más avanzadas** para este caso:\n\n`;
          advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
          session.waEligible = true;
          options = ['Volver a básicas','WhatsApp'];
        } else {
          reply = 'No tengo más pasos automáticos para este caso. Te paso con un técnico para seguimiento por WhatsApp.';
          session.waEligible = true; options = ['WhatsApp'];
          session.stage = STATES.ESCALATE;
        }

      // Petición directa de derivación a humano/WhatsApp (atajo)
      } else if (/\b(whatsapp|t[ée]cnico|derivar|persona|humano)\b/i.test(t)) {
        session.waEligible = true;
        reply = '✅ Te preparo un ticket con el historial para WhatsApp.';
        options = ['Enviar a WhatsApp (con ticket)'];

      // Confirmación genérica “ok/dale/listo/probé” → intenta avanzar a avanzadas si corresponde
      } else if (/\b(dale|ok|bueno|joya|b[áa]rbaro|listo|perfecto|prob[ée]|hice)\b/i.test(t)) {
        session.stepsDone.push('user_confirmed_basic');
        if (session.stage === STATES.BASIC_TESTS && ((session.tests.basic || []).length >= 2 || (session.tests.ai || []).length >= 2)) {
          const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
          const advAr = adv.map(arVoseo);
          if (advAr.length > 0) {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advAr;
            reply = `Genial, ${session.userName}. Sigamos con pasos más avanzados 🔧\n\n`;
            advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
            reply += `\n¿Pudiste probar alguno?`;
            session.waEligible = true;
            options = ['Volver a básicas','WhatsApp'];
          } else {
            reply = '👍 Perfecto. Si persiste, te paso con un técnico.';
            session.waEligible = true;
            options = ['WhatsApp'];
          }
        } else {
          reply = '👍 Perfecto. ¿Alguno de esos pasos ayudó?';
          options = ['Pasar a avanzadas','WhatsApp'];
        }

      // Mensaje genérico de loop cuando espera acción del usuario
      } else {
        reply = `Recordá que estamos revisando tu **${session.device || 'equipo'}** por ${issueHuman(session.issueKey)} 🔍\n\n` +
                `¿Probaste los pasos que te sugerí?\n\n` +
                'Decime:\n• **"sí"** si los probaste\n• **"no"** si no funcionaron\n• **"avanzadas"** para ver más pruebas\n• **"ayuda"** para hablar con un técnico';
        options = ['Avanzadas 🔧','WhatsApp'];
      }
    }

    // Persistencia del mensaje del bot
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);

    // Además, guarda en archivo .txt para auditoría
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`);
      fs.appendFileSync(tf,  `[${nowIso()}] ASSISTANT: ${reply}\n`);
    } catch (e) { console.warn('[transcript] no pude escribir:', e.message); }

    // Arma respuesta HTTP (incluye options y flag allowWhatsapp si aplica)
    const response = withOptions({ ok: true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;
    if (session.waEligible) response.allowWhatsapp = true;
    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json(withOptions({ ok: true, reply: '😅 Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// Listar sesiones activas (debug/admin)
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  res.json({ ok: true, count: sessions.length, sessions });
});

// ===== Server =====
const PORT = process.env.PORT || 3001;     // Puerto (Render suele inyectar PORT)
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 [STI Chat V4.8.3-FlowFix] Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📂 Data: ${DATA_BASE}`);
  console.log(`${CHAT?.version ? `📋 Chat config: ${CHAT.version}` : '⚠️  No chat config loaded'}`);
  console.log('='.repeat(60) + '\n');
});
