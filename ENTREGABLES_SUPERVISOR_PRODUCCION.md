# 📦 ENTREGABLES PARA SUPERVISOR DE PRODUCCIÓN

## Fecha: 2025-12-07
## Estado: ⏳ **PENDIENTE DE ENTREGA POR EQUIPO**

---

## 🎯 RESUMEN EJECUTIVO

Este documento concentra los entregables específicos requeridos por el Supervisor de Producción para autorizar el despliegue canario. Cada responsable debe completar su sección y proporcionar los enlaces/evidencias solicitadas.

---

## 🔴 BLOQUERS - ENTREGABLES OBLIGATORIOS

### 1. PR Final Aprobado y Mergeable

**Responsable**: Dev Lead  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
PR Link: [PEGAR ENLACE AL PR]
Branch: feature/openai-circuit-breaker (o nombre del branch)
Reviewers asignados:
  - Backend Lead: @backend-lead
  - SRE: @sre-lead
Estado CI: [PEGAR SCREENSHOT O URL DEL CI VERDE]
```

**Commits incluidos**:
- [ ] Correcciones críticas de auditoría (logMsg, deleteSession, LOG_TOKEN)
- [ ] Migración I/O async (fs.promises)
- [ ] Circuit-breaker para OpenAI (si está implementado)

---

### 2. CI Verde (Build + Lint + Unit Tests)

**Responsable**: Dev/CI Engineer  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
CI Job URL: [PEGAR URL DEL JOB CI]
Status: ✅ PASSED
Build: ✅ Exit code 0
Lint: ✅ Zero errors
Tests: ✅ [X] tests passed
Coverage: [X]% (si aplica)
Screenshot: [PEGAR SCREENSHOT DEL CI VERDE]
```

---

### 3. Smoke Tests Pasados en Staging/Canary

**Responsable**: QA  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**: Pegar salida completa de cada comando

```bash
# ============================================
# SMOKE TEST 1: /api/health
# ============================================
$ curl -sS -X GET "http://staging-host/api/health" | jq
[PEGAR SALIDA AQUÍ]

# ============================================
# SMOKE TEST 2: /api/greeting
# ============================================
$ curl -sS -X POST "http://staging-host/api/greeting" \
  -H "Content-Type: application/json" -d '{}' | jq
[PEGAR SALIDA AQUÍ]
SessionId obtenido: [PEGAR SESSION ID]

# ============================================
# SMOKE TEST 3: /api/session/validate
# ============================================
$ curl -sS -X POST "http://staging-host/api/session/validate" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>"}' | jq
[PEGAR SALIDA AQUÍ]

# ============================================
# SMOKE TEST 4: /api/chat (mínimo flujo)
# ============================================
$ time curl -sS -X POST "http://staging-host/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>","message":"hola"}' | jq
[PEGAR SALIDA AQUÍ]
Tiempo de respuesta: [X]s (debe ser <2s)

# ============================================
# SMOKE TEST 5: /api/upload-image
# ============================================
$ curl -sS -X POST "http://staging-host/api/upload-image" \
  -H "x-session-id: <sid>" \
  -F "image=@./test/fixture.jpg" | jq
[PEGAR SALIDA AQUÍ]

# ============================================
# SMOKE TEST 6: /api/whatsapp-ticket
# ============================================
$ curl -sS -X POST "http://staging-host/api/whatsapp-ticket" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>"}' | jq
[PEGAR SALIDA AQUÍ]

# ============================================
# SMOKE TEST 7: /api/logs
# ============================================
$ curl -sS -X GET "http://staging-host/api/logs?token=<LOG_TOKEN>" | head -n 40
[PEGAR SALIDA AQUÍ]
```

**Criterio de aceptación**:
- ✅ Todas las respuestas sin 5xx
- ✅ /api/chat responde en <2s (sin IA)

---

### 4. LOG_TOKEN y Secrets en Secret Manager

**Responsable**: SRE / Security  
**Deadline**: 24h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Proof-of-provision (screenshot/metadata - NO valores):
[PEGAR SCREENSHOT O METADATA DEL SECRET MANAGER]

Secrets confirmados:
- [x] LOG_TOKEN (existe, policy configurada)
- [ ] OPENAI_API_KEY (existe, policy configurada)
- [ ] WHATSAPP_NUMBER (existe, policy configurada)
- [ ] DB_CREDENTIALS (si aplica)

Access Policy:
[PEGAR EXPORT DE POLICY O DESCRIPCIÓN]
```

---

### 5. Backups y Retention

**Responsable**: SRE  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Política de Backup:
- Retention: [X] días
- Destino: [S3 bucket / mounted storage path]
- Frecuencia: [Diario / Semanal / etc.]

Prueba de Backup Manual:
[PEGAR LOG DE BACKUP EJECUTADO]

Restore Test:
[PEGAR INSTRUCCIONES O LOG DE RESTORE TEST]
```

---

### 6. Docker Image + Security Scan

**Responsable**: Dev / SRE  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Docker Image:
- Registry: [URL DEL REGISTRY]
- Tag: [TAG/SHA]
- Link: [LINK AL IMAGE EN REGISTRY]

Security Scan (Trivy/Snyk):
- Scanner usado: [Trivy / Snyk / Otro]
- Report URL: [LINK AL REPORT]
- Vulnerabilidades críticas: [0]
- Vulnerabilidades altas: [X] (mitigadas: [X])
- Vulnerabilidades medias: [X] (mitigadas: [X])
- Screenshot: [PEGAR SCREENSHOT DEL REPORT]
```

---

## 🟡 INFRAESTRUCTURA Y OBSERVABILIDAD

### 7. Redis Disponible y Configurado

**Responsable**: SRE  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Redis Configuration:
- Host:Port: [host:port]
- Access Policy: [DESCRIPCIÓN O EXPORT]

Test Connection:
$ redis-cli -h [host] -p [port] ping
[PEGAR SALIDA: debe ser "PONG"]

$ telnet [host] [port]
[PEGAR SALIDA DE CONEXIÓN EXITOSA]
```

---

### 8. Worker/Queue para Procesamiento de Imágenes

**Responsable**: SRE + Dev  
**Deadline**: 72h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Worker Image:
- Registry: [URL]
- Tag: [TAG/SHA]
- Branch/PR: [LINK]

Concurrency Proposal:
- Máximo workers: [X]
- Concurrencia por worker: [X]
- Total capacidad: [X] jobs simultáneos

Queue Config:
- Queue type: [Bull / Redis Queue / Otro]
- Redis connection: [host:port]
- Test job processed: [PEGAR LOG DE JOB PROCESADO]
```

---

### 9. Grafana Dashboards + Prometheus Alert Rules

**Responsable**: SRE / Observability  
**Deadline**: 72h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Grafana Dashboard:
- URL: [LINK AL DASHBOARD]
- JSON Export: [LINK O ARCHIVO ADJUNTO]

Panels incluidos:
- [x] p95/p99 latency /api/chat
- [x] error rate 5xx
- [x] OpenAI latency & failures
- [x] upload queue length, worker success/failure
- [x] disk usage (UPLOADS_DIR), memory, CPU

Prometheus Alert Rules:
- Error rate 5xx > 0.5% (5m) → PagerDuty: [CONFIGURADA]
- p95 latency > 2s (5m) → Slack + PagerDuty: [CONFIGURADA]
- OpenAI failures > 5% or avg latency > 3s → warn: [CONFIGURADA]
- Disk free < 10% → PagerDuty: [CONFIGURADA]

Alert Rules Export: [LINK O ARCHIVO]
```

---

### 10. Metrics Endpoint / App Metrics

**Responsable**: Dev  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Metrics Endpoint:
- URL: [http://staging-host/api/metrics] o [Prometheus exporter]
- Sample Output:
[PEGAR EJEMPLO DE SALIDA CON MÉTRICAS]

Métricas expuestas:
- openai.requests: [CONFIRMADO]
- openai.failures: [CONFIRMADO]
- uploads.avgAnalysisTime: [CONFIRMADO]
- chat.totalMessages: [CONFIRMADO]
```

---

## 🟡 RESILIENCIA IA

### 11. Circuit-Breaker + Timeout para OpenAI

**Responsable**: Dev  
**Deadline**: 72h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
PR/Branch:
- Link: [LINK AL PR "feature/openai-circuit-breaker"]
- Branch: feature/openai-circuit-breaker
- CI Status: [✅ VERDE / ⏳ PENDIENTE]

Implementación:
- Archivo: services/openaiService.js
- Timeout: OPENAI_TIMEOUT ([X]s)
- Circuit states: OPEN/HALF/CLOSED
- Metrics: circuit_state, openai.failures

Tests:
- Unit tests: [LINK O COVERAGE]
- Integration test (OpenAI timeout simulado): [PEGAR RESULTADO]
- Fallback test: [PEGAR RESULTADO]

QA - Prueba de Fallback con OpenAI Caído:
[PEGAR RESULTADO DE PRUEBA]
- /api/chat con OpenAI caído: [X]s respuesta
- Respuesta humana (fallback): [CONFIRMADO]
```

---

## 🟡 TESTING Y QA

### 12. Unit Tests (Critical Modules)

**Responsable**: Dev / QA  
**Deadline**: 5 días  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Coverage Report:
- CI Job URL: [LINK]
- Coverage: [X]%
- nameHandler: [X]%
- imageProcessor: [X]%
- openaiService: [X]%

Screenshot: [PEGAR SCREENSHOT DEL COVERAGE REPORT]
```

---

### 13. Integration / E2E Tests

**Responsable**: QA  
**Deadline**: 5 días  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Test Scripts:
- Location: [tests/e2e/]
- Scripts: [LISTAR ARCHIVOS]

Results:
- Flow: greeting → name → problem → generate steps → create ticket
- Status: [✅ PASSED / ⏳ PENDIENTE]
- Logs: [PEGAR SALIDA O LINK]
```

---

### 14. Load Tests

**Responsable**: QA / SRE  
**Deadline**: 5 días  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Load Test Report:
- Tool: [k6 / vegeta / Otro]
- Report URL: [LINK AL REPORT]

Scenario A: 50 rps mixed chat endpoints for 5m
- p95 latency: [X]ms (target: <SLA>)
- p99 latency: [X]ms
- Error rate: [X]%
- Memory growth: [ESTABLE / CRECIENDO]
- CPU: [ESTABLE / ALTO]

Scenario B: Uploads 3/min per IP, 100 concurrent users
- p95 latency: [X]ms
- Success rate: [X]%
- Queue length: [X]

Screenshots: [PEGAR GRÁFICOS O REPORT]
```

---

## 🟡 SEGURIDAD

### 15. Escaneo de Dependencias (Nueva: opossum u otra)

**Responsable**: Security  
**Deadline**: 72h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Dependency Scan:
- Tool: [Snyk / OSS / Trivy / Otro]
- Report URL: [LINK]

Nueva Dependencia (opossum u otra):
- Package: [opossum / otra]
- Version: [X.X.X]
- Vulnerabilidades encontradas: [X]
  - Críticas: [X] (mitigadas: [X])
  - Altas: [X] (mitigadas: [X])
  - Medias: [X] (mitigadas: [X])

Plan de Mitigación:
[DESCRIPCIÓN DE MITIGACIONES O CONFIRMACIÓN DE ACEPTACIÓN]

Screenshot: [PEGAR SCREENSHOT DEL REPORT]
```

---

### 16. Revisión de PII (maskPII Tests)

**Responsable**: Security + QA  
**Deadline**: 72h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
PII Masking Tests:
- Test Script: [LINK O ARCHIVO]
- Results: [PEGAR RESULTADOS]

Ejemplos de Input → Output:
1. Email:
   Input: "mi email es juan@example.com"
   Output: "mi email es ***@***.***"
   Status: [✅ PASSED]

2. CBU/CVU:
   Input: "mi cbu es 1234567890123456789012"
   Output: "mi cbu es **********************"
   Status: [✅ PASSED]

3. Tarjeta:
   Input: "tarjeta 1234 5678 9012 3456"
   Output: "tarjeta **** **** **** 3456"
   Status: [✅ PASSED]

4. Documento:
   Input: "DNI 12345678"
   Output: "DNI ****5678"
   Status: [✅ PASSED]

Test Coverage: [X] casos cubiertos
```

---

## 🟡 RUNBOOK Y OPERACIONES

### 17. Runbook (Obligatorio)

**Responsable**: Dev + SRE  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Runbook Location:
- File: docs/runbook.md
- Link: [LINK AL ARCHIVO EN REPO]

Contenido confirmado:
- [x] Canary deployment steps
- [x] Rollback steps
- [x] Monitoring commands
- [x] How to force-disable SMART_MODE
- [x] How to purge uploads older than X days
- [x] How to create ticket manually
- [x] Contact list
```

---

### 18. Incident Playbooks

**Responsable**: SRE  
**Deadline**: 72h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Playbooks Location:
- Directory: docs/playbooks/
- Files:
  - high-error-rate.md
  - openai-failover.md
  - disk-full.md
  - memory-leak.md
  - hung-workers.md

Links: [LINKS A CADA PLAYBOOK]
```

---

### 19. On-Call Roster

**Responsable**: SRE  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
On-Call Roster (0-48h post-deploy):
- Dev Lead: [Nombre] - [Teléfono] - [PagerDuty]
- Backend Lead: [Nombre] - [Teléfono] - [PagerDuty]
- SRE Lead: [Nombre] - [Teléfono] - [PagerDuty]
- QA Lead: [Nombre] - [Teléfono] - [PagerDuty]
- Security Lead: [Nombre] - [Teléfono] - [PagerDuty]

Escalation Path: [DESCRIPCIÓN]
```

---

## 🟡 CONFIRMACIONES DE SRE

### 20. Staging Configuration

**Responsable**: SRE  
**Deadline**: 48h  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Staging Environment:
- Host: [staging-host]
- SMART_MODE: [false] ✅ Confirmado
- Redis: [Disponible / No disponible]
  - Si disponible: [host:port]
- Sin cambios en producción: ✅ Confirmado

Configuración:
[PEGAR CONFIG O SCREENSHOT DE ENV VARS (sin valores)]
```

---

## 🟡 APPROVALS REQUERIDOS

### 21. Sign-Offs

**Responsable**: Cada equipo  
**Deadline**: Antes de GO  
**Estado**: ⏳ Pendiente

**Entregar aquí**:
```
Security Sign-Off:
- Firma: [Nombre] - [Fecha]
- Comentarios: [OPCIONAL]

Product Owner Sign-Off:
- Firma: [Nombre] - [Fecha]
- Conversation flow: [APROBADO]
- Ticket privacy policy: [APROBADO]

Backend Lead Approval:
- PR Review: [APROBADO]
- Firma: [Nombre] - [Fecha]

SRE Approval:
- Infra readiness: [APROBADO]
- Firma: [Nombre] - [Fecha]
```

---

## 📊 RESUMEN DE ENTREGABLES

### 🔴 Bloquers (6 items)
- [ ] PR Final Aprobado
- [ ] CI Verde
- [ ] Smoke Tests
- [ ] Secrets en Secret Manager
- [ ] Backups
- [ ] Docker Image + Scan

### 🟡 Infraestructura (4 items)
- [ ] Redis
- [ ] Worker/Queue
- [ ] Dashboards + Alerts
- [ ] Metrics Endpoint

### 🟡 Resiliencia IA (1 item)
- [ ] Circuit-Breaker PR + Tests

### 🟡 Testing (3 items)
- [ ] Unit Tests
- [ ] E2E Tests
- [ ] Load Tests

### 🟡 Seguridad (2 items)
- [ ] Dependency Scan
- [ ] PII Tests

### 🟡 Operaciones (3 items)
- [ ] Runbook
- [ ] Playbooks
- [ ] On-Call Roster

### 🟡 Confirmaciones (2 items)
- [ ] Staging Config (SRE)
- [ ] Sign-Offs

**Total**: 21 entregables

---

## 📝 INSTRUCCIONES PARA EL EQUIPO

1. **Cada responsable debe completar su sección** con los enlaces/evidencias solicitadas
2. **Pegar directamente** los outputs, screenshots, o links en este documento
3. **Marcar como completado** [x] cuando esté listo
4. **Notificar al Supervisor** cuando todos los bloquers estén completos

---

**Última actualización**: 2025-12-07  
**Estado**: ⏳ Pendiente de completar por el equipo
