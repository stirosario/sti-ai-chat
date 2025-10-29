// server.js (resiliente: funciona con o sin OPENAI_API_KEY)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ==== NUEVO: utilidades modulares ====
import { isGreetingMessage } from './detectarSaludo.js';
import { normalizarTextoCompleto } from './normalizarTexto.js';

// ===== CORS =====
const app = express();
const ALLOWED_ORIGINS = [
  'https://stia.com.ar',
  'http://stia.com.ar',
  'http://localhost:5173',
  'http://localhost:5500',
  'https://sti-rosario-ai.onrender.com'
];
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error('Origen no permitido')),
  credentials: true
}));
app.use(express.json());

// CTA WhatsApp (backup por compatibilidad)
const WHATSAPP_CTA = "\n\nSi preferís, escribinos por WhatsApp: https://wa.me/5493417422422 ";

// ===== Paths util =====
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { console.warn('⚠️ No se pudo leer', p, e.message); return null; }
}

const CANDIDATE_DIRS = [process.cwd(), __dirname, path.resolve(__dirname, '..')];
const resolveFirst = (fname) => {
  if (!fname) return null;
  for (const d of CANDIDATE_DIRS) {
    const p = path.join(d, fname);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// ===== Carga de flujos (NUEVO: sti-chat.json con sections) =====
const FLOWS_NEW_PATH = resolveFirst('sti-chat.json');
const FLOWS_OLD_PATH = resolveFirst('sti-chat-flujos.json');

const flowsNew = FLOWS_NEW_PATH ? safeReadJSON(FLOWS_NEW_PATH) : null;
const flowsBase = flowsNew || (FLOWS_OLD_PATH ? safeReadJSON(FLOWS_OLD_PATH) : {});

let STI = {
  bot: flowsBase?.bot || 'STI • Servicio Técnico Inteligente',
  locale: flowsBase?.locale || 'es-AR',
  version: flowsBase?.version || '2.x',
  settings: flowsBase?.settings || {},
  messages: flowsBase?.messages || {},
  intents: flowsBase?.intents || [],
  fallback: flowsBase?.fallback || { response: '{fallback}' },
  sections: flowsBase?.sections || null
};

console.log('✅ Flujos cargados:');
console.log(`   - Nuevo: ${FLOWS_NEW_PATH ? FLOWS_NEW_PATH : '(no encontrado)'}`);
console.log(`   - Legacy: ${FLOWS_OLD_PATH ? FLOWS_OLD_PATH : '(no encontrado)'}`);
console.log(`   - Intents totales: ${STI?.intents?.length || 0}`);

// ===== OpenAI opcional =====
let USE_OPENAI = Boolean(process.env.OPENAI_API_KEY);
let openaiClient = null;
if (USE_OPENAI) {
  const { default: OpenAI } = await import('openai');
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('🔐 OPENAI habilitado');
} else {
  console.log('ℹ️ OPENAI deshabilitado (sin OPENAI_API_KEY). Se usará solo el motor de flujos.');
}

// ===== Helpers =====
function normalizeRaw(s = '') { return String(s ?? ''); }

// Mantenemos compatibilidad con nlp config de sections,
// pero aprovechamos nuestro normalizador común.
function normalizeWithConfig(s = '') {
  const raw = normalizeRaw(s);
  const nlp = STI.sections?.nlp || {};

  // Aplico normalización completa por defecto (minúsculas, sin acentos, sin repes, trim)
  let out = normalizarTextoCompleto(raw);

  // Permitir desactivar partes desde config si existiera esa necesidad
  if (nlp.lowercase === false) out = out; // ya está en minúsculas por defecto
  if (nlp.strip_accents === false) {
    // reinyectar acentos no es trivial; si se desactiva, usamos solo trim/espacios
    out = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  }
  if (nlp.trim === false) {
    // poco común: devolver con espacios extremos si lo piden
    out = ` ${out} `;
  }
  return out;
}

// Template simple: {{whatsapp_link}}
function tpl(str) {
  if (!str) return '';
  const whats = STI.settings?.whatsapp_link || 'https://wa.me/5493417422422';
  return String(str).replace(/\{\{\s*whatsapp_link\s*\}\}/g, whats);
}

// ----- Fuzzy matching -----
function levenshtein(a = '', b = '') {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp = Array.from({ length: al + 1 }, () => Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[al][bl];
}
function fuzzyIncludes(text, trigger) {
  if (!text || !trigger) return false;
  const t = normalizeWithConfig(text);
  const k = normalizeWithConfig(trigger);
  if (t.includes(k) || k.includes(t)) return true;
  const words = t.split(' ');
  for (const w of words) {
    if (w.length >= 3) {
      const d = levenshtein(w, k);
      if ((w.length <= 5 && d <= 1) || (w.length >= 6 && d <= 2)) return true;
    }
  }
  return false;
}

// === Helper: detección de marca canónica ===
function detectBrandCanonical(textNorm = '') {
  const tests = [
    { rx: /\b(hp|h p|h\-p|hpe|hepi|jepi|agp)\b/, canon: 'HP' },
    { rx: /\b(lenovo|lenovoa|lenobo|lenow|lenoovo)\b/, canon: 'Lenovo' },
    { rx: /\b(dell|del|delk|dlell|dele|delp|alienware|alien war|alienwer|alienwaer)\b/, canon: 'Dell / Alienware' },
    { rx: /\b(asus|azus|asuz|asuss|asuzt|asusz)\b/, canon: 'ASUS' },
    { rx: /\b(acer|azer|azzer|ascer|accer)\b/, canon: 'Acer' },
    { rx: /\b(toshiba|toshiva|toshia|tosiva|tosh)\b/, canon: 'Toshiba' },
    { rx: /\b(samsung|sansumg|samgsung|samsumg|samung|sangsun)\b/, canon: 'Samsung' },
    { rx: /\b(sony|soni|soony|zoni|soney)\b/, canon: 'Sony' },
    { rx: /\b(apple|aple|aplle|appple|appl|manzana)\b/, canon: 'Apple' },
    { rx: /\b(msi|m s i|emesai|msy|mpsi)\b/, canon: 'MSI' },
    { rx: /\b(bangho|banho|banjo|bangó|vangho)\b/, canon: 'Banghó' },
    { rx: /\b(exo|exa|exxa|exsa|exza|exa computers)\b/, canon: 'EXO' },
    { rx: /\b(positivo|posotivo|posiitivo|postivo|positibo)\b/, canon: 'Positivo' },
    { rx: /\b(bgh|b g h|begeache|bejéache|bjeh)\b/, canon: 'BGH' },
    { rx: /\b(compaq|kompak|kompaq|compak|kompa)\b/, canon: 'Compaq' },
    { rx: /\b(gateway|geteway|getaway|gatewey|gatewei|gatuwey)\b/, canon: 'Gateway' },
    { rx: /\b(huawei|huawey|huaue?i|guawey|wawey)\b/, canon: 'Huawei' },
    { rx: /\b(xiaomi|xioami|xiomi|xiomy|xiaomy|xiaommi|chaomi)\b/, canon: 'Xiaomi' },
    { rx: /\b(vaio|vaoi|vao|vayio|baio)\b/, canon: 'VAIO' },
    { rx: /\b(lg|l g|elgi|eleji|ege|lge)\b/, canon: 'LG' }
  ];
  for (const t of tests) if (t.rx.test(textNorm)) return t.canon;
  return null;
}

// === Estado simple por cliente ===
const missCounters = new Map(); // key = req.ip (o un header si tenés sesión)
function bumpMiss(ip) { const n = (missCounters.get(ip) || 0) + 1; missCounters.set(ip, n); return n; }
function resetMiss(ip) { missCounters.set(ip, 0); }

// ===== Endpoint principal =====
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};

    const rawText  = String(message || '');
    const textNorm = normalizeWithConfig(rawText);           // normalización gobernada por config
    const textClean = normalizarTextoCompleto(rawText);      // normalizador común (para logs/reglas globales)

    const ts = new Date().toLocaleString('es-AR');
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anon';
    console.log(`📩 [${ts}] input(${ip}): "${textNorm}"`);

    // --- 0) Si viene vacío → saludo + menú
    if (!textNorm) {
      const greet = STI.sections?.greetings?.response || STI.messages?.greeting || 'Hola, ¿en qué puedo ayudarte?';
      const menuTitle = STI.sections?.menus?.help_menu_title || STI.messages?.help_menu_title || 'Temas frecuentes';
      const menuItems = (STI.sections?.menus?.help_menu || STI.messages?.help_menu || []).map(i => `• ${i}`).join('\n');
      const guide = `${tpl(greet)}\n\n**${menuTitle}**\n${menuItems}`;
      resetMiss(ip);
      return res.json({ reply: guide });
    }

    // --- 1) Detección de saludo universal (ES + EN) —> responde saludo breve
    if (isGreetingMessage(rawText) || isGreetingMessage(textClean)) {
      resetMiss(ip);
      const greet = tpl(
        (STI.sections?.greetings?.response) ||
        (STI.messages?.greeting) ||
        '¡Hola! 👋 Soy Tecnos de STI. ¿En qué puedo ayudarte hoy?'
      );

      // Mostrar menú inicial si está habilitado (por defecto sí)
      const showMenu = STI.settings?.greet_show_menu !== false;
      if (showMenu) {
        const menuTitle = STI.sections?.menus?.help_menu_title || STI.messages?.help_menu_title || 'Temas frecuentes';
        const menuItems = (STI.sections?.menus?.help_menu || STI.messages?.help_menu || [])
          .map(i => `• ${i}`).join('\n');
        return res.json({ reply: `${greet}\n\n**${menuTitle}**\n${menuItems}` });
      }
      return res.json({ reply: greet });
    }

    // --- 1.b) Greetings por sections.greetings (triggers explícitos)
    const gs = STI.sections?.greetings;
    if (gs?.triggers?.some(k => fuzzyIncludes(textNorm, String(k)))) {
      resetMiss(ip);
      const greet = tpl(gs.response);
      return res.json({ reply: greet });
    }

    // --- 2) Intent matcher (con detección de marca)
    for (const intent of (STI.intents || [])) {
      const triggers = Array.isArray(intent.triggers) ? intent.triggers : [];
      if (triggers.some(k => fuzzyIncludes(textNorm, String(k)))) {
        resetMiss(ip);
        let reply = intent.response || '';

        // === Detección de marca (única y universal) ===
        const canon = detectBrandCanonical(textNorm); // p.ej. "ASUS", "HP", etc.
        if (canon) {
          if (/\{\{\s*marca_detectada\s*\}\}/.test(reply)) {
            reply = reply.replace(/\{\{\s*marca_detectada\s*\}\}/g, canon);
          } else {
            const alreadyMentions = new RegExp(`\\b${canon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(reply);
            if (!alreadyMentions) {
              if (/\n\n¿Sigue igual\?/.test(reply)) {
                reply = reply.replace(/\n\n¿Sigue igual\?/, `\n\n💡 Veo que tenés una ${canon}.\n\n¿Sigue igual?`);
              } else {
                reply = `💡 Veo que tenés una ${canon}.\n\n` + reply;
              }
            }
          }
          console.log(`🔎 marca_detectada=${canon}`);
        }

        // Sustituciones legacy
        reply = reply
          .replace('{greeting}', STI.messages.greeting || 'Hola')
          .replace('{help_menu_title}', STI.messages.help_menu_title || 'Temas')
          .replace('{help_menu}', (STI.messages.help_menu || []).join('\n'))
          .replace('{fallback}', STI.messages.fallback || '');

        // Plantillas
        reply = tpl(reply);

        console.log(`🤖 intent="${intent.id}"`);
        const hasWhats = reply.includes('wa.me/') || reply.includes('{{whatsapp_link}}');
        return res.json({ reply: hasWhats ? reply : (reply + WHATSAPP_CTA) });
      }
    }

    // --- 3) Fallback local: soft → medio → hard (WhatsApp)
    const limit = Number(STI.settings?.fallback_escalation_after ?? 3);
    const currentMiss = bumpMiss(ip);

    if (currentMiss >= limit) {
      resetMiss(ip);
      const hard = STI.sections?.fallbacks?.hard
        || 'No pude resolverlo por acá 🤔. Te ofrezco asistencia personalizada por WhatsApp 👉 {{whatsapp_link}}';
      return res.json({ reply: tpl(hard) });

    } else if (currentMiss === Math.max(2, limit - 1) && STI.sections?.fallbacks?.medio) {
      const medio = STI.sections.fallbacks.medio;
      return res.json({ reply: tpl(medio) });

    } else {
      const soft = STI.sections?.fallbacks?.soft
        || STI.messages?.fallback
        || 'Para ayudarte mejor, elegí un tema de la lista o describí el problema en 1 frase.';
      return res.json({ reply: tpl(soft) });
    }

  } catch (e) {
    console.error('❌ ERROR /api/chat:', e.stack || e.message);
    return res.status(200).json({ reply: 'No pude procesar la consulta. Probá con una palabra clave como "drivers", "bsod", "powershell", "red".' });
  }
});

// ===== Health & root =====
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: USE_OPENAI,
    totalIntents: STI?.intents?.length || 0,
    usingNewFlows: Boolean(FLOWS_NEW_PATH),
    newPath: FLOWS_NEW_PATH || null,
    legacyPath: FLOWS_OLD_PATH || null,
    fallbackEscalationAfter: STI.settings?.fallback_escalation_after ?? 3
  });
});
app.get('/', (_req, res) => res.type('text').send('🧠 STI AI backend activo'));

// ===== Arranque =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`🧠 STI AI backend escuchando en puerto ${PORT}`));
