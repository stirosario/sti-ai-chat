import { STAGES } from '../../flows/flowDefinition.js';

export const STAGE_TYPES = {
  DETERMINISTIC: 'DETERMINISTIC',
  GUIDED: 'GUIDED',
  OPEN_TEXT: 'OPEN_TEXT'
};

const STAGE_IDS = {
  GDPR_CONSENT: STAGES?.GDPR_CONSENT || 'GDPR_CONSENT',
  CONSENT: STAGES?.CONSENT || 'CONSENT',
  ASK_LANGUAGE: STAGES?.ASK_LANGUAGE || 'ASK_LANGUAGE',
  ASK_NAME: STAGES?.ASK_NAME || 'ASK_NAME',
  ASK_USER_LEVEL: STAGES?.ASK_USER_LEVEL || STAGES?.ASK_KNOWLEDGE_LEVEL || 'ASK_USER_LEVEL',
  ASK_NEED: STAGES?.ASK_NEED || 'ASK_NEED',
  ASK_DEVICE: STAGES?.ASK_DEVICE || 'ASK_DEVICE',
  ASK_PROBLEM: STAGES?.ASK_PROBLEM || 'ASK_PROBLEM',
  BASIC_TESTS: STAGES?.BASIC_TESTS || 'BASIC_TESTS',
  ADVANCED_TESTS: STAGES?.ADVANCED_TESTS || 'ADVANCED_TESTS',
  ESCALATE: STAGES?.ESCALATE || 'ESCALATE',
  CREATE_TICKET: STAGES?.CREATE_TICKET || 'CREATE_TICKET',
  TICKET_SENT: STAGES?.TICKET_SENT || 'TICKET_SENT',
  ENDED: STAGES?.ENDED || 'ENDED'
};

const NAV_TOKENS = ['BTN_BACK', 'BTN_CHANGE_TOPIC', 'BTN_CLOSE'];
const CONFIRM_TOKENS = ['BTN_SOLVED', 'BTN_PERSIST', 'BTN_ADVANCED_TESTS'];
const ESCALATION_TOKENS = ['BTN_CONNECT_TECH', 'BTN_WHATSAPP_TECNICO'];

function withNav(tokens = []) {
  return Array.from(new Set([...(tokens || []), ...NAV_TOKENS]));
}

function findDefaultLabel(contract, token) {
  if (!contract || !Array.isArray(contract.defaultButtons)) {
    return null;
  }
  const match = contract.defaultButtons.find(btn => btn.token === token);
  return match ? match.label : null;
}

function toButtonObject(contract, stage, rawButton, orderFallback) {
  if (!rawButton) return null;

  if (typeof rawButton === 'string') {
    const token = rawButton;
    return {
      token,
      label: findDefaultLabel(contract, token) || token,
      order: orderFallback
    };
  }

  const token = rawButton.token || rawButton.value || null;
  if (!token) return null;

  const label =
    rawButton.label ||
    rawButton.text ||
    findDefaultLabel(contract, token) ||
    token;

  return {
    token,
    label,
    order: rawButton.order || orderFallback
  };
}

const STAGE_CONTRACT = {
  [STAGE_IDS.GDPR_CONSENT]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_GDPR_ACCEPT', 'BTN_GDPR_DECLINE'],
    maxButtons: 2,
    defaultButtons: [
      { token: 'BTN_GDPR_ACCEPT', label: 'Aceptar', order: 1 },
      { token: 'BTN_GDPR_DECLINE', label: 'No aceptar', order: 2 }
    ],
    prompt: 'Necesito tu consentimiento para continuar.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.CONSENT]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_ACCEPT', 'BTN_DECLINE'],
    maxButtons: 2,
    defaultButtons: [
      { token: 'BTN_ACCEPT', label: 'Si, aceptar', order: 1 },
      { token: 'BTN_DECLINE', label: 'No, gracias', order: 2 }
    ],
    prompt: 'Confirmame si queres continuar.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ASK_LANGUAGE]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['si', 'no', 'BTN_LANG_ES_AR', 'BTN_LANG_EN'],
    maxButtons: 4,
    defaultButtons: [
      { token: 'si', label: 'Aceptar', order: 1 },
      { token: 'no', label: 'No aceptar', order: 2 },
      { token: 'BTN_LANG_ES_AR', label: 'Espanol', order: 3 },
      { token: 'BTN_LANG_EN', label: 'English', order: 4 }
    ],
    prompt: 'Acepta privacidad y elegi idioma para seguir.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ASK_NAME]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: false,
    allowedTokens: [],
    maxButtons: 0,
    defaultButtons: [],
    prompt: 'Como te llamas?',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ASK_USER_LEVEL]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_USER_LEVEL_BASIC', 'BTN_USER_LEVEL_INTERMEDIATE', 'BTN_USER_LEVEL_ADVANCED'],
    maxButtons: 3,
    defaultButtons: [
      { token: 'BTN_USER_LEVEL_BASIC', label: 'Basico', order: 1 },
      { token: 'BTN_USER_LEVEL_INTERMEDIATE', label: 'Intermedio', order: 2 },
      { token: 'BTN_USER_LEVEL_ADVANCED', label: 'Avanzado', order: 3 }
    ],
    prompt: 'Elegir nivel para ajustar la ayuda.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
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
      { token: 'BTN_PROBLEMA', label: 'Tengo un problema', order: 1 },
      { token: 'BTN_CONSULTA', label: 'Es una consulta', order: 2 },
      { token: 'BTN_NO_ENCIENDE', label: 'No enciende', order: 3 },
      { token: 'BTN_NO_INTERNET', label: 'Sin internet', order: 4 },
      { token: 'BTN_LENTITUD', label: 'Lentitud', order: 5 },
      { token: 'BTN_BLOQUEO', label: 'Bloqueos', order: 6 },
      { token: 'BTN_PERIFERICOS', label: 'Perifericos', order: 7 },
      { token: 'BTN_VIRUS', label: 'Virus o malware', order: 8 }
    ],
    prompt: 'Contame si es problema o consulta.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ASK_DEVICE]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'],
    maxButtons: 3,
    defaultButtons: [
      { token: 'BTN_DEV_PC_DESKTOP', label: 'PC de escritorio', order: 1 },
      { token: 'BTN_DEV_PC_ALLINONE', label: 'All in one', order: 2 },
      { token: 'BTN_DEV_NOTEBOOK', label: 'Notebook', order: 3 }
    ],
    prompt: 'Elegir dispositivo para enfocar el soporte.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ASK_PROBLEM]: {
    stageType: STAGE_TYPES.OPEN_TEXT,
    allowText: true,
    allowButtons: true,
    allowedTokens: withNav([]),
    maxButtons: 3,
    defaultButtons: [],
    prompt: 'Describi el problema con el mayor detalle posible.',
    uiHints: { showInput: true, showAttach: true },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.BASIC_TESTS]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: withNav([
      ...CONFIRM_TOKENS,
      ...ESCALATION_TOKENS,
      'BTN_HELP_STEP_*'
    ]),
    maxButtons: 10,
    defaultButtons: [
      { token: 'BTN_SOLVED', label: 'Listo, se arreglo', order: 1 },
      { token: 'BTN_PERSIST', label: 'Sigue igual', order: 2 },
      { token: 'BTN_ADVANCED_TESTS', label: 'Quiero pruebas avanzadas', order: 3 },
      { token: 'BTN_CONNECT_TECH', label: 'Hablar con tecnico', order: 4 },
      { token: 'BTN_CLOSE', label: 'Cerrar chat', order: 5 }
    ],
    prompt: 'Te voy guiando paso a paso, avisame como sale.',
    uiHints: { showInput: true, showAttach: true },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ADVANCED_TESTS]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: withNav([
      ...CONFIRM_TOKENS,
      ...ESCALATION_TOKENS
    ]),
    maxButtons: 6,
    defaultButtons: [
      { token: 'BTN_SOLVED', label: 'Ya funciona', order: 1 },
      { token: 'BTN_PERSIST', label: 'No resulto', order: 2 },
      { token: 'BTN_CONNECT_TECH', label: 'Quiero un tecnico', order: 3 },
      { token: 'BTN_CLOSE', label: 'Cerrar chat', order: 4 }
    ],
    prompt: 'Sigamos con pruebas avanzadas, contame el resultado.',
    uiHints: { showInput: true, showAttach: true },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ESCALATE]: {
    stageType: STAGE_TYPES.GUIDED,
    allowText: true,
    allowButtons: true,
    allowedTokens: withNav([
      'BTN_ADVANCED_TESTS',
      ...ESCALATION_TOKENS
    ]),
    maxButtons: 5,
    defaultButtons: [
      { token: 'BTN_ADVANCED_TESTS', label: 'Mas pruebas', order: 1 },
      { token: 'BTN_CONNECT_TECH', label: 'Hablar con tecnico', order: 2 },
      { token: 'BTN_CLOSE', label: 'Cerrar chat', order: 3 }
    ],
    prompt: 'Puedo seguir probando o escalar a un humano, elegi.',
    uiHints: { showInput: true, showAttach: true },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.CREATE_TICKET]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: true,
    allowButtons: true,
    allowedTokens: ['BTN_CLOSE'],
    maxButtons: 1,
    defaultButtons: [
      { token: 'BTN_CLOSE', label: 'Cerrar chat', order: 1 }
    ],
    prompt: 'Estoy armando el ticket y te aviso al terminar.',
    uiHints: { showInput: true, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.TICKET_SENT]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: false,
    allowButtons: true,
    allowedTokens: ['BTN_CLOSE'],
    maxButtons: 1,
    defaultButtons: [
      { token: 'BTN_CLOSE', label: 'Cerrar chat', order: 1 }
    ],
    prompt: 'Ticket enviado, podes cerrar el chat cuando quieras.',
    uiHints: { showInput: false, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  },
  [STAGE_IDS.ENDED]: {
    stageType: STAGE_TYPES.DETERMINISTIC,
    allowText: false,
    allowButtons: true,
    allowedTokens: ['BTN_CLOSE'],
    maxButtons: 1,
    defaultButtons: [
      { token: 'BTN_CLOSE', label: 'Cerrar chat', order: 1 }
    ],
    prompt: 'La sesion termino.',
    uiHints: { showInput: false, showAttach: false },
    instrumentation: { logLevel: 'info', sampleRate: 1 }
  }
};

function tokenMatches(token, allowList = []) {
  if (!token) return false;
  return (allowList || []).some(value => {
    if (!value) return false;
    if (value.endsWith('*')) {
      return token.startsWith(value.slice(0, -1));
    }
    return value === token;
  });
}

export function getStageContract(stage) {
  return STAGE_CONTRACT[stage] || null;
}

export function getDefaultButtons(stage) {
  const contract = getStageContract(stage);
  if (!contract || !Array.isArray(contract.defaultButtons)) {
    return [];
  }
  return contract.defaultButtons.map(btn => ({ ...btn }));
}

export function isTokenAllowed(stage, token) {
  const contract = getStageContract(stage);
  if (!contract || !contract.allowButtons) {
    return false;
  }
  return tokenMatches(token, contract.allowedTokens || []);
}

export function sanitizeButtonsForStage(stage, buttons = []) {
  const contract = getStageContract(stage);
  if (!contract || !contract.allowButtons) {
    return [];
  }

  const allowList = contract.allowedTokens || [];
  const sanitized = [];

  (buttons || []).forEach((rawBtn, idx) => {
    const token =
      typeof rawBtn === 'string'
        ? rawBtn
        : rawBtn?.token || rawBtn?.value || null;
    if (!token || !tokenMatches(token, allowList)) {
      return;
    }
    const buttonObject = toButtonObject(
      contract,
      stage,
      rawBtn,
      rawBtn?.order || sanitized.length + 1 || idx + 1
    );
    if (buttonObject) {
      sanitized.push(buttonObject);
    }
  });

  const limit = contract.maxButtons || sanitized.length;
  return sanitized.slice(0, limit);
}

export function getStageViewModel(stage) {
  const contract = getStageContract(stage);
  if (!contract) {
    return {
      stageType: STAGE_TYPES.OPEN_TEXT,
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

export function getDeterministicStages() {
  return Object.keys(STAGE_CONTRACT).filter(
    key => STAGE_CONTRACT[key].stageType === STAGE_TYPES.DETERMINISTIC
  );
}

export { STAGE_CONTRACT };
