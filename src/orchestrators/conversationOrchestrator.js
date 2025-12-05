/**
 * conversationOrchestrator.js
 * 
 * Orquestador central del flujo de conversación.
 * Coordina servicios, gestiona transiciones de estado y genera respuestas.
 * 
 * RESPONSABILIDADES:
 * - Coordinar flujo entre servicios (NLP, OpenAI, Session, etc.)
 * - Gestionar máquina de estados de la conversación
 * - Procesar input del usuario y determinar siguiente acción
 * - Generar respuestas contextuales
 * - Manejar casos especiales (imágenes, escalamiento, etc.)
 * 
 * COMPATIBILIDAD: Encapsula la lógica del /api/chat sin cambiar el contrato
 */

import sessionService from '../services/sessionService.js';
import nlpService from '../services/nlpService.js';
import openaiService from '../services/openaiService.js';
import responseTemplates from '../templates/responseTemplates.js';

// ========== CONFIGURACIÓN DE STAGES ==========
const STAGES = {
  GREETING: 'greeting',
  ASK_NAME: 'ask_name',
  ASK_NEED: 'ask_need',
  PROBLEM_IDENTIFICATION: 'problem_identification',
  DEVICE_DISAMBIGUATION: 'device_disambiguation',
  DIAGNOSTIC_GENERATION: 'diagnostic_generation',
  STEP_EXECUTION: 'step_execution',
  ESCALATION: 'escalation',
  FAREWELL: 'farewell'
};

// ========== MÁQUINA DE ESTADOS ==========
const STATE_TRANSITIONS = {
  [STAGES.GREETING]: {
    next: STAGES.ASK_NAME,
    validInputs: ['any']
  },
  [STAGES.ASK_NAME]: {
    next: STAGES.ASK_NEED,
    validInputs: ['name']
  },
  [STAGES.ASK_NEED]: {
    next: {
      'problema': STAGES.PROBLEM_IDENTIFICATION,
      'consulta': STAGES.PROBLEM_IDENTIFICATION,
      'default': STAGES.PROBLEM_IDENTIFICATION
    },
    validInputs: ['button', 'text']
  },
  [STAGES.PROBLEM_IDENTIFICATION]: {
    next: STAGES.DEVICE_DISAMBIGUATION,
    validInputs: ['button', 'text', 'image']
  },
  [STAGES.DEVICE_DISAMBIGUATION]: {
    next: STAGES.DIAGNOSTIC_GENERATION,
    validInputs: ['button']
  },
  [STAGES.DIAGNOSTIC_GENERATION]: {
    next: STAGES.STEP_EXECUTION,
    validInputs: ['generated']
  },
  [STAGES.STEP_EXECUTION]: {
    next: {
      'success': STAGES.FAREWELL,
      'failed': STAGES.STEP_EXECUTION,
      'help': STAGES.ESCALATION,
      'no_more_steps': STAGES.ESCALATION
    },
    validInputs: ['button', 'text']
  },
  [STAGES.ESCALATION]: {
    next: STAGES.FAREWELL,
    validInputs: ['any']
  },
  [STAGES.FAREWELL]: {
    next: null,
    validInputs: []
  }
};

// ========== CLASE ORQUESTADOR ==========
class ConversationOrchestrator {
  constructor() {
    this.services = {
      session: sessionService,
      nlp: nlpService,
      ai: openaiService,
      templates: responseTemplates
    };
  }

  /**
   * Procesar mensaje del usuario
   */
  async processMessage(sessionId, userInput, metadata = {}) {
    try {
      // 1. Obtener o crear sesión
      let session = await this.services.session.getSession(sessionId);
      if (!session) {
        session = await this.services.session.createSession(sessionId, {
          stage: STAGES.GREETING
        });
      }

      console.log(`[Orchestrator] 📨 Processing message for ${sessionId} at stage: ${session.stage}`);

      // 2. Analizar input del usuario
      const analysis = await this.analyzeUserInput(userInput, session, metadata);

      // 3. Determinar siguiente acción según stage actual
      const response = await this.handleStage(session, userInput, analysis, metadata);

      // 4. Guardar historial y actualizar sesión
      await this.services.session.addMessageToHistory(sessionId, 'user', userInput.text || userInput);
      await this.services.session.addMessageToHistory(sessionId, 'assistant', response.text);

      // 5. Actualizar sesión con nuevos datos
      await this.services.session.saveSession(sessionId, session);

      console.log(`[Orchestrator] ✅ Response generated for ${sessionId}: ${response.text.substring(0, 50)}...`);

      return response;
    } catch (error) {
      console.error('[Orchestrator] ❌ Error processing message:', error);
      throw error;
    }
  }

  /**
   * Analizar input del usuario
   */
  async analyzeUserInput(userInput, session, metadata) {
    const text = typeof userInput === 'string' ? userInput : userInput.text || '';
    const hasImages = metadata.imageUrls && metadata.imageUrls.length > 0;

    // Análisis NLP del texto
    const nlpAnalysis = await this.services.nlp.analyzeText(text, {
      detectIntentFlag: true,
      classifyProblemFlag: session.isProblem,
      detectDeviceFlag: session.stage === STAGES.PROBLEM_IDENTIFICATION,
      analyzeSentimentFlag: true,
      useAI: false // Usar AI solo cuando sea necesario
    });

    return {
      ...nlpAnalysis,
      hasImages,
      imageUrls: metadata.imageUrls || [],
      isButton: metadata.isButton || false,
      buttonToken: metadata.buttonToken || null
    };
  }

  /**
   * Manejar stage actual
   */
  async handleStage(session, userInput, analysis, metadata) {
    const handlerName = `handle_${session.stage}`;
    const handler = this[handlerName];

    if (!handler) {
      console.warn(`[Orchestrator] ⚠️ No handler for stage: ${session.stage}`);
      return this.handleFallback(session, userInput, analysis);
    }

    return await handler.call(this, session, userInput, analysis, metadata);
  }

  /**
   * HANDLER: Saludo inicial
   */
  async handle_greeting(session, userInput, analysis) {
    const welcome = this.services.templates.generateWelcome(
      session.userName || 'Usuari@',
      session.locale || 'es'
    );

    session.stage = STAGES.ASK_NAME;

    return {
      text: welcome,
      options: [
        { type: 'button', label: '🔧 Tengo un problema técnico', value: 'BTN_PROBLEMA' },
        { type: 'button', label: '💬 Tengo una consulta general', value: 'BTN_CONSULTA' }
      ]
    };
  }

  /**
   * HANDLER: Solicitar nombre
   */
  async handle_ask_name(session, userInput, analysis) {
    const text = typeof userInput === 'string' ? userInput : userInput.text || '';
    const nameValidation = this.services.nlp.extractName(text);

    if (!nameValidation.valid) {
      return {
        text: this.services.templates.generateErrorMessage('invalidName', 'Usuari@', session.locale),
        options: []
      };
    }

    session.userName = nameValidation.name;
    session.stage = STAGES.ASK_NEED;

    return {
      text: `Perfecto ${session.userName}! ¿En qué puedo ayudarte?`,
      options: [
        { type: 'button', label: '🔧 Tengo un problema técnico', value: 'BTN_PROBLEMA' },
        { type: 'button', label: '💬 Tengo una consulta general', value: 'BTN_CONSULTA' }
      ]
    };
  }

  /**
   * HANDLER: Identificación de necesidad
   */
  async handle_ask_need(session, userInput, analysis) {
    // Detectar si es problema o consulta
    if (analysis.buttonToken === 'BTN_PROBLEMA' || analysis.intent?.intent === 'problema') {
      session.isProblem = true;
      session.needType = 'problema';
      session.stage = STAGES.PROBLEM_IDENTIFICATION;
    } else {
      session.isHowTo = true;
      session.needType = 'consulta';
      session.stage = STAGES.PROBLEM_IDENTIFICATION;
    }

    const intro = this.services.templates.generateProblemIntro(
      session.userName,
      session.locale
    );

    return {
      text: intro,
      options: [
        { type: 'button', label: '🔌 El equipo no enciende', value: 'BTN_NO_ENCIENDE' },
        { type: 'button', label: '📡 Problemas de conexión a Internet', value: 'BTN_NO_INTERNET' },
        { type: 'button', label: '🐢 Lentitud del sistema', value: 'BTN_LENTITUD' },
        { type: 'button', label: '❄️ Bloqueo o cuelgue', value: 'BTN_BLOQUEO' },
        { type: 'button', label: '🖨️ Problemas con periféricos', value: 'BTN_PERIFERICOS' },
        { type: 'button', label: '🛡️ Infecciones de malware', value: 'BTN_VIRUS' }
      ]
    };
  }

  /**
   * HANDLER: Identificación de problema
   */
  async handle_problem_identification(session, userInput, analysis) {
    const text = typeof userInput === 'string' ? userInput : userInput.text || '';

    // Guardar el problema
    session.problem = text;
    session.userText = text;

    // Verificar si hay dispositivo ambiguo
    if (analysis.device?.isAmbiguous) {
      session.stage = STAGES.DEVICE_DISAMBIGUATION;
      session.ambiguousDevice = analysis.device.term;

      const disambigMsg = this.services.templates.generateDeviceDisambiguation(
        session.userName,
        analysis.device.term,
        session.locale
      );

      return {
        text: disambigMsg,
        options: analysis.device.suggestions.map((sugg, idx) => ({
          type: 'button',
          label: sugg.label,
          value: `BTN_DEV_${idx}`
        }))
      };
    }

    // Si no hay ambigüedad, pasar a generación de diagnóstico
    session.stage = STAGES.DIAGNOSTIC_GENERATION;
    return this.handle_diagnostic_generation(session, userInput, analysis);
  }

  /**
   * HANDLER: Desambiguación de dispositivo
   */
  async handle_device_disambiguation(session, userInput, analysis) {
    // Guardar dispositivo seleccionado
    session.device = userInput.text || userInput;
    session.stage = STAGES.DIAGNOSTIC_GENERATION;

    return this.handle_diagnostic_generation(session, userInput, analysis);
  }

  /**
   * HANDLER: Generación de diagnóstico
   */
  async handle_diagnostic_generation(session, userInput, analysis) {
    const generating = this.services.templates.getTemplate(
      'diagnostic_generation',
      'generating',
      session.locale
    );

    // Aquí iría la lógica de generación de pasos (delegada a otro servicio)
    session.diagnosticSteps = ['Paso 1 placeholder', 'Paso 2 placeholder', 'Paso 3 placeholder'];
    session.currentStepIndex = 0;
    session.stage = STAGES.STEP_EXECUTION;

    const stepMsg = this.services.templates.generateStepMessage(
      0,
      session.diagnosticSteps.length,
      session.diagnosticSteps[0],
      session.userName,
      session.locale
    );

    return {
      text: `${generating}\n\n${stepMsg}`,
      options: [
        { type: 'button', label: '✅ Sí, funcionó', value: 'BTN_STEP_SUCCESS' },
        { type: 'button', label: '❌ No funcionó', value: 'BTN_STEP_FAILED' },
        { type: 'button', label: '❓ Necesito ayuda', value: 'BTN_STEP_HELP' }
      ]
    };
  }

  /**
   * HANDLER: Ejecución de pasos
   */
  async handle_step_execution(session, userInput, analysis) {
    if (analysis.buttonToken === 'BTN_STEP_SUCCESS') {
      // Problema resuelto
      session.stage = STAGES.FAREWELL;
      return {
        text: this.services.templates.generateSuccessMessage(session.userName, session.locale),
        options: []
      };
    }

    if (analysis.buttonToken === 'BTN_STEP_HELP') {
      // Escalar a humano
      session.stage = STAGES.ESCALATION;
      return this.handle_escalation(session, userInput, analysis);
    }

    // Avanzar al siguiente paso
    session.currentStepIndex++;

    if (session.currentStepIndex >= session.diagnosticSteps.length) {
      // No hay más pasos, escalar
      session.stage = STAGES.ESCALATION;
      return this.handle_escalation(session, userInput, analysis);
    }

    const stepMsg = this.services.templates.generateStepMessage(
      session.currentStepIndex,
      session.diagnosticSteps.length,
      session.diagnosticSteps[session.currentStepIndex],
      session.userName,
      session.locale
    );

    return {
      text: stepMsg,
      options: [
        { type: 'button', label: '✅ Sí, funcionó', value: 'BTN_STEP_SUCCESS' },
        { type: 'button', label: '❌ No funcionó', value: 'BTN_STEP_FAILED' },
        { type: 'button', label: '❓ Necesito ayuda', value: 'BTN_STEP_HELP' }
      ]
    };
  }

  /**
   * HANDLER: Escalamiento
   */
  async handle_escalation(session, userInput, analysis) {
    const intro = this.services.templates.getTemplate(
      'escalation',
      'intro',
      session.locale,
      { name: session.userName }
    );

    session.stage = STAGES.FAREWELL;

    return {
      text: `${intro}\n\n¿Querés que genere un ticket y te contacte por WhatsApp?`,
      options: [
        { type: 'button', label: '✅ Sí, generar ticket', value: 'BTN_CREATE_TICKET' },
        { type: 'button', label: '❌ No, gracias', value: 'BTN_NO_TICKET' }
      ]
    };
  }

  /**
   * HANDLER: Despedida
   */
  async handle_farewell(session, userInput, analysis) {
    return {
      text: this.services.templates.getTemplate(
        'farewell',
        'solved',
        session.locale,
        { name: session.userName }
      ),
      options: []
    };
  }

  /**
   * HANDLER: Fallback genérico
   */
  async handleFallback(session, userInput, analysis) {
    console.warn('[Orchestrator] Using fallback handler');
    return {
      text: 'Disculpá, no entendí bien. ¿Podrías reformular tu mensaje?',
      options: []
    };
  }

  /**
   * Obtener estado actual de la sesión
   */
  async getSessionState(sessionId) {
    const session = await this.services.session.getSession(sessionId);
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      stage: session.stage,
      userName: session.userName,
      problem: session.problem,
      device: session.device,
      currentStep: session.currentStepIndex,
      totalSteps: session.diagnosticSteps?.length || 0
    };
  }
}

// ========== SINGLETON ==========
const orchestrator = new ConversationOrchestrator();

export default orchestrator;
export { ConversationOrchestrator, STAGES, STATE_TRANSITIONS };
