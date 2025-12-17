# 📋 CHECKLIST DE DESPLIEGUE A PRODUCCIÓN - STI Chat v7

## Fecha: 2025-12-07
## Estado: 🔴 **BLOQUEADO** - Pendiente cumplir requisitos obligatorios

---

## 🔴 CONDICIÓN DE BLOQUEO (Blockers — Obligatorios Antes de Producción)

### [BLOQUER] 1. PR Final Aprobado y Mergeable

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Enlace(s) a PR(s) con todos los commits que contienen las correcciones aplicadas
- [ ] 2 reviewers aprobando (1 Backend Lead, 1 SRE)

**Completado**:
- ✅ Correcciones críticas aplicadas
- ✅ Migración I/O async completada
- ⏳ PR pendiente de creación/revisión

**Acción requerida**: Crear PR con todos los cambios y solicitar reviews

---

### [BLOQUER] 2. CI Verde

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] URL del job CI (build + lint + unit tests) con status "passed"

**Acción requerida**: Configurar CI/CD pipeline si no existe

---

### [BLOQUER] 3. Smoke Tests Ejecutados y Pasados en Staging/Canary

**Estado**: ⏳ **PENDIENTE**

**Entregar**: Salida de los comandos (logs) para cada endpoint crítico:

```bash
# /api/health
curl -sS -X GET "http://staging-host/api/health" | jq
# Esperado: {"ok": true, ...}

# /api/greeting
curl -sS -X POST "http://staging-host/api/greeting" \
  -H "Content-Type: application/json" -d '{}' | jq
# Esperado: {"ok": true, "sessionId": "...", "csrfToken": "...", ...}

# /api/session/validate (usar sessionId del greeting)
curl -sS -X POST "http://staging-host/api/session/validate" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>"}' | jq
# Esperado: {"valid": true, ...}

# /api/chat (mínimo flujo)
curl -sS -X POST "http://staging-host/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>","message":"hola"}' | jq
# Esperado: {"ok": true, "reply": "...", ...} en <2s

# /api/upload-image
curl -sS -X POST "http://staging-host/api/upload-image" \
  -H "x-session-id: <sid>" \
  -F "image=@./test/fixture.jpg" | jq
# Esperado: {"ok": true, ...}

# /api/whatsapp-ticket
curl -sS -X POST "http://staging-host/api/whatsapp-ticket" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sid>"}' | jq
# Esperado: {"ok": true, "ticketId": "...", ...}

# /api/logs (con LOG_TOKEN)
curl -sS -X GET "http://staging-host/api/logs?token=<LOG_TOKEN>" | head -20
# Esperado: Contenido de logs (texto plano)
```

**Criterio**: 
- ✅ Todas las respuestas sin 5xx
- ✅ /api/chat responde en <2s en condiciones nominales (sin IA)

**Acción requerida**: QA ejecutar tests en staging y pegar salida aquí

---

### [BLOQUER] 4. LOG_TOKEN en Secret Manager

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Prueba de que LOG_TOKEN está provisionado en Secrets Manager (no el valor; solo que existe y policy de acceso)

**Criterio**: En producción, la app debe fallar al arrancar si no existe (✅ ya implementado en código)

**Acción requerida**: SRE provisionar LOG_TOKEN en secret manager

---

### [BLOQUER] 5. Secrets en Secret Manager (No en .env ni Logs)

**Estado**: ⏳ **PENDIENTE**

**Entregar**: Lista de secretos almacenados:
- [ ] OPENAI_API_KEY
- [ ] LOG_TOKEN
- [ ] WHATSAPP_NUMBER
- [ ] DB_CREDENTIALS (si aplica)

**Acción requerida**: SRE confirmar todos los secrets en secret manager

---

### [BLOQUER] 6. Backups (Transcripts/Tickets/Uploads) / Retention

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Política de backup y ruta destino (S3 or mounted storage)
- [ ] Prueba de backup manual

**Acción requerida**: SRE definir política de backups y ejecutar prueba

---

## 🟡 REQUISITOS DE INFRAESTRUCTURA (SRE)

### 7. Redis Disponible y Configurado

**Estado**: ⏳ **PENDIENTE**

**Propósito**: rate-limits, locks, queue (si se implementa)

**Entregar**: 
- [ ] host:port
- [ ] access policy
- [ ] test connection logs

**Acción requerida**: SRE provisionar Redis y proveer configuración

---

### 8. Worker/Queue para Procesamiento de Imágenes

**Estado**: ⏳ **PENDIENTE** (Tarea Alta Prioridad #4)

**Propósito**: sacar sharp/OpenAI Vision del request thread

**Entregar**: 
- [ ] Imagen del worker
- [ ] Número de réplicas propuestas
- [ ] Concurrencia máxima

**Nota**: Esta tarea está pendiente de implementación (Alta Prioridad #4)

**Acción requerida**: Implementar worker/cola o definir plan de implementación

---

### 9. Persistent Storage

**Estado**: ⏳ **PENDIENTE**

**Confirmar**: mounts y permisos (TRANSCRIPTS_DIR, TICKETS_DIR, UPLOADS_DIR, LOGS_DIR)

**Entregar**: 
- [ ] Outputs de `ls -ld` y owner:group y permisos

**Acción requerida**: SRE confirmar mounts y permisos

---

### 10. Contenedores/Artefactos

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Docker image tag listo para prod (sha) y link al registry
- [ ] Escaneo de imagen: resultado de scanner (Snyk/Trivy) con vulnerabilidades <= medium o mitigadas

**Acción requerida**: Build imagen Docker y ejecutar escaneo de seguridad

---

### 11. Manifiestos de Despliegue

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] k8s manifests / Helm chart / Terraform changes para canary y producción

**Criterio**: 
- [ ] readiness/liveness probes
- [ ] resource requests/limits definidos (CPU/Mem)

**Acción requerida**: SRE crear/actualizar manifiestos de despliegue

---

## 🟡 OBSERVABILIDAD Y ALERTAS (SRE / Observability)

### 12. Dashboards

**Estado**: ⏳ **PENDIENTE**

**Entregar**: Grafana dashboard URL o JSON con panels:
- [ ] p95/p99 latency /api/chat
- [ ] error rate 5xx
- [ ] OpenAI latency & failures
- [ ] upload queue length, worker success/failure
- [ ] disk usage (UPLOADS_DIR), memory, CPU

**Acción requerida**: SRE crear dashboard en Grafana

---

### 13. Alert Rules (Prometheus / Cloud Monitoring)

**Estado**: ⏳ **PENDIENTE**

**Configurar y entregar reglas**:
- [ ] Error rate 5xx > 0.5% (5m) → PagerDuty
- [ ] p95 latency > 2s (5m) → Slack + PagerDuty (if sustained)
- [ ] OpenAI failures > 5% or avg latency > 3s → warn
- [ ] Disk free < 10% or inode usage > 90% → PagerDuty

**Acción requerida**: SRE configurar alertas en Prometheus/Cloud Monitoring

---

### 14. Logging

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Configuración de envío de logs (ELK/DataDog)
- [ ] Confirmar maskPII aplicado en formatter (✅ ya implementado en código)

**Acción requerida**: SRE configurar envío de logs

---

### 15. Metrics Exposadas por App

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Endpoint y ejemplos de métricas: openai.requests, openai.failures, uploads.avgAnalysisTime, chat.totalMessages

**Acción requerida**: Implementar endpoint de métricas o confirmar si ya existe

---

### 16. SSE Clients Limit Alarms

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Alert si sseClients > MAX_SSE_CLIENTS

**Acción requerida**: SRE configurar alerta

---

## 🟡 RESILIENCIA IA (Alta Prioridad Técnica)

### 17. Circuit-Breaker + Timeout para OpenAI

**Estado**: ⏳ **PENDIENTE** (Tarea Alta Prioridad #2)

**Entregar**: 
- [ ] PR/branch con `services/openaiService.js` implementado y tests

**Criterio**: 
- [ ] wrapper con timeout OPENAI_TIMEOUT
- [ ] circuit states metrics
- [ ] fallback implemented

**Nota**: Esta tarea está pendiente de implementación (Alta Prioridad #2)

**Acción requerida**: Implementar circuit-breaker o definir plan

---

### 18. Feature Flag para Desactivar SMART_MODE

**Estado**: ✅ **COMPLETADO** (parcialmente)

**Entregar**: 
- [x] Mechanism (env var or runtime flag) para desactivar llamadas IA rápidamente

**Criterio**: 
- [x] con SMART_MODE=false, /api/chat debe seguir funcionando sin IA

**Nota**: Ya existe `SMART_MODE_ENABLED` en código, verificar que funcione correctamente

**Acción requerida**: Validar que el feature flag funciona correctamente

---

## 🟡 SEGURIDAD (Security)

### 19. Escaneo de Dependencias

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Report (Snyk/OSS scan) y plan de mitigación para vulnerabilidades > high

**Acción requerida**: Security ejecutar escaneo de dependencias

---

### 20. Revisión de PII

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Tests que demuestran maskPII cubre emails, cbu/cvu, tarjetas y números de documento (ejemplos de input → output)

**Nota**: `maskPII()` ya está implementado, falta crear tests específicos

**Acción requerida**: QA crear tests de PII masking

---

### 21. Acceso / Least Privilege

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Lista de cuentas con acceso al secret manager y al logs bucket
- [ ] Confirmar RBAC

**Acción requerida**: Security revisar y documentar accesos

---

### 22. SSL / Certs

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Confirmación de certs válidos (if serving directly) o ingress TLS config (k8s)

**Acción requerida**: SRE confirmar configuración TLS

---

## 🟡 TESTING (QA)

### 23. Unit Tests

**Estado**: ⏳ **PENDIENTE**

**Coverage razonable (>70%) en módulos críticos**:
- [ ] handlers/nameHandler
- [ ] imageProcessor
- [ ] openaiService wrapper (cuando se implemente)

**Entregar**: 
- [ ] Link a job CI que muestra coverage

**Acción requerida**: Dev crear unit tests para módulos críticos

---

### 24. Integration Tests / E2E

**Estado**: ⏳ **PENDIENTE**

**Tests que cubran**: 
- [ ] saludo → nombre → problem → generar pasos → crear ticket

**Entregar**: 
- [ ] Scripts y resultados

**Acción requerida**: QA crear tests E2E

---

### 25. Load Tests

**Estado**: ⏳ **PENDIENTE**

**Ejecutar y entregar report (k6/vegeta)**:
- [ ] Scenario A: 50 rps mixed chat endpoints for 5m
- [ ] Scenario B: Uploads 3/min per IP, 100 concurrent users

**KPI**: 
- [ ] p95 latency under SLA
- [ ] no memory growth
- [ ] CPU stable

**Acción requerida**: QA ejecutar load tests y generar report

---

### 26. Security Tests

**Estado**: ⏳ **PENDIENTE**

**Pen test quick scan or run static analysis**

**Acción requerida**: Security ejecutar security tests

---

## 🟡 RUNBOOK & PLAYBOOKS (Operations)

### 27. Runbook (Obligatorio)

**Estado**: ⏳ **PENDIENTE**

**Entregar**: `docs/runbook.md` con:
- [ ] Canary deployment steps
- [ ] Rollback steps (how to revert deployment image)
- [ ] Monitoring commands
- [ ] How to force-disable SMART_MODE
- [ ] How to purge uploads older than X days
- [ ] How to create ticket manually if createTicket fails

**Acción requerida**: Dev/SRE crear runbook completo

---

### 28. Incident Playbooks (For Top Incidents)

**Estado**: ⏳ **PENDIENTE**

**Entregar**: Playbooks para:
- [ ] High error rate
- [ ] OpenAI failover
- [ ] Disk full
- [ ] Memory leak
- [ ] Hung workers

**Acción requerida**: SRE crear playbooks de incidentes

---

### 29. On-Call Roster for Deployment Window

**Estado**: ⏳ **PENDIENTE**

**Entregar**: 
- [ ] Lista de responsables y teléfonos/PagerDuty for 0–48h post-deploy

**Acción requerida**: SRE definir on-call roster

---

## 🟡 GOVERNANCE & APPROVALS (Compliance/Product)

### 30. Sign-Off Checklist

**Estado**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Security review sign-off (security team)
- [ ] Product owner sign-off on conversation flow changes
- [ ] Legal sign-off if tickets are public (GDPR)

**Acción requerida**: Obtener sign-offs de cada equipo

---

### 31. Retention and Privacy Policy Check

**Estado**: ⏳ **PENDIENTE**

**Ensure**:
- [ ] Ticket public links TTL and redact policy agreed

**Acción requerida**: Legal/Product revisar y aprobar política

---

## 🟡 ROLLOUT PLAN (Canary → 100%)

### 32. Canary Plan (Must Be Provided)

**Estado**: ⏳ **PENDIENTE**

**Plan**:
- [ ] Start: deploy 1 instance (canary), route 1% traffic for 30–60 min
- [ ] If all metrics OK → 5% for 30–60 min
- [ ] → 25% for 30–60 min
- [ ] → 100%

**Acción requerida**: SRE definir plan de canary detallado

---

### 33. Rollback Criteria (Must Be Documented)

**Estado**: ⏳ **PENDIENTE**

**Criterios**:
- [ ] error rate 5xx > 0.5% sustained 5m
- [ ] p95 latency > 2x baseline
- [ ] OpenAI circuit trips and functional degradation
- [ ] Disk usage > 90%
- [ ] Feature toggles: SMART_MODE off if required

**Acción requerida**: Documentar criterios de rollback

---

### 34. Post-Deployment Verification (0–48h)

**Estado**: ⏳ **PENDIENTE**

**Entregar**:
- [ ] Automated smoke test suite scheduled every 5 minutes first 4 hours
- [ ] Manual checks at 15, 60, 180 minutes: confirm chat flows, uploads, ticket creation
- [ ] Daily digest of metrics first 3 days (email to SRE + dev lead)

**Acción requerida**: SRE configurar verificaciones post-deploy

---

## 📊 RESUMEN DE ESTADO

### ✅ Completados (2/34)
1. ✅ Feature flag SMART_MODE (parcialmente)
2. ✅ maskPII implementado (falta tests)

### ⏳ Pendientes (32/34)
- 🔴 **6 Blockers** (obligatorios antes de producción)
- 🟡 **28 Requisitos** (alta/media prioridad)

---

## 🎯 ACCIONES INMEDIATAS REQUERIDAS

### Dev Lead
- [ ] Crear PR final con todos los cambios
- [ ] Solicitar reviews (Backend Lead + SRE)
- [ ] Crear unit tests para módulos críticos
- [ ] Crear runbook.md

### QA
- [ ] Ejecutar smoke tests en staging y pegar salida
- [ ] Crear tests E2E
- [ ] Ejecutar load tests y generar report
- [ ] Crear tests de PII masking

### SRE
- [ ] Provisionar Redis y proveer configuración
- [ ] Confirmar secrets en secret manager
- [ ] Definir política de backups
- [ ] Crear/actualizar manifiestos de despliegue
- [ ] Crear dashboard Grafana
- [ ] Configurar alertas
- [ ] Definir plan de canary
- [ ] Definir on-call roster

### Security
- [ ] Ejecutar escaneo de dependencias
- [ ] Revisar y documentar accesos (RBAC)
- [ ] Ejecutar security tests
- [ ] Sign-off security review

### Product
- [ ] Sign-off conversation flow changes
- [ ] Aprobar política de retención y privacidad

---

## 📝 DELIVERABLES SUMMARY

**Para presentar antes de GO decision** (entregar link / screenshot / logs / timestamp):

- [ ] **[BLOQUER]** PR link + CI green screenshot
- [ ] **[BLOQUER]** Smoke tests output (all endpoints) — paste logs
- [ ] **[BLOQUER]** Secret manager proof (no secrets printed)
- [ ] Docker image tag + scan report
- [ ] K8s manifests + helm values used for canary
- [ ] Grafana dashboard links and Prometheus rules
- [ ] runbook.md + pagerduty on-call roster
- [ ] Load test report (k6)
- [ ] openaiService PR + unit/integration tests
- [ ] Acceptance sign-offs: Security, Product, Backend Lead

---

## ⏰ TIMELINE SUGERIDO

**Hoy (D0)**:
- QA ejecuta smoke tests y adjunta logs
- SRE provisiona Redis & worker infra
- Security runs quick scan

**D1**:
- Merge circuit-breaker PR to staging (si está listo)
- Run integration tests
- SRE deploy canary
- Start 1% traffic

**D2**:
- Monitor 24h
- Increment traffic according to plan
- If green move to prod

---

**Última actualización**: 2025-12-07
**Estado General**: 🔴 **BLOQUEADO** - Pendiente cumplir requisitos obligatorios
