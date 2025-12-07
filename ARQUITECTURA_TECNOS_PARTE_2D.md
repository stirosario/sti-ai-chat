# Ecosistema Tecnos / STI – Mapa de Arquitectura (PARTE 2D)

**Fecha:** 6 de diciembre de 2025  
**Complemento de:** ARQUITECTURA_TECNOS_PARTE_1.md, ARQUITECTURA_TECNOS_PARTE_2A.md, ARQUITECTURA_TECNOS_PARTE_2B.md, ARQUITECTURA_TECNOS_PARTE_2C.md  
**Enfoque:** Fallbacks y Manejo de Errores

---

## 7. Fallbacks y Manejo de Errores

### 7.1 Fallback Genérico de Intención

**Archivo:** `src/core/intentEngine.js`  
**Función:** `fallbackIntentAnalysis(userMessage)`  
**Ubicación:** Líneas 506-560

**Condiciones que lo activan:**
- OpenAI no está disponible (`!openai`)
- OpenAI devuelve error o timeout
- JSON de respuesta es inválido

**Cómo funciona:**
- Usa regex para detectar patrones de problemas técnicos: `/no\s+(prende|enciende|funciona)/i`
- Detecta instalaciones: `/instalar|install|setup|configurar/i`
- Detecta how-to: `/cómo|how\s+to|ayuda/i`
- Retorna `INTENT_TYPES.UNCLEAR` si no match con confidence 0.3

**Ejemplo:**
```javascript
// Usuario: "Mi PC no enciende"
// Fallback detecta: TECHNICAL_PROBLEM (confidence 0.7)

// Usuario: "Quiero instalar Chrome"
// Fallback detecta: INSTALLATION_HELP (confidence 0.7)
```

---

### 7.2 Función `handleGuidingInstallationOSReply`

**Archivo:** `server.js`  
**Función:** `handleGuidingInstallationOSReply(session, userMessage, activeIntent, locale)`  
**Ubicación:** Líneas 909-965

**Propósito:**
- Maneja respuestas de usuario cuando especifica sistema operativo para instalación
- Evita confusión cuando usuario responde "w10", "w11", etc.

**Cómo funciona (bullets):**
- Detecta todas las variantes de OS con regex case-insensitive:
  - Windows: `/(windows\s*11|win\s*11|w11)/i`, `/(windows\s*10|win\s*10|w10)/i`
  - macOS: `/mac\s*os|macos|\bmac\b/i`
  - Linux: `/linux|ubuntu|debian/i`
- Si detecta OS válido:
  - Guarda en `session.operatingSystem`
  - Extrae software de `activeIntent.software` o `session.problem`
  - Genera guía de instalación con pasos numerados
  - Retorna con botones "Funcionó ✔️" / "Necesito ayuda"
- Si NO detecta OS:
  - Pide aclaración específica (NO usa mensaje genérico)
  - Retorna pregunta: "¿Qué sistema operativo estás usando?"

---

### 7.3 Prevención de Errores con w10/w11

**Problema original:**
```javascript
// ❌ ANTES: Bug documentado en ARQUITECTURA_TECNOS_PARTE_1.md
// Usuario: "w10"
// Bot: "No entiendo qué necesitás" (mensaje genérico)
```

**Solución implementada:**

**1. Regex tolerante (líneas 918-927):**
```javascript
if (/(windows\s*10|win\s*10|w10|win10)/i.test(userMessage)) {
  detectedOS = 'Windows 10';
}
```
- Acepta: "w10", "W10", "win 10", "windows 10", "win10"
- Sin espacios requeridos entre "w" y "10"

**2. No recalcular intent (línea 7234):**
```javascript
const handled = handleGuidingInstallationOSReply(session, t, session.activeIntent, locale);
if (handled) {
  // ✅ Usar activeIntent existente
  // NO llamar a analyzeIntent("w10") que daría UNCLEAR
}
```

**3. Mantener contexto:**
- `session.activeIntent` persiste el tipo original (`INSTALLATION_HELP`)
- Solo se actualiza `session.operatingSystem` con el OS detectado

---

### 7.4 Fallback cuando OpenAI Falla

**Escenario 1: Timeout**

**Ubicación:** `server.js` líneas 225-230

```javascript
async function analyzeUserMessage(text, session, imageUrls = []) {
  if (!openai || !SMART_MODE_ENABLED) {
    return { analyzed: false, fallback: true };
  }
  // ...
}
```

**Acción:**
- Retorna `{ analyzed: false, fallback: true }`
- Sistema usa `fallbackIntentAnalysis()` con regex

---

**Escenario 2: JSON Inválido**

**Ubicación:** `src/core/intentEngine.js` líneas 170-185

```javascript
try {
  const raw = response.choices[0].message.content;
  const cleaned = raw.trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '');
  
  parsed = JSON.parse(cleaned);
  
  // Validar estructura
  if (!parsed.intent || typeof parsed.confidence !== 'number') {
    throw new Error('JSON inválido: falta campo requerido');
  }
  
} catch (parseErr) {
  console.error('[IntentEngine] ❌ Error parseando JSON:', parseErr.message);
  return fallbackIntentAnalysis(userMessage);
}
```

**Acción:**
- Limpia markdown fences (```json)
- Valida campos requeridos (`intent`, `confidence`)
- Si falla: usa `fallbackIntentAnalysis()`

---

**Escenario 3: Análisis de Imagen Falla**

**Ubicación:** `server.js` líneas 390-400

```javascript
} catch (visionErr) {
  console.error('[VISION] ❌ Error analyzing image:', visionErr.message);
  imageContext = `\n\n[Usuario adjuntó ${savedImageUrls.length} imagen(es) del problema]`;
}
```

**Acción:**
- Log del error
- Continúa con análisis de texto sin imagen
- Agrega nota al contexto: "[Usuario adjuntó X imagen(es)]"

---

### 7.5 Fallback cuando Falta Información en Sesión

**Caso 1: Falta `session.problem`**

**Ubicación:** `server.js` línea 6695

```javascript
if (!session.problem || String(session.problem || '').trim() === '') {
  session.stage = STATES.ASK_PROBLEM;
  const reply = isEn
    ? `Tell me, what problem does it have?`
    : `Contame, ¿qué problema presenta?`;
  return res.json({ reply, stage: session.stage });
}
```

**Acción:**
- Transiciona a `ASK_PROBLEM`
- Pregunta explícitamente por el problema

---

**Caso 2: Falta `session.device`**

**Ubicación:** `server.js` líneas 6480-6520

```javascript
if (!session.device) {
  session.stage = STATES.ASK_DEVICE;
  const reply = isEn
    ? `What device are we working with?`
    : `¿Con qué dispositivo estamos trabajando?`;
  const options = buildUiButtonsFromTokens([
    'BTN_DEV_PC_DESKTOP',
    'BTN_DEV_NOTEBOOK',
    'BTN_DEV_PC_ALLINONE'
  ], locale);
  return res.json({ reply, options, stage: session.stage });
}
```

**Acción:**
- Transiciona a `ASK_DEVICE`
- Muestra botones de selección

---

**Caso 3: Falta `session.tests.basic` antes de ADVANCED**

**Ubicación:** `server.js` líneas 6045-6050

```javascript
if (!session.tests || !session.tests.basic || session.tests.basic.length === 0) {
  console.log('[ASK_PROBLEM → ADVANCED] No hay pasos básicos aún, generando primero...');
  return await generateAndShowSteps(session, sid, res);
}
```

**Acción:**
- Genera pasos básicos primero con `generateAndShowSteps()`
- Luego permite acceder a avanzados

---

**Caso 4: No hay nombre (session.userName)**

**Ubicación:** `server.js` líneas 5945-5960 (fallback final)

```javascript
// Fallback final por seguridad
const fallbackReply = isEn
  ? `What's your name? (or click "Prefer not to say" if you'd rather not)`
  : `¿Cómo te llamás? (o tocá "Prefiero no decirlo" si preferís no compartirlo)`;

const fallbackOpts = buildUiButtonsFromTokens(['BTN_SKIP_NAME'], locale);
session.transcript.push({ who: 'bot', text: fallbackReply, ts: nowIso() });
await saveSessionAndTranscript(sid, session);
return res.json(withOptions({ ok: true, reply: fallbackReply, stage: session.stage, options: fallbackOpts }));
```

**Acción:**
- Muestra mensaje con botón "Prefiero no decirlo"
- Permite continuar sin nombre

---

### 7.6 Pasos Diagnósticos cuando OpenAI Falla

**Ubicación:** `server.js` líneas 4430-4450

```javascript
try {
  aiSteps = await aiQuickTests(
    problemWithContext, 
    device || '', 
    locale, 
    []
  );
} catch (e) {
  console.error('[generateAndShowSteps] Error con OpenAI:', e.message);
  aiSteps = [];
}

if (!Array.isArray(aiSteps) || aiSteps.length === 0) {
  // Usar pasos hardcoded
  if (isEn) {
    steps = [
      'Complete shutdown\n\nUnplug the device from the wall...',
      'Check connections\n\nPower cable firmly connected...',
      'If nothing changes\n\nContact a technician...'
    ];
  } else {
    steps = [
      'Apagado completo\n\nDesenchufá el equipo de la pared...',
      'Revisá las conexiones\n\nCable de corriente bien firme...',
      'Si nada cambia\n\nContactá a un técnico...'
    ];
  }
}
```

**Acción:**
- Intenta generar con OpenAI (`aiQuickTests`)
- Si falla: usa pasos predefinidos básicos (apagar, revisar conexiones)
- Garantiza que siempre hay pasos disponibles

---

### 7.7 Playbooks Locales (Fallback por Dispositivo)

**Ubicación:** `server.js` líneas 4395-4405

```javascript
const playbookForDevice = device && issueKey && DEVICE_PLAYBOOKS?.[device]?.[issueKey];

if (!isEn && playbookForDevice && Array.isArray(playbookForDevice.es) && playbookForDevice.es.length > 0) {
  steps = playbookForDevice.es.slice(0, 4);
} else if (hasConfiguredSteps) {
  steps = CHAT.nlp.advanced_steps[issueKey].slice(0, 4);
} else {
  // Llamar a OpenAI
  aiSteps = await aiQuickTests(...);
}
```

**Estrategia en cascada:**
1. Buscar playbook local para dispositivo específico (ej: `streaming_no_internet`)
2. Buscar pasos configurados en `CHAT.nlp.advanced_steps`
3. Llamar a OpenAI con `aiQuickTests()`
4. Si todo falla: usar pasos hardcoded genéricos

---

### 7.8 Validación de Nombres

**Ubicación:** `server.js` líneas 1361-1365

```javascript
if (!openai) {
  // Fallback sin OpenAI
  return { 
    isValid: true, 
    confidence: 0.8, 
    reason: 'fallback_accepted' 
  };
}
```

**Acción:**
- Si OpenAI no disponible: acepta cualquier nombre con confidence 0.8
- Previene bloqueo del flujo por validación estricta

---

## 8. Resumen de Estrategia de Fallbacks

### Jerarquía de Fallbacks

```
1. ✅ OpenAI API disponible y responde
   └─ Usar análisis completo con IA

2. ⚠️ OpenAI timeout o error
   └─ fallbackIntentAnalysis() con regex
      └─ Retorna intent con confidence 0.6-0.7

3. ⚠️ JSON inválido de OpenAI
   └─ Limpiar markdown, reintentar parse
      └─ Si falla: fallbackIntentAnalysis()

4. ⚠️ Falta información en sesión
   └─ Preguntar explícitamente (ASK_DEVICE, ASK_PROBLEM)
      └─ Mostrar botones si aplica

5. ⚠️ No hay pasos diagnósticos
   └─ Playbooks locales
      └─ Pasos hardcoded genéricos

6. ⚠️ Validación de nombre falla
   └─ Aceptar sin validación (confidence 0.8)
```

### Principio General

**"El bot SIEMPRE debe responder"**
- Nunca dejar al usuario sin respuesta
- Degradar gracefully de IA a regex a hardcoded
- Priorizar experiencia del usuario sobre precisión técnica

---

**PARTE 2D COMPLETA**
