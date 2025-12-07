/**
 * handlers/stageHandlers.js
 * Handlers para los diferentes stages del flujo de conversación
 */

import { nowIso } from '../utils/common.js';

// buildLanguageSelectionGreeting se pasa como dependencia desde server.js

/**
 * Handler para el stage ASK_LANGUAGE
 * Maneja consentimiento GDPR y selección de idioma
 * ✅ MEDIO-7: Manejo de errores robusto agregado
 */
export async function handleAskLanguageStage(session, userText, buttonToken, sid, res, dependencies) {
  // ✅ MEDIO-7: Validación de parámetros
  if (!session || !userText || !sid) {
    console.error('[ASK_LANGUAGE] ❌ Parámetros inválidos:', { hasSession: !!session, hasUserText: !!userText, hasSid: !!sid });
    return {
      ok: false,
      error: 'Parámetros inválidos',
      handled: true
    };
  }

  const {
    STATES,
    saveSessionAndTranscript,
    buildLanguageSelectionGreeting,
    changeStage
  } = dependencies;

  try {
    const lowerMsg = userText.toLowerCase().trim();
    console.log('[ASK_LANGUAGE] Processing:', lowerMsg, 'buttonToken:', buttonToken, 'GDPR consent:', session.gdprConsent);

    // Detectar aceptación de GDPR
    if (/\b(si|sí|acepto|aceptar|ok|dale|de acuerdo|agree|accept|yes)\b/i.test(lowerMsg)) {
    session.gdprConsent = true;
    session.gdprConsentDate = nowIso();
    console.log('[GDPR] ✅ Consentimiento otorgado:', session.gdprConsentDate);

    // Mostrar selección de idioma CON ID de conversación
    const reply = `🆔 **${sid}**\n\n✅ **Gracias por aceptar**\n\n🌍 **Seleccioná tu idioma / Select your language:**`;
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso(), stage: session.stage });
    await saveSessionAndTranscript(sid, session);

    return {
      ok: true,
      reply,
      stage: session.stage,
      buttons: [
        { text: '(🇦🇷) Español 🌎', value: 'español' },
        { text: '(🇺🇸) English 🌎', value: 'english' }
      ],
      handled: true
    };
  }

  // Detectar rechazo de GDPR
  if (/\b(no|no acepto|no quiero|rechazo|cancel|decline)\b/i.test(lowerMsg)) {
    const reply = `😔 Entiendo. Sin tu consentimiento no puedo continuar.\n\nSi cambiás de opinión, podés volver a iniciar el chat.\n\n📧 Para consultas sin registro, escribinos a: web@stia.com.ar`;
    session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);

    return {
      ok: true,
      reply,
      stage: session.stage,
      handled: true
    };
  }

  // Detectar selección de idioma (después de aceptar GDPR)
  if (session.gdprConsent) {
    if (/español|spanish|es-|arg|latino/i.test(lowerMsg)) {
      session.userLocale = 'es-AR';
      // 🔧 FIX CRÍTICO-2: Usar changeStage para validar transición
      changeStage(session, STATES.ASK_NAME);

      const reply = `✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊`;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);

      return {
        ok: true,
        reply,
        stage: session.stage,
        handled: true
      };
    }

    if (/english|inglés|ingles|en-|usa|uk/i.test(lowerMsg)) {
      session.userLocale = 'en-US';
      // 🔧 FIX CRÍTICO-2: Usar changeStage para validar transición
      changeStage(session, STATES.ASK_NAME);

      const reply = `✅ Great! Let's continue in **English**.\n\nWhat's your name?`;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);

      return {
        ok: true,
        reply,
        stage: session.stage,
        handled: true
      };
    }
  }

    // Si no se reconoce la respuesta, re-mostrar opciones
    const retry = `Por favor, seleccioná una de las opciones usando los botones. / Please select one of the options using the buttons.`;
    session.transcript.push({ who: 'bot', text: retry, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);

    return {
      ok: true,
      reply: retry,
      stage: session.stage,
      buttons: session.gdprConsent
        ? [
          { text: '(🇦🇷) Español 🌎', value: 'español' },
          { text: '(🇺🇸) English 🌎', value: 'english' }
        ]
        : [
          { text: 'Sí Acepto', value: 'si' },
          { text: 'No Acepto', value: 'no' }
        ],
      handled: true
    };
  } catch (error) {
    // ✅ MEDIO-7: Manejo de errores robusto
    console.error('[ASK_LANGUAGE] ❌ Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sid,
      stage: session?.stage
    });
    
    // Retornar respuesta de error amigable
    const errorReply = session?.userLocale === 'en-US'
      ? "I'm sorry, there was an error processing your request. Please try again."
      : "Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.";
    
    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }
    
    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES?.ASK_LANGUAGE,
      handled: true,
      error: error.message
    };
  }
}
