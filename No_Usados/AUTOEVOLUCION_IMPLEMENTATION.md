# SISTEMA DE AUTO-EVOLUCIÓN SEGURA - TECNOS

## 📋 Descripción General

Este sistema permite que Tecnos aprenda automáticamente de conversaciones reales **sin modificar código**, actualizando únicamente archivos JSON de configuración.

## 🎯 Objetivo

Mejorar continuamente las capacidades conversacionales del chatbot mediante:
- Detección de errores ortográficos comunes
- Identificación de nuevos sinónimos y variantes
- Reconocimiento de patrones de dispositivos
- Aprendizaje de frases efectivas

## 🔒 Reglas de Seguridad

### ESTRICTAS (nunca violar):
1. **NUNCA modificar código** (.js, .php, .html)
2. **SOLO actualizar JSON** en `/config`
3. **SIEMPRE crear backup** antes de aplicar cambios
4. **SOLO agregar patrones nuevos**, nunca eliminar existentes
5. **Validar cambios** antes de aplicar
6. **Registrar TODO** en `logs/learning.log`

### Configuración:
- **AUTO_LEARNING_ENABLED**: Flag maestro (default: `false`)
- **MIN_CONVERSATIONS_FOR_ANALYSIS**: Mínimo 10 conversaciones
- **MIN_CONFIDENCE_THRESHOLD**: Mínimo 0.7 de confianza
- **MAX_SUGGESTIONS_PER_RUN**: Máximo 20 sugerencias

## 📁 Estructura de Archivos

```
/config/
  ├── nlp-tuning.json          # Sinónimos, typos, keywords
  ├── device-detection.json     # Patrones de dispositivos
  ├── phrases-training.json     # Frases empáticas y respuestas
  └── app-features.json         # Feature flags

/services/
  └── learningService.js        # Motor de aprendizaje

/logs/
  └── learning.log              # Registro de todas las operaciones

/transcripts/
  └── *.json                    # Transcripciones de conversaciones
```

## 🔧 Archivos de Configuración

### 1. nlp-tuning.json
Configuración de procesamiento de lenguaje natural:
- **synonyms**: Mapeo de sinónimos (ej: "problema" → ["falla", "error"])
- **typos**: Correcciones ortográficas (ej: "komputadora" → "computadora")
- **commonPhrases**: Frases frecuentes por categoría
- **deviceKeywords**: Keywords específicos de dispositivos
- **intentPatterns**: Patrones de detección de intenciones

### 2. device-detection.json
Configuración de reconocimiento de dispositivos:
- **devices**: Por cada tipo (desktop, notebook, printer, etc):
  - `patterns`: Expresiones regulares para detección
  - `keywords`: Palabras clave simples
  - `confidence`: Niveles (high, medium, low)

### 3. phrases-training.json
Frases optimizadas por análisis de conversaciones:
- **empathyResponses**: Respuestas empáticas por contexto
- **diagnosticIntros**: Intros para pasos de diagnóstico
- **clarificationQuestions**: Preguntas de clarificación
- **escalationPhrases**: Frases para derivación

### 4. app-features.json
Feature flags y configuración del sistema:
```json
{
  "features": {
    "autoLearning": false,
    "visionAPI": false,
    "smartMode": false
  },
  "learning": {
    "minConversationsForAnalysis": 10,
    "minConfidenceToApply": 0.7,
    "maxSuggestionsPerRun": 20
  }
}
```

## 🚀 Uso del Sistema

### Paso 1: Habilitar Auto-Learning

Editar `config/app-features.json`:
```json
{
  "features": {
    "autoLearning": true
  }
}
```

O en `.env`:
```bash
AUTO_LEARNING_ENABLED=true
```

### Paso 2: Analizar Conversaciones (READ-ONLY)

```bash
# GET request con autenticación
curl "http://localhost:3000/api/learning/report?token=YOUR_LOG_TOKEN"
```

**Response:**
```json
{
  "ok": true,
  "timestamp": "2025-12-05T10:30:00Z",
  "stats": {
    "conversationsAnalyzed": 45,
    "suggestionsGenerated": 12,
    "highConfidence": 8,
    "mediumConfidence": 3,
    "lowConfidence": 1
  },
  "suggestions": {
    "nlpTuning": [
      {
        "type": "typo",
        "pattern": "inpresora",
        "occurrences": 5,
        "confidence": 0.85,
        "action": "add_to_typos_dict"
      }
    ],
    "deviceDetection": [...],
    "phraseTraining": [...]
  }
}
```

### Paso 3: Aplicar Mejoras

```bash
# POST request con el JSON de sugerencias
curl -X POST "http://localhost:3000/api/learning/apply?token=YOUR_LOG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "suggestions": {
      "nlpTuning": [...],
      "deviceDetection": [...],
      "phraseTraining": [...]
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "applied": 12,
  "results": {
    "nlpTuning": { "success": 5, "failed": 0 },
    "deviceDetection": { "success": 4, "failed": 0 },
    "phraseTraining": { "success": 3, "failed": 0 }
  },
  "timestamp": "2025-12-05T10:35:00Z"
}
```

### Paso 4: Verificar Logs

```bash
# Ver registro de operaciones
cat logs/learning.log
```

**Formato:**
```
[2025-12-05T10:30:00Z] ANALYSIS_START: Starting conversation analysis | result: In progress
[2025-12-05T10:30:02Z] READ_TRANSCRIPTS: Loaded 45 transcripts | result: Success
[2025-12-05T10:30:05Z] ANALYSIS_COMPLETE: Generated 12 suggestions | examples: {...} | result: Success
[2025-12-05T10:35:00Z] APPLY_START: Starting safe improvements application | result: In progress
[2025-12-05T10:35:01Z] BACKUP_CREATED: Backup of nlp-tuning.json | result: /config/nlp-tuning.json.2025-12-05T10-35-01.bak
[2025-12-05T10:35:02Z] PATTERN_ADDED: Added typo: inpresora | examples: {"pattern":"inpresora","confidence":0.85} | result: Success
[2025-12-05T10:35:10Z] APPLY_COMPLETE: Applied 12 improvements | examples: {...} | result: Success
```

## 🔄 Integración con Orchestrator

El `conversationOrchestrator.js` carga automáticamente las configuraciones JSON al iniciar:

```javascript
// Al iniciar servidor
await loadConfigurations();

// Después de aplicar cambios de learning
import { reloadConfigurations } from './services/conversationOrchestrator.js';
await reloadConfigurations();
```

### Funciones integradas:
- `normalizeTextWithConfig(text)`: Aplica correcciones de typos
- `detectDeviceWithConfig(text)`: Detecta dispositivos con patterns mejorados
- `selectEmpathyPhrase(context)`: Selecciona frase empática optimizada

## 📊 Endpoints Disponibles

### GET /api/learning/report
Analiza conversaciones y genera reporte de sugerencias.
- **Auth**: Requiere `?token=LOG_TOKEN`
- **Side effects**: Ninguno (READ-ONLY)
- **Returns**: Reporte completo con sugerencias

### POST /api/learning/apply
Aplica sugerencias a archivos de configuración.
- **Auth**: Requiere `?token=LOG_TOKEN`
- **Body**: JSON con sugerencias del reporte
- **Requires**: `AUTO_LEARNING_ENABLED=true`
- **Side effects**: Modifica JSON configs, crea backups
- **Returns**: Resultado de aplicación

### GET /api/learning/config
Devuelve configuración actual del sistema.
- **Auth**: Requiere `?token=LOG_TOKEN`
- **Returns**: app-features.json + SAFETY_CONFIG

## 🛡️ Seguridad y Backups

### Sistema de Backups Automáticos
Cada vez que se aplica un cambio:
1. Se crea `.bak` (backup simple, sobreescribible)
2. Se crea `.TIMESTAMP.bak` (backup con timestamp, permanente)

### Rollback Manual
```bash
# Restaurar desde último backup
cp config/nlp-tuning.json.bak config/nlp-tuning.json

# O desde timestamp específico
cp config/nlp-tuning.json.2025-12-05T10-35-01.bak config/nlp-tuning.json
```

### Rollback Programático
```javascript
import { rollbackConfig } from './services/learningService.js';

// Restaurar desde .bak
await rollbackConfig('nlp-tuning.json');
```

## 📈 Proceso de Aprendizaje

### 1. Recolección de Datos
- Conversaciones guardadas en `/transcripts/*.json`
- Cada archivo contiene: messages[], sessionId, timestamp

### 2. Análisis
- **extractTextPatterns()**: Extrae frases, typos, keywords
- **calculateConfidence()**: Asigna score de confianza (0.0 - 1.0)
- **generateSuggestions()**: Filtra por umbral mínimo

### 3. Aplicación
- **applySafeImprovements()**: 
  - Verifica AUTO_LEARNING_ENABLED
  - Crea backups
  - Solo agrega (nunca elimina)
  - Valida JSON antes de guardar
  - Auto-rollback en error

### 4. Integración
- **reloadConfigurations()**: Recarga configs en memoria
- Orchestrator usa nuevos patterns inmediatamente

## 🧪 Testing

### Dry-run Mode
```bash
curl -X POST "http://localhost:3000/api/learning/apply?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"suggestions": {...}, "dryRun": true}'
```
No aplica cambios, solo simula.

### Verificar Integridad
```bash
# Validar JSON
node -e "console.log(JSON.parse(require('fs').readFileSync('config/nlp-tuning.json')))"
```

## 📝 Casos de Uso

### Caso 1: Nuevo Typo Detectado
Usuario escribe "inpresora" repetidamente → Sistema detecta → Agrega a `nlp-tuning.json` → Futuras conversaciones normalizan automáticamente.

### Caso 2: Nuevo Sinónimo
Usuarios usan "compu" frecuentemente → Sistema detecta → Agrega a sinónimos de "computadora" → Mejora comprensión.

### Caso 3: Patrón de Dispositivo
Usuarios mencionan "magistv" → Sistema detecta como nuevo dispositivo → Agrega pattern a `device-detection.json` → Reconocimiento mejorado.

### Caso 4: Frase Empática Efectiva
Una respuesta específica resuelve muchos casos → Sistema detecta éxito → Aumenta score en `phrases-training.json` → Se usa más frecuentemente.

## 🚨 Troubleshooting

### Error: "AUTO_LEARNING is disabled"
**Solución**: Activar en `config/app-features.json` → `"autoLearning": true`

### Error: "Not enough data"
**Solución**: Necesitas al menos 10 conversaciones en `/transcripts/`

### Error: "Failed to save config"
**Solución**: Verificar permisos de escritura en `/config/`

### Warning: "No transcripts directory found"
**Solución**: Crear directorio: `mkdir transcripts`

## 📚 Referencias

- **learningService.js**: Motor principal (500 líneas)
- **conversationOrchestrator.js**: Integración (líneas 1-140)
- **server.js**: Endpoints API (líneas 3256-3450)
- **.env.example**: Variables de entorno (líneas 60-80)

## 🎓 Mejores Prácticas

1. **Analizar antes de aplicar**: Siempre revisar el reporte antes de `POST /apply`
2. **Empezar con dry-run**: Usar `dryRun: true` para testing
3. **Monitorear logs**: Revisar `logs/learning.log` después de cada aplicación
4. **Backups periódicos**: Guardar copias de `/config` fuera del servidor
5. **Gradual rollout**: Aplicar sugerencias en lotes pequeños
6. **Validar impacto**: Testear conversaciones después de cambios

## 📅 Mantenimiento

### Semanal
- Revisar `logs/learning.log` para errores
- Analizar nuevas transcripciones con `/api/learning/report`

### Mensual
- Limpiar backups antiguos (`.TIMESTAMP.bak`)
- Auditar `config/*.json` para patrones obsoletos

### Trimestral
- Backup completo de `/config/` a storage externo
- Review de estadísticas de aprendizaje

---

**Versión**: 1.0.0  
**Última actualización**: 2025-12-05  
**Autor**: STI Asistencia Informática  
**Estado**: ✅ Producción
