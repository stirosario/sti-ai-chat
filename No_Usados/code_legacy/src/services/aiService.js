/**
 * 🤖 AI SERVICE - Servicio centralizado para OpenAI
 * 
 * Este módulo proporciona acceso centralizado al cliente de OpenAI
 * y funciones helper para interactuar con la API.
 * 
 * @author STI AI Team
 * @date 2025-12-06
 */

import OpenAI from 'openai';

let openaiClient = null;

/**
 * Inicializa el cliente de OpenAI
 */
export function initializeOpenAI(apiKey) {
  if (!apiKey) {
    console.warn('[AIService] ⚠️ No API key provided - OpenAI features disabled');
    return null;
  }

  try {
    openaiClient = new OpenAI({ apiKey });
    console.log('[AIService] ✅ OpenAI client initialized');
    return openaiClient;
  } catch (error) {
    console.error('[AIService] ❌ Failed to initialize OpenAI:', error.message);
    return null;
  }
}

/**
 * Obtiene el cliente de OpenAI (singleton)
 */
export function getOpenAIClient() {
  return openaiClient;
}

/**
 * Verifica si OpenAI está disponible
 */
export function isOpenAIAvailable() {
  return openaiClient !== null;
}

export default {
  initializeOpenAI,
  getOpenAIClient,
  isOpenAIAvailable
};
