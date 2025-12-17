/**
 * turnLogger.js
 * 
 * Event Logging Turn-Based para observabilidad completa.
 * 
 * Persiste un registro por cada turno (interacción), permitiendo:
 * - Replay completo de conversaciones
 * - Auditoría de violaciones
 * - Análisis de UX y flujo
 * - Debug de problemas
 * 
 * PRINCIPIOS:
 * - P3: Observabilidad por turno
 * - Todo lo visto/mostrado/clickeado queda auditado
 */

/**
 * Generar ID único para turno
 * @returns {string} ID único
 */
function generateTurnId() {
  return `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Estructura de un registro de turno
 */
export class TurnLog {
  constructor(data = {}) {
    this.turnId = data.turnId || generateTurnId();
    this.ts = data.ts || new Date().toISOString();
    this.sessionId = data.sessionId || null;
    this.stageBefore = data.stageBefore || null;
    this.userEvent = data.userEvent || {};
    this.nlp = data.nlp || null;
    this.bot = data.bot || {};
    this.buttonsShown = data.buttonsShown || [];
    this.transitionReason = data.transitionReason || null;
    this.violations = data.violations || [];
    this.ui = data.ui || {};
    this.metadata = data.metadata || {};
  }

  /**
   * Convertir a objeto plano para almacenamiento
   */
  toJSON() {
    return {
      turnId: this.turnId,
      ts: this.ts,
      sessionId: this.sessionId,
      stageBefore: this.stageBefore,
      userEvent: this.userEvent,
      nlp: this.nlp,
      bot: this.bot,
      buttonsShown: this.buttonsShown,
      transitionReason: this.transitionReason,
      violations: this.violations,
      ui: this.ui,
      metadata: this.metadata
    };
  }
}

/**
 * Crear un registro de turno desde una interacción
 * 
 * @param {object} params - Parámetros del turno
 * @param {string} params.sessionId - ID de sesión
 * @param {string} params.stageBefore - Stage antes del turno
 * @param {object} params.userEvent - Evento del usuario
 * @param {object} params.nlp - Resultado de NLP (opcional)
 * @param {object} params.bot - Respuesta del bot
 * @param {Array} params.buttonsShown - Botones mostrados
 * @param {string} params.transitionReason - Razón de transición de stage
 * @param {Array} params.violations - Violaciones detectadas
 * @param {object} params.ui - Info de UI (opcional)
 * @param {object} params.metadata - Metadata adicional
 * @returns {TurnLog} Registro de turno creado
 */
export function createTurnLog(params) {
  const {
    sessionId,
    stageBefore,
    userEvent,
    nlp = null,
    bot,
    buttonsShown = [],
    transitionReason = null,
    violations = [],
    ui = {},
    metadata = {}
  } = params;

  return new TurnLog({
    turnId: generateTurnId(),
    ts: new Date().toISOString(),
    sessionId,
    stageBefore,
    userEvent: {
      type: userEvent.type || null,  // 'text' | 'button'
      rawText: userEvent.rawText || null,
      token: userEvent.token || null,
      label: userEvent.label || null,
      normalized: userEvent.normalized || null
    },
    nlp: nlp ? {
      intent: nlp.intent || null,
      confidence: nlp.confidence || null,
      entities: nlp.entities || []
    } : null,
    bot: {
      reply: bot.reply || '',
      stageAfter: bot.stageAfter || stageBefore,
      ok: bot.ok !== undefined ? bot.ok : true
    },
    buttonsShown: buttonsShown.map(btn => ({
      token: btn.token || btn.value || null,
      label: btn.label || btn.text || null,
      order: btn.order || null
    })),
    transitionReason,
    violations: violations.map(v => ({
      code: v.code || 'UNKNOWN',
      detail: v.detail || '',
      severity: v.severity || 'error',
      token: v.token || null,
      stage: v.stage || null
    })),
    ui: {
      clientVersion: ui.clientVersion || null,
      page: ui.page || null,
      userAgent: ui.userAgent || null
    },
    metadata
  });
}

/**
 * Guardar registro de turno en la sesión
 * 
 * @param {object} session - Sesión actual
 * @param {TurnLog} turnLog - Registro de turno
 */
export function saveTurnLog(session, turnLog) {
  if (!session.turnLogs) {
    session.turnLogs = [];
  }

  // Agregar a la lista de turnos
  session.turnLogs.push(turnLog.toJSON());

  // Mantener solo los últimos N turnos en memoria (opcional, para optimización)
  const MAX_TURNS_IN_MEMORY = 1000;
  if (session.turnLogs.length > MAX_TURNS_IN_MEMORY) {
    session.turnLogs = session.turnLogs.slice(-MAX_TURNS_IN_MEMORY);
  }

  // También agregar al transcript tradicional (para compatibilidad)
  if (!session.transcript) {
    session.transcript = [];
  }

  // Agregar evento del usuario
  if (turnLog.userEvent.type === 'text' && turnLog.userEvent.rawText) {
    session.transcript.push({
      who: 'user',
      text: turnLog.userEvent.normalized || turnLog.userEvent.rawText,
      ts: turnLog.ts,
      turnId: turnLog.turnId,
      inputType: 'text'
    });
  } else if (turnLog.userEvent.type === 'button' && turnLog.userEvent.token) {
    session.transcript.push({
      who: 'user',
      text: `[BUTTON:${turnLog.userEvent.label || turnLog.userEvent.token}]`,
      ts: turnLog.ts,
      turnId: turnLog.turnId,
      buttonToken: turnLog.userEvent.token,
      inputType: 'button'
    });
  }

  // Agregar respuesta del bot
  if (turnLog.bot.reply) {
    session.transcript.push({
      who: 'bot',
      text: turnLog.bot.reply,
      ts: turnLog.ts,
      turnId: turnLog.turnId,
      stage: turnLog.bot.stageAfter,
      buttons: turnLog.buttonsShown.map(btn => ({
        token: btn.token,
        label: btn.label,
        value: btn.token
      }))
    });
  }

  // Registrar violaciones si las hay
  if (turnLog.violations.length > 0) {
    session.transcript.push({
      who: 'system',
      text: `[VIOLATIONS:${turnLog.violations.map(v => v.code).join(',')}]`,
      ts: turnLog.ts,
      turnId: turnLog.turnId,
      violations: turnLog.violations
    });
  }
}

/**
 * Obtener todos los turnos de una sesión
 * 
 * @param {object} session - Sesión
 * @returns {Array} Array de registros de turnos
 */
export function getTurnLogs(session) {
  return session.turnLogs || [];
}

/**
 * Obtener un turno específico por turnId
 * 
 * @param {object} session - Sesión
 * @param {string} turnId - ID del turno
 * @returns {object|null} Registro del turno o null
 */
export function getTurnLog(session, turnId) {
  const logs = getTurnLogs(session);
  return logs.find(log => log.turnId === turnId) || null;
}

/**
 * Generar timeline de conversación desde turnos
 * 
 * @param {object} session - Sesión
 * @returns {Array} Array de eventos en formato timeline
 */
export function generateTimeline(session) {
  const turnLogs = getTurnLogs(session);
  
  return turnLogs.map(log => ({
    turnId: log.turnId,
    ts: log.ts,
    stageBefore: log.stageBefore,
    stageAfter: log.bot.stageAfter,
    userEvent: log.userEvent,
    botReply: log.bot.reply,
    buttonsShown: log.buttonsShown,
    transitionReason: log.transitionReason,
    violations: log.violations,
    nlp: log.nlp
  }));
}

