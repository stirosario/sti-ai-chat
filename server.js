// server.js V4.7 — STI Chat (Redis + Tickets + Transcript) + NameFix + CORS headers
// - Estados claros: ASK_NAME → ASK_PROBLEM → ASK_DEVICE → BASIC/ADVANCED/ESCALATE
// - Nombre persistente + pendingUtterance (si usuario describe el problema antes del nombre)
// - CORS permite 'x-session-id' para mantener misma sesión entre requests
// - Opcional: OpenAI para pasos rápidos (JSON-like); fallback local si no hay API key
// - Endpoints: /api/health, /api/reload, /api/greeting, /api/chat,
//              /api/transcript/:sid, /api/whatsapp-ticket, /ticket/:id, /api/sessions

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ====== OpenAI (opcional) ======
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ====== Persistencia / paths ======
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}

const nowIso = () => new Date().toISOString();

// ====== Carga chat JSON (dispositivos/issues/plantillas) ======
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
    CHAT = {};
    deviceMatchers = [];
    issueMatchers  = [];
  }
}
loadChat();

const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';
function detectDevice(txt = '') {
  for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key;
  return null;
}
function detectIssue(txt = '') {
  for (const i of issueMatchers) if (i.rx.test(txt)) return i.key;
  return null;
}
function tplDefault({ nombre = '', device = 'equipo', issueKey = null }) {
  const base = CHAT?.nlp?.response_templates?.default ||
    'Entiendo, {{nombre}}. Revisemos tu {{device}} con {{issue_human}}.';
  return base
    .replace('{{nombre}}', nombre || '')
    .replace('{{device}}', device || 'equipo')
    .replace('{{issue_human}}', issueHuman(issueKey));
}

// ====== Store de sesiones (Redis u otro) ======
import {
  getSession,
  saveSession,
  listActiveSessions,
} from './sessionStore.js';

// ====== App ======
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true, allowedHeaders: ['Content-Type','x-session-id'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ====== Estados / helpers ======
const STATES = {
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  ASK_DEVICE: 'ask_device',
  BASIC_TESTS: 'basic_tests',
  BASIC_TESTS_AI: 'basic_tests_ai',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
};

const TECH_WORDS = /^(pc|notebook|netbook|laptop|ultrabook|macbook|monitor|pantalla|televisor|tv|teclado|mouse|raton|touchpad|trackpad|impresora|printer|scanner|escaner|plotter|fax|router|modem|switch|hub|repetidor|accesspoint|servidor|server|cpu|gabinete|fuente|mother|motherboard|placa|placa madre|gpu|video|grafica|ram|memoria|disco|ssd|hdd|pendrive|usb|auricular|auriculares|headset|microfono|camara|webcam|notch|altavoz|parlante|bocina|red|ethernet|wifi|wi-?fi|bluetooth|internet|nube|cloud|telefono|celular|movil|smartphone|tablet|ipad|android|iphone|ios|windows|linux|macos|problema|error|fallo|bug|reparacion|tecnico|compu|computadora|equipo|hardware|software|programa|sistema)$/i;

const problemHint = /(no (prende|enciende|arranca|funciona|anda|enciende|enciende bien|conecta|detecta|reconoce|responde|da señal|muestra imagen|carga|enciende la pantalla)|no (da|tiene) (video|imagen|sonido|internet|conexion|red|wifi|señal)|no inicia|no arranca|no anda|no funca|lento|va lento|se tilda|se cuelga|se congela|pantalla (negra|azul|blanca|con rayas)|sin imagen|sin sonido|sin señal|se apaga|se reinicia|se reinicia solo|no carga|no enciende|no muestra nada|hace ruido|no hace nada|tiene olor|saca humo|parpadea|no detecta|no reconoce|no conecta|problema|error|fallo|falla|bug|no abre|no responde|bloqueado|traba|lag|pérdida de conexion|sin internet|sin wi[- ]?fi|no se escucha|no se ve|no imprime|no escanea|sin color|no gira|no arranca el ventilador)/i;


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

// Normalizar sessionId para todos los endpoints
function getSessionId(req) {
  const raw = (
    (req.body && (req.body.sessionId || req.body.sid)) ||
    (req.query && (req.query.sessionId || req.query.sid)) ||
    req.headers['x-session-id'] ||
    ''
  ).toString().trim();
  return raw || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req, _res, next) => { req.sessionId = getSessionId(req); next(); });

// ====== OpenAI quick tests (opcional) ======
async function aiQuickTests(problemText = '', device = '') {
  if (!openai) {
    return [
      'Verificar conexión eléctrica',
      'Probar con otro cable o toma corriente',
      'Mantener presionado el botón de encendido 10 segundos',
      'Conectar el equipo directamente sin estabilizador',
      'Revisar si el LED de encendido parpadea o no',
    ];
  }
  const prompt = [
    `Sos técnico informático argentino, claro y amable.`,
    `Problema: "${problemText}"${device ? ` en ${device}` : ''}.`,
    `Indicá 4–5 pasos simples y seguros para probar.`,
    `Solo devolvé un array JSON de strings (sin texto fuera del JSON).`
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
    return [
      'Verificar cable de corriente y fuente',
      'Probar en otro tomacorriente',
      'Mantener pulsado el botón de encendido 10 seg',
      'Probar con otra fuente o cable de energía',
      'Comprobar si hay luces o sonidos al intentar encender',
    ];
  }
}

// ====== Endpoints ======

// Health
app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openaiReady: !!openai,
    openaiModel: OPENAI_MODEL || null,
    usingNewFlows: true,
    version: CHAT?.version || '4.7.0',
    paths: { data: DATA_BASE, transcripts: TRANSCRIPTS_DIR, tickets: TICKETS_DIR }
  });
});

// Reload chat config
app.post('/api/reload', (_req, res) => {
  try { loadChat(); res.json({ ok: true, version: CHAT.version }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Transcript
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
    if (transcript.length === 0 && sid) {
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
<pre>${content.replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s]))}</pre>
</body></html>`);
});

// Greeting — arranque pidiendo nombre
app.post('/api/greeting', async (req, res) => {
  try {
    const sessionId = req.sessionId;
    let session = await getSession(sessionId);
    if (!session) {
      session = {
        id: sessionId,
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
        pendingUtterance: null,
      };
    } else {
      // siempre dejamos en ASK_NAME si recién inicia el chat
      session.stage = STATES.ASK_NAME;
    }

    const text = CHAT?.messages_v4?.greeting?.name_request
      || '👋 ¡Hola! Soy Tecnos 🤖 de STI. ¿Cómo te llamás? (o escribí "omitir")';

    session.transcript.push({ who: 'bot', text, ts: nowIso() });
    await saveSession(sessionId, session);

    return res.json({ ok: true, reply: text, options: [] });
  } catch (e) {
    console.error('[api/greeting] error:', e);
    return res.json({ ok: true, reply: '👋 ¡Hola! Soy Tecnos 🤖 de STI. ¿Cómo te llamás?', options: [] });
  }
});

// Chat principal — tramo nombre/problema/equipo corregido
app.post('/api/chat', async (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const t = String(text).trim();
    const sessionId = req.sessionId;

    // 1) Cargar o crear sesión
    let session = await getSession(sessionId);
    if (!session) {
      session = {
        id: sessionId,
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
        pendingUtterance: null,
      };
      console.log(`[api/chat] ✨ Nueva sesión: ${sessionId}`);
    }

    // 2) Log usuario
    session.transcript.push({ who: 'user', text: t, ts: nowIso() });

    let reply = '';
    let options = [];

    // ====== ETAPA 1 — Pedimos nombre
    if (session.stage === STATES.ASK_NAME) {
      // si tiró problema aquí, lo cacheamos
      if (problemHint.test(t) && !extractName(t)) session.pendingUtterance = t;

      const name = extractName(t);
      if (/^omitir$/i.test(t)) {
        session.userName = session.userName || 'usuario';
      } else if (!session.userName && name) {
        session.userName = cap(name);
      }

      if (!session.userName) {
        reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas" o escribí "omitir")';
        options = [];
      } else {
        // al tener nombre, avanzamos a problema
        session.stage = STATES.ASK_PROBLEM;

        if (session.pendingUtterance) {
          // Si ya había contado el problema, lo anotamos y saltamos a equipo
          session.problem = session.pendingUtterance;
          session.pendingUtterance = null;
          session.stage = STATES.ASK_DEVICE;
          options = ['PC', 'Notebook', 'Teclado', 'Mouse', 'Monitor', 'Internet / Wi-Fi'];
          reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa?`;
        } else {
          reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
          options = [];
        }
      }
    }

    // ====== ETAPA 2 — Pedimos problema
    else if (session.stage === STATES.ASK_PROBLEM) {
      session.problem = t || session.problem;
      session.stage   = STATES.ASK_DEVICE;
      options = ['PC', 'Notebook', 'Teclado', 'Mouse', 'Monitor', 'Internet / Wi-Fi'];
      reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa? (Ej.: PC, notebook, teclado, etc.)`;
    }

    // ====== ETAPA 3 — Pedimos equipo y derivamos a tests
    else if (session.stage === STATES.ASK_DEVICE || !session.device) {
      const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();
      if (dev && dev.length >= 2) {
        session.device = dev;

        // Intentar deducir issue
        const issueKey = detectIssue(`${session.problem || ''} ${t}`.trim());
        if (issueKey) {
          session.issueKey = issueKey;
          session.stage    = STATES.BASIC_TESTS;

          const pasos = CHAT?.nlp?.advanced_steps?.[issueKey] || [
            'Reiniciar el equipo',
            'Verificar conexiones físicas',
            'Probar en modo seguro',
          ];
          reply  = `Entiendo, ${session.userName}. Tu **${session.device}** tiene problema: ${issueHuman(issueKey)} 🔍\n\n`;
          reply += `🔧 **Probá estos pasos básicos:**\n\n`;
          pasos.slice(0, 3).forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });
          reply += `\n¿Pudiste hacer alguno de estos pasos?`;
          session.tests.basic = pasos.slice(0, 3);
          session.stepsDone.push('basic_tests_shown');
          options = ['Listo, probé eso', 'Pasar a pruebas avanzadas', 'Quiero hablar por WhatsApp'];
          session.waEligible = true;
        } else {
          // sin issue detectable → AI quick tests o pedir más detalle
          session.stage = STATES.BASIC_TESTS_AI;
          try {
            const aiSteps = await aiQuickTests(session.problem || '', session.device || '');
            if (aiSteps.length) {
              reply  = `Entiendo, ${session.userName}. Veamos si podemos solucionarlo rápido 🔍\n\n`;
              reply += `🔧 **Probá estos pasos iniciales:**\n\n`;
              aiSteps.forEach(s => { reply += `• ${s}\n`; });
              reply += `\n¿Pudiste probar alguno?`;
              session.tests.ai = aiSteps;
              session.stepsDone.push('ai_basic_shown');
              session.waEligible = true;
              options = ['Sí, funcionó ✅', 'No, sigue igual ❌', 'Enviar a WhatsApp (con ticket)'];
            } else {
              reply = `Perfecto, ${session.userName}. Anotado: **${session.device}** 📝\n\nContame brevemente: ¿qué problema tiene?`;
            }
          } catch (e) {
            console.error('[aiQuickTests] ❌ Error:', e.message);
            reply = 'No pude generar sugerencias automáticas ahora 😅. Contame un poco más del problema para ayudarte mejor.';
          }
        }
      } else {
        reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
        options = ['PC', 'Notebook', 'Monitor', 'Teclado', 'Mouse', 'Internet / Wi-Fi'];
      }
    }

    // ====== ETAPA 4 — Tests y escalación
    else {
      if (/\b(whatsapp|técnico|tecnico|ayuda directa|derivar|persona|humano)\b/i.test(t)) {
        session.waEligible = true;
        reply = '✅ Perfecto. Te preparo un ticket con todo el historial para enviarlo por WhatsApp.';
        options = ['Enviar a WhatsApp (con ticket)'];
      } else if (/\b(dale|ok|sí|si|bueno|joya|bárbaro|listo|perfecto|probé|hice)\b/i.test(t)) {
        session.stepsDone.push('user_confirmed_basic');
        if (session.stage === STATES.BASIC_TESTS && session.tests.basic.length >= 2) {
          const advSteps = CHAT?.nlp?.advanced_steps?.[session.issueKey] || [];
          const advanced = advSteps.slice(3, 6);
          if (advanced.length > 0) {
            session.stage = STATES.ADVANCED_TESTS;
            session.tests.advanced = advanced;
            reply = `Genial, ${session.userName}. Sigamos con pasos más avanzados 🔧\n\n`;
            advanced.forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });
            reply += `\n¿Pudiste probar alguno?`;
            session.waEligible = true;
            options = ['Volver a básicas', 'WhatsApp'];
          } else {
            reply = '👍 Perfecto. Si el problema persiste, te paso con un técnico.';
            session.waEligible = true;
            options = ['Enviar a WhatsApp (con ticket)'];
          }
        } else {
          reply = '👍 Perfecto. ¿Alguno de esos pasos ayudó a resolver el problema?';
          options = ['Pasar a avanzadas', 'WhatsApp'];
        }
      } else if (/\b(no|nada|sigue igual|no cambió|no sirve|no resolvió|tampoco)\b/i.test(t)) {
        session.stepsDone.push('user_says_not_working');
        if (session.stage === STATES.BASIC_TESTS) {
          reply = '😔 Entiendo que los pasos básicos no ayudaron.\n\nProbemos pasos más técnicos 🔧';
          session.stage = STATES.ADVANCED_TESTS;
          const advSteps = CHAT?.nlp?.advanced_steps?.[session.issueKey] || [];
          const advanced = advSteps.slice(3, 6);
          session.tests.advanced = advanced;
          if (advanced.length > 0) {
            reply += '\n\n**Pasos avanzados:**\n\n';
            advanced.forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });
            session.waEligible = true;
            options = ['Volver a básicas', 'WhatsApp'];
          } else {
            reply += '\n\nTe paso con un técnico que te va a ayudar personalmente.';
            session.waEligible = true;
            options = ['Enviar a WhatsApp (con ticket)'];
          }
        } else {
          reply = '😔 Entiendo. Entonces te paso con un técnico que te va a ayudar personalmente.';
          session.waEligible = true;
          options = ['Enviar a WhatsApp (con ticket)'];
        }
      } else {
        reply = `Recordá que estamos revisando tu **${session.device || 'equipo'}** por ${issueHuman(session.issueKey)} 🔍\n\n` +
                `¿Probaste los pasos que te sugerí?\n\n` +
                'Decime:\n' +
                '• **"sí"** si los probaste\n' +
                '• **"no"** si no funcionaron\n' +
                '• **"ayuda"** si querés hablar con un técnico';
        options = ['Pasar a avanzadas', 'WhatsApp'];
      }
    }

    // 3) Log bot y persistir
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sessionId, session);

    // 4) Backup transcript en disco (append)
    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`, 'utf8');
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`, 'utf8');
    } catch (e) {
      console.warn('[transcript] no pude escribir el archivo:', e.message);
    }

    // 5) Respuesta uniforme (con depuración útil)
    const response = withOptions({ ok: true, reply, sid: sessionId, stage: session.stage });
    if (options && options.length) response.options = options;
    if (session.waEligible) response.allowWhatsapp = true;
    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json(withOptions({
      ok: true,
      reply: '😅 Tuve un problema momentáneo. Probá de nuevo en un segundo.'
    }));
  }
});

// Listar sesiones (debug)
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  res.json({ ok: true, count: sessions.length, sessions });
});

// ====== Server ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 [STI Chat V4.7-NameFix] Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📂 Data: ${DATA_BASE}`);
  console.log(`${CHAT?.version ? `📋 Chat config: ${CHAT.version}` : '⚠️  No chat config loaded'}`);
  console.log('='.repeat(60) + '\n');
});
