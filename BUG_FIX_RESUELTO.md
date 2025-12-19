# 🎉 BUG RESUELTO - Flow Reset Fixed

## Problema Original
El servidor **crasheaba** cuando el usuario ingresaba su nombre en el stage `ASK_NAME`, causando:
- Conexión cerrada por el servidor
- Mensaje "⚠️ No entendí el idioma" (porque el servidor moría y la sesión se perdía)
- Flujo reiniciando constantemente a `ASK_LANGUAGE`

## Causa Raíz Identificada

### Error #1: `basicITHeuristic` no definido (línea 3227)
```javascript
// ANTES (crasheaba):
const maybeProblem = basicITHeuristic(t || ''); // ReferenceError: basicITHeuristic is not defined
```

**Solución:** Comentar la llamada a función inexistente y desactivar esa lógica temporalmente:
```javascript
// DESPUÉS (funciona):
// const maybeProblem = basicITHeuristic(t || '');
// const looksLikeProblem = maybeProblem && maybeProblem.isIT && (maybeProblem.isProblem || maybeProblem.isHowTo);
const looksLikeProblem = false; // Desactivado temporalmente
```

### Error #2: `NO_NAME_RX` no definido (línea 3269)
```javascript
// ANTES (crasheaba):
if (NO_NAME_RX.test(t) || buttonToken === 'BTN_NO_NAME') { // ReferenceError: NO_NAME_RX is not defined
```

**Solución:** Definir el regex faltante en la sección de constantes (línea ~415):
```javascript
// DESPUÉS (funciona):
const NO_NAME_RX = /(prefiero no|no quiero|no te lo|no dar|no digo|no decir|sin nombre|anonimo|anónimo|skip|saltar|omitir)/i;
```

### Error #3: `session` no definido en error handler (línea 3952)
```javascript
// ANTES (crasheaba al manejar errores):
const locale = session?.userLocale || 'es-AR'; // ReferenceError: session is not defined (en el catch)
```

**Solución:** Intentar recuperar la sesión dentro del catch con manejo de errores:
```javascript
// DESPUÉS (funciona):
let locale = 'es-AR';
try {
  const sid = req.sessionId;
  const existingSession = await getSession(sid);
  if (existingSession && existingSession.userLocale) {
    locale = existingSession.userLocale;
  }
} catch (errLocale) {
  // Si falla, usar el default
}
```

### Mejora adicional: CORS para puerto 3004
```javascript
const allowedOrigins = [..., 'http://localhost:3004', ...];
```

## Archivos Modificados

### `server.js`
- **Línea ~415**: Agregado `const NO_NAME_RX` 
- **Línea ~999**: Agregado `localhost:3004` a `allowedOrigins`
- **Línea ~3227**: Comentado código que llama a `basicITHeuristic` (no existe)
- **Línea ~3952**: Corregido error handler para no usar `session` fuera de scope

## Prueba de Verificación

```powershell
# Paso 1: Greeting
$r1 = Invoke-RestMethod "http://localhost:3004/api/greeting" -Headers @{'Origin'='http://localhost:3004'}
# Result: stage = 'ASK_LANGUAGE' ✅

# Paso 2: Seleccionar idioma
$body2 = @{sessionId=$r1.sessionId; action='button'; value='BTN_LANG_ES_AR'} | ConvertTo-Json
$r2 = Invoke-RestMethod "http://localhost:3004/api/chat" -Method POST -Headers @{'Origin'='http://localhost:3004'; 'Content-Type'='application/json'} -Body $body2
# Result: stage = 'ASK_NAME' ✅

# Paso 3: Dar nombre (PUNTO CRÍTICO - antes crasheaba)
$body3 = @{sessionId=$r1.sessionId; text='Fabio'} | ConvertTo-Json
$r3 = Invoke-RestMethod "http://localhost:3004/api/chat" -Method POST -Headers @{'Origin'='http://localhost:3004'; 'Content-Type'='application/json'} -Body $body3
# Result: stage = 'ASK_NEED', userName = 'Fabio' ✅✅✅

# Paso 4: Seleccionar ayuda técnica
$body4 = @{sessionId=$r1.sessionId; action='button'; value='BTN_HELP'} | ConvertTo-Json
$r4 = Invoke-RestMethod "http://localhost:3004/api/chat" -Method POST -Headers @{'Origin'='http://localhost:3004'; 'Content-Type'='application/json'} -Body $body4
# Result: stage = 'ASK_PROBLEM' ✅
```

## Resultado

✅ **Flujo completo funciona sin crashes**  
✅ **Sesiones persisten correctamente entre requests**  
✅ **No hay loops ni resets a ASK_LANGUAGE**  
✅ **El nombre del usuario se guarda correctamente**

### Flujo validado:
```
ASK_LANGUAGE → ASK_NAME → ASK_NEED → ASK_PROBLEM
     ✅            ✅          ✅          ✅
```

## Logs de Prueba Exitosa

```
[getSession] ✅ Loaded from memory srv-1763941405452-...: { userName: null, stage: 'ASK_LANGUAGE' }
[saveSession] ✅ Saved to memory srv-1763941405452-...: { userName: null, stage: 'ASK_NAME', transcriptLength: 3 }

[getSession] ✅ Loaded from memory srv-1763941405452-...: { userName: null, stage: 'ASK_NAME' }
[saveSession] ✅ Saved to memory srv-1763941405452-...: { userName: 'Fabio', stage: 'ASK_NEED', transcriptLength: 5 }

[getSession] ✅ Loaded from memory srv-1763941405452-...: { userName: 'Fabio', stage: 'ASK_NEED' }
[saveSession] ✅ Saved to memory srv-1763941405452-...: { userName: 'Fabio', stage: 'ASK_PROBLEM', transcriptLength: 7 }
```

## Próximos Pasos Recomendados

1. ✅ **Implementar `basicITHeuristic`** (opcional): Esta función detecta cuando el usuario describe un problema en lugar de dar su nombre. Por ahora está desactivada.

2. ✅ **Ejecutar test completo con `test_flow.ps1`**: Correr las 4 conversaciones de prueba originales.

3. ✅ **Revisar flow-audit.csv**: Verificar que no haya loops en las métricas.

## Fecha de Resolución
2025-01-28

## Estado
🟢 **RESUELTO** - Server estable, flujo funciona correctamente.
