\
// server.js — STI Chat v3.5 “Experiencia Humana” (compatible con sti-chat.json v3.5)
// Fuente única: sti-chat.json (greetings/menus/fallbacks + NLP devices/issues + templates + advanced_steps + followups)
// © STI Rosario — Lucas. Última edición: 2025-10-29

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Utilidades propias existentes
import { isGreetingMessage, isArgGreeting, buildArgGreetingReply } from './detectarSaludo.js';
import { normalizarTextoCompleto, reemplazarArgentinismosV1 } from './normalizarTexto.js';

// ================== App & CORS ==================
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

// ================== Paths & helpers ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CONFIG_PATH = process.env.STI_CONFIG_PATH || path.resolve(process.cwd(), 'sti-chat.json');
const safeReadJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } };

// Estado por sesión
const SESS = new Map();           // sid -> { lastIssueKey, lastDeviceKey, nombre }
const missCounters = new Map();   // ip -> misses

const bumpMiss  = (ip) => { const n = (missCounters.get(ip) || 0) + 1; missCounters.set(ip, n); return n; };
const resetMiss = (ip) => missCounters.set(ip, 0);

const getSessionId = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon') +
  '|' + (req.headers['user-agent'] || 'ua');

// Transcripts (memoria corta + persistencia en disco para WhatsApp)
const TRANSCRIPTS = new Map();
const MAX_PER_SESSION = 200;
function pushTranscript(sid, role, text) {
  const arr = TRANSCRIPTS.get(sid) || [];
  arr.push({ role, text, ts: Date.now() });
  while (arr.length > MAX_PER_SESSION) arr.shift();
  TRANSCRIPTS.set(sid, arr);
}
const DEFAULT_TRANSCRIPTS_DIR = path.join(__dirname, 'data', 'transcripts');
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || DEFAULT_TRANSCRIPTS_DIR;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/+$/,'');
try { fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true }); } catch {}

const yyyymmdd = (d=new Date()) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
const randBase36 = (n=5) => Math.random().toString(36).slice(2, 2+n).toUpperCase();
const newTicketId = () => `TCK-${yyyymmdd()}-${randBase36(5)}`;
const ticketPath  = (id) => path.join(TRANSCRIPTS_DIR, `${id}.json`);
function createTicketFromSession(sid, meta = {}) {
  const items = TRANSCRIPTS.get(sid) || [];
  if (!items.length) return { ok:false, error:'no_transcript' };
  const id = newTicketId();
  const data = {
    type: 'ticket',
    id,
    createdAt: new Date().toISOString(),
    sessionId: sid,
    meta,
    items
  };
  fs.writeFileSync(ticketPath(id), JSON.stringify(data, null, 2), 'utf-8');
  const linkHtml = `${PUBLIC_BASE_URL}/ticket/${id}`;
  const linkJson = `${PUBLIC_BASE_URL}/api/ticket/${id}`;
  return { ok:true, id, linkHtml, linkJson, count: items.length };
}
const readTicket = (id) => { const p = ticketPath(id); return fs.existsSync(p) ? safeReadJSON(p) : null; };

// ================== Carga de sti-chat.json + compilación ==================
let STI = safeReadJSON(CONFIG_PATH);
if (!STI) throw new Error(`No pude leer ${CONFIG_PATH}`);

function compileRegex(pattern, flags='i'){
  try { return new RegExp(pattern, flags); } catch { return null; }
}

let NLP = { devices: [], issues: [], names_triggers: [], templates: {}, advanced: {}, followup: {} };

function compileConfig(){
  STI = safeReadJSON(CONFIG_PATH) || STI;

  const nlp = STI?.nlp || {};
  NLP.devices = (nlp.devices || []).map(d => ({ key: d.key, rx: compileRegex(d.rx, 'i') })).filter(x=>x.rx);
  NLP.issues  = (nlp.issues  || []).map(i => ({ key: i.key, rx: compileRegex(i.rx, 'i') })).filter(x=>x.rx);
  NLP.names_triggers = Array.isArray(nlp.names_triggers) ? nlp.names_triggers : [];
  NLP.templates = nlp.response_templates || {};
  NLP.advanced  = nlp.advanced_steps || {};
  NLP.followup  = nlp.followup_texts || {};

  console.log(`[STI] JSON cargado v${STI.version} — devices:${NLP.devices.length} issues:${NLP.issues.length}`);
}
compileConfig();
fs.watchFile(CONFIG_PATH, { interval: 1000 }, () => {
  try { compileConfig(); console.log('[STI] Hot-reload sti-chat.json'); } 
  catch(e){ console.error('[STI] Error recargando JSON:', e.message); }
});

// ================== Helpers de NLP ==================
const tpl = (str, ctx={}) => {
  if (!str) return '';
  const whats = STI?.settings?.whatsapp_link || 'https://wa.me/5493417422422';
  return String(str)
    .replace(/\{\{\s*whatsapp_link\s*\}\}/g, whats)
    .replace(/\{\{\s*nombre\s*\}\}/g, ctx.nombre ?? 'che')
    .replace(/\{\{\s*device\s*\}\}/g, ctx.device ?? 'equipo')
    .replace(/\{\{\s*issue_human\s*\}\}/g, ctx.issue_human ?? '');
};

function normalize(s=''){
  return normalizarTextoCompleto(String(s ?? ''));
}
function extractName(text){
  const n = normalize(text);
  for (const trig of NLP.names_triggers){
    const m = n.match(new RegExp(String(trig)+'\\s+([a-záéíóúñ]+)', 'i'));
    if (m) return m[1];
  }
  // Heurística: nombre al inicio
  const m2 = n.match(/^([a-záéíóúñ]+)\s+(mi|la|el|tengo|no|se|me|pc|notebook|compu|monitor|impresora)/i);
  return m2 ? m2[1] : null;
}
function extractDevice(text){
  const t = normalize(text);
  for (const d of NLP.devices) if (d.rx.test(t)) return d.key;
  return null;
}
function detectIssue(text){
  const t = normalize(text);
  for (const i of NLP.issues) if (i.rx.test(t)) return i.key;
  return null;
}
const saysStillBroken = (t) => /\b(sigue\s*igual|no\s*funcion[oó]|no\s*anda|sigue\s*mal|no\s*sirve)\b/i.test(normalize(t));
const saysSolved = (t) => /\b(se\s*solucion[oó]|qued[oó]|listo|ya\s*anda|funciona\s*bien)\b/i.test(normalize(t));

const stripWA = (s) => String(s || '').replace(/https?:\/\/wa\.me\/\d+[^\s]*/gi, '');

// ================== API ==================
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body || {};
    const raw = String(message || '');

    const sid = getSessionId(req);
    const ip  = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
    const ua  = req.headers['user-agent'] || 'ua';
    pushTranscript(sid, 'user', raw);

    const send = (content, meta={}) => {
      const reply = Array.isArray(content) ? content.join('\\n') : String(content || '');
      pushTranscript(sid, 'bot', reply);
      return res.json({ ok:true, reply, meta });
    };

    // 0) vacío o saludo
    const gs = STI?.sections?.greetings || {};
    const greetReply = gs.response || STI?.messages?.greeting || 'Hola 👋 ¿En qué te ayudo?';
    const greetTriggers = Array.isArray(gs.triggers) ? gs.triggers : [];
    const isGreeting = !normalize(raw) || isGreetingMessage(raw) || isGreetingMessage(normalize(raw)) || isArgGreeting(raw) ||
                       greetTriggers.some(rxTxt => new RegExp(rxTxt, 'i').test(normalize(raw)));
    if (isGreeting){
      resetMiss(ip);
      const menuTitle = STI?.sections?.menus?.help_menu_title || STI?.messages?.help_menu_title || 'Temas frecuentes';
      const menuItems = (STI?.sections?.menus?.help_menu || STI?.messages?.help_menu || []).map(i => `• ${i}`).join('\\n');
      const out = `${stripWA(greetReply)}\\n\\n**${menuTitle}**\\n${menuItems}`;
      return send(out, { showWhatsapp:false, phase:'greeting' });
    }

    // 1) nombre + device + issue
    const nombre = extractName(raw) || 'che';
    const device = extractDevice(raw) || 'equipo';
    let issueKey = detectIssue(raw);
    let sess = SESS.get(sid) || { lastIssueKey:null, lastDeviceKey:null, nombre };
    sess.nombre = nombre; sess.lastDeviceKey = device;

    // follow-ups según respuesta del usuario
    if (!issueKey && sess.lastIssueKey) {
      if (saysStillBroken(raw)) issueKey = sess.lastIssueKey + '__ADV'; // señal de avanzar a avanzados
      if (saysSolved(raw)) {
        resetMiss(ip);
        const solved = NLP.followup?.solved || '¡Genial!';
        SESS.set(sid, sess);
        return send(tpl(solved, { nombre, device }),
          { showWhatsapp:false, phase:'solved' });
      }
    }

    if (issueKey && !issueKey.endsWith('__ADV')) {
      resetMiss(ip);
      sess.lastIssueKey = issueKey;
      SESS.set(sid, sess);
      const template = NLP.templates[issueKey] || NLP.templates['default'] || 'Contame un poco más.';
      const ask = NLP.followup?.ask_result || '';
      const out = `${tpl(template, { nombre, device, issue_human: issueKey.replace(/_/g,' ') })}${ask ? '\\n\\n'+ask : ''}`;
      return send(out, { showWhatsapp:false, phase:'basic', issue: issueKey });
    }

    // 2) avanzados si el usuario dijo "sigue igual" tras un issue reconocido
    if (issueKey && issueKey.endsWith('__ADV')) {
      resetMiss(ip);
      const baseKey = sess.lastIssueKey;
      const intro = NLP.followup?.advanced_intro ? tpl(NLP.followup.advanced_intro, { nombre }) : 'Sigamos con pasos avanzados:';
      const steps = NLP.advanced?.[baseKey] || [];
      const ask = NLP.followup?.ask_result || '';
      const out = [intro].concat(steps.map((s, i)=> `${i+1}) ${s}`)).join('\\n');
      return send(ask ? `${out}\\n\\n${ask}` : out, { showWhatsapp:false, phase:'advanced', issue: baseKey });
    }

    // 3) Fallback + escalado controlado (sin botón WA hasta "hard")
    const limit = Number(STI?.settings?.fallback_escalation_after ?? 3);
    const currentMiss = bumpMiss(ip);
    if (currentMiss >= limit) {
      resetMiss(ip);
      const created = createTicketFromSession(sid, { ip, ua });
      let hard = (STI?.sections?.fallbacks?.hard || 'Te ofrezco asistencia por WhatsApp 👉 {{whatsapp_link}}');
      if (created.ok) hard = `${tpl(hard)}\\n\\n🧾 Ticket generado: *${created.id}*\\nAbrilo acá: ${created.linkHtml}`;
      return send(hard, { showWhatsapp:true, ticketId: created.ok ? created.id : null, phase:'escalate' });
    }
    const level = currentMiss >= Math.max(2, limit - 1) ? 'medio' : 'soft';
    const fb = (STI?.sections?.fallbacks?.[level]) || (level === 'medio'
      ? '¿Podés decirlo con otras palabras? 🙂'
      : 'Para ayudarte mejor, decime en una frase el problema.');
    return send(fb, { showWhatsapp:false, phase:`fallback-${level}` });

  } catch (e) {
    console.error('❌ ERROR /api/chat:', e.stack || e.message);
    return res.status(200).json({ ok:true, reply: 'No pude procesar tu consulta. Probá con una palabra clave como "no enciende", "pantalla negra", "sin internet".', meta:{ via:'error' } });
  }
});

// ===== Export WhatsApp (genera ticket y link corto) =====
app.get('/api/export/whatsapp', (req, res) => {
  const sid = getSessionId(req);
  const items = TRANSCRIPTS.get(sid) || [];
  if (!items.length) return res.json({ ok:false, error:'no_transcript', sessionId:sid });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
  const ua = req.headers['user-agent'] || 'ua';
  const created = createTicketFromSession(sid, { ip, ua });
  if (!created.ok) return res.json({ ok:false, error:'ticket_failed', sessionId:sid });

  const header = `Hola, necesito asistencia con mi equipo.\\r\\n`;
  const ticketLine = `🧾 Mi número de ticket es: *${created.id}*\\r\\n`;
  const linkLine = `Podés ver todo el detalle acá: ${created.linkHtml}\\r\\n`;
  const text = `${header}${ticketLine}${linkLine}`;
  const phone = '5493417422422';
  const wa_link = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  res.json({ ok:true, sessionId:sid, id:created.id, wa_link, ticket_url: created.linkHtml, preview:text, count: items.length });
});

// ===== Tickets JSON / HTML =====
app.get('/api/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const data = readTicket(id);
  if (!data) return res.status(404).json({ ok:false, error:'ticket_not_found', id });
  res.json({ ok:true, ticket: data });
});
app.get('/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const data = readTicket(id);
  if (!data) return res.status(404).type('text/html').send(`<h1>Ticket no encontrado</h1><p>ID: ${id}</p>`);

  const createdAt = new Date(data.createdAt).toLocaleString('es-AR');
  const rows = (data.items || []).map(m => {
    const who = m.role === 'user' ? 'Cliente' : 'STI';
    const when = new Date(m.ts || Date.now()).toLocaleString('es-AR');
    const txt = String(m.text || '').replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
    return `<tr><td style="white-space:nowrap;color:#9db1ff">${when}</td><td><strong>${who}:</strong> ${txt}</td></tr>`;
  }).join('\\n');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>STI — Ticket ${id}</title>
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
</style></head>
<body>
<div class="card">
  <h1>🧾 Ticket ${id}</h1>
  <div class="meta">Creado: ${createdAt}</div>
  <table>${rows}</table>
  <div class="cta">
    <a href="https://wa.me/5493417422422?text=${encodeURIComponent(`Hola, sigo el ticket ${id}.`) }" target="_blank" rel="noopener">Responder por WhatsApp</a>
    &nbsp;&nbsp;<a href="${PUBLIC_BASE_URL}/api/ticket/${id}" target="_blank" rel="noopener">Ver JSON</a>
  </div>
</div>
</body></html>`;
  res.type('html').send(html);
});

// ===== Health & root =====
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: STI?.version || '3.5',
    totalDevices: NLP.devices.length,
    totalIssues: NLP.issues.length,
    transcriptsDir: TRANSCRIPTS_DIR,
    publicBaseUrl: PUBLIC_BASE_URL,
    configPath: CONFIG_PATH
  });
});
app.get('/', (_req, res) => res.type('text').send('🧠 STI AI backend activo (v3.5, JSON unificado)'));

// ===== Arranque =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧠 STI AI backend escuchando en puerto ${PORT}`);
  console.log(`📄 Config usada: ${CONFIG_PATH}`);
  console.log(`📁 TRANSCRIPTS_DIR=${TRANSCRIPTS_DIR}`);
  console.log(`🌐 PUBLIC_BASE_URL=${PUBLIC_BASE_URL}`);
});
