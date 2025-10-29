// server.js (resiliente + experiencia humana por fases)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ==== Utilidades modulares existentes (si no existen, se ignoran con try/catch) ====
let modSaludo = {};
try { modSaludo = await import('./detectarSaludo.js'); } catch (e) { modSaludo = {}; }
const { isGreetingMessage = ()=>false, isArgGreeting = ()=>false, buildArgGreetingReply = (txt,opts)=> (opts?.greetingsResponse || '¡Hola!') } = modSaludo;

let modNorm = {};
try { modNorm = await import('./normalizarTexto.js'); } catch (e) { modNorm = {}; }
const { normalizarTextoCompleto = (s)=>String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim(),
        reemplazarArgentinismosV1 = (s)=>String(s||'') } = modNorm;

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

// CTA WhatsApp (backup por compatibilidad — solo en ESCALADO)
const WHATSAPP_CTA = "\\n\\nSi preferís, escribinos por WhatsApp: https://wa.me/5493417422422 ";

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

// ===== Carga de flujos (sti-chat.json con sections/nlp) =====
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
  sections: flowsBase?.sections || null,
  nlp:      flowsBase?.nlp || null
};

console.log('✅ Flujos cargados:');
console.log(`   - Nuevo: ${FLOWS_NEW_PATH ? FLOWS_NEW_PATH : '(no encontrado)'}`);
console.log(`   - Legacy: ${FLOWS_OLD_PATH ? FLOWS_OLD_PATH : '(no encontrado)'}`);
console.log(`   - Intents totales: ${STI?.intents?.length || 0}`);

// ===== OpenAI opcional (no requerido para la lógica humana) =====
let USE_OPENAI = Boolean(process.env.OPENAI_API_KEY);
let openaiClient = null;
if (USE_OPENAI) {
  const { default: OpenAI } = await import('openai');
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('🔐 OPENAI habilitado');
} else {
  console.log('ℹ️ OPENAI deshabilitado (sin OPENAI_API_KEY). Se usará solo el motor local.');
}

// ===== Helpers =====
function normalizeRaw(s = '') { return String(s ?? ''); }

function normalizeWithConfig(s = '') {
  const raw = normalizeRaw(s);
  const nlp = STI.nlp || STI.sections?.nlp || {};
  // Normalización completa por defecto
  let out = normalizarTextoCompleto(raw);
  if (nlp.lowercase === false) out = out;
  if (nlp.strip_accents === false) {
    out = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  }
  if (nlp.trim === false) out = ` ${out} `;
  return out;
}

function tpl(str) {
  if (!str) return '';
  const whats = STI.settings?.whatsapp_link || 'https://wa.me/5493417422422';
  const insta = STI.settings?.instagram_link || 'https://instagram.com/sti.rosario';
  return String(str)
    .replace(/\{\{\s*whatsapp_link\s*\}\}/g, whats)
    .replace(/\{\{\s*instagram_link\s*\}\}/g, insta);
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

// === Transcripts y estado conversacional (sesión) ===
const TRANSCRIPTS = new Map();      // sessionId => [{role, text, ts}]
const SESS_STATE  = new Map();      // sessionId => { name, device, issueKey, issueHuman, phase }
const MAX_PER_SESSION = 80;

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
    .join('\\n');
}

// ====== Persistencia de tickets & transcripts ======
const DEFAULT_TRANSCRIPTS_DIR = path.join(__dirname, 'data', 'transcripts');
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || DEFAULT_TRANSCRIPTS_DIR;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/+$/,'');

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
ensureDir(TRANSCRIPTS_DIR);

function yyyymmdd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}${m}${d}`;
}
function randBase36(n = 4) { return Math.random().toString(36).slice(2, 2+n).toUpperCase(); }
function newTicketId() { return `TCK-${yyyymmdd()}-${randBase36(5)}`; }
function ticketPath(ticketId) { return path.join(TRANSCRIPTS_DIR, `${ticketId}.json`); }
function sessionShadowPath(sid) { const safe = Buffer.from(sid).toString('hex').slice(0, 40); return path.join(TRANSCRIPTS_DIR, `session-${safe}.json`); }
function readTicket(ticketId) { const p = ticketPath(ticketId); if (!fs.existsSync(p)) return null; return safeReadJSON(p); }
function saveSessionShadow(sid) {
  const items = TRANSCRIPTS.get(sid) || [];
  const data = { type: 'session_shadow', sessionId: sid, updatedAt: new Date().toISOString(), items };
  try { fs.writeFileSync(sessionShadowPath(sid), JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}
function createTicketFromSession(sid, meta = {}) {
  const items = TRANSCRIPTS.get(sid) || [];
  if (!items.length) return { ok:false, error:'no_transcript' };
  const st = SESS_STATE.get(sid) || {};
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
    state: st,
    items
  };
  fs.writeFileSync(ticketPath(ticketId), JSON.stringify(data, null, 2), 'utf-8');
  const linkHtml  = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
  const linkJson  = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
  return { ok:true, id: ticketId, linkHtml, linkJson, count: items.length };
}

// ===== Extractores NLP (nombre, dispositivo, problema) =====
function extractName(text) {
  const nlp = STI.nlp || STI.sections?.nlp || {};
  const triggers = nlp.names_triggers || ['me llamo','soy','mi nombre es'];
  const t = normalizeWithConfig(text);
  for (const trig of triggers) {
    const rx = new RegExp(`\\b${trig.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\s+([a-záéíóúñ]{2,25})`,'i');
    const m = t.match(rx);
    if (m) return m[1].replace(/[^a-záéíóúñ]+/gi,' ').trim().split(' ')[0];
  }
  // fallback: “soy lucas” sin trigger formal
  const m2 = t.match(/\b(soy)\s+([a-záéíóúñ]{2,25})/i);
  if (m2) return m2[2];
  return null;
}

function extractDevice(text) {
  const cfg = STI.nlp || STI.sections?.nlp || {};
  const list = cfg.devices || [];
  const t = normalizeWithConfig(text);
  for (const d of list) {
    try {
      const rx = new RegExp(d.rx, 'i');
      if (rx.test(t)) return d.key;
    } catch {}
  }
  return null;
}

function extractIssue(text) {
  const cfg = STI.nlp || STI.sections?.nlp || {};
  const list = cfg.issues || [];
  const t = normalizeWithConfig(text);
  for (const it of list) {
    try {
      const rx = new RegExp(it.rx, 'i');
      if (rx.test(t)) return it.key;
    } catch {}
  }
  return null;
}

// Map device key → etiqueta humana
const DEVICE_LABEL = { notebook:'notebook', pc:'PC', monitor:'monitor', internet:'conexión', impresora:'impresora', teclado:'teclado', mouse:'mouse', audio:'audio', camara:'cámara', disco:'disco', video:'placa de video', puertos:'puertos', bateria:'batería' };

function renderTemplateForIssue(name, deviceKey, issueKey) {
  const cfg = STI.nlp || STI.sections?.nlp || {};
  const templates = cfg.response_templates || {};
  const tplStr = templates[issueKey] || templates.default || 'Entiendo, {{nombre}}.';
  const dev = DEVICE_LABEL[deviceKey] || (deviceKey || 'equipo');
  return String(tplStr)
    .replace(/\{\{\s*nombre\s*\}\}/g, name || 'che')
    .replace(/\{\{\s*device\s*\}\}/g, dev)
    .replace(/\{\{\s*issue_human\s*\}\}/g, issueKey?.replace(/_/g,' ') || '');
}

function advancedForIssue(issueKey) {
  const cfg = STI.nlp || STI.sections?.nlp || {};
  const adv = cfg.advanced_steps || {};
  return adv[issueKey] || [];
}

// Detección de feedback del cliente
function saidSolved(text) {
  const t = normalizeWithConfig(text);
  return /\b(se\s*solucion[oó]|listo|ya\s*anda|funcion[oó]|qued[oó]|era\s*eso)\b/.test(t);
}
function saidStill(text) {
  const t = normalizeWithConfig(text);
  return /\b(sigue\s*igual|no\s*funcion[oó]|no\s*anda|igual|no\s*result[oó]|no\s*se\s*arregl[oó])\b/.test(t);
}

// ===== Endpoint principal con experiencia humana =====
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body || {};
    const rawText   = String(message || '');
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

    const send = (reply, via, extraUI={}) => {
      // UI flags para front: por defecto NUNCA mostrar WhatsApp en básicos/avanzados
      const resp = { reply: { content: reply, ui: { showWhatsapp: Boolean(extraUI.showWhatsapp) } }, via };
      pushTranscript(sid, 'bot', reply);
      saveSessionShadow(sid);
      return res.json(resp);
    };

    // 0) vacío → saludo
    if (!textNorm) {
      const greet = STI.sections?.greetings?.response || STI.messages?.greeting || 'Hola, ¿en qué puedo ayudarte?';
      const menuTitle = STI.sections?.menus?.help_menu_title || STI.messages?.help_menu_title || 'Temas frecuentes';
      const menuItems = (STI.sections?.menus?.help_menu || STI.messages?.help_menu || []).map(i => `• ${i}`).join('\\n');
      const guide = `${tpl(greet)}\\n\\n**${menuTitle}**\\n${menuItems}`;
      resetMiss(ip);
      return send(guide, 'empty-greet');
    }

    // 1) saludo
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
      // reset conversación
      SESS_STATE.set(sid, { phase: 'start' });
      return send(reply, 'greeting');
    }

    // 2) lógica de experiencia humana por fases (NLP)
    const cfgNLP = STI.nlp || STI.sections?.nlp || {};
    const st = SESS_STATE.get(sid) || { phase: 'start' };

    // Intento extraer nombre/device/issue si aún no los tengo
    if (!st.name) {
      const nn = extractName(rawText);
      if (nn) st.name = nn.charAt(0).toUpperCase() + nn.slice(1);
    }
    if (!st.device) st.device = extractDevice(rawText);
    if (!st.issueKey) st.issueKey = extractIssue(rawText);

    // Si el cliente da feedback (se solucionó / sigue igual)
    if (saidSolved(rawText)) {
      const txt = (cfgNLP.followup_texts?.solved) || "¡Qué alegría haberte ayudado, {{nombre}}!";
      const msg = txt.replace(/\{\{\s*nombre\s*\}\}/g, st.name || 'crack');
      SESS_STATE.set(sid, { ...st, phase: 'done' });
      return send(msg, 'solved', { showWhatsapp: false });
    }
    if (saidStill(rawText)) {
      if (st.phase === 'basic') {
        // pasamos a avanzados
        const advIntro = (cfgNLP.followup_texts?.advanced_intro || "Sigamos con chequeos avanzados, {{nombre}}:").replace(/\{\{\s*nombre\s*\}\}/g, st.name || '');
        const steps = advancedForIssue(st.issueKey).slice(0,3).map((s,i)=>`${i+1}) ${s}`).join('\\n');
        SESS_STATE.set(sid, { ...st, phase: 'advanced' });
        const ask = cfgNLP.followup_texts?.ask_result || "Cuando termines, contame si **se solucionó** o **sigue igual** 😉";
        return send(`${advIntro}\\n${steps}\\n\\n${ask}`, 'advanced', { showWhatsapp: false });
      } else if (st.phase === 'advanced') {
        // escalamos con ticket + botón wa
        const created = createTicketFromSession(sid, { ip, ua, name: st.name, device: st.device, issue: st.issueKey });
        const esc = (cfgNLP.followup_texts?.escalate || "Escalemos a un técnico especializado, {{nombre}}.").replace(/\{\{\s*nombre\s*\}\}/g, st.name || '');
        let extra = '';
        if (created.ok) {
          const header = `Hola, necesito asistencia con mi equipo.%0D%0A`;
          const ticketLine = `🧾 Mi número de ticket es: *${created.id}*%0D%0A`;
          const linkLine = `Detalle: ${created.linkHtml}%0D%0A`;
          const text = `${header}${ticketLine}${linkLine}`;
          const phone = (STI.settings?.whatsapp_link || 'https://wa.me/5493417422422').replace(/^https?:\/\/wa\.me\//,'');
          const waLink = `https://wa.me/${phone}?text=${text}`;
          extra = `\\n\\nAbajo te dejo un botón para enviar **todo el chat** por WhatsApp (no tenés que repetir nada).\\nTicket: *${created.id}*\\n${created.linkHtml}`;
          SESS_STATE.set(sid, { ...st, phase: 'escalated', ticket: created.id });
          // Devolvemos también el link por si el front lo usa
          return send(`${esc}${extra}`, 'escalate', { showWhatsapp: true });
        }
        SESS_STATE.set(sid, { ...st, phase: 'escalate_failed' });
        return send(`${esc}\\nNo pude generar el ticket automáticamente, pero podés escribirnos por WhatsApp. ${WHATSAPP_CTA}`, 'escalate-fallback', { showWhatsapp: true });
      }
    }

    // Si tenemos issue → respondemos con plantillas humanas (básicos)
    if (st.issueKey) {
      const humanReply = renderTemplateForIssue(st.name, st.device, st.issueKey);
      const ask = cfgNLP.followup_texts?.ask_result || "Cuando termines, contame si **se solucionó** o **sigue igual** 😉";
      SESS_STATE.set(sid, { ...st, phase: 'basic' });
      const canonBrand = detectBrandCanonical(textNorm);
      const brandLine = canonBrand ? `\\n\\n💡 Veo que tenés una ${canonBrand}.` : '';
      return send(`${humanReply}${brandLine}\\n\\n${ask}`, 'basic', { showWhatsapp: false });
    }

    // Si el usuario dijo “me llamo…”, guardamos y pedimos el problema
    if (st.name && !st.issueKey) {
      SESS_STATE.set(sid, st);
      return send(`¡Un gusto, ${st.name}! 🙌 Contame en una frase cuál es el problema (por ejemplo: *no enciende*, *pantalla negra*, *sin internet*, *sin sonido*).`, 'ask-issue', { showWhatsapp: false });
    }

    // 3) Intent matcher clásico (como respaldo)
    for (const intent of (STI.intents || [])) {
      const triggers = Array.isArray(intent.triggers) ? intent.triggers : [];
      if (triggers.some(k => fuzzyIncludes(textArg, String(k)))) {
        resetMiss(ip);
        let reply = intent.response || '';
        const canon = detectBrandCanonical(textNorm);
        if (canon) {
          if (/\{\{\s*marca_detectada\s*\}\}/.test(reply)) {
            reply = reply.replace(/\{\{\s*marca_detectada\s*\}\}/g, canon);
          } else {
            const already = new RegExp(`\\b${canon.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(reply);
            if (!already) reply = `💡 Veo que tenés una ${canon}.\\n\\n` + reply;
          }
        }
        reply = tpl(reply);
        // Intent clásico puede incluir WhatsApp, mantenemos conducta anterior
        const hasWhats = reply.includes('wa.me/') || reply.includes('{{whatsapp_link}}');
        return send(hasWhats ? reply : (reply + WHATSAPP_CTA), `intent:${intent.id || 's/ID'}`, { showWhatsapp: hasWhats });
      }
    }

    // 4) Fallback escalonado
    const limit = Number(STI.settings?.fallback_escalation_after ?? 3);
    const currentMiss = bumpMiss(ip);

    if (currentMiss >= limit) {
      resetMiss(ip);
      const created = createTicketFromSession(sid, { ip, ua });
      let hard = STI.sections?.fallbacks?.hard
        || 'No pude resolverlo por acá 🤔. Te ofrezco asistencia personalizada por WhatsApp 👉 {{whatsapp_link}}';
      if (created.ok) {
        const msg = `\\n\\n🧾 Ticket generado: *${created.id}*\\nAbrilo acá: ${created.linkHtml}`;
        hard = tpl(hard) + msg;
        SESS_STATE.set(sid, { ...(SESS_STATE.get(sid) || {}), phase:'escalated', ticket: created.id });
        return send(hard, 'fallback-hard-ticket', { showWhatsapp: true });
      }
      return send(tpl(hard), 'fallback-hard', { showWhatsapp: true });

    } else if (currentMiss === Math.max(2, limit - 1) && STI.sections?.fallbacks?.medio) {
      const medio = tpl(STI.sections.fallbacks.medio);
      return send(medio, 'fallback-medio', { showWhatsapp: false });

    } else {
      const soft = STI.sections?.fallbacks?.soft
        || STI.messages?.fallback
        || 'Para ayudarte mejor, elegí un tema de la lista o describí el problema en 1 frase.';
      return send(tpl(soft), 'fallback-soft', { showWhatsapp: false });
    }

  } catch (e) {
    console.error('❌ ERROR /api/chat:', e.stack || e.message);
    return res.status(200).json({ reply: { content: 'No pude procesar la consulta. Probá con palabras como "no enciende", "pantalla negra", "wifi", "sonido".', ui:{ showWhatsapp:false } } });
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

// ===== Tester simple =====
app.get('/api/testchat', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const fakeBody = { message: q };
    const fakeReq = { body: fakeBody, headers: req.headers, ip: req.ip };
    let jsonResp = null;
    const fakeRes = { json: (o)=> (jsonResp = o) };
    await (app._router.stack.find(l=>l.route && l.route.path==='/api/chat' && l.route.methods.post).route.stack[0].handle) (fakeReq, fakeRes);
    res.json(jsonResp || { echo: q });
  } catch (e) {
    console.error('❌ ERROR /api/testchat:', e);
    res.status(200).json({ input: req.query.q, reply: 'Error procesando test.', error: e.message });
  }
});

// ===== Exportar/generar Ticket explícito =====
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
app.get('/api/export/whatsapp', (req, res) => {
  const sid = String(
    req.query.session ||
    ((req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon') +
     '|' + (req.headers['user-agent'] || 'ua'))
  );

  const items = TRANSCRIPTS.get(sid) || [];
  if (!items.length) return res.json({ ok:false, error:'no_transcript', sessionId:sid });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
  const ua = req.headers['user-agent'] || 'ua';
  const created = createTicketFromSession(sid, { ip, ua });
  if (!created.ok) return res.json({ ok:false, error:'ticket_failed', sessionId:sid });

  const header = `Hola, necesito asistencia con mi equipo.%0D%0A`;
  const ticketLine = `🧾 Mi número de ticket es: *${created.id}*%0D%0A`;
  const linkLine = `Podés ver el detalle acá: ${created.linkHtml}%0D%0A`;
  const text = `${header}${ticketLine}${linkLine}`;

  const phone = (STI.settings?.whatsapp_link || 'https://wa.me/5493417422422').replace(/^https?:\/\/wa\.me\//,'');
  const wa_link = `https://wa.me/${phone}?text=${text}`;

  res.json({ ok:true, sessionId:sid, id:created.id, wa_link, ticket_url: created.linkHtml, preview: decodeURIComponent(text), count: items.length });
});

// ===== Arranque =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🧠 STI AI backend escuchando en puerto ${PORT}
📁 TRANSCRIPTS_DIR=${TRANSCRIPTS_DIR}
🌐 PUBLIC_BASE_URL=${PUBLIC_BASE_URL}`)
);
