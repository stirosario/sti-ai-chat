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
  
  // ✅ ELIMINADO: Sistema de pruebas avanzadas - redirigir a conectar con técnico
  const opt1 = /^\s*(?:1\b|1️⃣\b|uno|mas pruebas|más pruebas|pruebas avanzadas)/i;
  const isOpt1 = opt1.test(t) || buttonToken === 'BTN_MORE_TESTS' || buttonToken === 'BTN_ADVANCED_TESTS';

  if (isOpt1) {
    // Redirigir directamente a conectar con técnico
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

