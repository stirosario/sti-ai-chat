/**
 * STAGE_CONTRACT.js
 * 
 * Single Source of Truth para la gobernanza del flujo conversacional.
 * Define el contrato completo de cada stage: qué permite, qué botones muestra,
 * qué tokens acepta, y cómo debe comportarse el sistema.
 * 
 * PRINCIPIOS:
 * - P0: Single Source of Truth (el backend define todo)
 * - P1: FSM manda (gobernanza)
 * - P2: 1 Botón = 1 Decisión Real
 * - P4: Stages iniciales son determinísticos (IA=OFF)
 */

import { STAGES } from '../flows/flowDefinition.js';

/**
 * Tipos de stages
 */
export const STAGE_TYPES = {
  DETERMINISTIC: 'DETERMINISTIC',  // Sin IA, completamente predecible
  GUIDED: 'GUIDED',                // Con botones y texto libre, IA puede ayudar
  OPEN_TEXT: 'OPEN_TEXT'           // Principalmente texto libre, IA activa
};

/**
 * CONTRATO COMPLETO POR STAGE
 * 
 * Cada entrada define:
 * - stageType: Tipo de stage (DETERMINISTIC | GUIDED | OPEN_TEXT)
 * - allowText: Si permite entrada de texto libre
 * - allowButtons: Si permite botones
 * - allowedTokens: Allowlist de tokens válidos para este stage (si allowButtons=true)
 * - maxButtons: Máximo de botones a mostrar
 * - defaultButtons: Botones por defecto (ordenados por orden de aparición)
 * - uiHints: Pistas para el frontend sobre qué UI mostrar
 * - instrumentation: Configuración de logging/observabilidad
 */
const STAGE_IDS = {
  GDPR_CONSENT: STAGES?.GDPR_CONSENT || 'GDPR_CONSENT',
  CONSENT: STAGES?.CONSENT || 'CONSENT',
  ASK_LANGUAGE: STAGES?.ASK_LANGUAGE || 'ASK_LANGUAGE',
  ASK_NAME: STAGES?.ASK_NAME || 'ASK_NAME',
  ASK_USER_LEVEL: STAGES?.ASK_USER_LEVEL || STAGES?.ASK_KNOWLEDGE_LEVEL || 'ASK_USER_LEVEL',
  ASK_NEED: STAGES?.ASK_NEED || 'ASK_NEED',
  ASK_DEVICE: STAGES?.ASK_DEVICE || 'ASK_DEVICE',
  ASK_OS: STAGES?.ASK_OS || 'ASK_OS',
  ASK_PROBLEM: STAGES?.ASK_PROBLEM || 'ASK_PROBLEM',
  BASIC_TESTS: STAGES?.BASIC_TESTS || 'BASIC_TESTS',
  ADVANCED_TESTS: STAGES?.ADVANCED_TESTS || 'ADVANCED_TESTS',
  ESCALATE: STAGES?.ESCALATE || 'ESCALATE',
  CREATE_TICKET: STAGES?.CREATE_TICKET || 'CREATE_TICKET',
  TICKET_SENT: STAGES?.TICKET_SENT || 'TICKET_SENT',
  ENDED: STAGES?.ENDED || 'ENDED'
};

export const STAGE_CONTRACT = {
  [STAGE_IDS.GDPR_CONSENT]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,  // Permite "sí", "si", "yes", etc.
    allowButtons: true,
    allowedTokens: ['si', 'no'],  // Valores simples para botones de consentimiento
    maxButtons: 2,
    defaultButtons: [
      { token: 'si', label: 'Sí Acepto / Yes, I Accept ✔️', order: 1 },
      { token: 'no', label: 'No Acepto / No, I Decline ❌', order: 2 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0  // 100% - crítico para auditoría
    }
  },

  [STAGE_IDS.CONSENT]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['si', 'no'],
    maxButtons: 2,
    defaultButtons: [
      { token: 'si', label: 'Sí Acepto / Yes, I Accept ✔️', order: 1 },
      { token: 'no', label: 'No Acepto / No, I Decline ❌', order: 2 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_LANGUAGE]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,  // Permite escribir "español", "english", etc.
    allowButtons: true,
    // Incluye consentimiento inicial (si/no) y selección de idioma
    allowedTokens: ['si', 'no', 'español', 'english', 'BTN_LANG_ES_AR', 'BTN_LANG_EN'],
    maxButtons: 4,
    defaultButtons: [
      { token: 'si', label: 'Sí Acepto / Yes, I Accept ✔️', order: 1 },
      { token: 'no', label: 'No Acepto / No, I Decline ❌', order: 2 },
      { token: 'español', label: '(🇦🇷) Español 🌎', order: 3 },
      { token: 'english', label: '(🇺🇸) English 🌎', order: 4 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_NAME]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: false,  // ✅ HARD RULE: ASK_NAME NO tiene botones
    allowedTokens: [],    // ✅ HARD RULE: Ningún token permitido
    maxButtons: 0,
    defaultButtons: [],   // ✅ HARD RULE: Array vacío
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_USER_LEVEL]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,  // Permite escribir "básico", "intermedio", "avanzado"
    allowButtons: true,
    allowedTokens: ['BTN_USER_LEVEL_BASIC', 'BTN_USER_LEVEL_INTERMEDIATE', 'BTN_USER_LEVEL_ADVANCED'],
    maxButtons: 3,
    defaultButtons: [
      { token: 'BTN_USER_LEVEL_BASIC', label: '🔰 Básico', order: 1 },
      { token: 'BTN_USER_LEVEL_INTERMEDIATE', label: '⚙️ Intermedio', order: 2 },
      { token: 'BTN_USER_LEVEL_ADVANCED', label: '🚀 Avanzado', order: 3 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_NEED]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: [
      'BTN_PROBLEMA',
      'BTN_CONSULTA',
      'BTN_NO_ENCIENDE',
      'BTN_NO_INTERNET',
      'BTN_LENTITUD',
      'BTN_BLOQUEO',
      'BTN_PERIFERICOS',
      'BTN_VIRUS'
    ],
    maxButtons: 8,
    defaultButtons: [
      { token: 'BTN_PROBLEMA', label: '🔧 Tengo un problema', order: 1 },
      { token: 'BTN_CONSULTA', label: '❓ Tengo una consulta', order: 2 },
      { token: 'BTN_NO_ENCIENDE', label: '🔌 El equipo no enciende', order: 3 },
      { token: 'BTN_NO_INTERNET', label: '📡 Problemas de conexión a Internet', order: 4 },
      { token: 'BTN_LENTITUD', label: '🐢 Lentitud del sistema operativo o del equipo', order: 5 },
      { token: 'BTN_BLOQUEO', label: '❄️ Bloqueo o cuelgue de programas', order: 6 },
      { token: 'BTN_PERIFERICOS', label: '🖨️ Problemas con periféricos externos', order: 7 },
      { token: 'BTN_VIRUS', label: '🦠 Virus o malware', order: 8 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_DEVICE]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'],
    maxButtons: 3,
    defaultButtons: [
      { token: 'BTN_DEV_PC_DESKTOP', label: '🖥️ PC de Escritorio', order: 1 },
      { token: 'BTN_DEV_PC_ALLINONE', label: '🖥️ All-in-One', order: 2 },
      { token: 'BTN_DEV_NOTEBOOK', label: '💻 Notebook', order: 3 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_OS]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_OS_WINDOWS', 'BTN_OS_MACOS', 'BTN_OS_LINUX'],
    maxButtons: 3,
    defaultButtons: [
      { token: 'BTN_OS_WINDOWS', label: '🪟 Windows', order: 1 },
      { token: 'BTN_OS_MACOS', label: '🍏 macOS', order: 2 },
      { token: 'BTN_OS_LINUX', label: '🐧 Linux', order: 3 }
    ],
    uiHints: {
      showInput: true,
      showAttach: false,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ASK_PROBLEM]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_BACK', 'BTN_CLOSE'],
    maxButtons: 2,
    defaultButtons: [
      { token: 'BTN_BACK', label: '⏪ Volver atrás', order: 1 },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 2 }
    ],
    uiHints: {
      showInput: true,
      showAttach: true,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.BASIC_TESTS]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: [
      'BTN_SOLVED',
      'BTN_PERSIST',
      'BTN_ADVANCED_TESTS',
      'BTN_CONNECT_TECH',
      'BTN_CLOSE',
      'BTN_BACK',
      'BTN_BACK_TO_STEPS',
      'BTN_HELP_STEP_1',
      'BTN_HELP_STEP_2',
      'BTN_HELP_STEP_3',
      'BTN_HELP_STEP_4',
      'BTN_HELP_STEP_5',
      'BTN_HELP_STEP_6',
      'BTN_HELP_STEP_7',
      'BTN_HELP_STEP_8',
      'BTN_HELP_STEP_9',
      'BTN_HELP_STEP_10',
      'BTN_HELP_STEP_',       // Prefijo para ayudas dinámicas
      'BTN_WHATSAPP_TECNICO'
    ],
    maxButtons: 12,  // Ayuda para cada paso + botones finales
    defaultButtons: [
      // Botones de ayuda se agregan dinámicamente según pasos entregados
      { token: 'BTN_SOLVED', label: '👍 Ya lo solucioné', order: 100 },
      { token: 'BTN_PERSIST', label: '❌ Todavía no funciona', order: 101 },
      { token: 'BTN_ADVANCED_TESTS', label: '🔬 Pruebas Avanzadas', order: 102 },
      { token: 'BTN_CONNECT_TECH', label: '👨‍💻 Conectar con técnico', order: 103 },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 104 }
    ],
    uiHints: {
      showInput: true,
      showAttach: true,  // Permitir adjuntar imágenes en pruebas
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ADVANCED_TESTS]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: [
      'BTN_SOLVED',
      'BTN_PERSIST',
      'BTN_CONNECT_TECH',
      'BTN_CLOSE',
      'BTN_BACK',
      'BTN_BACK_TO_STEPS'
    ],
    maxButtons: 4,
    defaultButtons: [
      { token: 'BTN_SOLVED', label: '👍 Ya lo solucioné', order: 1 },
      { token: 'BTN_PERSIST', label: '❌ Todavía no funciona', order: 2 },
      { token: 'BTN_CONNECT_TECH', label: '👨‍💻 Conectar con técnico', order: 3 },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 4 }
    ],
    uiHints: {
      showInput: true,
      showAttach: true,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ESCALATE]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: [
      'BTN_CONNECT_TECH',
      'BTN_CLOSE',
      'BTN_BACK'
    ],
    maxButtons: 3,
    defaultButtons: [
      { token: 'BTN_CONNECT_TECH', label: '👨‍💻 Conectar con técnico', order: 1 },
      { token: 'BTN_BACK', label: '⏪ Volver atrás', order: 2 },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 3 }
    ],
    uiHints: {
      showInput: true,
      showAttach: true,
      showTranscriptLink: false
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.CREATE_TICKET]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: [
      'BTN_CONNECT_TECH',
      'BTN_CLOSE'
    ],
    maxButtons: 2,
    defaultButtons: [
      { token: 'BTN_CONNECT_TECH', label: '👨‍💻 Conectar con técnico', order: 1 },
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 2 }
    ],
    uiHints: {
      showInput: true,
      showAttach: true,
      showTranscriptLink: true
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.TICKET_SENT]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: false,
    allowButtons: true,
    allowedTokens: ['BTN_CLOSE'],
    maxButtons: 1,
    defaultButtons: [
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 1 }
    ],
    uiHints: {
      showInput: false,
      showAttach: false,
      showTranscriptLink: true
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  },

  [STAGE_IDS.ENDED]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: false,
    allowButtons: true,
    allowedTokens: ['BTN_CLOSE'],
    maxButtons: 1,
    defaultButtons: [
      { token: 'BTN_CLOSE', label: '🔚 Cerrar Chat', order: 1 }
    ],
    uiHints: {
      showInput: false,
      showAttach: false,
      showTranscriptLink: true
    },
    instrumentation: {
      logLevel: 'info',
      sampleRate: 1.0
    }
  }
};

/**
 * Obtener el contrato de un stage
 * @param {string} stage - Nombre del stage
 * @returns {object|null} Contrato del stage o null si no existe
 */
export function getStageContract(stage) {
  return STAGE_CONTRACT[stage] || null;
}

/**
 * Verificar si un token es válido para un stage
 * @param {string} stage - Nombre del stage
 * @param {string} token - Token a validar
 * @returns {boolean} true si el token es válido
 */
function tokenMatchesAllowed(token, allowedTokens = []) {
  const safeToken = token || '';
  return allowedTokens.some(allowed => {
    if (!allowed) return false;
    if (allowed === safeToken) return true;
    // Permitir prefijos dinámicos (ej: BTN_HELP_STEP_)
    if (allowed.endsWith('*') && safeToken.startsWith(allowed.slice(0, -1))) return true;
    if (allowed.endsWith('_') && safeToken.startsWith(allowed)) return true;
    return false;
  });
}

export function isTokenAllowed(stage, token) {
  const contract = getStageContract(stage);
  if (!contract) return false;
  if (!contract.allowButtons) return false;
  return tokenMatchesAllowed(token, contract.allowedTokens || []);
}

/**
 * Obtener botones por defecto de un stage
 * @param {string} stage - Nombre del stage
 * @returns {Array} Array de botones por defecto
 */
export function getDefaultButtons(stage) {
  const contract = getStageContract(stage);
  if (!contract) return [];
  return [...contract.defaultButtons];  // Copia para no mutar el original
}

/**
 * Verificar si un stage es determinístico
 * @param {string} stage - Nombre del stage
 * @returns {boolean} true si es determinístico
 */
export function isDeterministicStage(stage) {
  const contract = getStageContract(stage);
  if (!contract) return false;
  return contract.stageType === STAGE_TYPES.DETERMINISTIC;
}

/**
 * Obtener lista de stages determinísticos
 * @returns {Array<string>} Array de nombres de stages determinísticos
 */
export function getDeterministicStages() {
  return Object.keys(STAGE_CONTRACT).filter(stage => 
    STAGE_CONTRACT[stage].stageType === STAGE_TYPES.DETERMINISTIC
  );
}

/**
 * Validar que un array de botones cumple con el contrato del stage
 * @param {string} stage - Nombre del stage
 * @param {Array} buttons - Array de botones a validar
 * @returns {{valid: boolean, violations: Array}} Resultado de la validación
 */
export function validateButtons(stage, buttons) {
  const contract = getStageContract(stage);
  const violations = [];

  if (!contract) {
    violations.push({ code: 'NO_CONTRACT', detail: `No contract found for stage: ${stage}` });
    return { valid: false, violations };
  }

  // Validar cantidad de botones
  if (buttons.length > contract.maxButtons) {
    violations.push({
      code: 'MAX_BUTTONS_EXCEEDED',
      detail: `Stage ${stage} allows max ${contract.maxButtons} buttons, got ${buttons.length}`
    });
  }

  // Validar si permite botones
  if (!contract.allowButtons && buttons.length > 0) {
    violations.push({
      code: 'BUTTONS_NOT_ALLOWED',
      detail: `Stage ${stage} does not allow buttons (allowButtons=false)`
    });
  }

  // Validar tokens permitidos
  if (contract.allowButtons) {
    buttons.forEach((btn, idx) => {
      const token = btn.token || btn.value || '';
      if (token && !tokenMatchesAllowed(token, contract.allowedTokens || [])) {
        violations.push({
          code: 'INVALID_TOKEN',
          detail: `Button at index ${idx} has invalid token "${token}" for stage ${stage}. Allowed: ${contract.allowedTokens.join(', ')}`
        });
      }
    });
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

