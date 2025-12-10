/**
 * handlers/osHandler.js
 * Manejo del stage ASK_OS (Ask Operating System)
 */

import { nowIso, withOptions } from '../utils/common.js';
import { capitalizeToken } from './nameHandler.js';
import { changeStage, STATES } from './stateMachine.js';

/**
 * Maneja el stage ASK_OS
 */
export async function handleOSStage(session, sid, res, t, buttonToken, deps) {
  const {
    buildUiButtonsFromTokens,
    saveSessionAndTranscript,
    generateAndShowSteps
  } = deps;

  const locale = session.userLocale || 'es-AR';
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (!buttonToken || !/^BTN_OS_/.test(buttonToken)) {
    const replyText = isEn
      ? 'Please choose one of the operating systems using the buttons I showed you.'
      : (locale === 'es-419'
        ? 'Por favor, elige uno de los sistemas operativos con los botones que te mostré.'
        : 'Por favor, elegí uno de los sistemas operativos con los botones que te mostré.');
    session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    const optionTokens = ['BTN_OS_WINDOWS', 'BTN_OS_MACOS', 'BTN_OS_LINUX'];
    return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: buildUiButtonsFromTokens(optionTokens, locale) }));
  }

  // If user clicked an OS token
  if (buttonToken && /^BTN_OS_/.test(buttonToken)) {
    const osMap = {
      'BTN_OS_WINDOWS': { os: 'Windows', label: 'Windows' },
      'BTN_OS_MACOS': { os: 'macOS', label: 'macOS' },
      'BTN_OS_LINUX': { os: 'Linux', label: 'Linux' }
    };
    const osCfg = osMap[buttonToken];
    if (osCfg) {
      // Save operating system to session
      session.userOS = osCfg.os;
      session.operatingSystem = osCfg.os; // Also save as operatingSystem for compatibility
      
      console.log(`[OS_SELECTION] ✅ Sistema operativo seleccionado: ${osCfg.os}`);
      
      // Generate steps with device and OS information
      const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
      const deviceLabel = session.device === 'pc' 
        ? (session.pcType === 'desktop' ? 'PC de escritorio' : session.pcType === 'all_in_one' ? 'PC All in One' : 'PC')
        : (session.device === 'notebook' ? 'Notebook' : session.device || 'equipo');
      
      const replyIntro = isEn
        ? `Perfect, ${whoLabel}! I understand you're referring to ${deviceLabel} with ${osCfg.label} and the problem is system slowness. I'll generate some specific steps for this configuration:`
        : (locale === 'es-419'
          ? `Perfecto, ${whoLabel}! Entiendo que te refieres a ${deviceLabel} con ${osCfg.label} y el problema es lentitud del sistema. Voy a generar algunos pasos específicos para esta configuración:`
          : `Perfecto, ${whoLabel}! Tomo que te referís a ${deviceLabel} con ${osCfg.label} y el problema es lentitud del sistema. Voy a generar algunos pasos específicos para esta configuración:`);
      
      changeStage(session, STATES.BASIC_TESTS);
      const ts = nowIso();
      session.transcript.push({ who: 'bot', text: replyIntro, ts });
      await saveSessionAndTranscript(sid, session);
      
      // Generate steps with device and OS context
      return await generateAndShowSteps(session, sid, res);
    }
  }

  const fallbackMsg = isEn
    ? 'I don\'t recognize that option. Please choose using the buttons.'
    : (locale === 'es-419'
      ? 'No reconozco esa opción. Elige por favor usando los botones.'
      : 'No reconozco esa opción. Elegí por favor usando los botones.');
  session.transcript.push({ who: 'bot', text: fallbackMsg, ts: nowIso() });
  await saveSessionAndTranscript(sid, session);
  const optionTokens = ['BTN_OS_WINDOWS', 'BTN_OS_MACOS', 'BTN_OS_LINUX'];
  return res.json(withOptions({ ok: true, reply: fallbackMsg, stage: session.stage, options: buildUiButtonsFromTokens(optionTokens, locale) }));
}

