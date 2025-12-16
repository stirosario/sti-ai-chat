# FASE 1 — GOBERNANZA + OBSERVABILIDAD

## Estado: EN PROGRESO

### Componentes Implementados

#### ✅ 1. Stage Contract (`config/stageContract.js`)
- **Single Source of Truth** para la gobernanza del flujo
- Define contrato completo por stage:
  - `stageType`: DETERMINISTIC | GUIDED | OPEN_TEXT
  - `allowText`: boolean
  - `allowButtons`: boolean
  - `allowedTokens`: string[] (allowlist)
  - `maxButtons`: number
  - `defaultButtons`: Array de botones ordenados
  - `uiHints`: Configuración de UI
  - `instrumentation`: Configuración de logging

**Stages configurados:**
- ✅ GDPR_CONSENT, CONSENT, ASK_LANGUAGE, ASK_NAME, ASK_KNOWLEDGE_LEVEL
- ✅ ASK_NEED, ASK_DEVICE, BASIC_TESTS, ADVANCED_TESTS
- ✅ ESCALATE, CREATE_TICKET, TICKET_SENT, ENDED

**Funciones utilitarias:**
- `getStageContract(stage)`: Obtener contrato
- `isTokenAllowed(stage, token)`: Validar token
- `getDefaultButtons(stage)`: Obtener botones por defecto
- `isDeterministicStage(stage)`: Verificar si es determinístico
- `validateButtons(stage, buttons)`: Validar array de botones

#### ✅ 2. Stage Enforcer (`core/stageEnforcer.js`)
- **Guardrails y validación** antes de procesamiento
- Responsabilidades:
  - Parsear eventos del usuario (texto vs botón)
  - Validar contra STAGE_CONTRACT
  - Bloquear side-effects si hay violaciones
  - Registrar violaciones en auditoría
  - Limpiar botones según contrato

**Funciones principales:**
- `parseUserEvent(input)`: Parsear evento del usuario
- `validateUserEvent(stage, userEvent)`: Validar evento contra contrato
- `enforceStageRules(session, userEvent)`: Aplicar guardrails
- `enforceButtonRules(stage, buttons)`: Validar y limpiar botones
- `getViewModel(stage)`: Obtener configuración de UI

#### ✅ 3. Turn Logger (`core/turnLogger.js`)
- **Event Logging Turn-Based** para observabilidad completa
- Estructura de registro:
  ```javascript
  {
    turnId: string,
    ts: ISO string,
    sessionId: string,
    stageBefore: string,
    userEvent: { type, rawText, token, label, normalized },
    nlp: { intent, confidence, entities },
    bot: { reply, stageAfter, ok },
    buttonsShown: [{token, label, order}],
    transitionReason: string,
    violations: [{code, detail, severity}],
    ui: { clientVersion, page, userAgent },
    metadata: object
  }
  ```

**Funciones:**
- `createTurnLog(params)`: Crear registro de turno
- `saveTurnLog(session, turnLog)`: Guardar en sesión y transcript
- `getTurnLogs(session)`: Obtener todos los turnos
- `generateTimeline(session)`: Generar timeline desde turnos

#### ✅ 4. API Response Schema (`core/apiResponse.js`)
- **Respuesta estandarizada** backend → frontend
- Schema:
  ```javascript
  {
    ok: boolean,
    sessionId: string,
    csrfToken?: string,
    stage: string,
    reply: string,
    buttons: [{token, label, order, meta?}],
    viewModel: {
      stageType: string,
      allowText: boolean,
      allowButtons: boolean,
      maxButtons: number
    },
    debug?: {
      stageBefore: string,
      stageAfter: string,
      reason: string,
      violations: array
    },
    ...extra
  }
  ```

**Funciones:**
- `buildApiResponse(params)`: Construir respuesta estándar
- `buildErrorResponse(params)`: Construir respuesta de error

### Integraciones Parciales

#### 🔄 Orchestrator (`services/conversationOrchestrator.js`)
- ✅ Importado Stage Enforcer
- ✅ Validación con `enforceStageRules()` antes de procesar
- ✅ Parseo de eventos con `parseUserEvent()`
- ⚠️ **PENDIENTE**: Integración completa del Turn Logger en `buildResponse()`
- ⚠️ **PENDIENTE**: Validación de botones con `enforceButtonRules()` antes de retornar
- ⚠️ **PENDIENTE**: Usar `buildApiResponse()` para respuestas estandarizadas

### Próximos Pasos (TODO)

1. **Completar integración en Orchestrator:**
   - Modificar `buildResponse()` para aceptar `userEvent` y `stageBefore`
   - Agregar validación de botones con `enforceButtonRules()`
   - Crear turn log antes de retornar respuesta
   - Usar `buildApiResponse()` para estandarizar respuestas

2. **Integrar en endpoint `/api/chat`:**
   - Usar `buildApiResponse()` para respuestas
   - Asegurar que se capture `userEvent` completo
   - Pasar `ui` metadata desde frontend si está disponible

3. **Actualizar admin.php:**
   - Mostrar timeline por turnos (nueva vista)
   - Mostrar `buttonsShown` en cada turno
   - Mostrar `violations` si existen
   - Generar "copy paste" desde turnos

4. **Limpiar frontend:**
   - Eliminar auto-envíos de tokens
   - Implementar "clear then render" para botones
   - Enviar eventos limpios (action:text o action:button)

### Archivos Creados

- ✅ `config/stageContract.js` - Contrato centralizado
- ✅ `core/stageEnforcer.js` - Guardrails y validación
- ✅ `core/turnLogger.js` - Logging turn-based
- ✅ `core/apiResponse.js` - Schema de respuesta API

### Archivos Modificados

- 🔄 `services/conversationOrchestrator.js` - Integración parcial
- ⚠️ `server.js` - Pendiente actualización para usar nuevos componentes
- ⚠️ `admin.php` - Pendiente actualización para mostrar timeline
- ⚠️ `index.php` (frontend) - Pendiente limpieza de auto-envíos

## Criterios de Éxito

- [ ] ASK_NAME siempre 0 botones en UI y en admin.php
- [ ] Admin.php refleja exactamente los botones que el usuario vio
- [ ] Cualquier token inválido queda registrado y no rompe flujo
- [ ] El stage en logs coincide con stage en UI (sin desincronización)
- [ ] Timeline por turnos funciona correctamente en admin.php
- [ ] Frontend envía solo eventos limpios (sin auto-envíos)

