/**
 * handlers/deviceHandler.js
 * Manejo del stage ASK_DEVICE
 */

import { nowIso, withOptions } from '../utils/common.js';
import { capitalizeToken } from './nameHandler.js';
import { changeStage, STATES } from './stateMachine.js';

/**
 * Maneja el stage ASK_DEVICE
 */
export async function handleDeviceStage(session, sid, res, t, buttonToken, deps) {
  const {
    buildUiButtonsFromTokens,
    saveSessionAndTranscript,
    generateAndShowSteps
  } = deps;

  const locale = session.userLocale || 'es-AR';
  const isEn = String(locale).toLowerCase().startsWith('en');
  
  if (!buttonToken || !/^BTN_DEV_/.test(buttonToken)) {
    const replyText = isEn
      ? 'Please choose one of the options using the buttons I showed you.'
      : (locale === 'es-419'
        ? 'Por favor, elige una de las opciones con los botones que te mostré.'
        : 'Por favor, elegí una de las opciones con los botones que te mostré.');
    session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    const optionTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
    return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: buildUiButtonsFromTokens(optionTokens, locale) }));
  }

  // If user clicked a device token
  if (buttonToken && /^BTN_DEV_/.test(buttonToken)) {
    const deviceMap = {
      BTN_DEV_PC_DESKTOP: { device: 'pc', pcType: 'desktop', label: 'PC de escritorio' },
      BTN_DEV_PC_ALLINONE: { device: 'pc', pcType: 'all_in_one', label: 'PC All in One' },
      BTN_DEV_NOTEBOOK: { device: 'notebook', pcType: null, label: 'Notebook' }
    };
    const devCfg = deviceMap[buttonToken];
    if (devCfg) {
      session.device = devCfg.device;
      if (devCfg.pcType) session.pcType = devCfg.pcType;
      session.pendingDeviceGroup = null;

      // IMPORTANT: do not re-ask the problem; proceed to generate steps using existing session.problem
      if (!session.problem || String(session.problem || '').trim() === '') {
        changeStage(session, STATES.ASK_PROBLEM);
        const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
        const replyText = isEn
          ? `Perfect, ${whoLabel}. I understand you're referring to ${devCfg.label}. Tell me, what problem does it have?`
          : (locale === 'es-419'
            ? `Perfecto, ${whoLabel}. Entiendo que te refieres a ${devCfg.label}. Cuéntame, ¿qué problema presenta?`
            : `Perfecto, ${whoLabel}. Tomo que te referís a ${devCfg.label}. Contame, ¿qué problema presenta?`);
        session.transcript.push({ who: 'bot', text: replyText, ts: nowIso() });
        await saveSessionAndTranscript(sid, session);
        return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: [] }));
      } else {
        // Check if the problem is "lentitud del sistema operativo o del equipo"
        const problemLower = String(session.problem || '').toLowerCase();
        const isSlownessProblem = problemLower.includes('lentitud') || 
                                  problemLower.includes('system slowness') ||
                                  problemLower.includes('lentitud del sistema');
        
        if (isSlownessProblem) {
          // Ask for operating system
          changeStage(session, STATES.ASK_OS);
          const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
          const replyText = isEn
            ? `Perfect, ${whoLabel}! I understand you're referring to ${devCfg.label} and the problem is system slowness. To give you the most accurate steps, I need to know what operating system you're using.`
            : (locale === 'es-419'
              ? `Perfecto, ${whoLabel}! Entiendo que te refieres a ${devCfg.label} y el problema es lentitud del sistema. Para darte los pasos más precisos, necesito saber qué sistema operativo estás usando.`
              : `Perfecto, ${whoLabel}! Tomo que te referís a ${devCfg.label} y el problema es lentitud del sistema. Para darte los pasos más precisos, necesito saber qué sistema operativo estás usando.`);
          const ts = nowIso();
          session.transcript.push({ who: 'bot', text: replyText, ts });
          await saveSessionAndTranscript(sid, session);
          
          // Show OS selection buttons
          const osButtons = buildUiButtonsFromTokens(['BTN_OS_WINDOWS', 'BTN_OS_MACOS', 'BTN_OS_LINUX'], locale);
          return res.json(withOptions({ ok: true, reply: replyText, stage: session.stage, options: osButtons }));
        } else {
          // Provide short confirmation then show steps
          changeStage(session, STATES.ASK_PROBLEM);
          const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'User' : 'Usuari@');
          const replyIntro = isEn
            ? `Perfect, ${whoLabel}. I understand you're referring to ${devCfg.label}. I'll generate some steps for this problem:`
            : (locale === 'es-419'
              ? `Perfecto, ${whoLabel}. Entiendo que te refieres a ${devCfg.label}. Voy a generar algunos pasos para este problema:`
              : `Perfecto, ${whoLabel}. Tomo que te referís a ${devCfg.label}. Voy a generar algunos pasos para este problema:`);
          const ts = nowIso();
          session.transcript.push({ who: 'bot', text: replyIntro, ts });
          await saveSessionAndTranscript(sid, session);
          // proceed to generate steps
          return await generateAndShowSteps(session, sid, res);
        }
      }
    }
  }

  const fallbackMsg = isEn
    ? 'I don\'t recognize that option. Please choose using the buttons.'
    : (locale === 'es-419'
      ? 'No reconozco esa opción. Elige por favor usando los botones.'
      : 'No reconozco esa opción. Elegí por favor usando los botones.');
  session.transcript.push({ who: 'bot', text: fallbackMsg, ts: nowIso() });
  await saveSessionAndTranscript(sid, session);
  const optionTokens = ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'];
  return res.json(withOptions({ ok: true, reply: fallbackMsg, stage: session.stage, options: buildUiButtonsFromTokens(optionTokens, locale) }));
}

