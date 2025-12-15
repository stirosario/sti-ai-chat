# Corrección: Botones Inválidos en Stages Determinísticos

## Problema Identificado

### Síntomas
1. En stages determinísticos (`ASK_LANGUAGE`, `ASK_NAME`) se mostraban botones inválidos: `BTN_SOLVED`, `BTN_PERSIST`, `BTN_ADVANCED_TESTS`, `BTN_CLOSE`
2. El frontend enviaba automáticamente `BTN_CONNECT_TECH` sin interacción del usuario
3. Estos botones no aparecían en `admin.php` porque no se registraban en transcript

### Causa Raíz

**PRINCIPAL**: El backend estaba devolviendo botones inválidos para stages determinísticos debido a:
1. **Falta de validación estricta**: No se validaba si un token de botón era válido para el stage actual antes de procesarlo
2. **Botones "pegados"**: El frontend no limpiaba botones anteriores antes de renderizar nuevos, causando que botones de mensajes anteriores aparecieran en mensajes nuevos
3. **Falta de auditoría**: Los botones enviados y devueltos no se registraban en transcript para auditoría

**NOTA IMPORTANTE**: El log "📤 Enviando BTN_CONNECT_TECH al servidor" aparece cuando el usuario hace click en un botón con ese valor. El problema NO es que se envíe automáticamente, sino que:
- El backend devolvía esos botones incorrectamente en stages determinísticos
- El frontend no limpiaba botones anteriores, causando que aparecieran botones de stages anteriores

## Soluciones Implementadas

### 1. Backend: Validación Estricta de Tokens en Stages Determinísticos

**Archivo**: `sti-ai-chat/services/conversationOrchestrator.js`

**Cambio**: Agregada validación ANTES de procesar cualquier botón en stages determinísticos.

```javascript
// ✅ CRÍTICO: Validar token en stages determinísticos (defensa en profundidad)
if (DETERMINISTIC_STAGES.includes(currentStage)) {
  const validTokensForStage = {
    [STAGES.ASK_LANGUAGE]: ['BTN_LANG_ES_AR', 'BTN_LANG_EN'],
    [STAGES.ASK_NAME]: ['BTN_NO_NAME'],
    [STAGES.ASK_NEED]: ['BTN_PROBLEMA', 'BTN_CONSULTA', 'BTN_NO_ENCIENDE', ...],
    [STAGES.ASK_DEVICE]: ['BTN_DEV_PC_DESKTOP', 'BTN_DEV_PC_ALLINONE', 'BTN_DEV_NOTEBOOK']
  };
  
  if (!validTokens.includes(buttonToken)) {
    // Rechazar y registrar en transcript para auditoría
    // Retornar respuesta con botones determinísticos correctos
  }
}
```

**Comportamiento**:
- Si el token es inválido: NO ejecuta acciones, NO avanza stage, devuelve botones determinísticos correctos
- Registra en transcript el token rechazado para auditoría
- Log de error para monitoreo

### 2. Backend: Registro de Botones en Transcript para Auditoría

**Archivo**: `sti-ai-chat/services/conversationOrchestrator.js`

**Cambio**: Todos los botones (válidos e inválidos) se registran en transcript.

**Para botones inválidos** (líneas ~248-257):
```javascript
session.transcript.push({
  who: 'user',
  text: `[BUTTON:${buttonToken}]`,
  ts: new Date().toISOString(),
  buttonToken: buttonToken,
  rejected: true,
  reason: `Invalid token for stage ${currentStage}`
});
```

**Para botones válidos** (líneas ~310-318):
```javascript
session.transcript.push({
  who: 'user',
  text: `[BUTTON:${buttonToken}]`,
  ts: new Date().toISOString(),
  buttonToken: buttonToken,
  stage: currentStage,
  rejected: false
});
```

**Para botones devueltos** (líneas ~417-426):
```javascript
session.transcript.push({
  who: 'system',
  text: `[BUTTONS_SHOWN:${buttonTokens.join(',')}]`,
  ts: new Date().toISOString(),
  buttonsShown: buttonTokens,
  stage: nextStage
});
```

### 3. Frontend: Limpieza de Botones Antes de Renderizar

**Archivo**: `c:\STI\public_html\index.php`

**Cambio 1** - En `sendButton()` (líneas ~2070-2081):
```javascript
// ✅ CRÍTICO: Limpiar botones anteriores antes de renderizar nuevos
const allOptionContainers = document.querySelectorAll('.sti-options');
allOptionContainers.forEach(container => {
  const buttons = container.querySelectorAll('.sti-opt-btn');
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  });
});
```

**Cambio 2** - En `renderButtons()` (líneas ~1908-1916):
```javascript
// ✅ CRÍTICO: Limpiar botones anteriores en este contenedor antes de renderizar nuevos
const existingOptions = containerRow.querySelector('.sti-options');
if (existingOptions) {
  // Remover contenedor anterior completamente para evitar duplicados
  existingOptions.remove();
}
```

## Resultado Esperado

### Flujo: Consentimiento → Idioma → Nombre → ASK_NEED

1. **ASK_LANGUAGE**:
   - ✅ Muestra SOLO: `BTN_LANG_ES_AR`, `BTN_LANG_EN`
   - ❌ NO muestra: `BTN_SOLVED`, `BTN_PERSIST`, `BTN_ADVANCED_TESTS`, `BTN_CLOSE`, `BTN_CONNECT_TECH`
   - ✅ Si se envía un token inválido, se rechaza y se registra en transcript

2. **ASK_NAME**:
   - ✅ Muestra SOLO: `BTN_NO_NAME`
   - ❌ NO muestra botones de solución/diagnóstico
   - ✅ Si se envía un token inválido, se rechaza y se registra en transcript

3. **ASK_NEED**:
   - ✅ Muestra: `BTN_PROBLEMA`, `BTN_CONSULTA`, + 6 problemas frecuentes
   - ❌ NO muestra: `BTN_SOLVED`, `BTN_PERSIST`, `BTN_ADVANCED_TESTS`
   - ✅ Si se envía un token inválido, se rechaza y se registra en transcript

### Auditoría en admin.php

- ✅ Todos los botones enviados (válidos e inválidos) aparecen en transcript como `[BUTTON:TOKEN]`
- ✅ Todos los botones devueltos aparecen en transcript como `[BUTTONS_SHOWN:TOKEN1,TOKEN2,...]`
- ✅ Los tokens rechazados tienen `rejected: true` y `reason` para debugging

## Archivos Modificados

1. **Backend**:
   - `sti-ai-chat/services/conversationOrchestrator.js` - Validación de tokens y registro en transcript

2. **Frontend**:
   - `c:\STI\public_html\index.php` - Limpieza de botones antes de renderizar

## Validación

### Pruebas Manuales
1. Abrir chat → consentimiento → idioma → nombre
2. Verificar que en `ASK_LANGUAGE` y `ASK_NAME` NO aparecen botones inválidos
3. Verificar que no hay envíos automáticos de `BTN_CONNECT_TECH` (solo cuando el usuario hace click)
4. Verificar en `admin.php` que aparecen los tokens enviados y los botones devueltos

### Logs de Validación
```
[ORCHESTRATOR] ❌ AUDITORÍA: Token inválido "BTN_CONNECT_TECH" en stage determinístico "ASK_LANGUAGE" (SessionId: A1234-...)
[ORCHESTRATOR] ❌ Tokens válidos para ASK_LANGUAGE: ['BTN_LANG_ES_AR', 'BTN_LANG_EN']
```

## Notas Adicionales

- La validación es **defensa en profundidad**: Previene que tokens inválidos se procesen incluso si el frontend los envía
- El registro en transcript es **auditoría pura**: No afecta el flujo, solo permite monitorear
- La limpieza de botones en frontend previene "botones pegados" de mensajes anteriores

