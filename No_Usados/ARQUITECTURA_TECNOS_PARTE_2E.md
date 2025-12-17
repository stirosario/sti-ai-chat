# Ecosistema Tecnos / STI – Mapa de Arquitectura (PARTE 2E)

**Fecha:** 6 de diciembre de 2025  
**Complemento de:** ARQUITECTURA_TECNOS_PARTE_1.md, ARQUITECTURA_TECNOS_PARTE_2A.md, ARQUITECTURA_TECNOS_PARTE_2B.md, ARQUITECTURA_TECNOS_PARTE_2C.md, ARQUITECTURA_TECNOS_PARTE_2D.md  
**Enfoque:** Logs, Tickets, Puntos Críticos y Recomendaciones para Cursor

---

## 8. Logs y Tickets

### 8.1 Almacenamiento de Logs

**Ubicación:** `data/logs/server.log`

**Configuración (server.js líneas 735-745):**
```javascript
const LOGS_DIR = process.env.LOGS_DIR || path.join(DATA_BASE, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
```

**Qué se registra:**
- Todos los `console.log()` y `console.error()`
- Mensajes enmascarados con `maskPII()` (sin datos sensibles)
- Timestamp ISO 8601 en cada entrada
- Nivel: `[INFO]` o `[ERROR]`

**Acceso:**
- Endpoint: `GET /api/logs` (protegido con `LOG_TOKEN`)
- Endpoint SSE: `GET /api/logs/stream` (logs en tiempo real)
- Interface web: `chatlog.php` (requiere autenticación admin)

---

### 8.2 Información Guardada en un Ticket

**Ubicación:** `data/tickets/TCK-YYYYMMDD-XXXX.json`

**Estructura completa (server.js líneas 4230-4245):**
```json
{
  "id": "TCK-20251206-A3F2",
  "createdAt": "2025-12-06T14:30:00.000Z",
  "label": "06-12-2025 14:30 (ART)",
  "name": "Lucas",
  "device": "notebook",
  "problem": "No enciende, luz de carga parpadea",
  "locale": "es-AR",
  "sid": "web-abc123",
  "accessToken": "d8f3a9b2...",
  "stepsDone": [
    { "step": 1, "label": "Apagado completo", "status": "done" }
  ],
  "transcript": [
    { "ts": "2025-12-06T14:25:00Z", "who": "user", "text": "Hola" },
    { "ts": "2025-12-06T14:25:05Z", "who": "bot", "text": "¡Hola! ¿Cómo te llamás?" }
  ],
  "redactPublic": true
}
```

**También se crea:**
- Archivo `.txt` con formato legible para humanos
- Máscara PII aplicada a todo el contenido sensible

---

### 8.3 Construcción del Mensaje WhatsApp

**Ubicación:** `server.js` líneas 4250-4270

**Componentes del mensaje:**
1. **Título:** `STI • Ticket TCK-20251206-XXXX-LUCAS`
2. **Intro personalizada:** "Hola STI, me llamo Lucas. Vengo del chat web..."
3. **Metadata:**
   - Fecha/hora generación (ART)
   - Cliente (nombre enmascarado)
   - Equipo/dispositivo
   - Ticket ID
4. **Link al ticket:** `https://sti-rosario-ai.onrender.com/api/ticket/TCK-...`
5. **Aviso legal:** "No incluyas contraseñas ni datos bancarios"

**Función que lo genera:**
```javascript
const waText = `${titleLine}\n${waIntro}\n\nGenerado: ${generatedLabel}\n...`;
const waUrl = buildWhatsAppUrl(waNumberRaw, waText);
// Resultado: https://wa.me/5493417422422?text=...
```

**Variantes generadas:**
- `waUrl` - Enlace universal `wa.me` (móvil + web)
- `waWebUrl` - Enlace específico para WhatsApp Web
- `waAppUrl` - Enlace API WhatsApp
- `waIntentUrl` - Intent Android (abre app nativa)

---

### 8.4 Almacenamiento de JSON de Tickets

**Directorio:** `data/tickets/`

**Nomenclatura:**
- `TCK-20251206-A3F2.json` - Datos estructurados
- `TCK-20251206-A3F2.txt` - Texto legible para humanos

**Endpoint de consulta:**
- `GET /api/ticket/:tid` - Retorna JSON completo
- `GET /ticket/:tid` - Retorna UI HTML renderizada

**Seguridad:**
- `accessToken` requerido para acceso público
- `redactPublic: true` indica que PII fue enmascarado

---

### 8.5 Rol de `chatlog.php` / Codex

**Archivo:** `public_html/chatlog.php`

**Propósito:**
- Interface administrativa web para ver logs en tiempo real
- Acceso protegido con autenticación en `admin.php`
- Muestra logs formateados con colores y timestamps

**Funcionalidades:**
- Stream SSE de logs en vivo
- Búsqueda y filtrado de logs
- Visualización de sesiones activas
- Acceso a transcripts completos

**Conexión:**
```javascript
// chatlog.php se conecta a:
const logsEndpoint = API_BASE + '/api/logs/stream?token=' + LOG_TOKEN;
const eventSource = new EventSource(logsEndpoint);
```

**Codex (sistema heredado):**
- Referencia a sistema de logs anterior
- Actualmente reemplazado por `chatlog.php` + SSE
- Archivos legacy pueden estar en `BK/` (backup)

---

## 9. Puntos Críticos que NO Deben Romperse

### 9.1 Estado de Sesión

**Variable:** `session.stage`

**Crítico porque:**
- Determina qué handler ejecutar en `/api/chat`
- Se persiste en Redis/memoria entre mensajes
- Debe ser un valor válido del enum `STATES`

**Reglas inviolables:**
- Siempre llamar `await saveSessionAndTranscript(sid, session)` después de modificar
- Validar que existe antes de comparar: `if (session.stage === STATES.ASK_PROBLEM)`
- No asignar strings arbitrarios, solo valores de `STATES`

---

### 9.2 Intención Activa

**Variable:** `session.activeIntent`

**Crítico porque:**
- Mantiene contexto durante respuestas auxiliares ("w10", "HP", etc.)
- Evita recalcular intención en cada mensaje
- Usado por `smartResponseGenerator` para generar respuesta correcta

**Estructura obligatoria:**
```javascript
{
  type: 'installation_help',      // INTENT_TYPES válido
  originalMessage: string,
  confidence: number,
  resolved: boolean,
  detectedAt: string (ISO)
}
```

**Reglas:**
- No borrar hasta que `resolved: true`
- No sobrescribir si es respuesta auxiliar (`isAuxiliaryResponse`)
- Consultar en `handleIntelligentChat` antes de recalcular intent

---

### 9.3 Flujo Principal `/api/chat`

**Archivo:** `server.js`  
**Ubicación:** Líneas 4700-7700 (3000 líneas de handlers)

**Crítico porque:**
- Es el corazón del bot
- Contiene toda la lógica de estados
- Maneja transiciones y validaciones

**Secciones protegidas:**
1. **Sistema inteligente (líneas 4950-5150):** Feature flag `USE_INTELLIGENT_MODE`
2. **ASK_NAME (líneas 5850-5990):** Bug fix "w10" documentado
3. **ASK_PROBLEM (líneas 6010-6550):** Generación de pasos diagnósticos
4. **Handlers de botones (líneas 6150-6250):** BTN_WHATSAPP_TECNICO, etc.

**Comentarios de seguridad:**
```javascript
// ========================================================
// 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #1
// ========================================================
// ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
```

---

### 9.4 Motor de Intención

**Archivo:** `src/core/intentEngine.js`

**Crítico porque:**
- Clasifica intención del usuario con OpenAI
- Fallback con regex si OpenAI falla
- Valida contexto de acciones (botones)

**Funciones críticas:**
- `analyzeIntent(userMessage, context, locale)` - NO cambiar firma
- `fallbackIntentAnalysis(userMessage)` - NO eliminar
- `validateActionInContext(buttonToken, currentIntent, context)` - NO simplificar lógica

---

### 9.5 Generador de Respuestas

**Archivo:** `src/core/smartResponseGenerator.js`

**Crítico porque:**
- Genera respuestas con OpenAI basadas en intención
- Maneja instalaciones, problemas técnicos, consultas
- Aplica tono argentino con voseo

**Funciones críticas:**
- `generateSmartResponse(intentAnalysis, userMessage, context, locale)` - NO cambiar firma
- `handleInstallationWithOS(software, os, locale)` - NO eliminar
- `handleTechnicalProblem(problem, device, locale)` - NO simplificar

---

### 9.6 Manejo de `imageBase64`

**Flujo completo:**

1. **Frontend captura (sti-chat-widget.js líneas 10-35):**
```javascript
const reader = new FileReader();
reader.onload = (e) => {
  pendingImageBase64 = e.target.result; // data:image/jpeg;base64,...
};
```

2. **Backend recibe (server.js líneas 4780+):**
```javascript
const imageBase64 = body.imageBase64 || null;
const imageName = body.imageName || null;
```

3. **Backend procesa (server.js líneas 5200-5280):**
```javascript
if (imageBase64 && imageBase64.startsWith('data:image/')) {
  // Guardar en /data/uploads/
  // Generar URL pública
  imageUrls.push(publicUrl);
}
```

4. **OpenAI Vision analiza (server.js líneas 260-340):**
```javascript
const messageContent = [
  { type: 'text', text: visionPrompt },
  { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } }
];
```

**Reglas:**
- Validar `data:image/` prefix antes de procesar
- Límite 5MB (frontend + backend)
- Solo tipos permitidos: jpg, png, gif, webp
- Usar modelo `gpt-4o` (NO `gpt-4o-mini`) para visión

---

### 9.7 Formato JSON del Bot

**Estructura obligatoria (response):**
```javascript
{
  ok: true,
  reply: "Texto de respuesta",
  stage: "BASIC_TESTS",
  options: [
    { text: "✅ Funcionó", value: "BTN_SUCCESS" },
    { text: "❌ Persiste", value: "BTN_PERSIST" }
  ],
  ui: {
    buttons: [...] // Alternativa
  }
}
```

**Campos opcionales críticos:**
- `whatsappUrl` - Si se generó ticket
- `metadata` - Info adicional para frontend
- `steps` - Array de pasos diagnósticos
- `intentDetected` - Intent que se detectó

**Frontend espera estos campos (index.php líneas 1200+):**
```javascript
if (data.reply) {
  addMessage('bot', data.reply, data.buttons || data.options);
}
if (data.whatsappUrl) {
  window.open(data.whatsappUrl, '_blank');
}
```

---

### 9.8 Integración WhatsApp

**Componentes críticos:**

1. **Número WhatsApp:** `5493417422422`
   - Variable env: `WHATSAPP_NUMBER`
   - Usado en `createTicketAndRespond()`

2. **Generación de link:**
```javascript
const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
```

3. **Botón frontend (index.php líneas 6152+):**
```javascript
if (buttonToken === 'BTN_WHATSAPP_TECNICO') {
  // Construir mensaje con historial completo
  // Generar link con wa.me
}
```

4. **Ticket JSON debe incluir:**
   - `transcript` completo con `maskPII()`
   - `accessToken` para acceso público
   - `apiPublicUrl` para ver ticket

**No romper:**
- Formato del mensaje (título, intro, metadata)
- Enmascaramiento PII antes de enviar
- Link al ticket público

---

### 9.9 Widget de Chat (`sti-chat-widget.js`)

**Componentes críticos:**

**1. Input de texto (líneas 80-90):**
```javascript
const textInput = document.getElementById('sti-text');
textInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    sendMessage();
  }
});
```

**2. Botones de opciones (líneas 140-160):**
```javascript
function addMessage(type, text, buttons = null) {
  if (buttons && buttons.length > 0) {
    buttonsHTML = buttons.map(btn => 
      `<button onclick="selectOption('${btn.value}')">${btn.label}</button>`
    ).join('');
  }
}
```

**3. Clip de imagen (líneas 10-35):**
```javascript
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', handleImageSelected);
```

**No romper:**
- IDs de elementos: `sti-text`, `sti-send`, `sti-attach-btn`
- Event listeners: `keypress`, `click`, `change`
- Función `sendMessage()` - debe enviar `sessionId`, `message`, `imageBase64`
- Función `selectOption(value)` - debe enviar botón clickeado

---

## 10. Recomendaciones para CURSOR

### 10.1 Carpetas a Leer Primero

**Orden de prioridad:**

1. **`ARQUITECTURA_TECNOS_PARTE_1.md`** (este documento y partes 2A-2E)
   - Visión general completa
   - Flujo de 9 pasos
   - Estados básicos

2. **`server.js`** (líneas 1-500)
   - Configuración, imports, constantes
   - No leer todo de golpe (7700 líneas)

3. **`src/core/`**
   - `intentEngine.js` - Clasificación de intención
   - `smartResponseGenerator.js` - Generación de respuestas
   - `intelligentChatHandler.js` - Handler principal del sistema inteligente

4. **`index.php`** (líneas 800-1100)
   - Configuración API_BASE
   - Funciones de manejo de imágenes
   - Widget loading

5. **`sti-chat-widget.js`**
   - Lógica del chat frontend
   - Event handlers

---

### 10.2 Archivos que NO Editar sin Aprobación

**Prohibido modificar directamente:**

1. **`server.js` (bloques protegidos con comentarios):**
   ```javascript
   // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #1
   // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
   ```

2. **`src/core/intentEngine.js`:**
   - Firma de `analyzeIntent()`
   - Lógica de `fallbackIntentAnalysis()`

3. **`src/core/smartResponseGenerator.js`:**
   - Prompts de OpenAI (requieren testing extensivo)

4. **`index.php` (secciones críticas):**
   - API_BASE configuration
   - Widget loading inline

5. **`sti-chat-widget.js`:**
   - Event listeners principales
   - Función `sendMessage()`

**Si necesitas cambios:**
- Crear feature branch
- Documentar razón del cambio
- Testear con smoke tests (ver 10.4)
- Pedir revisión antes de merge

---

### 10.3 Cómo Probar Cambios sin Romper Estados

**Estrategia de testing seguro:**

**1. Usar feature flags:**
```javascript
const USE_NEW_FEATURE = process.env.USE_NEW_FEATURE === 'true';

if (USE_NEW_FEATURE) {
  // Nuevo código
} else {
  // Código legacy (fallback)
}
```

**2. Duplicar funciones antes de modificar:**
```javascript
// Función original (mantener como fallback)
function generateStepsLegacy(session) { ... }

// Nueva versión
function generateStepsV2(session) { ... }

// Toggle
const generateSteps = USE_V2_STEPS ? generateStepsV2 : generateStepsLegacy;
```

**3. Logging exhaustivo:**
```javascript
console.log('[NEW_FEATURE] Estado antes:', session.stage);
// Código nuevo
console.log('[NEW_FEATURE] Estado después:', session.stage);
console.log('[NEW_FEATURE] activeIntent:', session.activeIntent);
```

**4. Testear en sesión aislada:**
```javascript
// Usar sessionId específico para testing
const TEST_SESSION_ID = 'test-feature-xyz';
```

**5. Validar persistencia:**
```javascript
// Después de cambiar estado
await saveSessionAndTranscript(sid, session);

// Recuperar y verificar
const sessionReloaded = await getSession(sid);
console.log('[VALIDATION] stage persistido:', sessionReloaded.stage);
```

---

### 10.4 Smoke Tests Sugeridos

**Ejecutar ANTES de cada deploy o merge a main:**

#### Test 1: Instalación AnyDesk

**Objetivo:** Verificar flujo installation_help completo

**Pasos:**
1. Usuario: "Hola"
2. Bot: "¿Cómo te llamás?"
3. Usuario: "Lucas"
4. Bot: "¿En qué puedo ayudarte?"
5. Usuario: "Quiero instalar AnyDesk"
6. Bot: "¿Qué sistema operativo tenés?"
7. Usuario: "w10"
8. Bot: [Guía de instalación con pasos]

**Validar:**
- ✅ `session.stage` termina en `BASIC_TESTS` o `ENDED`
- ✅ `session.activeIntent.type === 'installation_help'`
- ✅ Respuesta contiene link oficial de AnyDesk
- ✅ Botones "Funcionó ✔️" / "Necesito ayuda"

**Script automatizado:**
```bash
node test-install-anydesk.js
```

---

#### Test 2: Mi compu no prende

**Objetivo:** Verificar flujo technical_problem con diagnóstico

**Pasos:**
1. Usuario: "Hola"
2. Bot: "¿Cómo te llamás?"
3. Usuario: "Ana"
4. Bot: "¿En qué puedo ayudarte?"
5. Usuario: "Mi compu no prende"
6. Bot: "¿Qué dispositivo es?" (si ambiguo)
7. Usuario: [Selecciona "Notebook"]
8. Bot: [Pasos diagnósticos básicos]

**Validar:**
- ✅ `session.stage === 'BASIC_TESTS'`
- ✅ `session.activeIntent.type === 'technical_problem'`
- ✅ `session.device === 'notebook'`
- ✅ `session.tests.basic.length >= 3`
- ✅ Botones incluyen "Pruebas Avanzadas" y "Conectar Técnico"

**Script automatizado:**
```bash
node test-no-prende.js
```

---

#### Test 3: Hablar con Técnico

**Objetivo:** Verificar creación de ticket y link WhatsApp

**Pasos:**
1. Usuario: "Hola"
2. Bot: "¿Cómo te llamás?"
3. Usuario: "Carlos"
4. Bot: "¿En qué puedo ayudarte?"
5. Usuario: "Mi PC no funciona"
6. Bot: [Pasos básicos]
7. Usuario: [Clickea "Conectar con Técnico"]
8. Bot: [Genera ticket]

**Validar:**
- ✅ Ticket creado en `data/tickets/TCK-*.json`
- ✅ Ticket contiene:
  - `id` válido formato `TCK-YYYYMMDD-XXXX`
  - `transcript` completo con PII enmascarado
  - `accessToken` generado
- ✅ `response.whatsappUrl` contiene `https://wa.me/5493417422422`
- ✅ Mensaje WhatsApp incluye ticket ID y link al ticket
- ✅ `session.stage === 'TICKET_SENT'`

**Script automatizado:**
```bash
node test-ticket-creation.js
```

---

#### Test 4: Upload de Imagen

**Objetivo:** Verificar OpenAI Vision y análisis de imagen

**Pasos:**
1. Usuario: "Hola" + envía imagen de pantalla azul
2. Bot: Analiza imagen con Vision API
3. Bot: "Vi tu pantalla azul con el error..."

**Validar:**
- ✅ Imagen guardada en `data/uploads/`
- ✅ `session.images` contiene URL de la imagen
- ✅ Llamada a OpenAI con modelo `gpt-4o`
- ✅ Respuesta menciona contenido de la imagen
- ✅ `session.images[0].analysis` contiene análisis

**Script manual:**
```javascript
// En test-image-upload.js
const imageBase64 = 'data:image/jpeg;base64,...'; // Imagen de test
const response = await fetch('http://localhost:3001/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'test-image',
    message: 'Mi PC muestra esto',
    imageBase64: imageBase64
  })
});
```

---

### 10.5 Checklist Pre-Deploy

**Antes de hacer push a main o deploy a Render:**

- [ ] Smoke Test 1 (instalación) pasa
- [ ] Smoke Test 2 (problema técnico) pasa
- [ ] Smoke Test 3 (ticket WhatsApp) pasa
- [ ] Smoke Test 4 (imagen) pasa (opcional si no tocaste visión)
- [ ] No hay bloques protegidos modificados sin revisión
- [ ] Logs muestran `[INFO]` sin errores críticos
- [ ] `session.stage` se persiste correctamente
- [ ] `session.activeIntent` no se sobrescribe en respuestas auxiliares
- [ ] Feature flags están configurados (si aplica)
- [ ] `.env.example` actualizado con nuevas variables
- [ ] Documentación actualizada (README o ARQUITECTURA_*)

---

### 10.6 Debugging con Cursor

**Técnicas recomendadas:**

**1. Usar Cursor Composer para análisis:**
```
@workspace Analiza el flujo desde ASK_PROBLEM hasta BASIC_TESTS 
sin modificar código. Solo explica qué hace cada paso.
```

**2. Buscar funciones con Cursor:**
```
@workspace Busca todas las funciones que modifican session.stage
```

**3. Validar lógica con Cursor:**
```
@workspace Revisa si esta función maneja correctamente el caso 
cuando session.device es null
```

**4. Generar tests:**
```
@workspace Genera un test unitario para la función analyzeIntent()
que valide todos los INTENT_TYPES posibles
```

**5. Revisar impacto de cambios:**
```
@workspace Si modifico la firma de generateSmartResponse(), 
¿qué archivos debo actualizar?
```

---

### 10.7 Patrón Recomendado de Desarrollo

**Flujo sugerido:**

1. **Leer documentación primero:**
   - ARQUITECTURA_TECNOS_PARTE_1.md (flujo general)
   - ARQUITECTURA_TECNOS_PARTE_2B.md (estado específico a modificar)
   - ARQUITECTURA_TECNOS_PARTE_2D.md (fallbacks relacionados)

2. **Buscar código existente:**
   ```
   @workspace ¿Dónde se maneja el estado BASIC_TESTS?
   ```

3. **Crear branch de feature:**
   ```bash
   git checkout -b feature/mejora-diagnostico
   ```

4. **Implementar con feature flag:**
   ```javascript
   const USE_MEJORA_DIAGNOSTICO = process.env.USE_MEJORA_DIAGNOSTICO === 'true';
   ```

5. **Logging exhaustivo:**
   ```javascript
   console.log('[MEJORA_DIAGNOSTICO] Iniciando lógica nueva...');
   ```

6. **Testear localmente:**
   ```bash
   USE_MEJORA_DIAGNOSTICO=true node server.js
   # Ejecutar smoke tests
   ```

7. **Validar con Cursor:**
   ```
   @workspace Revisa si mi cambio en línea 4500 de server.js 
   afecta la persistencia de session.stage
   ```

8. **Commit descriptivo:**
   ```bash
   git commit -m "feat: Mejora diagnóstico con detección de marca

   - Agrega detección automática de marca de dispositivo
   - Feature flag USE_MEJORA_DIAGNOSTICO
   - Fallback a lógica legacy si falla
   - Tests: test-mejora-diagnostico.js"
   ```

9. **PR con contexto:**
   - Link a documentación relevante
   - Screenshots de tests pasando
   - Explicación de por qué el cambio es necesario

---

**PARTE 2E COMPLETA**
