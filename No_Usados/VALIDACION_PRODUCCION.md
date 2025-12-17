# ✅ VALIDACIÓN DE CONFIGURACIÓN DE PRODUCCIÓN

**Fecha**: 2025-12-07  
**Estado**: Validaciones implementadas

---

## 🔒 VALIDACIONES IMPLEMENTADAS

### 1. ✅ NODE_ENV=production

**Validación**: El servidor verifica que `NODE_ENV=production` esté configurado.

**Comportamiento**:
- Si `NODE_ENV !== 'production'`: Solo advierte (modo desarrollo)
- Si `NODE_ENV === 'production'`: Valida estrictamente todas las variables críticas

**Ubicación**: Inicio de `server.js` (línea ~220)

---

### 2. ✅ LOG_TOKEN Obligatorio en Producción

**Validación**: En producción, `LOG_TOKEN` es **OBLIGATORIO**.

**Comportamiento**:
- Si falta `LOG_TOKEN` en producción → `process.exit(1)` (servidor no arranca)
- Mensaje claro de error con instrucciones
- En desarrollo: genera token aleatorio si no está configurado

**Ubicación**: `server.js` línea ~805

**Generar token seguro**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 3. ✅ ALLOWED_ORIGINS Obligatorio en Producción

**Validación**: En producción, `ALLOWED_ORIGINS` es **OBLIGATORIO**.

**Comportamiento**:
- Si falta `ALLOWED_ORIGINS` en producción → `process.exit(1)` (servidor no arranca)
- Muestra lista de dominios configurados al arrancar
- En desarrollo: usa valores por defecto si no está configurado

**Ubicación**: `server.js` línea ~220

**Formato**:
```bash
ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com
```

---

### 4. ✅ OPENAI_API_KEY (Recomendado)

**Validación**: `OPENAI_API_KEY` es **recomendado** pero no crítico.

**Comportamiento**:
- Si falta en producción: Advierte pero no bloquea el arranque
- Funciones de IA avanzadas estarán deshabilitadas sin la key
- Muestra estado claro en logs de arranque

**Ubicación**: `server.js` línea ~220

---

### 5. ✅ Límite de 10 Usuarios Concurrentes

**Validación**: Confirma que `MAX_CONCURRENT_USERS = 10` en `constants.js`.

**Comportamiento**:
- Lee `MAX_CONCURRENT_USERS` de `constants.js`
- Si no es 10, advierte en logs
- Usa fallback de 10 si no está definido
- Muestra confirmación en logs al arrancar

**Ubicación**: 
- Constante: `constants.js` línea 28
- Validación: `server.js` línea ~2650

---

### 6. ✅ Cola de Imágenes Deshabilitada

**Confirmación**: No hay cola de imágenes implementada.

**Verificación**:
- ✅ Procesamiento directo en `/api/upload-image`
- ✅ Uso de `await processImages()` (síncrono)
- ✅ Uso de `await analyzeImagesWithVision()` (síncrono)
- ✅ No hay workers, Bull, Redis Queue, ni procesamiento asíncrono
- ✅ Análisis con GPT-4 Vision es inmediato

**Ubicación**: `server.js` línea ~4486 (endpoint upload-image)

---

### 7. ✅ Funciones de IA Avanzadas Activadas

**Validación**: `USE_INTELLIGENT_MODE` y `SMART_MODE` activados por defecto.

**Comportamiento**:
- `USE_INTELLIGENT_MODE !== 'false'` → Activado por defecto
- `SMART_MODE !== 'false'` → Activado por defecto
- Muestra estado claro en logs de arranque
- Requiere `OPENAI_API_KEY` para funcionar efectivamente

**Ubicación**: 
- `USE_INTELLIGENT_MODE`: `server.js` línea ~239
- `SMART_MODE`: `server.js` línea ~265

---

## 📊 LOGS DE ARRANQUE

Al arrancar el servidor en producción, verás:

```
================================================================================
🔒 VALIDACIÓN DE CONFIGURACIÓN DE PRODUCCIÓN
================================================================================
✅ NODE_ENV=production
✅ LOG_TOKEN configurado
✅ ALLOWED_ORIGINS configurado (2 dominio(s))
   - https://tudominio.com
   - https://www.tudominio.com
✅ OPENAI_API_KEY configurado
================================================================================

============================================================
  🧠 SISTEMA INTELIGENTE DE TECNOS
============================================================
  Estado: ✅ ACTIVADO
  OpenAI: ✅ Disponible
  Modo: 🚀 INTELIGENTE (análisis con OpenAI)
  Features:
    - ✅ Análisis de intención contextual
    - ✅ Validación de acciones
    - ✅ Respuestas dinámicas
    - ✅ Prevención de saltos ilógicos
============================================================

[SMART_MODE] 🧠 Modo Super Inteligente: ✅ ACTIVADO (con OpenAI)
[CONCURRENT_USERS] ✅ Límite configurado: 10 usuarios simultáneos
```

---

## 🚨 ERRORES COMUNES

### Error: "LOG_TOKEN REQUIRED IN PRODUCTION"

**Causa**: `LOG_TOKEN` no está configurado en `.env`

**Solución**:
```bash
# Generar token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Agregar a .env
LOG_TOKEN=<token-generado>
```

---

### Error: "ALLOWED_ORIGINS es OBLIGATORIO en producción"

**Causa**: `ALLOWED_ORIGINS` no está configurado en `.env`

**Solución**:
```bash
# Agregar a .env
ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com
```

---

### Warning: "OPENAI_API_KEY no configurada"

**Causa**: `OPENAI_API_KEY` no está configurado

**Impacto**: Funciones de IA avanzadas deshabilitadas

**Solución**:
```bash
# Agregar a .env
OPENAI_API_KEY=sk-tu-api-key-aqui
```

---

### Warning: "MAX_CONCURRENT_USERS es X, no 10"

**Causa**: `MAX_CONCURRENT_USERS` en `constants.js` no es 10

**Solución**: Verificar `constants.js` línea 28, debe ser:
```javascript
export const MAX_CONCURRENT_USERS = 10;
```

---

## ✅ CHECKLIST DE PRODUCCIÓN

Antes de desplegar, verificar:

- [ ] `NODE_ENV=production` en `.env`
- [ ] `LOG_TOKEN` generado y configurado
- [ ] `ALLOWED_ORIGINS` configurado con dominios reales
- [ ] `OPENAI_API_KEY` configurado (para IA avanzada)
- [ ] `MAX_CONCURRENT_USERS=10` en `constants.js`
- [ ] Verificar que no hay cola de imágenes (procesamiento directo)
- [ ] `USE_INTELLIGENT_MODE` no es `'false'` (activado por defecto)
- [ ] `SMART_MODE` no es `'false'` (activado por defecto)

---

## 🔍 VERIFICACIÓN POST-DESPLIEGUE

1. **Revisar logs de arranque**: Debe mostrar todas las validaciones ✅
2. **Probar endpoint**: `/api/health` debe responder
3. **Probar límite usuarios**: Abrir 11 sesiones, la 11ª debe ser rechazada
4. **Probar IA**: Enviar mensaje, ver logs `[SMART_MODE] 🧠 Analizando...`
5. **Probar imágenes**: Subir imagen, debe procesarse inmediatamente

---

**Última actualización**: 2025-12-07
