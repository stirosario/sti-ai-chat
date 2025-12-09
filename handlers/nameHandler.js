/**
 * handlers/nameHandler.js
 * Manejo de validación de nombres y stage ASK_NAME
 */

import { nowIso } from '../utils/common.js';
import {
  normalizeWithCalibracion,
  matchCalibracionPattern,
  getCalibracionResponse,
  extractCalibracionKeywords,
  validateWithCalibracion,
  logCalibracionFailure,
  logCalibracionSuccess
} from './calibracionHandler.js';

// Constantes para validación de nombres
const NUM_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const TECH_WORDS = /^(pc|notebook|laptop|monitor|teclado|mouse|impresora|router|modem|telefono|celular|tablet|android|iphone|windows|linux|macos|ssd|hdd|fuente|mother|gpu|ram|disco|usb|wifi|bluetooth|red)$/i;
const NO_NAME_RX = /(prefiero no|no quiero|no te lo|no dar|no digo|no decir|sin nombre|anonimo|anónimo|skip|saltar|omitir)/i;
const NAME_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con', 'por', 'para', 'sobre',
  'mi', 'tu', 'su', 'nuestro', 'vuestro', 'sus', 'mis', 'tus', 'nuestros', 'vuestros',
  'tengo', 'tiene', 'tienen', 'tenemos', 'tenéis', 'tienen', 'hay', 'está', 'están', 'estamos', 'estáis',
  'problema', 'problemas', 'error', 'errores', 'falla', 'fallas', 'no funciona', 'no anda', 'no prende'
]);
const NAME_TOKEN_RX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,20}$/u;
const MAX_NAME_TOKENS = 3;
const MIN_NAME_TOKENS = 1;

/**
 * Capitaliza un token de nombre (maneja guiones y apóstrofes)
 */
export function capitalizeToken(tok) {
  if (!tok) return tok;
  return tok.split(/[-''\u2019]/).map(part => {
    if (!part) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('-');
}

/**
 * Valida si un texto es un nombre válido
 */
export function isValidName(text) {
  if (!text || typeof text !== 'string') return false;
  const s = String(text).trim();
  if (!s) return false;

  // reject digits or special symbols
  if (/[0-9@#\$%\^&\*\(\)_=\+\[\]\{\}\\\/<>]/.test(s)) return false;

  // reject if includes technical words
  if (TECH_WORDS.test(s)) return false;

  const lower = s.toLowerCase();
  for (const w of lower.split(/\s+/)) {
    if (NAME_STOPWORDS.has(w)) return false;
  }

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < MIN_NAME_TOKENS || tokens.length > MAX_NAME_TOKENS) return false;

  // if too many words overall -> reject
  if (s.split(/\s+/).filter(Boolean).length > 6) return false;

  // blacklist (trolls, apodos, palabras comunes)
  const blacklist = [
    'pepelito', 'papelito', 'pepito', 'probando', 'aaaa', 'jjjj', 'zzzz', 'asdasd', 'qwerty', 'basurita', 'basura', 'tuerquita', 'chuchuki',
    'corcho', 'coco', 'pepe', 'toto', 'nene', 'nena', 'pibe', 'piba', 'guacho', 'wacho', 'bobo', 'boludo', 'pelotudo',
    'chicle', 'goma', 'lapiz', 'papel', 'mesa', 'silla', 'puerta', 'ventana', 'techo', 'piso', 'pared',
    'amigo', 'amiga', 'hermano', 'hermana', 'primo', 'prima', 'tio', 'tia', 'abuelo', 'abuela',
    'test', 'testing', 'prueba', 'ejemplo', 'admin', 'usuario', 'user', 'cliente', 'persona',
    'hola', 'chau', 'gracias', 'perdon', 'disculpa', 'sorry', 'hello', 'bye'
  ];
  if (blacklist.includes(s.toLowerCase())) return false;

  for (const tok of tokens) {
    // each token must match token regex
    if (!NAME_TOKEN_RX.test(tok)) return false;
    // token stripped of punctuation should be at least 2 chars
    if (tok.replace(/[''\-]/g, '').length < 2) return false;
  }

  // passed validations
  return true;
}

export const isValidHumanName = isValidName;

/**
 * Extrae un nombre del texto del usuario
 */
export function extractName(text) {
  if (!text || typeof text !== 'string') return null;
  const sRaw = String(text).trim();
  if (!sRaw) return null;
  const s = sRaw.replace(/[.,!?]+$/, '').trim();

  // patterns: "me llamo X", "soy X", "mi nombre es X"
  const patterns = [
    /\b(?:me llamo|soy|mi nombre es|me presento como)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
    /^\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})\s*$/i
  ];

  for (const rx of patterns) {
    const m = s.match(rx);
    if (m && m[1]) {
      let candidate = m[1].trim().replace(/\s+/g, ' ');
      // limit tokens to MAX_NAME_TOKENS
      const tokens = candidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
      const normalized = tokens.map(t => capitalizeToken(t)).join(' ');
      if (isValidName(normalized)) return normalized;
    }
  }

  // fallback: if the whole short text looks like a name
  const singleCandidate = s;
  if (isValidName(singleCandidate)) {
    const tokens = singleCandidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
    return tokens.map(capitalizeToken).join(' ');
  }

  return null;
}

/**
 * Detecta si un texto claramente NO es un nombre
 */
export function looksClearlyNotName(text) {
  if (!text || typeof text !== 'string') return true;
  const s = text.trim().toLowerCase();
  if (!s) return true;

  // clear short greetings
  if (s.length <= 6 && ['hola', 'hola!', 'buenas', 'buenos', 'buen día', 'buen dia'].includes(s)) return true;

  if (NAME_STOPWORDS.has(s)) return true;

  if (TECH_WORDS.test(s)) return true;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) return true;

  const indicators = ['mi', 'no', 'enciende', 'tengo', 'problema', 'problemas', 'se', 'me', 'con', 'esta', 'está', 'tiene'];
  for (const w of words) { if (indicators.includes(w)) return true; }

  return false;
}

/**
 * Analiza un nombre con OpenAI (opcional)
 */
export async function analyzeNameWithOA(nameText = '', openai, OPENAI_MODEL) {
  if (!openai) return { isValid: true, confidence: 0.8, reason: 'fallback_accepted' };
  const prompt = [
    "Sos un validador de nombres humanos en español (Argentina).",
    "",
    "RECHAZÁ únicamente si es CLARAMENTE:",
    "- Palabras comunes de objetos: Mesa, Silla, Puerta, Celular, Teclado, etc.",
    "- Saludos o frases: Hola, Gracias, Buenos días, Chau, etc.",
    "- Palabras sin sentido: Aaaa, Zzzz, Asdasd, 123, etc.",
    "- Descripciones de problemas: 'tengo un problema', 'mi computadora', etc.",
    "",
    "ACEPTÁ si puede ser un nombre real, aunque sea un apodo o diminutivo:",
    "- Nombres comunes: María, Juan, Ana, Carlos, Raúl, Laura, José, Lucía, Diego, etc.",
    "- Apodos comunes que las personas usan: Pepe, Toto, Coco, Pancho, Lucho, Nico, etc.",
    "- Nombres cortos o diminutivos: Raul, Marcos, Franco, Mateo, etc.",
    "- Nombres compuestos: María Elena, Juan Carlos, Ana Laura, José Luis, etc.",
    "",
    "Ante la duda, ACEPTÁ el nombre.",
    "",
    "Respondé SOLO un JSON con {isValid: true|false, confidence: 0..1, reason: 'explicación clara'}.",
    `Texto a validar: "${String(nameText).replace(/"/g, '\\"')}"`
  ].join('\n');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const raw = (r.choices?.[0]?.message?.content || '').trim().replace(/```json|```/g, '');
    try {
      const parsed = JSON.parse(raw);
      return {
        isValid: !!parsed.isValid,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
        reason: parsed.reason || ''
      };
    } catch (e) {
      return { isValid: true, confidence: 0.7, reason: 'parse_error_accepted' };
    }
  } catch (e) {
    return { isValid: true, confidence: 0.7, reason: 'openai_error_accepted' };
  }
}

/**
 * Handler principal del stage ASK_NAME
 * 🔧 FIX CRÍTICO: Incluye validación defensiva de mensaje vacío
 */
export async function handleAskNameStage(session, userText, buttonToken, sid, res, dependencies) {
  const {
    STATES,
    nowIso,
    saveSessionAndTranscript,
    markSessionDirty,
    capitalizeToken: capToken,
    changeStage
  } = dependencies;

  console.log('[ASK_NAME] DEBUG - buttonToken:', buttonToken, 'text:', userText);
  const locale = session.userLocale || 'es-AR';
  const isEn = String(locale).toLowerCase().startsWith('en');

  // 🔧 FIX CRÍTICO: Validación defensiva - Si el mensaje está vacío, responder inmediatamente
  if (!userText || userText.length === 0) {
    console.error('[ASK_NAME] ⚠️ Mensaje vacío recibido:', {
      userText: userText,
      buttonToken: buttonToken,
      sessionStage: session.stage
    });
    
    const reply = isEn
      ? "I didn't receive your message. Please try typing your name again."
      : "No recibí tu mensaje. Por favor, escribí tu nombre de nuevo.";
    
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    // 🔧 REFACTOR FASE 2: Guardado inmediato solo para casos críticos (errores)
    await saveSessionAndTranscript(sid, session);
    
    return {
      ok: true,
      reply,
      stage: session.stage,
      handled: true
    };
  }

  // ✅ CALIBRACIÓN: Intentar primero con la configuración de calibración
  const calibMatch = matchCalibracionPattern(userText, 'ASK_NAME');
  if (calibMatch && calibMatch.matched) {
    // Normalizar usando calibración
    const normalized = normalizeWithCalibracion(userText, 'ASK_NAME');
    
    // Validar el nombre normalizado
    if (isValidName(normalized)) {
      // Capitalizar tokens del nombre
      const tokens = normalized.split(/\s+/).slice(0, MAX_NAME_TOKENS);
      const candidate = tokens.map(t => {
        // Usar capitalizeToken local
        return capitalizeToken(t);
      }).join(' ');
      
      session.userName = candidate;
      changeStage(session, STATES.ASK_NEED);
      session.nameAttempts = 0;
      
      // Obtener respuesta de calibración o usar default
      let reply = getCalibracionResponse('ASK_NAME');
      if (reply) {
        // Reemplazar placeholders
        reply = reply.replace(/{name}/g, capToken(session.userName));
      } else {
        // Fallback a respuesta por defecto
        reply = isEn
          ? `Perfect, ${capToken(session.userName)} 😊 What can I help you with today?`
          : (locale === 'es-419'
            ? `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy?`
            : `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy?`);
      }
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      markSessionDirty(sid, session);
      
      // Registrar éxito
      logCalibracionSuccess('ASK_NAME');
      
      return {
        ok: true,
        reply,
        stage: session.stage,
        handled: true
      };
    }
  }

  // ✅ DETECCIÓN AUTOMÁTICA: Si el usuario escribe una palabra que es claramente un nombre
  const candidate = extractName(userText);
  if (candidate && isValidName(candidate)) {
    // ✅ NOMBRE DETECTADO - Guardar y avanzar inmediatamente
    session.userName = candidate;
    session.stage = STATES.ASK_NEED;
    session.nameAttempts = 0;

    // ✅ RESPUESTA OBLIGATORIA: Bienvenida personalizada
    const reply = isEn
      ? `Perfect, ${capToken(session.userName)} 😊 What can I help you with today?`
      : (locale === 'es-419'
        ? `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy?`
        : `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy?`);

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    // 🔧 REFACTOR FASE 2: Guardado diferido (se guardará antes de enviar respuesta)
    markSessionDirty(sid, session);
    
    return {
      ok: true,
      reply,
      stage: session.stage,
      handled: true
    };
  }

  // ✅ FASE 5-3: Usar constante centralizada
  // Límite de intentos: después de MAX_NAME_ATTEMPTS intentos, seguimos con nombre genérico
  const MAX_NAME_ATTEMPTS = 5; // TODO: Importar de constants.js
  if ((session.nameAttempts || 0) >= MAX_NAME_ATTEMPTS) {
    session.userName = isEn ? 'User' : 'Usuario';
    // 🔧 FIX CRÍTICO-2: Usar changeStage para validar transición
    changeStage(session, STATES.ASK_NEED);

    const reply = isEn
      ? "Let's continue without your name. Now, what do you need today? Technical help 🛠️ or assistance 🤝?"
      : (locale === 'es-419'
        ? "Sigamos sin tu nombre. Ahora, ¿qué necesitas hoy? ¿Ayuda técnica 🛠️ o asistencia 🤝?"
        : "Sigamos sin tu nombre. Ahora, ¿qué necesitás hoy? ¿Ayuda técnica 🛠️ o asistencia 🤝?");

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    // 🔧 REFACTOR FASE 2: Guardado diferido
    markSessionDirty(sid, session);
    
    return {
      ok: true,
      reply,
      stage: session.stage,
      handled: true
    };
  }

  // Si el texto claramente parece un problema o frase genérica, pedimos solo el nombre
  if (looksClearlyNotName(userText)) {
    session.nameAttempts = (session.nameAttempts || 0) + 1;

    const reply = isEn
      ? "I didn't detect a name. Could you tell me just your name? For example: \"Ana\" or \"John Paul\"."
      : (locale === 'es-419'
        ? "No detecté un nombre. ¿Podrías decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\"."
        : "No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\".");

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    // 🔧 REFACTOR FASE 2: Guardado diferido
    markSessionDirty(sid, session);
    
    return {
      ok: true,
      reply,
      stage: session.stage,
      handled: true
    };
  }

  // ✅ NO ES UN NOMBRE VÁLIDO - Fallback final por seguridad
  console.log('[ASK_NAME] ⚠️ Fallback final alcanzado');
  session.nameAttempts = (session.nameAttempts || 0) + 1;
  
  // Registrar fallo en calibración
  logCalibracionFailure('ASK_NAME', userText, 'No se pudo extraer nombre válido');

  const fallbackReply = isEn
    ? "I didn't detect a valid name. Please tell me only your name, for example: \"Ana\" or \"John Paul\"."
    : (locale === 'es-419'
      ? "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: \"Ana\" o \"Juan Pablo\"."
      : "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: \"Ana\" o \"Juan Pablo\".");

  session.transcript.push({ who: 'bot', text: fallbackReply, ts: nowIso() });
  // 🔧 REFACTOR FASE 2: Guardado diferido
  markSessionDirty(sid, session);
  
  return {
    ok: true,
    reply: fallbackReply,
    stage: session.stage,
    handled: true
  };
}
