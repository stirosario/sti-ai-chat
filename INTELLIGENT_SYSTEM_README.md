# 🧠 Sistema Inteligente de Tecnos - Documentación de Integración

## 📋 Resumen

Este sistema reemplaza la lógica rígida basada en **stages lineales** por un **motor de intención inteligente** que:

✅ Analiza cada mensaje con OpenAI para entender la intención REAL  
✅ Valida que las acciones sean coherentes con el contexto  
✅ Genera respuestas dinámicas en lugar de usar texto hardcodeado  
✅ Evita saltos ilógicos (ej: "Pruebas Avanzadas" cuando el usuario quiere instalar algo)  
✅ Mantiene coherencia contextual durante toda la conversación  

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  server.js (Endpoint /api/chat)                              │
│  ↓                                                            │
│  🔀 Feature Flag: USE_INTELLIGENT_MODE=true                  │
│  ↓                                                            │
│  integrationPatch.handleWithIntelligence()                   │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  intelligentChatHandler.js                                   │
│  - Orquesta el flujo inteligente                            │
│  - Valida contexto de acciones                              │
│  - Decide si usar modo inteligente                          │
└──────────────────────────────────────────────────────────────┘
        ↓                           ↓
┌─────────────────────┐   ┌───────────────────────────────────┐
│  intentEngine.js    │   │  smartResponseGenerator.js        │
│  - Analiza intención│   │  - Genera respuestas dinámicas    │
│  - Clasifica con AI │   │  - Determina opciones coherentes  │
│  - Valida acciones  │   │  - Propone próxima acción lógica  │
└─────────────────────┘   └───────────────────────────────────┘
        ↓                           ↓
┌──────────────────────────────────────────────────────────────┐
│  aiService.js - Cliente OpenAI centralizado                  │
└──────────────────────────────────────────────────────────────┘
```

## 🚀 Integración en server.js

### Paso 1: Importar el módulo de integración

Agregar al inicio de `server.js` (después de los otros imports):

```javascript
// 🧠 SISTEMA INTELIGENTE - Nuevo motor de intención
import { 
  initializeIntelligentSystem, 
  handleWithIntelligence,
  setIntelligentMode,
  getIntelligentSystemStatus
} from './src/core/integrationPatch.js';
```

### Paso 2: Inicializar el sistema al startup

En el bloque de inicialización del servidor (donde se configura OpenAI), agregar:

```javascript
// Inicializar sistema inteligente
const USE_INTELLIGENT_MODE = process.env.USE_INTELLIGENT_MODE === 'true';
console.log(`[STARTUP] 🧠 Modo Inteligente: ${USE_INTELLIGENT_MODE ? 'ACTIVADO' : 'DESACTIVADO'}`);

const intelligentSystemStatus = initializeIntelligentSystem(
  process.env.OPENAI_API_KEY,
  USE_INTELLIGENT_MODE
);

if (intelligentSystemStatus.enabled) {
  console.log('[STARTUP] ✅ Sistema inteligente listo');
  console.log('[STARTUP] 🤖 OpenAI disponible:', intelligentSystemStatus.hasOpenAI);
} else {
  console.log('[STARTUP] ⏭️ Usando sistema legacy (stages rígidos)');
}
```

### Paso 3: Modificar el endpoint /api/chat

**UBICACIÓN:** Dentro del handler de `/api/chat`, justo después de validar la sesión y ANTES de procesar los stages.

**BUSCAR** esta línea (o similar):
```javascript
const session = await getSession(sid);
// ... validaciones de sesión ...
```

**AGREGAR** inmediatamente después:

```javascript
// ========================================================
// 🧠 SISTEMA INTELIGENTE - Procesamiento prioritario
// ========================================================
// Si el modo inteligente está activado y el mensaje lo requiere,
// procesar con el motor de intención en lugar de la lógica legacy
// ========================================================

const intelligentResponse = await handleWithIntelligence(req, res, session, t, buttonToken);

if (intelligentResponse) {
  // El sistema inteligente procesó exitosamente el mensaje
  console.log('[api/chat] ✅ Procesado con sistema inteligente');
  
  // Guardar sesión actualizada
  await saveSessionAndTranscript(sid, session);
  
  // Enviar respuesta y terminar
  return res.json(intelligentResponse);
}

// Si llegó aquí, usar lógica legacy (no se activó el modo inteligente)
console.log('[api/chat] ⏭️ Procesando con sistema legacy');

// ... continúa con la lógica basada en stages existente ...
```

## 🎮 Control de Feature Flag

### Variables de Entorno

Agregar al `.env`:

```bash
# Sistema Inteligente de Tecnos
USE_INTELLIGENT_MODE=true   # true = usar sistema inteligente, false = legacy
```

### Control Dinámico en Runtime

Para cambiar el modo sin reiniciar el servidor, agregar endpoint de admin:

```javascript
// Endpoint de control (solo admin)
app.post('/api/admin/intelligent-mode', authenticateAdmin, (req, res) => {
  const { enabled } = req.body;
  setIntelligentMode(enabled);
  
  res.json({
    ok: true,
    status: getIntelligentSystemStatus(),
    message: `Modo inteligente ${enabled ? 'activado' : 'desactivado'}`
  });
});
```

## 🧪 Testing

### Test 1: Instalación (NO debe ofrecer pruebas avanzadas)

**Input:**
```
Usuario: "Quiero instalar AnyDesk"
```

**Comportamiento esperado con modo inteligente:**
```
Tecnos: "Claro, te ayudo a instalar AnyDesk. ¿Qué sistema operativo estás usando?"
Opciones:
  - 📖 Mostrar Guía Paso a Paso
  - ❓ Tengo preguntas
  - 🚪 Cerrar Chat
```

**NO debe mostrar:** Pruebas Avanzadas, Conectar Técnico (a menos que el usuario lo pida)

### Test 2: Problema técnico (SÍ debe ofrecer diagnóstico)

**Input:**
```
Usuario: "Mi PC no prende"
```

**Comportamiento esperado:**
```
Tecnos: "Entiendo que es frustrante. Vamos a diagnosticar el problema. [explicación empática]"
Opciones:
  - 🔧 Empezar Diagnóstico
  - 👨‍💻 Conectar con Técnico
  - 🚪 Cerrar Chat
```

### Test 3: Validación de botón fuera de contexto

**Escenario:**
```
1. Usuario: "Quiero instalar Chrome"
2. Tecnos: [respuesta de instalación]
3. Usuario: [clickea botón "🔬 Pruebas Avanzadas" heredado]
```

**Comportamiento esperado:**
```
Tecnos: "Las pruebas avanzadas solo aplican para problemas técnicos después de haber intentado pasos básicos. ¿Querés que te ayude con otra cosa?"
Opciones:
  - 💬 Decime qué necesitás
  - 🚪 Cerrar Chat
```

### Test 4: Ambigüedad (debe pedir aclaración)

**Input:**
```
Usuario: "está mal"
```

**Comportamiento esperado:**
```
Tecnos: "Quiero ayudarte, pero necesito entender mejor qué necesitás. ¿Podrías contarme:
• ¿Tenés un problema con algo que no funciona?
• ¿Querés instalar o configurar algo?
• ¿Tenés una pregunta sobre cómo hacer algo?"
[sin botones, esperando texto libre]
```

## 📊 Monitoreo

Logs a observar:

```
[IntelligentSystem] 🧠 Procesando con sistema inteligente...
[IntentEngine] 🧠 Analizando intención con OpenAI...
[IntentEngine] ✅ Análisis completado: { intent: 'installation_help', confidence: 0.92 }
[SmartResponse] 🎯 Generando respuesta para intent: installation_help
[IntelligentChat] ✅ Respuesta generada exitosamente
[api/chat] ✅ Procesado con sistema inteligente
```

Si hay validación rechazada:

```
[IntelligentChat] 🔍 Validando botón en contexto...
[IntelligentChat] ⚠️ Acción inválida en este contexto: intent_mismatch
```

## 🔧 Troubleshooting

### Problema: "Modo inteligente desactivado - usando legacy"

**Causa:** Feature flag no está activado  
**Solución:** Verificar `USE_INTELLIGENT_MODE=true` en `.env` y reiniciar

### Problema: "OpenAI no disponible - sistema inteligente limitado"

**Causa:** API key de OpenAI inválida o no configurada  
**Solución:** Verificar `OPENAI_API_KEY` en `.env`

### Problema: Respuestas siguen siendo ilógicas

**Causa:** El sistema legacy se está ejecutando (el inteligente no se activó)  
**Verificación:** Buscar logs `[api/chat] ✅ Procesado con sistema inteligente`  
**Solución:** El sistema inteligente solo se activa para:
- Texto libre (no botones predefinidos)
- Botones problemáticos (BTN_ADVANCED_TESTS, etc.)
- Contextos ambiguos

### Problema: Error "Cannot find module"

**Causa:** Los imports ESM no están configurados correctamente  
**Solución:** Verificar que `package.json` tenga `"type": "module"`

## 🎯 Próximos Pasos

1. ✅ **Integrar en server.js** siguiendo esta guía
2. ✅ **Testear en desarrollo** con `USE_INTELLIGENT_MODE=true`
3. ✅ **Comparar comportamiento** legacy vs inteligente
4. ✅ **Ajustar prompts** en `intentEngine.js` si es necesario
5. ✅ **Desplegar a producción** cuando esté testeado
6. ✅ **Monitorear logs** para detectar casos edge
7. ✅ **Iterar y mejorar** basándose en conversaciones reales

## 📝 Notas Importantes

- ⚠️ El sistema legacy **NO se elimina** - sigue funcionando como fallback
- ⚠️ Si OpenAI falla, el sistema inteligente usa fallback basado en regex
- ⚠️ Los stages siguen existiendo pero son DESCRIPTIVOS, no prescriptivos
- ⚠️ El transcript guarda el `intentDetected` para análisis posterior
- ⚠️ Feature flag permite A/B testing: algunos usuarios legacy, otros inteligente

## 🆘 Soporte

Para dudas o problemas con la integración:
1. Revisar logs con `[IntelligentSystem]` y `[IntentEngine]`
2. Verificar que OpenAI esté respondiendo correctamente
3. Testear con diferentes tipos de mensajes (instalación, problema, how-to)
4. Comparar con el comportamiento legacy esperado

---

**Creado por:** STI AI Team  
**Fecha:** 2025-12-06  
**Versión:** 1.0.0
