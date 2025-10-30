
// server.js — STI Chat V4.1
// Flujo "nombre primero", validación de nombres/apodos, listas numeradas,
// y uso de sti-chat.json (secciones, nlp, templates, advanced).
// Resiliente: corre con Node 18+ y sin OpenAI.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { esNombreValido, extraerNombre, contieneProblema } from './nombres-validos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, 'sti-chat.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg;
  } catch (e) {
    console.error('ERROR leyendo sti-chat.json:', e.message);
    return {};
  }
}

let CFG = loadConfig();

// === Asegurar transcripts
const transcriptsDir = path.resolve(__dirname, (CFG.settings?.transcriptsDir || './data/transcripts'));
fs.mkdirSync(transcriptsDir, { recursive: true });

// === App
const app = express();
const ALLOWED_ORIGINS = [
  'https://stia.com.ar', 'http://stia.com.ar',
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

function nowISO(){ return new Date().toISOString(); }
function capFirst(s=''){ return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()); }

function renderNumbered(list) {
  if (!Array.isArray(list)) return '';
  return list.map((t, i) => `${i+1} - ${t}`).join('\\n');
}

// Guardar transcript
function appendTranscript(sessionId, role, text) {
  if (CFG.settings?.enable_transcripts === false) return;
  const file = path.resolve(transcriptsDir, `${sessionId}.txt`);
  const line = `[${nowISO()}] ${role.toUpperCase()}: ${text}\\n`;
  fs.appendFile(file, line, ()=>{});
}

// Util: normalizar
function normalize(s=''){
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// === NLP helpers (usan regex del JSON)
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

function findDevice(text){
  return matchByRegexArray(text, CFG?.nlp?.devices || []);
}

function findIssue(text){
  return matchByRegexArray(text, CFG?.nlp?.issues || []);
}

function issueLabel(key){
  const labels = CFG?.nlp?.issue_labels || {};
  return labels[key] || key || 'problema';
}

function deviceLabel(key){
  const item = (CFG?.nlp?.devices || []).find(d => d.key === key);
  if (!item) return 'equipo';
  // devolver una etiqueta simple por key
  const map = {
    pc: 'PC',
    notebook: 'notebook',
    monitor: 'monitor',
    internet: 'conexión',
    impresora: 'impresora',
    teclado: 'teclado',
    mouse: 'mouse',
    audio: 'audio',
    camara: 'cámara',
    disco: 'disco/SSD',
    video: 'placa de video',
    puertos: 'puertos',
    bateria: 'batería'
  };
  return map[item.key] || item.key;
}

// Personalización de placeholders {{nombre}}, {{device}}, {{issue_human}} y eliminación de asteriscos
function tpl(str, name, deviceKey, issueKey){
  if (!str) return '';
  const nombre = name ? capFirst(name) : '';
  const device = deviceLabel(deviceKey);
  const issueHuman = issueLabel(issueKey);
  let out = String(str);
  out = out.replace(/\{\{\s*nombre\s*\}\}/gi, nombre);
  out = out.replace(/\{\{\s*device\s*\}\}/gi, device);
  out = out.replace(/\{\{\s*issue_human\s*\}\}/gi, issueHuman);
  // sin asteriscos
  out = out.replace(/\*/g, '');
  return out;
}

// Health
app.get('/api/health', (req, res)=>{
  res.json({
    ok: true,
    bot: CFG.bot,
    version: CFG.version,
    intents_count: CFG?.nlp?.issues?.length || 0,
    transcriptsDir
  });
});

// Reload
app.post('/api/reload', (req, res)=>{
  CFG = loadConfig();
  res.json({ ok: true, version: CFG.version, issues: CFG?.nlp?.issues?.length || 0 });
});

// Core chat
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

    // Paso 1: pedir nombre primero
    if (ses.stage === 'ask_name') {
      // Si detecta problema antes del nombre → pedir nombre igual
      if (contieneProblema(norm, CFG?.settings?.problem_keywords)) {
        const ask = CFG.messages_v4?.greeting?.name_request
          || 'Hola! Soy Tecnos de STI. ¿Cómo te llamás? (Ej: soy Juan / me llamo Ana / mi nombre es Gero)';
        appendTranscript(sid, 'assistant', ask);
        return res.json({ ok: true, reply: ask, stage: 'ask_name' });
      }

      // Omitir
      if (/^\s*omitir\s*$/i.test(norm)) {
        ses.name = null;
        ses.stage = 'ask_problem';
        const msg = CFG.messages_v4?.greeting?.skip_name
          || 'Listo, seguimos sin nombre. Contame en pocas palabras cuál es el problema.';
        appendTranscript(sid, 'assistant', msg);
        return res.json({ ok: true, reply: msg, stage: ses.stage });
      }

      // Intento de extraer nombre
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

      // Reintento
      ses.tries++;
      const again = CFG.messages_v4?.greeting?.name_request
        || 'Hola! Soy Tecnos de STI. ¿Cómo te llamás? (Ej: soy Juan / me llamo Ana / mi nombre es Gero). También podés escribir "omitir".';
      appendTranscript(sid, 'assistant', again);
      return res.json({ ok: true, reply: again, stage: 'ask_name' });
    }

    // Paso 2: detectar problema + dispositivo
    if (ses.stage === 'ask_problem') {
      const issueKey  = findIssue(norm);
      const deviceKey = findDevice(norm);

      if (!issueKey && !deviceKey) {
        ses.tries++;
        if (ses.tries >= (CFG.settings?.fallback_escalation_after || 3)) {
          const msg = (CFG.sections?.fallbacks?.hard || CFG.messages?.fallback || 'Te ofrezco asistencia por WhatsApp: {{whatsapp_link}}')
            .replace(/\{\{\s*whatsapp_link\s*\}\}/g, CFG.settings?.whatsapp_link || '');
          appendTranscript(sid, 'assistant', msg);
          return res.json({ ok: true, reply: msg, stage: 'ask_problem' });
        }
        const soft = CFG.sections?.fallbacks?.medio || CFG.messages?.fallback || '¿Podés decirlo con otras palabras o elegir un tema?';
        appendTranscript(sid, 'assistant', soft);
        return res.json({ ok: true, reply: soft, stage: 'ask_problem' });
      }

      ses.lastIssue = issueKey || ses.lastIssue;
      ses.lastDevice = deviceKey || ses.lastDevice;

      // Respuesta base por template
      const template = (issueKey && CFG?.nlp?.response_templates?.[issueKey])
        ? CFG.nlp.response_templates[issueKey]
        : (CFG?.nlp?.response_templates?.default || 'Entiendo, {{nombre}}. Vamos a revisar tu {{device}} con {{issue_human}}.');

      let reply = tpl(template, ses.name, ses.lastDevice, ses.lastIssue);

      // Agregar opciones numeradas (1=avanzadas, 2=WhatsApp)
      const opts = CFG.messages_v4?.default_options || [
        'Realizar pruebas avanzadas',
        'Hablar con un técnico por WhatsApp'
      ];
      const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
      reply = `${reply}\\n\\n${after}\\n${renderNumbered(opts)}`;

      ses.stage = 'in_flow';
      appendTranscript(sid, 'assistant', reply);
      return res.json({ ok: true, reply, stage: ses.stage });
    }

    // Paso 3: dentro del flujo, esperar 1/2
    if (ses.stage === 'in_flow') {
      const choice = normalize(raw);
      const map = CFG.messages_v4?.default_options_map || { '1': 'advanced', '2': 'whatsapp' };

      if (map[choice]) {
        if (map[choice] === 'advanced') {
          const steps = (ses.lastIssue && CFG?.nlp?.advanced_steps?.[ses.lastIssue]) || [];
          const intro = (CFG?.nlp?.followup_texts?.advanced_intro || 'Sigamos con unos chequeos más avanzados, {{nombre}}:');
          const introP = tpl(intro, ses.name, ses.lastDevice, ses.lastIssue);
          const body = renderNumbered(steps);
          const out = `${introP}\\n\\n${body}`;
          appendTranscript(sid, 'assistant', out);
          return res.json({ ok: true, reply: out, stage: 'in_flow' });
        }
        if (map[choice] === 'whatsapp') {
          const w = CFG.settings?.whatsapp_link || '';
          const msg = `Te paso nuestro WhatsApp${ses.name ? ', ' + capFirst(ses.name) : ''}:\\n${w}\\nVoy a adjuntar esta conversación para que el técnico no te haga repetir nada.`;
          appendTranscript(sid, 'assistant', msg);
          return res.json({ ok: true, reply: msg, stage: 'post_flow' });
        }
      }

      // si no eligió 1/2, re-enunciar
      const opts = CFG.messages_v4?.default_options || [
        'Realizar pruebas avanzadas',
        'Hablar con un técnico por WhatsApp'
      ];
      const after = CFG.messages_v4?.after_steps || 'Si el problema continúa, elegí una opción:';
      const reply = `${after}\\n${renderNumbered(opts)}`;
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
app.listen(PORT, ()=> console.log(`STI Chat V4.1 listo en http://localhost:${PORT}`));
