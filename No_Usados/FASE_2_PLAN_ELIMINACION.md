# 🗑️ Fase 2 - Plan de Eliminación Segura de Código Legacy

## ⚠️ IMPORTANTE: NO ELIMINAR HASTA DESPUÉS DE TESTING

Este documento lista el código que **puede eliminarse** después de verificar que los nuevos módulos funcionan correctamente en producción.

## 📋 CÓDIGO LEGACY PARA ELIMINAR (Después de Testing)

### 1. Bloques con `if(false)` - ASK_NAME Legacy
**Ubicación:** `server.js` línea ~5809
**Estado:** Deshabilitado con `if(false && session.stage === STATES.ASK_NAME)`
**Acción:** Eliminar después de verificar que `handlers/nameHandler.js` funciona
**Riesgo:** Bajo (ya deshabilitado)

### 2. Bloques con `if(false)` - ASK_LANGUAGE Legacy
**Ubicación:** `server.js` línea ~5517
**Estado:** Deshabilitado con `if(false && session.stage === STATES.ASK_LANGUAGE)`
**Acción:** Eliminar después de verificar que `handlers/stageHandlers.js` funciona
**Riesgo:** Bajo (ya deshabilitado)

### 3. Bloques con `if(false)` - ASK_NEED Legacy
**Ubicación:** `server.js` línea ~5655
**Estado:** Deshabilitado con `if(false && session.stage === STATES.ASK_NEED)`
**Acción:** Eliminar (ya no se usa, manejado por sistema inteligente)
**Riesgo:** Muy bajo (nunca se ejecuta)

### 4. Funciones Duplicadas - Validación de Nombres
**Ubicación:** `server.js` líneas ~1259-1416
**Funciones:**
- `capitalizeToken()` - Ya en `handlers/nameHandler.js`
- `isValidName()` - Ya en `handlers/nameHandler.js`
- `extractName()` - Ya en `handlers/nameHandler.js`
- `looksClearlyNotName()` - Ya en `handlers/nameHandler.js`
- `analyzeNameWithOA()` - Ya en `handlers/nameHandler.js`

**Acción:** 
1. Verificar que todas las referencias usan imports
2. Reemplazar referencias por imports
3. Eliminar funciones duplicadas

**Riesgo:** Medio (verificar todas las referencias primero)

### 5. Funciones Duplicadas - Helpers
**Ubicación:** `server.js` líneas ~3941-4055
**Funciones:**
- `buildTimeGreeting()` - Ya en `utils/helpers.js`
- `buildLanguagePrompt()` - Ya en `utils/helpers.js`
- `buildNameGreeting()` - Ya en `utils/helpers.js`

**Acción:**
1. Verificar que todas las referencias usan imports
2. Reemplazar referencias por imports
3. Eliminar funciones duplicadas

**Riesgo:** Bajo (funciones simples, ya marcadas)

## ✅ CHECKLIST ANTES DE ELIMINAR

Antes de eliminar cualquier código, verificar:

- [ ] ✅ Fix de ASK_NAME probado en producción
- [ ] ✅ Handler ASK_LANGUAGE probado en producción
- [ ] ✅ ImageProcessor probado en producción
- [ ] ✅ No hay errores en logs de producción
- [ ] ✅ Todas las referencias usan imports
- [ ] ✅ Tests manuales pasan
- [ ] ✅ Backup del código legacy guardado

## 🔍 BÚSQUEDA DE REFERENCIAS

Para cada función duplicada, buscar referencias:

```bash
# Buscar referencias a capitalizeToken
grep -r "capitalizeToken" server.js

# Buscar referencias a buildTimeGreeting
grep -r "buildTimeGreeting" server.js

# Buscar referencias a buildLanguagePrompt
grep -r "buildLanguagePrompt" server.js
```

## 📝 ORDEN RECOMENDADO DE ELIMINACIÓN

1. **Primero:** Eliminar bloques `if(false)` de ASK_NEED (nunca se ejecuta)
2. **Segundo:** Eliminar bloques `if(false)` de ASK_NAME (después de testing)
3. **Tercero:** Eliminar bloques `if(false)` de ASK_LANGUAGE (después de testing)
4. **Cuarto:** Reemplazar funciones helper por imports
5. **Quinto:** Eliminar funciones de validación de nombres (después de verificar referencias)

## ⚠️ ADVERTENCIAS

- **NO eliminar** código que aún se usa
- **NO eliminar** funciones sin verificar todas las referencias
- **Siempre** mantener backup antes de eliminar
- **Siempre** probar en staging antes de producción

---

*Documento creado: 2025-12-06*
*Estado: Preparado para Fase 2 - Esperando testing*
