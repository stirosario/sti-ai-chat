# 📚 HISTORIAL_CHAT - Sistema de Registro Completo de Conversaciones

## 🎯 Propósito

Este directorio contiene el **historial completo** de todas las conversaciones del chat Tecnos en formato JSON legible.

Cada archivo representa una conversación única y se guarda **indefinidamente** hasta que se decida borrarla manualmente.

---

## 📁 Estructura de Archivos

Cada conversación se guarda como:
```
historial_chat/
  └── [SESSION_ID].json
```

Ejemplo:
```
historial_chat/
  ├── abc123-def456-ghi789.json
  ├── xyz789-uvw456-rst123.json
  └── ...
```

---

## 📋 Formato del Archivo JSON

```json
{
  "id": "abc123-def456-ghi789",
  "fecha_inicio": "2025-12-05T22:30:00.000Z",
  "fecha_ultima_actualizacion": "2025-12-05T22:35:00.000Z",
  "usuario": "Juan Pérez",
  "dispositivo": "desktop",
  "idioma": "es-AR",
  "conversacion": [
    {
      "orden": 1,
      "timestamp": "2025-12-05T22:30:00.000Z",
      "quien": "USUARIO",
      "mensaje": "Hola, necesito ayuda",
      "stage": "ASK_PROBLEM"
    },
    {
      "orden": 2,
      "timestamp": "2025-12-05T22:30:02.000Z",
      "quien": "TECNOS",
      "mensaje": "¡Hola! ¿En qué puedo ayudarte?",
      "stage": "ASK_PROBLEM"
    }
  ],
  "metadata": {
    "total_mensajes": 24,
    "mensajes_usuario": 12,
    "mensajes_bot": 12,
    "stage_inicial": "ASK_LANGUAGE",
    "stage_final": "ENDED",
    "problema_detectado": "PC no enciende",
    "solucion_aplicada": true,
    "ticket_generado": "TICKET-12345",
    "imagenes_enviadas": 2
  }
}
```

---

## 🔍 Cómo Buscar una Conversación

### Método 1: Por ID mostrado al usuario

Cuando un usuario acepta la política de privacidad, se le muestra:

```
🆔 abc123-def456-ghi789

✅ Gracias por aceptar
```

Ese ID es el nombre del archivo sin `.json`:
```bash
historial_chat/abc123-def456-ghi789.json
```

### Método 2: API Endpoint

```bash
GET /api/historial/:conversationId?token=LOG_TOKEN
```

Ejemplo:
```bash
curl "https://sti-rosario-ai.onrender.com/api/historial/abc123-def456-ghi789?token=TU_LOG_TOKEN"
```

### Método 3: Función Helper en Servidor

Desde `server.js`:
```javascript
const conversacion = readHistorialChat('abc123-def456-ghi789');
// Imprime la conversación formateada en consola
```

---

## 🤖 Uso con Copilot

### Workflow Recomendado:

1. **Usuario reporta problema** en el chat
2. **Copias el ID** de conversación que se muestra al inicio
3. **Dices a Copilot:**
   ```
   Copilot, revisa en archivo HISTORIAL_CHAT la conversación con ID: 'abc123-def456-ghi789'
   ```

4. **Copilot lee el archivo** y analiza:
   - ¿Qué preguntó el usuario?
   - ¿Cómo respondió el bot?
   - ¿Hubo loops o confusión?
   - ¿Se aplicó la solución correcta?
   - ¿Se generó ticket?

5. **Copilot sugiere correcciones** en:
   - Flujos de conversación
   - Respuestas del bot
   - Detección de intención (NLP)
   - Stage transitions

---

## 📊 Campos Importantes

### `conversacion[]`
Array ordenado cronológicamente con todos los mensajes intercambiados.

- **orden**: Número secuencial (1, 2, 3...)
- **timestamp**: Hora exacta del mensaje
- **quien**: "USUARIO" o "TECNOS"
- **mensaje**: Texto completo del mensaje
- **stage**: Estado del flujo en ese momento

### `metadata`
Resumen estadístico de la conversación:

- **total_mensajes**: Cantidad total de intercambios
- **mensajes_usuario/bot**: Desglose por emisor
- **stage_inicial/final**: Flujo de inicio y cierre
- **problema_detectado**: Qué necesitaba el usuario
- **solucion_aplicada**: Si se resolvió el problema (true/false)
- **ticket_generado**: ID del ticket si se escaló
- **imagenes_enviadas**: Cantidad de fotos compartidas

---

## 🔒 Seguridad y Privacidad

### Retención de Datos
- **Guardado**: Indefinido (no se borran automáticamente)
- **Borrado**: Manual por administrador
- **GDPR**: Usuario puede solicitar eliminación

### Control de Acceso
El endpoint `/api/historial/:id` requiere:
1. **Session ID coincidente** (usuario solo ve su propia conversación)
2. O **LOG_TOKEN válido** (admin puede ver todas)

### Datos Sensibles
- Nombres de usuarios se guardan tal cual
- Si hay PII sensible, considerar enmascarar
- Cumple con GDPR si se permite eliminar bajo demanda

---

## 🛠️ Mantenimiento

### Borrar Conversación Específica
```bash
rm data/historial_chat/abc123-def456-ghi789.json
```

### Borrar Conversaciones Antiguas (ejemplo: >30 días)
```bash
find data/historial_chat -name "*.json" -mtime +30 -delete
```

### Listar Todas las Conversaciones
```bash
ls data/historial_chat/*.json
```

### Ver Conversación en Terminal
```bash
cat data/historial_chat/abc123-def456-ghi789.json | jq
```

---

## 📈 Análisis Estadístico

### Contar Total de Conversaciones
```bash
ls data/historial_chat/*.json | wc -l
```

### Buscar Conversaciones con Problemas Específicos
```bash
grep -r "PC no enciende" data/historial_chat/
```

### Listar Conversaciones con Tickets Generados
```bash
grep -l "ticket_generado" data/historial_chat/*.json
```

---

## 🔄 Diferencia con `transcripts/`

### `transcripts/` (para Codex - Análisis Automático)
- Formato optimizado para detección de problemas
- Incluye análisis NLP y transiciones de stage
- Usado por el panel Codex para debugging

### `historial_chat/` (para Análisis Manual - Copilot)
- Formato legible y simple
- Foco en conversación cronológica
- Diseñado para review humano/Copilot
- Incluye metadata resumida

**Ambos se guardan simultáneamente** en cada conversación.

---

## 💡 Casos de Uso

### 1. Debugging de Problema Reportado
Usuario dice: "El bot no me entendió"
→ Buscas su ID de conversación
→ Lees el JSON
→ Verificas qué stage estaba y qué respondió

### 2. Análisis de Patrones
¿Los usuarios abandonan en algún stage específico?
→ Buscas conversaciones incompletas
→ Verificas en qué `stage_final` terminaron

### 3. Mejora de Respuestas
¿Las respuestas del bot son claras?
→ Lees varias conversaciones exitosas
→ Comparas con conversaciones problemáticas

### 4. Training de NLP
¿Qué palabras usa el usuario para describir problemas?
→ Extraes todos los mensajes de usuarios
→ Identificas patrones de lenguaje

---

## 📝 Ejemplo de Análisis con Copilot

**Prompt:**
```
Copilot, revisa en archivo HISTORIAL_CHAT la conversación con ID: 'abc123-def456-ghi789'

Analiza:
1. ¿El usuario logró resolver su problema?
2. ¿Hubo momentos de confusión?
3. ¿El bot detectó correctamente el dispositivo?
4. ¿Se aplicó la solución correcta?
5. Sugiere mejoras en las respuestas del bot
```

**Copilot responderá:**
```
Analicé la conversación abc123-def456-ghi789:

✅ Problema: Usuario reportó "PC no enciende"
✅ Dispositivo detectado: Desktop (correcto)
⚠️  Confusión en stage ASK_PROBLEM: El bot no entendió "no prende"
❌ Solución incorrecta: El bot sugirió pasos para notebook en lugar de desktop

Mejoras sugeridas:
1. Agregar sinónimo "no prende" = "no enciende" en NLP
2. Validar que los pasos de diagnóstico coincidan con el dispositivo detectado
3. Agregar confirmación antes de cambiar de dispositivo
```

---

## 🚀 Integración con Workflows

### Flujo Completo:

```
Usuario usa chat
    ↓
Acepta privacidad → Se muestra ID
    ↓
Conversación completa
    ↓
Se guarda en historial_chat/ID.json
    ↓
Usuario reporta problema
    ↓
Admin/Dev copia ID
    ↓
Pide a Copilot: "Revisa conversación ID:XXX"
    ↓
Copilot analiza y sugiere fixes
    ↓
Se aplican mejoras en flujos/NLP
    ↓
Próximas conversaciones mejoran
```

---

## ✅ Checklist de Funcionalidad

- [x] Directorio `historial_chat/` creado
- [x] Cada conversación se guarda en JSON legible
- [x] ID único mostrado al usuario después de aceptar privacidad
- [x] Formato cronológico: USUARIO → TECNOS → USUARIO
- [x] Metadata completa (total mensajes, stages, solución, tickets)
- [x] Endpoint API `/api/historial/:id` con autenticación
- [x] Función helper `readHistorialChat(id)` para consola
- [x] Retención indefinida (borrado manual)
- [x] Compatible con análisis por Copilot
- [x] Diferenciado de `transcripts/` (propósitos distintos)

---

## 📚 Recursos Adicionales

- **Codex Panel**: Para análisis automático de problemas
- **Transcripts**: Formato técnico con NLP y stage transitions
- **Tickets**: Sistema de escalamiento a WhatsApp
- **Logs**: Registro del servidor completo

---

**Última actualización:** 2025-12-05
**Versión:** 1.0
**Mantenedor:** Sistema Tecnos
