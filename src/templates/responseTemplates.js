/**
 * responseTemplates.js
 * 
 * Sistema centralizado de plantillas de respuesta empáticas.
 * Organiza todas las respuestas por stage con personalización dinámica.
 * 
 * RESPONSABILIDADES:
 * - Plantillas por stage de conversación
 * - Personalización con nombre de usuario
 * - Variaciones para evitar repetición
 * - Respuestas contextuales según sentimiento
 * - Soporte multiidioma (ES/EN)
 * 
 * COMPATIBILIDAD: Centraliza todas las respuestas hardcodeadas del server.js
 */

// ========== CONFIGURACIÓN ==========
const DEFAULT_LOCALE = 'es';
const DEFAULT_USER_NAME = 'Usuari@';

// ========== PLANTILLAS POR STAGE ==========
const TEMPLATES = {
  // ========== SALUDO INICIAL ==========
  greeting: {
    es: {
      welcome: [
        '¡Hola {name}! 👋 Soy Tecnos, tu asistente técnico de STI.',
        'Bienvenido/a {name}! 🤖 ¿Tenés algún problema técnico o necesitás ayuda con algo?',
        'Hola {name}! 🛠️ Aquí estoy para ayudarte con cualquier problema técnico.'
      ],
      askHelp: '¿En qué puedo asistirte hoy?',
      options: {
        problema: '🔧 Tengo un problema técnico',
        consulta: '💬 Tengo una consulta general',
        otro: '📋 Otro tipo de ayuda'
      }
    },
    en: {
      welcome: [
        'Hi {name}! 👋 I\'m Tecnos, your STI technical assistant.',
        'Welcome {name}! 🤖 Do you have a technical problem or need help with something?'
      ],
      askHelp: 'How can I assist you today?',
      options: {
        problema: '🔧 I have a technical problem',
        consulta: '💬 I have a general question',
        otro: '📋 Other type of help'
      }
    }
  },

  // ========== IDENTIFICACIÓN DE PROBLEMA ==========
  problem_identification: {
    es: {
      intro: [
        'Perfecto, {name} 🤖✨.\nSi tu situación está en esta lista, elegí la opción que mejor la describa: 👉',
        'Entiendo {name}. Mirá estas opciones comunes y elegí la que más se ajuste:',
        'Dale {name}, veamos... ¿Tu problema es alguno de estos?'
      ],
      fallback: '\n\nO si lo preferís, describime el problema con tus palabras… 💬🔧',
      clarification: '¿Podrías darme más detalles sobre el problema?'
    },
    en: {
      intro: [
        'Perfect {name}. Tell me: what problem are you having?',
        'I understand {name}. What issue are you experiencing?'
      ],
      fallback: '\n\nOr if you prefer, describe the problem in your own words… 💬🔧',
      clarification: 'Could you give me more details about the problem?'
    }
  },

  // ========== DESAMBIGUACIÓN DE DISPOSITIVO ==========
  device_disambiguation: {
    es: {
      intro: [
        'Entiendo {name}. Cuando decís "{device}", ¿te referís a alguno de estos?',
        'Perfecto {name}. Ayudame a aclarar: "{device}" es...',
        'Ok {name}, para asegurarme: ¿"{device}" es...?'
      ],
      select: 'Elegí la opción correcta:'
    },
    en: {
      intro: [
        'I understand {name}. When you say "{device}", do you mean one of these?',
        'Perfect {name}. Help me clarify: "{device}" is...'
      ],
      select: 'Choose the correct option:'
    }
  },

  // ========== GENERACIÓN DE DIAGNÓSTICO ==========
  diagnostic_generation: {
    es: {
      generating: [
        'Analizando tu problema... 🔍',
        'Generando pasos de solución... ⚙️',
        'Preparando diagnóstico personalizado... 🛠️'
      ],
      ready: 'Listo {name}! Preparé estos pasos para resolver tu problema:',
      withImage: 'Perfecto {name}! Analicé la imagen que enviaste. 📸\n\nAquí están los pasos:'
    },
    en: {
      generating: [
        'Analyzing your problem... 🔍',
        'Generating solution steps... ⚙️'
      ],
      ready: 'Ready {name}! I prepared these steps to solve your problem:',
      withImage: 'Perfect {name}! I analyzed the image you sent. 📸\n\nHere are the steps:'
    }
  },

  // ========== EJECUCIÓN DE PASOS ==========
  step_execution: {
    es: {
      current: '📍 Paso {index} de {total}:',
      askResult: '¿Funcionó este paso?',
      success: '¡Excelente {name}! 🎉 Me alegra que se haya solucionado.',
      failed: 'Entiendo {name}. Probemos con el siguiente paso.',
      help: 'Si necesitás ayuda con este paso, pedímela.'
    },
    en: {
      current: '📍 Step {index} of {total}:',
      askResult: 'Did this step work?',
      success: 'Excellent {name}! 🎉 I\'m glad it worked.',
      failed: 'I understand {name}. Let\'s try the next step.'
    }
  },

  // ========== ESCALAMIENTO ==========
  escalation: {
    es: {
      intro: [
        'Entiendo {name}. Parece que necesitamos ayuda especializada.',
        'Ok {name}, veo que esto requiere atención técnica personalizada.',
        'Perfecto {name}. Vamos a derivarte con un técnico.'
      ],
      ticket: 'Creé un ticket para tu caso:',
      whatsapp: '¿Querés continuar la asistencia por WhatsApp?'
    },
    en: {
      intro: [
        'I understand {name}. It seems we need specialized help.',
        'OK {name}, this requires personalized technical attention.'
      ],
      ticket: 'I created a ticket for your case:',
      whatsapp: 'Would you like to continue assistance via WhatsApp?'
    }
  },

  // ========== ERRORES Y VALIDACIONES ==========
  errors: {
    es: {
      invalidName: 'Por favor, ingresá un nombre válido.',
      noInput: 'No recibí ningún mensaje. ¿Podrías escribir tu consulta?',
      tooLong: 'Tu mensaje es muy largo. ¿Podrías resumirlo?',
      imageError: 'Hubo un problema procesando la imagen. ¿Podrías intentar de nuevo?',
      systemError: 'Disculpá {name}, hubo un error temporal. Intentá nuevamente en unos segundos.'
    },
    en: {
      invalidName: 'Please enter a valid name.',
      noInput: 'I didn\'t receive any message. Could you write your question?',
      tooLong: 'Your message is too long. Could you summarize it?',
      imageError: 'There was a problem processing the image. Could you try again?',
      systemError: 'Sorry {name}, there was a temporary error. Try again in a few seconds.'
    }
  },

  // ========== DESPEDIDA ==========
  farewell: {
    es: {
      solved: '¡Genial {name}! 🎉 Me alegra haber podido ayudarte. ¡Hasta pronto!',
      partial: 'Ok {name}. Si necesitás algo más, acá estoy. ¡Saludos!',
      frustrated: 'Disculpá si no pude resolver tu problema {name}. Nuestro equipo está disponible para ayudarte.'
    },
    en: {
      solved: 'Great {name}! 🎉 I\'m glad I could help you. See you soon!',
      partial: 'OK {name}. If you need anything else, I\'m here. Goodbye!',
      frustrated: 'Sorry I couldn\'t solve your problem {name}. Our team is available to help you.'
    }
  }
};

// ========== FUNCIONES DE GENERACIÓN ==========

/**
 * Obtener plantilla con reemplazo de variables
 */
function getTemplate(stage, key, locale = DEFAULT_LOCALE, vars = {}) {
  const stageTemplates = TEMPLATES[stage];
  if (!stageTemplates) {
    console.warn(`[Templates] Stage not found: ${stage}`);
    return '';
  }

  const localeTemplates = stageTemplates[locale] || stageTemplates[DEFAULT_LOCALE];
  let template = localeTemplates[key];

  if (!template) {
    console.warn(`[Templates] Key not found: ${stage}.${key}`);
    return '';
  }

  // Si es array, elegir aleatoriamente
  if (Array.isArray(template)) {
    template = template[Math.floor(Math.random() * template.length)];
  }

  // Reemplazar variables
  return replaceVars(template, vars);
}

/**
 * Reemplazar variables en plantilla
 */
function replaceVars(template, vars = {}) {
  let result = template;
  
  // Agregar nombre por defecto si no existe
  if (!vars.name) {
    vars.name = DEFAULT_USER_NAME;
  }

  // Reemplazar cada variable
  Object.keys(vars).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, vars[key]);
  });

  return result;
}

/**
 * Generar respuesta de bienvenida
 */
export function generateWelcome(userName, locale = 'es') {
  const welcome = getTemplate('greeting', 'welcome', locale, { name: userName });
  const askHelp = getTemplate('greeting', 'askHelp', locale);
  
  return `${welcome}\n\n${askHelp}`;
}

/**
 * Generar introducción de problema
 */
export function generateProblemIntro(userName, locale = 'es') {
  const intro = getTemplate('problem_identification', 'intro', locale, { name: userName });
  const fallback = getTemplate('problem_identification', 'fallback', locale);
  
  return intro + fallback;
}

/**
 * Generar mensaje de desambiguación
 */
export function generateDeviceDisambiguation(userName, device, locale = 'es') {
  const intro = getTemplate('device_disambiguation', 'intro', locale, { 
    name: userName, 
    device 
  });
  const select = getTemplate('device_disambiguation', 'select', locale);
  
  return `${intro}\n\n${select}`;
}

/**
 * Generar mensaje de paso actual
 */
export function generateStepMessage(stepIndex, totalSteps, stepContent, userName, locale = 'es') {
  const current = getTemplate('step_execution', 'current', locale, { 
    index: stepIndex + 1, 
    total: totalSteps 
  });
  const askResult = getTemplate('step_execution', 'askResult', locale);
  
  return `${current}\n\n${stepContent}\n\n${askResult}`;
}

/**
 * Generar mensaje de éxito
 */
export function generateSuccessMessage(userName, locale = 'es') {
  return getTemplate('step_execution', 'success', locale, { name: userName });
}

/**
 * Generar mensaje de error
 */
export function generateErrorMessage(errorType, userName, locale = 'es') {
  return getTemplate('errors', errorType, locale, { name: userName });
}

/**
 * Generar mensaje contextual según sentimiento
 */
export function generateContextualMessage(stage, sentiment, userName, locale = 'es', vars = {}) {
  // Ajustar tono según sentimiento
  const allVars = { name: userName, ...vars };
  
  if (sentiment === 'negative' && stage === 'escalation') {
    return getTemplate('escalation', 'intro', locale, allVars);
  }
  
  if (sentiment === 'positive' && stage === 'farewell') {
    return getTemplate('farewell', 'solved', locale, allVars);
  }
  
  // Fallback genérico
  return getTemplate(stage, 'intro', locale, allVars);
}

// ========== EXPORTAR TODO ==========
export { TEMPLATES };

export default {
  getTemplate,
  generateWelcome,
  generateProblemIntro,
  generateDeviceDisambiguation,
  generateStepMessage,
  generateSuccessMessage,
  generateErrorMessage,
  generateContextualMessage
};
