// server.js — STI Chat (V4.8 Direct-to-Tests + Session + OA)
// Revisión final 0 errores - 2025-11-02

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ====== Configuración base ======
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// ====== Archivos ======
const DATA_BASE = process.env.DATA_BASE || '/data';
const TRANSCRIPTS_DIR = path.join(DATA_BASE, 'transcripts');
const CHAT_FILE = './sti-chat.json';
const CHAT = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));

// ====== OpenAI ======
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ====== Estados ======
const STATES = {
  ASK_NAME: 'ASK_NAME',
  ASK_PROBLEM: 'ASK_PROBLEM',
  ASK_DEVICE: 'ASK_DEVICE',
  BASIC_TESTS: 'BASIC_TESTS',
  ADVANCED_TESTS: 'ADVANCED_TESTS',
  END: 'END'
};

// ====== Direct-to-Tests ======
const DIRECT_TO_TESTS = true;
const OA_MIN_CONF = 0.55;

async function analyzeProblemWithOA(problemText) {
  if (!openai) return { device: null, issueKey: null, confidence: 0 };
  const sys = `Sos técnico informático. Dado un problema, devolvé SOLO JSON:
{"device":"pc|notebook|monitor|impresora|router|modem|smartphone|tablet|null",
 "issueKey":"no_enciende|sin_imagen|sin_internet|lento|no_carga|no_windows|usb_no_detecta|se_reinicia|temperatura|error_disco|null",
 "confidence":0..1}`;
  const user = `Problema: "${problemText}"`;
  try {
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }]
    });
    const txt = r.choices?.[0]?.message?.content?.trim() || '{}';
    const j = JSON.parse(txt);
    return {
      device: (j.device || '').toLowerCase().trim() || null,
      issueKey: (j.issueKey || '').toLowerCase().trim() || null,
      confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0))
    };
  } catch {
    return { device: null, issueKey: null, confidence: 0 };
  }
}

// ====== Helper local ======
function detectDevice(txt = '') {
  const low = txt.toLowerCase();
  if (low.includes('notebook') || low.includes('laptop')) return 'notebook';
  if (low.includes('pc')) return 'pc';
  if (low.includes('router')) return 'router';
  if (low.includes('impresora')) return 'impresora';
  if (low.includes('monitor')) return 'monitor';
  return null;
}
function detectIssue(txt = '') {
  const low = txt.toLowerCase();
  if (low.includes('no prende') || low.includes('no enciende')) return 'no_enciende';
  if (low.includes('no da video') || low.includes('sin imagen')) return 'sin_imagen';
  if (low.includes('no tiene internet') || low.includes('sin internet')) return 'sin_internet';
  if (low.includes('lento')) return 'lento';
  if (low.includes('no carga')) return 'no_carga';
  if (low.includes('pantalla azul')) return 'no_windows';
  return null;
}
function issueHuman(k){return k?.replace(/_/g,' ')||'problema';}

// ====== Endpoint principal ======
app.post('/api/chat', async (req, res) => {
  const { text, stage: clientStage } = req.body;
  const t = String(text || '').trim();
  const session = req.body.session || { stage: STATES.ASK_PROBLEM, userName: 'Usuario', stepsDone: [] };

  if (session.stage === STATES.ASK_PROBLEM) {
    session.problem = t || session.problem;

    if (DIRECT_TO_TESTS) {
      let device = detectDevice(session.problem);
      let issueKey = detectIssue(session.problem);
      let confidence = issueKey ? 0.6 : 0;

      if (openai) {
        const ai = await analyzeProblemWithOA(session.problem);
        if ((ai.confidence || 0) >= confidence) {
          device = ai.device || device;
          issueKey = ai.issueKey || issueKey;
          confidence = ai.confidence || confidence;
        }
      }

      if (confidence >= OA_MIN_CONF && (issueKey || device)) {
        session.device = session.device || device || 'equipo';
        session.issueKey = issueKey || session.issueKey || null;
        session.stage = STATES.BASIC_TESTS;

        const key = session.issueKey || 'no_funciona';
        const pasos = (CHAT?.nlp?.advanced_steps?.[key]) || [
          'Verificá la energía (enchufe / zapatilla / botón I/O de la fuente)',
          'Probá otro tomacorriente o cable/cargador',
          'Mantené power 15–30s y volvé a encender'
        ];

        let reply  = `Entiendo, ${session.userName}. Tu **${session.device}** parece tener: ${issueHuman(key)} 🔍\n\n`;
        reply     += `🔧 **Probemos esto primero:**\n`;
        pasos.slice(0, 4).forEach((p, i) => reply += `${i + 1}. ${p}\n`);
        reply     += `\nCuando termines, contame si **sigue igual** o **mejoró**.`;
        return res.json({ ok: true, reply, options: ['Listo, sigue igual', 'Funcionó 👍', 'WhatsApp'] });
      }
    }

    const reply = `Perfecto, ${session.userName}. Anoté: “${session.problem}”.\n\n¿En qué equipo te pasa? (PC, notebook, teclado, etc.)`;
    session.stage = STATES.ASK_DEVICE;
    return res.json({ ok: true, reply, options: ['PC','Notebook','Monitor','Teclado','Internet / Wi-Fi'] });
  }

  return res.json({ ok: true, reply: '⚡ ¡Bienvenido! Soy Tecnos 🤖. ¿Cómo te llamás?' });
});

// ====== Otros endpoints ======
app.get('/api/health', (req,res)=>res.json({ok:true,version:'4.8'}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`STI Chat Server v4.8 activo en puerto ${PORT}`));
