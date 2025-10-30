import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ===== Persistencia =====
const DATA_BASE        = process.env.DATA_BASE        || '/data';
const TRANSCRIPTS_DIR  = process.env.TRANSCRIPTS_DIR  || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR      = process.env.TICKETS_DIR      || path.join(DATA_BASE, 'tickets');
const LOGS_DIR         = process.env.LOGS_DIR         || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL  = process.env.PUBLIC_BASE_URL  || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER  = process.env.WHATSAPP_NUMBER  || '5493417422422';
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }
const nowIso = () => new Date().toISOString();

// ===== Carga de flujos/chat =====
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = null;
function loadChat() {
  CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
  console.log('[chat] Cargado', CHAT.version, 'desde', CHAT_JSON_PATH);
}
try { loadChat(); } catch (e) { console.error('No pude cargar sti-chat.json:', e.message); CHAT = {}; }

// ===== Helpers NLP =====
const deviceMatchers = (CHAT?.nlp?.devices || []).map(d => ({ key: d.key, rx: new RegExp(d.rx, 'i') }));
const issueMatchers  = (CHAT?.nlp?.issues  || []).map(i => ({ key: i.key, rx: new RegExp(i.rx, 'i') }));

function detectDevice(txt='') {
  for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key;
  return null;
}
function detectIssue(txt='') {
  for (const i of issueMatchers) if (i.rx.test(txt)) return i.key;
  return null;
}
const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';

function tplDefault({ nombre='', device='equipo', issueKey=null }) {
  const base = CHAT?.nlp?.response_templates?.default || 'Entiendo, {{nombre}}. Revisemos tu {{device}} con {{issue_human}}.';
  return base
    .replace('{{nombre}}', nombre || '')
    .replace('{{device}}', device || 'equipo')
    .replace('{{issue_human}}', issueHuman(issueKey));
}

// ===== Estado por sesión (memoria simple en RAM) =====
const sessions = new Map(); // sessionId => { name, device, issueKey, stage, fallbackCount }
function getState(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, { name:null, device:null, issueKey:null, stage:'start', fallbackCount:0 });
  return sessions.get(sessionId);
}

// ===== Health / Reload =====
app.get('/api/health', (req, res) => {
  res.json({ ok:true, hasOpenAI:!!process.env.OPENAI_API_KEY, usingNewFlows:true, version: CHAT?.version || '4.6.x',
             paths:{ data:DATA_BASE, transcripts:TRANSCRIPTS_DIR, tickets:TICKETS_DIR } });
});
app.post('/api/reload', (req,res)=>{ try{ loadChat(); res.json({ok:true, version:CHAT.version}); }catch(e){ res.json({ok:false, error:e.message}); } });

// ===== Transcript =====
app.get('/api/transcript/:sid', (req,res)=>{
  const sid = String(req.params.sid||'').replace(/[^a-zA-Z0-9._-]/g,'');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type','text/plain; charset=utf-8'); res.send(fs.readFileSync(file,'utf8'));
});

// ===== WhatsApp ticket =====
app.post('/api/whatsapp-ticket', (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    const lines = [];
    lines.push(`STI • Servicio Técnico Inteligente — Ticket ${ticketId}`);
    lines.push(`Generado: ${nowIso()}`);
    if (name)   lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sessionId) lines.push(`Session: ${sessionId}`);
    lines.push('');
    for (const m of history) lines.push(`[${m.ts || nowIso()}] ${(m.who==='user'?'USER':'ASSISTANT')}: ${m.text}`);
    fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), lines.join('\n'), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    let waText = `${CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI 👋. Vengo del chat web. Dejo mi consulta:'}\n`;
    if (name)   waText += `🧑‍💻 Cliente: ${name}\n`;
    if (device) waText += `💻 Equipo: ${device}\n`;
    waText += `\n🧾 Ticket: ${ticketId}\n🔗 Detalle completo: ${publicUrl}`;
    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
    res.json({ ok:true, ticketId, publicUrl, waUrl });
  } catch (e) { console.error('[whatsapp-ticket]', e); res.status(500).json({ok:false}); }
});

// ===== Página pública /ticket/:id (OG) =====
app.get('/ticket/:id', (req,res)=>{
  const id = String(req.params.id||'').replace(/[^A-Z0-9-]/g,'');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('Ticket no encontrado');
  const content = fs.readFileSync(file,'utf8');
  const title = `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  const desc = (content.split('\n').slice(0,8).join(' ')||'').slice(0,200);
  const url = `${PUBLIC_BASE_URL}/ticket/${id}`;
  const logo = `${PUBLIC_BASE_URL}/logo.png`;
  res.set('Content-Type','text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="article"><meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${logo}"><meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${logo}">
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto}
h1{font-size:20px;margin:0 0 6px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}</style>
</head><body><h1>${title}</h1>
<p><a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a></p>
<pre>${content.replace(/[&<>]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre></body></html>`);
});

// ===== Greeting =====
app.post('/api/greeting', (req,res)=>{
  const text = CHAT?.messages_v4?.greeting?.name_request
    || '👋 ¡Hola! Soy Tecnos 🤖 de STI. ¿Cómo te llamás? (o escribí "omitir")';
  res.json({ ok:true, reply:text });
});

// ===== Chat con estado =====
app.post('/api/chat', (req, res) => {
  try {
    const { text = '', sessionId = 'web-unknown' } = req.body || {};
    const t = text.trim();
    const s = getState(sessionId);

    // === persistir transcript
    const tf = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);
    fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`, 'utf8');

    let reply = '';
    let options = [];
    const afterStepsOptions = CHAT?.messages_v4?.default_options || ['Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'];
    const fallbackLimit = CHAT?.settings?.fallback_escalation_after ?? 3;

    // === 1) nombre
    if (!s.name) {
      const m = t.match(/^(?:soy\s+)?([a-záéíóúñ]{2,20})$/i);
      if (m && m[1]) {
        s.name = m[1].toLowerCase();
        s.stage = 'ask_device';
        const template = CHAT?.messages_v4?.greeting?.name_confirm || '¡Genial {NOMBRE}! Ahora decime dispositivo o problema.';
        reply = template.replace('{NOMBRE}', s.name);
      } else if (/^omitir$/i.test(t)) {
        s.name = '';
        s.stage = 'ask_device';
        reply = CHAT?.messages_v4?.greeting?.skip_name || 'Listo, seguimos sin nombre. ¿Qué dispositivo o problema tenés?';
      } else {
        reply = CHAT?.messages_v4?.greeting?.name_request
          || '👋 ¡Hola! Soy Tecnos 🤖 de STI. ¿Cómo te llamás? (o escribí "omitir")';
      }
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`, 'utf8');
      return res.json({ ok:true, reply, options:[] });
    }

    // === 2) device
    if (!s.device) {
      const dev = detectDevice(t) || t; // si puso "teclado" lo tomamos textual
      if (dev) {
        s.device = dev;
        s.stage = 'ask_issue';
        reply = (CHAT?.messages_v4?.device_probe || 'Perfecto, {{nombre}}. Tomo nota del equipo: {{device}}. Ahora contame brevemente cuál es el problema.')
                  .replace('{{nombre}}', s.name || '')
                  .replace('{{device}}', s.device);
      } else {
        reply = (CHAT?.sections?.fallbacks?.medio || '¿Podés decirme el tipo de equipo? PC, notebook, teclado, etc.');
      }
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`, 'utf8');
      return res.json({ ok:true, reply, options:[] });
    }

    // === 3) issue
    let issueKey = detectIssue(t);
    if (issueKey) s.issueKey = issueKey;

    if (!s.issueKey) {
      s.fallbackCount++;
      reply = (s.fallbackCount >= fallbackLimit)
        ? (CHAT?.sections?.fallbacks?.hard || 'Te ofrezco asistencia por WhatsApp: https://wa.me/5493417422422')
        : (CHAT?.sections?.fallbacks?.medio || '¿Podés decirlo con otras palabras o elegir un tema?');
      options = (s.fallbackCount >= fallbackLimit) ? ['Enviar a WhatsApp (con ticket)'] : [];
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`, 'utf8');
      return res.json({ ok:true, reply, options });
    }

    // === 4) respuesta con pasos + opciones
    const pasos = CHAT?.nlp?.advanced_steps?.[s.issueKey] || [];
    const intro = CHAT?.nlp?.followup_texts?.advanced_intro || 'Sigamos con chequeos más avanzados, {{nombre}}:';
    const textoPasos = pasos.length ? `\n${intro.replace('{{nombre}}', s.name || '')}\n• ${pasos.join('\n• ')}` : '';
    reply = tplDefault({ nombre:s.name, device:s.device, issueKey:s.issueKey }) + textoPasos;
    options = afterStepsOptions;  // recién acá mostramos WA

    fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`, 'utf8');
    return res.json({ ok:true, reply, options });
  } catch (e) {
    console.error('[api/chat]', e);
    return res.status(200).json({ ok:true, reply:'Tuve un problema momentáneo, probá de nuevo.', options:[] });
  }
});

// ===== Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[STI Chat V4.6] Up on :${PORT} — data=${DATA_BASE}`));
