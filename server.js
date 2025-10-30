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

// ===== Paths persistentes (Render) =====
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
  try {
    CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
    console.log('[chat] Cargado', CHAT.version, 'desde', CHAT_JSON_PATH);
    return true;
  } catch (e) {
    console.error('[chat] No se pudo cargar sti-chat.json:', e.message);
    CHAT = null;
    return false;
  }
}
loadChat();

// ===== Health =====
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    usingNewFlows: true,
    version: CHAT?.version || '4.6.x',
    paths: { data: DATA_BASE, transcripts: TRANSCRIPTS_DIR, tickets: TICKETS_DIR }
  });
});

// ===== Reload (por si editás sti-chat.json) =====
app.post('/api/reload', (req, res) => {
  const ok = loadChat();
  res.json({ ok, version: CHAT?.version || null });
});

// ===== Transcript plano =====
app.get('/api/transcript/:sid', (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(fs.readFileSync(file, 'utf8'));
});

// ===== WhatsApp ticket =====
app.post('/api/whatsapp-ticket', (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    const ts = new Date();
    const ymd = ts.toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;

    const lines = [];
    lines.push(`STI • Servicio Técnico Inteligente — Ticket ${ticketId}`);
    lines.push(`Generado: ${nowIso()}`);
    if (name)   lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sessionId) lines.push(`Session: ${sessionId}`);
    lines.push('');
    for (const m of history) {
      const t = m.ts || nowIso();
      const who = (m.who === 'user') ? 'USER' : 'ASSISTANT';
      lines.push(`[${t}] ${who}: ${m.text}`);
    }
    fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), lines.join('\n'), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    const prefix = 'Hola STI 👋. Vengo del chat web. Dejo mi consulta:';
    let waText = `${prefix}\n`;
    if (name)   waText += `🧑‍💻 Cliente: ${name}\n`;
    if (device) waText += `💻 Equipo: ${device}\n`;
    waText += `\n🧾 Ticket: ${ticketId}\n🔗 Detalle completo: ${publicUrl}`;
    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

    res.json({ ok:true, ticketId, publicUrl, waUrl });
  } catch (err) {
    console.error('[whatsapp-ticket]', err);
    res.status(500).json({ ok:false, error:'ticket_build_failed' });
  }
});

// ===== Página pública ticket (OG) =====
app.get('/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/[^A-Z0-9-]/g, '');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('Ticket no encontrado');
  const content = fs.readFileSync(file, 'utf8');
  const title = `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  const desc  = (content.split('\n').slice(0, 8).join(' ') || '').slice(0, 200);
  const url   = `${PUBLIC_BASE_URL}/ticket/${id}`;
  const logo  = `${PUBLIC_BASE_URL}/logo.png`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="es"><head>
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
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto}
h1{font-size:20px;margin:0 0 6px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}</style>
</head><body>
<h1>${title}</h1><p><a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a></p>
<pre>${content.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>
</body></html>`);
});

// ======== ENDPOINTS QUE FALTABAN ========

// Saludo inicial para el front
app.post('/api/greeting', (req, res) => {
  const text = CHAT?.messages_v4?.greeting?.name_request
    || '👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás? (o escribí "omitir")';
  res.json({ ok: true, reply: text });
});

// Chat mínimo (eco + opciones) para evitar 404 y “Error de conexión”
app.post('/api/chat', (req, res) => {
  try {
    const { text = '', sessionId = 'web-unknown', name } = req.body || {};
    // Guardar transcript
    const file = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lineUser = `[${nowIso()}] USER: ${text}\n`;
    fs.writeFileSync(file, prev + lineUser, 'utf8');

    // Respuesta simple usando textos del JSON
    let reply = '';
    if (!name && /^(soy\s+)?[a-záéíóúñ]{2,15}$/i.test(text.trim())) {
      reply = CHAT?.messages_v4?.greeting?.name_confirm?.replace('{NOMBRE}', text.trim()) 
           || `¡Genial ${text.trim()}! Contame qué dispositivo o problema tenés.`;
    } else {
      reply = CHAT?.nlp?.response_templates?.default
        ?.replace('{{nombre}}', name || '')
        ?.replace('{{device}}', 'equipo')
        ?.replace('{{issue_human}}', 'lo que comentás')
        || 'Perfecto, contame un poco más así te ayudo.';
    }

    const options = CHAT?.messages_v4?.default_options || [
      'Realizar pruebas avanzadas',
      'Enviar a WhatsApp (con ticket)'
    ];

    const lineBot = `[${nowIso()}] ASSISTANT: ${reply}\n`;
    fs.appendFileSync(file, lineBot, 'utf8');

    res.json({ ok: true, reply, options });
  } catch (e) {
    console.error('[api/chat]', e);
    res.status(200).json({ ok: true, reply: 'Tuve un problema momentáneo, probá de nuevo.', options: [] });
  }
});

// =========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[STI Chat V4.6] Up on :${PORT} — data=${DATA_BASE}`));
