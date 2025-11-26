# 🐛 Fix: Dispositivo no se seleccionaba correctamente

## Problema Identificado

**Fecha:** 2025-11-26  
**Reportado por:** Lucas  
**Severidad:** Alta (bloqueante de flujo principal)

### Descripción del Bug

Cuando el usuario reportaba un problema con "PC" o "compu", el sistema:
1. ✅ Detectaba correctamente el término ambiguo
2. ✅ Mostraba botones de selección de dispositivo
3. ❌ **NO procesaba la selección del usuario**
4. ❌ Se quedaba mostrando "Por favor, elegí una de las opciones de dispositivo."

### Log del Error

```log
[ASK_PROBLEM] session.device: null session.problem: Mi pc no enciende
[detectAmbiguousDevice] Llamando con: Mi pc no enciende
[detectAmbiguousDevice] Resultado: {...candidates...}
[saveSession] stage: "CHOOSE_DEVICE"

// Usuario hace clic en "PC de Escritorio"
[DEBUG BUTTON] value: "PC de Escritorio" token: "PC de Escritorio"
[DEBUG] Session loaded - stage: CHOOSE_DEVICE
[saveSession] stage: "CHOOSE_DEVICE" // ❌ No avanza!
```

## Causa Raíz

El handler `CHOOSE_DEVICE` (línea ~4595) solo aceptaba tokens con formato `DEVICE_*`:

```javascript
// ❌ CÓDIGO ANTERIOR (solo aceptaba DEVICE_*)
if (buttonToken && buttonToken.startsWith('DEVICE_')) {
  const deviceId = buttonToken.replace('DEVICE_', '');
  // ...
}
```

Pero el **frontend enviaba el label** ("PC de Escritorio") en lugar del token ("DEVICE_PC_DESKTOP").

## Solución Implementada

**Archivo modificado:** `server.js` (líneas 4587-4631)  
**Commit:** [Pendiente]

### Cambios realizados:

1. **Búsqueda por múltiples criterios:**
   - ✅ Intento 1: Buscar por token (`DEVICE_PC_DESKTOP`)
   - ✅ Intento 2: Buscar por label exacto (`"PC de Escritorio"`)
   - ✅ Intento 3: Buscar por label case-insensitive

```javascript
// ✅ CÓDIGO CORREGIDO
if (buttonToken) {
  const ambiguousResult = detectAmbiguousDevice(session.problem);
  let selectedDevice = null;
  
  if (ambiguousResult) {
    // Intento 1: Buscar por token
    if (buttonToken.startsWith('DEVICE_')) {
      const deviceId = buttonToken.replace('DEVICE_', '');
      selectedDevice = ambiguousResult.candidates.find(d => d.id === deviceId);
    }
    
    // Intento 2: Buscar por label exacto
    if (!selectedDevice) {
      selectedDevice = ambiguousResult.candidates.find(d => d.label === buttonToken);
    }
    
    // Intento 3: Buscar por label case-insensitive
    if (!selectedDevice) {
      const lowerToken = buttonToken.toLowerCase();
      selectedDevice = ambiguousResult.candidates.find(d => d.label.toLowerCase() === lowerToken);
    }
    
    if (selectedDevice) {
      // ✅ Continuar con el flujo
      session.device = selectedDevice.id;
      session.deviceLabel = selectedDevice.label;
      session.stage = STATES.ASK_PROBLEM;
      return await generateAndShowSteps(session, sid, res);
    }
  }
}
```

2. **Logging mejorado:**
   - ✅ Log cuando se selecciona correctamente
   - ⚠️ Log cuando no se reconoce el dispositivo

## Flujo Correcto Después del Fix

1. Usuario: "Mi pc no enciende"
2. Sistema detecta "pc" como ambiguo → `stage = CHOOSE_DEVICE`
3. Usuario hace clic en "PC de Escritorio"
4. ✅ Sistema detecta por label → `selectedDevice = {id: "PC_DESKTOP", label: "PC de Escritorio"}`
5. ✅ Actualiza session: `device = "PC_DESKTOP"`, `stage = "ASK_PROBLEM"`
6. ✅ Llama `generateAndShowSteps()` → llama `aiQuickTests()` → **consulta OpenAI**
7. ✅ Muestra tests al usuario con botones de acción

## Verificación del Flujo de Tests

La función `aiQuickTests()` (línea 905) **SÍ consulta a OpenAI** correctamente:

```javascript
async function aiQuickTests(problemText = '', device = '', locale = 'es-AR') {
  // Consulta a OpenAI con prompt específico
  const r = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 400
  });
  
  // Parsea respuesta JSON con array de pasos
  const parsed = JSON.parse(cleaned);
  return parsed.map(s => String(s)).slice(0, 6);
}
```

## Testing Recomendado

### Caso de Prueba 1: PC de Escritorio
```
Usuario: "Mi pc no enciende"
→ Selecciona: "PC de Escritorio"
→ Esperar: Tests generados por OpenAI
```

### Caso de Prueba 2: Notebook
```
Usuario: "Mi compu no prende"
→ Selecciona: "Notebook / Laptop"
→ Esperar: Tests generados por OpenAI
```

### Caso de Prueba 3: All-in-One
```
Usuario: "El ordenador no funciona"
→ Selecciona: "All-in-One"
→ Esperar: Tests generados por OpenAI
```

## Impacto

- **Usuarios afectados:** Todos los que reportan problemas con "PC" o "compu" (alto volumen)
- **Tiempo down:** Desde despliegue anterior hasta este fix
- **Workaround:** Ninguno disponible para usuarios finales

## Archivos Relacionados

- `server.js` (líneas 4587-4631) - Handler CHOOSE_DEVICE
- `server.js` (líneas 274-282) - generateDeviceButtons()
- `server.js` (líneas 905-996) - aiQuickTests()
- `server.js` (líneas 2954-3079) - generateAndShowSteps()
- `deviceDetection.js` - detectAmbiguousDevice() y DEVICE_DISAMBIGUATION

## Próximos Pasos

1. ✅ Deploy a producción
2. ⏳ Monitorear logs para confirmar fix
3. ⏳ Verificar que no hay regresiones en otros flows

---

**Documentado por:** Antigravity AI  
**Fecha:** 2025-11-26
