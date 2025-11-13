
/**
 * server.js — STI Chat (Primeras pruebas inmediatas + WhatsApp + SSE) — 2025-11-12
 * - Al recibir el problema por primera vez: responde con pasos enumerados
 *   y ofrece 1) Más pruebas  2) Conectar con Técnico.
 * - Mantiene BTN_WHATSAPP y SSE logs.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createReadStream as crs } from 'fs';
import OpenAI from 'openai';

import { getSession, saveSession } from './sessionStore.js';

const OPENAI_MODEL   = process.env.OPENAI_MODEL   || 'gpt-4o-mini';
const DATA_BASE      = process.env.DATA_BASE      || '/data';
const TRANSCRIPTS_DIR= process.env.TRANSCRIPTS_DIR|| path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR    = process.env.TICKETS_DIR    || path.join(DATA_BASE, 'tickets');
const LOGS_DIR       = process.env.LOGS_DIR       || path.join(DATA_BASE, 'logs');
const LOG_FILE       = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL= (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/$/,'');
const WHATSAPP_NUMBER= (process.env.WHATSAPP_NUMBER || '5493417422422').replace(/\D+/g,'');
const SSE_TOKEN      = process.env.SSE_TOKEN || '';

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) fs.mkdirSync(d, { recursive: true });
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const nowIso = () => new Date().toISOString();
const cap    = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const CHAT = {
  version: 'v1.2-first-steps',
  ui: {
    buttons: [
      { token:'BTN_MORE_TESTS',  label:'1️⃣ 🔍 Más pruebas',              text:'1️⃣ 🔍 Más pruebas' },
      { token:'BTN_CONNECT_TECH',label:'2️⃣ 🧑‍💻 Conectar con Técnico',    text:'2️⃣ 🧑‍💻 Conectar con Técnico' },
      { token:'BTN_WHATSAPP',    label:'✅ Enviar por WhatsApp',           text:'hablar con un tecnico' },
      { token:'BTN_CLOSE',       label:'Cerrar Chat 🔒',                  text:'cerrar chat' }
    ]
  },
  messages: {
    greeting: '👋 ¡Hola! Soy Tecnos, tu Asistente de STI. ¿Cómo te llamás?'
  }
};

function buildButtons(tokens){
  return tokens.map(t => {
    const def = CHAT.ui.buttons.find(b => b.token === t) || { token:t, label:t, text:t };
    return { token:def.token, label:def.label, text:def.text };
  });
}
const withOptions = (obj, tokens=[]) => {
  const x = { ...obj };
  if (tokens.length){
    x.ui = { buttons: buildButtons(tokens) };
    x.options = tokens.map(t => CHAT.ui.buttons.find(b=>b.token===t)?.label || t);
  } else {
    x.options = x.options || [];
  }
  return x;
};

// ===== Console → archivo + SSE =====
const sseClients = new Set();
let   logStream  = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
function logLine(level, ...parts){
  const text = parts.map(p => typeof p === 'string' ? p : (()=>{try{return JSON.stringify(p)}catch{return String(p)}})()).join(' ');
  const line = `${new Date().toISOString()} [${level}] ${text}`;
  try { logStream.write(line + '\n'); } catch {}
  for (const res of Array.from(sseClients)) {
    try { res.write(line.split(/\r?\n/).map(l=>`data: ${l}`).join('\n') + '\n\n'); } catch { try{res.end()}catch{} sseClients.delete(res); }
  }
}
const _log = console.log.bind(console);
const _err = console.error.bind(console);
console.log  = (...a)=>{ try{_log(...a)}catch{}  ; logLine('INFO',  ...a); };
console.error= (...a)=>{ try{_err(...a)}catch{}  ; logLine('ERROR', ...a); };

const app = express();
app.use(cors({ origin:true, credentials:true }));
app.use(express.json({ limit:'2mb' }));
app.use(express.urlencoded({ extended:false }));
app.use((req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

function getSessionId(req){
  const h = (req.headers['x-session-id']||'').toString().trim();
  const b = (req.body && (req.body.sessionId||req.body.sid)) ? String(req.body.sessionId||req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId||req.query.sid)) ? String(req.query.sessionId||req.query.sid).trim() : '';
  return h || b || q || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req,_res,next)=>{ req.sessionId = getSessionId(req); next(); });

// ===== Health =====
app.get('/api/health', (_req,res)=>{
  res.json({ ok:true, version:CHAT.version, hasOpenAI:!!openai, model:OPENAI_MODEL });
});

// ===== Logs SSE + polling =====
app.get('/api/logs/stream', async (req,res)=>{
  if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).send('unauthorized');
  if (String(req.query.mode||'') === 'once'){
    const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
    res.set('Content-Type','text/plain; charset=utf-8');
    return res.status(200).send(txt);
  }
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.flushHeaders && res.flushHeaders();
  try{
    if (fs.existsSync(LOG_FILE)){
      const stat  = await fs.promises.stat(LOG_FILE);
      const start = Math.max(0, stat.size - 32*1024);
      const stream= crs(LOG_FILE, { start, end: stat.size-1, encoding:'utf8' });
      for await (const chunk of stream){
        res.write(chunk.split(/\r?\n/).map(l=>`data: ${l}`).join('\n') + '\n\n');
      }
    }
  }catch{}
  sseClients.add(res);
  console.log('[logs] cliente SSE conectado. total=', sseClients.size);
  const hb = setInterval(()=>{ try{ res.write(': ping\n\n'); }catch{} }, 20_000);
  req.on('close', ()=>{
    clearInterval(hb);
    sseClients.delete(res);
    try{res.end()}catch{}
    console.log('[logs] cliente SSE desconectado. total=', sseClients.size);
  });
});

app.get('/api/logs', async (req,res)=>{
  if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });
  try{
    const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
    res.set('Content-Type','text/plain; charset=utf-8');
    res.send(txt);
  }catch(e){
    console.error('[api/logs]', e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// ===== Greeting =====
app.all('/api/greeting', async (req,res)=>{
  const sid   = req.sessionId;
  const fresh = { id:sid, userName:null, stage:'ASK_NAME', device:null, problem:null, transcript:[], waEligible:false, startedAt: nowIso() };
  fresh.transcript.push({ who:'bot', text: CHAT.messages.greeting, ts: nowIso() });
  await saveSession(sid, fresh);
  res.json({ ok:true, reply: CHAT.messages.greeting, options: [] });
});

// ===== Helpers =====
function firstSteps(problemRaw){
  const p = (problemRaw||'').toLowerCase();
  const power = /(no prende|no enciende|no arranca|no prende la|no enciende la|no prende mi|no enciende mi)/i.test(p);
  if (power){
    return [
      '1) Revisá que el cable de energía esté firme en el equipo y en la toma.',
      '2) Probá otra toma de corriente (sin zapatilla).',
      '3) Si es PC de escritorio: apagá la fuente (switch atrás), esperá 10s y volvé a encender.',
      '4) Quitá pendrives/discos externos y probá de nuevo.',
      '5) Si hubo corte de luz, esperá 2-3 minutos y reintentá.'
    ].join('\n');
  }
  return [
    '1) Reiniciá el equipo.',
    '2) Verificá cables/conexiones del dispositivo.',
    '3) Probá en otro puerto/toma o con otro cable.',
    '4) Actualizá y reiniciá nuevamente.',
    '5) Si persiste, podemos derivarlo a un técnico.'
  ].join('\n');
}

// ===== Core chat =====
app.post('/api/chat', async (req,res)=>{
  try{
    const body = req.body || {};
    const sid  = req.sessionId;
    let session= await getSession(sid) || { id:sid, startedAt: nowIso(), userName:null, stage:'ASK_NAME', device:null, problem:null, transcript:[], waEligible:false };

    const incomingIsButton = body.action === 'button' && body.value;
    const buttonToken = incomingIsButton ? String(body.value) : null;
    const text = String(body.text || '').trim();
    if (text) session.transcript.push({ who:'user', text, ts: nowIso() });

    // Botones de escalamiento
    if (buttonToken === 'BTN_WHATSAPP' || buttonToken === 'BTN_CONNECT_TECH') {
      const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const rand= Math.random().toString(36).slice(2,6).toUpperCase();
      const ticketId = `TCK-${ymd}-${rand}`;
      const whoName = session.userName ? cap(session.userName) : 'usuario';
      const msg = buttonToken === 'BTN_CONNECT_TECH'
        ? `🤖 Perfecto, ${whoName}. Creo tu ticket y te paso el botón de WhatsApp para enviarlo.`
        : `🤖 Muy bien, ${whoName}. Preparé tu ticket. Tocá el botón verde para enviarlo por WhatsApp.`;

      const now  = new Date();
      const dFmt = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric' });
      const tFmt = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', hour12:false });
      const stamp= `${dFmt.format(now).replace(/\//g,'-')} ${tFmt.format(now)} (ART)`;
      const safe = session.userName ? String(session.userName).replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').trim().toUpperCase() : '';
      const title= safe ? `STI • Ticket ${ticketId}-${safe}` : `STI • Ticket ${ticketId}`;
      const lines = [
        title, `Generado: ${stamp}`,
        session.userName ? `Cliente: ${session.userName}` : null,
        session.device   ? `Equipo: ${session.device}`   : null,
        `Session: ${session.id}`, '',
        '=== HISTORIAL DE CONVERSACIÓN ===',
        ...(session.transcript||[]).map(m=>`[${m.ts||nowIso()}] ${m.who||'user'}: ${m.text||''}`)
      ].filter(Boolean);
      fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), lines.join('\n'), 'utf8');
      const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
      const waText  = `${title}\nHola STI. Vengo del chat web. Dejo mi consulta:\n\nGenerado: ${stamp}\n` +
                      (session.userName ? `Cliente: ${session.userName}\n` : '') +
                      (session.device ? `Equipo: ${session.device}\n` : '') +
                      `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;
      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

      session.transcript.push({ who:'bot', text: msg, ts: nowIso() });
      session.waEligible = true;
      session.stage = 'ESCALATE';
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply: msg, stage: session.stage, ticketId, waUrl, apiPublicUrl }, ['BTN_WHATSAPP']));
    }

    // Etapas
    if (!session.userName) {
      if (text) {
        session.userName = cap(text.split(/\s+/)[0]);
        session.stage = 'ASK_PROBLEM';
        const reply = `¡Genial, ${session.userName}! 👍\nContame en pocas palabras el problema.`;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage }));
      } else {
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply:'Gracias. Decime tu nombre para continuar 😊', stage: session.stage }));
      }
    }

    // Primera vez que llega problema → DAR PASOS INMEDIATOS + 2 BOTONES
    if (!session.problem) {
      if (text) {
        session.problem = text;
        session.stage = 'BASIC';
        const steps = firstSteps(text);
        const who = cap(session.userName);
        const reply = `Entendido, ${who}. Probemos esto primero:\n${steps}\n\nSi no se resuelve, podés elegir:`;
        session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply, stage: session.stage }, ['BTN_MORE_TESTS','BTN_CONNECT_TECH']));
      } else {
        await saveSession(sid, session);
        return res.json(withOptions({ ok:true, reply:'Contame brevemente tu problema (ej: "mi compu no enciende").', stage: 'ASK_PROBLEM' }));
      }
    }

    // Botón Más pruebas
    if (buttonToken === 'BTN_MORE_TESTS') {
      session.stage = 'BASIC';
      const reply = `Vamos con más pruebas:` + '\n' +
        '1) Probá con otro cable de energía.' + '\n' +
        '2) Si es notebook, quitá batería (si es posible), conectá cargador y probá.' + '\n' +
        '3) Si sigue igual, lo derivamos a un técnico.';
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok:true, reply, stage: session.stage }, ['BTN_CONNECT_TECH','BTN_CLOSE']));
    }

    // Por defecto
    await saveSession(sid, session);
    const reply = `Te escucho, ${cap(session.userName)}. Podés pedirme más pruebas o conectar con un técnico.`;
    return res.json(withOptions({ ok:true, reply, stage: session.stage }, ['BTN_MORE_TESTS','BTN_CONNECT_TECH']));

  }catch(e){
    console.error('[api/chat]', e && e.message);
    res.status(500).json({ ok:false, error:e.message || 'server_error' });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, ()=>{
  console.log(`[boot] ✅ server up on :${PORT}`);
  console.log(`[boot] Logs: ${LOG_FILE}`);
  console.log(`[boot] PUBLIC_BASE_URL=${PUBLIC_BASE_URL}  WHATSAPP_NUMBER=${WHATSAPP_NUMBER}  SSE_TOKEN=${SSE_TOKEN ? '(set)' : '(not set)'}`);
});
