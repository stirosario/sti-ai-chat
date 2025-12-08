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

const NOT_UNDERSTOOD_REPLY = {
  'es-AR': 'No te entendí bien. Elegí una opción o contame con más detalle 😊',
  'en': "I didn't get that. Please choose an option or add more detail 😊"
};

function getNotUnderstoodReply(locale) {
  return locale === 'en' ? NOT_UNDERSTOOD_REPLY['en'] : NOT_UNDERSTOOD_REPLY['es-AR'];
}

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
  // PLANILLA_FLUJO_STI: ID_ESTADO=ASK_LANGUAGE (PRIORIDAD=ALTA)
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
            'es-AR': '✅ Gracias por aceptar. 🌍 Elegí tu idioma para seguir. Sin consentimiento no puedo continuar.',
            'en': '✅ Thanks for accepting. 🌍 Pick your language to continue. Without consent I cannot continue.'
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
            'es-AR': '😔 Sin tu consentimiento no puedo seguir. Si cambiás de opinión, escribí "hola" y reiniciamos. 📧 Consultas sin registro: web@stia.com.ar',
            'en': '😔 Without your consent I cannot continue. If you change your mind, say "hi" to restart. 📧 For unregistered inquiries: web@stia.com.ar'
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
            reply: '✅ Listo, seguimos en Español. ¿Cómo te llamás? Podés seguir anónimo si querés. 😊',
            buttons: ['BTN_NO_NAME'],
            nextStage: 'ASK_NAME'
          };
        }
        
        if (/english|inglés|ingles|en-|us|uk/i.test(lower)) {
          return {
            action: 'SELECT_LANGUAGE',
            locale: 'en',
            reply: '✅ Great. We’ll continue in English. What’s your name? You can stay anonymous if you prefer. 😊',
            buttons: ['BTN_NO_NAME'],
            nextStage: 'ASK_NAME'
          };
        }
      }
      
      // No entendido
      return {
        action: 'NOT_UNDERSTOOD',
        reply: {
          'es-AR': getNotUnderstoodReply('es-AR'),
          'en': getNotUnderstoodReply('en')
        },
        nextStage: 'ASK_LANGUAGE' // Mantener
      };
    },
    
    onButton: ({ token, session }) => {
      if (token === 'BTN_LANG_ES_AR') {
        return {
          action: 'SELECT_LANGUAGE',
          locale: 'es-AR',
          reply: '✅ Listo, seguimos en Español. ¿Cómo te llamás? Podés seguir anónimo si querés. 😊',
          buttons: ['BTN_NO_NAME'],
          nextStage: 'ASK_NAME'
        };
      }
      
      if (token === 'BTN_LANG_EN') {
        return {
          action: 'SELECT_LANGUAGE',
          locale: 'en',
          reply: '✅ Great. We’ll continue in English. What’s your name? You can stay anonymous if you prefer. 😊',
          buttons: ['BTN_NO_NAME'],
          nextStage: 'ASK_NAME'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ASK_LANGUAGE' };
    }
  },
  
  // ========================================
  // 2. ASK_NAME - Nombre del usuario
  // PLANILLA_FLUJO_STI: ID_ESTADO=ASK_NAME (PRIORIDAD=ALTA)
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
            'es-AR': '🙈 Sin problema, seguimos anónimos. ¿Tenés un problema o una consulta?',
            'en': '🙈 No worries, we can keep it anonymous. Do you have a problem or a question?'
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
      if (token === 'BTN_NO_NAME') {
        return {
          action: 'ANONYMOUS',
          userName: null,
          reply: {
            'es-AR': '🙈 Sin problema, seguimos anónimos. ¿Tenés un problema o una consulta?',
            'en': '🙈 No worries, we can keep it anonymous. Do you have a problem or a question?'
          },
          buttons: ['BTN_PROBLEMA', 'BTN_CONSULTA'],
          nextStage: 'ASK_NEED'
        };
      }
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ASK_NAME' };
    }
  },
  
  // ========================================
  // 3. ASK_NEED - ¿Problema o Consulta?
  // PLANILLA_FLUJO_STI: ID_ESTADO=ASK_NEED (PRIORIDAD=ALTA)
  // ========================================
  ASK_NEED: {
    name: 'Tipo de Necesidad',
    description: 'Determinar si tiene problema técnico o consulta',
    
    onText: ({ text }) => {
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
    
    onButton: ({ token }) => {
      if (token === 'BTN_PROBLEMA') {
        return {
          action: 'PROBLEMA',
          needType: 'problema',
          reply: {
            'es-AR': '📌 Entendido. ¿Qué tipo de equipo es? Elegí o contame.',
            'en': '📌 Got it. What type of device is it? Pick or tell me.'
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
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ASK_NEED' };
    }
  },
  
  // ========================================
  // 4. CLASSIFY_NEED - Clasificar con AI
  // PLANILLA_FLUJO_STI: ID_ESTADO=CLASSIFY_NEED (PRIORIDAD=MEDIA)
  // ========================================
  CLASSIFY_NEED: {
    name: 'Clasificar Necesidad',
    description: 'Usar AI para determinar si es problema o consulta',
    
    onText: ({ text, smartAnalysis }) => {
      // AI con confianza suficiente
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
      
      // Fallback breve con botones (sin repetir pregunta larga)
      return {
        action: 'ASK_CLARIFICATION',
        reply: {
          'es-AR': 'Elegí si tenés un problema técnico o una consulta.',
          'en': 'Choose if you have a technical issue or a question.'
        },
        buttons: ['BTN_PROBLEMA', 'BTN_CONSULTA'],
        nextStage: 'ASK_NEED'
      };
    }
  },
  
  // ========================================
  // 5. ASK_DEVICE - Tipo de dispositivo
  // PLANILLA_FLUJO_STI: ID_ESTADO=ASK_DEVICE (PRIORIDAD=ALTA)
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
            'es-AR': `✅ Listo. ¿Qué problema tiene tu ${deviceMap[token]}? Si podés, mandá una foto.`,
            'en': `✅ Great. What issue is your ${deviceMap[token]} having? A photo helps if you can send it.`
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
  // PLANILLA_FLUJO_STI: ID_ESTADO=DETECT_DEVICE (PRIORIDAD=BAJA)
  // ========================================
  DETECT_DEVICE: {
    name: 'Detectar Dispositivo',
    description: 'Resolver ambigüedad en tipo de dispositivo',
    
    onText: ({ text }) => {
      // Copy breve alineado a planilla: pedir definición clara de dispositivo
      const lower = (text || '').toLowerCase();
      const reply = {
        'es-AR': 'No me quedó claro el tipo de equipo. Decime si es PC de escritorio, All-in-one o Notebook.',
        'en': 'I’m not sure which device you have. Tell me if it is a desktop PC, all-in-one, or notebook.'
      };
      // El orchestrator llamará a deviceDetection.js y procesará la desambiguación
      return {
        action: 'PROCESS_DISAMBIGUATION',
        reply,
        nextStage: 'ASK_PROBLEM'
      };
    }
  },
  
  // ========================================
  // 7. ASK_PROBLEM - Describir problema
  // PLANILLA_FLUJO_STI: ID_ESTADO=ASK_PROBLEM (PRIORIDAD=MEDIA)
  // ========================================
  ASK_PROBLEM: {
    name: 'Describir Problema',
    description: 'Usuario describe el problema técnico',
    
    onText: ({ text }) => {
      const problem = text || '';
      const summary = problem.length > 180 ? `${problem.slice(0, 177)}...` : problem;
      const reply = {
        'es-AR': summary
          ? `Entendí: "${summary}". Ahora vamos con pruebas básicas.`
          : 'Listo, vamos con pruebas básicas.',
        'en': summary
          ? `Got it: "${summary}". Now let’s run basic checks.`
          : 'Got it, let’s run basic checks.'
      };
      return {
        action: 'GENERATE_DIAGNOSTIC',
        problem,
        reply,
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
            'es-AR': `📸 Detecté este error: **${imageAnalysis.errorDescription}**. Vamos con pruebas básicas.`,
            'en': `📸 Detected this error: **${imageAnalysis.errorDescription}**. Running basic checks next.`
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
            'es-AR': '📸 La imagen no se ve clara. Enviá otra más nítida o describí el problema en texto.',
            'en': '📸 Image is unclear. Send a sharper one or describe the issue in text.'
          },
          nextStage: 'ASK_PROBLEM' // Mantener
        };
      }
      
      return null;
    }
  },
  
  // ========================================
  // 8. ASK_HOWTO_DETAILS - Consulta HOWTO
  // PLANILLA_FLUJO_STI: ID_ESTADO=ASK_HOWTO_DETAILS (PRIORIDAD=MEDIA)
  // ========================================
  ASK_HOWTO_DETAILS: {
    name: 'Detalles de Consulta',
    description: 'Usuario describe qué quiere aprender o configurar',
    
    onText: ({ text }) => {
      const query = text || '';
      const summary = query.length > 180 ? `${query.slice(0, 177)}...` : query;
      const reply = {
        'es-AR': summary
          ? `Entendido: "${summary}". Preparando una guía corta.`
          : 'Entendido. Preparando una guía corta.',
        'en': summary
          ? `Got it: "${summary}". I’ll prepare a short guide.`
          : 'Got it. I’ll prepare a short guide.'
      };
      return {
        action: 'GENERATE_HOWTO',
        query,
        reply,
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
  // PLANILLA_FLUJO_STI: ID_ESTADO=GENERATE_HOWTO (PRIORIDAD=MEDIA)
  // ========================================
  GENERATE_HOWTO: {
    name: 'Generar Guía',
    description: 'Generar pasos para consulta HOWTO',
    
    onText: ({ text }) => {
      // Orchestrator llamará a AI para generar guía
      const reply = {
        'es-AR': 'Generando tu guía con pasos claros. Dame un momento…',
        'en': 'Creating your guide now. One moment…'
      };
      return {
        action: 'CREATE_HOWTO_GUIDE',
        reply,
        nextStage: 'ENDED'
      };
    }
  },
  
  // ========================================
  // 10. BASIC_TESTS - Pruebas básicas
  // PLANILLA_FLUJO_STI: ID_ESTADO=BASIC_TESTS (PRIORIDAD=ALTA)
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
            'es-AR': '💡 Entiendo. ¿Querés más pruebas o hablar con un técnico?',
            'en': '💡 Got it. More tests or talk with a technician?'
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
          'es-AR': getNotUnderstoodReply('es-AR'),
          'en': getNotUnderstoodReply('en')
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
  // PLANILLA_FLUJO_STI: ID_ESTADO=ADVANCED_TESTS (PRIORIDAD=ALTA)
  // ========================================
  ADVANCED_TESTS: {
    name: 'Pruebas Avanzadas',
    description: 'Usuario ejecuta diagnóstico avanzado',
    
    onText: ({ text }) => {
      const lower = text.toLowerCase().trim();

      // 1) Se solucionó
      if (/\b(s|si|sí|ya anda|ya funciona|funciona|funcionó|funciono|arreglado|lo pude|lo solucion|solucionado|resuelto|fixed|solved)\b/i.test(lower)) {
        return {
          action: 'PROBLEM_SOLVED',
          reply: {
            'es-AR': '✅ Perfecto, las pruebas avanzadas parecen haber solucionado el problema. Si más adelante necesitás algo, podés volver a escribirme. 😊',
            'en': '✅ Great, it looks like the advanced checks solved the issue. If you need anything else later, just write again. 😊'
          },
          nextStage: 'ENDED'
        };
      }

      // 2) Sigue el problema (sin pedir técnico directamente)
      if (/\b(no|n|persiste|sigue|todavia|todavía|aun|aún|sigue igual|still)\b/i.test(lower)) {
        return {
          action: 'CREATE_TICKET',
          reply: {
            'es-AR': '💡 Sigue el problema. Lo mejor es hablar con un técnico con el botón "Hablar con técnico".',
            'en': '💡 Issue persists. Best next step: use "Talk to a technician" button.'
          },
          nextStage: 'CREATE_TICKET'
        };
      }

      // 3) Pide técnico / humano / visita directamente
      if (/\b(tecnico|técnico|humano|persona|visita|a domicilio|a tu casa|technician|support agent)\b/i.test(lower)) {
        return {
          action: 'CREATE_TICKET',
          reply: {
            'es-AR': '📲 Para hablar con un técnico, usá el botón "Hablar con técnico" y escribinos por WhatsApp.',
            'en': '📲 To talk with a technician, use the "Talk to a technician" button and write to us on WhatsApp.'
          },
          nextStage: 'CREATE_TICKET'
        };
      }

      // No entendido dentro de ADVANCED_TESTS
      return {
        action: 'NOT_UNDERSTOOD',
        reply: {
          'es-AR': getNotUnderstoodReply('es-AR'),
          'en': getNotUnderstoodReply('en')
        },
        nextStage: 'ADVANCED_TESTS'
      };
    },
    
    onButton: ({ token }) => {
      if (token === 'BTN_SOLVED') {
        return {
          action: 'PROBLEM_SOLVED',
          reply: {
            'es-AR': '✅ Genial, las pruebas avanzadas solucionaron el problema. Si necesitás algo más, escribime de nuevo. 😊',
            'en': '✅ Great, the advanced checks solved the issue. If you need anything else, just write again. 😊'
          },
          nextStage: 'ENDED'
        };
      }
      
      if (token === 'BTN_PERSIST' || token === 'BTN_CONNECT_TECH') {
        return {
          action: 'CREATE_TICKET',
          reply: {
            'es-AR': '📲 Para seguir con un técnico, usá el botón "Hablar con técnico" y escribinos por WhatsApp.',
            'en': '📲 To continue with a technician, use the "Talk to a technician" button and write to us on WhatsApp.'
          },
          nextStage: 'CREATE_TICKET'
        };
      }
      
      return { action: 'UNKNOWN_BUTTON', nextStage: 'ADVANCED_TESTS' };
    }
  },
  
  // ========================================
  // 12. ESCALATE - Escalamiento
  // PLANILLA_FLUJO_STI: ID_ESTADO=ESCALATE (PRIORIDAD=ALTA)
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
        reply: {
          'es-AR': getNotUnderstoodReply('es-AR'),
          'en': getNotUnderstoodReply('en')
        },
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
  // PLANILLA_FLUJO_STI: ID_ESTADO=CREATE_TICKET (PRIORIDAD=PENDIENTE)
  // ========================================
  CREATE_TICKET: {
    name: 'Crear Ticket',
    description: 'Generar ticket de soporte técnico',
    
    onText: () => {
      // Orchestrator llamará a createTicket()
      const reply = {
        'es-AR': '✅ Registro este problema como ticket interno con el contexto que tenemos. Si querés hablar con un técnico ahora, usá el botón "Hablar con técnico" para escribirnos por WhatsApp.',
        'en': '✅ I’m logging this issue as an internal ticket with the context we have. If you want to talk with a technician now, use the "Talk to a technician" button to write to us on WhatsApp.'
      };
      return {
        action: 'GENERATE_TICKET',
        reply,
        nextStage: 'TICKET_SENT'
      };
    }
  },
  
  // ========================================
  // 14. TICKET_SENT - Ticket enviado
  // PLANILLA_FLUJO_STI: ID_ESTADO=TICKET_SENT (PRIORIDAD=MEDIA)
  // ========================================
  TICKET_SENT: {
    name: 'Ticket Enviado',
    description: 'Confirmar ticket creado',
    
    onText: () => {
      return {
        action: 'END_CONVERSATION',
        reply: {
          'es-AR': '✅ Ticket interno creado. Si querés hablar con un técnico, usá el botón "Hablar con técnico" y escribinos por WhatsApp con el contexto.',
          'en': '✅ Internal ticket created. To talk with a technician, use the "Talk to a technician" button and write to us on WhatsApp with the context.'
        },
        nextStage: 'ENDED'
      };
    }
  },
  
  // ========================================
  // 15. ENDED - Conversación finalizada
  // PLANILLA_FLUJO_STI: ID_ESTADO=ENDED (PRIORIDAD=ALTA)
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
            'es-AR': '👋 Hola de nuevo. ¿Problema o consulta?',
            'en': '👋 Hello again. Problem or question?'
          },
          buttons: ['BTN_PROBLEMA', 'BTN_CONSULTA'],
          nextStage: 'ASK_NEED'
        };
      }
      
      return {
        action: 'CONVERSATION_ENDED',
        reply: {
          'es-AR': 'Chat finalizado. Escribí "hola" para reiniciar cuando quieras.',
          'en': 'Chat ended. Say "hi" to restart anytime.'
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
