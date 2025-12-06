/**
 * 🧠 INTENT ENGINE - Cerebro central de Tecnos
 * 
 * Este módulo es el "cerebro" que analiza CADA mensaje del usuario
 * y decide qué hacer de forma inteligente usando OpenAI.
 * 
 * NO usa stages rígidos. En su lugar:
 * 1. Analiza el mensaje actual + contexto de la conversación
 * 2. Clasifica la intención real del usuario
 * 3. Decide la acción más lógica
 * 4. Valida que la acción sea coherente con el contexto
 * 
 * @author STI AI Team
 * @date 2025-12-06
 */

import { getOpenAIClient } from '../services/aiService.js';

/**
 * Tipos de intención que puede tener un usuario
 */
export const INTENT_TYPES = {
  // Problemas técnicos (requieren diagnóstico)
  TECHNICAL_PROBLEM: 'technical_problem',        // "mi PC no prende", "pantalla azul"
  PERFORMANCE_ISSUE: 'performance_issue',        // "está lento", "se cuelga"
  CONNECTION_PROBLEM: 'connection_problem',      // "no tengo internet", "wifi no anda"
  
  // Solicitudes de ayuda (requieren guía)
  INSTALLATION_HELP: 'installation_help',        // "cómo instalo AnyDesk"
  CONFIGURATION_HELP: 'configuration_help',      // "cómo configuro mi impresora"
  HOW_TO_QUESTION: 'how_to_question',           // "cómo subo el volumen"
  
  // Consultas informativas
  INFORMATION_REQUEST: 'information_request',    // "qué es un driver"
  GENERAL_QUESTION: 'general_question',          // "cuánto RAM necesito"
  
  // Control de flujo
  ESCALATION_REQUEST: 'escalation_request',      // "quiero hablar con técnico"
  FEEDBACK: 'feedback',                          // "me sirvió", "no funcionó"
  CLOSE_CHAT: 'close_chat',                      // "chau", "cerrar"
  
  // Ambiguo o no claro
  UNCLEAR: 'unclear'
};

/**
 * Contextos válidos para acciones específicas
 */
export const ACTION_CONTEXTS = {
  BASIC_TESTS: ['technical_problem', 'performance_issue', 'connection_problem'],
  ADVANCED_TESTS: ['technical_problem'], // SOLO si ya intentó básicos
  INSTALLATION_GUIDE: ['installation_help', 'configuration_help'],
  HOW_TO_GUIDE: ['how_to_question', 'configuration_help'],
  ESCALATE: ['escalation_request', 'technical_problem', 'performance_issue'] // Después de intentos
};

/**
 * 🔍 Detecta si un mensaje es una respuesta auxiliar a una pregunta previa
 * Ejemplos: "windows", "mac", "sí", "hp", "notebook", "ok"
 * 
 * @param {string} userMessage - Mensaje del usuario
 * @returns {boolean} - true si es respuesta auxiliar
 */
function isAuxiliaryResponse(userMessage) {
  const msg = userMessage.toLowerCase().trim();
  
  // Respuestas muy cortas (< 10 caracteres)
  if (msg.length < 10) {
    // Sistemas operativos
    if (/^(windows|win|mac|macos|linux|ubuntu|android|ios)$/i.test(msg)) return true;
    
    // Confirmaciones
    if (/^(s[ií]|yes|ok|dale|claro|exacto|correcto|no)$/i.test(msg)) return true;
    
    // Marcas/modelos
    if (/^(hp|dell|lenovo|asus|acer|samsung|apple|toshiba|sony)$/i.test(msg)) return true;
    
    // Tipos de dispositivo
    if (/^(notebook|pc|desktop|laptop|impresora|router|modem)$/i.test(msg)) return true;
  }
  
  // Respuestas cortas con patrón auxiliar (< 20 caracteres)
  if (msg.length < 20) {
    if (/^(tengo\s+\w+|uso\s+\w+|es\s+(un|una)\s+\w+)$/i.test(msg)) return true;
  }
  
  return false;
}

/**
 * 🎯 Función principal: Analiza un mensaje y determina la intención
 * 
 * @param {string} userMessage - Mensaje del usuario
 * @param {Object} conversationContext - Contexto completo de la conversación
 * @param {string} locale - Idioma del usuario (es-AR, en-US, etc.)
 * @returns {Promise<Object>} - { intent, confidence, reasoning, suggestedAction }
 */
export async function analyzeIntent(userMessage, conversationContext = {}, locale = 'es-AR') {
  // ✅ VERIFICAR SI HAY INTENCIÓN ACTIVA Y ES RESPUESTA AUXILIAR
  if (conversationContext.activeIntent && 
      !conversationContext.activeIntent.resolved &&
      isAuxiliaryResponse(userMessage)) {
    
    console.log('[IntentEngine] 🎯 Respuesta auxiliar detectada para intent activo:', 
                conversationContext.activeIntent.type);
    console.log('[IntentEngine] 📝 Respuesta auxiliar:', userMessage);
    
    // NO recalcular intención - mantener la activa
    return {
      intent: conversationContext.activeIntent.type,
      confidence: conversationContext.activeIntent.confidence,
      reasoning: `Continuando con intención activa: ${conversationContext.activeIntent.type}`,
      isAuxiliaryResponse: true,
      auxiliaryData: userMessage.trim(),
      requiresDiagnostic: conversationContext.activeIntent.requiresDiagnostic || false,
      deviceType: conversationContext.activeIntent.deviceType || null,
      urgency: conversationContext.activeIntent.urgency || 'normal',
      clarificationNeeded: false
    };
  }
  
  const openai = getOpenAIClient();
  
  if (!openai) {
    console.error('[IntentEngine] ⚠️ OpenAI no disponible - usando fallback');
    return fallbackIntentAnalysis(userMessage);
  }

  const isEnglish = locale.toLowerCase().startsWith('en');
  
  // Construir prompt con contexto completo
  const systemPrompt = buildSystemPrompt(isEnglish);
  const userPrompt = buildUserPrompt(userMessage, conversationContext, isEnglish);

  try {
    console.log('[IntentEngine] 🧠 Analizando intención con OpenAI...');
    console.log('[IntentEngine] 📝 Mensaje:', userMessage.substring(0, 100));
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2, // Baja temperatura para respuestas consistentes
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const rawContent = response.choices[0].message.content;
    const analysis = JSON.parse(rawContent);
    
    console.log('[IntentEngine] ✅ Análisis completado:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      requiresDiagnostic: analysis.requiresDiagnostic
    });

    return {
      intent: analysis.intent,
      confidence: analysis.confidence || 0.8,
      reasoning: analysis.reasoning || 'Análisis basado en contenido del mensaje',
      suggestedAction: analysis.suggestedAction,
      requiresDiagnostic: analysis.requiresDiagnostic || false,
      deviceType: analysis.deviceType || null,
      urgency: analysis.urgency || 'normal',
      clarificationNeeded: analysis.clarificationNeeded || false,
      topic: analysis.topic || detectTopic(userMessage),
      operatingSystem: analysis.operatingSystem || detectOS(userMessage),
      deviceBrand: analysis.deviceBrand || detectBrand(userMessage)
    };

  } catch (error) {
    console.error('[IntentEngine] ❌ Error analizando con OpenAI:', error.message);
    return fallbackIntentAnalysis(userMessage);
  }
}

/**
 * 🔒 Valida si una acción es coherente con el contexto actual
 * 
 * Esta función PREVIENE que Tecnos ofrezca opciones ilógicas
 * como "Pruebas Avanzadas" cuando el usuario está instalando software.
 * 
 * @param {string} requestedAction - Acción que el usuario quiere hacer (o botón clickeado)
 * @param {string} currentIntent - Intención actual clasificada
 * @param {Object} conversationContext - Contexto completo
 * @returns {Object} - { isValid, reason, alternativeAction }
 */
export function validateActionInContext(requestedAction, currentIntent, conversationContext = {}) {
  console.log('[IntentEngine] 🔍 Validando acción:', { requestedAction, currentIntent });

  // Mapeo de acciones a sus intents válidos
  const actionValidations = {
    'BTN_ADVANCED_TESTS': {
      validIntents: ACTION_CONTEXTS.ADVANCED_TESTS,
      requires: ['hasBasicTests', 'hasTechnicalProblem'],
      errorMessage: {
        es: 'Las pruebas avanzadas solo aplican para problemas técnicos después de haber intentado pasos básicos. ¿Querés que te ayude con otra cosa?',
        en: 'Advanced tests only apply to technical problems after trying basic steps. Would you like help with something else?'
      }
    },
    'BTN_MORE_TESTS': {
      validIntents: ACTION_CONTEXTS.ADVANCED_TESTS,
      requires: ['hasBasicTests'],
      errorMessage: {
        es: 'Primero necesito saber qué problema técnico tenés para sugerir más pruebas.',
        en: 'I first need to know what technical problem you have to suggest more tests.'
      }
    },
    'BTN_BASIC_TESTS': {
      validIntents: ACTION_CONTEXTS.BASIC_TESTS,
      requires: [],
      errorMessage: {
        es: 'Las pruebas básicas son para diagnosticar problemas técnicos. Tu consulta parece ser de otro tipo.',
        en: 'Basic tests are for diagnosing technical problems. Your query seems to be of a different type.'
      }
    }
  };

  const validation = actionValidations[requestedAction];
  
  if (!validation) {
    // Acción no conocida - permitir por defecto (puede ser texto libre)
    return { isValid: true };
  }

  // Verificar si el intent actual es válido para esta acción
  const intentIsValid = validation.validIntents.includes(currentIntent);
  
  if (!intentIsValid) {
    const locale = conversationContext.userLocale || 'es-AR';
    const isEnglish = locale.toLowerCase().startsWith('en');
    
    return {
      isValid: false,
      reason: 'intent_mismatch',
      message: isEnglish ? validation.errorMessage.en : validation.errorMessage.es,
      alternativeAction: suggestAlternativeAction(currentIntent, conversationContext)
    };
  }

  // Verificar requisitos adicionales
  for (const requirement of validation.requires) {
    if (requirement === 'hasBasicTests' && !conversationContext.hasAttemptedBasicTests) {
      const locale = conversationContext.userLocale || 'es-AR';
      const isEnglish = locale.toLowerCase().startsWith('en');
      
      return {
        isValid: false,
        reason: 'prerequisites_not_met',
        message: isEnglish 
          ? 'Let\'s first try some basic diagnostic steps before moving to advanced tests.'
          : 'Primero probemos algunos pasos básicos de diagnóstico antes de ir a pruebas avanzadas.',
        alternativeAction: 'show_basic_tests'
      };
    }
  }

  return { isValid: true };
}

/**
 * 🎯 Sugiere una acción alternativa basada en el intent actual
 */
function suggestAlternativeAction(currentIntent, context) {
  const actionMap = {
    [INTENT_TYPES.INSTALLATION_HELP]: 'provide_installation_guide',
    [INTENT_TYPES.CONFIGURATION_HELP]: 'provide_configuration_guide',
    [INTENT_TYPES.HOW_TO_QUESTION]: 'provide_how_to_guide',
    [INTENT_TYPES.TECHNICAL_PROBLEM]: 'start_diagnostic',
    [INTENT_TYPES.INFORMATION_REQUEST]: 'provide_information',
    [INTENT_TYPES.ESCALATION_REQUEST]: 'escalate_to_technician'
  };

  return actionMap[currentIntent] || 'clarify_user_need';
}

/**
 * 📋 Construye el system prompt para OpenAI
 */
function buildSystemPrompt(isEnglish) {
  if (isEnglish) {
    return `You are the Intent Analysis Engine for Tecnos, an intelligent IT support assistant.

Your role is to analyze user messages and determine their TRUE INTENTION with high precision.

**CRITICAL RULES:**
1. NEVER assume a technical problem exists unless explicitly stated
2. "I want to install X" = installation_help, NOT technical_problem
3. "How do I configure X" = configuration_help, NOT technical_problem
4. Only classify as technical_problem if user reports something NOT WORKING
5. Be extremely precise - wrong classification leads to bad user experience

**OUTPUT FORMAT (JSON):**
{
  "intent": "one of: technical_problem, installation_help, configuration_help, how_to_question, information_request, escalation_request, feedback, close_chat, unclear",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why this intent was chosen",
  "suggestedAction": "What Tecnos should do next",
  "requiresDiagnostic": true/false,
  "deviceType": "pc, notebook, printer, router, etc. or null",
  "urgency": "low, normal, high",
  "clarificationNeeded": true/false
}

**EXAMPLES:**
- "I want to install AnyDesk" → installation_help, requiresDiagnostic: false
- "My PC won't turn on" → technical_problem, requiresDiagnostic: true
- "How do I increase volume" → how_to_question, requiresDiagnostic: false
- "It's running slow" → performance_issue (technical_problem), requiresDiagnostic: true`;
  }

  return `Sos el Motor de Análisis de Intención para Tecnos, un asistente inteligente de soporte IT.

Tu rol es analizar mensajes de usuarios y determinar su INTENCIÓN VERDADERA con alta precisión.

**REGLAS CRÍTICAS:**
1. NUNCA asumas que existe un problema técnico a menos que esté explícitamente declarado
2. "Quiero instalar X" = installation_help, NO technical_problem
3. "Cómo configuro X" = configuration_help, NO technical_problem
4. Solo clasifica como technical_problem si el usuario reporta algo que NO FUNCIONA
5. Sé extremadamente preciso - clasificación incorrecta = mala experiencia de usuario

**FORMATO DE SALIDA (JSON):**
{
  "intent": "uno de: technical_problem, performance_issue, connection_problem, installation_help, configuration_help, how_to_question, information_request, escalation_request, feedback, close_chat, unclear",
  "confidence": 0.0 a 1.0,
  "reasoning": "Breve explicación de por qué elegiste esta intención",
  "suggestedAction": "Qué debería hacer Tecnos a continuación",
  "requiresDiagnostic": true/false,
  "deviceType": "pc, notebook, impresora, router, etc. o null",
  "urgency": "low, normal, high",
  "clarificationNeeded": true/false,
  "topic": "office, drivers, wifi, software o null",
  "operatingSystem": "Windows 11, Windows 10, macOS, Linux, etc. o null",
  "deviceBrand": "HP, Dell, Lenovo, etc. o null"
}

**EJEMPLOS:**
- "Quiero instalar AnyDesk" → installation_help, requiresDiagnostic: false
- "Mi PC no prende" → technical_problem, requiresDiagnostic: true
- "Cómo subo el volumen" → how_to_question, requiresDiagnostic: false
- "Está lento" → performance_issue, requiresDiagnostic: true
- "No tengo internet" → connection_problem, requiresDiagnostic: true`;
}

/**
 * 📋 Construye el user prompt con contexto
 */
function buildUserPrompt(userMessage, context, isEnglish) {
  const conversationHistory = context.recentMessages || [];
  const previousIntent = context.lastDetectedIntent || null;
  
  let prompt = isEnglish 
    ? `Analyze this user message and determine the intent:\n\n"${userMessage}"\n\n`
    : `Analiza este mensaje del usuario y determina la intención:\n\n"${userMessage}"\n\n`;

  if (conversationHistory.length > 0) {
    prompt += isEnglish 
      ? `**CONVERSATION CONTEXT:**\n`
      : `**CONTEXTO DE CONVERSACIÓN:**\n`;
    
    conversationHistory.slice(-3).forEach((msg, idx) => {
      prompt += `[${idx + 1}] ${msg.who}: ${msg.text.substring(0, 100)}...\n`;
    });
    prompt += '\n';
  }

  if (previousIntent) {
    prompt += isEnglish
      ? `**PREVIOUS INTENT:** ${previousIntent}\n\n`
      : `**INTENCIÓN PREVIA:** ${previousIntent}\n\n`;
  }

  if (context.hasAttemptedBasicTests) {
    prompt += isEnglish
      ? `**NOTE:** User already tried basic diagnostic steps.\n\n`
      : `**NOTA:** El usuario ya intentó pasos básicos de diagnóstico.\n\n`;
  }

  return prompt;
}

/**
 * 🔍 Detecta el sistema operativo mencionado en el mensaje
 */
function detectOS(message) {
  const msg = message.toLowerCase();

  if (/windows\s*11/.test(msg)) return 'Windows 11';
  if (/windows\s*10/.test(msg)) return 'Windows 10';
  if (/win\s*11/.test(msg)) return 'Windows 11';
  if (/win\s*10/.test(msg)) return 'Windows 10';
  if (/windows/.test(msg)) return 'Windows';

  if (/mac\s*os|macos/.test(msg)) return 'macOS';
  if (/\bmac\b/.test(msg)) return 'macOS';

  if (/linux|ubuntu|debian/.test(msg)) return 'Linux';

  if (/android/.test(msg)) return 'Android';
  if (/ios|iphone|ipad/.test(msg)) return 'iOS';

  return null;
}

/**
 * 🔍 Detecta la marca del dispositivo mencionada
 */
function detectBrand(message) {
  const msg = message.toLowerCase();
  if (/\bhp\b/i.test(msg)) return 'HP';
  if (/dell/i.test(msg)) return 'Dell';
  if (/lenovo/i.test(msg)) return 'Lenovo';
  if (/asus/i.test(msg)) return 'Asus';
  if (/acer/i.test(msg)) return 'Acer';
  if (/samsung/i.test(msg)) return 'Samsung';
  if (/apple/i.test(msg)) return 'Apple';
  if (/toshiba/i.test(msg)) return 'Toshiba';
  if (/sony/i.test(msg)) return 'Sony';
  if (/msi/i.test(msg)) return 'MSI';
  if (/gigabyte/i.test(msg)) return 'Gigabyte';
  if (/huawei/i.test(msg)) return 'Huawei';
  if (/xiaomi/i.test(msg)) return 'Xiaomi';
  return null;
}

/**
 * 🔍 Detecta el tipo de dispositivo mencionado
 */
function detectDeviceType(message) {
  const msg = message.toLowerCase();

  if (/notebook|laptop/.test(msg)) return 'notebook';
  if (/all[\s-]?in[\s-]?one/.test(msg)) return 'all-in-one';
  if (/pc de escritorio|desktop/.test(msg)) return 'pc';
  if (/\bpc\b/.test(msg)) return 'pc';
  if (/impresora|printer/.test(msg)) return 'impresora';
  if (/router|modem/.test(msg)) return 'router';

  return null;
}

/**
 * 🔍 Detecta tema específico del mensaje
 */
function detectTopic(message) {
  const msg = message.toLowerCase();
  
  // Office
  if (/office|word|excel|powerpoint|outlook/i.test(msg)) return 'office';
  
  // Drivers
  if (/driver|sonido|audio|video|grafica|impresora no imprime|no detecta/i.test(msg)) return 'drivers';
  
  // WiFi
  if (/wifi|wi-fi|inalambrico|red|internet no funciona|no se conecta|conexion/i.test(msg)) return 'wifi';
  
  // Instalación de software específico
  if (/anydesk|teamviewer|chrome|firefox|zoom|skype/i.test(msg)) return 'software';
  
  return null;
}

/**
 * 🔄 Análisis de intención fallback (sin OpenAI)
 * Usa regex simple cuando OpenAI no está disponible
 */
function fallbackIntentAnalysis(userMessage) {
  const msg = userMessage.toLowerCase();

  // Problemas técnicos
  if (/no\s+(prende|enciende|funciona|anda|carga)|error|falla|roto|pantalla azul|se cuelga|está lento/i.test(msg)) {
    return {
      intent: INTENT_TYPES.TECHNICAL_PROBLEM,
      confidence: 0.7,
      reasoning: 'Patrón de problema técnico detectado (fallback)',
      suggestedAction: 'start_diagnostic',
      requiresDiagnostic: true
    };
  }

  // Instalación
  if (/instalar|instalación|install|setup|configurar|conectar/i.test(msg)) {
    return {
      intent: INTENT_TYPES.INSTALLATION_HELP,
      confidence: 0.7,
      reasoning: 'Patrón de instalación detectado (fallback)',
      suggestedAction: 'provide_installation_guide',
      requiresDiagnostic: false
    };
  }

  // How-to
  if (/c[oó]mo|how\s+to|ayuda|guía/i.test(msg)) {
    return {
      intent: INTENT_TYPES.HOW_TO_QUESTION,
      confidence: 0.6,
      reasoning: 'Pregunta de procedimiento detectada (fallback)',
      suggestedAction: 'provide_how_to_guide',
      requiresDiagnostic: false
    };
  }

  return {
    intent: INTENT_TYPES.UNCLEAR,
    confidence: 0.3,
    reasoning: 'No se pudo clasificar con certeza (fallback)',
    suggestedAction: 'ask_clarification',
    requiresDiagnostic: false,
    clarificationNeeded: true
  };
}

export default {
  analyzeIntent,
  validateActionInContext,
  INTENT_TYPES,
  ACTION_CONTEXTS,
  detectOS,
  detectBrand,
  detectDeviceType
};
