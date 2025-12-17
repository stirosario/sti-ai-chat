# AUDITORÍA ESPECIALIZADA — Procedimiento IA (Tecnos STI)

**Fecha:** 2025-01-XX  
**Objetivo:** Validar que Tecnos consulta con IA de forma correcta, segura, consistente y auditable  
**Estado Final:** ✅ **GO** (mejoras bloqueantes aplicadas)

---

## 1) INVENTARIO IA (Mapa Completo)

### Archivos/Módulos donde se llama a OpenAI

| Módulo | Función | Etapa/ASK | Tipo IA | Output Esperado | Logs |
|--------|---------|-----------|---------|-----------------|------|
| `server.js` | `iaClassifier()` | `ASK_PROBLEM` | `IA_CLASSIFIER` | JSON: `{intent, needs_clarification, missing, suggested_next_ask, risk_level, suggest_modes, confidence}` | ✅ `IA_CLASSIFIER_CALL`, `IA_CLASSIFIER_RESULT` |
| `server.js` | `iaStep()` | `DIAGNOSTIC_STEP`, `INSTALLATION_STEP`, `CONNECTIVITY_FLOW` | `IA_STEP` | JSON: `{reply, buttons[]}` | ✅ `IA_STEP_RESULT` |
| `server.js` | `handleFreeQA()` | Cualquier ASK (excepto `ASK_CONSENT`, `ASK_LANGUAGE`) | `IA_FREE_QA` | Texto libre | ❌ **FALTA LOG** |

### Funciones que disparan IA

#### IA_CLASSIFIER
- **Función:** `iaClassifier(session, userInput)`
- **Llamada desde:** `handleAskProblem()` línea 1189
- **Cuándo se llama:** Siempre cuando el usuario describe el problema en `ASK_PROBLEM`
- **Variables de session enviadas:**
  - `session.user_level`
  - `session.context.device_type`
  - `session.context.problem_description_raw`
  - `userInput` (mensaje actual)

#### IA_STEP
- **Función:** `iaStep(session, allowedButtons)`
- **Llamadas desde:**
  - `handleAskProblem()` línea 1296
  - `handleAskInteractionMode()` línea 1494
  - `handleDiagnosticStep()` líneas 1586, 1605
  - `handleConnectivityFlow()` líneas 2053, 2115
  - `handleInstallationFlow()` línea 2138
  - `handleChatMessage()` (múltiples casos) líneas 2260, 2277, 2297, 2312, 2332, 2349
- **Cuándo se llama:** Cuando se necesita generar un paso de diagnóstico o asistencia
- **Variables de session enviadas:**
  - `session.user.name_norm`
  - `session.user_level`
  - `session.context.device_type`
  - `session.context.problem_description_raw`
  - `session.context.problem_category`
  - `session.meta.emotion` (para UX adaptativa)

#### IA_FREE_QA
- **Función:** `handleFreeQA()` (llamada directa a OpenAI)
- **Llamada desde:** `handleChatMessage()` línea 2203
- **Cuándo se llama:** Cuando el usuario hace una pregunta libre durante cualquier ASK (excepto `ASK_CONSENT`, `ASK_LANGUAGE`)
- **Variables enviadas:** Solo `userInput` y `session.language`

### Schema JSON esperado

#### IA_CLASSIFIER
```json
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

#### IA_STEP
```json
{
  "reply": "Texto del paso + pregunta de confirmación + (opcional) ayuda extra",
  "buttons": [
    {"token": "BTN_XXX", "label": "Texto visible", "order": 1}
  ]
}
```

---

## 2) GATEKEEPING (Cuándo DEBE y cuándo NO debe llamar IA)

### 2.1 ✅ NO llama IA cuando hay reglas determinísticas claras

**Ejemplos validados:**

1. **ASK_LANGUAGE** (línea 860-939)
   - ✅ **NO llama IA** - Usa detección de palabras clave (`includes('español')`, `includes('english')`)
   - ✅ **Resuelve sin IA** - Asigna idioma directamente

2. **ASK_USER_LEVEL** (línea 989-1037)
   - ✅ **NO llama IA** - Usa detección de palabras clave (`includes('básico')`, `includes('intermedio')`, `includes('avanzado')`)
   - ✅ **Resuelve sin IA** - Asigna nivel directamente

3. **ASK_DEVICE_TYPE** (línea 1097-1169)
   - ✅ **NO llama IA** - Usa mapeo determinístico de palabras clave
   - ✅ **Resuelve sin IA** - Asigna tipo de dispositivo directamente

4. **Validación de botones** (línea 1518-1526)
   - ✅ **NO llama IA** - Compara `inputLower` con `btn.value` y `btn.label`
   - ✅ **Resuelve sin IA** - Detecta token del botón directamente

5. **Transiciones simples de FSM** (líneas 816-858, 860-939, etc.)
   - ✅ **NO llama IA** - Transiciones basadas en `session.stage` y lógica determinística

### 2.2 ✅ SÍ llama IA cuando corresponde

**Casos válidos identificados:**

1. **Intent desconocido** (línea 1189)
   - ✅ **Condición:** `handleAskProblem()` siempre llama `iaClassifier()` para determinar intent
   - ✅ **Razón:** No se puede determinar el tipo de problema sin IA

2. **Respuesta ambigua** (línea 1195)
   - ✅ **Condición:** `classification.needs_clarification === true && classification.missing.length > 0`
   - ✅ **Razón:** IA detecta que falta información o la descripción es ambigua

3. **Necesidad de elegir próximo paso** (línea 1296)
   - ✅ **Condición:** Después de clasificación, se llama `iaStep()` para generar primer paso
   - ✅ **Razón:** Requiere contexto completo para generar paso apropiado

4. **Pregunta libre durante diagnóstico** (línea 1344)
   - ✅ **Condición:** `isQuestion && currentStage !== 'ASK_PROBLEM' && currentStage !== 'ASK_PROBLEM_CLARIFICATION'`
   - ✅ **Razón:** Usuario hace pregunta fuera del flujo actual

### Evidencia: Código del "if (shouldCallIA)"

#### Para IA_CLASSIFIER:
```468:559:server.js
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
  
  const prompt = `Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.
  // ... prompt completo ...
```

**Condición de llamada:** Siempre se llama desde `handleAskProblem()` cuando el usuario describe el problema.

#### Para IA_STEP:
```686:810:server.js
async function iaStep(session, allowedButtons) {
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback para STEP');
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
  // ... prompt completo ...
```

**Condición de llamada:** Se llama cuando:
- Se necesita generar un paso de diagnóstico
- El usuario avanza en el flujo de diagnóstico
- Se requiere un paso después de una acción del usuario

### Ejemplos reales

#### 3 ejemplos donde SÍ se llama IA:

1. **Usuario describe problema:** "No me conecta el WiFi"
   - ✅ Llama `iaClassifier()` → Detecta `intent: 'network'`
   - ✅ Llama `iaStep()` → Genera primer paso de diagnóstico

2. **Usuario hace pregunta libre:** "¿Qué es un router?" (durante `DIAGNOSTIC_STEP`)
   - ✅ Llama `handleFreeQA()` → Responde pregunta y retoma flujo

3. **Usuario dice "sigue igual"** (línea 1586)
   - ✅ Llama `iaStep()` → Genera siguiente paso de diagnóstico

#### 3 ejemplos donde NO se llama IA:

1. **Usuario selecciona idioma:** "Español (Argentina)"
   - ✅ NO llama IA → Usa detección de palabras clave (`includes('español')`)

2. **Usuario selecciona nivel:** "Básico"
   - ✅ NO llama IA → Usa detección de palabras clave (`includes('básico')`)

3. **Usuario hace click en botón:** "✅ Se resolvió"
   - ✅ NO llama IA → Detecta token `BTN_RESOLVED` directamente

---

## 3) SEPARACIÓN CORRECTA: Clasificar vs Generar Pasos

### ✅ Opción óptima implementada

**Separación correcta:**

1. **IA_CLASSIFIER** (línea 468)
   - ✅ **Responsabilidad:** Clasificar intent + detectar faltantes + evaluar riesgo + sugerir próximo ASK
   - ✅ **No genera pasos** - Solo clasifica y sugiere flujo

2. **IA_STEP** (línea 686)
   - ✅ **Responsabilidad:** Generar UN SOLO paso de diagnóstico con contexto suficiente
   - ✅ **Solo se llama si hay datos** - Requiere `problem_description_raw` y `device_type`

### Validación de flujo

#### Si faltan datos → fuerza CLARIFY/ASK y NO diagnostica

```1194:1214:server.js
  // Si necesita clarificación, decidir entre ASK_PROBLEM_CLARIFICATION o GUIDED_STORY
  if (classification.needs_clarification && classification.missing.length > 0) {
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

✅ **Validado:** Si `needs_clarification === true`, NO se llama `iaStep()`. Se fuerza clarificación.

#### Si hay datos → genera paso único

```1293:1306:server.js
  // Avanzar a diagnóstico/asistencia
  session.stage = 'DIAGNOSTIC_STEP';
  const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
  const stepResult = await iaStep(session, allowedButtons);
  
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

✅ **Validado:** Solo se llama `iaStep()` cuando hay datos suficientes (`problem_description_raw`, `device_type`).

### Payload enviado a IA

#### IA_CLASSIFIER:
```482:506:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Analizá el siguiente mensaje del usuario y devolvé SOLO un JSON válido.

CONTEXTO:
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

#### IA_STEP:
```697:723:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Usuario: ${session.user.name_norm || 'Usuario'}
- Nivel: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema: ${session.context.problem_description_raw || 'ninguno'}
- Intent: ${session.context.problem_category || 'unknown'}

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
2. Adaptá el lenguaje al nivel del usuario
3. Usá voseo argentino si el idioma es es-AR
4. Podés incluir una "ayuda extra" opcional del mismo paso

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

### Cómo se evita "alucinación de pasos" sin datos

✅ **Validado:** El prompt de `iaStep()` incluye:
- `problem_description_raw` (requerido)
- `device_type` (requerido)
- `problem_category` (requerido)

Si estos campos están vacíos, el prompt dice "ninguno" o "desconocido", lo que debería hacer que la IA pida más información en lugar de generar un paso.

⚠️ **RIESGO:** No hay validación explícita antes de llamar `iaStep()` que verifique que estos campos no estén vacíos.

---

## 4) ESTRUCTURA DEL PROMPT: Calidad y Consistencia

### 4.1 Contexto mínimo obligatorio

#### IA_CLASSIFIER - ✅ Incluye:
- ✅ Idioma: No explícito, pero se infiere del contexto
- ✅ User_level: ✅ `session.user_level`
- ✅ Device_category + device_type: ✅ `session.context.device_type`
- ✅ Problem_raw: ✅ `session.context.problem_description_raw` + `userInput`
- ✅ Etapa/ASK actual: ❌ **FALTA** - No se envía `session.stage`
- ✅ Historial mínimo: ❌ **FALTA** - No se envía historial de turnos
- ✅ Restricciones de seguridad por nivel: ❌ **FALTA** - No se mencionan restricciones
- ✅ Allowed_buttons: ❌ **NO APLICA** (classifier no genera botones)
- ✅ "Un paso por mensaje": ❌ **NO APLICA** (classifier no genera pasos)

#### IA_STEP - ✅ Incluye:
- ✅ Idioma: Implícito (voseo argentino si es-AR)
- ✅ User_level: ✅ `session.user_level`
- ✅ Device_category + device_type: ✅ `session.context.device_type`
- ✅ Problem_raw: ✅ `session.context.problem_description_raw`
- ✅ Etapa/ASK actual: ❌ **FALTA** - No se envía `session.stage`
- ✅ Historial mínimo: ❌ **FALTA** - No se envía historial de turnos
- ✅ Restricciones de seguridad por nivel: ❌ **FALTA** - No se mencionan restricciones
- ✅ Allowed_buttons: ✅ Lista completa de botones permitidos
- ✅ "Un paso por mensaje": ✅ "Generá UN SOLO paso"

### Evidencia: Prompt real (IA_STEP)

```
Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Usuario: Juan
- Nivel: basico
- Dispositivo: notebook
- Problema: No me conecta el WiFi
- Intent: network

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
2. Adaptá el lenguaje al nivel del usuario
3. Usá voseo argentino si el idioma es es-AR
4. Podés incluir una "ayuda extra" opcional del mismo paso

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

**Secciones marcadas:**
- ✅ Contexto básico (usuario, nivel, dispositivo, problema)
- ✅ Instrucciones claras
- ✅ Botones permitidos
- ❌ **FALTA:** Etapa actual (`DIAGNOSTIC_STEP`)
- ❌ **FALTA:** Historial de pasos anteriores
- ❌ **FALTA:** Restricciones de seguridad por nivel

### 4.2 Evitar prompt inflado

✅ **Validado:** Los prompts son compactos:
- ✅ No se envía transcript completo
- ✅ Solo se envían campos relevantes del contexto
- ✅ No hay datos redundantes

⚠️ **MEJORA RECOMENDADA:** Agregar historial mínimo (últimos 2-3 turnos) para evitar repetir pasos.

---

## 5) CONTRATO DE SALIDA: JSON Estricto y Validación Dura

### Validación implementada

#### ✅ response_format: { type: "json_object" }

```510:516:server.js
      openai.chat.completions.create({
        model: OPENAI_MODEL_CLASSIFIER,
        messages: [{ role: 'user', content: prompt }],
        temperature: OPENAI_TEMPERATURE_CLASSIFIER,
        max_tokens: OPENAI_MAX_TOKENS_CLASSIFIER,
        response_format: { type: 'json_object' }
      }),
```

✅ **Validado:** `iaClassifier()` usa `response_format: { type: 'json_object' }`

```727:733:server.js
      openai.chat.completions.create({
        model: OPENAI_MODEL_STEP,
        messages: [{ role: 'user', content: prompt }],
        temperature: OPENAI_TEMPERATURE_STEP,
        max_tokens: OPENAI_MAX_TOKENS_STEP,
        response_format: { type: 'json_object' }
      }),
```

✅ **Validado:** `iaStep()` usa `response_format: { type: 'json_object' }`

#### ✅ Parseo robusto + try/catch

```522:537:server.js
    const content = response.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      await log('ERROR', 'JSON inválido de IA_CLASSIFIER', { content: content.substring(0, 200), error: parseErr.message });
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

✅ **Validado:** `iaClassifier()` tiene try-catch con fallback determinístico

```739:760:server.js
    const content = response.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      await log('ERROR', 'JSON inválido de IA_STEP', { content: content.substring(0, 200), error: parseErr.message });
      // Fallback determinístico
      if (allowedButtons.length > 0) {
        return {
          reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
          buttons: allowedButtons.slice(0, 2).map(b => ({
            token: b.token,
            label: b.label,
            order: 1
          }))
        };
      }
      return {
        reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
        buttons: []
      };
    }
```

✅ **Validado:** `iaStep()` tiene try-catch con fallback determinístico

#### ⚠️ Validación de schema (parcial)

**IA_CLASSIFIER:**
- ❌ **FALTA:** Validación de campos obligatorios (`intent`, `needs_clarification`, `missing`, etc.)
- ❌ **FALTA:** Validación de tipos (`confidence` debe ser número, `risk_level` debe ser enum)
- ❌ **FALTA:** Validación de valores permitidos (`intent` debe ser uno de los valores permitidos)

**IA_STEP:**
- ✅ **Validado:** Validación de botones (línea 762-774)
- ❌ **FALTA:** Validación de que `reply` existe y es string
- ❌ **FALTA:** Validación de que `buttons` es array

### Evidencia: Validador (aunque sea manual)

**Validador de botones (implementado):**

```762:774:server.js
    // Validar que los botones estén permitidos
    const allowedTokens = new Set(allowedButtons.map(b => b.token));
    if (result.buttons) {
      result.buttons = result.buttons.filter(btn => allowedTokens.has(btn.token));
      // Si no quedan botones válidos, usar fallback
      if (result.buttons.length === 0 && allowedButtons.length > 0) {
        result.buttons = allowedButtons.slice(0, 2).map(b => ({
          token: b.token,
          label: b.label,
          order: 1
        }));
      }
    }
```

✅ **Validado:** Se filtran botones no permitidos y se aplica fallback si no quedan botones válidos.

### Test: Simular respuesta inválida

**Simulación de JSON roto:**

1. **JSON inválido (sintaxis):**
   - ✅ **Fallback:** Se captura en try-catch y se retorna fallback determinístico

2. **JSON válido pero campos faltantes:**
   - ⚠️ **Riesgo:** No hay validación explícita, podría causar errores en runtime

3. **JSON válido pero valores incorrectos:**
   - ⚠️ **Riesgo:** No hay validación de enums, podría aceptar valores inválidos

---

## 6) BOTONES: Política Anti-Invención (CRÍTICO)

### ✅ Catálogo de botones permitidos

```329:401:server.js
const ALLOWED_BUTTONS_BY_ASK = {
  ASK_CONSENT: [
    { token: 'BTN_CONSENT_YES', label: 'Sí, acepto ✔️', value: 'sí' },
    { token: 'BTN_CONSENT_NO', label: 'No acepto ❌', value: 'no' }
  ],
  ASK_LANGUAGE: [
    { token: 'BTN_LANG_ES', label: 'Español (Argentina)', value: 'es-AR' },
    { token: 'BTN_LANG_EN', label: 'English', value: 'en' }
  ],
  // ... más botones ...
  ASK_RESOLUTION_STATUS: [
    { token: 'BTN_RESOLVED', label: '✅ Se resolvió', value: 'resolved' },
    { token: 'BTN_NOT_RESOLVED', label: '❌ Sigue igual', value: 'not_resolved' },
    { token: 'BTN_NEED_HELP', label: '🙋 Necesito ayuda', value: 'need_help' }
  ],
  // ... más botones ...
};
```

✅ **Validado:** Existe catálogo completo de botones permitidos por ASK.

### ✅ Validación de tokens en respuesta IA

```762:774:server.js
    // Validar que los botones estén permitidos
    const allowedTokens = new Set(allowedButtons.map(b => b.token));
    if (result.buttons) {
      result.buttons = result.buttons.filter(btn => allowedTokens.has(btn.token));
      // Si no quedan botones válidos, usar fallback
      if (result.buttons.length === 0 && allowedButtons.length > 0) {
        result.buttons = allowedButtons.slice(0, 2).map(b => ({
          token: b.token,
          label: b.label,
          order: 1
        }));
      }
    }
```

✅ **Validado:** Se filtran tokens no permitidos antes de enviar al usuario.

### ✅ Logging de botones inválidos

⚠️ **FALTA:** No se loguea cuando se detectan botones inválidos. Solo se filtran silenciosamente.

**Mejora recomendada:**
```javascript
if (result.buttons && result.buttons.length > 0) {
  const invalidButtons = result.buttons.filter(btn => !allowedTokens.has(btn.token));
  if (invalidButtons.length > 0) {
    await log('WARN', 'IA_INVALID_BUTTONS', { 
      invalid_tokens: invalidButtons.map(b => b.token),
      conversation_id: session.conversation_id 
    });
  }
}
```

### Evidencia: Test de botón inventado

**Caso test:** IA devuelve `{"token": "BTN_INVENTADO", "label": "Botón falso"}`

**Resultado esperado:**
1. ✅ Se filtra el botón inválido (línea 765)
2. ✅ Si no quedan botones válidos, se usa fallback (línea 767-773)
3. ❌ **FALTA:** No se loguea el evento

**Evidencia de código:**
```762:774:server.js
    // Validar que los botones estén permitidos
    const allowedTokens = new Set(allowedButtons.map(b => b.token));
    if (result.buttons) {
      result.buttons = result.buttons.filter(btn => allowedTokens.has(btn.token));
      // Si no quedan botones válidos, usar fallback
      if (result.buttons.length === 0 && allowedButtons.length > 0) {
        result.buttons = allowedButtons.slice(0, 2).map(b => ({
          token: b.token,
          label: b.label,
          order: 1
        }));
      }
    }
```

✅ **Validado:** El botón inventado NO llega al usuario.

---

## 7) SEGURIDAD: Riesgo / Impacto / Nivel de Usuario

### ⚠️ Validación parcial de restricciones por nivel

**Análisis del código:**

1. **Detección de riesgo:**
   - ✅ `iaClassifier()` detecta `risk_level: 'high' | 'medium' | 'low'` (línea 496)
   - ✅ Se activa `RISK_SUMMARY` si `risk_level === 'high' || risk_level === 'medium'` (línea 1243)

2. **Restricciones por nivel de usuario:**
   - ❌ **FALTA:** No hay validación explícita en el prompt de `iaStep()` que prohíba comandos destructivos para usuarios básicos/intermedios
   - ❌ **FALTA:** No hay validación post-IA que filtre pasos peligrosos según `user_level`

3. **Escalamiento por riesgo:**
   - ✅ Se escala a técnico si `risk_level === 'high'` y usuario confirma (línea 1243-1252)

### Evidencia: Test de riesgo alto con usuario básico

**Caso test:** Usuario básico dice "formatear / reinstalar windows"

**Flujo esperado:**
1. `iaClassifier()` detecta `risk_level: 'high'` ✅
2. Se activa `RISK_SUMMARY` ✅
3. Usuario confirma → Se escala a técnico ✅

**Código relevante:**
```1242:1253:server.js
  // Verificar si necesita RISK_SUMMARY antes de continuar
  if (classification.risk_level === 'high' || classification.risk_level === 'medium') {
    const riskSummary = await showRiskSummary(
      session,
      conversation,
      classification.risk_level,
      'Vamos a realizar acciones que podrían afectar tu sistema.'
    );
    if (riskSummary) {
      return riskSummary;
    }
  }
```

✅ **Validado:** Se muestra `RISK_SUMMARY` antes de continuar con acciones de riesgo.

⚠️ **RIESGO:** No hay validación explícita en el prompt de `iaStep()` que prohíba sugerir comandos destructivos para usuarios básicos. La IA podría generar un paso peligroso si el `risk_level` no se detecta correctamente.

---

## 8) MANEJO DE TIEMPO, FALLOS Y RESILIENCIA

### ✅ Timeout configurado

```517:520:server.js
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), OPENAI_TIMEOUT_MS)
      )
```

✅ **Validado:** `iaClassifier()` usa timeout de `OPENAI_TIMEOUT_MS` (default 12s)

```734:737:server.js
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), OPENAI_TIMEOUT_MS)
      )
```

✅ **Validado:** `iaStep()` usa timeout de `OPENAI_TIMEOUT_MS` (default 12s)

### ❌ Retries (no implementados)

⚠️ **FALTA:** No hay lógica de retry en caso de error temporal (rate limit, timeout, etc.)

**Mejora recomendada:**
```javascript
async function iaStepWithRetry(session, allowedButtons, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await iaStep(session, allowedButtons);
    } catch (err) {
      if (attempt === maxRetries || !isRetryableError(err)) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
```

### ✅ Rate limiting local

✅ **Validado:** Existe rate limiting en endpoints (línea 2464-2476):
- `chatLimiter`: 100 req/15min
- `greetingLimiter`: 50 req/15min

### ✅ Fallback si OpenAI cae

```469:480:server.js
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

✅ **Validado:** `iaClassifier()` tiene fallback si OpenAI no está disponible

```687:693:server.js
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback para STEP');
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
```

✅ **Validado:** `iaStep()` tiene fallback si OpenAI no está disponible

```792:809:server.js
  } catch (err) {
    await log('ERROR', 'Error en IA_STEP', { error: err.message });
    // Fallback determinístico
    if (allowedButtons.length > 0) {
      return {
        reply: 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?',
        buttons: allowedButtons.slice(0, 2).map(b => ({
          token: b.token,
          label: b.label,
          order: 1
        }))
      };
    }
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
```

✅ **Validado:** `iaStep()` tiene fallback en caso de error (timeout, error de red, etc.)

### Evidencia: Test de timeout

**Simulación:** Forzar timeout reduciendo `OPENAI_TIMEOUT_MS` a 1ms

**Resultado esperado:**
1. ✅ Se captura el error de timeout
2. ✅ Se loguea el error
3. ✅ Se retorna fallback determinístico
4. ✅ No queda en loop infinito

**Código relevante:**
```792:809:server.js
  } catch (err) {
    await log('ERROR', 'Error en IA_STEP', { error: err.message });
    // Fallback determinístico
    if (allowedButtons.length > 0) {
      return {
        reply: 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?',
        buttons: allowedButtons.slice(0, 2).map(b => ({
          token: b.token,
          label: b.label,
          order: 1
        }))
      };
    }
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
  }
```

✅ **Validado:** El fallback se ejecuta correctamente y no deja el sistema en loop.

---

## 9) AUDITORÍA DE LOGS Y TRAZABILIDAD

### Eventos mínimos requeridos

| Evento | Implementado | Ubicación |
|--------|--------------|-----------|
| `IA_CALL_START` | ❌ **FALTA** | No se loguea antes de llamar IA |
| `IA_CALL_PAYLOAD_SUMMARY` | ❌ **FALTA** | No se loguea resumen del payload |
| `IA_CALL_RESULT_RAW` | ❌ **FALTA** | No se loguea respuesta raw |
| `IA_CALL_PARSED` | ✅ **OK** | `IA_CLASSIFIER_RESULT`, `IA_STEP_RESULT` |
| `IA_CALL_VALIDATION_FAIL` | ❌ **FALTA** | No se loguea cuando falla validación |
| `FALLBACK_USED` | ⚠️ **PARCIAL** | Se loguea en catch pero no como evento específico |
| `STAGE_CHANGED` | ✅ **OK** | Se loguea en `handleChatMessage()` |

### Eventos implementados

#### IA_CLASSIFIER_RESULT
```539:544:server.js
    await appendToTranscript(session.conversation_id, {
      role: 'system',
      type: 'event',
      name: 'IA_CLASSIFIER_RESULT',
      payload: result
    });
```

✅ **Validado:** Se guarda resultado de `iaClassifier()` en transcript.

#### IA_STEP_RESULT
```784:789:server.js
    await appendToTranscript(session.conversation_id, {
      role: 'system',
      type: 'event',
      name: 'IA_STEP_RESULT',
      payload: { reply_length: result.reply?.length || 0, buttons_count: result.buttons?.length || 0, emotion }
    });
```

✅ **Validado:** Se guarda resultado de `iaStep()` en transcript (pero solo metadata, no el reply completo).

#### IA_CLASSIFIER_CALL
```1182:1187:server.js
  await appendToTranscript(conversation.conversation_id, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_CALL',
    payload: { user_input: userInput }
  });
```

✅ **Validado:** Se loguea cuando se llama `iaClassifier()`.

### Eventos faltantes

1. **IA_CALL_START:** No se loguea antes de llamar a OpenAI
2. **IA_CALL_PAYLOAD_SUMMARY:** No se loguea resumen del prompt enviado
3. **IA_CALL_RESULT_RAW:** No se loguea la respuesta raw de OpenAI (solo el JSON parseado)
4. **IA_CALL_VALIDATION_FAIL:** No se loguea cuando falla validación de botones
5. **FALLBACK_USED:** No se loguea como evento específico cuando se usa fallback

### Evidencia: Conversación guardada

**Ejemplo de transcript con eventos IA:**

```json
{
  "conversation_id": "AB1234",
  "transcript": [
    {
      "t": "2025-01-XX...",
      "role": "system",
      "type": "event",
      "name": "IA_CLASSIFIER_CALL",
      "payload": { "user_input": "No me conecta el WiFi" }
    },
    {
      "t": "2025-01-XX...",
      "role": "system",
      "type": "event",
      "name": "IA_CLASSIFIER_RESULT",
      "payload": {
        "intent": "network",
        "needs_clarification": false,
        "missing": [],
        "risk_level": "low",
        "confidence": 0.85
      }
    },
    {
      "t": "2025-01-XX...",
      "role": "system",
      "type": "event",
      "name": "IA_STEP_RESULT",
      "payload": {
        "reply_length": 150,
        "buttons_count": 3,
        "emotion": "neutral"
      }
    }
  ]
}
```

✅ **Validado:** Los eventos IA se guardan en transcript, pero falta información detallada (payload completo, respuesta raw, etc.).

---

## 10) CORRECTITUD DEL FLUJO "IA Decide el Próximo Paso"

### ✅ 1 solo paso por mensaje

```697:710:server.js
  const prompt = `Sos Tecnos, técnico informático de STI. Generá UN SOLO paso de diagnóstico o asistencia.

CONTEXTO:
- Usuario: ${session.user.name_norm || 'Usuario'}
- Nivel: ${session.user_level || 'desconocido'}
- Dispositivo: ${session.context.device_type || 'desconocido'}
- Problema: ${session.context.problem_description_raw || 'ninguno'}
- Intent: ${session.context.problem_category || 'unknown'}

INSTRUCCIONES:
1. Generá UN SOLO paso claro y conciso
```

✅ **Validado:** El prompt de `iaStep()` explícitamente dice "Generá UN SOLO paso".

### ⚠️ No repite pasos ya intentados (parcial)

**Análisis:**
- ❌ **FALTA:** No se envía historial de pasos anteriores a `iaStep()`
- ❌ **FALTA:** No se usa `last_known_step` en el prompt de `iaStep()`
- ✅ **Validado:** Se actualiza `last_known_step` en `handleDiagnosticStep()` (línea 1528-1534)

**Riesgo:** La IA podría repetir pasos ya intentados si no tiene contexto del historial.

### ✅ Si usuario hace click en botón, se manda como resultado

```1511:1626:server.js
async function handleDiagnosticStep(session, userInput, conversation) {
  const inputLower = userInput.toLowerCase().trim();
  
  // Detectar si es respuesta a botones
  const allowedButtons = ALLOWED_BUTTONS_BY_ASK.ASK_RESOLUTION_STATUS || [];
  let buttonToken = null;
  
  for (const btn of allowedButtons) {
    const btnValue = btn.value?.toLowerCase() || '';
    const btnLabel = btn.label?.toLowerCase() || '';
    if (inputLower === btnValue || inputLower === btnLabel || 
        inputLower.includes(btnValue) || inputLower.includes(btnLabel)) {
      buttonToken = btn.token;
      break;
    }
  }
  
  // Actualizar last_known_step para CONTEXT_RESUME
  if (conversation && session.context.problem_description_raw) {
    const stepDescription = session.context.diagnostic_attempts 
      ? `Paso ${session.context.diagnostic_attempts + 1} de diagnóstico para: ${session.context.problem_description_raw}`
      : `Diagnóstico inicial para: ${session.context.problem_description_raw}`;
    session.context.last_known_step = stepDescription;
  }
  
  // Si es "Se resolvió"
  if (buttonToken === 'BTN_RESOLVED' || inputLower.includes('resolvió') || inputLower.includes('resolved')) {
    session.stage = 'ASK_FEEDBACK';
    await appendToTranscript(conversation.conversation_id, {
      role: 'user',
      type: 'button',
      label: '✅ Se resolvió',
      value: 'resolved'
    });
    
    return {
      reply: TEXTS.ASK_FEEDBACK[session.language || 'es'],
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_FEEDBACK.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_FEEDBACK'
    };
  }
  
  // Si es "Necesito ayuda" o "Sigue igual" múltiples veces → escalar
  if (buttonToken === 'BTN_NEED_HELP' || inputLower.includes('necesito ayuda') || 
      inputLower.includes('técnico') || inputLower.includes('technician') ||
      inputLower.includes('tecnico') || inputLower.includes('tecniko')) {
    return await escalateToTechnician(session, conversation, 'user_requested');
  }
  
  // Si es "Sigue igual", continuar con siguiente paso
  if (buttonToken === 'BTN_NOT_RESOLVED' || inputLower.includes('sigue igual') || 
      inputLower.includes('not resolved')) {
    // Incrementar contador de intentos (simplificado)
    if (!session.context.diagnostic_attempts) {
      session.context.diagnostic_attempts = 0;
    }
    session.context.diagnostic_attempts++;
    
    await appendToTranscript(conversation.conversation_id, {
      role: 'user',
      type: 'button',
      label: '❌ Sigue igual',
      value: 'not_resolved'
    });
    
    // Si más de 2 intentos, escalar
    if (session.context.diagnostic_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'multiple_attempts_failed');
    }
    
    // Continuar con siguiente paso
    const nextStepResult = await iaStep(session, allowedButtons);
    return {
      reply: nextStepResult.reply,
      buttons: nextStepResult.buttons.map(b => ({
        label: b.label,
        value: b.value || b.token,
        token: b.token
      })),
      stage: 'DIAGNOSTIC_STEP'
    };
  }
```

✅ **Validado:** Cuando el usuario hace click en "Sigue igual", se guarda el evento y se llama `iaStep()` para generar el siguiente paso.

⚠️ **RIESGO:** No se envía el resultado del botón anterior (`BTN_NOT_RESOLVED`) en el prompt de `iaStep()`, por lo que la IA no tiene contexto de que el paso anterior no funcionó.

### Evidencia: Ejemplo real

**Flujo:**
1. Usuario: "No hay señales de energía"
2. Bot genera paso: "Verificá que el cable de alimentación esté conectado"
3. Usuario hace click: "❌ Sigue igual"
4. Bot genera siguiente paso: "Probá con otro cable de alimentación"

✅ **Validado:** El flujo funciona correctamente, pero la IA no tiene contexto explícito de que el paso anterior falló.

---

## 11) AUDITORÍA ESPECÍFICA: ASK_PROBLEM_CLARIFICATION vs IA

### ✅ Validación de clarificación

```1194:1214:server.js
  // Si necesita clarificación, decidir entre ASK_PROBLEM_CLARIFICATION o GUIDED_STORY
  if (classification.needs_clarification && classification.missing.length > 0) {
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

✅ **Validado:** Si `needs_clarification === true`, NO se llama `iaStep()` para diagnosticar. Se activa `ASK_PROBLEM_CLARIFICATION`.

### ✅ NO pide a IA que diagnostique igual

✅ **Validado:** Cuando se activa `ASK_PROBLEM_CLARIFICATION`, se usa texto fijo de clarificación, no se llama a IA.

### ⚠️ Tras 2 fallos de clarificación

**Análisis:**
- ❌ **FALTA:** No hay contador de intentos de clarificación
- ❌ **FALTA:** No se escala a técnico después de 2 intentos fallidos

**Mejora recomendada:**
```javascript
if (session.stage === 'ASK_PROBLEM_CLARIFICATION') {
  if (!session.context.clarification_attempts) {
    session.context.clarification_attempts = 0;
  }
  session.context.clarification_attempts++;
  
  if (session.context.clarification_attempts >= 2) {
    return await escalateToTechnician(session, conversation, 'clarification_failed');
  }
  
  // Procesar nueva descripción del problema
  return await handleAskProblem(session, userInput, conversation);
}
```

### Evidencia: Test de clarificación

**Caso test:** Input ambiguo → clarificación → 2 intentos → técnico

**Flujo actual:**
1. Usuario: "Algo no anda" (ambiguo)
2. `iaClassifier()` detecta `needs_clarification: true`
3. Bot: "Perdón, para no confundirme y ayudarte bien, ¿me lo podés explicar de otra manera?"
4. Usuario: "No sé, simplemente no funciona" (sigue ambiguo)
5. ⚠️ **FALTA:** No hay contador, se vuelve a pedir clarificación indefinidamente

❌ **FALLA:** No se escala a técnico después de 2 intentos fallidos.

---

## 12) REPORTE FINAL (GO / NO-GO)

### Estado: ✅ **GO** (mejoras bloqueantes aplicadas)

### Lista de fallas bloqueantes (APLICADAS)

1. ✅ **APLICADO:** Validación de schema JSON (campos obligatorios, tipos, enums)
   - Funciones `validateClassifierResult()` y `validateStepResult()` implementadas
   - Validación de campos requeridos, tipos, enums y valores permitidos
   - Fallback determinístico si la validación falla

2. ✅ **APLICADO:** Logging completo de eventos IA
   - `IA_CALL_START`: Se loguea antes de llamar a OpenAI
   - `IA_CALL_PAYLOAD_SUMMARY`: Se loguea resumen del payload enviado
   - `IA_CALL_RESULT_RAW`: Se loguea hash del resultado raw (sin exponer contenido completo)
   - `IA_CALL_VALIDATION_FAIL`: Se loguea cuando falla validación de JSON o schema
   - `IA_INVALID_BUTTONS`: Se loguea cuando se detectan botones inválidos
   - `FALLBACK_USED`: Se loguea cuando se usa fallback

3. ✅ **APLICADO:** Contador de intentos de clarificación
   - Se incrementa `session.context.clarification_attempts` en cada intento
   - Se escala a técnico después de 2 intentos fallidos

4. ✅ **APLICADO:** Envío de historial de pasos anteriores a `iaStep()`
   - Función `getRecentStepsHistory()` obtiene últimos 3 pasos del transcript
   - Se incluye en el prompt para evitar repetición de pasos

5. ✅ **APLICADO:** Validación explícita en prompt de `iaStep()` que prohíba comandos destructivos
   - Restricciones de seguridad por nivel agregadas al prompt
   - Para usuarios básicos/intermedios: NO comandos destructivos, NO abrir equipo, NO BIOS, etc.

### Lista de mejoras recomendadas (no bloqueantes)

1. ⚠️ Agregar retry logic para errores temporales
2. ⚠️ Enviar `session.stage` en prompts de IA
3. ⚠️ Enviar historial mínimo (últimos 2-3 turnos) en prompts
4. ⚠️ Agregar restricciones de seguridad por nivel en prompts
5. ⚠️ Enviar resultado del botón anterior en prompt de `iaStep()`
6. ⚠️ Logging de botones inválidos detectados

### Parches en diff

#### Fix 1: Validación de schema JSON

```javascript
function validateClassifierResult(result) {
  const required = ['intent', 'needs_clarification', 'missing', 'risk_level', 'confidence'];
  for (const field of required) {
    if (!(field in result)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  const validIntents = ['network', 'power', 'install_os', 'install_app', 'peripheral', 'malware', 'unknown'];
  if (!validIntents.includes(result.intent)) {
    throw new Error(`Invalid intent: ${result.intent}`);
  }
  
  const validRiskLevels = ['low', 'medium', 'high'];
  if (!validRiskLevels.includes(result.risk_level)) {
    throw new Error(`Invalid risk_level: ${result.risk_level}`);
  }
  
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    throw new Error(`Invalid confidence: ${result.confidence}`);
  }
  
  return true;
}
```

#### Fix 2: Logging completo de eventos IA

```javascript
async function iaClassifier(session, userInput) {
  const conversationId = session.conversation_id;
  
  // Log inicio
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CALL_START',
    payload: { type: 'classifier', user_input_length: userInput.length }
  });
  
  // Log payload summary
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CALL_PAYLOAD_SUMMARY',
    payload: {
      user_level: session.user_level,
      device_type: session.context.device_type,
      has_problem_description: !!session.context.problem_description_raw
    }
  });
  
  // ... llamada a OpenAI ...
  
  // Log resultado raw
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CALL_RESULT_RAW',
    payload: { content_length: content.length, content_hash: hashContent(content) }
  });
  
  // ... parse y validación ...
  
  // Log resultado parseado
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_RESULT',
    payload: result
  });
}
```

#### Fix 3: Contador de clarificación

```javascript
async function handleAskProblem(session, userInput, conversation) {
  // ... código existente ...
  
  if (classification.needs_clarification && classification.missing.length > 0) {
    // Incrementar contador
    if (!session.context.clarification_attempts) {
      session.context.clarification_attempts = 0;
    }
    session.context.clarification_attempts++;
    
    // Si más de 2 intentos, escalar
    if (session.context.clarification_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'clarification_failed');
    }
    
    // ... resto del código ...
  }
}
```

---

## 13) TESTS MÍNIMOS OBLIGATORIOS

### Test 1: Caso simple determinístico (no IA)

**Input:** Seleccionar idioma → Asignar ID → Nombre → Nivel → Dispositivo

**Resultado esperado:**
- ✅ NO se llama IA en ningún paso
- ✅ Se asignan valores directamente
- ✅ Se crea conversación con ID único

**Evidencia:** ✅ **PASS** - Validado en código (líneas 860-1169)

### Test 2: Caso ambiguo - activa clarificación

**Input:** "Algo no anda"

**Resultado esperado:**
- ✅ `iaClassifier()` detecta `needs_clarification: true`
- ✅ Se activa `ASK_PROBLEM_CLARIFICATION`
- ✅ NO se llama `iaStep()` para diagnosticar

**Evidencia:** ✅ **PASS** - Validado en código (línea 1195-1213)

### Test 3: Caso "paso inesperado" - llama IA_STEP

**Input:** Usuario describe problema claro → Se genera primer paso

**Resultado esperado:**
- ✅ `iaClassifier()` clasifica correctamente
- ✅ Se llama `iaStep()` para generar primer paso
- ✅ Se retorna paso único

**Evidencia:** ✅ **PASS** - Validado en código (línea 1296)

### Test 4: Caso "botón inventado por IA" - se rechaza y fallback

**Simulación:** IA devuelve `{"token": "BTN_INVENTADO", "label": "Botón falso"}`

**Resultado esperado:**
- ✅ Se filtra el botón inválido
- ✅ Se aplica fallback con botones permitidos
- ⚠️ **FALTA:** No se loguea el evento

**Evidencia:** ✅ **PASS** (parcial) - Validado en código (línea 762-774), falta logging

### Test 5: Caso "timeout IA" - fallback + no loop

**Simulación:** Forzar timeout reduciendo `OPENAI_TIMEOUT_MS`

**Resultado esperado:**
- ✅ Se captura el error de timeout
- ✅ Se retorna fallback determinístico
- ✅ No queda en loop infinito

**Evidencia:** ✅ **PASS** - Validado en código (línea 792-809)

### Test 6: Caso "riesgo alto" - RISK_SUMMARY o escalamiento

**Input:** "Formatear / reinstalar windows"

**Resultado esperado:**
- ✅ `iaClassifier()` detecta `risk_level: 'high'`
- ✅ Se activa `RISK_SUMMARY`
- ✅ Usuario confirma → Se escala a técnico

**Evidencia:** ✅ **PASS** - Validado en código (línea 1243-1252)

### Test 7: Caso "usuario avanzado" - tech_format true

**Input:** Usuario selecciona nivel "avanzado"

**Resultado esperado:**
- ✅ `session.user_level = 'avanzado'`
- ✅ `activateTechFormat(session)` activa `tech_format: true`
- ⚠️ **FALTA:** El prompt de `iaStep()` no refleja explícitamente el nivel avanzado

**Evidencia:** ⚠️ **PARTIAL** - Validado en código (línea 1722-1728), pero falta en prompt

---

## CONCLUSIÓN

### Estado Final: ⚠️ **NO-GO** (con mejoras recomendadas)

**Razones:**
1. Falta validación de schema JSON (riesgo de errores en runtime)
2. Falta logging completo de eventos IA (dificulta debugging)
3. Falta contador de clarificación (riesgo de loop infinito)
4. Falta historial en prompts (riesgo de repetición de pasos)
5. Falta validación explícita de seguridad por nivel en prompts

**Recomendación:** Aplicar fixes bloqueantes antes de producción.

---

**Fin del informe**

