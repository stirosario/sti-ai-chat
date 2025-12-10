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
 * Constantes de estados (STATES)
 * Compatible con la definición en server.js
 */
export const STATES = {
  ASK_LANGUAGE: 'ASK_LANGUAGE',
  ASK_NAME: 'ASK_NAME',
  ASK_NEED: 'ASK_NEED',
  CLASSIFY_NEED: 'CLASSIFY_NEED',
  ASK_DEVICE: 'ASK_DEVICE',
  ASK_OS: 'ASK_OS',
  ASK_PROBLEM: 'ASK_PROBLEM',
  DETECT_DEVICE: 'DETECT_DEVICE',
  ASK_HOWTO_DETAILS: 'ASK_HOWTO_DETAILS',
  GENERATE_HOWTO: 'GENERATE_HOWTO',
  BASIC_TESTS: 'BASIC_TESTS',
  ADVANCED_TESTS: 'ADVANCED_TESTS',
  ESCALATE: 'ESCALATE',
  CREATE_TICKET: 'CREATE_TICKET',
  TICKET_SENT: 'TICKET_SENT',
  ENDED: 'ENDED'
};

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
    transitions: ['BASIC_TESTS', 'ASK_PROBLEM', 'ASK_OS'],
    handler: null,
    validations: []
  },
  ASK_OS: {
    name: 'ASK_OS',
    description: 'Solicitar sistema operativo',
    transitions: ['BASIC_TESTS'],
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

/**
 * Cambia el stage de una sesión
 * @param {Object} session - Sesión actual
 * @param {string} newStage - Nuevo stage
 * @param {boolean} force - Forzar transición sin validación
 * @returns {Object} Resultado de la operación
 */
export function changeStage(session, newStage, force = false) {
  if (!session) {
    return { success: false, error: 'Session is required' };
  }
  
  const oldStage = session.stage;
  
  // Validar transición con state machine (excepto si es forzada o es el stage inicial)
  if (!force && oldStage && oldStage !== newStage) {
    if (!isValidTransition(oldStage, newStage)) {
      const validNext = getNextStages(oldStage);
      console.error(`[STAGE] ❌ Transición inválida: ${oldStage} → ${newStage}. Válidas: ${validNext.join(', ')}`);
      // En producción, permitir pero registrar error (no bloquear para evitar romper flujos existentes)
      // TODO: Después de validación extensiva, cambiar a bloquear transiciones inválidas
    } else {
      console.log(`[STAGE] ✅ Transición válida: ${oldStage} → ${newStage}`);
    }
  }
  
  // Validar que el nuevo stage existe en el state machine
  if (!force && !getStageInfo(newStage)) {
    console.warn(`[STAGE] ⚠️ Stage desconocido en state machine: ${newStage}`);
    // Permitir pero registrar advertencia
  }
  
  // Solo trackear si hay un cambio real
  if (oldStage && oldStage !== newStage) {
    if (!session.stageTransitions) {
      session.stageTransitions = [];
    }
    
    session.stageTransitions.push({
      from: oldStage,
      to: newStage,
      timestamp: new Date().toISOString(),
      validated: !force && isValidTransition(oldStage, newStage)
    });
    
    console.log(`[STAGE] 🔄 ${oldStage} → ${newStage}${force ? ' (forced)' : ''}`);
  }
  
  // Guardar stage inicial si no existe
  if (!session.initialStage) {
    session.initialStage = oldStage || newStage;
  }
  
  session.stage = newStage;
  
  return {
    success: true,
    oldStage,
    newStage
  };
}
