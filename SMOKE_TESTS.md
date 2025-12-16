# Smoke Tests - STI Chat v8

## Prerequisitos
- Servidor corriendo en `http://localhost:3000` (o puerto configurado)
- Variable de entorno `LOG_TOKEN` configurada para acceder a historial

## Test 1: Flujo Completo Determinístico

### Paso 1: Obtener Greeting
```bash
curl -X GET http://localhost:3000/api/greeting
```

**Verificar:**
- ✅ `ok: true`
- ✅ `stage: "ASK_LANGUAGE"`
- ✅ `sessionId` formato AA0000-ZZ9999
- ✅ `buttons` tiene exactamente 2 botones: "Yes, I Accept" y "No, I Do Not Accept"
- ✅ `reply` es bilingüe (ES/EN)

### Paso 2: Aceptar GDPR
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<SESSION_ID_DEL_PASO_1>",
    "csrfToken": "<CSRF_TOKEN_DEL_PASO_1>",
    "action": "button",
    "value": "si"
  }'
```

**Verificar:**
- ✅ `stage: "ASK_LANGUAGE"`
- ✅ `buttons` tiene exactamente 2 botones: "🇦🇷 Español (Argentina)" y "🇬🇧 English"
- ✅ NO aparecen botones "si/no"

### Paso 3: Seleccionar Idioma Español
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<SESSION_ID>",
    "csrfToken": "<CSRF_TOKEN>",
    "action": "button",
    "value": "BTN_LANG_ES_AR"
  }'
```

**Verificar:**
- ✅ `stage: "ASK_NAME"`
- ✅ `reply` está SOLO en español (no bilingüe)
- ✅ `buttons: []` (ASK_NAME no tiene botones)

### Paso 4: Ingresar Nombre
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<SESSION_ID>",
    "csrfToken": "<CSRF_TOKEN>",
    "text": "Juan"
  }'
```

**Verificar:**
- ✅ `stage: "ASK_USER_LEVEL"`
- ✅ `buttons` tiene exactamente 3 botones: "Básico", "Intermedio", "Avanzado"
- ✅ `reply` menciona el nombre del usuario

### Paso 5: Seleccionar Nivel
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<SESSION_ID>",
    "csrfToken": "<CSRF_TOKEN>",
    "action": "button",
    "value": "BTN_USER_LEVEL_BASIC"
  }'
```

**Verificar:**
- ✅ `stage: "ASK_NEED"`
- ✅ `reply` menciona el nivel seleccionado
- ✅ `buttons` puede tener botones (gobernados por IA) o estar vacío

## Test 2: Verificar ID Único

### Verificar formato y unicidad
```bash
# Hacer múltiples requests a /api/greeting
# Verificar que cada sessionId sea único y formato AA0000-ZZ9999
```

**Verificar:**
- ✅ Formato: 2 letras + 4 números (sin Ñ)
- ✅ Cada ID es único
- ✅ IDs se guardan en `data/id-registry.json`

## Test 3: Guardado Indefinido de Conversaciones

### Verificar archivo JSONL
```bash
# Después de completar Test 1, verificar:
cat data/conversations/<SESSION_ID>.jsonl
```

**Verificar:**
- ✅ Archivo existe
- ✅ Cada línea es JSON válido
- ✅ Contiene: `ts`, `sessionId`, `stage_before`, `stage_after`, `user_event`, `bot_reply`, `buttons_shown`, `reason`
- ✅ `buttons_shown` tiene formato `[{token, label, order}]`

## Test 4: Admin.php - Historial

### Obtener historial
```bash
curl -X GET "http://localhost:3000/api/historial/<SESSION_ID>?token=<LOG_TOKEN>"
```

**Verificar:**
- ✅ Requiere `LOG_TOKEN` (401 sin token)
- ✅ Retorna `{ok: true, sessionId, turns: [...]}`
- ✅ `turns` contiene todos los turnos de la conversación
- ✅ `buttons_shown` en cada turno coincide con lo que vio el usuario

## Test 5: Botones No Mezclados

### Verificar en cada stage determinístico
- ✅ ASK_LANGUAGE: Solo botones de idioma (o sí/no si no hay consentimiento)
- ✅ ASK_NAME: Sin botones
- ✅ ASK_USER_LEVEL: Solo botones de nivel (3 botones)

**Verificar:**
- ✅ No se heredan botones del turno anterior
- ✅ Si stage es determinístico y no hay botones, se usan defaults del contrato
- ✅ Botones de otros stages nunca aparecen

## Test 6: Respuestas Adaptadas al Nivel

### Probar con cada nivel
1. Completar flujo hasta ASK_USER_LEVEL
2. Seleccionar "Básico"
3. Avanzar a ASK_NEED y hacer una pregunta técnica

**Verificar:**
- ✅ Respuestas en nivel BÁSICO: lenguaje simple, paso a paso, confirmaciones
- ✅ Respuestas en nivel INTERMEDIO: términos técnicos comunes, detalle moderado
- ✅ Respuestas en nivel AVANZADO: lenguaje técnico, preciso, menos relleno

## Test 7: Compatibilidad Frontend

### Verificar formato de respuesta
Cada respuesta debe tener:
```json
{
  "ok": true,
  "reply": "...",
  "stage": "...",
  "sessionId": "...",
  "csrfToken": "...",
  "buttons": [{text, value, label, order}],
  "options": [{text, value, label, order}],  // Legacy mirror
  "ui": [{text, value, label, order}],       // Legacy mirror
  "buildId": "..."
}
```

**Verificar:**
- ✅ Header `X-STI-BUILD` presente
- ✅ `buttons`, `options`, `ui` tienen mismo contenido (legacy compatibility)
- ✅ Formato compatible con widget existente

## Test 8: Reset Endpoint

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<SESSION_ID>",
    "csrfToken": "<CSRF_TOKEN>",
    "action": "button",
    "value": "BTN_CLOSE"
  }'
```

**Verificar:**
- ✅ Endpoint `/api/reset` existe (opcional, si widget lo llama)
- ✅ Resetea sesión correctamente

## Checklist Final

- [ ] Test 1: Flujo completo determinístico funciona
- [ ] Test 2: IDs únicos AA0000-ZZ9999
- [ ] Test 3: Conversaciones guardadas indefinidamente
- [ ] Test 4: Admin.php puede leer historial
- [ ] Test 5: Botones no se mezclan entre stages
- [ ] Test 6: Respuestas adaptadas al nivel
- [ ] Test 7: Compatible con frontend existente
- [ ] Test 8: Reset funciona (si aplica)

