/**
 * services/messageProcessor.js
 * Sistema unificado de procesamiento de mensajes con Strategy pattern
 * 
 * Orden de prioridad:
 * 1. Sistema Inteligente (OpenAI)
 * 2. Orchestrator
 * 3. Arquitectura Modular
 * 4. Legacy
 */

/**
 * Procesa un mensaje usando el sistema de procesadores con fallback
 * @param {object} options - Opciones de procesamiento
 * @param {object} options.session - Sesión actual
 * @param {string} options.userMessage - Mensaje del usuario
 * @param {string} options.buttonToken - Token del botón (si aplica)
 * @param {object} options.req - Request de Express
 * @param {object} options.res - Response de Express
 * @param {object} options.dependencies - Dependencias (handleWithIntelligence, orchestrateTurn, etc.)
 * @returns {Promise<object|null>} Respuesta del procesador o null si ninguno procesó
 */
export async function processMessage(options) {
  const {
    session,
    userMessage,
    buttonToken,
    req,
    res,
    dependencies
  } = options;

  const {
    handleWithIntelligence,
    orchestrateTurn,
    chatAdapter,
    USE_INTELLIGENT_MODE,
    USE_ORCHESTRATOR,
    USE_MODULAR_ARCHITECTURE
  } = dependencies;

  // Definir procesadores en orden de prioridad
  const processors = [
    {
      name: 'intelligent',
      priority: 1,
      enabled: USE_INTELLIGENT_MODE,
      handler: async () => {
        if (!handleWithIntelligence) return null;
        return await handleWithIntelligence(req, res, session, userMessage, buttonToken);
      }
    },
    {
      name: 'orchestrator',
      priority: 2,
      enabled: USE_ORCHESTRATOR,
      handler: async () => {
        if (!orchestrateTurn) return null;
        const body = req.body || {};
        const images = body.images || [];
        const smartAnalysis = session.smartAnalysis || null;
        
        return await orchestrateTurn({
          session: session,
          userMessage: userMessage,
          buttonToken: buttonToken,
          images: images,
          smartAnalysis: smartAnalysis
        });
      }
    },
    {
      name: 'modular',
      priority: 3,
      enabled: USE_MODULAR_ARCHITECTURE && chatAdapter,
      handler: async () => {
        if (!chatAdapter?.handleChatMessage) return null;
        const body = req.body || {};
        const sid = req.sessionId;
        return await chatAdapter.handleChatMessage(body, sid);
      }
    },
    {
      name: 'legacy',
      priority: 4,
      enabled: true, // Siempre disponible como último recurso
      handler: async () => {
        // Legacy se procesa en el código principal
        // Este procesador solo indica que debe continuar con legacy
        return null;
      }
    }
  ];

  // Ordenar por prioridad
  const sortedProcessors = processors
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Intentar cada procesador en orden
  for (const processor of sortedProcessors) {
    try {
      console.log(`[MESSAGE_PROCESSOR] Intentando procesador: ${processor.name} (prioridad ${processor.priority})`);
      
      const response = await processor.handler();
      
      if (response && (response.reply || response.ok !== false)) {
        console.log(`[MESSAGE_PROCESSOR] ✅ Procesador ${processor.name} generó respuesta`);
        return {
          response,
          processor: processor.name,
          priority: processor.priority
        };
      }
    } catch (error) {
      console.error(`[MESSAGE_PROCESSOR] ❌ Error en procesador ${processor.name}:`, error.message);
      console.error(`[MESSAGE_PROCESSOR] Stack:`, error.stack);
      // Continuar con el siguiente procesador
      continue;
    }
  }

  // Ningún procesador generó respuesta, usar legacy
  console.log(`[MESSAGE_PROCESSOR] ⏭️ Ningún procesador generó respuesta, usando legacy`);
  return {
    response: null,
    processor: 'legacy',
    priority: 4
  };
}

/**
 * Determina qué procesador debería usarse basado en el contexto
 * @param {object} session - Sesión actual
 * @param {string} userMessage - Mensaje del usuario
 * @param {string} buttonToken - Token del botón
 * @returns {string} Nombre del procesador recomendado
 */
export function recommendProcessor(session, userMessage, buttonToken) {
  // Si es un botón simple, no necesita sistema inteligente
  if (buttonToken && !buttonToken.startsWith('BTN_HELP_')) {
    return 'legacy';
  }

  // Si el stage es muy temprano (ASK_LANGUAGE, ASK_NAME), usar legacy
  if (session.stage === 'ASK_LANGUAGE' || session.stage === 'ASK_NAME') {
    return 'legacy';
  }

  // Para otros casos, el sistema inteligente puede ayudar
  return 'intelligent';
}
