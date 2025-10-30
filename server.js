// server.js — STI Chat V4.4 (OpenAI opcional + Ticket WhatsApp + transcripts)
// - Flujo “nombre primero” con orden corregido
// - NLP por regex desde sti-chat.json (fallback)
// - OpenAI para tests rápidos / avanzados (toggle por env)
// - Ticket WhatsApp con historial completo (slice fijo JS)
// - Endpoints: /api/health, /api/reload, /api/greeting, /api/chat, /api/whatsapp-ticket, /api/transcript/:sid

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

// ====== OpenAI config (opcionales por entorno) ======
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const USE_OPENAI_ONLY = String(process.env.USE_OPENAI_ONLY || '0') === '1'; // si es "1", prioriza IA siempre
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ====== Paths / Config ======
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

// ====== Utils ======
function nowISO(){ return new Date().toISOString(); }
function capFirst(s=''){ return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()); }
function normalize(s=''){
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ====== Name / problem helpers ======
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

// ====== Transcripts ======
const transcriptsDir = path.resolve(__dirname, (CFG.settings?.transcriptsDir || './data/transcripts'));
fs.mkdirSync(transcriptsDir, { recursive: true });

function appendTranscript(sessionId, role, text) {
  if (CFG.settings?.enable_transcripts === false) return;
  const file = path.resolve(transcriptsDir, `${sessionId}.txt`);
  const line = `[${nowISO()}] ${role.toUpperCase()}: ${text}\n`;
  fs.appendFile(file, line, ()=>{});
}
function readTranscript(sessionId){
  try {
    const file = path.resolve(transcriptsDir, `${sessionId}.txt`);
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  } catch { return ''; }
}

// ====== App ======
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

// Memoria simple (podés migrar a Redis)
const SESSIONS = new Map();

function renderNumbered(list) {
  if (!Array.isArray(list)) return '';
  return list.map((t, i) => `${i+1} - ${t}`).join('\n');
}

// ====== NLP helpers (desde JSON) ======
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

// ====== OpenAI helpers (IA) ======
function buildAIToneHeader(nombre, deviceKey){
  const deviceHum = deviceKey ? deviceLabel(deviceKey) : 'equipo';
  const cliente = nombre ? `Cliente: ${capFirst(nombre)}.` : '';
  return `Actuá como Técnico Senior de STI (Argentina). ${cliente} Dispositivo: ${deviceHum}.
Escribí en tono claro, argentino (vos), sin parrafadas, en bullets concretos.`;
}

async function aiQuickTests(textoCliente, nombre=null, deviceKey=null){
  if (!openai) return "La IA no está habilitada en el servidor. Probemos con pasos estándar.";
  const header = buildAIToneHeader(nombre, deviceKey);
  const prompt = `${header}

El cliente dijo: """${textoCliente}"""

Devolveme EXACTAMENTE este formato:

✅ Tests rápidos:
1) ...
2) ...
3) ...
4) ...
5) ...

Cerrá con: "Decime si alguno funcionó o si querés que te pase pruebas avanzadas o hablar directo con técnico (WhatsApp)."
`;
  try{
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role:'user', content: prompt }],
      temperature: 0.3, max_tokens: 500
    });
    return r.choices?.[0]?.message?.content?.trim() || "No pude generar pasos ahora.";
  }catch(e){
    console.error('OpenAI quick error:', e?.message || e);
    return "Ahora no pude generar los pasos con IA. Probemos con los básicos y si no va, te paso avanzados o WhatsApp.";
  }
}

async function aiAdvancedTests(textoCliente, nombre=null, deviceKey=null){
  if (!openai) return "La IA no está habilitada. Probemos con avanzados estándar.";
  const header = buildAIToneHeader(nombre, deviceKey);
  const prompt = `${header}

El cliente dijo: """${textoCliente}"""

Generá 3–4 PRUEBAS AVANZADAS (pocas palabras, técnicas). Formato:

⚙️ Tests avanzados:
1) ...
2) ...
3) ...
4) ...

Cerrá con: "Si no se resolvió, te paso el WhatsApp con el ticket para que no tengas que repetir nada."
`;
  try{
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role:'user', content: prompt }],
      temperature: 0.2, max_tokens: 450
    });
    return r.choices?.[0]?.message?.content?.trim() || "No pude generar avanzados ahora.";
  }catch(e){
    console.error('OpenAI adv error:', e?.message || e);
    return "La IA no respondió. Si querés, te paso directo el WhatsApp con el ticket.";
  }
}

// ====== WhatsApp Ticket ======
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
    body = body.slice(-maxChars); // últimos N caracteres
    body = '…\n' + body;
  }

  const encoded = encodeURIComponent(body);
  const link = `https://wa.me/${num}?text=${encoded}`;
  return { link, body };
}

// ====== Rutas ======
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
  const { link } = buildWhatsAppTicket(sessionId, name, lastDevice, lastIssue);
  appendTranscript(sessionId, 'assistant', 'Se generó link de WhatsApp con ticket');
  res.json({ ok: true, link });
});

app.get('/api/transcript/:sid', (req, res) => {
  const sessionId = String(req.params.sid);
  const txt = readTranscript(sessionId);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(txt || '');
});

// ====== Core chat ======
app.post('/api/chat', async (req, res)=>{
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

    // === 1) Nombre primero (orden corregido)
    if (ses.stage === 'ask_name') {
      if (/^\s*omitir\s*$/i.test(norm)) {
        ses.name = null;
        ses.stage = 'ask_problem';
        const msg = CFG.messages_v4?.greeting?.skip_name
          || 'Listo, seguimos sin nombre. Contame en pocas palabras cuál es el problema.';
        appendTranscript(sid, 'assistant', msg);
        return res.json({ ok: true, reply: msg, stage: ses.stage });
      }
      const nameCandidate = extraerNombre(raw); // primero intento extraer nombre
      if (nameCandidate && esNombreValido(nameCandidate)) {
        ses.name = nameCandidate;
        ses.stage = 'ask_problem';
        const msg = CFG.messages_v4?.greeting?.name_confirm
          || 'Genial {NOMBRE}! Contame en pocas palabras cuál es el problema.';
        const msgP = msg.replace(/\{NOMBRE\}/g, capFirst(ses.name));
        appendTranscript(sid, 'assistant', msgP);
        return res.json({ ok: true, reply: msgP, stage: ses.stage });
      }
      // si no pude extraer nombre y detecto que ya trajo problema, igual pido nombre amablemente
      if (contieneProblema(norm, CFG?.settings?.problem_keywords)) {
        const ask = CFG.messages_v4?.greeting?.name_request
          || 'Hola! Soy Tecnos de STI. ¿Cómo te llamás? (Ej: soy Juan / me llamo Ana).';
        appendTranscript(sid, 'assistant', ask);
        return res.json({ ok: true, reply: ask, stage: 'ask_name' });
      }
      // pedir nombre otra vez
      ses.tries++;
      const again = CFG.messages_v4?.greeting?.name_request
        || 'Hola! Soy Tecnos de STI. ¿Cómo te llamás? También podés escribir "omitir".';
      appendTranscript(sid, 'assistant', again);
      return res.json({ ok: true, reply: again, stage: 'ask_name' });
    }

    // === 2) Detectar problema + dispositivo
    if (ses.stage === 'ask_problem') {
      const issueKey  = findIssue(norm);
      const deviceKey = findDevice(norm);

      // Si solo mencionó dispositivo → pedir problema
      if (deviceKey && !issueKey) {
        const probe = CFG.messages_v4?.device_probe
          || "Perfecto, {{nombre}}. Ya tengo que es {{device}}. Ahora decime brevemente cuál es el problema.";
        const reply = tpl(probe, ses.name, deviceKey, null);
        appendTranscript(sid, 'assistant', reply);
        return res.json({ ok: true, reply, stage: 'ask_problem' });
      }

      // ===== OpenAI prioridad si está activado o si no hay issue detectado =====
      if (USE_OPENAI_ONLY || !issueKey) {
        ses.lastDevice = deviceKey || ses.lastDevice;
        ses.lastIssue  = issueKey || ses.lastIssue;
        const ai = await aiQuickTests(raw, ses.name, ses.lastDevice);
        const opts = CFG.messages_v4?.default_options || ['Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'];
        const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
        const reply = `${ai}\n\n${after}\n${renderNumbered(opts)}`;
        ses.stage = 'in_flow';
        appendTranscript(sid, 'assistant', reply);
        return res.json({ ok:true, reply, stage: ses.stage });
      }

      // ===== Flujo estático (si hay issue detectado y no forzamos IA) =====
      ses.lastIssue = issueKey || ses.lastIssue;
      ses.lastDevice = deviceKey || ses.lastDevice;

      const template = (issueKey && CFG?.nlp?.response_templates?.[issueKey])
        ? CFG.nlp.response_templates[issueKey]
        : (CFG?.nlp?.response_templates?.default || 'Entiendo, {{nombre}}. Vamos a revisar tu {{device}} con {{issue_human}}.');
      let reply = tpl(template, ses.name, ses.lastDevice, ses.lastIssue);

      const opts = CFG.messages_v4?.default_options || ['Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'];
      const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
      reply = `${reply}\n\n${after}\n${renderNumbered(opts)}`;

      ses.stage = 'in_flow';
      appendTranscript(sid, 'assistant', reply);
      return res.json({ ok: true, reply, stage: ses.stage });
    }

    // === 3) Dentro del flujo (opciones / texto libre) ===
    if (ses.stage === 'in_flow') {
  const choice = normalize(raw);
  const wantsAdv = choice === '1' || /avanza(d|)o|seguir probando|mas pruebas/.test(choice);
  const wantsWsp = choice === '2' || /whats?app|wsp|ticket|tecnico|t[eé]cnico/.test(choice);

  // === Opción 1: Pruebas avanzadas ===
  if (wantsAdv) {
    const ai = await aiAdvancedTests(
      `Nombre=${ses.name||''}; Dispositivo=${deviceLabel(ses.lastDevice)}; Problema=${issueLabel(ses.lastIssue)};`,
      ses.name, ses.lastDevice
    );
    // ✅ Luego de las avanzadas, solo ofrecer WhatsApp
    const wspMsg = 'Si el problema no se resolvió, podés enviarlo al técnico con el ticket completo.';
    const wspOpt = '2 - Enviar a WhatsApp (con ticket)';
    const out = `${ai}\n\n${wspMsg}\n${wspOpt}`;
    appendTranscript(sid, 'assistant', out);
    return res.json({ ok: true, reply: out, stage: 'advanced_done' });
  }

  // === Opción 2: WhatsApp ===
  if (wantsWsp) {
    const { link } = buildWhatsAppTicket(sid, ses.name, ses.lastDevice, ses.lastIssue);
    const msg = `Te paso nuestro WhatsApp${ses.name ? ', ' + capFirst(ses.name) : ''}:\n${link}\n(Ya adjunté esta conversación en el mensaje para que el técnico no te haga repetir nada).`;
    appendTranscript(sid, 'assistant', 'Se ofreció WhatsApp con ticket');
    return res.json({ ok: true, reply: msg, stage: 'post_flow', whatsappLink: link });
  }

  // === Si ya hizo avanzadas, ofrecer solo WhatsApp ===
  if (ses.stage === 'advanced_done') {
    const wspMsg = 'Si todavía no pudiste resolverlo, enviá el caso al técnico:';
    const wspOpt = '2 - Enviar a WhatsApp (con ticket)';
    const reply = `${wspMsg}\n${wspOpt}`;
    appendTranscript(sid, 'assistant', reply);
    return res.json({ ok: true, reply, stage: 'advanced_done' });
  }

  // === Default: menú inicial de opciones ===
  const opts = CFG.messages_v4?.default_options || ['Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'];
  const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
  const reply = `${after}\n${renderNumbered(opts)}`;
  appendTranscript(sid, 'assistant', reply);
  return res.json({ ok: true, reply, stage: 'in_flow' });


    }

    // Cierre genérico
    const bye = '¿Necesitás algo más? Puedo ayudarte con otra consulta.';
    appendTranscript(sid, 'assistant', bye);
    return res.json({ ok: true, reply: bye, stage: 'post_flow' });

  } catch (e) {
    console.error('ERROR /api/chat:', e);
    return res.json({ ok:false, reply: 'Ocurrió un error procesando tu mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`STI Chat V4.4 listo en http://localhost:${PORT}`));
