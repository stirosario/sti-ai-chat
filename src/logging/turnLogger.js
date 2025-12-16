function generateTurnId() {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUserEvent(userEvent = {}) {
  const isButton = userEvent.type === 'button' || typeof userEvent.token === 'string';

  if (isButton) {
    return {
      type: 'button',
      rawText: userEvent.rawText || userEvent.text || '',
      token: userEvent.token || null,
      label: userEvent.label || userEvent.buttonLabel || userEvent.token || '',
      normalized: userEvent.normalized || userEvent.token || ''
    };
  }

  const rawText = userEvent.rawText || userEvent.text || userEvent.message || '';
  return {
    type: 'text',
    rawText,
    token: null,
    label: null,
    normalized: typeof rawText === 'string' ? rawText.trim() : ''
  };
}

function normalizeButtons(buttons = []) {
  if (!Array.isArray(buttons)) {
    return [];
  }

  return buttons.map((btn, idx) => {
    if (typeof btn === 'string') {
      return {
        token: btn,
        label: btn,
        order: idx + 1
      };
    }

    return {
      token: btn?.token || btn?.value || null,
      label: btn?.label || btn?.text || btn?.token || '',
      order: btn?.order || idx + 1
    };
  });
}

export function startTurn({
  sessionId,
  stageBefore,
  stage_before,
  userEvent,
  user_event
} = {}) {
  const stage = stageBefore || stage_before || 'UNKNOWN_STAGE';
  const event = userEvent || user_event || {};

  return {
    turnId: generateTurnId(),
    sessionId: sessionId || 'unknown',
    stage_before: stage,
    user_event: normalizeUserEvent(event),
    ts: new Date().toISOString(),
    violations: []
  };
}

function ensureArrays(session) {
  if (!session.turnLogs) {
    session.turnLogs = [];
  }
  if (!session.transcript) {
    session.transcript = [];
  }
}

export function endTurn(
  turnContext,
  {
    session,
    botReply,
    bot_reply,
    buttonsShown = [],
    buttons_shown,
    stageAfter,
    stage_after,
    reason = 'reply',
    violations = []
  } = {}
) {
  if (!turnContext || !session) {
    return;
  }

  ensureArrays(session);

  const finalStage = stageAfter || stage_after || turnContext.stage_before;
  const reply = botReply || bot_reply || '';
  const buttons = normalizeButtons(buttonsShown || buttons_shown || []);

  const entry = {
    turnId: turnContext.turnId,
    sessionId: turnContext.sessionId,
    ts: turnContext.ts || new Date().toISOString(),
    stage_before: turnContext.stage_before,
    stage_after: finalStage,
    user_event: turnContext.user_event,
    bot_reply: reply,
    buttons_shown: buttons,
    reason,
    violations
  };

  session.turnLogs.push(entry);
  if (session.turnLogs.length > 200) {
    session.turnLogs = session.turnLogs.slice(-200);
  }

  const userEvent = turnContext.user_event;
  if (userEvent.type === 'text' && userEvent.rawText) {
    session.transcript.push({
      who: 'user',
      text: userEvent.normalized || userEvent.rawText,
      ts: entry.ts,
      stage: turnContext.stage_before,
      turnId: turnContext.turnId,
      inputType: 'text'
    });
  } else if (userEvent.type === 'button' && userEvent.token) {
    session.transcript.push({
      who: 'user',
      text: `[BUTTON:${userEvent.label || userEvent.token}]`,
      ts: entry.ts,
      stage: turnContext.stage_before,
      turnId: turnContext.turnId,
      buttonToken: userEvent.token,
      inputType: 'button'
    });
  }

  if (reply) {
    session.transcript.push({
      who: 'bot',
      text: reply,
      ts: entry.ts,
      stage: finalStage,
      turnId: turnContext.turnId,
      buttons
    });
  }

  if (violations && violations.length > 0) {
    session.transcript.push({
      who: 'system',
      text: `[VIOLATIONS:${violations.map(v => v.code).join(',')}]`,
      ts: entry.ts,
      stage: finalStage,
      turnId: turnContext.turnId,
      violations
    });
  }
}
