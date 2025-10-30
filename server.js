// server.js — STI Chat V4.5 (IA Total + OpenAI + Ticket WhatsApp + transcripts)
// - Flujo “nombre primero”
// - NLP desde sti-chat.json (fallback)
// - OpenAI para respuestas inteligentes (tests rápidos, avanzados y contexto total)
// - Ticket WhatsApp con historial completo
// - Endpoints: /api/health, /api/reload, /api/greeting, /api/chat, /api/whatsapp-ticket, /api/transcript/:sid

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

// ====== OpenAI config ======
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const USE_OPENAI_ONLY = String(process.env.USE_OPENAI_ONLY || '0') === '1';
const USE_OPENAI_FULL = String(process.env.USE_OPENAI_FULL || '1') === '1'; // ⚡️ IA total activada
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

// Memoria simple
const SESSIONS = new Map();

function renderNumbered(list) {
  if (!Array.isArray(list)) return '';
  return list.map((t, i) => `${i+1} - ${t}`).join('\n');
}

// ====== NLP helpers ======
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
  out = out.replace(/\*/g, '');
  return out;
}

// ====== OpenAI helpers ======
function buildAIToneHeader(nombre, deviceKey){
  const deviceHum = deviceKey ? deviceLabel(deviceKey) : 'equipo';
  const cliente = nombre ? `Cliente: ${capFirst(nombre)}.` : '';
  return `Actuá como Técnico Senior de STI (Argentina). ${cliente} Dispositivo: ${deviceHum}.`;
}

async function aiResponder(textoCliente, ses) {
  if (!openai) return "La IA no está habilitada.";
  const context = readTranscript(ses.sessionId || '');
  const device = deviceLabel(ses.lastDevice);
  const name = ses.name ? capFirst(ses.name) : "cliente";
  const prompt = `
Sos Tecnos, el Técnico Inteligente de STI Rosario.
Tu misión es ayudar al ${name} a diagnosticar su ${device}.
Historial de la conversación:
---
${context}
---
El cliente acaba de decir: "${textoCliente}"

1️⃣ Analizá lo que ya se probó.
2️⃣ Si hay nueva información (por ejemplo, "ahora enciende pero no entra a Windows"), adaptá el diagnóstico.
3️⃣ Devolvé 4–5 pasos concretos (en bullets cortos, tono argentino).
4️⃣ Si parece más grave, sugerí pasar al técnico.

Formato:
✅ Diagnóstico actualizado:
1) ...
2) ...
3) ...
4) ...
5) ...

Cerrá con: "¿Querés que te lo pase al técnico con el ticket completo por WhatsApp?"
`;
  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, max_tokens: 700
    });
    return r.choices?.[0]?.message?.content?.trim() || "No pude generar diagnóstico ahora.";
  } catch (e) {
    console.error("OpenAI responder error:", e);
    return "Hubo un error generando la respuesta con IA.";
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
  const maxChars = Math.max(800, Math.min(Number(prefs.max_chars || 1600), 3000));
  if (body.length > maxChars) {
    body = body.slice(-maxChars);
    body = '…\n' + body;
  }
  const encoded = encodeURIComponent(body);
  const link = `https://wa.me/${num}?text=${encoded}`;
  console.log("✅ WhatsApp Ticket generado:\n", body);
  return { link, body };
}

// ====== Endpoints ======
app.get('/api/health', (req, res)=> res.json({ ok:true, bot:CFG.bot, version:CFG.version, intents_count:CFG?.nlp?.issues?.length || 0 }));
app.post('/api/reload', (req, res)=>{ CFG = loadConfig(); res.json({ ok:true, version:CFG.version }); });
app.get('/api/greeting', (req,res)=> res.json({ ok:true, greeting: (CFG.messages_v4?.greeting?.name_request)||'👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?' }));
app.get('/api/whatsapp-ticket',(req,res)=>{
  const sessionId = String(req.query.sessionId||'default');
  const ses = SESSIONS.get(sessionId);
  const { link } = buildWhatsAppTicket(sessionId, ses?.name, ses?.lastDevice, ses?.lastIssue);
  appendTranscript(sessionId,'assistant','Se generó link de WhatsApp con ticket');
  res.json({ ok:true, link });
});
app.get('/api/transcript/:sid',(req,res)=>{
  const txt = readTranscript(String(req.params.sid));
  res.set('Content-Type','text/plain; charset=utf-8');
  res.send(txt || '');
});

// ====== Chat principal ======
app.post('/api/chat', async (req,res)=>{
  try {
    const { text, sessionId } = req.body || {};
    if (!text) return res.json({ ok:false, reply:'No pude procesar tu consulta.' });
    const raw = String(text), norm = normalize(raw);
    const sid = String(sessionId || 'default');
    if (!SESSIONS.has(sid)) SESSIONS.set(sid,{ stage:'ask_name', name:null, tries:0, lastIssue:null, lastDevice:null });
    const ses = SESSIONS.get(sid);
    ses.sessionId = sid;
    appendTranscript(sid,'user',raw);

    // === Etapa 1: pedir nombre ===
    if (ses.stage === 'ask_name') {
      const nameCandidate = extraerNombre(raw);
      if (nameCandidate && esNombreValido(nameCandidate)) {
        ses.name = nameCandidate;
        ses.stage = 'ask_problem';
        const msg = `¡Genial, ${capFirst(ses.name)}! 👍 Ahora decime con qué dispositivo tenés problemas o describí brevemente el problema.`;
        appendTranscript(sid,'assistant',msg);
        return res.json({ ok:true, reply:msg, stage:ses.stage });
      }
      if (/^\s*omitir\s*$/i.test(norm)) {
        ses.name=null; ses.stage='ask_problem';
        const msg='Listo, seguimos sin nombre. Contame qué dispositivo o problema tenés.';
        appendTranscript(sid,'assistant',msg);
        return res.json({ ok:true, reply:msg, stage:ses.stage });
      }
      const again='👋 ¡Hola! Soy Tecnos. ¿Cómo te llamás? (Ej: soy Juan o me llamo Ana).';
      appendTranscript(sid,'assistant',again);
      return res.json({ ok:true, reply:again, stage:'ask_name' });
    }

    // === Etapa 2: detectar dispositivo/problema ===
    if (ses.stage === 'ask_problem') {
      ses.lastDevice = findDevice(norm) || ses.lastDevice;
      ses.lastIssue  = findIssue(norm) || ses.lastIssue;

      // ⚡️ Modo IA Total (interpreta todo el contexto)
      if (USE_OPENAI_FULL) {
        const aiReply = await aiResponder(raw, ses);
        appendTranscript(sid,'assistant',aiReply);
        const wspOpt="\n\nSi querés, puedo generar el ticket para enviarlo directo al técnico (WhatsApp).";
        return res.json({ ok:true, reply:aiReply+wspOpt, stage:'in_flow' });
      }

      // IA parcial o estático
      const ai = await aiQuickTests(raw, ses.name, ses.lastDevice);
      const opts = ['Realizar pruebas avanzadas','Enviar a WhatsApp (con ticket)'];
      const after='Si el problema continúa, elegí una opción:';
      const reply=`${ai}\n\n${after}\n${renderNumbered(opts)}`;
      ses.stage='in_flow';
      appendTranscript(sid,'assistant',reply);
      return res.json({ ok:true, reply, stage:ses.stage });
    }

    // === Etapa 3: flujo activo ===
    if (ses.stage === 'in_flow') {
      const choice = normalize(raw);
      if (/1|avanzad/.test(choice)) {
        const ai = await aiAdvancedTests(raw, ses.name, ses.lastDevice);
        const out = `${ai}\n\nSi el problema no se resolvió, puedo pasarte el ticket para WhatsApp.`;
        appendTranscript(sid,'assistant',out);
        return res.json({ ok:true, reply:out, stage:'advanced_done' });
      }
      if (/2|whats|ticket|tecnic/.test(choice)) {
        const { link } = buildWhatsAppTicket(sid, ses.name, ses.lastDevice, ses.lastIssue);
        const msg=`Te paso nuestro WhatsApp${ses.name?', '+capFirst(ses.name):''}:\n${link}\n(Ya adjunté esta conversación en el mensaje para que el técnico no te haga repetir nada).`;
        appendTranscript(sid,'assistant','Se ofreció WhatsApp con ticket');
        return res.json({ ok:true, reply:msg, stage:'post_flow', whatsappLink:link });
      }
      const reply='Si querés, puedo generarte el ticket de WhatsApp con todo el historial.';
      appendTranscript(sid,'assistant',reply);
      return res.json({ ok:true, reply, stage:'in_flow' });
    }

    // === Cierre genérico ===
    const bye='¿Necesitás algo más? Puedo ayudarte con otra consulta.';
    appendTranscript(sid,'assistant',bye);
    return res.json({ ok:true, reply:bye, stage:'post_flow' });

  } catch (e) {
    console.error('ERROR /api/chat:', e);
    return res.json({ ok:false, reply:'Ocurrió un error procesando tu mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`STI Chat V4.5 listo en http://localhost:${PORT}`));
