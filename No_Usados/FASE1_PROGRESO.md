# FASE 1 — PROGRESO DE IMPLEMENTACIÓN

## ✅ COMPLETADO

### 1. Componentes Base Creados
- ✅ `config/stageContract.js` - Single Source of Truth
- ✅ `core/stageEnforcer.js` - Guardrails y validación
- ✅ `core/turnLogger.js` - Logging turn-based
- ✅ `core/apiResponse.js` - Schema de respuesta API

### 2. Integración en Orchestrator
- ✅ `orchestrateTurn()` ahora usa `enforceStageRules()` antes de procesar
- ✅ `buildResponse()` ahora:
  - Acepta `userEvent` y `stageBefore` como parámetros
  - Valida botones con `enforceButtonRules()`
  - Crea turn log con `createTurnLog()` y `saveTurnLog()`
  - Registra violaciones y botones mostrados

### 3. Flujo Completo
- ✅ Parseo de eventos del usuario
- ✅ Validación contra STAGE_CONTRACT
- ✅ Bloqueo de violaciones
- ✅ Logging completo por turno
- ✅ Validación de botones antes de retornar

## 🔄 EN PROGRESO

### 4. Integración en `/api/chat`
- ⚠️ El endpoint actual usa handlers legacy (`handleAskNameStage`, etc.)
- ⚠️ Necesita wrapper o actualización para usar `orchestrateTurn()` con nuevos componentes
- ⚠️ O mantener legacy pero agregar turn logging después de cada handler

## 📋 PENDIENTE

### 5. Actualizar admin.php
- ⚠️ Mostrar timeline por turnos
- ⚠️ Mostrar `buttonsShown` en cada turno
- ⚠️ Mostrar `violations` si existen
- ⚠️ Generar "copy paste" desde turnos

### 6. Limpiar Frontend
- ⚠️ Eliminar auto-envíos de tokens
- ⚠️ Implementar "clear then render" para botones
- ⚠️ Enviar eventos limpios (action:text o action:button)

## NOTAS TÉCNICAS

### Cambios en `buildResponse()`
```javascript
// ANTES:
async function buildResponse(session, flowResult, imageAnalysis = null, smartAnalysis = null)

// DESPUÉS:
async function buildResponse(session, flowResult, imageAnalysis = null, smartAnalysis = null, userEvent = null, stageBefore = null)
```

### Nuevo Flujo de Validación
1. `enforceStageRules()` valida evento ANTES de procesar
2. Si hay violaciones → retorna respuesta de rechazo
3. Si es válido → procesa normalmente
4. `enforceButtonRules()` valida botones ANTES de retornar
5. `createTurnLog()` registra TODO el turno
6. `saveTurnLog()` guarda en sesión y transcript

### Estructura de Turn Log
Cada turno ahora guarda:
- `userEvent`: { type, rawText, token, label, normalized }
- `bot`: { reply, stageAfter, ok }
- `buttonsShown`: [{ token, label, order }]
- `violations`: [{ code, detail, severity }]
- `transitionReason`: string
- `nlp`: { intent, confidence, entities } (si aplica)

## PRÓXIMOS PASOS

1. **Wrapper para `/api/chat`**: Crear función que integre orchestrator con handlers legacy
2. **Admin.php**: Leer `session.turnLogs` y mostrar timeline
3. **Frontend**: Limpiar auto-envíos y usar eventos limpios

