import { STAGES } from '../../flows/flowDefinition.js';
import {
  getStageContract,
  isTokenAllowed,
  STAGE_TYPES
} from './stageContract.js';

const FALLBACK_STAGE = STAGES?.ASK_LANGUAGE || 'ASK_LANGUAGE';

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeUserEvent(event = {}) {
  const isButton =
    event.type === 'button' ||
    event.action === 'button' ||
    typeof event.token === 'string' ||
    typeof event.value === 'string';

  if (isButton) {
    const token = event.token || event.value || null;
    const label = event.label || event.buttonLabel || token || '';

    return {
      type: 'button',
      rawText: toText(event.rawText || event.text || ''),
      normalized: label || token || '',
      token,
      label
    };
  }

  const rawText = toText(event.rawText || event.text || event.message || '');

  return {
    type: 'text',
    rawText,
    normalized: rawText.trim(),
    token: null,
    label: null
  };
}

function buildViolation(code, detail, extra = {}) {
  return {
    code,
    detail,
    ...extra
  };
}

export function enforceStage({ session = {}, userEvent = {} } = {}) {
  const stage = session?.stage || FALLBACK_STAGE;
  const contract = getStageContract(stage);
  const normalizedEvent = normalizeUserEvent(userEvent);

  if (!contract) {
    return {
      allowed: true,
      violations: [],
      normalizedEvent
    };
  }

  const violations = [];
  let reason = null;

  if (normalizedEvent.type === 'button') {
    if (!contract.allowButtons) {
      reason = reason || 'buttons_not_allowed';
      violations.push(
        buildViolation('buttons_not_allowed', `Stage ${stage} no acepta botones`, {
          stage,
          token: normalizedEvent.token
        })
      );
    } else if (!isTokenAllowed(stage, normalizedEvent.token)) {
      reason = reason || 'invalid_token_for_stage';
      violations.push(
        buildViolation(
          'invalid_token_for_stage',
          `Token ${normalizedEvent.token} no permitido en ${stage}`,
          {
            stage,
            token: normalizedEvent.token
          }
        )
      );
    }
  }

  if (
    normalizedEvent.type === 'text' &&
    !contract.allowText &&
    normalizedEvent.normalized
  ) {
    reason = reason || 'text_not_allowed';
    violations.push(
      buildViolation('text_not_allowed', `Stage ${stage} no acepta texto`, { stage })
    );
  }

  const shouldBlock =
    violations.length > 0 && contract.stageType === STAGE_TYPES.DETERMINISTIC;

  return {
    allowed: !shouldBlock,
    reason,
    violations,
    normalizedEvent
  };
}

export { normalizeUserEvent };
