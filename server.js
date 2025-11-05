/**
 * server.js V4.8.3 — STI Chat (Redis + Tickets + Transcript)
 * Centralización de textos y mapa de ayuda en sti-chat.json
 * Corrección: no avanzar a BASIC_TESTS si hay issueKey sin pasos configurados y no hay device detectado.
 *
 * Este archivo integra:
 *  - Lectura centralizada de plantillas y help-steps desde sti-chat.json
 *  - Uso de esas plantillas (basic intro/footer/options/help prompts)
 *  - Help handler que usa CHAT.nlp.help_steps
 *  - Mantiene la corrección para evitar suposiciones físicas
 *
 * Reemplazá tu server.js por este archivo (haz backup antes).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ===== OpenAI (opcional) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ===== Persistencia / rutas =====
const DATA_BASE       = process.env.DATA_BASE       || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR     = process.env.TICKETS_DIR     || path.join(DATA_BASE, 'tickets');
const LOGS_DIR        = process.env.LOGS_DIR        || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }
const nowIso = () => new Date().toISOString();

// ===== Carga sti-chat.json (config centralizada) =====
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = {}; let deviceMatchers = []; let issueMatchers = [];
function loadChat() {
  try {
    CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
    console.log('[chat] ✅ Cargado', CHAT.version || '(sin version)', 'desde', CHAT_JSON_PATH);
    deviceMatchers = (CHAT?.nlp?.devices || []).map(d => ({ key: d.key, rx: new RegExp(d.rx, 'i') }));
    issueMatchers  = (CHAT?.nlp?.issues  || []).map(i => ({ key: i.key, rx: new RegExp(i.rx, 'i') }));
  } catch (e) {
    console.error('[chat] ❌ No pude cargar sti-chat.json:', e.message);
    CHAT = {}; deviceMatchers = []; issueMatchers = [];
  }
}
loadChat();

// ===== Helpers de NLP =====
const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';
function detectDevice(txt = '') { for (const d of deviceMatchers) if (d.rx.test(txt)) return d.key; return null; }
function detectIssue (txt = '') { for (const i of issueMatchers)  if (i.rx.test(txt)) return i.key; return null; }

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
const withOptions = (obj) => ({ options: [], ...obj });

// ===== Session store (mantener tu implementación) =====
import { getSession, saveSession, listActiveSessions } from './sessionStore.js';

// ===== Utilitarios de plantilla centralizada =====
function tplReplace(template, vars = {}) {
  let s = String(template || '');
  Object.entries(vars).forEach(([k, v]) => {
    const rx = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
    s = s.replace(rx, v ?? '');
  });
  return s;
}
function getBasicIntro(session) {
  const tpl = CHAT?.messages_v4?.basic_intro || 'Entiendo, {{nombre}}. Probemos esto primero:';
  return tplReplace(tpl, { nombre: session.userName || '' });
}
function getBasicFooterLines() {
  if (Array.isArray(CHAT?.messages_v4?.basic_footer) && CHAT.messages_v4.basic_footer.length > 0) return CHAT.messages_v4.basic_footer.slice();
  return [
    '🧩 Si necesitas ayuda para realizarlas, solo dime con cuál!',
    '🤔 Si las pudiste realizar, contame cómo te fue?'
  ];
}
function getBasicInstructionsNote() {
  return CHAT?.messages_v4?.basic_instructions_note || 'Decime: "ayuda [nombre del paso]", "sí", "no" o "avanzadas".';
}
function getBasicOptions() {
  return Array.isArray(CHAT?.messages_v4?.basic_options) ? CHAT.messages_v4.basic_options.slice() : ['Necesito ayuda con un paso','Sí, lo solucioné','No, sigue igual','Avanzadas'];
}
function getHelpPrompts() {
  return CHAT?.messages_v4?.help_prompts || {
    ask_which: 'Decime con cuál de estos pasos necesitás ayuda:\n\n{steps}\n\nO escribí el nombre del paso (ej. "ayuda eliminar archivos temporales").',
    no_help_key: 'No logro identificar exactamente qué paso. Escribí el nombre del paso tal como aparece en la lista o elegí una de las opciones.',
    confirm_send_whatsapp: '¿Querés que genere el ticket y lo envíe por WhatsApp ahora?'
  };
}
function getHelpStepsMap() {
  return CHAT?.nlp?.help_steps || {};
}
function findHelpKey(text) {
  const t = String(text || '').toLowerCase();
  const helpMap = getHelpStepsMap();
  for (const k of Object.keys(helpMap)) {
    if (t.includes(k)) return k;
  }
  // heurísticas
  if (t.includes('tempor') || t.includes('archivo temp') || t.includes('archivos temporales')) return 'eliminar archivos temporales';
  if (t.includes('cerrar programas') || t.includes('administrador de tareas') || t.includes('task manager')) return 'cerrar programas innecesarios';
  if (t.includes('explorer') || t.includes('explorador')) return 'reiniciar el explorador';
  if (t.includes('desfragment') || t.includes('defragment')) return 'desfragmentar';
  return null;
}

// ===== Voseo (mantener) =====
function arVoseo(s) {
  let t = String(s || '').trim();
  const repl = [
    [/\bpresione\b/gi, 'apretá'],
    [/\bpresionar\b/gi, 'apretar'],
    [/\bhaga\b/gi, 'hacé'],
    [/\bhaz\b/gi, 'hacé'],
    [/\bverifique\b/gi, 'verificá'],
    [/\bintente\b/gi, 'probá'],
    [/\bpruebe\b/gi, 'probá'],
    [/\bquiera\b/gi, 'querés'],
    [/\bpuede\b/gi, 'podés'],
    [/\bconecte\b/gi, 'conectá'],
    [/\bdesconecte\b/gi, 'desconectá'],
    [/\bmantenga\b/gi, 'mantené'],
    [/\breinicie\b/gi, 'reiniciá']
  ];
  for (const [rx, to] of repl) t = t.replace(rx, to);
  return t;
}
const mapVoseoSafe = (arr) => Array.isArray(arr) ? arr.map(arVoseo) : [];

// ===== ID de sesión helper =====
function getSessionId(req) {
  const hSid = (req.headers['x-session-id'] || '').toString().trim();
  const bSid = (req.body && (req.body.sessionId || req.body.sid)) ? String(req.body.sessionId || req.body.sid).trim() : '';
  const qSid = (req.query && (req.query.sessionId || req.query.sid)) ? String(req.query.sessionId || req.query.sid).trim() : '';
  const raw = hSid || bSid || qSid;
  return raw || `srv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

// ===== Config OA =====
const OA_MIN_CONF = Number(process.env.OA_MIN_CONF || 0.6);

// ===== OpenAI analyze & aiQuickTests (copiados de tu versión anterior) =====
async function analyzeProblemWithOA(problemText = '') {
  if (!openai) return { device: null, issueKey: null, confidence: 0 };
  const prompt = [
    "Sos técnico informático argentino, claro y profesional.",
    "Tu tarea: analizar el texto del cliente y detectar:",
    "• device → equipo involucrado (ej: pc, notebook, monitor, etc.)",
    "• issueKey → tipo de problema (ej: no_prende, no_internet, pantalla_negra, etc.)",
    "• confidence → número entre 0 y 1 según tu seguridad.",
    "",
    "Respondé SOLO un JSON válido con esas tres claves, sin texto adicional.",
    "",
    `Texto del cliente: "${problemText}"`
  ].join('\n');

  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g, '');
    const obj = JSON.parse(raw);
    return {
      device: (obj.device || null),
      issueKey: (obj.issueKey || null),
      confidence: Math.max(0, Math.min(1, Number(obj.confidence || 0)))
    };
  } catch (e) {
    console.error('[analyzeProblemWithOA] ❌', e.message);
    return { device: null, issueKey: null, confidence: 0 };
  }
}

async function aiQuickTests(problemText = '', device = '') {
  if (!openai) {
    return [
      'Reiniciar la aplicación donde ocurre el problema',
      'Probar en otro documento o programa para ver si persiste',
      'Reiniciar el equipo',
      'Comprobar actualizaciones del sistema y de la aplicación',
      'Verificar si hay extensiones o plugins que interfieran'
    ];
  }
  const prompt = [
    `Sos técnico informático argentino, claro y amable.`,
    `Problema: "${problemText}"${device ? ` en ${device}` : ''}.`,
    `Indicá 4–6 pasos simples y seguros.`,
    `Devolvé solo un JSON array de strings.`
  ].join('\n');

  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });
    const raw = resp.choices?.[0]?.message?.content?.trim() || '[]';
    const jsonText = raw.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(jsonText);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string').slice(0, 6) : [];
  } catch (e) {
    console.error('[aiQuickTests] Error:', e.message);
    return ['Reiniciar la aplicación', 'Probar otra instancia', 'Reiniciar el equipo', 'Comprobar actualizaciones', 'Chequear extensiones/plug-ins'];
  }
}

// ===== Express app =====
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true, methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','x-session-id','x-session-fresh'] }));
app.options('*', cors({ origin: true, credentials: true, methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','x-session-id','x-session-fresh'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => { req.sessionId = getSessionId(req); res.set('Cache-Control','no-store'); next(); });

// ===== Endpoints =====
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html><meta charset="utf-8"><h1>STI Chat</h1><p>Endpoints: /api/health /api/chat /api/reload /api/transcript/:sid</p>`);
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openaiReady: !!openai,
    openaiModel: OPENAI_MODEL || null,
    version: CHAT?.version || 'unknown',
    paths: { data: DATA_BASE, transcripts: TRANSCRIPTS_DIR, tickets: TICKETS_DIR }
  });
});

app.all('/api/reload', (_req, res) => { try { loadChat(); res.json({ ok: true, version: CHAT.version }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });

app.get('/api/transcript/:sid', (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(fs.readFileSync(file, 'utf8'));
});

// WhatsApp ticket endpoint (igual que antes)
app.post('/api/whatsapp-ticket', async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    let transcript = history;
    const sid = sessionId || req.sessionId;

    if ((!transcript || transcript.length === 0) && sid) {
      const s = await getSession(sid);
      if (s?.transcript) transcript = s.transcript;
    }

    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;

    const lines = [];
    lines.push(`STI • Servicio Técnico Inteligente — Ticket ${ticketId}`);
    lines.push(`Generado: ${nowIso()}`);
    if (name)   lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sid)    lines.push(`Session: ${sid}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    for (const m of transcript || []) {
      const who = m.who === 'user' ? 'USER' : 'ASSISTANT';
      lines.push(`[${m.ts || nowIso()}] ${who}: ${m.text || ''}`);
    }
    fs.writeFileSync(path.join(TICKETS_DIR, `${ticketId}.txt`), lines.join('\n'), 'utf8');

    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    let waText = CHAT?.settings?.whatsapp_ticket?.prefix || 'Hola STI 👋. Vengo del chat web. Dejo mi consulta:';
    waText += '\n';
    if (name)   waText += `\n👤 Cliente: ${name}\n`;
    if (device) waText += `💻 Equipo: ${device}\n`;
    waText += `\n🎫 Ticket: ${ticketId}\n📄 Detalle completo: ${publicUrl}`;

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
    res.json({ ok: true, ticketId, publicUrl, waUrl });
  } catch (e) {
    console.error('[whatsapp-ticket] ❌', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Reset session
app.post('/api/reset', async (req, res) => {
  const sid = req.sessionId;
  const empty = {
    id: sid, userName: null, stage: 'ask_name',
    device:null, problem:null, issueKey:null,
    tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
    fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null
  };
  await saveSession(sid, empty);
  res.json({ ok: true });
});

// Greeting (resetea sesión)
app.all('/api/greeting', async (req, res) => {
  try {
    const sid = req.sessionId;
    const fresh = {
      id: sid, userName: null, stage: 'ask_name',
      device:null, problem:null, issueKey:null,
      tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
      fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null
    };
    const text = CHAT?.messages_v4?.greeting?.name_request || '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
    fresh.transcript.push({ who: 'bot', text, ts: nowIso() });
    await saveSession(sid, fresh);
    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  } catch (e) {
    console.error('[api/greeting RESET] error:', e);
    const text = '👋 ¡Hola! Soy Tecnos, tu Asistente Inteligente. ¿Cuál es tu nombre?';
    return res.json({ ok: true, greeting: text, reply: text, options: [] });
  }
});

// ===== Main chat endpoint (flujo integrado con textos centralizados) =====
app.post('/api/chat', async (req, res) => {
  try {
    const { text = '' } = req.body || {};
    const t = String(text).trim();
    const sid = req.sessionId;

    let session = await getSession(sid);
    if (!session) {
      session = {
        id: sid, userName: null, stage: 'ask_name',
        device:null, problem:null, issueKey:null,
        tests:{ basic:[], advanced:[], ai:[] }, stepsDone:[],
        fallbackCount:0, waEligible:false, transcript:[], pendingUtterance:null
      };
      console.log(`[api/chat] ✨ Nueva sesión: ${sid}`);
    }

    session.transcript.push({ who: 'user', text: t, ts: nowIso() });

    // Inline name extraction
    const nmInline = (function extractName(text) {
      if (!text) return null;
      const tt = String(text).trim();
      const m = tt.match(/^(?:soy|me llamo|mi nombre es)\s+([a-záéíóúñ]{3,20})$/i);
      if (m) return m[1];
      if (/^[a-záéíóúñ]{3,20}$/i.test(tt)) return tt;
      return null;
    })(t);

    if (nmInline && !session.userName) {
      session.userName = cap(nmInline);
      if (session.stage === 'ask_name') {
        session.stage = 'ask_problem';
        const reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSession(sid, session);
        return res.json({ ok: true, reply, stage: session.stage, options: [] });
      }
    }

    let reply = ''; let options = [];

    // ASK_NAME
    if (session.stage === 'ask_name') {
      if (/(no |pantalla|lento|no funciona|no conecta|no enciende)/i.test(t) && !nmInline) session.pendingUtterance = t;
      const name = nmInline;
      if (/^omitir$/i.test(t)) session.userName = session.userName || 'usuario';
      else if (!session.userName && name) session.userName = cap(name);

      if (!session.userName) {
        reply = CHAT?.messages_v4?.greeting?.name_request || '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas")';
      } else {
        session.stage = 'ask_problem';
        if (session.pendingUtterance) {
          session.problem = session.pendingUtterance;
          session.pendingUtterance = null;
          session.stage = 'ask_device';
          options = ['PC','Notebook','Teclado','Mouse','Monitor','Internet / Wi-Fi'];
          reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa?`;
        } else {
          reply = CHAT?.messages_v4?.greeting?.name_confirm?.replace('{NOMBRE}', session.userName) || `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
        }
      }

      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSession(sid, session);
      return res.json(withOptions({ ok: true, reply, options, stage: session.stage }));
    }

    // ASK_PROBLEM
    if (session.stage === 'ask_problem') {
      session.problem = t || session.problem;

      try {
        let device    = detectDevice(session.problem);
        let issueKey  = detectIssue(session.problem);
        let confidence = issueKey ? 0.6 : 0;

        if (openai) {
          const ai = await analyzeProblemWithOA(session.problem);
          if ((ai.confidence || 0) >= confidence) {
            device     = ai.device || device;
            issueKey   = ai.issueKey || issueKey;
            confidence = ai.confidence || confidence;
          }
        }

        const hasConfiguredSteps = !!(issueKey && CHAT?.nlp?.advanced_steps?.[issueKey] && CHAT.nlp.advanced_steps[issueKey].length > 0);

        // Solo avanzamos si hay confianza y (device detectado o pasos configurados)
        if (confidence >= OA_MIN_CONF && (device || hasConfiguredSteps)) {
          session.device   = session.device || device || 'equipo';
          session.issueKey = issueKey || session.issueKey || null;
          session.stage    = 'basic_tests';

          const key = session.issueKey || null;
          const stepsSrc = key ? CHAT?.nlp?.advanced_steps?.[key] : null;
          let steps;
          if (Array.isArray(stepsSrc) && stepsSrc.length > 0) {
            steps = stepsSrc.slice(0, 4);
          } else {
            let aiSteps = [];
            try { aiSteps = await aiQuickTests(session.problem || '', session.device || ''); } catch {}
            if (Array.isArray(aiSteps) && aiSteps.length > 0) steps = aiSteps.slice(0, 4);
            else steps = [
              'Reiniciar la aplicación donde ocurre el problema',
              'Probar en otro documento o programa para ver si persiste',
              'Reiniciar el equipo',
              'Comprobar actualizaciones del sistema y de la aplicación'
            ];
          }

          const stepsAr = mapVoseoSafe(steps);
          const intro = getBasicIntro(session);
          const footerLines = getBasicFooterLines();
          const note = getBasicInstructionsNote();

          session.tests.basic = stepsAr;
          session.stepsDone.push('basic_tests_shown');

          // IMPORTANTE: Por diseño inicial NO incluimos botón/atajo directo a WhatsApp aquí.
          // El usuario puede pedir escalado más adelante (p. ej. si responde "no").
          session.waEligible = false;

          const fullMsg = intro + '\n\n• ' + stepsAr.join('\n• ') + '\n\n' + footerLines.join('\n') + '\n\n' + note;

          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);

          try {
            const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
            fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${intro}\n`);
            stepsAr.forEach(s => fs.appendFileSync(tf, ` - ${s}\n`));
            fs.appendFileSync(tf, `\n${footerLines.join('\n')}\n`);
          } catch (e) { /* noop */ }

          return res.json({
            ok: true,
            reply: fullMsg,
            steps,
            stepsType: 'basic',
            options: getBasicOptions().filter(o => !/whatsapp/i.test(o)), // no incluir WhatsApp aquí
            stage: session.stage
          });
        }

        // Si se detectó issueKey pero NO hay pasos configurados y NO detectamos device -> pedir device
        if (confidence >= OA_MIN_CONF && issueKey && !hasConfiguredSteps && !device) {
          session.stage = 'ask_device';
          const msg = `Gracias. Parece que el problema es: ${issueHuman(issueKey)}.\n\n¿En qué equipo te pasa (PC, notebook, etc.) para darte pasos más precisos?`;
          await saveSession(sid, session);
          return res.json({ ok: true, reply: msg, options: ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi'] });
        }

        // Si no hay confianza suficiente -> pedir device
        session.stage = 'ask_device';
        const msg = `Enseguida te ayudo con ese problema 🔍\n\nPerfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
        await saveSession(sid, session);
        return res.json({ ok: true, reply: msg, options: ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi'] });

      } catch (err) {
        console.error('diagnóstico ASK_PROBLEM:', err);
        return res.json({ ok: true, reply: 'Hubo un problema al procesar el diagnóstico. Probá de nuevo en un momento.' });
      }
    }

    // ASK_DEVICE (y derivación a pasos)
    if (session.stage === 'ask_device' || !session.device) {
      const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();
      if (dev && dev.length >= 2) {
        session.device = dev;
        const issueKey = detectIssue(`${session.problem || ''} ${t}`.trim());
        if (issueKey) {
          session.issueKey = issueKey;
          session.stage = 'basic_tests';
          const pasosSrc = CHAT?.nlp?.advanced_steps?.[issueKey];
          const pasos = Array.isArray(pasosSrc) ? pasosSrc : [
            'Reiniciar el equipo',
            'Verificar conexiones físicas',
            'Probar en modo seguro'
          ];
          const pasosAr = mapVoseoSafe(pasos.slice(0, 3));

          const intro = getBasicIntro(session);
          const footerLines = getBasicFooterLines();
          const note = getBasicInstructionsNote();

          session.tests.basic = pasosAr;
          session.stepsDone.push('basic_tests_shown');
          session.waEligible = false; // NO ofrecer WhatsApp inmediato

          const fullMsg = `Entiendo, ${session.userName}. Tu **${session.device}** tiene el problema: ${issueHuman(issueKey)} 🔍\n\n` +
            `${intro}\n\n• ${pasosAr.join('\n• ')}\n\n` +
            footerLines.join('\n') + '\n\n' + note;

          session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
          await saveSession(sid, session);
          return res.json({ ok: true, reply: fullMsg, options: getBasicOptions().filter(o => !/whatsapp/i.test(o)), stage: session.stage });
        } else {
          session.stage = 'basic_tests_ai';
          try {
            const ai = await aiQuickTests(session.problem || '', session.device || '');
            if (ai.length) {
              const aiAr = mapVoseoSafe(ai.slice(0, 4));
              const intro = getBasicIntro(session);
              const footerLines = getBasicFooterLines();
              const note = getBasicInstructionsNote();

              session.tests.ai = aiAr;
              session.stepsDone.push('ai_basic_shown');
              session.waEligible = false;

              const fullMsg = intro + '\n\n• ' + aiAr.join('\n• ') + '\n\n' + footerLines.join('\n') + '\n\n' + note;
              session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
              await saveSession(sid, session);
              return res.json({ ok: true, reply: fullMsg, options: getBasicOptions().filter(o => !/whatsapp/i.test(o)), stage: session.stage });
            } else {
              const replyNoAI = `Perfecto, ${session.userName}. Anotado: **${session.device}** 📝\n\nContame un poco más del problema.`;
              await saveSession(sid, session);
              return res.json({ ok: true, reply: replyNoAI, options: [] });
            }
          } catch (e) {
            console.error('[aiQuickTests] ❌', e.message);
            const replyErr = 'No pude generar sugerencias ahora 😅. Contame un poco más del problema.';
            await saveSession(sid, session);
            return res.json({ ok: true, reply: replyErr, options: [] });
          }
        }
      } else {
        const reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
        options = ['PC','Notebook','Monitor','Teclado','Mouse','Internet / Wi-Fi'];
        await saveSession(sid, session);
        return res.json({ ok: true, reply, options });
      }
    }

    // Estados: manejo de respuestas después de mostrar pasos (ayuda / sí / no / avanzadas / escalado)
    {
      const rxYes = /\b(s[ií]|sí se solucion[oó]|se solucion[oó]|funcion[oó]|ya anda|listo funcion[oó]|lo solucioné|lo arreglé|solucion[oó])\b/i;
      const rxNo  = /\b(no\b|todav[ií]a no|no funcion[oó]|sigue igual|no cambi[oó]|tampoco|no lo solucion[oó])\b/i;
      const rxAdv = /\b(avanzadas?|m[aá]s pruebas|pruebas t[eé]cnicas|continuar|seguir)\b/i;
      const rxHelp = /\b(ayuda|como|cómo|guía|pasos|explicame|cómo hago|cómo elimino|cómo borro|como elimino|como borro|¿cómo)\b/i;

      // Help request
      if (rxHelp.test(t)) {
        const helpKey = findHelpKey(t);
        const helpMap = getHelpStepsMap();
        if (helpKey && helpMap[helpKey]) {
          const steps = helpMap[helpKey];
          reply = `Te doy los pasos para: ${helpKey}\n\n` + steps.map((s, i) => `${i+1}. ${s}`).join('\n');
          options = ['Probé esto y funcionó (sí)','Probé y no funcionó (no)','Volver a la lista de pasos'];
          session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
          await saveSession(sid, session);
          return res.json(withOptions({ ok: true, reply, options, stage: session.stage }));
        } else {
          const basicSteps = (session.tests.basic && session.tests.basic.length) ? session.tests.basic : (session.tests.ai && session.tests.ai.length ? session.tests.ai : []);
          if (basicSteps.length) {
            const prompts = getHelpPrompts();
            const stepsText = basicSteps.map((s, i) => `${i+1}. ${s}`).join('\n');
            reply = prompts.ask_which.replace('{steps}', stepsText);
            options = basicSteps.slice(0,4).map(s => `Ayuda: ${s}`);
            session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
            await saveSession(sid, session);
            return res.json(withOptions({ ok: true, reply, options, stage: session.stage }));
          } else {
            reply = 'Decime qué paso querés que te explique y te doy los pasos detallados.';
            options = ['Eliminar archivos temporales','Reiniciar la compu','Cerrar programas innecesarios'];
            session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
            await saveSession(sid, session);
            return res.json(withOptions({ ok: true, reply, options, stage: session.stage }));
          }
        }
      }

      // YES -> cierre positivo (agradecer)
      if (rxYes.test(t)) {
        reply  = `¡Excelente, ${session.userName}! 🙌\nMe alegra que lo hayas solucionado 💪\n\nGracias por confiar en STI! ⚡`;
        options = ['Volver al inicio','Abrir otro problema'];
        session.stage = 'escalate';
        session.waEligible = false;
      }

      // NO -> ofrecer avanzadas o escalado a técnico (a partir de que el usuario ya probó)
      else if (rxNo.test(t)) {
        session.stepsDone.push('user_says_not_working');
        const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
        const advAr = mapVoseoSafe(adv);
        if (advAr.length > 0) {
          session.stage = 'advanced_tests';
          session.tests.advanced = advAr;
          session.waEligible = true; // ahora sí habilitamos escalado
          reply  = `Entiendo, ${session.userName}. Te muestro algunas pruebas avanzadas:\n\n` + advAr.map((p,i) => `${i+1}. ${p}`).join('\n');
          options = ['Volver a básicas','Enviar a WhatsApp (hablar con técnico)'];
        } else {
          session.stage = 'escalate';
          session.waEligible = true;
          reply = 'Lamento que siga sin funcionar. ¿Querés que te pase con un técnico por WhatsApp para que lo revisen presencialmente o por remoto?';
          options = ['Enviar a WhatsApp (hablar con técnico)','No, seguir intentando'];
        }
      }

      // AVANZADAS
      else if (rxAdv.test(t)) {
        const adv = (CHAT?.nlp?.advanced_steps?.[session.issueKey] || []).slice(3, 6);
        const advAr = mapVoseoSafe(adv);
        if (advAr.length > 0) {
          session.stage = 'advanced_tests';
          session.tests.advanced = advAr;
          session.waEligible = true;
          reply  = `Perfecto 👍\nTe muestro las pruebas más avanzadas para este caso:\n\n` + advAr.map((p,i) => `${i+1}. ${p}`).join('\n');
          options = ['Volver a básicas','Enviar a WhatsApp (hablar con técnico)'];
        } else {
          session.stage = 'escalate';
          session.waEligible = true;
          reply = 'No tengo más pasos automáticos para este caso. ¿Querés que lo pase al equipo técnico por WhatsApp?';
          options = ['Enviar a WhatsApp (hablar con técnico)'];
        }
      }

      // Petición explícita para hablar con humano
      else if (/\b(whatsapp|t[ée]cnico|derivar|persona|humano|hablar con un t[eé]cnico)\b/i.test(t)) {
        session.waEligible = true;
        reply = getHelpPrompts().confirm_send_whatsapp || '¿Querés que genere el ticket y lo envíe por WhatsApp ahora?';
        options = ['Enviar ahora','No, después'];
      }

      // Otros -> recordatorio del flujo
      else {
        reply = `Recordá:\n\n🧩 Si necesitás ayuda para realizar algún paso, decime: "ayuda [nombre del paso]".\n` +
                `🤔 Si ya los probaste, contame cómo te fue (decime "sí" o "no").\n\n` +
                `Si preferís hablar con alguien, decime "hablar con un técnico".`;
        options = ['Ayuda con un paso','Sí, lo solucioné','No, sigue igual','Hablar con un técnico'];
      }
    }

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSession(sid, session);

    try {
      const tf = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
      fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`);
      fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`);
    } catch (e) { /* noop */ }

    const response = withOptions({ ok: true, reply, sid, stage: session.stage });
    if (options && options.length) response.options = options;
    if (session.waEligible) response.allowWhatsapp = true;
    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json(withOptions({ ok: true, reply: '😅 Tuve un problema momentáneo. Probá de nuevo.' }));
  }
});

// Sessions list
app.get('/api/sessions', async (_req, res) => {
  const sessions = await listActiveSessions();
  res.json({ ok: true, count: sessions.length, sessions });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 [STI Chat V4.8.3] Started — reading templates from ${CHAT_JSON_PATH}`);
});