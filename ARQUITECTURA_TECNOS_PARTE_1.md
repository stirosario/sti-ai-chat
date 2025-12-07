# Ecosistema Tecnos / STI – Mapa de Arquitectura (PARTE 1)

**Fecha:** 6 de diciembre de 2025  
**Autor:** Documentación técnica generada por análisis de código  
**Versión:** 1.0  
**Repositorio:** stirosario/sti-ai-chat (main)

---

## 1. Visión General del Proyecto

### ¿Qué es Tecnos?

**Tecnos** es un chatbot inteligente de soporte técnico para **STI — Servicio Técnico Inteligente** (Rosario, Argentina). Su objetivo es asistir a usuarios con problemas técnicos en PCs, notebooks, Wi-Fi, impresoras y dispositivos de streaming, combinando:

- **Análisis de intención con IA** (OpenAI GPT-4o-mini)
- **Flujo conversacional estructurado** (máquina de estados)
- **Detección automática de dispositivos y problemas**
- **Escalamiento inteligente a soporte humano** (WhatsApp + tickets)

### Stack Tecnológico

#### Backend
- **Node.js 20+** con Express
- **OpenAI API** (gpt-4o-mini) para análisis de intención
- **Redis** (opcional) para persistencia de sesiones
- **Almacenamiento en disco** para logs, tickets y transcripts
- **Módulos ES6** (`type: "module"` en package.json)

#### Frontend
- **PHP** (sitio web principal: stia.com.ar)
- **JavaScript Vanilla** (widget del chat)
- **CSS** (estilos metálicos del chat)
- **HTML5** (estructura del sitio)

#### Integración
- **CORS** configurado para `https://stia.com.ar`
- **Render** como hosting del backend Node.js
- **Ferozo** como hosting del sitio PHP
- **WhatsApp API** para escalamiento humano

### Componentes Principales

```
┌─────────────────────────────────────────────────────────┐
│                    USUARIO FINAL                        │
│              (https://stia.com.ar)                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              FRONTEND (PHP + JS)                        │
│  • index.php (sitio web)                               │
│  • sti-chat-widget.js (lógica del chat)                │
│  • sti-chat.css (estilos metálicos)                    │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS (API_BASE)
                     ▼
┌─────────────────────────────────────────────────────────┐
│        BACKEND (Node.js en Render)                      │
│  • server.js (7776 líneas - núcleo completo)           │
│  • Sistema Inteligente (intentEngine + smartResponse)  │
│  • Máquina de Estados (STATES)                         │
│  • Gestión de sesiones (Redis/Memoria)                 │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌──────────┐
   │ OpenAI  │  │  Redis  │  │WhatsApp  │
   │   API   │  │(sesiones)│  │  (escal.)│
   └─────────┘  └─────────┘  └──────────┘
```

---

## 2. Estructura de Carpetas y Archivos Clave

### Árbol de Directorios Principal

```
sti-ai-chat/
├── 📄 server.js                          ⭐ NÚCLEO PRINCIPAL (7776 líneas)
├── 📄 package.json                       ⭐ Dependencias y scripts
├── 📄 .env.example                       ⭐ Variables de entorno
├── 📄 sessionStore.js                    ⭐ Persistencia de sesiones (Redis/Memoria)
├── 📄 ticketing.js                       ⭐ Sistema de tickets
├── 📄 flowLogger.js                      ⭐ Logging GDPR-compliant
├── 📄 normalizarTexto.js                 📝 Normalización de typos
├── 📄 deviceDetection.js                 🔍 Detección de dispositivos ambiguos
├── 📄 constants.js                       🔧 Constantes globales
│
├── 📁 src/                               ⭐ CÓDIGO MODULAR (arquitectura nueva)
│   ├── 📁 core/                          🧠 CEREBRO DEL SISTEMA INTELIGENTE
│   │   ├── intentEngine.js              ⭐⭐ Análisis de intención (OpenAI)
│   │   ├── smartResponseGenerator.js    ⭐⭐ Generación de respuestas dinámicas
│   │   ├── intelligentChatHandler.js    ⭐⭐ Handler unificado inteligente
│   │   └── integrationPatch.js          🔗 Integración con server.js
│   │
│   ├── 📁 services/                      🛠️ SERVICIOS
│   │   ├── aiService.js                 🤖 Cliente OpenAI centralizado
│   │   ├── sessionService.js            💾 Gestión de sesiones
│   │   ├── openaiService.js             🔌 Wrapper OpenAI
│   │   └── nlpService.js                📚 Procesamiento NLP
│   │
│   ├── 📁 adapters/                      🔄 ADAPTADORES
│   │   └── chatAdapter.js               🔗 Adaptador modular (USE_MODULAR_ARCHITECTURE)
│   │
│   ├── 📁 orchestrators/                 🎭 ORQUESTADORES
│   │   └── conversationOrchestrator.js  🎯 Orquestador conversacional
│   │
│   ├── 📁 templates/                     📋 PLANTILLAS
│   │   └── responseTemplates.js         💬 Templates de respuestas
│   │
│   ├── 📁 middlewares/                   🛡️ MIDDLEWARES
│   │   └── (middlewares Express)
│   │
│   └── 📁 utils/                         🔧 UTILIDADES
│       └── (helpers varios)
│
├── 📁 config/                            ⚙️ CONFIGURACIÓN
│   ├── app-features.json                🎛️ Features flags
│   ├── device-detection.json            📱 Datos de detección de dispositivos
│   ├── nlp-tuning.json                  🧠 Ajustes NLP
│   └── phrases-training.json            📝 Frases de entrenamiento
│
├── 📁 data/                              💾 DATOS PERSISTENTES
│   ├── 📁 historial_chat/               💬 Historial completo de conversaciones
│   ├── 📁 logs/                         📋 Logs del sistema
│   ├── 📁 tickets/                      🎫 Tickets generados (JSON)
│   ├── 📁 transcripts/                  📜 Transcripts de sesiones
│   └── 📁 uploads/                      📷 Imágenes subidas por usuarios
│
├── 📁 knowledge_base/                    📚 BASE DE CONOCIMIENTO
│   └── (archivos de conocimiento)
│
├── 📁 public/                            🌐 ARCHIVOS PÚBLICOS
│   ├── sti-chat-widget.js               ⭐ Widget del chat (copia local)
│   └── (recursos estáticos)
│
└── 📁 tests/                             🧪 TESTS
    └── (archivos de prueba)
```

### Frontend (Hosting Ferozo - stia.com.ar)

```
public_html/
├── 📄 index.php                          ⭐⭐ SITIO WEB PRINCIPAL
│   └── Contiene:
│       • HTML del sitio STI
│       • Estructura del widget de chat
│       • Script inline de inicialización
│       • Variables API_BASE, SESSION_ID, CSRF_TOKEN
│
├── 📁 js/
│   └── sti-chat-widget.js               ⭐⭐ LÓGICA DEL CHAT (175 líneas)
│       └── Funciones:
│           • initChat()                  - Inicializa el chat
│           • sendMessage()               - Envía mensajes al backend
│           • addMessage()                - Agrega mensajes al DOM
│           • showTypingIndicator()       - Muestra "PENSANDO"
│           • handleImageSelected()       - Maneja imágenes adjuntas (NUEVO)
│
├── 📁 css/
│   ├── sti-chat.css                     ⭐ ESTILOS PRINCIPALES DEL CHAT
│   ├── frontend-snippet.css            📝 Estilos fallback
│   └── style.css                        🎨 Estilos generales del sitio
│
├── 📁 img/
│   └── (imágenes del sitio)
│
├── 📄 admin.php                          🔐 Panel admin
├── 📄 chatlog.php                        📋 Visualizador de logs
├── 📄 tickets.php                        🎫 Gestión de tickets
└── 📄 config.php                         ⚙️ Configuración PHP
```

---

## 3. Flujo de Conversación de Usuario (Paso a Paso)

### PASO 1: Usuario Abre el Chat

**¿Qué pasa?**
1. Usuario hace clic en botón "Asistencia 24/7" en stia.com.ar
2. Se ejecuta JavaScript que abre el div `#sti-chat-box`
3. Se genera un `SESSION_ID` único: `web-TIMESTAMP-RANDOM`
4. Se muestra mensaje de GDPR + selección de idioma

**Archivos involucrados:**
- `index.php` (líneas 800-850): Inicialización del chat
  ```javascript
  const newSID = () => 'web-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  let SESSION_ID = newSID();
  ```
- `sti-chat-widget.js` (líneas 14-40): Función `initChat()`
  ```javascript
  function initChat() {
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    // ... eventos y mensaje de bienvenida
  }
  ```

**Estado inicial:**
- `stage: ASK_LANGUAGE`
- `sessionId: web-XXXXXXXXXX`
- `transcript: []`
- `gdprConsent: false`

**Backend:**
- Endpoint: No se llama todavía (mensaje inicial es local)
- Función: `buildLanguageSelectionGreeting()` (server.js línea 4035)

---

### PASO 2: Usuario Acepta Política de Privacidad

**¿Qué pasa?**
1. Usuario ve mensaje GDPR con botones "Sí Acepto ✔️" / "No Acepto ❌"
2. Hace clic en "Sí Acepto"
3. Frontend envía POST a `/api/chat` con `text: "si"`
4. Backend detecta aceptación y muestra selección de idioma

**Archivos involucrados:**
- `index.php`: Envía request al hacer clic
- `sti-chat-widget.js` (línea 110+): Función `sendMessage()`
  ```javascript
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId,
      message: text,
      imageBase64: pendingImageBase64 || null,
      imageName: pendingImageName || null
    })
  });
  ```

**Backend:**
- Endpoint: `POST /api/chat` (server.js línea 4782)
- Handler: `if (session.stage === STATES.ASK_LANGUAGE)` (línea 5575)
- Lógica:
  ```javascript
  if (/\b(si|sí|acepto|aceptar|ok|dale|de acuerdo|agree|accept|yes)\b/i.test(lowerMsg)) {
    session.gdprConsent = true;
    session.gdprConsentDate = nowIso();
    // Mostrar selección de idioma
  }
  ```

**Estado actualizado:**
- `gdprConsent: true`
- `gdprConsentDate: "2025-12-06T10:30:00.000Z"`
- `stage: ASK_LANGUAGE` (sigue igual, esperando idioma)

**Campos guardados en sesión:**
```javascript
{
  id: "web-XXXXXXXXXX",
  gdprConsent: true,
  gdprConsentDate: "2025-12-06T10:30:00.000Z",
  stage: "ASK_LANGUAGE",
  transcript: [
    { who: 'bot', text: '[Mensaje GDPR]', ts: '...' },
    { who: 'user', text: 'si', ts: '...' },
    { who: 'bot', text: '✅ Gracias por aceptar...', ts: '...' }
  ]
}
```

---

### PASO 3: Usuario Selecciona Idioma

**¿Qué pasa?**
1. Usuario ve botones: "(🇦🇷) Español 🌎" / "(🇺🇸) English 🌎"
2. Hace clic en "Español" (o escribe "español")
3. Backend detecta selección y cambia a `ASK_NAME`
4. Se muestra pregunta por el nombre

**Archivos involucrados:**
- Backend: `server.js` (línea 5612-5625)
- Lógica:
  ```javascript
  if (/español|spanish|es-|arg|latino/i.test(lowerMsg)) {
    session.userLocale = 'es-AR';
    session.stage = STATES.ASK_NAME;
    
    const reply = `✅ Perfecto! Vamos a continuar en **Español**.\n\n¿Con quién tengo el gusto de hablar? 😊`;
    // ...
  }
  ```

**Estado actualizado:**
- `userLocale: "es-AR"` (o "en-US" si eligió inglés)
- `stage: ASK_NAME`
- Se genera pregunta por nombre sin botones (usuario DEBE escribir)

**Función clave:**
- `buildNameGreeting()` (server.js línea 4091): Genera saludo personalizado según idioma

---

### PASO 4: Usuario Escribe su Nombre

**¿Qué pasa?**
1. Usuario escribe su nombre (ej: "Lucas")
2. Backend valida que sea un nombre válido
3. Si es válido → avanza a `ASK_NEED`
4. Si no es válido → pide que escriba solo su nombre

**Archivos involucrados:**
- Backend: `server.js` (línea 5869): Handler de `ASK_NAME`
- Funciones de validación:
  - `extractName(text)` - Extrae nombre del texto
  - `isValidName(name)` - Valida formato de nombre
  - `isValidHumanName(name)` - Valida que no sea palabra genérica

**Lógica de validación:**
```javascript
if (session.stage === STATES.ASK_NAME) {
  const candidate = extractName(t); // Extrae posible nombre
  
  if (candidate && isValidName(candidate)) {
    session.userName = candidate;
    session.stage = STATES.ASK_NEED;
    
    const reply = `Perfecto, ${capitalizeToken(session.userName)} 😊 ¿En qué puedo ayudarte hoy?`;
    // Sin botones - siguiente mensaje será procesado por sistema inteligente
  }
}
```

**Validaciones:**
- Longitud: 2-30 caracteres
- No contiene números, emails, URLs
- No es palabra genérica ("hola", "ayuda", etc.)
- No contiene palabras técnicas ("pc", "notebook", etc.)

**Estado actualizado:**
- `userName: "Lucas"`
- `stage: ASK_NEED`
- `nameAttempts: 0`

**Límite de intentos:**
- Si falla 5 veces → asigna nombre genérico "Usuario" y continúa

---

### PASO 5: Usuario Describe su Problema

**¿Qué pasa?**
1. Usuario escribe su necesidad (ej: "Quiero instalar AnyDesk")
2. **El sistema inteligente se activa automáticamente**
3. Se llama a `handleWithIntelligence()` para análisis
4. OpenAI analiza la intención real del mensaje

**Archivos involucrados:**

#### Backend Principal
- `server.js` (línea 4960+): Entrada al sistema inteligente
  ```javascript
  const intelligentResponse = await handleWithIntelligence(
    req, 
    res, 
    session, 
    t,  // texto del usuario
    buttonToken
  );
  
  if (intelligentResponse) {
    // ✅ Sistema inteligente procesó exitosamente
    return; // Ya respondió al cliente
  }
  ```

#### Sistema Inteligente (src/core/)
- `integrationPatch.js` (función exportada): Punto de entrada
- `intelligentChatHandler.js` (función `handleIntelligentChat`): Handler principal
- `intentEngine.js` (función `analyzeIntent`): Análisis de intención
- `smartResponseGenerator.js` (función `generateSmartResponse`): Generación de respuesta

**Estado actualizado:**
- `stage: "AWAITING_CLARIFICATION"` o stage contextual
- `lastDetectedIntent: "installation_help"` (o el intent detectado)
- `activeIntent: { type, originalMessage, confidence, timestamp, resolved: false }`

**Campos guardados:**
```javascript
session.activeIntent = {
  type: "installation_help",  // INTENT_TYPES.INSTALLATION_HELP
  originalMessage: "Quiero instalar AnyDesk",
  confidence: 0.95,
  timestamp: 1733486400000,
  resolved: false,
  requiresDiagnostic: false,
  deviceType: null,
  urgency: "normal",
  topic: "software"
}
```

---

### PASO 6: Bot Analiza Intención con OpenAI

**¿Qué pasa internamente?**

#### 6.1. Análisis de Intención (`intentEngine.js`)

**Función:** `analyzeIntent(userMessage, conversationContext, locale)`

**Proceso:**
1. Construye prompt con contexto de conversación
2. Llama a OpenAI GPT-4o-mini
3. OpenAI retorna JSON con análisis estructurado
4. Se valida y parsea el resultado

**Prompt enviado a OpenAI:**
```
Sos el Motor de Análisis de Intención para Tecnos, un asistente inteligente de soporte IT.

Tu rol es analizar mensajes de usuarios y determinar su INTENCIÓN VERDADERA con alta precisión.

REGLAS CRÍTICAS:
1. NUNCA asumas que existe un problema técnico a menos que esté explícitamente declarado
2. "Quiero instalar X" = installation_help, NO technical_problem
3. "Cómo configuro X" = configuration_help, NO technical_problem
4. Solo clasifica como technical_problem si el usuario reporta algo que NO FUNCIONA

FORMATO DE SALIDA (JSON):
{
  "intent": "installation_help",
  "confidence": 0.95,
  "reasoning": "Usuario quiere instalar software, no reporta problema",
  "suggestedAction": "Proporcionar guía de instalación",
  "requiresDiagnostic": false,
  "deviceType": null,
  "urgency": "normal",
  "clarificationNeeded": false
}
```

**Tipos de intención detectables:**
```javascript
export const INTENT_TYPES = {
  TECHNICAL_PROBLEM: 'technical_problem',        // "mi PC no prende"
  PERFORMANCE_ISSUE: 'performance_issue',        // "está lento"
  CONNECTION_PROBLEM: 'connection_problem',      // "no tengo internet"
  INSTALLATION_HELP: 'installation_help',        // "cómo instalo AnyDesk"
  CONFIGURATION_HELP: 'configuration_help',      // "cómo configuro impresora"
  HOW_TO_QUESTION: 'how_to_question',           // "cómo subo el volumen"
  INFORMATION_REQUEST: 'information_request',    // "qué es un driver"
  ESCALATION_REQUEST: 'escalation_request',      // "quiero hablar con técnico"
  FEEDBACK: 'feedback',                          // "me sirvió"
  CLOSE_CHAT: 'close_chat',                      // "chau"
  UNCLEAR: 'unclear'                             // No se entiende
};
```

#### 6.2. Detección de Respuestas Auxiliares

**Función especial:** `isAuxiliaryResponse(userMessage)`

Detecta si el mensaje es una respuesta a una pregunta previa (ej: "w10", "mac", "sí")

```javascript
function isAuxiliaryResponse(userMessage) {
  const msg = userMessage.toLowerCase().trim();
  
  // Respuestas muy cortas (< 10 caracteres)
  if (msg.length < 10) {
    // Sistemas operativos (incluir variantes)
    if (/^(windows|win|w10|w11|mac|macos|linux)$/i.test(msg)) return true;
    
    // Confirmaciones
    if (/^(sí|yes|ok|dale|no)$/i.test(msg)) return true;
  }
  
  // Frases que contienen SO (< 40 caracteres)
  if (/(windows\s*(11|10)?|win\s*(11|10)|w(10|11)|mac|linux)/i.test(msg)) {
    if (msg.length < 40) return true;
  }
  
  return false;
}
```

**Importancia:** Evita que "w10" sea re-analizado como nueva intención cuando el usuario ya está en flujo de instalación.

---

### PASO 7: Flujo "Quiero instalar AnyDesk"

**Escenario completo:**

#### 7.1. Usuario dice "Quiero instalar AnyDesk"

1. Sistema inteligente detecta: `INTENT_TYPES.INSTALLATION_HELP`
2. Se guarda en `session.activeIntent`:
   ```javascript
   {
     type: "installation_help",
     originalMessage: "Quiero instalar AnyDesk",
     software: "AnyDesk",
     confidence: 0.95,
     resolved: false
   }
   ```
3. Bot pregunta: **"¿Qué sistema operativo estás usando?"**

**Archivo:** `smartResponseGenerator.js` (función `generateSmartResponse`)

**Prompt a OpenAI:**
```
Sos Tecnos, el asistente de STI. El usuario quiere instalar software.

SOLICITUD ORIGINAL: "Quiero instalar AnyDesk"
INTENT DETECTADO: installation_help

TU TAREA:
- Preguntar qué sistema operativo usa
- Ser breve y directo
- Usar tono argentino con voseo

Generá una pregunta clara pidiendo el SO.
```

**Respuesta generada:**
```
"Para darte los pasos específicos, ¿qué sistema operativo tenés? 
(Windows 10, Windows 11, macOS, Linux)"
```

#### 7.2. Usuario responde "w10"

**¿Qué pasa?**

1. `intentEngine.js` detecta que es **respuesta auxiliar**:
   ```javascript
   if (conversationContext.activeIntent && 
       !conversationContext.activeIntent.resolved &&
       isAuxiliaryResponse(userMessage)) {
     
     // NO recalcular intención - mantener la activa
     return {
       intent: conversationContext.activeIntent.type, // "installation_help"
       isAuxiliaryResponse: true,
       auxiliaryData: "w10" // Dato auxiliar extraído
     };
   }
   ```

2. `smartResponseGenerator.js` llama a `handleInstallationWithOS()`:
   ```javascript
   if (intentAnalysis.isAuxiliaryResponse && activeIntent.type === 'installation_help') {
     return handleInstallationWithOS(
       "Quiero instalar AnyDesk",  // originalRequest
       "w10",                       // osInfo
       conversationContext,
       isEnglish,
       openai
     );
   }
   ```

3. Se genera guía completa de instalación para Windows 10

**Función crítica:** `handleInstallationWithOS()` (smartResponseGenerator.js línea 184)

**Prompt a OpenAI:**
```
Sos Tecnos, de STI — Servicio Técnico Inteligente.

ESTILO OBLIGATORIO:
1) Usá tono argentino con voseo: vos, necesitás, podés, tenés
2) Sé breve y directo: máximo 130 palabras
3) Usá pasos numerados (1, 2, 3…), NO emojis numeradores
4) Usá entre 1 y 3 emojis como mucho
5) NO repreguntes NADA: ya sabés qué instalar y qué SO usa
6) Generá instrucciones específicas para w10
7) Incluí el link oficial de descarga de AnyDesk
8) Cerrá SIEMPRE con: "— Soy Tecnos, de STI — Servicio Técnico Inteligente 🛠️"

SOLICITUD ORIGINAL: "Quiero instalar AnyDesk"
SISTEMA OPERATIVO: w10

Generá una guía de instalación clara.
```

**Respuesta generada (ejemplo):**
```
¡Perfecto! Te guío para instalar AnyDesk en Windows 10.

**Pasos de Instalación:**

1. Descargá el instalador desde https://anydesk.com/es/downloads/windows
2. Ejecutá el archivo descargado (doble clic)
3. Seguí el asistente de instalación
4. Aceptá el acuerdo de licencia
5. Elegí la carpeta de instalación (la predeterminada está bien)
6. Hacé clic en "Instalar" y esperá
7. Una vez instalado, lo podés abrir desde el menú Inicio

✅ ¿Te sirvió esta guía?

— Soy Tecnos, de STI — Servicio Técnico Inteligente 🛠️
```

**Botones mostrados:**
- `BTN_SUCCESS` → "✅ ¡Funcionó!"
- `BTN_NEED_HELP` → "❓ Necesito ayuda"

---

### PASO 8: Caso Crítico "w10" sin GUIDING_INSTALLATION

**Problema histórico resuelto:**

Antes del 5 de diciembre de 2025, si el usuario escribía "w10" en stage `GUIDING_INSTALLATION`, el sistema mostraba un mensaje genérico de fallback en lugar de detectar el OS.

**Solución implementada:**

#### Handler especializado: `handleGuidingInstallationOSReply()`

**Ubicación:** `server.js` línea 909-983

**Función:**
```javascript
function handleGuidingInstallationOSReply(session, userMessage, activeIntent, locale = 'es-AR') {
  const msgLower = userMessage.toLowerCase().trim();
  
  // 🔍 DETECCIÓN DE SISTEMA OPERATIVO (case-insensitive)
  let detectedOS = null;
  
  // Detectar variantes de Windows (incluir mayúsculas)
  if (/(windows\s*11|win\s*11|w11|win11)/i.test(userMessage)) {
    detectedOS = 'Windows 11';
  } else if (/(windows\s*10|win\s*10|w10|win10)/i.test(userMessage)) {
    detectedOS = 'Windows 10';
  }
  // ... más detecciones
  
  if (detectedOS) {
    session.operatingSystem = detectedOS;
    
    const softwareName = activeIntent?.software || 
                        session.problem || 
                        'el software que necesitás';
    
    // Generar guía de instalación específica
    const reply = `¡Perfecto! Te guío para instalar ${softwareName} en ${detectedOS}...`;
    
    return { reply, options };
  }
  
  // No se detectó OS válido
  return null;
}
```

**Interceptación en fallback:** (línea 7231-7255)
```javascript
// 🔧 INTERCEPTAR GUIDING_INSTALLATION ANTES DEL FALLBACK
if (session.stage === STATES.GUIDING_INSTALLATION) {
  const handled = handleGuidingInstallationOSReply(session, t, session.activeIntent, locale);
  
  if (handled) {
    // ✅ OS detectado y guía generada
    session.transcript.push({ who: 'bot', text: handled.reply, ts: nowIso() });
    await saveSessionAndTranscript(sid, session);
    
    return res.json({
      ok: true,
      reply: handled.reply,
      buttons: handled.options
    });
  }
}

// Si no se manejó, continuar con fallback genérico...
```

**Resultado:**
- ✅ "w10", "W10", "win10", "WIN10" → Todos detectan Windows 10
- ✅ Genera guía inmediatamente
- ✅ NO muestra mensaje genérico de fallback

---

### PASO 9: Escalación a Técnico Humano (WhatsApp)

**Escenario:** Usuario dice "quiero hablar con un técnico"

#### 9.1. Detección de Escalamiento

**Archivo:** `intentEngine.js`

**Prompt a OpenAI incluye:**
```
⚠️ CRÍTICO: Detección de Escalamiento
- "quiero/puedo/podría hablar con técnico/persona/humano" = escalation_request
- "necesito ayuda humana/real" = escalation_request
- "alguien de STI" = escalation_request
```

**Intent detectado:**
```javascript
{
  intent: "escalation_request",
  confidence: 0.98,
  reasoning: "Usuario solicita explícitamente asistencia humana",
  urgency: "normal"
}
```

#### 9.2. Generación de Respuesta de Escalamiento

**Archivo:** `smartResponseGenerator.js` (línea 640+)

**Prompt específico para escalamiento:**
```
PARA ESTA INTENCIÓN (Escalation to Human):
- Reconoce su solicitud inmediatamente
- Ofrece conexión WhatsApp con historial de conversación
- Mantén respuesta CORTA y directa (máx 2 oraciones)
- Sé cálido y tranquilizador
- Explica que el técnico recibirá contexto completo
```

**Respuesta generada (ejemplo):**
```
¡Por supuesto! Te conecto con un técnico humano de STI por WhatsApp.

El técnico recibirá toda nuestra conversación para darte mejor ayuda. 😊
```

**Botón mostrado:**
```javascript
{
  text: "💬 Abrir WhatsApp",
  value: "BTN_WHATSAPP_TECNICO",
  description: "Continuar con técnico humano"
}
```

#### 9.3. Generación de Ticket

**Cuando el usuario hace clic en el botón WhatsApp:**

**Endpoint:** `POST /api/whatsapp-ticket` (server.js)

**Proceso:**
1. Crea ticket con `createTicket(session)` (ticketing.js línea 37)
2. Genera ID único: `STI-YYYYMMDD-XXXX`
3. Guarda archivo JSON en `data/tickets/`
4. Genera link WhatsApp con `generateWhatsAppLink(ticket)`

**Estructura del ticket:**
```javascript
{
  id: "STI-20251206-A3F2",
  sessionId: "web-XXXXXXXXXX",
  createdAt: "2025-12-06T10:45:00.000Z",
  status: "open",
  user: {
    name: "[NAME_REDACTED]",  // GDPR-compliant
    locale: "es-AR"
  },
  issue: {
    device: "notebook",
    problem: "[PROBLEM_REDACTED]",
    description: "El usuario reporta problema con ... Se completaron 3 pasos de diagnóstico sin éxito.",
    category: "installation"
  },
  transcript: [/* conversación completa */],
  cleanConversation: "Conversación formateada para humanos"
}
```

**Link WhatsApp generado:**
```
https://wa.me/5493417422422?text=Hola%20STI!%20👋%0A%0AVengo%20del%20chat%20web...
```

**Mensaje pre-llenado incluye:**
- 📝 Ticket ID
- 👤 Nombre usuario
- 💻 Dispositivo
- 🕒 Hora inicio
- 🧾 Resumen del problema
- 💬 Conversación completa formateada
- 🔗 Link al ticket

---

## 4. Máquina de Estados del Bot (Estados Básicos)

### Definición de Estados

**Ubicación:** `server.js` línea 2877

```javascript
const STATES = {
  ASK_LANGUAGE: 'ASK_LANGUAGE',      // Aceptar GDPR + seleccionar idioma
  ASK_NAME: 'ASK_NAME',              // Pedir nombre del usuario
  ASK_NEED: 'ASK_NEED',              // Preguntar qué necesita
  CLASSIFY_NEED: 'CLASSIFY_NEED',    // Clasificar tipo de necesidad
  ASK_DEVICE: 'ASK_DEVICE',          // Preguntar dispositivo
  ASK_PROBLEM: 'ASK_PROBLEM',        // Describir problema detallado
  DETECT_DEVICE: 'DETECT_DEVICE',    // Detectar dispositivo ambiguo
  ASK_HOWTO_DETAILS: 'ASK_HOWTO_DETAILS', // Pedir detalles para guía
  GENERATE_HOWTO: 'GENERATE_HOWTO',  // Generar guía paso a paso
  BASIC_TESTS: 'BASIC_TESTS',        // Ejecutar pruebas básicas
  ADVANCED_TESTS: 'ADVANCED_TESTS',  // Ejecutar pruebas avanzadas
  ESCALATE: 'ESCALATE',              // Escalar a humano
  CREATE_TICKET: 'CREATE_TICKET',    // Crear ticket
  TICKET_SENT: 'TICKET_SENT',        // Ticket enviado
  ENDED: 'ENDED'                     // Conversación terminada
};
```

### Estados Básicos (PARTE 1)

#### Estado 1: `ASK_LANGUAGE`

**Propósito:** Obtener consentimiento GDPR y seleccionar idioma

**Handler:** `server.js` línea 5575

**Flujo:**
```
Usuario abre chat
    ↓
Muestra mensaje GDPR
    ↓
Usuario: "Sí Acepto" → session.gdprConsent = true
    ↓
Muestra botones de idioma
    ↓
Usuario: "Español" → session.userLocale = "es-AR"
    ↓
Transición a ASK_NAME
```

**Campos guardados:**
- `gdprConsent: true/false`
- `gdprConsentDate: ISO timestamp`
- `userLocale: "es-AR" | "en-US"`

**Condiciones de transición:**
```javascript
if (/español|spanish|es-|arg/i.test(userMessage)) {
  session.userLocale = 'es-AR';
  session.stage = STATES.ASK_NAME;
}
```

**Mensaje mostrado:**
```
📋 **Política de Privacidad y Consentimiento**

✅ Guardaré tu nombre y conversación durante 48 horas
✅ Los datos se usarán solo para soporte técnico
✅ Podés solicitar eliminación de datos en cualquier momento
✅ NO compartimos tu información con terceros
✅ Cumplimos con GDPR y normativas de privacidad

¿Aceptás estos términos?
```

**Botones:**
- "Sí Acepto ✔️" → continúa
- "No Acepto ❌" → termina conversación

---

#### Estado 2: `ASK_NAME`

**Propósito:** Obtener nombre del usuario con validación estricta

**Handler:** `server.js` línea 5869

**Flujo:**
```
Usuario seleccionó idioma
    ↓
Pregunta: "¿Con quién tengo el gusto de hablar?"
    ↓
Usuario escribe: "Lucas"
    ↓
Validación: extractName() + isValidName()
    ↓
✅ Es válido → Guardar userName + Transición a ASK_NEED
❌ No válido → Pedir nombre de nuevo (max 5 intentos)
```

**Funciones de validación:**

1. **`extractName(text)`** - Extrae posible nombre del texto
2. **`isValidName(name)`** - Valida formato:
   - 2-30 caracteres
   - Solo letras, espacios, guiones, apóstrofes
   - NO números, NO emails, NO URLs
3. **`isValidHumanName(name)`** - Valida que no sea palabra técnica:
   - NO: "pc", "notebook", "computadora", "ayuda"
   - SÍ: "Lucas", "María José", "Juan Pablo"
4. **`looksClearlyNotName(text)`** - Detecta si es descripción de problema:
   - "mi pc no prende" → NO es nombre
   - "tengo un problema" → NO es nombre

**Campos guardados:**
- `userName: string` (nombre validado)
- `nameAttempts: number` (contador de intentos)

**Condiciones de transición:**
```javascript
const candidate = extractName(t);
if (candidate && isValidName(candidate)) {
  session.userName = candidate;
  session.stage = STATES.ASK_NEED;
  session.nameAttempts = 0;
}
```

**Mensajes según idioma:**
```javascript
// Español
"Perfecto, Lucas 😊 ¿En qué puedo ayudarte hoy?"

// Inglés
"Perfect, Lucas 😊 What can I help you with today?"
```

**Casos especiales:**
- Después de 5 intentos → asigna "Usuario" y continúa
- Si detecta descripción de problema → pide solo el nombre
- NO acepta "Prefiero no decirlo" (código eliminado)

---

#### Estado 3: `ASK_NEED`

**Propósito:** Determinar qué necesita el usuario (problema o consulta)

**Handler:** Sistema inteligente (NO legacy code)

**Nota importante:** Este estado YA NO usa lógica legacy con botones fijos. En su lugar, el **sistema inteligente** se activa automáticamente.

**Flujo:**
```
Usuario escribió nombre válido
    ↓
Pregunta: "¿En qué puedo ayudarte hoy?"
    ↓
Usuario escribe libremente: "Quiero instalar AnyDesk"
    ↓
handleWithIntelligence() se activa
    ↓
intentEngine.analyzeIntent() analiza con OpenAI
    ↓
Detecta: INSTALLATION_HELP
    ↓
smartResponseGenerator.generateSmartResponse() genera respuesta
    ↓
Transición a estado contextual (no rígido)
```

**Bloque legacy deshabilitado:** (línea 5727)
```javascript
if (false && session.stage === STATES.ASK_NEED) {
  // ⚠️ Este bloque NO se ejecuta
  // Todo manejado por sistema inteligente
}
```

**Activación del sistema inteligente:** (línea 4960+)
```javascript
const intelligentResponse = await handleWithIntelligence(
  req, res, session, t, buttonToken
);

if (intelligentResponse) {
  // ✅ Sistema inteligente procesó exitosamente
  console.log('[api/chat] ✅ Procesado con sistema inteligente');
  return; // Ya respondió
}

// Si sistema inteligente falla o no aplica → continuar con legacy
```

**Campos guardados:**
- `lastDetectedIntent: string` (intent detectado)
- `lastIntentConfidence: number` (0.0-1.0)
- `activeIntent: object` (intent activo con metadata)
- `problem: string` (si es problema técnico)
- `installationRequest: string` (si es instalación)
- `howToQuestion: string` (si es pregunta procedimiento)

**Posibles transiciones:**
- → Estado contextual según intent
- → `AWAITING_CLARIFICATION` (si confidence < 0.6)
- → `BASIC_TESTS` (si technical_problem)
- → Estado dinámico (sistema inteligente decide)

---

### Archivos que Contienen Lógica de Estados

**Estados básicos (ASK_LANGUAGE, ASK_NAME, ASK_NEED):**
- `server.js` (línea 5572-6100): Handlers principales
  - ASK_LANGUAGE: línea 5575
  - ASK_NAME: línea 5869
  - ASK_NEED: línea 5727 (deshabilitado, usa sistema inteligente)

**Sistema inteligente (reemplaza lógica rígida):**
- `src/core/integrationPatch.js`: Punto de entrada
- `src/core/intelligentChatHandler.js`: Handler unificado
- `src/core/intentEngine.js`: Análisis de intención
- `src/core/smartResponseGenerator.js`: Generación de respuestas

**Funciones auxiliares:**
- `extractName()` - server.js línea ~1200
- `isValidName()` - server.js línea ~1250
- `isValidHumanName()` - server.js línea ~1300
- `looksClearlyNotName()` - server.js línea ~1400
- `buildLanguageSelectionGreeting()` - server.js línea 4035
- `buildNameGreeting()` - server.js línea 4091
- `addEmpatheticResponse()` - server.js línea 4061

**Persistencia:**
- `sessionStore.js`: `getSession()`, `saveSession()`
- `flowLogger.js`: `logFlowInteraction()`

---

## FIN DE PARTE 1

**Contenido completado:**
- ✅ Visión general del proyecto
- ✅ Estructura de carpetas y archivos clave
- ✅ Flujo de conversación completo (9 pasos)
- ✅ Máquina de estados básicos (ASK_LANGUAGE, ASK_NAME, ASK_NEED)

**Pendiente para PARTE 2:**
- Estados avanzados (BASIC_TESTS, ADVANCED_TESTS, ESCALATE, etc.)
- Integraciones externas (OpenAI, Render, WhatsApp, Redis)
- Sistema de tickets y logs
- Manejo de errores y fallbacks
- Seguridad y GDPR
- Puntos sensibles a NO romper

---

**PARTE 1 COMPLETA**
