/**
 * decisionEngine.js
 * 
 * Motor de decisiones para el flujo conversacional.
 * Determina siguiente acción basándose en estado actual, input y contexto.
 * 
 * RESPONSABILIDADES:
 * - Validar transiciones de estado
 * - Resolver tipo de input (botón, texto libre, regex, AI)
 * - Determinar siguiente stage según contexto
 * - Aplicar reglas de negocio (loops, timeouts, etc.)
 * - Generar decisiones de escalamiento
 * 
 * COMPATIBILIDAD: Encapsula lógica de decisión del server.js
 */

import nlpService from '../services/nlpService.js';
import { STAGES, STATE_TRANSITIONS } from '../orchestrators/conversationOrchestrator.js';

// ========== CONFIGURACIÓN ==========
const MAX_RETRIES_PER_STAGE = 3;
const MAX_FAILED_STEPS = 3;
const LOOP_DETECTION_THRESHOLD = 5;

// ========== TIPOS DE INPUT ==========
const INPUT_TYPES = {
  BUTTON: 'button',
  TEXT: 'text',
  IMAGE: 'image',
  REGEX_MATCH: 'regex',
  AI_CLASSIFIED: 'ai'
};

// ========== PATRONES DE TOKENS DE BOTONES ==========
const BUTTON_PATTERNS = {
  // Botones de necesidad
  need: /^BTN_(PROBLEMA|CONSULTA)$/,
  
  // Botones de problemas comunes
  problem: /^BTN_(NO_ENCIENDE|NO_INTERNET|LENTITUD|BLOQUEO|PERIFERICOS|VIRUS)$/,
  
  // Botones de dispositivos
  device: /^BTN_DEV_\d+$/,
  
  // Botones de pasos
  step: /^BTN_STEP_(SUCCESS|FAILED|HELP)$/,
  
  // Botones de ticket
  ticket: /^BTN_(CREATE_TICKET|NO_TICKET|WHATSAPP)$/,
  
  // Botones de confirmación
  confirmation: /^BTN_(SI|NO|ACEPTO|CANCELO)$/
};

// ========== CLASE MOTOR DE DECISIONES ==========
class DecisionEngine {
  constructor() {
    this.decisionHistory = new Map(); // Map<sessionId, Decision[]>
  }

  /**
   * Tomar decisión sobre qué hacer con el input del usuario
   */
  async decide(session, userInput, analysis) {
    console.log(`[DecisionEngine] 🤔 Deciding for stage: ${session.stage}`);

    // 1. Clasificar tipo de input
    const inputClassification = this.classifyInput(userInput, analysis);

    // 2. Validar transición permitida
    const isValidTransition = this.validateTransition(
      session.stage,
      inputClassification.type
    );

    if (!isValidTransition) {
      return this.handleInvalidTransition(session, inputClassification);
    }

    // 3. Determinar siguiente stage
    const nextStage = this.determineNextStage(
      session.stage,
      inputClassification,
      analysis,
      session
    );

    // 4. Verificar reglas de negocio
    const businessRules = this.applyBusinessRules(session, nextStage, analysis);

    // 5. Construir decisión
    const decision = {
      currentStage: session.stage,
      nextStage: businessRules.nextStage || nextStage,
      inputType: inputClassification.type,
      action: businessRules.action || 'continue',
      confidence: inputClassification.confidence,
      metadata: {
        ...inputClassification.metadata,
        ...businessRules.metadata
      },
      timestamp: new Date().toISOString()
    };

    // 6. Registrar decisión
    this.recordDecision(session.sessionId, decision);

    console.log(`[DecisionEngine] ✅ Decision: ${session.stage} → ${decision.nextStage} (${decision.action})`);

    return decision;
  }

  /**
   * Clasificar tipo de input recibido
   */
  classifyInput(userInput, analysis) {
    // 1. Si es botón (tiene buttonToken)
    if (analysis.buttonToken) {
      const category = this.categorizeButton(analysis.buttonToken);
      return {
        type: INPUT_TYPES.BUTTON,
        value: analysis.buttonToken,
        category,
        confidence: 1.0,
        metadata: { buttonCategory: category }
      };
    }

    // 2. Si tiene imágenes
    if (analysis.hasImages) {
      return {
        type: INPUT_TYPES.IMAGE,
        value: userInput,
        confidence: 1.0,
        metadata: { imageCount: analysis.imageUrls.length }
      };
    }

    // 3. Si hay match de regex claro
    const regexMatch = this.matchRegexPatterns(userInput);
    if (regexMatch) {
      return {
        type: INPUT_TYPES.REGEX_MATCH,
        value: regexMatch.value,
        pattern: regexMatch.pattern,
        confidence: regexMatch.confidence,
        metadata: { regexPattern: regexMatch.pattern }
      };
    }

    // 4. Si NLP tiene alta confianza
    if (analysis.intent && analysis.intent.confidence > 0.7) {
      return {
        type: INPUT_TYPES.AI_CLASSIFIED,
        value: analysis.intent.intent,
        confidence: analysis.intent.confidence,
        metadata: { nlpMethod: analysis.intent.method }
      };
    }

    // 5. Texto libre genérico
    return {
      type: INPUT_TYPES.TEXT,
      value: userInput,
      confidence: 0.5,
      metadata: { requiresAI: analysis.intent?.confidence < 0.7 }
    };
  }

  /**
   * Categorizar botón por su token
   */
  categorizeButton(buttonToken) {
    for (const [category, pattern] of Object.entries(BUTTON_PATTERNS)) {
      if (pattern.test(buttonToken)) {
        return category;
      }
    }
    return 'unknown';
  }

  /**
   * Match de patrones regex conocidos
   */
  matchRegexPatterns(text) {
    const patterns = {
      affirmative: { 
        regex: /^(s[ií]|si|dale|ok|okay|correcto|exacto|eso|confirmo)$/i,
        value: 'yes',
        confidence: 0.9
      },
      negative: { 
        regex: /^(no|nop|nope|negativo|para nada)$/i,
        value: 'no',
        confidence: 0.9
      },
      help: {
        regex: /(ayuda|help|socorro|necesito ayuda|no entiendo)/i,
        value: 'help',
        confidence: 0.85
      }
    };

    for (const [pattern, config] of Object.entries(patterns)) {
      if (config.regex.test(text)) {
        return {
          pattern,
          value: config.value,
          confidence: config.confidence
        };
      }
    }

    return null;
  }

  /**
   * Validar si la transición es permitida
   */
  validateTransition(currentStage, inputType) {
    const stageConfig = STATE_TRANSITIONS[currentStage];
    
    if (!stageConfig) {
      console.warn(`[DecisionEngine] ⚠️ No config for stage: ${currentStage}`);
      return false;
    }

    const validInputs = stageConfig.validInputs || [];
    
    // 'any' permite cualquier tipo
    if (validInputs.includes('any')) {
      return true;
    }

    // Verificar si el tipo de input está permitido
    return validInputs.includes(inputType);
  }

  /**
   * Determinar siguiente stage basado en contexto
   */
  determineNextStage(currentStage, inputClassification, analysis, session) {
    const stageConfig = STATE_TRANSITIONS[currentStage];
    
    if (!stageConfig) {
      console.warn(`[DecisionEngine] No transition config for: ${currentStage}`);
      return currentStage;
    }

    const nextConfig = stageConfig.next;

    // Si next es string, retornar directamente
    if (typeof nextConfig === 'string') {
      return nextConfig;
    }

    // Si next es objeto, determinar según contexto
    if (typeof nextConfig === 'object') {
      // Lógica específica por stage
      if (currentStage === STAGES.ASK_NEED) {
        if (inputClassification.value === 'BTN_PROBLEMA') {
          return nextConfig.problema;
        }
        if (inputClassification.value === 'BTN_CONSULTA') {
          return nextConfig.consulta;
        }
        return nextConfig.default;
      }

      if (currentStage === STAGES.STEP_EXECUTION) {
        if (inputClassification.value === 'BTN_STEP_SUCCESS') {
          return nextConfig.success;
        }
        if (inputClassification.value === 'BTN_STEP_HELP') {
          return nextConfig.help;
        }
        if (session.currentStepIndex >= session.diagnosticSteps?.length - 1) {
          return nextConfig.no_more_steps;
        }
        return nextConfig.failed;
      }
    }

    // Si next es null, mantener stage actual (finalizado)
    if (nextConfig === null) {
      return currentStage;
    }

    // Fallback: mantener stage actual
    console.warn(`[DecisionEngine] Could not determine next stage from ${currentStage}`);
    return currentStage;
  }

  /**
   * Aplicar reglas de negocio
   */
  applyBusinessRules(session, proposedNextStage, analysis) {
    const rules = {
      nextStage: proposedNextStage,
      action: 'continue',
      metadata: {}
    };

    // REGLA: Detectar loops (usuario repite mismo input)
    if (this.detectLoop(session.sessionId)) {
      console.warn(`[DecisionEngine] 🔁 Loop detected for ${session.sessionId}`);
      rules.nextStage = STAGES.ESCALATION;
      rules.action = 'escalate';
      rules.metadata.reason = 'loop_detected';
      return rules;
    }

    // REGLA: Máximo de intentos fallidos
    if (session.currentStepIndex >= MAX_FAILED_STEPS) {
      console.warn(`[DecisionEngine] ❌ Max failed steps reached for ${session.sessionId}`);
      rules.nextStage = STAGES.ESCALATION;
      rules.action = 'escalate';
      rules.metadata.reason = 'max_failures';
      return rules;
    }

    // REGLA: Sentimiento muy negativo → ofrecer escalamiento
    if (analysis.sentiment?.sentiment === 'negative' && analysis.sentiment.score < -2) {
      console.log(`[DecisionEngine] 😞 Negative sentiment detected`);
      rules.metadata.suggestEscalation = true;
    }

    // REGLA: Urgencia alta → priorizar
    if (analysis.urgency?.isUrgent && analysis.urgency.level === 'high') {
      console.log(`[DecisionEngine] 🚨 High urgency detected`);
      rules.metadata.priority = 'high';
    }

    return rules;
  }

  /**
   * Detectar loops en la conversación
   */
  detectLoop(sessionId) {
    const history = this.decisionHistory.get(sessionId) || [];
    
    if (history.length < LOOP_DETECTION_THRESHOLD) {
      return false;
    }

    // Obtener últimas N decisiones
    const recent = history.slice(-LOOP_DETECTION_THRESHOLD);

    // Verificar si hay patrón repetitivo (mismo stage → mismo stage)
    const stages = recent.map(d => d.currentStage);
    const uniqueStages = new Set(stages);

    // Si todos los últimos N stages son iguales, es un loop
    return uniqueStages.size === 1;
  }

  /**
   * Manejar transición inválida
   */
  handleInvalidTransition(session, inputClassification) {
    console.warn(`[DecisionEngine] ⚠️ Invalid transition: ${session.stage} with ${inputClassification.type}`);

    return {
      currentStage: session.stage,
      nextStage: session.stage, // Mantener stage actual
      inputType: inputClassification.type,
      action: 'retry',
      confidence: 0.3,
      metadata: {
        error: 'invalid_transition',
        message: 'Por favor, usá las opciones disponibles.'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Registrar decisión en historial
   */
  recordDecision(sessionId, decision) {
    if (!this.decisionHistory.has(sessionId)) {
      this.decisionHistory.set(sessionId, []);
    }

    const history = this.decisionHistory.get(sessionId);
    history.push(decision);

    // Limitar historial a últimas 50 decisiones
    if (history.length > 50) {
      this.decisionHistory.set(sessionId, history.slice(-50));
    }
  }

  /**
   * Obtener historial de decisiones
   */
  getDecisionHistory(sessionId) {
    return this.decisionHistory.get(sessionId) || [];
  }

  /**
   * Limpiar historial de decisiones
   */
  clearHistory(sessionId) {
    this.decisionHistory.delete(sessionId);
  }

  /**
   * Estadísticas del motor
   */
  getStats() {
    return {
      activeSessions: this.decisionHistory.size,
      totalDecisions: Array.from(this.decisionHistory.values())
        .reduce((sum, history) => sum + history.length, 0)
    };
  }
}

// ========== SINGLETON ==========
const decisionEngine = new DecisionEngine();

export default decisionEngine;
export { DecisionEngine, INPUT_TYPES, BUTTON_PATTERNS };
