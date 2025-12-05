/**
 * CONVERSATION ORCHESTRATOR - Cerebro del Chat Tecnos
 * 
 * Este módulo es el ÚNICO lugar donde se toman decisiones conversacionales.
 * Procesa entrada del usuario → consulta FLOW → devuelve respuesta completa.
 * 
 * GARANTÍA DE COMPATIBILIDAD:
 * - NUNCA modifica rutas Express
 * - NUNCA modifica formato JSON response
 * - NUNCA modifica nombres de estados
 * - NUNCA toca ticketing, WhatsApp, seguridad
 * - Retrocompatible 100% con código legacy
 */

import { FLOW, STAGES, BUTTON_ACTIONS, getStageHandler, isValidStage } from '../flows/flowDefinition.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ORCHESTRATE TURN
 * 
 * Función principal: decide todo en una conversación
 * 
 * @param {Object} params
 * @param {Object} params.session - Sesión actual del usuario
 * @param {String} params.userMessage - Texto del usuario (normalizado)
 * @param {String} params.buttonToken - Token de botón presionado (BTN_*)
 * @param {Array} params.images - Array de imágenes subidas
 * @param {Object} params.smartAnalysis - Análisis de OpenAI (SMART_MODE)
 * 
 * @returns {Object} Response completa con todos los campos esperados
 */
export async function orchestrateTurn({
  session,
  userMessage = '',
  buttonToken = null,
  images = [],
  smartAnalysis = null
}) {
  try {
    console.log('[ORCHESTRATOR] Starting turn for session:', session.sid);
    console.log('[ORCHESTRATOR] Current stage:', session.stage);
    console.log('[ORCHESTRATOR] User message:', userMessage?.substring(0, 50));
    console.log('[ORCHESTRATOR] Button token:', buttonToken);
    
    // ========================================
    // 1. VALIDAR STAGE ACTUAL
    // ========================================
    const currentStage = session.stage || STAGES.ASK_LANGUAGE;
    
    if (!isValidStage(currentStage)) {
      console.error('[ORCHESTRATOR] Invalid stage:', currentStage);
      return createErrorResponse(session, 'Invalid conversation stage');
    }
    
    // ========================================
    // 2. PROCESAR IMÁGENES (Vision API)
    // ========================================
    let imageAnalysis = null;
    if (images && images.length > 0) {
      console.log('[ORCHESTRATOR] Processing', images.length, 'images');
      imageAnalysis = await processImagesWithVision(images, session);
      
      // Vision API puede cambiar el flujo
      const imageHandler = getStageHandler(currentStage, 'onImage');
      if (imageHandler) {
        const imageResult = imageHandler({ imageAnalysis, session });
        if (imageResult && imageResult.nextStage) {
          console.log('[ORCHESTRATOR] Image changed flow to:', imageResult.nextStage);
          return await buildResponse(session, imageResult, imageAnalysis);
        }
      }
    }
    
    // ========================================
    // 3. DETERMINAR TIPO DE ENTRADA
    // ========================================
    let flowResult = null;
    
    // 3a. Botón presionado
    if (buttonToken) {
      console.log('[ORCHESTRATOR] Processing button:', buttonToken);
      const buttonHandler = getStageHandler(currentStage, 'onButton');
      
      if (buttonHandler) {
        flowResult = buttonHandler({ token: buttonToken, session, smartAnalysis });
      } else {
        console.warn('[ORCHESTRATOR] No button handler for stage:', currentStage);
        flowResult = { action: 'UNKNOWN_BUTTON', nextStage: currentStage };
      }
    }
    
    // 3b. Texto del usuario
    else if (userMessage) {
      console.log('[ORCHESTRATOR] Processing text message');
      const textHandler = getStageHandler(currentStage, 'onText');
      
      if (textHandler) {
        flowResult = textHandler({ 
          text: userMessage, 
          session, 
          smartAnalysis, 
          imageAnalysis 
        });
      } else {
        console.warn('[ORCHESTRATOR] No text handler for stage:', currentStage);
        flowResult = { action: 'NO_HANDLER', nextStage: currentStage };
      }
    }
    
    // 3c. Sin entrada válida
    else {
      console.warn('[ORCHESTRATOR] No valid input (text or button)');
      return createErrorResponse(session, 'No input provided');
    }
    
    // ========================================
    // 4. CONSTRUIR RESPUESTA
    // ========================================
    console.log('[ORCHESTRATOR] Flow result action:', flowResult?.action);
    console.log('[ORCHESTRATOR] Next stage:', flowResult?.nextStage);
    
    return await buildResponse(session, flowResult, imageAnalysis, smartAnalysis);
    
  } catch (error) {
    console.error('[ORCHESTRATOR] Error in orchestrateTurn:', error);
    console.error('[ORCHESTRATOR] Stack:', error.stack);
    return createErrorResponse(session, 'Internal orchestrator error');
  }
}

/**
 * BUILD RESPONSE
 * 
 * Construye el objeto de respuesta completo con todos los campos
 * que el frontend actual espera (formato legacy)
 */
async function buildResponse(session, flowResult, imageAnalysis = null, smartAnalysis = null) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.toLowerCase().startsWith('en');
  
  // ========================================
  // 1. DETERMINAR SIGUIENTE STAGE
  // ========================================
  const nextStage = flowResult.nextStage || session.stage;
  
  // ========================================
  // 2. ACTUALIZAR SESIÓN
  // ========================================
  const updatedSession = { ...session };
  updatedSession.stage = nextStage;
  
  // Actualizar campos según acción
  if (flowResult.locale) updatedSession.userLocale = flowResult.locale;
  if (flowResult.userName !== undefined) updatedSession.userName = flowResult.userName;
  if (flowResult.device) updatedSession.device = flowResult.device;
  if (flowResult.problem) updatedSession.problem = flowResult.problem;
  if (flowResult.needType) updatedSession.needType = flowResult.needType;
  if (flowResult.gdprConsent !== undefined) updatedSession.gdprConsent = flowResult.gdprConsent;
  if (flowResult.gdprConsentDate) updatedSession.gdprConsentDate = flowResult.gdprConsentDate;
  
  // ========================================
  // 3. GENERAR REPLY
  // ========================================
  let reply = '';
  
  // Reply desde flowResult
  if (flowResult.reply) {
    if (typeof flowResult.reply === 'string') {
      reply = flowResult.reply;
    } else if (typeof flowResult.reply === 'object') {
      // Multi-locale reply
      reply = flowResult.reply[locale] || flowResult.reply['es-AR'] || '';
    }
  }
  
  // Reply según acción
  else {
    reply = await generateReplyForAction(flowResult.action, updatedSession, locale);
  }
  
  // ========================================
  // 4. GENERAR BOTONES
  // ========================================
  const buttons = await generateButtons(flowResult, updatedSession, locale);
  
  // ========================================
  // 5. GENERAR STEPS (si aplica)
  // ========================================
  let steps = null;
  if (flowResult.action === 'GENERATE_DIAGNOSTIC') {
    steps = await generateDiagnosticSteps(updatedSession, smartAnalysis);
  } else if (flowResult.action === 'REQUEST_ADVANCED_TESTS') {
    steps = await generateAdvancedTests(updatedSession, smartAnalysis);
  } else if (flowResult.action === 'CREATE_HOWTO_GUIDE') {
    steps = await generateHowtoGuide(updatedSession, smartAnalysis);
  }
  
  // ========================================
  // 6. DETERMINAR FLAGS
  // ========================================
  const endConversation = flowResult.action === 'END_CONVERSATION' || 
                          flowResult.action === 'PROBLEM_SOLVED' ||
                          nextStage === STAGES.ENDED;
  
  const allowWhatsapp = nextStage === STAGES.CREATE_TICKET || 
                       nextStage === STAGES.TICKET_SENT ||
                       updatedSession.waEligible === true;
  
  // ========================================
  // 7. CONSTRUIR UI OBJECT
  // ========================================
  const ui = {
    buttons: buttons || [],
    progressBar: calculateProgressBar(nextStage),
    canUploadImages: shouldAllowImageUpload(nextStage),
    showTranscriptLink: nextStage === STAGES.ENDED
  };
  
  // ========================================
  // 8. GENERAR HELP (ayuda contextual)
  // ========================================
  const help = generateContextualHelp(nextStage, locale);
  
  // ========================================
  // 9. CONSTRUIR RESPONSE FINAL
  // ========================================
  const response = {
    ok: true,
    sid: session.sid,
    reply: reply || getDefaultReply(nextStage, locale),
    stage: nextStage,
    options: buttons?.map(b => b.text || b.label) || [], // Array de strings (legacy)
    ui: ui,
    allowWhatsapp: allowWhatsapp,
    endConversation: endConversation,
    help: help,
    steps: steps,
    imageAnalysis: imageAnalysis,
    updatedSession: updatedSession
  };
  
  console.log('[ORCHESTRATOR] Response built successfully');
  console.log('[ORCHESTRATOR] Stage transition:', session.stage, '→', nextStage);
  
  return response;
}

/**
 * PROCESS IMAGES WITH VISION API
 * 
 * Procesa imágenes con Vision API y retorna análisis
 */
async function processImagesWithVision(images, session) {
  console.log('[ORCHESTRATOR] Vision API processing', images.length, 'images');
  
  // TODO: Implementar integración con Vision API
  // Por ahora retornar análisis mock
  
  return {
    errorDetected: false,
    device: null,
    screenDetected: false,
    quality: 'medium',
    errorDescription: null,
    screenContext: null
  };
}

/**
 * GENERATE REPLY FOR ACTION
 * 
 * Genera reply predeterminado según la acción
 */
async function generateReplyForAction(action, session, locale) {
  const isEn = locale.toLowerCase().startsWith('en');
  
  const replies = {
    'PROBLEM_SOLVED': isEn 
      ? '🎉 Excellent! I\'m glad you solved it.'
      : '🎉 ¡Excelente! Me alegra que lo hayas solucionado.',
    
    'PROBLEM_PERSISTS': isEn
      ? '💡 I understand. Let me help you further.'
      : '💡 Entiendo. Déjame ayudarte más.',
    
    'CREATE_TICKET': isEn
      ? '📝 I\'m creating a support ticket for you...'
      : '📝 Estoy creando un ticket de soporte para vos...',
    
    'END_CONVERSATION': isEn
      ? '👋 Thanks for using Tecnos! See you soon.'
      : '👋 ¡Gracias por usar Tecnos! Hasta pronto.',
    
    'NOT_UNDERSTOOD': isEn
      ? 'I didn\'t understand. Could you rephrase?'
      : 'No entendí bien. ¿Podrías reformular?',
    
    'UNKNOWN_BUTTON': isEn
      ? 'Please choose an option from the buttons.'
      : 'Por favor elegí una opción de los botones.'
  };
  
  return replies[action] || '';
}

/**
 * GENERATE BUTTONS
 * 
 * Genera array de botones según flowResult y stage
 */
async function generateButtons(flowResult, session, locale) {
  if (flowResult.buttons && Array.isArray(flowResult.buttons)) {
    // flowResult tiene botones explícitos
    return flowResult.buttons.map(token => {
      return mapTokenToButton(token, locale);
    });
  }
  
  // Botones por defecto según stage
  const stage = session.stage;
  const defaultButtons = {
    [STAGES.ASK_LANGUAGE]: [
      { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español', text: 'español' },
      { token: 'BTN_LANG_EN', label: '🇺🇸 English', text: 'english' }
    ],
    [STAGES.ASK_NAME]: [
      { token: 'BTN_NO_NAME', label: '🙈 Prefiero no decirlo', text: 'prefiero no decirlo' }
    ],
    [STAGES.ASK_NEED]: [
      { token: 'BTN_PROBLEMA', label: '🔧 Tengo un problema', text: 'tengo un problema' },
      { token: 'BTN_CONSULTA', label: '💡 Tengo una consulta', text: 'tengo una consulta' }
    ],
    [STAGES.ASK_DEVICE]: [
      { token: 'BTN_DEV_PC_DESKTOP', label: '🖥️ PC de escritorio', text: 'pc de escritorio' },
      { token: 'BTN_DEV_PC_ALLINONE', label: '🖥️ PC All-in-One', text: 'all in one' },
      { token: 'BTN_DEV_NOTEBOOK', label: '💻 Notebook', text: 'notebook' }
    ],
    [STAGES.BASIC_TESTS]: [
      { token: 'BTN_SOLVED', label: '✅ Lo pude solucionar', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: '❌ Problema persiste', text: 'el problema persiste' },
      { token: 'BTN_ADVANCED_TESTS', label: '🔬 Pruebas avanzadas', text: 'pruebas avanzadas' }
    ],
    [STAGES.ADVANCED_TESTS]: [
      { token: 'BTN_SOLVED', label: '✅ Lo pude solucionar', text: 'lo pude solucionar' },
      { token: 'BTN_PERSIST', label: '❌ Todavía no funciona', text: 'todavía no funciona' },
      { token: 'BTN_CONNECT_TECH', label: '👨‍💻 Conectar con técnico', text: 'conectar con técnico' }
    ],
    [STAGES.ESCALATE]: [
      { token: 'BTN_MORE_TESTS', label: '🔍 Más pruebas', text: 'más pruebas' },
      { token: 'BTN_CONNECT_TECH', label: '👨‍💻 Conectar con técnico', text: 'conectar con técnico' },
      { token: 'BTN_CLOSE', label: '❌ Cerrar chat', text: 'cerrar' }
    ]
  };
  
  return defaultButtons[stage] || [];
}

/**
 * MAP TOKEN TO BUTTON
 * 
 * Convierte token a objeto button completo
 */
function mapTokenToButton(token, locale) {
  const isEn = locale.toLowerCase().startsWith('en');
  
  const buttonMap = {
    'BTN_LANG_ES_AR': { token: 'BTN_LANG_ES_AR', label: '🇦🇷 Español', text: 'español' },
    'BTN_LANG_EN': { token: 'BTN_LANG_EN', label: '🇺🇸 English', text: 'english' },
    'BTN_NO_NAME': { token: 'BTN_NO_NAME', label: isEn ? '🙈 Prefer not to say' : '🙈 Prefiero no decirlo', text: 'prefiero no decirlo' },
    'BTN_PROBLEMA': { token: 'BTN_PROBLEMA', label: isEn ? '🔧 I have a problem' : '🔧 Tengo un problema', text: 'tengo un problema' },
    'BTN_CONSULTA': { token: 'BTN_CONSULTA', label: isEn ? '💡 I have a question' : '💡 Tengo una consulta', text: 'tengo una consulta' },
    'BTN_DEV_PC_DESKTOP': { token: 'BTN_DEV_PC_DESKTOP', label: isEn ? '🖥️ Desktop PC' : '🖥️ PC de escritorio', text: 'pc de escritorio' },
    'BTN_DEV_PC_ALLINONE': { token: 'BTN_DEV_PC_ALLINONE', label: isEn ? '🖥️ All-in-One PC' : '🖥️ PC All-in-One', text: 'all in one' },
    'BTN_DEV_NOTEBOOK': { token: 'BTN_DEV_NOTEBOOK', label: isEn ? '💻 Notebook' : '💻 Notebook', text: 'notebook' },
    'BTN_SOLVED': { token: 'BTN_SOLVED', label: isEn ? '✅ I solved it' : '✅ Lo pude solucionar', text: 'lo pude solucionar' },
    'BTN_PERSIST': { token: 'BTN_PERSIST', label: isEn ? '❌ Problem persists' : '❌ Problema persiste', text: 'el problema persiste' },
    'BTN_ADVANCED_TESTS': { token: 'BTN_ADVANCED_TESTS', label: isEn ? '🔬 Advanced tests' : '🔬 Pruebas avanzadas', text: 'pruebas avanzadas' },
    'BTN_MORE_TESTS': { token: 'BTN_MORE_TESTS', label: isEn ? '🔍 More tests' : '🔍 Más pruebas', text: 'más pruebas' },
    'BTN_CONNECT_TECH': { token: 'BTN_CONNECT_TECH', label: isEn ? '👨‍💻 Connect with technician' : '👨‍💻 Conectar con técnico', text: 'conectar con técnico' },
    'BTN_CLOSE': { token: 'BTN_CLOSE', label: isEn ? '❌ Close chat' : '❌ Cerrar chat', text: 'cerrar' }
  };
  
  return buttonMap[token] || { token, label: token, text: token };
}

/**
 * GENERATE DIAGNOSTIC STEPS
 * 
 * Genera pasos de diagnóstico básicos
 */
async function generateDiagnosticSteps(session, smartAnalysis) {
  console.log('[ORCHESTRATOR] Generating diagnostic steps');
  
  // TODO: Implementar generación real con AI
  // Por ahora retornar steps mock
  
  return [
    'Verificá si hay luces encendidas en el dispositivo',
    'Reiniciá el equipo',
    'Verificá las conexiones de cables',
    'Ejecutá el diagnóstico de Windows'
  ];
}

/**
 * GENERATE ADVANCED TESTS
 * 
 * Genera pruebas avanzadas
 */
async function generateAdvancedTests(session, smartAnalysis) {
  console.log('[ORCHESTRATOR] Generating advanced tests');
  
  // TODO: Implementar generación real con AI
  // Filtrar pasos que ya están en session.tests.basic
  
  return [
    'Verificá el Administrador de dispositivos',
    'Actualizá los drivers del dispositivo',
    'Probá en Modo Seguro',
    'Ejecutá sfc /scannow en CMD'
  ];
}

/**
 * GENERATE HOWTO GUIDE
 * 
 * Genera guía HOWTO
 */
async function generateHowtoGuide(session, smartAnalysis) {
  console.log('[ORCHESTRATOR] Generating HOWTO guide');
  
  // TODO: Implementar generación real con AI
  
  return [
    'Paso 1: Abrí el Panel de Control',
    'Paso 2: Seleccioná la opción correspondiente',
    'Paso 3: Configurá según tus necesidades',
    'Paso 4: Guardá los cambios'
  ];
}

/**
 * CALCULATE PROGRESS BAR
 * 
 * Calcula porcentaje de progreso en conversación
 */
function calculateProgressBar(stage) {
  const stageProgress = {
    [STAGES.ASK_LANGUAGE]: 10,
    [STAGES.ASK_NAME]: 20,
    [STAGES.ASK_NEED]: 30,
    [STAGES.ASK_DEVICE]: 40,
    [STAGES.ASK_PROBLEM]: 50,
    [STAGES.BASIC_TESTS]: 70,
    [STAGES.ADVANCED_TESTS]: 85,
    [STAGES.ESCALATE]: 90,
    [STAGES.CREATE_TICKET]: 95,
    [STAGES.TICKET_SENT]: 100,
    [STAGES.ENDED]: 100
  };
  
  return stageProgress[stage] || 0;
}

/**
 * SHOULD ALLOW IMAGE UPLOAD
 * 
 * Determina si se pueden subir imágenes en este stage
 */
function shouldAllowImageUpload(stage) {
  const allowImageStages = [
    STAGES.ASK_PROBLEM,
    STAGES.ASK_HOWTO_DETAILS,
    STAGES.BASIC_TESTS,
    STAGES.ADVANCED_TESTS
  ];
  
  return allowImageStages.includes(stage);
}

/**
 * GENERATE CONTEXTUAL HELP
 * 
 * Genera ayuda contextual por step
 */
function generateContextualHelp(stage, locale) {
  const isEn = locale.toLowerCase().startsWith('en');
  
  const helpMap = {
    [STAGES.ASK_LANGUAGE]: isEn 
      ? 'Select your preferred language to continue'
      : 'Seleccioná tu idioma preferido para continuar',
    
    [STAGES.ASK_NAME]: isEn
      ? 'Tell me your name so I can personalize the conversation'
      : 'Decime tu nombre para personalizar la conversación',
    
    [STAGES.ASK_PROBLEM]: isEn
      ? 'Describe the problem in detail. You can also upload a photo.'
      : 'Describí el problema en detalle. También podés subir una foto.',
    
    [STAGES.BASIC_TESTS]: isEn
      ? 'Follow the steps carefully. Let me know if it worked.'
      : 'Seguí los pasos con cuidado. Avisame si funcionó.'
  };
  
  return helpMap[stage] || null;
}

/**
 * GET DEFAULT REPLY
 * 
 * Reply por defecto si no hay uno específico
 */
function getDefaultReply(stage, locale) {
  const isEn = locale.toLowerCase().startsWith('en');
  
  return isEn 
    ? 'Please choose an option or type your message.'
    : 'Por favor elegí una opción o escribí tu mensaje.';
}

/**
 * CREATE ERROR RESPONSE
 * 
 * Genera respuesta de error
 */
function createErrorResponse(session, errorMessage) {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.toLowerCase().startsWith('en');
  
  return {
    ok: false,
    sid: session.sid,
    reply: isEn 
      ? 'Sorry, something went wrong. Please try again.'
      : 'Disculpá, algo salió mal. Por favor intentá de nuevo.',
    stage: session.stage,
    options: [],
    ui: { buttons: [] },
    allowWhatsapp: false,
    endConversation: false,
    help: null,
    steps: null,
    imageAnalysis: null,
    updatedSession: session,
    error: errorMessage
  };
}

export default { orchestrateTurn };
