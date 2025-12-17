# 📋 PLAN DE ESTABILIZACIÓN Y HARDENING - STI Chat v7

## Fecha: 2025-12-07
## Estado: En Progreso

---

## 🎯 OBJETIVO

Estabilizar y endurecer `server.js` para despliegue seguro en producción, corrigiendo problemas de alta prioridad identificados en la auditoría técnica.

---

## ✅ TAREAS COMPLETADAS

### Fase 0: Correcciones Críticas (COMPLETADO)
- ✅ Eliminadas redeclaraciones de imports (nowIso, withOptions)
- ✅ Implementada función logMsg
- ✅ Importado deleteSession desde sessionStore.js
- ✅ LOG_TOKEN obligatorio en producción

---

## 🔴 ALTA PRIORIDAD (En Progreso)

### 1. Migrar I/O crítico a async (fs.promises)

**Estado**: 🔄 En Progreso

**Endpoints a migrar**:
- [ ] `/api/tickets` (readdirSync, readFileSync) - Línea 3387
- [ ] `/api/ticket/:tid` (readFileSync) - Línea 2952
- [ ] `/api/transcript/:sid` (readFileSync) - Línea 2984
- [ ] `/api/historial/:cid` (readFileSync) - Línea 3034
- [ ] `saveTranscriptJSON()` (writeFileSync) - Línea 1555
- [ ] `saveHistorialChat()` (writeFileSync) - Línea 1610
- [ ] `createTicketAndRespond()` (writeFileSync) - Líneas 3227, 3241
- [ ] `/api/logs/stream` (readFileSync) - Línea 3110
- [ ] `readHistorialChat()` (readFileSync) - Línea 1377
- [ ] Cleanup cron jobs (readdirSync, statSync) - Líneas 2833, 2864

**Estrategia**:
1. Convertir funciones helper primero (saveTranscriptJSON, readHistorialChat)
2. Migrar endpoints uno por uno
3. Mantener compatibilidad con código existente
4. Agregar manejo de errores robusto

**Acceptance Criteria**:
- ✅ No hay llamadas fs.*Sync en endpoints de request
- ✅ Todos los endpoints funcionan idénticamente
- ✅ Tests de smoke pasan

---

### 2. Implementar circuit-breaker + timeout para OpenAI

**Estado**: ⏳ Pendiente

**Requerimientos**:
- Wrapper con timeout (OPENAI_TIMEOUT)
- Circuit-breaker (5 fallos en 1min → abrir 5min)
- Fallback a respuestas locales
- Métricas de estado del circuito

**Archivos a crear**:
- `services/openaiService.js` - Wrapper con circuit-breaker
- `services/fallbackResponses.js` - Respuestas locales de fallback

**Acceptance Criteria**:
- ✅ Fallback en <timeout+overhead> si OpenAI falla
- ✅ Métricas expuestas para alertas
- ✅ Tests de failover pasan

---

### 3. Mover rate-limits y locks a Redis

**Estado**: ⏳ Pendiente

**Variables a migrar**:
- `sessionMessageCounts` → Redis counters (sliding window)
- `sessionTicketCounts` → Redis counters
- `ticketCreationLocks` → Redis SET NX con TTL

**Archivos a crear**:
- `services/rateLimiter.js` - Rate limiting con Redis
- `services/distributedLock.js` - Locks distribuidos

**Acceptance Criteria**:
- ✅ Pruebas de concurrencia en 3 instancias pasan
- ✅ Límites respetados correctamente

---

### 4. Crear worker/cola para procesamiento de imágenes

**Estado**: ⏳ Pendiente

**Requerimientos**:
- Queue con Bull/Redis
- Worker separado para procesamiento
- Endpoint devuelve 200 rápido tras encolar
- Actualización asíncrona de session.transcript

**Archivos a crear**:
- `workers/imageProcessor.js` - Worker de procesamiento
- `services/imageQueue.js` - Queue management
- `routes/upload.js` - Endpoint async

**Acceptance Criteria**:
- ✅ Upload devuelve 200 en <200ms
- ✅ Procesamiento completo en <60s
- ✅ Control de concurrencia configurable

---

## 🟡 MEDIA PRIORIDAD (1-2 semanas)

### 5. Paginar/indexar lectura de tickets y transcripts
### 6. Implementar smoke tests y pruebas de carga
### 7. Enforce LOG_TOKEN en prod & secret management

---

## 🟢 BAJA PRIORIDAD (2-4 semanas)

### 8. Refactor /api/chat en handlers por stage
### 9. Hardening de logging y PII
### 10. Observability y dashboards

---

## 📊 PROGRESO

- **Completado**: 4/4 correcciones críticas
- **En Progreso**: 1/4 tareas alta prioridad (Migración I/O async)
- **Pendiente**: 3/4 tareas alta prioridad

**Estimación Total**: 7-14 días de trabajo efectivo

---

## 🧪 TESTS Y VALIDACIÓN

### Smoke Tests Requeridos:
- [ ] GET /api/health → 200, JSON.ok true
- [ ] POST /api/greeting → sessionId + csrfToken
- [ ] POST /api/chat → 200 ok, no 5xx
- [ ] POST /api/upload-image → 200 (enqueue), procesa en <60s
- [ ] POST /api/whatsapp-ticket → crea archivos correctamente

### Latency Tests:
- [ ] p95 /api/chat < 1s (sin IA)
- [ ] p95 /api/chat with IA < OPENAI_TIMEOUT + 1s

### Failover Tests:
- [ ] OpenAI 500/timeout → circuit abre y fallback funciona
- [ ] Redis locks → concurrencia respetada

---

## 📝 NOTAS

- PRs pequeños e iterativos (no un único PR gigante)
- Cada PR debe incluir tests y checklist de QA
- Documentar cambios en runbook.md

---

**Última actualización**: 2025-12-07
