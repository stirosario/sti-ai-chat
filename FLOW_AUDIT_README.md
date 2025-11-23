# 📊 Sistema de Flow Audit - STI Chat

Sistema completo de logging y auditoría para el flujo de conversación del chatbot STI.

## ✨ Características

### 1. **Logging Automático**
- ✅ Registra cada interacción en tiempo real
- ✅ Formato CSV para Excel
- ✅ Formato JSON para análisis programático
- ✅ Log visual en consola con formato tabla

### 2. **Detección de Anomalías**
- ✅ **Loops**: Detecta cuando una etapa se repite 3+ veces sin avanzar
- ✅ **Retrocesos**: Identifica transiciones inválidas entre etapas
- ✅ **Etapas bloqueadas**: Encuentra etapas que nunca avanzan

### 3. **Dashboard Visual**
- ✅ Interfaz web en tiempo real
- ✅ Filtros por sesión, etapa y trigger
- ✅ Estadísticas agregadas
- ✅ Auto-refresh cada 10 segundos

## 📁 Archivos Generados

```
data/logs/
├── flow-audit.csv      # Tabla principal (Excel-compatible)
├── flow-audit.json     # Logs en formato JSON
└── server.log          # Logs generales del servidor
```

## 🔍 Columnas del CSV

| Columna | Descripción |
|---------|-------------|
| **Nº** | Número de interacción consecutivo |
| **Timestamp** | Fecha y hora ISO 8601 |
| **SessionId** | ID único de la sesión |
| **Etapa Actual** | Estado en el que estaba el usuario |
| **Input Usuario** | Texto o botón presionado |
| **Trigger Detectado** | Palabra clave o botón que activó la transición |
| **Respuesta del Bot** | Mensaje enviado al usuario |
| **Siguiente Etapa** | Estado al que avanzó |
| **Acción Servidor** | Tipo de acción ejecutada |
| **Duración (ms)** | Tiempo de procesamiento |

## 🚀 Uso

### Ver Dashboard
```
http://localhost:3001/flow-audit.html
```

### API Endpoints

#### Obtener auditoría de una sesión
```bash
GET /api/flow-audit/:sessionId
```

Respuesta:
```json
{
  "ok": true,
  "audit": {
    "sessionId": "srv-123...",
    "totalInteractions": 12,
    "stages": ["ASK_LANGUAGE", "ASK_NAME", "ASK_NEED", "ASK_PROBLEM"],
    "transitions": [...],
    "anomalies": [],
    "totalDuration": 3456
  }
}
```

#### Obtener reporte completo
```bash
GET /api/flow-audit
```

Retorna un reporte en formato Markdown con análisis de todas las sesiones.

#### Exportar a Excel
```bash
GET /api/flow-audit/export
```

Descarga automáticamente el archivo CSV con formato optimizado para Excel.

## 📊 Ejemplo de Log en Consola

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 FLOW LOG #42                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Session:    srv-1732348800000-abc123def456...                   │
│ Stage:      ASK_LANGUAGE                                        │
│ Input:      [BTN] 🇦🇷 Español (Argentina)                       │
│ Trigger:    BTN_LANG_ES_AR                                      │
│ Response:   👋 Hola, soy Tecnos, asistente inteligente...       │
│ Next Stage: ASK_NAME                                            │
│ Action:     language_selected                                   │
│ Duration:   23ms                                                │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Configuración

El sistema se inicializa automáticamente al importar `flowLogger.js`.

Variables de entorno opcionales:
```bash
LOGS_DIR=./data/logs  # Directorio de logs
```

## 📈 Análisis de Anomalías

### Detectar Loops
```javascript
import { detectLoops } from './flowLogger.js';

const loop = detectLoops('sessionId', 3);
if (loop && loop.detected) {
  console.warn(loop.message);
  // ⚠️ LOOP DETECTADO: Etapa ASK_NAME repetida 3 veces sin avanzar
}
```

### Auditar Sesión
```javascript
import { getSessionAudit } from './flowLogger.js';

const audit = getSessionAudit('sessionId');
console.log(audit.anomalies); // ['Etapas sin avance: 2']
```

## 🎯 Validación contra Flujo.csv

El sistema permite verificar que cada transición cumpla con el flujo definido en `Flujo.csv`:

1. **ASK_LANGUAGE** → debe ir a **ASK_NAME**
2. **ASK_NAME** → debe ir a **ASK_NEED**
3. **ASK_NEED** → debe ir a **ASK_PROBLEM** o **ASK_HOWTO_DETAILS**
4. Ninguna etapa debe repetirse sin avanzar (excepto fallbacks válidos)

## 🐛 Debugging

Si encuentras loops o anomalías:

1. Abre el dashboard: `http://localhost:3001/flow-audit.html`
2. Filtra por la sesión problemática
3. Revisa la columna "Trigger Detectado" para ver qué activó cada transición
4. Verifica que la "Siguiente Etapa" sea la esperada según el CSV

## 📊 Estadísticas en Tiempo Real

El dashboard muestra:
- **Total Interactions**: Todas las interacciones registradas
- **Active Sessions**: Sesiones únicas
- **Avg Duration**: Tiempo promedio de respuesta
- **Loops Detected**: Cantidad de loops encontrados

## 🎨 Personalización

Los colores de las etapas en el dashboard se pueden modificar en `flow-audit.html`:

```css
.stage-ASK_LANGUAGE { background: #e3f2fd; color: #1976d2; }
.stage-ASK_NAME { background: #f3e5f5; color: #7b1fa2; }
/* ... */
```

## ⚡ Rendimiento

- **Cache en memoria**: Últimas 1000 interacciones
- **Escritura asíncrona**: No bloquea las respuestas
- **Auto-limpieza**: Mantiene los archivos bajo control

## 🔒 Seguridad

- ✅ Escapa correctamente valores CSV (comillas, comas, saltos)
- ✅ Trunca textos largos para evitar ataques
- ✅ Sanitiza datos sensibles (hereda del maskPII del servidor)

---

**Creado para auditar y optimizar el flujo de conversación del chatbot STI** 🤖
