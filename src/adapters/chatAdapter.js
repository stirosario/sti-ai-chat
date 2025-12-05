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

// ========== BUTTON TOKEN MAP (COMPATIBILIDAD LEGACY) ==========
const BUTTON_TOKEN_MAP = {
  // Idiomas
  'BTN_LANG_ES_AR': 'Español (Argentina)',
  'BTN_LANG_ES_ES': 'Español (Latinoamérica)',
  'BTN_LANG_EN': 'English',
  'BTN_NO_NAME': 'Prefiero no decirlo',
  
  // Tipo de necesidad
  'BTN_PROBLEMA': 'tengo un problema',
  'BTN_CONSULTA': 'tengo una consulta',
  
  // Dispositivos
  'BTN_DESKTOP': 'desktop',
  'BTN_ALLINONE': 'all in one',
  'BTN_NOTEBOOK': 'notebook',
  
  // Feedback de steps
  'BTN_SOLVED': 'lo pude solucionar',
  'BTN_PERSIST': 'el problema persiste',
  'BTN_ADVANCED_TESTS': 'pruebas avanzadas',
  'BTN_MORE_TESTS': 'más pruebas',
  'BTN_TECH': 'hablar con técnico',
  'BTN_CONNECT_TECH': 'conectar con técnico'
};

/**
 * Convertir token de botón a texto legible
 * Compatible con la lógica del server.js (línea 4174-4190)
 */
function processButtonToken(buttonToken) {
  // Caso 1: Token está en el mapa
  if (BUTTON_TOKEN_MAP[buttonToken]) {
    return BUTTON_TOKEN_MAP[buttonToken];
  }
  
  // Caso 2: BTN_HELP_N (dinámico)
  if (buttonToken.startsWith('BTN_HELP_')) {
    const stepNumber = buttonToken.split('_').pop();
    return `ayuda paso ${stepNumber}`;
  }
  
  // Caso 3: BTN_DEV_* (dispositivos dinámicos)
  if (buttonToken.startsWith('BTN_DEV_')) {
    const deviceCode = buttonToken.replace('BTN_DEV_', '').toLowerCase();
    return deviceCode.replace(/_/g, ' ');
  }
  
  // Caso 4: Fallback - usar el token tal cual
  console.warn(`[ChatAdapter] ⚠️ Token desconocido: ${buttonToken}`);
  return buttonToken;
}

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
    // 1. Extraer datos del request (compatible con server.js línea 4160-4190)
    const {
      text: userText,
      images = [],
      imageUrls = [],
      action = null,
      value: buttonValue = null,
      label: buttonLabel = null,
      locale = 'es'
    } = requestBody;

    console.log(`[ChatAdapter] 📨 Processing message for session: ${sessionId}`);

    // 2. ✅ PROCESAR BOTONES (igual que server.js)
    let processedText = userText || '';
    let buttonToken = null;
    let isButton = false;

    if (action === 'button' && buttonValue) {
      buttonToken = String(buttonValue);
      processedText = processButtonToken(buttonToken);
      isButton = true;
      console.log(`[ChatAdapter] 🔘 Button pressed: ${buttonToken} → "${processedText}"`);
    }

    // 3. Preparar input para el orquestador
    const userInput = {
      text: processedText,  // ✅ Ahora contiene texto legible
      timestamp: new Date().toISOString()
    };

    const enrichedMetadata = {
      ...metadata,
      imageUrls: imageUrls.length > 0 ? imageUrls : (images || []),
      buttonToken,
      buttonLabel,
      isButton,
      locale,
      action,
      requestId: generateRequestId()
    };

    // 4. Procesar con orquestador
    const orchestratorResponse = await conversationOrchestrator.processMessage(
      sessionId,
      userInput,
      enrichedMetadata
    );

    // 5. Obtener sesión actualizada
    const session = await sessionService.getSession(sessionId);

    // 6. Convertir respuesta al formato legacy
    const legacyResponse = convertToLegacyFormat(
      orchestratorResponse,
      session,
      sessionId
    );

    // 7. Logging (compatible con flowLogger existente)
    await logFlowInteraction(sessionId, {
      stage: session.stage,
      userInput: buttonToken ? `[BTN] ${buttonLabel || buttonToken}` : processedText,
      botResponse: orchestratorResponse.text,
      decision: 'continue',
      metadata: enrichedMetadata
    });

    const duration = Date.now() - startTime;
    console.log(`[ChatAdapter] ✅ Response generated in ${duration}ms`);

    return legacyResponse;

  } catch (error) {
    console.error('[ChatAdapter] ❌ Error processing message:', error);
    
    // Respuesta de error en formato legacy (compatible con server.js)
    return {
      ok: false,                         // ✅ Campo ok
      reply: 'Disculpá, hubo un error temporal. Por favor, intentá nuevamente.',
      sid: sessionId,                    // ✅ Session ID
      stage: 'error',                    // ✅ Stage
      options: [],                       // ✅ Sin opciones
      error: error.message
    };
  }
}

/**
 * Convertir respuesta del orquestador al formato legacy del server.js
 * 
 * FORMATO LEGACY (server.js línea 6040-6080):
 * {
 *   ok: true,
 *   reply: string,
 *   sid: string,
 *   stage: string (UPPERCASE),
 *   options: Array<string>,
 *   ui: { buttons: Array<{type, label, value}>, states: {} },
 *   allowWhatsapp: boolean,
 *   endConversation: boolean,
 *   help?: { stepIndex, stepText, detail },
 *   steps?: Array<string>,
 *   imageAnalysis?: object
 * }
 */
function convertToLegacyFormat(orchestratorResponse, session, sessionId) {
  const { text, options, buttons, help } = orchestratorResponse;

  // ✅ ESTRUCTURA COMPLETA LEGACY
  const legacyResponse = {
    ok: true,                          // ✅ Campo obligatorio
    reply: text,                       // ✅ Texto de respuesta
    sid: sessionId,                    // ✅ Session ID
    stage: session.stage,              // ✅ Stage actual (UPPERCASE)
  };

  // ✅ OPTIONS: Array de strings (legacy) o array vacío
  if (options && Array.isArray(options)) {
    legacyResponse.options = options.map(opt => {
      if (typeof opt === 'string') return opt;
      if (typeof opt === 'object' && opt.label) return opt.label;
      return String(opt);
    });
  } else {
    legacyResponse.options = [];
  }

  // ✅ UI.BUTTONS: Estructura completa de botones
  if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    legacyResponse.ui = {
      buttons: buttons.map(btn => ({
        type: btn.type || 'button',
        label: btn.label || btn.text || '',
        value: btn.token || btn.value || '',
        style: btn.style || 'default'
      })),
      states: {} // Placeholder para estados UI (si se necesita)
    };
  } else if (legacyResponse.options.length > 0) {
    // Si no hay botones pero hay options, crear botones básicos
    legacyResponse.ui = {
      buttons: legacyResponse.options.map((label, idx) => ({
        type: 'button',
        label: label,
        value: `BTN_OPT_${idx}`,
        style: 'default'
      })),
      states: {}
    };
  }

  // ✅ ALLOW_WHATSAPP: Flag para habilitar escalamiento
  if (session.waEligible === true) {
    legacyResponse.allowWhatsapp = true;
  }

  // ✅ END_CONVERSATION: Flag de fin de conversación
  if (session.stage === 'ENDED' || session.stage === 'TICKET_SENT') {
    legacyResponse.endConversation = true;
  }

  // ✅ HELP: Ayuda contextual por step
  if (help) {
    legacyResponse.help = {
      stepIndex: help.stepIndex || session.lastHelpStep || 0,
      stepText: help.stepText || '',
      detail: help.detail || ''
    };
  }

  // ✅ STEPS: Array de pasos del diagnóstico
  if (session.tests) {
    const isAdvanced = session.stage === 'ADVANCED_TESTS';
    legacyResponse.steps = isAdvanced 
      ? (session.tests.advanced || [])
      : (session.tests.basic || []);
  } else if (orchestratorResponse.steps) {
    legacyResponse.steps = orchestratorResponse.steps;
  }

  // ✅ IMAGE_ANALYSIS: Resultado de Vision API
  if (session.imageAnalysis) {
    legacyResponse.imageAnalysis = session.imageAnalysis;
  }

  // ✅ TICKET: Datos de ticket si fue creado
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
