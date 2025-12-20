# Guía de Desarrollo - STI/Tecnos

Esta guía documenta cómo correr y probar el proyecto **tal cual está hoy**, sin modificar la lógica existente.

---

## A) Requisitos

- **Node.js**: >= 18 LTS (recomendado 20 LTS)
- **PHP**: >= 8.1 (si el `index.php` se sirve localmente)
- **npm**: Incluido con Node.js

---

## B) Setup

1. **Instalar dependencias:**
   ```bash
   npm ci
   ```
   (Si no existe `package-lock.json`, usar `npm install`)

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   ```
   Luego editar `.env` y completar los valores mínimos necesarios (ver sección C).

---

## C) Variables de Entorno

Lista exacta de variables detectadas en `server.js`:

| Variable | Descripción | Valor por defecto (si aplica) |
|----------|-------------|-------------------------------|
| `PORT` | Puerto del servidor | `3001` |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `ALLOWED_ORIGINS` | Orígenes permitidos (CORS), separados por coma | `http://localhost,http://127.0.0.1` |
| `LOGS_ALLOWED_ORIGINS` | Orígenes permitidos para logs (SSE), separados por coma | `http://localhost,http://127.0.0.1` |
| `PUBLIC_BASE_URL` | URL base pública del servicio | `http://localhost:3001` |
| `OPENAI_API_KEY` | Clave API de OpenAI | *(vacío en dev si querés fallback local)* |
| `OPENAI_MODEL` | Modelo de OpenAI a usar | `gpt-4o-mini` |
| `ENABLE_IMAGE_REFS` | Habilitar referencias de imágenes | `true` |
| `DATA_BASE` | Directorio base para datos | `./data` |
| `TRANSCRIPTS_DIR` | Directorio de transcripciones | `./data/transcripts` |
| `TICKETS_DIR` | Directorio de tickets | `./data/tickets` |
| `LOGS_DIR` | Directorio de logs | `./data/logs` |
| `UPLOADS_DIR` | Directorio de uploads | `./data/uploads` |
| `CONVERSATIONS_DIR` | Directorio de conversaciones | `./data/conversations` |
| `LOG_TOKEN` | Token para endpoints admin/logs | `dev_token` |
| `SSE_TOKEN` | Token alternativo para SSE (fallback de LOG_TOKEN) | `dev_sse_token` |
| `WHATSAPP_NUMBER` | Número de WhatsApp (formato internacional) | `+5493417422422` |
| `LOGS_MAX_BYTES` | Tamaño máximo de logs (bytes) | `10485760` (10MB) |
| `WRITE_LOG_TOKEN_FILE` | Escribir token en archivo | `false` |
| `SMART_MODE` | Habilitar modo inteligente (IA) | `true` |
| `OA_MIN_CONF` | Confianza mínima para OpenAI | `0.6` |
| `OA_NAME_REJECT_CONF` | Confianza mínima para rechazar nombres | `0.55` |

**⚠️ IMPORTANTE:** No incluir secretos reales en el repositorio. Dejar `OPENAI_API_KEY` vacío o usar placeholders en desarrollo.

---

## D) Cómo Levantar

1. **Iniciar el servidor:**
   ```bash
   node server.js
   ```
   (O `npm run start` si existe el script)

2. **Verificar en consola:**
   - El servidor debe escuchar en el puerto especificado en `PORT` (por defecto `3001`)
   - Buscar mensaje similar a: `Servidor escuchando en puerto 3001`

---

## E) Smoke Tests Manuales (Checklist Reproducible)

### 1) Health Check

Verificar que el servidor responde:

```bash
curl -s http://localhost:3001/api/health
```

**Esperado:** Respuesta JSON con estado `ok` o similar.

---

### 2) Handshake / Greeting

Obtener `sessionId` y `csrfToken`:

```bash
curl -s http://localhost:3001/api/greeting
```

**Esperado:** Respuesta JSON con `sessionId` y `csrfToken`. Ejemplo:
```json
{
  "sessionId": "abc123...",
  "csrfToken": "xyz789...",
  ...
}
```

**Guardar estos valores** para el siguiente paso.

---

### 3) Chat (Requiere sessionId + csrfToken)

Enviar un mensaje de prueba:

```bash
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "action": "text",
    "sessionId": "<SID>",
    "csrfToken": "<CSRF>",
    "text": "hola",
    "message": "hola"
  }'
```

**Reemplazar:**
- `<SID>` por el `sessionId` obtenido en el paso 2
- `<CSRF>` por el `csrfToken` obtenido en el paso 2

**Esperado:** Respuesta JSON con mensaje del bot.

---

### 4) UI Rápida (index.php)

1. Abrir la página que contiene el widget (normalmente `index.php` en el frontend)
2. Abrir el chat (click en el widget)
3. Enviar un mensaje de texto (ej: "hola")
4. Verificar que se recibe una respuesta del bot

**Esperado:** El chat funciona correctamente, mostrando mensajes del usuario y respuestas del bot.

---

### 5) Imagen (Si aplica)

1. En la UI, usar el botón/clip para subir una imagen
2. Verificar en la consola del navegador (F12) que hay:
   - Request a `/api/upload-image`
   - Luego request a `/api/chat` que incluye referencia a la imagen (base64 o URL)

**Esperado:** La imagen se sube correctamente y se envía al chat con referencia.

---

## F) Criterios de Aceptación (PR #1)

✅ Este PR **NO modifica** `server.js` ni `index.php`  
✅ El `README_DEV.md` permite reproducir los 3 pasos: greeting → chat → UI  
✅ No hay secretos en el repositorio (`.env.example` solo contiene placeholders)  
✅ Los smoke tests son reproducibles y documentados

---

## Notas Adicionales

- Si el servidor no inicia, verificar que el puerto `PORT` no esté en uso
- Si hay errores de CORS, verificar que `ALLOWED_ORIGINS` incluya el origen del frontend
- Si el chat no responde, verificar que `OPENAI_API_KEY` esté configurada (o que el fallback local funcione)

