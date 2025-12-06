/**
 * 🚀 INTEGRATION PATCH - Integrador del sistema inteligente en server.js
 * 
 * Este módulo proporciona las funciones necesarias para integrar
 * el nuevo sistema inteligente en server.js sin romper el código existente.
 * 
 * USO:
 * 1. Importar este módulo en server.js
 * 2. Inicializar con initializeIntelligentSystem()
 * 3. Llamar a handleWithIntelligence() en el endpoint /api/chat
 * 4. Usar feature flag USE_INTELLIGENT_MODE=true para activar
 * 
 * @author STI AI Team
 * @date 2025-12-06
 */

import { handleIntelligentChat, shouldUseIntelligentMode } from './intelligentChatHandler.js';
import { initializeOpenAI } from '../services/aiService.js';

let intelligentModeEnabled = false;

/**
 * 🎬 Inicializa el sistema inteligente
 * 
 * @param {string} openaiApiKey - API key de OpenAI
 * @param {boolean} enableByDefault - Si debe estar activado por defecto
 */
export function initializeIntelligentSystem(openaiApiKey, enableByDefault = false) {
  console.log('[IntelligentSystem] 🚀 Inicializando sistema inteligente...');
  
  // Inicializar OpenAI
  const client = initializeOpenAI(openaiApiKey);
  
  if (!client) {
    console.warn('[IntelligentSystem] ⚠️ OpenAI no disponible - sistema inteligente limitado');
  }
  
  // Activar modo inteligente según configuración
  intelligentModeEnabled = enableByDefault;
  
  console.log('[IntelligentSystem] ✅ Sistema inteligente inicializado');
  console.log('[IntelligentSystem] 📊 Estado:', intelligentModeEnabled ? 'ACTIVADO' : 'DESACTIVADO (usar legacy)');
  
  return {
    enabled: intelligentModeEnabled,
    hasOpenAI: !!client
  };
}

/**
 * 🎯 Maneja un mensaje con el sistema inteligente
 * 
 * Esta función debe ser llamada DENTRO del endpoint /api/chat de server.js
 * ANTES de procesar con la lógica legacy basada en stages.
 * 
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Object} session - Sesión del usuario
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} buttonToken - Token de botón si fue clickeado
 * @returns {Promise<Object|null>} - Response object si se procesó, null si debe usar legacy
 */
export async function handleWithIntelligence(req, res, session, userMessage, buttonToken) {
  // Verificar si el modo inteligente está activado
  if (!intelligentModeEnabled) {
    console.log('[IntelligentSystem] ⏭️ Modo inteligente desactivado - usando legacy');
    return null; // Usar lógica legacy
  }

  // ✅ FORZAR MODO INTELIGENTE si estamos en ASK_NEED (después de nombre)
  // Esto asegura que TODO mensaje después del nombre sea procesado inteligentemente
  if (session.stage === 'ASK_NEED') {
    console.log('[IntelligentSystem] 🎯 Stage ASK_NEED detectado - FORZANDO modo inteligente');
    console.log('[IntelligentSystem] 🧠 Procesando con sistema inteligente (sin verificar shouldUse)...');
    // NO verificar shouldUse - siempre usar inteligente después del nombre
  } else {
    // Para otros stages, verificar si debe usar modo inteligente
    const shouldUse = shouldUseIntelligentMode(userMessage, buttonToken, session);
    
    if (!shouldUse) {
      console.log('[IntelligentSystem] ⏭️ Mensaje simple - usando legacy');
      return null; // Usar lógica legacy
    }

    console.log('[IntelligentSystem] 🧠 Procesando con sistema inteligente...');
  }

  try {
    const locale = session.userLocale || 'es-AR';
    
    // Procesar con sistema inteligente
    const intelligentResponse = await handleIntelligentChat(
      userMessage,
      buttonToken,
      session,
      locale
    );

    console.log('[IntelligentSystem] ✅ Respuesta inteligente generada:', {
      intent: intelligentResponse.intentDetected,
      stage: intelligentResponse.stage,
      hasOptions: intelligentResponse.options.length > 0
    });

    // Actualizar sesión con la nueva información
    session.stage = intelligentResponse.stage;
    session.lastIntentDetected = intelligentResponse.intentDetected;
    
    if (intelligentResponse.deviceType) {
      session.device = intelligentResponse.deviceType;
    }

    // Guardar en transcript
    const ts = new Date().toISOString();
    session.transcript = session.transcript || [];
    session.transcript.push({
      who: 'bot',
      text: intelligentResponse.reply,
      ts,
      intent: intelligentResponse.intentDetected,
      confidence: session.lastIntentConfidence,
      intelligentMode: true
    });

    // Preparar response para enviar al frontend
    const responsePayload = {
      ok: true,
      reply: intelligentResponse.reply,
      stage: intelligentResponse.stage,
      options: intelligentResponse.options,
      buttons: intelligentResponse.options, // Compatibilidad
      intelligentMode: true,
      intentDetected: intelligentResponse.intentDetected,
      reasoning: intelligentResponse.reasoning
    };

    // Si hubo acción rechazada, agregar flag
    if (intelligentResponse.actionRejected) {
      responsePayload.actionRejected = true;
    }

    // Agregar UI wrapper si hay opciones
    if (intelligentResponse.options.length > 0) {
      responsePayload.ui = {
        buttons: intelligentResponse.options
      };
    }

    return responsePayload;

  } catch (error) {
    console.error('[IntelligentSystem] ❌ Error en sistema inteligente:', error);
    console.error('[IntelligentSystem] 📚 Stack:', error.stack);
    
    // En caso de error, retornar null para que use legacy
    console.log('[IntelligentSystem] ⚠️ Fallback a sistema legacy por error');
    return null;
  }
}

/**
 * 🔧 Activa o desactiva el modo inteligente dinámicamente
 */
export function setIntelligentMode(enabled) {
  intelligentModeEnabled = enabled;
  console.log('[IntelligentSystem] 🔄 Modo inteligente:', enabled ? 'ACTIVADO' : 'DESACTIVADO');
}

/**
 * 📊 Obtiene el estado actual del sistema inteligente
 */
export function getIntelligentSystemStatus() {
  return {
    enabled: intelligentModeEnabled,
    timestamp: new Date().toISOString()
  };
}

export default {
  initializeIntelligentSystem,
  handleWithIntelligence,
  setIntelligentMode,
  getIntelligentSystemStatus
};
