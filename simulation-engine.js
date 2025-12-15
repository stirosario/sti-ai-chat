/**
 * SISTEMA DE SIMULACIONES WEB - Motor de Simulaciones
 * 
 * Este módulo ejecuta simulaciones automáticas de conversaciones con Tecnos
 * para detectar errores críticos, validar flujos y medir calidad.
 * 
 * PRINCIPIO FUNDAMENTAL: Aislado de producción
 * - No modifica Redis productivo
 * - No crea tickets reales
 * - No envía WhatsApp real
 * - No afecta métricas reales
 * 
 * MODO SIMULATION: Todas las simulaciones se ejecutan en modo SIMULATION
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Para ES modules, necesitamos obtener __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directorio para logs de simulaciones
const SIMULATIONS_DIR = path.join(__dirname, 'data', 'simulations');

// Asegurar que el directorio existe
async function ensureSimulationsDir() {
  try {
    await fs.mkdir(SIMULATIONS_DIR, { recursive: true });
  } catch (error) {
    // Directorio ya existe o error al crearlo
  }
}

/**
 * Generador de datos realistas para simulaciones
 */
class SimulationDataGenerator {
  constructor(locale = 'es-AR') {
    this.locale = locale;
    this.isEnglish = locale.toLowerCase().startsWith('en');
    
    // Nombres ficticios realistas
    this.nombres = this.isEnglish
      ? ['John', 'Mary', 'Robert', 'Jennifer', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Jessica']
      : ['Alejandro', 'María', 'Roberto', 'Valeria', 'Carlos', 'Sofía', 'Fernando', 'Andrea', 'Diego', 'Lucía'];
    
    // Problemas comunes por dispositivo
    this.problemasPorDispositivo = {
      pc: this.isEnglish
        ? ['not turning on', 'very slow', 'freezing', 'blue screen', 'no internet connection']
        : ['no enciende', 'muy lenta', 'se cuelga', 'pantalla azul', 'no tiene internet'],
      notebook: this.isEnglish
        ? ['not turning on', 'battery not charging', 'very slow', 'keyboard not working', 'overheating']
        : ['no enciende', 'no carga la batería', 'muy lenta', 'no funciona el teclado', 'se recalienta'],
      router: this.isEnglish
        ? ['no internet connection', 'intermittent connection', 'WiFi not working', 'slow speed']
        : ['no hay internet', 'conexión intermitente', 'no funciona el WiFi', 'muy lenta']
    };
    
    // Dispositivos
    this.dispositivos = this.isEnglish
      ? ['PC', 'Notebook', 'Router']
      : ['PC de escritorio', 'Notebook', 'Router'];
  }
  
  /**
   * Genera un nombre ficticio realista
   */
  generateName() {
    return this.nombres[Math.floor(Math.random() * this.nombres.length)];
  }
  
  /**
   * Genera un nivel de experiencia del usuario
   * 
   * Distribución por defecto: 40% basic, 45% intermediate, 15% advanced
   * Si userType está especificado, ajusta la distribución
   * 
   * @param {string} userType - 'novato', 'medio', 'tecnico' o null para distribución aleatoria
   * @returns {string} 'basic' | 'intermediate' | 'advanced'
   */
  generateUserLevel(userType = null) {
    if (userType === 'novato') {
      return 'basic';
    } else if (userType === 'tecnico') {
      return 'advanced';
    } else if (userType === 'medio') {
      // 70% intermediate, 30% distributed between basic/advanced
      const rand = Math.random();
      if (rand < 0.7) return 'intermediate';
      return rand < 0.85 ? 'basic' : 'advanced';
    }
    
    // Distribución por defecto: 40% basic, 45% intermediate, 15% advanced
    const rand = Math.random();
    if (rand < 0.4) return 'basic';
    if (rand < 0.85) return 'intermediate'; // 0.4 a 0.85 = 45%
    return 'advanced'; // 0.85 a 1.0 = 15%
  }
  
  /**
   * Genera un problema coherente con el dispositivo
   */
  generateProblem(device = null) {
    if (!device) {
      device = ['pc', 'notebook', 'router'][Math.floor(Math.random() * 3)];
    }
    
    const problemas = this.problemasPorDispositivo[device] || this.problemasPorDispositivo.pc;
    return problemas[Math.floor(Math.random() * problemas.length)];
  }
  
  /**
   * Genera una respuesta del usuario según el contexto
   * Con realisticMode: puede repetir mensajes o tener errores ortográficos
   */
  generateUserResponse(context, realisticMode = true) {
    // Simular respuestas coherentes según el contexto
    // Esto es básico, se puede mejorar con más lógica
    
    if (context.stage === 'ASK_LANGUAGE') {
      return this.isEnglish ? 'English' : 'Español';
    }
    
    if (context.stage === 'ASK_NAME') {
      return this.generateName();
    }
    
    // 🔒 NUEVO: Manejar ASK_USER_LEVEL
    if (context.stage === 'ASK_USER_LEVEL') {
      // Si hay userLevel predefinido (por ejemplo, desde userType), usarlo
      // Si no, generar uno aleatorio
      const level = context.userLevel || this.generateUserLevel(context.userType);
      
      // Mapear a botón o texto
      if (context.buttonToken) {
        // Si se espera un botón, retornar el token correspondiente
        if (level === 'basic') return 'BTN_USER_LEVEL_BASIC';
        if (level === 'intermediate') return 'BTN_USER_LEVEL_INTERMEDIATE';
        if (level === 'advanced') return 'BTN_USER_LEVEL_ADVANCED';
      }
      
      // Si se espera texto, retornar el nombre del nivel
      if (level === 'basic') return this.isEnglish ? 'basic' : 'básico';
      if (level === 'intermediate') return this.isEnglish ? 'intermediate' : 'intermedio';
      if (level === 'advanced') return this.isEnglish ? 'advanced' : 'avanzado';
      
      return 'intermediate'; // Por defecto
    }
    
    if (context.stage === 'ASK_NEED') {
      return context.problem || this.generateProblem(context.device);
    }
    
    if (context.stage === 'ASK_DEVICE') {
      return context.device || this.dispositivos[Math.floor(Math.random() * this.dispositivos.length)];
    }
    
    // 🔒 F2-T04: Respuestas para preguntas de datos mínimos (OS, tipo de periférico)
    if (context.lastBotMessage) {
      const lowerBotMsg = context.lastBotMessage.toLowerCase();
      // Si el bot pregunta por SO
      if (lowerBotMsg.includes('sistema operativo') || lowerBotMsg.includes('operating system')) {
        const osList = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'];
        return osList[Math.floor(Math.random() * osList.length)];
      }
      // Si el bot pregunta por tipo de periférico
      if (lowerBotMsg.includes('tipo de periférico') || lowerBotMsg.includes('peripheral') || lowerBotMsg.includes('qué tipo')) {
        const peripherals = ['pendrive', 'impresora', 'teclado', 'mouse', 'monitor'];
        return peripherals[Math.floor(Math.random() * peripherals.length)];
      }
    }
    
    // Respuestas genéricas para otros stages
    let respuesta = '';
    const respuestas = this.isEnglish
      ? ['OK', 'I understand', 'Let me try', 'I did it', 'It still doesn\'t work']
      : ['OK', 'Entendido', 'Déjame probar', 'Ya lo hice', 'Sigue sin funcionar'];
    
    respuesta = respuestas[Math.floor(Math.random() * respuestas.length)];
    
    // RealisticMode: 10-20% de chance de repetir el mismo mensaje
    if (realisticMode && context.lastUserMessage && Math.random() < 0.15) {
      respuesta = context.lastUserMessage;
    }
    
    // RealisticMode: 10% de chance de error ortográfico leve
    if (realisticMode && Math.random() < 0.1) {
      respuesta = this.addTypo(respuesta);
    }
    
    return respuesta;
  }
  
  /**
   * Agrega un error ortográfico leve a un texto
   */
  addTypo(text) {
    if (!text || text.length < 3) return text;
    
    const typos = {
      'a': 'e', 'e': 'a', 'i': 'y', 'o': 'u', 'u': 'o',
      's': 'z', 'z': 's', 'c': 'k', 'k': 'c'
    };
    
    const pos = Math.floor(Math.random() * text.length);
    const char = text[pos].toLowerCase();
    
    if (typos[char]) {
      return text.substring(0, pos) + typos[char] + text.substring(pos + 1);
    }
    
    // Si no hay typo disponible, duplicar una letra
    return text.substring(0, pos) + text[pos] + text.substring(pos);
  }
}

/**
 * Detector de errores críticos
 */
class CriticalErrorDetector {
  constructor() {
    this.errors = [];
  }
  
  /**
   * Verifica si hay un reinicio del flujo sin motivo
   */
  checkFlowReset(session, previousStage, currentStage) {
    // Si retrocedemos de un stage avanzado a uno inicial sin motivo
    const advancedStages = ['BASIC_TESTS', 'ADVANCED_TESTS', 'ESCALATE'];
    const initialStages = ['ASK_LANGUAGE', 'ASK_NAME', 'ASK_NEED'];
    
    if (advancedStages.includes(previousStage) && initialStages.includes(currentStage)) {
      if (!session.progress?.contextChanged) {
        this.addError('FLOW_RESET', 'Reinicio del flujo sin motivo aparente', {
          from: previousStage,
          to: currentStage
        });
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Verifica si se repite un bloque ya ejecutado
   */
  checkBlockRepetition(session, flowId) {
    if (session.progress?.lastFlowShown === flowId && session.progress?.lastFlowShownAt) {
      // Verificar que no sea el mismo flujo mostrado inmediatamente
      const timeDiff = Date.now() - new Date(session.progress.lastFlowShownAt).getTime();
      if (timeDiff < 5000) { // Menos de 5 segundos
        this.addError('BLOCK_REPETITION', 'Repetición de bloque ya ejecutado', {
          flowId: flowId,
          previousShow: session.progress.lastFlowShownAt
        });
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Verifica contradicciones con datos previos
   */
  checkContradictions(session, newData) {
    // Verificar si cambia el dispositivo sin razón
    if (session.device && newData.device && session.device !== newData.device) {
      if (!session.progress?.contextChanged) {
        this.addError('CONTRADICTION', 'Contradicción con datos previos del usuario', {
          field: 'device',
          previous: session.device,
          new: newData.device
        });
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Verifica ofrecimiento prematuro de WhatsApp
   */
  checkPrematureWhatsApp(session) {
    // Si se ofrece WhatsApp antes de tener pasos confirmados
    if (session.waEligible && (!session.stepsDone || session.stepsDone.length === 0)) {
      const hasFrustration = session.progress?.userReportedOutcome === 'persists' ||
                            session.progress?.userReportedOutcome === 'failed';
      
      if (!hasFrustration) {
        this.addError('PREMATURE_WHATSAPP', 'Ofrecimiento prematuro de WhatsApp sin pasos confirmados', {
          stepsDone: session.stepsDone?.length || 0
        });
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Verifica omisión de preguntas necesarias
   */
  checkMissingQuestions(session, caseType) {
    // Verificar si faltan datos mínimos según el tipo de caso
    const context = session.contextMinima || {};
    
    if (caseType === 'peripheral' && !context.hasPeripheralType) {
      this.addError('MISSING_QUESTION', 'Omisión de pregunta necesaria para diagnóstico', {
        missing: 'peripheral type',
        caseType: caseType
      });
      return true;
    }
    
    if (caseType === 'system' && !context.hasOS) {
      this.addError('MISSING_QUESTION', 'Omisión de pregunta necesaria para diagnóstico', {
        missing: 'operating system',
        caseType: caseType
      });
      return true;
    }
    
    return false;
  }
  
  /**
   * Verifica pérdida de memoria de sesión
   */
  checkSessionMemoryLoss(session, previousSession) {
    // Verificar si se perdió información importante
    if (previousSession.userName && !session.userName) {
      this.addError('MEMORY_LOSS', 'Pérdida de memoria de sesión: nombre de usuario', {
        lost: 'userName'
      });
      return true;
    }
    
    if (previousSession.problem && !session.problem) {
      this.addError('MEMORY_LOSS', 'Pérdida de memoria de sesión: problema del usuario', {
        lost: 'problem'
      });
      return true;
    }
    
    return false;
  }
  
  /**
   * Agrega un error a la lista
   */
  addError(type, message, data = {}) {
    this.errors.push({
      type: type,
      message: message,
      data: data,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Obtiene todos los errores detectados
   */
  getErrors() {
    return this.errors;
  }
  
  /**
   * Limpia los errores
   */
  clear() {
    this.errors = [];
  }
  
  /**
   * Verifica si hay errores críticos (bloqueantes)
   */
  hasCriticalErrors() {
    return this.errors.length > 0;
  }
}

/**
 * Motor de Simulaciones
 */
class SimulationEngine {
  constructor(options = {}) {
    this.options = {
      locale: options.locale || 'es-AR',
      userType: options.userType || 'medio', // novato, medio, tecnico
      problem: options.problem || null, // null = automático
      device: options.device || null, // null = automático
      os: options.os || null, // null = automático
      maxSteps: options.maxSteps || 50,
      realisticMode: options.realisticMode !== false, // true = errores humanos, repeticiones
      strictMode: options.strictMode || false, // true = flujo ideal
      serverUrl: options.serverUrl || 'http://localhost:3001', // URL del servidor
      ...options
    };
    
    this.dataGenerator = new SimulationDataGenerator(this.options.locale);
    this.errorDetector = new CriticalErrorDetector();
    this.session = null;
    this.sessionId = null;
    this.steps = [];
    this.errors = [];
    this.previousSession = null;
    this.pasosConsultados = []; // Tracking de pasos consultados
    this.pasosConfirmados = []; // Tracking de pasos confirmados como realizados
  }
  
  /**
   * Llama al endpoint /api/chat del servidor
   */
  async callChatAPI(userText, buttonToken = null, simulation = true) {
    const url = new URL(`${this.options.serverUrl}/api/chat`);
    
    const body = {
      userText: userText || '',
      sessionId: this.sessionId || this.session.id,
      buttonToken: buttonToken || null,
      simulation: simulation // Marca explícita de simulación
    };
    
    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': this.sessionId || this.session.id
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Error llamando a /api/chat: ${error.message}`);
    }
  }
  
  /**
   * Ejecuta una simulación completa
   * FASE 1: Integración real con /api/chat
   */
  async runSimulation() {
    const simulationId = crypto.randomBytes(16).toString('hex');
    const startTime = Date.now();
    
    // Generar nivel de experiencia para la simulación
    const generatedUserLevel = this.dataGenerator.generateUserLevel(this.options.userType);
    
    // Inicializar sesión en modo SIMULATION
    this.session = {
      id: `SIM-${simulationId.substring(0, 8).toUpperCase()}`,
      simulation: true, // Marca que es una simulación
      userName: null,
      userLevel: generatedUserLevel, // 🔒 NUEVO: Nivel generado para la simulación
      userLevelSource: 'auto', // Generado automáticamente
      userLevelConfidence: 80,
      userLevelAutoAdjustments: [],
      stage: 'ASK_LANGUAGE',
      device: this.options.device || null,
      problem: this.options.problem || null,
      issueKey: null,
      tests: {
        basic: [],
        ai: [],
        advanced: []
      },
      stepsDone: [],
      failedSteps: [],
      transcript: [],
      startedAt: new Date().toISOString(),
      nameAttempts: 0,
      stepProgress: {},
      userLocale: this.options.locale,
      gdprConsent: null,
      contextMinima: {
        hasOS: false,
        osName: null,
        hasPeripheralType: false,
        peripheralType: null,
        hasDeviceType: false,
        deviceType: null,
        hasContext: false
      },
      progress: {
        lastFlowShown: null,
        lastFlowShownAt: null,
        lastStepSelected: null,
        lastStepSelectedAt: null,
        userReportedOutcome: null,
        userReportedOutcomeAt: null,
        contextChanged: false,
        contextChangedAt: null,
        stepsShownAt: null,
        lastStepIndex: null,
        outcomesByStep: {}
      },
      stepsRendered: []
    };
    
    // Inicializar sesión: generar sessionId válido (formato A0000-Z9999)
    // Para simulaciones, usamos prefijo SIM pero mantenemos formato válido
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z (sin Ñ)
    const digits = Math.floor(1000 + Math.random() * 9000).toString(); // 1000-9999
    this.sessionId = `${letter}${digits}`;
    this.session.id = this.sessionId;
    
    let lastUserMessage = null;
    let stepCount = 0;
    let previousStage = null;
    
    // Primera llamada: aceptar consentimiento y elegir idioma
    // Para simulaciones, simulamos el consentimiento directamente
    this.session.stage = 'ASK_NAME';
    this.session.gdprConsent = true;
    
    // Ejecutar pasos de la simulación llamando realmente a /api/chat
    while (stepCount < this.options.maxSteps && this.session.stage !== 'ENDED') {
      stepCount++;
      previousStage = this.session.stage;
      
      // Guardar estado previo para detección de errores
      this.previousSession = JSON.parse(JSON.stringify(this.session));
      
      // Generar respuesta del usuario
      const userResponse = this.dataGenerator.generateUserResponse({
        stage: this.session.stage,
        userType: this.options.userType, // Pasar userType para generación coherente
        userLevel: this.session.userLevel, // Pasar userLevel actual si existe
        device: this.session.device,
        problem: this.session.problem,
        os: this.options.os,
        lastUserMessage: lastUserMessage
      }, this.options.realisticMode);
      
      lastUserMessage = userResponse;
      
      // Determinar si es un botón o texto
      let buttonToken = null;
      let textToSend = userResponse;
      
      // Detectar si la respuesta es un botón (basado en el stage)
      if (this.session.stage === 'ASK_LANGUAGE') {
        if (userResponse.toLowerCase().includes('español') || userResponse.toLowerCase() === 'es') {
          buttonToken = 'si'; // Aceptar consentimiento + español
        } else if (userResponse.toLowerCase().includes('english') || userResponse.toLowerCase() === 'en') {
          buttonToken = 'si'; // Aceptar consentimiento + english
        }
      }
      
      // Llamar realmente a /api/chat
      try {
        const apiResponse = await this.callChatAPI(textToSend, buttonToken, true);
        
        // Registrar paso
        const step = {
          step: stepCount,
          stage: this.session.stage,
          userInput: userResponse,
          buttonToken: buttonToken,
          apiResponse: {
            ok: apiResponse.ok,
            stage: apiResponse.stage,
            replyLength: apiResponse.reply ? apiResponse.reply.length : 0,
            buttonsCount: apiResponse.buttons ? apiResponse.buttons.length : 0
          },
          timestamp: new Date().toISOString()
        };
        
        this.steps.push(step);
        
        // Actualizar sesión con respuesta del servidor
        if (apiResponse.ok) {
          if (apiResponse.stage) {
            this.session.stage = apiResponse.stage;
          }
          
          // Agregar respuesta del bot al transcript
          if (apiResponse.reply) {
            this.session.transcript.push({
              who: 'bot',
              text: apiResponse.reply,
              ts: new Date().toISOString(),
              stage: this.session.stage,
              buttons: apiResponse.buttons || []
            });
          }
          
          // Extraer información de la respuesta si es posible
          // 🔒 NUEVO: Manejar ASK_USER_LEVEL
          if (this.session.stage === 'ASK_USER_LEVEL' && !this.session.userLevel) {
            // Mapear respuesta a nivel
            if (buttonToken === 'BTN_USER_LEVEL_BASIC' || /básico|basic/i.test(userResponse || '')) {
              this.session.userLevel = 'basic';
            } else if (buttonToken === 'BTN_USER_LEVEL_INTERMEDIATE' || /intermedio|intermediate/i.test(userResponse || '')) {
              this.session.userLevel = 'intermediate';
            } else if (buttonToken === 'BTN_USER_LEVEL_ADVANCED' || /avanzado|advanced/i.test(userResponse || '')) {
              this.session.userLevel = 'advanced';
            } else {
              // Si no se reconoce, mantener el nivel generado al inicio
              // (ya está seteado arriba)
            }
            
            if (this.session.userLevel) {
              this.session.userLevelSource = buttonToken ? 'button' : 'auto';
              this.session.userLevelConfidence = 80;
              this.session.userLevelAutoAdjustments = [];
            }
          }
          
          if (this.session.stage === 'ASK_NAME' && !this.session.userName && userResponse) {
            this.session.userName = userResponse;
          }
          
          if (this.session.stage === 'ASK_NEED' && !this.session.problem && userResponse) {
            this.session.problem = userResponse;
          }
          
          if (this.session.stage === 'ASK_DEVICE' && !this.session.device && userResponse) {
            this.session.device = userResponse.toLowerCase().includes('pc') ? 'pc' : 
                                 userResponse.toLowerCase().includes('notebook') ? 'notebook' : 
                                 userResponse.toLowerCase();
          }
          
          // Detectar si el usuario consultó un paso (BTN_HELP_STEP_X)
          if (buttonToken && buttonToken.startsWith('BTN_HELP_STEP_')) {
            const stepIdx = parseInt(buttonToken.replace('BTN_HELP_STEP_', ''), 10);
            if (!this.pasosConsultados.includes(stepIdx)) {
              this.pasosConsultados.push(stepIdx);
            }
          }
          
          // Detectar si el usuario confirmó un paso (BTN_SOLVED o respuesta positiva)
          if (buttonToken === 'BTN_SOLVED' || 
              (userResponse && (userResponse.toLowerCase().includes('lo hice') || 
                               userResponse.toLowerCase().includes('ya lo hice') ||
                               userResponse.toLowerCase().includes('i did it')))) {
            const lastConsultedStep = this.pasosConsultados[this.pasosConsultados.length - 1];
            if (lastConsultedStep !== undefined && !this.pasosConfirmados.includes(lastConsultedStep)) {
              this.pasosConfirmados.push(lastConsultedStep);
            }
          }
        } else {
          this.errorDetector.addError('API_ERROR', `Error en respuesta de /api/chat: ${apiResponse.error || 'Unknown error'}`);
        }
        
        // Detectar errores críticos
        this.errorDetector.checkFlowReset(this.session, previousStage, this.session.stage);
        this.errorDetector.checkSessionMemoryLoss(this.session, this.previousSession);
        this.errorDetector.checkPrematureWhatsApp(this.session);
        
        // Si llegamos a ENDED, finalizar
        if (this.session.stage === 'ENDED') {
          break;
        }
        
        // Pequeña pausa para no saturar el servidor
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        this.errorDetector.addError('SIMULATION_ERROR', `Error llamando a /api/chat: ${error.message}`);
        // Continuar con el siguiente paso aunque haya error
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Compilar errores y obtener principal
    const errors = this.errorDetector.getErrors();
    const principalError = errors.length > 0 ? errors[0] : null;
    
    // Contar errores por tipo (top3)
    const errorCounts = {};
    errors.forEach(err => {
      errorCounts[err.type] = (errorCounts[err.type] || 0) + 1;
    });
    const top3Errores = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => ({ type, count }));
    
    // 🔒 F3-T06: Compilar resultados con summary legible al inicio
    const result = {
      // SUMMARY LEGIBLE (al inicio, fácil de leer)
      summary: {
        simulationId: simulationId,
        sessionId: this.sessionId || this.session.id,
        status: this.errorDetector.hasCriticalErrors() ? 'FAILED' : 'OK',
        duration: `${Math.floor(duration / 1000)}s`,
        durationMs: duration,
        stepsExecuted: stepCount,
        errorsCount: errors.length,
        principalError: principalError ? principalError.type : null,
        principalErrorDescription: principalError ? principalError.description : null,
        top3Errores: top3Errores,
        finalStage: this.session.stage,
        locale: this.options.locale,
        userType: this.options.userType,
        device: this.session.device,
        problem: this.session.problem,
        os: this.options.os,
        pasosConsultados: this.pasosConsultados.length,
        pasosConfirmados: this.pasosConfirmados.length
      },
      // DETALLES COMPLETOS (después del summary)
      simulationId: simulationId,
      sessionId: this.sessionId || this.session.id,
      status: this.errorDetector.hasCriticalErrors() ? 'FAILED' : 'OK',
      duration: duration,
      stepsExecuted: stepCount,
      errors: errors,
      errorsCount: errors.length,
      principalError: principalError,
      top3Errores: top3Errores,
      finalStage: this.session.stage,
      transcript: this.session.transcript,
      steps: this.steps,
      pasosConsultados: this.pasosConsultados,
      pasosConfirmados: this.pasosConfirmados,
      session: {
        userName: this.session.userName,
        userLevel: this.session.userLevel || null,
        device: this.session.device,
        problem: this.session.problem,
        os: this.options.os,
        stepsDone: this.session.stepsDone.length,
        finalStage: this.session.stage
      },
      metadata: {
        locale: this.options.locale,
        userType: this.options.userType,
        realisticMode: this.options.realisticMode,
        strictMode: this.options.strictMode,
        version: '1.0.0'
      }
    };
    
    // Guardar log
    await this.saveLog(result);
    
    return result;
  }
  
  /**
   * Guarda el log de la simulación
   */
  async saveLog(result) {
    await ensureSimulationsDir();
    
    const logFile = path.join(SIMULATIONS_DIR, `sim_${result.simulationId}.json`);
    
    const logData = {
      simulationId: result.simulationId,
      sessionId: result.sessionId,
      timestamp: new Date().toISOString(),
      status: result.status,
      duration: result.duration,
      stepsExecuted: result.stepsExecuted,
      errors: result.errors,
      errorsCount: result.errors.length,
      principalError: result.principalError,
      top3Errores: result.top3Errores,
      finalStage: result.finalStage,
      session: result.session,
      metadata: result.metadata,
      steps: result.steps,
      transcript: result.transcript,
      pasosConsultados: result.pasosConsultados,
      pasosConfirmados: result.pasosConfirmados,
      userLevel: result.summary?.userLevel || null
    };
    
    await fs.writeFile(logFile, JSON.stringify(logData, null, 2), 'utf8');
    
    return logFile;
  }
  
  /**
   * Obtiene logs de simulaciones
   */
  static async getLogs(limit = 100) {
    await ensureSimulationsDir();
    
    try {
      const files = await fs.readdir(SIMULATIONS_DIR);
      const logFiles = files.filter(f => f.startsWith('sim_') && f.endsWith('.json'));
      
      // Ordenar por fecha de modificación (más recientes primero)
      const logs = await Promise.all(
        logFiles.slice(0, limit).map(async (file) => {
          const filePath = path.join(SIMULATIONS_DIR, file);
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        })
      );
      
      // Ordenar por timestamp
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return logs;
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Obtiene un log específico
   */
  static async getLog(simulationId) {
    await ensureSimulationsDir();
    
    const logFile = path.join(SIMULATIONS_DIR, `sim_${simulationId}.json`);
    
    try {
      const content = await fs.readFile(logFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
}

export {
  SimulationEngine,
  SimulationDataGenerator,
  CriticalErrorDetector,
  ensureSimulationsDir
};
