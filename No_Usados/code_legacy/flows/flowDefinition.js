/**
 * FLOW DEFINITION - Tabla centralizada de estados del chat Tecnos
 * 
 * Este archivo define TODO el comportamiento del chatbot:
 * - Qué hacer con texto del usuario
 * - Qué hacer con botones presionados
 * - Qué estado sigue
 * - Qué responder
 * - Qué botones mostrar
 * 
 * REGLA DE ORO: Este archivo NO modifica server.js
 * Solo define la lógica de flujo de forma declarativa
 */

export const STAGES = {
  ASK_LANGUAGE: 'ASK_LANGUAGE',
  ASK_NAME: 'ASK_NAME',
  ASK_NEED: 'ASK_NEED',
  CLASSIFY_NEED: 'CLASSIFY_NEED',
  ASK_DEVICE: 'ASK_DEVICE',
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
 * DETERMINISTIC STAGES - Fuente única de verdad
 * 
 * Stages que NO deben usar lógica de IA ni UX adaptativo.
 * Estos stages son 100% determinísticos y predecibles.
 * 
 * ✅ REGLA: Esta es la ÚNICA definición oficial.
 * Todos los módulos deben importar esta constante para evitar desincronización.
 */
export const DETERMINISTIC_STAGES = [
  STAGES.ASK_LANGUAGE,
  STAGES.ASK_NAME,
  STAGES.ASK_NEED,
  STAGES.ASK_DEVICE,
  'ASK_KNOWLEDGE_LEVEL',  // Si existe en el sistema
  'GDPR_CONSENT',         // Si existe en el sistema
  'CONSENT'               // Si existe en el sistema
];

/**
 * FLOW CONFIGURATION
 * 
 * Cada estado tiene:
 * - name: Nombre legible
 * - description: Qué hace este estado
 * - onText: Handler para procesar texto del usuario
 * - onButton: Handler para procesar botones
 * - onImage: Handler para procesar imágenes (Vision API)
 * - nextStageRules: Reglas para determinar siguiente estado
 * - responseTemplate: Template de respuesta
 * - buttons: Botones a mostrar
 * - validations: Validaciones de entrada
 */
export const FLOW = {
  
  // ========================================
  // 1. ASK_LANGUAGE - GDPR + Idioma
  // ========================================
  ASK_LANGUAGE: {
    name: 'Selección de Idioma',
    description: 'Solicitar consentimiento GDPR y seleccionar idioma',
    
    onText: ({ text, session }) => {
      const lower = text.toLowerCase().trim();
      
      // Aceptación GDPR
      if (/\b(si|sí|acepto|aceptar|ok|dale|de acuerdo|agree|accept|yes)\b/i.test(lower)) {
        return {
          action: 'ACCEPT_GDPR',
          gdprConsent: true,
          reply: {
            'es-AR': '✅ **Gracias por aceptar**\n\n🌍 **Seleccioná tu idioma / Select your language:**',
            'en': '✅ **Thanks for accepting**\n\n🌍 **Select your language:**'
          },
          buttons: ['BTN_LANG_ES_AR', 'BTN_LANG_EN'],
          nextStage: 'ASK_LANGUAGE' // Mantener hasta que seleccione idioma
        };
      }
      
      // Rechazo GDPR
      if (/\b(no|no acepto|no quiero|no te lo|rechazo|cancel|decline)\b/i.test(lower)) {
        return {
          action: 'REJECT_GDPR',
          reply: {
            'es-AR': '😔 Entiendo. Sin tu consentimiento no puedo continuar.\n\nSi cambiás de opinión, podés volver a iniciar el chat.\n\n📧 Para consultas sin registro, escribinos a: web@stia.com.ar',
            'en': '😔 I understand. Without your consent I cannot continue.\n\nIf you change your mind, you can restart the chat.\n\n📧 For inquiries without registration, write to: web@stia.com.ar'
          },
          endConversation: true,
          nextStage: 'ENDED'
        };
      }
      
      // Selección de idioma (después de GDPR)
      if (session.gdprConsent) {
        if (/español|spanish|es-|arg|latino/i.test(lower)) {
          return {
            action: 'SELECT_LANGUAGE',
            locale: 'es-AR',
            reply: '✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊',
            buttons: ['BTN_NO_NAME'],
            nextStage: 'ASK_NAME'
          };
        }
        
        if (/english|inglés|ingles|en-|us|uk/i.test(lower)) {
          return {
            action: 'SELECT_LANGUAGE',
            locale: 'en',
            reply: '✅ Perfect! Let\'s continue in **English**.\n\nWhat\'s your name? 😊',
            buttons: ['BTN_NO_NAME'],
            nextStage: 'ASK_NAME'
          };
        }
      }
      
      // No entendido
      return {
        action: 'NOT_UNDERSTOOD',
        reply: {
          'es-AR': 'Disculpá, no entendí bien. ¿Podrías reformular tu mensaje?',
          'en': 'Sorry, I didn\'t understand. Could you rephrase your message?'
        },
        nextStage: 'ASK_LANGUAGE' // Mantener
      };
    },
    
    onButton: ({ token, session }) => {
      if (token === 'BTN_LANG_ES_AR') {
        return {
          action: 'SELECT_LANGUAGE',
          locale: 'es-AR',
          reply: '✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊',
          buttons: [], // ✅ HARD RULE: ASK_NAME NO debe mostrar botones (solo texto)
          nextStage: 'ASK_NAME'
        };
      }
      
      if (token === 'BTN_LANG_EN') {
        return {
          action: 'SELECT_LANGUAGE',
          locale: 'en',
          reply: '✅ Perfect! Let\'s continue in **English**.\n\nWhat\'s your name? 😊',
          buttons: [], // ✅ HARD RULE: ASK_NAME NO debe mostrar botones (solo texto)
          nextStage: 'ASK_NAME'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ASK_LANGUAGE' };
    }
  },
  
  // ========================================
  // 2. ASK_NAME - Nombre del usuario
  // ========================================
  ASK_NAME: {
    name: 'Solicitar Nombre',
    description: 'Pedir nombre o aceptar anónimo',
    
    onText: ({ text, session }) => {
      const lower = text.toLowerCase().trim();
      
      // Usuario prefiere no dar nombre
      if (/prefiero no|no quiero|no te lo|no dar|no digo|sin nombre|anonimo|anónimo|skip|omitir/i.test(lower)) {
        return {
          action: 'ANONYMOUS',
          userName: null,
          reply: {
            'es-AR': '🙈 Perfecto, sin problema. Puedo llamarte simplemente Usuario.\n\n¿En qué puedo ayudarte hoy? ¿Tenés un problema o una consulta?',
            'en': '🙈 Perfect, no problem. I can just call you User.\n\nHow can I help you today? Do you have a problem or a question?'
          },
          buttons: ['BTN_PROBLEMA', 'BTN_CONSULTA'],
          nextStage: 'ASK_NEED'
        };
      }
      
      // Validar nombre (reutilizar lógica legacy de isValidName)
      return {
        action: 'SAVE_NAME',
        userName: text, // El orchestrator validará con isValidName()
        nextStage: 'ASK_NEED'
      };
    },
    
    onButton: ({ token }) => {
      // ✅ HARD RULE: ASK_NAME NO acepta botones (solo texto)
      // Si llega cualquier token, rechazarlo y mantener en ASK_NAME sin botones
      console.warn(`[FLOW] ⚠️ ASK_NAME rechazó token "${token}" - ASK_NAME solo acepta texto`);
      return { 
        action: 'UNKNOWN_BUTTON', 
        nextStage: 'ASK_NAME',
        buttons: [] // ✅ Asegurar que no se devuelvan botones
      };
    }
  },
  
  // ========================================
  // 3. ASK_NEED - ¿Problema o Consulta?
  // ========================================
  ASK_NEED: {
    name: 'Tipo de Necesidad',
    description: 'Determinar si tiene problema técnico o consulta',
    
    onText: ({ text, session }) => {
      const lower = text.toLowerCase().trim();
      
      // Detectar problema
      if (/problema|falla|error|no funciona|no anda|roto|mal|issue|broken|not working/i.test(lower)) {
        return {
          action: 'PROBLEMA',
          needType: 'problema',
          nextStage: 'ASK_DEVICE'
        };
      }
      
      // Detectar consulta
      if (/consulta|pregunta|duda|como|cómo|how to|ayuda con|instalar|configurar|question|query/i.test(lower)) {
        return {
          action: 'CONSULTA',
          needType: 'consulta',
          nextStage: 'ASK_HOWTO_DETAILS'
        };
      }
      
      // Ambiguo → clasificar con AI
      return {
        action: 'CLASSIFY',
        needClassification: 'pending',
        nextStage: 'CLASSIFY_NEED'
      };
    },
    
    onButton: ({ token, session }) => {
      const locale = session?.userLocale || 'es-AR';
      const isEn = String(locale).toLowerCase().startsWith('en');
      
      // ✅ BOTONES DETERMINÍSTICOS: Problema o Consulta
      if (token === 'BTN_PROBLEMA') {
        return {
          action: 'PROBLEMA',
          needType: 'problema',
          reply: {
            'es-AR': '📌 Entendido. ¿Qué tipo de dispositivo te está dando problemas?',
            'en': '📌 Understood. What type of device is giving you problems?'
          },
          buttons: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'],
          nextStage: 'ASK_DEVICE'
        };
      }
      
      if (token === 'BTN_CONSULTA') {
        return {
          action: 'CONSULTA',
          needType: 'consulta',
          reply: {
            'es-AR': '💡 Perfecto. ¿Qué querés saber o aprender?',
            'en': '💡 Perfect. What do you want to know or learn?'
          },
          nextStage: 'ASK_HOWTO_DETAILS'
        };
      }
      
      // ✅ BOTONES DETERMINÍSTICOS: Problemas frecuentes
      // Estos botones permiten seleccionar directamente un problema común
      const problemButtonMap = {
        'BTN_NO_ENCIENDE': { 
          problem: 'el equipo no enciende', 
          problemEn: 'the device does not turn on' 
        },
        'BTN_NO_INTERNET': { 
          problem: 'problemas de conexión a internet', 
          problemEn: 'internet connection problems' 
        },
        'BTN_LENTITUD': { 
          problem: 'lentitud del sistema', 
          problemEn: 'system slowness' 
        },
        'BTN_BLOQUEO': { 
          problem: 'bloqueo o cuelgue de programas', 
          problemEn: 'program freezing or crashing' 
        },
        'BTN_PERIFERICOS': { 
          problem: 'problemas con periféricos externos', 
          problemEn: 'external peripheral problems' 
        },
        'BTN_VIRUS': { 
          problem: 'infecciones de malware o virus', 
          problemEn: 'malware or virus infections' 
        }
      };
      
      if (problemButtonMap[token]) {
        const problemInfo = problemButtonMap[token];
        const problemText = isEn ? problemInfo.problemEn : problemInfo.problem;
        
        console.log(`[FLOW] ✅ Problema frecuente seleccionado en ASK_NEED: ${token} → "${problemText}"`);
        
        return {
          action: 'PROBLEMA_FRECUENTE',
          needType: 'problema',
          problem: problemText,
          reply: {
            'es-AR': `✅ Perfecto! Entiendo el problema: ${problemText}. ¿Qué tipo de dispositivo es? ¿Una PC de escritorio, una notebook o una all-in-one? Así te guío mejor. 💻🖥️`,
            'en': `✅ Got it! I understand the problem: ${problemText}. What type of device is it? A desktop PC, a notebook, or an all-in-one? This will help me guide you better. 💻🖥️`
          },
          buttons: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK'],
          nextStage: 'ASK_DEVICE'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ASK_NEED' };
    }
  },
  
  // ========================================
  // 4. CLASSIFY_NEED - Clasificar con AI
  // ========================================
  CLASSIFY_NEED: {
    name: 'Clasificar Necesidad',
    description: 'Usar AI para determinar si es problema o consulta',
    
    onText: ({ text, smartAnalysis }) => {
      // El orchestrator usará smartAnalysis.intention
      if (smartAnalysis?.intention === 'problem') {
        return {
          action: 'PROBLEMA',
          needType: 'problema',
          nextStage: 'ASK_DEVICE'
        };
      }
      
      if (smartAnalysis?.intention === 'howto') {
        return {
          action: 'CONSULTA',
          needType: 'consulta',
          nextStage: 'ASK_HOWTO_DETAILS'
        };
      }
      
      // Fallback: preguntar directamente
      return {
        action: 'ASK_CLARIFICATION',
        reply: {
          'es-AR': '¿Tenés un problema técnico o querés hacer una consulta?',
          'en': 'Do you have a technical problem or want to ask a question?'
        },
        buttons: ['BTN_PROBLEMA', 'BTN_CONSULTA'],
        nextStage: 'ASK_NEED'
      };
    }
  },
  
  // ========================================
  // 5. ASK_DEVICE - Tipo de dispositivo
  // ========================================
  ASK_DEVICE: {
    name: 'Tipo de Dispositivo',
    description: 'Determinar PC desktop, all-in-one, o notebook',
    
    onText: ({ text, smartAnalysis }) => {
      const lower = text.toLowerCase().trim();
      
      // Detectar dispositivo en texto
      if (/\b(pc|desktop|torre|computadora de escritorio)\b/i.test(lower)) {
        return {
          action: 'SET_DEVICE',
          device: 'desktop',
          nextStage: 'ASK_PROBLEM'
        };
      }
      
      if (/\b(all.{0,2}in.{0,2}one|todo en uno|pantalla con pc)\b/i.test(lower)) {
        return {
          action: 'SET_DEVICE',
          device: 'all-in-one',
          nextStage: 'ASK_PROBLEM'
        };
      }
      
      if (/\b(notebook|laptop|portátil|portatil)\b/i.test(lower)) {
        return {
          action: 'SET_DEVICE',
          device: 'notebook',
          nextStage: 'ASK_PROBLEM'
        };
      }
      
      // Usar smartAnalysis si disponible
      if (smartAnalysis?.device) {
        return {
          action: 'SET_DEVICE',
          device: smartAnalysis.device,
          nextStage: 'ASK_PROBLEM'
        };
      }
      
      // Ambiguo → desambiguar
      return {
        action: 'DISAMBIGUATE',
        nextStage: 'DETECT_DEVICE'
      };
    },
    
    onButton: ({ token }) => {
      const deviceMap = {
        'BTN_DEV_PC_DESKTOP': 'desktop',
        'BTN_DEV_PC_ALLINONE': 'all-in-one',
        'BTN_DEV_NOTEBOOK': 'notebook'
      };
      
      if (deviceMap[token]) {
        return {
          action: 'SET_DEVICE',
          device: deviceMap[token],
          reply: {
            'es-AR': `✅ Perfecto. ¿Qué problema estás teniendo con tu ${deviceMap[token]}?`,
            'en': `✅ Perfect. What problem are you having with your ${deviceMap[token]}?`
          },
          nextStage: 'ASK_PROBLEM'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ASK_DEVICE' };
    },
    
    onImage: ({ imageAnalysis }) => {
      // Vision API detectó dispositivo en imagen
      if (imageAnalysis?.device) {
        return {
          action: 'SET_DEVICE',
          device: imageAnalysis.device,
          reply: {
            'es-AR': `📸 Detecté que tenés un ${imageAnalysis.device}. ¿Qué problema está teniendo?`,
            'en': `📸 I detected you have a ${imageAnalysis.device}. What problem is it having?`
          },
          nextStage: 'ASK_PROBLEM'
        };
      }
      return null; // No cambia flujo
    }
  },
  
  // ========================================
  // 6. DETECT_DEVICE - Desambiguar dispositivo
  // ========================================
  DETECT_DEVICE: {
    name: 'Detectar Dispositivo',
    description: 'Resolver ambigüedad en tipo de dispositivo',
    
    onText: ({ text }) => {
      // Aquí el orchestrator llamará a deviceDetection.js
      // y procesará la desambiguación
      return {
        action: 'PROCESS_DISAMBIGUATION',
        nextStage: 'ASK_PROBLEM'
      };
    }
  },
  
  // ========================================
  // 7. ASK_PROBLEM - Describir problema
  // ========================================
  ASK_PROBLEM: {
    name: 'Describir Problema',
    description: 'Usuario describe el problema técnico',
    
    onText: ({ text }) => {
      // Guardar problema y generar diagnóstico
      return {
        action: 'GENERATE_DIAGNOSTIC',
        problem: text,
        nextStage: 'BASIC_TESTS'
      };
    },
    
    onImage: ({ imageAnalysis }) => {
      // Vision API detectó error en pantalla
      if (imageAnalysis?.errorDetected) {
        return {
          action: 'IMAGE_ERROR_DETECTED',
          problem: imageAnalysis.errorDescription,
          reply: {
            'es-AR': `📸 Detecté un error: **${imageAnalysis.errorDescription}**\n\nVoy a darte pasos para solucionarlo.`,
            'en': `📸 I detected an error: **${imageAnalysis.errorDescription}**\n\nI'll give you steps to fix it.`
          },
          imageAnalysis: imageAnalysis,
          nextStage: 'BASIC_TESTS'
        };
      }
      
      // Imagen no clara
      if (imageAnalysis?.quality === 'low') {
        return {
          action: 'REQUEST_BETTER_IMAGE',
          reply: {
            'es-AR': '📸 La imagen no se ve muy clara. ¿Podrías tomar otra foto más nítida del problema?',
            'en': '📸 The image is not very clear. Could you take a clearer photo of the problem?'
          },
          nextStage: 'ASK_PROBLEM' // Mantener
        };
      }
      
      return null;
    }
  },
  
  // ========================================
  // 8. ASK_HOWTO_DETAILS - Consulta HOWTO
  // ========================================
  ASK_HOWTO_DETAILS: {
    name: 'Detalles de Consulta',
    description: 'Usuario describe qué quiere aprender o configurar',
    
    onText: ({ text }) => {
      return {
        action: 'GENERATE_HOWTO',
        query: text,
        nextStage: 'GENERATE_HOWTO'
      };
    },
    
    onImage: ({ imageAnalysis }) => {
      // Imagen de pantalla o configuración
      if (imageAnalysis?.screenDetected) {
        return {
          action: 'HOWTO_FROM_IMAGE',
          query: imageAnalysis.screenContext,
          imageAnalysis: imageAnalysis,
          nextStage: 'GENERATE_HOWTO'
        };
      }
      return null;
    }
  },
  
  // ========================================
  // 9. GENERATE_HOWTO - Generar guía
  // ========================================
  GENERATE_HOWTO: {
    name: 'Generar Guía',
    description: 'Generar pasos para consulta HOWTO',
    
    onText: ({ text }) => {
      // Orchestrator llamará a AI para generar guía
      return {
        action: 'CREATE_HOWTO_GUIDE',
        nextStage: 'ENDED'
      };
    }
  },
  
  // ========================================
  // 10. BASIC_TESTS - Pruebas básicas
  // ========================================
  BASIC_TESTS: {
    name: 'Pruebas Básicas',
    description: 'Usuario ejecuta diagnóstico básico',
    
    onText: ({ text }) => {
      const lower = text.toLowerCase().trim();
      
      // "lo pude solucionar"
      if (/\b(s|si|sí|lo pude|solucion|resuelto|funciona|arreglado|fixed|solved)\b/i.test(lower)) {
        return {
          action: 'PROBLEM_SOLVED',
          nextStage: 'ENDED'
        };
      }
      
      // "el problema persiste"
      if (/\b(no|n|persiste|sigue|todavia|todavía|aun|aún|still)\b/i.test(lower)) {
        return {
          action: 'PROBLEM_PERSISTS',
          reply: {
            'es-AR': '💡 Entiendo. ¿Querés que te ayude con algo más?',
            'en': '💡 I understand. Would you like me to help you with something else?'
          },
          buttons: ['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE'],
          nextStage: 'ESCALATE'
        };
      }
      
      // "pruebas avanzadas" (FIX del bug reportado)
      if (/\b(pruebas avanzadas|más pruebas|advanced tests|more tests)\b/i.test(lower)) {
        return {
          action: 'REQUEST_ADVANCED_TESTS',
          nextStage: 'ADVANCED_TESTS'
        };
      }
      
      // "conectar con técnico"
      if (/\b(tecnico|técnico|humano|persona|ayuda real|technician|human)\b/i.test(lower)) {
        return {
          action: 'CREATE_TICKET',
          nextStage: 'CREATE_TICKET'
        };
      }
      
      return {
        action: 'NOT_UNDERSTOOD',
        reply: {
          'es-AR': 'No te entendí. Por favor elegí una opción de los botones.',
          'en': 'I didn\'t understand. Please choose an option from the buttons.'
        },
        nextStage: 'BASIC_TESTS'
      };
    },
    
    onButton: ({ token }) => {
      if (token === 'BTN_SOLVED') {
        return {
          action: 'PROBLEM_SOLVED',
          nextStage: 'ENDED'
        };
      }
      
      if (token === 'BTN_PERSIST') {
        return {
          action: 'PROBLEM_PERSISTS',
          buttons: ['BTN_ADVANCED_TESTS', 'BTN_CONNECT_TECH', 'BTN_CLOSE'],
          nextStage: 'ESCALATE'
        };
      }
      
      // FIX: Botón "Pruebas Avanzadas" directo desde BASIC_TESTS
      if (token === 'BTN_ADVANCED_TESTS' || token === 'BTN_MORE_TESTS') {
        return {
          action: 'REQUEST_ADVANCED_TESTS',
          nextStage: 'ADVANCED_TESTS'
        };
      }
      
      if (token === 'BTN_CONNECT_TECH') {
        return {
          action: 'CREATE_TICKET',
          nextStage: 'CREATE_TICKET'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'BASIC_TESTS' };
    }
  },
  
  // ========================================
  // 11. ADVANCED_TESTS - Pruebas avanzadas
  // ========================================
  ADVANCED_TESTS: {
    name: 'Pruebas Avanzadas',
    description: 'Usuario ejecuta diagnóstico avanzado',
    
    onText: ({ text }) => {
      const lower = text.toLowerCase().trim();
      
      if (/\b(s|si|sí|lo pude|solucion|resuelto)\b/i.test(lower)) {
        return {
          action: 'PROBLEM_SOLVED',
          nextStage: 'ENDED'
        };
      }
      
      if (/\b(no|n|persiste|sigue|todavia)\b/i.test(lower)) {
        return {
          action: 'ESCALATE_TO_HUMAN',
          buttons: ['BTN_CONNECT_TECH'],
          nextStage: 'ESCALATE'
        };
      }
      
      if (/\b(tecnico|técnico|humano|persona)\b/i.test(lower)) {
        return {
          action: 'CREATE_TICKET',
          nextStage: 'CREATE_TICKET'
        };
      }
      
      return {
        action: 'NOT_UNDERSTOOD',
        nextStage: 'ADVANCED_TESTS'
      };
    },
    
    onButton: ({ token }) => {
      if (token === 'BTN_SOLVED') {
        return {
          action: 'PROBLEM_SOLVED',
          nextStage: 'ENDED'
        };
      }
      
      if (token === 'BTN_PERSIST' || token === 'BTN_CONNECT_TECH') {
        return {
          action: 'CREATE_TICKET',
          nextStage: 'CREATE_TICKET'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ADVANCED_TESTS' };
    }
  },
  
  // ========================================
  // 12. ESCALATE - Escalamiento
  // ========================================
  ESCALATE: {
    name: 'Escalamiento',
    description: 'Ofrecer más pruebas o conectar con técnico',
    
    onText: ({ text }) => {
      const lower = text.toLowerCase().trim();
      
      if (/\b(mas pruebas|más pruebas|pruebas avanzadas|more tests)\b/i.test(lower)) {
        return {
          action: 'REQUEST_ADVANCED_TESTS',
          nextStage: 'ADVANCED_TESTS'
        };
      }
      
      if (/\b(tecnico|técnico|humano|persona|ayuda|technician)\b/i.test(lower)) {
        return {
          action: 'CREATE_TICKET',
          nextStage: 'CREATE_TICKET'
        };
      }
      
      return {
        action: 'NOT_UNDERSTOOD',
        nextStage: 'ESCALATE'
      };
    },
    
    onButton: ({ token }) => {
      if (token === 'BTN_MORE_TESTS' || token === 'BTN_ADVANCED_TESTS') {
        return {
          action: 'REQUEST_ADVANCED_TESTS',
          nextStage: 'ADVANCED_TESTS'
        };
      }
      
      if (token === 'BTN_CONNECT_TECH') {
        return {
          action: 'CREATE_TICKET',
          nextStage: 'CREATE_TICKET'
        };
      }
      
      if (token === 'BTN_CLOSE') {
        return {
          action: 'END_CONVERSATION',
          nextStage: 'ENDED'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ESCALATE' };
    }
  },
  
  // ========================================
  // 13. CREATE_TICKET - Crear ticket
  // ========================================
  CREATE_TICKET: {
    name: 'Crear Ticket',
    description: 'Generar ticket de soporte técnico',
    
    onText: () => {
      // Orchestrator llamará a createTicket()
      return {
        action: 'GENERATE_TICKET',
        nextStage: 'TICKET_SENT'
      };
    }
  },
  
  // ========================================
  // 14. TICKET_SENT - Ticket enviado
  // ========================================
  TICKET_SENT: {
    name: 'Ticket Enviado',
    description: 'Confirmar ticket creado',
    
    onText: () => {
      return {
        action: 'END_CONVERSATION',
        nextStage: 'ENDED'
      };
    }
  },
  
  // ========================================
  // 15. ENDED - Conversación finalizada
  // ========================================
  ENDED: {
    name: 'Conversación Finalizada',
    description: 'Chat cerrado',
    
    onText: ({ text }) => {
      const lower = text.toLowerCase().trim();
      
      // Reiniciar conversación
      if (/\b(hola|hello|hi|ayuda|help|nuevo|new)\b/i.test(lower)) {
        return {
          action: 'RESTART',
          reply: {
            'es-AR': '👋 ¡Hola de nuevo! ¿En qué puedo ayudarte?',
            'en': '👋 Hello again! How can I help you?'
          },
          buttons: ['BTN_PROBLEMA', 'BTN_CONSULTA'],
          nextStage: 'ASK_NEED'
        };
      }
      
      return {
        action: 'CONVERSATION_ENDED',
        reply: {
          'es-AR': 'La conversación ya finalizó. Si necesitás ayuda, iniciá un nuevo chat.',
          'en': 'The conversation has ended. If you need help, start a new chat.'
        },
        nextStage: 'ENDED'
      };
    }
  }
};

/**
 * BUTTON TOKEN MAP
 * Mapeo de tokens de botones a sus acciones
 */
export const BUTTON_ACTIONS = {
  // Idiomas
  BTN_LANG_ES_AR: { action: 'SELECT_LANGUAGE', locale: 'es-AR' },
  BTN_LANG_EN: { action: 'SELECT_LANGUAGE', locale: 'en' },
  
  // Nombre
  BTN_NO_NAME: { action: 'ANONYMOUS' },
  
  // Tipo de necesidad
  BTN_PROBLEMA: { action: 'PROBLEMA', needType: 'problema' },
  BTN_CONSULTA: { action: 'CONSULTA', needType: 'consulta' },
  
  // Dispositivos
  BTN_DEV_PC_DESKTOP: { action: 'SET_DEVICE', device: 'desktop' },
  BTN_DEV_PC_ALLINONE: { action: 'SET_DEVICE', device: 'all-in-one' },
  BTN_DEV_NOTEBOOK: { action: 'SET_DEVICE', device: 'notebook' },
  
  // Feedback
  BTN_SOLVED: { action: 'PROBLEM_SOLVED' },
  BTN_PERSIST: { action: 'PROBLEM_PERSISTS' },
  BTN_ADVANCED_TESTS: { action: 'REQUEST_ADVANCED_TESTS' },
  BTN_MORE_TESTS: { action: 'REQUEST_ADVANCED_TESTS' },
  BTN_CONNECT_TECH: { action: 'CREATE_TICKET' },
  BTN_CLOSE: { action: 'END_CONVERSATION' }
};

/**
 * Helper: Obtener handler de un stage
 */
export function getStageHandler(stage, eventType = 'onText') {
  const stageConfig = FLOW[stage];
  if (!stageConfig) {
    console.error(`[FLOW] Stage not found: ${stage}`);
    return null;
  }
  return stageConfig[eventType] || null;
}

/**
 * Helper: Validar stage existe
 */
export function isValidStage(stage) {
  return STAGES.hasOwnProperty(stage);
}
