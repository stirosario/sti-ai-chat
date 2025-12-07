/**
 * handlers/stateMachine.js
 * State Machine para gestionar transiciones de stages
 * 
 * Define claramente:
 * - Stage actual
 * - Posibles stages siguientes
 * - Handlers asociados
 * - Validaciones requeridas
 */

/**
 * Definición de la máquina de estados
 */
export const STATE_MACHINE = {
  ASK_LANGUAGE: {
    name: 'ASK_LANGUAGE',
    description: 'Solicitar consentimiento GDPR y selección de idioma',
    transitions: ['ASK_NAME'],
    handler: 'handleAskLanguageStage',
    validations: []
  },
  ASK_NAME: {
    name: 'ASK_NAME',
    description: 'Solicitar nombre del usuario',
    transitions: ['ASK_NEED'],
    handler: 'handleAskNameStage',
    validations: ['validateName']
  },
  ASK_NEED: {
    name: 'ASK_NEED',
    description: 'Detectar tipo de necesidad (problema/consulta)',
    transitions: ['ASK_PROBLEM', 'GUIDING_INSTALLATION'],
    handler: null, // Manejado por sistema inteligente
    validations: []
  },
  ASK_PROBLEM: {
    name: 'ASK_PROBLEM',
    description: 'Solicitar descripción del problema',
    transitions: ['ASK_DEVICE', 'BASIC_TESTS'],
    handler: null, // Manejado por sistema inteligente
    validations: []
  },
  ASK_DEVICE: {
    name: 'ASK_DEVICE',
    description: 'Identificar dispositivo afectado',
    transitions: ['BASIC_TESTS', 'ASK_PROBLEM'],
    handler: null,
    validations: []
  },
  BASIC_TESTS: {
    name: 'BASIC_TESTS',
    description: 'Ejecutar pruebas básicas de diagnóstico',
    transitions: ['ADVANCED_TESTS', 'ESCALATE', 'ENDED'],
    handler: null,
    validations: []
  },
  ADVANCED_TESTS: {
    name: 'ADVANCED_TESTS',
    description: 'Ejecutar pruebas avanzadas de diagnóstico',
    transitions: ['ESCALATE', 'ENDED'],
    handler: null,
    validations: []
  },
  ESCALATE: {
    name: 'ESCALATE',
    description: 'Escalar a técnico humano',
    transitions: ['CREATE_TICKET', 'ENDED'],
    handler: null,
    validations: []
  },
  CREATE_TICKET: {
    name: 'CREATE_TICKET',
    description: 'Crear ticket para WhatsApp',
    transitions: ['TICKET_SENT', 'ENDED'],
    handler: null,
    validations: []
  },
  TICKET_SENT: {
    name: 'TICKET_SENT',
    description: 'Ticket enviado exitosamente',
    transitions: ['ENDED'],
    handler: null,
    validations: []
  },
  ENDED: {
    name: 'ENDED',
    description: 'Conversación finalizada',
    transitions: [],
    handler: null,
    validations: []
  }
};

/**
 * Valida si una transición de stage es válida
 * @param {string} currentStage - Stage actual
 * @param {string} newStage - Stage destino
 * @returns {boolean} true si la transición es válida
 */
export function isValidTransition(currentStage, newStage) {
  const state = STATE_MACHINE[currentStage];
  if (!state) {
    console.warn(`[STATE_MACHINE] Stage desconocido: ${currentStage}`);
    return false;
  }
  
  return state.transitions.includes(newStage);
}

/**
 * Obtiene información de un stage
 * @param {string} stage - Nombre del stage
 * @returns {object|null} Información del stage o null
 */
export function getStageInfo(stage) {
  return STATE_MACHINE[stage] || null;
}

/**
 * Obtiene los posibles stages siguientes desde un stage actual
 * @param {string} currentStage - Stage actual
 * @returns {string[]} Array de stages posibles
 */
export function getNextStages(currentStage) {
  const state = STATE_MACHINE[currentStage];
  return state ? state.transitions : [];
}
