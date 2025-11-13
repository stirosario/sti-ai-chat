/**
 * server.js — STI Chat (WhatsApp + SSE Logs) — 2025-11-12
 * - BTN_WHATSAPP genera ticket y devuelve waUrl + botón real
 * - /api/logs/stream (SSE) y /api/logs (polling) para chatlog.php
 * - CORS + JSON + transcripts/tickets persistentes
 * - Compatible con ESM ("type":"module" en package.json)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

// ====== Session store (ya existente en tu proyecto) ======
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ====== Config ======
const OPENAI_MODEL   = process.env.OPENAI_MODEL   || 'gpt-4o-mini';
const DATA_BASE      = process.env.DATA_BASE      || '/data';
const TRANSCRIPTS_DIR= process.env.TRANSCRIPTS_DIR|| path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR    = process.env.TICKETS_DIR    || path.join(DATA_BASE, 'tickets');
const LOGS_DIR       = process.env.LOGS_DIR       || path.join(DATA_BASE, 'logs');
const LOG_FILE       = path.join(LOGS_DIR, 'server.log');
const PUBLIC_BASE_URL= (process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com').replace(/\/$/,'');
const WHATSAPP_NUMBER= (process.env.WHATSAPP_NUMBER || '5493417422422').replace(/\D+/g,'');
const SSE_TOKEN      = process.env.SSE_TOKEN || ''; // Debe coincidir con chatlog.php

for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) fs.mkdirSync(d, { recursive: true });

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ===== Utilidades =====
const nowIso = () => new Date().toISOString();
const cap    = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = obj => ({ options: [], ...obj });

// ===== Console → archivo + broadcast SSE =====
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

// ===== Chat config mínimo (incluye definición de botones) =====
const CHAT = {
  version: 'v1-sse-wa',
  settings: { OA_MIN_CONF: 0.6, whatsapp_ticket: { prefix: 'Hola STI. Vengo del chat web. Dejo mi consulta:' } },
  ui: {
    buttons: [
      { token:'BTN_MORE_TESTS',  label:'1️⃣ 🔍 Más pruebas',              text:'1️⃣ 🔍 Más pruebas' },
      { token:'BTN_CONNECT_TECH',label:'2️⃣ 🧑‍💻 Conectar con Técnico',    text:'2️⃣ 🧑‍💻 Conectar con Técnico' },
      { token:'BTN_WHATSAPP',    label:'Enviar WhatsApp',                 text:'hablar con un tecnico' },
      { token:'BTN_CLOSE',       label:'Cerrar Chat 🔒',                  text:'cerrar chat' }
    ]
  },
  messages: {
    greeting: '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?'
  }
};

function buildUiButtons(tokens = []){
  return tokens.map(t => {
    const def = CHAT.ui.buttons.find(b => b.token === t) || { token:t, label:t, text:t };
    return { token:def.token, label:def.label, text:def.text };
  });
}

// ====== App ======
const app = express();
app.use(cors({ origin:true, credentials:true }));
app.use(express.json({ limit:'2mb' }));
app.use(express.urlencoded({ extended:false }));
app.use((req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });

// Session id normalizado
function getSessionId(req){
  const h = (req.headers['x-session-id']||'').toString().trim();
  const b = (req.body && (req.body.sessionId||req.body.sid)) ? String(req.body.sessionId||req.body.sid).trim() : '';
  const q = (req.query && (req.query.sessionId||req.query.sid)) ? String(req.query.sessionId||req.query.sid).trim() : '';
  return h || b || q || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
app.use((req,_res,next)=>{ req.sessionId = getSessionId(req); next(); });

// ====== Health ======
app.get('/api/health', (_req,res)=>{
  res.json({ ok:true, version:CHAT.version, hasOpenAI:!!openai, model:OPENAI_MODEL });
});

// ====== Logs SSE + polling ======
app.get('/api/logs/stream', async (req,res)=>{
  if (SSE_TOKEN && String(req.query.token || '') !== SSE_TOKEN) return res.status(401).send('unauthorized');

  // Modo polling único
  if (String(req.query.mode||'') === 'once'){
    const txt = fs.existsSync(LOG_FILE) ? await fs.promises.readFile(LOG_FILE, 'utf8') : '';
    res.set('Content-Type','text/plain; charset=utf-8');
    return res.status(200).send(txt);
  }

  // SSE
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.flushHeaders && res.flushHeaders();

  // Enviar cola final del archivo (últimos 32KB)
  try{
    if (fs.existsSync(LOG_FILE)){
      const stat  = await fs.promises.stat(LOG_FILE);
      const start = Math.max(0, stat.size - 32*1024);
      const stream= createReadStream(LOG_FILE, { start, end: stat.size-1, encoding:'utf8' });
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

// ====== Tickets: API + vista ======
app.get('/api/ticket/:tid', (req,res)=>{
  const tid  = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if(!fs.existsSync(file)) return res.status(404).json({ ok:false, error:'not_found' });
  res.json({ ok:true, ticketId:tid, content: fs.readFileSync(file,'utf8') });
});

app.get('/ticket/:tid', (req,res)=>{
  const tid  = String(req.params.tid||'').replace(/[^A-Za-z0-9._-]/g,'');
  const file = path.join(TICKETS_DIR, `${tid}.txt`);
  if(!fs.existsSync(file)) return res.status(404).send('ticket no encontrado');
  res.set('Content-Type','text/plain; charset=utf-8');
  res.send(fs.readFileSync(file,'utf8'));
});

// ====== Greeting ======
app.all('/api/greeting', async (req,res)=>{
  const sid   = req.sessionId;
  const fresh = { id:sid, userName:null, stage:'ASK_NAME', device:null, problem:null, transcript:[], waEligible:false, startedAt: nowIso() };
  fresh.transcript.push({ who:'bot', text: CHAT.messages.greeting, ts: nowIso() });
  await saveSession(sid, fresh);
  res.json({ ok:true, reply: CHAT.messages.greeting, options: [] });
});

// ====== WhatsApp ticket util ======
function buildTicket(session, ticketId){
  const now  = new Date();
  const dFmt = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric' });
  const tFmt = new Intl.DateTimeFormat('es-AR',{ timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', hour12:false });
  const stamp= `${dFmt.format(now).replace(/\//g,'-')} ${tFmt.format(now)} (ART)`;
  const safe = session.userName ? String(session.userName).replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9 _-]/g,'').trim().toUpperCase() : '';
  const title= safe ? `STI • Ticket ${ticketId}-${safe}` : `STI • Ticket ${ticketId}`;

  const lines = [
    title,
    `Generado: ${stamp}`,
    session.userName ? `Cliente: ${session.userName}` : null,
    session.device   ? `Equipo: ${session.device}`   : null,
    `Session: ${session.id}`,
    '',
    '=== HISTORIAL DE CONVERSACIÓN ===',
    ...(session.transcript||[]).map(m=>`[${m.ts||nowIso()}] ${m.who||'user'}: ${m.text||''}`)
  ].filter(Boolean);

  fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), lines.join('\n'), 'utf8');

  const apiPublicUrl = `${PUBLIC_BASE_URL}/api/ticket/${ticketId}`;
  const publicUrl    = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;

  let waText  = `${title}\n${CHAT.settings.whatsapp_ticket.prefix}\n\nGenerado: ${stamp}\n`;
  if (session.userName) waText += `Cliente: ${session.userName}\n`;
  if (session.device)   waText += `Equipo: ${session.device}\n`;
  waText += `\nTicket: ${ticketId}\nDetalle (API): ${apiPublicUrl}`;

  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
  return { ticketId, publicUrl, apiPublicUrl, waUrl };
}

// ====== Core chat ======
app.post('/api/chat', async (req,res)=>{
  try{
    const body = req.body || {};
    const sid  = req.sessionId;
    let session= await getSession(sid) || { id:sid, startedAt: nowIso(), userName:null, stage:'ASK_NAME', device:null, problem:null, transcript:[], waEligible:false };

    // Botones (action: 'button', value: 'BTN_*')
    const incomingIsButton = body.action === 'button' && body.value;
    const buttonToken = incomingIsButton ? String(body.value) : null;

    // 1) BTN_WHATSAPP -> crear ticket y devolver ui botón + waUrl
    if (buttonToken === 'BTN_WHATSAPP') {
      const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const rand= Math.random().toString(36).slice(2,6).toUpperCase();
      const ticketId = `TCK-${ymd}-${rand}`;

      const whoName = session.userName ? cap(session.userName) : 'usuario';
      const reply   = `🤖 Muy bien, ${whoName}.\nEstoy preparando tu ticket de asistencia 🧠\nSolo tocá el botón verde de WhatsApp, enviá el mensaje tal como está 💬\n🔧 En breve uno de nuestros técnicos tomará tu caso.`;

      const built = buildTicket(session, ticketId);
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      session.waEligible = true;
      session.stage = 'ESCALATE';
      await saveSession(sid, session);

      const resp = withOptions({ ok:true, reply, stage: session.stage, options: ['BTN_WHATSAPP'] });
      resp.ui = { buttons: buildUiButtons(['BTN_WHATSAPP']) };
      Object.assign(resp, built);
      return res.json(resp);
    }

    // 2) Otros botones simples
    if (buttonToken === 'BTN_CONNECT_TECH') {
      const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const rand= Math.random().toString(36).slice(2,6).toUpperCase();
      const ticketId = `TCK-${ymd}-${rand}`;

      const whoName = session.userName ? cap(session.userName) : 'usuario';
      const reply   = `🤖 Perfecto, ${whoName}. Creo tu ticket y te paso el botón de WhatsApp para enviarlo.`;

      const built = buildTicket(session, ticketId);
      session.transcript.push({ who:'bot', text: reply, ts: nowIso() });
      session.waEligible = true;
      session.stage = 'ESCALATE';
      await saveSession(sid, session);

      const resp = withOptions({ ok:true, reply, stage: session.stage, options: ['BTN_WHATSAPP'] });
      resp.ui = { buttons: buildUiButtons(['BTN_WHATSAPP']) };
      Object.assign(resp, built);
      return res.json(resp);
    }

    // 3) Mensajes comunes: guardar en transcript y devolver algo breve
    const t = String(body.text || '').trim();
    if (t) session.transcript.push({ who:'user', text:t, ts: nowIso() });
    await saveSession(sid, session);

    const reply = session.userName
      ? `Entendido, ${cap(session.userName)}. ¿Querés que te sugiera pasos o preferís derivar a un técnico?`
      : `Gracias. Decime tu nombre para continuar 😊`;

    const options = session.userName ? ['BTN_MORE_TESTS','BTN_CONNECT_TECH'] : [];
    const resp = withOptions({ ok:true, reply, stage: session.stage, options });
    if (options.length) resp.ui = { buttons: buildUiButtons(options) };
    res.json(resp);

  }catch(e){
    console.error('[api/chat]', e && e.message);
    res.status(500).json({ ok:false, error:e.message || 'server_error' });
  }
});

// ====== /api/whatsapp-ticket (manual) ======
app.post('/api/whatsapp-ticket', async (req,res)=>{
  try{
    const sid     = req.sessionId;
    const session = await getSession(sid) || { id:sid, transcript:[] };
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand= Math.random().toString(36).slice(2,6).toUpperCase();
    const built = buildTicket(session, `TCK-${ymd}-${rand}`);
    res.json({ ok:true, ...built });
  }catch(e){
    console.error('[whatsapp-ticket]', e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// ====== Start ======
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, ()=>{
  console.log(`[boot] ✅ server up on :${PORT}`);
  console.log(`[boot] Logs: ${LOG_FILE}`);
  console.log(`[boot] PUBLIC_BASE_URL=${PUBLIC_BASE_URL}  WHATSAPP_NUMBER=${WHATSAPP_NUMBER}  SSE_TOKEN=${SSE_TOKEN ? '(set)' : '(not set)'}`);
});
