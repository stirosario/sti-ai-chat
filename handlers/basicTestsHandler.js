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
import { enumerateSteps, normalizeStepText } from '../utils/stepsUtils.js';
import { capitalizeToken } from './nameHandler.js';
import { changeStage, STATES } from './stateMachine.js';

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
    const stepText = session.basicTests[stepIdx];

    if (stepText) {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');

      // Generar explicación con IA
      let explanation = '';
      try {
        explanation = await explainStepWithAI(stepText, stepIdx + 1, session.deviceLabel, session.problem, locale);
      } catch (err) {
        console.error('[BASIC_TESTS] Error generating help:', err);
        explanation = isEn
          ? "I couldn't generate a detailed explanation, but try to follow the step as best as you can."
          : "No pude generar una explicación detallada, pero tratá de seguir el paso lo mejor que puedas.";
      }

      const reply = isEn
        ? `**Help for Step ${stepIdx + 1}:**\n\n${explanation}`
        : `**Ayuda para el Paso ${stepIdx + 1}:**\n\n${explanation}`;

      const isAdvanced = session.stage === STATES.ADVANCED_TESTS;
      const backButton = {
        token: 'BTN_BACK_TO_STEPS',
        label: isEn 
          ? (isAdvanced ? '⏪ Back to advanced steps' : '⏪ Back to steps')
          : (isAdvanced ? '⏪ Volver a los pasos avanzados' : '⏪ Volver a los pasos'),
        text: isEn 
          ? (isAdvanced ? 'back to advanced steps' : 'back to steps')
          : (isAdvanced ? 'volver a los pasos avanzados' : 'volver a los pasos')
      };

      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: true, reply, stage: session.stage }, [backButton]));
    }
  }

  const rxDontKnow = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
  if (rxDontKnow.test(t)) {
    const result = await handleDontUnderstand(session, sid, t);
    return res.json(withOptions(result));
  }

  const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️|BTN_SOLVED)\b/i;
  const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌|BTN_PERSIST)\b/i;
  const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico|BTN_CONNECT_TECH)\b/i;
  const rxAdvanced = /^\s*(pruebas avanzadas|más pruebas|BTN_ADVANCED_TESTS|BTN_MORE_TESTS)\b/i;
  const rxShowSteps = /^\s*(volver a los pasos|volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)\b/i;

  if (rxShowSteps.test(t)) {
    return await generateAndShowSteps(session, sid, res);
  }

  // FIX: Atajo directo desde BASIC_TESTS a pruebas avanzadas
  if (rxAdvanced.test(t) || buttonToken === 'BTN_ADVANCED_TESTS' || buttonToken === 'BTN_MORE_TESTS') {
    try {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const device = session.device || '';
      let aiSteps = [];
      try {
        aiSteps = await aiQuickTests(session.problem || '', device || '', session.userLocale || 'es-AR', Array.isArray(session.tests?.basic) ? session.tests.basic : []);
      } catch (e) { aiSteps = []; }
      let limited = Array.isArray(aiSteps) ? aiSteps.slice(0, 8) : [];

      // Filtrar resultados avanzados que ya estén en pasos básicos
      session.tests = session.tests || {};
      const basicList = Array.isArray(session.tests.basic) ? session.tests.basic : [];
      const basicSet = new Set((basicList || []).map(normalizeStepText));
      limited = limited.filter(s => !basicSet.has(normalizeStepText(s)));
      limited = limited.slice(0, 4);

      if (!limited || limited.length === 0) {
        const noMore = isEn
          ? "I don't have more advanced tests that are different from the ones you already tried. I can connect you with a technician if you want."
          : 'No tengo más pruebas avanzadas distintas a las que ya probaste. ¿Querés que te conecte con un técnico?';
        changeStage(session, STATES.ESCALATE);
        session.transcript.push({ who: 'bot', text: noMore, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: true, reply: noMore, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH','BTN_CLOSE'], locale) }));
      }

      session.tests.advanced = limited;
      session.stepProgress = session.stepProgress || {};
      limited.forEach((_, i) => session.stepProgress[`adv_${i + 1}`] = 'pending');
      const formattedSteps = enumerateSteps(limited);
      const stepBlock = formattedSteps.join('\n\n');
      const help = isEn
        ? `💡 Try these more specific tests. If they don't work, I'll connect you with a technician.`
        : `💡 Probá estas pruebas más específicas. Si no funcionan, te conecto con un técnico.`;
      let reply = `${help}\n\n**🔬 PRUEBAS AVANZADAS:**\n${stepBlock}\n\n`;

      const prompt = isEn
        ? `Did any of these tests solve the problem?`
        : `¿Alguna de estas pruebas solucionó el problema?`;
      reply += prompt;

      changeStage(session, STATES.ADVANCED_TESTS);
      const options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH'], locale);

      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
    } catch (err) {
      console.error('[BASIC_TESTS → ADVANCED] Error generating advanced tests:', err);
      changeStage(session, STATES.ESCALATE);
      await saveSessionAndTranscript(sid, session);
      return await createTicketAndRespond(session, sid, res);
    }
  }

  if (rxYes.test(t) || buttonToken === 'BTN_SOLVED') {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const whoLabel = session.userName ? capitalizeToken(session.userName) : null;
    const empatia = addEmpatheticResponse('ENDED', locale);
    const firstLine = whoLabel
      ? (isEn ? `Excellent, ${whoLabel}! 🙌` : `¡Qué buena noticia, ${whoLabel}! 🙌`)
      : (isEn ? `Excellent! 🙌` : `¡Qué buena noticia! 🙌`);

    const reply = isEn
      ? `${firstLine}\n\nI'm glad you solved it. Your equipment should work perfectly now. 💻✨\n\nIf another problem appears later, or you want help installing/configuring something, I'll be here. Just open the Tecnos chat. 🤝🤖\n\n📲 Follow us for more tips: @sti.rosario\n🌐 STI Web: https://stia.com.ar\n 🚀\n\nThanks for trusting Tecnos! 😉`
      : `${firstLine}\n\nMe alegra un montón que lo hayas solucionado. Tu equipo debería andar joya ahora. 💻✨\n\nSi más adelante aparece otro problema, o querés ayuda para instalar/configurar algo, acá voy a estar. Solo abrí el chat de Tecnos. 🤝🤖\n\n📲 Seguinos para más tips: @sti.rosario\n🌐 Web de STI: https://stia.com.ar\n 🚀\n\n¡Gracias por confiar en Tecnos! 😉`;

    changeStage(session, STATES.ENDED);
    session.waEligible = false;
    const options = [];

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));

  } else if (rxNo.test(t) || buttonToken === 'BTN_PERSIST') {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const empatia = addEmpatheticResponse('ESCALATE', locale);
    const reply = isEn
      ? `💡 I understand. ${empatia} What would you like to do?`
      : `💡 Entiendo. ${empatia} ¿Querés que te ayude con algo más?`;
    const options = buildUiButtonsFromTokens(['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE'], locale);
    changeStage(session, STATES.ESCALATE);

    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
  } else if (rxTech.test(t)) {
    return await createTicketAndRespond(session, sid, res);
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

