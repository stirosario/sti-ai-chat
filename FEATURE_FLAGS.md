# Feature Flags - Tecnos/STI

**Fecha:** 6 de diciembre de 2025  
**Versión:** 1.0  
**Referencias:** server.js, .env.example

---

## 📋 Índice

1. [Qué son los Feature Flags](#qué-son-los-feature-flags)
2. [Flags Principales](#flags-principales)
3. [Flags de Auto-Learning](#flags-de-auto-learning)
4. [Flags de Directorios](#flags-de-directorios)
5. [Cómo Activar/Desactivar Flags](#cómo-activardesactivar-flags)

---

## Qué son los Feature Flags

Los **Feature Flags** (banderas de características) son variables de configuración que permiten **activar o desactivar funcionalidades** sin modificar el código fuente. En Tecnos/STI, se usan para:

- 🧪 **Experimentar** con arquitecturas nuevas sin romper la producción
- 🎛️ **Controlar** el comportamiento del sistema desde `.env`
- 🚀 **Desplegar** código nuevo de forma segura (feature toggles)
- 📊 **A/B testing** de diferentes motores conversacionales

**Convención de nombres:**
- `USE_*` → Activa/desactiva módulos completos
- `SMART_*` → Relacionados con IA y análisis inteligente
- `AUTO_*` → Relacionados con auto-aprendizaje

---

## Flags Principales

### Tabla de Feature Flags

| Nombre del Flag | Archivo donde se Define | Valores Posibles | Valor por Defecto | Efecto al Activar | Efecto al Desactivar |
|-----------------|-------------------------|------------------|-------------------|-------------------|----------------------|
| **ARQUITECTURA** |
| `USE_MODULAR_ARCHITECTURE` | `server.js:73`<br/>`src/adapters/chatAdapter.js:30` | `'true'` / `'false'` | `'false'` | ✅ Usa arquitectura modular experimental (`chatAdapter.js`). Separa lógica conversacional en módulos independientes. Handler: `chatAdapter.handleMessage()`. | ❌ Usa arquitectura legacy monolítica (todo en `server.js`). Handler: lógica inline en `/api/chat`. |
| `USE_ORCHESTRATOR` | `server.js:74` | `'true'` / `'false'` | `'false'` | ✅ Usa Conversation Orchestrator (`src/orchestrators/conversationOrchestrator.js`). Motor conversacional nuevo que decide flujos de forma dinámica. | ❌ Usa lógica de stages hardcodeada en `server.js`. Flujo rígido estado por estado. |
| `USE_INTELLIGENT_MODE` | `server.js:192`<br/>`src/core/integrationPatch.js:11` | `'true'` / `'false'` | `'false'` | ✅ Activa sistema inteligente completo:<br/>- Intent analysis con OpenAI (`intentEngine.js`)<br/>- Validación de acciones<br/>- Respuestas dinámicas (`smartResponseGenerator.js`)<br/>- Prevención de saltos ilógicos<br/>**Requiere:** `OPENAI_API_KEY` | ❌ Usa stages rígidos sin análisis de IA. Flujo conversacional basado en keywords y regex. |
| **IA Y ANÁLISIS** |
| `SMART_MODE` | `server.js:220` | `'true'` / `'false'` / `undefined` | `'true'` si OpenAI disponible | ✅ Activa análisis avanzado de mensajes:<br/>- `analyzeUserMessage()` procesa con OpenAI<br/>- Genera respuestas contextuales<br/>- Modo visión para imágenes (GPT-4o)<br/>**Requiere:** `OPENAI_API_KEY` | ❌ Salta análisis de IA. Usa solo regex y keywords para detección de intención. |
| **AUTO-APRENDIZAJE** |
| `AUTO_LEARNING_ENABLED` | `server.js:3806`<br/>`services/learningService.js:583` | `'true'` / `'false'` | `'false'` | ✅ Activa auto-aprendizaje seguro:<br/>- Analiza conversaciones pasadas<br/>- Detecta patrones recurrentes<br/>- Sugiere mejoras al flujo<br/>- Endpoint: `POST /api/analyze-auto-learning`<br/>**Requiere:** `MIN_CONVERSATIONS_FOR_ANALYSIS` | ❌ Auto-aprendizaje deshabilitado. Sistema funciona solo con reglas pre-programadas. |

---

## Flags de Auto-Learning

Estos flags controlan el sistema de **auto-aprendizaje automático** que analiza conversaciones reales para mejorar el bot.

| Nombre del Flag | Archivo donde se Define | Valores Posibles | Valor por Defecto | Efecto |
|-----------------|-------------------------|------------------|-------------------|--------|
| `AUTO_LEARNING_ENABLED` | `.env.example:74`<br/>`services/learningService.js:583` | `'true'` / `'false'` | `'false'` | Master switch del auto-aprendizaje. Si está en `false`, todos los demás flags de learning se ignoran. |
| `MIN_CONVERSATIONS_FOR_ANALYSIS` | `.env.example:82` | Número entero (ej: `10`, `50`, `100`) | `10` | Mínimo de conversaciones completas requeridas antes de ejecutar análisis. Evita aprender de datasets demasiado pequeños. |
| `MIN_CONFIDENCE_THRESHOLD` | `.env.example:85` | Float 0.0 - 1.0 (ej: `0.7`, `0.8`, `0.9`) | `0.7` | Umbral de confianza para aplicar sugerencias. Solo se aplican sugerencias con confidence >= este valor. `0.7` = 70% de confianza. |
| `MAX_SUGGESTIONS_PER_RUN` | `.env.example:88` | Número entero (ej: `5`, `20`, `50`) | `20` | Máximo de sugerencias a aplicar en una sola ejecución. Protege contra cambios masivos incontrolados. |
| `AUTO_LEARNING_INTERVAL_HOURS` | `test-autolearning-active.js:19` | Número entero (horas) | `undefined` (manual) | Si está configurado, ejecuta auto-aprendizaje cada X horas. Si no está, debe ejecutarse manualmente vía endpoint. |

**Ejemplo de configuración conservadora (producción):**

```dotenv
AUTO_LEARNING_ENABLED=true
MIN_CONVERSATIONS_FOR_ANALYSIS=100
MIN_CONFIDENCE_THRESHOLD=0.85
MAX_SUGGESTIONS_PER_RUN=5
# AUTO_LEARNING_INTERVAL_HOURS=24  # Comentado = manual
```

**Ejemplo de configuración agresiva (experimentación):**

```dotenv
AUTO_LEARNING_ENABLED=true
MIN_CONVERSATIONS_FOR_ANALYSIS=20
MIN_CONFIDENCE_THRESHOLD=0.6
MAX_SUGGESTIONS_PER_RUN=50
AUTO_LEARNING_INTERVAL_HOURS=6
```

---

## Flags de Directorios

Estos NO son feature flags técnicamente, pero configuran rutas críticas del sistema.

| Nombre del Flag | Archivo donde se Define | Valores Posibles | Valor por Defecto | Propósito |
|-----------------|-------------------------|------------------|-------------------|-----------|
| `DATA_BASE` | `server.js:737` | Ruta absoluta o relativa | `/data` | Directorio raíz para todos los datos persistentes. |
| `TRANSCRIPTS_DIR` | `server.js:738` | Ruta absoluta o relativa | `${DATA_BASE}/transcripts` | Donde se guardan transcripts completos de conversaciones. |
| `TICKETS_DIR` | `server.js:739`<br/>`ticketing.js:12` | Ruta absoluta o relativa | `${DATA_BASE}/tickets` | Donde se guardan archivos JSON de tickets de WhatsApp. |
| `LOGS_DIR` | `server.js:740` | Ruta absoluta o relativa | `${DATA_BASE}/logs` | Donde se guardan logs del sistema (`server.log`). |
| `UPLOADS_DIR` | `server.js:741` | Ruta absoluta o relativa | `${DATA_BASE}/uploads` | Donde se guardan imágenes subidas por usuarios. |
| `HISTORIAL_CHAT_DIR` | `server.js:742` | Ruta absoluta o relativa | `${DATA_BASE}/historial_chat` | Donde se guarda historial completo de chats (usado por auto-learning). |

**Nota:** En Render, estas rutas deben apuntar a volúmenes persistentes o el directorio `/data` que está montado.

---

## Cómo Activar/Desactivar Flags

### 1. Variables de Entorno (Recomendado)

**Archivo:** `.env` (local) o Dashboard de Render (producción)

```dotenv
# Activar arquitectura modular
USE_MODULAR_ARCHITECTURE=true

# Activar modo inteligente
USE_INTELLIGENT_MODE=true

# Desactivar orchestrator
USE_ORCHESTRATOR=false

# Activar modo smart (por defecto ya está activado si OpenAI disponible)
SMART_MODE=true

# Activar auto-learning
AUTO_LEARNING_ENABLED=true
MIN_CONVERSATIONS_FOR_ANALYSIS=50
MIN_CONFIDENCE_THRESHOLD=0.75
```

**Cambios en Render:**
1. Ir a https://dashboard.render.com
2. Seleccionar servicio `sti-rosario-ai`
3. Environment → Add Environment Variable
4. Agregar: `USE_MODULAR_ARCHITECTURE` = `true`
5. Guardar → Trigger redeploy

### 2. Por Línea de Comandos (Local)

**PowerShell:**

```powershell
# Activar temporalmente para una ejecución
$env:USE_MODULAR_ARCHITECTURE = "true"; node server.js

# Activar para toda la sesión de PowerShell
$env:USE_INTELLIGENT_MODE = "true"
node server.js
```

**Bash/Linux:**

```bash
# Activar temporalmente
USE_ORCHESTRATOR=true node server.js

# O exportar para toda la sesión
export USE_ORCHESTRATOR=true
node server.js
```

### 3. Hardcoded (No Recomendado)

**Solo para testing rápido:**

```javascript
// En server.js línea 73-74
const USE_MODULAR_ARCHITECTURE = true; // Forzar a true
const USE_ORCHESTRATOR = false;        // Forzar a false

// ⚠️ NO COMMITEAR ESTO - usar .env en su lugar
```

---

## Ejemplos de Uso

### Escenario 1: Testing Local de Arquitectura Modular

```powershell
# .env
USE_MODULAR_ARCHITECTURE=true
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=false

# Ejecutar
npm start

# O directamente:
$env:USE_MODULAR_ARCHITECTURE = "true"; npm start
```

**Resultado:**
- Usa `chatAdapter.js` en lugar de legacy
- Mantiene orchestrator desactivado
- Mantiene modo inteligente desactivado (legacy stages)

### Escenario 2: Testing de Sistema Inteligente Completo

```powershell
# .env
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=true
SMART_MODE=true
OPENAI_API_KEY=sk-...

# Ejecutar
npm start
```

**Resultado:**
- Arquitectura legacy (monolítica)
- Modo inteligente activado (OpenAI analysis)
- SMART_MODE activo (análisis avanzado)

### Escenario 3: Todo Nuevo (Experimental)

```powershell
# .env
USE_MODULAR_ARCHITECTURE=true
USE_ORCHESTRATOR=true
USE_INTELLIGENT_MODE=true
SMART_MODE=true
OPENAI_API_KEY=sk-...

# Ejecutar
npm run start:modular
```

**Resultado:**
- Arquitectura modular
- Orchestrator maneja flujos
- Sistema inteligente activo
- SMART_MODE activo

**⚠️ Advertencia:** Esta configuración es experimental y puede tener bugs.

### Escenario 4: Producción Estable (Recomendado)

```dotenv
# .env (Render Dashboard)
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=false
SMART_MODE=true
AUTO_LEARNING_ENABLED=false
OPENAI_API_KEY=sk-...
```

**Resultado:**
- Todo legacy excepto SMART_MODE
- Sistema probado y estable
- OpenAI solo para análisis avanzado
- Sin auto-learning (cambios manuales)

---

## Debugging de Feature Flags

### Ver Flags Activos en Runtime

El servidor imprime flags al arrancar:

```
=============================================================
  🧠 SISTEMA INTELIGENTE DE TECNOS
=============================================================
  Estado: ✅ ACTIVADO
  OpenAI: ✅ Disponible
  Modo: 🚀 INTELIGENTE (análisis con OpenAI)
  Features:
    - ✅ Análisis de intención contextual
    - ✅ Validación de acciones
    - ✅ Respuestas dinámicas
    - ✅ Prevención de saltos ilógicos
=============================================================

[MODULAR] 📦 Cargando arquitectura modular...
[ORCHESTRATOR] 🎭 Orchestrator activado
[SMART_MODE] 🧠 Modo Super Inteligente: ✅ ACTIVADO
```

### Verificar Flags en Código

**Endpoint de debug (agregar a server.js):**

```javascript
app.get('/api/debug/flags', (req, res) => {
  res.json({
    USE_MODULAR_ARCHITECTURE,
    USE_ORCHESTRATOR,
    USE_INTELLIGENT_MODE,
    SMART_MODE_ENABLED,
    AUTO_LEARNING_ENABLED: process.env.AUTO_LEARNING_ENABLED === 'true',
    OPENAI_AVAILABLE: !!openai
  });
});
```

**Uso:**

```powershell
curl http://localhost:3001/api/debug/flags
```

**Respuesta:**

```json
{
  "USE_MODULAR_ARCHITECTURE": false,
  "USE_ORCHESTRATOR": false,
  "USE_INTELLIGENT_MODE": true,
  "SMART_MODE_ENABLED": true,
  "AUTO_LEARNING_ENABLED": false,
  "OPENAI_AVAILABLE": true
}
```

---

## Logs por Flag

Cada flag imprime mensajes específicos en consola:

### `USE_MODULAR_ARCHITECTURE=true`
```
[MODULAR] 📦 Cargando arquitectura modular...
[MODULAR] ✅ Chat adapter cargado correctamente
[DEBUG] USE_MODULAR_ARCHITECTURE: true
[DEBUG] Usando legacy porque: USE_MODULAR= true chatAdapter= true
```

### `USE_ORCHESTRATOR=true`
```
[ORCHESTRATOR] 🎭 Cargando conversation orchestrator...
[ORCHESTRATOR] ✅ Orchestrator cargado correctamente
[DEBUG] USE_ORCHESTRATOR: true
[DEBUG] Orchestrator desactivado: USE_ORCHESTRATOR= true conversationOrchestrator= true
```

### `USE_INTELLIGENT_MODE=true`
```
🧠 SISTEMA INTELIGENTE DE TECNOS
Estado: ✅ ACTIVADO
Modo: 🚀 INTELIGENTE (análisis con OpenAI)
Features:
  - ✅ Análisis de intención contextual
  - ✅ Validación de acciones
```

### `SMART_MODE=true`
```
[SMART_MODE] 🧠 Modo Super Inteligente: ✅ ACTIVADO
[SMART_MODE] 🧠 Analizando mensaje con IA...
[SMART_MODE] ✅ Análisis de texto completado: {...}
[SMART_MODE] 💬 Generando respuesta inteligente...
[SMART_MODE] ✅ Respuesta generada: ...
```

### `AUTO_LEARNING_ENABLED=true`
```
[AUTO_LEARNING] ✅ Sistema de auto-aprendizaje activado
[AUTO_LEARNING] 📊 Analizando 127 conversaciones...
[AUTO_LEARNING] 💡 Generadas 14 sugerencias (confidence >= 0.7)
[AUTO_LEARNING] ✅ Aplicadas 5 sugerencias (máx: 20)
```

---

## Precauciones

### ⚠️ Flags Incompatibles

**NO activar simultáneamente:**

```dotenv
# ❌ MAL - Conflicto entre legacy y modular
USE_MODULAR_ARCHITECTURE=true
USE_INTELLIGENT_MODE=false  # Requiere modular=false o puede fallar
```

**✅ BIEN - Arquitecturas consistentes:**

```dotenv
# Opción 1: Todo legacy
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=false

# Opción 2: Solo inteligente
USE_MODULAR_ARCHITECTURE=false
USE_INTELLIGENT_MODE=true

# Opción 3: Todo nuevo
USE_MODULAR_ARCHITECTURE=true
USE_ORCHESTRATOR=true
USE_INTELLIGENT_MODE=true
```

### 🔒 Flags de Producción

**En Render (producción), mantener conservador:**

```dotenv
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
USE_INTELLIGENT_MODE=false
SMART_MODE=true  # Único flag experimental seguro
AUTO_LEARNING_ENABLED=false
```

**Razón:** Arquitectura legacy es estable y probada con miles de conversaciones reales.

### 🧪 Flags de Desarrollo

**En local, experimentar libremente:**

```dotenv
USE_MODULAR_ARCHITECTURE=true
USE_ORCHESTRATOR=true
USE_INTELLIGENT_MODE=true
SMART_MODE=true
AUTO_LEARNING_ENABLED=true
```

**Testing recomendado:**

```powershell
# Test 1: Legacy puro
$env:USE_INTELLIGENT_MODE = "false"; npm start

# Test 2: Solo inteligente
$env:USE_INTELLIGENT_MODE = "true"; npm start

# Test 3: Modular + orchestrator
$env:USE_MODULAR_ARCHITECTURE = "true"; $env:USE_ORCHESTRATOR = "true"; npm start
```

---

## Referencias

- **Código:** `server.js` (líneas 73-74, 192, 220)
- **Configuración:** `.env.example` (líneas 70-88)
- **Documentación:** `ARQUITECTURA_TECNOS_PARTE_1.md`, `ARQUITECTURA_TECNOS_PARTE_2A.md`
- **Tests:** `tests/test-modular.js`, `test-autolearning-active.js`

---

**Última actualización:** 6 de diciembre de 2025  
**Generado por:** GitHub Copilot (Claude Sonnet 4.5)
