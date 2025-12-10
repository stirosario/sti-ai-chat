/**
 * handlers/escalateHandler.js
 * Manejo del stage ESCALATE
 */

import { nowIso, withOptions } from '../utils/common.js';
import { enumerateSteps, normalizeStepText } from '../utils/stepsUtils.js';
import { changeStage, STATES } from './stateMachine.js';

/**
 * Maneja el stage ESCALATE
 */
export async function handleEscalateStage(session, sid, res, t, buttonToken, deps) {
  const {
    createTicketAndRespond,
    aiQuickTests,
    buildUiButtonsFromTokens,
    addEmpatheticResponse,
    saveSessionAndTranscript
  } = deps;

  // ✅ CORRECCIÓN: En ESCALATE, cualquier confirmación o solicitud de técnico debe ejecutar inmediatamente
  const confirmRx = /^\s*(sí|si|ok|dale|perfecto|bueno|vamos|adelante|claro|por supuesto|yes|okay|sure|alright|hacelo|hazlo|quiero|necesito|dame)\s*(hablar|conectar|técnico|tecnico)?\s*$/i;
  const techRequestRx = /^\s*(conectar|hablar|técnico|tecnico|quiero hablar|necesito hablar|dame un técnico|dame un tecnico)\s*$/i;
  const isOpt2 = /^\s*(?:2\b|2️⃣\b|dos|conectar con t[eé]cnico|conectar con tecnico)/i.test(t) || buttonToken === 'BTN_CONNECT_TECH' || buttonToken === 'BTN_WHATSAPP_TECNICO';
  
  // Si confirma o pide técnico, ejecutar inmediatamente
  if (confirmRx.test(t) || techRequestRx.test(t) || isOpt2) {
    console.log('[ESCALATE] ✅ Confirmación detectada - ejecutando escalado inmediatamente');
    return await createTicketAndRespond(session, sid, res);
  }
  
  const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas|pruebas avanzadas)/i;
  const isOpt1 = opt1.test(t) || buttonToken === 'BTN_MORE_TESTS' || buttonToken === 'BTN_ADVANCED_TESTS';

  if (isOpt1) {
    try {
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const device = session.device || '';
      let aiSteps = [];
      try {
        aiSteps = await aiQuickTests(session.problem || '', device || '', session.userLocale || 'es-AR', Array.isArray(session.tests?.basic) ? session.tests.basic : []);
      } catch (e) { aiSteps = []; }
      let limited = Array.isArray(aiSteps) ? aiSteps.slice(0, 8) : [];

      // filtrar resultados avanzados que ya estén en pasos básicos
      session.tests = session.tests || {};
      const basicList = Array.isArray(session.tests.basic) ? session.tests.basic : [];
      const basicSet = new Set((basicList || []).map(normalizeStepText));
      limited = limited.filter(s => !basicSet.has(normalizeStepText(s)));
      limited = limited.slice(0, 4);

      // Si no quedan pruebas avanzadas distintas, avisar al usuario
      if (!limited || limited.length === 0) {
        const noMore = isEn
          ? "I don't have more advanced tests that are different from the ones you already tried. I can connect you with a technician if you want."
          : 'No tengo más pruebas avanzadas distintas a las que ya probaste. ¿Querés que te conecte con un técnico?';
        session.transcript.push({ who: 'bot', text: noMore, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: true, reply: noMore, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH','BTN_CLOSE'], locale) }));
      }

      session.tests.advanced = limited;
      session.stepProgress = session.stepProgress || {};
      limited.forEach((_, i) => session.stepProgress[`adv_${i + 1}`] = 'pending');
      const numbered = enumerateSteps(limited);
      const whoLabel = session.userName ? deps.capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
      const empatia = addEmpatheticResponse('ADVANCED_TESTS', locale);
      const intro = isEn
        ? `I understand, ${whoLabel}. ${empatia} Let's try some more advanced tests now:`
        : `Entiendo, ${whoLabel}. ${empatia} Probemos ahora con algunas pruebas más avanzadas:`;
      const footer = isEn
        ? '\n\n🧩 If you need help with any step, tap on the number.\n\n🤔 Tell us how it went using the buttons:'
        : '\n\n🧩 Si necesitás ayuda para realizar algún paso, tocá en el número.\n\n🤔 Contanos cómo te fue utilizando los botones:';
      const fullMsg = intro + '\n\n' + numbered.join('\n\n') + footer;
      session.stepsDone = session.stepsDone || [];
      session.stepsDone.push('advanced_tests_shown');
      session.waEligible = false;
      session.lastHelpStep = null;
      changeStage(session, STATES.ADVANCED_TESTS);
      session.transcript.push({ who: 'bot', text: fullMsg, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      const helpOptions = limited.map((_, i) => `🆘🛠️ Ayuda paso ${deps.emojiForIndex(i)}`);
      const solvedBtn = isEn ? '✔️ I solved it' : 'Lo pude solucionar ✔️';
      const persistBtn = isEn ? '❌ Still not working' : 'El problema persiste ❌';
      const optionsResp = [...helpOptions, solvedBtn, persistBtn];
      return res.json(withOptions({ ok: true, reply: fullMsg, stage: session.stage, options: optionsResp, steps: limited }));
    } catch (errOpt1) {
      console.error('[ESCALATE][more_tests] Error', errOpt1 && errOpt1.message);
      const locale = session.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      const reply = isEn
        ? 'An error occurred generating more tests. Try again or ask me to connect you with a technician.'
        : 'Ocurrió un error generando más pruebas. Probá de nuevo o pedime que te conecte con un técnico.';
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: false, reply, stage: session.stage, options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH'], locale) }));
    }
  } else {
    // ✅ CORRECCIÓN: Si no entendió en ESCALATE, ofrecer directamente el botón sin más preguntas
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const escalationVariations = [
      isEn
        ? "I'll connect you with a technician. Press the button below to continue on WhatsApp:"
        : "Te conecto con un técnico. Presioná el botón de abajo para continuar por WhatsApp:",
      isEn
        ? "Let me connect you with a specialist. Use the WhatsApp button to continue:"
        : "Déjame conectarte con un especialista. Usá el botón de WhatsApp para continuar:",
      isEn
        ? "I'll get you in touch with a technician. Tap the button below:"
        : "Te voy a poner en contacto con un técnico. Tocá el botón de abajo:"
    ];
    const variationIndex = (sid ? sid.charCodeAt(0) : 0) % escalationVariations.length;
    const reply = escalationVariations[variationIndex];
    
    const whatsappButton = {
      token: 'BTN_WHATSAPP_TECNICO',
      label: isEn ? '💚 Talk to a Technician' : '💚 Hablar con un Técnico',
      text: 'hablar con un técnico',
      emoji: '💚',
      action: 'external',
      style: 'primary'
    };
    const options = [whatsappButton];
    
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
  }
}

