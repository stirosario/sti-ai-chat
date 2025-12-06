# 🔧 Guía de Integración en server.js - Paso a Paso

## 📍 PASO 1: Imports (Línea ~50, después de imports existentes)

**BUSCAR:**
```javascript
import OpenAI from 'openai';
import session from 'express-session';
import RedisStore from 'connect-redis';
// ... otros imports ...
```

**AGREGAR DESPUÉS:**
```javascript
// ========================================================
// 🧠 SISTEMA INTELIGENTE DE TECNOS
// Motor de análisis de intención con OpenAI
// Autor: STI AI Team | Fecha: 2025-12-06
// ========================================================
import { 
  initializeIntelligentSystem, 
  handleWithIntelligence,
  setIntelligentMode,
  getIntelligentSystemStatus
} from './src/core/integrationPatch.js';

console.log('[IMPORTS] ✅ Sistema inteligente importado');
```

---

## 📍 PASO 2: Inicialización (Línea ~200, después de configurar OpenAI)

**BUSCAR:**
```javascript
// Initialize OpenAI
let openai = null;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  console.log('[OpenAI] ✅ Cliente inicializado');
} else {
  console.warn('[OpenAI] ⚠️ No API key found');
}
```

**AGREGAR DESPUÉS:**
```javascript
// ========================================================
// 🧠 INICIALIZAR SISTEMA INTELIGENTE
// ========================================================
const USE_INTELLIGENT_MODE = process.env.USE_INTELLIGENT_MODE === 'true';
console.log(`\n${'='.repeat(60)}`);
console.log(`  🧠 SISTEMA INTELIGENTE DE TECNOS`);
console.log(`${'='.repeat(60)}`);
console.log(`  Estado: ${USE_INTELLIGENT_MODE ? '✅ ACTIVADO' : '⏭️ DESACTIVADO (usando legacy)'}`);
console.log(`  OpenAI: ${OPENAI_API_KEY ? '✅ Disponible' : '⚠️ No disponible'}`);

const intelligentSystemStatus = initializeIntelligentSystem(
  OPENAI_API_KEY,
  USE_INTELLIGENT_MODE
);

if (intelligentSystemStatus.enabled) {
  console.log(`  Modo: 🚀 INTELIGENTE (análisis con OpenAI)`);
  console.log(`  Features:`);
  console.log(`    - ✅ Análisis de intención contextual`);
  console.log(`    - ✅ Validación de acciones`);
  console.log(`    - ✅ Respuestas dinámicas`);
  console.log(`    - ✅ Prevención de saltos ilógicos`);
} else {
  console.log(`  Modo: 📚 LEGACY (stages rígidos)`);
  console.log(`  Para activar: USE_INTELLIGENT_MODE=true en .env`);
}
console.log(`${'='.repeat(60)}\n`);
```

---

## 📍 PASO 3: Integración en /api/chat (Línea ~4500, ANTES de procesar stages)

**BUSCAR:**
```javascript
app.post('/api/chat', async (req, res) => {
  try {
    const sid = req.sessionId;
    const t = String(req.body.text || '').trim();
    const buttonToken = String(req.body.buttonToken || req.body.value || '').trim();

    // Get or create session
    let session = await getSession(sid);
    if (!session) {
      session = await createSession(sid);
    }

    // ... validaciones de sesión ...
    
    // 🔍 AQUÍ ES DONDE EMPIEZA EL PROCESAMIENTO DE STAGES
    // Ejemplo: if (session.stage === STATES.ASK_LANGUAGE) { ... }
```

**AGREGAR JUSTO ANTES DEL PROCESAMIENTO DE STAGES:**
```javascript
    // ========================================================
    // 🧠 SISTEMA INTELIGENTE - PROCESAMIENTO PRIORITARIO
    // ========================================================
    // Si el modo inteligente está activado y el mensaje lo requiere,
    // procesamos con el motor de intención EN LUGAR de la lógica legacy.
    //
    // ¿Cuándo se activa?
    // - Texto libre del usuario (no botones simples)
    // - Botones problemáticos que requieren validación contextual
    // - Mensajes ambiguos que necesitan análisis de intención
    //
    // ¿Qué hace?
    // 1. Analiza la intención real con OpenAI
    // 2. Valida que la acción sea coherente con el contexto
    // 3. Genera respuesta dinámica apropiada
    // 4. Propone opciones lógicas para el siguiente paso
    //
    // Si se procesa exitosamente, retorna la respuesta y TERMINA.
    // Si no se activa o falla, continúa con la lógica legacy.
    // ========================================================
    
    console.log('[api/chat] 🔍 Evaluando si usar sistema inteligente...');
    
    const intelligentResponse = await handleWithIntelligence(
      req, 
      res, 
      session, 
      t, 
      buttonToken
    );

    if (intelligentResponse) {
      // ✅ El sistema inteligente procesó exitosamente
      console.log('[api/chat] ✅ Procesado con sistema inteligente');
      console.log('[api/chat] 📊 Intent:', intelligentResponse.intentDetected);
      console.log('[api/chat] 📊 Stage:', intelligentResponse.stage);
      console.log('[api/chat] 📊 Options:', intelligentResponse.options.length);
      
      // Guardar sesión actualizada (con nuevo intent, stage, etc.)
      await saveSessionAndTranscript(sid, session);
      
      // Enviar respuesta al frontend
      return res.json(intelligentResponse);
    }

    // ⏭️ Si llegó aquí, el sistema inteligente no se activó
    // Continuar con la lógica legacy basada en stages
    console.log('[api/chat] ⏭️ Procesando con sistema legacy (stages)');
    
    // ... AQUÍ CONTINÚA TODO EL CÓDIGO LEGACY EXISTENTE ...
    // No modificar nada del código que sigue
    // if (session.stage === STATES.ASK_LANGUAGE) { ... }
    // if (session.stage === STATES.ASK_NAME) { ... }
    // etc.
```

---

## 📍 PASO 4: Endpoint de Control (Opcional - Línea ~7100, antes de health check)

**AGREGAR NUEVO ENDPOINT:**
```javascript
// ========================================================
// 🎮 CONTROL DEL SISTEMA INTELIGENTE
// Endpoint para activar/desactivar sin reiniciar el servidor
// ========================================================
app.post('/api/admin/intelligent-mode', authenticateAdmin, (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        ok: false,
        error: 'El campo "enabled" debe ser boolean (true/false)'
      });
    }
    
    setIntelligentMode(enabled);
    const status = getIntelligentSystemStatus();
    
    console.log(`[ADMIN] 🔄 Modo inteligente ${enabled ? 'ACTIVADO' : 'DESACTIVADO'} por admin`);
    
    res.json({
      ok: true,
      status,
      message: `Sistema inteligente ${enabled ? 'activado' : 'desactivado'} exitosamente`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ADMIN] Error cambiando modo inteligente:', error);
    res.status(500).json({
      ok: false,
      error: 'Error interno al cambiar modo'
    });
  }
});

// Endpoint de consulta de estado
app.get('/api/admin/intelligent-mode/status', authenticateAdmin, (req, res) => {
  const status = getIntelligentSystemStatus();
  res.json({
    ok: true,
    status,
    message: status.enabled 
      ? 'Sistema inteligente ACTIVADO - usando análisis de intención con OpenAI'
      : 'Sistema inteligente DESACTIVADO - usando lógica legacy basada en stages'
  });
});
```

---

## 📍 PASO 5: Variable de Entorno (.env)

**AGREGAR AL ARCHIVO `.env`:**
```bash
# ========================================================
# 🧠 SISTEMA INTELIGENTE DE TECNOS
# ========================================================
# Activa el motor de análisis de intención con OpenAI
# true = usar sistema inteligente (recomendado)
# false = usar sistema legacy (fallback)
USE_INTELLIGENT_MODE=true

# Nota: Requiere OPENAI_API_KEY configurada
# El sistema usará fallback si OpenAI no está disponible
```

---

## 🎯 VERIFICACIÓN POST-INTEGRACIÓN

### Check 1: Logs al Startup

Al iniciar el servidor, deberías ver:

```
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

[STARTUP] ✅ Sistema inteligente listo
```

### Check 2: Logs durante Conversación

Para un mensaje de usuario, deberías ver:

```
[api/chat] 🔍 Evaluando si usar sistema inteligente...
[IntelligentSystem] 🧠 Procesando con sistema inteligente...
[IntentEngine] 🧠 Analizando intención con OpenAI...
[IntentEngine] ✅ Análisis completado: { intent: 'installation_help', confidence: 0.92 }
[SmartResponse] 🎯 Generando respuesta para intent: installation_help
[api/chat] ✅ Procesado con sistema inteligente
[api/chat] 📊 Intent: installation_help
[api/chat] 📊 Stage: GUIDING_INSTALLATION
[api/chat] 📊 Options: 3
```

### Check 3: Fallback a Legacy

Para mensajes simples que no requieren inteligencia:

```
[api/chat] 🔍 Evaluando si usar sistema inteligente...
[IntelligentSystem] ⏭️ Mensaje simple - usando legacy
[api/chat] ⏭️ Procesando con sistema legacy (stages)
```

---

## 🚨 ERRORES COMUNES Y SOLUCIONES

### Error: "Cannot find module './src/core/integrationPatch.js'"

**Causa:** Ruta incorrecta del import  
**Solución:** Verificar que la carpeta `src/core/` existe y tiene los archivos nuevos

### Error: "handleWithIntelligence is not a function"

**Causa:** Import incorrecto o no destructurado  
**Solución:** Verificar que el import sea:
```javascript
import { handleWithIntelligence } from './src/core/integrationPatch.js';
```
NO:
```javascript
import handleWithIntelligence from './src/core/integrationPatch.js';
```

### Warning: "OpenAI no disponible - sistema inteligente limitado"

**Causa:** API key de OpenAI no configurada o inválida  
**Efecto:** El sistema funcionará con fallback basado en regex (menos preciso)  
**Solución:** Verificar `OPENAI_API_KEY` en `.env`

### Problema: Todo sigue usando legacy, nunca activa inteligente

**Causa:** `USE_INTELLIGENT_MODE=false` en `.env` o no configurado  
**Solución:** Cambiar a `USE_INTELLIGENT_MODE=true` y reiniciar servidor

---

## 📊 TESTING SUGERIDO

### Test A: Instalación (NO debe ofrecer pruebas avanzadas)

```bash
POST /api/chat
{
  "text": "Quiero instalar AnyDesk",
  "sessionId": "test-install-001"
}
```

**Verificar en logs:**
- `Intent: installation_help`
- `Stage: GUIDING_INSTALLATION`
- **NO** debe incluir opciones de "Pruebas Avanzadas"

### Test B: Problema técnico (SÍ debe ofrecer diagnóstico)

```bash
POST /api/chat
{
  "text": "Mi PC no prende",
  "sessionId": "test-problem-001"
}
```

**Verificar en logs:**
- `Intent: technical_problem`
- `Stage: DIAGNOSING_PROBLEM`
- Debe incluir opciones de diagnóstico

### Test C: Botón fuera de contexto (debe rechazar)

```bash
# Primera petición: instalar software
POST /api/chat
{
  "text": "Quiero instalar Chrome",
  "sessionId": "test-validation-001"
}

# Segunda petición: clickear "Pruebas Avanzadas"
POST /api/chat
{
  "buttonToken": "BTN_ADVANCED_TESTS",
  "sessionId": "test-validation-001"
}
```

**Verificar en logs:**
- `Acción inválida en este contexto: intent_mismatch`
- Respuesta: "Las pruebas avanzadas solo aplican..."

---

## ✅ CHECKLIST DE INTEGRACIÓN

- [ ] Imports agregados en server.js
- [ ] Inicialización agregada después de OpenAI setup
- [ ] handleWithIntelligence() llamado en /api/chat ANTES de stages
- [ ] USE_INTELLIGENT_MODE=true agregado a .env
- [ ] Servidor reiniciado
- [ ] Logs de startup muestran "Sistema inteligente listo"
- [ ] Test de instalación no ofrece pruebas avanzadas
- [ ] Test de problema técnico ofrece diagnóstico
- [ ] Test de validación rechaza botón fuera de contexto
- [ ] Logs muestran "Procesado con sistema inteligente"

---

**Próximo paso:** Una vez integrado, testear con conversaciones reales y monitorear logs para ajustar prompts si es necesario.
