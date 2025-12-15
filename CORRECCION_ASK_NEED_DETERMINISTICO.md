# Corrección: ASK_NEED 100% Determinístico

## Resumen
Se movió la lógica de botones de problemas frecuentes de `ASK_NEED` desde el sistema inteligente (`integrationPatch.js`) al flujo determinístico (`flowDefinition.js` y `conversationOrchestrator.js`). Esto asegura que `ASK_NEED` sea completamente determinístico sin intervención de IA.

## Archivos Modificados

### 1. `flows/flowDefinition.js`
**Cambio**: Agregados handlers determinísticos para botones de problemas frecuentes en `ASK_NEED.onButton`

**Líneas modificadas**: ~230-258

**Cambios específicos**:
- Agregado mapeo `problemButtonMap` con los 6 problemas frecuentes
- Agregado handler para tokens: `BTN_NO_ENCIENDE`, `BTN_NO_INTERNET`, `BTN_LENTITUD`, `BTN_BLOQUEO`, `BTN_PERIFERICOS`, `BTN_VIRUS`
- Cada botón retorna `action: 'PROBLEMA_FRECUENTE'` con el problema guardado y avanza a `ASK_DEVICE`
- Agregado log: `[FLOW] ✅ Problema frecuente seleccionado en ASK_NEED`

### 2. `services/conversationOrchestrator.js`
**Cambios múltiples**:

#### a) `generateButtons()` - Líneas ~525-528
- Agregados 6 botones de problemas frecuentes a `defaultButtons[STAGES.ASK_NEED]`
- Mantiene orden: `BTN_PROBLEMA`, `BTN_CONSULTA`, luego los 6 problemas frecuentes

#### b) `validTokensForStage` - Líneas ~570-580
- Agregados los 6 tokens de problemas frecuentes a la lista de tokens válidos para `ASK_NEED`
- Esto previene que botones de otros stages aparezcan en `ASK_NEED`

#### c) `mapTokenToButton()` - Líneas ~629-635
- Agregado mapeo completo de los 6 tokens de problemas frecuentes
- Incluye labels y textos en español e inglés
- Mantiene consistencia con el formato existente

#### d) `buildResponse()` - Líneas ~320-325
- Agregado manejo de `action: 'PROBLEMA_FRECUENTE'`
- Guarda `session.problem` y `session.needType` cuando se selecciona un problema frecuente
- Agregado log: `[ORCHESTRATOR] ✅ Problema frecuente guardado`

#### e) `buildResponse()` - Líneas ~410-430
- Agregados logs de validación para stages determinísticos
- Detecta y reporta si aparecen botones de solución/diagnóstico en stages iniciales
- Log incluye: cantidad de botones, tokens, y detección de botones inválidos

### 3. `src/core/integrationPatch.js`
**Cambio**: Removida lógica de botones frecuentes de `handleWithIntelligence()`

**Líneas modificadas**: ~101-140

**Cambios específicos**:
- Removido bloque completo que manejaba `session.stage === 'ASK_NEED' && buttonToken`
- Reemplazado con comentario explicativo: `// ✅ REMOVIDO: La lógica de botones de problemas frecuentes en ASK_NEED ahora está en el flujo determinístico`

## Cómo se Evita que IA Toque Stages Determinísticos

### 1. Bypass en `handleWithIntelligence()`
```javascript
const deterministicStages = [
  'ASK_LANGUAGE',
  'ASK_NAME', 
  'ASK_NEED',  // ✅ Incluido
  'ASK_DEVICE',
  'ASK_KNOWLEDGE_LEVEL',
  'GDPR_CONSENT',
  'CONSENT'
];

if (session.stage && deterministicStages.includes(session.stage)) {
  return null; // Usar lógica legacy determinística
}
```

### 2. Bypass en `shouldUseIntelligentMode()`
```javascript
const deterministicStages = [
  'ASK_LANGUAGE',
  'ASK_NAME',
  'ASK_NEED',  // ✅ Incluido
  'ASK_DEVICE',
  'ASK_KNOWLEDGE_LEVEL',
  'GDPR_CONSENT',
  'CONSENT'
];

if (session && session.stage && deterministicStages.includes(session.stage)) {
  return false; // NO usar modo inteligente
}
```

### 3. Validación en `generateButtons()`
```javascript
const validTokensForStage = {
  [STAGES.ASK_NEED]: [
    'BTN_PROBLEMA', 
    'BTN_CONSULTA',
    'BTN_NO_ENCIENDE',      // ✅ Solo estos tokens son válidos
    'BTN_NO_INTERNET',
    'BTN_LENTITUD',
    'BTN_BLOQUEO',
    'BTN_PERIFERICOS',
    'BTN_VIRUS'
  ]
};
```

### 4. Limpieza de Botones
- El array de botones se limpia antes de generar nuevos (`let buttons = []`)
- Solo se aceptan botones válidos para el stage actual
- Botones inválidos se filtran y se registran en logs

## Pruebas Manuales

### Flujo: Consentimiento → Idioma → Nombre → ASK_NEED

1. **ASK_LANGUAGE**:
   - ✅ Debe mostrar SOLO: `BTN_LANG_ES_AR`, `BTN_LANG_EN`
   - ❌ NO debe mostrar: `BTN_SOLVED`, `BTN_PERSIST`, `BTN_ADVANCED_TESTS`, `BTN_MORE_TESTS`, `BTN_CONNECT_TECH`
   - ❌ NO debe mostrar: `BTN_BACK`, `BTN_CHANGE_TOPIC`, `BTN_MORE_INFO`

2. **ASK_NAME**:
   - ✅ Debe mostrar SOLO: `BTN_NO_NAME`
   - ❌ NO debe mostrar botones de solución/diagnóstico
   - ❌ NO debe mostrar navegación conversacional

3. **ASK_NEED**:
   - ✅ Debe mostrar: `BTN_PROBLEMA`, `BTN_CONSULTA`
   - ✅ Debe mostrar los 6 problemas frecuentes: `BTN_NO_ENCIENDE`, `BTN_NO_INTERNET`, `BTN_LENTITUD`, `BTN_BLOQUEO`, `BTN_PERIFERICOS`, `BTN_VIRUS`
   - ❌ NO debe mostrar: `BTN_SOLVED`, `BTN_PERSIST`, `BTN_ADVANCED_TESTS`
   - ❌ NO debe mostrar navegación conversacional

### Logs de Validación

Los logs mostrarán:
```
[ORCHESTRATOR] 🔒 Stage determinístico "ASK_NEED" - botones 100% determinísticos
[ORCHESTRATOR] ✅ Botones determinísticos para ASK_NEED: 8
[ORCHESTRATOR] ✅ VALIDACIÓN Stage determinístico "ASK_NEED": {
  buttonsCount: 8,
  buttonTokens: ['BTN_PROBLEMA', 'BTN_CONSULTA', 'BTN_NO_ENCIENDE', ...],
  hasSolutionButtons: false,
  hasNavigationButtons: false
}
```

Si aparecen botones inválidos:
```
[ORCHESTRATOR] ❌ ERROR: Botones de solución/diagnóstico en stage determinístico "ASK_NEED": ['BTN_SOLVED', ...]
```

## Compatibilidad con Sesiones Existentes

- ✅ No se modifican campos existentes en Redis
- ✅ Se agregan nuevos campos (`session.problem`) solo cuando se selecciona un problema frecuente
- ✅ Los tokens de botones mantienen el mismo formato (`BTN_*`)
- ✅ El frontend no requiere cambios (usa los mismos tokens)

## Resultado Esperado

1. ✅ `ASK_NEED` es 100% determinístico (sin IA)
2. ✅ Los botones de problemas frecuentes funcionan correctamente
3. ✅ No aparecen botones de solución/diagnóstico en `ASK_LANGUAGE` o `ASK_NAME`
4. ✅ El transcript, stage y botones están siempre alineados
5. ✅ Los logs permiten validar el comportamiento

