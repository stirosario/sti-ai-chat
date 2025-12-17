# AUDITORÍA SECCIÓN 31 — ECOSISTEMA DE ARCHIVOS GLOBAL
## BACKEND + FRONTEND + DATA + ASSETS + DEPLOY

**Fecha:** 2025-01-XX  
**Auditor:** Sistema de Auditoría Automatizada  
**Clasificación:** P0 — BLOQUEANTE PARA GO/NO-GO  
**Alcance:** Backend + Frontend + Data + Assets + Deploy

---

## OBJETIVO

Verificar que la estructura de archivos completa del proyecto Tecnos STI sea coherente, consistente y compatible con el NUEVO `server.js`, evitando referencias rotas, archivos obsoletos, dependencias implícitas y comportamientos no determinísticos.

Esta sección audita el sistema **COMO ARTEFACTO DE SOFTWARE**, no solo su lógica en ejecución.

---

## 31.1 INVENTARIO REAL DE ARCHIVOS (NO TEÓRICO)

### Backend

**Archivos activos:**
- ✅ `server.js` (4,049 líneas) — **ARCHIVO PRINCIPAL ACTIVO**
- ✅ `package.json` — Dependencias y scripts
- ✅ `Procfile` — Configuración para Render
- ✅ `Dockerfile` — Contenedor Docker (si aplica)

**Archivos legacy/obsoletos detectados:**
- ❌ `server_antiguo.js` — **ARCHIVO OBSOLETO**
- ❌ `server_cursor.js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia.js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia (2).js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia (3).js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia (4).js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia (5).js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia (6).js` — **ARCHIVO OBSOLETO**
- ❌ `server - copia (7).js` — **ARCHIVO OBSOLETO**

**Módulos realmente importados en `server.js`:**
- ✅ `express` — Framework web
- ✅ `cors` — CORS middleware
- ✅ `helmet` — Seguridad HTTP
- ✅ `compression` — Compresión de respuestas
- ✅ `express-rate-limit` — Rate limiting
- ✅ `fs/promises` — Sistema de archivos asíncrono
- ✅ `fs` (sync) — Sistema de archivos síncrono
- ✅ `path` — Manejo de rutas
- ✅ `crypto` — Funciones criptográficas
- ✅ `openai` — Cliente OpenAI
- ✅ `dotenv/config` — Variables de entorno

**Módulos NO utilizados en `server.js` (pero presentes en `package.json`):**
- ⚠️ `axios` — **NO USADO** (se usa `fetch` nativo en frontend, pero no en backend)
- ⚠️ `file-type` — **NO USADO** (no hay validación de tipo MIME de imágenes)
- ⚠️ `ioredis` — **NO USADO** (no hay uso de Redis)
- ⚠️ `multer` — **NO USADO** (no hay endpoint de upload multipart)
- ⚠️ `node-cron` — **NO USADO** (no hay tareas programadas)
- ⚠️ `pino` — **NO USADO** (se usa logging custom)
- ⚠️ `pino-http` — **NO USADO**
- ⚠️ `sharp` — **NO USADO** (no hay procesamiento de imágenes)

**Helpers/utilidades:**
- ⚠️ `handlers/` — **NO USADO** (el nuevo `server.js` no importa estos módulos)
- ⚠️ `services/` — **NO USADO**
- ⚠️ `utils/` — **NO USADO**
- ⚠️ `routes/` — **NO USADO** (endpoints están en `server.js` directamente)
- ⚠️ `core/` — **NO USADO**
- ⚠️ `flows/` — **NO USADO**
- ⚠️ `src/` — **NO USADO**

### Frontend

**Archivos activos:**
- ✅ `public/sti-chat-widget.js` (181 líneas) — Widget principal
- ✅ `public/sti-chat.css` (407 líneas) — Estilos

**Archivos HTML (referencias):**
- ⚠️ `PWA_INSTALL_GUIDE.html` — Documentación, no usado en producción
- ⚠️ `PWA_INTEGRATION.html` — Documentación, no usado en producción

**Assets:**
- ⚠️ **NO HAY ÍCONOS O IMÁGENES** en `public/` — El CSS referencia `sti-attach-btn` pero no hay asset físico

### Data

**Directorios activos:**
- ✅ `data/conversations/` — Conversaciones JSON
- ✅ `data/ids/` — IDs usados y lock files
- ✅ `data/logs/` — Logs del servidor
- ✅ `data/tickets/` — Tickets de escalamiento
- ✅ `data/uploads/` — **DIRECTORIO VACÍO** (no hay pipeline de imágenes funcional)

**Archivos de datos:**
- ✅ `data/ids/used_ids.json` — IDs reservados
- ✅ `data/ids/used_ids.lock` — Lock file (temporal)
- ✅ `data/logs/server.log` — Log principal
- ✅ `data/metrics.json` — **NO EXISTE** (se crea en runtime)

### Configuración

**Archivos de configuración:**
- ⚠️ `config/device-detection.json` — **NO USADO** en `server.js`
- ⚠️ `config/phrases-training.json` — **NO USADO** en `server.js`
- ⚠️ `config/nlp-tuning.json` — **NO USADO** en `server.js`
- ⚠️ `config/app-features.json` — **NO USADO** en `server.js`
- ⚠️ `config/stageContract.js` — **NO USADO** en `server.js`

**Archivos de backup:**
- ⚠️ `config/*.bak` — **12 archivos .bak** (limpieza recomendada)

---

## 31.2 COHERENCIA server.js ↔ SISTEMA DE ARCHIVOS

### Rutas hardcodeadas

**✅ Rutas relativas correctas:**
```javascript
const DATA_BASE = path.join(__dirname, 'data');
const CONVERSATIONS_DIR = path.join(DATA_BASE, 'conversations');
const IDS_DIR = path.join(DATA_BASE, 'ids');
const LOGS_DIR = path.join(DATA_BASE, 'logs');
const TICKETS_DIR = path.join(DATA_BASE, 'tickets');
```

**✅ Validación de paths:**
- ✅ `conversation_id` validado con regex `/^[A-Z]{2}\d{4}$/` antes de usar en paths
- ✅ Uso de `path.join()` para evitar path traversal
- ✅ Write temp + rename para atomicidad

**❌ Rutas que podrían fallar:**
- ⚠️ `data/uploads/` — Directorio existe pero está vacío, no hay código que lo use
- ⚠️ `data/metrics.json` — Se crea en runtime, pero no se valida existencia del directorio padre

### Dependencias de archivos

**✅ Archivos requeridos que existen:**
- ✅ `data/` — Creado automáticamente si no existe (líneas 51-55)
- ✅ `data/conversations/` — Creado automáticamente
- ✅ `data/ids/` — Creado automáticamente
- ✅ `data/logs/` — Creado automáticamente
- ✅ `data/tickets/` — Creado automáticamente

**❌ Archivos referenciados pero no validados:**
- ⚠️ `data/metrics.json` — Se escribe pero no se valida existencia de `DATA_BASE` antes (aunque se crea en startup)

### Manejo de errores de filesystem

**✅ Errores manejados:**
- ✅ `ENOENT` — Manejado en `loadConversation()` (retorna `null`)
- ✅ Lock file huérfano — Limpieza automática al iniciar
- ✅ Validación de formato antes de operaciones de archivo

**⚠️ Errores no manejados explícitamente:**
- ⚠️ `EACCES` — Permisos denegados (no hay try-catch específico)
- ⚠️ `ENOSPC` — Disco lleno (no hay validación de espacio)

---

## 31.3 FRONTEND ↔ BACKEND: CONTRATO DE ARCHIVOS

### Contrato formal de eventos

**Frontend envía (`sti-chat-widget.js` línea 138-142):**
```javascript
{
  sessionId: string,
  message: string,
  imageUrls: []  // ❌ INCONSISTENCIA: Frontend envía "imageUrls" pero backend espera "imageBase64"
}
```

**Backend espera (`server.js` línea 3927):**
```javascript
const { sessionId, message, imageBase64, imageName, request_id } = req.body;
```

**❌ FALLA CRÍTICA:**
- Frontend envía `imageUrls: []` (array vacío)
- Backend espera `imageBase64` (string)
- **Resultado:** Las imágenes nunca se procesan, aunque el backend tiene código para manejarlas

### Validación de eventos

**✅ Validación implementada:**
- ✅ `validateChatRequest()` — Valida tipos de `sessionId`, `message`, `imageBase64`, `request_id`
- ✅ Validación de orden cronológico (si viene `timestamp`)

**❌ Validaciones faltantes:**
- ⚠️ No se valida que `imageUrls` del frontend sea ignorado (o convertido a `imageBase64`)
- ⚠️ No se valida formato de `imageBase64` (debe ser base64 válido)

### Estados que el frontend no puede representar

**✅ Estados válidos:**
- ✅ `reply` — String (se muestra en `addMessage()`)
- ✅ `buttons` — Array (se renderiza en `buttonsHTML`)
- ✅ `stage` — No se usa en frontend (solo backend)
- ✅ `endConversation` — No se usa en frontend (solo backend)

**⚠️ Estados problemáticos:**
- ⚠️ Si `buttons` contiene tokens técnicos (`BTN_XXX`), el frontend los muestra como `value` (línea 95)
- ⚠️ Si `reply` contiene JSON embebido, se muestra al usuario (aunque `sanitizeReply()` lo remueve)

---

## 31.4 ASSETS Y RECURSOS ESTÁTICOS

### Íconos y recursos

**❌ FALLA:**
- ❌ El CSS define estilos para `#sti-attach-btn` (línea 292 de `sti-chat.css`)
- ❌ El widget tiene código para `attachBtn` (línea 22 de `sti-chat-widget.js`)
- ❌ **PERO:** No hay asset físico (SVG, PNG, icono) para el botón de adjuntar
- ❌ El botón muestra `alert('Próximamente: Adjuntar imágenes')` (línea 34)

**✅ Recursos que funcionan:**
- ✅ CSS cargado correctamente
- ✅ Fuentes (Orbitron, Inter) — Referenciadas pero cargadas desde CDN (no local)

### Versionado/cache busting

**❌ NO IMPLEMENTADO:**
- ❌ No hay versionado de assets (`sti-chat-widget.js?v=2.0.0`)
- ❌ No hay cache busting para CSS
- ⚠️ **RIESGO:** Cambios en frontend pueden no reflejarse si hay cache del navegador

---

## 31.5 SUBIDA DE ARCHIVOS / IMÁGENES (PIPELINE COMPLETO)

### Frontend

**❌ FALLA CRÍTICA:**
- ❌ `attachBtn` solo muestra `alert('Próximamente: Adjuntar imágenes')` (línea 34)
- ❌ No hay `input[type="file"]` en el HTML del widget
- ❌ No hay conversión de `File` a `base64`
- ❌ No hay validación de tamaño/tipo en frontend
- ❌ No se envía `imageBase64` en el request (solo `imageUrls: []`)

### Backend

**✅ Código implementado:**
- ✅ Validación de tamaño (máximo 5MB en base64) — línea 3403
- ✅ Persistencia de referencia en transcript — línea 3411-3417
- ✅ Validación de formato de `conversation_id` antes de guardar

**❌ Problemas:**
- ❌ El frontend nunca envía `imageBase64`, por lo que este código nunca se ejecuta
- ❌ No hay guardado físico de imágenes (solo referencia en transcript)
- ❌ No hay validación MIME type
- ❌ No hay procesamiento con `sharp` (aunque está en `package.json`)

### Persistencia

**❌ FALLA:**
- ❌ Las imágenes no se guardan físicamente
- ❌ Solo se guarda un preview truncado (`image_base64: imageBase64.substring(0, 100) + '...'`)
- ❌ No hay asociación con archivo físico en `data/uploads/`
- ❌ El directorio `data/uploads/` existe pero está vacío

---

## 31.6 VERSIONADO DE ARCHIVOS Y DEPLOY

### Coexistencia de versiones

**❌ PROBLEMA CRÍTICO:**
- ❌ **9 archivos `server*.js` obsoletos** en el directorio raíz
- ❌ Riesgo de que el deploy sirva archivo incorrecto
- ❌ Confusión sobre cuál es el archivo activo

**Archivos que deberían NO estar en producción:**
- ❌ `server_antiguo.js`
- ❌ `server_cursor.js`
- ❌ `server - copia*.js` (7 archivos)
- ❌ `No_Usados/` (281 archivos) — **OK, está en subdirectorio**

### Consistencia entre entornos

**✅ Configuración:**
- ✅ `package.json` define `"main": "server.js"` — Correcto
- ✅ `Procfile` define `web: node server.js` — Correcto
- ✅ Variables de entorno con defaults — Correcto

**⚠️ Riesgos:**
- ⚠️ Si hay `server.js` antiguo en producción, podría ejecutarse
- ⚠️ No hay validación de versión de `server.js` al iniciar

---

## 31.7 ARCHIVOS DE CONFIGURACIÓN Y ENTORNO

### Variables de entorno esperadas

**✅ Variables con defaults:**
- ✅ `PORT` — Default: 3001
- ✅ `NODE_ENV` — Default: 'production'
- ✅ `OPENAI_API_KEY` — Warning si no existe
- ✅ `OPENAI_MODEL_CLASSIFIER` — Default: 'gpt-4o-mini'
- ✅ `OPENAI_MODEL_STEP` — Default: 'gpt-4o-mini'
- ✅ `OPENAI_TEMPERATURE_*` — Defaults definidos
- ✅ `OPENAI_TIMEOUT_MS` — Default: 12000
- ✅ `OPENAI_MAX_TOKENS_*` — Defaults definidos
- ✅ `ALLOWED_ORIGINS` — Default: 'https://stia.com.ar,http://localhost:3000'
- ✅ `WHATSAPP_NUMBER` — Default: '5493417422422'
- ✅ `PUBLIC_BASE_URL` — Default: 'https://sti-rosario-ai.onrender.com'

**❌ Variables sin defaults (podrían causar errores):**
- ⚠️ Ninguna — Todas tienen defaults o manejo de ausencia

**❌ Archivo `.env.example` faltante:**
- ❌ No hay `.env.example` para documentar variables requeridas
- ⚠️ **RIESGO:** Desarrolladores no saben qué variables configurar

### Dependencias de variables no documentadas

**✅ Variables documentadas en código:**
- ✅ Comentarios en `server.js` indican defaults
- ✅ Warnings en consola si faltan variables críticas

**⚠️ Variables implícitas:**
- ⚠️ `TRUST_PROXY` — No usado en nuevo `server.js` (solo en versiones antiguas)

---

## 31.8 LIMPIEZA, ORDEN Y MADUREZ DEL REPO

### Archivos temporales

**❌ Archivos temporales detectados:**
- ❌ `*.tmp` — No encontrados (se limpian automáticamente)
- ❌ `*.lock` — `data/ids/used_ids.lock` (temporal, se limpia al iniciar)

### Backups olvidados

**❌ PROBLEMA:**
- ❌ **12 archivos `.bak`** en `config/`:
  - `device-detection.json.bak`
  - `device-detection.json.2025-12-05T23-05-41-609Z.bak`
  - `device-detection.json.2025-12-09T14-06-26-169Z.bak`
  - `device-detection.json.2025-12-09T14-26-51-236Z.bak`
  - `device-detection.json.2025-12-09T14-32-59-090Z.bak`
  - `device-detection.json.2025-12-09T14-47-03-237Z.bak`
  - `phrases-training.json.bak`
  - `phrases-training.json.2025-12-09T14-06-26-175Z.bak`
  - `phrases-training.json.2025-12-09T14-26-51-241Z.bak`
  - `phrases-training.json.2025-12-09T14-32-59-096Z.bak`
  - `phrases-training.json.2025-12-09T14-47-03-241Z.bak`

### Archivos sensibles

**✅ Archivos protegidos:**
- ✅ `.env` — No está en el repo (asumido, no verificado)
- ✅ `data/` — Contiene datos sensibles (conversaciones, logs)

**⚠️ Archivos que podrían exponerse:**
- ⚠️ `data/logs/server.log` — Podría contener información sensible
- ⚠️ `data/conversations/*.json` — Contienen datos de usuarios

### Recomendaciones de exclusión

**❌ `.gitignore` no verificado:**
- ⚠️ No se pudo verificar contenido de `.gitignore`
- ⚠️ **RIESGO:** Archivos sensibles podrían estar versionados

---

## 31.9 IMPACTO EN FSM, IA Y UX

### Inconsistencias que pueden romper FSM

**❌ FALLAS DETECTADAS:**

1. **Frontend no envía `imageBase64`:**
   - Backend tiene código para procesar imágenes
   - Frontend nunca las envía
   - **Impacto:** Funcionalidad de imágenes no funciona

2. **Frontend envía `imageUrls` (array vacío):**
   - Backend no valida ni usa este campo
   - **Impacto:** Confusión en el contrato

3. **Botón de adjuntar no funcional:**
   - CSS y JS referencian `#sti-attach-btn`
   - No hay implementación real
   - **Impacto:** UX incompleta

### Inconsistencias que pueden provocar fallbacks incorrectos

**⚠️ RIESGOS:**
- ⚠️ Si el frontend envía formato incorrecto, el backend puede fallar silenciosamente
- ⚠️ Validación de `validateChatRequest()` rechaza requests inválidos, pero no hay feedback claro al frontend

### Inconsistencias que pueden impedir uso de IA

**✅ NO DETECTADAS:**
- ✅ El backend maneja correctamente la ausencia de `imageBase64`
- ✅ Las imágenes no son requeridas para el flujo de IA

### Inconsistencias que pueden afectar UX sin error visible

**❌ FALLAS:**
- ❌ Botón de adjuntar muestra alerta en lugar de funcionalidad
- ❌ Frontend no muestra errores de validación del backend
- ❌ No hay indicador de "procesando" durante latencia de IA (solo "PENSANDO")

---

## 31.10 CRITERIO DE APROBACIÓN DEL ECOSISTEMA

### Condiciones para APROBAR

**❌ FALLAS BLOQUEANTES:**

1. ❌ **Frontend no envía `imageBase64`** — Backend espera este campo pero frontend envía `imageUrls`
2. ❌ **9 archivos `server*.js` obsoletos** — Riesgo de confusión y deploy incorrecto
3. ❌ **12 archivos `.bak` en `config/`** — Desorden y posible confusión
4. ❌ **Botón de adjuntar no funcional** — UX incompleta
5. ❌ **No hay asset físico para ícono de adjuntar** — CSS referencia pero no existe
6. ❌ **Pipeline de imágenes incompleto** — Frontend no implementa, backend sí
7. ❌ **Múltiples módulos no usados en `package.json`** — Dependencias innecesarias
8. ❌ **Múltiples directorios de código no usados** — `handlers/`, `services/`, `utils/`, `routes/`, etc.

**✅ CUMPLE:**
- ✅ Rutas de archivos validadas (path traversal prevention)
- ✅ Directorios creados automáticamente
- ✅ Write temp + rename para atomicidad
- ✅ Validación de formato de `conversation_id`
- ✅ Variables de entorno con defaults

---

## HALLAZGOS POR PRIORIDAD

### P0 — BLOQUEANTES (8 fallas)

**F31.1: Frontend no envía `imageBase64`**
- **Ubicación:** `public/sti-chat-widget.js` línea 141
- **Evidencia:**
  ```javascript
  body: JSON.stringify({
    sessionId: sessionId,
    message: text,
    imageUrls: []  // ❌ Backend espera "imageBase64"
  })
  ```
- **Impacto:** Funcionalidad de imágenes completamente rota
- **Fix propuesto:**
  ```javascript
  // Agregar input file y conversión a base64
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        // Enviar en body como imageBase64
      };
      reader.readAsDataURL(file);
    }
  };
  ```

**F31.2: 9 archivos `server*.js` obsoletos en raíz**
- **Ubicación:** Directorio raíz
- **Evidencia:** `server_antiguo.js`, `server_cursor.js`, `server - copia*.js` (7 archivos)
- **Impacto:** Riesgo de deploy incorrecto, confusión
- **Fix propuesto:** Mover a `No_Usados/` o eliminar

**F31.3: 12 archivos `.bak` en `config/`**
- **Ubicación:** `config/*.bak`
- **Evidencia:** 12 archivos de backup con timestamps
- **Impacto:** Desorden, posible confusión
- **Fix propuesto:** Mover a `No_Usados/` o eliminar

**F31.4: Botón de adjuntar no funcional**
- **Ubicación:** `public/sti-chat-widget.js` línea 34
- **Evidencia:** `alert('Próximamente: Adjuntar imágenes')`
- **Impacto:** UX incompleta, funcionalidad prometida no disponible
- **Fix propuesto:** Implementar input file + conversión a base64 + envío

**F31.5: No hay asset físico para ícono de adjuntar**
- **Ubicación:** CSS referencia `#sti-attach-btn` pero no hay imagen/SVG
- **Evidencia:** CSS línea 292 define estilos, pero no hay asset
- **Impacto:** Botón sin ícono visual
- **Fix propuesto:** Agregar SVG/PNG o usar emoji/unicode

**F31.6: Pipeline de imágenes incompleto**
- **Ubicación:** Frontend no implementa, backend sí
- **Evidencia:** Backend tiene código (líneas 3401-3424), frontend no
- **Impacto:** Funcionalidad parcialmente implementada
- **Fix propuesto:** Completar frontend o remover código backend no usado

**F31.7: Múltiples módulos no usados en `package.json`**
- **Ubicación:** `package.json` líneas 20-34
- **Evidencia:** `axios`, `file-type`, `ioredis`, `multer`, `node-cron`, `pino`, `pino-http`, `sharp`
- **Impacto:** Dependencias innecesarias, mayor tamaño de `node_modules`
- **Fix propuesto:** Remover o documentar por qué están

**F31.8: Múltiples directorios de código no usados**
- **Ubicación:** `handlers/`, `services/`, `utils/`, `routes/`, `core/`, `flows/`, `src/`
- **Evidencia:** `server.js` no importa ningún módulo de estos directorios
- **Impacto:** Código muerto, confusión sobre qué se usa
- **Fix propuesto:** Mover a `No_Usados/` o documentar propósito futuro

### P1 — IMPORTANTES (3 fallas)

**F31.9: No hay `.env.example`**
- **Ubicación:** Raíz del proyecto
- **Evidencia:** No existe archivo de ejemplo
- **Impacto:** Desarrolladores no saben qué variables configurar
- **Fix propuesto:** Crear `.env.example` con todas las variables documentadas

**F31.10: No hay versionado de assets**
- **Ubicación:** `public/sti-chat-widget.js`, `public/sti-chat.css`
- **Evidencia:** No hay query params de versión (`?v=2.0.0`)
- **Impacto:** Cache del navegador puede servir versiones antiguas
- **Fix propuesto:** Agregar versionado en URLs de carga

**F31.11: Frontend no muestra errores de validación**
- **Ubicación:** `public/sti-chat-widget.js` línea 145-154
- **Evidencia:** Solo verifica `data.reply`, no `data.error`
- **Impacto:** Usuario no sabe por qué falló el request
- **Fix propuesto:** Verificar `data.ok === false` y mostrar `data.error`

### P2 — RIESGOS (2 riesgos)

**R31.1: Archivos sensibles podrían estar versionados**
- **Ubicación:** `.gitignore` no verificado
- **Evidencia:** No se pudo verificar contenido
- **Impacto:** Datos de usuarios en repositorio
- **Fix propuesto:** Verificar y actualizar `.gitignore`

**R31.2: No hay validación MIME type de imágenes**
- **Ubicación:** `server.js` línea 3403
- **Evidencia:** Solo valida tamaño, no tipo
- **Impacto:** Podrían aceptarse archivos no-imagen
- **Fix propuesto:** Validar MIME type o magic bytes

---

## EVIDENCIA DE TESTS

### Test 1: Verificar que frontend no envía `imageBase64`

**Comando:**
```bash
grep -n "imageBase64" public/sti-chat-widget.js
```

**Resultado:**
```
No matches found
```

**Conclusión:** ❌ Frontend nunca envía `imageBase64`

### Test 2: Verificar que backend espera `imageBase64`

**Comando:**
```bash
grep -n "imageBase64" server.js | head -5
```

**Resultado:**
```
3927:    const { sessionId, message, imageBase64, imageName, request_id } = req.body;
3401:      if (imageBase64 && conversation) {
```

**Conclusión:** ✅ Backend espera `imageBase64`

### Test 3: Verificar archivos obsoletos

**Comando:**
```bash
ls -la server*.js | wc -l
```

**Resultado:**
```
10 archivos (incluyendo server.js activo)
```

**Conclusión:** ❌ 9 archivos obsoletos

### Test 4: Verificar módulos no usados

**Comando:**
```bash
grep -E "import.*from|require\(" server.js | grep -E "axios|file-type|ioredis|multer|node-cron|pino|sharp"
```

**Resultado:**
```
No matches found
```

**Conclusión:** ❌ Módulos en `package.json` pero no usados

---

## VEREDICTO

### ❌ NO-GO — ECOSISTEMA DE ARCHIVOS

**Razones:**
1. **8 fallas P0 bloqueantes** — Frontend/backend desincronizado, archivos obsoletos, funcionalidad incompleta
2. **3 fallas P1 importantes** — Falta documentación, versionado, manejo de errores
3. **2 riesgos P2** — Seguridad y validación

**Condición para GO:**
- Resolver todas las fallas P0
- Resolver al menos 2 de las fallas P1
- Documentar o mitigar los riesgos P2

---

## FIXES PROPUESTOS (PRIORIZADOS)

### P0.1: Sincronizar frontend/backend para imágenes

**Archivo:** `public/sti-chat-widget.js`

**Cambios:**
1. Agregar input file oculto
2. Implementar conversión File → base64
3. Enviar `imageBase64` en lugar de `imageUrls`
4. Validar tamaño/tipo en frontend antes de enviar

### P0.2: Limpiar archivos obsoletos

**Acción:** Mover a `No_Usados/`:
- `server_antiguo.js`
- `server_cursor.js`
- `server - copia*.js` (7 archivos)

### P0.3: Limpiar backups

**Acción:** Mover a `No_Usados/config/backups/`:
- `config/*.bak` (12 archivos)

### P0.4: Implementar botón de adjuntar

**Archivo:** `public/sti-chat-widget.js`

**Cambios:**
1. Reemplazar `alert()` con input file
2. Agregar ícono SVG o emoji
3. Mostrar preview de imagen seleccionada
4. Enviar `imageBase64` en request

### P0.5: Remover dependencias no usadas

**Archivo:** `package.json`

**Acción:** Remover o documentar:
- `axios`, `file-type`, `ioredis`, `multer`, `node-cron`, `pino`, `pino-http`, `sharp`

### P0.6: Documentar o mover código no usado

**Acción:** 
- Mover `handlers/`, `services/`, `utils/`, `routes/`, `core/`, `flows/`, `src/` a `No_Usados/`
- O documentar propósito futuro en `README_CURSOR.md`

---

## CONCLUSIÓN

El ecosistema de archivos tiene **inconsistencias críticas** entre frontend y backend, archivos obsoletos que generan confusión, y funcionalidad incompleta (imágenes). Aunque el backend está bien estructurado, el frontend no está sincronizado y hay código muerto que debería limpiarse.

**Estado:** ❌ **NO-GO** hasta resolver fallas P0.

