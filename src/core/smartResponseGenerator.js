/**
 * 🎯 SMART RESPONSE GENERATOR - Generador inteligente de respuestas
 * 
 * Este módulo genera respuestas dinámicas basadas en la intención detectada
 * y el contexto de la conversación. NO usa respuestas hardcodeadas.
 * 
 * @author STI AI Team
 * @date 2025-12-06
 */

import { getOpenAIClient } from '../services/aiService.js';
import { INTENT_TYPES } from './intentEngine.js';

/**
 * 🧠 Genera una respuesta inteligente basada en intención y contexto
 * 
 * @param {Object} intentAnalysis - Resultado de analyzeIntent()
 * @param {string} userMessage - Mensaje original del usuario
 * @param {Object} conversationContext - Contexto completo
 * @param {string} locale - Idioma
 * @returns {Promise<Object>} - { reply, options, nextAction, reasoning }
 */
export async function generateSmartResponse(intentAnalysis, userMessage, conversationContext = {}, locale = 'es-AR') {
  const openai = getOpenAIClient();
  const isEnglish = locale.toLowerCase().startsWith('en');

  console.log('[SmartResponse] 🎯 Generando respuesta para intent:', intentAnalysis.intent);

  // Si OpenAI no está disponible, usar respuesta genérica
  if (!openai) {
    console.warn('[SmartResponse] ⚠️ OpenAI no disponible - usando respuesta genérica');
    return generateFallbackResponse(intentAnalysis, userMessage, isEnglish);
  }

  // Construir prompt basado en la intención
  const systemPrompt = buildResponseSystemPrompt(intentAnalysis.intent, isEnglish);
  const userPrompt = buildResponseUserPrompt(
    intentAnalysis,
    userMessage,
    conversationContext,
    isEnglish
  );

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const generatedReply = response.choices[0].message.content.trim();

    // Determinar opciones/botones basados en el intent
    const options = determineOptions(intentAnalysis, conversationContext, isEnglish);
    const nextAction = determineNextAction(intentAnalysis, conversationContext);

    console.log('[SmartResponse] ✅ Respuesta generada:', {
      replyLength: generatedReply.length,
      optionsCount: options.length,
      nextAction
    });

    return {
      reply: generatedReply,
      options,
      nextAction,
      reasoning: intentAnalysis.reasoning
    };

  } catch (error) {
    console.error('[SmartResponse] ❌ Error generando respuesta:', error.message);
    return generateFallbackResponse(intentAnalysis, userMessage, isEnglish);
  }
}

/**
 * 📋 Construye el system prompt para generar respuestas
 */
function buildResponseSystemPrompt(intent, isEnglish) {
  const basePersonality = isEnglish
    ? `You are Tecnos, an intelligent IT support assistant. You are helpful, empathetic, clear, and efficient.

**YOUR PRINCIPLES:**
- Always understand the user's TRUE need before acting
- Be concise but complete
- Use simple, friendly language
- Never offer solutions that don't apply to the context
- If unsure, ask for clarification
- Focus on solving the user's actual problem`
    : `Sos Tecnos, un asistente inteligente de soporte IT. Sos útil, empático, claro y eficiente.

**TUS PRINCIPIOS:**
- Siempre entendé la necesidad REAL del usuario antes de actuar
- Sé conciso pero completo
- Usá lenguaje simple y amigable
- Nunca ofrezcas soluciones que no aplican al contexto
- Si no estás seguro, pedí aclaración
- Enfocate en resolver el problema real del usuario`;

  // Agregar instrucciones específicas según el intent
  const intentSpecificPrompts = {
    [INTENT_TYPES.TECHNICAL_PROBLEM]: isEnglish
      ? `\n\n**FOR THIS INTENT (Technical Problem):**
- Show empathy for the user's frustration
- Ask clarifying questions if needed (what device, what exactly happens)
- Suggest logical diagnostic steps
- Don't jump to advanced solutions immediately`
      : `\n\n**PARA ESTA INTENCIÓN (Problema Técnico):**
- Mostrá empatía por la frustración del usuario
- Hacé preguntas aclaratorias si es necesario (qué dispositivo, qué pasa exactamente)
- Sugerí pasos de diagnóstico lógicos
- No saltes a soluciones avanzadas inmediatamente`,

    [INTENT_TYPES.INSTALLATION_HELP]: isEnglish
      ? `\n\n**FOR THIS INTENT (Installation Help):**
- Confirm what the user wants to install
- Ask about their operating system if not mentioned
- Provide clear, step-by-step guidance
- Offer to explain any technical terms
- This is NOT a problem - it's a learning/setup request`
      : `\n\n**PARA ESTA INTENCIÓN (Ayuda de Instalación):**
- Confirmá qué quiere instalar el usuario
- Preguntá sobre su sistema operativo si no lo mencionó
- Proporcioná guía clara, paso a paso
- Ofrecé explicar cualquier término técnico
- Esto NO es un problema - es una solicitud de aprendizaje/configuración`,

    [INTENT_TYPES.HOW_TO_QUESTION]: isEnglish
      ? `\n\n**FOR THIS INTENT (How-To Question):**
- Provide a clear, simple explanation
- Break down the steps if needed
- Be patient and educational
- This is about learning, not fixing a problem`
      : `\n\n**PARA ESTA INTENCIÓN (Pregunta de Procedimiento):**
- Proporcioná una explicación clara y simple
- Desglosá los pasos si es necesario
- Sé paciente y educativo
- Esto es sobre aprender, no arreglar un problema`,

    [INTENT_TYPES.UNCLEAR]: isEnglish
      ? `\n\n**FOR THIS INTENT (Unclear):**
- Politely ask the user to clarify what they need
- Offer examples of how they can rephrase
- Be friendly and encouraging
- Don't make assumptions`
      : `\n\n**PARA ESTA INTENCIÓN (No Clara):**
- Pedí amablemente al usuario que aclare qué necesita
- Ofrecé ejemplos de cómo puede reformular
- Sé amigable y alentador
- No hagas suposiciones`
  };

  return basePersonality + (intentSpecificPrompts[intent] || '');
}

/**
 * 📋 Construye el user prompt con todo el contexto
 */
function buildResponseUserPrompt(intentAnalysis, userMessage, context, isEnglish) {
  let prompt = isEnglish
    ? `**USER MESSAGE:** "${userMessage}"\n\n`
    : `**MENSAJE DEL USUARIO:** "${userMessage}"\n\n`;

  prompt += isEnglish
    ? `**DETECTED INTENT:** ${intentAnalysis.intent}\n`
    : `**INTENCIÓN DETECTADA:** ${intentAnalysis.intent}\n`;

  prompt += isEnglish
    ? `**CONFIDENCE:** ${intentAnalysis.confidence}\n`
    : `**CONFIANZA:** ${intentAnalysis.confidence}\n`;

  if (intentAnalysis.deviceType) {
    prompt += isEnglish
      ? `**DEVICE TYPE:** ${intentAnalysis.deviceType}\n`
      : `**TIPO DE DISPOSITIVO:** ${intentAnalysis.deviceType}\n`;
  }

  if (context.recentMessages && context.recentMessages.length > 0) {
    prompt += isEnglish
      ? `\n**RECENT CONVERSATION:**\n`
      : `\n**CONVERSACIÓN RECIENTE:**\n`;
    
    context.recentMessages.slice(-3).forEach((msg, idx) => {
      const speaker = msg.who === 'bot' ? 'Tecnos' : 'Usuario';
      prompt += `${speaker}: ${msg.text.substring(0, 150)}\n`;
    });
  }

  if (context.hasAttemptedBasicTests) {
    prompt += isEnglish
      ? `\n**NOTE:** User already tried basic diagnostic steps.\n`
      : `\n**NOTA:** El usuario ya intentó pasos básicos de diagnóstico.\n`;
  }

  prompt += isEnglish
    ? `\n**TASK:** Generate a helpful, contextually appropriate response. Be empathetic and clear. ${intentAnalysis.clarificationNeeded ? 'Ask for clarification.' : 'Provide actionable guidance.'}`
    : `\n**TAREA:** Generá una respuesta útil y contextualmente apropiada. Sé empático y claro. ${intentAnalysis.clarificationNeeded ? 'Pedí aclaración.' : 'Proporcioná guía accionable.'}`;

  return prompt;
}

/**
 * 🎯 Determina qué botones/opciones mostrar basado en el intent
 */
function determineOptions(intentAnalysis, context, isEnglish) {
  const options = [];

  switch (intentAnalysis.intent) {
    case INTENT_TYPES.TECHNICAL_PROBLEM:
    case INTENT_TYPES.PERFORMANCE_ISSUE:
    case INTENT_TYPES.CONNECTION_PROBLEM:
      // Solo ofrecer diagnóstico si es coherente
      if (intentAnalysis.requiresDiagnostic) {
        options.push({
          text: isEnglish ? '🔧 Start Diagnostic' : '🔧 Empezar Diagnóstico',
          value: 'BTN_START_DIAGNOSTIC',
          description: isEnglish ? 'I\'ll guide you step by step' : 'Te guío paso a paso'
        });
      }
      
      // Solo ofrecer pruebas avanzadas si ya intentó básicas
      if (context.hasAttemptedBasicTests) {
        options.push({
          text: isEnglish ? '🔬 Try Advanced Tests' : '🔬 Probar Pruebas Avanzadas',
          value: 'BTN_ADVANCED_TESTS',
          description: isEnglish ? 'More specific diagnostics' : 'Diagnósticos más específicos'
        });
      }
      
      options.push({
        text: isEnglish ? '👨‍💻 Connect with Technician' : '👨‍💻 Conectar con Técnico',
        value: 'BTN_CONNECT_TECH',
        description: isEnglish ? 'Human assistance' : 'Asistencia humana'
      });
      break;

    case INTENT_TYPES.INSTALLATION_HELP:
    case INTENT_TYPES.CONFIGURATION_HELP:
      options.push({
        text: isEnglish ? '📖 Show Step-by-Step Guide' : '📖 Mostrar Guía Paso a Paso',
        value: 'BTN_SHOW_GUIDE',
        description: isEnglish ? 'Detailed instructions' : 'Instrucciones detalladas'
      });
      options.push({
        text: isEnglish ? '❓ I have questions' : '❓ Tengo preguntas',
        value: 'BTN_ASK_QUESTION',
        description: isEnglish ? 'Ask about the process' : 'Preguntá sobre el proceso'
      });
      break;

    case INTENT_TYPES.HOW_TO_QUESTION:
      options.push({
        text: isEnglish ? '👍 I understand' : '👍 Entendí',
        value: 'BTN_UNDERSTOOD',
        description: isEnglish ? 'It was clear' : 'Fue claro'
      });
      options.push({
        text: isEnglish ? '🔄 Explain again' : '🔄 Explicá de nuevo',
        value: 'BTN_EXPLAIN_AGAIN',
        description: isEnglish ? 'I need more details' : 'Necesito más detalles'
      });
      break;

    case INTENT_TYPES.UNCLEAR:
      // No ofrecer botones si no entendimos - dejar que el usuario escriba
      break;
  }

  // Siempre ofrecer cerrar como última opción
  options.push({
    text: isEnglish ? '🚪 Close Chat' : '🚪 Cerrar Chat',
    value: 'BTN_CLOSE',
    description: isEnglish ? 'End conversation' : 'Terminar conversación'
  });

  return options;
}

/**
 * 🎯 Determina la próxima acción lógica del flujo
 */
function determineNextAction(intentAnalysis, context) {
  const actionMap = {
    [INTENT_TYPES.TECHNICAL_PROBLEM]: 'await_diagnostic_confirmation',
    [INTENT_TYPES.INSTALLATION_HELP]: 'gather_installation_details',
    [INTENT_TYPES.CONFIGURATION_HELP]: 'gather_configuration_details',
    [INTENT_TYPES.HOW_TO_QUESTION]: 'provide_explanation',
    [INTENT_TYPES.INFORMATION_REQUEST]: 'provide_information',
    [INTENT_TYPES.ESCALATION_REQUEST]: 'create_ticket',
    [INTENT_TYPES.FEEDBACK]: 'acknowledge_feedback',
    [INTENT_TYPES.CLOSE_CHAT]: 'end_conversation',
    [INTENT_TYPES.UNCLEAR]: 'await_clarification'
  };

  return actionMap[intentAnalysis.intent] || 'await_user_response';
}

/**
 * 🔄 Respuesta fallback sin OpenAI
 */
function generateFallbackResponse(intentAnalysis, userMessage, isEnglish) {
  const responses = {
    [INTENT_TYPES.TECHNICAL_PROBLEM]: isEnglish
      ? 'I understand you\'re having a technical issue. Let me help you diagnose it. Can you tell me more about what exactly is happening?'
      : 'Entiendo que tenés un problema técnico. Déjame ayudarte a diagnosticarlo. ¿Podés contarme más sobre qué está pasando exactamente?',
    
    [INTENT_TYPES.INSTALLATION_HELP]: isEnglish
      ? 'I can help you with the installation. What operating system are you using?'
      : 'Puedo ayudarte con la instalación. ¿Qué sistema operativo estás usando?',
    
    [INTENT_TYPES.UNCLEAR]: isEnglish
      ? 'I want to help you, but I need a bit more information. Could you rephrase what you need? For example: "I want to install...", "My computer won\'t...", or "How do I..."'
      : 'Quiero ayudarte, pero necesito un poco más de información. ¿Podrías reformular qué necesitás? Por ejemplo: "Quiero instalar...", "Mi computadora no...", o "Cómo hago para..."'
  };

  return {
    reply: responses[intentAnalysis.intent] || responses[INTENT_TYPES.UNCLEAR],
    options: determineOptions(intentAnalysis, {}, isEnglish),
    nextAction: determineNextAction(intentAnalysis, {}),
    reasoning: 'Fallback response (OpenAI unavailable)'
  };
}

export default {
  generateSmartResponse
};
