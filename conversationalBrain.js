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
  
  // Detectar nombre con patrones comunes (usar texto original, no lowercase)
  const namePatterns = [
    /(?:me llamo|soy|mi nombre es)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i,
    /^([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)$/
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);  // Usar 'text' original, no 't' lowercase
    if (match && !session.userName) {
      console.log('[NLU] ✅ Nombre detectado:', match[1] || match[0]);
      analysis.intent = 'providing_name';
      analysis.entities.name = match[1] || match[0];
      analysis.confidence = 0.9;
      break;
    }
  }
  
  console.log('[NLU] Intent final:', analysis.intent, 'para texto:', text.substring(0, 50));
  
  if (analysis.intent !== 'providing_name' && /^(hola|buenos d[ií]as|buenas tardes|hey|hi|hello)/i.test(t)) {
    analysis.intent = 'greeting';
    analysis.confidence = 0.95;
  } else if (/no\s+(funciona|prende|anda|carga|enciende|responde)|error|falla|roto|da[ñn]ado/i.test(t)) {
    analysis.intent = 'problem';
    analysis.entities.action = 'no funciona';
    analysis.confidence = 0.9;
  } else if (/descargar|bajar|instalar|configurar|conectar|c[oó]mo\s+(hago|puedo|se)|poner|agregar/i.test(t)) {
    analysis.intent = 'task';
    analysis.entities.action = extractAction(t);
    analysis.confidence = 0.85;
  } else if (/^(s[ií]|no|ok|dale|perfecto|exacto)$/i.test(t)) {
    analysis.intent = 'confirmation';
    analysis.confidence = 0.9;
  } else if (/\?/.test(t) || /qu[eé]|c[oó]mo|cu[aá]ndo|d[oó]nde|por qu[eé]/i.test(t)) {
    analysis.intent = 'question';
    analysis.confidence = 0.8;
  } else if (analysis.intent !== 'providing_name') {
    // Descripción de problema o contexto adicional (solo si no detectamos nombre antes)
    analysis.intent = 'description';
    analysis.confidence = 0.7;
  }

  // 3. DETECCIÓN DE DISPOSITIVO (como yo detecto de qué hablas)
  const devices = {
    'servidor|server|file server|archivos compartidos|carpeta compartida|recurso compartido|acceso remoto': 'Servidor',
    'computadora|pc|compu|notebook|laptop|escritorio': 'PC',
    'anydesk|any desk': 'Software-AnyDesk',
    'teamviewer|team viewer': 'Software-TeamViewer',
    'programa|software|aplicaci[oó]n': 'Software',
    'teclado|keyboard': 'Teclado',
    'mouse|rat[oó]n': 'Mouse',
    'impresora|printer': 'Impresora',
    'monitor|pantalla|display': 'Monitor',
    'router|wifi|red|internet|conexi[oó]n|mikrotik': 'Red/Router',
    'tel[eé]fono|celular|m[oó]vil|smartphone': 'Teléfono',
    'c[aá]mara|webcam': 'Cámara',
    'auriculares|headset|cascos': 'Auriculares',
    'micr[oó]fono|mic': 'Micrófono',
    'disco|disco duro|hdd|ssd|almacenamiento': 'Disco',
    'fire tv|amazon fire|fire stick|amazon stick': 'Fire-TV-Stick',
    'xiaomi tv|mi tv stick|mi stick|xiaomi stick': 'Xiaomi-Mi-TV-Stick',
    'roku|roku stick|roku streaming': 'Roku-Streaming-Stick',
    'apple tv': 'Apple-TV',
    'nvidia shield|shield tv|nvidia shield tv': 'Nvidia-Shield-TV',
    'google tv|chromecast.*google tv|google.*chromecast': 'Google-TV'
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
    'descargar': 'descargar',
    'bajar': 'descargar',
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
export async function generateConversationalResponse(analysis, session, userMessage) {
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
      return await handleUnderstandingProblemState(analysis, session, userMessage);
    
    case 'solving':
      return await handleSolvingState(analysis, session, userMessage);
    
    case 'resolved':
      return handleResolvedState(analysis, session, userMessage);
    
    case 'escalate':
      return handleEscalateState(analysis, session, userMessage);
    
    default:
      return handleGreetingState(analysis, session, userMessage);
  }
}

/**
 * Estado: Saludo inicial (pidiendo nombre)
 */
function handleGreetingState(analysis, session, userMessage) {
  console.log('[GREETING] Intent recibido:', analysis.intent);
  console.log('[GREETING] Entities:', analysis.entities);
  
  // 🔐 PASO -1: CONSENTIMIENTO GDPR (obligatorio antes de todo)
  if (!session.gdprConsent) {
    const lowerMsg = userMessage.toLowerCase().trim();
    
    // Detectar aceptación
    if (/\b(acepto|aceptar|si|sí|ok|dale|de acuerdo|agree|accept|yes)\b/i.test(lowerMsg)) {
      session.gdprConsent = true;
      session.gdprConsentDate = new Date().toISOString();
      console.log('[GDPR] ✅ Consentimiento otorgado:', session.gdprConsentDate);
      
      // Continuar al flujo de idioma
      return {
        reply: `✅ **Gracias por aceptar**\n\n🌍 **Seleccioná tu idioma / Select your language:**\n\n🇦🇷 **Español (Argentina)** - Escribí "español" o "1"\n🇺🇸 **English** - Type "english" or "2"\n\n_Podés cambiar de idioma en cualquier momento_`,
        expectingInput: true
      };
    }
    
    // Detectar rechazo
    if (/\b(no acepto|no quiero|rechazo|cancel|decline)\b/i.test(lowerMsg)) {
      return {
        reply: `😔 Entiendo. Sin tu consentimiento no puedo continuar.\n\nSi cambiás de opinión, podés volver a iniciar el chat.\n\n📧 Para consultas sin registro, escribinos a: soporte@stia.com.ar`,
        expectingInput: false
      };
    }
    
    // Mostrar política de privacidad (primera interacción)
    return {
      reply: `📋 **Política de Privacidad y Consentimiento**\n\nAntes de continuar, quiero informarte:\n\n✅ Guardaré tu nombre y nuestra conversación durante **48 horas**\n✅ Los datos se usarán **solo para brindarte soporte técnico**\n✅ Podés solicitar **eliminación de tus datos** en cualquier momento\n✅ **No compartimos** tu información con terceros\n✅ Cumplimos con **GDPR y normativas de privacidad**\n\n🔗 Política completa: https://stia.com.ar/politica-privacidad.html\n\n**¿Aceptás estos términos?**\n\nRespondé "acepto" o "sí" para continuar\nRespondé "no acepto" para cancelar`,
      expectingInput: true
    };
  }
  
  // 🆕 PASO 0: Selección de idioma (si no está definido)
  if (!session.userLocale || session.conversationState === 'greeting') {
    const lowerMsg = userMessage.toLowerCase().trim();
    
    // Detectar selección de idioma
    if (lowerMsg.includes('español') || lowerMsg.includes('spanish') || lowerMsg === '1') {
      session.userLocale = 'es-AR';
      session.conversationState = 'greeting_name';
      console.log('[GREETING] 🌍 Idioma seleccionado: Español (Argentina)');
      
      return {
        reply: `🇦🇷 ¡Perfecto! Sigamos en español.\n\n💬 **¡Hola! Soy Tecnos, tu asistente técnico virtual**\n\nEstoy acá para ayudarte con cualquier problema de computadoras, impresoras, redes, dispositivos de streaming y más.\n\n📝 Para comenzar, ¿cómo te llamás?`,
        expectingInput: true
      };
    } else if (lowerMsg.includes('english') || lowerMsg.includes('inglés') || lowerMsg.includes('ingles') || lowerMsg === '2') {
      session.userLocale = 'en-US';
      session.conversationState = 'greeting_name';
      console.log('[GREETING] 🌍 Idioma seleccionado: English (US)');
      
      return {
        reply: `🇺🇸 Perfect! Let's continue in English.\n\n💬 **Hello! I'm Tecnos, your virtual tech assistant**\n\nI'm here to help you with any computer, printer, network, streaming device issues and more.\n\n📝 To get started, what's your name?`,
        expectingInput: true
      };
    }
    
    // Mensaje inicial con selección de idioma
    return {
      reply: `🌍 **Welcome | Bienvenido**\n\n💻 **STI - Soporte Técnico Inteligente**\nAI Technical Support Assistant\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n🇦🇷 **Español** - Escribí "español" o "1"\n🇺🇸 **English** - Type "english" or "2"\n\n━━━━━━━━━━━━━━━━━━━━━━\n\nPor favor, seleccioná tu idioma.\nPlease select your language.`,
      expectingInput: true
    };
  }
  
  // 🆕 WELCOME BACK: Detectar usuarios recurrentes
  if (session.userName && session.transcript && session.transcript.length > 2) {
    const lastDevice = session.detectedEntities?.device;
    
    const welcomeMsg = session.userLocale === 'en-US'
      ? (lastDevice 
          ? `Welcome back ${session.userName}! 👋 Last time we talked about your ${lastDevice}.\n\nDo you need help with that again or is it something new?`
          : `Welcome back ${session.userName}! 👋\n\nHow can I help you today?`)
      : (lastDevice 
          ? `¡Hola de nuevo ${session.userName}! 👋 La última vez hablamos de tu ${lastDevice}.\n\n¿Necesitás ayuda con eso otra vez o es algo nuevo?`
          : `¡Hola de nuevo ${session.userName}! 👋\n\n¿En qué te ayudo hoy?`);
    
    session.conversationState = 'has_name';
    session.returningUser = true;
    
    return {
      reply: welcomeMsg,
      expectingInput: true
    };
  }
  
  if (analysis.intent === 'providing_name') {
    session.userName = capitalizeFirst(analysis.entities.name);
    session.conversationState = 'has_name';
    session.stateLoopCount = 0; // 🆕 Reset loop counter
    
    console.log('[GREETING] ✅ Nombre guardado:', session.userName);
    console.log('[GREETING] Estado cambiado a:', session.conversationState);
    
    const responsesES = [
      `¡Perfecto, ${session.userName}! 🎯 Contame, ¿qué problema técnico tenés o qué necesitás hacer?`,
      `Genial, ${session.userName}! 🛠️ ¿En qué puedo ayudarte hoy?`,
      `Encantado de conocerte, ${session.userName}! 👨‍💻 Decime qué te trae por acá.`
    ];
    
    const responsesEN = [
      `Perfect, ${session.userName}! 🎯 Tell me, what technical problem do you have or what do you need to do?`,
      `Great, ${session.userName}! 🛠️ How can I help you today?`,
      `Nice to meet you, ${session.userName}! 👨‍💻 Tell me what brings you here.`
    ];
    
    const responses = session.userLocale === 'en-US' ? responsesEN : responsesES;
    
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
    
    const askNameMsg = session.userLocale === 'en-US'
      ? `I understand. Before helping you, what's your name? (So I can personalize the assistance)`
      : `Entiendo. Antes de ayudarte, ¿cómo te llamás? (Así personalizo la asistencia)`;
    
    return {
      reply: askNameMsg,
      expectingInput: true
    };
  } else {
    // No entendió, reformular pregunta
    const clarifyMsg = session.userLocale === 'en-US'
      ? `Sorry, I didn't catch that. To start, could you tell me your name?`
      : `Perdón, no capté bien. Para empezar, ¿me decís tu nombre?`;
    
    return {
      reply: clarifyMsg,
      expectingInput: true
    };
  }
}

/**
 * Estado: Ya tenemos nombre, esperando problema
 */
function handleHasNameState(analysis, session, userMessage) {
  // 🆕 ESCALAMIENTO MANUAL: Detectar solicitud de técnico
  if (/quiero\s+(hablar|pasar)\s+con\s+(un\s+)?t[eé]cnico|necesito\s+un\s+t[eé]cnico|hablar\s+con\s+persona|atenci[oó]n\s+humana/i.test(userMessage)) {
    session.conversationState = 'escalate';
    return {
      reply: `Entiendo ${session.userName}, te voy a conectar con un técnico.\n\n¿Podrías contarme brevemente cuál es el problema para pasarle la información?`,
      expectingInput: true
    };
  }
  
  session.problemDescription += ' ' + userMessage;
  session.conversationState = 'understanding_problem';
  session.stateLoopCount = 0; // 🆕 Reset loop counter
  
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
    } else if (device === 'Servidor') {
      reply += `¿No podés acceder a las carpetas compartidas, no te conectás al servidor, o da algún error específico? ¿Desde cuándo está pasando?`;
    } else {
      reply += `Contame con más detalle qué pasa exactamente.`;
    }
    
  } else if (device && action) {
    // Quiere hacer algo (instalar, configurar, etc)
    session.detectedEntities.device = device;
    session.detectedEntities.action = action;
    
    // Respuesta especial para software
    if (device.startsWith('Software')) {
      const softwareName = device.split('-')[1] || 'el programa';
      reply = `Perfecto ${session.userName}, te voy a ayudar a ${action} ${softwareName}. `;
      reply += `Voy a explicarte paso a paso con mucha calma, ¿dale?`;
    } else {
      reply = `Perfecto ${session.userName}, te voy a guiar para ${action} tu ${device.toLowerCase()}. `;
      reply += `Primero, ¿ya tenés el dispositivo físicamente conectado?`;
    }
    
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
async function handleUnderstandingProblemState(analysis, session, userMessage) {
  // 🆕 PREVENCIÓN DE LOOPS: Detectar si estamos atascados
  session.stateLoopCount = (session.stateLoopCount || 0) + 1;
  
  if (session.stateLoopCount >= 3) {
    console.log('[LOOP DETECTED] Usuario atascado en understanding_problem, escalando...');
    session.conversationState = 'escalate';
    return {
      reply: `${session.userName}, veo que te cuesta explicar el problema. No hay problema, te conecto con un técnico que te va a ayudar mejor.\n\n¿Querés que genere un ticket para que te contacten?`,
      expectingInput: true
    };
  }
  
  // 🆕 ESCALAMIENTO MANUAL
  if (/quiero\s+(hablar|pasar)\s+con\s+(un\s+)?t[eé]cnico|necesito\s+un\s+t[eé]cnico/i.test(userMessage)) {
    session.conversationState = 'escalate';
    return {
      reply: `Perfecto ${session.userName}, voy a conectarte con un técnico. ¿Querés que genere un ticket?`,
      expectingInput: true
    };
  }
  
  session.problemDescription += ' ' + userMessage;
  
  // Actualizar entidades si se detectaron nuevas
  if (analysis.entities.device && !session.detectedEntities.device) {
    session.detectedEntities.device = analysis.entities.device;
  }
  if (analysis.entities.action && !session.detectedEntities.action) {
    session.detectedEntities.action = analysis.entities.action;
  }
  
  const { device, action } = session.detectedEntities;
  const hasEnoughContext = session.problemDescription.length > 80 || 
                            (device && action) || 
                            session.transcript.length >= 4;
  
  // Si ya tenemos suficiente info o muchos mensajes, pasar a resolver
  if (hasEnoughContext && (device || action)) {
    session.conversationState = 'solving';
    
    let reply = `Dale, ${session.userName}. Vamos a resolverlo paso a paso. `;
    
    // 🎬 DISPOSITIVOS STREAMING: Usar OpenAI desde el primer paso
    const streamingDevices = [
      'Fire-TV-Stick',
      'Xiaomi-Mi-TV-Stick', 
      'Roku-Streaming-Stick',
      'Apple-TV',
      'Nvidia-Shield-TV',
      'Google-TV'
    ];
    
    if (streamingDevices.includes(device)) {
      console.log('[Understanding] 🎬 Dispositivo streaming detectado, generando paso 1 con OpenAI');
      const firstStep = await generateStepsWithOpenAI(device, session.problemDescription, session, 1);
      
      if (firstStep) {
        reply += `\n\n${firstStep}`;
      } else {
        // Fallback si OpenAI falla
        reply += `\n\nVoy a ayudarte con tu ${device}. ¿Qué problema específico tenés?`;
      }
      
      session.stepProgress.current = 1;
      session.stepProgress.total = 8;  // Estimado para dispositivos streaming
      
      return { reply, expectingInput: true };
    }
    
    // Generar primer paso inteligente según dispositivo (para dispositivos no-streaming)
    if (device === 'Software-AnyDesk' && (action === 'descargar' || action === 'instalar')) {
      reply += `\n\n📥 **Paso 1 - Abrir el navegador:**\n\n`;
      reply += `Primero vamos a abrir el navegador de internet. `;
      reply += `Buscá en tu escritorio el ícono que parece una **rueda de colores** (Google Chrome) `;
      reply += `o una **e azul** (Edge).\n\n`;
      reply += `Hacé **doble click** sobre ese ícono.\n\n`;
      reply += `¿Pudiste abrir el navegador? ¿Qué navegador abriste?`;
    } else if (device === 'PC' && action === 'no funciona') {
      reply += `\n\n🔍 **Paso 1:** Verificá que el cable de corriente esté bien conectado tanto a la PC como al enchufe.\n\n¿Lo verificaste? Contame qué ves.`;
    } else if (device === 'Impresora') {
      reply += `\n\n🔍 **Paso 1:** Fijate si la impresora tiene alguna luz encendida o parpadeante. ¿Qué luces ves?`;
    } else if (device === 'Red/Internet') {
      reply += `\n\n🔍 **Paso 1:** Mirá el router, ¿qué luces tiene encendidas? (verde, roja, naranja, parpadeando, etc)`;
    } else if (device === 'Servidor') {
      reply += `\n\n🔍 **Paso 1 - Verificar conectividad básica:**\n\nPrimero vamos a verificar si tu PC puede comunicarse con el servidor.\n\n**Abrí el Símbolo del sistema:**\n- Presioná tecla Windows + R\n- Escribí: \`cmd\` y Enter\n\n**Hacé un PING al servidor:**\n- Escribí: \`ping [dirección-del-servidor]\`\n- (Reemplazá con la IP o nombre del servidor)\n\n¿Qué resultado te da? ¿Responde o da "tiempo de espera agotado"?`;
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
async function handleSolvingState(analysis, session, userMessage) {
  const step = session.stepProgress.current || 1;
  const device = session.detectedEntities.device;
  const t = userMessage.toLowerCase();
  
  // 🆕 ESCALAMIENTO MANUAL
  if (/quiero\s+(hablar|pasar)\s+con\s+(un\s+)?t[eé]cnico|ya\s+prob[eé]\s+todo|no\s+puedo\s+m[aá]s/i.test(userMessage)) {
    session.conversationState = 'escalate';
    return {
      reply: `Entiendo ${session.userName}, mejor que te ayude un técnico directamente. ¿Querés que genere un ticket?`,
      expectingInput: true
    };
  }
  
  // 🆕 LÍMITE DE REINTENTOS: Si el mismo paso falla muchas veces
  session.stepRetries = session.stepRetries || {};
  session.stepRetries[step] = (session.stepRetries[step] || 0);
  
  // Primero verificar respuestas NEGATIVAS (no funcionó)
  const isNegative = /^no[,\s]|sigue (igual|sin|fallando)|no\s+(funcion[oó]|anda|sirve|responde)|tiempo\s+de\s+espera|error|falla|da\s+error/i.test(userMessage);
  
  // Detectar RESOLUCIÓN TOTAL (problema completamente solucionado)
  const isFullyResolved = /(ya\s+)?funcion[oó]|anduvo|se\s+resolvi[oó]|ya\s+est[aá]\s+(todo|resuelto|listo|bien)|problema\s+resuelto|todo\s+bien|ya\s+funciona/i.test(userMessage);
  
  // Detectar CONFIRMACIÓN DE PASO (simplemente confirma que hizo el paso)
  // Ahora reconoce: "sí", "listo", "ya lo hice", "lo puse", "lo conecté", "conectado", etc.
  const isStepConfirmation = /^s[ií][,\s]|^listo|^dale|^ok\b|^perfecto\b|^ya\b|pude|lo\s+(hice|conecté|puse|instalé|descargué|abr[ií]|configur[eé])|ya\s+lo\s+(hice|conecté|puse|instalé|descargué|abr[ií]|configur[eé])|(conectado|instalado|descargado|abierto|configurado)\s+(en|el|al)/i.test(userMessage);
  
  if (isFullyResolved && !isNegative) {
    // FUNCIONÓ - Problema completamente resuelto
    session.conversationState = 'resolved';
    return {
      reply: `¡Excelente ${session.userName}! Me alegra que lo hayamos resuelto. 🎉\n\n¿Necesitás ayuda con algo más?`,
      expectingInput: true
    };
  } else if (isStepConfirmation && !isNegative && !isFullyResolved) {
    // PASO CONFIRMADO - Continuar con siguiente paso
    session.stepProgress.current = step + 1;
    
    // 🎬 SOPORTE PARA DISPOSITIVOS STREAMING CON OPENAI
    let nextStep = generateNextStep(device, step + 1, session);
    
    // Si generateNextStep retorna null, significa que es un dispositivo streaming
    if (nextStep === null) {
      console.log('[Solving] 🎬 Generando paso con OpenAI para dispositivo streaming');
      nextStep = await generateStepsWithOpenAI(device, session.problemDescription, session, step + 1);
    }
    
    if (nextStep) {
      return { reply: nextStep, expectingInput: true };
    } else {
      // Ya no hay más pasos, consultar si funcionó
      return {
        reply: `Perfecto ${session.userName}. Ya completamos todos los pasos disponibles.\n\n¿Funcionó? ¿Tu ${device} ya está operativo?`,
        expectingInput: true
      };
    }
  } else if (isNegative || /nada|ning[uú]n|tampoco/i.test(t)) {
    // NO FUNCIONÓ - Incrementar contador de reintentos
    session.stepRetries[step]++;
    
    // 🆕 Si el mismo paso falló 2 veces, sugerir escalamiento
    if (session.stepRetries[step] >= 2) {
      session.conversationState = 'escalate';
      return {
        reply: `${session.userName}, veo que este paso no está funcionando. Mejor que te ayude un técnico directamente.\n\n¿Querés que genere un ticket para que te contacten?`,
        expectingInput: true
      };
    }
    
    // Pasar al siguiente paso
    session.stepProgress.current = step + 1;
    
    // 🎬 SOPORTE PARA DISPOSITIVOS STREAMING CON OPENAI
    let nextStep = generateNextStep(device, step + 1, session);
    
    // Si generateNextStep retorna null, significa que es un dispositivo streaming
    if (nextStep === null) {
      console.log('[Solving] 🎬 Generando paso con OpenAI para dispositivo streaming');
      nextStep = await generateStepsWithOpenAI(device, session.problemDescription, session, step + 1);
    }
    
    if (nextStep) {
      return { reply: nextStep, expectingInput: true };
    } else {
      // Ya no hay más pasos básicos, escalar
      session.conversationState = 'escalate';
      return {
        reply: `${session.userName}, ya probamos todos los pasos disponibles. Necesitás revisión técnica.\n\n¿Querés que genere un ticket de soporte para que un técnico te contacte lo antes posible?`,
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
 * Genera pasos dinámicos usando OpenAI para dispositivos streaming
 * Esto permite dar soporte a dispositivos sin necesidad de hardcodear procedimientos
 */
async function generateStepsWithOpenAI(device, problemDescription, session, stepNumber = 1) {
  // Cache de respuestas para reducir costos
  const cacheKey = `${device}_${problemDescription}_${stepNumber}`.toLowerCase().replace(/\s+/g, '_');
  
  if (session.openaiCache && session.openaiCache[cacheKey]) {
    console.log('[OpenAI] ✅ Usando respuesta cacheada');
    return session.openaiCache[cacheKey];
  }
  
  try {
    const openai = session.openaiClient;
    if (!openai) {
      console.error('[OpenAI] ❌ Cliente no disponible');
      return null;
    }
    
    // Construir historial de pasos previos
    let previousStepsContext = '';
    if (session.openaiSteps && session.openaiSteps.length > 0) {
      previousStepsContext = '\n\n**Pasos ya realizados:**\n' + 
        session.openaiSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    }
    
    const prompt = `Eres un técnico de soporte técnico experto ayudando a un usuario con su ${device}.

**Problema del usuario:** ${problemDescription}
**Usuario:** ${session.userName}
**Paso actual:** ${stepNumber}${previousStepsContext}

**Tu tarea:**
Genera el SIGUIENTE PASO ÚNICO de manera clara, empática y detallada. Usa emojis para hacerlo visual.

**Formato requerido:**
1. Título del paso con emoji (ejemplo: 🔌 **Paso ${stepNumber} - Conectar HDMI:**)
2. Instrucciones paso a paso numeradas
3. Pregunta de confirmación al final (ejemplo: ¿Pudiste conectar el cable?)

**Reglas:**
- Un solo paso a la vez
- Lenguaje simple y empático
- Si hay advertencias importantes, usa ⚠️
- Máximo 150 palabras
- Termina SIEMPRE con una pregunta de confirmación

**NO incluyas:**
- Múltiples pasos en uno
- Opciones alternativas
- Pasos previos o siguientes`;

    console.log('[OpenAI] 🤖 Generando paso', stepNumber, 'para', device);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres un técnico de soporte paciente y claro.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 400
    });
    
    const generatedStep = completion.choices[0].message.content.trim();
    
    // Guardar en cache
    if (!session.openaiCache) session.openaiCache = {};
    session.openaiCache[cacheKey] = generatedStep;
    
    // Guardar paso en historial
    if (!session.openaiSteps) session.openaiSteps = [];
    session.openaiSteps.push(generatedStep);
    
    console.log('[OpenAI] ✅ Paso generado:', generatedStep.substring(0, 100) + '...');
    
    return generatedStep;
    
  } catch (error) {
    console.error('[OpenAI] ❌ Error generando paso:', error.message);
    return null;
  }
}

/**
 * Genera el siguiente paso según dispositivo y número de paso
 */
function generateNextStep(device, stepNumber, session) {
  // 🎬 DISPOSITIVOS STREAMING: Delegar a OpenAI
  const streamingDevices = [
    'Fire-TV-Stick',
    'Xiaomi-Mi-TV-Stick', 
    'Roku-Streaming-Stick',
    'Apple-TV',
    'Nvidia-Shield-TV',
    'Google-TV'
  ];
  
  if (streamingDevices.includes(device)) {
    console.log('[Steps] 🎬 Dispositivo streaming detectado:', device, '- usando OpenAI');
    return null; // Indica que debe usar OpenAI
  }
  
  const steps = {
    'Software-AnyDesk': [
      '🌐 **Paso 2 - Ir a la página de AnyDesk:**\n\nAhora con mucha calma:\n\n1. Mirá arriba del todo en el navegador, donde dice la dirección\n2. Hacé **click** ahí donde aparece la dirección\n3. Escribí con cuidado: **anydesk.com/es**\n4. Presioná la tecla **Enter** (la grande a la derecha)\n\n⏳ Esperá unos segundos que cargue la página...\n\n¿Se cargó la página de AnyDesk? ¿Ves un botón verde que dice "Descargar"?',
      '⬇️ **Paso 3 - Descargar AnyDesk:**\n\n¡Perfecto! Ahora vamos a descargar:\n\n1. Mirá en el centro de la página\n2. Vas a ver un botón **VERDE** grande que dice "Descargar ahora" o "Download"\n3. Hacé **UN solo click** en ese botón verde\n\n📂 La descarga va a empezar. Abajo del navegador (en la esquina) vas a ver que se está descargando un archivo.\n\n⏳ Esperá que termine (puede tardar 1 o 2 minutos)\n\n¿Terminó de descargar? ¿Ves el archivo abajo en el navegador?',
      '📂 **Paso 4 - Abrir el archivo descargado:**\n\n¡Ya casi estamos!\n\n1. Mirá **abajo** del navegador (en la esquina)\n2. Vas a ver el archivo que se descargó (dice "AnyDesk.exe")\n3. Hacé **click** sobre ese archivo\n\n⚠️ Puede aparecer una ventana que dice "¿Desea permitir que esta aplicación haga cambios?"\n   - Si aparece, hacé click en **"Sí"**\n\n¿Se abrió una ventana de AnyDesk?',
      '⚙️ **Paso 5 - Instalación rápida:**\n\nAhora la ventana de AnyDesk te va a mostrar opciones.\n\n**IMPORTANTE:** No hace falta instalar nada, AnyDesk ya funciona así como está.\n\nPero si querés instalarlo para usarlo siempre:\n\n1. En la ventana de AnyDesk, buscá un botón que dice **"Instalar"** o **"Install"**\n2. Hacé click ahí\n3. Dejá todo como está y hacé click en **"Aceptar"**\n\n✅ Listo, ya tenés AnyDesk funcionando en tu computadora.\n\nAhora vas a ver un **número grande** (son 9 números). Ese número es tu "dirección" para que alguien se conecte a tu PC.\n\n¿Ves ese número? ¿Cuál es?',
      '🎉 **Paso 6 - Dar permiso de conexión:**\n\nCuando alguien quiera ayudarte:\n\n1. Vos le das tu número de 9 dígitos\n2. Esa persona va a pedir conectarse\n3. Te va a aparecer una ventanita preguntando si querés aceptar\n4. Hacé click en **"Aceptar"**\n\n✅ ¡Y listo! Ya pueden ayudarte desde lejos.\n\n💡 **Consejo:** No le des tu número a personas que no conozcas.\n\n¿Pudiste ver todo esto? ¿Tenés alguna duda?'
    ],
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
    'Servidor': [
      '🔍 **Paso 2 - Verificar servicios de red:**\n\n**Verificar servicio "Servidor" en Windows:**\n- Presioná Windows + R\n- Escribí: \`services.msc\` y Enter\n- Buscá "Servidor" (Server)\n- Verificá que esté "En ejecución" y "Automático"\n\nSi está detenido:\n- Click derecho → Iniciar\n- Click derecho → Propiedades → Tipo de inicio: Automático\n\n¿El servicio está activo ahora?',
      '🔍 **Paso 3 - Verificar acceso a carpetas compartidas:**\n\n**Intentá acceder desde el Explorador:**\n- Abrí el Explorador de archivos\n- En la barra de direcciones escribí: \`\\\\[nombre-servidor]\\[carpeta-compartida]\`\n- O probá con la IP: \`\\\\192.168.x.x\\[carpeta]\`\n\n¿Te pide credenciales, da error, o accede correctamente?',
      '🔍 **Paso 4 - Revisar Visor de Eventos (diagnóstico avanzado):**\n\n**Ver errores del sistema:**\n- Presioná Windows + R\n- Escribí: \`eventvwr.msc\` y Enter\n- Andá a: Registros de Windows → Sistema\n- Buscá errores recientes (íconos rojos) relacionados con "Srv", "NTFS" o "Disk"\n\n¿Ves algún error específico? Si sí, anotá el código de error.',
      '🔍 **Paso 5 - Verificar permisos NTFS:**\n\n**Revisar permisos de la carpeta compartida:**\n- En el servidor, andá a la carpeta compartida\n- Click derecho → Propiedades → Pestaña "Seguridad"\n- Verificá que tu usuario o "Todos" tenga permisos de "Control total" o al menos "Modificar"\n\n**Si los permisos están mal, puedo guiarte para restaurarlos.**\n\n¿Los permisos se ven correctos?',
      '🔍 **Paso 6 - Diagnóstico de disco (avanzado):**\n\n**Verificar integridad del disco:**\n\n⚠️ IMPORTANTE: Estos comandos requieren permisos de administrador\n\n- Click derecho en Inicio → "Símbolo del sistema (administrador)"\n\n**Opción A - Verificar disco (sin modificar):**\n\`chkdsk C: /scan\`\n\n**Opción B - Reparar al reiniciar (recomendado):**\n\`chkdsk C: /f\`\n(Te pedirá reiniciar, aceptá con "S")\n\n**Opción C - Verificar archivos del sistema:**\n\`sfc /scannow\`\n(Tarda 10-15 minutos)\n\n¿Querés que te guíe con alguna de estas opciones?',
      '🔍 **Paso 7 - Restaurar permisos predeterminados:**\n\n**Si los permisos están corruptos, podemos restaurarlos:**\n\n- Abrí CMD como administrador\n- Para restaurar permisos de una carpeta:\n\n\`icacls "C:\\RutaCarpeta" /reset /T /C\`\n\n- Para dar control total al Administrador:\n\n\`icacls "C:\\RutaCarpeta" /grant Administradores:F /T\`\n\n⚠️ **Antes de ejecutar, confirmame la ruta exacta de la carpeta compartida.**\n\n¿Querés que te ayude a ejecutar esto?'
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
 * 🆕 Estado: Escalamiento a técnico
 */
function handleEscalateState(analysis, session, userMessage) {
  const t = userMessage.toLowerCase();
  
  // 🔐 PASO 1: Verificar consentimiento para compartir datos por WhatsApp
  if (!session.gdprConsentWhatsApp) {
    // Detectar aceptación
    if (/s[ií]|dale|ok|acepto|de acuerdo|agree/i.test(t)) {
      session.gdprConsentWhatsApp = true;
      session.gdprConsentWhatsAppDate = new Date().toISOString();
      console.log('[GDPR] ✅ Consentimiento WhatsApp otorgado');
      
      // Continuar al flujo de creación de ticket
      return {
        reply: `✅ **Gracias por tu consentimiento**\n\nAhora voy a generar tu ticket y preparar el resumen para enviarlo por WhatsApp.\n\nUn técnico de STI va a ver tu caso y te va a contactar pronto.\n\n⏳ Generando ticket...`,
        expectingInput: false,
        action: 'create_ticket' // Señal para que el servidor cree el ticket
      };
    }
    
    // Detectar rechazo
    if (/no|cancela|mejor no|dejalo/i.test(t)) {
      session.conversationState = 'has_name';
      return {
        reply: `Ok ${session.userName}, no hay problema. Sin tu consentimiento no puedo generar el ticket.\n\n¿Querés que intentemos otra cosa o te ayudo con algo diferente?`,
        expectingInput: true
      };
    }
    
    // Primera vez: mostrar aviso de privacidad
    return {
      reply: `📋 **Aviso de Privacidad - Escalamiento a Técnico**\n\n${session.userName}, antes de generar el ticket necesito que sepas:\n\n✅ Voy a enviar tu **nombre** y el **resumen de este problema** a un técnico humano de STI por WhatsApp\n✅ Los datos incluirán: dispositivo (${session.detectedEntities?.device || 'no especificado'}), problema, y pasos que intentamos\n✅ El técnico va a poder ver estos datos para ayudarte mejor\n✅ No voy a compartir tu número de teléfono ni datos bancarios\n\n**¿Estás de acuerdo en que comparta esta información por WhatsApp?**\n\nRespondé "sí" para continuar o "no" para cancelar`,
      expectingInput: true
    };
  }
  
  // PASO 2: Consentimiento ya otorgado - confirmar creación de ticket
  if (/s[ií]|dale|ok|por favor|claro/i.test(t)) {
    return {
      reply: `⏳ Generando ticket de soporte...\n\nUn momento por favor.`,
      expectingInput: false,
      action: 'create_ticket'
    };
  } else if (/no|cancela|mejor no|dejalo/i.test(t)) {
    session.conversationState = 'has_name';
    return {
      reply: `Ok ${session.userName}, no hay problema. ¿Querés que intentemos otra cosa o te ayudo con algo diferente?`,
      expectingInput: true
    };
  } else {
    // Respuesta ambigua
    return {
      reply: `${session.userName}, para confirmar: ¿Querés que genere el ticket de soporte? Respondé "sí" o "no".`,
      expectingInput: true
    };
  }
}

/**
 * Estado: Problema resuelto
 */
function handleResolvedState(analysis, session, userMessage) {
  if (/s[ií]|otro|m[aá]s/i.test(userMessage)) {
    // Quiere resolver otra cosa - 🆕 RESET COMPLETO
    session.conversationState = 'has_name';
    session.problemDescription = '';
    session.detectedEntities = { device: null, action: null, urgency: 'normal' };
    session.stepProgress = {};
    session.stateLoopCount = 0;
    session.stepRetries = {};
    session.returningUser = true;
    
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
