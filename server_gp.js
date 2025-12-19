// server.js — STI Tecnos MODO DIOS (v1)
// Chatbot de soporte técnico con flujo conversacional limpio, multi-idioma
// y detección básica de dispositivos + escalado a técnico por WhatsApp.
//
// Nota: Este servidor está pensado para Node 18+ usando ES Modules
// (añadí `"type": "module"` en tu package.json si aún no lo tienes).

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'crypto';

// =========================
// Configuración y utilidades
// =========================

dotenv.config();

const PORT = process.env.PORT || 3001;

// Número de WhatsApp al que se envían los tickets, sin "+" y con país, por ejemplo "5493417422422"
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';

// Orígenes permitidos para CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://stia.com.ar,https://www.stia.com.ar,http://localhost:3000,http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Sesiones en memoria (simple, por proceso)
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hora

// Estados del flujo
const STATES = {
  ASK_LANGUAGE: 'ask_language',
  ASK_NAME: 'ask_name',
  ASK_PROBLEM: 'ask_problem',
  BASIC_TESTS: 'basic_tests',
  ADVANCED_TESTS: 'advanced_tests',
  ESCALATE: 'escalate',
  ENDED: 'ended'
};

// Botones (tokens internos)
const BUTTONS = {
  LANG_ES_AR: 'BTN_LANG_ES_AR',
  LANG_ES_ES: 'BTN_LANG_ES_ES',
  LANG_EN: 'BTN_LANG_EN',
  NO_NAME: 'BTN_NO_NAME',
  SOLVED: 'BTN_SOLVED',
  PERSIST: 'BTN_PERSIST',
  MORE_TESTS: 'BTN_MORE_TESTS',
  CONNECT_TECH: 'BTN_CONNECT_TECH'
};

// =========================
// Helpers de tiempo, ids y logging
// =========================

function nowIso() {
  return new Date().toISOString();
}

function generateSessionId() {
  return 'web-' + crypto.randomBytes(12).toString('hex');
}

function generateTicketId() {
  const ymd = new Date().toISOString().slice(0,10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TCK-${ymd}-${rand}`;
}

// Log sencillo (se puede reemplazar por Winston, etc.)
function log(...args) {
  console.log(new Date().toISOString(), '-', ...args);
}

// =========================
// Perfiles de idioma
// =========================

function getLocaleProfile(locale) {
  switch (locale) {
    case 'en':
      return { code: 'en', label: 'English', isEn: true, isEsAr: false, isEsEs: false };
    case 'es-ES':
      return { code: 'es-ES', label: 'Español (España)', isEn: false, isEsAr: false, isEsEs: true };
    case 'es-AR':
    default:
      return { code: 'es-AR', label: 'Español (Argentina)', isEn: false, isEsAr: true, isEsEs: false };
  }
}

// Saludo según hora
function buildTimeGreeting(locale) {
  const hour = new Date().getHours();
  const profile = getLocaleProfile(locale);
  const isEn = profile.isEn;
  const morning = isEn ? 'Good morning' : 'Buen día';
  const afternoon = isEn ? 'Good afternoon' : 'Buenas tardes';
  const evening = isEn ? 'Good evening' : 'Buenas noches';

  if (hour < 12) return `🌅 ${morning}`;
  if (hour < 19) return `🌇 ${afternoon}`;
  return `🌙 ${evening}`;
}

// =========================
// Sesiones
// =========================

function createFreshSession() {
  const sid = generateSessionId();
  const session = {
    id: sid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stage: STATES.ASK_LANGUAGE,
    userLocale: null,  // 'es-AR', 'es-ES', 'en'
    userName: null,
    problem: null,
    device: null,
    isHowTo: false,
    isProblem: false,
    transcript: [],    // {who:'user'|'bot', text:string, ts:string}
    solved: false
  };
  sessions.set(sid, session);
  return session;
}

function getSession(sid) {
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  const age = Date.now() - new Date(s.createdAt).getTime();
  if (age > SESSION_TTL_MS) {
    sessions.delete(sid);
    return null;
  }
  return s;
}

function saveSession(session) {
  if (!session || !session.id) return;
  session.updatedAt = nowIso();
  sessions.set(session.id, session);
}

// Limpieza periódica de sesiones
setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions.entries()) {
    if (now - new Date(s.createdAt).getTime() > SESSION_TTL_MS) {
      sessions.delete(sid);
    }
  }
}, 15 * 60 * 1000);

// =========================
// Detección básica de dispositivo y tipo de consulta
// =========================

function classifyProblem(textRaw) {
  const text = (textRaw || '').toLowerCase();

  const isHowTo = /como|cómo|quiero instalar|quiero usar|me gustaria saber|how do i|how to|i want to/i.test(textRaw || '');
  const isProblem = /(no prende|no enciende|no funciona|no anda|no imprime|no conecta|no se conecta|se apaga|pantalla negra|error|fall[ao])/i.test(textRaw || '');

  let device = null;

  if (/(notebook|laptop|portátil)/i.test(text)) device = 'notebook';
  else if (/(pc|computadora|ordenador)/i.test(text)) device = 'pc';
  else if (/(impresora|printer|multifuncion|láser|laser)/i.test(text)) device = 'printer';
  else if (/(router|módem|modem|wifi|wi-fi)/i.test(text)) device = 'router';
  else if (/(smart tv|smart-tv|televisor|tele|tv)/i.test(text)) device = 'tv';
  else if (/(fire tv|firetv|stick tv|chromecast|roku|android tv|apple tv)/i.test(text)) device = 'tv_stick';
  else if (/(celular|móvil|movil|telefono|teléfono|phone)/i.test(text)) device = 'phone';

  const isIT = !!device || isProblem || isHowTo;

  return {
    isIT,
    isHowTo,
    isProblem,
    device,
  };
}

// =========================
// OpenAI (opcional) para ayuda avanzada
// =========================

let openai = null;
if (process.env.OPENAI_API_KEY) {
  const { OpenAI } = await import('openai');
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  log('OpenAI habilitado');
} else {
  log('OpenAI deshabilitado (OPENAI_API_KEY no definido)');
}

async function callOpenAIHelp({ locale, userName, device, isHowTo, problem }) {
  if (!openai) return null;

  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;

  const system = isEn
    ? `You are Tecnos, the friendly AI technician of STI (Intelligent Technical Service) from Rosario, Argentina.
Answer SHORT, CLEAR and STEP-BY-STEP. Use non-technical language, unless strictly necessary.
Never suggest dangerous actions (BIOS, registry, format, delete system files, high-voltage, opening hardware).
Always speak in the user's language: ${profile.label}.`
    : `Sos Tecnos, el técnico informático inteligente de STI (Servicio Técnico Inteligente) en Rosario, Argentina.
Respondé CORTO, CLARO y POR PASOS. Usá lenguaje simple, sin tecnicismos innecesarios.
Nunca sugieras acciones peligrosas (BIOS, registro, formatear, borrar archivos de sistema, alta tensión, abrir equipos).
Respondé SIEMPRE en: ${profile.label}.`;

  const userPrompt = (isEn
    ? `User name: ${userName || 'User'}.
Device (if known): ${device || 'unknown'}.
Type of request: ${isHowTo ? 'How-To / guidance' : 'Technical problem / incident'}.

User message:
${problem}

Give:
- A brief empathetic sentence.
- 3 to 7 numbered steps to try.
- If the issue is serious or uncertain, end with a suggestion to contact a human technician.`
    : `Nombre del usuario: ${userName || 'Usuario'}.
Dispositivo (si se conoce): ${device || 'desconocido'}.
Tipo de consulta: ${isHowTo ? 'Guía / cómo hacer algo' : 'Problema técnico / falla'}.

Mensaje del usuario:
${problem}

Indicaciones:
- Empezá con una frase empática corta.
- Luego da entre 3 y 7 pasos numerados que pueda probar.
- Si el problema parece grave o poco claro, terminá sugiriendo contactar a un técnico humano.`);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return text;
  } catch (err) {
    log('[OpenAI error]', err.message || err);
    return null;
  }
}

// =========================
// Respuestas de Tecnos
// =========================

function buildLanguageGreeting() {
  const baseEs = `${buildTimeGreeting('es-AR')}, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.`;
  const baseEn = `${buildTimeGreeting('en')}, I'm Tecnos, STI's intelligent assistant — Intelligent Technical Service.`;

  const lines = [
    `${baseEs}`,
    `${baseEn}`,
    '',
    '🌐 Para empezar, seleccioná un idioma usando los botones:',
    '🌐 To begin, select a language using the buttons:'
  ].join('\n');

  const options = [
    { token: BUTTONS.LANG_ES_AR, label: 'Español Argentina' },
    { token: BUTTONS.LANG_ES_ES, label: 'Español España' },
    { token: BUTTONS.LANG_EN, label: 'English' }
  ];

  return { text: lines, options };
}

function buildAskName(locale) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;
  const isEsAr = profile.isEsAr;

  if (isEn) {
    return {
      text:
        `${buildTimeGreeting('en')}, I'm Tecnos, STI's intelligent assistant.\n\n` +
        `I'm here to help you with your PC, notebook, WiFi or printer.\n\n` +
        `First, what's your name?\n\n` +
        `You can also tap the button if you prefer not to say it.`,
      options: [
        { token: BUTTONS.NO_NAME, label: "Prefer not to say my name" }
      ]
    };
  }

  // Español
  const line1 = isEsAr
    ? `${buildTimeGreeting('es-AR')}, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.`
    : `${buildTimeGreeting('es-ES')}, soy Tecnos, asistente inteligente de STI — Servicio Técnico Inteligente.`;

  const line2 = isEsAr
    ? `Estoy para ayudarte con tu PC, notebook, WiFi o impresora.`
    : `Estoy para ayudarte con tu ordenador, portátil, WiFi o impresora.`;

  const line3 = isEsAr
    ? `Antes de seguir, ¿cómo te llamás?`
    : `Antes de seguir, ¿cómo te llamas?`;

  const line4 = isEsAr
    ? `Si preferís no decir tu nombre, podés usar el botón de abajo.`
    : `Si prefieres no decir tu nombre, puedes usar el botón de abajo.`;

  return {
    text: `${line1}\n\n${line2}\n\n${line3}\n\n${line4}`,
    options: [
      { token: BUTTONS.NO_NAME, label: 'Prefiero no decirlo' }
    ]
  };
}

function buildAskProblem(locale, userName) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;
  const name = userName || (isEn ? 'there' : 'ahí');

  if (isEn) {
    return {
      text:
        `Thanks, ${name}. 👍\n\n` +
        `I'm here to help you with your PC, notebook, WiFi or printer.\n\n` +
        `Now tell me: what problem are you having, or what do you need help with?`,
      options: []
    };
  }

  const base = profile.isEsAr
    ? `Gracias, ${name}. 👍\n\nEstoy para ayudarte con tu PC, notebook, WiFi o impresora.\n\nAhora contame: ¿qué problema estás teniendo o en qué necesitás ayuda?`
    : `Gracias, ${name}. 👍\n\nEstoy para ayudarte con tu ordenador, portátil, WiFi o impresora.\n\nAhora cuéntame: ¿qué problema estás teniendo o en qué necesitas ayuda?`;

  return { text: base, options: [] };
}

function buildBasicStepsReply(locale, userName, device, isHowTo, isProblem, aiText) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;

  let header;
  if (isEn) {
    if (isHowTo && !isProblem) {
      header = `Perfect, ${userName || 'there'} 🙌\n\nLet's go step by step so you can do what you need on your ${device || 'device'}.`;
    } else {
      header = `Perfect, ${userName || 'there'} 🙌\n\nLet's try some checks on your ${device || 'device'} to see if we can solve it together.`;
    }
  } else {
    if (isHowTo && !isProblem) {
      header = `Perfecto, ${userName || 'ahí'} 🙌\n\nVamos paso a paso para que puedas hacer lo que necesitás en tu ${device || 'equipo'}.`;
    } else {
      header = `Perfecto, ${userName || 'ahí'} 🙌\n\nProbemos algunas verificaciones en tu ${device || 'equipo'} a ver si lo podemos resolver juntos.`;
    }
  }

  const textParts = [header];
  if (aiText) {
    textParts.push('', aiText);
  } else {
    if (isEn) {
      textParts.push(
        '',
        '1️⃣ Check if the equipment is properly connected to power or the charger.',
        '2️⃣ If it is a PC or notebook, keep the power button pressed for 15 seconds and then try again.',
        '3️⃣ If it is a printer, turn it off, disconnect it for 30 seconds and reconnect it.',
        '4️⃣ Tell me what happened after these steps: did anything change or is it still the same?'
      );
    } else {
      textParts.push(
        '',
        '1️⃣ Verificá que el equipo esté bien conectado a la corriente o al cargador.',
        '2️⃣ Si es una PC o notebook, mantené presionado el botón de encendido unos 15 segundos y volvé a probar.',
        '3️⃣ Si es una impresora, apagála, desconectála 30 segundos y volvé a conectarla.',
        '4️⃣ Contame qué pasó después de estos pasos: ¿cambió algo o sigue igual?'
      );
    }
  }

  const options = [
    { token: BUTTONS.SOLVED, label: isEn ? 'I solved it ✔️' : 'Lo pude solucionar ✔️' },
    { token: BUTTONS.PERSIST, label: isEn ? 'The problem persists ❌' : 'El problema persiste ❌' }
  ];

  return {
    text: textParts.join('\n'),
    options
  };
}

function buildEscalateReply(locale) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;

  if (isEn) {
    return {
      text:
        `Thanks for the info 🙏\n\n` +
        `Would you like to try a few more checks, or do you prefer to connect with a human technician?`,
      options: [
        { token: BUTTONS.MORE_TESTS, label: 'More checks 🔍' },
        { token: BUTTONS.CONNECT_TECH, label: 'Connect with technician 🧑‍💻' }
      ]
    };
  }

  const text =
    `Gracias por la info 🙏\n\n` +
    `¿Querés hacer algunas pruebas más o preferís que te conecte con un técnico humano?`;

  return {
    text,
    options: [
      { token: BUTTONS.MORE_TESTS, label: 'Más pruebas 🔍' },
      { token: BUTTONS.CONNECT_TECH, label: 'Conectar con técnico 🧑‍💻' }
    ]
  };
}

function buildAdvancedTestsReply(locale, userName, device) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;

  let text;
  if (isEn) {
    text =
      `Alright ${userName || ''}, let's try a couple of deeper checks on your ${device || 'device'}:\n\n` +
      `1️⃣ If it has a power cable, unplug it and plug it back in firmly.\n` +
      `2️⃣ If it's a notebook, test with another wall outlet or charger if you have one.\n` +
      `3️⃣ If it's a WiFi issue, restart the router and modem by unplugging them for 30 seconds.\n` +
      `4️⃣ Let me know what happened after these checks.`;
  } else {
    text =
      `Perfecto ${userName || ''}, hagamos un par de pruebas un poco más profundas en tu ${device || 'equipo'}:\n\n` +
      `1️⃣ Si tiene cable de alimentación, desconectalo y volvé a conectarlo firme.\n` +
      `2️⃣ Si es una notebook, probá en otro enchufe o con otro cargador si tenés.\n` +
      `3️⃣ Si el problema es de WiFi, reiniciá el router y el módem desenchufándolos 30 segundos.\n` +
      `4️⃣ Contame qué pasó después de estas pruebas.`;
  }

  const options = [
    { token: BUTTONS.SOLVED, label: isEn ? 'I solved it ✔️' : 'Lo pude solucionar ✔️' },
    { token: BUTTONS.PERSIST, label: isEn ? 'The problem persists ❌' : 'El problema persiste ❌' }
  ];

  return { text, options };
}

function buildSolvedReply(locale, userName) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;

  if (isEn) {
    return {
      text:
        `Great, ${userName || 'there'}! 🎉\n\n` +
        `I'm glad we could solve it together.\n\n` +
        `If you need help again with your PC, notebook, WiFi or printer, you can come back to this chat or visit stia.com.ar / @sti.rosario.`,
      options: []
    };
  }

  const text =
    `¡Genial, ${userName || 'ahí'}! 🎉\n\n` +
    `Me alegra que lo hayamos podido resolver juntos.\n\n` +
    `Cuando necesites ayuda de nuevo con tu PC, notebook, WiFi o impresora, podés volver a este chat o entrar a stia.com.ar / @sti.rosario.`;

  return { text, options: [] };
}

function buildEndedFallback(locale) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;

  if (isEn) {
    return {
      text: `This conversation is already closed ✅\n\nIf you want, you can refresh the page to start a new chat with Tecnos.`,
      options: []
    };
  }

  return {
    text: `Esta conversación ya quedó cerrada ✅\n\nSi querés, podés refrescar la página para iniciar un nuevo chat con Tecnos.`,
    options: []
  };
}

// =========================
// WhatsApp Ticket
// =========================

function buildWhatsAppTicket(locale, session) {
  const profile = getLocaleProfile(locale || 'es-AR');
  const isEn = profile.isEn;
  const ticketId = generateTicketId();

  const header = isEn
    ? `STI • Ticket ${ticketId}`
    : `STI • Ticket ${ticketId}`;

  const createdAt = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const lines = [
    header,
    '',
    `Fecha/hora: ${createdAt}`,
    `Nombre: ${session.userName || '(sin nombre)'}`,
    `Idioma: ${session.userLocale || '(no definido)'}`,
    `Dispositivo: ${session.device || '(no detectado)'}`,
    '',
    `Resumen del problema:`,
    `${session.problem || '(sin descripción)'}`
  ];

  const text = lines.join('\n');
  const encoded = encodeURIComponent(text);
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;

  return { ticketId, url, text };
}

// =========================
// Express app
// =========================

const app = express();

// CORS
app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: true
}));

// JSON + URL-encoded
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Compresión
app.use(compression());

// Cabeceras de seguridad básicas
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limits básicos
const greetingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: nowIso(), status: 'STI Tecnos server up' });
});

// ===============
// /api/greeting
// ===============

app.get('/api/greeting', greetingLimiter, (req, res) => {
  const session = createFreshSession();
  const { text, options } = buildLanguageGreeting();

  session.transcript.push({ who: 'bot', text, ts: nowIso() });
  saveSession(session);

  res.json({
    ok: true,
    sessionId: session.id,
    reply: text,
    stage: session.stage,
    options
  });
});

// ===========
// /api/chat
// ===========

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    let { sessionId, text, button } = req.body || {};
    const incomingText = (text || '').toString().trim();
    const buttonToken = (button || '').toString().trim() || null;

    let session = getSession(sessionId);
    if (!session) {
      // Si no hay sesión válida, crear una nueva
      session = createFreshSession();
    }

    const ts = nowIso();

    if (incomingText) {
      session.transcript.push({ who: 'user', text: incomingText, ts });
    } else if (buttonToken) {
      session.transcript.push({ who: 'user', text: `[BOTÓN] ${buttonToken}`, ts });
    }

    // Helpers para respuesta
    const respond = (payload) => {
      const { reply, options, stage } = payload;
      if (reply) {
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      }
      if (stage) {
        session.stage = stage;
      }
      saveSession(session);
      res.json({
        ok: true,
        sessionId: session.id,
        stage: session.stage,
        reply,
        options: options || []
      });
    };

    // =====================
    // Lógica por estado
    // =====================

    // 1) ASK_LANGUAGE
    if (session.stage === STATES.ASK_LANGUAGE) {
      let locale = null;

      const lowered = incomingText.toLowerCase();

      if (buttonToken === BUTTONS.LANG_ES_AR || /argentina/.test(lowered)) {
        locale = 'es-AR';
      } else if (buttonToken === BUTTONS.LANG_ES_ES || /espa(ñ|n)a/.test(lowered)) {
        locale = 'es-ES';
      } else if (buttonToken === BUTTONS.LANG_EN || /english|ingl(e|é)s/.test(lowered)) {
        locale = 'en';
      }

      if (!locale) {
        // No entendimos el idioma, repetir
        const { text: greetText, options } = buildLanguageGreeting();
        return respond({
          reply: greetText + '\n\n⚠️ No entendí el idioma. Por favor, elegí una opción.',
          options,
          stage: STATES.ASK_LANGUAGE
        });
      }

      session.userLocale = locale;

      const askName = buildAskName(locale);
      return respond({
        reply: askName.text,
        options: askName.options,
        stage: STATES.ASK_NAME
      });
    }

    // 2) ASK_NAME
    if (session.stage === STATES.ASK_NAME) {
      const locale = session.userLocale || 'es-AR';
      const profile = getLocaleProfile(locale);
      const isEn = profile.isEn;

      if (buttonToken === BUTTONS.NO_NAME) {
        session.userName = isEn ? 'User' : 'Usuario';
        const askProblem = buildAskProblem(locale, session.userName);
        return respond({
          reply: askProblem.text,
          options: askProblem.options,
          stage: STATES.ASK_PROBLEM
        });
      }

      const candidate = incomingText.split(/\s+/)[0] || '';
      const looksValid = candidate.length >= 2 && candidate.length <= 20 && !/[0-9]/.test(candidate);

      if (!looksValid) {
        const msg = isEn
          ? `I couldn't detect a proper name 🤔\n\nPlease tell me only your name, for example: "Ana" or "Juan Pablo".`
          : `No detecté un nombre válido 🤔\n\nDecime solo tu nombre, por ejemplo: "Ana" o "Juan Pablo".`;
        return respond({
          reply: msg,
          options: [{ token: BUTTONS.NO_NAME, label: isEn ? 'Prefer not to say my name' : 'Prefiero no decirlo' }],
          stage: STATES.ASK_NAME
        });
      }

      session.userName = candidate[0].toUpperCase() + candidate.slice(1);
      const askProblem = buildAskProblem(locale, session.userName);
      return respond({
        reply: askProblem.text,
        options: askProblem.options,
        stage: STATES.ASK_PROBLEM
      });
    }

    // 3) ASK_PROBLEM
    if (session.stage === STATES.ASK_PROBLEM) {
      const locale = session.userLocale || 'es-AR';
      const profile = getLocaleProfile(locale);
      const isEn = profile.isEn;

      const problemText = incomingText;
      if (!problemText) {
        const msg = isEn
          ? `Tell me a bit more about what is happening so I can help you.`
          : `Contame un poco más qué está pasando así puedo ayudarte.`;
        return respond({
          reply: msg,
          options: [],
          stage: STATES.ASK_PROBLEM
        });
      }

      session.problem = problemText;

      const cls = classifyProblem(problemText);
      session.device = cls.device;
      session.isHowTo = cls.isHowTo;
      session.isProblem = cls.isProblem;

      if (!cls.isIT) {
        const msg = isEn
          ? `From what you wrote, it doesn't seem to be a typical IT problem (PC, WiFi, printer...).\n\nIf it is related to a computer, notebook, printer or WiFi, tell me a bit more and mention the device.`
          : `Por lo que me contás, no parece ser un problema típico de informática (PC, WiFi, impresora...).\n\nSi está relacionado con una computadora, notebook, impresora o WiFi, contame un poco más y nombrá el dispositivo.`;
        return respond({
          reply: msg,
          options: [],
          stage: STATES.ASK_PROBLEM
        });
      }

      // Tenemos algo de IT → preparar pasos
      let aiText = null;
      if (openai) {
        aiText = await callOpenAIHelp({
          locale,
          userName: session.userName,
          device: session.device,
          isHowTo: cls.isHowTo,
          problem: session.problem
        });
      }

      const replyObj = buildBasicStepsReply(locale, session.userName, session.device, cls.isHowTo, cls.isProblem, aiText);
      return respond({
        reply: replyObj.text,
        options: replyObj.options,
        stage: STATES.BASIC_TESTS
      });
    }

    // 4) BASIC_TESTS
    if (session.stage === STATES.BASIC_TESTS) {
      const locale = session.userLocale || 'es-AR';
      const profile = getLocaleProfile(locale);
      const isEn = profile.isEn;

      if (buttonToken === BUTTONS.SOLVED) {
        session.solved = true;
        const solvedReply = buildSolvedReply(locale, session.userName);
        return respond({
          reply: solvedReply.text,
          options: solvedReply.options,
          stage: STATES.ENDED
        });
      }

      if (buttonToken === BUTTONS.PERSIST) {
        const esc = buildEscalateReply(locale);
        return respond({
          reply: esc.text,
          options: esc.options,
          stage: STATES.ESCALATE
        });
      }

      const msg = isEn
        ? `Please choose if you solved the problem or if it still persists, using the buttons.`
        : `Elegí con los botones si pudiste solucionarlo o si el problema persiste.`;
      return respond({
        reply: msg,
        options: [
          { token: BUTTONS.SOLVED, label: isEn ? 'I solved it ✔️' : 'Lo pude solucionar ✔️' },
          { token: BUTTONS.PERSIST, label: isEn ? 'The problem persists ❌' : 'El problema persiste ❌' }
        ],
        stage: STATES.BASIC_TESTS
      });
    }

    // 5) ESCALATE
    if (session.stage === STATES.ESCALATE) {
      const locale = session.userLocale || 'es-AR';
      const profile = getLocaleProfile(locale);
      const isEn = profile.isEn;

      if (buttonToken === BUTTONS.MORE_TESTS) {
        const adv = buildAdvancedTestsReply(locale, session.userName, session.device);
        return respond({
          reply: adv.text,
          options: adv.options,
          stage: STATES.ADVANCED_TESTS
        });
      }

      if (buttonToken === BUTTONS.CONNECT_TECH) {
        const ticket = buildWhatsAppTicket(locale, session);
        const msg = isEn
          ? `Perfect. I'll generate a ticket with this conversation.\n\nTap the green button below to open WhatsApp and send it (you can review/edit the text before sending).`
          : `Perfecto. Voy a generar un ticket con esta conversación.\n\nTocá el botón verde de abajo para abrir WhatsApp y enviarlo (podés revisar/editar el texto antes de enviarlo).`;

        return respond({
          reply: msg + `\n\nWhatsApp: ${ticket.url}`,
          options: [],
          stage: STATES.ENDED
        });
      }

      const esc = buildEscalateReply(locale);
      return respond({
        reply: esc.text,
        options: esc.options,
        stage: STATES.ESCALATE
      });
    }

    // 6) ADVANCED_TESTS
    if (session.stage === STATES.ADVANCED_TESTS) {
      const locale = session.userLocale || 'es-AR';
      const profile = getLocaleProfile(locale);
      const isEn = profile.isEn;

      if (buttonToken === BUTTONS.SOLVED) {
        session.solved = true;
        const solvedReply = buildSolvedReply(locale, session.userName);
        return respond({
          reply: solvedReply.text,
          options: solvedReply.options,
          stage: STATES.ENDED
        });
      }

      if (buttonToken === BUTTONS.PERSIST) {
        const esc = buildEscalateReply(locale);
        return respond({
          reply: esc.text,
          options: esc.options,
          stage: STATES.ESCALATE
        });
      }

      const msg = isEn
        ? `Please choose with the buttons if you solved it or if the problem still persists.`
        : `Elegí con los botones si pudiste solucionarlo o si el problema persiste.`;
      const adv = buildAdvancedTestsReply(locale, session.userName, session.device);

      return respond({
        reply: adv.text + '\n\n' + msg,
        options: adv.options,
        stage: STATES.ADVANCED_TESTS
      });
    }

    // 7) ENDED
    if (session.stage === STATES.ENDED) {
      const ended = buildEndedFallback(session.userLocale || 'es-AR');
      return respond({
        reply: ended.text,
        options: ended.options,
        stage: STATES.ENDED
      });
    }

    // Fallback total
    const fallback = buildLanguageGreeting();
    session.stage = STATES.ASK_LANGUAGE;
    return respond({
      reply: fallback.text,
      options: fallback.options,
      stage: STATES.ASK_LANGUAGE
    });

  } catch (err) {
    log('[api/chat error]', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error'
    });
  }
});

// Root
app.get('/', (req, res) => {
  res.send('STI Tecnos server (MODO DIOS v1) is running.');
});

// Start
app.listen(PORT, () => {
  log(`STI Tecnos server (MODO DIOS v1) listening on port ${PORT}`);
});
