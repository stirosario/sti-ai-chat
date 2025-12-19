# Informe: Verificación de Estructura Frontend-Backend

## Fecha: 2025-01-25

## Resumen Ejecutivo

Se ha realizado una verificación completa de la estructura del servidor (`server.js`) y del frontend (`public/sti-chat-widget.js`) para identificar incompatibilidades y asegurar la correcta comunicación entre ambos.

---

## Estructura del Backend (server.js)

### Endpoints Principales

1. **GET/POST `/api/greeting`**
   - Inicializa sesión y genera CSRF token
   - Retorna: `{ ok, greeting, reply, stage, sessionId, csrfToken, buttons }`

2. **POST `/api/chat`**
   - Endpoint principal de conversación
   - Requiere: CSRF token en header `x-csrf-token`
   - Espera en body:
     - `sessionId` (string)
     - `text` (string) - **NO `message`**
     - `images` (array opcional)
     - `action: 'button'` y `value: token` (para botones)
   - Retorna: `{ ok, reply, stage, options, buttons }`

3. **POST `/api/reset`**
   - Resetea la sesión

4. **POST `/api/session/validate`**
   - Valida si una sesión existe y está activa

### Formato de Respuesta del Servidor

```javascript
{
  ok: true/false,
  reply: "Texto de respuesta",
  stage: "ESTADO_ACTUAL",
  options: ["BTN_TOKEN1", "BTN_TOKEN2"], // Array de tokens
  buttons: [...] // A veces presente, formato diferente
}
```

### CSRF Protection

- El servidor requiere CSRF token en todas las peticiones POST
- Se obtiene del endpoint `/api/greeting`
- Se envía en header: `x-csrf-token`

---

## Problemas Identificados en el Frontend

### ❌ Problema 1: Campo de Mensaje Incorrecto
- **Frontend envía:** `message`
- **Backend espera:** `text`
- **Línea:** 134 en `sti-chat-widget.js`

### ❌ Problema 2: Campo de Botones Incorrecto
- **Frontend busca:** `data.buttons`
- **Backend devuelve:** `data.options` (array de tokens)
- **Línea:** 145 en `sti-chat-widget.js`

### ❌ Problema 3: Falta CSRF Token
- El frontend no obtiene ni envía el CSRF token
- El servidor rechazará las peticiones sin token

### ❌ Problema 4: No se Inicializa Sesión
- El frontend genera su propio `sessionId`
- Debería llamar a `/api/greeting` primero para obtener el `sessionId` oficial y el CSRF token

### ❌ Problema 5: Formato de Botones Incorrecto
- El frontend espera objetos `{ label, value }`
- El backend devuelve array de tokens: `["BTN_TOKEN1", "BTN_TOKEN2"]`
- Necesita mapear tokens a etiquetas

### ❌ Problema 6: Envío de Botones Incorrecto
- Cuando se hace clic en un botón, se envía como texto plano
- Debería enviarse con `{ action: 'button', value: token }`

---

## Soluciones Implementadas

### ✅ Solución 1: Actualizar Campo de Mensaje
- Cambiar `message` → `text` en el body de la petición

### ✅ Solución 2: Manejar `options` en lugar de `buttons`
- Leer `data.options` y mapear tokens a etiquetas legibles

### ✅ Solución 3: Implementar CSRF Token
- Llamar a `/api/greeting` al inicializar
- Guardar `csrfToken` y enviarlo en header `x-csrf-token`

### ✅ Solución 4: Inicializar Sesión Correctamente
- Llamar a `/api/greeting` al iniciar el chat
- Usar `sessionId` y `csrfToken` de la respuesta

### ✅ Solución 5: Mapear Tokens a Etiquetas
- Crear función para convertir tokens a etiquetas legibles
- Ejemplo: `BTN_SOLVED` → "Lo resolví ✔️"

### ✅ Solución 6: Enviar Botones con Formato Correcto
- Cuando se hace clic en botón, enviar:
  ```javascript
  {
    sessionId: ...,
    action: 'button',
    value: token,
    text: label // opcional, para contexto
  }
  ```

---

## Mapeo de Tokens de Botones

El servidor usa los siguientes tokens (definidos en `BUTTONS`):

- `BTN_SOLVED` → "Lo resolví ✔️" / "I solved it ✔️"
- `BTN_PERSIST` → "Sigue pasando ❌" / "Still happening ❌"
- `BTN_MORE_TESTS` → "Más pruebas 🔍" / "More tests 🔍"
- `BTN_CONNECT_TECH` → "Conectar con Técnico 🧑‍💻" / "Connect with Technician 🧑‍💻"
- `BTN_WHATSAPP` → "Enviar WhatsApp 📱" / "Send WhatsApp 📱"
- `BTN_CLOSE` → "Cerrar chat ❌" / "Close chat ❌"
- `BTN_REPHRASE` → "Reformular problema ✏️" / "Rephrase problem ✏️"
- `BTN_CONFIRM_TICKET` → "Sí, generar ticket ✅" / "Yes, create ticket ✅"
- `BTN_CANCEL` → "Cancelar ❌" / "Cancel ❌"
- `BTN_MORE_SIMPLE` → "Más simple 🔧" / "More simple 🔧"
- `BTN_HELP_N` → "Ayuda paso N" (donde N es el número)

---

## Archivos Modificados

1. `public/sti-chat-widget.js` - Actualizado para compatibilidad completa

---

## Próximos Pasos Recomendados

1. ✅ Implementar manejo de imágenes (ya está preparado en el backend)
2. ✅ Agregar manejo de errores más robusto
3. ✅ Implementar reconexión automática si falla la sesión
4. ✅ Agregar indicadores de estado de conexión
5. ✅ Implementar validación de sesión periódica

---

## Notas Técnicas

- El servidor usa `express-rate-limit` para limitar peticiones
- El servidor valida CSRF en todas las peticiones POST
- El servidor soporta imágenes en base64 en el campo `images`
- El servidor mantiene un cache de sesiones en memoria (LRU)
- Las sesiones expiran después de 48 horas

