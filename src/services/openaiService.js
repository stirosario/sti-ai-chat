/**
 * openaiService.js
 * 
 * Servicio centralizado para todas las interacciones con OpenAI API.
 * Maneja llamadas a GPT-4, GPT-4 Vision, y toda la lógica de AI.
 * 
 * RESPONSABILIDADES:
 * - Inicialización y configuración de cliente OpenAI
 * - Llamadas a chat.completions con manejo de errores
 * - Procesamiento de imágenes con GPT-4 Vision
 * - Rate limiting y retry logic
 * - Logging de uso y costos
 * 
 * COMPATIBILIDAD: 100% retrocompatible con el código existente
 */

import OpenAI from 'openai';

// ========== CONFIGURACIÓN ==========
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const VISION_MODEL = 'gpt-4o';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

// ========== INICIALIZACIÓN ==========
let openaiClient = null;

if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log('[OpenAI Service] ✅ Inicializado con modelo:', OPENAI_MODEL);
} else {
  console.log('[OpenAI Service] ⚠️ No hay API key - funciones de IA deshabilitadas');
}

// ========== VERIFICACIÓN DE DISPONIBILIDAD ==========
export function isOpenAIAvailable() {
  return openaiClient !== null;
}

// ========== FUNCIÓN GENÉRICA DE LLAMADA CON RETRY ==========
async function callOpenAI(params, retryCount = 0) {
  if (!openaiClient) {
    throw new Error('[OpenAI Service] Cliente no inicializado - verifica OPENAI_API_KEY');
  }

  try {
    const startTime = Date.now();
    const response = await openaiClient.chat.completions.create(params);
    const duration = Date.now() - startTime;

    // Log de uso
    console.log('[OpenAI Service] ✅ Completado en', duration, 'ms', {
      model: params.model,
      tokens: response.usage?.total_tokens || 0,
      cost: estimateCost(params.model, response.usage)
    });

    return response;
  } catch (error) {
    console.error('[OpenAI Service] ❌ Error:', error.message);

    // Retry logic para errores temporales
    if (retryCount < MAX_RETRIES && isRetryableError(error)) {
      const delay = RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`[OpenAI Service] 🔄 Reintentando en ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callOpenAI(params, retryCount + 1);
    }

    throw error;
  }
}

// ========== DETECCIÓN DE ERRORES RETRIABLES ==========
function isRetryableError(error) {
  const retryableCodes = ['rate_limit_exceeded', 'server_error', 'timeout'];
  return retryableCodes.some(code => error.message?.includes(code));
}

// ========== ESTIMACIÓN DE COSTO ==========
function estimateCost(model, usage) {
  if (!usage) return 0;
  
  const costs = {
    'gpt-4o': { input: 0.005, output: 0.015 }, // per 1K tokens
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4': { input: 0.03, output: 0.06 }
  };

  const modelCost = costs[model] || costs['gpt-4o-mini'];
  const inputCost = (usage.prompt_tokens / 1000) * modelCost.input;
  const outputCost = (usage.completion_tokens / 1000) * modelCost.output;
  
  return (inputCost + outputCost).toFixed(6);
}

// ========== PROCESAMIENTO DE IMÁGENES CON VISION ==========
export async function processImagesWithVision(userText, imageUrls, systemPrompt = '') {
  if (!isOpenAIAvailable()) {
    throw new Error('[OpenAI Service] No disponible para Vision');
  }

  if (!imageUrls || imageUrls.length === 0) {
    throw new Error('[OpenAI Service] No hay imágenes para procesar');
  }

  console.log('[OpenAI Service] 🖼️ Procesando', imageUrls.length, 'imagen(es) con Vision');

  const content = [
    { type: 'text', text: userText || 'Analiza esta imagen' }
  ];

  imageUrls.forEach(url => {
    content.push({
      type: 'image_url',
      image_url: { url, detail: 'high' }
    });
  });

  const params = {
    model: VISION_MODEL,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content }
    ],
    max_tokens: 1500,
    temperature: 0.7
  };

  const response = await callOpenAI(params);
  return response.choices[0]?.message?.content || '';
}

// ========== CHAT COMPLETION ESTÁNDAR ==========
export async function createChatCompletion(messages, options = {}) {
  if (!isOpenAIAvailable()) {
    throw new Error('[OpenAI Service] No disponible');
  }

  const {
    model = OPENAI_MODEL,
    temperature = 0.7,
    maxTokens = 800,
    useVision = false,
    imageUrls = []
  } = options;

  // Si hay imágenes, usar Vision
  if (useVision && imageUrls.length > 0) {
    const lastMessage = messages[messages.length - 1];
    const systemMessages = messages.filter(m => m.role === 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n');
    
    return await processImagesWithVision(
      lastMessage.content,
      imageUrls,
      systemPrompt
    );
  }

  // Chat completion estándar
  const params = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  const response = await callOpenAI(params);
  return response.choices[0]?.message?.content || '';
}

// ========== VALIDACIÓN DE NOMBRE CON IA ==========
export async function validateNameWithAI(name) {
  if (!isOpenAIAvailable()) {
    return { isValid: true, reason: 'OpenAI no disponible' };
  }

  try {
    const response = await createChatCompletion([
      {
        role: 'system',
        content: 'Eres un validador de nombres. Responde solo "VÁLIDO" o "INVÁLIDO: razón breve".'
      },
      {
        role: 'user',
        content: `¿Este es un nombre real de persona? "${name}"`
      }
    ], { temperature: 0.3, maxTokens: 50 });

    const isValid = response.toUpperCase().includes('VÁLIDO');
    const reason = isValid ? '' : response.replace(/INVÁLIDO:?\s*/i, '');

    return { isValid, reason };
  } catch (error) {
    console.error('[OpenAI Service] Error validando nombre:', error);
    return { isValid: true, reason: 'Error en validación' };
  }
}

// ========== CLASIFICACIÓN DE INTENCIÓN ==========
export async function classifyIntent(userText, context = {}) {
  if (!isOpenAIAvailable()) {
    return { intent: 'unknown', confidence: 0 };
  }

  try {
    const response = await createChatCompletion([
      {
        role: 'system',
        content: `Clasifica la intención del usuario en una de estas categorías:
- problema_tecnico
- consulta_general
- saludo
- despedida
- confusion
- queja
Responde solo con la categoría.`
      },
      {
        role: 'user',
        content: userText
      }
    ], { temperature: 0.2, maxTokens: 20 });

    const intent = response.trim().toLowerCase();
    return { intent, confidence: 0.8 };
  } catch (error) {
    console.error('[OpenAI Service] Error clasificando intención:', error);
    return { intent: 'unknown', confidence: 0 };
  }
}

// ========== GENERACIÓN DE RESPUESTA EMPÁTICA ==========
export async function generateEmpatheticResponse(userMessage, context = {}) {
  if (!isOpenAIAvailable()) {
    throw new Error('[OpenAI Service] No disponible');
  }

  const { stage, problem, userName } = context;

  const systemPrompt = `Eres Tecnos, un asistente técnico empático de STI.
Stage actual: ${stage || 'inicial'}
Usuario: ${userName || 'Usuari@'}
${problem ? `Problema: ${problem}` : ''}

Genera una respuesta corta, empática y accionable.`;

  return await createChatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], { temperature: 0.8, maxTokens: 200 });
}

// ========== EXPORTAR CLIENTE (para compatibilidad) ==========
export function getOpenAIClient() {
  return openaiClient;
}

export default {
  isOpenAIAvailable,
  processImagesWithVision,
  createChatCompletion,
  validateNameWithAI,
  classifyIntent,
  generateEmpatheticResponse,
  getOpenAIClient
};
