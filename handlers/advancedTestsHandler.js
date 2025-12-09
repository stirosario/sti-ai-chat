/**
 * handlers/advancedTestsHandler.js
 * Manejo del stage ADVANCED_TESTS
 */

import { nowIso, withOptions } from '../utils/common.js';
import { changeStage, STATES } from './stateMachine.js';

/**
 * Maneja el stage ADVANCED_TESTS
 */
export async function handleAdvancedTestsStage(session, sid, res, t, buttonToken, deps) {
  const {
    handleShowSteps,
    handleDontUnderstand,
    createTicketAndRespond,
    buildUiButtonsFromTokens,
    addEmpatheticResponse,
    saveSessionAndTranscript,
    capitalizeToken
  } = deps;

  // 1. Manejo de "Volver a los pasos"
  if (buttonToken === 'BTN_BACK_TO_STEPS') {
    const result = handleShowSteps(session, 'advanced');
    if (result.error) {
      session.transcript.push({ who: 'bot', text: result.msg, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: false, reply: result.msg, stage: session.stage, options: [] }));
    }
    session.transcript.push({ who: 'bot', text: result.msg, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply: result.msg, stage: session.stage, options: result.options, steps: result.steps }));
  }

  const rxDontKnowAdv = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
  if (rxDontKnowAdv.test(t)) {
    const result = await handleDontUnderstand(session, sid, t);
    return res.json(withOptions(result));
  }

  const rxYes = /^\s*(s|si|sí|lo pude|lo pude solucionar|lo pude solucionar ✔️)/i;
  const rxNo = /^\s*(no|n|el problema persiste|persiste|el problema persiste ❌)/i;
  const rxTech = /^\s*(conectar con t[eé]cnico|conectar con tecnico|conectar con t[eé]cnico)$/i;
  const rxShowSteps = /^\s*(volver a los pasos avanzados|volver a los pasos|volver a mostrar los pasos|volver a mostrar|mostrar pasos|⏪)/i;

  if (rxShowSteps.test(t)) {
    const result = handleShowSteps(session, 'advanced');
    if (result.error) {
      session.transcript.push({ who: 'bot', text: result.msg, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return res.json(withOptions({ ok: false, reply: result.msg, stage: session.stage, options: [] }));
    }
    session.transcript.push({ who: 'bot', text: result.msg, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply: result.msg, stage: session.stage, options: result.options, steps: result.steps }));
  }

  if (rxYes.test(t) || buttonToken === 'BTN_SOLVED') {
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    const idx = session.lastHelpStep;
    if (typeof idx === 'number' && idx >= 1) {
      session.stepProgress = session.stepProgress || {};
      session.stepProgress[`adv_${idx}`] = 'done';
      await saveSessionAndTranscript(sid, session);
    }
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
      ? `I understand. ${empatia} Do you want me to connect you with a technician to look into it more deeply?`
      : `Entiendo. ${empatia} ¿Querés que te conecte con un técnico para que lo vean más a fondo?`;
    const options = buildUiButtonsFromTokens(['BTN_CONNECT_TECH'], locale);
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
      ? `I didn't understand. You can say "I solved it" or "The problem persists", or ask to connect with a technician.`
      : (locale === 'es-419'
        ? `No te entendí. Puedes decir "Lo pude solucionar" o "El problema persiste", o pedir conectar con técnico.`
        : `No te entendí. Podés decir "Lo pude solucionar" o "El problema persiste", o pedir conectar con técnico.`);
    const options = buildUiButtonsFromTokens(['BTN_SOLVED', 'BTN_PERSIST', 'BTN_CONNECT_TECH'], locale);
    
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    return res.json(withOptions({ ok: true, reply, stage: session.stage, options }));
  }
}

