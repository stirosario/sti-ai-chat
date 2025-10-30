import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path'; // ya lo tenés

// === Instancia y middlewares básicos ===
const app = express();                    // ⬅️ ESTA LÍNEA FALTABA
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ============================
//  PERSISTENCIA EN /data (Render)
// ============================
const DATA_BASE        = process.env.DATA_BASE        || '/data';
const TRANSCRIPTS_DIR  = process.env.TRANSCRIPTS_DIR  || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR      = process.env.TICKETS_DIR      || path.join(DATA_BASE, 'tickets');
const LOGS_DIR         = process.env.LOGS_DIR         || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL  = process.env.PUBLIC_BASE_URL  || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER  = process.env.WHATSAPP_NUMBER  || '5493417422422';

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}
// Helpercito
function nowIso() { return new Date().toISOString(); }

// ============================
//  /api/health
// ============================
app.get('/api/health', (req, res) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const info = {
    ok: true,
    hasOpenAI,
    usingNewFlows: true,
    version: '4.6.0',
    paths: {
      data: DATA_BASE,
      transcripts: TRANSCRIPTS_DIR,
      tickets: TICKETS_DIR
    }
  };
  res.json(info);
});

// ============================
//  /api/transcript/:sid  (devuelve transcript plano si existe)
// ============================
app.get('/api/transcript/:sid', (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(fs.readFileSync(file, 'utf8'));
});

// ============================
//  /api/whatsapp-ticket  (arma ticket + link público + URL de WA)
//  Espera { name, device, sessionId, history:[{who:'user'|'assistant', text, ts?}] }
// ============================
app.post('/api/whatsapp-ticket', express.json(), async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};

    // 1) ID de ticket
    const ts = new Date();
    const ymd = ts.toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;

    // 2) Guardamos el contenido "lindo" del ticket
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
    const ticketPath = path.join(TICKETS_DIR, `${ticketId}.txt`);
    fs.writeFileSync(ticketPath, lines.join('\n'), 'utf8');

    // 3) URL pública del ticket
    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;

    // 4) Texto para WhatsApp (corto + link público)
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

// ============================
//  Página pública del ticket con Open Graph (/ticket/:id)
//  - Devuelve HTML con <meta og:...> para que WhatsApp/Telegram muestren tarjeta
// ============================
app.get('/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/[^A-Z0-9-]/g, '');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send('Ticket no encontrado');

  const content = fs.readFileSync(file, 'utf8');
  const title = `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  const desc  = (content.split('\n').slice(0, 8).join(' ') || '').slice(0, 200);
  const url   = `${PUBLIC_BASE_URL}/ticket/${id}`;
  const logo  = `${PUBLIC_BASE_URL}/logo.png`; // si tenés un OG image, ajustá path

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title}</title>
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
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px;}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto;}
h1{font-size:20px;margin:0 0 6px;}
a{color:#2563eb;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
  <h1>${title}</h1>
  <p><a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a></p>
  <pre>${content.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[STI Chat V4.6] Up on :${PORT} — data=${DATA_BASE}`);
});