# AUDITORÍA PUNTOS CIEGOS CRÍTICOS (SECCIONES 21-30)
## TECNOS STI — ANEXO INTEGRADO A AUDITORÍA EXTERNA ULTRA-PROFUNDA

**CLASIFICACIÓN:** CONFIDENCIAL — SISTEMA EN EVALUACIÓN CRÍTICA  
**AUDITOR:** EXTERNO INDEPENDIENTE  
**FECHA:** 2024  
**METODOLOGÍA:** ISO/IEC 25010, ISO/IEC 29119, ISO/IEC 27001/27701, SRE Principles, AI Governance

---

## NOTA DE CONTROL

Las siguientes secciones son **BLOQUEANTES** para dictamen GO/NO-GO.  
La ausencia de evidencia en cualquiera de ellas implica **NO-GO AUTOMÁTICO**.

---

## SECCIÓN 21 — CONTINUIDAD DE CONTEXTO Y REANUDACIÓN DE SESIONES (P0)

### Objetivo
Auditar exhaustivamente el comportamiento de Tecnos cuando la sesión NO es continua.

### Escenarios Obligatorios
- Cierre del navegador
- Pérdida de conexión
- Refresh
- Reingreso horas o días después
- Reingreso desde otro dispositivo

### Hallazgos

#### ✅ OK 21.1: Existencia de `CONTEXT_RESUME` y `last_known_step`

**Evidencia:**
```2757:2774:server.js
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

**Análisis:** ✅ Existe función `resumeContext()` que genera mensaje de reanudación con botones.

#### ✅ OK 21.2: Actualización de `last_known_step` en pasos de diagnóstico

**Evidencia:**
```2476:2482:server.js
  // Actualizar last_known_step para CONTEXT_RESUME
  if (conversation && session.context.problem_description_raw) {
    const stepDescription = session.context.diagnostic_attempts 
      ? `Paso ${session.context.diagnostic_attempts + 1} de diagnóstico para: ${session.context.problem_description_raw}`
      : `Diagnóstico inicial para: ${session.context.problem_description_raw}`;
    session.context.last_known_step = stepDescription;
  }
```

**Análisis:** ✅ `last_known_step` se actualiza en cada paso de diagnóstico.

#### ❌ FALLA 21.1: `CONTEXT_RESUME` no se activa automáticamente al detectar sesión existente

**Ubicación:** `server.js` líneas 3123-3195 (`handleChatMessage`)

**Evidencia:**
- No hay lógica que detecte si el usuario está retomando una sesión después de inactividad
- `resumeContext()` existe pero nunca se llama automáticamente
- Solo se activaría si hay un handler específico para `CONTEXT_RESUME` en el switch

**Riesgo:** 
- **P0 (Bloqueante)**: Usuario que cierra navegador y vuelve horas después no recibe oferta de reanudación
- Experiencia rota, frustración, pérdida de confianza
- Usuario debe explicar todo de nuevo

**Fix propuesto:**
```javascript
// En handleChatMessage, después de cargar conversation:
if (conversation && session.context.last_known_step) {
  // Detectar inactividad (último evento > 5 minutos)
  const lastEvent = conversation.transcript[conversation.transcript.length - 1];
  if (lastEvent && lastEvent.t) {
    const lastEventTime = new Date(lastEvent.t).getTime();
    const now = Date.now();
    const minutesSinceLastEvent = (now - lastEventTime) / (1000 * 60);
    
    if (minutesSinceLastEvent > 5) {
      // Ofrecer reanudación
      const resumeResult = await resumeContext(session, conversation);
      if (resumeResult) {
        return resumeResult;
      }
    }
  }
}
```

#### ❌ FALLA 21.2: No hay validación de coherencia del estado previo

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay validación de que `session.stage` sea compatible con `conversation.status`
- No hay verificación de que campos requeridos (`device_type`, `problem_description`) estén presentes
- No hay detección de estados corruptos o incompatibles

**Riesgo:**
- **P0 (Bloqueante)**: Estado corrupto puede causar crash o comportamiento errático
- FSM puede entrar en estado ilegal

**Fix propuesto:**
```javascript
function validateConversationState(session, conversation) {
  const requiredFields = ['conversation_id', 'user', 'status'];
  for (const field of requiredFields) {
    if (!conversation[field]) {
      return { valid: false, reason: `Missing required field: ${field}` };
    }
  }
  
  // Validar que stage sea válido
  const validStages = ['ASK_CONSENT', 'ASK_LANGUAGE', 'ASK_NAME', 'ASK_USER_LEVEL', 
                       'ASK_DEVICE_CATEGORY', 'ASK_DEVICE_TYPE_MAIN', 'ASK_DEVICE_TYPE_EXTERNAL',
                       'ASK_PROBLEM', 'DIAGNOSTIC_STEP', 'ASK_FEEDBACK', 'ENDED'];
  if (!validStages.includes(session.stage)) {
    return { valid: false, reason: `Invalid stage: ${session.stage}` };
  }
  
  return { valid: true };
}
```

#### ❌ FALLA 21.3: No hay consulta al usuario antes de retomar o reiniciar

**Ubicación:** `server.js` - No existe handler para `CONTEXT_RESUME`

**Evidencia:**
- No hay case en el switch para `CONTEXT_RESUME`
- Usuario no puede elegir entre retomar o reiniciar

**Riesgo:**
- **P1 (Importante)**: Usuario puede querer reiniciar pero el sistema intenta retomar automáticamente

**Fix propuesto:**
```javascript
case 'CONTEXT_RESUME':
  const resumeInput = userInput.toLowerCase().trim();
  if (resumeInput.includes('sí') || resumeInput.includes('si') || resumeInput.includes('yes')) {
    // Retomar desde last_known_step
    session.stage = 'DIAGNOSTIC_STEP';
    // Continuar con diagnóstico
  } else {
    // Reiniciar
    session.stage = 'ASK_CONSENT';
    session.context.last_known_step = null;
  }
  break;
```

#### ❌ FALLA 21.4: No hay prevención de tickets duplicados en reanudación

**Ubicación:** `server.js` - No existe

**Evidencia:**
- Si usuario reanuda y luego escala, puede crear ticket duplicado
- No hay verificación de `conversation.status === 'escalated'` antes de crear ticket

**Riesgo:**
- **P1 (Importante)**: Tickets duplicados confunden a técnicos

**Fix propuesto:**
```javascript
// En escalateToTechnician:
if (conversation.status === 'escalated') {
  // Ya hay ticket, retornar mensaje informativo
  return {
    reply: session.language === 'es-AR'
      ? 'Ya creamos un ticket para tu caso. Podés contactarnos por WhatsApp usando el mismo número.'
      : 'We already created a ticket for your case. You can contact us via WhatsApp using the same number.',
    buttons: [],
    stage: 'ASK_FEEDBACK'
  };
}
```

### Resumen Sección 21

- ✅ **OK:** 2 hallazgos (existencia de `CONTEXT_RESUME`, actualización de `last_known_step`)
- ❌ **FALLAS:** 4 fallas (P0: 2, P1: 2)
- ⚠️ **RIESGOS:** Experiencia rota, frustración, pérdida de confianza, estados ilegales

**VEREDICTO SECCIÓN 21:** ❌ **NO-GO** (fallas P0 bloqueantes)

---

## SECCIÓN 22 — VERSIONADO DE FLUJOS Y COMPATIBILIDAD TEMPORAL (P0 SILENCIOSO)

### Objetivo
Auditar cómo Tecnos maneja conversaciones iniciadas bajo versiones anteriores del flujo o del código.

### Hallazgos

#### ❌ FALLA 22.1: No hay versionado de flujo/esquema en conversaciones

**Ubicación:** `server.js` - No existe campo `flow_version` o `schema_version`

**Evidencia:**
```1754:1763:server.js
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
```

**Análisis:** ❌ No hay campo `flow_version` o `schema_version` en la estructura de conversación.

**Riesgo:**
- **P0 (Bloqueante)**: Conversación iniciada pre-deploy puede continuar post-deploy con esquema incompatible
- Estados obsoletos pueden causar crashes
- Bugs imposibles de reproducir

**Fix propuesto:**
```javascript
const FLOW_VERSION = '2.0.0'; // Definir al inicio del archivo

const newConversation = {
  conversation_id: conversationId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  flow_version: FLOW_VERSION, // Agregar
  schema_version: '1.0', // Agregar
  language: selectedLanguage,
  user: { name_norm: null },
  status: 'open',
  feedback: 'none',
  transcript: []
};
```

#### ❌ FALLA 22.2: No hay estrategia de migración o invalidación

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay función `migrateConversation()` o `validateConversationVersion()`
- No hay lógica que detecte conversaciones con versiones antiguas

**Riesgo:**
- **P0 (Bloqueante)**: Conversaciones antiguas pueden causar errores al procesar con código nuevo
- Estados incompatibles pueden corromper datos

**Fix propuesto:**
```javascript
async function validateConversationVersion(conversation) {
  const CURRENT_FLOW_VERSION = '2.0.0';
  const CURRENT_SCHEMA_VERSION = '1.0';
  
  if (!conversation.flow_version || conversation.flow_version !== CURRENT_FLOW_VERSION) {
    // Versión antigua - migrar o invalidar
    if (conversation.flow_version === '1.0.0') {
      // Migrar de v1.0.0 a v2.0.0
      return await migrateConversationV1ToV2(conversation);
    } else {
      // Versión desconocida - invalidar
      return { valid: false, shouldRestart: true };
    }
  }
  
  return { valid: true };
}
```

#### ❌ FALLA 22.3: No hay manejo de estados obsoletos

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay validación de que `session.stage` sea válido para la versión actual
- No hay fallback si un stage fue eliminado o renombrado

**Riesgo:**
- **P1 (Importante)**: Stage obsoleto puede causar error en switch (default case)

**Fix propuesto:**
```javascript
// En handleChatMessage, antes del switch:
const validStages = ['ASK_CONSENT', 'ASK_LANGUAGE', 'ASK_NAME', ...];
if (!validStages.includes(session.stage)) {
  // Stage obsoleto - resetear a ASK_CONSENT
  await log('WARN', 'Stage obsoleto detectado, reseteando', { 
    old_stage: session.stage, 
    conversation_id: session.conversation_id 
  });
  session.stage = 'ASK_CONSENT';
}
```

### Resumen Sección 22

- ❌ **FALLAS:** 3 fallas (P0: 2, P1: 1)
- ⚠️ **RIESGOS:** Bugs imposibles de reproducir, estados ilegales, tickets corruptos

**VEREDICTO SECCIÓN 22:** ❌ **NO-GO** (fallas P0 bloqueantes)

---

## SECCIÓN 23 — CONTRATO FRONTEND ↔ BACKEND (DESINCRONIZACIÓN) (P0)

### Objetivo
Auditar el sistema como distribuido, no solo backend.

### Hallazgos

#### ✅ OK 23.1: Contrato formal de respuesta JSON

**Evidencia:**
```3616:3625:server.js
    const frontendResponse = {
      ok: true,
      reply: response.reply,
      sid: sessionId,
      stage: response.stage,
      options: response.buttons ? response.buttons.map(b => b.label || b.value) : [],
      buttons: response.buttons || [],
      endConversation: response.endConversation || false
    };
```

**Análisis:** ✅ Formato de respuesta JSON está definido y es consistente.

#### ❌ FALLA 23.1: No hay validación de eventos entrantes del frontend

**Ubicación:** `server.js` línea 3597 (`/api/chat`)

**Evidencia:**
```3597:3607:server.js
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const { sessionId, message, imageBase64, imageName, request_id } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId requerido' });
    }
    
    if (!message && !imageBase64) {
      return res.status(400).json({ ok: false, error: 'message o imageBase64 requerido' });
    }
```

**Análisis:** ❌ Solo valida presencia de `sessionId` y `message/imageBase64`, pero no valida:
- Formato de `sessionId` (puede ser cualquier string)
- Tipo de `message` (puede ser número, objeto, etc.)
- Formato de `imageBase64` (puede ser string inválido)
- Orden de eventos (no valida que eventos estén en orden cronológico)

**Riesgo:**
- **P0 (Bloqueante)**: Eventos inválidos pueden causar crashes o comportamiento errático
- Desincronización entre frontend y backend

**Fix propuesto:**
```javascript
// Validación estricta de entrada
function validateChatRequest(body) {
  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.length < 1) {
    return { valid: false, error: 'sessionId debe ser string no vacío' };
  }
  
  if (body.message && typeof body.message !== 'string') {
    return { valid: false, error: 'message debe ser string' };
  }
  
  if (body.imageBase64 && typeof body.imageBase64 !== 'string') {
    return { valid: false, error: 'imageBase64 debe ser string' };
  }
  
  if (body.request_id && typeof body.request_id !== 'string') {
    return { valid: false, error: 'request_id debe ser string' };
  }
  
  return { valid: true };
}
```

#### ❌ FALLA 23.2: No hay protección contra eventos fuera de orden

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay validación de que eventos estén en orden cronológico
- No hay detección de eventos duplicados o fuera de secuencia

**Riesgo:**
- **P1 (Importante)**: Eventos fuera de orden pueden causar estados inconsistentes

**Fix propuesto:**
```javascript
// Agregar timestamp a cada request y validar orden
if (conversation && body.timestamp) {
  const lastEvent = conversation.transcript[conversation.transcript.length - 1];
  if (lastEvent && lastEvent.t && new Date(body.timestamp) < new Date(lastEvent.t)) {
    // Evento fuera de orden - rechazar
    return res.status(400).json({ 
      ok: false, 
      error: 'Evento fuera de orden cronológico' 
    });
  }
}
```

#### ❌ FALLA 23.3: No hay validación de que frontend pueda representar estados

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay validación de que `stage` retornado sea renderizable por frontend
- No hay validación de que `buttons` tengan formato correcto para frontend

**Riesgo:**
- **P1 (Importante)**: FSM correcta en backend, UX incoherente en frontend

**Fix propuesto:**
```javascript
// Validar que buttons tengan formato correcto
function validateButtonsForFrontend(buttons) {
  if (!Array.isArray(buttons)) return false;
  
  for (const btn of buttons) {
    if (!btn.label || typeof btn.label !== 'string') return false;
    if (!btn.token || typeof btn.token !== 'string') return false;
    if (btn.order && (typeof btn.order !== 'number' || btn.order < 1 || btn.order > 4)) {
      return false;
    }
  }
  
  return true;
}
```

### Resumen Sección 23

- ✅ **OK:** 1 hallazgo (contrato JSON formal)
- ❌ **FALLAS:** 3 fallas (P0: 1, P1: 2)
- ⚠️ **RIESGOS:** Desincronización frontend/backend, estados inconsistentes

**VEREDICTO SECCIÓN 23:** ❌ **NO-GO** (falla P0 bloqueante)

---

## SECCIÓN 24 — COHERENCIA SEMÁNTICA TEXTO ↔ BOTONES (UX CRÍTICO)

### Objetivo
Auditar que el texto emitido por Tecnos sea semánticamente coherente con las acciones ofrecidas al usuario.

### Hallazgos

#### ✅ OK 24.1: Validación de coherencia reply/buttons implementada

**Evidencia:**
```490:520:server.js
/**
 * P2.2: Valida coherencia semántica entre reply y buttons
 */
function validateReplyButtonsCoherence(reply, buttons) {
  if (!reply || !buttons || buttons.length === 0) {
    return { coherent: true }; // Sin botones es válido
  }
  
  const replyLower = reply.toLowerCase();
  
  // Detectar contradicciones sutiles
  // 1. Reply dice "no puedo ayudar" pero hay botones de acción
  if ((replyLower.includes('no puedo') || replyLower.includes('no puedo ayudarte')) && 
      buttons.some(b => b.label && (b.label.toLowerCase().includes('continuar') || b.label.toLowerCase().includes('siguiente')))) {
    return { coherent: false, reason: 'Reply dice "no puedo" pero hay botones de acción' };
  }
  
  // 2. Reply pregunta algo pero botones no responden la pregunta
  if (replyLower.includes('?') && !buttons.some(b => {
    const btnLabel = b.label?.toLowerCase() || '';
    return btnLabel.includes('sí') || btnLabel.includes('no') || btnLabel.includes('yes');
  })) {
    return { coherent: false, reason: 'Reply hace pregunta pero botones no responden' };
  }
  
  return { coherent: true };
}
```

**Análisis:** ✅ Existe función de validación de coherencia semántica.

#### ✅ OK 24.2: Validación se usa en `iaStep`

**Evidencia:**
```1617:1635:server.js
    // P2.2: Validar coherencia semántica reply/buttons
    const coherenceCheck = validateReplyButtonsCoherence(result.reply, result.buttons);
    if (!coherenceCheck.coherent) {
      await log('WARN', 'Coherencia reply/buttons falló', {
        conversation_id: conversationId,
        reason: coherenceCheck.reason,
        reply_preview: result.reply.substring(0, 100),
        buttons: result.buttons.map(b => b.label)
      });
      // No fallar, solo loggear (mejora opcional)
    }
```

**Análisis:** ✅ Validación se ejecuta y se loggea, aunque no bloquea (mejora opcional).

#### ⚠️ RIESGO 24.1: Validación no bloquea, solo loggea

**Ubicación:** `server.js` línea 1620

**Evidencia:**
- Validación detecta incoherencias pero no corrige ni bloquea
- Solo loggea warning

**Riesgo:**
- **P2 (Mejora)**: Incoherencias pueden llegar al usuario aunque se detecten

**Fix propuesto:**
```javascript
if (!coherenceCheck.coherent) {
  // Intentar corregir automáticamente
  if (replyLower.includes('?') && buttons.length === 0) {
    // Agregar botones de respuesta
    result.buttons = [
      { token: 'BTN_YES', label: 'Sí', value: 'yes', order: 1 },
      { token: 'BTN_NO', label: 'No', value: 'no', order: 2 }
    ];
  }
}
```

### Resumen Sección 24

- ✅ **OK:** 2 hallazgos (validación implementada y usada)
- ⚠️ **RIESGOS:** 1 riesgo (validación no bloquea)

**VEREDICTO SECCIÓN 24:** ✅ **GO** (con mejora recomendada)

---

## SECCIÓN 25 — GESTIÓN DE EXPECTATIVAS Y ALCANCE DECLARADO (P1 REPUTACIONAL)

### Objetivo
Auditar cómo Tecnos comunica qué puede hacer, qué NO puede hacer, cuándo necesita escalar, y por qué no puede continuar.

### Hallazgos

#### ✅ OK 25.1: Mensajes de escalamiento comunican límites

**Evidencia:**
```2358:2360:server.js
      const escalationText = session.language === 'es-AR'
        ? `Entiendo que necesitás más ayuda. Te recomiendo hablar con un técnico.\n\n📱 Podés contactarnos por WhatsApp: ${ticket.whatsapp_url}\n\n¿Te sirvió esta ayuda?`
        : `I understand you need more help. I recommend talking to a technician.\n\n📱 You can contact us via WhatsApp: ${ticket.whatsapp_url}\n\nWas this help useful?`;
```

**Análisis:** ✅ Mensaje de escalamiento comunica claramente que se necesita ayuda humana.

#### ❌ FALLA 25.1: No hay mensajes que comuniquen alcance limitado al inicio

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay mensaje en `ASK_CONSENT` o `ASK_LANGUAGE` que comunique qué puede y no puede hacer Tecnos
- Usuario puede tener expectativas incorrectas

**Riesgo:**
- **P1 (Importante)**: Usuario percibe "fallo" aunque el sistema actuó correctamente
- Frustración por expectativas no cumplidas

**Fix propuesto:**
```javascript
// En TEXTS.ASK_CONSENT, agregar:
es: `Hola, soy Tecnos, tu asistente técnico de STI. Te puedo ayudar con problemas de conectividad, instalaciones y diagnóstico básico.\n\n⚠️ **Importante:** Si el problema requiere acciones avanzadas o hay riesgo de pérdida de datos, te recomendaré contactar con un técnico.\n\n¿Aceptás que guarde esta conversación para poder ayudarte mejor?`
```

#### ❌ FALLA 25.2: No hay mensajes claros cuando se rechaza una solicitud

**Ubicación:** `server.js` - No existe handler para solicitudes fuera de alcance

**Evidencia:**
- No hay detección de solicitudes fuera de alcance (ej: "hackear wifi", "instalar software pirata")
- No hay mensaje claro de rechazo elegante

**Riesgo:**
- **P1 (Importante)**: Usuario puede percibir evasión o incompetencia

**Fix propuesto:**
```javascript
// Detectar solicitudes fuera de alcance
function isOutOfScope(userInput) {
  const outOfScopeKeywords = ['hackear', 'pirata', 'crack', 'bypass', 'robar'];
  return outOfScopeKeywords.some(kw => userInput.toLowerCase().includes(kw));
}

// En handleAskProblem:
if (isOutOfScope(userInput)) {
  return {
    reply: session.language === 'es-AR'
      ? 'Lo siento, no puedo ayudarte con esa solicitud. Mi objetivo es ayudarte con problemas técnicos legítimos y seguros. Si tenés un problema técnico específico, contame y te ayudo.'
      : 'Sorry, I can\'t help with that request. My goal is to help you with legitimate and safe technical issues. If you have a specific technical problem, tell me and I\'ll help.',
    buttons: [],
    stage: 'ASK_PROBLEM'
  };
}
```

### Resumen Sección 25

- ✅ **OK:** 1 hallazgo (mensajes de escalamiento)
- ❌ **FALLAS:** 2 fallas (P1: 2)
- ⚠️ **RIESGOS:** Percepción de fallo, frustración, evasión

**VEREDICTO SECCIÓN 25:** ⚠️ **GO CON MEJORAS** (fallas P1 no bloqueantes)

---

## SECCIÓN 26 — GESTIÓN DE SILENCIO, LATENCIA Y "TIEMPO MUERTO" (P0 UX)

### Objetivo
Auditar comportamiento durante llamadas IA largas, timeouts, y procesos internos.

### Hallazgos

#### ✅ OK 26.1: Timeout configurado en llamadas IA

**Evidencia:**
```86:86:server.js
const OPENAI_TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT_MS || '12000');
```

**Análisis:** ✅ Timeout de 12 segundos configurado (configurable vía env).

#### ❌ FALLA 26.1: No hay mensajes de "estoy procesando" durante latencia

**Ubicación:** `server.js` - No existe

**Evidencia:**
- Frontend no recibe respuesta inmediata durante llamadas IA
- Usuario puede pensar que el sistema se colgó

**Riesgo:**
- **P0 (Bloqueante)**: Abandono, doble envío, corrupción de flujo

**Fix propuesto:**
```javascript
// En /api/chat, enviar respuesta inmediata de "procesando"
app.post('/api/chat', chatLimiter, async (req, res) => {
  // Enviar respuesta inmediata
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked'
  });
  
  // Enviar mensaje de "procesando"
  res.write(JSON.stringify({
    ok: true,
    reply: 'Estoy procesando tu mensaje...',
    sid: sessionId,
    stage: session.stage,
    buttons: [],
    processing: true
  }));
  
  // Procesar en background
  handleChatMessage(sessionId, message || '', imageBase64, requestId)
    .then(response => {
      // Enviar respuesta final
      res.write(JSON.stringify({
        ...frontendResponse,
        processing: false
      }));
      res.end();
    });
});
```

#### ❌ FALLA 26.2: No hay prevención de doble envío durante latencia

**Ubicación:** `server.js` - Existe deduplicación pero solo para 5 segundos

**Evidencia:**
```3162:3188:server.js
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

**Análisis:** ⚠️ Deduplicación existe pero solo para 5 segundos. Si llamada IA tarda 12 segundos, usuario puede enviar duplicado después de 5 segundos.

**Riesgo:**
- **P1 (Importante)**: Doble envío puede causar procesamiento duplicado

**Fix propuesto:**
```javascript
// Extender ventana de deduplicación a 15 segundos (más que timeout de IA)
setTimeout(() => {
  recentSet.delete(inputHash);
}, 15000); // 15 segundos en lugar de 5
```

### Resumen Sección 26

- ✅ **OK:** 1 hallazgo (timeout configurado)
- ❌ **FALLAS:** 2 fallas (P0: 1, P1: 1)
- ⚠️ **RIESGOS:** Abandono, doble envío, corrupción de flujo

**VEREDICTO SECCIÓN 26:** ❌ **NO-GO** (falla P0 bloqueante)

---

## SECCIÓN 27 — CIERRE CONVERSACIONAL Y MEMORIA DE MARCA (P1)

### Objetivo
Auditar el cierre como experiencia completa, no solo feedback.

### Hallazgos

#### ✅ OK 27.1: Mensajes de cierre existen

**Evidencia:**
```3469:3492:server.js
        response = {
          reply: session.language === 'es-AR' 
            ? '¡Gracias! ¡Que tengas un buen día!'
            : 'Thank you! Have a great day!',
          buttons: [],
          stage: 'ENDED',
          endConversation: true
        };
      } else {
        // Feedback negativo - preguntar motivo (simplificado por ahora)
        response = {
          reply: session.language === 'es-AR'
            ? 'Gracias por tu feedback. Voy a trabajar en mejorar.\n\n¡Que tengas un buen día!'
            : 'Thanks for your feedback. I\'ll work on improving.\n\nHave a great day!',
          buttons: [],
          stage: 'ENDED',
          endConversation: true
        };
```

**Análisis:** ✅ Mensajes de cierre existen y son amigables.

#### ⚠️ RIESGO 27.1: No hay resumen final ni próximos pasos

**Ubicación:** `server.js` - No existe

**Evidencia:**
- Mensaje de cierre es genérico, no incluye resumen de lo que se hizo
- No hay próximos pasos sugeridos

**Riesgo:**
- **P2 (Mejora)**: Experiencia técnica correcta pero recuerdo negativo

**Fix propuesto:**
```javascript
// En ASK_FEEDBACK, antes de cerrar:
const summary = session.language === 'es-AR'
  ? `\n\n📋 **Resumen de lo que hicimos:**\n- Problema: ${session.context.problem_description_raw}\n- Pasos realizados: ${session.context.diagnostic_attempts || 0}\n- Resultado: ${conversation.feedback === 'positive' ? 'Resuelto' : 'Requiere seguimiento'}\n\nSi necesitás más ayuda, podés volver cuando quieras.`
  : `\n\n📋 **Summary of what we did:**\n- Problem: ${session.context.problem_description_raw}\n- Steps taken: ${session.context.diagnostic_attempts || 0}\n- Result: ${conversation.feedback === 'positive' ? 'Resolved' : 'Requires follow-up'}\n\nIf you need more help, you can come back anytime.`;

response.reply += summary;
```

### Resumen Sección 27

- ✅ **OK:** 1 hallazgo (mensajes de cierre)
- ⚠️ **RIESGOS:** 1 riesgo (no hay resumen final)

**VEREDICTO SECCIÓN 27:** ✅ **GO** (con mejora recomendada)

---

## SECCIÓN 28 — AUDITORÍA DE "NO RESPUESTA" Y RECHAZO CONTROLADO (P0)

### Objetivo
Auditar cómo Tecnos actúa cuando decide NO responder directamente.

### Hallazgos

#### ❌ FALLA 28.1: No hay detección de preguntas fuera de alcance

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay función que detecte preguntas fuera de alcance técnico
- No hay rechazo elegante

**Riesgo:**
- **P0 (Bloqueante)**: Sistema puede intentar responder preguntas no técnicas (ej: "¿qué hora es?", "cuéntame un chiste")

**Fix propuesto:**
```javascript
function isOutOfScope(userInput) {
  const outOfScopePatterns = [
    /^(qué hora|what time)/i,
    /^(cuéntame|tell me).*(chiste|joke)/i,
    /^(cómo está|how are you)/i
  ];
  
  return outOfScopePatterns.some(pattern => pattern.test(userInput));
}

// En handleChatMessage:
if (isOutOfScope(userInput) && session.stage !== 'ASK_CONSENT' && session.stage !== 'ASK_LANGUAGE') {
  return {
    reply: session.language === 'es-AR'
      ? 'Soy Tecnos, tu asistente técnico. Estoy acá para ayudarte con problemas de tu equipo. ¿Tenés algún problema técnico que pueda ayudarte a resolver?'
      : 'I\'m Tecnos, your technical assistant. I\'m here to help you with problems with your device. Do you have any technical problem I can help you solve?',
    buttons: [],
    stage: session.stage
  };
}
```

#### ❌ FALLA 28.2: No hay detección de inputs sin sentido

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay validación de que input tenga sentido (ej: "asdfghjkl", "123456")

**Riesgo:**
- **P1 (Importante)**: Inputs sin sentido pueden causar llamadas IA innecesarias

**Fix propuesto:**
```javascript
function isNonsensicalInput(userInput) {
  // Detectar strings repetitivos
  if (/^(.)\1{10,}$/.test(userInput.trim())) {
    return true; // "aaaaaaaaaaa"
  }
  
  // Detectar solo números
  if (/^\d{10,}$/.test(userInput.trim())) {
    return true; // "1234567890"
  }
  
  // Detectar muy corto sin sentido
  if (userInput.trim().length < 3 && !/^(sí|si|no|yes|no)$/i.test(userInput.trim())) {
    return true;
  }
  
  return false;
}
```

#### ⚠️ RIESGO 28.1: No hay redirección segura cuando no se puede responder

**Ubicación:** `server.js` - No existe

**Evidencia:**
- Si sistema no puede responder, puede retornar respuesta vacía o genérica
- No hay redirección clara a escalamiento

**Riesgo:**
- **P1 (Importante)**: Percepción de evasión o incompetencia

### Resumen Sección 28

- ❌ **FALLAS:** 2 fallas (P0: 1, P1: 1)
- ⚠️ **RIESGOS:** 1 riesgo (no hay redirección segura)

**VEREDICTO SECCIÓN 28:** ❌ **NO-GO** (falla P0 bloqueante)

---

## SECCIÓN 29 — UMBRALES DE ESCALAMIENTO (ANTI-PATRÓN CRÍTICO)

### Objetivo
Auditar si Tecnos escala demasiado pronto, demasiado tarde, o de forma inconsistente.

### Hallazgos

#### ✅ OK 29.1: Umbrales de escalamiento están definidos

**Evidencia:**
```2063:2065:server.js
    // Si más de 2 intentos, escalar a técnico
    if (session.context.clarification_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'clarification_failed');
```

```2528:2531:server.js
    // Si más de 2 intentos, escalar
    if (session.context.diagnostic_attempts >= 2) {
      return await escalateToTechnician(session, conversation, 'multiple_attempts_failed');
    }
```

**Análisis:** ✅ Umbrales están definidos: 2 intentos de clarificación, 2 intentos de diagnóstico.

#### ✅ OK 29.2: Métricas de escalamiento implementadas

**Evidencia:**
```2268:2295:server.js
// P2.4: Métricas de escalamiento (falsos positivos/negativos)
const escalationMetrics = new Map(); // conversationId -> { total: number, false_positives: number, false_negatives: number }

/**
 * P2.4: Registrar métrica de escalamiento
 */
function recordEscalationMetric(conversationId, reason, isFalsePositive = false, isFalseNegative = false) {
  if (!conversationId) return;
  
  const metrics = escalationMetrics.get(conversationId) || { total: 0, false_positives: 0, false_negatives: 0 };
  metrics.total++;
  if (isFalsePositive) metrics.false_positives++;
  if (isFalseNegative) metrics.false_negatives++;
  
  escalationMetrics.set(conversationId, metrics);
  
  // Log cada 5 escalamientos
  if (metrics.total % 5 === 0) {
    log('INFO', 'Métricas de escalamiento', {
      conversation_id: conversationId,
      total: metrics.total,
      false_positives: metrics.false_positives,
      false_negatives: metrics.false_negatives,
      false_positive_rate: (metrics.false_positives / metrics.total * 100).toFixed(2) + '%',
      false_negative_rate: (metrics.false_negatives / metrics.total * 100).toFixed(2) + '%'
    });
  }
}
```

**Análisis:** ✅ Sistema de métricas implementado para trackear falsos positivos/negativos.

#### ⚠️ RIESGO 29.1: Umbrales pueden ser demasiado bajos o altos

**Ubicación:** `server.js` - Umbrales hardcodeados

**Evidencia:**
- Umbral de 2 intentos puede ser demasiado bajo para problemas complejos
- No hay ajuste dinámico según tipo de problema

**Riesgo:**
- **P2 (Mejora)**: Escalamiento prematuro o tardío según contexto

**Fix propuesto:**
```javascript
// Hacer umbrales configurables
const ESCALATION_THRESHOLDS = {
  clarification: parseInt(process.env.ESCALATION_THRESHOLD_CLARIFICATION || '2'),
  diagnostic: parseInt(process.env.ESCALATION_THRESHOLD_DIAGNOSTIC || '2'),
  risk_level: {
    high: 1, // Escalar inmediatamente si riesgo alto
    medium: 2,
    low: 3
  }
};
```

### Resumen Sección 29

- ✅ **OK:** 2 hallazgos (umbrales definidos, métricas implementadas)
- ⚠️ **RIESGOS:** 1 riesgo (umbrales pueden no ser óptimos)

**VEREDICTO SECCIÓN 29:** ✅ **GO** (con mejora recomendada)

---

## SECCIÓN 30 — MÉTRICAS OPERATIVAS Y MEJORA CONTINUA (P0 ESTRATÉGICO)

### Objetivo
Auditar existencia y confiabilidad de métricas reales para mejora continua.

### Hallazgos

#### ✅ OK 30.1: Métricas de escalamiento implementadas

**Evidencia:** (Ver Sección 29.2)

**Análisis:** ✅ Métricas de escalamiento (falsos positivos/negativos) están implementadas.

#### ✅ OK 30.2: Logging comprehensivo implementado

**Evidencia:**
- Sistema de logging con `log()` function
- Eventos de transcript incluyen información detallada

**Análisis:** ✅ Logging permite reconstrucción de eventos.

#### ❌ FALLA 30.1: No hay métricas de % resolución sin escalar

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay contador de conversaciones resueltas vs escaladas
- No hay cálculo de tasa de resolución

**Riesgo:**
- **P0 (Bloqueante)**: No se puede medir efectividad del sistema
- No hay datos para mejora continua

**Fix propuesto:**
```javascript
const resolutionMetrics = new Map(); // conversationId -> { resolved: boolean, escalated: boolean, steps_taken: number }

// En handleDiagnosticStep, cuando se resuelve:
if (buttonToken === 'BTN_RESOLVED') {
  const metrics = resolutionMetrics.get(conversation.conversation_id) || { resolved: false, escalated: false, steps_taken: 0 };
  metrics.resolved = true;
  metrics.steps_taken = session.context.diagnostic_attempts || 0;
  resolutionMetrics.set(conversation.conversation_id, metrics);
}

// En escalateToTechnician:
const metrics = resolutionMetrics.get(conversation.conversation_id) || { resolved: false, escalated: false, steps_taken: 0 };
metrics.escalated = true;
metrics.steps_taken = session.context.diagnostic_attempts || 0;
resolutionMetrics.set(conversation.conversation_id, metrics);
```

#### ❌ FALLA 30.2: No hay métricas de tiempo medio de resolución

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay tracking de tiempo desde inicio hasta resolución/escalamiento
- No hay cálculo de tiempo medio

**Riesgo:**
- **P1 (Importante)**: No se puede medir eficiencia del sistema

**Fix propuesto:**
```javascript
// En handleAskLanguage, cuando se crea conversación:
newConversation.started_at = new Date().toISOString();

// En handleDiagnosticStep, cuando se resuelve:
if (buttonToken === 'BTN_RESOLVED') {
  const startedAt = new Date(conversation.started_at);
  const resolvedAt = new Date();
  const resolutionTimeMinutes = (resolvedAt - startedAt) / (1000 * 60);
  
  await appendToTranscript(conversation.conversation_id, {
    role: 'system',
    type: 'event',
    name: 'RESOLUTION_TIME',
    payload: { minutes: resolutionTimeMinutes }
  });
}
```

#### ❌ FALLA 30.3: No hay métricas de abandono

**Ubicación:** `server.js` - No existe

**Evidencia:**
- No hay detección de conversaciones abandonadas (sin actividad > X minutos)
- No hay cálculo de tasa de abandono

**Riesgo:**
- **P1 (Importante)**: No se puede medir engagement del usuario

**Fix propuesto:**
```javascript
// Función para detectar abandono
async function detectAbandonedConversations() {
  const conversations = await fs.readdir(CONVERSATIONS_DIR);
  const abandoned = [];
  
  for (const file of conversations) {
    if (!file.endsWith('.json')) continue;
    const conversation = await loadConversation(file.replace('.json', ''));
    if (!conversation || conversation.status === 'closed' || conversation.status === 'escalated') continue;
    
    const lastEvent = conversation.transcript[conversation.transcript.length - 1];
    if (lastEvent && lastEvent.t) {
      const lastEventTime = new Date(lastEvent.t).getTime();
      const now = Date.now();
      const minutesSinceLastEvent = (now - lastEventTime) / (1000 * 60);
      
      if (minutesSinceLastEvent > 30) { // 30 minutos sin actividad
        abandoned.push(conversation.conversation_id);
      }
    }
  }
  
  return abandoned;
}
```

#### ❌ FALLA 30.4: No hay almacenamiento persistente de métricas

**Ubicación:** `server.js` - Métricas solo en memoria

**Evidencia:**
```2269:2269:server.js
const escalationMetrics = new Map(); // conversationId -> { total: number, false_positives: number, false_negatives: number }
```

**Análisis:** ❌ Métricas están solo en memoria (`Map`), se pierden al reiniciar servidor.

**Riesgo:**
- **P0 (Bloqueante)**: Métricas no persisten, no hay datos históricos

**Fix propuesto:**
```javascript
// Guardar métricas en archivo
async function saveMetrics() {
  const metricsFile = path.join(CONVERSATIONS_DIR, 'metrics.json');
  const metricsData = {
    escalation: Object.fromEntries(escalationMetrics),
    resolution: Object.fromEntries(resolutionMetrics),
    updated_at: new Date().toISOString()
  };
  
  await fs.writeFile(metricsFile, JSON.stringify(metricsData, null, 2), 'utf-8');
}

// Guardar cada 5 minutos
setInterval(saveMetrics, 5 * 60 * 1000);
```

### Resumen Sección 30

- ✅ **OK:** 2 hallazgos (métricas de escalamiento, logging)
- ❌ **FALLAS:** 4 fallas (P0: 2, P1: 2)
- ⚠️ **RIESGOS:** Sistema "a ciegas", sin control evolutivo

**VEREDICTO SECCIÓN 30:** ❌ **NO-GO** (fallas P0 bloqueantes)

---

## RESUMEN GENERAL SECCIONES 21-30

### Hallazgos Totales

- ✅ **OK:** 10 hallazgos
- ❌ **FALLAS:** 18 fallas
  - **P0 (Bloqueantes):** 9 fallas
  - **P1 (Importantes):** 7 fallas
  - **P2 (Mejoras):** 2 fallas
- ⚠️ **RIESGOS:** 6 riesgos

### Veredictos por Sección

| Sección | Título | Veredicto | Prioridad |
|---------|--------|-----------|-----------|
| 21 | Continuidad de contexto | ❌ NO-GO | P0 |
| 22 | Versionado de flujos | ❌ NO-GO | P0 |
| 23 | Contrato frontend/backend | ❌ NO-GO | P0 |
| 24 | Coherencia semántica | ✅ GO | - |
| 25 | Gestión de expectativas | ⚠️ GO CON MEJORAS | P1 |
| 26 | Gestión de silencio/latencia | ❌ NO-GO | P0 |
| 27 | Cierre conversacional | ✅ GO | - |
| 28 | Rechazo controlado | ❌ NO-GO | P0 |
| 29 | Umbrales de escalamiento | ✅ GO | - |
| 30 | Métricas operativas | ❌ NO-GO | P0 |

### Fallas P0 Bloqueantes (9)

1. **21.1:** `CONTEXT_RESUME` no se activa automáticamente
2. **21.2:** No hay validación de coherencia del estado previo
3. **22.1:** No hay versionado de flujo/esquema
4. **22.2:** No hay estrategia de migración
5. **23.1:** No hay validación de eventos entrantes
6. **26.1:** No hay mensajes de "procesando" durante latencia
7. **28.1:** No hay detección de preguntas fuera de alcance
8. **30.1:** No hay métricas de % resolución sin escalar
9. **30.4:** No hay almacenamiento persistente de métricas

---

## VEREDICTO FINAL INTEGRADO (SECCIONES 1-30)

### Considerando Secciones 1-20 (Auditoría Ultra-Profunda)

**Veredicto:** ❌ **NO-GO** (fallas P0: multimodalidad no funcional, validación de imágenes)

### Considerando Secciones 21-30 (Puntos Ciegos)

**Veredicto:** ❌ **NO-GO** (9 fallas P0 bloqueantes)

### VEREDICTO FINAL CONSOLIDADO

**❌ NO-GO PARA PRODUCCIÓN**

**Razones:**
1. **11 fallas P0 bloqueantes** identificadas en total (2 de secciones 1-20, 9 de secciones 21-30)
2. **Ausencia de evidencia** en secciones críticas (versionado, métricas persistentes, reanudación automática)
3. **Riesgos operativos** no mitigados (experiencia rota, estados ilegales, desincronización)

**Requisitos para GO:**
1. Implementar todas las fallas P0 identificadas
2. Agregar evidencia de funcionamiento (tests, logs, transcripts)
3. Re-auditar secciones 21-30 después de fixes

---

**FIN DE AUDITORÍA PUNTOS CIEGOS (SECCIONES 21-30)**

