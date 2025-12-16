/**
 * stageEnforcer.js
 * 
 * Stage Enforcer - Guardrails y validación de flujo conversacional.
 * 
 * RESPONSABILIDADES:
 * - Validar tokens contra STAGE_CONTRACT antes de procesar
 * - Bloquear side-effects si hay violaciones
 * - Registrar violaciones en auditoría
 * - Asegurar que ningún módulo agregue botones fuera del contrato
 * 
 * PRINCIPIOS:
 * - P1: FSM manda (gobernanza)
 * - P2: 1 Botón = 1 Decisión Real
 * - P3: Observabilidad por turno
 * - P4: Safety/UX en stages determinísticos
 */

import {
  getStageContract,
  isTokenAllowed,
  getDefaultButtons,
  isDeterministicStage,
  validateButtons,
  STAGE_TYPES
} from '../config/stageContract.js';
import { STAGES } from '../flows/flowDefinition.js';
import {
  refreshCaseState,
  isTokenAllowedByCaseState
} from './caseState.js';

/**
 * Parsear evento del usuario
 * @param {object} input - Input del usuario (text, action, value, label, etc.)
 * @returns {object} Evento parseado {type, raw, token, label, normalized}
 */
export function parseUserEvent(input) {
  const { text, action, value, label } = input || {};

  // Determinar tipo de evento
  if (action === 'button' && value) {
    return {
      type: 'button',
      raw: null,
      token: String(value),
      label: label || value,
      normalized: label || value
    };
  }

  if (text && typeof text === 'string') {
    return {
      type: 'text',
      raw: text,
      token: null,
      label: null,
      normalized: text.trim()
    };
  }

  // Fallback: tratar como texto vacío
  return {
    type: 'text',
    raw: '',
    token: null,
    label: null,
    normalized: ''
  };
}

/**
 * Validar evento del usuario contra el contrato del stage
 * @param {string} stage - Stage actual
 * @param {object} userEvent - Evento parseado del usuario
 * @returns {{valid: boolean, violations: Array, response: object|null}} Resultado de validación
 */
export function validateUserEvent(stage, userEvent, session) {
  const violations = [];
  const contract = getStageContract(stage);

  if (!contract) {
    violations.push({
      code: 'NO_CONTRACT',
      detail: `No contract found for stage: ${stage}`,
      severity: 'error'
    });

    return {
      valid: false,
      violations,
      response: {
        ok: false,
        error: 'INTERNAL_ERROR',
        reply: 'Lo siento, hubo un error interno. Por favor, intentá de nuevo.',
        stage: stage
      }
    };
  }

  // Validar evento de botón
  if (userEvent.type === 'button') {
    // Verificar si el stage permite botones
    if (!contract.allowButtons) {
      violations.push({
        code: 'BUTTONS_NOT_ALLOWED',
        detail: `Stage ${stage} does not allow buttons (allowButtons=false)`,
        severity: 'error',
        token: userEvent.token,
        stage: stage
      });

      const defaultButtons = getDefaultButtons(stage);
      const reply = contract.stageType === 'DETERMINISTIC'
        ? 'Por favor, escribí tu respuesta en el campo de texto.'
        : 'Este stage no acepta botones. Por favor, escribí tu respuesta.';

      return {
        valid: false,
        violations,
        response: {
          ok: true,
          reply: reply,
          stage: stage,
          buttons: defaultButtons.map(btn => ({
            token: btn.token,
            label: btn.label,
            order: btn.order
          })),
          viewModel: {
            stageType: contract.stageType,
            allowText: contract.allowText,
            allowButtons: contract.allowButtons,
            maxButtons: contract.maxButtons
          },
          violations: violations
        }
      };
    }

    // Validar token contra allowlist
    if (!isTokenAllowed(stage, userEvent.token)) {
      violations.push({
        code: 'INVALID_TOKEN',
        detail: `Token "${userEvent.token}" is not allowed for stage "${stage}". Allowed tokens: ${contract.allowedTokens.join(', ')}`,
        severity: 'error',
        token: userEvent.token,
        stage: stage,
        allowedTokens: contract.allowedTokens
      });

      const defaultButtons = getDefaultButtons(stage);
      const reply = 'Por favor, seleccioná una opción válida de los botones disponibles.';

      return {
        valid: false,
        violations,
        response: {
          ok: true,
          reply: reply,
          stage: stage,
          buttons: defaultButtons.map(btn => ({
            token: btn.token,
            label: btn.label,
            order: btn.order
          })),
          viewModel: {
            stageType: contract.stageType,
            allowText: contract.allowText,
            allowButtons: contract.allowButtons,
            maxButtons: contract.maxButtons
          },
          violations: violations
        }
      };
    }

    // Validar contra caseState (gating dinámico)
    const gatingResult = isTokenAllowedByCaseState(session, stage, userEvent.token);
    if (!gatingResult.allowed) {
      violations.push({
        code: gatingResult.code || 'CASESTATE_BLOCKED',
        detail: gatingResult.detail,
        severity: 'error',
        token: userEvent.token,
        stage: stage
      });

      const defaultButtons = getDefaultButtons(stage);
      const reply = contract.stageType === STAGE_TYPES.DETERMINISTIC
        ? 'Ese botón todavía no está disponible. Elegí una de las opciones activas para continuar.'
        : 'Todavía no puedo ejecutar esa acción. Probá con las opciones mostradas.';

      return {
        valid: false,
        violations,
        response: {
          ok: true,
          reply,
          stage: stage,
          buttons: defaultButtons.map((btn, idx) => ({
            token: btn.token,
            label: btn.label,
            order: btn.order || idx + 1
          })),
          viewModel: {
            stageType: contract.stageType,
            allowText: contract.allowText,
            allowButtons: contract.allowButtons,
            maxButtons: contract.maxButtons
          },
          violations: violations
        }
      };
    }
  }

  // Validar evento de texto
  if (userEvent.type === 'text') {
    if (!contract.allowText && userEvent.normalized.length > 0) {
      violations.push({
        code: 'TEXT_NOT_ALLOWED',
        detail: `Stage ${stage} does not allow text input (allowText=false)`,
        severity: 'warning',
        stage: stage
      });
      // No bloqueamos, solo registramos (algunos stages pueden aceptar texto aunque no esté en el contrato)
    }
  }

  return {
    valid: violations.length === 0 || violations.every(v => v.severity === 'warning'),
    violations: violations.filter(v => v.severity === 'error'),  // Solo retornar errores críticos
    response: null
  };
}

/**
 * Aplicar guardrails antes de procesar el evento
 * Esta función debe llamarse ANTES de cualquier procesamiento o side-effect
 * 
 * @param {object} session - Sesión actual
 * @param {object} userEvent - Evento parseado del usuario
 * @param {object} options - Opciones adicionales { skipValidation: boolean }
 * @returns {{allowed: boolean, violations: Array, response: object|null, event: object}} Resultado
 */
export function enforceStageRules(session, userEvent, options = {}) {
  const { skipValidation = false } = options;
  const stageBefore = session.stage || STAGES.ASK_LANGUAGE;

  refreshCaseState(session);

  // Parsear evento si no está parseado
  let parsedEvent = userEvent;
  if (!parsedEvent.type) {
    parsedEvent = parseUserEvent(userEvent);
  }

  // Si skipValidation está activado (para casos especiales), permitir sin validar
  if (skipValidation) {
    return {
      allowed: true,
      violations: [],
      response: null,
      event: parsedEvent,
      stageBefore
    };
  }

  // Validar contra el contrato
  const validation = validateUserEvent(stageBefore, parsedEvent, session);

  if (!validation.valid) {
    // ❌ VIOLACIÓN DETECTADA: NO procesar, retornar respuesta de rechazo
    console.error('[STAGE_ENFORCER] ❌ Violación detectada:', {
      stage: stageBefore,
      eventType: parsedEvent.type,
      token: parsedEvent.token,
      violations: validation.violations
    });

    return {
      allowed: false,
      violations: validation.violations,
      response: validation.response,
      event: parsedEvent,
      stageBefore
    };
  }

  // ✅ VALIDACIÓN PASADA: Permitir procesamiento
  return {
    allowed: true,
    violations: [],
    response: null,
    event: parsedEvent,
    stageBefore
  };
}

/**
 * Validar y limpiar botones antes de enviar al frontend
 * Asegura que los botones cumplan con el contrato del stage
 * 
 * @param {string} stage - Stage actual
 * @param {Array} buttons - Botones a validar
 * @returns {{valid: boolean, buttons: Array, violations: Array}} Resultado
 */
export function enforceButtonRules(stage, buttons) {
  const validation = validateButtons(stage, buttons || []);

  if (!validation.valid) {
    console.warn('[STAGE_ENFORCER] ⚠️ Botones no cumplen contrato:', {
      stage,
      violations: validation.violations,
      buttonsReceived: buttons
    });

    // Si hay violaciones críticas, usar botones por defecto
    const criticalViolations = validation.violations.filter(v => 
      v.code === 'BUTTONS_NOT_ALLOWED' || v.code === 'NO_CONTRACT'
    );

    if (criticalViolations.length > 0) {
      const defaultButtons = getDefaultButtons(stage);
      return {
        valid: false,
        buttons: defaultButtons.map(btn => ({
          token: btn.token,
          label: btn.label,
          order: btn.order
        })),
        violations: validation.violations
      };
    }

    // Si solo hay violaciones menores, limpiar tokens inválidos
    const contract = getStageContract(stage);
    if (contract && contract.allowButtons) {
      const cleanedButtons = (buttons || []).filter(btn => {
        const token = btn.token || btn.value || '';
        return !token || contract.allowedTokens.includes(token);
      });

      // Limitar a maxButtons
      const limitedButtons = cleanedButtons.slice(0, contract.maxButtons);

      return {
        valid: false,
        buttons: limitedButtons,
        violations: validation.violations
      };
    }
  }

  return {
    valid: true,
    buttons: buttons || [],
    violations: []
  };
}

/**
 * Obtener configuración del ViewModel para el frontend
 * @param {string} stage - Stage actual
 * @returns {object} ViewModel con configuración de UI
 */
export function getViewModel(stage) {
  const contract = getStageContract(stage);
  if (!contract) {
    return {
      stageType: 'OPEN_TEXT',
      allowText: true,
      allowButtons: false,
      maxButtons: 0
    };
  }

  return {
    stageType: contract.stageType,
    allowText: contract.allowText,
    allowButtons: contract.allowButtons,
    maxButtons: contract.maxButtons,
    uiHints: contract.uiHints
  };
}

