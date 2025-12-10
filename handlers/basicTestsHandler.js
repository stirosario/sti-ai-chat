/**
 * handlers/basicTestsHandler.js
 * Manejo del stage BASIC_TESTS
 */

/**
 * handlers/basicTestsHandler.js
 * Manejo del stage BASIC_TESTS
 * 
 * NOTA: Este handler recibe las dependencias como parámetros para evitar imports circulares
 */

import { nowIso, withOptions } from '../utils/common.js';
import { enumerateSteps, normalizeStepText, formatExplanationWithNumberedSteps } from '../utils/stepsUtils.js';
import { capitalizeToken } from './nameHandler.js';
import { changeStage, STATES } from './stateMachine.js';
import { getFriendlyErrorMessage, getCelebrationMessage, getProgressIndicator } from '../utils/uxHelpers.js';
import { detectAchievements, getAchievementMessage, updateSessionAchievements, calculateProgressPercentage, generateProgressBar } from '../utils/gamification.js';
import { estimateTotalTime, estimateStepTime } from '../utils/timeEstimates.js';

/**
 * Maneja el stage BASIC_TESTS
 * @param {Object} session - Sesión actual
 * @param {string} sid - Session ID
 * @param {Object} res - Express response
 * @param {string} t - Texto del usuario
 * @param {string} buttonToken - Token del botón presionado
 * @param {Object} deps - Dependencias inyectadas (funciones de server.js)
 */
export async function handleBasicTestsStage(session, sid, res, t, buttonToken, deps) {
  const {
    generateAndShowSteps,
    explainStepWithAI,
    handleDontUnderstand,
    createTicketAndRespond,
    aiQuickTests,
    buildUiButtonsFromTokens,
    addEmpatheticResponse,
    saveSessionAndTranscript
  } = deps;
  // ✅ CRÍTICO: Si estamos en BASIC_TESTS pero no hay pasos generados, generarlos automáticamente
  if ((!session.tests || !session.tests.basic || session.tests.basic.length === 0) && 
      (!session.basicTests || session.basicTests.length === 0)) {
    console.log('[BASIC_TESTS] ⚠️ No hay pasos generados - generando automáticamente...');
    return await generateAndShowSteps(session, sid, res);
  }
  
  // 1. Manejo de "Volver a los pasos"
  if (buttonToken === 'BTN_BACK_TO_STEPS') {
    return await generateAndShowSteps(session, sid, res);
  }

  // 2. Manejo de Ayuda por Paso (BTN_HELP_STEP_X)
  if (buttonToken && buttonToken.startsWith('BTN_HELP_STEP_')) {
    const stepIdx = parseInt(buttonToken.replace('BTN_HELP_STEP_', ''), 10);
    // Convertir de 0-based a 1-based para el índice del paso
    const stepNumber = stepIdx + 1;
    
    // Obtener los pasos desde la estructura correcta
    const steps = Array.isArray(session.tests?.basic) ? session.tests.basic : [];
    if (stepIdx < 0 || stepIdx >= steps.length) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const msg = isEn 
        ? `Invalid step number. Please select a step between 1 and ${steps.length}.`
        : `Paso inválido. Elegí un paso entre 1 y ${steps.length}.`;
      session.transcript.push({ who: 'bot', text: msg, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: false, reply: msg, stage: session.stage }));
    }

    const stepText = steps[stepIdx];
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');

    // ✅ FASE 3: Tiempo estimado para este paso
    const stepTime = estimateStepTime(stepText, stepIdx, locale);
    
    // ✅ FASE 3: Marcar paso como en progreso
    session.stepProgress = session.stepProgress || {};
    session.stepProgress[`basic_${stepIdx + 1}`] = 'in_progress';

    // Generar explicación con IA
    let explanation = '';
    try {
      explanation = await explainStepWithAI(stepText, stepNumber, session.device || '', session.problem || '', locale);
    } catch (err) {
      console.error('[BASIC_TESTS] Error generating help:', err);
      const friendlyError = getFriendlyErrorMessage(err, locale, 'generating step explanation');
      explanation = friendlyError || (isEn
        ? "I couldn't generate a detailed explanation, but try to follow the step as best as you can."
        : "No pude generar una explicación detallada, pero tratá de seguir el paso lo mejor que puedas.");
    }

    // ✅ NUEVO: Formatear pasos numerados en la explicación con emojis
    // Detectar patrones como "1.", "2.", "1)", "2)", "1-", "2-", etc. y reemplazarlos con emojis
    const formattedExplanation = formatExplanationWithNumberedSteps(explanation, locale);

    const reply = isEn
      ? `**Help for Step ${stepNumber}:** ${stepTime}\n\n${formattedExplanation}`
      : `**Ayuda para el Paso ${stepNumber}:** ${stepTime}\n\n${formattedExplanation}`;

    // Construir botón "Volver Atrás"
    const backButton = {
      token: 'BTN_BACK_TO_STEPS',
      label: isEn ? '🔙 Go Back' : '🔙 Volver Atrás',
      text: isEn ? 'go back' : 'volver atrás'
    };

    // Solo mostrar botón "Volver Atrás"
    const unifiedOpts = [backButton];

    // ✅ NUEVO: Solo mostrar la explicación formateada y el botón "Volver Atrás"
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options: unifiedOpts }));
  }

  const rxDontKnow = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
  if (rxDontKnow.test(t)) {
    const result = await handleDontUnderstand(session, sid, t);
    return res.json(withOptions(result));
  }

  // ✅ HANDLER: BTN_YES y BTN_NO para guías de instalación (ASK_HOWTO_DETAILS)
  // Verificar si viene de una guía de instalación (ASK_HOWTO_DETAILS cambia a BASIC_TESTS)
  const isInstallationGuide = (session.tests?.howto && session.tests.howto.length > 0) || 
                               session.userOS || 
                               (session.activeIntent && (session.activeIntent.type === 'install' || session.activeIntent.type === 'setup'));
  
  if (isInstallationGuide && (buttonToken === 'BTN_YES' || buttonToken === 'BTN_NO' || /^\s*(s|si|sí|yes|y)\b/i.test(t) || /^\s*(no|n)\b/i.test(t))) {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
    
    if (buttonToken === 'BTN_YES' || /^\s*(s|si|sí|yes|y)\b/i.test(t)) {
      // Usuario confirma que la instalación funcionó
      const celebration = getCelebrationMessage('installation_success', {}, locale);
      const firstLine = whoLabel
        ? (isEn ? `Excellent, ${whoLabel}! 🙌` : `¡Qué buena noticia, ${whoLabel}! 🙌`)
        : (isEn ? `Excellent! 🙌` : `¡Qué buena noticia! 🙌`);
      
      const reply = isEn
        ? `${firstLine}\n\n${celebration}\n\nI'm glad the installation worked! Your ${session.device || 'device'} should be ready to use now. 💻✨\n\nIf you need help with anything else, or want to install/configure something else, I'll be here. Just open the Tecnos chat. 🤝🤖\n\n📲 Follow us for more tips: @sti.rosario\n🌐 STI Web: https://stia.com.ar\n 🚀\n\nThanks for trusting Tecnos! 😉`
        : `${firstLine}\n\n${celebration}\n\nMe alegra que la instalación haya funcionado! Tu ${session.device || 'dispositivo'} debería estar listo para usar ahora. 💻✨\n\nSi necesitás ayuda con otra cosa, o querés instalar/configurar algo más, acá voy a estar. Solo abrí el chat de Tecnos. 🤝🤖\n\n📲 Seguinos para más tips: @sti.rosario\n🌐 Web de STI: https://stia.com.ar\n 🚀\n\n¡Gracias por confiar en Tecnos! 😉`;
      
      changeStage(session, STATES.ENDED);
      session.waEligible = false;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options: [] }));
    } else if (buttonToken === 'BTN_NO' || /^\s*(no|n)\b/i.test(t)) {
      // Usuario necesita más ayuda con la instalación
      const reply = isEn
        ? `No problem! Let me help you troubleshoot the installation. What specific issue are you encountering?`
        : `¡No hay problema! Dejame ayudarte a resolver el problema de instalación. ¿Qué problema específico estás teniendo?`;
      
      const options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
      changeStage(session, STATES.ESCALATE);
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
    }
  }

  const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️|BTN_SOLVED)\b/i;
  const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌|BTN_PERSIST)\b/i;
  const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico|BTN_CONNECT_TECH)\b/i;
  const rxAdvanced = /^\s*(pruebas avanzadas|más pruebas|BTN_ADVANCED_TESTS|BTN_MORE_TESTS)\b/i;
  const rxShowSteps = /^\s*(volver a los pasos|volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)\b/i;

  if (rxShowSteps.test(t)) {
    return await generateAndShowSteps(session, sid, res);
  }

  // ✅ ELIMINADO: Sistema de pruebas avanzadas - ahora se ofrece directamente conectar con técnico
  // Si el usuario pide pruebas avanzadas, redirigir a conectar con técnico
  if (rxAdvanced.test(t) || buttonToken === 'BTN_ADVANCED_TESTS' || buttonToken === 'BTN_MORE_TESTS') {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const reply = isEn
      ? `I understand you need more help. Let me connect you with a technician who can provide specialized assistance.`
      : `Entiendo que necesitás más ayuda. Dejame conectarte con un técnico que te pueda brindar asistencia especializada.`;
    const options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
    changeStage(session, STATES.ESCALATE);
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
  }

  if (rxYes.test(t) || buttonToken === 'BTN_SOLVED') {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
    
    // ✅ MEJORA UX FASE 2: Mensaje de celebración
    const totalSteps = (session.tests?.basic?.length || 0) + (session.tests?.advanced?.length || 0);
    const completedSteps = Object.values(session.stepProgress || {}).filter(s => s === 'completed').length;
    const celebration = getCelebrationMessage(
      totalSteps > 0 && completedSteps >= totalSteps ? 'all_steps_completed' : 'problem_solved',
      { step: completedSteps, totalSteps },
      locale
    );
    
    // ✅ FASE 3: Detectar y mostrar logros
    const achievements = detectAchievements(session);
    let achievementsMsg = '';
    if (achievements.length > 0) {
      updateSessionAchievements(session, achievements);
      achievementsMsg = '\n\n' + achievements.map(a => getAchievementMessage(a, locale)).join('\n');
    }
    
    const empatia = addEmpatheticResponse('ENDED', locale);
    const firstLine = whoLabel
      ? (isEn ? `Excellent, ${whoLabel}! 🙌` : `¡Qué buena noticia, ${whoLabel}! 🙌`)
      : (isEn ? `Excellent! 🙌` : `¡Qué buena noticia! 🙌`);

    const reply = isEn
      ? `${firstLine}\n\n${celebration}${achievementsMsg}\n\nI'm glad you solved it. Your equipment should work perfectly now. 💻✨\n\nIf another problem appears later, or you want help installing/configuring something, I'll be here. Just open the Tecnos chat. 🤝🤖\n\n📲 Follow us for more tips: @sti.rosario\n🌐 STI Web: https://stia.com.ar\n 🚀\n\nThanks for trusting Tecnos! 😉`
      : `${firstLine}\n\n${celebration}${achievementsMsg}\n\nMe alegra un montón que lo hayas solucionado. Tu equipo debería andar joya ahora. 💻✨\n\nSi más adelante aparece otro problema, o querés ayuda para instalar/configurar algo, acá voy a estar. Solo abrí el chat de Tecnos. 🤝🤖\n\n📲 Seguinos para más tips: @sti.rosario\n🌐 Web de STI: https://stia.com.ar\n 🚀\n\n¡Gracias por confiar en Tecnos! 😉`;

    changeStage(session, STATES.ENDED);
    session.waEligible = false;
    const options = [];

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));

  } else if (rxNo.test(t) || buttonToken === 'BTN_PERSIST') {
    // ✅ NUEVO SISTEMA: Cuando el problema persiste, ofrecer directamente conectar con técnico
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const empatia = addEmpatheticResponse('ESCALATE', locale);
    const reply = isEn
      ? `💡 I understand. ${empatia} Let me connect you with a technician who can help you further.`
      : `💡 Entiendo. ${empatia} Dejame conectarte con un técnico que te pueda ayudar mejor.`;
    const options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
    changeStage(session, STATES.ESCALATE);

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
  } else if (rxTech.test(t) || buttonToken === 'BTN_CONNECT_TECH' || buttonToken === 'BTN_WHATSAPP_TECNICO') {
    // Si es BTN_WHATSAPP_TECNICO, usar el handler específico de WhatsApp
    if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      
      // Preparar historial de conversación
      const transcriptText = session.transcript
        .map((msg, idx) => {
          const time = msg.ts ? new Date(msg.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
          const who = msg.who === 'user' ? '👤 Cliente' : '🤖 Tecnos';
          const stage = msg.stage ? ` [${msg.stage}]` : '';
          return `${idx + 1}. ${who} ${time}${stage}:\n   ${msg.text}`;
        })
        .join('\n\n');
      
      // Información técnica recopilada
      const technicalInfo = [
        `📱 *Información Técnica:*`,
        session.operatingSystem ? `• OS: ${session.operatingSystem}` : null,
        session.device ? `• Dispositivo: ${session.device}` : null,
        session.deviceBrand ? `• Marca: ${session.deviceBrand}` : null,
        session.problemCategory ? `• Categoría: ${session.problemCategory}` : null,
        session.activeIntent ? `• Intent: ${session.activeIntent.type} (${Math.round(session.activeIntent.confidence * 100)}%)` : null
      ].filter(Boolean).join('\n');
      
      // Preparar mensaje completo para WhatsApp
      const whatsappMessage = encodeURIComponent(
        `🆘 *Solicitud de Soporte Técnico*\n\n` +
        `📋 *ID Sesión:* ${sid}\n\n` +
        `${technicalInfo}\n\n` +
        `📝 *Historial de Conversación:*\n\n` +
        `${transcriptText}\n\n` +
        `⏰ *Hora de solicitud:* ${new Date().toLocaleString('es-AR')}`
      );
      
      // Número de WhatsApp del soporte (ajustar según configuración)
      const whatsappNumber = process.env.WHATSAPP_SUPPORT_NUMBER || '5492323569443'; // STI Support
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
      
      const confirmMsg = isEn
        ? `Perfect! Click the link below to open WhatsApp with all the conversation history ready to send:\n\n${whatsappUrl}\n\n✅ The technician will receive all the context and will be able to help you quickly.`
        : (locale === 'es-419'
          ? `¡Perfecto! Hacé clic en el enlace de abajo para abrir WhatsApp con todo el historial de conversación listo para enviar:\n\n${whatsappUrl}\n\n✅ El técnico va a recibir todo el contexto y va a poder ayudarte rápidamente.`
          : `¡Perfecto! Hacé clic en el enlace de abajo para abrir WhatsApp con todo el historial de conversación listo para enviar:\n\n${whatsappUrl}\n\n✅ El técnico va a recibir todo el contexto y va a poder ayudarte rápidamente.`);
      
      session.transcript.push({ who: 'bot', text: confirmMsg, ts: nowIso(), stage: session.stage });
      await saveSessionAndTranscript(sid, session);
      
      return res.json(withOptions({
        ok: true,
        reply: confirmMsg,
        stage: session.stage,
        whatsappUrl: whatsappUrl,
        metadata: {
          action: 'open_whatsapp',
          url: whatsappUrl
        },
        options: buildUiButtonsFromTokens(['BTN_WHATSAPP_TECNICO', 'BTN_CLOSE'], locale)
      }));
    } else {
      // BTN_CONNECT_TECH: crear ticket y responder
      return await createTicketAndRespond(session, sid, res);
    }
  } else {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const reply = isEn
      ? `I didn't understand. Please choose an option from the buttons.`
      : (locale === 'es-419'
        ? `No te entendí. Por favor elegí una opción de los botones.`
        : `No te entendí. Por favor elegí una opción de los botones.`);
    // Re-enviar botones originales si no entiende
    return await generateAndShowSteps(session, sid, res);
  }
}

