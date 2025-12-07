# README para Cursor AI y Desarrolladores

**Proyecto:** Tecnos/STI - Chatbot Inteligente de Soporte Técnico  
**Fecha:** 6 de diciembre de 2025  
**Propósito:** Guía para trabajar en este repositorio sin romper el sistema en producción

---

## 🎯 Objetivo de este Documento

Este README es una **guía de supervivencia** para IAs de código (como Cursor) y desarrolladores humanos que necesitan modificar, extender o debuggear el chatbot Tecnos sin causar regresiones ni romper funcionalidades críticas.

**⚠️ ADVERTENCIA CRÍTICA:** Este sistema está en producción atendiendo usuarios reales en https://stia.com.ar. Cualquier cambio debe ser testeado exhaustivamente antes de hacer deploy.

---

## 📚 Documentación Base a Leer Primero

### Orden Recomendado de Lectura

Antes de modificar CUALQUIER archivo, **leé la documentación en este orden**:

#### 1️⃣ **ARQUITECTURA_TECNOS_PARTE_1.md** (OBLIGATORIO)
- **Qué contiene:** Visión general, estructura de carpetas, flujo de conversación completo (9 pasos), estados básicos, bugs documentados (ej: bug "w10")
- **Por qué leerlo:** Es el mapa del sistema. Sin esto, no entenderás cómo funciona el flujo conversacional.
- **Tiempo estimado:** 15-20 minutos
- **Secciones críticas:**
  - § 1: Visión General del Proyecto
  - § 2: Estructura de Carpetas y Archivos Clave
  - § 3: Flujo de Conversación de Usuario (PASO 1 a PASO 9)
  - § 4: Estados Básicos (ASK_LANGUAGE, ASK_NAME, ASK_NEED)

#### 2️⃣ **ARQUITECTURA_TECNOS_PARTE_2A.md** (IMPORTANTE)
- **Qué contiene:** Integraciones externas (OpenAI, Render, Ferozo, WhatsApp, imágenes)
- **Por qué leerlo:** Si vas a tocar llamadas a OpenAI, manejo de imágenes o generación de tickets, necesitás esto.
- **Tiempo estimado:** 10-15 minutos
- **Secciones críticas:**
  - § 5.1: OpenAI Integration (modelos, prompts, parámetros)
  - § 5.2: Render Integration (endpoints, deploy)
  - § 5.3: Ferozo Integration (frontend PHP)
  - § 5.4: WhatsApp Integration (tickets, links)
  - § 5.5: Imágenes (Multer, validación, sharp)

#### 3️⃣ **ARQUITECTURA_TECNOS_PARTE_2B.md** (IMPORTANTE)
- **Qué contiene:** Máquina de estados avanzada (12 estados desde CLASSIFY_NEED hasta ENDED)
- **Por qué leerlo:** Si vas a modificar lógica de stages o transiciones entre estados, esto es obligatorio.
- **Tiempo estimado:** 10 minutos
- **Secciones críticas:**
  - § 6: Máquina de Estados Avanzada
  - Diagrama de transiciones de estados
  - Estados: CLASSIFY_NEED, ASK_DEVICE, BASIC_TESTS, ADVANCED_TESTS, TICKET_SENT

#### 4️⃣ **ARQUITECTURA_TECNOS_PARTE_2C.md** (ÚTIL)
- **Qué contiene:** Detalles técnicos (session.stage vs activeIntent, tabla de estados, OpenAI vs reglas)
- **Por qué leerlo:** Para entender la diferencia entre stages y intents, y cómo se combinan.
- **Tiempo estimado:** 5-10 minutos
- **Secciones críticas:**
  - § 7: session.stage vs activeIntent
  - § 9: Tabla resumida de estados
  - § 10: OpenAI vs Reglas de Negocio

#### 5️⃣ **ARQUITECTURA_TECNOS_PARTE_2D.md** (CRÍTICO si tocás fallbacks)
- **Qué contiene:** Fallbacks, manejo de errores, bugs conocidos (w10, JSON inválido)
- **Por qué leerlo:** Si vas a modificar `handleGuidingInstallationOSReply` o fallbacks, leé esto primero.
- **Tiempo estimado:** 8-10 minutos
- **Secciones críticas:**
  - § 7: Fallback General (`fallbackIntentAnalysis`)
  - § 8: Manejo de Errores (bug "w10", JSON inválido de OpenAI)
  - Prevención de bugs críticos

#### 6️⃣ **ARQUITECTURA_TECNOS_PARTE_2E.md** (ÚTIL)
- **Qué contiene:** Logs, tickets, puntos críticos, recomendaciones para Cursor
- **Por qué leerlo:** Contiene **puntos NO ROMPER** y mejores prácticas.
- **Tiempo estimado:** 5-8 minutos
- **Secciones críticas:**
  - § 8: Logs y Tickets
  - § 9: Puntos Críticos (NO ROMPER)
  - § 10: Recomendaciones para Cursor

#### 7️⃣ **INFRA_RESUMEN.md** (REFERENCIA)
- **Qué contiene:** Infraestructura (Render, Ferozo, variables de entorno, deploy)
- **Cuándo leerlo:** Cuando necesités configurar el proyecto, agregar env vars, o hacer deploy.
- **Tiempo estimado:** 10 minutos

#### 8️⃣ **FEATURE_FLAGS.md** (REFERENCIA)
- **Qué contiene:** Todos los feature flags (USE_*, SMART_*, AUTO_*)
- **Cuándo leerlo:** Cuando necesités activar/desactivar funcionalidades experimentales.
- **Tiempo estimado:** 5 minutos

---

## 🚨 Archivos Sensibles - NO Modificar sin Revisión

### Archivos ULTRA CRÍTICOS (Producción)

Estos archivos están en producción y son el corazón del sistema. **NO modificar sin:**
1. Leer la documentación relevante
2. Entender completamente el flujo
3. Hacer testing exhaustivo (incluyendo smoke tests)
4. Tener backup o capacidad de rollback

| Archivo | Por Qué es Crítico | Qué Contiene | Precauciones Especiales |
|---------|-------------------|--------------|-------------------------|
| **`server.js`** | Núcleo monolítico de 7776 líneas. TODO el flujo conversacional vive acá. | - Endpoint `/api/chat` (línea 4782+)<br/>- Máquina de estados completa<br/>- Análisis de intención<br/>- Generación de respuestas<br/>- Integración OpenAI<br/>- Sistema de tickets<br/>- Manejo de imágenes | **⚠️ EXTREMO CUIDADO:**<br/>- No cambiar estructura de `session` sin revisar todo el código<br/>- No modificar `response` JSON sin verificar frontend<br/>- No tocar `session.stage` transitions sin entender el diagrama<br/>- Cada cambio requiere smoke tests completos |
| **`src/core/intentEngine.js`** | Motor de análisis de intención con OpenAI. Clasifica qué quiere el usuario. | - `analyzeIntent()` - Función principal<br/>- Prompt de análisis (línea 388+)<br/>- Mapeo de intents<br/>- Confidence scoring | **⚠️ NO CAMBIAR:**<br/>- Estructura del JSON de salida (frontend depende de esto)<br/>- Lista de intents válidos sin agregar soporte en server.js<br/>- Prompt sin testear con 20+ casos reales |
| **`src/core/smartResponseGenerator.js`** | Generador de respuestas dinámicas con OpenAI. | - `generateSmartResponse()` - Función principal<br/>- Templates de prompts por tipo de respuesta<br/>- Parámetros de OpenAI (temperature, max_tokens) | **⚠️ NO CAMBIAR:**<br/>- Temperature sin razón (0.2-0.3 es óptimo para consistencia)<br/>- Max_tokens sin considerar costos<br/>- Prompt sin verificar tono argentino con voseo |
| **`sessionStore.js`** | Persistencia de sesiones (Redis o memoria). | - `getSession()`, `saveSession()`, `deleteSession()`<br/>- Lógica de fallback Redis → Memoria<br/>- TTL de sesiones | **⚠️ NO CAMBIAR:**<br/>- Estructura de objetos sin migración<br/>- TTL sin considerar conversaciones largas<br/>- Fallback logic (usuarios perderán sesiones) |
| **`ticketing.js`** | Sistema de tickets de WhatsApp. | - `createWhatsAppTicket()` - Genera ticket JSON<br/>- Construcción de mensaje WhatsApp<br/>- Enmascaramiento PII (`maskPII`)<br/>- Links wa.me | **⚠️ NO CAMBIAR:**<br/>- Formato del ticket JSON (admin panel depende de esto)<br/>- Estructura del mensaje WhatsApp (usuarios lo ven)<br/>- PII masking (GDPR compliance) |
| **`flowLogger.js`** | Logging GDPR-compliant. | - Enmascaramiento de datos sensibles<br/>- Formato de logs<br/>- Redacción de PII | **⚠️ NO CAMBIAR:**<br/>- Lógica de masking (expone PII)<br/>- Formato de logs (scripts parsers dependen) |

### Archivos CRÍTICOS (Frontend)

Estos archivos viven en el servidor Ferozo (FTP) y afectan directamente la UI que ven los usuarios.

| Archivo | Dónde Está | Por Qué es Crítico | Qué Contiene |
|---------|-----------|-------------------|--------------|
| **`index.php`** | Ferozo: `/public_html/index.php` | Sitio web principal + widget del chat | - HTML del sitio STI<br/>- Div del chat (`#sti-chat-box`)<br/>- Script inline de inicialización<br/>- Variables: `API_BASE`, `SESSION_ID`, `CSRF_TOKEN` |
| **`js/sti-chat-widget.js`** | Ferozo: `/public_html/js/sti-chat-widget.js` | Lógica JavaScript del chat | - `initChat()` - Inicializa chat<br/>- `sendMessage()` - Fetch a backend<br/>- `addMessage()` - Renderiza mensajes<br/>- `handleImageSelected()` - Upload imágenes<br/>- Indicador "PENSANDO" animado |
| **`css/sti-chat.css`** | Ferozo: `/public_html/css/sti-chat.css` | Estilos metálicos del chat | - Colores: `#0a1f44`, `#132333`<br/>- Animaciones de letras "PENSANDO"<br/>- Estilos de botones<br/>- Responsive design |

**⚠️ Precaución Frontend:**
- **NO cambiar estructura JSON de respuestas** sin actualizar `sti-chat-widget.js` (frontend parsea `response.reply`, `response.options`, `response.ui`)
- **NO modificar `API_BASE`** en index.php sin coordinar con backend
- **Testear en móvil** después de cualquier cambio en CSS (responsive crítico)

### Archivos SENSIBLES (Moderadamente Críticos)

| Archivo | Por Qué es Sensible | Precauciones |
|---------|-------------------|--------------|
| `deviceDetection.js` | Detecta dispositivos ambiguos (PC vs notebook) | No cambiar lógica sin testear con 50+ casos |
| `normalizarTexto.js` | Normaliza typos comunes ("w10" → "windows 10") | No agregar normalizaciones agresivas (falsos positivos) |
| `constants.js` | Constantes globales (idiomas, dispositivos) | Cambios acá afectan múltiples archivos |
| `src/services/aiService.js` | Cliente centralizado de OpenAI | No cambiar timeouts ni retries sin monitorear costos |
| `src/templates/responseTemplates.js` | Templates de respuestas | Mantener tono argentino con voseo |

---

## 🖥️ Cómo Ejecutar el Backend en Local

### Requisitos Previos

- **Node.js:** 20.0.0 o superior (verificar: `node --version`)
- **npm:** Viene con Node.js (verificar: `npm --version`)
- **Git:** Para clonar el repo
- **OpenAI API Key:** Obligatorio para IA (obtener en https://platform.openai.com/api-keys)

### Pasos de Instalación

#### 1. Clonar el Repositorio

```powershell
# Clonar desde GitHub
git clone https://github.com/stirosario/sti-ai-chat.git
cd sti-ai-chat
```

#### 2. Instalar Dependencias

```powershell
# Instalar todas las dependencias de package.json
npm install

# Tiempo estimado: 1-2 minutos
# Descarga: express, openai, ioredis, multer, sharp, helmet, cors, etc.
```

#### 3. Configurar Variables de Entorno

```powershell
# Copiar .env.example a .env
Copy-Item .env.example .env

# Editar .env con tu editor favorito
notepad .env

# O en VS Code:
code .env
```

**Variables OBLIGATORIAS en .env:**

```dotenv
# ========================================
# CONFIGURACIÓN MÍNIMA PARA LOCAL
# ========================================

# API Key de OpenAI (OBLIGATORIO)
OPENAI_API_KEY=sk-proj-TU_API_KEY_AQUI_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Orígenes permitidos para CORS (OBLIGATORIO para local)
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173

# Token para acceder a /api/logs (RECOMENDADO)
SSE_TOKEN=dev_token_inseguro_solo_para_local_123456

# Puerto del servidor (OPCIONAL - default: 3001)
PORT=3001

# Modelo de OpenAI (OPCIONAL - default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# Número de WhatsApp para tickets (OPCIONAL)
WHATSAPP_NUMBER=5493417422422
```

**Variables OPCIONALES (experimentación):**

```dotenv
# Feature flags (todos false por defecto)
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=false
SMART_MODE=true
AUTO_LEARNING_ENABLED=false

# Redis (opcional - si no está, usa memoria)
# REDIS_URL=redis://localhost:6379
```

#### 4. Arrancar el Servidor

```powershell
# Opción 1: Modo producción (recomendado para testing)
npm start

# Opción 2: Modo desarrollo (auto-reload con nodemon)
npm run dev

# Opción 3: Arquitectura modular (experimental)
npm run start:modular
```

**Salida esperada:**

```
=============================================================
  STI CHAT SERVER
=============================================================
  Port: 3001
  Environment: development
  OpenAI: ✅ Disponible
  Redis: ⚠️ No configurado (usando memoria)
=============================================================

🧠 SISTEMA INTELIGENTE DE TECNOS
Estado: ⏭️ DESACTIVADO (usando legacy)
SMART_MODE: ✅ ACTIVADO

[MODULAR] 📦 Usando arquitectura legacy (USE_MODULAR_ARCHITECTURE=false)
[ORCHESTRATOR] 📦 Orchestrator desactivado (USE_ORCHESTRATOR=false)

✅ Server listening on http://localhost:3001
```

#### 5. Verificar que Está Corriendo

**Opción A: Navegador**
1. Abrí http://localhost:3001
2. Deberías ver: `{"status":"ok","message":"STI Chat API is running"}`

**Opción B: curl (PowerShell)**
```powershell
# Health check
curl http://localhost:3001

# Test del endpoint de chat
curl -X POST http://localhost:3001/api/chat `
  -H "Content-Type: application/json" `
  -d '{\"sessionId\":\"test-123\",\"text\":\"Hola\"}'

# Deberías recibir un JSON con reply, options, etc.
```

**Opción C: Test automatizado**
```powershell
# Ejecutar smoke test de instalación AnyDesk
node tests/test-install-anydesk.js

# Si pasa, el servidor está funcionando correctamente
```

---

## 🧪 Smoke Tests Recomendados

### ¿Qué son los Smoke Tests?

Tests **rápidos y superficiales** que verifican que las funcionalidades críticas no se rompieron. Ejecutar **SIEMPRE** después de:
- Modificar `server.js`
- Cambiar lógica de `intentEngine.js` o `smartResponseGenerator.js`
- Tocar manejo de sesiones o stages
- Actualizar prompts de OpenAI

### Lista de Tests Obligatorios

#### 1️⃣ **Test: Flujo AnyDesk (incluyendo bug "w10")**

**Qué testea:**
- Detección de intent `installation_help`
- Manejo correcto de "w10" (Windows 10)
- Generación de guía de instalación
- NO disparo de fallback genérico

**Cómo ejecutar:**

```powershell
# Opción A: Test automatizado
node tests/test-install-anydesk.js

# Opción B: Manual en el chat
# 1. Abrí http://localhost:3001 (o frontend local)
# 2. Escribí: "Hola"
# 3. Aceptá privacidad → Elegí español → Poné tu nombre
# 4. Escribí: "Quiero instalar AnyDesk en mi compu"
# 5. Bot pregunta: "¿En qué sistema operativo?"
# 6. Escribí: "w10"
# 7. ✅ DEBE generar guía de instalación Windows 10
# 8. ❌ NO DEBE decir "no entiendo qué necesitás"
```

**Resultado esperado:**
```
✅ Tests pasados: 7/7
- NO fallback genérico para "Quiero instalar AnyDesk"
- Intent installation_help detectado
- Pregunta por OS
- NO fallback genérico para "w10"
- Guía generada con pasos
- Mención de Windows 10
- Botones de confirmación
```

**Si falla:** Revisá `handleGuidingInstallationOSReply()` en server.js (línea ~3200+)

---

#### 2️⃣ **Test: "Mi compu no prende"**

**Qué testea:**
- Detección de intent `technical_problem`
- Generación de pasos diagnósticos básicos
- Stage `BASIC_TESTS`
- Botones de seguimiento

**Cómo ejecutar:**

```powershell
# Opción A: Test automatizado
node tests/test-no-prende.js

# Opción B: Manual
# 1-3. (Igual que test anterior)
# 4. Escribí: "mi compu no prende"
# 5. ✅ DEBE generar pasos de diagnóstico (cables, reinicio)
# 6. ✅ DEBE ofrecer botones: "Funcionó ✔️" / "Pruebas Avanzadas"
```

**Resultado esperado:**
```
✅ Tests pasados: 8/8
- NO fallback genérico
- Problema técnico detectado
- Pasos diagnósticos generados
- Pasos relevantes (cables, power, reinicio)
- Botones de seguimiento
```

**Si falla:** Revisá `aiQuickTests()` en server.js o generación de pasos básicos

---

#### 3️⃣ **Test: Escalación a Técnico / Ticket WhatsApp**

**Qué testea:**
- Creación de ticket JSON
- Generación de link WhatsApp (`wa.me`)
- Persistencia en `/data/tickets/`
- Transcript completo en ticket
- PII enmascarado

**Cómo ejecutar:**

```powershell
# Opción A: Test automatizado
node tests/test-ticket-creation.js

# Opción B: Manual
# 1-3. (Igual que test anterior)
# 4. Escribí: "Mi notebook no carga el sistema operativo"
# 5. Bot genera pasos diagnósticos → Clic "No Funcionó"
# 6. Bot ofrece pasos avanzados → Escribí: "necesito un técnico"
# 7. ✅ DEBE generar ticket con link WhatsApp
# 8. ✅ DEBE crear archivo TCK-*.json en data/tickets/
```

**Resultado esperado:**
```
✅ Tests pasados: 14/14
- URL de WhatsApp devuelta (contiene wa.me)
- Ticket ID devuelto (formato TCK-timestamp)
- Archivo de ticket existe
- Ticket tiene estructura completa
- userInfo completo
- Transcript presente con problema descrito
- Summary del problema
- Stage TICKET_SENT
```

**Si falla:** Revisá `createWhatsAppTicket()` en ticketing.js

---

#### 4️⃣ **Test: Carga de Imagen**

**Qué testea:**
- Upload de imagen vía Multer
- Validación de formato (JPEG, PNG, WEBP)
- Procesamiento con Sharp
- Análisis con GPT-4 Vision
- Response con análisis de la imagen

**Cómo ejecutar:**

```powershell
# Manual (requiere frontend o Postman)
# 1. Abrí chat en http://localhost:3001
# 2. Clic en botón de clip 📎 (si existe)
# 3. Seleccioná imagen de error (ej: pantalla azul de Windows)
# 4. Escribí: "Mi PC muestra esta pantalla"
# 5. ✅ DEBE analizar la imagen con GPT-4 Vision
# 6. ✅ DEBE transcribir texto visible
# 7. ✅ DEBE sugerir pasos de solución
```

**Verificación manual en código:**

```powershell
# Ver logs del servidor
# Debería mostrar:
[VISION_MODE] 🔍 Modo visión activado - 1 imagen(es) detectada(s)
[VISION_MODE] 📸 Procesando imagen: image-1234567890.jpg
[SMART_MODE] ✅ Análisis de texto completado: {...}
```

**Si falla:** Revisá:
- Middleware Multer en server.js (línea ~2280+)
- `analyzeUserMessage()` con `imageUrls.length > 0`
- Prompt de visión (debe incluir `type: 'image_url'`)

---

#### 5️⃣ **Test: Cierre de Chat**

**Qué testea:**
- Detección de intent `farewell`
- Transición a stage `ENDED`
- Mensaje de despedida apropiado
- Sesión marcada como finalizada

**Cómo ejecutar:**

```powershell
# Manual
# 1-3. (Iniciar chat como siempre)
# 4. Tener una conversación breve (cualquier tema)
# 5. Escribí: "gracias, chau"
# 6. ✅ DEBE detectar despedida
# 7. ✅ DEBE responder con mensaje de cierre
# 8. ✅ session.stage debe ser "ENDED"
```

**Resultado esperado:**

```
Bot: "¡Gracias por contactar a STI! 😊 
Si necesitás algo más, acá estoy 24/7.
— Soy Tecnos, de STI — Servicio Técnico Inteligente 🛠️"

session.stage: "ENDED"
```

**Si falla:** Revisá detección de `farewell` intent en `intentEngine.js`

---

### Script de Test Completo

```powershell
# Ejecutar todos los smoke tests en secuencia
Write-Host "`n🧪 EJECUTANDO SMOKE TESTS COMPLETOS...`n" -ForegroundColor Cyan

# Test 1: AnyDesk
Write-Host "1️⃣ Test: Instalación AnyDesk (w10)..." -ForegroundColor Yellow
node tests/test-install-anydesk.js
if ($LASTEXITCODE -ne 0) { Write-Host "❌ FALLÓ" -ForegroundColor Red; exit 1 }

# Test 2: No prende
Write-Host "`n2️⃣ Test: Mi compu no prende..." -ForegroundColor Yellow
node tests/test-no-prende.js
if ($LASTEXITCODE -ne 0) { Write-Host "❌ FALLÓ" -ForegroundColor Red; exit 1 }

# Test 3: Ticket WhatsApp
Write-Host "`n3️⃣ Test: Creación de ticket WhatsApp..." -ForegroundColor Yellow
node tests/test-ticket-creation.js
if ($LASTEXITCODE -ne 0) { Write-Host "❌ FALLÓ" -ForegroundColor Red; exit 1 }

Write-Host "`n✅ TODOS LOS SMOKE TESTS PASARON`n" -ForegroundColor Green
```

---

## ✅ Buenas Prácticas para Modificar el Sistema

### 1. **Leer la Documentación ANTES de Codear**

**❌ MAL:**
```
Desarrollador: "Quiero agregar detección de impresoras"
→ Empieza a modificar server.js sin leer docs
→ Rompe detección de dispositivos existente
→ 3 horas debuggeando
```

**✅ BIEN:**
```
Desarrollador: "Quiero agregar detección de impresoras"
→ Lee ARQUITECTURA_TECNOS_PARTE_1.md § 2 (estructura)
→ Lee ARQUITECTURA_TECNOS_PARTE_2B.md § 6 (estados)
→ Revisa deviceDetection.js (lógica existente)
→ Agrega 'impresora' a constants.js
→ Actualiza intentEngine.js para soportar intent de impresoras
→ Testea con 10 casos
→ 30 minutos, 0 bugs
```

**Regla de oro:** Si no entendés cómo funciona algo, **no lo toques**. Primero investigá en la documentación.

---

### 2. **NO Cambiar Estructura del JSON de Respuesta sin Revisar Frontend**

El frontend (`sti-chat-widget.js`) espera un JSON específico del backend:

```javascript
// Estructura esperada por el frontend
{
  "ok": true,
  "reply": "Texto de la respuesta",
  "options": [
    { "text": "Opción 1", "value": "BTN_OPTION_1" }
  ],
  "stage": "ASK_NAME",
  "intentDetected": "installation_help",
  "whatsappUrl": "https://wa.me/...",
  "ui": {
    "buttons": [...],
    "typing": false
  }
}
```

**❌ MAL - Rompe el frontend:**

```javascript
// En server.js, cambiás:
res.json({
  success: true,  // ❌ Frontend espera "ok", no "success"
  message: reply, // ❌ Frontend espera "reply", no "message"
  buttons: opts   // ❌ Frontend espera "options", no "buttons"
});
```

**✅ BIEN - Respeta la estructura:**

```javascript
// Mantener estructura existente
res.json({
  ok: true,
  reply: reply,
  options: opts,
  stage: session.stage,
  // Agregar campos nuevos SI ES NECESARIO, sin romper los viejos
  newFeature: someValue
});
```

**Checklist antes de cambiar JSON:**
1. ✅ ¿El frontend (`sti-chat-widget.js`) usa este campo?
2. ✅ ¿Hay otros consumidores de la API (mobile, tests)?
3. ✅ ¿Puedo agregar el campo nuevo sin quitar los viejos?
4. ✅ ¿Testé en el frontend que todo sigue funcionando?

---

### 3. **NO Tocar `session.stage` ni `activeIntent` sin Entender la Máquina de Estados**

La máquina de estados es el **cerebro del flujo conversacional**. Modificar stages sin entender las transiciones rompe el chat.

**Diagrama simplificado:**

```
ASK_LANGUAGE → ASK_NAME → ASK_NEED → CLASSIFY_NEED
                                           ↓
              ┌────────────────────────────┴────────────────┐
              ↓                                             ↓
         installation_help                          technical_problem
              ↓                                             ↓
         ASK_INSTALL_OS                              ASK_DEVICE
              ↓                                             ↓
      GUIDING_INSTALLATION                            BASIC_TESTS
              ↓                                             ↓
         (fin o ticket)                              ADVANCED_TESTS
                                                            ↓
                                                       TICKET_SENT
                                                            ↓
                                                         ENDED
```

**❌ MAL - Rompe el flujo:**

```javascript
// En algún handler, hacés:
session.stage = 'BASIC_TESTS';  // ❌ Salto ilógico desde ASK_NAME

// Resultado: Usuario no puede avanzar, botones rotos, intents incorrectos
```

**✅ BIEN - Respeta transiciones:**

```javascript
// Seguir el flujo lógico:
if (session.stage === 'ASK_NAME') {
  // Validar nombre
  session.name = userName;
  session.stage = 'ASK_NEED';  // ✅ Transición válida
}

// O mejor: usar función helper
transitionToStage(session, 'ASK_NEED', 'User provided name');
```

**Antes de cambiar un stage:**
1. ✅ Leé `ARQUITECTURA_TECNOS_PARTE_2B.md` § 6 (diagrama de transiciones)
2. ✅ Verificá que la transición es válida según el diagrama
3. ✅ Asegurate de que `activeIntent` es consistente con el stage
4. ✅ Testeá el flujo completo end-to-end

---

### 4. **Ejecutar Tests de Humo Después de un Cambio Grande**

**"Cambio grande"** incluye:
- Modificar `server.js` (más de 50 líneas)
- Cambiar lógica de `intentEngine.js` o `smartResponseGenerator.js`
- Actualizar prompts de OpenAI
- Tocar manejo de sesiones (`sessionStore.js`)
- Agregar/quitar stages o intents
- Modificar estructura de JSON de respuesta

**Workflow recomendado:**

```powershell
# 1. Hacer cambios en el código
code server.js

# 2. Guardar cambios
git add server.js
git commit -m "feat: Agregar detección de impresoras"

# 3. ANTES DE PUSH - Ejecutar smoke tests
npm start  # En terminal separada

# 4. En otra terminal:
node tests/test-install-anydesk.js
node tests/test-no-prende.js
node tests/test-ticket-creation.js

# 5. Si todos pasan → Push seguro
git push origin main

# 6. Si alguno falla → Fix y repetir desde paso 3
```

**Tiempo estimado de smoke tests:** 2-3 minutos (vs. horas debuggeando en producción)

---

### 5. **Usar Feature Flags para Experimentos**

Si querés probar algo nuevo sin romper producción:

**❌ MAL - Reemplazar código directamente:**

```javascript
// En server.js
// Comentás código viejo:
// const reply = await legacyResponseGenerator(session);

// Y ponés código nuevo:
const reply = await experimentalAIResponse(session);  // ❌ Sin forma de volver atrás
```

**✅ BIEN - Usar feature flag:**

```javascript
// En server.js
const USE_EXPERIMENTAL_AI = process.env.USE_EXPERIMENTAL_AI === 'true';

let reply;
if (USE_EXPERIMENTAL_AI) {
  reply = await experimentalAIResponse(session);
} else {
  reply = await legacyResponseGenerator(session);  // ✅ Fallback seguro
}
```

**En .env (local):**
```dotenv
USE_EXPERIMENTAL_AI=true  # Activar experimento
```

**En Render (producción):**
```dotenv
USE_EXPERIMENTAL_AI=false  # Desactivado por defecto
```

**Ventajas:**
- ✅ Podés testear en local sin afectar producción
- ✅ Rollback instantáneo (cambiar env var)
- ✅ A/B testing si querés

---

### 6. **Commitear Mensajes Descriptivos**

**❌ MAL:**
```bash
git commit -m "fix"
git commit -m "update"
git commit -m "changes"
```

**✅ BIEN:**
```bash
git commit -m "fix: Corregir bug w10 en handleGuidingInstallationOSReply"
git commit -m "feat: Agregar detección de impresoras en intentEngine"
git commit -m "refactor: Extraer lógica de tickets a ticketing.js"
```

**Formato recomendado:**
```
<tipo>: <descripción corta>

<cuerpo opcional con más detalles>

<footer opcional: issue, breaking changes, etc.>
```

**Tipos:**
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `refactor`: Refactorización sin cambios funcionales
- `docs`: Cambios en documentación
- `test`: Agregar o modificar tests
- `chore`: Cambios de mantenimiento (deps, config)

---

### 7. **No Hardcodear Valores - Usar Constantes o Env Vars**

**❌ MAL:**

```javascript
// En server.js
const whatsappNumber = '5493417422422';  // ❌ Hardcodeado
const apiTimeout = 30000;  // ❌ Difícil de cambiar en producción
```

**✅ BIEN:**

```javascript
// En server.js
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
const API_TIMEOUT = Number(process.env.API_TIMEOUT) || 30000;

// O mejor: en constants.js
export const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5493417422422';
```

**Ventajas:**
- ✅ Cambiar valores sin redeployar código
- ✅ Valores diferentes en dev vs prod
- ✅ Fácil de documentar en `.env.example`

---

### 8. **Manejar Errores Gracefully - No Dejar al Usuario Colgado**

**❌ MAL:**

```javascript
// En algún handler
const result = await openai.chat.completions.create({...});
const reply = result.choices[0].message.content;  // ❌ Sin try-catch

// Si OpenAI falla → Crash del servidor → Usuario ve error 500
```

**✅ BIEN:**

```javascript
try {
  const result = await openai.chat.completions.create({...});
  const reply = result.choices[0].message.content;
  return reply;
} catch (error) {
  console.error('[OPENAI] Error:', error.message);
  
  // Fallback amigable para el usuario
  return 'Disculpá, tuve un problema técnico. ¿Podés reformular tu pregunta? 😊';
}
```

**Principio:** El usuario **NUNCA** debe ver un error crudo. Siempre dar un mensaje amigable y loggear el error real.

---

### 9. **Loggear Operaciones Importantes (pero sin PII)**

**❌ MAL:**

```javascript
// Loggear datos sensibles
console.log('Usuario:', session.name, 'Email:', session.email);  // ❌ PII expuesto
```

**✅ BIEN:**

```javascript
// Loggear con masking
const maskedName = maskPII(session.name);
console.log('[INFO] Usuario:', maskedName, 'Stage:', session.stage);

// O usar flowLogger
flowLogger.logWithMask('User provided name', { name: session.name });
```

**Qué loggear:**
- ✅ Cambios de stage
- ✅ Intents detectados
- ✅ Errores de API (sin incluir API keys)
- ✅ Creación de tickets
- ✅ Timeouts o retries

**Qué NO loggear:**
- ❌ Nombres completos sin masking
- ❌ Emails
- ❌ Números de teléfono
- ❌ Contraseñas (obvio)
- ❌ API Keys

---

### 10. **Testing Manual en Producción - Con Cuidado**

Si necesitás testear en producción (no recomendado, pero a veces necesario):

**Workflow seguro:**

1. **Usar session ID de test:**
   ```javascript
   // En el frontend (index.php), temporalmente:
   const SESSION_ID = 'test-lucas-20251206';  // Identificable en logs
   ```

2. **Monitorear logs en tiempo real:**
   ```powershell
   curl https://sti-rosario-ai.onrender.com/api/logs/stream `
     -H "Authorization: Bearer TU_SSE_TOKEN"
   ```

3. **Probar flujo completo:**
   - Abrí https://stia.com.ar
   - Ejecutá el flow que querés testear
   - Verificá en logs que todo funcionó

4. **Borrar datos de test:**
   ```powershell
   # Conectar a Render y borrar session de test
   # O dejarla que expire automáticamente (TTL)
   ```

**⚠️ NUNCA testear en producción:**
- Durante horarios pico (9-18 hs Argentina)
- Con cambios que no fueron testeados en local
- Sin tener capacidad de rollback inmediato

---

## 🚫 Lo Que NO Hacer (Anti-Patterns)

### 1. **NO hacer `git push --force` a `main`**

**Razón:** `main` está conectado a Render. Un force push puede romper deploys automáticos.

**Si necesitás revertir algo:**
```powershell
# ✅ BIEN - Revertir commit
git revert HEAD
git push origin main

# ❌ MAL - Force push
git reset --hard HEAD~1
git push --force origin main  # ⚠️ PELIGRO
```

---

### 2. **NO commitear `.env` con API keys reales**

**Razón:** `.env` contiene secretos. Está en `.gitignore` por una razón.

**Si lo commiteaste por error:**
```powershell
# 1. Rotar la API key en OpenAI (generar nueva)
# 2. Borrar archivo del historial de Git
git rm --cached .env
git commit -m "chore: Remove .env from version control"
git push origin main

# 3. Actualizar .env.example sin valores reales
```

---

### 3. **NO hacer cambios grandes en viernes a la tarde**

**Razón:** Si algo se rompe en producción, no hay tiempo de fix antes del fin de semana.

**Mejor momento para cambios grandes:**
- Lunes-Miércoles (máximo tiempo para detectar y corregir)
- Horario de baja actividad (madrugada Argentina)

---

### 4. **NO ignorar warnings de OpenAI (rate limits, tokens)**

**Si ves esto en logs:**
```
[OPENAI] Warning: Approaching rate limit
[OPENAI] Error: Insufficient tokens
```

**Acción inmediata:**
- Revisar uso de tokens (evitar prompts gigantes)
- Implementar retry con exponential backoff
- Considerar caché de respuestas frecuentes

---

## 📞 Contacto y Recursos

**Desarrollador Principal:** Lucas (STI - Servicio Técnico Inteligente)  
**Email:** (configurar en servidor)  
**WhatsApp Soporte:** +54 9 341 742-2422  
**Repositorio:** https://github.com/stirosario/sti-ai-chat  
**Dashboard Render:** https://dashboard.render.com  
**Sitio Producción:** https://stia.com.ar  

**Recursos útiles:**
- **Documentación OpenAI:** https://platform.openai.com/docs
- **Render Docs:** https://render.com/docs
- **Node.js Best Practices:** https://github.com/goldbergyoni/nodebestpractices

---

## 📝 Changelog de este README

- **6 dic 2025:** Versión inicial del README_CURSOR.md
- **Futuras actualizaciones:** Agregar según evolucione el sistema

---

**Última actualización:** 6 de diciembre de 2025  
**Generado por:** GitHub Copilot (Claude Sonnet 4.5)  
**Propósito:** Guía de supervivencia para trabajar en Tecnos sin romper producción

---

**🎯 Recordatorio Final:**

> "Con gran poder viene gran responsabilidad. Este sistema atiende usuarios reales. Leé la documentación, testeá exhaustivamente, y cuando tengas dudas, preguntá antes de commitear."

✅ **Happy Coding! 🚀**
