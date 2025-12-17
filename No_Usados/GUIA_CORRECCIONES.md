# 🔧 GUÍA DE CORRECCIONES - Refactor Modular

**Ejemplos concretos de código para hacer el refactor 100% compatible**

---

## 🎯 CORRECCIÓN 1: Renombrar STAGES → STATES

### ❌ Actual (conversationOrchestrator.js)
```javascript
const STAGES = {
  GREETING: 'greeting',                    // ❌ NO existe en server.js
  ASK_NAME: 'ask_name',                    // ❌ lowercase
  ASK_NEED: 'ask_need',                    // ❌ lowercase
  PROBLEM_IDENTIFICATION: 'problem_identification',  // ❌ Nombre diferente
  DEVICE_DISAMBIGUATION: 'device_disambiguation',    // ❌ Nombre diferente
  DIAGNOSTIC_GENERATION: 'diagnostic_generation',    // ❌ Nombre diferente
  STEP_EXECUTION: 'step_execution',                  // ❌ Nombre diferente
  ESCALATION: 'escalation',                         // ❌ lowercase
  FAREWELL: 'farewell'                              // ❌ Nombre diferente
};
```

### ✅ Corrección Necesaria
```javascript
// conversationOrchestrator.js - REEMPLAZAR COMPLETAMENTE
const STAGES = {
  // EXACTAMENTE IGUALES A server.js (línea 2442-2458)
  ASK_LANGUAGE: 'ASK_LANGUAGE',           // ✅ AGREGAR (para GDPR + idioma)
  ASK_NAME: 'ASK_NAME',                   // ✅ UPPERCASE
  ASK_NEED: 'ASK_NEED',                   // ✅ UPPERCASE
  CLASSIFY_NEED: 'CLASSIFY_NEED',         // ✅ AGREGAR
  ASK_DEVICE: 'ASK_DEVICE',               // ✅ RENOMBRAR desde DEVICE_DISAMBIGUATION
  ASK_PROBLEM: 'ASK_PROBLEM',             // ✅ RENOMBRAR desde PROBLEM_IDENTIFICATION
  DETECT_DEVICE: 'DETECT_DEVICE',         // ✅ AGREGAR
  ASK_HOWTO_DETAILS: 'ASK_HOWTO_DETAILS', // ✅ AGREGAR
  GENERATE_HOWTO: 'GENERATE_HOWTO',       // ✅ RENOMBRAR desde DIAGNOSTIC_GENERATION
  BASIC_TESTS: 'BASIC_TESTS',             // ✅ RENOMBRAR desde STEP_EXECUTION
  ADVANCED_TESTS: 'ADVANCED_TESTS',       // ✅ AGREGAR
  ESCALATE: 'ESCALATE',                   // ✅ UPPERCASE
  CREATE_TICKET: 'CREATE_TICKET',         // ✅ AGREGAR
  TICKET_SENT: 'TICKET_SENT',             // ✅ AGREGAR
  ENDED: 'ENDED'                          // ✅ RENOMBRAR desde FAREWELL
};
```

### 📝 Cambios en STATE_TRANSITIONS
```javascript
// conversationOrchestrator.js - Actualizar máquina de estados
const STATE_TRANSITIONS = {
  [STAGES.ASK_LANGUAGE]: {
    next: STAGES.ASK_NAME,
    validInputs: ['button']  // BTN_LANG_ES_AR, BTN_LANG_EN, etc.
  },
  [STAGES.ASK_NAME]: {
    next: STAGES.ASK_NEED,
    validInputs: ['text', 'button']  // Texto libre o BTN_NO_NAME
  },
  [STAGES.ASK_NEED]: {
    next: STAGES.ASK_PROBLEM,  // Si BTN_PROBLEMA
    validInputs: ['button']     // BTN_PROBLEMA, BTN_CONSULTA
  },
  [STAGES.ASK_PROBLEM]: {
    next: STAGES.ASK_DEVICE,
    validInputs: ['text', 'image']
  },
  [STAGES.ASK_DEVICE]: {
    next: STAGES.GENERATE_HOWTO,
    validInputs: ['button']  // BTN_DESKTOP, BTN_NOTEBOOK, etc.
  },
  [STAGES.GENERATE_HOWTO]: {
    next: STAGES.BASIC_TESTS,
    validInputs: ['generated']  // Automático después de generar
  },
  [STAGES.BASIC_TESTS]: {
    next: {
      'solved': STAGES.ENDED,
      'persist': STAGES.ADVANCED_TESTS,
      'help': STAGES.BASIC_TESTS,  // Misma stage, dar ayuda
      'escalate': STAGES.ESCALATE
    },
    validInputs: ['button']  // BTN_SOLVED, BTN_PERSIST, BTN_HELP_N
  },
  [STAGES.ADVANCED_TESTS]: {
    next: {
      'solved': STAGES.ENDED,
      'persist': STAGES.ESCALATE,
      'help': STAGES.ADVANCED_TESTS
    },
    validInputs: ['button']
  },
  [STAGES.ESCALATE]: {
    next: STAGES.CREATE_TICKET,
    validInputs: ['button']  // BTN_TECH
  },
  [STAGES.CREATE_TICKET]: {
    next: STAGES.TICKET_SENT,
    validInputs: ['automatic']
  },
  [STAGES.TICKET_SENT]: {
    next: STAGES.ENDED,
    validInputs: ['any']
  },
  [STAGES.ENDED]: {
    next: null,
    validInputs: []
  }
};
```

---

## 🎯 CORRECCIÓN 2: Completar Formato JSON Response

### ❌ Actual (chatAdapter.js, línea 90-110)
```javascript
function convertToLegacyFormat(orchestratorResponse, session, sessionId) {
  return {
    text: orchestratorResponse.text,      // ❌ Campo incorrecto (debe ser "reply")
    stage: session.stage,                 // ❌ Puede ser lowercase
    options: orchestratorResponse.options // ❌ Estructura puede ser diferente
    // ❌ FALTAN: ok, sid, ui, allowWhatsapp, endConversation, help, steps, imageAnalysis
  };
}
```

### ✅ Corrección Necesaria
```javascript
// chatAdapter.js - REEMPLAZAR función convertToLegacyFormat
function convertToLegacyFormat(orchestratorResponse, session, sessionId) {
  // Estructura EXACTA que server.js retorna (línea 6040-6080)
  const response = {
    ok: true,                             // ✅ AGREGAR
    reply: orchestratorResponse.text,     // ✅ RENOMBRAR desde "text"
    sid: sessionId,                       // ✅ AGREGAR
    stage: session.stage,                 // ✅ Ya correcto (uppercase)
    options: [],                          // ✅ Construir abajo
  };

  // ✅ Construir options (array de strings)
  if (orchestratorResponse.options && Array.isArray(orchestratorResponse.options)) {
    response.options = orchestratorResponse.options.map(opt => {
      // Si es objeto con label, extraer solo el label
      if (typeof opt === 'object' && opt.label) {
        return opt.label;
      }
      // Si es string, dejarlo tal cual
      return String(opt);
    });
  }

  // ✅ AGREGAR: ui.buttons (estructura completa)
  if (orchestratorResponse.buttons && orchestratorResponse.buttons.length > 0) {
    response.ui = {
      buttons: orchestratorResponse.buttons.map(btn => ({
        type: 'button',
        label: btn.label || btn.text,
        value: btn.token || btn.value,
        style: btn.style || 'default'
      })),
      states: CHAT?.ui?.states || {}  // Copiar desde config global
    };
  }

  // ✅ AGREGAR: allowWhatsapp
  if (session.waEligible === true) {
    response.allowWhatsapp = true;
  }

  // ✅ AGREGAR: endConversation
  if (session.stage === STAGES.ENDED || session.stage === STAGES.TICKET_SENT) {
    response.endConversation = true;
  }

  // ✅ AGREGAR: help (si existe)
  if (orchestratorResponse.help) {
    response.help = {
      stepIndex: orchestratorResponse.help.stepIndex,
      stepText: orchestratorResponse.help.stepText,
      detail: orchestratorResponse.help.detail
    };
  }

  // ✅ AGREGAR: steps (pasos del diagnóstico)
  if (session.tests) {
    const isAdvanced = session.stage === STAGES.ADVANCED_TESTS;
    response.steps = isAdvanced 
      ? (session.tests.advanced || [])
      : (session.tests.basic || []);
  }

  // ✅ AGREGAR: imageAnalysis (si hubo Vision API)
  if (session.imageAnalysis) {
    response.imageAnalysis = session.imageAnalysis;
  }

  return response;
}
```

---

## 🎯 CORRECCIÓN 3: Procesar Tokens de Botones

### ❌ Actual (chatAdapter.js, línea 60-75)
```javascript
export async function handleChatMessage(requestBody, sessionId, metadata = {}) {
  const {
    text: userText,
    imageUrls = [],
    buttonToken = null,  // ✅ Recibe token
    locale = 'es'
  } = requestBody;

  const userInput = {
    text: userText,      // ❌ NO CONVIERTE buttonToken a texto
    timestamp: new Date().toISOString()
  };

  // ❌ Envía token crudo al orquestador
  const orchestratorResponse = await conversationOrchestrator.processMessage(
    sessionId,
    userInput,
    enrichedMetadata
  );
}
```

### ✅ Corrección Necesaria
```javascript
// chatAdapter.js - AGREGAR al inicio del archivo
const BUTTON_TOKEN_MAP = {
  // Idiomas
  'BTN_LANG_ES_AR': 'Español (Argentina)',
  'BTN_LANG_ES_ES': 'Español (Latinoamérica)',
  'BTN_LANG_EN': 'English',
  'BTN_NO_NAME': 'Prefiero no decirlo',
  
  // Tipo de necesidad
  'BTN_PROBLEMA': 'tengo un problema',
  'BTN_CONSULTA': 'tengo una consulta',
  
  // Dispositivos
  'BTN_DESKTOP': 'desktop',
  'BTN_ALLINONE': 'all in one',
  'BTN_NOTEBOOK': 'notebook',
  
  // Feedback
  'BTN_SOLVED': 'lo pude solucionar',
  'BTN_PERSIST': 'el problema persiste',
  'BTN_ADVANCED_TESTS': 'pruebas avanzadas',
  'BTN_MORE_TESTS': 'más pruebas',
  'BTN_TECH': 'hablar con técnico'
};

// ✅ NUEVA FUNCIÓN: Convertir token a texto
function processButtonToken(buttonToken) {
  // Caso 1: Token está en el mapa
  if (BUTTON_TOKEN_MAP[buttonToken]) {
    return BUTTON_TOKEN_MAP[buttonToken];
  }
  
  // Caso 2: BTN_HELP_N (dinámico)
  if (buttonToken.startsWith('BTN_HELP_')) {
    const stepNumber = buttonToken.split('_').pop();
    return `ayuda paso ${stepNumber}`;
  }
  
  // Caso 3: Fallback - usar el token tal cual
  console.warn(`[ChatAdapter] Token desconocido: ${buttonToken}`);
  return buttonToken;
}

// ✅ MODIFICAR handleChatMessage
export async function handleChatMessage(requestBody, sessionId, metadata = {}) {
  const {
    text: userText,
    imageUrls = [],
    buttonToken = null,
    locale = 'es',
    action = null
  } = requestBody;

  // ✅ CONVERTIR token a texto si es un botón
  let processedText = userText;
  let isButton = false;
  
  if (action === 'button' && buttonToken) {
    processedText = processButtonToken(buttonToken);
    isButton = true;
    console.log(`[ChatAdapter] Converted button: ${buttonToken} → "${processedText}"`);
  }

  // ✅ Usar texto procesado
  const userInput = {
    text: processedText,  // ✅ Ahora contiene texto legible
    timestamp: new Date().toISOString()
  };

  const enrichedMetadata = {
    ...metadata,
    imageUrls,
    buttonToken,         // Mantener token original para logging
    isButton,            // Flag para saber si vino de botón
    locale,
    requestId: generateRequestId()
  };

  // Procesar con orquestador (ahora recibe texto correcto)
  const orchestratorResponse = await conversationOrchestrator.processMessage(
    sessionId,
    userInput,
    enrichedMetadata
  );
  
  // ... resto del código
}
```

---

## 🎯 CORRECCIÓN 4: Agregar Handler ASK_LANGUAGE

### ✅ Nuevo Handler (conversationOrchestrator.js)
```javascript
// conversationOrchestrator.js - AGREGAR nuevo handler

/**
 * Handler para ASK_LANGUAGE: GDPR + Selección de idioma
 */
async handle_ask_language(session, userInput, analysis, metadata) {
  const text = userInput.text || '';
  
  // Detectar botón de idioma
  const langRegex = /español.*argentina|español.*latinoamérica|english/i;
  
  if (langRegex.test(text) || metadata.isButton) {
    // Determinar idioma seleccionado
    let selectedLocale = 'es-AR';
    if (/english/i.test(text)) {
      selectedLocale = 'en';
    } else if (/latinoamérica|419/i.test(text)) {
      selectedLocale = 'es-419';
    }
    
    // Actualizar sesión
    session.userLocale = selectedLocale;
    session.gdprAccepted = true;
    session.stage = STAGES.ASK_NAME;
    
    // Generar respuesta
    const isEn = selectedLocale === 'en';
    const greeting = isEn
      ? "Great! 👋 To personalize your experience, could you tell me your name?"
      : "¡Genial! 👋 Para personalizar tu experiencia, ¿me decís tu nombre?";
    
    return {
      text: greeting,
      options: [
        { type: 'hint', label: isEn ? 'Or if you prefer...' : 'O si lo preferís...' }
      ],
      buttons: [
        { type: 'button', label: isEn ? "I'd rather not say 🙅" : "Prefiero no decirlo 🙅", token: 'BTN_NO_NAME' }
      ],
      nextStage: STAGES.ASK_NAME
    };
  }
  
  // Si no seleccionó idioma, pedir que elija
  return {
    text: "Por favor, seleccioná tu idioma / Please select your language:",
    buttons: [
      { type: 'button', label: '🇦🇷 Español (Argentina)', token: 'BTN_LANG_ES_AR' },
      { type: 'button', label: '🌎 Español (Latinoamérica)', token: 'BTN_LANG_ES_ES' },
      { type: 'button', label: '🇬🇧 English', token: 'BTN_LANG_EN' }
    ],
    nextStage: STAGES.ASK_LANGUAGE
  };
}
```

---

## 🎯 CORRECCIÓN 5: Agregar Handler ADVANCED_TESTS

### ✅ Nuevo Handler (conversationOrchestrator.js)
```javascript
// conversationOrchestrator.js - AGREGAR nuevo handler

/**
 * Handler para ADVANCED_TESTS: Pruebas avanzadas después de básicas
 */
async handle_advanced_tests(session, userInput, analysis, metadata) {
  const text = userInput.text || '';
  const locale = session.userLocale || 'es-AR';
  const isEn = locale === 'en';
  
  // Caso 1: Usuario dice que solucionó el problema
  if (/lo pude|solucion[eé]|resuel|solved|fixed/i.test(text)) {
    session.stage = STAGES.ENDED;
    
    const userName = session.userName ? ` ${session.userName}` : '';
    return {
      text: isEn
        ? `Excellent${userName}! 🙌 I'm glad you could solve it. If it fails again, you can reopen the chat.`
        : `¡Excelente${userName}! 🙌 Me alegra que lo hayas podido resolver. Si vuelve a fallar, podés reabrir el chat.`,
      options: [],
      buttons: [],
      nextStage: STAGES.ENDED
    };
  }
  
  // Caso 2: Problema persiste → Escalar
  if (/persist|no funcion|sigue|todav[ií]a no|still not working/i.test(text)) {
    session.stage = STAGES.ESCALATE;
    session.waEligible = true;
    
    return {
      text: isEn
        ? "I understand. Would you like me to connect you with a technician?"
        : "Entiendo. ¿Querés que te conecte con un técnico?",
      buttons: [
        { type: 'button', label: isEn ? '🧑‍💻 Connect with technician' : '🧑‍💻 Conectar con técnico', token: 'BTN_TECH' }
      ],
      nextStage: STAGES.ESCALATE
    };
  }
  
  // Caso 3: Pide ayuda con un paso específico (BTN_HELP_N)
  if (/ayuda paso (\d+)|help step (\d+)/i.test(text)) {
    const match = text.match(/paso (\d+)|step (\d+)/i);
    const stepIndex = parseInt(match[1] || match[2]);
    
    const steps = session.tests?.advanced || [];
    if (stepIndex > 0 && stepIndex <= steps.length) {
      const step = steps[stepIndex - 1];
      
      // Generar ayuda detallada con AI
      const helpDetail = await this.services.ai.generateStepHelp(
        step,
        session.device,
        session.problem,
        locale
      );
      
      return {
        text: helpDetail,
        help: {
          stepIndex,
          stepText: step,
          detail: helpDetail
        },
        buttons: [
          { type: 'button', label: isEn ? '👍 I solved it' : '👍 Ya lo solucioné', token: 'BTN_SOLVED' },
          { type: 'button', label: isEn ? '❌ Still not working' : '❌ Todavía no funciona', token: 'BTN_PERSIST' }
        ],
        nextStage: STAGES.ADVANCED_TESTS
      };
    }
  }
  
  // Caso 4: Mostrar pasos si no se entiende
  const steps = session.tests?.advanced || [];
  if (steps.length === 0) {
    // No hay pasos avanzados generados → Generar ahora
    const advancedSteps = await this.services.ai.generateAdvancedTests(
      session.problem,
      session.device,
      session.tests.basic,
      locale
    );
    
    session.tests.advanced = advancedSteps;
    await this.services.session.saveSession(session.id, session);
  }
  
  // Mostrar pasos avanzados
  const numbered = session.tests.advanced.map((s, i) => `${i + 1}. ${s}`);
  const intro = isEn
    ? "Let's try these more advanced tests:"
    : "Probemos con estas pruebas más avanzadas:";
  
  return {
    text: `${intro}\n\n${numbered.join('\n')}\n\n${isEn ? '🤔 How did it go?' : '🤔 ¿Cómo te fue?'}`,
    steps: session.tests.advanced,
    buttons: [
      { type: 'button', label: isEn ? '👍 I solved it' : '👍 Ya lo solucioné', token: 'BTN_SOLVED' },
      { type: 'button', label: isEn ? '❌ Still not working' : '❌ Todavía no funciona', token: 'BTN_PERSIST' },
      { type: 'button', label: isEn ? '🧑‍💻 Connect with technician' : '🧑‍💻 Conectar con técnico', token: 'BTN_TECH' }
    ],
    nextStage: STAGES.ADVANCED_TESTS
  };
}
```

---

## 🎯 CORRECCIÓN 6: Integrar Vision API

### ✅ Modificar Handler de Imágenes (conversationOrchestrator.js)
```javascript
// conversationOrchestrator.js - MODIFICAR processMessage

async processMessage(sessionId, userInput, metadata = {}) {
  try {
    let session = await this.services.session.getSession(sessionId);
    if (!session) {
      session = await this.services.session.createSession(sessionId, {
        stage: STAGES.ASK_LANGUAGE
      });
    }

    // ✅ AGREGAR: Procesar imágenes si existen
    if (metadata.imageUrls && metadata.imageUrls.length > 0) {
      console.log(`[Orchestrator] 🖼️ Processing ${metadata.imageUrls.length} image(s)`);
      
      try {
        // Analizar con Vision API
        const imageAnalysis = await this.services.ai.processImagesWithVision(
          metadata.imageUrls,
          session.userLocale || 'es-AR'
        );
        
        // Guardar análisis en sesión
        session.imageAnalysis = imageAnalysis;
        
        // Agregar análisis al texto del usuario
        if (imageAnalysis.summary) {
          userInput.text = userInput.text 
            ? `${userInput.text}\n\n[Imagen adjunta: ${imageAnalysis.summary}]`
            : `[Imagen adjunta: ${imageAnalysis.summary}]`;
        }
        
        console.log(`[Orchestrator] ✅ Vision analysis: ${imageAnalysis.summary?.substring(0, 50)}...`);
      } catch (visionError) {
        console.error('[Orchestrator] ❌ Vision API error:', visionError);
        // Continuar sin análisis de imagen
      }
    }

    // Análisis NLP del texto
    const analysis = await this.analyzeUserInput(userInput, session, metadata);

    // ... resto del código
  }
}
```

---

## 📊 RESUMEN DE CORRECCIONES

| # | Corrección | Archivos | Líneas | Prioridad |
|---|------------|----------|--------|-----------|
| 1 | Renombrar STAGES | `conversationOrchestrator.js` | ~50 | 🔴 CRÍTICA |
| 2 | Completar JSON response | `chatAdapter.js` | ~80 | 🔴 CRÍTICA |
| 3 | Procesar tokens botones | `chatAdapter.js` | ~60 | 🔴 CRÍTICA |
| 4 | Agregar ASK_LANGUAGE | `conversationOrchestrator.js` | ~50 | 🔴 CRÍTICA |
| 5 | Agregar ADVANCED_TESTS | `conversationOrchestrator.js` | ~100 | 🟠 ALTA |
| 6 | Integrar Vision API | `conversationOrchestrator.js` | ~30 | 🟡 MEDIA |

**Total estimado: ~370 líneas de código a modificar/agregar**

---

## ✅ TESTING DESPUÉS DE CORRECCIONES

### Test 1: Flujo Completo Básico
```bash
# Enviar request a /api/chat
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-001",
    "action": "button",
    "value": "BTN_LANG_ES_AR"
  }'

# Verificar response:
# ✅ Campo "ok": true
# ✅ Campo "stage": "ASK_NAME" (uppercase)
# ✅ Campo "sid": "test-001"
```

### Test 2: Verificar Botones
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-001",
    "text": "Juan",
    "action": "text"
  }'

# Verificar response:
# ✅ Campo "ui.buttons" existe
# ✅ Botones tienen structure: {type, label, value}
```

### Test 3: Verificar ADVANCED_TESTS
```bash
# Navegar hasta BASIC_TESTS, luego:
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-001",
    "action": "button",
    "value": "BTN_PERSIST"
  }'

# Verificar response:
# ✅ stage: "ADVANCED_TESTS"
# ✅ Campo "steps" con pasos avanzados
```

---

**Última actualización**: 5 Diciembre 2025  
**Aplicar estas correcciones antes de activar `USE_MODULAR_ARCHITECTURE=true`**
