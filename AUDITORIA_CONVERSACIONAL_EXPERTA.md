# 🔍 AUDITORÍA CONVERSACIONAL EXPERTA
## Sistema STI Chatbot - Análisis de Flujo Bot-Humano

**Fecha:** 23 de Noviembre de 2025  
**Sistema:** STI Chat v7  
**Auditor:** GitHub Copilot (Claude Sonnet 4.5)  
**Tipo:** Análisis Exhaustivo de Experiencia Conversacional

---

## 📋 RESUMEN EJECUTIVO

### Puntuación Global: **8.2/10** ⭐⭐⭐⭐

**Fortalezas principales:**
- ✅ Arquitectura de estados bien definida y robusta
- ✅ Soporte multiidioma con localización inteligente
- ✅ Manejo de errores robusto con recuperación graceful
- ✅ Sistema de empatía y personalización avanzado
- ✅ Seguridad y validación de entrada exhaustiva

**Áreas críticas de mejora:**
- ⚠️ Función `basicITHeuristic` comentada (causa bugs si se descomenta)
- ⚠️ Inconsistencia en extracción de tokens de botones en frontend
- ⚠️ Falta de timeout de sesión explícito
- ⚠️ No hay sistema de recuperación de contexto tras desconexión

---

## 🏗️ 1. ARQUITECTURA DEL SISTEMA DE DIÁLOGO

### 1.1 Máquina de Estados

**Estados identificados:**
```javascript
STATES = {
  ASK_LANGUAGE,      // Selección de idioma inicial
  ASK_NAME,          // Captura del nombre
  ASK_NEED,          // Problema vs Tarea
  ASK_PROBLEM,       // Descripción del problema
  DISAMBIGUATE_DEV,  // Desambiguación de dispositivo
  BASIC_TESTS,       // Pasos básicos de diagnóstico
  ADVANCED_TESTS,    // Pasos avanzados
  ESCALATE,          // Decisión de escalamiento
  CREATE_TICKET,     // Creación de ticket
  ENDED              // Finalización
}
```

**✅ Fortalezas:**
- Separación clara de responsabilidades por estado
- Transiciones bien definidas
- Validación de entrada en cada estado
- Manejo de fallbacks por estado

**⚠️ Issues detectados:**
1. **NO HAY DIAGRAMA DE TRANSICIONES EXPLÍCITO** - Dificulta mantenimiento
2. **Estado DISAMBIGUATE_DEV sin manejo completo** - Línea 3696 maneja solo 3 dispositivos
3. **Transición ASK_LANGUAGE → ASK_NAME puede saltarse** - Si se detecta problema en nombre

**🔧 Recomendaciones:**
```javascript
// AGREGAR: Diagrama de transiciones como comentario
/*
FLOW DIAGRAM:
ASK_LANGUAGE → ASK_NAME → ASK_NEED → ASK_PROBLEM
                                    ↓
                              DISAMBIGUATE_DEV (si aplica)
                                    ↓
                              BASIC_TESTS → (resuelto) → ENDED
                                    ↓
                              (no resuelto)
                                    ↓
                              ESCALATE → ADVANCED_TESTS → ENDED
                                      → CREATE_TICKET → ENDED
*/

// AGREGAR: Validación de transiciones permitidas
const ALLOWED_TRANSITIONS = {
  ASK_LANGUAGE: ['ASK_NAME'],
  ASK_NAME: ['ASK_NEED', 'ASK_LANGUAGE'], // Permitir volver atrás
  ASK_NEED: ['ASK_PROBLEM'],
  // ... etc
};

function validateTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    console.warn(`[FLOW] Invalid transition: ${from} → ${to}`);
    return false;
  }
  return true;
}
```

### 1.2 Gestión de Sesiones

**✅ Implementación actual:**
- SessionId seguro: `srv-<timestamp>-<64_hex>` (82 chars)
- Almacenamiento en memoria con cache LRU (max 1000 sesiones)
- Persistencia en sessionStore.js

**⚠️ Issues críticos:**

#### **1.2.1 NO HAY TIMEOUT DE SESIÓN EXPLÍCITO**
```javascript
// PROBLEMA: Sesión nunca expira automáticamente
session = {
  startedAt: nowIso(),
  // FALTA: expiresAt, lastActivity
}

// SOLUCIÓN PROPUESTA:
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

async function getSession(sid) {
  const session = await getSessionFromStore(sid);
  if (!session) return null;
  
  const lastActivity = new Date(session.lastActivity || session.startedAt);
  const now = new Date();
  
  if (now - lastActivity > SESSION_TIMEOUT) {
    console.log(`[SESSION] Expired: ${sid}`);
    await deleteSession(sid);
    return null;
  }
  
  // Actualizar última actividad
  session.lastActivity = nowIso();
  await saveSession(sid, session);
  return session;
}
```

#### **1.2.2 Cache LRU sin límite de tiempo**
```javascript
// Línea 67: Limpieza cada 10 minutos, pero sin criterio de antigüedad máxima
setInterval(() => {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  for (const [sid, cached] of sessionCache.entries()) {
    if (cached.lastAccess < tenMinutesAgo) {
      sessionCache.delete(sid);
    }
  }
}, 10 * 60 * 1000);

// PROBLEMA: Una sesión activa puede permanecer en cache indefinidamente
// SOLUCIÓN: Agregar TTL absoluto
const MAX_SESSION_AGE = 2 * 60 * 60 * 1000; // 2 horas

setInterval(() => {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  const maxAge = Date.now() - MAX_SESSION_AGE;
  
  for (const [sid, cached] of sessionCache.entries()) {
    // Eliminar por inactividad O por antigüedad absoluta
    if (cached.lastAccess < tenMinutesAgo || cached.data.startedAt < maxAge) {
      sessionCache.delete(sid);
      deleteSession(sid); // También del store persistente
    }
  }
}, 10 * 60 * 1000);
```

---

## 🎯 2. MANEJO DE ENTRADA DEL USUARIO

### 2.1 Procesamiento de Botones

**✅ Backend (server.js líneas 2895-2916):**
```javascript
// CORRECTO: Extracción clara del token
if (body.action === 'button' && body.value) {
  buttonToken = String(body.value);
  // ...
}
```

**❌ Frontend (index.html línea 663):**
```javascript
// PROBLEMA: Fallback puede enviar texto en vez de token
const value = typeof option === 'string' ? option : (option.token || option.text || option);
```

**🐛 BUG CRÍTICO IDENTIFICADO:**
Si `option.token` es `undefined` o `null` (pero existe `option.text`), se envía el texto del botón en vez del token, causando que el backend no lo reconozca.

**Evidencia del bug:**
- Simulación PowerShell: Envía `{value: 'BTN_NO_NAME'}` ✅ Funciona
- Browser: Puede enviar `{value: 'Prefiero no decirlo'}` ❌ No funciona

**🔧 Solución inmediata:**
```javascript
// index.html línea 663 - REEMPLAZAR:
async function handleButtonClick(option) {
  // VALIDACIÓN ESTRICTA: Solo aceptar objetos con token
  if (typeof option === 'object' && option.token) {
    const value = option.token;
    const text = option.label || option.text || value;
    addMessage('user', text);
    await sendMessage(null, value);
  } else if (typeof option === 'string') {
    // Legacy: si es string, usarlo directamente
    addMessage('user', option);
    await sendMessage(null, option);
  } else {
    console.error('[BTN] Invalid button structure:', option);
    addMessage('bot', 'Error: botón inválido. Por favor recargá la página.');
  }
}
```

### 2.2 Validación de Nombre

**✅ Funciones implementadas:**
- `isValidName()` - Validación local
- `extractName()` - Extracción inteligente
- `looksClearlyNotName()` - Detección de no-nombres
- `analyzeNameWithOA()` - Validación con IA (opcional)

**⚠️ Issue: Función `basicITHeuristic` comentada**

```javascript
// Línea 3249-3251: CÓDIGO DESHABILITADO
// const maybeProblem = basicITHeuristic(t || '');
// const looksLikeProblem = maybeProblem && ...
const looksLikeProblem = false; // Desactivado temporalmente
```

**Análisis:**
- ✅ Correcto deshabilitarla si causa `ReferenceError`
- ❌ Deja sin efecto la detección temprana de problemas
- ❌ Comentario dice "temporalmente" pero no hay plan de reactivación

**🔧 Solución propuesta:**
```javascript
// OPCIÓN 1: Implementar basicITHeuristic local simple
function basicITHeuristic(text) {
  const itKeywords = /\b(compu|pc|notebook|impresora|mouse|teclado|monitor|router|wifi|internet|pantalla|no funciona|no prende|error|falla)\b/i;
  const problemKeywords = /\b(no funciona|no prende|no anda|no se conecta|no imprime|error|falla|problema)\b/i;
  const howToKeywords = /\b(como|cómo|quiero|necesito|ayuda para|instalar|configurar|conectar)\b/i;
  
  const isIT = itKeywords.test(text);
  const isProblem = problemKeywords.test(text);
  const isHowTo = howToKeywords.test(text);
  
  return { isIT, isProblem, isHowTo };
}

// OPCIÓN 2: Reutilizar analyzeProblemWithOA (ya existe) pero con fallback
async function detectProblemInNameInput(text, session) {
  if (!openai) {
    // Fallback local si no hay OpenAI
    return basicITHeuristic(text);
  }
  
  try {
    const result = await analyzeProblemWithOA(text, session.userLocale);
    return {
      isIT: result.isIT,
      isProblem: result.isProblem,
      isHowTo: result.isHowTo
    };
  } catch (e) {
    console.warn('[detectProblemInNameInput] OpenAI failed, using local:', e.message);
    return basicITHeuristic(text);
  }
}
```

### 2.3 Sanitización y Seguridad

**✅ Excelente implementación:**

#### Backend (server.js líneas 210-240):
```javascript
function maskPII(text) {
  // Emails, tarjetas, CBU, CUIT, teléfonos, DNI, IPs, contraseñas, tokens
  // ✅ MUY COMPLETO
}
```

#### Frontend (index.html líneas 545-558):
```javascript
function escapeHtml(text) { /* ... */ }
function validateInput(input, maxLength = 1000) { /* ... */ }
const safeText = escapeHtml(validateInput(text, 5000));
```

**✅ Fortalezas:**
- Múltiples capas de sanitización
- Rate limiting por IP + SessionId
- Content Security Policy estricto
- Validación de tipos de archivo (imágenes)
- Límite de tamaño (5MB)

**⚠️ Sugerencia menor:**
```javascript
// Agregar validación de caracteres peligrosos en nombres
function isValidName(text) {
  // AGREGAR: Rechazar caracteres sospechosos
  const dangerousChars = /[<>{}[\]\\\/\$\|\`]/;
  if (dangerousChars.test(text)) {
    return false;
  }
  // ... resto de validaciones existentes
}
```

---

## 💬 3. EXPERIENCIA CONVERSACIONAL

### 3.1 Naturalidad del Diálogo

**✅ Excelente personalización:**

#### Soporte multiidioma (es-AR, es-419, en):
```javascript
// Línea 2195: addEmpatheticResponse()
const responses = {
  'es-AR': ['¡Perfecto!', '¡Genial!', '¡Dale!', 'Buenísimo'],
  'es-419': ['¡Perfecto!', '¡Excelente!', '¡Vale!', 'Muy bien'],
  'en': ['Perfect!', 'Great!', 'Excellent!', 'Nice!']
};
```

**✅ Uso de voseo/tuteo correcto:**
```javascript
const reply = locale === 'es-419'
  ? "Cuéntame qué problema tienes."    // Tuteo (México, Chile, etc.)
  : "Contame qué problema tenés.";     // Voseo (Argentina)
```

**✅ Personalización con nombre:**
```javascript
const whoLabel = session.userName ? capitalizeToken(session.userName) : (isEn ? 'user' : 'usuario');
const reply = `Gracias, ${whoLabel}. 👍`;
```

**✅ Emojis contextuales:**
- 🛠️ Problema técnico
- 🤝 Asistencia
- ✔️ Resuelto
- ❌ Persiste
- 🙅 Prefiero no decirlo
- 💡 Idea/sugerencia

### 3.2 Claridad de Mensajes

**✅ Mensajes estructurados:**
```javascript
const intro = "Entiendo. Probemos estos pasos:";
const numbered = enumerateSteps(steps); // 1️⃣ Paso uno...
const footer = "\n\n🧩 Si necesitás ayuda, tocá el número.";
const fullMsg = intro + '\n\n' + numbered.join('\n') + footer;
```

**⚠️ Mensajes de error podrían ser más específicos:**

```javascript
// ACTUAL (línea 3172):
const retry = "Por favor, seleccioná una de las opciones usando los botones.";

// MEJORADO:
const attemptCount = session.languageAttempts || 0;
let retry;
if (attemptCount === 0) {
  retry = "No entendí el idioma. Por favor, seleccioná una de estas opciones:";
} else if (attemptCount === 1) {
  retry = "Por favor, usá los botones de arriba para elegir tu idioma.";
} else {
  retry = "👆 Tocá uno de los tres botones: 🇦🇷 Español (Argentina), 🌎 Español o 🇬🇧 English";
}
session.languageAttempts = attemptCount + 1;
```

### 3.3 Contador de Frustración

**✅ Sistema implementado:**
```javascript
// Línea 2951, 2992, 3002:
session.frustrationCount = (session.frustrationCount || 0) + 1;
```

**❌ PERO NO SE USA:**
```bash
grep -n "frustrationCount" server.js
# Resultado: Solo se incrementa, nunca se evalúa
```

**🔧 Solución propuesta:**
```javascript
// AGREGAR: Manejo proactivo de frustración
async function checkFrustration(session, sid, res) {
  const frustration = session.frustrationCount || 0;
  
  if (frustration >= 3 && frustration < 5) {
    // Nivel medio: Ofrecer ayuda extra
    const locale = session.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    
    const helpMsg = isEn
      ? "I notice you're having trouble. Would you like to connect with a technician directly?"
      : "Veo que estás teniendo problemas. ¿Querés conectar directo con un técnico?";
    
    session.transcript.push({ who: 'bot', text: helpMsg, ts: nowIso() });
    await saveSession(sid, session);
    
    return res.json(withOptions({
      ok: true,
      reply: helpMsg,
      stage: session.stage,
      options: buildUiButtonsFromTokens(['BTN_CONNECT_TECH', 'BTN_CONTINUE'], locale)
    }));
  }
  
  if (frustration >= 5) {
    // Nivel alto: Escalar automáticamente
    return await createTicketAndRespond(session, sid, res);
  }
  
  return null; // No intervenir aún
}

// USAR en handlers:
if (session.stage === STATES.ASK_NAME) {
  // ...
  if (candidate invalid) {
    session.frustrationCount++;
    
    // AGREGAR:
    const frustrationResponse = await checkFrustration(session, sid, res);
    if (frustrationResponse) return frustrationResponse;
    
    // ... continuar con mensaje de error normal
  }
}
```

---

## 🚨 4. MANEJO DE ERRORES Y CASOS EDGE

### 4.1 Recuperación de Errores

**✅ Excelente try-catch coverage:**
- Línea 3956-3994: Catch global en `/api/chat`
- Línea 809: Catch en `analyzeProblemWithOA`
- Línea 906: Catch en `aiQuickTests`
- Línea 981: Catch en `getHelpForStep`

**✅ Mensajes de error localizados:**
```javascript
const errorMsg = isEn 
  ? '😅 I had a momentary problem. Please try again.'
  : '😅 Tuve un problema momentáneo. Probá de nuevo.';
```

**⚠️ Issues detectados:**

#### 4.1.1 Error handler accede a variable undefined
```javascript
// Línea 3968: POTENCIAL BUG (ya corregido en una versión)
try {
  const sid = req.sessionId;
  const existingSession = await getSession(sid);
  if (existingSession && existingSession.userLocale) {
    locale = existingSession.userLocale;
  }
} catch (errLocale) {
  // Si falla, usar el default
}

// ✅ CORRECTO: No asume que session existe
```

#### 4.1.2 Timeouts en llamadas a OpenAI

**✅ Implementado:**
```javascript
// Línea 779-783:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s
const r = await openai.chat.completions.create({
  // ...
  signal: controller.signal
});
clearTimeout(timeoutId);
```

**🔧 Mejora sugerida:**
```javascript
// Agregar retry con backoff exponencial
async function callOpenAIWithRetry(params, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = 30000 + (attempt * 10000); // 30s, 40s, 50s
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const result = await openai.chat.completions.create({
        ...params,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(`[OpenAI] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 4.2 Casos Edge

#### 4.2.1 Límite de intentos en ASK_NAME

**✅ Implementado:**
```javascript
// Línea 3276-3287:
if ((session.nameAttempts || 0) >= 5) {
  session.userName = isEn ? 'User' : 'Usuario';
  session.stage = STATES.ASK_NEED;
  // ... continuar sin nombre
}
```

#### 4.2.2 Botón "No sé" / "No entiendo"

**✅ Implementado:**
```javascript
// Línea 3755, 3850:
const rxDontKnow = /\b(no\s+se|no\s+sé|no\s+entiendo|no\s+entendi|no\s+entendí|no\s+comprendo)\b/i;
if (rxDontKnow.test(t)) {
  const result = await handleDontUnderstand(session, sid, t);
  return res.json(withOptions(result));
}
```

#### 4.2.3 Sesión perdida / SessionId inválido

**⚠️ NO MANEJADO COMPLETAMENTE:**

```javascript
// ACTUAL (línea 2930-2953):
let session = await getSession(sid);
if (!session) {
  session = {
    id: sid,
    stage: STATES.ASK_LANGUAGE,
    // ... crear nueva sesión
  };
}

// PROBLEMA: Si el usuario tenía una sesión previa con progreso,
// se pierde todo y empieza de cero
```

**🔧 Solución propuesta:**
```javascript
// AGREGAR: Recuperación de sesión previa
let session = await getSession(sid);

if (!session) {
  // Intentar buscar sesión previa por IP/fingerprint
  const previousSession = await findRecentSessionByFingerprint(req);
  
  if (previousSession && previousSession.stage !== STATES.ENDED) {
    const locale = previousSession.userLocale || 'es-AR';
    const isEn = String(locale).toLowerCase().startsWith('en');
    
    const recoveryMsg = isEn
      ? `Welcome back! I found your previous session. Do you want to continue where we left off?`
      : `¡Bienvenido de nuevo! Encontré tu sesión anterior. ¿Querés continuar donde lo dejamos?`;
    
    // Ofrecer opción de recuperar o empezar de nuevo
    session = previousSession;
    session.id = sid; // Actualizar con nuevo sessionId
    session.transcript.push({ who: 'bot', text: recoveryMsg, ts: nowIso() });
    await saveSession(sid, session);
    
    return res.json(withOptions({
      ok: true,
      reply: recoveryMsg,
      stage: session.stage,
      options: buildUiButtonsFromTokens(['BTN_CONTINUE_SESSION', 'BTN_NEW_SESSION'], locale)
    }));
  }
  
  // Si no hay sesión previa, crear nueva
  session = createNewSession(sid);
}
```

---

## 🔗 5. INTEGRACIÓN FRONTEND-BACKEND

### 5.1 Sincronización de Estado

**✅ Implementación:**
- Frontend mantiene `sessionId` global
- Cada request incluye `sessionId` en payload y header
- Backend valida sessionId en middleware (línea 1313)

**⚠️ Issues detectados:**

#### 5.1.1 SessionId se pierde al recargar página

```javascript
// index.html línea 560:
let sessionId = null; // ❌ Se pierde en cada reload

// SOLUCIÓN:
let sessionId = sessionStorage.getItem('sti_sessionId') || null;

async function initChat() {
  // Si ya hay sessionId, intentar recuperar sesión
  if (sessionId) {
    try {
      const response = await fetch('/api/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          // Sesión válida, continuar
          addMessage('bot', '¡Bienvenido de nuevo! Continuemos.');
          return;
        }
      }
    } catch (e) {
      console.warn('[SESSION] Failed to validate, creating new');
    }
  }
  
  // Crear nueva sesión
  const response = await fetch('/api/greeting', { /* ... */ });
  const data = await response.json();
  sessionId = data.sessionId;
  sessionStorage.setItem('sti_sessionId', sessionId);
}
```

#### 5.1.2 No hay indicador de estado de conexión

```javascript
// AGREGAR en index.html:
let connectionStatus = 'connected';

function updateConnectionStatus(status) {
  connectionStatus = status;
  const indicator = document.getElementById('connectionIndicator');
  
  if (status === 'disconnected') {
    indicator.className = 'status-indicator offline';
    indicator.textContent = '🔴 Sin conexión';
  } else if (status === 'reconnecting') {
    indicator.className = 'status-indicator warning';
    indicator.textContent = '🟡 Reconectando...';
  } else {
    indicator.className = 'status-indicator online';
    indicator.textContent = '🟢 Conectado';
  }
}

// Usar en fetch:
async function sendMessage(text, buttonValue) {
  try {
    const response = await fetch('/api/chat', { /* ... */ });
    updateConnectionStatus('connected');
    // ...
  } catch (error) {
    updateConnectionStatus('disconnected');
    
    // Intentar reconectar
    setTimeout(() => {
      updateConnectionStatus('reconnecting');
      sendMessage(text, buttonValue); // Retry
    }, 3000);
  }
}
```

### 5.2 UX de Carga

**✅ Implementado:**
```javascript
// Línea 736-750:
function showTyping() { /* ... */ }
function hideTyping() { /* ... */ }
```

**⚠️ Falta indicador de progreso en pasos largos:**

```javascript
// AGREGAR para operaciones con OpenAI:
function showProcessing(message = 'Pensando...') {
  const processingDiv = document.createElement('div');
  processingDiv.id = 'processingIndicator';
  processingDiv.className = 'processing-indicator';
  processingDiv.innerHTML = `
    <div class="spinner"></div>
    <span>${message}</span>
  `;
  document.getElementById('messages').appendChild(processingDiv);
}

// Usar en llamadas largas:
async function sendMessage(text, buttonValue) {
  showTyping();
  
  // Si es análisis de problema, mostrar indicador especial
  if (buttonValue === 'BTN_ANALYZE_PROBLEM') {
    showProcessing('Analizando problema con IA...');
  }
  
  const response = await fetch('/api/chat', { /* ... */ });
  
  hideTyping();
  document.getElementById('processingIndicator')?.remove();
}
```

---

## 🎯 6. PRIORIZACIÓN DE MEJORAS

### 🔴 CRÍTICAS (Implementar inmediatamente)

#### 1. **Extracción de token de botones en frontend** (P0)
```javascript
// Línea 663 index.html - CAMBIAR AHORA
- const value = typeof option === 'string' ? option : (option.token || option.text || option);
+ const value = typeof option === 'object' && option.token ? option.token : option;
+ if (typeof option === 'object' && !option.token) {
+   console.error('[BTN] Button missing token:', option);
+ }
```

**Impacto:** Resuelve bug crítico donde botones no funcionan en browser.

#### 2. **Timeout de sesión** (P0)
```javascript
// Agregar en sessionStore.js
const SESSION_TIMEOUT = 30 * 60 * 1000;
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;

async function getSession(sid) {
  const session = await getSessionRaw(sid);
  if (!session) return null;
  
  const now = Date.now();
  const lastActivity = new Date(session.lastActivity || session.startedAt).getTime();
  
  if (now - lastActivity > SESSION_TIMEOUT) {
    await deleteSession(sid);
    return null;
  }
  
  session.lastActivity = new Date().toISOString();
  await saveSession(sid, session);
  return session;
}
```

**Impacto:** Evita acumulación de sesiones huérfanas, mejora performance.

#### 3. **Persistencia de sessionId en frontend** (P0)
```javascript
// Línea 585 index.html - AGREGAR
sessionId = data.sessionId;
+ sessionStorage.setItem('sti_sessionId', sessionId);

// Línea 560 - CAMBIAR
- let sessionId = null;
+ let sessionId = sessionStorage.getItem('sti_sessionId') || null;
```

**Impacto:** Usuario no pierde progreso al recargar página.

### 🟡 IMPORTANTES (Próxima iteración)

#### 4. **Implementar basicITHeuristic local** (P1)
```javascript
function basicITHeuristic(text) {
  const itKeywords = /\b(compu|pc|notebook|impresora|router|wifi|no funciona|error)\b/i;
  const problemKeywords = /\b(no funciona|no prende|error|falla)\b/i;
  const howToKeywords = /\b(como|cómo|quiero|instalar|configurar)\b/i;
  
  return {
    isIT: itKeywords.test(text),
    isProblem: problemKeywords.test(text),
    isHowTo: howToKeywords.test(text)
  };
}
```

**Impacto:** Detecta problemas en input de nombre, mejora UX.

#### 5. **Usar contador de frustración** (P1)
```javascript
// Agregar checkFrustration() como se propuso en sección 3.3
// Llamar después de cada input inválido
```

**Impacto:** Escalamiento proactivo, reduce abandono.

#### 6. **Indicador de conexión** (P1)
```javascript
// Agregar updateConnectionStatus() como se propuso en sección 5.1.2
```

**Impacto:** Usuario sabe cuándo hay problemas de red.

### 🟢 DESEABLES (Backlog)

#### 7. **Recuperación de sesión previa** (P2)
```javascript
// Implementar findRecentSessionByFingerprint()
// Ofrecer continuar sesión anterior
```

**Impacto:** Mejora UX para usuarios recurrentes.

#### 8. **Retry con backoff exponencial en OpenAI** (P2)
```javascript
// Implementar callOpenAIWithRetry() como se propuso en sección 4.1.2
```

**Impacto:** Reduce errores por timeouts temporales.

#### 9. **Diagrama de transiciones documentado** (P2)
```javascript
// Agregar comentario con ASCII diagram al inicio de server.js
```

**Impacto:** Facilita mantenimiento y onboarding.

#### 10. **Mensajes de error progresivos** (P3)
```javascript
// Mejorar mensajes según attemptCount como se propuso en sección 3.2
```

**Impacto:** Reduce frustración en casos de error repetido.

---

## 📊 7. MÉTRICAS Y TESTING

### 7.1 Cobertura de Testing

**❌ NO HAY TESTS AUTOMATIZADOS**

```bash
# Buscar archivos de test
find . -name "*.test.js" -o -name "*.spec.js"
# Resultado: 0 archivos
```

**🔧 Propuesta:**
```javascript
// test/conversation-flow.test.js
import { expect } from 'chai';
import request from 'supertest';
import app from '../server.js';

describe('Conversation Flow', () => {
  let sessionId;
  
  it('should start with language selection', async () => {
    const res = await request(app).post('/api/greeting');
    expect(res.body.stage).to.equal('ASK_LANGUAGE');
    expect(res.body.options).to.have.length(3);
    sessionId = res.body.sessionId;
  });
  
  it('should accept language button', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId, action: 'button', value: 'BTN_LANG_ES_AR' });
    expect(res.body.stage).to.equal('ASK_NAME');
  });
  
  it('should handle "Prefiero no decirlo" button', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId, action: 'button', value: 'BTN_NO_NAME' });
    expect(res.body.stage).to.equal('ASK_NEED');
    expect(res.body.reply).to.include('sin tu nombre');
  });
  
  // ... más tests
});
```

### 7.2 Logs y Auditoría

**✅ Excelente sistema de logging:**
- Línea 2858-2886: `logFlowInteraction()` registra cada paso
- Línea 4004-4042: Endpoints de auditoría (`/api/flow-audit`)
- Línea 195-297: Sistema de logs con SSE streaming

**🔧 Sugerencia:**
```javascript
// Agregar métricas de duración por estado
function logFlowInteraction(data) {
  // ... código actual
  
  // AGREGAR: Métricas de performance
  if (data.duration > 5000) {
    console.warn(`[PERF] Slow response in ${data.currentStage}: ${data.duration}ms`);
  }
  
  // AGREGAR: Métricas de abandono
  if (data.serverAction === 'session_timeout') {
    updateMetric('chat', 'sessionTimeouts', 1);
  }
}
```

---

## 🏆 8. CONCLUSIONES

### Puntuación por Categoría

| Categoría | Puntuación | Observaciones |
|-----------|------------|---------------|
| **Arquitectura** | 8.5/10 | Estados bien definidos, falta diagrama explícito |
| **Manejo de Entrada** | 7.0/10 | Bug crítico en botones frontend, validación robusta |
| **Experiencia Conversacional** | 9.0/10 | Excelente personalización, falta usar frustrationCount |
| **Manejo de Errores** | 8.5/10 | Try-catch completo, falta retry logic |
| **Integración F/B** | 7.5/10 | Sincronización básica, falta persistencia sessionId |
| **Seguridad** | 9.5/10 | Sanitización exhaustiva, rate limiting, CSP |

### Impacto de Bugs Críticos

#### Bug #1: Extracción de token en frontend
- **Severidad:** 🔴 CRÍTICA
- **Frecuencia:** 🔴 ALTA (afecta todos los botones en browser)
- **Impacto en UX:** Usuario no puede avanzar en flujo
- **Esfuerzo de fix:** 🟢 BAJO (1 línea de código)

#### Bug #2: No hay timeout de sesión
- **Severidad:** 🟡 MEDIA
- **Frecuencia:** 🟡 MEDIA (afecta performance a largo plazo)
- **Impacto en UX:** Lento con el tiempo, consumo de memoria
- **Esfuerzo de fix:** 🟡 MEDIO (modificar sessionStore)

#### Bug #3: SessionId no persiste en reload
- **Severidad:** 🟡 MEDIA
- **Frecuencia:** 🟡 MEDIA (si usuario recarga accidentalmente)
- **Impacto en UX:** Pierde progreso, frustración
- **Esfuerzo de fix:** 🟢 BAJO (2 líneas de código)

### Recomendación Final

El sistema **STI Chatbot** tiene una arquitectura sólida y excelente atención a la experiencia conversacional. Los 3 bugs críticos identificados son **fáciles de resolver** y tendrán impacto inmediato en la satisfacción del usuario.

**Plan de acción recomendado:**
1. ✅ **HOY:** Fix bug extracción de token (1 hora)
2. ✅ **HOY:** Persistencia de sessionId (30 min)
3. ✅ **ESTA SEMANA:** Timeout de sesión (2 horas)
4. 🔄 **PRÓXIMA SEMANA:** Implementar tests automatizados (1 día)
5. 🔄 **BACKLOG:** Resto de mejoras según prioridad P1-P3

**Puntuación global mantenida:** **8.2/10** ⭐⭐⭐⭐

Con los 3 fixes críticos implementados: **9.0/10** 🚀

---

## 📝 ANEXOS

### A. Checklist de Implementación

```markdown
## Críticas (P0) - Implementar HOY
- [ ] Fix extracción token botones (index.html:663)
- [ ] Timeout de sesión (sessionStore.js)
- [ ] Persistencia sessionId (index.html:560,585)

## Importantes (P1) - Esta semana
- [ ] Implementar basicITHeuristic local
- [ ] Usar frustrationCount para escalamiento
- [ ] Indicador de conexión frontend

## Deseables (P2) - Próxima iteración
- [ ] Recuperación de sesión previa
- [ ] Retry con backoff OpenAI
- [ ] Diagrama de transiciones
- [ ] Tests automatizados

## Mejoras (P3) - Backlog
- [ ] Mensajes de error progresivos
- [ ] Validación de transiciones
- [ ] Métricas de performance por estado
```

### B. Snippets de Código Listos

**Ver secciones 1.1, 1.2, 2.1, 3.3, 4.1, 4.2, 5.1, 5.2, 6 para código completo.**

---

**Documento generado por:** GitHub Copilot (Claude Sonnet 4.5)  
**Última actualización:** 23 de Noviembre de 2025  
**Versión:** 1.0  
**Confidencialidad:** Interno - STI Rosario
