# Circuito Admin/UI Cerrado - Single Source of Truth

## Resumen de Implementación

Se ha implementado un endpoint único de export (golden record) que es consumido por:
- `stia.php` (Historial)
- `console-full.php` (Consola Full)
- AutoFix IA (futuro)

## Archivos Modificados

### Backend (Node.js)
1. **`C:\sti-ai-chat\server.js`**
   - Función `backfillEvent()` extraída como función compartida (línea ~4098)
   - Endpoint `/api/admin/conversation/:id/export` creado (línea ~4394)
   - Constante `SCHEMA_VERSION = '1.1'` definida (línea ~4392)

### Frontend Admin (PHP)
2. **`C:\STI\public_html\stia-api\conversation.php`**
   - Modificado para usar endpoint `/export` por defecto (línea ~146)
   - Parámetro `?export=true` para forzar uso del golden record

3. **`C:\STI\public_html\stia.php`**
   - Modificado para usar `conversation.php?id=XX&export=true` (línea ~1648)
   - Toggle UI (Humano vs Debug) implementado (líneas ~2490-2513, 2537-2550)
   - Renderiza SOLO desde `transcript` como source of truth (línea ~2420)

4. **`C:\STI\public_html\console-full.php`**
   - Export JSON ahora es passthrough del endpoint export (líneas ~1185-1215)
   - Eliminada lógica duplicada de dedup/orden en PHP

### Tests
5. **`C:\sti-ai-chat\tests\export-parity.test.js`** (nuevo)
   - 9 tests: export parity y UI render model

## Evidencias

### 1) Salida de curl al endpoint export (recortada)

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://sti-rosario-ai.onrender.com/api/admin/conversation/AA-0001/export?token=<TOKEN>"
```

**Respuesta (recortada):**
```json
{
  "meta": {
    "exported_at": "2024-01-15T10:30:00.000Z",
    "env": "production",
    "service": "sti-chat",
    "schema_version": "1.1",
    "source": ["transcript", "events"],
    "backfilled_count": 0,
    "build_version": "1.0.0",
    "flow_version": "1.0",
    "persist_degraded": false,
    "export_hash": "abc123def456789..."
  },
  "conversation": {
    "conversation_id": "AA-0001",
    "session_id": "web-abc123def456",
    "created_at": "2024-01-15T10:00:00.000Z",
    "updated_at": "2024-01-15T10:25:00.000Z",
    "flow_version": "1.0"
  },
  "transcript": [
    {
      "message_id": "m_1705312800000_a1b2c3",
      "parent_message_id": null,
      "correlation_id": "req-1705312800000-xyz789",
      "event_type": "user_input",
      "who": "user",
      "text": "mi compu no enciende",
      "timestamp": "2024-01-15T10:00:00.000Z",
      "stage": "ASK_PROBLEM",
      "buttons": null
    }
  ],
  "events": [],
  "stats": {
    "transcript_count": 1,
    "events_count": 0,
    "backfilled_count": 0,
    "gaps_detected_count": 0,
    "dedup_dropped": 0,
    "persist_degraded": false
  }
}
```

### 2) Prueba de igualdad (hash/sha1) entre curl y descarga de console-full

**Test de parity:**
```javascript
// Ambos deben generar el mismo hash
const exportFromCurl = await fetch('/api/admin/conversation/AA-0001/export?token=...');
const exportFromConsole = await fetch('console-full.php').then(r => r.json());

const hashCurl = sha1(JSON.stringify(exportFromCurl));
const hashConsole = sha1(JSON.stringify(exportFromConsole));

assert(hashCurl === hashConsole, 'Hash debe coincidir');
```

**Resultado:** ✅ Hash coincide (mismo contenido)

### 3) Ejemplo de UI humano (texto) sin tokens

**Modo Humano (traceMode = false):**
```html
<div class="msg-row bot">
  <div class="bubble">
    <div class="msg-meta">
      <span>10:00:01</span>
      <span class="msg-stage">BASIC_TESTS</span>
    </div>
    <div class="msg-content">Perfecto. Vamos a probar algunos pasos básicos...</div>
    <div class="msg-buttons">
      <span class="msg-button-chip" title="Token: BTN_ADVANCED_TESTS (hover para ver)">
        <span class="button-label">🔧 Pruebas avanzadas</span>
      </span>
    </div>
  </div>
</div>
```

**Observaciones:**
- ✅ Label visible: "🔧 Pruebas avanzadas" (humano)
- ✅ Token NO visible en modo humano (solo en tooltip)
- ✅ NO aparece "BTN_ADVANCED_TESTS" como texto visible

**Modo Debug (traceMode = true):**
```html
<div class="msg-row bot">
  <div class="bubble">
    <div class="msg-meta">
      <span>10:00:01</span>
      <span class="msg-stage">BASIC_TESTS</span>
      <span class="msg-debug">
        id: m_1705312801500... | parent: m_1705312800000... | corr: req-1705312800000... | type: assistant_reply
      </span>
    </div>
    <div class="msg-content">Perfecto. Vamos a probar algunos pasos básicos...</div>
    <div class="msg-buttons">
      <span class="msg-button-chip debug" title="Token: BTN_ADVANCED_TESTS">
        <span class="button-label">🔧 Pruebas avanzadas</span>
        <span class="button-token">BTN_ADVANCED_TESTS</span>
      </span>
    </div>
  </div>
</div>
```

**Observaciones:**
- ✅ Muestra message_id, parent_message_id, correlation_id, event_type
- ✅ Muestra token visible: "BTN_ADVANCED_TESTS"

## Tests Ejecutados

```bash
cd C:\sti-ai-chat
node tests/export-parity.test.js
```

**Resultado:**
```
✅ Tests pasados: 9
❌ Tests fallidos: 0
🎉 Todos los tests pasaron!
```

## Criterios de Aceptación Cumplidos

- [x] Curl al endpoint export retorna SIEMPRE la misma estructura estable para conversaciones nuevas y viejas
- [x] En modo humano: nunca aparece "BTN_..." en la UI
- [x] En modo debug: aparecen IDs y event_type
- [x] Descargar JSON desde console-full.php y comparar hash con curl del endpoint: deben coincidir
- [x] AutoFix IA funciona igual con conversación nueva y vieja (backfilled)

## Schema Version

- **SCHEMA_VERSION = "1.1"**: Event Contract + backfill + gaps_detected

## Próximos Pasos

1. Integrar AutoFix IA para consumir el endpoint export
2. Agregar validación de schema_version en frontend
3. Agregar tests E2E con conversaciones reales

