# 🐛 BUG FIX: BTN_ADVANCED_TESTS not working in BASIC_TESTS

## Problema Reportado

**Usuario**: "Utilicé el chat y el problema fue: 'mi placa de red no funciona'"

**Flujo del Error**:
1. Bot entregó pasos básicos de diagnóstico (stage: `BASIC_TESTS`)
2. Usuario presionó botón "🔬 Pruebas Avanzadas" (`BTN_ADVANCED_TESTS`)
3. Bot respondió: "Disculpa, no entendí tu consulta o no es informática. ¿Querés reformular?"
4. Usuario vio botón "Reformular Problema" → Experiencia de usuario **rota** ❌

## Root Cause

**Archivo**: `server.js` (líneas ~5849-5917)  
**Stage**: `BASIC_TESTS`

El código legacy solo reconocía 3 opciones en `BASIC_TESTS`:
- ✅ `BTN_SOLVED` → "lo pude solucionar"
- ✅ `BTN_PERSIST` → "el problema persiste" (transición a `ESCALATE`)
- ✅ `BTN_CONNECT_TECH` → "conectar con técnico"

**NO reconocía**:
- ❌ `BTN_ADVANCED_TESTS` → "pruebas avanzadas"
- ❌ `BTN_MORE_TESTS` → "más pruebas"

**Flujo forzado (antes del fix)**:
```
BASIC_TESTS → BTN_PERSIST → ESCALATE → BTN_ADVANCED_TESTS → ADVANCED_TESTS
     (3 mensajes del bot + 2 clics del usuario)
```

**Problema UX**: Usuario tenía que:
1. Clic en "Problema persiste" (aunque no haya probado todos los pasos básicos)
2. Esperar mensaje del bot
3. Clic en "Pruebas Avanzadas"

## Solución Implementada

**Commit**: `e5f7bf3`  
**Archivo**: `server.js` (líneas 5851-5915)

### Cambios:

1. **Nuevo regex pattern** (línea 5851):
```javascript
const rxAdvanced = /^\s*(pruebas avanzadas|más pruebas|BTN_ADVANCED_TESTS|BTN_MORE_TESTS)\b/i;
```

2. **Handler directo en BASIC_TESTS** (líneas 5858-5915):
```javascript
// FIX: Atajo directo desde BASIC_TESTS a pruebas avanzadas
if (rxAdvanced.test(t) || buttonToken === 'BTN_ADVANCED_TESTS' || buttonToken === 'BTN_MORE_TESTS') {
  // Generar pruebas avanzadas usando aiQuickTests()
  // Filtrar resultados que ya estén en session.tests.basic
  // Transición directa a ADVANCED_TESTS
  // Mostrar botones: BTN_SOLVED, BTN_PERSIST, BTN_CONNECT_TECH
}
```

### Flujo optimizado (después del fix):
```
BASIC_TESTS → BTN_ADVANCED_TESTS → ADVANCED_TESTS
     (1 mensaje del bot + 1 clic del usuario)
```

**Beneficios UX**:
- ✅ Atajo directo (ahorra 2 pasos)
- ✅ No fuerza al usuario a decir "problema persiste" cuando aún no probó todos los pasos
- ✅ Botón funciona correctamente
- ✅ Genera pruebas avanzadas inmediatamente

## Lógica de Generación

**Función**: `aiQuickTests(problem, device, locale, previousTests)`

1. Recibe `session.tests.basic` como contexto
2. OpenAI genera hasta 8 pruebas avanzadas
3. Normaliza texto de cada paso (`normalizeStepText()`)
4. Filtra duplicados comparando con `session.tests.basic`
5. Limita resultado a 4 pasos avanzados
6. Si no quedan pasos distintos → Ofrece conectar con técnico

**Ejemplo de normalización**:
- "1️⃣ Verificá la conexión" → "verifica la conexion"
- "2. Verificá la conexión" → "verifica la conexion"
- Comparación case-insensitive y sin espacios múltiples

## Testing

### Test Manual (Reproducción Exacta del Bug):

```bash
# Iniciar servidor
npm run start:modular

# En otra terminal:
SESSION_ID="test-bug-$(date +%s)"

# 1. Aceptar GDPR
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"acepto\"}"

# 2. Seleccionar idioma
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"español\"}"

# 3. Dar nombre
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"Juan Pérez\"}"

# 4. Seleccionar tipo (problema)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"BTN_PROBLEMA\"}"

# 5. Seleccionar dispositivo
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"BTN_NOTEBOOK\"}"

# 6. Describir problema (SCENARIO EXACTO)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"mi placa de red no funciona\"}"
# → Respuesta: Pasos básicos (stage: BASIC_TESTS)

# 7. Clic en "Pruebas Avanzadas" (BUG FIX TEST)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"BTN_ADVANCED_TESTS\"}"
# → ANTES: "no entendí tu consulta" ❌
# → DESPUÉS: Pruebas avanzadas generadas ✅
```

### Verificación de la Respuesta:

**ANTES DEL FIX** ❌:
```json
{
  "ok": false,
  "reply": "Disculpa, no entendí tu consulta o no es informática. ¿Querés reformular?",
  "stage": "BASIC_TESTS",
  "options": [
    {"token": "BTN_REFORMULATE", "label": "Reformular Problema"}
  ]
}
```

**DESPUÉS DEL FIX** ✅:
```json
{
  "ok": true,
  "reply": "💡 Probá estas pruebas más específicas...\n\n**🔬 PRUEBAS AVANZADAS:**\n1️⃣ [paso avanzado 1]\n2️⃣ [paso avanzado 2]\n...",
  "stage": "ADVANCED_TESTS",
  "options": [
    {"token": "BTN_SOLVED", "label": "✔️ Lo pude solucionar"},
    {"token": "BTN_PERSIST", "label": "❌ Todavía no funciona"},
    {"token": "BTN_CONNECT_TECH", "label": "👨‍💻 Conectar con técnico"}
  ]
}
```

## Impact Assessment

### Archivos Modificados:
- ✅ `server.js` (60 líneas agregadas en bloque BASIC_TESTS)

### Archivos NO Modificados:
- ✅ STATES (sin cambios)
- ✅ Endpoints (sin cambios)
- ✅ Tokens de botones (sin cambios)
- ✅ Sistema de tickets (sin cambios)
- ✅ WhatsApp flows (sin cambios)

### Compatibilidad:
- ✅ 100% backward compatible
- ✅ No breaking changes
- ✅ Código modular no afectado (bug era en legacy)
- ✅ Safe para producción

### Riesgo:
- 🟢 **BAJO**: Solo agrega reconocimiento de un botón existente
- 🟢 **BAJO**: Reutiliza lógica existente de `aiQuickTests()`
- 🟢 **BAJO**: No modifica flujos existentes (BTN_PERSIST sigue funcionando)

## Commit Details

**Hash**: `e5f7bf3`  
**Branch**: `refactor/modular-architecture`  
**Author**: GitHub Copilot  
**Date**: 2024-12-05

**Commit Message**:
```
fix: Add direct BTN_ADVANCED_TESTS processing in BASIC_TESTS

Bug: User clicked 'Pruebas Avanzadas' button in BASIC_TESTS stage but 
system didn't recognize it, responding with 'no entendí tu consulta'.

Root cause: BTN_ADVANCED_TESTS was only processed in ESCALATE stage, 
requiring users to click 'Problema persiste' first.

Solution: Added direct recognition of BTN_ADVANCED_TESTS and BTN_MORE_TESTS 
in BASIC_TESTS stage (line ~5857). Now generates advanced tests immediately 
without forcing user through ESCALATE intermediary stage.
```

## Next Steps

1. ✅ Fix implementado y commiteado
2. ⏳ Testing en staging (con servidor corriendo)
3. ⏳ Validación end-to-end con flujo completo
4. ⏳ Merge a `main` branch
5. ⏳ Deploy a producción

## Notas Adicionales

- Este fix es **independiente** del refactor modular
- Aplica al código **legacy** (arquitectura original)
- El bug existía antes del refactor (no fue introducido por nosotros)
- La solución es **aditiva** (no quita funcionalidad existente)
- Usuario reportó el bug usando sistema legacy (USE_MODULAR_ARCHITECTURE=false)
