/**
 * chatAdapter.js
 * 
 * Adaptador entre el server.js existente y la nueva arquitectura modular.
 * Mantiene 100% de compatibilidad con la API actual.
 * 
 * RESPONSABILIDADES:
 * - Traducir requests del server.js al formato del orquestador
 * - Convertir respuestas del orquestador al formato legacy
 * - Mantener firma de funciones existentes
 * - Logging y monitoreo de transición
 * 
 * USO:
 * En server.js, reemplazar la lógica de /api/chat con:
 * ```
 * import { handleChatMessage } from './src/adapters/chatAdapter.js';
 * app.post('/api/chat', async (req, res) => {
 *   const result = await handleChatMessage(req.body, req.sessionID);
 *   res.json(result);
 * });
 * ```
 */

import conversationOrchestrator from '../orchestrators/conversationOrchestrator.js';
import decisionEngine from '../orchestrators/decisionEngine.js';
import sessionService from '../services/sessionService.js';
import { logFlowInteraction } from '../flowLogger.js';

// ========== MODO DE OPERACIÓN ==========
let MODULAR_MODE = process.env.USE_MODULAR_ARCHITECTURE === 'true';

/**
 * Habilitar/deshabilitar arquitectura modular
 */
export function setModularMode(enabled) {
  MODULAR_MODE = enabled;
  console.log(`[ChatAdapter] Modular architecture: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Verificar si está en modo modular
 */
export function isModularMode() {
  return MODULAR_MODE;
}

/**
 * Handler principal para mensajes de chat
 * COMPATIBLE CON: POST /api/chat del server.js actual
 */
export async function handleChatMessage(requestBody, sessionId, metadata = {}) {
  const startTime = Date.now();
  
  try {
    // 1. Extraer datos del request
    const {
      text: userText,
      imageUrls = [],
      buttonToken = null,
      locale = 'es'
    } = requestBody;

    console.log(`[ChatAdapter] 📨 Processing message for session: ${sessionId}`);

    // 2. Preparar input para el orquestador
    const userInput = {
      text: userText,
      timestamp: new Date().toISOString()
    };

    const enrichedMetadata = {
      ...metadata,
      imageUrls,
      buttonToken,
      isButton: !!buttonToken,
      locale,
      requestId: generateRequestId()
    };

    // 3. Procesar con orquestador
    const orchestratorResponse = await conversationOrchestrator.processMessage(
      sessionId,
      userInput,
      enrichedMetadata
    );

    // 4. Obtener sesión actualizada
    const session = await sessionService.getSession(sessionId);

    // 5. Convertir respuesta al formato legacy
    const legacyResponse = convertToLegacyFormat(
      orchestratorResponse,
      session,
      sessionId
    );

    // 6. Logging (compatible con flowLogger existente)
    await logFlowInteraction(sessionId, {
      stage: session.stage,
      userInput: userText,
      botResponse: orchestratorResponse.text,
      decision: 'continue',
      metadata: enrichedMetadata
    });

    const duration = Date.now() - startTime;
    console.log(`[ChatAdapter] ✅ Response generated in ${duration}ms`);

    return legacyResponse;

  } catch (error) {
    console.error('[ChatAdapter] ❌ Error processing message:', error);
    
    // Respuesta de error en formato legacy
    return {
      reply: 'Disculpá, hubo un error temporal. Por favor, intentá nuevamente.',
      options: [],
      session: { stage: 'error' },
      error: error.message
    };
  }
}

/**
 * Convertir respuesta del orquestador al formato legacy del server.js
 * 
 * FORMATO LEGACY:
 * {
 *   reply: string,
 *   options: Array<{type, label, value}>,
 *   session: object,
 *   imageAnalysis?: object,
 *   ticket?: object
 * }
 */
function convertToLegacyFormat(orchestratorResponse, session, sessionId) {
  const { text, options } = orchestratorResponse;

  // Construir respuesta en formato legacy
  const legacyResponse = {
    reply: text,
    options: options || [],
    session: {
      sessionId: session.sessionId,
      stage: session.stage,
      userName: session.userName,
      device: session.device,
      problem: session.problem,
      currentStep: session.currentStepIndex,
      totalSteps: session.diagnosticSteps?.length || 0,
      hasImage: session.hasImage || false,
      ticketId: session.ticketId || null
    }
  };

  // Agregar datos adicionales si existen
  if (session.imageAnalysis) {
    legacyResponse.imageAnalysis = session.imageAnalysis;
  }

  if (session.ticketData) {
    legacyResponse.ticket = session.ticketData;
  }

  return legacyResponse;
}

/**
 * Handler para greeting
 * COMPATIBLE CON: ALL /api/greeting del server.js
 */
export async function handleGreeting(sessionId, initialData = {}) {
  try {
    console.log(`[ChatAdapter] 👋 Handling greeting for: ${sessionId}`);

    // Crear o resetear sesión
    const session = await sessionService.createSession(sessionId, {
      stage: 'greeting',
      ...initialData
    });

    // Generar saludo inicial
    const response = await conversationOrchestrator.processMessage(
      sessionId,
      { text: 'hola' },
      { isGreeting: true }
    );

    return convertToLegacyFormat(response, session, sessionId);

  } catch (error) {
    console.error('[ChatAdapter] Error in greeting:', error);
    throw error;
  }
}

/**
 * Handler para reset de sesión
 * COMPATIBLE CON: POST /api/reset
 */
export async function handleReset(sessionId) {
  try {
    console.log(`[ChatAdapter] 🔄 Resetting session: ${sessionId}`);

    // Crear nueva sesión (sobrescribe la anterior)
    const session = await sessionService.createSession(sessionId, {
      stage: 'greeting'
    });

    return {
      success: true,
      message: 'Sesión reiniciada',
      sessionId: session.sessionId
    };

  } catch (error) {
    console.error('[ChatAdapter] Error resetting session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtener estado de sesión
 * COMPATIBLE CON: GET /api/session/:sid
 */
export async function getSessionState(sessionId) {
  try {
    const state = await conversationOrchestrator.getSessionState(sessionId);
    
    if (!state) {
      return {
        found: false,
        message: 'Sesión no encontrada'
      };
    }

    return {
      found: true,
      session: state
    };

  } catch (error) {
    console.error('[ChatAdapter] Error getting session state:', error);
    return {
      found: false,
      error: error.message
    };
  }
}

/**
 * Obtener estadísticas de la arquitectura modular
 */
export async function getModularStats() {
  try {
    const sessionStats = sessionService.getStats();
    const decisionStats = decisionEngine.getStats();

    return {
      mode: MODULAR_MODE ? 'modular' : 'legacy',
      sessions: sessionStats,
      decisions: decisionStats,
      uptime: process.uptime()
    };

  } catch (error) {
    console.error('[ChatAdapter] Error getting stats:', error);
    return { error: error.message };
  }
}

/**
 * Generar ID único para request
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Middleware para logging de performance
 */
export function performanceMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[ChatAdapter] ⚠️ Slow response: ${req.path} took ${duration}ms`);
    }
  });

  next();
}

// ========== EXPORTAR TODO ==========
export default {
  handleChatMessage,
  handleGreeting,
  handleReset,
  getSessionState,
  getModularStats,
  setModularMode,
  isModularMode,
  performanceMiddleware
};
