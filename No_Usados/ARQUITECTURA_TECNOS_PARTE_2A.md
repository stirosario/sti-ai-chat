# Ecosistema Tecnos / STI – Mapa de Arquitectura (PARTE 2A)

**Fecha:** 6 de diciembre de 2025  
**Complemento de:** ARQUITECTURA_TECNOS_PARTE_1.md  
**Enfoque:** Integraciones Externas

---

## 5. Integraciones Externas

### 5.1 OpenAI Integration

#### 5.1.1 Archivos que Llaman a la API

**Backend Principal:**
- `server.js` (línea 196):
  ```javascript
  const openai = process.env.OPENAI_API_KEY 
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
    : null;
  ```

**Sistema Inteligente:**
- `src/services/aiService.js`: Cliente centralizado de OpenAI
  ```javascript
  export function initializeOpenAI(apiKey) {
    if (!apiKey) {
      console.warn('[AIService] ⚠️ No API key provided');
      return null;
    }
    openaiClient = new OpenAI({ apiKey });
    return openaiClient;
  }
  ```

- `src/core/intentEngine.js` (función `analyzeIntent`): Análisis de intención
- `src/core/smartResponseGenerator.js` (función `generateSmartResponse`): Generación de respuestas
- `server.js` (función `analyzeUserMessage`): Análisis con modo visión
- `server.js` (función `aiQuickTests`): Generación de pasos diagnósticos

---

#### 5.1.2 Modelos Utilizados

**Modelo Principal: `gpt-4o-mini`**

Configuración en `server.js` línea 196:
```javascript
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
```

**Casos de uso por modelo:**

1. **gpt-4o-mini** (por defecto):
   - Análisis de intención (`intentEngine.js`)
   - Generación de respuestas (`smartResponseGenerator.js`)
   - Generación de pasos diagnósticos (`aiQuickTests`)
   - Validación de nombres
   - Clasificación de problemas

2. **gpt-4o** (cuando hay imágenes):
   - Modo visión para análisis de imágenes
   - Usado en `analyzeUserMessage()` cuando `imageUrls.length > 0`
   ```javascript
   const response = await openai.chat.completions.create({
     model: 'gpt-4o', // Usar GPT-4 con visión
     messages: [{ 
       role: 'user', 
       content: [
         { type: 'text', text: visionPrompt },
         { type: 'image_url', image_url: { url: imgUrl, detail: 'high' } }
       ]
     }],
     temperature: 0.3,
     max_tokens: 1500
   });
   ```

**Parámetros comunes:**
- `temperature: 0.2-0.3` (baja = más preciso y consistente)
- `max_tokens: 400-1500` (según complejidad)
- `response_format: { type: "json_object" }` (para análisis estructurado)

---

#### 5.1.3 Construcción de Prompts

**A. Prompt para Análisis de Intención (intentEngine.js línea 388)**

**Estructura del prompt:**
```
SYSTEM:
Sos el Motor de Análisis de Intención para Tecnos, un asistente inteligente de soporte IT.

REGLAS CRÍTICAS:
1. NUNCA asumas que existe un problema técnico a menos que esté explícitamente declarado
2. "Quiero instalar X" = installation_help, NO technical_problem
3. Solo clasifica como technical_problem si el usuario reporta algo que NO FUNCIONA

FORMATO DE SALIDA (JSON):
{
  "intent": "installation_help|technical_problem|...",
  "confidence": 0.0 a 1.0,
  "reasoning": "...",
  "requiresDiagnostic": true/false,
  "deviceType": "notebook|pc|...",
  ...
}

USER:
Analiza este mensaje: "Quiero instalar AnyDesk"

CONTEXTO DE CONVERSACIÓN:
[últimos 3 mensajes del transcript]

INTENCIÓN PREVIA: installation_help
```

**Variables dinámicas:**
- `userMessage`: Mensaje del usuario
- `conversationContext.recentMessages`: Últimos 3-6 mensajes
- `previousIntent`: Intent detectado anteriormente
- `hasAttemptedBasicTests`: Booleano si intentó pasos básicos
- `locale`: Idioma (es-AR, en-US)

---

**B. Prompt para Generación de Respuestas (smartResponseGenerator.js)**

**Ejemplo: Instalación con OS conocido (línea 184)**

```
SYSTEM:
Sos Tecnos, de STI — Servicio Técnico Inteligente.

ESTILO OBLIGATORIO:
1) Usá tono argentino con voseo: vos, necesitás, podés, tenés
2) Sé breve y directo: máximo 130 palabras
3) Usá pasos numerados (1, 2, 3…), NO emojis numeradores
4) NO repreguntes NADA: ya sabés qué instalar y qué SO usa
5) Incluí el link oficial de descarga
6) Cerrá con: "— Soy Tecnos, de STI — Servicio Técnico Inteligente 🛠️"

USER:
SOLICITUD ORIGINAL: "Quiero instalar AnyDesk"
SISTEMA OPERATIVO: w10

Generá una guía de instalación clara.
```

**Respuesta esperada:**
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

— Soy Tecnos, de STI — Servicio Técnico Inteligente 🛠️
```

---

**C. Prompt para Modo Visión (analyzeUserMessage con imágenes)**

**Ubicación:** `server.js` línea 220+

```
SYSTEM:
Sos Tecnos, un asistente técnico experto de STI (Argentina). 
El usuario te envió imagen(es) de su problema técnico.

IDIOMA: Español (Argentina)
TONO: Profesional argentino, empático, voseo

TAREAS OBLIGATORIAS:
1. 🔍 Analizá TODAS las imágenes en detalle máximo
2. 📝 Si hay texto visible → léelo completo y transcribilo
3. 🖥️ Identificá dispositivo exacto (marca, modelo, tipo)
4. ⚠️ Detectá problema técnico específico
5. 💡 Sugerí 2-3 pasos concretos y accionables
6. 🧠 Inferí causas probables del problema

IMPORTANTE:
- NUNCA digas "no puedo ver imágenes" - SIEMPRE analizás
- Si ves código de error → transcribilo exacto
- Si está borroso → pedí mejor foto pero mencioná lo que SÍ ves

USER:
[Imagen 1: data:image/jpeg;base64,...]
[Imagen 2: ...]

Mensaje del usuario: "Mi PC muestra esta pantalla azul"
```

**JSON de respuesta esperado:**
```json
{
  "imagesAnalyzed": true,
  "language": "Español (Argentina)",
  "visualContent": {
    "description": "Pantalla azul de Windows (BSOD) con código CRITICAL_PROCESS_DIED",
    "textDetected": "CRITICAL_PROCESS_DIED\nStop Code: 0x000000EF\nCollecting error info: 45%",
    "errorMessages": ["CRITICAL_PROCESS_DIED"],
    "errorCodes": ["0x000000EF"],
    "technicalDetails": "Windows 10, proceso crítico terminado durante actualización",
    "imageQuality": "good"
  },
  "device": {
    "detected": true,
    "type": "notebook",
    "brand": "HP",
    "model": "no visible",
    "confidence": 0.7
  },
  "problem": {
    "detected": true,
    "summary": "Pantalla azul BSOD con error CRITICAL_PROCESS_DIED durante arranque",
    "category": "software",
    "urgency": "high",
    "possibleCauses": [
      "Archivo de sistema corrupto",
      "Actualización de Windows fallida",
      "Driver incompatible"
    ]
  },
  "intent": "diagnose_problem",
  "confidence": 0.95,
  "needsHumanHelp": false,
  "nextSteps": [
    "Reiniciar en Modo Seguro",
    "Ejecutar sfc /scannow",
    "Desinstalar última actualización"
  ],
  "suggestedResponse": "Vi tu pantalla azul con el error CRITICAL_PROCESS_DIED..."
}
```

---

**D. Prompt para Generación de Pasos Diagnósticos (aiQuickTests)**

**Ubicación:** `server.js` línea 1943

```
SYSTEM:
Sos un técnico experto que genera pasos de diagnóstico para usuarios finales.

Idioma: Español (Argentina) con voseo
Tono: Claro, empático, directo

Generá pasos simples, seguros y accionables.
NO usar jerga técnica compleja.
NO acciones peligrosas (BIOS, comandos destructivos).

USER:
Generá pasos diagnósticos para:

Dispositivo: notebook
Problema: "está lento y se cuelga"

ANÁLISIS DE IMAGEN:
El usuario envió captura del Administrador de Tareas mostrando:
- CPU: 98% (proceso "svchost.exe")
- RAM: 7.8GB / 8GB (98%)
- Disco: 100% activo

NO repitas estos pasos ya probados:
- "Reiniciar el equipo"
- "Cerrar programas innecesarios"

Formato: ["Paso 1: ...", "Paso 2: ...", ...]
```

**Respuesta esperada:**
```json
[
  "Abrí el Administrador de Tareas (Ctrl+Shift+Esc) y en la pestaña 'Procesos', buscá 'svchost.exe' con mayor uso de CPU. Hacé clic derecho → 'Ir a detalles' para ver qué servicio está causando el problema",
  "Desactivá programas que se inician automáticamente: Administrador de Tareas → pestaña 'Inicio' → Desactivá programas innecesarios",
  "Verificá si hay actualizaciones de Windows pendientes que puedan estar ejecutándose en segundo plano: Configuración → Windows Update",
  "Si el disco está al 100%, ejecutá 'Desfragmentar y optimizar unidades' desde el menú Inicio"
]
```

---

#### 5.1.4 Mezcla de Respuesta OpenAI con Lógica Interna

**Flujo de integración:**

```
Usuario envía mensaje
    ↓
┌─────────────────────────────────────┐
│ 1. handleWithIntelligence()        │ ← Punto de entrada
│    (integrationPatch.js)           │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. handleIntelligentChat()         │ ← Handler principal
│    (intelligentChatHandler.js)     │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. analyzeIntent()                 │ ← Llama a OpenAI
│    (intentEngine.js)               │
│                                    │
│    OpenAI retorna:                 │
│    {                               │
│      intent: "installation_help",  │
│      confidence: 0.95,             │
│      deviceType: null,             │
│      operatingSystem: null         │
│    }                               │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. Lógica Interna:                 │
│    - Guardar en session.activeIntent│
│    - Validar con validateAction()   │
│    - Detectar OS con detectOS()     │
│    - Detectar marca con detectBrand()│
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 5. generateSmartResponse()         │ ← Llama a OpenAI
│    (smartResponseGenerator.js)     │
│                                    │
│    Si es respuesta auxiliar:       │
│    → handleInstallationWithOS()    │
│    → Usa activeIntent.originalMsg  │
│                                    │
│    OpenAI retorna:                 │
│    "¡Perfecto! Te guío para..."   │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 6. Determinar Opciones (Lógica)   │
│    determineOptions()              │
│                                    │
│    Según intent:                   │
│    - installation_help →           │
│      [BTN_SUCCESS, BTN_NEED_HELP] │
│    - technical_problem →           │
│      [BTN_SOLVED, BTN_STILL_BROKEN]│
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 7. Retornar Respuesta Completa    │
│    {                               │
│      reply: "texto de OpenAI",     │
│      options: [botones de lógica], │
│      stage: "contextual",          │
│      intentDetected: "...",        │
│      nextAction: "..."             │
│    }                               │
└─────────────────────────────────────┘
```

**Ejemplo concreto:**

**Input del usuario:** "Quiero instalar AnyDesk"

**Paso 1 - OpenAI (intentEngine):**
```json
{
  "intent": "installation_help",
  "confidence": 0.95,
  "reasoning": "Usuario solicita instalar software, no reporta problema"
}
```

**Paso 2 - Lógica interna (intelligentChatHandler):**
```javascript
// Guardar en sesión
session.activeIntent = {
  type: "installation_help",
  originalMessage: "Quiero instalar AnyDesk",
  software: "AnyDesk",
  confidence: 0.95,
  resolved: false
};

// No hay OS detectado → preguntar
```

**Paso 3 - OpenAI (smartResponseGenerator):**
```
Prompt: "Usuario quiere instalar AnyDesk pero no especificó OS. Preguntá qué OS usa."
Respuesta: "Para darte los pasos específicos, ¿qué sistema operativo tenés? (Windows 10, Windows 11, macOS, Linux)"
```

**Paso 4 - Lógica interna (determineOptions):**
```javascript
// Aunque OpenAI podría sugerir botones, usamos lógica interna
options: [] // Sin botones, usuario debe escribir
```

**Usuario responde:** "w10"

**Paso 5 - Detección (isAuxiliaryResponse):**
```javascript
// Detecta que es respuesta auxiliar
isAuxiliaryResponse: true,
auxiliaryData: "w10"

// NO recalcular intent → mantener installation_help activo
```

**Paso 6 - OpenAI (handleInstallationWithOS):**
```
Prompt: "Generá guía de instalación de AnyDesk para Windows 10. Incluí link oficial."
Respuesta: [Guía completa con 7 pasos]
```

**Paso 7 - Lógica interna (botones):**
```javascript
options: [
  { text: '✅ ¡Funcionó!', value: 'BTN_SUCCESS' },
  { text: '❓ Necesito ayuda', value: 'BTN_NEED_HELP' }
]
```

---

#### 5.1.5 Manejo de Errores

**A. Timeout Protection**

```javascript
async function analyzeUserMessage(text, session, imageUrls = []) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [...],
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    // Procesar respuesta...
    
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[OpenAI] Timeout después de 30s');
      return fallbackResponse();
    }
    throw err;
  }
}
```

**B. Fallback cuando OpenAI no está disponible**

**Ubicación:** `intentEngine.js` línea 511

```javascript
function fallbackIntentAnalysis(userMessage) {
  const msg = userMessage.toLowerCase();

  // Problemas técnicos (regex)
  if (/no\s+(prende|enciende|funciona)|error|falla/i.test(msg)) {
    return {
      intent: INTENT_TYPES.TECHNICAL_PROBLEM,
      confidence: 0.7,
      reasoning: 'Patrón de problema técnico detectado (fallback)',
      requiresDiagnostic: true
    };
  }

  // Instalación (regex)
  if (/instalar|install|setup|configurar/i.test(msg)) {
    return {
      intent: INTENT_TYPES.INSTALLATION_HELP,
      confidence: 0.7,
      reasoning: 'Patrón de instalación detectado (fallback)',
      requiresDiagnostic: false
    };
  }

  // No claro
  return {
    intent: INTENT_TYPES.UNCLEAR,
    confidence: 0.3,
    reasoning: 'No se pudo clasificar con certeza (fallback)',
    clarificationNeeded: true
  };
}
```

**C. Respuestas por defecto cuando OpenAI falla**

```javascript
if (!openai || !SMART_MODE_ENABLED) {
  // Español
  return [
    'Reiniciá el equipo por completo (apagalo y desenchufalo 30 segundos).',
    'Revisá conexiones (corriente, HDMI, red) y probá de nuevo.',
    'Si el problema continúa, contactá a un técnico con el detalle de lo que ya probaste.'
  ];
}
```

**D. Parsing seguro de JSON**

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
    throw new Error('JSON inválido');
  }
  
} catch (e) {
  console.error('[OpenAI] Error parseando JSON:', e);
  return fallbackIntentAnalysis(userMessage);
}
```

---

### 5.2 Render Integration

#### 5.2.1 Exposición de Endpoints

**Servidor:** `https://sti-rosario-ai.onrender.com`

**Endpoints principales:**

```javascript
// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Chat principal (POST)
app.post('/api/chat', chatLimiter, validateCSRF, async (req, res) => {
  // Lógica completa de conversación
});

// Crear ticket WhatsApp
app.post('/api/whatsapp-ticket', validateCSRF, async (req, res) => {
  // Genera ticket y link WhatsApp
});

// Reset de sesión
app.post('/api/reset', async (req, res) => {
  // Limpia sesión del usuario
});

// Transcript de sesión
app.get('/api/transcript/:sid', async (req, res) => {
  // Retorna transcript completo
});

// Ver ticket
app.get('/api/ticket/:tid', async (req, res) => {
  // Retorna JSON del ticket
});

// Ver ticket (HTML)
app.get('/ticket/:tid', async (req, res) => {
  // Retorna UI HTML del ticket
});

// Logs (protegido con token)
app.get('/api/logs', requireLogToken, async (req, res) => {
  // Retorna logs completos
});

// Stream de logs (SSE)
app.get('/api/logs/stream', requireLogToken, async (req, res) => {
  // Server-Sent Events para logs en tiempo real
});

// Sesiones activas
app.get('/api/sessions', async (req, res) => {
  // Lista sesiones activas
});
```

---

#### 5.2.2 Variables de Entorno

**Archivo:** `.env` (basado en `.env.example`)

**Variables críticas:**

```bash
# ========== SEGURIDAD ==========
SSE_TOKEN=CAMBIAR_ESTE_TOKEN_POR_UNO_ALEATORIO_SEGURO_64_CARACTERES

# ========== OPENAI ==========
OPENAI_API_KEY=sk-XXXXXXXXXXXXXXXX
OPENAI_MODEL=gpt-4o-mini

# ========== SERVIDOR ==========
PORT=3004                     # Puerto (Render usa variable dinámica)
PUBLIC_BASE_URL=https://stia.com.ar
ALLOWED_ORIGINS=https://stia.com.ar,https://www.stia.com.ar

# ========== ENTORNO ==========
NODE_ENV=production           # production | development

# ========== REDIS (Opcional) ==========
# REDIS_URL=redis://localhost:6379

# ========== WHATSAPP ==========
WHATSAPP_NUMBER=5493417422422

# ========== FEATURE FLAGS ==========
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=true     # Sistema inteligente activado
SMART_MODE=true               # Análisis con OpenAI activado
```

**Configuración en código (server.js línea 191-210):**

```javascript
// Validar variables críticas
if (!process.env.OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY no configurada. Funciones de IA deshabilitadas.');
}
if (!process.env.ALLOWED_ORIGINS) {
  console.warn('[WARN] ALLOWED_ORIGINS no configurada. Usando valores por defecto.');
}
if (!process.env.LOG_TOKEN) {
  console.warn('[WARN] LOG_TOKEN no configurado. Endpoint /api/logs sin protección.');
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;
```

---

#### 5.2.3 Diferencias: Local vs Render

**A. Puerto**

**Local:**
```javascript
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

**Render:**
- Render asigna puerto dinámicamente vía variable `PORT`
- URL pública: `https://sti-rosario-ai.onrender.com`
- Auto-deploy en cada push a `main`

**B. CORS**

**Local:**
```javascript
const ALLOWED_ORIGINS = [
  'http://localhost:3004',
  'http://localhost:5173',
  'http://127.0.0.1:3004'
];
```

**Render (Producción):**
```javascript
const ALLOWED_ORIGINS = [
  'https://stia.com.ar',
  'https://www.stia.com.ar'
];
```

**C. Redis**

**Local:**
```javascript
// Sin REDIS_URL → usa memoria (sessionStore.js)
const memoryStore = new Map();
```

**Render:**
```javascript
// Con REDIS_URL → usa Redis externo
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});
```

**D. Logs**

**Local:**
- Logs en `console.log`
- Archivos en `data/logs/`

**Render:**
- Logs en Render Dashboard
- Archivos en disco efímero (se pierden en redeploy)
- Considerar usar servicio externo (AWS S3, etc.)

**E. SSL/HTTPS**

**Local:**
```
http://localhost:3004
```

**Render:**
```
https://sti-rosario-ai.onrender.com
```
- SSL automático proporcionado por Render
- Certificado Let's Encrypt

---

### 5.3 Ferozo (Hosting PHP) Integration

#### 5.3.1 Carga del Widget en index.php

**Ubicación:** `public_html/index.php`

**A. Estructura HTML del Chat (líneas 740-770)**

```html
<!-- Widget de Chat STI (Tecnos) -->
<div id="sti-chat-box" class="sti-chat-box" style="display:none;">
  <div id="sti-header" class="sti-header">
    <img src="img/logo-sti1.png" alt="STI" class="sti-header-logo">
    <div class="sti-header-text">
      <div class="sti-header-title">Tecnos</div>
      <div class="sti-header-subtitle">Asistente Técnico STI</div>
    </div>
    <button id="sti-close" class="sti-close-btn" aria-label="Cerrar chat">✕</button>
  </div>

  <!-- Área de mensajes -->
  <div id="sti-messages" class="sti-messages"></div>
  
  <!-- Preview de imágenes -->
  <div id="sti-image-preview" style="display:none; ..."></div>

  <!-- Área de input -->
  <div class="sti-input-area">
    <input type="file" id="sti-image-input" accept="image/*" multiple style="display:none">
    <button id="sti-attach-btn" type="button">📎</button>
    <input id="sti-text" type="text" placeholder="Escribí tu mensaje…">
    <button id="sti-send" type="button">
      <svg>...</svg>
    </button>
  </div>
</div>
```

**B. Referencia a Archivos CSS (líneas 70-80)**

```html
<!-- CSS del chat con estilo metálico STI -->
<link rel="stylesheet" href="css/sti-chat.css?v=<?php echo time(); ?>">

<!-- Fallback minimal específico del chat -->
<link rel="stylesheet" href="css/frontend-snippet.css">

<!-- Estilos críticos inline para el chat -->
<style>
  #sti-messages {
    background: #132333 !important;
  }
  
  #sti-text {
    background: #132333 !important;
    color: #ffffff !important;
  }
  
  .sti-typing {
    display: flex !important;
    gap: 2px !important;
    font-family: 'Orbitron', monospace !important;
    font-weight: 700 !important;
  }
</style>
```

**C. Referencia a JavaScript del Chat (línea final)**

```html
<!-- Script del chat widget (después del body) -->
<script src="js/sti-chat-widget.js?v=<?php echo time(); ?>"></script>
```

**Nota:** `?v=<?php echo time(); ?>` previene caché en cambios frecuentes durante desarrollo.

---

#### 5.3.2 Configuración de API_BASE (index.php línea 805)

**Lógica de detección automática:**

```javascript
// Detectar si estamos en local o producción
const IS_LOCAL = ['localhost','127.0.0.1'].includes(location.hostname);

// Configurar API_BASE según entorno
const API_BASE = (window.STI_API_BASE) || 
                 (IS_LOCAL ? 'http://localhost:3001' 
                           : 'https://sti-rosario-ai.onrender.com');

// Endpoints derivados
const API_CHAT   = API_BASE + '/api/chat';
const API_GREET  = API_BASE + '/api/greeting';
const API_TICKET = API_BASE + '/api/whatsapp-ticket';
const API_RESET  = API_BASE + '/api/reset';
```

**Override manual (para testing):**

```javascript
// Antes de cargar el script, se puede definir:
window.STI_API_BASE = 'http://localhost:3001'; // Forzar local
// o
window.STI_API_BASE = 'https://sti-rosario-ai.onrender.com'; // Forzar Render
```

---

#### 5.3.3 Comunicación Frontend → Backend

**A. Generación de Session ID (index.php línea 812)**

```javascript
const newSID = () => 'web-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
let SESSION_ID = newSID();
let CSRF_TOKEN = null;
```

**B. Headers Base (index.php línea 814)**

```javascript
function baseHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-session-id': SESSION_ID
  };
}
```

**C. Envío de Mensaje (sti-chat-widget.js línea 110)**

```javascript
async function sendMessage() {
  if (isProcessing) return;
  
  const textInput = document.getElementById('sti-text');
  const text = textInput.value.trim();
  
  // Validar que haya texto o imagen
  if (!text && !pendingImageBase64) return;

  isProcessing = true;
  showTypingIndicator();

  try {
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

    const data = await response.json();
    
    hideTypingIndicator();

    if (data.reply) {
      addMessage('bot', data.reply, data.buttons || null);
    }
  } catch (error) {
    console.error('Error:', error);
    hideTypingIndicator();
    addMessage('bot', 'No pude conectarme al servidor. Por favor, verifica tu conexión.');
  } finally {
    pendingImageBase64 = null;
    pendingImageName = null;
    isProcessing = false;
  }
}
```

**D. Manejo de Respuestas**

```javascript
function addMessage(type, text, buttons = null) {
  const messagesDiv = document.getElementById('sti-messages');
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `sti-msg ${type}`;
  
  const avatar = type === 'bot' ? '🤖' : '👤';
  let buttonsHTML = '';
  
  if (buttons && buttons.length > 0) {
    buttonsHTML = '<div class="sti-buttons">';
    buttons.forEach(btn => {
      buttonsHTML += `<button class="sti-btn" onclick="window.stiChatSelectOption('${btn.value}')">${btn.label}</button>`;
    });
    buttonsHTML += '</div>';
  }

  msgDiv.innerHTML = `
    <div class="sti-avatar">${avatar}</div>
    <div class="sti-bubble">
      ${text.replace(/\n/g, '<br>')}
      ${buttonsHTML}
    </div>
  `;
  
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
```

---

### 5.4 WhatsApp Integration

#### 5.4.1 Botón BTN_WHATSAPP_TECNICO

**Ubicación de handler:** `server.js` línea 6152

**Trigger:**
```javascript
if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
  // Handler completo...
}
```

**Dónde se ofrece el botón:**
- Cuando el sistema inteligente detecta `INTENT_TYPES.ESCALATION_REQUEST`
- Cuando el usuario hace clic en "🚀 Hablar con Técnico"
- Cuando la IA detecta que el problema requiere asistencia humana

---

#### 5.4.2 Construcción del Mensaje WhatsApp

**Función handler (server.js línea 6153-6220):**

```javascript
if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
  const locale = session.userLocale || 'es-AR';
  const isEn = locale.toLowerCase().startsWith('en');
  
  // 1. PREPARAR HISTORIAL DE CONVERSACIÓN
  const transcriptText = session.transcript
    .map((msg, idx) => {
      const time = msg.ts 
        ? new Date(msg.ts).toLocaleTimeString('es-AR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }) 
        : '';
      const who = msg.who === 'user' ? '👤 Cliente' : '🤖 Tecnos';
      const stage = msg.stage ? ` [${msg.stage}]` : '';
      return `${idx + 1}. ${who} ${time}${stage}:\n   ${msg.text}`;
    })
    .join('\n\n');
  
  // 2. INFORMACIÓN TÉCNICA RECOPILADA
  const technicalInfo = [
    `📱 *Información Técnica:*`,
    session.operatingSystem ? `• OS: ${session.operatingSystem}` : null,
    session.device ? `• Dispositivo: ${session.device}` : null,
    session.deviceBrand ? `• Marca: ${session.deviceBrand}` : null,
    session.problemCategory ? `• Categoría: ${session.problemCategory}` : null,
    session.activeIntent 
      ? `• Intent: ${session.activeIntent.type} (${Math.round(session.activeIntent.confidence * 100)}%)` 
      : null
  ].filter(Boolean).join('\n');
  
  // 3. CONSTRUIR MENSAJE COMPLETO
  const whatsappMessage = encodeURIComponent(
    `🆘 *Solicitud de Soporte Técnico*\n\n` +
    `📋 *ID Sesión:* ${sid}\n\n` +
    `${technicalInfo}\n\n` +
    `📝 *Historial de Conversación:*\n\n` +
    `${transcriptText}\n\n` +
    `⏰ *Hora de solicitud:* ${new Date().toLocaleString('es-AR')}`
  );
  
  // 4. GENERAR URL DE WHATSAPP
  const whatsappNumber = process.env.WHATSAPP_SUPPORT_NUMBER || '5492323569443';
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
  
  // 5. RESPONDER AL USUARIO
  const confirmMsg = isEn
    ? `Perfect! Click the link below to open WhatsApp...`
    : `¡Perfecto! Hacé clic en el enlace de abajo para abrir WhatsApp...`;
  
  session.transcript.push({ who: 'bot', text: confirmMsg, ts: nowIso() });
  await saveSessionAndTranscript(sid, session);
  
  return res.json({
    ok: true,
    reply: confirmMsg,
    whatsappUrl: whatsappUrl,
    metadata: {
      action: 'open_whatsapp',
      url: whatsappUrl
    }
  });
}
```

---

#### 5.4.3 Sistema de Tickets (Alternativa Completa)

**Endpoint:** `POST /api/whatsapp-ticket` (server.js línea 3217)

**Función principal:** `createTicket(session)` (ticketing.js línea 37)

**Proceso completo:**

**1. Generación de ID único:**
```javascript
export function generateTicketId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  
  return `STI-${year}${month}${day}-${random}`;
  // Ejemplo: STI-20251206-A3F2
}
```

**2. Construcción del ticket:**
```javascript
const ticket = {
  id: ticketId,                    // STI-20251206-A3F2
  sessionId: session.id,
  createdAt: now,
  status: 'open',
  priority: 'normal',
  
  user: {
    name: maskPII(session.userName || 'Anónimo'),
    nameOriginal: session.userName,
    locale: session.userLocale
  },
  
  issue: {
    device: session.device,
    problem: maskPII(session.problem),
    description: generateProblemSummary(session),
    category: session.issueKey
  },
  
  diagnostic: {
    stepsCompleted: stepsCompleted.length,
    steps: stepsCompleted,
    summary: stepsSummary
  },
  
  transcript: session.transcript.map(msg => ({
    ...msg,
    text: maskPII(msg.text)
  })),
  
  cleanConversation: formatCleanConversation(session.transcript, userName),
  
  metadata: {
    createdBy: 'Tecnos AI Chatbot v7',
    escalationReason: session.escalationReason,
    gdprConsent: session.gdprConsent
  }
};
```

**3. Persistencia:**
```javascript
const ticketPath = path.join(TICKETS_DIR, `${ticketId}.json`);
fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2), 'utf8');
```

**4. Generación del link WhatsApp:**
```javascript
export function generateWhatsAppLink(ticket) {
  const userName = ticket.user.nameOriginal || 'Usuario';
  const device = ticket.issue.device || 'Sin especificar';
  const problemSummary = ticket.issue.description;
  const conversation = formatCleanConversation(ticket.transcript, userName);
  
  const message = `Hola STI! 👋

Vengo del chat web con Tecnos (Asistente AI).

📝 **Ticket:** ${ticket.id}
👤 **Usuario:** ${userName}
💻 **Dispositivo:** ${device}
🕒 **Inicio:** ${startTime}

🧾 **RESUMEN DEL PROBLEMA:**
${problemSummary}

💬 **CONVERSACIÓN:**

${conversation}

✅ ${ticket.diagnostic.stepsCompleted} pasos de diagnóstico completados

🔗 Ver ticket completo: ${getTicketPublicUrl(ticket.id)}

Gracias!`;

  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
}
```

**5. Formato de conversación limpia:**
```javascript
function formatCleanConversation(transcript, userName) {
  const lines = [];
  
  for (const msg of transcript) {
    if (!msg.text || msg.who === 'system') continue;
    
    const time = new Date(msg.ts).toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const speaker = msg.who === 'user' ? userName : 'Tecnos';
    
    lines.push(`[${time}] ${speaker}: ${maskPII(msg.text)}`);
  }
  
  return lines.join('\n');
}
```

**Ejemplo de salida:**
```
[10:30] Lucas: Hola, mi notebook no prende
[10:31] Tecnos: ¡Hola Lucas! Te ayudo con eso...
[10:32] Lucas: Marca HP, Windows 10
[10:33] Tecnos: Probá estos pasos:
1. Desconectá el cargador...
[10:35] Lucas: Nada funcionó
[10:36] Tecnos: Te conecto con un técnico...
```

---

### 5.5 Manejo de Imágenes

#### 5.5.1 Recepción desde Frontend

**Frontend (sti-chat-widget.js línea 10-35):**

```javascript
// Variables globales
let pendingImageBase64 = null;
let pendingImageName = null;

// Listener del botón adjuntar
const attachBtn = document.getElementById('sti-attach-btn');
const imageInput = document.getElementById('sti-image-input');

attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', handleImageSelected);

// Función para manejar imagen seleccionada
function handleImageSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validar tipo
  if (!file.type.startsWith('image/')) {
    addMessage('bot', '❌ Por favor, selecciona solo archivos de imagen');
    event.target.value = '';
    return;
  }

  // Validar tamaño (máximo 5MB)
  if (file.size > 5 * 1024 * 1024) {
    addMessage('bot', '❌ La imagen es muy pesada. Máximo 5MB.');
    event.target.value = '';
    return;
  }

  // Convertir a base64
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingImageBase64 = e.target.result; // data:image/jpeg;base64,...
    pendingImageName = file.name;
    addMessage('user', `📎 Imagen adjunta: ${pendingImageName}`);
  };
  reader.onerror = () => {
    addMessage('bot', '❌ Error al cargar la imagen.');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}
```

**Envío al backend (sti-chat-widget.js línea 120):**

```javascript
async function sendMessage() {
  const text = textInput.value.trim();
  
  // Validar que haya texto o imagen
  if (!text && !pendingImageBase64) return;

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        message: text,
        imageBase64: pendingImageBase64 || null,  // ← IMAGEN
        imageName: pendingImageName || null       // ← NOMBRE
      })
    });

    const data = await response.json();
    // ...
  } finally {
    // Limpiar imagen después de enviar
    pendingImageBase64 = null;
    pendingImageName = null;
  }
}
```

---

#### 5.5.2 Procesamiento en Backend

**A. Recepción en endpoint (server.js línea 4782+):**

```javascript
app.post('/api/chat', chatLimiter, validateCSRF, async (req, res) => {
  const body = req.body || {};
  
  // Extraer datos
  const text = String(body.text || body.message || '').trim();
  const imageBase64 = body.imageBase64 || null;
  const imageName = body.imageName || null;
  
  console.log('[DEBUG /api/chat] Imagen recibida:', {
    hasImage: !!imageBase64,
    imageName: imageName,
    dataLength: imageBase64?.length
  });
  
  // Procesar imagen si existe...
});
```

**B. Conversión base64 → URL (server.js línea 240+):**

```javascript
if (imageBase64 && imageBase64.startsWith('data:image/')) {
  console.log('[VISION_MODE] 🖼️ Imagen base64 detectada');
  
  // Opción 1: Usar directamente el data URL
  imageUrls.push(imageBase64);
  
  // Opción 2: Guardar en disco y generar URL pública
  try {
    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1]; // jpeg, png, etc.
      const data = matches[2];
      const buffer = Buffer.from(data, 'base64');
      
      // Validar tamaño
      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Imagen muy pesada');
      }
      
      // Guardar archivo
      const filename = `${sessionId}_${Date.now()}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, buffer);
      
      // Generar URL pública
      const publicUrl = `${PUBLIC_BASE_URL}/uploads/${filename}`;
      imageUrls.push(publicUrl);
      
      console.log('[VISION_MODE] ✅ Imagen guardada:', filename);
    }
  } catch (err) {
    console.error('[VISION_MODE] ❌ Error procesando imagen:', err);
  }
}
```

---

#### 5.5.3 Envío a OpenAI Vision

**Función:** `analyzeUserMessage()` (server.js línea 225+)

```javascript
async function analyzeUserMessage(text, session, imageUrls = []) {
  if (!openai || !SMART_MODE_ENABLED) {
    return { analyzed: false, fallback: true };
  }

  // Si hay imágenes → activar modo visión
  if (imageUrls.length > 0) {
    console.log('[VISION_MODE] 🔍 Modo visión activado -', imageUrls.length, 'imagen(es)');
    
    const visionPrompt = `Sos Tecnos, un asistente técnico experto de STI.
    
El usuario te envió imagen(es) de su problema técnico.

TAREAS:
1. 🔍 Analizá TODAS las imágenes en detalle máximo
2. 📝 Si hay texto visible → transcribilo completo
3. 🖥️ Identificá dispositivo exacto
4. ⚠️ Detectá problema técnico específico
5. 💡 Sugerí 2-3 pasos concretos

Mensaje del usuario: "${text}"

Respondé en JSON con toda la información...`;

    // Construir contenido con imágenes
    const messageContent = [
      { type: 'text', text: visionPrompt }
    ];
    
    // Agregar cada imagen
    for (const imgUrl of imageUrls) {
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: imgUrl,        // data:image/jpeg;base64,... o URL pública
          detail: 'high'      // Máxima calidad de análisis
        }
      });
    }

    // Llamar a OpenAI con visión
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',      // ⚠️ IMPORTANTE: gpt-4o, no gpt-4o-mini
      messages: [{ 
        role: 'user', 
        content: messageContent 
      }],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    
    console.log('[VISION_MODE] ✅ Análisis completado:', {
      imagesAnalyzed: analysis.imagesAnalyzed,
      device: analysis.device?.type,
      problem: analysis.problem?.summary,
      textDetected: analysis.visualContent?.textDetected ? 'SÍ' : 'NO'
    });

    return { 
      analyzed: true, 
      hasVision: true,
      ...analysis 
    };
  }
  
  // Sin imágenes → análisis de texto normal
  // ...
}
```

---

#### 5.5.4 Almacenamiento con Multer

**Configuración (server.js línea 2626):**

```javascript
import multer from 'multer';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o755 });
    }
    cb(null, UPLOADS_DIR);
  },
  
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (!allowedExts.includes(ext)) {
      return cb(new Error('Tipo de archivo no permitido'));
    }
    
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const sessionId = req.sessionId.substring(0, 20);
    const safeName = `${sessionId}_${timestamp}_${random}${ext}`;
    
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5MB máximo
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Validar MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes'));
    }
    
    // Prevenir path traversal
    if (file.originalname.includes('..') || 
        file.originalname.includes('/') || 
        file.originalname.includes('\\')) {
      return cb(new Error('Nombre de archivo inválido'));
    }
    
    cb(null, true);
  }
});

// Servir archivos subidos
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  etag: true
}));
```

**Endpoint de upload (ejemplo):**

```javascript
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }
    
    const publicUrl = `${PUBLIC_BASE_URL}/uploads/${req.file.filename}`;
    
    res.json({
      ok: true,
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
```

---

## Resumen de Integraciones

**Diagrama de flujo completo:**

```
┌──────────────────────────────────────────────────────┐
│                   USUARIO                            │
│              (https://stia.com.ar)                   │
└──────────────┬───────────────────────────────────────┘
               │
        Sube imagen 📸
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              FRONTEND (Ferozo)                       │
│  • index.php                                         │
│  • sti-chat-widget.js                               │
│                                                      │
│  1. FileReader.readAsDataURL() → base64             │
│  2. Envía: { imageBase64, imageName }               │
└──────────────┬───────────────────────────────────────┘
               │ POST /api/chat
               │ Content-Type: application/json
               │ Body: { sessionId, message, imageBase64 }
               ▼
┌──────────────────────────────────────────────────────┐
│            BACKEND (Render)                          │
│  • server.js                                         │
│                                                      │
│  1. Recibe imageBase64                              │
│  2. Guarda en /data/uploads/ (opcional)             │
│  3. Genera URL pública                              │
│  4. Llama analyzeUserMessage(text, session, [imgUrl])│
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              OpenAI API                              │
│  • Modelo: gpt-4o (con visión)                      │
│                                                      │
│  Request:                                            │
│  {                                                   │
│    model: "gpt-4o",                                 │
│    messages: [{                                     │
│      role: "user",                                  │
│      content: [                                     │
│        { type: "text", text: "..." },              │
│        { type: "image_url",                        │
│          image_url: {                              │
│            url: "data:image/jpeg;base64,...",      │
│            detail: "high"                          │
│          }                                         │
│        }                                           │
│      ]                                             │
│    }]                                              │
│  }                                                 │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│            RESPUESTA JSON                            │
│  {                                                   │
│    "imagesAnalyzed": true,                          │
│    "visualContent": {                               │
│      "textDetected": "CRITICAL_PROCESS_DIED",      │
│      "errorCodes": ["0x000000EF"]                  │
│    },                                              │
│    "problem": {                                    │
│      "summary": "Pantalla azul BSOD...",          │
│      "possibleCauses": [...]                       │
│    },                                              │
│    "nextSteps": ["Paso 1...", "Paso 2..."]        │
│  }                                                 │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│         PROCESAMIENTO BACKEND                        │
│  • Mezcla análisis con lógica interna              │
│  • Genera respuesta final                          │
│  • Determina botones según context                 │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│            RESPUESTA AL FRONTEND                     │
│  {                                                   │
│    "ok": true,                                      │
│    "reply": "Vi tu pantalla azul...",              │
│    "buttons": [                                     │
│      { "text": "✅ Funcionó", "value": "..." }     │
│    ],                                              │
│    "stage": "AWAITING_DIAGNOSTIC_RESULT"           │
│  }                                                 │
└──────────────────────────────────────────────────────┘
```

---

**PARTE 2A COMPLETA**
