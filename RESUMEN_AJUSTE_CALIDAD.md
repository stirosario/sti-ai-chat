# Resumen: Ajuste de Calidad - Errores Estructurados y Sin Fallbacks

## Objetivo
Mejorar la calidad del código eliminando fallbacks que ocultan errores y estableciendo un sistema de errores estructurado que permita detectar problemas reales.

## Cambios Realizados

### 1. Handlers Retornan Errores Estructurados

#### `handleAskDeviceStage` (líneas 921-927)
**ANTES:**
```javascript
if (!ctx || !ctx.session) {
  console.error('[ASK_DEVICE] Error: ctx o ctx.session faltante');
  return {
    reply: 'Error interno. Por favor, intentá nuevamente.',
    stage: 'ASK_DEVICE',
    buttons: []
  };
}
```

**DESPUÉS:**
```javascript
if (!ctx || !ctx.session) {
  console.error('[ASK_DEVICE] Error: ctx o ctx.session faltante');
  return {
    ok: false,
    error: 'missing_ctx',
    message: 'Context or session missing in handleAskDeviceStage'
  };
}
```

#### `handleAskOsStage` (líneas 981-987)
**ANTES:**
```javascript
if (!ctx || !ctx.session) {
  console.error('[ASK_OS] Error: ctx o ctx.session faltante');
  return {
    reply: 'Error interno. Por favor, intentá nuevamente.',
    stage: 'ASK_OS',
    buttons: []
  };
}
```

**DESPUÉS:**
```javascript
if (!ctx || !ctx.session) {
  console.error('[ASK_OS] Error: ctx o ctx.session faltante');
  return {
    ok: false,
    error: 'missing_ctx',
    message: 'Context or session missing in handleAskOsStage'
  };
}
```

### 2. Dispatcher Sin Try/Catch y Sin Fallbacks

#### `ASK_DEVICE` en dispatcher (líneas 1562-1569)
**ANTES:**
```javascript
} else if (session.stage === 'ASK_DEVICE') {
  console.log(`[CHAT] [${sessionId}] Procesando ASK_DEVICE`);
  try {
    result = await handleAskDeviceStage({ sessionId, session, userText, buttonToken });
  } catch (err) {
    console.error(`[CHAT] [${sessionId}] Error en handleAskDeviceStage:`, err);
    // Fallback absoluto
    const contract = getStageContract('ASK_DEVICE');
    result = {
      reply: session.userLocale?.startsWith('en')
        ? 'I understand. To continue, please tell me what type of device you are using.'
        : 'Entiendo. Para seguir, decime qué tipo de equipo es.',
      stage: 'ASK_DEVICE',
      buttons: contract.defaultButtons
    };
  }
}
```

**DESPUÉS:**
```javascript
} else if (session.stage === 'ASK_DEVICE') {
  console.log(`[CHAT] [${sessionId}] Procesando ASK_DEVICE`);
  result = await handleAskDeviceStage({ sessionId, session, userText, buttonToken });
  // Si el handler retorna error estructurado, propagarlo
  if (result && result.ok === false) {
    console.error(`[CHAT] [${sessionId}] Error estructurado de handleAskDeviceStage:`, result.error);
    return res.status(500).json({ ok: false, error: result.error, message: result.message });
  }
}
```

#### `ASK_OS` en dispatcher (líneas 1570-1577)
**ANTES:**
```javascript
} else if (session.stage === 'ASK_OS') {
  console.log(`[CHAT] [${sessionId}] Procesando ASK_OS`);
  try {
    result = await handleAskOsStage({ sessionId, session, userText, buttonToken });
  } catch (err) {
    console.error(`[CHAT] [${sessionId}] Error en handleAskOsStage:`, err);
    // Fallback absoluto
    const contract = getStageContract('ASK_OS');
    result = {
      reply: session.userLocale?.startsWith('en')
        ? 'What operating system are you using?'
        : '¿Qué sistema operativo estás usando?',
      stage: 'ASK_OS',
      buttons: contract.defaultButtons
    };
  }
}
```

**DESPUÉS:**
```javascript
} else if (session.stage === 'ASK_OS') {
  console.log(`[CHAT] [${sessionId}] Procesando ASK_OS`);
  result = await handleAskOsStage({ sessionId, session, userText, buttonToken });
  // Si el handler retorna error estructurado, propagarlo
  if (result && result.ok === false) {
    console.error(`[CHAT] [${sessionId}] Error estructurado de handleAskOsStage:`, result.error);
    return res.status(500).json({ ok: false, error: result.error, message: result.message });
  }
}
```

## Beneficios

### 1. Errores Visibles
- Los errores de código ahora se propagan correctamente
- No se ocultan con fallbacks genéricos
- El frontend recibe información precisa del error

### 2. Arquitectura Consistente
- Los handlers retornan errores estructurados `{ ok: false, error: "...", message: "..." }`
- El dispatcher detecta estos errores y responde con HTTP 500
- Cuerpo de respuesta consistente: `{ ok: false, error: "...", message: "..." }`

### 3. Debugging Mejorado
- Los logs muestran claramente qué error ocurrió
- El código de error (`missing_ctx`) permite identificar rápidamente el problema
- No hay confusión entre errores reales y fallbacks

### 4. Sin Ocultamiento de Errores
- Eliminados los "fallbacks absolutos" que tapaban errores
- Eliminado el try/catch que capturaba excepciones y las convertía en respuestas genéricas
- Los errores reales ahora se propagan correctamente

## Flujo de Errores

### Antes (Ocultaba Errores):
```
Handler detecta error
  ↓
Retorna reply genérico con buttons: []
  ↓
Usuario ve mensaje genérico
  ↓
Error real nunca se detecta
```

### Después (Propaga Errores):
```
Handler detecta error
  ↓
Retorna { ok: false, error: "missing_ctx", message: "..." }
  ↓
Dispatcher detecta result.ok === false
  ↓
Retorna HTTP 500 con { ok: false, error: "missing_ctx", message: "..." }
  ↓
Frontend recibe error estructurado
  ↓
Logs muestran error claro
```

## Validación

✅ Handlers retornan errores estructurados  
✅ Dispatcher detecta errores y retorna HTTP 500  
✅ Sin try/catch que oculte errores  
✅ Sin fallbacks absolutos  
✅ Cuerpo de respuesta consistente  
✅ Logs claros para debugging  
✅ Sintaxis válida (verificado con `node --check`)  
✅ Sin errores de linting  

## Archivos Modificados

- `server.js`: Líneas 921-927, 981-987, 1562-1577

## Git Diff

Ver archivo `ajuste_calidad.patch` para el diff completo en formato git.

