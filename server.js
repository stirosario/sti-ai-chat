// server.js (resiliente: funciona con o sin OPENAI_API_KEY)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

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

// ===== Carga de flujos (base + avanzado) =====
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { console.warn('⚠️ No se pudo leer', p, e.message); return null; }
}
function mergeArraysUniqueById(a = [], b = []){
  const map = new Map();
  for(const it of [...a, ...b]){
    const id = it?.id ?? JSON.stringify(it).slice(0,50);
    if(!map.has(id)) map.set(id, it);
    else{
      const prev = map.get(id);
      const tset = new Set([...(prev.triggers||[]), ...(it.triggers||[])]);
      map.set(id, {
        ...prev, ...it,
        triggers: Array.from(tset),
        response: (it.response?.length||0) >= (prev.response?.length||0) ? it.response : prev.response
      });
    }
  }
  return Array.from(map.values());
}

const CANDIDATE_DIRS = [process.cwd(), __dirname, path.resolve(__dirname, '..')];
const BASE_NAMES = ['sti-chat-flujos.json', 'sti-chat-flujos-avanzados.json'];
const resolveFirst = (fname) => {
  for(const d of CANDIDATE_DIRS){
    const p = path.join(d, fname);
    if(fs.existsSync(p)) return p;
  }
  return null;
};

const FLOWS_BASE_PATH = resolveFirst(BASE_NAMES[0]);
const FLOWS_ADV_PATH  = resolveFirst(BASE_NAMES[1]);

const flowsBase = FLOWS_BASE_PATH ? safeReadJSON(FLOWS_BASE_PATH) : {};
const flowsAdv  = FLOWS_ADV_PATH  ? safeReadJSON(FLOWS_ADV_PATH)  : {};

let STI = {
  settings: { ...(flowsBase?.settings||{}), ...(flowsAdv?.settings||{}) },
  messages: { ...(flowsBase?.messages||{}), ...(flowsAdv?.messages||{}) },
  intents: mergeArraysUniqueById(flowsBase?.intents||[], flowsAdv?.intents||[]),
  fallback: { response: (flowsAdv?.fallback?.response || flowsBase?.fallback?.response || '{fallback}') }
};

console.log('✅ Flujos cargados:');
console.log(`   - Base: ${flowsBase?.intents?.length || 0} intents ${FLOWS_BASE_PATH ? `(${FLOWS_BASE_PATH})` : '(no encontrado)'}`);
console.log(`   - Avanzado: ${flowsAdv?.intents?.length || 0} intents ${FLOWS_ADV_PATH ? `(${FLOWS_ADV_PATH})` : '(no encontrado)'}`);
console.log(`   - Combinado total: ${STI?.intents?.length || 0} intents`);

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
const normalize = (s='') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

// ===== Endpoint principal =====
app.post('/api/chat', async (req, res) => {
  try{
    const { message, history = [] } = req.body || {};
    const text = normalize(String(message || ''));
    const ts = new Date().toLocaleString('es-AR');
    console.log(`📩 [${ts}] input: "${text}"`);

    // 1) Intent matcher
    let reply = STI.fallback.response.replace('{fallback}', STI.messages.fallback || 'Decime una palabra clave.');
    for(const intent of STI.intents){
      const triggers = Array.isArray(intent.triggers) ? intent.triggers : [];
      if(triggers.some(k => text.includes(normalize(String(k))))){
        reply = (intent.response || '')
          .replace('{greeting}', STI.messages.greeting || 'Hola')
          .replace('{help_menu_title}', STI.messages.help_menu_title || 'Temas')
          .replace('{help_menu}', (STI.messages.help_menu || []).join('\n'))
          .replace('{fallback}', STI.messages.fallback || '');
        console.log(`🤖 intent="${intent.id}"`);
        return res.json({ reply });
      }
    }

    // 2) Fallback IA si hay clave
    if (USE_OPENAI && openaiClient){
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Sos asistente técnico STI. Responde conciso en español de Argentina.' },
          ...[...(Array.isArray(history)?history:[])].slice(-8),
          { role: 'user', content: message || '' }
        ]
      });
      reply = completion.choices?.[0]?.message?.content?.trim() || reply;
      console.log('🤖 openai fallback usado');
      return res.json({ reply });
    }

    // 3) Sin OpenAI: devolvér guía útil
    const guide = `${STI.messages.greeting || 'Hola'}\n\n` +
      `**${STI.messages.help_menu_title || 'Temas disponibles'}**\n` +
      (STI.messages.help_menu || []).map(i => `• ${i}`).join('\n');
    console.log('ℹ️ guía enviada (sin OpenAI)');
    return res.json({ reply: guide });

  }catch(e){
    console.error('❌ ERROR /api/chat:', e.message);
    return res.status(200).json({ reply: 'No pude procesar la consulta. Probá con una palabra clave como "drivers", "bsod", "powershell", "red".' });
  }
});

// ===== Health & root =====
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    hasOpenAI: USE_OPENAI,
    baseIntents: flowsBase?.intents?.length || 0,
    advIntents: flowsAdv?.intents?.length || 0,
    totalIntents: STI?.intents?.length || 0,
    basePath: FLOWS_BASE_PATH || null,
    advPath: FLOWS_ADV_PATH || null
  });
});
app.get('/', (_req, res) => res.type('text').send('🧠 STI AI backend activo'));

// ===== Arranque =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`🧠 STI AI backend escuchando en puerto ${PORT}`));
