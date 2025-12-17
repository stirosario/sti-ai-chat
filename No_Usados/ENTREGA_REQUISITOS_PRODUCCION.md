# 📋 ENTREGA DE REQUISITOS PARA AUTORIZACIÓN A PRODUCCIÓN

## Fecha: 2025-12-07
## Supervisor: Producción - STI Chat v7
## Estado: 🔴 **PENDIENTE ENTREGA DE BLOQUERS**

---

## 🎯 INSTRUCCIONES

**Pegar aquí los enlaces, logs, screenshots o evidencias solicitadas para cada ítem.**

**No avanzar al siguiente bloque hasta que los Blockers estén completos y verificados.**

**Plazo objetivo para Blockers: 48 horas desde la recepción de este pedido.**

---

## 🔴 BLOQUEADORES (OBLIGATORIOS ANTES DE PRODUCCIÓN)

### 1. PR Final Aprobado y Mergeable

**Owner**: Dev Lead  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Enlace al(s) PR(s): `___________________________`
- [ ] Lista de commits incluidos:
  - [ ] Migración async I/O
  - [ ] logMsg implementado
  - [ ] deleteSession importado
  - [ ] LOG_TOKEN behavior
- [ ] Approvals obtenidos:
  - [ ] Backend Lead: `@___________` (fecha: `____`)
  - [ ] SRE: `@___________` (fecha: `____`)
- [ ] CI build passing: `Sí / No`

**Evidencia**:
```
[PEGAR AQUÍ: Enlace al PR, screenshot de approvals, etc.]
```

---

### 2. CI Verde (Build + Lint + Unit Tests)

**Owner**: Dev/CI Engineer  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] URL job CI: `___________________________`
- [ ] Status: `passed / failed`
- [ ] Build exit code: `0 / ____`
- [ ] Lint errors: `0 / ____`
- [ ] Unit tests: `passed / failed` (coverage: `____%`)

**Evidencia**:
```
[PEGAR AQUÍ: URL del job CI, screenshot del status, logs de build]
```

---

### 3. Smoke Tests Pasados en Staging/Canary

**Owner**: QA  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**: Salida (logs) de los comandos ejecutados:

#### 3.1. `/api/health`
```bash
curl -sS -X GET "http://<staging>/api/health" | jq
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando]
```
**Resultado**: ✅ Pasó / ❌ Falló  
**Tiempo de respuesta**: `____ms`

---

#### 3.2. `/api/greeting`
```bash
curl -sS -X POST "http://<staging>/api/greeting" \
  -H "Content-Type: application/json" -d '{}' | jq
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando]
```
**Resultado**: ✅ Pasó / ❌ Falló  
**SessionId obtenido**: `_________________`

---

#### 3.3. `/api/session/validate`
```bash
curl -sS -X POST "http://<staging>/api/session/validate" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>"}' | jq
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando]
```
**Resultado**: ✅ Pasó / ❌ Falló

---

#### 3.4. `/api/chat`
```bash
curl -sS -X POST "http://<staging>/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>","message":"hola"}' | jq
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando]
```
**Resultado**: ✅ Pasó / ❌ Falló  
**Tiempo de respuesta**: `____ms` (debe ser < 2000ms)

---

#### 3.5. `/api/upload-image`
```bash
curl -sS -X POST "http://<staging>/api/upload-image" \
  -H "x-session-id: <sid>" \
  -F "image=@./test/fixture.jpg" | jq
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando]
```
**Resultado**: ✅ Pasó / ❌ Falló

---

#### 3.6. `/api/whatsapp-ticket`
```bash
curl -sS -X POST "http://<staging>/api/whatsapp-ticket" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>"}' | jq
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando]
```
**Resultado**: ✅ Pasó / ❌ Falló

---

#### 3.7. `/api/logs`
```bash
curl -sS -X GET "http://<staging>/api/logs?token=<LOG_TOKEN>" | head -n 40
```
**Output**:
```
[PEGAR AQUÍ: Salida del comando - primeros 40 líneas]
```
**Resultado**: ✅ Pasó / ❌ Falló

---

**Resumen Smoke Tests**:
- Total endpoints probados: `____`
- Endpoints con 5xx: `____`
- Endpoints con respuesta < 2s: `____`
- **Resultado General**: ✅ Todos pasaron / ❌ Algunos fallaron

---

### 4. LOG_TOKEN y Otros Secrets en Secret Manager

**Owner**: SRE / Security  
**Deadline**: 24h  
**Status**: ⏳ **PENDIENTE**

**Entregar**: Proof-of-provision (screenshot / access policy export / secret-manager metadata)

**Secrets Requeridos**:
- [ ] `LOG_TOKEN` - Provisionado: `Sí / No` - Proof: `_________________`
- [ ] `OPENAI_API_KEY` - Provisionado: `Sí / No` - Proof: `_________________`
- [ ] `WHATSAPP_NUMBER` - Provisionado: `Sí / No` - Proof: `_________________`
- [ ] `DB_CREDENTIALS` (si aplica) - Provisionado: `Sí / No` - Proof: `_________________`

**Evidencia**:
```
[PEGAR AQUÍ: Screenshot de secret manager, export de access policy, metadata]
```

**Nota**: NO compartir valores de los secrets, solo prueba de que existen.

---

### 5. Backups y Retention (Transcripts/Tickets/Uploads)

**Owner**: SRE  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Backup policy doc: `___________________________` (link o ruta)
- [ ] Retention days: `____ días`
- [ ] Backup target: `S3 / Mounted Storage / Otro: ___________`
- [ ] Backup target path: `___________________________`
- [ ] Resultado de backup manual (log): 
```
[PEGAR AQUÍ: Log de ejecución de backup manual]
```
- [ ] Restore test documentado: `Sí / No` - Link: `_________________`

**Evidencia**:
```
[PEGAR AQUÍ: Política de backup, log de backup manual, documentación de restore]
```

---

### 6. Docker Image + Security Scan

**Owner**: Dev / SRE  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Docker image tag (sha): `___________________________`
- [ ] Registry URL: `___________________________`
- [ ] Security scan tool: `Trivy / Snyk / Otro: ___________`
- [ ] Scan report URL: `___________________________`
- [ ] Critical vulnerabilities: `0 / ____` (mitigadas: `Sí / No`)
- [ ] High vulnerabilities: `0 / ____` (mitigadas: `Sí / No`)
- [ ] Medium vulnerabilities: `____` (mitigadas: `Sí / No`)

**Evidencia**:
```
[PEGAR AQUÍ: Link al scan report, screenshot de vulnerabilidades, plan de mitigación si aplica]
```

---

## 🟡 INFRAESTRUCTURA CRÍTICA Y OBSERVABILIDAD

### 7. Redis Provisionado y Tested

**Owner**: SRE  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Redis host:port: `___________________________`
- [ ] Test connection log:
```
[PEGAR AQUÍ: Output de redis-cli ping o telnet test]
```
- [ ] Access policy: `___________________________` (link o descripción)

**Evidencia**:
```
[PEGAR AQUÍ: Log de test de conexión, configuración de acceso]
```

---

### 8. Worker / Queue Infra para Procesamiento de Imágenes

**Owner**: SRE + Dev  
**Deadline**: 72h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Worker image tag or repo branch: `___________________________`
- [ ] Concurrency proposal: `____ workers`
- [ ] Queue config (Bull/Redis): `___________________________`
- [ ] Test job end-to-end: `Sí / No` - Log: 
```
[PEGAR AQUÍ: Log de test de procesamiento de imagen end-to-end]
```

**Evidencia**:
```
[PEGAR AQUÍ: Configuración de worker, log de test, documentación]
```

---

### 9. Grafana Dashboards + Prometheus Alert Rules

**Owner**: SRE / Observability  
**Deadline**: 72h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Grafana dashboard URL: `___________________________`
- [ ] Grafana dashboard JSON: `___________________________` (link o archivo)

**Panels incluidos**:
- [ ] p95/p99 latency /api/chat
- [ ] error rate 5xx
- [ ] OpenAI latency & failures
- [ ] upload queue length, worker success/failure
- [ ] disk usage (UPLOADS_DIR), memory, CPU

**Alert Rules**:
- [ ] Error rate 5xx > 0.5% (5m) → PagerDuty - Configurado: `Sí / No`
- [ ] p95 latency /api/chat > 2s (5m) → Slack + PagerDuty - Configurado: `Sí / No`
- [ ] OpenAI failures > 5% or avg latency > 3s → warn - Configurado: `Sí / No`
- [ ] Disk free < 10% → PagerDuty - Configurado: `Sí / No`

**Evidencia**:
```
[PEGAR AQUÍ: Link a dashboard, export de alert rules, screenshots]
```

---

### 10. Metrics Endpoint / App Metrics

**Owner**: Dev  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Metrics endpoint: `GET /api/metrics` - Implementado: `Sí / No`
- [ ] Prometheus exporter: `Sí / No` - Endpoint: `_________________`

**Métricas expuestas**:
- [ ] `openai.requests` - Expuesta: `Sí / No`
- [ ] `openai.failures` - Expuesta: `Sí / No`
- [ ] `uploads.avgAnalysisTime` - Expuesta: `Sí / No`
- [ ] `chat.totalMessages` - Expuesta: `Sí / No`

**Sample output**:
```
[PEGAR AQUÍ: Ejemplo de output del endpoint de métricas]
```

---

## 🟡 RESILIENCIA IA (ALTA PRIORIDAD TÉCNICA)

### 11. Circuit-Breaker + Timeout Wrapper para OpenAI

**Owner**: Dev  
**Deadline**: 72h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] PR link `services/openaiService.js`: `___________________________`
- [ ] Branch: `___________________________`

**Requirements**:
- [ ] Timeout per call: uses `OPENAI_TIMEOUT` - Implementado: `Sí / No`
- [ ] Sliding-window failure tracking - Implementado: `Sí / No`
- [ ] OPEN/HALF/CLOSED states - Implementado: `Sí / No`
- [ ] Metrics exported (circuit_state, openai.failures) - Implementado: `Sí / No`
- [ ] Fallback behavior documented and implemented - Implementado: `Sí / No`

**Tests**:
- [ ] Unit tests: `___________________________` (link o archivo)
- [ ] Integration test (simula timeout/error): 
```
[PEGAR AQUÍ: Log de test de integración demostrando fallback]
```

**Evidencia**:
```
[PEGAR AQUÍ: Link al PR, código relevante, logs de tests]
```

---

## 🟡 TESTING & QA

### 12. Unit Tests for Critical Modules

**Owner**: Dev / QA  
**Deadline**: 5 días  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Coverage report: `___________________________` (link o archivo)
- [ ] Coverage `nameHandler`: `____%` (target: >= 70%)
- [ ] Coverage `imageProcessor`: `____%` (target: >= 70%)
- [ ] Coverage `openaiService`: `____%` (target: >= 70%)

**Evidencia**:
```
[PEGAR AQUÍ: Link a coverage report, screenshots]
```

---

### 13. Integration / E2E Tests (Conversation Flow)

**Owner**: QA  
**Deadline**: 5 días  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Scripts: `___________________________` (link o archivo)
- [ ] Results covering:
  - [ ] greeting → name
  - [ ] name → problem
  - [ ] problem → generate steps
  - [ ] generate steps → create ticket

**Evidencia**:
```
[PEGAR AQUÍ: Scripts de test, logs de ejecución, resultados]
```

---

### 14. Load Tests (k6 / vegeta)

**Owner**: QA / SRE  
**Deadline**: 5 días  
**Status**: ⏳ **PENDIENTE**

**Entregar**:

#### Scenario A: 50 rps mixed chat endpoints for 5m
- [ ] Report: `___________________________` (link o archivo)
- [ ] p95 latency: `____ms` (target: < SLA)
- [ ] Memory growth: `Estable / Creciente`
- [ ] CPU: `Estable / Variable`

#### Scenario B: Uploads 3/min per IP with 100 concurrent users
- [ ] Report: `___________________________` (link o archivo)
- [ ] p95 latency: `____ms`
- [ ] Success rate: `____%`

**Evidencia**:
```
[PEGAR AQUÍ: Links a reports de load tests, gráficos, métricas]
```

---

## 🟡 RUNBOOK, PLAYBOOKS Y SIGN-OFFS

### 15. Runbook (Mandatory)

**Owner**: Dev + SRE  
**Deadline**: 48h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Link a `docs/runbook.md`: `___________________________`

**Contenido incluido**:
- [ ] Canary deployment steps
- [ ] Rollback steps (how to revert deployment image)
- [ ] Monitoring commands
- [ ] How to force-disable SMART_MODE
- [ ] Purge uploads procedure
- [ ] Contact list

**Evidencia**:
```
[PEGAR AQUÍ: Link al runbook, confirmación de contenido]
```

---

### 16. Incident Playbooks for Top Incidents

**Owner**: SRE  
**Deadline**: 72h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Playbook high 5xx rate: `___________________________`
- [ ] Playbook OpenAI failover: `___________________________`
- [ ] Playbook disk full: `___________________________`
- [ ] Playbook memory leak: `___________________________`
- [ ] Playbook hung workers: `___________________________`

**Evidencia**:
```
[PEGAR AQUÍ: Links a playbooks o ubicación de documentación]
```

---

### 17. Security Sign-Off & PII Tests

**Owner**: Security + QA  
**Deadline**: 72h  
**Status**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Security sign-off doc: `___________________________`
- [ ] Automated tests proving `maskPII()` masks:
  - [ ] Emails - Test: `_________________`
  - [ ] Bank numbers (CBU/CVU) - Test: `_________________`
  - [ ] Document IDs - Test: `_________________`
  - [ ] Credit cards - Test: `_________________`

**Test inputs and outputs**:
```
[PEGAR AQUÍ: Ejemplos de input → output para cada tipo de PII]
```

**Evidencia**:
```
[PEGAR AQUÍ: Sign-off document, tests, resultados]
```

---

## ✅ APPROVALS REQUIRED BEFORE GO

- [ ] **Security sign-off** (Security team) - Firma: `_________________` - Fecha: `____`
- [ ] **Product owner acceptance** (conversation flow + ticket privacy policy) - Firma: `_________________` - Fecha: `____`
- [ ] **Backend Lead approval** (on PR) - Firma: `_________________` - Fecha: `____`
- [ ] **SRE approval** (on infra readiness) - Firma: `_________________` - Fecha: `____`

---

## 📋 ROLLBACK CRITERIA (Validated in Runbook)

- [ ] error rate 5xx > 0.5% (sustained 5m) - Documentado: `Sí / No`
- [ ] p95 latency > 2x baseline (sustained 5m) - Documentado: `Sí / No`
- [ ] OpenAI circuit trips and functional degradation - Documentado: `Sí / No`
- [ ] Disk usage > 90% - Documentado: `Sí / No`

**Acción si ocurre**: Immediate rollback to previous image + paging SRE and Dev Lead

---

## ⏰ TIMELINE

- **T0 (now)**: Dev creates final PR and CI pipeline; SRE provisions secrets and Redis; QA schedules smoke test.
- **T+48h**: All Blockers resolved → deploy CANARY (1 instance) with SMART_MODE=false unless otherwise agreed.
- **T+48..96h**: Monitor, run load tests, gradually increase traffic (1% → 5% → 25% → 100%) if metrics ok.

---

## 📞 CONTACTO Y ON-CALL PARA DESPLIEGUE

- **Dev Lead**: `@dev-lead` (Slack) — responsable técnico PR
- **Backend Lead**: `@backend-lead` (Slack) — reviewer
- **SRE Lead**: `@sre-lead` (PagerDuty) — infra + canary deploy
- **QA Lead**: `@qa-lead` (Slack) — smoke & load tests
- **Security Lead**: `@sec-lead` (Slack) — sign-off

---

## 🎯 RESUMEN DE ENTREGA

### Bloquers (1-6)
- [ ] Item 1: PR final aprobado
- [ ] Item 2: CI verde
- [ ] Item 3: Smoke tests
- [ ] Item 4: Secrets en secret manager
- [ ] Item 5: Backups configurados
- [ ] Item 6: Docker image + scan

### Infraestructura (7-10)
- [ ] Item 7: Redis provisionado
- [ ] Item 8: Worker/Queue infra
- [ ] Item 9: Grafana + Prometheus
- [ ] Item 10: Metrics endpoint

### Resiliencia (11)
- [ ] Item 11: Circuit-breaker OpenAI

### Testing (12-14)
- [ ] Item 12: Unit tests
- [ ] Item 13: Integration/E2E tests
- [ ] Item 14: Load tests

### Documentación (15-17)
- [ ] Item 15: Runbook
- [ ] Item 16: Incident playbooks
- [ ] Item 17: Security sign-off

### Approvals
- [ ] Security sign-off
- [ ] Product owner acceptance
- [ ] Backend Lead approval
- [ ] SRE approval

---

## ✅ AUTORIZACIÓN FINAL

**Una vez entregados los Blockers 1–6 y verificados, el Supervisor autoriza el despliegue canario.**

**Estado actual**: 🔴 **BLOQUEADO** - Pendiente entrega de Blockers

**Última actualización**: 2025-12-07

---

**Firmado**,  
**Supervisor de Producción — STI Chat v7**
