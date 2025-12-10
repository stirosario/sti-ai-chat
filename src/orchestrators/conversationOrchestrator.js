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
import { emojiForIndex, enumerateSteps } from '../../utils/stepsUtils.js';

// ========== CONFIGURACIÓN DE STAGES (100% COMPATIBLE CON server.js) ==========
// Estos stages son IDÉNTICOS a los STATES del server.js (línea 2442-2458)
// NO MODIFICAR SIN ACTUALIZAR server.js
const STAGES = {
  ASK_LANGUAGE: 'ASK_LANGUAGE',        // ✅ Selección idioma + GDPR
  ASK_NAME: 'ASK_NAME',                // ✅ Pedir nombre
  ASK_NEED: 'ASK_NEED',                // ✅ Problema o consulta
  CLASSIFY_NEED: 'CLASSIFY_NEED',      // ✅ Clasificar tipo
  ASK_DEVICE: 'ASK_DEVICE',            // ✅ Tipo de dispositivo
  ASK_PROBLEM: 'ASK_PROBLEM',          // ✅ Describir problema
  DETECT_DEVICE: 'DETECT_DEVICE',      // ✅ Desambiguar dispositivo
  ASK_HOWTO_DETAILS: 'ASK_HOWTO_DETAILS', // ✅ Detalles de consulta
  GENERATE_HOWTO: 'GENERATE_HOWTO',    // ✅ Generar guía/diagnóstico
  BASIC_TESTS: 'BASIC_TESTS',          // ✅ Pruebas básicas
  ADVANCED_TESTS: 'ADVANCED_TESTS',    // ✅ Pruebas avanzadas
  ESCALATE: 'ESCALATE',                // ✅ Escalar a humano
  CREATE_TICKET: 'CREATE_TICKET',      // ✅ Crear ticket
  TICKET_SENT: 'TICKET_SENT',          // ✅ Ticket enviado
  ENDED: 'ENDED'                       // ✅ Conversación finalizada
};

// ========== MÁQUINA DE ESTADOS (FLUJO COMPLETO) ==========
const STATE_TRANSITIONS = {
  [STAGES.ASK_LANGUAGE]: {
    next: STAGES.ASK_NAME,
    validInputs: ['button'],  // BTN_LANG_ES_AR, BTN_LANG_EN
    description: 'Selección de idioma y aceptación GDPR'
  },
  [STAGES.ASK_NAME]: {
    next: STAGES.ASK_NEED,
    validInputs: ['text', 'button'],  // Texto o BTN_NO_NAME
    description: 'Solicitar nombre del usuario'
  },
  [STAGES.ASK_NEED]: {
    next: {
      'problema': STAGES.ASK_PROBLEM,
      'consulta': STAGES.ASK_HOWTO_DETAILS,
      'default': STAGES.ASK_PROBLEM
    },
    validInputs: ['button'],  // BTN_PROBLEMA, BTN_CONSULTA
    description: 'Identificar si es problema o consulta'
  },
  [STAGES.CLASSIFY_NEED]: {
    next: STAGES.ASK_PROBLEM,
    validInputs: ['automatic'],
    description: 'Clasificación automática del tipo de necesidad'
  },
  [STAGES.ASK_PROBLEM]: {
    next: STAGES.ASK_DEVICE,
    validInputs: ['text', 'image'],
    description: 'Describir el problema técnico'
  },
  [STAGES.ASK_DEVICE]: {
    next: STAGES.DETECT_DEVICE,
    validInputs: ['button', 'text'],  // BTN_DESKTOP, BTN_NOTEBOOK, etc.
    description: 'Seleccionar tipo de dispositivo'
  },
  [STAGES.DETECT_DEVICE]: {
    next: STAGES.GENERATE_HOWTO,
    validInputs: ['automatic'],
    description: 'Desambiguar dispositivo si es necesario'
  },
  [STAGES.ASK_HOWTO_DETAILS]: {
    next: STAGES.GENERATE_HOWTO,
    validInputs: ['text'],
    description: 'Detalles adicionales para consulta/guía'
  },
  [STAGES.GENERATE_HOWTO]: {
    next: STAGES.BASIC_TESTS,
    validInputs: ['generated'],
    description: 'Generar pasos de diagnóstico o guía'
  },
  [STAGES.BASIC_TESTS]: {
    next: {
      'solved': STAGES.ENDED,
      'persist': STAGES.ADVANCED_TESTS,
      'help': STAGES.BASIC_TESTS,  // Misma stage, dar ayuda
      'escalate': STAGES.ESCALATE
    },
    validInputs: ['button'],  // BTN_SOLVED, BTN_PERSIST, BTN_HELP_N
    description: 'Ejecutar y validar pruebas básicas'
  },
  [STAGES.ADVANCED_TESTS]: {
    next: {
      'solved': STAGES.ENDED,
      'persist': STAGES.ESCALATE,
      'help': STAGES.ADVANCED_TESTS,
      'more_tests': STAGES.ADVANCED_TESTS
    },
    validInputs: ['button'],  // BTN_SOLVED, BTN_PERSIST, BTN_TECH
    description: 'Ejecutar pruebas avanzadas'
  },
  [STAGES.ESCALATE]: {
    next: STAGES.CREATE_TICKET,
    validInputs: ['button'],  // BTN_TECH
    description: 'Confirmar escalamiento a técnico'
  },
  [STAGES.CREATE_TICKET]: {
    next: STAGES.TICKET_SENT,
    validInputs: ['automatic'],
    description: 'Crear ticket y generar link WhatsApp'
  },
  [STAGES.TICKET_SENT]: {
    next: STAGES.ENDED,
    validInputs: ['any'],
    description: 'Confirmar envío de ticket'
  },
  [STAGES.ENDED]: {
    next: null,
    validInputs: [],
    description: 'Conversación finalizada'
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
          stage: STAGES.ASK_LANGUAGE  // ✓ Actualizado
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
      detectDeviceFlag: session.stage === STAGES.ASK_PROBLEM,  // ✓ Actualizado
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
  async handle_ask_problem(session, userInput, analysis) {
    const text = typeof userInput === 'string' ? userInput : userInput.text || '';

    // Guardar el problema
    session.problem = text;
    session.userText = text;

    // Verificar si hay dispositivo ambiguo
    if (analysis.device?.isAmbiguous) {
      session.stage = STAGES.DETECT_DEVICE;  // ✓ Actualizado
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
  async handle_ask_device(session, userInput, analysis) {
    // Guardar dispositivo seleccionado
    session.device = userInput.text || userInput;
    session.stage = STAGES.DIAGNOSTIC_GENERATION;

    return this.handle_diagnostic_generation(session, userInput, analysis);
  }

  /**
   * HANDLER: Generación de diagnóstico
   */
  async handle_generate_howto(session, userInput, analysis) {
    const generating = this.services.templates.getTemplate(
      'diagnostic_generation',
      'generating',
      session.locale
    );

    // Aquí iría la lógica de generación de pasos (delegada a otro servicio)
    session.diagnosticSteps = ['Paso 1 placeholder', 'Paso 2 placeholder', 'Paso 3 placeholder'];
    session.currentStepIndex = 0;
    session.stage = STAGES.BASIC_TESTS;  // ✅ ACTUALIZADO

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
  async handle_basic_tests(session, userInput, analysis) {
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
  async handle_escalate(session, userInput, analysis) {
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
  async handle_ended(session, userInput, analysis) {
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
   * HANDLER: ASK_LANGUAGE - Selección de idioma + GDPR
   * Compatible con server.js ASK_LANGUAGE stage
   */
  async handle_ask_language(session, userInput, analysis, metadata) {
    const text = (userInput.text || '').toLowerCase();
    
    // Detectar selección de idioma
    if (/español.*argentina|btn_lang_es_ar/i.test(text)) {
      session.userLocale = 'es-AR';
      session.gdprAccepted = true;
      session.stage = STAGES.ASK_NAME;
      
      return {
        text: '¡Genial! 👋 Para personalizar tu experiencia, ¿me decís tu nombre?',
        options: [],
        buttons: [
          { type: 'hint', label: 'O si lo preferís...', value: '' },
          { type: 'button', label: 'Prefiero no decirlo 🙅', value: 'BTN_NO_NAME' }
        ]
      };
    } else if (/español.*latinoam[eé]rica|btn_lang_es_es/i.test(text)) {
      session.userLocale = 'es-419';
      session.gdprAccepted = true;
      session.stage = STAGES.ASK_NAME;
      
      return {
        text: '¡Genial! 👋 Para personalizar tu experiencia, ¿me dices tu nombre?',
        options: [],
        buttons: [
          { type: 'hint', label: 'O si lo prefieres...', value: '' },
          { type: 'button', label: 'Prefiero no decirlo 🙅', value: 'BTN_NO_NAME' }
        ]
      };
    } else if (/english|btn_lang_en/i.test(text)) {
      session.userLocale = 'en';
      session.gdprAccepted = true;
      session.stage = STAGES.ASK_NAME;
      
      return {
        text: 'Great! 👋 To personalize your experience, could you tell me your name?',
        options: [],
        buttons: [
          { type: 'hint', label: "Or if you'd rather...", value: '' },
          { type: 'button', label: "I'd rather not say 🙅", value: 'BTN_NO_NAME' }
        ]
      };
    }
    
    // Si no seleccionó idioma, mostrar opciones
    return {
      text: 'Por favor, seleccioná tu idioma / Please select your language:',
      options: [],
      buttons: [
        { type: 'button', label: '🇦🇷 Español (Argentina)', value: 'BTN_LANG_ES_AR' },
        { type: 'button', label: '🌎 Español (Latinoamérica)', value: 'BTN_LANG_ES_ES' },
        { type: 'button', label: '🇬🇧 English', value: 'BTN_LANG_EN' }
      ]
    };
  }

  /**
   * HANDLER: CLASSIFY_NEED - Clasificación automática
   */
  async handle_classify_need(session, userInput, analysis) {
    // Este stage es automático, redirige a ASK_PROBLEM
    session.stage = STAGES.ASK_PROBLEM;
    
    const locale = session.userLocale || 'es-AR';
    const isEn = locale.startsWith('en');
    
    return {
      text: isEn 
        ? 'Please describe your technical issue in detail:'
        : '¿Podrías contarme más sobre tu problema técnico?',
      options: []
    };
  }

  /**
   * HANDLER: DETECT_DEVICE - Desambiguación de dispositivo
   */
  async handle_detect_device(session, userInput, analysis) {
    const text = (userInput.text || '').toLowerCase();
    
    // Si ya seleccionó dispositivo, avanzar
    if (text && (text.includes('desktop') || text.includes('notebook') || text.includes('all in one'))) {
      session.device = text.trim();
      session.stage = STAGES.GENERATE_HOWTO;
      
      return {
        text: `Perfecto, vamos a diagnosticar tu ${session.device}. Dame un momento mientras genero los pasos...`,
        options: []
      };
    }
    
    // Pedir aclaración
    const locale = session.userLocale || 'es-AR';
    const isEn = locale.startsWith('en');
    
    return {
      text: isEn
        ? 'What type of computer do you have?'
        : '¿Qué tipo de equipo tenés?',
      buttons: [
        { type: 'button', label: 'Desktop 💻', value: 'BTN_DESKTOP' },
        { type: 'button', label: 'All-in-One 🖥️', value: 'BTN_ALLINONE' },
        { type: 'button', label: 'Notebook 💼', value: 'BTN_NOTEBOOK' }
      ]
    };
  }

  /**
   * HANDLER: ASK_HOWTO_DETAILS - Detalles adicionales para consultas
   */
  async handle_ask_howto_details(session, userInput, analysis) {
    const text = userInput.text || '';
    
    // Guardar detalles
    session.howtoDetails = text;
    session.stage = STAGES.GENERATE_HOWTO;
    
    const locale = session.userLocale || 'es-AR';
    const isEn = locale.startsWith('en');
    
    return {
      text: isEn
        ? 'Got it! Let me prepare a guide for you...'
        : '¡Entendido! Dejame prepararte una guía paso a paso...',
      options: []
    };
  }

  /**
   * HANDLER: ADVANCED_TESTS - Pruebas avanzadas
   * Compatible con server.js ADVANCED_TESTS stage
   */
  async handle_advanced_tests(session, userInput, analysis) {
    const text = (userInput.text || '').toLowerCase();
    const locale = session.userLocale || 'es-AR';
    const isEn = locale.startsWith('en');
    
    // Usuario dice que solucionó
    if (/lo pude|solucion[eé]|resuel|solved|fixed/i.test(text)) {
      session.stage = STAGES.ENDED;
      const userName = session.userName ? ` ${session.userName}` : '';
      
      return {
        text: isEn
          ? `Excellent${userName}! 🙌 I'm glad you could solve it. If it fails again, you can reopen the chat.`
          : `¡Excelente${userName}! 🙌 Me alegra que lo hayas podido resolver. Si vuelve a fallar, podés reabrir el chat.`,
        options: [],
        buttons: []
      };
    }
    
    // Problema persiste → Escalar
    if (/persist|no funcion|sigue|todav[ií]a no|still not working/i.test(text)) {
      session.stage = STAGES.ESCALATE;
      session.waEligible = true;
      
      return {
        text: isEn
          ? 'I understand. Would you like me to connect you with a technician?'
          : 'Entiendo. ¿Querés que te conecte con un técnico?',
        buttons: [
          { type: 'button', label: isEn ? '🧑‍💻 Connect with technician' : '🧑‍💻 Conectar con técnico', value: 'BTN_TECH' }
        ]
      };
    }
    
    // Pide ayuda con un paso (BTN_HELP_N)
    if (/ayuda paso (\d+)|help step (\d+)/i.test(text)) {
      const match = text.match(/paso (\d+)|step (\d+)/i);
      const stepIndex = parseInt(match[1] || match[2]);
      
      const steps = session.tests?.advanced || [];
      if (stepIndex > 0 && stepIndex <= steps.length) {
        const step = steps[stepIndex - 1];
        session.lastHelpStep = stepIndex;
        
        return {
          text: `Paso ${stepIndex}: ${step}\n\n¿Necesitás más detalles sobre este paso?`,
          help: {
            stepIndex,
            stepText: step,
            detail: `Ayuda detallada para: ${step}`
          },
          buttons: [
            { type: 'button', label: isEn ? '👍 I solved it' : '👍 Ya lo solucioné', value: 'BTN_SOLVED' },
            { type: 'button', label: isEn ? '❌ Still not working' : '❌ Todavía no funciona', value: 'BTN_PERSIST' }
          ]
        };
      }
    }
    
    // Mostrar pasos avanzados
    const steps = session.tests?.advanced || ['Paso avanzado 1', 'Paso avanzado 2', 'Paso avanzado 3'];
    const numbered = enumerateSteps(steps);
    
    return {
      text: `${isEn ? "Let's try these more advanced tests:" : "Probemos con estas pruebas más avanzadas:"}\n\n${numbered.join('\n\n')}\n\n${isEn ? '🤔 How did it go?' : '🤔 ¿Cómo te fue?'}`,
      steps,
      buttons: [
        { type: 'button', label: isEn ? '👍 I solved it' : '👍 Ya lo solucioné', value: 'BTN_SOLVED' },
        { type: 'button', label: isEn ? '❌ Still not working' : '❌ Todavía no funciona', value: 'BTN_PERSIST' },
        { type: 'button', label: isEn ? '🧑‍💻 Connect with technician' : '🧑‍💻 Conectar con técnico', value: 'BTN_TECH' }
      ]
    };
  }

  /**
   * HANDLER: CREATE_TICKET - Crear ticket y generar link WhatsApp
   * Compatible con server.js CREATE_TICKET stage
   */
  async handle_create_ticket(session, userInput, analysis) {
    // TODO: Integrar con ticketing.js del server.js
    // Placeholder por ahora
    const ticketId = `TKT-${Date.now()}`;
    session.ticketId = ticketId;
    session.stage = STAGES.TICKET_SENT;
    
    const locale = session.userLocale || 'es-AR';
    const isEn = locale.startsWith('en');
    
    return {
      text: isEn
        ? `✅ Ticket created: ${ticketId}. A technician will contact you shortly via WhatsApp.`
        : `✅ Ticket creado: ${ticketId}. Un técnico te va a contactar en breve por WhatsApp.`,
      ticket: {
        ticketId,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * HANDLER: TICKET_SENT - Confirmación de ticket enviado
   */
  async handle_ticket_sent(session, userInput, analysis) {
    session.stage = STAGES.ENDED;
    
    const locale = session.userLocale || 'es-AR';
    const isEn = locale.startsWith('en');
    
    return {
      text: isEn
        ? 'Thank you for your patience! Is there anything else I can help you with?'
        : '¡Gracias por tu paciencia! ¿Hay algo más en lo que pueda ayudarte?',
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
