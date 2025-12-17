# Ecosistema Tecnos / STI – Mapa de Arquitectura (PARTE 2C)

**Fecha:** 6 de diciembre de 2025  
**Complemento de:** ARQUITECTURA_TECNOS_PARTE_1.md, ARQUITECTURA_TECNOS_PARTE_2A.md, ARQUITECTURA_TECNOS_PARTE_2B.md  
**Enfoque:** Detalles Adicionales de la Máquina de Estados

---

## 7. Relación entre Estados y Componentes del Sistema

### 7.1 Gestión de `session.stage`

**Propósito:**
- `session.stage` es la variable central que determina en qué punto del flujo está el usuario
- Se actualiza en cada transición de estado
- Se guarda en Redis (o memoria) con `saveSessionAndTranscript(sid, session)`
- Se usa para determinar qué handler ejecutar en el próximo mensaje

**Persistencia:**
```javascript
session.stage = STATES.BASIC_TESTS;
await saveSessionAndTranscript(sid, session);
```

**Lectura en próximo mensaje:**
```javascript
if (session.stage === STATES.ASK_PROBLEM) {
  // Ejecutar lógica específica...
}
```

---

### 7.2 Uso de `activeIntent`

**Estados que lo utilizan:**
- `CLASSIFY_NEED` - Lo crea inicialmente
- `ASK_PROBLEM` - Lo lee para contexto
- `BASIC_TESTS` - Lo usa para generar pasos relevantes
- `ADVANCED_TESTS` - Lo consulta para filtrar pasos

**Estructura:**
```javascript
session.activeIntent = {
  type: 'installation_help',           // o 'technical_problem', etc.
  originalMessage: 'Quiero instalar AnyDesk',
  software: 'AnyDesk',
  confidence: 0.95,
  resolved: false,
  detectedAt: '2025-12-06T10:30:00Z'
};
```

**Propósito:**
- Mantener contexto de la intención original durante múltiples turnos
- Evitar recalcular intención en respuestas auxiliares (OS, marca, modelo)
- Determinar qué tipo de respuesta generar

**Diferencia con `session.stage`:**
- `stage` = dónde está en el flujo (ASK_NAME, ASK_PROBLEM, etc.)
- `activeIntent` = qué quiere hacer el usuario (instalar, solucionar, consultar)

---

### 7.3 Llamadas a OpenAI vs Reglas Locales

| Estado | OpenAI | Reglas Locales | Notas |
|--------|--------|----------------|-------|
| CLASSIFY_NEED | ✅ Sí | ✅ Fallback | `analyzeIntent()` usa OpenAI; si falla, usa regex |
| ASK_DEVICE | ❌ No | ✅ Sí | Solo lógica de botones y mapeo |
| ASK_PROBLEM | ✅ Sí | ✅ Sí | OpenAI Vision si hay imagen; regex para botones |
| DETECT_DEVICE | ❌ No | ✅ Sí | Regex patterns en `deviceDetection.js` |
| ASK_HOWTO_DETAILS | ✅ Sí | ✅ Sí | Regex para parsear OS; OpenAI genera guía |
| GENERATE_HOWTO | ✅ Sí | ❌ No | Llama OpenAI para generar pasos |
| BASIC_TESTS | ✅ Sí | ✅ Fallback | `aiQuickTests()` con OpenAI; playbooks locales si falla |
| ADVANCED_TESTS | ✅ Sí | ✅ Fallback | Similar a BASIC_TESTS pero más técnicos |
| ESCALATE | ❌ No | ✅ Sí | Solo lógica de decisión (más pruebas o ticket) |
| CREATE_TICKET | ❌ No | ✅ Sí | Generación de ID, guardado en disco, construcción de mensaje |
| TICKET_SENT | ❌ No | ✅ Sí | Solo confirmación y finalización |
| ENDED | ❌ No | ✅ Sí | Solo mensaje de despedida |

**Estrategia de fallback:**
- Si OpenAI falla o no está disponible, usar reglas locales (regex, playbooks, mensajes predefinidos)
- Garantiza que el bot siempre responde, incluso sin API

---

### 7.4 Actualización de `session.stage`

**Ubicaciones críticas donde se modifica:**

```javascript
// Ejemplo 1: Transición simple
session.stage = STATES.ASK_PROBLEM;
await saveSessionAndTranscript(sid, session);

// Ejemplo 2: Transición con validación
if (session.problem && session.device) {
  session.stage = STATES.BASIC_TESTS;
} else {
  session.stage = STATES.ASK_DEVICE;
}
await saveSessionAndTranscript(sid, session);

// Ejemplo 3: Transición condicional basada en respuesta
if (userSaidYes) {
  session.stage = STATES.ENDED;
} else {
  session.stage = STATES.ADVANCED_TESTS;
}
await saveSessionAndTranscript(sid, session);
```

**Regla crítica:**
- **Siempre** llamar `await saveSessionAndTranscript(sid, session)` después de modificar `session.stage`
- Garantiza persistencia entre mensajes

---

## 8. Tabla Resumida de Estados

| Estado | Archivo Principal | Función Handler | Próximos Estados Posibles |
|--------|-------------------|-----------------|---------------------------|
| **CLASSIFY_NEED** | `intelligentChatHandler.js` | `handleIntelligentChat()` | ASK_PROBLEM, ASK_HOWTO_DETAILS |
| **ASK_DEVICE** | `server.js` (6700+) | Handler inline en `/api/chat` | ASK_PROBLEM, BASIC_TESTS |
| **ASK_PROBLEM** | `server.js` (6011+) | Handler inline en `/api/chat` | BASIC_TESTS, ASK_DEVICE, ADVANCED_TESTS, ESCALATE |
| **DETECT_DEVICE** | `deviceDetection.js` | `detectAmbiguousDevice()` | ASK_DEVICE, (continúa flujo) |
| **ASK_HOWTO_DETAILS** | `server.js` (6555+) | Handler inline en `/api/chat` | BASIC_TESTS, ENDED |
| **GENERATE_HOWTO** | `server.js` (6590+) | Lógica dentro de ASK_HOWTO_DETAILS | BASIC_TESTS |
| **BASIC_TESTS** | `server.js` (4369+) | `generateAndShowSteps()` | ENDED, ADVANCED_TESTS, ESCALATE |
| **ADVANCED_TESTS** | `server.js` (6035+, 7078+) | Handler inline en `/api/chat` | ENDED, ESCALATE, CREATE_TICKET |
| **ESCALATE** | `server.js` (7078+) | Handler inline en `/api/chat` | ADVANCED_TESTS, CREATE_TICKET |
| **CREATE_TICKET** | `server.js` (4130+) | `createTicketAndRespond()` | TICKET_SENT |
| **TICKET_SENT** | `server.js` (4250+) | Dentro de `createTicketAndRespond()` | ENDED |
| **ENDED** | `server.js` (múltiples) | Handler inline en múltiples lugares | (ninguno - conversación terminada) |

---

## 9. Flujo de Actualización de Estados

### 9.1 Patrón Típico

```javascript
// 1. Recibir mensaje del usuario
const { text, buttonToken } = req.body;

// 2. Recuperar sesión
const session = await getSession(sid);

// 3. Verificar estado actual
if (session.stage === STATES.ASK_PROBLEM) {
  
  // 4. Procesar según lógica del estado
  session.problem = text;
  
  // 5. Decidir próximo estado
  if (needsDeviceClarification) {
    session.stage = STATES.ASK_DEVICE;
  } else {
    session.stage = STATES.BASIC_TESTS;
  }
  
  // 6. Guardar cambios
  await saveSessionAndTranscript(sid, session);
  
  // 7. Generar respuesta
  return res.json({ reply, options, stage: session.stage });
}
```

### 9.2 Estados que NO Persisten

**Temporales (usados como flags, no como stages):**
- `DETECT_DEVICE` - Se usa para marcar detección ambigua, pero no se guarda como stage
- `GENERATE_HOWTO` - Es parte del procesamiento de ASK_HOWTO_DETAILS

**Estados finales:**
- `ENDED` - Se guarda pero no hay transiciones posteriores
- `TICKET_SENT` - Generalmente transiciona inmediatamente a ENDED

---

## 10. Interacción entre `stage` y `activeIntent`

### 10.1 Ciclo de Vida del `activeIntent`

```
1. CLASSIFY_NEED:
   - Crea activeIntent con tipo detectado
   - session.activeIntent = { type: 'installation_help', ... }

2. ASK_PROBLEM / ASK_HOWTO_DETAILS:
   - Lee activeIntent para contexto
   - No recalcula si es respuesta auxiliar (OS, marca)

3. BASIC_TESTS / ADVANCED_TESTS:
   - Usa activeIntent.type para generar pasos relevantes
   - Pasa info a OpenAI en el prompt

4. ENDED:
   - Marca activeIntent.resolved = true
   - Limpia para próxima conversación
```

### 10.2 Respuestas Auxiliares

**Problema:** Usuario dice "w10" después de pedir instalar AnyDesk

**Sin activeIntent:**
```javascript
// ❌ MAL: Recalcularía intención → "unclear"
const intent = await analyzeIntent("w10");
// Resultado: "No entiendo qué querés hacer"
```

**Con activeIntent:**
```javascript
// ✅ BIEN: Detecta que es respuesta auxiliar
if (isAuxiliaryResponse(text) && session.activeIntent) {
  // No recalcular intent
  // Usar activeIntent existente
  const os = detectOS(text); // "w10" → "Windows 10"
  // Continuar con activeIntent original
}
```

---

## 11. Persistencia y Recuperación

### 11.1 Qué se Guarda en Sesión

```javascript
{
  id: 'web-abc123',
  stage: 'BASIC_TESTS',                    // ← Estado actual
  activeIntent: {                          // ← Intención activa
    type: 'technical_problem',
    originalMessage: 'Mi PC no enciende',
    confidence: 0.92,
    resolved: false
  },
  userName: 'Lucas',
  userLocale: 'es-AR',
  device: 'notebook',
  deviceBrand: 'HP',
  operatingSystem: 'Windows 10',
  problem: 'No enciende, luz de carga parpadea',
  tests: {
    basic: ['Paso 1...', 'Paso 2...'],
    advanced: []
  },
  transcript: [
    { who: 'user', text: 'Hola', ts: '...' },
    { who: 'bot', text: '¡Hola! ¿Cómo te llamás?', ts: '...' }
  ],
  stepProgress: {
    'basic_1': 'done',
    'basic_2': 'pending'
  }
}
```

### 11.2 Recuperación en Próximo Mensaje

```javascript
// Usuario refresca página o envía nuevo mensaje
const session = await getSession(sid);

// Sistema recupera:
console.log(session.stage);        // 'BASIC_TESTS'
console.log(session.activeIntent); // { type: 'technical_problem', ... }

// Y continúa desde donde quedó
if (session.stage === STATES.BASIC_TESTS) {
  // Mostrar pasos guardados en session.tests.basic
}
```

---

## 12. Validación de Transiciones

### 12.1 Transiciones Válidas

**Desde `ASK_PROBLEM`:**
- ✅ `BASIC_TESTS` (si tiene problema y dispositivo)
- ✅ `ASK_DEVICE` (si dispositivo es ambiguo)
- ✅ `ADVANCED_TESTS` (si usuario clickea botón)
- ✅ `ESCALATE` (si usuario pide técnico)

**Desde `BASIC_TESTS`:**
- ✅ `ENDED` (si funcionó)
- ✅ `ADVANCED_TESTS` (si persiste)
- ✅ `ESCALATE` (si usuario pide técnico)

**Desde `ESCALATE`:**
- ✅ `ADVANCED_TESTS` (si elige más pruebas)
- ✅ `CREATE_TICKET` (si elige técnico)

### 12.2 Transiciones Inválidas (Prevenidas)

**Validaciones en código:**

```javascript
// Ejemplo: No permitir ENDED antes de intentar pasos
if (session.stage === STATES.ASK_PROBLEM && buttonToken === 'BTN_CLOSE') {
  // ❌ Prevenir cierre prematuro
  reply = '¿Seguro que querés cerrar sin intentar solucionar el problema?';
  options = ['Sí, cerrar', 'No, probar pasos'];
  // No cambiar stage todavía
}

// Ejemplo: No permitir ADVANCED sin BASIC primero
if (buttonToken === 'BTN_ADVANCED_TESTS' && 
    (!session.tests || !session.tests.basic || session.tests.basic.length === 0)) {
  // ❌ Generar básicos primero
  console.log('[HANDLER] No hay pasos básicos - generando primero');
  return await generateAndShowSteps(session, sid, res);
}
```

---

## 13. Resumen de Dependencias

```
CLASSIFY_NEED
    ↓
    ├─ Requiere: userMessage, conversationContext
    ├─ Crea: session.activeIntent
    ├─ Llama: analyzeIntent() → OpenAI
    └─ Transiciona según: intentAnalysis.intent

ASK_PROBLEM
    ↓
    ├─ Requiere: session.activeIntent (opcional)
    ├─ Crea: session.problem, session.device (si detecta)
    ├─ Llama: OpenAI Vision si hay imagen
    └─ Transiciona según: device detectado o ambiguo

BASIC_TESTS
    ↓
    ├─ Requiere: session.problem, session.device
    ├─ Crea: session.tests.basic
    ├─ Llama: aiQuickTests() → OpenAI
    └─ Transiciona según: respuesta usuario (funcionó/no)

ADVANCED_TESTS
    ↓
    ├─ Requiere: session.tests.basic (para evitar duplicados)
    ├─ Crea: session.tests.advanced
    ├─ Llama: aiQuickTests() → OpenAI con basicSteps
    └─ Transiciona según: respuesta usuario

CREATE_TICKET
    ↓
    ├─ Requiere: session.transcript, session.problem
    ├─ Crea: Ticket ID, archivo .txt y .json
    ├─ Llama: maskPII(), buildWhatsAppUrl()
    └─ Transiciona siempre: TICKET_SENT → ENDED
```

---

**PARTE 2C COMPLETA**
