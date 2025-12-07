# 📦 ENTREGABLES PENDIENTES - Resumen para Equipo

## Fecha: 2025-12-07

---

## 🎯 OBJETIVO

Este documento lista todos los entregables pendientes organizados por responsable, para facilitar la coordinación del equipo.

---

## 🔴 BLOQUEADORES (Acción Inmediata - 48h)

### Dev Lead

1. **PR Final Aprobado**
   - [ ] Crear PR con todos los commits
   - [ ] Solicitar reviews (Backend Lead + SRE)
   - [ ] Entregar: Enlace al PR

**Commits a incluir**:
- Correcciones críticas de auditoría
- Migración I/O async
- Documentación

---

### Dev/CI Engineer

2. **CI Verde**
   - [ ] Configurar pipeline CI/CD (si no existe)
   - [ ] Ejecutar build + lint + tests
   - [ ] Entregar: URL del job CI con status "passed"

---

### QA

3. **Smoke Tests en Staging**
   - [ ] Ejecutar todos los comandos de smoke tests
   - [ ] Verificar que todas las respuestas son 2xx (no 5xx)
   - [ ] Verificar que `/api/chat` responde en <2s
   - [ ] Entregar: Salida completa de todos los comandos (pegar logs aquí)

**Comandos**:
```bash
# Ver RESPUESTA_SUPERVISOR_PRODUCCION.md sección 3 para lista completa
```

---

### SRE / Security

4. **Secrets en Secret Manager**
   - [ ] Provisionar `LOG_TOKEN` en secret manager
   - [ ] Provisionar `OPENAI_API_KEY` en secret manager
   - [ ] Provisionar `WHATSAPP_NUMBER` en secret manager
   - [ ] Provisionar `DB_CREDENTIALS` (si aplica)
   - [ ] Entregar: Proof-of-provision (screenshot/metadata, NO valores)

---

### SRE

5. **Backups y Retention**
   - [ ] Definir política de backup (retention days)
   - [ ] Configurar backup target (S3 o similar)
   - [ ] Ejecutar backup manual de prueba
   - [ ] Documentar proceso de restore
   - [ ] Entregar: Política + log de backup manual

---

### Dev / SRE

6. **Docker Image + Security Scan**
   - [ ] Build Docker image
   - [ ] Push a registry
   - [ ] Ejecutar Trivy/Snyk scan
   - [ ] Mitigar vulnerabilidades críticas/altas
   - [ ] Entregar: Image tag (sha) + scan report

---

## 🟡 INFRAESTRUCTURA (Antes del Canary)

### SRE

7. **Redis Provisionado**
   - [ ] Provisionar Redis instance
   - [ ] Configurar access policy
   - [ ] Test connection
   - [ ] Entregar: host:port + test connection log

8. **Worker/Queue para Imágenes** (Tarea #4)
   - [ ] Implementar worker (o definir plan)
   - [ ] Configurar queue (Bull/Redis)
   - [ ] Test end-to-end
   - [ ] Entregar: Worker image/branch + config

9. **Grafana Dashboards + Alertas**
   - [ ] Crear dashboard Grafana
   - [ ] Configurar alertas Prometheus
   - [ ] Entregar: Grafana URL + alert rules

---

### Dev

10. **Metrics Endpoint**
    - [ ] Implementar endpoint de métricas
    - [ ] Exponer métricas requeridas
    - [ ] Entregar: Endpoint URL + sample output

11. **Circuit-Breaker para OpenAI** (Tarea #2)
    - [ ] Implementar `services/openaiService.js`
    - [ ] Crear unit tests
    - [ ] Crear integration test
    - [ ] Entregar: PR link + tests

---

## 🟡 TESTING (5 días)

### Dev / QA

12. **Unit Tests**
    - [ ] Crear tests para `nameHandler`
    - [ ] Crear tests para `imageProcessor`
    - [ ] Crear tests para `openaiService` (cuando se implemente)
    - [ ] Asegurar coverage >= 70%
    - [ ] Entregar: Coverage report

### QA

13. **Integration/E2E Tests**
    - [ ] Crear scripts E2E
    - [ ] Test flujo completo: greeting → name → problem → steps → ticket
    - [ ] Entregar: Scripts + resultados

14. **Load Tests**
    - [ ] Ejecutar Scenario A: 50 rps mixed chat (5m)
    - [ ] Ejecutar Scenario B: Uploads 3/min, 100 concurrent users
    - [ ] Validar KPIs (p95 < SLA, no memory growth, CPU stable)
    - [ ] Entregar: Reports (k6/vegeta)

---

## 🟡 DOCUMENTACIÓN (48-72h)

### SRE

15. **Incident Playbooks**
    - [ ] Playbook: High 5xx rate
    - [ ] Playbook: OpenAI failover
    - [ ] Playbook: Disk full
    - [ ] Playbook: Memory leak
    - [ ] Playbook: Hung workers
    - [ ] Entregar: Playbooks documentados

### Security + QA

16. **Security Sign-Off & PII Tests**
    - [ ] Crear tests de PII masking
    - [ ] Validar emails, bank numbers, document IDs, credit cards
    - [ ] Security sign-off document
    - [ ] Entregar: Sign-off + test results

---

## ✅ COMPLETADOS

- ✅ **Runbook** (`docs/runbook.md`) - Draft completo creado

---

## 📋 CHECKLIST RÁPIDO POR ROL

### Dev Lead (Hoy)
- [ ] Crear PR final
- [ ] Solicitar reviews

### QA (Hoy)
- [ ] Ejecutar smoke tests
- [ ] Pegar salida aquí

### SRE (Hoy)
- [ ] Provisionar secrets
- [ ] Provisionar Redis
- [ ] Proveer acceso staging

### Security (Hoy)
- [ ] Confirmar secrets
- [ ] Sign-off

---

**Última actualización**: 2025-12-07
