// server.js (resiliente: funciona con o sin OPENAI_API_KEY)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ==== NUEVO: utilidades modulares ====
import { isGreetingMessage, isArgGreeting, buildArgGreetingReply } from './detectarSaludo.js';
import { normalizarTextoCompleto, reemplazarArgentinismosV1 } from './normalizarTexto.js';

// ===== CORS =====
const app = express();
const ALLOWED_ORIGINS = [
  'https://stia.com.ar',
  'http://stia.com.ar',
  'http://localhost:5173',
  'http://localhost:5500',
  'https://sti-rosario-ai.onrender.com'
];
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error('Origen no permitido')),
  credentials: true
}));
app.use(express.json());

// CTA WhatsApp (backup por compatibilidad)
const WHATSAPP_CTA = "\n\nSi preferís, escribinos por WhatsApp: https://wa.me/5493417422422 ";

// ===== Paths util =====
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { console.warn('⚠️ No se pudo leer', p, e.message); return null; }
}

const CANDIDATE_DIRS = [process.cwd(), __dirname, path.resolve(__dirname, '..')];
const resolveFirst = (fname) => {
  if (!fname) return null;
  for (const d of CANDIDATE_DIRS) {
    const p = path.join(d, fname);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// ===== Carga de flujos (NUEVO: sti-chat.json con sections) =====
const FLOWS_NEW_PATH = resolveFirst('sti-chat.json');
const FLOWS_OLD_PATH = resolveFirst('sti-chat-flujos.json');

const flowsNew  = FLOWS_NEW_PATH ? safeReadJSON(FLOWS_NEW_PATH) : null;
const flowsBase = flowsNew || (FLOWS_OLD_PATH ? safeReadJSON(FLOWS_OLD_PATH) : {});

let STI = {
  bot:      flowsBase?.bot || 'STI • Servicio Técnico Inteligente',
  locale:   flowsBase?.locale || 'es-AR',
  version:  flowsBase?.version || '2.x',
  settings: flowsBase?.settings || {},
  messages: flowsBase?.messages || {},
  intents:  flowsBase?.intents || [],
  fallback: flowsBase?.fallback || { response: '{fallback}' },
  sections: flowsBase?.sections || null
};

console.log('✅ Flujos cargados:');
console.log(`   - Nuevo: ${FLOWS_NEW_PATH ? FLOWS_NEW_PATH : '(no encontrado)'}`);
console.log(`   - Legacy: ${FLOWS_OLD_PATH ? FLOWS_OLD_PATH : '(no encontrado)'}`);
console.log(`   - Intents totales: ${STI?.intents?.length || 0}`);

// ===== OpenAI opcional =====
let USE_OPENAI = Boolean(process.env.OPENAI_API_KEY);
let openaiClient = null;
if (USE_OPENAI) {
  const { default: OpenAI } = await import('openai');
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('🔐 OPENAI habilitado');
} else {
  console.log('ℹ️ OPENAI deshabilitado (sin OPENAI_API_KEY). Se usará solo el motor de flujos.');
}

// ===== Helpers =====
function normalizeRaw(s = '') { return String(s ?? ''); }

// Mantenemos compatibilidad con nlp config de sections,
// pero aprovechamos nuestro normalizador común.
function normalizeWithConfig(s = '') {
  const raw = normalizeRaw(s);
  const nlp = STI.sections?.nlp || {};

  // Normalización completa por defecto
  let out = normalizarTextoCompleto(raw);

  // Permitir desactivar partes desde config si lo pidieran
  if (nlp.lowercase === false) out = out;
  if (nlp.strip_accents === false) {
    out = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  }
  if (nlp.trim === false) out = ` ${out} `;
  return out;
}

// Template simple: {{whatsapp_link}}
function tpl(str) {
  if (!str) return '';
  const whats = STI.settings?.whatsapp_link || 'https://wa.me/5493417422422';
  return String(str).replace(/\{\{\s*whatsapp_link\s*\}\}/g, whats);
}

// ----- Fuzzy matching -----
function levenshtein(a = '', b = '') {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp = Array.from({ length: al + 1 }, () => Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[al][bl];
}
function fuzzyIncludes(text, trigger) {
  if (!text || !trigger) return false;
  const t = normalizeWithConfig(text);
  const k = normalizeWithConfig(trigger);
  if (t.includes(k) || k.includes(t)) return true;
  const words = t.split(' ');
  for (const w of words) {
    if (w.length >= 3) {
      const d = levenshtein(w, k);
      if ((w.length <= 5 && d <= 1) || (w.length >= 6 && d <= 2)) return true;
    }
  }
  return false;
}

// === Helper: detección de marca canónica ===
function detectBrandCanonical(textNorm = '') {
  const tests = [
    { rx: /\b(hp|h p|h\-p|hpe|hepi|jepi|agp)\b/, canon: 'HP' },
    { rx: /\b(lenovo|lenovoa|lenobo|lenow|lenoovo)\b/, canon: 'Lenovo' },
    { rx: /\b(dell|del|delk|dlell|dele|delp|alienware|alien war|alienwer|alienwaer)\b/, canon: 'Dell / Alienware' },
    { rx: /\b(asus|azus|asuz|asuss|asuzt|asusz)\b/, canon: 'ASUS' },
    { rx: /\b(acer|azer|azzer|ascer|accer)\b/, canon: 'Acer' },
    { rx: /\b(toshiba|toshiva|toshia|tosiva|tosh)\b/, canon: 'Toshiba' },
    { rx: /\b(samsung|sansumg|samgsung|samsumg|samung|sangsun)\b/, canon: 'Samsung' },
    { rx: /\b(sony|soni|soony|zoni|soney)\b/, canon: 'Sony' },
    { rx: /\b(apple|aple|aplle|appple|appl|manzana)\b/, canon: 'Apple' },
    { rx: /\b(msi|m s i|emesai|msy|mpsi)\b/, canon: 'MSI' },
    { rx: /\b(bangho|banho|banjo|bangó|vangho)\b/, canon: 'Banghó' },
    { rx: /\b(exo|exa|exxa|exsa|exza|exa computers)\b/, canon: 'EXO' },
    { rx: /\b(positivo|posotivo|posiitivo|postivo|positibo)\b/, canon: 'Positivo' },
    { rx: /\b(bgh|b g h|begeache|bejéache|bjeh)\b/, canon: 'BGH' },
    { rx: /\b(compaq|kompak|kompaq|compak|kompa)\b/, canon: 'Compaq' },
    { rx: /\b(gateway|geteway|getaway|gatewey|gatewei|gatuwey)\b/, canon: 'Gateway' },
    { rx: /\b(huawei|huawey|huaue?i|guawey|wawey)\b/, canon: 'Huawei' },
    { rx: /\b(xiaomi|xioami|xiomi|xiomy|xiaomy|xiaommi|chaomi)\b/, canon: 'Xiaomi' },
    { rx: /\b(vaio|vaoi|vao|vayio|baio)\b/, canon: 'VAIO' },
    { rx: /\b(lg|l g|elgi|eleji|ege|lge)\b/, canon: 'LG' }
  ];
  for (const t of tests) if (t.rx.test(textNorm)) return t.canon;
  return null;
}

// === Estado simple por cliente ===
const missCounters = new Map(); // key = req.ip (o un header si tenés sesión)
function bumpMiss(ip)  { const n = (missCounters.get(ip) || 0) + 1; missCounters.set(ip, n); return n; }
function resetMiss(ip) { missCounters.set(ip, 0); }

// === Transcripts en memoria (session = ip|user-agent) ===
const TRANSCRIPTS = new Map();      // sessionId => [{role, text, ts}]
const MAX_PER_SESSION = 50;

const getSessionId = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon') +
  '|' + (req.headers['user-agent'] || 'ua');

function pushTranscript(sid, role, text) {
  const arr = TRANSCRIPTS.get(sid) || [];
  arr.push({ role, text, ts: Date.now() });
  while (arr.length > MAX_PER_SESSION) arr.shift();
  TRANSCRIPTS.set(sid, arr);
}

function formatTranscriptForHuman(arr) {
  return (arr || [])
    .map(m => `${m.role === 'user' ? 'Cliente' : 'STI'}: ${m.text}`)
    .join('\n');
}

// ====== NUEVO: Persistencia de tickets & transcripts ======
const DEFAULT_TRANSCRIPTS_DIR = path.join(__dirname, 'data', 'transcripts');
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || DEFAULT_TRANSCRIPTS_DIR;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/+$/,'');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}
ensureDir(TRANSCRIPTS_DIR);

function yyyymmdd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}${m}${d}`;
}

function randBase36(n = 4) {
  return Math.random().toString(36).slice(2, 2+n).toUpperCase();
}

function newTicketId() {
  return `TCK-${yyyymmdd()}-${randBase36(5)}`;
}

function ticketPath(ticketId) {
  return path.join(TRANSCRIPTS_DIR, `${ticketId}.json`);
}

function sessionShadowPath(sid) {
  // Guardado intermedio opcional por sesión
  const safe = Buffer.from(sid).toString('hex').slice(0, 40);
  return path.join(TRANSCRIPTS_DIR, `session-${safe}.json`);
}

function readTicket(ticketId) {
  const p = ticketPath(ticketId);
  if (!fs.existsSync(p)) return null;
  return safeReadJSON(p);
}

function saveSessionShadow(sid) {
  const items = TRANSCRIPTS.get(sid) || [];
  const data = {
    type: 'session_shadow',
    sessionId: sid,
    updatedAt: new Date().toISOString(),
    items
  };
  try { fs.writeFileSync(sessionShadowPath(sid), JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}

function createTicketFromSession(sid, meta = {}) {
  const items = TRANSCRIPTS.get(sid) || [];
  if (!items.length) return { ok:false, error:'no_transcript' };

  const ticketId = newTicketId();
  const data = {
    type: 'ticket',
    id: ticketId,
    createdAt: new Date().toISOString(),
    sessionId: sid,
    meta,
    bot: STI.bot,
    locale: STI.locale,
    version: STI.version,
    items
  };
  fs.writeFileSync(ticketPath(ticketId), JSON.stringify(data, null, 2), 'utf-8');

  const linkHtml  = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
  const linkJson  = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;

  return { ok:true, id: ticketId, linkHtml, linkJson, count: items.length };
}

// ===== Endpoint principal =====
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};

    const rawText   = String(message || '');
    // normalizadores
    const textNorm  = normalizeWithConfig(rawText);
    const textClean = normalizarTextoCompleto(rawText);
    const textArg   = reemplazarArgentinismosV1(textClean);

    const ts = new Date().toLocaleString('es-AR');
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
    const ua = req.headers['user-agent'] || 'ua';
    const sid = getSessionId(req);
    console.log(`📩 [${ts}] input(${ip}) UA(${ua.slice(0,30)}...): "${textNorm}"`);
    pushTranscript(sid, 'user', rawText);
    saveSessionShadow(sid);

    // helper de respuesta + guardado
    const send = (reply, via) => {
      pushTranscript(sid, 'bot', reply);
      saveSessionShadow(sid);
      return res.json({ reply, via });
    };

    // --- 0) Si viene vacío → saludo + menú
    if (!textNorm) {
      const greet = STI.sections?.greetings?.response || STI.messages?.greeting || 'Hola, ¿en qué puedo ayudarte?';
      const menuTitle = STI.sections?.menus?.help_menu_title || STI.messages?.help_menu_title || 'Temas frecuentes';
      const menuItems = (STI.sections?.menus?.help_menu || STI.messages?.help_menu || []).map(i => `• ${i}`).join('\n');
      const guide = `${tpl(greet)}\n\n**${menuTitle}**\n${menuItems}`;
      resetMiss(ip);
      return send(guide, 'empty-greet');
    }

    // --- 1) Detección de saludo (universal + argento)
    if (isGreetingMessage(rawText) || isGreetingMessage(textClean) || isArgGreeting(rawText)) {
      resetMiss(ip);
      const reply = buildArgGreetingReply(rawText, {
        greetingsResponse:
          (STI.sections?.greetings?.response) ||
          (STI.messages?.greeting) ||
          '¡Hola! 👋 Soy Tecnos de STI. ¿En qué te doy una mano hoy?',
        showMenu: STI.settings?.greet_show_menu !== false,
        menuTitle: STI.sections?.menus?.help_menu_title || STI.messages?.help_menu_title || 'Temas frecuentes',
        menuItems: (STI.sections?.menus?.help_menu || STI.messages?.help_menu || []),
        tpl
      });
      return send(reply, 'greeting');
    }

    // --- 1.b) Greetings por sections.greetings (triggers explícitos)
    const gs = STI.sections?.greetings;
    if (gs?.triggers?.some(k => fuzzyIncludes(textNorm, String(k)))) {
      resetMiss(ip);
      const greet = tpl(gs.response);
      return send(greet, 'greeting-triggers');
    }

    // --- 2) Intent matcher (con detección de marca)
    for (const intent of (STI.intents || [])) {
      const triggers = Array.isArray(intent.triggers) ? intent.triggers : [];
      if (triggers.some(k => fuzzyIncludes(textArg, String(k)))) {
        resetMiss(ip);
        let reply = intent.response || '';

        // === Detección de marca (única y universal) ===
        const canon = detectBrandCanonical(textNorm);
        if (canon) {
          if (/\{\{\s*marca_detectada\s*\}\}/.test(reply)) {
            reply = reply.replace(/\{\{\s*marca_detectada\s*\}\}/g, canon);
          } else {
            const alreadyMentions = new RegExp(`\\b${canon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(reply);
            if (!alreadyMentions) {
              if (/\n\n¿Sigue igual\?/.test(reply)) {
                reply = reply.replace(/\n\n¿Sigue igual\?/, `\n\n💡 Veo que tenés una ${canon}.\n\n¿Sigue igual?`);
              } else {
                reply = `💡 Veo que tenés una ${canon}.\n\n` + reply;
              }
            }
          }
          console.log(`🔎 marca_detectada=${canon}`);
        }

        // Sustituciones legacy + plantillas
        reply = reply
          .replace('{greeting}', STI.messages.greeting || 'Hola')
          .replace('{help_menu_title}', STI.messages.help_menu_title || 'Temas')
          .replace('{help_menu}', (STI.messages.help_menu || []).join('\n'))
          .replace('{fallback}', STI.messages.fallback || '');
        reply = tpl(reply);

        const hasWhats = reply.includes('wa.me/') || reply.includes('{{whatsapp_link}}');
        return send(hasWhats ? reply : (reply + WHATSAPP_CTA), `intent:${intent.id || 's/ID'}`);
      }
    }

    // --- 3) Fallback local: soft → medio → hard (WhatsApp con ticket)
    const limit = Number(STI.settings?.fallback_escalation_after ?? 3);
    const currentMiss = bumpMiss(ip);

    if (currentMiss >= limit) {
      resetMiss(ip);
      // Al escalar, generamos ticket y lo adjuntamos
      const created = createTicketFromSession(sid, { ip, ua });
      let hard = STI.sections?.fallbacks?.hard
        || 'No pude resolverlo por acá 🤔. Te ofrezco asistencia personalizada por WhatsApp 👉 {{whatsapp_link}}';

      if (created.ok) {
        const msg = `\n\n🧾 Ticket generado: *${created.id}*\nAbrilo acá: ${created.linkHtml}`;
        hard = tpl(hard) + msg;
        return send(hard, 'fallback-hard-ticket');
      }
      return send(tpl(hard), 'fallback-hard');

    } else if (currentMiss === Math.max(2, limit - 1) && STI.sections?.fallbacks?.medio) {
      const medio = tpl(STI.sections.fallbacks.medio);
      return send(medio, 'fallback-medio');

    } else {
      const soft = STI.sections?.fallbacks?.soft
        || STI.messages?.fallback
        || 'Para ayudarte mejor, elegí un tema de la lista o describí el problema en 1 frase.';
      return send(tpl(soft), 'fallback-soft');
    }

  } catch (e) {
    console.error('❌ ERROR /api/chat:', e.stack || e.message);
    return res.status(200).json({ reply: 'No pude procesar la consulta. Probá con una palabra clave como "drivers", "bsod", "powershell", "red".' });
  }
});

// ===== Health & root =====
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: USE_OPENAI,
    totalIntents: STI?.intents?.length || 0,
    usingNewFlows: Boolean(FLOWS_NEW_PATH),
    newPath: FLOWS_NEW_PATH || null,
    legacyPath: FLOWS_OLD_PATH || null,
    fallbackEscalationAfter: STI.settings?.fallback_escalation_after ?? 3,
    transcriptsDir: TRANSCRIPTS_DIR,
    publicBaseUrl: PUBLIC_BASE_URL
  });
});
app.get('/', (_req, res) => res.type('text').send('🧠 STI AI backend activo'));

// ===== Tester completo: GET /api/testchat?q=... =====
app.get('/api/testchat', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const rawText   = q;
    const textNorm  = normalizeWithConfig(rawText);
    const textClean = normalizarTextoCompleto(rawText);
    const textArg   = reemplazarArgentinismosV1(textClean);
    const sid = getSessionId(req);

    const send = (reply, via) => {
      pushTranscript(sid, 'user', rawText || '(vacío)');
      pushTranscript(sid, 'bot', reply);
      saveSessionShadow(sid);
      return res.json({ input: q, reply, via });
    };

    // 0) vacío
    if (!textNorm) {
      const greet = STI.sections?.greetings?.response
        || STI.messages?.greeting
        || 'Hola, ¿en qué puedo ayudarte?';
      const menuTitle = STI.sections?.menus?.help_menu_title
        || STI.messages?.help_menu_title
        || 'Temas frecuentes';
      const menuItems = (STI.sections?.menus?.help_menu || STI.messages?.help_menu || [])
        .map(i => `• ${i}`).join('\n');
      const reply = `${tpl(greet)}\n\n**${menuTitle}**\n${menuItems}`;
      return send(reply, 'empty-greet');
    }

    // 1) Saludos (universal + argento)
    if (isGreetingMessage(rawText) || isGreetingMessage(textClean) || isArgGreeting(rawText)) {
      const reply = buildArgGreetingReply(rawText, {
        greetingsResponse:
          (STI.sections?.greetings?.response) ||
          (STI.messages?.greeting) ||
          '¡Hola! 👋 Soy Tecnos de STI. ¿En qué te doy una mano hoy?',
        showMenu: STI.settings?.greet_show_menu !== false,
        menuTitle: STI.sections?.menus?.help_menu_title || STI.messages?.help_menu_title || 'Temas frecuentes',
        menuItems: (STI.sections?.menus?.help_menu || STI.messages?.help_menu || []),
        tpl
      });
      return send(reply, 'greeting');
    }

    // 2) Intent matcher (usa textArg)
    for (const intent of (STI.intents || [])) {
      const triggers = Array.isArray(intent.triggers) ? intent.triggers : [];
      const matched = triggers.some(k => fuzzyIncludes(textArg, String(k)));
      if (matched) {
        let reply = intent.response || '';
        const canon = detectBrandCanonical(textNorm);
        if (canon) {
          if (/\{\{\s*marca_detectada\s*\}\}/.test(reply)) {
            reply = reply.replace(/\{\{\s*marca_detectada\s*\}\}/g, canon);
          } else if (!new RegExp(`\\b${canon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(reply)) {
            reply = `💡 Veo que tenés una ${canon}.\n\n` + reply;
          }
        }
        reply = tpl(reply);
        return send(reply, `intent:${intent.id || 's/ID'}`);
      }
    }

    // 3) Fallback
    const soft = STI.sections?.fallbacks?.soft
      || STI.messages?.fallback
      || 'Para ayudarte mejor, elegí un tema de la lista o describí el problema en 1 frase.';
    return send(tpl(soft), 'fallback-soft');

  } catch (e) {
    console.error('❌ ERROR /api/testchat:', e);
    res.status(200).json({ input: req.query.q, reply: 'Error procesando test.', error: e.message });
  }
});

// ===== NUEVO: Exportar/generar Ticket explícito =====
// GET /api/export/ticket  (genera ticket desde la sesión actual)
app.get('/api/export/ticket', (req, res) => {
  const sid = String(
    req.query.session ||
    ((req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon') +
     '|' + (req.headers['user-agent'] || 'ua'))
  );
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
  const ua = req.headers['user-agent'] || 'ua';

  const created = createTicketFromSession(sid, { ip, ua });
  if (!created.ok) return res.json({ ok:false, error:'no_transcript', sessionId:sid });

  return res.json({ ok:true, sessionId:sid, id:created.id, linkHtml:created.linkHtml, linkJson:created.linkJson, count:created.count });
});

// ===== Exportar transcript a WhatsApp con Ticket =====
// GET /api/export/whatsapp
// Parámetros opcionales: ?session=... (si no viene, usa ip|ua actual)
app.get('/api/export/whatsapp', (req, res) => {
  const sid = String(
    req.query.session ||
    ((req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon') +
     '|' + (req.headers['user-agent'] || 'ua'))
  );

  const items = TRANSCRIPTS.get(sid) || [];
  if (!items.length) return res.json({ ok:false, error:'no_transcript', sessionId:sid });

  // Generar ticket primero
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
  const ua = req.headers['user-agent'] || 'ua';
  const created = createTicketFromSession(sid, { ip, ua });
  if (!created.ok) return res.json({ ok:false, error:'ticket_failed', sessionId:sid });

  // Mensaje breve para WhatsApp
  const header = `Hola, necesito asistencia con mi equipo.\r\n`;
  const ticketLine = `🧾 Mi número de ticket es: *${created.id}*\r\n`;
  const linkLine = `Podés ver todo el detalle acá: ${created.linkHtml}\r\n`;
  const text = `${header}${ticketLine}${linkLine}`;

  const phone = '5493417422422';
  const wa_link = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

  res.json({ ok:true, sessionId:sid, id:created.id, wa_link, ticket_url: created.linkHtml, preview:text, count: items.length });
});

// ===== NUEVO: Ver ticket en JSON =====
app.get('/api/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const data = readTicket(id);
  if (!data) return res.status(404).json({ ok:false, error:'ticket_not_found', id });
  res.json({ ok:true, ticket: data });
});

// ===== NUEVO: Ver ticket en HTML simple =====
app.get('/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const data = readTicket(id);
  if (!data) return res.status(404).type('text/html').send(`<h1>Ticket no encontrado</h1><p>ID: ${id}</p>`);

  const title = `${STI.bot} — Ticket ${id}`;
  const createdAt = new Date(data.createdAt).toLocaleString('es-AR');
  const rows = (data.items || []).map(m => {
    const who = m.role === 'user' ? 'Cliente' : 'STI';
    const when = new Date(m.ts || Date.now()).toLocaleString('es-AR');
    const txt = String(m.text || '').replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
    return `<tr><td style="white-space:nowrap;color:#666">${when}</td><td><strong>${who}:</strong> ${txt}</td></tr>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif;margin:20px;background:#0b1020;color:#e7ecff}
  .card{background:#11193a;border:1px solid #2a3a78;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:18px;max-width:980px;margin:auto}
  h1{margin:0 0 10px;font-size:22px}
  .meta{color:#a9b3ff;font-size:14px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:15px;background:#0f1733;border-radius:10px;overflow:hidden}
  td{border-bottom:1px solid #1c2b66;padding:10px 12px;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .cta{margin-top:16px}
  .cta a{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px}
</style>
</head>
<body>
  <div class="card">
    <h1>🧾 Ticket ${id}</h1>
    <div class="meta">Creado: ${createdAt} — Bot: ${STI.bot}</div>
    <table>${rows}</table>
    <div class="cta">
      <a href="https://wa.me/5493417422422?text=${encodeURIComponent(`Hola, sigo el ticket ${id}.`) }" target="_blank" rel="noopener">Responder por WhatsApp</a>
      &nbsp;&nbsp;
      <a href="${PUBLIC_BASE_URL}/api/ticket/${id}" target="_blank" rel="noopener">Ver JSON</a>
    </div>
  </div>
</body>
</html>`;
  res.type('html').send(html);
});

// ===== Arranque =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🧠 STI AI backend escuchando en puerto ${PORT}\n📁 TRANSCRIPTS_DIR=${TRANSCRIPTS_DIR}\n🌐 PUBLIC_BASE_URL=${PUBLIC_BASE_URL}`)
);
