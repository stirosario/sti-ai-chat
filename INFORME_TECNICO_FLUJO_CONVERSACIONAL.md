# 📋 INFORME TÉCNICO: FLUJO CONVERSACIONAL
## Sistema STI Tecnos - Chat Asistente Técnico

**Versión:** 2.0.0  
**Fecha:** 2025-12-18  
**Archivo:** `server.js`

---

## 1. ARQUITECTURA GENERAL

### 1.1 Modelo de Estado (State Machine)

El sistema implementa una **máquina de estados finita (FSM)** donde cada conversación transita entre diferentes **stages** (estados) según el flujo de interacción con el usuario.

**Características principales:**
- **Estado persistente:** Cada conversación mantiene su estado en memoria (`sessions`) y en disco (`data/conversations/`)
- **ID único:** Cada conversación tiene un `conversation_id` en formato `AA0000-ZZ9999` (2 letras + 4 dígitos)
- **Locking atómico:** Sistema de locks por conversación para evitar condiciones de carrera
- **Idempotencia:** Soporte para `request_id` para evitar procesamiento duplicado

### 1.2 Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  POST /api/chat                                       │  │
│  │  - Validación de request                              │  │
│  │  - Rate limiting                                      │  │
│  │  - Generación de boot_id                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  handleChatMessage()                                  │  │
│  │  - Carga de sesión y conversación                     │  │
│  │  - Validación de estado                               │  │
│  │  - Locking                                            │  │
│  │  - Routing por stage                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Handlers Específicos por Stage                      │  │
│  │  - handleAskConsent()                                 │  │
│  │  - handleAskLanguage()                                │  │
│  │  - handleAskName()                                    │  │
│  │  - handleDiagnosticStep()                            │  │
│  │  - ...                                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Persistencia                                         │  │
│  │  - saveConversation()                                 │  │
│  │  - appendToTranscript()                              │  │
│  │  - Trace logging                                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. FLUJO DE PROCESAMIENTO DE MENSAJES

### 2.1 Entrada de Request (`POST /api/chat`)

**Ubicación:** Líneas 4523-4800

**Proceso:**

1. **Validación inicial:**
   ```javascript
   - validateChatRequest(req.body)
   - Verifica: sessionId, message/imageBase64/action
   - Soporta requests de botones (action='button')
   ```

2. **Extracción de datos:**
   ```javascript
   const { sessionId, message, imageBase64, action, value, label, request_id } = req.body;
   ```

3. **Conversión de botones:**
   ```javascript
   if (action === 'button' && value && !message) {
     effectiveMessage = value; // Convierte botón a mensaje
   }
   ```

4. **Llamada a handler principal:**
   ```javascript
   const response = await handleChatMessage(sessionId, effectiveMessage, imageBase64, requestId, bootId);
   ```

### 2.2 Función Principal: `handleChatMessage()`

**Ubicación:** Líneas 3675-4443

**Flujo detallado:**

#### Fase 1: Inicialización y Validación (Líneas 3676-3800)

```javascript
1. Obtener sesión: getSession(sessionId)
2. Cargar conversación: loadConversation(conversation_id)
3. Crear contexto de trace con boot_id
4. Validar coherencia de estado: validateConversationState()
5. Validar versión: validateConversationVersion()
6. Detectar inactividad (>5 min) → ofrecer reanudación
7. Adquirir lock: acquireLock(conversation_id)
```

#### Fase 2: Procesamiento de Imágenes (Líneas 3801-3866)

```javascript
if (imageBase64) {
  1. Validar formato MIME (magic bytes)
  2. Validar tamaño (máx 5MB)
  3. Guardar referencia en transcript
  4. Log de imagen recibida
}
```

#### Fase 3: Deduplicación y Validaciones (Líneas 3868-3931)

```javascript
1. Hash de input para deduplicación
2. Verificar idempotencia por request_id
3. Detectar preguntas fuera de alcance: isOutOfScope()
4. Detectar inputs sin sentido: isNonsensicalInput()
5. Detectar emoción: detectEmotion()
```

#### Fase 4: Handlers Especiales (Líneas 3959-4003)

```javascript
1. EMOTIONAL_RELEASE: Si usuario frustrado
   → handleEmotionalRelease()

2. FREE_QA: Preguntas libres durante diagnóstico
   → handleFreeQA()
   → Resume al stage original si aplica
```

#### Fase 5: Routing por Stage (Líneas 4005-4345)

**Switch principal con 20+ casos:**

```javascript
switch (session.stage) {
  case 'ASK_CONSENT': → handleAskConsent()
  case 'ASK_LANGUAGE': → handleAskLanguage()
  case 'ASK_NAME': → handleAskName()
  case 'ASK_USER_LEVEL': → handleAskUserLevel()
  case 'ASK_DEVICE_CATEGORY': → handleAskDeviceCategory()
  case 'ASK_DEVICE_TYPE_MAIN': → handleAskDeviceType()
  case 'ASK_DEVICE_TYPE_EXTERNAL': → handleAskDeviceType()
  case 'ASK_PROBLEM': → handleAskProblem()
  case 'ASK_PROBLEM_CLARIFICATION': → handleAskProblem()
  case 'ASK_INTERACTION_MODE': → handleAskInteractionMode()
  case 'ASK_LEARNING_DEPTH': → handleAskLearningDepth()
  case 'ASK_EXECUTOR_ROLE': → handleAskExecutorRole()
  case 'DIAGNOSTIC_STEP': → handleDiagnosticStep()
  case 'CONNECTIVITY_FLOW': → handleConnectivityFlow()
  case 'INSTALLATION_STEP': → handleInstallationFlow()
  case 'EMOTIONAL_RELEASE': → Continuar a DIAGNOSTIC_STEP
  case 'GUIDED_STORY': → handleGuidedStory()
  case 'RISK_CONFIRMATION': → Confirmar riesgo
  case 'CONTEXT_RESUME': → Reanudar contexto
  case 'ASK_FEEDBACK': → Procesar feedback
  case 'ENDED': → Solo reinicio explícito
  default: → Reset a ASK_CONSENT
}
```

#### Fase 6: Persistencia y Logging (Líneas 4347-4435)

```javascript
1. Registrar transición de stage: STAGE_CHANGED
2. Guardar respuesta del bot en transcript
3. Guardar botones mostrados
4. Log de respuesta final
5. Guardar conversación: saveConversation()
6. Liberar lock
```

---

## 3. ESTADOS (STAGES) DEL SISTEMA

### 3.1 Estados Principales

| Stage | Handler | Propósito | Transición Siguiente |
|-------|---------|-----------|---------------------|
| `ASK_CONSENT` | `handleAskConsent()` | Aceptación GDPR | `ASK_LANGUAGE` |
| `ASK_LANGUAGE` | `handleAskLanguage()` | Selección idioma | `ASK_NAME` |
| `ASK_NAME` | `handleAskName()` | Nombre del usuario | `ASK_USER_LEVEL` |
| `ASK_USER_LEVEL` | `handleAskUserLevel()` | Nivel técnico | `ASK_DEVICE_CATEGORY` |
| `ASK_DEVICE_CATEGORY` | `handleAskDeviceCategory()` | Categoría dispositivo | `ASK_DEVICE_TYPE_*` |
| `ASK_DEVICE_TYPE_MAIN` | `handleAskDeviceType()` | Tipo dispositivo principal | `ASK_PROBLEM` |
| `ASK_DEVICE_TYPE_EXTERNAL` | `handleAskDeviceType()` | Tipo dispositivo externo | `ASK_PROBLEM` |
| `ASK_PROBLEM` | `handleAskProblem()` | Descripción problema | `ASK_INTERACTION_MODE` o `DIAGNOSTIC_STEP` |
| `ASK_PROBLEM_CLARIFICATION` | `handleAskProblem()` | Aclarar problema | `ASK_PROBLEM` o `DIAGNOSTIC_STEP` |
| `ASK_INTERACTION_MODE` | `handleAskInteractionMode()` | Modo interacción | `ASK_LEARNING_DEPTH` o `DIAGNOSTIC_STEP` |
| `ASK_LEARNING_DEPTH` | `handleAskLearningDepth()` | Profundidad aprendizaje | `DIAGNOSTIC_STEP` |
| `ASK_EXECUTOR_ROLE` | `handleAskExecutorRole()` | Rol ejecutor | `DIAGNOSTIC_STEP` |
| `DIAGNOSTIC_STEP` | `handleDiagnosticStep()` | Pasos diagnóstico | `DIAGNOSTIC_STEP` (iterativo) o `ASK_FEEDBACK` |
| `CONNECTIVITY_FLOW` | `handleConnectivityFlow()` | Flujo conectividad | `DIAGNOSTIC_STEP` |
| `INSTALLATION_STEP` | `handleInstallationFlow()` | Instalación software | `DIAGNOSTIC_STEP` |
| `EMOTIONAL_RELEASE` | `handleEmotionalRelease()` | Liberación emocional | `DIAGNOSTIC_STEP` |
| `GUIDED_STORY` | `handleGuidedStory()` | Historia guiada | `DIAGNOSTIC_STEP` |
| `RISK_CONFIRMATION` | Inline | Confirmar riesgo | `DIAGNOSTIC_STEP` |
| `CONTEXT_RESUME` | Inline | Reanudar contexto | `DIAGNOSTIC_STEP` o `ASK_CONSENT` |
| `ASK_FEEDBACK` | Inline | Feedback final | `ENDED` |
| `ENDED` | Inline | Conversación terminada | Solo reinicio explícito |

### 3.2 Flujo de Transiciones Típico

```
ASK_CONSENT
    ↓
ASK_LANGUAGE
    ↓
ASK_NAME
    ↓
ASK_USER_LEVEL
    ↓
ASK_DEVICE_CATEGORY
    ↓
ASK_DEVICE_TYPE_MAIN/EXTERNAL
    ↓
ASK_PROBLEM
    ↓
ASK_INTERACTION_MODE (opcional)
    ↓
ASK_LEARNING_DEPTH (opcional)
    ↓
ASK_EXECUTOR_ROLE (opcional)
    ↓
DIAGNOSTIC_STEP (iterativo)
    ↓
ASK_FEEDBACK
    ↓
ENDED
```

### 3.3 Flujos Alternativos

**Flujo de Conectividad:**
```
ASK_PROBLEM → CONNECTIVITY_FLOW → DIAGNOSTIC_STEP
```

**Flujo de Instalación:**
```
ASK_PROBLEM → INSTALLATION_STEP → DIAGNOSTIC_STEP
```

**Flujo Emocional:**
```
Cualquier stage → EMOTIONAL_RELEASE → DIAGNOSTIC_STEP
```

**Flujo de Reanudación:**
```
Inactividad >5min → CONTEXT_RESUME → DIAGNOSTIC_STEP o ASK_CONSENT
```

---

## 4. HANDLERS ESPECÍFICOS

### 4.1 `handleAskConsent()` (Líneas 2100-2143)

**Propósito:** Procesar aceptación/rechazo de política de privacidad

**Lógica:**
- Detecta aceptación: "sí", "acepto", "yes", "accept"
- Detecta rechazo: "no", "no acepto", "rechazo"
- Si acepta → `ASK_LANGUAGE`
- Si rechaza → Mensaje explicativo, permanece en `ASK_CONSENT`

### 4.2 `handleAskLanguage()` (Líneas 2144-2303)

**Propósito:** Detectar y establecer idioma de conversación

**Lógica:**
- Detecta español: palabras en español, "español", "spanish"
- Detecta inglés: palabras en inglés, "english", "inglés"
- **Genera `conversation_id` único:** `reserveUniqueConversationId()`
- Crea conversación inicial
- Transición a `ASK_NAME`

**Importante:** Este es el único handler que genera `conversation_id`

### 4.3 `handleAskName()` (Líneas 2304-2351)

**Propósito:** Capturar nombre del usuario

**Lógica:**
- Extrae nombre del input
- Normaliza: `name_norm` (minúsculas, sin acentos)
- Guarda en `session.user.name` y `session.user.name_norm`
- Transición a `ASK_USER_LEVEL`

### 4.4 `handleAskUserLevel()` (Líneas 2352-2401)

**Propósito:** Determinar nivel técnico del usuario

**Opciones:**
- `beginner` / `principiante`
- `intermediate` / `intermedio`
- `advanced` / `avanzado`

**Efecto:**
- Ajusta explicaciones según nivel
- Guarda en `session.context.user_level`
- Transición a `ASK_DEVICE_CATEGORY`

### 4.5 `handleAskDeviceCategory()` (Líneas 2402-2459)

**Propósito:** Categorizar dispositivo (principal o externo)

**Opciones:**
- `main` / `principal`
- `external` / `externo`

**Efecto:**
- Si `main` → `ASK_DEVICE_TYPE_MAIN`
- Si `external` → `ASK_DEVICE_TYPE_EXTERNAL`

### 4.6 `handleAskDeviceType()` (Líneas 2460-2533)

**Propósito:** Identificar tipo específico de dispositivo

**Tipos principales:**
- PC, Notebook, Tablet, Smartphone, etc.

**Tipos externos:**
- Impresora, Router, Monitor, etc.

**Efecto:**
- Guarda en `session.context.device_type`
- Transición a `ASK_PROBLEM`

### 4.7 `handleAskProblem()` (Líneas 2534-2690)

**Propósito:** Capturar descripción del problema técnico

**Lógica:**
- Analiza input con IA: `iaClassifier()`
- Detecta si necesita clarificación
- Detecta flujos especiales:
  - Conectividad → `CONNECTIVITY_FLOW`
  - Instalación → `INSTALLATION_STEP`
- Si problema claro → `ASK_INTERACTION_MODE` o `DIAGNOSTIC_STEP`
- Si necesita clarificación → `ASK_PROBLEM_CLARIFICATION`

**IA involucrada:**
- `iaClassifier()`: Clasifica intención y problema

### 4.8 `handleDiagnosticStep()` (Líneas 3000-3123)

**Propósito:** Generar y ejecutar pasos de diagnóstico iterativos

**Lógica:**
1. Carga historial de pasos anteriores
2. Verifica límites de pasos (básicos ≤5, avanzados >5)
3. Llama a `iaStep()` para generar siguiente paso
4. Valida respuesta de IA
5. Detecta botones especiales:
   - `BTN_BACK`: Volver paso anterior
   - `BTN_SOLVED`: Problema resuelto
   - `BTN_ESCALATE`: Escalar a técnico
6. Guarda paso en transcript
7. Continúa en `DIAGNOSTIC_STEP` o transiciona según resultado

**IA involucrada:**
- `iaStep()`: Genera paso de diagnóstico adaptativo

### 4.9 `handleFreeQA()` (Líneas 2691-2775)

**Propósito:** Permitir preguntas libres durante diagnóstico

**Lógica:**
- Detecta si input es pregunta (no acción de botón)
- Si es pregunta → Responde con IA
- Guarda respuesta en transcript
- **Resume al stage original** después de responder

**IA involucrada:**
- `iaStep()` con contexto de pregunta libre

### 4.10 `handleEmotionalRelease()` (Líneas 3233-3267)

**Propósito:** Manejar frustración del usuario

**Lógica:**
- Detecta emoción: `detectEmotion()` → `'frustrated'`
- Responde con empatía
- Escucha al usuario
- Transición a `DIAGNOSTIC_STEP` para continuar

---

## 5. INTEGRACIÓN CON IA

### 5.1 Clasificador (`iaClassifier()`)

**Ubicación:** Líneas 1221-1527

**Propósito:** Clasificar intención y problema del usuario

**Input:**
- Texto del usuario
- Contexto de sesión
- Historial reciente

**Output:**
```javascript
{
  category: 'main' | 'external',
  device_type: string,
  problem: string,
  needs_clarification: boolean,
  missing: string[],
  confidence: number
}
```

**Modelo:** `OPENAI_MODEL_CLASSIFIER` (default: `gpt-4o-mini`)

### 5.2 Generador de Pasos (`iaStep()`)

**Ubicación:** Líneas 1643-2099

**Propósito:** Generar pasos de diagnóstico adaptativos

**Input:**
- Sesión completa
- Botones permitidos
- Resultado de botón anterior (si aplica)
- Historial de pasos

**Output:**
```javascript
{
  reply: string,
  buttons: Button[],
  stage: string,
  explanation: string,
  step_number: number
}
```

**Modelo:** `OPENAI_MODEL_STEP` (default: `gpt-4o-mini`)

**Características:**
- Evita repetir pasos ya ejecutados
- Adapta explicaciones al nivel del usuario
- Genera botones contextuales
- Respeta límites de pasos básicos/avanzados

---

## 6. PERSISTENCIA Y LOGGING

### 6.1 Estructura de Conversación

**Archivo:** `data/conversations/{conversation_id}.json`

```json
{
  "conversation_id": "AB1234",
  "created_at": "2025-12-18T10:00:00.000Z",
  "updated_at": "2025-12-18T10:30:00.000Z",
  "flow_version": "2.0.0",
  "schema_version": "1.0",
  "status": "active" | "closed",
  "language": "es-AR" | "en-US",
  "transcript": [
    {
      "t": "2025-12-18T10:00:00.000Z",
      "role": "user" | "bot" | "system",
      "type": "text" | "image" | "buttons" | "event",
      "text": "...",
      "buttons": [...],
      "name": "STAGE_CHANGED",
      "payload": {...}
    }
  ],
  "processed_request_ids": ["req-123", ...],
  "feedback": "positive" | "negative"
}
```

### 6.2 Sistema de Trace

**Módulo:** `trace.js`

**Eventos registrados:**
- `REQUEST_START`: Inicio de request
- `USER_INPUT`: Input del usuario
- `IA_CLASSIFIER_CALL`: Llamada a clasificador
- `IA_STEP_RESULT`: Resultado de paso de IA
- `STAGE_TRANSITION`: Transición de stage
- `BUTTON_SELECTION`: Selección de botón
- `RESPONSE`: Respuesta del bot
- `ERROR`: Errores

**Formato de eventos:**
```javascript
{
  timestamp: ISO8601,
  level: 'INFO' | 'ERROR' | 'WARN',
  event_type: string,
  boot_id: string,
  conversation_id: string,
  request_id: string,
  data: {...}
}
```

---

## 7. MECANISMOS DE SEGURIDAD Y VALIDACIÓN

### 7.1 Validaciones de Entrada

**`validateChatRequest()`** (Líneas 735-753):
- `sessionId`: string no vacío
- `message`: string (opcional)
- `imageBase64`: string (opcional)
- `request_id`: string (opcional)
- **Nuevo:** Soporta `action='button'` con `value`

### 7.2 Validaciones de Estado

**`validateConversationState()`** (Líneas 535-560):
- Coherencia entre `session.stage` y `conversation.status`
- Campos requeridos presentes
- Si inválido → Reset a `ASK_CONSENT`

**`validateConversationVersion()`** (Líneas 561-601):
- Verifica `flow_version` y `schema_version`
- Si incompatible → Opción de reinicio

### 7.3 Protección contra Duplicados

**Deduplicación por hash:**
```javascript
const inputHash = hashInput(conversation_id, userInput);
if (recentInputs.has(inputHash)) {
  // Ignorar input duplicado
}
```

**Idempotencia por request_id:**
```javascript
if (processedRequests.includes(requestId)) {
  // Retornar respuesta anterior
}
```

### 7.4 Locking y Concurrencia

**`acquireLock()`** (Líneas 302-329):
- Lock por `conversation_id`
- Evita procesamiento concurrente
- Timeout automático
- Cleanup de locks huérfanos

---

## 8. FLUJOS ESPECIALES

### 8.1 Flujo de Conectividad (`CONNECTIVITY_FLOW`)

**Handler:** `handleConnectivityFlow()` (Líneas 3427-3631)

**Propósito:** Guiar solución de problemas de conectividad

**Características:**
- Pasos específicos para WiFi, Ethernet, Bluetooth
- Validación de conectividad
- Sugerencias de solución

### 8.2 Flujo de Instalación (`INSTALLATION_STEP`)

**Handler:** `handleInstallationFlow()` (Líneas 3632-3674)

**Propósito:** Guiar instalación de software

**Características:**
- Pasos de instalación paso a paso
- Validación de requisitos
- Manejo de errores comunes

### 8.3 Reanudación de Contexto (`CONTEXT_RESUME`)

**Handler:** Inline (Líneas 4258-4292)

**Propósito:** Reanudar conversación después de inactividad

**Lógica:**
- Detecta inactividad >5 minutos
- Ofrece reanudar o reiniciar
- Si reanuda → Continúa desde `last_known_step`
- Si reinicia → `ASK_CONSENT`

### 8.4 Escalamiento a Técnico

**Función:** `escalateToTechnician()` (Líneas 2802-2944)

**Propósito:** Conectar usuario con técnico humano

**Características:**
- Genera ticket
- Prepara historial completo
- Opción WhatsApp
- Guarda motivo de escalamiento

---

## 9. BOTONES Y UI

### 9.1 Sistema de Botones

**Definición:** `ALLOWED_BUTTONS_BY_ASK` (Líneas 957-1102)

**Estructura:**
```javascript
{
  ASK_CONSENT: [...],
  ASK_LANGUAGE: [...],
  ASK_NAME: [...],
  ASK_USER_LEVEL: [...],
  ASK_DEVICE_CATEGORY: [...],
  ASK_DEVICE_TYPE_MAIN: [...],
  ASK_DEVICE_TYPE_EXTERNAL: [...],
  ASK_PROBLEM: [...],
  ASK_INTERACTION_MODE: [...],
  ASK_RESOLUTION_STATUS: [...],
  ASK_FEEDBACK: [...]
}
```

**Formato de botón:**
```javascript
{
  label: string,      // Texto visible
  value: string,     // Valor enviado
  token: string,     // Token interno
  order?: number     // Orden de visualización
}
```

### 9.2 Validación de Botones

**`validateButtonsForFrontend()`** (Líneas 818-830):
- Verifica estructura válida
- Valida tipos de datos
- Valida orden (1-4)

**`validateReplyButtonsCoherence()`** (Líneas 509-534):
- Coherencia entre reply y botones
- Botones permitidos según stage

---

## 10. MÉTRICAS Y MONITOREO

### 10.1 Métricas Registradas

**Función:** `saveMetrics()` (Líneas 880-907)

**Métricas:**
- Total de conversaciones
- Conversaciones activas
- Conversaciones cerradas
- Tiempo promedio de resolución
- Tasa de escalamiento
- Feedback positivo/negativo

### 10.2 Logging Estructurado

**Función:** `log()` (Líneas 106-119)

**Niveles:**
- `INFO`: Eventos normales
- `WARN`: Advertencias
- `ERROR`: Errores

**Destino:**
- Archivo: `data/logs/server.log`
- Console: Solo en desarrollo o errores

---

## 11. CASOS ESPECIALES Y EDGE CASES

### 11.1 Manejo de Errores

**Estrategia:**
- Try-catch en cada handler
- Logging detallado con contexto
- Fallback a estados seguros
- No exponer errores internos al usuario

### 11.2 Estados Inválidos

**Detección:**
- Validación de stage antes de procesar
- Reset automático a `ASK_CONSENT` si inválido
- Logging de estados inválidos

### 11.3 Timeouts y Locks Huérfanos

**Manejo:**
- Timeout de locks (5 minutos)
- Cleanup automático al iniciar
- Verificación de locks antiguos

### 11.4 Versiones Incompatibles

**Manejo:**
- Validación de `flow_version` y `schema_version`
- Opción de reinicio si incompatible
- Migración automática (futuro)

---

## 12. OPTIMIZACIONES Y MEJORAS

### 12.1 Caché de Sesiones

**Implementación:**
- Sesiones en memoria (`sessions` Map)
- Persistencia en disco solo cuando necesario
- Actualización incremental

### 12.2 Deduplicación

**Implementación:**
- Hash de inputs recientes
- Verificación antes de procesar
- Limpieza periódica de hashes antiguos

### 12.3 Rate Limiting

**Implementación:**
- `express-rate-limit` por IP
- 100 requests/15min para chat
- 50 requests/15min para greeting
- Trust proxy configurado

---

## 13. DIAGRAMA DE FLUJO COMPLETO

```
┌─────────────────────────────────────────────────────────────┐
│                    POST /api/chat                            │
│                    (Validación + Rate Limit)                 │
└────────────────────────────┬────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              handleChatMessage()                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Cargar sesión y conversación                     │   │
│  │ 2. Validar estado y versión                        │   │
│  │ 3. Adquirir lock                                    │   │
│  │ 4. Procesar imagen (si aplica)                      │   │
│  │ 5. Deduplicación                                    │   │
│  │ 6. Validaciones (out of scope, nonsensical)        │   │
│  │ 7. Detectar emoción                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             ↓
                    ┌────────┴────────┐
                    │                 │
          ┌─────────▼─────────┐  ┌───▼──────────────┐
          │ EMOTIONAL_RELEASE  │  │ FREE_QA          │
          │ (si frustrado)     │  │ (si pregunta)    │
          └─────────┬─────────┘  └───┬──────────────┘
                    │                 │
                    └────────┬────────┘
                             ↓
                    ┌────────────────┐
                    │ Switch por Stage│
                    └────────┬────────┘
                             ↓
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
│ ASK_CONSENT    │  │ ASK_LANGUAGE    │  │ ASK_NAME      │
│ ASK_USER_LEVEL│  │ ASK_DEVICE_*    │  │ ASK_PROBLEM   │
│ ...            │  │ ...            │  │ ...           │
└───────┬────────┘  └────────┬────────┘  └───────┬────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ↓
                    ┌────────────────┐
                    │ DIAGNOSTIC_STEP│
                    │ (iterativo)    │
                    └────────┬───────┘
                             ↓
                    ┌────────────────┐
                    │ ASK_FEEDBACK   │
                    └────────┬───────┘
                             ↓
                    ┌────────────────┐
                    │ ENDED          │
                    └────────────────┘
```

---

## 14. CONCLUSIONES

### 14.1 Fortalezas

1. **Arquitectura robusta:** FSM bien definida con estados claros
2. **Persistencia completa:** Todo queda registrado en transcript
3. **Trazabilidad:** Sistema de trace completo con boot_id
4. **Seguridad:** Validaciones múltiples y locking
5. **Adaptabilidad:** IA adapta respuestas al usuario
6. **Resiliencia:** Manejo robusto de errores y edge cases

### 14.2 Áreas de Mejora

1. **Complejidad:** Switch con 20+ casos podría modularizarse
2. **Testing:** Falta cobertura de tests automatizados
3. **Documentación:** Algunos handlers necesitan más documentación
4. **Performance:** Optimización de llamadas a IA
5. **Migración:** Sistema de migración de versiones incompletas

### 14.3 Métricas de Calidad

- **Líneas de código:** ~6,173
- **Handlers:** 20+
- **Stages:** 20+
- **Funciones de IA:** 2 (classifier, step)
- **Endpoints:** 5+ (chat, greeting, historial, trace, live-events)

---

**Fin del Informe Técnico**

