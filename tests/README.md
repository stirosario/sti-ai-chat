# Tests de Humo (Smoke Tests) - Tecnos/STI

Este directorio contiene tests de humo simples para validar el funcionamiento básico del chatbot Tecnos/STI.

## 🎯 Objetivo

Estos tests **NO** usan frameworks pesados como Jest o Mocha. Son scripts simples de Node.js que usan:
- `fetch` nativo para llamar a la API
- `console.log` con colores para output legible
- Exit codes estándar (0=éxito, 1=fallo)

## 📋 Tests Disponibles

### 1. `test-install-anydesk.js`
**Qué valida:**
- Flujo completo de solicitud de instalación de AnyDesk
- Bug crítico: que "w10" NO dispare fallback genérico (documentado en PARTE 1)
- Detección correcta del intent `installation_help`
- Generación de guía de instalación con pasos
- Mención de Windows 10 en la respuesta
- Presencia de botones de confirmación

**Cómo ejecutar:**
```powershell
node tests/test-install-anydesk.js
```

**Output esperado:**
```
🧪 TEST: Instalación de AnyDesk con "w10"
📡 API URL: http://localhost:3001
🔑 Session ID: test-install-1234567890

✅ PASS: Bot respondió al saludo
✅ PASS: Nombre aceptado
✅ PASS: No se disparó fallback genérico
✅ PASS: Intent installation_help detectado
✅ PASS: Pregunta por sistema operativo
✅ PASS: No se disparó fallback genérico para "w10"
✅ PASS: Guía de instalación generada
✅ PASS: Mención de Windows 10
✅ PASS: Botones de confirmación presentes

📊 RESUMEN DEL TEST
✅ Tests pasados: 9
❌ Tests fallidos: 0

🎉 ÉXITO: Todos los tests pasaron
```

### 2. `test-no-prende.js`
**Qué valida:**
- Flujo de diagnóstico de problema de encendido
- Detección correcta del intent `technical_problem`
- Generación de pasos diagnósticos básicos (cables, reinicio)
- Relevancia de los pasos para problema de encendido
- Presencia de botones de seguimiento (Funcionó ✔️ / Pruebas Avanzadas)
- Stage correcto: `BASIC_TESTS`

**Cómo ejecutar:**
```powershell
node tests/test-no-prende.js
```

**Output esperado:**
```
🧪 TEST: Problema "Mi compu no prende"
📡 API URL: http://localhost:3001
🔑 Session ID: test-no-prende-1234567890

✅ PASS: Bot respondió al saludo
✅ PASS: Nombre aceptado
✅ PASS: No se disparó fallback genérico
✅ PASS: Problema técnico detectado
✅ PASS: Pregunta por tipo de dispositivo
✅ PASS: Pasos diagnósticos generados
✅ PASS: Pasos relevantes para problema de encendido
✅ PASS: Ofrece botones de seguimiento
✅ PASS: Incluye botón de éxito
✅ PASS: Incluye opciones de escalamiento

📊 RESUMEN DEL TEST
✅ Tests pasados: 10
❌ Tests fallidos: 0

🎉 ÉXITO: Todos los tests pasaron
```

### 3. `test-ticket-creation.js`
**Qué valida:**
- Flujo completo de creación de ticket
- Generación de archivo `TCK-*.json` en `data/tickets/` (solo localhost)
- Retorno de `whatsappUrl` válida (contiene `wa.me`)
- Ticket contiene:
  - `ticketId` con formato `TCK-timestamp`
  - `userInfo` completo (name, sessionId)
  - `transcript` con conversación completa
  - `summary` del problema
  - PII enmascarado (si aplica)
- Stage correcto: `TICKET_SENT` o `ENDED`
- Mensaje de confirmación apropiado

**Cómo ejecutar:**
```powershell
node tests/test-ticket-creation.js
```

**Output esperado:**
```
🧪 TEST: Creación de Ticket WhatsApp
📡 API URL: http://localhost:3001
🔑 Session ID: test-ticket-1234567890

✅ PASS: Bot respondió al saludo
✅ PASS: Nombre aceptado
✅ PASS: URL de WhatsApp devuelta
✅ PASS: URL tiene formato válido (wa.me)
✅ PASS: Ticket ID devuelto
✅ PASS: Formato de ticket ID válido
✅ PASS: Archivo de ticket existe
✅ PASS: Ticket tiene estructura básica
✅ PASS: userInfo completo
✅ PASS: Transcript presente
✅ PASS: Transcript incluye descripción del problema
✅ PASS: Summary del problema presente
✅ PASS: Stage correcto después de ticket
✅ PASS: Mensaje de confirmación apropiado

📊 RESUMEN DEL TEST
✅ Tests pasados: 14
❌ Tests fallidos: 0

🎫 Ticket creado: TCK-1234567890

🎉 ÉXITO: Todos los tests pasaron
```

## 🔧 Configuración

### Variables de Entorno

**`API_URL`** (opcional)
- **Default:** `http://localhost:3001`
- **Uso:** Apuntar a servidor remoto para tests

**Ejemplo:**
```powershell
$env:API_URL = "https://tu-servidor.render.com"; node tests/test-install-anydesk.js
```

### Requisitos
- Node.js 18+ (para `fetch` nativo)
- Backend corriendo en `API_URL` (default: localhost:3001)

## 📊 Interpretación de Output

### Colores
- 🟢 **Verde (✅)**: Test pasado
- 🔴 **Rojo (❌)**: Test fallido
- 🟡 **Amarillo (⚠️)**: Warning (no crítico)
- 🔵 **Azul (ℹ️)**: Información adicional

### Exit Codes
- **0**: Todos los tests pasaron
- **1**: Al menos un test falló

## 🚀 Cuándo Ejecutar Tests

### Pre-Deploy
```powershell
# Ejecutar todos los tests antes de hacer deploy
node tests/test-install-anydesk.js
node tests/test-no-prende.js
node tests/test-ticket-creation.js
```

### Post-Fix de Bug
```powershell
# Después de corregir bug "w10", ejecutar:
node tests/test-install-anydesk.js

# Después de modificar lógica de diagnóstico:
node tests/test-no-prende.js

# Después de modificar sistema de tickets:
node tests/test-ticket-creation.js
```

### CI/CD (Opcional)
Puedes agregar estos tests a tu pipeline:

```yaml
# Ejemplo para GitHub Actions
- name: Run smoke tests
  run: |
    node tests/test-install-anydesk.js
    node tests/test-no-prende.js
    node tests/test-ticket-creation.js
```

## 🐛 Debugging

### Si un test falla:

1. **Verificar que el backend está corriendo:**
   ```powershell
   # Probar endpoint manualmente
   curl http://localhost:3001/api/chat -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"sessionId":"test","text":"hola"}'
   ```

2. **Ver logs del backend:**
   - Buscar logs del session ID del test (e.g., `test-install-1234567890`)
   - Verificar respuestas de OpenAI
   - Revisar intents detectados

3. **Verificar respuesta del bot:**
   - Los tests muestran extractos de respuestas en azul (ℹ️)
   - Si la respuesta no es la esperada, puede ser problema de:
     * Prompt de OpenAI
     * Lógica de detección de intents
     * Transición de estados

4. **Verificar archivos generados (test-ticket-creation.js):**
   ```powershell
   # Ver último ticket creado
   Get-ChildItem data/tickets/ | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   ```

## 📝 Agregar Nuevos Tests

Para crear un nuevo test:

1. **Copiar estructura de test existente:**
   ```javascript
   const API_URL = process.env.API_URL || 'http://localhost:3001';
   const SESSION_ID = `test-tu-caso-${Date.now()}`;
   
   // Colores, helpers, etc...
   ```

2. **Definir flujo de conversación:**
   - Saludo → Privacidad → Idioma → Nombre → Problema
   - Usar `sendMessage(text, buttonToken)` con delays de 500ms

3. **Agregar verificaciones:**
   ```javascript
   if (condicion) {
     log(colors.green, '✅ PASS: Descripción');
     passed++;
   } else {
     log(colors.red, '❌ FAIL: Descripción');
     failed++;
   }
   ```

4. **Documentar en este README**

## 🔗 Referencias

- **Documentación arquitectura:** `ARQUITECTURA_TECNOS_PARTE_1.md`
- **Integraciones:** `ARQUITECTURA_TECNOS_PARTE_2A.md`
- **Estados avanzados:** `ARQUITECTURA_TECNOS_PARTE_2B.md`
- **Fallbacks y errores:** `ARQUITECTURA_TECNOS_PARTE_2D.md`
- **Tickets y logs:** `ARQUITECTURA_TECNOS_PARTE_2E.md`

## ⚠️ Limitaciones

- **No reemplazan tests unitarios:** Estos son tests de humo end-to-end
- **Dependencia de OpenAI:** Si OpenAI está lento o caído, los tests pueden fallar
- **No testean UI:** Solo validan backend y respuestas del bot
- **Sesiones efímeras:** Cada test crea una sesión nueva, no persiste entre tests

## 📞 Contacto

Si encuentras bugs o tienes preguntas sobre los tests, contactar al equipo de desarrollo.

---

**Última actualización:** Generado automáticamente con GitHub Copilot
