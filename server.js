// server.js — STI Chat V4.3
// Flujo "nombre primero", NLP con regex, transcripts persistentes,
// y WhatsApp Ticket que adjunta el historial en el mensaje prellenado.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, 'sti-chat.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('ERROR leyendo sti-chat.json:', e.message);
    return {};
  }
}

let CFG = loadConfig();

// === Utils ===
function nowISO(){ return new Date().toISOString(); }
function capFirst(s=''){ return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()); }
function normalize(s=''){
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// === Nombre & problema helpers (inline) ===
const NOMBRE_RX = /\b(?:soy|me llamo|mi nombre es)\s+([a-záéíóúüñ]{2,20})\b/i;
function extraerNombre(text=''){
  const m = NOMBRE_RX.exec(text);
  if (m) return m[1];
  const solo = String(text).trim();
  if (/^[a-záéíóúüñ]{2,20}$/i.test(solo)) return solo;
  return null;
}
function esNombreValido(name=''){ return /^[a-záéíóúüñ]{2,20}$/i.test(name); }
function contieneProblema(norm, keywords=[]){
  if (!Array.isArray(keywords)) return false;
  return keywords.some(k => norm.includes(String(k).toLowerCase()));
}

// === Asegurar transcripts persistentes ===
const transcriptsDir = path.resolve(__dirname, (CFG.settings?.transcriptsDir || './data/transcripts'));
fs.mkdirSync(transcriptsDir, { recursive: true });

// === App ===
const app = express();
const ALLOWED_ORIGINS = [
  'https://stia.com.ar','http://stia.com.ar',
  'http://localhost:5173','http://localhost:5500',
  'https://sti-rosario-ai.onrender.com'
];
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error('Origen no permitido')),
  credentials: true
}));
app.use(express.json());

// Memoria de sesión simple (puede migrar a Redis)
const SESSIONS = new Map();

function renderNumbered(list) {
  if (!Array.isArray(list)) return '';
  return list.map((t, i) => `${i+1} - ${t}`).join('\n');
}
function appendTranscript(sessionId, role, text) {
  if (CFG.settings?.enable_transcripts === false) return;
  const file = path.resolve(transcriptsDir, `${sessionId}.txt`);
  const line = `[${nowISO()}] ${role.toUpperCase()}: ${text}\n`;
  fs.appendFile(file, line, ()=>{});
}

// === NLP helpers (desde JSON) ===
function matchByRegexArray(text, arr) {
  if (!Array.isArray(arr)) return null;
  for (const it of arr) {
    try {
      const rx = new RegExp(it.rx, 'i');
      if (rx.test(text)) return it.key;
    } catch {}
  }
  return null;
}
function findDevice(text){ return matchByRegexArray(text, CFG?.nlp?.devices || []); }
function findIssue(text){ return matchByRegexArray(text, CFG?.nlp?.issues || []); }
function issueLabel(key){
  const labels = CFG?.nlp?.issue_labels || {};
  return labels[key] || key || 'problema';
}
function deviceLabel(key){
  const item = (CFG?.nlp?.devices || []).find(d => d.key === key);
  if (!item) return 'equipo';
  const map = { pc:'PC', notebook:'notebook', monitor:'monitor', internet:'conexión', impresora:'impresora',
    teclado:'teclado', mouse:'mouse', audio:'audio', camara:'cámara', disco:'disco/SSD', video:'placa de video',
    puertos:'puertos', bateria:'batería' };
  return map[item.key] || item.key;
}
function tpl(str, name, deviceKey, issueKey){
  if (!str) return '';
  const nombre = name ? capFirst(name) : '';
  const device = deviceLabel(deviceKey);
  const issueHuman = issueLabel(issueKey);
  let out = String(str);
  out = out.replace(/\{\{\s*nombre\s*\}\}/gi, nombre)
           .replace(/\{\{\s*device\s*\}\}/gi, device)
           .replace(/\{\{\s*issue_human\s*\}\}/gi, issueHuman);
  if (CFG.sections?.anydesk){
    out = out.replace(/\{\{\s*ANYDESK_INSTALAR\s*\}\}/g, '- ' + CFG.sections.anydesk.instalar.join('\\n- '));
    out = out.replace(/\{\{\s*ANYDESK_DESINSTALAR\s*\}\}/g, '- ' + CFG.sections.anydesk.desinstalar.join('\\n- '));
    out = out.replace(/\{\{\s*ANYDESK_CAMBIAR\s*\}\}/g, '- ' + CFG.sections.anydesk.cambiar_id.join('\\n- '));
  }
  out = out.replace(/\*/g, '');
  return out;
}

// ===== WhatsApp Ticket =====
function readTranscript(sessionId){
  try {
    const file = path.resolve(transcriptsDir, `${sessionId}.txt`);
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  } catch { return ''; }
}
function buildWhatsAppTicket(sessionId, name=null, lastDevice=null, lastIssue=null){
  const num   = (CFG.settings?.whatsapp_number || '').trim();
  const prefs = CFG.settings?.whatsapp_ticket || {};
  const prefix = prefs.prefix || 'Hola STI 👋. Vengo del chat web. Dejo mi consulta:';

  const headerLines = [];
  headerLines.push(prefix);
  if (name) headerLines.push(`• Cliente: ${capFirst(name)}`);
  if (lastDevice) headerLines.push(`• Equipo: ${deviceLabel(lastDevice)}`);
  if (lastIssue) headerLines.push(`• Problema: ${issueLabel(lastIssue)}`);

  let transcript = readTranscript(sessionId) || '';
  if (prefs.include_timestamp === false){
    transcript = transcript.replace(/\[\d{4}-\d{2}-\d{2}T.*?\]\s*/g, '');
  }

  const header = headerLines.join('\n');
  let body = `${header}\n\n${transcript}`;

  // Limitar longitud (JS correcto)
  const maxChars = Math.max(800, Math.min(Number(prefs.max_chars || 1600), 3000));
  if (body.length > maxChars) {
    body = body.slice(-maxChars);       // ← esta es la línea clave
    body = '…\n' + body;
  }

  const encoded = encodeURIComponent(body);
  const link = `https://wa.me/${num}?text=${encoded}`;
  return { link, body };
}


// ===== Rutas =====
app.get('/api/health', (req, res)=>{
  res.json({
    ok: true,
    bot: CFG.bot,
    version: CFG.version,
    intents_count: CFG?.nlp?.issues?.length || 0,
    transcriptsDir
  });
});

app.post('/api/reload', (req, res)=>{
  CFG = loadConfig();
  res.json({ ok: true, version: CFG.version, issues: CFG?.nlp?.issues?.length || 0 });
});

app.get('/api/greeting', (req, res) => {
  const msg = (CFG.messages_v4?.greeting?.name_request)
    || '👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?';
  res.json({ ok: true, greeting: msg });
});

app.get('/api/whatsapp-ticket', (req, res) => {
  const sessionId = String(req.query.sessionId || 'default');
  const ses = SESSIONS.get(sessionId);
  const name = ses?.name || null;
  const { lastDevice, lastIssue } = (ses || {});
  const { link, body } = buildWhatsAppTicket(sessionId, name, lastDevice, lastIssue);
  appendTranscript(sessionId, 'assistant', 'Se generó link de WhatsApp con ticket');
  res.json({ ok: true, link });
});

app.get('/api/transcript/:sid', (req, res) => {
  const sessionId = String(req.params.sid);
  const txt = readTranscript(sessionId);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(txt || '');
});

// ----- Core chat -----
app.post('/api/chat', (req, res)=>{
  try {
    const { text, sessionId } = req.body || {};
    if (!text) return res.json({ ok:false, reply: 'No pude procesar tu consulta.' });
    const raw = String(text);
    const norm = normalize(raw);
    const sid = String(sessionId || 'default');

    if (!SESSIONS.has(sid)) {
      SESSIONS.set(sid, { stage: 'ask_name', name: null, tries: 0, lastIssue: null, lastDevice: null });
    }
    const ses = SESSIONS.get(sid);
    appendTranscript(sid, 'user', raw);

    // 1) Nombre primero
    if (ses.stage === 'ask_name') {
      if (contieneProblema(norm, CFG?.settings?.problem_keywords)) {
        const ask = CFG.messages_v4?.greeting?.name_request
          || 'Hola! Soy Tecnos de STI. ¿Cómo te llamás? (Ej: soy Juan / me llamo Ana).';
        appendTranscript(sid, 'assistant', ask);
        return res.json({ ok: true, reply: ask, stage: 'ask_name' });
      }
      if (/^\s*omitir\s*$/i.test(norm)) {
        ses.name = null;
        ses.stage = 'ask_problem';
        const msg = CFG.messages_v4?.greeting?.skip_name
          || 'Listo, seguimos sin nombre. Contame en pocas palabras cuál es el problema.';
        appendTranscript(sid, 'assistant', msg);
        return res.json({ ok: true, reply: msg, stage: ses.stage });
      }
      const nameCandidate = extraerNombre(raw);
      if (nameCandidate && esNombreValido(nameCandidate)) {
        ses.name = nameCandidate;
        ses.stage = 'ask_problem';
        const msg = CFG.messages_v4?.greeting?.name_confirm
          || 'Genial {NOMBRE}! Contame en pocas palabras cuál es el problema.';
        const msgP = msg.replace(/\{NOMBRE\}/g, capFirst(ses.name));
        appendTranscript(sid, 'assistant', msgP);
        return res.json({ ok: true, reply: msgP, stage: ses.stage });
      }
      ses.tries++;
      const again = CFG.messages_v4?.greeting?.name_request
        || 'Hola! Soy Tecnos de STI. ¿Cómo te llamás? También podés escribir "omitir".';
      appendTranscript(sid, 'assistant', again);
      return res.json({ ok: true, reply: again, stage: 'ask_name' });
    }

    // 2) Detectar problema + dispositivo
    if (ses.stage === 'ask_problem') {
      const issueKey  = findIssue(norm);
      const deviceKey = findDevice(norm);

      if (deviceKey && !issueKey) {
        const probe = CFG.messages_v4?.device_probe
          || "Perfecto, {{nombre}}. Ya tengo que es {{device}}. Ahora decime brevemente cuál es el problema.";
        const reply = tpl(probe, ses.name, deviceKey, null);
        appendTranscript(sid, 'assistant', reply);
        return res.json({ ok: true, reply, stage: 'ask_problem' });
      }

      if (!issueKey && !deviceKey) {
        ses.tries++;
        if (ses.tries >= (CFG.settings?.fallback_escalation_after || 3)) {
          const msg = (CFG.sections?.fallbacks?.hard || 'Te ofrezco asistencia por WhatsApp: {{whatsapp_link}}')
            .replace(/\{\{\s*whatsapp_link\s*\}\}/g, CFG.settings?.whatsapp_link || '');
          appendTranscript(sid, 'assistant', msg);
          return res.json({ ok: true, reply: msg, stage: 'ask_problem' });
        }
        const soft = CFG.sections?.fallbacks?.medio || '¿Podés decirlo con otras palabras o elegir un tema?';
        appendTranscript(sid, 'assistant', soft);
        return res.json({ ok: true, reply: soft, stage: 'ask_problem' });
      }

      ses.lastIssue = issueKey || ses.lastIssue;
      ses.lastDevice = deviceKey || ses.lastDevice;

      // Template base
      const template = (issueKey && CFG?.nlp?.response_templates?.[issueKey])
        ? CFG.nlp.response_templates[issueKey]
        : (CFG?.nlp?.response_templates?.default || 'Entiendo, {{nombre}}. Vamos a revisar tu {{device}} con {{issue_human}}.');

      let reply = tpl(template, ses.name, ses.lastDevice, ses.lastIssue);

      const opts = CFG.messages_v4?.default_options || [
        'Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'
      ];
      const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
      reply = `${reply}\n\n${after}\n${renderNumbered(opts)}`;

      ses.stage = 'in_flow';
      appendTranscript(sid, 'assistant', reply);
      return res.json({ ok: true, reply, stage: ses.stage });
    }

    // 3) Dentro del flujo
    if (ses.stage === 'in_flow') {
      const choice = normalize(raw);
      const map = CFG.messages_v4?.default_options_map || { '1': 'advanced', '2': 'whatsapp_ticket' };

      if (map[choice]) {
        if (map[choice] === 'advanced') {
          const steps = (ses.lastIssue && CFG?.nlp?.advanced_steps?.[ses.lastIssue]) || [];
          const intro = (CFG?.nlp?.followup_texts?.advanced_intro || 'Sigamos con unos chequeos más avanzados, {{nombre}}:');
          const introP = tpl(intro, ses.name, ses.lastDevice, ses.lastIssue);
          const body = renderNumbered(steps);
          const out = `${introP}\n\n${body}`;
          appendTranscript(sid, 'assistant', out);
          return res.json({ ok: true, reply: out, stage: 'in_flow' });
        }
        if (map[choice] === 'whatsapp_ticket') {
          const { link } = buildWhatsAppTicket(sid, ses.name, ses.lastDevice, ses.lastIssue);
          const msg = `Te paso nuestro WhatsApp${ses.name ? ', ' + capFirst(ses.name) : ''}:\n${link}\n(Ya adjunté esta conversación en el mensaje para que el técnico no te haga repetir nada).`;
          appendTranscript(sid, 'assistant', 'Se ofreció WhatsApp con ticket');
          return res.json({ ok: true, reply: msg, stage: 'post_flow', whatsappLink: link });
        }
      }
      const opts = CFG.messages_v4?.default_options || [
        'Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'
      ];
      const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
      const reply = `${after}\n${renderNumbered(opts)}`;
      appendTranscript(sid, 'assistant', reply);
      return res.json({ ok: true, reply, stage: 'in_flow' });
    }

    const bye = '¿Necesitás algo más? Puedo ayudarte con otra consulta.';
    appendTranscript(sid, 'assistant', bye);
    return res.json({ ok: true, reply: bye, stage: 'post_flow' });

  } catch (e) {
    console.error('ERROR /api/chat:', e);
    return res.json({ ok:false, reply: 'Ocurrió un error procesando tu mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`STI Chat V4.3 listo en http://localhost:${PORT}`));
