# Corrección: ASK_NAME NO Debe Mostrar Botones

## Problema Identificado

### Síntomas
1. En `ASK_NAME` se mostraban 4 botones inválidos:
   - `BTN_SOLVED` (Lo pude solucionar ✔️)
   - `BTN_PERSIST` (El problema persiste ❌)
   - `BTN_ADVANCED_TESTS` (🔬 Pruebas Avanzadas)
   - `BTN_CLOSE` (🔚 Cerrar Chat)

2. El frontend aparentaba enviar `BTN_CONNECT_TECH` (según logs de consola)

3. El historial/admin.php mostraba stages incorrectos

### Causa Raíz

**PRINCIPAL**: Múltiples capas permitían que botones inválidos se colaran:

1. **flowDefinition.js**: `ASK_NAME` tenía `buttons: ['BTN_NO_NAME']` en las respuestas de selección de idioma
2. **generateButtons()**: `defaultButtons[ASK_NAME]` incluía `BTN_NO_NAME`
3. **validTokensForStage**: Permitía `BTN_NO_NAME` como válido para `ASK_NAME`
4. **Falta de HARD RULE**: No había validación forzada que garantizara `buttons = []` para `ASK_NAME`

**NOTA**: El log "📤 Enviando BTN_CONNECT_TECH al servidor" es engañoso. El código real muestra:
```javascript
console.log('📤 Enviando botón al servidor:', { buttonValue: b.dataset.value, ... });
```

Este log muestra el valor REAL del botón clickeado, no necesariamente `BTN_CONNECT_TECH`. El problema era que el backend devolvía botones inválidos que luego se renderizaban.

## Soluciones Implementadas

### 1. HARD RULE: ASK_NAME NO Debe Mostrar Botones

**Archivo**: `sti-ai-chat/services/conversationOrchestrator.js`

**Cambio 1** - En `generateButtons()` (línea ~659):
```javascript
[STAGES.ASK_NAME]: [], // ✅ HARD RULE: ASK_NAME NO debe mostrar botones (solo texto)
```

**Cambio 2** - En `buildResponse()` (líneas ~463-468):
```javascript
// ✅ HARD RULE: ASK_NAME NO debe mostrar botones (solo texto)
// Forzar buttons = [] para ASK_NAME aunque llegue cualquier fallback
if (nextStage === STAGES.ASK_NAME) {
  buttons = [];
  console.log('[ORCHESTRATOR] ✅ HARD RULE: ASK_NAME - forzando buttons = [] (solo texto)');
}
```

**Cambio 3** - En validación de tokens inválidos (líneas ~726-728):
```javascript
const validTokensForStage = {
  [STAGES.ASK_NAME]: [], // ✅ HARD RULE: ASK_NAME NO acepta ningún botón (solo texto)
  ...
};
```

**Cambio 4** - En filtrado de botones inválidos (líneas ~740-746):
```javascript
// ✅ CRÍTICO: Si validTokens.length === 0 (ej: ASK_NAME), remover TODOS los botones
if (validTokens.length === 0) {
  if (buttons.length > 0) {
    console.warn(`[ORCHESTRATOR] ⚠️ ${currentStage} NO acepta botones - removidos ${buttons.length} botones inválidos`);
    buttons = [];
  }
}
```

### 2. flowDefinition.js: Remover BTN_NO_NAME de ASK_NAME

**Archivo**: `sti-ai-chat/flows/flowDefinition.js`

**Cambio 1** - En transición ASK_LANGUAGE → ASK_NAME (líneas ~145, ~155):
```javascript
buttons: [], // ✅ HARD RULE: ASK_NAME NO debe mostrar botones (solo texto)
```

**Cambio 2** - En handler `onButton` de `ASK_NAME` (líneas ~197-204):
```javascript
onButton: ({ token }) => {
  // ✅ HARD RULE: ASK_NAME NO acepta botones (solo texto)
  // Si llega cualquier token, rechazarlo y mantener en ASK_NAME sin botones
  console.warn(`[FLOW] ⚠️ ASK_NAME rechazó token "${token}" - ASK_NAME solo acepta texto`);
  return { 
    action: 'UNKNOWN_BUTTON', 
    nextStage: 'ASK_NAME',
    buttons: [] // ✅ Asegurar que no se devuelvan botones
  };
}
```

### 3. Validación Estricta: Rechazar Cualquier Token en ASK_NAME

**Archivo**: `sti-ai-chat/services/conversationOrchestrator.js`

**Cambio** (líneas ~239-280):
```javascript
const validTokens = validTokensForStage[currentStage] || [];
// ✅ CRÍTICO: Si validTokens.length === 0 (ej: ASK_NAME), rechazar CUALQUIER token
const shouldReject = validTokens.length === 0 || !validTokens.includes(buttonToken);

if (shouldReject) {
  // Rechazar token y retornar respuesta con buttons: []
  // Mensaje específico para ASK_NAME
  if (currentStage === STAGES.ASK_NAME) {
    rejectMessage = isEn
      ? 'Please type your name in the text field.'
      : 'Por favor escribí tu nombre en el campo de texto.';
  }
  return {
    ...
    options: [],
    ui: { buttons: [] },
    ...
  };
}
```

### 4. Frontend: Aclaración en Log

**Archivo**: `c:\STI\public_html\index.php`

**Cambio** (línea ~1983):
```javascript
// ✅ Log correcto: mostrar el valor real del botón que se envía
// IMPORTANTE: No confundir con BTN_CONNECT_TECH - este log muestra el valor REAL del botón clickeado
console.log('📤 Enviando botón al servidor:', { 
  buttonValue: b.dataset.value, 
  buttonLabel: title.textContent,
  sessionId: SESSION_ID 
});
```

## Resultado Esperado

### Flujo: Consentimiento → Idioma → Nombre

1. **ASK_LANGUAGE**:
   - ✅ Muestra: `BTN_LANG_ES_AR`, `BTN_LANG_EN`
   - ❌ NO muestra botones de solución

2. **ASK_NAME** (DESPUÉS de seleccionar idioma):
   - ✅ Muestra: **CERO botones** (solo texto)
   - ✅ Mensaje: "¿Con quién tengo el gusto de hablar? 😊"
   - ❌ NO muestra: `BTN_SOLVED`, `BTN_PERSIST`, `BTN_ADVANCED_TESTS`, `BTN_CLOSE`, `BTN_NO_NAME`
   - ✅ Si se envía cualquier token, se rechaza y se mantiene en ASK_NAME sin botones

3. **ASK_NEED** (DESPUÉS de ingresar nombre):
   - ✅ Muestra: `BTN_PROBLEMA`, `BTN_CONSULTA`, + 6 problemas frecuentes

## Archivos Modificados

1. **Backend**:
   - `sti-ai-chat/services/conversationOrchestrator.js`:
     - `generateButtons()`: `defaultButtons[ASK_NAME] = []`
     - `buildResponse()`: HARD RULE que fuerza `buttons = []` para ASK_NAME
     - Validación de tokens: Rechaza cualquier token en ASK_NAME
     - Filtrado de botones: Remueve todos los botones si `validTokens.length === 0`
   
   - `sti-ai-chat/flows/flowDefinition.js`:
     - Transiciones ASK_LANGUAGE → ASK_NAME: `buttons: []`
     - Handler `onButton` de ASK_NAME: Rechaza cualquier token

2. **Frontend**:
   - `c:\STI\public_html\index.php`:
     - Aclaración en log para evitar confusión

## Validación

### Pruebas Manuales

1. **Flujo**: Abrir chat → "si" → "español"
   - ✅ En `ASK_NAME` NO debe aparecer ningún botón
   - ✅ Solo debe mostrar el mensaje de texto
   - ✅ En consola NO debe aparecer "Enviando BTN_CONNECT_TECH" (solo valores reales)

2. **Validación de tokens**:
   - ✅ Si se intenta enviar cualquier token a `ASK_NAME`, se rechaza
   - ✅ Se mantiene en `ASK_NAME` sin botones
   - ✅ Se registra en transcript para auditoría

3. **Admin.php**:
   - ✅ Stage `ASK_NAME` visible
   - ✅ Input "español" registrado en stage correcto
   - ✅ Respuesta de ASK_NAME con `buttons: []`

### Logs de Validación

```
[ORCHESTRATOR] ✅ HARD RULE: ASK_NAME - forzando buttons = [] (solo texto)
[ORCHESTRATOR] ✅ Botones determinísticos para ASK_NAME: 0
[FLOW] ⚠️ ASK_NAME rechazó token "BTN_SOLVED" - ASK_NAME solo acepta texto
[ORCHESTRATOR] ❌ AUDITORÍA: Token inválido "BTN_SOLVED" en stage determinístico "ASK_NAME"
[ORCHESTRATOR] ❌ ASK_NAME NO acepta botones (solo texto)
```

## Notas Adicionales

- **Defensa en profundidad**: Múltiples capas garantizan que ASK_NAME nunca muestre botones:
  1. `flowDefinition.js`: No define botones para ASK_NAME
  2. `generateButtons()`: `defaultButtons[ASK_NAME] = []`
  3. `buildResponse()`: HARD RULE fuerza `buttons = []`
  4. Validación de tokens: Rechaza cualquier token
  5. Filtrado final: Remueve botones si `validTokens.length === 0`

- **Compatibilidad**: Los cambios son retrocompatibles. Si hay sesiones existentes en Redis con `BTN_NO_NAME`, se rechazará correctamente.

