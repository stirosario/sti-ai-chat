// ========================================================
// CEREBRO CONVERSACIONAL - Como funciona un LLM real
// ========================================================
// Este módulo simula cómo funciono yo: entendiendo contexto,
// detectando intención, extrayendo información y respondiendo naturalmente

/**
 * Analiza el mensaje del usuario y extrae intención + entidades
 * Similar a mi análisis interno cuando lees un mensaje
 */
export function analyzeUserIntent(text, session) {
  const t = text.toLowerCase();
  const analysis = {
    intent: null,  // 'greeting', 'problem', 'task', 'confirmation', 'question', 'frustration'
    entities: {
      name: null,
      device: null,
      action: null,  // 'no funciona', 'instalar', 'configurar', etc
      location: null,  // 'oficina', 'casa', etc
      urgency: 'normal'  // 'urgent', 'normal', 'low'
    },
    sentiment: 'neutral',  // 'positive', 'neutral', 'negative', 'frustrated'
    confidence: 0
  };

  // 1. DETECCIÓN DE SENTIMIENTO (como yo detecto tu tono)
  if (/urgente|ya|ahora mismo|r[aá]pido|desesperado/i.test(t)) {
    analysis.sentiment = 'frustrated';
    analysis.entities.urgency = 'urgent';
  } else if (/por favor|gracias|genial|perfecto|excelente/i.test(t)) {
    analysis.sentiment = 'positive';
  } else if (/no sirve|no funciona nada|p[eé]simo|mierda|carajo/i.test(t)) {
    analysis.sentiment = 'negative';
  }

  // 2. DETECCIÓN DE INTENCIÓN (qué quiere hacer)
  if (!session.userName && /^[a-zA-Z\u00C0-\u017F\s]{2,30}$/.test(text.trim())) {
    // Parece un nombre simple
    analysis.intent = 'providing_name';
    analysis.entities.name = text.trim();
    analysis.confidence = 0.85;
  } else if (/^(hola|buenos d[ií]as|buenas tardes|hey|hi|hello)/i.test(t)) {
    analysis.intent = 'greeting';
    analysis.confidence = 0.95;
  } else if (/no\s+(funciona|prende|anda|carga|enciende|responde)|error|falla|roto|da[ñn]ado/i.test(t)) {
    analysis.intent = 'problem';
    analysis.entities.action = 'no funciona';
    analysis.confidence = 0.9;
  } else if (/c[oó]mo\s+(hago|puedo|se)|instalar|configurar|conectar|poner|agregar/i.test(t)) {
    analysis.intent = 'task';
    analysis.entities.action = extractAction(t);
    analysis.confidence = 0.85;
  } else if (/^(s[ií]|no|ok|dale|perfecto|exacto)$/i.test(t)) {
    analysis.intent = 'confirmation';
    analysis.confidence = 0.9;
  } else if (/\?/.test(t) || /qu[eé]|c[oó]mo|cu[aá]ndo|d[oó]nde|por qu[eé]/i.test(t)) {
    analysis.intent = 'question';
    analysis.confidence = 0.8;
  } else {
    // Descripción de problema o contexto adicional
    analysis.intent = 'description';
    analysis.confidence = 0.7;
  }

  // 3. DETECCIÓN DE DISPOSITIVO (como yo detecto de qué hablas)
  const devices = {
    'computadora|pc|compu|notebook|laptop|escritorio': 'PC',
    'teclado|keyboard': 'Teclado',
    'mouse|rat[oó]n': 'Mouse',
    'impresora|printer': 'Impresora',
    'monitor|pantalla|display': 'Monitor',
    'router|wifi|red|internet|conexi[oó]n': 'Red/Internet',
    'tel[eé]fono|celular|m[oó]vil|smartphone': 'Teléfono',
    'c[aá]mara|webcam': 'Cámara',
    'auriculares|headset|cascos': 'Auriculares',
    'micr[oó]fono|mic': 'Micrófono'
  };

  for (const [pattern, deviceName] of Object.entries(devices)) {
    if (new RegExp(pattern, 'i').test(t)) {
      analysis.entities.device = deviceName;
      break;
    }
  }

  return analysis;
}

/**
 * Extrae la acción específica del texto
 */
function extractAction(text) {
  const actions = {
    'instalar': 'instalar',
    'configurar': 'configurar',
    'conectar': 'conectar',
    'poner': 'configurar',
    'agregar': 'agregar',
    'cambiar': 'cambiar',
    'actualizar': 'actualizar'
  };

  for (const [keyword, action] of Object.entries(actions)) {
    if (new RegExp(keyword, 'i').test(text)) {
      return action;
    }
  }

  return 'configurar';
}

/**
 * Genera respuesta conversacional basada en el análisis
 * Similar a cómo yo genero respuestas contextuales
 */
export function generateConversationalResponse(analysis, session, userMessage) {
  const { intent, entities, sentiment } = analysis;
  const { conversationState, userName, detectedEntities } = session;

  // Actualizar entidades detectadas en sesión
  if (entities.device && !detectedEntities.device) {
    session.detectedEntities.device = entities.device;
  }
  if (entities.action) {
    session.detectedEntities.action = entities.action;
  }

  // MÁQUINA DE ESTADOS CONVERSACIONAL
  switch (conversationState) {
    case 'greeting':
      return handleGreetingState(analysis, session, userMessage);
    
    case 'has_name':
      return handleHasNameState(analysis, session, userMessage);
    
    case 'understanding_problem':
      return handleUnderstandingProblemState(analysis, session, userMessage);
    
    case 'solving':
      return handleSolvingState(analysis, session, userMessage);
    
    case 'resolved':
      return handleResolvedState(analysis, session, userMessage);
    
    default:
      return handleGreetingState(analysis, session, userMessage);
  }
}

/**
 * Estado: Saludo inicial (pidiendo nombre)
 */
function handleGreetingState(analysis, session, userMessage) {
  if (analysis.intent === 'providing_name') {
    session.userName = capitalizeFirst(analysis.entities.name);
    session.conversationState = 'has_name';
    
    const responses = [
      `¡Perfecto, ${session.userName}! Contame, ¿qué problema técnico tenés o qué necesitás hacer?`,
      `Genial, ${session.userName}. ¿En qué puedo ayudarte hoy?`,
      `Encantado, ${session.userName}. Decime qué te trae por acá.`
    ];
    
    return {
      reply: responses[Math.floor(Math.random() * responses.length)],
      expectingInput: true,
      suggestedActions: []  // Sin botones, todo conversacional
    };
  } else if (analysis.intent === 'problem' || analysis.intent === 'task') {
    // Usuario contó el problema SIN dar nombre
    session.userName = 'Usuario';
    session.conversationState = 'understanding_problem';
    session.problemDescription = userMessage;
    
    return {
      reply: `Entiendo. Antes de ayudarte, ¿cómo te llamás? (Así personalizo la asistencia)`,
      expectingInput: true
    };
  } else {
    // No entendió, reformular pregunta
    return {
      reply: `Perdón, no capté bien. Para empezar, ¿me decís tu nombre?`,
      expectingInput: true
    };
  }
}

/**
 * Estado: Ya tenemos nombre, esperando problema
 */
function handleHasNameState(analysis, session, userMessage) {
  session.problemDescription += ' ' + userMessage;
  session.conversationState = 'understanding_problem';
  
  const { device, action } = analysis.entities;
  
  // Construir respuesta inteligente
  let reply = '';
  
  if (device && action === 'no funciona') {
    // Detectó dispositivo Y problema
    session.detectedEntities.device = device;
    reply = `Ok ${session.userName}, entiendo que tu ${device.toLowerCase()} no está funcionando bien. `;
    
    // Preguntar síntomas específicos
    if (device === 'PC') {
      reply += `¿Prende pero no carga Windows, o directamente no enciende para nada?`;
    } else if (device === 'Impresora') {
      reply += `¿No imprime nada, imprime en blanco, o da algún error específico?`;
    } else if (device === 'Red/Internet') {
      reply += `¿No te conectás para nada al WiFi, o te conectás pero no tenés internet?`;
    } else {
      reply += `Contame con más detalle qué pasa exactamente.`;
    }
    
  } else if (device && action) {
    // Quiere hacer algo (instalar, configurar, etc)
    session.detectedEntities.device = device;
    session.detectedEntities.action = action;
    reply = `Perfecto ${session.userName}, te voy a guiar para ${action} tu ${device.toLowerCase()}. `;
    reply += `Primero, ¿ya tenés el dispositivo físicamente conectado?`;
    
  } else if (action === 'no funciona' && !device) {
    // Problema pero sin dispositivo detectado
    reply = `Entiendo que algo no funciona. ¿Qué es exactamente lo que falla? (PC, impresora, teclado, mouse, red, etc)`;
    
  } else {
    // No quedó claro, preguntar abiertamente
    reply = `${session.userName}, contame con detalle: ¿qué problema tenés o qué querés hacer? Mientras más me cuentes, mejor te puedo ayudar.`;
  }
  
  return {
    reply,
    expectingInput: true
  };
}

/**
 * Estado: Entendiendo el problema en profundidad
 */
function handleUnderstandingProblemState(analysis, session, userMessage) {
  session.problemDescription += ' ' + userMessage;
  
  const { device, action } = session.detectedEntities;
  
  // Si ya tenemos suficiente info, pasar a resolver
  if (device && (action || session.problemDescription.length > 50)) {
    session.conversationState = 'solving';
    
    let reply = `Dale, ${session.userName}. Vamos a resolverlo paso a paso. `;
    
    // Generar primer paso inteligente según dispositivo
    if (device === 'PC' && action === 'no funciona') {
      reply += `\n\n🔍 **Paso 1:** Verificá que el cable de corriente esté bien conectado tanto a la PC como al enchufe.\n\n¿Lo verificaste? Contame qué ves.`;
    } else if (device === 'Impresora') {
      reply += `\n\n🔍 **Paso 1:** Fijate si la impresora tiene alguna luz encendida o parpadeante. ¿Qué luces ves?`;
    } else if (device === 'Red/Internet') {
      reply += `\n\n🔍 **Paso 1:** Mirá el router, ¿qué luces tiene encendidas? (verde, roja, naranja, parpadeando, etc)`;
    } else if (device === 'Teclado') {
      reply += `\n\n🔍 **Paso 1:** Probá desconectar el teclado y volverlo a conectar (USB). Si es inalámbrico, fijate si tiene pilas.\n\n¿Funcionó?`;
    } else {
      reply += `\n\n🔍 **Paso 1:** Primero lo básico: ¿el dispositivo está encendido y bien conectado?`;
    }
    
    session.stepProgress.current = 1;
    session.stepProgress.total = 5;  // Estimado
    
    return { reply, expectingInput: true };
  } else {
    // Necesitamos más info
    return {
      reply: `Entendido. ¿Algo más que puedas contarme? Por ejemplo, ¿cuándo empezó a fallar? ¿Hacías algo en particular?`,
      expectingInput: true
    };
  }
}

/**
 * Estado: Resolviendo el problema (dando pasos)
 */
function handleSolvingState(analysis, session, userMessage) {
  const step = session.stepProgress.current || 1;
  const device = session.detectedEntities.device;
  
  // Analizar si el usuario confirma que funcionó
  if (/s[ií]|funcion[oó]|anduvo|ok|perfecto|genial|resuelto|listo/i.test(userMessage)) {
    session.conversationState = 'resolved';
    return {
      reply: `¡Excelente ${session.userName}! Me alegra que lo hayamos resuelto. 🎉\n\n¿Necesitás ayuda con algo más?`,
      expectingInput: true
    };
  } else if (/no|nada|sigue igual|no funcion[oó]/i.test(userMessage)) {
    // No funcionó, siguiente paso
    session.stepProgress.current = step + 1;
    
    const nextStep = generateNextStep(device, step + 1, session);
    
    if (nextStep) {
      return { reply: nextStep, expectingInput: true };
    } else {
      // Ya no hay más pasos básicos, escalar
      return {
        reply: `${session.userName}, ya probamos los pasos básicos. Necesito que un técnico revise esto en persona.\n\n¿Querés que genere un ticket de soporte para que te contactemos?`,
        expectingInput: true
      };
    }
  } else {
    // Respuesta ambigua, pedir clarificación
    return {
      reply: `¿Eso significa que funcionó o sigue sin andar? Decime "sí funcionó" o "no, sigue igual" para saber cómo seguir.`,
      expectingInput: true
    };
  }
}

/**
 * Genera el siguiente paso según dispositivo y número de paso
 */
function generateNextStep(device, stepNumber, session) {
  const steps = {
    'PC': [
      '🔍 **Paso 2:** Desconectá la PC del enchufe, esperá 30 segundos, y volvé a conectarla. ¿Ahora enciende?',
      '🔍 **Paso 3:** Fijate si el monitor está encendido y bien conectado a la PC. ¿Ves algo en la pantalla?',
      '🔍 **Paso 4:** Probá presionar el botón de encendido por 10 segundos (apagado forzado) y luego encender de nuevo.',
      '🔍 **Paso 5:** Si tenés otro cable de corriente, probalo. A veces el cable está fallando.'
    ],
    'Impresora': [
      '🔍 **Paso 2:** Desenchufá la impresora, esperá 30 segundos, y volvé a enchufarla. ¿Cambió algo?',
      '🔍 **Paso 3:** En tu PC, andá a "Dispositivos e Impresoras" y fijate si la impresora aparece. ¿La ves ahí?',
      '🔍 **Paso 4:** Hacé click derecho en la impresora y elegí "Ver lo que se está imprimiendo". ¿Hay trabajos trabados?',
      '🔍 **Paso 5:** Probá imprimir una página de prueba desde las propiedades de la impresora.'
    ],
    'Red/Internet': [
      '🔍 **Paso 2:** Desenchufá el router, esperá 1 minuto completo, y volvé a enchufarlo. Esperá 2-3 minutos que arranque.',
      '🔍 **Paso 3:** En tu PC, buscá el ícono de WiFi abajo a la derecha. ¿Qué dice? ¿Aparece tu red?',
      '🔍 **Paso 4:** Probá olvidar la red WiFi y volver a conectarte poniendo la contraseña de nuevo.',
      '🔍 **Paso 5:** Conectá un cable de red directo del router a la PC. ¿Así funciona internet?'
    ],
    'Teclado': [
      '🔍 **Paso 2:** Probá el teclado en otro puerto USB. ¿Funciona en otro puerto?',
      '🔍 **Paso 3:** Si tenés otro teclado, probalo en tu PC. Así descartamos si es el teclado o la PC.',
      '🔍 **Paso 4:** Reiniciá la PC con el teclado conectado. A veces Windows lo detecta al iniciar.',
      '🔍 **Paso 5:** Andá a Administrador de Dispositivos y fijate si aparece alguna advertencia amarilla en "Teclados".'
    ]
  };
  
  const deviceSteps = steps[device] || [];
  return deviceSteps[stepNumber - 2] || null;  // -2 porque empezamos en paso 1
}

/**
 * Estado: Problema resuelto
 */
function handleResolvedState(analysis, session, userMessage) {
  if (/s[ií]|otro|m[aá]s/i.test(userMessage)) {
    // Quiere resolver otra cosa
    session.conversationState = 'has_name';
    session.problemDescription = '';
    session.detectedEntities = { device: null, action: null, urgency: 'normal' };
    session.stepProgress = {};
    
    return {
      reply: `Dale ${session.userName}, decime qué más necesitás.`,
      expectingInput: true
    };
  } else {
    // Terminó
    return {
      reply: `Perfecto ${session.userName}. Cualquier cosa que necesites, volvé a escribirme. ¡Que tengas un buen día! 👋`,
      expectingInput: false
    };
  }
}

/**
 * Capitaliza primera letra
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export default {
  analyzeUserIntent,
  generateConversationalResponse
};
