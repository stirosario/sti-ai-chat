# AUDITORÍA "20% RESTANTE" (LO QUE GENERA EL 80% DE BUGS RAROS)
## Tecnos STI — Procedimiento IA y estabilidad en producción (profundización final)

**Fecha:** 2025-01-XX  
**Auditor:** Cursor AI  
**Objetivo:** Identificar y documentar los problemas del "20% restante" que generan bugs raros en producción  
**Estado Final:** ⚠️ **NO-GO** (con fallas críticas identificadas)

---

## A) CONTRATO EXTREMO: Validación + Sanitización + Defensas

### Objetivo
Garantizar que el output de IA es seguro, consistente y no rompe el flujo, incluso ante respuestas inesperadas.

### ✅ Hallazgos OK

#### A.1 Validación básica de `reply` y `buttons`

**Ubicación:** `server.js` líneas 519-540 (`validateStepResult`)

**Evidencia:**
```519:540:server.js
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
      if (!btn.label || typeof btn.label !== 'string' || btn.label.trim().length === 0) {
        throw new Error(`Invalid button: missing or empty label`);
      }
    }
  }
  
  return true;
}
```

**Análisis:** ✅ Existe validación básica de tipos y campos obligatorios.

#### A.2 Validación de botones permitidos

**Ubicación:** `server.js` líneas 1096-1135 (`iaStep`)

**Evidencia:**
```1096:1135:server.js
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

**Análisis:** ✅ Existe filtrado de botones inválidos y fallback si no quedan botones válidos.

### ❌ Fallas Críticas

#### FALLA A.1: No hay sanitización de `reply` (JSON embebido, tokens, links peligrosos)

**Ubicación:** `server.js` líneas 1020-1175 (`iaStep`)

**Problema:**
- No se valida que `reply` no contenga JSON embebido (ej: `{"reply": "Aquí está: {\"token\": \"BTN_XXX\"}"}`)
- No se valida que `reply` no contenga tokens técnicos visibles al usuario
- No se valida que `reply` no contenga links peligrosos o maliciosos
- No hay límite de longitud máximo para `reply` (puede generar "paredes de texto")

**Evidencia:**
```1020:1175:server.js
    const content = response.choices[0].message.content;
    
    // Log resultado raw
    if (conversationId) {
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        name: 'IA_CALL_RESULT_RAW',
        payload: { content_hash: hashContent(content) }
      });
    }
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseErr) {
      // ... fallback ...
    }
    
    // Validar schema
    try {
      validateStepResult(result);
    } catch (validationErr) {
      // ... fallback ...
    }
    
    // ... validación de botones ...
    
    // Aplicar UX adaptativa
    const emotion = session.meta.emotion || 'neutral';
    result.reply = adaptTextToEmotion(
      result.reply,
      emotion,
      session.user.name_norm
    );
```

**Riesgo:** 🔴 **ALTO** - La IA podría inyectar JSON, tokens o links peligrosos que se muestren al usuario.

**🔧 Fix propuesto:**
```javascript
// Después de validar schema, antes de aplicar UX adaptativa (línea ~1064)
function sanitizeReply(reply) {
  if (!reply || typeof reply !== 'string') return '';
  
  // 1. Límite de longitud (máximo 2000 caracteres)
  let sanitized = reply.substring(0, 2000);
  
  // 2. Remover JSON embebido (patrones como {"token": ...} o {"reply": ...})
  sanitized = sanitized.replace(/\{[^{}]*"(token|reply|label|order)"[^{}]*\}/gi, '');
  
  // 3. Remover tokens técnicos visibles (BTN_XXX, ASK_XXX)
  sanitized = sanitized.replace(/\b(BTN_|ASK_)[A-Z_]+\b/g, '');
  
  // 4. Remover links peligrosos (solo permitir http/https con dominios conocidos)
  const allowedDomains = ['stia.com.ar', 'wa.me', 'whatsapp.com'];
  sanitized = sanitized.replace(/https?:\/\/(?!([a-z0-9-]+\.)?(stia\.com\.ar|wa\.me|whatsapp\.com))/gi, '[link removido]');
  
  // 5. Remover instrucciones internas del prompt
  sanitized = sanitized.replace(/INSTRUCCIONES?:.*$/gmi, '');
  sanitized = sanitized.replace(/BOTONES PERMITIDOS?:.*$/gmi, '');
  
  return sanitized.trim();
}

// Aplicar sanitización
result.reply = sanitizeReply(result.reply);
```

#### FALLA A.2: No hay normalización de botones (duplicados, order inconsistente, máximo 4)

**Ubicación:** `server.js` líneas 1099-1135 (`iaStep`)

**Problema:**
- No se eliminan botones duplicados (mismo `token`)
- No se normaliza `order` (puede venir desordenado o faltante)
- No hay límite máximo de botones (puede devolver 10+ botones)

**Evidencia:**
```1099:1135:server.js
    if (result.buttons) {
      const originalCount = result.buttons.length;
      result.buttons = result.buttons.filter(btn => {
        if (!allowedTokens.has(btn.token)) {
          invalidButtons.push(btn.token);
          return false;
        }
        return true;
      });
      
      // ... log y fallback ...
    }
```

**Riesgo:** 🟡 **MEDIO** - UI puede mostrar botones duplicados o demasiados botones.

**🔧 Fix propuesto:**
```javascript
// Después de filtrar botones inválidos (línea ~1107)
function normalizeButtons(buttons) {
  if (!Array.isArray(buttons)) return [];
  
  // 1. Eliminar duplicados por token
  const seenTokens = new Set();
  let normalized = buttons.filter(btn => {
    if (seenTokens.has(btn.token)) return false;
    seenTokens.add(btn.token);
    return true;
  });
  
  // 2. Limitar a máximo 4 botones
  normalized = normalized.slice(0, 4);
  
  // 3. Normalizar order (1, 2, 3, 4)
  normalized = normalized.map((btn, idx) => ({
    ...btn,
    order: idx + 1
  }));
  
  // 4. Asegurar que label es humano (no token)
  normalized = normalized.map(btn => ({
    ...btn,
    label: btn.label || btn.token.replace(/BTN_|ASK_/, '').replace(/_/g, ' ')
  }));
  
  return normalized;
}

result.buttons = normalizeButtons(result.buttons);
```

#### FALLA A.3: No hay fallback parcial (reply bien pero buttons mal, o viceversa)

**Ubicación:** `server.js` líneas 1047-1094 (`iaStep`)

**Problema:**
- Si `reply` viene bien pero `buttons` mal → se descarta todo y se usa fallback completo
- Si `buttons` bien pero `reply` vacío → se descarta todo y se usa fallback completo
- No hay conservación parcial de datos válidos

**Evidencia:**
```1047:1094:server.js
    } catch (parseErr) {
      await log('ERROR', 'JSON inválido de IA_STEP', { content: content.substring(0, 200), error: parseErr.message });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_VALIDATION_FAIL',
          payload: { error: 'JSON_PARSE_ERROR', error_message: parseErr.message }
        });
      }
      
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
    
    // Validar schema
    try {
      validateStepResult(result);
    } catch (validationErr) {
      await log('ERROR', 'Schema inválido de IA_STEP', { error: validationErr.message, result });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_VALIDATION_FAIL',
          payload: { error: 'SCHEMA_VALIDATION_ERROR', error_message: validationErr.message }
        });
      }
      
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

**Riesgo:** 🟡 **MEDIO** - Se pierde información válida cuando solo una parte falla.

**🔧 Fix propuesto:**
```javascript
// Después de parsear JSON (línea ~1034)
let result;
try {
  result = JSON.parse(content);
} catch (parseErr) {
  // Intentar extraer reply del contenido aunque no sea JSON válido
  const replyMatch = content.match(/"reply"\s*:\s*"([^"]+)"/);
  const extractedReply = replyMatch ? replyMatch[1] : null;
  
  if (extractedReply && extractedReply.trim().length > 0) {
    // Conservar reply extraído, usar fallback de botones
    await log('WARN', 'JSON parcialmente inválido, conservando reply extraído', { 
      extracted_reply: extractedReply.substring(0, 100) 
    });
    return {
      reply: extractedReply,
      buttons: allowedButtons.slice(0, 2).map(b => ({
        token: b.token,
        label: b.label,
        order: 1
      }))
    };
  }
  // Si no se puede extraer, fallback completo
  // ... fallback actual ...
}

// Después de validar schema (línea ~1066)
try {
  validateStepResult(result);
} catch (validationErr) {
  // Verificar qué parte falló
  const hasValidReply = result.reply && typeof result.reply === 'string' && result.reply.trim().length > 0;
  const hasValidButtons = result.buttons && Array.isArray(result.buttons) && result.buttons.length > 0;
  
  if (hasValidReply && !hasValidButtons) {
    // Conservar reply, usar fallback de botones
    await log('WARN', 'Reply válido pero buttons inválidos, conservando reply', { 
      reply_preview: result.reply.substring(0, 100) 
    });
    return {
      reply: result.reply,
      buttons: allowedButtons.slice(0, 2).map(b => ({
        token: b.token,
        label: b.label,
        order: 1
      }))
    };
  } else if (!hasValidReply && hasValidButtons) {
    // Conservar botones válidos, usar fallback de reply
    await log('WARN', 'Buttons válidos pero reply inválido, conservando buttons', { 
      buttons_count: result.buttons.length 
    });
    return {
      reply: session.language === 'es-AR'
        ? 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?'
        : 'Let\'s continue with the next step. What result did you get?',
      buttons: normalizeButtons(result.buttons)
    };
  }
  // Si ambos fallan, fallback completo
  // ... fallback actual ...
}
```

#### FALLA A.4: No hay protección contra "prompt leakage" (instrucciones internas en reply)

**Ubicación:** `server.js` líneas 1169-1175 (`iaStep`)

**Problema:**
- La IA podría incluir instrucciones del prompt en el `reply` (ej: "BOTONES PERMITIDOS: BTN_RESOLVED, BTN_NOT_RESOLVED")
- No hay detección ni recorte de estas instrucciones

**Riesgo:** 🟡 **MEDIO** - El usuario podría ver instrucciones técnicas confusas.

**🔧 Fix propuesto:**
```javascript
// En sanitizeReply (ver FALLA A.1)
// Ya incluido: sanitized = sanitized.replace(/INSTRUCCIONES?:.*$/gmi, '');
// Ya incluido: sanitized = sanitized.replace(/BOTONES PERMITIDOS?:.*$/gmi, '');
```

### 🧪 Pruebas Requeridas

1. **IA devuelve JSON con reply vacío** → debe usar fallback reply determinístico
2. **IA devuelve botones duplicados** → debe normalizar y eliminar duplicados
3. **IA devuelve más de 4 botones** → debe limitar a 4
4. **IA devuelve reply con texto tipo "Botones disponibles: BTN_XXX"** → debe sanitizar y remover
5. **IA devuelve reply con JSON embebido** → debe extraer y limpiar

---

## B) CONCURRENCIA Y CONSISTENCIA (Race Conditions Reales)

### Objetivo
Garantizar que múltiples requests simultáneos no corrompan el estado de la conversación.

### ❌ Fallas Críticas

#### FALLA B.1: No hay locking/cola por conversación o sessionId

**Ubicación:** `server.js` líneas 2598-2877 (`handleChatMessage`)

**Problema:**
- Si el usuario envía 2 mensajes rápidos (o hace doble-click), ambos se procesan en paralelo
- No hay serialización por `conversation_id` o `sessionId`
- Pueden pisarse `stage`, `last_known_step`, `diagnostic_attempts`
- Pueden duplicarse llamadas a IA

**Evidencia:**
```2598:2604:server.js
async function handleChatMessage(sessionId, userInput, imageBase64 = null) {
  const session = getSession(sessionId);
  let conversation = null;
  
  if (session.conversation_id) {
    conversation = await loadConversation(session.conversation_id);
  }
```

**Análisis:** ❌ No hay ningún mecanismo de locking. Dos requests concurrentes pueden:
1. Leer el mismo `session.stage`
2. Modificar `session.stage` simultáneamente
3. Guardar estados inconsistentes
4. Llamar a IA dos veces para el mismo input

**Riesgo:** 🔴 **ALTO** - En producción, usuarios rápidos o doble-clicks pueden corromper el estado.

**🔧 Fix propuesto:**
```javascript
// Al inicio de server.js, después de imports
const conversationLocks = new Map(); // conversationId -> Promise resolver

async function acquireLock(conversationId) {
  if (!conversationId) return null; // No lock si no hay conversation_id
  
  while (conversationLocks.has(conversationId)) {
    // Esperar a que se libere el lock
    await conversationLocks.get(conversationId);
  }
  
  let releaseLock;
  const lockPromise = new Promise(resolve => {
    releaseLock = resolve;
  });
  
  conversationLocks.set(conversationId, lockPromise);
  return releaseLock;
}

// En handleChatMessage, al inicio
async function handleChatMessage(sessionId, userInput, imageBase64 = null) {
  const session = getSession(sessionId);
  let conversation = null;
  let releaseLock = null;
  
  try {
    if (session.conversation_id) {
      conversation = await loadConversation(session.conversation_id);
      // Adquirir lock para esta conversación
      releaseLock = await acquireLock(session.conversation_id);
    }
    
    // ... resto del código ...
    
  } finally {
    // Liberar lock siempre
    if (releaseLock) {
      releaseLock();
      conversationLocks.delete(session.conversation_id);
    }
  }
}
```

#### FALLA B.2: No hay protección contra doble mensaje simultáneo

**Ubicación:** `server.js` líneas 2598-2877 (`handleChatMessage`)

**Problema:**
- Si el usuario envía el mismo mensaje dos veces (refresh, doble-click), se procesa dos veces
- Se duplica el transcript
- Se llama a IA dos veces

**Riesgo:** 🟡 **MEDIO** - Duplicación de llamadas a IA y transcript inconsistente.

**🔧 Fix propuesto:**
```javascript
// Agregar deduplicación por hash del input
const recentInputs = new Map(); // conversationId -> Set de hashes recientes

function hashInput(conversationId, userInput) {
  return `${conversationId}:${userInput.trim().toLowerCase()}`;
}

// En handleChatMessage, después de adquirir lock
const inputHash = hashInput(session.conversation_id || sessionId, userInput);
if (session.conversation_id) {
  if (!recentInputs.has(session.conversation_id)) {
    recentInputs.set(session.conversation_id, new Set());
  }
  
  const recentSet = recentInputs.get(session.conversation_id);
  if (recentSet.has(inputHash)) {
    // Input duplicado en los últimos 5 segundos
    await log('WARN', 'Input duplicado detectado, ignorando', { 
      conversation_id: session.conversation_id, 
      input_preview: userInput.substring(0, 50) 
    });
    return {
      reply: session.language === 'es-AR'
        ? 'Ya recibí tu mensaje. Por favor, esperá un momento...'
        : 'I already received your message. Please wait a moment...',
      buttons: [],
      stage: session.stage
    };
  }
  
  recentSet.add(inputHash);
  // Limpiar después de 5 segundos
  setTimeout(() => {
    recentSet.delete(inputHash);
  }, 5000);
}
```

#### FALLA B.3: Click de botón + texto inmediato no se serializa correctamente

**Ubicación:** `server.js` líneas 2598-2877 (`handleChatMessage`)

**Problema:**
- Si el usuario hace click en un botón y luego escribe texto inmediatamente, ambos requests pueden procesarse en paralelo
- El resultado que llega a `IA_STEP` puede no corresponder al último evento válido

**Riesgo:** 🟡 **MEDIO** - Estado inconsistente y pasos de diagnóstico incorrectos.

**🔧 Fix propuesto:**
- Ya cubierto por el locking propuesto en FALLA B.1

### 🧪 Pruebas Requeridas

1. **Disparar 2 requests concurrentes al endpoint** → verificar transcript ordenado y sin estados corruptos
2. **Enviar mismo mensaje 2 veces en < 1 segundo** → debe detectar duplicado y responder apropiadamente
3. **Click de botón + texto inmediato** → debe procesarse en orden correcto

---

## C) IDEMPOTENCIA Y DEDUPLICACIÓN

### Objetivo
Garantizar que reintentos de red o refresh no dupliquen transcript ni generen estados inconsistentes.

### ❌ Fallas Críticas

#### FALLA C.1: No hay idempotencia por request_id o hash de input

**Ubicación:** `server.js` líneas 2923-2959 (`/api/chat`)

**Problema:**
- Si el frontend reintenta la misma request (timeout, error de red), se procesa nuevamente
- Se duplica el transcript
- Se genera un segundo paso de diagnóstico para el mismo input

**Evidencia:**
```2923:2937:server.js
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { sessionId, message, imageBase64, imageName } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId requerido' });
    }
    
    if (!message && !imageBase64) {
      return res.status(400).json({ ok: false, error: 'message o imageBase64 requerido' });
    }
    
    await log('INFO', `Chat request`, { sessionId, hasMessage: !!message, hasImage: !!imageBase64 });
    
    const response = await handleChatMessage(sessionId, message || '', imageBase64);
```

**Análisis:** ❌ No hay verificación de request_id ni deduplicación.

**Riesgo:** 🟡 **MEDIO** - Reintentos de red pueden duplicar transcript y generar pasos duplicados.

**🔧 Fix propuesto:**
```javascript
// Agregar request_id opcional en el body
const { sessionId, message, imageBase64, imageName, request_id } = req.body;

// En handleChatMessage, verificar si ya se procesó este request_id
if (request_id && conversation) {
  const processedRequests = conversation.processed_request_ids || [];
  if (processedRequests.includes(request_id)) {
    await log('INFO', 'Request idempotente detectado, retornando respuesta anterior', { 
      request_id, 
      conversation_id: session.conversation_id 
    });
    // Retornar última respuesta guardada o estado actual
    return {
      reply: session.language === 'es-AR'
        ? 'Ya procesé tu mensaje anterior. ¿Querés continuar?'
        : 'I already processed your previous message. Do you want to continue?',
      buttons: [],
      stage: session.stage
    };
  }
  
  // Marcar como procesado
  if (!conversation.processed_request_ids) {
    conversation.processed_request_ids = [];
  }
  conversation.processed_request_ids.push(request_id);
  // Limpiar request_ids antiguos (mantener solo últimos 100)
  if (conversation.processed_request_ids.length > 100) {
    conversation.processed_request_ids = conversation.processed_request_ids.slice(-100);
  }
}
```

#### FALLA C.2: No hay deduplicación por hash de input + timestamp

**Ubicación:** `server.js` líneas 2581-2592 (`appendToTranscript`)

**Problema:**
- Si el mismo input se procesa dos veces, se agrega dos veces al transcript
- No hay verificación de duplicados recientes

**Riesgo:** 🟡 **MEDIO** - Transcript inconsistente y pasos duplicados.

**🔧 Fix propuesto:**
```javascript
// En appendToTranscript, antes de agregar evento de usuario
async function appendToTranscript(conversationId, event) {
  // ... validación existente ...
  
  const conversation = await loadConversation(conversationId);
  
  // Si es evento de usuario (text o button), verificar duplicado reciente
  if (event.role === 'user' && conversation.transcript.length > 0) {
    const lastEvent = conversation.transcript[conversation.transcript.length - 1];
    if (lastEvent.role === 'user' && 
        lastEvent.type === event.type &&
        lastEvent.text === event.text && 
        lastEvent.value === event.value) {
      // Duplicado exacto, no agregar
      await log('WARN', 'Evento duplicado detectado en transcript, ignorando', { 
        conversation_id: conversationId,
        event_type: event.type 
      });
      return;
    }
  }
  
  // ... resto del código existente ...
}
```

#### FALLA C.3: Refresh no retoma estado correcto (CONTEXT_RESUME no se activa automáticamente)

**Ubicación:** `server.js` líneas 2232-2245 (`resumeContext`)

**Problema:**
- Si el usuario refresca la página, no hay detección automática de que debe retomar contexto
- `CONTEXT_RESUME` solo se activa manualmente, no al detectar sesión existente

**Evidencia:**
```2232:2245:server.js
async function resumeContext(session, conversation) {
  if (!session.context.last_known_step) {
    return null;
  }
  
  const resumeText = session.language === 'es-AR'
    ? `Retomemos donde lo dejamos. Estábamos en: ${session.context.last_known_step}\n\n¿Querés continuar desde ahí?`
    : `Let's resume where we left off. We were at: ${session.context.last_known_step}\n\nDo you want to continue from there?`;
  
  return {
    reply: resumeText,
    buttons: [
      { token: 'BTN_RESUME_YES', label: 'Sí, continuar', value: 'yes' },
      { token: 'BTN_RESUME_NO', label: 'No, empezar de nuevo', value: 'no' }
    ],
    stage: 'CONTEXT_RESUME'
  };
}
```

**Análisis:** ❌ `resumeContext` existe pero nunca se llama automáticamente. Solo se activaría si hay un handler específico para `CONTEXT_RESUME`.

**Riesgo:** 🟡 **MEDIO** - Usuario que refresca pierde contexto y debe empezar de nuevo.

**🔧 Fix propuesto:**
```javascript
// En handleChatMessage, después de cargar conversation
if (conversation && session.stage === 'ASK_CONSENT') {
  // Usuario refrescó o volvió, verificar si hay contexto para retomar
  if (session.context.last_known_step) {
    const resumeResult = await resumeContext(session, conversation);
    if (resumeResult) {
      return resumeResult;
    }
  }
}
```

### 🧪 Pruebas Requeridas

1. **Repetir la misma request 2 veces** → 1 sola entrada en transcript, estado coherente
2. **Refrescar página en mitad del flujo** → debe ofrecer retomar contexto

---

## D) RATE LIMIT Y PROTECCIÓN DE COSTOS (Anti "IA Storm")

### Objetivo
Evitar que un usuario o bug genere una "tormenta" de llamadas a IA que consuma el presupuesto.

### ✅ Hallazgos OK

#### D.1 Rate limiting HTTP existe

**Ubicación:** `server.js` líneas 2886-2899

**Evidencia:**
```2886:2899:server.js
// Rate Limiting
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: 'Demasiados requests. Por favor, intentá más tarde.',
  standardHeaders: true,
  legacyHeaders: false
});

const greetingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 requests por ventana
  message: 'Demasiados requests. Por favor, intentá más tarde.'
});
```

**Análisis:** ✅ Existe rate limiting a nivel HTTP (100 req/15min para chat, 50 req/15min para greeting).

### ❌ Fallas Críticas

#### FALLA D.1: No hay rate limiting específico para llamadas a IA

**Ubicación:** `server.js` líneas 589-784 (`iaClassifier`) y 911-1216 (`iaStep`)

**Problema:**
- El rate limiting HTTP permite 100 requests/15min
- Pero cada request puede llamar a IA múltiples veces (classifier + step)
- No hay límite de llamadas a IA por conversación o por minuto
- Un bug o usuario rápido puede generar 10+ llamadas a IA en segundos

**Evidencia:**
```589:613:server.js
async function iaClassifier(session, userInput) {
  if (!openai) {
    await log('WARN', 'OpenAI no disponible, usando fallback');
    return {
      // ... fallback ...
    };
  }
  
  const conversationId = session.conversation_id;
  
  // Log inicio de llamada IA
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_START',
      payload: { type: 'classifier', user_input_length: userInput.length }
    });
  }
  
  // ... llamada a OpenAI sin rate limiting ...
```

**Riesgo:** 🔴 **ALTO** - Un bug o usuario rápido puede consumir el presupuesto de OpenAI rápidamente.

**🔧 Fix propuesto:**
```javascript
// Al inicio de server.js, después de imports
const aiCallLimits = new Map(); // conversationId -> { count: number, resetAt: timestamp }

async function checkAICallLimit(conversationId, maxCallsPerMinute = 3) {
  if (!conversationId) return true; // Sin límite si no hay conversation_id
  
  const now = Date.now();
  const limit = aiCallLimits.get(conversationId);
  
  if (!limit || now > limit.resetAt) {
    // Reset o inicializar
    aiCallLimits.set(conversationId, {
      count: 1,
      resetAt: now + 60000 // 1 minuto
    });
    return true;
  }
  
  if (limit.count >= maxCallsPerMinute) {
    await log('WARN', 'Límite de llamadas IA excedido', { 
      conversation_id: conversationId, 
      count: limit.count,
      max: maxCallsPerMinute 
    });
    return false;
  }
  
  limit.count++;
  return true;
}

// En iaClassifier y iaStep, al inicio
if (!await checkAICallLimit(conversationId, 3)) {
  await log('WARN', 'Límite de IA excedido, usando fallback', { conversation_id: conversationId });
  // Retornar fallback sin llamar a OpenAI
  return {
    intent: 'unknown',
    needs_clarification: true,
    // ... fallback ...
  };
}
```

#### FALLA D.2: No hay cooldown tras errores repetidos

**Ubicación:** `server.js` líneas 660-784 (`iaClassifier`)

**Problema:**
- Si OpenAI falla repetidamente (rate limit, timeout), se sigue intentando en cada request
- No hay cooldown que evite llamadas durante un período tras errores

**Riesgo:** 🟡 **MEDIO** - Se desperdician llamadas a IA cuando OpenAI está caído o con rate limit.

**🔧 Fix propuesto:**
```javascript
// Al inicio de server.js
const aiErrorCooldowns = new Map(); // conversationId -> { until: timestamp, errorCount: number }

async function checkAICooldown(conversationId) {
  if (!conversationId) return true;
  
  const cooldown = aiErrorCooldowns.get(conversationId);
  if (cooldown && Date.now() < cooldown.until) {
    return false; // En cooldown
  }
  return true;
}

function setAICooldown(conversationId, errorCount) {
  if (!conversationId) return;
  
  // Cooldown exponencial: 5s, 10s, 20s, 30s
  const cooldownSeconds = Math.min(5 * Math.pow(2, errorCount - 1), 30);
  aiErrorCooldowns.set(conversationId, {
    until: Date.now() + (cooldownSeconds * 1000),
    errorCount: errorCount + 1
  });
  
  // Limpiar después del cooldown
  setTimeout(() => {
    aiErrorCooldowns.delete(conversationId);
  }, cooldownSeconds * 1000);
}

// En iaClassifier, en el catch de errores
} catch (err) {
  lastError = err;
  
  // Si es error de rate limit o timeout, activar cooldown
  if (err.message.includes('rate limit') || err.message === 'Timeout') {
    const currentCooldown = aiErrorCooldowns.get(conversationId) || { errorCount: 0 };
    setAICooldown(conversationId, currentCooldown.errorCount);
  }
  
  // ... resto del código ...
}
```

#### FALLA D.3: No hay logging de consumo (contador simple)

**Ubicación:** `server.js` líneas 589-784 (`iaClassifier`) y 911-1216 (`iaStep`)

**Problema:**
- No hay contador de llamadas a IA por conversación
- No hay métricas de consumo para monitoreo
- No se puede detectar fácilmente si hay un "IA storm"

**Riesgo:** 🟢 **BAJO** - Dificulta el monitoreo y detección de problemas.

**🔧 Fix propuesto:**
```javascript
// Al inicio de server.js
const aiCallCounts = new Map(); // conversationId -> { total: number, lastReset: timestamp }

function incrementAICallCount(conversationId, type) {
  if (!conversationId) return;
  
  const now = Date.now();
  const counts = aiCallCounts.get(conversationId) || { total: 0, classifier: 0, step: 0, lastReset: now };
  
  // Reset diario
  if (now - counts.lastReset > 24 * 60 * 60 * 1000) {
    counts.total = 0;
    counts.classifier = 0;
    counts.step = 0;
    counts.lastReset = now;
  }
  
  counts.total++;
  if (type === 'classifier') counts.classifier++;
  if (type === 'step') counts.step++;
  
  aiCallCounts.set(conversationId, counts);
  
  // Log cada 10 llamadas
  if (counts.total % 10 === 0) {
    log('INFO', 'Contador de llamadas IA', { 
      conversation_id: conversationId,
      total: counts.total,
      classifier: counts.classifier,
      step: counts.step
    });
  }
}

// En iaClassifier y iaStep, después de llamada exitosa
incrementAICallCount(conversationId, 'classifier'); // o 'step'
```

### 🧪 Pruebas Requeridas

1. **10 mensajes seguidos** → no 10 llamadas a IA indiscriminadas (debe respetar límite de 3/min)
2. **Error repetido de OpenAI** → debe activar cooldown y no seguir intentando

---

## E) OBSERVABILIDAD "FORENSE" (Diagnóstico de Bugs Reales)

### Objetivo
Que cada llamada IA deje rastros suficientes para reconstruir "por qué dijo lo que dijo".

### ✅ Hallazgos OK

#### E.1 Eventos básicos de trazabilidad existen

**Ubicación:** `server.js` líneas 605-612, 646-657, 680-686, 742-748 (`iaClassifier`)

**Evidencia:**
```605:612:server.js
  // Log inicio de llamada IA
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_START',
      payload: { type: 'classifier', user_input_length: userInput.length }
    });
  }
```

```646:657:server.js
  // Log payload summary
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_PAYLOAD_SUMMARY',
      payload: {
        user_level: session.user_level,
        device_type: session.context.device_type,
        has_problem_description: !!session.context.problem_description_raw,
        stage: session.stage
      }
    });
  }
```

```680:686:server.js
      // Log resultado raw
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'IA_CALL_RESULT_RAW',
          payload: { content_hash: hashContent(content) }
        });
      }
```

**Análisis:** ✅ Existen eventos `IA_CALL_START`, `IA_CALL_PAYLOAD_SUMMARY`, `IA_CALL_RESULT_RAW`, `IA_CLASSIFIER_RESULT`.

### ❌ Fallas Críticas

#### FALLA E.1: No hay latencia en los eventos

**Ubicación:** `server.js` líneas 605-748 (`iaClassifier`)

**Problema:**
- No se registra cuánto tiempo tardó la llamada a IA
- No se puede detectar si hay timeouts o latencias altas

**Riesgo:** 🟡 **MEDIO** - Dificulta diagnosticar problemas de rendimiento.

**🔧 Fix propuesto:**
```javascript
// En iaClassifier, al inicio
const startTime = Date.now();

// Al final, antes de return result
const latency = Date.now() - startTime;

if (conversationId) {
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_RESULT',
    payload: { ...result, latency_ms: latency }
  });
}
```

#### FALLA E.2: No hay snapshot hash del payload completo

**Ubicación:** `server.js` líneas 618-643 (`iaClassifier`)

**Problema:**
- Solo se loguea `content_hash` del resultado, no del prompt completo
- No se puede reconstruir exactamente qué se envió a IA

**Riesgo:** 🟡 **MEDIO** - Dificulta reproducir bugs específicos.

**🔧 Fix propuesto:**
```javascript
// Después de construir el prompt
const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);

if (conversationId) {
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CALL_PAYLOAD_SUMMARY',
    payload: {
      user_level: session.user_level,
      device_type: session.context.device_type,
      has_problem_description: !!session.context.problem_description_raw,
      stage: session.stage,
      prompt_hash: promptHash,
      prompt_length: prompt.length
    }
  });
}
```

#### FALLA E.3: No hay correlación por request_id

**Ubicación:** `server.js` líneas 2923-2959 (`/api/chat`)

**Problema:**
- No se acepta ni propaga `request_id` del frontend
- No se puede correlacionar eventos de una misma request HTTP

**Riesgo:** 🟡 **MEDIO** - Dificulta rastrear una request específica a través de los logs.

**🔧 Fix propuesto:**
```javascript
// En /api/chat
const { sessionId, message, imageBase64, imageName, request_id } = req.body;
const requestId = request_id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Pasar requestId a handleChatMessage
const response = await handleChatMessage(sessionId, message || '', imageBase64, requestId);

// En handleChatMessage, agregar requestId a todos los eventos
await appendToTranscript(conversationId, {
  role: 'system',
  type: 'event',
  name: 'IA_CALL_START',
  payload: { 
    type: 'classifier', 
    user_input_length: userInput.length,
    request_id: requestId 
  }
});
```

#### FALLA E.4: No hay stage antes/después en eventos de IA

**Ubicación:** `server.js` líneas 605-748 (`iaClassifier`)

**Problema:**
- No se registra el `stage` antes y después de la llamada a IA
- No se puede ver cómo cambió el estado tras la llamada

**Riesgo:** 🟢 **BAJO** - Dificulta entender transiciones de estado.

**🔧 Fix propuesto:**
```javascript
// En iaClassifier, al inicio
const stageBefore = session.stage;

// Al final, antes de return
if (conversationId) {
  await appendToTranscript(conversationId, {
    role: 'system',
    type: 'event',
    name: 'IA_CLASSIFIER_RESULT',
    payload: { 
      ...result, 
      stage_before: stageBefore,
      stage_after: session.stage 
    }
  });
}
```

### 🧪 Pruebas Requeridas

1. **Elegir una conversación y reconstruir "por qué dijo lo que dijo"** → debe ser posible con los logs + transcript

---

## F) CALIDAD DEL RETORNO AL FLUJO (FREE_QA y Clarificación)

### Objetivo
Garantizar que FREE_QA y clarificación retornan correctamente al flujo sin llamar IA innecesariamente.

### ✅ Hallazgos OK

#### F.1 FREE_QA retorna al stage original

**Ubicación:** `server.js` líneas 1794-1799 (`handleFreeQA`)

**Evidencia:**
```1794:1799:server.js
        return {
          reply: qaReply + resumeText,
          buttons: [],
          isFreeQA: true,
          resumeStage: currentStage
        };
```

**Análisis:** ✅ FREE_QA guarda `resumeStage` y retorna al stage original.

#### F.2 ASK_PROBLEM_CLARIFICATION no diagnostica

**Ubicación:** `server.js` líneas 1620-1630 (`handleAskProblem`)

**Evidencia:**
```1620:1630:server.js
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
```

**Análisis:** ✅ `ASK_PROBLEM_CLARIFICATION` solo pide clarificación, no diagnostica.

#### F.3 Escalamiento tras 2 clarificaciones fallidas

**Ubicación:** `server.js` líneas 1608-1611 (`handleAskProblem`)

**Evidencia:**
```1608:1611:server.js
    // Si más de 2 intentos, escalar a técnico
    if (session.context.clarification_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'clarification_failed');
    }
```

**Análisis:** ✅ Escala a técnico después de 2 intentos fallidos.

### ❌ Fallas Críticas

#### FALLA F.1: FREE_QA puede llamar a IA innecesariamente si el stage cambió

**Ubicación:** `server.js` líneas 2624-2646 (`handleChatMessage`)

**Problema:**
- `handleFreeQA` se llama antes del switch de stages
- Si el stage cambió entre la detección de FREE_QA y el retorno, puede retornar a un stage incorrecto

**Evidencia:**
```2624:2646:server.js
  // Intentar FREE_QA (si aplica)
  if (conversation && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
    const freeQA = await handleFreeQA(session, userInput, conversation);
    if (freeQA) {
      // Guardar respuesta FREE_QA
      await appendToTranscript(conversation.conversation_id, {
        role: 'user',
        type: 'text',
        text: userInput
      });
      await appendToTranscript(conversation.conversation_id, {
        role: 'bot',
        type: 'text',
        text: freeQA.reply
      });
      await saveConversation(conversation);
      
      // Retomar el ASK original
      return {
        ...freeQA,
        stage: freeQA.resumeStage || session.stage
      };
    }
  }
```

**Riesgo:** 🟡 **MEDIO** - Puede retornar a un stage incorrecto si hubo cambios.

**🔧 Fix propuesto:**
```javascript
// En handleFreeQA, capturar stage al inicio
const originalStage = session.stage;

// Al retornar, verificar que el stage no cambió
if (freeQA && freeQA.resumeStage === originalStage) {
  return {
    ...freeQA,
    stage: originalStage
  };
} else if (freeQA) {
  // Stage cambió, no retornar FREE_QA
  await log('WARN', 'FREE_QA cancelado porque stage cambió', { 
    original_stage: originalStage, 
    current_stage: session.stage 
  });
  return null;
}
```

#### FALLA F.2: FREE_QA no valida que el stage actual sea válido para retomar

**Ubicación:** `server.js` líneas 1734-1807 (`handleFreeQA`)

**Problema:**
- `handleFreeQA` puede retornar `resumeStage` que ya no es válido (ej: si el usuario avanzó mientras se procesaba FREE_QA)

**Riesgo:** 🟡 **MEDIO** - Puede retornar a un stage inválido.

**🔧 Fix propuesto:**
```javascript
// En handleChatMessage, después de FREE_QA
if (freeQA) {
  // Verificar que resumeStage sigue siendo válido
  const validStages = ['ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 'ASK_DEVICE_TYPE_EXTERNAL', 
                       'ASK_INTERACTION_MODE', 'DIAGNOSTIC_STEP', 'CONNECTIVITY_FLOW', 'INSTALLATION_STEP'];
  
  if (validStages.includes(freeQA.resumeStage)) {
    return {
      ...freeQA,
      stage: freeQA.resumeStage
    };
  } else {
    // Stage inválido, continuar con flujo normal
    await log('WARN', 'FREE_QA resumeStage inválido, continuando con flujo normal', { 
      resume_stage: freeQA.resumeStage,
      current_stage: session.stage 
    });
  }
}
```

### 🧪 Pruebas Requeridas

1. **Intercalar pregunta libre en mitad del flujo** → debe retornar correctamente al ASK activo
2. **FREE_QA mientras stage cambia** → debe manejar correctamente el cambio de stage

---

## G) SEGURIDAD CONVERSACIONAL + CUMPLIMIENTO DE NIVEL (Última Barrera)

### Objetivo
Garantizar que el "post-filter" del servidor bloquea pasos prohibidos y acciones destructivas.

### ✅ Hallazgos OK

#### G.1 Validación post-IA de comandos destructivos existe

**Ubicación:** `server.js` líneas 1137-1167 (`iaStep`)

**Evidencia:**
```1137:1167:server.js
    // Validación post-IA: detectar comandos destructivos en la respuesta
    const destructiveKeywords = ['formatear', 'formateo', 'format', 'eliminar', 'delete', 'partición', 'partition', 'bios', 'uefi', 'reinstalar', 'reinstall', 'resetear', 'reset'];
    const replyLower = result.reply.toLowerCase();
    const hasDestructiveCommand = destructiveKeywords.some(kw => replyLower.includes(kw));
    
    if (hasDestructiveCommand && (session.user_level === 'basico' || session.user_level === 'intermedio')) {
      await log('WARN', 'IA sugirió comando destructivo para usuario básico/intermedio', { 
        user_level: session.user_level, 
        reply_preview: result.reply.substring(0, 100) 
      });
      
      if (conversationId) {
        await appendToTranscript(conversationId, {
          role: 'system',
          type: 'event',
          name: 'DESTRUCTIVE_COMMAND_BLOCKED',
          payload: { user_level: session.user_level, detected_keywords: destructiveKeywords.filter(kw => replyLower.includes(kw)) }
        });
      }
      
      // Reemplazar con mensaje seguro
      result.reply = session.language === 'es-AR'
        ? 'Este problema podría requerir acciones avanzadas. Te recomiendo contactar con un técnico para evitar daños en tu equipo.\n\n¿Querés que te ayude a contactar con un técnico?'
        : 'This problem might require advanced actions. I recommend contacting a technician to avoid damage to your device.\n\nWould you like me to help you contact a technician?';
      
      // Cambiar botones a opciones de escalamiento
      result.buttons = [
        { token: 'BTN_NEED_HELP', label: session.language === 'es-AR' ? 'Sí, contactar técnico' : 'Yes, contact technician', order: 1 },
        { token: 'BTN_NOT_RESOLVED', label: session.language === 'es-AR' ? 'No, seguir intentando' : 'No, keep trying', order: 2 }
      ];
    }
```

**Análisis:** ✅ Existe validación post-IA que detecta comandos destructivos y los bloquea para usuarios básicos/intermedios.

#### G.2 Restricciones de seguridad en el prompt

**Ubicación:** `server.js` líneas 942-950 (`iaStep`)

**Evidencia:**
```942:950:server.js
  // Restricciones de seguridad por nivel
  const securityRestrictions = session.user_level === 'basico' || session.user_level === 'intermedio'
    ? `\n\n⚠️ RESTRICCIONES DE SEGURIDAD (Nivel: ${session.user_level}):
- NO sugerir comandos destructivos (formateo, particiones, eliminación de datos)
- NO sugerir abrir el equipo físico
- NO sugerir modificar BIOS o configuración avanzada del sistema
- NO sugerir comandos de terminal complejos sin explicación detallada
- Si el problema requiere acciones de riesgo, sugiere contactar con un técnico`
    : '';
```

**Análisis:** ✅ Las restricciones de seguridad están en el prompt.

### ❌ Fallas Críticas

#### FALLA G.1: No hay detección de riesgo físico (abrir PC, sacar RAM, etc.)

**Ubicación:** `server.js` líneas 1137-1167 (`iaStep`)

**Problema:**
- La lista de `destructiveKeywords` no incluye acciones físicas peligrosas
- No detecta "abrir PC", "sacá la RAM", "desarmá", etc.

**Riesgo:** 🟡 **MEDIO** - Usuarios básicos podrían recibir instrucciones para abrir el equipo.

**🔧 Fix propuesto:**
```javascript
// Expandir lista de keywords destructivas
const destructiveKeywords = [
  'formatear', 'formateo', 'format', 'eliminar', 'delete', 
  'partición', 'partition', 'bios', 'uefi', 'reinstalar', 
  'reinstall', 'resetear', 'reset',
  // Agregar acciones físicas
  'abrir', 'abrí', 'desarmar', 'desarmá', 'sacá', 'sacar',
  'ram', 'memoria', 'disco duro', 'hard drive', 'motherboard',
  'placa madre', 'fuente', 'power supply', 'cable interno',
  'internal cable', 'conector', 'jumper', 'pin', 'cable de datos'
];

// Agregar detección específica de riesgo físico
const physicalRiskKeywords = ['abrir', 'abrí', 'desarmar', 'desarmá', 'sacá', 'sacar', 'ram', 'memoria', 'disco duro', 'motherboard', 'placa madre'];
const hasPhysicalRisk = physicalRiskKeywords.some(kw => replyLower.includes(kw));

if (hasPhysicalRisk && (session.user_level === 'basico' || session.user_level === 'intermedio')) {
  await log('WARN', 'IA sugirió acción física peligrosa para usuario básico/intermedio', { 
    user_level: session.user_level, 
    reply_preview: result.reply.substring(0, 100) 
  });
  
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'PHYSICAL_RISK_BLOCKED',
      payload: { user_level: session.user_level, detected_keywords: physicalRiskKeywords.filter(kw => replyLower.includes(kw)) }
    });
  }
  
  // Escalar directamente a técnico (no solo bloquear)
  return await escalateToTechnician(session, conversation, 'physical_risk_detected');
}
```

#### FALLA G.2: No hay validación de que acciones destructivas requieran RISK_SUMMARY

**Ubicación:** `server.js` líneas 1137-1167 (`iaStep`)

**Problema:**
- Si la IA sugiere una acción destructiva pero no se detectó en el post-filter (keyword no en la lista), no se verifica si requiere `RISK_SUMMARY`
- No hay validación de que `RISK_SUMMARY` se haya mostrado antes de acciones destructivas

**Riesgo:** 🟡 **MEDIO** - Acciones destructivas podrían ejecutarse sin advertencia previa.

**🔧 Fix propuesto:**
```javascript
// Después de validar comandos destructivos (línea ~1167)
// Verificar si la respuesta contiene acciones de riesgo que requieren RISK_SUMMARY
const riskKeywords = ['formatear', 'eliminar datos', 'borrar', 'resetear', 'reinstalar', 'partición'];
const requiresRiskSummary = riskKeywords.some(kw => replyLower.includes(kw)) && 
                            !session.context.impact_summary_shown;

if (requiresRiskSummary && session.user_level === 'avanzado') {
  // Usuario avanzado, pero aún requiere RISK_SUMMARY
  const riskSummary = await showRiskSummary(
    session,
    conversation,
    'high',
    'Vamos a realizar una acción que podría afectar tu sistema permanentemente.'
  );
  if (riskSummary) {
    return riskSummary;
  }
}
```

### 🧪 Pruebas Requeridas

1. **Nivel básico + "abrí la PC y sacá la RAM"** → debe bloquear y reemplazar por alternativa segura o escalar
2. **Nivel avanzado + acción destructiva sin RISK_SUMMARY** → debe mostrar RISK_SUMMARY primero

---

## H) RESULTADOS ESPERADOS

### Estado Final: ⚠️ **NO-GO** (con fallas críticas)

### Top 10 Riesgos "Silenciosos" (Los que no se ven en pruebas simples)

1. **🔴 CRÍTICO: Race conditions en requests concurrentes** (FALLA B.1)
   - **Impacto:** Estados corruptos, pasos duplicados, llamadas IA duplicadas
   - **Probabilidad:** Media (usuarios rápidos, doble-clicks)
   - **Severidad:** Alta

2. **🔴 CRÍTICO: Sin rate limiting de llamadas a IA** (FALLA D.1)
   - **Impacto:** Consumo excesivo de presupuesto OpenAI, "IA storm"
   - **Probabilidad:** Media (bugs, usuarios rápidos)
   - **Severidad:** Alta

3. **🟡 ALTO: Sin sanitización de reply** (FALLA A.1)
   - **Impacto:** JSON embebido, tokens técnicos, links peligrosos visibles al usuario
   - **Probabilidad:** Baja (depende de comportamiento de IA)
   - **Severidad:** Media-Alta

4. **🟡 ALTO: Sin idempotencia por request_id** (FALLA C.1)
   - **Impacto:** Transcript duplicado, pasos duplicados en reintentos de red
   - **Probabilidad:** Media (timeouts de red, refresh)
   - **Severidad:** Media

5. **🟡 MEDIO: Sin normalización de botones** (FALLA A.2)
   - **Impacto:** Botones duplicados, más de 4 botones, order inconsistente
   - **Probabilidad:** Media (comportamiento de IA)
   - **Severidad:** Media

6. **🟡 MEDIO: Sin fallback parcial** (FALLA A.3)
   - **Impacto:** Se pierde información válida cuando solo una parte falla
   - **Probabilidad:** Baja (errores parciales de IA)
   - **Severidad:** Media

7. **🟡 MEDIO: Sin detección de riesgo físico** (FALLA G.1)
   - **Impacto:** Usuarios básicos reciben instrucciones para abrir el equipo
   - **Probabilidad:** Baja (depende de comportamiento de IA)
   - **Severidad:** Media-Alta

8. **🟡 MEDIO: Sin cooldown tras errores repetidos** (FALLA D.2)
   - **Impacto:** Se desperdician llamadas a IA cuando OpenAI está caído
   - **Probabilidad:** Baja (fallos temporales de OpenAI)
   - **Severidad:** Media

9. **🟢 BAJO: Sin latencia en eventos** (FALLA E.1)
   - **Impacto:** Dificulta diagnosticar problemas de rendimiento
   - **Probabilidad:** N/A (observabilidad)
   - **Severidad:** Baja

10. **🟢 BAJO: Sin correlación por request_id** (FALLA E.3)
    - **Impacto:** Dificulta rastrear una request específica
    - **Probabilidad:** N/A (observabilidad)
    - **Severidad:** Baja

### Lista de Fixes con Prioridad

#### P0 (Bloqueantes - Deben aplicarse antes de producción)

1. **FALLA B.1: Locking/cola por conversación** (Race conditions)
   - **Archivo:** `server.js`
   - **Función:** `handleChatMessage` (línea 2598)
   - **Fix:** Implementar `acquireLock` y `releaseLock` por `conversation_id`
   - **Esfuerzo:** Medio (2-3 horas)

2. **FALLA D.1: Rate limiting de llamadas a IA**
   - **Archivo:** `server.js`
   - **Función:** `iaClassifier` (línea 589), `iaStep` (línea 911)
   - **Fix:** Implementar `checkAICallLimit` (3 llamadas/min por conversación)
   - **Esfuerzo:** Bajo (1 hora)

3. **FALLA A.1: Sanitización de reply**
   - **Archivo:** `server.js`
   - **Función:** `iaStep` (línea 1169)
   - **Fix:** Implementar `sanitizeReply` (JSON embebido, tokens, links, límite longitud)
   - **Esfuerzo:** Medio (2 horas)

#### P1 (Importantes - Aplicar en siguiente iteración)

4. **FALLA C.1: Idempotencia por request_id**
   - **Archivo:** `server.js`
   - **Función:** `handleChatMessage` (línea 2598)
   - **Fix:** Agregar `request_id` opcional y verificación de duplicados
   - **Esfuerzo:** Bajo (1 hora)

5. **FALLA A.2: Normalización de botones**
   - **Archivo:** `server.js`
   - **Función:** `iaStep` (línea 1107)
   - **Fix:** Implementar `normalizeButtons` (duplicados, order, máximo 4)
   - **Esfuerzo:** Bajo (1 hora)

6. **FALLA G.1: Detección de riesgo físico**
   - **Archivo:** `server.js`
   - **Función:** `iaStep` (línea 1137)
   - **Fix:** Expandir `destructiveKeywords` y agregar detección de riesgo físico
   - **Esfuerzo:** Bajo (30 minutos)

7. **FALLA A.3: Fallback parcial**
   - **Archivo:** `server.js`
   - **Función:** `iaStep` (líneas 1047-1094)
   - **Fix:** Conservar reply válido si buttons fallan, y viceversa
   - **Esfuerzo:** Medio (2 horas)

#### P2 (Mejoras - Aplicar cuando sea posible)

8. **FALLA B.2: Deduplicación de mensajes duplicados**
   - **Archivo:** `server.js`
   - **Función:** `handleChatMessage` (línea 2598)
   - **Fix:** Implementar `hashInput` y verificación de duplicados recientes
   - **Esfuerzo:** Bajo (1 hora)

9. **FALLA D.2: Cooldown tras errores repetidos**
   - **Archivo:** `server.js`
   - **Función:** `iaClassifier` (línea 752), `iaStep` (línea 1188)
   - **Fix:** Implementar `checkAICooldown` y `setAICooldown`
   - **Esfuerzo:** Bajo (1 hora)

10. **FALLA E.1: Latencia en eventos**
    - **Archivo:** `server.js`
    - **Función:** `iaClassifier` (línea 605), `iaStep` (línea 922)
    - **Fix:** Agregar `startTime` y calcular `latency_ms`
    - **Esfuerzo:** Bajo (30 minutos)

11. **FALLA E.2: Snapshot hash del payload**
    - **Archivo:** `server.js`
    - **Función:** `iaClassifier` (línea 618), `iaStep` (línea 959)
    - **Fix:** Agregar `prompt_hash` a `IA_CALL_PAYLOAD_SUMMARY`
    - **Esfuerzo:** Bajo (30 minutos)

12. **FALLA E.3: Correlación por request_id**
    - **Archivo:** `server.js`
    - **Función:** `/api/chat` (línea 2923), `handleChatMessage` (línea 2598)
    - **Fix:** Aceptar `request_id` opcional y propagarlo a eventos
    - **Esfuerzo:** Bajo (1 hora)

13. **FALLA E.4: Stage antes/después en eventos**
    - **Archivo:** `server.js`
    - **Función:** `iaClassifier` (línea 742), `iaStep` (línea 1177)
    - **Fix:** Agregar `stage_before` y `stage_after` a eventos
    - **Esfuerzo:** Bajo (30 minutos)

14. **FALLA F.1: FREE_QA valida stage**
    - **Archivo:** `server.js`
    - **Función:** `handleFreeQA` (línea 1734), `handleChatMessage` (línea 2624)
    - **Fix:** Verificar que `resumeStage` sigue siendo válido
    - **Esfuerzo:** Bajo (1 hora)

15. **FALLA D.3: Logging de consumo**
    - **Archivo:** `server.js`
    - **Función:** `iaClassifier` (línea 589), `iaStep` (línea 911)
    - **Fix:** Implementar `incrementAICallCount` y logging periódico
    - **Esfuerzo:** Bajo (1 hora)

### Parches en Diff

Ver archivo separado: `FIXES_20_PORCIENTO_RESTANTE.patch` (se generará al aplicar fixes)

---

## CONCLUSIÓN

El sistema tiene una base sólida con validaciones básicas, logging de eventos y restricciones de seguridad en prompts. Sin embargo, **faltan defensas críticas** contra:

1. **Race conditions** (requests concurrentes)
2. **Rate limiting de IA** (protección de costos)
3. **Sanitización de output** (seguridad)

Estas fallas pueden generar bugs raros en producción que son difíciles de reproducir y diagnosticar. Se recomienda aplicar los fixes P0 antes de producción.

**Estado:** ⚠️ **NO-GO** hasta aplicar fixes P0.

