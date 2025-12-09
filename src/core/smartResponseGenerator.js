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
  console.log('[SmartResponse] 🔍 isAuxiliaryResponse:', intentAnalysis.isAuxiliaryResponse);
  console.log('[SmartResponse] 🔍 activeIntent:', conversationContext.activeIntent?.type);

  // ✅ HANDLER ESPECIAL: Respuesta auxiliar con intención activa
  if (intentAnalysis.isAuxiliaryResponse && conversationContext.activeIntent) {
    console.log('[SmartResponse] 🎯 Respuesta auxiliar detectada - usando handler específico');
    return handleAuxiliaryResponse(intentAnalysis, userMessage, conversationContext, locale);
  }

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
 * 🎯 Handler específico para respuestas auxiliares con intención activa
 * Evita recalcular y genera respuesta directa basada en el contexto
 */
async function handleAuxiliaryResponse(intentAnalysis, userMessage, conversationContext, locale) {
  const openai = getOpenAIClient();
  const isEnglish = locale.toLowerCase().startsWith('en');
  const activeIntent = conversationContext.activeIntent;
  
  console.log('[SmartResponse] 🔄 Procesando respuesta auxiliar para:', activeIntent.type);
  console.log('[SmartResponse] 📝 Dato auxiliar:', intentAnalysis.auxiliaryData);
  
  // ✅ CASO ESPECÍFICO: INSTALLATION_HELP
  if (activeIntent.type === INTENT_TYPES.INSTALLATION_HELP) {
    return handleInstallationWithOS(
      activeIntent.originalMessage,
      intentAnalysis.auxiliaryData,
      conversationContext,
      isEnglish,
      openai
    );
  }
  
  // ✅ CASO ESPECÍFICO: TECHNICAL_PROBLEM
  if (activeIntent.type === INTENT_TYPES.TECHNICAL_PROBLEM) {
    return handleTechnicalProblemWithDevice(
      activeIntent.originalMessage,
      intentAnalysis.auxiliaryData,
      conversationContext,
      isEnglish,
      openai
    );
  }
  
  // ✅ CASO ESPECÍFICO: HOW_TO_QUESTION
  if (activeIntent.type === INTENT_TYPES.HOW_TO_QUESTION) {
    return handleHowToWithDetails(
      activeIntent.originalMessage,
      intentAnalysis.auxiliaryData,
      conversationContext,
      isEnglish,
      openai
    );
  }
  
  // Fallback: usar flujo normal si no hay handler específico
  console.log('[SmartResponse] ⚠️ No hay handler específico para:', activeIntent.type);
  
  // Construir prompt enriquecido con contexto activo
  const systemPrompt = buildResponseSystemPrompt(activeIntent.type, isEnglish);
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
    const options = determineOptions(intentAnalysis, conversationContext, isEnglish);
    const nextAction = determineNextAction(intentAnalysis, conversationContext);

    return {
      reply: generatedReply,
      options,
      nextAction,
      reasoning: intentAnalysis.reasoning
    };
  } catch (error) {
    console.error('[SmartResponse] ❌ Error en fallback:', error.message);
    return generateFallbackResponse(intentAnalysis, userMessage, isEnglish);
  }
}

/**
 * 📦 Handler para instalación con sistema operativo conocido
 */
async function handleInstallationWithOS(originalRequest, osInfo, context, isEnglish, openai) {
  console.log('[SmartResponse] 📦 Generando guía de instalación para:', osInfo);
  
  const systemPrompt = isEnglish
    ? `You are Tecnos, an IT support assistant. The user wants to install software and just provided their operating system.

**YOUR TASK:**
- Provide SPECIFIC, step-by-step installation instructions
- Use the exact OS they mentioned (${osInfo})
- Be direct and actionable
- Include download links if applicable
- DO NOT ask what they want to install - they already told you
- DO NOT ask for their OS again - they just provided it`

    : `Sos Tecnos, el asistente de STI — Servicio Técnico Inteligente.

**ESTILO OBLIGATORIO:**
1) Usá tono argentino con voseo: vos, necesitás, podés, tenés
2) Sé breve y directo: máximo 130 palabras
3) Usá pasos numerados (1, 2, 3…), NO emojis numeradores
4) Usá entre 1 y 3 emojis como mucho, sin saturar
5) NO repreguntes NADA: ya sabés qué instalar ("${originalRequest}") y qué SO usa ("${osInfo}")
6) Generá instrucciones específicas para ${osInfo}
7) Si el software es conocido (AnyDesk, Office, Zoom, WhatsApp, Chrome, etc.), incluí el link oficial de descarga
8) Cerrá SIEMPRE con: "— Soy Tecnos, de STI — Servicio Técnico Inteligente 🛠️"

**TU TAREA:**
Proporcionar pasos claros de instalación para "${originalRequest}" en ${osInfo}, siguiendo exactamente este estilo.`;

  const userPrompt = isEnglish
    ? `**ORIGINAL REQUEST:** "${originalRequest}"
**OPERATING SYSTEM PROVIDED:** ${osInfo}

${context.operatingSystem ? `**OS CONFIRMED:** ${context.operatingSystem}\n` : ''}

Generate complete installation instructions for this request on ${osInfo}.`

    : `**SOLICITUD ORIGINAL:** "${originalRequest}"
**SISTEMA OPERATIVO PROPORCIONADO:** ${osInfo}

${context.operatingSystem ? `**SO CONFIRMADO:** ${context.operatingSystem}\n` : ''}

Generá una guía de instalación clara, siguiendo exactamente este estilo y sin repreguntar.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const reply = response.choices[0].message.content.trim();

    return {
      reply: reply + '\n\n— Tecnos de STI 🛠️',
      options: [{
        text: isEnglish ? '✅ It worked!' : '✅ ¡Funcionó!',
        value: 'BTN_SUCCESS',
        description: isEnglish ? 'Installation successful' : 'Instalación exitosa'
      }, {
        text: isEnglish ? '❓ I need help' : '❓ Necesito ayuda',
        value: 'BTN_NEED_HELP',
        description: isEnglish ? 'I have questions' : 'Tengo preguntas'
      }],
      nextAction: 'await_installation_feedback',
      reasoning: `Installation guide generated for ${osInfo}`
    };
  } catch (error) {
    console.error('[SmartResponse] ❌ Error en handleInstallationWithOS:', error);
    return openAIFallback('installation', { os: osInfo, originalMessage: originalRequest }, isEnglish);
  }
}

/**
 * 🔧 Handler para problema técnico con información de dispositivo
 */
async function handleTechnicalProblemWithDevice(originalProblem, deviceInfo, context, isEnglish, openai) {
  console.log('[SmartResponse] 🔧 Generando diagnóstico para:', deviceInfo);
  
  const systemPrompt = isEnglish
    ? `You are Tecnos, an IT support assistant. The user has a technical problem and just provided device information.

**YOUR TASK:**
- Provide SPECIFIC troubleshooting steps for this device type
- Be systematic and clear
- Start with the most likely solutions
- DO NOT ask what the problem is - they already told you
- DO NOT ask for device type again - they just provided it`

    : `Sos Tecnos, el asistente de STI — Servicio Técnico Inteligente. El usuario tiene un problema y te dio info de su dispositivo: ${deviceInfo}.

**TU ESTILO:**
- Hablá en argentino: vos, necesitás, podés, tenés.
- Sé empático pero práctico.
- Usá 1-2 emojis (🔧 ⚙️ ✅).
- Pasos claros, numerados.

**TU TAREA:**
- Dar pasos ESPECÍFICOS para ${deviceInfo}.
- Empezar por lo más probable.
- NO preguntar cuál es el problema — ya te lo contó.
- NO volver a preguntar el dispositivo — ya lo tenés.
- Si es tema de drivers, sonido o WiFi, mencioná descargar desde el sitio del fabricante.`;

  const userPrompt = isEnglish
    ? `**ORIGINAL PROBLEM:** "${originalProblem}"
**DEVICE INFO PROVIDED:** ${deviceInfo}

${context.device ? `**DEVICE CONFIRMED:** ${context.device}\n` : ''}
${context.deviceBrand ? `**BRAND:** ${context.deviceBrand}\n` : ''}

Generate specific troubleshooting steps for this problem on this device.`

    : `**PROBLEMA ORIGINAL:** "${originalProblem}"
**INFO DE DISPOSITIVO PROPORCIONADA:** ${deviceInfo}

${context.device ? `**DISPOSITIVO CONFIRMADO:** ${context.device}\n` : ''}
${context.deviceBrand ? `**MARCA:** ${context.deviceBrand}\n` : ''}

Generá pasos específicos de diagnóstico para este problema en este dispositivo.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const reply = response.choices[0].message.content.trim();

    return {
      reply,
      options: [{
        text: isEnglish ? '✅ It worked!' : '✅ ¡Funcionó!',
        value: 'BTN_PROBLEM_SOLVED',
        description: isEnglish ? 'Problem resolved' : 'Problema resuelto'
      }, {
        text: isEnglish ? '❌ Still not working' : '❌ Sigue sin funcionar',
        value: 'BTN_STILL_BROKEN',
        description: isEnglish ? 'Need more help' : 'Necesito más ayuda'
      }],
      nextAction: 'await_diagnostic_result',
      reasoning: `Diagnostic steps generated for ${deviceInfo}`
    };
  } catch (error) {
    console.error('[SmartResponse] ❌ Error en handleTechnicalProblemWithDevice:', error);
    return openAIFallback('diagnostic', { device: deviceInfo, brand: context.deviceBrand, originalMessage: originalProblem }, isEnglish);
  }
}

/**
 * 📚 Handler para pregunta how-to con detalles adicionales
 */
async function handleHowToWithDetails(originalQuestion, details, context, isEnglish, openai) {
  console.log('[SmartResponse] 📚 Generando guía how-to con detalles:', details);
  
  const systemPrompt = isEnglish
    ? `You are Tecnos, an IT support assistant. The user asked a how-to question and provided additional details.

**YOUR TASK:**
- Provide a CLEAR, step-by-step answer
- Use the additional context they provided (${details})
- Be educational and patient
- Include screenshots descriptions if helpful
- DO NOT ask what they want to know - they already asked`

    : `Sos Tecnos, el asistente de STI — Servicio Técnico Inteligente. El usuario te preguntó algo y acaba de darte más info: ${details}.

**TU ESTILO:**
- Hablá en argentino: vos, necesitás, podés, tenés.
- Sé educativo, paciente y claro.
- Usá 1-2 emojis (📚 ✅).
- Pasos simples, numerados.

**TU TAREA:**
- Responder CLARO, paso a paso.
- Usar ${details} que te dio.
- NO preguntar qué quiere saber — ya te lo preguntó.
- Si es Office, WiFi o drivers, da guía completa.`;

  const userPrompt = isEnglish
    ? `**ORIGINAL QUESTION:** "${originalQuestion}"
**ADDITIONAL DETAILS:** ${details}

${context.operatingSystem ? `**OS:** ${context.operatingSystem}\n` : ''}
${context.device ? `**DEVICE:** ${context.device}\n` : ''}

Provide a complete, clear answer with step-by-step instructions.`

    : `**PREGUNTA ORIGINAL:** "${originalQuestion}"
**DETALLES ADICIONALES:** ${details}

${context.operatingSystem ? `**SO:** ${context.operatingSystem}\n` : ''}
${context.device ? `**DISPOSITIVO:** ${context.device}\n` : ''}

Proporcioná una respuesta completa y clara con instrucciones paso a paso.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const reply = response.choices[0].message.content.trim();

    return {
      reply,
      options: [{
        text: isEnglish ? '👍 Got it!' : '👍 ¡Entendido!',
        value: 'BTN_UNDERSTOOD',
        description: isEnglish ? 'Clear explanation' : 'Explicación clara'
      }, {
        text: isEnglish ? '❓ Still confused' : '❓ Sigo con dudas',
        value: 'BTN_NEED_MORE_HELP',
        description: isEnglish ? 'Need clarification' : 'Necesito aclaración'
      }],
      nextAction: 'await_how_to_feedback',
      reasoning: `How-to guide generated with details: ${details}`
    };
  } catch (error) {
    console.error('[SmartResponse] ❌ Error en handleHowToWithDetails:', error);
    return openAIFallback('howto', { os: context.operatingSystem, originalMessage: originalQuestion, details }, isEnglish);
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
    : `Sos Tecnos, el asistente inteligente de STI — Servicio Técnico Inteligente. Sos útil, empático, claro y profesional.

**TU ESTILO:**
- Hablá en argentino: vos, necesitás, podés, tenés.
- Sé conciso, claro y amable.
- Usá 1-3 emojis discretos máximo.
- Si corresponde, recordá: "Soy Tecnos de STI."

**TUS PRINCIPIOS:**
- Entendé la necesidad REAL antes de actuar
- Usá contexto disponible (OS, dispositivo, marca)
- Nunca ofrezcas soluciones que no aplican
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
- No hagas suposiciones`,

    [INTENT_TYPES.ESCALATION_REQUEST]: isEnglish
      ? `\n\n**FOR THIS INTENT (Escalation to Human):**
- Acknowledge their request immediately
- Offer WhatsApp connection with conversation history
- Keep response SHORT and direct (max 2 sentences)
- Be warm and reassuring
- Explain that the technician will receive full context`
      : `\n\n**PARA ESTA INTENCIÓN (Derivación a Humano):**
- Reconocé su solicitud inmediatamente
- Ofrecé conexión por WhatsApp con historial de conversación
- Mantené la respuesta CORTA y directa (máx 2 oraciones)
- Sé cálido y tranquilizador
- Explicá que el técnico recibirá el contexto completo`
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
  
  if (intentAnalysis.topic) {
    prompt += isEnglish
      ? `**TOPIC:** ${intentAnalysis.topic} (office/drivers/wifi/software)\n`
      : `**TEMA:** ${intentAnalysis.topic} (office/drivers/wifi/software)\n`;
  }
  
  if (context.operatingSystem) {
    prompt += isEnglish
      ? `**OS:** ${context.operatingSystem}\n`
      : `**SISTEMA OPERATIVO:** ${context.operatingSystem}\n`;
  }
  
  if (context.deviceBrand) {
    prompt += isEnglish
      ? `**BRAND:** ${context.deviceBrand}\n`
      : `**MARCA:** ${context.deviceBrand}\n`;
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
  
  // ✅ AGREGAR CONTEXTO DE INTENCIÓN ACTIVA si hay respuesta auxiliar
  if (context.activeIntent && intentAnalysis.isAuxiliaryResponse) {
    prompt += isEnglish
      ? `\n**🎯 ACTIVE INTENT CONTEXT:**\n`
      : `\n**🎯 CONTEXTO DE INTENCIÓN ACTIVA:**\n`;
    
    prompt += isEnglish
      ? `- Original request: "${context.activeIntent.originalMessage}"\n`
      : `- Solicitud original: "${context.activeIntent.originalMessage}"\n`;
    
    prompt += isEnglish
      ? `- User just provided: "${userMessage}" (auxiliary/clarifying response)\n`
      : `- Usuario acaba de proporcionar: "${userMessage}" (respuesta auxiliar/aclaratoria)\n`;
    
    prompt += isEnglish
      ? `- Intent type: ${context.activeIntent.type}\n`
      : `- Tipo de intención: ${context.activeIntent.type}\n`;
    
    // Agregar información adicional capturada
    if (context.operatingSystem) {
      prompt += isEnglish
        ? `- Operating System: ${context.operatingSystem}\n`
        : `- Sistema Operativo: ${context.operatingSystem}\n`;
    }
    
    if (context.device) {
      prompt += isEnglish
        ? `- Device: ${context.device}\n`
        : `- Dispositivo: ${context.device}\n`;
    }
    
    if (context.deviceBrand) {
      prompt += isEnglish
        ? `- Brand: ${context.deviceBrand}\n`
        : `- Marca: ${context.deviceBrand}\n`;
    }
    
    prompt += isEnglish
      ? `\n**CRITICAL TASK:** Continue with the ${context.activeIntent.type} flow using this new information. Provide the NEXT logical step based on what the user just told you. DO NOT ask for information they already provided.\n`
      : `\n**TAREA CRÍTICA:** Continuar con el flujo de ${context.activeIntent.type} usando esta nueva información. Proporcionar el SIGUIENTE paso lógico basado en lo que el usuario acaba de decir. NO pedir información que ya proporcionó.\n`;
  } else {
    prompt += isEnglish
      ? `\n**TASK:** Generate a helpful, contextually appropriate response. Be empathetic and clear. ${intentAnalysis.clarificationNeeded ? 'Ask for clarification.' : 'Provide actionable guidance.'}`
      : `\n**TAREA:** Generá una respuesta útil y contextualmente apropiada. Sé empático y claro. ${intentAnalysis.clarificationNeeded ? 'Pedí aclaración.' : 'Proporcioná guía accionable.'}`;
  }

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

    case INTENT_TYPES.ESCALATION_REQUEST:
      // Ofrecer WhatsApp con historial completo
      options.push({
        text: isEnglish ? '💚 Talk to a technician on WhatsApp' : '💚 Hablar con un técnico por WhatsApp',
        value: 'BTN_WHATSAPP_TECNICO',
        description: isEnglish ? 'Send conversation history' : 'Enviar historial de conversación',
        style: 'primary'
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
    
    [INTENT_TYPES.ESCALATION_REQUEST]: isEnglish
      ? 'Perfect! I can connect you with a human technician from STI via WhatsApp 👨‍💻. Click the green button and the conversation history will be sent automatically so you don\'t have to explain everything again.'
      : 'Perfecto, te puedo derivar con un técnico humano de STI por WhatsApp para seguir con este caso 👨‍💻. Hacé clic en el botón verde y se envía el historial de esta conversación, así no tenés que explicar todo de nuevo.',
    
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

/**
 * 🆘 Fallback centralizado para cuando OpenAI falla o devuelve basura
 */
function openAIFallback(actionType, context, isEnglish) {
  const { os, device, brand, originalMessage } = context;
  
  let reply = '';
  let steps = [];
  
  if (actionType === 'installation') {
    if (isEnglish) {
      reply = `I want to help you install what you need${os ? ` on ${os}` : ''}. `;
      steps = [
        '1. Go to the official software website',
        '2. Download the installer for your OS',
        '3. Run the installer and follow the wizard'
      ];
    } else {
      reply = `Quiero ayudarte a instalar lo que necesitás${os ? ` en ${os}` : ''}. `;
      steps = [
        '1️⃣ Andá al sitio oficial del software',
        '2️⃣ Descargá el instalador para tu sistema',
        '3️⃣ Ejecutalo y seguí el asistente'
      ];
    }
  } else if (actionType === 'diagnostic') {
    if (isEnglish) {
      reply = `Let me help you diagnose the issue${device ? ` with your ${device}` : ''}. `;
      steps = [
        '1. Restart the device',
        '2. Check all cables are connected',
        '3. Look for error messages or unusual behavior'
      ];
    } else {
      reply = `Dejame ayudarte a diagnosticar el problema${device ? ` con tu ${device}` : ''}. `;
      steps = [
        '1️⃣ Reiniciá el equipo',
        '2️⃣ Verificá que todos los cables estén conectados',
        '3️⃣ Fijate si hay mensajes de error'
      ];
    }
  } else if (actionType === 'howto') {
    if (isEnglish) {
      reply = `I'll explain how to do it${os ? ` on ${os}` : ''}. `;
      steps = [
        '1. Open the relevant settings or control panel',
        '2. Look for the option you need',
        '3. Follow the on-screen instructions'
      ];
    } else {
      reply = `Te explico cómo hacerlo${os ? ` en ${os}` : ''}. `;
      steps = [
        '1️⃣ Abrí la configuración correspondiente',
        '2️⃣ Buscá la opción que necesitás',
        '3️⃣ Seguí las instrucciones en pantalla'
      ];
    }
  }
  
  reply += '\n\n' + steps.join('\n');
  reply += isEnglish
    ? '\n\nIf you need more specific help, I can connect you with a technician.'
    : '\n\nSi necesitás ayuda más específica, puedo conectarte con un técnico. 👨‍💻';
  
  return {
    reply,
    options: [{
      text: isEnglish ? '🔄 Try again' : '🔄 Intentar de nuevo',
      value: 'BTN_RETRY'
    }, {
      text: isEnglish ? '👨‍💻 Talk to technician' : '👨‍💻 Hablar con técnico',
      value: 'BTN_CONNECT_TECH'
    }],
    nextAction: 'await_retry_or_escalate',
    reasoning: 'Fallback - OpenAI unavailable or error'
  };
}

/**
 * 🔄 Fallback responses cuando OpenAI falla
 */
function generateFallbackInstallationResponse(request, os, isEnglish) {
  const reply = isEnglish
    ? `I'll help you install what you need on ${os}. To give you precise instructions, I need OpenAI to be available. Please try again in a moment, or I can connect you with a human technician.`
    : `Te ayudo a instalar lo que necesitás en ${os}. Para darte instrucciones precisas, necesito que OpenAI esté disponible. Probá de nuevo en un momento, o puedo conectarte con un técnico humano.`;

  return {
    reply,
    options: [{
      text: isEnglish ? '🔄 Try again' : '🔄 Intentar de nuevo',
      value: 'BTN_RETRY'
    }, {
      text: isEnglish ? '👨\u200d💻 Human help' : '👨\u200d💻 Ayuda humana',
      value: 'BTN_CONNECT_TECH'
    }],
    nextAction: 'await_retry_or_escalate',
    reasoning: 'Fallback - OpenAI unavailable'
  };
}

function generateFallbackDiagnosticResponse(problem, device, isEnglish) {
  const reply = isEnglish
    ? `I understand you have an issue with your ${device}. To provide specific diagnostic steps, I need OpenAI to be available. Would you like to wait a moment or connect with a technician?`
    : `Entiendo que tenés un problema con tu ${device}. Para proporcionar pasos específicos de diagnóstico, necesito que OpenAI esté disponible. ¿Querés esperar un momento o conectar con un técnico?`;

  return {
    reply,
    options: [{
      text: isEnglish ? '🔄 Try again' : '🔄 Intentar de nuevo',
      value: 'BTN_RETRY'
    }, {
      text: isEnglish ? '👨\u200d💻 Human help' : '👨\u200d💻 Ayuda humana',
      value: 'BTN_CONNECT_TECH'
    }],
    nextAction: 'await_retry_or_escalate',
    reasoning: 'Fallback - OpenAI unavailable'
  };
}

function generateFallbackHowToResponse(question, details, isEnglish) {
  const reply = isEnglish
    ? `I want to answer your question about "${question}" with the details you provided. However, I need OpenAI to generate a clear explanation. Try again in a moment?`
    : `Quiero responder tu pregunta sobre "${question}" con los detalles que me diste. Sin embargo, necesito OpenAI para generar una explicación clara. ¿Probás de nuevo en un momento?`;

  return {
    reply,
    options: [{
      text: isEnglish ? '🔄 Try again' : '🔄 Intentar de nuevo',
      value: 'BTN_RETRY'
    }],
    nextAction: 'await_retry',
    reasoning: 'Fallback - OpenAI unavailable'
  };
}

export default {
  generateSmartResponse
};
