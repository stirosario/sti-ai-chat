# AUDITORÍA EXTERNA ULTRA-PROFUNDA
## TECNOS STI — NIVEL BIG FOUR + INGENIERÍA FORENSE + CONFIABILIDAD

**CLASIFICACIÓN:** CONFIDENCIAL — SISTEMA EN EVALUACIÓN CRÍTICA  
**AUDITOR:** EXTERNO INDEPENDIENTE  
**FECHA:** 2024  
**METODOLOGÍA:** ISO/IEC 25010, ISO/IEC 29119, ISO/IEC 27001/27701, SRE Principles, AI Governance

---

## 0) DECLARACIÓN DE INDEPENDENCIA Y ALCANCE REAL

Esta auditoría se realiza como si:
- el auditor NO hubiese participado en el diseño,
- el sistema fuese heredado,
- no existiera documentación confiable previa.

**Todo lo que no pueda demostrarse con evidencia técnica observable se considerará INEXISTENTE a efectos del dictamen.**

---

## 1) OBJETIVO DE MÁXIMO NIVEL

Determinar con precisión técnica si Tecnos STI:

- **A)** es OPERABLE en producción real sin supervisión constante
- **B)** es INVESTIGABLE ante incidentes
- **C)** es EVOLUTIVO sin introducir fallas regresivas
- **D)** es CONFIABLE frente a errores humanos, de IA y de infraestructura
- **E)** mantiene EXPERIENCIA DE USUARIO consistente bajo estrés lógico

---

## 2) MARCO DE EVALUACIÓN (MULTI-ESTÁNDAR)

Evaluación alineada con:
- **ISO/IEC 25010** (calidad de software): Funcionalidad, Confiabilidad, Usabilidad, Eficiencia, Mantenibilidad, Portabilidad
- **ISO/IEC 29119** (testing): Cobertura, Casos de prueba, Evidencia
- **ISO/IEC 27001/27701** (integridad y datos): Seguridad, Privacidad, Trazabilidad
- **SRE Principles**: Reliability, Observability, Error Budget
- **AI Governance**: Control, Fallback, Auditabilidad

**No se certifica, pero sí se mide GAP REAL.**

---

## 3) PRINCIPIOS DE FALLA (AXIOMAS DEL AUDITOR)

- Todo sistema falla.
- Lo importante es:
  - cuándo falla,
  - cómo falla,
  - si avisa,
  - si se recupera,
  - y si se puede explicar.

**Auditar explícitamente:**
- modo de falla
- propagación de falla
- contención de daño
- degradación controlada

---

## 4) METODOLOGÍA DE AUDITORÍA (PROFUNDA)

Aplicación simultánea de:

1. **Lectura estructural del código** (control de responsabilidades)
2. **Ejecución dirigida por escenarios adversos**
3. **Análisis de estados imposibles**
4. **Inyección conceptual de fallos** (fault injection lógico)
5. **Reconstrucción forense** desde logs/transcripts
6. **Evaluación de deuda técnica oculta**

**Documentar QUÉ método detectó cada hallazgo.**

---

## 5) SISTEMA COMO CONJUNTO DE SUBSISTEMAS

Tecnos como integración de:

- **Motor FSM** (estados)
- **Motor IA** (decisión/generación)
- **Motor UX** (mensajes/botones)
- **Motor Persistencia** (datos)
- **Motor Escalamiento** (tickets)
- **Motor Observabilidad** (logs)
- **Motor Multimodal** (imágenes)

**Evaluar acoplamiento entre motores. Identificar dependencias implícitas.**

---

## 6) ARQUITECTURA INTERNA Y CONTROL DE COMPLEJIDAD

### 6.1 Complejidad Ciclomática

**Hallazgo:** `handleChatMessage()` tiene complejidad ciclomática alta (switch con 15+ casos).

**Evidencia:**
```2982:3345:server.js
async function handleChatMessage(sessionId, userInput, imageBase64 = null, requestId = null) {
  // ... switch (session.stage) con 15+ casos
}
```

**Riesgo:** Cambios en un handler pueden afectar otros.  
**Mitigación:** ✅ Separación por funciones (`handleAskProblem`, `handleDiagnosticStep`, etc.)

### 6.2 Funciones con Múltiples Responsabilidades

**Hallazgo:** `iaStep()` combina:
- Rate limiting
- Validación de schema
- Sanitización
- Normalización de botones
- Detección de comandos destructivos
- UX adaptativa
- Logging

**Evidencia:**
```1171:1600:server.js
async function iaStep(session, allowedButtons, previousButtonResult = null, requestId = null) {
  // Rate limiting
  // Validación
  // Sanitización
  // Normalización
  // Detección destructiva
  // UX adaptativa
  // Logging
}
```

**Riesgo:** Difícil testear y mantener.  
**Mitigación:** ⚠️ Funciones auxiliares separadas (`sanitizeReply`, `normalizeButtons`), pero lógica aún acoplada.

### 6.3 Estados que Dependen de "Side Effects"

**Hallazgo:** `session.stage` se modifica en múltiples lugares sin validación centralizada.

**Evidencia:**
```3300:3313:server.js
  // Actualizar stage en session
  if (response.stage) {
    session.stage = response.stage;
    session.meta.updated_at = new Date().toISOString();
    
    if (conversation) {
      await appendToTranscript(conversation.conversation_id, {
        role: 'system',
        type: 'event',
        name: 'STAGE_CHANGED',
        payload: { from: session.stage, to: response.stage }
      });
    }
  }
```

**Riesgo:** Transiciones inválidas pueden pasar desapercibidas.  
**Mitigación:** ⚠️ Logging de `STAGE_CHANGED`, pero no validación de transiciones permitidas.

---

## 7) FSM / ESTADOS — AUDITORÍA FORMAL

### 7.1 Estados Explícitos

**Hallazgo:** 20+ estados identificados en el código.

**Evidencia:**
- `ASK_CONSENT`, `ASK_LANGUAGE`, `ASK_NAME`, `ASK_USER_LEVEL`
- `ASK_DEVICE_CATEGORY`, `ASK_DEVICE_TYPE_MAIN`, `ASK_DEVICE_TYPE_EXTERNAL`
- `ASK_PROBLEM`, `ASK_PROBLEM_CLARIFICATION`
- `ASK_INTERACTION_MODE`, `ASK_LEARNING_DEPTH`, `ASK_EXECUTOR_ROLE`
- `DIAGNOSTIC_STEP`, `CONNECTIVITY_FLOW`, `INSTALLATION_STEP`
- `GUIDED_STORY`, `EMOTIONAL_RELEASE`, `RISK_CONFIRMATION`
- `ASK_FEEDBACK`, `ENDED`

**Estado:** ✅ Estados bien definidos.

### 7.2 Estados Implícitos

**Hallazgo:** Estados transitorios no documentados:
- Estado entre `appendToTranscript` y `saveConversation` (datos en memoria, no persistidos)
- Estado durante llamada a IA (timeout posible)

**Riesgo:** Pérdida de datos si el proceso se interrumpe.  
**Mitigación:** ⚠️ `write temp + rename` para atomicidad, pero no para estados transitorios en memoria.

### 7.3 Estados Sin Salida

**Hallazgo:** `ENDED` es estado terminal, pero no hay validación que impida transiciones desde `ENDED`.

**Evidencia:**
```3290:3298:server.js
    default:
      response = {
        reply: session.language === 'es-AR'
          ? 'Disculpá, hubo un error. ¿Podés volver a empezar?'
          : 'Sorry, there was an error. Can you start over?',
        buttons: [],
        stage: 'ASK_CONSENT'
      };
```

**Riesgo:** Si `session.stage === 'ENDED'` y llega un mensaje, el `default` resetea a `ASK_CONSENT`, perdiendo contexto.

**Estado:** ❌ **FALLA P1**

### 7.4 Transiciones No Intencionales

**Hallazgo:** `FREE_QA` puede cambiar `resumeStage` sin validar que el stage original sigue siendo válido.

**Evidencia:**
```3072:3106:server.js
  // Intentar FREE_QA (si aplica)
  if (conversation && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
    const originalStage = session.stage; // P2.7: Capturar stage original
    const freeQA = await handleFreeQA(session, userInput, conversation);
    if (freeQA) {
      // P2.7: Verificar que resumeStage sigue siendo válido
      const validStages = ['ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 'ASK_DEVICE_TYPE_EXTERNAL', 
                           'ASK_INTERACTION_MODE', 'DIAGNOSTIC_STEP', 'CONNECTIVITY_FLOW', 'INSTALLATION_STEP'];
      
      if (freeQA.resumeStage === originalStage && validStages.includes(freeQA.resumeStage)) {
        // ... retornar FREE_QA
      } else {
        // Stage inválido, continuar con flujo normal
        await log('WARN', 'FREE_QA resumeStage inválido, continuando con flujo normal', { 
          resume_stage: freeQA.resumeStage,
          current_stage: session.stage 
        });
      }
    }
  }
```

**Estado:** ✅ Validación implementada (P2.7).

---

## 8) TEMPORALIDAD, ORDEN Y CAUSALIDAD

### 8.1 Causalidad (A ocurre antes que B)

**Hallazgo:** Locking por `conversation_id` serializa requests concurrentes.

**Evidencia:**
```294:309:server.js
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
```

**Estado:** ✅ Locking implementado (P0.1).

### 8.2 Orden Lógico vs Orden de Llegada

**Hallazgo:** Deduplicación de mensajes duplicados en ventana de 5 segundos.

**Evidencia:**
```2994:3020:server.js
      // P2.1: Deduplicación de mensajes duplicados
      const inputHash = hashInput(session.conversation_id, userInput);
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
```

**Estado:** ✅ Deduplicación implementada (P2.1).

### 8.3 Consistencia Temporal en Transcript

**Hallazgo:** Timestamps en transcript usan `new Date().toISOString()`.

**Evidencia:**
```271:277:server.js
  conversation.transcript.push({
    t: new Date().toISOString(),
    ...event
  });
```

**Riesgo:** Si hay latencia entre `appendToTranscript` y `saveConversation`, el timestamp puede no reflejar el orden real de eventos.

**Estado:** ⚠️ **RIESGO P2** - Timestamps pueden no reflejar orden real si hay fallos entre append y save.

---

## 9) IDENTIDAD Y CORRELACIÓN GLOBAL

### 9.1 conversation_id como Clave Primaria REAL

**Hallazgo:** `conversation_id` se genera una vez en `handleAskLanguage()` y se mantiene durante toda la sesión.

**Evidencia:**
```1676:1709:server.js
    const conversationId = await reserveUniqueConversationId();
    session.conversation_id = conversationId;
    session.language = selectedLanguage;
    session.stage = 'ASK_NAME';
    session.meta.updated_at = new Date().toISOString();
    
    // Crear conversación persistente
    const newConversation = {
      conversation_id: conversationId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      language: selectedLanguage,
      user: { name_norm: null },
      status: 'open',
      feedback: 'none',
      transcript: []
    };
    
    await saveConversation(newConversation);
    
    // Append eventos al transcript
    await appendToTranscript(conversationId, {
      role: 'user',
      type: 'button',
      label: selectedLanguage === 'es-AR' ? 'Español (Argentina)' : 'English',
      value: selectedLanguage
    });
    
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'CONVERSATION_ID_ASSIGNED',
      payload: { conversation_id: conversationId }
    });
```

**Estado:** ✅ `conversation_id` es clave primaria estable.

### 9.2 Propagación a Logs, IA, Tickets, Admin

**Hallazgo:** `conversation_id` aparece en:
- Transcript (evento `CONVERSATION_ID_ASSIGNED`)
- Storage (nombre de archivo: `${conversation_id}.json`)
- Tickets (campo `conversation_id` y en WhatsApp URL)
- Logs (en eventos `IA_CALL_START`, `IA_CALL_PAYLOAD_SUMMARY`, etc.)

**Evidencia:**
```2216:2218:server.js
      whatsapp_url: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `Hola, soy ${conversation.user.name_norm || 'Usuario'}. Conversación ${conversation.conversation_id}. Problema: ${session.context.problem_description_raw || 'N/A'}`
      )}`
```

**Estado:** ✅ Propagación completa.

### 9.3 Concurrencia Extrema

**Hallazgo:** Locking por `conversation_id` previene race conditions, pero no hay protección contra creación paralela de `conversation_id` desde diferentes sesiones.

**Evidencia:**
```124:204:server.js
async function reserveUniqueConversationId() {
  const maxAttempts = 50;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      // 1. Adquirir lock
      let lockHandle;
      try {
        lockHandle = await fs.open(USED_IDS_LOCK, 'wx');
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Lock existe, esperar un poco y reintentar
          await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
          attempts++;
          continue;
        }
        throw err;
      }
      
      try {
        // 2. Leer used_ids.json
        // 3. Generar ID
        // 4. Agregar y escribir (write temp + rename para atomicidad)
        // 5. Liberar lock
      } catch (err) {
        await lockHandle.close().catch(() => {});
        throw err;
      }
      
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        await log('ERROR', 'Error generando ID único después de múltiples intentos', { error: err.message });
        throw new Error(`No se pudo generar ID único: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  throw new Error('No se pudo generar ID único después de 50 intentos');
}
```

**Estado:** ✅ Locking con file lock (`USED_IDS_LOCK`) previene duplicados.

---

## 10) IA COMO SISTEMA NO DETERMINÍSTICO

### 10.1 Mecanismos de Contención

**Hallazgo:** Rate limiting (3 llamadas/minuto), cooldown tras errores, timeouts (30s), fallbacks determinísticos.

**Evidencia:**
```322:348:server.js
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
```

**Estado:** ✅ Contención implementada (P0.2).

### 10.2 Validación Semántica Post-IA

**Hallazgo:** Validación de schema estricta, detección de comandos destructivos, validación de botones permitidos.

**Evidencia:**
```1467:1532:server.js
    // Validación post-IA: detectar comandos destructivos en la respuesta
    // P1.3: Expandir lista de keywords destructivas incluyendo acciones físicas
    const destructiveKeywords = [
      'formatear', 'formateo', 'format', 'eliminar', 'delete', 
      'partición', 'partition', 'bios', 'uefi', 'reinstalar', 
      'reinstall', 'resetear', 'reset',
      // Acciones físicas peligrosas
      'abrir', 'abrí', 'desarmar', 'desarmá', 'sacá', 'sacar',
      'ram', 'memoria', 'disco duro', 'hard drive', 'motherboard',
      'placa madre', 'fuente', 'power supply', 'cable interno',
      'internal cable', 'conector', 'jumper', 'pin', 'cable de datos'
    ];
    const replyLower = result.reply.toLowerCase();
    const hasDestructiveCommand = destructiveKeywords.some(kw => replyLower.includes(kw));
    
    // P1.3: Detección específica de riesgo físico
    const physicalRiskKeywords = ['abrir', 'abrí', 'desarmar', 'desarmá', 'sacá', 'sacar', 'ram', 'memoria', 'disco duro', 'motherboard', 'placa madre'];
    const hasPhysicalRisk = physicalRiskKeywords.some(kw => replyLower.includes(kw));
    
    if (hasPhysicalRisk && (session.user_level === 'basico' || session.user_level === 'intermedio')) {
      // Escalar directamente a técnico (no solo bloquear)
      if (conversation) {
        return await escalateToTechnician(session, conversation, 'physical_risk_detected');
      }
    }
```

**Estado:** ✅ Validación semántica implementada (P1.3).

### 10.3 Control de Regresión Conversacional

**Hallazgo:** Historial de pasos anteriores se envía a IA para evitar repetición.

**Evidencia:**
```1224:1232:server.js
  const recentSteps = conversation ? getRecentStepsHistory(conversation, 3) : [];
  const historyText = recentSteps.length > 0 
    ? `\n\nPASOS ANTERIORES (NO repitas estos):\n${recentSteps.map((step, idx) => `${idx + 1}. ${step.substring(0, 100)}...`).join('\n')}`
    : '';
```

**Estado:** ✅ Control de regresión implementado.

---

## 11) CONTRATO DE IA — NIVEL DEFENSIVO

### 11.1 Schema Estricto

**Hallazgo:** Validación de schema con `validateClassifierResult()` y `validateStepResult()`.

**Evidencia:**
```471:551:server.js
function validateClassifierResult(result) {
  // Validación de campos obligatorios
  // Validación de tipos
  // Validación de enums
  // Validación de rangos
}

function validateStepResult(result) {
  // Validación de reply (string no vacío)
  // Validación de buttons (array, max 4, tokens permitidos, labels no vacíos)
}
```

**Estado:** ✅ Schema estricto implementado.

### 11.2 Filtrado de Contenido Peligroso

**Hallazgo:** `sanitizeReply()` remueve JSON embebido, tokens internos, links peligrosos, limita longitud.

**Evidencia:**
```380:437:server.js
function sanitizeReply(reply) {
  if (!reply || typeof reply !== 'string') {
    return '';
  }
  
  let sanitized = reply.trim();
  
  // P0.3: Limitar longitud máxima
  if (sanitized.length > 2000) {
    sanitized = sanitized.substring(0, 2000) + '...';
  }
  
  // Remover JSON embebido
  sanitized = sanitized.replace(/\{[\s\S]*?\}/g, '[JSON removido]');
  
  // Remover tokens internos (BTN_XXX, ASK_XXX, etc.)
  sanitized = sanitized.replace(/\b(BTN_|ASK_|DIAGNOSTIC_|CONNECTIVITY_|INSTALLATION_)[A-Z_]+/g, '[token removido]');
  
  // Remover links peligrosos (excepto stia.com.ar, wa.me, whatsapp.com)
  const allowedDomains = ['stia.com.ar', 'wa.me', 'whatsapp.com'];
  sanitized = sanitized.replace(/https?:\/\/(?!([a-z0-9-]+\.)?(stia\.com\.ar|wa\.me|whatsapp\.com))/gi, '[link removido]');
  
  // Remover caracteres de control
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}
```

**Estado:** ✅ Sanitización implementada (P0.3).

### 11.3 Neutralización de Prompt Leakage

**Hallazgo:** No hay detección explícita de prompt leakage en la respuesta de IA.

**Riesgo:** IA podría exponer instrucciones internas al usuario.

**Estado:** ❌ **FALLA P2** - No hay protección contra prompt leakage.

---

## 12) DECISIÓN DE BOTONES COMO RIESGO DE UI

### 12.1 Botones Fuera de Contexto

**Hallazgo:** Validación de que botones devueltos por IA estén en `allowed_buttons_by_ask`.

**Evidencia:**
```1427:1461:server.js
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
        result.buttons = normalizeButtons(allowedButtons.slice(0, 2));
      }
    }
```

**Estado:** ✅ Validación de botones implementada.

### 12.2 Exceso de Opciones

**Hallazgo:** Normalización limita a máximo 4 botones, elimina duplicados, ordena por `order`.

**Evidencia:**
```440:469:server.js
function normalizeButtons(buttons) {
  if (!Array.isArray(buttons)) {
    return [];
  }
  
  // P1.2: Normalizar botones (duplicados, order, máximo 4)
  const seen = new Set();
  const normalized = [];
  
  for (const btn of buttons) {
    if (!btn || typeof btn !== 'object') continue;
    
    const token = btn.token || btn.value;
    if (!token || seen.has(token)) continue; // Evitar duplicados
    
    seen.add(token);
    
    normalized.push({
      token: token,
      label: btn.label || btn.value || token,
      value: btn.value || btn.token,
      order: typeof btn.order === 'number' ? btn.order : normalized.length + 1
    });
    
    // P1.2: Máximo 4 botones
    if (normalized.length >= 4) break;
  }
  
  // Ordenar por order
  normalized.sort((a, b) => (a.order || 0) - (b.order || 0));
  
  return normalized;
}
```

**Estado:** ✅ Normalización implementada (P1.2).

### 12.3 Contradicción con Texto

**Hallazgo:** No hay validación semántica que detecte contradicción entre `reply` y `buttons`.

**Riesgo:** IA podría sugerir botones que contradicen el mensaje.

**Estado:** ⚠️ **RIESGO P2** - No hay validación semántica de coherencia.

---

## 13) MULTIMODALIDAD — AUDITORÍA FUNCIONAL REAL

### 13.1 Límite de Tamaño de Imágenes

**Hallazgo:** El endpoint acepta `imageBase64` pero no hay validación de tamaño en `server.js`.

**Evidencia:**
```3392:3407:server.js
    const { sessionId, message, imageBase64, imageName, request_id } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId requerido' });
    }
    
    if (!message && !imageBase64) {
      return res.status(400).json({ ok: false, error: 'message o imageBase64 requerido' });
    }
    
    // P1.1: Generar request_id si no viene
    const requestId = request_id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await log('INFO', `Chat request`, { sessionId, hasMessage: !!message, hasImage: !!imageBase64, request_id: requestId });
    
    const response = await handleChatMessage(sessionId, message || '', imageBase64, requestId);
```

**Riesgo:** Imágenes grandes pueden causar problemas de memoria o timeout.

**Estado:** ❌ **FALLA P1** - No hay validación de tamaño de imagen en `server.js`.

### 13.2 Formatos Aceptados

**Hallazgo:** No hay validación de formato de imagen (JPEG, PNG, etc.).

**Estado:** ❌ **FALLA P2** - No hay validación de formato.

### 13.3 Persistencia o Referencia

**Hallazgo:** `imageBase64` se pasa a `handleChatMessage()` pero no se persiste ni se referencia en transcript.

**Evidencia:**
```2982:2982:server.js
async function handleChatMessage(sessionId, userInput, imageBase64 = null, requestId = null) {
```

**Estado:** ❌ **FALLA P1** - Imágenes no se persisten ni referencian.

### 13.4 Uso Efectivo en Razonamiento

**Hallazgo:** `imageBase64` no se envía a IA (no hay integración con Vision API en `iaClassifier` o `iaStep`).

**Estado:** ❌ **FALLA P0** - Multimodalidad no funcional.

---

## 14) ESCALAMIENTO HUMANO — CONFIABILIDAD OPERATIVA

### 14.1 Disparadores Reales

**Hallazgo:** Escalamiento se dispara en:
- `physical_risk_detected` (P1.3)
- `clarification_failed` (después de 2 intentos)
- `user_requested`
- `multiple_attempts_failed` (después de 2 intentos)
- `connectivity_hardware_issue`

**Evidencia:**
```2197:2257:server.js
async function escalateToTechnician(session, conversation, reason) {
  if (conversation) {
    conversation.status = 'escalated';
    await saveConversation(conversation);
    
    // Validar formato de conversation_id antes de usar en path
    if (!/^[A-Z]{2}\d{4}$/.test(conversation.conversation_id)) {
      await log('ERROR', `Formato inválido de conversation_id en escalateToTechnician: ${conversation.conversation_id}`);
      throw new Error('Invalid conversation_id format');
    }
    
    // Crear ticket
    const ticket = {
      conversation_id: conversation.conversation_id,
      created_at: new Date().toISOString(),
      user: conversation.user,
      problem: session.context.problem_description_raw,
      reason,
      transcript_path: path.join(CONVERSATIONS_DIR, `${conversation.conversation_id}.json`),
      whatsapp_url: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `Hola, soy ${conversation.user.name_norm || 'Usuario'}. Conversación ${conversation.conversation_id}. Problema: ${session.context.problem_description_raw || 'N/A'}`
      )}`
    };
    
    // Write temp + rename para atomicidad
    const ticketPath = path.join(TICKETS_DIR, `${conversation.conversation_id}.json`);
    const tempTicketPath = ticketPath + '.tmp';
    await fs.writeFile(tempTicketPath, JSON.stringify(ticket, null, 2), 'utf-8');
    await fs.rename(tempTicketPath, ticketPath);
    
    await appendToTranscript(conversation.conversation_id, {
      role: 'system',
      type: 'event',
      name: 'ESCALATED_TO_TECHNICIAN',
      payload: { reason, ticket_id: conversation.conversation_id }
    });
    
    const escalationText = session.language === 'es-AR'
      ? `Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico.\n\n📱 Podés contactarnos por WhatsApp: ${ticket.whatsapp_url}\n\n¿Te sirvió esta ayuda?`
      : `I understand you need more help. I recommend talking to a technician.\n\n📱 You can contact us via WhatsApp: ${ticket.whatsapp_url}\n\nWas this help useful?`;
    
    return {
      reply: escalationText,
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_FEEDBACK.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_FEEDBACK'
    };
  }
  
  return {
    reply: session.language === 'es-AR'
      ? 'Te recomiendo contactar con un técnico para más ayuda.'
      : 'I recommend contacting a technician for more help.',
    buttons: [],
    stage: 'ENDED',
    endConversation: true
  };
}
```

**Estado:** ✅ Disparadores bien definidos.

### 14.2 Falsos Positivos / Negativos

**Hallazgo:** No hay métricas de falsos positivos/negativos.

**Riesgo:** Escalamiento puede ser demasiado agresivo o demasiado conservador.

**Estado:** ⚠️ **RIESGO P2** - No hay métricas de precisión.

### 14.3 Formato del Ticket

**Hallazgo:** Ticket incluye `conversation_id`, `user`, `problem`, `reason`, `transcript_path`, `whatsapp_url`.

**Estado:** ✅ Formato completo.

### 14.4 Fallo en Envío WhatsApp

**Hallazgo:** No hay reintento si falla la creación del ticket o el envío de WhatsApp.

**Riesgo:** Si falla `fs.writeFile` o `fs.rename`, el ticket no se crea y el usuario no recibe el link.

**Evidencia:**
```2221:2225:server.js
    // Write temp + rename para atomicidad
    const ticketPath = path.join(TICKETS_DIR, `${conversation.conversation_id}.json`);
    const tempTicketPath = ticketPath + '.tmp';
    await fs.writeFile(tempTicketPath, JSON.stringify(ticket, null, 2), 'utf-8');
    await fs.rename(tempTicketPath, ticketPath);
```

**Estado:** ❌ **FALLA P1** - No hay manejo de errores ni reintento.

### 14.5 DESTINO OBLIGATORIO

**Hallazgo:** `WHATSAPP_NUMBER` está hardcodeado a `'5493417422422'`.

**Evidencia:**
```93:94:server.js
// WhatsApp (opcional)
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
```

**Estado:** ✅ Destino configurable vía env var.

---

## 15) OBSERVABILIDAD — NIVEL POST-MORTEM

### 15.1 Reconstrucción de Qué Dijo el Usuario

**Hallazgo:** Transcript incluye eventos `role: 'user'` con `text` o `button`.

**Evidencia:**
```1965:1969:server.js
  await appendToTranscript(conversation.conversation_id, {
    role: 'user',
    type: 'text',
    text: userInput
  });
```

**Estado:** ✅ Reconstrucción posible.

### 15.2 Reconstrucción de Qué Entendió Tecnos

**Hallazgo:** Transcript incluye eventos `IA_CLASSIFIER_RESULT` y `IA_STEP_RESULT` con payload completo.

**Evidencia:**
```1552:1567:server.js
    // Log resultado parseado y validado
    if (conversationId) {
      await appendToTranscript(conversationId, {
        role: 'system',
        type: 'event',
        name: 'IA_STEP_RESULT',
        payload: { 
          reply_length: result.reply?.length || 0, 
          buttons_count: result.buttons?.length || 0, 
          emotion,
          latency_ms: latency,
          stage_before: stageBefore,
          stage_after: session.stage,
          request_id: requestId
        }
      });
    }
```

**Estado:** ✅ Reconstrucción posible.

### 15.3 Reconstrucción de Qué Decidió la IA

**Hallazgo:** Transcript incluye `IA_CALL_PAYLOAD_SUMMARY` (hash del prompt) y `IA_CALL_RESULT_RAW` (hash del resultado).

**Evidencia:**
```1284:1302:server.js
  // Log payload summary
  if (conversationId) {
    await appendToTranscript(conversationId, {
      role: 'system',
      type: 'event',
      name: 'IA_CALL_PAYLOAD_SUMMARY',
      payload: {
        user_level: session.user_level,
        device_type: session.context.device_type,
        problem_category: session.context.problem_category,
        stage: session.stage,
        has_history: recentSteps.length > 0,
        previous_button_result: previousButtonResult || null,
        prompt_hash: promptHash,
        prompt_length: prompt.length,
        request_id: requestId
      }
    });
  }
```

**Estado:** ✅ Reconstrucción posible (P2.4).

### 15.4 Reconstrucción de Por Qué Eligió ese Paso

**Hallazgo:** `IA_CALL_PAYLOAD_SUMMARY` incluye contexto (user_level, device_type, problem_category, stage, history, previous_button_result).

**Estado:** ✅ Reconstrucción posible.

### 15.5 Reconstrucción de Qué Estado Cambió

**Hallazgo:** Transcript incluye evento `STAGE_CHANGED` con `from` y `to`.

**Evidencia:**
```3305:3312:server.js
    if (conversation) {
      await appendToTranscript(conversation.conversation_id, {
        role: 'system',
        type: 'event',
        name: 'STAGE_CHANGED',
        payload: { from: session.stage, to: response.stage }
      });
    }
```

**Estado:** ✅ Reconstrucción posible.

**NOTA:** Hay un bug: `from: session.stage` debería ser el stage ANTES del cambio, pero `session.stage` ya fue actualizado en la línea 3302. Debería ser `from: previousStage`.

**Estado:** ❌ **FALLA P2** - Bug en `STAGE_CHANGED` (from incorrecto).

---

## 16) CONCURRENCIA, IDEMPOTENCIA Y CONSISTENCIA

### 16.1 Procesamiento Serial por Conversación

**Hallazgo:** Locking por `conversation_id` serializa requests concurrentes.

**Estado:** ✅ Serialización implementada (P0.1).

### 16.2 Deduplicación de Eventos

**Hallazgo:** Deduplicación de mensajes duplicados en ventana de 5 segundos, idempotencia por `request_id`.

**Evidencia:**
```3029:3057:server.js
    // P1.1: Verificar idempotencia por request_id
    if (requestId && conversation) {
      const processedRequests = conversation.processed_request_ids || [];
      if (processedRequests.includes(requestId)) {
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
      conversation.processed_request_ids.push(requestId);
      // Limpiar request_ids antiguos (mantener solo últimos 100)
      if (conversation.processed_request_ids.length > 100) {
        conversation.processed_request_ids = conversation.processed_request_ids.slice(-100);
      }
      await saveConversation(conversation);
    }
```

**Estado:** ✅ Idempotencia implementada (P1.1).

### 16.3 Tolerancia a Refresh/Retry

**Hallazgo:** `request_id` permite retry sin duplicar procesamiento.

**Estado:** ✅ Tolerancia implementada.

### 16.4 Protección Contra Race Conditions

**Hallazgo:** Locking previene race conditions en `stage`, `last_known_step`, `attempt_count`.

**Estado:** ✅ Protección implementada (P0.1).

---

## 17) FUNCIONALIDAD REAL VS EXPECTATIVA

### 17.1 Lo Que Funciona Hoy

**Inventario:**
- ✅ FSM con 20+ estados
- ✅ Generación de `conversation_id` único (AA0000-ZZ9999)
- ✅ Persistencia de conversaciones (JSON files)
- ✅ Integración con OpenAI (classifier + step)
- ✅ Rate limiting de llamadas a IA (3/minuto)
- ✅ Validación de schema estricta
- ✅ Sanitización de reply
- ✅ Normalización de botones
- ✅ Detección de comandos destructivos
- ✅ Escalamiento a técnico (tickets + WhatsApp)
- ✅ Locking por conversación
- ✅ Idempotencia por request_id
- ✅ Deduplicación de mensajes
- ✅ Logging forense completo
- ✅ Flujos específicos (conectividad, instalación)
- ✅ 9 funciones explícitas (RISK_SUMMARY, EMOTIONAL_RELEASE, etc.)

### 17.2 Límites y Condiciones

**Límites:**
- ⚠️ Multimodalidad no funcional (imágenes no se procesan)
- ⚠️ No hay validación de tamaño/formato de imágenes
- ⚠️ No hay protección contra prompt leakage
- ⚠️ No hay validación semántica de coherencia reply/buttons
- ⚠️ Bug en `STAGE_CHANGED` (from incorrecto)
- ⚠️ No hay manejo de errores en escalamiento (reintento)
- ⚠️ No hay métricas de falsos positivos/negativos en escalamiento

**Condiciones:**
- Requiere `OPENAI_API_KEY` para funcionar completamente
- Requiere sistema de archivos funcional (persistencia en disco)
- Requiere `conversation_id` válido (formato AA0000-ZZ9999)

### 17.3 Deuda Técnica

**Identificada:**
- Multimodalidad no implementada
- Validación de imágenes faltante
- Protección contra prompt leakage faltante
- Validación semántica de coherencia faltante
- Bug en `STAGE_CHANGED`
- Manejo de errores en escalamiento faltante
- Métricas de precisión de escalamiento faltantes

---

## 18) EXPERIENCIA DE USUARIO BAJO FALLA

### 18.1 Qué Ve el Usuario Cuando IA Falla

**Hallazgo:** Fallback determinístico con mensaje claro.

**Evidencia:**
```1588:1598:server.js
    // Fallback determinístico
    if (allowedButtons.length > 0) {
      return {
        reply: 'Continuemos con el siguiente paso. ¿Qué resultado obtuviste?',
        buttons: normalizeButtons(allowedButtons.slice(0, 2))
      };
    }
    return {
      reply: 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta?',
      buttons: []
    };
```

**Estado:** ✅ UX clara bajo falla.

### 18.2 Qué Ve el Usuario Cuando Sistema No Entiende

**Hallazgo:** Clarificación después de 2 intentos fallidos, luego escalamiento.

**Evidencia:**
```1984:2015:server.js
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

**Estado:** ✅ UX clara bajo falta de entendimiento.

### 18.3 Qué Ve el Usuario Cuando Se Demora

**Hallazgo:** Timeout de 30s en llamadas a IA, fallback automático.

**Evidencia:**
```1305:1316:server.js
    const response = await Promise.race([
      openai.chat.completions.create({
        model: OPENAI_MODEL_STEP,
        messages: [{ role: 'user', content: prompt }],
        temperature: OPENAI_TEMPERATURE_STEP,
        max_tokens: OPENAI_MAX_TOKENS_STEP,
        response_format: { type: 'json_object' }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), OPENAI_TIMEOUT_MS)
      )
    ]);
```

**Estado:** ✅ UX clara bajo demora.

### 18.4 Qué Ve el Usuario Cuando Se Escala

**Hallazgo:** Mensaje claro con link de WhatsApp.

**Evidencia:**
```2234:2246:server.js
    const escalationText = session.language === 'es-AR'
      ? `Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico.\n\n📱 Podés contactarnos por WhatsApp: ${ticket.whatsapp_url}\n\n¿Te sirvió esta ayuda?`
      : `I understand you need more help. I recommend talking to a technician.\n\n📱 You can contact us via WhatsApp: ${ticket.whatsapp_url}\n\nWas this help useful?`;
    
    return {
      reply: escalationText,
      buttons: ALLOWED_BUTTONS_BY_ASK.ASK_FEEDBACK.map(b => ({
        label: b.label,
        value: b.value,
        token: b.token
      })),
      stage: 'ASK_FEEDBACK'
    };
```

**Estado:** ✅ UX clara bajo escalamiento.

---

## 19) MATRIZ DE RIESGOS SISTÉMICOS

| ID | Causa Raíz | Síntoma Visible | Impacto Usuario | Impacto Negocio | Probabilidad | Severidad | Mitigación Propuesta |
|----|------------|-----------------|-----------------|-----------------|--------------|-----------|---------------------|
| R1 | Multimodalidad no funcional | Imágenes ignoradas | Usuario no puede enviar imágenes | Pérdida de funcionalidad | Alta | Media | Implementar Vision API |
| R2 | No validación tamaño imagen | Imágenes grandes causan timeout | Timeout o error 500 | Pérdida de conversación | Media | Alta | Validar tamaño antes de procesar |
| R3 | No protección prompt leakage | IA expone instrucciones | Confusión del usuario | Pérdida de confianza | Baja | Media | Detectar y filtrar prompt leakage |
| R4 | Bug STAGE_CHANGED (from incorrecto) | Logs incorrectos | Dificultad en debugging | Tiempo perdido en investigación | Alta | Baja | Corregir bug (capturar stage antes) |
| R5 | No manejo errores escalamiento | Ticket no se crea si falla FS | Usuario no recibe link WhatsApp | Pérdida de escalamiento | Media | Alta | Agregar try/catch y reintento |
| R6 | No validación coherencia reply/buttons | Botones contradictorios | Confusión del usuario | Pérdida de confianza | Baja | Media | Validación semántica |
| R7 | Estados sin salida (ENDED) | Reset inesperado | Pérdida de contexto | Frustración del usuario | Baja | Media | Validar transiciones desde ENDED |
| R8 | No métricas falsos positivos/negativos | Escalamiento sub/sobre-óptimo | Escalamiento ineficiente | Costo operativo | Media | Baja | Agregar métricas |

---

## 20) VEREDICTO FINAL (NO DILUIBLE) — ACTUALIZADO CON SECCIONES 21-30

### Resumen de Hallazgos (Secciones 1-20)

**✅ OK (Implementado Correctamente):**
- Locking por conversación (P0.1)
- Rate limiting de IA (P0.2)
- Sanitización de reply (P0.3)
- Idempotencia por request_id (P1.1)
- Normalización de botones (P1.2)
- Detección de riesgo físico (P1.3)
- Fallback parcial (P1.4)
- Deduplicación de mensajes (P2.1)
- Cooldown tras errores (P2.2)
- Latencia en eventos (P2.3)
- Snapshot hash del payload (P2.4)
- Correlación por request_id (P2.5)
- Stage antes/después en eventos (P2.6, corregido)
- Validación de resumeStage (P2.7)
- Contador de llamadas IA (P2.8)
- Observabilidad forense completa
- Escalamiento funcional
- UX clara bajo falla

**❌ FALLAS CRÍTICAS (P0) - Secciones 1-20:**
- **F0.1:** Multimodalidad no funcional (imágenes no se procesan)
- **F0.2:** No hay validación de tamaño/formato de imágenes

**❌ FALLAS IMPORTANTES (P1) - Secciones 1-20:**
- **F1.1:** No hay manejo de errores en escalamiento (reintento) — ✅ CORREGIDO
- **F1.2:** Imágenes no se persisten ni referencian — ✅ CORREGIDO
- **F1.3:** Estados sin salida (ENDED puede resetear a ASK_CONSENT) — ✅ CORREGIDO

**⚠️ RIESGOS (P2) - Secciones 1-20:**
- **R2.1:** No hay protección contra prompt leakage — ✅ CORREGIDO
- **R2.2:** No hay validación semántica de coherencia reply/buttons — ✅ CORREGIDO
- **R2.3:** Bug en `STAGE_CHANGED` (from incorrecto) — ✅ CORREGIDO
- **R2.4:** No hay métricas de falsos positivos/negativos en escalamiento — ✅ CORREGIDO
- **R2.5:** Timestamps pueden no reflejar orden real si hay fallos entre append y save — ✅ CORREGIDO

### Resumen de Hallazgos (Secciones 21-30 - Puntos Ciegos)

**✅ OK (Secciones 21-30):**
- Existencia de `CONTEXT_RESUME` y `last_known_step`
- Actualización de `last_known_step` en pasos de diagnóstico
- Contrato formal de respuesta JSON
- Validación de coherencia reply/buttons implementada
- Mensajes de escalamiento comunican límites
- Timeout configurado en llamadas IA
- Mensajes de cierre existen
- Umbrales de escalamiento están definidos
- Métricas de escalamiento implementadas
- Logging comprehensivo implementado

**❌ FALLAS CRÍTICAS (P0) - Secciones 21-30:**
- **F21.1:** `CONTEXT_RESUME` no se activa automáticamente al detectar sesión existente
- **F21.2:** No hay validación de coherencia del estado previo
- **F22.1:** No hay versionado de flujo/esquema en conversaciones
- **F22.2:** No hay estrategia de migración o invalidación
- **F23.1:** No hay validación de eventos entrantes del frontend
- **F26.1:** No hay mensajes de "estoy procesando" durante latencia
- **F28.1:** No hay detección de preguntas fuera de alcance
- **F30.1:** No hay métricas de % resolución sin escalar
- **F30.4:** No hay almacenamiento persistente de métricas

**❌ FALLAS IMPORTANTES (P1) - Secciones 21-30:**
- **F21.3:** No hay consulta al usuario antes de retomar o reiniciar
- **F21.4:** No hay prevención de tickets duplicados en reanudación
- **F22.3:** No hay manejo de estados obsoletos
- **F23.2:** No hay protección contra eventos fuera de orden
- **F23.3:** No hay validación de que frontend pueda representar estados
- **F25.1:** No hay mensajes que comuniquen alcance limitado al inicio
- **F25.2:** No hay mensajes claros cuando se rechaza una solicitud
- **F26.2:** No hay prevención de doble envío durante latencia (ventana muy corta)
- **F28.2:** No hay detección de inputs sin sentido
- **F30.2:** No hay métricas de tiempo medio de resolución
- **F30.3:** No hay métricas de abandono

### Dictamen Consolidado (Secciones 1-30)

**❌ NO-GO PARA PRODUCCIÓN**

**Razones Principales:**
1. **11 fallas P0 bloqueantes** identificadas en total:
   - 2 de secciones 1-20 (multimodalidad, validación imágenes)
   - 9 de secciones 21-30 (reanudación, versionado, validación frontend, latencia, alcance, métricas)
2. **Ausencia de evidencia** en secciones críticas:
   - Versionado de flujos (Sección 22)
   - Métricas persistentes (Sección 30)
   - Reanudación automática (Sección 21)
   - Validación de eventos frontend (Sección 23)
3. **Riesgos operativos** no mitigados:
   - Experiencia rota (usuario que vuelve no recibe oferta de reanudación)
   - Estados ilegales (conversaciones antiguas con esquema incompatible)
   - Desincronización frontend/backend (eventos inválidos no validados)
   - Sistema "a ciegas" (métricas no persisten)

**Requisitos para GO:**
1. **Secciones 1-20:**
   - Implementar procesamiento de imágenes con Vision API (o remover funcionalidad)
   - Agregar validación de tamaño y formato de imágenes
2. **Secciones 21-30:**
   - Implementar activación automática de `CONTEXT_RESUME` al detectar inactividad
   - Agregar validación de coherencia del estado previo
   - Implementar versionado de flujo/esquema en conversaciones
   - Agregar estrategia de migración o invalidación
   - Implementar validación estricta de eventos entrantes del frontend
   - Agregar mensajes de "procesando" durante latencia
   - Implementar detección de preguntas fuera de alcance
   - Agregar métricas de % resolución sin escalar
   - Implementar almacenamiento persistente de métricas
3. **Evidencia requerida:**
   - Tests de reanudación de sesión
   - Tests de compatibilidad de versiones
   - Tests de validación de eventos frontend
   - Logs de métricas persistentes
   - Transcripts de casos límite

**Firmado como:**
**AUDITOR EXTERNO INDEPENDIENTE**  
**RESPONSABLE DEL DICTAMEN**  
**CONSIDERANDO SECCIONES 1-30 (AUDITORÍA ULTRA-PROFUNDA + PUNTOS CIEGOS)**

---

**FIN DE AUDITORÍA EXTERNA ULTRA-PROFUNDA**

