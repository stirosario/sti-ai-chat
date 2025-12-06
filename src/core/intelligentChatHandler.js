/**
 * 🧠 INTELLIGENT CHAT HANDLER - Manejador inteligente unificado
 * 
 * Este módulo reemplaza la lógica rígida de stages por un sistema inteligente
 * que analiza cada mensaje, entiende el contexto y responde coherentemente.
 * 
 * @author STI AI Team
 * @date 2025-12-06
 */

import { analyzeIntent, validateActionInContext, INTENT_TYPES, detectOS, detectBrand, detectDeviceType } from './intentEngine.js';
import { generateSmartResponse } from './smartResponseGenerator.js';

/**
 * 🎯 Función principal: Maneja un mensaje de usuario de forma inteligente
 * 
 * Esta función REEMPLAZA la lógica basada en stages por un sistema unificado
 * que decide dinámicamente qué hacer basándose en la intención real del usuario.
 * 
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} buttonToken - Token de botón si fue clickeado
 * @param {Object} session - Sesión completa del usuario
 * @param {string} locale - Idioma (es-AR, en-US, etc.)
 * @returns {Promise<Object>} - { reply, options, stage, reasoning, intentDetected }
 */
export async function handleIntelligentChat(userMessage, buttonToken, session, locale = 'es-AR') {
  console.log('[IntelligentChat] 🧠 Procesando mensaje inteligente...');
  console.log('[IntelligentChat] 📝 Mensaje:', userMessage?.substring(0, 80));
  console.log('[IntelligentChat] 🔘 Botón:', buttonToken);

  const isEnglish = locale.toLowerCase().startsWith('en');

  try {
    // PASO 1: Si es un botón de acción, validar contexto primero
    if (buttonToken && buttonToken.startsWith('BTN_')) {
      console.log('[IntelligentChat] 🔍 Validando botón en contexto...');
      
      const currentIntent = session.lastDetectedIntent || INTENT_TYPES.UNCLEAR;
      const validation = validateActionInContext(buttonToken, currentIntent, {
        userLocale: locale,
        hasAttemptedBasicTests: session.hasAttemptedBasicTests || false,
        recentMessages: session.transcript || []
      });

      if (!validation.isValid) {
        console.log('[IntelligentChat] ⚠️ Acción inválida en este contexto:', validation.reason);
        
        return {
          reply: validation.message,
          options: [{
            text: isEnglish ? '💬 Tell me what you need' : '💬 Decime qué necesitás',
            value: 'BTN_FREE_TEXT',
            description: isEnglish ? 'Describe your situation' : 'Describí tu situación'
          }, {
            text: isEnglish ? '🚪 Close Chat' : '🚪 Cerrar Chat',
            value: 'BTN_CLOSE',
            description: isEnglish ? 'End conversation' : 'Terminar conversación'
          }],
          stage: session.stage, // Mantener stage actual
          reasoning: validation.reason,
          intentDetected: currentIntent,
          actionRejected: true
        };
      }
    }

    // PASO 2: Analizar la intención del mensaje
    const conversationContext = {
      recentMessages: session.transcript || [],
      lastDetectedIntent: session.lastDetectedIntent || null,
      hasAttemptedBasicTests: session.hasAttemptedBasicTests || false,
      userLocale: locale,
      device: session.device || null,
      problem: session.problem || null,
      activeIntent: session.activeIntent || null,
      operatingSystem: session.operatingSystem || null,
      deviceBrand: session.deviceBrand || null
    };

    console.log('[IntelligentChat] 🔍 Analizando intención...');
    const intentAnalysis = await analyzeIntent(userMessage, conversationContext, locale);
    
    console.log('[IntelligentChat] ✅ Intención detectada:', {
      intent: intentAnalysis.intent,
      confidence: intentAnalysis.confidence,
      requiresDiagnostic: intentAnalysis.requiresDiagnostic
    });

    // Guardar intent detectado en sesión para próximas validaciones
    session.lastDetectedIntent = intentAnalysis.intent;
    session.lastIntentConfidence = intentAnalysis.confidence;

    // PASO 3: Decidir si necesitamos aclaración
    // ✅ PROHIBIDO: Mensaje genérico en stage ASK_NAME
    // ✅ PROHIBIDO: Mensaje genérico si hay intención activa
    if (intentAnalysis.clarificationNeeded || intentAnalysis.confidence < 0.6) {
      console.log('[IntelligentChat] ❓ Intención no clara - evaluando si pedir aclaración');
      
      // ⚠️ Si estamos en ASK_NAME, NO usar el mensaje genérico
      if (session.stage === 'ASK_NAME') {
        console.log('[IntelligentChat] ⚠️ En ASK_NAME - no usar mensaje genérico, devolver null');
        // Devolver null para que el flujo legacy de server.js maneje la validación del nombre
        return null;
      }
      
      // ✅ Si estamos en ASK_NEED, SIEMPRE procesar con sistema inteligente
      // (no devolver null incluso si confidence es baja)
      if (session.stage === 'ASK_NEED') {
        console.log('[IntelligentChat] 🎯 En ASK_NEED - procesando aunque confidence sea baja');
        // Continuar con el análisis - NO devolver null ni pedir aclaración genérica
      }
      
      // ✅ Si hay intención activa, NO pedir aclaración genérica
      if (session.activeIntent && !session.activeIntent.resolved) {
        console.log('[IntelligentChat] ⚠️ Confidence baja PERO hay intent activo - continuando flujo');
        // Continuar al PASO 4 - el sistema inteligente manejará la respuesta
      } else {
        // Solo pedir aclaración si NO hay intención activa
        const clarificationMsg = isEnglish
          ? `I want to help you, but I need to understand better what you need. Could you tell me:\n\n• Are you having a problem with something that's not working?\n• Do you want to install or configure something?\n• Do you have a question about how to do something?\n\nThe more details you give me, the better I can help you! 😊`
          : `Quiero ayudarte, pero necesito entender mejor qué necesitás. ¿Podrías contarme:\n\n• ¿Tenés un problema con algo que no funciona?\n• ¿Querés instalar o configurar algo?\n• ¿Tenés una pregunta sobre cómo hacer algo?\n\n¡Cuantos más detalles me des, mejor voy a poder ayudarte! 😊`;

        return {
          reply: clarificationMsg,
          options: [],
          stage: 'AWAITING_CLARIFICATION',
          reasoning: 'Low confidence or unclear intent - asking for clarification',
          intentDetected: intentAnalysis.intent,
          needsClarification: true
        };
      }
    }

    // PASO 4: Generar respuesta inteligente basada en la intención
    console.log('[IntelligentChat] 💬 Generando respuesta inteligente...');
    
    // ✅ PASO 4A: Actualizar session.activeIntent ANTES de generar respuesta
    updateSessionIntent(session, intentAnalysis, userMessage);
    
    const smartResponse = await generateSmartResponse(
      intentAnalysis,
      userMessage,
      conversationContext,
      locale
    );

    // PASO 5: Actualizar contexto de sesión según el intent
    updateSessionContext(session, intentAnalysis, userMessage);

    // PASO 6: Determinar stage contextual (no rígido)
    const contextualStage = determineContextualStage(intentAnalysis, session);

    console.log('[IntelligentChat] ✅ Respuesta generada exitosamente');

    return {
      reply: smartResponse.reply,
      options: smartResponse.options,
      stage: contextualStage,
      reasoning: smartResponse.reasoning,
      intentDetected: intentAnalysis.intent,
      nextAction: smartResponse.nextAction,
      requiresDiagnostic: intentAnalysis.requiresDiagnostic,
      deviceType: intentAnalysis.deviceType
    };

  } catch (error) {
    console.error('[IntelligentChat] ❌ Error procesando mensaje:', error);
    
    // Respuesta de error amigable
    const errorReply = isEnglish
      ? '😅 I had a momentary issue processing your request. Could you try rephrasing what you need?'
      : '😅 Tuve un problema momentáneo procesando tu solicitud. ¿Podrías reformular qué necesitás?';

    return {
      reply: errorReply,
      options: [{
        text: isEnglish ? '🔄 Try again' : '🔄 Intentar de nuevo',
        value: 'BTN_RETRY',
        description: isEnglish ? 'Rephrase your request' : 'Reformulá tu solicitud'
      }],
      stage: session.stage || 'ERROR',
      reasoning: 'Error during processing',
      intentDetected: INTENT_TYPES.UNCLEAR,
      error: true
    };
  }
}

/**
 * 💾 Actualiza session.activeIntent cuando se detecta una intención principal
 * NO actualiza si:
 * - Es respuesta auxiliar
 * - Estamos en ASK_NAME
 * - Estamos en ASK_LANGUAGE
 */
function updateSessionIntent(session, intentAnalysis, userMessage) {
  // NO actualizar si es respuesta auxiliar
  if (intentAnalysis.isAuxiliaryResponse) {
    console.log('[IntelligentChat] 🔄 Respuesta auxiliar - manteniendo intent activo');
    return;
  }
  
  // NO actualizar si estamos en stages de setup
  if (session.stage === 'ASK_NAME' || session.stage === 'ASK_LANGUAGE') {
    console.log('[IntelligentChat] ⚠️ En stage de setup - no guardar activeIntent');
    return;
  }
  
  // Lista de intents principales que merecen ser guardados
  const principalIntents = [
    INTENT_TYPES.TECHNICAL_PROBLEM,
    INTENT_TYPES.PERFORMANCE_ISSUE,
    INTENT_TYPES.CONNECTION_PROBLEM,
    INTENT_TYPES.INSTALLATION_HELP,
    INTENT_TYPES.CONFIGURATION_HELP,
    INTENT_TYPES.HOW_TO_QUESTION,
    INTENT_TYPES.INFORMATION_REQUEST
  ];
  
  // Solo guardar si es un intent principal
  if (!principalIntents.includes(intentAnalysis.intent)) {
    console.log('[IntelligentChat] ⚠️ Intent no principal - no guardar:', intentAnalysis.intent);
    return;
  }
  
  // Si ya hay un activeIntent y cambió el tipo, marcar el anterior como resuelto
  if (session.activeIntent && session.activeIntent.type !== intentAnalysis.intent) {
    console.log('[IntelligentChat] ✅ Intent cambió de', session.activeIntent.type, 'a', intentAnalysis.intent);
    session.activeIntent.resolved = true;
  }
  
  // Crear o actualizar activeIntent
  session.activeIntent = {
    type: intentAnalysis.intent,
    originalMessage: userMessage,
    confidence: intentAnalysis.confidence,
    timestamp: Date.now(),
    resolved: false,
    requiresDiagnostic: intentAnalysis.requiresDiagnostic || false,
    deviceType: intentAnalysis.deviceType || null,
    urgency: intentAnalysis.urgency || 'normal',
    topic: intentAnalysis.topic || null
  };
  
  console.log('[IntelligentChat] 💾 ActiveIntent guardado:', {
    type: session.activeIntent.type,
    confidence: session.activeIntent.confidence,
    topic: session.activeIntent.topic
  });
}

/**
 * 🔄 Actualiza el contexto de la sesión basado en la intención detectada
 */
function updateSessionContext(session, intentAnalysis, userMessage) {
  // Guardar el mensaje en el contexto apropiado
  switch (intentAnalysis.intent) {
    case INTENT_TYPES.TECHNICAL_PROBLEM:
    case INTENT_TYPES.PERFORMANCE_ISSUE:
    case INTENT_TYPES.CONNECTION_PROBLEM:
      session.problem = session.problem || userMessage;
      session.isProblem = true;
      session.isHowTo = false;
      break;

    case INTENT_TYPES.INSTALLATION_HELP:
    case INTENT_TYPES.CONFIGURATION_HELP:
      session.installationRequest = session.installationRequest || userMessage;
      session.isProblem = false;
      session.isHowTo = true;
      break;

    case INTENT_TYPES.HOW_TO_QUESTION:
      session.howToQuestion = session.howToQuestion || userMessage;
      session.isProblem = false;
      session.isHowTo = true;
      break;
  }

  // Guardar tipo de dispositivo si fue detectado
  if (!session.device && intentAnalysis.deviceType) {
    session.device = intentAnalysis.deviceType;
  }
  
  // Guardar sistema operativo si fue detectado
  if (!session.operatingSystem && intentAnalysis.operatingSystem) {
    session.operatingSystem = intentAnalysis.operatingSystem;
    console.log('[IntelligentChat] 💾 OS guardado:', session.operatingSystem);
  }
  
  // Guardar marca si fue detectada
  if (!session.deviceBrand && intentAnalysis.deviceBrand) {
    session.deviceBrand = intentAnalysis.deviceBrand;
    console.log('[IntelligentChat] 💾 Marca guardada:', session.deviceBrand);
  }
  
  // ✅ Si es respuesta auxiliar, actualizar activeIntent con datos auxiliares
  if (intentAnalysis.isAuxiliaryResponse && intentAnalysis.auxiliaryData) {
    const aux = intentAnalysis.auxiliaryData;
    
    // Usar detectores centralizados
    const detectedOS = detectOS(aux);
    if (detectedOS && !session.operatingSystem) {
      session.operatingSystem = detectedOS;
      console.log('[IntelligentChat] 💾 Sistema operativo guardado:', detectedOS);
    }
    
    const detectedDevice = detectDeviceType(aux);
    if (detectedDevice && !session.device) {
      session.device = detectedDevice;
      console.log('[IntelligentChat] 💾 Tipo de dispositivo guardado:', detectedDevice);
    }
    
    const detectedBrand = detectBrand(aux);
    if (detectedBrand && !session.deviceBrand) {
      session.deviceBrand = detectedBrand;
      console.log('[IntelligentChat] 💾 Marca guardada:', detectedBrand);
    }
  }

  // Actualizar urgencia
  if (intentAnalysis.urgency) {
    session.urgency = intentAnalysis.urgency;
  }
}

/**
 * 🎯 Determina un "stage" contextual (no rígido) basado en la intención
 * 
 * Estos stages son DESCRIPTIVOS del estado actual, no prescriptivos del flujo
 */
function determineContextualStage(intentAnalysis, session) {
  const stageMap = {
    [INTENT_TYPES.TECHNICAL_PROBLEM]: 'DIAGNOSING_PROBLEM',
    [INTENT_TYPES.PERFORMANCE_ISSUE]: 'ANALYZING_PERFORMANCE',
    [INTENT_TYPES.CONNECTION_PROBLEM]: 'TROUBLESHOOTING_CONNECTION',
    [INTENT_TYPES.INSTALLATION_HELP]: 'GUIDING_INSTALLATION',
    [INTENT_TYPES.CONFIGURATION_HELP]: 'GUIDING_CONFIGURATION',
    [INTENT_TYPES.HOW_TO_QUESTION]: 'EXPLAINING_PROCEDURE',
    [INTENT_TYPES.INFORMATION_REQUEST]: 'PROVIDING_INFORMATION',
    [INTENT_TYPES.ESCALATION_REQUEST]: 'ESCALATING_TO_HUMAN',
    [INTENT_TYPES.FEEDBACK]: 'RECEIVING_FEEDBACK',
    [INTENT_TYPES.CLOSE_CHAT]: 'ENDING_CONVERSATION',
    [INTENT_TYPES.UNCLEAR]: 'CLARIFYING_INTENT'
  };

  return stageMap[intentAnalysis.intent] || 'AWAITING_INPUT';
}

/**
 * 🔍 Verifica si el sistema inteligente debe activarse para este mensaje
 * 
 * Retorna true si:
 * - El mensaje es ambiguo o complejo
 * - Es un texto libre (no botón predefinido)
 * - El contexto requiere análisis inteligente
 */
export function shouldUseIntelligentMode(userMessage, buttonToken, session) {
  // Siempre usar modo inteligente para texto libre
  if (!buttonToken && userMessage && userMessage.length > 5) {
    return true;
  }

  // Usar modo inteligente si el botón parece fuera de contexto
  if (buttonToken && buttonToken.startsWith('BTN_')) {
    const problematicButtons = ['BTN_ADVANCED_TESTS', 'BTN_MORE_TESTS', 'BTN_BASIC_TESTS'];
    if (problematicButtons.includes(buttonToken)) {
      return true; // Validar estos botones con intent engine
    }
  }

  // Usar si la confianza del intent previo fue baja
  if (session.lastIntentConfidence && session.lastIntentConfidence < 0.7) {
    return true;
  }

  // Usar si hay inconsistencias en el contexto
  if (session.isProblem && session.isHowTo) {
    return true; // Contexto contradictorio
  }

  return false;
}

export default {
  handleIntelligentChat,
  shouldUseIntelligentMode
};
