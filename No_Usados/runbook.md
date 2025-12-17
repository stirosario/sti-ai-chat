# 📖 RUNBOOK - STI Chat v7

## Fecha: 2025-12-07
## Versión: 1.0

---

## 📋 ÍNDICE

1. [Canary Deployment Steps](#canary-deployment-steps)
2. [Rollback Steps](#rollback-steps)
3. [Monitoring Commands](#monitoring-commands)
4. [How to Force-Disable SMART_MODE](#how-to-force-disable-smart_mode)
5. [How to Purge Uploads Older Than X Days](#how-to-purge-uploads-older-than-x-days)
6. [How to Create Ticket Manually](#how-to-create-ticket-manually)
7. [Contact List](#contact-list)
8. [Rollback Criteria](#rollback-criteria)

---

## 🚀 CANARY DEPLOYMENT STEPS

### Pre-Deployment Checklist

- [ ] Todos los blockers completados
- [ ] Secrets provisionados en secret manager
- [ ] Redis disponible y testeado
- [ ] Docker image builded y escaneado
- [ ] K8s manifests actualizados
- [ ] Dashboards y alertas configuradas
- [ ] On-call roster definido

### Deployment Steps

#### Fase 1: Canary (1% Traffic)

1. **Deploy canary instance**:
   ```bash
   kubectl apply -f k8s/canary-deployment.yaml
   kubectl apply -f k8s/canary-service.yaml
   ```

2. **Route 1% traffic to canary**:
   ```bash
   # Configurar ingress/service mesh para routing
   # Ejemplo con Istio:
   kubectl apply -f k8s/canary-virtualservice.yaml
   ```

3. **Monitor for 30-60 minutes**:
   - Check Grafana dashboards
   - Verify error rate < 0.5%
   - Verify p95 latency < 2s
   - Check OpenAI circuit state
   - Monitor disk usage

4. **If metrics OK → proceed to Phase 2**

#### Fase 2: Gradual Increase (5% → 25% → 100%)

1. **Increase to 5% traffic**:
   ```bash
   # Update virtualservice weight
   kubectl apply -f k8s/canary-5pct.yaml
   ```

2. **Monitor for 30-60 minutes**

3. **If OK → increase to 25%**:
   ```bash
   kubectl apply -f k8s/canary-25pct.yaml
   ```

4. **Monitor for 30-60 minutes**

5. **If OK → increase to 100%**:
   ```bash
   kubectl apply -f k8s/production-deployment.yaml
   kubectl delete -f k8s/canary-deployment.yaml
   ```

---

## ⏪ ROLLBACK STEPS

### Immediate Rollback (Emergency)

1. **Identify previous image tag**:
   ```bash
   kubectl get deployment sti-chat -o jsonpath='{.spec.template.spec.containers[0].image}'
   ```

2. **Rollback to previous image**:
   ```bash
   kubectl rollout undo deployment/sti-chat
   # O especificar imagen anterior:
   kubectl set image deployment/sti-chat sti-chat=<previous-image-tag>
   ```

3. **Verify rollback**:
   ```bash
   kubectl rollout status deployment/sti-chat
   kubectl get pods -l app=sti-chat
   ```

4. **Route 100% traffic back to stable**:
   ```bash
   # Revertir routing a versión estable
   kubectl apply -f k8s/stable-virtualservice.yaml
   ```

5. **Page SRE and Dev Lead**:
   - Notificar en PagerDuty
   - Crear incident ticket
   - Documentar razón del rollback

### Rollback Criteria (Trigger Immediate Rollback)

- ❌ Error rate 5xx > 0.5% (sustained 5m)
- ❌ p95 latency > 2x baseline (sustained 5m)
- ❌ OpenAI circuit trips and functional degradation
- ❌ Disk usage > 90%
- ❌ Memory leak detected
- ❌ Critical security issue

---

## 📊 MONITORING COMMANDS

### Health Check

```bash
# Kubernetes pods status
kubectl get pods -l app=sti-chat

# Pod logs (last 100 lines)
kubectl logs -l app=sti-chat --tail=100

# Pod resource usage
kubectl top pods -l app=sti-chat

# Service endpoints
kubectl get endpoints sti-chat-service
```

### Application Health

```bash
# Health endpoint
curl -sS http://<host>/api/health | jq

# Metrics endpoint (si está implementado)
curl -sS http://<host>/api/metrics | jq
```

### Redis Connection

```bash
# Test Redis connection
redis-cli -h <redis-host> -p <redis-port> PING

# Check Redis keys
redis-cli -h <redis-host> -p <redis-port> KEYS "session:*" | wc -l
```

### Disk Usage

```bash
# Check disk usage on pods
kubectl exec -it <pod-name> -- df -h

# Check specific directories
kubectl exec -it <pod-name> -- du -sh /data/transcripts /data/tickets /data/uploads /data/logs
```

### Logs

```bash
# Application logs
kubectl logs -l app=sti-chat --tail=500 -f

# Filter errors
kubectl logs -l app=sti-chat | grep -i error | tail -50

# SSE logs endpoint (requiere LOG_TOKEN)
curl -sS "http://<host>/api/logs?token=<LOG_TOKEN>" | tail -100
```

---

## 🔧 HOW TO FORCE-DISABLE SMART_MODE

### Option 1: Environment Variable (Recommended)

1. **Update deployment**:
   ```bash
   kubectl set env deployment/sti-chat SMART_MODE_ENABLED=false
   ```

2. **Restart pods**:
   ```bash
   kubectl rollout restart deployment/sti-chat
   ```

3. **Verify**:
   ```bash
   kubectl get deployment sti-chat -o jsonpath='{.spec.template.spec.containers[0].env}' | jq
   ```

### Option 2: ConfigMap

1. **Create/update ConfigMap**:
   ```yaml
   apiVersion: v1
   kind: ConfigMap
   metadata:
     name: sti-chat-config
   data:
     SMART_MODE_ENABLED: "false"
   ```

2. **Apply**:
   ```bash
   kubectl apply -f configmap.yaml
   kubectl rollout restart deployment/sti-chat
   ```

### Option 3: Secret Manager (Production)

1. **Update secret in secret manager**:
   - Set `SMART_MODE_ENABLED=false`

2. **Restart deployment**:
   ```bash
   kubectl rollout restart deployment/sti-chat
   ```

### Verification

```bash
# Check logs for confirmation
kubectl logs -l app=sti-chat | grep -i "SMART_MODE"

# Test endpoint (should work without IA)
curl -sS -X POST "http://<host>/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","message":"hola"}' | jq
```

---

## 🗑️ HOW TO PURGE UPLOADS OLDER THAN X DAYS

### Manual Purge

1. **Connect to pod**:
   ```bash
   kubectl exec -it <pod-name> -- /bin/sh
   ```

2. **Find old files**:
   ```bash
   find /data/uploads -type f -mtime +30 -ls  # Files older than 30 days
   ```

3. **Delete old files**:
   ```bash
   find /data/uploads -type f -mtime +30 -delete
   ```

### Automated Purge (Cron Job)

1. **Create CronJob**:
   ```yaml
   apiVersion: batch/v1
   kind: CronJob
   metadata:
     name: purge-old-uploads
   spec:
     schedule: "0 2 * * *"  # Daily at 2 AM
     jobTemplate:
       spec:
         template:
           spec:
             containers:
             - name: purge
               image: busybox
               command:
               - /bin/sh
               - -c
               - find /data/uploads -type f -mtime +30 -delete
               volumeMounts:
               - name: uploads
                 mountPath: /data/uploads
             volumes:
             - name: uploads
               persistentVolumeClaim:
                 claimName: uploads-pvc
             restartPolicy: OnFailure
   ```

2. **Apply**:
   ```bash
   kubectl apply -f purge-cronjob.yaml
   ```

### Retention Policy

- **Uploads**: 30 days (configurable via env `UPLOAD_RETENTION_DAYS`)
- **Transcripts**: 48 hours (según política GDPR)
- **Tickets**: 90 days (según política de retención)
- **Logs**: 7 days (rotación diaria)

---

## 🎫 HOW TO CREATE TICKET MANUALLY

### If createTicket Fails

1. **Identify session**:
   ```bash
   # Get session from Redis or logs
   redis-cli -h <redis-host> GET "session:<sessionId>"
   ```

2. **Create ticket manually**:
   ```bash
   # Use admin endpoint (requires LOG_TOKEN)
   curl -sS -X POST "http://<host>/api/ticket/create-manual" \
     -H "Authorization: Bearer <LOG_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<sid>",
       "name": "<user-name>",
       "device": "<device>",
       "problem": "<problem-description>"
     }' | jq
   ```

### Alternative: Direct File Creation

1. **Get session transcript**:
   ```bash
   curl -sS "http://<host>/api/transcript-json/<sessionId>?token=<LOG_TOKEN>" | jq
   ```

2. **Create ticket files manually**:
   ```bash
   # Create ticket JSON
   cat > /data/tickets/<ticket-id>.json <<EOF
   {
     "id": "<ticket-id>",
     "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
     "sessionId": "<sid>",
     "transcript": [...]
   }
   EOF
   
   # Create ticket TXT
   cat > /data/tickets/<ticket-id>.txt <<EOF
   Ticket: <ticket-id>
   Session: <sid>
   Created: $(date)
   ...
   EOF
   ```

---

## 📞 CONTACT LIST

### On-Call Roster (0-48h Post-Deploy)

**Dev Lead**:
- Slack: @dev-lead
- PagerDuty: dev-lead@sti.com
- Phone: [CONFIGURAR]

**Backend Lead**:
- Slack: @backend-lead
- PagerDuty: backend-lead@sti.com
- Phone: [CONFIGURAR]

**SRE Lead**:
- Slack: @sre-lead
- PagerDuty: sre-lead@sti.com (Primary)
- Phone: [CONFIGURAR]

**QA Lead**:
- Slack: @qa-lead
- Email: qa-lead@sti.com
- Phone: [CONFIGURAR]

**Security Lead**:
- Slack: @sec-lead
- Email: sec-lead@sti.com
- Phone: [CONFIGURAR]

### Escalation Path

1. **Level 1**: On-call engineer (SRE/Dev)
2. **Level 2**: Team Lead (SRE Lead / Dev Lead)
3. **Level 3**: Engineering Manager
4. **Level 4**: CTO

### Communication Channels

- **Slack**: #sti-chat-production
- **PagerDuty**: STI Chat Production
- **Email**: sti-chat-alerts@sti.com

---

## ⚠️ ROLLBACK CRITERIA

### Immediate Rollback Triggers

1. **Error Rate**:
   - Error rate 5xx > 0.5% (sustained 5m)
   - Action: Immediate rollback + page SRE

2. **Latency**:
   - p95 latency > 2x baseline (sustained 5m)
   - Action: Immediate rollback + page SRE

3. **OpenAI Circuit**:
   - Circuit trips and functional degradation
   - Action: Disable SMART_MODE first, if persists → rollback

4. **Disk Usage**:
   - Disk free < 10% or inode usage > 90%
   - Action: Immediate rollback + cleanup + page SRE

5. **Memory Leak**:
   - Memory usage > 80% and growing
   - Action: Immediate rollback + page Dev Lead

6. **Security Issue**:
   - Critical security vulnerability detected
   - Action: Immediate rollback + page Security Lead

### Rollback Decision Matrix

| Metric | Threshold | Action | Who |
|--------|-----------|--------|-----|
| Error Rate 5xx | > 0.5% (5m) | Rollback | SRE |
| p95 Latency | > 2x baseline (5m) | Rollback | SRE |
| OpenAI Failures | > 5% (5m) | Disable SMART_MODE | Dev |
| Disk Free | < 10% | Rollback + Cleanup | SRE |
| Memory | > 80% growing | Rollback | Dev |
| Security | Critical | Rollback | Security |

---

## 🔍 TROUBLESHOOTING

### Common Issues

#### 1. Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Common causes:
# - Missing secrets in secret manager
# - LOG_TOKEN not set (production requirement)
# - Resource limits too low
```

#### 2. High Error Rate

```bash
# Check error logs
kubectl logs -l app=sti-chat | grep -i error | tail -100

# Check Redis connection
redis-cli -h <redis-host> PING

# Check disk space
kubectl exec <pod-name> -- df -h
```

#### 3. OpenAI Timeouts

```bash
# Check circuit breaker state
curl -sS "http://<host>/api/metrics" | jq '.openai.circuit_state'

# Disable SMART_MODE if needed
kubectl set env deployment/sti-chat SMART_MODE_ENABLED=false
```

#### 4. Disk Full

```bash
# Check disk usage
kubectl exec <pod-name> -- df -h

# Purge old files
kubectl exec <pod-name> -- find /data/uploads -type f -mtime +30 -delete
```

---

## 📝 APPENDIX

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | - | Must be "production" in prod |
| `LOG_TOKEN` | Yes (prod) | - | Token for logs endpoint |
| `OPENAI_API_KEY` | No | - | OpenAI API key |
| `SMART_MODE_ENABLED` | No | `true` | Enable/disable AI features |
| `REDIS_URL` | No | - | Redis connection string |
| `TRANSCRIPTS_DIR` | No | `/data/transcripts` | Transcripts directory |
| `TICKETS_DIR` | No | `/data/tickets` | Tickets directory |
| `UPLOADS_DIR` | No | `/data/uploads` | Uploads directory |
| `LOGS_DIR` | No | `/data/logs` | Logs directory |

### Useful Commands

```bash
# Restart deployment
kubectl rollout restart deployment/sti-chat

# Scale deployment
kubectl scale deployment sti-chat --replicas=3

# View deployment history
kubectl rollout history deployment/sti-chat

# Rollback to specific revision
kubectl rollout undo deployment/sti-chat --to-revision=<number>
```

---

**Última actualización**: 2025-12-07  
**Mantenido por**: Dev + SRE Teams
