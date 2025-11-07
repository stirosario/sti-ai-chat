/**
 * server.js V4.8.4 — STI Chat (Redis + Tickets + Transcript)
 * Actualizado: soporte para botones (action: 'button' + value token),
 * registro de botón en transcript y mapeo de tokens a texto para la lógica existente.
 *
 * Este archivo incluye la nueva lógica para:
 * - Responder a "Ayuda paso N" consultando OpenAI (o fallback local)
 * - Mostrar botones: "Lo solucioné" / "No, sigue igual" después de la ayuda
 * - En caso de "No, sigue igual" luego de una ayuda, volver a mostrar los tests básicos que se habían ofrecido
 *
 * Reemplazá tu server.js con este archivo (hacé backup antes).
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

// ===== Persistencia / paths =====
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Ensure directories exist (best-effort)
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* noop */ }
}
const nowIso = () => new Date().toISOString();

// ===== Carga chat JSON =====
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = {};             // Objeto con todo el JSON cargado
let deviceMatchers = [];   // Cache de regex para dispositivos
let issueMatchers  = [];   // Cache de regex para issues

function loadChat() {
  try {
    CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
    console.log('[chat] ✅ Cargado', CHAT.version || '(sin version)', 'desde', CHAT_JSON_PATH);

    deviceMatchers = (CHAT?.nlp?.devices || []).map(d => ({ key: d.key, rx: new RegExp(d.rx, 'i') }));
    issueMatchers  = (CHAT?.nlp?.issues  || []).map(i => ({ key: i.key, rx: new RegExp(i.rx, 'i') }));
  } catch (e) {
    console.error('[chat] ❌ No pude cargar sti-chat.json:', e.message);
    CHAT = {}; deviceMatchers = []; issueMatchers = [];
  }
}
loadChat();

// ===== Helpers de NLP =====
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

// ===== Session store (Redis u otro) =====
// getSession/saveSession/listActiveSessions están abstraídos en sessionStore.js
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== App =====
const app = express();
app.set('trust proxy', 1);

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

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
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
  const m = t.match(/^(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{3,20})$/i);
  if (m) return m[1];
  if (isValidName(t)) return t;
  return null;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = (obj) => ({ options: [], ...obj });

// Voseo
function arVoseo(s) {
  let t = String(s || '').trim();
  const repl = [
    [/\bpresione\b/gi, 'apretá'],
    [/\bpresionar\b/gi, 'apretar'],
    [/\bhaga\b/gi, 'hacé'],
    [/\bhaz\b/gi, 'hacé'],
    [/\bverifique\b/gi, 'verificá'],
    [/\bintente\b/gi, 'probá'],
    [/\bpruebe\b/gi, 'probá'],
    [/\bquiera\b/gi, 'querés'],
    [/\bpuede\b/gi, 'podés'],
    [/\bconecte\b/gi, 'conectá'],
    [/\bdesconecte\b/gi, 'desconectá'],
    [/\bmantenga\b/gi, 'mantené'],
    [/\breinicie\b/gi, 'reiniciá'],
  ];
  for (const [rx, to] of repl) t = t.replace(rx, to);
  return t;
}
const mapVoseoSafe = (arr) => Array.isArray(arr) ? arr.map(arVoseo) : [];

// Normaliza sessionId
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
async function aiQuickTests(problemText = '', device = '') {
  if (!openai) {
    return [
      'Reiniciar la aplicación donde ocurre el problema',
      'Probar en otro documento o programa para ver si persiste',
      'Reiniciar el equipo',
      'Comprobar actualizaciones del sistema y de la aplicación',
      'Verificar si hay conflictos con extensiones o plugins'
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
    return ['Reiniciar la aplicación', 'Probar otra instancia', 'Reiniciar el equipo', 'Comprobar actualizaciones', 'Chequear extensiones/plug-ins'];
  }
}

// ===== Helpers para enumerar pasos y emojis =====
const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function emojiForIndex(i) {
  const n = i + 1;
  return NUM_EMOJIS[n] || `${n}.`;
}
function enumerateSteps(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => `${emojiForIndex(i)} ${s}`);
}

// ===== Help para un paso específico (usa OpenAI si está disponible) =====
async function getHelpForStep(stepText = '', stepIndex = 1, device = '', problem = '') {
  // Si no hay texto, fallback simple
  if (!stepText) return 'No tengo el detalle de ese paso. Probá revisando los pasos que te sugerí anteriormente.';

  if (!openai) {
    // Fallback: explicar el paso con frases simples
    return `Para realizar el paso ${stepIndex}:\n\n${stepText}\n\nConsejos rápidos: realizá los pasos con calma, verificá conexiones y avisame si aparece algún mensaje o error.`;
  }

  const prompt = [
    "Sos técnico informático argentino, claro y amable.",
    `Usuario necesita ayuda para ejecutar un paso concreto de una guía. El paso a explicar es: "${stepText}"`,
    device ? `Equipo: ${device}.` : '',
    problem ? `Problema reportado: ${problem}.` : '',
    "Explicá paso a paso de forma sencilla (3–6 acciones cortas), en español rioplatense (voseo si es posible), orientado a un usuario no técnico.",
    "No uses texto técnico innecesario. Si hay precauciones, indicá las mínimas y cuando derivar a técnico.",
    "Entregá la respuesta en texto plano, sin numeración adicional (puede usar viñetas)."
  ].filter(Boolean).join('\n');

  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 400
    });
    const raw = resp.choices?.[0]?.message?.content?.trim() || '';
    return raw;
  } catch (e) {
    console.error('[getHelpForStep] Error:', e.message);
    return `Para realizar el paso ${stepIndex}: ${stepText}\n\nSi necesitás más ayuda avisame y lo vemos juntos.`;
  }
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
    version: CHAT?.version || '4.8.4',
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

// WhatsApp ticket: genera ticket .txt + link público + URL wa.me con texto prellenado
app.post('/api/whatsapp-ticket', async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    let transcript = history;
    const sid = sessionId || req.sessionId;

    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }

    // Generar ticketId (fecha y sufijo aleatorio)
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;

    // Formatear fecha/hora en horario Argentina (dd-mm-yyyy hh:mm)
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const datePart = dateFormatter.format(now);               // e.g. "06/11/2025"
    const timePart = timeFormatter.format(now);               // e.g. "04:28"
    const dateNormalized = datePart.replace(/\//g, '-');      // "06-11-2025"
    const generatedLabel = `${dateNormalized} ${timePart} (ART)`;

    // Sanitizar nombre para incluir en título (si llega)
    let safeName = '';
    if (name) {
      safeName = String(name || '')
        .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (safeName) safeName = safeName.toUpperCase();
    }

    // Construir título y líneas del ticket (contenido del .txt)
    // Título incluirá nombre si fue enviado: "STI • Servicio Técnico Inteligente — Ticket TCK-...-NOMBRE"
    const titleLine = safeName ? `STI • Servicio Técnico Inteligente — Ticket ${ticketId}-${safeName}` :
                                 `STI • Servicio Técnico Inteligente — Ticket ${ticketId}`;

    const lines = [];
    lines.push(titleLine);
    lines.push(`Generado: ${generatedLabel}`);
    if (name)   lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sid)    lines.push(`Session: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    for (const m of transcript || []) {
      const who = m.who === 'user' ? 'USER' : 'ASSISTANT';
      lines.push(`[${m.ts || now.toISOString()}] ${who}: ${m.text || ''}`);
    }

    // Guardar archivo con nombre TCK-YYYYMMDD-XXXX.txt (sin el nombre) para mantener compatibilidad de rutas
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');
    console.log(`[ticket] creado: ${ticketPath}`);

    // URLs públicas (no cambian)
    const apiPublicUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/api/ticket/${ticketId}`;
    const publicUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/ticket/${ticketId}`;

    // Construir texto para WhatsApp: incluir título (con nombre si aplica) y fecha formateada
    let waText = CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI 👋. Vengo del chat web. Dejo mi consulta:';
    waText = `${titleLine}\n${waText}\n`;
    waText += `\nGenerado: ${generatedLabel}\n`;
    if (name)   waText += `👤 Cliente: ${name}\n`;
    if (device) waText += `💻 Equipo: ${device}\n`;
    waText += `\n🎫 Ticket: ${ticketId}\n📄 Detalle completo (API): ${apiPublicUrl}\n(Enlace alternativo: ${publicUrl})`;

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
    res.json({ ok: true, ticketId, publicUrl, apiPublicUrl, waUrl });
  } catch (e) {
    console.error('[whatsapp-ticket] ❌', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Página pública del ticket (legacy)
// Ahora: usar la primera línea del .txt como title (si existe) y NO repetirla dentro del <pre>
// Esto evita previews que muestran "STI • STI • ..." (título + primera línea del contenido).
app.get('/ticket/:id', (req, res) => {
  const idRaw = String(req.params.id || '');
  const id = String(idRaw).replace(/[^A-Z0-9-]/gi, '');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  console.log(`[ticket] GET /ticket/${idRaw} -> buscando file: ${file}`);
  if (!fs.existsSync(file)) {
    console.warn(`[ticket] no existe: ${file}`);
    try {
      const files = fs.readdirSync(TICKETS_DIR);
      console.log(`[ticket] lista de ${TICKETS_DIR}:`, files.slice(0,200));
    } catch (e) {
      console.warn('[ticket] error listando TICKETS_DIR:', e.message);
    }
    return res.status(404).send('Ticket no encontrado');
  }

  const contentRaw = fs.readFileSync(file, 'utf8');
  const parts = contentRaw.split('\n');
  // primera línea -> título (si no existe usamos fallback)
  const titleFromFile = (parts[0] && parts[0].trim()) ? parts[0].trim() : `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  // el resto del contenido (sin la primera línea) para mostrar en <pre>
  const rest = parts.slice(1).join('\n').trim();

  const title = titleFromFile;
  const desc = (rest.split('\n').slice(0, 8).join(' ') || '').slice(0, 200);
  const url  = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/ticket/${id}`;
  const logo = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/logo.png`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${logo}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${logo}">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px;background:#f5f5f5}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto}
h1{font-size:20px;margin:0 0 6px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p><a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a></p>
<pre>${escapeHtml(rest)}</pre>
</body></html>`);
});

// Página pública del ticket (API path — alternativa robusta)
app.get('/api/ticket/:id', (req, res) => {
  const idRaw = String(req.params.id || '');
  const id = String(idRaw).replace(/[^A-Z0-9-]/gi, '');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  console.log(`[ticket-api] GET /api/ticket/${idRaw} -> buscando file: ${file}`);
  if (!fs.existsSync(file)) {
    console.warn(`[ticket-api] no existe: ${file}`);
    try {
      const files = fs.readdirSync(TICKETS_DIR);
      console.log(`[ticket-api] lista de ${TICKETS_DIR}:`, files.slice(0,200));
    } catch (e) {
      console.warn('[ticket-api] error listando TICKETS_DIR:', e.message);
    }
    return res.status(404).json({ ok: false, error: 'Ticket no encontrado', id });
  }

  const contentRaw = fs.readFileSync(file, 'utf8');
  const parts = contentRaw.split('\n');
  const titleFromFile = (parts[0] && parts[0].trim()) ? parts[0].trim() : `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  const rest = parts.slice(1).join('\n').trim();

  const title = titleFromFile;
  const desc = (rest.split('\n').slice(0, 8).join(' ') || '').slice(0, 200);
  const url  = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/api/ticket/${id}`;
  const logo = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/logo.png`;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${logo}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${logo}">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px;background:#f5f5f5}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto}
h1{font-size:20px;margin:0 0 6px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p><a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a></p>
<pre>${escapeHtml(rest)}</pre>
</body></html>`);
});

// Reset de sesión
app.post('/api/reset', async (req, res) => {
  const sid = req.sessionId;
  const empty = {
    id: sid, userName: null, stage: STATES.ASK_NAME,
    device:null, problem:null, issueKey:null,
    tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
    fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null,
    lastHelpStep: null
  };
  await saveSession(sid, empty);
  res.json({ ok: true });
});

// Greeting con reinicio forzado
app.all('/api/greeting', async (req, res) => {
  try {
    const sid = req.sessionId;
    const fresh = {
      id: sid, userName: null, stage: STATES.ASK_NAME,
      device: null, problem: null, issueKey: null,
      tests: { basic: [], advanced: [], ai: [] },
      stepsDone: [],
      fallbackCount: 0,
      waEligible: false,
      transcript: [],
      pendingUtterance: null,
      lastHelpStep: null
    };

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

// ===== Chat principal =====
app.post('/api/chat', async (req, res) => {
  try {
    // --- nuevo: soportar botones (action: 'button') ---
    const body = req.body || {};
    // map tokens a texto procesable
    const tokenMap = {
      'BTN_BASIC_YES': 'sí',
      'BTN_BASIC_NO' : 'no',
      // Avanzadas y WhatsApp en primera instancia están removidos / no mostrados
      'BTN_DEVICE_PC': 'pc',
      'BTN_DEVICE_NOTEBOOK': 'notebook',
      'BTN_DEVICE_MONITOR': 'monitor',
      'BTN_DEVICE_TECLADO': 'teclado',
      'BTN_DEVICE_MOUSE': 'mouse',
      'BTN_OTHER': '' // frontend deberá abrir input libre
    };

    let incomingText = String(body.text || '').trim();
    let buttonToken = null;
    let buttonLabel = null;
    if (body.action === 'button' && body.value) {
      buttonToken = String(body.value);
      if (tokenMap[buttonToken] !== undefined) {
        incomingText = tokenMap[buttonToken];
      } else if (buttonToken.startsWith('BTN_HELP_')) {
        const slug = buttonToken.slice('BTN_HELP_'.length).replace(/_/g, ' ');
        incomingText = `ayuda ${slug}`;
      } else {
        incomingText = buttonToken; // fallback
      }
      buttonLabel = body.label || ( () => {
        try {
          const btns = CHAT?.ui?.buttons;
          if (!btns) return buttonToken;
          for (const listName of Object.keys(btns)) {
            const found = (btns[listName] || []).find(b => b.value === buttonToken);
            if (found) return found.label;
          }
        } catch (e) {}
        return buttonToken;
      })();
    }
    const t = String(incomingText || '').trim();

    const sid = req.sessionId;

    let session = await getSession(sid);
    if (!session) {
      session = {
        id: sid, userName: null, stage: STATES.ASK_NAME,
        device:null, problem:null, issueKey:null,
        tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
        fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null,
        lastHelpStep: null
      };
      console.log(`[api/chat] ✨ Nueva sesión: ${sid}`);
    }

    // Registrar en transcript la entrada del usuario.
    if (buttonToken) {
      session.transcript.push({ who: 'user', text: `[BOTON] ${buttonLabel || buttonToken} (${buttonToken})`, ts: nowIso() });
    } else {
      session.transcript.push({ who: 'user', text: t, ts: nowIso() });
    }

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

    // Interceptar "ayuda paso N" antes de otros flujos
    const helpMatch = String(t || '').match(/\bayuda\b(?:\s*(?:paso)?\s*)?(\d+)/i);
    if (helpMatch) {
      const idx = Math.max(1, Number(helpMatch[1] || 1));
      // Preferir tests.basic, sino tests.ai
      const sourceType = (Array.isArray(session.tests.basic) && session.tests.basic.length > 0) ? 'basic'
                       : (Array.isArray(session.tests.ai) && session.tests.ai.length > 0) ? 'ai'
                       : null;

      if (sourceType) {
        const list = session.tests[sourceType] || [];
        const stepText = list[idx - 1] || null;

        // Guardar lastHelpStep para usarlo si el usuario responde "No"
        session.lastHelpStep = { type: sourceType, index: idx };

        let helpContent;
        try {
          helpContent = await getHelpForStep(stepText, idx, session.device || '', session.problem || '');
        } catch (e) {
          console.error('[help] getHelpForStep error', e.message);
          helpContent = `Para el paso ${idx}: ${stepText}\n\nSi necesitás más detalles decímelo.`;
        }

        const reply = `Ayuda para realizar el paso ${idx}:\n\n${helpContent}\n\n` +
                      `¿Te sirvió esta ayuda?\n\n` +
                      `Lo solucioné ✅  —  No, sigue igual ❌`;

        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);

        try {
          const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
          fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT (help): Paso ${idx}\n`);
          fs.appendFileSync(tf, `${helpContent}\n\n`);
        } catch (e) {
          console.error('[transcript write] error:', e.message);
        }

        // Opciones: botones de confirmación (frontend puede mapear a tokens)
        const options = ['Lo solucioné ✅', 'No, sigue igual ❌'];
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
      } else {
        // No hay pasos guardados aun
        const reply = 'No tengo los pasos guardados para ese número. Probá con los pasos que te ofrecí anteriormente o contame más del problema.';
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
      }
    }

    let reply = ''; let options = [];

    // 1) ASK_NAME
    if (session.stage === STATES.ASK_NAME) {
      if (problemHint.test(t) && !extractName(t)) session.pendingUtterance = t;

      const name = extractName(t);
      if (/^omitir$/i.test(t)) {
        session.userName = session.userName || 'usuario';
      } else if (!session.userName && name) {
        session.userName = cap(name);
      }

      if (!session.userName) {
        reply = CHAT?.messages_v4?.greeting?.name_request || '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas")';
      } else {
        session.stage = STATES.ASK_PROBLEM;
        if (session.pendingUtterance) {
          session.problem = session.pendingUtterance;
          session.pendingUtterance = null;
          session.stage = STATES.ASK_DEVICE;
          options = ['PC','Notebook','Teclado','Mouse','Monitor','Internet / Wi-Fi'];
          reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa?`;
        } else {
          reply = CHAT?.messages_v4?.greeting?.name_confirm?.replace('{NOMBRE}', session.userName) || `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
        }
      }

      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json({ ok: true, reply, stage: session.stage, options });
    }

    // 2) ASK_PROBLEM
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
          console.log(`[diag] after OA - device=${device} issueKey=${issueKey} confidence=${confidence}`);
        }

        const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length > 0);
        console.log(`[diag] hasConfiguredSteps=${hasConfiguredSteps}`);

        // Corrección clave: sólo avanzamos a BASIC_TESTS si confianza >= umbral
        // y (detectamos device OR hay pasos configurados para el issue)
        if (confidence >= OA_MIN_CONF && (device || hasConfiguredSteps)) {
          session.device   = session.device || device || 'equipo';
          session.issueKey = issueKey || session.issueKey || null;
          session.stage    = STATES.BASIC_TESTS;

          const key = session.issueKey || null;
          const stepsSrc = key ? CHAT?.nlp?.advanced_steps?.[key] : null;
          let steps;
          if (Array.isArray(stepsSrc) && stepsSrc.length > 0) {
            steps = stepsSrc.slice(0, 4);
          } else {
            let aiSteps = [];
            try { aiSteps = await aiQuickTests(session.problem || '', session.device || ''); } catch (e) { /* noop */ }
            if (Array.isArray(aiSteps) && aiSteps.length > 0) steps = aiSteps.slice(0, 4);
            else steps = [
              'Reiniciar la aplicación donde ocurre el problema',
              'Probar en otro documento o programa para ver si persiste',
              'Reiniciar el equipo',
              'Comprobar actualizaciones del sistema y de la aplicación'
            ];
          }

          const stepsAr = mapVoseoSafe(steps);            // plain steps
          const numbered = enumerateSteps(stepsAr);       // numbered strings for display

          const intro = `Entiendo, ${session.userName}. Probemos esto primero:`;
          // FOOTER: actualizados según pedido del usuario
          const footer = CHAT?.messages_v4?.basic_footer ? CHAT.messages_v4.basic_footer.join('\n') : [
            '',
            '🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.',
            '',
            '🤔 Contanos cómo te fue utilizando los botones:'
          ].join('\n');

          session.tests.basic = stepsAr;
          session.stepsDone.push('basic_tests_shown');
          // Quitar boton verde whatsapp en primera instancia -> don't mark waEligible yet
          session.waEligible = false;
          session.lastHelpStep = null;

          const fullMsg = intro + '\n\n' + numbered.join('\n') + '\n\n' + footer;

          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);

          try {
            const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
            fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${intro}\n`);
            numbered.forEach(s => fs.appendFileSync(tf, ` - ${s}\n`));
            fs.appendFileSync(tf, `\n${footer}\n`);
          } catch (e) {
            console.error('[transcript write] error:', e.message);
          }

          // Build options: numbered help buttons for each step + solved/not solved
          const helpOptions = stepsAr.map((_, i) => `${emojiForIndex(i)} Ayuda paso ${i + 1}`);
          const defaultOptions = [
            ...helpOptions,
            'Lo solucioné ✅',
            'No, sigue igual ❌'
          ];

          return res.json({
            ok: true,
            reply: fullMsg,
            steps,
            stepsType: 'basic',
            options: defaultOptions,
            stage: session.stage,
            allowWhatsapp: false
          });
        }

        // Si hay issueKey pero NO pasos configurados y NO device -> pedir device
        if (confidence >= OA_MIN_CONF && issueKey && !hasConfiguredSteps && !device) {
          session.stage = STATES.ASK_DEVICE;
          const msg = `Gracias. Parece que el problema es: ${issueHuman(issueKey)}.\n\n¿En qué equipo te pasa (PC, notebook, etc.) para darte pasos más precisos?`;
          await saveSession(sid, session);
          return res.json({ ok: true, reply: msg, options: (CHAT?.ui?.buttons?.ask_device || ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi']) });
        }

        // Si no hay confianza suficiente -> pedir device
        session.stage = STATES.ASK_DEVICE;
        const msg = `Enseguida te ayudo con ese problema 🔍\n\n` +
                    `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n` +
                    `¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
        await saveSession(sid, session);
        return res.json({ ok: true, reply: msg, options: (CHAT?.ui?.buttons?.ask_device || ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi']) });

      } catch (err) {
        console.error('diagnóstico ASK_PROBLEM:', err);
        return res.json({ ok: true, reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo en un momento.' });
      }
    }

    // 3) ASK_DEVICE
    else if (session.stage === STATES.ASK_DEVICE || !session.device) {
      const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();
      if (dev && dev.length >= 2) {
        session.device = dev;

        const issueKey = detectIssue(`${session.problem || ''} ${t}`.trim());
        if (issueKey) {
          session.issueKey = issueKey;
          session.stage    = STATES.BASIC_TESTS;
          const pasosSrc = CHAT?.nlp?.advanced_steps?.[issueKey];
          const pasos = Array.isArray(pasosSrc) ? pasosSrc : [
            'Reiniciar el equipo',
            'Verificar conexiones físicas',
            'Probar en modo seguro',
          ];
          const pasosAr = mapVoseoSafe(pasos);
          const numbered = enumerateSteps(pasosAr);

          reply  = `Entiendo, ${session.userName}. Tu ${session.device} tiene el problema: ${issueHuman(issueKey)} 🔍\n\n`;
          reply += `🔧 Pasos básicos:\n\n`;
          numbered.slice(0, 3).forEach((p) => { reply += `${p}\n`; });

          reply += `\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n`;
          reply += `\n🤔 Contanos cómo te fue utilizando los botones:\n`;

          session.tests.basic = pasosAr.slice(0, 3);
          session.stepsDone.push('basic_tests_shown');
          // don't enable whatsapp yet in this first moment
          session.waEligible = false;
          session.lastHelpStep = null;

          // build options: numbered help for each shown step + solved/not solved
          const helpOptions = session.tests.basic.map((_, i) => `${emojiForIndex(i)} Ayuda paso ${i + 1}`);
          options = [
            ...helpOptions,
            'Lo solucioné ✅',
            'No, sigue igual ❌'
          ];
        } else {
          session.stage = STATES.BASIC_TESTS_AI;
          try {
            const ai = await aiQuickTests(session.problem || '', session.device || '');
            if (ai.length) {
              const aiAr = mapVoseoSafe(ai);
              const numbered = enumerateSteps(aiAr);
              reply  = `Entiendo, ${session.userName}. Probemos esto rápido 🔍\n\n`;
              reply += `🔧 Pasos iniciales:\n\n`;
              aiAr.forEach((s, i) => reply += `${emojiForIndex(i)} ${s}\n`);

              reply += `\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n`;
              reply += `\n🤔 Contanos cómo te fue utilizando los botones:\n`;

              session.tests.ai = aiAr;
              session.stepsDone.push('ai_basic_shown');
              session.waEligible = false;
              session.lastHelpStep = null;

              const helpOptions = aiAr.map((_, i) => `${emojiForIndex(i)} Ayuda paso ${i + 1}`);
              options = [
                ...helpOptions,
                'Lo solucioné ✅',
                'No, sigue igual ❌'
              ];
            } else {
              reply = `Perfecto, ${session.userName}. Anotado: **${session.device}** 📝\n\nContame un poco más del problema.`;
            }
          } catch (e) {
            console.error('[aiQuickTests] ❌', e.message);
            reply = 'No pude generar sugerencias ahora 😅. Contame un poco más del problema.';
          }
        }
      } else {
        reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
        options = (CHAT?.ui?.buttons?.ask_device || ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi']);
      }
    }

    // 4) Estados de pruebas y escalación
    else {
      const rxYes = /\b(s[ií]|sí se solucion[oó]|se solucion[oó]|funcion[oó]|ya anda|listo funcion[oó])\b/i;
      const rxNo  = /\b(no|todav[ií]a no|no funcion[oó]|sigue igual|no cambi[oó]|tampoco)\b/i;
      const rxAdv = /\b(avanzadas?|m[aá]s pruebas|pruebas t[eé]cnicas|continuar|seguir)\b/i;

      if (rxYes.test(t)) {
        reply  = `¡Excelente, ${session.userName}! 🙌\n`;
        reply += `Me alegra que se haya solucionado 💪\n`;
        reply += `Si vuelve a ocurrir o necesitás revisar otro equipo, podés contactarnos nuevamente cuando quieras.\n\n`;
        reply += `¡Gracias por confiar en STI! ⚡\n\n`;
        reply += `Si querés hacerle algún comentario al cuerpo técnico, tocá el botón para enviar un ticket por WhatsApp con esta conversación.\n`;
        options = ['Enviar ticket por WhatsApp'];
        session.stage = STATES.ESCALATE;
        session.waEligible = true;
        session.lastHelpStep = null;

      } else if (rxNo.test(t)) {
        // Si venimos de una ayuda puntual, re-mostramos los tests ofrecidos (no pasar a avanzadas de inmediato)
        if (session.lastHelpStep && (session.lastHelpStep.type === 'basic' || session.lastHelpStep.type === 'ai')) {
          const src = session.lastHelpStep.type;
          const list = session.tests[src] && session.tests[src].length ? session.tests[src] : session.tests.basic;
          const numbered = enumerateSteps(list || []);
          reply = `Entiendo. Volvamos a los pasos que te ofrecí:\n\n` + numbered.join('\n') + `\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en numero de opcion.\n\n🤔 Contanos cómo te fue utilizando los botones:`;
          const helpOptions = (list || []).map((_, i) => `${emojiForIndex(i)} Ayuda paso ${i + 1}`);
          options = [
            ...helpOptions,
            'Lo solucioné ✅',
            'No, sigue igual ❌'
          ];
          session.lastHelpStep = null;
          session.waEligible = false;
          // no avanzamos a pruebas avanzadas por ahora
          session.stage = session.stage || STATES.BASIC_TESTS;
        } else {
          // comportamiento anterior cuando NO viene de ayuda puntual
          session.stepsDone.push('user_says_not_working');
          const triedAdv = (session.stage === STATES.ADVANCED_TESTS);
          const noCount = session.stepsDone.filter(x => x === 'user_says_not_working').length;
          const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
          const advAr = mapVoseoSafe(adv);
          if (triedAdv || noCount >= 2 || advAr.length === 0) {
            session.stage = STATES.ESCALATE;
            session.waEligible = true;
            reply = 'Entiendo. Te paso con un técnico para ayudarte personalmente. Tocá el botón y se enviará un ticket con esta conversación para agilizar la atención.';
            options = ['Enviar ticket por WhatsApp'];
            session.lastHelpStep = null;
          } else {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advAr;
            reply = `Entiendo, ${session.userName} 😔\nEntonces vamos a hacer unas pruebas más avanzadas para tratar de solucionarlo. 🔍\n\n`;
            advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
            session.waEligible = true;
            options = ['Volver a básicas','Enviar ticket por WhatsApp'];
            session.lastHelpStep = null;
          }
        }
      } else if (rxAdv.test(t)) {
        const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
        const advAr = mapVoseoSafe(adv);
        if (advAr.length > 0) {
          session.stage = STATES.ADVANCED_TESTS;
          session.tests.advanced = advAr;
          reply  = `Perfecto 👍\n`;
          reply += `Te muestro las pruebas más avanzadas para este caso:\n\n`;
          advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
          session.waEligible = true;
          options = ['Volver a básicas','Enviar ticket por WhatsApp'];
          session.lastHelpStep = null;
        } else {
          reply = 'No tengo más pasos automáticos para este caso. Te paso con un técnico para seguimiento por WhatsApp.';
          session.waEligible = true; options = ['Enviar ticket por WhatsApp'];
          session.stage = STATES.ESCALATE;
          session.lastHelpStep = null;
        }
      } else if (/\b(whatsapp|t[ée]cnico|derivar|persona|humano)\b/i.test(t)) {
        session.waEligible = true;
        reply = '✅ Te preparo un ticket con el historial para WhatsApp.';
        options = ['Enviar ticket por WhatsApp'];
        session.lastHelpStep = null;
      } else if (/\b(dale|ok|bueno|joya|b[áa]rbaro|listo|perfecto|prob[ée]|hice)\b/i.test(t)) {
        session.stepsDone.push('user_confirmed_basic');
        if (session.stage === STATES.BASIC_TESTS && ((session.tests.basic || []).length >= 2 || (session.tests.ai || []).length >= 2)) {
          const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
          const advAr = mapVoseoSafe(adv);
          if (advAr.length > 0) {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advAr;
            reply = `Genial, ${session.userName}. Sigamos con pasos más avanzados 🔧\n\n`;
            advAr.forEach((p, i) => reply += `${i + 1}. ${p}\n`);
            reply += `\n¿Pudiste probar alguno?`;
            session.waEligible = true;
            options = ['Volver a básicas','Enviar ticket por WhatsApp'];
            session.lastHelpStep = null;
          } else {
            reply = '👍 Perfecto. Si persiste, te paso con un técnico.';
            session.waEligible = true;
            options = ['Enviar ticket por WhatsApp'];
            session.lastHelpStep = null;
          }
        } else {
          reply = '👍 Perfecto. ¿Alguno de esos pasos ayudó?';
          options = ['Pasar a avanzadas','Enviar ticket por WhatsApp'];
          session.lastHelpStep = null;
        }
      } else {
        reply = `Recordá que estamos revisando tu ${session.device || 'equipo'} por ${issueHuman(session.issueKey)} 🔍\n\n` +
                `¿Probaste los pasos que te sugerí?\n\n` +
                '🤔 Contanos cómo te fue utilizando los botones:\n';
        options = ['Volver a básicas','Enviar ticket por WhatsApp'];
      }
    }

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);

    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${buttonToken ? `[BOTON] ${buttonLabel || buttonToken}` : t}\n`);
      fs.appendFileSync(tf,  `[${nowIso()}] ASSISTANT: ${reply}\n`);
    } catch (e) { console.warn('[transcript] no pude escribir:', e.message); }

    const response = withOptions({ ok: true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;
    if (session.waEligible) response.allowWhatsapp = true;
    // Also include available ui buttons (frontend can use these to render tokens)
    if (CHAT?.ui) response.ui = CHAT.ui;
    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json(withOptions({ ok: true, reply: '😅 Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// Listar sesiones activas
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  res.json({ ok: true, count: sessions.length, sessions });
});

// ===== utils =====
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}

// ===== Server =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 [STI Chat V4.8.4] Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📂 Data: ${DATA_BASE}`);
  console.log(`${CHAT?.version ? `📋 Chat config: ${CHAT.version}` : '⚠️  No chat config loaded'}`);
  console.log('='.repeat(60) + '\n');
});