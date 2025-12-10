# 🤖 Sistema Fix Chat - Documentación Completa

## 📋 Resumen

El sistema Fix Chat es una solución completa para reportar, rastrear y corregir automáticamente problemas en las conversaciones del chat. Incluye:

1. **Interfaz de Reporte** - Panel en admin.php para reportar problemas
2. **Almacenamiento de Problemas** - Sistema de archivos JSON para problemas reportados
3. **Robot Fix** - Sistema automático que analiza y corrige problemas cada 30 minutos
4. **Seguimiento Completo** - Logs y estadísticas de todas las correcciones

---

## 🎯 Componentes del Sistema

### 1. Interfaz de Administración (`admin.php`)

**Ubicación**: `public_html/admin.php`

**Sección**: "Fix Chat" (nueva pestaña en el panel de administración)

**Funcionalidades**:
- Formulario para reportar problemas
- Visualización de problemas reportados
- Estadísticas en tiempo real
- Filtros por estado
- Detalles de cada problema

**Campos del Formulario**:
- **ID de Conversación**: Identificador único de la conversación problemática
- **Descripción del Problema**: Descripción detallada del problema observado

**Estados de Problemas**:
- `Pendiente`: Recién reportado, esperando procesamiento
- `En Proceso`: Robot Fix lo está analizando
- `Resuelto`: Corrección aplicada exitosamente
- `Error`: No se pudo corregir automáticamente

---

### 2. Sistema de Almacenamiento

#### Archivo de Problemas

**Ubicación**: `sti-ai-chat/data/fix_chat/problems.json`

**Formato**:
```json
[
  {
    "id": "PROB-1234567890",
    "conversationId": "web-mizafhcby5auuq",
    "description": "luego de pasos avanzados no se muestra botón 'Hablar con un Técnico'",
    "reportedBy": "admin",
    "reportedAt": "2025-01-15 10:30:00",
    "status": "Resuelto",
    "lastReviewAt": "2025-01-15 11:00:00",
    "resolvedAt": "2025-01-15 11:00:00",
    "correctionResult": "Se detectó que el usuario llegó a pruebas avanzadas...",
    "notes": "Corrección aplicada: Verificación de botón técnico...",
    "error": null
  }
]
```

#### Log del Robot Fix

**Ubicación**: `sti-ai-chat/data/fix_chat/robot_fix.log`

**Formato**: Logs con timestamp, nivel y mensaje
```
[2025-01-15T11:00:00.000Z] [INFO] === INICIO EJECUCIÓN ROBOT FIX ===
[2025-01-15T11:00:00.100Z] [INFO] Encontrados 3 problemas pendientes
[2025-01-15T11:00:01.200Z] [SUCCESS] ✅ Problema PROB-123 resuelto exitosamente
```

---

### 3. Robot Fix (`services/robotFix.js`)

**Ubicación**: `sti-ai-chat/services/robotFix.js`

**Funcionalidades Principales**:

#### `runRobotFix()`
Ejecuta el análisis y corrección de todos los problemas pendientes.

**Proceso**:
1. Carga problemas con estado "Pendiente"
2. Para cada problema:
   - Busca el historial de la conversación
   - Analiza el problema descrito
   - Aplica corrección automática
   - Actualiza el estado del problema
3. Registra resultados en log

**Límites**:
- Procesa máximo 10 problemas por ejecución
- Pausa de 1 segundo entre problemas

#### Tipos de Correcciones Implementadas

1. **Botón "Hablar con Técnico" faltante**
   - Detecta si el usuario llegó a ESCALATE o ADVANCED_TESTS
   - Verifica que el botón se muestre en estos casos

2. **Botón "Volver" faltante**
   - Asegura que BTN_BACK_TO_STEPS esté presente después de ayuda

3. **Problemas genéricos de botones**
   - Verifica que todas las respuestas tengan al menos un botón

4. **Problemas de pasos**
   - Verifica formato y funcionalidad de pasos

5. **Problemas de mensajes**
   - Verifica claridad y contexto de mensajes

---

### 4. Sistema de Guardado de Conversaciones

**Verificación**: ✅ **SISTEMA EXISTENTE CONFIRMADO**

El sistema ya guarda conversaciones en dos ubicaciones:

1. **Historial Chat** (`data/historial_chat/`)
   - Formato: `{sessionId}.json`
   - Contiene: Conversación completa, metadata, timestamps

2. **Transcripts** (`data/transcripts/`)
   - Formato: `{sessionId}.json`
   - Contiene: Mensajes, análisis NLP, transiciones de stage

**Función**: `saveTranscriptJSON()` en `server.js` (línea ~1693)

**Características**:
- ✅ Guarda conversaciones completas
- ✅ Incluye todos los mensajes con timestamps
- ✅ Guarda metadata (dispositivo, problema, stages)
- ✅ Se guarda indefinidamente (sin borrado automático)
- ✅ Formato JSON legible

**Mejora Aplicada**: Se aseguró que el guardado sea completo y permanente.

---

## ⚙️ Configuración

### Variables de Entorno

```bash
# Habilitar/deshabilitar Robot Fix (default: true)
ENABLE_ROBOT_FIX=true

# Directorios (ya configurados)
DATA_BASE=/data
HISTORIAL_CHAT_DIR=/data/historial_chat
TRANSCRIPTS_DIR=/data/transcripts
```

### Ejecución Automática

El Robot Fix se ejecuta automáticamente:
- **Cada 30 minutos** usando cron: `*/30 * * * *`
- **Al iniciar el servidor** (si hay problemas pendientes, después de 30 segundos)

### Ejecución Manual

**Endpoint**: `POST /api/robot-fix/run`

**Autenticación**: Requiere `LOG_TOKEN` en header `Authorization` o query `?token=`

**Ejemplo**:
```bash
curl -X POST https://sti-rosario-ai.onrender.com/api/robot-fix/run \
  -H "Authorization: YOUR_LOG_TOKEN"
```

**Respuesta**:
```json
{
  "ok": true,
  "success": true,
  "processed": 3,
  "resolved": 2,
  "errors": 1,
  "duration": 5234
}
```

### Estadísticas

**Endpoint**: `GET /api/robot-fix/stats`

**Respuesta**:
```json
{
  "ok": true,
  "stats": {
    "total": 10,
    "pending": 2,
    "inProgress": 0,
    "resolved": 7,
    "errors": 1
  }
}
```

---

## 🔍 Flujo de Trabajo

### 1. Reporte de Problema

1. Administrador identifica un problema en una conversación
2. Accede a "Fix Chat" en admin.php
3. Ingresa:
   - ID de conversación (ej: `web-mizafhcby5auuq`)
   - Descripción del problema
4. Presiona "Reportar Problema"
5. El problema se guarda con estado "Pendiente"

### 2. Procesamiento Automático

1. Robot Fix se ejecuta cada 30 minutos
2. Lee problemas con estado "Pendiente"
3. Para cada problema:
   - Busca historial de la conversación
   - Analiza el problema descrito
   - Identifica el tipo de corrección necesaria
   - Aplica corrección automática
   - Actualiza estado a "Resuelto" o "Error"

### 3. Seguimiento

1. Administrador puede ver:
   - Estado de cada problema
   - Resultado de la corrección
   - Notas del Robot Fix
   - Errores si los hay
2. Estadísticas actualizadas en tiempo real

---

## 🛠️ Extensión del Sistema

### Agregar Nuevos Tipos de Corrección

Para agregar un nuevo tipo de corrección automática:

1. **Crear función de corrección** en `services/robotFix.js`:
```javascript
async function fixNuevoTipoProblema(problem, history, lastMessages) {
    // Lógica de análisis y corrección
    return {
        applied: true,
        result: 'Descripción de la corrección aplicada',
        notes: 'Notas adicionales',
        error: null
    };
}
```

2. **Agregar detección** en `analyzeAndFix()`:
```javascript
if (description.includes('nueva_palabra_clave')) {
    correction = await fixNuevoTipoProblema(problem, history, lastMessages);
}
```

### Mejorar Análisis

El análisis actual es básico. Se puede mejorar:

1. **Usar OpenAI** para análisis más inteligente
2. **Machine Learning** para detectar patrones
3. **Análisis de sentimiento** para detectar frustración
4. **Comparación con conversaciones exitosas**

---

## 📊 Seguridad

### Autenticación

- Solo administradores pueden acceder a "Fix Chat"
- Endpoints del Robot Fix requieren `LOG_TOKEN`
- Archivos de problemas no son accesibles públicamente

### Protección de Datos

- No se expone información sensible de usuarios en logs
- IDs de conversación son anónimos
- Historiales se guardan de forma segura

---

## 🚀 Rendimiento

### Optimizaciones

- **Límite de procesamiento**: Máximo 10 problemas por ejecución
- **Pausa entre problemas**: 1 segundo para no sobrecargar
- **Búsqueda eficiente**: Búsqueda directa por ID de archivo
- **Ejecución asíncrona**: No bloquea el servidor principal

### Escalabilidad

Si hay muchos problemas:
- Se procesan en lotes de 10
- Cada 30 minutos se procesa un nuevo lote
- Los más antiguos se procesan primero

---

## 📝 Mantenimiento

### Archivar Problemas Resueltos

Los problemas resueltos se mantienen en el archivo para referencia. Para archivar:

1. Crear script de archivado
2. Mover problemas resueltos > 30 días a archivo separado
3. Mantener solo problemas recientes en `problems.json`

### Limpieza de Logs

El log del Robot Fix crece continuamente. Para limpiar:

1. Rotar logs diariamente
2. Mantener solo últimos 30 días
3. Comprimir logs antiguos

---

## ✅ Testing

### Probar Reporte de Problema

1. Acceder a admin.php
2. Ir a "Fix Chat"
3. Ingresar ID de conversación existente
4. Describir problema
5. Verificar que se guarde correctamente

### Probar Robot Fix

1. Crear problema de prueba
2. Esperar 30 minutos o ejecutar manualmente
3. Verificar que se procese y actualice estado
4. Revisar log del Robot Fix

### Verificar Correcciones

1. Revisar problemas resueltos
2. Verificar que `correctionResult` tenga sentido
3. Confirmar que las correcciones se aplicaron en código

---

## 🐛 Troubleshooting

### Problema: No se encuentra historial

**Causa**: El ID de conversación no existe o está mal escrito

**Solución**: Verificar que el ID sea correcto y que la conversación exista

### Problema: Robot Fix no se ejecuta

**Causa**: `ENABLE_ROBOT_FIX=false` o error en cron

**Solución**: 
1. Verificar variable de entorno
2. Revisar logs del servidor
3. Ejecutar manualmente para ver errores

### Problema: Correcciones no se aplican

**Causa**: El análisis no identifica correctamente el problema

**Solución**: 
1. Revisar descripción del problema (debe ser clara)
2. Verificar que el historial esté completo
3. Mejorar lógica de análisis si es necesario

---

## 📚 Referencias

- **Archivo de problemas**: `sti-ai-chat/data/fix_chat/problems.json`
- **Log del Robot Fix**: `sti-ai-chat/data/fix_chat/robot_fix.log`
- **Código del Robot Fix**: `sti-ai-chat/services/robotFix.js`
- **Interfaz admin**: `public_html/admin.php` (sección "Fix Chat")
- **Funciones PHP**: `public_html/fix-chat-functions.php`

---

**Fecha de implementación**: 2025-01-XX
**Estado**: ✅ Completado y funcional
**Versión**: 1.0.0

