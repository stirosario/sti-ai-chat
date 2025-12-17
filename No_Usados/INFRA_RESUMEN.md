# Resumen de Infraestructura - Tecnos/STI

**Fecha:** 6 de diciembre de 2025  
**Versión:** 1.0  
**Referencias:** ARQUITECTURA_TECNOS_PARTE_1.md, ARQUITECTURA_TECNOS_PARTE_2A.md, ARQUITECTURA_TECNOS_PARTE_2B.md, ARQUITECTURA_TECNOS_PARTE_2C.md, ARQUITECTURA_TECNOS_PARTE_2D.md, ARQUITECTURA_TECNOS_PARTE_2E.md

---

## 📋 Índice

1. [Resumen de Infraestructura](#resumen-de-infraestructura)
2. [Variables de Entorno](#variables-de-entorno)
3. [Flujo de Deploy](#flujo-de-deploy)

---

## Resumen de Infraestructura

### 🖥️ Backend en Render

**Hosting:** Render (https://render.com)  
**URL Base:** `https://sti-rosario-ai.onrender.com`  
**Tipo:** Web Service  
**Runtime:** Node.js 20+  
**Repositorio:** https://github.com/stirosario/sti-ai-chat  
**Branch:** `main`

**Endpoints Principales:**

| Ruta | Método | Propósito |
|------|--------|-----------|
| `/api/chat` | POST | Endpoint principal del chatbot - recibe mensajes y devuelve respuestas |
| `/api/whatsapp-ticket` | POST | Crea tickets de WhatsApp para escalamiento a soporte humano |
| `/api/ticket/:ticketId` | GET | Obtiene detalles de un ticket específico (formato JSON) |
| `/api/logs` | GET | Acceso a logs del sistema (protegido con LOG_TOKEN) |
| `/api/logs/stream` | GET | Stream de logs en tiempo real (SSE - Server-Sent Events) |
| `/historial/:sessionId` | GET | Obtiene historial completo de una conversación |
| `/api/analyze-auto-learning` | POST | Endpoint de auto-aprendizaje (experimental) |
| `/` | GET | Health check - devuelve status del servidor |

**Características:**
- Auto-deploy desde GitHub (push a `main` → deploy automático)
- Restart automático si el servicio falla
- Logs accesibles desde dashboard de Render
- Variables de entorno configuradas en Render Dashboard
- HTTPS con certificado SSL gestionado por Render
- CORS configurado para `https://stia.com.ar` y `https://www.stia.com.ar`

**Almacenamiento:**
- Directorio `/data` persistente (tickets, logs, transcripts, uploads)
- Redis opcional para sesiones (si `REDIS_URL` está configurado)
- Fallback a memoria si Redis no está disponible

---

### 💻 Proyecto Node Local

**Carpeta:** `C:\sti-ai-chat`  
**Archivo principal:** `server.js` (7776 líneas)  
**Package Manager:** npm  
**Node.js requerido:** 20.0.0 o superior

**Scripts npm disponibles:**

```bash
# Arrancar servidor en modo producción
npm start
# Equivalente a: node server.js

# Arrancar en modo desarrollo (con nodemon para auto-reload)
npm run dev
# Equivalente a: nodemon server.js

# Arrancar con arquitectura modular (experimental)
npm run start:modular
# Equivalente a: node start-modular.js
# Activa USE_MODULAR_ARCHITECTURE=true

# Testing de arquitectura modular
npm run test:modular
# Equivalente a: node test-modular.js
```

**Cómo arrancar en local:**

1. **Clonar repositorio:**
   ```bash
   git clone https://github.com/stirosario/sti-ai-chat.git
   cd sti-ai-chat
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   ```bash
   # Copiar .env.example a .env
   Copy-Item .env.example .env

   # Editar .env con tu editor favorito
   notepad .env

   # Mínimo requerido:
   # - OPENAI_API_KEY=sk-...
   # - ALLOWED_ORIGINS=http://localhost:3001
   # - SSE_TOKEN=token_aleatorio_seguro
   ```

4. **Arrancar servidor:**
   ```bash
   npm start
   ```

5. **Verificar que está corriendo:**
   - Abrí http://localhost:3001 en el navegador
   - Deberías ver: `{"status":"ok","message":"STI Chat API is running"}`

**Puerto por defecto:** 3001 (configurable con `PORT` en .env)

**Dependencias principales:**
- `express` - Framework web
- `openai` - Cliente de OpenAI API
- `ioredis` - Cliente de Redis (opcional)
- `multer` - Manejo de uploads de imágenes
- `helmet` - Seguridad HTTP
- `cors` - Cross-Origin Resource Sharing
- `dotenv` - Manejo de variables de entorno
- `sharp` - Procesamiento de imágenes
- `compression` - Compresión gzip
- `express-rate-limit` - Rate limiting

---

### 🌐 Frontend en Ferozo

**Hosting:** Ferozo (https://www.ferozo.com)  
**Dominio:** `https://stia.com.ar` (y `www.stia.com.ar`)  
**Tipo:** Hosting compartido con PHP + FTP  
**Carpeta remota:** `/public_html`  
**Carpeta local:** `C:\Users\Lucas\AppData\Roaming\Code\User\globalStorage\humy2833.ftp-simple\remote-workspace-temp\43566b752ae77bd8bd94dd45b0671119\public_html`

**Archivos clave:**

| Archivo | Rol | Ubicación |
|---------|-----|-----------|
| `index.php` | Sitio web principal de STI - contiene estructura HTML, widget del chat, inicialización de JavaScript | `/public_html/index.php` |
| `js/sti-chat-widget.js` | Lógica JavaScript del widget de chat - maneja envío de mensajes, renderizado, typing indicator | `/public_html/js/sti-chat-widget.js` |
| `css/sti-chat.css` | Estilos CSS del chat - diseño metálico característico de STI | `/public_html/css/sti-chat.css` |
| `css/frontend-snippet.css` | Estilos fallback del chat | `/public_html/css/frontend-snippet.css` |
| `css/style.css` | Estilos generales del sitio web | `/public_html/css/style.css` |
| `config.php` | Configuración PHP del sitio | `/public_html/config.php` |
| `admin.php` | Panel de administración (requiere login) | `/public_html/admin.php` |
| `chatlog.php` | Visualizador de logs del chat | `/public_html/chatlog.php` |
| `tickets.php` | Gestión de tickets de soporte | `/public_html/tickets.php` |

**Cómo funciona el widget:**

1. **Usuario abre stia.com.ar** → Carga `index.php`
2. **index.php contiene:**
   - HTML del sitio
   - Div del chat (`#sti-chat-box`)
   - Script inline que inicializa el chat
   - Variable `API_BASE` que apunta a Render:
     ```javascript
     const API_BASE = 'https://sti-rosario-ai.onrender.com';
     ```
3. **sti-chat-widget.js gestiona:**
   - Apertura/cierre del chat
   - Envío de mensajes vía `fetch()` a `${API_BASE}/api/chat`
   - Renderizado de respuestas del bot
   - Manejo de botones interactivos
   - Upload de imágenes
   - Indicador "PENSANDO" con letras animadas

**Flujo de comunicación:**

```
Usuario en stia.com.ar
       ↓
  index.php (PHP)
       ↓
  sti-chat-widget.js (JavaScript)
       ↓
  fetch('https://sti-rosario-ai.onrender.com/api/chat')
       ↓
  Backend Node.js en Render
       ↓
  Respuesta JSON con texto + botones
       ↓
  Renderizado en el chat
```

**Variables configurables en index.php:**

| Variable | Valor Producción | Valor Local | Propósito |
|----------|-----------------|-------------|-----------|
| `API_BASE` | `https://sti-rosario-ai.onrender.com` | `http://localhost:3001` | URL base del backend |
| `SESSION_ID` | `web-TIMESTAMP-RANDOM` | (generado dinámicamente) | ID único de sesión |
| `CSRF_TOKEN` | (generado por PHP) | (generado por PHP) | Token anti-CSRF |
| `IS_LOCAL` | `false` | `true` | Detecta si está en localhost |

---

## Variables de Entorno

### Tabla de Variables .env

| Variable | Donde se Usa | Para Qué Sirve | Obligatoria | Valor por Defecto |
|----------|--------------|----------------|-------------|-------------------|
| **SEGURIDAD** |
| `SSE_TOKEN` (alias `LOG_TOKEN`) | server.js (línea 749) | Token de autenticación para endpoints admin (`/api/logs`, `/api/logs/stream`). Protege acceso a logs sensibles. | ⚠️ Recomendado | Random 32 bytes hex (generado) |
| `ALLOWED_ORIGINS` | server.js (línea 2302) | Lista de orígenes permitidos para CORS (separados por coma). Define qué dominios pueden llamar a la API. | ✅ Obligatoria | (ninguno - warning si falta) |
| **OPENAI** |
| `OPENAI_API_KEY` | server.js (línea 186), src/services/aiService.js | API Key de OpenAI para análisis de intención, generación de respuestas y modo visión. Sin esto, el bot funciona en modo legacy. | ✅ Obligatoria | (ninguno - IA deshabilitada) |
| `OPENAI_MODEL` | server.js (línea 185) | Modelo de OpenAI a usar para análisis de texto. | ⬜ Opcional | `gpt-4o-mini` |
| `OA_NAME_REJECT_CONF` | server.js (línea 187) | Umbral de confianza para rechazar nombres inválidos (0.0 - 1.0). | ⬜ Opcional | `0.75` |
| **SERVIDOR** |
| `PORT` | server.js (línea 7670) | Puerto en el que el servidor escucha. | ⬜ Opcional | `3001` |
| `NODE_ENV` | N/A (convención) | Entorno de ejecución (`development` o `production`). | ⬜ Opcional | `production` |
| `PUBLIC_BASE_URL` | ticketing.js (línea 13) | URL pública base para generación de links en tickets de WhatsApp. | ⬜ Opcional | `https://stia.com.ar` |
| **REDIS (Opcional)** |
| `REDIS_URL` | sessionStore.js | URL de conexión a Redis para persistencia de sesiones. Si no está configurado, usa almacenamiento en memoria (volátil). | ⬜ Opcional | (ninguno - usa memoria) |
| **DIRECTORIOS** |
| `DATA_BASE` | server.js (línea 737) | Directorio base para almacenamiento de datos. | ⬜ Opcional | `/data` |
| `TRANSCRIPTS_DIR` | server.js (línea 738) | Directorio para transcripts de conversaciones. | ⬜ Opcional | `${DATA_BASE}/transcripts` |
| `TICKETS_DIR` | server.js (línea 739), ticketing.js (línea 12) | Directorio para archivos de tickets JSON. | ⬜ Opcional | `${DATA_BASE}/tickets` |
| `LOGS_DIR` | server.js (línea 740) | Directorio para logs del sistema. | ⬜ Opcional | `${DATA_BASE}/logs` |
| `UPLOADS_DIR` | server.js (línea 741) | Directorio para imágenes subidas por usuarios. | ⬜ Opcional | `${DATA_BASE}/uploads` |
| `HISTORIAL_CHAT_DIR` | server.js (línea 742) | Directorio para historial completo de chats. | ⬜ Opcional | `${DATA_BASE}/historial_chat` |
| **CONTACTO** |
| `WHATSAPP_NUMBER` | server.js (línea 745), ticketing.js (línea 14) | Número de WhatsApp para soporte (formato internacional sin +). Ejemplo: `5493417422422` | ⬜ Opcional | `5493417422422` |
| **FEATURE FLAGS** |
| `USE_MODULAR_ARCHITECTURE` | server.js (línea 73) | Activa arquitectura modular experimental (chatAdapter). | ⬜ Opcional | `false` |
| `USE_ORCHESTRATOR` | server.js (línea 74) | Activa Conversation Orchestrator (motor conversacional nuevo). | ⬜ Opcional | `false` |
| `USE_INTELLIGENT_MODE` | server.js (línea 192) | Activa modo inteligente (análisis de intención con OpenAI en lugar de stages rígidos). | ⬜ Opcional | `false` |
| `SMART_MODE` | server.js (línea 220) | Habilita análisis avanzado de mensajes con IA. Se activa por defecto si OpenAI está disponible. | ⬜ Opcional | `true` (si OpenAI disponible) |
| `AUTO_LEARNING_ENABLED` | server.js (línea 3806), services/learningService.js | Activa auto-aprendizaje seguro desde conversaciones reales. | ⬜ Opcional | `false` |
| **AUTO-LEARNING** |
| `MIN_CONVERSATIONS_FOR_ANALYSIS` | .env.example (línea 82) | Número mínimo de conversaciones requeridas para análisis de auto-aprendizaje. | ⬜ Opcional | `10` |
| `MIN_CONFIDENCE_THRESHOLD` | .env.example (línea 85) | Umbral de confianza mínimo (0.0 - 1.0) para aplicar sugerencias de auto-aprendizaje. | ⬜ Opcional | `0.7` |
| `MAX_SUGGESTIONS_PER_RUN` | .env.example (línea 88) | Máximo de sugerencias a aplicar por ejecución de auto-aprendizaje. | ⬜ Opcional | `20` |
| `AUTO_LEARNING_INTERVAL_HOURS` | test-autolearning-active.js (línea 19) | Intervalo en horas para ejecución automática de auto-aprendizaje. | ⬜ Opcional | (ninguno - manual) |

### Ejemplo de .env para Producción

```dotenv
# SEGURIDAD
SSE_TOKEN=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890
ALLOWED_ORIGINS=https://stia.com.ar,https://www.stia.com.ar

# OPENAI
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
OPENAI_MODEL=gpt-4o-mini

# SERVIDOR
PORT=3001
NODE_ENV=production
PUBLIC_BASE_URL=https://stia.com.ar

# REDIS (opcional pero recomendado)
REDIS_URL=redis://localhost:6379

# CONTACTO
WHATSAPP_NUMBER=5493417422422

# FEATURE FLAGS (valores recomendados para producción)
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=false
SMART_MODE=true
AUTO_LEARNING_ENABLED=false
```

### Ejemplo de .env para Desarrollo Local

```dotenv
# SEGURIDAD
SSE_TOKEN=dev_token_inseguro_solo_local
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173

# OPENAI
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
OPENAI_MODEL=gpt-4o-mini

# SERVIDOR
PORT=3001
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3001

# REDIS (opcional)
# REDIS_URL=redis://localhost:6379

# CONTACTO
WHATSAPP_NUMBER=5493417422422

# FEATURE FLAGS (experimentar libremente)
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=true
SMART_MODE=true
AUTO_LEARNING_ENABLED=false
```

---

## Flujo de Deploy

### 🚀 Backend: Local → GitHub → Render

**Flujo automático:**

```
┌─────────────────┐
│  1. Desarrollo  │
│  local en       │
│  C:\sti-ai-chat │
└────────┬────────┘
         │ git add, git commit
         ▼
┌─────────────────┐
│  2. Commit a    │
│  rama main      │
└────────┬────────┘
         │ git push origin main
         ▼
┌─────────────────┐
│  3. GitHub      │
│  (stirosario/   │
│   sti-ai-chat)  │
└────────┬────────┘
         │ Webhook automático
         ▼
┌─────────────────┐
│  4. Render      │
│  Auto-Deploy    │
│  (build + start)│
└────────┬────────┘
         │ npm install + node server.js
         ▼
┌─────────────────┐
│  5. Servicio    │
│  corriendo en   │
│  sti-rosario-ai │
│  .onrender.com  │
└─────────────────┘
```

**Comandos típicos:**

```powershell
# En C:\sti-ai-chat

# 1. Hacer cambios en server.js, src/, etc.
# ... editar archivos ...

# 2. Verificar cambios
git status
git diff

# 3. Agregar archivos modificados
git add server.js
git add src/core/intentEngine.js
# O todo a la vez:
git add .

# 4. Commit con mensaje descriptivo
git commit -m "fix: Corregir bug en detección de instalación de AnyDesk"

# 5. Push a GitHub (trigger automático de Render)
git push origin main

# 6. Monitorear deploy en Render Dashboard
# https://dashboard.render.com/web/srv-XXXXX
```

**Tiempo estimado de deploy:** 2-5 minutos desde push hasta servicio actualizado.

**Verificación post-deploy:**

```powershell
# Verificar que el servicio responde
curl https://sti-rosario-ai.onrender.com

# Debería devolver:
# {"status":"ok","message":"STI Chat API is running"}

# Verificar logs en tiempo real
curl https://sti-rosario-ai.onrender.com/api/logs/stream `
  -H "Authorization: Bearer TU_SSE_TOKEN"
```

**Rollback en caso de problema:**

```powershell
# Opción 1: Revertir último commit
git revert HEAD
git push origin main

# Opción 2: Forzar deploy de commit anterior
git reset --hard COMMIT_HASH_ANTERIOR
git push origin main --force

# Opción 3: Rollback manual desde Render Dashboard
# Dashboard → Web Services → sti-rosario-ai → Rollback
```

---

### 🌐 Frontend: Local → FTP → Ferozo

**Flujo manual (FTP):**

```
┌─────────────────────────┐
│  1. Desarrollo local    │
│  Carpeta remote:        │
│  C:\Users\Lucas\...     │
│  \public_html           │
└────────┬────────────────┘
         │ Editar index.php, CSS, JS
         ▼
┌─────────────────────────┐
│  2. Conectar FTP        │
│  (VS Code ext:          │
│   ftp-simple)           │
└────────┬────────────────┘
         │ Upload manual o auto-sync
         ▼
┌─────────────────────────┐
│  3. Servidor Ferozo     │
│  stia.com.ar            │
│  /public_html           │
└────────┬────────────────┘
         │ Archivos PHP/JS/CSS actualizados
         ▼
┌─────────────────────────┐
│  4. Usuarios ven        │
│  cambios inmediatos     │
│  (Ctrl+F5 si caché)     │
└─────────────────────────┘
```

**Herramienta recomendada:** VS Code con extensión `ftp-simple`

**Configuración FTP (ejemplo `.ftp-simple-config.json`):**

```json
{
  "host": "ftp.stia.com.ar",
  "port": 21,
  "user": "usuario_ferozo",
  "password": "contraseña_segura",
  "remotePath": "/public_html",
  "localPath": "C:/Users/Lucas/AppData/Roaming/Code/User/globalStorage/humy2833.ftp-simple/remote-workspace-temp/43566b752ae77bd8bd94dd45b0671119/public_html"
}
```

**Archivos que se modifican frecuentemente:**

| Archivo | Cuándo modificar | Cambios típicos |
|---------|------------------|-----------------|
| `index.php` | Cambios en estructura HTML del sitio, widget del chat, variables de configuración | Agregar secciones, modificar textos, actualizar API_BASE |
| `js/sti-chat-widget.js` | Cambios en lógica del chat (frontend) | Agregar validaciones, modificar UI, nuevos tipos de mensajes |
| `css/sti-chat.css` | Cambios en estilos del chat | Ajustar colores, animaciones, responsive |
| `css/style.css` | Cambios en estilos generales del sitio | Actualizar diseño, nuevas secciones |

**Comandos FTP en VS Code:**

```
Ctrl+Shift+P → "ftp-simple: Upload"
Ctrl+Shift+P → "ftp-simple: Download"
Ctrl+Shift+P → "ftp-simple: Sync Remote → Local"
```

**Verificación post-deploy:**

1. Abrí https://stia.com.ar en navegador
2. Hacé hard refresh: `Ctrl+Shift+R` (o `Ctrl+F5`)
3. Abrí DevTools (F12) → Console para ver errores JS
4. Probá el chat: clic en "Asistencia 24/7"
5. Verificá que `API_BASE` apunta a Render (inspeccionar Network tab)

**Caché del navegador:**

Si los cambios no se ven, puede ser caché. Soluciones:

```javascript
// En index.php, agregar versión al CSS/JS:
<link rel="stylesheet" href="css/sti-chat.css?v=<?php echo time(); ?>">
<script src="js/sti-chat-widget.js?v=<?php echo time(); ?>"></script>
```

**Backup antes de cambios críticos:**

```powershell
# Descargar backup completo vía FTP
# VS Code: Ctrl+Shift+P → "ftp-simple: Download"

# O usar curl si tenés acceso SFTP
curl -u usuario_ferozo:contraseña \
  ftp://ftp.stia.com.ar/public_html/index.php \
  -o backup_index.php
```

---

### 🔄 Flujo Completo (Backend + Frontend)

**Escenario:** Agregar nueva funcionalidad al chat

**Pasos:**

1. **Backend (Local):**
   ```powershell
   cd C:\sti-ai-chat
   
   # Editar server.js o src/core/intentEngine.js
   code server.js
   
   # Probar localmente
   npm start
   # Abrir http://localhost:3001
   ```

2. **Frontend (Local):**
   ```powershell
   # Editar index.php o sti-chat-widget.js
   code "C:\Users\Lucas\...\public_html\index.php"
   
   # Cambiar API_BASE temporalmente a localhost
   const API_BASE = 'http://localhost:3001';
   
   # Abrir index.php en navegador (local)
   # Probar integración backend-frontend
   ```

3. **Deploy Backend:**
   ```powershell
   cd C:\sti-ai-chat
   git add .
   git commit -m "feat: Agregar nueva funcionalidad X"
   git push origin main
   
   # Esperar 2-5 min (monitorear Render Dashboard)
   ```

4. **Deploy Frontend:**
   ```powershell
   # Revertir API_BASE a producción
   const API_BASE = 'https://sti-rosario-ai.onrender.com';
   
   # Subir vía FTP (VS Code: Ctrl+Shift+P → Upload)
   ```

5. **Verificación:**
   ```powershell
   # Probar en producción
   curl https://sti-rosario-ai.onrender.com
   
   # Abrir https://stia.com.ar
   # Probar el chat end-to-end
   ```

---

## 📞 Contacto y Soporte

**Desarrollador:** Lucas (STI - Servicio Técnico Inteligente)  
**Email:** (configurar en servidor)  
**WhatsApp Soporte:** +54 9 341 742-2422  
**Sitio Web:** https://stia.com.ar  
**Repositorio:** https://github.com/stirosario/sti-ai-chat  

**Monitoreo:**
- Render Dashboard: https://dashboard.render.com
- Logs en tiempo real: `GET /api/logs/stream` (requiere `Authorization: Bearer SSE_TOKEN`)
- Panel admin: https://stia.com.ar/admin.php

---

**Última actualización:** 6 de diciembre de 2025  
**Generado por:** GitHub Copilot (Claude Sonnet 4.5)
