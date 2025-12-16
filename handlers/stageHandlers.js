/**
 * handlers/stageHandlers.js
 * Handler quirúrgico para ASK_LANGUAGE
 */

import { nowIso } from '../utils/common.js';
import { getDefaultButtons } from '../src/governance/stageContract.js';

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const LANGUAGE_PATTERNS = {
  spanish: /\bespanol\b|\bspanish\b/,
  english: /\benglish\b|\bingles\b/
};
const CONSENT_ACCEPT_REGEX = /\b(si|s[ií]|acepto|aceptar|ok|dale|de acuerdo|agree|accept|yes)\b/i;
const CONSENT_REJECT_REGEX = /\b(no|no acepto|no quiero|rechazo|cancel|decline)\b/i;

function normalizeText(text) {
  if (!text) return '';
  const trimmed = String(text).trim().toLowerCase();
  return trimmed.normalize ? trimmed.normalize('NFD').replace(DIACRITICS_REGEX, '') : trimmed;
}

function detectLanguageTokenFromText(normalizedText) {
  if (LANGUAGE_PATTERNS.spanish.test(normalizedText)) {
    return 'BTN_LANG_ES_AR';
  }
  if (LANGUAGE_PATTERNS.english.test(normalizedText)) {
    return 'BTN_LANG_EN';
  }
  return null;
}

export async function handleAskLanguageStage(session, userText, buttonToken, sid, res, dependencies) {
  if (!session || !sid) {
    console.error('[ASK_LANGUAGE] Parámetros inválidos:', {
      hasSession: !!session,
      hasUserText: !!userText,
      hasSid: !!sid
    });
    return {
      ok: false,
      error: 'Parámetros inválidos',
      handled: true
    };
  }

  const { STATES, saveSessionAndTranscript, changeStage } = dependencies;
  const languageButtons = () => getDefaultButtons(STATES.ASK_LANGUAGE);

  try {
    const normalizedText = normalizeText(userText);
    const normalizedButtonToken = (buttonToken || '').trim().toUpperCase();
    const buttonLanguageToken =
      normalizedButtonToken === 'BTN_LANG_ES_AR'
        ? 'BTN_LANG_ES_AR'
        : normalizedButtonToken === 'BTN_LANG_EN'
          ? 'BTN_LANG_EN'
          : null;
    const textLanguageToken = detectLanguageTokenFromText(normalizedText);
    const selectedLanguageToken = buttonLanguageToken || textLanguageToken;

    console.log('[ASK_LANGUAGE] Debug:', {
      buttonToken,
      normalizedButtonToken,
      buttonLanguageToken,
      textLanguageToken,
      selectedLanguageToken,
      gdprConsent: session.gdprConsent,
      userText: userText?.substring(0, 50),
      normalizedText: normalizedText?.substring(0, 50)
    });

    const consentAccepted = !session.gdprConsent && CONSENT_ACCEPT_REGEX.test(normalizedText);
    const consentRejected = !session.gdprConsent && CONSENT_REJECT_REGEX.test(normalizedText);

    if (consentAccepted) {
      session.gdprConsent = true;
      session.gdprConsentDate = nowIso();
      console.log('[GDPR] Consentimiento otorgado:', session.gdprConsentDate);

      const reply = `🆔 **${sid}**\n\nGracias por aceptar.\n\nSeleccioná tu idioma / Select your language:`;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso(), stage: session.stage });
      await saveSessionAndTranscript(sid, session);

      return {
        ok: true,
        reply,
        stage: session.stage,
        buttons: languageButtons(),
        handled: true
      };
    }

    if (consentRejected) {
      // Detectar idioma preferido del usuario si está disponible
      const userPrefersEnglish = session.userLocale && String(session.userLocale).toLowerCase().startsWith('en');
      const reply = userPrefersEnglish
        ? "I understand. Without your consent I cannot continue."
        : 'Entiendo. Sin tu consentimiento no puedo continuar.';
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);

      return {
        ok: true,
        reply,
        stage: session.stage,
        handled: true
      };
    }

    // Verificar si ya se dio el consentimiento y se está seleccionando el idioma
    if (session.gdprConsent && selectedLanguageToken) {
      const isSpanish = selectedLanguageToken === 'BTN_LANG_ES_AR';
      const isEnglish = selectedLanguageToken === 'BTN_LANG_EN';
      if (isSpanish || isEnglish) {
        console.log('[ASK_LANGUAGE] Idioma seleccionado:', { isSpanish, isEnglish, selectedLanguageToken });
        session.userLocale = isSpanish ? 'es-AR' : 'en-US';
        changeStage(session, STATES.ASK_NAME);
        const reply = isSpanish
          ? 'Perfecto! Vamos a continuar en Español. ¿Con quién tengo el gusto de hablar?'
          : "Great! Let's continue in English. What's your name?";
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);

        console.log('[ASK_LANGUAGE] Avanzando a ASK_NAME, stage actual:', session.stage);

        return {
          ok: true,
          reply,
          stage: session.stage,
          handled: true
        };
      }
    }

    // Si hay consentimiento pero no se detectó el token de idioma, puede ser un problema
    if (session.gdprConsent && !selectedLanguageToken) {
      console.warn('[ASK_LANGUAGE] Consentimiento dado pero no se detectó token de idioma:', {
        buttonToken,
        userText,
        normalizedText
      });
    }

    // Mensaje de retry bilingüe ya que aún no se ha seleccionado el idioma
    const retry = 'Por favor, seleccioná una de las opciones usando los botones. / Please select one of the options using the buttons.';
    session.transcript.push({ who: 'bot', text: retry, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);

    return {
      ok: true,
      reply: retry,
      stage: session.stage,
      buttons: languageButtons(),
      handled: true
    };
  } catch (error) {
    console.error('[ASK_LANGUAGE] Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sid,
      stage: session?.stage
    });

    const isEnglish = session?.userLocale && String(session.userLocale).toLowerCase().startsWith('en');
    const errorReply = isEnglish
      ? "I'm sorry, there was an error processing your request. Please try again."
      : 'Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.';

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
