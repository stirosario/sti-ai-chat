# BUG CRÍTICO IDENTIFICADO: Flujo se reinicia en ASK_LANGUAGE

## Problema reportado por el usuario

Después de seleccionar el idioma correctamente, el bot avanza a ASK_NAME y pregunta el nombre.
Pero cuando el usuario responde con su nombre (ej: "Ivan"), el bot vuelve a ASK_LANGUAGE
y muestra el mensaje de error "⚠️ No entendí el idioma".

## Flujo observado (INCORRECTO)

```
Bot: 🌐 Para empezar, seleccioná un idioma
     🇦🇷 Español (Argentina) | 🌎 Español | 🇬🇧 English

User: 🇦🇷 Español (Argentina)

Bot: 👋 Hola, soy Tecnos...
     Para empezar: ¿cómo te llamás?
     [Prefiero no decirlo 🙅]
     
Stage: ASK_NAME ✅

User: Ivan

Bot: ⚠️ No entendí el idioma. Por favor, elegí una opción
     🇦🇷 Español (Argentina) | 🌎 Español | 🇬🇧 English
     
Stage: ASK_LANGUAGE ❌ (debería ser ASK_NEED)
```

## Flujo esperado (CORRECTO)

```
ASK_LANGUAGE → selecciona idioma → ASK_NAME → da nombre → ASK_NEED
```

## Causa raíz

**La sesión NO se está persisten do correctamente entre peticiones**.

Evidencia:
1. Primera petición (idioma): sessionId = srv-17639...abc123
2. Segunda petición (nombre): sessionId = srv-17639...def456 ← DIFERENTE!

Cada petición recibe un sessionId distinto, lo que significa que la validación
de sessionId está fallando y generando uno nuevo cada vez.

## Investigación realizada

### ✅ Verificado y funcionando:
- `sessionStore.js` con fallback a memoria funciona correctamente
- `validateSessionId()` valida correctamente los sessionIds (longitud 82, formato, timestamp)
- Los sessionIds tienen el formato correcto
- El handler de ASK_NAME existe y está bien implementado

### ❌ Problema identificado:
- El middleware `getSessionId()` está generando un NUEVO sessionId en cada petición
- Esto sucede porque `validateSessionId()` devuelve `false` para sessionIds válidos
- PERO los tests unitarios de `validateSessionId()` pasan correctamente

### 🔍 Hipótesis sobre la causa:

Hay una diferencia entre cómo se valida el sessionId en el test vs en el servidor real.

Posibles causas:
1. **El server.js tiene una versión antigua de `validateSessionId` cacheada** ← MÁS PROBABLE
2. El sessionId que llega al servidor tiene algún caracter extra/espacios
3. Hay un problema de encoding (UTF-8 vs ASCII)

## Solución propuesta

### Opción 1: Reiniciar completamente el servidor (recomendado)
```powershell
# Matar TODOS los procesos node
taskkill /F /IM node.exe /T

# Reiniciar el servidor
cd C:\sti-ai-chat
node server.js
```

### Opción 2: Agregar logging temporal para debugging
Agregar en `server.js` línea ~1543 (función `getSessionId`):

```javascript
function getSessionId(req){
  const h = sanitizeInput(req.headers['x-session-id'] || '', 128);
  const b = sanitizeInput(req.body?.sessionId || req.body?.sid || '', 128);
  const q = sanitizeInput(req.query?.sessionId || req.query?.sid || '', 128);
  
  const sid = h || b || q;
  
  // DEBUG: Log detallado
  if (sid) {
    console.log(`[getSessionId] Recibido: "${sid}" (length=${sid.length})`);
    const isValid = validateSessionId(sid);
    console.log(`[getSessionId] Validación: ${isValid}`);
    if (!isValid) {
      console.log(`[getSessionId] ⚠️  Generando NUEVO sessionId porque validación falló`);
    }
  }
  
  // Validate existing session ID
  if (sid && validateSessionId(sid)) {
    return sid;
  }
  
  // Generate new SECURE session ID
  const newSid = generateSecureSessionId();
  console.log(`[getSessionId] Generado nuevo: ${newSid.substring(0,20)}...`);
  return newSid;
}
```

### Opción 3: Simplificar validación temporalmente para debugging

Comentar temporalmente las validaciones estrictas en `validateSessionId`:

```javascript
function validateSessionId(sid) {
  if (!sid || typeof sid !== 'string') {
    console.log(`[validateSessionId] REJECT: not string or empty`);
    return false;
  }
  
  // TEMPORAL: aceptar cualquier sessionId con formato básico correcto
  if (sid.startsWith('srv-') && sid.length === 82) {
    console.log(`[validateSessionId] ACCEPT (temporal): ${sid.substring(0,20)}...`);
    return true;
  }
  
  /* COMENTADO TEMPORALMENTE
  if (sid.length !== 82) {
    console.log(`[validateSessionId] REJECT: length ${sid.length} (expected 82)`);
    return false;
  }
  
  const sessionIdRegex = /^srv-\d{13}-[a-f0-9]{64}$/;
  if (!sessionIdRegex.test(sid)) {
    console.log(`[validateSessionId] REJECT: format mismatch`);
    return false;
  }
  
  const timestamp = parseInt(sid.substring(4, 17));
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000;
  if (timestamp > now || timestamp < (now - maxAge)) {
    console.log(`[validateSessionId] REJECT: timestamp out of range`);
    return false;
  }
  */
  
  console.log(`[validateSessionId] REJECT: unknown reason`);
  return false;
}
```

## Prueba de verificación

Después de aplicar la solución, ejecutar:

```powershell
cd C:\sti-ai-chat
.\test_flow.ps1
```

Deberías ver:
- Primera interacción: Stage ASK_LANGUAGE → ASK_NAME ✅
- Segunda interacción: Stage ASK_NAME → ASK_NEED ✅ (no vuelve a ASK_LANGUAGE)
- El mismo sessionId en todas las peticiones de una conversación

## Archivos modificados en esta sesión

1. `server.js`:
   - Corregida longitud esperada de sessionId (81 → 82)
   - Agregado logging en `validateSessionId()`
   - Aumentado maxAge de 24h a 48h

2. `sessionStore.js`:
   - Agregado fallback a Map en memoria cuando Redis no está disponible
   - Mejora en logs de getSession/saveSession

3. `server.js` - CORS:
   - Agregado `http://localhost:3001` y `http://localhost:3002` a allowed origins

4. `test_flow.ps1`:
   - Script PowerShell para probar 4 conversaciones simuladas
   - Formato correcto de peticiones (action='button', value=token)

5. Archivos de test creados:
   - `test_session.js` - Verifica sessionStore
   - `test_validate.js` - Verifica validateSessionId
   - `test_flow.py` - Script Python (alternativa a PowerShell)

## Estado actual

⚠️  **EL BUG AÚN NO ESTÁ RESUELTO**

El problema de persistencia de sesiones persiste. Las sesiones NO se están recuperando
correctamente entre peticiones, causando que cada interacción genere un nuevo sessionId
y reinicie el flujo a ASK_LANGUAGE.

Se requiere:
1. Reiniciar completamente el servidor (matar procesos colgados)
2. Verificar con logs que `validateSessionId` está aceptando los sessionIds
3. Si sigue fallando, simplificar temporalmente la validación
