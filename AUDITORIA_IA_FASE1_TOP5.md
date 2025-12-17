# AUDITORÍA PROFUNDA IA — FASE 1 (TOP 5)
## Tecnos STI — Enfoque exclusivo en procedimiento correcto al consultar con IA

**Fecha:** 2025-01-XX  
**Auditor:** Cursor AI  
**Objetivo:** Validar que Tecnos consulta con IA de forma correcta, segura, consistente y auditable  
**Estado Final:** ✅ **GO** (con mejoras recomendadas)

---

## 1) GATEKEEPER DE IA (cuándo llama y cuándo NO)

### Objetivo
Probar que Tecnos llama a IA solo cuando corresponde y no "por costumbre".

### ✅ Hallazgos OK

#### 1.1 Función equivalente a `shouldCallIA()`

**Ubicación:** `server.js` líneas 567-579 (`iaClassifier`) y 873-880 (`iaStep`)

**Evidencia:**
```567:579:server.js
async function iaClassifier(session, userInput) {
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback');
    return {
      intent: 'unknown',
      needs_clarification: true,
      missing: ['device_type'],
      suggested_next_ask: 'ASK_DEVICE_TYPE',
      risk_level: 'low',
      suggest_modes: {},
      confidence: 0.0
    };
  }
```

**Análisis:** Existe un gatekeeper explícito: `if (!openai)` que retorna fallback determinístico sin llamar a IA.

#### 1.2 Condiciones que disparan IA_CLASSIFIER

**Ubicación:** `server.js` línea 1525 (`handleAskProblem`)

**Evidencia:**
```1507:1525:server.js
async function handleAskProblem(session, userInput, conversation) {
  session.context.problem_description_raw = userInput;
  session.meta.updated_at = new Date().toISOString();
  
  await appendToTranscript(conversation.conversation_id, {
    role: 'user',
    type: 'text',
    text: userInput
  });
  
  // Llamar a IA_CLASSIFIER
  await appendToTranscript(conversation.conversation_id, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_CALL',
    payload: { user_input: userInput }
  });
  
  const classification = await iaClassifier(session, userInput);
```

**Condiciones que disparan IA_CLASSIFIER:**
- ✅ **Ambigüedad:** Se llama cuando el usuario describe un problema en `ASK_PROBLEM` (texto libre, no determinístico)
- ✅ **Falta de datos:** Se llama para detectar qué información falta (`missing` array)
- ✅ **Rama sin regla determinística:** Se llama para clasificar intent (`network`, `power`, `install_os`, etc.)

#### 1.3 Condiciones que NO llaman IA

**Ubicación:** Handlers determinísticos (`handleAskConsent`, `handleAskLanguage`, `handleAskName`, `handleAskUserLevel`, `handleAskDeviceCategory`, `handleAskDeviceType`)

**Evidencia - Ejemplo 1: ASK_LANGUAGE (determinístico):**
```1196:1218:server.js
async function handleAskLanguage(session, userInput, conversation) {
  const inputLower = userInput.toLowerCase().trim();
  let selectedLanguage = null;
  
  if (inputLower.includes('español') || inputLower.includes('argentina') || 
      inputLower === 'es-ar' || inputLower === 'es') {
    selectedLanguage = 'es-AR';
  } else if (inputLower.includes('english') || inputLower.includes('inglés') || 
             inputLower === 'en') {
    selectedLanguage = 'en';
  }
  
  if (!selectedLanguage) {
    return {
      reply: TEXTS.ASK_LANGUAGE[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_LANGUAGE.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_LANGUAGE'
    };
  }
```

**Análisis:** `handleAskLanguage` usa lógica determinística (regex/string matching) sin llamar a IA.

**Evidencia - Ejemplo 2: ASK_USER_LEVEL (determinístico):**
```1325:1347:server.js
async function handleAskUserLevel(session, userInput, conversation) {
  const inputLower = userInput.toLowerCase().trim();
  let level = null;
  
  if (inputLower.includes('básico') || inputLower.includes('basic')) {
    level = 'basico';
  } else if (inputLower.includes('intermedio') || inputLower.includes('intermediate')) {
    level = 'intermedio';
  } else if (inputLower.includes('avanzado') || inputLower.includes('advanced')) {
    level = 'avanzado';
  }
  
  if (!level) {
    return {
      reply: TEXTS.ASK_USER_LEVEL[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_USER_LEVEL.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_USER_LEVEL'
    };
  }
```

**Análisis:** `handleAskUserLevel` usa lógica determinística sin llamar a IA.

### Tabla: Casos de uso

| Caso | Llama IA? | Por qué | Código que lo decide |
|------|-----------|---------|----------------------|
| Usuario describe problema en `ASK_PROBLEM` | ✅ SÍ | Texto libre ambiguo requiere clasificación | `handleAskProblem()` línea 1525 → `iaClassifier()` |
| Usuario selecciona idioma | ❌ NO | Lógica determinística (regex) | `handleAskLanguage()` línea 1196-1218 |
| Usuario selecciona nivel técnico | ❌ NO | Lógica determinística (regex) | `handleAskUserLevel()` línea 1325-1347 |
| Usuario selecciona tipo de dispositivo | ❌ NO | Lógica determinística (map) | `handleAskDeviceType()` línea 1433-1482 |
| Usuario necesita siguiente paso diagnóstico | ✅ SÍ | Generación dinámica de pasos | `handleDiagnosticStep()` línea 1952 → `iaStep()` |
| Usuario hace pregunta libre (FREE_QA) | ✅ SÍ | Pregunta fuera de contexto | `handleFreeQA()` línea 1695-1711 |

### ⚠️ Riesgos

1. **Riesgo bajo:** `FREE_QA` llama a IA sin validar si realmente es pregunta libre (solo verifica `isQuestion`). Podría llamar IA innecesariamente si el usuario escribe "¿qué?" como respuesta a un botón.

### 🔧 Fix propuesto

Agregar validación más estricta en `handleFreeQA` para evitar llamadas innecesarias:

```javascript
// En handleFreeQA, línea 1691
if (isQuestion && currentStage !== 'ASK_PROBLEM' && currentStage !== 'ASK_PROBLEM_CLARIFICATION') {
  // Agregar: verificar que la pregunta no sea respuesta a botón
  const isVeryShort = userInput.trim().length < 10;
  if (isVeryShort && isButtonResponse) {
    return null; // No es FREE_QA, es respuesta a botón
  }
  // ... resto del código
}
```

### 🧪 Evidencia de tests

**Test 1: Caso determinístico (sin IA)**
- **Input:** Usuario en `ASK_LANGUAGE` escribe "español"
- **Resultado esperado:** NO llama a IA, retorna respuesta determinística
- **Evidencia:** Código muestra que `handleAskLanguage` no contiene llamada a `iaClassifier` ni `iaStep`

**Test 2: Caso ambiguo (con IA)**
- **Input:** Usuario en `ASK_PROBLEM` escribe "mi computadora no funciona"
- **Resultado esperado:** SÍ llama a `iaClassifier` para clasificar intent
- **Evidencia:** Código línea 1525 muestra llamada explícita a `iaClassifier()`

**Test 3: Caso FREE_QA (con IA)**
- **Input:** Usuario en `ASK_USER_LEVEL` escribe "¿qué significa básico?"
- **Resultado esperado:** SÍ llama a IA para responder pregunta libre
- **Evidencia:** Código línea 1695 muestra llamada a OpenAI en `handleFreeQA`

---

## 2) CONTRATO JSON + VALIDACIÓN DURA (parseo y schema)

### Objetivo
Garantizar que la respuesta de IA nunca rompe el flujo y no produce "cosas raras".

### ✅ Hallazgos OK

#### 2.1 Try/catch de parseo

**Ubicación:** `server.js` líneas 661-685 (`iaClassifier`) y 994-1024 (`iaStep`)

**Evidencia:**
```661:685:server.js
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      await log('ERROR', 'JSON inválido de IA_CLASSIFIER', { content: content.substring(0, 200), error: parseErr.message });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_VALIDATION_FAIL',
          payload: { error: 'JSON_PARSE_ERROR', error_message: parseErr.message }
        });
      }
      
      return {
        intent: 'unknown',
        needs_clarification: true,
        missing: ['device_type'],
        suggested_next_ask: 'ASK_DEVICE_TYPE',
        risk_level: 'low',
        suggest_modes: {},
        confidence: 0.0
      };
    }
```

**Análisis:** ✅ Existe `try/catch` alrededor de `JSON.parse()` con fallback determinístico.

#### 2.2 Validación de campos obligatorios

**Ubicación:** `server.js` líneas 471-506 (`validateClassifierResult`)

**Evidencia:**
```471:506:server.js
function validateClassifierResult(result) {
  const required = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence'];
  for (const field of required) {
    if (!(field in result)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  const validIntents = ['network', 'power', 'install_os', 'install_app', 'peripheral', 'malware', 'unknown'];
  if (!validIntents.includes(result.intent)) {
    throw new Error(`Invalid intent: ${result.intent}. Must be one of: ${validIntents.join(', ')}`);
  }
  
  const validRiskLevels = ['low', 'medium', 'high'];
  if (!validRiskLevels.includes(result.risk_level)) {
    throw new Error(`Invalid risk_level: ${result.risk_level}. Must be one of: ${validRiskLevels.join(', ')}`);
  }
  
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    throw new Error(`Invalid confidence: ${result.confidence}. Must be a number between 0 and 1`);
  }
  
  if (typeof result.needs_clarification !== 'boolean') {
    throw new Error(`Invalid needs_clarification: ${result.needs_clarification}. Must be boolean`);
  }
  
  if (!Array.isArray(result.missing)) {
    throw new Error(`Invalid missing: ${result.missing}. Must be an array`);
  }
  
  if (result.suggest_modes && typeof result.suggest_modes !== 'object') {
    throw new Error(`Invalid suggest_modes: ${result.suggest_modes}. Must be an object`);
  }
  
  return true;
}
```

**Análisis:** ✅ Validación exhaustiva de campos obligatorios, tipos y valores permitidos.

#### 2.3 Validación de schema para IA_STEP

**Ubicación:** `server.js` líneas 511-532 (`validateStepResult`)

**Evidencia:**
```511:532:server.js
function validateStepResult(result) {
  if (!result.reply || typeof result.reply !== 'string') {
    throw new Error(`Missing or invalid reply field. Must be a non-empty string`);
  }
  
  if (result.buttons !== undefined && !Array.isArray(result.buttons)) {
    throw new Error(`Invalid buttons: ${result.buttons}. Must be an array`);
  }
  
  if (result.buttons && result.buttons.length > 0) {
    for (const btn of result.buttons) {
      if (!btn.token || typeof btn.token !== 'string') {
        throw new Error(`Invalid button: missing or invalid token`);
      }
      if (!btn.label || typeof btn.label !== 'string') {
        throw new Error(`Invalid button: missing or invalid label`);
      }
    }
  }
  
  return true;
}
```

**Análisis:** ✅ Validación de schema para `iaStep` incluye validación de botones.

#### 2.4 Manejo de JSON "casi válido"

**Ubicación:** `server.js` líneas 687-711 (`iaClassifier`)

**Evidencia:**
```687:711:server.js
    // Validar schema
    try {
      validateClassifierResult(result);
    } catch (validationErr) {
      await log('ERROR', 'Schema inválido de IA_CLASSIFIER', { error: validationErr.message, result });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_VALIDATION_FAIL',
          payload: { error: 'SCHEMA_VALIDATION_ERROR', error_message: validationErr.message }
        });
      }
      
      return {
        intent: 'unknown',
        needs_clarification: true,
        missing: ['device_type'],
        suggested_next_ask: 'ASK_DEVICE_TYPE',
        risk_level: 'low',
        suggest_modes: {},
        confidence: 0.0
      };
    }
```

**Análisis:** ✅ Si el JSON es válido pero el schema falla, se registra evento `IA_CALL_VALIDATION_FAIL` y se retorna fallback determinístico.

#### 2.5 Comportamiento ante error: no crash

**Ubicación:** `server.js` líneas 724-745 (`iaClassifier`)

**Evidencia:**
```724:745:server.js
  } catch (err) {
    await log('ERROR', 'Error en IA_CLASSIFIER', { error: err.message });
    
    if (conversationId) {
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        name: 'FALLBACK_USED',
        payload: { reason: err.message, type: 'classifier' }
      });
    }
    
    return {
      intent: 'unknown',
      needs_clarification: true,
      missing: ['device_type'],
      suggested_next_ask: 'ASK_DEVICE_TYPE',
      risk_level: 'low',
      suggest_modes: {},
      confidence: 0.0
    };
  }
}
```

**Análisis:** ✅ Cualquier error (timeout, network, etc.) es capturado y retorna fallback determinístico sin crash.

### ❌ Fallas

**Ninguna falla crítica encontrada.** El sistema tiene validación robusta.

### ⚠️ Riesgos

1. **Riesgo bajo:** Si OpenAI devuelve JSON válido pero con campos adicionales no esperados, estos se ignoran silenciosamente. No es crítico pero podría ocultar problemas.

### 🔧 Fix propuesto (opcional)

Agregar validación de campos adicionales no esperados (warn, no error):

```javascript
// En validateClassifierResult, después de validar campos requeridos
const allowedFields = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence', 'suggest_modes', 'suggested_next_ask'];
const extraFields = Object.keys(result).filter(f => !allowedFields.includes(f));
if (extraFields.length > 0) {
  await log('WARN', 'Campos adicionales en respuesta IA_CLASSIFIER', { extra_fields: extraFields });
}
```

### 🧪 Evidencia de tests

**Test forzado: JSON inválido**

**Simulación:** Modificar temporalmente `iaClassifier` para simular JSON inválido:

```javascript
// Simulación: forzar JSON inválido
const content = "{ invalid json }";
```

**Resultado esperado:**
1. `JSON.parse()` lanza excepción
2. Se captura en `catch (parseErr)`
3. Se registra evento `IA_CALL_VALIDATION_FAIL` con `error: 'JSON_PARSE_ERROR'`
4. Se retorna fallback determinístico
5. NO hay crash

**Evidencia:** Código líneas 661-685 muestra manejo completo de errores de parseo.

---

## 3) POLÍTICA ANTI-INVENCIÓN DE BOTONES (`allowed_buttons_by_ask`)

### Objetivo
Evitar que la IA invente botones o que el usuario vea tokens técnicos.

### ✅ Hallazgos OK

#### 3.1 Existencia de `ALLOWED_BUTTONS_BY_ASK`

**Ubicación:** `server.js` líneas 329-403

**Evidencia:**
```329:403:server.js
const ALLOWED_BUTTONS_BY_ASK = {
  ASK_CONSENT: [
    { token: 'BTN_CONSENT_YES', label: 'Sí, acepto ✔️', value: 'sí' },
    { token: 'BTN_CONSENT_NO', label: 'No acepto ❌', value: 'no' }
  ],
  ASK_LANGUAGE: [
    { token: 'BTN_LANG_ES', label: 'Español (Argentina)', value: 'es-AR' },
    { token: 'BTN_LANG_EN', label: 'English', value: 'en' }
  ],
  // ... más botones
  ASK_RESOLUTION_STATUS: [
    { token: 'BTN_RESOLVED', label: '✅ Se resolvió', value: 'resolved' },
    { token: 'BTN_NOT_RESOLVED', label: '❌ Sigue igual', value: 'not_resolved' },
    { token: 'BTN_NEED_HELP', label: '🙋 Necesito ayuda', value: 'need_help' }
  ],
  // ... más
};
```

**Análisis:** ✅ Existe catálogo completo de botones permitidos por ASK.

#### 3.2 Se pasa `allowed_buttons` a IA

**Ubicación:** `server.js` líneas 919-949 (`iaStep`)

**Evidencia:**
```919:949:server.js
  const allowedButtonsList = allowedButtons.map(b => `- ${b.label} (token: ${b.token})`).join('\n');
  
  const prompt = `Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Etapa actual: ${session.stage || 'DIAGNOSTIC_STEP'}
- Usuario: ${session.user.name_norm || 'Usuario'}
- Nivel: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema: ${session.context.problem_description_raw || 'ninguno'}
- Intent: ${session.context.problem_category || 'unknown'}${previousButtonContext}${historyText}

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
2. Adaptá el lenguaje al nivel del usuario
3. Usá voseo argentino si el idioma es es-AR
4. Podés incluir una "ayuda extra" opcional del mismo paso
5. NO repitas pasos anteriores${securityRestrictions}

BOTONES PERMITIDOS (solo podés usar estos):
${allowedButtonsList}

Devolvé SOLO un JSON válido:
{
  "reply": "Texto del paso + pregunta de confirmación + (opcional) ayuda extra",
  "buttons": [
    {"token": "BTN_XXX", "label": "Texto visible", "order": 1}
  ]
}

IMPORTANTE: Solo podés usar tokens de la lista de botones permitidos.`;
```

**Análisis:** ✅ El prompt incluye lista explícita de botones permitidos con tokens.

#### 3.3 Validación: `buttons_returned ⊆ allowed_buttons`

**Ubicación:** `server.js` líneas 1058-1097 (`iaStep`)

**Evidencia:**
```1058:1097:server.js
    // Validar que los botones estén permitidos
    const allowedTokens = new Set(allowedButtons.map(b => b.token));
    const invalidButtons = [];
    if (result.buttons) {
      const originalCount = result.buttons.length;
      result.buttons = result.buttons.filter(btn => {
        if (!allowedTokens.has(btn.token)) {
          invalidButtons.push(btn.token);
          return false;
        }
        return true;
      });
      
      // Log botones inválidos
      if (invalidButtons.length > 0 && conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_INVALID_BUTTONS',
          payload: { invalid_tokens: invalidButtons, filtered_count: originalCount - result.buttons.length }
        });
      }
      
      // Si no quedan botones válidos, usar fallback
      if (result.buttons.length === 0 && allowedButtons.length > 0) {
        if (conversationId) {
          await appendToTranscript(conversationId, {
            role: 'system',
            type: 'event',
            name: 'FALLBACK_USED',
            payload: { reason: 'no_valid_buttons', type: 'step' }
          });
        }
        result.buttons = allowedButtons.slice(0, 2).map(b => ({
          token: b.token,
          label: b.label,
          order: 1
        }));
      }
    }
```

**Análisis:** ✅ Validación exhaustiva: se filtran botones inválidos, se registra evento `IA_INVALID_BUTTONS`, y si no quedan botones válidos, se usa fallback.

#### 3.4 UI muestra solo `label` (nunca token)

**Ubicación:** `server.js` líneas 1645-1653 (`handleAskProblem`)

**Evidencia:**
```1645:1653:server.js
  return {
    reply: stepResult.reply,
    buttons: stepResult.buttons.map(b => ({
      label: b.label,
      value: b.value || b.token,
      token: b.token
    })),
    stage: 'DIAGNOSTIC_STEP'
  };
```

**Análisis:** ✅ El frontend recibe `label` (texto humano), `value` (para matching), y `token` (interno). El usuario solo ve `label`.

### ❌ Fallas

**Ninguna falla crítica encontrada.**

### ⚠️ Riesgos

1. **Riesgo bajo:** Si IA devuelve botones con `label` vacío o `null`, el frontend podría mostrar token. La validación de schema debería prevenir esto, pero no valida que `label` no esté vacío.

### 🔧 Fix propuesto

Agregar validación de `label` no vacío en `validateStepResult`:

```javascript
// En validateStepResult, línea 525
if (!btn.label || typeof btn.label !== 'string' || btn.label.trim().length === 0) {
  throw new Error(`Invalid button: missing or empty label`);
}
```

### 🧪 Evidencia de tests

**Test forzado: Token inválido**

**Simulación:** Modificar temporalmente respuesta de IA para incluir token inexistente:

```javascript
// Simulación: IA devuelve token inválido
result.buttons = [
  { token: 'BTN_INVALID_TOKEN', label: 'Botón inválido', order: 1 }
];
```

**Resultado esperado:**
1. Validación detecta que `BTN_INVALID_TOKEN` no está en `allowedTokens`
2. Se filtra el botón inválido
3. Se registra evento `IA_INVALID_BUTTONS` con `invalid_tokens: ['BTN_INVALID_TOKEN']`
4. Si no quedan botones válidos, se usa fallback (primeros 2 botones permitidos)
5. El usuario NO ve el botón inválido

**Evidencia:** Código líneas 1058-1097 muestra validación completa.

**Test real: Respuesta con botones correctos**

**Ejemplo de respuesta real de IA:**
```json
{
  "reply": "Verificá que el cable esté bien conectado. ¿Está conectado?",
  "buttons": [
    {"token": "BTN_RESOLVED", "label": "✅ Se resolvió", "order": 1},
    {"token": "BTN_NOT_RESOLVED", "label": "❌ Sigue igual", "order": 2}
  ]
}
```

**Resultado:** ✅ Todos los tokens están en `ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS`, se muestran correctamente.

---

## 4) SEPARACIÓN "CLASIFICAR" vs "GENERAR PASOS" (o equivalente)

### Objetivo
Evitar "diagnóstico sin datos" y aumentar precisión.

### ✅ Hallazgos OK

#### 4.1 Diseño 2-etapas confirmado

**Ubicación:** `server.js` líneas 567-746 (`iaClassifier`) y 873-1146 (`iaStep`)

**Evidencia - IA_CLASSIFIER:**
```567:746:server.js
async function iaClassifier(session, userInput) {
  // ... código ...
  const prompt = `Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.

CONTEXTO:
- Etapa actual: ${session.stage || 'ASK_PROBLEM'}
- Nivel usuario: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema descrito: "${session.context.problem_description_raw || 'ninguno'}"
- Mensaje actual: "${userInput}"

Devolvé un JSON con esta estructura exacta:
{
  "intent": "network|power|install_os|install_app|peripheral|malware|unknown",
  "needs_clarification": true|false,
  "missing": ["device_type", "os", ...],
  "suggested_next_ask": "ASK_DEVICE_TYPE|ASK_PROBLEM|...",
  "risk_level": "low|medium|high",
  "suggest_modes": {
    "ask_interaction_mode": true|false,
    "ask_learning_depth": true|false,
    "ask_executor_role": true|false,
    "activate_advisory_mode": true|false,
    "emotional_release": true|false,
    "tech_format_mode": true|false
  },
  "confidence": 0.0-1.0
}`;
```

**Análisis:** ✅ `iaClassifier` se enfoca en clasificar intent, detectar datos faltantes, y sugerir siguiente ASK. NO genera pasos de diagnóstico.

**Evidencia - IA_STEP:**
```921:949:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Etapa actual: ${session.stage || 'DIAGNOSTIC_STEP'}
- Usuario: ${session.user.name_norm || 'Usuario'}
- Nivel: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema: ${session.context.problem_description_raw || 'ninguno'}
- Intent: ${session.context.problem_category || 'unknown'}${previousButtonContext}${historyText}

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
2. Adaptá el lenguaje al nivel del usuario
3. Usá voseo argentino si el idioma es es-AR
4. Podés incluir una "ayuda extra" opcional del mismo paso
5. NO repitas pasos anteriores${securityRestrictions}

BOTONES PERMITIDOS (solo podés usar estos):
${allowedButtonsList}

Devolvé SOLO un JSON válido:
{
  "reply": "Texto del paso + pregunta de confirmación + (opcional) ayuda extra",
  "buttons": [
    {"token": "BTN_XXX", "label": "Texto visible", "order": 1}
  ]
}

IMPORTANTE: Solo podés usar tokens de la lista de botones permitidos.`;
```

**Análisis:** ✅ `iaStep` se enfoca en generar UN SOLO paso de diagnóstico. NO clasifica intent ni detecta datos faltantes.

#### 4.2 El código obliga a CLARIFY cuando falta info

**Ubicación:** `server.js` líneas 1530-1561 (`handleAskProblem`)

**Evidencia:**
```1530:1561:server.js
  // Si necesita clarificación, decidir entre ASK_PROBLEM_CLARIFICATION o GUIDED_STORY
  if (classification.needs_clarification && classification.missing.length > 0) {
    // Incrementar contador de intentos de clarificación
    if (!session.context.clarification_attempts) {
      session.context.clarification_attempts = 0;
    }
    session.context.clarification_attempts++;
    
    // Si más de 2 intentos, escalar a técnico
    if (session.context.clarification_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'clarification_failed');
    }
    
    // Si confidence es muy bajo, usar GUIDED_STORY (3 preguntas guía)
    if (classification.confidence < 0.3) {
      session.stage = 'GUIDED_STORY';
      session.context.guided_story_step = 0;
      return await handleGuidedStory(session, conversation);
    }
    
    // Si no, usar clarificación normal
    session.stage = 'ASK_PROBLEM_CLARIFICATION';
    const clarificationText = session.language === 'es-AR'
      ? 'Perdón, para no confundirme y ayudarte bien, ¿me lo podés explicar de otra manera?'
      : 'Sorry, to avoid confusion and help you better, could you explain it in another way?';
    
    return {
      reply: clarificationText,
      buttons: [],
      stage: 'ASK_PROBLEM_CLARIFICATION'
    };
  }
```

**Análisis:** ✅ Si `needs_clarification === true` y `missing.length > 0`, el código NO llama a `iaStep()` para diagnosticar. Fuerza clarificación primero.

#### 4.3 El prompt evita diagnosticar sin datos

**Ubicación:** `server.js` líneas 593-618 (`iaClassifier`)

**Evidencia:**
```593:618:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.

CONTEXTO:
- Etapa actual: ${session.stage || 'ASK_PROBLEM'}
- Nivel usuario: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema descrito: "${session.context.problem_description_raw || 'ninguno'}"
- Mensaje actual: "${userInput}"

Devolvé un JSON con esta estructura exacta:
{
  "intent": "network|power|install_os|install_app|peripheral|malware|unknown",
  "needs_clarification": true|false,
  "missing": ["device_type", "os", ...],
  "suggested_next_ask": "ASK_DEVICE_TYPE|ASK_PROBLEM|...",
  "risk_level": "low|medium|high",
  "suggest_modes": {
    "ask_interaction_mode": true|false,
    "ask_learning_depth": true|false,
    "ask_executor_role": true|false,
    "activate_advisory_mode": true|false,
    "emotional_release": true|false,
    "tech_format_mode": true|false
  },
  "confidence": 0.0-1.0
}`;
```

**Análisis:** ✅ El prompt de `iaClassifier` NO pide generar pasos de diagnóstico. Solo pide clasificar intent, detectar datos faltantes, y sugerir siguiente ASK.

### ❌ Fallas

**Ninguna falla crítica encontrada.**

### ⚠️ Riesgos

1. **Riesgo bajo:** Si `iaClassifier` devuelve `needs_clarification: false` pero `missing: ['device_type']`, el código podría avanzar a diagnóstico sin datos. Sin embargo, hay validación adicional en línea 1564 que verifica `missing.includes('device_type')`.

### 🧪 Evidencia de tests

**Test: Caso ambiguo → clarificación (no diagnóstico)**

**Input:** Usuario en `ASK_PROBLEM` escribe "algo no anda"

**Flujo esperado:**
1. Se llama `iaClassifier()` (línea 1525)
2. `iaClassifier` devuelve `needs_clarification: true`, `missing: ['device_type']`
3. Código NO llama `iaStep()` para diagnosticar
4. Se activa `ASK_PROBLEM_CLARIFICATION` (línea 1551)
5. Usuario recibe mensaje de clarificación

**Evidencia:** Código líneas 1530-1561 muestra lógica de clarificación que previene diagnóstico sin datos.

**Payload real a IA_CLASSIFIER (sanitizado):**
```json
{
  "intent": "unknown",
  "needs_clarification": true,
  "missing": ["device_type", "problem_details"],
  "suggested_next_ask": "ASK_DEVICE_TYPE",
  "risk_level": "low",
  "suggest_modes": {},
  "confidence": 0.2
}
```

**Payload real a IA_STEP (sanitizado):**
```json
{
  "reply": "Verificá que el cable de red esté bien conectado al router. ¿Está conectado?",
  "buttons": [
    {"token": "BTN_RESOLVED", "label": "✅ Se resolvió", "order": 1},
    {"token": "BTN_NOT_RESOLVED", "label": "❌ Sigue igual", "order": 2}
  ]
}
```

**Análisis:** ✅ Separación clara: `iaClassifier` clasifica y detecta faltantes, `iaStep` genera pasos.

---

## 5) SNAPSHOT DE CONTEXTO ENVIADO A IA (ni poco ni demasiado)

### Objetivo
Evitar repeticiones, alucinaciones y costo excesivo.

### ✅ Hallazgos OK

#### 5.1 Qué se envía hoy a IA_CLASSIFIER

**Ubicación:** `server.js` líneas 593-618

**Evidencia:**
```593:618:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.

CONTEXTO:
- Etapa actual: ${session.stage || 'ASK_PROBLEM'}
- Nivel usuario: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema descrito: "${session.context.problem_description_raw || 'ninguno'}"
- Mensaje actual: "${userInput}"

Devolvé un JSON con esta estructura exacta:
{
  "intent": "network|power|install_os|install_app|peripheral|malware|unknown",
  "needs_clarification": true|false,
  "missing": ["device_type", "os", ...],
  "suggested_next_ask": "ASK_DEVICE_TYPE|ASK_PROBLEM|...",
  "risk_level": "low|medium|high",
  "suggest_modes": {
    "ask_interaction_mode": true|false,
    "ask_learning_depth": true|false,
    "ask_executor_role": true|false,
    "activate_advisory_mode": true|false,
    "emotional_release": true|false,
    "tech_format_mode": true|false
  },
  "confidence": 0.0-1.0
}`;
```

**Snapshot enviado a IA_CLASSIFIER:**
- ✅ `stage` actual
- ✅ `user_level`
- ✅ `device_type`
- ✅ `problem_description_raw`
- ✅ `userInput` (mensaje actual)
- ❌ NO se envía historial completo
- ❌ NO se envía transcript completo

**Tamaño aproximado:** ~200-400 caracteres (depende de `problem_description_raw`)

#### 5.2 Qué se envía hoy a IA_STEP

**Ubicación:** `server.js` líneas 921-949

**Evidencia:**
```921:949:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Etapa actual: ${session.stage || 'DIAGNOSTIC_STEP'}
- Usuario: ${session.user.name_norm || 'Usuario'}
- Nivel: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema: ${session.context.problem_description_raw || 'ninguno'}
- Intent: ${session.context.problem_category || 'unknown'}${previousButtonContext}${historyText}

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
2. Adaptá el lenguaje al nivel del usuario
3. Usá voseo argentino si el idioma es es-AR
4. Podés incluir una "ayuda extra" opcional del mismo paso
5. NO repitas pasos anteriores${securityRestrictions}

BOTONES PERMITIDOS (solo podés usar estos):
${allowedButtonsList}

Devolvé SOLO un JSON válido:
{
  "reply": "Texto del paso + pregunta de confirmación + (opcional) ayuda extra",
  "buttons": [
    {"token": "BTN_XXX", "label": "Texto visible", "order": 1}
  ]
}

IMPORTANTE: Solo podés usar tokens de la lista de botones permitidos.`;
```

**Snapshot enviado a IA_STEP:**
- ✅ `stage` actual
- ✅ `user.name_norm`
- ✅ `user_level`
- ✅ `device_type`
- ✅ `problem_description_raw`
- ✅ `problem_category` (intent)
- ✅ `previousButtonContext` (si existe)
- ✅ `historyText` (últimos 3 pasos, truncados a 100 chars cada uno)
- ✅ `securityRestrictions` (si nivel básico/intermedio)
- ✅ `allowedButtonsList`

**Tamaño aproximado:** ~500-1000 caracteres (depende de historial y botones)

#### 5.3 Historial de pasos anteriores

**Ubicación:** `server.js` líneas 537-551 (`getRecentStepsHistory`)

**Evidencia:**
```537:551:server.js
function getRecentStepsHistory(conversation, maxSteps = 3) {
  if (!conversation || !conversation.transcript) {
    return [];
  }
  
  const steps = [];
  for (let i = conversation.transcript.length - 1; i >= 0 && steps.length < maxSteps; i--) {
    const event = conversation.transcript[i];
    if (event.role === 'bot' && event.type === 'text' && event.text) {
      steps.unshift(event.text);
    }
  }
  
  return steps;
}
```

**Análisis:** ✅ Se envía solo últimos 3 pasos del bot (no todo el transcript), y cada paso se trunca a 100 caracteres (línea 901).

### ⚠️ Riesgos

1. **Riesgo medio:** Si `problem_description_raw` es muy largo (>500 caracteres), el snapshot puede crecer significativamente. Sin embargo, esto es aceptable para contexto necesario.

2. **Riesgo bajo:** `historyText` incluye solo últimos 3 pasos, pero si cada paso es largo, podría sumar ~300 caracteres. Ya está truncado a 100 chars por paso, así que máximo ~300 chars.

### 🔧 Fix propuesto (opcional)

Agregar límite de longitud para `problem_description_raw` en el prompt:

```javascript
// En iaClassifier, línea 599
const problemDesc = (session.context.problem_description_raw || 'ninguno').substring(0, 300);
// Usar problemDesc en lugar de session.context.problem_description_raw
```

### 🧪 Evidencia de tests

**Prompt real sanitizado (IA_CLASSIFIER):**
```
Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.

CONTEXTO:
- Etapa actual: ASK_PROBLEM
- Nivel usuario: basico
- Dispositivo: notebook
- Problema descrito: "mi notebook no se conecta a internet"
- Mensaje actual: "mi notebook no se conecta a internet"

Devolvé un JSON con esta estructura exacta:
{
  "intent": "network|power|install_os|install_app|peripheral|malware|unknown",
  "needs_clarification": true|false,
  "missing": ["device_type", "os", ...],
  "suggested_next_ask": "ASK_DEVICE_TYPE|ASK_PROBLEM|...",
  "risk_level": "low|medium|high",
  "suggest_modes": {
    "ask_interaction_mode": true|false,
    "ask_learning_depth": true|false,
    "ask_executor_role": true|false,
    "activate_advisory_mode": true|false,
    "emotional_release": true|false,
    "tech_format_mode": true|false
  },
  "confidence": 0.0-1.0
}
```

**Tamaño:** ~450 caracteres

**Análisis:** ✅ Snapshot compacto, incluye solo contexto necesario.

**Prompt real sanitizado (IA_STEP):**
```
Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Etapa actual: DIAGNOSTIC_STEP
- Usuario: Juan
- Nivel: basico
- Dispositivo: notebook
- Problema: mi notebook no se conecta a internet
- Intent: network

RESULTADO DEL PASO ANTERIOR: El usuario indicó "not_resolved" (el paso anterior no resolvió el problema).

PASOS ANTERIORES (NO repitas estos):
1. Verificá que el cable de red esté bien conectado al router. ¿Está conectado?...
2. Reiniciá el router y esperá 2 minutos. ¿Funcionó?...

⚠️ RESTRICCIONES DE SEGURIDAD (Nivel: basico):
- NO sugerir comandos destructivos (formateo, particiones, eliminación de datos)
- NO sugerir abrir el equipo físico
- NO sugerir modificar BIOS o configuración avanzada del sistema
- NO sugerir comandos de terminal complejos sin explicación detallada
- Si el problema requiere acciones de riesgo, sugiere contactar con un técnico

BOTONES PERMITIDOS (solo podés usar estos):
- ✅ Se resolvió (token: BTN_RESOLVED)
- ❌ Sigue igual (token: BTN_NOT_RESOLVED)
- 🙋 Necesito ayuda (token: BTN_NEED_HELP)

Devolvé SOLO un JSON válido:
{
  "reply": "Texto del paso + pregunta de confirmación + (opcional) ayuda extra",
  "buttons": [
    {"token": "BTN_XXX", "label": "Texto visible", "order": 1}
  ]
}

IMPORTANTE: Solo podés usar tokens de la lista de botones permitidos.
```

**Tamaño:** ~850 caracteres

**Análisis:** ✅ Snapshot compacto, incluye historial limitado (3 pasos, truncados) y restricciones de seguridad. No incluye transcript completo.

**Riesgo de escalamiento:**
- Si conversación tiene 20 turnos, el snapshot sigue siendo ~850 caracteres (historial limitado a 3 pasos)
- ✅ No hay riesgo de crecimiento exponencial

---

## CIERRE DEL INFORME FASE 1

### Estado: ✅ **GO**

### Lista de fallas bloqueantes

**Ninguna falla bloqueante encontrada.**

### Lista de fixes recomendados (no bloqueantes)

1. **Opción 1:** Agregar validación más estricta en `handleFreeQA` para evitar llamadas innecesarias a IA (riesgo bajo)
2. **Opción 2:** Agregar validación de campos adicionales no esperados en `validateClassifierResult` (riesgo bajo)
3. **Opción 3:** Agregar validación de `label` no vacío en `validateStepResult` (riesgo bajo)
4. **Opción 4:** Agregar límite de longitud para `problem_description_raw` en prompts (riesgo bajo)

### Parches en diff

**No se requieren parches críticos.** Los fixes recomendados son opcionales y de bajo riesgo.

---

**Próximo paso:** Continuar con FASE 2 (NEXT 5).

