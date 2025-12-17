# 🔧 CONFIGURACIÓN DE ENTORNO PARA PRODUCCIÓN

**Fecha**: 2025-12-07  
**Estado**: ✅ Listo para producción

---

## ✅ CONFIRMACIÓN DE CONFIGURACIÓN

### 1. ✅ MAX_CONCURRENT_USERS = 10

**Ubicación**: `constants.js` línea 28

**Valor actual**:
```javascript
export const MAX_CONCURRENT_USERS = 10; // Máximo 10 usuarios simultáneos
```

**Estado**: ✅ **CONFIRMADO** - Está configurado en 10

**Fallback**: Si por alguna razón no está definido, el código usa fallback de 10 en `server.js` línea ~2680:
```javascript
const MAX_CONCURRENT = MAX_CONCURRENT_USERS || 10;
```

---

## 🔒 VARIABLES DE ENTORNO OBLIGATORIAS

### Variables Críticas (Bloquean arranque si faltan)

#### 1. NODE_ENV=production

**Obligatorio**: ✅ SÍ (en producción)

**Configuración**:
```bash
NODE_ENV=production
```

**Validación**: El servidor verifica al arrancar y valida estrictamente todas las variables críticas.

---

#### 2. LOG_TOKEN

**Obligatorio**: ✅ SÍ (en producción)

**Configuración**:
```bash
# Generar token seguro
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Agregar a .env
LOG_TOKEN=<token-generado>
```

**Validación**: Si falta en producción → `process.exit(1)` (servidor no arranca)

**Ubicación validación**: `server.js` línea ~236

---

#### 3. ALLOWED_ORIGINS

**Obligatorio**: ✅ SÍ (en producción)

**Configuración**:
```bash
ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com
```

**Formato**: Dominios separados por comas, sin espacios (o con espacios que se recortan automáticamente)

**Validación**: Si falta en producción → `process.exit(1)` (servidor no arranca)

**Ubicación validación**: `server.js` línea ~244

**Ejemplo completo**:
```bash
ALLOWED_ORIGINS=https://stia.com.ar,https://www.stia.com.ar,https://sti-rosario-ai.onrender.com
```

---

### Variables Recomendadas (No bloquean arranque)

#### 4. OPENAI_API_KEY

**Obligatorio**: ⚠️ NO (pero necesario para IA avanzada)

**Configuración**:
```bash
OPENAI_API_KEY=sk-tu-api-key-aqui
```

**Validación**: Si falta → Advierte pero no bloquea el arranque

**Impacto**: Sin esta key, las funciones de IA avanzadas estarán deshabilitadas

**Ubicación validación**: `server.js` línea ~257

---

## 📋 ARCHIVO .env DE PRODUCCIÓN

Crea un archivo `.env` en la raíz del proyecto con:

```bash
# ========================================================
# ENTORNO
# ========================================================
NODE_ENV=production
PORT=3001

# ========================================================
# SEGURIDAD (OBLIGATORIO)
# ========================================================
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
LOG_TOKEN=<generar-token-seguro-aqui>

# Dominios permitidos para CORS (separados por comas)
ALLOWED_ORIGINS=https://tudominio.com,https://www.tudominio.com

# ========================================================
# OPENAI (NECESARIO PARA IA AVANZADA)
# ========================================================
OPENAI_API_KEY=sk-tu-api-key-aqui
OPENAI_MODEL=gpt-4o-mini

# ========================================================
# FUNCIONES DE IA (ACTIVADAS POR DEFECTO)
# ========================================================
# No es necesario configurar si quieres que estén activadas (por defecto true)
# USE_INTELLIGENT_MODE=true
# SMART_MODE=true

# Para desactivar (no recomendado en producción):
# USE_INTELLIGENT_MODE=false
# SMART_MODE=false

# ========================================================
# WHATSAPP
# ========================================================
WHATSAPP_NUMBER=5493417422422

# ========================================================
# URL BASE PÚBLICA
# ========================================================
PUBLIC_BASE_URL=https://tudominio.com

# ========================================================
# DIRECTORIOS (opcional, tienen valores por defecto)
# ========================================================
# DATA_BASE=./data
# TRANSCRIPTS_DIR=./data/transcripts
# TICKETS_DIR=./data/tickets
# UPLOADS_DIR=./data/uploads
# LOGS_DIR=./data/logs
```

---

## ✅ CHECKLIST DE CONFIGURACIÓN

Antes de desplegar, verificar:

### Variables Obligatorias
- [ ] `NODE_ENV=production` configurado
- [ ] `LOG_TOKEN` generado y configurado
- [ ] `ALLOWED_ORIGINS` configurado con dominios reales

### Variables para IA Avanzada
- [ ] `OPENAI_API_KEY` configurado (para activar IA avanzada)
- [ ] `USE_INTELLIGENT_MODE` no es `'false'` (activado por defecto)
- [ ] `SMART_MODE` no es `'false'` (activado por defecto)

### Configuración de Código
- [x] `MAX_CONCURRENT_USERS=10` en `constants.js` ✅ CONFIRMADO
- [x] Procesamiento directo de imágenes (sin cola) ✅ CONFIRMADO

---

## 🔍 VERIFICACIÓN POST-CONFIGURACIÓN

### 1. Verificar que el servidor arranca correctamente

Al arrancar, deberías ver:

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
============================================================

[SMART_MODE] 🧠 Modo Super Inteligente: ✅ ACTIVADO (con OpenAI)
[CONCURRENT_USERS] ✅ Límite configurado: 10 usuarios simultáneos
```

### 2. Si falta alguna variable obligatoria

El servidor **NO arrancará** y mostrará un error claro:

```
[ERROR] LOG_TOKEN es OBLIGATORIO en producción
[ERROR] Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

o

```
[ERROR] ALLOWED_ORIGINS es OBLIGATORIO en producción
[ERROR] Configurar con tus dominios reales separados por comas
```

---

## 🚨 TROUBLESHOOTING

### El servidor no arranca

**Causa**: Falta una variable obligatoria

**Solución**: Revisar logs de arranque y configurar la variable faltante

---

### IA avanzada no funciona

**Causa**: `OPENAI_API_KEY` no está configurado

**Solución**: 
1. Verificar que `OPENAI_API_KEY` está en `.env`
2. Verificar que el valor es correcto (empieza con `sk-`)
3. Reiniciar el servidor

---

### Límite de usuarios no funciona

**Causa**: `MAX_CONCURRENT_USERS` no es 10

**Solución**: Verificar `constants.js` línea 28, debe ser:
```javascript
export const MAX_CONCURRENT_USERS = 10;
```

---

## 📝 RESUMEN

### ✅ Confirmado

1. **MAX_CONCURRENT_USERS = 10** en `constants.js` ✅
2. **Validaciones estrictas** implementadas en `server.js` ✅
3. **Variables obligatorias** bloquean arranque si faltan ✅
4. **IA avanzada** activada por defecto ✅
5. **Procesamiento directo** de imágenes (sin cola) ✅

### 📋 Para Configurar

1. Crear archivo `.env` con las variables obligatorias
2. Generar `LOG_TOKEN` seguro
3. Configurar `ALLOWED_ORIGINS` con dominios reales
4. Configurar `OPENAI_API_KEY` para IA avanzada

---

**Última actualización**: 2025-12-07
