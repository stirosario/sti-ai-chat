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

// buildUiButtonsFromTokens se pasa como dependencia desde server.js

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
/**
 * Preprocesa el texto para extracción de nombre
 * - Convierte a minúsculas
 * - Elimina espacios múltiples
 * - Elimina emojis y símbolos no alfabéticos
 * - Conserva letras, espacios, acentos y signos simples
 */
function preprocessNameText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Convertir a minúsculas y trim
  let processed = text.toLowerCase().trim();
  
  // Reemplazar múltiples espacios por uno solo
  processed = processed.replace(/\s+/g, ' ');
  
  // Eliminar emojis y símbolos no alfabéticos
  // Conservar: letras, espacios, acentos, y signos simples (.,!?;:)
  processed = processed.replace(/[^\w\s\u00C0-\u017F.,!?;:]/g, '');
  
  // Limpiar signos de puntuación al inicio y final (pero conservarlos internos)
  processed = processed.replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');
  
  // Volver a trim
  processed = processed.trim();
  
  return processed;
}

/**
 * Elimina saludos y frases de relleno del inicio del texto
 */
function removeGreetingsAndFiller(text) {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.toLowerCase().trim();
  
  // Lista de saludos y expresiones a eliminar cuando aparecen al inicio
  const greetingsAndFillers = [
    // Saludos simples
    /^hola+\s*,?\s*/i,
    /^holis+\s*,?\s*/i,
    /^oli+\s*,?\s*/i,
    /^buenas+\s*,?\s*/i,
    /^buenas\s+tardes\s*,?\s*/i,
    /^buenas\s+noches\s*,?\s*/i,
    /^buen\s+d[ií]a\s*,?\s*/i,
    /^buenos\s+d[ií]as\s*,?\s*/i,
    /^qu[ée]\s+tal\s*,?\s*/i,
    /^como\s+va\s*,?\s*/i,
    /^c[óo]mo\s+va\s*,?\s*/i,
    /^todo\s+bien\s*,?\s*/i,
    /^buenas\s+gente\s*,?\s*/i,
    /^saludos?\s*,?\s*/i,
    /^saludo\s*,?\s*/i,
    /^hi\s*,?\s*/i,
    /^hello\s*,?\s*/i,
    /^hey\s*,?\s*/i,
    /^buen\s+d[ií]a\s+te\s+digo\s*,?\s*/i,
    /^buenas\s+tardes\s+te\s+digo\s*,?\s*/i,
    
    // Expresiones de presentación
    /^soy\s+/i,
    /^yo\s+soy\s+/i,
    /^mi\s+nombre\s+es\s+/i,
    /^mi\s+nombre\s+es\s+el\s+/i,
    /^me\s+llamo\s+/i,
    /^me\s+llaman\s+/i,
    /^me\s+dicen\s+/i,
    /^me\s+dicen\s+que\s+/i,
    /^me\s+llaman\s+que\s+/i,
    /^puedes\s+llamarme\s+/i,
    /^puede\s+llamarme\s+/i,
    /^llamame\s+/i,
    /^ll[áa]mame\s+/i,
    /^me\s+puedes\s+llamar\s+/i,
    /^me\s+puede\s+llamar\s+/i,
    /^puedo\s+presentarme\s+como\s+/i,
    /^me\s+presento\s+como\s+/i,
    /^me\s+presento\s+/i,
    /^te\s+presento\s+mi\s+nombre\s+es\s+/i,
    /^mi\s+nombre\s+completo\s+es\s+/i,
    /^el\s+que\s+te\s+escribi[óo]\s*,?\s*/i,
    /^el\s+que\s+te\s+escribi[óo]\s+por\s+whatsapp\s*,?\s*/i,
    /^el\s+que\s+te\s+habla\s+es\s+/i,
    /^el\s+que\s+te\s+habla\s+se\s+llama\s+/i,
    /^ac[áa]\s+/i,
    /^ac[áa]\s+estoy\s+/i,
    /^quien\s+te\s+habla\s+es\s+/i,
    /^quien\s+te\s+escribe\s+es\s+/i,
    /^quien\s+te\s+escribe\s+se\s+llama\s+/i,
    /^te\s+escribe\s+/i,
    /^te\s+hablo\s+/i,
    /^te\s+habla\s+/i,
    /^con\s+/i, // "con juan" -> "juan"
    /^es\s+/i, // "es juan" -> "juan"
    /^es\s+el\s+/i,
    /^es\s+la\s+/i,
    /^es\s+un\s+/i,
    /^es\s+una\s+/i,
    /^s[oó]lo\s+soy\s+/i,
    /^nada\s+m[áa]s\s+soy\s+/i,
    /^simplemente\s+soy\s+/i,
    /^tan\s+solo\s+soy\s+/i,
    /^el\s+nombre\s+es\s+/i,
    /^mi\s+nombre\s+es\s+el\s+/i,
    /^el\s+nombre\s+que\s+uso\s+es\s+/i,
    /^el\s+nombre\s+con\s+el\s+que\s+me\s+conocen\s+es\s+/i,
    /^mi\s+apodo\s+es\s+/i,
    /^mi\s+apodo\s+es\s+el\s+/i,
    /^me\s+conocen\s+como\s+/i,
    /^me\s+conocen\s+por\s+/i,
    /^puedes\s+decirme\s+/i,
    /^puede\s+decirme\s+/i,
    /^y[oó]\s+soy\s+/i,
    /^y[oó]\s+me\s+llamo\s+/i,
    /^y[oó]\s+me\s+dicen\s+/i,
    /^y[oó]\s+me\s+llaman\s+/i,
    /^y[oó]\s+mi\s+nombre\s+es\s+/i,
    /^aqu[ií]\s+soy\s+/i,
    /^aqu[ií]\s+me\s+llamo\s+/i,
    /^aqu[ií]\s+me\s+dicen\s+/i,
    /^aqu[ií]\s+estoy\s+/i,
    
    // Combinaciones comunes con saludos
    /^hola\s*,?\s*soy\s+/i,
    /^hola\s*,?\s*yo\s+soy\s+/i,
    /^hola\s*,?\s*mi\s+nombre\s+es\s+/i,
    /^hola\s*,?\s*me\s+llamo\s+/i,
    /^hola\s*,?\s*me\s+dicen\s+/i,
    /^hola\s*,?\s*me\s+llaman\s+/i,
    /^hola\s*,?\s*me\s+llaman\s+que\s+/i,
    /^hola\s*,?\s*puedes\s+llamarme\s+/i,
    /^hola\s*,?\s*llamame\s+/i,
    /^hola\s*,?\s*ac[áa]\s+/i,
    /^hola\s*,?\s*con\s+/i,
    /^hola\s*,?\s*es\s+/i,
    /^hola\s*,?\s*quien\s+te\s+habla\s+es\s+/i,
    /^hola\s*,?\s*el\s+que\s+te\s+habla\s+es\s+/i,
    
    /^buenas\s*,?\s*soy\s+/i,
    /^buenas\s*,?\s*yo\s+soy\s+/i,
    /^buenas\s*,?\s*mi\s+nombre\s+es\s+/i,
    /^buenas\s*,?\s*me\s+llamo\s+/i,
    /^buenas\s*,?\s*me\s+dicen\s+/i,
    /^buenas\s*,?\s*me\s+llaman\s+/i,
    /^buenas\s*,?\s*ac[áa]\s+/i,
    /^buenas\s*,?\s*con\s+/i,
    /^buenas\s*,?\s*quien\s+te\s+habla\s+es\s+/i,
    
    /^buen\s+d[ií]a\s*,?\s*soy\s+/i,
    /^buen\s+d[ií]a\s*,?\s*me\s+llamo\s+/i,
    /^buen\s+d[ií]a\s*,?\s*me\s+dicen\s+/i,
    /^buenos\s+d[ií]as\s*,?\s*soy\s+/i,
    /^buenos\s+d[ií]as\s*,?\s*me\s+llamo\s+/i,
    
    /^qu[ée]\s+tal\s*,?\s*soy\s+/i,
    /^qu[ée]\s+tal\s*,?\s*yo\s+soy\s+/i,
    /^qu[ée]\s+tal\s*,?\s*me\s+llamo\s+/i,
    /^qu[ée]\s+tal\s*,?\s*me\s+dicen\s+/i,
    /^qu[ée]\s+tal\s*,?\s*ac[áa]\s+/i,
    /^qu[ée]\s+tal\s*,?\s*con\s+/i,
    /^qu[ée]\s+tal\s*,?\s*mi\s+nombre\s+es\s+/i,
    
    /^como\s+va\s*,?\s*soy\s+/i,
    /^como\s+va\s*,?\s*me\s+llamo\s+/i,
    /^c[óo]mo\s+va\s*,?\s*soy\s+/i,
    /^c[óo]mo\s+va\s*,?\s*me\s+llamo\s+/i,
    
    /^todo\s+bien\s*,?\s*soy\s+/i,
    /^todo\s+bien\s*,?\s*me\s+llamo\s+/i,
  ];
  
  // Aplicar cada patrón de eliminación
  for (const pattern of greetingsAndFillers) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Limpiar comas y espacios sobrantes al inicio
  cleaned = cleaned.replace(/^[,\s]+/, '').trim();
  
  return cleaned;
}

/**
 * Extrae y valida un nombre del texto del usuario
 * @param {string} text - Texto del usuario
 * @returns {Object} - { name: string, valid: boolean, reason: string }
 */
export function extractName(text) {
  // Inicializar resultado
  const result = {
    name: '',
    valid: false,
    reason: ''
  };
  
  if (!text || typeof text !== 'string') {
    result.reason = 'vacío';
    return result;
  }
  
  // 1. PREPROCESAMIENTO
  let processed = preprocessNameText(text);
  
  if (!processed) {
    result.reason = 'vacío';
    return result;
  }
  
  // 2. ELIMINACIÓN DE SALUDOS Y RELLENO
  processed = removeGreetingsAndFiller(processed);
  
  if (!processed) {
    result.reason = 'solo saludos';
    return result;
  }
  
  // 3. LIMPIAR SIGNOS DE PUNTUACIÓN AL FINAL
  processed = processed.replace(/[.,!?;:]+$/, '').trim();
  
  if (!processed) {
    result.reason = 'solo signos';
    return result;
  }
  
  // 4. EXTRAER CANDIDATO A NOMBRE
  // Buscar patrones: "me llamo X", "soy X", "mi nombre es X", "me dicen X", "me llaman X", "puedes llamarme X", o simplemente "X"
  const patterns = [
    // Patrones con expresiones de presentación
    /\b(?:me\s+llamo|soy|yo\s+soy|mi\s+nombre\s+es|mi\s+nombre\s+es\s+el|me\s+presento\s+como|me\s+dicen|me\s+llaman|me\s+llaman\s+que|me\s+dicen\s+que|puedes\s+llamarme|puede\s+llamarme|llamame|ll[áa]mame|me\s+puedes\s+llamar|me\s+puede\s+llamar|puedo\s+presentarme\s+como|me\s+presento|te\s+presento\s+mi\s+nombre\s+es|mi\s+nombre\s+completo\s+es|el\s+que\s+te\s+habla\s+es|el\s+que\s+te\s+habla\s+se\s+llama|quien\s+te\s+habla\s+es|quien\s+te\s+escribe\s+es|quien\s+te\s+escribe\s+se\s+llama|te\s+habla|te\s+hablo|te\s+escribe|el\s+nombre\s+es|el\s+nombre\s+que\s+uso\s+es|el\s+nombre\s+con\s+el\s+que\s+me\s+conocen\s+es|mi\s+apodo\s+es|mi\s+apodo\s+es\s+el|me\s+conocen\s+como|me\s+conocen\s+por|puedes\s+decirme|puede\s+decirme|y[oó]\s+soy|y[oó]\s+me\s+llamo|y[oó]\s+me\s+dicen|y[oó]\s+me\s+llaman|y[oó]\s+mi\s+nombre\s+es|aqu[ií]\s+soy|aqu[ií]\s+me\s+llamo|aqu[ií]\s+me\s+dicen)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
    // Patrón simple: solo el nombre
    /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
    // Patrón con "es" o "con" al inicio
    /^(?:es|con|el|la|un|una)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i,
    // Patrón con "solo soy" o "simplemente soy"
    /\b(?:s[oó]lo\s+soy|nada\s+m[áa]s\s+soy|simplemente\s+soy|tan\s+solo\s+soy)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ''\-\s]{2,60})$/i
  ];
  
  let candidate = null;
  
  for (const rx of patterns) {
    const m = processed.match(rx);
    if (m && m[1]) {
      candidate = m[1].trim().replace(/\s+/g, ' ');
      break;
    }
  }
  
  // Si no se encontró con patrones, usar todo el texto procesado
  if (!candidate) {
    candidate = processed;
  }
  
  // 5. VALIDAR Y NORMALIZAR
  // Limitar tokens
  const tokens = candidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
  const normalized = tokens.map(t => capitalizeToken(t)).join(' ');
  
  if (isValidName(normalized)) {
    result.name = normalized;
    result.valid = true;
    result.reason = 'ok';
    return result;
  }
  
  // 6. SI NO ES VÁLIDO, INTENTAR CON EL TEXTO COMPLETO (fallback)
  const singleCandidate = processed;
  if (isValidName(singleCandidate)) {
    const tokens = singleCandidate.split(/\s+/).slice(0, MAX_NAME_TOKENS);
    result.name = tokens.map(capitalizeToken).join(' ');
    result.valid = true;
    result.reason = 'ok';
    return result;
  }
  
  // 7. NO SE PUDO EXTRAER NOMBRE VÁLIDO
  result.reason = 'no parece un nombre';
  return result;
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
        // Fallback a respuesta por defecto con botones de problemas frecuentes
        reply = isEn
          ? `Perfect, ${capToken(session.userName)} 😊 What can I help you with today? Or if you prefer, you can select 🔘 one of the following common problems 🚩:`
          : (locale === 'es-419'
            ? `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy? O si prefieres puedes seleccionar 🔘 uno de los siguientes problemas 🚩:`
            : `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy? O si preferís podés seleccionar 🔘 uno de los siguientes problemas 🚩:`);
      }
      
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      markSessionDirty(sid, session);
      
      // Registrar éxito
      logCalibracionSuccess('ASK_NAME');
      
      // Agregar botones de problemas frecuentes
      const { buildUiButtonsFromTokens } = dependencies;
      const problemButtons = buildUiButtonsFromTokens ? buildUiButtonsFromTokens([
        'BTN_NO_ENCIENDE',
        'BTN_NO_INTERNET',
        'BTN_LENTITUD',
        'BTN_BLOQUEO',
        'BTN_PERIFERICOS',
        'BTN_VIRUS'
      ], locale) : [];
      
      return {
        ok: true,
        reply,
        stage: session.stage,
        options: problemButtons,
        handled: true
      };
    }
  }

  // ✅ DETECCIÓN AUTOMÁTICA: Si el usuario escribe una palabra que es claramente un nombre
  const nameResult = extractName(userText);
  
  if (nameResult.valid && nameResult.name) {
    // ✅ NOMBRE DETECTADO - Guardar y avanzar inmediatamente
    session.userName = nameResult.name;
    session.stage = STATES.ASK_NEED;
    session.nameAttempts = 0;

    // ✅ RESPUESTA OBLIGATORIA: Bienvenida personalizada con botones de problemas frecuentes
    const reply = isEn
      ? `Perfect, ${capToken(session.userName)} 😊 What can I help you with today? Or if you prefer, you can select 🔘 one of the following common problems 🚩:`
      : (locale === 'es-419'
        ? `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy? O si prefieres puedes seleccionar 🔘 uno de los siguientes problemas 🚩:`
        : `Perfecto, ${capToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy? O si preferís podés seleccionar 🔘 uno de los siguientes problemas 🚩:`);

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    // 🔧 REFACTOR FASE 2: Guardado diferido (se guardará antes de enviar respuesta)
    markSessionDirty(sid, session);
    
    // Registrar éxito si no vino de calibración
    if (!calibMatch || !calibMatch.matched) {
      logCalibracionSuccess('ASK_NAME');
    }
    
    console.log('[ASK_NAME] ✅ Nombre extraído:', nameResult.name, 'Motivo:', nameResult.reason);
    
    // Agregar botones de problemas frecuentes
    const { buildUiButtonsFromTokens } = dependencies;
    const problemButtons = buildUiButtonsFromTokens ? buildUiButtonsFromTokens([
      'BTN_NO_ENCIENDE',
      'BTN_NO_INTERNET',
      'BTN_LENTITUD',
      'BTN_BLOQUEO',
      'BTN_PERIFERICOS',
      'BTN_VIRUS'
    ], locale) : [];
    
    return {
      ok: true,
      reply,
      stage: session.stage,
      options: problemButtons,
      handled: true
    };
  } else if (nameResult.reason === 'vacío' || nameResult.reason === 'solo saludos' || nameResult.reason === 'solo signos') {
    // Respuesta vacía o solo saludos - pedir nombre de forma amable
    session.nameAttempts = (session.nameAttempts || 0) + 1;
    
    const reply = isEn
      ? "I didn't detect a name. Could you tell me just your name? For example: \"Ana\" or \"John Paul\"."
      : (locale === 'es-419'
        ? "No detecté un nombre. ¿Podrías decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\"."
        : "No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\".");

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    markSessionDirty(sid, session);
    
    console.log('[ASK_NAME] ⚠️ No se detectó nombre. Motivo:', nameResult.reason);
    
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
  console.log('[ASK_NAME] 📝 Motivo de rechazo:', nameResult.reason || 'no parece un nombre');
  session.nameAttempts = (session.nameAttempts || 0) + 1;
  
  // Registrar fallo en calibración con motivo detallado
  const failureReason = nameResult.reason || 'No se pudo extraer nombre válido';
  logCalibracionFailure('ASK_NAME', userText, failureReason);

  // Mensaje más amable basado en el motivo
  let fallbackReply;
  if (nameResult.reason === 'no parece un nombre') {
    fallbackReply = isEn
      ? "I didn't detect a valid name. Please tell me only your name, for example: \"Ana\" or \"John Paul\"."
      : (locale === 'es-419'
        ? "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: \"Ana\" o \"Juan Pablo\"."
        : "No detecté un nombre válido. Decime solo tu nombre, por ejemplo: \"Ana\" o \"Juan Pablo\".");
  } else {
    fallbackReply = isEn
      ? "I didn't detect a name. Could you tell me just your name? For example: \"Ana\" or \"John Paul\"."
      : (locale === 'es-419'
        ? "No detecté un nombre. ¿Podrías decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\"."
        : "No detecté un nombre. ¿Podés decirme solo tu nombre? Por ejemplo: \"Ana\" o \"Juan Pablo\".");
  }

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
