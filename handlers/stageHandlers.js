/**
 * handlers/stageHandlers.js
 * Handlers para stages determinísticos: ASK_LANGUAGE, ASK_USER_LEVEL
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

  const { STATES, saveSessionAndTranscript, changeStage, getSession } = dependencies || {};
  const languageButtons = () => getDefaultButtons(STATES.ASK_LANGUAGE);

  try {
    // Si tenemos getSession, recargar la sesión para asegurar datos actualizados
    if (getSession) {
      const freshSession = await getSession(sid);
      if (freshSession) {
        Object.assign(session, freshSession);
        console.log('[ASK_LANGUAGE] Sesión recargada - gdprConsent:', session.gdprConsent);
      }
    }

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
      console.log('[GDPR] ✅ Consentimiento otorgado:', session.gdprConsentDate);
      console.log('[GDPR] Guardando sesión con gdprConsent:', session.gdprConsent);

      const reply = `🆔 **${sid}**\n\nGracias por aceptar.\n\nSeleccioná tu idioma / Select your language:`;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso(), stage: session.stage });
      await saveSessionAndTranscript(sid, session);
      
      // Verificar que se guardó correctamente
      const verifySession = await dependencies.getSession?.(sid);
      if (verifySession) {
        console.log('[GDPR] ✅ Verificación post-guardado - gdprConsent:', verifySession.gdprConsent);
      }

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
    console.log('[ASK_LANGUAGE] Verificando selección de idioma:', {
      hasGdprConsent: !!session.gdprConsent,
      hasSelectedLanguageToken: !!selectedLanguageToken,
      selectedLanguageToken,
      buttonToken,
      normalizedButtonToken
    });

    if (session.gdprConsent && selectedLanguageToken) {
      const isSpanish = selectedLanguageToken === 'BTN_LANG_ES_AR';
      const isEnglish = selectedLanguageToken === 'BTN_LANG_EN';
      if (isSpanish || isEnglish) {
        console.log('[ASK_LANGUAGE] ✅ Idioma seleccionado:', { isSpanish, isEnglish, selectedLanguageToken });
        session.userLocale = isSpanish ? 'es-AR' : 'en-US';
        changeStage(session, STATES.ASK_NAME);
        const reply = isSpanish
          ? 'Perfecto! Vamos a continuar en Español. ¿Con quién tengo el gusto de hablar?'
          : "Great! Let's continue in English. What's your name?";
        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);

        console.log('[ASK_LANGUAGE] ✅ Avanzando a ASK_NAME, stage actual:', session.stage);

        return {
          ok: true,
          reply,
          stage: session.stage,
          handled: true
        };
      } else {
        console.warn('[ASK_LANGUAGE] ⚠️ Token de idioma no reconocido:', selectedLanguageToken);
      }
    } else {
      // Si hay consentimiento pero no se detectó el token de idioma, puede ser un problema
      if (session.gdprConsent && !selectedLanguageToken) {
        console.warn('[ASK_LANGUAGE] ⚠️ Consentimiento dado pero no se detectó token de idioma:', {
          buttonToken,
          normalizedButtonToken,
          buttonLanguageToken,
          textLanguageToken,
          userText: userText?.substring(0, 50),
          normalizedText: normalizedText?.substring(0, 50)
        });
      } else if (!session.gdprConsent && selectedLanguageToken) {
        console.warn('[ASK_LANGUAGE] ⚠️ Token de idioma detectado pero falta consentimiento GDPR');
      }
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

/**
 * Handler para ASK_USER_LEVEL
 * Procesa la selección del nivel de conocimiento del usuario (básico, intermedio, avanzado)
 */
export async function handleAskUserLevelStage(session, userText, buttonToken, sid, res, dependencies) {
  if (!session || !sid) {
    console.error('[ASK_USER_LEVEL] Parámetros inválidos:', {
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

  const { STATES, saveSessionAndTranscript, changeStage, getSession } = dependencies || {};
  const userLevelButtons = () => getDefaultButtons(STATES.ASK_USER_LEVEL);

  try {
    // Recargar sesión para asegurar datos actualizados
    if (getSession) {
      const freshSession = await getSession(sid);
      if (freshSession) {
        Object.assign(session, freshSession);
      }
    }

    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');

    const normalizedText = normalizeText(userText);
    const normalizedButtonToken = (buttonToken || '').trim().toUpperCase();
    
    // Detectar token de nivel de usuario
    const buttonUserLevelToken =
      normalizedButtonToken === 'BTN_USER_LEVEL_BASIC'
        ? 'BTN_USER_LEVEL_BASIC'
        : normalizedButtonToken === 'BTN_USER_LEVEL_INTERMEDIATE'
          ? 'BTN_USER_LEVEL_INTERMEDIATE'
          : normalizedButtonToken === 'BTN_USER_LEVEL_ADVANCED'
            ? 'BTN_USER_LEVEL_ADVANCED'
            : null;

    // Detectar nivel desde texto
    let textUserLevel = null;
    if (normalizedText.includes('basico') || normalizedText.includes('básico') || normalizedText.includes('basic')) {
      textUserLevel = 'BTN_USER_LEVEL_BASIC';
    } else if (normalizedText.includes('intermedio') || normalizedText.includes('intermediate')) {
      textUserLevel = 'BTN_USER_LEVEL_INTERMEDIATE';
    } else if (normalizedText.includes('avanzado') || normalizedText.includes('advanced')) {
      textUserLevel = 'BTN_USER_LEVEL_ADVANCED';
    }

    const selectedUserLevelToken = buttonUserLevelToken || textUserLevel;

    console.log('[ASK_USER_LEVEL] Debug:', {
      buttonToken,
      normalizedButtonToken,
      buttonUserLevelToken,
      textUserLevel,
      selectedUserLevelToken,
      userText: userText?.substring(0, 50),
      hasUserLevel: !!session.userLevel
    });

    // Si ya tiene nivel de usuario, avanzar directamente
    if (session.userLevel && !selectedUserLevelToken) {
      console.log('[ASK_USER_LEVEL] Usuario ya tiene nivel, avanzando a ASK_NEED');
      changeStage(session, STATES.ASK_NEED);
      const reply = isEn
        ? `What can I help you with today?`
        : `¿En qué puedo ayudarte hoy?`;
      session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      return {
        ok: true,
        reply,
        stage: session.stage,
        handled: true
      };
    }

    // Si no hay input y no tiene nivel, mostrar mensaje inicial
    if (!selectedUserLevelToken && !session.userLevel) {
      const userName = session.userName || (isEn ? 'there' : 'ahí');
      const initialMessage = isEn
        ? `Nice to meet you, ${userName}! To provide you with the best assistance, please select your technical knowledge level:`
        : (locale === 'es-419'
          ? `¡Encantado de conocerte, ${userName}! Para darte la mejor asistencia, por favor selecciona tu nivel de conocimiento técnico:`
          : `¡Encantado de conocerte, ${userName}! Para darte la mejor asistencia, por favor seleccioná tu nivel de conocimiento técnico:`);
      
      session.transcript.push({ who: 'bot', text: initialMessage, ts: nowIso() });
      await saveSessionAndTranscript(sid, session);
      
      return {
        ok: true,
        reply: initialMessage,
        stage: session.stage,
        buttons: userLevelButtons(),
        handled: true
      };
    }

    if (selectedUserLevelToken) {
      const isBasic = selectedUserLevelToken === 'BTN_USER_LEVEL_BASIC';
      const isIntermediate = selectedUserLevelToken === 'BTN_USER_LEVEL_INTERMEDIATE';
      const isAdvanced = selectedUserLevelToken === 'BTN_USER_LEVEL_ADVANCED';

      if (isBasic || isIntermediate || isAdvanced) {
        // Guardar nivel de usuario
        session.userLevel = isBasic ? 'basic' : isIntermediate ? 'intermediate' : 'advanced';
        changeStage(session, STATES.ASK_NEED);

        const reply = isEn
          ? `Perfect! I'll adjust my explanations to your ${session.userLevel} level. What can I help you with today?`
          : (locale === 'es-419'
            ? `¡Perfecto! Ajustaré mis explicaciones a tu nivel ${session.userLevel === 'basic' ? 'básico' : session.userLevel === 'intermediate' ? 'intermedio' : 'avanzado'}. ¿En qué puedo ayudarte hoy?`
            : `¡Perfecto! Voy a ajustar mis explicaciones a tu nivel ${session.userLevel === 'basic' ? 'básico' : session.userLevel === 'intermediate' ? 'intermedio' : 'avanzado'}. ¿En qué puedo ayudarte hoy?`);

        session.transcript.push({ who: 'bot', text: reply, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);

        console.log('[ASK_USER_LEVEL] ✅ Nivel seleccionado:', session.userLevel, 'Avanzando a ASK_NEED');

        return {
          ok: true,
          reply,
          stage: session.stage,
          handled: true
        };
      }
    }

    // Si no se detectó el nivel, mostrar mensaje de retry
    const retry = isEn
      ? 'Please select your knowledge level using the buttons: Basic, Intermediate, or Advanced.'
      : 'Por favor, seleccioná tu nivel de conocimiento usando los botones: Básico, Intermedio o Avanzado.';

    session.transcript.push({ who: 'bot', text: retry, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);

    return {
      ok: true,
      reply: retry,
      stage: session.stage,
      buttons: userLevelButtons(),
      handled: true
    };
  } catch (error) {
    console.error('[ASK_USER_LEVEL] Error en handler:', {
      error: error.message,
      stack: error.stack,
      sessionId: sid,
      stage: session?.stage
    });

    const isEn = session?.userLocale && String(session.userLocale).toLowerCase().startsWith('en');
    const errorReply = isEn
      ? "I'm sorry, there was an error processing your request. Please try again."
      : 'Lo siento, hubo un error procesando tu solicitud. Por favor, intentá de nuevo.';

    if (session) {
      session.transcript.push({ who: 'bot', text: errorReply, ts: nowIso() });
    }

    return {
      ok: false,
      reply: errorReply,
      stage: session?.stage || STATES?.ASK_USER_LEVEL,
      handled: true,
      error: error.message
    };
  }
}
