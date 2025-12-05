/**
 * nlpService.js
 * 
 * Servicio de Procesamiento de Lenguaje Natural.
 * Combina regex local, detección de patrones y OpenAI para análisis robusto.
 * 
 * RESPONSABILIDADES:
 * - Detección de intenciones (problema, consulta, saludo, etc.)
 * - Clasificación de problemas técnicos
 * - Detección de dispositivos ambiguos
 * - Normalización de texto
 * - Extracción de entidades (nombres, dispositivos, etc.)
 * 
 * COMPATIBILIDAD: Usa las funciones existentes como fallback
 */

import { normalizarTextoCompleto } from '../../normalizarTexto.js';
import { detectAmbiguousDevice, DEVICE_DISAMBIGUATION } from '../../deviceDetection.js';
import { classifyIntent as aiClassifyIntent } from './openaiService.js';

// ========== PATRONES DE INTENCIÓN LOCAL ==========
const INTENT_PATTERNS = {
  saludo: /^(hola|buenos días|buenas tardes|buenas noches|hey|hi|hello)/i,
  despedida: /^(adiós|chau|hasta luego|bye|gracias y adiós|nos vemos)/i,
  afirmacion: /^(sí|si|s[íi]|dale|ok|okay|correcto|exacto|eso|confirmo)/i,
  negacion: /^(no|nop|nope|negativo|para nada|de ninguna manera)/i,
  ayuda: /(ayuda|help|socorro|necesito ayuda|no entiendo|perdido)/i,
  problema: /(problema|error|falla|no funciona|no anda|roto|dañado)/i,
  urgente: /(urgente|ya|ahora|rápido|apurado)/i
};

// ========== CATEGORÍAS DE PROBLEMAS ==========
const PROBLEM_CATEGORIES = {
  hardware: {
    keywords: ['no enciende', 'no prende', 'pantalla negra', 'no arranca', 'led', 'botón'],
    priority: 'high'
  },
  red: {
    keywords: ['internet', 'wifi', 'conexión', 'red', 'no navega', 'sin internet'],
    priority: 'medium'
  },
  rendimiento: {
    keywords: ['lento', 'tarda', 'se traba', 'cuelga', 'freeze', 'lag'],
    priority: 'medium'
  },
  software: {
    keywords: ['programa', 'aplicación', 'app', 'no abre', 'error al iniciar'],
    priority: 'low'
  },
  perifericos: {
    keywords: ['mouse', 'teclado', 'impresora', 'auricular', 'micrófono', 'webcam'],
    priority: 'low'
  },
  seguridad: {
    keywords: ['virus', 'malware', 'spam', 'hackeo', 'contraseña', 'seguridad'],
    priority: 'high'
  }
};

// ========== DETECCIÓN DE INTENCIÓN (HÍBRIDA) ==========
export async function detectIntent(text, useAI = true) {
  const normalized = normalizarTextoCompleto(text);
  
  // 1. Intentar detección local primero (más rápido)
  const localIntent = detectIntentLocal(normalized);
  
  if (localIntent.confidence > 0.7) {
    console.log(`[NLP] 🎯 Local intent: ${localIntent.intent} (confidence: ${localIntent.confidence})`);
    return localIntent;
  }
  
  // 2. Si no hay match claro, usar AI
  if (useAI) {
    try {
      const aiIntent = await aiClassifyIntent(text);
      console.log(`[NLP] 🤖 AI intent: ${aiIntent.intent} (confidence: ${aiIntent.confidence})`);
      return aiIntent;
    } catch (error) {
      console.warn('[NLP] AI classification failed, using local fallback');
    }
  }
  
  // 3. Fallback a local con confianza baja
  return localIntent;
}

// ========== DETECCIÓN LOCAL DE INTENCIÓN ==========
function detectIntentLocal(normalizedText) {
  // Verificar cada patrón
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(normalizedText)) {
      return {
        intent,
        confidence: 0.9,
        method: 'regex'
      };
    }
  }
  
  // Si no hay match claro, inferir por longitud y contenido
  if (normalizedText.length < 10) {
    return { intent: 'unclear', confidence: 0.3, method: 'heuristic' };
  }
  
  if (normalizedText.split(' ').length > 15) {
    return { intent: 'problema', confidence: 0.6, method: 'heuristic' };
  }
  
  return { intent: 'unknown', confidence: 0.1, method: 'fallback' };
}

// ========== CLASIFICACIÓN DE PROBLEMA ==========
export function classifyProblem(text) {
  const normalized = normalizarTextoCompleto(text);
  const matches = [];
  
  for (const [category, config] of Object.entries(PROBLEM_CATEGORIES)) {
    const keywordMatches = config.keywords.filter(kw => 
      normalized.includes(kw.toLowerCase())
    );
    
    if (keywordMatches.length > 0) {
      matches.push({
        category,
        keywords: keywordMatches,
        priority: config.priority,
        confidence: keywordMatches.length / config.keywords.length
      });
    }
  }
  
  // Ordenar por confianza
  matches.sort((a, b) => b.confidence - a.confidence);
  
  return {
    primary: matches[0] || { category: 'general', confidence: 0 },
    all: matches
  };
}

// ========== DETECCIÓN DE DISPOSITIVO AMBIGUO ==========
export function detectDevice(text) {
  const normalized = normalizarTextoCompleto(text);
  const detected = detectAmbiguousDevice(normalized);
  
  if (detected) {
    console.log(`[NLP] 🖥️ Device detected: ${detected.ambiguous} → options: ${detected.options.length}`);
    return {
      isAmbiguous: true,
      term: detected.ambiguous,
      options: detected.options,
      suggestions: DEVICE_DISAMBIGUATION[detected.ambiguous] || []
    };
  }
  
  return {
    isAmbiguous: false,
    term: null,
    options: [],
    suggestions: []
  };
}

// ========== EXTRACCIÓN DE NOMBRE ==========
export function extractName(text) {
  const normalized = text.trim();
  
  // Validaciones básicas
  if (normalized.length < 2 || normalized.length > 50) {
    return { valid: false, reason: 'Longitud inválida' };
  }
  
  // No debe contener números excesivos
  const numberCount = (normalized.match(/\d/g) || []).length;
  if (numberCount > 2) {
    return { valid: false, reason: 'Contiene demasiados números' };
  }
  
  // No debe ser una palabra común de sistema
  const systemWords = ['admin', 'user', 'test', 'null', 'undefined', 'root'];
  if (systemWords.includes(normalized.toLowerCase())) {
    return { valid: false, reason: 'Nombre no permitido' };
  }
  
  return {
    valid: true,
    name: normalized,
    confidence: 0.8
  };
}

// ========== ANÁLISIS DE SENTIMIENTO ==========
export function analyzeSentiment(text) {
  const normalized = normalizarTextoCompleto(text);
  
  const positiveWords = ['gracias', 'genial', 'perfecto', 'excelente', 'bien', 'bueno'];
  const negativeWords = ['mal', 'pésimo', 'horrible', 'terrible', 'basura', 'mierda'];
  const frustratedWords = ['no funciona', 'no puedo', 'no entiendo', 'harto', 'cansado'];
  
  let score = 0;
  
  positiveWords.forEach(word => {
    if (normalized.includes(word)) score += 1;
  });
  
  negativeWords.forEach(word => {
    if (normalized.includes(word)) score -= 2;
  });
  
  frustratedWords.forEach(word => {
    if (normalized.includes(word)) score -= 1;
  });
  
  if (score > 1) return { sentiment: 'positive', score };
  if (score < -1) return { sentiment: 'negative', score };
  return { sentiment: 'neutral', score };
}

// ========== DETECCIÓN DE URGENCIA ==========
export function detectUrgency(text) {
  const normalized = normalizarTextoCompleto(text);
  
  if (INTENT_PATTERNS.urgente.test(normalized)) {
    return { isUrgent: true, level: 'high' };
  }
  
  const mediumUrgency = /(importante|necesario|requiero|prioridad)/i;
  if (mediumUrgency.test(normalized)) {
    return { isUrgent: true, level: 'medium' };
  }
  
  return { isUrgent: false, level: 'normal' };
}

// ========== ANÁLISIS COMPLETO DE TEXTO ==========
export async function analyzeText(text, options = {}) {
  const {
    detectIntentFlag = true,
    classifyProblemFlag = true,
    detectDeviceFlag = true,
    analyzeSentimentFlag = false,
    useAI = false
  } = options;
  
  const analysis = {
    original: text,
    normalized: normalizarTextoCompleto(text)
  };
  
  if (detectIntentFlag) {
    analysis.intent = await detectIntent(text, useAI);
  }
  
  if (classifyProblemFlag) {
    analysis.problemCategory = classifyProblem(text);
  }
  
  if (detectDeviceFlag) {
    analysis.device = detectDevice(text);
  }
  
  if (analyzeSentimentFlag) {
    analysis.sentiment = analyzeSentiment(text);
    analysis.urgency = detectUrgency(text);
  }
  
  console.log('[NLP] 📊 Analysis complete:', {
    intent: analysis.intent?.intent,
    category: analysis.problemCategory?.primary?.category,
    device: analysis.device?.isAmbiguous ? analysis.device.term : 'none'
  });
  
  return analysis;
}

// ========== EXPORTAR TODO ==========
export default {
  detectIntent,
  classifyProblem,
  detectDevice,
  extractName,
  analyzeSentiment,
  detectUrgency,
  analyzeText
};
