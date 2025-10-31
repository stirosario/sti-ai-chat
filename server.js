// server.js V4.7 - STI Chat con Redis + Flujo Mejorado
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

// ===== IMPORTAR sessionStore =====
import { 
  getSession, 
  saveSession, 
  createEmptySession,
  healthCheck,
  listActiveSessions 
} from './sessionStore.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ===== Persistencia =====
const DATA_BASE = process.env.DATA_BASE || '/data';
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || path.join(DATA_BASE, 'transcripts');
const TICKETS_DIR = process.env.TICKETS_DIR || path.join(DATA_BASE, 'tickets');
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://sti-rosario-ai.onrender.com';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Crear directorios si no existen
for (const d of [TRANSCRIPTS_DIR, TICKETS_DIR, LOGS_DIR]) { 
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} 
}

const nowIso = () => new Date().toISOString();

// ===== Carga de flujos/chat =====
const CHAT_JSON_PATH = process.env.CHAT_JSON || path.join(process.cwd(), 'sti-chat.json');
let CHAT = null;

function loadChat() {
  CHAT = JSON.parse(fs.readFileSync(CHAT_JSON_PATH, 'utf8'));
  console.log('[chat] ✅ Cargado', CHAT.version, 'desde', CHAT_JSON_PATH);
}

try { 
  loadChat(); 
} catch (e) { 
  console.error('[chat] ❌ No pude cargar sti-chat.json:', e.message); 
  CHAT = {}; 
}

// ===== Helpers NLP =====
const deviceMatchers = (CHAT?.nlp?.devices || []).map(d => ({ 
  key: d.key, 
  rx: new RegExp(d.rx, 'i') 
}));

const issueMatchers = (CHAT?.nlp?.issues || []).map(i => ({ 
  key: i.key, 
  rx: new RegExp(i.rx, 'i') 
}));

function detectDevice(txt = '') {
  for (const d of deviceMatchers) {
    if (d.rx.test(txt)) return d.key;
  }
  return null;
}

function detectIssue(txt = '') {
  for (const i of issueMatchers) {
    if (i.rx.test(txt)) return i.key;
  }
  return null;
}

const issueHuman = (k) => CHAT?.nlp?.issue_labels?.[k] || 'el problema';

function tplDefault({ nombre = '', device = 'equipo', issueKey = null }) {
  const base = CHAT?.nlp?.response_templates?.default || 
    'Entiendo, {{nombre}}. Revisemos tu {{device}} con {{issue_human}}.';
  return base
    .replace('{{nombre}}', nombre || '')
    .replace('{{device}}', device || 'equipo')
    .replace('{{issue_human}}', issueHuman(issueKey));
}

// ===== ENDPOINTS =====

// Health check con Redis
app.get('/api/health', async (req, res) => {
  const redisHealth = await healthCheck();
  res.json({ 
    ok: true, 
    hasOpenAI: !!process.env.OPENAI_API_KEY, 
    usingNewFlows: true, 
    version: CHAT?.version || '4.7.0',
    redis: redisHealth,
    paths: { 
      data: DATA_BASE, 
      transcripts: TRANSCRIPTS_DIR, 
      tickets: TICKETS_DIR 
    } 
  });
});

// Reload chat config
app.post('/api/reload', (req, res) => { 
  try { 
    loadChat(); 
    res.json({ ok: true, version: CHAT.version }); 
  } catch (e) { 
    res.status(500).json({ ok: false, error: e.message }); 
  } 
});

// Transcript (backup en disco)
app.get('/api/transcript/:sid', (req, res) => {
  const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.join(TRANSCRIPTS_DIR, `${sid}.txt`);
  
  if (!fs.existsSync(file)) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  
  res.set('Content-Type', 'text/plain; charset=utf-8'); 
  res.send(fs.readFileSync(file, 'utf8'));
});

// WhatsApp ticket con historial completo
app.post('/api/whatsapp-ticket', async (req, res) => {
  try {
    const { name, device, sessionId, history = [] } = req.body || {};
    
    // Si no viene history, cargar desde Redis
    let transcript = history;
    if (transcript.length === 0 && sessionId) {
      const session = await getSession(sessionId);
      if (session?.transcript) {
        transcript = session.transcript;
      }
    }
    
    // Generar ticket ID único
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const ticketId = `TCK-${ymd}-${rand}`;
    
    // Construir contenido del ticket
    const lines = [];
    lines.push(`STI • Servicio Técnico Inteligente — Ticket ${ticketId}`);
    lines.push(`Generado: ${nowIso()}`);
    if (name) lines.push(`Cliente: ${name}`);
    if (device) lines.push(`Equipo: ${device}`);
    if (sessionId) lines.push(`Session: ${sessionId}`);
    lines.push('');
    lines.push('=== HISTORIAL DE CONVERSACIÓN ===');
    
    for (const m of transcript) {
      const who = m.who === 'user' ? 'USER' : 'ASSISTANT';
      lines.push(`[${m.ts || nowIso()}] ${who}: ${m.text || ''}`);
    }
    
    // Guardar ticket en disco
    fs.writeFileSync(
      path.join(TICKETS_DIR, `${ticketId}.txt`), 
      lines.join('\n'), 
      'utf8'
    );
    
    // Generar URL pública y link de WhatsApp
    const publicUrl = `${PUBLIC_BASE_URL}/ticket/${ticketId}`;
    
    let waText = CHAT?.settings?.whatsapp_ticket?.prefix || 
      'Hola STI 👋. Vengo del chat web. Dejo mi consulta:';
    waText += '\n';
    
    if (name) waText += `\n👤 Cliente: ${name}\n`;
    if (device) waText += `💻 Equipo: ${device}\n`;
    waText += `\n🎫 Ticket: ${ticketId}\n📄 Detalle completo: ${publicUrl}`;
    
    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;
    
    res.json({ 
      ok: true, 
      ticketId, 
      publicUrl, 
      waUrl 
    });
    
  } catch (e) { 
    console.error('[whatsapp-ticket] ❌', e); 
    res.status(500).json({ 
      ok: false, 
      error: e.message 
    }); 
  }
});

// Página pública del ticket (con OG tags)
app.get('/ticket/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/[^A-Z0-9-]/g, '');
  const file = path.join(TICKETS_DIR, `${id}.txt`);
  
  if (!fs.existsSync(file)) {
    return res.status(404).send('Ticket no encontrado');
  }
  
  const content = fs.readFileSync(file, 'utf8');
  const title = `STI • Servicio Técnico Inteligente — Ticket ${id}`;
  const desc = (content.split('\n').slice(0, 8).join(' ') || '').slice(0, 200);
  const url = `${PUBLIC_BASE_URL}/ticket/${id}`;
  const logo = `${PUBLIC_BASE_URL}/logo.png`;
  
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
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
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica,Arial,sans-serif;margin:24px;background:#f5f5f5}
pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:16px;border-radius:12px;line-height:1.4;overflow:auto}
h1{font-size:20px;margin:0 0 6px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>${title}</h1>
<p>
  <a href="https://stia.com.ar" target="_blank">stia.com.ar</a> • 
  <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank">WhatsApp</a>
</p>
<pre>${content.replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s]))}</pre>
</body>
</html>`);
});

// Greeting inicial
app.post('/api/greeting', (req, res) => {
  const text = CHAT?.messages_v4?.greeting?.name_request ||
    '👋 ¡Hola! Soy Tecnos 🤖 de STI. ¿Cómo te llamás? (o escribí "omitir")';
  res.json({ ok: true, reply: text });
});

// ===== CHAT PRINCIPAL CON REDIS =====
app.post('/api/chat', async (req, res) => {
  try {
    const { text = '', sessionId = 'web-unknown' } = req.body || {};
    const t = text.trim();

    console.log(`\n[api/chat] 📥 ${sessionId}: "${t}"`);

    // 1. Cargar o crear sesión desde Redis
    let session = await getSession(sessionId);
    if (!session) {
      session = createEmptySession(sessionId);
      console.log(`[api/chat] ✨ Nueva sesión creada: ${sessionId}`);
    }

    // 2. Guardar turno del usuario en transcript
    session.transcript.push({ 
      who: 'user', 
      text: t, 
      ts: nowIso() 
    });

    let reply = '';
    let options = [];

    // ===== FLUJO 1: NOMBRE =====
    // if (!session.userName) {
    //   const m = t.match(/^(?:soy\s+)?([a-záéíóúñ]{2,20})$/i);
      
    //   if (m && m[1]) {
    //     session.userName = m[1].toLowerCase();
    //     session.stage = 'ask_device';
    //     reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿con qué dispositivo tenés problemas?`;
    //   } 
    //   else if (/^omitir$/i.test(t)) {
    //     session.userName = 'usuario';
    //     session.stage = 'ask_device';
    //     reply = 'Perfecto, seguimos. ¿Qué dispositivo te está dando problemas?';
    //   } 
    //   else {
    //     reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas" o escribí "omitir")';
    //   }
    // }
    
   // ===== FLUJO 1: NOMBRE =====
if (!session.userName) {
  const m = t.match(/^(?:soy\s+)?([a-záéíóúñ]{2,20})$/i);

  if (m && m[1]) {
    session.userName = m[1].toLowerCase();
    session.stage = 'ask_problem';  // ← cambiamos a pedir problema
    reply = `¡Genial, ${session.userName}! 👍\n\nAhora decime: ¿qué problema estás teniendo?`;
  }
  else if (/^omitir$/i.test(t)) {
    session.userName = 'usuario';
    session.stage = 'ask_problem';
    reply = 'Perfecto, seguimos.\n\nAhora decime: ¿qué problema estás teniendo?';
  }
  else {
    reply = '😊 ¿Cómo te llamás?\n\n(Ejemplo: "soy Lucas" o escribí "omitir")';
  }
}

// ===== FLUJO 2: PROBLEMA LIBRE (capturar descripción del cliente) =====
else if (session.stage === 'ask_problem' && !session.problem) {
  // Guardamos lo que contó el cliente como problema libre
  session.problem = t;
  session.stage   = 'ask_device';   // siguiente paso: identificar equipo
  // Opciones sugeridas (si usás options en la respuesta)
  if (typeof options !== 'undefined') {
    options = ['PC', 'Notebook', 'Teclado', 'Mouse', 'Monitor', 'Internet / Wi-Fi'];
  }
  reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa? (Ej.: PC, notebook, teclado, etc.)`;
}

// ===== FLUJO 3: DISPOSITIVO =====
else if (!session.device) {
  const dev = detectDevice(t) || t.toLowerCase().replace(/[^a-záéíóúñ\s]/gi, '').trim();

  if (dev && dev.length >= 2) {
    session.device = dev;

    // Intento deducir el issue automáticamente combinando lo que ya contó el cliente
    let issueKey = detectIssue(`${session.problem || ''} ${t}`.trim());

    if (issueKey) {
      // Tenemos issue: pasamos directo a pasos básicos
      session.issueKey = issueKey;
      session.stage    = 'basic_tests';

      const pasos = CHAT?.nlp?.advanced_steps?.[issueKey] || [
        'Reiniciar el equipo',
        'Verificar conexiones físicas',
        'Probar en modo seguro'
      ];

      reply  = `Entiendo, ${session.userName}. Tu **${session.device}** tiene problema: ${issueHuman(issueKey)} 🔍\n\n`;
      reply += `🔧 **Probá estos pasos básicos:**\n\n`;
      pasos.slice(0, 3).forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });
      reply += `\n¿Pudiste hacer alguno de estos pasos?`;

      session.stepsDone.push('basic_tests_shown');
      session.tests.basic = pasos.slice(0, 3);
    } else {
      // No se pudo deducir issue: pedimos detalle específico del equipo
      session.stage = 'ask_issue';
      reply = `Perfecto, ${session.userName}. Anotado: **${session.device}** 📝\n\nContame brevemente: ¿qué problema tiene?`;
    }
  }
  else {
    reply = '¿Podés decirme el tipo de equipo?\n\n(Ejemplo: PC, notebook, monitor, teclado, etc.)';
  }
}

// ===== FLUJO 4: PROBLEMA (ISSUE) =====
else if (!session.issueKey) {
  let issueKey = detectIssue(t);

  // Detectar frases genéricas argentinas con contexto
  if (!issueKey && /\b(no anda|no va|no funca|no sirve|no prende)\b/i.test(t)) {
    issueKey = 'no_funciona';
  }

  if (issueKey) {
    session.issueKey = issueKey;
    session.stage    = 'basic_tests';

    const pasos = CHAT?.nlp?.advanced_steps?.[issueKey] || [
      'Reiniciar el equipo',
      'Verificar conexiones físicas',
      'Probar en modo seguro'
    ];

    reply  = `Entiendo, ${session.userName}. Tu **${session.device}** tiene problema: ${issueHuman(issueKey)} 🔍\n\n`;
    reply += `🔧 **Probá estos pasos básicos:**\n\n`;
    pasos.slice(0, 3).forEach((p, i) => { reply += `${i + 1}. ${p}\n`; });
    reply += `\n¿Pudiste hacer alguno de estos pasos?`;

    session.stepsDone.push('basic_tests_shown');
    session.tests.basic = pasos.slice(0, 3);
  }
  else {
    // Fallback: no se entendió el problema
    session.fallbackCount = (session.fallbackCount || 0) + 1;

    if (session.fallbackCount >= 3) {
      reply = '🤔 Parece que necesitás ayuda más directa.\n\nTe paso con un técnico por WhatsApp para que te ayude personalmente.';
      session.waEligible = true;
      if (typeof options !== 'undefined') options = ['Enviar a WhatsApp (con ticket)'];
    }
    else {
      reply  = '¿Podés describir el problema con otras palabras? 🤔\n\n';
      reply += '**Por ejemplo:**\n';
      reply += '• "no prende"\n';
      reply += '• "está lento"\n';
      reply += '• "sin internet"\n';
      reply += '• "pantalla negra"';
    }
  }


    }
    
    // ===== FLUJO 4: YA TIENE ISSUE → CONTINUACIÓN =====
    else {
      // Detectar pedido explícito de WhatsApp/técnico
      if (/\b(whatsapp|técnico|tecnico|ayuda directa|derivar|persona|humano)\b/i.test(t)) {
        session.waEligible = true;
        reply = '✅ Perfecto. Te preparo un ticket con todo el historial para enviarlo por WhatsApp.';
        options = ['Enviar a WhatsApp (con ticket)'];
      }
      
      // Detectar confirmaciones argentinas
      else if (/\b(dale|ok|sí|si|bueno|joya|bárbaro|listo|perfecto|probé|hice)\b/i.test(t)) {
        session.stepsDone.push('user_confirmed_basic');
        
        // Ofrecer pasos avanzados si ya mostró básicos
        if (session.stage === 'basic_tests' && session.tests.basic.length >= 2) {
          const advSteps = CHAT?.nlp?.advanced_steps?.[session.issueKey] || [];
          const advanced = advSteps.slice(3, 6);
          
          if (advanced.length > 0) {
            session.stage = 'advanced_tests';
            session.tests.advanced = advanced;
            
            reply = `Genial, ${session.userName}. Sigamos con pasos más avanzados 🔧\n\n`;
            advanced.forEach((p, i) => {
              reply += `${i + 1}. ${p}\n`;
            });
            reply += `\n¿Pudiste probar alguno?`;
            session.waEligible = true; // Ya pasó básico + avanzado
          } 
          else {
            reply = '👍 Perfecto. Si el problema persiste, te paso con un técnico.';
            session.waEligible = true;
            options = ['Enviar a WhatsApp (con ticket)'];
          }
        } 
        else {
          reply = '👍 Perfecto. ¿Alguno de esos pasos ayudó a resolver el problema?';
        }
      }
      
      // Detectar negaciones (no funcionó)
      else if (/\b(no|nada|sigue igual|no cambió|no sirve|no resolvió|tampoco)\b/i.test(t)) {
        session.stepsDone.push('user_says_not_working');
        
        if (session.stage === 'basic_tests') {
          reply = '😔 Entiendo que los pasos básicos no ayudaron.\n\nProbemos pasos más técnicos 🔧';
          session.stage = 'advanced_tests';
          
          const advSteps = CHAT?.nlp?.advanced_steps?.[session.issueKey] || [];
          const advanced = advSteps.slice(3, 6);
          session.tests.advanced = advanced;
          
          if (advanced.length > 0) {
            reply += '\n\n**Pasos avanzados:**\n\n';
            advanced.forEach((p, i) => {
              reply += `${i + 1}. ${p}\n`;
            });
            session.waEligible = true;
          } 
          else {
            reply += '\n\nTe paso con un técnico que te va a ayudar personalmente.';
            session.waEligible = true;
            options = ['Enviar a WhatsApp (con ticket)'];
          }
        } 
        else {
          reply = '😔 Entiendo. Entonces te paso con un técnico que te va a ayudar personalmente.';
          session.waEligible = true;
          options = ['Enviar a WhatsApp (con ticket)'];
        }
      }
      
      // Respuesta genérica con contexto
      else {
        reply = `Recordá que estamos revisando tu **${session.device}** por ${issueHuman(session.issueKey)} 🔍\n\n`;
        reply += `¿Probaste los pasos que te sugerí?\n\n`;
        reply += 'Decime:\n';
        reply += '• **"sí"** si los probaste\n';
        reply += '• **"no"** si no funcionaron\n';
        reply += '• **"ayuda"** si querés hablar con un técnico';
      }
    }

    // 7. Guardar turno del bot en transcript
    session.transcript.push({ 
      who: 'bot', 
      text: reply, 
      ts: nowIso() 
    });

    // 8. Persistir sesión en Redis
    await saveSession(sessionId, session);

    // 9. Guardar transcript también en disco (backup)
    const tf = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);
    fs.appendFileSync(tf, `[${nowIso()}] USER: ${t}\n`, 'utf8');
    fs.appendFileSync(tf, `[${nowIso()}] ASSISTANT: ${reply}\n`, 'utf8');

    // 10. Enviar respuesta
    const response = { ok: true, reply, options };
    
    // Solo enviar allowWhatsapp si waEligible
    if (session.waEligible) {
      response.allowWhatsapp = true;
    }

    console.log(`[api/chat] 📤 ${sessionId}: waEligible=${session.waEligible}, stage=${session.stage}`);
    return res.json(response);

  } catch (e) {
    console.error('[api/chat] ❌ Error:', e);
    return res.status(200).json({ 
      ok: true, 
      reply: '😅 Tuve un problema momentáneo. Probá de nuevo en un segundo.', 
      options: [] 
    });
  }
});

// ===== Debug: Listar sesiones activas =====
app.get('/api/sessions', async (req, res) => {
  const sessions = await listActiveSessions();
  res.json({ 
    ok: true, 
    count: sessions.length, 
    sessions 
  });
});

// ===== Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [STI Chat V4.7-Redis] Started successfully`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`📂 Data: ${DATA_BASE}`);
  console.log(`${CHAT?.version ? `📋 Chat config: ${CHAT.version}` : '⚠️  No chat config loaded'}`);
  console.log(`${'='.repeat(60)}\n`);
});